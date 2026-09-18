import { describe, expect, it } from "vitest";
import { distinctGenres, filterGuestSongs, sortGuestSongs } from "./songFilter.js";

const songs = [
  { name: "Sunset", artist: "Red Band", genre: "Rock" },
  { name: "Moonlight", artist: "Blue Orchestra", genre: "Jazz" },
  { name: "Highway", artist: "Red Band", genre: "rock" },
  { name: "Quiet", artist: "Solo", genre: "" },
];

describe("guest song filter", () => {
  it("matches artist, title, and genre case-insensitively", () => {
    expect(filterGuestSongs(songs, "red", "").map((s) => s.name)).toEqual([
      "Sunset",
      "Highway",
    ]);
    expect(filterGuestSongs(songs, "MOON", "").map((s) => s.name)).toEqual([
      "Moonlight",
    ]);
    expect(filterGuestSongs(songs, "jazz", "").map((s) => s.name)).toEqual([
      "Moonlight",
    ]);
  });

  it("filters by genre and combines with search", () => {
    expect(filterGuestSongs(songs, "", "Rock").map((s) => s.name)).toEqual([
      "Sunset",
      "Highway",
    ]);
    expect(filterGuestSongs(songs, "high", "Rock").map((s) => s.name)).toEqual([
      "Highway",
    ]);
    expect(filterGuestSongs(songs, "moon", "Rock")).toEqual([]);
  });

  it("lists distinct genres and skips blanks", () => {
    expect(distinctGenres(songs)).toEqual(["Jazz", "Rock"]);
  });

  it("sorts by genre, artist, and title", () => {
    expect(sortGuestSongs(songs, "title").map((s) => s.name)).toEqual([
      "Highway",
      "Moonlight",
      "Quiet",
      "Sunset",
    ]);
    expect(sortGuestSongs(songs, "artist").map((s) => s.name)).toEqual([
      "Moonlight",
      "Highway",
      "Sunset",
      "Quiet",
    ]);
    expect(sortGuestSongs(songs, "genre").map((s) => s.name)).toEqual([
      "Moonlight",
      "Highway",
      "Sunset",
      "Quiet",
    ]);
  });
});
