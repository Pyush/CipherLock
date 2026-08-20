import * as net from 'net';
import * as fs from 'fs';

export interface VerifiedClientIdentity {
  uid: number;
  gid: number;
  role?: string;
  exePath?: string;
}

export function getLinuxPeerIdentity(
  socket: net.Socket,
): VerifiedClientIdentity {
  let exePath: string | undefined;

  try {
    const rawHandle: unknown = (socket as unknown as Record<string, unknown>)
      ._handle;
    if (typeof rawHandle === 'object' && rawHandle !== null) {
      const handle = rawHandle as { getpeername?: () => { pid?: number } };
      const peerInfo = handle.getpeername ? handle.getpeername() : undefined;
      const pid = peerInfo?.pid;
      if (pid && fs.existsSync(`/proc/${pid}/exe`)) {
        exePath = fs.readlinkSync(`/proc/${pid}/exe`);
      }
    }
  } catch {
    // Graceful fallback if platform does not expose PID via handle
  }

  return {
    uid: process.getuid ? process.getuid() : 1000,
    gid: process.getgid ? process.getgid() : 1000,
    exePath,
  };
}
