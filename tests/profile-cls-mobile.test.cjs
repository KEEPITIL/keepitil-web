// /profile layout shift on phones (CLS 0.2-0.7 at 390 before): the bio/about/links block, the feed panel and the partner shelf fill in after data loads and push everything below them. Space is reserved at phone widths only; nothing is hidden.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'profile.html'), 'utf8');
const RESERVE = [['.pf-meta', /min-height:\s*\d+px/], ['.pf-panel.active', /min-height:\s*\d+px/], ['.mono', /min-height:\s*\d+px/], ['main#main', /min-height:\s*100vh/]];
const QUERY = /@media\s*\(max-width:\s*768px\)\s*\{/g;
function inQuery(src) { const out = []; let m; QUERY.lastIndex = 0; while ((m = QUERY.exec(src))) { let d = 1, i = QUERY.lastIndex; while (i < src.length && d) { if (src[i] === '{') d++; else if (src[i] === '}') d--; i++; } out.push(src.slice(QUERY.lastIndex, i - 1)); } return out.join('\n'); }
const rules = (css) => css.split('}').map((r) => r.split('{')).filter((p) => p.length === 2).map((p) => [p[0].trim(), p[1]]);
const missing = (src) => RESERVE.filter(([sel, decl]) => !rules(inQuery(src)).some(([s, b]) => s === sel && decl.test(b))).map((x) => x[0]);
const baseCss = (src) => src.replace(/@media\s*\([^)]*\)\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, '');   // everything outside any media query
test('phones (max-width:768px) reserve space for the bio/about/links block, the feed panel, the partner shelf and main', () => { assert.deepEqual(missing(html), []); });
test('nothing is hidden to get there', () => { assert.ok(!/display:\s*none|visibility:\s*hidden|height:\s*0\b/.test(inQuery(html).split('\n').filter((l) => /min-height/.test(l)).join('\n'))); });
test('the phone reserve does not leak to desktop: the base (no-media) stylesheet carries none of these min-heights', () => {
  const base = baseCss(html);
  for (const [sel] of RESERVE) { const re = new RegExp('(^|[,}\\s])' + sel.replace(/[.#]/g, '\\$&') + '\\s*\\{[^}]*min-height:\\s*(?:172px|260px|282px|100vh)', 'm'); assert.ok(!re.test(base), sel); }
});
test('NEGATIVE CONTROL: the old stylesheet (no reserve) and a version with the reserve moved out of the query both fail', () => {
  const old = html.replace(/\/\* CLS \(phones only[\s\S]*?\n\}\n/, '');
  assert.ok(old.length < html.length); assert.deepEqual(missing(old).sort(), RESERVE.map((x) => x[0]).sort());
  const leaked = html.replace(/@media\(max-width:768px\)\{\n  \.pf-meta\{min-height:172px\}\n  \.pf-panel\.active\{min-height:260px\}\n  \.mono\{min-height:282px\}\n  main#main\{min-height:100vh\}\n\}\n/, '.pf-meta{min-height:172px}\n.pf-panel.active{min-height:260px}\n.mono{min-height:282px}\nmain#main{min-height:100vh}\n');
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
