// Live sweep 2026-11-27: images.ra.co (403 / ERR_BLOCKED_BY_ORB) was still requested from the Discover city sub-pages and the profile gallery. Every page that loads kil-discover.js loads the host list first,
// and the profile gallery builder goes through the same list.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (['node_modules', 'event', '_site', '.git'].includes(e.name)) continue; const p = path.join(d, e.name); e.isDirectory() ? walk(p, out) : /\.html$/.test(e.name) && out.push(p); } return out; };
test('every page that loads kil-discover.js loads kil-img-host.js BEFORE it', () => {
  const pages = walk(ROOT).filter((p) => fs.readFileSync(p, 'utf8').includes('kil-discover.js')); assert.ok(pages.length >= 4, pages.length + ' discover pages');
  for (const p of pages) { const h = fs.readFileSync(p, 'utf8'), a = h.indexOf('kil-img-host.js'), b = h.indexOf('kil-discover.js'); assert.ok(a > 0 && a < b, path.relative(ROOT, p)); }
  assert.ok(!('<script src="/assets/js/kil-discover.js" defer></script>'.indexOf('kil-img-host.js') >= 0), 'NEGATIVE CONTROL: a page with only the discover script would be caught by the pin above');
});
test('the profile gallery source goes through the denied-host list (images.ra.co gives no request)', () => {
  const html = fs.readFileSync(path.join(ROOT, 'profile.html'), 'utf8');
  assert.match(html, /function galSrc\(v\)\{var u=\(v\.indexOf\('http'\)===0\|\|v\.indexOf\('data:'\)===0\)\?v:'https:\/\/images\.ra\.co\/'\+v\+'\.jpg'; return \(typeof window!=='undefined'&&window\.KilImgHost&&window\.KilImgHost\.clean\)\?window\.KilImgHost\.clean\(u\):u;\}/);
  const H = require('../assets/js/kil-img-host.js'); assert.equal(H.clean('https://images.ra.co/x.jpg'), ''); assert.equal(H.clean('https://keepitil.com/a.jpg'), 'https://keepitil.com/a.jpg');
});
