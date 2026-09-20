import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function readPackageVersion(): string {
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.resolve(dir, "../package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
      version?: string;
    };
    if (pkg.version) return pkg.version;
  } catch {
    // Packaged builds inject the version at bundle time.
  }
  return "0.0.0";
}

/** App version from package.json (inlined by the binary bundle). */
export const YAQ_VERSION: string =
  typeof process.env.YAQ_VERSION === "string" && process.env.YAQ_VERSION
    ? process.env.YAQ_VERSION
    : readPackageVersion();
