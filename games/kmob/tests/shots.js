/* Capture gameplay screenshots in headless Chromium (SwiftShader). Usage: node tests/shots.js [outDir]
   Needs a static server on :8137 serving this folder (npx http-server -p 8137). */
const { chromium } = require(process.env.PW || 'playwright');
const out = process.argv[2] || 'docs/shots'; require('fs').mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const views = (process.env.VIEWS || 'mobile').split(',');
  for (const v of views) {
    const size = v === 'desktop' ? { width: 1440, height: 900 } : { width: 430, height: 932 };
    const p = await b.newPage({ viewport: size, deviceScaleFactor: 1 });
    const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto('http://127.0.0.1:8137/index.html?debug=1&autoplay=1&bot=1', { waitUntil: 'load' });
    const snap = async (n) => { await p.screenshot({ path: `${out}/${v}-${n}.png` }); console.log('shot', v, n, JSON.stringify(await p.evaluate(() => ({ t: KM.game.sim.t | 0, units: KM.game.sim.count, perf: KM.perf })))); };
    // the page renders slowly in software GL, so advance the sim directly between shots
    const adv = s => p.evaluate(s => { const g = KM.game; for (let k = 0; k < s * 60 && g.sim.alive; k++) { KM.bot(g.sim, 1 / 60, 1); g.sim.step(1 / 60); } g.sim.L.inv = 1e9; }, s);
    await sleep(2500); await adv(6); await sleep(1200); await snap('1-early');
    await adv(40); await sleep(1200); await snap('2-medium');
    await p.evaluate(() => KM.game.jumpTo(10)); await adv(25); await sleep(1500); await snap('3-large');
    await p.evaluate(() => KM.game.stress(1000)); await adv(1.5); await sleep(1500); await snap('4-swarm');
    await p.evaluate(() => { const s = KM.game.sim; s.coins += 999; s.offerHold = 0; }); await adv(0.1); await p.evaluate(() => { window.__b = 0; }); await sleep(1200); await snap('5-upgrade');
    await p.evaluate(() => { const s = KM.game.sim; s.L.inv = 0; s.hurtLauncher(1e9, 'breach'); }); await sleep(3200); await snap('6-results');
    console.log(v, 'errors:', errs.length ? errs : 'none'); await p.close();
  }
  await b.close();
})();
