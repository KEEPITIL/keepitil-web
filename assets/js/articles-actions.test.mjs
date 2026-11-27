/*
 * CSP migration, the article pages: onclick="kilShare('native')" on every article page became data-click="kilShare" data-a='["native","$el"]'.
 * kilShare used the implicit global `event.currentTarget` to flash a check mark on the share button after copying the link; a delegated listener's currentTarget is
 * the document, so the button now arrives as an argument (the old fallback is kept for any other caller).
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
function pages(d) { const out = []; for (const n of readdirSync(join(root, d))) { const p = join(d, n); if (statSync(join(root, p)).isDirectory()) out.push(...pages(p)); else if (/\.html$/.test(n)) out.push(p); } return out; }
const ALL = pages('article');
const SHARE = ALL.filter((p) => readFileSync(join(root, p), 'utf8').includes('function kilShare('));

test('every article page that defines kilShare has exactly one delegated share button, the allow-list entry, and kil-actions.js before the script that defines it', () => {
  assert.equal(SHARE.length, 24);
  for (const p of SHARE) {
    const h = readFileSync(join(root, p), 'utf8');
    assert.equal((h.match(/data-click="kilShare" data-a="\[&quot;native&quot;,&quot;\$el&quot;\]"/g) || []).length, 1, p);
    assert.equal((h.match(/KilActions\.allow\(\['kilShare'\]\)/g) || []).length, 1, p);
    const a = h.indexOf('/assets/js/kil-actions.js'), d = h.indexOf('function kilShare(');
    assert.ok(a > 0 && a < d && a < h.indexOf('KilActions.allow('), p);
  }
});

const INLINE = /\son(click|change|input|keydown|keyup|error|load|mouseover|mouseout|submit|focus|blur)\s*=/i;
test('control: the guard detects an inline handler', () => { assert.ok(INLINE.test("<button onclick=\"kilShare('native')\">")); assert.equal(INLINE.test('<button data-click="kilShare">'), false); });
test('no article page has an inline on*= handler attribute left', () => {
  const bad = [];
  for (const p of ALL) { const t = readFileSync(join(root, p), 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); if (INLINE.test(t)) bad.push(p); }
  assert.deepEqual(bad, []);
});

function share(extra) {
  const h = readFileSync(join(root, 'article/bleu/index.html'), 'utf8');
  const src = h.slice(h.indexOf('function kilShare('), h.indexOf('\n', h.indexOf('function kilShare(')));
  const log = []; const timers = [];
  const ctx = vm.createContext({ location: { href: 'https://keepitil.com/article/x/' }, document: { title: 'T' }, window: { open: (...a) => log.push(['open', a[0].slice(0, 30)]) }, encodeURIComponent, setTimeout: (f, ms) => timers.push([f, ms]), prompt: (m) => log.push(['prompt', m]),
    navigator: extra.navigator, event: extra.event });
  vm.runInContext(src, ctx); return { ctx, log, timers };
}
test('kilShare: native share when available, otherwise copies the link and flashes a check on the button that was passed in', async () => {
  const shared = []; const a = share({ navigator: { share: (o) => shared.push(o) } }); a.ctx.kilShare('native', {}); assert.deepEqual(shared.map((s) => s.url), ['https://keepitil.com/article/x/']);
  const copied = []; const btn = { textContent: 'Share' }; const b = share({ navigator: { clipboard: { writeText: (u) => copied.push(u) } } });
  b.ctx.kilShare('native', btn); assert.deepEqual(copied, ['https://keepitil.com/article/x/']); assert.equal(btn.textContent, '✓');
  b.timers[0][0](); assert.equal(btn.textContent, 'Share');
  // the old implicit-event path still works for any other caller; a delegated listener's currentTarget (document) is never used when the element is passed
  const docLike = { textContent: 'doc' }, real = { textContent: 'Share' }; const c = share({ navigator: { clipboard: { writeText() {} } }, event: { currentTarget: docLike } });
  c.ctx.kilShare('native', real); assert.equal(real.textContent, '✓'); assert.equal(docLike.textContent, 'doc');
  const d = share({ navigator: { clipboard: { writeText() {} } }, event: { currentTarget: real } }); real.textContent = 'Share'; d.ctx.kilShare('native'); assert.equal(real.textContent, '✓');
  const e = share({ navigator: {} }); e.ctx.kilShare('native', {}); assert.equal(e.log[0][0], 'prompt');
  const x = share({ navigator: {} }); x.ctx.kilShare('x', {}); assert.equal(x.log[0][0], 'open');
});
