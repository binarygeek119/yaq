import os from "node:os";

export const DEFAULT_HTTPS_PORT = 3443;

/** IPv4 LAN addresses (not loopback). */
export function ipv4LanHosts(
  nets: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces(),
): string[] {
  const hosts: string[] = [];
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      hosts.push(entry.address);
    }
  }
  return hosts;
}

export function httpsListenPort(
  httpPort: number,
  env = process.env.YAQ_HTTPS_PORT,
): number {
  const parsed = Number(env);
  const requested =
    Number.isFinite(parsed) && parsed > 0
      ? Math.floor(parsed)
      : DEFAULT_HTTPS_PORT;
  if (requested !== httpPort) return requested;
  return httpPort === DEFAULT_HTTPS_PORT ? 3444 : DEFAULT_HTTPS_PORT;
}

/**
 * Guest-facing URLs. HTTPS first so QR codes land on a secure origin
 * (required for system Notifications on phones).
 */
export function lanAddresses(
  httpPort: number,
  httpsPort?: number | null,
  hosts: string[] = ipv4LanHosts(),
): string[] {
  const ips = hosts.length > 0 ? hosts : ["127.0.0.1"];
  const urls: string[] = [];
  if (httpsPort) {
    for (const ip of ips) urls.push(`https://${ip}:${httpsPort}`);
  }
  for (const ip of ips) urls.push(`http://${ip}:${httpPort}`);
  return urls;
}

/** YARG stays on plaintext WebSocket over the HTTP port. */
export function yargLanBridgeUrl(
  httpPort: number,
  hosts: string[] = ipv4LanHosts(),
): string {
  const ip = hosts[0] ?? "127.0.0.1";
  return `ws://${ip}:${httpPort}/ws?role=yarg`;
}

export function httpsLanOrigin(urls: string[] | undefined | null): string | undefined {
  for (const raw of urls ?? []) {
    try {
      const url = new URL(raw);
      if (url.protocol === "https:") return url.origin;
    } catch {
      continue;
    }
  }
  return undefined;
}
