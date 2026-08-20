# @pyush/cipherlock

🔒 **Secure Local Secret-Management Architecture for NestJS**

`@pyush/cipherlock` is an enterprise-grade secret management library for NestJS applications. It completely eliminates sensitive plaintext `.env` files and `process.env` leaks by serving secrets on-demand over OS-authenticated local IPC channels (Unix Domain Sockets & Windows Named Pipes) with hardware-backed encryption (TPM 2.0 & Apple Secure Enclave).

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/@pyush/cipherlock.svg)](https://www.npmjs.com/package/@pyush/cipherlock)

---

## Key Features

- 🛡️ **Zero `.env` Usage**: Eliminates `.env` files and static secret text on disk.
- 🔒 **Zero `process.env` Leaks**: Secrets are never loaded into process environment variables.
- 🔑 **Hardware Key Binding**: Vault keys are sealed using physical **TPM 2.0** (Linux/Windows) or **Apple Secure Enclave** (macOS).
- 🚀 **Cross-Platform IPC**: Automatic platform detection (`UnixSocketTransport` on Linux/macOS, `WindowsNamedPipeTransport` on Windows).
- ⚡ **Cloud Provider Integration**: Built-in support for **HashiCorp Vault**, **AWS Secrets Manager**, and **GCP Secret Manager** with in-memory TTL caching.
- 🛡️ **Kernel Peer Authentication**: Authenticates callers at the OS kernel level (`SO_PEERCRED` / `/proc/<pid>/exe`), ignoring untrusted JSON headers.

---

## Installation

```bash
npm install @pyush/cipherlock
```

---

## Quick Start Guide

### 1. Store a Secret in Local Credential Store
```bash
npx @pyush/cipherlock secrets:set -- DATABASE_PASSWORD "my-super-secret-password"
```

### 2. Start Local Secret Broker Daemon
```bash
npx @pyush/cipherlock broker:start
```

### 3. Register Module in NestJS (`app.module.ts`)
```typescript
import { Module } from '@nestjs/common';
import { SecretsModule } from '@pyush/cipherlock';

@Module({
  imports: [SecretsModule],
})
export class AppModule {}
```

### 4. Consume Secrets in Application Entrypoint (`src/main.ts`)
```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SecretsService } from '@pyush/cipherlock';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 1. Resolve SecretsService instance from NestJS Application Context
  const secretsService = app.get(SecretsService);

  // 2. Retrieve PORT and HOST directly over local IPC without try/catch
  const port = Number.parseInt(
    (await secretsService.get('PORT')) ?? '3000',
    10,
  );
  const host = (await secretsService.get('HOST')) ?? 'localhost';

  // 3. Start application server without process.env leaks
  await app.listen(port, host);
  console.log(`[APP] Application listening on http://${host}:${port}`);
}
void bootstrap();
```

---

## CLI Management Tool

The package includes the `cipherlock` CLI binary executable for managing credentials and starting the broker daemon:

```bash
# 1. Set a single secret in the encrypted credential store
npx @pyush/cipherlock secrets:set PORT "3000"
# Output: [OK] Secret 'PORT' stored securely in OS credential store.

# 2. Set multiple secrets at once (set-many)
npx @pyush/cipherlock secrets:set-many PORT "3000" HOST "localhost" DB_NAME "prod_db"
# Output: [OK] Stored 3 secrets (PORT, HOST, DB_NAME) securely in OS credential store.

# 3. Retrieve a secret via CLI
npx @pyush/cipherlock secrets:get PORT
# Output: [OK] PORT = 3000

# 4. Store a complex JSON payload
npx @pyush/cipherlock secrets:set DB_CONFIG '{"host":"localhost","port":5432,"user":"admin"}'
# Output: [OK] Secret 'DB_CONFIG' stored securely in OS credential store.

# 5. Delete a single secret from the credential store
npx @pyush/cipherlock secrets:delete PORT
# Output: [OK] Secret 'PORT' deleted from OS credential store.

# 6. Delete multiple secrets at once (delete-many)
npx @pyush/cipherlock secrets:delete-many PORT HOST DB_NAME
# Output: [OK] Deleted 3 secrets (PORT, HOST, DB_NAME) from OS credential store.

# 7. Launch the Secret Broker Daemon
npx @pyush/cipherlock broker:start
# Output: [BROKER] Secret Broker listening on /tmp/cipherlock/broker.sock

# 8. Stop the Secret Broker Daemon
npx @pyush/cipherlock broker:stop
# Output: [OK] Secret broker daemon socket removed.
```

---

## Concurrent Development Workflow (`package.json`)

To automatically launch the secret broker daemon alongside NestJS in watch mode and shut down both services cleanly when pressing `Ctrl+C`, install `concurrently` and add the `--kill-others` flag:

```bash
npm install --save-dev concurrently
```

Update your `package.json`:
```json
"scripts": {
  "start:dev": "concurrently --kill-others \"npx @pyush/cipherlock broker:start\" \"nest start --watch\""
}
```

Now running `npm run start:dev` starts both the Secret Broker Daemon and NestJS. When you terminate with `Ctrl+C`, `concurrently` terminates both child processes and unlinks the Unix socket.

---

## Automated Background Service Setup (systemd)

Instead of starting the broker manually in a terminal, you can run it as an automatic background service under your Linux OS user.

Create `~/.config/systemd/user/cipherlock-broker.service`:

```ini
[Unit]
Description=CipherLock Secret Broker Daemon
After=network.target

[Service]
ExecStart=/usr/bin/npx @pyush/cipherlock broker:start
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
```

Enable and start the background service:

```bash
systemctl --user daemon-reload
systemctl --user enable cipherlock-broker --now
```

Check service status anytime:
```bash
systemctl --user status cipherlock-broker
```

---

## NestJS `ConfigService` Integration Patterns

`@pyush/cipherlock` fully supports NestJS `@nestjs/config` across **3 flexible patterns**:

### Pattern 1: Asynchronous Config Loader (`createCipherlockConfig`)
```typescript
import { ConfigModule } from '@nestjs/config';
import { createCipherlockConfig } from '@pyush/cipherlock';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [createCipherlockConfig(['PORT', 'HOST', 'DATABASE_PASSWORD'])],
    }),
  ],
})
export class AppModule {}
```

### Pattern 2: Custom `CipherlockConfigService` Injection
```typescript
import { CipherlockConfigService, SecretsModule } from '@pyush/cipherlock';

@Injectable()
export class DatabaseService {
  constructor(private readonly configService: CipherlockConfigService) {}

  async connect() {
    const dbPassword = await this.configService.get('DATABASE_PASSWORD');
  }
}
```

### Pattern 3: 1-Line `CipherlockConfigModule` Dynamic Module
```typescript
import { CipherlockConfigModule } from '@pyush/cipherlock';

@Module({
  imports: [CipherlockConfigModule.forRoot({ isGlobal: true })],
})
export class AppModule {}
```

---

## License

[MIT License](https://opensource.org/licenses/MIT) © 2026 CipherLock Contributors
