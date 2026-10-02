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
    emit(type, a, b, c) { for (const f of this.listeners) f(type, a, b, c); }

    alloc() {
      const f = n => new Float32Array(n), i = n => new Int32Array(n), u = n => new Uint8Array(n);
      Object.assign(this, {
        x: f(CAP), z: f(CAP), vx: f(CAP), vz: f(CAP), hp: f(CAP), mhp: f(CAP), dmg: f(CAP), cd: f(CAP), at: f(CAP), spd: f(CAP),
        rng_: f(CAP), arm: f(CAP), rad: f(CAP), sc: f(CAP), phase: f(CAP), swing: f(CAP), flash: f(CAP), die: f(CAP), slow: f(CAP),
        yaw: f(CAP), think: f(CAP), birth: f(CAP), stride: f(CAP), team: u(CAP), kind: u(CAP), st: u(CAP), era: u(CAP), elite: u(CAP),
        tgt: i(CAP), next: i(CAP), freeL: i(CAP),
        gh: i(GCOLS * GROWS * 2),
        p: { x: f(PCAP), z: f(PCAP), sx: f(PCAP), sz: f(PCAP), ex: f(PCAP), ez: f(PCAP), t: f(PCAP), tof: f(PCAP), dmg: f(PCAP), spl: f(PCAP), slow: f(PCAP), h: f(PCAP), team: u(PCAP), kind: u(PCAP), on: u(PCAP), tgt: i(PCAP), crit: u(PCAP) },
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
      this.L = { x: 0, z: 2, tx: 0, offZ: 0, toffZ: 0, hp: this.stats.maxHp, hitT: 9, inv: 0, vx: 0, fire: 0, wheel: 0 };
      this.deployAcc = 0; this.budget = 3; this.overflow = 0; this.formT = 1.5; this.nextPush = KM.TUNE.pushEvery; this.nextBoss = KM.TUNE.bossFrom * 60; this.warn = null;
      this.coins = 0; this.coinsTotal = 0; this.kills = 0; this.peakArmy = 0; this.upgrades = 0; this.offer = null; this.offerHold = 0;
      this.towers = [null, null, null, null, null, null];
      this.spawnCounter = 0; this.lastHit = 99; this.danger = 0; this.killsByKind = {};
      this.debugLog = []; this.diff = KM.difficulty(0);
    }

    get distance() { return -this.front; }
    get level() { return Math.min(5, 1 + Math.floor(this.upgrades / 4)); }
    heal(n) { this.L.hp = Math.min(this.stats.maxHp, this.L.hp + n); }

    // ---------- input ----------
    moveBy(dx, dz) { this.L.tx = Math.max(-W.LANE + 1, Math.min(W.LANE - 1, this.L.tx + dx)); this.L.toffZ = Math.max(W.OFFZ_MIN, Math.min(W.OFFZ_MAX, this.L.toffZ + dz)); }
    moveTo(x, offZ) { this.L.tx = Math.max(-W.LANE + 1, Math.min(W.LANE - 1, x)); if (offZ != null) this.L.toffZ = Math.max(W.OFFZ_MIN, Math.min(W.OFFZ_MAX, offZ)); }

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
      this.phase[i] = r() * 6.283; this.stride[i] = 0.9 + r() * 0.2; this.swing[i] = 0; this.flash[i] = 0; this.die[i] = 0; this.slow[i] = 0;
      this.yaw[i] = team ? 0 : Math.PI; this.think[i] = r() * 0.2; this.birth[i] = mul.birth || 0; this.tgt[i] = -1; this.era[i] = mul.era || 0; this.elite[i] = def.el ? 1 : 0;
      this.count[team]++;
      return i;
    }
    free(i) { this.st[i] = DEAD; this.freeL[this.nfree++] = i; }
    def(i) { const k = this.kind[i]; return k >= 32 ? KM.FRIEND[k - 32] : KM.ENEMY[k]; }

    kill(i, silent) {
      if (this.st[i] !== ALIVE) return;
      this.st[i] = DYING; this.die[i] = 0; this.count[this.team[i]]--; this.dying++;
      if (this.team[i] === 1) {
        const d = KM.ENEMY[this.kind[i]];
        if (!silent) {
          this.kills++; this.killsByKind[d.k] = (this.killsByKind[d.k] || 0) + 1;
          let val = d.coin * this.diff.coinMul;
          if (val < 1) { if (this.rng() < val) val = 1; else val = 0; }
          const n = Math.min(8, Math.max(1, Math.round(Math.sqrt(val))));
          for (let k = 0; k < n && val > 0; k++) this.dropCoin(this.x[i], this.z[i], val / n);
          this.emit('kill', i, d);
        }
        if (d.ex && !silent) this.explode(i, d);
      } else this.emit('fdie', i);
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
      if (this.team[i] === 0) { a += this.stats.armor + this.auraArmor(this.x[i], this.z[i]); }
      let dmg = amt * (12 / (12 + a));
      const d = this.def(i);
      if (d.sh && this.team[i] === 1 && srcZ > this.z[i]) dmg *= 0.55;     // enemy shields face the player
      if (d.sh && this.team[i] === 0 && srcZ < this.z[i]) dmg *= 0.6;
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
      this.L.hp -= a; this.L.hitT = 0; this.lastHit = 0; this.emit('lhit', a);
      if (this.L.hp <= 0) { this.L.hp = 0; this.alive = false; this.deathReason = why || 'overrun'; this.emit('death', why); }
    }
    revive() { // optional single revive hook (rewarded ad / earned resource later)
      if (this.alive || this.revived) return false;
      this.revived = true; this.alive = true; this.ended = false; this.L.hp = this.stats.maxHp * 0.6; this.L.inv = 4; this.L.toffZ = W.OFFZ_MAX;
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
    fire(team, sx, sz, tgt, ex, ez, dmg, kind, spl, slow, speed, crit) {
      const P = this.p; let k = -1;
      for (let n = 0; n < PCAP; n++) { const j = (this.pfree + n) % PCAP; if (!P.on[j]) { k = j; break; } }
      if (k < 0) { // pool exhausted: resolve instantly so damage is never lost
        if (spl) this.area(1 - team, ex, ez, spl, dmg, slow, sz); else if (tgt >= 0) this.hurt(tgt, dmg, team, sz, crit); else if (tgt === -2) this.hurtLauncher(dmg, 'ranged');
        return;
      }
      this.pfree = (k + 1) % PCAP;
      const d = Math.hypot(ex - sx, ez - sz);
      P.on[k] = 1; P.team[k] = team; P.kind[k] = kind; P.sx[k] = P.x[k] = sx; P.sz[k] = P.z[k] = sz; P.ex[k] = ex; P.ez[k] = ez; P.t[k] = 0;
      P.tof[k] = Math.max(0.12, d / speed); P.dmg[k] = dmg; P.spl[k] = spl || 0; P.slow[k] = slow || 0; P.tgt[k] = tgt; P.h[k] = Math.min(4, 0.6 + d * 0.18); P.crit[k] = crit ? 1 : 0;
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
    auraArmor(x, z) {
      let a = 0;
      for (let s = 0; s < 6; s++) { const t = this.towers[s]; if (!t || t.type !== 'banner') continue; const dx = x - t.x, dz = z - t.z; if (dx * dx + dz * dz < 49 * this.stats.towerRange) a += 3 * t.lvl; }
      return a;
    }

    // ---------- upgrades ----------
    pick(n) {
      const o = this.offer; if (!o || !o[n]) return false;
      const cost = KM.upgradeCost(this.upgrades);
      if (this.coins < cost) return false;
      this.coins -= cost; this.upgrades++;
      const c = o[n], s = this.stats;
      if (c.id.startsWith('build:')) {
        const slot = this.towers.findIndex((t, i) => !t && i < KM.slotsUnlocked(this.t / 60));
        if (slot >= 0) this.towers[slot] = { type: c.tower, lvl: 1, cd: 0.5, aim: Math.PI, recoil: 0, slot, x: 0, z: 0, tgt: -1, born: 0 };
      } else if (c.id.startsWith('tup:')) {
        const t = this.towers[+c.id.slice(4)]; if (t) { t.lvl++; t.born = 0; }
      } else {
        const u = KM.UPG_BY[c.id]; const prevHp = s.hp;
        u.apply(s, this); s.lv[c.id] = (s.lv[c.id] || 0) + 1;
        if (c.id === 'hp') { const f = s.hp / prevHp; for (let i = 0; i < this.hi; i++) if (this.st[i] === ALIVE && !this.team[i]) { this.mhp[i] *= f; this.hp[i] *= f; } }
      }
      this.offer = null; this.offerHold = 0.25;
      this.emit('upgrade', c);
      return true;
    }
    skipOffer() { if (!this.offer) return; this.offer = null; this.offerHold = 8; this.emit('skip'); }

    // ---------- main step ----------
    step(dt) {
      if (!this.alive) { this.stepDying(dt); this.stepFx(dt); return; }
      this.t += dt; this.front -= W.ADV * dt;
      const D = this.diff = KM.difficulty(this.t), S = this.stats, L = this.L;
      // launcher movement (smoothed for weight)
      const px = L.x; L.x += (L.tx - L.x) * Math.min(1, dt * 12); L.offZ += (L.toffZ - L.offZ) * Math.min(1, dt * 8);
      L.z = this.front + L.offZ; L.vx = (L.x - px) / dt; L.wheel += (Math.abs(L.vx) + W.ADV) * dt;
      L.hitT += dt; L.inv = Math.max(0, L.inv - dt); this.lastHit += dt;
      if (this.lastHit > 4) this.heal(S.maxHp * 0.02 * dt);
      L.fire = Math.max(0, L.fire - dt * 5);

      this.buildGrid();
      this.deploy(dt, S, D);
      this.director(dt, D);
      this.stepUnits(dt, S);
      this.stepTowers(dt, S);
      this.stepProjectiles(dt);
      this.stepCoins(dt, S);
      this.stepDying(dt);
      this.stepFx(dt);

      this.peakArmy = Math.max(this.peakArmy, this.count[0]);
      // danger: how close the enemy mass is to the launcher (drives music/vignette)
      this.danger += ((this.L.hp / S.maxHp < 0.35 ? 1 : 0) - this.danger) * Math.min(1, dt * 2);
      // upgrade offers
      if (this.offerHold > 0) this.offerHold -= dt;
      else if (!this.offer && this.coins >= KM.upgradeCost(this.upgrades)) { this.offer = KM.makeOffer(this, this.rng); this.emit('offer', this.offer); }
    }

    deploy(dt, S) {
      this.deployAcc += S.rate * dt;
      if (this.deployAcc > 3) this.deployAcc = 3;
      while (this.deployAcc >= 1) {
        if (this.count[0] >= S.cap) { this.deployAcc = Math.min(this.deployAcc, 1); break; }
        this.deployAcc -= 1; this.spawnCounter++;
        let def = KM.FRIEND[0];
        if (S.knight && this.spawnCounter % S.knight === 0) def = KM.FRIEND[2];
        else if (S.archer && this.rng() < S.archer) def = KM.FRIEND[1];
        const L = this.L, j = this.spawn(0, def, L.x + (this.rng() - 0.5) * 0.6, L.z - 1.4,
          { hp: S.hp, dmg: S.dmg, spd: S.speed / 4, birth: 0.0001 });
        if (j >= 0) { this.vz[j] = -S.speed * 1.6; this.vx[j] = (this.rng() - 0.5) * 3; L.fire = 1; this.emit('deploy', j); }
      }
    }

    director(dt, D) {
      this.budget += D.spawnRate * dt;
      const m = D.m;
      // telegraphed massive pushes + bosses (never instant: 3s warning)
      if (this.t >= this.nextPush - 3 && !this.warn) { this.warn = { type: 'push', at: this.nextPush }; this.emit('warn', 'push'); }
      if (this.t >= this.nextBoss - 4 && !this.warn) { this.warn = { type: 'boss', at: this.nextBoss }; this.emit('warn', 'boss'); }
      if (this.warn && this.t >= this.warn.at) {
        if (this.warn.type === 'push') { this.formation('push', D, 8 + D.spawnRate * 7); this.nextPush += KM.TUNE.pushEvery; }
        else { this.formation('boss', D, 0); this.nextBoss += KM.TUNE.bossEvery; }
        this.warn = null;
      }
      this.formT -= dt;
      if (this.formT > 0) return;
      const pool = ['line', 'blob', 'wedge', 'column'];
      if (m > 1.3) pool.push('shieldwall', 'flank');
      if (m > 0.6) pool.push('swarm');
      if (m > 3) pool.push('backline', 'backline');
      if (m > 6) pool.push('elite');
      if (m > 8.5) pool.push('siege');
      if (m > 10) pool.push('mixed', 'mixed');
      const type = this.rng.pick(pool);
      const want = Math.min(this.budget, 4 + D.spawnRate * (2.5 + this.rng() * 2.5));
      if (this.count[1] > W.MAX_ENEMY - 40) { // population cap: convert quantity into strength instead of more bodies
        if (this.budget > 150) { this.overflow = Math.min(3, this.overflow + 0.02); this.budget -= 30; }
        this.formT = 0.5; return;
      }
      if (want < 3) { this.formT = 0.3; return; }
      this.budget -= this.formation(type, D, want);
      this.formT = 1.6 + this.rng() * 2.2 - Math.min(1.1, m * 0.03);
    }

    // Returns budget spent. Every unit placed is an unlocked type inside the lane.
    formation(type, D, budget) {
      const r = this.rng, m = D.m, un = KM.unlocked(m), E = KM.ENEMY_BY;
      const z0 = this.front - W.SPAWN_DZ - r() * 6, cx = r.range(-W.LANE + 3, W.LANE - 3);
      const melee = un.filter(e => !e.r && !e.el && e.k !== 'bomber'), list = [];
      const pickMelee = () => { if (r() < D.eliteChance && m >= 6) return E.brute; const c = melee.filter(e => r() < 0.75 || e.k === 'grunt'); return r.pick(c.length ? c : melee); };
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
        case 'boss': { add(E.warlord, 0, z0); spent = 0; const d = has('knight') ? E.knight : E.shield; for (let k = 0; k < 10; k++) add(d, Math.cos(k / 10 * 6.283) * 2.6, z0 + Math.sin(k / 10 * 6.283) * 2); break; }
      }
      if (spent > budget + 2) spent = budget; // last over-budget unit was rejected by spend()
      const mul = { hp: D.hp * (1 + this.overflow), dmg: D.dmg, spd: D.speed, era: Math.min(5, D.era), arm: Math.min(10, D.era * 1.5) };
      let placed = 0;
      for (const [d, x, z] of list) {
        if (this.count[1] >= W.MAX_ENEMY && !d.boss) { this.overflow = Math.min(3, this.overflow + 0.002); continue; } // hard population cap: excess becomes strength
        if (this.spawn(1, d, Math.max(-W.LANE, Math.min(W.LANE, x)), z, mul) >= 0) placed++;
      }
      if (this.opts.trace) this.debugLog.push({ t: this.t, type, kinds: list.map(l => l[0].k), xs: list.map(l => l[1]) });
      if (type === 'boss' || type === 'push') this.emit('wave', type);
      else if (list.some(l => l[0].el)) this.emit('elite', type);
      return Math.max(spent, placed ? 1 : 0);
    }

    stepUnits(dt, S) {
      const front = this.front, L = this.L, aggro0 = 11, aggro1 = 10;
      for (let i = 0; i < this.hi; i++) {
        if (this.st[i] !== ALIVE) continue;
        const team = this.team[i];
        if (this.birth[i] > 0) { this.birth[i] += dt; if (this.birth[i] > 0.4) this.birth[i] = 0; }
        if (this.slow[i] > 0) this.slow[i] -= dt;
        if (this.flash[i] > 0) this.flash[i] -= dt * 5;
        if (this.swing[i] > 0) this.swing[i] -= dt * 3.2;
        const sm = this.slow[i] > 0 ? 0.5 : 1;
        // retarget (staggered)
        this.think[i] -= dt;
        let tg = this.tgt[i];
        if (tg >= 0 && this.st[tg] !== ALIVE) tg = -1;
        if (this.think[i] <= 0) {
          this.think[i] = 0.18 + this.rng() * 0.16;
          const ranged = this.rng_[i] > 2;
          tg = this.nearest(i, team ? aggro1 + (ranged ? 4 : 0) : aggro0 + (ranged ? 4 : 0));
          if (team === 1) { const ld = this.lDist(this.x[i], this.z[i]); if (ld < 6.5 && (tg < 0 || ld < 3)) tg = -2; }
          this.tgt[i] = tg;
        }
        let dvx = 0, dvz = 0, sp = this.spd[i] * sm * (team ? 1 : S.speed / 4.3);
        if (team === 0 && this.kind[i] !== 32) sp = sp; // all friendlies share stat speed
        if (tg !== -1) {
          const tx = tg === -2 ? L.x : this.x[tg], tz = tg === -2 ? L.z : this.z[tg];
          const dx = tx - this.x[i], dz = tz - this.z[i], d = Math.sqrt(dx * dx + dz * dz) || 0.001;
          const reach = this.rng_[i] + this.rad[i] + (tg === -2 ? 1.1 : this.rad[tg]);
          this.yaw[i] = Math.atan2(dx, dz);
          if (d > reach) { dvx = dx / d * sp; dvz = dz / d * sp; }
          else {
            this.at[i] -= dt * (team ? 1 : S.atk) * sm;
            if (this.at[i] <= 0) { this.at[i] = this.cd[i] * (0.9 + this.rng() * 0.2); this.attack(i, tg, tx, tz, S); }
          }
        } else {
          // march with slight drift toward lane centre / formation cohesion
          if (team === 0) { if (this.z[i] > front - W.HOLD_DZ) dvz = -sp; dvx = (L.x * 0.15 - this.x[i]) * 0.04 * sp; this.yaw[i] = Math.PI; }
          else { dvz = sp; this.yaw[i] = 0; }
        }
        // steering (weighty, organic)
        const k = Math.min(1, dt * 7);
        this.vx[i] += (dvx - this.vx[i]) * k; this.vz[i] += (dvz - this.vz[i]) * k;
        // separation (crowd pressure) — same + opposite team
        this.separate(i, dt);
        this.x[i] += this.vx[i] * dt; this.z[i] += this.vz[i] * dt;
        if (this.x[i] < -W.LANE) this.x[i] = -W.LANE; else if (this.x[i] > W.LANE) this.x[i] = W.LANE;
        const v = Math.abs(this.vx[i]) + Math.abs(this.vz[i]);
        this.phase[i] += dt * (2 + v * 2.3) * this.stride[i];
        if (team === 1) {
          if (this.z[i] > front + W.BREACH_DZ) { this.hurtLauncher(this.dmg[i] * 1.5 + 2, 'breach'); this.emit('breach', i); this.kill(i, true); if (!this.alive) return; }
        } else if (this.z[i] > front + 14 || this.z[i] < front - 95) this.kill(i, true);
      }
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
            const dx = x - this.x[j], dz = z - this.z[j], rr = ri + this.rad[j], dd = dx * dx + dz * dz;
            if (dd >= rr * rr || dd < 1e-6) continue;
            const d = Math.sqrt(dd), o = (rr - d) / rr, w = this.rad[j] / (ri + this.rad[j]) * 2;
            px += dx / d * o * w; pz += dz / d * o * w; if (++n > 10) break outer;
          }
        }
      }
      this.x[i] += px * dt * 9; this.z[i] += pz * dt * 9;
    }

    attack(i, tg, tx, tz, S) {
      const d = this.def(i), team = this.team[i];
      this.swing[i] = 1;
      let dmg = this.dmg[i], crit = false;
      if (team === 0) { dmg = S.dmg * d.dmg; if (this.rng() < S.crit) { dmg *= 2; crit = true; } }
      if (d.ex) { this.kill(i); return; }                            // bomber: explode on contact
      if (d.he) { // shaman heals nearby enemies, then casts
        for (let j = 0; j < this.hi; j++) if (this.st[j] === ALIVE && this.team[j] === 1 && j !== i) { const dx = this.x[j] - this.x[i], dz = this.z[j] - this.z[i]; if (dx * dx + dz * dz < 16) this.hp[j] = Math.min(this.mhp[j], this.hp[j] + d.he * this.cd[i]); }
        this.emit('heal', i);
      }
      if (d.r) {
        const kind = d.wpn === 'cannon' ? 1 : d.wpn === 'staff' ? 3 : 0;
        let ex = tx, ez = tz;
        if (tg >= 0) { const tof = Math.hypot(tx - this.x[i], tz - this.z[i]) / (kind === 1 ? 11 : 18); ex += this.vx[tg] * tof; ez += this.vz[tg] * tof; }
        this.fire(team, this.x[i], this.z[i], tg, ex, ez, dmg, kind, d.s || 0, 0, kind === 1 ? 11 : 18, crit);
        return;
      }
      if (tg === -2) { this.hurtLauncher(dmg, KM.ENEMY[this.kind[i]].k); return; }
      if (d.s) { this.area(1 - team, tx, tz, d.s, dmg, 0, this.z[i]); this.emit('cleave', i); }
      else this.hurt(tg, dmg, team, this.z[i], crit);
      this.emit('hit', i, tg, crit);
    }

    stepTowers(dt, S) {
      const m = this.t / 60;
      for (let s = 0; s < 6; s++) {
        const t = this.towers[s]; if (!t) continue;
        const slot = KM.TOWER_SLOTS[s]; t.x = slot.x; t.z = this.front + slot.dz; t.born += dt;
        t.recoil = Math.max(0, t.recoil - dt * 4);
        const T = KM.TOWERS[t.type], lv = t.lvl;
        t.cd -= dt * S.towerRate * (1 + 0.15 * (lv - 1));
        if (t.type === 'banner') continue;
        if (t.type === 'barracks') {
          if (t.cd <= 0) { t.cd = T.cd / (1 + 0.25 * (lv - 1)); if (this.count[0] < S.cap + 6 * lv) for (let k = 0; k < 1 + Math.floor(lv / 2); k++) { const j = this.spawn(0, lv >= 4 ? KM.FRIEND[2] : KM.FRIEND[0], t.x - Math.sign(t.x) * 1.2, t.z - 0.5, { hp: S.hp, dmg: S.dmg, spd: S.speed / 4, birth: 0.0001 }); if (j >= 0) { this.vx[j] = -Math.sign(t.x) * 2; this.emit('deploy', j); } } t.recoil = 1; }
          continue;
        }
        if (t.cd > 0) continue;
        // target selection: sniper prefers the toughest enemy, others nearest-to-line
        const R = T.range * S.towerRange * (1 + 0.08 * (lv - 1)); let best = -1, score = -1e9;
        for (let i = 0; i < this.hi; i++) {
          if (this.st[i] !== ALIVE || this.team[i] !== 1) continue;
          const dx = this.x[i] - t.x, dz = this.z[i] - t.z; if (dx * dx + dz * dz > R * R) continue;
          const sc = t.type === 'sniper' ? this.mhp[i] + this.elite[i] * 1e4 : this.z[i];
          if (sc > score) { score = sc; best = i; }
        }
        if (best < 0) { t.cd = 0.15; continue; }
        t.cd = T.cd; t.recoil = 1;
        const tx = this.x[best], tz = this.z[best]; t.aim = Math.atan2(tx - t.x, tz - t.z);
        const dmg = T.dmg * S.towerDmg * (1 + 0.45 * (lv - 1)), speed = t.type === 'cannon' ? 13 : t.type === 'sniper' ? 60 : 24;
        const tof = Math.hypot(tx - t.x, tz - t.z) / speed;
        const kind = t.type === 'cannon' ? 1 : t.type === 'frost' ? 2 : t.type === 'sniper' ? 4 : 0;
        const shots = t.type === 'arrow' ? 1 + Math.floor((lv - 1) / 2) : 1;
        for (let k = 0; k < shots; k++) this.fire(0, t.x, t.z, best, tx + this.vx[best] * tof + (k ? (this.rng() - 0.5) * 1.5 : 0), tz + this.vz[best] * tof, dmg, kind, T.splash ? T.splash * (1 + 0.1 * (lv - 1)) : 0, T.slow ? T.slow + 0.3 * lv : 0, speed, false);
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
        const team = P.team[k], tg = P.tgt[k];
        if (P.spl[k] > 0) { this.area(1 - team, P.ex[k], P.ez[k], P.spl[k], P.dmg[k], P.slow[k], P.sz[k]); if (team === 1 && this.lDist(P.ex[k], P.ez[k]) < P.spl[k] + 0.8) this.hurtLauncher(P.dmg[k] * 0.7, 'siege'); this.emit('impact', P.kind[k], P.ex[k], P.ez[k], P.spl[k]); }
        else if (tg === -2) { if (this.lDist(P.ex[k], P.ez[k]) < 2.2) this.hurtLauncher(P.dmg[k], 'ranged'); }
        else if (tg >= 0 && this.st[tg] === ALIVE) {
          const dx = this.x[tg] - P.ex[k], dz = this.z[tg] - P.ez[k];
          if (dx * dx + dz * dz < 2.5) { this.hurt(tg, P.dmg[k], team, P.sz[k], !!P.crit[k]); this.emit('impact', P.kind[k], P.ex[k], P.ez[k], 0); }
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
    results() {
      return { time: this.t, kills: this.kills, coins: Math.floor(this.coinsTotal), peakArmy: this.peakArmy, distance: Math.floor(this.distance), tokens: KM.tokensFor(this.t, this.kills), reason: this.deathReason, upgrades: this.upgrades };
    }
    activeCount() { let n = 0; for (let i = 0; i < this.hi; i++) if (this.st[i] !== DEAD) n++; return n; }
  }
  Sim.CAP = CAP; Sim.PCAP = PCAP; Sim.CCAP = CCAP; Sim.ALIVE = ALIVE; Sim.DYING = DYING;
  KM.Sim = Sim;

  // Simple autopilot used by tests, soak and the debug "bot" toggle: hover behind the army, dart for nearby coins.
  KM.bot = function (sim, dt, skill) {
    skill = skill == null ? 1 : skill;
    const L = sim.L, C = sim.c; let best = -1, bs = 1e9;
    for (let k = 0; k < C.x.length; k++) if (C.st[k] === 1) { const dz = C.z[k] - sim.front; if (dz < -12 * skill) continue; const s = Math.abs(C.x[k] - L.x) + Math.abs(dz) * 0.5; if (s < bs) { bs = s; best = k; } }
    let near = 0; for (let i = 0; i < sim.hi; i++) if (sim.st[i] === 1 && sim.team[i] === 1 && sim.z[i] > sim.front - 10) near += sim.x[i] - L.x;
    if (best >= 0) sim.moveTo(C.x[best], Math.max(KM.W.OFFZ_MIN, C.z[best] - sim.front));
    else sim.moveTo(L.tx - Math.sign(near) * 0.2, 0);
    if (sim.offer) sim.pick(Math.floor(sim.rng() * sim.offer.length));
  };
})(typeof window !== 'undefined' ? window : globalThis);
