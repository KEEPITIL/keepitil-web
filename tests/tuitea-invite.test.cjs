'use strict';

// Run without dependencies: node --test tests/tuitea-invite.test.cjs
// app/tuitea/invite/ is the page the TUITEA SMS invite links to (owner decision 2026-11-21 22:22 PST,
// "branded card link"). Its link preview must be the TUITEA invite card, and its script must send
// Apple devices to the App Store and everyone else to the web app. This runs the page's real inline
// script against a checklist of user agents.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'app/tuitea/invite');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const APP_STORE = 'https://apps.apple.com/app/id6806472413';
const WEB_APP = '/app/tuitea/app/';
const CARD = 'https://keepitil.com/app/tuitea/invite/invite_card_1200x630.png';

const scriptMatch = html.match(/<script id="invite-redirect">([\s\S]*?)<\/script>/);

function meta(attr, name) {
  const re = new RegExp(`<meta ${attr}="${name.replace(/[.:]/g, '\\$&')}" content="([^"]*)">`);
  const m = html.match(re);
  return m && m[1];
}

function run(userAgent, maxTouchPoints = 0, search = '') {
  const calls = [];
  const location = { search, replace: (u) => calls.push(u) };
  vm.runInNewContext(scriptMatch[1], { navigator: { userAgent, maxTouchPoints }, location });
  assert.ok(calls.length <= 1, 'redirects at most once');
  return calls[0] || null;
}

// [label, user agent, maxTouchPoints, expected destination]
const UA = [
  ['iPhone Safari', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1', 5, APP_STORE],
  ['iPhone Chrome (CriOS)', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1', 5, APP_STORE],
  ['iPhone Facebook in-app browser', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.40.94;FBBV/600000000;FBDV/iPhone15,2]', 5, APP_STORE],
  ['iPad, legacy UA', 'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1', 5, APP_STORE],
  ['iPadOS 13+ desktop-class (Macintosh + touch)', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15', 5, APP_STORE],
  ['iPod touch', 'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1', 5, APP_STORE],
  ['Mac Safari', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15', 0, APP_STORE],
  ['Mac Chrome', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', 0, APP_STORE],
  ['Mac Firefox', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:133.0) Gecko/20100101 Firefox/133.0', 0, APP_STORE],
  ['Android Chrome', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.81 Mobile Safari/537.36', 5, WEB_APP],
  ['Android Samsung Internet', 'Mozilla/5.0 (Linux; Android 14; SM-S921U) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36', 5, WEB_APP],
  ['Windows Chrome', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', 0, WEB_APP],
  ['Windows touch laptop Edge', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0', 10, WEB_APP],
  ['Linux Firefox', 'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0', 0, WEB_APP],
  ['ChromeOS', 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', 0, WEB_APP],
  ['Windows Phone claiming "like iPhone"', 'Mozilla/5.0 (Mobile; Windows Phone 8.1; Android 4.0; ARM; Trident/7.0; Touch; rv:11.0; IEMobile/11.0; NOKIA; Lumia 635) like iPhone OS 7_0_3 Mac OS X AppleWebKit/537 (KHTML, like Gecko) Mobile Safari/537', 5, WEB_APP],
  ['empty user agent', '', 0, WEB_APP],
];

test('the inline redirect script is present', () => assert.ok(scriptMatch, 'script#invite-redirect'));

for (const [label, ua, touch, want] of UA) {
  test(`redirect: ${label} -> ${want}`, () => assert.equal(run(ua, touch), want));
}

test('negative control: the checklist would catch a script that sends everyone to the App Store', () => {
  const broken = scriptMatch[1].replace('loc.replace(apple ? APP_STORE : WEB_APP)', 'loc.replace(APP_STORE)');
  assert.notEqual(broken, scriptMatch[1], 'the replacement must apply');
  const calls = [];
  vm.runInNewContext(broken, { navigator: { userAgent: UA[9][1], maxTouchPoints: 5 }, location: { search: '', replace: (u) => calls.push(u) } });
  assert.notEqual(calls[0], WEB_APP, 'Android would no longer reach the web app, so the Android row fails');
});

test('?stay=1 keeps the page (QA and screenshots)', () => {
  assert.equal(run(UA[0][1], 5, '?stay=1'), null);
  assert.equal(run(UA[9][1], 5, '?x=1&stay=1'), null);
});

test('link preview: og and twitter tags point at the invite card', () => {
  assert.equal(meta('property', 'og:title'), "You're invited to TUITEA");
  assert.ok((meta('property', 'og:description') || '').length > 20);
  assert.equal(meta('property', 'og:url'), 'https://keepitil.com/app/tuitea/invite/');
  assert.equal(meta('property', 'og:image'), CARD);
  assert.equal(meta('property', 'og:image:width'), '1200');
  assert.equal(meta('property', 'og:image:height'), '630');
  assert.equal(meta('name', 'twitter:card'), 'summary_large_image');
  assert.equal(meta('name', 'twitter:image'), CARD);
  assert.equal(meta('name', 'apple-itunes-app'), 'app-id=6806472413');
});

test('the card is a 1200x630 PNG stored next to the page', () => {
  const png = fs.readFileSync(path.join(dir, 'invite_card_1200x630.png'));
  assert.equal(png.subarray(1, 4).toString('latin1'), 'PNG');
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
});

test('three fallback buttons (owner 2026-11-21 22:27): App Store, web app, Google Play coming soon', () => {
  assert.match(html, /<a class="btn primary" href="https:\/\/apps\.apple\.com\/app\/id6806472413">Download on the App Store<\/a>/);
  assert.match(html, /<a class="btn secondary" href="\/app\/tuitea\/app\/">Open the web app<\/a>/);
  const play = html.match(/<(\w+)[^>]*>Google Play: coming soon<\/\1>/);
  assert.ok(play, 'Google Play button present');
  assert.notEqual(play[1].toLowerCase(), 'a', 'Google Play is not a link');
  assert.match(play[0], /aria-disabled="true"/);
  assert.match(play[0], /class="btn disabled"/);
  assert.doesNotMatch(html, /play\.google\.com/);
});

test('no Apple or Google badge artwork: text buttons only, no svg logos or badge images', () => {
  assert.doesNotMatch(html, /<svg|badge|app-store\.(svg|png)|google-play\.(svg|png)/i);
  const imgs = [...html.matchAll(/<img[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imgs, ['/app/tuitea/invite/tuitea_icon_256.png']);
});

test('TUITEA brand only: gold-tree icon and the TUITEA backgrounds, not the old green-T icon', () => {
  assert.doesNotMatch(html, /icon-192\.png|icon-512\.png|apple-touch-icon\.png/);
  assert.match(html, /\/app\/tuitea\/invite\/tuitea_icon_256\.png/);
  assert.match(html, /\/app\/tuitea\/app\/assets\/assets\/brand\/backgrounds\/home_mobile\.webp/);
  assert.match(html, /\/app\/tuitea\/app\/assets\/assets\/brand\/backgrounds\/home_desktop\.webp/);
});

test('self-contained: no external scripts, styles, fonts or frames', () => {
  assert.doesNotMatch(html, /<script[^>]*\bsrc=/i);
  assert.doesNotMatch(html, /<link[^>]*rel="stylesheet"/i);
  assert.doesNotMatch(html, /<iframe|@import|fonts\.googleapis|googletagmanager|gtag\(|fbq\(/i);
  for (const [, src] of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    if (src.startsWith('/')) continue;
    assert.ok(/^https:\/\/(keepitil\.com|apps\.apple\.com)\//.test(src), `unexpected origin: ${src}`);
  }
});

test('CSP pins the inline script by hash', () => {
  const hash = crypto.createHash('sha256').update(scriptMatch[1]).digest('base64');
  assert.match(html, new RegExp(`script-src 'sha256-${hash.replace(/[+/=]/g, '\\$&')}'`));
});

test('local files the page uses exist in this repository', () => {
  const files = [
    'app/tuitea/invite/tuitea_icon_256.png',
    'app/tuitea/invite/invite_card_1200x630.png',
  ];
  for (const f of files) assert.ok(fs.existsSync(path.join(root, f)), f);
});
