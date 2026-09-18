import { describe, expect, it } from "vitest";
import {
  httpsLanOrigin,
  testNotifyStatus,
  toHttpsPageUrl,
} from "./notifications.ts";

describe("testNotifyStatus", () => {
  it("points HTTP pages at the HTTPS LAN URL", () => {
    expect(
      testNotifyStatus({
        os: false,
        permission: "denied",
        secureContext: false,
        httpsUrl: "https://192.168.5.158:3443/admin",
      }),
    ).toBe(
      "Open https://192.168.5.158:3443/admin for system notifications. Chrome blocks them on plain HTTP. In-app test alert is shown.",
    );
  });

  it("asks to reset permission when the secure origin already denied", () => {
    expect(
      testNotifyStatus({
        os: false,
        permission: "denied",
        secureContext: true,
      }),
    ).toContain("Reset the permission");
  });

  it("reports a system popup when one was shown", () => {
    expect(
      testNotifyStatus({
        os: true,
        permission: "granted",
        secureContext: true,
      }),
    ).toBe("Test notification sent.");
  });
});

describe("https helpers", () => {
  it("picks the https origin and keeps the current path", () => {
    expect(
      httpsLanOrigin([
        "https://192.168.5.158:3443",
        "http://192.168.5.158:3000",
      ]),
    ).toBe("https://192.168.5.158:3443");
    expect(
      toHttpsPageUrl("https://192.168.5.158:3443", {
        pathname: "/admin",
        search: "",
        hash: "",
      }),
    ).toBe("https://192.168.5.158:3443/admin");
  });
});
