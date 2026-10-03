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
  sim.coins = 1e6; sim.offer = [{ id: 'build:gun', tower: 'gun' }]; sim.pick(0);
  ok('support vehicle card places it in a free formation slot', sim.towers[0] && sim.towers[0].type === 'gun' && sim.towers[0].lvl === 1);
  sim.offer = [{ id: 'tup:0' }]; sim.pick(0); ok('vehicle upgrade raises level', sim.towers[0].lvl === 2);
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
  for (let f = 0; f > -400000; f -= 7.3) { const c = KM.chunksFor(f); for (let k = 1; k < c.length; k++) if (c[k] !== c[k - 1] + 1) gaps = true; const lo = KM.chunkPlan(c[0]).z1, hi = KM.chunkPlan(c[c.length - 1]).z0; if (lo < f + 60 || hi > f - 90) gaps = true; prevMax = c; }
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

// --- mobile support vehicles (they replaced the ground towers) ---
{
  const mk = () => { const s = new KM.Sim({ seed: 77 }); s.budget = -1e9; s.formT = 1e9; s.nextPush = s.nextBoss = 1e9; s.L.inv = 1e9; s.stats.rate = 0; return s; };
  let s = mk(); s.t = 300; s.coins = 1e6; s.offer = [{ id: 'build:gun', tower: 'gun' }]; s.pick(0);
  const t = s.towers[0]; ok('support vehicle has HP', t && t.hp > 0 && t.hp === t.mhp);
  s.hurtStruct(-10, t.mhp * 0.5); ok('support vehicle takes damage', t.hp < t.mhp && t.hp > 0);
  s.offer = [{ id: 'tup:0' }]; s.pick(0); ok('upgrading a vehicle repairs it and raises max HP', s.towers[0].hp === s.towers[0].mhp && s.towers[0].mhp > 140);
  let downs = 0, ups = 0; s.on(e => { if (e === 'towerDown') downs++; if (e === 'towerUp') ups++; }); s.hurtStruct(-10, 1e9);
  ok('destroyed vehicle is knocked out (kept, not a target) instead of deleted', downs === 1 && s.towers[0] && s.towers[0].down > 0 && s.structAt(-10) === null);
  ok('knocked-out vehicle offers a REBUILD card', KM.makeOffer(s, KM.rng(1)).length >= 0 && (() => { for (let k = 0; k < 60; k++) { const o = KM.makeOffer(s, KM.rng(k)); if (o.some(c => c.id === 'tup:0' && /REBUILD/.test(c.title))) return true; } return false; })());
  for (let k = 0; k < 60 * 31; k++) s.step(1 / 60); ok('knocked-out vehicle auto-repairs after ~30 s', ups === 1 && s.towers[0].down === 0 && s.towers[0].hp > 0);
  const hp0 = s.towers[0].mhp; s.offer = [{ id: 'thp' }]; s.pick(0); ok('VEHICLE ARMOR upgrade raises vehicle max HP', s.towers[0].mhp > hp0 * 1.2);
  // vehicles drive with the command tank and never race ahead of it
  s = mk(); s.t = 300; s.coins = 1e6; s.offer = [{ id: 'build:gun', tower: 'gun' }]; s.pick(0); s.offer = [{ id: 'build:artillery', tower: 'artillery' }];
  s.towers[1] = s.makeTower('artillery', 1, 1); s.moveTo(-6, -8);
  let ahead = 0; for (let k = 0; k < 60 * 6; k++) { s.step(1 / 60); for (const v of s.towers) if (v) ahead = Math.max(ahead, s.L.z - v.z); }
  const v0 = s.towers[0], sl = KM.TOWER_SLOTS[0];
  ok('support vehicles hold formation slots relative to the moving tank', Math.abs(v0.x - Math.max(-KM.W.LANE + 0.8, s.L.x + sl.x)) < 0.6 && Math.abs(v0.z - (s.L.z + sl.dz)) < 0.6, { vx: v0.x, lx: s.L.x, vz: v0.z, lz: s.L.z });
  ok('support vehicles never race ahead of the tank (≤ 3 m)', ahead <= 3.01, ahead);
  // enemies that break through attack a vehicle
  s = mk(); s.t = 300; s.coins = 1e6; s.offer = [{ id: 'build:gun', tower: 'gun' }]; s.pick(0); for (let k = 0; k < 120; k++) s.step(1 / 60); const tw = s.towers[0]; tw.cd = 1e9;
  for (let k = 0; k < 6; k++) s.spawn(1, KM.ENEMY_BY.knight, tw.x + 0.6, tw.z - 1.4 - k * 0.3, { hp: 1e5, dmg: 3, spd: 1 });
  for (let k = 0; k < 60 * 8; k++) { s.step(1 / 60); s.towers[0].cd = 1e9; }
  ok('enemies that break through damage support vehicles', s.towers[0].hp < s.towers[0].mhp || s.towers[0].down > 0, s.towers[0].hp);
  // support vehicles fire
  s = mk(); s.t = 300; s.coins = 1e6; s.offer = [{ id: 'build:gun', tower: 'gun' }]; s.pick(0); let shots = 0; s.on(e => { if (e === 'tower') shots++; });
  s.spawn(1, KM.ENEMY_BY.grunt, 0, s.L.z - 10, { hp: 1e5, dmg: 0, spd: 0.01 }); for (let k = 0; k < 60 * 4; k++) s.step(1 / 60);
  ok('gun carrier fires at enemies in range', shots > 2 && s.dmgBy[3] > 0, { shots, dmg: s.dmgBy[3] });
  ok('restart clears vehicles', (() => { const q = mk(); q.coins = 1e6; q.t = 200; q.offer = [{ id: 'build:gun', tower: 'gun' }]; q.pick(0); q.reset({ seed: 1 }); return q.towers.every(x => !x) && q.towers.length === 4; })());
  // the deck no longer contains anything that cannot travel
  let bad = [], ids = new Set(); const q = mk(); q.coins = 1e6;
  for (let k = 0; k < 400; k++) { q.t = (k % 40) * 30; if (k % 7 === 0 && q.offer == null) { const o = KM.makeOffer(q, KM.rng(k)); q.offer = o; q.pick(0); }
    for (const c of KM.makeOffer(q, KM.rng(k * 13))) { ids.add(c.id.split(':')[0] + (c.tower ? ':' + c.tower : '')); if (/^wall:|build:(arrow|cannon|sniper|barracks|banner)/.test(c.id) || /WALL|BARRICADE|TOWER/.test(c.title)) bad.push(c.id + ' ' + c.title); } }
  ok('no static walls, barricades or ground towers are ever offered', bad.length === 0, bad.slice(0, 5));
}

// --- command tank, force field, ATTACK/DEFEND, cohesion, ranged eras, collectors ---
{
  const mk = seed => { const s = new KM.Sim({ seed: seed || 5 }); s.budget = -1e9; s.formT = 1e9; s.nextPush = s.nextBoss = 1e12; s.L.inv = 0; s.stats.rate = 0; return s; };
  // tank auto-fire
  { const s = mk(); let shots = 0; s.on(e => { if (e === 'tankfire') shots++; }); for (let k = 0; k < 120; k++) s.step(1 / 60); const idle = shots;
    s.spawn(1, KM.ENEMY_BY.knight, s.L.x, s.L.z - 14, { hp: 1e5, dmg: 0, spd: 0.01 }); for (let k = 0; k < 60 * 4; k++) s.step(1 / 60);
    ok('command tank holds fire with no target, fires automatically in range', idle === 0 && shots >= 2 && s.dmgBy[2] > 0, { idle, shots, dmg: s.dmgBy[2] }); }
  { const s = mk(), s0 = { ...s.stats }; s.coins = 1e9;
    for (const id of ['tgun', 'tgun', 'trof', 'trof', 'trng']) { s.offer = [{ id }]; s.pick(0); }
    const look = KM.tankLook(s.stats);
    ok('tank upgrades raise damage / fire rate / range', s.stats.tankDmg > s0.tankDmg * 1.6 && s.stats.tankRate > s0.tankRate * 1.3 && s.stats.tankRange > s0.tankRange);
    ok('tank upgrades are visible (barrels, longer cannon, antenna)', look.barrels === 2 && look.cannon && look.antenna && look.blen > KM.tankLook(KM.baseStats()).blen, look);
    s.t = 400; s.offer = [{ id: 'tmis' }]; s.pick(0); let mis = 0; s.on(e => { if (e === 'missiles') mis++; });
    for (let k = 0; k < 4; k++) s.spawn(1, KM.ENEMY_BY.knight, s.L.x - 2 + k, s.L.z - 16, { hp: 1e5, dmg: 0, spd: 0.01 }); for (let k = 0; k < 60 * 8; k++) s.step(1 / 60);
    ok('missile pod fires salvos at the toughest targets', mis >= 1 && KM.tankLook(s.stats).missiles); }
  // force field
  { const s = mk(); s.coins = 1e9; s.offer = [{ id: 'shield' }]; s.pick(0); const L = s.L, hp0 = L.hp, sh0 = L.sh;
    s.hurtLauncher(20, 'test'); ok('force field absorbs damage before tank HP', L.hp === hp0 && L.sh === sh0 - 20 && s.shAbsorbed === 20);
    let brk = 0, up = 0; s.on(e => { if (e === 'shieldBreak') brk++; if (e === 'shieldUp') up++; }); s.hurtLauncher(60, 'test');
    ok('force field collapses at 0 (overflow hits the tank) and goes down', brk === 1 && L.shDown > 0 && L.hp < hp0);
    const hp1 = L.hp; s.hurtLauncher(5, 'test'); ok('collapsed field does not absorb', L.hp === hp1 - 5);
    for (let k = 0; k < 60 * 20; k++) s.step(1 / 60); ok('force field rebuilds after its cooldown and recharges', up === 1 && L.sh > L.shMax * 0.6, { sh: L.sh, max: L.shMax });
    const m1 = L.shMax; s.offer = [{ id: 'shield' }]; s.pick(0); s.step(1 / 60); ok('FORCE FIELD level raises capacity', L.shMax > m1); }
  // upgrade prerequisites + era order
  { const s = mk(); s.t = 30 * 60; let bad = [];
    for (let k = 0; k < 300; k++) for (const c of KM.makeOffer(s, KM.rng(k))) { if (['tspl'].includes(c.id) || ['shrec', 'shrad'].includes(c.id) || ['cspd', 'ccap'].includes(c.id) || ['rtech', 'rdmg'].includes(c.id) || ['trate', 'tdmg', 'thp', 'splash', 'frost', 'scrit', 'brate'].includes(c.id)) bad.push(c.id); }
    ok('upgrade prerequisites: no follow-up card before its system exists', bad.length === 0, [...new Set(bad)]);
    s.stats.archer = 0.15; s.t = 3 * 60; let eraIds = 0; for (let k = 0; k < 200; k++) if (KM.makeOffer(s, KM.rng(k)).some(c => c.id === 'rtech')) eraIds++;
    ok('weapon era 2 (javelins) unlocks after its minute gate', eraIds > 0);
    s.stats.rtech = 1; s.t = 3 * 60; let early = 0; for (let k = 0; k < 200; k++) if (KM.makeOffer(s, KM.rng(k)).some(c => c.id === 'rtech')) early++;
    ok('no technology jumps: the next era waits for its minute gate', early === 0);
    let mono = true; for (let k = 1; k < KM.RTECH.length; k++) if (KM.RTECH[k].at <= KM.RTECH[k - 1].at || KM.RTECH[k].range < KM.RTECH[k - 1].range) mono = false;
    s.offer = [{ id: 'rtech' }]; s.coins = 1e9; s.pick(0); ok('ranged eras advance one step at a time with rising range', mono && s.stats.rtech === 2 && KM.RTECH.map(r => r.wpn).join() === 'rock,spear,bow,xbow,musket,rifle,pulse'); }
  // ATTACK / DEFEND + cohesion: an overwhelming army pushes far ahead, DEFEND pulls it back into formation
  const stage = (seed) => { const s = new KM.Sim({ seed }); s.budget = -1e9; s.formT = 1e9; s.nextPush = s.nextBoss = 1e12; s.L.inv = 1e9; s.t = 300; s.stats.rate = 0;
    for (let k = 0; k < 260; k++) s.spawn(0, KM.FRIEND[k % 6 === 0 ? 1 : k % 13 === 0 ? 2 : 0], (s.rng() - 0.5) * 16, s.L.z - 6 - s.rng() * 24, { hp: s.stats.hp * 6, dmg: s.stats.dmg * 3, spd: 1 });
    return s; };
  const feed = (s, n) => { for (let k = 0; k < n; k++) s.spawn(1, KM.ENEMY_BY.grunt, (s.rng() - 0.5) * 16, s.front - 40 - s.rng() * 20, { hp: 0.3, dmg: 0.5, spd: 1 }); };
  const aheadStats = s => { let n = 0, sum = 0, far = 0, rz = 0, rn = 0, mz = 0, mn = 0; for (let i = 0; i < s.hi; i++) if (s.st[i] === 1 && s.team[i] === 0 && s.role[i] !== 4) { const a = s.L.z - s.z[i]; n++; sum += a; if (a > 35) far++; if (s.role[i] === 3) { rz += a; rn++; } else { mz += a; mn++; } } return { mean: sum / n, far, ranged: rz / Math.max(1, rn), melee: mz / Math.max(1, mn) }; };
  { const s = stage(3); for (let k = 0; k < 60 * 25; k++) { if (k % 60 === 0) feed(s, 12); s.step(1 / 60); } const a = aheadStats(s);
    ok('ATTACK: cohesion radius keeps the army in useful space (no runaway beyond ~35 m)', a.far <= 3, a);
    ok('ATTACK: ranged troops stay behind the melee line', a.ranged < a.melee, a);
    s.setPosture(1); let peak = 0; const t0 = Date.now(); for (let k = 0; k < 60 * 10; k++) { if (k % 60 === 0) feed(s, 6); s.step(1 / 60); } const b = aheadStats(s);
    ok('DEFEND: the army contracts back around the command group', b.mean < 11 && b.mean < a.mean - 3, { attack: a.mean, defend: b.mean });
    ok('DEFEND: ranged form the rear line, melee the front', b.ranged < b.melee - 1, b);
    let farT = 0; for (let i = 0; i < s.hi; i++) if (s.st[i] === 1 && s.team[i] === 0 && s.tgt[i] >= 0 && s.L.z - s.z[s.tgt[i]] > 13.5) farT++;
    ok('DEFEND: soldiers stop acquiring distant enemies', farT === 0, farT);
    // moving formation: the group travels with the tank
    const x0 = b; s.moveTo(-5, 0); for (let k = 0; k < 60 * 6; k++) s.step(1 / 60); let cx = 0, n = 0; for (let i = 0; i < s.hi; i++) if (s.st[i] === 1 && s.team[i] === 0) { cx += s.x[i]; n++; }
    ok('DEFEND: formation travels with the tank (not a stationary base)', cx / n < -1.5, cx / n);
    s.setPosture(0); for (let k = 0; k < 60 * 8; k++) { if (k % 60 === 0) feed(s, 12); s.step(1 / 60); } const c = aheadStats(s);
    ok('ATTACK released: the line surges forward again', c.mean > b.mean + 4, { defend: b.mean, attack: c.mean }); }
  { const s = stage(9); for (let k = 0; k < 600; k++) s.spawn(1, KM.ENEMY_BY.grunt, (s.rng() - 0.5) * 16, s.front - 30 - s.rng() * 30, { hp: 30, dmg: 1, spd: 1 }); for (let k = 0; k < 30; k++) s.step(1 / 60);
    let t = process.hrtime.bigint(); for (let k = 0; k < 20; k++) s.step(1 / 60); const base = Number(process.hrtime.bigint() - t) / 20;
    s.setPosture(1); t = process.hrtime.bigint(); for (let k = 0; k < 20; k++) s.step(1 / 60); const sw = Number(process.hrtime.bigint() - t) / 20;
    ok('posture switch causes no simulation spike (~860 units)', sw < base * 2 + 2e6, { baseMs: (base / 1e6).toFixed(2), switchMs: (sw / 1e6).toFixed(2) }); }
  // ranged spacing: archers keep their preferred distance and fall back from melee
  { const s = mk(7); s.stats.rtech = 2; s.L.inv = 1e9; const a = s.spawn(0, KM.FRIEND[1], 0, s.L.z - 8, { hp: 1e5, dmg: 1, spd: 1 }); const e = s.spawn(1, KM.ENEMY_BY.grunt, 0, s.L.z - 13, { hp: 1e6, dmg: 0, spd: 0.6 });
    let minD = 99; for (let k = 0; k < 60 * 6; k++) { s.step(1 / 60); minD = Math.min(minD, Math.hypot(s.x[a] - s.x[e], s.z[a] - s.z[e])); }
    ok('ranged troops keep standoff distance (fall back instead of melee)', minD > 2.2, minD); }
  // collectors: fetch → carry → return → deposit; currency only counts on deposit; death drops the load
  { const s = mk(11); s.L.inv = 1e9; s.coins = 0; s.stats.collectors = 1; for (let k = 0; k < 30; k++) s.step(1 / 60);
    const col = (() => { for (let i = 0; i < s.hi; i++) if (s.st[i] === 1 && s.role[i] === 4) return i; return -1; })();
    ok('collector deploys when unlocked', col >= 0 && s.nCol === 1);
    s.dropCoin(s.L.x + 7, s.L.z - 8, 5); let picked = false, dep = 0, coinsWhileCarrying = -1; s.on((e, i, v) => { if (e === 'pickup') picked = true; if (e === 'deposit') dep += v; });
    for (let k = 0; k < 60 * 12 && !dep; k++) { s.step(1 / 60); if (picked && s.carry[col] > 0 && coinsWhileCarrying < 0) coinsWhileCarrying = s.coins; }
    ok('collector retrieves a distant coin and currency does not rise while carrying', picked && coinsWhileCarrying === 0, { picked, coinsWhileCarrying });
    ok('collector deposit adds the carried value to currency', dep === 5 && s.coins === 5 && s.colCoins === 5, { dep, coins: s.coins });
    s.dropCoin(s.L.x - 7, s.L.z - 9, 8); for (let k = 0; k < 60 * 6 && !(s.carry[col] > 0); k++) s.step(1 / 60); const c0 = s.coins, carried = s.carry[col];
    let dropped = 0; for (let k = 0; k < s.c.x.length; k++) if (s.c.st[k] === 1) dropped += s.c.v[k]; s.kill(col); let after = 0; for (let k = 0; k < s.c.x.length; k++) if (s.c.st[k] === 1) after += s.c.v[k];
    ok('collector killed while carrying: currency unchanged, half the load dropped, half lost', carried === 8 && s.coins === c0 && Math.abs(after - dropped - 4) < 1e-6 && s.colLost === 4, { carried, after, dropped, lost: s.colLost });
    s.stats.collectors = 3; for (let k = 0; k < 60 * 20; k++) s.step(1 / 60); let n = 0; for (let i = 0; i < s.hi; i++) if (s.st[i] === 1 && s.role[i] === 4) n++;
    ok('collector cap: exactly the unlocked number of collectors', n === 3 && s.nCol === 3, n);
    s.dropCoin(s.L.x + 0.5, s.L.z - 0.5, 2); const cc = s.coins; for (let k = 0; k < 60 * 2; k++) s.step(1 / 60);
    ok('tank magnet still auto-collects nearby coins', s.coins >= cc + 2); }
  { const s = mk(12); s.L.inv = 1e9; s.stats.collectors = 1; for (let k = 0; k < 30; k++) s.step(1 / 60); const col = (() => { for (let i = 0; i < s.hi; i++) if (s.st[i] === 1 && s.role[i] === 4) return i; return -1; })();
    s.dropCoin(s.L.x + 3, s.L.z - 14, 9); for (let k = 0; k < 6; k++) s.spawn(1, KM.ENEMY_BY.grunt, s.L.x + 3 + k * 0.3, s.L.z - 14.5, { hp: 1e6, dmg: 0, spd: 0.01 });
    let picked = false; s.on(e => { if (e === 'pickup') picked = true; }); for (let k = 0; k < 60 * 6; k++) s.step(1 / 60);
    ok('collectors avoid coins under enemy pressure', !picked && col >= 0); }
  // bot understands posture
  { let toDef = 0, toAtk = 0; for (const seed of [21, 22, 23, 24]) { const s = new KM.Sim({ seed }); s.on((e, p) => { if (e === 'posture') p ? toDef++ : toAtk++; }); while (s.alive && s.t < 600) { KM.bot(s, 1 / 60, 1); s.step(1 / 60); } }
    ok('bot switches to DEFEND under pressure and back to ATTACK when stable', toDef > 0 && toAtk > 0, { toDef, toAtk }); }
}

// --- quality tiers, benchmark stats, playtest report, battlefield edge modules ---
{
  ok('desktop auto-detects HIGH, phones MEDIUM, weak phones LOW', KM.detectQuality({ ua: 'Mozilla/5.0 (Macintosh)', cores: 8 }) === 'high' && KM.detectQuality({ ua: 'iPhone', cores: 6, touch: true }) === 'medium' && KM.detectQuality({ ua: 'Android Mobile', cores: 2 }) === 'low');
  ok('stored benchmark recommendation wins over heuristics', KM.detectQuality({ ua: 'iPhone', stored: 'high' }) === 'high' && KM.detectQuality({ ua: 'Macintosh', stored: 'low', cores: 8 }) === 'low');
  ok('quality tiers step down high → medium → low', KM.nextLowerQuality('high') === 'medium' && KM.nextLowerQuality('medium') === 'low' && KM.nextLowerQuality('low') === 'low');
  ok('tiers shrink budgets monotonically', KM.QUALITY.high.lodNear > KM.QUALITY.medium.lodNear && KM.QUALITY.medium.lodNear > KM.QUALITY.low.lodNear && KM.QUALITY.low.shadows === false && !KM.QUALITY.medium.bloom && KM.QUALITY.high.bloom);
  const st = (e, m, h, x) => [{ tier: 'EARLY', fps: e }, { tier: 'MEDIUM', fps: m }, { tier: 'HEAVY', fps: h }, { tier: 'EXTREME', fps: x }];
  ok('recommendation HIGH / MEDIUM / LOW thresholds', KM.recommendQuality(st(60, 60, 58, 45)) === 'high' && KM.recommendQuality(st(60, 58, 45, 24)) === 'medium' && KM.recommendQuality(st(50, 35, 20, 12)) === 'low');
  const frames = Array.from({ length: 200 }, (_, i) => i === 199 ? 80 : i > 196 ? 40 : 16.67), b = KM.benchStage('HEAVY', 900, frames, [4, 5, 6], 512000, 108, 64e6);
  ok('bench stage: avg fps, 1% low, worst frame, tris, calls, JS, memory', Math.abs(b.fps - 57.4) < 2 && b.low1 < 25 && b.worstMs === 80 && b.tris === 512000 && b.calls === 108 && b.jsMs === 5 && b.heapMB === 64 && b.units === 900, b);
  const pr = KM.playtestReport({ time: 312, reason: 'breach', peakArmy: 88, coins: 340, kills: 900, picks: ['ARMY SIZE +12', 'BUILD ARROW TOWER NEW'] }, { easy: true, fair: false, again: true }, { runNo: 3, when: 'T' });
  ok('playtest report captures run + three answers', pr.survival === '5:12' && pr.death === 'breach' && pr.upgrades.length === 2 && pr.easyToUnderstand === 'YES' && pr.deathFair === 'NO' && pr.playAgain === 'YES' && /survived 5:12/.test(pr.text));
  ok('playtest report tolerates unanswered questions', KM.playtestReport({ time: 5 }, {}, {}).deathFair === '—');
  // edges: playable lane always flat, start area open, masks continuous, river and cliff never both strong on one side
  let laneFlat = true, startOpen = true, both = false, jump = 0, prev = null;
  for (let z = 0; z > -20000; z -= 3.7) for (const sd of [-1, 1]) {
    const e = KM.edgeAt(sd, z); if (e.river > 0.6 && e.cliff > 0.6) both = true; if (z > -30 && (e.river > 0 || e.cliff > 0)) startOpen = false;
    for (const x of [0, 4, 8, 9.4, 10]) if (Math.abs(KM.edgeHeight(sd * x, z, 0.5, 'field')) > 0.01) laneFlat = false;
    if (sd === 1) { if (prev) jump = Math.max(jump, Math.abs(e.river - prev.river), Math.abs(e.cliff - prev.cliff)); prev = e; } }
  ok('playable lane stays flat beside every edge module', laneFlat);
  ok('start area is open meadow (no cliffs/water near the launch)', startOpen);
  ok('a side never has a strong river and a strong cliff at once', !both);
  ok('edge masks change smoothly (no seams between streamed chunks)', jump < 0.25, jump);
  let rivers = 0, cliffs = 0; for (let z = -100; z > -12000; z -= 50) { const e = KM.edgeAt(1, z); if (e.river > 0.6) rivers++; if (e.cliff > 0.6) cliffs++; }
  ok('rivers and cliffs both recur along the endless road', rivers > 10 && cliffs > 10, { rivers, cliffs });
}

// --- mixed melee (locked baseline; guards against a return to the old banded line) ---
{
  const W = KM.W, E = KM.ENEMY_BY;
  const stage = (seed, off, n) => { const s = new KM.Sim({ seed }); s.meleeOff = !!off; s.t = 400; s.budget = -1e9; s.formT = 1e9; s.nextPush = s.nextBoss = 1e12; s.L.inv = 1e9; s.stats.rate = 0;
    const D = KM.difficulty(s.t), r = KM.rng(seed * 7 + 1); n = n || 350;
    for (let k = 0; k < n; k++) { s.spawn(0, KM.FRIEND[k % 9 === 0 ? 2 : k % 6 === 0 ? 1 : 0], (r() - 0.5) * 17, s.front - 6 - r() * 14, { hp: s.stats.hp * 3, dmg: s.stats.dmg, spd: 1 });
      s.spawn(1, [E.grunt, E.grunt, E.shield, E.runner, E.archer, E.knight, E.grunt, E.imp, E.brute][k % 9], (r() - 0.5) * 17, s.front - 26 - r() * 14, { hp: D.hp * 2, dmg: D.dmg * 0.5, spd: D.speed }); }
    return s; };
  const measure = (off) => { const acc = { spread: 0, mixing: 0, pen: 0, n: 0 }; let bad = 0, esc = 0, minD = 9, fronts = [];
    for (const seed of [3, 5, 8]) { const s = stage(seed, off); const ev = { shove: 0 }; s.listeners.push(t => { if (t === 'shove') ev.shove++; });
      for (let f = 0; f < 60 * 14; f++) { s.step(1 / 60);
        if (f > 60 * 5 && f % 30 === 0) { const m = KM.meleeMetrics(s); if (m.zones >= 4) { acc.spread += m.spread; acc.mixing += m.mixing; acc.pen += m.penetrated; acc.n++; fronts.push(m.fronts); } }
        if (f % 60 === 0) for (let i = 0; i < s.hi; i++) if (s.st[i] === 1) { if (!Number.isFinite(s.x[i]) || !Number.isFinite(s.z[i])) bad++; if (Math.abs(s.x[i]) > W.LANE + 0.6) esc++; } }
      acc.shove = (acc.shove || 0) + ev.shove; }
    return { spread: acc.spread / acc.n, mixing: acc.mixing / acc.n, pen: acc.pen / acc.n, bad, esc, shove: acc.shove || 0, fronts }; };
  const on = measure(false), off = measure(true);
  ok('melee: mixing clearly above the banded baseline', on.mixing > 0.28 && on.mixing > off.mixing + 0.05, { on: on.mixing, off: off.mixing });
  ok('melee: penetration meaningfully above baseline', on.pen > 0.07 && on.pen > off.pen * 2, { on: on.pen, off: off.pen });
  ok('melee: zone fronts spread wider than the old ~1.9 m line', on.spread > 3, { on: on.spread, off: off.spread });
  ok('melee: zone fronts diverge (not one straight line)', on.fronts.some(f => Math.max(...f) - Math.min(...f) > 5));
  ok('melee: brutes/heavies generate displacement (shove events)', on.shove > 10, on.shove);
  ok('melee: no NaN positions in mass battle', on.bad === 0, on.bad);
  ok('melee: no unit escapes the playable bounds', on.esc === 0, on.esc);
  // 8 independent zones: pressure varies across strips
  { const s = stage(4); for (let f = 0; f < 60 * 8; f++) s.step(1 / 60); const P = Array.from(s.zP), mean = P.reduce((a, c) => a + c, 0) / 8, v = P.reduce((a, c) => a + (c - mean) ** 2, 0) / 8;
    ok('melee: 8 independent pressure zones', P.length === 8 && v > 0.003, { v, P: P.map(p => +p.toFixed(2)) }); }
  // breakthrough units cross the local line; rear units stay behind
  { const s = stage(6); let deep2 = 0, n2 = 0, rearBehind = 0, n3 = 0;
    for (let f = 0; f < 60 * 12; f++) { s.step(1 / 60); if (f > 60 * 5 && f % 60 === 0) { const m = KM.meleeMetrics(s); const fr = s.front;
      const zf = []; for (let i = 0; i < s.hi; i++) if (s.st[i] === 1 && s.team[i] === 1) zf.push(s.z[i]); zf.sort((a, c) => c - a); const redFront = zf[Math.floor(zf.length * 0.15)];
      const bz = []; for (let i = 0; i < s.hi; i++) if (s.st[i] === 1 && s.team[i] === 0) bz.push(s.z[i]); bz.sort((a, c) => a - c); const blueFront = bz[Math.floor(bz.length * 0.15)], line = (redFront + blueFront) / 2;
      for (let i = 0; i < s.hi; i++) if (s.st[i] === 1 && s.team[i] === 1) { if (s.role[i] === 2) { n2++; if (s.z[i] > line + 1.5) deep2++; } if (s.role[i] === 3) { n3++; if (s.z[i] < line - 1) rearBehind++; } } } }
    ok('melee: breakthrough units cross the local line', deep2 / n2 > 0.08, { r: deep2 / n2 });
    ok('melee: rear (ranged) units prefer rear positions', rearBehind / n3 > 0.6, { r: rearBehind / n3 }); }
  // death opens space: neighbours of a killed unit get impulses/think resets
  { const s = stage(2); for (let f = 0; f < 60 * 7; f++) s.step(1 / 60); let v = -1; for (let i = 0; i < s.hi; i++) if (s.st[i] === 1 && s.team[i] === 1 && s.tgt[i] >= 0) { v = i; break; }
    const nb = []; for (let j = 0; j < s.hi; j++) if (s.st[j] === 1 && s.team[j] === 0 && Math.hypot(s.x[j] - s.x[v], s.z[j] - s.z[v]) < 2.2) nb.push([j, s.vx[j], s.vz[j]]);
    s.kill(v); let moved = 0; for (const [j, vx, vz] of nb) if (Math.hypot(s.vx[j] - vx, s.vz[j] - vz) > 0.05) moved++;
    ok('melee: a death opens local space (victors surge into the gap)', nb.length > 0 && moved === nb.length, { nb: nb.length, moved }); }
  // small battles stay crisp
  { const s = stage(9, false, 25); s.step(1 / 60); ok('melee: small battles do not get full mixed-melee', s.mi === 0, s.mi);
    const m = stage(9, false, 60); m.step(1 / 60); ok('melee: medium battles ramp (partial)', m.mi > 0 && m.mi < 1, m.mi);
    const b = stage(9, false, 200); b.step(1 / 60); ok('melee: full effect by ~160 units', b.mi === 1, b.mi); }
  // early pacing preserved
  { let okP = true, n2 = 0; const info = [];
    for (const seed of [1, 2, 3, 4]) { const s = new KM.Sim({ seed }); let clash = 0, coin = 0, up1 = 0, up2 = 0;
      s.listeners.push((t) => { if (t === 'hit' && !clash) clash = s.t; if (t === 'coin' && !coin) coin = s.t; if (t === 'upgrade') { if (!up1) up1 = s.t; else if (!up2) up2 = s.t; } });
      while (s.alive && s.t < 60 && !up2) { KM.bot(s, 1 / 60, 1); s.step(1 / 60); }
      info.push([clash, coin, up1, up2].map(v => +v.toFixed(1)));
      if (!(clash > 3.5 && clash < 7.5 && coin > 7 && coin < 15 && up1 >= 17 && up1 <= 24)) okP = false; if (up2 >= 33 && up2 <= 43) n2++; }
    // the bot ignores coins >12 m ahead of the front, so one seed may stall before its 2nd upgrade (same with melee off)
    ok('early pacing within tolerance (clash ~5–6, coin ~11, upgrades 18–23 / 35–41)', okP && n2 >= 3, info); }
}

// --- bench quality-change honesty + playtest retry signal ---
{
  const good = [{ tier: 'EARLY', fps: 60 }, { tier: 'MEDIUM', fps: 60 }, { tier: 'HEAVY', fps: 58 }, { tier: 'EXTREME', fps: 50 }];
  ok('bench: no quality change → normal recommendation', KM.benchRecommend(good, []) === 'high');
  ok('bench: an automatic step-down caps the recommendation at the lower tier', KM.benchRecommend(good, [{ from: 'HIGH', to: 'MEDIUM' }]) === 'medium' && KM.benchRecommend(good, [{ from: 'HIGH', to: 'MEDIUM' }, { from: 'MEDIUM', to: 'LOW' }]) === 'low');
  const run = { time: 70, reason: 'breach', peakArmy: 50, coins: 30, kills: 90, picks: [] };
  const a = KM.playtestReport(run, {}, { runNo: 2, retry: { retried: null }, history: [{ run: 1, retried: true, secs: 1.8 }, { run: 0, retried: false, secs: 6 }] });
  ok('playtest: report carries actual TRY AGAIN presses, seconds and retry rate', a.pressedTryAgain === 'PENDING' && a.sessionRetries[0].pressedTryAgain === 'YES' && a.sessionRetries[0].seconds === 1.8 && a.retryRate === 0.5 && /Pressed TRY AGAIN: PENDING/.test(a.text) && /retry 1.8s/.test(a.text), a);
  const b = KM.playtestReport(run, {}, { runNo: 1, retry: { retried: true, secs: 2.4 } });
  ok('playtest: retried run reports YES + seconds', b.pressedTryAgain === 'YES' && b.retrySeconds === 2.4);
}

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
