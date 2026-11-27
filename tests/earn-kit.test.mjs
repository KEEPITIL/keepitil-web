import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire as __cr } from 'node:module';
const __assemble = __cr(import.meta.url)('../tests/helpers/event-assembled.cjs').assemble;
const s = __assemble(readFileSync(new URL('../earn/index.html', import.meta.url), 'utf8'));
const tag = /<a [^>]*id="kitAffiliate"[^>]*>/.exec(s)?.[0] || '';
test('Kit tile exists once with the exact partner link', () => {
  assert.equal((s.match(/partners\.kit\.com/g) || []).length, 1);
  assert.match(tag, /href="https:\/\/partners\.kit\.com\/9goaxz09kexk"/);
});
test('affiliate link is rel="noopener sponsored" with no noreferrer', () => {
  assert.match(tag, /rel="noopener sponsored"/);
  assert.ok(!/noreferrer/.test(tag));
});
test('the tile states the 50% / 12 months terms and carries a visible disclosure chip', () => {
  assert.match(s, /earn 50% commission for the first 12 months/);
  assert.match(s, /<span class="chip">Affiliate link<\/span>/);
});
test('tile is a slide INSIDE the #affGrid carousel and paintPartners() re-appends it (Joe 2026-11-20)', () => {
  const grid = s.indexOf('id="affGrid"'), kit = s.indexOf('id="kitAffiliate"');
  assert.ok(grid > 0 && kit > grid);
  assert.ok(!/<div[^>]*id="affGrid"[^>]*><\/div>/.test(s), '#affGrid is not an empty sibling of the tile');
  assert.ok(!/id="affKit"/.test(s), 'no standalone Kit grid');
  assert.match(s, /KEEP_SLIDES=\['kitAffiliate'/);
  assert.match(s, /KEEP_SLIDES\.forEach\(function\(n\)\{ grid\.appendChild\(n\); \}\);/);
});
