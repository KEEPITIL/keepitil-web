/*
 * profile.html - Edit Profile sends CHANGED, ALLOWED fields only (10B / Atlas I12).
 *
 * Defect (Atlas real-payload preflight, MF1/C5): saving the owner form without editing sent a payload that
 * changed stored content (account_type:null on the old build; on this stack badges:null, highlights:[],
 * dropped socials/links members, null->'' text, public_fields members the form has no box for). With the
 * Connect publish gate (#91) any real content change sends a published page back to review.
 *
 * Same harness as profile-f126 / profile-sinks2: the real functions are sliced out of profile.html and run in
 * a node:vm context. The form is the REAL openEditProfile() HTML, parsed by a small fake DOM, so the test
 * clicks the real Save button. PROFILE_HTML=<path> runs it against another copy (negative control).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const FILE = process.env.PROFILE_HTML || join(dir, '../../profile.html');
const SRC = readFileSync(FILE, 'utf8');

function line(startsWith) {
  const a = SRC.indexOf('\n' + startsWith);
  assert.ok(a >= 0, 'line not found: ' + startsWith);
  return SRC.slice(a + 1, SRC.indexOf('\n', a + 1));
}
function editSlice() {
  const m = SRC.indexOf('/* Edit Profile sends CHANGED');
  const a = m >= 0 ? m : SRC.indexOf('function openEditProfile(){');
  const b = SRC.indexOf('function slugify(', a);
  assert.ok(a >= 0 && b > a, 'edit-profile region not found');
  return SRC.slice(a, b);
}

/* ---- fake DOM: parses the inputs the real form renders ---- */
const unesc = (v) => v.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function attrsOf(raw) {
  const out = {};
  const re = /([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
  let m;
  while ((m = re.exec(raw))) out[m[1].toLowerCase()] = m[2] !== undefined ? unesc(m[2]) : (m[3] !== undefined ? unesc(m[3]) : true);
  return out;
}
function mkEl(a, value) {
  return {
    id: a.id || '', className: a.class || '', type: a.type || '', disabled: a.disabled === true, value: value,
    checked: false, attrs: a, files: undefined, style: {}, listeners: [], onclick: null, textContent: '',
    getAttribute(k) { return k in a ? String(a[k]) : null; }, addEventListener(t, f) { this.listeners.push({ t, f }); }, remove() {}
  };
}
function parseForm(html) {
  const els = [];
  let m;
  const ta = /<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/g;
  while ((m = ta.exec(html))) els.push(mkEl(attrsOf(m[1]), unesc(m[2])));
  const inp = /<input\b([^>]*)>/g;
  while ((m = inp.exec(html))) { const a = attrsOf(m[1]); els.push(mkEl(a, a.value === undefined || a.value === true ? '' : a.value)); }
  const btn = /<button\b([^>]*)>/g;
  while ((m = btn.exec(html))) els.push(mkEl(attrsOf(m[1]), ''));
  const sel = /<select\b([^>]*)>/g;
  while ((m = sel.exec(html))) els.push(mkEl(attrsOf(m[1]), ''));
  return els;
}

function build(stored, opts) {
  opts = opts || {};
  const writes = [];           /* every SB call, in order */
  const toasts = [];
  let formEls = [];
  const document = {
    body: { appendChild(ov) { formEls = parseForm(ov.innerHTML); document.__ov = ov; return ov; }, children: [] },
    __ov: null,
    createElement() { const o = { id: '', className: '', innerHTML: '', style: {}, addEventListener() {}, remove() {} }; return o; },
    getElementById(id) { if (id === 'kilModal') return document.__ov; return formEls.find((e) => e.id === id) || null; },
    querySelectorAll(sel) {
      const m = /^\.(\w+)(:checked)?$/.exec(sel);
      if (m) return formEls.filter((e) => e.className.split(/\s+/).includes(m[1]) && (!m[2] || e.checked));
      return [];
    },
    querySelector(sel) { return null; },
    addEventListener() {}
  };
  const chain = (table, op, payload) => {
    const rec = { table, op, payload: payload === undefined ? undefined : JSON.parse(JSON.stringify(payload)), eq: [] };
    writes.push(rec);
    const result = () => (op === 'update' ? { data: opts.updateMatches === false ? [] : [{ slug: 'x' }] } : {});
    const o = {
      eq(c, v) { rec.eq.push([c, v]); return o; }, select() { return o; },
      then(f, r) { return Promise.resolve(result()).then(f, r); }, catch(f) { return Promise.resolve(result()).catch(f); }
    };
    return o;
  };
  const SB = { from: (table) => ({
    update: (p) => chain(table, 'update', p), insert: (p) => chain(table, 'insert', p), upsert: (p) => chain(table, 'upsert', p),
    delete: () => chain(table, 'delete'), select: () => chain(table, 'select')
  }), auth: { updateUser: () => Promise.resolve({}) } };
  const ctx = vm.createContext({
    document, window: {}, console, setTimeout, Promise, encodeURIComponent, String, Object, Array, JSON, Math, RegExp, parseInt, Date, Number,
    PROFILE: JSON.parse(JSON.stringify(stored)), PROFILE_SLUG: 'novahaze', SB, SESSION: { user: { id: 'u1', email: 'o@x.test' } },
    CAN_EDIT() { return true; }, toast: (t) => toasts.push(t), closeModal() {}, applyProfile() {},
    uploadImage: (f, cb) => cb(f ? 'https://up.test/new.jpg' : null)
  });
  vm.runInContext(line('function esc(s)'), ctx);
  vm.runInContext(editSlice(), ctx, { filename: 'profile.html(edit slice)' });
  const el = (id) => { const e = document.getElementById(id); assert.ok(e, 'form control missing: ' + id); return e; };
  return {
    ctx, writes, toasts, el, formEls: () => formEls,
    open() { vm.runInContext('openEditProfile()', ctx); },
    async save() { el('epSave').onclick(); await new Promise((r) => setTimeout(r, 15)); },
    profileWrites: () => writes.filter((w) => w.table === 'profile_meta'),
    profile: () => JSON.parse(JSON.stringify(ctx.PROFILE))
  };
}

const J = (v) => JSON.stringify(v);
const STORED = {
  name: 'Nova Haze', handle: 'novahaze', location: 'Phoenix, AZ', bio: 'Line one\nLine "two" & <b>x</b>', tagline: 'Desert techno',
  pronouns: 'she/her', book_email: 'book@x.test', about: 'About text',
  links: ['https://a.test/1', 'instagram.com/nova', 'https://c.test/3', 'https://d.test/4', 'https://e.test/5', 'https://f.test/6-extra'],
  links_label: 'My links', badges: ['Founder', 'Resident', 'Custom Tag'],
  socials: { instagram: 'nova', soundcloud: '', tiktok: '', website: 'https://n.test', spotify: 'https://open.spotify.com/x', extra: { a: 1, b: [1, 2] } },
  highlights: [{ label: 'Sets', img: 'https://i.test/1.jpg', id: 7, extra: { z: [1, 2] } }],
  avatar: 'https://i.test/av.jpg', cover: 'https://i.test/cv.jpg', cover_mobile: 'https://i.test/cvm.jpg',
  account_type: 'editorial_artist', status: 'published',
  profile_public: true, public_fields: ['display_name', 'bio', 'avatar', 'socials', 'events'],
  categories: ['artist'], cat_details: { artist: { genre: 'techno' } }
};
/* Owner client write grants (APPLY-1.sql), minus the two the owner must not send (account_type, status) and slug (the .eq key). */
const ALLOWED = new Set(['display_name', 'handle', 'location', 'bio', 'about', 'links', 'links_label', 'socials', 'avatar_url', 'cover_url', 'cover_mobile_url', 'profile_public', 'public_fields', 'updated_at']);
const NEVER = ['account_type', 'status', 'sources', 'last_reviewed_at', 'admin_approved', 'age_verified', 'is_minor', 'under_18', 'slug', 'badges', 'highlights', 'tagline', 'pronouns', 'book_email'];

test('(1) NO-OP: opening and saving a published editorial_artist profile writes nothing to profile_meta', async () => {
  const t = build(STORED);
  t.open();
  await t.save();
  assert.deepEqual(t.profileWrites().map((w) => w.op + ':' + J(Object.keys(w.payload || {}))), [], 'no profile_meta write for a no-op save');
  /* and the local profile model is not mutated into something different */
  const after = t.profile();
  for (const k of ['links', 'badges', 'socials', 'highlights', 'public_fields', 'account_type', 'bio', 'about', 'profile_public']) assert.equal(J(after[k]), J(STORED[k]), 'PROFILE.' + k + ' unchanged');
});

test('(1) NO-OP with every opt-in/JSON shape: no payload key can differ from stored (belt and braces on the write log)', async () => {
  const t = build(STORED);
  t.open();
  await t.save();
  for (const w of t.profileWrites()) for (const k of Object.keys(w.payload || {})) assert.fail('unexpected write key on a no-op: ' + w.op + '.' + k);
  assert.equal(t.profileWrites().length, 0);
});

test('(1) the form shows the stored type read-only and offers no type control; no epAcct select exists', async () => {
  const t = build(STORED);
  t.open();
  const shown = t.el('epAcctShown');
  assert.equal(shown.disabled, true, 'account type display is disabled');
  assert.equal(shown.value, 'Artist');
  assert.equal(t.formEls().some((e) => e.id === 'epAcct'), false, 'no editable epAcct control');
  assert.equal(t.formEls().some((e) => e.id === 'epAcctRequest'), true, 'request control still present');
});

test('(1) live enum values display; legacy and null display honestly', () => {
  const want = { editorial_artist: 'Artist', editorial_venue: 'Venue', editorial_organizer: 'Organizer', editorial_brand: 'Brand', subscriber_profile: 'Subscriber profile', artist: 'artist', user: 'user' };
  for (const [type, label] of Object.entries(want)) {
    const t = build(Object.assign({}, STORED, { account_type: type }));
    t.open();
    assert.equal(t.el('epAcctShown').value, label, type);
    assert.equal(t.el('epAcctShown').disabled, true);
  }
  const t = build(Object.assign({}, STORED, { account_type: null }));
  t.open();
  assert.equal(t.el('epAcctShown').value, 'Not set');
});

test('(2) REAL EDIT: bio only -> update payload is {bio, updated_at}, keyed by slug, no account_type', async () => {
  const t = build(STORED);
  t.open();
  t.el('epBio').value = 'A new bio';
  await t.save();
  const w = t.profileWrites();
  assert.equal(w.length, 1);
  assert.equal(w[0].op, 'update');
  assert.deepEqual(Object.keys(w[0].payload).sort(), ['bio', 'updated_at']);
  assert.equal(w[0].payload.bio, 'A new bio');
  assert.deepEqual(w[0].eq, [['slug', 'novahaze']], 'conflict key is the slug filter');
  assert.equal(t.profile().bio, 'A new bio');
});

test('(2) REAL EDIT: change one link -> links updated, every other member (incl. non-URL slot and slot 6) preserved', async () => {
  const t = build(STORED);
  t.open();
  assert.equal(t.el('epL2').value, 'instagram.com/nova');
  t.el('epL4').value = 'https://new.test/4';
  await t.save();
  const w = t.profileWrites();
  assert.equal(w.length, 1);
  assert.deepEqual(Object.keys(w[0].payload).sort(), ['links', 'updated_at']);
  assert.equal(J(w[0].payload.links), J(['https://a.test/1', 'instagram.com/nova', 'https://c.test/3', 'https://new.test/4', 'https://e.test/5', 'https://f.test/6-extra']));
});

test('(2) REAL EDIT: clearing a link removes only that member', async () => {
  const t = build(STORED);
  t.open();
  t.el('epL3').value = '';
  await t.save();
  const w = t.profileWrites();
  assert.equal(J(w[0].payload.links), J(['https://a.test/1', 'instagram.com/nova', 'https://d.test/4', 'https://e.test/5', 'https://f.test/6-extra']));
});

test('(2) REAL EDIT: change a social -> socials updated with unedited members and extra JSON byte-identical', async () => {
  const t = build(STORED);
  t.open();
  t.el('epIG').value = 'nova2';
  await t.save();
  const w = t.profileWrites();
  assert.deepEqual(Object.keys(w[0].payload).sort(), ['socials', 'updated_at']);
  assert.equal(J(w[0].payload.socials), J(Object.assign({}, STORED.socials, { instagram: 'nova2' })));
  assert.equal(J(w[0].payload.socials.extra), J(STORED.socials.extra));
});

test('(2) public opt-in is sent only when changed; unknown public_fields members are kept', async () => {
  let t = build(STORED);
  t.open();
  t.formEls().find((e) => e.className.includes('epField') && e.value === 'handle').checked = true;
  await t.save();
  let w = t.profileWrites();
  assert.deepEqual(Object.keys(w[0].payload).sort(), ['public_fields', 'updated_at'], 'profile_public not re-sent');
  assert.equal(J(w[0].payload.public_fields), J(['avatar', 'socials', 'display_name', 'handle', 'bio', 'events']));

  t = build(STORED);
  t.open();
  t.el('epPublic').checked = false;
  await t.save();
  w = t.profileWrites();
  assert.deepEqual(Object.keys(w[0].payload).sort(), ['profile_public', 'updated_at']);
  assert.equal(w[0].payload.profile_public, false);
});

test('(2) business-type request still works: it writes profile_content, never profile_meta', async () => {
  const t = build(STORED);
  t.open();
  t.el('epAcctRequest').value = 'brand';
  await t.save();
  assert.equal(t.profileWrites().length, 0, 'request alone is a no-op for profile_meta');
  const pc = t.writes.filter((x) => x.table === 'profile_content');
  const del = pc.find((x) => x.op === 'delete' && x.eq.some((e) => e[1] === 'account_type_request'));
  const ins = pc.find((x) => x.op === 'insert' && x.payload.kind === 'account_type_request');
  assert.ok(del, 'old request cleared');
  assert.ok(ins, 'request row inserted');
  assert.equal(ins.payload.data.requested, 'brand');
  assert.equal(ins.payload.profile_slug, 'novahaze');
});

test('(3) NULL stored account_type: a no-op sends no type (and nothing else)', async () => {
  const t = build(Object.assign({}, STORED, { account_type: null }));
  t.open();
  await t.save();
  assert.equal(t.profileWrites().length, 0);
});

test('(3) sparse profile (null/empty stored values): null -> "" is not a change', async () => {
  const t = build({ name: '', handle: 'novahaze', location: null, bio: null, about: null, links: null, links_label: null, socials: null, badges: null, highlights: null, avatar: null, cover: null, profile_public: null, public_fields: null, account_type: null });
  t.open();
  await t.save();
  assert.equal(t.profileWrites().length, 0);
  const t2 = build({ name: 'N', handle: 'novahaze', location: null, bio: null, socials: null, links: null, account_type: null });
  t2.open();
  t2.el('epLoc').value = 'Tempe';
  await t2.save();
  assert.deepEqual(Object.keys(t2.profileWrites()[0].payload).sort(), ['location', 'updated_at']);
});

test('(4) the legacy 19-key payload is gone: editing every field still sends only allowed, owner-editable keys', async () => {
  const t = build(STORED);
  t.open();
  t.el('epName').value = 'N2'; t.el('epHandle').value = '@nova2'; t.el('epLoc').value = 'L2'; t.el('epBio').value = 'B2'; t.el('epAbout').value = 'A2';
  t.el('epLinksLabel').value = 'LL2'; t.el('epL1').value = 'https://z.test/1'; t.el('epIG').value = 'i2'; t.el('epSC').value = 's2'; t.el('epTT').value = 't2'; t.el('epWeb').value = 'https://w2.test';
  t.el('epAvatarUrl').value = 'https://u.test/a.jpg'; t.el('epCoverUrl').value = 'https://u.test/c.jpg'; t.el('epCoverMUrl').value = 'https://u.test/m.jpg';
  t.el('epPublic').checked = false;
  t.formEls().find((e) => e.className.includes('epField') && e.value === 'links').checked = true;
  await t.save();
  const w = t.profileWrites();
  assert.equal(w.length, 1);
  const keys = Object.keys(w[0].payload);
  for (const k of keys) assert.ok(ALLOWED.has(k), 'key not allowed: ' + k);
  for (const k of NEVER) assert.equal(keys.includes(k), false, 'never sent: ' + k);
  assert.ok(keys.length < 19, 'fewer than the legacy 19 keys (' + keys.length + ')');
  assert.equal(w[0].payload.handle, 'nova2');
});

test('(4) insert fallback (no row yet) writes slug + form values, still never account_type/status', async () => {
  const t = build(STORED, { updateMatches: false });
  t.open();
  t.el('epBio').value = 'first bio';
  await t.save();
  const w = t.profileWrites();
  assert.deepEqual(w.map((x) => x.op), ['update', 'insert']);
  const keys = Object.keys(w[1].payload);
  assert.ok(keys.includes('slug') && keys.includes('bio'));
  for (const k of ['account_type', 'status', 'sources', 'last_reviewed_at', 'admin_approved', 'age_verified', 'is_minor', 'under_18']) assert.equal(keys.includes(k), false, k);
});
