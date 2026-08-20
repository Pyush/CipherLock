export interface HardwareSecurityProvider {
  /**
   * Seals a master key to the hardware module (TPM 2.0 / Secure Enclave).
   */
  sealKey(plaintextKey: Buffer): Promise<Buffer>;

  /**
   * Unseals a hardware-sealed key blob. Fails if hardware PCR or device binding fails.
   */
  unsealKey(sealedBlob: Buffer): Promise<Buffer>;

  /**
   * Returns true if hardware security module is available on current system.
   */
  isHardwareAvailable(): boolean;
}
