import { validateBrokerRequest, BrokerError } from '../../broker/src/protocol';
import { PolicyEngine } from '../../broker/src/policy';

describe('Broker Protocol & Policy Engine', () => {
  describe('Protocol Validation', () => {
    it('should validate valid request', () => {
      const valid = {
        version: 1,
        operation: 'get',
        secret: 'DATABASE_PASSWORD',
      };
      const req = validateBrokerRequest(valid);
      expect(req.secret).toBe('DATABASE_PASSWORD');
    });

    it('should reject invalid protocol version', () => {
      const invalidVersion = {
        version: 99,
        operation: 'get',
        secret: 'DATABASE_PASSWORD',
      };
      expect(() => validateBrokerRequest(invalidVersion)).toThrow(BrokerError);
    });

    it('should reject invalid secret name containing special characters', () => {
      const invalidSecret = {
        version: 1,
        operation: 'get',
        secret: '../../etc/passwd',
      };
      expect(() => validateBrokerRequest(invalidSecret)).toThrow(BrokerError);
    });

    it('should reject unknown operation', () => {
      const invalidOp = {
        version: 1,
        operation: 'eval',
        secret: 'DATABASE_PASSWORD',
      };
      expect(() => validateBrokerRequest(invalidOp)).toThrow(BrokerError);
    });
  });

  describe('Policy Authorization', () => {
    const policy = new PolicyEngine();

    it('should authorize sample-nest-app role for DATABASE_PASSWORD', () => {
      const allowed = policy.isAllowed(
        {
          uid: process.getuid ? process.getuid() : 1000,
          gid: 1000,
          role: 'sample-nest-app',
        },
        'DATABASE_PASSWORD',
      );
      expect(allowed).toBe(true);
    });

    it('should reject sample-nest-app role for JWT_SECRET', () => {
      const allowed = policy.isAllowed(
        {
          uid: process.getuid ? process.getuid() : 1000,
          gid: 1000,
          role: 'sample-nest-app',
        },
        'JWT_SECRET',
      );
      expect(allowed).toBe(false);
    });

    it('should reject unknown client identity without role', () => {
      const allowed = policy.isAllowed(
        { uid: 9999, gid: 9999 },
        'DATABASE_PASSWORD',
      );
      expect(allowed).toBe(false);
    });
  });
});
