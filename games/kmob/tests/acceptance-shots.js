/* KMOB acceptance screenshot set: 20 required captures + 4 escalation captures (minute 1/5/15/30).
   Run: PW=/path/to/playwright VIEWS=mobile,desktop node tests/acceptance-shots.js docs/shots
   Software-rendered headless capture: frames are composed by fast-forwarding the sim, so the images show real game
   states but say nothing about device frame rate. */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PW || 'playwright');
const ROOT = path.join(__dirname, '..'), OUT = process.argv[2] || path.join(ROOT, 'docs/shots');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.glb': 'model/gltf-binary' };
fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}/`;
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  for (const view of (process.env.VIEWS || 'mobile').split(',')) {
    const size = view === 'desktop' ? { width: 1440, height: 900 } : { width: 430, height: 932 };
    const p = await b.newPage({ viewport: size }); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(base + 'index.html?autoplay=1'); await sleep(2000);
    const E = (fn, arg) => p.evaluate(fn, arg);
    const run = (secs, o) => E(([secs, o]) => { const g = KM.game; o = o || {}; for (let k = 0; k < secs * 60 && g.sim.alive; k++) { if (o.god !== false) g.sim.L.inv = 1e9; if (o.skill !== -1) KM.bot(g.sim, 1 / 60, o.skill == null ? 1 : o.skill); g.sim.step(1 / 60); } document.getElementById('tip').classList.add('hidden'); if (o.noOffer) { g.sim.offer = null; g.sim.offerHold = 99; document.getElementById('offer').innerHTML = ''; document.getElementById('offerCost').classList.add('hidden'); } }, [secs, o]);
    const reset = () => E(() => { KM.camFocus = null; KM.camOverride = 0; KM.game.startRun(); });
    const shot = async (name, settle) => { if (only && !only.some(o => name.startsWith(o))) return; await sleep(settle || 2600); await p.screenshot({ path: path.join(OUT, `${view}-${name}.png`) }); const info = await E(() => ({ t: Math.floor(KM.game.sim.t), units: KM.game.sim.count[0] + KM.game.sim.count[1], lv: KM.game.sim.level })); console.log(view, name, JSON.stringify(info)); };
    const fill = n => E(n => { const g = KM.game; g.sim.moveTo(0, 0); g.stress(Math.max(0, n - g.sim.count[0] - g.sim.count[1])); }, n);
    // a staged skirmish right in front of the camera for close-ups
    const skirmish = (enemyKind, nF, nE, dist) => E(([k, nF, nE, dist]) => { const g = KM.game, s = g.sim, D = KM.difficulty(s.t); s.budget = -1e9; s.formT = 1e9; s.nextPush = s.nextBoss = 1e12;
      const z = s.front - 9; for (let i = 0; i < nF; i++) { const j = s.spawn(0, KM.FRIEND[i % 7 === 3 ? 2 : i % 5 === 2 ? 1 : 0], -2.4 + (i % 6) * 0.95, z + 1.4 + Math.floor(i / 6) * 0.9, { hp: 1e4, dmg: 0.0001, spd: 1 }); }
      for (let i = 0; i < nE; i++) s.spawn(1, KM.ENEMY_BY[k], -2 + (i % 5) * 1.0, z - 1.2 - Math.floor(i / 5) * 1.0, { hp: 1e5, dmg: 0.0001, spd: 0.3 });
      KM.camFocus = { x: 0, z: z - 0.5, flip: true, pitch: 0.55 }; KM.camOverride = dist; s.L.toffZ = s.L.offZ = 1.5; s.stats.rate = 0; for (let i = 0; i < s.hi; i++) if (s.st[i]) s.spd[i] *= 0.15; }, [enemyKind, nF, nE, dist]);
    // 1-3 opening / first clash / medium army
    await reset(); await run(2.5); await shot('01-opening-battle');
    await run(3.5); await shot('02-first-clash');
    await run(55); await shot('03-medium-army');
    // 4-6 crowd scale
    await E(() => KM.game.jumpTo(9)); await run(8); await fill(500); await run(1.2); await shot('04-500-unit-battle', 3200);
    await fill(1000); await run(1); await shot('05-1000-unit-battle', 3600);
    await fill(1600); await run(1); await shot('06-1600-unit-battle', 4200);
    // 7-10 close-ups
    await reset(); await run(1, { skill: -1 }); await E(() => { const s = KM.game.sim; for (let i = 0; i < s.hi; i++) if (s.st[i]) s.kill(i, true); }); await skirmish('grunt', 12, 0, 7); await run(1.2, { skill: -1, noOffer: true }); await shot('07-friendly-closeup');
    await reset(); await run(0.5, { skill: -1 }); await skirmish('grunt', 4, 10, 7); await E(() => { KM.camFocus.flip = false; KM.camFocus.z -= 1; }); await run(1.6, { skill: -1, noOffer: true }); await shot('08-enemy-closeup');
    await reset(); await E(() => { KM.game.sim.t = 400; }); await run(0.5, { skill: -1 }); await skirmish('brute', 8, 3, 9); await E(() => { KM.camFocus.flip = false; KM.camFocus.z -= 1.5; KM.camFocus.pitch = 0.62; }); await run(1.8, { skill: -1, noOffer: true }); await shot('09-horned-elite');
    await reset(); await E(() => { KM.game.sim.t = 800; }); await run(0.5, { skill: -1 }); await skirmish('warlord', 10, 1, 11); await E(() => { KM.camFocus.flip = false; KM.camFocus.z -= 1.5; KM.camFocus.pitch = 0.62; }); await run(2, { skill: -1, noOffer: true }); await shot('10-warlord');
    // 11-12 launcher stages
    await reset(); await E(() => { KM.camFocus = 'launcher'; KM.camOverride = 12; }); await run(3, { skill: 0, noOffer: true }); await shot('11-launcher-level-1');
    await E(() => { KM.game.sim.upgrades = 16; }); await run(1.5, { skill: 0, noOffer: true }); await shot('12-launcher-level-5', 3200);
    // 13-16 defenses (normal fitted camera)
    await reset(); await E(() => KM.game.showcase(1, 1)); await run(6, { skill: 0, noOffer: true }); await shot('13-basic-towers');
    await E(() => KM.game.showcase(5, 5)); await run(5, { skill: 0, noOffer: true }); await shot('14-max-towers');
    await reset(); await E(() => { const s = KM.game.sim; s.t = 120; s.coins = 1e6; for (let k = 0; k < 2; k++) { s.offer = [{ id: 'wall:barricade' }]; s.pick(0); } s.coins = 0; }); await run(4, { skill: 0, noOffer: true }); await shot('15-barricade');
    await E(() => { const s = KM.game.sim; s.t = 200; s.coins = 1e6; s.offer = [{ id: 'wall:wall' }]; s.pick(0); s.coins = 0; s.hurtStruct(-22, 120); }); await run(4, { skill: 0, noOffer: true }); await shot('16-shield-wall');
    // 17-18 coins + upgrade
    await reset(); await run(14); await E(() => { const s = KM.game.sim; for (let k = 0; k < 30; k++) s.dropCoin(s.L.x + (Math.random() - 0.5) * 5, s.L.z - 2.5 - Math.random() * 4, 2); s.moveTo(s.L.x, -4); }); await run(0.5, { skill: -1, noOffer: true }); await shot('17-coin-collection', 1600);
    await run(18); await E(() => { const s = KM.game.sim; s.coins += KM.upgradeCost(s.upgrades) + 1; s.offerHold = 0; s.step(1 / 60); }); await shot('18-upgrade-choice', 2000);
    // 19 biome transition gate
    await reset(); await E(() => { const s = KM.game.sim; s.t = 660; s.front = -(KM.BIOME_LEN * KM.W.CHUNK) + 38; }); await run(5, { noOffer: true }); await shot('19-biome-transition', 4000);
    // escalation: minute 1 / 5 / 15 / 30
    for (const m of [1, 5, 15, 30]) { await reset(); await E(m => { const g = KM.game; if (m > 1) g.jumpTo(m); }, m); await run(m > 1 ? 30 : 60, { noOffer: true }); await shot(`E-minute-${String(m).padStart(2, '0')}`, 3200); }
    // 20 results
    await reset(); await run(80, { god: false }); await E(() => { const s = KM.game.sim; if (s.alive) { s.L.inv = 0; s.hurtLauncher(1e9, 'breach'); } }); await shot('20-results', 4500);
    console.log(view, 'errors:', errs.length ? errs.slice(0, 5) : 'none'); await p.close();
  }
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
