import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { dataRoot } from "../paths.js";
import { PICTURE_PAYLOAD_TOO_LARGE } from "./httpErrors.js";

export const MAX_PROFILE_PHOTO_BYTES = 600_000;

const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function avatarDir(): string {
  return path.join(dataRoot(), "avatars");
}

export function avatarPath(ip: string, ext: string): string {
  const id = createHash("sha256").update(ip).digest("hex").slice(0, 24);
  return path.join(avatarDir(), `${id}.${ext}`);
}

export function parsePhotoDataUrl(raw: string): { ext: string; bytes: Buffer } {
  const match = raw.trim().match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
  if (!match) throw new Error("Photo must be a JPEG, PNG, or WebP image");
  const ext = TYPES[match[1].toLowerCase()];
  if (!ext) throw new Error("Photo must be a JPEG, PNG, or WebP image");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length) throw new Error("Photo is empty");
  if (bytes.length > MAX_PROFILE_PHOTO_BYTES) {
    throw new Error(PICTURE_PAYLOAD_TOO_LARGE);
  }
  return { ext, bytes };
}

export function saveProfilePhoto(
  ip: string,
  dataUrl: string,
  previousExt = "",
): { photoExt: string; photoRevBump: true } {
  const { ext, bytes } = parsePhotoDataUrl(dataUrl);
  fs.mkdirSync(avatarDir(), { recursive: true });
  if (previousExt && previousExt !== ext) {
    const oldPath = avatarPath(ip, previousExt);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  fs.writeFileSync(avatarPath(ip, ext), bytes);
  return { photoExt: ext, photoRevBump: true };
}

export function clearProfilePhoto(ip: string, previousExt = ""): void {
  if (!previousExt) return;
  const filePath = avatarPath(ip, previousExt);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

/** JPEG/PNG guest photos as YARG `dataUrl`s. WebP stays on disk for the profile page. */
export function portraitDataUrlFromFile(
  filePath: string | null | undefined,
): { dataUrl: string; imageBase64: string } | null {
  if (!filePath) return null;
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) return null;
  try {
    if (!fs.existsSync(filePath)) return null;
    const imageBase64 = fs.readFileSync(filePath).toString("base64");
    if (!imageBase64) return null;
    return {
      dataUrl: `data:${mime};base64,${imageBase64}`,
      imageBase64,
    };
  } catch {
    return null;
  }
}
