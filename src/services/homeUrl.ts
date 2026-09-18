/** Origin homepage URL encoded into YAQ and in-game join QR codes. */
export function publicHomeUrl(
  raw: string | undefined | null,
  fallbacks: string[] = [],
): string {
  const candidates = [String(raw ?? "").trim(), ...fallbacks].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      return `${url.origin}/`;
    } catch {
      continue;
    }
  }
  return "http://127.0.0.1:3000/";
}
