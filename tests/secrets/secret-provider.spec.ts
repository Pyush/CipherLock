import { SecretsService } from '../../src/secrets/secrets.service';
import { SecretProvider } from '../../src/secrets/secret-provider';
import { BrokerSecretProvider } from '../../src/secrets/providers/broker-secret.provider';
import { BrokerError } from '../../broker/src/protocol';
import { BrokerTransport } from '../../broker/src/ipc/transport';

describe('SecretProvider & SecretsService', () => {
  it('SecretsService should delegate secret retrieval to underlying SecretProvider', async () => {
    const mockGet = jest.fn().mockResolvedValue('mock-secret-val');
    const mockProvider: SecretProvider = {
      get: mockGet,
    };

    const service = new SecretsService(mockProvider);
    const result = await service.get('DATABASE_PASSWORD');

    expect(result).toBe('mock-secret-val');
    expect(mockGet).toHaveBeenCalledWith('DATABASE_PASSWORD');
  });

  it('BrokerSecretProvider should handle broker unavailable error cleanly', async () => {
    const mockTransport: BrokerTransport = {
      request: jest
        .fn()
        .mockRejectedValue(
          new BrokerError('BROKER_UNAVAILABLE', 'Broker offline'),
        ),
    };

    const provider = new BrokerSecretProvider(mockTransport);

    await expect(provider.get('DATABASE_PASSWORD')).rejects.toThrow(
      BrokerError,
    );
    await expect(provider.get('DATABASE_PASSWORD')).rejects.toMatchObject({
      code: 'BROKER_UNAVAILABLE',
    });
  });

  it('BrokerSecretProvider should handle ACCESS_DENIED cleanly', async () => {
    const mockTransport: BrokerTransport = {
      request: jest.fn().mockResolvedValue({
        version: 1,
        success: false,
        error: 'ACCESS_DENIED',
        message: 'Access denied to secret',
      }),
    };

    const provider = new BrokerSecretProvider(mockTransport);

    await expect(provider.get('FORBIDDEN_SECRET')).rejects.toThrow(BrokerError);
    await expect(provider.get('FORBIDDEN_SECRET')).rejects.toMatchObject({
      code: 'ACCESS_DENIED',
    });
  });
});
