import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.YAQ_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "yaq-bridge-"));

type BridgeMod = typeof import("./bridge.js");
type DbMod = typeof import("../db.js");

let BridgeHub: BridgeMod["BridgeHub"];
let YARG_DISCONNECT_GRACE_MS: BridgeMod["YARG_DISCONNECT_GRACE_MS"];
let initDb: DbMod["initDb"];

function fakeSocket() {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  return {
    readyState: 1,
    OPEN: 1,
    send: vi.fn(),
    on(event: string, fn: (...args: unknown[]) => void) {
      handlers[event] = fn;
    },
    close() {
      handlers.close?.();
    },
  };
}

describe("YARG disconnect grace", () => {
  beforeAll(async () => {
    const dbMod = await import("../db.js");
    const bridgeMod = await import("./bridge.js");
    initDb = dbMod.initDb;
    BridgeHub = bridgeMod.BridgeHub;
    YARG_DISCONNECT_GRACE_MS = bridgeMod.YARG_DISCONNECT_GRACE_MS;
    initDb();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps Event Mode and stream through a brief reconnect", () => {
    vi.useFakeTimers();
    const hub = new BridgeHub();
    const first = fakeSocket();
    hub.attachYarg(first as never);
    hub.eventModeEnabled = true;
    expect(hub.hasYargClient).toBe(true);
    expect(hub.yargState).toBe("idle");

    first.close();
    expect(hub.hasYargClient).toBe(true);
    expect(hub.eventModeEnabled).toBe(true);
    expect(hub.yargState).toBe("idle");
    expect(hub.yargConnected).toBe(true);

    const second = fakeSocket();
    hub.attachYarg(second as never);
    vi.advanceTimersByTime(YARG_DISCONNECT_GRACE_MS + 50);
    expect(hub.hasYargClient).toBe(true);
    expect(hub.eventModeEnabled).toBe(true);
    expect(hub.yargState).toBe("idle");
  });

  it("clears Event Mode only after the grace expires", () => {
    vi.useFakeTimers();
    const hub = new BridgeHub();
    const socket = fakeSocket();
    hub.attachYarg(socket as never);
    hub.eventModeEnabled = true;
    socket.close();

    vi.advanceTimersByTime(YARG_DISCONNECT_GRACE_MS - 100);
    expect(hub.eventModeEnabled).toBe(true);
    expect(hub.hasYargClient).toBe(true);

    vi.advanceTimersByTime(200);
    expect(hub.eventModeEnabled).toBe(false);
    expect(hub.hasYargClient).toBe(false);
    expect(hub.yargState).toBe("disconnected");
    expect(hub.yargConnected).toBe(false);
  });
});
