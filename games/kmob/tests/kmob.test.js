/* KMOB headless regression tests (Node, no browser). Run: node tests/kmob.test.js */
const path = require('path');
require(path.join(__dirname, '../js/core.js')); require(path.join(__dirname, '../js/sim.js'));
const KM = globalThis.KM;
let pass = 0, fail = 0; const ok = (n, c, info) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c || info === undefined ? '' : ' ' + JSON.stringify(info))); };
const memStore = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, m }; };
const run = (sim, secs, bot) => { for (let k = 0; k < secs * 60 && sim.alive; k++) { if (bot !== false) KM.bot(sim, 1 / 60, 1); sim.step(1 / 60); } };

// --- difficulty ---
{
  let mono = true, prev = KM.difficulty(0);
  for (let t = 10; t <= 6 * 3600; t += 10) { const d = KM.difficulty(t); for (const k of ['spawnRate', 'hp', 'dmg', 'speed', 'eliteChance', 'coinMul', 'era', 'tier']) if (d[k] < prev[k] - 1e-9) mono = false; prev = d; }
  ok('difficulty is non-decreasing for 6 hours', mono);
  ok('difficulty keeps growing after 2 hours (no hard ceiling)', KM.difficulty(3 * 3600).hp > KM.difficulty(2 * 3600).hp && KM.difficulty(3 * 3600).spawnRate > KM.difficulty(2 * 3600).spawnRate);
  const d = KM.difficulty(1e7); ok('extreme time stays finite', Object.values(d).every(v => Number.isFinite(v)), d);
}

// --- upgrades + economy ---
{
  const sim = new KM.Sim({ seed: 3 });
  const s0 = { ...sim.stats };
  sim.coins = 1000; sim.offer = [{ id: 'cap' }, { id: 'dmg' }, { id: 'rate' }];
  const cost = KM.upgradeCost(0); sim.pick(0);
  ok('ARMY SIZE adds exactly +12', sim.stats.cap === s0.cap + 12, sim.stats.cap);
  ok('upgrade deducts its cost', Math.abs(sim.coins - (1000 - cost)) < 1e-9);
  sim.offer = [{ id: 'dmg' }]; sim.pick(0); ok('DAMAGE multiplies by 1.12', Math.abs(sim.stats.dmg - s0.dmg * 1.12) < 1e-9);
  sim.coins = 0; sim.offer = [{ id: 'hp' }]; ok('cannot buy without enough coins', sim.pick(0) === false && sim.coins === 0);
  ok('coins never negative after failed purchase', sim.coins >= 0);
  let costs = []; for (let n = 0; n < 200; n++) costs.push(KM.upgradeCost(n));
  ok('upgrade cost strictly increases and stays finite', costs.every((c, i) => i === 0 || c > costs[i - 1]) && Number.isFinite(costs[199]));
  // build + tower upgrade
  sim.coins = 1e6; sim.offer = [{ id: 'build:arrow', tower: 'arrow' }]; sim.pick(0);
  ok('build tower places it in a free unlocked slot', sim.towers[0] && sim.towers[0].type === 'arrow' && sim.towers[0].lvl === 1);
  sim.offer = [{ id: 'tup:0' }]; sim.pick(0); ok('tower upgrade raises level', sim.towers[0].lvl === 2);
  const r = KM.rng(9); let valid = true;
  for (let k = 0; k < 300; k++) { sim.t = k * 20; const o = KM.makeOffer(sim, r); const ids = o.map(x => x.id); if (o.length !== 3 || new Set(ids).size !== 3 || !o.some(x => x.cat === 'army') || ids.filter(i => i.startsWith('build:')).length > 1) valid = false; }
  ok('offers: 3 distinct, ≥1 army card, ≤1 tower build', valid);
}

// --- director composition validity ---
{
  const sim = new KM.Sim({ seed: 11, trace: true });
  for (let k = 0; k < 20 * 60 * 60 && sim.alive; k++) { sim.L.inv = 1; KM.bot(sim, 1 / 60, 1); sim.step(1 / 60); if (sim.t > 1200) break; }
  let bad = null;
  for (const f of sim.debugLog) {
    const m = f.t / 60;
    f.kinds.forEach((k, i) => { const e = KM.ENEMY_BY[k]; if (!e || (e.at > m + 1e-6 && !(e.boss && f.type === 'boss'))) bad = bad || { k, m, type: f.type }; if (Math.abs(f.xs[i]) > KM.W.LANE + 6) bad = bad || { x: f.xs[i] }; });
    if (!f.kinds.length && f.type !== 'boss') bad = bad || { empty: f.type };
  }
  ok('director only spawns unlocked types inside the lane (20 sim-minutes)', !bad, bad);
  ok('director produced a variety of formations', new Set(sim.debugLog.map(f => f.type)).size >= 8, [...new Set(sim.debugLog.map(f => f.type))]);
  ok('several enemy behaviours appeared', new Set(sim.debugLog.flatMap(f => f.kinds)).size >= 8);
}

// --- death / restart ---
{
  const sim = new KM.Sim({ seed: 5 }); let deaths = 0; sim.on(t => { if (t === 'death') deaths++; });
  run(sim, 5); sim.hurtLauncher(1e9, 'test'); sim.hurtLauncher(1e9, 'test'); run(sim, 2);
  ok('death ends the run exactly once', deaths === 1 && !sim.alive);
  const tBefore = sim.t; sim.step(1); ok('time stops after death', sim.t === tBefore);
  sim.coins = 500; sim.reset({ seed: 6 });
  ok('restart resets run state', sim.alive && sim.t === 0 && sim.coins === 0 && sim.kills === 0 && sim.count[0] === 0 && sim.count[1] === 0 && sim.activeCount() === 0 && sim.towers.every(t => !t) && sim.upgrades === 0);
}

// --- save data ---
{
  const st = memStore(); let save = KM.loadSave(st);
  ok('fresh save is default', save.tokens === 0 && save.best.all === 0);
  KM.recordRun(save, { time: 125, kills: 300, coins: 900, peakArmy: 80, tokens: 2 }); KM.writeSave(st, save);
  let again = KM.loadSave(st); ok('permanent tokens + best survive reload', again.tokens === 2 && again.best.all === 125 && again.totals.runs === 1);
  const sim = new KM.Sim({ seed: 1 }); sim.coins = 77; sim.reset({ seed: 2, perm: again.perm }); ok('run currency does not survive restart', sim.coins === 0);
  st.setItem('kmob.save.v1', '{corrupt'); again = KM.loadSave(st); ok('corrupt primary save falls back to backup', again.tokens >= 0 && again.best.all >= 0 && again.totals.runs >= 0);
  const v = KM.validateSave({ tokens: -5, best: { all: 'x' }, perm: { army: 99 }, equip: { skin: 'skin_gold' }, settings: { sound: 7 } });
  ok('validation clamps bad values', v.tokens === 0 && v.best.all === 0 && v.perm.army === 3 && v.equip.skin === 'skin_royal' && v.settings.sound === 1);
  KM.recordRun(save, { time: 100, kills: 1, coins: 1, peakArmy: 1, tokens: 0 }); ok('lower run does not replace personal best', save.best.all === 125);
}

// --- pooling / leaks ---
{
  const sim = new KM.Sim({ seed: 21 });
  for (let r = 0; r < 5; r++) { run(sim, 90); sim.reset({ seed: 21 + r }); }
  ok('pools fully released after repeated runs', sim.nfree === KM.Sim.CAP && sim.activeCount() === 0 && sim.p.on.every(v => !v) && sim.c.st.every(v => !v));
  run(sim, 60);
  let alive = [0, 0]; for (let i = 0; i < sim.hi; i++) if (sim.st[i] === 1) alive[sim.team[i]]++;
  ok('alive counters match pool contents', alive[0] === sim.count[0] && alive[1] === sim.count[1], { alive, count: sim.count });
}

// --- endless chunks ---
{
  let gaps = false, prevMax = null;
  for (let f = 0; f > -400000; f -= 7.3) { const c = KM.chunksFor(f); for (let k = 1; k < c.length; k++) if (c[k] !== c[k - 1] + 1) gaps = true; const lo = KM.chunkPlan(c[0]).z1, hi = KM.chunkPlan(c[c.length - 1]).z0; if (lo < f + 30 || hi > f - 90) gaps = true; prevMax = c; }
  ok('chunk streaming is contiguous and covers the view for 400 km', !gaps);
  const a = KM.chunkPlan(1234), b = KM.chunkPlan(1235); ok('adjacent chunks share their edge', a.z0 === b.z1);
  ok('biomes cycle forever', KM.chunkPlan(1e6).biome >= 0 && KM.chunkPlan(1e6).biome < KM.BIOMES.length);
}

// --- score/time accuracy + long run stability ---
{
  const sim = new KM.Sim({ seed: 31 });
  for (let k = 0; k < 600; k++) { sim.L.inv = 1; sim.step(1 / 60); }
  ok('survival time matches simulated time', Math.abs(sim.t - 10) < 1e-6);
  ok('time formatting', KM.fmtTime(42 * 60 + 18) === '42:18' && KM.fmtTime(2 * 3600 + 65) === '2:01:05');
  // 60 simulated minutes, invulnerable, with bot: memory pools must stay bounded and values finite
  const soak = new KM.Sim({ seed: 41 }); let maxActive = 0, finite = true; const t0 = Date.now();
  for (let k = 0; k < 60 * 60 * 60; k++) { soak.L.inv = 1; KM.bot(soak, 1 / 60, 1); soak.step(1 / 60); if (k % 600 === 0) { maxActive = Math.max(maxActive, soak.activeCount()); if (![soak.coins, soak.coinsTotal, soak.t, soak.front, soak.budget].every(Number.isFinite)) finite = false; } }
  ok('60-minute soak: values finite', finite && soak.t >= 3599);
  ok('60-minute soak: unit pool bounded', maxActive <= KM.Sim.CAP && soak.count[1] <= KM.W.MAX_ENEMY + 1, { maxActive, enemies: soak.count[1] });
  console.log(`      soak: 60 sim-min in ${((Date.now() - t0) / 1000).toFixed(1)}s, peak active ${maxActive}, kills ${soak.kills}, upgrades ${soak.upgrades}`);
  const big = KM.fmtNum(1e12); ok('huge numbers format without overflow', big === '1,000,000,000,000');
}

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
