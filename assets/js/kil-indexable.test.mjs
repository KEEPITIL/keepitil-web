// The event, show and member pages must stay indexable in the RAW HTML (as on main), while a private / unavailable profile
// or event still goes noindex at RUNTIME (kil-share.applyPreview(document, null)). profile.html (the owner's dashboard) stays noindex.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = (f) => readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const src = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8');

// ---- raw HTML ----
function assertRawIndexable(html, file) {
  const tags = html.match(/<meta\s+name="robots"[^>]*>/gi) || [];
  assert.equal(tags.length, 1, file + ': exactly one robots meta');
  assert.match(tags[0], /content="index,follow"/, file + ': raw robots is index,follow (as on origin/main)');
  assert.equal(/noindex|nofollow/i.test(tags[0]), false, file);
}
test('event.html, show.html and member.html are indexable in the raw HTML', () => {
  for (const f of ['event.html', 'show.html', 'member.html']) assertRawIndexable(read(f), f);
});
test('event.html keeps its runtime canonical (no static canonical, as on main) and the share-card scripts', () => {
  const h = read('event.html');
  assert.equal(/<link[^>]+rel="canonical"/i.test(h), false);
  assert.match(h, /cl\.rel='canonical'/);
  assert.match(h, /cl\.id='m-canon'/);
  assert.match(h, /function canonFor\(/);
  assert.match(h, /kil-share\.js\?v=20261107a/);
});
test('profile.html (the owner dashboard) stays noindex in the raw HTML', () => {
  assert.match(read('profile.html'), /<meta name="robots" content="noindex">/);
});
test('CONTROL: the assertion rejects the noindex the stack used to ship', () => {
  for (const f of ['event.html', 'show.html', 'member.html']) {
    const bad = read(f).replace(/(<meta name="robots" content=")index,follow("\s*\/?>)/, '$1noindex$2');
    assert.notEqual(bad, read(f));
    assert.throws(() => assertRawIndexable(bad, f), undefined, f);
  }
});

// ---- runtime (kil-share.js, kil-member.js, kil-show.js executed in a vm with a tiny fake document) ----
function fakeDoc(robots) {
  const metas = []; const mk = (attr, key, content) => { const el = { attrs: { [attr]: key, content }, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }, parentNode: { removeChild(x) { const i = metas.indexOf(x); if (i >= 0) metas.splice(i, 1); } } }; metas.push(el); return el; };
  const find = (sel) => { const m = sel.match(/meta\[(\w+)="([^"]+)"\]/); return m ? metas.find((e) => e.attrs[m[1]] === m[2]) || null : null; };
  mk('name', 'robots', robots);
  const doc = { title: '', head: { querySelector: find, appendChild(e) { metas.push(e); } }, documentElement: { appendChild(e) { metas.push(e); } }, querySelector: find,
    createElement() { return { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }, parentNode: null }; }, robots: () => find('meta[name="robots"]').attrs.content };
  return doc;
}
function sandbox(shareSource) {
  const doc = fakeDoc('index,follow');
  const ctx = { document: doc, URL, console, navigator: {} }; ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(shareSource || src('kil-share.js'), ctx); vm.runInContext(src('kil-member.js'), ctx); vm.runInContext(src('kil-show.js'), ctx);
  return { ctx, doc };
}
const root = () => ({ innerHTML: '', querySelectorAll: () => [] });
const chain = () => new Proxy({}, { get: (t, p) => (p === 'then' ? (res) => res({ data: [], error: null }) : () => chain()) });
function client(map) { return { rpc: async (n) => (n in map ? { data: map[n], error: null } : { data: null, error: null }), from: () => chain(), auth: { getSession: async () => ({ data: { session: null } }) } }; }
const PUBLIC_ROW = { slug: 'ada', display_name: 'Ada', handle: 'ada', status: 'published', admin_approved: true, profile_public: true, public_fields: ['display_name'], is_minor: false, under_18: false, age_verified: true, account_type: 'subscriber_profile' };
const EVENT_ROW = { id: 1, slug: 'a-night', title: 'A Night', status: 'published', city: 'LA', venue: 'Room', starts_at: '2099-01-01T04:00:00Z', owner_handle: null };

async function memberRobots(row, shareSource) { const { ctx, doc } = sandbox(shareSource); await ctx.KilMember.mount(root(), client({ get_public_profile: row ? [row] : [] }), { slug: 'ada' }); return doc.robots(); }
async function showRobots(map, shareSource) { const { ctx, doc } = sandbox(shareSource); await ctx.KilShow.mount(root(), client(map), { slug: 'a-night' }); return doc.robots(); }

test('member: a public profile flips to index, follow; a private / missing / not-shareable profile goes noindex at runtime', async () => {
  assert.equal(await memberRobots(PUBLIC_ROW), 'index, follow');
  assert.equal(await memberRobots(null), 'noindex, nofollow');
  assert.equal(await memberRobots(Object.assign({}, PUBLIC_ROW, { profile_public: false })), 'noindex, nofollow');
  assert.equal(await memberRobots(Object.assign({}, PUBLIC_ROW, { is_minor: true, under_18: true })), 'noindex, nofollow');
});
test('show: a published event is index, follow; a missing, password-protected or draft event goes noindex at runtime', async () => {
  const live = { event_requires_password: false, get_event_view: [EVENT_ROW], get_event_lineup: [] };
  assert.equal(await showRobots(live), 'index, follow');
  assert.equal(await showRobots({ event_requires_password: false, get_event_view: [] }), 'noindex, nofollow');
  assert.equal(await showRobots({ event_requires_password: true }), 'noindex, nofollow');
  assert.equal(await showRobots({ event_requires_password: false, get_event_view: [Object.assign({}, EVENT_ROW, { status: 'draft' })], get_event_lineup: [] }), 'noindex, nofollow');
});
test('CONTROL: if the runtime private path stopped setting noindex (applyPreview always index), the checks above would fail', async () => {
  const broken = src('kil-share.js').replace("robots: 'noindex, nofollow'", "robots: 'index, follow'");
  assert.notEqual(broken, src('kil-share.js'));
  assert.equal(await memberRobots(null, broken), 'index, follow');   // the bug: a private profile would be indexable
  await assert.rejects(async () => assert.equal(await memberRobots(null, broken), 'noindex, nofollow'));
  await assert.rejects(async () => assert.equal(await showRobots({ event_requires_password: true }, broken), 'noindex, nofollow'));
});
