import { Tpm2Provider } from '../../broker/src/security/tpm-provider';
import { SecureEnclaveProvider } from '../../broker/src/security/secure-enclave-provider';
import { HardwareSecurityFactory } from '../../broker/src/security/hardware-factory';
import { HardwareBoundStore } from '../../broker/src/credentials/hardware-bound-store';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Phase 3: Hardware Security Module (TPM 2.0 / Secure Enclave) Binding', () => {
  describe('TPM 2.0 & Secure Enclave Key Sealing', () => {
    it('Tpm2Provider should seal and unseal key payload', async () => {
      const tpm = new Tpm2Provider();
      const rawKey = Buffer.from('super-secret-master-key-32-bytes');

      const sealed = await tpm.sealKey(rawKey);
      expect(sealed).toBeDefined();
      expect(sealed.length).toBeGreaterThan(rawKey.length);

      const unsealed = await tpm.unsealKey(sealed);
      expect(unsealed.toString('utf8')).toBe(
        'super-secret-master-key-32-bytes',
      );
    });

    it('SecureEnclaveProvider should seal and unseal key payload', async () => {
      const enclave = new SecureEnclaveProvider();
      const rawKey = Buffer.from('apple-secure-enclave-master-key');

      const sealed = await enclave.sealKey(rawKey);
      const unsealed = await enclave.unsealKey(sealed);
      expect(unsealed.toString('utf8')).toBe('apple-secure-enclave-master-key');
    });

    it('HardwareSecurityFactory should return hardware security provider for current platform', () => {
      const provider = HardwareSecurityFactory.createHardwareProvider();
      expect(provider.isHardwareAvailable()).toBe(true);
    });
  });

  describe('HardwareBoundStore End-to-End Key Storage', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hsm-test-'));
    });

    afterEach(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup failure in temp test directories
      }
    });

    it('should store and retrieve secrets sealed with hardware security module', async () => {
      const store = new HardwareBoundStore(tmpDir);
      await store.set('DATABASE_PASSWORD', 'hsm-hardware-protected-secret');

      const retrieved = await store.get('DATABASE_PASSWORD');
      expect(retrieved).toBe('hsm-hardware-protected-secret');
    });

    it('HardwareBoundStore should support setMany and deleteMany', async () => {
      const store = new HardwareBoundStore(tmpDir);
      await store.setMany({
        KEY1: 'VAL1',
        KEY2: 'VAL2',
      });

      expect(await store.get('KEY1')).toBe('VAL1');
      expect(await store.get('KEY2')).toBe('VAL2');

      await store.deleteMany(['KEY1', 'KEY2']);
      expect(await store.get('KEY1')).toBeNull();
      expect(await store.get('KEY2')).toBeNull();
    });

    it('should fail fast if hardware key blob is tampered with', async () => {
      const store = new HardwareBoundStore(tmpDir);
      await store.set('JWT_SECRET', 'test-secret');

      // Tamper sealed master key file
      const sealedKeyPath = path.join(tmpDir, 'hsm_master.sealed');
      const corruptedData = Buffer.from(fs.readFileSync(sealedKeyPath));
      corruptedData[corruptedData.length - 1] ^= 0xff; // Flip bits
      fs.writeFileSync(sealedKeyPath, corruptedData);

      const corruptedStore = new HardwareBoundStore(tmpDir);
      await expect(corruptedStore.get('JWT_SECRET')).rejects.toThrow();
    });
  });
});
