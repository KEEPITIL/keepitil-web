/* GAME STATE — the single persisted record.
   ---------------------------------------------------------------------------
   Small structured progress lives in localStorage (synchronous, survives
   restarts, works offline). PHOTOS do not: they live in IndexedDB
   (game/album.js) because a handful of JPEGs would blow localStorage's quota.

   Local is always the working copy. Cloud sync (platform/cloud.js) uploads
   this record for signed-in players; a guest's progress is the same record,
   so attaching an account later loses nothing. */

import { STARTER_SKILLS } from '../data/skills.js';
import { starsFor as starsOf, LEVEL_XP } from '../data/progression.js';

import { suffix } from '../platform/profile.js';
import { seededSave } from '../data/seed.js';
const KEY = 'pokasnap-save-v1' + suffix;
export const SCHEMA = 1;

export function freshState() {
  return {
    schema: SCHEMA,
    onboarded: false,
    account: { mode: null, userId: null, email: null },  // mode: 'guest' | 'email' | 'apple' | 'google'
    pet: null,                 // { species, appearance, name, personality, equipped:{}, createdAt }
    progress: { xp: 0, level: 1, coins: 0, snaps: 0, bestScore: 0, missions: {} },  // missions: { id: bestScore }
    inventory: [],             // owned itemIDs
    currentMission: 'first_snap',
    settings: { sound: true, haptics: true, music: true, musicVolume: 0.8, sfxVolume: 1 },
    // ---- companion (all optional, none punitive; see game/companion.js) ----
    companion: { lastSeen: 0, lastWelcome: 0, mood: null, boost: null },   // boost: { kind, at }
    care: { last: {} },                          // action id -> last REWARDED time
    skills: { learned: null, practice: {} },     // learned:null -> starters on load
    daily: { day: null, done: {}, bonus: false },
    streak: { count: 0, lastDay: null, best: 0 },
    achievements: {},                            // id -> unlocked-at
    memory: { poseUse: {}, itemUse: {}, lastItems: [] },
    hints: {},                                   // one-time UI hints already shown
    // ---- 1.2 economy (all optional; game/ledger.js owns coins) ----
    ledger: null,                                // { entries, ids, earned, spent, maxSeen, flags } -- created on first use
    ownership: {},                               // itemID -> { via, at, ref }  (OWNED forever)
    plus: { active: false, product: null, expiresAt: 0, source: null, preview: { until: 0, used: false } },
    activity: { days: [], streak: 0, best: 0, lastDay: null },
    events: {},                                  // eventId -> { points, path, joined, claimed, today }
    walk: null,                                  // game/walk.js
    collections: {},
    cloud: { autoBackup: null, lastBackupAt: 0, memories: {} },   // memories: snapId -> path
    notify: { asked: false, prefs: { dailySnap: true, friday: true, eventEnding: true, weeklyNear: false, monthlyNew: true, journey: true, relationship: true, homeland: false, care: true } },
    // ---- 1.3 gameplay depth (all optional) ----
    scoreScale: 100,                             // 1.3 scores are 0-100; older saves stored 0-5000
    stars: {},                                   // challengeId -> best stars 0-5 (permanent)
    starTrack: { claimed: {} },                  // milestone stars -> claimed-at
    academy: { disciplines: {}, yarn: { daily: {}, endless: { best: 0 } }, lastWalkPrompt: 0, sessionStart: 0 },
    growth: {},                                  // attribute -> points gained (added to species base)
    style: {},                                   // itemID -> { level, wear }
    imbue: {},                                   // itemID -> perk id
    threads: 0,                                  // Imbue material, earned from Academy ranks & stars
    loadouts: [],                                // [{ name, equipped }] max 5
    sequence: null,                              // { challenge, hits, startedAt } for Master sequences
    updatedAt: Date.now(),
  };
}

/* 0-5000 -> 0-100 (one time). A 1.2 best of 4400 becomes 88. */
function migrateScores(out) {
  if (out.scoreScale === 100) return;
  const cv = v => (typeof v === 'number' ? Math.min(100, Math.round(v / 50)) : v);   // every pre-1.3 value is on the 0-5000 scale
  out.progress.bestScore = cv(out.progress.bestScore);
  for (const k of Object.keys(out.progress.missions || {})) out.progress.missions[k] = cv(out.progress.missions[k]);
  // 1.3 steepened the XP curve: a 1.2 player keeps the level they earned (XP topped up, never lowered)
  const lv = out.progress.level || 1;
  if (LEVEL_XP[lv] && (out.progress.xp || 0) < LEVEL_XP[lv]) out.progress.xp = LEVEL_XP[lv];
  out.scoreScale = 100;
}

/* Fill fields added after a save was written. Additive only: an older save
   gains defaults and never loses a value. */
function upgrade(s) {
  const f = freshState();
  const out = { ...f, ...s };
  for (const k of ['progress', 'settings', 'companion', 'care', 'skills', 'daily', 'streak', 'memory', 'hints', 'plus', 'activity', 'cloud', 'notify'])
    out[k] = { ...f[k], ...(s[k] || {}) };
  out.plus.preview = { ...f.plus.preview, ...(s.plus?.preview || {}) };
  out.notify.prefs = { ...f.notify.prefs, ...(s.notify?.prefs || {}) };
  for (const k of ['ownership', 'events', 'collections']) out[k] = { ...(s[k] || {}) };
  out.ledger = s.ledger && Array.isArray(s.ledger.entries) ? s.ledger : null;
  out.walk = s.walk || null;
  if (!Array.isArray(out.skills.learned)) out.skills.learned = [...STARTER_SKILLS];
  for (const id of STARTER_SKILLS) if (!out.skills.learned.includes(id)) out.skills.learned.push(id);
  out.achievements = { ...(s.achievements || {}) };
  out.progress.missions = { ...(s.progress?.missions || {}) };
  out.progress.diamonds = out.progress.diamonds || 0;
  for (const k of ['stars', 'growth', 'style', 'imbue']) out[k] = { ...(s[k] || {}) };
  out.starTrack = { claimed: { ...(s.starTrack?.claimed || {}) } };
  out.academy = { ...f.academy, ...(s.academy || {}), disciplines: { ...(s.academy?.disciplines || {}) }, yarn: { ...f.academy.yarn, ...(s.academy?.yarn || {}) } };
  out.loadouts = Array.isArray(s.loadouts) ? s.loadouts.slice(0, 5) : [];
  out.scoreScale = s.scoreScale;       // absent on pre-1.3 saves -> migrate
  migrateScores(out);
  if (!s.stars && s.progress?.missions) for (const [k, v] of Object.entries(out.progress.missions)) out.stars[k] = starsOf(v);
  return out;
}

let state = null;
const listeners = new Set();

export function load() {
  try {
    let raw = localStorage.getItem(KEY);
    if (!raw && suffix === ':seed') { raw = JSON.stringify(seededSave(Date.now())); localStorage.setItem(KEY, raw); }
    // 2.0: before the first 2.0 launch touches a pre-2.0 save, keep an untouched copy (never overwritten)
    if (raw && !suffix && !raw.includes('"v2"')) { try { if (!localStorage.getItem(KEY + '.pre2-backup')) localStorage.setItem(KEY + '.pre2-backup', raw); } catch (e) {} }
    // 2.1: the same safety net before the first 2.1 launch migrates a 2.0 save (never overwritten)
    if (raw && !suffix && !raw.includes('"v21"')) { try { if (!localStorage.getItem(KEY + '.pre21-backup')) localStorage.setItem(KEY + '.pre21-backup', raw); } catch (e) {} }
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.schema === SCHEMA) { state = upgrade(s); return state; }
      // never silently destroy a record we don't recognise: keep a copy before starting fresh
      try { if (!localStorage.getItem(KEY + '.unrecognised')) localStorage.setItem(KEY + '.unrecognised', raw); } catch (e) {}
    }
  } catch (e) { /* a corrupt record must never crash launch */ }
  state = upgrade(freshState());
  return state;
}

export function get() { return state || load(); }

export function save() {
  state.updatedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  listeners.forEach(f => { try { f(state); } catch (e) {} });
}

export function update(fn) { fn(state); save(); return state; }
export function onChange(f) { listeners.add(f); return () => listeners.delete(f); }

/* Replace local with a cloud copy ONLY when it is genuinely newer and valid. */
export function adopt(remote) {
  if (!remote || remote.schema !== SCHEMA || !remote.pet) return false;
  if ((remote.updatedAt || 0) <= (state.updatedAt || 0)) return false;
  state = upgrade(remote);
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  listeners.forEach(f => f(state));
  return true;
}

export { upgrade };
export function reset() { state = upgrade(freshState()); try { localStorage.removeItem(KEY); } catch (e) {} }
