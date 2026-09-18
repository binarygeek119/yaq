/** First-run: no admin password yet, send the app to /setup. */
export function shouldRedirectToSetup(
  url: string,
  adminPassword: string | undefined | null,
): boolean {
  if (adminPassword) return false;
  const path = url.split("?")[0] ?? "";
  if (path === "/setup") return false;
  if (path.startsWith("/api") || path.startsWith("/ws")) return false;
  if (path.startsWith("/assets") || path.startsWith("/yarg-icons")) return false;
  if (/\.(js|css|map|svg|png|ico|woff2?|ttf|webp)$/i.test(path)) return false;
  return true;
}
