import { describe, expect, it } from "vitest";
import { DEFAULT_EVENT_FLAGS } from "../types.js";

describe("event flags", () => {
  it("defaults test bots off so event nights stay human-only", () => {
    expect(DEFAULT_EVENT_FLAGS.addTestBots).toBe(false);
    expect(DEFAULT_EVENT_FLAGS.hotMic).toBe(true);
    expect(DEFAULT_EVENT_FLAGS.noFail).toBe(true);
    expect(DEFAULT_EVENT_FLAGS.noMute).toBe(true);
  });
});
