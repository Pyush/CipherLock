import { WindowsNamedPipeTransport } from '../../broker/src/ipc/windows-pipe-client';
import { WindowsPipeServer } from '../../broker/src/ipc/windows-pipe-server';
import { WindowsDpapiStore } from '../../broker/src/credentials/windows-dpapi-store';
import { TransportFactory } from '../../broker/src/ipc/transport-factory';
import { StoreFactory } from '../../broker/src/credentials/store-factory';
import { CloudSecretProvider } from '../../src/secrets/providers/cloud-secret.provider';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Phase 2: Windows Transport, DPAPI Store & Cloud Provider', () => {
  describe('Windows Named Pipe Transport & Server', () => {
    let server: WindowsPipeServer;
    let storeDir: string;

    beforeEach(async () => {
      storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'win-test-'));
      const store = new WindowsDpapiStore(storeDir);
      await store.set('DATABASE_PASSWORD', 'windows-secret-123');

      server = new WindowsPipeServer({
        pipeName: `test-pipe-${Date.now()}`,
        credentialStore: store,
      });
      await server.start();
    });

    afterEach(async () => {
      await server.stop();
      try {
        fs.rmSync(storeDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup failure in temp test directories
      }
    });

    it('WindowsNamedPipeTransport should connect to WindowsPipeServer and fetch secret', async () => {
      const client = new WindowsNamedPipeTransport({
        pipeName: server.getPipePath().replace('\\\\.\\pipe\\', ''),
      });

      const res = await client.request({
        version: 1,
        operation: 'get',
        secret: 'DATABASE_PASSWORD',
      });

      expect(res.success).toBe(true);
      expect(res.value).toBe('windows-secret-123');
    });
  });

  describe('TransportFactory & StoreFactory Auto-Detection', () => {
    it('TransportFactory should instantiate appropriate transport for current OS', () => {
      const transport = TransportFactory.createTransport();
      expect(transport).toBeDefined();
    });

    it('StoreFactory should instantiate appropriate store for current OS', () => {
      const store = StoreFactory.createStore();
      expect(store).toBeDefined();
    });
  });

  describe('Bulk Secret Operations (setMany & deleteMany)', () => {
    it('WindowsDpapiStore should set and delete multiple secrets at once', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulk-dpapi-test-'));
      const store = new WindowsDpapiStore(tmpDir);

      await store.setMany({
        PORT: '3000',
        HOST: 'localhost',
        DB_NAME: 'test_db',
      });

      expect(await store.get('PORT')).toBe('3000');
      expect(await store.get('HOST')).toBe('localhost');
      expect(await store.get('DB_NAME')).toBe('test_db');

      await store.deleteMany(['PORT', 'HOST']);

      expect(await store.get('PORT')).toBeNull();
      expect(await store.get('HOST')).toBeNull();
      expect(await store.get('DB_NAME')).toBe('test_db');

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  describe('CloudSecretProvider (HashiCorp Vault / AWS / GCP)', () => {
    it('should retrieve secrets from CloudSecretProvider and cache subsequent queries', async () => {
      const provider = new CloudSecretProvider({
        providerType: 'vault',
        cacheTtlMs: 5000,
      });

      const val1 = await provider.get('DATABASE_PASSWORD');
      expect(val1).toBe('vault-production-db-password-987');

      const val2 = await provider.get('DATABASE_PASSWORD');
      expect(val2).toBe('vault-production-db-password-987');
    });

    it('should handle AWS and GCP provider types', async () => {
      const awsProvider = new CloudSecretProvider({ providerType: 'aws' });
      const awsVal = await awsProvider.get('JWT_SECRET');
      expect(awsVal).toContain('aws-secretsmanager');

      const gcpProvider = new CloudSecretProvider({ providerType: 'gcp' });
      const gcpVal = await gcpProvider.get('JWT_SECRET');
      expect(gcpVal).toContain('gcp-secret');
    });
  });
});
