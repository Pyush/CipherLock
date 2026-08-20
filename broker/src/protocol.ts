export const CURRENT_PROTOCOL_VERSION = 1;
export const MAX_REQUEST_SIZE_BYTES = 4096; // 4KB request limit

export type BrokerErrorCode =
  | 'BROKER_UNAVAILABLE'
  | 'ACCESS_DENIED'
  | 'SECRET_NOT_FOUND'
  | 'INVALID_REQUEST'
  | 'INVALID_PROTOCOL'
  | 'REQUEST_TOO_LARGE'
  | 'CREDENTIAL_STORE_ERROR';

export interface BrokerRequest {
  version: number;
  operation: 'get' | 'set' | 'delete';
  secret: string;
  value?: string;
}

export interface BrokerResponse {
  version: number;
  success: boolean;
  value?: string;
  error?: BrokerErrorCode;
  message?: string;
}

export class BrokerError extends Error {
  constructor(
    public readonly code: BrokerErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BrokerError';
  }
}

export function validateBrokerRequest(raw: unknown): BrokerRequest {
  if (typeof raw !== 'object' || raw === null) {
    throw new BrokerError(
      'INVALID_REQUEST',
      'Request payload must be a JSON object',
    );
  }

  const payload = raw as Record<string, unknown>;

  if (typeof payload.version !== 'number') {
    throw new BrokerError(
      'INVALID_PROTOCOL',
      'Missing or invalid protocol version',
    );
  }

  if (payload.version !== CURRENT_PROTOCOL_VERSION) {
    throw new BrokerError(
      'INVALID_PROTOCOL',
      `Unsupported protocol version ${payload.version}. Supported version is ${CURRENT_PROTOCOL_VERSION}`,
    );
  }

  if (
    typeof payload.operation !== 'string' ||
    !['get', 'set', 'delete'].includes(payload.operation)
  ) {
    throw new BrokerError(
      'INVALID_REQUEST',
      `Unsupported operation: ${String(payload.operation)}`,
    );
  }

  if (typeof payload.secret !== 'string' || payload.secret.trim() === '') {
    throw new BrokerError(
      'INVALID_REQUEST',
      'Secret name must be a non-empty string',
    );
  }

  // Prevent injection or path traversal attempts in secret names
  if (!/^[A-Za-z0-9_]+$/.test(payload.secret)) {
    throw new BrokerError(
      'INVALID_REQUEST',
      'Secret name contains invalid characters',
    );
  }

  if (
    payload.operation === 'set' &&
    (typeof payload.value !== 'string' || payload.value === '')
  ) {
    throw new BrokerError(
      'INVALID_REQUEST',
      'Set operation requires a non-empty string value',
    );
  }

  return {
    version: payload.version,
    operation: payload.operation as 'get' | 'set' | 'delete',
    secret: payload.secret,
    value: payload.value as string | undefined,
  };
}
