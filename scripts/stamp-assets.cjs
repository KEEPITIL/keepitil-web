#!/usr/bin/env node
// Content-hash cache stamps for shared same-origin CSS/JS (Cloudflare serves them with max-age=14400, so a changed file behind an unchanged URL reaches returning visitors up to
// 4 h late). Every reference to a tracked asset in a page template is written as  <path>?v=h<8 hex of the file's content>.  A reference that already carries a MANUAL stamp
// (?v=20261125a) is left alone (the shell/radio/ai files keep their own pinned stamps), and so is nav-reserve.css (its own pin in tests/nav-first-paint.test.cjs).
//   node scripts/stamp-assets.cjs           rewrite the stamps in place
//   node scripts/stamp-assets.cjs --check   exit 1 and list every reference whose stamp is missing or does not match the file now (tests/asset-stamps.test.cjs runs this)
// Generated pages (event/, article/, app/, docs/) are not touched: their generators own them.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const SKIP_DIR = /^(node_modules|event|article|app|docs)\//;
const SKIP_ASSET = /^\/assets\/(css\/nav-reserve\.css|js\/keepitil-(radio|ai|feedback|social)\.js)$|^\/keepitil-shell\.js$/;   // own manual stamps (pinned by tests/shell-a11y.test.cjs, tests/nav-first-paint.test.cjs)
const REF = /((?:href|src)=")(\/(?:assets|games\/kbeats)\/[^"#?]*?\.(?:css|js))(\?v=[^"]*)?"/g;
const hash = (file) => crypto.createHash('sha1').update(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).digest('hex').slice(0, 8);
const tool = /^\?v=h[0-9a-f]{8}$/;
function pages() { return execSync("git ls-files '*.html'", { cwd: ROOT, encoding: 'utf8' }).split('\n').filter((f) => f && !SKIP_DIR.test(f)); }
function run(check) {
  const bad = []; let changed = 0, refs = 0;
  for (const f of pages()) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const out = src.replace(REF, (m, pre, asset, q) => {
      if (SKIP_ASSET.test(asset)) return m;
      if (q && !tool.test(q)) return m;                  // a manual stamp: not ours
      const file = path.join(ROOT, asset);
      if (!fs.existsSync(file)) return m;
      refs++; const want = '?v=h' + hash(file);
      if (q !== want) bad.push(f + ': ' + asset + (q ? ' ' + q : ' (no stamp)') + ' -> ' + want);
      return pre + asset + want + '"';
    });
    if (out !== src) { changed++; if (!check) fs.writeFileSync(path.join(ROOT, f), out); }
  }
  return { bad, changed, refs };
}
module.exports = { run, hash };
if (require.main === module) {
  const check = process.argv.includes('--check'); const r = run(check);
  if (check) { if (r.bad.length) { console.error('stale or missing asset stamps (run: node scripts/stamp-assets.cjs):\n' + r.bad.join('\n')); process.exit(1); } console.log('asset stamps OK: ' + r.refs + ' references'); }
  else console.log('stamped ' + r.refs + ' references, rewrote ' + r.changed + ' pages');
}
