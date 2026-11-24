export interface VoiceOption {
  id: string;
  name: string;
  friendlyLabel: string;
  register: string;
  character: string;
}

export interface SpeakerPreset {
  name: string;
  voiceName: string;
  styleDirection: string;
}

export interface TonePreset {
  id: string;
  label: string;
  direction: string;
}

export interface MusicMoodPreset {
  id: string;
  label: string;
  prompt: string;
}

export interface DocumentaryPreset {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  imageCaption: string;
  recommendedVoice: string;
  styleDirection: string;
  musicMood: string;
  soloScript: string;
  dialogueSpeakers: [SpeakerPreset, SpeakerPreset];
  dialogueScript: string;
}

export const PREBUILT_VOICES: VoiceOption[] = [
  {
    id: "Charon",
    name: "Charon",
    friendlyLabel: "Deep Storyteller",
    register: "Baritone",
    character: "Warm, grounded gravitas for nature & history films",
  },
  {
    id: "Fenrir",
    name: "Fenrir",
    friendlyLabel: "Investigative Host",
    register: "Mid-Low",
    character: "Steady, factual clarity for reporting & true-case stories",
  },
  {
    id: "Kore",
    name: "Kore",
    friendlyLabel: "Warm Biographer",
    register: "Alto",
    character: "Intimate, human warmth for portraits & memoirs",
  },
  {
    id: "Zephyr",
    name: "Zephyr",
    friendlyLabel: "Science Chronicler",
    register: "Tenor",
    character: "Clear, thoughtful wonder for space & discovery",
  },
  {
    id: "Puck",
    name: "Puck",
    friendlyLabel: "Candid Witness",
    register: "Conversational",
    character: "Natural everyday voice for interviews & letters",
  },
];

export const TONE_PRESETS: TonePreset[] = [
  {
    id: "calm",
    label: "Calm & Hushed",
    direction:
      "Hushed, unhurried documentary narrator with soft close-mic warmth and gentle pauses.",
  },
  {
    id: "investigative",
    label: "Serious & Analytical",
    direction:
      "Crisp, sober investigative reporter with steady factual pacing and zero exaggeration.",
  },
  {
    id: "intimate",
    label: "Warm & Reflective",
    direction:
      "Intimate, reflective biographical storyteller with subtle breath and human warmth.",
  },
  {
    id: "grand",
    label: "Authoritative Chronicle",
    direction:
      "Dignified archival historian with rich resonance and measured pacing on key dates.",
  },
];

export const MUSIC_MOOD_PRESETS: MusicMoodPreset[] = [
  {
    id: "forest-strings",
    label: "Misty Forest Strings",
    prompt:
      "Minimalist documentary underscore with warm solo cello, soft felt piano, and gentle atmospheric strings, unhurried and reflective, no drums.",
  },
  {
    id: "archive-piano",
    label: "Tense Archival Piano",
    prompt:
      "Subtle investigative documentary background music, muted upright piano ostinato with faint analog tape texture and low ambient bass pulse.",
  },
  {
    id: "cosmos-synth",
    label: "Deep Space Ambient",
    prompt:
      "Expansive, contemplative science documentary score using warm analog synth pads, distant glass chimes, and slow harmonic swells.",
  },
  {
    id: "acoustic-memoir",
    label: "Warm Acoustic Guitar",
    prompt:
      "Intimate biographical documentary acoustic score with fingerpicked nylon guitar and soft woodwind sustain, gentle and nostalgic.",
  },
];

export const VOCAL_CUES: Array<{
  tag: string;
  label: string;
  hint: string;
  dialogueOnly?: boolean;
}> = [
  { tag: "<breath>", label: "+ Pause / Breath", hint: "Natural pause for emphasis" },
  { tag: "<gasp>", label: "+ Quiet Gasp", hint: "Subtle moment of surprise" },
  { tag: "<laugh>", label: "+ Soft Chuckle", hint: "Warm reflective laugh" },
  {
    tag: "|mhm|",
    label: "+ \"Mhm\"",
    hint: "Natural listener acknowledgement",
    dialogueOnly: true,
  },
  {
    tag: "|yeah|",
    label: "+ \"Yeah\"",
    hint: "Natural interview agreement",
    dialogueOnly: true,
  },
];

export const DOCUMENTARY_PRESETS: DocumentaryPreset[] = [
  {
    id: "natural-history",
    title: "Nature & Wildlife",
    subtitle: "Dawn Canopy & Biosphere",
    image: "/src/assets/images/doc_natural_history_1795556672750.jpg",
    imageCaption: "Scene Reference · Dawn Canopy",
    recommendedVoice: "Charon",
    styleDirection:
      "Hushed, reverent natural-history narrator. Unhurried cadence, warm chest resonance, quiet awe, and deliberate pauses before visual reveals.",
    musicMood:
      "Minimalist nature documentary score with warm solo cello, airy strings, and soft felt piano.",
    soloScript:
      "Beneath the cedar canopy, morning arrives not all at once, <breath> but in slow shafts of amber mist. For three hundred years, these trunks have kept their own quiet ledger—recording drought, fire, and the patient return of rain. <breath> Listen closely, and the forest floor reveals a world that never truly sleeps.",
    dialogueSpeakers: [
      {
        name: "Narrator",
        voiceName: "Charon",
        styleDirection:
          "Hushed, reverent natural-history narrator with warm chest resonance and unhurried phrasing.",
      },
      {
        name: "Biologist",
        voiceName: "Kore",
        styleDirection:
          "Grounded, observational scientist speaking quietly from the field, thoughtful pauses.",
      },
    ],
    dialogueScript:
      "Narrator: At five thousand feet, the fog line holds steady against the ridge. <breath> Every square meter of moss here filters gallons of coastal moisture.\nBiologist: |mhm| When we first rigged sensors in the upper canopy, we expected silence. <breath> Instead, we recorded twenty-four distinct micro-climates stacked inside a single tree.",
  },
  {
    id: "investigative-archive",
    title: "True Case & Archive",
    subtitle: "Nocturnal Case Ledger",
    image: "/src/assets/images/doc_archive_city_1795556673412.jpg",
    imageCaption: "Scene Reference · River Crossing",
    recommendedVoice: "Fenrir",
    styleDirection:
      "Sober, analytical investigative documentary journalist. Crisp diction, steady pacing, understated gravity on dates and evidence.",
    musicMood:
      "Understated investigative documentary underscore with muted upright piano pulse and low ambient tension.",
    soloScript:
      "On the night of November fourteenth, the stone bridge carried only two crossings after midnight. <breath> A municipal logbook, tucked inside a flooded basement archive for forty years, would eventually alter every timeline investigators thought they knew. <breath> Nothing in the official record explained why the streetlamps along the south bank went dark at one eighteen a.m.",
    dialogueSpeakers: [
      {
        name: "Reporter",
        voiceName: "Fenrir",
        styleDirection:
          "Crisp, sober investigative reporter with measured analytical pacing and dry clarity.",
      },
      {
        name: "Archivist",
        voiceName: "Puck",
        styleDirection:
          "Quiet, precise historian recalling a forgotten discovery with subtle tension.",
      },
    ],
    dialogueScript:
      "Reporter: You found the ledger behind a false wall in the annex—not in the cataloged vaults.\nArchivist: |yeah| That's right. <breath> The binding was water-stained, <gasp> and half the ink had bled through, but the bridge-keeper's timestamps were unmistakable.",
  },
  {
    id: "cosmic-science",
    title: "Space & Science",
    subtitle: "Observatory & Deep Time",
    image: "/src/assets/images/doc_cosmos_observatory_1795556673949.jpg",
    imageCaption: "Scene Reference · Twilight Observatory",
    recommendedVoice: "Zephyr",
    styleDirection:
      "Calm, contemplative scientific chronicler. Clear articulation, steady wonder, unhurried cadence that gives vast timescales room to breathe.",
    musicMood:
      "Contemplative science documentary score with warm analog synth pads and soft glass harmonics.",
    soloScript:
      "Before the shutter opens, the dome must cool to match the night air outside—<breath> even a single degree of warmth bends starlight into blur. Look upward through two inches of polished glass, and distance stops behaving like geography. <breath> The light striking this plate left its source before Earth's continents had drifted into their present shapes.",
    dialogueSpeakers: [
      {
        name: "Narrator",
        voiceName: "Zephyr",
        styleDirection:
          "Calm, contemplative science chronicler with luminous clarity and measured pacing.",
      },
      {
        name: "Astronomer",
        voiceName: "Charon",
        styleDirection:
          "Seasoned observatory director, unhurried baritone, quiet philosophical warmth.",
      },
    ],
    dialogueScript:
      "Narrator: For six hours, the clockwork drive tracks a single patch of dark sky no wider than a grain of sand held at arm's length.\nAstronomer: |mhm| People think astronomy is about brightness. <breath> Really, it is an exercise in patience—waiting for faint photons to arrive one by one.",
  },
  {
    id: "biographical-essay",
    title: "Biography & Memoir",
    subtitle: "Letters & Personal Essay",
    image: "/src/assets/images/doc_archive_city_1795556673412.jpg",
    imageCaption: "Scene Reference · Evening Crossing",
    recommendedVoice: "Kore",
    styleDirection:
      "Intimate, literary biographical narrator. Warm alto timbre, reflective pacing, subtle breath before memory shifts, close-mic presence.",
    musicMood:
      "Intimate biographical documentary music with delicate acoustic guitar and soft warm strings.",
    soloScript:
      "She kept every draft in a cedar box beneath her drafting table—<breath> unfinished margins, train tickets from Lyon, and three postcards she never mailed. To read them now is to hear someone arguing softly with her younger self, <breath> trying to decide what was worth leaving behind.",
    dialogueSpeakers: [
      {
        name: "Biographer",
        voiceName: "Kore",
        styleDirection:
          "Warm, reflective literary narrator with intimate close-mic presence.",
      },
      {
        name: "Curator",
        voiceName: "Zephyr",
        styleDirection:
          "Thoughtful museum curator reading archival notes with quiet reverence.",
      },
    ],
    dialogueScript:
      "Biographer: In the autumn of nineteen sixty-two, her correspondence stops abruptly for eleven weeks.\nCurator: |yeah| Until this notebook turned up, <breath> everyone assumed she had stopped writing altogether.",
  },
  {
    id: "historical-chronicle",
    title: "History & Heritage",
    subtitle: "Archival Turning Points",
    image: "/src/assets/images/doc_natural_history_1795556672750.jpg",
    imageCaption: "Scene Reference · Northern Timberline",
    recommendedVoice: "Charon",
    styleDirection:
      "Dignified historical documentary voice. Rich baritone authority, measured cadence, gravitas on historical dates, restrained emotional weight.",
    musicMood:
      "Dignified historical documentary score with orchestral strings, woodwinds, and subtle timpani warmth.",
    soloScript:
      "By the spring of eighteen eighty-nine, the timber barges had vanished from the upper river. <breath> What remained along the banks were stone foundations, rusted mooring rings, and a town forced to reinvent itself in a single winter. History rarely announces when an era ends; <breath> it simply stops sending the next shipment.",
    dialogueSpeakers: [
      {
        name: "Historian",
        voiceName: "Charon",
        styleDirection:
          "Dignified archival historian with rich baritone authority and measured cadence.",
      },
      {
        name: "Diary Reader",
        voiceName: "Fenrir",
        styleDirection:
          "Resonant archival reader delivering period diary excerpts with quiet restraint.",
      },
    ],
    dialogueScript:
      "Historian: By May, the riverfront sawmills had fallen completely silent.\nDiary Reader: <breath> We stacked the last seasoned pine on the north wharf, the foreman wrote, and waited for orders that never arrived.",
  },
];
