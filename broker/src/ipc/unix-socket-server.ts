import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
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

export interface UnixSocketServerOptions {
  socketPath?: string;
  policyEngine?: PolicyEngine;
  credentialStore?: CredentialStore;
}

export class UnixSocketServer {
  private server: net.Server | null = null;
  private readonly socketPath: string;
  private readonly policyEngine: PolicyEngine;
  private readonly credentialStore: CredentialStore;

  constructor(options: UnixSocketServerOptions = {}) {
    const defaultRuntimeDir =
      process.env.XDG_RUNTIME_DIR ||
      path.join(
        os.tmpdir(),
        `.nest-secret-broker-${process.getuid ? process.getuid() : 1000}`,
      );

    if (!fs.existsSync(defaultRuntimeDir)) {
      fs.mkdirSync(defaultRuntimeDir, { recursive: true, mode: 0o700 });
    }

    this.socketPath =
      options.socketPath || path.join(defaultRuntimeDir, 'broker.sock');
    this.policyEngine = options.policyEngine || new PolicyEngine();
    this.credentialStore = options.credentialStore!;
  }

  public getSocketPath(): string {
    return this.socketPath;
  }

  public start(): Promise<void> {
    if (fs.existsSync(this.socketPath)) {
      try {
        fs.unlinkSync(this.socketPath);
      } catch (err: unknown) {
        const error = err as Error;
        return Promise.reject(
          new Error(
            `Failed to remove stale socket at ${this.socketPath}: ${error.message}`,
          ),
        );
      }
    }

    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.handleConnection(socket);
      });

      this.server.on('error', (err) => {
        reject(err);
      });

      this.server.listen(this.socketPath, () => {
        try {
          fs.chmodSync(this.socketPath, 0o600);
          resolve();
        } catch (err: unknown) {
          const error = err as Error;
          void this.stop();
          reject(
            new Error(
              `Failed to set restrictive permissions (0600) on socket file: ${error.message}`,
            ),
          );
        }
      });
    });
  }

  private handleConnection(socket: net.Socket): void {
    let buffer = '';
    let bytesRead = 0;

    const identity: ClientIdentity = {
      uid: process.getuid ? process.getuid() : 1000,
      gid: process.getgid ? process.getgid() : 1000,
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
      this.auditLog('ACCESS_DENIED', identity, request.secret);
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
          this.auditLog('SECRET_NOT_FOUND', identity, request.secret);
          this.sendErrorResponse(
            socket,
            'SECRET_NOT_FOUND',
            `Secret '${request.secret}' not found`,
          );
          return;
        }
        this.auditLog('GET_SUCCESS', identity, request.secret);
        this.sendResponse(socket, {
          version: CURRENT_PROTOCOL_VERSION,
          success: true,
          value: val,
        });
      } else if (request.operation === 'set') {
        await this.credentialStore.set(request.secret, request.value!);
        this.auditLog('SET_SUCCESS', identity, request.secret);
        this.sendResponse(socket, {
          version: CURRENT_PROTOCOL_VERSION,
          success: true,
        });
      } else if (request.operation === 'delete') {
        await this.credentialStore.delete(request.secret);
        this.auditLog('DELETE_SUCCESS', identity, request.secret);
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

  private auditLog(
    action: string,
    identity: ClientIdentity,
    secretName: string,
  ): void {
    const auditRecord = {
      timestamp: new Date().toISOString(),
      action,
      uid: identity.uid,
      secret: secretName,
    };
    process.stdout.write(`[AUDIT] ${JSON.stringify(auditRecord)}\n`);
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.cleanupSocket();
          resolve();
        });
      } else {
        this.cleanupSocket();
        resolve();
      }
    });
  }

  private cleanupSocket(): void {
    if (fs.existsSync(this.socketPath)) {
      try {
        fs.unlinkSync(this.socketPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
