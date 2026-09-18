import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findYargBinary, probeYargPlacement } from "./placement.js";

function makeHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "yaq-placement-"));
}

describe("YARG placement probe", () => {
  it("reports same-machine when a YARG binary exists under YARC", () => {
    const home = makeHome();
    const bin = path.join(
      home,
      ".local/share/YARC/YARG Installs/uuid/installation/YARG",
    );
    fs.mkdirSync(path.dirname(bin), { recursive: true });
    fs.writeFileSync(bin, "fake");

    expect(findYargBinary(undefined, home)).toBe(bin);
    const probe = probeYargPlacement(undefined, home);
    expect(probe.detected).toBe("same-machine");
    expect(probe.yargPath).toBe(bin);
  });

  it("reports second-machine when no YARG install is present", () => {
    const home = makeHome();
    const probe = probeYargPlacement(undefined, home);
    expect(probe.detected).toBe("second-machine");
    expect(probe.yargPath).toBeNull();
  });

  it("accepts an explicit existing executable", () => {
    const home = makeHome();
    const bin = path.join(home, "custom", "YARG.exe");
    fs.mkdirSync(path.dirname(bin), { recursive: true });
    fs.writeFileSync(bin, "fake");
    expect(findYargBinary(bin, home)).toBe(bin);
  });
});
