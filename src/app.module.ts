import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SecretsModule } from './secrets/secrets.module';
import { DemoModule } from './demo/demo.module';

@Module({
  imports: [SecretsModule, DemoModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
