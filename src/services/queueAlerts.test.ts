import { describe, expect, it } from "vitest";
import {
  alertKindForAhead,
  pendingQueueAlert,
  queueAlertCopy,
  songsAhead,
  upcomingSongs,
} from "./queueAlerts.js";

function req(
  id: string,
  songHash: string,
  createdAt: number,
  status = "waiting",
) {
  return { id, songHash, createdAt, status };
}

describe("upcomingSongs", () => {
  it("puts on-deck first, then waiting songs by oldest request", () => {
    const upcoming = upcomingSongs(
      [
        req("c", "c", 30),
        req("b", "b", 20),
        req("b2", "b", 21),
        req("a", "a", 10, "in_set"),
      ],
      { songHash: "a", playerIds: ["a"] },
    );
    expect(upcoming.map((s) => s.songHash)).toEqual(["a", "b", "c"]);
    expect(upcoming[1]?.requestIds).toEqual(["b", "b2"]);
  });

  it("treats the first waiting song as up next when nothing is on deck", () => {
    const upcoming = upcomingSongs([req("z", "z", 1)], null);
    expect(upcoming).toEqual([{ songHash: "z", requestIds: ["z"] }]);
  });
});

describe("songsAhead", () => {
  it("returns the soonest upcoming song for this device", () => {
    const upcoming = upcomingSongs(
      [req("me", "mine", 50), req("x", "x", 10, "in_set")],
      { songHash: "x", playerIds: ["x"] },
    );
    expect(songsAhead(upcoming, new Set(["me"]))).toBe(1);
    expect(songsAhead(upcoming, new Set(["x"]))).toBe(0);
    expect(songsAhead(upcoming, new Set(["nope"]))).toBeNull();
  });
});

describe("alertKindForAhead", () => {
  it("maps 0 / 1 / 2-5 to up next, one away, and five-away", () => {
    expect(alertKindForAhead(0)).toBe("upNext");
    expect(alertKindForAhead(1)).toBe("one");
    expect(alertKindForAhead(2)).toBe("five");
    expect(alertKindForAhead(5)).toBe("five");
    expect(alertKindForAhead(6)).toBeNull();
    expect(alertKindForAhead(null)).toBeNull();
  });
});

describe("pendingQueueAlert", () => {
  const requests = [
    req("a", "s0", 1, "in_set"),
    req("b", "s1", 2),
    req("c", "s2", 3),
    req("d", "s3", 4),
    req("e", "s4", 5),
    req("me", "mine", 6),
  ];
  const onDeck = { songHash: "s0", playerIds: ["a"] };

  it("fires five-away once when this device is 5 songs out", () => {
    const first = pendingQueueAlert(
      requests,
      onDeck,
      new Set(["me"]),
      new Set(),
    );
    expect(first?.kind).toBe("five");
    expect(first?.ahead).toBe(5);
    const again = pendingQueueAlert(
      requests,
      onDeck,
      new Set(["me"]),
      new Set([first!.key]),
    );
    expect(again).toBeNull();
  });

  it("fires one-away and up-next as the queue advances", () => {
    const one = pendingQueueAlert(
      [req("now", "s0", 1, "in_set"), req("me", "mine", 2)],
      { songHash: "s0", playerIds: ["now"] },
      new Set(["me"]),
      new Set(),
    );
    expect(one?.kind).toBe("one");

    const up = pendingQueueAlert(
      [req("me", "mine", 2, "in_set")],
      { songHash: "mine", playerIds: ["me"] },
      new Set(["me"]),
      new Set(),
    );
    expect(up?.kind).toBe("upNext");
  });
});

describe("queueAlertCopy", () => {
  it("names the song in each alert", () => {
    expect(queueAlertCopy("five", 4, "Slow Ride", "Foghat").title).toBe(
      "You're 4 songs away",
    );
    expect(queueAlertCopy("one", 1, "Slow Ride", "Foghat").title).toBe(
      "One song away",
    );
    expect(queueAlertCopy("upNext", 0, "Slow Ride", "Foghat")).toEqual({
      title: "You're up next",
      body: "Get ready — Foghat — Slow Ride",
    });
  });
});
