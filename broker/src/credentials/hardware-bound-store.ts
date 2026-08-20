import { CredentialStore } from './credential-store';
import { HardwareSecurityProvider } from '../security/hardware-provider';
import { HardwareSecurityFactory } from '../security/hardware-factory';
import { BrokerError } from '../protocol';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class HardwareBoundStore implements CredentialStore {
  private memoryStore = new Map<string, string>();
  private readonly hardwareProvider: HardwareSecurityProvider;
  private readonly storageFile: string;
  private readonly sealedKeyFile: string;

  constructor(
    customStorageDir?: string,
    hardwareProvider?: HardwareSecurityProvider,
  ) {
    this.hardwareProvider =
      hardwareProvider || HardwareSecurityFactory.createHardwareProvider();

    const baseDir =
      customStorageDir || path.join(os.homedir(), '.nest-secret-broker-hsm');
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true, mode: 0o700 });
    }

    this.storageFile = path.join(baseDir, 'hsm_vault.enc');
    this.sealedKeyFile = path.join(baseDir, 'hsm_master.sealed');
  }

  private async getUnsealedMasterKey(): Promise<Buffer> {
    if (fs.existsSync(this.sealedKeyFile)) {
      const sealedBlob = fs.readFileSync(this.sealedKeyFile);
      return await this.hardwareProvider.unsealKey(sealedBlob);
    } else {
      const rawMasterKey = crypto.randomBytes(32);
      const sealedBlob = await this.hardwareProvider.sealKey(rawMasterKey);
      fs.writeFileSync(this.sealedKeyFile, sealedBlob, { mode: 0o600 });
      return rawMasterKey;
    }
  }

  private async loadFromDisk() {
    if (!fs.existsSync(this.storageFile)) return;

    try {
      const masterKey = await this.getUnsealedMasterKey();
      const data = fs.readFileSync(this.storageFile);
      if (data.length < 28) return;

      const iv = data.subarray(0, 12);
      const tag = data.subarray(12, 28);
      const ciphertext = data.subarray(28);

      const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
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
    } catch (err: unknown) {
      const error = err as Error;
      throw new BrokerError(
        'CREDENTIAL_STORE_ERROR',
        `Hardware unseal/decrypt failed: ${error.message}`,
      );
    }
  }

  private async saveToDisk() {
    try {
      const masterKey = await this.getUnsealedMasterKey();
      const obj: Record<string, string> = {};
      for (const [k, v] of this.memoryStore.entries()) {
        obj[k] = v;
      }

      const plaintext = Buffer.from(JSON.stringify(obj), 'utf8');
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);

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
        `Failed to write to hardware bound store: ${error.message}`,
      );
    }
  }

  async get(name: string): Promise<string | null> {
    await this.loadFromDisk();
    return this.memoryStore.get(name) || null;
  }

  async set(name: string, value: string): Promise<void> {
    await this.loadFromDisk();
    this.memoryStore.set(name, value);
    await this.saveToDisk();
  }

  async delete(name: string): Promise<void> {
    await this.loadFromDisk();
    this.memoryStore.delete(name);
    await this.saveToDisk();
  }

  async setMany(entries: Record<string, string>): Promise<void> {
    await this.loadFromDisk();
    for (const [k, v] of Object.entries(entries)) {
      this.memoryStore.set(k, v);
    }
    await this.saveToDisk();
  }

  async deleteMany(names: string[]): Promise<void> {
    await this.loadFromDisk();
    for (const name of names) {
      this.memoryStore.delete(name);
    }
    await this.saveToDisk();
  }
}
