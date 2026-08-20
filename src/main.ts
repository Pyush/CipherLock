import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SecretsService } from './secrets/secrets.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 1. Resolve SecretsService instance from NestJS Application Context
  const secretsService = app.get(SecretsService);

  // 2. Safely retrieve PORT and HOST over local IPC socket
  const port = Number.parseInt(
    (await secretsService.get('PORT')) ?? '3000',
    10,
  );
  const host = (await secretsService.get('HOST')) ?? 'localhost';

  // 3. Start server on retrieved host and port without process.env leaks
  await app.listen(port, host);
  console.log(`[APP] Application listening on http://${host}:${port}`);
}
void bootstrap();
