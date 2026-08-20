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

### 4. Consume Secrets in Services / Controllers
```typescript
import { Injectable } from '@nestjs/common';
import { SecretsService } from '@pyush/cipherlock';

@Injectable()
export class DatabaseService {
  constructor(private readonly secretsService: SecretsService) {}

  async connect() {
    // Secret retrieved securely over local IPC socket; never in process.env
    const dbPassword = await this.secretsService.get('DATABASE_PASSWORD');
    // ... establish DB connection
  }
}
```

---

## CLI Management Tool

The package includes the `cipherlock` CLI binary executable for managing credentials and starting the broker daemon:

```bash
# 1. Set a secret in the encrypted credential store
npx @pyush/cipherlock secrets:set -- DATABASE_PASSWORD "super-secret-password"
# Output: [SUCCESS] Secret DATABASE_PASSWORD updated in store.

# 2. Retrieve a secret via CLI
npx @pyush/cipherlock secrets:get -- DATABASE_PASSWORD
# Output: [SUCCESS] DATABASE_PASSWORD = super-secret-password

# 3. Store a complex JSON payload
npx @pyush/cipherlock secrets:set -- DB_CONFIG '{"host":"localhost","port":5432,"user":"admin"}'
# Output: [SUCCESS] Secret DB_CONFIG updated in store.

# 4. Delete a secret from the credential store
npx @pyush/cipherlock secrets:delete -- DATABASE_PASSWORD
# Output: [SUCCESS] Secret DATABASE_PASSWORD deleted from store.

# 5. Launch the Secret Broker Daemon
npx @pyush/cipherlock broker:start
# Output: [BROKER] Secret Broker listening on /tmp/cipherlock/broker.sock
```

---

## License

[MIT License](https://opensource.org/licenses/MIT) © 2026 CipherLock Contributors
