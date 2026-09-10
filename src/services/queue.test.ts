import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../../data-test");
fs.mkdirSync(dataDir, { recursive: true });
process.env.YAQ_DATA_DIR = dataDir;

describe("queue pairing", () => {
  beforeEach(() => {
    for (const file of fs.readdirSync(dataDir)) {
      if (file.startsWith("yaq.sqlite")) {
        try {
          fs.unlinkSync(path.join(dataDir, file));
        } catch {
          // ignore busy db
        }
      }
    }
  });

  it("pairs same-song players onto one on-deck set", async () => {
    // Dynamic import after db wipe attempt
    const { initDb, upsertSongs, updateSettings } = await import("../db.js");
    const { joinQueue, getOnDeck, buildQueuePreview } = await import("./queue.js");

    initDb();
    updateSettings({
      instrumentCaps: {
        FiveFretGuitar: 2,
        Vocals: 2,
      },
    });
    upsertSongs([
      {
        hash: "abc123",
        name: "Song",
        artist: "Artist",
        album: "",
        year: "",
        genre: "",
        charter: "",
        folderPath: "/tmp/x",
        instruments: ["FiveFretGuitar", "Vocals"],
        source: "scan",
        verified: false,
      },
    ]);

    joinQueue({
      name: "A",
      songHash: "abc123",
      instrument: "FiveFretGuitar",
      difficulty: "Expert",
    });
    joinQueue({
      name: "B",
      songHash: "abc123",
      instrument: "Vocals",
      difficulty: "Hard",
    });

    const onDeck = getOnDeck();
    expect(onDeck).not.toBeNull();
    expect(onDeck!.playerIds.length).toBe(2);
    const preview = buildQueuePreview(onDeck);
    expect(preview.players.map((p) => p.name).sort()).toEqual(["A", "B"]);
  });
});
