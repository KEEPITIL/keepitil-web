/*
 * earn/index.html renderPls: the "SET DEFAULT" and "x" buttons called setDefaultPlaylist / rmPlaylist, which were removed on 2026-08-21 and are defined nowhere, so they did
 * nothing (a console ReferenceError). They are no longer rendered; the default playlist keeps a plain, non-interactive DEFAULT label.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const PAGE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../earn/index.html'), 'utf8');
const a = PAGE.indexOf('function renderPls(){');
let z = PAGE.indexOf('{', a) + 1; for (let d = 1; d > 0; z++) { if (PAGE[z] === '{') d++; else if (PAGE[z] === '}') d--; }   // end of the function by brace matching
const escSrc = PAGE.slice(PAGE.indexOf('function esc(s)'), PAGE.indexOf('\n', PAGE.indexOf('function esc(s)')));

async function render(rows) {
  const el = { innerHTML: '' };
  const ctx = vm.createContext({ document: { getElementById: (id) => (id === 'plList' ? el : null) }, plGate: () => true, kilAuthHeaders: () => ({}), PL_API: '/x', window: {}, console,
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(rows) }) });
  vm.runInContext(escSrc + '\n' + PAGE.slice(a, z) + '\nthis.renderPls=renderPls;', ctx);
  ctx.renderPls(); await new Promise((r) => setTimeout(r, 20)); return el.innerHTML;
}
const ROWS = [{ id: 1, name: 'Warm-up <b>mix</b>', url: 'https://soundcloud.com/a/sets/x', art: null, is_default: true }, { id: 2, name: 'Peak', url: 'https://soundcloud.com/a/sets/y', art: null, is_default: false }];

test('playlist cards render no buttons and no handler for the removed functions; the default one is labelled DEFAULT', async () => {
  const html = await render(ROWS);
  assert.equal((html.match(/class="station card"/g) || []).length, 2);
  assert.equal(/<button/i.test(html), false, 'no buttons');
  assert.equal(/SET DEFAULT|rmPlaylist|setDefaultPlaylist|data-click|onclick/i.test(html), false);
  assert.equal((html.match(/>DEFAULT</g) || []).length, 1);
  assert.match(html, /Warm-up &lt;b&gt;mix&lt;\/b&gt;/, 'names stay escaped');
});
test('control: the old markup would have been caught by the same assertions', () => {
  const old = '<button class="chip soon" onclick="setDefaultPlaylist(2)">SET DEFAULT</button><button onclick="rmPlaylist(2)">&times;</button>';
  assert.ok(/<button/i.test(old) && /SET DEFAULT|rmPlaylist|setDefaultPlaylist|onclick/i.test(old));
});
test('the page source no longer mentions the two removed functions except in the explanatory comments', () => {
  const code = PAGE.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(code, /setDefaultPlaylist|rmPlaylist/);
});
