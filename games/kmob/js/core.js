/* KMOB core — pure logic, no DOM/THREE. Difficulty curves, enemy/upgrade tables, economy, save data, chunk plan.
   Loaded by the browser and by the Node tests (tests/kmob.test.js). */
(function (G) {
  const KM = G.KM = G.KM || {};
  if (G.KMOB_LT) { G.KMOB_LT.firstScript = performance.now(); KM.loadTimes = G.KMOB_LT; }   // startup timing (html → first script → engine → frame → interactive)

  // Deterministic RNG (mulberry32) so runs can be replayed for balancing/debugging.
  KM.rng = function (seed) {
    let a = (seed >>> 0) || 1;
    const f = function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    f.range = (lo, hi) => lo + (hi - lo) * f();
    f.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f());
    f.pick = arr => arr[Math.floor(f() * arr.length)];
    f.shuffle = arr => { for (let k = arr.length - 1; k > 0; k--) { const j = Math.floor(f() * (k + 1)); [arr[k], arr[j]] = [arr[j], arr[k]]; } return arr; };
    return f;
  };

  // ---------- World constants ----------
  KM.W = {
    LANE_CENTER_X: 0,             // canonical centre line: road, formation and forward battle axis resolve around x = 0
    LANE: 9.4,          // half-width of the playable lane
    ADV: 1.05,          // forward march speed of the battle front (u/s)
    SPAWN_DZ: 58,       // enemies enter this far ahead of the front
    BREACH_DZ: 7,       // enemies this far behind the front breach the line
    HOLD_DZ: 20,        // friendlies stop advancing this far ahead
    CHUNK: 24,
    MAX_ENEMY: 1700, MAX_FRIEND: 1600,
    // tank boundary, tank fire and DEFEND formation (world units; never derived from the viewport)
    REAR_DZ: 0,         // protected plane: no enemy footprint may cross z = tank.z + REAR_DZ (behind the tank)
    HULL_HW: 1.1, HULL_HL: 1.4,   // tank hull half-width / half-length: enemies stand at its front and front sides
    TANK_RANGE: 40,     // cannon lane range: about two-thirds of the tank-to-spawn depth (SPAWN_DZ 58)
    TANK_LANE: 0.55,    // cannon shell half-width; an enemy is hit when |dx| < TANK_LANE + its footprint
    DEF_REAR_DZ: 3.7,   // DEFEND: the rear band's slots sit this far ahead of the tank centre (hull 1.4 m + room for looters, the cannon and Giant intercepts)
    ROW_MAX: { elite: 15, melee: 20, range: 20, mizard: 20, giant: 10 },   // LOCKED DEFEND row widths (more soldiers add rows inside the class tier)
    // FENCE-TO-FENCE: a full row of a class spans the whole lane (2 × LANE): slot pitch = 2·LANE / ROW_MAX and each class's collision
    // radius is half that pitch (KM.FRIEND rad), so neighbours touch and a complete row leaves no traversable gap; partial rows keep the same
    // pitch (centred) and therefore show — and leave — real openings at their ends.
    PIKE_PUSH_P: 0.3,   // Elite pike / shield hits push the enemy back only occasionally
    CAM_AIM_PORTRAIT: 24, CAM_AIM_LAND: 16, CAM_AIM_DESK: 18, CAM_PITCH_LAND: 0.65,   // camera aim point ahead of the tank: portrait / phone landscape (short screen: the lane stays ≥ 30 % wide) / desktop
    ENGAGE_DZ: 42,      // an engaged boss / mini is never pushed farther upfield than this from the tank (on screen in portrait and landscape)
    FORM_CLEAR: 0.15,   // clearance between any friendly soldier and the tank hull (the hull is solid for both armies)
    FORM_MARGIN: 0.12,  // DEFEND: spacing between neighbouring rows beyond the two collision radii
    TANK_GUARD_R: 6,    // an enemy whose footprint edge is this close to the tank is a tank intruder
    LEASH: 6,           // DEFEND: a local interceptor never chases further than this from its slot
    RANGE_RANGE: 20, MIZARD_RANGE: 15,   // owner-approved base reach (world units): Range archers 20, Mizard healing search 15 (tank: TANK_RANGE 40)
    ELITE_RNG: 2.3,     // DEFEND Elite pike reach beyond its own radius: the spear tip sits rng + rad (~2.9 m) ahead of the body
  };

  // Ground footprint used for every boundary / reach / lane-hit test: the collision radius, or for large enemies
  // (bosses, minis, elites) the visible body half-width, so a Titan's body cannot sit behind the tank plane.
  KM.footOf = (def, rad, sc) => def.boss || def.mini || def.el ? Math.max(rad, 0.5 * sc) : rad;

  // ---------- Difficulty: every curve non-decreasing in time, no hard cap ----------
  KM.TUNE = {
    spawn: [1.5, 0.63, 0.018],   // a + b*m + c*m^2  (budget units per second)
    hp: [0.67, 0.057, 0.0021],
    dmg: [1, 0.045, 0.0007],
    speedMax: 1.45, speedPerMin: 0.008,
    eliteStart: 5, elitePerMin: 0.012, eliteMax: 0.4,
    coin: [0.9, 0.034, 0],
    pushEvery: 150, bossFrom: 8, bossEvery: 240, miniFrom: 4, miniEvery: 100,
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
    { k: 'imp',     at: 0.6,  hp: 9,    dmg: 2,  cd: 0.7, spd: 3.5, rng: 0.6,  rad: 0.36, sc: 1.0 , arm: 0,  coin: 0.5, cost: 0.45, wpn: 'none' },
    { k: 'shield',  at: 1.3,  hp: 34,   dmg: 4,  cd: 1.1, spd: 2.2, rng: 0.75, rad: 0.4,  sc: 1.05, arm: 4,  coin: 2,  cost: 1.7, wpn: 'sword', sh: 1 },
    { k: 'runner',  at: 2.2,  hp: 15,   dmg: 4,  cd: 0.8, spd: 5.2, rng: 0.7,  rad: 0.34, sc: 1.0, arm: 0,  coin: 1,  cost: 1.0, wpn: 'dagger' },
    { k: 'archer',  at: 3.0,  hp: 18,   dmg: 5,  cd: 1.7, spd: 2.3, rng: 8.5,  rad: 0.36, sc: 1.0,  arm: 0,  coin: 2,  cost: 1.6, wpn: 'bow', r: 1 },
    { k: 'knight',  at: 4.5,  hp: 72,   dmg: 7,  cd: 1.1, spd: 2.1, rng: 0.8,  rad: 0.44, sc: 1.18, arm: 9,  coin: 3,  cost: 3.2, wpn: 'sword', sh: 1 },
    { k: 'brute',   at: 6.0,  hp: 330,  dmg: 22, cd: 1.6, spd: 1.9, rng: 1.1,  rad: 0.8,  sc: 1.9,  arm: 4,  coin: 12, cost: 13,  wpn: 'axe', s: 1.4, el: 1 },
    { k: 'bomber',  at: 7.0,  hp: 20,   dmg: 34, cd: 9,   spd: 3.7, rng: 0.7,  rad: 0.36, sc: 1.0, arm: 0,  coin: 2,  cost: 1.7, wpn: 'bomb', ex: 2.3 },
    { k: 'cannon',  at: 8.5,  hp: 170,  dmg: 30, cd: 3.4, spd: 1.2, rng: 14,   rad: 0.75, sc: 1.4,  arm: 6,  coin: 10, cost: 10,  wpn: 'cannon', r: 1, s: 2.3 },
    { k: 'shaman',  at: 10,   hp: 60,   dmg: 6,  cd: 1.5, spd: 2.0, rng: 7,    rad: 0.4,  sc: 1.1,  arm: 2,  coin: 5,  cost: 5,   wpn: 'staff', r: 1, he: 8 },
    { k: 'warlord', at: 8,    hp: 8000, dmg: 50, cd: 1.4, spd: 1.5, rng: 2.0,  rad: 1.8,  sc: 5.2,  arm: 12, coin: 160, cost: 60, wpn: 'axe', s: 2.4, el: 1, boss: 1, mech: 'summon' },
    { k: 'spearman',at: 3.5,  hp: 30,   dmg: 5,  cd: 1.2, spd: 2.3, rng: 1.6,  rad: 0.38, sc: 1.05, arm: 2,  coin: 2,  cost: 1.6, wpn: 'spear', sh: 1 },
    { k: 'giant',   at: 4,    hp: 2600, dmg: 34, cd: 1.8, spd: 1.5, rng: 1.8,  rad: 1.4,  sc: 3.8,  arm: 8,  coin: 45, cost: 45,  wpn: 'axe', s: 2.4, el: 1, mini: 1, mech: 'stomp' },
    { k: 'titan',   at: 8,    hp: 9000, dmg: 60, cd: 1.6, spd: 1.5, rng: 2.2,  rad: 2.0,  sc: 6.5,  arm: 14, coin: 180, cost: 60, wpn: 'axe', s: 2.8, el: 1, boss: 1, mech: 'charge' },
    { k: 'colossus',at: 12,   hp: 12000,dmg: 55, cd: 2.0, spd: 1.1, rng: 2.4,  rad: 2.3,  sc: 7.5,  arm: 22, coin: 220, cost: 60, wpn: 'axe', s: 3.2, el: 1, boss: 1, mech: 'stomp', armR: 0.35 },
    { k: 'hunter',  at: 16,   hp: 6000, dmg: 48, cd: 1.1, spd: 2.7, rng: 1.8,  rad: 1.8,  sc: 5.5,  arm: 10, coin: 160, cost: 60, wpn: 'axe', s: 2.0, el: 1, boss: 1, mech: 'hunt' },
  ];
  KM.ENEMY.forEach((e, i) => { e.id = i; });
  KM.ENEMY_BY = Object.fromEntries(KM.ENEMY.map(e => [e.k, e]));
  // ENEMY TYPE LEVELS (owner rule): a type gains one level on each distinct wave it actually appears in (max displayed Lv10); its growth
  // follows the matched soldier-class profile of the owner table (HP, damage, cumulative armour). Past Lv10 every further appearance
  // compounds +5 % on HP and damage and +1 % on armour (KM.ENEMY_POST10). Bosses: own Lv1..10 track at double the tank's gain (+40 % of base per level), then ×1.2 per encounter.
  KM.ENEMY_PROFILE = { imp: 'collector', runner: 'collector', grunt: 'melee', shield: 'melee', spearman: 'melee', bomber: 'melee', archer: 'range', shaman: 'mizard', knight: 'elite', brute: 'elite', cannon: 'giant', giant: 'giant' };
  // Owner-approved 2026-10-12 after the armour comparison (tests/armor-sim.js): past Lv10, HP and damage compound +5 % per appearance,
  // armour compounds +1 % (the armour multiplier inside the mitigation formula otherwise multiplied with HP and capped every build near wave 50).
  KM.ENEMY_POST10 = { hp: 0.05, dmg: 0.05, arm: 0.01 };
  KM.enemyLvMul = (k, n) => { n = Math.max(1, n || 1); const c = KM.ENEMY_PROFILE[k] || 'melee', L = Math.min(10, n), a = KM.clsStat(c, 1), b = KM.clsStat(c, L), e = Math.max(0, n - 10), P = KM.ENEMY_POST10;
    return { lv: L, hp: b.hp / a.hp * Math.pow(1 + P.hp, e), dmg: b.dmg / a.dmg * Math.pow(1 + P.dmg, e), arm: (b.arm - a.arm) * Math.pow(1 + P.arm, e) }; };
  KM.bossLvMul = n => { n = Math.max(1, n || 1); const L = Math.min(10, n), f = (1 + 0.4 * (L - 1)) * Math.pow(1.2, Math.max(0, n - 10)); return { lv: L, hp: f, dmg: f, arm: f }; };
  // boss victory payout: fixed 100,000 run Gold + a fair 50/50 draw of 2 War Tokens OR 1 Diamond (seeded run RNG, fresh draw every boss)
  // BEGINNER OPENING (owner-approved 2026-10-13): waves 1–5 ramp ordinary enemies from a gentle start (a basic Grunt: 18 HP, 2 damage,
  // 0 armour) to the standard class-based numbers, reached at wave 6. Bosses / minis and every later wave are untouched.
  KM.BEGINNER = { waves: 5, hp: 18 / 22, dmg: 0.5, arm: 0 };
  KM.beginnerMul = w => { const B = KM.BEGINNER; if (!(w >= 1) || w > B.waves) return { hp: 1, dmg: 1, arm: 1 }; const t = (w - 1) / B.waves;
    return { hp: B.hp + (1 - B.hp) * t, dmg: B.dmg + (1 - B.dmg) * t, arm: B.arm + (1 - B.arm) * t }; };
  KM.BOSS_GOLD = 100000;
  KM.bossDraw = r => r < 0.5 ? { tokens: 2, diamonds: 0 } : { tokens: 0, diamonds: 1 };
  KM.CONSUMABLES = {
    warcry:   { name: 'WAR CRY',      desc: '+25% damage, soldiers + tank, 1 wave' },
    titan:    { name: 'TITAN GIANT',  desc: 'A 2× Giant joins (no CAP) until it falls' },
    barrage:  { name: 'TANK BARRAGE', desc: 'Auto-targeting barrage weapon, 1 wave' },
    fortress: { name: 'IRON FORTRESS', desc: '+25% armour, soldiers + tank, 1 wave' },
    rapid:    { name: 'RAPID FIRE',   desc: '+25% attack speed, soldiers + tank, 1 wave' },
    contract: { name: 'MERCENARY CONTRACT', desc: '20 mercenaries join for 30 s (no CAP, no energy)' },
  };
  KM.CONTRACT = { n: 20, dur: 30 };   // one purchased contract at a time; separate from the MERCENARY CALL power
  // LATE-GAME BALANCE (owner 2026-10-15): allied soldiers keep 25 % of their armour (every source, applied once at mitigation; the tank is separate)
  KM.ALLY_ARM = 0.25;
  // WAR FORGE: in-run Gold sink after a class reaches Lv10. Two tracks per class (a: attack / Mizard heal, d: armour), priced per track.
  // Purchase n (1-based) adds 1 / (1 + (n-1)/DECAY) points: +1 first, slowly fading, never capped but never runaway (no compounding).
  KM.FORGE = { base: 100000, step: 25000, decay: 15, maxN: 10000,
    pts: { a: { collector: 1, range: 1, melee: 1, mizard: 1, elite: 1, giant: 1 }, d: { collector: 1, range: 1, melee: 1, mizard: 1, elite: 1, giant: 1 } } };   // points per purchase by class (owner spec: +1 everywhere)
  KM.forgeCost = n => KM.FORGE.base + KM.FORGE.step * Math.max(0, n | 0);   // price of the next purchase when n are already owned
  KM.forgeGain = n => { let g = 0; n = Math.max(0, Math.min(KM.FORGE.maxN, n | 0)); for (let k = 0; k < n; k++) g += 1 / (1 + k / KM.FORGE.decay); return g; };
  KM.emptyForge = () => Object.fromEntries(KM.PROD_ORDER.map(k => [k, { a: 0, d: 0 }]));
  KM.validForge = o => { const f = KM.emptyForge(); if (o && typeof o === 'object') for (const k of KM.PROD_ORDER) for (const t of ['a', 'd']) { const v = o[k] && o[k][t]; if (Number.isFinite(v) && v > 0) f[k][t] = Math.min(KM.FORGE.maxN, Math.floor(v)); } return f; };
  KM.CONS_IDS = Object.keys(KM.CONSUMABLES);
  KM.BUFF_ATTRS = ['hp', 'dmg', 'arm'];
  KM.TANK_BUFF_STATS = { tankDmg: 'CANNON DAMAGE', tankRate: 'FIRE RATE', tankRange: 'CANNON RANGE', maxHp: 'TANK HP' };   // continuous stats only: no fractional shells / missiles
  KM.unlocked = m => KM.ENEMY.filter(e => e.at <= m && !e.boss && !e.mini);
  KM.BOSS_ORDER = ['titan', 'warlord', 'colossus', 'hunter'];

  // Friendly unit kinds (index offset 32 so kind ids never collide with enemies)
  KM.FRIEND = [
    { k: 'soldier', hp: 1, dmg: 1, rng: 0.75, rad: 0.47, sc: 1.3, cd: 0.85, wpn: 'sword' },
    { k: 'archerF', hp: 0.7, dmg: 0.9, rng: 8, rad: 0.47, sc: 1.3, cd: 1.4, wpn: 'bow', r: 1 },
    { k: 'knightF', hp: 7, dmg: 3.6, rng: 1.05, rad: 0.627, sc: 1.8, cd: 1.0, wpn: 'axe', sh: 1, el: 1 },             // ELITE: big, armoured, heavy knockback
    { k: 'collector', hp: 1.6, dmg: 0.5, rng: 0.6, rad: 0.34, sc: 1.0, cd: 0.9, wpn: 'dagger', col: 1, spd: 5.4 },   // LOOTER: loots, repairs the tank, knife at half Melee damage
    { k: 'medic', hp: 1.3, dmg: 0, rng: 0.5, rad: 0.47, sc: 1.36, cd: 1.1, wpn: 'staff', med: 1, spd: 4.6 },                 // MIZARD: staff healer (beam + area burst)
    { k: 'giantF', hp: 22, dmg: 7, rng: 1.3, rad: 0.94, sc: 2.5, cd: 1.3, wpn: 'axe', sh: 1, big: 1, spd: 3.4 },          // GIANT: allied heavy anchor
  ];
  KM.FRIEND.forEach((e, i) => { e.id = 32 + i; });
  KM.FRIEND_BY = Object.fromEntries(KM.FRIEND.map(f => [f.k, f]));
  // Six player classes. Gold pays for deployment and for each class's own level track (no shared price inflation).
  KM.BUILD = '2026.10.24-ranked';   // reported with telemetry; bump on every public deploy
  KM.ARMY_CAP = 300;   // army POINTS (never grows); LOCKED cost per soldier is fixed by class (evolution never changes it)
  // OWNER-APPROVED class table (2026-10-11): Lv1 deploy Gold, CAP points, Lv1 HP / DMG (Mizard: HEAL), per-level gains, Gold price INTO Lv2..Lv10
  // (Melee / Mizard Lv8 = 11,500 is intentional) and the armour GAINED at each level 1..10 (cumulative).
  KM.CLASS_SPEC = {
    collector: { dep: 25,  dDep: 5,  hp: 30,  dHp: 10,  dmg: 2,  dDmg: 1, up: [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500],          arm: [0, 1, 0, 2, 0, 3, 0, 4, 0, 5] },
    range:     { dep: 75,  dDep: 5,  hp: 60,  dHp: 10,  dmg: 5,  dDmg: 2, up: [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000],        arm: [0, 1, 0, 2, 0, 3, 0, 4, 0, 5] },
    melee:     { dep: 125, dDep: 5,  hp: 100, dHp: 50,  dmg: 7,  dDmg: 3, up: [1500, 3000, 4500, 6000, 7500, 9000, 11500, 13000, 14500],      arm: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
    mizard:    { dep: 175, dDep: 5,  hp: 60,  dHp: 10,  dmg: 5,  dDmg: 2, up: [1500, 3000, 4500, 6000, 7500, 9000, 11500, 13000, 14500],      arm: [0, 1, 0, 2, 0, 3, 0, 4, 0, 5], heal: 1 },
    elite:     { dep: 225, dDep: 5,  hp: 300, dHp: 50,  dmg: 14, dDmg: 4, up: [4000, 8000, 12000, 16000, 20000, 24000, 28000, 32000, 36000],  arm: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18] },
    giant:     { dep: 275, dDep: 25, hp: 500, dHp: 100, dmg: 55, dDmg: 5, up: [5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000], arm: [0, 10, 12, 14, 16, 18, 20, 22, 24, 26] },
  };
  KM.PROD = {
    collector: { name: 'LOOTER',    kind: 'collector', cost: 25,  pts: 1 },
    range:     { name: 'ARCHER',     kind: 'archerF',   cost: 75,  pts: 1 },
    melee:     { name: 'SWORD',     kind: 'soldier',   cost: 125, pts: 2 },
    elite:     { name: 'ELITE',     kind: 'knightF',   cost: 225, pts: 4 },
    mizard:    { name: 'MIZARD',    kind: 'medic',     cost: 175, pts: 3 },
    giant:     { name: 'GIANT',     kind: 'giantF',    cost: 275, pts: 5 },
  };
  KM.deployCost = (key, lv) => { const C = KM.CLASS_SPEC[key]; return C.dep + C.dDep * ((lv || 1) - 1); };
  // absolute per-unit numbers of a class at level lv: hp, dmg (Mizard: heal per beam), cumulative armour
  KM.clsStat = (key, lv) => { const C = KM.CLASS_SPEC[key], n = (lv || 1) - 1; let a = 0; for (let k = 0; k <= n; k++) a += C.arm[k]; return { hp: C.hp + C.dHp * n, dmg: C.dmg + C.dDmg * n, arm: a, heal: !!C.heal }; };
  KM.PROD_ORDER = ['collector', 'range', 'melee', 'mizard', 'elite', 'giant'];
  KM.CLASS_OF = Object.fromEntries(KM.PROD_ORDER.map(k => [KM.FRIEND_BY[KM.PROD[k].kind].id, k]));
  KM.CLASS_MAX = 10; KM.EVOLVE_AT = 8;
  // WAR PLAN (owner-approved 2026-10-13): target counts of LIVING ordinary soldiers per class, shown Looter → Giant. Shared 300 weighted CAP;
  // row limit = the DEFEND formation's row width (W.ROW_MAX; Looters hold no formation row); class max = what that class could fill alone.
  KM.PLAN_LABEL = { collector: 'LOOTER', range: 'ARCHER', melee: 'SWORD', mizard: 'MIZARD', elite: 'ELITE', giant: 'GIANT' };
  KM.SPEEDS = [1, 1.5, 2, 3, 5]; KM.ZOOMS = [1, 1.5, 2, 3];
  KM.zoomDepth = z => z >= 3 ? 1 : z >= 2 ? 0.65 + 0.35 * (z - 2) : z >= 1.5 ? 0.35 + 0.6 * (z - 1.5) : 0.7 * (Math.max(1, z) - 1);   // 0 = closest view (1×) … 1 = the whole approach up to the enemy entry (3×)
  KM.emptyPlan = () => Object.fromEntries(KM.PROD_ORDER.map(k => [k, 0]));
  KM.planMax = k => Math.floor(KM.ARMY_CAP / KM.PROD[k].pts);
  KM.planRow = k => KM.W.ROW_MAX[k] || 0;
  KM.planPts = p => KM.PROD_ORDER.reduce((a, k) => a + ((p && p[k]) || 0) * KM.PROD[k].pts, 0);
  KM.planGold = (p, lv) => KM.PROD_ORDER.reduce((a, k) => a + ((p && p[k]) || 0) * KM.deployCost(k, (lv && lv[k]) || 1), 0);
  KM.planOn = p => KM.planPts(p) > 0;
  KM.planCanAdd = (p, k, n) => { n = n || 1; return (p[k] || 0) + n <= KM.planMax(k) && KM.planPts(p) + n * KM.PROD[k].pts <= KM.ARMY_CAP; };
  KM.validPlan = raw => { const o = KM.emptyPlan(); let left = KM.ARMY_CAP; if (!raw || typeof raw !== 'object') return o;   // integers ≥ 0, ≤ class max, total ≤ 300 (filled in display order)
    for (const k of KM.PROD_ORDER) { const v = raw[k]; if (typeof v !== 'number' || !isFinite(v) || v < 0) continue; const n = Math.min(Math.floor(v), KM.planMax(k), Math.floor(left / KM.PROD[k].pts)); o[k] = n; left -= n * KM.PROD[k].pts; }
    return o; };

  KM.clsUpCost = (key, lv) => KM.CLASS_SPEC[key].up[lv - 1];   // Gold price from level lv to lv + 1 (owner table)
  KM.buffMul = n => Math.pow(1.05, n || 0);   // boss reward cards: +5 % multiplicative per card taken, permanent
  KM.clsMul = (key, lv) => ({ hp: 1 + 0.13 * (lv - 1), dmg: 1 + 0.09 * (lv - 1), arm: Math.min(4, 0.45 * (lv - 1)) });   // level 10 ≈ 2–2.5× usefulness, armour tightly capped
  // Frame pacing (shared by the game loop and its tests): one display frame of wall time `rawDt` at game `speed` advances the fixed
  // 1/60 s simulation by n steps. Frame time is clamped to 0.1 s and at most 8 steps run per frame; a backlog beyond 0.2 s is
  // dropped (never a death spiral). At 60 fps every speed is exact; on very slow frames the step cap limits the higher speeds.
  KM.FRAME = { STEP: 1 / 60, MAX_STEPS: 16, MAX_DEBT: 0.2, MAX_DT: 0.1 };   // 16 steps: 5× stays exact down to 20 fps (5 × 1/20 s = 15 steps)
  KM.frameSteps = (acc, rawDt, speed) => { const F = KM.FRAME; acc += Math.min(F.MAX_DT, rawDt) * speed; let n = 0; while (acc >= F.STEP - 1e-9 && n < F.MAX_STEPS) { acc -= F.STEP; n++; } let dropped = 0; if (acc > F.MAX_DEBT) { dropped = acc; acc = 0; } return { n, acc, dropped }; };
  KM.unitPts = key => KM.PROD[key].pts;   // LOCKED army capacity per soldier (Looter 1 · Range 1 · Melee 2 · Mizard 3 · Elite 4 · Giant 5), the same at every level
  KM.ERA_BY_LV = [0, 0, 1, 2, 2, 3, 4, 4, 5, 6];
  KM.COIN_BASE = KM.TUNE.coin[0];                     // the existing opening coin multiplier (0.9), frozen: per-type values stay as configured
  KM.COIN_SCALE = 250;                                 // Gold: kills pay in the same scale as class prices
  KM.BOUNTY = 0.6;                                     // share of each kill paid instantly (the tank only slides sideways, so most drops are out of reach)
  KM.START_BANK = 1000;                                // opening decision: e.g. 30 melee, or 20 melee + 10 range + 2 collectors…
  // ---------- Endless War waves (wave = level) ----------
  KM.WAVE_SECS = 33;                                                   // nominal length of a wave on the difficulty clock
  KM.waveBudget = n => (10 + 5.5 * n) * (1 + n / 80);                  // threat points per wave (quality also rises through the difficulty clock)
  KM.waveGold = n => Math.round((150 + 45 * n) / 5) * 5;               // wave-clear Gold
  // ---------- tank powers (in-run Energy; permanent levels from War Tokens; boss rewards add run boosts) ----------
  KM.POWERS = {
    linebreaker: { name: 'LINEBREAKER', cost: 100, cd: 4, boostTxt: '+12% DMG', desc: 'Huge strike straight down the tank lane' },
    arrowstorm:  { name: 'ARROW STORM', cost: 100, cd: 4, boostTxt: '+1 VOLLEY', desc: 'Arrow rain over the densest enemy formation' },
    elemental:   { name: 'ELEMENTAL WAVE', cost: 100, cd: 4, boostTxt: '+12% DMG', desc: 'Energy wave in front of the army: damage + slow' },
    mercenary:   { name: 'MERCENARY CALL', cost: 120, cd: 6, boostTxt: '+10 MERCS', desc: 'Temporary soldiers beyond the 300 points' },
    recruits:    { name: 'RECRUITS', cost: 300, cd: 8, boostTxt: '', desc: 'Gold Elites join beyond the 300 CAP (shop perk)', shop: 1 },
    fortress:    { name: 'FORTRESS SURGE', cost: 100, cd: 6, boostTxt: '+12% SHIELD', desc: 'Restore shield, repair the tank, harden the line' },
  };
  KM.POWER_IDS = Object.keys(KM.POWERS).filter(id => !KM.POWERS[id].shop);   // the five core powers (RECRUITS is a shop perk power)
  KM.ENERGY_MAX = 1500;
  KM.tankUpCost = n => Math.round(400 * Math.pow(1.12, n) / 5) * 5;   // the tank is the endless track

  // ---------- Encounter sectors: each emphasises a different tactical problem (soft counters, never hard locks) ----------
  KM.SECTORS = {
    opening:   { name: 'OPENING',        at: 0,   dur: 60, pool: ['line', 'blob', 'wedge', 'column'], prefer: [],                    bud: 1,    hp: 1,    spd: 1 },
    swarm:     { name: 'SWARM',          at: 0.9, dur: 55, pool: ['swarm', 'blob', 'swarm'],          prefer: ['imp', 'grunt'],       bud: 1.35, hp: 0.75, spd: 1,    intro: 'imp' },
    shield:    { name: 'SHIELD ARMY',    at: 1.3, dur: 60, pool: ['shieldwall', 'shieldwall', 'line'], prefer: ['shield', 'spearman'], bud: 1,    hp: 1.1,  spd: 0.95, intro: 'shield' },
    charge:    { name: 'CHARGE',         at: 2.2, dur: 50, pool: ['wedge', 'column', 'flank'],        prefer: ['runner', 'knight', 'brute'], bud: 1, hp: 1,  spd: 1.15, intro: 'runner' },
    ranged:    { name: 'RANGED PRESSURE', at: 3,  dur: 55, pool: ['backline', 'backline', 'mixed'],   prefer: ['archer', 'shaman'],   bud: 1,    hp: 1,    spd: 1,    intro: 'archer' },
    attrition: { name: 'ATTRITION',      at: 4,   dur: 80, pool: ['mixed', 'line', 'blob'],           prefer: ['shaman', 'shield'],   bud: 1.1,  hp: 1.05, spd: 1 },
    giant:     { name: 'GIANT HUNT',     at: 5,   dur: 55, pool: ['line'],                            prefer: ['knight'],             bud: 0.55, hp: 1,    spd: 1,    giants: 2 },
    rout:      { name: 'ROUT',           at: 3,   dur: 30, pool: ['blob', 'swarm', 'line'],           prefer: ['grunt', 'imp'],       bud: 1.9,  hp: 0.35, spd: 1,    w: 0.5 },
  };
  // ---------- Run stats + upgrades ----------
  KM.baseStats = function () {
    return {
      cap: KM.ARMY_CAP, rate: 4.8, hp: 20, dmg: 4.5, armor: 0, speed: 4.3, atk: 1,
      magnet: 2.4, crit: 0.05, archer: 0, knight: 0,
      // command tank weapon · force-field shield · collectors · ranged tech era
      tankDmg: 20, tankRate: 0.85, tankRange: 24, tankSplash: 0, tankBarrels: 1, missiles: 0,
      shield: 0, shRecharge: 1, shRadius: 2.4, shDelay: 4,
      colSpeed: 1, colCap: 6, rtech: 0, rdmg: 1, medHeal: 7, cls: { collector: 1, range: 1, melee: 1, elite: 1, mizard: 1, giant: 1 },
      maxHp: 100,
      lv: { tmulti: 0, tpen: 0, medic: 0, mheal: 0, elite: 0, tgun: 0, trof: 0, trng: 0, tspl: 0, tmis: 0, shield: 0, shrec: 0, shrad: 0, coll: 0, cspd: 0, ccap: 0, rtech: 0, rdmg: 0, rate: 0, hp: 0, dmg: 0, armor: 0, speed: 0, atk: 0, magnet: 0, crit: 0, archer: 0, knight: 0, plating: 0, trate: 0, trange: 0, tdmg: 0, splash: 0, frost: 0, scrit: 0, brate: 0, thp: 0, tarm: 0 },
    };
  };

  // Ranged weapon eras — earned one step at a time (minute gate per era), visual + mechanical changes together.
  KM.RTECH = [   // RANGE stays an archer at every level: bow tiers improve range / rate / damage, never the weapon type
    { name: 'SHORTBOWS', at: 0,  range: 5.5,  dmg: 0.8,  cd: 1.6, speed: 10, arc: 1.0,  wpn: 'bow', gap: 3.2 },
    { name: 'HUNTING BOWS',      at: 2,  range: 6.8,  dmg: 1.0,  cd: 1.5, speed: 14, arc: 0.55, wpn: 'bow', gap: 4.0 },
    { name: 'LONGBOWS',       at: 4,  range: 8.2,  dmg: 1.1,  cd: 1.3, speed: 19, arc: 0.5,  wpn: 'bow', gap: 5.0 },
    { name: 'RECURVE BOWS',     at: 7,  range: 9.2,  dmg: 1.4,  cd: 1.45, speed: 28, arc: 0.2, wpn: 'bow', gap: 5.8 },
    { name: 'WAR BOWS',       at: 11, range: 10,   dmg: 1.95, cd: 2.1, speed: 60, arc: 0,    wpn: 'bow', gap: 6.6 },
    { name: 'MASTER BOWS',        at: 15, range: 11.2, dmg: 2.2,  cd: 1.35, speed: 70, arc: 0,   wpn: 'bow', gap: 7.4 },
    { name: 'LEGEND BOWS',  at: 20, range: 12.5, dmg: 1.55, cd: 0.6, speed: 48, arc: 0,    wpn: 'bow', gap: 8.2 },
  ];
  KM.rtech = s => KM.RTECH[Math.min(KM.RTECH.length - 1, s.rtech || 0)];
  // gap = how far the ranged line stands behind the melee front (m): short throwing weapons close, firearms far back
  // tank visual stage from its own upgrade lines (the tank shows what was built, not just how many cards were taken)
  // Command vehicle eras: it starts as a war wagon and becomes a tank only when time AND its own upgrades allow
  KM.TANK_ERAS = [
    { name: 'WAR WAGON',        at: 0,  ups: 0, proj: 13, speed: 24, dmg: 1.0 },
    { name: 'ARMORED WAGON',    at: 2,  ups: 1, proj: 13, speed: 26, dmg: 1.1 },
    { name: 'BALLISTA CARRIER', at: 4,  ups: 3, proj: 13, speed: 28, dmg: 1.25 },
    { name: 'CANNON WAGON',     at: 6,  ups: 5, proj: 1,  speed: 22, dmg: 1.45 },
    { name: 'IRONCLAD',         at: 9,  ups: 7, proj: 1,  speed: 24, dmg: 1.6 },
    { name: 'COMMAND TANK',     at: 12, ups: 9, proj: 20, speed: 30, dmg: 1.8 },
    { name: 'HEAVY TANK',       at: 16, ups: 12, proj: 20, speed: 36, dmg: 2.0 },
    { name: 'SHIELD PLATFORM',  at: 21, ups: 15, proj: 16, speed: 44, dmg: 2.25 },
  ];
  KM.tankUps = s => ['tgun', 'trof', 'trng', 'tspl', 'tmis', 'plating', 'tmulti', 'tpen'].reduce((a, k) => a + (s.lv[k] || 0), 0);
  KM.tankEra = (s, tSec) => { const m = (tSec || 0) / 60, u = KM.tankUps(s); let e = 0; for (let k = 1; k < KM.TANK_ERAS.length; k++) if (m >= KM.TANK_ERAS[k].at && u >= KM.TANK_ERAS[k].ups) e = k; return e; };
  KM.tankLook = s => { const L = s.lv; return { barrels: Math.min(3, 1 + Math.floor((L.trof || 0) / 2)), blen: 0.85 + Math.min(6, L.tgun || 0) * 0.07, cannon: (L.tgun || 0) >= 2, armor: (L.plating || 0), antenna: (L.trng || 0) > 0, missiles: (L.tmis || 0) > 0, shield: (L.shield || 0), heavy: (L.tgun || 0) + (L.trof || 0) >= 6 }; };

  // cat: army | defense ; color used for card face
  // cat → card colour: army (blue/red/green), ranged, tank, support, defense (shield), collect (gold)
  // needs: prerequisite (the deck only offers what makes sense for this run's army)
  KM.UPGRADES = [
    // DEPLOYMENT
    { id: 'rate',   cat: 'army', title: 'DEPLOY SPEED', val: '+12%', icon: 'bolt',  color: 'blue',  w: 8, apply: s => { s.rate *= 1.12; } },
    // COMMAND TANK
    { id: 'tgun',   cat: 'tank', title: 'TANK CANNON', val: '+30% DMG', icon: 'tank', color: 'red', w: 6, max: 8, apply: s => { s.tankDmg *= 1.3; } },
    { id: 'trof',   cat: 'tank', title: 'TANK FIRE RATE', val: '+18%', icon: 'tank', color: 'red', w: 5, max: 6, apply: s => { s.tankRate *= 1.18; s.tankBarrels = Math.min(3, 1 + Math.floor(((s.lv.trof || 0) + 1) / 2)); } },
    { id: 'trng',   cat: 'tank', title: 'TARGETING SYSTEM', val: '+10% RANGE', icon: 'tank', color: 'blue', w: 3, max: 4, at: 1.5, apply: s => { s.tankRange += 0.1 * KM.baseStats().tankRange; } },
    { id: 'tspl',   cat: 'tank', title: 'HE SHELLS', val: 'SPLASH', icon: 'tank', color: 'gold', w: 3, max: 4, needLv: ['tgun', 2], apply: s => { s.tankSplash = (s.tankSplash || 1.2) * (s.tankSplash ? 1.2 : 1); } },
    { id: 'tmis',   cat: 'tank', title: 'MISSILE POD', val: '+2 MISSILES', icon: 'tank', color: 'gold', w: 3, max: 4, needEra: 5, apply: s => { s.missiles += 2; } },
    { id: 'tmulti', cat: 'tank', title: 'MULTISHOT', val: '+1 SHELL', icon: 'tank', color: 'blue', w: 3.5, max: 4, at: 1.5, apply: s => { s.tankMulti = (s.tankMulti || 1) + 1; } },
    { id: 'tpen',   cat: 'tank', title: 'PENETRATION', val: '+1 PIERCE', icon: 'tank', color: 'red', w: 3, max: 3, at: 3, needLv: ['tgun', 1], apply: s => { s.tankPen = (s.tankPen || 0) + 1; } },
    { id: 'plating',cat: 'tank', title: 'TANK ARMOR', val: '+25 HP', icon: 'heart', color: 'green', w: 4, max: 8, apply: (s, run) => { s.maxHp += 25; if (run) run.heal(25); } },
    { id: 'mastery', cat: 'tank', title: 'TANK MASTERY', val: '+DMG +HP', icon: 'star', color: 'gold', w: 2, apply: (s, run) => { const k = s.lv.mastery || 0, g = 0.12 / (1 + 0.08 * k); s.tankDmg *= 1 + g; s.maxHp *= 1 + g * 0.6; if (run) run.heal(s.maxHp * g * 0.6); } },   // endless, diminishing returns
    // DEFENSE — the force field travels with the tank
    { id: 'shield', cat: 'defense', title: 'FORCE FIELD', val: '', icon: 'shield', color: 'tower', w: 5, max: 5, at: 2, apply: (s, run) => { s.shield++; if (run) run.shieldUp(); } },
    { id: 'shrec',  cat: 'defense', title: 'SHIELD RECHARGE', val: '+30%', icon: 'shield', color: 'tower', w: 3, max: 5, needLv: ['shield', 1], apply: s => { s.shRecharge *= 1.3; s.shDelay = Math.max(1.5, s.shDelay * 0.82); } },
    { id: 'shrad',  cat: 'defense', title: 'SHIELD RADIUS', val: '+1.2 m', icon: 'shield', color: 'tower', w: 3, max: 4, needLv: ['shield', 1], apply: s => { s.shRadius += 1.2; } },
    // SUPPORT VEHICLES
    // COLLECTION
    { id: 'magnet', cat: 'collect', title: 'COIN MAGNET', val: '+20%', icon: 'magnet', color: 'gold',  w: 5, max: 8, apply: s => { s.magnet *= 1.2; } },
  ];
  // COMMAND TANK SKILL TRACKS (owner rule): every skill is its own Lv1..10 plus-button track — no random cards. Percentage skills gain +20 % of
  // their BASE value per level (additive, Lv10 = 280 %); count skills +1 per level; TANK HP +100 per level; TARGETING SYSTEM keeps its approved
  // +10 % of base range per level. Gold price into Lv2..Lv10 follows the Giant curve (5,000 … 45,000), each track priced on its own.
  KM.TANK_SKILLS = [
    { id: 'tgun',    title: 'CANNON DAMAGE',   kind: 'pct',   stat: 'tankDmg' },
    { id: 'trof',    title: 'FIRE RATE',       kind: 'pct',   stat: 'tankRate' },
    { id: 'trng',    title: 'TARGETING SYSTEM', kind: 'pct',  stat: 'tankRange', step: 0.1 },
    { id: 'plating', title: 'TANK HP',         kind: 'hp',    stat: 'maxHp', step: 100 },
    { id: 'tmulti',  title: 'MULTISHOT',       kind: 'count', stat: 'tankMulti', base: 1 },
    { id: 'tpen',    title: 'PENETRATION',     kind: 'count', stat: 'tankPen', base: 0 },
    { id: 'tmis',    title: 'MISSILE POD',     kind: 'count', stat: 'missiles', base: 0 },
    { id: 'tspl',    title: 'HE SHELLS',       kind: 'pct',   stat: 'tankSplash', zero: 1.2 },   // Lv1 = no splash; Lv2 opens the existing 1.2 m blast, +20 % of it per further level
    { id: 'shield',  title: 'FORCE FIELD',     kind: 'count', stat: 'shield', base: 0 },
    { id: 'shrec',   title: 'SHIELD RECHARGE', kind: 'pct',   stat: 'shRecharge' },
    { id: 'shrad',   title: 'SHIELD RADIUS',   kind: 'pct',   stat: 'shRadius' },
    { id: 'magnet',  title: 'COIN MAGNET',     kind: 'pct',   stat: 'magnet' },
    { id: 'rate',    title: 'DEPLOY SPEED',    kind: 'pct',   stat: 'rate' },
  ];
  KM.TANK_SKILL_BY = Object.fromEntries(KM.TANK_SKILLS.map(t => [t.id, t]));
  KM.TANK_UP = [5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000];
  KM.tankSkillCost = lv => lv >= KM.CLASS_MAX ? Infinity : KM.TANK_UP[lv - 1];
  // the value a skill adds at level lv on top of the run's base stats
  KM.tankSkillAdd = (t, lv, base) => { const n = Math.max(0, lv - 1);
    if (t.kind === 'count') return n; if (t.kind === 'hp') return t.step * n;
    if (t.zero) return n ? t.zero * (1 + 0.2 * (n - 1)) : 0; return base * (t.step || 0.2) * n; };
  KM.UPG_BY = Object.fromEntries(KM.UPGRADES.map(u => [u.id, u]));


  // Inline upgrades: each soldier category (and the tank) carries one rolled "next upgrade" badge; one tap buys it. No modal, no slowdown.
  KM.UPG_GROUPS = ['tank'];   // soldier classes level up on their own tracks; everything else is the tank's endless track
  KM.upgGroup = () => 'tank';
  // every upgrade currently valid for this run, grouped by category
  KM.upgradeOptions = function (run) {
    const s = run.stats, m = run.t / 60, G = Object.fromEntries(KM.UPG_GROUPS.map(g => [g, []]));
    for (const u of KM.UPGRADES) {
      if (u.at && m < u.at) continue;
      if (u.max && (s.lv[u.id] || 0) >= u.max) continue;
      if (u.needRanged && !(s.archer > 0) && !(run.nKind && run.nKind[33] > 0)) continue;
      if (u.needLv && (s.lv[u.needLv[0]] || 0) < u.needLv[1]) continue;
      if (u.needEra && KM.tankEra(s, run.t) < u.needEra) continue;
      const val = u.id === 'shield' ? (s.shield ? 'LV ' + (s.shield + 1) : 'NEW') : u.val;
      G[KM.upgGroup(u.id)].push({ id: u.id, w: u.w, title: u.title, val, icon: u.icon, color: u.color, cat: u.cat });
    }
    // the command tank is the only tank: no support-vehicle builds or upgrades are ever offered
    return G;
  };

  // ---------- Graphics quality tiers (auto-detected, benchmark-recommended) ----------
  KM.QUALITY = {
    high:   { dpr: 2,    shadows: true,  shadowMap: 2048, lodNear: 120, lodMid: 450, fx: 1.0,  glow: 1.0, bloom: true },
    medium: { dpr: 1.5,  shadows: true,  shadowMap: 1024, lodNear: 80,  lodMid: 300, fx: 0.6,  glow: 1.25, bloom: false },
    low:    { dpr: 1.0,  shadows: false, shadowMap: 512,  lodNear: 40,  lodMid: 160, fx: 0.3,  glow: 1.1, bloom: false },
  };
  // Phones (measured on a physical iPhone): fewer full-skeleton units, a tighter lean band, smaller shadow map,
  // and the environment never casts dynamic shadows — only the command tank does.
  KM.QUALITY_MOBILE = {
    high:   { lodNear: 80, lodMid: 340, shadowMap: 1024, decorShadows: false },
    medium: { lodNear: 64, lodMid: 280, shadowMap: 1024, decorShadows: false },
    low:    { lodNear: 40, lodMid: 200, shadowMap: 512,  decorShadows: false },
  };
  KM.isMobileEnv = (ua, touch, minSide) => /iPhone|iPad|iPod|Android|Mobile/i.test(ua || '') || (!!touch && minSide < 900);
  // initial tier without any measurement: stored benchmark recommendation > desktop high > phones medium
  KM.detectQuality = function (env) {
    if (env.stored && KM.QUALITY[env.stored]) return env.stored;
    if (env.forced && KM.QUALITY[env.forced]) return env.forced;
    const mobile = /iPhone|iPad|Android|Mobile/i.test(env.ua || '') || (env.touch && env.minSide < 900);
    if (!mobile) return (env.cores || 4) >= 4 ? 'high' : 'medium';
    return (env.cores || 4) <= 2 ? 'low' : 'medium';
  };
  KM.nextLowerQuality = q => q === 'high' ? 'medium' : 'low';

  // ---------- Meta economy: GOLD (in run) · WAR TOKENS (earned, permanent) · DIAMONDS (premium accelerator) ----------
  // ARMORY: one starter skin per class + tank skins. Each = unique attire + a small bounded specialisation; all earnable with War Tokens.
  KM.SKINS = [
    { id: 'col_prospector', cls: 'collector', name: 'Prospector', color: '#e6b43a', bonus: { carry: 0.10, speed: 0.05 }, desc: '+10% carry · +5% speed', tokens: 10, diamonds: 4 },
    { id: 'rng_falcon',     cls: 'range',     name: 'Falcon Corps', color: '#3fae5a', bonus: { range: 0.06, rof: 0.05 }, desc: '+6% range · +5% fire rate', tokens: 12, diamonds: 4 },
    { id: 'mel_ironguard',  cls: 'melee',     name: 'Ironguard', color: '#8f9bb0', bonus: { armor: 1, dmg: 0.05 }, desc: '+1 armour · +5% attack', tokens: 12, diamonds: 4 },
    { id: 'eli_crimson',    cls: 'elite',     name: 'Crimson Guard', color: '#c8323a', bonus: { dmg: 0.08, armor: 1 }, desc: '+8% attack · +1 armour', tokens: 14, diamonds: 5 },
    { id: 'miz_aurora',     cls: 'mizard',    name: 'Aurora', color: '#3fd0c8', bonus: { healR: 0.15, heal: 0.08 }, desc: '+15% heal radius · +8% heal', tokens: 14, diamonds: 5 },
    { id: 'gia_titanborn',  cls: 'giant',     name: 'Titanborn', color: '#b07a3a', bonus: { hp: 0.12, steady: 0.3 }, desc: '+12% HP · knockback resist', tokens: 16, diamonds: 6 },
    { id: 'skin_royal',     cls: 'tank', name: 'Royal Blue', color: '#2f6dff', trim: '#f2c14e', bonus: {}, desc: 'Standard command vehicle', tokens: 0, diamonds: 0 },
    { id: 'skin_emerald',   cls: 'tank', name: 'Emerald', color: '#18a86b', trim: '#f2c14e', bonus: { tankRof: 0.05 }, desc: '+5% tank fire rate', tokens: 8, diamonds: 3 },
    { id: 'skin_ember',     cls: 'tank', name: 'Ember', color: '#e0632a', trim: '#2b2b33', bonus: { tankDmg: 0.05 }, desc: '+5% tank damage', tokens: 10, diamonds: 4 },
    { id: 'skin_midnight',  cls: 'tank', name: 'Midnight', color: '#3b2f86', trim: '#9ff2ff', bonus: { tankRange: 0.10 }, desc: '+10% tank range', tokens: 12, diamonds: 4 },
    { id: 'skin_gold',      cls: 'tank', name: 'Gilded', color: '#e8b52e', trim: '#fff4c2', bonus: { shield: 0.08 }, desc: '+8% force field', tokens: 18, diamonds: 6 },
  ];
  KM.SKIN_BY = Object.fromEntries(KM.SKINS.map(k => [k.id, k]));
  KM.SKIN_CLASSES = ['collector', 'range', 'melee', 'elite', 'mizard', 'giant', 'tank'];
  KM.powerCost = lv => ({ tokens: 3 + 2 * lv, diamonds: Math.ceil((3 + 2 * lv) / 3) });   // one shop-wide rate: 1 Diamond = 3 War Tokens (rounded up)   // POWERS tab: permanent level 0…10, +10% each
  KM.POWER_MAX = 10;
  KM.BUNDLES = [   // CURRENCY tab: architecture only — prices are set once earning-rate telemetry exists
    { id: 'd_small', name: 'Diamond Pouch', diamonds: 100, price: null }, { id: 'd_mid', name: 'Diamond Chest', diamonds: 550, price: null }, { id: 'd_big', name: 'Diamond Vault', diamonds: 1200, price: null },
  ];
  // Records + milestones: banked the moment they happen (a long run can never be lost)
  KM.MILESTONES = [
    { wave: 10, title: 'FIRST BOSS', tokens: 2 }, { wave: 25, title: 'BRONZE COMMANDER', tokens: 5, diamonds: 5 }, { wave: 50, title: 'SILVER COMMANDER', tokens: 10, diamonds: 10 },
    { wave: 100, title: 'GOLD COMMANDER', tokens: 20, diamonds: 20 }, { wave: 250, title: 'WARLORD', tokens: 40, diamonds: 30 }, { wave: 500, title: 'ENDLESS COMMANDER', tokens: 60, diamonds: 50 }, { wave: 1000, title: 'ENDLESS CROWN', tokens: 100, diamonds: 100 },
  ];
  KM.DAILY_BADGES = ['FIRST DEFENSE', 'WEEK WARDEN', 'IRON VIGIL', 'ETERNAL GUARD'];   // Daily Defense day-count badges (js/main.js DBADGES)
  KM.WEEKLY_TIERS = [{ top: 0.01, tokens: 40, diamonds: 30, title: 'WEEKLY ELITE' }, { top: 0.05, tokens: 25, badge: 1 }, { top: 0.10, tokens: 15 }, { top: 0.25, tokens: 8 }, { top: 0.50, tokens: 3 }];
  KM.weeklyReward = pct => KM.WEEKLY_TIERS.find(t => pct <= t.top) || null;   // reward tiers by percentile, not only #1
  // leaderboard order: highest wave → survival time → bosses defeated
  KM.lbCompare = (a, b) => b.wave - a.wave || b.secs - a.secs || b.bosses - a.bosses;

  KM.applySkins = function (S, equip) {   // small bounded specialisations from equipped Armory skins
    const b = {}; for (const c in equip || {}) { const sk = KM.SKIN_BY[equip[c]]; if (sk) b[c] = sk.bonus; } S.skin = b;
    const t = b.tank || {}; S.tankRate *= 1 + (t.tankRof || 0); S.tankDmg *= 1 + (t.tankDmg || 0); S.tankRange += KM.baseStats().tankRange * (t.tankRange || 0); S.shieldMul = 1 + (t.shield || 0);
    return S;
  };
  // ================= PHASE C: permanent shop perks, class equipment, seasonal skin sets (owner directive 2026-10-11) =================
  // Prices: perks / buffs tier 1·2·3 = 1·3·5 Diamonds OR 3·9·15 War Tokens; equipment tier 1–4 = 5·10·15·20 D OR 15·30·45·60 T;
  // skins T1–T4 = 10·20·30·40 D OR 30·60·90·120 T; consumables 1 D OR 3 T (strict 3× token-to-diamond). No real-money checkout is active.
  KM.PERKS = {
    recruits: { name: 'RECRUITS', desc: t => `Tank power: summon ${25 * t} Gold Elites (beyond CAP) for ${200 + 100 * t} energy`, max: 3 },
    magnet:   { name: 'MAGNET',   desc: t => `+${10 * t}% coin pickup radius (passive)`, max: 3 },
    plating:  { name: 'PLATING',  desc: t => `+${10 * t} tank HP (passive)`, max: 3 },
  };
  KM.PERK_IDS = Object.keys(KM.PERKS);
  KM.perkCost = tier => ({ diamonds: [1, 3, 5][tier - 1], tokens: [3, 9, 15][tier - 1] });   // price of buying tier `tier`
  KM.RECRUITS = t => ({ n: [25, 50, 75][t - 1], energy: [300, 400, 500][t - 1] });
  KM.MERC_TIERS = [{ energy: 500, n: 50 }, { energy: 1000, n: 75 }, { energy: 1500, n: 100 }];   // MERCENARY CALL by tier (merc counts per tier: pending owner approval)
  KM.CONS_PRICE = { diamonds: 1, tokens: 3 };
  KM.DIAMOND_PACKS = [{ id: 'dp1', usd: 0.99, diamonds: 5, bonus: 0 }, { id: 'dp2', usd: 4.99, diamonds: 40, bonus: 15 }, { id: 'dp3', usd: 9.99, diamonds: 100, bonus: 20 }];   // storefront preview only
  // CLASS EQUIPMENT: one loadout per class (every soldier of the class uses it); four fixed tiers per slot, bought directly, owned forever.
  // Bonus per tier (DEFAULT pending the owner's economy sign-off): percentage slots +5 / +10 / +15 / +20 %; armour slots +2 / +4 / +6 / +8 armour.
  KM.EQUIP = {
    collector: [{ id: 'bag', name: 'Bag', stat: 'carry' }, { id: 'dagger', name: 'Dagger', stat: 'dmg' }, { id: 'boots', name: 'Boots', stat: 'speed' }],
    range:     [{ id: 'bow', name: 'Bow', stat: 'dmg' }, { id: 'quiver', name: 'Quiver', stat: 'rof' }, { id: 'armguard', name: 'Arm Guard', stat: 'arm' }],
    melee:     [{ id: 'sword', name: 'Sword', stat: 'dmg' }, { id: 'shield', name: 'Shield', stat: 'arm' }, { id: 'bodyarmor', name: 'Body Armor', stat: 'hp' }],
    mizard:    [{ id: 'staff', name: 'Staff', stat: 'dmg' }, { id: 'spellbook', name: 'Spellbook', stat: 'rof' }, { id: 'crystal', name: 'Focus Crystal', stat: 'healR' }],
    elite:     [{ id: 'pike', name: 'Pike', stat: 'dmg' }, { id: 'shield', name: 'Shield', stat: 'arm' }, { id: 'helmet', name: 'Helmet', stat: 'steady' }, { id: 'chest', name: 'Chest Armor', stat: 'hp' }],
    giant:     [{ id: 'hammer', name: 'Hammer', stat: 'dmg' }, { id: 'bodyarmor', name: 'Body Armor', stat: 'hp' }, { id: 'gauntlets', name: 'Gauntlets', stat: 'steady' }],
  };
  KM.EQUIP_TIERS = ['BASIC', 'INTERMEDIATE', 'ADVANCED', 'PREMIUM'];
  // EQUIPMENT APPEARANCE: every equipped tier shows on the 3D soldier in that tier's metal (bronze · silver · gold · crystal) on the part its
  // slot owns — weapon slots also grow slightly with tier; armour slots add tier-coloured pauldrons; Bag grows the loot sack; Quiver / Spellbook /
  // Focus Crystal / Boots / Arm Guard / Gauntlets colour the arms. One look per class (every soldier of the class wears the loadout).
  KM.TIER_METAL = [0xc08040, 0xd0d8e4, 0xffd23a, 0x7fe8ff];
  KM.GEAR_PART = { bag: 'sack', dagger: 'wpn', boots: 'arm', bow: 'wpn', quiver: 'arm', armguard: 'arm', sword: 'wpn', shield: 'shield', bodyarmor: 'pads', staff: 'wpn', spellbook: 'arm', crystal: 'arm', pike: 'wpn', helmet: 'pads', chest: 'pads', hammer: 'wpn', gauntlets: 'arm' };
  KM.gearLook = (cls, eq) => { const o = {}; for (const sl of KM.EQUIP[cls]) { const t = (eq || {})[sl.id] || 0; if (!t) continue; const part = KM.GEAR_PART[sl.id], cur = o[part];
      if (!cur || t > cur.tier) o[part] = { tier: t, col: KM.TIER_METAL[t - 1], scale: part === 'wpn' ? 1 + 0.07 * t : part === 'sack' ? 1 + 0.15 * t : 1 }; } return o; };
  KM.equipCost = tier => ({ diamonds: 5 * tier, tokens: 15 * tier });
  KM.equipBonus = (stat, tier) => !tier ? 0 : stat === 'arm' ? 2 * tier : 0.05 * tier;
  KM.STAT_TXT = { dmg: 'damage', hp: 'HP', arm: 'armour', rof: 'attack speed', speed: 'move / collect speed', carry: 'carry capacity', healR: 'heal area', steady: 'knockback resist' };
  KM.equipTxt = (cls, slot, tier) => { const st = slot.stat, b = KM.equipBonus(st, tier); return (st === 'arm' ? '+' + b : '+' + Math.round(b * 100) + '%') + ' ' + (cls === 'mizard' && st === 'dmg' ? 'healing' : KM.STAT_TXT[st]); };
  // SEASON 1 SKIN SETS: one purchase unlocks the theme for all six classes AND the tank; equip globally or per class; one skin per unit.
  // Perks are identical on every class (Mizard: "damage" = its healing output). Stat perks +10 % (T4: +20 % each of HP, armour, damage,
  // attack speed). Elemental perks (fire, ice, poison, radiant, shadow, lightning) have NO approved magnitude yet: shown, no effect.
  KM.SEASON = [
    { id: 's1_berserker', name: 'Berserker',      tier: 1, color: '#c8323a', perks: { dmg: 0.1 } },
    { id: 's1_swift',     name: 'Swiftstrike',    tier: 1, color: '#2fb8ff', perks: { rof: 0.1 } },
    { id: 's1_ember',     name: 'Ember',          tier: 1, color: '#ff7a2a', perks: {}, elem: 'fire' },
    { id: 's1_vanguard',  name: 'Iron Vanguard',  tier: 2, color: '#8f9bb0', perks: { arm: 0.1, dmg: 0.1 } },
    { id: 's1_gstorm',    name: 'Guardian Storm', tier: 2, color: '#4f6dff', perks: { hp: 0.1, rof: 0.1 } },
    { id: 's1_frost',     name: 'Frost Guard',    tier: 2, color: '#9fe8ff', perks: { arm: 0.1 }, elem: 'ice' },
    { id: 's1_inferno',   name: 'Inferno Legion', tier: 3, color: '#ff3a1a', perks: { hp: 0.1, dmg: 0.1 }, elem: 'fire' },
    { id: 's1_venom',     name: 'Venom Ward',     tier: 3, color: '#5fd84a', perks: { arm: 0.1, rof: 0.1 }, elem: 'poison' },
    { id: 's1_glacier',   name: 'Glacier Crown',  tier: 3, color: '#cfefff', perks: { hp: 0.1, dmg: 0.1 }, elem: 'ice' },
    { id: 's1_celestial', name: 'Celestial War',  tier: 4, color: '#fff2a8', perks: { hp: 0.2, arm: 0.2, dmg: 0.2, rof: 0.2 }, elem: 'radiant' },
    { id: 's1_shadow',    name: 'Shadow Dominion', tier: 4, color: '#3a2a5a', perks: { hp: 0.2, arm: 0.2, dmg: 0.2, rof: 0.2 }, elem: 'shadow' },
    { id: 's1_titan',     name: 'Titan Emperor',  tier: 4, color: '#e8b52e', perks: { hp: 0.2, arm: 0.2, dmg: 0.2, rof: 0.2 }, elem: 'lightning' },
  ];
  KM.SEASON_BY = Object.fromEntries(KM.SEASON.map(k => [k.id, k]));
  KM.skinCost = tier => ({ diamonds: 10 * tier, tokens: 30 * tier });
  // ELEMENTAL SKIN POWERS (owner-approved 2026-10-12). t = values for skin tiers 1–3, t4 = tier 4. Fractions are of the triggering hit's damage
  // AFTER its normal armour / shield mitigation, so burn, poison and chain damage never bypass protection and armour is never applied twice.
  // Same element on a target: the timer refreshes, the stronger magnitude is kept (a weaker hit never overwrites a stronger effect); no stacking.
  // Lightning: the nearest distinct enemies within 4 m (distance, then unit index as a stable tie-break); chain hits never proc again.
  // Radiant and Shadow (Celestial War, Shadow Dominion) are not approved yet: listed, no effect.
  KM.ELEMENTS = {
    fire:      { code: 1, t: { dot: 0.10 }, t4: { dot: 0.20 }, dur: 3, txt: e => `${e.dot * 100}% burn over 3 s` },
    ice:       { code: 2, t: { slow: 0.20 }, t4: { slow: 0.40 }, dur: 3, txt: e => `${e.slow * 100}% slower move + attack for 3 s` },
    poison:    { code: 3, t: { dot: 0.10, heal: 0.20 }, t4: { dot: 0.20, heal: 0.40 }, dur: 5, txt: e => `${e.dot * 100}% poison over 5 s · ${e.heal * 100}% less healing` },
    lightning: { code: 4, t: { n: 2, frac: 0.10 }, t4: { n: 4, frac: 0.20 }, R: 4, txt: e => `chains to ${e.n} nearby enemies for ${e.frac * 100}% each` },
  };
  KM.ELEM_BY_CODE = Object.fromEntries(Object.entries(KM.ELEMENTS).map(([k, v]) => [v.code, k]));
  KM.elemOf = sk => { if (!sk || !sk.elem || !KM.ELEMENTS[sk.elem]) return null; const E = KM.ELEMENTS[sk.elem]; return Object.assign({ el: sk.elem, code: E.code }, sk.tier >= 4 ? E.t4 : E.t); };
  KM.ELEM_TXT = { fire: 'fire', ice: 'ice', poison: 'poison', radiant: 'radiant', shadow: 'shadow', lightning: 'lightning' };
  KM.perkTxt = sk => { const e = KM.elemOf(sk); return [...Object.entries(sk.perks).map(([k, v]) => '+' + Math.round(v * 100) + '% ' + KM.STAT_TXT[k]), ...(sk.elem ? [e ? sk.elem.toUpperCase() + ': ' + KM.ELEMENTS[sk.elem].txt(e) : KM.ELEM_TXT[sk.elem] + ' (effect pending approval)'] : [])].join(' · '); };
  // the per-class modifiers a run gets from the saved loadout: { cls: { hp, dmg, arm(flat), armPct, rof, speed, carry, healR, steady }, tank: {...}, perks }
  KM.loadoutMods = function (L) {
    L = L || {}; const out = { cls: {}, tank: { hp: 0, dmg: 0, rof: 0, armPct: 0 }, perks: Object.assign({}, L.perks) };
    for (const c of KM.PROD_ORDER) { const m = out.cls[c] = { hp: 0, dmg: 0, arm: 0, armPct: 0, rof: 0, speed: 0, carry: 0, healR: 0, steady: 0 };
      for (const sl of KM.EQUIP[c]) { const t = ((L.equip || {})[c] || {})[sl.id] || 0; if (t) m[sl.stat] += KM.equipBonus(sl.stat, t); }
      const sk = KM.SEASON_BY[(L.skin || {})[c]]; if (sk) for (const [k, v] of Object.entries(sk.perks)) { if (k === 'arm') m.armPct += v; else m[k] += v; } }
    out.elem = {}; for (const c of [...KM.PROD_ORDER, 'tank']) { const e = KM.elemOf(KM.SEASON_BY[(L.skin || {})[c]]); if (e) out.elem[c] = e; }   // one skin per unit = at most one element
    const tk = KM.SEASON_BY[(L.skin || {}).tank]; if (tk) for (const [k, v] of Object.entries(tk.perks)) { if (k === 'arm') out.tank.armPct += v; else out.tank[k] += v; }
    return out;
  };
  // ---------- Save data (versioned, validated, crash-safe double write) ----------
  const KEY = 'kmob.save.v1';
  KM.defaultSave = () => ({
    v: 1, tokens: 0, diamonds: 0, player: '', titles: [],
    records: { wave: 0, time: 0, bosses: 0, kills: 0, army: 0 },
    powers: { lv: {}, equip: ['linebreaker', 'arrowstorm', 'fortress'] }, skins: { owned: { skin_royal: 1 }, equip: { tank: 'skin_royal' } },
    best: { all: 0, comp: 0, daily: { d: '', t: 0 }, weekly: { w: '', t: 0 } },
    totals: { runs: 0, kills: 0, time: 0, coins: 0 },
    settings: { sound: 1, music: 1, haptics: 1, competitive: 0, speed: 1, zoom: 1 }, plan: KM.emptyPlan(),
    ach: {},
    buffs: { cls: {}, tank: {} }, cons: {}, paid: [],
    chants: { on: 1, station: 'steel', owned: { steel: 1 }, vol: 1 },
    goals: null,   // GOALS & COMMANDER RANK (js/goals.js): banked daily/weekly goals, XP, rank
    daily: { day: '', ranked: 0, practice: 0, best: 0, bestParts: null, done: 0, station: 'steel', days: [], total: 0 },   // DAILY DEFENSE: today's attempts / best, completed days (badges, weekly participation)   // 2.0 WAR CHANTS: radio on/off, selected station, unlocked stations, stinger volume 0–1
    perks: {}, gear: { owned: {}, equip: {} }, season: { owned: {}, equip: {} }, mercTier: 1,   // Phase C: perk tiers · class equipment (owned tiers, equipped tier per slot) · seasonal skin sets · chosen Mercenary tier   // permanent boss-card buffs (counts of +5 %), consumable inventory, banked boss-payout ids (exactly once)
  });
  const num = (v, d, max) => (typeof v === 'number' && isFinite(v) && v >= 0) ? Math.min(v, max || 1e15) : d;
  KM.validateSave = function (raw) {
    const d = KM.defaultSave(); if (!raw || typeof raw !== 'object') return d;
    d.tokens = Math.floor(num(raw.tokens, 0));
    const b = raw.best || {}; d.best.all = num(b.all, 0); d.best.comp = num(b.comp, 0);
    if (b.daily && typeof b.daily.d === 'string') d.best.daily = { d: b.daily.d, t: num(b.daily.t, 0) };
    if (b.weekly && typeof b.weekly.w === 'string') d.best.weekly = { w: b.weekly.w, t: num(b.weekly.t, 0) };
    for (const k of Object.keys(d.totals)) d.totals[k] = num((raw.totals || {})[k], 0);
    d.diamonds = Math.floor(num(raw.diamonds, 0)); if (typeof raw.player === 'string' && /^[A-Z0-9]{4,12}$/.test(raw.player)) d.player = raw.player;
    const TITLES = new Set([...KM.MILESTONES.map(m => m.title), ...KM.DAILY_BADGES, ...(KM.EARLY_TITLES || []).map(m => m.title)]);   // wave milestones + Daily Defense badges + early wave titles (a Daily badge was dropped on reload before 2026-10-23)
    if (Array.isArray(raw.titles)) d.titles = [...new Set(raw.titles.filter(t => TITLES.has(t)))];
    for (const k of Object.keys(d.records)) d.records[k] = num((raw.records || {})[k], 0);
    const pw = raw.powers || {}; for (const id of KM.POWER_IDS) { const l = Math.floor(num((pw.lv || {})[id], 0)); if (l) d.powers.lv[id] = Math.min(KM.POWER_MAX, l); }
    if (Array.isArray(pw.equip)) { const e = [...new Set(pw.equip.filter(id => KM.POWERS[id]))].slice(0, 3); if (e.length) d.powers.equip = e; }
    const sk = raw.skins || {}, owned = Object.assign({}, sk.owned, raw.owned);   // legacy launcher skins migrate into the Armory
    for (const id of Object.keys(owned)) if (KM.SKIN_BY[id]) d.skins.owned[id] = 1;
    const eq = Object.assign({}, sk.equip); if (raw.equip && raw.equip.skin) eq.tank = eq.tank || raw.equip.skin;
    for (const c of KM.SKIN_CLASSES) { const id = eq[c]; if (id && d.skins.owned[id] && KM.SKIN_BY[id].cls === c) d.skins.equip[c] = id; }
    for (const k of Object.keys(d.settings)) { const v = (raw.settings || {})[k]; if (k === 'speed' ? KM.SPEEDS.includes(v) : k === 'zoom' ? KM.ZOOMS.includes(v) : v === 0 || v === 1) d.settings[k] = v; }
    d.plan = KM.validPlan(raw.plan);   // older saves: all-zero plan (planner off)   // game speed is remembered between runs
    if (raw.ach && typeof raw.ach === 'object') for (const k of Object.keys(raw.ach)) d.ach[k] = num(raw.ach[k], 0);
    const bf = raw.buffs || {};
    for (const c of KM.PROD_ORDER) { const o = (bf.cls || {})[c]; if (!o) continue; for (const a of KM.BUFF_ATTRS) { const n = Math.floor(num(o[a], 0, 1e6)); if (n) (d.buffs.cls[c] = d.buffs.cls[c] || {})[a] = n; } }
    for (const k of Object.keys(KM.TANK_BUFF_STATS)) { const n = Math.floor(num((bf.tank || {})[k], 0, 1e6)); if (n) d.buffs.tank[k] = n; }
    for (const id of KM.CONS_IDS) { const n = Math.floor(num((raw.cons || {})[id], 0, 1e6)); if (n) d.cons[id] = n; }
    if (Array.isArray(raw.paid)) d.paid = raw.paid.filter(x => typeof x === 'string').slice(-200);
    for (const id of KM.PERK_IDS) { const t = Math.floor(num((raw.perks || {})[id], 0, 3)); if (t) d.perks[id] = t; }
    const ge = raw.gear || {};
    for (const c of KM.PROD_ORDER) for (const sl of KM.EQUIP[c]) { const key = c + '.' + sl.id, o = (ge.owned || {})[key]; if (Array.isArray(o)) { const t = [...new Set(o.filter(x => [1, 2, 3, 4].includes(x)))].sort(); if (t.length) d.gear.owned[key] = t; }
      const eq = ((ge.equip || {})[c] || {})[sl.id]; if (eq && d.gear.owned[key] && d.gear.owned[key].includes(eq)) (d.gear.equip[c] = d.gear.equip[c] || {})[sl.id] = eq; }
    const se = raw.season || {}; for (const id of Object.keys(se.owned || {})) if (KM.SEASON_BY[id]) d.season.owned[id] = 1;
    for (const c of [...KM.PROD_ORDER, 'tank']) { const id = (se.equip || {})[c]; if (id && d.season.owned[id]) d.season.equip[c] = id; }
    if ([1, 2, 3].includes(raw.mercTier)) d.mercTier = raw.mercTier;
    d.goals = KM.validGoals ? KM.validGoals(raw.goals) : null;
    const dl = raw.daily || {}, DD = d.daily;   // DAILY DEFENSE: today's counters only survive for the same UTC day (attempts never carry over)
    if (typeof dl.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dl.day)) { DD.day = dl.day; DD.ranked = Math.min(3, Math.floor(num(dl.ranked, 0))); DD.practice = Math.floor(num(dl.practice, 0, 1e6)); DD.best = Math.floor(num(dl.best, 0, 1e9)); DD.done = dl.done ? 1 : 0;
      if (dl.bestParts && typeof dl.bestParts === 'object') DD.bestParts = Object.fromEntries(Object.entries(dl.bestParts).filter(([k, v]) => typeof v === 'number' && isFinite(v)).slice(0, 8)); }
    if (['steel', 'iron', 'fury', 'off'].includes(dl.station)) DD.station = dl.station;
    if (Array.isArray(dl.days)) DD.days = [...new Set(dl.days.filter(x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)))].sort().slice(-400); DD.total = Math.max(DD.days.length, Math.floor(num(dl.total, 0, 1e6)));
    const ch = raw.chants || {}, ST = ['steel', 'iron', 'fury'];   // WAR CHANTS: only known stations; the selected one must be owned (STEEL is always owned)
    for (const id of ST) if ((ch.owned || {})[id]) d.chants.owned[id] = 1;
    if (ST.includes(ch.station) && d.chants.owned[ch.station]) d.chants.station = ch.station; if (ch.on === 0) d.chants.on = 0; d.chants.vol = Math.min(1, num(ch.vol, 1));
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
    save.ach.peakArmy = Math.max(save.ach.peakArmy || 0, r.peakArmy);
    const R = save.records, nr = [];   // permanent personal records
    for (const [k, v] of [['wave', r.wave || 0], ['time', r.time], ['bosses', r.bosses || 0], ['kills', r.kills], ['army', r.armyDev || 0]]) if (v > R[k]) { R[k] = v; nr.push(k); }
    return { pb, records: nr };
  };
  KM.fmtTime = s => { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
  KM.fmtNum = n => Math.floor(n).toLocaleString('en-US');
  KM.fmtShort = n => { n = Math.floor(n); if (n < 10000) return n.toLocaleString('en-US'); for (const [v, u] of [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']]) if (n >= v) { const x = n / v; return (x < 100 ? x.toFixed(1) : Math.floor(x)) + u; } return String(n); };   // HUD: always fits the pill

  // ---------- Endless battlefield chunk plan ----------
  // decor sight-line rule: a prop whose top is h metres high must keep its inner edge this far from the lane centre
  // (the camera sits ~2–4 m off-centre and ~20 m up, so a tall prop at the fence would lean over the fight on screen)
  KM.decorClear = h => KM.W.LANE - 0.3 + 0.42 * Math.max(0, h - 0.6);
  KM.decorMaxH = inner => 0.6 + Math.max(0, inner - (KM.W.LANE - 0.3)) / 0.42;
  KM.BIOMES = [
    { name: 'Meadow',   grass: 0x7ac44a, grass2: 0x5aa83a, dirt: 0xd9a660, tree: 0x3f9a3a, rock: 0x9aa3ad, fog: 0xbfe3ff },
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
  // ---------- Battlefield edges (visual only): world-space masks so cliffs/rivers flow seamlessly across chunks ----------
  const hash1 = x => { const s = Math.sin(x * 127.1) * 43758.5453; return s - Math.floor(s); };
  const vnoise1 = x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash1(i) * (1 - u) + hash1(i + 1) * u; };
  const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // side: -1 left, +1 right. Returns 0..1 strengths; never both strong on one side; the start area stays open meadow.
  KM.edgeAt = function (side, wz) {
    const d = Math.max(0, -wz), open = sstep(30, 70, d);
    const river = sstep(0.4, 0.74, vnoise1(d * 0.0075 + (side > 0 ? 3.7 : 17.3))) * open;
    const cliff = sstep(0.4, 0.72, vnoise1(d * 0.009 + (side > 0 ? 41.1 : 59.9))) * (1 - river) * open;
    return { river, cliff };
  };
  // Terrain height beside the lane (the lane itself, |x| < 10.2, is always flat and playable).
  KM.edgeHeight = function (x, wz, n, kind) {
    const ax = Math.abs(x), side = x < 0 ? -1 : 1, e = KM.edgeAt(side, wz), canyon = kind === 'canyon';
    let h = 0; const edge = canyon ? 11 : 12.5;
    if (ax > edge) h = Math.pow((ax - edge) / 8, 1.4) * (canyon ? 9 : 4.5) * (0.6 + n);
    if (ax > 10.3) h += sstep(10.3, 11.8, ax) * (0.55 + n * 0.3);                                 // grass shoulder rises beside the road
    const cl = Math.max(e.cliff, canyon ? 0.85 : 0);
    if (cl > 0 && ax > 10.5) h += cl * (sstep(10.7, 12.0, ax) * (3.6 + n * 2.4) + sstep(14, 18, ax) * 2.6);      // wall just past the fence + upper shelf
    if (e.river > 0 && ax > 10.5) h = h * (1 - e.river) + e.river * (-1.25 * sstep(10.7, 11.6, ax) * (1 - sstep(15.6, 17.4, ax)) + sstep(16.5, 21, ax) * (2 + n * 2));
    return h;
  };
  // Which chunk indices must be live for a given front position (always contiguous).
  KM.chunksFor = function (frontZ, zoom) {
    const z = Math.max(1, Math.min(3, zoom || 1)), ahead = 100 * Math.min(1.5, z), behind = 72 + 15 * (z - 1);   // the 3× zoom-out sees ~50 m further ahead (fog ends the view) and ~30 m behind the tank
    const a = Math.floor(-(frontZ + behind) / KM.W.CHUNK), b = Math.floor(-(frontZ - ahead) / KM.W.CHUNK);
    const out = []; for (let i = a; i <= b; i++) out.push(i); return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
