import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  PROFILE_IMAGE_SIZE,
  attachProfileImage,
  clearProfileImageCache,
  profileImageFor,
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

describe("profileImageFor", () => {
  it("encodes a 64x64 PNG", () => {
    const image = profileImageFor("Josh", false);
    expect(image.imageMime).toBe("image/png");
    expect(pngDimensions(image.imagePng)).toEqual({
      width: PROFILE_IMAGE_SIZE,
      height: PROFILE_IMAGE_SIZE,
    });
  });

  it("is deterministic and cached per name + bot flag", () => {
    clearProfileImageCache();
    const first = profileImageFor("Josh", false);
    const second = profileImageFor("Josh", false);
    expect(second).toBe(first);
    expect(profileImageFor("Josh", true).imagePng).not.toBe(first.imagePng);
    expect(profileImageFor("Apprentice", false).imagePng).not.toBe(first.imagePng);
  });

  it("paints a round framed portrait instead of a full-rect fill", () => {
    const rgba = decodeRgba(profileImageFor("Master", false).imagePng);
    const corner = 0;
    const center = (32 * PROFILE_IMAGE_SIZE + 32) * 4;
    expect(rgba[corner + 3]).toBe(0);
    expect(rgba[center + 3]).toBeGreaterThan(200);
  });
});

describe("attachProfileImage", () => {
  it("copies the stream fields onto a profile row", () => {
    const row = attachProfileImage({
      slotId: "FiveFretGuitar_1",
      name: "Guitar",
      instrument: "FiveFretGuitar",
      isBot: false,
    });
    expect(row.slotId).toBe("FiveFretGuitar_1");
    expect(row.imageMime).toBe("image/png");
    expect(pngDimensions(row.imagePng).width).toBe(PROFILE_IMAGE_SIZE);
  });
});
