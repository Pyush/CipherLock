#!/usr/bin/env node
import { SecretBrokerServer } from './server';
import { PlatformStore } from './credentials/platform-store';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

async function main() {
  // Filter out npm's '--' pass-through delimiter flag if present
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const command = args[0];

  const defaultRuntimeDir =
    process.env.XDG_RUNTIME_DIR ||
    path.join(
      os.tmpdir(),
      `.nest-secret-broker-${process.getuid ? process.getuid() : 1000}`,
    );
  const socketPath = path.join(defaultRuntimeDir, 'broker.sock');

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

  if (command === 'broker:stop' || command === 'stop') {
    if (fs.existsSync(socketPath)) {
      try {
        fs.unlinkSync(socketPath);
        console.log(`[OK] Secret broker daemon socket removed at ${socketPath}.`);
      } catch (err: unknown) {
        const error = err as Error;
        console.error(`[ERROR] Failed to remove socket file: ${error.message}`);
      }
    } else {
      console.log(`[INFO] Secret broker socket is not currently active.`);
    }
    return;
  }

  if (command === 'secrets:set') {
    const key = args[1];
    const val = args[2];
    if (!key || !val) {
      console.error('Usage: npx @pyush/cipherlock secrets:set PORT "3000"');
      process.exit(1);
    }
    const store = new PlatformStore();
    await store.set(key, val);
    console.log(`[OK] Secret '${key}' stored securely in OS credential store.`);
    return;
  }

  if (command === 'secrets:set-many' || command === 'secrets:setmany') {
    const pairs = args.slice(1);
    if (pairs.length === 0 || pairs.length % 2 !== 0) {
      console.error(
        'Usage: npx @pyush/cipherlock secrets:set-many KEY1 VAL1 KEY2 VAL2 ...',
      );
      process.exit(1);
    }
    const entries: Record<string, string> = {};
    for (let i = 0; i < pairs.length; i += 2) {
      entries[pairs[i]] = pairs[i + 1];
    }
    const store = new PlatformStore();
    await store.setMany(entries);
    console.log(
      `[OK] Stored ${Object.keys(entries).length} secrets (${Object.keys(entries).join(', ')}) securely in OS credential store.`,
    );
    return;
  }

  if (command === 'secrets:get') {
    const key = args[1];
    if (!key) {
      console.error('Usage: npx @pyush/cipherlock secrets:get PORT');
      process.exit(1);
    }
    const store = new PlatformStore();
    const val = await store.get(key);
    if (val === null) {
      console.log(`Secret '${key}' not found.`);
    } else {
      console.log(`[OK] ${key} = ${val}`);
    }
    return;
  }

  if (command === 'secrets:delete') {
    const key = args[1];
    if (!key) {
      console.error('Usage: npx @pyush/cipherlock secrets:delete PORT');
      process.exit(1);
    }
    const store = new PlatformStore();
    await store.delete(key);
    console.log(`[OK] Secret '${key}' deleted from OS credential store.`);
    return;
  }

  if (command === 'secrets:delete-many' || command === 'secrets:deletemany') {
    const keys = args.slice(1);
    if (keys.length === 0) {
      console.error(
        'Usage: npx @pyush/cipherlock secrets:delete-many KEY1 KEY2 ...',
      );
      process.exit(1);
    }
    const store = new PlatformStore();
    await store.deleteMany(keys);
    console.log(
      `[OK] Deleted ${keys.length} secrets (${keys.join(', ')}) from OS credential store.`,
    );
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
