import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diff, latestState, run, ascToken } from '../src/index.js';

const kv = (init = {}) => { const m = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return { m, get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), put: async (k, v) => { m.set(k, v); } }; };

async function env(store, apps = [{ name: 'TUITEA', bundleId: 'com.keepitil.thrive' }]) {
  const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const der = Buffer.from(await crypto.subtle.exportKey('pkcs8', k.privateKey)).toString('base64');
  return { pub: k.publicKey, ASC_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\n' + der + '\n-----END PRIVATE KEY-----', ASC_KEY_ID: 'KID', ASC_ISSUER_ID: 'ISS',
    APPS: JSON.stringify(apps), DOORBELL_KV: store, NEXUS_URL: 'https://nexus.test', NEXUS_ANON_KEY: 'anon', POSTER_EMAIL: 'p@x', POSTER_PASSWORD: 'pw', CREW_ROOM_ID: 'room-1' };
}

// Mock ASC + NEXUS. states: bundleId -> [{version,state,createdDate}]
function mockFetch(states, { postStatus = 201 } = {}) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url, init });
    const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s });
    let m;
    if ((m = url.match(/\/v1\/apps\?filter\[bundleId\]=([^&]+)/))) { const b = decodeURIComponent(m[1]); return json({ data: states[b] ? [{ id: 'id-' + b, attributes: { bundleId: b } }] : [] }); }
    if ((m = url.match(/\/v1\/apps\/id-([^/]+)\/appStoreVersions/))) return json({ data: states[m[1]].map(a => ({ attributes: { versionString: a.version, appStoreState: a.state, createdDate: a.createdDate } })) });
    if (url.includes('/auth/v1/token')) return json({ access_token: 'poster-jwt' });
    if (url.includes('/rest/v1/crew_messages')) return new Response('', { status: postStatus });
    throw new Error('unexpected ' + url);
  };
  f.calls = calls; return f;
}
const posts = f => f.calls.filter(c => c.url.includes('crew_messages'));

test('diff: first sighting is silent, same state is silent, change is announced', () => {
  assert.equal(diff('K', null, { version: '1.0', state: 'WAITING_FOR_REVIEW' }), null);
  assert.equal(diff('K', { version: '1.0', state: 'IN_REVIEW' }, { version: '1.0', state: 'IN_REVIEW' }), null);
  assert.equal(diff('K', { version: '1.0', state: 'WAITING_FOR_REVIEW' }, { version: '1.0', state: 'IN_REVIEW' }), '🔔 K v1.0: Waiting for Review → In Review');
  assert.equal(diff('K', { version: '1.0', state: 'READY_FOR_DISTRIBUTION' }, { version: '1.1', state: 'WAITING_FOR_REVIEW' }), '🔔 K v1.1: Ready for Distribution (live) (v1.0) → Waiting for Review');
});

test('latestState picks the newest version by createdDate', async () => {
  const f = mockFetch({ b: [{ version: '1.0', state: 'READY_FOR_DISTRIBUTION', createdDate: '2026-01-01' }, { version: '1.1', state: 'IN_REVIEW', createdDate: '2026-10-01' }] });
  assert.deepEqual(await latestState('b', 't', f), { version: '1.1', state: 'IN_REVIEW' });
  assert.equal(await latestState('missing', 't', f), null);
});

test('run: no prior state → stores, does not post', async () => {
  const store = kv(); const e = await env(store);
  const f = mockFetch({ 'com.keepitil.thrive': [{ version: '2.0.1', state: 'WAITING_FOR_REVIEW', createdDate: 'x' }] });
  const r = await run(e, f);
  assert.equal(posts(f).length, 0); assert.deepEqual(r.posted, []);
  assert.deepEqual(await store.get('state:com.keepitil.thrive'), { version: '2.0.1', state: 'WAITING_FOR_REVIEW' });
});

test('run: unchanged → no post; changed → one post with all changes, then stored', async () => {
  const apps = [{ name: 'TUITEA', bundleId: 't' }, { name: 'KMOB', bundleId: 'k' }, { name: 'KEEPITIL', bundleId: 'a' }];
  const store = kv({ 'state:t': { version: '2', state: 'WAITING_FOR_REVIEW' }, 'state:k': { version: '1', state: 'IN_REVIEW' }, 'state:a': { version: '1', state: 'IN_REVIEW' } });
  const e = await env(store, apps);
  const f = mockFetch({ t: [{ version: '2', state: 'IN_REVIEW', createdDate: 'x' }], k: [{ version: '1', state: 'REJECTED', createdDate: 'x' }], a: [{ version: '1', state: 'IN_REVIEW', createdDate: 'x' }] });
  const r = await run(e, f);
  assert.equal(posts(f).length, 1);
  const body = JSON.parse(posts(f)[0].init.body);
  assert.equal(body.room_id, 'room-1'); assert.equal(body.kind, 'message');
  assert.equal(body.content, '🔔 TUITEA v2: Waiting for Review → In Review\n🔔 KMOB v1: In Review → Rejected');
  assert.equal(posts(f)[0].init.headers.Authorization, 'Bearer poster-jwt');
  assert.deepEqual(await store.get('state:k'), { version: '1', state: 'REJECTED' });
  // second run, same states: silent
  const f2 = mockFetch({ t: [{ version: '2', state: 'IN_REVIEW', createdDate: 'x' }], k: [{ version: '1', state: 'REJECTED', createdDate: 'x' }], a: [{ version: '1', state: 'IN_REVIEW', createdDate: 'x' }] });
  await run(e, f2); assert.equal(posts(f2).length, 0);
  assert.equal(r.posted.length, 2);
});

test('run: failed post keeps old state so the change is retried next hour', async () => {
  const store = kv({ 'state:t': { version: '2', state: 'IN_REVIEW' } });
  const e = await env(store, [{ name: 'TUITEA', bundleId: 't' }]);
  const f = mockFetch({ t: [{ version: '2', state: 'PENDING_DEVELOPER_RELEASE', createdDate: 'x' }] }, { postStatus: 500 });
  await assert.rejects(run(e, f), /crew post 500/);
  assert.deepEqual(await store.get('state:t'), { version: '2', state: 'IN_REVIEW' });
});

test('run: an ASC error for one app does not stop the others', async () => {
  const store = kv({ 'state:k': { version: '1', state: 'IN_REVIEW' } });
  const e = await env(store, [{ name: 'GONE', bundleId: 'g' }, { name: 'KMOB', bundleId: 'k' }]);
  const base = mockFetch({ k: [{ version: '1', state: 'PENDING_DEVELOPER_RELEASE', createdDate: 'x' }] });
  const f = async (u, i) => (u.includes('id-g') || u.includes('bundleId]=g') ? new Response('', { status: 401 }) : base(u, i));
  f.calls = base.calls;
  const r = await run(e, f);
  assert.equal(r.errors.length, 1); assert.match(r.errors[0], /GONE: ASC 401/);
  assert.equal(posts(base).length, 1);
});

test('ascToken: valid ES256 JWT with ASC claims', async () => {
  const e = await env(kv());
  const t = await ascToken(e, 1000);
  const [h, b, s] = t.split('.');
  const dec = x => JSON.parse(Buffer.from(x, 'base64url').toString());
  assert.deepEqual(dec(h), { alg: 'ES256', kid: 'KID', typ: 'JWT' });
  assert.deepEqual(dec(b), { iss: 'ISS', iat: 1000, exp: 1900, aud: 'appstoreconnect-v1' });
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, e.pub, Buffer.from(s, 'base64url'), new TextEncoder().encode(h + '.' + b));
  assert.equal(ok, true);
});
