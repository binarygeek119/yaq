export const INSTRUMENTS = [
  "FiveFretGuitar",
  "FiveFretBass",
  "FiveFretRhythm",
  "FiveFretCoop",
  "SixFretGuitar",
  "SixFretBass",
  "Keys",
  "ProKeys",
  "FourLaneDrums",
  "ProDrums",
  "FiveLaneDrums",
  "EliteDrums",
  "ProGuitar_17",
  "ProBass_17",
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
  /** song.ini 0–6 intensities keyed by instrument. Empty if unknown. */
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
  status: "waiting" | "in_set" | "playing" | "done" | "cancelled";
  /** Device identity. Never sent on public API payloads. */
  clientIp: string;
};

export type PublicQueueRequest = Omit<QueueRequest, "clientIp">;

export type InstrumentDefaults = Partial<Record<Instrument, Difficulty>>;

export type GuestProfile = {
  ip: string;
  name: string;
  instrument: Instrument;
  difficulty: Difficulty;
  instrumentDefaults: InstrumentDefaults;
  photoUrl: string | null;
  requestIds: string[];
  started: number;
  onboarded: boolean;
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

/** Curated YARG Event Mode flags pushed over the YARG WebSocket. */
export type EventFlags = {
  hotMic: boolean;
  showUpNextHud: boolean;
  skipMainMenu: boolean;
  openDifficultySelect: boolean;
  /** Fill leftover instrument slots with YARG bots. Song master stays human. */
  addTestBots: boolean;
};

export const DEFAULT_EVENT_FLAGS: EventFlags = {
  hotMic: true,
  showUpNextHud: true,
  skipMainMenu: true,
  openDifficultySelect: true,
  addTestBots: false,
};

export type YargPlacement = "same-machine" | "second-machine";

export const DEFAULT_SONG_QUEUE_CAP = 5;
export const MIN_SONG_QUEUE_CAP = 1;
export const MAX_SONG_QUEUE_CAP = 20;
/** YARG Event Mode seats this many players on one song. */
export const MAX_SET_PLAYERS = 4;

export type QueueBoardPlayer = {
  id: string;
  name: string;
  instrument: Instrument;
  difficulty: Difficulty;
};

export type QueueBoardSong = {
  songHash: string;
  songName: string;
  songArtist: string;
  status: "now_playing" | "on_deck" | "waiting";
  setId: string | null;
  masterName: string;
  players: QueueBoardPlayer[];
  playerSlotsOpen: number;
  joinable: boolean;
};

export type AppSettings = {
  adminPassword: string;
  songFolders: string[];
  instrumentCaps: InstrumentCaps;
  /** Distinct songs a player may start (as song master). */
  songQueueCap: number;
  /** When false, players may start any number of songs. */
  songQueueCapEnabled: boolean;
  hostPort: number;
  bridgePort: number;
  yaqPublicUrl: string;
  /** Absolute path to the YARG (event-mode) binary or Unity player. */
  yargExecutable: string;
  /** Whether YAQ shares a computer with YARG, chosen during first-run setup. */
  yargPlacement: YargPlacement | "";
  simulatorEnabled: boolean;
  eventFlags: EventFlags;
  /** Guest-facing event title. Empty is replaced with a random name. */
  eventName: string;
  /** When true, imported last-event scores count on this event's boards. */
  allowImportedScores: boolean;
};

export type YargState = "disconnected" | "idle" | "ready" | "playing" | "score";

export type QueuePreviewPlayer = {
  id: string;
  name: string;
  instrument: Instrument;
  difficulty: Difficulty;
};

export type QueuePreviewFollowing = {
  songHash: string;
  songName: string;
  songArtist: string;
  players: QueuePreviewPlayer[];
};

export type QueuePreview = {
  setId: string | null;
  songHash: string | null;
  songName: string | null;
  songArtist: string | null;
  players: QueuePreviewPlayer[];
  /** Song after on-deck, for the Event HUD “UP NEXT” slot. */
  following: QueuePreviewFollowing | null;
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
  percent: number;
  notesHit: number;
  totalNotes: number;
  maxCombo: number;
  spPhrasesHit: number;
  spPhrasesTotal: number;
  avgMultiplier: number;
  isFullCombo: boolean;
  isHighScore: boolean;
  notesMissed: number;
  overstrums: number;
  ghostInputs: number;
  spUses: number;
  timeInSp: number;
  enginePreset: string;
  modifiersUsed: boolean;
  /** True when the run came from a last-event import. */
  imported: boolean;
};

export type LetterboardSongRef = {
  songHash: string;
  songName: string;
  songArtist: string;
};

export type LetterboardOverall = {
  playerName: string;
  totalScore: number;
  bestScore: number;
  plays: number;
  fullCombos: number;
  accuracy: number;
  stars: number;
  goldStars: number;
  crimsonStars: number;
  instruments: string[];
  lastPlayed: LetterboardSongRef | null;
  mostPlayed: (LetterboardSongRef & { plays: number }) | null;
};

export type LetterboardSongEntry = {
  playerName: string;
  instrument: string;
  difficulty: string;
  score: number;
  stars: number;
  percent: number;
  isFullCombo: boolean;
  isHighScore: boolean;
};

export type LetterboardSong = {
  songHash: string;
  songName: string;
  songArtist: string;
  entries: LetterboardSongEntry[];
};

export type Letterboard = {
  overall: LetterboardOverall[];
  songs: LetterboardSong[];
};

export type PublicState = {
  songs: SongRecord[];
  requests: PublicQueueRequest[];
  sets: PlaySet[];
  settings: Omit<AppSettings, "adminPassword"> & { hasAdminPassword: boolean };
  yargState: YargState;
  yargConnected: boolean;
  /** True when YARG Event Mode behaviors are active (not suspended). */
  eventModeEnabled: boolean;
  /** sha256(eventName + YARG song hashes). Changes when the library or name changes. */
  eventHash: string;
  /** True when a real YARG WebSocket (not simulator) is attached. */
  hasYargClient: boolean;
  nowPlaying: PlaySet | null;
  onDeck: PlaySet | null;
  queuePreview: QueuePreview;
  queueBoard: QueueBoardSong[];
  /** Request ids that have readied on the Event HUD / Player page. */
  readyRequestIds: string[];
  lanUrls: string[];
  version: string;
};

export type PlayerTurn = {
  active: boolean;
  yourTurn: boolean;
  ready: boolean;
  requestId: string | null;
  setId: string | null;
  songHash: string | null;
  songName: string;
  songArtist: string;
  instrument: string | null;
  difficulty: string | null;
  mic: number | null;
  micCount: number;
  status: "idle" | "waiting" | "on_deck" | "now_playing";
};
