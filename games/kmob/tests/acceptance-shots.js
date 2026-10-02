/* KMOB screenshot acceptance set (12 captures, mobile + optional desktop).
   Run: PW=/path/to/playwright VIEWS=mobile,desktop node tests/acceptance-shots.js docs/shots
   Software-rendered headless capture: frames are composed by fast-forwarding the sim, so the images show real
   gameplay states but say nothing about device frame rate. */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PW || 'playwright');
const ROOT = path.join(__dirname, '..'), OUT = process.argv[2] || path.join(ROOT, 'docs/shots');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };
fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}/`;
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const view of (process.env.VIEWS || 'mobile').split(',')) {
    const size = view === 'desktop' ? { width: 1440, height: 900 } : { width: 430, height: 932 };
    const p = await b.newPage({ viewport: size }); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(base + 'index.html?autoplay=1'); await sleep(2000);
    const run = (secs, opts) => p.evaluate(([secs, o]) => { const g = KM.game; o = o || {}; for (let k = 0; k < secs * 60 && g.sim.alive; k++) { if (o.god !== false) g.sim.L.inv = 1e9; KM.bot(g.sim, 1 / 60, o.skill == null ? 1 : o.skill); g.sim.step(1 / 60); } document.getElementById('tip').classList.add('hidden'); }, [secs, opts]);
    const shot = async (name, settle) => { await sleep(settle || 2500); await p.screenshot({ path: path.join(OUT, `${view}-${name}.png`) }); const info = await p.evaluate(() => ({ t: Math.floor(KM.game.sim.t), units: KM.game.sim.count[0] + KM.game.sim.count[1], lv: KM.game.sim.level })); console.log(view, name, JSON.stringify(info)); };
    const cam = d => p.evaluate(d => { KM.camOverride = d || 0; }, d);
    await run(6); await shot('01-opening');
    await run(55); await shot('02-medium-army');
    await p.evaluate(() => KM.game.jumpTo(10)); await run(30); await shot('03-large-army');
    await p.evaluate(() => { const g = KM.game; g.sim.moveTo(0, 0); g.stress(Math.max(0, 1000 - g.sim.count[0] - g.sim.count[1])); }); await run(1.2); await shot('04-1000-unit-battle', 3500);
    await p.evaluate(() => { const g = KM.game; g.stress(Math.max(0, 2000 - g.sim.count[0] - g.sim.count[1])); }); await run(1.0); await shot('05-extreme-swarm', 4000);
    await p.evaluate(() => { const g = KM.game; g.startRun(); g.showcase(1, 1); KM.camFocus = 'launcher'; }); await run(8, { skill: 0 }); await cam(24); await shot('06-basic-towers');
    await p.evaluate(() => { const g = KM.game; g.showcase(5, 5); }); await run(6, { skill: 0 }); await shot('07-max-level-towers'); await p.evaluate(() => { KM.camFocus = null; });
    await cam(0); await p.evaluate(() => { const g = KM.game; g.startRun(); }); await run(40); await p.evaluate(() => { const s = KM.game.sim; s.coins += KM.upgradeCost(s.upgrades) + 1; s.offerHold = 0; s.step(1 / 60); }); await shot('08-upgrade-selection', 2000);
    await p.evaluate(() => { const g = KM.game; g.startRun(); g.jumpTo(13); g.sim.nextBoss = g.sim.t + 4; g.sim.nextPush = g.sim.t + 3; }); await run(9); await shot('09-boss-push');
    await p.evaluate(() => { const g = KM.game; g.startRun(); }); await run(18); await p.evaluate(() => { const s = KM.game.sim; for (let k = 0; k < 40; k++) s.dropCoin(s.L.x + (Math.random() - 0.5) * 6, s.L.z - 3 - Math.random() * 5, 2); s.moveTo(s.L.x, -5); }); await cam(17); await run(0.6, { skill: 0 }); await shot('10-coin-collection', 1500);
    await p.evaluate(() => { const g = KM.game; g.sim.upgrades = 16; KM.camFocus = 'launcher'; g.sim.offer = null; g.sim.offerHold = 99; document.getElementById('offer').innerHTML = ''; document.getElementById('offerCost').classList.add('hidden'); }); await run(1.5, { skill: 0 }); await cam(14); await shot('11-upgraded-launcher', 3000); await p.evaluate(() => { KM.camFocus = null; });
    await cam(0); await p.evaluate(() => { const g = KM.game; g.startRun(); }); await run(90, { god: false });
    await p.evaluate(() => { const s = KM.game.sim; if (s.alive) { s.L.inv = 0; s.hurtLauncher(1e9, 'breach'); } }); await shot('12-results', 4500);
    console.log(view, 'errors:', errs.length ? errs.slice(0, 5) : 'none'); await p.close();
  }
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
