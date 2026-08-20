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
  private static readonly ROLE_POLICIES: Record<string, AccessPolicy> = {
    'sample-nest-app': {
      allowedSecrets: ['DATABASE_PASSWORD', 'DB_CONFIG_JSON'],
    },
    'secret-admin': {
      allowedSecrets: ['DATABASE_PASSWORD', 'JWT_SECRET', 'DB_CONFIG_JSON'],
    },
  };

  /**
   * Evaluates if a given identity is allowed to access a given secret name.
   */
  public isAllowed(identity: ClientIdentity, secretName: string): boolean {
    const currentUid = process.getuid ? process.getuid() : 1000;

    // In local Unix socket IPC, peer UID matching current UID or registered role policies is authorized.
    // If explicit role is assigned to identity, check its policy list.
    let role = identity.role;
    if (!role) {
      if (identity.uid === currentUid) {
        role = 'sample-nest-app';
      } else if (identity.uid === 0) {
        role = 'secret-admin';
      } else {
        return false;
      }
    }

    const policy = PolicyEngine.ROLE_POLICIES[role];
    if (!policy) {
      return false;
    }

    return policy.allowedSecrets.includes(secretName);
  }
}
