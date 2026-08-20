import { Injectable, Optional, Inject } from '@nestjs/common';
import type { SecretProvider } from '../secret-provider';
import type { BrokerTransport } from '../../../broker/src/ipc/transport';
import { UnixSocketTransport } from '../../../broker/src/ipc/unix-socket-client';
import {
  CURRENT_PROTOCOL_VERSION,
  BrokerError,
  BrokerErrorCode,
} from '../../../broker/src/protocol';

@Injectable()
export class BrokerSecretProvider implements SecretProvider {
  private readonly transport: BrokerTransport;

  constructor(
    @Optional() @Inject('BROKER_TRANSPORT') transport?: BrokerTransport,
  ) {
    this.transport = transport || new UnixSocketTransport();
  }

  async get(name: string): Promise<string> {
    let response;
    try {
      response = await this.transport.request({
        version: CURRENT_PROTOCOL_VERSION,
        operation: 'get',
        secret: name,
      });
    } catch (err: any) {
      if (err instanceof BrokerError) {
        throw err;
      }
      throw new BrokerError(
        'BROKER_UNAVAILABLE',
        `Failed to reach secret broker for secret '${name}'`,
      );
    }

    if (!response.success) {
      const code: BrokerErrorCode = response.error || 'BROKER_UNAVAILABLE';
      throw new BrokerError(
        code,
        response.message || `Broker error retrieving secret '${name}'`,
      );
    }

    if (typeof response.value !== 'string') {
      throw new BrokerError(
        'INVALID_REQUEST',
        `Broker returned malformed response for secret '${name}'`,
      );
    }

    return response.value;
  }
}
