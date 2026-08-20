# Multi-Project Local Secret Broker Architecture

This document explains how the local secret management architecture handles multiple concurrent NestJS projects running on the same machine.

---

## 1. How It Works With Multiple Local Projects

When you have **multiple projects/microservices** running locally on the same developer machine (e.g., `user-service`, `payment-service`, `inventory-service`), there are **two primary design patterns** depending on your isolation requirements:

```text
                                   DEVELOPER MACHINE
 ┌────────────────────────┐   ┌────────────────────────┐   ┌────────────────────────┐
 │   NestJS App Alpha     │   │    NestJS App Beta     │   │   NestJS App Gamma     │
 │  (e.g., user-service)  │   │ (e.g., payment-service)│   │(e.g., secret-admin cli)│
 └───────────┬────────────┘   └───────────┬────────────┘   └───────────┬────────────┘
             │                            │                            │
             │ Unix Socket IPC            │ Unix Socket IPC            │ Unix Socket IPC
             └─────────────────────┬──────┴────────────────────────────┘
                                   │
                                   v
                   ┌───────────────────────────────┐
                   │    Shared Secret Broker       │
                   │    (Daemon Process / Socket)  │
                   └───────────────┬───────────────┘
                                   │
                                   v
                   ┌───────────────────────────────┐
                   │  Policy & Identity Engine     │
                   │  - App-specific namespaces    │
                   │  - App-specific key ACLs      │
                   └───────────────┬───────────────┘
                                   │
                                   v
                   ┌───────────────────────────────┐
                   │  OS Credential Store / Vault  │
                   └───────────────────────────────┘
```

---

## 2. Approach A: Shared Broker Daemon with Namespacing & Scoped ACLs (Recommended)

In this setup, a **single Secret Broker daemon** runs on the machine, and all local projects talk to the same socket or a designated namespace.

### A. Secret Namespacing
To avoid secret collisions between projects, secrets are stored using app-scoped names or prefixes:

```text
user-service/DATABASE_PASSWORD
payment-service/STRIPE_API_KEY
inventory-service/REDIS_URL
```

### B. Client Identity & Application Tokens / App IDs
Since multiple Node.js apps running under the same developer user share the same Linux UID (`1000`), the Broker uses **App-Scoped Authorization Headers / Tokens**:

1. When starting a project locally, the project is configured with a local, non-sensitive Application Identifier (e.g., `APP_ID=user-service`).
2. The `BrokerSecretProvider` includes this identifier in the IPC request frame:
   ```json
   {
     "version": 1,
     "operation": "get",
     "appId": "payment-service",
     "secret": "STRIPE_API_KEY"
   }
   ```
3. The Secret Broker checks its Policy Engine:
   ```typescript
   const POLICIES = {
     'user-service': { allowedSecrets: ['user-service/DATABASE_PASSWORD'] },
     'payment-service': { allowedSecrets: ['payment-service/STRIPE_API_KEY'] },
   };
   ```
4. `user-service` is denied if it attempts to request `payment-service/STRIPE_API_KEY`.

---

## 3. Approach B: Isolated Per-Project Broker Instances

If you prefer complete isolation between projects, each project runs its **own instance of the secret broker** using isolated socket paths:

### How it works:
1. **Project A** (`user-service`):
   - Broker Socket Path: `/tmp/user-service-broker.sock`
   - Store Vault Path: `~/.secret-broker/user-service/vault.enc`
2. **Project B** (`payment-service`):
   - Broker Socket Path: `/tmp/payment-service-broker.sock`
   - Store Vault Path: `~/.secret-broker/payment-service/vault.enc`

### Environment Configuration in NestJS:
```typescript
// secrets.module.ts
const socketPath = process.env.BROKER_SOCKET_PATH || `/tmp/${process.env.APP_NAME}-broker.sock`;

providers: [
  {
    provide: 'SECRET_PROVIDER',
    useFactory: () => new BrokerSecretProvider(new UnixSocketTransport({ socketPath })),
  },
]
```

---

## 4. Comparison Summary

| Metric / Requirement | Approach A: Shared Broker Daemon | Approach B: Per-Project Broker Socket |
| :--- | :--- | :--- |
| **Broker Daemons Running** | 1 central daemon on developer machine | 1 daemon per running project |
| **Socket Path** | `/tmp/nest-secret-broker.sock` | `/tmp/<project-name>-broker.sock` |
| **Secret Collision Handling** | Namespaced key names (`app/SECRET`) | Isolated per-project vaults |
| **Resource Overhead** | Low (Single Node process) | Slightly higher (Multiple Node processes) |
| **Parity with Cloud (Vault/AWS)** | High (Matches production Vault AppRole/Workload Identity model) | Medium |

---

## 5. Implementation Example for Multi-Project Support in Code

Updating `validateBrokerRequest` to support app namespaces:

```typescript
export interface BrokerRequest {
  version: number;
  operation: 'get' | 'set' | 'delete';
  appId: string;        // e.g., "user-service" or "payment-service"
  secret: string;       // e.g., "DATABASE_PASSWORD"
}
```

Updating `PolicyEngine` to enforce per-app secret access:

```typescript
export class PolicyEngine {
  private static readonly APP_POLICIES: Record<string, string[]> = {
    'user-service': ['DATABASE_PASSWORD', 'USER_SERVICE_JWT'],
    'payment-service': ['STRIPE_KEY', 'PAYMENT_DB_PASSWORD'],
  };

  public isAllowed(appId: string, secretName: string): boolean {
    const allowed = PolicyEngine.APP_POLICIES[appId] || [];
    return allowed.includes(secretName);
  }
}
```
