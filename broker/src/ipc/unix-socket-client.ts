import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { BrokerTransport } from './transport';
import { BrokerRequest, BrokerResponse, BrokerError } from '../protocol';

export interface UnixSocketTransportOptions {
  socketPath?: string;
  timeoutMs?: number;
}

export class UnixSocketTransport implements BrokerTransport {
  private readonly socketPath: string;
  private readonly timeoutMs: number;

  constructor(options: UnixSocketTransportOptions = {}) {
    const defaultRuntimeDir =
      process.env.XDG_RUNTIME_DIR ||
      path.join(
        os.tmpdir(),
        `.nest-secret-broker-${process.getuid ? process.getuid() : 1000}`,
      );

    this.socketPath =
      options.socketPath || path.join(defaultRuntimeDir, 'broker.sock');
    this.timeoutMs = options.timeoutMs || 3000;
  }

  request(message: BrokerRequest): Promise<BrokerResponse> {
    if (!fs.existsSync(this.socketPath)) {
      return Promise.reject(
        new BrokerError(
          'BROKER_UNAVAILABLE',
          `Secret broker socket at ${this.socketPath} does not exist or broker is not running.`,
        ),
      );
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const socket = net.createConnection(this.socketPath);
      let buffer = '';

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          socket.destroy();
          reject(
            new BrokerError(
              'BROKER_UNAVAILABLE',
              'Secret broker request timed out',
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
              `Failed to connect to local secret broker socket: ${error.message}`,
            ),
          );
        }
      });
    });
  }
}
