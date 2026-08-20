import { CredentialStore } from './credential-store';
import { BrokerError } from '../protocol';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class PlatformStore implements CredentialStore {
  private memoryStore = new Map<string, string>();
  private masterKey: Buffer;
  private storageFile: string;

  constructor(customStorageDir?: string) {
    const runtimeDir =
      customStorageDir ||
      process.env.XDG_RUNTIME_DIR ||
      path.join(
        os.tmpdir(),
        `.secret-broker-${process.getuid ? process.getuid() : 1000}`,
      );

    if (!fs.existsSync(runtimeDir)) {
      try {
        fs.mkdirSync(runtimeDir, { recursive: true, mode: 0o700 });
      } catch (err: unknown) {
        const error = err as Error;
        throw new BrokerError(
          'CREDENTIAL_STORE_ERROR',
          `Failed to create secure credential storage directory: ${error.message}`,
        );
      }
    }

    try {
      fs.chmodSync(runtimeDir, 0o700);
    } catch {
      // Ignore permission errors if not supported
    }

    this.storageFile = path.join(runtimeDir, 'vault.enc');

    const keyFile = path.join(runtimeDir, '.master.key');
    if (fs.existsSync(keyFile)) {
      try {
        this.masterKey = fs.readFileSync(keyFile);
      } catch {
        this.masterKey = crypto.randomBytes(32);
        fs.writeFileSync(keyFile, this.masterKey, { mode: 0o600 });
      }
    } else {
      this.masterKey = crypto.randomBytes(32);
      fs.writeFileSync(keyFile, this.masterKey, { mode: 0o600 });
    }

    this.loadFromDisk();
  }

  private loadFromDisk() {
    if (!fs.existsSync(this.storageFile)) {
      return;
    }

    try {
      const data = fs.readFileSync(this.storageFile);
      if (data.length < 28) return;
      const iv = data.subarray(0, 12);
      const tag = data.subarray(12, 28);
      const ciphertext = data.subarray(28);

      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        this.masterKey,
        iv,
      );
      decipher.setAuthTag(tag);

      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
      const json = JSON.parse(decrypted.toString('utf8')) as Record<
        string,
        string
      >;

      for (const [k, v] of Object.entries(json)) {
        this.memoryStore.set(k, v);
      }
    } catch {
      throw new BrokerError(
        'CREDENTIAL_STORE_ERROR',
        'Failed to decrypt OS credential store file',
      );
    }
  }

  private saveToDisk() {
    try {
      const obj: Record<string, string> = {};
      for (const [k, v] of this.memoryStore.entries()) {
        obj[k] = v;
      }
      const plaintext = Buffer.from(JSON.stringify(obj), 'utf8');
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv);

      const ciphertext = Buffer.concat([
        cipher.update(plaintext),
        cipher.final(),
      ]);
      const tag = cipher.getAuthTag();

      const combined = Buffer.concat([iv, tag, ciphertext]);
      fs.writeFileSync(this.storageFile, combined, { mode: 0o600 });
    } catch (err: unknown) {
      const error = err as Error;
      throw new BrokerError(
        'CREDENTIAL_STORE_ERROR',
        `Failed to write to encrypted credential store: ${error.message}`,
      );
    }
  }

  get(name: string): Promise<string | null> {
    return Promise.resolve(this.memoryStore.get(name) || null);
  }

  set(name: string, value: string): Promise<void> {
    this.memoryStore.set(name, value);
    this.saveToDisk();
    return Promise.resolve();
  }

  delete(name: string): Promise<void> {
    this.memoryStore.delete(name);
    this.saveToDisk();
    return Promise.resolve();
  }
}
