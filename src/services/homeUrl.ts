/** Origin homepage URL encoded into YAQ and in-game join QR codes. */
export function publicHomeUrl(
  raw: string | undefined | null,
  fallbacks: string[] = [],
): string {
  const parsed: string[] = [];
  for (const candidate of [String(raw ?? "").trim(), ...fallbacks]) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      parsed.push(`${url.origin}/`);
    } catch {
      continue;
    }
  }
  const explicit = String(raw ?? "").trim();
  if (explicit) {
    const first = parsed[0];
    if (first) return first;
  }
  const https = parsed.find((url) => url.startsWith("https:"));
  return https ?? parsed[0] ?? "http://127.0.0.1:3000/";
}
