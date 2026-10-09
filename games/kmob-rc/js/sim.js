/* KMOB simulation — headless, deterministic for a given seed + input stream.
   Systems: FriendlyArmy/ArmySpawner (deploy), EnemyDirector, CombatSystem (grid + projectiles), CurrencySystem,
   RunUpgradeSystem, Towers, Launcher. Renderer/audio/UI only read state and listen to events. */
(function (G) {
  const KM = G.KM, W = KM.W;
  const CAP = 4096, PCAP = 900, CCAP = 900;
  const GX0 = -12, GCS = 2, GCOLS = 12, GROWS = 56; // grid: x in [-12,12], z in [front-90, front+22]
  const DEAD = 0, ALIVE = 1, DYING = 2;
  const BASE_TANK_RANGE = KM.baseStats().tankRange, MANUAL_HOLD = 1.5, AUTO_SPD = 10;   // cannon range scale reference · AUTO aim waits MANUAL_HOLD s after the player steers · AUTO slides the tank at AUTO_SPD m/s
  const TANK_PAD = 0.12;    // an enemy strikes the tank when its body is within weapon range + this of the hull surface
  const BESIDE = 0.05;      // an enemy deeper than this past the hull front plane stands beside the hull (Float32 slack for front-face attackers)

  class Sim {
    constructor(opts) { this.opts = opts || {}; this.listeners = []; this.alloc(); this.reset(this.opts); }
    on(fn) { this.listeners.push(fn); }
    emit(type, a, b, c, d, e) { for (const f of this.listeners) f(type, a, b, c, d, e); }

    alloc() {
      const f = n => new Float32Array(n), i = n => new Int32Array(n), u = n => new Uint8Array(n);
      Object.assign(this, {
        x: f(CAP), z: f(CAP), vx: f(CAP), vz: f(CAP), hp: f(CAP), mhp: f(CAP), dmg: f(CAP), cd: f(CAP), at: f(CAP), spd: f(CAP),
        rng_: f(CAP), arm: f(CAP), rad: f(CAP), sc: f(CAP), phase: f(CAP), swing: f(CAP), flash: f(CAP), die: f(CAP), slow: f(CAP),
        yaw: f(CAP), think: f(CAP), birth: f(CAP), stride: f(CAP), team: u(CAP), kind: u(CAP), st: u(CAP), era: u(CAP), elite: u(CAP),
        tgt: i(CAP), eng: u(CAP), next: i(CAP), freeL: i(CAP), carry: f(CAP), ctg: i(CAP), repairing: u(CAP), mt: f(CAP), mph: u(CAP), em: u(CAP), br: u(CAP), wv: i(CAP), pt: u(CAP), evo: u(CAP), merc: f(CAP), grp: i(CAP), gox: f(CAP), goz: f(CAP), spear: u(CAP), ft: f(CAP), frank: u(CAP), fcol: i(CAP), role: u(CAP), roleT: f(CAP), atkN: u(CAP), swd: f(CAP), pend: i(CAP), pcrit: u(CAP), pdmg: f(CAP),
        gh: i(GCOLS * GROWS * 2),
        p: { x: f(PCAP), z: f(PCAP), sx: f(PCAP), sz: f(PCAP), ex: f(PCAP), ez: f(PCAP), t: f(PCAP), tof: f(PCAP), dmg: f(PCAP), spl: f(PCAP), slow: f(PCAP), h: f(PCAP), team: u(PCAP), kind: u(PCAP), on: u(PCAP), tgt: i(PCAP), crit: u(PCAP), src: u(PCAP), pen: u(PCAP), lane: u(PCAP) },
        c: { x: f(CCAP), z: f(CCAP), v: f(CCAP), age: f(CCAP), st: u(CCAP), y: f(CCAP), vy: f(CCAP), dx: f(CCAP), dz: f(CCAP) },
      });
    }

    reset(opts) {
      this.gh.fill(-1);   // empty spatial grid until the first step (a kill before it must not walk stale links)
      opts = opts || {};
      this.seed = (opts.seed != null ? opts.seed : (Date.now() & 0x7fffffff)) >>> 0;
      this.rng = KM.rng(this.seed);
      this.pboost = {}; this.equipped = (opts.equip && opts.equip.length ? opts.equip : KM.POWER_IDS.slice(0, 3)).slice(0, 3); this.powerLv = opts.powerLv || {}; this.skins = opts.skins || {};
      this.st.fill(DEAD); this.p.on.fill(0); this.c.st.fill(0);
      for (let k = 0; k < CAP; k++) this.freeL[k] = CAP - 1 - k;
      this.nfree = CAP; this.hi = 0; this.count = [0, 0]; this.dying = 0;
      this.pfree = 0; this.cfree = 0;
      this.t = 0; this.front = 0; this.alive = true; this.deathReason = ''; this.ended = false;
      this.stats = KM.applySkins(KM.baseStats(), this.skins);
      this.L = { x: 0, z: 2, tx: 0, hp: this.stats.maxHp, hitT: 9, inv: 0, vx: 0, fire: 0, wheel: 0, cd: 0.6, mcd: 2, aim: Math.PI, gun: 0, sh: 0, shMax: 0, shDown: 0, shHit: 9, man: 0, atg: -1, atT: 0 };   // man: manual-steering hold (s) · atg/atT: AUTO lane target + re-aim timer (none saved)
      this.posture = 0; this.postureT = 0; this.src = 0; this.dmgBy = [0, 0, 0, 0]; this.shAbsorbed = 0; this.colCoins = 0; this.colLost = 0; this.nCol = 0; this.colT = 0; this.colList = []; this.prod = 'melee'; this.auto = true; this.sector = null; this.seenSector = {}; this.bossN = 0; this.wave = 0; this.wState = 0; this.wGap = 3; this.wQueue = []; this.waveLeft = 0; this.waveSpawned = 0; this.waveStart = 0; this.energy = 0; this.choice = null; this.bossesKilled = 0; this.warTokens = 0; this.pcd = {}; this.storm = null; this.fortT = 0; this.mercs = 0; this.nKind = new Int32Array(64); this.prodNext = null; this.healed = 0; this.repaired = 0; this.repairOn = 0; this.nRepair = 0;
      this.deployAcc = 0; this.budget = 3; this.overflow = 0; this.formT = 0.6; this.warn = null;
      this.coins = KM.START_BANK; this.coinsTotal = 0; this.kills = 0; this.peakArmy = 0; this.upgrades = 0; this.ups = null; this.upT = 0; this.groups = []; this.pts = 0; this.emergency = 0; this.nBoss = 0; this.bossI = -1; this.charge = { collector: 0, range: 0, melee: 0, elite: 0, giant: 0 }; this.posture = 1; this.breaches = 0; this.rowLoss = [0, 0, 0, 0]; this.fillN = 0; this.fillSum = 0;
      this.towers = [null, null, null, null];
      this.form = null; this.guardN = 0; this.gOn = 0; this.gDrop();   // DEFEND formation + tank guard state starts fresh (main.js reuses one Sim after the attract run)
      this.spawnCounter = 0; this.lastHit = 99; this.danger = 0; this.killsByKind = {};
      this.debugLog = []; this.diff = KM.difficulty(0);
    }

    get distance() { return -this.front; }
    get level() { return Math.min(5, 1 + Math.floor(this.upgrades / 4)); }
    heal(n) { this.L.hp = Math.min(this.stats.maxHp, this.L.hp + n); }

    // ---------- input ----------
    moveBy(dx) { this.L.tx = Math.max(-W.LANE + 1, Math.min(W.LANE - 1, this.L.tx + dx)); this.L.man = MANUAL_HOLD; }   // the command vehicle slides left/right along the rear lane only
    moveTo(x) { this.L.tx = Math.max(-W.LANE + 1, Math.min(W.LANE - 1, x)); this.L.man = MANUAL_HOLD; }                  // (any steering input pauses AUTO aim for MANUAL_HOLD s)
    holdManual() { this.L.man = MANUAL_HOLD; }   // the player's finger is still on a slide: AUTO aim keeps waiting even while it does not move

    // ---------- army posture (the only control besides movement + upgrade cards) ----------
    setPosture(p) { p = p ? 1 : 0; if (p === this.posture) return; this.posture = p; this.postureT = 0; for (let i = 0; i < this.hi; i++) if (this.st[i] === ALIVE && !this.team[i]) { this.think[i] = Math.min(this.think[i], 0.05 + (i % 7) * 0.04); if (p) this.tgt[i] = -1; } this.emit('posture', p); }
    togglePosture() { this.setPosture(this.posture ? 0 : 1); }
    // ---------- production: what the command vehicle deploys ----------
    setProd(m) { if (!KM.PROD[m] || m === this.prod) return; this.prod = m; this.emit('prod', m); }   // one selected type; AUTO never picks another
    typeOf(i) { const k = this.kind[i]; return k === 33 ? 'range' : k === 34 ? 'elite' : k === 37 ? 'giant' : k === 35 ? 'collector' : k === 36 ? 'mizard' : 'melee'; }
    setCharge(type, on) { if (!(type in this.charge)) return; on = on ? 1 : 0; if (this.charge[type] === on) return; this.charge[type] = on; this.emit('charge', type, on); }   // DEFEND: this class leaves the formation and attacks; the others keep their orders
    attacking(type) { return this.posture === 0 || !!this.charge[type]; }
    // tap ATTACK / DEFEND: the selected class only. From ALL ATTACK, recalling one class keeps every other class attacking.
    orderClass(type, on) { if (!(type in this.charge)) return false; on = on ? 1 : 0; if (this.attacking(type) === !!on) return false;
      if (this.posture === 0) { for (const k in this.charge) this.charge[k] = k === type ? 0 : 1; this.setPosture(1); this.emit('charge', type, 0); return true; }
      this.setCharge(type, on); return true; }
    // hold: the whole army (Looters included)
    allAttack() { for (const k in this.charge) this.charge[k] = 0; this.setPosture(0); this.emit('allOrder', 0); }
    allDefend() { for (const k in this.charge) this.charge[k] = 0; this.setPosture(1); this.emit('allOrder', 1); }
    setAuto(on) { on = !!on; if (on === this.auto) return; this.auto = on; this.emit('auto', on); }
    prodCost() { return KM.PROD[this.prod].cost; }
    clsLv(key) { return this.stats.cls[key]; }
    evolved(key) { return this.stats.cls[key] >= KM.EVOLVE_AT; }
    prodPts() { return KM.unitPts(this.prod, this.evolved(this.prod)); }
    canDeploy() { return this.alive && this.pts + this.prodPts() <= this.stats.cap && this.coins >= this.prodCost(); }
    // one soldier of the selected class at that class's level, paid in Gold; false when the 300 army points are used or Gold is short
    makeSoldier(key, x, z, birth) {
      const P = KM.PROD[key], S = this.stats, def = KM.FRIEND_BY[P.kind], lv = S.cls[key], M = this.clsM(key, lv), ev = lv >= KM.EVOLVE_AT;
      const j = this.spawn(0, def, x, z, { hp: S.hp * M.hp * (ev ? 1.25 : 1), dmg: S.dmg, arm: M.arm, spd: def.col ? S.colSpeed : S.speed / 4, birth });
      if (j < 0) return -1; this.pt[j] = KM.unitPts(key, ev); this.pts += this.pt[j]; this.nKind[def.id - 32]++;
      if (ev) { this.evo[j] = 1; this.rad[j] *= 1.2; }   // evolved: stronger and costs 2 points, but the model never changes with level
      return j;
    }
    deployOne(how) {
      if (!this.canDeploy()) return false; const P = KM.PROD[this.prod], S = this.stats, L = this.L, def = KM.FRIEND_BY[P.kind];
      const j = this.makeSoldier(this.prod, L.x + (this.rng() - 0.5) * 0.6, L.z - 1.4, 0.0001);
      if (j < 0) return false; this.coins -= P.cost; this.spawnCounter++;
      this.vz[j] = -S.speed * 1.6; this.vx[j] = (this.rng() - 0.5) * 3; L.fire = 1; this.emit('deploy', j, how || 'auto'); if (def.col) this.emit('collector', j); return true;
    }

    // ---------- force field (rides on the command tank: capacity → collapse → recharge) ----------
    shieldMax() { const n = this.stats.shield; return n ? (60 + 45 * (n - 1)) * (this.stats.shieldMul || 1) : 0; }
    shieldUp() { const L = this.L, m = this.shieldMax(); L.sh = L.shDown > 0 ? L.sh : Math.min(m, L.sh + m * 0.5); L.shMax = m; if (L.shDown <= 0 && L.sh <= 0) L.sh = m; }
    absorb(a) {
      const L = this.L; if (!this.stats.shield || L.shDown > 0 || L.sh <= 0) return a;
      const take = Math.min(a, L.sh); L.sh -= take; this.shAbsorbed += take; L.shHit = 0;
      if (L.sh <= 0.01) { L.sh = 0; L.shDown = 7 / this.stats.shRecharge; this.emit('shieldBreak'); }
      return a - take;
    }
    stepShield(dt) {
      const L = this.L, S = this.stats; if (!S.shield) return; L.shMax = this.shieldMax(); L.shHit += dt;
      if (L.shDown > 0) { L.shDown -= dt; if (L.shDown <= 0) { L.shDown = 0; L.sh = L.shMax * 0.3; this.emit('shieldUp'); } }
      else if (L.shHit > S.shDelay) L.sh = Math.min(L.shMax, L.sh + L.shMax * 0.12 * S.shRecharge * dt);
    }
    inShield(x, z, pad) { const S = this.stats; if (!S.shield || this.L.shDown > 0 || this.L.sh <= 0) return false; const r = S.shRadius + (pad || 0); return this.lDist(x, z) < r; }

    // ---------- command tank: automatic fire (cannon + missile pod) ----------
    nearestXZ(x, z, team, R) {
      let best = -1, bd = R * R; const c0 = this.cellX(x - R), c1 = this.cellX(x + R), r0 = this.cellZ(z - R), r1 = this.cellZ(z + R);
      for (let gz = r0; gz <= r1; gz++) for (let gx = c0; gx <= c1; gx++) for (let j = this.gh[(gz * GCOLS + gx) * 2 + team]; j >= 0; j = this.next[j]) {
        if (this.st[j] !== ALIVE) continue; const dx = this.x[j] - x, dz = this.z[j] - z, dd = dx * dx + dz * dz; if (dd < bd) { bd = dd; best = j; } }
      return best;
    }
    // Cannon range: a fixed world distance from the tank, W.TANK_RANGE (about two-thirds of the tank-to-spawn depth). Only the
    // existing explicit range rules scale it, both through stats.tankRange: TARGETING SYSTEM cards and the Midnight skin. Tank
    // level, eras and every other tank upgrade leave it unchanged; it never depends on where the enemies are.
    cannonRange() { return W.TANK_RANGE * (this.stats.tankRange / BASE_TANK_RANGE); }
    stepTank(dt, S) {
      const L = this.L; L.cd -= dt * S.tankRate; L.mcd -= dt; L.gun = Math.max(0, L.gun - dt * 4);
      if (L.cd <= 0) {
        // The cannon never waits for a target: on its normal cadence it fires straight ahead (-z) down the tank's current lane
        // to its fixed range, in AUTO and TAP alike (no acquisition, no lead, no homing). Lining the lane up is the steering's
        // job. MULTISHOT adds parallel shells 0.9 m apart, alternating sides, kept inside the lane.
        L.cd = 1; L.aim = Math.PI; L.gun = 1;
        const E = KM.TANK_ERAS[this.tankEra = KM.tankEra(S, this.t)], n = S.tankMulti || 1, z0 = L.z - W.HULL_HL, z1 = L.z - this.cannonRange();
        for (let k = 0; k < n; k++) { const x = Math.max(-W.LANE, Math.min(W.LANE, L.x + (k ? (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.9 : 0)));
          this.laneShot(x, z0, z1, S.tankDmg * E.dmg, E.proj, S.tankSplash, E.speed, S.tankPen || 0); }
        this.emit('tankfire', -1, n);
      }
      if (S.missiles > 0 && L.mcd <= 0) {
        L.mcd = 3.2; const R = S.tankRange * 1.4, list = [];
        for (let i = 0; i < this.hi; i++) { if (this.st[i] !== ALIVE || this.team[i] !== 1) continue; const dx = this.x[i] - L.x, dz = this.z[i] - L.z; if (dx * dx + dz * dz < R * R) list.push(i); }
        list.sort((a, b) => this.hp[b] - this.hp[a]);
        for (let k = 0; k < Math.min(S.missiles, list.length); k++) { const tg = list[k]; this.fire(0, L.x + (k % 2 ? 0.6 : -0.6), L.z + 0.3, tg, this.x[tg], this.z[tg], S.tankDmg * 1.6, 21, 1.4, 0, 15, false, 2); }
        if (list.length) this.emit('missiles', Math.min(S.missiles, list.length));
      }
    }
    // One cannon shell flying straight down -z at x, from the muzzle (z0) to the end of the range (z1). It is a lane shell: it
    // strikes the first enemy in its lane on the way (stepProjectiles) and is flat, so it never lobs over what it hits.
    laneShot(x, z0, z1, dmg, kind, spl, speed, pen) {
      this.laneOn = 1; this.lanePen = pen; this.fire(0, x, z0, -1, x, z1, dmg, kind, spl, 0, speed, false, 2); this.laneOn = 0;
      const k = this.lastShot; if (k < PCAP) { const P = this.p; P.lane[k] = 1; P.pen[k] = pen; P.h[k] = 0.3; }
    }
    // AUTO aim (TAP never steers on its own): once the player has not steered for MANUAL_HOLD s, slide the tank under the
    // toughest threat its cannon can strike (the old auto-aim score: hp × 3 for elites − 3 × distance) among the enemies
    // between the end of the cannon range and the tank's rear plane. Enemies no shell can reach from where the tank may
    // go (laneFor) are skipped. The current pick is kept unless another is clearly better, and the tank only re-aims when
    // its lane is more than 0.6 m off. AUTO never drives the hull into an enemy beside it (slideRange): every step it is
    // moving, its slide stops where the hull meets the nearest one on that side. Deterministic, no RNG.
    autoSteer(dt) {
      const L = this.L, tick = (L.atT -= dt) <= 0; if (!tick && Math.abs(L.tx - L.x) < 1e-4) return;
      const R = this.slideRange();
      if (tick) { L.atT = 0.1;
        const zr = L.z - this.cannonRange(), P = L.z + W.REAR_DZ, n = this.stats.tankMulti || 1;
        let tg = -1, bs = -Infinity, bx = 0, cur = -Infinity, cx = 0;
        for (let i = 0; i < this.hi; i++) { if (this.st[i] !== ALIVE || this.team[i] !== 1) continue; const z = this.z[i];
          if (z + this.ft[i] < zr || z > P) continue;
          const dx = this.x[i] - L.x, dz = z - L.z, sc = this.hp[i] * (this.elite[i] ? 3 : 1) - Math.sqrt(dx * dx + dz * dz) * 3;
          if (sc <= bs && i !== L.atg) continue;
          const x = this.laneFor(i, n, R); if (x !== x) continue;   // NaN: no reachable tank position puts a shell on it
          if (sc > bs) { bs = sc; tg = i; bx = x; } if (i === L.atg) { cur = sc; cx = x; } }
        if (cur > -Infinity && cur >= bs - Math.abs(bs) * 0.1 - 4) { tg = L.atg; bx = cx; }   // hysteresis on the pick: no flicker between near-equal threats
        L.atg = tg;
        if (tg >= 0) {   // re-aim when the current lane misses the target; the 0.6 m deadband only stops creep on a target already covered
          const w = W.TANK_LANE + this.ft[tg] - 0.05, at = Math.max(R[0], Math.min(R[1], L.tx)); let cov = false;
          for (let k = 0; k < n && !cov; k++) { const o = k ? (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.9 : 0; cov = Math.abs(Math.max(-W.LANE, Math.min(W.LANE, at + o)) - this.x[tg]) < w; }
          if (!cov || Math.abs(bx - L.tx) > 0.6) L.tx = bx; } }
      L.tx = Math.max(R[0], Math.min(R[1], L.tx));
    }
    // How far AUTO may slide the tank, [lo, hi] (reused): up to the point where the hull touches the nearest enemy beside it
    // on each side (deeper than BESIDE past the hull front plane). Driving into one would shove it sideways down the lane
    // (the minimal hull push-out). Enemies in front of the hull face do not limit it: the face slides under them. The range
    // always contains the tank's own x, so it only ever stops a slide, never starts one.
    slideRange() {
      const L = this.L, R = this.tR || (this.tR = [0, 0]); let lo = -Infinity, hi = Infinity;
      for (let i = 0; i < this.hi; i++) { if (this.st[i] !== ALIVE || this.team[i] !== 1) continue; const f = this.ft[i], x = this.x[i];
        if (this.z[i] <= L.z - W.HULL_HL - f + BESIDE) continue;
        if (x < L.x) lo = Math.max(lo, x + W.HULL_HW + f); else hi = Math.min(hi, x - W.HULL_HW - f); }
      R[0] = Math.min(lo, L.x); R[1] = Math.max(hi, L.x); return R;
    }
    // Where AUTO puts the tank to strike enemy i with one of its n parallel shells: the tank x (inside ±(LANE − 1) and the
    // slide range R) nearest its current lane, or NaN if there is none (e.g. a small enemy hugging the lane edge, or one
    // past an enemy beside the hull). An enemy beside the hull bounds R itself, so no centre-shell lane reaches it: it
    // counts only while a MULTISHOT side shell covers it from within R.
    laneFor(i, n, R) {
      const L = this.L, x = this.x[i], w = W.TANK_LANE + this.ft[i] - 0.05, lim = W.LANE - 1;
      const lo = Math.max(-lim, R[0]), hi = Math.min(lim, R[1]);
      let best = NaN, bd = Infinity;
      for (let k = 0; k < n; k++) { const o = k ? (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.9 : 0, tx = Math.max(lo, Math.min(hi, x - o));
        if (Math.abs(Math.max(-W.LANE, Math.min(W.LANE, tx + o)) - x) >= w) continue;
        const d = Math.abs(tx - L.tx); if (d < bd) { bd = d; best = tx; } }
      return best;
    }

    // ---------- units ----------
    spawn(team, def, x, z, mul) {
      if (!this.nfree) return -1;
      const i = this.freeL[--this.nfree]; if (i >= this.hi) this.hi = i + 1;
      const r = this.rng; mul = mul || {};
      this.st[i] = ALIVE; this.team[i] = team; this.kind[i] = def.id;
      this.x[i] = x; this.z[i] = z; this.vx[i] = 0; this.vz[i] = 0;
      const hp = def.hp * (mul.hp || 1); this.hp[i] = this.mhp[i] = hp;
      this.dmg[i] = def.dmg * (mul.dmg || 1); this.cd[i] = def.cd; this.at[i] = r() * def.cd; this.spd[i] = (def.spd || 4) * (mul.spd || 1) * (0.92 + r() * 0.16);
      this.eng[i] = team === 1 && (def.boss || def.mini) ? 1 : 0;   // bosses / minis: 1 = still marching in, 2 = engaged (held on the battlefield)
      this.rng_[i] = def.rng; this.arm[i] = (def.arm || 0) + (mul.arm || 0); this.rad[i] = def.rad; this.sc[i] = def.sc * (0.95 + r() * 0.1); this.ft[i] = KM.footOf(def, this.rad[i], this.sc[i]);
      this.phase[i] = r() * 6.283; this.stride[i] = 0.9 + r() * 0.2; this.swing[i] = 0; this.pend[i] = -1; this.swd[i] = def.el || def.sc >= 1.3 || def.wpn === 'axe' ? 0.75 : def.wpn === 'staff' || def.wpn === 'cannon' ? 0.6 : 0.4; this.flash[i] = 0; this.die[i] = 0; this.slow[i] = 0;
      this.carry[i] = 0; this.ctg[i] = -1; this.mt[i] = def.mech ? 4 + r() * 2 : def.med ? 6 + r() * 4 : 0; this.mph[i] = 0; this.em[i] = 0; this.br[i] = 0; this.wv[i] = 0; this.grp[i] = -1; this.pt[i] = 0; this.evo[i] = 0; this.merc[i] = 0; this.spear[i] = def.k === 'soldier' ? 1 : 0; this.frank[i] = 0; this.fcol[i] = -1;   // melee: one opening spear per deployment
      this.yaw[i] = team ? 0 : Math.PI; this.think[i] = r() * 0.2; this.birth[i] = mul.birth || 0; this.tgt[i] = -1; this.era[i] = mul.era || 0; this.elite[i] = def.el ? 1 : 0;
      // melee role: 0 front · 1 pressure (fills openings) · 2 breakthrough (fast/heavy) · 3 rear (ranged/support)
      const rr = r(); this.roleT[i] = 0;
      this.role[i] = def.col ? 4 : def.med ? 5 : def.rng > 2 || def.he ? 3 : team ? (def.k === 'brute' || def.k === 'warlord' ? 2 : def.k === 'runner' ? (rr < 0.6 ? 2 : 1) : def.k === 'knight' ? (rr < 0.4 ? 2 : 0) : def.k === 'imp' ? (rr < 0.3 ? 2 : 1) : rr < 0.35 ? 1 : 0)
        : (def.k === 'knightF' || def.big ? 2 : rr < 0.12 ? 2 : rr < 0.47 ? 1 : 0);
      if (team === 1) this.rearClamp(i);   // summons, waves and staged spawns never appear behind or inside the tank
      this.count[team]++; if (team === 1 && def.boss) { this.nBoss++; this.bossI = i; if (this.nBoss === 1) this.emit('bossFight', 1); }
      return i;
    }
    free(i) { this.st[i] = DEAD; this.freeL[this.nfree++] = i; }
    def(i) { const k = this.kind[i]; return k >= 32 ? KM.FRIEND[k - 32] : KM.ENEMY[k]; }

    kill(i, silent) {
      if (this.st[i] !== ALIVE) return;
      this.st[i] = DYING; this.die[i] = 0; this.count[this.team[i]]--; this.pts -= this.pt[i]; this.pt[i] = 0; this.dying++; if (!this.team[i]) this.nKind[this.kind[i] - 32]--;
      if (!silent) this.openSpace(i);
      if (this.team[i] === 1) {
        const d = KM.ENEMY[this.kind[i]]; if (this.wv[i] && this.wv[i] === this.wave) this.waveLeft--; if (!silent) this.gainEnergy(0.35);
        if (d.boss) { if (!silent) this.bossDown(d); if (--this.nBoss <= 0) { this.nBoss = 0; this.bossI = -1; this.emit('bossFight', 0); } } if (this.grp[i] >= 0) { const g = this.groups[this.grp[i]]; if (g) g.alive--; this.grp[i] = -1; }
        if (!silent) {
          this.kills++; this.killsByKind[d.k] = (this.killsByKind[d.k] || 0) + 1;
          let val = d.coin * this.diff.coinMul * KM.COIN_SCALE;
          const bounty = val * KM.BOUNTY; this.coins += bounty; this.coinsTotal += bounty; val -= bounty;   // war bounty goes straight to the bank; the rest drops for the tank/collectors
          if (val < 1) { if (this.rng() < val) val = 1; else val = 0; }
          const n = Math.min(8, Math.max(1, Math.round(Math.sqrt(val))));
          for (let k = 0; k < n && val > 0; k++) this.dropCoin(this.x[i], this.z[i], val / n);
          this.emit('kill', i, d);
        }
        if (d.ex && !silent) this.explode(i, d);
      } else { if (this.posture === 1 && this.frank[i] >= 1) this.rowLoss[Math.min(3, this.frank[i] - 1)]++;
        if (this.carry[i] > 0 && !silent) { const c = this.carry[i], keep = c * 0.5; this.colLost += c - keep; this.dropCoin(this.x[i], this.z[i], keep); this.emit('colLost', i, c); } this.carry[i] = 0; this.emit('fdie', i); }
    }

    // A death opens space: neighbours re-pick targets at once and the victors step into the gap.
    openSpace(i) {
      const x = this.x[i], z = this.z[i], dead = this.team[i], R = 2.6, c0 = this.cellX(x - R), c1 = this.cellX(x + R), r0 = this.cellZ(z - R), r1 = this.cellZ(z + R);
      for (let gz = r0; gz <= r1; gz++) for (let gx = c0; gx <= c1; gx++) for (let t = 0; t < 2; t++) for (let j = this.gh[(gz * GCOLS + gx) * 2 + t]; j >= 0; j = this.next[j]) {
        if (this.st[j] !== ALIVE || j === i) continue; const dx = x - this.x[j], dz = z - this.z[j], d = Math.sqrt(dx * dx + dz * dz); if (d > R || d < 1e-3) continue;
        this.think[j] = Math.min(this.think[j], 0.05 * (1 + (j % 3)));
        if (t !== dead) { const k = 1.6 * (1 - d / R); this.vx[j] += dx / d * k; this.vz[j] += dz / d * k; }      // surge into the gap
      }
    }
    // Heavy blows (brutes, warlord, knights, heavy friendlies) shove a small group back and open a pocket.
    shockwave(i, x, z, r, power) {
      const ot = 1 - this.team[i], c0 = this.cellX(x - r), c1 = this.cellX(x + r), r0 = this.cellZ(z - r), r1 = this.cellZ(z + r); let n = 0;
      for (let gz = r0; gz <= r1; gz++) for (let gx = c0; gx <= c1; gx++) for (let j = this.gh[(gz * GCOLS + gx) * 2 + ot]; j >= 0; j = this.next[j]) {
        if (this.st[j] !== ALIVE) continue; const dx = this.x[j] - this.x[i], dz = this.z[j] - this.z[i], d = Math.sqrt(dx * dx + dz * dz) || 0.01; if (d > r + this.rad[i]) continue;
        const k = power * (1 - Math.min(1, d / (r + this.rad[i]))) * (0.6 / Math.max(0.6, this.rad[j] * 1.7)); this.vx[j] += dx / d * k; this.vz[j] += dz / d * k; this.flash[j] = Math.max(this.flash[j], 0.6); this.think[j] = 0.25; n++;
      }
      if (n) this.emit('shove', i, n, x, z, r);
    }
    explode(i, d) {
      const x = this.x[i], z = this.z[i];
      this.area(0, x, z, d.ex, this.dmg[i], 0, -1);
      if (this.lDist(x, z) < d.ex + 1) this.hurtLauncher(this.dmg[i] * 0.6, 'bomber');
      this.emit('boom', x, z, d.ex);
    }

    hurt(i, amt, fromTeam, srcZ, crit) {
      if (this.st[i] !== ALIVE) return;
      let a = this.arm[i];
      if (this.team[i] === 0) a += this.stats.armor;
      let dmg = amt * (12 / (12 + a)); if (this.team[i] === 0 && this.fortT > 0) dmg *= 0.7;
      const d = this.def(i);
      if (this.team[i] === 0 && this.posture === 1 && srcZ < this.z[i]) { const n = this.shieldWall(i); if (n) dmg *= n === 2 ? 0.65 : 0.78; }   // overlapping shields
      if (this.team[i] === 0 && this.stats.shield >= 5 && this.inShield(this.x[i], this.z[i])) dmg = dmg * 0.6 + this.absorb(dmg * 0.4);   // projected field covers the front ranks
      if (d.sh && this.team[i] === 1 && srcZ > this.z[i]) dmg *= 0.55;     // enemy shields face the player
      if (d.sh && this.team[i] === 0 && srcZ < this.z[i]) dmg *= 0.6;
      if (fromTeam === 0 && d.armR && this.src === 1) dmg *= d.armR;                                // ARMORED GIANT: shrugs off ordinary ranged fire
      if (fromTeam === 0) this.dmgBy[this.src] += Math.min(dmg, Math.max(0, this.hp[i]));
      this.hp[i] -= dmg; this.flash[i] = 1;
      // small knockback along the attack axis keeps the front line pushing like a mass
      const kb = Math.min(1.2, dmg / this.mhp[i] * 3) * (crit ? 2 : 1);
      this.vz[i] += (this.team[i] ? -1 : 1) * kb * 2;
      if (crit) this.emit('crit', i);
      if (this.hp[i] <= 0) this.kill(i);
    }

    area(team, x, z, r, dmg, slow, srcZ) {
      // damage units of `team` within r of (x,z) via the grid
      const r2 = r * r, c0 = this.cellX(x - r), c1 = this.cellX(x + r), r0 = this.cellZ(z - r), r1 = this.cellZ(z + r);
      let n = 0;
      for (let gz = r0; gz <= r1; gz++) for (let gx = c0; gx <= c1; gx++) {
        for (let j = this.gh[(gz * GCOLS + gx) * 2 + team]; j >= 0; j = this.next[j]) {
          if (this.st[j] !== ALIVE) continue;
          const dx = this.x[j] - x, dz = this.z[j] - z, dd = dx * dx + dz * dz;
          if (dd > r2) continue;
          const fall = 1 - 0.5 * Math.sqrt(dd) / r;
          if (slow) this.slow[j] = Math.max(this.slow[j], slow);
          if (dmg > 0) this.hurt(j, dmg * fall, 1 - team, srcZ != null && srcZ >= 0 ? srcZ : z, false);
          n++;
        }
      }
      return n;
    }

    // ---------- tank energy + powers ----------
    gainEnergy(e) { this.energy = Math.min(KM.ENERGY_MAX, this.energy + e); }
    powerMul(id) { return (1 + 0.1 * (this.powerLv[id] || 0)) * (1 + 0.12 * (this.pboost[id] || 0)); }   // permanent level × this run's boss boosts
    canPower(id) { const P = KM.POWERS[id]; return !!P && this.alive && this.equipped.includes(id) && this.energy >= P.cost && !((this.pcd[id] || 0) > 0); }
    usePower(id) {
      if (!this.canPower(id)) return false; const P = KM.POWERS[id], S = this.stats, L = this.L, mul = this.powerMul(id); this.energy -= P.cost; this.pcd[id] = P.cd; this.powersUsed = (this.powersUsed || 0) + 1;
      if (id === 'linebreaker') { const dmg = S.tankDmg * 9 * mul; let n = 0; this.src = 2;   // straight down the tank's lane
        for (let i = 0; i < this.hi; i++) if (this.st[i] === ALIVE && this.team[i] === 1 && Math.abs(this.x[i] - L.x) < 1.9 + this.rad[i] && this.z[i] < L.z + 0.5 && this.z[i] > L.z - 48) { this.hurt(i, dmg, 0, L.z, false); this.z[i] -= 0.6; n++; }
        this.emit('power', id, { x: L.x, z0: L.z, z1: L.z - 48, n }); }
      else if (id === 'arrowstorm') { let bx = 0, bz = this.front - 12, best = -1; for (let k = 0; k < 40; k++) { const i = Math.floor(this.rng() * this.hi); if (this.st[i] !== ALIVE || this.team[i] !== 1) continue; let c = 0; for (let j = 0; j < this.hi; j += 3) if (this.st[j] === ALIVE && this.team[j] === 1 && Math.abs(this.x[j] - this.x[i]) < 5 && Math.abs(this.z[j] - this.z[i]) < 5) c++; if (c > best) { best = c; bx = this.x[i]; bz = this.z[i]; } }
        this.storm = { x: bx, z: bz, n: 3 + (this.pboost[id] || 0) + Math.floor((this.powerLv[id] || 0) / 2), t: 0, dmg: S.dmg * 3 * (1 + 0.1 * (this.powerLv[id] || 0)) }; this.emit('power', id, { x: bx, z: bz }); }
      else if (id === 'elemental') { const dmg = S.tankDmg * 2.2 * mul, z0 = (this.form && this.form.on ? this.form.frontZ : this.armyZ || L.z - 10); this.src = 2;
        for (let i = 0; i < this.hi; i++) if (this.st[i] === ALIVE && this.team[i] === 1 && this.z[i] > z0 - 14 && this.z[i] < L.z + 0.5) { this.hurt(i, dmg, 0, z0, false); this.slow[i] = Math.max(this.slow[i], 2.2); }
        this.emit('power', id, { z: z0 - 7 }); }
      else if (id === 'mercenary') { const n = Math.min(100, 50 + 10 * (this.pboost[id] || 0) + 5 * (this.powerLv[id] || 0)); let k = 0;
        for (; k < n; k++) { const j = this.makeSoldier('melee', Math.max(-W.LANE + 1, Math.min(W.LANE - 1, L.x + (this.rng() - 0.5) * 10)), L.z - 1.5 - this.rng() * 3, 0.0001); if (j < 0) break; this.pts -= this.pt[j]; this.pt[j] = 0; this.merc[j] = this.t + 30; }   // beyond the 300 points, for 30 s
        this.mercs = k; this.emit('power', id, { n: k }); }
      else if (id === 'fortress') { const m = this.shieldMax(); if (m) { L.shMax = m; L.sh = m * Math.min(1.5, mul); L.shDown = 0; } this.heal(S.maxHp * 0.3 * mul); for (const t of this.towers) if (t) { t.down = 0; t.hp = Math.min(t.mhp, t.hp + t.mhp * 0.5); }
        this.fortT = 8 * Math.min(1.6, mul); this.emit('power', id, {}); }
      return true;
    }
    stepPowers(dt) {
      for (const k in this.pcd) if (this.pcd[k] > 0) this.pcd[k] -= dt; if (this.fortT > 0) this.fortT -= dt;
      const st = this.storm; if (st) { st.t -= dt; if (st.t <= 0) { st.t = 0.45; st.n--; this.src = 1; this.area(1, st.x + (this.rng() - 0.5) * 3, st.z + (this.rng() - 0.5) * 3, 6, st.dmg, 0, st.z); this.emit('volley', st.x, st.z); if (st.n <= 0) this.storm = null; } }
      if (this.mercs && (this.stepN || 0) % 20 === 0) { let left = 0; for (let i = 0; i < this.hi; i++) if (this.merc[i] && this.st[i] === ALIVE) { if (this.t > this.merc[i]) this.kill(i, true); else left++; } this.mercs = left; }
    }
    // ---------- launcher ----------
    lDist(x, z) { const dx = x - this.L.x, dz = z - this.L.z; return Math.sqrt(dx * dx + dz * dz); }
    // Hard tank boundary. Rear plane z = L.z + W.REAR_DZ across the whole lane: no enemy's ground footprint (ft) crosses it.
    // The hull (HULL_HW × HULL_HL around the tank centre) is solid: an enemy overlapping it takes the smaller legal way out,
    // sideways off a flank (when that stays inside the lane) or forward off the front face, never toward the rear. It is the
    // last position write of every enemy in stepUnits, and also runs at spawn and on falling corpses, so it holds after
    // every step whatever moved the unit (march, crowding, knockback, charges, the tank sliding into it).
    rearClamp(i) {
      const L = this.L, f = this.ft[i], hw = W.HULL_HW + f, rx = this.x[i] - L.x, zf = L.z - W.HULL_HL - f;
      if (rx < hw && rx > -hw && this.z[i] > zf) {
        const s = rx < 0 ? -1 : 1, nx = L.x + s * hw;
        if (hw - s * rx < this.z[i] - zf && nx >= -W.LANE && nx <= W.LANE) { this.x[i] = nx; if (this.vx[i] * s < 0) this.vx[i] = 0; }
        else { this.z[i] = zf; if (this.vz[i] > 0) this.vz[i] = 0; }
      }
      // Engagement bound: once a boss or mini has come within W.ENGAGE_DZ of the tank, nothing (knockback, shoves, the army
      // pressing in, its own stand-off) takes it farther upfield than that line, so an engaged boss stays on screen and in reach.
      if (this.eng[i]) { const zF = L.z - W.ENGAGE_DZ; if (this.eng[i] === 1) { if (this.z[i] >= zF) this.eng[i] = 2; }
        else if (this.z[i] < zF) { this.z[i] = zF; if (this.vz[i] < 0) this.vz[i] = 0; } }
      const zMax = L.z + W.REAR_DZ - f - 1e-3;   // margin: positions are Float32, the plane is a double
      if (this.z[i] > zMax) { this.z[i] = zMax; if (this.vz[i] > 0) this.vz[i] = 0; }
    }
    // The tank's footprint is solid for the player's own soldiers too: a friendly overlapping the hull (plus its body and a
    // W.FORM_CLEAR margin) leaves it the shorter way, sideways off a flank (inside the lane) or forward off the front face, so
    // the tank never disappears under Range, Mizards, Looters or a repacking army. Last position write of every soldier.
    hullClear(i) {
      const L = this.L, f = this.rad[i] + W.FORM_CLEAR, hw = W.HULL_HW + f, hl = W.HULL_HL + f, rx = this.x[i] - L.x, rz = this.z[i] - L.z;
      if (rx >= hw || rx <= -hw || rz >= hl || rz <= -hl) return;
      const s = rx < 0 ? -1 : 1, nx = L.x + s * hw, side = hw - s * rx, front = rz + hl;
      if (side < front && nx >= -W.LANE && nx <= W.LANE) { this.x[i] = nx; if (this.vx[i] * s < 0) this.vx[i] = 0; }
      else { this.z[i] = L.z - hl; if (this.vz[i] > 0) this.vz[i] = 0; }
    }
    // Enemy i going for the tank: unit vector toward its contact point (tankContact), so attackers spread along the hull
    // front instead of piling into its centre. Within 0.25 m of that point it leans on the hull (steers at the tank centre);
    // the hull clamp turns that into a slide along the face or flank toward the centre, which only shortens the distance.
    tankApproach(i) {
      const L = this.L, C = this.tankContact(i), x = this.x[i], z = this.z[i];
      let dx = C[0] - x, dz = C[1] - z, d = Math.sqrt(dx * dx + dz * dz);
      if (d < 0.25) { dx = L.x - x; dz = L.z - z; d = Math.sqrt(dx * dx + dz * dz) || 1; }
      const A = this.tA || (this.tA = [0, 0]); A[0] = dx / d; A[1] = dz / d; return A;
    }
    // Distance from enemy i's centre to the tank hull rectangle (0 inside it). The tank is struck from its surface: an enemy is
    // in reach when this is below rng + ft + TANK_PAD, so a second rank pressed behind the first still reaches the hull.
    hullDist(i) {
      const L = this.L, ax = Math.max(0, Math.abs(this.x[i] - L.x) - W.HULL_HW), az = Math.max(0, Math.abs(this.z[i] - L.z) - W.HULL_HL);
      return Math.sqrt(ax * ax + az * az) || 0.001;
    }
    // The nearest legal point from which enemy i strikes the tank: on the hull's front face (z = L.z − HULL_HL − ft) or the
    // front half of a flank (x = L.x ± (HULL_HW + ft), not past the rear plane), inside the lane. Every such point touches the
    // hull, so it is inside any enemy's reach. Returns [x, z] (reused).
    tankContact(i) {
      const L = this.L, f = this.ft[i], hw = W.HULL_HW + f, zo = W.HULL_HL + f, rx = this.x[i] - L.x, rz = this.z[i] - L.z;
      let cx = Math.max(-hw, Math.min(hw, rx)), cz = -zo;   // front face (between the tank's x and the enemy's, so inside the lane)
      const fx = rx < 0 ? -hw : hw, zr = W.REAR_DZ - f - 1e-3;
      if (-zo <= zr && Math.abs(L.x + fx) <= W.LANE) { const fz = Math.max(-zo, Math.min(zr, rz));                // its flank, if inside the lane
        if ((fx - rx) * (fx - rx) + (fz - rz) * (fz - rz) < (cx - rx) * (cx - rx) + (cz - rz) * (cz - rz)) { cx = fx; cz = fz; } }
      const C = this.tC || (this.tC = [0, 0]); C[0] = L.x + cx; C[1] = L.z + cz; return C;
    }
    hurtLauncher(a, why) {
      if (!this.alive || this.L.inv > 0) return;
      if (this.fortT > 0) a *= 0.5;   // FORTRESS SURGE hardens the tank
      a = this.absorb(a); if (a <= 0) { this.emit('shieldHit'); return; }
      this.L.hp -= a; this.L.hitT = 0; this.lastHit = 0; this.emit('lhit', a);
      if (this.L.hp <= 0) { this.L.hp = 0; this.alive = false; this.deathReason = why || 'overrun'; this.emit('death', why); }
    }
    revive() { // optional single revive hook (rewarded ad / earned resource later)
      if (this.alive || this.revived) return false;
      this.revived = true; this.alive = true; this.ended = false; this.L.hp = this.stats.maxHp * 0.6; this.L.inv = 4;
      for (let i = 0; i < this.hi; i++) if (this.st[i] === ALIVE && this.team[i] === 1 && this.z[i] > this.front - 18) this.kill(i, true);
      this.emit('revive'); return true;
    }

    // ---------- currency ----------
    dropCoin(x, z, v) {
      const C = this.c; let k = -1;
      for (let n = 0; n < CCAP; n++) { const j = (this.cfree + n) % CCAP; if (!C.st[j]) { k = j; break; } }
      if (k < 0) { // merge into an existing coin rather than lose value
        k = Math.floor(this.rng() * CCAP); C.v[k] += v; return;
      }
      this.cfree = (k + 1) % CCAP;
      const a = this.rng() * 6.283, s = 0.8 + this.rng() * 1.6;
      C.st[k] = 1; C.x[k] = x; C.z[k] = z; C.v[k] = v; C.age[k] = 0; C.y[k] = 0.4; C.vy[k] = 4 + this.rng() * 2; C.dx[k] = Math.cos(a) * s; C.dz[k] = Math.sin(a) * s;
    }

    // ---------- projectiles ----------
    fire(team, sx, sz, tgt, ex, ez, dmg, kind, spl, slow, speed, crit, src) {
      const P = this.p; let k = -1; this.lastShot = PCAP;
      for (let n = 0; n < PCAP; n++) { const j = (this.pfree + n) % PCAP; if (!P.on[j]) { k = j; break; } }
      if (k < 0) { // pool exhausted: resolve instantly so damage is never lost (a cannon lane shell sweeps its whole lane at once)
        this.src = src || 0;
        if (this.laneOn) { const j = this.laneTarget(sx, 1 - team, this.L.z + W.REAR_DZ, ez, this.maxFoot(1 - team)); if (j >= 0) this.laneHit(j, sx, team, dmg, kind, spl, slow, this.lanePen, sz); }
        else if (spl) this.area(1 - team, ex, ez, spl, dmg, slow, sz); else if (tgt >= 0) this.hurt(tgt, dmg, team, sz, crit); else if (tgt === -2) this.hurtLauncher(dmg, 'ranged'); else if (tgt <= -10) this.hurtStruct(tgt, dmg);
        return;
      }
      this.pfree = (k + 1) % PCAP;
      const d = Math.hypot(ex - sx, ez - sz);
      P.on[k] = 1; P.team[k] = team; P.kind[k] = kind; P.sx[k] = P.x[k] = sx; P.sz[k] = P.z[k] = sz; P.ex[k] = ex; P.ez[k] = ez; P.t[k] = 0;
      P.tof[k] = Math.max(0.12, d / speed); P.dmg[k] = dmg; P.spl[k] = spl || 0; P.slow[k] = slow || 0; P.tgt[k] = tgt; P.h[k] = Math.min(4, 0.6 + d * 0.18) * (kind === 12 && team === 0 ? KM.rtech(this.stats).arc : kind >= 10 && kind <= 16 ? KM.RTECH[kind - 10].arc : kind === 20 ? 0.15 : kind === 21 ? 0.9 : kind === 22 ? 0.45 : 1); P.crit[k] = crit ? 1 : 0; P.src[k] = src || 0; P.pen[k] = 0; P.lane[k] = 0; this.lastShot = k;
      this.emit('shot', kind, sx, sz);
    }

    // ---------- grid ----------
    cellX(x) { const c = Math.floor((x - GX0) / GCS); return c < 0 ? 0 : c >= GCOLS ? GCOLS - 1 : c; }
    cellZ(z) { const r = Math.floor((z - (this.front - 90)) / GCS); return r < 0 ? 0 : r >= GROWS ? GROWS - 1 : r; }
    buildGrid() {
      this.gh.fill(-1);
      for (let i = 0; i < this.hi; i++) {
        if (this.st[i] !== ALIVE) continue;
        const c = (this.cellZ(this.z[i]) * GCOLS + this.cellX(this.x[i])) * 2 + this.team[i];
        this.next[i] = this.gh[c]; this.gh[c] = i;
      }
    }
    nearest(i, R) {
      const x = this.x[i], z = this.z[i], ot = 1 - this.team[i];
      let best = -1, bd = R * R;
      const c0 = this.cellX(x - R), c1 = this.cellX(x + R), r0 = this.cellZ(z - R), r1 = this.cellZ(z + R);
      for (let gz = r0; gz <= r1; gz++) for (let gx = c0; gx <= c1; gx++) {
        for (let j = this.gh[(gz * GCOLS + gx) * 2 + ot]; j >= 0; j = this.next[j]) {
          const dx = this.x[j] - x, dz = this.z[j] - z, dd = dx * dx + dz * dz;
          if (dd < bd && this.st[j] === ALIVE) { bd = dd; best = j; }
        }
      }
      return best;
    }
    // ---------- support vehicles as targets ----------
    // Target codes: -2 command vehicle, -(10+slot) support vehicle.
    towerMaxHp(t) { return 140 * (1 + 0.45 * (t.lvl - 1)) * this.stats.towerHp; }
    makeTower(type, lvl, slot) { const t = { type, lvl, cd: 0.5, aim: Math.PI, recoil: 0, slot, x: 0, z: 0, tgt: -1, born: 0, hp: 0, mhp: 0, hitT: 9, dmgT: 99, down: 0, vx: 0 }; t.mhp = this.towerMaxHp(t); t.hp = t.mhp; const sl = KM.TOWER_SLOTS[slot]; t.x = Math.max(-W.LANE + 0.8, Math.min(W.LANE - 0.8, this.L.x + sl.x)); t.z = this.L.z + 2; return t; }   // rolls in from behind the tank
    structAt(tg) {
      if (tg <= -10) { const t = this.towers[-tg - 10]; return t && !(t.down > 0) ? t : null; }
      return null;
    }
    hurtStruct(tg, amt, why) {
      const o = this.structAt(tg); if (!o) return;
      const arm = 4 + this.stats.towerArmor;
      if (this.stats.shRadius > 3.4 && this.inShield(o.x, o.z, 0.6)) amt = this.absorb(amt);     // the widened field covers the support vehicles
      if (amt <= 0) return;
      o.hp -= amt * (12 / (12 + arm)); o.hitT = 0; o.dmgT = 0;
      if (o.hp <= 0) {
        { o.hp = 0; o.down = 30; this.emit('towerDown', o); for (let i = 0; i < this.hi; i++) if (this.tgt[i] === tg) this.tgt[i] = -1; }   // knocked out: auto-repairs, or rebuild via its card
      } else this.emit('shit', o);
    }
    // nearest support vehicle an enemy at (x,z) is in contact with
    structNear(x, z, r) {
      for (let s = 0; s < this.towers.length; s++) { const t = this.towers[s]; if (!t || t.down > 0) continue; const dx = x - t.x, dz = z - t.z; if (dx * dx + dz * dz < (1.6 + r) * (1.6 + r)) return -(10 + s); }
      return -1;
    }
    stepVehicleState(dt) {
      for (const t of this.towers) if (t) { t.hitT = (t.hitT || 0) + dt; t.dmgT = (t.dmgT || 0) + dt; if (t.down > 0) { t.down -= dt; if (t.down <= 0) { t.down = 0; t.hp = t.mhp * 0.4; this.emit('towerUp', t); } } else if (t.dmgT > 5 && t.hp < t.mhp) t.hp = Math.min(t.mhp, t.hp + t.mhp * 0.01 * dt); }
    }
    // ---------- upgrades ----------
    // ---------- inline upgrades ----------
    // ---------- class levels (independent tracks, 1…10; level 8 = final evolution) ----------
    clsM(key, lv) { const M = KM.clsMul(key, lv), b = (this.stats.skin || {})[key]; if (b) { M.hp *= 1 + (b.hp || 0); M.dmg *= 1 + (b.dmg || 0); M.arm += b.armor || 0; } return M; }   // class level × Armory skin
    // per-unit numbers of a class at level lv (HUD: Lv · DMG, upgrade preview): hp, attack damage (Mizard: heal per beam), armour
    classInfo(key, lv) { const S = this.stats, d = KM.FRIEND_BY[KM.PROD[key].kind], M = this.clsM(key, lv), ev = lv >= KM.EVOLVE_AT;
      let dmg = S.dmg * d.dmg * M.dmg * (ev ? 1.2 : 1); if (d.r) dmg *= KM.RTECH[Math.min(KM.RTECH.length - 1, KM.ERA_BY_LV[lv - 1])].dmg * (1 + 0.08 * (lv - 1));
      if (d.med) dmg = 7 * (1 + 0.12 * (lv - 1)) * (1 + (((S.skin || {}).mizard || {}).heal || 0));
      return { hp: S.hp * d.hp * M.hp * (ev ? 1.25 : 1), dmg, arm: M.arm, heal: !!d.med }; }
    clsCost(key) { const lv = this.stats.cls[key]; return lv >= KM.CLASS_MAX ? Infinity : KM.clsUpCost(key, lv); }
    levelUp(key) {
      const S = this.stats, lv = S.cls[key]; if (!this.alive || lv >= KM.CLASS_MAX || this.coins < KM.clsUpCost(key, lv)) return false;
      this.coins -= KM.clsUpCost(key, lv); S.cls[key] = lv + 1; this.applyClass(key, lv, lv + 1); this.emit('levelUp', key, lv + 1); return true;
    }
    applyClass(key, from, to) {                                                                       // living soldiers of the class improve in place (no deletion)
      const S = this.stats, A = this.clsM(key, from), B = this.clsM(key, to), kind = KM.FRIEND_BY[KM.PROD[key].kind].id, evolve = from < KM.EVOLVE_AT && to >= KM.EVOLVE_AT;
      for (let i = 0; i < this.hi; i++) { if (this.st[i] !== ALIVE || this.team[i] || this.kind[i] !== kind || this.merc[i]) continue;
        const f = B.hp / A.hp; this.mhp[i] *= f; this.hp[i] *= f; this.arm[i] += B.arm - A.arm;
      }
      this.classStats();
      if (evolve) this.emit('evolve', key);
    }
    classStats() {                                                                                    // class abilities derived from levels
      const S = this.stats, C = S.cls, m = this.t / 60;
      const B = S.skin || {}, bc = B.collector || {}, bm = B.mizard || {}, br = B.range || {};
      S.colCap = 6 * (1 + 0.15 * (C.collector - 1)) * (1 + (bc.carry || 0)); S.colSpeed = (1 + 0.06 * (C.collector - 1)) * (1 + (bc.speed || 0)); S.rangeMul = 1 + (br.range || 0); S.rofMul = 1 + (br.rof || 0); S.healR = 1 + (bm.healR || 0);
      S.rdmg = 1 + 0.08 * (C.range - 1); let era = KM.ERA_BY_LV[C.range - 1]; while (era > 0 && KM.RTECH[era].at > m) era--; S.rtech = era;   // weapon era by level, gated by the war's minute
      S.medHeal = 7 * (1 + 0.12 * (C.mizard - 1)) * (1 + (bm.heal || 0));
      // final evolution happens soldier by soldier, only while a free army point exists — the 300 points are never exceeded
      for (const key of KM.PROD_ORDER) { if (C[key] < KM.EVOLVE_AT) continue; const kind = KM.FRIEND_BY[KM.PROD[key].kind].id;
        for (let i = 0; i < this.hi && this.pts < S.cap; i++) if (this.st[i] === ALIVE && !this.team[i] && this.kind[i] === kind && !this.evo[i] && !this.merc[i]) {
          this.evo[i] = 1; this.rad[i] *= 1.2; this.mhp[i] *= 1.25; this.hp[i] *= 1.25; const np = KM.unitPts(key, true); this.pts += np - this.pt[i]; this.pt[i] = np; } }
    }
    rollUps() {                                                                                    // keep one valid next-upgrade per category (stable until bought or invalid)
      const G = KM.upgradeOptions(this), ups = this.ups || (this.ups = {});
      for (const g of KM.UPG_GROUPS) { const opts = G[g], cur = ups[g]; if (cur && opts.some(o => o.id === cur.id)) { ups[g] = opts.find(o => o.id === cur.id); continue; }
        if (!opts.length) { ups[g] = null; continue; } let r = this.rng() * opts.reduce((a, o) => a + o.w, 0), p = opts[opts.length - 1]; for (const o of opts) { r -= o.w; if (r <= 0) { p = o; break; } } ups[g] = p; }
    }
    upCost() { return KM.tankUpCost(this.upgrades); }   // tank track only
    buy(group) {
      const c = this.ups && this.ups[group]; if (!c || !this.alive) return false;
      const cost = this.upCost(); if (this.coins < cost) return false;
      this.coins -= cost; this.upgrades++; this.applyUpgrade(c); this.ups[group] = null; this.rollUps();
      this.emit('upgrade', c, group); return true;
    }
    applyUpgrade(c) {
      const s = this.stats;
      if (c.id.startsWith('build:')) {
        const slot = this.towers.findIndex((t, i) => !t && i < KM.slotsUnlocked(this.t / 60));
        if (slot >= 0) { this.towers[slot] = this.makeTower(c.tower, 1, slot); }
      } else if (c.id.startsWith('tup:')) {
        const t = this.towers[+c.id.slice(4)]; if (t) { t.lvl++; t.born = 0; t.down = 0; t.mhp = this.towerMaxHp(t); t.hp = t.mhp; }  // upgrading also fully repairs / rebuilds
      } else {
        const u = KM.UPG_BY[c.id]; const prevHp = s.hp;
        u.apply(s, this); s.lv[c.id] = (s.lv[c.id] || 0) + 1;
        if (c.id === 'thp') for (const t of this.towers) if (t) { const f = t.hp / t.mhp; t.mhp = this.towerMaxHp(t); t.hp = t.mhp * f + t.mhp * 0.25; t.hp = Math.min(t.hp, t.mhp); }
        if (c.id === 'hp') { const f = s.hp / prevHp; for (let i = 0; i < this.hi; i++) if (this.st[i] === ALIVE && !this.team[i]) { this.mhp[i] *= f; this.hp[i] *= f; } }
      }
    }

    // ---------- main step ----------
    step(dt) {
      if (!this.alive) { this.stepDying(dt); this.stepFx(dt); return; }
      this.t += dt; if (!this.nBoss) this.front -= W.ADV * dt; this.postureT += dt;   // boss fight: the march (and the tank) holds until the boss falls
      const D = this.diff = KM.difficulty(this.budget < -1e8 ? this.t : this.warT()), S = this.stats, L = this.L;
      // launcher movement (smoothed for weight); AUTO lines the cannon lane up on its own while the player is not steering
      L.man = Math.max(0, L.man - dt); const aim = this.auto && L.man <= 0; if (aim) this.autoSteer(dt);
      const px = L.x; let mx = (L.tx - L.x) * Math.min(1, dt * 12); if (aim) mx = Math.max(-AUTO_SPD * dt, Math.min(AUTO_SPD * dt, mx));   // AUTO slides at a steady drive speed; the player's drag keeps its direct feel
      L.x += mx;
      L.z = this.front; L.vx = (L.x - px) / dt; L.wheel += (Math.abs(L.vx) + W.ADV) * dt;
      L.hitT += dt; L.inv = Math.max(0, L.inv - dt); this.lastHit += dt;
      if (this.lastHit > 4) this.heal(S.maxHp * 0.02 * dt);
      L.fire = Math.max(0, L.fire - dt * 5);

      this.buildGrid();
      this.deploy(dt, S, D);
      this.director(dt, D);
      this.stepVehicleState(dt); if ((this.stepN = (this.stepN || 0) + 1) % 30 === 0) this.recount();
      this.stepZones(dt);
      this.formUpdate(dt); this.stepGroups(dt);
      this.stepUnits(dt, S);
      this.stepTowers(dt, S);
      this.stepTank(dt, S);
      this.stepShield(dt); this.stepPowers(dt);
      this.stepProjectiles(dt);
      this.stepCoins(dt, S);
      this.stepDying(dt);
      this.stepFx(dt);

      this.peakArmy = Math.max(this.peakArmy, this.count[0]);
      // danger: how close the enemy mass is to the launcher (drives music/vignette)
      this.danger += ((this.L.hp / S.maxHp < 0.35 ? 1 : 0) - this.danger) * Math.min(1, dt * 2);
      // inline upgrade badges stay current
      if ((this.upT -= dt) <= 0) { this.upT = 0.5; this.rollUps(); this.classStats(); }
    }

    deploy(dt, S) {                                                                                 // AUTO: the selected type, whenever coins and a free slot allow (cadence = deploy speed)
      this.atCap = this.pts + this.prodPts() > S.cap ? 1 : 0;
      this.deployAcc = Math.min(3, this.deployAcc + S.rate * dt);
      if (!this.auto) return;
      while (this.deployAcc >= 1 && this.deployOne('auto')) this.deployAcc -= 1;
    }

    // ---------- ENDLESS WAR: every wave is a level; a 10-wave cycle repeats forever with rising quality ----------
    warT() { return this.wave ? (this.wave - 1) * KM.WAVE_SECS + Math.min(KM.WAVE_SECS, this.t - this.waveStart) : 0; }   // difficulty clock advances by wave, not by wall time
    director(dt, D) {
      if (this.budget < -1e8) return;                                                                 // tests: director off
      if (this.wState === 0) { this.wGap -= dt; if (this.wGap <= 0) this.startWave(this.wave + 1); return; }
      for (let k = this.wQueue.length - 1; k >= 0; k--) { const q = this.wQueue[k]; if (this.t < q.at) continue; this.wQueue.splice(k, 1); if (q.warn) { this.emit('warn', q.warn); continue; }
        this.spawnTag = this.wave; this.formation(q.type, this.diff, q.bud); this.spawnTag = 0; }
      const late = this.t - this.waveStart > 75 && this.waveLeft <= Math.ceil(this.waveSpawned * 0.15);   // stragglers never stall the war
      if (!this.wQueue.length && (this.waveLeft <= 0 || late) && !this.nBoss) this.clearWave();
    }
    startWave(n) {
      const p = (n - 1) % 10 + 1, tier = Math.floor((n - 1) / 10), m = ((n - 1) * KM.WAVE_SECS) / 60, B = KM.waveBudget(n), Q = [], t = this.t;
      this.wave = n; this.wState = 1; this.waveStart = t; this.waveLeft = 0; this.waveSpawned = 0;
      if (p === 1 || !this.sector) this.chooseSector(m, tier);
      const A = KM.SECTORS[this.sector], other = this.sector2 || this.sector, pool = s => KM.SECTORS[s].pool, pick = s => this.rng.pick(pool(s));
      if (p === 10) { Q.push({ at: t, warn: 'boss' }, { at: t + 2.5, type: 'boss', bud: 0 }, { at: t + 3, type: 'line', bud: B * 0.45 }); }
      else if (p === 5) { Q.push({ at: t, type: pick(this.sector), bud: B * 0.7 }, { at: t + 4, type: tier ? 'elite' : pick(this.sector), bud: B * 0.6 }); }   // escalation
      else if (p >= 6) { if (!this.sector2) this.sector2 = this.chooseSector(m, tier, true); Q.push({ at: t, type: pick(this.sector), bud: B * 0.45 }, { at: t + 4, type: pick(other), bud: B * 0.4 }, { at: t + 9, type: tier && p === 9 ? 'elite' : pick(this.sector), bud: B * 0.35 });
        if (p === 7 || (p === 9 && tier >= 2)) Q.push({ at: t + 1, warn: 'mini' }, { at: t + 3.5, type: 'mini', bud: 0 }); }
      else { Q.push({ at: t, type: pick(this.sector), bud: B * 0.6 }, { at: t + 5, type: pick(this.sector), bud: B * 0.45 }); if (p === 3 && tier >= 1) Q.push({ at: t + 2, type: 'mini', bud: 0 }); }
      if (p === 6) this.sector2 = null;
      this.wQueue = Q; this.emit('waveStart', n, p, this.sector);
    }
    chooseSector(m, tier, second) {                                                                    // weighted variety, introductions first, soft counters to the army's make-up
      const S = KM.SECTORS, N = this.nKind, army = Math.max(1, this.count[0]), rangedShare = N[1] / army, meleeShare = N[0] / army;
      if (!second) { if (m < 0.5) { this.setSector('opening', false); return 'opening'; }
        for (const k in S) { const sc = S[k]; if (sc.intro && m >= sc.at && !this.seenSector[k]) { this.setSector(k, true); return k; } } }
      const w = {}; let tot = 0;
      for (const k in S) { if (k === 'opening' || m < S[k].at || k === this.sector) continue; let x = S[k].w || 1;
        if (k === 'charge' && rangedShare > 0.4) x *= 1.6; if (k === 'ranged' && meleeShare > 0.85) x *= 1.4; if (k === 'swarm' && army > 150) x *= 1.2; if (k === 'rout' && this.lastHard) x *= 2;
        w[k] = x; tot += x; }
      let r = this.rng() * tot, pickK = 'line' in S ? 'line' : Object.keys(w)[0] || 'opening'; for (const k in w) { r -= w[k]; if (r <= 0) { pickK = k; break; } }
      if (second) return pickK; this.setSector(pickK, false); return pickK;
    }
    setSector(k, intro) {
      const S = KM.SECTORS[k]; this.sector = k; this.sectorIntro = intro; this.seenSector[k] = 1; this.lastHard = k === 'giant' || k === 'charge' || k === 'attrition';
      if (S.giants && this.wave >= 4) for (let n = 0; n < S.giants; n++) this.wQueue.push({ at: this.t + 2 + n * 3, type: 'mini', bud: 0 });
      this.emit('sector', k, intro);
    }
    clearWave() {
      const n = this.wave, p = (n - 1) % 10 + 1, g = KM.waveGold(n);
      this.wState = 0; this.wGap = p === 10 ? 4 : 2.5; this.coins += g; this.coinsTotal += g; this.gainEnergy(15);
      this.emit('waveClear', n, g);
      if (p === 5) this.offerChoice('supply');
    }
    // ---------- rewards + choices (non-blocking: the war keeps going until the player taps one) ----------
    offerChoice(kind) {
      if (this.choice) this.takeChoice(0);                                                              // an untaken older choice resolves to its first option
      const n = this.wave, opts = kind === 'supply'
        ? [{ id: 'gold', title: 'GOLD CACHE', val: '+' + KM.waveGold(n) * 3 }, { id: 'energy', title: 'TANK ENERGY', val: '+100' }, { id: 'recover', title: 'ARMY RECOVERY', val: 'HEAL ALL' }]
        : this.rng.shuffle((this.equipped || KM.POWER_IDS.slice(0, 3)).slice()).slice(0, 3).map(id => ({ id, title: KM.POWERS[id].name, val: KM.POWERS[id].boostTxt }));
      this.choice = { kind, opts }; this.emit('choice', this.choice);
    }
    takeChoice(k) {
      const c = this.choice; if (!c || !c.opts[k]) return false; const o = c.opts[k]; this.choice = null;
      if (c.kind === 'supply') { if (o.id === 'gold') { const g = KM.waveGold(this.wave) * 3; this.coins += g; this.coinsTotal += g; } else if (o.id === 'energy') this.gainEnergy(100);
        else for (let i = 0; i < this.hi; i++) if (this.st[i] === ALIVE && !this.team[i]) this.hp[i] = this.mhp[i]; }
      else { this.pboost[o.id] = (this.pboost[o.id] || 0) + 1; }                                          // boss reward: one step of that tank power for the rest of the run
      this.emit('chose', c.kind, o.id); return true;
    }
    bossDown(d) {
      const g = KM.waveGold(this.wave) * 4; this.coins += g; this.coinsTotal += g; this.bossesKilled++; this.warTokens++; this.gainEnergy(60);
      this.emit('bossReward', { wave: this.wave, gold: g, tokens: 1, kind: d.k }); this.offerChoice('power');
    }

    // Returns budget spent. Every unit placed is an unlocked type inside the lane.
    formation(type, D, budget) {
      const r = this.rng, m = D.m, un = KM.unlocked(m), E = KM.ENEMY_BY;
      // the opening waves enter closer so the first clash happens within seconds, not after a long walk
      const z0 = this.front - (this.t < 20 ? 30 + this.t : W.SPAWN_DZ) - r() * 6, cx = r.range(-W.LANE + 3, W.LANE - 3);
      const melee = un.filter(e => !e.r && !e.el && e.k !== 'bomber'), list = [];
      const SEC = KM.SECTORS[this.sector || 'opening'], pref = melee.filter(e => SEC.prefer.includes(e.k));
      const pickMelee = () => { if (r() < D.eliteChance && m >= 6 && this.sector !== 'rout') return E.brute; if (pref.length && r() < (this.sectorIntro ? 0.85 : 0.6)) return r.pick(pref); const c = melee.filter(e => r() < 0.75 || e.k === 'grunt'); return r.pick(c.length ? c : melee); };
      const add = (def, x, z) => list.push([def, x, z]);
      let spent = 0;
      const spend = def => { spent += def.cost; return spent <= budget + 2; };
      const has = k => un.some(e => e.k === k);
      switch (type) {
        case 'line': { const d = pickMelee(), w = r.range(4, 9); for (let k = 0; spend(d); k++) { const row = Math.floor(k / 8); add(d, cx + ((k % 8) / 7 - 0.5) * 2 * w, z0 - row * 1.2); } break; }
        case 'wedge': { const d = pickMelee(); for (let k = 0; spend(d); k++) { const row = Math.floor(Math.sqrt(k)), col = k - row * row; add(d, cx + (col - row) * 0.6, z0 - row * 1.1); } break; }
        case 'column': { const d = pickMelee(); for (let k = 0; spend(d); k++) add(d, cx + ((k % 3) - 1) * 0.9, z0 - Math.floor(k / 3) * 0.9); break; }
        case 'blob': for (let k = 0; ; k++) { const d = pickMelee(); if (!spend(d)) break; const a = r() * 6.283, rr = Math.sqrt(r()) * (1.5 + Math.sqrt(k) * 0.5); add(d, cx + Math.cos(a) * rr, z0 + Math.sin(a) * rr); } break;
        case 'swarm': { const d = E.imp; for (let k = 0; spend(d); k++) { const a = r() * 6.283, rr = Math.sqrt(r()) * (2 + Math.sqrt(k) * 0.35); add(d, cx * 0.5 + Math.cos(a) * rr * 1.6, z0 + Math.sin(a) * rr); } break; }
        case 'flank': { const d = pickMelee(); for (let k = 0; spend(d); k++) add(d, (k % 2 ? 1 : -1) * (W.LANE - 2 - r() * 2), z0 - Math.floor(k / 2) * 0.9); break; }
        case 'shieldwall': case 'backline': {
          const front = E.shield, back = has('archer') ? E.archer : E.grunt; const n = Math.max(3, Math.floor(budget / (front.cost + back.cost)));
          for (let k = 0; k < n; k++) { if (!spend(front)) break; add(front, cx + (k / Math.max(1, n - 1) - 0.5) * Math.min(14, n * 1.0), z0); }
          for (let k = 0; k < n && spend(back); k++) add(back, cx + (k / Math.max(1, n - 1) - 0.5) * Math.min(14, n * 1.0), z0 - 2.2 - (k % 2) * 0.8);
          if (has('shaman') && spend(E.shaman)) add(E.shaman, cx, z0 - 4);
          break;
        }
        case 'elite': { if (spend(E.brute)) add(E.brute, cx, z0); const d = has('knight') ? E.knight : E.shield; for (let k = 0; spend(d); k++) add(d, cx + Math.cos(k * 1.3) * (1.8 + k * 0.1), z0 - 1 + Math.sin(k * 1.3) * 1.6); break; }
        case 'siege': { if (spend(E.cannon)) add(E.cannon, cx, z0 - 5); for (let k = 0; spend(E.shield); k++) add(E.shield, cx + ((k % 6) - 2.5) * 1.0, z0 - Math.floor(k / 6)); break; }
        case 'mixed': for (let k = 0; ; k++) { const d = r() < 0.15 && has('bomber') ? E.bomber : r() < 0.2 ? (has('archer') ? E.archer : E.grunt) : pickMelee(); if (!spend(d)) break; add(d, r.range(-W.LANE + 1, W.LANE - 1), z0 - r() * 8); } break;
        case 'push': for (let k = 0; ; k++) { const d = m > 0.6 && r() < 0.3 ? E.imp : pickMelee(); if (!spend(d)) break; add(d, r.range(-W.LANE + 0.8, W.LANE - 0.8), z0 - r() * 14); } break;
        case 'mini': { add(E.giant, cx, z0); spent = 0; for (let k = 0; k < 6; k++) add(has('spearman') ? E.spearman : E.shield, cx + Math.cos(k) * 2.4, z0 + 1.5 + Math.sin(k)); break; }
        case 'boss': { const avail = KM.BOSS_ORDER.map(k => E[k]).filter(b => b.at <= m); const B = avail[this.bossN++ % avail.length] || E.titan; add(B, 0, z0); spent = 0; const d = has('knight') ? E.knight : E.shield; for (let k = 0; k < 10; k++) add(d, Math.cos(k / 10 * 6.283) * 2.6, z0 + Math.sin(k / 10 * 6.283) * 2); break; }
      }
      if (!list.length && type !== 'boss') { add(E.grunt, cx, z0); spent = Math.max(spent, E.grunt.cost); }   // an expensive first pick never leaves a formation empty
      if (spent > budget + 2) spent = budget; // last over-budget unit was rejected by spend()
      const mul = { hp: D.hp * (1 + this.overflow) * (type === 'push' || type === 'boss' || type === 'mini' ? 1 : SEC.hp), dmg: D.dmg, spd: D.speed * SEC.spd, era: Math.min(5, D.era), arm: Math.min(10, D.era * 1.5) };
      let placed = 0;
      // organic mass: depth jitter, a random arc, small lateral clusters and late subgroups — never a ruler line
      const arc = (r() - 0.5) * 0.35, nCl = 2 + Math.floor(r() * 3), cl = Array.from({ length: nCl }, () => [r.range(-1.2, 1.2), r() < 0.3 ? -r.range(3, 7) : 0]);
      for (let q = 0; q < list.length; q++) { const it = list[q], c = cl[q % nCl]; it[1] = Math.max(-W.LANE, Math.min(W.LANE, it[1] + c[0] + (r() - 0.5) * 0.6)); it[2] += c[1] - Math.abs(it[1] - cx) * arc - r() * 1.6; }
      // the wave marches as one formation (anchor + slot offsets) until it hits the line, then breaks into free combat
      const G = type === 'boss' || type === 'mini' ? null : { cx, z: z0, v: 9, n0: 0, alive: 0, st: 0, t: 0 }, gid = G ? this.groups.push(G) - 1 : -1;
      for (const [d, x, z] of list) {
        if (this.count[1] >= W.MAX_ENEMY && !d.boss) { this.overflow = Math.min(3, this.overflow + 0.002); continue; } // hard population cap: excess becomes strength
        const j = this.spawn(1, d, Math.max(-W.LANE, Math.min(W.LANE, x)), z, mul); if (j < 0) continue; placed++; if (this.spawnTag) { this.wv[j] = this.spawnTag; this.waveLeft++; this.waveSpawned++; }
        if (G && !d.mech) { this.grp[j] = gid; this.gox[j] = this.x[j] - cx; this.goz[j] = z - z0; G.n0++; G.alive++; G.v = Math.min(G.v, this.spd[j] * 0.8); }
      }
      if (this.opts.trace) this.debugLog.push({ t: this.t, m: D.m, type, kinds: list.map(l => l[0].k), xs: list.map(l => l[1]) });
      if (type === 'boss' || type === 'push' || type === 'mini') this.emit('wave', type, list[0] && list[0][0].k);
      else if (list.some(l => l[0].el)) this.emit('elite', type);
      return Math.max(spent, placed ? 1 : 0);
    }

    // Local pressure zones: the lane is split into 8 strips that win or lose ground independently (neighbours diffuse,
    // slow per-zone noise keeps them from moving in lockstep) → a wavy, unstable battlefront with flanks that collapse.
    stepZones(dt) {
      const Z = 8, F = this.zF || (this.zF = new Float32Array(Z)), E = this.zE || (this.zE = new Float32Array(Z)), P = this.zP || (this.zP = new Float32Array(Z)), Q = this.zQ || (this.zQ = new Float32Array(Z));
      F.fill(0); E.fill(0); this.atkN.fill(0, 0, this.hi);
      // melee intensity: small skirmishes keep the crisp early game; mass battles turn into a mixed melee
      this.mi = Math.max(0, Math.min(1, (this.count[0] + this.count[1] - 70) / 90));
      if (this.meleeOff) this.mi = 0;                                                               // A/B switch for tests: old banded line
      for (let i = 0; i < this.hi; i++) { if (this.st[i] !== ALIVE) continue; const t = this.tgt[i]; if (t >= 0 && this.atkN[t] < 250) this.atkN[t]++;
        if (this.z[i] < this.front - 70) continue; const k = Math.max(0, Math.min(Z - 1, Math.floor((this.x[i] + W.LANE) / (2 * W.LANE) * Z))), w = Math.sqrt(this.hp[i] * (this.team[i] ? this.dmg[i] : this.stats.dmg)) * (this.role[i] === 3 ? 0.5 : 1);
        if (this.team[i]) E[k] += w; else F[k] += w; }
      for (let k = 0; k < Z; k++) Q[k] = (F[k] - E[k]) / (F[k] + E[k] + 4) + 0.28 * Math.sin(this.t * (0.11 + k * 0.013) + k * 1.9);
      for (let k = 0; k < Z; k++) { const nb = ((k > 0 ? Q[k - 1] : Q[k]) + (k < Z - 1 ? Q[k + 1] : Q[k])) / 2, tgt = Math.max(-1, Math.min(1, Q[k] * 0.75 + nb * 0.25)); P[k] += (tgt - P[k]) * Math.min(1, dt * 0.8); }
    }
    zoneOf(x) { return Math.max(0, Math.min(7, Math.floor((x + W.LANE) / (2 * W.LANE) * 8))); }
    // Choose among the nearest few enemies by role: spread attackers, finish the wounded, hunt specialists, save allies, dive deep.
    pickTarget(i, R) {
      const x = this.x[i], z = this.z[i], ot = 1 - this.team[i], role = this.role[i], team = this.team[i];
      const C = this.cand || (this.cand = new Int32Array(8)), CD = this.candD || (this.candD = new Float32Array(8)); let n = 0, worst = 0;
      const c0 = this.cellX(x - R), c1 = this.cellX(x + R), r0 = this.cellZ(z - R), r1 = this.cellZ(z + R), R2 = R * R;
      for (let gz = r0; gz <= r1; gz++) for (let gx = c0; gx <= c1; gx++) for (let j = this.gh[(gz * GCOLS + gx) * 2 + ot]; j >= 0; j = this.next[j]) {
        if (this.st[j] !== ALIVE) continue; const dx = this.x[j] - x, dz = this.z[j] - z, d = dx * dx + dz * dz; if (d > R2) continue;
        if (n < 8) { C[n] = j; CD[n] = d; if (d > CD[worst]) worst = n; n++; if (n === 8) { worst = 0; for (let q = 1; q < 8; q++) if (CD[q] > CD[worst]) worst = q; } }
        else if (d < CD[worst]) { C[worst] = j; CD[worst] = d; worst = 0; for (let q = 1; q < 8; q++) if (CD[q] > CD[worst]) worst = q; }
      }
      if (!n) return -1; if (role === 3 || n === 1) { let b = 0; for (let q = 1; q < n; q++) if (CD[q] < CD[b]) b = q; return C[b]; }
      let best = -1, bs = 1e9;
      for (let q = 0; q < n; q++) { const j = C[q], d = Math.sqrt(CD[q]), dj = this.def(j), depth = team === 0 ? z - this.z[j] : this.z[j] - z;
        const mi = this.mi || 0; let sc = d + mi * (this.atkN[j] * (role === 1 ? 1.4 : 0.55) + this.rng() * 0.8);
        if (role >= 1) sc -= mi * (1 - this.hp[j] / this.mhp[j]) * 1.6;                                   // finish the wounded
        if (role >= 1 && (dj.rng > 2 || dj.he)) sc -= mi * 2.4;                                           // hunt archers / shamans / cannons
        const tj = this.tgt[j]; if (tj >= 0 && this.team[tj] === team) sc -= mi * 0.6;                   // enemy threatening an ally
        if (role === 2) sc -= mi * Math.max(0, depth) * 0.9;                                             // breakthrough: dive past the front rank
        if (sc < bs) { bs = sc; best = j; } }
      return best;
    }
    // nearest unit of `team` by footprint edge (centre distance minus ground footprint, or minus collision radius when byRad)
    // within R of (x, z), optionally only those with z > zMin. The grid scan is padded by the largest footprint.
    nearestEdge(x, z, team, R, zMin, byRad) {
      const P = R + (byRad ? RAD_PAD : FT_PAD), P2 = P * P, c0 = this.cellX(x - P), c1 = this.cellX(x + P), r0 = this.cellZ(z - P), r1 = this.cellZ(z + P), f = byRad ? this.rad : this.ft; let best = -1, bd = R;
      for (let gz = r0; gz <= r1; gz++) for (let gx = c0; gx <= c1; gx++) for (let j = this.gh[(gz * GCOLS + gx) * 2 + team]; j >= 0; j = this.next[j]) {
        if (this.st[j] !== ALIVE || (zMin != null && this.z[j] <= zMin)) continue; const dx = this.x[j] - x, dz = this.z[j] - z, dd = dx * dx + dz * dz; if (dd > P2) continue;
        const e = Math.sqrt(dd) - f[j]; if (e <= bd) { bd = e; best = j; } }
      return best;
    }
    // TANK GUARD (once per step): up to 16 enemies at the tank (footprint edge within TANK_GUARD_R of it, or level with the hull
    // beside it). In DEFEND each intruder is engaged by the nearest Melee / Elite / Giant whose slot lies within 12 m of it
    // (more responders for bigger foes, the heavies first for a big one, and always everyone already within 2 m of its body),
    // whatever their hold rules say; Range shoots intruders from where it stands.
    gDrop() { if (this.gWas) { this.gtg.fill(-1); this.gWas = 0; } }   // no tank guard this step: forget the responders, so a later guard starts without stale hysteresis
    guardScan() {
      if (this.posture !== 1) { this.guardN = 0; this.gOn = 0; this.gDrop(); return; }   // only DEFEND reads the intruder list
      const L = this.L, GL = this.gL || (this.gL = new Int32Array(16)), GD = this.gD || (this.gD = new Float32Array(16)), PL = this.gPL || (this.gPL = new Int32Array(16)), pn = this.guardN | 0, GR = W.TANK_GUARD_R, lat = W.HULL_HW + GR; let n = 0;
      PL.set(GL);   // last step's intruders keep that status for 1.5 m more (hysteresis: no flicker at the zone edge)
      const c0 = this.cellX(L.x - lat - FT_PAD - 1.5), c1 = this.cellX(L.x + lat + FT_PAD + 1.5), r0 = this.cellZ(L.z - GR - FT_PAD - 1.5), r1 = this.cellZ(L.z + 2);
      for (let gz = r0; gz <= r1; gz++) for (let gx = c0; gx <= c1; gx++) for (let j = this.gh[(gz * GCOLS + gx) * 2 + 1]; j >= 0; j = this.next[j]) {
        if (this.st[j] !== ALIVE) continue; const dx = this.x[j] - L.x, dz = this.z[j] - L.z, f = this.ft[j], e = Math.sqrt(dx * dx + dz * dz) - f; let h = 0; for (let q = 0; q < pn; q++) if (PL[q] === j) { h = 1.5; break; }
        if (!(e < GR + h || (dz + f > -4 - h && Math.abs(dx) - f < lat + h))) continue;
        if (n === 16 && e >= GD[15]) continue; let k = n < 16 ? n++ : 15; while (k > 0 && GD[k - 1] > e) { GD[k] = GD[k - 1]; GL[k] = GL[k - 1]; k--; } GD[k] = e; GL[k] = j; }
      this.guardN = n; this.gOn = 0;
      const F = this.form; if (!n || !F || !F.on || !F.mem) { this.gDrop(); return; }
      const A = this.gtg || (this.gtg = new Int32Array(CAP)), cI = this.gcI || (this.gcI = new Int32Array(CAP)), cQ = this.gcQ || (this.gcQ = new Uint8Array(CAP)), cD = this.gcD || (this.gcD = new Float32Array(CAP)), ord = this.gcO || (this.gcO = []), G = this.gp || (this.gp = [0, 0]);
      const PA = this.gpA || (this.gpA = new Int32Array(CAP)); PA.set(A.subarray(0, this.hi)); A.fill(-1, 0, this.hi); let nc = 0;   // PA: last step's responders (hysteresis)
      const take = arr => { for (const i of arr) { if (this.st[i] !== ALIVE || this.team[i] || this.charge[this.typeOf(i)] || nc >= CAP) continue; this.formGoal(i, G); let bq = -1, bd = 1e9, pq = -1, pd = 1e9;
        const xi = this.x[i], zi = this.z[i], gx = G[0], gz = G[1];
        for (let q = 0; q < n; q++) { const j = GL[q]; if (this.st[j] !== ALIVE) continue; const xj = this.x[j], zj = this.z[j], fj = this.ft[j], ax = xi - xj, az = zi - zj, dc = Math.sqrt(ax * ax + az * az) - fj;
          if (dc >= 2) { const sx = gx - xj, sz = gz - zj, r = 12 + fj + (PA[i] === j ? 1.5 : 0); if (sx * sx + sz * sz > r * r) continue; }   // a unit already at its body answers wherever its slot is
          if (PA[i] === j) { pq = q; pd = dc; } if (dc < bd) { bd = dc; bq = q; } }
        if (pq >= 0 && pd < bd + 1.5) { bq = pq; bd = pd; }   // hysteresis: keep last step's intruder unless another is clearly nearer
        if (bq >= 0) { cI[nc] = i; cQ[nc] = bq; cD[nc] = bd; nc++; } } };
      take(F.list); take(F.mem[34]); take(F.mem[37]);
      const hv = c => this.kind[cI[c]] !== 32 && this.ft[GL[cQ[c]]] >= 1.5 ? 0 : 1;   // a big intruder draws the heavies (Elite, Giant) first
      ord.length = nc; for (let k = 0; k < nc; k++) ord[k] = k; ord.sort((a, b) => cQ[a] - cQ[b] || hv(a) - hv(b) || (PA[cI[a]] === GL[cQ[a]] ? 0 : 1) - (PA[cI[b]] === GL[cQ[b]] ? 0 : 1) || cD[a] - cD[b] || cI[a] - cI[b]);   // a unit already answering keeps its place in the cap
      // per intruder: the nearest few by its size (at most 2 Giants, 4 for a big body), plus anyone already within 2 m of it
      for (let k = 0, q = -1, used = 0, cap = 0, big = 0; k < nc; k++) { const c = ord[k]; if (cQ[c] !== q) { q = cQ[c]; used = 0; big = 0; cap = 4 + Math.round(5 * this.ft[GL[q]]); }
        const isG = this.kind[cI[c]] === 37; if ((used < cap && (!isG || big < 2 + (this.ft[GL[q]] >= 1.5 ? 2 : 0))) || cD[c] < 2) { if (isG) big++; A[cI[c]] = GL[q]; used++; } }
      this.gOn = 1; this.gWas = 1;
    }
    // DEFEND: does a local interceptor (sword reserve or giant) keep its target? It lets go once pulled more than W.LEASH from its
    // slot or once the target leaves the protection zone (with a little hysteresis) — then the return-to-slot path runs.
    defKeep(i, tg) {
      const k = this.kind[i], F = this.form; if (this.emergency || !F || !F.on) return true;
      if (k === 34) return Math.hypot(this.x[tg] - this.x[i], this.z[tg] - this.z[i]) - this.rad[i] - this.rad[tg] <= W.ELITE_RNG + 0.6;   // Elite: only what the pike reaches (+ hysteresis)
      if (!(k === 37 || (k === 32 && this.frank[i] !== 1))) return true;
      const G = this.fg || (this.fg = [0, 0]); this.formGoal(i, G);
      if (Math.hypot(this.x[i] - G[0], this.z[i] - G[1]) > W.LEASH) return false;
      return this.z[tg] > F.frontZ - 1 && Math.hypot(this.x[tg] - G[0], this.z[tg] - G[1]) - this.ft[tg] <= (k === 37 ? PROT_GIANT : PROT_MELEE) + 1;
    }
    // DEFEND target acquisition (the tank guard is applied per step before this): emergency → class rules. Range shoots the nearest
    // footprint within bow range from where it stands (tank intruders first); the Elite thrusts at anything its pike reaches from the
    // second line, including enemies in front of the shield rank; the shield rank fights what reaches it; sword reserves and giants
    // intercept enemies that are inside the formation within their protection radius of their own slot.
    defTarget(i, ranged) {
      const F = this.form, kind = this.kind[i];
      if (!F || !F.on) return this.pickTarget(i, ranged ? this.rng_[i] + 1 : 6);   // before the first formation tick
      if (this.emergency && !ranged) { const th = this.nearest(i, 12); if (th >= 0 && this.lDist(this.x[th], this.z[th]) < 12) return th; }   // EMERGENCY DEFENSE: the first three rows collapsed
      if (ranged) { const R = this.rng_[i] + this.rad[i]; let best = -1, bd = R;
        for (let q = 0; q < (this.guardN | 0); q++) { const j = this.gL[q]; if (this.st[j] !== ALIVE) continue; const e = Math.hypot(this.x[j] - this.x[i], this.z[j] - this.z[i]) - this.ft[j]; if (e <= bd) { bd = e; best = j; } }
        return best >= 0 ? best : this.nearestEdge(this.x[i], this.z[i], 1, R); }
      const G = this.fg || (this.fg = [0, 0]); this.formGoal(i, G); if (Math.hypot(this.x[i] - G[0], this.z[i] - G[1]) > W.LEASH) return -1;   // pulled off its slot: walk back first
      if (kind === 34) return this.nearestEdge(this.x[i], this.z[i], 1, W.ELITE_RNG + this.rad[i] + 0.3, null, true);   // pike reach (rng + own radius + target radius) + 0.3
      if (kind === 32 && this.frank[i] === 1) { let tg = this.pickTarget(i, 1.9); if (tg >= 0 && tg !== this.bossI && this.z[tg] < F.frontZ - 3) tg = -1;
        return tg >= 0 ? tg : this.nearestEdge(this.x[i], this.z[i], 1, this.rng_[i] + this.rad[i] + 0.2, null, true); }   // a big body pressing on the shield (centre beyond 1.9 m) is still within the sword's reach
      return this.nearestEdge(G[0], G[1], 1, kind === 37 ? PROT_GIANT : PROT_MELEE, F.frontZ - 0.5);
    }
    stepUnits(dt, S) {
      const front = this.front, L = this.L, aggro0 = 11, aggro1 = 10, COH = 27, fN = Math.max(1, this.count[0] - this.nCol); let nCol = 0; this.colList.length = 0; this.nRepair = 0;
      this.guardScan(); const vm = this.nBoss ? 0 : -W.ADV;   // DEFEND slots march with the war at this speed
      for (let i = 0; i < this.hi; i++) {
        if (this.st[i] !== ALIVE) continue;
        const team = this.team[i];
        if (this.birth[i] > 0) { this.birth[i] += dt; if (this.birth[i] > 0.4) this.birth[i] = 0; }
        if (this.slow[i] > 0) this.slow[i] -= dt;
        if (this.flash[i] > 0) this.flash[i] -= dt * 5;
        if (this.swing[i] > 0) {
          // the blow lands on the strike frame of the attack animation, not when the wind-up starts
          const hitAt = (this.team[i] ? this.rng_[i] > 2 : this.role[i] === 3) ? 0.8 : 0.5, was = this.swing[i];
          this.swing[i] -= dt / this.swd[i];
          if (was > hitAt && this.swing[i] <= hitAt && this.pend[i] !== -1) this.strike(i, S);
        }
        const sm = this.slow[i] > 0 ? 0.5 : 1;
        // zone pressure: winning strips surge (a few units turn into breakthrough divers), losing strips give ground
        const zk = this.zP ? this.zP[this.zoneOf(this.x[i])] * (this.mi || 0) : 0, adv = team ? -zk : zk;
        if (this.roleT[i] > 0) { this.roleT[i] -= dt; if (this.roleT[i] <= 0 && this.role[i] === 2) this.role[i] = 1; }
        else if (adv > 0.3 && this.role[i] < 2 && this.rng() < dt * 0.35) { this.role[i] = 2; this.roleT[i] = 3 + this.rng() * 3; this.think[i] = 0; }
        let dvx = 0, dvz = 0;
        const isCol = team === 0 && this.role[i] === 4 && !this.attacking('collector'), defend = team === 0 && this.posture === 1 && !this.charge[this.typeOf(i)];   // a type ordered to ATTACK leaves the formation
        if (isCol) { nCol++; this.colList.push(i); this.collector(i, dt, S); dvx = this.cvx; dvz = this.cvz; }
        else if (team === 0 && this.role[i] === 5) { this.medic(i, dt, S); dvx = this.cvx; dvz = this.cvz; }
        else {
        // retarget (staggered)
        this.think[i] -= dt;
        let tg = this.tgt[i];
        if (tg >= 0 && this.st[tg] !== ALIVE) tg = -1;
        if (tg <= -10 && !this.structAt(tg)) { tg = -1; this.tgt[i] = -1; }
        // DEFEND: the tank guard overrides every hold rule; a local interceptor drops a target that left its zone or pulled it off its leash
        const gq = defend && this.gOn ? this.gtg[i] : -1;
        if (gq >= 0) { if (tg !== gq) this.tgt[i] = tg = gq; }
        else if (defend && tg >= 0 && !this.defKeep(i, tg)) { tg = -1; this.tgt[i] = -1; this.think[i] = 0; }
        if (this.think[i] <= 0) {
          this.think[i] = 0.18 + this.rng() * 0.16;
          const ranged = team === 0 ? this.role[i] === 3 : this.rng_[i] > 2;   // friendlies by role (the Elite pike reaches 2.3 but is melee)
          if (team === 0 && ranged) { const T = KM.rtech(S); this.rng_[i] = T.range * (S.rangeMul || 1); this.cd[i] = T.cd / (S.rofMul || 1); }
          tg = gq >= 0 ? gq : defend ? this.defTarget(i, ranged) : this.pickTarget(i, team ? aggro1 + (ranged ? 4 : 0) : aggro0 + (ranged ? 4 : 0));   // DEFEND: tank guard · emergency · local zones only
          if (team === 0 && this.spear[i]) {
            this.rng_[i] = 0.75;
            if (tg >= 0) { const sd = Math.hypot(this.x[tg] - this.x[i], this.z[tg] - this.z[i]), big = this.elite[tg] || KM.ENEMY[this.kind[tg]].boss;
              if (sd > 3 && sd < 9.5 && (!defend || big)) { this.spear[i] = 0; this.rng_[i] = 0.75; const tof = sd / 17;   // opening spear throw, then the sword
                this.fire(0, this.x[i], this.z[i], tg, this.x[tg] + this.vx[tg] * tof, this.z[tg] + this.vz[tg] * tof, S.dmg * 3.2, 22, 0, 0, 17, false, 0); this.emit('spear', i); } }
          }
          if (team === 0 && tg >= 0 && !defend) {
            // ATTACK: soft cohesion radius, never chase ever farther
            if (tg !== this.bossI && L.z - this.z[tg] > COH && this.z[tg] < this.z[i]) tg = -1;
          }
          // boss fight: troops in ATTACK go for the boss wherever it is, also when nothing else is in sight (an idle soldier
          // never leaves a boss standing off upfield unattacked)
          if (team === 0 && !defend && this.nBoss && this.bossI >= 0 && this.st[this.bossI] === ALIVE && (tg < 0 || this.rng() < 0.35)) tg = this.bossI;
          if (team === 0 && !ranged && this.role[i] < 3) this.rng_[i] = defend && this.kind[i] === 34 ? W.ELITE_RNG : 0.75;   // DEFEND Elite: the phalanx pike reaches over the shield rank
          const gF = team === 1 && this.grp[i] >= 0 ? this.groups[this.grp[i]] : null;
          if (gF && gF.st < 2 && tg >= 0 && Math.hypot(this.x[tg] - this.x[i], this.z[tg] - this.z[i]) > (ranged ? this.rng_[i] + 0.5 : this.rad[i] + this.rad[tg] + 1.6)) tg = -1;   // in formation: hold ranks, engage only on contact
          if (gF && tg >= 0 && gF.st === 0) gF.st = 1;   // impact
          if (team === 1) { const ld = this.lDist(this.x[i], this.z[i]) - this.ft[i] + 0.36; if (ld < 6.5 && (tg < 0 || ld < 3)) tg = -2;   // tank in sight / in contact, from the body edge (grunt-sized numbers): bosses held at the hull still find it
            const sn = this.structNear(this.x[i], this.z[i], this.rad[i] + (ranged ? 3 : 0)); if (sn !== -1 && (tg < 0 || this.rng() < 0.5)) tg = sn; }
          this.tgt[i] = tg;
        }
        if (team === 1 && this.mt[i] > 0 || (team === 1 && KM.ENEMY[this.kind[i]].mech)) this.bossMech(i, dt, KM.ENEMY[this.kind[i]]);
        let sp = this.spd[i] * sm * (team ? 1 : S.speed / 4.3) * (1 + 0.3 * adv) * (this.role[i] === 2 ? 1 + 0.15 * (this.mi || 0) : 1);
        if (team === 0 && this.kind[i] !== 32) sp = sp; // all friendlies share stat speed
        if (this.mph[i] === 2 && team === 1) { tg = -1; }                                              // charging: ignore targets, run the line over
        if (tg !== -1) {
          const so = tg <= -10 ? this.structAt(tg) : null;
          const tx = so ? so.x : tg === -2 ? L.x : this.x[tg], tz = so ? so.z : tg === -2 ? L.z : this.z[tg];
          let dx = tx - this.x[i], dz = tz - this.z[i], d = Math.sqrt(dx * dx + dz * dz) || 0.001;
          this.yaw[i] = Math.atan2(dx, dz);
          if (tg === -2) { d = this.hullDist(i); const A = this.tankApproach(i); dx = A[0] * d; dz = A[1] * d; }   // the tank: steer at a legal hull contact point; d = distance from this body's centre to the hull surface
          const reach = tg === -2 ? this.rng_[i] + this.ft[i] + TANK_PAD : this.rng_[i] + this.rad[i] + (so ? 1.1 : this.rad[tg]);
          // DEFEND: the shield rank, the Elite phalanx and the archers hold their slots (enemies come to them); reserves and giants
          // intercept inside their zone; a tank-guard target overrides both. Archers reach a big enemy's footprint edge.
          const rch = defend && this.role[i] === 3 && tg >= 0 ? this.rng_[i] + this.rad[i] + this.ft[tg] : reach;
          const hold = defend && gq < 0 && (this.role[i] === 3 || !this.emergency && (this.kind[i] === 34 || this.kind[i] === 32 && this.frank[i] === 1));
          if (hold && d > rch) { const G = this.fg || (this.fg = [0, 0]); this.formGoal(i, G); const ox = G[0] - this.x[i], oz = G[1] - this.z[i], od = Math.hypot(ox, oz) || 1e-3; if (od > 0.3) { dvx = ox / od * sp * Math.min(1, od / 2.2); dvz = oz / od * sp * Math.min(1, od / 2.2); } dvz += vm; this.yaw[i] = Math.PI; }   // the line holds; enemies come to it
          else if (this.role[i] === 3 && !defend && !so && tg >= 0 && d < this.rng_[i] * 0.5) { const hb = W.HULL_HW + this.rad[i] + W.FORM_CLEAR, blk = Math.abs(this.x[i] - L.x) < hb && this.z[i] < L.z && this.z[i] > L.z - W.HULL_HL - 4;
            if (blk) { const sd = this.x[i] >= L.x ? 1 : -1; dvx = sd * sp * 0.7; dvz = Math.max(0, -dz / d) * sp * 0.4; }   // the solid hull is behind it: peel off toward the nearer flank first
            else if (this.z[i] < L.z - 2.4 || Math.abs(this.x[i] - L.x) >= hb) { dvx = -dx / d * sp * 0.75; dvz = -dz / d * sp * 0.75; } else { dvx = (this.x[i] >= tx ? 1 : -1) * sp * 0.6; dvz = 0; } }   // ATTACK ranged: back off to preferred range, never through the tank, never past the rear boundary
          else if (d > rch) {
            dvx = dx / d * sp; dvz = dz / d * sp;
            // fan out toward open combat positions instead of queueing behind the unit in front
            if (d < rch + 4) { const fan = (((i * 0.6180339) % 1) - 0.5) * 0.9 * sp * Math.min(1, (d - rch) / 2); dvx += -dz / d * fan; dvz += dx / d * fan; }
          }
          else {
            if (adv < -0.4 && this.role[i] < 2) dvz = (team ? -1 : 1) * sp * 0.45 * (-adv - 0.4);   // losing strip gives ground while fighting
            if (hold && this.kind[i] !== 32) { const G = this.fg || (this.fg = [0, 0]); this.formGoal(i, G); const ox = G[0] - this.x[i], oz = G[1] - this.z[i], od = Math.hypot(ox, oz) || 1e-3; if (od > 0.3) { dvx = ox / od * sp * 0.5 * Math.min(1, od / 2.2); dvz = oz / od * sp * 0.5 * Math.min(1, od / 2.2); } dvz += vm; }   // the phalanx and the archers fight from their slots
            this.at[i] -= dt * (team ? 1 : S.atk) * sm;
            if (this.at[i] <= 0) { this.at[i] = this.cd[i] * (0.9 + this.rng() * 0.2); this.attack(i, tg, tx, tz, S); }
          }
        } else {
          // march with slight drift toward lane centre / formation cohesion
          if (team === 0 && defend) {
            // DEFEND: walk to the formation slot (gaps are re-assigned by formUpdate; arrival is weighty, never a teleport) and march with it
            const G = this.fg || (this.fg = [0, 0]); this.formGoal(i, G);
            const ox = G[0] - this.x[i], oz = G[1] - this.z[i], od = Math.sqrt(ox * ox + oz * oz) || 1e-3, ak = Math.min(1, od / 2.2);
            if (od > 0.3) { dvx = ox / od * sp * 1.15 * ak; dvz = oz / od * sp * 1.15 * ak; } dvz += vm; this.yaw[i] = od > 1.2 ? Math.atan2(dvx, dvz) : Math.PI;
          } else if (team === 0) {
            const hold = this.role[i] === 3 ? Math.min(L.z - 2.4, (this.armyZ != null ? this.armyZ : front - W.HOLD_DZ) + KM.rtech(S).gap + ((i * 0.3819) % 1) * 2) : front - W.HOLD_DZ - ((i * 0.3819) % 1) * 7;   // ATTACK: the ranged line follows the moving melee mass at its weapon's gap
            if (L.z - this.z[i] > COH) dvz = sp * 0.7; else if (this.z[i] > hold) dvz = -sp; else if (this.role[i] === 3 && this.z[i] < hold - 2) dvz = sp * 0.5;
            dvx = (L.x - this.x[i]) * 0.07 * sp; this.yaw[i] = dvz > 0 ? 0 : Math.PI; }   // ATTACK axis: straight ahead of the tank's lane position
          else if (this.grp[i] >= 0 && this.groups[this.grp[i]].st < 2) { const g = this.groups[this.grp[i]], gx = Math.max(-W.LANE, Math.min(W.LANE, g.cx + this.gox[i])), gz = g.z + this.goz[i], ox = gx - this.x[i], oz = gz - this.z[i];   // formation march: hold the slot
            dvx = Math.max(-sp, Math.min(sp, ox * 2)); dvz = g.v + Math.max(-sp, Math.min(sp, oz * 2)); this.yaw[i] = 0; }
          else { dvz = sp * (0.85 + ((i * 0.7548) % 1) * 0.3); dvx = Math.sin(this.t * 0.35 + i * 1.7) * 0.35 * sp - this.x[i] * 0.012 * sp; this.yaw[i] = Math.atan2(dvx, dvz); }   // uneven advance, gentle wander, centre bulge
        }
        }
        // steering (weighty, organic)
        const k = Math.min(1, dt * 7);
        this.vx[i] += (dvx - this.vx[i]) * k; this.vz[i] += (dvz - this.vz[i]) * k;
        // separation (crowd pressure) — same + opposite team
        this.separate(i, dt);
        this.x[i] += this.vx[i] * dt; this.z[i] += this.vz[i] * dt;
        if (!team && this.role[i] >= 3 && this.z[i] > L.z + 2) { this.z[i] = L.z + 2; if (this.vz[i] > 0) this.vz[i] = 0; }   // rear boundary: ranged/support never drift off behind the command group
        // flow around tower footprints (soft circular obstacles)
        for (let s = 0; s < this.towers.length; s++) { const t = this.towers[s]; if (!t) continue; const ox = this.x[i] - t.x, oz = this.z[i] - t.z, rr = 0.95 + this.rad[i], dd = ox * ox + oz * oz; if (dd < rr * rr && dd > 1e-6) { const d = Math.sqrt(dd), push = (rr - d); this.x[i] += ox / d * push; this.z[i] += oz / d * push * 0.6; } }
        if (this.x[i] < -W.LANE) this.x[i] = -W.LANE; else if (this.x[i] > W.LANE) this.x[i] = W.LANE;
        if (team) this.rearClamp(i); else this.hullClear(i);   // the command tank is the battlefield's rear boundary: enemies reach it, never pass it (last position write)
        const v = Math.abs(this.vx[i]) + Math.abs(this.vz[i]);
        this.phase[i] += dt * (2 + v * 2.3) * this.stride[i];
        if (team === 1) {
          if (this.z[i] > front + W.BREACH_DZ) { this.hurtLauncher(this.dmg[i] * 1.5 + 2, 'breach'); this.emit('breach', i); this.kill(i, true); if (!this.alive) return; }
        } else if (this.z[i] > front + 14 || this.z[i] < front - 95) this.kill(i, true);
      }
      this.nCol = nCol;
    }
    recount() { this.nKind.fill(0); let pts = 0; let zs = 0, xs = 0, n = 0; for (let i = 0; i < this.hi; i++) if (this.st[i] === ALIVE && !this.team[i]) { this.nKind[this.kind[i] - 32]++; pts += this.pt[i]; if (this.role[i] < 3) { zs += this.z[i]; xs += this.x[i]; n++; } } this.armyZ = n ? zs / n : this.L.z - 10; this.armyX = n ? xs / n : this.L.x; this.pts = pts; }   // armyZ: where the melee mass is

    // Boss / mini-boss mechanics: every one has a telegraphed move beyond "lots of HP".
    bossMech(i, dt, d) {
      if (!d.mech) return; this.mt[i] -= dt; const x = this.x[i], z = this.z[i];
      if (d.mech === 'hunt') { this.tgt[i] = -2; if (this.lDist(x, z) > 6) this.vz[i] += dt * 2; return; }                   // TANK HUNTER: goes for the command vehicle
      if (d.mech === 'summon') { if (this.mt[i] <= 0 && this.count[1] < W.MAX_ENEMY - 8) { this.mt[i] = 10; for (let k = 0; k < 8; k++) this.spawn(1, KM.ENEMY_BY.grunt, Math.max(-W.LANE, Math.min(W.LANE, x + Math.cos(k) * 3)), z - 2 + Math.sin(k) * 2, { hp: this.diff.hp, dmg: this.diff.dmg, spd: this.diff.speed }); this.emit('summon', i); } return; }
      if (this.mph[i] === 0 && this.mt[i] <= 0) { this.mph[i] = 1; this.mt[i] = d.mech === 'charge' ? 1.3 : 1.0; this.emit('bossTell', i, d.mech); return; }   // telegraph
      if (this.mph[i] === 1 && this.mt[i] <= 0) {
        if (d.mech === 'stomp') { const R = d.mini ? 3.6 : 5.2; this.src = 0; this.area(0, x, z, R, this.dmg[i] * 0.8, 0, z); this.shockwave(i, x, z, R, d.mini ? 10 : 15); this.emit('stomp', x, z, R); this.mph[i] = 0; this.mt[i] = d.mini ? 8 : 6; }
        else { this.mph[i] = 2; this.mt[i] = 1.6; this.emit('charge', i); }                                                       // LINE BREAKER dash
        return; }
      if (this.mph[i] === 2) { this.vz[i] = this.spd[i] * 3.2; this.vx[i] *= 0.9; if ((this.mt[i] * 10 | 0) % 3 === 0) this.shockwave(i, x, z + 1, d.rad + 1.2, 12);
        if (this.mt[i] <= 0) { this.mph[i] = 0; this.mt[i] = 7; } }
    }

    // ---------- DEFEND formation: front-anchored bands with stable slots ----------
    // From the front: Melee rank 1 (shield line) · Elite phalanx · Melee ranks 2..R (sword reserves) · Giants (brick) · Range · Mizard.
    // Neighbouring rows touch: pitch = the two collision radii + W.FORM_MARGIN, no era gaps. The shield rank stands at mid-field (W.DEF_FRONT_DZ) for a typical army, 8 m + depth for a tiny one, depth + 3.7 m for a very deep one
    // ahead of the tank (at least 8 m): the rear band's slots end 3.7 m ahead of it, so a unit resting anywhere within its 0.3 m
    // arrival tolerance still keeps the tank zone (3.4 m) free; only a very deep army reaches past mid-field. Melee keeps rank × column cells (rebuilt only when the melee count shifts, otherwise holes are filled
    // front-to-back from the nearest unit behind); every other band keeps a persistent slot per unit (slotBand). Classes ordered
    // to ATTACK leave their band (it collapses) but still count for the anchor, so the shield rank does not move with the orders.
    formUpdate(dt) {
      const F = this.form || (this.form = { t: 0, rb: 0, M: 0, C: 0, R: 0, owner: new Int32Array(4096).fill(-1), vt: new Float32Array(4096), list: [], press: new Float32Array(8),
        g: { 34: [], 37: [], 33: [], 36: [] }, mem: { 34: [], 37: [], 33: [], 36: [] }, band: { 34: { n: 0 }, 37: { n: 0 }, 33: { n: 0 }, 36: { n: 0 } }, nAll: {}, la: {}, lp: {}, gv: 0, zRef: 0 });
      if (this.posture !== 1) { F.M = 0; F.on = 0; F.gv = 0; this.emergency = 0; return; }
      const L = this.L;
      if (F.on && L.z !== F.zRef) { const sh = L.z - F.zRef; F.zRef = L.z; F.frontZ += sh; F.r2Z += sh; F.backZ += sh;   // between rebuilds the slots march with the war
        for (const k in F.band) if (F.band[k].n) F.band[k].z0 += sh; if (F.eliteZ != null) F.eliteZ += sh; if (F.giantZ != null) F.giantZ += sh; if (F.rangeZ != null) F.rangeZ += sh; if (F.medZ != null) F.medZ += sh; }
      F.t -= dt; F.rb -= dt; if (F.t > 0) return; F.t = 0.25;
      const ch = this.charge, list = F.list, mem = F.mem, nAll = F.nAll; list.length = 0; nAll[32] = 0;
      for (const k in mem) { mem[k].length = 0; nAll[k] = 0; }
      for (let i = 0; i < this.hi; i++) { if (this.st[i] !== ALIVE || this.team[i]) continue; const k = this.kind[i];
        if (k === 32) { if (this.role[i] < 3) { nAll[32]++; if (!ch.melee) list.push(i); } } else if (mem[k]) { nAll[k]++; if (!ch[this.typeOf(i)]) mem[k].push(i); } }
      // geometry: radii (evolved classes are 1.2× wider), widths, columns, row pitches
      const m = W.FORM_MARGIN, rOf = (key, kind) => KM.FRIEND[kind - 32].rad * (this.evolved(key) ? 1.2 : 1);
      const rm = rOf('melee', 32), re = rOf('elite', 34), rg = rOf('giant', 37), rr = rOf('range', 33), rz = rOf('mizard', 36);
      F.nw = F.on && F.nw != null && Math.abs(nAll[32] - F.nw) < Math.max(3, F.nw * 0.08) ? F.nw : nAll[32];   // width hysteresis: deaths and refills around a column threshold do not flip the band widths back and forth
      const M = list.length, evoM = this.evolved('melee') ? 1.55 : 1, wdt = Math.min(W.LANE - 0.6, 2.6 + Math.sqrt(Math.max(F.nw, 60)) * 0.42), hw = Math.min(W.LANE - 0.6, wdt + 1.5);
      const C = Math.max(4, Math.min(22, Math.round(wdt * 2 / (0.85 * evoM)))), R = Math.max(1, Math.ceil(M / C)), dz = 2 * rm + m;
      const pxE = Math.max(1.3, 2 * re + 0.06), CE = Math.max(1, Math.floor(2 * wdt / pxE + 1e-6)), pzE = 2 * re + m;                       // Elite: shields touching, as wide as the shield rank
      const pxG = 2 * rg + 0.15, CG = Math.max(1, Math.floor(2 * hw / pxG + 1e-6)), brick = CG >= 2, pzG = brick ? Math.sqrt((2 * rg + m) ** 2 - (pxG / 2) ** 2) : 2 * rg + m;   // Giants: staggered brick rows
      const pxR = Math.max(0.8, 2 * rr + 0.08), CR = Math.max(1, Math.floor(2 * hw / pxR + 1e-6)), pzR = 2 * rr + m, pxZ = Math.max(0.8, 2 * rz + 0.08), CZ = Math.max(1, Math.floor(2 * hw / pxZ + 1e-6)), pzZ = 2 * rz + m;
      const rows = (n, Cc, br) => { if (!n) return 0; if (!br) return Math.ceil(n / Cc); const p = 2 * Cc - 1, q = Math.floor(n / p), r = n - q * p; return 2 * q + (!r ? 0 : r <= Cc ? 1 : 2); };
      const reb = M > 0 && (!F.M || F.rb <= 0 || C !== F.C || Math.abs(M - F.M) > Math.max(3, F.M * 0.12)), RM = M ? (reb ? R : F.R) : 0;   // present melee rows = the cell grid
      // band offsets from the front row (rows touch: radius + radius + margin between neighbouring bands)
      const lay = (rM, nE, nG, nR, nZ, o) => { let z = -1, pr = 0;
        const put = (key, nRows, rad, pz) => { if (!nRows) { o[key] = null; return; } z = z < 0 ? 0 : z + pr + rad + m; o[key] = z; z += (nRows - 1) * pz; pr = rad; };
        put('m1', rM ? 1 : 0, rm, dz); put('e', rows(nE, CE), re, pzE); o.m2At = z < 0 ? 0 : z + pr + rm + m; put('m2', Math.max(0, rM - 1), rm, dz);
        put('g', rows(nG, CG, brick), rg, pzG); put('r', rows(nR, CR), rr, pzR); put('z', rows(nZ, CZ), rz, pzZ); o.depth = Math.max(0, z); return o; };
      const A = lay(Math.max(RM, Math.ceil(nAll[32] / C)), nAll[34], nAll[37], nAll[33], nAll[36], F.la), P = lay(RM, mem[34].length, mem[37].length, mem[33].length, mem[36].length, F.lp);
      // anchor: the shield rank at mid-field for a typical army; the rear band always ahead of the tank zone
      const dzA = A.depth + 3.4 + 0.3, combat = nAll[32] + nAll[34] + nAll[37] + nAll[33] > 0;
      const dzT = combat ? Math.max(dzA, Math.min(W.DEF_FRONT_DZ, 8 + A.depth)) : dzA;   // C1: a typical army holds its wall at mid-field (W.DEF_FRONT_DZ); a tiny one stays compact (8 m + its depth); a very deep one overflows upfield
      F.fdz = F.on && F.fdz != null && dzT <= F.fdz && dzT > F.fdz - 1.8 ? F.fdz : dzT;   // anchor hysteresis: a deeper army moves the wall up at once (the rear stays clear of the tank zone); losing up to a row of depth leaves it standing
      const frontDZ = F.fdz, frontZ = L.z - frontDZ, at = key => P[key] == null ? null : frontZ + P[key];
      F.on = 1; F.zRef = L.z; F.wdt = wdt; F.cx = W.LANE_CENTER_X; F.dz = dz; F.frontZ = frontZ; F.depth = A.depth; F.backZ = frontZ + P.depth; F.r2Z = frontZ + (P.m2 != null ? P.m2 : P.m2At);
      F.eliteZ = at('e'); F.giantZ = at('g'); F.rangeZ = at('r'); F.medZ = at('z');
      const BS = [[34, CE, pxE, pzE, 0, F.eliteZ, wdt], [37, CG, pxG, pzG, brick ? 1 : 0, F.giantZ, hw], [33, CR, pxR, pzR, 0, F.rangeZ, hw], [36, CZ, pxZ, pzZ, 0, F.medZ, hw]];
      for (const [k, Cc, px, pz, br, z0, h] of BS) { const B = F.band[k], mode = !F.gv ? 2 : B.C !== Cc || B.brick !== br ? 1 : 0;
        if (mode === 1) { const S = F.g[k], X = this.slX || (this.slX = new Float32Array(CAP)), Q = this.sp2 || (this.sp2 = [0, 0]); for (const i of mem[k]) { const q = this.fcol[i]; if (q >= 0 && q < B.n && S[q] === i) { this.bandPos(B, q, Q); X[i] = Q[0]; } else X[i] = this.x[i]; } }   // the old slot x, before the band changes
        B.n = mem[k].length; B.C = Cc; B.px = px; B.pz = pz; B.brick = br; B.z0 = z0; B.hw = h; B.cx = F.cx; this.slotBand(k, B, mem[k], mode); }
      F.gv = 1;
      // flank pressure (enemies just ahead of the line, 8 lateral bins)
      F.press.fill(0); for (let i = 0; i < this.hi; i++) if (this.st[i] === ALIVE && this.team[i] === 1 && this.z[i] > F.frontZ - 9 && this.z[i] < F.frontZ + 3) { const b = Math.max(0, Math.min(7, Math.floor((this.x[i] - F.cx + wdt) / (2 * wdt) * 8))); F.press[b]++; }
      for (let i = 0; i < this.hi; i++) if (this.st[i] === ALIVE && this.team[i] === 1 && !this.br[i] && this.z[i] > F.frontZ + 0.6 && this.z[i] < L.z + 2) { this.br[i] = 1; this.breaches++; }   // breach: an enemy got past the shield line
      { let alive = 0; const FC = F.C || C, rws = M ? Math.min(3, F.R || R) : 0; for (let k = 0; k < rws * FC; k++) { const o = F.owner[k]; if (o >= 0 && this.st[o] === ALIVE) alive++; }
        const em = rws && alive < rws * FC * 0.35 ? 1 : 0; if (em !== this.emergency) { this.emergency = em; if (em) this.emergencies = (this.emergencies || 0) + 1; this.emit('emergency', em); } }   // three-row collapse (recomputed even with no melee in the formation)
      let pb = 0; for (let b = 1; b < 8; b++) if (F.press[b] > F.press[pb]) pb = b; F.pressX = F.cx - wdt + (pb + 0.5) / 8 * 2 * wdt; F.pressN = F.press[pb];
      if (!M) { F.M = 0; return; }
      if (reb) {                                                                                     // full rebuild: one sort, O(M log M)
        F.rb = 6; F.C = C; F.R = R; F.M = M; F.owner.fill(-1, 0, R * C); F.vt.fill(0);
        list.sort((a, b) => this.z[a] - this.z[b]);
        for (let r = 0; r < R; r++) { const row = list.slice(r * C, (r + 1) * C).sort((a, b) => this.x[a] - this.x[b]), off = Math.floor((C - row.length) / 2);
          row.forEach((i, k) => { const c = off + k; F.owner[r * C + c] = i; this.frank[i] = r + 1; this.fcol[i] = c; }); }
      } else {                                                                                       // vacancy fill: nearest reserve steps up
        F.M = M;
        for (let r = 0; r < F.R - 1; r++) for (let c = 0; c < F.C; c++) { const cell = r * F.C + c, o = F.owner[cell]; if (o >= 0 && this.st[o] === ALIVE) continue; if (!F.vt[cell]) F.vt[cell] = this.t;
          let best = -1, bd = 1e9, bi = -1;
          for (let r2 = r + 1; r2 < Math.min(F.R, r + 3); r2++) for (let c2 = Math.max(0, c - 1); c2 <= Math.min(F.C - 1, c + 1); c2++) { const j = F.owner[r2 * F.C + c2]; if (j < 0 || this.st[j] !== ALIVE) continue; const d = (r2 - r) * 3 + Math.abs(c2 - c); if (d < bd) { bd = d; best = j; bi = r2 * F.C + c2; } }
          F.owner[r * F.C + c] = best; if (best >= 0) { F.owner[bi] = -1; this.frank[best] = r + 1; this.fcol[best] = c; this.fillN++; this.fillSum += this.t - F.vt[cell]; F.vt[cell] = 0; this.emit('gapfill', best); }
        }
      }
    }
    // Stable slots for one non-melee band: a unit keeps its slot index; the hole a death leaves is filled by the unit holding a
    // now out-of-range index, newcomers take the nearest free slots (mode 0). A column change re-packs in the old slot order (mode 1):
    // most units shift about half a pitch sideways, while those at the ends of a row that no longer fit drop into the next row near
    // its end on their side (several metres sideways when that row is a short partial one). Entering DEFEND, or a band forming from
    // nothing, packs by position, front to back (mode 2). Rows fill left to right by x. Never re-indexed by array order.
    slotBand(k, B, mem, mode) {
      const S = this.form.g[k], n = mem.length, old = S.length, P = this.sp2 || (this.sp2 = [0, 0]), nx = this.slNx || (this.slNx = new Int32Array(CAP)), mv = this.slMv || (this.slMv = []), hl = this.slH || (this.slH = []);
      if (!old) mode = 2;
      if (mode) { const key = this.slK || (this.slK = new Float64Array(CAP)), cs = this.slCs || (this.slCs = []), X = mode === 1 ? this.slX : this.x;
        for (const i of mem) { const s = this.fcol[i]; key[i] = mode === 1 && s >= 0 && s < old && S[s] === i ? s - 1e6 : this.z[i]; }   // mode 1: slotted units in slot order (and by old slot x within a row), then the rest front to back
        mem.sort((a, b) => key[a] - key[b] || a - b); S.length = n;
        for (let s = 0, r = 0; s < n; r++) { const size = B.brick && r % 2 ? B.C - 1 : B.C, sz = Math.min(n - s, size), row = mem.slice(s, s + sz).sort((a, b) => X[a] - X[b] || a - b);
          cs.length = sz; for (let c = 0; c < sz; c++) cs[c] = c; cs.sort((a, b) => slotCol(a, size) - slotCol(b, size));   // the row's slots in lattice order, left to right
          for (let q = 0; q < sz; q++) { S[s + cs[q]] = row[q]; this.fcol[row[q]] = s + cs[q]; } s += sz; }
        return; }
      mv.length = 0; nx.fill(-1, 0, n);
      for (const i of mem) { const s = this.fcol[i]; if (s >= 0 && s < old && S[s] === i && s < n) nx[s] = i; else mv.push(i); }
      hl.length = 0; for (let s = 0; s < n; s++) if (nx[s] < 0) hl.push(s);
      const place = i => { let bh = -1, bd = 1e18; for (let h = 0; h < hl.length; h++) { if (hl[h] < 0) continue; this.bandPos(B, hl[h], P); const d = (P[0] - this.x[i]) ** 2 + (P[1] - this.z[i]) ** 2; if (d < bd) { bd = d; bh = h; } } nx[hl[bh]] = i; this.fcol[i] = hl[bh]; hl[bh] = -1; };
      mv.sort((a, b) => (S[this.fcol[b]] === b ? this.fcol[b] : -1) - (S[this.fcol[a]] === a ? this.fcol[a] : -1) || a - b);   // out-of-range indices (last first), then newcomers
      for (const i of mv) place(i);
      S.length = n; for (let s = 0; s < n; s++) S[s] = nx[s];
    }
    // slot s of band B → world (x, z): rows run from the band's front toward the tank; brick bands alternate C / C−1 slots per row
    // shifted half a pitch. Slots map centre-out onto the row lattice, so the partial last row is centred (within half a pitch)
    // and an arrival or a death never shifts the units already standing in it.
    bandPos(B, s, out) {
      const C = B.C; let r, start, size = C;
      if (B.brick) { const p = 2 * C - 1, q = Math.floor(s / p); r = 2 * q; start = q * p; if (s - start >= C) { r++; start += C; size = C - 1; } }
      else { r = Math.floor(s / C); start = r * C; }
      const off = slotCol(s - start, size) - (size - 1) / 2;
      out[0] = Math.max(-W.LANE + 0.5, Math.min(W.LANE - 0.5, B.cx + off * B.px)); out[1] = B.z0 + r * B.pz;
    }
    stepGroups(dt) {                                                                                // FORMATION → IMPACT → BREAK → CHAOS
      const Gs = this.groups; let live = 0;
      for (let k = 0; k < Gs.length; k++) { const g = Gs[k]; if (!g) continue; if (g.alive <= 0 || g.st === 3) { Gs[k] = null; continue; } live++;
        if (g.st < 2) { g.z += g.v * dt; g.cx += ((this.armyX != null ? this.armyX : this.L.x) - g.cx) * Math.min(1, dt * 0.25); }   // the formation closes on the army's lane, it does not slip past it
        if (g.st === 1) { g.t += dt; if (g.t > 3.5 || g.alive < g.n0 * 0.72) { g.st = 2; this.emit('formBreak', k); } }
        else if (g.st === 2) { g.st = 3; for (let i = 0; i < this.hi; i++) if (this.grp[i] === k) this.grp[i] = -1; Gs[k] = null; } }
      if (!live && Gs.length > 64) Gs.length = 0;
    }
    formGoal(i, out) {                                                                               // where unit i stands in DEFEND
      const F = this.form, L = this.L, h = ((i * 0.6180339) % 1) * 2 - 1, kind = this.kind[i];
      if (!F || !F.on) { out[0] = L.x; out[1] = L.z - 6; return; }
      if (kind !== 32) { const B = F.band[kind], s = this.fcol[i];                                   // ELITE · GIANT · RANGE · MIZARD: the unit's own slot
        if (B && B.n && s >= 0 && s < B.n && F.g[kind][s] === i) return this.bandPos(B, s, out);
        out[0] = F.cx + h * (B ? B.hw : F.wdt) * 0.5; out[1] = B && B.n ? B.z0 : F.backZ; return; }   // not slotted yet (deployed since the last tick)
      if (!F.M) { out[0] = F.cx + h * F.wdt; out[1] = F.frontZ; return; }
      const r = this.frank[i] - 1, c = this.fcol[i]; if (r < 0 || r >= F.R) { out[0] = F.cx + h * F.wdt; out[1] = F.r2Z + Math.max(0, F.R - 1) * F.dz; return; }
      let x = F.cx - F.wdt + (c + 0.5) / F.C * 2 * F.wdt; if (r >= 2 && F.pressN > 2) x += Math.max(-1.6, Math.min(1.6, (F.pressX - x) * 0.35));   // reserves lean toward the threatened flank
      out[0] = Math.max(-W.LANE + 0.5, Math.min(W.LANE - 0.5, x)); out[1] = r ? F.r2Z + (r - 1) * F.dz : F.frontZ;   // rank 1 · (Elite band) · ranks 2..R
    }
    shieldWall(i) {                                                                                  // living shield neighbours in the front rank
      const F = this.form; if (!F || !F.M || this.frank[i] !== 1) return 0; const c = this.fcol[i]; let n = 0;
      for (const cc of [c - 1, c + 1]) { if (cc < 0 || cc >= F.C) continue; const j = F.owner[cc]; if (j >= 0 && this.st[j] === ALIVE) n++; } return n;
    }

    // Medic: triage → move to a safe spot behind the patient → heal on a cadence. Never resurrects; backs off from threats.
    // MIZARD: holds a rear slot (never runs into the fight) · heals by beam at range · charges an area burst on a fixed cadence.
    medic(i, dt, S) {
      const L = this.L, x = this.x[i], z = this.z[i], sp = this.spd[i] * (S.speed / 4.3), lv = S.cls.mizard, R = (9 + 0.6 * (lv - 1)) * (S.healR || 1);
      let gx, gz, inSlot = 0;
      if (this.posture === 1 && this.form && this.form.on) { const G = this.fg || (this.fg = [0, 0]); this.formGoal(i, G); gx = G[0]; gz = G[1]; inSlot = 1; }   // MIZARD slot: right behind the rearmost combat band
      else { gx = (this.armyX != null ? this.armyX : L.x) * 0.6 + ((i * 0.618) % 1 - 0.5) * 7; gz = Math.min(L.z - 1.8, (this.armyZ != null ? this.armyZ : L.z - 10) + KM.rtech(S).gap + 4); }
      if (this.nearestXZ(x, z, 1, 3) >= 0) { gx = L.x + ((i * 0.618) % 1 - 0.5) * 3; gz = L.z - 1.2; inSlot = 0; }   // threatened: step back to the tank, never toward the fight
      this.think[i] -= dt;
      if (this.think[i] <= 0) { this.think[i] = 0.35 + (i % 4) * 0.05; let best = -1, bs = 0; const c0 = this.cellX(x - R), c1 = this.cellX(x + R), r0 = this.cellZ(z - R), r1 = this.cellZ(z + R);
        for (let gz2 = r0; gz2 <= r1; gz2++) for (let gx2 = c0; gx2 <= c1; gx2++) for (let j = this.gh[(gz2 * GCOLS + gx2) * 2]; j >= 0; j = this.next[j]) {
          if (j === i || this.st[j] !== ALIVE || this.hp[j] >= this.mhp[j] * 0.95) continue; const dd = Math.hypot(this.x[j] - x, this.z[j] - z); if (dd > R) continue;
          const def = KM.FRIEND[this.kind[j] - 32], pri = (def.el || def.big ? 2.5 : def.col ? 1.4 : 1.2) * (1 - this.hp[j] / this.mhp[j]);
          if (pri > bs) { bs = pri; best = j; } }
        this.ctg[i] = best; }
      const p = this.ctg[i];
      if (p >= 0 && this.st[p] === ALIVE && Math.hypot(this.x[p] - x, this.z[p] - z) <= R) { this.at[i] -= dt; this.yaw[i] = Math.atan2(this.x[p] - x, this.z[p] - z);
        if (this.at[i] <= 0) { this.at[i] = this.cd[i]; const h = Math.min(this.mhp[p] - this.hp[p], S.medHeal); this.hp[p] += h; this.healed += h; this.swing[i] = 1; this.emit('beam', i, p, h); } }
      // area burst: energy fills on a fixed cadence (deterministic), then heals the most wounded allies around the beam target
      this.mt[i] -= dt;
      if (this.mt[i] <= 0) { this.mt[i] = Math.max(6, 12 - 0.4 * (lv - 1)); const cx = p >= 0 && this.st[p] === ALIVE ? this.x[p] : x, cz = p >= 0 && this.st[p] === ALIVE ? this.z[p] : z - 4, Rb = 3.5 + 0.45 * (lv - 1), N = 5 + (lv - 1), list = [];
        for (let j = 0; j < this.hi; j++) if (this.st[j] === ALIVE && !this.team[j] && this.hp[j] < this.mhp[j] && Math.hypot(this.x[j] - cx, this.z[j] - cz) <= Rb) list.push(j);
        list.sort((a, b) => this.hp[a] / this.mhp[a] - this.hp[b] / this.mhp[b]); let n = 0;
        for (const j of list.slice(0, N)) { const h = Math.min(this.mhp[j] - this.hp[j], S.medHeal * 2.5); this.hp[j] += h; this.healed += h; n++; }
        this.emit('healBurst', cx, cz, Rb, n); }
      const dx = gx - x, dz = gz - z, d = Math.sqrt(dx * dx + dz * dz) || 1e-3, s2 = d > 0.3 ? sp * Math.min(1, d / 1.4) : 0;
      this.cvx = dx / d * s2; this.cvz = dz / d * s2 + (inSlot && !this.nBoss ? -W.ADV : 0); if (!(p >= 0)) this.yaw[i] = d > 0.5 ? Math.atan2(dx, dz) : Math.PI;   // a slotted Mizard marches with the formation
    }

    // Collector: find a coin beyond the tank's magnet (inside a retrieval radius, not near enemies, not claimed) → carry → return → deposit.
    // Currency only counts once deposited; a collector killed on the way drops half its load.
    // LOOTER (automatic): 1) loot dropped coins and carry them home · 2) repair the tank when it is badly damaged ·
    // 3) knife self-defense when enemies break through to them or to the tank. ALL ATTACK sends them into the assault instead.
    collector(i, dt, S) {
      const L = this.L, C = this.c, x = this.x[i], z = this.z[i], sp = this.spd[i] * (S.speed / 4.3), cap = S.colCap, RR = 17, mg = S.magnet;
      let gx = L.x + (L.x > W.LANE - 3 ? -1 : 1) * (W.HULL_HW + this.rad[i] + W.FORM_CLEAR + 0.02), gz = L.z - 0.4, run = 0.75;   // home: against the tank's flank (outside its solid hull, in reach to bank)
      this.repairing[i] = 0;
      // self / rear defense: an enemy at arm's length, or one hitting the tank close by
      let foe = this.nearestEdge(x, z, 1, 2.4); if (foe < 0 && this.lDist(x, z) < 4) { const t = this.nearestEdge(L.x, L.z, 1, TANK_TOUCH); if (t >= 0) foe = t; }   // footprint edges: a boss striking the tank counts
      if (foe >= 0) {
        const dx = this.x[foe] - x, dz = this.z[foe] - z, d = Math.sqrt(dx * dx + dz * dz) || 1e-3, reach = this.rng_[i] + this.rad[i] + this.rad[foe];
        this.ctg[i] = -1; this.yaw[i] = Math.atan2(dx, dz);
        if (d > reach) { this.cvx = dx / d * sp; this.cvz = dz / d * sp; return; }
        this.cvx = this.cvz = 0; this.at[i] -= dt * S.atk;
        if (this.at[i] <= 0) { this.at[i] = this.cd[i] * (0.9 + this.rng() * 0.2); this.attack(i, foe, this.x[foe], this.z[foe], S); }
        return;
      }
      const threat = this.nearestXZ(x, z, 1, 3.2) >= 0;
      if (this.ctg[i] >= 0 && C.st[this.ctg[i]] !== 1) this.ctg[i] = -1;
      this.think[i] -= dt;
      if (!threat && this.carry[i] < cap && this.ctg[i] < 0 && this.think[i] <= 0) {
        this.think[i] = 0.35 + (i % 5) * 0.05; let best = -1, bs = 0;
        for (let k = 0; k < C.x.length; k++) { if (C.st[k] !== 1 || C.age[k] < 0.4) continue;
          const lx = C.x[k] - L.x, lz = C.z[k] - L.z, ld = lx * lx + lz * lz; if (ld < mg * mg * 1.1 || ld > RR * RR) continue;
          let taken = false; for (const j of this.colList) if (j !== i && this.ctg[j] === k) { taken = true; break; } if (taken) continue;
          const dx = C.x[k] - x, dz = C.z[k] - z, sc = C.v[k] / (Math.sqrt(dx * dx + dz * dz) + 2);
          if (sc > bs && this.nearestXZ(C.x[k], C.z[k], 1, 3.6) < 0) { bs = sc; best = k; } }
        this.ctg[i] = best;
      }
      const k = this.ctg[i];
      if (threat) this.ctg[i] = -1;                                                    // pressure: drop the run, head home
      else if (k >= 0 && this.carry[i] < cap) { gx = C.x[k]; gz = C.z[k]; run = 1;
        if (Math.abs(C.x[k] - x) < 0.7 && Math.abs(C.z[k] - z) < 0.7) { this.carry[i] += C.v[k]; C.st[k] = 0; this.ctg[i] = -1; this.emit('pickup', i, C.v[k]); } }
      // nothing to loot and nothing carried: repair a meaningfully damaged tank (from 75% HP until 92%)
      const hpF = L.hp / S.maxHp; if (hpF < 0.75) this.repairOn = 1; else if (hpF > 0.92) this.repairOn = 0;
      if (k < 0 && !this.carry[i] && this.repairOn && this.nRepair < 6 && this.alive) {
        const off = W.HULL_HW + this.rad[i] + W.FORM_CLEAR + 0.05; let sd = i % 2 ? 1 : -1; if (Math.abs(L.x + sd * off) > W.LANE - this.rad[i]) sd = -sd;   // repair from a hull flank inside the lane (the hull is solid)
        gx = L.x + sd * off; gz = L.z + 0.2; run = 1; this.nRepair++;
        if (Math.hypot(gx - x, gz - z) < 0.9) { this.repairing[i] = 1; const h = S.maxHp * 0.0025 * (1 + 0.1 * (S.cls.collector - 1)) * dt; this.heal(h); this.repaired += h; this.swing[i] = this.swing[i] > 0 ? this.swing[i] : 1; if ((this.stepN + i) % 40 === 0) this.emit('repair', i); }
      }
      const dx = gx - x, dz = gz - z, d = Math.sqrt(dx * dx + dz * dz) || 1e-3;
      if (this.carry[i] > 0 && this.hullDist(i) < this.rad[i] + W.FORM_CLEAR + 0.05) { const v = this.carry[i]; this.carry[i] = 0; this.coins += v; this.coinsTotal += v; this.colCoins += v; this.emit('coin', v); this.emit('deposit', i, v); }
      const s2 = d > 0.3 ? sp * run * Math.min(1, d / 1.5) : 0; this.cvx = dx / d * s2; this.cvz = dz / d * s2; this.yaw[i] = this.repairing[i] ? Math.atan2(L.x - x, L.z - z) : Math.atan2(dx, dz);
    }

    holdsSlot(j) { return this.role[j] === 3 ? !this.charge.range : this.kind[j] === 34 && !this.charge.elite; }   // DEFEND: the archer rows and the Elite phalanx hold their slots
    separate(i, dt) {
      const x = this.x[i], z = this.z[i], ri = this.rad[i], ki = this.kind[i], df = this.team[i] === 0 && this.posture === 1, hi = df && this.holdsSlot(i);
      const gx = this.cellX(x), gz = this.cellZ(z);
      let px = 0, pz = 0, n = 0, seen = 0;
      outer: for (let cz = gz - 1; cz <= gz + 1; cz++) { if (cz < 0 || cz >= GROWS) continue;
        for (let cx = gx - 1; cx <= gx + 1; cx++) { if (cx < 0 || cx >= GCOLS) continue;
          const base = (cz * GCOLS + cx) * 2;
          for (let t = 0; t < 2; t++) for (let j = this.gh[base + t]; j >= 0; j = this.next[j]) {
            if (j === i) continue;
            if (++seen > 28) break outer; // bounded work per unit even inside a dense pile
            const opp = t !== this.team[i], rr = (ri + this.rad[j]) * (opp ? 1 - (this.mi || 0) * (this.role[i] === 2 ? 0.55 : 0.42) : 1), dx = x - this.x[j], dz = z - this.z[j], dd = dx * dx + dz * dz;
            if (dd >= rr * rr || dd < 1e-6) continue;
            const d = Math.sqrt(dd), o = (rr - d) / rr, w = this.rad[j] / (ri + this.rad[j]) * 2 * (df && !opp && this.kind[j] !== ki && (hi || this.holdsSlot(j)) ? 0.15 : 1);   // files open: another class passes softly through a holding band (no shoving the rows apart, no blocking the way)
            px += dx / d * o * w; pz += dz / d * o * w; if (++n > 10) break outer;
          }
        }
      }
      this.x[i] += px * dt * 9; this.z[i] += pz * dt * 9;
    }

    attack(i, tg, tx, tz, S) {
      const d = this.def(i);
      if (d.ex) { this.kill(i); return; }                            // bomber: explode on contact
      if (this.pend[i] !== -1) this.strike(i, S);                    // very fast attackers: resolve the previous blow first
      this.swing[i] = 1; this.pend[i] = tg;                          // damage resolves in strike() at the hit frame
    }

    strike(i, S) {
      const d = this.def(i), team = this.team[i];
      let tg = this.pend[i]; this.pend[i] = -1;
      if (tg >= 0 && this.st[tg] !== ALIVE) { tg = this.nearest(i, this.rng_[i] + this.rad[i] + 1.2); if (tg < 0) { this.emit('whiff', i); return; } }
      if (tg === -2 && !this.alive) return;
      const so = tg <= -10 ? this.structAt(tg) : null; if (tg <= -10 && !so) return;
      const tx = so ? so.x : tg === -2 ? this.L.x : this.x[tg], tz = so ? so.z : tg === -2 ? this.L.z : this.z[tg];
      let dmg = this.dmg[i], crit = false;
      if (team === 0) { const ck = KM.CLASS_OF[this.kind[i]]; dmg = S.dmg * d.dmg * (this.merc[i] ? 1 : this.clsM(ck, S.cls[ck]).dmg) * (this.evo[i] ? 1.2 : 1); if (this.rng() < S.crit) { dmg *= 2; crit = true; } }
      if (d.he) { // shaman heals nearby enemies, then casts
        for (let j = 0; j < this.hi; j++) if (this.st[j] === ALIVE && this.team[j] === 1 && j !== i) { const dx = this.x[j] - this.x[i], dz = this.z[j] - this.z[i]; if (dx * dx + dz * dz < 16) this.hp[j] = Math.min(this.mhp[j], this.hp[j] + d.he * this.cd[i]); }
        this.emit('heal', i);
      }
      if (d.r) {
        let kind = d.wpn === 'cannon' ? 1 : d.wpn === 'staff' ? 3 : 0, speed = kind === 1 ? 11 : 18;
        if (team === 0) { const T = KM.rtech(S); kind = 12; speed = T.speed; dmg *= T.dmg * S.rdmg; }   // friendly ranged: always arrows (bow tier sets speed / damage)
        let ex = tx, ez = tz;
        if (tg >= 0) { const tof = Math.hypot(tx - this.x[i], tz - this.z[i]) / speed; ex += this.vx[tg] * tof; ez += this.vz[tg] * tof; }
        this.fire(team, this.x[i], this.z[i], tg, ex, ez, dmg, kind, d.s || 0, 0, speed, crit, 1);
        return;
      }
      this.src = 0;
      if (tg === -2) { this.hurtLauncher(dmg, KM.ENEMY[this.kind[i]].k); return; }
      if (so) { this.hurtStruct(tg, dmg * (d.el ? 1.6 : 1)); this.emit('hit', i, -1, false); return; }
      if (team === 0 && this.kind[i] === 34 && this.posture === 1 && !this.charge.elite) { if (tg >= 0) this.pikePush(tg); }   // DEFEND Elite: a straight pike thrust, never a radial shove
      else if (d.el || d.sc >= 1.3 || d.wpn === 'axe') this.shockwave(i, tx, tz, d.boss ? 2.6 : d.el ? 2.0 : 1.3, d.boss ? 9 : d.el ? 7 : 4.5);
      if (d.s) { this.area(1 - team, tx, tz, d.s, dmg, 0, this.z[i]); this.emit('cleave', i); }
      else this.hurt(tg, dmg, team, this.z[i], crit);
      this.emit('hit', i, tg, crit);
    }

    // Elite phalanx pike hit: a bounded, deterministic push straight upfield (−z only, never sideways or toward the tank):
    // ordinary foes give 0.25 m and lose half their momentum, minis / elites barely move, bosses hardly at all
    pikePush(tg) {
      const e = KM.ENEMY[this.kind[tg]], k = e.boss ? 0.15 : e.mini || this.elite[tg] ? 0.35 : 1;
      this.z[tg] -= 0.25 * k; this.vz[tg] *= 1 - 0.5 * k; this.emit('pike', tg, 0.25 * k);
    }

    stepTowers(dt, S) {
      const m = this.t / 60;
      for (let s = 0; s < this.towers.length; s++) {
        const t = this.towers[s]; if (!t) continue;
        // drive to the formation slot beside/ahead of the command tank (weighty, never through the melee)
        const slot = KM.TOWER_SLOTS[s], gx = Math.max(-W.LANE + 0.8, Math.min(W.LANE - 0.8, this.L.x + slot.x)), gz = this.L.z + slot.dz;
        const px = t.x; t.x += (gx - t.x) * Math.min(1, dt * 2.6); t.z += (gz - t.z) * Math.min(1, dt * 3.2); t.vx = (t.x - px) / Math.max(dt, 1e-4); t.born += dt;
        if (t.down > 0) continue;
        t.recoil = Math.max(0, t.recoil - dt * 4);
        const T = KM.TOWERS[t.type], lv = t.lvl;
        t.cd -= dt * S.towerRate * (1 + 0.15 * (lv - 1));
        if (t.type === 'carrier') {
          if (t.cd <= 0) { t.cd = T.cd / (1 + 0.25 * (lv - 1)) / S.carrierRate; for (let k = 0; k < 1 + Math.floor(lv / 2) && this.pts + KM.unitPts('melee', this.evolved('melee')) <= S.cap; k++) {   /* carriers share the army points */ const j = this.makeSoldier('melee', t.x - Math.sign(t.x) * 1.2, t.z - 0.5, 0.0001); if (j >= 0) { this.vx[j] = -Math.sign(t.x) * 2; this.emit('deploy', j); } } t.recoil = 1; this.emit('tower', t); }
          continue;
        }
        if (t.cd > 0) continue;
        // target selection: L3+ gun carriers pick the toughest enemy (precision), others the most advanced
        const R = T.range * S.towerRange * (1 + 0.08 * (lv - 1)); let best = -1, score = -1e9;
        for (let i = 0; i < this.hi; i++) {
          if (this.st[i] !== ALIVE || this.team[i] !== 1) continue;
          const dx = this.x[i] - t.x, dz = this.z[i] - t.z; if (dx * dx + dz * dz > R * R) continue;
          const sc = t.type === 'gun' && lv >= 3 ? this.mhp[i] + this.elite[i] * 1e4 : this.z[i];
          if (sc > score) { score = sc; best = i; }
        }
        if (best < 0) { t.cd = 0.15; continue; }
        t.cd = T.cd; t.recoil = 1; t.tgt = best;
        const tx = this.x[best], tz = this.z[best]; t.aim = Math.atan2(tx - t.x, tz - t.z);
        let dmg = T.dmg * S.towerDmg * (1 + 0.45 * (lv - 1)); const tcrit = t.type === 'gun' && this.rng() < S.gunCrit; if (tcrit) dmg *= 2.5; const speed = t.type === 'artillery' ? 13 : t.type === 'gun' ? 46 : 24;
        const tof = Math.hypot(tx - t.x, tz - t.z) / speed;
        const kind = t.type === 'artillery' ? 1 : t.type === 'frost' ? 2 : 4;
        const shots = t.type === 'gun' ? 1 + Math.floor((lv - 1) / 2) : 1;
        for (let k = 0; k < shots; k++) this.fire(0, t.x, t.z, best, tx + this.vx[best] * tof + (k ? (this.rng() - 0.5) * 1.5 : 0), tz + this.vz[best] * tof, dmg, kind, T.splash ? T.splash * (1 + 0.1 * (lv - 1)) * S.splash : 0, T.slow ? (T.slow + 0.3 * lv) * S.frost : 0, speed, tcrit, 3);
        this.emit('tower', t);
      }
    }

    // ---------- cannon lane shells ----------
    // The first enemy of team ot a lane shell at x meets while flying from za back to zb (za > zb): footprint-aware, i.e.
    // |dx| < TANK_LANE + ft and z within [zb - ft, za + ft]; the first in its path (largest z) wins, ties → lowest index.
    // The grid is built at step start, so the scan is padded by the largest footprint fmax plus 1 m of movement.
    laneTarget(x, ot, za, zb, fmax) {
      const hw = W.TANK_LANE, pad = fmax + 1, c0 = this.cellX(x - hw - pad), c1 = this.cellX(x + hw + pad), r0 = this.cellZ(zb - pad), r1 = this.cellZ(za + pad);
      let best = -1, bz = -Infinity;
      for (let gz = r0; gz <= r1; gz++) for (let gx = c0; gx <= c1; gx++) for (let j = this.gh[(gz * GCOLS + gx) * 2 + ot]; j >= 0; j = this.next[j]) {
        if (this.st[j] !== ALIVE) continue; const f = this.ft[j], zj = this.z[j], dx = this.x[j] - x;
        if (dx >= hw + f || dx <= -hw - f || zj < zb - f || zj > za + f) continue;
        if (zj > bz || (zj === bz && j < best)) { bz = zj; best = j; } }
      return best;
    }
    maxFoot(team) { let m = 0; for (let i = 0; i < this.hi; i++) if (this.st[i] === ALIVE && this.team[i] === team && this.ft[i] > m) m = this.ft[i]; return m; }
    // A lane shell strikes enemy j: the usual shell resolution at the struck enemy. HE splash detonates there; otherwise a
    // direct hit, and PENETRATION carries on straight down the lane (-z) through the next enemies in line.
    laneHit(j, x, team, dmg, kind, spl, slow, pen, srcZ) {
      const hx = this.x[j], hz = this.z[j], ot = 1 - team;
      if (spl > 0) { this.area(ot, hx, hz, spl, dmg, slow, srcZ); this.emit('impact', kind, hx, hz, spl); return; }
      this.hurt(j, dmg, team, srcZ, false); this.emit('impact', kind, hx, hz, 0);
      if (pen) { let pz = hz; const hit = [j];
        for (let n = 0; n < pen; n++) { pz -= 1.3; const q = this.nearestXZ(x, pz, ot, 1.2); if (q < 0 || hit.includes(q)) break; hit.push(q); this.hurt(q, dmg * 0.75, team, srcZ, false); } }
    }

    stepProjectiles(dt) {
      const P = this.p; let fmax = -1;
      for (let k = 0; k < PCAP; k++) {
        if (!P.on[k]) continue;
        const zPrev = P.t[k] > 0 ? P.z[k] : this.L.z + W.REAR_DZ;   // a fresh lane shell sweeps from the tank's rear plane: attackers pressed on the hull are in its lane too
        P.t[k] += dt; const u = Math.min(1, P.t[k] / P.tof[k]);
        P.x[k] = P.sx[k] + (P.ex[k] - P.sx[k]) * u; P.z[k] = P.sz[k] + (P.ez[k] - P.sz[k]) * u;
        if (P.lane[k]) {   // cannon shell: the first enemy in its lane on the stretch flown this step takes the hit; at full range it fizzles
          if (fmax < 0) fmax = this.maxFoot(1 - P.team[k]);
          const j = this.laneTarget(P.x[k], 1 - P.team[k], zPrev, P.z[k], fmax);
          if (j >= 0) { P.on[k] = 0; this.src = P.src[k]; this.laneHit(j, P.x[k], P.team[k], P.dmg[k], P.kind[k], P.spl[k], P.slow[k], P.pen[k], P.sz[k]); if (!this.alive) return; }
          else if (u >= 1) { P.on[k] = 0; this.emit('tankExpire', P.kind[k], P.x[k], P.ez[k]); }
          continue;
        }
        if (u < 1) continue;
        P.on[k] = 0;
        const team = P.team[k], tg = P.tgt[k]; this.src = P.src[k];
        if (P.spl[k] > 0) { this.area(1 - team, P.ex[k], P.ez[k], P.spl[k], P.dmg[k], P.slow[k], P.sz[k]); if (team === 1 && this.lDist(P.ex[k], P.ez[k]) < P.spl[k] + 0.8) this.hurtLauncher(P.dmg[k] * 0.7, 'siege'); this.emit('impact', P.kind[k], P.ex[k], P.ez[k], P.spl[k]); }
        else if (tg === -2) { if (this.lDist(P.ex[k], P.ez[k]) < 2.2) this.hurtLauncher(P.dmg[k], 'ranged'); }
        else if (tg <= -10) this.hurtStruct(tg, P.dmg[k]);
        else if (tg >= 0 && this.st[tg] === ALIVE) {
          const dx = this.x[tg] - P.ex[k], dz = this.z[tg] - P.ez[k];
          if (dx * dx + dz * dz < 2.5) { this.hurt(tg, P.dmg[k], team, P.sz[k], !!P.crit[k]); this.emit('impact', P.kind[k], P.ex[k], P.ez[k], 0);
            if (P.pen[k]) { let px = P.ex[k], pz = P.ez[k]; const ux = (P.ex[k] - P.sx[k]), uz = (P.ez[k] - P.sz[k]), ul = Math.hypot(ux, uz) || 1; const hit = new Set([tg]);   // PENETRATION: carry on through the line
              for (let n = 0; n < P.pen[k]; n++) { px += ux / ul * 1.3; pz += uz / ul * 1.3; const j = this.nearestXZ(px, pz, 1 - team, 1.2); if (j < 0 || hit.has(j)) break; hit.add(j); this.hurt(j, P.dmg[k] * 0.75, team, P.sz[k], false); } }
            if (P.kind[k] === 22) { if (this.st[tg] === ALIVE) { this.vz[tg] -= 5; this.flash[tg] = 1; this.think[tg] = 0.4; }   // impale: heavy stagger + knockback
              const j = this.nearestXZ(P.ex[k], P.ez[k] - 0.8, 1 - team, 1.5); if (j >= 0 && j !== tg) { this.hurt(j, P.dmg[k] * 0.6, team, P.sz[k], false); this.vz[j] -= 3; } this.emit('impale', P.ex[k], P.ez[k]); } }
          else { const j = this.nearest(tg, 1.2); if (j >= 0 && this.team[j] !== team) this.hurt(j, P.dmg[k], team, P.sz[k], false); }
        }
        if (!this.alive) return;
      }
    }

    stepCoins(dt, S) {
      const C = this.c, L = this.L, mg = S.magnet, mg2 = mg * mg;
      for (let k = 0; k < CCAP; k++) {
        const st = C.st[k]; if (!st) continue;
        C.age[k] += dt;
        if (st === 1) {
          if (C.vy[k] !== 0 || C.y[k] > 0.25) { C.vy[k] -= 18 * dt; C.y[k] += C.vy[k] * dt; C.x[k] += C.dx[k] * dt; C.z[k] += C.dz[k] * dt; if (C.y[k] <= 0.25) { C.y[k] = 0.25; C.vy[k] = 0; } }
          const dx = L.x - C.x[k], dz = L.z - C.z[k];
          if (dx * dx + dz * dz < mg2 && C.age[k] > 0.3) { C.st[k] = 2; C.age[k] = 0; }
          else if (C.age[k] > 22 || C.z[k] > this.front + 12) C.st[k] = 0;
        } else {
          const dx = L.x - C.x[k], dz = L.z - C.z[k], d = Math.sqrt(dx * dx + dz * dz), sp = 8 + C.age[k] * 40;
          if (d < 0.5) { C.st[k] = 0; this.coins += C.v[k]; this.coinsTotal += C.v[k]; this.emit('coin', C.v[k]); continue; }
          C.x[k] += dx / d * Math.min(d, sp * dt); C.z[k] += dz / d * Math.min(d, sp * dt); C.y[k] += (1.2 - C.y[k]) * Math.min(1, dt * 10);
        }
      }
    }

    stepDying(dt) {
      if (!this.dying) return;
      for (let i = 0; i < this.hi; i++) if (this.st[i] === DYING) { this.die[i] += dt; this.x[i] += this.vx[i] * dt * 0.3; this.z[i] += this.vz[i] * dt * 0.3; if (this.team[i] === 1) this.rearClamp(i); if (this.die[i] > 0.7) { this.dying--; this.free(i); } }   // enemy corpses never slide behind the tank either
    }
    stepFx() {}

    // ---------- results ----------
    // ---------- one-slot autosave: the meaningful run state (not every body). The army is rebuilt by kind around the tank. ----------
    snapshot() {
      const L = this.L, keys = ['t', 'front', 'coins', 'coinsTotal', 'kills', 'peakArmy', 'upgrades', 'budget', 'overflow', 'bossN', 'sector', 'seenSector', 'wave', 'wState', 'energy', 'bossesKilled', 'warTokens', 'pboost', 'emergencies', 'posture', 'prod', 'auto',
        'dmgBy', 'healed', 'shAbsorbed', 'colCoins', 'colLost', 'killsByKind', 'spawnCounter', 'charge'], o = { v: 1, seed: this.seed };
      for (const k of keys) o[k] = this[k];
      o.stats = this.stats; o.L = { x: L.x, tx: L.tx, hp: L.hp, sh: L.sh, shMax: L.shMax, shDown: L.shDown };
      o.army = Array.from(this.nKind.slice(0, KM.FRIEND.length)); o.towers = this.towers.map(t => t && { type: t.type, lvl: t.lvl, hp: t.hp, down: t.down || 0 });
      return JSON.parse(JSON.stringify(o));
    }
    restore(o) {
      if (!o || o.v !== 1 || !(o.t > 0) || !o.stats || !Array.isArray(o.army)) throw new Error('bad snapshot');
      this.reset({ seed: (o.seed ^ Math.floor(o.t * 977)) >>> 0 });
      const { stats, L, army, towers } = o; delete o.stats; delete o.L; delete o.army; delete o.towers; delete o.v; delete o.seed;
      Object.assign(this.stats, stats); for (const k in o) if (k in this || k === 'auto') this[k] = o[k]; this.charge = Object.assign({ collector: 0, range: 0, melee: 0, elite: 0, giant: 0 }, this.charge);
      if (this.wave && this.wState === 1) this.wave -= 1; this.wState = 0; this.wGap = 2.5; this.choice = null; Object.assign(this.L, L); this.L.z = this.front; this.diff = KM.difficulty(this.t);
      towers.forEach((t, s) => { if (t && KM.TOWERS[t.type]) { const T = this.makeTower(t.type, t.lvl, s); T.hp = Math.min(T.mhp, t.hp); T.down = t.down; this.towers[s] = T; } });
      const S = this.stats; let n = 0;
      this.classStats(); army.forEach((cnt, k) => { const key = KM.CLASS_OF[32 + k]; if (!key) return; for (let q = 0; q < cnt && n < S.cap * 2; q++, n++)
        this.makeSoldier(key, Math.max(-W.LANE + 1, Math.min(W.LANE - 1, this.L.x + (this.rng() - 0.5) * 12)), this.L.z - 3 - this.rng() * 10, 0); });
      this.formT = 2; this.ups = null; this.rollUps(); this.recount();
    }

    results() {
      return { time: this.t, kills: this.kills, coins: Math.floor(this.coinsTotal), peakArmy: this.peakArmy, distance: Math.floor(this.distance), wave: this.wave, bosses: this.bossesKilled, warTokens: this.warTokens, armyDev: Object.values(this.stats.cls).reduce((a, b) => a + b, 0), reason: this.deathReason, upgrades: this.upgrades };
    }
    activeCount() { let n = 0; for (let i = 0; i < this.hi; i++) if (this.st[i] !== DEAD) n++; return n; }
  }
  // Battle-shape metrics (tests + debug): per-zone contact fronts, their spread, and how intermixed the armies are.
  KM.meleeMetrics = function (sim) {
    const Z = 8, fz = new Array(Z).fill(0), fn = new Array(Z).fill(0), ez = new Array(Z).fill(0), en = new Array(Z).fill(0);
    const zi = x => Math.max(0, Math.min(Z - 1, Math.floor((x + W.LANE) / (2 * W.LANE) * Z)));
    // front of each army per zone = its most advanced quartile (blue moves -z, red +z)
    const byZone = [[], []].map(() => Array.from({ length: Z }, () => []));
    for (let i = 0; i < sim.hi; i++) if (sim.st[i] === ALIVE) byZone[sim.team[i]][zi(sim.x[i])].push(sim.z[i]);
    const fronts = []; for (let k = 0; k < Z; k++) { const b = byZone[0][k].sort((a, c) => a - c), r = byZone[1][k].sort((a, c) => c - a); if (b.length < 4 || r.length < 4) continue; fronts.push((b[Math.floor(b.length * 0.15)] + r[Math.floor(r.length * 0.15)]) / 2); }
    const spread = fronts.length > 1 ? Math.max(...fronts) - Math.min(...fronts) : 0;
    // mixing: units in the contact band with ≥2 of their 6 nearest neighbours from the other army
    let band = 0, mixed = 0, pen = 0; const mean = fronts.length ? fronts.reduce((a, c) => a + c, 0) / fronts.length : 0;
    for (let i = 0; i < sim.hi; i++) { if (sim.st[i] !== ALIVE || Math.abs(sim.z[i] - mean) > 7) continue; band++;
      const nb = []; for (let j = 0; j < sim.hi; j++) { if (j === i || sim.st[j] !== ALIVE) continue; const dx = sim.x[j] - sim.x[i], dz = sim.z[j] - sim.z[i], d = dx * dx + dz * dz; if (d < 9) nb.push([d, sim.team[j]]); }
      nb.sort((a, c) => a[0] - c[0]); const opp = nb.slice(0, 6).filter(n => n[1] !== sim.team[i]).length; if (opp >= 2) mixed++;
      if (sim.team[i] === 0 ? sim.z[i] < mean - 2.5 : sim.z[i] > mean + 2.5) pen++; }      // units deep on the enemy side of the front
    return { zones: fronts.length, fronts: fronts.map(f => +(f - mean).toFixed(1)), spread: +spread.toFixed(2), band, mixing: band ? +(mixed / band).toFixed(3) : 0, penetrated: band ? +(pen / band).toFixed(3) : 0 };
  };
  // grid pads for footprint-edge queries: the largest enemy ground footprint / collision radius (+5% size variation)
  const FT_PAD = KM.ENEMY.reduce((a, e) => Math.max(a, KM.footOf(e, e.rad, e.sc * 1.05)), 0), RAD_PAD = KM.ENEMY.reduce((a, e) => Math.max(a, e.rad), 0);
  const PROT_MELEE = 3, PROT_GIANT = 4;   // DEFEND local intercept: footprint edge within this of the defender's own slot
  // lattice column of the c-th slot of a band row with `size` columns: centre-out (middle, right of it, left of it, …), so a partly
  // filled row is a centred block and a row filling up or thinning out never moves the units already in it
  const slotCol = (c, size) => Math.floor((size - 1) / 2) + (c & 1 ? (c + 1) >> 1 : -(c >> 1));
  const TANK_TOUCH = W.HULL_HL + 2.2;       // a footprint edge this close to the tank centre is striking it (longest enemy reach 2.4 + contact pad)
  Sim.CAP = CAP; Sim.PCAP = PCAP; Sim.CCAP = CCAP; Sim.ALIVE = ALIVE; Sim.DYING = DYING;
  KM.Sim = Sim;

  // Simple autopilot used by tests, soak and the debug "bot" toggle: hover behind the army, dart for nearby coins.
  KM.bot = function (sim, dt, skill) {
    skill = skill == null ? 1 : skill;
    const L = sim.L, C = sim.c; let best = -1, bs = 1e9;
    for (let k = 0; k < C.x.length; k++) if (C.st[k] === 1) { const dz = C.z[k] - sim.front; if (dz < -12 * skill) continue; const s = Math.abs(C.x[k] - L.x) + Math.abs(dz) * 0.5; if (s < bs) { bs = s; best = k; } }
    let near = 0; for (let i = 0; i < sim.hi; i++) if (sim.st[i] === 1 && sim.team[i] === 1 && sim.z[i] > sim.front - 10) near += sim.x[i] - L.x;
    if (best >= 0) sim.moveTo(C.x[best]);
    else if (sim.nBoss && sim.bossI >= 0 && sim.st[sim.bossI] === 1) sim.moveTo(sim.x[sim.bossI]);   // boss fight: line the cannon lane up on the boss
    else sim.moveTo(L.tx - Math.sign(near) * 0.2);
    // spending like a sensible player: fill the army first, then alternate class levels and tank upgrades
    if ((sim.botT = (sim.botT || 0) - dt) <= 0) { sim.botT = 0.5; sim.setAuto(true); const N = sim.nKind, F = KM.FRIEND_BY, n = Math.max(1, sim.count[0]), sh = k => N[F[k].id - 32] / n;
      sim.setProd(sim.t > 30 && sh('collector') < 0.03 ? 'collector' : sim.t > 40 && sh('medic') < 0.03 ? 'mizard' : sim.t > 90 && sh('knightF') < 0.04 ? 'elite' : sim.t > 150 && sh('giantF') < 0.015 ? 'giant' : sh('archerF') < 0.25 ? 'range' : 'melee');
      const full = sim.pts + sim.prodPts() > sim.stats.cap * 0.92;
      if (full || sim.coins > 3000) { const opts = ['melee', 'range', 'elite', 'mizard', 'giant', 'collector'].filter(k => sim.stats.cls[k] < KM.CLASS_MAX).sort((a, b) => sim.clsCost(a) - sim.clsCost(b));
        if (sim.ups && sim.ups.tank && sim.coins >= sim.upCost() && (!opts.length || sim.upCost() <= sim.clsCost(opts[0]) || sim.rng() < 0.4)) sim.buy('tank'); else if (opts.length) sim.levelUp(opts[0]); } }
    // powers: a sensible player spends Energy — FORTRESS when the tank is in trouble, otherwise whatever is ready
    if (sim.energy >= 100 && (sim.stepN || 0) % 30 === 0) { const hp = L.hp / sim.stats.maxHp, ids = sim.equipped.filter(id => sim.canPower(id)); const id = hp < 0.4 && ids.includes('fortress') ? 'fortress' : ids.filter(x => x !== 'fortress')[0]; if (id) sim.usePower(id); }
    if (sim.choice && sim.rng() < 0.02) sim.takeChoice(Math.floor(sim.rng() * sim.choice.opts.length));
    // posture: DEFEND when the tank is hurt, the field is down with pressure close, or vehicles are under attack; ATTACK once stable
    if (sim.postureT > 2) {
      let close = 0; for (let i = 0; i < sim.hi; i++) if (sim.st[i] === 1 && sim.team[i] === 1) { const dx = sim.x[i] - L.x, dz = sim.z[i] - L.z; if (dx * dx + dz * dz < 81) close++; }
      const hpF = L.hp / sim.stats.maxHp, vehHit = sim.towers.some(t => t && t.hitT < 1), shBroken = sim.stats.shield && L.shDown > 0;
      const wp = (sim.wave - 1) % 10 + 1, brace = sim.wState === 1 && (wp === 5 || wp === 7 || sim.sector === 'charge');   // a sensible player holds formation for mass waves, giants and charges
      if (!sim.posture && (hpF < 0.4 || close > 6 || vehHit || (shBroken && close > 2) || brace)) sim.setPosture(1);
      else if (sim.posture && !vehHit && !brace && ((hpF > 0.55 && close <= 1 && sim.postureT > 6) || (close <= 3 && sim.postureT > 20))) sim.setPosture(0);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
