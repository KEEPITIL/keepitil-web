/* KBeats backend client. One door: the kbeats-api edge function. Auth is the shared KEEPITIL
   Supabase session (same origin as keepitil.com, so a KEEPITIL login is a KBeats login). Players who
   have not signed in get a Supabase *anonymous* account — a real server-side user whose scores,
   favorites and calibration persist, and which upgrades in place when they add email/Google.
   No call in this file is ever made during active gameplay (see app.js). */
const PROD_URL = 'https://ovmqtzjfpzrbzrlkxwgw.supabase.co';
const PROD_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ';
/* Private preview (/kbeats-preview/): a SEPARATE Supabase project (its own database, logins and storage), named
   in /games/kbeats-preview/preview-config.js. Every call goes there, with the tester's invite code, which that
   server checks. Only song audio comes from production's public, read-only audio_url (no login, no writes). */
/* Fails CLOSED: under /kbeats-preview/ a missing, malformed or production config never falls back to production.
   Every call then throws before any network request and the page shows a configuration error instead. */
export const PREVIEW_PATH = /\/kbeats-preview\//.test(globalThis.location?.pathname || '');
export function previewConfig(cfg) {
  const ok = cfg && typeof cfg === 'object' && typeof cfg.url === 'string' && typeof cfg.anon === 'string' && cfg.anon.length > 20
    && /^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(cfg.url) && cfg.url !== PROD_URL;
  return ok ? { url: cfg.url, anon: cfg.anon } : null;
}
const PV = PREVIEW_PATH ? previewConfig(globalThis.KB_PREVIEW_CFG) : null;
export const PREVIEW_BACKEND = PREVIEW_PATH;
export const PREVIEW_CONFIG_ERROR = PREVIEW_PATH && !PV;
const BLOCKED = () => { globalThis.dispatchEvent?.(new Event('kb-preview-config-error')); return Object.assign(new Error('preview is not configured'), { status: 0, previewConfig: true }); };
export const SUPA_URL = PREVIEW_PATH ? (PV ? PV.url : '') : PROD_URL;
export const SUPA_ANON = PREVIEW_PATH ? (PV ? PV.anon : '') : PROD_ANON;
const FN = SUPA_URL + (PREVIEW_PATH ? '/functions/v1/kbeats-api-staging' : '/functions/v1/kbeats-api');
export const STAGING_FN = SUPA_URL + '/functions/v1/kbeats-api-staging';
const INVITE_KEY = 'kb.preview.invite';
export const previewInvite = () => { try { return localStorage.getItem(INVITE_KEY) || ''; } catch { return ''; } };
export const setPreviewInvite = v => { try { v ? localStorage.setItem(INVITE_KEY, v) : localStorage.removeItem(INVITE_KEY); } catch {} };

let sbPromise = null;
export function supabase() {
  if (sbPromise) return sbPromise;
  if (PREVIEW_CONFIG_ERROR) return (sbPromise = Promise.reject(BLOCKED()));
  sbPromise = new Promise((res, rej) => {
    if (window.supabase?.createClient) return res(window.supabase.createClient(SUPA_URL, SUPA_ANON));
    const s = document.createElement('script'); s.src = '/games/kbeats-preview/vendor/supabase-js.min.js';
    s.onload = () => window.supabase?.createClient ? res(window.supabase.createClient(SUPA_URL, SUPA_ANON)) : rej(new Error('supabase-js missing'));
    s.onerror = () => rej(new Error('could not load supabase-js'));
    document.head.appendChild(s);
  });
  return sbPromise;
}

export async function session({ guest = true } = {}) {
  const sb = await supabase();
  let { data } = await sb.auth.getSession();
  if (!data.session && guest) {
    const r = await sb.auth.signInAnonymously();
    if (r.error) throw r.error;
    data = { session: r.data.session };
  }
  return data.session;
}

export async function call(op, body = {}, { auth = true, timeoutMs = 20000, staging = false } = {}) {
  if (PREVIEW_CONFIG_ERROR) throw BLOCKED();
  let token = SUPA_ANON;
  if (auth) { const s = await session(); if (s) token = s.access_token; }
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(staging ? STAGING_FN : FN, { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', apikey: SUPA_ANON, Authorization: 'Bearer ' + token }, body: JSON.stringify({ op, ...body, ...(PREVIEW_PATH ? { invite: previewInvite() } : {}) }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || `HTTP ${r.status}`); e.status = r.status; if (PREVIEW_PATH && j.error === 'invite required') globalThis.dispatchEvent?.(new Event('kb-invite-required')); throw e; }
    return j;
  } finally { clearTimeout(tm); }
}

/* Email magic-link / password + Google. A guest who signs in hands its token to migrate_guest so
   progress follows them; if they *upgrade* (link email to the anonymous user) the id never changes. */
export async function signInEmail(email, password) {
  const sb = await supabase();
  const before = (await sb.auth.getSession()).data.session;
  const guestToken = before?.user?.is_anonymous ? before.access_token : null;
  const r = password ? await sb.auth.signInWithPassword({ email, password }) : await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href } });
  if (r.error) throw r.error;
  if (guestToken && r.data?.session) await call('migrate_guest', { guestToken }).catch(() => {});
  if (guestToken && !r.data?.session) try { sessionStorage.setItem('kb.guestToken', guestToken); } catch {}
  return r.data;
}
export async function signUpEmail(email, password) {
  const sb = await supabase();
  const s = (await sb.auth.getSession()).data.session;
  if (s?.user?.is_anonymous) { const r = await sb.auth.updateUser({ email, password }); if (r.error) throw r.error; return { upgraded: true }; }
  const r = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.href } }); if (r.error) throw r.error; return r.data;
}
export async function signInGoogle() {
  const sb = await supabase();
  const s = (await sb.auth.getSession()).data.session;
  if (s?.user?.is_anonymous) try { sessionStorage.setItem('kb.guestToken', s.access_token); } catch {}
  const r = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href } }); if (r.error) throw r.error;
}
export async function finishPendingMigration() {
  let g = null; try { g = sessionStorage.getItem('kb.guestToken'); } catch {}
  if (!g) return null;
  const s = await session({ guest: false });
  if (!s || s.user.is_anonymous) return null;
  try { sessionStorage.removeItem('kb.guestToken'); } catch {}
  return call('migrate_guest', { guestToken: g }).catch(() => null);
}
export async function signOut() { const sb = await supabase(); await sb.auth.signOut(); }
export async function uploadSigned(bucket, path, token, file) {
  const sb = await supabase();
  const r = await sb.storage.from(bucket).uploadToSignedUrl(path, token, file, { contentType: file.type || 'application/octet-stream', upsert: true });
  if (r.error) throw r.error;
  return r.data;
}

/* Preview only: song audio straight from production's public read-only op (no login, so no account is created there). */
export async function prodAudioUrl(track) {
  if (PREVIEW_CONFIG_ERROR) throw BLOCKED();
  const r = await fetch(PROD_URL + '/functions/v1/kbeats-api', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: PROD_ANON, Authorization: 'Bearer ' + PROD_ANON }, body: JSON.stringify({ op: 'audio_url', track }) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); return j;
}
