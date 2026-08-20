import { SecretBrokerServer } from './server';
import { PlatformStore } from './credentials/platform-store';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'broker:start' || command === 'start') {
    const server = new SecretBrokerServer();
    await server.start();

    process.on('SIGINT', () => {
      void server.stop().then(() => {
        process.exit(0);
      });
    });
    process.on('SIGTERM', () => {
      void server.stop().then(() => {
        process.exit(0);
      });
    });
    return;
  }

  if (command === 'secrets:set') {
    const key = args[1];
    const val = args[2];
    if (!key || !val) {
      console.error('Usage: npm run secrets:set -- <KEY> <VALUE>');
      process.exit(1);
    }
    const store = new PlatformStore();
    await store.set(key, val);
    console.log(`[OK] Secret '${key}' stored securely in OS credential store.`);
    return;
  }

  if (command === 'secrets:get') {
    const key = args[1];
    if (!key) {
      console.error('Usage: npm run secrets:get -- <KEY>');
      process.exit(1);
    }
    console.log(`[DEBUG] Attempting to retrieve secret '${key}'...`);
    const store = new PlatformStore();
    const val = await store.get(key);
    if (val === null) {
      console.log(`Secret '${key}' not found.`);
    } else {
      console.log(
        `[DEBUG] Secret '${key}' exists in store. Length: ${val.length} chars.`,
      );
    }
    return;
  }

  if (command === 'secrets:delete') {
    const key = args[1];
    if (!key) {
      console.error('Usage: npm run secrets:delete -- <KEY>');
      process.exit(1);
    }
    const store = new PlatformStore();
    await store.delete(key);
    console.log(`[OK] Secret '${key}' deleted from OS credential store.`);
    return;
  }

  console.error('Unknown CLI command:', command);
  process.exit(1);
}

main().catch((err: unknown) => {
  const error = err as Error;
  console.error('CLI Error:', error.message);
  process.exit(1);
});
