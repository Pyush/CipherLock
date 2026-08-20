import { Module, Global } from '@nestjs/common';
import { SecretsService } from './secrets.service';
import { BrokerSecretProvider } from './providers/broker-secret.provider';

@Global()
@Module({
  providers: [
    {
      provide: 'SECRET_PROVIDER',
      useClass: BrokerSecretProvider,
    },
    SecretsService,
  ],
  exports: [SecretsService, 'SECRET_PROVIDER'],
})
export class SecretsModule {}
