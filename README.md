# Secure Local Secret-Management Architecture & Multi-Phase Roadmap Documentation

This document provides comprehensive documentation for the NestJS Local Secret Management Architecture proof-of-concept, multi-project execution patterns, cross-platform adapters, hardware-backed key binding, malware threat analysis, and complete live demo endpoints.

---

## Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [Project Directory Structure](#2-project-directory-structure)
3. [Phases Summary & Roadmap](#3-phases-summary--roadmap)
   - [Phase 1: NestJS Core, Unix Socket IPC & Ephemeral Vault](#phase-1-nestjs-core-unix-socket-ipc--ephemeral-vault)
   - [Phase 2: Windows Named Pipes, DPAPI & Cloud Secret Providers](#phase-2-windows-named-pipes-dpapi--cloud-secret-providers)
   - [Phase 3: Hardware Security Module (TPM 2.0 / Apple Secure Enclave) Binding](#phase-3-hardware-security-module-tpm-20--apple-secure-enclave-binding)
4. [Malware Threat Mitigation Matrix](#4-malware-threat-mitigation-matrix)
5. [Multi-Project Local Execution](#5-multi-project-local-execution)
6. [Live Demo Endpoints Guide](#6-live-demo-endpoints-guide)
7. [Automated Test Verification](#7-automated-test-verification)
8. [Operator & CLI Guide](#8-operator--cli-guide)

---

## 1. Architecture Overview

```text
                    NestJS Application (SecretsService)
                                     │
             ┌───────────────────────┴───────────────────────┐
             │                                               │
             v (Development / Local IPC)                     v (Production / Cloud)
 ┌───────────────────────┐                       ┌───────────────────────┐
 │ Local Secret Provider │                       │ Cloud Secret Provider │
 └───────────┬───────────┘                       │ (Vault / AWS / GCP)   │
             │                                   └───────────────────────┘
             v (TransportFactory: Unix / Windows Named Pipe)
 ┌───────────────────────┐
 │     Secret Broker     │
 └───────────┬───────────┘
             │ (StoreFactory: PlatformStore / WindowsDpapiStore / HardwareBoundStore)
             v
 ┌───────────────────────────────────────────────────────────┐
 │ Hardware Security Module (TPM 2.0 / Apple Secure Enclave) │
 └───────────────────────────────────────────────────────────┘
```

---

## 2. Project Directory Structure

```text
/home/ubuntu/projectworkspace/secure-env
├── README.md                        # Complete project documentation
├── MULTI_PROJECT_ARCHITECTURE.md    # Multi-project architectural guidelines
├── MALWARE_THREAT_ANALYSIS.md       # Malware threat matrix & hardening analysis
├── jest.config.json                 # Unit test runner config
├── package.json
├── broker/
│   └── src/
│       ├── cli.ts                   # CLI entrypoint for secrets administration & broker
│       ├── credentials/
│       │   ├── credential-store.ts  # CredentialStore interface
│       │   ├── hardware-bound-store.ts # Hardware TPM/Secure Enclave bound store
│       │   ├── platform-store.ts    # AES-256-GCM OS store
│       │   ├── store-factory.ts     # Platform store factory
│       │   └── windows-dpapi-store.ts # Windows DPAPI store
│       ├── ipc/
│       │   ├── peer-verification.ts  # Linux peer process executable path verification (/proc/<pid>/exe)
│       │   ├── transport.ts         # BrokerTransport interface
│       │   ├── transport-factory.ts # Platform transport factory
│       │   ├── unix-socket-client.ts# Unix Socket client transport
│       │   ├── unix-socket-server.ts# Unix Socket server
│       │   ├── windows-pipe-client.ts # Windows Named Pipe client
│       │   └── windows-pipe-server.ts # Windows Named Pipe server
│       ├── policy.ts                # Peer identity ACL policy engine
│       ├── protocol.ts              # Framed JSON protocol validation
│       ├── security/
│       │   ├── hardware-factory.ts  # OS hardware provider factory
│       │   ├── hardware-provider.ts # HardwareSecurityProvider interface
│       │   ├── secure-enclave-provider.ts # macOS Secure Enclave provider
│       │   └── tpm-provider.ts      # Linux/Windows TPM 2.0 provider
│       └── server.ts                # Secret broker server lifecycle
├── src/
│   ├── app.controller.ts            # GET /health
│   ├── app.module.ts
│   ├── demo/
│   │   ├── demo.controller.ts       # Live demo endpoints for all features
│   │   └── demo.module.ts
│   └── secrets/
│       ├── secret-provider.ts       # SecretProvider interface
│       ├── secrets.module.ts
│       ├── secrets.service.ts
│       └── providers/
│           ├── broker-secret.provider.ts # Local IPC broker secret provider
│           └── cloud-secret.provider.ts  # HashiCorp Vault / Cloud secret provider
└── tests/
    ├── broker/
    │   ├── broker-protocol.spec.ts  # Protocol validation & ACL unit tests
    │   ├── phase2-features.spec.ts  # Phase 2 Windows & Cloud provider unit tests
    │   ├── phase3-hardware.spec.ts # Phase 3 TPM / Secure Enclave unit tests
    │   └── socket-permissions.spec.ts # Socket 0600 mode unit test
    ├── integration/
    │   └── secret-flow.e2e-spec.ts   # E2E secret flow test
    └── secrets/
        └── secret-provider.spec.ts  # SecretProvider unit tests
```

---

## 3. Phases Summary & Roadmap

### Phase 1: NestJS Core, Unix Socket IPC & Ephemeral Vault
- `SecretProvider` interface & `SecretsService` dependency injection.
- Unix Domain Socket IPC (`/tmp/.../broker.sock`) with mode `0600` permissions.
- Kernel OS peer identity authentication (`process.getuid()`).
- AES-256-GCM encrypted local store.

### Phase 2: Windows Named Pipes, DPAPI & Cloud Secret Providers
- Windows Named Pipe IPC transport (`WindowsNamedPipeTransport` & `WindowsPipeServer`).
- `TransportFactory` auto-detecting OS platform (`win32` vs `linux`/`darwin`).
- Windows DPAPI credential store (`WindowsDpapiStore`) & `StoreFactory`.
- Production `CloudSecretProvider` with HashiCorp Vault, AWS Secrets Manager, and GCP Secret Manager REST API integration and TTL caching.

### Phase 3: Hardware Security Module (TPM 2.0 / Apple Secure Enclave) Binding
- `HardwareSecurityProvider` interface defining hardware key sealing and unsealing.
- `Tpm2Provider` for Linux/Windows TPM 2.0 PCR-bound key sealing.
- `SecureEnclaveProvider` for macOS Apple Secure Enclave binding.
- `HardwareBoundStore` storing vault master keys inside non-exportable hardware-protected envelopes.

---

## 4. Malware Threat Mitigation Matrix

| Threat Vector / Attacker Profile | Initial Vulnerability | Architectural Mitigation Strategy | Resulting Protection Level |
| :--- | :--- | :--- | :---: |
| **1. Disk Scrapers & `.env` Harvesters** | Plaintext `.env` stolen from disk. | Zero `.env` files used or created; `.gitignore` blocks `.env*`. | 🛡️ **FULLY PROTECTED** |
| **2. Environment Variable Dumps (`process.env`)** | `process.env` exported or logged on error. | Secrets are never loaded into `process.env`. | 🛡️ **FULLY PROTECTED** |
| **3. Other Local OS Users (`UID 1002`)** | Unprivileged local user reads IPC socket. | Socket mode is strictly `0600` (Owner read/write only). | 🛡️ **FULLY PROTECTED** |
| **4. Scenario A: In-Process Malicious NPM Package** | Package inspects JavaScript heap memory. | **Short-Lived Ephemeral Leases & `Buffer.fill(0)` Memory Zeroing** | 🛡️ **MITIGATED** |
| **5. Scenario B: Malware under Same OS User (`UID 1001`)** | Malware connects to socket sharing UID 1001. | **Peer Process Verification (`/proc/<pid>/exe`) & Ephemeral Boot Token** | 🛡️ **MITIGATED** |
| **6. Scenario F: Root / Administrator Malware** | Root reads process RAM (`/proc/<pid>/mem`) or `ptrace`. | **TPM 2.0 PCR Hardware Binding & Kernel `yama.ptrace_scope=2`** | 🛡️ **MITIGATED** |

For details, see [MALWARE_THREAT_ANALYSIS.md](file:///home/ubuntu/projectworkspace/secure-env/MALWARE_THREAT_ANALYSIS.md).

---

## 5. Multi-Project Local Execution

When running multiple NestJS projects on the same machine, projects can either:
1. **Share a single broker daemon** using app-scoped secret key names (`user-service/DATABASE_PASSWORD`).
2. **Run isolated broker instances** using per-project socket paths (`/tmp/<app-name>-broker.sock`).

For details, see [MULTI_PROJECT_ARCHITECTURE.md](file:///home/ubuntu/projectworkspace/secure-env/MULTI_PROJECT_ARCHITECTURE.md).

---

## 6. Live Demo Endpoints Guide

| Endpoint Path | Solution / Feature Demonstrated | Sample Response |
| :--- | :--- | :--- |
| **`GET /health`** | Core NestJS health status | `{"status": "ok"}` |
| **`GET /demo/database`** | **Phase 1**: Local IPC secret retrieval without exposing secret values | `{"configured": true}` |
| **`GET /demo/ipc-platform`** | **Phase 2**: OS Auto-detection of IPC Transport & Credential Store | `{"osPlatform": "linux", "ipcTransportType": "UnixSocketTransport", "credentialStoreType": "PlatformStore"}` |
| **`GET /demo/cloud-provider?type=vault`** | **Phase 2**: Cloud Secret Managers (HashiCorp Vault / AWS / GCP) | `{"providerType": "vault", "configured": true, "sampleKey": "DATABASE_PASSWORD"}` |
| **`GET /demo/hardware-status`** | **Phase 3**: Hardware Security Module (TPM 2.0 / Apple Secure Enclave) | `{"hardwareBound": true, "provider": "Tpm2Provider", "platform": "linux"}` |
| **`GET /demo/peer-verification`** | **Malware Defense**: Scenario B kernel OS peer executable path check (`/proc/<pid>/exe`) | `{"verifiedUid": 1001, "verifiedGid": 1001, "executablePath": "/usr/bin/node"}` |

---

## 7. Automated Test Verification

Execute all unit and end-to-end integration tests:
```bash
npm test && npm run test:e2e
```

**Results**:
```text
PASS tests/broker/phase3-hardware.spec.ts
PASS tests/broker/phase2-features.spec.ts
PASS src/app.controller.spec.ts
PASS tests/secrets/secret-provider.spec.ts
PASS tests/broker/broker-protocol.spec.ts
PASS tests/broker/socket-permissions.spec.ts
PASS tests/integration/secret-flow.e2e-spec.ts
PASS test/app.e2e-spec.ts

Test Suites: 8 passed, 8 total
Tests:       31 passed, 31 total
Snapshots:   0 total
Time:        0.985 s
```

---

## 8. Operator & CLI Guide

The `@pyush/cipherlock` CLI provides administrative commands to manage local credentials and run the broker daemon.

### CLI Commands

```bash
# 1. Set a single secret in the encrypted credential store
npx @pyush/cipherlock secrets:set PORT "3000"
# Output: [OK] Secret 'PORT' stored securely in OS credential store.

# 2. Set multiple secrets at once (set-many)
npx @pyush/cipherlock secrets:set-many PORT "3000" HOST "localhost" DB_NAME "prod_db"
# Output: [OK] Stored 3 secrets (PORT, HOST, DB_NAME) securely in OS credential store.

# 3. Retrieve a secret directly via CLI
npx @pyush/cipherlock secrets:get PORT
# Output: [OK] PORT = 3000

# 4. Store a complex JSON string payload
npx @pyush/cipherlock secrets:set DB_CONFIG '{"host":"localhost","port":5432,"user":"admin"}'
# Output: [OK] Secret 'DB_CONFIG' stored securely in OS credential store.

# 5. Delete a single secret from the credential store
npx @pyush/cipherlock secrets:delete PORT
# Output: [OK] Secret 'PORT' deleted from OS credential store.

# 6. Delete multiple secrets at once (delete-many)
npx @pyush/cipherlock secrets:delete-many PORT HOST DB_NAME
# Output: [OK] Deleted 3 secrets (PORT, HOST, DB_NAME) from OS credential store.

# 7. Start the Secret Broker Daemon
npx @pyush/cipherlock broker:start
# Output: [BROKER] Secret Broker listening on /tmp/cipherlock/broker.sock
```

### Main Application Injection Example (`src/main.ts`)

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SecretsService } from '@pyush/cipherlock';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Resolve SecretsService from application context
  const secretsService = app.get(SecretsService);

  let port = 3000;
  let host = 'localhost';

  try {
    const rawPort = await secretsService.get('PORT');
    if (rawPort) port = parseInt(rawPort, 10);
  } catch {}

  try {
    const rawHost = await secretsService.get('HOST');
    if (rawHost) host = rawHost;
  } catch {}

  await app.listen(port, host);
  console.log(`[APP] Application listening on http://${host}:${port}`);
}
void bootstrap();
```

### Live Demo Verification Workflow

```bash
# 1. Populate required secrets
npx @pyush/cipherlock secrets:set DATABASE_PASSWORD "super-secret-demo-value"
npx @pyush/cipherlock secrets:set PORT "3000"

# 2. Start Secret Broker Daemon
npx @pyush/cipherlock broker:start

# 3. Start NestJS Application
npm run start:dev

# 4. Query live demo endpoints
curl http://localhost:3000/health
curl http://localhost:3000/demo/database
# Response: {"configured":true}

curl http://localhost:3000/demo/json-config
# Response: {"status":"success","parsedMetadata":{"host":"postgres.internal.net","port":5432,"database":"production_db","username":"app_admin","passwordConfigured":true,"ssl":true}}

curl http://localhost:3000/demo/ipc-platform
curl "http://localhost:3000/demo/cloud-provider?type=vault"
curl http://localhost:3000/demo/hardware-status
curl http://localhost:3000/demo/peer-verification
```
