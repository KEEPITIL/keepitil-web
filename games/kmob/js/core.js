/* KMOB core — pure logic, no DOM/THREE. Difficulty curves, enemy/upgrade tables, economy, save data, chunk plan.
   Loaded by the browser and by the Node tests (tests/kmob.test.js). */
(function (G) {
  const KM = G.KM = G.KM || {};

  // Deterministic RNG (mulberry32) so runs can be replayed for balancing/debugging.
  KM.rng = function (seed) {
    let a = (seed >>> 0) || 1;
    const f = function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    f.range = (lo, hi) => lo + (hi - lo) * f();
    f.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f());
    f.pick = arr => arr[Math.floor(f() * arr.length)];
    return f;
  };

  // ---------- World constants ----------
  KM.W = {
    LANE: 9.4,          // half-width of the playable lane
    ADV: 1.05,          // forward march speed of the battle front (u/s)
    SPAWN_DZ: 58,       // enemies enter this far ahead of the front
    BREACH_DZ: 7,       // enemies this far behind the front breach the line
    HOLD_DZ: 20,        // friendlies stop advancing this far ahead
    OFFZ_MIN: -12, OFFZ_MAX: 1.5, // launcher forward/back freedom (relative to front)
    CHUNK: 24,
    MAX_ENEMY: 1700, MAX_FRIEND: 1600,
  };

  // ---------- Difficulty: every curve non-decreasing in time, no hard cap ----------
  KM.TUNE = {
    spawn: [1.5, 0.63, 0.018],   // a + b*m + c*m^2  (budget units per second)
    hp: [0.67, 0.057, 0.0021],
    dmg: [1, 0.045, 0.0007],
    speedMax: 1.45, speedPerMin: 0.008,
    eliteStart: 5, elitePerMin: 0.012, eliteMax: 0.4,
    coin: [0.9, 0.034, 0],
    pushEvery: 90, bossFrom: 13, bossEvery: 180,
  };
  const poly = (k, m) => k[0] + k[1] * m + k[2] * m * m;
  KM.difficulty = function (tSec) {
    const T = KM.TUNE, m = Math.max(0, tSec) / 60;
    return {
      m,
      spawnRate: poly(T.spawn, m),
      hp: poly(T.hp, m),
      dmg: poly(T.dmg, m),
      speed: Math.min(T.speedMax, 1 + T.speedPerMin * m),
      eliteChance: Math.min(T.eliteMax, T.elitePerMin * Math.max(0, m - T.eliteStart)),
      coinMul: poly(T.coin, m),
      era: Math.floor(m / 8),
      tier: 1 + Math.floor(m * 2),
    };
  };

  // ---------- Enemy roster (unlock minute, base stats, budget cost) ----------
  // flags: r=ranged, s=splash, sh=frontal shield, he=healer, el=elite, ex=explodes, boss
  KM.ENEMY = [
    { k: 'grunt',   at: 0,    hp: 22,   dmg: 4,  cd: 1.0, spd: 2.6, rng: 0.75, rad: 0.36, sc: 1.0,  arm: 0,  coin: 1,  cost: 1,   wpn: 'sword' },
    { k: 'imp',     at: 0.6,  hp: 9,    dmg: 2,  cd: 0.7, spd: 3.5, rng: 0.6,  rad: 0.28, sc: 0.72, arm: 0,  coin: 0.5, cost: 0.45, wpn: 'none' },
    { k: 'shield',  at: 1.3,  hp: 34,   dmg: 4,  cd: 1.1, spd: 2.2, rng: 0.75, rad: 0.4,  sc: 1.05, arm: 4,  coin: 2,  cost: 1.7, wpn: 'sword', sh: 1 },
    { k: 'runner',  at: 2.2,  hp: 15,   dmg: 4,  cd: 0.8, spd: 5.2, rng: 0.7,  rad: 0.34, sc: 0.92, arm: 0,  coin: 1,  cost: 1.0, wpn: 'dagger' },
    { k: 'archer',  at: 3.0,  hp: 18,   dmg: 5,  cd: 1.7, spd: 2.3, rng: 8.5,  rad: 0.36, sc: 1.0,  arm: 0,  coin: 2,  cost: 1.6, wpn: 'bow', r: 1 },
    { k: 'knight',  at: 4.5,  hp: 72,   dmg: 7,  cd: 1.1, spd: 2.1, rng: 0.8,  rad: 0.44, sc: 1.18, arm: 9,  coin: 3,  cost: 3.2, wpn: 'sword', sh: 1 },
    { k: 'brute',   at: 6.0,  hp: 330,  dmg: 22, cd: 1.6, spd: 1.9, rng: 1.1,  rad: 0.8,  sc: 1.9,  arm: 4,  coin: 12, cost: 13,  wpn: 'axe', s: 1.4, el: 1 },
    { k: 'bomber',  at: 7.0,  hp: 20,   dmg: 34, cd: 9,   spd: 3.7, rng: 0.7,  rad: 0.36, sc: 0.95, arm: 0,  coin: 2,  cost: 1.7, wpn: 'bomb', ex: 2.3 },
    { k: 'cannon',  at: 8.5,  hp: 170,  dmg: 30, cd: 3.4, spd: 1.2, rng: 14,   rad: 0.75, sc: 1.4,  arm: 6,  coin: 10, cost: 10,  wpn: 'cannon', r: 1, s: 2.3 },
    { k: 'shaman',  at: 10,   hp: 60,   dmg: 6,  cd: 1.5, spd: 2.0, rng: 7,    rad: 0.4,  sc: 1.1,  arm: 2,  coin: 5,  cost: 5,   wpn: 'staff', r: 1, he: 8 },
    { k: 'warlord', at: 13,   hp: 2100, dmg: 46, cd: 1.4, spd: 1.6, rng: 1.4,  rad: 1.15, sc: 2.7,  arm: 12, coin: 60, cost: 60,  wpn: 'axe', s: 2.0, el: 1, boss: 1 },
  ];
  KM.ENEMY.forEach((e, i) => { e.id = i; });
  KM.ENEMY_BY = Object.fromEntries(KM.ENEMY.map(e => [e.k, e]));
  KM.unlocked = m => KM.ENEMY.filter(e => e.at <= m && !e.boss);

  // Friendly unit kinds (index offset 32 so kind ids never collide with enemies)
  KM.FRIEND = [
    { k: 'soldier', hp: 1, dmg: 1, rng: 0.75, rad: 0.36, sc: 1, cd: 0.85, wpn: 'sword' },
    { k: 'archerF', hp: 0.7, dmg: 0.9, rng: 8, rad: 0.36, sc: 1, cd: 1.4, wpn: 'bow', r: 1 },
    { k: 'knightF', hp: 3.2, dmg: 2.2, rng: 0.9, rad: 0.5, sc: 1.35, cd: 1.0, wpn: 'sword', sh: 1 },
  ];
  KM.FRIEND.forEach((e, i) => { e.id = 32 + i; });

  // ---------- Run stats + upgrades ----------
  KM.baseStats = function (perm) {
    perm = perm || {};
    return {
      cap: 45 + 8 * (perm.army || 0), rate: 4.8, hp: 20, dmg: 4.5, armor: 0, speed: 4.3, atk: 1,
      magnet: 2.4 * (1 + 0.1 * (perm.magnet || 0)), crit: 0.05, archer: 0, knight: 0,
      maxHp: 100 + 10 * (perm.plating || 0), towerRate: 1, towerRange: 1, towerDmg: 1, splash: 1, frost: 1, sniperCrit: 0.1, barracksRate: 1, bannerR: 1, towerHp: 1, towerArmor: 0,
      lv: { cap: 0, rate: 0, hp: 0, dmg: 0, armor: 0, speed: 0, atk: 0, magnet: 0, crit: 0, archer: 0, knight: 0, plating: 0, trate: 0, trange: 0, tdmg: 0, splash: 0, frost: 0, scrit: 0, brate: 0, bradius: 0, thp: 0, tarm: 0 },
    };
  };

  KM.TOWERS = {
    arrow:    { name: 'Arrow Tower',   range: 13, cd: 0.55, dmg: 9,   color: '#3a8bff' },
    cannon:   { name: 'Cannon Tower',  range: 12, cd: 2.2,  dmg: 32,  splash: 2.3, color: '#ff7a2f' },
    frost:    { name: 'Frost Tower',   range: 11, cd: 1.6,  dmg: 4,   splash: 2.6, slow: 2.2, color: '#5fe0ff' },
    sniper:   { name: 'Sniper Tower',  range: 24, cd: 2.6,  dmg: 140, color: '#c58cff' },
    barracks: { name: 'Barracks',      range: 0,  cd: 5,    dmg: 0,   color: '#ffd23a' },
    banner:   { name: 'Shield Banner', range: 7,  cd: 1,    dmg: 0,   color: '#3cd27a' },
  };
  KM.TOWER_SLOTS = [{ x: -7.3, dz: -3 }, { x: 7.3, dz: -3 }, { x: -7.6, dz: -9.5 }, { x: 7.6, dz: -9.5 }, { x: -7.9, dz: -16 }, { x: 7.9, dz: -16 }];
  // Defensive lines (predefined positions relative to the advancing front; built automatically by upgrade cards)
  KM.WALLS = {
    barricade: { dz: -7.5, xs: [-5.6, -1.9, 1.9, 5.6], per: 2, hp: 90, arm: 2, w: 3.0, d: 0.8 },
    wall: { dz: -4.5, xs: [-4.6, 0, 4.6], per: 3, hp: 260, arm: 8, w: 3.9, d: 0.9 },
  };
  KM.slotsUnlocked = m => 2 + (m >= 3 ? 2 : 0) + (m >= 8 ? 2 : 0);

  // cat: army | defense ; color used for card face
  KM.UPGRADES = [
    { id: 'cap',    cat: 'army', title: 'ARMY SIZE',   val: '+12',  icon: 'army',   color: 'blue',  w: 10, apply: s => { s.cap += 12; } },
    { id: 'rate',   cat: 'army', title: 'DEPLOY SPEED', val: '+12%', icon: 'bolt',  color: 'blue',  w: 8, apply: s => { s.rate *= 1.12; } },
    { id: 'dmg',    cat: 'army', title: 'DAMAGE',      val: '+12%', icon: 'sword',  color: 'red',   w: 9, apply: s => { s.dmg *= 1.12; } },
    { id: 'hp',     cat: 'army', title: 'SOLDIER HEALTH', val: '+12%', icon: 'helm', color: 'green', w: 9, apply: s => { s.hp *= 1.12; } },
    { id: 'armor',  cat: 'army', title: 'ARMOR',       val: '+2',   icon: 'shield', color: 'green', w: 6, apply: s => { s.armor += 2; } },
    { id: 'atk',    cat: 'army', title: 'ATTACK SPEED', val: '+10%', icon: 'swords', color: 'red',  w: 6, apply: s => { s.atk *= 1.1; } },
    { id: 'speed',  cat: 'army', title: 'MARCH SPEED', val: '+8%',  icon: 'boot',   color: 'blue',  w: 4, max: 6, apply: s => { s.speed *= 1.08; } },
    { id: 'magnet', cat: 'army', title: 'COIN MAGNET', val: '+20%', icon: 'magnet', color: 'gold',  w: 5, max: 8, apply: s => { s.magnet *= 1.2; } },
    { id: 'crit',   cat: 'army', title: 'CRITICAL',    val: '+5%',  icon: 'star',   color: 'red',   w: 4, max: 8, apply: s => { s.crit += 0.05; } },
    { id: 'archer', cat: 'army', title: 'ARCHERS',     val: '+15%', icon: 'bow',    color: 'blue',  w: 4, max: 4, at: 1.5, apply: s => { s.archer = Math.min(0.6, s.archer + 0.15); } },
    { id: 'knight', cat: 'army', title: 'KNIGHTS',     val: '1 in ' , icon: 'helm', color: 'gold',  w: 3, max: 4, at: 3, apply: s => { s.knight = s.knight ? Math.max(4, s.knight - 3) : 12; } },
    { id: 'plating',cat: 'defense', title: 'LAUNCHER ARMOR', val: '+25 HP', icon: 'heart', color: 'green', w: 4, max: 8, apply: (s, run) => { s.maxHp += 25; if (run) run.heal(25); } },
    { id: 'trate',  cat: 'defense', title: 'TOWER FIRE RATE', val: '+12%', icon: 'tower', color: 'red', w: 4, needTower: 1, max: 8, apply: s => { s.towerRate *= 1.12; } },
    { id: 'thp',    cat: 'defense', title: 'TOWER HEALTH', val: '+25%', icon: 'heart', color: 'green', w: 3.5, needStruct: 1, max: 8, apply: s => { s.towerHp *= 1.25; } },
    { id: 'tarm',   cat: 'defense', title: 'TOWER ARMOR', val: '+3', icon: 'shield', color: 'green', w: 3, needStruct: 1, max: 6, apply: s => { s.towerArmor += 3; } },
    { id: 'tdmg',   cat: 'defense', title: 'TOWER DAMAGE', val: '+15%', icon: 'tower', color: 'red', w: 4, needTower: 1, max: 8, apply: s => { s.towerDmg *= 1.15; } },
    { id: 'splash', cat: 'defense', title: 'CANNON SPLASH', val: '+15%', icon: 't_cannon', color: 'tower', w: 3, needType: 'cannon', max: 5, apply: s => { s.splash *= 1.15; } },
    { id: 'frost',  cat: 'defense', title: 'DEEP FREEZE', val: '+20%', icon: 't_frost', color: 'tower', w: 3, needType: 'frost', max: 5, apply: s => { s.frost *= 1.2; } },
    { id: 'scrit',  cat: 'defense', title: 'SNIPER CRIT', val: '+10%', icon: 't_sniper', color: 'tower', w: 3, needType: 'sniper', max: 5, apply: s => { s.sniperCrit = Math.min(0.7, s.sniperCrit + 0.1); } },
    { id: 'brate',  cat: 'defense', title: 'BARRACKS SPEED', val: '+15%', icon: 't_barracks', color: 'tower', w: 3, needType: 'barracks', max: 5, apply: s => { s.barracksRate *= 1.15; } },
    { id: 'bradius',cat: 'defense', title: 'BANNER RADIUS', val: '+12%', icon: 't_banner', color: 'tower', w: 3, needType: 'banner', max: 5, apply: s => { s.bannerR *= 1.12; } },
    { id: 'trange', cat: 'defense', title: 'TOWER RANGE', val: '+10%', icon: 'tower', color: 'blue', w: 3, needTower: 1, max: 5, apply: s => { s.towerRange *= 1.1; } },
  ];
  KM.UPG_BY = Object.fromEntries(KM.UPGRADES.map(u => [u.id, u]));

  KM.upgradeCost = n => Math.round(10 * Math.pow(1.14, n) + 5 * n);

  // Offer 3 distinct choices; tower build/upgrade cards are generated from current tower state.
  KM.makeOffer = function (run, rng) {
    const s = run.stats, m = run.t / 60, opts = [];
    for (const u of KM.UPGRADES) {
      if (u.at && m < u.at) continue;
      if (u.max && (s.lv[u.id] || 0) >= u.max) continue;
      if (u.needTower && !run.towers.some(t => t)) continue;
      if (u.needStruct && !run.towers.some(t => t) && !(run.walls && run.walls.length)) continue;
      if (u.needType && !run.towers.some(t => t && t.type === u.needType)) continue;
      opts.push({ id: u.id, w: u.w, title: u.title, val: u.id === 'knight' ? '1 in ' + (s.knight ? Math.max(4, s.knight - 3) : 12) : u.val, icon: u.icon, color: u.color, cat: u.cat });
    }
    const free = run.towers.findIndex((t, i) => !t && i < KM.slotsUnlocked(m));
    if (free >= 0) for (const k of Object.keys(KM.TOWERS)) {
      if (k === 'sniper' && m < 4) continue; if (k === 'frost' && m < 2) continue;
      opts.push({ id: 'build:' + k, w: run.towers.some(t => t) ? 2.2 : 5, title: 'BUILD ' + KM.TOWERS[k].name.toUpperCase(), val: 'NEW', icon: 't_' + k, color: 'tower', cat: 'defense', tower: k });
    }
    // automatic defensive lines at fixed positions ahead of the launcher
    if (m >= 0.8) { const nb = (run.walls || []).filter(w => w.type === 'barricade').length; opts.push({ id: 'wall:barricade', w: nb ? 1.6 : 3.2, title: nb >= KM.WALLS.barricade.xs.length ? 'REINFORCE BARRICADES' : 'BUILD BARRICADE', val: nb >= KM.WALLS.barricade.xs.length ? '+35% HP' : '+2', icon: 'fence', color: 'gold', cat: 'defense' }); }
    if (m >= 2.5) { const nw = (run.walls || []).filter(w => w.type === 'wall').length; opts.push({ id: 'wall:wall', w: nw ? 1.4 : 2.6, title: nw >= KM.WALLS.wall.xs.length ? 'REINFORCE SHIELD WALL' : 'BUILD SHIELD WALL', val: nw >= KM.WALLS.wall.xs.length ? '+35% HP' : 'NEW', icon: 'wall', color: 'tower', cat: 'defense' }); }
    run.towers.forEach((t, i) => { if (t && t.lvl < 5) opts.push({ id: 'tup:' + i, w: 3.2, title: 'UPGRADE ' + KM.TOWERS[t.type].name.toUpperCase(), val: 'LV ' + (t.lvl + 1), icon: 't_' + t.type, color: 'tower', cat: 'defense', tower: t.type }); });
    const out = [];
    while (out.length < 3 && opts.length) {
      // guarantee at least one army card
      let pool = opts; if (out.length === 2 && !out.some(o => o.cat === 'army')) pool = opts.filter(o => o.cat === 'army');
      if (!pool.length) pool = opts;
      let tot = pool.reduce((a, o) => a + o.w, 0), r = rng() * tot, pick = pool[pool.length - 1];
      for (const o of pool) { r -= o.w; if (r <= 0) { pick = o; break; } }
      out.push(pick); opts.splice(opts.indexOf(pick), 1);
      // never two tower builds in one offer
      if (pick.id.startsWith('build:')) for (let i = opts.length - 1; i >= 0; i--) if (opts[i].id.startsWith('build:')) opts.splice(i, 1);
    }
    return out;
  };

  // ---------- Tokens (rare, persistent) ----------
  KM.tokensFor = (tSec, kills) => Math.floor(Math.sqrt(Math.max(0, tSec) / 40)) + Math.floor(kills / 1500);

  // ---------- Permanent shop ----------
  KM.SHOP = [
    { id: 'army',    kind: 'bonus', name: 'Veteran Recruits', desc: '+5 starting army', max: 3, cost: l => 4 + l * 4 },
    { id: 'magnet',  kind: 'bonus', name: 'Coin Magnet',      desc: '+10% pickup radius', max: 3, cost: l => 3 + l * 3 },
    { id: 'plating', kind: 'bonus', name: 'Iron Plating',     desc: '+10 launcher HP', max: 3, cost: l => 3 + l * 4 },
    { id: 'skin_royal',   kind: 'skin', name: 'Royal Blue',  desc: 'Default launcher', cost: () => 0, color: '#2f6dff', trim: '#f2c14e' },
    { id: 'skin_emerald', kind: 'skin', name: 'Emerald',     desc: 'Launcher skin', cost: () => 6,  color: '#18a86b', trim: '#f2c14e' },
    { id: 'skin_ember',   kind: 'skin', name: 'Ember',       desc: 'Launcher skin', cost: () => 8,  color: '#e0632a', trim: '#2b2b33' },
    { id: 'skin_midnight',kind: 'skin', name: 'Midnight',    desc: 'Launcher skin', cost: () => 10, color: '#3b2f86', trim: '#9ff2ff' },
    { id: 'skin_gold',    kind: 'skin', name: 'Gilded',      desc: 'Launcher skin', cost: () => 18, color: '#e8b52e', trim: '#fff4c2' },
  ];

  // ---------- Save data (versioned, validated, crash-safe double write) ----------
  const KEY = 'kmob.save.v1';
  KM.defaultSave = () => ({
    v: 1, tokens: 0,
    best: { all: 0, comp: 0, daily: { d: '', t: 0 }, weekly: { w: '', t: 0 } },
    totals: { runs: 0, kills: 0, time: 0, coins: 0 },
    perm: { army: 0, magnet: 0, plating: 0 }, owned: { skin_royal: 1 }, equip: { skin: 'skin_royal' },
    settings: { sound: 1, music: 1, haptics: 1, competitive: 0 },
    ach: {},
  });
  const num = (v, d, max) => (typeof v === 'number' && isFinite(v) && v >= 0) ? Math.min(v, max || 1e15) : d;
  KM.validateSave = function (raw) {
    const d = KM.defaultSave(); if (!raw || typeof raw !== 'object') return d;
    d.tokens = Math.floor(num(raw.tokens, 0));
    const b = raw.best || {}; d.best.all = num(b.all, 0); d.best.comp = num(b.comp, 0);
    if (b.daily && typeof b.daily.d === 'string') d.best.daily = { d: b.daily.d, t: num(b.daily.t, 0) };
    if (b.weekly && typeof b.weekly.w === 'string') d.best.weekly = { w: b.weekly.w, t: num(b.weekly.t, 0) };
    for (const k of Object.keys(d.totals)) d.totals[k] = num((raw.totals || {})[k], 0);
    for (const k of Object.keys(d.perm)) { const it = KM.SHOP.find(s => s.id === k); d.perm[k] = Math.min(it.max, Math.floor(num((raw.perm || {})[k], 0))); }
    if (raw.owned && typeof raw.owned === 'object') for (const k of Object.keys(raw.owned)) if (KM.SHOP.some(s => s.id === k && s.kind === 'skin')) d.owned[k] = 1;
    const eq = raw.equip && raw.equip.skin; if (eq && d.owned[eq]) d.equip.skin = eq;
    for (const k of Object.keys(d.settings)) { const v = (raw.settings || {})[k]; if (v === 0 || v === 1) d.settings[k] = v; }
    if (raw.ach && typeof raw.ach === 'object') for (const k of Object.keys(raw.ach)) d.ach[k] = num(raw.ach[k], 0);
    return d;
  };
  KM.loadSave = function (store) {
    for (const k of [KEY, KEY + '.bak']) { try { const s = store.getItem(k); if (s) return KM.validateSave(JSON.parse(s)); } catch (e) { /* try backup */ } }
    return KM.defaultSave();
  };
  KM.writeSave = function (store, data) {
    const s = JSON.stringify(KM.validateSave(data));
    try { store.setItem(KEY + '.bak', store.getItem(KEY) || s); store.setItem(KEY, s); return true; } catch (e) { return false; }
  };
  KM.dayKey = d => d.toISOString().slice(0, 10);
  KM.weekKey = d => { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return t.getUTCFullYear() + '-W' + Math.ceil(((t - y) / 864e5 + 1) / 7); };
  // Record a finished run. Returns {pb, tokens}.
  KM.recordRun = function (save, r, now) {
    now = now || new Date(); const comp = !!save.settings.competitive;
    const pb = comp ? r.time > save.best.comp : r.time > save.best.all;
    if (comp) save.best.comp = Math.max(save.best.comp, r.time); else save.best.all = Math.max(save.best.all, r.time);
    const dk = KM.dayKey(now), wk = KM.weekKey(now);
    if (save.best.daily.d !== dk) save.best.daily = { d: dk, t: 0 }; save.best.daily.t = Math.max(save.best.daily.t, r.time);
    if (save.best.weekly.w !== wk) save.best.weekly = { w: wk, t: 0 }; save.best.weekly.t = Math.max(save.best.weekly.t, r.time);
    save.totals.runs++; save.totals.kills += r.kills; save.totals.time += r.time; save.totals.coins += r.coins;
    save.tokens += r.tokens;
    save.ach.peakArmy = Math.max(save.ach.peakArmy || 0, r.peakArmy);
    return { pb };
  };
  KM.fmtTime = s => { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
  KM.fmtNum = n => Math.floor(n).toLocaleString('en-US');

  // ---------- Endless battlefield chunk plan ----------
  KM.BIOMES = [
    { name: 'Meadow',   grass: 0x74c24c, grass2: 0x58a83c, dirt: 0xd2a66c, tree: 0x3f9a3a, rock: 0x9aa3ad, fog: 0xbfe3ff },
    { name: 'Autumn',   grass: 0xa8b543, grass2: 0x8c8a33, dirt: 0xd4a46b, tree: 0xe0862f, rock: 0xa59a8f, fog: 0xffe0bf },
    { name: 'Desert',   grass: 0xe2c27c, grass2: 0xd0a861, dirt: 0xf0d49a, tree: 0x7aa04a, rock: 0xc99a66, fog: 0xffe9c9 },
    { name: 'Snow',     grass: 0xe8f2fb, grass2: 0xcfe0ef, dirt: 0xbfc8d6, tree: 0x2f7a5c, rock: 0x8c9bb0, fog: 0xe2eefc },
    { name: 'Ashlands', grass: 0x6b5a5a, grass2: 0x4d4040, dirt: 0x9a7b66, tree: 0x8a3b2f, rock: 0x4a4048, fog: 0xd6b0a0 },
    { name: 'Crystal',  grass: 0x5b5fb8, grass2: 0x4648a0, dirt: 0xa7a2d9, tree: 0x63e0ff, rock: 0x7a6cc8, fog: 0xc9c4ff },
  ];
  KM.BIOME_LEN = 30; // chunks per biome (~11 min at march speed)
  KM.chunkPlan = function (i) {
    const b = Math.max(0, Math.floor(i / KM.BIOME_LEN)), into = i < 0 ? 0 : (i % KM.BIOME_LEN) / KM.BIOME_LEN;   // behind the start line = first biome
    const kinds = ['field', 'field', 'forest', 'ruins', 'bridge', 'canyon'];
    const r = KM.rng(i * 9301 + 49297);
    return { i, z1: -i * KM.W.CHUNK, z0: -(i + 1) * KM.W.CHUNK, biome: ((b % KM.BIOMES.length) + KM.BIOMES.length) % KM.BIOMES.length, next: (((b + 1) % KM.BIOMES.length) + KM.BIOMES.length) % KM.BIOMES.length, blend: into > 0.8 ? (into - 0.8) / 0.2 : 0, kind: i < 2 && i > -3 ? 'field' : kinds[Math.floor(r() * kinds.length)], seed: Math.floor(r() * 1e9) };
  };
  // Which chunk indices must be live for a given front position (always contiguous).
  KM.chunksFor = function (frontZ) {
    const ahead = 100, behind = 72;
    const a = Math.floor(-(frontZ + behind) / KM.W.CHUNK), b = Math.floor(-(frontZ - ahead) / KM.W.CHUNK);
    const out = []; for (let i = a; i <= b; i++) out.push(i); return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
