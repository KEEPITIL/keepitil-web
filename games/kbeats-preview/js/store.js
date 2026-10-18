/* Local persistence. Everything here is per-device until the KBeats backend (see ARCHITECTURE.md)
   is live; nothing in this file makes a network request. */
const LS = {
  get(k, d) { try { const v = localStorage.getItem('kb.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('kb.' + k, JSON.stringify(v)); } catch {} },
};
export { LS };

export const DEFAULT_SETTINGS = {
  output: 'speaker', offsets: { speaker: 0, wired: 0, bluetooth: 0.18 }, music: 0.9, sfx: 0.5, hitSounds: true,
  haptics: true, reducedMotion: false, reducedFlash: false, effects: 1, textScale: 1, name: '',
};
export function settings() {
  const s = { ...DEFAULT_SETTINGS, ...LS.get('settings', {}) };
  s.offsets = { ...DEFAULT_SETTINGS.offsets, ...(s.offsets || {}) };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches && LS.get('settings', {}).reducedMotion == null) s.reducedMotion = true;
  return s;
}
export const saveSettings = s => LS.set('settings', s);

/* Leaderboards are keyed by the exact chart (track · difficulty · version · hash): editing a live
   chart makes a new board instead of silently invalidating existing scores. */
export const boardKey = (trackId, diff, chart) => `${trackId}|${diff}|v${chart.chartVersion}|${chart.hash}`;
export function board(key) { return LS.get('board.' + key, []); }
export function submitLocal(key, entry) {
  const b = board(key); b.push(entry); b.sort((a, c) => c.score - a.score || c.accuracy - a.accuracy);
  const rank = b.indexOf(entry) + 1; LS.set('board.' + key, b.slice(0, 25)); return rank <= 25 ? rank : null;
}
export function personalBest(trackId, diff) { return LS.get('pb', {})[trackId + '|' + diff] || null; }
export function setPersonalBest(trackId, diff, r) {
  const pb = LS.get('pb', {}), k = trackId + '|' + diff, prev = pb[k];
  if (!prev || r.score > prev.score) { pb[k] = { score: r.score, accuracy: r.accuracy, grade: r.grade, stars: r.stars, at: Date.now() }; LS.set('pb', pb); return true; }
  return false;
}
export const toggleSet = (name, id) => { const s = new Set(LS.get(name, [])); s.has(id) ? s.delete(id) : s.add(id); LS.set(name, [...s]); return s.has(id); };
export const inSet = (name, id) => LS.get(name, []).includes(id);

/* Analytics: queued in memory during play, persisted only after the result screen. */
const queue = [];
export const track = (name, props = {}) => queue.push({ name, props, at: Date.now() });
export function flushAnalytics() {
  if (!queue.length) return;
  const stored = LS.get('analytics', []); stored.push(...queue.splice(0)); LS.set('analytics', stored.slice(-500));
}

/* IndexedDB for artist uploads (audio + generated charts). */
function db() {
  return new Promise((res, rej) => { const r = indexedDB.open('kbeats', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('uploads', { keyPath: 'id' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
export async function putUpload(u) { const d = await db(); return new Promise((res, rej) => { const tx = d.transaction('uploads', 'readwrite'); tx.objectStore('uploads').put(u); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
export async function getUploads() { try { const d = await db(); return await new Promise((res, rej) => { const r = d.transaction('uploads').objectStore('uploads').getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); } catch { return []; } }
export async function deleteUpload(id) { const d = await db(); return new Promise(res => { const tx = d.transaction('uploads', 'readwrite'); tx.objectStore('uploads').delete(id); tx.oncomplete = res; }); }
