import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { UnixSocketServer } from '../../broker/src/ipc/unix-socket-server';
import { PlatformStore } from '../../broker/src/credentials/platform-store';

describe('Socket Security & Permissions', () => {
  let server: UnixSocketServer;
  let testSocketPath: string;

  beforeEach(() => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'broker-test-'));
    testSocketPath = path.join(tmpDir, 'test-broker.sock');
    const store = new PlatformStore(tmpDir);
    server = new UnixSocketServer({
      socketPath: testSocketPath,
      credentialStore: store,
    });
  });

  afterEach(async () => {
    await server.stop();
  });

  it('Unix domain socket file must have restrictive permissions (0600)', async () => {
    await server.start();
    expect(fs.existsSync(testSocketPath)).toBe(true);

    const stats = fs.statSync(testSocketPath);
    // Mask off file type bits to get file mode
    const mode = stats.mode & 0o777;
    // Mode should be 0600 (read/write for owner only, zero permissions for group/others)
    expect(mode).toBe(0o600);
  });
});
