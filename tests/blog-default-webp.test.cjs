const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const R = (p) => path.join(__dirname, '..', p);
test('profile event card: the default cover is the 744px WebP copy (31 KB), the full jpg stays as onerror fallback and on every other page', () => {
  const p = fs.readFileSync(R('profile.html'), 'utf8');
  assert.match(p, /var img=KH\(e\.cover\)\|\|'\/assets\/images\/blog-default-744\.webp';/);
  assert.match(p, /data-fb="src" data-fb-src="\/assets\/images\/blog-default\.jpg"/);
  assert.ok(fs.statSync(R('assets/images/blog-default-744.webp')).size < fs.statSync(R('assets/images/blog-default.jpg')).size / 4);
  assert.ok(fs.existsSync(R('assets/images/blog-default.jpg')), 'the jpg is untouched (culture, tests and og fallbacks use it)');
  const b = fs.readFileSync(R('assets/images/blog-default-744.webp')); assert.equal(b.slice(0, 4).toString(), 'RIFF'); assert.equal(b.slice(8, 12).toString(), 'WEBP');
});
