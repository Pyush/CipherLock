import { PolicyEngine, ClientIdentity } from '../../broker/src/policy';

describe('Dynamic PolicyEngine Unit Tests', () => {
  it('should allow owner UID when allowAllForOwner is true', () => {
    const policy = new PolicyEngine({}, true);
    const currentUid = process.getuid ? process.getuid() : 1000;
    const identity: ClientIdentity = { uid: currentUid, gid: currentUid };

    expect(policy.isAllowed(identity, 'ANY_RANDOM_SECRET')).toBe(true);
  });

  it('should evaluate registered role policies when allowAllForOwner is false', () => {
    const policy = new PolicyEngine({}, false);
    policy.registerPolicy('user-service', ['PORT', 'HOST']);

    const allowedIdentity: ClientIdentity = {
      uid: 1002,
      gid: 1002,
      role: 'user-service',
    };
    const deniedIdentity: ClientIdentity = {
      uid: 1002,
      gid: 1002,
      role: 'unregistered-role',
    };

    expect(policy.isAllowed(allowedIdentity, 'PORT')).toBe(true);
    expect(policy.isAllowed(allowedIdentity, 'HOST')).toBe(true);
    expect(policy.isAllowed(allowedIdentity, 'DB_PASS')).toBe(false);
    expect(policy.isAllowed(deniedIdentity, 'PORT')).toBe(false);
  });

  it('should support wildcard "*" permissions', () => {
    const policy = new PolicyEngine({}, false);
    policy.registerPolicy('admin-service', ['*']);

    const identity: ClientIdentity = {
      uid: 1005,
      gid: 1005,
      role: 'admin-service',
    };

    expect(policy.isAllowed(identity, 'DATABASE_PASSWORD')).toBe(true);
    expect(policy.isAllowed(identity, 'JWT_SECRET')).toBe(true);
  });

  it('should allow removing policies dynamically', () => {
    const policy = new PolicyEngine({}, false);
    policy.registerPolicy('temp-role', ['TEMP_KEY']);

    const identity: ClientIdentity = {
      uid: 1003,
      gid: 1003,
      role: 'temp-role',
    };
    expect(policy.isAllowed(identity, 'TEMP_KEY')).toBe(true);

    policy.removePolicy('temp-role');
    expect(policy.isAllowed(identity, 'TEMP_KEY')).toBe(false);
  });
});
