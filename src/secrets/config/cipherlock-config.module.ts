import { Module, DynamicModule } from '@nestjs/common';
import { SecretsModule } from '../secrets.module';
import { CipherlockConfigService } from './cipherlock-config.service';

export interface CipherlockConfigOptions {
  isGlobal?: boolean;
}

/**
 * Strategy 3: Built-in CipherlockConfigModule Dynamic Module.
 * Wraps SecretsModule and exports CipherlockConfigService in a 1-line NestJS import.
 */
@Module({})
export class CipherlockConfigModule {
  static forRoot(
    options: CipherlockConfigOptions = { isGlobal: true },
  ): DynamicModule {
    return {
      module: CipherlockConfigModule,
      global: options.isGlobal ?? true,
      imports: [SecretsModule],
      providers: [CipherlockConfigService],
      exports: [SecretsModule, CipherlockConfigService],
    };
  }
}
