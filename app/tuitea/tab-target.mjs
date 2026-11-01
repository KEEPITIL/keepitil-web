// Tab stubs (/app/tuitea/tupu/ and the others) forward to the app.
// Query keys use the same allowlist as draft #39 (tuiteaRedirectTarget):
// a 32-hex invite, token_hash, type, code, error, error_code,
// error_description, and utm_* values that cannot be a redirect.
// next=, redirect=, and every other key are dropped. tab is set here,
// not taken from the query. The path is always /app/tuitea/app/.
const PATH = '/app/tuitea/app/';
const ALLOW = {
  token_hash: 1,
  type: 1,
  code: 1,
  error: 1,
  error_code: 1,
  error_description: 1,
};

export function tuiteaTabTarget(tab, search, hash) {
  if (typeof search !== 'string' || search.charAt(0) !== '?') search = '';
  if (typeof hash !== 'string' || hash.charAt(0) !== '#') hash = '';
  const parts = search.length > 1 ? search.slice(1).split('&') : [];
  const kept = [];
  let inviteKept = false;
  for (const part of parts) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const key = eq === -1 ? part : part.slice(0, eq);
    const val = eq === -1 ? '' : part.slice(eq + 1);
    if (key === 'invite') {
      if (!inviteKept) {
        let decoded = '';
        try { decoded = decodeURIComponent(val.replace(/\+/g, ' ')); }
        catch { decoded = ''; }
        decoded = String(decoded).toLowerCase();
        if (/^[0-9a-f]{32}$/.test(decoded)) {
          kept.push('invite=' + decoded);
          inviteKept = true;
        }
      }
      continue;
    }
    if (ALLOW[key]) {
      kept.push(part);
      continue;
    }
    if (/^utm_[A-Za-z0-9_]+$/.test(key)) {
      let decoded = '';
      try { decoded = decodeURIComponent(val.replace(/\+/g, ' ')); }
      catch { continue; }
      if (decoded && decoded.length <= 200 && !/[\/\\:@?#%]/.test(decoded)) kept.push(part);
    }
  }
  const tabName = /^[a-z]{1,32}$/.test(String(tab)) ? String(tab) : '';
  if (tabName) kept.push('tab=' + tabName);
  let dest = PATH;
  if (kept.length) dest += '?' + kept.join('&');
  if (hash) dest += hash;
  if (dest.slice(0, PATH.length) !== PATH) return PATH;
  const after = dest.charAt(PATH.length);
  if (after && after !== '?' && after !== '#') return PATH;
  return dest;
}
