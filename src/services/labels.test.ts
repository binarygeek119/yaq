import { describe, expect, it } from "vitest";
import {
  classicRingStyle,
  instrumentLabel,
  songDifficultyRings,
  songPartChips,
} from "./labels.js";

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

describe("classic difficulty rings", () => {
  it("matches YARG Classic fill math", () => {
    expect(classicRingStyle(false, 4)).toEqual({
      active: false,
      fill: 0,
      tone: "white",
      number: "",
    });
    expect(classicRingStyle(true, null).fill).toBe(0);
    expect(classicRingStyle(true, 0).fill).toBe(0);
    expect(classicRingStyle(true, 1).fill).toBeCloseTo(0.2);
    expect(classicRingStyle(true, 4).fill).toBeCloseTo(0.8);
    expect(classicRingStyle(true, 5)).toMatchObject({
      fill: 1,
      tone: "white",
    });
    expect(classicRingStyle(true, 6)).toEqual({
      active: true,
      fill: 1,
      tone: "red",
      number: "",
    });
  });

  it("uses YARG sidebar slot order and prefers pro over coop", () => {
    const rings = songDifficultyRings({
      instruments: [
        "FiveFretGuitar",
        "FiveFretBass",
        "ProDrums",
        "Vocals",
        "ProGuitar_17Fret",
        "Band",
      ],
      diffs: { FiveFretGuitar: 4, Vocals: 6, ProDrums: 3 },
    });
    expect(rings).toHaveLength(10);
    expect(rings[0]).toMatchObject({
      instrument: "FiveFretGuitar",
      present: true,
      intensity: 4,
    });
    expect(rings[2]).toMatchObject({ instrument: "ProDrums", present: true });
    expect(rings[4]).toMatchObject({ instrument: "Vocals", present: true, intensity: 6 });
    expect(rings[5]).toMatchObject({ present: true, icon: "realGuitar" });
    expect(rings[5].instrument.startsWith("ProGuitar")).toBe(true);
    expect(rings[6].present).toBe(false);
    expect(rings[9]).toMatchObject({ instrument: "Band", present: true });
    expect(rings.map((r) => r.icon)).toEqual([
      "guitar",
      "bass",
      "realDrums",
      "keys",
      "vocals",
      "realGuitar",
      "rhythm",
      "eliteDrums",
      "realKeys",
      "band",
    ]);
  });

  it("uses the harmony mic icon when the song has harmony", () => {
    const rings = songDifficultyRings({
      instruments: ["Vocals", "Harmony"],
      diffs: {},
    });
    expect(rings[4].icon).toBe("harmVocals");
  });
});
