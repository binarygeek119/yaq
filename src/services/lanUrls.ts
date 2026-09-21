import os from "node:os";

export const DEFAULT_HTTPS_PORT = 3443;
export const LOOPBACK_HOST = "127.0.0.1";

const DOCKER_IFACE =
  /^(docker\d*|br-[0-9a-f]+|cni\d*|flannel|veth|virbr|lxc|podman)/i;

/** Home/venue Wi-Fi and Ethernet: 192.168/16 and 10/8. Not cloud/docker 172.x. */
export function isGuestLanAddress(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  ) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isIpv4(entry: os.NetworkInterfaceInfo): boolean {
  return entry.family === "IPv4" || (entry.family as unknown) === 4;
}

/** IPv4 addresses phones can use. Cloud/docker NICs are skipped. */
export function ipv4LanHosts(
  nets: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces(),
): string[] {
  const hosts: string[] = [];
  const seen = new Set<string>();
  for (const [name, entries] of Object.entries(nets)) {
    if (!entries || DOCKER_IFACE.test(name)) continue;
    for (const entry of entries) {
      if (!isIpv4(entry) || entry.internal) continue;
      const ip = entry.address;
      if (!isGuestLanAddress(ip) || seen.has(ip)) continue;
      seen.add(ip);
      hosts.push(ip);
    }
  }
  return hosts;
}

/** Guest LAN IPs plus loopback so this machine can always open YAQ locally. */
export function advertisedHosts(hosts: string[] = ipv4LanHosts()): string[] {
  const ips = hosts.filter((ip) => ip && ip !== LOOPBACK_HOST);
  ips.push(LOOPBACK_HOST);
  return ips;
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
 * (required for system Notifications on phones). Loopback is always last
 * so a real 192.168/10 address wins when present.
 */
export function lanAddresses(
  httpPort: number,
  httpsPort?: number | null,
  hosts: string[] = ipv4LanHosts(),
): string[] {
  const ips = advertisedHosts(hosts);
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
  const ip = advertisedHosts(hosts)[0] ?? LOOPBACK_HOST;
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
