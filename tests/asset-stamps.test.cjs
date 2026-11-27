const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path');
const { run, hash } = require('../scripts/stamp-assets.cjs');
test('every page template reference to a tracked CSS/JS asset carries ?v=h<content hash> that matches the file NOW (Cloudflare caches these for 4 h); fix with: node scripts/stamp-assets.cjs', () => {
  const r = run(true);
  assert.ok(r.refs > 90, 'found ' + r.refs + ' references');
  assert.deepEqual(r.bad, [], 'stale or missing stamps (run node scripts/stamp-assets.cjs and commit the pages):\n' + r.bad.join('\n'));
});
test('NEGATIVE CONTROL: the hash follows the file content and ignores CRLF', () => {
  const f = path.join(os.tmpdir(), 'stamp-' + process.pid + '.css'); fs.writeFileSync(f, 'a{b:c}\n'); const h1 = hash(f);
  fs.writeFileSync(f, 'a{b:d}\n'); assert.notEqual(hash(f), h1, 'changed content, new stamp');
  fs.writeFileSync(f, 'a{b:c}\r\n'); assert.equal(hash(f), h1, 'CRLF checkout does not change the stamp'); fs.unlinkSync(f);
});
test('manual stamps stay manual: shell, radio, ai and nav-reserve are not rewritten by the tool', () => {
  const { execSync } = require('child_process');
  const out = execSync("git ls-files '*.html'", { cwd: path.join(__dirname, '..'), encoding: 'utf8' }).split('\n').filter((f) => f && !/^(node_modules|event|article|app|docs)\//.test(f));
  for (const f of out) { const h = fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); assert.doesNotMatch(h, /(keepitil-(radio|ai|feedback|social)\.js|nav-reserve\.css)\?v=h[0-9a-f]{8}/, f); }
});
