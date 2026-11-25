// axe empty-heading on /profile (pre-existing, NEXUS2's #370 read-back): h1#pfName is a space/&nbsp; placeholder until a name arrives, and on a not-found profile it never gets one, so it was an EMPTY heading next to the not-found card's real h1. It is aria-hidden while it has no name.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), { JSDOM } = require('jsdom');
const R = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = R('profile.html');
const m = html.match(/if\(g\('pfName'\)\)\{ var _pn=g\('pfName'\);[^\n]*?\}   \/\*/);
const emptyExposed = (doc) => [...doc.querySelectorAll('h1,h2,h3,h4,h5,h6,[role=heading]')].filter((h) => !h.closest('[aria-hidden=true]') && h.getAttribute('aria-hidden') !== 'true' && !h.textContent.replace(/[\s ]/g, '')).length;

test('the placeholder h1 is aria-hidden in the markup, so no empty heading is exposed before data or on a not-found page', () => {
  const doc = new JSDOM(html).window.document, h = doc.getElementById('pfName');
  assert.equal(h.getAttribute('aria-hidden'), 'true');
  assert.equal(emptyExposed(doc), 0);
});
test('behaviour: a name shows the heading; no name keeps it hidden (the exact statement from the page is run)', () => {
  assert.ok(m, 'the pfName statement is in profile.html');
  const run = (name) => { const doc = new JSDOM('<h1 id="pfName" aria-hidden="true">&nbsp;</h1>').window.document; const g = (i) => doc.getElementById(i); new Function('g', 'PROFILE', m[0].replace(/\s*\/\*$/, ''))(g, { name }); return doc; };
  const named = run('Groove Trooper'); assert.equal(named.getElementById('pfName').textContent, 'Groove Trooper'); assert.equal(named.getElementById('pfName').hasAttribute('aria-hidden'), false);
  const none = run(''); assert.equal(none.getElementById('pfName').getAttribute('aria-hidden'), 'true'); assert.equal(emptyExposed(none), 0);
  const nullName = run(undefined); assert.equal(emptyExposed(nullName), 0);
});
test('NEGATIVE CONTROL: the old markup and the old statement expose an empty heading', () => {
  const old = new JSDOM('<h1 id="pfName" style="margin:0">&nbsp;</h1>').window.document;
  assert.equal(emptyExposed(old), 1);
  const oldStmt = "if(g('pfName'))g('pfName').textContent=PROFILE.name||'\u00a0';";
  const doc = new JSDOM('<h1 id="pfName" aria-hidden="true">&nbsp;</h1>').window.document; new Function('g', 'PROFILE', oldStmt)((i) => doc.getElementById(i), { name: 'X' });
  assert.equal(doc.getElementById('pfName').getAttribute('aria-hidden'), 'true', 'the old statement leaves a named heading hidden from assistive tech (so the fix must remove aria-hidden)');
});
