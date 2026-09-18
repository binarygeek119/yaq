import { describe, expect, it } from "vitest";
import { publicHomeUrl } from "./homeUrl.js";

describe("publicHomeUrl", () => {
  it("strips paths so QR codes land on the homepage", () => {
    expect(publicHomeUrl("http://192.168.5.158:3000/queue")).toBe(
      "http://192.168.5.158:3000/",
    );
    expect(publicHomeUrl("http://192.168.5.158:3000")).toBe(
      "http://192.168.5.158:3000/",
    );
  });

  it("falls back to the first LAN URL", () => {
    expect(publicHomeUrl("", ["http://192.168.5.158:3000"])).toBe(
      "http://192.168.5.158:3000/",
    );
  });

  it("ignores non-http values", () => {
    expect(publicHomeUrl("not a url", ["http://127.0.0.1:3000/admin"])).toBe(
      "http://127.0.0.1:3000/",
    );
  });
});
