import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { yarcDataRoots } from "./placement.js";

const YARGSONG_HEADER = 24;
const METADATA_PREFIX = 64 * 1024;

function i32(n: number): number {
  return n | 0;
}

/** Decrypt the YARGSONG wrapper used by official setlist files. */
export function decryptYargSongPrefix(
  buf: Buffer,
  length = METADATA_PREFIX,
): Buffer | null {
  if (buf.length < YARGSONG_HEADER) return null;
  if (buf.subarray(0, 8).toString("latin1") !== "YARGSONG") return null;

  let z = buf[8];
  z = i32(z + 1679);
  const w = i32((z ^ 4) - i32(z * 2));
  const n = i32(i32(25 * w) - 5);
  let x = i32((w + (z << 1)) ^ 4);
  let l = i32(i32(n + 73) * i32(n + 23));
  l = i32(l - i32(i32(n * n) + i32(96 * n)));
  x = i32(i32(i32(-l) + n) + x - i32(w * 25));

  const setb = buf.subarray(9, 24);
  x = (x + 5) % 255;
  const values = [0, 0, 0, 0];
  let j = 0;
  for (let i = 0; i < 24; i += 1) {
    values[0] = i32(values[0] + ((setb[j % 15] + i * 3298 + 88903) & 0xff));
    values[1] = i32(values[1] - setb[(j + 7001) % 15]);
    values[2] = i32(values[2] + setb[j % 15]);
    values[3] = i32(values[3] + (j << 2));
    j += x;
  }

  const a = values[0];
  const b = values[1];
  const c = values[2];
  const payload = buf.subarray(
    YARGSONG_HEADER,
    YARGSONG_HEADER + Math.min(length, buf.length - YARGSONG_HEADER),
  );
  const out = Buffer.allocUnsafe(payload.length);
  for (let i = 0; i < payload.length; i += 1) {
    out[i] = ((payload[i] - i32(i * c) - b) ^ a) & 0xff;
  }
  return out;
}

function readI32(buf: Buffer, offset: number): number {
  return buf.readInt32LE(offset);
}

function readI64(buf: Buffer, offset: number): bigint {
  return buf.readBigInt64LE(offset);
}

function readU64(buf: Buffer, offset: number): bigint {
  return buf.readBigUInt64LE(offset);
}

/**
 * Parse the key/value metadata block that follows the 6-byte magic in a
 * decrypted YARGSONG / SNG payload.
 */
export function parseDecryptedYargMetadata(
  plain: Buffer,
): Record<string, string> | null {
  if (plain.length < 6 + 4 + 16 + 16) return null;
  let off = 6;
  off += 4; // version
  off += 16; // sng mask keys
  if (off + 16 > plain.length) return null;
  const metaLenField = Number(readI64(plain, off));
  off += 8;
  const numPairs = Number(readU64(plain, off));
  off += 8;
  if (!Number.isFinite(numPairs) || numPairs < 1 || numPairs > 400) return null;
  const length = metaLenField - 8;
  if (!Number.isFinite(length) || length < 8 || off + length > plain.length) {
    return null;
  }
  const blob = plain.subarray(off, off + length);
  let pos = 0;
  const fields: Record<string, string> = {};
  for (let i = 0; i < numPairs; i += 1) {
    if (pos + 4 > blob.length) return null;
    const keyLen = readI32(blob, pos);
    pos += 4;
    if (keyLen < 0 || pos + keyLen + 4 > blob.length) return null;
    const key = blob.subarray(pos, pos + keyLen).toString("utf8");
    pos += keyLen;
    const valLen = readI32(blob, pos);
    pos += 4;
    if (valLen < 0 || pos + valLen > blob.length) return null;
    fields[key] = blob.subarray(pos, pos + valLen).toString("utf8");
    pos += valLen;
  }
  return fields;
}

export function readYargSongFields(
  filePath: string,
): Record<string, string> | null {
  try {
    const buf = fs.readFileSync(filePath);
    const plain = decryptYargSongPrefix(buf);
    if (!plain) return null;
    return parseDecryptedYargMetadata(plain);
  } catch {
    return null;
  }
}

export function yargSettingsPaths(home = os.homedir()): string[] {
  const channels = ["dev", "nightly", "release"];
  const bases = [
    path.join(home, ".config/unity3d/YARC/YARG"),
    path.join(home, "Library/Application Support/unity.YARC.YARG"),
    path.join(home, "AppData/LocalLow/YARC/YARG"),
  ];
  if (process.env.LOCALAPPDATA) {
    bases.push(
      path.join(path.dirname(process.env.LOCALAPPDATA), "LocalLow/YARC/YARG"),
    );
  }
  const files: string[] = [];
  for (const base of bases) {
    for (const channel of channels) {
      files.push(path.join(base, channel, "settings.json"));
    }
  }
  return files;
}

export function yargSongFolderRoots(home = os.homedir()): string[] {
  const roots = new Set<string>();
  for (const file of yargSettingsPaths(home)) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
        SongFolders?: unknown;
      };
      if (!Array.isArray(raw.SongFolders)) continue;
      for (const folder of raw.SongFolders) {
        if (typeof folder === "string" && folder.trim() && fs.existsSync(folder)) {
          roots.add(folder.trim());
        }
      }
    } catch {
      // missing or invalid settings
    }
  }
  return [...roots];
}

export function yargSetlistSongFiles(home = os.homedir()): string[] {
  const files: string[] = [];
  for (const root of yarcDataRoots(home)) {
    const setlists = path.join(root, "Setlists");
    let uuids: string[] = [];
    try {
      uuids = fs.readdirSync(setlists);
    } catch {
      continue;
    }
    for (const uuid of uuids) {
      const installation = path.join(setlists, uuid, "installation");
      let names: string[] = [];
      try {
        names = fs.readdirSync(installation);
      } catch {
        continue;
      }
      for (const name of names) {
        if (name.toLowerCase().endsWith(".yargsong")) {
          files.push(path.join(installation, name));
        }
      }
    }
  }
  return files;
}
