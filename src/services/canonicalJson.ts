/** Stable JSON for HMAC: sorted object keys, no extra whitespace. */

export function canonicalJson(value: unknown): string {
  return write(value);
}

function write(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "boolean") return value ? "true" : "false";
  if (t === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Invalid number in export payload");
    }
    return JSON.stringify(value);
  }
  if (t === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => write(item)).join(",")}]`;
  }
  if (t === "object") {
    const rec = value as Record<string, unknown>;
    const keys = Object.keys(rec).sort();
    return `{${keys
      .filter((key) => rec[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${write(rec[key])}`)
      .join(",")}}`;
  }
  throw new Error("Unsupported value in export payload");
}
