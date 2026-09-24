/* GAME STATE — the single persisted record.
   ---------------------------------------------------------------------------
   Small structured progress lives in localStorage (synchronous, survives
   restarts, works offline). PHOTOS do not: they live in IndexedDB
   (game/album.js) because a handful of JPEGs would blow localStorage's quota.

   Local is always the working copy. Cloud sync (platform/cloud.js) uploads
   this record for signed-in players; a guest's progress is the same record,
   so attaching an account later loses nothing. */

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
    settings: { sound: true, haptics: true },
    updatedAt: Date.now(),
  };
}

let state = null;
const listeners = new Set();

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.schema === SCHEMA) { state = { ...freshState(), ...s, progress: { ...freshState().progress, ...s.progress }, settings: { ...freshState().settings, ...s.settings } }; return state; }
    }
  } catch (e) { /* a corrupt record must never crash launch */ }
  state = freshState();
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
  state = { ...freshState(), ...remote };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  listeners.forEach(f => f(state));
  return true;
}

export function reset() { state = freshState(); try { localStorage.removeItem(KEY); } catch (e) {} }
