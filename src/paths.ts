import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** True when running inside a @yao-pkg/pkg executable. */
export function isPackaged(): boolean {
  return Boolean((process as NodeJS.Process & { pkg?: unknown }).pkg);
}

/**
 * Project root for read-only assets (client UI).
 * Bundled entry lives in dist/, so one level up is the app root
 * (repo root in dev, /snapshot/<name> inside pkg).
 */
export function assetRoot(): string {
  return path.resolve(moduleDir, "..");
}

/**
 * Writable app root for the SQLite data directory.
 * Packaged binaries use the folder next to the executable.
 */
export function dataRoot(): string {
  if (process.env.YAQ_DATA_DIR) {
    return path.resolve(process.env.YAQ_DATA_DIR);
  }
  if (isPackaged()) {
    return path.join(path.dirname(process.execPath), "data");
  }
  return path.join(assetRoot(), "data");
}

export function clientDistRoot(): string {
  return path.join(assetRoot(), "client", "dist");
}
