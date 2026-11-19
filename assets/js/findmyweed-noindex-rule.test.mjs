// Launch gate G-2 (keepitil-web#191): the DRAFT Cloudflare rule in docs/findmyweed/cloudflare-noindex-rule.md must say
// exactly one thing: X-Robots-Tag "noindex, nofollow" for keepitil.com/findmyweed/* and nothing else. The doc's expression
// and its JSON must agree, and the expression must match the folder (pages, listings.json, images) but never the marketing
// page /findmyweed, /findmyweed.html, /findmyweed-* or the rest of the site. No Cloudflare call is made here or anywhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOC = fs.readFileSync(path.join(ROOT, 'docs', 'findmyweed', 'cloudflare-noindex-rule.md'), 'utf8');
const block = (lang) => { const m = new RegExp('```' + lang + '\\n([\\s\\S]*?)\\n```').exec(DOC.replace(/\r\n/g, '\n')); return m && m[1].trim(); };

// A tiny evaluator for the ONE expression shape this rule uses: host set membership AND starts_with on the URI path.
function compile(expr) {
  const m = /^\(http\.host in \{((?:"[^"]+"\s*)+)\} and starts_with\(http\.request\.uri\.path, "([^"]+)"\)\)$/.exec(expr);
  if (!m) throw new Error('unexpected expression shape: ' + expr);
  const hosts = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]), prefix = m[2];
  return (host, p) => hosts.includes(host) && p.startsWith(prefix);
}
const COVERED = ['/findmyweed/', '/findmyweed/index.html', '/findmyweed/results.html', '/findmyweed/listing.html', '/findmyweed/404.html',
  '/findmyweed/under21.html', '/findmyweed/data/listings.json', '/findmyweed/img/og-placeholder.png', '/findmyweed/icons/icon.svg',
  '/findmyweed/js/fmw.js', '/findmyweed/css/fmw.css', '/findmyweed/robots.txt', '/findmyweed/sitemap.xml'];
const NOT_COVERED = ['/findmyweed', '/findmyweed.html', '/findmyweed-join', '/findmyweed-directory.html', '/findmyweed-sample.html', '/',
  '/index.html', '/about.html', '/games/kmob/index.html', '/findmyweedx/'];
const check = (expr) => {
  const f = compile(expr), bad = [];
  for (const p of COVERED) for (const h of ['keepitil.com', 'www.keepitil.com']) if (!f(h, p)) bad.push('missed ' + h + p);
  for (const p of NOT_COVERED) if (f('keepitil.com', p)) bad.push('over-covers ' + p);
  for (const p of COVERED) if (f('evil.example', p)) bad.push('other host ' + p);
  return bad;
};

test('G-2: the drafted rule covers exactly keepitil.com/findmyweed/* (pages, listings.json, images), nothing else', () => {
  const expr = block('cloudflare-expression'), rule = JSON.parse(block('json'));
  assert.ok(expr, 'the doc has the expression');
  assert.equal(rule.expression, expr, 'the JSON and the written expression are the same rule');
  assert.deepEqual(check(expr), []);
  assert.equal(rule.action, 'rewrite');
  assert.deepEqual(rule.action_parameters, { headers: { 'X-Robots-Tag': { operation: 'set', value: 'noindex, nofollow' } } });
  assert.match(DOC, /DRAFT, NOT APPLIED/); assert.match(DOC, /never `PUT`|never replace/i, 'the doc warns against replacing the existing ruleset');
  // Sentinel round 8: a stable `ref` for the rule, and the case-sensitive path match stated (and true of the expression)
  assert.equal(rule.ref, 'fmw_g2_noindex'); assert.match(rule.ref, /^[a-z0-9_]{1,64}$/, 'ref is a short stable identifier');
  assert.deepEqual(Object.keys(rule), ['ref', 'description', 'expression', 'action', 'action_parameters', 'enabled'], 'no other field crept in');
  assert.match(DOC, /\*\*The path match is case-sensitive\.\*\*/);
  const f = compile(expr);
  assert.equal(f('keepitil.com', '/findmyweed/index.html'), true);
  assert.equal(f('keepitil.com', '/FindMyWeed/index.html'), false, 'case-sensitive, exactly as the doc says');
});

test('G-2 NEGATIVE CONTROLS: a broader, narrower or other-host rule is caught', () => {
  const expr = block('cloudflare-expression');
  assert.ok(check(expr.replace('"/findmyweed/"', '"/findmyweed"')).some((b) => b.startsWith('over-covers /findmyweed')), 'without the slash it would noindex the marketing page');
  assert.ok(check(expr.replace('"/findmyweed/"', '"/findmyweed/data/"')).some((b) => b.startsWith('missed')), 'too narrow misses the pages and images');
  assert.ok(check(expr.replace(' "www.keepitil.com"', '')).some((b) => b.startsWith('missed www.')), 'www must be covered too');
  assert.ok(check(expr.replace('"keepitil.com" "www.keepitil.com"', '"keepitil.com" "www.keepitil.com" "evil.example"')).some((b) => b.startsWith('other host')));
  assert.throws(() => compile('(http.request.uri.path contains "findmyweed")'), /unexpected expression shape/, 'any other shape is refused, not guessed');
});

test('G-2: nothing in the repo calls the Cloudflare API', () => {
  const hits = [];
  for (const dir of ['assets/js', 'scripts', '.github/workflows']) {
    const abs = path.join(ROOT, dir); if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs)) { const p = path.join(abs, f); if (fs.statSync(p).isFile() && /api\.cloudflare\.com/i.test(fs.readFileSync(p, 'utf8'))) hits.push(dir + '/' + f); }
  }
  assert.deepEqual(hits, []);
});
