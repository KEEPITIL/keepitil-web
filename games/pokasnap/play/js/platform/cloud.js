/* CLOUD — bounded, deliberate backup of progress and selected memories.
   ---------------------------------------------------------------------------
   Local-first: the full-resolution photo stays in IndexedDB (game/album.js).
   The cloud gets (a) the progress record and (b) a compressed ~1080 copy of
   the photos the player chooses (Favorites, or "Back up" on a photo), within
   the plan's quota (economy.CLOUD). Progression never depends on a media row.

   Storage abstraction -- the game only calls these:
     saveLocalPhoto  (album.add)         uploadCloudCopy(snap)   deleteCloudCopy(id)
     getCloudPhoto(id) -> Blob           getThumbnail(id)        getCloudUsage()
     restoreCloudLibrary()               backupProgress()        restoreProgress()
   Provider today: Supabase Storage bucket 'pokasnap-memories' + table
   pokasnap_memories on the KEEPITIL project. Media objects are addressed by
   <user_id>/<memory_id>.jpg so they can move to R2/S3 later by changing only
   this file. Signed-in state comes from the SESSION only. */

import { client, session } from './auth.js';
import { CLOUD } from '../data/economy.js';
import { get, update, adopt } from '../game/state.js';
import { plusSubscribed } from '../game/entitlements.js';
import * as album from '../game/album.js';

const BUCKET = 'pokasnap-memories';
export const quota = st => plusSubscribed(st) ? CLOUD.quota.plus : CLOUD.quota.free;
export const autoBackup = st => st.cloud.autoBackup ?? (plusSubscribed(st) ? CLOUD.autoBackupFavorites.plus : CLOUD.autoBackupFavorites.free);

async function user() { const s = await session(); return s ? s.user : null; }

/* ---- compressed copy: ~1080 on the long edge, JPEG q0.82, target 300-750 KB ---- */
export async function makeCloudCopy(blob) {
  const img = await createImageBitmap(blob);
  const k = Math.min(1, CLOUD.copy.maxEdge / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  let q = CLOUD.copy.quality, out = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
  while (out.size > CLOUD.copy.targetKB[1] * 1024 && q > 0.5) { q -= 0.08; out = await new Promise(r => c.toBlob(r, 'image/jpeg', q)); }
  return { blob: out, width: c.width, height: c.height };
}

export async function getCloudUsage() {
  const u = await user(); if (!u) return { signedIn: false, used: 0, quota: quota(get()) };
  const sb = await client();
  const { count } = await sb.from('pokasnap_memories').select('id', { count: 'exact', head: true }).eq('user_id', u.id);
  return { signedIn: true, used: count || 0, quota: quota(get()) };
}

/** Upload a compressed copy of an album snap. Resolves { ok, reason? }. */
export async function uploadCloudCopy(snap) {
  const u = await user(); if (!u) return { ok: false, reason: 'signin' };
  const st = get();
  if (st.cloud.memories[snap.id]) return { ok: true, already: true };
  const usage = await getCloudUsage();
  if (usage.used >= usage.quota) return { ok: false, reason: 'quota', usage };
  const sb = await client();
  const copy = await makeCloudCopy(snap.blob);
  const path = `${u.id}/${snap.id}.jpg`;
  const up = await sb.storage.from(BUCKET).upload(path, copy.blob, { contentType: 'image/jpeg', upsert: true });
  if (up.error) return { ok: false, reason: 'upload', error: up.error.message };
  const row = { id: snap.id, user_id: u.id, mission_id: snap.missionID, mission_title: snap.missionTitle, score: snap.score, pose_id: snap.poseId || null,
    taken_at: new Date(snap.at).toISOString(), favorite: !!snap.fav, caption: snap.caption || null, path, bytes: copy.blob.size, width: copy.width, height: copy.height };
  const ins = await sb.from('pokasnap_memories').upsert(row);
  if (ins.error) { await sb.storage.from(BUCKET).remove([path]); return { ok: false, reason: ins.error.message.includes('ceiling') ? 'quota' : 'db', error: ins.error.message }; }
  update(s => { s.cloud.memories[snap.id] = path; s.cloud.lastBackupAt = Date.now(); });
  return { ok: true, bytes: copy.blob.size };
}
export async function deleteCloudCopy(id) {
  const u = await user(); if (!u) return { ok: false, reason: 'signin' };
  const sb = await client(), path = get().cloud.memories[id] || `${u.id}/${id}.jpg`;
  await sb.storage.from(BUCKET).remove([path]);
  await sb.from('pokasnap_memories').delete().eq('user_id', u.id).eq('id', id);
  update(s => { delete s.cloud.memories[id]; });
  return { ok: true };
}
export async function getCloudPhoto(id) {
  const u = await user(); if (!u) return null;
  const sb = await client(), path = get().cloud.memories[id] || `${u.id}/${id}.jpg`;
  const { data, error } = await sb.storage.from(BUCKET).download(path);
  return error ? null : data;
}
export async function getThumbnail(id) {
  const u = await user(); if (!u) return null;
  const sb = await client(), path = get().cloud.memories[id] || `${u.id}/${id}.jpg`;
  const { data } = await sb.storage.from(BUCKET).createSignedUrl(path, 600, { transform: { width: 300, height: 400, resize: 'cover' } });
  return data?.signedUrl || null;
}
/** Bring cloud memories back into the local album (skips ones already present). */
export async function restoreCloudLibrary() {
  const u = await user(); if (!u) return { ok: false, reason: 'signin' };
  const sb = await client();
  const { data: rows, error } = await sb.from('pokasnap_memories').select('*').eq('user_id', u.id).order('created_at', { ascending: false });
  if (error) return { ok: false, reason: 'db', error: error.message };
  const local = new Set((await album.list()).map(s => s.id));
  let restored = 0;
  for (const r of rows) {
    if (local.has(r.id)) continue;
    const { data: blob } = await sb.storage.from(BUCKET).download(r.path);
    if (!blob) continue;
    await album.put({ id: r.id, at: +new Date(r.taken_at || r.created_at), blob, petName: get().pet?.name || '', missionID: r.mission_id, missionTitle: r.mission_title, score: r.score, poseId: r.pose_id, caption: r.caption, fav: r.favorite, cloudCopy: true });
    update(s => { s.cloud.memories[r.id] = r.path; });
    restored++;
  }
  return { ok: true, restored, total: rows.length };
}

/* ---- progress backup (the same record the device uses; local stays authoritative) ---- */
export async function backupProgress() {
  const u = await user(); if (!u) return { ok: false, reason: 'signin' };
  const st = get(), sb = await client();
  const { error } = await sb.from('pokasnap_saves').upsert({ user_id: u.id, payload: st, schema_version: st.schema, app_version: window.POKASNAP_VERSION || '', device_updated_at: new Date(st.updatedAt).toISOString(), updated_at: new Date().toISOString() });
  if (error) return { ok: false, reason: 'db', error: error.message };
  update(s => { s.cloud.lastBackupAt = Date.now(); });
  return { ok: true };
}
/** Adopt the cloud record only if it is genuinely newer (state.adopt guards this). */
export async function restoreProgress() {
  const u = await user(); if (!u) return { ok: false, reason: 'signin' };
  const sb = await client();
  const { data, error } = await sb.from('pokasnap_saves').select('payload').eq('user_id', u.id).maybeSingle();
  if (error) return { ok: false, reason: 'db', error: error.message };
  if (!data) return { ok: true, adopted: false, none: true };
  return { ok: true, adopted: adopt(data.payload) };
}
/** Plus: automatically back up favourites that are not in the cloud yet (quota-bounded). */
export async function autoBackupFavorites() {
  const st = get(); if (!autoBackup(st)) return { ok: true, skipped: true };
  const u = await user(); if (!u) return { ok: false, reason: 'signin' };
  let n = 0;
  for (const s of (await album.list()).filter(s => s.fav && !get().cloud.memories[s.id])) { const r = await uploadCloudCopy(s); if (!r.ok) break; n++; }
  return { ok: true, uploaded: n };
}
