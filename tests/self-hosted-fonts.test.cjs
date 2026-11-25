// No page asks Google for fonts: every font is served from /assets/fonts via /assets/css/fonts.css.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
function walk(d, out = []) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (['node_modules', '.git'].includes(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else out.push(p); } return out; }
const html = walk(root).filter((f) => f.endsWith('.html')), css = fs.readFileSync(path.join(root, 'assets/css/fonts.css'), 'utf8');
const rel = (f) => path.relative(root, f);

test('no HTML page loads or preconnects to fonts.googleapis.com / fonts.gstatic.com (the TUITEA Flutter app index only mentions it in a comment)', () => {
  for (const f of html) { const s = fs.readFileSync(f, 'utf8').replace(/\/\*[^]*?\*\//g, ''); if (rel(f) === 'app/tuitea/app/index.html') continue;
    assert.doesNotMatch(s, /fonts\.(googleapis|gstatic)\.com/, rel(f)); }
});
test('every page that uses a site font links the one local stylesheet; no page loads it twice', () => {
  const withLink = html.filter((f) => fs.readFileSync(f, 'utf8').includes('/assets/css/fonts.css'));
  assert.ok(withLink.length >= 60, 'rewritten pages: ' + withLink.length);
  for (const f of withLink) assert.equal((fs.readFileSync(f, 'utf8').match(/\/assets\/css\/fonts\.css/g) || []).length, 1, rel(f));
});
test('fonts.css: only same-origin woff2, display swap, every file exists, no remote URL', () => {
  const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]); assert.ok(urls.length >= 16);
  for (const u of urls) { assert.match(u, /^\/assets\/fonts\/[a-z0-9-]+\.woff2$/, u); assert.ok(fs.existsSync(path.join(root, u)), u + ' exists'); }
  assert.doesNotMatch(css, /url\(https?:/); assert.equal((css.match(/@font-face/g) || []).length, (css.match(/font-display: swap/g) || []).length);
});
test('all families the pages ask for are declared', () => {
  const used = new Set(); for (const f of html) for (const m of fs.readFileSync(f, 'utf8').matchAll(/font-family:\s*['"]?(Anton|Archivo|Bebas Neue|Fraunces|Inter|Lilita One|Nunito|Space Grotesk)\b/g)) used.add(m[1]);
  for (const fam of used) assert.ok(css.includes("font-family: '" + fam + "'"), fam + ' declared');
  assert.ok(used.size >= 4);
});
test('negative control: a Google link would be caught', () => { assert.match('<link href="https://fonts.googleapis.com/css2?family=Inter">', /fonts\.(googleapis|gstatic)\.com/); });
