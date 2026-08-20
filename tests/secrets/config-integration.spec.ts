import { Test, TestingModule } from '@nestjs/testing';
import { createCipherlockConfig } from '../../src/secrets/config/cipherlock-config.loader';
import { CipherlockConfigService } from '../../src/secrets/config/cipherlock-config.service';
import { CipherlockConfigModule } from '../../src/secrets/config/cipherlock-config.module';
import { SecretProvider } from '../../src/secrets/secret-provider';
import { SecretsService } from '../../src/secrets/secrets.service';

class MockSecretProvider implements SecretProvider {
  private data = new Map<string, string>([
    ['PORT', '4000'],
    ['HOST', '127.0.0.1'],
    ['DB_CONFIG', '{"host":"localhost","port":5432}'],
  ]);

  get(name: string): Promise<string> {
    return Promise.resolve(this.data.get(name) ?? '');
  }
  set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
    return Promise.resolve();
  }
  delete(key: string): Promise<void> {
    this.data.delete(key);
    return Promise.resolve();
  }
}

describe('ConfigService Integration Strategies', () => {
  let mockProvider: MockSecretProvider;

  beforeEach(() => {
    mockProvider = new MockSecretProvider();
  });

  describe('Strategy 1: createCipherlockConfig Loader', () => {
    it('should load secrets asynchronously into config object', async () => {
      const loader = createCipherlockConfig(
        ['PORT', 'HOST', 'DB_CONFIG'],
        mockProvider,
      );
      const config = await loader();

      expect(config.PORT).toBe(4000);
      expect(config.HOST).toBe('127.0.0.1');
      expect(config.DB_CONFIG).toEqual({ host: 'localhost', port: 5432 });
    });
  });

  describe('Strategy 2: CipherlockConfigService', () => {
    it('should delegate get() lookups to SecretsService', async () => {
      const secretsService = new SecretsService(mockProvider);
      const configService = new CipherlockConfigService(secretsService);

      const port = await configService.get<number>('PORT');
      expect(port).toBe(4000);

      const parsedConfig = await configService.get<{
        host: string;
        port: number;
      }>('DB_CONFIG');
      expect(parsedConfig).toEqual({ host: 'localhost', port: 5432 });

      const fallback = await configService.get('MISSING_KEY', 'default_val');
      expect(fallback).toBe('default_val');
    });
  });

  describe('Strategy 3: CipherlockConfigModule', () => {
    it('should compile dynamic module successfully', async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [CipherlockConfigModule.forRoot()],
      })
        .overrideProvider('SECRET_PROVIDER')
        .useValue(mockProvider)
        .compile();

      const configService = moduleRef.get<CipherlockConfigService>(
        CipherlockConfigService,
      );
      expect(configService).toBeDefined();

      const host = await configService.get('HOST');
      expect(host).toBe('127.0.0.1');
    });
  });
});
