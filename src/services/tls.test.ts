import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  certCoversHosts,
  ensureSelfSignedTls,
  subjectAltNames,
} from "./tls.js";

describe("subjectAltNames", () => {
  it("always includes localhost and loopback plus LAN IPs", () => {
    expect(subjectAltNames(["192.168.5.158"])).toEqual([
      "DNS:localhost",
      "IP:127.0.0.1",
      "IP:192.168.5.158",
    ]);
  });
});

describe("ensureSelfSignedTls", () => {
  it("writes a cert that covers the current LAN hosts", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yaq-tls-"));
    const files = ensureSelfSignedTls(["192.168.5.158"], dir);
    expect(files).not.toBeNull();
    const pem = files!.cert.toString("utf8");
    expect(certCoversHosts(pem, ["192.168.5.158"])).toBe(true);
    expect(certCoversHosts(pem, ["10.0.0.9"])).toBe(false);
    const again = ensureSelfSignedTls(["192.168.5.158"], dir);
    expect(again?.cert.equals(files!.cert)).toBe(true);
  });
});
