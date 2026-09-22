import { describe, expect, it } from "vitest";
import {
  emptyPlayerPageNav,
  nextPlayerPageNav,
} from "./playerPageNav.ts";

describe("nextPlayerPageNav", () => {
  it("opens /player the first time the mic player is up", () => {
    const next = nextPlayerPageNav(
      {
        pathname: "/songs",
        skip: false,
        yourTurn: true,
        turnKey: "r1",
      },
      emptyPlayerPageNav,
    );
    expect(next).toEqual({
      openedKey: "r1",
      dismissedKey: "",
      navigate: true,
    });
  });

  it("lets them leave after the page has opened", () => {
    const opened = nextPlayerPageNav(
      {
        pathname: "/player",
        skip: false,
        yourTurn: true,
        turnKey: "r1",
      },
      { openedKey: "r1", dismissedKey: "" },
    );
    expect(opened.navigate).toBe(false);

    const left = nextPlayerPageNav(
      {
        pathname: "/queue",
        skip: false,
        yourTurn: true,
        turnKey: "r1",
      },
      opened,
    );
    expect(left).toEqual({
      openedKey: "r1",
      dismissedKey: "r1",
      navigate: false,
    });

    const stay = nextPlayerPageNav(
      {
        pathname: "/songs",
        skip: false,
        yourTurn: true,
        turnKey: "r1",
      },
      left,
    );
    expect(stay.navigate).toBe(false);
  });

  it("opens again when a later song is their turn", () => {
    const next = nextPlayerPageNav(
      {
        pathname: "/songs",
        skip: false,
        yourTurn: true,
        turnKey: "r2",
      },
      { openedKey: "r1", dismissedKey: "r1" },
    );
    expect(next).toEqual({
      openedKey: "r2",
      dismissedKey: "",
      navigate: true,
    });
  });

  it("does not open on admin or when it is not their turn", () => {
    expect(
      nextPlayerPageNav(
        {
          pathname: "/admin",
          skip: true,
          yourTurn: true,
          turnKey: "r1",
        },
        emptyPlayerPageNav,
      ).navigate,
    ).toBe(false);
    expect(
      nextPlayerPageNav(
        {
          pathname: "/songs",
          skip: false,
          yourTurn: false,
          turnKey: "r1",
        },
        emptyPlayerPageNav,
      ).navigate,
    ).toBe(false);
  });
});
