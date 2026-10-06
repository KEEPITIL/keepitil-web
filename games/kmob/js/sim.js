/* KMOB simulation — headless, deterministic for a given seed + input stream.
   Systems: FriendlyArmy/ArmySpawner (deploy), EnemyDirector, CombatSystem (grid + projectiles), CurrencySystem,
   RunUpgradeSystem, Towers, Launcher. Renderer/audio/UI only read state and listen to events. */
(function (G) {
  const KM = G.KM, W = KM.W;
  const CAP = 4096, PCAP = 900, CCAP = 900;
  const GX0 = -12, GCS = 2, GCOLS = 12, GROWS = 56; // grid: x in [-12,12], z in [front-90, front+22]
  const DEAD = 0, ALIVE = 1, DYING = 2;

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
        tgt: i(CAP), next: i(CAP), freeL: i(CAP), carry: f(CAP), ctg: i(CAP), mt: f(CAP), mph: u(CAP), em: u(CAP), br: u(CAP), grp: i(CAP), gox: f(CAP), goz: f(CAP), spear: u(CAP), frank: u(CAP), fcol: i(CAP), role: u(CAP), roleT: f(CAP), atkN: u(CAP), swd: f(CAP), pend: i(CAP), pcrit: u(CAP), pdmg: f(CAP),
        gh: i(GCOLS * GROWS * 2),
        p: { x: f(PCAP), z: f(PCAP), sx: f(PCAP), sz: f(PCAP), ex: f(PCAP), ez: f(PCAP), t: f(PCAP), tof: f(PCAP), dmg: f(PCAP), spl: f(PCAP), slow: f(PCAP), h: f(PCAP), team: u(PCAP), kind: u(PCAP), on: u(PCAP), tgt: i(PCAP), crit: u(PCAP), src: u(PCAP), pen: u(PCAP) },
        c: { x: f(CCAP), z: f(CCAP), v: f(CCAP), age: f(CCAP), st: u(CCAP), y: f(CCAP), vy: f(CCAP), dx: f(CCAP), dz: f(CCAP) },
      });
    }

    reset(opts) {
      opts = opts || {};
      this.seed = (opts.seed != null ? opts.seed : (Date.now() & 0x7fffffff)) >>> 0;
      this.rng = KM.rng(this.seed);
      this.st.fill(DEAD); this.p.on.fill(0); this.c.st.fill(0);
      for (let k = 0; k < CAP; k++) this.freeL[k] = CAP - 1 - k;
      this.nfree = CAP; this.hi = 0; this.count = [0, 0]; this.dying = 0;
      this.pfree = 0; this.cfree = 0;
      this.t = 0; this.front = 0; this.alive = true; this.deathReason = ''; this.ended = false;
      this.stats = KM.baseStats(opts.perm);
      this.L = { x: 0, z: 2, tx: 0, hp: this.stats.maxHp, hitT: 9, inv: 0, vx: 0, fire: 0, wheel: 0, cd: 0.6, mcd: 2, aim: Math.PI, gun: 0, sh: 0, shMax: 0, shDown: 0, shHit: 9 };
      this.posture = 0; this.postureT = 0; this.src = 0; this.dmgBy = [0, 0, 0, 0]; this.shAbsorbed = 0; this.colCoins = 0; this.colLost = 0; this.nCol = 0; this.colT = 0; this.colList = []; this.prod = 'melee'; this.auto = true; this.sector = null; this.sectorT = 0; this.seenSector = {}; this.nextMini = KM.TUNE.miniFrom * 60; this.bossN = 0; this.nKind = new Int32Array(64); this.prodNext = null; this.healed = 0;
      this.deployAcc = 0; this.budget = 3; this.overflow = 0; this.formT = 0.6; this.nextPush = KM.TUNE.pushEvery; this.nextBoss = KM.TUNE.bossFrom * 60; this.warn = null;
      this.coins = KM.START_BANK; this.coinsTotal = 0; this.kills = 0; this.peakArmy = 0; this.upgrades = 0; this.ups = null; this.upT = 0; this.groups = []; this.nBoss = 0; this.bossI = -1; this.charge = { melee: 0, range: 0, elite: 0 }; this.breaches = 0; this.rowLoss = [0, 0, 0, 0]; this.fillN = 0; this.fillSum = 0;
      this.towers = [null, null, null, null];
      this.spawnCounter = 0; this.lastHit = 99; this.danger = 0; this.killsByKind = {};
      this.debugLog = []; this.diff = KM.difficulty(0);
    }

    get distance() { return -this.front; }
    get level() { return Math.min(5, 1 + Math.floor(this.upgrades / 4)); }
    heal(n) { this.L.hp = Math.min(this.stats.maxHp, this.L.hp + n); }

    // ---------- input ----------
    moveBy(dx) { this.L.tx = Math.max(-W.LANE + 1, Math.min(W.LANE - 1, this.L.tx + dx)); }   // the command vehicle slides left/right along the rear lane only
    moveTo(x) { this.L.tx = Math.max(-W.LANE + 1, Math.min(W.LANE - 1, x)); }

    // ---------- army posture (the only control besides movement + upgrade cards) ----------
    setPosture(p) { p = p ? 1 : 0; if (p === this.posture) return; this.posture = p; this.postureT = 0; for (let i = 0; i < this.hi; i++) if (this.st[i] === ALIVE && !this.team[i]) { this.think[i] = Math.min(this.think[i], 0.05 + (i % 7) * 0.04); if (p) this.tgt[i] = -1; } this.emit('posture', p); }
    togglePosture() { this.setPosture(this.posture ? 0 : 1); }
    // ---------- production: what the command vehicle deploys ----------
    setProd(m) { if (!KM.PROD[m] || m === this.prod) return; this.prod = m; this.emit('prod', m); }   // one selected type; AUTO never picks another
    typeOf(i) { const k = this.kind[i]; return k === 33 ? 'range' : k === 34 ? 'elite' : 'melee'; }
    setCharge(type, on) { if (!(type in this.charge)) return; on = on ? 1 : 0; if (this.charge[type] === on) return; this.charge[type] = on; this.emit('charge', type, on); }   // DEFEND: one soldier type attacks, the rest hold
    setAuto(on) { on = !!on; if (on === this.auto) return; this.auto = on; this.emit('auto', on); }
    prodCost() { return KM.PROD[this.prod].cost; }
    canDeploy() { return this.alive && this.count[0] < this.stats.cap && this.coins >= this.prodCost(); }
    // one soldier of the selected type, paid from coins; false at 300 or when broke (nothing is spent)
    deployOne(how) {
      if (!this.canDeploy()) return false; const P = KM.PROD[this.prod], S = this.stats, L = this.L, def = KM.FRIEND_BY[P.kind], el = this.prod === 'elite';
      const j = this.spawn(0, def, L.x + (this.rng() - 0.5) * 0.6, L.z - 1.4, { hp: S.hp * (el ? S.elitePow : 1), dmg: S.dmg * (el ? S.elitePow : 1), spd: def.col ? S.colSpeed : S.speed / 4, birth: 0.0001 });
      if (j < 0) return false; this.coins -= P.cost; this.spawnCounter++; this.nKind[def.id - 32]++;
      this.vz[j] = -S.speed * 1.6; this.vx[j] = (this.rng() - 0.5) * 3; L.fire = 1; this.emit('deploy', j, how || 'auto'); if (def.col) this.emit('collector', j); return true;
    }

    // ---------- force field (rides on the command tank: capacity → collapse → recharge) ----------
    shieldMax() { const n = this.stats.shield; return n ? 60 + 45 * (n - 1) : 0; }
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
    stepTank(dt, S) {
      const L = this.L; L.cd -= dt * S.tankRate; L.mcd -= dt; L.gun = Math.max(0, L.gun - dt * 4);
      if (L.cd <= 0) {
        // the main gun picks the toughest threat in range (elites, brutes, siege) — soldiers handle the small fry
        let tg = -1, bs = -1e9; const R2 = S.tankRange * S.tankRange;
        for (let i = 0; i < this.hi; i++) { if (this.st[i] !== ALIVE || this.team[i] !== 1) continue; const dx = this.x[i] - L.x, dz = this.z[i] - L.z, dd = dx * dx + dz * dz; if (dd > R2) continue;
          const sc = this.hp[i] * (this.elite[i] ? 3 : 1) - Math.sqrt(dd) * 3; if (sc > bs) { bs = sc; tg = i; } }
        if (tg < 0) L.cd = 0.12;
        else { L.cd = 1; const E = KM.TANK_ERAS[this.tankEra = KM.tankEra(S, this.t)], tx = this.x[tg], tz = this.z[tg], d = Math.hypot(tx - L.x, tz - L.z), tof = d / E.speed; L.aim = Math.atan2(tx - L.x, tz - L.z); L.gun = 1;
          const shots = [tg]; for (let k = 1; k < (S.tankMulti || 1); k++) { const j = this.nearestXZ(tx + (k % 2 ? 2.5 : -2.5), tz - k, 1, 4); if (j >= 0 && !shots.includes(j)) shots.push(j); }   // MULTISHOT: extra nearby targets
          for (const j of shots) { const jx = this.x[j], jz = this.z[j], jt = Math.hypot(jx - L.x, jz - L.z) / E.speed;
            this.fire(0, L.x, L.z - 1.2, j, jx + this.vx[j] * jt, jz + this.vz[j] * jt, S.tankDmg * E.dmg, E.proj, S.tankSplash, 0, E.speed, false, 2); this.p.pen[this.lastShot] = S.tankPen || 0; }
          this.emit('tankfire', tg, shots.length); }
      }
      if (S.missiles > 0 && L.mcd <= 0) {
        L.mcd = 3.2; const R = S.tankRange * 1.4, list = [];
        for (let i = 0; i < this.hi; i++) { if (this.st[i] !== ALIVE || this.team[i] !== 1) continue; const dx = this.x[i] - L.x, dz = this.z[i] - L.z; if (dx * dx + dz * dz < R * R) list.push(i); }
        list.sort((a, b) => this.hp[b] - this.hp[a]);
        for (let k = 0; k < Math.min(S.missiles, list.length); k++) { const tg = list[k]; this.fire(0, L.x + (k % 2 ? 0.6 : -0.6), L.z + 0.3, tg, this.x[tg], this.z[tg], S.tankDmg * 1.6, 21, 1.4, 0, 15, false, 2); }
        if (list.length) this.emit('missiles', Math.min(S.missiles, list.length));
      }
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
      this.rng_[i] = def.rng; this.arm[i] = (def.arm || 0) + (mul.arm || 0); this.rad[i] = def.rad; this.sc[i] = def.sc * (0.95 + r() * 0.1);
      this.phase[i] = r() * 6.283; this.stride[i] = 0.9 + r() * 0.2; this.swing[i] = 0; this.pend[i] = -1; this.swd[i] = def.el || def.sc >= 1.3 || def.wpn === 'axe' ? 0.75 : def.wpn === 'staff' || def.wpn === 'cannon' ? 0.6 : 0.4; this.flash[i] = 0; this.die[i] = 0; this.slow[i] = 0;
      this.carry[i] = 0; this.ctg[i] = -1; this.mt[i] = def.mech ? 4 + r() * 2 : 0; this.mph[i] = 0; this.em[i] = 0; this.br[i] = 0; this.grp[i] = -1; this.spear[i] = def.k === 'soldier' ? 1 : 0; this.frank[i] = 0; this.fcol[i] = -1;   // melee: one opening spear per deployment
      this.yaw[i] = team ? 0 : Math.PI; this.think[i] = r() * 0.2; this.birth[i] = mul.birth || 0; this.tgt[i] = -1; this.era[i] = mul.era || 0; this.elite[i] = def.el ? 1 : 0;
      // melee role: 0 front · 1 pressure (fills openings) · 2 breakthrough (fast/heavy) · 3 rear (ranged/support)
      const rr = r(); this.roleT[i] = 0;
      this.role[i] = def.col ? 4 : def.med ? 5 : def.rng > 2 || def.he ? 3 : team ? (def.k === 'brute' || def.k === 'warlord' ? 2 : def.k === 'runner' ? (rr < 0.6 ? 2 : 1) : def.k === 'knight' ? (rr < 0.4 ? 2 : 0) : def.k === 'imp' ? (rr < 0.3 ? 2 : 1) : rr < 0.35 ? 1 : 0)
        : (def.k === 'knightF' ? 2 : rr < 0.12 ? 2 : rr < 0.47 ? 1 : 0);
      this.count[team]++; if (team === 1 && def.boss) { this.nBoss++; this.bossI = i; if (this.nBoss === 1) this.emit('bossFight', 1); }
      return i;
    }
    free(i) { this.st[i] = DEAD; this.freeL[this.nfree++] = i; }
    def(i) { const k = this.kind[i]; return k >= 32 ? KM.FRIEND[k - 32] : KM.ENEMY[k]; }

    kill(i, silent) {
      if (this.st[i] !== ALIVE) return;
      this.st[i] = DYING; this.die[i] = 0; this.count[this.team[i]]--; this.dying++; if (!this.team[i]) this.nKind[this.kind[i] - 32]--;
      if (!silent) this.openSpace(i);
      if (this.team[i] === 1) {
        const d = KM.ENEMY[this.kind[i]]; if (d.boss && --this.nBoss <= 0) { this.nBoss = 0; this.bossI = -1; this.emit('bossFight', 0); } if (this.grp[i] >= 0) { const g = this.groups[this.grp[i]]; if (g) g.alive--; this.grp[i] = -1; }
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
      let dmg = amt * (12 / (12 + a));
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

    // ---------- launcher ----------
    lDist(x, z) { const dx = x - this.L.x, dz = z - this.L.z; return Math.sqrt(dx * dx + dz * dz); }
    hurtLauncher(a, why) {
      if (!this.alive || this.L.inv > 0) return;
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
      if (k < 0) { // pool exhausted: resolve instantly so damage is never lost
        this.src = src || 0; if (spl) this.area(1 - team, ex, ez, spl, dmg, slow, sz); else if (tgt >= 0) this.hurt(tgt, dmg, team, sz, crit); else if (tgt === -2) this.hurtLauncher(dmg, 'ranged'); else if (tgt <= -10) this.hurtStruct(tgt, dmg);
        return;
      }
      this.pfree = (k + 1) % PCAP;
      const d = Math.hypot(ex - sx, ez - sz);
      P.on[k] = 1; P.team[k] = team; P.kind[k] = kind; P.sx[k] = P.x[k] = sx; P.sz[k] = P.z[k] = sz; P.ex[k] = ex; P.ez[k] = ez; P.t[k] = 0;
      P.tof[k] = Math.max(0.12, d / speed); P.dmg[k] = dmg; P.spl[k] = spl || 0; P.slow[k] = slow || 0; P.tgt[k] = tgt; P.h[k] = Math.min(4, 0.6 + d * 0.18) * (kind >= 10 && kind <= 16 ? KM.RTECH[kind - 10].arc : kind === 20 ? 0.15 : kind === 21 ? 0.9 : kind === 22 ? 0.45 : 1); P.crit[k] = crit ? 1 : 0; P.src[k] = src || 0; P.pen[k] = 0; this.lastShot = k;
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
    rollUps() {                                                                                    // keep one valid next-upgrade per category (stable until bought or invalid)
      const G = KM.upgradeOptions(this), ups = this.ups || (this.ups = {});
      for (const g of KM.UPG_GROUPS) { const opts = G[g], cur = ups[g]; if (cur && opts.some(o => o.id === cur.id)) { ups[g] = opts.find(o => o.id === cur.id); continue; }
        if (!opts.length) { ups[g] = null; continue; } let r = this.rng() * opts.reduce((a, o) => a + o.w, 0), p = opts[opts.length - 1]; for (const o of opts) { r -= o.w; if (r <= 0) { p = o; break; } } ups[g] = p; }
    }
    upCost() { return KM.upgradeCost(this.upgrades); }
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
      const D = this.diff = KM.difficulty(this.t), S = this.stats, L = this.L;
      // launcher movement (smoothed for weight)
      const px = L.x; L.x += (L.tx - L.x) * Math.min(1, dt * 12);
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
      this.stepShield(dt);
      this.stepProjectiles(dt);
      this.stepCoins(dt, S);
      this.stepDying(dt);
      this.stepFx(dt);

      this.peakArmy = Math.max(this.peakArmy, this.count[0]);
      // danger: how close the enemy mass is to the launcher (drives music/vignette)
      this.danger += ((this.L.hp / S.maxHp < 0.35 ? 1 : 0) - this.danger) * Math.min(1, dt * 2);
      // inline upgrade badges stay current
      if ((this.upT -= dt) <= 0) { this.upT = 0.5; this.rollUps(); }
    }

    deploy(dt, S) {                                                                                 // AUTO: the selected type, whenever coins and a free slot allow (cadence = deploy speed)
      this.atCap = this.count[0] >= S.cap ? 1 : 0;
      this.deployAcc = Math.min(3, this.deployAcc + S.rate * dt);
      if (!this.auto) return;
      while (this.deployAcc >= 1 && this.deployOne('auto')) this.deployAcc -= 1;
    }

    director(dt, D) {
      this.budget += D.spawnRate * dt;
      const m = D.m;
      // telegraphed massive pushes + bosses (never instant: 3s warning)
      if (this.t >= this.nextPush - 3 && !this.warn) { this.warn = { type: 'push', at: this.nextPush }; this.emit('warn', 'push'); }
      if (this.nBoss && this.nextBoss < this.t + 30) this.nextBoss = this.t + 30;   // one boss fight at a time: the next one waits until this boss falls
      if (this.t >= this.nextBoss - 4 && !this.warn) { this.warn = { type: 'boss', at: this.nextBoss }; this.emit('warn', 'boss'); }
      if (this.warn && this.warn.type !== 'mini' && this.t >= this.warn.at) {
        if (this.warn.type === 'push') { this.formation('push', D, 8 + D.spawnRate * 7); this.nextPush += KM.TUNE.pushEvery; }
        else { this.formation('boss', D, 0); this.nextBoss += KM.TUNE.bossEvery; }
        this.warn = null;
      }
      // mini-boss: a 3–5× giant shifts tactical priority for a while (inside the endless flow, no arena)
      if (this.t >= this.nextMini - 3 && !this.warn) { this.warn = { type: 'mini', at: this.nextMini }; this.emit('warn', 'mini'); }
      if (this.warn && this.warn.type === 'mini' && this.t >= this.warn.at) { this.formation('mini', D, 0); this.nextMini += KM.TUNE.miniEvery; this.warn = null; }
      // encounter sectors
      this.sectorT -= dt; if (!this.sector || this.sectorT <= 0) this.pickSector(m);
      const SEC = KM.SECTORS[this.sector];
      this.formT -= dt;
      if (this.formT > 0) return;
      const pool = SEC.pool.slice();
      if (m > 6 && this.sector !== 'swarm' && this.sector !== 'rout') pool.push('elite');
      if (m > 8.5 && this.sector === 'shield') pool.push('siege');
      const type = this.rng.pick(pool);
      const want = Math.min(this.budget, (4 + D.spawnRate * (2.5 + this.rng() * 2.5)) * SEC.bud);
      if (this.count[1] > W.MAX_ENEMY - 40) { // population cap: convert quantity into strength instead of more bodies
        if (this.budget > 150) { this.overflow = Math.min(3, this.overflow + 0.02); this.budget -= 30; }
        this.formT = 0.5; return;
      }
      if (want < 3) { this.formT = 0.3; return; }
      this.budget -= this.formation(type, D, want);
      this.formT = 1.6 + this.rng() * 2.2 - Math.min(1.1, m * 0.03);
    }

    // Next sector: weighted variety + readable introductions (a new threat first appears on its own) + soft composition counters.
    pickSector(m) {
      const S = KM.SECTORS, N = this.nKind, army = Math.max(1, this.count[0]), rangedShare = N[1] / army, meleeShare = N[0] / army;
      if (m < 1) { this.sector = 'opening'; this.sectorT = 60; return; }
      for (const k in S) { const sc = S[k]; if (sc.intro && m >= sc.at && !this.seenSector[k]) { this.setSector(k, true); return; } }   // introduce before remixing
      const w = {}; let tot = 0;
      for (const k in S) { if (k === 'opening' || m < S[k].at || k === this.sector) continue; let x = S[k].w || 1;
        if (k === 'charge' && rangedShare > 0.4) x *= 1.6; if (k === 'ranged' && meleeShare > 0.85) x *= 1.4; if (k === 'swarm' && army > 150) x *= 1.2;
        if (k === 'rout' && this.lastHard) x *= 2;                                                  // power-fantasy window after a hard stretch
        w[k] = x; tot += x; }
      let r = this.rng() * tot, pick = 'swarm'; for (const k in w) { r -= w[k]; if (r <= 0) { pick = k; break; } }
      this.setSector(pick, false);
    }
    setSector(k, intro) {
      const S = KM.SECTORS[k]; this.sector = k; this.sectorIntro = intro; this.sectorT = S.dur * (intro ? 0.7 : 1); this.seenSector[k] = 1; this.lastHard = k === 'giant' || k === 'charge' || k === 'attrition';
      if (S.giants && this.t / 60 >= KM.TUNE.miniFrom) for (let n = 0; n < S.giants; n++) this.formation('mini', this.diff, 0);
      this.emit('sector', k, intro);
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
        const j = this.spawn(1, d, Math.max(-W.LANE, Math.min(W.LANE, x)), z, mul); if (j < 0) continue; placed++;
        if (G && !d.mech) { this.grp[j] = gid; this.gox[j] = this.x[j] - cx; this.goz[j] = z - z0; G.n0++; G.alive++; G.v = Math.min(G.v, this.spd[j] * 0.8); }
      }
      if (this.opts.trace) this.debugLog.push({ t: this.t, type, kinds: list.map(l => l[0].k), xs: list.map(l => l[1]) });
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
    stepUnits(dt, S) {
      const front = this.front, L = this.L, aggro0 = 11, aggro1 = 10, COH = 27, fN = Math.max(1, this.count[0] - this.nCol); let nCol = 0; this.colList.length = 0;
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
        const isCol = team === 0 && this.role[i] === 4, defend = team === 0 && this.posture === 1 && !this.charge[this.typeOf(i)];   // a type ordered to ATTACK leaves the formation
        if (isCol) { nCol++; this.colList.push(i); this.collector(i, dt, S); dvx = this.cvx; dvz = this.cvz; }
        else if (team === 0 && this.role[i] === 5) { this.medic(i, dt, S); dvx = this.cvx; dvz = this.cvz; }
        else {
        // retarget (staggered)
        this.think[i] -= dt;
        let tg = this.tgt[i];
        if (tg >= 0 && this.st[tg] !== ALIVE) tg = -1;
        if (tg <= -10 && !this.structAt(tg)) { tg = -1; this.tgt[i] = -1; }
        if (this.think[i] <= 0) {
          this.think[i] = 0.18 + this.rng() * 0.16;
          const ranged = team === 0 ? this.role[i] === 3 : this.rng_[i] > 2;   // friendlies by role (pikes reach 2.5 but are melee)
          if (team === 0 && ranged) { const T = KM.rtech(S); this.rng_[i] = T.range; this.cd[i] = T.cd; }
          const fr = this.frank[i], el = this.kind[i] === 34;
          tg = this.pickTarget(i, team ? aggro1 + (ranged ? 4 : 0) : defend ? (ranged ? this.rng_[i] + 1 : el ? 7 : fr === 1 ? 1.9 : fr === 2 || fr === 3 ? 2.9 : 6) : aggro0 + (ranged ? 4 : 0));   // DEFEND: local zones only
          if (team === 0 && this.spear[i]) {
            this.rng_[i] = 0.75;
            if (tg >= 0) { const sd = Math.hypot(this.x[tg] - this.x[i], this.z[tg] - this.z[i]), big = this.elite[tg] || KM.ENEMY[this.kind[tg]].boss;
              if (sd > 3 && sd < 9.5 && (!defend || big)) { this.spear[i] = 0; this.rng_[i] = 0.75; const tof = sd / 17;   // opening spear throw, then the sword
                this.fire(0, this.x[i], this.z[i], tg, this.x[tg] + this.vx[tg] * tof, this.z[tg] + this.vz[tg] * tof, S.dmg * 3.2, 22, 0, 0, 17, false, 0); this.emit('spear', i); } }
          }
          if (team === 0 && tg >= 0) {
            const ahead = L.z - this.z[tg];
            // DEFEND: only engage what comes into the formation · ATTACK: soft cohesion radius, never chase ever farther
            if (tg !== this.bossI && (defend ? !ranged && this.z[tg] < (this.form && this.form.M ? this.form.frontZ - 3 : L.z - 13) : ahead > COH && this.z[tg] < this.z[i])) tg = -1;   // DEFEND: melee only engage at the wall (ranged are already range-limited)
            // reserves (rank 4+) only answer breaches: an enemy already past the shield wall
            if (defend && tg >= 0 && !ranged && this.form && (fr >= 4 || el) && this.z[tg] < this.form.frontZ + 0.4) tg = -1;   // giants too: they only fight what breaks the line
            // ranged: once an enemy is past the giants' line they become melee soldiers
            if (defend && ranged && this.form && this.form.M) { const th = this.nearest(i, 6); if (th >= 0 && this.z[th] > this.form.giantZ + 0.3) tg = th; }
            // boss fight: troops in ATTACK go for the boss wherever it is
            if (!defend && this.nBoss && this.bossI >= 0 && this.st[this.bossI] === ALIVE && (tg < 0 || this.rng() < 0.35)) tg = this.bossI;
          }
          if (team === 0 && !ranged && this.role[i] < 3) this.rng_[i] = defend && (fr === 2 || fr === 3) && !el ? 2.5 : 0.75;   // ranks 2–3: shield + pike reaching over row 1
          const gF = team === 1 && this.grp[i] >= 0 ? this.groups[this.grp[i]] : null;
          if (gF && gF.st < 2 && tg >= 0 && Math.hypot(this.x[tg] - this.x[i], this.z[tg] - this.z[i]) > (ranged ? this.rng_[i] + 0.5 : this.rad[i] + this.rad[tg] + 1.6)) tg = -1;   // in formation: hold ranks, engage only on contact
          if (gF && tg >= 0 && gF.st === 0) gF.st = 1;   // impact
          if (team === 1) { const ld = this.lDist(this.x[i], this.z[i]); if (ld < 6.5 && (tg < 0 || ld < 3)) tg = -2;
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
          const dx = tx - this.x[i], dz = tz - this.z[i], d = Math.sqrt(dx * dx + dz * dz) || 0.001;
          const reach = this.rng_[i] + this.rad[i] + (so ? 1.1 : tg === -2 ? 1.1 : this.rad[tg]);
          this.yaw[i] = Math.atan2(dx, dz);
          const hold = team === 0 && defend && this.role[i] < 3 && this.kind[i] !== 34 && this.frank[i] >= 1 && this.frank[i] <= 3;
          const em = team === 0 && this.role[i] === 3 && tg >= 0 && (d < this.rad[i] + this.rad[tg] + 1.1 || (defend && this.form && this.form.M && this.z[tg] > this.form.giantZ + 0.3 && d < 6)); this.em[i] = em ? 1 : 0;   // ranged: enemy in the personal zone or past the giants → sword
          if (em && d > this.rad[i] + this.rad[tg] + 0.9) { dvx = dx / d * sp; dvz = dz / d * sp; }
          else if (em) { this.at[i] -= dt * S.atk * sm; if (this.at[i] <= 0) { this.at[i] = 0.9; this.src = 0; this.hurt(tg, S.dmg * 0.8, 0, this.z[i], false); this.swing[i] = 1; this.emit('hit', i, tg, false); } }
          else if (hold && d > reach) { const G = this.fg || (this.fg = [0, 0]); this.formGoal(i, G); const ox = G[0] - this.x[i], oz = G[1] - this.z[i], od = Math.hypot(ox, oz) || 1e-3; if (od > 0.3) { dvx = ox / od * sp * Math.min(1, od / 2.2); dvz = oz / od * sp * Math.min(1, od / 2.2); } this.yaw[i] = Math.PI; }   // the line holds; enemies come to it
          else if (this.role[i] === 3 && !so && tg >= 0 && d < this.rng_[i] * 0.5) { if (this.z[i] < L.z - 2.4) { dvx = -dx / d * sp * 0.75; dvz = -dz / d * sp * 0.75; } else { dvx = (this.x[i] >= tx ? 1 : -1) * sp * 0.6; dvz = 0; } }   // ranged: back off to preferred range, but never past the tank: at the rear boundary sidestep and fight at emergency range
          else if (d > reach) {
            dvx = dx / d * sp; dvz = dz / d * sp;
            // fan out toward open combat positions instead of queueing behind the unit in front
            if (d < reach + 4) { const fan = (((i * 0.6180339) % 1) - 0.5) * 0.9 * sp * Math.min(1, (d - reach) / 2); dvx += -dz / d * fan; dvz += dx / d * fan; }
          }
          else {
            if (adv < -0.4 && this.role[i] < 2) dvz = (team ? -1 : 1) * sp * 0.45 * (-adv - 0.4);   // losing strip gives ground while fighting
            this.at[i] -= dt * (team ? 1 : S.atk) * sm;
            if (this.at[i] <= 0) { this.at[i] = this.cd[i] * (0.9 + this.rng() * 0.2); this.attack(i, tg, tx, tz, S);
              if (team === 0 && defend && (this.frank[i] === 2 || this.frank[i] === 3) && this.role[i] < 3 && this.kind[i] !== 34 && tg >= 0) { const e = KM.ENEMY[this.kind[tg]], k = e.boss ? 0.15 : e.mini || this.elite[tg] ? 0.35 : 1; this.z[tg] -= 0.32 * k; this.vz[tg] *= 1 - 0.6 * k; if (this.mph[tg] === 2) this.mt[tg] -= 0.3 * k; this.emit('pike', tg, 0.32 * k); }   // pike pushback: ordinary foes give ground, charges lose momentum, giants barely move
            }
          }
        } else {
          // march with slight drift toward lane centre / formation cohesion
          if (team === 0 && defend) {
            // DEFEND: walk to the formation cell (gaps are re-assigned by formUpdate; arrival is weighty, never a teleport)
            const G = this.fg || (this.fg = [0, 0]); this.formGoal(i, G);
            const ox = G[0] - this.x[i], oz = G[1] - this.z[i], od = Math.sqrt(ox * ox + oz * oz) || 1e-3, ak = Math.min(1, od / 2.2);
            if (od > 0.3) { dvx = ox / od * sp * 1.15 * ak; dvz = oz / od * sp * 1.15 * ak; } this.yaw[i] = od > 1.2 ? Math.atan2(dvx, dvz) : Math.PI;
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
        const v = Math.abs(this.vx[i]) + Math.abs(this.vz[i]);
        this.phase[i] += dt * (2 + v * 2.3) * this.stride[i];
        if (team === 1) {
          if (this.z[i] > front + W.BREACH_DZ) { this.hurtLauncher(this.dmg[i] * 1.5 + 2, 'breach'); this.emit('breach', i); this.kill(i, true); if (!this.alive) return; }
        } else if (this.z[i] > front + 14 || this.z[i] < front - 95) this.kill(i, true);
      }
      this.nCol = nCol;
    }
    recount() { this.nKind.fill(0); let zs = 0, xs = 0, n = 0; for (let i = 0; i < this.hi; i++) if (this.st[i] === ALIVE && !this.team[i]) { this.nKind[this.kind[i] - 32]++; if (this.role[i] < 3) { zs += this.z[i]; xs += this.x[i]; n++; } } this.armyZ = n ? zs / n : this.L.z - 10; this.armyX = n ? xs / n : this.L.x; }   // armyZ: where the melee mass is

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

    // ---------- DEFEND formation: phalanx cells (rank × column) with lightweight vacancy filling ----------
    // rank 0 shield line · rank 1 spears (thrust through) · ranks 2+ sword reserve; rebuilt only when the melee count shifts,
    // otherwise holes are filled front-to-back from the nearest unit behind (no solver, no per-frame re-sort).
    formUpdate(dt) {
      const F = this.form || (this.form = { t: 0, rb: 0, M: 0, C: 0, R: 0, owner: new Int32Array(4096).fill(-1), vt: new Float32Array(4096), list: [], press: new Float32Array(8) });
      if (this.posture !== 1) { F.M = 0; return; }
      F.t -= dt; F.rb -= dt; if (F.t > 0) return; F.t = 0.25;
      const L = this.L, list = F.list; list.length = 0;
      for (let i = 0; i < this.hi; i++) if (this.st[i] === ALIVE && !this.team[i] && this.role[i] < 3 && this.kind[i] !== 34 && !this.charge.melee) list.push(i);
      const M = list.length; if (!M) { F.M = 0; return; }
      const wdt = Math.min(W.LANE - 0.6, 2.6 + Math.sqrt(M) * 0.42), C = Math.max(4, Math.min(22, Math.round(wdt * 2 / 0.85))), R = Math.ceil(M / C);
      F.wdt = wdt; F.giantZ = L.z - 3.4 - KM.rtech(this.stats).gap - (this.nKind[2] ? 1.2 : 0); F.frontZ = F.giantZ - (this.nKind[2] ? 1.6 : 0) - R * 0.95; F.cx = W.LANE_CENTER_X;   // back-to-front: tank · medics · ranged · era gap · giants · melee rows;   // centred on the lane, never dragged by the tank · built back-to-front: tank · medics · ranged line · era safety gap · melee ranks
      // flank pressure (enemies just ahead of the line, 8 lateral bins)
      F.press.fill(0); for (let i = 0; i < this.hi; i++) if (this.st[i] === ALIVE && this.team[i] === 1 && this.z[i] > F.frontZ - 9 && this.z[i] < F.frontZ + 3) { const b = Math.max(0, Math.min(7, Math.floor((this.x[i] - F.cx + wdt) / (2 * wdt) * 8))); F.press[b]++; }
      for (let i = 0; i < this.hi; i++) if (this.st[i] === ALIVE && this.team[i] === 1 && !this.br[i] && this.z[i] > F.frontZ + 0.6 && this.z[i] < L.z + 2) { this.br[i] = 1; this.breaches++; }   // breach: an enemy got past the shield wall
      let pb = 0; for (let b = 1; b < 8; b++) if (F.press[b] > F.press[pb]) pb = b; F.pressX = F.cx - wdt + (pb + 0.5) / 8 * 2 * wdt; F.pressN = F.press[pb];
      if (F.rb <= 0 || C !== F.C || Math.abs(M - F.M) > Math.max(3, F.M * 0.12)) {               // full rebuild: one sort, O(M log M)
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
    stepGroups(dt) {                                                                                // FORMATION → IMPACT → BREAK → CHAOS
      const Gs = this.groups; let live = 0;
      for (let k = 0; k < Gs.length; k++) { const g = Gs[k]; if (!g) continue; if (g.alive <= 0 || g.st === 3) { Gs[k] = null; continue; } live++;
        if (g.st < 2) { g.z += g.v * dt; g.cx += ((this.armyX != null ? this.armyX : this.L.x) - g.cx) * Math.min(1, dt * 0.25); }   // the formation closes on the army's lane, it does not slip past it
        if (g.st === 1) { g.t += dt; if (g.t > 3.5 || g.alive < g.n0 * 0.72) { g.st = 2; this.emit('formBreak', k); } }
        else if (g.st === 2) { g.st = 3; for (let i = 0; i < this.hi; i++) if (this.grp[i] === k) this.grp[i] = -1; Gs[k] = null; } }
      if (!live && Gs.length > 64) Gs.length = 0;
    }
    formGoal(i, out) {                                                                               // where unit i stands in DEFEND
      const F = this.form, L = this.L, h2 = (i * 0.3819660) % 1, h = ((i * 0.6180339) % 1) * 2 - 1;
      if (!F || !F.M) { out[0] = L.x; out[1] = L.z - 6; return; }
      const r3 = this.role[i] === 3, kind = this.kind[i];
      if (kind === 34) { out[0] = Math.max(-W.LANE + 0.6, Math.min(W.LANE - 0.6, F.cx + h * F.wdt * 0.95)); out[1] = F.giantZ - h2 * 0.6; return; }     // GIANTS: their own line behind the melee rows
      if (r3) { out[0] = Math.max(-W.LANE + 0.5, Math.min(W.LANE - 0.5, F.cx + h * F.wdt)); out[1] = L.z - 3.4 - h2 * 1.2; return; }   // ranged line: behind the last melee rank by the era's gap, in front of medics and tank
      const r = this.frank[i] - 1, c = this.fcol[i]; if (r < 0 || r >= F.R) { out[0] = F.cx + h * F.wdt; out[1] = F.frontZ + F.R * 0.95; return; }
      let x = F.cx - F.wdt + (c + 0.5) / F.C * 2 * F.wdt; if (r >= 2 && F.pressN > 2) x += Math.max(-1.6, Math.min(1.6, (F.pressX - x) * 0.35));   // reserves lean toward the threatened flank
      out[0] = Math.max(-W.LANE + 0.5, Math.min(W.LANE - 0.5, x)); out[1] = F.frontZ + r * 0.95;
    }
    shieldWall(i) {                                                                                  // living shield neighbours in the front rank
      const F = this.form; if (!F || !F.M || this.frank[i] !== 1) return 0; const c = this.fcol[i]; let n = 0;
      for (const cc of [c - 1, c + 1]) { if (cc < 0 || cc >= F.C) continue; const j = F.owner[cc]; if (j >= 0 && this.st[j] === ALIVE) n++; } return n;
    }

    // Medic: triage → move to a safe spot behind the patient → heal on a cadence. Never resurrects; backs off from threats.
    medic(i, dt, S) {
      const L = this.L, x = this.x[i], z = this.z[i], sp = this.spd[i] * (S.speed / 4.3), mt = KM.medTech(S), R = 16 + mt * 1.5;
      let gx = L.x + ((i * 0.618) % 1 - 0.5) * 6, gz = this.posture === 1 ? L.z - 1.9 : Math.min(L.z - 1.8, (this.armyZ != null ? this.armyZ : L.z - 10) + KM.rtech(S).gap + 2.2);   // support line: just behind the ranged line, ahead of the tank
      const threat = this.nearestXZ(x, z, 1, 3.4) >= 0;
      this.think[i] -= dt;
      if (this.think[i] <= 0) { this.think[i] = 0.4 + (i % 4) * 0.05; let best = -1, bs = 0; const c0 = this.cellX(x - R), c1 = this.cellX(x + R), r0 = this.cellZ(z - R), r1 = this.cellZ(z + R);
        for (let gz2 = r0; gz2 <= r1; gz2++) for (let gx2 = c0; gx2 <= c1; gx2++) for (let j = this.gh[(gz2 * GCOLS + gx2) * 2]; j >= 0; j = this.next[j]) {
          if (j === i || this.st[j] !== ALIVE || this.hp[j] >= this.mhp[j] * 0.9) continue; const k = this.kind[j], def = KM.FRIEND[k - 32];
          const pri = (def.el ? 3 : def.col || def.rng > 2 ? 1.6 : 1.3) * (1 - this.hp[j] / this.mhp[j]) / (1 + Math.hypot(this.x[j] - x, this.z[j] - z) * 0.08);
          if (pri > bs) { bs = pri; best = j; } }
        this.ctg[i] = best; }
      const p = this.ctg[i];
      if (p >= 0 && this.st[p] === ALIVE && !threat) { gx = this.x[p]; gz = this.z[p] + 1.4;                     // stand just behind the patient
        if (Math.hypot(this.x[p] - x, this.z[p] - z) < 2.6) { this.at[i] -= dt; if (this.at[i] <= 0) { this.at[i] = this.cd[i] * (1 - mt * 0.12); const h = Math.min(this.mhp[p] - this.hp[p], S.medHeal * (1 + mt * 0.35)); this.hp[p] += h; this.healed += h; this.emit('heal', p, h); } } }
      if (threat) { gx = L.x; gz = L.z - 2; }
      const dx = gx - x, dz = gz - z, d = Math.sqrt(dx * dx + dz * dz) || 1e-3, s2 = d > 0.3 ? sp * Math.min(1, d / 1.4) : 0;
      this.cvx = dx / d * s2; this.cvz = dz / d * s2; this.yaw[i] = d > 0.5 ? Math.atan2(dx, dz) : Math.PI;
    }

    // Collector: find a coin beyond the tank's magnet (inside a retrieval radius, not near enemies, not claimed) → carry → return → deposit.
    // Currency only counts once deposited; a collector killed on the way drops half its load.
    collector(i, dt, S) {
      const L = this.L, C = this.c, x = this.x[i], z = this.z[i], sp = this.spd[i] * (S.speed / 4.3), cap = S.colCap, RR = 17, mg = S.magnet;
      let gx = L.x + 0.9, gz = L.z - 0.4, run = 0.75;
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
      const dx = gx - x, dz = gz - z, d = Math.sqrt(dx * dx + dz * dz) || 1e-3;
      if (this.carry[i] > 0 && this.lDist(x, z) < 1.6) { const v = this.carry[i]; this.carry[i] = 0; this.coins += v; this.coinsTotal += v; this.colCoins += v; this.emit('coin', v); this.emit('deposit', i, v); }
      const s2 = d > 0.3 ? sp * run * Math.min(1, d / 1.5) : 0; this.cvx = dx / d * s2; this.cvz = dz / d * s2; this.yaw[i] = Math.atan2(dx, dz);
    }

    separate(i, dt) {
      const x = this.x[i], z = this.z[i], ri = this.rad[i];
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
            const d = Math.sqrt(dd), o = (rr - d) / rr, w = this.rad[j] / (ri + this.rad[j]) * 2;
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
      if (team === 0) { dmg = S.dmg * d.dmg; if (this.rng() < S.crit) { dmg *= 2; crit = true; } }
      if (d.he) { // shaman heals nearby enemies, then casts
        for (let j = 0; j < this.hi; j++) if (this.st[j] === ALIVE && this.team[j] === 1 && j !== i) { const dx = this.x[j] - this.x[i], dz = this.z[j] - this.z[i]; if (dx * dx + dz * dz < 16) this.hp[j] = Math.min(this.mhp[j], this.hp[j] + d.he * this.cd[i]); }
        this.emit('heal', i);
      }
      if (d.r) {
        let kind = d.wpn === 'cannon' ? 1 : d.wpn === 'staff' ? 3 : 0, speed = kind === 1 ? 11 : 18;
        if (team === 0) { const T = KM.rtech(S); kind = 10 + (S.rtech || 0); speed = T.speed; dmg *= T.dmg * S.rdmg; }   // friendly ranged: weapon era
        let ex = tx, ez = tz;
        if (tg >= 0) { const tof = Math.hypot(tx - this.x[i], tz - this.z[i]) / speed; ex += this.vx[tg] * tof; ez += this.vz[tg] * tof; }
        this.fire(team, this.x[i], this.z[i], tg, ex, ez, dmg, kind, d.s || 0, 0, speed, crit, 1);
        return;
      }
      this.src = 0;
      if (tg === -2) { this.hurtLauncher(dmg, KM.ENEMY[this.kind[i]].k); return; }
      if (so) { this.hurtStruct(tg, dmg * (d.el ? 1.6 : 1)); this.emit('hit', i, -1, false); return; }
      if (d.el || d.sc >= 1.3 || d.wpn === 'axe') this.shockwave(i, tx, tz, d.boss ? 2.6 : d.el ? 2.0 : 1.3, d.boss ? 9 : d.el ? 7 : 4.5);
      if (d.s) { this.area(1 - team, tx, tz, d.s, dmg, 0, this.z[i]); this.emit('cleave', i); }
      else this.hurt(tg, dmg, team, this.z[i], crit);
      this.emit('hit', i, tg, crit);
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
          if (t.cd <= 0) { t.cd = T.cd / (1 + 0.25 * (lv - 1)) / S.carrierRate; for (let k = 0; k < 1 + Math.floor(lv / 2) && this.count[0] < S.cap; k++) {   /* carriers share the 300 cap */ const j = this.spawn(0, KM.FRIEND[0], t.x - Math.sign(t.x) * 1.2, t.z - 0.5, { hp: S.hp, dmg: S.dmg, spd: S.speed / 4, birth: 0.0001 }); if (j >= 0) { this.vx[j] = -Math.sign(t.x) * 2; this.emit('deploy', j); } } t.recoil = 1; this.emit('tower', t); }
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

    stepProjectiles(dt) {
      const P = this.p;
      for (let k = 0; k < PCAP; k++) {
        if (!P.on[k]) continue;
        P.t[k] += dt; const u = Math.min(1, P.t[k] / P.tof[k]);
        P.x[k] = P.sx[k] + (P.ex[k] - P.sx[k]) * u; P.z[k] = P.sz[k] + (P.ez[k] - P.sz[k]) * u;
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
      for (let i = 0; i < this.hi; i++) if (this.st[i] === DYING) { this.die[i] += dt; this.x[i] += this.vx[i] * dt * 0.3; this.z[i] += this.vz[i] * dt * 0.3; if (this.die[i] > 0.7) { this.dying--; this.free(i); } }
    }
    stepFx() {}

    // ---------- results ----------
    // ---------- one-slot autosave: the meaningful run state (not every body). The army is rebuilt by kind around the tank. ----------
    snapshot() {
      const L = this.L, keys = ['t', 'front', 'coins', 'coinsTotal', 'kills', 'peakArmy', 'upgrades', 'budget', 'overflow', 'nextPush', 'nextBoss', 'nextMini', 'bossN', 'sector', 'sectorT', 'seenSector', 'posture', 'prod', 'auto',
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
      Object.assign(this.stats, stats); for (const k in o) if (k in this || k === 'auto') this[k] = o[k];
      Object.assign(this.L, L); this.L.z = this.front; this.diff = KM.difficulty(this.t);
      towers.forEach((t, s) => { if (t && KM.TOWERS[t.type]) { const T = this.makeTower(t.type, t.lvl, s); T.hp = Math.min(T.mhp, t.hp); T.down = t.down; this.towers[s] = T; } });
      const S = this.stats; let n = 0;
      army.forEach((cnt, k) => { const d = KM.FRIEND[k]; for (let q = 0; q < cnt && n < S.cap; q++, n++) {
        const j = this.spawn(0, d, Math.max(-W.LANE + 1, Math.min(W.LANE - 1, this.L.x + (this.rng() - 0.5) * 12)), this.L.z - 3 - this.rng() * 10, { hp: S.hp * (d.el ? S.elitePow : 1), dmg: S.dmg * (d.el ? S.elitePow : 1), spd: d.col ? S.colSpeed : S.speed / 4 });
        if (j >= 0) this.nKind[k]++; } });
      this.formT = 2; this.ups = null; this.rollUps(); this.recount();
    }

    results() {
      return { time: this.t, kills: this.kills, coins: Math.floor(this.coinsTotal), peakArmy: this.peakArmy, distance: Math.floor(this.distance), tokens: KM.tokensFor(this.t, this.kills), reason: this.deathReason, upgrades: this.upgrades };
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
  Sim.CAP = CAP; Sim.PCAP = PCAP; Sim.CCAP = CCAP; Sim.ALIVE = ALIVE; Sim.DYING = DYING;
  KM.Sim = Sim;

  // Simple autopilot used by tests, soak and the debug "bot" toggle: hover behind the army, dart for nearby coins.
  KM.bot = function (sim, dt, skill) {
    skill = skill == null ? 1 : skill;
    const L = sim.L, C = sim.c; let best = -1, bs = 1e9;
    for (let k = 0; k < C.x.length; k++) if (C.st[k] === 1) { const dz = C.z[k] - sim.front; if (dz < -12 * skill) continue; const s = Math.abs(C.x[k] - L.x) + Math.abs(dz) * 0.5; if (s < bs) { bs = s; best = k; } }
    let near = 0; for (let i = 0; i < sim.hi; i++) if (sim.st[i] === 1 && sim.team[i] === 1 && sim.z[i] > sim.front - 10) near += sim.x[i] - L.x;
    if (best >= 0) sim.moveTo(C.x[best]);
    else sim.moveTo(L.tx - Math.sign(near) * 0.2);
    if (sim.ups && sim.coins >= sim.upCost() && (sim.count[0] >= sim.stats.cap * 0.9 || sim.coins > sim.upCost() * 1.5)) { const gs = KM.UPG_GROUPS.filter(g => sim.ups[g]); if (gs.length) sim.buy(gs[Math.floor(sim.rng() * gs.length)]); }
    // composition: the bot plays like a sensible player — mostly melee, a ranged line, a few medics/collectors, the odd elite
    if ((sim.botT = (sim.botT || 0) - dt) <= 0) { sim.botT = 0.5; sim.setAuto(true); const N = sim.nKind, F = KM.FRIEND_BY, n = Math.max(1, sim.count[0]), sh = k => N[F[k].id - 32] / n;
      sim.setProd(sim.t > 30 && sh('collector') < 0.03 ? 'collector' : sim.t > 40 && sh('medic') < 0.04 ? 'medic' : sim.t > 90 && sh('knightF') < 0.04 ? 'elite' : sh('archerF') < 0.25 ? 'range' : 'melee'); }
    // posture: DEFEND when the tank is hurt, the field is down with pressure close, or vehicles are under attack; ATTACK once stable
    if (sim.postureT > 2) {
      let close = 0; for (let i = 0; i < sim.hi; i++) if (sim.st[i] === 1 && sim.team[i] === 1) { const dx = sim.x[i] - L.x, dz = sim.z[i] - L.z; if (dx * dx + dz * dz < 81) close++; }
      const hpF = L.hp / sim.stats.maxHp, vehHit = sim.towers.some(t => t && t.hitT < 1), shBroken = sim.stats.shield && L.shDown > 0;
      const brace = (sim.warn && sim.warn.type !== 'boss') || sim.sector === 'charge' && sim.sectorT > 20;   // a sensible player holds formation for mass waves, giants and charges
      if (!sim.posture && (hpF < 0.4 || close > 6 || vehHit || (shBroken && close > 2) || brace)) sim.setPosture(1);
      else if (sim.posture && !vehHit && !brace && ((hpF > 0.55 && close <= 1 && sim.postureT > 6) || (close <= 3 && sim.postureT > 20))) sim.setPosture(0);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
