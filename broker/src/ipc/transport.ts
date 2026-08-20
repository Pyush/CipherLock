import { BrokerRequest, BrokerResponse } from '../protocol';

export interface BrokerTransport {
  request(message: BrokerRequest): Promise<BrokerResponse>;
}
