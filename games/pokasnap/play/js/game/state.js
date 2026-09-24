/* GAME STATE — the single persisted record.
   ---------------------------------------------------------------------------
   Small structured progress lives in localStorage (synchronous, survives
   restarts, works offline). PHOTOS do not: they live in IndexedDB
   (game/album.js) because a handful of JPEGs would blow localStorage's quota.

   Local is always the working copy. Cloud sync (platform/cloud.js) uploads
   this record for signed-in players; a guest's progress is the same record,
   so attaching an account later loses nothing. */

import { STARTER_SKILLS } from '../data/skills.js';

const KEY = 'pokasnap-save-v1';
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
    notify: { asked: false, prefs: { dailySnap: true, friday: true, eventEnding: true, weeklyNear: false, monthlyNew: true, journey: true } },
    updatedAt: Date.now(),
  };
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
  return out;
}

let state = null;
const listeners = new Set();

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.schema === SCHEMA) { state = upgrade(s); return state; }
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
