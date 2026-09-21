import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { portraitDataUrlFromFile } from "./profileMedia.js";

describe("portraitDataUrlFromFile", () => {
  it("encodes a JPEG guest photo as a data URL", () => {
    const filePath = path.join(os.tmpdir(), `yaq-portrait-${process.pid}.jpg`);
    fs.writeFileSync(filePath, Buffer.from("jpeg-bytes"));
    try {
      expect(portraitDataUrlFromFile(filePath)).toEqual({
        dataUrl: `data:image/jpeg;base64,${Buffer.from("jpeg-bytes").toString("base64")}`,
        imageBase64: Buffer.from("jpeg-bytes").toString("base64"),
      });
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it("skips WebP so YARG does not receive an unloadable portrait", () => {
    const filePath = path.join(os.tmpdir(), `yaq-portrait-${process.pid}.webp`);
    fs.writeFileSync(filePath, Buffer.from("webp-bytes"));
    try {
      expect(portraitDataUrlFromFile(filePath)).toBeNull();
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it("returns null when the file is missing", () => {
    expect(portraitDataUrlFromFile("/tmp/yaq-missing-portrait.png")).toBeNull();
    expect(portraitDataUrlFromFile(null)).toBeNull();
  });
});
