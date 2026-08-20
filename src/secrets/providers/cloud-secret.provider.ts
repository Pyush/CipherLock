import { Injectable } from '@nestjs/common';
import { SecretProvider } from '../secret-provider';

export type CloudProviderType = 'vault' | 'aws' | 'gcp';

export interface CloudSecretProviderConfig {
  providerType: CloudProviderType;
  endpoint?: string;
  vaultToken?: string;
  cacheTtlMs?: number;
}

@Injectable()
export class CloudSecretProvider implements SecretProvider {
  private readonly config: CloudSecretProviderConfig;
  private readonly secretCache = new Map<
    string,
    { value: string; expiresAt: number }
  >();
  private readonly cacheTtlMs: number;

  constructor(config?: CloudSecretProviderConfig) {
    const defaultProvider: CloudProviderType =
      (process.env.CLOUD_SECRET_PROVIDER as CloudProviderType) || 'vault';
    this.config = config || {
      providerType: defaultProvider,
      endpoint: process.env.VAULT_ADDR || 'http://127.0.0.1:8200',
      vaultToken: process.env.VAULT_TOKEN,
    };
    this.cacheTtlMs = this.config.cacheTtlMs || 60000; // 60s cache TTL
  }

  async get(name: string): Promise<string> {
    // Check in-memory TTL cache to prevent excessive network calls to Cloud Secret Manager
    const cached = this.secretCache.get(name);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    let secretValue: string;

    switch (this.config.providerType) {
      case 'vault':
        secretValue = await this.fetchFromVault(name);
        break;
      case 'aws':
        secretValue = await this.fetchFromAwsSecretsManager(name);
        break;
      case 'gcp':
        secretValue = await this.fetchFromGcpSecretManager(name);
        break;
      default:
        throw new Error(
          `Unsupported Cloud Secret Provider type: ${String(this.config.providerType)}`,
        );
    }

    this.secretCache.set(name, {
      value: secretValue,
      expiresAt: Date.now() + this.cacheTtlMs,
    });

    return secretValue;
  }

  private fetchFromVault(name: string): Promise<string> {
    // Simulated HashiCorp Vault REST API integration (v1/secret/data/<name>)
    if (name === 'DATABASE_PASSWORD') {
      return Promise.resolve('vault-production-db-password-987');
    }
    return Promise.resolve(`vault-secret-value-for-${name}`);
  }

  private fetchFromAwsSecretsManager(name: string): Promise<string> {
    // Simulated AWS SecretsManager SDK query (`GetSecretValueCommand`)
    return Promise.resolve(`aws-secretsmanager-val-${name}`);
  }

  private fetchFromGcpSecretManager(name: string): Promise<string> {
    // Simulated GCP SecretManager Client query (`accessSecretVersion`)
    return Promise.resolve(`gcp-secret-val-${name}`);
  }
}
