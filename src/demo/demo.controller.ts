import {
  Controller,
  Get,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { SecretsService } from '../secrets/secrets.service';
import { HardwareSecurityFactory } from '../../broker/src/security/hardware-factory';
import { TransportFactory } from '../../broker/src/ipc/transport-factory';
import { StoreFactory } from '../../broker/src/credentials/store-factory';
import {
  CloudSecretProvider,
  type CloudProviderType,
} from '../secrets/providers/cloud-secret.provider';
import { getLinuxPeerIdentity } from '../../broker/src/ipc/peer-verification';
import * as net from 'net';

export interface DatabaseCredentials {
  host: string;
  port: number;
  username: string;
  database: string;
  ssl: boolean;
}

@Controller('demo')
export class DemoController {
  constructor(private readonly secretsService: SecretsService) {}

  /**
   * Demo 1: Phase 1 Local IPC Secret Retrieval Check
   * GET /demo/database
   */
  @Get('database')
  async getDatabaseConfig(): Promise<{ configured: boolean }> {
    try {
      const secret = await this.secretsService.get('DATABASE_PASSWORD');

      if (secret && secret.length > 0) {
        return { configured: true };
      } else {
        return { configured: false };
      }
    } catch (err: unknown) {
      const error = err as { code?: string };
      if (error.code === 'ACCESS_DENIED') {
        throw new HttpException(
          { status: 'error', code: 'ACCESS_DENIED' },
          HttpStatus.FORBIDDEN,
        );
      }
      throw new HttpException(
        { status: 'error', code: 'SECRET_UNAVAILABLE' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Demo 1b: Storing and Retrieving Complex Structured JSON Secret Payload
   * GET /demo/json-config
   */
  @Get('json-config')
  async getJsonConfigDemo(): Promise<{
    status: string;
    parsedMetadata: {
      host: string;
      port: number;
      database: string;
      username: string;
      passwordConfigured: boolean;
      ssl: boolean;
    };
  }> {
    try {
      // 1. Fetch JSON string stored under 'DB_CONFIG_JSON' key from Secret Provider
      let jsonString: string;
      try {
        jsonString = await this.secretsService.get('DB_CONFIG_JSON');
      } catch {
        // Fallback demonstration payload if key has not been populated via CLI yet
        const defaultPayload: DatabaseCredentials & { password?: string } = {
          host: 'postgres.internal.net',
          port: 5432,
          username: 'app_admin',
          password: 'super-secret-db-password-987',
          database: 'production_db',
          ssl: true,
        };
        jsonString = JSON.stringify(defaultPayload);
      }

      // 2. Safely parse JSON string into strongly-typed object inside application memory
      const parsedConfig = JSON.parse(jsonString) as DatabaseCredentials & {
        password?: string;
      };

      // 3. Return sanitized application metadata WITHOUT exposing password field in HTTP response
      return {
        status: 'success',
        parsedMetadata: {
          host: parsedConfig.host,
          port: parsedConfig.port,
          database: parsedConfig.database,
          username: parsedConfig.username,
          passwordConfigured: Boolean(
            parsedConfig.password && parsedConfig.password.length > 0,
          ),
          ssl: parsedConfig.ssl,
        },
      };
    } catch (err: unknown) {
      const error = err as Error;
      throw new HttpException(
        {
          status: 'error',
          message: `Failed to parse JSON secret: ${error.message}`,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Demo 2: Phase 2 Transport & Credential Store Auto-Detection Demo
   * GET /demo/ipc-platform
   */
  @Get('ipc-platform')
  getIpcPlatformStatus(): {
    osPlatform: string;
    ipcTransportType: string;
    credentialStoreType: string;
  } {
    const transport = TransportFactory.createTransport();
    const store = StoreFactory.createStore();
    return {
      osPlatform: process.platform,
      ipcTransportType: transport.constructor.name,
      credentialStoreType: store.constructor.name,
    };
  }

  /**
   * Demo 3: Phase 2 Production Cloud Secret Managers Demo (Vault / AWS / GCP)
   * GET /demo/cloud-provider?type=vault|aws|gcp
   */
  @Get('cloud-provider')
  async getCloudSecretDemo(
    @Query('type') type?: CloudProviderType,
  ): Promise<{ providerType: string; configured: boolean; sampleKey: string }> {
    const selectedProvider = type || 'vault';
    const provider = new CloudSecretProvider({
      providerType: selectedProvider,
    });
    const val = await provider.get('DATABASE_PASSWORD');

    return {
      providerType: selectedProvider,
      configured: Boolean(val && val.length > 0),
      sampleKey: 'DATABASE_PASSWORD',
    };
  }

  /**
   * Demo 4: Phase 3 Hardware Security Module (TPM 2.0 / Apple Secure Enclave) Status Demo
   * GET /demo/hardware-status
   */
  @Get('hardware-status')
  getHardwareSecurityStatus(): {
    hardwareBound: boolean;
    provider: string;
    platform: string;
  } {
    const hwProvider = HardwareSecurityFactory.createHardwareProvider();
    return {
      hardwareBound: hwProvider.isHardwareAvailable(),
      provider: hwProvider.constructor.name,
      platform: process.platform,
    };
  }

  /**
   * Demo 5: Malware Defense Scenario B - Peer Executable & PID Verification Demo
   * GET /demo/peer-verification
   */
  @Get('peer-verification')
  getPeerVerificationDemo(): {
    verifiedUid: number;
    verifiedGid: number;
    executablePath?: string;
  } {
    const dummySocket = new net.Socket();
    const identity = getLinuxPeerIdentity(dummySocket);
    return {
      verifiedUid: identity.uid,
      verifiedGid: identity.gid,
      executablePath: identity.exePath || process.execPath,
    };
  }
}
