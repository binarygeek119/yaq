import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  parseDecryptedYargMetadata,
  readYargSongFields,
} from "./yargSong.js";

const ADAMIC =
  "/home/binarygeek119/.local/share/YARC/Setlists/40aef917-01c3-4cf9-a1c3-cf237258451b/installation/Adamic - All of a Sudden.yargsong";

describe("yargsong metadata", () => {
  it("parses SNG-style key/value metadata after the 6-byte magic", () => {
    const pairs: Array<[string, string]> = [
      ["name", "All of a Sudden"],
      ["artist", "Adamic"],
      ["diff_guitar", "3"],
      ["diff_drums", "4"],
    ];
    const chunks: Buffer[] = [];
    for (const [key, value] of pairs) {
      const keyBuf = Buffer.from(key, "utf8");
      const valBuf = Buffer.from(value, "utf8");
      const row = Buffer.alloc(8 + keyBuf.length + valBuf.length);
      row.writeInt32LE(keyBuf.length, 0);
      keyBuf.copy(row, 4);
      row.writeInt32LE(valBuf.length, 4 + keyBuf.length);
      valBuf.copy(row, 8 + keyBuf.length);
      chunks.push(row);
    }
    const blob = Buffer.concat(chunks);
    const header = Buffer.alloc(6 + 4 + 16 + 16);
    header.write("RB3CON", 0, 6, "latin1");
    header.writeUInt32LE(1, 6);
    header.writeBigInt64LE(BigInt(blob.length + 8), 26);
    header.writeBigUInt64LE(BigInt(pairs.length), 34);
    const plain = Buffer.concat([header, blob]);
    expect(parseDecryptedYargMetadata(plain)).toEqual({
      name: "All of a Sudden",
      artist: "Adamic",
      diff_guitar: "3",
      diff_drums: "4",
    });
  });

  it.skipIf(!fs.existsSync(ADAMIC))(
    "reads official setlist intensities from a yargsong file",
    () => {
      const fields = readYargSongFields(ADAMIC);
      expect(fields?.name).toBe("All of a Sudden");
      expect(fields?.artist).toBe("Adamic");
      expect(fields?.diff_guitar).toBe("3");
      expect(fields?.diff_drums).toBe("4");
      expect(fields?.diff_band).toBe("3");
    },
  );
});
