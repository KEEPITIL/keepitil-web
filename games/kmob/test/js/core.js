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
    TANK_RANGE: 39,     // cannon lane range: about two-thirds of the tank-to-spawn depth (SPAWN_DZ 58)
    TANK_LANE: 0.55,    // cannon shell half-width; an enemy is hit when |dx| < TANK_LANE + its footprint
    DEF_FRONT_DZ: 16,   // DEFEND: wall distance ahead of the tank for a full-size army (mid-field)
    ROW_MAX: { elite: 15, melee: 20, range: 20, mizard: 20, giant: 10 },   // LOCKED DEFEND row widths (more soldiers add rows inside the class tier)
    PIKE_PUSH_P: 0.3,   // Elite pike / shield hits push the enemy back only occasionally
    CAM_AIM_PORTRAIT: 24, CAM_AIM_LAND: 16, CAM_AIM_DESK: 18, CAM_PITCH_LAND: 0.65,   // camera aim point ahead of the tank: portrait / phone landscape (short screen: the lane stays ≥ 30 % wide) / desktop
    ENGAGE_DZ: 42,      // an engaged boss / mini is never pushed farther upfield than this from the tank (on screen in portrait and landscape)
    FORM_CLEAR: 0.15,   // clearance between any friendly soldier and the tank hull (the hull is solid for both armies)
    FORM_MARGIN: 0.12,  // DEFEND: spacing between neighbouring rows beyond the two collision radii
    TANK_GUARD_R: 6,    // an enemy whose footprint edge is this close to the tank is a tank intruder
    LEASH: 6,           // DEFEND: a local interceptor never chases further than this from its slot
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
  KM.unlocked = m => KM.ENEMY.filter(e => e.at <= m && !e.boss && !e.mini);
  KM.BOSS_ORDER = ['titan', 'warlord', 'colossus', 'hunter'];

  // Friendly unit kinds (index offset 32 so kind ids never collide with enemies)
  KM.FRIEND = [
    { k: 'soldier', hp: 1, dmg: 1, rng: 0.75, rad: 0.36, sc: 1, cd: 0.85, wpn: 'sword' },
    { k: 'archerF', hp: 0.7, dmg: 0.9, rng: 8, rad: 0.36, sc: 1, cd: 1.4, wpn: 'bow', r: 1 },
    { k: 'knightF', hp: 7, dmg: 3.6, rng: 1.05, rad: 0.62, sc: 1.8, cd: 1.0, wpn: 'axe', sh: 1, el: 1 },             // ELITE: big, armoured, heavy knockback
    { k: 'collector', hp: 1.6, dmg: 0.5, rng: 0.6, rad: 0.34, sc: 1.0, cd: 0.9, wpn: 'dagger', col: 1, spd: 5.4 },   // LOOTER: loots, repairs the tank, knife at half Melee damage
    { k: 'medic', hp: 1.3, dmg: 0, rng: 0.5, rad: 0.34, sc: 1.05, cd: 1.1, wpn: 'staff', med: 1, spd: 4.6 },                 // MIZARD: staff healer (beam + area burst)
    { k: 'giantF', hp: 22, dmg: 7, rng: 1.3, rad: 0.95, sc: 2.5, cd: 1.3, wpn: 'axe', sh: 1, big: 1, spd: 3.4 },          // GIANT: allied heavy anchor
  ];
  KM.FRIEND.forEach((e, i) => { e.id = 32 + i; });
  KM.FRIEND_BY = Object.fromEntries(KM.FRIEND.map(f => [f.k, f]));
  // Six player classes. Gold pays for deployment and for each class's own level track (no shared price inflation).
  KM.BUILD = '2026.10.07-endless';   // reported with telemetry; bump on every public deploy
  KM.ARMY_CAP = 300;   // army POINTS (never grows); evolved soldiers take more points
  KM.PROD = {
    collector: { name: 'LOOTER',    kind: 'collector', cost: 25,  pts: 1 },
    range:     { name: 'RANGE',     kind: 'archerF',   cost: 75,  pts: 1 },
    melee:     { name: 'MELEE',     kind: 'soldier',   cost: 100, pts: 2 },
    elite:     { name: 'ELITE',     kind: 'knightF',   cost: 250, pts: 4 },
    mizard:    { name: 'MIZARD',    kind: 'medic',     cost: 150, pts: 3 },
    giant:     { name: 'GIANT',     kind: 'giantF',    cost: 500, pts: 5 },
  };
  KM.PROD_ORDER = ['collector', 'range', 'melee', 'mizard', 'elite', 'giant'];
  KM.CLASS_OF = Object.fromEntries(KM.PROD_ORDER.map(k => [KM.FRIEND_BY[KM.PROD[k].kind].id, k]));
  KM.CLASS_MAX = 10; KM.EVOLVE_AT = 8;
  KM.clsUpCost = (key, lv) => Math.round(KM.PROD[key].cost * (25 + 20 * (lv - 1)) / 5) * 5;   // own track per class: level 2 ≈ 25 soldiers' price, level 10 ≈ 185
  KM.clsMul = (key, lv) => ({ hp: 1 + 0.13 * (lv - 1), dmg: 1 + 0.09 * (lv - 1), arm: Math.min(4, 0.45 * (lv - 1)) });   // level 10 ≈ 2–2.5× usefulness, armour tightly capped
  // Frame pacing (shared by the game loop and its tests): one display frame of wall time `rawDt` at game `speed` advances the fixed
  // 1/60 s simulation by n steps. Frame time is clamped to 0.1 s and at most 8 steps run per frame; a backlog beyond 0.2 s is
  // dropped (never a death spiral). At 60 fps every speed is exact; on very slow frames the step cap limits the higher speeds.
  KM.FRAME = { STEP: 1 / 60, MAX_STEPS: 8, MAX_DEBT: 0.2, MAX_DT: 0.1 };
  KM.frameSteps = (acc, rawDt, speed) => { const F = KM.FRAME; acc += Math.min(F.MAX_DT, rawDt) * speed; let n = 0; while (acc >= F.STEP - 1e-9 && n < F.MAX_STEPS) { acc -= F.STEP; n++; } let dropped = 0; if (acc > F.MAX_DEBT) { dropped = acc; acc = 0; } return { n, acc, dropped }; };
  KM.unitPts = key => KM.PROD[key].pts;   // LOCKED army capacity per soldier (Looter 1 · Range 1 · Melee 2 · Mizard 3 · Elite 4 · Giant 5), the same at every level
  KM.ERA_BY_LV = [0, 0, 1, 2, 2, 3, 4, 4, 5, 6];
  KM.COIN_SCALE = 250;                                 // Gold: kills pay in the same scale as class prices
  KM.BOUNTY = 0.6;                                     // share of each kill paid instantly (the tank only slides sideways, so most drops are out of reach)
  KM.START_BANK = 3000;                                // opening decision: e.g. 30 melee, or 20 melee + 10 range + 2 collectors…
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
    fortress:    { name: 'FORTRESS SURGE', cost: 100, cd: 6, boostTxt: '+12% SHIELD', desc: 'Restore shield, repair tank + vehicles, harden the line' },
  };
  KM.POWER_IDS = Object.keys(KM.POWERS);
  KM.ENERGY_MAX = 300;
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
    { id: 'trng',   cat: 'tank', title: 'TARGETING SYSTEM', val: '+12% RANGE', icon: 'tank', color: 'blue', w: 3, max: 4, at: 1.5, apply: s => { s.tankRange *= 1.12; } },
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
  // and the environment never casts dynamic shadows — only the command vehicle and support vehicles do.
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
    { id: 'col_prospector', cls: 'collector', name: 'Prospector', color: '#e6b43a', bonus: { carry: 0.10, speed: 0.05 }, desc: '+10% carry · +5% speed', tokens: 10, diamonds: 50 },
    { id: 'rng_falcon',     cls: 'range',     name: 'Falcon Corps', color: '#3fae5a', bonus: { range: 0.06, rof: 0.05 }, desc: '+6% range · +5% fire rate', tokens: 12, diamonds: 60 },
    { id: 'mel_ironguard',  cls: 'melee',     name: 'Ironguard', color: '#8f9bb0', bonus: { armor: 1, dmg: 0.05 }, desc: '+1 armour · +5% attack', tokens: 12, diamonds: 60 },
    { id: 'eli_crimson',    cls: 'elite',     name: 'Crimson Guard', color: '#c8323a', bonus: { dmg: 0.08, armor: 1 }, desc: '+8% attack · +1 armour', tokens: 14, diamonds: 70 },
    { id: 'miz_aurora',     cls: 'mizard',    name: 'Aurora', color: '#3fd0c8', bonus: { healR: 0.15, heal: 0.08 }, desc: '+15% heal radius · +8% heal', tokens: 14, diamonds: 70 },
    { id: 'gia_titanborn',  cls: 'giant',     name: 'Titanborn', color: '#b07a3a', bonus: { hp: 0.12, steady: 0.3 }, desc: '+12% HP · knockback resist', tokens: 16, diamonds: 80 },
    { id: 'skin_royal',     cls: 'tank', name: 'Royal Blue', color: '#2f6dff', trim: '#f2c14e', bonus: {}, desc: 'Standard command vehicle', tokens: 0, diamonds: 0 },
    { id: 'skin_emerald',   cls: 'tank', name: 'Emerald', color: '#18a86b', trim: '#f2c14e', bonus: { tankRof: 0.05 }, desc: '+5% tank fire rate', tokens: 8, diamonds: 40 },
    { id: 'skin_ember',     cls: 'tank', name: 'Ember', color: '#e0632a', trim: '#2b2b33', bonus: { tankDmg: 0.05 }, desc: '+5% tank damage', tokens: 10, diamonds: 50 },
    { id: 'skin_midnight',  cls: 'tank', name: 'Midnight', color: '#3b2f86', trim: '#9ff2ff', bonus: { tankRange: 0.05 }, desc: '+5% tank range', tokens: 12, diamonds: 60 },
    { id: 'skin_gold',      cls: 'tank', name: 'Gilded', color: '#e8b52e', trim: '#fff4c2', bonus: { shield: 0.08 }, desc: '+8% force field', tokens: 18, diamonds: 90 },
  ];
  KM.SKIN_BY = Object.fromEntries(KM.SKINS.map(k => [k.id, k]));
  KM.SKIN_CLASSES = ['collector', 'range', 'melee', 'elite', 'mizard', 'giant', 'tank'];
  KM.powerCost = lv => ({ tokens: 3 + 2 * lv, diamonds: 15 + 10 * lv });   // POWERS tab: permanent level 0…10, +10% each
  KM.POWER_MAX = 10;
  KM.BUNDLES = [   // CURRENCY tab: architecture only — prices are set once earning-rate telemetry exists
    { id: 'd_small', name: 'Diamond Pouch', diamonds: 100, price: null }, { id: 'd_mid', name: 'Diamond Chest', diamonds: 550, price: null }, { id: 'd_big', name: 'Diamond Vault', diamonds: 1200, price: null },
  ];
  // Records + milestones: banked the moment they happen (a long run can never be lost)
  KM.MILESTONES = [
    { wave: 10, title: 'FIRST BOSS', tokens: 2 }, { wave: 25, title: 'BRONZE COMMANDER', tokens: 5, diamonds: 5 }, { wave: 50, title: 'SILVER COMMANDER', tokens: 10, diamonds: 10 },
    { wave: 100, title: 'GOLD COMMANDER', tokens: 20, diamonds: 20 }, { wave: 250, title: 'WARLORD', tokens: 40, diamonds: 30 }, { wave: 500, title: 'ENDLESS COMMANDER', tokens: 60, diamonds: 50 }, { wave: 1000, title: 'ENDLESS CROWN', tokens: 100, diamonds: 100 },
  ];
  KM.WEEKLY_TIERS = [{ top: 0.01, tokens: 40, diamonds: 30, title: 'WEEKLY ELITE' }, { top: 0.05, tokens: 25, badge: 1 }, { top: 0.10, tokens: 15 }, { top: 0.25, tokens: 8 }, { top: 0.50, tokens: 3 }];
  KM.weeklyReward = pct => KM.WEEKLY_TIERS.find(t => pct <= t.top) || null;   // reward tiers by percentile, not only #1
  // leaderboard order: highest wave → survival time → bosses defeated
  KM.lbCompare = (a, b) => b.wave - a.wave || b.secs - a.secs || b.bosses - a.bosses;

  KM.applySkins = function (S, equip) {   // small bounded specialisations from equipped Armory skins
    const b = {}; for (const c in equip || {}) { const sk = KM.SKIN_BY[equip[c]]; if (sk) b[c] = sk.bonus; } S.skin = b;
    const t = b.tank || {}; S.tankRate *= 1 + (t.tankRof || 0); S.tankDmg *= 1 + (t.tankDmg || 0); S.tankRange *= 1 + (t.tankRange || 0); S.shieldMul = 1 + (t.shield || 0);
    return S;
  };
  // ---------- Save data (versioned, validated, crash-safe double write) ----------
  const KEY = 'kmob.save.v1';
  KM.defaultSave = () => ({
    v: 1, tokens: 0, diamonds: 0, player: '', titles: [],
    records: { wave: 0, time: 0, bosses: 0, kills: 0, army: 0 },
    powers: { lv: {}, equip: ['linebreaker', 'arrowstorm', 'fortress'] }, skins: { owned: { skin_royal: 1 }, equip: { tank: 'skin_royal' } },
    best: { all: 0, comp: 0, daily: { d: '', t: 0 }, weekly: { w: '', t: 0 } },
    totals: { runs: 0, kills: 0, time: 0, coins: 0 },
    settings: { sound: 1, music: 1, haptics: 1, competitive: 0, speed: 1 },
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
    d.diamonds = Math.floor(num(raw.diamonds, 0)); if (typeof raw.player === 'string' && /^[A-Z0-9]{4,12}$/.test(raw.player)) d.player = raw.player;
    if (Array.isArray(raw.titles)) d.titles = raw.titles.filter(t => KM.MILESTONES.some(m => m.title === t));
    for (const k of Object.keys(d.records)) d.records[k] = num((raw.records || {})[k], 0);
    const pw = raw.powers || {}; for (const id of KM.POWER_IDS) { const l = Math.floor(num((pw.lv || {})[id], 0)); if (l) d.powers.lv[id] = Math.min(KM.POWER_MAX, l); }
    if (Array.isArray(pw.equip)) { const e = [...new Set(pw.equip.filter(id => KM.POWERS[id]))].slice(0, 3); if (e.length) d.powers.equip = e; }
    const sk = raw.skins || {}, owned = Object.assign({}, sk.owned, raw.owned);   // legacy launcher skins migrate into the Armory
    for (const id of Object.keys(owned)) if (KM.SKIN_BY[id]) d.skins.owned[id] = 1;
    const eq = Object.assign({}, sk.equip); if (raw.equip && raw.equip.skin) eq.tank = eq.tank || raw.equip.skin;
    for (const c of KM.SKIN_CLASSES) { const id = eq[c]; if (id && d.skins.owned[id] && KM.SKIN_BY[id].cls === c) d.skins.equip[c] = id; }
    for (const k of Object.keys(d.settings)) { const v = (raw.settings || {})[k]; if (k === 'speed' ? [1, 1.5, 2].includes(v) : v === 0 || v === 1) d.settings[k] = v; }   // game speed is remembered between runs
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
  KM.chunksFor = function (frontZ) {
    const ahead = 100, behind = 72;
    const a = Math.floor(-(frontZ + behind) / KM.W.CHUNK), b = Math.floor(-(frontZ - ahead) / KM.W.CHUNK);
    const out = []; for (let i = a; i <= b; i++) out.push(i); return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
