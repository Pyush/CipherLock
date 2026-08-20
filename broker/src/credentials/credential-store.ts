export interface CredentialStore {
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
  delete(name: string): Promise<void>;
  setMany?(entries: Record<string, string>): Promise<void>;
  deleteMany?(names: string[]): Promise<void>;
}
