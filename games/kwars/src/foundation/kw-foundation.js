/* K WARS SOLDIER FOUNDATION (candidate, under review -- NOT loaded by the production game).
   One authoritative soldier engine + one authoritative formation engine (Directive "Canonical Soldier Foundation Reset").

   Layering, each owned by exactly one place in this file:
     equipment  -> setEquipment()/loseSpear()/breakShield()   (the only mutators)
     role       -> deriveRole(equipment)                       (the only role decision; read as u.role)
     slot       -> FormationController                         (the only place that assigns a destination)
     motion     -> locomote()                                  (the only position integrator; separation is a velocity term)
     animation  -> animState() from measured displacement      (gait phase = distance actually travelled / stride)
   Deterministic: fixed step, seeded RNG, no wall clock.                                                             */
(function(){
'use strict';

/* ------------------------------------------------------------------ tuning ------------------------------------------ */
const T = Object.freeze({
  DT: 1/60,
  WALK: 44, RUN: 76, SHUFFLE: 20, BACKSTEP: 38,          // px/s (a shield-bearer backing away keeps pace with the withdrawal)
  ACCEL: 170, DECEL: 240,                                 // px/s^2
  STRIDE: { WALK: 30, RUN: 46, SHUFFLE: 14, BACK: 26 },   // px of travel per full gait cycle (two steps)
  RUN_FROM: 58, MOVE_FROM: 6,                             // speed thresholds for the gait states
  ARRIVE: 16, SETTLE: 2.2,                                // slot arrival radius / settled tolerance
  CATCHUP: 36,                                            // C2: a soldier this far from a MOVING slot runs to catch up (walk ~= anchor speed never closes a gap)
  RETREAT_PACE: 0.8,                                      // C2: the formation withdraws slower than a walk, so every band can keep its place
  ENTRY_GAP: 26,                                          // C2: spacing of soldiers released into one entry corridor
  TURN_DWELL: 0.45, TURN_TIME: 0.16,                      // a new facing must persist this long; the turn takes this long
  LANES: [404, 422, 440, 458],                            // formation rows (screen y): few, well separated, so depth rows never stack into a wall
  BODY_HX: 7, BODY_HY: 4,                                 // body footprint half-extents (x along the battle, y depth): bodies 8+ px apart in depth are at different depths
  COL: { SWORDSMAN: 30, SPEARMAN: 32, RANGED: 38 },       // column spacing per role footprint (a bow needs room)
  BAND_GAP: 30,                                           // empty space between the role bands, so they read as lines
  REACH: { SWORDSMAN: 30, SPEARMAN: 62, RANGED: 280 },   // a spear reaches past the front rank    // centre-to-centre engagement distance
  ENGAGE: { DEFEND: { SWORDSMAN: 64, SPEARMAN: 50, RANGED: 280 }, ATTACK: { SWORDSMAN: 120, SPEARMAN: 70, RANGED: 280 } },
  LEASH:  { DEFEND: 70, ATTACK: 130, RETREAT: 0, MARCH: 40 },
  ATK: {                                                   // wind-up -> contact -> recovery (s)
    SWORDSMAN: { wind: 0.16, hit: 0.26, end: 0.52, cd: 0.42, dmg: 24 },
    SPEARMAN:  { wind: 0.20, hit: 0.32, end: 0.60, cd: 0.50, dmg: 28 },
    RANGED:    { wind: 0.55, hit: 0.56, end: 0.85, cd: 1.10, dmg: 14 },
  },
  THROW: { time: 0.56, release: 0.30, min: 40, max: 300, dmg: 34 },
  DRAW_TIME: 0.32,
  HIT_TIME: 0.20, BLOCK_RECOIL: 0.18, GUARD_RANGE: 56,
  SPEAR_INTEGRITY: 20,
  WORLD: { MIN: 40, MAX: 1960 },
});

/* --------------------------------------------------------------- rng ------------------------------------------------- */
function rng(seed){ let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ------------------------------------------------- equipment -> role (the ONLY role decision) ----------------------- */
const ROLES = Object.freeze(['SWORDSMAN', 'SPEARMAN', 'RANGED']);
function deriveRole(eq){ return eq.bow ? 'RANGED' : eq.spear ? 'SPEARMAN' : 'SWORDSMAN'; }
const SPAWN = {
  sword:  { eq: { sword: true, spear: false, bow: false, shield: true },  hp: 50, shield: 30, armor: 16 },
  spear:  { eq: { sword: true, spear: true,  bow: false, shield: true },  hp: 60, shield: 40, armor: 20 },
  archer: { eq: { sword: false, spear: false, bow: true, shield: false }, hp: 36, shield: 0,  armor: 8 },
};

class World {
  constructor(opt){
    opt = opt || {};
    this.rand = rng(opt.seed || 1);
    this.t = 0; this.units = []; this.projectiles = []; this.events = []; this.nextId = 1;
    this.teams = { 1: new FormationController(this, 1, opt.anchor1 || 520), [-1]: new FormationController(this, -1, opt.anchor2 || 1480) };
    this.homeX = { 1: opt.home1 || 260, [-1]: opt.home2 || 1740 };   // retreat destination / garrison transition zone
    this.entryX = { 1: opt.entry1 || T.WORLD.MIN + 20, [-1]: opt.entry2 || T.WORLD.MAX - 20 };   // C2: where an army's soldiers enter (its rear edge / gate)
    this.queue = { 1: [], [-1]: [] };
  }
  /* ---------------------------------------------------------------- spawning ---------------------------------- */
  spawn(team, type, x, y, kit, queued){
    const S = SPAWN[type]; if (!S) throw new Error('unknown type ' + type);
    const shieldOK = kit && kit.shield === false ? false : S.eq.shield;   // the era kit decides once; render reads the same field
    const u = { id: this.nextId++, team, spawnType: type, x, y, vx: 0, vy: 0, face: team, alive: true,
      hp: S.hp, maxHp: S.hp,
      eq: { sword: S.eq.sword, spear: S.eq.spear, bow: S.eq.bow, shield: shieldOK },
      shieldHP: shieldOK ? S.shield : 0, shieldMax: shieldOK ? S.shield : 0, armorHP: S.armor, armorMax: S.armor,
      spearIntegrity: S.eq.spear ? T.SPEAR_INTEGRITY : 0,
      role: null, slot: null, target: null, targetT: 0,
      act: null, actT: 0, actDone: false, cd: 0, recoverT: 0, hitT: 0, blockT: 0, guard: false,
      gait: 0, gaitState: 'IDLE', state: 'IDLE', faceWant: team, faceWantT: 0, turnT: 0, turnFrom: team,
      lastX: x, lastY: y, disp: 0, retreatBack: false, deathT: 0, deathKind: null, stats: { hits: 0, blocks: 0, roleChanges: [] } };
    u.role = deriveRole(u.eq);
    u.queued = !!queued;
    if (!queued) this.units.push(u);   // a queued soldier is not on the field until released (his slot is already reserved)
    this.teams[team].add(u);
    return u;
  }
  /* C2 ORDERED ENTRY (initial armies AND reinforcements). The soldier's role decides his place at once; he enters at his
     army's rear edge in a corridor BETWEEN depth rows (nobody stands there), walks forward to his place and steps into his
     row. Front bands are enlisted first, so earlier entrants are always ahead of later ones; one soldier per corridor is
     released at a time, so nobody appears inside anybody. No crowd, no untangling, no teleport. */
  enlist(team, type, kit){
    const u = this.spawn(team, type, this.entryX[team], T.LANES[0], kit, true);
    const r = u.slot.row, c = u.slot.col;
    const corr = (c + r) % 2 ? r : r + 1;                                        // the corridor above or below his row
    u.corridorY = corr === 0 ? T.LANES[0] - 9 : corr >= T.LANES.length ? T.LANES[T.LANES.length - 1] + 9 : (T.LANES[corr - 1] + T.LANES[corr]) / 2;
    this.queue[team].push(u);
    return u;
  }
  /* C2 INITIAL DEPLOYMENT (form A): an army that starts the battle already in line -- every soldier is created AT his assigned
     place. Only before the battle starts; anything joining later enters through the corridors (enlist). */
  deploy(team, list){
    const us = list.map(([type, kit]) => this.spawn(team, type, this.teams[team].anchor, T.LANES[0], kit));
    for (const u of us){ const p = this.teams[team].slotPos(u.slot); u.x = u.lastX = p.x; u.y = u.lastY = p.y; u.face = team; u.faceWant = team; }
    return us;
  }
  releaseEntries(){
    for (const k of [1, -1]){
      const q = this.queue[k], used = new Set(), first = BAND_ORDER.find(r => q.some(u => u.role === r));   // strict role order: front band first
      for (let i = 0; i < q.length; i++){
        const u = q[i]; if (u.role !== first || used.has(u.corridorY)) continue;
        const ex = this.entryX[k];
        if (this.units.some(o => o.alive && Math.abs(o.x - ex) < T.ENTRY_GAP && Math.abs(o.y - u.corridorY) < 9)) { used.add(u.corridorY); continue; }
        this.units.push(u); u.queued = false; u.entering = true; this.event('enter', u, { role: u.role }); u.x = u.lastX = ex; u.y = u.lastY = u.corridorY; u.face = k; q.splice(i, 1); i--; used.add(u.corridorY);
      }
    }
  }
  /* ------------------------------------------------- equipment mutators (the ONLY ones) ------------------------ */
  setEquipment(u, patch, why){
    const before = u.role;
    Object.assign(u.eq, patch);
    if (!u.eq.shield) { u.shieldHP = 0; }
    if (!u.eq.spear) u.spearIntegrity = 0;
    u.role = deriveRole(u.eq);
    if (u.role !== before){
      u.stats.roleChanges.push({ t: this.t, from: before, to: u.role, why });
      this.event('role', u, { from: before, to: u.role, why });
      this.teams[u.team].roleChanged(u, before);   // the formation hears it from here, once
      if (before === 'SPEARMAN' && u.role === 'SWORDSMAN' && u.alive){ u.act = 'DRAW'; u.actT = 0; }   // draws his sword
    }
  }
  loseSpear(u, why){ if (u.eq.spear) this.setEquipment(u, { spear: false }, why); }
  breakShield(u){ if (u.eq.shield){ this.setEquipment(u, { shield: false }, 'shield-broken'); this.event('shieldBroken', u); } }
  event(kind, u, data){ this.events.push(Object.assign({ t: +this.t.toFixed(3), kind, id: u && u.id }, data || {})); }

  /* --------------------------------------------------------------- commands ----------------------------------- */
  command(team, cmd){ this.teams[team].setCommand(cmd); this.event('command', null, { team, cmd }); }
  throwSpears(team){
    const enemies = this.units.filter(e => e.alive && e.team !== team);
    let n = 0;
    for (const u of this.units){
      if (!u.alive || u.team !== team || !u.eq.spear || u.act === 'THROW') continue;
      const tgt = this.pickThrowTarget(u, enemies); if (!tgt) continue;
      u.act = 'THROW'; u.actT = 0; u.actDone = false; u.throwTarget = tgt; n++;
    }
    return n;
  }
  pickThrowTarget(u, enemies){   // nearest enemy in the soldier's own lane, inside throwing range, in front of him
    let best = null, bs = 1e9;
    for (const e of enemies){ const dx = (e.x - u.x) * u.team; if (dx < T.THROW.min || dx > T.THROW.max) continue; const s = dx + Math.abs(e.y - u.y) * 6; if (s < bs){ bs = s; best = e; } }
    return best;
  }

  /* ---------------------------------------------------------------- the step ---------------------------------- */
  step(){
    const dt = T.DT; this.t += dt;
    this.releaseEntries();
    for (const k of [1, -1]) this.teams[k].update(dt);
    for (const u of this.units) if (u.alive) this.think(u, dt);
    for (const u of this.units) this.locomote(u, dt);
    for (const u of this.units) if (u.alive) this.act(u, dt);
    this.updateProjectiles(dt);
    for (const u of this.units) this.animate(u, dt);
  }

  /* ----------------------------------- engagement: lane-first, around the slot, with a leash ------------------ */
  think(u, dt){
    const F = this.teams[u.team], mode = F.mode;
    u.targetT -= dt;
    if (mode === 'RETREAT' || u.entering){ u.target = null; return; }
    const slotP = F.slotPos(u.slot);
    const leash = T.LEASH[mode] || 60;
    const still = u.target && u.target.alive && Math.abs(u.target.x - slotP.x) <= leash + T.REACH[u.role] && Math.abs(u.target.y - u.y) < 22;
    if (u.targetLock && u.target && u.target.alive) return;                // lab scripts may pin a target
    if (still && u.targetT > 0) return;                                    // sticky: no re-shopping every frame
    u.targetT = 0.25 + this.rand() * 0.1;
    const R = (T.ENGAGE[mode] || T.ENGAGE.DEFEND)[u.role];
    let best = null, bs = 1e9;
    for (const e of this.units){
      if (!e.alive || e.team === u.team) continue;
      const ahead = (e.x - slotP.x) * u.team;                               // measured from the SLOT, not the soldier
      if (u.role === 'RANGED'){ const d = (e.x - u.x) * u.team; if (d < 30 || d > T.REACH.RANGED) continue; const s = d + Math.abs(e.y - u.y) * 2; if (s < bs){ bs = s; best = e; } continue; }
      if (ahead > R + T.REACH[u.role] || ahead < -40) continue;
      const lane = Math.abs(e.y - u.y);
      let s = Math.abs(e.x - u.x) + lane * 4 + (lane > 16 ? 200 : 0);   // own lane first; cross-lane only if nothing else
      for (const c of this.units) if (c !== u && c.alive && c.team === u.team && c.target === e && Math.abs(c.y - u.y) < 8 && (c.x - u.x) * u.team > 0){ s += 150; break; }   // already fought by the comrade in front of me
      if (s < bs){ bs = s; best = e; }
    }
    u.target = best;
  }

  /* ------------------------------------- the ONLY position integrator ---------------------------------------- */
  locomote(u, dt){
    if (!u.alive){ u.vx *= 0.8; u.vy = 0; u.x += u.vx * dt; this.measure(u); return; }
    const F = this.teams[u.team];
    let gx, gy, speed = T.WALK, want = 0;   // goal + desired speed
    const busy = u.act === 'ATTACK' || u.act === 'THROW' || u.act === 'DRAW' || u.hitT > 0 || u.blockT > 0;
    const slotP = F.slotPos(u.slot);
    if (u.target && u.role !== 'RANGED'){
      const reach = T.REACH[u.role];
      gx = u.target.x - u.team * reach; gy = u.y + Math.max(-0.6, Math.min(0.6, (u.target.y - u.y) * 0.05));
      for (const c of this.units){   // a comrade ahead of me in this row: queue one body behind him, never squeeze into him
        if (c === u || !c.alive || c.team !== u.team || Math.abs(c.y - u.y) > 8 || (c.x - u.x) * u.team <= 0) continue;   // ANY comrade ahead in my row
        const behind = c.x - u.team * (T.BODY_HX * 2 + 6); if ((gx - behind) * u.team > 0) gx = behind;
      }
      speed = Math.abs(gx - u.x) > 70 ? T.RUN : T.WALK;
    } else if (u.goal){ gx = u.goal.x; gy = u.goal.y; const d = Math.hypot(gx - u.x, gy - u.y); speed = d > 150 ? T.RUN : d < T.ARRIVE * 0.75 ? T.SHUFFLE : T.WALK;   // lab: a direct destination
    } else if (u.entering){   /* C2 ORDERED ENTRY: walk forward in the corridor between depth rows, then step into the place */
      gy = u.corridorY; gx = slotP.x;
      if ((slotP.x - u.x) * u.team <= 4){ gy = slotP.y; if (Math.hypot(slotP.x - u.x, slotP.y - u.y) < T.ARRIVE) u.entering = false; }
      speed = F.mode !== 'DEFEND' && Math.abs(slotP.x - u.x) > T.CATCHUP ? T.RUN : T.WALK;   // a moving formation is caught up with, like any slot
    } else { gx = slotP.x; gy = slotP.y; const d = Math.hypot(gx - u.x, gy - u.y), moving = F.mode === 'ATTACK' || F.mode === 'RETREAT' || F.mode === 'MARCH';
      speed = d > (moving ? T.CATCHUP : 90) && (moving || d > 90) ? T.RUN : d < T.ARRIVE * 0.75 ? T.SHUFFLE : T.WALK; }
    if (F.mode === 'RETREAT' && u.retreatBack) speed = Math.min(speed, T.BACKSTEP);
    speed *= (u.speedMul || 1);
    /* C2 RETREAT PROTECTION ORDER -- the one Retreat formation rule: a protector never withdraws past the front-most soldier he
       protects (swords stay in front of spears and ranged, spears in front of ranged), whatever their pace. */
    if (F.mode === 'RETREAT' && u.role !== 'RANGED' && !u.entering) gx += u.team * (F.guardShift[u.role] || 0);   // the band holds as a block in front of those it protects
    let dvx = 0, dvy = 0;
    if (!busy){
      const dx = gx - u.x, dy = gy - u.y, d = Math.hypot(dx, dy);
      if (d > T.SETTLE){ const sp = Math.min(speed, speed * d / T.ARRIVE); dvx = dx / d * sp; dvy = dy / d * sp; want = 1; }
    }
    /* separation is part of the desired velocity (never a positional shove after locomotion) */
    /* bodies are solid for comrades too: a soldier may move along or away from a comrade, never into him;
       overlapping pairs separate through velocity (so the legs explain it) */
    for (const o of this.units){
      if (o === u || !o.alive || o.team !== u.team) continue;
      let ex = (u.x - o.x) / (T.BODY_HX * 2.2), ey = (u.y - o.y) / (T.BODY_HY * 2), dd = Math.hypot(ex, ey);
      if (dd >= 1) continue;
      if (dd < 1e-3){ ex = (u.id > o.id ? 1 : -1) * 0.01; ey = 0; dd = 0.01; }
      if (Math.abs(ey) < 0.15){ ey = (u.id > o.id ? 0.3 : -0.3); dd = Math.hypot(ex, ey); }   // same depth exactly: split up/down
      const nx = ex / dd, ny = ey / dd, inward = -(dvx * nx + dvy * ny);
      if (inward > 0){ dvx += nx * inward; dvy += ny * inward;            // cancel the component that walks into him ...
        if (Math.abs(dvx) < 8 && Math.abs(gx - u.x) > 20){ const side = Math.sign(u.y - o.y) || (u.id % 2 ? 1 : -1); dvy += side * 34; } }   // ... and step round him through the gap between depth lines
      if (!busy){ const push = (1 - dd) * 90; dvx += nx * push; dvy += ny * push * 0.7; }  // and ease apart -- a soldier mid-strike is planted; the comrade gives way
    }
    /* enemies are solid: a soldier can stand at the edge of an enemy body, never inside it (only motion INTO him is stopped) */
    for (const o of this.units){
      if (o.team === u.team || !o.alive || Math.abs(o.y - u.y) > T.BODY_HY * 2.4) continue;
      const gap = (o.x - u.x) * Math.sign(dvx || 1), minGap = T.BODY_HX * 2 + 2;
      if (gap > 0 && gap < minGap + Math.abs(dvx) * dt + 1 && Math.sign(o.x - u.x) === Math.sign(dvx)) dvx = Math.sign(dvx) * Math.max(0, (gap - minGap) / dt) * 0;
    }
    /* acceleration-limited integration */
    const ax = dvx - u.vx, ay = dvy - u.vy, al = Math.hypot(ax, ay);
    const lim = (want ? T.ACCEL : T.DECEL) * dt;
    if (al > lim){ u.vx += ax / al * lim; u.vy += ay / al * lim; } else { u.vx = dvx; u.vy = dvy; }
    u.x += u.vx * dt; u.y += u.vy * dt;
    u.x = Math.max(T.WORLD.MIN, Math.min(T.WORLD.MAX, u.x)); u.y = Math.max(T.LANES[0] - 8, Math.min(T.LANES[T.LANES.length - 1] + 8, u.y));
    this.measure(u);
    /* facing: from the target, else the travel direction, else toward the enemy -- with a dwell so it cannot jitter */
    let fw = u.team;
    if (u.target) fw = Math.sign(u.target.x - u.x) || u.face;
    else if (F.mode === 'RETREAT') fw = u.retreatBack ? u.team : -u.team;
    else if (u.goal ? Math.hypot(u.goal.x - u.x, u.goal.y - u.y) > 50 && Math.abs(u.vx) > 20 : F.slotDist(u) > 50 && Math.abs(u.vx) > 20) fw = Math.sign(u.vx);   // long moves face the way they go; small adjustments keep facing the enemy (shuffle / back-step)
    if (u.act === 'ATTACK' || u.act === 'THROW') fw = u.face;
    if (fw !== u.faceWant){ u.faceWant = fw; u.faceWantT = 0; }
    u.faceWantT += dt;
    if (fw !== u.face && u.turnT <= 0 && (u.faceWantT >= T.TURN_DWELL || (u.target && Math.abs(u.target.x - u.x) < T.REACH[u.role] + 20))){ u.turnFrom = u.face; u.face = fw; u.turnT = T.TURN_TIME; this.event('turn', u, { to: fw }); }
    if (u.turnT > 0) u.turnT -= dt;
  }
  measure(u){ const dx = u.x - u.lastX, dy = u.y - u.lastY; u.disp = Math.hypot(dx, dy); u.dispX = dx; u.lastX = u.x; u.lastY = u.y; }

  /* ------------------------------------------------------------- combat actions -------------------------------- */
  act(u, dt){
    u.cd -= dt; if (u.hitT > 0) u.hitT -= dt; if (u.blockT > 0) u.blockT -= dt;
    if (u.act) u.guard = false;   // a soldier mid-attack / mid-throw has his guard down
    if (u.act === 'THROW'){ u.actT += dt;
      if (!u.actDone && u.actT >= T.THROW.release){ u.actDone = true; this.launchSpear(u); }
      if (u.actT >= T.THROW.time){ u.act = u.act === 'THROW' ? null : u.act; }
      return; }
    if (u.act === 'DRAW'){ u.actT += dt; if (u.actT >= T.DRAW_TIME){ u.act = null; } return; }
    if (u.act === 'ATTACK'){ const A = T.ATK[u.role] || T.ATK.SWORDSMAN; u.actT += dt;
      if (!u.actDone && u.actT >= A.hit){ u.actDone = true; this.resolveStrike(u); }
      if (u.actT >= A.end){ u.act = null; u.cd = A.cd; }
      return; }
    /* guard: a shield-bearer raises it toward a threat in front of him (not toward his back) */
    u.guard = false;
    if (u.eq.shield && u.hitT <= 0){
      for (const e of this.units){ if (!e.alive || e.team === u.team) continue; const d = (e.x - u.x) * u.face; if (d > 0 && d < T.GUARD_RANGE && Math.abs(e.y - u.y) < 16){ u.guard = true; break; } }
      for (const p of this.projectiles){ if (p.team === u.team) continue; const d = (p.x - u.x) * u.face; if (d > 0 && d < 140 && Math.abs(p.ty - u.y) < 14){ u.guard = true; break; } }
    }
    const tg = u.target; if (!tg || !tg.alive || u.cd > 0 || u.hitT > 0) return;
    const dx = (tg.x - u.x) * u.face, dy = Math.abs(tg.y - u.y);
    if (u.role === 'RANGED'){ if (dx > 20 && dx <= T.REACH.RANGED && Math.hypot(u.vx, u.vy) < 16){ u.act = 'ATTACK'; u.actT = 0; u.actDone = false; u.shotAt = tg; } return; }   // stop, then draw
    if (dx > 0 && dx <= T.REACH[u.role] + 4 && dy < 12 && Math.hypot(u.vx, u.vy) < 16){ u.act = 'ATTACK'; u.actT = 0; u.actDone = false; }   // approach -> STOP at weapon distance -> attack
  }
  resolveStrike(u){
    const A = T.ATK[u.role];
    if (u.role === 'RANGED'){ const tg = u.shotAt; if (!tg) return; const d = Math.abs(tg.x - u.x), tt = Math.max(0.35, d / 300), g = 420, sy = u.y - 24; this.projectiles.push({ kind: 'arrow', team: u.team, x: u.x + u.face * 6, y: sy, ty: tg.y, vx: u.face * d / tt, vy: ((tg.y - 24) - sy - 0.5 * g * tt * tt) / tt, g, dmg: A.dmg, src: u, life: 4 }); this.event('shot', u); return; }
    const tg = u.target; if (!tg || !tg.alive) return;
    const dx = (tg.x - u.x) * u.face; if (dx <= 0 || dx > T.REACH[u.role] + 8 || Math.abs(tg.y - u.y) > 13){ this.event('miss', u); return; }
    this.damage(tg, A.dmg, u.x, u, u.role === 'SPEARMAN' ? 'thrust' : 'cut');
    if (u.role === 'SPEARMAN' && tg.blockedLast){ u.spearIntegrity--; if (u.spearIntegrity <= 0){ this.loseSpear(u, 'broken'); this.event('spearBroken', u); } }
  }
  launchSpear(u){
    const tg = u.throwTarget && u.throwTarget.alive ? u.throwTarget : this.pickThrowTarget(u, this.units.filter(e => e.alive && e.team !== u.team));
    const dist = tg ? Math.abs(tg.x - u.x) : 160, tt = Math.max(0.5, dist / 300);
    const sy = u.y - 30, ty = tg ? tg.y : u.y, g = 520; this.projectiles.push({ kind: 'spear', team: u.team, x: u.x + u.face * 10, y: sy, ty, vx: u.face * dist / tt, vy: ((ty - 22) - sy - 0.5 * g * tt * tt) / tt, g, dmg: T.THROW.dmg, src: u, life: 4 });
    this.loseSpear(u, 'thrown');      // the spear leaves inventory as it leaves the hand -- not before
    this.event('throw', u, { at: tg && tg.id });
  }
  /* layered damage: a RAISED shield facing the blow takes it; a blow from behind never touches the shield */
  damage(v, dmg, srcX, src, kind){
    v.blockedLast = false;
    const frontal = Math.sign(srcX - v.x) === v.face;
    if (v.eq.shield && frontal && v.guard){   // only a RAISED shield facing the blow intercepts it
      v.shieldHP -= dmg; v.blockT = T.BLOCK_RECOIL; v.blockedLast = true; v.stats.blocks++;
      this.event('block', v, { by: src && src.id, how: kind });
      if (v.shieldHP <= 0) this.breakShield(v);
      return;
    }
    let left = dmg;
    if (v.armorHP > 0){ const a = Math.min(v.armorHP, left * 0.4); v.armorHP -= a; left -= a; }
    v.hp -= left; v.hitT = T.HIT_TIME; v.stats.hits++;
    if (v.act === 'ATTACK' && v.actT < (T.ATK[v.role] || T.ATK.SWORDSMAN).hit) v.act = null;   // a hit interrupts a wind-up
    v.vx += Math.sign(v.x - srcX) * 40;                                                        // knock-back goes through the integrator
    this.event('hit', v, { by: src && src.id, how: kind, frontal });
    if (v.hp <= 0) this.kill(v, kind);
  }
  kill(v, kind){ if (!v.alive) return; v.alive = false; v.hp = 0; v.deathT = 0; v.deathKind = kind; v.act = null; v.target = null; this.teams[v.team].remove(v); this.event('death', v, { how: kind }); }

  updateProjectiles(dt){
    for (const p of this.projectiles){
      if (p.life <= 0) continue;
      p.life -= dt; p.vy += (p.g || 420) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      for (const v of this.units){
        if (!v.alive || v.team === p.team || Math.abs(v.y - p.ty) > 9) continue;
        if (Math.abs(v.x - p.x) < 8 && p.y > v.y - 46 && p.y < v.y){ this.damage(v, p.dmg, p.x - p.vx * 0.05, p.src, p.kind); p.life = 0; p.hit = v.id; break; }
      }
      if (p.life > 0 && p.y >= p.ty){ p.life = 0; p.landed = true; }
    }
    this.projectiles = this.projectiles.filter(p => p.life > 0 || (p.landed && (p.stuckT = (p.stuckT || 0) + dt) < 2));
  }

  /* ------------------------------ animation state: explained by measured displacement, never by intent -------- */
  animate(u, dt){
    if (!u.alive){ u.deathT += dt; u.state = 'DEATH'; return; }
    const sp = u.disp / dt, F = this.teams[u.team];
    const back = F.mode === 'RETREAT' && u.retreatBack && u.dispX * u.team < -0.05;
    let gs;
    if (sp >= T.RUN_FROM) gs = 'RUN'; else if (sp >= T.MOVE_FROM) gs = back ? 'BACK' : (F.slotDist(u) < T.ARRIVE && !u.target ? 'SHUFFLE' : 'WALK');
    else gs = (u.gaitState === 'WALK' || u.gaitState === 'RUN' || u.gaitState === 'STOP') && (u.gait % 0.5) > 0.06 && (u.gait % 0.5) < 0.44 ? 'STOP' : 'IDLE';
    const stride = T.STRIDE[gs === 'STOP' ? 'WALK' : gs] || T.STRIDE.WALK;
    if (gs === 'STOP') u.gait += Math.min(0.5 - (u.gait % 0.5), dt * 1.6);   // finish the step that is under way, then plant
    else if (gs !== 'IDLE') u.gait += (u.disp / stride) * (back ? -1 : 1);  // feet advance exactly as far as the body did
    u.gait = ((u.gait % 1) + 1) % 1;
    u.gaitState = gs;
    u.state = u.act ? u.act : u.hitT > 0 ? 'HIT' : u.blockT > 0 ? 'BLOCK' : u.turnT > 0 ? 'TURN' : (u.guard && gs === 'IDLE') ? 'BLOCK' : (F.mode === 'RETREAT' && gs !== 'IDLE' ? 'RETREAT' : gs);
  }

  snapshot(){ return this.units.map(u => ({ id: u.id, team: u.team, role: u.role, alive: u.alive, x: +u.x.toFixed(2), y: +u.y.toFixed(2), face: u.face, state: u.state, gait: +u.gait.toFixed(3), slot: u.slot && u.slot.id, eq: { ...u.eq }, shieldHP: u.shieldHP })); }
}

/* ============================================ FORMATION CONTROLLER (one per team) ============================================ */
const BAND_ORDER = ['SWORDSMAN', 'SPEARMAN', 'RANGED'];
class FormationController {
  constructor(world, team, anchor){ this.w = world; this.team = team; this.anchor = anchor; this.home = anchor; this.mode = 'DEFEND'; this.guardLine = { SWORDSMAN: null, SPEARMAN: null }; this.guardShift = {}; this.slots = { SWORDSMAN: [], SPEARMAN: [], RANGED: [] }; this.contactHold = false; this.reshapes = 0; this.reassign = 0; }
  rows(){ return T.LANES.length; }
  cols(role){ const s = this.slots[role]; return s.length ? Math.max(...s.map(z => z.col)) + 1 : 0; }
  bandStart(role){ let off = 0; for (const r of BAND_ORDER){ if (r === role) return off; const c = this.cols(r); if (c) off += c * T.COL[r] + T.BAND_GAP; } return off; }
  slotPos(slot){
    if (!slot) return { x: this.anchor, y: T.LANES[0] };
    return { x: this.anchor - this.team * (this.bandStart(slot.role) + slot.col * T.COL[slot.role]), y: T.LANES[slot.row] };
  }
  slotDist(u){ const p = this.slotPos(u.slot); return Math.hypot(p.x - u.x, p.y - u.y); }
  /* new soldier: the front-most vacant place of his role, in the row nearest him */
  add(u){ const s = this.vacant(u.role, u) || this.newSlot(u.role, u); this.take(s, u); }
  take(s, u){ s.occ = u; u.slot = s; }
  vacant(role, near){
    let best = null, bs = 1e9;
    for (const s of this.slots[role]){ if (s.occ) continue; const p = this.slotPos(s); const d = s.col * 1000 + Math.abs(p.y - near.y); if (d < bs){ bs = d; best = s; } }
    return best;
  }
  newSlot(role, near){
    const list = this.slots[role], R = this.rows();
    let col = 0; while (list.filter(s => s.col === col).length >= R) col++;
    const used = new Set(list.filter(s => s.col === col).map(s => s.row));
    let row = 0, bd = 1e9; for (let r = 0; r < R; r++){ if (used.has(r)) continue; const d = Math.abs(T.LANES[r] - (near ? near.y : T.LANES[2])); if (d < bd){ bd = d; row = r; } }
    const s = { id: role[0] + ':' + col + ':' + row, role, col, row, occ: null }; list.push(s); if (col > 0 && list.filter(z => z.col === col).length === 1) this.reshapes++; return s;
  }
  /* LOCAL gap filling: the soldier directly behind in the same row steps up; the chain stays in that row. Nobody else moves. */
  vacate(s){
    if (!s) return;
    s.occ = null;
    let hole = s;
    for (;;){
      const behind = this.slots[s.role].filter(z => z.row === hole.row && z.col > hole.col && z.occ && z.occ.alive).sort((a, b) => a.col - b.col)[0];
      if (!behind) break;
      const u = behind.occ; behind.occ = null; this.take(hole, u); this.reassign++; hole = behind;
    }
    this.prune(s.role);
  }
  prune(role){   // drop empty slots in the rear-most column only (never reshapes the occupied lines)
    const list = this.slots[role];
    for (;;){ const c = this.cols(role) - 1; if (c < 0) break; const last = list.filter(z => z.col === c); if (last.some(z => z.occ)) break; this.slots[role] = list.filter(z => z.col !== c); break; }
  }
  remove(u){ const s = u.slot; u.slot = null; if (s) this.vacate(s); }
  /* role change (spearman -> swordsman): leave the spear slot (closed locally), take the NEAREST swordsman place */
  roleChanged(u, from){
    const old = u.slot; u.slot = null; if (old) this.vacate(old);
    let best = null, bd = 1e9;
    for (const s of this.slots[u.role]){ if (s.occ) continue; const p = this.slotPos(s); const d = Math.hypot(p.x - u.x, p.y - u.y); if (d < bd){ bd = d; best = s; } }
    this.take(best || this.newSlot(u.role, u), u); this.reassign++;
  }
  setCommand(cmd){
    this.mode = cmd;
    if (cmd === 'RETREAT') for (const s of [].concat(...Object.values(this.slots))) if (s.occ){ const u = s.occ; u.retreatBack = u.eq.shield && u.role !== 'RANGED'; u.target = null; if (u.act === 'ATTACK') u.act = null; }
    if (cmd !== 'RETREAT') for (const u of this.w.units) if (u.team === this.team) u.retreatBack = false;
  }
  update(dt){
    const dir = this.team, enemies = this.w.units.filter(e => e.alive && e.team !== this.team);
    const front = enemies.length ? Math.min(...enemies.map(e => (e.x - this.anchor) * dir)) : 1e9;   // distance from our front line to theirs
    if (this.mode === 'ATTACK' || this.mode === 'MARCH'){
      const stopAt = this.mode === 'ATTACK' ? T.REACH.SWORDSMAN + 2 : 140;
      this.contactHold = front <= stopAt;
      if (!this.contactHold) this.anchor += dir * T.WALK * 0.92 * dt;
    } else if (this.mode === 'RETREAT'){   /* withdraw until the REAR band reaches the garrison zone (not the front: that ran the rear off the field) */
      const home = this.w.homeX[this.team] + dir * this.depth(); const d = (this.anchor - home) * dir;
      if (d > 0) this.anchor -= dir * Math.min(d, T.WALK * T.RETREAT_PACE * dt);
    }
    /* guard lines for the Retreat protection order: the front-most protected soldier (+ one body and a half) */
    const al = this.w.units.filter(u => u.alive && u.team === this.team && !u.entering), lead = r => { const a = al.filter(u => u.role === r); return a.length ? Math.max(...a.map(u => u.x * dir)) : null; };
    const fr = lead('RANGED'), fs = lead('SPEARMAN'), m = (a, b) => a === null ? b : b === null ? a : Math.max(a, b), gap = T.BODY_HX * 2 + 10;
    this.guardLine = { SPEARMAN: fr === null ? null : dir * (fr + gap), SWORDSMAN: m(fr, fs) === null ? null : dir * (m(fr, fs) + gap) };
    /* the protection order applied to the BAND: if its rear column would withdraw past the soldiers it protects, the whole band
       is held forward by that amount, so its soldiers keep their places relative to each other (no squeeze onto one line) */
    this.guardShift = {};
    for (const r of ['SWORDSMAN', 'SPEARMAN']){ const line = this.guardLine[r], c = this.cols(r); if (line === null || !c){ this.guardShift[r] = 0; continue; }
      const rearX = this.anchor - dir * (this.bandStart(r) + (c - 1) * T.COL[r]); this.guardShift[r] = Math.max(0, (line - rearX) * dir); }
    this.anchor = Math.max(T.WORLD.MIN + 60, Math.min(T.WORLD.MAX - 60, this.anchor));
  }
  depth(){ let d = 0; for (const r of BAND_ORDER){ const c = this.cols(r); if (c) d = this.bandStart(r) + (c - 1) * T.COL[r]; } return d; }
  describe(){ const o = {}; for (const r of BAND_ORDER) o[r] = { slots: this.slots[r].length, occupied: this.slots[r].filter(s => s.occ).length, cols: this.cols(r), start: this.bandStart(r) }; return { anchor: +this.anchor.toFixed(1), mode: this.mode, bands: o, reassign: this.reassign, reshapes: this.reshapes }; }
}

window.KW_FOUNDATION = Object.freeze({ T, ROLES, World, FormationController, deriveRole, rng, SPAWN });
})();
