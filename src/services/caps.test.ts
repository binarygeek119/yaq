import { describe, expect, it } from "vitest";
import { capForInstrument, capGroupId, countUsed, addUsed } from "./caps.js";

describe("shared instrument caps", () => {
  it("maps 5-fret guitar, bass, rhythm, and coop to one group", () => {
    expect(capGroupId("FiveFretGuitar")).toBe("FiveFret");
    expect(capGroupId("FiveFretBass")).toBe("FiveFret");
    expect(capGroupId("FiveFretRhythm")).toBe("FiveFret");
    expect(capGroupId("FiveFretCoop")).toBe("FiveFret");
  });

  it("reads a shared group key", () => {
    expect(capForInstrument("FiveFretGuitar", { FiveFret: 2 })).toBe(2);
    expect(capForInstrument("FiveFretBass", { FiveFret: 2 })).toBe(2);
  });

  it("sums legacy guitar + bass keys when the group key is missing", () => {
    expect(
      capForInstrument("FiveFretBass", {
        FiveFretGuitar: 2,
        FiveFretBass: 1,
      }),
    ).toBe(3);
  });

  it("counts rhythm and coop against the 5-fret pool", () => {
    const used = new Map<string, number>();
    addUsed(used, "FiveFretGuitar");
    expect(countUsed(used, "FiveFretRhythm")).toBe(1);
    expect(countUsed(used, "FiveFretCoop")).toBe(1);
    expect(capForInstrument("FiveFretCoop", { FiveFret: 2 })).toBe(2);
  });

  it("maps vocals and harmony to one group", () => {
    expect(capGroupId("Vocals")).toBe("Vocals");
    expect(capGroupId("Harmony")).toBe("Vocals");
    expect(capForInstrument("Harmony", { Vocals: 2 })).toBe(2);
    const used = new Map<string, number>();
    addUsed(used, "Vocals");
    expect(countUsed(used, "Harmony")).toBe(1);
  });
});
