// F7: https://keepitil.com/apps must be a real page (it used to 301 to /apps/ and then 404,
// because apps/ had no index.html). Run: node --test assets/js/apps-index.test.mjs
// APPS_TEST_ROOT overrides the repo root (used for the negative control).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.APPS_TEST_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FILE = path.join(ROOT, 'apps', 'index.html');
const exists = () => fs.existsSync(FILE);
const html = () => fs.readFileSync(FILE, 'utf8');

function resolveLocal(ref) {
  const r = ref.replace(/[?#].*$/, '');
  if (!r.startsWith('/')) return null;
  const p = path.join(ROOT, ...r.split('/').filter(Boolean));
  if (r.endsWith('/') || (fs.existsSync(p) && fs.statSync(p).isDirectory())) return path.join(p, 'index.html');
  return p;
}

test('apps/index.html exists', () => {
  assert.ok(exists(), 'apps/index.html is missing: /apps/ would 404');
});

test('internal links and assets all resolve to files in the repo', () => {
  assert.ok(exists(), 'apps/index.html is missing');
  const refs = [...html().matchAll(/\b(?:href|src)\s*=\s*"([^"]*)"/gi)].map((m) => m[1])
    .filter((r) => !/^(https?:|mailto:|tel:|data:|#)/i.test(r));
  assert.ok(refs.length >= 3, 'expected at least the TUITEA links');
  for (const r of refs) {
    const f = resolveLocal(r);
    assert.ok(f, `non-root-relative local reference: ${r}`);
    assert.ok(fs.existsSync(f), `dangling link ${r} -> ${path.relative(ROOT, f)}`);
  }
  const hrefs = [...html().matchAll(/\bhref\s*=\s*"([^"]*)"/gi)].map((m) => m[1]);
  assert.ok(hrefs.includes('/app/tuitea/'));
  assert.ok(hrefs.includes('/apps/tuitea/support/'));
});

test('is indexable with the correct canonical', () => {
  assert.ok(exists(), 'apps/index.html is missing');
  const h = html();
  assert.doesNotMatch(h, /<meta[^>]+name=["']robots["'][^>]*noindex/i);
  assert.match(h, /<link rel="canonical" href="https:\/\/keepitil\.com\/apps\/"\s*\/?>/);
  assert.doesNotMatch(h, /http-equiv=["']refresh/i, 'must be a real page, not a redirect');
});

test('does not mention kaitarako (unlisted app)', () => {
  assert.ok(exists(), 'apps/index.html is missing');
  assert.doesNotMatch(html(), /kai[\s_-]*tarako/i);
});

test("hub links on to the full /app/ catalog (apps and games) as a visible button", () => {
  assert.ok(exists(), "apps/index.html is missing");
  assert.match(html(), /<a class="cta" href="\/app\/">Browse all apps and games<\/a>/);
  assert.ok(fs.existsSync(path.join(ROOT, "app", "index.html")), "/app/ must exist");
});

test('A11Y: exactly one main landmark holds the hero, the app cards and the browse link (the header and footer stay outside it)', () => {
  assert.ok(exists(), 'apps/index.html is missing');
  const h = html();
  assert.equal((h.match(/<main\b/gi) || []).length, 1, 'one <main>');
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(h)[1];
  for (const part of ['class="hero"', 'class="gridapps"', 'class="more"']) assert.ok(main.includes(part), part + ' is inside main');
  assert.ok(!/<header\b/i.test(main) && !/<footer\b/i.test(main), 'header and footer are outside main');
  // NEGATIVE CONTROL: the page without a main landmark is caught
  assert.equal((h.replace(/<\/?main\b[^>]*>/gi, '').match(/<main\b/gi) || []).length, 0);
});
