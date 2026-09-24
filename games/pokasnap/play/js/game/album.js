/* MY SNAPS — photos live in IndexedDB on the device.
   ---------------------------------------------------------------------------
   §20 privacy: camera imagery stays local. Nothing here uploads anything; a
   photo leaves the device only when the player taps Save or Share. */

const DB = 'pokasnap', STORE = 'snaps', VERSION = 1;
let dbp = null;

function db() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' }).createIndex('at', 'at');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
function tx(mode) { return db().then(d => d.transaction(STORE, mode).objectStore(STORE)); }
const wrap = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

/** snap = { blob, petName, missionID, missionTitle, score, poseId, caption, fav } */
export async function add(snap) {
  const rec = { id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: Date.now(), ...snap };
  await wrap((await tx('readwrite')).put(rec));
  return rec;
}
export async function list() {
  const all = await wrap((await tx('readonly')).getAll());
  return all.sort((a, b) => b.at - a.at);
}
/** Merge fields into a stored snap (favourite, caption). */
export async function patch(id, fields) {
  const store = await tx('readwrite');
  const rec = await wrap(store.get(id)); if (!rec) return null;
  Object.assign(rec, fields); await wrap(store.put(rec)); return rec;
}
export async function remove(id) { await wrap((await tx('readwrite')).delete(id)); }
export async function count() { return wrap((await tx('readonly')).count()); }
export async function clearAll() { await wrap((await tx('readwrite')).clear()); }

const urls = new Map();
export function urlFor(rec) {
  if (!urls.has(rec.id)) urls.set(rec.id, URL.createObjectURL(rec.blob));
  return urls.get(rec.id);
}
