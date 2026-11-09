import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const s = readFileSync(new URL('../earn/index.html', import.meta.url), 'utf8');
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
test('tile sits outside #affGrid, which paintPartners() overwrites', () => {
  const grid = s.indexOf('id="affGrid"'), kit = s.indexOf('id="kitAffiliate"');
  assert.ok(grid > 0 && kit > grid);
  assert.match(s.slice(grid, kit), /<\/div>\s*<!--[\s\S]*?-->\s*<div class="grid g-cards" id="affKit"/);
});
