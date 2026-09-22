import { describe, expect, it } from "vitest";
import {
  playableDifficulties,
  playableInstruments,
} from "./songParts";

const CATALOG = [
  "FiveFretGuitar",
  "FiveFretBass",
  "Keys",
  "Vocals",
] as const;

const DIFFS = ["Easy", "Medium", "Hard", "Expert", "ExpertPlus"] as const;

describe("guest song part options", () => {
  it("hides instruments the song does not have", () => {
    expect(
      playableInstruments(
        { instruments: ["Vocals", "FiveFretGuitar"] },
        CATALOG,
      ),
    ).toEqual(["FiveFretGuitar", "Vocals"]);
  });

  it("hides difficulties the selected part does not have", () => {
    expect(
      playableDifficulties(
        {
          instruments: ["FiveFretGuitar"],
          chartDiffs: { FiveFretGuitar: ["Hard", "Expert"] },
        },
        "FiveFretGuitar",
        DIFFS,
      ),
    ).toEqual(["Hard", "Expert"]);
  });
});
