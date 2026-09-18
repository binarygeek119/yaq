import { describe, expect, it } from "vitest";
import { guestLabelForIp, normalizeClientIp } from "./ip.js";

describe("client IP identity", () => {
  it("normalizes IPv4-mapped and loopback addresses", () => {
    expect(normalizeClientIp("::ffff:192.168.5.42")).toBe("192.168.5.42");
    expect(normalizeClientIp("::1")).toBe("127.0.0.1");
    expect(normalizeClientIp("192.168.5.42")).toBe("192.168.5.42");
    expect(normalizeClientIp("fe80::1%eth0")).toBe("fe80::1");
    expect(normalizeClientIp("")).toBe("");
  });

  it("builds a short guest label from the last IPv4 octet", () => {
    expect(guestLabelForIp("192.168.5.42")).toBe("Guest 42");
    expect(guestLabelForIp("10.0.0.7")).toBe("Guest 7");
  });
});
