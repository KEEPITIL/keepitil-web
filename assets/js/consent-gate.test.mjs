// Consent gate: no page may request Google Analytics (googletagmanager.com) or Microsoft Clarity (clarity.ms)
// outside the cookie-consent gate in keepitil-shell.js. Static check over every tracked .html/.js file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const TRACKER = /googletagmanager\.com|clarity\.ms/;
const files = execSync('git ls-files "*.html" "*.js"', { encoding: 'utf8' })
  .split('\n').filter(Boolean)
  .filter((f) => !f.startsWith('node_modules/') && !f.endsWith('.test.mjs'));

test('only keepitil-shell.js references the GA4 / Clarity hosts', () => {
  const offenders = files.filter((f) => f !== 'keepitil-shell.js' && TRACKER.test(readFileSync(f, 'utf8')));
  assert.deepEqual(offenders, [], 'these files load or name a tracker host outside the consent gate');
});

test('keepitil-shell.js injects GA4 and Clarity only from the consent-gated mount functions', () => {
  const src = readFileSync('keepitil-shell.js', 'utf8');
  const lines = src.split('\n');
  const injecting = lines
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => /googletagmanager\.com\/gtag\/js|clarity\.ms\/tag\//.test(l));
  assert.ok(injecting.length >= 2, 'expected GA4 and Clarity injection lines');
  for (const { i } of injecting) {
    // Walk back to the enclosing function declaration.
    let j = i;
    while (j >= 0 && !/function\s+__kil\w+\s*\(/.test(lines[j])) j--;
    const name = j >= 0 ? lines[j].match(/function\s+(__kil\w+)/)[1] : '(none)';
    assert.ok(['__kilMountGA4', '__kilMountClarity'].includes(name), `line ${i + 1} injects a tracker inside ${name}`);
    const body = lines.slice(j, i + 1).join('\n');
    assert.match(body, /__kilConsentChoice\(\)\s*!==\s*'accepted'\)\s*return/, `${name} must return unless consent is 'accepted'`);
    assert.match(body, /__kilGpcNo\(\)/, `${name} must honour Global Privacy Control`);
  }
});

test('no tracker is mounted on page load without a stored Accept', () => {
  const src = readFileSync('keepitil-shell.js', 'utf8');
  assert.doesNotMatch(src, /addEventListener\('load',[^)]*__kilMountAnalytics/, 'analytics must not mount on the load event');
  assert.match(src, /if\(choice==='accepted'\) __kilMountAnalytics\(\);/, 'mount only after a stored Accept');
  assert.match(src, /else __kilForgetAnalytics\(\);/, 'a decline must remove trackers and cookies');
});
