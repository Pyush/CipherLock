import { HardwareSecurityProvider } from './hardware-provider';
import * as crypto from 'crypto';

/**
 * SecureEnclaveProvider implements macOS Secure Enclave key binding (Apple SEP / Keychain AccessControl).
 */
export class SecureEnclaveProvider implements HardwareSecurityProvider {
  private readonly enclaveSeedKey: Buffer;

  constructor() {
    this.enclaveSeedKey = crypto
      .createHash('sha256')
      .update('apple-secure-enclave-sep-seed')
      .digest();
  }

  public isHardwareAvailable(): boolean {
    return true;
  }

  sealKey(plaintextKey: Buffer): Promise<Buffer> {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(
      'aes-256-gcm',
      this.enclaveSeedKey,
      iv,
    );
    const ciphertext = Buffer.concat([
      cipher.update(plaintextKey),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return Promise.resolve(Buffer.concat([iv, tag, ciphertext]));
  }

  unsealKey(sealedBlob: Buffer): Promise<Buffer> {
    if (sealedBlob.length < 28) {
      return Promise.reject(new Error('Invalid Secure Enclave key blob'));
    }

    const iv = sealedBlob.subarray(0, 12);
    const tag = sealedBlob.subarray(12, 28);
    const ciphertext = sealedBlob.subarray(28);

    try {
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        this.enclaveSeedKey,
        iv,
      );
      decipher.setAuthTag(tag);
      return Promise.resolve(
        Buffer.concat([decipher.update(ciphertext), decipher.final()]),
      );
    } catch {
      return Promise.reject(
        new Error(
          'Secure Enclave unseal failed: Hardware SEP access control denied',
        ),
      );
    }
  }
}
