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
