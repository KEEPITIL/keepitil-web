/*
 * CSP migration, the leftovers found by the repo-wide sweep after the page-by-page PRs: handlers that were SET FROM JS as attributes
 * (culture feed cards: setAttribute('onclick' / 'onerror'), and an onerror inside a template string), the feedback widget's Close button, and two kbeats screens.
 * Plus the repo-wide guard: no shipped page or script may produce an inline handler attribute or javascript: URL.
 * (Handlers assigned as PROPERTIES, el.onclick = function, are not inline code and are allowed by a strict script-src; games/kwars uses only those.)
 */
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

test('culture feed cards: like / reshare / save / share are data-click + JSON data-a set from JS, ids are never spliced into code', () => {
  const h = read('culture/index.html');
  assert.doesNotMatch(h, /setAttribute\(\s*['"]on[a-z]+['"]/);
  const a = h.indexOf("var on = function(sel, name, args){"), z = h.indexOf("var box = document.createElement('div');", a);
  const src = h.slice(a, z);
  const made = []; const frag = { querySelector: (sel) => { const attrs = {}; const el = { setAttribute: (k, v) => { attrs[k] = v; } }; made.push([sel, attrs]); return el; } };
  const evil = `x');alert(1);('"><img src=x onerror=alert(1)>`;
  const ctx = vm.createContext({ frag, pid: evil, n: { href: 'https://example.com/a?b=\'c' }, safeHref: (u) => u, String, JSON });
  vm.runInContext(src, ctx);
  assert.deepEqual(made.map((m) => [m[0], m[1]['data-click']]), [['.fba-like', 'fbLike'], ['.fba-resh', 'fbReshareL'], ['.fba-share', 'fbShare'], ['.fb-save', 'fbSaveL']]);
  assert.deepEqual(JSON.parse(made[0][1]['data-a']), [evil, '$el']); assert.deepEqual(JSON.parse(made[2][1]['data-a']), ["https://example.com/a?b='c"]);
  assert.ok(made.every((m) => !('onclick' in m[1])));
  assert.match(h, /KilActions\.allow\(\[[^\]]*"fbLike", "fbReshareL", "fbSaveL", "fbShare"\]\)/);
});
test('culture: thumbnails fall back through data-fb="src" (set from JS and in the related-items template), the fallback script is loaded', () => {
  const h = read('culture/index.html');
  assert.match(h, /el\.setAttribute\('data-fb', 'src'\); el\.setAttribute\('data-fb-src', '\/assets\/images\/blog-default\.jpg'\)/);
  assert.match(h, /data-fb="src" data-fb-src="\/assets\/images\/blog-default\.jpg"\/>/);
  assert.ok(h.indexOf('/assets/js/kil-img-fallback.js') > 0 && h.indexOf('/assets/js/kil-img-fallback.js') < h.indexOf('KilActions.allow('));
});
test('feedback widget: the thank-you Close button is wired with addEventListener, no inline code', () => {
  const s = read('assets/js/keepitil-feedback.js');
  assert.doesNotMatch(s, /\sonclick=/);
  assert.match(s, /id="kil-fb-close" type="button">Close<\/button>/); assert.match(s, /getElementById\('kil-fb-close'\)\.addEventListener\('click'/);
});
test('kbeats: the Genres tab and the sign-in form no longer carry inline handlers', () => {
  const s = read('games/kbeats/js/app.js');
  assert.doesNotMatch(s, /\sonclick=["']|\sonsubmit=["']/);
  assert.match(s, /<button role="tab" data-go="#\/genres">Genres<\/button>/); assert.match(s, /\[data-go\]'\)\.forEach\(b => b\.onclick = \(\) => \{ location\.hash = b\.dataset\.go; \}\)/);
  assert.match(s, /\$\('#authf'\)\.addEventListener\('submit', \(e\) => e\.preventDefault\(\)\)/);
});

/* ---------- repo-wide guard ---------- */
const INLINE_ATTR = /[\s"'`](on(?:click|dblclick|change|input|keydown|keyup|keypress|submit|error|load|focus|blur|mouseover|mouseout|mouseenter|mouseleave|touchstart|touchend|pointerdown|pointerup|contextmenu|toggle|scroll|wheel|resize|select|play|pause|ended))\s*=\s*\\?["']/i;
const SET_ATTR = /setAttribute\(\s*['"]on[a-z]+['"]/;
const JS_URL = /(?:href|src|action|formaction)\s*=\s*\\?["']\s*javascript:/i;
const strip = (t) => t.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
function offenders(files) {
  const out = [];
  for (const f of files) { const t = strip(read(f)); if (INLINE_ATTR.test(t) || SET_ATTR.test(t) || JS_URL.test(t)) out.push(f); }
  return out;
}
test('control: the guard flags every shape of inline handler', () => {
  for (const bad of ['<button onclick="x()">', "'<img onerror=\"this.src=1\">'", "html = '<form onsubmit=\\\"return false\\\">'", 'el.setAttribute("onclick", fn)', "<a href=\"javascript:alert(1)\">", '<input oninput = "f()">'])
    assert.ok(INLINE_ATTR.test(bad) || SET_ATTR.test(bad) || JS_URL.test(bad), bad);
  for (const ok of ['<button data-click="x">', 'el.onclick = function () {}', 'b.onclick = () => go()', "const once = true; return false", 'addEventListener("click", f)', 'comment: onclick="x" is gone'.replace(/^/, '/* ') + ' */'])
    assert.ok(!(INLINE_ATTR.test(strip(ok)) || SET_ATTR.test(strip(ok)) || JS_URL.test(strip(ok))), ok);
});
test('no shipped page or script produces an inline handler attribute, a setAttribute("on...") or a javascript: URL (self-contained apps and vendored code excluded)', () => {
  const files = execSync('git ls-files "*.html" "*.js" "*.mjs"', { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean)
    .filter((f) => !/^(app|apps|node_modules|tests?|docs)\//.test(f) && !/\.test\.m?js$/.test(f) && !/\.min\.js$/.test(f) && !/(^|\/)vendor\//.test(f) && !/^games\/kwars\/src\/vendor\//.test(f) && !/^tools\//.test(f) && !/^scripts\//.test(f));
  assert.ok(files.length > 1000, 'scan sees the site (' + files.length + ' files)');
  assert.deepEqual(offenders(files), []);
});
