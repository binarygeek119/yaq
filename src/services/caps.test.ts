import { describe, expect, it } from "vitest";
import { capForInstrument, capGroupId, countUsed, addUsed } from "./caps.js";

describe("shared instrument caps", () => {
  it("maps 5-fret guitar and bass to one group", () => {
    expect(capGroupId("FiveFretGuitar")).toBe("FiveFret");
    expect(capGroupId("FiveFretBass")).toBe("FiveFret");
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

  it("counts guitar and bass against the same used pool", () => {
    const used = new Map<string, number>();
    addUsed(used, "FiveFretGuitar");
    expect(countUsed(used, "FiveFretBass")).toBe(1);
  });
});
