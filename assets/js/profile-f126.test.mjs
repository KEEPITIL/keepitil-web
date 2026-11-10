/*
 * profile.html — F1 (inline handlers), F2 (collection name -> innerHTML), F6 (signed-out feed drops kind=post).
 *
 * METHOD: no jsdom. The real functions are sliced out of profile.html by marker and run in a node:vm
 * context with a minimal fake DOM (innerHTML/textContent recorders, listener capture). This complements
 * kil-xss-profile.test.mjs (jsdom + KilSafeHtml, stored-HTML payloads); this file covers the render
 * functions that file does not reach. Set PROFILE_HTML=<path> to run the same tests against another
 * copy of profile.html (used for the negative control against unmodified origin/main).
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

function slice(from, to) {
  const a = SRC.indexOf(from);
  assert.ok(a >= 0, 'marker not found: ' + from);
  const b = SRC.indexOf(to, a + from.length);
  assert.ok(b > a, 'end marker not found: ' + to);
  return SRC.slice(a, b);
}
function line(startsWith) {
  const a = SRC.indexOf('\n' + startsWith);
  assert.ok(a >= 0, 'line not found: ' + startsWith);
  const b = SRC.indexOf('\n', a + 1);
  return SRC.slice(a + 1, b);
}

const HOSTILE_PID = "x');alert(1);//";
const HOSTILE_HTML = '"><img src=x onerror=alert(1)>';
const HOSTILE_NAME = '<img src=x onerror=alert(1)>';

/* ---- fake DOM ---- */
function fakeEl(tag) {
  const el = {
    tag, innerHTML: '', textContent: '', className: '', children: [], style: {}, listeners: [], onclick: null,
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    appendChild(c) { el.children.push(c); return c; },
    replaceChildren() { el.children = []; el.innerHTML = ''; },
    addEventListener(t, f, c) { el.listeners.push({ t, f, c }); },
    getBoundingClientRect() { return { bottom: 0, right: 0 }; },
    remove() {}
  };
  return el;
}

function makeCtx(globals) {
  const els = {};
  const docListeners = [];
  const document = {
    getElementById(id) { return Object.prototype.hasOwnProperty.call(els, id) ? els[id] : null; },
    createElement(t) { return fakeEl(t); },
    addEventListener(t, f, c) { docListeners.push({ t, f, c }); },
    querySelectorAll() { return []; },
    body: fakeEl('body')
  };
  const calls = [];
  const rec = (name) => function () { calls.push([name].concat(Array.prototype.slice.call(arguments))); };
  const ctx = vm.createContext(Object.assign({
    document, els, docListeners, calls, rec,
    window: { scrollY: 0 }, console, setTimeout, Promise, encodeURIComponent, String, Object, Array, JSON, Math, RegExp, parseInt,
    localStorage: { getItem() { return null; }, setItem() {} },
    KIL_SHARE_ORIGIN: 'https://k.test'
  }, globals || {}));
  return { ctx, document, els, docListeners, calls, run: (code) => vm.runInContext(code, ctx, { filename: 'profile.html(slice)' }) };
}

/* ---- tiny HTML tokenizer: tags + attributes, so "is there a live handler" is judged structurally ---- */
function unesc(v) { return v.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); }
function parseTags(html) {
  const out = [];
  const tagRe = /<([a-zA-Z][\w-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/g;
  let m;
  while ((m = tagRe.exec(html))) {
    const attrs = {};
    const aRe = /([^\s=>\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let a;
    while ((a = aRe.exec(m[2]))) attrs[a[1].toLowerCase()] = a[2] !== undefined ? a[2] : (a[3] !== undefined ? a[3] : (a[4] || ''));
    out.push({ name: m[1].toLowerCase(), attrs });
  }
  return out;
}
/* The only inline handlers the card/menu/chip markup may still carry: fixed strings with NO interpolated data. */
const STATIC_HANDLERS = new Set([
  "this.src='/assets/images/blog-default.jpg'", "this.src='/icon-192.png'",
  'try{this.play()}catch(e){}', 'this.pause()', 'fbCapToggle(this,event)', 'this.style.opacity=.2'
]);
function assertNoDataInHandlers(html, label) {
  const tags = parseTags(html);
  assert.ok(tags.length >= 2, label + ': tokenizer found markup');
  for (const t of tags) {
    for (const [k, v] of Object.entries(t.attrs)) {
      if (/^on/.test(k)) {
        assert.ok(STATIC_HANDLERS.has(unesc(v)), label + ': non-static inline handler ' + k + '="' + v + '"');
        assert.equal(/alert/.test(v), false, label + ': payload in handler');
      }
    }
    assert.equal(t.name === 'img' && t.attrs.src === 'x', false, label + ': payload became a live <img src=x>');
    assert.equal(t.name === 'script', false, label + ': script tag');
  }
  return tags;
}

/* ================= F1: post + event cards ================= */
function cardCtx() {
  const h = makeCtx({
    PROFILE_SLUG: 'x', PROFILE: { name: 'N', avatar: '/a.png' }, IS_OWNER: false, OWNS: false,
    CAN_EDIT() { return false; }, safeMedia(u) { return u; },
    fbToggleLike: null, fbReshare: null, fbSave: null, fbShare: null, postMenu: null
  });
  h.run(line('function esc(s)'));
  h.run(slice('function eventCardHtml(', 'function openPost('));
  return h;
}

test('F1: post card buttons never interpolate pid/slug into inline JS', () => {
  const { run } = cardCtx();
  const html = run('postCard(' + JSON.stringify({
    title: 't', sub: '', body: '', media: '', mtype: 'image', src: 'article', idx: 3, type: 'article',
    pid: HOSTILE_PID, collab: [HOSTILE_HTML]
  }) + ')');
  const tags = assertNoDataInHandlers(html, 'postCard');
  const acts = tags.filter((t) => t.attrs['data-kil-act']);
  assert.deepEqual(acts.map((t) => t.attrs['data-kil-act']).sort(), ['like', 'menu', 'reshare', 'save', 'share']);
  for (const t of acts.filter((x) => x.attrs['data-kil-act'] !== 'share')) assert.equal(unesc(t.attrs['data-pid']), HOSTILE_PID);
  assert.equal(unesc(acts.find((t) => t.attrs['data-kil-act'] === 'share').attrs['data-slug']), HOSTILE_HTML);
});

test('F1: event card (esc(pid) in a JS string) uses data attributes, pid built from a hostile slug', () => {
  const { run } = cardCtx();
  const html = run('postCard(' + JSON.stringify({ event: { title: HOSTILE_NAME, slug: HOSTILE_PID, venue: HOSTILE_HTML } }) + ')');
  const tags = assertNoDataInHandlers(html, 'eventCard');
  const acts = tags.filter((t) => t.attrs['data-kil-act']);
  assert.deepEqual(acts.map((t) => t.attrs['data-kil-act']).sort(), ['like', 'reshare', 'save']);
  for (const t of acts) assert.equal(unesc(t.attrs['data-pid']), 'event:' + HOSTILE_PID);
});

test('F1: one capture-phase click listener dispatches the card buttons with the exact (hostile) values', () => {
  const h = cardCtx();
  const calls = [];
  h.ctx.fbToggleLike = (p) => calls.push(['like', p]);
  h.ctx.fbReshare = (p) => calls.push(['reshare', p]);
  h.ctx.fbSave = (p, el) => calls.push(['save', p, el && el.id]);
  h.ctx.fbShare = (u) => calls.push(['share', u]);
  h.ctx.postMenu = (p, s, i, ev) => calls.push(['menu', p, s, i, typeof ev.stopPropagation, ev.currentTarget && ev.currentTarget.id]);
  const l = h.docListeners.filter((x) => x.t === 'click' && x.c === true);
  assert.equal(l.length, 1, 'exactly one capture-phase document click listener for card actions');
  const card = { cls: 'fbcard' };
  let stopped = 0;
  const fire = (act, attrs) => {
    const b = {
      id: 'btn-' + act,
      getAttribute: (k) => (k === 'data-kil-act' ? act : (attrs || {})[k] ?? null)
    };
    b.closest = (sel) => (sel === '[data-kil-act]' ? b : (sel === '.fbcard' ? card : null));
    l[0].f({ target: b, stopPropagation() { stopped++; } });
  };
  fire('like', { 'data-pid': HOSTILE_PID });
  fire('reshare', { 'data-pid': HOSTILE_PID });
  fire('save', { 'data-pid': HOSTILE_PID });
  fire('share', { 'data-slug': HOSTILE_HTML });
  fire('menu', { 'data-pid': HOSTILE_PID, 'data-src': 'article', 'data-idx': '3' });
  assert.deepEqual(calls[0], ['like', HOSTILE_PID]);
  assert.deepEqual(calls[1], ['reshare', HOSTILE_PID]);
  assert.deepEqual(calls[2], ['save', HOSTILE_PID, 'btn-save']);
  assert.deepEqual(calls[3], ['share', 'https://k.test/profile?slug=' + encodeURIComponent(HOSTILE_HTML)]);
  assert.deepEqual(calls[4], ['menu', HOSTILE_PID, 'article', 3, 'function', 'btn-menu']);
  assert.equal(stopped, 5, 'old per-button stopPropagation preserved');
  /* a click that is not on a card action is ignored */
  const before = calls.length;
  l[0].f({ target: { closest: () => null }, stopPropagation() { stopped++; } });
  assert.equal(calls.length, before);
});

test('F1: per-post menu (owner and visitor) carries no data in inline JS; verbs dispatch with the closure pid', () => {
  for (const owner of [true, false]) {
    const h = makeCtx({
      CAN_EDIT() { return owner; }, PROFILE_SLUG: 'x', closeMenu() {},
      editPost: null, delPost: null, toggleHideFeed: null, fbShare: null, reportPost: null
    });
    const seen = [];
    h.ctx.editPost = (s, i) => seen.push(['edit', s, i]);
    h.ctx.delPost = (p) => seen.push(['del', p]);
    h.ctx.toggleHideFeed = (s, i) => seen.push(['hide', s, i]);
    h.ctx.fbShare = (u) => seen.push(['copy', u]);
    h.ctx.reportPost = () => seen.push(['report']);
    h.run(slice('function postMenu(', 'function delPost('));
    h.run('postMenu(' + JSON.stringify(HOSTILE_PID) + ',"article",2,null)');
    const m = h.document.body.children[0];
    assert.ok(m, 'menu appended');
    const tags = parseTags(m.innerHTML);
    assert.ok(tags.length >= 2);
    for (const t of tags) for (const k of Object.keys(t.attrs)) assert.equal(/^on/.test(k), false, 'menu inline handler ' + k);
    assert.equal(m.innerHTML.indexOf('alert'), -1);
    const click = m.listeners.find((x) => x.t === 'click');
    assert.ok(click, 'menu has a delegated click listener');
    for (const t of tags) {
      const verb = t.attrs['data-m'];
      click.f({ target: { closest: () => ({ getAttribute: () => verb }) } });
    }
    const flat = JSON.stringify(seen);
    if (owner) {
      assert.ok(flat.includes(JSON.stringify(['del', HOSTILE_PID])), 'delete gets the exact pid');
      assert.ok(flat.includes(JSON.stringify(['edit', 'article', 2])));
    } else {
      assert.ok(flat.includes('"copy"') && flat.includes('"report"'));
    }
  }
});

/* ================= F1: new-chat chips + member rows ================= */
function ncCtx() {
  const h = makeCtx({ NC_SEL: {}, NC_NAMES: {}, SB: null, ncClose() {} });
  h.run(line('function esc(s)'));
  h.run(slice('function ncInitial(', 'function ncStep2('));
  return h;
}

test('F1: new-chat chips use data-h + delegated click, not ncToggle(\'<handle>\')', () => {
  const h = ncCtx();
  const chips = (h.els['nc-chips'] = fakeEl('span'));
  h.run('NC_SEL[' + JSON.stringify(HOSTILE_PID) + ']=1; NC_NAMES[' + JSON.stringify(HOSTILE_PID) + ']=' + JSON.stringify(HOSTILE_HTML) + '; ncRenderChips();');
  const tags = assertNoDataInHandlers(chips.innerHTML, 'chips');
  const b = tags.find((t) => t.name === 'b');
  assert.ok(b && unesc(b.attrs['data-h']) === HOSTILE_PID, 'handle round-trips through data-h');
  assert.equal(typeof chips.onclick, 'function', 'delegated click');
  chips.onclick({ target: { closest: () => ({ getAttribute: () => HOSTILE_PID }) } });
  assert.equal(h.run('Object.keys(NC_SEL).length'), 0, 'clicking the chip removed exactly that handle');
});

test('F1: new-chat member rows use data-h + delegated click', async () => {
  const h = ncCtx();
  const list = (h.els['nc-list'] = fakeEl('div'));
  h.ctx.SB = { rpc() { return Promise.resolve({ data: [{ handle: HOSTILE_PID, display_name: HOSTILE_HTML }] }); } };
  h.run('ncSearch("")');
  await new Promise((r) => setTimeout(r, 5));
  const tags = assertNoDataInHandlers(list.innerHTML, 'rows');
  const row = tags.find((t) => /nc-row/.test(t.attrs.class || ''));
  assert.ok(row && unesc(row.attrs['data-h']) === HOSTILE_PID);
  assert.equal(typeof list.onclick, 'function');
  list.onclick({ target: { closest: () => ({ getAttribute: () => HOSTILE_PID }) } });
  assert.equal(h.run('NC_SEL[' + JSON.stringify(HOSTILE_PID) + ']'), 1);
});

/* ================= F2: collection names ================= */
test('F2: a collection name is text, never parsed as HTML; the chip toggles by closure, not inline JS', async () => {
  const cbox = fakeEl('div'), grid = fakeEl('div'), empty = fakeEl('div');
  const colls = [{ id: 7, name: HOSTILE_NAME }, { id: 'a-b', name: 'Saved' }];
  const q = (data) => { const p = Promise.resolve({ data }); p.order = () => p; return p; };
  const h = makeCtx({
    SESSION: { user: { id: 'u' } }, CUR_COLL: null, kilSafeUrl(u) { return u; },
    SB: { from(t) { return { select() { return q(t === 'collections' ? colls : []); } }; } }
  });
  h.els['saved-coll'] = cbox; h.els['saved-grid'] = grid; h.els['saved-empty'] = empty;
  h.run(slice('function loadSaved(){', 'function newCollection(){'));
  h.run('loadSaved()');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(cbox.innerHTML.indexOf('<img'), -1, 'no hostile markup reached innerHTML');
  assert.equal(/onclick|onerror/.test(cbox.innerHTML), false);
  assert.equal(cbox.children.length, 2, 'one button per collection');
  const hostileBtn = cbox.children.find((c) => c.textContent === HOSTILE_NAME.slice(0, 24));
  assert.ok(hostileBtn, 'name is carried as textContent (24-char cap kept)');
  const click = hostileBtn.listeners.find((x) => x.t === 'click');
  assert.ok(click, 'closure click listener');
  h.ctx.loadSaved = function () {};   /* the handler re-enters loadSaved; observe the selection only */
  click.f({});
  assert.equal(h.run('CUR_COLL'), 7);
});

/* ================= F6: signed-out feed ================= */
function feedCtx(rows) {
  const host = fakeEl('div');
  const h = makeCtx({
    SESSION: null, DB_OK: false, IS_OWNER: false, OWNS: false, PROFILE_SLUG: 'dj-test', PROFILE: { name: 'DJ', avatar: '' },
    SEED: { articles: [], photos: [], shows: [], chats: [] },
    GT_ARTICLES: [], GAL_IMGS: [], GT_SHOWS: [], GT_CHATS: [], COLLAB_POSTS: [], EVENTS_FEED: [],
    CAN_EDIT() { return false; }, safeMedia(u) { return u; }, storedBody() { return ''; },
    renderGallery() {}, renderShows() {}, renderChats() {}, fallbackLocal() { throw new Error('fell back to local: DB read failed'); }
  });
  /* the Supabase read the page makes for everyone: select * from profile_content where slug, no auth involved */
  const queries = [];
  h.ctx.SB = {
    from(t) {
      const q = { t, filters: [] };
      queries.push(q);
      const chain = {
        select() { return chain; }, eq(k, v) { q.filters.push([k, v]); return chain; }, order() { return chain; },
        then(f, g) { return Promise.resolve({ data: rows, error: null }).then(f, g); },
        catch(g) { return Promise.resolve({ data: rows, error: null }).catch(g); }
      };
      return chain;
    }
  };
  h.els['feed-grid'] = host;
  h.run(line('function esc(s)'));
  for (const f of ['function galSrc(', 'function postType(', 'function sigPid(', 'function hideKey(', 'function loadHides(', 'function postSig(', 'function isHiddenFromFeed(']) h.run(line(f));
  h.run(slice('function allPosts(){', '/* Collab READ side'));
  h.run(slice('function eventCardHtml(', 'function openPost('));
  h.run(slice('function renderArticles(){', 'function openArticle('));
  h.run('function renderAll(){ renderArticles(); }');
  h.run(slice('function rebuild(rows){', 'function fallbackLocal(){'));
  return { h, host, queries };
}
const countCards = (html) => (html.match(/class="pf-card fbcard/g) || []).length;

test('F6 control: signed-out load renders article and photo rows (harness is sound)', async () => {
  const { h, host } = feedCtx([
    { id: '11111111-1111-1111-1111-111111111111', kind: 'article', created_at: '2026-01-01', data: { t: 'An article', img: 'https://i/a.jpg' } },
    { id: '22222222-2222-2222-2222-222222222222', kind: 'photo', created_at: '2026-01-02', data: { src: 'https://i/p.jpg', label: 'A photo' } }
  ]);
  h.run('loadFromDB()');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(countCards(host.innerHTML), 2);
});

test('F6: signed-out load renders kind=post rows as feed cards (no session, public SELECT only)', async () => {
  const rows = [
    { id: '33333333-3333-3333-3333-333333333333', kind: 'post', created_at: '2026-01-03', data: { t: 'Written post one', desc: 'hello', img: 'https://i/1.jpg' } },
    { id: '44444444-4444-4444-4444-444444444444', kind: 'post', created_at: '2026-01-04', data: { t: 'Post with media array only', media: [{ src: 'https://i/2.jpg', mtype: 'image' }] } },
    { id: '55555555-5555-5555-5555-555555555555', kind: 'post', created_at: '2026-01-05', data: { t: 'Post with cover only', cover: 'https://i/3.jpg' } }
  ];
  const { h, host, queries } = feedCtx(rows);
  assert.equal(h.run('SESSION'), null, 'signed out');
  h.run('loadFromDB()');
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(queries.map((q) => q.t), ['profile_content']);
  assert.equal(countCards(host.innerHTML), 3, 'every post row became a card');
  for (const r of rows) assert.ok(host.innerHTML.includes('data-pid="' + r.id + '"'), 'card for ' + r.id);
  assert.ok(host.innerHTML.includes('Written post one'));
  assert.ok(host.innerHTML.includes('src="https://i/2.jpg"'), 'media[0].src used when data.img is absent');
  assert.ok(host.innerHTML.includes('src="https://i/3.jpg"'), 'data.cover used when no img/media');
  assert.equal(host.innerHTML.includes('No posts yet'), false);
});
