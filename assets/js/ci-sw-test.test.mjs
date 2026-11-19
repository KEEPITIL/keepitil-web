// Sentinel W-3 (keepitil-web#191), reused for the Kai Tarako drop-in (games/kai/): CI must run the service-worker isolation test, not only assets/js/*.test.mjs.
// This guard lives in assets/js, so the existing CI step runs it, and it fails if the SW step is removed from node-tests.yml.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const STEP = /^\s*- run: node --test tests\/sw-cache-isolation\.test\.cjs\s*$/m;
const runsSwTest = (yml) => STEP.test(yml);

test('node-tests.yml runs the service-worker isolation test, and that test file exists', () => {
  const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'node-tests.yml'), 'utf8');
  assert.ok(runsSwTest(yml), 'CI step present');
  assert.ok(fs.existsSync(path.join(ROOT, 'tests', 'sw-cache-isolation.test.cjs')), 'test file present');
  assert.match(fs.readFileSync(path.join(ROOT, 'tests', 'sw-cache-isolation.test.cjs'), 'utf8'), /never caches or answers \/games\/kai\//, 'it covers /games/kai/');
  // NEGATIVE CONTROLS: the same workflow without the step, or with it commented out, is caught
  assert.equal(runsSwTest(yml.replace(STEP, '')), false, 'step removed');
  assert.equal(runsSwTest(yml.replace('      - run: node --test tests/sw-cache-isolation.test.cjs', '      # - run: node --test tests/sw-cache-isolation.test.cjs')), false, 'step commented out');
});
