/* PokaSnap 2.2 — data-driven configuration (Phase C1.1: paw controller + commercial board).
   Everything gameplay tunes lives here so simulations and future worlds can
   change content without touching behaviour code. C1 scope: Puddle Park
   (40 spaces, 10 landmarks), Pudding (the owner's cream lop rabbit) only. */

/* ------------------------------------------------------------------ board -- */
/* C1.1 geometry: four large corner anchors + nine spaces between each pair of
   corners (4 + 36 = 40). Side tiles are 1 unit wide and as deep as a corner,
   like a classic square trail, so the board reads big and rhythmic. */
/* C1.2 physical world: Pudding walks the INNER lane of every tile (lane = inward
   offset from the tile centre line); landmarks and tile props stand on the outer
   half. Footprint radius = island px x scale / 100 (landmarks.js FOOT). */
export const LANE = 0.3, PET_R = 0.26;
/* C1.5: tiles carry their own icon + word, so every landmark stands OFF the trail on its own lot. */
export const LM_PLACE = { corner: { off: 2.2, s: 1.25 }, near: { off: 2.3, s: 1.3 }, far: { off: 2.3, s: 1.55 } };
export const PROP_FOOT = 0.2;
export const BOARD = {
  perSide: 10,                // spaces per side INCLUDING the corner that starts it
  between: 9,                 // ordinary spaces between corners
  corner: 1.6,                // corner anchor size (world units)
  tile: 1.0,                  // ordinary space width along the side
  gap: 0.07,
};
export const SPACE_COUNT = BOARD.perSide * 4;
export const BOARD_HALF = BOARD.corner + BOARD.between * BOARD.tile / 2;
export const CORNERS = [0, 10, 20, 30];

/* The 10 Puddle Park landmarks. The four corner anchors are Poka Gate, Poka
   Café, Training Trail and Scenic Lookout; six more sit on the sides. Each
   carries the full behaviour contract the directive requires. */
export const LANDMARKS = [
  { id: 'gate', name: 'Poka Gate', space: 0, side: 'out',
    idle: 'flags', landing: { trigger: 'arrive', reactions: ['look-up', 'hop-greet'], photoHooks: ['arrival portrait', 'gate silhouette'], output: { coins: 20 } },
    upgrades: ['Stone arch', 'Ticket kiosk + lanterns', 'Flower crown + topiary'], albumTags: ['arrival', 'landmark:gate'] },
  { id: 'fountain', name: 'Fountain Plaza', space: 5, side: 'out',
    idle: 'water', landing: { trigger: 'splash', reactions: ['sniff-water', 'shake-off', 'watch-drops'], photoHooks: ['splash moment', 'reflection'], output: { coins: 15 } },
    upgrades: ['Stone basin', 'Second tier + benches', 'Bunny statue + rainbow jets'], albumTags: ['water', 'landmark:fountain'] },
  { id: 'snack', name: 'Snack Stop', space: 13, side: 'out',
    idle: 'steam', landing: { trigger: 'treat-choice', reactions: ['nibble', 'beg', 'happy-chew'], photoHooks: ['food face', 'treat close-up'], output: { mood: +1 } },
    upgrades: ['Snack cart', 'Umbrella + menu board', 'Kiosk hut + lights'], albumTags: ['food', 'landmark:snack'] },
  { id: 'garden', name: 'Butterfly Garden', space: 17, side: 'out',
    idle: 'butterflies', landing: { trigger: 'flutter', reactions: ['watch-butterfly', 'chase-hop', 'freeze-stare'], photoHooks: ['butterfly on nose', 'flower frame'], output: { rareChance: 0.15 } },
    upgrades: ['Flower beds', 'Greenhouse + birdbath', 'Blossom arch + butterfly house'], albumTags: ['nature', 'landmark:garden', 'rare'] },
  { id: 'field', name: 'Fetch Field', space: 27, side: 'out',
    idle: 'cones', landing: { trigger: 'play-bonus', reactions: ['zoomies', 'binky', 'nudge-ball'], photoHooks: ['mid-air binky', 'run streak'], output: { playBonus: 1 } },
    upgrades: ['Cone course', 'Hoops + tunnel', 'Agility ramp + scoreboard'], albumTags: ['play', 'landmark:field'] },
  { id: 'pond', name: 'Puddle Pond', space: 24, side: 'out',
    idle: 'ducks', landing: { trigger: 'water-edge', reactions: ['drink', 'watch-ducks', 'paw-ripple'], photoHooks: ['duck encounter', 'pond reflection'], output: { coins: 15 } },
    upgrades: ['Reed pond', 'Lily pads + duck house', 'Lantern bridge'], albumTags: ['water', 'landmark:pond', 'scenic'] },
  { id: 'gazebo', name: 'Grooming Gazebo', space: 33, side: 'out',
    idle: 'bubbles', landing: { trigger: 'groom', reactions: ['fluff-up', 'sneeze', 'proud-pose'], photoHooks: ['before/after fluff', 'bubble bath'], output: { clean: true } },
    upgrades: ['Gazebo', 'Bubble tub', 'Mirror, bows + salon wing'], albumTags: ['care', 'landmark:gazebo'] },
  { id: 'cafe', name: 'Poka Café', space: 10, side: 'out',
    idle: 'patrons', landing: { trigger: 'rest', reactions: ['loaf', 'sniff-cup', 'nap'], photoHooks: ['café loaf', 'two-pet table'], output: { mood: +1 } },
    upgrades: ['Cottage café', 'Awning + patio', 'Bakery wing + chimney'], albumTags: ['calm', 'social', 'landmark:cafe'] },
  { id: 'trail', name: 'Training Trail', space: 20, side: 'out',
    idle: 'flags', landing: { trigger: 'train', reactions: ['hurdle-hop', 'tunnel-peek', 'ready-stance'], photoHooks: ['hurdle clear', 'tunnel peek'], output: { raceFlags: 1 } },
    upgrades: ['Hurdle track', 'Weave poles + tunnel', 'Clubhouse + stopwatch'], albumTags: ['weekly:race', 'landmark:trail'] },
  { id: 'lookout', name: 'Scenic Lookout', space: 30, side: 'out',
    idle: 'clouds', landing: { trigger: 'view', reactions: ['gaze', 'ears-in-wind', 'sit-pretty'], photoHooks: ['sunset silhouette', 'wide vista'], output: { scenic: true } },
    upgrades: ['Wooden deck', 'Telescope, flags + stair', 'Roofed top + photo frame'], albumTags: ['scenic', 'landmark:lookout', 'weather'] },
];

/* C1.5 board grammar (owner-locked): 4 one-word corners + nine one-word space
   types, each exactly once between every pair of corners (4 + 9x4 = 40). The
   space registry is data: tests count it, the renderer draws it, the rules
   resolve it. Hues and icons follow the owner reference images. */
export const CORNER_TYPES = ['stage', 'album', 'poka', 'home'];
export const SPACE_TYPES = ['treat', 'stash', 'snap', 'build', 'lucky', 'pose', 'play', 'care', 'rush'];
export const TILE_TYPES = {
  stage: { label: 'STAGE', hue: '#ffd23f', icon: 'flag',     corner: true,  purpose: 'Pass for Snaps + Speedshot. Land for a bigger show.' },
  album: { label: 'ALBUM', hue: '#ffd23f', icon: 'album',    corner: true,  purpose: 'Album progress and a photo objective reveal.' },
  poka:  { label: 'POKA',  hue: '#ffd23f', icon: 'paw',      corner: true,  purpose: 'Collection progress for your Poka.' },
  home:  { label: 'HOME',  hue: '#ffd23f', icon: 'house',    corner: true,  purpose: 'Homecoming: a little rest and a return bonus.' },
  treat: { label: 'TREAT', hue: '#ff9cc2', icon: 'gift',     purpose: 'Fills a Treat. Treats protect your Stash.' },
  stash: { label: 'STASH', hue: '#ffc94d', icon: 'chest',    purpose: 'Dig for a hidden Stash.' },
  snap:  { label: 'SNAP',  hue: '#7fd0ff', icon: 'camera',   purpose: 'A Snap refill.' },
  build: { label: 'BUILD', hue: '#ffb366', icon: 'hammer',   purpose: 'Build progress on a landmark.' },
  lucky: { label: 'LUCKY', hue: '#7fe08a', icon: 'clover',   purpose: 'A quick surprise.' },
  pose:  { label: 'POSE',  hue: '#a9b8ff', icon: 'lens',     purpose: 'A posed photo window.' },
  play:  { label: 'PLAY',  hue: '#c39bff', icon: 'pad',      purpose: 'A tiny toy moment.' },
  care:  { label: 'CARE',  hue: '#ff8f9e', icon: 'heart',    purpose: 'A little care: mood and photo bonus.' },
  rush:  { label: 'RUSH',  hue: '#ff7a59', icon: 'rocket',   purpose: 'Zoomies: bonus spaces and a Speedshot.' },
};
/* §9 recommended sequence, clockwise from STAGE. */
export const SEQUENCE = [
  'stage', 'treat', 'pose', 'stash', 'snap', 'care', 'lucky', 'play', 'build', 'rush',
  'album', 'snap', 'care', 'treat', 'lucky', 'stash', 'rush', 'build', 'play', 'pose',
  'poka', 'build', 'stash', 'pose', 'play', 'treat', 'snap', 'rush', 'care', 'lucky',
  'home', 'rush', 'play', 'lucky', 'snap', 'pose', 'build', 'care', 'stash', 'treat',
];
/* back-compat alias for older renderer code paths: one hue per type */
export const CATEGORIES = Object.fromEntries(Object.entries(TILE_TYPES).map(([k, v]) => [k, { label: v.label, hue: v.hue, glyph: v.icon, purpose: v.purpose }]));
export const SPACES = SEQUENCE.map((type, i) => {
  const lm = LANDMARKS.find(l => l.space === i);
  return { id: `pp-${String(i).padStart(2, '0')}-${type}`, index: i, type, cat: type, label: TILE_TYPES[type].label, name: TILE_TYPES[type].label, corner: CORNERS.includes(i), landmark: lm ? lm.id : null, prop: i % 2 };
});

/* ---------------------------------------------------------------- objects -- */
/* Objects choose the travel RANGE; the species reaction table chooses the
   behaviour family. The exact distance is rolled inside the range. */
export const OBJECTS = {
  frisbee: { id: 'frisbee', name: 'Frisbee',     min: 3, max: 6, speed: 4.2, icon: 'frisbee' },
  ball:    { id: 'ball',    name: 'Ball',        min: 2, max: 5, speed: 3.4, icon: 'ball' },
  treat:   { id: 'treat',   name: 'Treat',       min: 1, max: 3, speed: 1.4, icon: 'treat' },
  bubble:  { id: 'bubble',  name: 'Bubble Wand', min: 2, max: 4, speed: 2.2, icon: 'bubble' },
};
export const OBJECT_ORDER = ['ball', 'frisbee', 'treat', 'bubble'];

/* ---------------------------------------------------------------- species -- */
/* One entry per launch species; C1 implements rabbit only. Reaction families
   must be plausible for the animal (rabbits do not mouth-catch frisbees).
   weight = how strongly the species engages (drives reaction intensity). */
export const SPECIES = {
  rabbit: { id: 'rabbit', name: 'Rabbit', implemented: true,
    reactions: {
      ball:    { family: 'nudge',    weight: 0.9, note: 'hop-chase, nose-nudges the ball along, binky when it stops' },
      frisbee: { family: 'hopchase', weight: 0.7, note: 'hops after it, sniffs it where it lands, no retrieve' },
      treat:   { family: 'savor',    weight: 1.0, note: 'cautious approach, nibble, savor' },
      bubble:  { family: 'hop',      weight: 0.9, note: 'hops, rears up, paws at bubbles' },
    },
    idle: ['nose-twitch', 'groom', 'loaf', 'ear-flick', 'look-around'],
  },
};
export const LAUNCH_SPECIES = ['dog', 'cat', 'rabbit', 'hamster', 'guinea_pig', 'ferret', 'chinchilla', 'gerbil', 'budgie', 'turtle'];

/* ---------------------------------------------------------------- economy -- */
/* Owner-locked multiplier set. Availability follows the Snap Roll wallet:
   the highest multiplier allowed is the last rung whose reserve you hold.
   PokaSnap tuning values, data-driven. */
export const MULTIPLIERS = [1, 5, 10, 20, 50, 100];
export const MULTIPLIER_LADDER = [
  { min: 0, max: 1 }, { min: 50, max: 5 }, { min: 100, max: 10 }, { min: 300, max: 20 }, { min: 1000, max: 50 }, { min: 2000, max: 100 },
];
/* The wallet regenerates naturally only up to the soft cap; rewards, events
   and gifts may push it above, where natural regen pauses. */
/* C1.5: Snaps replace the old roll. Soft cap 400; regen arrives in chunks and stops at the cap;
   earned Snaps may push the reserve above it. */
export const SNAP_ROLL = { cap: 400, start: 232, regenChunk: 40, regenEveryMs: 60 * 60 * 1000 };
export const SNAP_COINS = 10;               // coins per qualifying snap at x1 (multiplier scales this)
export const BATCH_OPTIONS = [5, 10, 15, 20, 'MAX'];
export const BATCH_DEFAULT = 10;
/* Slow motion: VISUAL playback only. Never touches distance, RNG, score or rewards. */
export const SPEEDS = [
  { id: 'normal', factor: 1.0, glyph: '▶' },
  { id: 'slow', factor: 0.6, glyph: '▶▶' },
  { id: 'veryslow', factor: 0.35, glyph: '▶▶▶' },
];
export const DAILY_TREAT_ROLL = 250;        // a gift that can lift the wallet above the soft cap

/* ------------------------------------------------------------ C1.5 board -- */
/* One SNAP press = one movement. Distance is rolled from MOVE and NEVER reads the
   multiplier. Two independent 1..6 picks give a 2..12 spread centred on 7 (no dice shown). */
export const MOVE = { parts: [6, 6] };
/* Rewards. 'scaled' rewards are multiplied by the active multiplier (eligible economy);
   Treats, Album, Build steps and collection progress never scale. */
export const STAGE = { pass: { snaps: 40, coins: 200 }, land: { snaps: 120, coins: 600 },
  speedshot: { pass: { seconds: 4, shots: 4 }, land: { seconds: 6, shots: 6 } } };
export const TREATS = { max: 5, start: 3, overflowSnaps: 10 };
/* Milestone points never live here: the ACTIVE Quick Milestone event's rules decide them. */
export const TILE_REWARDS = {
  treat: { treats: 1 },
  snap:  { snaps: 15 },
  build: { buildSteps: 1, coins: 50 },
  care:  { mood: 1, coins: 30 },
  play:  { coins: 40, photoWindowS: 2.5 },
  pose:  { photoWindowS: 4 },
  rush:  { extraSpaces: [1, 3] },
  album: { photoWindowS: 3 }, poka: { collection: 1 }, home: { mood: 1, snaps: 10, coins: 80 },
};
export const SCALED = ['coins', 'snaps', 'points'];
/* LUCKY: quick, never punitive. weights sum to 1. */
export const LUCKY = [
  { id: 'snaps', w: 0.24, snaps: 25 }, { id: 'coins', w: 0.22, coins: 150 }, { id: 'treat', w: 0.14, treats: 1 },
  { id: 'poka', w: 0.1, collection: 1 }, { id: 'warp', w: 0.08, warp: 'next-stage-approach' }, { id: 'build', w: 0.08, buildSteps: 1 },
  { id: 'photo', w: 0.08, photoWindowS: 3 }, { id: 'points', w: 0.06, points: 6 },
];
/* STASH dig: original pet-native mini-dig (not a heist). Limited digs over a 3x3 bed; clue
   kinds hint at what is buried. Losses for the target are capped and Treat-protected. */
export const STASH = { digs: 3, cells: 9, maxLossCoins: 600, lossShare: 0.08, jackpotChance: 0.08,
  loot: [ { id: 'coins', w: 0.34, coins: 220, clue: 'sparkle' }, { id: 'snaps', w: 0.24, snaps: 20, clue: 'pawprint' },
          { id: 'treat', w: 0.12, treats: 1, clue: 'carrot-top' }, { id: 'poka', w: 0.1, collection: 1, clue: 'ribbon' },
          { id: 'prop', w: 0.08, cosmetic: 'acorn-cap', clue: 'root' }, { id: 'photo', w: 0.06, photoWindowS: 3, clue: 'glint' },
          { id: 'dirt', w: 0.06, coins: 20, clue: 'dirt' } ],
  jackpot: { coins: 1200, snaps: 60, clue: 'sparkle' } };
/* AI/demo Stash targets used offline or when no valid player target exists. */
export const STASH_TARGETS = [ { id: 'demo-mochi', name: 'Mochi', species: 'rabbit', coins: 5400, treats: 2, ai: true },
  { id: 'demo-biscuit', name: 'Biscuit', species: 'dog', coins: 3800, treats: 0, ai: true },
  { id: 'demo-pip', name: 'Pip', species: 'hamster', coins: 2600, treats: 4, ai: true } ];

/* Quick Milestones: one limited-time bar under the top HUD. Data-driven per event. */
export const MILESTONE_EVENTS = {
  bloom: { id: 'bloom', title: 'BLOOM', hours: 50, rules: { treat: 2, pose: 3, gardenPhoto: 5, stage: 3, stash: 2, care: 1, play: 1, lucky: 1, rush: 1, snap: 1, build: 1, album: 2, poka: 2, home: 1, photo: 1, albumPhoto: 4 },
    tiers: [ { at: 10, reward: { snaps: 25 } }, { at: 25, reward: { treats: 1 } }, { at: 45, reward: { coins: 500 } },
             { at: 70, reward: { snaps: 60 } }, { at: 100, reward: { buildSteps: 1 } }, { at: 140, reward: { collection: 1 } },
             { at: 200, reward: { snaps: 120 } }, { at: 300, reward: { coins: 3000 } }, { at: 500, reward: { snaps: 375 } } ] },
  stash: { id: 'stash', title: 'STASH', hours: 24, rules: { stash: 3, dig: 5, jackpot: 10 }, tiers: [ { at: 20, reward: { snaps: 30 } }, { at: 60, reward: { coins: 900 } } ] },
  snap:  { id: 'snap', title: 'SNAP', hours: 24, rules: { snap: 2, photo: 3, albumPhoto: 8 }, tiers: [ { at: 20, reward: { snaps: 30 } }, { at: 60, reward: { treats: 1 } } ] },
  rush:  { id: 'rush', title: 'RUSH', hours: 24, rules: { rush: 2, gameFinish: 5 }, tiers: [ { at: 20, reward: { snaps: 30 } }, { at: 60, reward: { coins: 900 } } ] },
};
export const ACTIVE_MILESTONE = 'bloom';

/* Seasonal Album: each slot is a photo objective; only a qualifying real photo completes it. */
export const ALBUM_SEASON = { id: 'spring', title: 'Spring', slots: [
  { id: 'jump', label: 'Jump', need: p => p.airborne },
  { id: 'treat', label: 'Treat', need: p => p.phase === 'eat' || p.phase === 'savor' || p.tile === 'treat' },
  { id: 'dig', label: 'Dig', need: p => p.phase === 'dig' },
  { id: 'pose', label: 'Pose', need: p => p.phase === 'pose' },
  { id: 'friend', label: 'Friend', need: p => p.tile === 'play' || p.landmark === 'cafe' },
  { id: 'splash', label: 'Splash', need: p => p.landmark === 'fountain' || p.landmark === 'pond' },
  { id: 'rare', label: 'Rare', need: p => p.score >= 80 },
  { id: 'finish', label: 'Finish', need: p => !!p.game },
  { id: 'sunset', label: 'Sunset', need: p => p.landmark === 'lookout' },
] };

/* Desktop keyboard: every key calls the SAME action path as the matching paw button.
   Values are paw ROLES (center/left/upLeft/upRight/right), resolved per mode through PAW_MODES. */
export const KEYMAP = {
  main:   { ' ': 'center', ArrowLeft: 'left', ArrowUp: 'upLeft', ArrowRight: 'right', ArrowDown: 'upRight' },
  race:   { ' ': 'upRight', ArrowLeft: 'upLeft', ArrowUp: 'center', ArrowRight: 'right', ArrowDown: 'left' },
  switch: { ' ': 'right', ArrowLeft: 'left', ArrowUp: 'center', ArrowRight: 'upLeft', ArrowDown: 'upRight' },
  dance:  { ' ': 'center', ArrowLeft: 'left', ArrowDown: 'upLeft', ArrowUp: 'upRight', ArrowRight: 'right' },
  flight: { ' ': 'upRight', ArrowUp: 'center', ArrowLeft: 'left', ArrowRight: 'upLeft', ArrowDown: 'right' },
};
/* Arrow glyph shown on each pad on desktop (derived from KEYMAP so hints never drift). */
export const KEY_GLYPH = { ' ': 'SPACE', ArrowLeft: '←', ArrowUp: '↑', ArrowRight: '→', ArrowDown: '↓' };

/* ----------------------------------------------------------------- camera -- */
/* Presets are relative to the Poka's heading. yaw 0 = looking at the face.
   'board' is Board Mode; every other preset is Camera Mode. */
export const CAMERA_PRESETS = {
  front:    { id: 'front',    name: 'Front',    yaw: 0.35,         pitch: 0.30, dist: 3.4 },
  side:     { id: 'side',     name: 'Side',     yaw: Math.PI / 2,  pitch: 0.26, dist: 3.6 },
  back:     { id: 'back',     name: 'Back',     yaw: Math.PI - 0.3, pitch: 0.32, dist: 3.4 },
  elevated: { id: 'elevated', name: 'Elevated', yaw: 0.55,         pitch: 0.72, dist: 3.3 },
  board:    { id: 'board',    name: 'Board',    yaw: 0,            pitch: 0.97, dist: 19.5, overview: true },
};
export const CAMERA_ORDER = ['front', 'side', 'back', 'elevated'];
/* The paw's camera toe shows one letter per view. A = the elevated 3/4 view. */
export const CAMERA_LETTERS = { front: 'F', side: 'S', back: 'B', elevated: 'A' };

/* ------------------------------------------------------------------ world -- */
export const WORLDS = {
  park: { id: 'park', name: 'Puddle Park', sky: ['#6fc0ef', '#b9e4f7', '#fff1d8'], grass: ['#8fd16a', '#5aa94c'] },
};

/* ----------------------------------------------------------------- the pet -- */
export const PET = {
  id: 'pudding', name: 'Pudding', species: 'rabbit', look: 'lop',
  // Owner's Pudding (owner-save 2026-09-29): bunny / lop (cream "Snowdrop"), mischievous, blue bow tie.
  pal: { base: '#f7f4f0', shade: '#e3cfb8', deep: '#c6a988', belly: '#ffffff', inner: '#f6b4c4', eye: '#b8434f', nose: '#f08aa0', line: '#8f6f58' },
  wear: { neck: 'bowtie_blue' },
};

/* ------------------------------------------------------------------ radio -- */
/* Poka Radio default library. Albums select catalog tracks by metadata; the
   exclusion list is explicit track IDs with a provenance note, never a
   filename pattern. FCAWF mapping is a PROPOSAL pending owner confirmation:
   the catalog has no FCAWF field, so these two IDs were matched by title. */
export const RADIO = {
  defaultAlbum: 'animal-rave',
  albums: [
    { id: 'animal-rave', title: 'Animal Rave', artist: 'KEEPITIL', match: { album: 'Animal Rave' }, excludeTags: ['fcawf'] },
  ],
  tags: {
    sc2238023804: ['fcawf'],   // "F-CAWF"  (title match; owner to confirm)
    sc2238023792: ['fcawf'],   // "Fa-CAWF" (title match; owner to confirm)
  },
  fcawfStatus: 'proposed-by-title-pending-owner-confirmation',
  unresolved: [
    { id: 'sc2238023780', title: 'QUACK QUACK', why: 'Animal Rave artwork but album:null in the catalog; not included until the owner confirms.' },
  ],
  youtube: {
    clientId: null,             // owner must supply a Google OAuth client for the Connect YouTube flow
    scope: 'https://www.googleapis.com/auth/youtube',
    playlistTitle: 'My Poka Radio',
  },
};

/* ------------------------------------------------------------ live widgets -- */
/* Board-Mode side widgets. Each has its OWN silhouette (no shared card box). */
export const WIDGETS = [
  { id: 'shop',   rail: 'left',  label: 'SHOP',   tag: '2h 10m' },
  { id: 'race',   rail: 'left',  label: 'RACE',   tag: '3d 11h' },
  { id: 'garden', rail: 'left',  label: 'GARDEN', tag: '67%', progress: 0.67 },
  { id: 'treats', rail: 'right', label: 'TREATS', tag: '2h 10m' },
  { id: 'photo',  rail: 'right', label: 'PHOTO',  tag: '2d 22h' },
  { id: 'team',   rail: 'right', label: 'TEAM',   tag: '2d 2h' },
];

/* ------------------------------------------------------------- weekly game -- */
/* The centre stage framework: one inner footprint, one game per week. C1.1
   proves Race. The paw keeps its silhouette; only the verbs remap. */
export const WEEKLY = {
  race: { id: 'race', name: 'Poka Race', targetS: [90, 120], paw: { center: 'JUMP', left: 'ITEM', upLeft: 'DODGE', upRight: 'SNAP', right: 'BOOST' } },
};
export const MAIN_PAW = { center: 'SNAP', left: 'THROW', upLeft: 'SPEED', upRight: 'VIEW', right: 'MULT' };
/* C1.4 universal five-pad paw: every mode shows all five pads and every pad is a real action.
   Spatial grammar: outer-left = item / left action, inner-left = movement or utility,
   inner-right = photography / right action, outer-right = mode utility / boost,
   centre = the most frequent action. (Switch follows the owner-locked mapping.) */
export const PAW_MODES = {
  main:   { center: { act: 'snap',   label: 'SNAP' },   left: { act: 'throw', label: 'THROW' }, upLeft: { act: 'speed', label: 'SPEED' }, upRight: { act: 'view', label: 'VIEW' },  right: { act: 'mult', label: 'MULT' } },
  race:   { center: { act: 'jump',   icon: '⤒', label: 'JUMP' }, left: { act: 'item', icon: '🎁', label: 'ITEM' }, upLeft: { act: 'dodge', icon: '↻', label: 'ROLL' }, upRight: { act: 'snap', icon: '📷', label: 'SNAP' }, right: { act: 'boost', icon: '⚡', label: 'BOOST' } },
  dance:  { center: { act: 'snap',   icon: '📷', label: 'SNAP' }, left: { act: 'lane0', icon: '◀', label: '1' }, upLeft: { act: 'lane1', icon: '▼', label: '2' }, upRight: { act: 'lane2', icon: '▲', label: '3' }, right: { act: 'lane3', icon: '▶', label: '4' } },
  flight: { center: { act: 'flap',   icon: '🎈', label: 'FLAP' }, left: { act: 'item', icon: '🎁', label: 'ITEM' }, upLeft: { act: 'view', icon: '🔭', label: 'VIEW' }, upRight: { act: 'snap', icon: '📷', label: 'SNAP' }, right: { act: 'recover', icon: '✚', label: 'SAVE' } },
  switch: { center: { act: 'jump',   icon: '⤒', label: 'JUMP' }, left: { act: 'left', icon: '⬅', label: 'LEFT' }, upLeft: { act: 'right', icon: '➡', label: 'RIGHT' }, upRight: { act: 'slide', icon: '⤓', label: 'SLIDE' }, right: { act: 'snap', icon: '📷', label: 'SNAP' } },
};
export const PAW_ROLES = ['center', 'left', 'upLeft', 'upRight', 'right'];
/* Visible internal build identity (C1.4): shown in the preview corner, the menu and stable Settings. */
export const BUILD = { phase: 'C1.6A', build: 22, label: 'PokaSnap · C1.6A · build 22' };
