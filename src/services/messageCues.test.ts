import { describe, expect, it } from "vitest";
import {
  crowdVoice,
  DEFAULT_MESSAGE_CUES,
  loseCueId,
  nextSetCueId,
  stillWaitingCueId,
} from "./messageCues.js";

describe("default message cues", () => {
  it("ships every named floor clip", () => {
    expect(DEFAULT_MESSAGE_CUES.map((cue) => cue.id)).toEqual([
      "welcome",
      "notifications",
      "nextsetofplayers",
      "nextsetofsingers",
      "emptyslots",
      "stillwaitingplayer",
      "stillwaitingplayers",
      "stillwaitingsinger",
      "stillwaitingsingers",
      "loseplayer",
      "losesinger",
      "leave",
    ]);
  });

  it("uses singer variants for all-vocal groups", () => {
    expect(crowdVoice(["Vocals", "Harmony"])).toBe("singer");
    expect(nextSetCueId(["Vocals"])).toBe("nextsetofsingers");
    expect(loseCueId(["Harmony"])).toBe("losesinger");
    expect(stillWaitingCueId(["Vocals"])).toBe("stillwaitingsinger");
    expect(stillWaitingCueId(["Vocals", "Harmony"])).toBe("stillwaitingsingers");
  });

  it("uses player variants for instruments or mixed groups", () => {
    expect(nextSetCueId(["FiveFretGuitar"])).toBe("nextsetofplayers");
    expect(stillWaitingCueId(["FiveFretBass"])).toBe("stillwaitingplayer");
    expect(stillWaitingCueId(["FiveFretGuitar", "FourLaneDrums"])).toBe(
      "stillwaitingplayers",
    );
    expect(loseCueId(["Vocals", "FiveFretGuitar"])).toBe("loseplayer");
  });
});
