import * as os from 'os';
import { CredentialStore } from './credential-store';
import { PlatformStore } from './platform-store';
import { WindowsDpapiStore } from './windows-dpapi-store';

export class StoreFactory {
  public static createStore(customStorageDir?: string): CredentialStore {
    if (os.platform() === 'win32') {
      return new WindowsDpapiStore(customStorageDir);
    }
    return new PlatformStore(customStorageDir);
  }
}
