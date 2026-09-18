export type ControllerShot = {
  src: string;
  alt: string;
};

export type ControllerInfo = {
  id: string;
  title: string;
  blurb: string;
  images: ControllerShot[];
  parts: string[];
  play: string[];
};

export const CONTROLLERS: ControllerInfo[] = [
  {
    id: "five-fret",
    title: "Five-fret guitar",
    blurb:
      "The classic plastic guitar. Same hardware plays guitar, bass, rhythm, and coop.",
    images: [
      {
        src: "/controllers/five-fret-1.png",
        alt: "Five-fret Strat-style guitar controller",
      },
      {
        src: "/controllers/five-fret-2.png",
        alt: "Five-fret Kramer-style guitar controller",
      },
    ],
    parts: ["Five-fret guitar", "Five-fret bass", "Rhythm", "Coop"],
    play: [
      "Gems scroll down the highway toward the strikeline.",
      "Hold the matching fret color (green, red, yellow, blue, orange — closest to you first) and strum when the gem hits the line.",
      "Chords: hold more than one fret. Open notes: strum with no frets held.",
      "Hammer-ons and taps do not need a strum — hit the fret in time.",
      "Star Power: fill the meter, then tilt the neck up or press the Star Power button.",
      "In YAQ, pick Guitar, Bass, Rhythm, or Coop for this controller.",
    ],
  },
  {
    id: "six-fret",
    title: "Six-fret guitar",
    blurb:
      "Guitar Hero Live-style guitar with two rows of three buttons. Plays 6-fret guitar or bass.",
    images: [
      {
        src: "/controllers/six-fret.png",
        alt: "Six-fret guitar controller",
      },
    ],
    parts: ["Six-fret guitar", "Six-fret bass"],
    play: [
      "Six buttons in two rows of three (white / black).",
      "White gems use the lower row. Black gems use the upper row.",
      "Strum in time, or tap when the chart shows tap notes.",
      "Star Power works like five-fret: fill the meter, then tilt or press SP.",
      "In YAQ, pick Six-fret guitar or Six-fret bass.",
    ],
  },
  {
    id: "pro-guitar",
    title: "Pro guitar / bass",
    blurb:
      "Real strings and frets (Mustang-style). Charts tell you which string and fret to play.",
    images: [
      {
        src: "/controllers/pro-guitar.png",
        alt: "Pro guitar and pro bass Mustang-style controller",
      },
    ],
    parts: ["Pro guitar", "Pro bass"],
    play: [
      "The highway shows a string and a fret for each note.",
      "Fret that note on the neck, then pick the matching string.",
      "Chords use several strings at once — hold the shape and strum or pick.",
      "Same controller plays Pro Guitar or Pro Bass. Pick the part in YAQ.",
    ],
  },
  {
    id: "four-lane-drums",
    title: "Four-lane drums",
    blurb:
      "Rock Band kit: four pads and a kick pedal. No extra cymbals.",
    images: [
      {
        src: "/controllers/four-lane-drums.png",
        alt: "Four-lane drum kit with four pads and a kick pedal",
      },
    ],
    parts: ["Four-lane drums"],
    play: [
      "Red, yellow, blue, and green pads match the four drum lanes.",
      "Hit the matching pad when the gem reaches the strikeline.",
      "Kick is the bottom (orange) lane — stomp the pedal in time.",
      "Use this kit for four-lane drum charts.",
    ],
  },
  {
    id: "pro-drums",
    title: "Pro drums",
    blurb:
      "Four-lane kit plus yellow, blue, and green cymbals for Pro Drums charts.",
    images: [
      {
        src: "/controllers/pro-drums.png",
        alt: "Four-lane pro drum kit with pads, cymbals, and a kick pedal",
      },
    ],
    parts: ["Pro drums"],
    play: [
      "Pads work like four-lane drums. Kick is still the pedal.",
      "Cymbal gems sit on the yellow, blue, and green lanes — hit the cymbal, not the tom.",
      "Toms stay on the pads. Watch whether the chart wants a pad or a cymbal.",
      "In YAQ, pick Pro Drums for this kit.",
    ],
  },
  {
    id: "five-lane-drums",
    title: "Five-lane drums",
    blurb:
      "Guitar Hero drum kit: five pads/cymbals plus kick. Both kits here play the same charts.",
    images: [
      {
        src: "/controllers/five-lane-drums-1.png",
        alt: "Five-lane Guitar Hero drum kit",
      },
      {
        src: "/controllers/five-lane-drums-2.png",
        alt: "Five-lane Guitar Hero drum kit, other cabinet style",
      },
    ],
    parts: ["Five-lane drums", "Elite drums"],
    play: [
      "Five lanes: green, red, yellow, blue, and orange, plus the kick pedal.",
      "Hit the matching pad or cymbal when the gem reaches the line.",
      "Kick is its own lane — stomp in time.",
      "The two kits in the photos are different hardware; both play five-lane charts.",
      "If a song has Elite drums, use this kit and pick that part in YAQ.",
    ],
  },
  {
    id: "keys",
    title: "Keys / Pro Keys",
    blurb:
      "Keytar for five-color Keys charts, or real notes for Pro Keys.",
    images: [
      {
        src: "/controllers/keys.png",
        alt: "Keys and Pro Keys keytar controller",
      },
    ],
    parts: ["Keys", "Pro Keys"],
    play: [
      "Keys: the board is five colored ranges (green through orange). Play in the matching color as gems hit the line.",
      "Pro Keys: each gem is a real piano note. Hit that key, not just the color.",
      "Hold notes stay down until the sustain ends. Chords use several keys at once.",
      "Star Power: fill the meter, then press the SP button on the keytar.",
      "In YAQ, pick Keys or Pro Keys to match the chart.",
    ],
  },
  {
    id: "vocals",
    title: "Vocals / Harmony",
    blurb:
      "USB mics. Sing the pitch on the highway. Harmony adds extra vocal parts.",
    images: [
      {
        src: "/controllers/vocals.png",
        alt: "Three USB microphones for vocals and harmony",
      },
    ],
    parts: ["Vocals", "Harmony"],
    play: [
      "Lyrics and a pitch tube scroll on the highway. Sing into the mic on pitch.",
      "Stay in the tube through each phrase for a medal.",
      "Talkies are spoken — don't sing a pitch, just say the line in time.",
      "Star Power comes from well-sung phrases. Trigger it when the meter is full.",
      "Harmony: extra vocal parts so more mics can sing on the same song. Pick Vocals or Harmony in YAQ.",
    ],
  },
];

const BY_ID = new Map(CONTROLLERS.map((item) => [item.id, item]));

export function getController(id: string | undefined): ControllerInfo | undefined {
  if (!id) return undefined;
  return BY_ID.get(id);
}

export function controllerSlugForInstrument(instrument: string): string {
  if (instrument.startsWith("FiveFret")) return "five-fret";
  if (instrument.startsWith("SixFret")) return "six-fret";
  if (instrument.startsWith("ProGuitar") || instrument.startsWith("ProBass")) {
    return "pro-guitar";
  }
  if (instrument === "FourLaneDrums") return "four-lane-drums";
  if (instrument === "ProDrums") return "pro-drums";
  if (/drum/i.test(instrument)) return "five-lane-drums";
  if (instrument === "Keys" || instrument === "ProKeys") return "keys";
  if (instrument === "Vocals" || instrument === "Harmony") return "vocals";
  return "five-fret";
}
