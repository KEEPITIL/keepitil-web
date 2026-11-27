/*
 * Follow-up to xss-sinks3 (Sentinel sweep of #480):
 *   (a) kode/app.html renderWho: myProfile.handle reached innerHTML raw
 *   (b) kode/app.html escapeHtml did not escape quotes (textContent->innerHTML), and renderReady spliced p.media_url into a
 *       JS string inside an inline onclick (HTML-escaping cannot protect a JS string context) -> data-url + validated https URL
 *   (c) profile.html renderCategories: unknown / prototype keys ("constructor", "__proto__") must be dropped, not rendered
 * Real functions are sliced out of the shipped files and run in node:vm with a minimal fake DOM.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(dir, '../..', rel), 'utf8');
const between = (src, from, to) => { const a = src.indexOf(from); assert.ok(a >= 0, 'marker: ' + from); const b = src.indexOf(to, a + from.length); assert.ok(b > a, 'end: ' + to); return src.slice(a, b); };
const el = () => ({ innerHTML: '', style: {}, textContent: '', href: '' });
const HOSTILE = '"><img src=x onerror=alert(1)>';

function noExec(html, label) {
  assert.equal(/<img[^>]*src=x/i.test(html), false, label + ': injected <img src=x>');
  assert.equal(/<script/i.test(html), false, label + ': injected <script>');
  // no attribute may be broken out of: any on* attribute must belong to the code's own markup
  for (const m of html.matchAll(/<[a-z][^>]*>/gi)) {
    const bare = m[0].replace(/"[^"]*"/g, '""');
    for (const a of bare.matchAll(/\s(on[a-z]+)=/gi)) assert.ok(/^onclick$/i.test(a[1]) || /^onerror$/i.test(a[1]), label + ': stray handler in ' + m[0].slice(0, 80));
    assert.equal(/onerror=alert/i.test(m[0].replace(/"[^"]*"/g, '')), false, label + ': payload outside a quoted value');
  }
}

const kode = read('kode/app.html');
const escCode = kode.slice(kode.indexOf('function escapeHtml('), kode.indexOf('\n', kode.indexOf('function escapeHtml(')));

test('(a) kode renderWho escapes the handle', () => {
  const who = el();
  const ctx = vm.createContext({ $: () => who, me: { id: 1 }, myProfile: { handle: HOSTILE }, String, RegExp });
  vm.runInContext(escCode + '\n' + between(kode, 'function renderWho(){', '\nasync function signOut'), ctx);
  ctx.renderWho ? ctx.renderWho() : vm.runInContext('renderWho()', ctx);
  noExec(who.innerHTML, 'who');
  assert.match(who.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.equal(who.innerHTML.includes(HOSTILE), false);
});

test('(b) kode escapeHtml escapes quotes; renderReady media button carries the URL in data-url, never in a JS string', () => {
  const ctx0 = vm.createContext({ String, RegExp });
  vm.runInContext(escCode + '\nthis.e=escapeHtml;', ctx0);
  assert.equal(ctx0.e('a"b\'c<d>&'), 'a&quot;b&#39;c&lt;d&gt;&amp;');

  const list = el(), card = el(), alerts = el();
  const els = { 'ready-card': card, 'alerts-btn': alerts, 'ready-list': list };
  const ctx = vm.createContext({
    $: (id) => els[id], PLATFORM_ICON: {}, OPEN_LINK: {}, mediaThumb: () => '', notifyReady() {}, Notification: { permission: 'granted' }, window: { Notification: 1 }, Date, String, RegExp
  });
  vm.runInContext(escCode + '\n' + between(kode, 'function renderReady(list){', '\n}\n') + '\n}\nthis.renderReady=renderReady;', ctx);
  const base = { id: 'p1', platform: 'x', caption: HOSTILE, scheduled_at: '2026-12-01T00:00:00Z' };
  // breakout attempt: a quote closes the JS string inside onclick
  ctx.renderReady([{ ...base, media_url: "https://a.test/x');alert(1);//" }]);
  assert.equal(/media/.test(list.innerHTML) && /data-url/.test(list.innerHTML), false, 'URL with a quote is rejected, no media button');
  assert.equal(list.innerHTML.includes('alert(1);//'), false);
  ctx.renderReady([{ ...base, media_url: 'javascript:alert(1)' }]);
  assert.equal(/data-url/.test(list.innerHTML), false, 'non-http(s) URL rejected');
  ctx.renderReady([{ ...base, media_url: 'https://cdn.example.test/a.jpg?x=1&y=2' }]);
  assert.match(list.innerHTML, /data-url="https:\/\/cdn\.example\.test\/a\.jpg\?x=1&amp;y=2"/, 'valid URL kept, attribute-escaped');
  assert.match(list.innerHTML, /data-click="kodeOpenMedia" data-a="\[&quot;\$el&quot;\]"/);
  noExec(list.innerHTML, 'ready');
});

test('(c) profile renderCategories drops unknown and prototype keys, escapes the rest', () => {
  const src = read('profile.html');
  const escLine = src.slice(src.indexOf('function esc(s)'), src.indexOf('\n', src.indexOf('function esc(s)')));
  const box = el();
  const ctx = vm.createContext({ document: { getElementById: () => box }, PROFILE: { categories: ['artist', 'constructor', '__proto__', 'toString', HOSTILE, 'venue', 'hasOwnProperty'] }, String, RegExp, Object });
  vm.runInContext(escLine + '\n' + between(src, 'function renderCategories(){', '\n}\n') + '\n}\nthis.renderCategories=renderCategories;', ctx);
  ctx.renderCategories();
  const badges = [...box.innerHTML.matchAll(/<span class="pf-catbadge ([^"]*)">([^<]*)<\/span>/g)].map((m) => m[1] + ':' + m[2]);
  assert.deepEqual(badges, ['artist:Artist', 'venue:Venue']);
});
