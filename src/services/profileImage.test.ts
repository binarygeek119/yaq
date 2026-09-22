import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  PROFILE_IMAGE_SIZE,
  attachProfileImage,
  clearProfileImageCache,
  profileImageFor,
  toPlayerImageMessage,
} from "./profileImage.js";

function pngDimensions(base64: string): { width: number; height: number } {
  const buf = Buffer.from(base64, "base64");
  expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

function decodeRgba(base64: string): Buffer {
  const buf = Buffer.from(base64, "base64");
  const idat = extractChunk(buf, "IDAT");
  const raw = inflateSync(idat);
  const size = PROFILE_IMAGE_SIZE;
  const stride = size * 4;
  const rgba = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    const src = y * (stride + 1);
    expect(raw[src]).toBe(0);
    raw.copy(rgba, y * stride, src + 1, src + 1 + stride);
  }
  return rgba;
}

function extractChunk(png: Buffer, type: string): Buffer {
  let offset = 8;
  const parts: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const chunkType = png.subarray(offset + 4, offset + 8).toString("ascii");
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (chunkType === type) parts.push(data);
    offset += 12 + length;
  }
  return Buffer.concat(parts);
}

function pngFromDataUrl(dataUrl: string): string {
  expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  return dataUrl.slice("data:image/png;base64,".length);
}

describe("profileImageFor", () => {
  it("encodes a 64x64 PNG data URL", () => {
    const image = profileImageFor("Josh", false);
    expect(image.imageBase64).toBe(pngFromDataUrl(image.dataUrl));
    expect(pngDimensions(image.imageBase64)).toEqual({
      width: PROFILE_IMAGE_SIZE,
      height: PROFILE_IMAGE_SIZE,
    });
  });

  it("is deterministic and cached per name + bot flag", () => {
    clearProfileImageCache();
    const first = profileImageFor("Josh", false);
    const second = profileImageFor("Josh", false);
    expect(second).toBe(first);
    expect(profileImageFor("Josh", true).dataUrl).not.toBe(first.dataUrl);
    expect(profileImageFor("Apprentice", false).dataUrl).not.toBe(first.dataUrl);
  });

  it("paints a round framed portrait instead of a full-rect fill", () => {
    const rgba = decodeRgba(profileImageFor("Master", false).imageBase64);
    const corner = 0;
    const center = (32 * PROFILE_IMAGE_SIZE + 32) * 4;
    expect(rgba[corner + 3]).toBe(0);
    expect(rgba[center + 3]).toBeGreaterThan(200);
  });
});

describe("attachProfileImage", () => {
  it("copies dataUrl onto a profile row", () => {
    const row = attachProfileImage({
      slotId: "guitar_01",
      name: "guitar_01",
      instrument: "FiveFretGuitar",
      isBot: false,
    });
    expect(row.slotId).toBe("guitar_01");
    expect(row.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
    expect(pngDimensions(row.imageBase64).width).toBe(PROFILE_IMAGE_SIZE);
  });

  it("keeps a guest JPEG dataUrl instead of replacing it with initials", () => {
    const dataUrl = "data:image/jpeg;base64,QQ==";
    const row = attachProfileImage({
      id: "r1",
      name: "Josh",
      isBot: false,
      dataUrl,
    });
    expect(row.dataUrl).toBe(dataUrl);
    expect(row.imageBase64).toBe("QQ==");
  });
});

describe("toPlayerImageMessage", () => {
  it("uses playerId and dataUrl for the dedicated stream message", () => {
    const attached = attachProfileImage({
      id: "abc",
      name: "Josh",
      isBot: false,
    });
    expect(toPlayerImageMessage(attached)).toEqual({
      playerId: "abc",
      id: "abc",
      name: "Josh",
      dataUrl: attached.dataUrl,
    });
  });
});
