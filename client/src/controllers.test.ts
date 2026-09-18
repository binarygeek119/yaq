import { describe, expect, it } from "vitest";
import {
  CONTROLLERS,
  controllerSlugForInstrument,
  getController,
} from "./controllers.ts";

describe("controller catalog", () => {
  it("has a page for each kit with at least one image", () => {
    expect(CONTROLLERS.map((c) => c.id)).toEqual([
      "five-fret",
      "six-fret",
      "pro-guitar",
      "four-lane-drums",
      "pro-drums",
      "five-lane-drums",
      "keys",
      "vocals",
    ]);
    for (const item of CONTROLLERS) {
      expect(item.images.length).toBeGreaterThan(0);
      expect(item.play.length).toBeGreaterThan(2);
    }
  });

  it("maps YARG parts onto the matching controller page", () => {
    expect(controllerSlugForInstrument("FiveFretBass")).toBe("five-fret");
    expect(controllerSlugForInstrument("SixFretGuitar")).toBe("six-fret");
    expect(controllerSlugForInstrument("ProBass_17")).toBe("pro-guitar");
    expect(controllerSlugForInstrument("FourLaneDrums")).toBe("four-lane-drums");
    expect(controllerSlugForInstrument("ProDrums")).toBe("pro-drums");
    expect(controllerSlugForInstrument("EliteDrums")).toBe("five-lane-drums");
    expect(controllerSlugForInstrument("ProKeys")).toBe("keys");
    expect(controllerSlugForInstrument("Harmony")).toBe("vocals");
    expect(getController("pro-drums")?.title).toBe("Pro drums");
    expect(getController("nope")).toBeUndefined();
  });
});
