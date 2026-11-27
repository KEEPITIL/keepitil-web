const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const xml = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
function exists(u) {
  const x = new URL(u); let p = decodeURIComponent(x.pathname);
  if (p === '/') p = '/index';
  const base = path.join(root, p.replace(/\/$/, ''));
  return [base + '.html', path.join(base, 'index.html'), base].some((f) => fs.existsSync(f) && fs.statSync(f).isFile());
}
test('every sitemap.xml URL on keepitil.com maps to a real page in the repo (live sweep found /article/artist/rab3l/ listed but 404)', () => {
  assert.ok(locs.length > 30);
  const missing = locs.filter((u) => new URL(u).origin === 'https://keepitil.com' && !exists(u));
  assert.deepEqual(missing, [], 'sitemap lists pages that do not exist: ' + missing.join(', '));
});
test('NEGATIVE CONTROL: the check does catch a missing page', () => { assert.equal(exists('https://keepitil.com/article/artist/not-a-real-page/'), false); assert.equal(exists('https://keepitil.com/article/artist/swerve/'), true); });
