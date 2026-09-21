import fs from "node:fs";
import path from "node:path";
import { getSong } from "../db.js";

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tga"];
const COVER_BASENAMES = ["album", "cover", "folder"];

function readCoverFromIni(folder: string): string | null {
  const iniPath = path.join(folder, "song.ini");
  if (!fs.existsSync(iniPath)) return null;
  try {
    const text = fs.readFileSync(iniPath, "utf8");
    const match = text.match(/^\s*cover\s*=\s*(.+)\s*$/im);
    if (!match) return null;
    const value = match[1].trim().replace(/^["']|["']$/g, "");
    if (!value || value.toLowerCase() === "none") return null;
    const candidate = path.isAbsolute(value) ? value : path.join(folder, value);
    return fs.existsSync(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function findNamedImage(folder: string, base: string): string | null {
  if (!fs.existsSync(folder)) return null;
  const wanted = new Set(
    IMAGE_EXTENSIONS.map((ext) => `${base}${ext}`.toLowerCase()),
  );
  try {
    for (const name of fs.readdirSync(folder)) {
      if (wanted.has(name.toLowerCase())) {
        return path.join(folder, name);
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** Resolve album art path for a song hash (INI / folder songs). */
export function resolveCoverPath(hash: string): string | null {
  const song = getSong(hash);
  if (!song?.folderPath) return null;
  const folder = song.folderPath;
  if (!fs.existsSync(folder)) return null;

  const fromIni = readCoverFromIni(folder);
  if (fromIni) return fromIni;

  for (const base of COVER_BASENAMES) {
    const found = findNamedImage(folder, base);
    if (found) return found;
  }

  return null;
}

export function coverContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".bmp":
      return "image/bmp";
    case ".tga":
      return "image/targa";
    default:
      return "image/png";
  }
}
