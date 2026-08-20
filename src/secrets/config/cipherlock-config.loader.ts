import { BrokerSecretProvider } from '../providers/broker-secret.provider';
import { SecretProvider } from '../secret-provider';

/**
 * Strategy 1: Asynchronous Config Loader for NestJS ConfigModule.forRoot({ load: [...] })
 *
 * Fetches specified keys (or all available keys) directly from the local IPC secret broker
 * and formats them into a plain JavaScript configuration object for NestJS ConfigService.
 *
 * @param keys Optional array of secret keys to fetch. If omitted, default keys will be retrieved.
 * @param provider Optional custom SecretProvider instance. Defaults to BrokerSecretProvider.
 */
export function createCipherlockConfig(
  keys: string[] = [
    'PORT',
    'HOST',
    'DATABASE_PASSWORD',
    'DATABASE_URL',
    'JWT_SECRET',
  ],
  provider: SecretProvider = new BrokerSecretProvider(),
) {
  return async (): Promise<Record<string, unknown>> => {
    const config: Record<string, unknown> = {};
    for (const key of keys) {
      try {
        const val = await provider.get(key);
        if (val !== null) {
          // Store raw string or attempt JSON parse if payload is a JSON object
          try {
            config[key] = JSON.parse(val);
          } catch {
            config[key] = val;
          }
        }
      } catch {
        // Skip missing keys cleanly
      }
    }
    return config;
  };
}
