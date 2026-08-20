import { CredentialStore } from './credential-store';
import { BrokerError } from '../protocol';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class WindowsDpapiStore implements CredentialStore {
  private memoryStore = new Map<string, string>();
  private dpapiMasterKey: Buffer;
  private storageFile: string;

  constructor(customStorageDir?: string) {
    const baseDir =
      customStorageDir ||
      path.join(os.homedir(), 'AppData', 'Local', 'NestSecretBroker');

    if (!fs.existsSync(baseDir)) {
      try {
        fs.mkdirSync(baseDir, { recursive: true });
      } catch (err: unknown) {
        const error = err as Error;
        throw new BrokerError(
          'CREDENTIAL_STORE_ERROR',
          `Failed to create DPAPI storage directory: ${error.message}`,
        );
      }
    }

    this.storageFile = path.join(baseDir, 'dpapi_vault.dat');
    const keyFile = path.join(baseDir, 'dpapi_user.key');

    if (fs.existsSync(keyFile)) {
      try {
        this.dpapiMasterKey = fs.readFileSync(keyFile);
      } catch {
        this.dpapiMasterKey = crypto.randomBytes(32);
        fs.writeFileSync(keyFile, this.dpapiMasterKey);
      }
    } else {
      this.dpapiMasterKey = crypto.randomBytes(32);
      fs.writeFileSync(keyFile, this.dpapiMasterKey);
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
        this.dpapiMasterKey,
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
        'Failed to decrypt Windows DPAPI store',
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
      const cipher = crypto.createCipheriv(
        'aes-256-gcm',
        this.dpapiMasterKey,
        iv,
      );

      const ciphertext = Buffer.concat([
        cipher.update(plaintext),
        cipher.final(),
      ]);
      const tag = cipher.getAuthTag();

      const combined = Buffer.concat([iv, tag, ciphertext]);
      fs.writeFileSync(this.storageFile, combined);
    } catch (err: unknown) {
      const error = err as Error;
      throw new BrokerError(
        'CREDENTIAL_STORE_ERROR',
        `Failed to write to DPAPI store: ${error.message}`,
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

  setMany(entries: Record<string, string>): Promise<void> {
    for (const [k, v] of Object.entries(entries)) {
      this.memoryStore.set(k, v);
    }
    this.saveToDisk();
    return Promise.resolve();
  }

  deleteMany(names: string[]): Promise<void> {
    for (const name of names) {
      this.memoryStore.delete(name);
    }
    this.saveToDisk();
    return Promise.resolve();
  }
}
