# @iampyus/cipherlock

🔒 **Secure Local Secret-Management Architecture for NestJS**

`@iampyus/cipherlock` is an enterprise-grade secret management library for NestJS applications. It completely eliminates sensitive plaintext `.env` files and `process.env` leaks by serving secrets on-demand over OS-authenticated local IPC channels (Unix Domain Sockets & Windows Named Pipes) with hardware-backed encryption (TPM 2.0 & Apple Secure Enclave).

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/@iampyus/cipherlock.svg)](https://www.npmjs.com/package/@iampyus/cipherlock)

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
npm install @iampyus/cipherlock
```

---

## Quick Start Guide

### 1. Store a Secret in Local Credential Store
```bash
npx @iampyus/cipherlock secrets:set -- DATABASE_PASSWORD "my-super-secret-password"
```

### 2. Start Local Secret Broker Daemon
```bash
npx @iampyus/cipherlock broker:start
```

### 3. Register Module in NestJS (`app.module.ts`)
```typescript
import { Module } from '@nestjs/common';
import { SecretsModule } from '@iampyus/cipherlock';

@Module({
  imports: [SecretsModule],
})
export class AppModule {}
```

### 4. Consume Secrets in Services / Controllers
```typescript
import { Injectable } from '@nestjs/common';
import { SecretsService } from '@iampyus/cipherlock';

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

## Storing Complex JSON Payloads

```bash
npx @iampyus/cipherlock secrets:set -- DB_CONFIG '{"host":"localhost","port":5432,"user":"admin"}'
```

```typescript
const configJson = await this.secretsService.get('DB_CONFIG');
const config = JSON.parse(configJson);
```

---

## License

[MIT License](https://opensource.org/licenses/MIT) © 2026 CipherLock Contributors
