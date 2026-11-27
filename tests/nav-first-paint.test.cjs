const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), http = require('http');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const css = read('assets/css/nav-reserve.css');
const pages = require('child_process').execSync("git ls-files '*.html'", { cwd: root, encoding: 'utf8' }).split('\n').filter((f) => f && !f.startsWith('node_modules') && read(f).includes('<nav id="main-nav"'));

test('every page that ships the static crawler nav links nav-reserve.css (23 today); only signup opts out', () => {
  assert.ok(pages.length >= 23, 'found ' + pages.length);
  for (const f of pages) assert.match(read(f), /<link href="\/assets\/css\/nav-reserve\.css\?v=20261127b" rel="stylesheet"\/>/, f + ': versioned link (Cloudflare caches the bare URL for 4 h, so a changed file must get a new ?v=)');
  const optOut = pages.filter((f) => /<body[^>]*data-static-nav/.test(read(f)));
  assert.deepEqual(optOut, ['signup.html'], 'the shell nav is off on signup, so its static nav must stay');
});
test('nav-reserve.css: collapse + 66px only with scripting enabled (no-JS readers keep the nav), 66px >= 861px to match the shell', () => {
  assert.match(css, /@media \(scripting: enabled\) \{\s*body:not\(\[data-static-nav\]\) #main-nav \{\s*max-height: 0; overflow: hidden; visibility: hidden; margin: 0; padding: 0; border: 0;\s*animation: kil-nav-failsafe 0\.01s linear 5s forwards;/);
  assert.match(css, /@keyframes kil-nav-failsafe \{ to \{ max-height: 800px; visibility: visible; \} \}/, 'after 5s the static nav comes back if the shell never removed it');
  assert.match(css, /@media \(scripting: enabled\) and \(min-width: 861px\) \{\s*body:not\(\[data-static-nav\]\) \{ padding-top: 66px; \}/);
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /@media \(scripting: none\)/);
  const shell = read('keepitil-shell.js');
  assert.match(shell, /IS_MOBILE=window\.matchMedia\('\(max-width:860px\)'\)\.matches/, 'breakpoint the CSS mirrors');
  assert.match(shell, /if\(!IS_MOBILE\) document\.body\.style\.paddingTop='66px'/, 'padding the CSS mirrors');
});

// Measuring half: needs Chrome + puppeteer-core (not a repo dependency, so CI skips it). Run locally:
//   KIL_PUPPETEER=/path/to/node_modules/puppeteer-core KIL_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node --test tests/nav-first-paint.test.cjs
let puppeteer = null, chrome = process.env.KIL_CHROME || '';
try { puppeteer = require(process.env.KIL_PUPPETEER || 'puppeteer-core'); } catch (e) { /* not installed */ }
if (!chrome) chrome = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p)) || '';
const MEASURE_SKIP = !puppeteer || !chrome ? 'puppeteer-core / Chrome not available (set KIL_PUPPETEER and KIL_CHROME)' : false;
const probe = () => { const e = [...document.querySelectorAll('main,header,h1,.hero,section')].find((x) => !x.closest('nav,#v3shell-nav,#main-nav,footer,#kil-radio') && x.getBoundingClientRect().height > 0); return e ? Math.round(e.getBoundingClientRect().top) : null; };
test('first content sits at the SAME top before the shell runs (blocked) and after it mounts, at 390 and 1280, on every nav page', { skip: MEASURE_SKIP, timeout: 600000 }, async () => {
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.jpg': 'image/jpeg' };
  const srv = http.createServer((q, r) => { let u = decodeURIComponent(q.url.split('?')[0]); let f = path.join(root, u); if (u.endsWith('/')) f = path.join(f, 'index.html'); if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html'; if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('nf'); } r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); r.end(fs.readFileSync(f)); });
  await new Promise((r) => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port;
  const br = await puppeteer.launch({ executablePath: chrome, headless: true });
  const bad = [];
  try {
    for (const f of pages) {
      if (/^(privacy|terms)\.html$/.test(f)) continue; // article pages: probe finds no landmark; covered by the CSS pins
      const url = base + '/' + (f === 'index.html' ? '' : f.replace(/\/index\.html$/, '/').replace(/\.html$/, ''));
      for (const w of [390, 1280]) {
        const top = {};
        for (const mode of ['pre', 'post']) {
          const p = await br.newPage(); await p.setViewport({ width: w, height: 800, isMobile: w < 500, hasTouch: w < 500 });
          if (mode === 'pre') { const c = await p.createCDPSession(); await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true }); await c.send('Network.setBlockedURLs', { urls: ['*keepitil-shell.js*'] }); }
          await p.goto(url, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}); await new Promise((r) => setTimeout(r, mode === 'pre' ? 500 : 2500));
          top[mode] = await p.evaluate(probe); await p.close();
        }
        // tickets.html: its shell injects a 60px strip of its own (not the nav); culture@390: its own script moves the header 10px. Both predate this change.
        const known = (f === 'tickets.html' && top.post - top.pre === 60) || (f === 'culture/index.html' && w === 390 && top.pre - top.post === 10);
        if (top.pre !== top.post && !known) bad.push(f + '@' + w + ' pre=' + top.pre + ' post=' + top.post);
      }
    }
  } finally { await br.close(); srv.close(); }
  assert.deepEqual(bad, [], 'content jumps when the shell mounts: ' + bad.join('; '));
});

test('failsafe: with the shell blocked the static nav is collapsed at first paint and VISIBLE after 5s; with the shell it is gone', { skip: MEASURE_SKIP, timeout: 120000 }, async () => {
  const srv = http.createServer((q, r) => { let u = decodeURIComponent(q.url.split('?')[0]); let f = path.join(root, u); if (u.endsWith('/')) f = path.join(f, 'index.html'); if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html'; if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('nf'); } const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.jpg': 'image/jpeg' }; r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); r.end(fs.readFileSync(f)); });
  await new Promise((r) => srv.listen(0, r)); const url = 'http://localhost:' + srv.address().port + '/earn/';
  const br = await puppeteer.launch({ executablePath: chrome, headless: true });
  const navState = () => { const n = document.getElementById('main-nav'); if (!n) return { present: false }; const cs = getComputedStyle(n); return { present: true, h: Math.round(n.getBoundingClientRect().height), vis: cs.visibility }; };
  try {
    for (const w of [390, 1280]) {
      const p = await br.newPage(); await p.setViewport({ width: w, height: 800 });
      const c = await p.createCDPSession(); await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true }); await c.send('Network.setBlockedURLs', { urls: ['*keepitil-shell.js*'] });
      await p.goto(url, { waitUntil: 'networkidle2' }); await new Promise((r) => setTimeout(r, 800));
      const early = await p.evaluate(navState); assert.equal(early.h, 0, w + ': collapsed at first paint'); assert.equal(early.vis, 'hidden');
      await new Promise((r) => setTimeout(r, 5200));
      const late = await p.evaluate(navState); assert.ok(late.h > 40, w + ': the static nav is back after 5s (height ' + late.h + ')'); assert.equal(late.vis, 'visible');
      await p.close();
      const q = await br.newPage(); await q.setViewport({ width: w, height: 800 }); await q.goto(url, { waitUntil: 'networkidle2' }); await new Promise((r) => setTimeout(r, 6000));
      assert.equal((await q.evaluate(navState)).present, false, w + ': with the shell the static nav is removed (and stays gone after 5s)'); await q.close();
    }
  } finally { await br.close(); srv.close(); }
});

test('hero first paint: nav-reserve.css repeats, verbatim, the desktop rules keepitil-shell.js injects (kil-desktop-grid .wrap + landing-standard), so the shell changes nothing when it mounts', () => {
  const shell = read('keepitil-shell.js'), c = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // .wrap grid declarations
  for (const d of ["max-width:var(--kil-page-max)!important;margin-left:auto!important;margin-right:auto!important;", "padding-left:var(--kil-page-pad)!important;padding-right:var(--kil-page-pad)!important;", "box-sizing:border-box!important"]) assert.ok(shell.includes(d), 'shell has ' + d);
  assert.ok(shell.includes(":root{--kil-page-max:1360px;--kil-page-pad:40px}"));
  assert.match(c, /--kil-page-max: 1360px; --kil-page-pad: 40px;/);
  assert.match(c, /\.wrap \{ max-width: var\(--kil-page-max\) !important; margin-left: auto !important; margin-right: auto !important; padding-left: var\(--kil-page-pad\) !important; padding-right: var\(--kil-page-pad\) !important; box-sizing: border-box !important; \}/);
  // landing standard: every rule the CSS repeats exists in the shell with the same declarations
  const pairs = [
    ['.hero-head,.ce-head', 'margin-left:auto!important;margin-right:auto!important;', /\.hero-head, \.ce-head \{ margin-left: auto !important; margin-right: auto !important; \}/],
    ['.hero h1,.ce-hero h1', 'text-align:center!important;', /\.hero h1, \.ce-hero h1 \{ text-align: center !important; \}/],
    ['.hero .eyebrow,.ce-hero .eyebrow', 'text-align:center!important;', /\.hero \.eyebrow, \.ce-hero \.eyebrow \{ text-align: center !important; \}/],
    ['.hero>p,.ce-hero>p', 'margin-left:auto!important;margin-right:auto!important;text-align:center!important;', /\.hero > p, \.ce-hero > p \{ margin-left: auto !important; margin-right: auto !important; text-align: center !important; \}/],
    ['.hero .stats,.hero .hero-stats,.ce-hero .ce-stats', 'justify-content:center!important;', /\.hero \.stats, \.hero \.hero-stats, \.ce-hero \.ce-stats \{ justify-content: center !important; \}/],
    ['.hero,.ce-hero', 'align-items:center;', /\.hero, \.ce-hero \{ align-items: center; \}/],
  ];
  for (const [sel, decl, re] of pairs) { assert.ok(shell.includes(sel + '{' + decl + '}') || shell.includes("'" + sel + '{' + decl + "}'"), 'shell has ' + sel); assert.match(c, re, sel); }
  assert.match(css, /@media \(scripting: enabled\) and \(min-width: 861px\) \{\s*:root \{ --kil-page-max/, 'same breakpoint as the shell (min-width:861px) and scripting-gated');
});

test('cold-load CLS at 1280 stays under 0.05 on earn, connect, create (was 0.32 / 0.07 / 0.06 before the hero rules)', { skip: MEASURE_SKIP, timeout: 180000 }, async () => {
  const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.jpg': 'image/jpeg' };
  const srv = http.createServer((q, r) => { let u = decodeURIComponent(q.url.split('?')[0]); let f = path.join(root, u); if (u.endsWith('/')) f = path.join(f, 'index.html'); if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html'; if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('nf'); } r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); r.end(fs.readFileSync(f)); });
  await new Promise((r) => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port; const bad = [];
  try {
    for (const pg of ['/earn/', '/connect/', '/create/']) {
      const br = await puppeteer.launch({ executablePath: chrome, headless: true }); // fresh profile = cold cache
      const p = await br.newPage(); await p.setViewport({ width: 1280, height: 800 });
      await p.evaluateOnNewDocument(() => { window.__c = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__c += e.value; }).observe({ type: 'layout-shift', buffered: true }); });
      await p.goto(base + pg, { waitUntil: 'networkidle2' }); await new Promise((r) => setTimeout(r, 1800));
      const cls = await p.evaluate(() => window.__c); await br.close(); if (cls >= 0.05) bad.push(pg + ' ' + cls.toFixed(3));
    }
  } finally { srv.close(); }
  assert.deepEqual(bad, [], 'CLS too high: ' + bad.join(', '));
});

test('nav-reserve.css is cached for hours by Cloudflare: when the file changes, bump the ?v= on ALL 23 links together (one shared stamp)', () => {
  const stamps = new Set(); for (const f of pages) stamps.add((/nav-reserve\.css\?v=([0-9]{8}[a-z])/.exec(read(f)) || [])[1]);
  assert.equal(stamps.size, 1, 'one stamp on every page: ' + [...stamps].join(','));
  // the stamp is pinned to the file content, so editing the CSS without bumping the stamp fails here
  const sha = require('crypto').createHash('sha1').update(css.replace(/\r\n/g, '\n')).digest('hex').slice(0, 10);
  const PIN = { '20261127b': '1b8371154d' };
  assert.equal(PIN[[...stamps][0]], sha, 'nav-reserve.css changed: bump ?v= on every page AND update PIN in this test (stamp ' + [...stamps][0] + ', sha ' + sha + ')');
});
