// /profile desktop layout shift (CLS 0.13-0.49 at 1280 before): the feed, the partner shelf and the bio/about/links block fill in after data loads and pushed everything below them. Space is reserved at desktop widths only.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'profile.html'), 'utf8');
const RESERVE = [['.pf-panel.active', /min-height:\s*\d+px/], ['#shelf', /min-height:\s*\d+px/], ['.pf-meta', /min-height:\s*\d+px/], ['main#main', /min-height:\s*100vh/]];
// the desktop-only block(s): @media(min-width:769px){ ... } (one level of nesting)
function desktopCss(src) { const out = []; const re = /@media\s*\(min-width:\s*769px\)\s*\{/g; let m; while ((m = re.exec(src))) { let d = 1, i = re.lastIndex; while (i < src.length && d) { if (src[i] === '{') d++; else if (src[i] === '}') d--; i++; } out.push(src.slice(re.lastIndex, i - 1)); } return out.join('\n'); }
const outside = (src) => src.replace(/@media\s*\(min-width:\s*769px\)\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, '');
const missing = (src) => RESERVE.filter(([sel, decl]) => { const rule = desktopCss(src).split('}').map((r) => r.split('{')).find((p) => p[0] && p[0].trim() === sel); return !rule || !decl.test(rule[1]); }).map((x) => x[0]);

test('desktop (min-width:769px) reserves space for the feed panel, the partner shelf, the bio/about/links block and main', () => {
  assert.deepEqual(missing(html), []);
});
test('nothing is hidden to get there: no display:none / visibility:hidden / height:0 in the reserved rules', () => {
  const css = desktopCss(html); assert.ok(!/display:\s*none|visibility:\s*hidden|height:\s*0\b/.test(css));
});
test('the reserve is desktop only: the same min-height is not applied outside the 769px media query for those selectors', () => {
  const o = outside(html);
  for (const [sel] of RESERVE) { const re = new RegExp('(^|[,}\\s])' + sel.replace(/[.#]/g, '\\$&') + '\\s*\\{[^}]*min-height:\\s*(?:420px|72px|224px|100vh)', 'm'); assert.ok(!re.test(o), sel + ' must not carry the reserve outside the desktop query'); }
});
test('NEGATIVE CONTROL: the old stylesheet (no reserve) and a version with the reserve moved outside the media query both fail the checks', () => {
  const old = html.replace(/\/\* CLS \(desktop only[\s\S]*?\n\}\n/, '');
  assert.ok(old.length < html.length); assert.deepEqual(missing(old).sort(), RESERVE.map((x) => x[0]).sort());
  const leaked = html.replace(/@media\(min-width:769px\)\{\n  \.pf-panel\.active\{min-height:420px\}[\s\S]*?\n\}\n/, '.pf-panel.active{min-height:420px}\n');
  assert.ok(leaked !== html); assert.ok(missing(leaked).includes('.pf-panel.active'), 'moved out of the query: the desktop block no longer has it');
  assert.ok(new RegExp('(^|[,}\\s])\\.pf-panel\\.active\\s*\\{[^}]*min-height:\\s*420px', 'm').test(outside(leaked)), 'and it now applies on phones (the outside-the-query check would flag it)');
});
