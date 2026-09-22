import { describe, expect, it } from "vitest";
import {
  parseChartDiffsFromSong,
  playableDifficulties,
  playableInstruments,
  songOffersDifficulty,
  songOffersInstrument,
} from "./songParts.js";

const CATALOG = [
  "FiveFretGuitar",
  "FiveFretBass",
  "FiveFretCoop",
  "ProGuitar_17",
  "Keys",
  "Vocals",
  "Harmony",
] as const;

const DIFFS = ["Easy", "Medium", "Hard", "Expert", "ExpertPlus"] as const;

describe("song part dropdowns", () => {
  it("lists only instruments the song has, including YARG aliases", () => {
    expect(
      playableInstruments(
        {
          instruments: ["FiveFretGuitar", "ProGuitar_17Fret", "Vocals"],
        },
        CATALOG,
      ),
    ).toEqual(["FiveFretGuitar", "ProGuitar_17", "Vocals"]);
    expect(
      playableInstruments(
        { diffs: { FiveFretCoopGuitar: 3, Keys: 2 } },
        CATALOG,
      ),
    ).toEqual(["FiveFretCoop", "Keys"]);
  });

  it("keeps the full catalog when the song has no part list yet", () => {
    expect(playableInstruments({ instruments: [] }, CATALOG)).toEqual([
      ...CATALOG,
    ]);
    expect(songOffersInstrument({ instruments: [] }, "Keys")).toBe(true);
  });

  it("lists only chart difficulties for the selected part", () => {
    const song = {
      instruments: ["FiveFretGuitar", "Vocals"],
      chartDiffs: {
        FiveFretGuitar: ["Easy", "Expert"],
        Vocals: ["Expert", "ExpertPlus"],
      },
    };
    expect(playableDifficulties(song, "FiveFretGuitar", DIFFS)).toEqual([
      "Easy",
      "Expert",
    ]);
    expect(playableDifficulties(song, "Vocals", DIFFS)).toEqual([
      "Expert",
      "ExpertPlus",
    ]);
    expect(songOffersDifficulty(song, "FiveFretGuitar", "Hard")).toBe(false);
    expect(songOffersDifficulty(song, "Vocals", "ExpertPlus")).toBe(true);
  });

  it("treats unknown chart diffs as all difficulties", () => {
    expect(
      playableDifficulties(
        { instruments: ["FiveFretGuitar"] },
        "FiveFretGuitar",
        DIFFS,
      ),
    ).toEqual([...DIFFS]);
  });

  it("parses chart diffs from a YARG library.sync payload", () => {
    expect(
      parseChartDiffsFromSong({
        instruments: [
          {
            name: "FiveFretBass",
            difficulties: ["medium", "hard"],
          },
        ],
        chartDiffs: { FiveFretGuitar: ["Easy", "Expert"] },
      }),
    ).toEqual({
      FiveFretGuitar: ["Easy", "Expert"],
      FiveFretBass: ["Medium", "Hard"],
    });
  });
});
