/* COMPANION — mood, care, daily card, streaks, badges, memory.
   ---------------------------------------------------------------------------
   Pure functions over the save record so every rule is testable in Node.
   THE RULE: nothing here ever takes anything away. Time away never lowers a
   stat, removes an item, level, skill or photo, or blocks play. Mood is a
   label computed from recent good things, not a meter that drains. Coming
   back after a break is celebrated ("{name} missed you!"), never punished. */

import { FAVORITE_FOOD, FOODS } from '../data/care.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { item as itemOf } from '../data/items.js';
import { POSES } from '../data/poses.js';
import { species as speciesOf } from '../data/pets.js';
import { grantXP } from './progress.js';
import * as ledger from './ledger.js';
import { EARN } from '../data/economy.js';
import { onCare } from './adventure.js';

const H = 3600e3;
export const AWAY_MS = 20 * H;           // "welcome back" threshold
export const WELCOME_COINS = EARN.welcomeBack;
export const DAILY_TASKS = [
  { id: 'photo',  name: 'Take today\'s photo', icon: '📸' },
  { id: 'feed',   name: 'Feed {name}',         icon: '🍽️' },
  { id: 'train',  name: 'Train one skill',     icon: '🎓' },
  { id: 'outfit', name: 'Change the outfit',   icon: '👕' },
];
export const DAILY_BONUS = { xp: 60, coins: EARN.dailyBondBonus };

export const MOODS = {
  HAPPY:    { id: 'HAPPY',    label: 'Happy',    icon: '😊' },
  PLAYFUL:  { id: 'PLAYFUL',  label: 'Playful',  icon: '🎾' },
  CALM:     { id: 'CALM',     label: 'Calm',     icon: '😌' },
  SLEEPY:   { id: 'SLEEPY',   label: 'Sleepy',   icon: '😴' },
  HUNGRY:   { id: 'HUNGRY',   label: 'Peckish',  icon: '🍪' },
  EXCITED:  { id: 'EXCITED',  label: 'Excited',  icon: '🤩' },
};
const BOOST_MOOD = { snap: 'HAPPY', mission: 'HAPPY', feed: 'HAPPY', treat: 'EXCITED', pet: 'HAPPY', rest: 'CALM', train: 'PLAYFUL', play: 'PLAYFUL', outfit: 'EXCITED', welcome: 'EXCITED', poke: 'PLAYFUL' };

export function dayKey(now = Date.now()) {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function prevDay(key) { const [y, m, d] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, d - 1).getTime() + 12 * H); }

/* ---------------------------------------------------------------- mood -- */
export function moodFor(st, now = Date.now()) {
  const b = st.companion?.boost;
  if (b && now - b.at < 45 * 60e3) return MOODS[BOOST_MOOD[b.kind] || 'HAPPY'];
  const hr = new Date(now).getHours();
  if (hr >= 22 || hr < 6) return MOODS.SLEEPY;
  // "peckish" is a gentle nudge, never a penalty: it only reads the daily card
  if (st.daily?.day === dayKey(now) ? !st.daily.done.feed : hr >= 11) return MOODS.HUNGRY;
  return MOODS.CALM;
}
/** Record a good thing. Returns the new mood if it changed (for analytics). */
export function boost(st, kind, now = Date.now()) {
  const before = moodFor(st, now).id;
  st.companion.boost = { kind, at: now };
  const after = moodFor(st, now).id;
  st.companion.mood = after;
  return before !== after ? after : null;
}

/* ------------------------------------------------------- welcome back -- */
/** Call on launch/foreground. Never removes anything; may pay a small gift. */
export function checkIn(st, now = Date.now()) {
  const last = st.companion.lastSeen || 0;
  const away = last && now - last >= AWAY_MS;
  let gift = 0;
  if (away && now - (st.companion.lastWelcome || 0) >= AWAY_MS) {
    gift = ledger.earn(st, { id: `welcome:${ledger.dayKey(now)}`, source: 'welcome', amount: WELCOME_COINS, now }).amount; st.companion.lastWelcome = now;
    boost(st, 'welcome', now);
  }
  st.companion.lastSeen = now;
  return { returning: !!away, awayDays: away ? Math.floor((now - last) / (24 * H)) : 0, gift };
}

/* ---------------------------------------------------------------- care -- */
export function favoriteFood(st) { return FAVORITE_FOOD[speciesOf(st.pet?.species)?.animal] || 'cookie'; }
/** Always succeeds and always animates. Rewards follow the daily cap (economy CAPS.care). */
export function care(st, action, now = Date.now(), foodId = null) {
  const r = onCare(st, action, now);
  const fav = action === 'feed' && foodId === favoriteFood(st);
  const moodChanged = boost(st, action, now);
  const daily = action === 'feed' || action === 'treat' ? markDaily(st, 'feed', now) : null;
  return { ...r, fav, moodChanged, daily, levelUp: 0, granted: [] };
}
import { CAPS } from '../data/economy.js';
/** 0 while today's care rewards remain; otherwise ms until tomorrow (the card says "just for love"). */
export function careReadyIn(st, action, now = Date.now()) {
  if (ledger.countToday(st, 'care', now) < CAPS.care) return 0;
  const t = new Date(now); t.setHours(24, 0, 0, 0); return +t - now;
}

/* --------------------------------------------------------------- daily -- */
function freshDay(st, now) {
  const k = dayKey(now);
  if (st.daily.day !== k) st.daily = { day: k, done: {}, bonus: false };
}
export function dailyView(st, now = Date.now()) {
  const k = dayKey(now), same = st.daily.day === k;
  return { day: k, done: same ? st.daily.done : {}, bonus: same && st.daily.bonus, streak: streakView(st, now) };
}
/** Mark a daily task. The bond bonus pays once when all four are done. */
export function markDaily(st, task, now = Date.now()) {
  freshDay(st, now);
  if (st.daily.done[task]) return { newly: false, bonus: null };
  st.daily.done[task] = true;
  touchStreak(st, now);
  let bonus = null;
  if (!st.daily.bonus && DAILY_TASKS.every(t => st.daily.done[t.id])) {
    st.daily.bonus = true;
    const c = ledger.earn(st, { id: `bond:${st.daily.day}`, source: 'dailyBond', amount: DAILY_BONUS.coins, now });
    bonus = { ...DAILY_BONUS, coins: c.amount, ...grantXP(st, DAILY_BONUS.xp) };
  }
  return { newly: true, task, bonus };
}
/** Today's featured photo challenge: stable for the day, varies day to day. */
export function dailyMission(list, now = Date.now()) {
  const pool = list.filter(m => m.missionID !== 'first_snap');
  let h = 0; for (const c of dayKey(now)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return pool[h % pool.length];
}

/* -------------------------------------------------------------- streak -- */
function touchStreak(st, now) {
  const k = dayKey(now), s = st.streak;
  if (s.lastDay === k) return;
  s.count = s.lastDay === prevDay(k) ? s.count + 1 : 1;   // a gap restarts the COUNT only
  s.lastDay = k; s.best = Math.max(s.best, s.count);
}
export function streakView(st, now = Date.now()) {
  const k = dayKey(now), s = st.streak;
  const alive = s.lastDay === k || s.lastDay === prevDay(k);
  return { count: alive ? s.count : 0, best: s.best, today: s.lastDay === k };
}

/* ------------------------------------------------------------- badges -- */
/** Unlock any newly earned badges. ctx: facts about the event (equippedCount). */
export function checkBadges(st, ctx = {}, now = Date.now()) {
  const out = [];
  for (const a of ACHIEVEMENTS) {
    if (st.achievements[a.id]) continue;
    if (!a.test(st, ctx)) continue;
    st.achievements[a.id] = now;
    ledger.earn(st, { id: `badge:${a.id}`, source: 'badge', amount: a.coins || 0, ref: a.id, now });
    if (a.item && !st.inventory.includes(a.item)) { st.inventory.push(a.item); st.ownership = st.ownership || {}; st.ownership[a.item] = { via: 'ACHIEVEMENT_LIMITED', at: now, ref: a.id }; }
    out.push(a);
  }
  return out;
}

/* ------------------------------------------------------------- memory -- */
export function remember(st, poseId, equipped) {
  const m = st.memory;
  m.poseUse[poseId] = (m.poseUse[poseId] || 0) + 1;
  const items = Object.values(equipped || {}).filter(Boolean);
  for (const id of items) m.itemUse[id] = (m.itemUse[id] || 0) + 1;
  m.lastItems = items;
}
export function favoritePose(st) {
  const e = Object.entries(st.memory.poseUse || {}).sort((a, b) => b[1] - a[1])[0];
  return e ? POSES[e[0]] : null;
}
export function favoriteItem(st) {
  const e = Object.entries(st.memory.itemUse || {}).sort((a, b) => b[1] - a[1])[0];
  return e && e[1] >= 3 ? itemOf(e[0]) : null;
}
const MILESTONES = [5, 10, 25, 50, 75, 100, 150, 200];
const ord = n => n + ((n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));
/** A line that proves the pet remembers. null when nothing is worth saying. */
export function memoryLine(st) {
  const n = st.progress.snaps;
  if (MILESTONES.includes(n)) return `That's our ${ord(n)} photo together! 🎉`;
  const fav = favoriteItem(st);
  if (fav && st.memory.lastItems.includes(fav.itemID) && n % 3 === 0) return `You keep making me wear that ${fav.name.toLowerCase()} 😂`;
  return null;
}
export function profile(st) {
  const fp = favoritePose(st);
  return {
    name: st.pet?.name, adopted: st.pet?.createdAt, photos: st.progress.snaps,
    missions: Object.keys(st.progress.missions).length, best: st.progress.bestScore,
    favoritePose: fp ? `${fp.icon} ${fp.name}` : '—', outfits: st.inventory.length,
    skills: (st.skills.learned || []).length,
  };
}
export { FOODS };
