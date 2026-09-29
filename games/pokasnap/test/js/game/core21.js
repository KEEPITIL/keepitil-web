/* POKASNAP 2.1 CORE — the economy that ties the game together.
   ---------------------------------------------------------------------------
   MY POKAS LIVE HERE → I CHANGE THEIR WORLD → THEY REACT → I CAPTURE IT → MY PHOTO EARNS SNAP POINTS
   → SNAP POINTS POWER THE CURRENT ROTATING GAME → MY QUALIFYING PHOTOS BUILD MY SEASONAL ALBUM.
   Pure and DOM-free:
     - Snap Points (SP): photo score + visible, capped bonuses. Photography never costs energy.
     - Rotating events: configuration-driven schedule, lifecycle, SP → event-currency conversion.
     - Seasonal Album: 22 sets × 9 moments (configurable); one qualifying photo fills ONE slot;
       the card is the player's own photo; duplicates earn a little SP instead of filling anything.
     - Training: six playable disciplines with capped, modest benefits (never bought, never a guaranteed win).
   State: st.v21 (additive; 1.x/2.0 saves gain it on migration and lose nothing). */

import { earn, has as ledgerHas, dayKey } from './ledger.js';

export const V21_SCHEMA = 1;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function ensureV21(st, now = Date.now()) {
  if (!st.v21 || typeof st.v21 !== 'object') st.v21 = {};
  const v = st.v21; v.schema = V21_SCHEMA;
  v.sp = v.sp && Number.isFinite(v.sp.bal) && Number.isFinite(v.sp.life) ? v.sp : { bal: 0, life: 0 };
  v.album = v.album && typeof v.album === 'object' ? v.album : {};
  v.album.slots = v.album.slots || {}; v.album.dups = v.album.dups || {}; v.album.legacy = Array.isArray(v.album.legacy) ? v.album.legacy : [];
  v.events = v.events && typeof v.events === 'object' ? v.events : {};
  v.training = v.training && typeof v.training === 'object' ? v.training : {};
  v.day = v.day && typeof v.day === 'object' ? v.day : {};
  return v;
}

/* ================================================================ SNAP POINTS */
export const SP_BONUS = { legendary: 30, rare: 15, uncommon: 5, multi: 10, albumNew: 10, eventTarget: 10, pose: 8, relation: 6, place: 5, timing: 10 };
export const SP_BONUS_CAP = 50;
export const DUPLICATE_SP = 5;
const HARD_POSES = new Set(['moonwalk', 'twirl', 'superhero', 'yoga', 'statue', 'salute', 'disco', 'highfive', 'master', 'champion', 'sleepyroll']);
const SPECIAL_PLACES = new Set(['photo_studio', 'adventure_gate', 'garden']);
/**
 * SP for one photo. Base = photo score (minus any gear bonus, so purchases never buy SP).
 * Bonuses are itemised, visible and capped at SP_BONUS_CAP.
 */
export function spFor(f) {
  const base = clamp(Math.round((f.score || 0) - (f.gear || 0)), 0, 100);
  const items = [];
  const add = (k, label, n) => items.push({ k, label, n });
  if (f.rarity === 'legendary') add('legendary', 'Legendary Moment', SP_BONUS.legendary);
  else if (f.rarity === 'rare') add('rare', 'Rare Moment', SP_BONUS.rare);
  else if (f.rarity === 'uncommon') add('uncommon', 'Uncommon moment', SP_BONUS.uncommon);
  if ((f.n || 1) >= 2 && (f.interaction || f.duo)) add('multi', 'Pokas together', SP_BONUS.multi);
  if (f.albumNew) add('albumNew', 'New Album photo', SP_BONUS.albumNew);
  if (f.eventTarget) add('eventTarget', 'Event target', SP_BONUS.eventTarget);
  if ((f.poseList || []).some(p => HARD_POSES.has(p))) add('pose', 'Tricky pose', SP_BONUS.pose);
  if (['best_friend', 'mentor', 'playful_rival'].includes(f.relationType)) add('relation', 'Strong bond', SP_BONUS.relation);
  if (SPECIAL_PLACES.has(f.location)) add('place', 'Special place', SP_BONUS.place);
  if (f.timing) add('timing', 'Perfect timing', SP_BONUS.timing);
  const raw = items.reduce((a, b) => a + b.n, 0), bonus = Math.min(SP_BONUS_CAP, raw);
  return { base, items, bonus, capped: raw > SP_BONUS_CAP, total: base + bonus };
}
export function addSP(st, n, why, now = Date.now()) {
  const v = ensureV21(st, now); n = Math.max(0, Math.round(n || 0));
  v.sp.bal += n; v.sp.life += n;
  const d = (v.day[dayKey(now)] = v.day[dayKey(now)] || {}); d.sp = (d.sp || 0) + n;
  for (const k of Object.keys(v.day).sort().slice(0, -10)) delete v.day[k];
  // SP earned while an event is live powers that event
  const ev = currentEvent(now);
  const feed = ev && n ? feedEvent(st, ev, n, now) : null;
  return { sp: n, why, bal: v.sp.bal, feed, event: ev ? { id: ev.id, key: ev.key, title: ev.title, icon: ev.icon, currency: ev.conversion.currency, per: ev.conversion.sp } : null };
}
export const spToday = (st, now = Date.now()) => ensureV21(st, now).day[dayKey(now)]?.sp || 0;

/**
 * One photo → Album (at most one slot) → SP (score + capped bonuses, duplicates a little) → the live event.
 * f = photo facts (see albumMatches). Called for EVERY photo via world.recordPhoto → v2.onPhoto.
 */
export function creditPhoto(st, f, now = Date.now()) {
  ensureV21(st, now);
  const ev = currentEvent(now), live = ev && lifecycle(ev, now) === 'active';
  const album = qualify(st, f, now);
  const eventTarget = !!(live && ((f.show && f.show === ev.id) || (album.slot && album.slot.set === ev.albumSet)));
  const sp = spFor({ ...f, albumNew: !!album.slot, eventTarget });
  if (album.duplicate) sp.items.push({ k: 'duplicate', label: 'Duplicate moment', n: DUPLICATE_SP }), sp.total += DUPLICATE_SP;
  const credit = addSP(st, sp.total, 'photo', now);
  return { album, sp, feed: credit.feed, event: credit.event, bal: credit.bal };
}

/* ================================================================ EVENT CONFIG + SCHEDULE */
/* One contract for every rotating game. conversion: SP → event currency. Dates come from ROTATION
   (and, for team events, the server's pokasnap_events rows) — never from screen code. */
export const EVENT_TYPES = {
  racing: { id: 'racing', title: 'Poka Racing', icon: '🏁', mode: 'team', teamSize: 4, conversion: { sp: 100, currency: 'Race Moves', short: 'Moves', icon: '🏁' },
    stages: ['Qualifier', 'Race 2', 'Final'], albumSet: 'racing', winsKey: 'race_runs', theme: 'track',
    milestones: [{ at: 300, reward: { coins: 80 } }, { at: 900, reward: { coins: 200 } }, { at: 1800, reward: { diamonds: 10 } }], screen: 'race' },
  build: { id: 'build', title: 'Community Build', icon: '🏰', mode: 'team', teamSize: 4, conversion: { sp: 80, currency: 'Build Actions', short: 'Actions', icon: '🧱' },
    projects: ['Sandcastle', 'Community Garden', 'Clubhouse', 'Treehouse'], albumSet: 'builders', winsKey: 'build_actions', theme: 'beach',
    milestones: [{ at: 25, reward: { coins: 80 } }, { at: 50, reward: { coins: 150 } }, { at: 75, reward: { coins: 250 } }, { at: 100, reward: { diamonds: 15 } }], screen: 'build' },
  puzzle: { id: 'puzzle', title: 'Treasure Dig', icon: '🗝️', mode: 'solo', teamSize: 1, conversion: { sp: 60, currency: 'Puzzle Moves', short: 'Moves', icon: '⛏️' },
    albumSet: 'puzzles', winsKey: 'puzzle_stages', theme: 'dig', milestones: [{ at: 1, reward: { coins: 60 } }, { at: 3, reward: { coins: 150 } }, { at: 6, reward: { diamonds: 8 } }], screen: 'puzzle' },
  fashion: { id: 'fashion', title: 'Fashion Show', icon: '👗', mode: 'solo', teamSize: 1, conversion: { sp: 120, currency: 'Show Tickets', short: 'Tickets', icon: '🎟️' },
    albumSet: 'fashion', winsKey: 'shows', theme: 'runway', milestones: [{ at: 1, reward: { coins: 60 } }, { at: 3, reward: { coins: 150 } }, { at: 5, reward: { diamonds: 8 } }], screen: 'fashion' },
  dance: { id: 'dance', title: 'Dance Party', icon: '💃', mode: 'solo', teamSize: 1, conversion: { sp: 120, currency: 'Show Tickets', short: 'Tickets', icon: '🎟️' },
    albumSet: 'dance', winsKey: 'shows', theme: 'stage', milestones: [{ at: 1, reward: { coins: 60 } }, { at: 3, reward: { coins: 150 } }, { at: 5, reward: { diamonds: 8 } }], screen: 'dance' },
};
/** The rotation (3–6 days each). One UTC anchor (09:00 US Pacific) shared with the server's pokasnap_events rows. */
export const ROTATION = { anchorMs: Date.UTC(2026, 8, 28, 16, 0, 0), order: [['racing', 4], ['puzzle', 3], ['build', 5], ['fashion', 3], ['dance', 3]] };
export const GRACE_MS = 48 * 3600e3;          // rewards can still be claimed after an event ends
const cycleDays = () => ROTATION.order.reduce((a, [, d]) => a + d, 0);
function windowAt(t) {
  const a = ROTATION.anchorMs, day = 864e5, cyc = cycleDays() * day;
  const k = Math.floor((t - a) / cyc), inCycle = t - a - k * cyc; let off = 0;
  for (const [id, d] of ROTATION.order) { if (inCycle < (off + d) * day) return { id, start: a + k * cyc + off * day, end: a + k * cyc + (off + d) * day }; off += d; }
  return null;
}
/** Event instance for a time: { ...type, key, start, end }. Server rows (if loaded) override dates. */
export function eventAt(t, server = null) {
  const w = windowAt(t); if (!w) return null;
  const T = EVENT_TYPES[w.id], srv = server?.find?.(e => e.type === w.id && e.start <= t && t < e.end);
  return { ...T, key: srv?.id || `${w.id}:${new Date(w.start).toISOString().slice(0, 10)}`, start: srv?.start || w.start, end: srv?.end || w.end, serverId: srv?.id || null };
}
export const currentEvent = (now = Date.now(), server = null) => eventAt(now, server);
export function nextEvent(now = Date.now()) { const c = eventAt(now); return c ? eventAt(c.end + 1000) : null; }
/** upcoming | active | grace (ended, rewards claimable) | expired. */
export function lifecycle(ev, now = Date.now()) {
  if (!ev) return 'expired';
  if (now < ev.start) return 'upcoming';
  if (now < ev.end) return 'active';
  if (now < ev.end + GRACE_MS) return 'grace';
  return 'expired';
}
export function validateEventConfig(T) {
  const need = ['id', 'title', 'icon', 'mode', 'teamSize', 'conversion', 'milestones', 'albumSet', 'winsKey', 'theme', 'screen'];
  const miss = need.filter(k => T[k] == null);
  if (T.conversion && !(T.conversion.sp > 0 && T.conversion.currency)) miss.push('conversion.sp/currency');
  if (!['solo', 'team'].includes(T.mode)) miss.push('mode');
  return miss;
}

/* ================================================================ SP → EVENT CURRENCY */
export function wallet(st, ev) {
  const v = ensureV21(st);
  const w = (v.events[ev.key] = v.events[ev.key] || { pool: 0, made: 0, spent: 0, progress: 0, stage: 0, local: {} });
  return w;
}
/** Feed SP into the live event: every `conversion.sp` SP makes one unit of the event currency. */
export function feedEvent(st, ev, sp, now = Date.now()) {
  if (lifecycle(ev, now) !== 'active') return { made: 0 };
  const w = wallet(st, ev); w.pool += sp;
  const total = Math.floor(w.pool / ev.conversion.sp), made = total - w.made; w.made = total;
  return { made, toNext: ev.conversion.sp - (w.pool % ev.conversion.sp) };
}
export function eventView(st, ev, now = Date.now()) {
  const w = wallet(st, ev);
  return { ...ev, state: lifecycle(ev, now), available: w.made - w.spent, made: w.made, pool: w.pool, toNext: ev.conversion.sp - (w.pool % ev.conversion.sp), per: ev.conversion.sp, progress: w.progress, stage: w.stage, endsIn: ev.end - now };
}
/** Spend one unit of event currency on a playable action (a race run, a build action, a dig, a show). */
export function spendEventUnit(st, ev, now = Date.now()) {
  if (lifecycle(ev, now) !== 'active') return { ok: false, reason: 'not_active' };
  const w = wallet(st, ev); if (w.made - w.spent < 1) return { ok: false, reason: 'none' };
  w.spent++; return { ok: true, left: w.made - w.spent };
}
/** Local milestone claims for SOLO events (team events claim on the server). */
export function claimSolo(st, ev, i, now = Date.now()) {
  const m = ev.milestones[i], w = wallet(st, ev), id = `ev21:${ev.key}:m${i}`;
  if (!m) return { ok: false, reason: 'unknown' };
  if (ev.mode !== 'solo') return { ok: false, reason: 'server' };
  if (!['active', 'grace'].includes(lifecycle(ev, now))) return { ok: false, reason: 'expired' };
  if (ledgerHas(st, id) || ledgerHas(st, id + ':dia')) return { ok: false, reason: 'claimed' };
  if (w.progress < m.at) return { ok: false, reason: 'not_done' };
  return { ok: true, ...pay(st, id, m.reward, 'event21', now) };
}
export function pay(st, id, r, source, now = Date.now()) {
  const out = { coins: 0, diamonds: 0 };
  if (r.coins) out.coins = earn(st, { id, source, amount: r.coins, now }).amount || 0;
  if (r.diamonds) out.diamonds = earn(st, { id: r.coins ? id + ':dia' : id, source, amount: r.diamonds, now, currency: 'dia' }).amount || 0;
  if (r.badge) { const v = ensureV21(st); v.badges = v.badges || []; if (!v.badges.includes(r.badge)) v.badges.push(r.badge); out.badge = r.badge; }
  return out;
}

/* ================================================================ SEASONAL ALBUM (22 × 9, configurable) */
const has = (m, ...p) => (m.poseList || []).some(x => p.includes(x));
const R = { common: 0, uncommon: 1, rare: 2, legendary: 3 };
const rx = (m, ...a) => a.includes(m.reaction) || (m.reactions || []).some(x => a.includes(x));
const near = (m, ...o) => o.includes(m.onFurniture);
const S = (id, name, icon, d, slots) => ({ id, name, icon, slots: slots.map(([sid, sname, test, diff = d]) => ({ id: sid, name: sname, test, d: diff })) });
/* d = difficulty 1..3; when one photo qualifies for several missing slots, the hardest wins. */
export const SEASON_SETS = [
  S('funny', 'Funny Faces', '😜', 1, [['yawn', 'Yawn', m => has(m, 'yawn')], ['sneeze', 'Sneeze', m => has(m, 'sneeze')], ['confused', 'Confused', m => has(m, 'confused')], ['surprised', 'Surprised', m => has(m, 'surprised')],
    ['grumpy', 'Grumpy', m => rx(m, 'refuse', 'grumble', 'reject'), 2], ['excited', 'Excited', m => has(m, 'jump', 'leap')], ['sleepy', 'Sleepy', m => has(m, 'sleep', 'sleepyroll')], ['stumble', 'Stumble', m => has(m, 'stumble') || rx(m, 'stumble'), 2], ['happy', 'Happy', m => has(m, 'happy')]]),
  S('friends', 'Best Friends', '💞', 2, [['play', 'Play Together', m => m.n >= 2 && ['turns', 'tug', 'play_together', 'share_toy'].includes(m.duo)], ['nap', 'Nap Together', m => m.n >= 2 && (m.poseList || []).filter(p => p === 'sleep').length >= 2],
    ['share', 'Share', m => m.n >= 2 && rx(m, 'share')], ['race', 'Race', m => m.n >= 2 && (m.duo === 'race' || rx(m, 'race'))], ['explore', 'Explore', m => m.n >= 2 && ['explore', 'explore_together', 'sniff_together'].includes(m.duo)],
    ['help', 'Help', m => m.n >= 2 && ['comfort', 'teach', 'drill'].includes(m.duo)], ['celebrate', 'Celebrate', m => m.n >= 2 && (m.poseList || []).filter(p => p === 'happy' || p === 'champion').length >= 2], ['cuddle', 'Cuddle', m => m.n >= 2 && ['snuggle', 'cuddle'].includes(m.duo)],
    ['rare', 'Rare Friendship Moment', m => m.n >= 2 && R[m.rarity] >= 2 && ['friend', 'best_friend'].includes(m.relationType), 3]]),
  S('playtime', 'Playtime', '🎾', 1, [['fetch', 'Fetch', m => rx(m, 'return'), 2], ['chase', 'Ball Chase', m => rx(m, 'chase', 'race')], ['tug', 'Tug', m => m.duo === 'tug' || rx(m, 'tug'), 2], ['thief', 'Toy Thief', m => rx(m, 'steal_try', 'keep_away', 'guard'), 2],
    ['catch', 'Catch', m => has(m, 'catch') || rx(m, 'catch')], ['jump', 'Jump', m => has(m, 'jump') && !!m.toy], ['group', 'Group Play', m => m.n >= 3 && (!!m.toy || rx(m, 'chase', 'race')), 3], ['hide', 'Hide', m => rx(m, 'hide'), 2], ['favorite', 'Favorite Toy', m => rx(m, 'carry')]]),
  S('fashion', 'Fashion Week', '👗', 2, [['casual', 'Casual', m => m.show === 'fashion' && m.theme === 'casual'], ['formal', 'Formal', m => m.show === 'fashion' && m.theme === 'formal'], ['seasonal', 'Seasonal', m => m.show === 'fashion' && m.theme === 'seasonal'],
    ['sport', 'Sport', m => m.show === 'fashion' && m.theme === 'sport'], ['funny', 'Funny', m => m.show === 'fashion' && m.theme === 'funny'], ['matching', 'Matching', m => m.n >= 2 && (m.dressed || 0) >= 2, 3],
    ['runway', 'Runway', m => m.show === 'fashion'], ['pose', 'Pose', m => m.show === 'fashion' && (m.poseList || []).some(p => p !== 'idle')], ['best', 'Best in Show', m => m.show === 'fashion' && (m.showScore || 0) >= 90, 3]]),
  S('mealtime', 'Mealtime', '🍽️', 1, [['rush', 'Dinner Dash', m => rx(m, 'rush')], ['polite', 'Good Manners', m => rx(m, 'polite'), 2], ['share', 'Shared Meal', m => rx(m, 'share') && !!m.food, 2], ['steal', 'Sneaky Bite', m => rx(m, 'steal') && !!m.food, 2],
    ['picky', 'Picky Eater', m => rx(m, 'reject')], ['beg', 'Begging', m => rx(m, 'beg')], ['guard', 'Guard the Bowl', m => rx(m, 'guard_food'), 2], ['invite', 'Dinner Invite', m => rx(m, 'invite'), 3], ['favorite', 'Favorite Food', m => !!m.favFood]]),
  S('cozy', 'Cozy Home', '🛋️', 1, [['couch', 'Couch Nap', m => near(m, 'couch', 'armchair') && has(m, 'sleep', 'lay')], ['bed', 'Bedtime', m => near(m, 'bed', 'petbed') && has(m, 'sleep')], ['rug', 'Rug Roll', m => near(m, 'rug') && has(m, 'roll', 'sleepyroll', 'lay')],
    ['climb', 'Climber', m => near(m, 'cattree')], ['box', 'Toy Box', m => near(m, 'toybox')], ['table', 'Under the Table', m => near(m, 'table', 'shelf')], ['lamp', 'Lamp Light', m => m.indoor && (m.time === 'evening' || m.time === 'night')],
    ['tidy', 'New Look Room', m => m.roomEdited, 2], ['window', 'Window Watch', m => m.location === 'living_room' && has(m, 'look', 'sit')]]),
  S('racing', 'Racing Stars', '🏁', 2, [['start', 'Starting Line', m => m.show === 'race'], ['hurdle', 'Hurdle', m => m.show === 'race' && m.obstacle === 'hurdle'], ['weave', 'Weave', m => m.show === 'race' && m.obstacle === 'weave'], ['tunnel', 'Tunnel', m => m.show === 'race' && m.obstacle === 'tunnel'],
    ['balance', 'Balance Beam', m => m.show === 'race' && m.obstacle === 'balance'], ['finish', 'Photo Finish', m => m.show === 'race' && m.finish], ['champion', 'Champion', m => m.show === 'race' && m.place === 1, 3], ['team', 'Team Race', m => m.show === 'race' && m.team, 2], ['agility', 'Speed Training', m => m.training === 'agility']]),
  S('builders', 'Builder Crew', '🏰', 2, [['foundation', 'Foundation', m => m.show === 'build' && (m.buildPct || 0) < 25], ['structure', 'Structure', m => m.show === 'build' && m.buildPct >= 25], ['objects', 'Big Pieces', m => m.show === 'build' && m.buildPct >= 50], ['decor', 'Decorating', m => m.show === 'build' && m.buildPct >= 75, 3],
    ['complete', 'Grand Opening', m => m.show === 'build' && m.buildPct >= 100, 3], ['stack', 'Block Stack', m => m.training === 'build'], ['proud', 'Proud Builder', m => m.show === 'build' && has(m, 'happy', 'champion')], ['crew', 'Build Crew', m => m.show === 'build' && m.n >= 2], ['sand', 'Sandy Paws', m => m.location === 'playground' && near(m, 'sandbox')]]),
  S('puzzles', 'Puzzle Masters', '🗝️', 2, [['dig', 'First Dig', m => m.show === 'puzzle'], ['found', 'Treasure Found', m => m.show === 'puzzle' && m.found], ['key', 'Key Found', m => m.show === 'puzzle' && m.key], ['clear', 'Stage Clear', m => m.show === 'puzzle' && m.cleared, 2],
    ['perfect', 'Perfect Stage', m => m.show === 'puzzle' && m.perfect, 3], ['sniff', 'Clue Sniffer', m => m.show === 'puzzle' && has(m, 'sniff', 'look')], ['cheer', 'Celebration', m => m.show === 'puzzle' && has(m, 'happy', 'jump')], ['streak', 'On a Streak', m => m.show === 'puzzle' && (m.streak || 0) >= 3, 3], ['peek', 'Peek', m => has(m, 'peek')]]),
  S('dance', 'Dance Floor', '💃', 2, [['dance', 'Dance', m => has(m, 'dance')], ['disco', 'Disco', m => has(m, 'disco')], ['twirl', 'Twirl', m => has(m, 'twirl')], ['moonwalk', 'Moonwalk', m => has(m, 'moonwalk'), 3], ['spin', 'Spin', m => has(m, 'spin')],
    ['combo', 'Perfect Combo', m => m.show === 'dance' && (m.combo || 0) >= 8, 3], ['group', 'Group Dance', m => m.n >= 2 && (m.poseList || []).filter(p => ['dance', 'disco', 'twirl'].includes(p)).length >= 2, 3], ['finale', 'Finale', m => m.show === 'dance' && m.finale], ['star', 'Rhythm Star', m => m.show === 'dance' && (m.showScore || 0) >= 90, 3]]),
  S('showtime', 'Showtime', '🎭', 1, [['talent', 'Talent', m => has(m, 'superhero', 'yoga')], ['bow', 'Take a Bow', m => has(m, 'bow')], ['salute', 'Salute', m => has(m, 'salute')], ['statue', 'Statue', m => has(m, 'statue')], ['sitpretty', 'Sit Pretty', m => has(m, 'sitpretty')],
    ['heart', 'Heart', m => has(m, 'heart')], ['wink', 'Wink', m => has(m, 'wink')], ['wave', 'Say Hi', m => has(m, 'wave')], ['highfive', 'High Five', m => has(m, 'highfive')]]),
  S('training', 'Training Days', '🎯', 2, [['agility', 'Agility', m => m.training === 'agility'], ['fetch', 'Fetch Practice', m => m.training === 'fetch'], ['build', 'Build Practice', m => m.training === 'build'], ['pose', 'Pose Practice', m => m.training === 'pose'],
    ['fashion', 'Style Practice', m => m.training === 'fashion'], ['dance', 'Dance Practice', m => m.training === 'dance'], ['levelup', 'Level Up', m => !!m.trainingLevelUp, 3], ['mentor', 'Mentor Lesson', m => m.duo === 'teach'], ['partners', 'Training Partners', m => m.duo === 'drill']]),
  S('rare', 'Rare Moments', '✨', 3, [['uncommon', 'Uncommon', m => R[m.rarity] >= 1, 1], ['rare', 'Rare', m => R[m.rarity] >= 2, 2], ['legend', 'Legendary', m => m.rarity === 'legendary'], ['night', 'Rare at Night', m => R[m.rarity] >= 2 && (m.time === 'night' || m.time === 'evening')],
    ['pair', 'Rare Pair', m => R[m.rarity] >= 2 && m.n >= 2], ['toy', 'Rare with a Toy', m => R[m.rarity] >= 2 && !!(m.toy || m.food)], ['split', 'Split Decision', m => !!m.divergent, 2], ['reaction', 'Rare Reaction', m => R[m.rarity] >= 1 && !!m.reaction, 2], ['event', 'Rare in an Event', m => R[m.rarity] >= 1 && !!m.show]]),
  S('night', 'Night Owls', '🌙', 2, [['night', 'Night', m => m.time === 'night', 1], ['evening', 'Evening Glow', m => m.time === 'evening', 1], ['sleepy', 'Sleepy Night', m => m.time === 'night' && has(m, 'sleep')], ['stars', 'Stargazer', m => m.time === 'night' && has(m, 'look')],
    ['zoomies', 'Night Zoomies', m => (m.time === 'night' || m.time === 'evening') && has(m, 'leap')], ['glow', 'Glow Ball', m => m.object === 'glow_ball'], ['cuddle', 'Night Cuddle', m => m.time === 'night' && m.n >= 2 && ['snuggle', 'cuddle'].includes(m.duo), 3], ['snack', 'Late Snack', m => (m.time === 'night' || m.time === 'evening') && !!m.food], ['moon', 'Moonlight', m => m.time === 'night' && R[m.rarity] >= 1, 3]]),
  S('backyard', 'Backyard Adventures', '🌳', 1, [['yard', 'Backyard', m => m.location === 'backyard'], ['kennel', 'Kennel', m => near(m, 'kennel')], ['bench', 'Bench Rest', m => near(m, 'bench')], ['flowers', 'Flower Pot', m => near(m, 'flowerpot')], ['sniff', 'Sniff Outside', m => !m.indoor && has(m, 'sniff')],
    ['squeaky', 'Squeaky', m => m.toy === 'squeaky'], ['frisbee', 'Frisbee', m => m.object === 'frisbee', 2], ['sunny', 'Sunny Day', m => !m.indoor && (m.time === 'day' || m.time === 'morning')], ['fetchout', 'Outdoor Fetch', m => !m.indoor && rx(m, 'return'), 2]]),
  S('playground', 'Playground Fun', '🛝', 2, [['play', 'Playground', m => m.location === 'playground', 1], ['sandbox', 'Sandbox', m => near(m, 'sandbox')], ['bubbles', 'Bubbles', m => m.object === 'bubble_machine'], ['beachball', 'Beach Ball', m => m.object === 'beach_ball'], ['kite', 'Kite', m => m.object === 'kite'],
    ['jump', 'Big Jump', m => m.location === 'playground' && has(m, 'jump', 'leap')], ['group', 'Playground Pack', m => m.location === 'playground' && m.n >= 3, 3], ['chase', 'Playground Chase', m => m.location === 'playground' && rx(m, 'chase', 'race')], ['champ', 'Playground Champ', m => m.location === 'playground' && has(m, 'champion'), 3]]),
  S('garden', 'Garden Party', '🌷', 2, [['garden', 'Garden', m => m.location === 'garden', 1], ['picnic', 'Picnic', m => m.object === 'picnic_mat'], ['cake', 'Party Cake', m => m.object === 'birthday_cake'], ['bench', 'Garden Bench', m => m.location === 'garden' && near(m, 'bench')], ['flowers', 'Among Flowers', m => m.location === 'garden' && near(m, 'flowerpot')],
    ['friends', 'Garden Friends', m => m.location === 'garden' && m.n >= 2], ['nap', 'Garden Nap', m => m.location === 'garden' && has(m, 'sleep')], ['sniff', 'Smell the Roses', m => m.location === 'garden' && has(m, 'sniff')], ['rare', 'Garden Rare', m => m.location === 'garden' && R[m.rarity] >= 2, 3]]),
  S('kitchen', 'Kitchen Crew', '🍳', 2, [['kitchen', 'Kitchen', m => m.location === 'kitchen', 1], ['kibble', 'Kibble', m => m.food === 'kibble'], ['fish', 'Fish', m => m.food === 'fish'], ['carrot', 'Carrot', m => m.food === 'carrot'], ['cookie', 'Cookie', m => m.food === 'cookie'],
    ['bowl', 'Food Bowl', m => m.object === 'food_bowl'], ['feeder', 'Puzzle Feeder', m => m.object === 'puzzle_feeder'], ['chef', 'Little Chef', m => m.location === 'kitchen' && rx(m, 'beg')], ['share', 'Kitchen Share', m => m.location === 'kitchen' && rx(m, 'share'), 3]]),
  S('studio', 'Studio Session', '📷', 2, [['studio', 'Studio', m => m.location === 'photo_studio', 1], ['tripod', 'Tripod', m => m.object === 'camera_tripod'], ['armchair', 'Armchair', m => near(m, 'armchair')], ['plush', 'Plush Buddy', m => m.toy === 'plush'], ['portrait', 'Portrait', m => m.location === 'photo_studio' && m.n === 1 && (m.score || 0) >= 85],
    ['duo', 'Duo Portrait', m => m.location === 'photo_studio' && m.n === 2], ['five', 'Five Stars', m => m.location === 'photo_studio' && (m.stars || 0) >= 5, 3], ['pose', 'Studio Pose', m => m.location === 'photo_studio' && has(m, 'sitpretty', 'statue', 'heart')], ['spot', 'Spotlight Rare', m => m.location === 'photo_studio' && R[m.rarity] >= 2, 3]]),
  S('season', 'Autumn Leaves', '🍂', 1, [['sit', 'Autumn Sit', m => m.season === 'autumn' && has(m, 'sit')], ['jump', 'Leaf Jump', m => m.season === 'autumn' && has(m, 'jump')], ['roll', 'Leaf Roll', m => m.season === 'autumn' && has(m, 'roll', 'sleepyroll')], ['spin', 'Leaf Spin', m => m.season === 'autumn' && has(m, 'spin')],
    ['stretch', 'Autumn Stretch', m => m.season === 'autumn' && has(m, 'stretch', 'yoga')], ['peek', 'Peek-a-boo', m => m.season === 'autumn' && has(m, 'peek')], ['statue', 'Still Life', m => m.season === 'autumn' && has(m, 'statue')], ['sitpretty', 'Autumn Portrait', m => m.season === 'autumn' && has(m, 'sitpretty')], ['heart', 'Autumn Love', m => m.season === 'autumn' && has(m, 'heart')]]),
  S('community', 'Community Life', '🏘️', 2, [['event', 'Event Snap', m => !!m.show, 1], ['team', 'Team Event Snap', m => !!m.team], ['solo', 'Solo Event Snap', m => !!m.show && !m.team, 1], ['trio', 'The Whole Pack', m => m.n >= 3], ['wave', 'Welcome', m => has(m, 'wave') && m.n >= 2],
    ['highfive', 'Team High Five', m => has(m, 'highfive') && m.n >= 2, 3], ['party', 'Party', m => m.n >= 2 && has(m, 'dance', 'disco')], ['bow', 'Curtain Call', m => has(m, 'bow') && !!m.show], ['cheer', 'Team Cheer', m => !!m.team && has(m, 'happy', 'champion')]]),
  S('milestones', 'Life Moments', '🌿', 3, [['bff', 'Best Friends Forever', m => m.relationType === 'best_friend'], ['mentor', 'Mentor & Student', m => m.relationType === 'mentor'], ['rival', 'Friendly Rivals', m => m.relationType === 'playful_rival'], ['buddy', 'Adventure Buddies', m => m.relationType === 'adventure_buddy'],
    ['sp100', 'A 100-point Photo', m => (m.spTotal || 0) >= 100, 2], ['sp140', 'A 140-point Photo', m => (m.spTotal || 0) >= 140], ['five', 'Five Stars', m => (m.stars || 0) >= 5, 2], ['trio', 'Family Photo', m => m.n >= 3 && (m.score || 0) >= 80], ['legend', 'Legend', m => m.rarity === 'legendary' && m.n >= 2]]),
];
export const SEASON = { id: 'autumn-2026', name: 'Autumn Adventures', icon: '🍂', start: new Date(2026, 8, 21).getTime(), end: new Date(2026, 11, 1).getTime(),
  setReward: { coins: 150 },
  // pacing: sets are released in weekly waves (6 → 22) and each day unlocks at most `dailyNew` new photos
  waves: [6, 10, 14, 18, 22], waveDays: 7, dailyNew: 5, milestones: [{ id: 'm5', sets: 5, reward: { coins: 400 } }, { id: 'm11', sets: 11, reward: { diamonds: 20 } }, { id: 'm16', sets: 16, reward: { diamonds: 30 } }],
  grand: { id: 'grand', sets: 22, reward: { diamonds: 60, badge: 'Autumn Album Master' }, label: 'Golden Frame + Album Master title' } };
export const SET_TOTAL = () => SEASON_SETS.length;
export const SLOT_COUNT = () => SEASON_SETS.reduce((a, s) => a + s.slots.length, 0);

const slotsOf = st => { const a = ensureV21(st).album; return (a.slots[SEASON.id] = a.slots[SEASON.id] || {}); };
export function albumMatches(m) {
  const out = [];
  for (const s of SEASON_SETS) for (const sl of s.slots) { let ok = false; try { ok = !!sl.test(m); } catch (e) {} if (ok) out.push({ set: s.id, slot: sl.id, d: sl.d }); }
  return out;
}
/** Qualify one photo: at most ONE missing slot (the hardest); if every match is already filled it is a duplicate. */
export const releasedSets = (now = Date.now()) => SEASON.waves[Math.max(0, Math.min(SEASON.waves.length - 1, Math.floor((now - SEASON.start) / (SEASON.waveDays * 864e5))))];
export const isReleased = (setId, now = Date.now()) => SEASON_SETS.findIndex(s => s.id === setId) < releasedSets(now);
export function newToday(st, now = Date.now()) { const a = ensureV21(st, now).album; return a.day === dayKey(now) ? a.dayNew || 0 : 0; }
export function qualify(st, m, now = Date.now()) {
  if (now >= SEASON.end) return { slot: null, duplicate: false, closed: true };
  const got = slotsOf(st), matches = albumMatches(m).filter(x => isReleased(x.set, now));
  const missing = matches.filter(x => !got[x.set]?.[x.slot]).sort((a, b) => b.d - a.d || SEASON_SETS.findIndex(s => s.id === a.set) - SEASON_SETS.findIndex(s => s.id === b.set));
  if (missing.length && newToday(st, now) >= SEASON.dailyNew) return { slot: null, duplicate: false, capped: true, wouldBe: missing[0] };
  if (missing.length) {
    const a = ensureV21(st, now).album; if (a.day !== dayKey(now)) { a.day = dayKey(now); a.dayNew = 0; } a.dayNew++;
    const x = missing[0], S0 = SEASON_SETS.find(s => s.id === x.set);
    (got[x.set] = got[x.set] || {})[x.slot] = { photoId: m.id || null, at: now, stars: m.stars || 0, rarity: m.rarity || 'common', pet: m.petName || null };
    const complete = S0.slots.every(sl => got[x.set][sl.id]);
    return { slot: { set: x.set, slot: x.slot, setName: S0.name, slotName: S0.slots.find(s => s.id === x.slot).name, setIcon: S0.icon }, setComplete: complete, seasonComplete: complete && SEASON_SETS.every(s => s.slots.every(sl => got[s.id]?.[sl.id])), duplicate: false };
  }
  if (matches.length) { const k = `${matches[0].set}/${matches[0].slot}`; const d = ensureV21(st).album.dups; d[k] = (d[k] || 0) + 1; return { slot: null, duplicate: true, dupOf: matches[0], dupCount: d[k] }; }
  return { slot: null, duplicate: false };
}
export function albumView(st, now = Date.now()) {
  const got = slotsOf(st);
  const sets = SEASON_SETS.map(s => { const have = s.slots.filter(x => got[s.id]?.[x.id]).length, claimId = `alb21:${SEASON.id}:${s.id}`;
    return { id: s.id, name: s.name, icon: s.icon, have, total: s.slots.length, complete: have === s.slots.length, claimed: ledgerHas(st, claimId), claimId,
      slots: s.slots.map(x => ({ id: x.id, name: x.name, d: x.d, ...(got[s.id]?.[x.id] || {}), got: !!got[s.id]?.[x.id] })) }; });
  const done = sets.filter(s => s.complete).length, filled = sets.reduce((a, s) => a + s.have, 0);
  const ms = [...SEASON.milestones, SEASON.grand].map(m => { const claimId = `alb21:${SEASON.id}:${m.id}`; return { ...m, done: done >= m.sets, claimed: ledgerHas(st, claimId), claimId }; });
  const released = releasedSets(now);
  for (const s of sets) s.locked = SEASON_SETS.findIndex(x => x.id === s.id) >= released;
  return { released, newToday: newToday(st, now), dailyNew: SEASON.dailyNew, nextWaveIn: released < SET_TOTAL() ? SEASON.start + (SEASON.waves.indexOf(released) + 1) * SEASON.waveDays * 864e5 - now : 0, season: SEASON, daysLeft: Math.max(0, Math.ceil((SEASON.end - now) / 864e5)), sets, setsDone: done, filled, total: SLOT_COUNT(), milestones: ms, dups: Object.values(ensureV21(st).album.dups).reduce((a, b) => a + b, 0) };
}
export function claimAlbum(st, claimId, now = Date.now()) {
  const v = albumView(st, now), s = v.sets.find(x => x.claimId === claimId), m = v.milestones.find(x => x.claimId === claimId);
  const it = s ? { done: s.complete, claimed: s.claimed, reward: SEASON.setReward } : m ? { done: m.done, claimed: m.claimed, reward: m.reward } : null;
  if (!it) return { ok: false, reason: 'unknown' };
  if (it.claimed) return { ok: false, reason: 'claimed' };
  if (!it.done) return { ok: false, reason: 'not_done' };
  return { ok: true, ...pay(st, claimId, it.reward, 'album21', now) };
}
/* Only moments that MEAN the same thing move across; everything else stays as legacy history (never deleted). */
const SAME20 = { funny: ['sneeze', 'confused', 'yawn', 'surprised', 'stumble', 'happy', 'excited', 'grumpy', 'sleepy'], friends: ['play', 'nap', 'share', 'race', 'explore', 'help', 'celebrate', 'rare'],
  rare: ['uncommon', 'rare', 'legend', 'night', 'pair', 'event'], community: ['event', 'team', 'solo', 'trio'] };
function MAP20(set, slot) {
  if (SAME20[set]?.includes(slot)) return [set, slot];
  if (set === 'rare' && slot === 'mixed') return ['rare', 'split'];
  if (set === 'poses') return ['season', slot];          // 2.0 "Seasonal Poses" = 2.1 "Autumn Leaves" (same nine poses)
  return null;
}
/** 2.0 Album → 2.1: equivalent moments keep their photo; everything else is kept as legacy history. */
export function migrateAlbum20(st, now = Date.now()) {
  const v = ensureV21(st, now); if (v.album.migrated20) return { mapped: 0, legacy: 0 };
  const old = st.v2?.album?.slots || {}; let mapped = 0, legacy = 0;
  for (const [season, sets] of Object.entries(old)) for (const [set, slots] of Object.entries(sets || {})) for (const [slot, rec] of Object.entries(slots || {})) {
    const to = MAP20(set, slot), target = to && SEASON_SETS.find(s => s.id === to[0])?.slots.find(x => x.id === to[1]);
    const got = slotsOf(st);
    if (season === SEASON.id && target && !got[to[0]]?.[to[1]]) { (got[to[0]] = got[to[0]] || {})[to[1]] = { ...rec, from20: true }; mapped++; }
    else { v.album.legacy.push({ season, set, slot, ...rec }); legacy++; }
  }
  v.album.migrated20 = now;
  return { mapped, legacy };
}

/* ================================================================ TRAINING (playable) */
export const DISCIPLINES = {
  agility: { name: 'Agility', icon: '🏃', blurb: 'Timed obstacle course: hurdles, weave, tunnel, balance.' },
  fetch: { name: 'Fetch', icon: '🎾', blurb: 'Throw the ball — your Poka tracks, chases, grabs and returns it.' },
  build: { name: 'Building', icon: '🧱', blurb: 'Stack blocks with good timing.' },
  pose: { name: 'Posing', icon: '📸', blurb: 'Cue a pose and capture it at its peak.' },
  fashion: { name: 'Style', icon: '👒', blurb: 'Dress for a theme, walk, snap.' },
  dance: { name: 'Dance', icon: '💃', blurb: 'Follow the rhythm, then catch the finale.' },
};
export const TRAIN = { maxLevel: 10, xpPerLevel: 100, rewardedPerDay: 3 };
export function trainState(st, petId, kind) { const t = (ensureV21(st).training[petId] = ensureV21(st).training[petId] || {}); return (t[kind] = t[kind] || { xp: 0, lvl: 0, best: 0, sessions: 0, day: null, today: 0 }); }
/** Record a finished session (score 0..100). Only the first few sessions a day grant XP — no grinding, never bought. */
export function trainSession(st, petId, kind, score, now = Date.now()) {
  if (!DISCIPLINES[kind]) return { ok: false };
  const s = trainState(st, petId, kind), d = dayKey(now);
  if (s.day !== d) { s.day = d; s.today = 0; }
  s.sessions++; s.best = Math.max(s.best, Math.round(score));
  const rewarded = s.today < TRAIN.rewardedPerDay; s.today++;
  const gain = rewarded ? Math.round(10 + clamp(score, 0, 100) * 0.3) : 0, before = s.lvl;
  s.xp += gain; s.lvl = Math.min(TRAIN.maxLevel, Math.floor(s.xp / TRAIN.xpPerLevel));
  const v = ensureV21(st, now), dd = (v.day[d] = v.day[d] || {}); dd.training = (dd.training || 0) + 1;
  return { ok: true, gain, rewarded, level: s.lvl, levelUp: s.lvl > before, best: s.best };
}
/* Modest, capped benefits. A level-10 Poka is noticeably better, never guaranteed to win. */
export const benefit = {
  raceSpeed: lvl => 1 + clamp(lvl, 0, 10) * 0.012,      // ≤ +12 % top speed
  danceWindowMs: lvl => 120 + clamp(lvl, 0, 10) * 6,    // ≤ +60 ms timing window
  poseHoldMs: lvl => 900 + clamp(lvl, 0, 10) * 60,      // pose held longer = easier to capture
  fetchReturn: lvl => 0.55 + clamp(lvl, 0, 10) * 0.035, // chance to bring the ball back
  buildWindow: lvl => 0.18 + clamp(lvl, 0, 10) * 0.008, // stacking tolerance
};
export const trainLevel = (st, petId, kind) => trainState(st, petId, kind).lvl;

/* ================================================================ Fashion themes (used by the show + training) */
export const THEMES = {
  casual: { name: 'Casual Day', draws: ['hoodie', 'tee', 'cap', 'overalls', 'backpack', 'sunnies', 'visor'] },
  formal: { name: 'Formal Night', draws: ['bowtie', 'necktie', 'tophat', 'pearls', 'vest', 'cape', 'crown', 'locket', 'beret'] },
  seasonal: { name: 'Autumn Style', draws: ['sweater', 'scarf', 'beanie', 'raincoat', 'rainhat', 'leafcrown'] },
  sport: { name: 'Sporty', draws: ['jersey', 'helmet', 'medal', 'visor', 'cap', 'headphones'] },
  funny: { name: 'Silly Show', draws: ['party', 'bunnyears', 'antlers', 'heartglasses', 'wizard', 'chefhat', 'daisy', 'roundglasses', 'wings'] },
};
/** How well an outfit (list of item draw kinds) matches a theme: 0..100. More matching pieces = better, capped. */
export function themeScore(theme, draws) {
  const T = THEMES[theme]; if (!T) return 0;
  const hit = (draws || []).filter(d => T.draws.includes(d)).length, off = (draws || []).length - hit;
  return clamp(Math.round(30 + hit * 28 - off * 8), 0, 100);
}
