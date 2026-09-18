import { describe, expect, it } from "vitest";
import {
  PHOTO_TOO_LARGE,
  dataUrlDecodedBytes,
  photoUploadError,
} from "./photo.ts";

describe("photo payload helpers", () => {
  it("counts decoded bytes from a data URL", () => {
    expect(dataUrlDecodedBytes("data:image/jpeg;base64,QQ==")).toBe(1);
  });

  it("maps oversized upload errors to Picture payload too large", () => {
    expect(photoUploadError(new Error("Payload Too Large"))).toBe(
      PHOTO_TOO_LARGE,
    );
    expect(photoUploadError(new Error("Photo is too large"))).toBe(
      PHOTO_TOO_LARGE,
    );
    expect(photoUploadError(new Error("Could not read that photo"))).toBe(
      "Could not read that photo",
    );
  });
});
