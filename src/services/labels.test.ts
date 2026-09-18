import { describe, expect, it } from "vitest";
import { instrumentLabel, songPartChips } from "./labels.js";

describe("instrumentLabel", () => {
  it("inserts spaces and drops fret-count suffixes", () => {
    expect(instrumentLabel("FiveFretGuitar")).toBe("Five Fret Guitar");
    expect(instrumentLabel("FiveFretBass")).toBe("Five Fret Bass");
    expect(instrumentLabel("SixFretGuitar")).toBe("Six Fret Guitar");
    expect(instrumentLabel("SixFretBass")).toBe("Six Fret Bass");
    expect(instrumentLabel("ProGuitar_17")).toBe("Pro Guitar");
    expect(instrumentLabel("ProBass_17")).toBe("Pro Bass");
    expect(instrumentLabel("ProGuitar_17Fret")).toBe("Pro Guitar");
    expect(instrumentLabel("ProBass_17Fret")).toBe("Pro Bass");
    expect(instrumentLabel("ProGuitar_22Fret")).toBe("Pro Guitar");
    expect(instrumentLabel("FourLaneDrums")).toBe("Four Lane Drums");
    expect(instrumentLabel("ProDrums")).toBe("Pro Drums");
    expect(instrumentLabel("ProKeys")).toBe("Pro Keys");
    expect(instrumentLabel("Keys")).toBe("Keys");
    expect(instrumentLabel("Vocals")).toBe("Vocals");
    expect(instrumentLabel("Harmony")).toBe("Harmony");
    expect(instrumentLabel("Band")).toBe("Band");
  });

  it("lists song parts and optional 0-6 intensities", () => {
    expect(
      songPartChips({
        instruments: ["Vocals", "FiveFretGuitar", "ProGuitar_17Fret"],
        diffs: {},
      }).map((p) => `${p.label}${p.intensity == null ? "" : ` ${p.intensity}`}`),
    ).toEqual(["Five Fret Guitar", "Pro Guitar", "Vocals"]);
    expect(
      songPartChips({
        instruments: ["FiveFretGuitar", "Vocals"],
        diffs: { FiveFretGuitar: 4, Vocals: 5 },
      }).map((p) => `${p.label} ${p.intensity}`),
    ).toEqual(["Five Fret Guitar 4", "Vocals 5"]);
  });
});
