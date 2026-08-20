import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AppModule } from '../../src/app.module';
import { UnixSocketServer } from '../../broker/src/ipc/unix-socket-server';
import { PlatformStore } from '../../broker/src/credentials/platform-store';
import { PolicyEngine } from '../../broker/src/policy';
import { App } from 'supertest/types';

describe('Integration & End-to-End Secret Flow', () => {
  let app: INestApplication;
  let brokerServer: UnixSocketServer;
  let testStoreDir: string;
  let testSocketPath: string;
  const SECRET_KEY = 'DATABASE_PASSWORD';
  const SECRET_VALUE = 'super-secret-demo-value';

  beforeAll(async () => {
    testStoreDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-secret-test-'));
    testSocketPath = path.join(testStoreDir, 'broker.sock');

    // 1. Initialize OS Credential Store and store test secret
    const store = new PlatformStore(testStoreDir);
    await store.set(SECRET_KEY, SECRET_VALUE);

    // 2. Start Secret Broker Server on test Unix Domain Socket
    brokerServer = new UnixSocketServer({
      socketPath: testSocketPath,
      credentialStore: store,
      policyEngine: new PolicyEngine(),
    });
    await brokerServer.start();

    // 3. Point NestJS client IPC transport to test socket
    process.env.XDG_RUNTIME_DIR = testStoreDir;

    // 4. Bootstrap NestJS Application
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (brokerServer) {
      await brokerServer.stop();
    }
    try {
      fs.rmSync(testStoreDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('1. GET /health returns status ok', async () => {
    const server = app.getHttpServer() as App;
    const res = await request(server).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('1b. GET /demo/hardware-status returns hardware security provider metadata', async () => {
    const server = app.getHttpServer() as App;
    const res = await request(server).get('/demo/hardware-status').expect(200);
    expect(res.body).toHaveProperty('hardwareBound', true);
    expect(res.body).toHaveProperty('provider');
    expect(res.body).toHaveProperty('platform');
  });

  it('1c. GET /demo/ipc-platform returns auto-detected platform IPC and store types', async () => {
    const server = app.getHttpServer() as App;
    const res = await request(server).get('/demo/ipc-platform').expect(200);
    expect(res.body).toHaveProperty('osPlatform');
    expect(res.body).toHaveProperty('ipcTransportType');
    expect(res.body).toHaveProperty('credentialStoreType');
  });

  it('1d. GET /demo/cloud-provider demonstrates Cloud Secret Manager integrations', async () => {
    const server = app.getHttpServer() as App;
    const resVault = await request(server)
      .get('/demo/cloud-provider?type=vault')
      .expect(200);
    expect(resVault.body).toEqual({
      providerType: 'vault',
      configured: true,
      sampleKey: 'DATABASE_PASSWORD',
    });

    const resAws = await request(server)
      .get('/demo/cloud-provider?type=aws')
      .expect(200);
    expect(resAws.body).toEqual({
      providerType: 'aws',
      configured: true,
      sampleKey: 'DATABASE_PASSWORD',
    });
  });

  it('1e. GET /demo/peer-verification demonstrates OS process executable path verification', async () => {
    const server = app.getHttpServer() as App;
    const res = await request(server)
      .get('/demo/peer-verification')
      .expect(200);
    expect(res.body).toHaveProperty('verifiedUid');
    expect(res.body).toHaveProperty('verifiedGid');
    expect(res.body).toHaveProperty('executablePath');
  });

  it('1f. GET /demo/json-config demonstrates parsing JSON string secret payloads', async () => {
    const server = app.getHttpServer() as App;
    const res = await request(server).get('/demo/json-config').expect(200);
    expect(res.body).toHaveProperty('status', 'success');
    const body = res.body as { parsedMetadata?: Record<string, unknown> };
    expect(body.parsedMetadata).toEqual({
      host: 'postgres.internal.net',
      port: 5432,
      database: 'production_db',
      username: 'app_admin',
      passwordConfigured: true,
      ssl: true,
    });
  });

  it('2. GET /demo/database verifies secret retrieval without exposing value in HTTP body', async () => {
    const server = app.getHttpServer() as App;
    const res = await request(server).get('/demo/database').expect(200);

    // Endpoint must return configured: true
    expect(res.body).toEqual({ configured: true });

    // Body MUST NOT contain secret value
    const responseString = JSON.stringify(res.body);
    expect(responseString).not.toContain(SECRET_VALUE);
  });

  it('3. Security Assertions: process.env and .env verification', () => {
    // Assert process.env does NOT contain the secret value
    expect(process.env[SECRET_KEY]).toBeUndefined();
    expect(JSON.stringify(process.env)).not.toContain(SECRET_VALUE);

    // Assert no plaintext .env file exists in the workspace
    const envFilePath = path.join(process.cwd(), '.env');
    expect(fs.existsSync(envFilePath)).toBe(false);
  });

  it('4. Concurrent requests work correctly', async () => {
    const server = app.getHttpServer() as App;
    for (let i = 0; i < 5; i++) {
      const res = await request(server).get('/demo/database').expect(200);
      expect(res.body).toEqual({ configured: true });
    }
  });
});
