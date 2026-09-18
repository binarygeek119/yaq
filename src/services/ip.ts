export function normalizeClientIp(raw: string | undefined | null): string {
  let ip = String(raw ?? "").trim();
  if (!ip) return "";
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (ip === "::1") ip = "127.0.0.1";
  const slash = ip.lastIndexOf("%");
  if (slash >= 0) ip = ip.slice(0, slash);
  return ip;
}

export function guestLabelForIp(ip: string): string {
  const parts = ip.split(".");
  if (parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p))) {
    return `Guest ${parts[3]}`;
  }
  const compact = ip.replace(/[^a-zA-Z0-9]/g, "").slice(-4);
  return `Guest ${compact || "device"}`;
}
