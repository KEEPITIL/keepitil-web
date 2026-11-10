/*
 * profile.html — leftover sinks after F1/F2/F6 (stacked on #120):
 *   (a) collabRespond(<db id>) spliced into an inline onclick     -> data-* + delegated listener
 *   (b) toggleArchived(<db id>,<bool>) spliced into an inline onclick -> data-* + delegated listener
 *   (c) Insights "Top posts" t.title (and chart labels / numbers) reached innerHTML raw -> esc()
 *   (d) links-dropdown label derived from a URL: the IIFE-local esc() only stripped quotes -> full escape
 *   plus the Archive list's x.kind / label, which went into the same innerHTML unescaped.
 *
 * Same harness as profile-f126.test.mjs: real functions are sliced out of profile.html by marker and run in
 * a node:vm context with a minimal fake DOM. PROFILE_HTML=<path> runs the file against another copy of
 * profile.html (negative control: #120's tip, which does not carry these fixes).
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

const HOSTILE_ID = "1');alert(1);//";
const HOSTILE_HTML = '<img src=x onerror=alert(1)>';
const HOSTILE_ATTR = '"><img src=x onerror=alert(1)>';

function fakeEl(tag) {
  const el = {
    tag, innerHTML: '', textContent: '', className: '', id: '', children: [], style: {}, listeners: [], onclick: null,
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    appendChild(c) { el.children.push(c); return c; },
    addEventListener(t, f, c) { el.listeners.push({ t, f, c }); },
    remove() {}
  };
  return el;
}
function makeCtx(globals) {
  const els = {};
  const document = {
    getElementById(id) { return Object.prototype.hasOwnProperty.call(els, id) ? els[id] : null; },
    createElement(t) { return fakeEl(t); },
    addEventListener() {},
    querySelectorAll() { return []; },
    body: fakeEl('body')
  };
  const ctx = vm.createContext(Object.assign({
    document, els, window: { scrollY: 0 }, console, setTimeout, Promise, encodeURIComponent, String, Object, Array, JSON, Math, RegExp, parseInt
  }, globals || {}));
  return { ctx, document, els, run: (code) => vm.runInContext(code, ctx, { filename: 'profile.html(slice)' }) };
}

/* ---- structural HTML check (same tokenizer idea as profile-f126.test.mjs) ---- */
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
/* No executable markup: no inline on* handler at all, no <img>/<script>/<iframe>/<svg> element, no payload in any handler. */
function assertInert(html, label) {
  const tags = parseTags(html);
  assert.ok(tags.length >= 1, label + ': tokenizer found markup');
  for (const t of tags) {
    for (const k of Object.keys(t.attrs)) assert.equal(/^on/.test(k), false, label + ': inline handler ' + k + ' on <' + t.name + '>');
    assert.equal(['img', 'script', 'iframe', 'svg', 'object', 'embed'].includes(t.name), false, label + ': injected <' + t.name + '>');
  }
  assert.equal(/alert\(1\)/.test(html.replace(/&lt;[^>]*&gt;/g, '').replace(/&#39;\);alert\(1\);\/\//g, '')), false, label + ': raw payload text in markup');
  return tags;
}

/* ================= (a) collab Accept / Decline ================= */
function collabCtx(pending) {
  const calls = [];
  const h = makeCtx({
    COLLAB_PENDING: pending, CAN_EDIT() { return true; },
    allPosts() { return []; }, isHiddenFromFeed() { return false; }, postCard() { return ''; },
    collabRespond: (id, st) => calls.push([id, st])
  });
  h.els['feed-grid'] = fakeEl('div');
  h.els['collab-pending'] = fakeEl('div');
  h.run(line('function esc(s)'));
  h.run(slice('function renderArticles(){', 'function openArticle('));
  return { h, calls, pend: h.els['collab-pending'] };
}
const ctxClick = (list, btn) => list({ target: { closest: (sel) => (sel === 'button[data-collab-id]' || sel === 'button[data-arch-id]' ? btn : null) } });
const mkBtn = (attrs) => ({ getAttribute: (k) => (k in attrs ? attrs[k] : null) });

test('(a) collab invite: hostile id/slug/title produce no inline JS and no markup', () => {
  const { h, pend } = collabCtx([{ id: HOSTILE_ID, source_slug: HOSTILE_ATTR, title: HOSTILE_HTML, status: 'pending' }]);
  h.run('renderArticles()');
  const tags = assertInert(pend.innerHTML, 'collab');
  const btns = tags.filter((t) => t.name === 'button');
  assert.equal(btns.length, 2);
  assert.deepEqual(btns.map((b) => b.attrs['data-collab-st']), ['accepted', 'declined']);
  for (const b of btns) assert.equal(unesc(b.attrs['data-collab-id']), HOSTILE_ID, 'id round-trips through data-*');
});

test('(a) collab invite: clicking Accept / Decline calls collabRespond with the exact id and fixed status', () => {
  const { h, calls, pend } = collabCtx([{ id: HOSTILE_ID, source_slug: 's', title: 't', status: 'pending' }]);
  h.run('renderArticles()');
  assert.equal(typeof pend.onclick, 'function', 'delegated listener installed');
  ctxClick(pend.onclick, mkBtn({ 'data-collab-id': HOSTILE_ID, 'data-collab-st': 'accepted' }));
  ctxClick(pend.onclick, mkBtn({ 'data-collab-id': HOSTILE_ID, 'data-collab-st': 'declined' }));
  assert.deepEqual(calls, [[HOSTILE_ID, 'accepted'], [HOSTILE_ID, 'declined']]);
  const n = calls.length;
  ctxClick(pend.onclick, null);   /* a click that is not on an invite button is ignored */
  assert.equal(calls.length, n);
  /* re-render assigns (not stacks): still one call per click */
  h.run('renderArticles()');
  ctxClick(pend.onclick, mkBtn({ 'data-collab-id': 'u-1', 'data-collab-st': 'accepted' }));
  assert.deepEqual(calls.slice(n), [['u-1', 'accepted']]);
});

/* ================= (b) Archive list ================= */
async function archiveCtx(rows) {
  const calls = [];
  const h = makeCtx({
    PROFILE_SLUG: 'p', closeModal() {}, toast() {},
    toggleArchived: (id, v) => calls.push([id, v])
  });
  const box = (h.els['archList'] = fakeEl('div'));
  const chain = {
    select() { return chain; }, eq() { return chain; }, order() { return chain; }, limit() { return chain; },
    then(f, g) { return Promise.resolve({ data: rows }).then(f, g); }
  };
  h.ctx.SB = { from() { return chain; } };
  h.run(line('function esc(s)'));
  h.run(slice('function openArchive(){', 'function toggleArchived('));
  h.run('openArchive()');
  await new Promise((r) => setTimeout(r, 10));
  return { h, calls, box };
}

test('(b) archive rows: hostile id/kind/title carry no inline JS and no markup', async () => {
  const { box } = await archiveCtx([
    { id: HOSTILE_ID, kind: HOSTILE_HTML, data: { title: HOSTILE_ATTR }, archived: false },
    { id: 'b-2', kind: 'post', data: { caption: 'ok' }, archived: true }
  ]);
  const tags = assertInert(box.innerHTML, 'archive');
  const btns = tags.filter((t) => t.name === 'button');
  assert.equal(btns.length, 2);
  assert.equal(unesc(btns[0].attrs['data-arch-id']), HOSTILE_ID);
  assert.equal(btns[0].attrs['data-arch-val'], 'true', 'not archived -> click archives');
  assert.equal(btns[1].attrs['data-arch-val'], 'false', 'archived -> click restores');
  assert.ok(box.innerHTML.includes('&lt;img'), 'kind rendered as text');
});

test('(b) archive rows: click calls toggleArchived(id, boolean) with the exact id', async () => {
  const { box, calls } = await archiveCtx([
    { id: HOSTILE_ID, kind: 'post', data: {}, archived: false },
    { id: 'b-2', kind: 'post', data: {}, archived: true }
  ]);
  assert.equal(typeof box.onclick, 'function');
  ctxClick(box.onclick, mkBtn({ 'data-arch-id': HOSTILE_ID, 'data-arch-val': 'true' }));
  ctxClick(box.onclick, mkBtn({ 'data-arch-id': 'b-2', 'data-arch-val': 'false' }));
  assert.deepEqual(calls, [[HOSTILE_ID, true], ['b-2', false]]);
  assert.strictEqual(typeof calls[0][1], 'boolean');
});

/* ================= (c) Insights ================= */
test('(c) insights: top-post titles, chart labels and numbers are text, never markup', async () => {
  const h = makeCtx({ PROFILE_SLUG: 'p' });
  const body = (h.els['insBody'] = fakeEl('div'));
  h.ctx.SB = {
    rpc() {
      return Promise.resolve({
        data: {
          profile_views_total: HOSTILE_HTML, reach: 5, impressions_total: 2500, followers: 3, likes: 1,
          views_series: [{ d: HOSTILE_ATTR, v: 4 }, { d: '11/09', v: HOSTILE_HTML }],
          follows_series: [],
          top_posts: [{ title: HOSTILE_HTML, likes: 2, comments: 1 }, { title: HOSTILE_ATTR }, {}]
        }
      });
    }
  };
  h.run(line('function esc(s)'));
  h.run(slice('function openInsights(){', 'var SESSION=null'));
  h.run('openInsights()');
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(body.innerHTML.length > 200, 'insights rendered');
  assertInert(body.innerHTML, 'insights');
  assert.ok(body.innerHTML.includes('&lt;img src=x onerror=alert(1)&gt;'), 'title shown as literal text');
  assert.ok(body.innerHTML.includes('>Post</span>'), 'fallback title kept');
  assert.ok(body.innerHTML.includes('2.5k'), 'number formatting kept');
});

/* ================= (d) links dropdown ================= */
test('(d) links dropdown: URL-derived label is escaped; legitimate links still render', () => {
  const h = makeCtx({});
  const menu = (h.els['pfLinksMenu'] = fakeEl('div'));
  const drop = (h.els['pfLinksDrop'] = fakeEl('div'));
  h.ctx.window.PROFILE = {
    links: ['https://ok.example/path?a=1&b=2', 'https://x.example/<img src=x onerror=alert(1)>', 'https://y.example/"><img src=x onerror=alert(1)>'],
    socials: { instagram: 'https://instagram.com/k' }
  };
  h.ctx.safeNav = (u) => (/^https?:\/\//.test(u) ? u : '');
  h.run(slice('  function esc(u){', '  var n=0; var iv='));
  h.run('build()');
  assert.ok(menu.innerHTML.length > 0, 'dropdown built');
  assert.equal(drop.style.display, 'block');
  const tags = assertInert(menu.innerHTML, 'links');
  const anchors = tags.filter((t) => t.name === 'a');
  assert.equal(anchors.length, 4);
  assert.equal(unesc(anchors[0].attrs.href), 'https://ok.example/path?a=1&b=2', 'legit URL decodes back unchanged');
  assert.ok(menu.innerHTML.includes('ok.example/path?a=1&amp;b=2</a>'), 'legit label shown as text');
  assert.ok(menu.innerHTML.includes('&lt;img'), 'hostile label shown as text');
  assert.ok(menu.innerHTML.includes('>Instagram</a>'), 'social label kept');
});
