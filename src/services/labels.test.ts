import { describe, expect, it } from "vitest";
import { instrumentLabel } from "./labels.js";

describe("instrumentLabel", () => {
  it("inserts spaces and drops fret-count suffixes", () => {
    expect(instrumentLabel("FiveFretGuitar")).toBe("Five Fret Guitar");
    expect(instrumentLabel("FiveFretBass")).toBe("Five Fret Bass");
    expect(instrumentLabel("SixFretGuitar")).toBe("Six Fret Guitar");
    expect(instrumentLabel("SixFretBass")).toBe("Six Fret Bass");
    expect(instrumentLabel("ProGuitar_17")).toBe("Pro Guitar");
    expect(instrumentLabel("ProBass_17")).toBe("Pro Bass");
    expect(instrumentLabel("FourLaneDrums")).toBe("Four Lane Drums");
    expect(instrumentLabel("ProDrums")).toBe("Pro Drums");
    expect(instrumentLabel("ProKeys")).toBe("Pro Keys");
    expect(instrumentLabel("Keys")).toBe("Keys");
    expect(instrumentLabel("Vocals")).toBe("Vocals");
    expect(instrumentLabel("Harmony")).toBe("Harmony");
  });
});
