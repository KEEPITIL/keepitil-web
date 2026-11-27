// Web 100% item 10 follow-up (best-practice, axe landmark-one-main + region): the profile page content sits in ONE <main>, the venue page's cover/content/sticky button all sit in landmarks.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const __A = require("./helpers/event-assembled.cjs").assemble;
const R = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const strip = (h) => h.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
const n = (h, re) => (strip(h).match(re) || []).length;

test('profile: exactly one <main>, opening before the back button and closing after the support shelf, with the nav and the shell footer outside it', () => {
  const p = __A(R('profile.html')); assert.equal(n(p, /<main\b/g), 1); assert.equal(n(p, /<\/main>/g), 1);
  const o = p.indexOf('<main id="main">'), c = p.indexOf('</main>'), nav = p.indexOf('<nav id="main-nav">'), back = p.indexOf('<button id="pfBack"'), shelf = p.indexOf('id="shelf"');
  assert.ok(nav > 0 && nav < o && o < back && back < shelf && shelf < c, 'order: nav, main open, back button, shelf, main close');
  assert.ok(p.indexOf('<div class="pf-head">') > o && p.indexOf('<div class="pf-head">') < c && p.indexOf('id="tab-chat"') > o && p.indexOf('id="tab-chat"') < c, 'header and tabs inside');
});
test('profile: main does not break the page scripts (no code looks the page up by body children, and the 404 helper writes into <main> instead of wiping the body)', () => {
  const p = __A(R('profile.html')); assert.doesNotMatch(strip(p) + (p.match(/<script>[\s\S]*?<\/script>/g) || []).join(''), /document\.body\.children|body\s*>\s*\.pf-|body\.firstElementChild/);
  assert.match(R('keepitil-shell.js'), /document\.querySelector\('main'\) \|\| document\.body/);
});
test('venue: one <main> holds the cover and the content; the sticky booking button is a named region (NEGATIVE CONTROL: the old markup has the cover and the button outside any landmark)', () => {
  const v = R('venue.html'); assert.equal(n(v, /<main\b/g), 1); assert.match(v, /<main id="v">\s*<div class="loading" id="loading">[\s\S]*?<div id="vBody" style="display:none">\s*<div class="v-cover" id="vCover"><\/div>/);
  assert.match(v, /<div class="sticky" id="sticky" role="region" aria-label="Request a booking">/);
  const old = '<div id="v"><div class="v-cover" id="vCover"></div><main class="wrap">x</main></div><div class="sticky" id="sticky"><button>Request booking</button></div>';
  assert.ok(old.indexOf('id="vCover"') < old.indexOf('<main'), 'old: the cover came before main'); assert.doesNotMatch(old, /role="region"/);
});

test('venue: a static (off-screen) h1 sits in the loading box before the fetch settles; the shared not-found state replaces it with the real heading (NEGATIVE CONTROL: the old markup has no h1 until data arrives)', () => {
  const v = R('venue.html');
  assert.match(v, /<div class="loading" id="loading"><h1 class="vh">Venue<\/h1>/);
  assert.match(v, /\.vh\{position:absolute/);
  const old = '<div class="loading" id="loading">Loading venue…</div>';
  assert.doesNotMatch(old, /<h1/);
});

test('venue: the loading box and the not-found card live INSIDE the one visible <main id=v>; only the loaded content (#vBody) is hidden until data arrives (NEGATIVE CONTROL: the old markup had them outside a hidden main)', () => {
  const { JSDOM } = require('jsdom');
  const v = R('venue.html'), d = new JSDOM(v).window.document;
  const mains = d.querySelectorAll('main'); assert.equal(mains.length, 1);
  const m = mains[0]; assert.equal(m.id, 'v'); assert.equal(m.getAttribute('style'), null, 'main is visible from first paint');
  assert.ok(m.contains(d.getElementById('loading')), 'loading box (and the not-found card, which renders into #loading) is inside main');
  assert.equal(d.getElementById('vBody').getAttribute('style'), 'display:none');
  assert.ok(m.contains(d.getElementById('vBody')) && d.getElementById('vBody').contains(d.getElementById('vCover')));
  assert.match(v, /\$\('loading'\)\.style\.display='none'; \$\('vBody'\)\.style\.display='block';/);
  assert.ok(!/\$\('v'\)\.style/.test(v), 'the script never hides or shows the whole main');
  assert.match(v, /into:'#loading'/, 'not-found renders into #loading');
  const old = '<div class="loading" id="loading">x</div><main id="v" style="display:none"></main>', od = new JSDOM(old).window.document;
  assert.equal(od.querySelector('main').contains(od.getElementById('loading')), false, 'old markup: loading outside main');
  assert.equal(od.querySelector('main').getAttribute('style'), 'display:none', 'old markup: main hidden');
});
