import * as net from 'net';
import { BrokerTransport } from './transport';
import { BrokerRequest, BrokerResponse, BrokerError } from '../protocol';

export interface WindowsNamedPipeOptions {
  pipeName?: string;
  timeoutMs?: number;
}

export class WindowsNamedPipeTransport implements BrokerTransport {
  private readonly pipePath: string;
  private readonly timeoutMs: number;

  constructor(options: WindowsNamedPipeOptions = {}) {
    const pipeName = options.pipeName || 'nest-secret-broker';
    this.pipePath = `\\\\.\\pipe\\${pipeName}`;
    this.timeoutMs = options.timeoutMs || 3000;
  }

  public getPipePath(): string {
    return this.pipePath;
  }

  request(message: BrokerRequest): Promise<BrokerResponse> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const socket = net.createConnection(this.pipePath);
      let buffer = '';

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          socket.destroy();
          reject(
            new BrokerError(
              'BROKER_UNAVAILABLE',
              'Windows named pipe request timed out',
            ),
          );
        }
      }, this.timeoutMs);

      socket.on('connect', () => {
        const payload = JSON.stringify(message) + '\n';
        socket.write(payload);
      });

      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        if (buffer.includes('\n')) {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            const line = buffer.split('\n')[0].trim();

            try {
              const res = JSON.parse(line) as BrokerResponse;
              if (typeof res !== 'object' || res === null) {
                socket.destroy();
                reject(
                  new BrokerError(
                    'INVALID_REQUEST',
                    'Broker returned non-object JSON response',
                  ),
                );
                return;
              }
              socket.end();
              resolve(res);
            } catch {
              socket.destroy();
              reject(
                new BrokerError(
                  'INVALID_REQUEST',
                  'Failed to parse JSON response from secret broker',
                ),
              );
            }
          }
        }
      });

      socket.on('error', (err: unknown) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          const error = err as Error;
          reject(
            new BrokerError(
              'BROKER_UNAVAILABLE',
              `Failed to connect to Windows named pipe '${this.pipePath}': ${error.message}`,
            ),
          );
        }
      });
    });
  }
}
