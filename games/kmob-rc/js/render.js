/* KMOB renderer — three.js r128. Instanced crowds (one draw call per body part for every unit on screen),
   streamed battlefield chunks, launcher + towers with visible level evolution, pooled coins/projectiles/particles. */
(function (G) {
  const KM = G.KM, W = KM.W;
  const V3 = THREE.Vector3, M4 = THREE.Matrix4, Q = THREE.Quaternion, E = THREE.Euler, C = THREE.Color;
  const TEAM = [new C(0x2f74ff), new C(0xe2312c)];
  const ENEMY_COL = { grunt: 0xe2312c, imp: 0xf0463a, shield: 0xd02a2e, runner: 0xe83c2c, archer: 0xd8352f, knight: 0xa51f2c, brute: 0xd0262c, bomber: 0xe8482a, cannon: 0x9a2a2a, shaman: 0xc0242c, warlord: 0x9a1424, spearman: 0xc8302a, giant: 0x8e1c22, titan: 0x7a1020, colossus: 0x5e1a24, hunter: 0x8a2a10 };
  const ERA_TINT = [0xffffff, 0xf2d6d6, 0xd9b8c0, 0xc8a8d8, 0xb0b0b8, 0x9ad8ff];

  // ---------- geometry helpers ----------
  function part(geo, color, tint, mat) { const g = geo.index ? geo.toNonIndexed() : geo.clone(); if (mat) g.applyMatrix4(mat); g.userData = { color: new C(color), tint }; return g; }
  function merge(parts) {
    let n = 0; for (const p of parts) n += p.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), tin = new Float32Array(n);
    let o = 0;
    for (const p of parts) {
      const c = p.attributes.position.count; pos.set(p.attributes.position.array, o * 3); nor.set(p.attributes.normal.array, o * 3);
      const cc = p.userData.color; for (let k = 0; k < c; k++) { col[(o + k) * 3] = cc.r; col[(o + k) * 3 + 1] = cc.g; col[(o + k) * 3 + 2] = cc.b; tin[o + k] = p.userData.tint || 0; }
      o += c;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aTint', new THREE.BufferAttribute(tin, 1));
    g.computeBoundingSphere(); return g;
  }
  const T = (x, y, z) => new M4().makeTranslation(x, y, z);
  const TRS = (x, y, z, rx, ry, rz, sx, sy, sz) => new M4().compose(new V3(x, y, z), new Q().setFromEuler(new E(rx || 0, ry || 0, rz || 0)), new V3(sx || 1, sy == null ? (sx || 1) : sy, sz == null ? (sx || 1) : sz));

  // Material whose instance colour only tints vertices flagged aTint=1 (team cloth/armour), leaving skin/metal untouched.
  function tintMat(opts) {
    const m = new THREE.MeshLambertMaterial(Object.assign({ vertexColors: true }, opts || {}));
    m.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aTint;')
        .replace('#include <color_vertex>', `#if defined(USE_COLOR) || defined(USE_INSTANCING_COLOR)
          vColor = vec3(1.0);
        #endif
        #ifdef USE_COLOR
          vColor.xyz *= color.xyz;
        #endif
        #ifdef USE_INSTANCING_COLOR
          vColor.xyz *= mix(vec3(1.0), instanceColor.xyz, aTint);
        #endif`);
    };
    return m;
  }

  function radialTex(inner, outer) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); return t;
  }

  // value noise for terrain (world-space so chunk seams always match)
  const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
  const noise = (x, z) => { const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    return (hash(xi, zi) * (1 - u) + hash(xi + 1, zi) * u) * (1 - v) + (hash(xi, zi + 1) * (1 - u) + hash(xi + 1, zi + 1) * u) * v; };
  const fbm = (x, z) => noise(x, z) * 0.6 + noise(x * 2.1, z * 2.1) * 0.3 + noise(x * 4.3, z * 4.3) * 0.1;

  class Render {
    constructor(canvas, opts) {
      this.opts = opts || {};
      const R = this.R = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
      this.dpr = Math.min(window.devicePixelRatio || 1, this.opts.lowPower ? 1.5 : 2); R.setPixelRatio(this.dpr);
      R.toneMapping = THREE.NoToneMapping; // authored colours are display colours (stylized look)
      R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
      const S = this.scene = new THREE.Scene();
      this.fogCol = new C(0xbfe3ff); S.fog = new THREE.Fog(this.fogCol, 55, 135); S.background = this.skyTex();
      this.cam = new THREE.PerspectiveCamera(50, 1, 0.5, 260);
      S.add(this.hemi = new THREE.HemisphereLight(0xf4eee6, 0xa07a4e, 0.64));
      const sun = this.sun = new THREE.DirectionalLight(0xffd9a4, 0.9); sun.position.set(10, 26, 12); sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 34, bottom: -34, near: 1, far: 90 }); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
      S.add(sun); S.add(sun.target);
      this.ry = new Float32Array(KM.Sim.CAP); this.shake = 0; this.time = 0; this.skin = KM.SKIN_BY.skin_royal; this.classTint = {};
      this.m = new M4(); this.m2 = new M4(); this.q = new Q(); this.e = new E(0, 0, 0, 'YXZ'); this.v = new V3(); this.s3 = new V3(); this.col = new C();
      this.col2 = new C(); this.fxBudget = 60; this.farKey = {}; this.lodNear = this.opts.lowPower ? 80 : 120; this.lodMid = this.opts.lowPower ? 300 : 450;
      this.initCrowd(); this.initWorld(); this.initFx(); this.initProjectiles(); this.initCoins();
      this.launcher = this.buildLauncher(); S.add(this.launcher);
      // the launcher is always on screen: ~140 meshes → one draw per shared material within each stage group
      for (const w of this.wheels) this.batchStatic(w);                              // each spinning wheel → one vertex-coloured mesh
      { const keep = [this.lBody, ...Object.values(this.lStage), ...this.wheels, ...this.barrels, ...this.barrels.map(b => b.userData.brake), this.turret, this.crown, this.core, this.halo, this.eRing, this.hpRing, this.magRing, this.lGlow, ...this.capsules].filter(Boolean);
        this.lBatched = this.batchStatic(this.launcher, { byMaterial: true, mergeFixed: true, keep: keep.concat([this.lPod, this.lAnt, this.lEmit]), deep: this.flags, pinned: [this.lPaint, this.lPaint2, this.lGold] }); }
      // force-field bubble (state read from the shield itself: bright → flicker when weak → burst → slow rebuild)
      this.shieldMat = new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      this.shieldM = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), this.shieldMat); this.shieldM.visible = false; S.add(this.shieldM);
      this.towerObjs = [null, null, null, null]; this.dyingObjs = [];
      this.tracers = []; for (let k = 0; k < 8; k++) { const tr = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1), new THREE.MeshBasicMaterial({ color: 0xe4c2ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); tr.visible = false; this.scene.add(tr); this.tracers.push(tr); }
      this.resize();
    }

    skyTex() {
      const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#5aa8f0'); gr.addColorStop(0.55, '#a8d8ff'); gr.addColorStop(1, '#e6f4ff');
      g.fillStyle = gr; g.fillRect(0, 0, 4, 256); const t = new THREE.CanvasTexture(c); return t;
    }

    // Quality tier: pixel ratio, shadows, animated-unit budgets, VFX density, emissive glow, optional bloom.
    applyQuality(name) {
      const Q0 = KM.QUALITY[name] || KM.QUALITY.medium, Q = this.opts.mobile ? Object.assign({}, Q0, KM.QUALITY_MOBILE[name] || {}) : Q0; this.quality = name; this.Q = Q;
      this.dpr = Math.min(window.devicePixelRatio || 1, Q.dpr); this.R.setPixelRatio(this.dpr);
      this.R.shadowMap.enabled = Q.shadows; this.sun.castShadow = Q.shadows;
      if (this.sun.shadow.mapSize.x !== Q.shadowMap) { this.sun.shadow.mapSize.set(Q.shadowMap, Q.shadowMap); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
      this.lodNear = Q.lodNear; this.lodMid = Q.lodMid; this.fxScale = Q.fx; this.decorShadows = Q.decorShadows !== false;
      for (const [, g] of this.chunks || []) g.traverse(o => { if (o.userData.decor && o.isMesh && !o.userData.gateZ) o.castShadow = this.decorShadows; }); this.glow = Q.glow; KM.glowLevel = Q.glow;
      this.scene.traverse(o => { const m = o.material; if (m && m.userData && m.userData.shader && m.userData.shader.uniforms.uGlow) m.userData.shader.uniforms.uGlow.value = Q.glow; });
      this.setBloom(Q.bloom && (KM.bloomAllowed || false));
      this.resize(); return Q;
    }
    setBloom(on) {
      this.bloomOn = !!on; if (!on || this.composer) return;
      if (!THREE.EffectComposer) { if (!this.bloomLoading) { this.bloomLoading = true; this.bloomReady = KM.loadScripts(['vendor/post/CopyShader.js', 'vendor/post/LuminosityHighPassShader.js', 'vendor/post/EffectComposer.js', 'vendor/post/RenderPass.js', 'vendor/post/ShaderPass.js', 'vendor/post/UnrealBloomPass.js']).then(() => this.setBloom(this.bloomOn)).catch(e => { this.bloomOn = false; this.bloomLoading = false; this.bloomErr = String(e && e.message || e); }); } return; }   // a failed load can be retried later
      const c = this.composer = new THREE.EffectComposer(this.R); c.addPass(new THREE.RenderPass(this.scene, this.cam));
      this.bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.5, 0.82); c.addPass(this.bloomPass); this.resize();
    }
    resize() {
      const w = innerWidth, h = innerHeight; this.R.setSize(w, h, false); if (this.composer) { this.composer.setPixelRatio(this.R.getPixelRatio()); this.composer.setSize(w, h); } this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); this.aspect = w / h;
    }

    // ---------- crowd ----------
    initCrowd() {
      const kit = this.kit = KM.buildKit(), N = KM.Sim.CAP, A = KM.ANIM;
      const caps0 = { padsIron: N, hornsAdd: N, eyesGlow: N, lStd: N * 2, lBrute: 1024, tLight: N, tHeavy: 2048, tBrute: 512, tRobe: 512, aStd: N * 2, aHeavy: 4096, aBrute: 1024, sword: N, swordGold: N, shield: 2048, pads: N, plume: N, cannon: 256 }, caps = {};
      Object.assign(caps, caps0, { m_leg: N * 2, m_legB: 1024, m_arm: N * 2, m_armB: 1024, m_shield: 2048, m_w_sword: N, m_w_swordGold: N, m_th_soldier: N, m_th_grunt: N, m_th_imp: N, F_std: N, F_shield: 4096, F_brute: 2048,
        m_w_swordS: 2048, m_th_archerF: 2048, m_w_bowF: 2048, F_melee: 2048, F_range: 2048 });
      // two shared cel materials (faction-tinted parts / plain parts) instead of one per part: consecutive part draws reuse the
      // bound material, so per-draw uniform/state setup happens once per variant (the tint variant needs instanceColor)
      const shared = this.crowdMats = [KM.toonMat(), KM.toonMat()]; for (const m of shared) m.userData.shared = true;
      const mk = (geo, n, color) => { const im = new THREE.InstancedMesh(geo, shared[color ? 1 : 0], n); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.count = 0; if (color) { im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); im.instanceColor.setUsage(THREE.DynamicDrawUsage); } this.scene.add(im); return im; };
      this.partM = {}; this.pn = {}; this.shieldKey = {};
      for (const [k, g] of Object.entries(kit.parts)) { const tinted = g.attributes.aTint.array.some(v => v > 0); this.partM[k] = mk(g, caps[k] || 1024, tinted); this.pn[k] = 0; }
      // (kit.statues — per-kind ~400-tri statues — stay in the kit as reference; the crowd draws the shared F_* far families)
      this.kindKey = []; for (const d of KM.ENEMY) this.kindKey[d.id] = d.k; for (const d of KM.FRIEND) this.kindKey[d.id] = d.k;
      // animation state per unit slot
      this.pose = new Float32Array(N * A.P); this.prev = new Float32Array(N * A.P); this.clip = new Int16Array(N).fill(-1); this.pvel = new Float32Array(N); this.accL = new Float32Array(N); this.fade = new Float32Array(N); this.animT = new Uint8Array(N);
      this.tmpPose = new Float32Array(A.P); this.vv = {}; this.mats = Array.from({ length: 10 }, () => new M4()); this.frameNo = 0;
      // MIZARD crystal glow: one additive camera-facing sprite per staff tip (a single extra draw); the tip also anchors the heal beam
      this.tipX = new Float32Array(N); this.tipY = new Float32Array(N); this.tipZ = new Float32Array(N); this.tipF = new Uint32Array(N); this.glowPulse = new Float32Array(N);
      this.glowM = mk(new THREE.PlaneGeometry(1, 1), 512, false); this.glowM.material = new THREE.MeshBasicMaterial({ map: radialTex('rgba(150,215,255,0.95)', 'rgba(60,140,255,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); this.glowM.renderOrder = 2;
      const blob = new THREE.MeshBasicMaterial({ map: radialTex('rgba(20,20,40,0.45)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false });
      this.blob = mk(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), N, false); this.blob.material = blob; this.blob.renderOrder = 1;
      this.ringM = mk(new THREE.RingGeometry(0.8, 1, 28).rotateX(-Math.PI / 2), 160, false); this.ringM.material = new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.45, depthWrite: false });
    }

    put(im, n, m) { m.toArray(im.instanceMatrix.array, n * 16); }
    putP(name, m, col) {
      const im = this.partM[name], n = this.pn[name]; if (n >= im.instanceMatrix.count) return;
      m.toArray(im.instanceMatrix.array, n * 16);
      if (col && im.instanceColor) { const a = im.instanceColor.array; a[n * 3] = col.r; a[n * 3 + 1] = col.g; a[n * 3 + 2] = col.b; }
      this.pn[name] = n + 1;
    }

    // staff crystal: remember the tip for the heal beam and place one camera-facing glow sprite on it
    tip(i, p, s, n) { this.tipX[i] = p.x; this.tipY[i] = p.y; this.tipZ[i] = p.z; this.tipF[i] = this.frameTip; if (n >= 512) return; const g = 0.62 * s * (1 + Math.sin(this.time * 5 + i) * 0.08) * (1 + this.glowPulse[i] * 1.4);
      this.m2.compose(p, this.cam.quaternion, (this.gv || (this.gv = new V3())).set(g, g, g)); this.put(this.glowM, n, this.m2); }
    // Pose one unit: pick clip from sim state, cross-fade on change, add hit reactions; half-rate at mid LOD.
    animate(sim, i, dt, lodLevel) {
      const A = KM.ANIM, P = A.P, o = i * P, v = A.variation(i, sim.stride[i] * 10, this.vv);
      if (lodLevel === 1 && ((this.frameNo + i) & 1) && this.clip[i] >= 0) return v;       // mid LOD: reuse last pose on alternate frames
      let id = A.select(sim, i, v);
      if (this.cheerT > 0 && sim.team[i] === 0 && sim.st[i] === 1 && sim.swing[i] <= 0 && sim.birth[i] <= 0 && v.seed < 0.7) id = A.ID.cheer; // brief celebration after an upgrade
      const pose = this.pose.subarray(o, o + P), tmp = this.tmpPose;
      if (id !== this.clip[i]) { if (this.clip[i] >= 0) this.prev.set(pose, o); else this.prev.fill(0, o, o + P); this.clip[i] = id; this.fade[i] = this.clip[i] >= A.ID.deathA ? 0.6 : 0; }
      A.sample(id, A.clipTime(sim, i, id, v), v, tmp);
      this.fade[i] = Math.min(1, this.fade[i] + dt / A.FADE);
      const w = this.fade[i] * this.fade[i] * (3 - 2 * this.fade[i]);
      for (let k = 0; k < P; k++) pose[k] = this.prev[o + k] + (tmp[k] - this.prev[o + k]) * w;
      if (sim.st[i] === 1) {
        const f = Math.max(0, sim.flash[i]);
        if (f > 0) { const kb = Math.abs(sim.vz[i]) > sim.spd[i] * 1.6; A.additive(pose, kb ? 'stagger' : v.seed2 < 0.5 ? 'hitFront' : v.seed < 0.5 ? 'hitLeft' : 'hitRight', f * (kb ? 1 : 0.85)); }
      }
      return v;
    }

    drawCrowd(sim, dt) {
      const A = KM.ANIM, I = A.I, P = A.P, M = this.mats, q = this.q, e = this.e, pos = this.v, sc = this.s3, col = this.col, col2 = this.col2;
      const S = sim.stats, colCap = S.colCap;
      for (const k in this.pn) this.pn[k] = 0;
      let nb = 0, nr = 0; this.frameNo++;
      const blue = TEAM[0], camZ = this.cam.position.z, camX = this.cam.position.x, crowd = sim.count[0] + sim.count[1], flipCam = !!(KM.camFocus && KM.camFocus.flip);
      // budgeted LOD thresholds from a camera-distance histogram
      const hist = this.lodHist || (this.lodHist = new Uint16Array(160)), dist = this.lodDist || (this.lodDist = new Float32Array(KM.Sim.CAP)); hist.fill(0);
      for (let i = 0; i < sim.hi; i++) { if (!sim.st[i]) continue; const dx = sim.x[i] - camX, dz = sim.z[i] - camZ, d = Math.sqrt(dx * dx + dz * dz); dist[i] = d; hist[Math.min(159, d | 0)]++; }
      const LB = A.lodBudget(hist, this.lodNear, this.lodMid, this.lodB || (this.lodB = {}));
      const rot = (m, x, y, z, rx, ry, rz) => { e.set(rx, ry, rz, 'YXZ'); m.makeRotationFromEuler(e); m.setPosition(x, y, z); return m; };
      let drawn = 0, ng = 0; this.frameTip = (this.frameTip || 0) + 1;
      for (let i = 0; i < sim.hi; i++) {
        const st = sim.st[i]; if (!st) { this.clip[i] = -1; continue; } if (this.glowPulse[i] > 0) this.glowPulse[i] = Math.max(0, this.glowPulse[i] - dt * 3);
        const z = sim.z[i]; if (flipCam ? (z < camZ - 3 || z > camZ + 125) : (z > camZ + 3 || z < camZ - 125)) continue;
        const team = sim.team[i], def = sim.def(i), key = this.kindKey[sim.kind[i]], R = KM.RECIPE[key];
        let s = sim.sc[i];   // class levels never rescale a model
        let dy = sim.yaw[i] - this.ry[i]; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); this.ry[i] += dy * Math.min(1, dt * (8 + (i % 5)));
        let y = 0;
        if (st === 2) { const d = sim.die[i]; y -= Math.max(0, d - 0.45) * 1.1; s *= 1 - Math.max(0, d - 0.5) / 0.22; if (s <= 0.02) continue; }
        const b = sim.birth[i]; if (b > 0) { const u = b / 0.4; y += Math.sin(u * Math.PI) * 1.25; s *= 0.55 + 0.45 * u; }
        // colour: faction, era, flash, frost
        col.setHex(team ? ENEMY_COL[def.k] : this.classTint[def.id] != null ? this.classTint[def.id] : def.col ? 0x3f7cff : def.med ? 0x3a66f0 : def.big ? 0x2a5fd8 : blue.getHex());   // the whole army reads BLUE; Armory skins tint their class
        if (team === 1 && sim.era[i]) col.multiply(col2.setHex(ERA_TINT[sim.era[i]]));
        if (team === 0 && def.k === 'knightF') col.lerp(col2.setHex(0x6aa0ff), 0.35);
        if (sim.slow[i] > 0) col.lerp(col2.setHex(0x9fe8ff), 0.45);
        const f = Math.max(0, sim.flash[i]); if (f > 0) col.lerp(col2.setRGB(1, 1, 1), f * 0.7);
        const dd = dist[i], lodL = dd < LB.near ? 0 : dd < LB.mid ? 1 : 2;
        drawn++;
        if (R.body) { // siege cannon: rigid body with recoil
          const rec = sim.swing[i] > 0 ? Math.sin((1 - sim.swing[i]) * Math.PI) * 0.25 : 0;
          rot(M[0], sim.x[i], y, z - Math.cos(this.ry[i]) * rec, -rec * 0.4, this.ry[i], 0); M[0].scale(sc.set(s, s, s)); this.putP('cannon', M[0], col);
        } else if (lodL === 2 && st === 1) { // far: single merged statue with bob + lean
          const sp = Math.abs(sim.vx[i]) + Math.abs(sim.vz[i]), ph = sim.phase[i];
          rot(M[0], sim.x[i], y + (sp > 0.45 ? Math.abs(Math.cos(ph)) * 0.07 * s : 0), z, sp > 0.45 ? 0.12 : 0, this.ry[i], Math.sin(ph) * 0.06); M[0].scale(sc.set(s, s, s));
          const fam = this.farKey[key] || (this.farKey[key] = KM.farFamily(R)); this.putP(fam, M[0], col); this.clip[i] = -1;
          if (fam === 'F_mizard') { pos.set(KM.FAR_TIP[0], KM.FAR_TIP[1], KM.FAR_TIP[2]).applyMatrix4(M[0]); this.tip(i, pos, s, ng++); }
        } else {
          const v = this.animate(sim, i, dt, lodL), p = this.pose, o = i * P;
          const mid = lodL === 1, golem = R.torso === 'tGolem', brute = R.torso === 'tBrute';
          const LEG = mid ? (golem ? 'm_legG' : brute ? 'm_legB' : 'm_leg') : R.leg, ARM = mid ? (golem ? 'm_armG' : brute ? 'm_armB' : 'm_arm') : R.arm;
          // root (pivot at feet so falls topple naturally)
          // acceleration / braking lean (centre of mass leads when speeding up, rocks back when stopping)
          const spd = Math.hypot(sim.vx[i], sim.vz[i]), acc = (spd - this.pvel[i]) / Math.max(dt, 1e-3); this.pvel[i] = spd;
          this.accL[i] += (Math.max(-0.22, Math.min(0.2, acc * 0.035)) - this.accL[i]) * Math.min(1, dt * 8);
          rot(M[0], sim.x[i], y + p[o + I.y] * s, z, p[o + I.rootP] + (st === 1 ? this.accL[i] : 0), this.ry[i] + p[o + I.rootY], p[o + I.rootR]); M[0].scale(sc.set(s, s, s));
          KM.poseRig(R, p, o, M);   // every class keeps its reference weapon at every level and posture (Melee sword + kite, Range bow)
          this.putP(LEG, M[1], col); this.putP(LEG, M[2], col);
          // torso (+ head, separate bone at full LOD; merged into the torso piece at mid LOD)
          if (mid) this.putP('m_th_' + key, M[3], col);
          else {
            this.putP(R.torso, M[3], col); this.putP(R.head, M[4], col);
            if (team === 1) { const era = sim.era[i];                                   // red faction silhouette: spiked iron pauldrons + horns; later eras look harsher
              if (R.torso === 'tLight' || key === 'knight') this.putP('padsIron', M[3]);
              if (key === 'spearman' || (era >= 2 && (key === 'runner' || key === 'bomber'))) this.putP('hornsAdd', M[4]);
              if (era >= 3 && R.head !== 'hShaman' && R.head !== 'hImp') this.putP('eyesGlow', M[4]); }
          }
          // arms + held items
          this.putP(ARM, M[5], col); this.putP(ARM, M[6], col);
          const wk = R.wpn;
          if (wk !== 'none') this.putP(mid ? 'm_w_' + wk : wk, M[7], col);   // (only tinted weapon parts take the colour)
          if (wk === 'staff') { pos.set(0, 0, KM.STAFF_TIP).applyMatrix4(M[7]); this.tip(i, pos, s, ng++); }
          if (key === 'collector' && sim.carry[i] > 0) { const ls = 0.55 + Math.min(1, sim.carry[i] / colCap) * 0.9; M[9].makeScale(ls, ls, ls); M[9].setPosition(0, KM.rigOf(R).fist, 0.03); M[9].premultiply(M[5]); this.putP(mid ? 'm_w_sack' : 'sack', M[9]); }   // Looter: loot sack in the free hand
          if (R.shield && !(mid && R.midShield)) { const sk = this.shieldKey[key] || (this.shieldKey[key] = KM.shieldOf(R)); this.putP(mid ? 'm_' + sk : sk, M[8], col); }   // (mid Melee / Elite: shield inside the torso piece)
          // sword trail accent on near units mid-swing (density-scaled)
          if (lodL === 0 && sim.swing[i] > 0.35 && sim.swing[i] < 0.62 && this.fxBudget > 0 && Math.random() < 0.5) { this.fxBudget--; pos.set(0, 0, wk === 'pike' ? KM.PIKE.tip - 0.2 : 0.55).applyMatrix4(M[7]); this.emit(pos.x, pos.y, pos.z, 0, 0, 0, team ? 0xffd0c0 : 0xd8ecff, 0.32, 0.14, 0); }
        }
        if (nb < 4096) { q.identity(); const bs = s * (R.body ? 1.6 : KM.isBig(R) ? 1.3 : 0.85); pos.set(sim.x[i], 0.03, z); sc.set(bs, 1, bs); M[0].compose(pos, q, sc); this.put(this.blob, nb++, M[0]); }
        if (team === 1 && def.el && st === 1 && nr < (def.boss ? 160 : 24)) { q.identity(); const rs = s * 0.75 * (1 + Math.sin(this.time * 6) * 0.06); pos.set(sim.x[i], 0.05, z); sc.set(rs, 1, rs); M[0].compose(pos, q, sc); this.put(this.ringM, nr++, M[0]); }
      }
      for (const t of sim.towers) if (t && nb < 4096) { q.identity(); pos.set(t.x, 0.03, t.z); sc.set(2.3, 1, 2.9); M[0].compose(pos, q, sc); this.put(this.blob, nb++, M[0]); }   // support vehicles: blob contact shadows
      // upload only the instances written this frame, and skip empty parts entirely (no render-list entry, no program/uniform setup)
      const fin = (im, n) => { im.count = n; im.visible = n > 0; if (!n) return; im.instanceMatrix.updateRange.count = n * 16; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) { im.instanceColor.updateRange.count = n * 3; im.instanceColor.needsUpdate = true; } };
      for (const k in this.partM) fin(this.partM[k], this.pn[k]);
      fin(this.blob, nb); fin(this.ringM, nr); fin(this.glowM, ng);
      this.drawn = drawn;
    }
    // ---------- world streaming ----------
    initWorld() {
      this.col2 = new C();
      this.groundMat = new THREE.MeshLambertMaterial({ vertexColors: true });
      this.decoMat = new THREE.MeshLambertMaterial({ vertexColors: true });
      this.farMat = new THREE.MeshLambertMaterial({ vertexColors: true, fog: true });
      // cheap animated water: Lambert + scrolling procedural ripples and sparkle bands (no textures, no extra passes)
      this.waterGeo = new THREE.PlaneGeometry(7.6, W.CHUNK, 4, 8).rotateX(-Math.PI / 2);
      this.waterMat = new THREE.MeshLambertMaterial({ color: 0x3aa6e6, transparent: true, opacity: 0.9, depthWrite: false });
      this.waterU = { uTime: { value: 0 } };
      this.waterMat.onBeforeCompile = sh => { sh.uniforms.uTime = this.waterU.uTime;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;\nuniform float uTime;')
          .replace('#include <dithering_fragment>', `#include <dithering_fragment>
            float w1 = sin(vWp.z * 1.3 + uTime * 2.2 + sin(vWp.x * 2.1) * 1.4), w2 = sin(vWp.z * 2.9 - uTime * 1.3 + vWp.x * 1.7);
            float edge = 1.0 - smoothstep(2.4, 3.7, abs(vWp.x - sign(vWp.x) * 13.7));
            float spark = smoothstep(0.86, 0.98, w1 * 0.6 + w2 * 0.4);
            gl_FragColor.rgb = mix(gl_FragColor.rgb * vec3(0.8, 0.95, 1.05), vec3(0.9, 0.98, 1.0), spark * 0.7) + vec3(0.06) * w2;
            gl_FragColor.rgb = mix(vec3(0.85, 0.95, 1.0), gl_FragColor.rgb, edge * 0.85 + 0.15);`); };
      this.fallGeo = new THREE.PlaneGeometry(2.6, 4.4, 1, 6);
      this.fallMat = new THREE.MeshBasicMaterial({ color: 0xd6f2ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
      this.fallMat.onBeforeCompile = sh => { sh.uniforms.uTime = this.waterU.uTime; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vU;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvU = uv;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vU;\nuniform float uTime;').replace('#include <dithering_fragment>', '#include <dithering_fragment>\n float st = sin(vU.x * 40.0 + sin(vU.x * 7.0) * 2.0) * 0.5 + 0.5; float fl = fract(vU.y * 3.0 + uTime * 1.6 + st * 0.3); gl_FragColor.rgb = mix(vec3(0.55, 0.82, 0.98), vec3(1.0), smoothstep(0.6, 1.0, fl) * 0.8 + st * 0.15); gl_FragColor.a *= 0.75 + 0.25 * st;'); };
      this.chunks = new Map();
      const D = (geo, color, mat) => part(geo, color, 0, mat);

      this.deco = {
        tree: (c, s) => [D(new THREE.CylinderGeometry(0.18, 0.25, 1.2, 6), 0x7a4e2c, TRS(0, 0.6, 0, 0, 0, 0, s)), D(new THREE.ConeGeometry(1.25, 2.0, 8), c, TRS(0, 1.9 * s, 0, 0, 0, 0, s)), D(new THREE.ConeGeometry(0.95, 1.6, 8), new C(c).offsetHSL(0, 0, 0.06).getHex(), TRS(0, 2.8 * s, 0, 0, 0.4, 0, s))],
        round: (c, s) => [D(new THREE.CylinderGeometry(0.16, 0.22, 1.0, 6), 0x7a4e2c, TRS(0, 0.5, 0, 0, 0, 0, s)), D(new THREE.IcosahedronGeometry(1.0, 1), c, TRS(0, 1.7 * s, 0, 0, 0, 0, s * 1.1, s, s * 1.1))],
        rock: (c, s) => [D(new THREE.DodecahedronGeometry(0.7, 0), c, TRS(0, 0.3 * s, 0, 0.3, 0.7, 0, s * 1.2, s * 0.8, s))],
        post: () => [D(new THREE.BoxGeometry(0.16, 0.9, 0.16), 0x8a5a33, T(0, 0.45, 0)), D(new THREE.BoxGeometry(0.1, 0.1, 2.0), 0xa06a3c, T(0, 0.7, 1.0)), D(new THREE.BoxGeometry(0.1, 0.1, 2.0), 0xa06a3c, T(0, 0.35, 1.0))],
        pillar: (c, s) => [D(new THREE.CylinderGeometry(0.45, 0.5, 2.6 * s, 8), 0xd9d2c3, T(0, 1.3 * s, 0)), D(new THREE.BoxGeometry(1.1, 0.3, 1.1), 0xc9c2b3, T(0, 2.6 * s + 0.15, 0))],
        wall: (c, s) => [D(new THREE.BoxGeometry(2.6, 1.2 * s, 0.6), 0xbdb5a5, T(0, 0.6 * s, 0)), D(new THREE.BoxGeometry(0.7, 0.4, 0.6), 0xbdb5a5, T(-0.9, 1.2 * s + 0.2, 0)), D(new THREE.BoxGeometry(0.7, 0.4, 0.6), 0xbdb5a5, T(0.9, 1.2 * s + 0.2, 0))],
        banner: (c) => [D(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 6), 0x5a3a22, T(0, 1.7, 0)), D(new THREE.BoxGeometry(0.9, 1.3, 0.04), c, T(0.48, 2.6, 0)), D(new THREE.BoxGeometry(0.5, 0.5, 0.06), 0xffffff, T(0.48, 2.65, 0.01)), D(new THREE.SphereGeometry(0.1, 6, 4), 0xf2c14e, T(0, 3.45, 0))],
        flower: (c) => [D(new THREE.SphereGeometry(0.12, 5, 4), c, T(0, 0.12, 0))],
        crystal: (c, s) => [D(new THREE.OctahedronGeometry(0.6), c, TRS(0, 0.8 * s, 0, 0, 0.5, 0.2, s * 0.7, s * 1.6, s * 0.7))],
        bush: (c, s) => [D(new THREE.IcosahedronGeometry(0.7, 1), c, TRS(0, 0.35 * s, 0, 0, 0, 0, s * 1.2, s * 0.85, s)), D(new THREE.IcosahedronGeometry(0.5, 1), new C(c).offsetHSL(0, 0, 0.06).getHex(), TRS(0.5 * s, 0.3 * s, 0.2, 0, 0, 0, s))],
        tuft: (c, s) => [0, 1, 2].map(k => D(new THREE.ConeGeometry(0.06, 0.35, 4), c, TRS(Math.cos(k * 2.1) * 0.08, 0.15 * s, Math.sin(k * 2.1) * 0.08, Math.cos(k * 2.1) * 0.3, 0, Math.sin(k * 2.1) * 0.3, s))),
        sign: () => [D(new THREE.CylinderGeometry(0.07, 0.08, 1.6, 6), 0x7a4e2c, T(0, 0.8, 0)), D(new THREE.BoxGeometry(1.1, 0.42, 0.08), 0xb07a46, T(0.2, 1.35, 0)), D(new THREE.BoxGeometry(0.9, 0.06, 0.09), 0xf2c14e, T(0.2, 1.35, 0.01)), D(new THREE.ConeGeometry(0.22, 0.3, 3), 0xb07a46, TRS(0.82, 1.35, 0, 0, 0, -Math.PI / 2))],
        tent: (c) => [D(new THREE.ConeGeometry(1.4, 1.8, 4), c, TRS(0, 0.9, 0, 0, Math.PI / 4, 0)), D(new THREE.BoxGeometry(0.5, 0.9, 0.05), 0x2a2018, T(0, 0.45, 1.0)), D(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 5), 0x7a4e2c, T(0, 1.2, 0)), D(new THREE.BoxGeometry(0.03, 0.3, 0.45), 0xf2c14e, T(0, 2.2, 0.23))],
        brokenBridge: () => { const L = []; for (const x of [-3.4, -1.6]) { L.push(D(new THREE.BoxGeometry(0.4, 1.8, 0.4), 0x7a4e2c, T(x, 0.2, -1.1))); L.push(D(new THREE.BoxGeometry(0.4, 1.8, 0.4), 0x7a4e2c, T(x, 0.2, 1.1))); }
          for (let k = 0; k < 6; k++) L.push(D(new THREE.BoxGeometry(0.5, 0.12, 2.6), k % 2 ? 0xa06a3c : 0x8a5a33, TRS(-3.6 + k * 0.48, 0.55 - k * 0.05 - (k > 3 ? (k - 3) * 0.25 : 0), 0, 0, 0, k > 3 ? -0.35 : 0)));
          L.push(D(new THREE.BoxGeometry(2.6, 0.1, 0.1), 0x6a4426, TRS(-2.6, 1.0, -1.15, 0, 0, -0.08))); L.push(D(new THREE.BoxGeometry(2.6, 0.1, 0.1), 0x6a4426, TRS(-2.6, 1.0, 1.15, 0, 0, -0.08))); return L; },
        wreck: () => [D(new THREE.BoxGeometry(1.8, 0.25, 0.9), 0x7a4e2c, TRS(0, 0.35, 0, 0, 0, 0.25)), D(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 10), 0x5a3a22, TRS(-0.8, 0.42, 0.55, Math.PI / 2, 0, 0)), D(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 10), 0x5a3a22, TRS(0.6, 0.15, -0.6, 0.3, 0, 1.4)),
          D(new THREE.BoxGeometry(0.14, 1.6, 0.14), 0x8a5a33, TRS(0.3, 0.9, 0, 0, 0, -0.9)), D(new THREE.BoxGeometry(0.5, 0.4, 0.4), 0xd83a3a, TRS(-0.2, 0.6, 0.1, 0.2, 0.4, 0)), D(new THREE.SphereGeometry(0.22, 8, 6), 0x34363f, T(0.9, 0.22, 0.4))],
        stoneRail: () => [D(new THREE.BoxGeometry(0.5, 0.8, 2.2), 0xb8b0a0, T(0, 0.4, 1.1))],
      };
    }

    biomeCol(plan, key) { const a = new C(KM.BIOMES[plan.biome][key]); if (plan.blend > 0) a.lerp(new C(KM.BIOMES[plan.next][key]), plan.blend); return a; }

    buildChunk(i) {
      const plan = KM.chunkPlan(i), CH = W.CHUNK, g = new THREE.Group(); g.userData.plan = plan;
      const grass = this.biomeCol(plan, 'grass'), grass2 = this.biomeCol(plan, 'grass2'), dirt = this.biomeCol(plan, 'dirt'), rock = this.biomeCol(plan, 'rock'), treeC = this.biomeCol(plan, 'tree');
      const geo = new THREE.PlaneGeometry(80, CH, 64, 16); geo.rotateX(-Math.PI / 2);
      const p = geo.attributes.position, cols = new Float32Array(p.count * 3), tmp = new C();
      const canyon = plan.kind === 'canyon', bridge = plan.kind === 'bridge', zc = (plan.z0 + plan.z1) / 2;
      const hFn = (x, wz) => KM.edgeHeight(x, wz, fbm(x * 0.15, wz * 0.15), plan.kind) + (fbm(x * 0.15, wz * 0.15) - 0.5) * 0.25 * (Math.abs(x) > 10 ? 1 : 0.3);
      for (let k = 0; k < p.count; k++) p.setY(k, hFn(p.getX(k), zc + p.getZ(k)));
      geo.computeVertexNormals(); const nrm = geo.attributes.normal;
      const sand = new C(0xe6d29a), moss = grass2.clone().offsetHSL(0, 0.05, -0.08);
      for (let k = 0; k < p.count; k++) {
        const x = p.getX(k), wz = zc + p.getZ(k), ax = Math.abs(x), h = p.getY(k), n = fbm(x * 0.15, wz * 0.15), ny = nrm.getY(k);
        const pathT = Math.max(0, Math.min(1, (4.6 - ax + (n - 0.5) * 2.2) / 2.0)), wear = Math.max(0, Math.min(1, (7.6 - ax) / 2.4)) * 0.22;   // visual road (≈±5 m) narrower than the playable lane; trampled grass to the fences
        tmp.copy(grass).lerp(grass2, noise(x * 0.4, wz * 0.4)); tmp.lerp(dirt, Math.max(pathT * (0.85 + n * 0.15), wear * (0.6 + noise(x * 1.3, wz * 1.3) * 0.8)));
        if (pathT > 0.5) { const tr = Math.abs(Math.sin(wz * 0.9 + x * 0.2)) < 0.06 ? 0.08 : 0; tmp.offsetHSL(0, 0, -tr + (n - 0.5) * 0.06); }
        if (ny < 0.72 && h > 0.6) { const strata = 0.92 + 0.12 * Math.sin(h * 3.1 + n * 2); tmp.copy(rock).multiplyScalar(strata).lerp(moss, Math.max(0, ny - 0.45)); }   // cliff faces with strata
        else if (h > 3.2 && ny >= 0.72) tmp.lerp(moss, 0.35);                                                                                    // mossy cliff tops
        if (h < -0.15) tmp.copy(sand).lerp(rock, Math.min(1, -h * 0.4));                                                                            // riverbed
        else if (h < 0.2 && KM.edgeAt(x < 0 ? -1 : 1, wz).river > 0.3 && ax > 11) tmp.lerp(sand, 0.6);                                          // banks
        cols[k * 3] = tmp.r; cols[k * 3 + 1] = tmp.g; cols[k * 3 + 2] = tmp.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      const ground = new THREE.Mesh(geo, this.groundMat); ground.position.z = zc; ground.receiveShadow = true; g.add(ground);
      // water: one animated strip per side wherever a river runs (or the bridge kind), plus a waterfall now and then
      const riverHere = [-1, 1].map(sd => Math.max(KM.edgeAt(sd, plan.z0).river, KM.edgeAt(sd, plan.z1).river, KM.edgeAt(sd, zc).river));
      [-1, 1].forEach((sd, k) => { if (riverHere[k] > 0.05 || bridge) { const w = new THREE.Mesh(this.waterGeo, this.waterMat); w.position.set(sd * 13.7, -0.42, zc); g.add(w); if (riverHere[k] > 0.6 && (i % 3 === k)) { const fall = new THREE.Mesh(this.fallGeo, this.fallMat); fall.position.set(sd * 18.4, 1.6, zc - 4); fall.rotation.y = -sd * Math.PI / 2; g.add(fall); g.userData.fall = (g.userData.fall || []).concat([{ x: sd * 17.4, z: zc - 4 }]); } } });
      // decor
      // decor placement guard: nothing may lean into the camera's sight-lines over the lane (launcher, coins, towers,
      // frontline, warnings, incoming enemies). Taller props must stand further out; an offender is moved out, else lowered, else dropped.
      const r = KM.rng(plan.seed), parts = [], gparts = [], G = this.decorGuard || (this.decorGuard = { placed: 0, moved: 0, lowered: 0, hidden: 0, boxes: [] }), bb = new THREE.Box3(), tb = new THREE.Box3();
      const add = (list, x, z, ry) => { const mm = TRS(x, 0, z, 0, ry || 0, 0); bb.makeEmpty(); for (const q of list) { q.applyMatrix4(mm); q.computeBoundingBox(); tb.copy(q.boundingBox); bb.union(tb); }
        const sd = (bb.min.x + bb.max.x) < 0 ? -1 : 1, inner = sd > 0 ? bb.min.x : -bb.max.x, h = Math.max(0, bb.max.y), need = h => KM.decorClear(h); G.placed++;
        if (inner < need(h)) { const shift = need(h) - inner;
          if (shift <= 2.5) { const tm = T(sd * shift, 0, 0); list.forEach(q => q.applyMatrix4(tm)); bb.translate(new THREE.Vector3(sd * shift, 0, 0)); G.moved++; }
          else { const h2 = KM.decorMaxH(inner); if (h2 >= h * 0.45 && h2 > 0.3) { const sc = h2 / h, sm = new THREE.Matrix4().makeScale(1, sc, 1); list.forEach(q => q.applyMatrix4(sm)); bb.max.y = h2; G.lowered++; } else { G.hidden++; return; } } }
        if (G.boxes.length < 4000) G.boxes.push([bb.min.x, bb.max.x, bb.min.z, bb.max.z, bb.max.y]); for (const q of list) parts.push(q); };
      const hAt = (x, wz) => hFn(x, wz);
      const dense = plan.kind === 'forest' ? 26 : plan.kind === 'canyon' ? 8 : 15;
      for (let k = 0; k < dense; k++) {
        const side = r() < 0.5 ? -1 : 1, x = side * r.range(11.5, 30), z = plan.z1 - r() * CH, y = hAt(x, z);
        const kind = plan.biome === 5 && r() < 0.6 ? 'crystal' : r() < 0.68 ? (r() < 0.6 ? 'tree' : 'round') : 'rock';
        if (y < -0.1) continue;   // nothing grows in the river
        const L = this.deco[kind](kind === 'rock' ? rock.getHex() : kind === 'crystal' ? 0x7fe8ff : treeC.clone().offsetHSL((r() - 0.5) * 0.04, 0, (r() - 0.5) * 0.08).getHex(), r.range(0.8, 1.5));
        const mm = T(0, y - 0.1, 0); L.forEach(q => q.applyMatrix4(mm)); add(L, x, z, r() * 6.28);
      }
      for (let k = 0; k < 4; k++) add(this.deco.rock(rock.getHex(), r.range(0.3, 0.6)), (r() < 0.5 ? -1 : 1) * r.range(9.9, 11), plan.z1 - r() * CH, r() * 6);
      if (plan.kind === 'ruins') for (let k = 0; k < 4; k++) { const side = k % 2 ? 1 : -1; add(r() < 0.5 ? this.deco.pillar(0, r.range(0.6, 1.1)) : this.deco.wall(0, r.range(0.6, 1.1)), side * r.range(11, 13.5), plan.z1 - r() * CH, r() * 0.6); }
      for (let z = plan.z1; z > plan.z0 + 0.1; z -= 2) for (const sx of [-10.3, 10.3]) add(bridge ? this.deco.stoneRail() : this.deco.post(), sx, z - 2, 0);
      add(this.deco.banner(0x2f6dff), -10.9, plan.z1 - 4 - (i % 3) * 3, 0); add(this.deco.banner(0xd83a3a), 10.9, plan.z1 - 14 - (i % 2) * 4, Math.PI);
      for (let k = 0; k < 2; k++) { const side = r() < 0.5 ? -1 : 1, cx0 = side * r.range(11, 13), cz0 = plan.z1 - r() * CH; for (let j = 0; j < 3; j++) add(this.deco.rock(rock.getHex(), r.range(0.4, 0.9)), cx0 + (r() - 0.5) * 1.6, cz0 + (r() - 0.5) * 1.6, r() * 6); }
      // edge modules: broken bridges over rivers, ruins on cliff shelves, abandoned siege pieces, distant peaks
      for (const sd of [-1, 1]) { const zz = plan.z1 - r.range(4, CH - 4), e = KM.edgeAt(sd, zz);
        if (e.river > 0.6 && r() < 0.55) add(this.deco.brokenBridge(), sd * 13.9, zz, sd > 0 ? 0 : Math.PI);
        if (e.cliff > 0.6 && r() < 0.6) { const yy = hAt(sd * 13.2, zz); const L = this.deco.wall(0, r.range(0.7, 1.0)); const mm = T(0, yy - 0.1, 0); L.forEach(q => q.applyMatrix4(mm)); add(L, sd * 13.2, zz, Math.PI / 2 + r() * 0.3); }
        if (e.cliff > 0.4) for (let k = 0; k < 3; k++) { const z2 = plan.z1 - r() * CH, x2 = sd * r.range(10.5, 11.2); add(this.deco.rock(rock.getHex(), r.range(0.5, 1.0)), x2, z2, r() * 6); }
        if (e.river < 0.3 && e.cliff < 0.3 && r() < 0.18) add(this.deco.wreck(), sd * r.range(11.2, 12.4), zz, r() * 6); }
      // biome boundary: a great stone gate over the road announces the new region
      if (i > 0 && i % KM.BIOME_LEN === 0) { const gz = plan.z1 - 2, bc = new C(KM.BIOMES[plan.biome].tree).getHex(), P0 = (g, c, m) => part(g, c, 0, m);
        for (const sx of [-1, 1]) [P0(new THREE.BoxGeometry(1.6, 7.5, 1.6), 0xcfc8b8, T(0, 3.75, 0)), P0(new THREE.BoxGeometry(2.0, 0.5, 2.0), 0xb8b0a0, T(0, 7.7, 0)), P0(new THREE.ConeGeometry(1.2, 1.4, 4), 0x2f6dff, TRS(0, 8.6, 0, 0, Math.PI / 4, 0)), P0(new THREE.BoxGeometry(0.08, 3.2, 1.3), bc, T(sx * -0.85, 4.5, 0)), P0(new THREE.BoxGeometry(0.1, 0.5, 0.5), 0xf2c14e, TRS(sx * -0.9, 5.2, 0, Math.PI / 4, 0, 0))].map(q => q.applyMatrix4(T(sx * 13.4, 0, gz))).forEach(q => gparts.push(q));
        add([P0(new THREE.BoxGeometry(24, 0.9, 1.0), 0xcfc8b8, T(0, 8.2, 0)), P0(new THREE.BoxGeometry(24.4, 0.25, 1.2), 0xf2c14e, T(0, 7.8, 0)), P0(new THREE.BoxGeometry(3.2, 1.1, 0.2), bc, T(0, 8.2, 0.55))], 0, gz, 0); }
      if (plan.biome !== 3 && plan.biome !== 4) for (let k = 0; k < 18; k++) add(this.deco.flower([0xffffff, 0xffe066, 0xff8fb0, 0xb4a0ff][k % 4]), (r() < 0.5 ? -1 : 1) * r.range(10.6, 16), plan.z1 - r() * CH);
      // foreground: bushes + grass tufts hugging the fences (they frame the lane like the concept art)
      for (let k = 0; k < 16; k++) { const side = r() < 0.5 ? -1 : 1, x = side * r.range(10.8, 14), z = plan.z1 - r() * CH; if (plan.biome === 3) { add(this.deco.rock(0xf2f7ff, r.range(0.35, 0.6)), x, z, r() * 6); continue; }
        add(this.deco.bush(treeC.clone().offsetHSL(0, 0.05, (r() - 0.5) * 0.1).getHex(), r.range(0.5, 0.9)), x, z, r() * 6); }
      for (let k = 0; k < 26; k++) add(this.deco.tuft(grass2.clone().offsetHSL(0, 0.05, -0.06).getHex(), r.range(0.6, 1.1)), (r() < 0.5 ? -1 : 1) * r.range(8.6, 10.1), plan.z1 - r() * CH, r() * 6);
      // signage + camp props now and then
      if (r() < 0.35) add(this.deco.sign(), (r() < 0.5 ? -1 : 1) * 11.2, plan.z1 - r() * CH, r() * 0.6 - 0.3);
      if (r() < 0.25) add(this.deco.tent(r() < 0.5 ? 0x2f6dff : 0xd83a3a), (r() < 0.5 ? -1 : 1) * r.range(15, 19), plan.z1 - r() * CH, r() * 6);
      if (parts.length) { const dm = new THREE.Mesh(merge(parts), this.decoMat); dm.castShadow = this.decorShadows !== false; dm.receiveShadow = true; dm.userData.decor = 1; g.add(dm); }
      if (gparts.length) { const gm = new THREE.Mesh(merge(gparts), new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true })); gm.userData.decor = 1; gm.userData.gateZ = plan.z1 - 2; g.add(gm); g.userData.gate = gm; }
      // distant scenery: big low-poly hills / mountains and a castle silhouette, outside the shadow map, cheap
      const far = [];
      for (let k = 0; k < 5; k++) { const side = k % 2 ? 1 : -1, sz = r.range(9, 16), hc = new C(plan.biome === 3 ? 0xdfe9f5 : plan.biome === 2 ? 0xd9a868 : plan.biome === 5 ? 0x8a7ce0 : 0x5fa04a).offsetHSL(0, 0, (r() - 0.5) * 0.08);
        far.push(part(new THREE.IcosahedronGeometry(1, 1), hc.getHex(), 0, TRS(side * r.range(34, 52), -sz * 0.35, plan.z1 - r() * CH, r(), r(), 0, sz * 1.4, sz * r.range(0.5, 0.9), sz)));
        if (plan.biome === 3 || plan.biome === 1) far.push(part(new THREE.ConeGeometry(1, 1, 7), 0xffffff, 0, TRS(side * r.range(40, 55), sz * 0.6, plan.z1 - r() * CH, 0, r(), 0, sz * 0.5, sz * 0.5, sz * 0.5))); }
      if (i % 7 === 3) { const sx = (i % 2 ? 1 : -1) * 30, cz = (plan.z0 + plan.z1) / 2; for (const [dx, h] of [[-3, 7], [3, 7], [0, 9]]) { far.push(part(new THREE.CylinderGeometry(1.2, 1.4, h, 8), 0xc8c2b6, 0, T(sx + dx, h / 2, cz))); far.push(part(new THREE.ConeGeometry(1.6, 2.4, 8), 0x2f6dff, 0, T(sx + dx, h + 1.2, cz))); } far.push(part(new THREE.BoxGeometry(6, 4.5, 1.5), 0xbab4a8, 0, T(sx, 2.25, cz))); }
      for (let k = 0; k < 2; k++) { const sd = k ? 1 : -1, pk = r.range(18, 30); far.push(part(new THREE.ConeGeometry(1, 1, 6), plan.biome === 3 ? 0xe8f0fa : 0x8a9ab0, 0, TRS(sd * r.range(62, 85), pk * 0.42, plan.z1 - r() * CH, 0, r() * 3, 0, pk * 0.8, pk, pk * 0.8))); far.push(part(new THREE.ConeGeometry(1, 1, 6), 0xffffff, 0, TRS(sd * r.range(62, 85), pk * 0.75, plan.z1 - r() * CH, 0, r() * 3, 0, pk * 0.25, pk * 0.3, pk * 0.25))); }
      if (far.length) g.add(new THREE.Mesh(merge(far), this.farMat));
      return g;
    }

    streamWorld(front) {
      const want = KM.chunksFor(front), keep = new Set(want);
      for (const [i, g] of this.chunks) if (!keep.has(i)) { this.scene.remove(g); if (g.userData.gate) g.userData.gate.material.dispose(); g.traverse(o => { if (o.geometry && o.geometry !== this.waterGeo && o.geometry !== this.fallGeo) o.geometry.dispose(); }); this.chunks.delete(i); }
      let built = 0;
      for (const i of want) if (!this.chunks.has(i) && built < (this.chunks.size < 4 ? 3 : 1)) { const g = this.buildChunk(i); this.scene.add(g); this.chunks.set(i, g); built++; }
      // the overhead biome gate fades while it hangs over the fight (between the launcher and the threat zone)
      for (const [, g] of this.chunks) { const gm = g.userData.gate; if (!gm) continue; const gz = gm.userData.gateZ, over = gz < (this.lzCache == null ? front + 14 : this.lzCache) + 4 && gz > front - 34, m = gm.material, o = over ? 0.22 : 1;
        m.opacity += (o - m.opacity) * 0.15; m.depthWrite = m.opacity > 0.95; }
      // fog/sky blend toward current biome
      this.waterU.uTime.value = this.time;
      for (const [, g] of this.chunks) if (g.userData.fall) for (const f of g.userData.fall) if (Math.random() < 0.5 * (this.fxScale || 1)) this.emit(f.x + (Math.random() - 0.5) * 2, -0.2, f.z + (Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 1.5, 1.5 + Math.random(), (Math.random() - 0.5) * 1.5, 0xe8f8ff, 0.7, 0.7, 4);
      const plan = KM.chunkPlan(Math.max(0, Math.floor(-front / W.CHUNK)));
      const fc = this.biomeCol(plan, 'fog'), war = Math.min(1, (this.simT || 0) / 60 / 40); fc.lerp(this.col2.setHex(0xffdcae), 0.3).lerp(this.col2.setHex(0xffa070), war * 0.45);
      this.fogCol.lerp(fc, 0.02); this.scene.fog.color.copy(this.fogCol);
      this.hemi.intensity = 0.66 - war * 0.08; this.sun.color.setHex(0xffe6c0).lerp(this.col2.setHex(0xffb070), war * 0.5);
      if (war > 0.3 && Math.random() < war * 0.6) this.emit(this.camT ? this.camT.x + (Math.random() - 0.5) * 24 : 0, 0.5, front - Math.random() * 40, (Math.random() - 0.5) * 0.4, 1.2 + Math.random(), 0, 0xff8a3a, 0.22, 3, -0.15);
    }

    // ---------- launcher ----------
    // Materials: cel-shaded like the units (std() kept for transparent/emissive bits).
    std(color, o) { return KM.toonPlain(color, o); }
    // Static batching: under every node, merge the opaque, non-animated meshes that share an emissive signature into one
    // vertex-coloured mesh (support vehicles were 25–45 draws each). Meshes or materials referenced from userData (animated
    // barrels, flags, crystals…) and transparent pieces stay separate.
    batchStatic(root, opt) {
      opt = opt || {}; const keepO = new Set(opt.keep || []), keepM = new Set(), deep = new Set(), scan = v => { if (!v) return; if (Array.isArray(v)) return v.forEach(scan); if (v.isObject3D) keepO.add(v); else if (v.isMaterial) keepM.add(v); else if (v.m && v.m.isObject3D) keepO.add(v.m); };
      for (const k in root.userData) if (k !== 'parts') scan(root.userData[k]);
      for (const d of opt.deep || []) d.traverse(x => deep.add(x));
      const nodes = []; root.traverse(o => { if (!o.isMesh && !deep.has(o)) nodes.push(o); }); let merged = 0;
      for (const node of nodes) {
        const groups = new Map();
        for (const m of node.children) { if (!m.isMesh || keepO.has(m) || keepM.has(m.material) || m.material.transparent || !m.visible || m.isInstancedMesh || !m.material.isMeshToonMaterial) continue;
          const mt = m.material, emi = (mt.emissive ? mt.emissive.getHex() : 0) + ':' + (mt.emissiveIntensity || 0).toFixed(2), pin = opt.pinned && opt.pinned.includes(mt), sig = mt.type + ':' + (mt.color ? mt.color.getHex() : 0) + ':' + emi;
          const key = opt.byMaterial ? (pin ? mt.uuid : opt.mergeFixed && mt.side === THREE.FrontSide ? 'fixed:' + emi : sig) : emi + ':' + !!mt.map; if (mt.map) continue;   // mergeFixed: fixed-colour pieces share one vertex-coloured draw; pinned (skin) materials stay live
          (groups.get(key) || groups.set(key, []).get(key)).push(m); }
        for (const [key, list] of groups) { if (list.length < 2) continue;
          let n = 0; const geos = list.map(m => { m.updateMatrix(); const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix); n += g.attributes.position.count; return { g, c: m.material.color }; });
          const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
          for (const { g, c } of geos) { const k = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); if (!g.attributes.normal) g.computeVertexNormals(); nor.set(g.attributes.normal.array, o * 3); for (let v = 0; v < k; v++) { col[(o + v) * 3] = c.r; col[(o + v) * 3 + 1] = c.g; col[(o + v) * 3 + 2] = c.b; } o += k; g.dispose(); }
          const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeBoundingSphere();
          const m0 = list[0].material, vc = !opt.byMaterial || key.startsWith('fixed:'), mat = vc ? KM.toonPlain(0xffffff, { vertexColors: true, emissive: m0.emissive ? m0.emissive.getHex() : 0, emissiveIntensity: m0.emissiveIntensity || 0 }) : m0;
          if (!vc) geo.deleteAttribute('color');
          const mm = new THREE.Mesh(geo, mat); mm.castShadow = list.some(m => m.castShadow); mm.receiveShadow = list.some(m => m.receiveShadow); mm.userData.batched = list.length; node.add(mm);
          const mats = new Set(); for (const m of list) { node.remove(m); m.geometry.dispose(); if (vc) mats.add(m.material); } merged += list.length - 1;
          const still = new Set(); root.traverse(x => { if (x.material) still.add(x.material); }); for (const mt of mats) if (!still.has(mt)) mt.dispose(); }
      }
      if (!opt.byMaterial) root.userData.parts = []; root.userData.batched = true; return merged;
    }
    // Command tank (reference: blue/white armoured tank on a brown wooden chassis, grey forward cannon with blue bands, crested
    // commander in the hatch). Visual tiers follow the EXISTING upgrade drivers only (KM.tankLook + era): barrels from fire rate
    // (single → dual → triple cannon), longer siege barrel + muzzle brake from cannon damage, side plates / skirts from plating
    // (reinforced armour), battlements from the heavy late build (fortress). Purely visual: no mechanic reads any of this.
    buildLauncher() {
      const g = new THREE.Group(), skin = this.skin;
      const paint = this.lPaint = this.std(skin.color), paint2 = this.lPaint2 = this.std(new C(skin.color).offsetHSL(0, 0, -0.12).getHex()), gold = this.lGold = this.std(this.tankTrim(skin)), dark = this.std(0x26293a);
      const white = this.std(0xeef2f8), plate2 = this.std(0xc9d2e0), wood = this.std(0x8f5c34), woodD = this.std(0x5e3a20), steel = this.std(0x7d8698), steelD = this.std(0x4c5361), skinM = this.std(0xffcf9f);
      const glowMat = this.std(0x6fd8ff, { emissive: 0x1f88dd, emissiveIntensity: 0.7 });
      const rbox = (w, h, d, r, mat) => { const sh = new THREE.Shape(), x = w / 2 - r, z = d / 2 - r; sh.moveTo(-x, -d / 2); sh.lineTo(x, -d / 2); sh.quadraticCurveTo(w / 2, -d / 2, w / 2, -z); sh.lineTo(w / 2, z); sh.quadraticCurveTo(w / 2, d / 2, x, d / 2); sh.lineTo(-x, d / 2); sh.quadraticCurveTo(-w / 2, d / 2, -w / 2, z); sh.lineTo(-w / 2, -z); sh.quadraticCurveTo(-w / 2, -d / 2, -x, -d / 2);
        const geo = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2, curveSegments: 4 }); geo.rotateX(-Math.PI / 2); return new THREE.Mesh(geo, mat); };
      const bx = (par, w, h, d, mat, x, y, z, rx, ry, rz) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x || 0, y || 0, z || 0); m.rotation.set(rx || 0, ry || 0, rz || 0); par.add(m); return m; };
      const body = new THREE.Group(); g.add(body); this.lBody = body;
      const st = this.lStage = {}; const grp = (k) => { const s = new THREE.Group(); body.add(s); st[k] = s; return s; };
      // LV1: wooden chassis, white armoured hull with blue panels, blue deck, steel trim
      const base = grp('base');
      const ch = rbox(2.12, 0.34, 2.5, 0.22, wood); ch.position.y = 0.3; base.add(ch);
      for (const x of [-1.07, 1.07]) { bx(base, 0.06, 0.08, 2.46, woodD, x, 0.4); bx(base, 0.06, 0.08, 2.46, woodD, x, 0.56); }
      const hull = rbox(1.86, 0.46, 2.16, 0.26, white); hull.position.y = 0.66; base.add(hull);
      for (const x of [-0.99, 0.99]) for (const z of [-0.62, 0.0, 0.62]) bx(base, 0.05, 0.46, 0.3, paint, x, 0.92, z);                 // blue side panels on white
      bx(base, 0.9, 0.36, 0.05, paint, 0, 0.9, -1.15); bx(base, 0.3, 0.3, 0.06, white, 0, 0.92, -1.17, 0, 0, Math.PI / 4);              // front glacis: blue plate + white diamond
      bx(base, 0.12, 0.34, 0.05, white, -0.6, 0.9, -1.14); bx(base, 0.12, 0.34, 0.05, white, 0.6, 0.9, -1.14);
      const deck = rbox(1.56, 0.08, 1.86, 0.24, paint); deck.position.y = 1.18; base.add(deck);
      for (const z of [-1.16, 1.16]) bx(base, 1.9, 0.06, 0.06, gold, 0, 1.2, z); for (const x of [-0.96, 0.96]) bx(base, 0.06, 0.06, 2.2, gold, x, 1.2, 0);
      const bolt = new THREE.SphereGeometry(0.045, 6, 4); for (let k = 0; k < 6; k++) for (const x of [-0.97, 0.97]) { const b = new THREE.Mesh(bolt, gold); b.position.set(x, 1.12, -0.92 + k * 0.37); base.add(b); }
      bx(base, 1.2, 0.18, 0.2, woodD, 0, 0.36, -1.32); bx(base, 1.2, 0.18, 0.2, woodD, 0, 0.36, 1.32);                                   // wooden bumpers
      // wooden spoked wheels: 4 at LV1, 6 once the hull is reinforced
      this.wheels = [];
      const wheel = (x, z, r) => { const wh = new THREE.Group(); wh.position.set(x, r, z);
        wh.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.3, 16).rotateZ(Math.PI / 2), wood));
        const tr = new THREE.Mesh(new THREE.TorusGeometry(r * 0.95, 0.06, 5, 18).rotateY(Math.PI / 2), woodD); tr.position.x = x > 0 ? 0.16 : -0.16; wh.add(tr);
        wh.add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.3, r * 0.3, 0.36, 10).rotateZ(Math.PI / 2), gold));
        for (let k = 0; k < 4; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, r * 1.7), woodD); sp.rotation.x = k * Math.PI / 4; sp.position.x = x > 0 ? 0.03 : -0.03; wh.add(sp); }
        this.wheels.push(wh); return wh; };
      for (const [x, z] of [[-1.13, -0.82], [1.13, -0.82], [-1.13, 0.82], [1.13, 0.82]]) base.add(wheel(x, z, 0.42));
      const mid = grp('mid'); mid.add(wheel(-1.13, 0, 0.38)); mid.add(wheel(1.13, 0, 0.38));
      for (const x of [-1.04, 1.04]) { bx(mid, 0.08, 0.36, 1.9, white, x, 0.96, 0); for (const z of [-0.5, 0.5]) bx(mid, 0.09, 0.36, 0.22, paint, x * 1.005, 0.96, z); }   // reinforced armour: bolted side plates
      // turret: white drum with a blue band on a steel ring, steel mantlet, grey cannon(s) with blue bands
      const tur = this.turret = new THREE.Group(); tur.position.y = 1.2; body.add(tur);
      tur.add(new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.84, 0.18, 20), plate2));
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.44, 20), white); drum.position.y = 0.3; tur.add(drum);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.055, 6, 24), paint); band.rotation.x = Math.PI / 2; band.position.y = 0.26; tur.add(band);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 0.12, 20), paint); cap.position.y = 0.58; tur.add(cap);
      bx(tur, 0.74, 0.4, 0.34, steel, 0, 0.32, -0.62);
      this.barrels = [];
      for (let k = 0; k < 3; k++) {
        const b = new THREE.Group();
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 1.25, 14).rotateX(Math.PI / 2), steel); tube.position.z = -0.78; b.add(tube);
        for (const zz of [-0.42, -0.98]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.05, 6, 16), paint); r.position.z = zz; b.add(r); }
        const bore = this.std(0x0e1220), brake = new THREE.Group(); brake.position.z = -1.42; b.add(brake); b.userData.brake = brake;   // muzzle brake + its bore: one batched draw, toggled together
        brake.add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.22, 0.26, 14).rotateX(Math.PI / 2), steel)); const bh = new THREE.Mesh(new THREE.CircleGeometry(0.15, 14), bore); bh.position.z = -0.135; bh.rotation.y = Math.PI; brake.add(bh);
        const mz = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.055, 6, 16), steel); mz.position.z = -1.43; b.add(mz);
        const hole = new THREE.Mesh(new THREE.CircleGeometry(0.15, 14), bore); hole.position.z = -1.47; hole.rotation.y = Math.PI; b.add(hole);
        b.position.set(0, 0.32, 0); tur.add(b); this.barrels.push(b);
      }
      // the commander: blue-armoured, white helm with a tall blue crest, in the rear hatch
      { const cm = new THREE.Group(); cm.position.set(0.12, 0.62, 0.26); tur.add(cm);
        cm.add(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.1, 14), steelD));
        bx(cm, 0.34, 0.3, 0.26, paint, 0, 0.2, 0); for (const x of [-0.2, 0.2]) bx(cm, 0.14, 0.1, 0.22, white, x, 0.33, 0);
        const hd = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), skinM); hd.position.y = 0.48; cm.add(hd);
        const hm = new THREE.Mesh(new THREE.SphereGeometry(0.155, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), white); hm.position.y = 0.5; cm.add(hm);
        bx(cm, 0.06, 0.22, 0.32, paint, 0, 0.7, 0.02); bx(cm, 0.05, 0.14, 0.05, white, 0, 0.47, -0.14); }
      // visible tank upgrade hardware: missile pod (MISSILE POD), targeting mast (TARGETING SYSTEM), field emitters (FORCE FIELD)
      const pod = this.lPod = new THREE.Group(); tur.add(pod);
      for (const x of [-1, 1]) { const pb = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.3, 0.6), white); pb.position.set(x * 0.9, 0.34, 0.05); pod.add(pb); bx(pod, 0.33, 0.08, 0.61, paint, x * 0.9, 0.46, 0.05);
        for (let k = 0; k < 4; k++) { const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 6).rotateX(-Math.PI / 2), this.std(0xff5a3a)); tip.position.set(x * 0.9 + ((k % 2) - 0.5) * 0.14, 0.32 + (k < 2 ? 0.07 : -0.07), -0.28); pod.add(tip); } }
      const ant = this.lAnt = new THREE.Group(); ant.position.set(-0.5, 0.6, 0.5); tur.add(ant);
      { const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.1, 6), dark); mast.position.y = 0.55; ant.add(mast); }
      const dish = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 3), gold); dish.rotation.x = Math.PI * 0.6; dish.position.y = 1.0; ant.add(dish);
      const tipL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), this.std(0xff3a3a, { emissive: 0xff2020, emissiveIntensity: 1 })); tipL.position.y = 1.12; ant.add(tipL);
      const emi = this.lEmit = new THREE.Group(); body.add(emi);
      for (const [x, z] of [[-0.95, -1.0], [0.95, -1.0], [-0.95, 0.95], [0.95, 0.95]]) { const n = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.3, 8), white); n.position.set(x, 1.32, z); emi.add(n); const g2 = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), glowMat); g2.position.set(x, 1.52, z); emi.add(g2); }
      // L2: troop-capsule hopper on the rear deck + lanterns
      const hop = grp('hopper');
      const hp = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.32, 0.44, 14, 1, true), white); hp.position.set(0, 1.42, 0.88); hop.add(hp);
      const hr = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 6, 18), paint); hr.rotation.x = Math.PI / 2; hr.position.set(0, 1.64, 0.88); hop.add(hr);
      this.capsules = []; for (let k = 0; k < 5; k++) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), this.std(0x4f8dff)); c.scale.y = 1.3; c.position.set(Math.cos(k * 1.26) * 0.2, 1.62, 0.88 + Math.sin(k * 1.26) * 0.2); hop.add(c); this.capsules.push(c); }
      for (const x of [-0.86, 0.86]) { const lp = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), gold); lp.position.set(x, 1.42, 1.08); hop.add(lp); const lt = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), this.std(0xfff2b0, { emissive: 0xffc84a, emissiveIntensity: 0.9 })); lt.position.set(x, 1.7, 1.08); hop.add(lt); }
      // L3: crystal reinforcement core on a pylon + rear deck crates
      const core = grp('core');
      const py = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.5, 8), gold); py.position.y = 2.2; core.add(py);
      this.core = new THREE.Mesh(new THREE.OctahedronGeometry(0.34), glowMat); this.core.position.y = 2.7; core.add(this.core);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.035, 6, 24), gold); halo.rotation.x = Math.PI / 2; halo.position.y = 2.7; core.add(halo); this.halo = halo;
      for (const x of [-0.62, 0.62]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.32, 0.4), wood); c.position.set(x, 1.38, 0.3); core.add(c); const cb = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.42), woodD); cb.position.set(x, 1.42, 0.3); core.add(cb); }
      // L4 (siege): white armour skirts over the wheels with blue stripes, steel ram, front shields
      const arm = grp('armor');
      for (const x of [-1.3, 1.3]) { bx(arm, 0.12, 0.5, 2.5, white, x, 0.74, 0); for (const z of [-0.85, 0, 0.85]) bx(arm, 0.13, 0.5, 0.18, paint, x, 0.74, z); bx(arm, 0.14, 0.06, 2.54, gold, x, 1.0, 0); }
      bx(arm, 1.5, 0.34, 0.1, white, 0, 0.5, -1.42, -0.25); bx(arm, 0.36, 0.35, 0.11, paint, 0, 0.5, -1.425, -0.25); bx(arm, 1.54, 0.06, 0.12, gold, 0, 0.68, -1.38, -0.25);   // siege glacis plate
      for (const x of [-0.62, 0.62]) { const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 18).rotateX(Math.PI / 2), paint); sh.position.set(x, 1.25, -1.0); arm.add(sh); const sr = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.045, 6, 18), white); sr.position.copy(sh.position); arm.add(sr); bx(arm, 0.12, 0.24, 0.1, white, x, 1.25, -1.05, 0, 0, Math.PI / 4); }
      // L5 (fortress): white crenellated parapet around the turret, corner towers with blue roofs, a second banner, hover ring
      const top = grp('crown');
      this.crown = new THREE.Group(); for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; const mr = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.16), k % 2 ? white : paint); mr.position.set(Math.cos(a) * 0.74, 0.62, Math.sin(a) * 0.74); mr.rotation.y = -a; this.crown.add(mr); } tur.add(this.crown);
      for (const [x, z] of [[-0.98, 1.0], [0.98, 1.0], [-0.98, -0.95], [0.98, -0.95]]) { bx(top, 0.34, 0.5, 0.34, white, x, 1.45, z); const rf = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.32, 4), paint); rf.position.set(x, 1.86, z); rf.rotation.y = Math.PI / 4; top.add(rf); }
      this.eRing = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.05, 6, 40), new THREE.MeshBasicMaterial({ color: 0x9ff2ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })); this.eRing.rotation.x = Math.PI / 2; this.eRing.position.y = 0.25; top.add(this.eRing);
      // flags
      const clothG = () => { const geo = new THREE.PlaneGeometry(0.95, 0.62, 10, 4); geo.translate(0.475, 0, 0); return geo; };
      this.flags = [];
      for (const [x, z] of [[-0.85, 1.1], [0.85, 1.1]]) {
        const fg = new THREE.Group(); fg.position.set(x, 1.1, z);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 6), gold); pole.position.y = 1.15; fg.add(pole);
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), gold); knob.position.y = 2.32; fg.add(knob);
        const cloth = new THREE.Mesh(clothG(), this.std(skin.color, { side: THREE.DoubleSide })); cloth.position.y = 1.95; fg.add(cloth); cloth.userData.base = cloth.geometry.attributes.position.array.slice();
        const em = new THREE.Mesh(new THREE.CircleGeometry(0.15, 14), this.std(0xffffff, { side: THREE.DoubleSide })); em.position.set(0.45, 1.95, 0.012); fg.add(em);
        body.add(fg); this.flags.push(fg);
      }
      g.traverse(o => { if (o.isMesh && !o.material.transparent) o.castShadow = true; });
      this.hpRing = new THREE.Mesh(new THREE.RingGeometry(1.75, 1.95, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x4cff8a, transparent: true, opacity: 0.7, depthWrite: false })); this.hpRing.position.y = 0.05; g.add(this.hpRing);
      this.magRing = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe28a, transparent: true, opacity: 0.35, depthWrite: false })); this.magRing.position.y = 0.04; g.add(this.magRing);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(5, 5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: radialTex('rgba(80,160,255,0.55)', 'rgba(80,160,255,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); glow.position.y = 0.06; g.add(glow); this.lGlow = glow;
      this.lastLv = 1; this.lPop = 9;
      return g;
    }
    // tank paint follows the equipped skin at every era (blue + white for the standard Royal Blue); the standard skin's gold trim
    // is shown as steel so the tank matches the blue/white/silver reference
    tankTrim(sk) { return sk.id === 'skin_royal' ? 0xb9c3d2 : new C(sk.trim).getHex(); }
    eraPaint() { if (!this.lPaint) return; const sk = this.skin; this.lPaint.color.set(sk.color); this.lPaint2.color.set(sk.color).offsetHSL(0, 0, -0.12); this.lGold.color.setHex(this.tankTrim(sk)); }
    setSkin(item) { this.skin = item; if (this.lPaint) { this.eraPaint(); this.flags.forEach(f => f.children[2].material.color.set(item.color)); } }

    drawLauncher(sim, dt) {
      const L = sim.L, g = this.launcher, lv = sim.level, S = this.lStage;
      g.position.set(L.x, 0, L.z); g.visible = true;
      if (lv !== this.lastLv) { if (lv > this.lastLv) { this.lPop = 0; this.burst(L.x, 1.5, L.z, 70, 0x9ff2ff, 7, 0.7, 0.8, 5); this.ring(L.x, L.z, 0x9ff2ff, 8, 0.8); this.ring(L.x, L.z, 0xffd23a, 5, 0.6); } this.lastLv = lv; }
      this.lPop += dt;
      const tilt = Math.max(-0.25, Math.min(0.25, -L.vx * 0.03)); this.lBody.rotation.z += (tilt - this.lBody.rotation.z) * Math.min(1, dt * 8);
      this.lBody.position.y = Math.abs(Math.sin(this.time * 9)) * 0.02 + (L.hitT < 0.15 ? 0.08 : 0);
      for (const w of this.wheels) w.rotation.x = -L.wheel * 2.2;
      const era = KM.tankEra(sim.stats, sim.t); if (era !== this.lEra) { this.lEra = era; if (this.lEraSeen != null && era > this.lEraSeen) { this.burst(L.x, 1.5, L.z, 60, 0xffd23a, 6, 0.7, 0.8, 5); this.ring(L.x, L.z, 0xffd23a, 7, 0.8); } this.lEraSeen = era; }
      const look = KM.tankLook(sim.stats), LV = sim.stats.lv, want = { mid: look.armor >= 1 || lv >= 3, hopper: (LV.cap || 0) + (LV.rate || 0) >= 2 || lv >= 2, core: look.shield >= 1, armor: look.armor >= 2 || era >= 4, crown: look.heavy && era >= 5 };
      for (const k in want) { const gS = S[k]; if (want[k] && !gS.visible) { gS.userData.pop = 0; } gS.visible = want[k];
        if (gS.visible && gS.userData.pop != null && gS.userData.pop < 0.7) { gS.userData.pop += dt; const u = Math.min(1, gS.userData.pop / 0.55), k2 = u < 1 ? (1 - Math.pow(1 - u, 3)) * (1 + Math.sin(u * Math.PI) * 0.35) : 1; gS.scale.setScalar(Math.max(0.01, k2)); gS.position.y = (1 - u) * 1.2; } else if (gS.visible) { gS.scale.setScalar(1); gS.position.y = 0; } }
      this.crown.visible = look.heavy && era >= 5; this.flags[1].visible = look.heavy && era >= 5; this.lPod.visible = look.missiles; this.lAnt.visible = look.antenna; this.lEmit.visible = look.shield >= 1;
      const nb = look.barrels, blen = look.blen + (look.cannon ? 0.15 : 0), bw = look.cannon ? 1.18 : 1;   // a forward cannon from LV1; dual/triple from the fire-rate line; siege barrel from cannon damage
      this.barrels.forEach((b, k) => { b.visible = k < nb; b.position.x = nb === 1 ? 0 : nb === 2 ? (k ? 0.3 : -0.3) : (k - 1) * 0.44; b.scale.set(bw, bw, blen); b.userData.brake.visible = lv >= 2 || look.cannon; b.position.z = L.fire * 0.2 * ((k + Math.floor(this.time * 8)) % nb === 0 ? 1 : 0.3) + (L.gun || 0) * 0.35; });
      { let dy = (L.aim - Math.PI) - this.turret.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); this.turret.rotation.y += dy * Math.min(1, dt * 6); }   // turret eases to the cannon's aim (straight ahead)
      { const S2 = sim.stats, M = this.shieldM, mt = this.shieldMat; M.visible = S2.shield > 0; if (M.visible) { const f = L.shMax ? L.sh / L.shMax : 0, down = L.shDown > 0;
        this.shBurst = down ? (this.shBurst == null ? 0 : this.shBurst + dt) : null; const r = S2.shRadius * (down ? 1 + Math.min(1, (this.shBurst || 0) * 3) * 0.4 : 1);
        M.position.set(L.x, 0, L.z); M.scale.set(r, r * 0.8, r);
        mt.opacity = down ? Math.max(0, 0.35 - (this.shBurst || 0) * 1.2) : (0.08 + 0.2 * f) * (f < 0.3 ? 0.55 + 0.45 * Math.sin(this.time * 30) : 1) + (L.shHit < 0.15 ? 0.2 : 0);
        mt.color.setHSL(0.54 - (1 - f) * 0.06, 0.9, 0.55 + S2.shield * 0.03); } }
      this.capsules.forEach((c, k) => { c.position.y = 1.48 + Math.abs(Math.sin(this.time * 6 + k)) * 0.06 - L.fire * 0.05; });
      this.core.rotation.y += dt * 2; this.core.position.y = 2.6 + Math.sin(this.time * 3) * 0.08; this.halo.rotation.z += dt; this.eRing.rotation.z -= dt * 1.5; this.eRing.material.opacity = 0.45 + Math.sin(this.time * 4) * 0.2;
      // stage transform pop: overshoot scale for ~0.6s
      const pu = Math.min(1, this.lPop / 0.6), pop = pu < 1 ? Math.sin(pu * Math.PI) * 0.18 : 0;
      const sc = (1 + (Math.min(lv, 5) - 1) * 0.06) * (1 + pop); this.lBody.scale.setScalar(sc);
      for (const f of this.flags) { const c = f.children[2], a = c.geometry.attributes.position, b = c.userData.base; for (let k = 0; k < a.count; k++) { const x = b[k * 3]; a.array[k * 3 + 2] = Math.sin(x * 5 - this.time * 7) * 0.09 * x; } a.needsUpdate = true; }
      const hpF = L.hp / sim.stats.maxHp; this.hpRing.material.color.setHSL(0.33 * hpF, 0.9, 0.55); this.hpRing.material.opacity = 0.35 + (1 - hpF) * 0.5 + (L.hitT < 0.2 ? 0.3 : 0);
      this.hpRing.scale.setScalar(0.3 + 0.7 * hpF + 0.0001);
      const mg = sim.stats.magnet; this.magRing.scale.set(mg, 1, mg); this.magRing.material.opacity = 0.18 + Math.sin(this.time * 3) * 0.06;
      this.lPaint.emissive.setRGB(L.hitT < 0.12 ? 0.6 : pop * 0.6, pop * 0.6, pop * 0.8); if (L.inv > 0 && L.inv < 100) this.lPaint.emissive.setRGB(0.1, 0.25, 0.5 * (0.5 + 0.5 * Math.sin(this.time * 20)));
      this.lGlow.material.opacity = 0.5 + L.fire * 0.5;
      if (!sim.alive) g.visible = Math.floor(this.time * 4) % 2 === 0 && this.deathT < 1.2;
    }

    // ---------- towers ----------
    // Mobile support vehicle (replaces the ground towers). Level visibly changes the machine:
    // L1 small 4-wheel chassis · L2 armor side plates · L3 6 wheels + bigger turret · L4 tracks + extra barrel/plates · L5 gold trim + emitter halo.
    buildTower(t) {
      const g = new THREE.Group(), lv = t.lvl, T = KM.TOWERS[t.type], L5 = lv >= 5;
      const hull = this.std(0x2f6dff), hull2 = this.std(0x2353c7), steel = this.std(0xb8c2d0), dark = this.std(0x2a2d38), gold = this.std(0xf4c247), tire = this.std(0x22232b);
      const acc = this.std(T.color, { emissive: T.color, emissiveIntensity: 0.15 + lv * 0.06 });
      const Lh = 1.45 + lv * 0.12, Wd = 1.0 + lv * 0.06, H = 0.42 + lv * 0.03, parts = [];
      const add = (m, par) => { (par || g).add(m); parts.push(m); return m; };
      const box = (w, h, d, mat, x, y, z, par) => { const m = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), par); m.position.set(x || 0, y || 0, z || 0); return m; };
      box(Wd, H, Lh, hull, 0, 0.32 + H / 2, 0); box(Wd * 0.86, 0.1, Lh * 0.9, hull2, 0, 0.36 + H, 0);                                // hull + deck
      box(Wd * 1.02, 0.06, 0.08, acc, 0, 0.38 + H * 0.6, -Lh / 2 - 0.02);                                                           // type stripe on the nose
      g.userData.wheels = [];
      if (lv >= 4) for (const x of [-1, 1]) { box(0.26, 0.42, Lh * 1.02, dark, x * (Wd / 2 + 0.12), 0.24, 0); for (let k = 0; k < 4; k++) { const w = add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.3, 10).rotateZ(Math.PI / 2), steel)); w.position.set(x * (Wd / 2 + 0.12), 0.2, (k / 3 - 0.5) * Lh * 0.82); g.userData.wheels.push(w); } }
      else { const nw = lv >= 3 ? 3 : 2; for (const x of [-1, 1]) for (let k = 0; k < nw; k++) { const w = add(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.2, 12).rotateZ(Math.PI / 2), tire)); w.position.set(x * (Wd / 2 + 0.08), 0.24, (k / Math.max(1, nw - 1) - 0.5) * Lh * 0.72); g.userData.wheels.push(w); } }
      if (lv >= 2) for (const x of [-1, 1]) box(0.06, H * 0.75, Lh * 0.7, steel, x * (Wd / 2 + 0.03), 0.4 + H * 0.45, 0);              // armor side plates
      if (lv >= 3) box(Wd * 1.05, 0.22, 0.16, steel, 0, 0.36, -Lh / 2 - 0.08);                                                      // front ram
      if (lv >= 4) box(Wd * 0.7, 0.12, 0.5, steel, 0, 0.42 + H, Lh * 0.3);
      if (L5) { box(Wd * 1.04, 0.05, Lh * 1.02, gold, 0, 0.33 + H, 0); for (const x of [-1, 1]) { const e = add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), this.std(0x9ff2ff, { emissive: 0x3fd0ff, emissiveIntensity: 1 }))); e.position.set(x * Wd * 0.42, 0.6 + H, Lh * 0.4); } }
      const top = 0.42 + H, aim = new THREE.Group(); aim.position.y = top; g.add(aim); g.userData.aim = aim; const s = 1 + (lv - 1) * 0.12;
      g.userData.barrels = [];
      if (t.type === 'gun') {
        box(0.62 * s, 0.32, 0.7 * s, hull, 0, 0.18, 0, aim); box(0.5 * s, 0.06, 0.6 * s, acc, 0, 0.36, 0, aim);
        const nb = 1 + Math.floor((lv - 1) / 2);
        for (let k = 0; k < nb; k++) { const bar = new THREE.Group(); bar.position.set(nb === 1 ? 0 : (k - (nb - 1) / 2) * 0.2, 0.2, 0.3); aim.add(bar); g.userData.barrels.push(bar);
          add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.7 + lv * 0.08, 10).rotateX(Math.PI / 2), dark), bar).position.z = 0.35; }
        if (lv >= 3) { const sc = box(0.12, 0.12, 0.34, gold, 0.22 * s, 0.42, 0.05, aim); sc.userData.k = 1; }                       // precision scope (L3+ targets the toughest enemy)
      }
      if (t.type === 'artillery') {
        box(0.78 * s, 0.34, 0.8 * s, hull, 0, 0.18, 0, aim); const nb = lv >= 3 ? 2 : 1;
        for (let k = 0; k < nb; k++) { const bar = new THREE.Group(); bar.position.set(nb === 1 ? 0 : (k ? 0.22 : -0.22), 0.34, 0.15); bar.rotation.x = -0.45; aim.add(bar); g.userData.barrels.push(bar);
          add(new THREE.Mesh(new THREE.CylinderGeometry(0.13 * s, 0.17 * s, 1.0 * s, 12).rotateX(Math.PI / 2), dark), bar).position.z = 0.45;
          add(new THREE.Mesh(new THREE.TorusGeometry(0.15 * s, 0.04, 6, 12), acc), bar).position.z = 0.92 * s; }
        if (lv >= 4) for (const x of [-1, 1]) box(0.18, 0.2, 0.36, gold, x * 0.5 * s, 0.12, -0.2, aim);                              // ammo racks
      }
      if (t.type === 'frost') {
        box(0.5 * s, 0.24, 0.6 * s, hull, 0, 0.12, 0, aim); add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.7, 8), steel), aim).position.y = 0.55;
        const mat = this.std(0xbff6ff, { emissive: 0x3fd0ff, emissiveIntensity: 0.8, transparent: true, opacity: 0.92 });
        const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.26 * s), mat); cr.position.y = 1.0; cr.scale.y = 1.5; aim.add(cr); g.userData.spin = cr; g.userData.frostMat = mat;
        g.userData.shards = []; for (let k = 0; k < lv + 1; k++) { const sh = new THREE.Mesh(new THREE.OctahedronGeometry(0.08 + lv * 0.01), mat); aim.add(sh); g.userData.shards.push(sh); }
      }
      if (t.type === 'carrier') {
        box(Wd * 0.9, 0.62 + lv * 0.04, Lh * 0.62, hull2, 0, 0.32, 0.1, aim); box(Wd * 0.6, 0.06, Lh * 0.4, acc, 0, 0.66 + lv * 0.04, 0.1, aim);
        g.userData.doors = []; for (const x of [-1, 1]) { const dl = new THREE.Group(); dl.position.set(x * Wd * 0.44, 0.32, 0.1 + Lh * 0.31); aim.add(dl); const d = add(new THREE.Mesh(new THREE.BoxGeometry(Wd * 0.44, 0.56, 0.05), steel), dl); d.position.x = -x * Wd * 0.22; g.userData.doors.push(dl); }
        if (lv >= 3) for (const x of [-1, 1]) box(0.08, 0.3, Lh * 0.5, gold, x * Wd * 0.47, 0.5, 0.1, aim);
      }
      const cast = !this.opts.mobile; g.traverse(o => { if (o.isMesh && !o.material.transparent) o.castShadow = cast; });   // phones: vehicles use the instanced blob shadows
      g.userData.parts = parts.map(m => ({ m, y: m.position.y, d: Math.random() * 0.15 + m.position.y * 0.05 }));
      g.userData.lvl = lv; g.userData.type = t.type; g.userData.build = 0; g.userData.head = aim;
      return g;
    }
    drawTowers(sim, dt) {
      for (let s = 0; s < sim.towers.length; s++) {
        const t = sim.towers[s]; let o = this.towerObjs[s];
        if (!t) { if (o) { if (!o.userData.dying) { o.userData.dying = 0; this.dyingObjs.push(o); } this.towerObjs[s] = null; } continue; }
        if (!o || o.userData.lvl !== t.lvl || o.userData.type !== t.type) {
          const upgrade = !!o; if (o) this.disposeObj(o);
          o = this.towerObjs[s] = this.buildTower(t); this.scene.add(o); if (upgrade) o.userData.build = 0.3;
          this.burst(t.x, 2, t.z, 50, 0xffd23a, 6, 0.55, 0.7, 6); this.ring(t.x, t.z, 0xffd23a, 4, 0.6); this.ring(t.x, t.z, KM.TOWERS[t.type].color, 6, 0.8);
        }
        o.position.set(t.x, 0, t.z); o.scale.setScalar(1.12); o.rotation.y = -(t.vx || 0) * 0.05;
        const Ud = o.userData; if (Ud.wheels) for (const w of Ud.wheels) w.rotation.x -= dt * (1.05 + Math.abs(t.vx || 0)) * 3.2;
        if (t.down > 0) { o.rotation.z = 0.12; o.position.y = -0.08; if (Math.random() < 0.35) this.emit(t.x + (Math.random() - 0.5), 1.2, t.z, 0, 1.1, 0, 0x3a3a3a, 1.2, 1.1, -0.6); } else { o.rotation.z = 0; o.position.y = Math.abs(Math.sin(this.time * 9 + s)) * 0.025; }
        const U = o.userData; U.build += dt;
        if (U.build < 1.2) for (const p of U.parts) { const u = Math.min(1, Math.max(0, (U.build - p.d) / 0.35)); p.m.position.y = p.y - (1 - u * u * (3 - 2 * u)) * 2.2; p.m.visible = u > 0; }
        else if (!U.batched) { for (const p of U.parts) { p.m.position.y = p.y; p.m.visible = true; } U.wheelN = U.wheels.length; U.wheels = []; this.batchStatic(o); }   // wheels join the static batch (one draw per material)
        const a = U.aim; let dy = t.aim - a.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); a.rotation.y += dy * Math.min(1, dt * (t.type === 'artillery' ? 4 : 10));
        const r = t.recoil; a.position.z = -r * 0.14 * Math.cos(a.rotation.y); a.position.x = -r * 0.14 * Math.sin(a.rotation.y);
        if (U.barrels) U.barrels.forEach((b, k) => { b.position.z = 0.3 - r * 0.3 * (k === (sim.t * 2 | 0) % U.barrels.length ? 1 : 0.3); });
        if (U.spin) { U.spin.rotation.y += dt * (1.5 + t.lvl * 0.3); U.frostMat.emissiveIntensity = 0.6 + Math.sin(this.time * 4) * 0.25 + r * 1.2; U.shards.forEach((sh, k) => { const ang = this.time * 1.8 + k / U.shards.length * Math.PI * 2; sh.position.set(Math.cos(ang) * 0.7, 1.0 + Math.sin(ang * 2) * 0.15, Math.sin(ang) * 0.7); sh.rotation.y = ang; }); }
        if (U.doors) { const op = Math.min(1, r * 2.2); U.doors[0].rotation.y = -op * 1.4; U.doors[1].rotation.y = op * 1.4; }
        // damage state: darken, shake on hit, smoke + sparks when low
        const hf = t.mhp ? t.hp / t.mhp : 1; U.hpBar = U.hpBar || this.makeBar(o); U.hpBar.visible = hf < 0.999; U.hpBar.children[1].scale.x = Math.max(0.001, hf); U.hpBar.children[1].material.color.setHSL(0.33 * hf, 0.9, 0.5);
        if (t.hitT < 0.15) { o.position.x += (Math.random() - 0.5) * 0.12; o.position.z += (Math.random() - 0.5) * 0.12; }
        if (hf < 0.5 && Math.random() < (0.6 - hf) * 0.5) this.emit(t.x + (Math.random() - 0.5), 2 + Math.random(), t.z + (Math.random() - 0.5), 0, 1.2, 0, hf < 0.25 ? 0x3a3a3a : 0x777777, 1.2, 1.1, -0.6);
        if (hf < 0.25 && Math.random() < 0.15) this.emit(t.x, 2.4, t.z, (Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2, 0xff8a2a, 0.35, 0.4, 6);
      }
      // knocked-out vehicles being replaced: sink, tilt, debris
      for (let k = this.dyingObjs.length - 1; k >= 0; k--) { const o = this.dyingObjs[k]; const u = (o.userData.dying += dt);
        if (u < dt * 1.5) { this.burst(o.position.x, 1.5, o.position.z, 50, 0xb4b9c2, 6, 0.9, 1.0, 9); this.burst(o.position.x, 1, o.position.z, 20, 0x555555, 3, 1.6, 1.4, -1); this.ring(o.position.x, o.position.z, 0xffa040, 5, 0.6); this.shake = Math.max(this.shake, 0.18); }
        o.position.y = -u * u * 2.5; o.rotation.z = u * 0.6; o.rotation.x = u * 0.3; if (u > 1.4) { this.disposeObj(o); this.dyingObjs.splice(k, 1); } }
      // precision tracers fade
      for (const tr of this.tracers) { if (!tr.visible) continue; tr.userData.t += dt; tr.material.opacity = Math.max(0, 0.9 - tr.userData.t * 4); if (tr.userData.t > 0.25) tr.visible = false; }
    }
    makeBar(parent) {
      const g = new THREE.Group(), bg = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.18), new THREE.MeshBasicMaterial({ color: 0x1a1a22, depthTest: false, transparent: true, opacity: 0.8 })), fg = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.12).translate(0.75, 0, 0), new THREE.MeshBasicMaterial({ color: 0x4cff8a, depthTest: false }));
      fg.position.x = -0.75; fg.position.z = 0.001; g.add(bg); g.add(fg); g.position.y = 4.2; g.rotation.x = -1.0; g.renderOrder = 5; bg.renderOrder = 5; fg.renderOrder = 6; parent.add(g); return g;
    }
    tracer(x0, z0, x1, z1, color) {
      let tr = this.tracers.find(t => !t.visible); if (!tr) return;
      const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz); tr.position.set((x0 + x1) / 2, 2.4, (z0 + z1) / 2); tr.rotation.set(0, Math.atan2(dx, dz), 0); tr.scale.set(1, 1, len);
      tr.material.color.setHex(color); tr.userData.t = 0; tr.visible = true;
    }
    disposeObj(o) { this.scene.remove(o); o.traverse(m => { if (m.geometry) m.geometry.dispose(); if (m.material && m.material !== this.lGold) m.material.dispose && m.material.dispose(); }); }

    // ---------- coins ----------
    initCoins() {
      const P = KM.kitPart, T2 = KM.kitTRS;
      const geo = KM.kitMerge([P(new THREE.CylinderGeometry(0.24, 0.24, 0.09, 18), 0xffc21a, 0, T2(0, 0, 0, Math.PI / 2, 0, 0)), P(new THREE.TorusGeometry(0.235, 0.03, 6, 20), 0xffe27a, 0), P(new THREE.CircleGeometry(0.11, 5), 0xfff4b8, 0, T2(0, 0, 0.047, 0, 0, Math.PI / 2)), P(new THREE.CircleGeometry(0.11, 5), 0xfff4b8, 0, T2(0, 0, -0.047, 0, Math.PI, Math.PI / 2))]);
      const mat = KM.toonMat({ emissive: 0xa06a00, emissiveIntensity: 0.75 });
      this.coinM = new THREE.InstancedMesh(geo, mat, KM.Sim.CCAP); this.coinM.frustumCulled = false; this.coinM.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(this.coinM);
      this.coinGlow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: radialTex('rgba(255,210,80,0.46)', 'rgba(255,210,80,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), KM.Sim.CCAP); this.coinGlow.frustumCulled = false; this.scene.add(this.coinGlow);
    }
    drawCoins(sim) {
      const C = sim.c, m = this.m, q = this.q, e = this.e, p = this.v, s = this.s3; let n = 0, live = 0;
      for (let k = 0; k < KM.Sim.CCAP; k++) if (C.st[k]) live++;
      const dens = Math.max(0.55, Math.min(1, Math.sqrt(60 / Math.max(1, live))));   // density-aware: a big loot field shrinks each coin (and more its glow) so the battle stays readable; values and pickup unchanged
      for (let k = 0; k < KM.Sim.CCAP; k++) {
        if (!C.st[k]) continue;
        const big = Math.min(1.6, 1.0 + Math.sqrt(C.v[k]) * 0.18), fade = C.st[k] === 1 && C.age[k] > 19 ? (Math.floor(C.age[k] * 8) % 2 ? 0.6 : 1) : 1;
        const y = C.y[k] + (C.st[k] === 1 && C.vy[k] === 0 ? 0.12 + Math.sin(this.time * 4 + k) * 0.08 : 0);
        // face the camera (never edge-on → never a streak), with a ±35° wobble that reads as spinning
        const cy = Math.atan2(this.cam.position.x - C.x[k], this.cam.position.z - C.z[k]), cp = -Math.atan2(this.cam.position.y - y, Math.hypot(this.cam.position.x - C.x[k], this.cam.position.z - C.z[k])) * 0.6;
        e.set(cp, cy + Math.sin(this.time * 5 + k) * 0.6, 0, 'YXZ'); q.setFromEuler(e); p.set(C.x[k], y + 0.1, C.z[k]);
        const pulse = 1 + Math.sin(this.time * 7 + k * 1.7) * 0.06; s.setScalar(big * fade * pulse * dens); m.compose(p, q, s); this.put(this.coinM, n, m);
        q.identity(); p.set(C.x[k], 0.06, C.z[k]); s.setScalar(big * 0.8 * dens * dens); m.compose(p, q, s); this.put(this.coinGlow, n, m); n++;
      }
      this.coinM.count = this.coinGlow.count = n; this.coinM.instanceMatrix.needsUpdate = this.coinGlow.instanceMatrix.needsUpdate = true;
    }

    // ---------- projectiles ----------
    initProjectiles() {
      const mk = (geo, mat) => { const im = new THREE.InstancedMesh(geo, mat, KM.Sim.PCAP); im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.count = 0; this.scene.add(im); return im; };
      const arrow = merge([part(new THREE.BoxGeometry(0.05, 0.05, 0.7), 0x8a5a33, 0), part(new THREE.ConeGeometry(0.06, 0.16, 5).rotateX(Math.PI / 2), 0xdddddd, 0, T(0, 0, 0.42)), part(new THREE.BoxGeometry(0.16, 0.02, 0.14), 0xffffff, 0, T(0, 0, -0.3))]);
      this.proj = [
        mk(arrow, new THREE.MeshLambertMaterial({ vertexColors: true })),
        mk(new THREE.SphereGeometry(0.24, 10, 8), this.std(0x26272e, { metalness: 0.6, roughness: 0.4 })),
        mk(new THREE.IcosahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: 0x9ff0ff })),
        mk(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0xd77bff })),
        mk(new THREE.BoxGeometry(0.08, 0.08, 1.3), new THREE.MeshBasicMaterial({ color: 0xe4c2ff })),
      ];
      // friendly ranged eras (10–16), tank shell (20), missile (21): each looks and flies differently (arc set in the sim)
      const vc = new THREE.MeshLambertMaterial({ vertexColors: true }), basic = c => new THREE.MeshBasicMaterial({ color: c });
      this.proj[10] = mk(new THREE.DodecahedronGeometry(0.11, 0), this.std(0x9a9488));
      this.proj[11] = mk(merge([part(new THREE.BoxGeometry(0.04, 0.04, 1.0), 0x8f5c34, 0), part(new THREE.ConeGeometry(0.05, 0.18, 4).rotateX(Math.PI / 2), 0xd4dae4, 0, T(0, 0, 0.58))]), vc);
      this.proj[12] = this.proj[0];
      this.proj[13] = mk(merge([part(new THREE.BoxGeometry(0.05, 0.05, 0.45), 0x3d2818, 0), part(new THREE.ConeGeometry(0.05, 0.12, 4).rotateX(Math.PI / 2), 0xd4dae4, 0, T(0, 0, 0.28))]), vc);
      this.proj[14] = mk(new THREE.BoxGeometry(0.06, 0.06, 0.9), basic(0xffe08a));
      this.proj[15] = mk(new THREE.BoxGeometry(0.04, 0.04, 1.5), basic(0xfff2c0));
      this.proj[16] = mk(new THREE.BoxGeometry(0.1, 0.1, 0.8), basic(0x6ff4ff));
      this.proj[20] = mk(new THREE.SphereGeometry(0.17, 8, 6).scale(1, 1, 1.8), basic(0xffb347));
      this.proj[21] = mk(merge([part(new THREE.CylinderGeometry(0.07, 0.07, 0.55, 6).rotateX(Math.PI / 2), 0xe8eef6, 0), part(new THREE.ConeGeometry(0.07, 0.16, 6).rotateX(Math.PI / 2), 0xff5a3a, 0, T(0, 0, 0.35)), part(new THREE.BoxGeometry(0.26, 0.02, 0.1), 0x7d8796, 0, T(0, 0, -0.22))]), vc);
      this.proj[22] = this.proj[11];   // thrown melee spear
      // command-tank shells (src 2) for the early eras' kinds 13/1: a steel shell with a bright tracer tail, never a ballista bolt
      this.shell = mk(merge([part(new THREE.CylinderGeometry(0.11, 0.13, 0.32, 8).rotateX(Math.PI / 2), 0x5a6476, 0), part(new THREE.ConeGeometry(0.11, 0.2, 8).rotateX(Math.PI / 2), 0x8892a6, 0, T(0, 0, 0.26)), part(new THREE.CylinderGeometry(0.05, 0.12, 0.5, 6).rotateX(Math.PI / 2), 0xfff0c0, 0, T(0, 0, -0.4))]), new THREE.MeshBasicMaterial({ vertexColors: true }));
      this.projList = [...new Set(this.proj.filter(Boolean).concat([this.shell]))];
    }
    drawProjectiles(sim) {
      const P = sim.p, cnt = this.projCnt || (this.projCnt = new Map()), m = this.m, p = this.v, s = this.s3, look = this.m2, up = new V3(0, 1, 0), tgt = new V3();
      // cannon shells leave from the muzzle: drawn at the barrel height, and not before they have cleared the barrel end
      const L = sim.L, mz = this.mz || (this.mz = new V3()); let mY = 1.55, mZ = L.z - 2.1;
      for (const b of this.barrels) { if (!b.visible) continue; mz.set(0, 0, -1.55).applyMatrix4(b.matrixWorld); if (mz.y > 0.2) { mY = mz.y; mZ = mz.z; } break; }
      for (let k = 0; k < KM.Sim.PCAP; k++) {
        if (!P.on[k]) continue;
        const kd = P.kind[k], shell = P.src[k] === 2 && (kd === 13 || kd === 1);
        if (shell && P.z[k] > mZ) continue;
        const u = Math.min(1, P.t[k] / P.tof[k]), h = P.kind[k] === 4 ? 0.2 : P.h[k], y = shell ? mY : 1.0 + h * 4 * u * (1 - u) - u * 0.6;
        const u2 = Math.min(1, u + 0.02), y2 = shell ? mY : 1.0 + h * 4 * u2 * (1 - u2) - u2 * 0.6;
        p.set(P.x[k], y, P.z[k]); tgt.set(P.sx[k] + (P.ex[k] - P.sx[k]) * u2, y2, P.sz[k] + (P.ez[k] - P.sz[k]) * u2);
        look.lookAt(tgt, p, up); this.q.setFromRotationMatrix(look); s.setScalar(1); m.compose(p, this.q, s);
        const im = shell ? this.shell : this.proj[kd] || this.proj[0], n = cnt.get(im) || 0; this.put(im, n, m); cnt.set(im, n + 1);
        const trail = shell ? 0xffe2a8 : kd === 21 ? 0xbbbbbb : kd === 20 ? 0xffa040 : kd === 16 ? 0x6ff4ff : kd === 1 ? 0x888888 : kd === 2 ? 0x9ff0ff : kd === 3 || kd === 4 ? 0xd77bff : 0;
        if (trail && Math.random() < 0.5 * (this.loadK || 1)) this.emit(p.x, y, p.z, 0, 0.3, 0, trail, kd === 21 ? 0.6 : 0.45, 0.35);
      }
      for (const im of this.projList) { im.count = cnt.get(im) || 0; im.instanceMatrix.needsUpdate = true; } cnt.clear();
    }

    // ---------- particles ----------
    initFx() {
      const N = this.PN = 5000; this.pi = 0;
      this.pp = new Float32Array(N * 3); this.pv = new Float32Array(N * 3); this.pl = new Float32Array(N); this.pm = new Float32Array(N); this.pc = new Float32Array(N * 3); this.ps = new Float32Array(N); this.pa = new Float32Array(N); this.pg = new Float32Array(N);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pp, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aColor', new THREE.BufferAttribute(this.pc, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aSize', new THREE.BufferAttribute(this.ps, 1).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aAlpha', new THREE.BufferAttribute(this.pa, 1).setUsage(THREE.DynamicDrawUsage));
      const mat = new THREE.ShaderMaterial({
        uniforms: { uScale: { value: 300 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: 'attribute vec3 aColor; attribute float aSize; attribute float aAlpha; varying vec3 vC; varying float vA; uniform float uScale; void main(){ vC=aColor; vA=aAlpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=aSize*uScale/-mv.z; gl_Position=projectionMatrix*mv; }',
        fragmentShader: 'varying vec3 vC; varying float vA; void main(){ vec2 d=gl_PointCoord-0.5; float r=dot(d,d)*4.0; if(r>1.0) discard; float a=(1.0-r); gl_FragColor=vec4(vC*a*vA*1.4, a*vA); }',
      });
      this.points = new THREE.Points(g, mat); this.points.frustumCulled = false; this.scene.add(this.points);
      // expanding rings (upgrade/tower/boom)
      this.rings = []; const rg = new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2);
      for (let k = 0; k < 16; k++) { const r = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); r.visible = false; r.position.y = 0.08; this.scene.add(r); this.rings.push({ m: r, t: 9 }); }
      this.ri = 0;
    }
    emit(x, y, z, vx, vy, vz, color, size, life, grav) {
      const i = this.pi = (this.pi + 1) % this.PN; const c = this.col2.setHex(color);
      this.pp[i * 3] = x; this.pp[i * 3 + 1] = y; this.pp[i * 3 + 2] = z; this.pv[i * 3] = vx; this.pv[i * 3 + 1] = vy; this.pv[i * 3 + 2] = vz;
      this.pc[i * 3] = c.r; this.pc[i * 3 + 1] = c.g; this.pc[i * 3 + 2] = c.b; this.ps[i] = size; this.pl[i] = life; this.pm[i] = life; this.pg[i] = grav || 0;
    }
    // big battles: fewer, slightly larger particles (less transparent overdraw, same read)
    burst(x, y, z, n, color, speed, size, life, grav) { const lk = this.loadK || 1; if (lk < 1 && n > 2) { n = Math.max(2, Math.round(n * lk)); size *= 1 + (1 - lk) * 0.5; } for (let k = 0; k < n; k++) { const a = Math.random() * 6.283, u = Math.random() * 2 - 1, s = speed * (0.4 + Math.random() * 0.6), r = Math.sqrt(1 - u * u); this.emit(x, y, z, Math.cos(a) * r * s, Math.abs(u) * s + speed * 0.2, Math.sin(a) * r * s, color, size * (0.6 + Math.random() * 0.8), (life || 0.5) * (0.6 + Math.random() * 0.6), grav == null ? 9 : grav); } }
    ring(x, z, color, size, life) { const r = this.rings[this.ri = (this.ri + 1) % this.rings.length]; r.m.material.color.setHex(color); r.m.position.x = x; r.m.position.z = z; r.t = 0; r.life = life || 0.6; r.size = size || 3; r.m.visible = true; }
    stepFx(dt) {
      const N = this.PN;
      for (let i = 0; i < N; i++) {
        if (this.pl[i] <= 0) { this.pa[i] = 0; continue; }
        this.pl[i] -= dt; const k = i * 3;
        this.pv[k + 1] -= this.pg[i] * dt; this.pp[k] += this.pv[k] * dt; this.pp[k + 1] += this.pv[k + 1] * dt; this.pp[k + 2] += this.pv[k + 2] * dt;
        if (this.pp[k + 1] < 0.05) { this.pp[k + 1] = 0.05; this.pv[k + 1] *= -0.3; this.pv[k] *= 0.7; this.pv[k + 2] *= 0.7; }
        this.pa[i] = Math.max(0, this.pl[i] / this.pm[i]);
      }
      const g = this.points.geometry; g.attributes.position.needsUpdate = g.attributes.aAlpha.needsUpdate = g.attributes.aColor.needsUpdate = g.attributes.aSize.needsUpdate = true;
      this.points.material.uniforms.uScale.value = innerHeight * this.dpr * 0.5;
      for (const r of this.rings) { if (!r.m.visible) continue; r.t += dt; const u = r.t / r.life; if (u >= 1) { r.m.visible = false; continue; } r.m.scale.setScalar(0.3 + u * r.size); r.m.material.opacity = (1 - u) * 0.9; }
    }

    // cannon muzzle flash at every visible barrel; it grows and turns from a warm powder flash into blue energy with the existing
    // tank upgrades (cannon damage line, fire-rate barrels, eras). Visual only.
    muzzle(sim) {
      const look = KM.tankLook(sim.stats), era = this.lEra || 0, tier = Math.min(1, (look.cannon ? 0.35 : 0) + (look.barrels - 1) * 0.2 + era * 0.07), energy = era >= 5 || look.heavy, L = sim.L, v = this.v;
      const hot = energy ? 0x9fdcff : 0xffd27a, core = energy ? 0xe8f6ff : 0xfff1c0, n = Math.round(6 + tier * 10);
      for (const b of this.barrels) { if (!b.visible) continue; v.set(0, 0, -1.55).applyMatrix4(b.matrixWorld); if (!(v.y > 0.2)) v.set(L.x, 1.55, L.z - 2.1);
        this.burst(v.x, v.y, v.z, n, hot, 4 + tier * 3, 0.45 + tier * 0.25, 0.18 + tier * 0.08, 2); this.emit(v.x, v.y, v.z, 0, 0.2, 0, core, 1.3 + tier * 1.1, 0.08 + tier * 0.04, 0);
        if (tier > 0.45 && this.fxBudget > 0) { this.fxBudget--; this.emit(v.x, v.y, v.z - 0.4, 0, 0, -6, hot, 0.9 + tier, 0.12, 0); }
        if (!energy && this.fxBudget > 0) { this.fxBudget--; this.emit(v.x, v.y + 0.1, v.z, (Math.random() - 0.5) * 0.6, 0.8, -0.4, 0x8a8a8a, 0.9 + tier * 0.6, 0.45, -0.4); } }
      if (energy) this.ring(L.x, L.z - 2, 0x9fdcff, 1.6 + tier * 1.4, 0.25);
    }
    // ---------- events → FX ----------
    onEvent(sim, type, a, b, c, d, e) {
      switch (type) {
        case 'stomp': this.ring(a, b, 0xffb03a, c, 0.6); this.ring(a, b, 0xff5a3a, c * 0.6, 0.45); this.burst(a, 0.3, b, 30, 0xc8a070, 6, 0.6, 0.6, 2); break;
        case 'bossTell': { const i = a; this.ring(sim.x[i], sim.z[i], b === 'charge' ? 0xff3a3a : 0xffd23a, sim.sc[i] * 0.9, 0.9); break; }
        case 'kill': { const i = a, d = b, s = sim.sc[i]; this.burst(sim.x[i], 0.6 * s, sim.z[i], d.el ? 30 : 6, ENEMY_COL[d.k], d.el ? 7 : 3.5, d.el ? 0.7 : 0.4, 0.45); if (d.el) this.ring(sim.x[i], sim.z[i], 0xff5a3a, 4); this.emit(sim.x[i], 0.3, sim.z[i], 0, 0.6, 0, 0xffe7a0, 1.4 * s, 0.25, 0); break; }
        case 'shove': {                                                                       // heavy blow: radial dust, shock ring, hot spark, tiny camera kick for big ones
          const x = c, z = d, r = e || 1.3, big = r >= 2 || b >= 4; if (this.shoveT > 0 && !big) break; this.shoveT = 0.06; if (this.fxBudget <= 0 && !big) break; this.fxBudget -= 4;
          const nd = big ? 16 : 9; for (let k = 0; k < nd; k++) { const ang = k / nd * 6.283 + Math.random() * 0.3, sp = r * (2.2 + Math.random() * 1.4); this.emit(x + Math.cos(ang) * 0.3, 0.12, z + Math.sin(ang) * 0.3, Math.cos(ang) * sp, 0.5 + Math.random() * 0.6, Math.sin(ang) * sp, 0xd9b98a, 0.8 + r * 0.25, 0.42, 2.5); }
          this.ring(x, z, 0xfff0c8, r * 1.5, 0.28); this.burst(x, 0.8, z, big ? 10 : 5, 0xffe27a, 5, 0.45, 0.22, 6); this.emit(x, 0.7, z, 0, 0.3, 0, 0xfff6d8, 1.3 + r * 0.4, 0.12, 0);
          if (big && Math.abs(z - sim.L.z) < 40) this.shake = Math.max(this.shake, r >= 2.6 ? 0.07 : 0.045); break; }
        case 'tankfire': this.muzzle(sim); break;
        case 'missiles': this.burst(sim.L.x, 1.8, sim.L.z + 0.3, 10, 0xcccccc, 2.5, 0.6, 0.6, -1); break;
        case 'shieldBreak': { const L = sim.L, r = sim.stats.shRadius; for (let k = 0; k < 28; k++) { const a2 = k / 28 * 6.283; this.emit(L.x + Math.cos(a2) * r, 0.6 + Math.random() * 1.2, L.z + Math.sin(a2) * r, Math.cos(a2) * 3, 1.5, Math.sin(a2) * 3, 0x9ff2ff, 0.6, 0.5, 4); } this.ring(L.x, L.z, 0x9ff2ff, r * 1.6, 0.5); this.shake = Math.max(this.shake, 0.06); break; }
        case 'shieldUp': this.ring(sim.L.x, sim.L.z, 0x7fd8ff, sim.stats.shRadius * 1.2, 0.6); break;
        case 'deposit': this.burst(sim.L.x, 1.4, sim.L.z, 10, 0xffd34a, 3.5, 0.45, 0.45); this.ring(sim.L.x, sim.L.z, 0xffd34a, 2.2, 0.35); break;
        case 'colLost': this.burst(sim.x[a], 0.6, sim.z[a], 12, 0xffd34a, 3, 0.4, 0.5); break;
        case 'posture': this.ring(sim.L.x, sim.L.z - 4, a ? 0x4f8dff : 0xff5a3a, 9, 0.7); this.ring(sim.L.x, sim.L.z, a ? 0x7fd8ff : 0xffd23a, 4, 0.45); break;
        case 'fdie': this.burst(sim.x[a], 0.6, sim.z[a], 4, 0x5aa0ff, 3, 0.35, 0.4); break;
        case 'hit': if (b >= 0 && sim.def(b).sh && this.fxBudget > 0) { this.fxBudget--; this.burst(sim.x[b], 0.65, sim.z[b] + (sim.team[b] ? 0.3 : -0.3), 5, 0xcfe6ff, 3.5, 0.35, 0.22, 4); }
          if (Math.random() < 0.35 * Math.min(1, this.fxBudget / 30)) { const t = b; if (t >= 0) this.burst((sim.x[a] + sim.x[t]) / 2, 0.7, (sim.z[a] + sim.z[t]) / 2, c ? 8 : 2, c ? 0xffe14a : 0xfff4d0, c ? 4 : 2.5, c ? 0.5 : 0.28, 0.25); } break;
        case 'cleave': this.burst(sim.x[a], 0.5, sim.z[a] + 1, 14, 0xffffff, 4, 0.35, 0.3); this.ring(sim.x[a], sim.z[a] + 1, 0xffaaaa, 2.5, 0.35); break;
        case 'deploy': { const L = sim.L; this.burst(L.x, 1.6, L.z - 1.4, 3, 0x7cc4ff, 2.5, 0.45, 0.3, 2); break; }
        case 'boom': this.burst(a, 0.5, b, 40, 0xff8a2a, 7, 0.9, 0.6, 6); this.burst(a, 0.5, b, 14, 0x555555, 3, 1.4, 0.9, -1); this.ring(a, b, 0xff7a2a, c * 1.2, 0.4); this.shake = Math.max(this.shake, 0.15); break;
        case 'impact': if (a === 1) { this.burst(b, 0.4, c, 18, 0xffa040, 5, 0.7, 0.45); this.ring(b, c, 0xffa040, 2.6, 0.35); } else if (a === 2) { this.burst(b, 0.4, c, 18, 0x9ff0ff, 4, 0.6, 0.6, 2); this.ring(b, c, 0x9ff0ff, 3, 0.5); } else if (a === 4) this.burst(b, 0.8, c, 12, 0xe4c2ff, 5, 0.5, 0.35); else if (a === 20 || a === 21) { this.burst(b, 0.5, c, a === 21 ? 22 : 14, 0xffa040, 5, 0.6, 0.4); this.ring(b, c, 0xffb347, 1.8, 0.3); } break;
        case 'wave': if (a === 'boss') { this.ring(0, sim.front - 50, 0xff2a2a, 14, 1.2); this.shake = Math.max(this.shake, 0.2); } break;
        case 'elite': this.ring(0, sim.front - 52, 0xff5a3a, 8, 0.8); break;
        case 'coin': if (Math.random() < 0.5) this.burst(sim.L.x, 1.4, sim.L.z, 3, 0xffd34a, 3, 0.4, 0.35); break;
        case 'lhit': this.burst(sim.L.x, 1, sim.L.z, 10, 0xff4a3a, 4, 0.5, 0.35); this.shake = Math.max(this.shake, 0.12); break;
        case 'upgrade': this.cheerT = 0.85; this.burst(sim.L.x, 1, sim.L.z, 60, 0xffd23a, 6, 0.6, 0.7, 5); this.ring(sim.L.x, sim.L.z, 0xffd23a, 6, 0.7); this.ring(sim.L.x, sim.L.z, 0x7cc4ff, 4, 0.5); break;
        case 'heal': this.burst(sim.x[a], 1, sim.z[a], 6, 0x8aff7a, 2, 0.5, 0.6, -1); break;   // enemy shaman heal
        case 'beam': this.beam(a, b); this.glowPulse[a] = 1; if (this.fxBudget > 0) { this.fxBudget--; this.burst(sim.x[b], 0.9 * sim.sc[b], sim.z[b], 4, 0x8fd0ff, 2, 0.42, 0.5, -1); } break;   // MIZARD: blue beam + sparkle on the patient, crystal flares
        case 'healBurst': {   // density-aware: many Mizards pulsing together read as a few clear rings, not a stack (healing itself is unchanged)
          const H = this.hbFx || (this.hbFx = []), now = this.clock || 0; let near = 0; for (const h of H) if (now - h.t < 0.45 && Math.abs(h.x - a) < c && Math.abs(h.z - b) < c) near++;
          if (near >= 2 || this.hbN >= 3) break; this.hbN = (this.hbN || 0) + 1; H.push({ x: a, z: b, t: now }); if (H.length > 24) H.shift();
          this.ring(a, b, 0x5fb4ff, c, 0.7); if (!near) this.ring(a, b, 0xb8e4ff, c * 0.55, 0.5); this.burst(a, 1, b, near ? 5 : 10, 0x9fd6ff, 3, 0.6, 0.7, -1); break; }
        case 'death': this.burst(sim.L.x, 1, sim.L.z, 120, 0xffa040, 9, 1.0, 1.0, 6); this.burst(sim.L.x, 1, sim.L.z, 40, 0x666666, 4, 2, 1.6, -1.5); this.ring(sim.L.x, sim.L.z, 0xff6a2a, 10, 0.9); this.shake = 0.4; this.deathT = 0; break;
        case 'revive': this.ring(sim.L.x, sim.L.z, 0x7cc4ff, 12, 0.9); this.burst(sim.L.x, 1, sim.L.z, 80, 0x7cc4ff, 7, 0.8, 0.8); break;
        case 'tower': { const t = a, my = 1.2 + t.lvl * 0.05; if (t.type === 'gun' && t.lvl >= 3 && t.tgt >= 0) this.tracer(t.x, t.z, sim.x[t.tgt], sim.z[t.tgt], 0xffe9b0); if (t.type === 'carrier') this.burst(t.x, 0.6, t.z + 1.0, 10, 0x7cc4ff, 3, 0.4, 0.4); if (t.type === 'gun') this.emit(t.x + Math.sin(t.aim) * 1.1, my, t.z + Math.cos(t.aim) * 1.1, 0, 0.5, 0, 0xfff0c0, 0.9, 0.12, 0); if (t.type === 'artillery') this.burst(t.x + Math.sin(t.aim), my + 0.4, t.z + Math.cos(t.aim), 8, 0xaaaaaa, 2, 0.8, 0.5, -1); break; }
      }
    }

    // ---------- camera ----------
    // Key gameplay points that must stay on screen: command vehicle (with bottom margin), support vehicles,
    // lane edges at the launcher's depth, and the incoming threat zone ahead of the front.
    keyPoints(sim) {
      const L = sim.L, P = this.kp || (this.kp = []); P.length = 0;
      const add = (x, z, y, m) => P.push({ x, z, y: y || 0, m: m || 0 });
      add(L.x, L.z + 1.6, 0, 0.12); add(L.x - 1.4, L.z, 1.5, 0.05); add(L.x + 1.4, L.z, 1.5, 0.05);
      add(-6.8, L.z - 2, 0, 0); add(6.8, L.z - 2, 0, 0);                         // central lane (edges may crop, like the concept)
      if (this.aspect < 0.8) { add(-8.6, sim.front - 3, 0, 0); add(8.6, sim.front - 3, 0, 0); }    // portrait: the full fighting width at the clash (the yaw brings one shoulder in)
      if (this.layout === 'landscape') {   // phone landscape: the tank's whole travel and the lane behind it stay in the centre column (between the roster and the right controls), above the home bar
        const sx = this.safeSideNdc || 0.6; P[0].m = 0.08 + 2 * (this.safeBotPx || 0) / innerHeight;
        for (const s of [-1, 1]) { add(s * (W.LANE - 1 + 1.4), L.z, 1.5, 0); P[P.length - 1].sx = sx; add(s * W.LANE, L.z + 1.6, 0, 0); P[P.length - 1].sx = sx; }
      }
      for (const t of sim.towers) if (t) { add(t.x - Math.sign(t.x) * -1.0, t.z, 2.2, 0.02); add(t.x, t.z + 1, 0, 0.02); }
      add(0, sim.front - 26, 0, 0.0);                                              // threat zone (HUD covers the very top)
      return P;
    }
    // Smallest camera distance (closest view, biggest characters) that keeps every key point inside the safe area.
    fitDistance(sim, tx, tz, pitch, minD, maxD) {
      const cam = this.fitCam || (this.fitCam = new THREE.PerspectiveCamera()), v = this.v, P = this.keyPoints(sim);
      cam.fov = this.cam.fov; cam.aspect = this.aspect; cam.near = 0.5; cam.far = 300; cam.updateProjectionMatrix();
      const hudTop = 1 - 2 * (this.safeTopPx || 118) / innerHeight;          // NDC y below the HUD pills + HP bar
      const ok = d => { cam.position.set(tx, Math.sin(pitch) * d, tz + Math.cos(pitch) * d); cam.lookAt(tx, 0, tz); cam.updateMatrixWorld(); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
        for (const p of P) { v.set(p.x, p.y, p.z).project(cam); if (v.z > 1 || Math.abs(v.x) > (p.sx || 1 - p.m) || v.y < -1 + p.m || v.y > hudTop) return false; } return true; };   // sx: a narrower side limit (landscape centre column)
      let lo = minD, hi = maxD; if (ok(lo)) return lo; if (!ok(hi)) return hi;
      for (let k = 0; k < 14; k++) { const mid = (lo + hi) / 2; if (ok(mid)) hi = mid; else lo = mid; }
      return hi;
    }
    drawCamera(sim, dt) {
      const L = sim.L, army = sim.count[0] + sim.count[1];
      // phone landscape (short screen): a lower camera aimed nearer the tank so the defence line sits near mid-screen and the army stays large; same lane, same bounds
      const land = this.layout === 'landscape', pitch = land ? 0.65 : this.aspect > 1 ? 0.86 : 0.9; // ~50°: lower, more cinematic like the concept
      let tx = KM.W.LANE_CENTER_X, tz = sim.front - (land ? 12 : this.aspect > 1 ? 11 : this.aspect < 0.8 ? 16 : 14.5);   // the lane stays centred; only the tank slides
      if (KM.camFocus === 'launcher') { tx = L.x; tz = L.z - 1; } else if (KM.camFocus && KM.camFocus.x != null) { tx = KM.camFocus.x; tz = KM.camFocus.z; }
      // the target shifts toward the launcher on narrow screens so towers beside it stay framed
      if (!this.camT) this.camT = new V3(tx, 0, tz);
      if (KM.camFocus && KM.camFocus.x != null) this.camT.set(tx, 0, tz);          // staged close-ups snap
      else { this.camT.x += (tx - this.camT.x) * Math.min(1, dt * 3); this.camT.z += (tz - this.camT.z) * Math.min(1, dt * 4); }
      this.fitT = (this.fitT || 0) - dt;
      if (this.fitT <= 0 || this.fitD == null) { this.fitT = 0.25; this.fitD = this.fitDistance(sim, this.camT.x, this.camT.z, pitch, land ? 22 : this.aspect > 1 ? 30 : 24, 70); }
      let dist = this.fitD * (1 + Math.min(0.12, army / 4000));
      if (KM.camOverride) dist = KM.camOverride;
      if (KM.camFocus && KM.camFocus.x != null) this.camD = dist;
      this.camD = (this.camD || dist) + (dist - (this.camD || dist)) * Math.min(1, dt * 1.6);
      this.shake = Math.max(0, this.shake - dt * 1.2); this.shoveT = Math.max(0, (this.shoveT || 0) - dt);
      const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
      const flip = KM.camFocus && KM.camFocus.flip ? -1 : 1, pch = KM.camFocus && KM.camFocus.pitch || pitch;   // close-up rigs can look at the army's faces
      // straight down the lane: no yaw, no roll — enemy up, tank bottom, battle straight ahead
      this.cam.position.set(this.camT.x + sx, Math.sin(pch) * this.camD + sy, this.camT.z + Math.cos(pch) * this.camD * flip);
      this.cam.lookAt(this.camT.x, 0, this.camT.z);
      this.scene.fog.near = this.camD + 6; this.scene.fog.far = this.camD + 95;
      this.sun.position.set(this.camT.x + 12, 30, this.camT.z + 14); this.sun.target.position.set(this.camT.x, 0, this.camT.z - 4);
    }
    // NDC position of a world point under the live camera (used by the framing tests)
    toScreen(x, y, z) { this.v.set(x, y, z).project(this.cam); return { x: this.v.x, y: this.v.y }; }

    // MIZARD healing beams: one pooled line-segment draw (staff crystal → patient), blue like the crystal
    beam(a, b) { const B = this.beams || (this.beams = []); if (B.length < 96) B.push({ a, b, t: 0.28 }); }
    drawBeams(sim, dt) {
      if (!this.beamObj) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(96 * 6), 3)); g.setDrawRange(0, 0);
        this.beamObj = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x8fd4ff, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending })); this.beamObj.frustumCulled = false; this.scene.add(this.beamObj); }
      const B = this.beams || [], P = this.beamObj.geometry.attributes.position.array; let n = 0;
      for (let k = B.length - 1; k >= 0; k--) { const e = B[k]; e.t -= dt; if (e.t <= 0 || sim.st[e.a] !== 1 || sim.st[e.b] !== 1) { B.splice(k, 1); continue; }
        const o = n++ * 6, fresh = this.tipF[e.a] === this.frameTip; P[o] = fresh ? this.tipX[e.a] : sim.x[e.a]; P[o + 1] = fresh ? this.tipY[e.a] : 1.25 * sim.sc[e.a]; P[o + 2] = fresh ? this.tipZ[e.a] : sim.z[e.a]; P[o + 3] = sim.x[e.b]; P[o + 4] = 0.8 * sim.sc[e.b]; P[o + 5] = sim.z[e.b]; }
      this.beamObj.geometry.setDrawRange(0, n * 2); this.beamObj.geometry.attributes.position.needsUpdate = true; this.beamObj.visible = n > 0;
    }
    frame(sim, dt) {
      this.time += dt; if (this.deathT != null) this.deathT += dt; this.cheerT = Math.max(0, (this.cheerT || 0) - dt);
      this.hbN = 0; this.clock = (this.clock || 0) + dt;
      this.fxBudget = Math.max(3, Math.round(60 * (this.fxScale || 1) * (1 - Math.min(0.93, (sim.count[0] + sim.count[1]) / 2200))));
      this.loadK = Math.max(0.35, Math.min(1, (this.fxScale || 1) * (1 - Math.max(0, sim.count[0] + sim.count[1] - 300) / 1800)));
      this.simT = sim.t; this.lzCache = sim.L.z; this.streamWorld(sim.front);
      this.drawCamera(sim, dt); this.drawLauncher(sim, dt); this.drawTowers(sim, dt);
      this.drawCrowd(sim, dt); this.drawCoins(sim); this.drawProjectiles(sim); this.drawBeams(sim, dt); this.stepFx(dt);
      if (this.bloomOn && this.composer) this.composer.render(); else this.R.render(this.scene, this.cam);
    }
    resetRun() { this.beams = []; this.lEra = null; this.lEraSeen = null; this.deathT = null; this.camT = null; this.camD = null; this.fitD = null; for (let s = 0; s < this.towerObjs.length; s++) if (this.towerObjs[s]) { this.disposeObj(this.towerObjs[s]); this.towerObjs[s] = null; } for (const o of this.dyingObjs) this.disposeObj(o); this.dyingObjs = []; this.pl.fill(0); this.ry.fill(Math.PI); this.fogCol.setHex(KM.BIOMES[0].fog); }
  }
  KM.Render = Render;
})(window);
