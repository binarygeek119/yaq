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
let insertRequest: DbMod["insertRequest"];
let upsertProfile: DbMod["upsertProfile"];
let profilePhotoPath: DbMod["profilePhotoPath"];

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

beforeAll(async () => {
  const dbMod = await import("../db.js");
  const bridgeMod = await import("./bridge.js");
  initDb = dbMod.initDb;
  insertRequest = dbMod.insertRequest;
  upsertProfile = dbMod.upsertProfile;
  profilePhotoPath = dbMod.profilePhotoPath;
  BridgeHub = bridgeMod.BridgeHub;
  YARG_DISCONNECT_GRACE_MS = bridgeMod.YARG_DISCONNECT_GRACE_MS;
  initDb();
});

describe("YARG disconnect grace", () => {
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

describe("Event Mode portraits", () => {
  it("sends the stored guest JPEG on set.prepare and player.images", () => {
    upsertProfile({
      ip: "192.168.1.10",
      name: "Josh",
      photoExt: "jpg",
      bumpPhotoRev: true,
    });
    const photoPath = profilePhotoPath("192.168.1.10");
    expect(photoPath).toBeTruthy();
    fs.mkdirSync(path.dirname(photoPath!), { recursive: true });
    const jpeg = Buffer.from("guest-jpeg");
    fs.writeFileSync(photoPath!, jpeg);

    insertRequest({
      id: "r-portrait",
      name: "Josh",
      songHash: "abc",
      instrument: "FiveFretGuitar",
      difficulty: "Expert",
      createdAt: 1,
      setId: "set-portrait",
      status: "in_set",
      clientIp: "192.168.1.10",
    });

    const hub = new BridgeHub();
    const socket = fakeSocket();
    hub.attachYarg(socket as never);
    socket.send.mockClear();

    hub.sendPrepare({
      id: "set-portrait",
      songHash: "abc",
      songName: "Song",
      songArtist: "Artist",
      playerIds: ["r-portrait"],
      status: "now_playing",
      createdAt: 1,
      startedAt: 1,
      finishedAt: null,
    });

    const payloads = socket.send.mock.calls.map(([raw]) => JSON.parse(String(raw)));
    const prepare = payloads.find((msg) => msg.type === "set.prepare");
    expect(prepare?.players[0]).toMatchObject({
      name: "Josh",
      slotId: expect.any(String),
      dataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
    });
    const images = payloads.find((msg) => msg.type === "player.images");
    expect(images?.players[0].dataUrl).toBe(prepare.players[0].dataUrl);
    expect(images?.players[0].name).toBe("Josh");
  });
});
