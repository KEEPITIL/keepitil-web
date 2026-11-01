// Tab stubs (/app/tuitea/tupu/ and the others) forward to the app.
// The allowlist is the same set as draft #39 (tuiteaRedirectTarget).
// #39 lands first; this file must not grow a different set of keys.
// On top of that set: token_hash and code must be safe token characters,
// type must be a known value, and each key is kept once.
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
const TYPES = {
  signup: 1,
  email: 1,
  email_change: 1,
  invite: 1,
  recovery: 1,
  magiclink: 1,
};

function decoded(val) {
  try { return decodeURIComponent(String(val).replace(/\+/g, ' ')); }
  catch { return null; }
}

function safeSecret(val) {
  const text = decoded(val);
  return text != null && text.length > 0 && text.length <= 2048 && /^[A-Za-z0-9._~+\-=]+$/.test(text);
}

export function tuiteaTabTarget(tab, search, hash) {
  if (typeof search !== 'string' || search.charAt(0) !== '?') search = '';
  if (typeof hash !== 'string' || hash.charAt(0) !== '#') hash = '';
  const parts = search.length > 1 ? search.slice(1).split('&') : [];
  const kept = [];
  const seen = Object.create(null);
  for (const part of parts) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const key = eq === -1 ? part : part.slice(0, eq);
    const val = eq === -1 ? '' : part.slice(eq + 1);
    if (seen[key]) continue;
    if (key === 'invite') {
      const text = decoded(val);
      const invite = text == null ? '' : String(text).toLowerCase();
      if (/^[0-9a-f]{32}$/.test(invite)) {
        seen[key] = 1;
        kept.push('invite=' + invite);
      }
      continue;
    }
    if (key === 'token_hash' || key === 'code') {
      seen[key] = 1;
      if (safeSecret(val)) kept.push(part);
      continue;
    }
    if (key === 'type') {
      seen[key] = 1;
      const text = decoded(val);
      if (text != null && TYPES[String(text).toLowerCase()]) kept.push(part);
      continue;
    }
    if (ALLOW[key]) {
      seen[key] = 1;
      kept.push(part);
      continue;
    }
    if (/^utm_[A-Za-z0-9_]+$/.test(key)) {
      const text = decoded(val);
      if (text && text.length <= 200 && !/[\/\\:@?#%]/.test(text)) {
        seen[key] = 1;
        kept.push(part);
      }
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
