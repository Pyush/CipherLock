import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SecretsService } from './secrets/secrets.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 1. Resolve SecretsService instance from NestJS Application Context
  const secretsService = app.get(SecretsService);

  // 2. Safely retrieve PORT and HOST over local IPC socket
  let port = 3000;
  let host = 'localhost';

  try {
    const rawPort = await secretsService.get('PORT');
    if (rawPort) {
      port = parseInt(rawPort, 10);
    }
  } catch {
    // Fallback to default port if not set in secret store
  }

  try {
    const rawHost = await secretsService.get('HOST');
    if (rawHost) {
      host = rawHost;
    }
  } catch {
    // Fallback to default host if not set in secret store
  }

  // 3. Start server on retrieved host and port without process.env leaks
  await app.listen(port, host);
  console.log(`[APP] Application listening on http://${host}:${port}`);
}
void bootstrap();
