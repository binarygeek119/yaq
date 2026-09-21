import { deflateSync } from "node:zlib";

/** Square portraits sent over the YARG WebSocket. */
export const PROFILE_IMAGE_SIZE = 64;
export const PROFILE_IMAGE_MIME = "image/png" as const;

export type StreamProfileImage = {
  /** `data:image/png;base64,...` — YARG HUD reads this on stream players. */
  dataUrl: string;
  /** Raw base64 PNG; YARG also accepts `imageBase64` / `profileImage`. */
  imageBase64: string;
};

export type YargPlayerImageMessage = {
  playerId?: string;
  id?: string;
  name: string;
  dataUrl: string;
};

const cache = new Map<string, StreamProfileImage>();

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let crc = i;
  for (let bit = 0; bit < 8; bit++) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  CRC_TABLE[i] = crc >>> 0;
}

/** 5×7 capitals used as the portrait initial. */
const GLYPHS: Record<string, number[]> = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  J: [0b00111, 0b00001, 0b00001, 0b00001, 0b00001, 0b10001, 0b01110],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  "?": [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b00000, 0b00100],
};

export function profileImageFor(name: string, isBot = false): StreamProfileImage {
  const key = `${isBot ? "b" : "h"}:${name ?? ""}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const png = encodePng(renderAvatar(name ?? "", isBot));
  const imageBase64 = png.toString("base64");
  const image: StreamProfileImage = {
    dataUrl: `data:${PROFILE_IMAGE_MIME};base64,${imageBase64}`,
    imageBase64,
  };
  cache.set(key, image);
  return image;
}

export function streamImageFromDataUrl(dataUrl: string): StreamProfileImage {
  const comma = dataUrl.indexOf(",");
  const imageBase64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return { dataUrl, imageBase64 };
}

export function attachProfileImage<T extends { name: string; isBot?: boolean; dataUrl?: string }>(
  row: T,
): T & StreamProfileImage {
  if (row.dataUrl) {
    return { ...row, ...streamImageFromDataUrl(row.dataUrl) };
  }
  return { ...row, ...profileImageFor(row.name, Boolean(row.isBot)) };
}

export function toPlayerImageMessage(
  player: { id?: string; name: string; dataUrl?: string; isBot?: boolean },
): YargPlayerImageMessage {
  const dataUrl =
    player.dataUrl ?? profileImageFor(player.name, Boolean(player.isBot)).dataUrl;
  return {
    playerId: player.id,
    id: player.id,
    name: player.name,
    dataUrl,
  };
}

export function clearProfileImageCache(): void {
  cache.clear();
}

function renderAvatar(name: string, isBot: boolean): Buffer {
  const size = PROFILE_IMAGE_SIZE;
  const pixels = Buffer.alloc(size * size * 4);
  const hue = isBot ? 205 + (hashName(name) % 25) : hashName(name) % 360;
  const fill = hslToRgb(hue, isBot ? 0.38 : 0.48, isBot ? 0.34 : 0.28);
  const frame = isBot
    ? ([178, 224, 255, 242] as const)
    : ([255, 255, 255, 242] as const);
  const glyph = ([245, 248, 252, 255] as const);
  const radius = (size - 1) * 0.5;
  const inner = Math.max(1, radius - 4);
  const initial = portraitInitial(name);
  const rows = GLYPHS[initial] ?? GLYPHS["?"];
  const scale = 4;
  const glyphW = 5 * scale;
  const glyphH = 7 * scale;
  const originX = Math.round((size - glyphW) / 2);
  const originY = Math.round((size - glyphH) / 2);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - radius;
      const dy = y - radius;
      const distance = Math.hypot(dx, dy);
      const i = (y * size + x) * 4;
      if (distance > radius + 0.5) {
        continue;
      }
      const outerAlpha = clamp01(radius + 0.5 - distance);
      if (distance > inner) {
        const alpha = Math.round(frame[3] * outerAlpha);
        pixels[i] = frame[0];
        pixels[i + 1] = frame[1];
        pixels[i + 2] = frame[2];
        pixels[i + 3] = alpha;
        continue;
      }

      let r = fill[0];
      let g = fill[1];
      let b = fill[2];
      if (glyphAt(rows, x - originX, y - originY, scale)) {
        r = glyph[0];
        g = glyph[1];
        b = glyph[2];
      }
      const alpha = Math.round(255 * clamp01(inner + 0.5 - distance) * outerAlpha);
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = alpha;
    }
  }

  return pixels;
}

function glyphAt(rows: number[], x: number, y: number, scale: number): boolean {
  const col = Math.floor(x / scale);
  const row = Math.floor(y / scale);
  if (row < 0 || row >= 7 || col < 0 || col >= 5) return false;
  return ((rows[row] >> (4 - col)) & 1) === 1;
}

function portraitInitial(name: string): string {
  const match = name.trim().match(/[A-Za-z]/);
  return match ? match[0].toUpperCase() : "?";
}

function hashName(name: string): number {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = hue / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function encodePng(rgba: Buffer): Buffer {
  const size = PROFILE_IMAGE_SIZE;
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    const dest = y * (stride + 1);
    raw[dest] = 0;
    rgba.copy(raw, dest + 1, y * stride, y * stride + stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const payload = Buffer.concat([typeBuf, data]);
  const chunk = Buffer.alloc(8 + data.length + 4);
  chunk.writeUInt32BE(data.length, 0);
  payload.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(payload), 8 + data.length);
  return chunk;
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
