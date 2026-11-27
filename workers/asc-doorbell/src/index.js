// ASC review doorbell: hourly, reads each app's latest App Store version state from the
// App Store Connect API, remembers it in KV, and posts to the NEXUS crew room only on a change.
// Secrets (never in the repo or logs): ASC_ISSUER_ID, ASC_KEY_ID, ASC_PRIVATE_KEY (.p8 text),
// POSTER_EMAIL, POSTER_PASSWORD, NEXUS_ANON_KEY.

const ASC = 'https://api.appstoreconnect.apple.com';

const LABELS = {
  PREPARE_FOR_SUBMISSION: 'Prepare for Submission',
  READY_FOR_REVIEW: 'Ready for Review',
  WAITING_FOR_REVIEW: 'Waiting for Review',
  IN_REVIEW: 'In Review',
  PENDING_DEVELOPER_RELEASE: 'Approved (pending developer release)',
  PENDING_APPLE_RELEASE: 'Approved (pending Apple release)',
  PROCESSING_FOR_DISTRIBUTION: 'Approved (processing for distribution)',
  READY_FOR_DISTRIBUTION: 'Ready for Distribution (live)',
  ACCEPTED: 'Approved',
  REJECTED: 'Rejected',
  METADATA_REJECTED: 'Metadata Rejected',
  DEVELOPER_REJECTED: 'Developer Rejected',
  INVALID_BINARY: 'Invalid Binary',
  REMOVED_FROM_SALE: 'Removed from Sale',
};
export const label = s => LABELS[s] || s;

function b64url(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const enc = o => b64url(new TextEncoder().encode(JSON.stringify(o)));

// ES256 JWT for App Store Connect. WebCrypto ECDSA returns raw r||s, which is what JWS wants.
export async function ascToken(env, now = Math.floor(Date.now() / 1000)) {
  const pem = env.ASC_PRIVATE_KEY.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = enc({ alg: 'ES256', kid: env.ASC_KEY_ID, typ: 'JWT' });
  const body = enc({ iss: env.ASC_ISSUER_ID, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' });
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(head + '.' + body));
  return head + '.' + body + '.' + b64url(sig);
}

async function asc(path, token, fetchImpl) {
  const r = await fetchImpl(ASC + path, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('ASC ' + r.status + ' on ' + path.split('?')[0]);
  return r.json();
}

// Latest version (newest createdDate) for one bundle id → { version, state } or null.
export async function latestState(bundleId, token, fetchImpl = fetch) {
  const apps = await asc('/v1/apps?filter[bundleId]=' + encodeURIComponent(bundleId) + '&fields[apps]=bundleId', token, fetchImpl);
  const app = (apps.data || []).find(a => a.attributes && a.attributes.bundleId === bundleId);
  if (!app) return null;
  const v = await asc('/v1/apps/' + app.id + '/appStoreVersions?limit=10&fields[appStoreVersions]=versionString,appStoreState,appVersionState,createdDate', token, fetchImpl);
  const rows = (v.data || []).slice().sort((a, b) => String(b.attributes.createdDate).localeCompare(String(a.attributes.createdDate)));
  if (!rows.length) return null;
  const a = rows[0].attributes;
  return { version: a.versionString, state: a.appStoreState || a.appVersionState };
}

// Pure change detection: what to say, or null when nothing changed.
// The first sighting of an app only records state (no post), so a fresh deploy is silent.
export function diff(name, prev, cur) {
  if (!cur) return null;
  if (!prev) return null;
  if (prev.version === cur.version && prev.state === cur.state) return null;
  const from = prev.version === cur.version ? label(prev.state) : label(prev.state) + ' (v' + prev.version + ')';
  return '🔔 ' + name + ' v' + cur.version + ': ' + from + ' → ' + label(cur.state);
}

async function posterSession(env, fetchImpl) {
  const r = await fetchImpl(env.NEXUS_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST', headers: { apikey: env.NEXUS_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.POSTER_EMAIL, password: env.POSTER_PASSWORD }),
  });
  if (!r.ok) throw new Error('poster sign-in ' + r.status);
  return (await r.json()).access_token;
}

export async function postToCrew(env, lines, fetchImpl = fetch) {
  const jwt = await posterSession(env, fetchImpl);
  const r = await fetchImpl(env.NEXUS_URL + '/rest/v1/crew_messages', {
    method: 'POST',
    headers: { apikey: env.NEXUS_ANON_KEY, Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ room_id: env.CREW_ROOM_ID, kind: 'message', content: lines.join('\n'), metadata: { source: 'asc-doorbell' } }),
  });
  if (!r.ok) throw new Error('crew post ' + r.status);
}

export async function run(env, fetchImpl = fetch) {
  const apps = JSON.parse(env.APPS || '[]').filter(a => a.bundleId);
  const token = await ascToken(env);
  const lines = [], errors = [];
  for (const a of apps) {
    try {
      const cur = await latestState(a.bundleId, token, fetchImpl);
      if (!cur) continue;
      const key = 'state:' + a.bundleId;
      const prev = await env.DOORBELL_KV.get(key, 'json');
      const msg = diff(a.name, prev, cur);
      if (msg) lines.push(msg);
      // Store only after the post succeeds (below) for changed apps, so a failed post retries next hour.
      if (!msg) await env.DOORBELL_KV.put(key, JSON.stringify(cur));
      else a._pending = { key, cur };
    } catch (e) { errors.push(a.name + ': ' + e.message); }
  }
  if (lines.length) {
    await postToCrew(env, lines, fetchImpl);
    for (const a of apps) if (a._pending) await env.DOORBELL_KV.put(a._pending.key, JSON.stringify(a._pending.cur));
  }
  if (errors.length) console.log('asc-doorbell errors: ' + errors.join('; ')); // messages only, never tokens
  return { posted: lines, errors };
}

export default {
  async scheduled(_event, env, ctx) { ctx.waitUntil(run(env)); },
};
