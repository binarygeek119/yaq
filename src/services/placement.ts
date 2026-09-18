import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type YargPlacement = "same-machine" | "second-machine";

export type PlacementProbe = {
  detected: YargPlacement;
  yargPath: string | null;
  yarcRoot: string | null;
  detail: string;
};

const BINARY_NAMES = ["YARG", "YARG.exe", "YARG.x86_64"];

export function yarcDataRoots(home = os.homedir()): string[] {
  const roots: string[] = [];
  const launcher = readLauncherDownloadLocation(home);
  if (launcher) roots.push(launcher);
  roots.push(
    path.join(home, ".local/share/YARC"),
    path.join(home, "Library/Application Support/YARC"),
  );
  if (process.env.LOCALAPPDATA) {
    roots.push(path.join(process.env.LOCALAPPDATA, "YARC"));
  } else {
    roots.push(path.join(home, "AppData/Local/YARC"));
  }
  return [...new Set(roots.filter(Boolean))];
}

function readLauncherDownloadLocation(home: string): string | null {
  const files = [
    path.join(home, ".config/in.yarg.launcher/settings.json"),
    path.join(home, "AppData/Roaming/in.yarg.launcher/settings.json"),
  ];
  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
        downloadLocation?: string;
      };
      if (raw.downloadLocation?.trim()) return raw.downloadLocation.trim();
    } catch {
      // ignore missing or invalid launcher config
    }
  }
  return null;
}

function isYargBinary(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

export function findYargBinary(
  explicitPath?: string,
  home = os.homedir(),
): string | null {
  const explicit = explicitPath?.trim();
  if (explicit && isYargBinary(explicit)) return explicit;

  for (const root of yarcDataRoots(home)) {
    const installs = path.join(root, "YARG Installs");
    let uuids: string[] = [];
    try {
      uuids = fs.readdirSync(installs);
    } catch {
      continue;
    }
    for (const uuid of uuids) {
      const installation = path.join(installs, uuid, "installation");
      for (const name of BINARY_NAMES) {
        const candidate = path.join(installation, name);
        if (isYargBinary(candidate)) return candidate;
      }
    }
  }
  return null;
}

export function probeYargPlacement(
  explicitPath?: string,
  home = os.homedir(),
): PlacementProbe {
  const yargPath = findYargBinary(explicitPath, home);
  if (yargPath) {
    return {
      detected: "same-machine",
      yargPath,
      yarcRoot: yarcRootFromBinary(yargPath),
      detail: `Found YARG on this computer at ${yargPath}`,
    };
  }
  return {
    detected: "second-machine",
    yargPath: null,
    yarcRoot: null,
    detail:
      "No YARG install found on this computer. Choose this when YAQ runs on a different machine than the game.",
  };
}

function yarcRootFromBinary(yargPath: string): string | null {
  const parts = yargPath.split(path.sep);
  const idx = parts.lastIndexOf("YARG Installs");
  if (idx <= 0) return path.dirname(yargPath);
  return parts.slice(0, idx).join(path.sep);
}
