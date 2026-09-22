import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

process.env.YAQ_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "yaq-bridge-"));

type BridgeMod = typeof import("./bridge.js");
type DbMod = typeof import("../db.js");
type QueueMod = typeof import("./queue.js");

let BridgeHub: BridgeMod["BridgeHub"];
let YARG_DISCONNECT_GRACE_MS: BridgeMod["YARG_DISCONNECT_GRACE_MS"];
let initDb: DbMod["initDb"];
let insertRequest: DbMod["insertRequest"];
let upsertProfile: DbMod["upsertProfile"];
let profilePhotoPath: DbMod["profilePhotoPath"];
let upsertSongs: DbMod["upsertSongs"];
let listSongs: DbMod["listSongs"];
let db: DbMod["db"];
let joinQueue: QueueMod["joinQueue"];
let getNowPlaying: QueueMod["getNowPlaying"];
let getOnDeck: QueueMod["getOnDeck"];

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
  const queueMod = await import("./queue.js");
  initDb = dbMod.initDb;
  insertRequest = dbMod.insertRequest;
  upsertProfile = dbMod.upsertProfile;
  profilePhotoPath = dbMod.profilePhotoPath;
  upsertSongs = dbMod.upsertSongs;
  listSongs = dbMod.listSongs;
  db = dbMod.db;
  joinQueue = queueMod.joinQueue;
  getNowPlaying = queueMod.getNowPlaying;
  getOnDeck = queueMod.getOnDeck;
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

  it("finds the guest JPEG by name when the request has no client IP", () => {
    upsertProfile({
      ip: "10.0.0.77",
      name: "test123",
      photoExt: "jpg",
      bumpPhotoRev: true,
    });
    const photoPath = profilePhotoPath("10.0.0.77");
    expect(photoPath).toBeTruthy();
    fs.mkdirSync(path.dirname(photoPath!), { recursive: true });
    const jpeg = Buffer.from("named-guest-jpeg");
    fs.writeFileSync(photoPath!, jpeg);

    insertRequest({
      id: "r-named-photo",
      name: "test123",
      songHash: "def",
      instrument: "FiveFretGuitar",
      difficulty: "Expert",
      createdAt: 2,
      setId: "set-named",
      status: "in_set",
      clientIp: "",
    });

    const hub = new BridgeHub();
    const socket = fakeSocket();
    hub.attachYarg(socket as never);
    socket.send.mockClear();

    hub.sendPrepare({
      id: "set-named",
      songHash: "def",
      songName: "Song",
      songArtist: "Artist",
      playerIds: ["r-named-photo"],
      status: "now_playing",
      createdAt: 2,
      startedAt: 2,
      finishedAt: null,
    });

    const payloads = socket.send.mock.calls.map(([raw]) => JSON.parse(String(raw)));
    const prepare = payloads.find((msg) => msg.type === "set.prepare");
    expect(prepare?.players[0].dataUrl).toBe(
      `data:image/jpeg;base64,${jpeg.toString("base64")}`,
    );
  });
});

describe("Event Mode auto-advance", () => {
  beforeEach(() => {
    initDb();
    db.exec("DELETE FROM requests; DELETE FROM queue; DELETE FROM songs;");
    upsertSongs([
      {
        hash: "song-a",
        name: "Song A",
        artist: "Artist A",
        album: "",
        year: "",
        genre: "",
        charter: "",
        folderPath: "/tmp/song-a",
        instruments: ["FiveFretGuitar"],
        diffs: { FiveFretGuitar: 4 },
        source: "scan",
        verified: true,
      },
      {
        hash: "song-b",
        name: "Song B",
        artist: "Artist B",
        album: "",
        year: "",
        genre: "",
        charter: "",
        folderPath: "/tmp/song-b",
        instruments: ["FiveFretGuitar"],
        diffs: { FiveFretGuitar: 4 },
        source: "scan",
        verified: true,
      },
    ]);
  });

  it("prepares the next queued set when a song ends", () => {
    joinQueue({
      name: "A",
      songHash: "song-a",
      instrument: "FiveFretGuitar",
      difficulty: "Expert",
      clientIp: "10.0.0.1",
    });
    joinQueue({
      name: "B",
      songHash: "song-b",
      instrument: "FiveFretGuitar",
      difficulty: "Expert",
      clientIp: "10.0.0.2",
    });

    const hub = new BridgeHub();
    hub.eventModeEnabled = true;
    const socket = fakeSocket();
    hub.attachYarg(socket as never);
    const first = hub.launchNext();
    expect(first.songHash).toBe("song-a");
    expect(getNowPlaying()?.songHash).toBe("song-a");

    socket.send.mockClear();
    hub.handleInbound({ type: "song.ended", setId: first.id });

    expect(getNowPlaying()?.songHash).toBe("song-b");
    expect(getOnDeck()).toBeNull();
    const payloads = socket.send.mock.calls.map(([raw]) => JSON.parse(String(raw)));
    const prepare = payloads.find((msg) => msg.type === "set.prepare");
    expect(prepare?.set?.songHash).toBe("song-b");
    expect(prepare?.players[0].name).toBe("B");
    expect(hub.yargState).toBe("ready");
  });

  it("clears the last on-deck song instead of preparing it again", () => {
    joinQueue({
      name: "A",
      songHash: "song-a",
      instrument: "FiveFretGuitar",
      difficulty: "Expert",
      clientIp: "10.0.0.11",
    });

    const hub = new BridgeHub();
    hub.eventModeEnabled = true;
    const socket = fakeSocket();
    hub.attachYarg(socket as never);
    const last = getOnDeck();
    expect(last?.songHash).toBe("song-a");
    expect(getNowPlaying()).toBeNull();

    socket.send.mockClear();
    hub.handleInbound({ type: "song.ended", setId: last.id });

    expect(getNowPlaying()).toBeNull();
    expect(getOnDeck()).toBeNull();
    const payloads = socket.send.mock.calls.map(([raw]) => JSON.parse(String(raw)));
    expect(payloads.some((msg) => msg.type === "set.prepare")).toBe(false);
    const preview = [...payloads].reverse().find((msg) => msg.type === "queue.preview");
    expect(preview?.preview?.songHash ?? null).toBeNull();
    expect(preview?.preview?.songName ?? null).toBeNull();
  });

  it("launches the on-deck set when YARG requests it", () => {
    joinQueue({
      name: "A",
      songHash: "song-a",
      instrument: "FiveFretGuitar",
      difficulty: "Expert",
      clientIp: "10.0.0.3",
    });

    const hub = new BridgeHub();
    hub.eventModeEnabled = true;
    const socket = fakeSocket();
    hub.attachYarg(socket as never);
    expect(getNowPlaying()).toBeNull();
    expect(getOnDeck()?.songHash).toBe("song-a");

    socket.send.mockClear();
    hub.handleInbound({ type: "set.requestLaunch" });

    expect(getNowPlaying()?.songHash).toBe("song-a");
    const payloads = socket.send.mock.calls.map(([raw]) => JSON.parse(String(raw)));
    expect(payloads.some((msg) => msg.type === "set.prepare")).toBe(true);
  });

  it("skips a now-playing hash that is not in YARG library.sync", () => {
    joinQueue({
      name: "A",
      songHash: "song-a",
      instrument: "FiveFretGuitar",
      difficulty: "Expert",
      clientIp: "10.0.0.4",
    });
    joinQueue({
      name: "B",
      songHash: "song-b",
      instrument: "FiveFretGuitar",
      difficulty: "Expert",
      clientIp: "10.0.0.5",
    });

    const hub = new BridgeHub();
    hub.eventModeEnabled = true;
    const socket = fakeSocket();
    hub.attachYarg(socket as never);
    hub.launchNext();
    expect(getNowPlaying()?.songHash).toBe("song-a");

    socket.send.mockClear();
    hub.handleInbound({
      type: "library.sync",
      songs: [
        {
          hash: "song-b",
          name: "Song B",
          artist: "Artist B",
          album: "",
          year: "",
          genre: "",
          charter: "",
          folderPath: "/tmp/song-b",
          instruments: ["FiveFretGuitar"],
          diffs: { FiveFretGuitar: 4 },
          source: "yarg",
          verified: true,
        },
      ],
    });

    expect(getNowPlaying()?.songHash).toBe("song-b");
    const payloads = socket.send.mock.calls.map(([raw]) => JSON.parse(String(raw)));
    expect(
      payloads.some((msg) => msg.type === "set.prepare" && msg.set?.songHash === "song-b"),
    ).toBe(true);
    expect(
      payloads.some((msg) => msg.type === "set.prepare" && msg.set?.songHash === "song-a"),
    ).toBe(false);
  });

  it("skips song_not_found once and prepares the next set", () => {
    joinQueue({
      name: "A",
      songHash: "song-a",
      instrument: "FiveFretGuitar",
      difficulty: "Expert",
      clientIp: "10.0.0.6",
    });
    joinQueue({
      name: "B",
      songHash: "song-b",
      instrument: "FiveFretGuitar",
      difficulty: "Expert",
      clientIp: "10.0.0.7",
    });

    const hub = new BridgeHub();
    hub.eventModeEnabled = true;
    const socket = fakeSocket();
    hub.attachYarg(socket as never);
    const first = hub.launchNext();
    expect(first.songHash).toBe("song-a");

    socket.send.mockClear();
    hub.handleInbound({
      type: "error",
      code: "song_not_found",
      setId: first.id,
      songHash: "song-a",
    });

    expect(getNowPlaying()?.songHash).toBe("song-b");
    const payloads = socket.send.mock.calls.map(([raw]) => JSON.parse(String(raw)));
    const prepares = payloads.filter((msg) => msg.type === "set.prepare");
    expect(prepares).toHaveLength(1);
    expect(prepares[0]?.set?.songHash).toBe("song-b");

    socket.send.mockClear();
    hub.handleInbound({
      type: "error",
      code: "song_not_found",
      setId: first.id,
      songHash: "song-a",
    });
    const again = socket.send.mock.calls.map(([raw]) => JSON.parse(String(raw)));
    expect(again.filter((msg) => msg.type === "set.prepare")).toHaveLength(0);
  });
});

describe("admin YARG library sync", () => {
  beforeEach(() => {
    initDb();
    db.exec("DELETE FROM requests; DELETE FROM queue; DELETE FROM songs;");
    upsertSongs([
      {
        hash: "old-scan",
        name: "Old Scan",
        artist: "Leftover",
        album: "",
        year: "",
        genre: "",
        charter: "",
        folderPath: "/tmp/old-scan",
        instruments: ["FiveFretGuitar"],
        diffs: { FiveFretGuitar: 4 },
        source: "scan",
        verified: false,
      },
    ]);
  });

  it("replaces the YAQ catalog with the YARG song list", async () => {
    const hub = new BridgeHub();
    const socket = fakeSocket();
    hub.attachYarg(socket as never);

    const pending = hub.syncLibraryFromYarg(1_000);
    const sent = socket.send.mock.calls.map(([raw]) => JSON.parse(String(raw)));
    expect(sent.some((msg) => msg.type === "library.request")).toBe(true);

    hub.handleInbound({
      type: "library.sync",
      songs: [
        {
          hash: "YARG-SONG",
          name: "From YARG",
          artist: "Live Band",
          album: "",
          year: "",
          genre: "",
          charter: "",
          folderPath: "/tmp/yarg-song",
          instruments: ["FiveFretGuitar"],
          diffs: { FiveFretGuitar: 3 },
          source: "yarg",
          verified: true,
        },
      ],
    });

    await expect(pending).resolves.toEqual({
      imported: 1,
      removed: 1,
      total: 1,
    });
    expect(listSongs().map((song) => song.hash)).toEqual(["yarg-song"]);
    expect(listSongs()[0]?.name).toBe("From YARG");
  });

  it("rejects sync when YARG is not connected", async () => {
    const hub = new BridgeHub();
    await expect(hub.syncLibraryFromYarg(50)).rejects.toThrow(
      "No YARG client connected",
    );
  });
});

describe("venue announcements", () => {
  it("sends play to YARG immediately while a song is running", () => {
    const hub = new BridgeHub();
    const socket = fakeSocket();
    hub.attachYarg(socket as never);
    hub.yargState = "playing";
    socket.send.mockClear();
    expect(hub.playAnnouncement("welcome")).toEqual({ queued: true });
    const payloads = socket.send.mock.calls.map(([raw]) => JSON.parse(String(raw)));
    expect(
      payloads.some(
        (msg) => msg.type === "announcement.play" && msg.id === "welcome",
      ),
    ).toBe(true);
  });

  it("plays immediately when Event Mode is idle", () => {
    const hub = new BridgeHub();
    const socket = fakeSocket();
    hub.attachYarg(socket as never);
    hub.yargState = "idle";
    socket.send.mockClear();
    expect(hub.playAnnouncement("welcome")).toEqual({ queued: false });
    const payloads = socket.send.mock.calls.map(([raw]) => JSON.parse(String(raw)));
    expect(
      payloads.some(
        (msg) => msg.type === "announcement.play" && msg.id === "welcome",
      ),
    ).toBe(true);
  });
});
