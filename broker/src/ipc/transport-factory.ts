import * as os from 'os';
import { BrokerTransport } from './transport';
import { UnixSocketTransport } from './unix-socket-client';
import { WindowsNamedPipeTransport } from './windows-pipe-client';

export class TransportFactory {
  public static createTransport(
    options: {
      socketPath?: string;
      pipeName?: string;
      timeoutMs?: number;
    } = {},
  ): BrokerTransport {
    if (os.platform() === 'win32') {
      return new WindowsNamedPipeTransport(options);
    }
    return new UnixSocketTransport(options);
  }
}
