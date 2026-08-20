import * as os from 'os';
import { HardwareSecurityProvider } from './hardware-provider';
import { Tpm2Provider } from './tpm-provider';
import { SecureEnclaveProvider } from './secure-enclave-provider';

export class HardwareSecurityFactory {
  public static createHardwareProvider(): HardwareSecurityProvider {
    if (os.platform() === 'darwin') {
      return new SecureEnclaveProvider();
    }
    return new Tpm2Provider();
  }
}
