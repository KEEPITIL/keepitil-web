// Live axe sweep: the KBeats web pages had no <main> landmark (landmark-one-main + region). Run: node --test assets/js/kbeats-landmarks.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const PAGES = { 'games/kbeats/index.html': 'id="players"', 'games/kbeats/terms/index.html': '<h1>Terms of Play</h1>', 'games/kbeats/privacy/index.html': '<h1>', 'games/kbeats/artists/index.html': '<h1>For Artists</h1>', 'games/kbeats/artist-agreement/index.html': '<h1>', 'games/kbeats/submit/index.html': 'id="v-auth"' };
test('each KBeats page has exactly one <main> that holds the page content', () => {
  for (const [f, marker] of Object.entries(PAGES)) {
    const h = read(f); assert.equal((h.match(/<main\b/gi) || []).length, 1, f + ': one main'); assert.equal((h.match(/<\/main>/gi) || []).length, 1, f + ': closed once');
    const inside = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(h)[1]; assert.ok(inside.includes(marker), f + ': content inside main (' + marker + ')');
  }
  assert.equal((read('games/kbeats/terms/index.html').replace(/<\/?main\b[^>]*>/gi, '').match(/<main\b/gi) || []).length, 0, 'NEGATIVE CONTROL: without it there is none');
});
test('the landing page keeps its nav and footer outside main; the submit page keeps its header outside main and every view section inside', () => {
  const idx = read('games/kbeats/index.html'), main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(idx)[1];
  assert.ok(!/<nav\b/i.test(main) && !/<footer\b/i.test(main), 'landing: nav and footer outside'); for (const s of ['id="players"', 'id="how"', 'id="featured"', 'id="artists"', 'id="download"', 'id="faq"']) assert.ok(main.includes(s), s);
  const sub = read('games/kbeats/submit/index.html'), m2 = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(sub)[1];
  assert.ok(!/<header\b/i.test(m2), 'submit: header outside'); for (const s of ['id="v-auth"', 'id="v-dash"', 'id="v-flow"']) assert.ok(m2.includes(s), s);
});
