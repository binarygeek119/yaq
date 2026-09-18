import { describe, expect, it } from "vitest";
import {
  DEFAULT_HTTPS_PORT,
  httpsLanOrigin,
  httpsListenPort,
  lanAddresses,
  yargLanBridgeUrl,
} from "./lanUrls.js";

describe("httpsListenPort", () => {
  it("defaults to 3443 next to HTTP 3000", () => {
    expect(httpsListenPort(3000, undefined)).toBe(DEFAULT_HTTPS_PORT);
  });

  it("honors YAQ_HTTPS_PORT and avoids colliding with HTTP", () => {
    expect(httpsListenPort(3000, "8443")).toBe(8443);
    expect(httpsListenPort(3443, undefined)).toBe(3444);
  });
});

describe("lanAddresses", () => {
  it("lists HTTPS before HTTP so QR codes prefer a secure origin", () => {
    expect(lanAddresses(3000, 3443, ["192.168.5.158"])).toEqual([
      "https://192.168.5.158:3443",
      "http://192.168.5.158:3000",
    ]);
  });

  it("omits HTTPS when that port is not bound", () => {
    expect(lanAddresses(3000, null, ["10.0.0.4"])).toEqual([
      "http://10.0.0.4:3000",
    ]);
  });
});

describe("yargLanBridgeUrl", () => {
  it("keeps YARG on plaintext ws to the HTTP port", () => {
    expect(yargLanBridgeUrl(3000, ["192.168.5.158"])).toBe(
      "ws://192.168.5.158:3000/ws?role=yarg",
    );
  });
});

describe("httpsLanOrigin", () => {
  it("returns the first https origin", () => {
    expect(
      httpsLanOrigin([
        "https://192.168.5.158:3443",
        "http://192.168.5.158:3000",
      ]),
    ).toBe("https://192.168.5.158:3443");
    expect(httpsLanOrigin(["http://192.168.5.158:3000"])).toBeUndefined();
  });
});
