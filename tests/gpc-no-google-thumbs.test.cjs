'use strict';
// Run: node --test tests/gpc-no-google-thumbs.test.cjs
// Follow-up to #352 (Grok 2026-11-24): a visitor who sends Global Privacy Control or Do Not Track must not make a request to Google for a video card's thumbnail either.
// Culture shows ~100 YouTube cards; each thumbnail was an i.ytimg.com request. Opted-out visitors get our own default picture until they tap play.
const assert = require('node:assert/strict');
const __A = require("./helpers/event-assembled.cjs").assemble;
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const culture = __A(fs.readFileSync(path.join(__dirname, '..', 'culture/index.html'), 'utf8'));
function thumbFn(src = culture, gpc) {
  const a = src.indexOf('window.kilVideoThumb=function(u){'); assert.ok(a > 0, 'kilVideoThumb exists'); const b = src.indexOf('};', a) + 2;
  const ctx = vm.createContext({ window: { KIL_GPC: gpc, URL }, location: { href: 'https://keepitil.com/culture/' } });
  vm.runInContext(src.slice(a, b), ctx); return ctx.window.kilVideoThumb;
}
const GOOGLE = ['https://i.ytimg.com/vi/abc/hqdefault.jpg', 'https://i3.ytimg.com/vi/abc/hqdefault.jpg', 'https://img.youtube.com/vi/abc/0.jpg', 'https://yt3.ggpht.com/a/b', 'https://lh3.googleusercontent.com/x', 'https://www.youtube-nocookie.com/x.jpg'];
const OWN = ['https://ovmqtzjfpzrbzrlkxwgw.supabase.co/storage/v1/object/public/a.jpg', '/assets/images/blog-default.jpg', 'https://keepitil.com/x.jpg', 'https://images.ra.co/x.jpg'];

test('GPC / DNT: every Google-hosted thumbnail address is dropped (the card falls back to our default picture); everything else is left alone', () => {
  const f = thumbFn(culture, true);
  for (const u of GOOGLE) assert.equal(f(u), '', u);
  for (const u of OWN) assert.equal(f(u), u, u);
  for (const u of ['', null, undefined]) assert.equal(f(u), u);
  assert.doesNotThrow(() => f('http://[bad'));   // an unparseable address never throws
});

test('normal visitors: nothing changes, Google thumbnails stay', () => {
  const f = thumbFn(culture, false); for (const u of [...GOOGLE, ...OWN]) assert.equal(f(u), u);
});

test('NEGATIVE CONTROL: if the GPC check is removed, the normal-visitor test above fails (a normal visitor would lose their thumbnails), and with the flag forced off the opted-out test fails', () => {
  const broken = culture.replace('if(window.KIL_GPC && u){', 'if(u){'); assert.notEqual(broken, culture);
  assert.equal(thumbFn(broken, false)('https://i.ytimg.com/vi/abc/hqdefault.jpg'), '', 'no flag check: even a normal visitor loses it (caught)');
  assert.equal(thumbFn(culture, false)('https://i.ytimg.com/vi/abc/hqdefault.jpg'), 'https://i.ytimg.com/vi/abc/hqdefault.jpg', 'real code: normal visitor keeps it');
});

test('both video-thumbnail call sites (the feed card and the desktop rail) go through it, and the fallback is our own default picture', () => {
  assert.match(culture, /thumb:window\.kilVideoThumb\(vd\.img\|\|vd\.cover\)\|\|'\/assets\/images\/blog-default\.jpg'/);
  assert.match(culture, /return window\.kilVideoThumb\(d\.cover\|\|d\.img\|\|r\.thumbnail_url\|\|d\.thumbnail_url\)\|\|'\/assets\/images\/blog-default\.jpg'/);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'assets/images/blog-default.jpg')));
  assert.match(culture, /window\.KIL_GPC=o;/);
});
