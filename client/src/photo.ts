export const PHOTO_TOO_LARGE = "Picture payload too large";
export const MAX_PROFILE_PHOTO_BYTES = 600_000;

const ATTEMPTS: Array<{ edge: number; quality: number }> = [
  { edge: 720, quality: 0.82 },
  { edge: 512, quality: 0.72 },
  { edge: 384, quality: 0.6 },
];

export function dataUrlDecodedBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return 0;
  const b64 = dataUrl.slice(comma + 1).replace(/\s/g, "");
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

export function photoUploadError(err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  if (/too large|payload too large/i.test(msg)) return PHOTO_TOO_LARGE;
  return msg || "Could not save that photo";
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read that photo"));
    reader.readAsDataURL(file);
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read that photo"));
    img.src = url;
  });
}

function encodeJpeg(
  img: HTMLImageElement,
  maxEdge: number,
  quality: number,
): string {
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height, 1));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read that photo");
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

export async function prepareProfilePhoto(file: File): Promise<string> {
  if (file.type && !file.type.startsWith("image/")) {
    throw new Error("Photo must be a JPEG, PNG, or WebP image");
  }
  const raw = await readFile(file);
  try {
    const img = await loadImage(raw);
    for (const attempt of ATTEMPTS) {
      const dataUrl = encodeJpeg(img, attempt.edge, attempt.quality);
      if (dataUrlDecodedBytes(dataUrl) <= MAX_PROFILE_PHOTO_BYTES) {
        return dataUrl;
      }
    }
  } catch (err) {
    if (dataUrlDecodedBytes(raw) <= MAX_PROFILE_PHOTO_BYTES) return raw;
    throw err instanceof Error ? err : new Error(PHOTO_TOO_LARGE);
  }
  throw new Error(PHOTO_TOO_LARGE);
}
