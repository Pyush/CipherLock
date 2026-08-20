import { PlatformStore } from './credentials/platform-store';
import { PolicyEngine } from './policy';
import { UnixSocketServer } from './ipc/unix-socket-server';

export class SecretBrokerServer {
  private server: UnixSocketServer;

  constructor(socketPath?: string, policyEngine?: PolicyEngine) {
    const store = new PlatformStore();
    const policy = policyEngine || new PolicyEngine();
    this.server = new UnixSocketServer({
      socketPath,
      credentialStore: store,
      policyEngine: policy,
    });
  }

  async start(): Promise<void> {
    await this.server.start();
    console.log(
      `Secret Broker started on Unix Socket: ${this.server.getSocketPath()}`,
    );
  }

  async stop(): Promise<void> {
    await this.server.stop();
  }
}
