import { describe, expect, it } from "vitest";
import { mergeInstrumentDefaults, parseInstrumentDefaults } from "./profileFields.js";
import { parsePhotoDataUrl } from "./profileMedia.js";

const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("instrument defaults", () => {
  it("keeps valid per-instrument difficulties", () => {
    expect(
      parseInstrumentDefaults({ Vocals: "Easy", FiveFretGuitar: "ExpertPlus" }),
    ).toEqual({ Vocals: "Easy", FiveFretGuitar: "ExpertPlus" });
  });

  it("drops unknown instruments and difficulties", () => {
    expect(
      parseInstrumentDefaults({ Vocals: "Insane", Nope: "Expert" }),
    ).toEqual({});
  });

  it("merges patches onto stored defaults", () => {
    expect(
      mergeInstrumentDefaults({ Vocals: "Easy" }, { Keys: "Hard", Vocals: "Medium" }),
    ).toEqual({ Vocals: "Medium", Keys: "Hard" });
  });
});

describe("profile photo", () => {
  it("accepts a PNG data URL", () => {
    const parsed = parsePhotoDataUrl(PNG_1PX);
    expect(parsed.ext).toBe("png");
    expect(parsed.bytes.length).toBeGreaterThan(10);
  });

  it("rejects oversized photos", () => {
    const bytes = Buffer.alloc(600_001, 1);
    const url = `data:image/jpeg;base64,${bytes.toString("base64")}`;
    expect(() => parsePhotoDataUrl(url)).toThrow(/Picture payload too large/);
  });
});
