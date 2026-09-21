import { describe, expect, it, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "yaq-msg-"));
process.env.YAQ_DATA_DIR = dataDir;

describe("audio messages", () => {
  let initDb: (typeof import("../db.js"))["initDb"];
  let deleteMessage: (typeof import("./messages.js"))["deleteMessage"];
  let isWav: (typeof import("./messages.js"))["isWav"];
  let listMessages: (typeof import("./messages.js"))["listMessages"];
  let saveMessage: (typeof import("./messages.js"))["saveMessage"];

  beforeAll(async () => {
    const dbMod = await import("../db.js");
    const msg = await import("./messages.js");
    initDb = dbMod.initDb;
    deleteMessage = msg.deleteMessage;
    isWav = msg.isWav;
    listMessages = msg.listMessages;
    saveMessage = msg.saveMessage;
    initDb();
  });

  function tinyWav(): Buffer {
    const buffer = Buffer.alloc(44);
    buffer.write("RIFF", 0);
    buffer.writeUInt32LE(36, 4);
    buffer.write("WAVE", 8);
    buffer.write("fmt ", 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(8000, 24);
    buffer.writeUInt32LE(16000, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write("data", 36);
    buffer.writeUInt32LE(0, 40);
    return buffer;
  }

  it("rejects non-wav bytes", () => {
    expect(isWav(Buffer.from("nope"))).toBe(false);
    expect(() => saveMessage("Bad", Buffer.from("nope"), 0)).toThrow(/WAV/);
  });

  it("saves, lists, and deletes a recording", () => {
    const saved = saveMessage("Hello floor", tinyWav(), 1200);
    expect(saved.name).toBe("Hello floor");
    expect(listMessages().some((row) => row.id === saved.id)).toBe(true);
    expect(deleteMessage(saved.id)).toBe(true);
    expect(listMessages().some((row) => row.id === saved.id)).toBe(false);
  });
});
