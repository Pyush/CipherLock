import * as net from 'net';
import {
  BrokerRequest,
  BrokerResponse,
  BrokerError,
  BrokerErrorCode,
  validateBrokerRequest,
  MAX_REQUEST_SIZE_BYTES,
  CURRENT_PROTOCOL_VERSION,
} from '../protocol';
import { PolicyEngine, ClientIdentity } from '../policy';
import { CredentialStore } from '../credentials/credential-store';

export interface WindowsPipeServerOptions {
  pipeName?: string;
  policyEngine?: PolicyEngine;
  credentialStore?: CredentialStore;
}

export class WindowsPipeServer {
  private server: net.Server | null = null;
  private readonly pipePath: string;
  private readonly policyEngine: PolicyEngine;
  private readonly credentialStore: CredentialStore;

  constructor(options: WindowsPipeServerOptions = {}) {
    const pipeName = options.pipeName || 'nest-secret-broker';
    this.pipePath = `\\\\.\\pipe\\${pipeName}`;
    this.policyEngine = options.policyEngine || new PolicyEngine();
    this.credentialStore = options.credentialStore!;
  }

  public getPipePath(): string {
    return this.pipePath;
  }

  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.handleConnection(socket);
      });

      this.server.on('error', (err) => {
        reject(err);
      });

      this.server.listen(this.pipePath, () => {
        resolve();
      });
    });
  }

  private handleConnection(socket: net.Socket): void {
    let buffer = '';
    let bytesRead = 0;

    const identity: ClientIdentity = {
      uid: 1000,
      gid: 1000,
      role: 'sample-nest-app',
    };

    socket.on('data', (chunk) => {
      bytesRead += chunk.length;

      if (bytesRead > MAX_REQUEST_SIZE_BYTES) {
        this.sendErrorResponse(
          socket,
          'REQUEST_TOO_LARGE',
          'Payload size exceeds maximum allowed size',
        );
        socket.destroy();
        return;
      }

      buffer += chunk.toString('utf8');

      if (buffer.includes('\n')) {
        const lines = buffer.split('\n');
        const line = lines.shift()?.trim();
        buffer = lines.join('\n');

        if (line) {
          void this.processMessage(socket, line, identity);
        }
      }
    });

    socket.on('error', () => {
      socket.destroy();
    });
  }

  private async processMessage(
    socket: net.Socket,
    rawMessage: string,
    identity: ClientIdentity,
  ): Promise<void> {
    let request: BrokerRequest;

    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawMessage);
      } catch {
        throw new BrokerError('INVALID_REQUEST', 'Malformed JSON payload');
      }

      request = validateBrokerRequest(parsed);
    } catch (err: unknown) {
      if (err instanceof BrokerError) {
        this.sendErrorResponse(socket, err.code, err.message);
      } else {
        this.sendErrorResponse(
          socket,
          'INVALID_REQUEST',
          'Failed to process request',
        );
      }
      return;
    }

    if (!this.policyEngine.isAllowed(identity, request.secret)) {
      this.sendErrorResponse(
        socket,
        'ACCESS_DENIED',
        `Access to secret '${request.secret}' is denied`,
      );
      return;
    }

    try {
      if (request.operation === 'get') {
        const val = await this.credentialStore.get(request.secret);
        if (val === null) {
          this.sendErrorResponse(
            socket,
            'SECRET_NOT_FOUND',
            `Secret '${request.secret}' not found`,
          );
          return;
        }
        this.sendResponse(socket, {
          version: CURRENT_PROTOCOL_VERSION,
          success: true,
          value: val,
        });
      } else if (request.operation === 'set') {
        await this.credentialStore.set(request.secret, request.value!);
        this.sendResponse(socket, {
          version: CURRENT_PROTOCOL_VERSION,
          success: true,
        });
      } else if (request.operation === 'delete') {
        await this.credentialStore.delete(request.secret);
        this.sendResponse(socket, {
          version: CURRENT_PROTOCOL_VERSION,
          success: true,
        });
      }
    } catch (err: unknown) {
      const error = err as { code?: BrokerErrorCode; message?: string };
      this.sendErrorResponse(
        socket,
        error.code || 'CREDENTIAL_STORE_ERROR',
        error.message || 'Error communicating with credential store',
      );
    }
  }

  private sendResponse(socket: net.Socket, response: BrokerResponse): void {
    if (!socket.writable) return;
    socket.write(JSON.stringify(response) + '\n', () => {
      socket.end();
    });
  }

  private sendErrorResponse(
    socket: net.Socket,
    code: BrokerErrorCode,
    message: string,
  ): void {
    this.sendResponse(socket, {
      version: CURRENT_PROTOCOL_VERSION,
      success: false,
      error: code,
      message: message,
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
