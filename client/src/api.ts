export type Instrument =
  | "FiveFretGuitar"
  | "FiveFretBass"
  | "FiveFretRhythm"
  | "FiveFretCoop"
  | "SixFretGuitar"
  | "SixFretBass"
  | "Keys"
  | "ProKeys"
  | "FourLaneDrums"
  | "ProDrums"
  | "FiveLaneDrums"
  | "EliteDrums"
  | "ProGuitar_17"
  | "ProBass_17"
  | "Vocals"
  | "Harmony";

export type Difficulty =
  | "Easy"
  | "Medium"
  | "Hard"
  | "Expert"
  | "ExpertPlus";

export type SongRecord = {
  hash: string;
  name: string;
  artist: string;
  album: string;
  year: string;
  genre: string;
  charter: string;
  folderPath: string;
  instruments: string[];
  diffs: Record<string, number>;
  source: "scan" | "yarg";
  verified: boolean;
};

export type QueueRequest = {
  id: string;
  name: string;
  songHash: string;
  instrument: Instrument;
  difficulty: Difficulty;
  createdAt: number;
  setId: string | null;
  status: string;
};

export type GuestProfile = {
  ip: string;
  name: string;
  instrument: Instrument;
  difficulty: Difficulty;
  instrumentDefaults: Partial<Record<Instrument, Difficulty>>;
  photoUrl: string | null;
  requestIds: string[];
  started: number;
};

export type PlaySet = {
  id: string;
  songHash: string;
  songName: string;
  songArtist: string;
  playerIds: string[];
  status: string;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
};

export type PublicState = {
  songs: SongRecord[];
  requests: QueueRequest[];
  sets: PlaySet[];
  settings: {
    songFolders: string[];
    instrumentCaps: Record<string, number>;
    songQueueCap: number;
    songQueueCapEnabled: boolean;
    hostPort: number;
    bridgePort: number;
    yaqPublicUrl: string;
    yargExecutable: string;
    yargPlacement: "same-machine" | "second-machine" | "";
    simulatorEnabled: boolean;
    hasAdminPassword: boolean;
    eventName: string;
    allowImportedScores: boolean;
    eventFlags: {
      hotMic: boolean;
      showUpNextHud: boolean;
      skipMainMenu: boolean;
      openDifficultySelect: boolean;
      addTestBots: boolean;
    };
  };
  yargState: string;
  yargConnected: boolean;
  eventModeEnabled: boolean;
  eventHash: string;
  hasYargClient: boolean;
  nowPlaying: PlaySet | null;
  onDeck: PlaySet | null;
  queuePreview: {
    setId: string | null;
    songHash: string | null;
    songName: string | null;
    songArtist: string | null;
    players: Array<{
      name: string;
      instrument: Instrument;
      difficulty: Difficulty;
    }>;
  };
  lanUrls: string[];
};

export type YargPlacement = "same-machine" | "second-machine";

export type SetupInfo = {
  needsSetup: boolean;
  hasAdminPassword: boolean;
  placement: {
    detected: YargPlacement;
    yargPath: string | null;
    yarcRoot: string | null;
    detail: string;
  };
  savedPlacement: YargPlacement | "";
  yargExecutable: string;
  lanUrls: string[];
  sameMachineBridgeUrl: string;
  secondMachineBridgeUrl: string;
};

export type ScoreRun = {
  id: string;
  createdAt: number;
  setId: string;
  songHash: string;
  songName: string;
  songArtist: string;
  playerName: string;
  instrument: string;
  difficulty: string;
  score: number;
  stars: number;
  bandScore: number;
  bandStars: number;
};

export type Letterboard = {
  overall: Array<{
    playerName: string;
    totalScore: number;
    bestScore: number;
    plays: number;
  }>;
  songs: Array<{
    songHash: string;
    songName: string;
    songArtist: string;
    entries: Array<{
      playerName: string;
      instrument: string;
      difficulty: string;
      score: number;
      stars: number;
    }>;
  }>;
};

export async function api<T>(
  path: string,
  init?: RequestInit & { adminPassword?: string },
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.adminPassword) {
    headers.set("x-admin-password", init.adminPassword);
  }
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || res.statusText);
  }
  return res.json() as Promise<T>;
}
