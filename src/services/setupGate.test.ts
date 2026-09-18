import { describe, expect, it } from "vitest";
import { shouldRedirectToSetup } from "./setupGate.js";

describe("shouldRedirectToSetup", () => {
  it("sends first-boot app URLs to setup", () => {
    expect(shouldRedirectToSetup("/", "")).toBe(true);
    expect(shouldRedirectToSetup("/profile", "")).toBe(true);
    expect(shouldRedirectToSetup("/queue", "")).toBe(true);
    expect(shouldRedirectToSetup("/display", "")).toBe(true);
    expect(shouldRedirectToSetup("/admin", "")).toBe(true);
  });

  it("leaves setup, API, and static files alone", () => {
    expect(shouldRedirectToSetup("/setup", "")).toBe(false);
    expect(shouldRedirectToSetup("/api/setup", "")).toBe(false);
    expect(shouldRedirectToSetup("/api/state", "")).toBe(false);
    expect(shouldRedirectToSetup("/assets/index.js", "")).toBe(false);
    expect(shouldRedirectToSetup("/favicon.svg", "")).toBe(false);
  });

  it("does not redirect after an admin password exists", () => {
    expect(shouldRedirectToSetup("/", "secret")).toBe(false);
    expect(shouldRedirectToSetup("/queue", "secret")).toBe(false);
  });
});
