import { Injectable } from '@nestjs/common';
import { SecretsService } from '../secrets.service';

/**
 * Strategy 2: Custom CipherlockConfigService extending NestJS ConfigService concept.
 * Delegates get(key) lookups on-demand directly to SecretsService over local IPC.
 */
@Injectable()
export class CipherlockConfigService {
  constructor(private readonly secretsService: SecretsService) {}

  /**
   * Retrieves a secret key on-demand over local IPC socket.
   */
  async get<T = string>(key: string, defaultValue?: T): Promise<T | undefined> {
    const val = await this.secretsService.get(key);
    if (val === null || val === undefined) {
      return defaultValue;
    }

    try {
      return JSON.parse(val) as T;
    } catch {
      return val as unknown as T;
    }
  }

  /**
   * Synchronous fallback check (returns defaultValue or undefined).
   */
  getSync<T = string>(_key: string, defaultValue?: T): T | undefined {
    return defaultValue;
  }
}
