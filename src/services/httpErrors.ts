export const PICTURE_PAYLOAD_TOO_LARGE = "Picture payload too large";

export function bodyTooLargeMessage(url: string): string {
  const path = (url.split("?")[0] ?? url).replace(/\/+$/, "") || "/";
  if (path === "/api/profile" || path.startsWith("/api/profile/")) {
    return PICTURE_PAYLOAD_TOO_LARGE;
  }
  return "Request is too large";
}

export function isBodyTooLargeError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const rec = err as { code?: string; statusCode?: number };
  return rec.code === "FST_ERR_CTP_BODY_TOO_LARGE" || rec.statusCode === 413;
}
