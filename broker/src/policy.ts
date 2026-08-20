export interface ClientIdentity {
  uid: number;
  gid: number;
  role?: string;
  exePath?: string;
}

export interface AccessPolicy {
  allowedSecrets: string[];
}

export class PolicyEngine {
  private rolePolicies: Map<string, AccessPolicy> = new Map();
  private allowAllForOwner: boolean;

  constructor(
    initialPolicies?: Record<string, AccessPolicy>,
    allowAllForOwner = true,
  ) {
    this.allowAllForOwner = allowAllForOwner;

    if (initialPolicies) {
      for (const [role, policy] of Object.entries(initialPolicies)) {
        this.registerPolicy(role, policy.allowedSecrets);
      }
    } else {
      // Register standard default role policies for backwards compatibility
      this.registerPolicy('sample-nest-app', [
        'DATABASE_PASSWORD',
        'DB_CONFIG_JSON',
        'PORT',
        'HOST',
      ]);
      this.registerPolicy('secret-admin', [
        'DATABASE_PASSWORD',
        'JWT_SECRET',
        'DB_CONFIG_JSON',
        'PORT',
        'HOST',
      ]);
    }
  }

  /**
   * Registers or updates an allowed secrets policy for a specific role name.
   * Use '*' as a secret name to grant access to all secrets.
   */
  public registerPolicy(roleName: string, allowedSecrets: string[]): this {
    this.rolePolicies.set(roleName, { allowedSecrets });
    return this;
  }

  /**
   * Removes a registered policy for a role name.
   */
  public removePolicy(roleName: string): boolean {
    return this.rolePolicies.delete(roleName);
  }

  /**
   * Returns a copy of all currently registered role policies.
   */
  public getPolicies(): Record<string, AccessPolicy> {
    const result: Record<string, AccessPolicy> = {};
    for (const [role, policy] of this.rolePolicies.entries()) {
      result[role] = { allowedSecrets: [...policy.allowedSecrets] };
    }
    return result;
  }

  /**
   * Evaluates if a given identity is authorized to access a specific secret name.
   */
  public isAllowed(identity: ClientIdentity, secretName: string): boolean {
    const currentUid = process.getuid ? process.getuid() : 1000;

    // 1. If explicit role is passed, evaluate role policy directly
    if (identity.role) {
      const policy = this.rolePolicies.get(identity.role);
      if (!policy) return false;
      return (
        policy.allowedSecrets.includes('*') ||
        policy.allowedSecrets.includes(secretName)
      );
    }

    // 2. Owner UID auto-authorization check
    if (this.allowAllForOwner && identity.uid === currentUid) {
      const defaultPolicy = this.rolePolicies.get('sample-nest-app');
      if (defaultPolicy) {
        return (
          defaultPolicy.allowedSecrets.includes('*') ||
          defaultPolicy.allowedSecrets.includes(secretName)
        );
      }
      return true;
    }

    // 3. Fallback to admin for root UID 0
    if (identity.uid === 0) {
      const adminPolicy = this.rolePolicies.get('secret-admin');
      if (adminPolicy) {
        return (
          adminPolicy.allowedSecrets.includes('*') ||
          adminPolicy.allowedSecrets.includes(secretName)
        );
      }
      return true;
    }

    return false;
  }
}
