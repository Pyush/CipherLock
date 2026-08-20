import { Injectable, Inject } from '@nestjs/common';
import type { SecretProvider } from './secret-provider';

@Injectable()
export class SecretsService {
  constructor(
    @Inject('SECRET_PROVIDER')
    private readonly provider: SecretProvider,
  ) {}

  async get(name: string): Promise<string> {
    return this.provider.get(name);
  }
}
