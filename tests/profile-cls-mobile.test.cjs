// /profile layout shift on phones (CLS 0.2-0.7 at 390 before): the bio/about/links block, the feed panel and the partner shelf fill in after data loads and push everything below them. Space is reserved at phone widths only; nothing is hidden.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'profile.html'), 'utf8');
const RESERVE = [['.pf-panel.active', /min-height:\s*\d+px/], ['.mono', /min-height:\s*\d+px/], ['main#main', /min-height:\s*100vh/]];
const QUERY = /@media\s*\(max-width:\s*768px\)\s*\{/g;
function inQuery(src) { const out = []; let m; QUERY.lastIndex = 0; while ((m = QUERY.exec(src))) { let d = 1, i = QUERY.lastIndex; while (i < src.length && d) { if (src[i] === '{') d++; else if (src[i] === '}') d--; i++; } out.push(src.slice(QUERY.lastIndex, i - 1)); } return out.join('\n'); }
const rules = (css) => css.split('}').map((r) => r.split('{')).filter((p) => p.length === 2).map((p) => [p[0].trim(), p[1]]);
const missing = (src) => RESERVE.filter(([sel, decl]) => !rules(inQuery(src)).some(([s, b]) => s === sel && decl.test(b))).map((x) => x[0]);
const baseCss = (src) => src.replace(/@media\s*\([^)]*\)\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, '');   // everything outside any media query
test('phones (max-width:768px) reserve space for the feed panel, the partner shelf and main (the bio/about block is CLAMPED instead of reserved, no blank space)', () => { assert.deepEqual(missing(html), []); });
test('nothing is hidden to get there', () => { assert.ok(!/display:\s*none|visibility:\s*hidden|height:\s*0\b/.test(inQuery(html).split('\n').filter((l) => /min-height/.test(l)).join('\n'))); });
test('the phone reserve does not leak to desktop: the base (no-media) stylesheet carries none of these min-heights', () => {
  const base = baseCss(html);
  for (const [sel] of RESERVE) { const re = new RegExp('(^|[,}\\s])' + sel.replace(/[.#]/g, '\\$&') + '\\s*\\{[^}]*min-height:\\s*(?:260px|282px|100vh)', 'm'); assert.ok(!re.test(base), sel); }
});
test('NEGATIVE CONTROL: the old stylesheet (no reserve) and a version with the reserve moved out of the query both fail', () => {
  const old = html.replace(/\/\* CLS \(phones only[\s\S]*?\n\}\n/, '');
  assert.ok(old.length < html.length); assert.deepEqual(missing(old).sort(), RESERVE.map((x) => x[0]).sort());
  const leaked = html.replace(/@media\(max-width:768px\)\{\n  \.pf-panel\.active\{min-height:260px\}[\s\S]*?\n  \.mono\{min-height:282px\}\n  main#main\{min-height:100vh\}\n\}\n/, '.pf-panel.active{min-height:260px}\n.mono{min-height:282px}\nmain#main{min-height:100vh}\n');
  assert.ok(leaked !== html); assert.deepEqual(missing(leaked).sort(), RESERVE.map((x) => x[0]).sort(), 'moved out of the query: the phone block no longer has them');
  assert.ok(/(^|[}\s])\.mono\s*\{[^}]*min-height:\s*282px/m.test(baseCss(leaked)), 'and they now apply on desktop (the leak check would flag it)');
});

// Company call (b) (Grok 7:00): on phones the follow/message buttons sit ABOVE the bio, so about/links text that fills in later cannot push them down.
const orderOf = (src, sel) => { const css = src.slice(src.lastIndexOf('@media(max-width:768px){')); const m = css.match(new RegExp(sel.replace(/[.#]/g, '\\$&') + '\\{order:(\\d+)')); return m ? Number(m[1]) : null; };
test('phone stack order: category chips (1) < follow/message buttons (2) < bio/about (3) < links (4)', () => {
  const o = { bc: orderOf(html, '.pf-bcrow'), cta: orderOf(html, '.pf-cta'), bio: orderOf(html, '.pf-bio'), links: orderOf(html, '#pfLinks') };
  assert.deepEqual(o, { bc: 1, cta: 2, bio: 3, links: 4 });
  assert.ok(o.cta < o.bio && o.cta < o.links);
});
test('NEGATIVE CONTROL: the previous layout (.pf-cta{order:4}, under the links) fails the order check', () => {
  const old = html.replace(/\.pf-cta\{order:2\}/, '.pf-cta{order:4}');
  assert.ok(old !== html); assert.equal(orderOf(old, '.pf-cta'), 4); assert.ok(!(orderOf(old, '.pf-cta') < orderOf(old, '.pf-bio')));
});


// ---- Bio clamp (Grok 7:20): 3 lines on phones + a real "More" button, only when the text overflows; full text stays in the DOM; desktop never clamps ----
const { JSDOM } = require('jsdom');
const clampSrc = html.match(/\/\*PF-CLAMP-START\*\/([\s\S]*?)\/\*PF-CLAMP-END\*\//)[1];
function page(opts) {
  const dom = new JSDOM('<div class="pf-meta"><div id="pfBio">' + (opts.bio || '&nbsp;') + '</div><div id="pfAbout" style="display:block">' + (opts.about || '') + '</div></div>', { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window; w.matchMedia = () => ({ matches: !!opts.phone, addEventListener() {} });
  const over = { pfBio: !!opts.bioOver, pfAbout: !!opts.aboutOver };
  for (const id of ['pfBio', 'pfAbout']) { const el = w.document.getElementById(id); Object.defineProperty(el, 'scrollHeight', { get: () => (over[id] && !el.classList.contains('pf-open') ? 200 : 60) }); Object.defineProperty(el, 'clientHeight', { get: () => 60 }); }
  w.eval(clampSrc); return w;
}
test('clamp: a long about on a phone gets a More <button> with aria-controls and aria-expanded=false; the full text stays in the DOM', () => {
  const w = page({ phone: true, about: 'long text '.repeat(80), aboutOver: true }), d = w.document;
  const b = d.getElementById('pfAboutMore'); assert.ok(b); assert.equal(b.tagName, 'BUTTON'); assert.equal(b.type, 'button');
  assert.equal(b.getAttribute('aria-controls'), 'pfAbout'); assert.equal(b.getAttribute('aria-expanded'), 'false'); assert.equal(b.textContent, 'More');
  assert.ok(d.getElementById('pfAbout').textContent.length > 700, 'full text still in the DOM');
  assert.equal(d.getElementById('pfBioMore'), null, 'no button for a bio that does not overflow');
});
test('clamp: clicking toggles .pf-open and aria-expanded and the label; keyboard (Enter/Space on a <button>) is the native click', () => {
  const w = page({ phone: true, about: 'x '.repeat(300), aboutOver: true }), d = w.document, b = d.getElementById('pfAboutMore'), el = d.getElementById('pfAbout');
  b.click(); assert.equal(b.getAttribute('aria-expanded'), 'true'); assert.ok(el.classList.contains('pf-open')); assert.equal(b.textContent, 'Less');
  b.click(); assert.equal(b.getAttribute('aria-expanded'), 'false'); assert.ok(!el.classList.contains('pf-open')); assert.equal(b.textContent, 'More');
});
test('clamp: only shown when the text overflows (short text, empty bio, hidden about: no button); desktop: never clamps and never adds a button', () => {
  const short = page({ phone: true, about: 'short', aboutOver: false }); assert.equal(short.document.getElementById('pfAboutMore'), null); assert.equal(short.document.getElementById('pfBioMore'), null);
  const desk = page({ phone: false, about: 'long '.repeat(300), aboutOver: true, bio: 'long bio '.repeat(100), bioOver: true });
  assert.equal(desk.document.getElementById('pfAboutMore'), null); assert.equal(desk.document.getElementById('pfBioMore'), null);
  const phoneCss = html.slice(html.indexOf('/* The bio and the about text are clamped'));
  assert.match(phoneCss, /#pfBio:not\(\.pf-open\),#pfAbout:not\(\.pf-open\)\{max-height:4\.5em;overflow:hidden/);
  assert.ok(html.indexOf('/* The bio and the about text are clamped') > html.indexOf('@media(max-width:768px){\n  .pf-panel.active'), 'the clamp CSS sits inside the phone media block');
  assert.match(html, /\.pf-more\{display:none\}/, 'off phones the toggle is hidden even if it existed');
});
test('NEGATIVE CONTROL: with the overflow check removed (always add the button) a short text would get a useless More; the real check does not', () => {
  const always = clampSrc.replace('(open || el.scrollHeight > el.clientHeight + 1)', 'true');
  assert.notEqual(always, clampSrc);
  const w = new JSDOM('<div id="pfBio">&nbsp;</div><div id="pfAbout" style="display:block">short</div>', { runScripts: 'outside-only' }).window; w.matchMedia = () => ({ matches: true, addEventListener() {} }); w.eval(always);
  assert.ok(w.document.getElementById('pfAboutMore'), 'the broken variant adds a button to short text');
});
