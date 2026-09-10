export const INSTRUMENTS = [
  "FiveFretGuitar",
  "FiveFretBass",
  "FiveFretRhythm",
  "FiveFretCoop",
  "Keys",
  "ProKeys",
  "FourLaneDrums",
  "ProDrums",
  "FiveLaneDrums",
  "EliteDrums",
  "Vocals",
  "Harmony",
] as const;

export type Instrument = (typeof INSTRUMENTS)[number];

export const DIFFICULTIES = [
  "Easy",
  "Medium",
  "Hard",
  "Expert",
  "ExpertPlus",
] as const;

export type Difficulty = (typeof DIFFICULTIES)[number];

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
  status: "waiting" | "in_set" | "playing" | "done" | "cancelled";
};

export type PlaySet = {
  id: string;
  songHash: string;
  songName: string;
  songArtist: string;
  playerIds: string[];
  status: "on_deck" | "now_playing" | "done" | "skipped";
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
};

export type InstrumentCaps = Record<string, number>;

export type AppSettings = {
  adminPassword: string;
  songFolders: string[];
  instrumentCaps: InstrumentCaps;
  hostPort: number;
  bridgePort: number;
  yaqPublicUrl: string;
  simulatorEnabled: boolean;
};

export type YargState = "disconnected" | "idle" | "ready" | "playing" | "score";

export type QueuePreviewPlayer = {
  name: string;
  instrument: Instrument;
  difficulty: Difficulty;
};

export type QueuePreview = {
  setId: string | null;
  songHash: string | null;
  songName: string | null;
  songArtist: string | null;
  players: QueuePreviewPlayer[];
};

export type PublicState = {
  songs: SongRecord[];
  requests: QueueRequest[];
  sets: PlaySet[];
  settings: Omit<AppSettings, "adminPassword"> & { hasAdminPassword: boolean };
  yargState: YargState;
  yargConnected: boolean;
  nowPlaying: PlaySet | null;
  onDeck: PlaySet | null;
  queuePreview: QueuePreview;
  lanUrls: string[];
};
