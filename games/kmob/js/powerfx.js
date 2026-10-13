/* KMOB power effects — one readable, distinct battlefield cue per tank power.
   The mechanics live in sim.usePower / sim.stepPowers; this layer only draws them, where they act and for as long as they act:
     LINEBREAKER    gold-white lane beam exactly as wide and as long as the hit band (|dx| < 1.9 m, 48 m), chevrons racing to its end
     ARROW STORM    red-orange targeting reticle on the strike zone for as long as volleys remain; each volley rains visible arrows into it
     ELEMENTAL WAVE cyan wall sweeping the full lane from the army front through its 14 m damage band; frost rings on every slowed enemy
     MERCENARY CALL golden pillar at the tank; a gold marker floats over each mercenary for its whole 30 s life
     FORTRESS SURGE sky-blue hex dome over the tank for the whole hardened-line time (sim.fortT)
   Everything is a persistent mesh (never the particle budget, which thins out in big battles), drawn over the crowd (depthTest off,
   high renderOrder) with restrained additive opacity. Lifetimes run on real frame time, so 2× / 3× game speed never shortens a cue below
   readability; cues that mirror a running mechanic (storm, slow, mercenaries, fortress) follow the simulation state itself. */
(function () {
  const KM = globalThis.KM = globalThis.KM || {};
  KM.PowerFX = class PowerFX {
    constructor(THREE, scene) {
      this.T = THREE; this.scene = scene; this.live = []; this.counts = { linebreaker: 0, arrowstorm: 0, elemental: 0, mercenary: 0, fortress: 0, volley: 0 };
      const add = (m, order) => { m.renderOrder = order; m.frustumCulled = false; m.visible = false; scene.add(m); return m; };
      const mat = (color, op, extra) => new THREE.MeshBasicMaterial(Object.assign({ color, transparent: true, opacity: op, depthTest: false, depthWrite: false, blending: THREE.NormalBlending, side: THREE.DoubleSide }, extra || {}));   // normal blending: additive light washes to white on the bright grass / sand road
      const glow = (color, op) => mat(color, op, { blending: THREE.AdditiveBlending });
      const flat = () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
      // LINEBREAKER: outer band + hot core + 6 chevrons
      this.beamO = add(new THREE.Mesh(flat(), mat(0xff8a00, 0)), 41); this.beamC = add(new THREE.Mesh(flat(), glow(0xfff6d8, 0)), 42); this.beamE = [-1, 1].map(() => add(new THREE.Mesh(flat(), mat(0x7a2a00, 0)), 42));
      const chev = new THREE.Shape(); chev.moveTo(-1, 0.45); chev.lineTo(0, -0.45); chev.lineTo(1, 0.45); chev.lineTo(0.62, 0.45); chev.lineTo(0, -0.05); chev.lineTo(-0.62, 0.45); chev.closePath();
      const chevG = new THREE.ShapeGeometry(chev).rotateX(-Math.PI / 2); this.chev = []; for (let k = 0; k < 6; k++) this.chev.push(add(new THREE.Mesh(chevG, mat(0xfff2c0, 0)), 43));
      // ARROW STORM: reticle (ring + 4 ticks) and a pool of falling arrows
      this.ret = add(new THREE.Group(), 44); const rd = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.035, 72).rotateX(-Math.PI / 2), mat(0x3a0800, 0.55)); this.ret.add(rd); const rr = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 72).rotateX(-Math.PI / 2), mat(0xff2a10, 0.95)); this.ret.add(rr);
      const rr2 = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.585, 60).rotateX(-Math.PI / 2), mat(0xff6a1a, 0.8)); this.ret.add(rr2);
      for (let k = 0; k < 4; k++) { const t = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.34).rotateX(-Math.PI / 2), mat(0xff2a10, 0.95)); const a = k * Math.PI / 2; t.position.set(Math.sin(a) * 1.12, 0, Math.cos(a) * 1.12); t.rotation.y = a; this.ret.add(t); }
      this.retMats = this.ret.children.map(c => c.material);
      this.ARN = 72; this.arrows = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 1.5, 0.07), new THREE.MeshBasicMaterial({ color: 0x3a2410, depthTest: false, depthWrite: false, transparent: true, opacity: 0.95 }), this.ARN);
      this.arrows.instanceMatrix.setUsage(THREE.DynamicDrawUsage); add(this.arrows, 45); this.arrows.visible = true; this.arrows.count = 0;
      this.ar = Array.from({ length: this.ARN }, () => ({ t: -1, x: 0, z: 0, y0: 10 })); this.arI = 0; this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v3 = new THREE.Vector3(); this.s3 = new THREE.Vector3(1, 1, 1);
      // ELEMENTAL WAVE: vertical wall + frost floor + slowed-enemy rings
      const cv = document.createElement('canvas'); cv.width = 4; cv.height = 64; const cx = cv.getContext('2d'), gr = cx.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,1)'); cx.fillStyle = gr; cx.fillRect(0, 0, 4, 64);
      const wallTex = new THREE.CanvasTexture(cv);
      this.wall = add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat(0x00b4ff, 0, { map: wallTex })), 41); this.frost = add(new THREE.Mesh(flat(), mat(0x0a7cd8, 0)), 40);
      this.SLN = 400; this.slowM = new THREE.InstancedMesh(new THREE.RingGeometry(0.72, 1, 24).rotateX(-Math.PI / 2), mat(0x00c8ff, 0.9), this.SLN); this.slowM.instanceMatrix.setUsage(THREE.DynamicDrawUsage); add(this.slowM, 39); this.slowM.visible = true; this.slowM.count = 0;
      // MERCENARY CALL: pillar + per-mercenary markers
      this.pillar = add(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 14, 28, 1, true), mat(0xffc400, 0)), 41);
      this.MN = 128; this.mercM = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.26), new THREE.MeshBasicMaterial({ color: 0xffd23a, depthTest: false, depthWrite: false, transparent: true, opacity: 0.95 }), this.MN); this.mercM.instanceMatrix.setUsage(THREE.DynamicDrawUsage); add(this.mercM, 46); this.mercM.visible = true; this.mercM.count = 0;
      // FORTRESS SURGE: hex dome (wire) + soft shell
      this.dome = add(new THREE.Mesh(new THREE.IcosahedronGeometry(3.3, 1), mat(0x0090ff, 0, { wireframe: true })), 44); this.shell = add(new THREE.Mesh(new THREE.SphereGeometry(3.25, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x3fa8ff, 0)), 43);
      this.st = {};   // per-power running state (real-time clocks)
    }
    // a power fired (sim 'power' event, emitted exactly once per activation)
    start(id, d, sim) {
      const L = sim.L; this.counts[id] = (this.counts[id] || 0) + 1;
      if (id === 'linebreaker') this.st.lb = { t: 0, x: d.x, z0: d.z0, z1: d.z1 };
      else if (id === 'arrowstorm') this.st.as = { t: 0, x: d.x, z: d.z };
      else if (id === 'elemental') { const zf = d.z + 7; this.st.el = { t: 0, zf, z1: zf - 14 }; }
      else if (id === 'mercenary') this.st.mc = { t: 0, x: L.x, z: L.z };
      else if (id === 'fortress') this.st.fo = { t: 0 };
    }
    volley(x, z) { this.counts.volley++; if (this.st.as) { this.st.as.x = x; this.st.as.z = z; this.st.as.hit = 0.45; }
      for (let k = 0; k < 24; k++) { const a = this.ar[this.arI = (this.arI + 1) % this.ARN], r = Math.sqrt(Math.random()) * 5.4, th = Math.random() * 6.283; a.t = -Math.random() * 0.12; a.x = x + Math.cos(th) * r; a.z = z + Math.sin(th) * r; a.y0 = 9 + Math.random() * 3; } }
    // per frame, real time dt (game speed never shortens a cue)
    update(sim, dt) {
      const S = this.st, L = sim.L, ease = t => 1 - (1 - t) * (1 - t);
      // LINEBREAKER: 0.12 s sweep to full length, hold 0.35 s, fade 0.6 s
      { const s = S.lb, on = !!s; this.beamO.visible = this.beamC.visible = on; for (const c of this.chev) c.visible = on; for (const e of this.beamE) e.visible = on;
        if (s) { s.t += dt; const grow = Math.min(1, s.t / 0.12), len = (s.z0 - s.z1) * grow, a = s.t < 0.47 ? 1 : Math.max(0, 1 - (s.t - 0.47) / 0.6), zc = s.z0 - len / 2;
          this.beamO.scale.set(3.8, 1, len); this.beamO.position.set(s.x, 0.12, zc); this.beamO.material.opacity = 0.55 * a; this.beamE.forEach((e, k) => { e.visible = true; e.scale.set(0.18, 1, len); e.position.set(s.x + (k ? 1 : -1) * 1.95, 0.13, zc); e.material.opacity = 0.85 * a; });
          this.beamC.scale.set(1.0 + 0.4 * Math.sin(s.t * 40), 1, len); this.beamC.position.set(s.x, 0.14, zc); this.beamC.material.opacity = 0.85 * a;
          this.chev.forEach((c, k) => { const p = ((s.t * 2.2) + k / 6) % 1; c.position.set(s.x, 0.16, s.z0 - p * (s.z0 - s.z1)); c.scale.set(1.5, 1, 1.5); c.material.opacity = 0.9 * a * Math.min(1, grow * 2); });
          if (a <= 0) S.lb = null; } }
      // ARROW STORM: reticle while the storm runs (or 0.9 s), pulsing on each volley
      { const s = S.as, on = !!s; this.ret.visible = on;
        if (s) { s.t += dt; s.hit = Math.max(0, (s.hit || 0) - dt); const alive = !!sim.storm, a = alive || s.t < 0.9 ? Math.min(1, s.t / 0.15) : Math.max(0, 1 - (s.t - Math.max(0.9, s.endT || 0.9)) / 0.5);
          if (!alive && s.endT == null) s.endT = Math.max(0.9, s.t);
          const pulse = 1 + 0.08 * Math.sin(s.t * 9) + 0.25 * (s.hit / 0.45); this.ret.position.set(s.x, 0.18, s.z); this.ret.scale.setScalar(7 * pulse); this.ret.rotation.y = s.t * 0.9;
          this.retMats.forEach(m => { m.opacity = (m.userData.o != null ? m.userData.o : (m.userData.o = m.opacity)) * a; }); if (a <= 0 && !alive) S.as = null; } }
      { let n = 0; for (const a of this.ar) { if (a.t < -0.5 || a.t > 1.2) continue; a.t += dt; if (a.t < 0) continue; const fall = Math.min(1, a.t / 0.32), y = a.y0 * (1 - fall) + 0.55 * fall;
          if (a.t > 1.2) continue; this.v3.set(a.x, y, a.z); this.q.setFromAxisAngle(this.v3.clone().set(1, 0, 0), 0.25); this.m4.compose(this.v3, this.q, this.s3); this.arrows.setMatrixAt(n++, this.m4); if (n >= this.ARN) break; }
        this.arrows.count = n; this.arrows.instanceMatrix.needsUpdate = true; }
      // ELEMENTAL WAVE: wall sweeps the 14 m band in 0.45 s, frost floor fades over 1.6 s
      { const s = S.el, on = !!s; this.wall.visible = this.frost.visible = on;
        if (s) { s.t += dt; const p = ease(Math.min(1, s.t / 0.45)), z = s.zf - p * (s.zf - s.z1), aw = s.t < 0.45 ? 1 : Math.max(0, 1 - (s.t - 0.45) / 0.35), af = Math.max(0, 1 - s.t / 1.6);
          this.wall.scale.set(2 * KM.W.LANE + 1, 2.8, 1); this.wall.position.set(0, 1.4, z); this.wall.material.opacity = 0.85 * aw;
          const depth = Math.max(0.5, s.zf - z); this.frost.scale.set(2 * KM.W.LANE, 1, depth); this.frost.position.set(0, 0.1, s.zf - depth / 2); this.frost.material.opacity = 0.38 * af;
          if (aw <= 0 && af <= 0) S.el = null; } }
      { let n = 0; for (let i = 0; i < sim.hi && n < this.SLN; i++) if (sim.st[i] === 1 && sim.team[i] === 1 && sim.slow[i] > 0) { const r = Math.max(0.55, sim.ft[i] + 0.25) * (1 + 0.06 * Math.sin(this.tm * 8 + i)); this.v3.set(sim.x[i], 0.2, sim.z[i]); this.q.identity(); this.s3.set(r, 1, r); this.m4.compose(this.v3, this.q, this.s3); this.slowM.setMatrixAt(n++, this.m4); }
        this.s3.set(1, 1, 1); this.slowM.count = n; this.slowM.instanceMatrix.needsUpdate = true; }
      // MERCENARY CALL: pillar 0.9 s; a gold marker over each living mercenary
      { const s = S.mc; this.pillar.visible = !!s;
        if (s) { s.t += dt; const a = s.t < 0.25 ? s.t / 0.25 : Math.max(0, 1 - (s.t - 0.25) / 0.65); this.pillar.position.set(L.x, 7, L.z - 2.5); this.pillar.scale.set(1 + s.t * 0.8, 1, 1 + s.t * 0.8); this.pillar.material.opacity = 0.45 * a; if (a <= 0 && s.t > 0.3) S.mc = null; }
        let n = 0; for (let i = 0; i < sim.hi && n < this.MN; i++) if (sim.st[i] === 1 && !sim.team[i] && sim.merc[i]) { this.v3.set(sim.x[i], 1.25 * sim.sc[i] + 0.55 + 0.12 * Math.sin(this.tm * 4 + i), sim.z[i]); this.q.setFromAxisAngle(this.v3.clone().set(0, 1, 0), this.tm * 2 + i); this.m4.compose(this.v3, this.q, this.s3); this.mercM.setMatrixAt(n++, this.m4); }
        this.mercM.count = n; this.mercM.instanceMatrix.needsUpdate = true; }
      // FORTRESS SURGE: dome pops in 0.3 s, holds while sim.fortT > 0, fades 0.5 s
      { const s = S.fo, on = !!s; this.dome.visible = this.shell.visible = on;
        if (s) { s.t += dt; const pop = Math.min(1, s.t / 0.3), hold = (sim.fortT || 0) > 0 || s.t < 0.8; if (!hold && s.endT == null) s.endT = s.t; const a = hold ? 1 : Math.max(0, 1 - (s.t - s.endT) / 0.5);
          const sc = 0.4 + 0.6 * ease(pop); this.dome.position.set(L.x, 0, L.z); this.shell.position.set(L.x, 0, L.z); this.dome.scale.setScalar(sc); this.shell.scale.setScalar(sc); this.dome.rotation.y = s.t * 0.4;
          this.dome.material.opacity = Math.min(1, 0.75 + 0.2 * Math.sin(s.t * 5) + (s.t < 0.4 ? 0.25 : 0)) * a; this.shell.material.opacity = (0.18 + (s.t < 0.4 ? 0.22 : 0)) * a; if (a <= 0) S.fo = null; } }
      this.tm = (this.tm || 0) + dt;
    }
    // what is on screen right now (tests / evidence)
    state() { return { beam: this.beamO.visible ? +this.beamO.material.opacity.toFixed(2) : 0, reticle: this.ret.visible, arrows: this.arrows.count, wall: this.wall.visible ? +this.wall.material.opacity.toFixed(2) : 0, slowRings: this.slowM.count, pillar: this.pillar.visible, mercMarks: this.mercM.count, dome: this.dome.visible, counts: Object.assign({}, this.counts) }; }
  };
})();
