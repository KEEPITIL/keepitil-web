'use strict';
// Run: node --test tests/gpc-honoured.test.cjs
// Grok 2026-11-24: honour Global Privacy Control AND Do Not Track. A browser sending either gets NO Google Analytics and NO Microsoft Clarity (no script added, no request),
// and the Culture YouTube player only mounts after a tap (served from youtube-nocookie.com for everyone). Visitors who send neither are unchanged. The privacy page says so.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const shell = read('keepitil-shell.js'), culture = read('culture/index.html'), privacy = read('privacy.html');

// the analytics block of the shell, from the opt-out check through the end of __kilMountAnalytics
function analyticsBlock(src) { const a = src.indexOf('function __kilClarityAllowed'); const b = src.indexOf('/* gtag() must exist BEFORE'); assert.ok(a > 0 && b > a, 'analytics block found'); return src.slice(a, b) + '\n' + src.slice(src.indexOf('function __kilOptedOut'), src.indexOf('try{ window.KIL_OPTED_OUT')); }
function optedOutFn(src, name) { const a = src.indexOf('function ' + name + '()'); assert.ok(a >= 0, name + ' exists'); const e = src.indexOf('\n  }\n', a); return src.slice(a, e + 4); }

function sandbox(nav, win = {}) {
  const appended = [];
  const el = (tag) => ({ tag, async: false, set src(v) { this._src = v; }, get src() { return this._src; }, parentNode: { insertBefore: (n) => appended.push(n) } });
  const document = { createElement: el, head: { appendChild: (n) => appended.push(n) }, getElementsByTagName: () => [{ parentNode: { insertBefore: (n) => appended.push(n) } }] };
  const w = Object.assign({ innerWidth: 1280, document, navigator: nav, dataLayer: [], location: { search: '' }, sessionStorage: { getItem: () => null, setItem() {} } }, win);
  return { ctx: vm.createContext(Object.assign(w, { window: w, navigator: nav, document, location: w.location, sessionStorage: w.sessionStorage })), appended, w };
}
function mountedHosts(nav, win, src = shell) {
  const { ctx, appended, w } = sandbox(nav, win);
  vm.runInContext(analyticsBlock(src) + '\n__kilMountAnalytics();', ctx);
  return { hosts: appended.map((n) => (n._src || '').replace(/^https:\/\/([^/]+).*$/, '$1')).filter(Boolean), gaDisabled: w['ga-disable-G-ZR36NRE4MT'] === true };
}

const CASES = [
  ['no signal', { }, false], ['GPC true', { globalPrivacyControl: true }, true], ['GPC false', { globalPrivacyControl: false }, false],
  ['DNT "1"', { doNotTrack: '1' }, true], ['DNT "yes"', { doNotTrack: 'yes' }, true], ['DNT "0"', { doNotTrack: '0' }, false], ['DNT null', { doNotTrack: null }, false],
  ['msDoNotTrack "1"', { msDoNotTrack: '1' }, true], ['GPC string "true" is not the signal', { globalPrivacyControl: 'true' }, false],
];

test('the opt-out check: GPC === true or DNT 1/yes; the shell and the Culture page give the SAME answer for every signal', () => {
  for (const [name, nav, want] of CASES) {
    for (const [file, src, fn] of [['shell', shell, '__kilOptedOut'], ['culture', culture, 'kilOptedOut']]) {
      const ctx = vm.createContext({ navigator: nav, window: {} }); ctx.window = ctx; // window.doNotTrack read
      assert.equal(vm.runInContext(optedOutFn(src, fn) + '\n' + fn + '()', ctx), want, `${file}: ${name}`);
    }
  }
  const win = vm.createContext({ navigator: {}, window: { doNotTrack: '1' } }); win.window = win.window;
  assert.equal(vm.runInContext(optedOutFn(shell, '__kilOptedOut') + '\n__kilOptedOut()', Object.assign(win, { window: { doNotTrack: '1' } })), true, 'window.doNotTrack "1" counts');
});

test('GPC or DNT: GA4 and Clarity are never added (no request to Google, Microsoft or Bing); GA is also switched off; control: with no signal both load', () => {
  for (const nav of [{ globalPrivacyControl: true }, { doNotTrack: '1' }, { doNotTrack: 'yes' }, { msDoNotTrack: '1' }]) {
    const r = mountedHosts(nav); assert.deepEqual(r.hosts, [], JSON.stringify(nav)); assert.equal(r.gaDisabled, true);
  }
  const normal = mountedHosts({}); assert.deepEqual(normal.hosts.sort(), ['www.clarity.ms', 'www.googletagmanager.com']);   // desktop width: GA4 + Clarity
  const phone = mountedHosts({}, { innerWidth: 390 }); assert.deepEqual(phone.hosts, ['www.googletagmanager.com'], 'Clarity stays desktop-only');
  assert.equal(normal.gaDisabled, false);
});

test('NEGATIVE CONTROL: without the opt-out line the same GPC visitor would be tracked (the test above would catch it)', () => {
  const broken = shell.replace("if(__kilOptedOut()){ try{ window['ga-disable-G-ZR36NRE4MT'] = true; }catch(e){} return; }", '');
  assert.notEqual(broken, shell);
  assert.deepEqual(mountedHosts({ globalPrivacyControl: true }, {}, broken).hosts.sort(), ['www.clarity.ms', 'www.googletagmanager.com']);
});

test('Culture video: always the privacy-enhanced domain, never a direct youtube.com embed; opted-out visitors mount only after a tap', () => {
  assert.match(culture, /youtube-nocookie\.com\/embed\//); assert.doesNotMatch(culture, /preconnect" href="https:\/\/www\.youtube\.com"/);
  const a0 = culture.indexOf('function kilNoCookie('); assert.ok(a0 > 0, 'kilNoCookie exists');
  const fn = vm.runInNewContext('(' + culture.slice(a0, culture.indexOf('\n', a0)) + ')', {});
  assert.equal(fn('https://www.youtube.com/embed/abc123?x=1'), 'https://www.youtube-nocookie.com/embed/abc123?x=1');
  assert.equal(fn('https://youtube.com/embed/abc123'), 'https://www.youtube-nocookie.com/embed/abc123');
  assert.equal(fn('https://www.youtube-nocookie.com/embed/abc123'), 'https://www.youtube-nocookie.com/embed/abc123', 'already private: unchanged');
  const play = culture.slice(culture.indexOf('function play(card)'), culture.indexOf("f.title = 'KEEPITIL culture video player'"));
  assert.ok(play.indexOf('kilOptedOut() && !card.__kilTapped') > 0, 'the gate is in play()'); assert.ok(play.indexOf('armTap(card); return;') < play.indexOf('document.createElement'), 'the gate comes BEFORE any iframe is created');
  assert.ok(play.indexOf('kilNoCookie(url)') > 0);
  assert.match(culture, /well\.addEventListener\('click'/); assert.match(culture, /muted autoplay|autoplay=1&mute=/);   // non-GPC visitors keep the Founder's muted autoplay
  assert.match(culture, /ev\.origin\)\)\s*return;|youtube\(-nocookie\)\?/, 'the player-message origin check accepts the nocookie host');
});

test('the preconnect to Google hosts is added only for visitors who did not opt out', () => {
  const m = culture.match(/<script>\/\* Warm the video connection[\s\S]*?<\/script>/); assert.ok(m, 'inline warm-up script');
  const run = (nav) => { const links = []; const doc = { createElement: () => ({}), head: { appendChild: (l) => links.push(l.href) } }; vm.runInNewContext(m[0].replace(/<\/?script>/g, ''), { navigator: nav, window: {}, document: doc }); return links; };
  assert.deepEqual(run({ globalPrivacyControl: true }), []); assert.deepEqual(run({ doNotTrack: '1' }), []);
  assert.deepEqual(run({}), ['https://www.youtube-nocookie.com', 'https://i.ytimg.com']);
});

test('privacy page: ONE last-updated date; says GPC and DNT are honored; names Google Analytics, Microsoft Clarity (+ Bing) and YouTube (Google)', () => {
  assert.equal((privacy.match(/Last updated/g) || []).length, 1); assert.doesNotMatch(privacy, /July 21, 2026|2026-07-10/);
  for (const must of [/Global Privacy Control and Do Not Track are honored/, /Google Analytics 4/, /Microsoft Clarity/, /Bing/, /YouTube/, /privacy-enhanced mode/, /only starts after you tap play/]) assert.match(privacy, must);
  assert.doesNotMatch(privacy, /where supported/, 'the old vague promise is gone');
});

test('privacy page: names RSVP device id + optional email, Cloudflare + form limiting, email sign-in, and Stripe only for tickets and competition entries', () => {
  for (const must of [/random device ID/, /only if you choose to add one, your email address/, /<strong>Cloudflare<\/strong>/, /limit how often one address can submit our forms/, /you sign in with it/, /when you buy a ticket or enter a competition/]) assert.match(privacy, must);
  assert.doesNotMatch(privacy, /Payment info<\/strong> for purchases/, 'no open-ended Stripe wording');
  assert.equal((privacy.match(/Last updated/g) || []).length, 1);
});
