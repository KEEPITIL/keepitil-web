/* KMOB renderer — three.js r128. Instanced crowds (one draw call per body part for every unit on screen),
   streamed battlefield chunks, launcher + towers with visible level evolution, pooled coins/projectiles/particles. */
(function (G) {
  const KM = G.KM, W = KM.W;
  const V3 = THREE.Vector3, M4 = THREE.Matrix4, Q = THREE.Quaternion, E = THREE.Euler, C = THREE.Color;
  const TEAM = [new C(0x2f74ff), new C(0xe2312c)];
  const ENEMY_COL = { grunt: 0xe2312c, imp: 0xf0463a, shield: 0xd02a2e, runner: 0xe83c2c, archer: 0xd8352f, knight: 0xa51f2c, brute: 0xd0262c, bomber: 0xe8482a, cannon: 0x9a2a2a, shaman: 0xa02c9e, warlord: 0x9a1424 };
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
      this.ry = new Float32Array(KM.Sim.CAP); this.shake = 0; this.time = 0; this.skin = KM.SHOP[3];
      this.m = new M4(); this.m2 = new M4(); this.q = new Q(); this.e = new E(0, 0, 0, 'YXZ'); this.v = new V3(); this.s3 = new V3(); this.col = new C();
      this.col2 = new C(); this.fxBudget = 60; this.lodNear = this.opts.lowPower ? 80 : 120; this.lodMid = this.opts.lowPower ? 300 : 450;
      this.initCrowd(); this.initWorld(); this.initFx(); this.initProjectiles(); this.initCoins();
      this.launcher = this.buildLauncher(); S.add(this.launcher);
      this.towerObjs = [null, null, null, null, null, null]; this.dyingObjs = []; this.wallObjs = new Map();
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
      const Q = KM.QUALITY[name] || KM.QUALITY.medium; this.quality = name; this.Q = Q;
      this.dpr = Math.min(window.devicePixelRatio || 1, Q.dpr); this.R.setPixelRatio(this.dpr);
      this.R.shadowMap.enabled = Q.shadows; this.sun.castShadow = Q.shadows;
      if (this.sun.shadow.mapSize.x !== Q.shadowMap) { this.sun.shadow.mapSize.set(Q.shadowMap, Q.shadowMap); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
      this.lodNear = Q.lodNear; this.lodMid = Q.lodMid; this.fxScale = Q.fx; this.glow = Q.glow; KM.glowLevel = Q.glow;
      this.scene.traverse(o => { const m = o.material; if (m && m.userData && m.userData.shader && m.userData.shader.uniforms.uGlow) m.userData.shader.uniforms.uGlow.value = Q.glow; });
      this.setBloom(Q.bloom && (KM.bloomAllowed || false));
      this.resize(); return Q;
    }
    setBloom(on) {
      this.bloomOn = !!on; if (!on || this.composer) return;
      if (!THREE.EffectComposer) { if (!this.bloomLoading) { this.bloomLoading = true; KM.loadScripts(['vendor/post/CopyShader.js', 'vendor/post/LuminosityHighPassShader.js', 'vendor/post/EffectComposer.js', 'vendor/post/RenderPass.js', 'vendor/post/ShaderPass.js', 'vendor/post/UnrealBloomPass.js']).then(() => this.setBloom(this.bloomOn)).catch(() => { this.bloomOn = false; }); } return; }
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
      Object.assign(caps, caps0, { m_leg: N * 2, m_legB: 1024, m_arm: N * 2, m_armB: 1024, m_shield: 2048, m_w_sword: N, m_w_swordGold: N, m_th_soldier: N, m_th_grunt: N, m_th_imp: N });
      const mk = (geo, n, color) => { const im = new THREE.InstancedMesh(geo, KM.toonMat(), n); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.count = 0; if (color) { im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); im.instanceColor.setUsage(THREE.DynamicDrawUsage); } this.scene.add(im); return im; };
      this.partM = {}; this.pn = {};
      for (const [k, g] of Object.entries(kit.parts)) { const tinted = g.attributes.aTint.array.some(v => v > 0); this.partM[k] = mk(g, caps[k] || 1024, tinted); this.pn[k] = 0; }
      for (const [k, g] of Object.entries(kit.statues)) { const name = 'S_' + k; this.partM[name] = mk(g, k === 'soldier' || k === 'grunt' || k === 'imp' ? N : 1024, true); this.pn[name] = 0; }
      this.kindKey = []; for (const d of KM.ENEMY) this.kindKey[d.id] = d.k; for (const d of KM.FRIEND) this.kindKey[d.id] = d.k;
      // animation state per unit slot
      this.pose = new Float32Array(N * A.P); this.prev = new Float32Array(N * A.P); this.clip = new Int16Array(N).fill(-1); this.pvel = new Float32Array(N); this.accL = new Float32Array(N); this.fade = new Float32Array(N); this.animT = new Uint8Array(N);
      this.tmpPose = new Float32Array(A.P); this.vv = {}; this.mats = Array.from({ length: 8 }, () => new M4()); this.frameNo = 0;
      const blob = new THREE.MeshBasicMaterial({ map: radialTex('rgba(20,20,40,0.45)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false });
      this.blob = mk(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), N, false); this.blob.material = blob; this.blob.renderOrder = 1;
      this.ringM = mk(new THREE.RingGeometry(0.8, 1, 28).rotateX(-Math.PI / 2), 160, false); this.ringM.material = new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.45, depthWrite: false });
      this.buffM = mk(new THREE.RingGeometry(0.55, 0.7, 20).rotateX(-Math.PI / 2), N, false); this.buffM.material = new THREE.MeshBasicMaterial({ color: 0x5cffa0, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
    }

    put(im, n, m) { m.toArray(im.instanceMatrix.array, n * 16); }
    putP(name, m, col) {
      const im = this.partM[name], n = this.pn[name]; if (n >= im.instanceMatrix.count) return;
      m.toArray(im.instanceMatrix.array, n * 16);
      if (col && im.instanceColor) { const a = im.instanceColor.array; a[n * 3] = col.r; a[n * 3 + 1] = col.g; a[n * 3 + 2] = col.b; }
      this.pn[name] = n + 1;
    }

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
      const S = sim.stats, armorLv = S.lv.armor || 0, dmgLv = S.lv.dmg || 0, hpLv = S.lv.hp || 0;
      for (const k in this.pn) this.pn[k] = 0;
      let nb = 0, nr = 0, nf = 0; this.frameNo++;
      const blue = TEAM[0], camZ = this.cam.position.z, camX = this.cam.position.x, crowd = sim.count[0] + sim.count[1], flipCam = !!(KM.camFocus && KM.camFocus.flip);
      const bannerTowers = sim.towers.filter(t => t && t.type === 'banner'), bR2 = 49 * sim.stats.towerRange;
      // budgeted LOD thresholds from a camera-distance histogram
      const hist = this.lodHist || (this.lodHist = new Uint16Array(160)), dist = this.lodDist || (this.lodDist = new Float32Array(KM.Sim.CAP)); hist.fill(0);
      for (let i = 0; i < sim.hi; i++) { if (!sim.st[i]) continue; const dx = sim.x[i] - camX, dz = sim.z[i] - camZ, d = Math.sqrt(dx * dx + dz * dz); dist[i] = d; hist[Math.min(159, d | 0)]++; }
      const LB = A.lodBudget(hist, this.lodNear, this.lodMid, this.lodB || (this.lodB = {}));
      const rot = (m, x, y, z, rx, ry, rz) => { e.set(rx, ry, rz, 'YXZ'); m.makeRotationFromEuler(e); m.setPosition(x, y, z); return m; };
      let drawn = 0;
      for (let i = 0; i < sim.hi; i++) {
        const st = sim.st[i]; if (!st) { this.clip[i] = -1; continue; }
        const z = sim.z[i]; if (flipCam ? (z < camZ - 3 || z > camZ + 125) : (z > camZ + 3 || z < camZ - 125)) continue;
        const team = sim.team[i], def = sim.def(i), key = this.kindKey[sim.kind[i]], R = KM.RECIPE[key];
        let s = sim.sc[i]; if (team === 0) s *= 1 + hpLv * 0.02;
        let dy = sim.yaw[i] - this.ry[i]; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); this.ry[i] += dy * Math.min(1, dt * (8 + (i % 5)));
        let y = 0;
        if (st === 2) { const d = sim.die[i]; y -= Math.max(0, d - 0.45) * 1.1; s *= 1 - Math.max(0, d - 0.5) / 0.22; if (s <= 0.02) continue; }
        const b = sim.birth[i]; if (b > 0) { const u = b / 0.4; y += Math.sin(u * Math.PI) * 1.25; s *= 0.55 + 0.45 * u; }
        // colour: faction, era, flash, frost
        col.setHex(team ? ENEMY_COL[def.k] : blue.getHex());
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
          this.putP('S_' + key, M[0], col); this.clip[i] = -1;
        } else {
          const v = this.animate(sim, i, dt, lodL), p = this.pose, o = i * P;
          const rig = R.torso === 'tBrute' ? KM.RIG.brute : KM.RIG.std, mid = lodL === 1, brute = R.torso === 'tBrute';
          const LEG = mid ? (brute ? 'm_legB' : 'm_leg') : R.leg, ARM = mid ? (brute ? 'm_armB' : 'm_arm') : R.arm;
          // root (pivot at feet so falls topple naturally)
          // acceleration / braking lean (centre of mass leads when speeding up, rocks back when stopping)
          const spd = Math.hypot(sim.vx[i], sim.vz[i]), acc = (spd - this.pvel[i]) / Math.max(dt, 1e-3); this.pvel[i] = spd;
          this.accL[i] += (Math.max(-0.22, Math.min(0.2, acc * 0.035)) - this.accL[i]) * Math.min(1, dt * 8);
          rot(M[0], sim.x[i], y + p[o + I.y] * s, z, p[o + I.rootP] + (st === 1 ? this.accL[i] : 0), this.ry[i] + p[o + I.rootY], p[o + I.rootR]); M[0].scale(sc.set(s, s, s));
          // legs
          rot(M[1], -rig.hip[0], rig.hip[1], 0, p[o + I.legLP], 0, 0); M[1].premultiply(M[0]); this.putP(LEG, M[1], col);
          rot(M[1], rig.hip[0], rig.hip[1], 0, p[o + I.legRP], 0, 0); M[1].premultiply(M[0]); this.putP(LEG, M[1], col);
          // torso (+ head, separate bone at full LOD; merged into the torso piece at mid LOD)
          rot(M[2], 0, rig.torso, 0, p[o + I.torsoP], p[o + I.torsoY], p[o + I.torsoR]); M[2].premultiply(M[0]);
          if (mid) this.putP('m_th_' + key, M[2], col);
          else {
            this.putP(R.torso, M[2], col); if (team === 0 && armorLv > 0) this.putP('pads', M[2]);
            rot(M[3], 0, rig.neck, 0, p[o + I.headP], p[o + I.headY], 0); M[3].premultiply(M[2]); this.putP(R.head, M[3], col);
            if (team === 0 && armorLv >= 4 && key === 'soldier') this.putP('plume', M[3]);
            if (team === 1) { const era = sim.era[i];                                   // later eras look harsher
              if (era >= 1 && R.torso === 'tLight') this.putP('padsIron', M[2]);
              if (era >= 2 && (key === 'grunt' || key === 'runner' || key === 'bomber' || key === 'archer')) this.putP('hornsAdd', M[3]);
              if (era >= 3 && R.head !== 'hShaman' && R.head !== 'hImp') this.putP('eyesGlow', M[3]); }
          }
          // arms + held items
          rot(M[4], -rig.shoulder[0], rig.shoulder[1], 0, p[o + I.armLP], 0, p[o + I.armLR]); M[4].premultiply(M[2]); this.putP(ARM, M[4], col);
          rot(M[5], rig.shoulder[0], rig.shoulder[1], 0, p[o + I.armRP], p[o + I.armRY], p[o + I.armRR]); M[5].premultiply(M[2]); this.putP(ARM, M[5], col);
          let wk = R.wpn; if (wk === 'sword' && team === 0 && dmgLv >= 5) wk = 'swordGold';
          const ws = team === 0 && wk.startsWith('sword') ? 1 + Math.min(8, dmgLv) * 0.06 : 1;
          if (wk === 'bow') { M[6].makeTranslation(0, rig.fist, 0.02); M[6].premultiply(M[4]); }        // bow in the off hand
          else { M[6].makeScale(ws, ws, ws); M[6].setPosition(0, rig.fist, 0.03); M[6].premultiply(M[5]); }
          this.putP(mid ? 'm_w_' + wk : wk, M[6]);
          if (R.shield) { M[7].makeTranslation(rig.shieldAt[0], rig.shieldAt[1], rig.shieldAt[2]); M[7].premultiply(M[4]); this.putP(mid ? 'm_shield' : 'shield', M[7], col); }
          // sword trail accent on near units mid-swing (density-scaled)
          if (lodL === 0 && sim.swing[i] > 0.35 && sim.swing[i] < 0.62 && this.fxBudget > 0 && Math.random() < 0.5) { this.fxBudget--; pos.set(0, 0, 0.55 * ws).applyMatrix4(M[6]); this.emit(pos.x, pos.y, pos.z, 0, 0, 0, team ? 0xffd0c0 : 0xd8ecff, 0.32, 0.14, 0); }
        }
        if (nb < 4096) { q.identity(); const bs = s * (R.body ? 1.6 : R.torso === 'tBrute' ? 1.3 : 0.85); pos.set(sim.x[i], 0.03, z); sc.set(bs, 1, bs); M[0].compose(pos, q, sc); this.put(this.blob, nb++, M[0]); }
        if (team === 1 && def.el && st === 1 && nr < (def.boss ? 160 : 24)) { q.identity(); const rs = s * 0.75 * (1 + Math.sin(this.time * 6) * 0.06); pos.set(sim.x[i], 0.05, z); sc.set(rs, 1, rs); M[0].compose(pos, q, sc); this.put(this.ringM, nr++, M[0]); }
        if (team === 0 && st === 1 && bannerTowers.length && nf < 4096) { for (const t of bannerTowers) { const ddx = sim.x[i] - t.x, ddz = z - t.z; if (ddx * ddx + ddz * ddz < bR2) { q.identity(); pos.set(sim.x[i], 0.04, z); sc.set(s, 1, s); M[0].compose(pos, q, sc); this.put(this.buffM, nf++, M[0]); break; } } }
      }
      for (const k in this.partM) { const im = this.partM[k]; im.count = this.pn[k]; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
      const fin = (im, n) => { im.count = n; im.instanceMatrix.needsUpdate = true; };
      fin(this.blob, nb); fin(this.ringM, nr); fin(this.buffM, nf);
      this.buffM.material.opacity = 0.3 + Math.sin(this.time * 4) * 0.12;
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
      // edge modules: broken bridges over rivers, ruined walls on cliff shelves, abandoned siege pieces, distant peaks
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
      if (parts.length) { const dm = new THREE.Mesh(merge(parts), this.decoMat); dm.castShadow = true; dm.receiveShadow = true; dm.userData.decor = 1; g.add(dm); }
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
      for (const i of want) if (!this.chunks.has(i) && built < 2) { const g = this.buildChunk(i); this.scene.add(g); this.chunks.set(i, g); built++; }
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
    buildLauncher() {
      const g = new THREE.Group(), skin = this.skin;
      const paint = this.lPaint = this.std(skin.color), paint2 = this.lPaint2 = this.std(new C(skin.color).offsetHSL(0, 0, -0.12).getHex()), gold = this.lGold = this.std(skin.trim), dark = this.std(0x26293a), wood = this.std(0x9a6a3c), white = this.std(0xffffff);
      const glowMat = this.std(0x6fd8ff, { emissive: 0x1f88dd, emissiveIntensity: 0.7 });
      const rbox = (w, h, d, r, mat) => { const sh = new THREE.Shape(), x = w / 2 - r, z = d / 2 - r; sh.moveTo(-x, -d / 2); sh.lineTo(x, -d / 2); sh.quadraticCurveTo(w / 2, -d / 2, w / 2, -z); sh.lineTo(w / 2, z); sh.quadraticCurveTo(w / 2, d / 2, x, d / 2); sh.lineTo(-x, d / 2); sh.quadraticCurveTo(-w / 2, d / 2, -w / 2, z); sh.lineTo(-w / 2, -z); sh.quadraticCurveTo(-w / 2, -d / 2, -x, -d / 2);
        const geo = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 3, curveSegments: 6 }); geo.rotateX(-Math.PI / 2); return new THREE.Mesh(geo, mat); };
      const body = new THREE.Group(); g.add(body); this.lBody = body;
      const st = this.lStage = {}; const grp = (k) => { const s = new THREE.Group(); body.add(s); st[k] = s; return s; };
      // L1+ core chassis
      const base = grp('base');
      const ch = rbox(2.0, 0.5, 2.4, 0.35, paint); ch.position.y = 0.42; base.add(ch);
      const deck = rbox(1.7, 0.12, 2.0, 0.3, paint2); deck.position.y = 1.0; base.add(deck);
      for (const z of [-1.27, 1.27]) { const t = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.13, 0.12), gold); t.position.set(0, 0.6, z); base.add(t); }
      for (const x of [-1.07, 1.07]) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, 2.3), gold); t.position.set(x, 0.6, 0); base.add(t); }
      const bolt = new THREE.SphereGeometry(0.05, 6, 4); for (let k = 0; k < 6; k++) for (const x of [-1.08, 1.08]) { const b = new THREE.Mesh(bolt, gold); b.position.set(x * 1.01, 0.78, -0.9 + k * 0.36); base.add(b); }
      // wheels: 4 at L1-2, 6 from L3
      this.wheels = [];
      const wheel = (x, z, r) => { const wh = new THREE.Group(); wh.position.set(x, r, z);
        wh.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.34, 18).rotateZ(Math.PI / 2), dark));
        wh.add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.38, 12).rotateZ(Math.PI / 2), gold));
        const tr = new THREE.Mesh(new THREE.TorusGeometry(r * 0.98, 0.05, 6, 20).rotateY(Math.PI / 2), this.std(0x3a3d4e)); tr.position.x = x > 0 ? 0.17 : -0.17; wh.add(tr);
        for (let k = 0; k < 5; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.07, 0.07), gold); sp.rotation.x = k * Math.PI / 5; wh.add(sp); }
        this.wheels.push(wh); return wh; };
      for (const [x, z] of [[-1.17, -0.85], [1.17, -0.85], [-1.17, 0.85], [1.17, 0.85]]) base.add(wheel(x, z, 0.44));
      const mid = grp('mid'); mid.add(wheel(-1.17, 0, 0.4)); mid.add(wheel(1.17, 0, 0.4));
      // turret + barrels
      const tur = this.turret = new THREE.Group(); tur.position.y = 1.1; body.add(tur);
      tur.add(new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.88, 0.24, 22), gold));
      const drum = new THREE.Mesh(new THREE.SphereGeometry(0.7, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2), paint); drum.position.y = 0.1; tur.add(drum);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.05, 6, 24), gold); band.rotation.x = Math.PI / 2; band.position.y = 0.32; tur.add(band);
      this.barrels = [];
      for (let k = 0; k < 3; k++) {
        const b = new THREE.Group();
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 1.2, 16).rotateX(Math.PI / 2), paint); tube.position.z = -0.72; b.add(tube);
        const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.24, 0.24, 16).rotateX(Math.PI / 2), gold); brake.position.z = -1.38; b.add(brake); b.userData.brake = brake;
        const mz = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.06, 8, 18), gold); mz.position.z = -1.5; b.add(mz);
        const hole = new THREE.Mesh(new THREE.CircleGeometry(0.17, 16), this.std(0x0e1220)); hole.position.z = -1.505; hole.rotation.y = Math.PI; b.add(hole);
        for (const zz of [-0.35, -0.95]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.255, 0.04, 6, 16), gold); r.position.z = zz; b.add(r); }
        b.position.set(0, 0.34, 0); tur.add(b); this.barrels.push(b);
      }
      // L2: troop-capsule hopper + lanterns
      const hop = grp('hopper');
      const hp = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.32, 0.5, 14, 1, true), paint2); hp.position.set(0, 1.25, 0.85); hop.add(hp);
      const hr = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 18), gold); hr.rotation.x = Math.PI / 2; hr.position.set(0, 1.5, 0.85); hop.add(hr);
      this.capsules = []; for (let k = 0; k < 5; k++) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), this.std(0x4f8dff)); c.scale.y = 1.3; c.position.set(Math.cos(k * 1.26) * 0.2, 1.5, 0.85 + Math.sin(k * 1.26) * 0.2); hop.add(c); this.capsules.push(c); }
      for (const x of [-0.9, 0.9]) { const lp = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), gold); lp.position.set(x, 1.3, 1.1); hop.add(lp); const lt = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), this.std(0xfff2b0, { emissive: 0xffc84a, emissiveIntensity: 0.9 })); lt.position.set(x, 1.58, 1.1); hop.add(lt); }
      // L3: crystal reinforcement core on a pylon + rear deck crates
      const core = grp('core');
      const py = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.5, 8), gold); py.position.y = 2.1 - 1.1 + 1.1; core.add(py);
      this.core = new THREE.Mesh(new THREE.OctahedronGeometry(0.34), glowMat); this.core.position.y = 2.6; core.add(this.core);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.035, 6, 24), gold); halo.rotation.x = Math.PI / 2; halo.position.y = 2.6; core.add(halo); this.halo = halo;
      for (const x of [-0.6, 0.6]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.42), wood); c.position.set(x, 1.25, 0.2); core.add(c); const cb = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.44), gold); cb.position.set(x, 1.3, 0.2); core.add(cb); }
      // L4: armour skirts over the wheels, front ram + shield plates
      const arm = grp('armor');
      for (const x of [-1.32, 1.32]) { const sk = rbox(0.12, 0.5, 2.5, 0.05, paint2); sk.rotation.z = Math.PI / 2; sk.position.set(x, 0.85, 0); sk.rotation.set(0, 0, 0); sk.scale.set(1, 1, 1); const pl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 2.5), paint2); pl.position.set(x, 0.72, 0); arm.add(pl); const rim = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 2.55), gold); rim.position.set(x, 0.95, 0); arm.add(rim); const rim2 = rim.clone(); rim2.position.y = 0.5; arm.add(rim2); }
      const ram = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.6, 4).rotateX(-Math.PI / 2), gold); ram.position.set(0, 0.6, -1.5); arm.add(ram);
      for (const x of [-0.65, 0.65]) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 6).rotateX(-Math.PI / 2), white); sp.position.set(x, 0.6, -1.42); arm.add(sp); }
      for (const x of [-0.55, 0.55]) { const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 18).rotateX(Math.PI / 2), paint); sh.position.set(x, 1.15, -1.0); arm.add(sh); const sr = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 6, 18), gold); sr.position.copy(sh.position); arm.add(sr); }
      // L5: crown, gold fins, second banner, hover energy ring
      const top = grp('crown');
      this.crown = new THREE.Group(); for (let k = 0; k < 8; k++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.34, 6), gold); const a = k / 8 * Math.PI * 2; sp.position.set(Math.cos(a) * 0.62, 0.42, Math.sin(a) * 0.62); this.crown.add(sp); } tur.add(this.crown);
      for (const x of [-1, 1]) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.9), gold); fin.position.set(x * 1.0, 1.35, 0.55); fin.rotation.z = -x * 0.35; top.add(fin); }
      this.eRing = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.05, 6, 40), new THREE.MeshBasicMaterial({ color: 0x9ff2ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })); this.eRing.rotation.x = Math.PI / 2; this.eRing.position.y = 0.25; top.add(this.eRing);
      // flags
      const clothG = () => { const geo = new THREE.PlaneGeometry(0.95, 0.62, 10, 4); geo.translate(0.475, 0, 0); return geo; };
      this.flags = [];
      for (const [x, z] of [[-0.85, 1.1], [0.85, 1.1]]) {
        const fg = new THREE.Group(); fg.position.set(x, 0.9, z);
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
    setSkin(item) { this.skin = item; if (this.lPaint) { this.lPaint.color.set(item.color); this.lPaint2.color.set(item.color).offsetHSL(0, 0, -0.12); this.lGold.color.set(item.trim); this.flags.forEach(f => f.children[2].material.color.set(item.color)); } }

    drawLauncher(sim, dt) {
      const L = sim.L, g = this.launcher, lv = sim.level, S = this.lStage;
      g.position.set(L.x, 0, L.z); g.visible = true;
      if (lv !== this.lastLv) { if (lv > this.lastLv) { this.lPop = 0; this.burst(L.x, 1.5, L.z, 70, 0x9ff2ff, 7, 0.7, 0.8, 5); this.ring(L.x, L.z, 0x9ff2ff, 8, 0.8); this.ring(L.x, L.z, 0xffd23a, 5, 0.6); } this.lastLv = lv; }
      this.lPop += dt;
      const tilt = Math.max(-0.25, Math.min(0.25, -L.vx * 0.03)); this.lBody.rotation.z += (tilt - this.lBody.rotation.z) * Math.min(1, dt * 8);
      this.lBody.position.y = Math.abs(Math.sin(this.time * 9)) * 0.02 + (L.hitT < 0.15 ? 0.08 : 0);
      for (const w of this.wheels) w.rotation.x = -L.wheel * 2.2;
      const want = { mid: lv >= 3, hopper: lv >= 2, core: lv >= 3, armor: lv >= 4, crown: lv >= 5 };
      for (const k in want) { const gS = S[k]; if (want[k] && !gS.visible) { gS.userData.pop = 0; } gS.visible = want[k];
        if (gS.visible && gS.userData.pop != null && gS.userData.pop < 0.7) { gS.userData.pop += dt; const u = Math.min(1, gS.userData.pop / 0.55), k2 = u < 1 ? (1 - Math.pow(1 - u, 3)) * (1 + Math.sin(u * Math.PI) * 0.35) : 1; gS.scale.setScalar(Math.max(0.01, k2)); gS.position.y = (1 - u) * 1.2; } else if (gS.visible) { gS.scale.setScalar(1); gS.position.y = 0; } }
      this.crown.visible = lv >= 5; this.flags[1].visible = lv >= 5;
      const nb = lv >= 5 ? 3 : lv >= 3 ? 2 : 1, blen = lv >= 2 ? 1.15 : 0.85;
      this.barrels.forEach((b, k) => { b.visible = k < nb; b.position.x = nb === 1 ? 0 : nb === 2 ? (k ? 0.3 : -0.3) : (k - 1) * 0.44; b.scale.set(1, 1, blen); b.userData.brake.visible = lv >= 2; b.position.z = L.fire * 0.2 * ((k + Math.floor(this.time * 8)) % nb === 0 ? 1 : 0.3); });
      this.turret.rotation.y = Math.sin(this.time * 1.3) * 0.05 - L.vx * 0.02;
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
    buildTower(t) {
      const g = new THREE.Group(), lv = t.lvl, T = KM.TOWERS[t.type], L5 = lv >= 5;
      const stone = this.std(0xc3c8d0), stone2 = this.std(0x9ea6b2), wood = this.std(0x9a6a3c), gold = this.std(0xf4c247), blue = this.std(0x2f6dff), steel = this.std(0xb8c2d0), dark = this.std(0x30323a);
      const acc = this.std(T.color, { emissive: T.color, emissiveIntensity: 0.12 + lv * 0.05 });
      const H = 0.95 + lv * 0.24, R0 = 0.85 + lv * 0.05;
      const parts = []; const add = (m, par) => { (par || g).add(m); parts.push(m); return m; };
      // stone base with brick courses, crenellations, gold rings per level, banners from L3
      const base = add(new THREE.Mesh(new THREE.CylinderGeometry(R0 * 0.9, R0 * 1.15, H, 12), stone)); base.position.y = H / 2;
      for (let k = 1; k <= Math.floor(H / 0.45); k++) { const c = add(new THREE.Mesh(new THREE.CylinderGeometry(R0 * (1.13 - k * 0.04), R0 * (1.14 - k * 0.04), 0.05, 12), stone2)); c.position.y = k * 0.45; }
      const n = 6 + Math.floor(lv / 2) * 2; for (let k = 0; k < n; k++) { const bl = add(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.3), lv >= 4 ? steel : stone)); const a = k / n * Math.PI * 2; bl.position.set(Math.cos(a) * R0 * 0.95, H + 0.14, Math.sin(a) * R0 * 0.95); bl.rotation.y = -a; }
      for (let k = 1; k < lv; k++) { const rg = add(new THREE.Mesh(new THREE.TorusGeometry(R0 * (1.12 - k / lv * 0.2), 0.035, 6, 22), gold)); rg.rotation.x = Math.PI / 2; rg.position.y = H * k / lv; }
      if (lv >= 3) for (const x of [-1, 1]) { const bn = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9 + lv * 0.08, 0.55), blue)); bn.position.set(x * R0 * 1.02, H - 0.65, 0); const em = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.24), gold)); em.position.set(x * R0 * 1.03, H - 0.55, 0); em.rotation.x = Math.PI / 4; }
      const door = add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.06), wood)); door.position.set(0, 0.31, R0 * 1.08); door.rotation.x = -0.12;
      const head = new THREE.Group(); head.position.y = H + 0.22; g.add(head); g.userData.head = head;
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.16, 14), wood), head);
      const aim = new THREE.Group(); head.add(aim); g.userData.aim = aim; const s = 1 + (lv - 1) * 0.13;
      if (t.type === 'arrow') {
        const shots = 1 + Math.floor((lv - 1) / 2); g.userData.arms = [];
        for (let k = 0; k < shots; k++) {
          const bal = new THREE.Group(); bal.position.set((k - (shots - 1) / 2) * 0.42, 0, 0); aim.add(bal);
          const bdy = add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 1.1 * s), lv >= 4 ? steel : wood), bal); bdy.position.y = 0.4;
          const arms = new THREE.Group(); arms.position.set(0, 0.45, 0.3); bal.add(arms); g.userData.arms.push(arms);
          for (const x of [-1, 1]) { const a = add(new THREE.Mesh(new THREE.BoxGeometry(0.62 * s, 0.08, 0.08), acc), arms); a.position.x = x * 0.32 * s; a.rotation.y = -x * 0.25; }
          const bolt = add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 5).rotateX(Math.PI / 2), wood), bal); bolt.position.set(0, 0.5, 0.25); g.userData.bolt = bolt;
          const tip = add(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 6).rotateX(Math.PI / 2), L5 ? this.std(0x9ff2ff, { emissive: 0x2fb8ff, emissiveIntensity: 1 }) : gold), bal); tip.position.set(0, 0.5, 0.75);
        }
      }
      if (t.type === 'cannon') {
        const yoke = add(new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.42, 0.55), wood), aim); yoke.position.y = 0.3;
        const nb = lv >= 4 ? 2 : 1; g.userData.barrels = [];
        for (let k = 0; k < nb; k++) { const bar = new THREE.Group(); bar.position.set(nb === 1 ? 0 : (k ? 0.26 : -0.26), 0.62, 0.3); aim.add(bar); g.userData.barrels.push(bar);
          add(new THREE.Mesh(new THREE.CylinderGeometry(0.2 * s, 0.28 * s, 1.25 * s, 14).rotateX(Math.PI / 2), dark), bar).position.z = 0.1;
          const mz = add(new THREE.Mesh(new THREE.TorusGeometry(0.22 * s, 0.06, 6, 14), acc), bar); mz.position.z = 0.72 * s;
          if (lv >= 3) { const r2 = add(new THREE.Mesh(new THREE.TorusGeometry(0.27 * s, 0.04, 6, 14), gold), bar); r2.position.z = -0.25; } }
      }
      if (t.type === 'frost') {
        const mat = this.std(0xbff6ff, { emissive: 0x3fd0ff, emissiveIntensity: 0.8, transparent: true, opacity: 0.92 });
        const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.38 * s), mat); cr.position.y = 1.0; cr.scale.y = 1.6; aim.add(cr); g.userData.spin = cr; g.userData.frostMat = mat;
        g.userData.shards = []; for (let k = 0; k < lv + 1; k++) { const sh = new THREE.Mesh(new THREE.OctahedronGeometry(0.12 + lv * 0.01), mat); aim.add(sh); g.userData.shards.push(sh); }
        for (let k = 0; k < 4; k++) { const sp = add(new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.5, 5), steel), aim); const a = k * Math.PI / 2; sp.position.set(Math.cos(a) * 0.55, 0.3, Math.sin(a) * 0.55); sp.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4); }
      }
      if (t.type === 'sniper') {
        const bdy = add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.38, 0.8), this.std(0x3a2f5a)), aim); bdy.position.y = 0.45;
        const bar = add(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.08, 1.6 + lv * 0.2, 10).rotateX(Math.PI / 2), acc), aim); bar.position.set(0, 0.5, 0.9 + lv * 0.1); g.userData.barrel = bar;
        const sc = add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.42, 10).rotateX(Math.PI / 2), gold), aim); sc.position.set(0, 0.76, 0.2);
        const lens = add(new THREE.Mesh(new THREE.CircleGeometry(0.07, 12), this.std(0xff3a6a, { emissive: 0xff2a5a, emissiveIntensity: 1 })), aim); lens.position.set(0, 0.76, 0.415);
        if (lv >= 4) { const br = add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.2, 10).rotateX(Math.PI / 2), gold), aim); br.position.set(0, 0.5, 1.7 + lv * 0.2); }
      }
      if (t.type === 'barracks') {
        const fl = lv >= 3 ? 2 : 1, hs = add(new THREE.Mesh(new THREE.BoxGeometry(1.2 * s, 0.75 * fl, 1.0 * s), this.std(0xf0e4c8)), head); hs.position.y = 0.4 * fl;
        const beams = add(new THREE.Mesh(new THREE.BoxGeometry(1.24 * s, 0.07, 1.04 * s), wood), head); beams.position.y = 0.75 * fl;
        const rf = add(new THREE.Mesh(new THREE.ConeGeometry(0.98 * s, 0.75, 4), blue), head); rf.position.y = 0.78 * fl + 0.36; rf.rotation.y = Math.PI / 4;
        const dl = new THREE.Group(), dr = new THREE.Group(); dl.position.set(-0.2, 0.28, 0.51 * s); dr.position.set(0.2, 0.28, 0.51 * s); head.add(dl); head.add(dr);
        add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.04), wood), dl).position.x = 0.1; add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.04), wood), dr).position.x = -0.1; g.userData.doors = [dl, dr];
        const fp = add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 6), gold), head); fp.position.set(0.5 * s, 0.78 * fl + 0.7, 0); const ff = add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.45), blue), head); ff.position.set(0.5 * s, 0.78 * fl + 1.0, 0.24); g.userData.flag = ff;
        head.rotation.y = Math.sign(-t.x || 1) * Math.PI / 2;
      }
      if (t.type === 'banner') {
        const pole = add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4 + lv * 0.25, 6), gold), head); pole.position.y = 1.2 + lv * 0.12;
        const fl = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9 + lv * 0.12, 1.0 + lv * 0.1), this.std(0x3cd27a, { emissive: 0x1a7a44, emissiveIntensity: 0.35 })), head); fl.position.set(0, 1.9 + lv * 0.2, 0.55 + lv * 0.05); g.userData.flag = fl;
        const crest = add(new THREE.Mesh(L5 ? new THREE.OctahedronGeometry(0.2) : new THREE.SphereGeometry(0.12, 10, 8), gold), head); crest.position.y = 2.45 + lv * 0.25;
        if (lv >= 3) { const f2 = add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.6, 0.6), this.std(0x2f6dff)), head); f2.position.set(0, 1.3 + lv * 0.15, -0.35); }
        const aura = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 56).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3cd27a, transparent: true, opacity: 0.45, depthWrite: false })); aura.position.y = -H - 0.12; head.add(aura); g.userData.aura = aura;
        const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3cd27a, transparent: true, opacity: 0.07, depthWrite: false })); fill.position.y = -H - 0.13; head.add(fill); g.userData.auraFill = fill;
      }
      if (t.type !== 'barracks' && t.type !== 'banner') { const roof = add(new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 6), blue), head); roof.position.set(0, -0.02, -0.64); }
      if (L5) { const halo = new THREE.Mesh(new THREE.TorusGeometry(R0 * 1.25, 0.05, 6, 32), new THREE.MeshBasicMaterial({ color: 0xffe28a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })); halo.rotation.x = Math.PI / 2; halo.position.y = 0.12; g.add(halo); g.userData.halo = halo; }
      g.traverse(o => { if (o.isMesh && !o.material.transparent) o.castShadow = true; });
      // construction: parts rise in from the ground, staggered by height
      g.userData.parts = parts.map(m => ({ m, y: m.position.y, d: Math.random() * 0.15 + (m.position.y + (m.parent === head ? H : 0)) * 0.05 }));
      g.userData.lvl = lv; g.userData.type = t.type; g.userData.build = 0;
      return g;
    }
    drawTowers(sim, dt) {
      for (let s = 0; s < 6; s++) {
        const t = sim.towers[s]; let o = this.towerObjs[s];
        if (!t) { if (o) { if (!o.userData.dying) { o.userData.dying = 0; this.dyingObjs.push(o); } this.towerObjs[s] = null; } continue; }
        if (!o || o.userData.lvl !== t.lvl || o.userData.type !== t.type) {
          const upgrade = !!o; if (o) this.disposeObj(o);
          o = this.towerObjs[s] = this.buildTower(t); this.scene.add(o); if (upgrade) o.userData.build = 0.3;
          this.burst(t.x, 2, t.z, 50, 0xffd23a, 6, 0.55, 0.7, 6); this.ring(t.x, t.z, 0xffd23a, 4, 0.6); this.ring(t.x, t.z, KM.TOWERS[t.type].color, 6, 0.8);
        }
        o.position.set(t.x, 0, t.z); o.scale.setScalar(0.82);
        const U = o.userData; U.build += dt;
        if (U.build < 1.2) for (const p of U.parts) { const u = Math.min(1, Math.max(0, (U.build - p.d) / 0.35)); p.m.position.y = p.y - (1 - u * u * (3 - 2 * u)) * 2.2; p.m.visible = u > 0; }
        const a = U.aim; let dy = t.aim - a.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); a.rotation.y += dy * Math.min(1, dt * (t.type === 'sniper' ? 4 : 10));
        const r = t.recoil; a.position.z = -r * 0.14 * Math.cos(a.rotation.y); a.position.x = -r * 0.14 * Math.sin(a.rotation.y);
        if (U.arms) U.arms.forEach(ar => { ar.scale.z = 1; ar.position.z = 0.3 - Math.max(0, r - 0.4) * 0.25; ar.rotation.x = r > 0.5 ? -0.3 * (r - 0.5) : -0.15 * Math.sin((1 - r) * Math.PI); });  // reload pull-back
        if (U.barrels) U.barrels.forEach((b, k) => { b.position.z = 0.3 - r * 0.3 * (k === (sim.t * 2 | 0) % U.barrels.length ? 1 : 0.3); });
        if (U.barrel && t.type === 'sniper') U.barrel.position.z = 0.9 + t.lvl * 0.1 - r * 0.3;
        if (U.spin) { U.spin.rotation.y += dt * (1.5 + t.lvl * 0.3); U.frostMat.emissiveIntensity = 0.6 + Math.sin(this.time * 4) * 0.25 + r * 1.2; U.shards.forEach((sh, k) => { const ang = this.time * 1.8 + k / U.shards.length * Math.PI * 2; sh.position.set(Math.cos(ang) * 0.7, 1.0 + Math.sin(ang * 2) * 0.15, Math.sin(ang) * 0.7); sh.rotation.y = ang; }); }
        if (U.doors) { const op = Math.min(1, r * 2.2); U.doors[0].rotation.y = -op * 1.4; U.doors[1].rotation.y = op * 1.4; }
        if (U.flag) U.flag.rotation.y = Math.sin(this.time * 3 + s) * 0.18;
        if (U.aura) { const k = 7 * Math.sqrt(sim.stats.towerRange) * (sim.stats.bannerR || 1) * (1 + Math.sin(this.time * 2) * 0.025); U.aura.scale.setScalar(k); U.auraFill.scale.setScalar(k); U.aura.material.opacity = 0.35 + Math.sin(this.time * 2) * 0.12; }
        // damage state: darken, shake on hit, smoke + sparks when low
        const hf = t.mhp ? t.hp / t.mhp : 1; U.hpBar = U.hpBar || this.makeBar(o); U.hpBar.visible = hf < 0.999; U.hpBar.children[1].scale.x = Math.max(0.001, hf); U.hpBar.children[1].material.color.setHSL(0.33 * hf, 0.9, 0.5);
        if (t.hitT < 0.15) { o.position.x += (Math.random() - 0.5) * 0.12; o.position.z += (Math.random() - 0.5) * 0.12; }
        if (hf < 0.5 && Math.random() < (0.6 - hf) * 0.5) this.emit(t.x + (Math.random() - 0.5), 2 + Math.random(), t.z + (Math.random() - 0.5), 0, 1.2, 0, hf < 0.25 ? 0x3a3a3a : 0x777777, 1.2, 1.1, -0.6);
        if (hf < 0.25 && Math.random() < 0.15) this.emit(t.x, 2.4, t.z, (Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2, 0xff8a2a, 0.35, 0.4, 6);
        if (U.halo) { U.halo.rotation.z += dt; U.halo.material.opacity = 0.4 + Math.sin(this.time * 3) * 0.2; }
      }
      // collapsing towers: sink, tilt, debris
      for (let k = this.dyingObjs.length - 1; k >= 0; k--) { const o = this.dyingObjs[k]; const u = (o.userData.dying += dt);
        if (u < dt * 1.5) { this.burst(o.position.x, 1.5, o.position.z, 50, 0xb4b9c2, 6, 0.9, 1.0, 9); this.burst(o.position.x, 1, o.position.z, 20, 0x555555, 3, 1.6, 1.4, -1); this.ring(o.position.x, o.position.z, 0xffa040, 5, 0.6); this.shake = Math.max(this.shake, 0.18); }
        o.position.y = -u * u * 2.5; o.rotation.z = u * 0.6; o.rotation.x = u * 0.3; if (u > 1.4) { this.disposeObj(o); this.dyingObjs.splice(k, 1); } }
      this.drawWalls(sim, dt);
      // sniper tracers fade
      for (const tr of this.tracers) { if (!tr.visible) continue; tr.userData.t += dt; tr.material.opacity = Math.max(0, 0.9 - tr.userData.t * 4); if (tr.userData.t > 0.25) tr.visible = false; }
    }
    makeBar(parent) {
      const g = new THREE.Group(), bg = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.18), new THREE.MeshBasicMaterial({ color: 0x1a1a22, depthTest: false, transparent: true, opacity: 0.8 })), fg = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.12).translate(0.75, 0, 0), new THREE.MeshBasicMaterial({ color: 0x4cff8a, depthTest: false }));
      fg.position.x = -0.75; fg.position.z = 0.001; g.add(bg); g.add(fg); g.position.y = 4.2; g.rotation.x = -1.0; g.renderOrder = 5; bg.renderOrder = 5; fg.renderOrder = 6; parent.add(g); return g;
    }
    buildWall(w) {
      const g = new THREE.Group(), wood = this.std(0x9a6a3c), dwood = this.std(0x6a4426), iron = this.std(0x7d8796), blue = this.std(0x2f6dff), gold = this.std(0xf4c247), stone = this.std(0xc3c8d0);
      const parts = [], add = m => { g.add(m); parts.push(m); return m; };
      if (w.type === 'barricade') {
        for (const x of [-1.2, 0, 1.2]) { const p = add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.1, 6), dwood)); p.position.set(x, 0.55, 0); }
        for (const [y, r] of [[0.35, 0.08], [0.75, -0.06]]) { const b = add(new THREE.Mesh(new THREE.BoxGeometry(w.w, 0.16, 0.14), wood)); b.position.set(0, y, 0); b.rotation.z = r; }
        for (let k = 0; k < 5; k++) { const sp = add(new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.8, 5), wood)); sp.position.set(-1.3 + k * 0.65, 0.5, -0.3); sp.rotation.x = -0.9; const tip = add(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 5), iron)); tip.position.set(-1.3 + k * 0.65, 0.84, -0.6); tip.rotation.x = -0.9; }
      } else {
        const base = add(new THREE.Mesh(new THREE.BoxGeometry(w.w, 0.4, w.d + 0.2), stone)); base.position.y = 0.2;
        for (let k = 0; k < 3; k++) { const sh = add(new THREE.Mesh(new THREE.BoxGeometry(w.w / 3 - 0.08, 1.15, 0.22), blue)); sh.position.set((k - 1) * w.w / 3, 0.95, -0.1); const tr = add(new THREE.Mesh(new THREE.BoxGeometry(w.w / 3 - 0.02, 0.1, 0.26), gold)); tr.position.set((k - 1) * w.w / 3, 1.55, -0.1); const em = add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 10).rotateX(Math.PI / 2), gold)); em.position.set((k - 1) * w.w / 3, 1.0, -0.23); for (const x of [-0.45, 0.45]) { const rv = add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), iron)); rv.position.set((k - 1) * w.w / 3 + x, 0.55, -0.22); } }
        for (const x of [-w.w / 2, w.w / 2]) { const pst = add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.7, 0.4), stone)); pst.position.set(x, 0.85, 0); const cap = add(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3, 4), gold)); cap.position.set(x, 1.85, 0); }
      }
      g.traverse(o => { if (o.isMesh) o.castShadow = true; });
      g.userData.parts = parts.map(m => ({ m, y: m.position.y, d: Math.random() * 0.2 })); g.userData.build = 0; return g;
    }
    drawWalls(sim, dt) {
      const live = new Set();
      for (const w of sim.walls) {
        let g = this.wallObjs.get(w); if (!g) { g = this.buildWall(w); this.scene.add(g); this.wallObjs.set(w, g); this.burst(w.x, 0.8, w.z, 24, w.type === 'wall' ? 0x7cc4ff : 0xd9b27a, 4, 0.5, 0.6); this.ring(w.x, w.z, w.type === 'wall' ? 0x7cc4ff : 0xffd23a, 3.5, 0.5); }
        live.add(w); g.position.set(w.x, 0, w.z); const U = g.userData; U.build += dt;
        if (U.build < 1) for (const p of U.parts) { const u = Math.min(1, Math.max(0, (U.build - p.d) / 0.35)); p.m.position.y = p.y - (1 - u * u * (3 - 2 * u)) * 1.6; }
        const hf = w.hp / w.mhp; U.hpBar = U.hpBar || this.makeBar(g); U.hpBar.position.y = w.type === 'wall' ? 2.4 : 1.6; U.hpBar.visible = hf < 0.999; U.hpBar.children[1].scale.x = Math.max(0.001, hf); U.hpBar.children[1].material.color.setHSL(0.33 * hf, 0.9, 0.5);
        if (w.hitT < 0.12) g.position.x += (Math.random() - 0.5) * 0.1;
        if (w.hitT < 0.05 && Math.random() < 0.5) this.burst(w.x + (Math.random() - 0.5) * w.w, 0.8, w.z - 0.5, 4, w.type === 'wall' ? 0xcfe6ff : 0xd9b27a, 3, 0.35, 0.3);
      }
      for (const [w, g] of this.wallObjs) if (!live.has(w)) { this.burst(g.position.x, 0.8, g.position.z, 40, w.type === 'wall' ? 0x7cc4ff : 0x9a6a3c, 6, 0.7, 0.9, 9); this.ring(g.position.x, g.position.z, 0xffa040, 3, 0.5); this.disposeObj(g); this.wallObjs.delete(w); }
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
      const C = sim.c, m = this.m, q = this.q, e = this.e, p = this.v, s = this.s3; let n = 0;
      for (let k = 0; k < KM.Sim.CCAP; k++) {
        if (!C.st[k]) continue;
        const big = Math.min(1.6, 1.0 + Math.sqrt(C.v[k]) * 0.18), fade = C.st[k] === 1 && C.age[k] > 19 ? (Math.floor(C.age[k] * 8) % 2 ? 0.6 : 1) : 1;
        const y = C.y[k] + (C.st[k] === 1 && C.vy[k] === 0 ? 0.12 + Math.sin(this.time * 4 + k) * 0.08 : 0);
        // face the camera (never edge-on → never a streak), with a ±35° wobble that reads as spinning
        const cy = Math.atan2(this.cam.position.x - C.x[k], this.cam.position.z - C.z[k]), cp = -Math.atan2(this.cam.position.y - y, Math.hypot(this.cam.position.x - C.x[k], this.cam.position.z - C.z[k])) * 0.6;
        e.set(cp, cy + Math.sin(this.time * 5 + k) * 0.6, 0, 'YXZ'); q.setFromEuler(e); p.set(C.x[k], y + 0.1, C.z[k]);
        const pulse = 1 + Math.sin(this.time * 7 + k * 1.7) * 0.06; s.setScalar(big * fade * pulse); m.compose(p, q, s); this.put(this.coinM, n, m);
        q.identity(); p.set(C.x[k], 0.06, C.z[k]); s.setScalar(big * 0.8); m.compose(p, q, s); this.put(this.coinGlow, n, m); n++;
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
    }
    drawProjectiles(sim) {
      const P = sim.p, cnt = [0, 0, 0, 0, 0], m = this.m, p = this.v, s = this.s3, look = this.m2, up = new V3(0, 1, 0), tgt = new V3();
      for (let k = 0; k < KM.Sim.PCAP; k++) {
        if (!P.on[k]) continue;
        const u = Math.min(1, P.t[k] / P.tof[k]), h = P.kind[k] === 4 ? 0.2 : P.h[k], y = 1.0 + h * 4 * u * (1 - u) - u * 0.6;
        const u2 = Math.min(1, u + 0.02), y2 = 1.0 + h * 4 * u2 * (1 - u2) - u2 * 0.6;
        p.set(P.x[k], y, P.z[k]); tgt.set(P.sx[k] + (P.ex[k] - P.sx[k]) * u2, y2, P.sz[k] + (P.ez[k] - P.sz[k]) * u2);
        look.lookAt(tgt, p, up); this.q.setFromRotationMatrix(look); s.setScalar(1); m.compose(p, this.q, s);
        const im = this.proj[P.kind[k]]; this.put(im, cnt[P.kind[k]]++, m);
        if (P.kind[k] !== 0 && Math.random() < 0.5) this.emit(p.x, y, p.z, 0, 0.3, 0, P.kind[k] === 1 ? 0x888888 : P.kind[k] === 2 ? 0x9ff0ff : 0xd77bff, 0.45, 0.35);
      }
      this.proj.forEach((im, i) => { im.count = cnt[i]; im.instanceMatrix.needsUpdate = true; });
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
    burst(x, y, z, n, color, speed, size, life, grav) { for (let k = 0; k < n; k++) { const a = Math.random() * 6.283, u = Math.random() * 2 - 1, s = speed * (0.4 + Math.random() * 0.6), r = Math.sqrt(1 - u * u); this.emit(x, y, z, Math.cos(a) * r * s, Math.abs(u) * s + speed * 0.2, Math.sin(a) * r * s, color, size * (0.6 + Math.random() * 0.8), (life || 0.5) * (0.6 + Math.random() * 0.6), grav == null ? 9 : grav); } }
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

    // ---------- events → FX ----------
    onEvent(sim, type, a, b, c, d, e) {
      switch (type) {
        case 'kill': { const i = a, d = b, s = sim.sc[i]; this.burst(sim.x[i], 0.6 * s, sim.z[i], d.el ? 30 : 6, ENEMY_COL[d.k], d.el ? 7 : 3.5, d.el ? 0.7 : 0.4, 0.45); if (d.el) this.ring(sim.x[i], sim.z[i], 0xff5a3a, 4); this.emit(sim.x[i], 0.3, sim.z[i], 0, 0.6, 0, 0xffe7a0, 1.4 * s, 0.25, 0); break; }
        case 'shove': {                                                                       // heavy blow: radial dust, shock ring, hot spark, tiny camera kick for big ones
          const x = c, z = d, r = e || 1.3, big = r >= 2 || b >= 4; if (this.shoveT > 0 && !big) break; this.shoveT = 0.06; if (this.fxBudget <= 0 && !big) break; this.fxBudget -= 4;
          const nd = big ? 16 : 9; for (let k = 0; k < nd; k++) { const ang = k / nd * 6.283 + Math.random() * 0.3, sp = r * (2.2 + Math.random() * 1.4); this.emit(x + Math.cos(ang) * 0.3, 0.12, z + Math.sin(ang) * 0.3, Math.cos(ang) * sp, 0.5 + Math.random() * 0.6, Math.sin(ang) * sp, 0xd9b98a, 0.8 + r * 0.25, 0.42, 2.5); }
          this.ring(x, z, 0xfff0c8, r * 1.5, 0.28); this.burst(x, 0.8, z, big ? 10 : 5, 0xffe27a, 5, 0.45, 0.22, 6); this.emit(x, 0.7, z, 0, 0.3, 0, 0xfff6d8, 1.3 + r * 0.4, 0.12, 0);
          if (big && Math.abs(z - sim.L.z) < 40) this.shake = Math.max(this.shake, r >= 2.6 ? 0.07 : 0.045); break; }
        case 'fdie': this.burst(sim.x[a], 0.6, sim.z[a], 4, 0x5aa0ff, 3, 0.35, 0.4); break;
        case 'hit': if (b >= 0 && sim.def(b).sh && this.fxBudget > 0) { this.fxBudget--; this.burst(sim.x[b], 0.65, sim.z[b] + (sim.team[b] ? 0.3 : -0.3), 5, 0xcfe6ff, 3.5, 0.35, 0.22, 4); }
          if (Math.random() < 0.35 * Math.min(1, this.fxBudget / 30)) { const t = b; if (t >= 0) this.burst((sim.x[a] + sim.x[t]) / 2, 0.7, (sim.z[a] + sim.z[t]) / 2, c ? 8 : 2, c ? 0xffe14a : 0xfff4d0, c ? 4 : 2.5, c ? 0.5 : 0.28, 0.25); } break;
        case 'cleave': this.burst(sim.x[a], 0.5, sim.z[a] + 1, 14, 0xffffff, 4, 0.35, 0.3); this.ring(sim.x[a], sim.z[a] + 1, 0xffaaaa, 2.5, 0.35); break;
        case 'deploy': { const L = sim.L; this.burst(L.x, 1.6, L.z - 1.4, 3, 0x7cc4ff, 2.5, 0.45, 0.3, 2); break; }
        case 'boom': this.burst(a, 0.5, b, 40, 0xff8a2a, 7, 0.9, 0.6, 6); this.burst(a, 0.5, b, 14, 0x555555, 3, 1.4, 0.9, -1); this.ring(a, b, 0xff7a2a, c * 1.2, 0.4); this.shake = Math.max(this.shake, 0.15); break;
        case 'impact': if (a === 1) { this.burst(b, 0.4, c, 18, 0xffa040, 5, 0.7, 0.45); this.ring(b, c, 0xffa040, 2.6, 0.35); } else if (a === 2) { this.burst(b, 0.4, c, 18, 0x9ff0ff, 4, 0.6, 0.6, 2); this.ring(b, c, 0x9ff0ff, 3, 0.5); } else if (a === 4) this.burst(b, 0.8, c, 12, 0xe4c2ff, 5, 0.5, 0.35); break;
        case 'wave': if (a === 'boss') { this.ring(0, sim.front - 50, 0xff2a2a, 14, 1.2); this.shake = Math.max(this.shake, 0.2); } break;
        case 'elite': this.ring(0, sim.front - 52, 0xff5a3a, 8, 0.8); break;
        case 'coin': if (Math.random() < 0.5) this.burst(sim.L.x, 1.4, sim.L.z, 3, 0xffd34a, 3, 0.4, 0.35); break;
        case 'lhit': this.burst(sim.L.x, 1, sim.L.z, 10, 0xff4a3a, 4, 0.5, 0.35); this.shake = Math.max(this.shake, 0.12); break;
        case 'upgrade': this.cheerT = 0.85; this.burst(sim.L.x, 1, sim.L.z, 60, 0xffd23a, 6, 0.6, 0.7, 5); this.ring(sim.L.x, sim.L.z, 0xffd23a, 6, 0.7); this.ring(sim.L.x, sim.L.z, 0x7cc4ff, 4, 0.5); break;
        case 'heal': this.burst(sim.x[a], 1, sim.z[a], 6, 0x8aff7a, 2, 0.5, 0.6, -1); break;
        case 'death': this.burst(sim.L.x, 1, sim.L.z, 120, 0xffa040, 9, 1.0, 1.0, 6); this.burst(sim.L.x, 1, sim.L.z, 40, 0x666666, 4, 2, 1.6, -1.5); this.ring(sim.L.x, sim.L.z, 0xff6a2a, 10, 0.9); this.shake = 0.4; this.deathT = 0; break;
        case 'revive': this.ring(sim.L.x, sim.L.z, 0x7cc4ff, 12, 0.9); this.burst(sim.L.x, 1, sim.L.z, 80, 0x7cc4ff, 7, 0.8, 0.8); break;
        case 'tower': { const t = a; if (t.type === 'sniper' && t.tgt >= 0) this.tracer(t.x, t.z, sim.x[t.tgt], sim.z[t.tgt], 0xe4c2ff); if (t.type === 'barracks') this.burst(t.x - Math.sign(t.x) * 1.2, 0.6, t.z, 10, 0x7cc4ff, 3, 0.4, 0.4); if (t.type === 'arrow' || t.type === 'sniper') this.emit(t.x, 2.2 + t.lvl * 0.3, t.z, 0, 0.5, 0, t.type === 'sniper' ? 0xe4c2ff : 0xfff0c0, 0.9, 0.12, 0); if (t.type === 'cannon') this.burst(t.x + Math.sin(t.aim), 2.2 + t.lvl * 0.3, t.z + Math.cos(t.aim), 8, 0xaaaaaa, 2, 0.8, 0.5, -1); break; }
      }
    }

    // ---------- camera ----------
    // Key gameplay points that must stay on screen: launcher (with bottom margin), built towers, wall lines,
    // lane edges at the launcher's depth, and the incoming threat zone ahead of the front.
    keyPoints(sim) {
      const L = sim.L, P = this.kp || (this.kp = []); P.length = 0;
      const add = (x, z, y, m) => P.push({ x, z, y: y || 0, m: m || 0 });
      add(L.x, L.z + 1.6, 0, 0.12); add(L.x - 1.4, L.z, 1.5, 0.05); add(L.x + 1.4, L.z, 1.5, 0.05);
      add(-6.8, L.z - 2, 0, 0); add(6.8, L.z - 2, 0, 0);                         // central lane (edges may crop, like the concept)
      if (this.aspect < 0.8) { add(-8.6, sim.front - 3, 0, 0); add(8.6, sim.front - 3, 0, 0); }    // portrait: the full fighting width at the clash (the yaw brings one shoulder in)
      for (const t of sim.towers) if (t) { add(t.x - Math.sign(t.x) * -1.0, t.z, 2.2, 0.02); add(t.x, t.z + 1, 0, 0.02); }
      for (const w of sim.walls) { add(w.x - w.w / 2, w.z, 0.5, 0.02); add(w.x + w.w / 2, w.z, 0.5, 0.02); }
      add(0, sim.front - 26, 0, 0.0);                                              // threat zone (HUD covers the very top)
      return P;
    }
    // Smallest camera distance (closest view, biggest characters) that keeps every key point inside the safe area.
    fitDistance(sim, tx, tz, pitch, minD, maxD) {
      const cam = this.fitCam || (this.fitCam = new THREE.PerspectiveCamera()), v = this.v, P = this.keyPoints(sim);
      cam.fov = this.cam.fov; cam.aspect = this.aspect; cam.near = 0.5; cam.far = 300; cam.updateProjectionMatrix();
      const hudTop = 1 - 2 * (this.safeTopPx || 118) / innerHeight;          // NDC y below the HUD pills + HP bar
      const yw = this.camYaw || 0, ok = d => { cam.position.set(tx + Math.sin(yw) * Math.cos(pitch) * d, Math.sin(pitch) * d, tz + Math.cos(yw) * Math.cos(pitch) * d); cam.lookAt(tx, 0, tz); cam.updateMatrixWorld(); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
        for (const p of P) { v.set(p.x, p.y, p.z).project(cam); if (v.z > 1 || Math.abs(v.x) > 1 - p.m || v.y < -1 + p.m || v.y > hudTop) return false; } return true; };
      let lo = minD, hi = maxD; if (ok(lo)) return lo; if (!ok(hi)) return hi;
      for (let k = 0; k < 14; k++) { const mid = (lo + hi) / 2; if (ok(mid)) hi = mid; else lo = mid; }
      return hi;
    }
    drawCamera(sim, dt) {
      const L = sim.L, army = sim.count[0] + sim.count[1];
      const pitch = this.aspect > 1 ? 0.86 : 0.9; // ~50°: lower, more cinematic like the concept
      let tx = L.x * 0.35, tz = sim.front - (this.aspect > 1 ? 11 : this.aspect < 0.8 ? 16 : 14.5) + L.offZ * 0.3;
      if (KM.camFocus === 'launcher') { tx = L.x; tz = L.z - 1; } else if (KM.camFocus && KM.camFocus.x != null) { tx = KM.camFocus.x; tz = KM.camFocus.z; }
      // the target shifts toward the launcher on narrow screens so towers beside it stay framed
      if (!this.camT) this.camT = new V3(tx, 0, tz);
      if (KM.camFocus && KM.camFocus.x != null) this.camT.set(tx, 0, tz);          // staged close-ups snap
      else { this.camT.x += (tx - this.camT.x) * Math.min(1, dt * 3); this.camT.z += (tz - this.camT.z) * Math.min(1, dt * 4); }
      this.fitT = (this.fitT || 0) - dt;
      if (this.fitT <= 0 || this.fitD == null) { this.fitT = 0.25; this.fitD = this.fitDistance(sim, this.camT.x, this.camT.z, pitch, this.aspect > 1 ? 30 : 24, 70); }
      let dist = this.fitD * (1 + Math.min(0.12, army / 4000));
      if (KM.camOverride) dist = KM.camOverride;
      if (KM.camFocus && KM.camFocus.x != null) this.camD = dist;
      this.camD = (this.camD || dist) + (dist - (this.camD || dist)) * Math.min(1, dt * 1.6);
      this.shake = Math.max(0, this.shake - dt * 1.2); this.shoveT = Math.max(0, (this.shoveT || 0) - dt);
      const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
      const flip = KM.camFocus && KM.camFocus.flip ? -1 : 1, pch = KM.camFocus && KM.camFocus.pitch || pitch;   // close-up rigs can look at the army's faces
      // portrait: a slight diagonal yaw lets one side's cliffs/water enter the frame (concept-style composition)
      const yawT = KM.camFocus ? 0 : this.aspect < 0.8 ? 0.17 : this.aspect < 1.2 ? 0.1 : 0.05; this.camYaw = (this.camYaw == null ? yawT : this.camYaw + (yawT - this.camYaw) * Math.min(1, dt * 2));
      const yw = this.camYaw;
      this.cam.position.set(this.camT.x + sx + Math.sin(yw) * Math.cos(pch) * this.camD * flip, Math.sin(pch) * this.camD + sy, this.camT.z + Math.cos(yw) * Math.cos(pch) * this.camD * flip);
      this.cam.lookAt(this.camT.x, 0, this.camT.z);
      this.scene.fog.near = this.camD + 6; this.scene.fog.far = this.camD + 95;
      this.sun.position.set(this.camT.x + 12, 30, this.camT.z + 14); this.sun.target.position.set(this.camT.x, 0, this.camT.z - 4);
    }
    // NDC position of a world point under the live camera (used by the framing tests)
    toScreen(x, y, z) { this.v.set(x, y, z).project(this.cam); return { x: this.v.x, y: this.v.y }; }

    frame(sim, dt) {
      this.time += dt; if (this.deathT != null) this.deathT += dt; this.cheerT = Math.max(0, (this.cheerT || 0) - dt);
      this.fxBudget = Math.max(3, Math.round(60 * (this.fxScale || 1) * (1 - Math.min(0.93, (sim.count[0] + sim.count[1]) / 2200))));
      this.simT = sim.t; this.lzCache = sim.L.z; this.streamWorld(sim.front);
      this.drawCamera(sim, dt); this.drawLauncher(sim, dt); this.drawTowers(sim, dt);
      this.drawCrowd(sim, dt); this.drawCoins(sim); this.drawProjectiles(sim); this.stepFx(dt);
      if (this.bloomOn && this.composer) this.composer.render(); else this.R.render(this.scene, this.cam);
    }
    resetRun() { this.deathT = null; this.camT = null; this.camD = null; this.fitD = null; for (let s = 0; s < 6; s++) if (this.towerObjs[s]) { this.disposeObj(this.towerObjs[s]); this.towerObjs[s] = null; } for (const o of this.dyingObjs) this.disposeObj(o); this.dyingObjs = []; for (const [, g] of this.wallObjs) this.disposeObj(g); this.wallObjs.clear(); this.pl.fill(0); this.ry.fill(Math.PI); this.fogCol.setHex(KM.BIOMES[0].fog); }
  }
  KM.Render = Render;
})(window);
