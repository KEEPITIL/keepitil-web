/* ECONOMY — every tunable number in PokaSnap lives here.
   ---------------------------------------------------------------------------
   Launch-balancing values, not permanent constants. Game logic reads these;
   UI never hard-codes a price, reward, cap, milestone or quota.

   One spendable currency: Poka Coins. Adventure Points are a progress counter
   for events, never spendable. Principle: PLAY FOR IT -> SUBSCRIBE PAST THE
   GRIND -> BUY IT NOW. A free player always has the whole photo game. */

export const CURRENCY = { id: 'coins', name: 'Poka Coins', short: 'Coins' };
export const POINTS = { id: 'ap', name: 'Adventure Points', short: 'AP' };   // progress only

/* ---------------------------------------------------------------- earning -- */
export const EARN = {
  dailySnap: 50, dailySnapPlus: 75,
  missionFirstClear: { 1: 25, 2: 25, 3: 35 },   // by mission difficulty; replays pay XP/score only
  journeySnap: 25,
  training: 10,
  care: 5,
  rareMoment: 25,
  rewardedMedia: 25,
  welcomeBack: 15,
  dailyBondBonus: 20,          // all four daily-card tasks
  stepMilestones: { 1000: 20, 2500: 25, 5000: 30, 7500: 40, 10000: 50 },
  walkSession: { 10: 5, 20: 10, 30: 15 },         // minutes -> coins
};
export const XP = {
  dailySnap: 30, journeySnap: 15, care: 6, training: 10, rareMoment: 15,
  stepMilestones: { 2500: 20, 5000: 20, 7500: 25, 10000: 30 },   // Bond XP
  walkSession: { 30: 30 },
};

/* ---------------------------------------------------------------- caps -- */
export const CAPS = {                 // rewarded occurrences per local day
  care: 3, training: 1, journeySnap: 3, rareMoment: 3, rewardedMedia: 3,
  missionReplayCoins: 0,               // repeat clears earn XP/score, not coins
  stepsSanityPerDay: 100000,           // above this, a day is flagged, not paid
  stepsSanityPer10Min: 5000,           // an impossible jump is flagged, not paid
  clockSkewToleranceMs: 10 * 60e3,     // clock moved back further than this -> time rewards pause
};
/* Targets used by the balance test, so tuning cannot silently drift. */
export const DAILY_TARGETS = { casual: [75, 150], regular: [150, 250], active: [250, 350] };

/* ---------------------------------------------------------------- sinks -- */
export const PRICE = {               // coin prices by item class (items.js references these)
  basicAccessory: 300, basicAccessoryPlus: 400, premiumAccessory: 700,
  frame: 400, framePremium: 600, pose: 1000, outfit: 1200, highValue: 1800,
};

/* ----------------------------------------------------- commitment tracks -- */
export const ACTIVE_DAY_ACTIONS = ['dailySnap', 'mission', 'journeySnap', 'training', 'care', 'steps', 'rareMoment', 'event', 'walk'];
export const STREAK_LADDER = [                     // consecutive days; repeats weekly
  { day: 1, coins: 10 }, { day: 2, coins: 10 }, { day: 3, coins: 15 },
  { day: 4, coins: 20, label: 'Small bonus' }, { day: 5, coins: 15 },
  { day: 6, coins: 10, points: 10, label: 'Frame progress' }, { day: 7, coins: 60, label: 'Streak bonus' },
];
export const WEEKLY_ACTIVE = [                    // active days within the local week (Mon-Sun)
  { days: 1, coins: 15 }, { days: 3, coins: 50 }, { days: 5, coins: 100, points: 20, label: 'Headline progress' }, { days: 7, coins: 150 },
];
export const MONTHLY_ACTIVE = [                   // active days within the calendar month
  { days: 4, coins: 100 }, { days: 8, coins: 150, item: 'frame_confetti' }, { days: 12, coins: 200 },
  { days: 16, item: 'neck_star_scarf' }, { days: 20, item: 'pose_bow' }, { days: 25, keepsake: true, label: 'Monthly collection reward' },
];

/* ---------------------------------------------------------------- walking -- */
export const STEP_MILESTONES = [1000, 2500, 5000, 7500, 10000];
export const JOURNEY = { unlockAtSteps: 5000, unlockAtWalkMinutes: 10, perDay: 3 };
export const WALK_SESSION_MILESTONES = [10, 20, 30];     // minutes
export const WALK_CHEST = { points: 20 };                // 10,000 steps or a 30-minute walk

/* ---------------------------------------------------------------- events -- */
/* Adventure Points per action, by chosen path. Paths are balanced so each
   reaches the 150-point prestige in ~5 active days of that path's play. */
export const PATHS = {
  photographer: { name: 'Photographer', icon: '📸', blurb: 'Daily Snaps, missions, poses and Rare Moments.',
    points: { dailySnap: 15, mission: 10, rareMoment: 10, greatShot: 5, journeySnap: 5, training: 3, care: 2, steps: 3, walk: 5 } },
  explorer: { name: 'Explorer', icon: '🥾', blurb: 'Walks, step milestones and Journey Snaps.',
    points: { dailySnap: 8, mission: 4, rareMoment: 5, greatShot: 0, journeySnap: 12, training: 3, care: 2, steps: 8, walk: 15 } },
  bestfriend: { name: 'Best Friend', icon: '💞', blurb: 'Care, training, tricks and Bond.',
    points: { dailySnap: 8, mission: 4, rareMoment: 5, greatShot: 0, journeySnap: 5, training: 15, care: 6, steps: 3, walk: 5, trick: 20 } },
};
export const DEFAULT_PATH = 'photographer';
export const EVENT_POINT_DAILY_CAP = { care: 3, training: 2, steps: 5, mission: 6, greatShot: 3 };   // occurrences/day that earn AP
export const PLUS_EVENT_BOOST = 1.25;         // "enhanced catch-up": Plus earns AP 25% faster

export const EVENT_LADDER = [                  // shared shape; each template names its items
  { points: 20, coins: 30 },
  { points: 40, xp: 20, label: 'Treat (+20 Bond XP)' },
  { points: 60, slot: 'frame' },
  { points: 80, coins: 60 },
  { points: 100, slot: 'headline' },
  { points: 125, slot: 'bonus' },
  { points: 150, slot: 'prestige' },
];
export const EVENT_TEMPLATES = [
  { id: 'explorer', name: 'Explorer Week', icon: '🥾', theme: 'explorer', blurb: 'Walk, wander and snap your adventures together.',
    items: { frame: 'frame_trail', headline: 'body_hoodie_explorer', bonus: 'head_cap_explorer', prestige: 'body_hoodie_sunset' }, suggestedPath: 'explorer' },
  { id: 'rainy', name: 'Rainy Day Week', icon: '🌧️', theme: 'rainy', blurb: 'Cozy indoor photos, puddle jumps and extra cuddles.',
    items: { frame: 'frame_puddle', headline: 'body_raincoat_puddle', bonus: 'head_rainhat', prestige: 'body_raincoat_rainbow' }, suggestedPath: 'photographer' },
];
/* Weekly events rotate through the templates from this Monday anchor. */
export const EVENT_SCHEDULE = { anchor: '2026-09-21', weekDays: 7, live: true };
/* A headline you already own pays this instead of a duplicate. */
export const DUPLICATE_HEADLINE_COINS = 150;

/* ---------------------------------------------------------------- friday -- */
export const FRIDAY_GIFTS = [
  { id: 'coins50', label: '50 Poka Coins', icon: '🪙', coins: 50 },
  { id: 'treat', label: 'A tasty treat (+25 Bond XP)', icon: '🍪', xp: 25 },
  { id: 'frame', label: 'Sparkle Frame', icon: '🖼️', item: 'frame_sparkle', fallbackCoins: 60 },
  { id: 'ap', label: '+15 Adventure Points', icon: '🧭', points: 15, fallbackCoins: 40 },
  { id: 'acc', label: 'Star Clip accessory', icon: '⭐', item: 'head_starclip', fallbackCoins: 60 },
  { id: 'big', label: 'Big surprise: 150 Poka Coins!', icon: '🎁', coins: 150 },
];

/* ---------------------------------------------------------------- daily snap -- */
export const DAILY_SNAP_PROMPTS = [
  { id: 'colorful', text: 'Take a colorful photo', icon: '🌈', check: 'any' },
  { id: 'happy',    text: 'Use the Happy pose',    icon: '😊', check: 'pose', pose: 'happy' },
  { id: 'outside',  text: 'Take your pet outside', icon: '🌳', check: 'any' },
  { id: 'tiny',     text: 'Make your pet look tiny', icon: '🐜', check: 'tiny' },
  { id: 'food',     text: 'Take a photo near food', icon: '🍓', check: 'any' },
  { id: 'journey',  text: 'Capture a Journey Snap', icon: '🥾', check: 'journey', fallback: 'any' },
  { id: 'fav',      text: 'Wear a favorite accessory', icon: '👒', check: 'outfit' },
  { id: 'sit',      text: 'Snap your pet sitting somewhere cozy', icon: '🪑', check: 'pose', pose: 'sit' },
];

/* ---------------------------------------------------------------- plus -- */
export const PLUS = {
  products: { monthly: 'com.keepitil.pokasnap.plus.monthly', yearly: 'com.keepitil.pokasnap.plus.yearly' },
  fallbackPrice: { monthly: '$4.99', yearly: '$39.99' },   // shown only as reference text; real prices come from StoreKit
  preview: { days: 3, oncePerAccount: true },              // non-billing PokaSnap+ Preview
  keepsakePrefix: 'keepsake_',
};
export const PLAN_ROWS = [      // ordered: everything everyone gets -> strongest Plus conveniences
  ['Core camera', 'yes', 'yes'], ['Unlimited normal Snaps', 'yes', 'yes'], ['Missions', 'yes', 'yes'], ['Care', 'yes', 'yes'],
  ['Training', 'yes', 'yes'], ['Adventure Book', 'yes', 'yes'], ['Walk With Pet', 'yes', 'yes'], ['Daily Snap', 'yes', 'yes'],
  ['Weekly events', 'yes', 'yes'], ['Monthly events', 'yes', 'yes'], ['Earn Poka Coins', 'yes', 'yes'],
  ['Earn headline content through play', 'yes', 'yes'], ['Permanent purchases', 'yes', 'yes'], ['Friday Gift', 'yes', 'yes'],
  ['Headline event reward', 'Earn', 'Automatic'], ['Event catch-up', 'Standard', 'Enhanced (+25% AP)'],
  ['Daily Snap reward', `${EARN.dailySnap} coins`, `${EARN.dailySnapPlus} coins`], ['Premium Closet', 'Preview', 'Access'],
  ['Cloud backup', 'Manual', 'Automatic'], ['Cloud capacity', '25 memories', '500 memories'],
  ['Monthly keepsake', 'Earn', 'Automatic'], ['Early preview', 'no', 'yes'],
];

/* ---------------------------------------------------------------- media ads -- */
export const REWARDED = { perDay: CAPS.rewardedMedia, coins: EARN.rewardedMedia, minWatchRatio: 0.95 };

/* ---------------------------------------------------------------- cloud -- */
export const CLOUD = {
  quota: { free: 25, plus: 500 },
  copy: { maxEdge: 1080, quality: 0.82, targetKB: [300, 750] },
  autoBackupFavorites: { free: false, plus: true },
};

/* ---------------------------------------------------------------- notifications -- */
export const NOTIFY = {
  maxRoutinePerDay: 1,
  askAfter: 'firstDailySnap',        // never on first launch
  types: {
    dailySnap:   { label: 'Daily Snap is ready', hour: 17, routine: true },
    friday:      { label: 'Poka Friday gift', hour: 10, routine: true },
    eventEnding: { label: 'Event ending soon', hour: 18, routine: false },
    weeklyNear:  { label: 'Weekly reward nearly complete', hour: 18, routine: true },
    monthlyNew:  { label: 'New monthly collection', hour: 10, routine: true },
    journey:     { label: 'Journey milestone reached', hour: null, routine: false },
  },
};

/* ---------------------------------------------------------------- rare moments -- */
export const RARE = { minGapMs: 25e3, maxGapMs: 60e3, windowMs: 3500, perDay: CAPS.rareMoment,
  moments: [
    { id: 'sneeze', name: 'Sneeze!', pose: 'sneeze' }, { id: 'yawn', name: 'Big yawn', pose: 'yawn' },
    { id: 'wink', name: 'Secret wink', pose: 'wink' }, { id: 'stumble', name: 'Oopsie stumble', pose: 'stumble' },
    { id: 'tailchase', name: 'Tail chase', pose: 'spin' }, { id: 'roll', name: 'Playful roll', pose: 'lay' },
    { id: 'dance', name: 'Happy dance', pose: 'dance' }, { id: 'surprised', name: 'Surprised face', pose: 'surprised' },
    { id: 'sleepy', name: 'Sleepy moment', pose: 'sleep' }, { id: 'hop', name: 'Happy jump', pose: 'jump' },
  ] };

/* ---------------------------------------------------------------- seasonal collections -- */
export const COLLECTIONS = [
  { id: 'autumn', name: 'Autumn Collection', icon: '🍂', from: '09-15', to: '11-30',
    partial: { need: 4, coins: 100, item: 'frame_leaves' }, full: { item: 'head_leafcrown' },
    goals: [
      { id: 'outdoor', label: 'An outdoor photo', test: 'category:outside' },
      { id: 'leaves', label: 'Falling Leaves mission', test: 'mission:fall_leaves' },
      { id: 'orange', label: 'Wear something orange', test: 'color:orange' },
      { id: 'journey', label: 'A Journey Snap', test: 'journey' },
      { id: 'food', label: 'A food photo', test: 'category:food' },
      { id: 'jump', label: 'The Jump pose', test: 'pose:jump' },
      { id: 'rare', label: 'A Rare Moment', test: 'rare' },
      { id: 'seasonal', label: 'Any seasonal mission', test: 'category:seasonal' },
    ] },
];
