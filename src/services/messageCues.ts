export const STILL_WAITING_MS = 20_000;
export const LOSE_PLAYER_MS = 60_000;

export type DefaultCueId =
  | "emptyslots"
  | "leave"
  | "loseplayer"
  | "losesinger"
  | "nextsetofplayers"
  | "nextsetofsingers"
  | "notifications"
  | "stillwaitingplayer"
  | "stillwaitingplayers"
  | "stillwaitingsinger"
  | "stillwaitingsingers"
  | "welcome";

export type DefaultCue = {
  id: DefaultCueId;
  name: string;
  file: string;
  when: string;
};

export const DEFAULT_MESSAGE_CUES: readonly DefaultCue[] = [
  {
    id: "welcome",
    name: "Welcome",
    file: "welcome.mp3",
    when: "Event starting",
  },
  {
    id: "notifications",
    name: "Allow notifications",
    file: "notifications.mp3",
    when: "Alert to allow notifications",
  },
  {
    id: "nextsetofplayers",
    name: "Next set of players",
    file: "nextsetofplayers.mp3",
    when: "Next group in queue",
  },
  {
    id: "nextsetofsingers",
    name: "Next set of singers",
    file: "nextsetofsingers.mp3",
    when: "Next vocal group in queue",
  },
  {
    id: "emptyslots",
    name: "Empty slots",
    file: "emptyslots.mp3",
    when: "Song still has open player slots",
  },
  {
    id: "stillwaitingplayer",
    name: "Still waiting for a player",
    file: "stillwaitingplayer.mp3",
    when: "Waiting for a player to come up",
  },
  {
    id: "stillwaitingplayers",
    name: "Still waiting for players",
    file: "stillwaitingplayers.mp3",
    when: "Waiting for players to come up",
  },
  {
    id: "stillwaitingsinger",
    name: "Still waiting for a singer",
    file: "stillwaitingsinger.mp3",
    when: "Waiting for a singer to come up",
  },
  {
    id: "stillwaitingsingers",
    name: "Still waiting for singers",
    file: "stillwaitingsingers.mp3",
    when: "Waiting for singers to come up",
  },
  {
    id: "loseplayer",
    name: "Lose player",
    file: "loseplayer.mp3",
    when: "A player did not come up in time",
  },
  {
    id: "losesinger",
    name: "Lose singer",
    file: "losesinger.mp3",
    when: "A singer did not come up in time",
  },
  {
    id: "leave",
    name: "Player left",
    file: "leave.mp3",
    when: "A player leaves or quits",
  },
] as const;

export const DEFAULT_CUE_IDS = new Set<string>(
  DEFAULT_MESSAGE_CUES.map((cue) => cue.id),
);

export function isDefaultCueId(id: string): id is DefaultCueId {
  return DEFAULT_CUE_IDS.has(id);
}

export function isVocalCueInstrument(instrument: string): boolean {
  return instrument === "Vocals" || instrument === "Harmony";
}

export function crowdVoice(
  instruments: readonly string[],
): "singer" | "player" {
  if (instruments.length === 0) return "player";
  return instruments.every(isVocalCueInstrument) ? "singer" : "player";
}

export function nextSetCueId(
  instruments: readonly string[],
): DefaultCueId {
  return crowdVoice(instruments) === "singer"
    ? "nextsetofsingers"
    : "nextsetofplayers";
}

export function loseCueId(instruments: readonly string[]): DefaultCueId {
  return crowdVoice(instruments) === "singer" ? "losesinger" : "loseplayer";
}

export function stillWaitingCueId(
  instruments: readonly string[],
): DefaultCueId {
  const many = instruments.length !== 1;
  if (crowdVoice(instruments) === "singer") {
    return many ? "stillwaitingsingers" : "stillwaitingsinger";
  }
  return many ? "stillwaitingplayers" : "stillwaitingplayer";
}
