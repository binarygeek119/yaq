import { describe, expect, it } from "vitest";
import type { NetworkInterfaceInfo } from "node:os";
import {
  DEFAULT_HTTPS_PORT,
  advertisedHosts,
  httpsLanOrigin,
  httpsListenPort,
  ipv4LanHosts,
  isGuestLanAddress,
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

describe("isGuestLanAddress", () => {
  it("keeps home Wi-Fi and lab 10.x", () => {
    expect(isGuestLanAddress("192.168.5.158")).toBe(true);
    expect(isGuestLanAddress("10.0.0.4")).toBe(true);
  });

  it("drops loopback, docker, and cloud 172.x", () => {
    expect(isGuestLanAddress("127.0.0.1")).toBe(false);
    expect(isGuestLanAddress("172.17.0.1")).toBe(false);
    expect(isGuestLanAddress("172.30.0.2")).toBe(false);
  });
});

describe("ipv4LanHosts", () => {
  const iface = (
    address: string,
    extra: Partial<NetworkInterfaceInfo> = {},
  ): NetworkInterfaceInfo =>
    ({
      address,
      netmask: "255.255.255.0",
      family: "IPv4",
      mac: "00:00:00:00:00:00",
      internal: false,
      cidr: `${address}/24`,
      ...extra,
    }) as NetworkInterfaceInfo;

  it("keeps 192.168 and skips docker plus cloud NICs", () => {
    expect(
      ipv4LanHosts({
        lo: [iface("127.0.0.1", { internal: true })],
        docker0: [iface("172.17.0.1")],
        eth0: [iface("172.30.0.2")],
        wlp2s0: [iface("192.168.5.158")],
      }),
    ).toEqual(["192.168.5.158"]);
  });

  it("is empty when the machine only has cloud or docker IPs", () => {
    expect(
      ipv4LanHosts({
        eth0: [iface("172.30.0.2")],
        docker0: [iface("172.17.0.1")],
      }),
    ).toEqual([]);
  });
});

describe("advertisedHosts", () => {
  it("always ends with loopback", () => {
    expect(advertisedHosts(["192.168.5.158"])).toEqual([
      "192.168.5.158",
      "127.0.0.1",
    ]);
    expect(advertisedHosts([])).toEqual(["127.0.0.1"]);
  });
});

describe("lanAddresses", () => {
  it("lists HTTPS before HTTP so QR codes prefer a secure origin", () => {
    expect(lanAddresses(3000, 3443, ["192.168.5.158"])).toEqual([
      "https://192.168.5.158:3443",
      "https://127.0.0.1:3443",
      "http://192.168.5.158:3000",
      "http://127.0.0.1:3000",
    ]);
  });

  it("falls back to loopback when there is no home LAN", () => {
    expect(lanAddresses(3000, 3443, [])).toEqual([
      "https://127.0.0.1:3443",
      "http://127.0.0.1:3000",
    ]);
  });

  it("omits HTTPS when that port is not bound", () => {
    expect(lanAddresses(3000, null, ["10.0.0.4"])).toEqual([
      "http://10.0.0.4:3000",
      "http://127.0.0.1:3000",
    ]);
  });
});

describe("yargLanBridgeUrl", () => {
  it("keeps YARG on plaintext ws to the HTTP port", () => {
    expect(yargLanBridgeUrl(3000, ["192.168.5.158"])).toBe(
      "ws://192.168.5.158:3000/ws?role=yarg",
    );
  });

  it("uses loopback when no guest LAN IP exists", () => {
    expect(yargLanBridgeUrl(3000, [])).toBe("ws://127.0.0.1:3000/ws?role=yarg");
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
