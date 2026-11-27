// axe empty-heading on /profile (pre-existing, NEXUS2's #370 read-back): h1#pfName was a space/&nbsp; placeholder until a name arrived, and on a not-found profile it never got one (an EMPTY heading). Grok 6:20: instead of aria-hidden, give it a visually hidden label ("Loading profile"; "Profile not found" on a soft 404) so axe is 0 in EVERY state, loading included.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), { JSDOM } = require('jsdom');
const R = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = R('profile.html');
const stmt = html.match(/if\(g\('pfName'\)\)\{ var _pn=g\('pfName'\);[^\n]*?\}   \/\*/);
const nf = html.match(/try\{ var _pf=document\.getElementById\('pfName'\);[^\n]*?\}catch\(e\)\{\}/);
const nameOf = (h) => h.textContent.replace(/[\s ]/g, '');
const emptyHeadings = (doc) => [...doc.querySelectorAll('h1,h2,h3,h4,h5,h6,[role=heading]')].filter((h) => !nameOf(h)).length;
const hiddenFromAT = (doc) => [...doc.querySelectorAll('[aria-hidden=true]')].filter((e) => e.querySelector('h1,h2,h3,h4,h5,h6') || /^H[1-6]$/.test(e.tagName)).length;

test('markup: the placeholder h1 has a visually hidden "Loading profile" label (a real accessible name), is not aria-hidden, and the label is off-screen CSS, not display:none', () => {
  const doc = new JSDOM(html).window.document, h = doc.getElementById('pfName');
  assert.equal(h.getAttribute('aria-hidden'), null);
  assert.equal(h.querySelector('.pf-vh').textContent, 'Loading profile');
  assert.equal(emptyHeadings(doc), 0);
  const rule = html.match(/\.pf-vh\{([^}]*)\}/)[1]; assert.ok(/position:absolute/.test(rule) && /clip:rect\(0,0,0,0\)/.test(rule) && !/display:\s*none|visibility:\s*hidden/.test(rule));
});
test('behaviour: a name replaces the label; no name keeps "Loading profile"; the soft-404 branch says "Profile not found" (the exact statements from the page are run)', () => {
  assert.ok(stmt, 'the pfName statement is in profile.html'); assert.ok(nf, 'the not-found statement is in profile.html');
  const mk = () => new JSDOM('<h1 id="pfName"><span class="pf-vh">Loading profile</span>&nbsp;</h1>').window.document;
  const run = (name) => { const doc = mk(); new Function('g', 'PROFILE', stmt[0].replace(/\s*\/\*$/, ''))((i) => doc.getElementById(i), { name }); return doc; };
  assert.equal(run('Groove Trooper').getElementById('pfName').textContent, 'Groove Trooper');
  for (const n of ['', undefined, null]) { const d = run(n); assert.equal(d.getElementById('pfName').querySelector('.pf-vh').textContent, 'Loading profile'); assert.equal(emptyHeadings(d), 0); }
  const d = mk(); new Function('document', nf[0])(d); assert.equal(d.getElementById('pfName').querySelector('.pf-vh').textContent, 'Profile not found'); assert.equal(emptyHeadings(d), 0);
});
test('no heading is aria-hidden anywhere in the shipped markup (the previous approach hid it from assistive tech)', () => {
  assert.equal(hiddenFromAT(new JSDOM(html).window.document), 0);
});
test('NEGATIVE CONTROL: the original placeholder (nbsp only) and the aria-hidden version are caught by the same checks', () => {
  const orig = new JSDOM('<h1 id="pfName">&nbsp;</h1>').window.document; assert.equal(emptyHeadings(orig), 1, 'original: empty heading');
  const hid = new JSDOM('<h1 id="pfName" aria-hidden="true">&nbsp;</h1>').window.document; assert.equal(hiddenFromAT(hid), 1, 'aria-hidden version: heading hidden from assistive tech');
  assert.equal(hid.getElementById('pfName').querySelector('.pf-vh'), null);
});
