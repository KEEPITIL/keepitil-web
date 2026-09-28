/* POKASNAP 2.0 — the living-world loop: WATCH → INTERACT → REACT → SNAP → REWARD → COLLECT → GROW.
   ---------------------------------------------------------------------------
   Pure, DOM-free rules for everything 2.0 adds on top of the 1.x systems:
     - Snap Turns (energy): pace reward-bearing play, never basic pet ownership;
     - Interaction reactions: the same input, different personalities, different outcomes;
     - WINS: a few daily / weekly goals and a season road, claimed once via the ledger;
     - Seasonal ALBUM: sets of 9 photo MOMENTS filled by real gameplay photos;
     - Rotating events: one shared contract for solo and team (friends) games.
   Every photo from every source reaches onPhoto() through world.recordPhoto(), so one
   snap can advance Album, Wins and the active event at the same time.
   State lives in st.v2 (additive; older saves gain it on first use and lose nothing). */

import { earn, has as ledgerHas, dayKey } from './ledger.js';

export const V2_SCHEMA = 1;

/* ================================================================ state */
export function ensureV2(st, now = Date.now()) {
  if (!st.v2 || typeof st.v2 !== 'object') st.v2 = {};
  const v = st.v2;
  v.schema = V2_SCHEMA;
  if (!v.turns || !Number.isFinite(v.turns.n) || !Number.isFinite(v.turns.at)) v.turns = { n: TURNS.max, at: now };
  v.counters = v.counters && typeof v.counters === 'object' ? v.counters : {};
  v.album = v.album && typeof v.album === 'object' ? v.album : {};
  v.album.slots = v.album.slots || {}; v.album.claimed = v.album.claimed || {};
  v.events = v.events && typeof v.events === 'object' ? v.events : {};
  v.badges = Array.isArray(v.badges) ? v.badges : [];
  v.tool = TOOLS.some(t => t.id === v.tool) ? v.tool : 'ball';
  v.tut = v.tut && typeof v.tut === 'object' ? v.tut : {};
  return v;
}

/* ================================================================ SNAP TURNS */
export const TURNS = { max: 60, regenMs: 4 * 60e3 };
/** Regenerate from the stored anchor. A clock that goes backwards never grants turns. */
export function settleTurns(st, now = Date.now()) {
  const t = ensureV2(st, now).turns;
  if (t.n >= TURNS.max) { t.n = Math.min(t.n, TURNS.max); t.at = now; return t; }
  const k = Math.floor(Math.max(0, now - t.at) / TURNS.regenMs);
  if (k > 0) { t.n = Math.min(TURNS.max, t.n + k); t.at = t.n >= TURNS.max ? now : t.at + k * TURNS.regenMs; }
  return t;
}
export function turnsView(st, now = Date.now()) {
  const t = settleTurns(st, now);
  const full = t.n >= TURNS.max;
  return { n: t.n, max: TURNS.max, full, empty: t.n <= 0, nextInMs: full ? null : Math.max(0, TURNS.regenMs - (now - t.at)),
    fullInMs: full ? 0 : Math.max(0, (TURNS.max - t.n - 1) * TURNS.regenMs + TURNS.regenMs - (now - t.at)) };
}
export function spendTurn(st, now = Date.now()) {
  const t = settleTurns(st, now);
  if (t.n <= 0) return { ok: false, empty: true };
  if (t.n >= TURNS.max) t.at = now;        // regeneration starts from the first spend
  t.n -= 1;
  return { ok: true, left: t.n };
}
export const clock = ms => { const s = Math.ceil(Math.max(0, ms) / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

/* ================================================================ INTERACT */
export const TOOLS = [
  { id: 'ball', icon: '🎾', name: 'Ball', hint: 'Throw it — who chases?' },
  { id: 'food', icon: '🥣', name: 'Food', hint: 'Nearby Pokas notice' },
  { id: 'treat', icon: '🍪', name: 'Treat', hint: 'A little reward' },
  { id: 'toy', icon: '🧸', name: 'Toy', hint: 'Something to investigate' },
  { id: 'pet', icon: '🤚', name: 'Pet', hint: 'A gentle stroke' },
  { id: 'poke', icon: '👉', name: 'Poke', hint: 'Surprise!' },
  { id: 'call', icon: '📣', name: 'Call', hint: 'Comes if it wants to' },
  { id: 'prop', icon: '🪁', name: 'Prop', hint: 'Place an object' },
];
export const tool = id => TOOLS.find(t => t.id === id) || null;

/* Reaction tables: personality -> weighted outcomes. kind drives the world choreography. */
const R = (kind, pose, w, fx = null) => ({ kind, pose, w, fx });
const TABLE = {
  ball: { playful: [R('chase', 'leap', 8), R('watch', 'look', 1)], cuddly: [R('watch', 'look', 5), R('chase', 'leap', 3), R('ignore', 'sit', 2)], mischievous: [R('guard', 'wink', 5), R('chase', 'leap', 4), R('ignore', 'yawn', 1)] },
  food: { playful: [R('eat', 'happy', 6), R('investigate', 'sniff', 3)], cuddly: [R('eat', 'happy', 8), R('investigate', 'sniff', 2)], mischievous: [R('steal', 'wink', 4), R('eat', 'happy', 4), R('investigate', 'sniff', 2)] },
  treat: { playful: [R('beg', 'sitpretty', 5), R('eat', 'jump', 5)], cuddly: [R('eat', 'heart', 7), R('beg', 'sitpretty', 3)], mischievous: [R('steal', 'wink', 5), R('beg', 'sitpretty', 3), R('eat', 'happy', 2)] },
  toy: { playful: [R('play', 'catch', 7), R('investigate', 'sniff', 3)], cuddly: [R('investigate', 'sniff', 5), R('play', 'roll', 3), R('ignore', 'lay', 2)], mischievous: [R('guard', 'catch', 5), R('investigate', 'peek', 5)] },
  pet: { playful: [R('react', 'happy', 6), R('react', 'jump', 4)], cuddly: [R('react', 'heart', 8), R('react', 'sleep', 2, 'hearts')], mischievous: [R('react', 'wink', 5), R('dodge', 'surprised', 5)] },
  poke: { playful: [R('react', 'jump', 6), R('react', 'surprised', 4)], cuddly: [R('react', 'surprised', 6), R('react', 'confused', 4)], mischievous: [R('grumble', 'confused', 5), R('react', 'sneeze', 3), R('dodge', 'surprised', 2)] },
  call: { playful: [R('approach', 'wave', 7), R('ignore', 'look', 3)], cuddly: [R('approach', 'happy', 8), R('ignore', 'sleep', 2)], mischievous: [R('approach', 'wink', 4), R('ignore', 'yawn', 6)] },
  prop: { playful: [R('investigate', 'sniff', 5), R('play', 'jump', 5)], cuddly: [R('investigate', 'sniff', 7), R('ignore', 'sit', 3)], mischievous: [R('investigate', 'peek', 6), R('guard', 'wink', 4)] },
};
const LINES = {
  chase: '{name} bolts after it!', watch: '{name} just watches…', ignore: '{name} isn\'t interested right now.', guard: '{name} guards it — mine!',
  eat: '{name} munches happily.', investigate: '{name} investigates.', steal: '{name} sneaks a bite!', beg: '{name} sits pretty and begs.',
  play: '{name} plays with it!', react: '{name} reacts!', dodge: '{name} dodges away!', grumble: '{name} grumbles. Hmph!', approach: '{name} trots over to you.', refuse: '{name} doesn\'t feel like it.',
};
/**
 * How one Poka reacts to one input. Pure. Unwell Pokas (social 0) mostly refuse — care matters.
 * bond (0..100) makes 'call' more likely to work; mood can be a care-state id.
 */
export function reactTo({ personality = 'cuddly', tool: t, name = 'Poka', mood = 'healthy', bond = 0, rnd = Math.random }) {
  if (!TABLE[t]) return { kind: 'none', pose: 'idle', line: '' };
  const unwell = ['snappy', 'withdrawn', 'critical', 'memorial'].includes(mood);
  if (unwell && rnd() < 0.75) return { kind: 'refuse', pose: mood === 'snappy' ? 'confused' : 'lay', line: LINES.refuse.replace('{name}', name), tool: t };
  let opts = (TABLE[t][personality] || TABLE[t].cuddly).map(o => ({ ...o }));
  if (t === 'call') for (const o of opts) if (o.kind === 'approach') o.w += bond / 12 + (mood === 'lonely' ? 6 : 0);
  const tot = opts.reduce((a, o) => a + o.w, 0); let x = rnd() * tot, pick = opts[0];
  for (const o of opts) if ((x -= o.w) <= 0) { pick = o; break; }
  return { kind: pick.kind, pose: pick.pose, fx: pick.fx, line: LINES[pick.kind].replace('{name}', name), tool: t };
}
/** Several Pokas reacting DIFFERENTLY to the same input is itself a moment worth catching. */
export const mixedReaction = reactions => new Set(reactions.map(r => r.kind)).size >= 2 && reactions.length >= 2;

/* ================================================================ periods + counters */
export function weekKey(now = Date.now()) {
  const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));   // local Monday
  return 'w' + dayKey(d.getTime());
}
export const SEASONS = {
  autumn: { name: 'Autumn Adventures', icon: '🍂', months: [8, 9, 10] },
  winter: { name: 'Winter Wonders', icon: '❄️', months: [11, 0, 1] },
  spring: { name: 'Spring Blossoms', icon: '🌸', months: [2, 3, 4] },
  summer: { name: 'Summer Splash', icon: '☀️', months: [5, 6, 7] },
};
export function seasonId(now = Date.now()) {
  const d = new Date(now), m = d.getMonth();
  const k = Object.keys(SEASONS).find(s => SEASONS[s].months.includes(m));
  const y = m === 0 || m === 1 ? d.getFullYear() - 1 : d.getFullYear();   // Dec-Feb is one winter
  return `${k}-${y}`;
}
export function seasonView(now = Date.now()) {
  const id = seasonId(now), k = id.split('-')[0], S = SEASONS[k], y = +id.split('-')[1];
  const endMonth = S.months[2], endYear = endMonth < S.months[0] ? y + 1 : y;
  const end = new Date(endYear, endMonth + 1, 1).getTime();
  return { id, key: k, name: S.name, icon: S.icon, end, daysLeft: Math.max(0, Math.ceil((end - now) / 864e5)) };
}
function bump(st, key, by = 1, now = Date.now()) {
  const c = ensureV2(st, now).counters;
  for (const p of [`d:${dayKey(now)}`, weekKey(now), `s:${seasonId(now)}`, 'all']) { const b = (c[p] = c[p] || {}); b[key] = (b[key] || 0) + by; }
  // keep only recent day/week buckets
  const keys = Object.keys(c).filter(k => k.startsWith('d:')).sort(); while (keys.length > 10) delete c[keys.shift()];
  const wk = Object.keys(c).filter(k => k.startsWith('w')).sort(); while (wk.length > 6) delete c[wk.shift()];
}
export function countIn(st, scope, key, now = Date.now()) {
  const c = ensureV2(st, now).counters, p = scope === 'day' ? `d:${dayKey(now)}` : scope === 'week' ? weekKey(now) : scope === 'season' ? `s:${seasonId(now)}` : 'all';
  return c[p]?.[key] || 0;
}
export function noteInteract(st, toolId, now = Date.now()) { bump(st, 'interacts', 1, now); bump(st, `tool:${toolId}`, 1, now); }
export function noteEventPoints(st, n, now = Date.now()) { bump(st, 'event_pts', n, now); }

/* ================================================================ WINS */
export const WINS = {
  day: [
    { id: 'snap3', label: 'Snap 3 moments in the world', key: 'snaps', n: 3, reward: { coins: 40 } },
    { id: 'interact5', label: 'Interact with your Pokas 5 times', key: 'interacts', n: 5, reward: { coins: 30 } },
    { id: 'great1', label: 'Take a great shot (80+)', key: 'great', n: 1, reward: { coins: 40 } },
    { id: 'album1', label: 'Fill an Album slot', key: 'album', n: 1, reward: { coins: 50 } },
  ],
  week: [
    { id: 'snap25', label: 'Snap 25 moments', key: 'snaps', n: 25, reward: { coins: 200 } },
    { id: 'rare2', label: 'Catch 2 Rare Moments', key: 'rare', n: 2, reward: { diamonds: 5 } },
    { id: 'album6', label: 'Fill 6 Album slots', key: 'album', n: 6, reward: { coins: 250 } },
    { id: 'event10', label: 'Earn 10 event points', key: 'event_pts', n: 10, reward: { coins: 150 } },
  ],
};
export const SEASON_ROAD = [
  { id: 'r5', n: 5, reward: { coins: 150 } }, { id: 'r15', n: 15, reward: { coins: 300 } }, { id: 'r30', n: 30, reward: { diamonds: 10 } },
  { id: 'r45', n: 45, reward: { coins: 600 } }, { id: 'r63', n: 63, reward: { diamonds: 25, badge: 'Season Photographer' } },
];
const periodOf = (scope, now) => scope === 'day' ? dayKey(now) : scope === 'week' ? weekKey(now) : seasonId(now);
export function winsView(st, now = Date.now()) {
  ensureV2(st, now);
  const g = scope => WINS[scope].map(w => { const have = Math.min(w.n, countIn(st, scope, w.key, now)), id = `wins:${scope}:${periodOf(scope, now)}:${w.id}`;
    return { ...w, scope, have, done: have >= w.n, claimed: ledgerHas(st, id), claimId: id }; });
  const filled = albumFilled(st, now);
  const road = SEASON_ROAD.map(r => { const id = `wins:season:${seasonId(now)}:${r.id}`; return { ...r, scope: 'season', have: Math.min(r.n, filled), done: filled >= r.n, claimed: ledgerHas(st, id), claimId: id }; });
  const d = new Date(now), eod = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  const eow = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (7 - ((d.getDay() + 6) % 7))).getTime();
  const all = [...g('day'), ...g('week'), ...road];
  return { day: g('day'), week: g('week'), road, season: seasonView(now), dayEndsIn: eod - now, weekEndsIn: eow - now, claimable: all.filter(w => w.done && !w.claimed).length };
}
/** Pay a reward once (ledger id = the claim id). */
export function payReward(st, claimId, reward, source, now = Date.now()) {
  const out = { coins: 0, diamonds: 0, badge: null, dup: false };
  if (ledgerHas(st, claimId) || ledgerHas(st, claimId + ':dia')) { out.dup = true; return out; }
  if (reward.coins) { const r = earn(st, { id: claimId, source, amount: reward.coins, now }); out.coins = r.amount || 0; if (r.dup) out.dup = true; }
  if (reward.diamonds) { const r = earn(st, { id: reward.coins ? claimId + ':dia' : claimId, source, amount: reward.diamonds, now, currency: 'dia' }); out.diamonds = r.amount || 0; }
  if (!reward.coins && !reward.diamonds) earn(st, { id: claimId, source, amount: 1, now });   // marks the claim (1 coin)
  if (reward.badge && !ensureV2(st).badges.includes(reward.badge)) { st.v2.badges.push(reward.badge); out.badge = reward.badge; }
  return out;
}
export function claimWin(st, claimId, now = Date.now()) {
  const v = winsView(st, now), w = [...v.day, ...v.week, ...v.road].find(x => x.claimId === claimId);
  if (!w) return { ok: false, reason: 'unknown' };
  if (w.claimed) return { ok: false, reason: 'claimed' };
  if (!w.done) return { ok: false, reason: 'not_done' };
  return { ok: true, ...payReward(st, claimId, w.reward, 'wins', now) };
}

/* ================================================================ SEASONAL ALBUM */
const P = (...ids) => m => ids.some(id => (m.poseList || []).includes(id));
const outdoors = new Set(['backyard', 'playground', 'garden', 'training_yard', 'adventure_gate']);
const RANK = { common: 0, uncommon: 1, rare: 2, legendary: 3 };
export const ALBUM_SETS = [
  { id: 'backyard', name: 'Backyard Moments', icon: '🏡', reward: { coins: 150 }, slots: [
    ['sniff', 'Sniff check', P('sniff')], ['look', 'Curious look', P('look', 'peek')], ['sit', 'Sitting pretty', P('sit', 'sitpretty')],
    ['ball', 'Ball time', m => m.tool === 'ball' || m.object === 'ball'], ['meal', 'Meal time', m => m.tool === 'food' || m.tool === 'treat' || m.tag === 'meal'],
    ['toy', 'New toy', m => m.tool === 'toy' || (!!m.object && m.object !== 'ball')], ['nap', 'Nap spot', P('sleep', 'lay')],
    ['golden', 'Golden hour', m => m.time === 'sunset' || m.time === 'evening'], ['great', 'A great shot', m => (m.score || 0) >= 80] ] },
  { id: 'funny', name: 'Funny Faces', icon: '😜', reward: { coins: 150 }, slots: [
    ['sneeze', 'Sneeze', P('sneeze')], ['confused', 'Confused', P('confused')], ['yawn', 'Yawn', P('yawn')], ['surprised', 'Surprised', P('surprised')],
    ['stumble', 'Stumble', P('stumble')], ['happy', 'Happy', P('happy')], ['excited', 'Excited', P('jump', 'leap')],
    ['grumpy', 'Grumpy', m => m.reaction === 'grumble' || m.reaction === 'refuse'], ['sleepy', 'Sleepy', P('sleep', 'sleepyroll')] ] },
  { id: 'friends', name: 'Best Friends', icon: '💞', reward: { coins: 200 }, slots: [
    ['play', 'Playing together', m => m.n >= 2 && ['turns', 'tug', 'play_together', 'share_toy', 'dance_together'].includes(m.duo)],
    ['nap', 'Napping together', m => m.n >= 2 && (m.poseList || []).filter(p => p === 'sleep').length >= 2],
    ['share', 'Sharing food', m => m.n >= 2 && (m.tool === 'food' || m.tag === 'meal')], ['race', 'Race!', m => m.n >= 2 && m.duo === 'race'],
    ['explore', 'Exploring', m => m.n >= 2 && ['explore', 'explore_together', 'sniff_together'].includes(m.duo)],
    ['pose', 'Matching pose', m => m.n >= 2 && new Set(m.poseList || []).size === 1 && m.poseList[0] !== 'idle'],
    ['celebrate', 'Celebrate', m => m.n >= 2 && (m.poseList || []).filter(p => p === 'happy' || p === 'champion').length >= 2],
    ['help', 'Helping out', m => m.n >= 2 && ['snuggle', 'comfort', 'cuddle', 'teach', 'drill'].includes(m.duo)],
    ['rare', 'Rare together', m => m.n >= 2 && RANK[m.rarity] >= 2] ] },
  { id: 'trail', name: 'Adventure Trail', icon: '🥾', reward: { coins: 200 }, slots: [
    ['journey', 'On a journey', m => !!m.journey], ['chase', 'The chase', m => m.duo === 'chase' || m.reaction === 'chase'], ['leap', 'Big leap', P('leap')],
    ['five', 'Five stars', m => (m.stars || 0) >= 5], ['outside', 'Fresh air', m => outdoors.has(m.location)], ['garden', 'In the garden', m => m.location === 'garden'],
    ['playground', 'Playground', m => m.location === 'playground'], ['gate', 'Adventure Gate', m => m.location === 'adventure_gate'], ['night', 'Night walk', m => m.time === 'night'] ] },
  { id: 'rare', name: 'Rare Moments', icon: '✨', reward: { diamonds: 10 }, slots: [
    ['uncommon', 'Uncommon', m => RANK[m.rarity] >= 1], ['rare', 'Rare', m => RANK[m.rarity] >= 2], ['legend', 'Legendary', m => m.rarity === 'legendary'],
    ['night', 'Rare at night', m => RANK[m.rarity] >= 2 && (m.time === 'night' || m.time === 'evening')], ['pair', 'Rare pair', m => RANK[m.rarity] >= 2 && m.n >= 2],
    ['object', 'Rare with a toy', m => RANK[m.rarity] >= 2 && !!(m.object || m.tool)], ['mixed', 'Split decision', m => !!m.mixed],
    ['interact', 'Rare reaction', m => RANK[m.rarity] >= 1 && !!m.reaction], ['event', 'Rare in an event', m => RANK[m.rarity] >= 1 && !!m.event] ] },
  { id: 'community', name: 'Community Life', icon: '🏘️', reward: { coins: 200 }, slots: [
    ['event', 'Event snap', m => !!m.event], ['team', 'Team event snap', m => m.eventType === 'team'], ['solo', 'Solo event snap', m => m.eventType === 'solo'],
    ['trio', 'The whole pack', m => m.n >= 3], ['wave', 'Say hi', P('wave')], ['highfive', 'High five', P('highfive')],
    ['dance', 'Party', P('dance', 'disco', 'twirl', 'moonwalk')], ['bow', 'Take a bow', P('bow')], ['salute', 'Salute', P('salute')] ] },
  { id: 'poses', name: 'Seasonal Poses', icon: '🍁', reward: { coins: 150 }, slots: [
    ['sit', 'Sit', P('sit')], ['jump', 'Jump', P('jump')], ['roll', 'Roll', P('roll', 'sleepyroll')], ['spin', 'Spin', P('spin')], ['stretch', 'Stretch', P('stretch', 'yoga')],
    ['peek', 'Peek-a-boo', P('peek')], ['statue', 'Statue', P('statue')], ['sitpretty', 'Sit pretty', P('sitpretty')], ['heart', 'Heart', P('heart')] ] },
].map(s => ({ ...s, slots: s.slots.map(([id, name, test]) => ({ id, name, test })) }));
/** Which set a photo that qualifies for several fills first (rarest collections first). */
export const ALBUM_PRIORITY = ['rare', 'friends', 'community', 'funny', 'poses', 'trail', 'backyard'];
export const ALBUM_MILESTONES = [
  { id: 'm2', sets: 2, reward: { coins: 300 } }, { id: 'm4', sets: 4, reward: { diamonds: 15 } },
  { id: 'm7', sets: 7, reward: { diamonds: 40, badge: 'Album Master' }, season: true },
];
const seasonSlots = (st, now) => { const a = ensureV2(st, now).album, id = seasonId(now); return (a.slots[id] = a.slots[id] || {}); };
export function albumFilled(st, now = Date.now()) { return Object.values(seasonSlots(st, now)).reduce((n, set) => n + Object.keys(set).length, 0); }
/** Normalise any photo record into what Album slots read. */
export function photoFacts(meta) {
  const poseList = meta.poses && Object.keys(meta.poses).length ? Object.values(meta.poses) : [meta.poseId].filter(Boolean);
  return { ...meta, poseList, n: (meta.subjects || []).length || 1 };
}
export function albumMatches(meta) {
  const m = photoFacts(meta), out = [];
  for (const s of ALBUM_SETS) for (const sl of s.slots) { let ok = false; try { ok = !!sl.test(m); } catch (e) {} if (ok) out.push({ set: s.id, slot: sl.id }); }
  return out;
}
export function albumView(st, now = Date.now()) {
  const slots = seasonSlots(st, now), season = seasonView(now);
  const sets = ALBUM_SETS.map(s => { const got = slots[s.id] || {}, have = s.slots.filter(x => got[x.id]).length, claimId = `album:${season.id}:${s.id}`;
    return { ...s, have, total: s.slots.length, complete: have === s.slots.length, claimed: ledgerHas(st, claimId), claimId, got,
      slots: s.slots.map(x => ({ id: x.id, name: x.name, photoId: got[x.id]?.photoId || null, at: got[x.id]?.at || 0 })) }; });
  const done = sets.filter(s => s.complete).length;
  const milestones = ALBUM_MILESTONES.map(m => { const claimId = `album:${season.id}:${m.id}`; return { ...m, done: done >= m.sets, claimed: ledgerHas(st, claimId), claimId }; });
  return { season, sets, setsDone: done, filled: albumFilled(st, now), total: ALBUM_SETS.reduce((a, s) => a + s.slots.length, 0), milestones };
}
export function claimAlbum(st, claimId, now = Date.now()) {
  const v = albumView(st, now);
  const s = v.sets.find(x => x.claimId === claimId), m = v.milestones.find(x => x.claimId === claimId);
  const it = s ? { done: s.complete, claimed: s.claimed, reward: s.reward } : m ? { done: m.done, claimed: m.claimed, reward: m.reward } : null;
  if (!it) return { ok: false, reason: 'unknown' };
  if (it.claimed) return { ok: false, reason: 'claimed' };
  if (!it.done) return { ok: false, reason: 'not_done' };
  return { ok: true, ...payReward(st, claimId, it.reward, 'album', now) };
}

/* ================================================================ ROTATING EVENTS (shared contract) */
/* { id, title, icon, type: 'solo'|'team', minLevel, days, goal, milestones, points(meta) -> n,
     action: what one Snap Turn does in the world, album: set it feeds, wins: counter it feeds } */
export const EVENTS2 = [
  { id: 'race', title: 'Poka Race', icon: '🏁', type: 'solo', minLevel: 1, action: 'race', blurb: 'Line up, go, and snap the finish.', album: 'friends',
    points: m => (m.duo === 'race' || m.reaction === 'chase' ? 3 : 0) + ((m.poseList || []).some(p => p === 'leap' || p === 'champion') ? 1 : 0) },
  { id: 'community_build', title: 'Community Garden', icon: '🌻', type: 'team', minLevel: 1, action: 'garden', blurb: 'You and your friends grow a shared garden with photos.', album: 'community',
    points: m => 1 + (outdoors.has(m.location) ? 1 : 0) + ((m.score || 0) >= 80 ? 1 : 0) },
  { id: 'treasure', title: 'Treasure Hunt', icon: '🗝️', type: 'solo', minLevel: 1, action: 'treasure', blurb: 'Your Pokas sniff out a hidden treasure. Snap the find!', album: 'trail',
    points: m => ((m.poseList || []).some(p => p === 'sniff' || p === 'peek' || p === 'look') ? 2 : 0) + (m.reaction === 'investigate' ? 2 : 0) },
  { id: 'friend_challenge', title: 'Friend Challenge', icon: '🤝', type: 'team', minLevel: 1, action: 'pose', blurb: 'Team up with friends: happy photos fill the team meter.', album: 'community',
    points: m => ((m.poseList || []).some(p => ['happy', 'heart', 'wave', 'highfive'].includes(p)) ? 2 : 1) },
  { id: 'rare_hunt', title: 'Rare Moment Hunt', icon: '🔭', type: 'solo', minLevel: 1, action: 'rare', blurb: 'Rare Moments happen more often. Be ready.', album: 'rare',
    points: m => RANK[m.rarity] * 2 },
];
export const EVENT_LEN_DAYS = 3;
const EV_ANCHOR = new Date(2026, 8, 21).getTime();   // local Monday
export const MILESTONES = [{ at: 6, reward: { coins: 60 } }, { at: 15, reward: { coins: 120 } }, { at: 30, reward: { diamonds: 5 } }];
export const TEAM_GOAL_SCALE = 2;                   // team goals are bigger; friends help fill them
/** The event running now (rotates every EVENT_LEN_DAYS) + the next one, for this level. */
export function currentEvent2(st, now = Date.now()) {
  const lvl = st?.progress?.level || 1, len = EVENT_LEN_DAYS * 864e5;
  const pool = EVENTS2.filter(e => lvl >= e.minLevel);
  if (!pool.length) return null;
  const idx = Math.floor((now - EV_ANCHOR) / len), slot = ((idx % pool.length) + pool.length) % pool.length;
  const start = EV_ANCHOR + idx * len, e = pool[slot], nx = pool[(slot + 1) % pool.length];
  return { ...e, start, end: start + len, key: `${e.id}:${start}`, next: { id: nx.id, title: nx.title, icon: nx.icon, type: nx.type, start: start + len } };
}
export function eventProgress(st, ev, now = Date.now()) {
  if (!ev) return null;
  const e = (ensureV2(st, now).events[ev.key] = ensureV2(st, now).events[ev.key] || { pts: 0, snaps: 0, turns: 0 });
  const scale = ev.type === 'team' ? TEAM_GOAL_SCALE : 1;
  const friends = Math.min(10, st.social?.friendCount || 0);
  const friendBoost = ev.type === 'team' ? friends * Math.min(EVENT_LEN_DAYS, Math.floor((now - ev.start) / 864e5) + 1) : 0;   // each verified friend cheers once a day
  const total = e.pts + friendBoost;
  const ms = MILESTONES.map((m, i) => { const at = m.at * scale, claimId = `event:${ev.key}:m${i}`; return { ...m, at, done: total >= at, claimed: ledgerHas(st, claimId), claimId }; });
  return { mine: e.pts, friendBoost, friends, total, goal: ms[ms.length - 1].at, milestones: ms, snaps: e.snaps, turns: e.turns, endsIn: ev.end - now };
}
/** A turn spent on the event's world action (the action itself is worth 1 point). */
export function eventTurn(st, ev, now = Date.now()) {
  const s = spendTurn(st, now); if (!s.ok) return s;
  const e = (ensureV2(st, now).events[ev.key] = st.v2.events[ev.key] || { pts: 0, snaps: 0, turns: 0 });
  e.turns++; e.pts += 1; noteEventPoints(st, 1, now);
  return { ok: true, left: s.left };
}
export function claimEvent(st, ev, claimId, now = Date.now()) {
  const p = eventProgress(st, ev, now), m = p?.milestones.find(x => x.claimId === claimId);
  if (!m) return { ok: false, reason: 'unknown' };
  if (m.claimed) return { ok: false, reason: 'claimed' };
  if (!m.done) return { ok: false, reason: 'not_done' };
  return { ok: true, ...payReward(st, claimId, m.reward, 'event2', now) };
}

/* ================================================================ one photo -> every system */
/**
 * Called by world.recordPhoto() for every photo. meta.noCredit (SNAP with zero turns) keeps the photo
 * but skips Album / Wins / event credit. Returns what changed so the result card can show it.
 */
export function onPhoto(st, meta, now = Date.now()) {
  const out = { album: [], dupAlbum: 0, wins: [], event: null };
  ensureV2(st, now);
  if (meta.noCredit) return out;
  const m = photoFacts(meta);
  const ev = currentEvent2(st, now);
  bump(st, 'snaps', 1, now);
  if ((m.score || 0) >= 80) bump(st, 'great', 1, now);
  if (RANK[m.rarity] >= 2) bump(st, 'rare', 1, now);
  if (m.n >= 2) bump(st, 'multi', 1, now);
  // one photo = one memory = ONE Album slot: the most special new slot it qualifies for
  const slots = seasonSlots(st, now);
  const fresh = albumMatches(m).filter(({ set, slot }) => !slots[set]?.[slot]);
  out.dupAlbum = albumMatches(m).length - fresh.length;
  const pick = fresh.sort((a, b) => ALBUM_PRIORITY.indexOf(a.set) - ALBUM_PRIORITY.indexOf(b.set))[0];
  if (pick) {
    const s = (slots[pick.set] = slots[pick.set] || {});
    s[pick.slot] = { photoId: meta.id || null, at: now };
    const S = ALBUM_SETS.find(x => x.id === pick.set);
    out.album.push({ set: pick.set, slot: pick.slot, setName: S.name, slotName: S.slots.find(x => x.id === pick.slot).name, setComplete: S.slots.every(x => s[x.id]) });
    bump(st, 'album', 1, now);
  }
  if (ev) {
    const pts = Math.max(0, Math.min(6, Math.round(ev.points(m) || 0)));
    const e = (st.v2.events[ev.key] = st.v2.events[ev.key] || { pts: 0, snaps: 0, turns: 0 });
    e.snaps++; if (pts) { e.pts += pts; noteEventPoints(st, pts, now); }
    out.event = { id: ev.id, title: ev.title, pts };
  }
  const w = winsView(st, now); out.wins = [...w.day, ...w.week].filter(x => x.done && !x.claimed).map(x => x.label);
  return out;
}

/* ================================================================ IA map (every 1.x route has a 2.0 home) */
export const NAV = ['wins', 'poka', 'snap', 'pets', 'album'];
export const NAV_LABEL = { wins: 'WINS', poka: 'POKA', snap: 'SNAP', pets: 'PETS', album: 'ALBUM' };
export const ROUTE_HOME = {
  home: 'snap', homeland: 'snap', snap: 'snap', camera: 'snap', result: 'snap', brief: 'snap', adventures: 'snap', walk: 'snap', recap: 'snap', event2: 'snap', community: 'pets', league: 'pets',
  wins: 'wins', missions: 'wins', catalog: 'wins', stars: 'wins', chapters: 'wins',
  poka: 'poka', pokaprofile: 'poka', pack: 'poka', 'album-life': 'poka', journal: 'poka', life: 'poka', party: 'poka', care: 'poka', train: 'poka', game: 'poka', learned: 'poka', academy: 'poka', discipline: 'poka', academyPlay: 'poka', closet: 'poka', lookback: 'poka',
  pets: 'pets', friends: 'pets',
  album: 'album', snaps: 'album',
  store: 'snap', item: 'snap', plus: 'snap', rewarded: 'snap', settings: 'snap', music: 'snap', help: 'snap',
};
