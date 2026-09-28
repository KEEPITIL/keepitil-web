/* VERSION + UPDATE CHECK
   ---------------------------------------------------------------------------
   The installed version/build ALWAYS comes from the native bundle (PokaNative.appInfo);
   nothing here hard-codes a version. The update check reads a small KEEPITIL-controlled
   manifest and, if newer, sends the player to Apple's official update path (App Store,
   or TestFlight for beta builds). PokaSnap never downloads or replaces its own code.
   Checks: when Settings opens and when the player taps Check for Updates. No polling.
   A missing/slow/malformed manifest never blocks play and never claims "outdated".
   `minimumSupportedVersion` is read but NOT enforced (forced updates need owner approval). */

import { isNative } from './native.js';

export const MANIFEST_URL = 'https://keepitil.com/games/pokasnap/version.json';
const call = (m, o = {}) => window.Capacitor.nativePromise('PokaNative', m, o);

let infoCache = null;
/** { version, build, channel: 'appstore'|'testflight'|'development'|'web', source: 'native'|'web', qa } */
export async function appInfo() {
  if (infoCache) return infoCache;
  if (isNative && typeof window.Capacitor?.nativePromise === 'function') {
    try { const r = await call('appInfo'); if (r?.version) return (infoCache = { version: String(r.version), build: String(r.build), channel: r.channel || 'appstore', source: 'native', qa: !!r.qa, qaPlan: r.qaPlan || '' }); } catch (e) {}
  }
  // Web play has no bundle; say so rather than inventing a build number.
  return (infoCache = { version: 'web', build: '', channel: 'web', source: 'web', qa: false });
}
export const displayVersion = i => i.source === 'native' ? `Version ${i.version} (${i.build})` : 'Web version';

/* ---------------------------------------------------------------- pure comparison (tested) -- */
const parts = v => (/^\d+(\.\d+){0,3}$/.test(String(v || '')) ? String(v).split('.').map(Number) : null);
/** -1 / 0 / 1, or null when either version is not a valid dotted number. */
export function compareVersions(a, b) {
  const x = parts(a), y = parts(b); if (!x || !y) return null;
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; }
  return 0;
}
export function validManifest(m) {
  return !!m && typeof m === 'object' && parts(m.latestVersion) !== null && Number.isInteger(+m.latestBuild) && +m.latestBuild > 0;
}
/** state: 'current' | 'update' | 'unavailable'. Never 'update' unless the manifest is valid AND strictly newer. */
export function evaluate(installed, manifest) {
  if (!installed || installed.source !== 'native') return { state: 'unavailable', reason: 'no-bundle' };
  if (!validManifest(manifest)) return { state: 'unavailable', reason: 'manifest' };
  const cv = compareVersions(installed.version, manifest.latestVersion);
  if (cv === null) return { state: 'unavailable', reason: 'version' };
  const newer = cv < 0 || (cv === 0 && +installed.build < +manifest.latestBuild);
  if (!newer) return { state: 'current' };
  const url = installed.channel === 'testflight' ? (manifest.testFlightURL || 'itms-beta://') : (manifest.appStoreURL || null);
  return { state: 'update', latestVersion: manifest.latestVersion, latestBuild: +manifest.latestBuild, releaseNotes: typeof manifest.releaseNotes === 'string' ? manifest.releaseNotes.slice(0, 280) : '',
    url, urlKind: installed.channel === 'testflight' ? 'testflight' : 'appstore' };
}

/* ---------------------------------------------------------------- network (bounded) -- */
export async function fetchManifest({ url = (typeof window !== 'undefined' && window.__pokaQA?.manifestUrl) || MANIFEST_URL, timeoutMs = 6000, fetcher = fetch } = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, reason: 'offline' };
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = setTimeout(() => ctl?.abort(), timeoutMs);
  try {
    const r = await fetcher(url.startsWith('data:') ? url : `${url}?t=${Date.now()}`, { cache: 'no-store', signal: ctl?.signal });
    if (!r.ok) return { ok: false, reason: 'http' };
    const m = await r.json();
    return validManifest(m) ? { ok: true, manifest: m } : { ok: false, reason: 'malformed' };
  } catch (e) { return { ok: false, reason: e?.name === 'AbortError' ? 'timeout' : 'network' }; }
  finally { clearTimeout(t); }
}
let lastCheck = null;
export async function checkForUpdate(opts = {}) {
  const info = await appInfo();
  const f = await fetchManifest(opts);
  lastCheck = f.ok ? { info, ...evaluate(info, f.manifest), at: Date.now() } : { info, state: 'unavailable', reason: f.reason, at: Date.now() };
  return lastCheck;
}
export const lastUpdateCheck = () => lastCheck;
export async function openUpdate(url) {
  if (!url) return { ok: false };
  if (isNative && typeof window.Capacitor?.nativePromise === 'function') { try { return { ok: !!(await call('openExternal', { url })).opened }; } catch (e) { return { ok: false }; } }
  window.open(url, '_blank', 'noopener'); return { ok: true };
}
