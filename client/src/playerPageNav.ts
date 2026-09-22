export type PlayerPageNavState = {
  openedKey: string;
  dismissedKey: string;
};

export const emptyPlayerPageNav: PlayerPageNavState = {
  openedKey: "",
  dismissedKey: "",
};

/** Auto-open /player when a mic player is up; do not trap them if they leave. */
export function nextPlayerPageNav(
  input: {
    pathname: string;
    skip: boolean;
    yourTurn: boolean;
    turnKey: string;
  },
  prev: PlayerPageNavState,
): PlayerPageNavState & { navigate: boolean } {
  if (input.skip || !input.yourTurn || !input.turnKey) {
    return { ...prev, navigate: false };
  }

  if (input.pathname === "/player") {
    return {
      openedKey: input.turnKey,
      dismissedKey: prev.dismissedKey,
      navigate: false,
    };
  }

  if (prev.dismissedKey === input.turnKey) {
    return { ...prev, navigate: false };
  }

  if (prev.openedKey === input.turnKey) {
    return {
      openedKey: input.turnKey,
      dismissedKey: input.turnKey,
      navigate: false,
    };
  }

  return { openedKey: input.turnKey, dismissedKey: "", navigate: true };
}
