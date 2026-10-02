/* KMOB renderer — three.js r128. Instanced crowds (one draw call per body part for every unit on screen),
   streamed battlefield chunks, launcher + towers with visible level evolution, pooled coins/projectiles/particles. */
(function (G) {
  const KM = G.KM, W = KM.W;
  const V3 = THREE.Vector3, M4 = THREE.Matrix4, Q = THREE.Quaternion, E = THREE.Euler, C = THREE.Color;
  const TEAM = [new C(0x2f74ff), new C(0xe2312c)];
  const ENEMY_COL = { grunt: 0xe2312c, imp: 0xff5243, shield: 0xd8282c, runner: 0xff5a1f, archer: 0xd13a3a, knight: 0x9e1f2c, brute: 0xc8202a, bomber: 0xff7a1c, cannon: 0x8e2a2a, shaman: 0x9a2cc8, warlord: 0x8f1020 };
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

  // ---------- character kit ----------
  function buildKit() {
    const sph = (r, ws, hs, ts) => new THREE.SphereGeometry(r, ws || 10, hs || 7, 0, Math.PI * 2, 0, ts || Math.PI);
    const box = (a, b, c) => new THREE.BoxGeometry(a, b, c);
    const cyl = (a, b, h, s) => new THREE.CylinderGeometry(a, b, h, s || 10);
    const SKIN = 0xffd2a8, DARK = 0x262a36, STEEL = 0xd8dde6, GOLD = 0xf2c14e, WOOD = 0x8a5a33;
    const doll = merge([
      part(sph(0.3, 12, 9), 0xffffff, 1, TRS(0, 0.56, 0, 0, 0, 0, 1, 1.08, 0.86)),            // tunic
      part(cyl(0.27, 0.29, 0.08, 12), 0x5a3a22, 0, T(0, 0.43, 0)),                          // belt
      part(box(0.08, 0.06, 0.03), GOLD, 0, T(0, 0.43, 0.27)),                              // buckle
      part(sph(0.2, 12, 9), SKIN, 0, T(0, 0.98, 0)),                                       // head
      part(sph(0.226, 12, 6, Math.PI * 0.55), 0xc8d2ff, 1, T(0, 1.0, -0.005)),              // helmet dome
      part(cyl(0.235, 0.235, 0.05, 14), 0xb0bcff, 1, T(0, 0.97, 0)),                        // helmet rim
      part(box(0.05, 0.13, 0.2), 0x9aa8ff, 1, T(0, 1.23, -0.02)),                          // crest
      part(sph(0.03, 6, 4), 0x1a1a22, 0, T(-0.075, 0.97, 0.185)), part(sph(0.03, 6, 4), 0x1a1a22, 0, T(0.075, 0.97, 0.185)),
      part(sph(0.1, 8, 6), 0xe8ecff, 1, T(-0.31, 0.62, 0.02)), part(sph(0.1, 8, 6), 0xe8ecff, 1, T(0.31, 0.62, 0.02)), // arms/gauntlets
    ]);
    const leg = merge([part(box(0.13, 0.28, 0.14), DARK, 0, T(0, -0.13, 0)), part(box(0.15, 0.07, 0.2), 0x3a2a1e, 0, T(0, -0.26, 0.03))]);
    const sword = merge([part(box(0.05, 0.5, 0.02), STEEL, 0, T(0, 0.33, 0)), part(box(0.18, 0.04, 0.05), GOLD, 0, T(0, 0.08, 0)), part(cyl(0.025, 0.025, 0.12, 6), WOOD, 0, T(0, 0.01, 0)), part(box(0.05, 0.06, 0.03), STEEL, 0, T(0, 0.6, 0))]);
    const dagger = merge([part(box(0.05, 0.26, 0.02), STEEL, 0, T(0, 0.2, 0)), part(box(0.12, 0.03, 0.04), GOLD, 0, T(0, 0.06, 0))]);
    const axe = merge([part(cyl(0.035, 0.035, 0.9, 6), WOOD, 0, T(0, 0.35, 0)), part(box(0.05, 0.3, 0.32), STEEL, 0, T(0, 0.68, 0.12)), part(box(0.06, 0.08, 0.08), 0x444444, 0, T(0, 0.68, -0.04))]);
    const bow = merge([part(new THREE.TorusGeometry(0.3, 0.025, 5, 12, Math.PI), WOOD, 0, TRS(0, 0.3, 0, 0, Math.PI / 2, Math.PI / 2)), part(box(0.01, 0.6, 0.01), 0xeeeeee, 0, T(0, 0.3, 0))]);
    const staff = merge([part(cyl(0.03, 0.03, 1.0, 6), 0x5a3a22, 0, T(0, 0.4, 0)), part(new THREE.OctahedronGeometry(0.11), 0xd77bff, 0, T(0, 0.98, 0))]);
    const bomb = merge([part(sph(0.17, 10, 8), 0x22232a, 0, T(0, 0.12, 0.05)), part(cyl(0.02, 0.02, 0.12, 5), 0xd9b27a, 0, TRS(0, 0.32, 0.05, 0.4, 0, 0))]);
    const shield = merge([part(cyl(0.25, 0.25, 0.06, 14), 0xc8d2ff, 1, TRS(0, 0, 0, Math.PI / 2, 0, 0)), part(new THREE.TorusGeometry(0.25, 0.03, 5, 16), GOLD, 0, T(0, 0, 0.0)), part(sph(0.06, 6, 4), GOLD, 0, T(0, 0, 0.04))]);
    const horns = merge([part(new THREE.ConeGeometry(0.07, 0.3, 7), 0xf3ead2, 0, TRS(-0.22, 1.16, 0, 0, 0, 0.75)), part(new THREE.ConeGeometry(0.07, 0.3, 7), 0xf3ead2, 0, TRS(0.22, 1.16, 0, 0, 0, -0.75))]);
    const pads = merge([part(sph(0.13, 8, 5, Math.PI / 2), GOLD, 0, TRS(-0.31, 0.68, 0.0, 0, 0, 0.3)), part(sph(0.13, 8, 5, Math.PI / 2), GOLD, 0, TRS(0.31, 0.68, 0, 0, 0, -0.3)), part(box(0.34, 0.06, 0.04), GOLD, 0, T(0, 0.74, 0.25))]);
    const cannon = merge([
      part(cyl(0.22, 0.28, 1.3, 12), 0x30323a, 0, TRS(0, 0.62, 0.1, Math.PI / 2 - 0.25, 0, 0)), part(new THREE.TorusGeometry(0.24, 0.05, 6, 12), GOLD, 0, TRS(0, 0.78, 0.7, -0.25, 0, 0)),
      part(box(0.7, 0.32, 0.9), 0xffffff, 1, T(0, 0.38, -0.1)),
      part(cyl(0.3, 0.3, 0.1, 12), 0x5a3a22, 0, TRS(-0.42, 0.3, -0.1, 0, 0, Math.PI / 2)), part(cyl(0.3, 0.3, 0.1, 12), 0x5a3a22, 0, TRS(0.42, 0.3, -0.1, 0, 0, Math.PI / 2)),
    ]);
    return { doll, leg, sword, dagger, axe, bow, staff, bomb, shield, horns, pads, cannon };
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
      this.cam = new THREE.PerspectiveCamera(48, 1, 0.5, 260);
      S.add(this.hemi = new THREE.HemisphereLight(0xeaf4ff, 0x7a6a50, 0.62));
      const sun = this.sun = new THREE.DirectionalLight(0xfff2dc, 0.62); sun.position.set(10, 26, 12); sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 34, bottom: -34, near: 1, far: 90 }); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
      S.add(sun); S.add(sun.target);
      this.ry = new Float32Array(KM.Sim.CAP); this.shake = 0; this.time = 0; this.skin = KM.SHOP[3];
      this.m = new M4(); this.m2 = new M4(); this.q = new Q(); this.e = new E(0, 0, 0, 'YXZ'); this.v = new V3(); this.s3 = new V3(); this.col = new C();
      this.initCrowd(); this.initWorld(); this.initFx(); this.initProjectiles(); this.initCoins();
      this.launcher = this.buildLauncher(); S.add(this.launcher);
      this.towerObjs = [null, null, null, null, null, null];
      this.resize();
    }

    skyTex() {
      const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#5aa8f0'); gr.addColorStop(0.55, '#a8d8ff'); gr.addColorStop(1, '#e6f4ff');
      g.fillStyle = gr; g.fillRect(0, 0, 4, 256); const t = new THREE.CanvasTexture(c); return t;
    }

    resize() {
      const w = innerWidth, h = innerHeight; this.R.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); this.aspect = w / h;
    }

    // ---------- crowd ----------
    initCrowd() {
      const kit = this.kit = buildKit(), N = KM.Sim.CAP;
      const mk = (geo, n, mat) => { const im = new THREE.InstancedMesh(geo, mat || tintMat(), n); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.count = 0; this.scene.add(im); return im; };
      const tm = null;
      this.doll = mk(kit.doll, N, tm); this.doll.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3); this.doll.instanceColor.setUsage(THREE.DynamicDrawUsage);
      this.legs = mk(kit.leg, N * 2, tm);
      const W8 = {}; for (const k of ['sword', 'dagger', 'axe', 'bow', 'staff', 'bomb']) W8[k] = mk(kit[k], k === 'sword' ? N : N / 2, tm);
      this.wpn = W8;
      this.shieldM = mk(kit.shield, N / 2, tm); this.shieldM.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N / 2 * 3), 3);
      this.hornM = mk(kit.horns, 512, tm); this.padM = mk(kit.pads, N / 2, tm);
      this.cannonM = mk(kit.cannon, 256, tm); this.cannonM.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(256 * 3), 3);
      const blob = new THREE.MeshBasicMaterial({ map: radialTex('rgba(0,0,0,0.42)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false });
      this.blob = mk(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), N, blob); this.blob.renderOrder = 1;
      // elite telegraph ring under dangerous units
      this.ringM = mk(new THREE.RingGeometry(0.8, 1, 24).rotateX(-Math.PI / 2), 128, new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.55, depthWrite: false }));
    }

    put(im, n, m) { m.toArray(im.instanceMatrix.array, n * 16); }

    drawCrowd(sim, dt) {
      const m = this.m, m2 = this.m2, q = this.q, e = this.e, pos = this.v, sc = this.s3, col = this.col;
      const S = sim.stats, armorLv = S.lv.armor || 0, dmgLv = S.lv.dmg || 0, hpLv = S.lv.hp || 0;
      let nd = 0, nl = 0, ns = 0, nh = 0, np = 0, nc = 0, nb = 0, nr = 0; const nw = { sword: 0, dagger: 0, axe: 0, bow: 0, staff: 0, bomb: 0 };
      const cArr = this.doll.instanceColor.array, sArr = this.shieldM.instanceColor.array, kArr = this.cannonM.instanceColor.array;
      const blue = TEAM[0], camZ = this.cam.position.z;
      const fGold = Math.min(1, armorLv / 6);
      for (let i = 0; i < sim.hi; i++) {
        const st = sim.st[i]; if (!st) continue;
        const z = sim.z[i]; if (z > camZ + 4 || z < camZ - 120) continue;   // off-camera: skip draw (sim keeps running)
        const team = sim.team[i], def = sim.def(i);
        let s = sim.sc[i]; if (team === 0) s *= 1 + hpLv * 0.025;
        // facing (smoothed for organic turns)
        let dy = sim.yaw[i] - this.ry[i]; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); this.ry[i] += dy * Math.min(1, dt * 10);
        const sp = Math.abs(sim.vx[i]) + Math.abs(sim.vz[i]), moving = sp > 0.4;
        const ph = sim.phase[i];
        let y = moving ? Math.abs(Math.sin(ph)) * 0.09 * s : Math.sin(ph * 0.5) * 0.01;
        let lean = moving ? 0.14 : 0.02, roll = 0;
        lean -= Math.max(0, sim.flash[i]) * 0.25;            // hit flinch
        if (sim.swing[i] > 0) lean += Math.sin(sim.swing[i] * Math.PI) * 0.18;
        if (st === 2) { const d = sim.die[i]; roll = Math.min(1, d / 0.22) * 1.45 * (i & 1 ? 1 : -1); y -= Math.max(0, d - 0.35) * 1.4; s *= 1 - Math.max(0, d - 0.45) / 0.3; if (s <= 0.01) continue; }
        const b = sim.birth[i]; if (b > 0) { const u = b / 0.4; y += Math.sin(u * Math.PI) * 1.3; s *= 0.55 + 0.45 * u; }
        e.set(lean, this.ry[i], roll, 'YXZ'); q.setFromEuler(e); pos.set(sim.x[i], y, z); sc.set(s, s, s); m.compose(pos, q, sc);
        // colour
        let base = team ? ENEMY_COL[def.k] : blue.getHex();
        col.setHex(base); if (team === 1 && sim.era[i]) col.multiply(this.col2.setHex(ERA_TINT[sim.era[i]]));
        if (team === 0 && def.k === 'knightF') col.lerp(this.col2.setHex(0x8fb8ff), 0.3);
        const f = Math.max(0, sim.flash[i]); if (f > 0) col.lerp(this.col2.setRGB(1, 1, 1), f * 0.75);
        if (def.wpn === 'cannon') {
          this.put(this.cannonM, nc, m); kArr[nc * 3] = col.r; kArr[nc * 3 + 1] = col.g; kArr[nc * 3 + 2] = col.b; nc++;
        } else {
          this.put(this.doll, nd, m); cArr[nd * 3] = col.r; cArr[nd * 3 + 1] = col.g; cArr[nd * 3 + 2] = col.b; nd++;
          // legs swing in opposite phase
          const sw = moving ? Math.sin(ph) * 0.85 : 0;
          m2.makeRotationX(sw); m2.setPosition(-0.11, 0.3, 0); m2.premultiply(m); this.put(this.legs, nl++, m2);
          m2.makeRotationX(-sw); m2.setPosition(0.11, 0.3, 0); m2.premultiply(m); this.put(this.legs, nl++, m2);
          // weapon (swing arc on attack)
          const wk = def.wpn; if (wk !== 'none') {
            const im = this.wpn[wk]; if (nw[wk] < im.instanceMatrix.count) {
              const swg = sim.swing[i] > 0 ? Math.sin((1 - sim.swing[i]) * Math.PI) : 0;
              let rx = wk === 'bow' ? -0.15 : wk === 'staff' ? 0.1 + swg * 0.4 : 0.35 - swg * 2.1 + (moving ? Math.sin(ph) * 0.15 : 0);
              const wsc = team === 0 && wk === 'sword' ? 1 + dmgLv * 0.07 : 1;
              e.set(rx, 0, 0); q.setFromEuler(e); pos.set(wk === 'bow' ? 0.3 : 0.33, 0.58, wk === 'bow' ? 0.12 : 0.06); sc.set(wsc, wsc, wsc); m2.compose(pos, q, sc); m2.premultiply(m);
              this.put(im, nw[wk]++, m2);
            }
          }
          if (def.sh && ns < 2048) { m2.makeTranslation(-0.3, 0.58, 0.16); m2.premultiply(m); this.put(this.shieldM, ns, m2); sArr[ns * 3] = col.r; sArr[ns * 3 + 1] = col.g; sArr[ns * 3 + 2] = col.b; ns++; }
          if ((def.el || (team === 1 && sim.era[i] >= 2 && def.k === 'knight')) && nh < 512) this.put(this.hornM, nh++, m);
          if (team === 0 && armorLv > 0 && np < 2048) this.put(this.padM, np++, m);
        }
        if (nb < 4096) { pos.set(sim.x[i], 0.03, z); q.identity(); const bs = s * (def.wpn === 'cannon' ? 1.6 : 0.85); sc.set(bs, 1, bs); m2.compose(pos, q, sc); this.put(this.blob, nb++, m2); }
        if (team === 1 && def.el && st === 1 && nr < 128) { pos.set(sim.x[i], 0.05, z); q.identity(); const rs = s * 0.75 * (1 + Math.sin(this.time * 6) * 0.06); sc.set(rs, 1, rs); m2.compose(pos, q, sc); this.put(this.ringM, nr++, m2); }
      }
      const fin = (im, n) => { im.count = n; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; };
      fin(this.doll, nd); fin(this.legs, nl); for (const k in nw) fin(this.wpn[k], nw[k]); fin(this.shieldM, ns); fin(this.hornM, nh); fin(this.padM, np); fin(this.cannonM, nc); fin(this.blob, nb); fin(this.ringM, nr);
      this.drawn = nd + nc;
      this.goldPads = fGold;
    }

    // ---------- world streaming ----------
    initWorld() {
      this.col2 = new C();
      this.groundMat = new THREE.MeshLambertMaterial({ vertexColors: true });
      this.decoMat = new THREE.MeshLambertMaterial({ vertexColors: true });
      this.waterMat = new THREE.MeshLambertMaterial({ color: 0x3fa9e0, transparent: true, opacity: 0.85 });
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
        stoneRail: () => [D(new THREE.BoxGeometry(0.5, 0.8, 2.2), 0xb8b0a0, T(0, 0.4, 1.1))],
      };
    }

    biomeCol(plan, key) { const a = new C(KM.BIOMES[plan.biome][key]); if (plan.blend > 0) a.lerp(new C(KM.BIOMES[plan.next][key]), plan.blend); return a; }

    buildChunk(i) {
      const plan = KM.chunkPlan(i), CH = W.CHUNK, g = new THREE.Group(); g.userData.plan = plan;
      const grass = this.biomeCol(plan, 'grass'), grass2 = this.biomeCol(plan, 'grass2'), dirt = this.biomeCol(plan, 'dirt'), rock = this.biomeCol(plan, 'rock'), treeC = this.biomeCol(plan, 'tree');
      const geo = new THREE.PlaneGeometry(76, CH, 38, 12); geo.rotateX(-Math.PI / 2);
      const p = geo.attributes.position, cols = new Float32Array(p.count * 3), tmp = new C();
      const canyon = plan.kind === 'canyon', bridge = plan.kind === 'bridge';
      for (let k = 0; k < p.count; k++) {
        const x = p.getX(k), lz = p.getZ(k), wz = (plan.z0 + plan.z1) / 2 + lz, ax = Math.abs(x);
        const n = fbm(x * 0.15, wz * 0.15);
        let h = 0; const edge = canyon ? 11 : 12.5;
        if (ax > edge) h = Math.pow((ax - edge) / 8, 1.4) * (canyon ? 9 : 4.5) * (0.6 + n);
        if (bridge && ax > 10.4 && ax < 16) h = -1.2;
        h += (n - 0.5) * 0.25 * (ax > 10 ? 1 : 0.3);
        p.setY(k, h);
        const pathT = Math.max(0, Math.min(1, (7.4 - ax + (n - 0.5) * 2.2) / 2.4));
        tmp.copy(grass).lerp(grass2, noise(x * 0.4, wz * 0.4)); tmp.lerp(dirt, pathT * (0.85 + n * 0.15));
        if (pathT > 0.5) { const tr = Math.abs(Math.sin(wz * 0.9 + x * 0.2)) < 0.06 ? 0.08 : 0; tmp.offsetHSL(0, 0, -tr + (n - 0.5) * 0.06); }
        if (h > 2.2 || (canyon && h > 1.2)) tmp.lerp(rock, Math.min(1, (h - 1.2) / 3));
        cols[k * 3] = tmp.r; cols[k * 3 + 1] = tmp.g; cols[k * 3 + 2] = tmp.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); geo.computeVertexNormals();
      const ground = new THREE.Mesh(geo, this.groundMat); ground.position.z = (plan.z0 + plan.z1) / 2; ground.receiveShadow = true; g.add(ground);
      if (bridge) { const wtr = new THREE.Mesh(new THREE.PlaneGeometry(5.6, CH).rotateX(-Math.PI / 2), this.waterMat); [-13.2, 13.2].forEach(x => { const w = wtr.clone(); w.position.set(x, -0.6, ground.position.z); g.add(w); }); }
      // decor
      const r = KM.rng(plan.seed), parts = [], add = (list, x, z, ry) => { const mm = TRS(x, 0, z, 0, ry || 0, 0); for (const q of list) parts.push(q.applyMatrix4(mm)); };
      const hAt = (x, wz) => { const ax = Math.abs(x), n = fbm(x * 0.15, wz * 0.15), edge = canyon ? 11 : 12.5; return ax > edge ? Math.pow((ax - edge) / 8, 1.4) * (canyon ? 9 : 4.5) * (0.6 + n) : 0; };
      const dense = plan.kind === 'forest' ? 26 : plan.kind === 'canyon' ? 8 : 15;
      for (let k = 0; k < dense; k++) {
        const side = r() < 0.5 ? -1 : 1, x = side * r.range(11.5, 30), z = plan.z1 - r() * CH, y = hAt(x, z);
        const kind = plan.biome === 5 && r() < 0.6 ? 'crystal' : r() < 0.68 ? (r() < 0.6 ? 'tree' : 'round') : 'rock';
        const L = this.deco[kind](kind === 'rock' ? rock.getHex() : kind === 'crystal' ? 0x7fe8ff : treeC.clone().offsetHSL((r() - 0.5) * 0.04, 0, (r() - 0.5) * 0.08).getHex(), r.range(0.8, 1.5));
        const mm = T(0, y - 0.1, 0); L.forEach(q => q.applyMatrix4(mm)); add(L, x, z, r() * 6.28);
      }
      for (let k = 0; k < 4; k++) add(this.deco.rock(rock.getHex(), r.range(0.3, 0.6)), (r() < 0.5 ? -1 : 1) * r.range(9.9, 11), plan.z1 - r() * CH, r() * 6);
      if (plan.kind === 'ruins') for (let k = 0; k < 4; k++) { const side = k % 2 ? 1 : -1; add(r() < 0.5 ? this.deco.pillar(0, r.range(0.6, 1.1)) : this.deco.wall(0, r.range(0.6, 1.1)), side * r.range(11, 13.5), plan.z1 - r() * CH, r() * 0.6); }
      for (let z = plan.z1; z > plan.z0 + 0.1; z -= 2) for (const sx of [-10.3, 10.3]) add(bridge ? this.deco.stoneRail() : this.deco.post(), sx, z - 2, 0);
      if (i % 2 === 0) { add(this.deco.banner(0x2f6dff), -10.9, plan.z1 - 6, 0); add(this.deco.banner(0xd83a3a), 10.9, plan.z1 - 18, Math.PI); }
      if (plan.biome !== 3 && plan.biome !== 4) for (let k = 0; k < 18; k++) add(this.deco.flower([0xffffff, 0xffe066, 0xff8fb0, 0xb4a0ff][k % 4]), (r() < 0.5 ? -1 : 1) * r.range(10.6, 16), plan.z1 - r() * CH);
      if (parts.length) { const dm = new THREE.Mesh(merge(parts), this.decoMat); dm.castShadow = true; dm.receiveShadow = true; g.add(dm); }
      return g;
    }

    streamWorld(front) {
      const want = KM.chunksFor(front), keep = new Set(want);
      for (const [i, g] of this.chunks) if (!keep.has(i)) { this.scene.remove(g); g.traverse(o => { if (o.geometry && o.geometry !== this.waterGeo) o.geometry.dispose(); }); this.chunks.delete(i); }
      let built = 0;
      for (const i of want) if (!this.chunks.has(i) && built < 2) { const g = this.buildChunk(i); this.scene.add(g); this.chunks.set(i, g); built++; }
      // fog/sky blend toward current biome
      const plan = KM.chunkPlan(Math.max(0, Math.floor(-front / W.CHUNK)));
      const fc = this.biomeCol(plan, 'fog'); this.fogCol.lerp(fc, 0.02); this.scene.fog.color.copy(this.fogCol);
    }

    // ---------- launcher ----------
    std(color, o) { return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.45, metalness: 0.25 }, o || {})); }
    buildLauncher() {
      const g = new THREE.Group(), skin = this.skin;
      const paint = this.lPaint = this.std(skin.color, { roughness: 0.38, metalness: 0.3 }), gold = this.lGold = this.std(skin.trim, { metalness: 0.85, roughness: 0.28 }), dark = this.std(0x23262f, { roughness: 0.7 });
      const sh = new THREE.Shape(), w = 1.05, d = 1.3, r = 0.38;
      sh.moveTo(-w + r, -d); sh.lineTo(w - r, -d); sh.quadraticCurveTo(w, -d, w, -d + r); sh.lineTo(w, d - r); sh.quadraticCurveTo(w, d, w - r, d); sh.lineTo(-w + r, d); sh.quadraticCurveTo(-w, d, -w, d - r); sh.lineTo(-w, -d + r); sh.quadraticCurveTo(-w, -d, -w + r, -d);
      const chassisG = new THREE.ExtrudeGeometry(sh, { depth: 0.55, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 3, curveSegments: 8 }); chassisG.rotateX(-Math.PI / 2);
      const body = new THREE.Group(); g.add(body); this.lBody = body;
      const ch = new THREE.Mesh(chassisG, paint); ch.position.y = 0.45; body.add(ch);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.14, 0.14), gold); trim.position.set(0, 0.62, -1.42); body.add(trim); const t2 = trim.clone(); t2.position.z = 1.42; body.add(t2);
      this.wheels = [];
      for (const [x, z] of [[-1.15, -0.85], [1.15, -0.85], [-1.15, 0.85], [1.15, 0.85]]) {
        const wh = new THREE.Group(); wh.position.set(x, 0.42, z);
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.32, 16).rotateZ(Math.PI / 2), dark); wh.add(tire);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.36, 8).rotateZ(Math.PI / 2), gold); wh.add(hub);
        for (let k = 0; k < 4; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.06), gold); sp.rotation.x = k * Math.PI / 4; wh.add(sp); }
        body.add(wh); this.wheels.push(wh);
      }
      const tur = this.turret = new THREE.Group(); tur.position.y = 1.2; body.add(tur);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.22, 20), gold); tur.add(ring);
      const drum = new THREE.Mesh(new THREE.SphereGeometry(0.72, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), paint); drum.position.y = 0.08; tur.add(drum);
      this.barrels = [];
      for (let k = 0; k < 3; k++) {
        const b = new THREE.Group(); const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 1.25, 14).rotateX(Math.PI / 2), paint); tube.position.z = -0.75; b.add(tube);
        const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.07, 8, 16), gold); muzzle.position.z = -1.36; b.add(muzzle);
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.05, 6, 16), gold); band.position.z = -0.35; b.add(band);
        b.position.set(0, 0.32, 0); tur.add(b); this.barrels.push(b);
      }
      // crystal core (lv3+), side plates (lv4+), crown + second banner (lv5)
      this.core = new THREE.Mesh(new THREE.OctahedronGeometry(0.32), this.std(0x7fe8ff, { emissive: 0x2fb8ff, emissiveIntensity: 1.2, roughness: 0.15, metalness: 0.1 })); this.core.position.y = 1.0; tur.add(this.core);
      this.plates = new THREE.Group(); for (const x of [-1.22, 1.22]) { const pl = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 2.0), gold); pl.position.set(x, 0.85, 0); this.plates.add(pl); const st = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 1.5), paint); st.position.set(x * 1.03, 0.85, 0); this.plates.add(st); } body.add(this.plates);
      this.crates = new THREE.Group(); for (const x of [-0.65, 0.65]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.5), this.std(0x9a6a3c, { roughness: 0.8, metalness: 0 })); c.position.set(x, 1.15, 0.95); this.crates.add(c); } body.add(this.crates);
      this.crown = new THREE.Group(); for (let k = 0; k < 6; k++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.32, 6), gold); const a = k / 6 * Math.PI * 2; sp.position.set(Math.cos(a) * 0.55, 0.42, Math.sin(a) * 0.55); this.crown.add(sp); } tur.add(this.crown);
      // flags
      const clothG = () => { const geo = new THREE.PlaneGeometry(0.95, 0.62, 10, 4); geo.translate(0.475, 0, 0); return geo; };
      this.flags = [];
      for (const [x, z] of [[-0.85, 1.1], [0.85, 1.1]]) {
        const fg = new THREE.Group(); fg.position.set(x, 0.9, z);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6), gold); pole.position.y = 1.1; fg.add(pole);
        const cloth = new THREE.Mesh(clothG(), this.std(skin.color, { side: THREE.DoubleSide, roughness: 0.8, metalness: 0 })); cloth.position.y = 1.85; fg.add(cloth); cloth.userData.base = cloth.geometry.attributes.position.array.slice();
        const em = new THREE.Mesh(new THREE.CircleGeometry(0.15, 12), this.std(0xffffff, { side: THREE.DoubleSide })); em.position.set(0.45, 1.85, 0.01); fg.add(em); fg.userData.em = em;
        body.add(fg); this.flags.push(fg);
      }
      ch.castShadow = true; g.traverse(o => { if (o.isMesh) o.castShadow = true; });
      // health + pickup rings on the ground
      this.hpRing = new THREE.Mesh(new THREE.RingGeometry(1.75, 1.95, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x4cff8a, transparent: true, opacity: 0.7, depthWrite: false })); this.hpRing.position.y = 0.05; g.add(this.hpRing);
      this.magRing = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe28a, transparent: true, opacity: 0.35, depthWrite: false })); this.magRing.position.y = 0.04; g.add(this.magRing);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(5, 5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: radialTex('rgba(80,160,255,0.55)', 'rgba(80,160,255,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); glow.position.y = 0.06; g.add(glow); this.lGlow = glow;
      return g;
    }
    setSkin(item) { this.skin = item; if (this.lPaint) { this.lPaint.color.set(item.color); this.lGold.color.set(item.trim); this.flags.forEach(f => f.children[1].material.color.set(item.color)); } }

    drawLauncher(sim, dt) {
      const L = sim.L, g = this.launcher, lv = sim.level;
      g.position.set(L.x, 0, L.z); g.visible = true;
      const tilt = Math.max(-0.25, Math.min(0.25, -L.vx * 0.03)); this.lBody.rotation.z += (tilt - this.lBody.rotation.z) * Math.min(1, dt * 8);
      this.lBody.position.y = Math.abs(Math.sin(this.time * 9)) * 0.02 + (L.hitT < 0.15 ? 0.08 : 0);
      for (const w of this.wheels) w.rotation.x = -L.wheel * 2.2;
      const nb = lv >= 5 ? 3 : lv >= 3 ? 2 : 1;
      this.barrels.forEach((b, k) => { b.visible = k < nb; b.position.x = nb === 1 ? 0 : nb === 2 ? (k ? 0.28 : -0.28) : (k - 1) * 0.42; b.position.z = L.fire * 0.18 * ((k + Math.floor(this.time * 8)) % nb === 0 ? 1 : 0.3); });
      this.turret.rotation.y = Math.sin(this.time * 1.3) * 0.05 - L.vx * 0.02;
      this.crates.visible = lv >= 2; this.core.visible = lv >= 3; this.plates.visible = lv >= 4; this.crown.visible = lv >= 5; this.flags[1].visible = lv >= 5;
      this.core.rotation.y += dt * 2; this.core.position.y = 1.0 + Math.sin(this.time * 3) * 0.08;
      const sc = 1 + (lv - 1) * 0.07; this.lBody.scale.setScalar(sc);
      for (const f of this.flags) { const c = f.children[1], a = c.geometry.attributes.position, b = c.userData.base; for (let k = 0; k < a.count; k++) { const x = b[k * 3]; a.array[k * 3 + 2] = Math.sin(x * 5 - this.time * 7) * 0.09 * x; } a.needsUpdate = true; }
      const hpF = L.hp / sim.stats.maxHp; this.hpRing.material.color.setHSL(0.33 * hpF, 0.9, 0.55); this.hpRing.material.opacity = 0.35 + (1 - hpF) * 0.5 + (L.hitT < 0.2 ? 0.3 : 0);
      this.hpRing.scale.setScalar(0.3 + 0.7 * hpF + 0.0001);
      const mg = sim.stats.magnet; this.magRing.scale.set(mg, 1, mg); this.magRing.material.opacity = 0.18 + Math.sin(this.time * 3) * 0.06;
      this.lPaint.emissive.setRGB(L.hitT < 0.12 ? 0.6 : 0, 0, 0); if (L.inv > 0) this.lPaint.emissive.setRGB(0.1, 0.25, 0.5 * (0.5 + 0.5 * Math.sin(this.time * 20)));
      this.lGlow.material.opacity = 0.5 + L.fire * 0.5;
      if (!sim.alive) g.visible = Math.floor(this.time * 4) % 2 === 0 && sim.t - 0 > 0 && this.deathT < 1.2; // flicker out
    }

    // ---------- towers ----------
    buildTower(t) {
      const g = new THREE.Group(), lv = t.lvl, T = KM.TOWERS[t.type];
      const stone = this.std(0xb4b9c2, { roughness: 0.85, metalness: 0 }), wood = this.std(0x9a6a3c, { roughness: 0.8, metalness: 0 }), gold = this.std(0xf2c14e, { metalness: 0.85, roughness: 0.3 }), blue = this.std(0x2f6dff, { roughness: 0.5 }), acc = this.std(T.color, { roughness: 0.4, emissive: T.color, emissiveIntensity: 0.15 });
      const H = 1.4 + lv * 0.3;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9 + lv * 0.05, 1.15 + lv * 0.06, H, 10), stone); base.position.y = H / 2; g.add(base);
      for (let k = 0; k < 6; k++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.3), stone); const a = k / 6 * Math.PI * 2; bl.position.set(Math.cos(a) * (0.95 + lv * 0.05), H + 0.12, Math.sin(a) * (0.95 + lv * 0.05)); bl.rotation.y = -a; g.add(bl); }
      for (let k = 1; k < lv; k++) { const rg = new THREE.Mesh(new THREE.TorusGeometry(1.0 + lv * 0.05, 0.06, 6, 20), gold); rg.rotation.x = Math.PI / 2; rg.position.y = H * k / lv; g.add(rg); }
      if (lv >= 3) for (const x of [-1, 1]) { const bn = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.9, 0.5), blue); bn.position.set(x * (1.05 + lv * 0.05), H - 0.6, 0); g.add(bn); }
      const head = new THREE.Group(); head.position.y = H + 0.2; g.add(head); g.userData.head = head;
      const plat = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.16, 12), wood); head.add(plat);
      const aimG = new THREE.Group(); head.add(aimG); g.userData.aim = aimG;
      if (t.type === 'arrow') { const bdy = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 1.2), wood); bdy.position.y = 0.4; aimG.add(bdy); const arms = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.1), acc); arms.position.set(0, 0.45, 0.35); aimG.add(arms); const tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 6).rotateX(Math.PI / 2), gold); tip.position.set(0, 0.52, 0.75); aimG.add(tip); }
      if (t.type === 'cannon') { const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 0.5), wood); yoke.position.y = 0.3; aimG.add(yoke); const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.3, 12).rotateX(Math.PI / 2), this.std(0x30323a, { metalness: 0.6, roughness: 0.4 })); bar.position.set(0, 0.6, 0.35); aimG.add(bar); const mz = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.06, 6, 12), acc); mz.position.set(0, 0.6, 1.0); aimG.add(mz); g.userData.barrel = bar; }
      if (t.type === 'frost') { const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.45), this.std(0xaef4ff, { emissive: 0x3fd0ff, emissiveIntensity: 0.8, roughness: 0.1, transparent: true, opacity: 0.9 })); cr.position.y = 0.95; cr.scale.y = 1.5; aimG.add(cr); g.userData.spin = cr; for (let k = 0; k < 3; k++) { const s2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), cr.material); s2.position.set(Math.cos(k * 2.1) * 0.6, 0.8, Math.sin(k * 2.1) * 0.6); cr.add(s2); } }
      if (t.type === 'sniper') { const bdy = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.7), this.std(0x3a2f5a)); bdy.position.y = 0.45; aimG.add(bdy); const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.8, 8).rotateX(Math.PI / 2), acc); bar.position.set(0, 0.5, 0.9); aimG.add(bar); const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.4, 8).rotateX(Math.PI / 2), gold); sc.position.set(0, 0.75, 0.2); aimG.add(sc); }
      if (t.type === 'barracks') { const hs = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 1.0), this.std(0xe8dcc0, { roughness: 0.8 })); hs.position.y = 0.45; head.add(hs); const rf = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.7, 4), blue); rf.position.y = 1.2; rf.rotation.y = Math.PI / 4; head.add(rf); const dr = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.04), wood); dr.position.set(0, 0.3, 0.52); head.add(dr); head.rotation.y = Math.sign(-t.x || 1) * Math.PI / 2; }
      if (t.type === 'banner') { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), gold); pole.position.y = 1.3; head.add(pole); const fl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, 1.1), this.std(0x3cd27a, { emissive: 0x1a7a44, emissiveIntensity: 0.3 })); fl.position.set(0, 2.0, 0.58); head.add(fl); g.userData.flag = fl; const aura = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3cd27a, transparent: true, opacity: 0.45, depthWrite: false })); aura.position.y = -H - 0.1; aura.scale.setScalar(7); head.add(aura); g.userData.aura = aura; }
      if (t.type !== 'barracks' && t.type !== 'banner') { const roof = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 6), blue); roof.position.set(0, -0.05, -0.62); head.add(roof); }
      g.traverse(o => { if (o.isMesh && o.material !== undefined && !o.material.transparent) o.castShadow = true; });
      g.userData.lvl = lv; g.userData.type = t.type;
      return g;
    }
    drawTowers(sim, dt) {
      for (let s = 0; s < 6; s++) {
        const t = sim.towers[s]; let o = this.towerObjs[s];
        if (!t) { if (o) { this.scene.remove(o); this.towerObjs[s] = null; } continue; }
        if (!o || o.userData.lvl !== t.lvl || o.userData.type !== t.type) { if (o) this.scene.remove(o); o = this.towerObjs[s] = this.buildTower(t); this.scene.add(o); this.burst(t.x, 2, t.z, 40, 0xffd23a, 6, 0.5); this.ring(t.x, t.z, 0xffd23a); }
        o.position.set(t.x, 0, t.z);
        const pop = Math.min(1, t.born / 0.35); o.scale.setScalar(pop < 1 ? 0.6 + 0.4 * Math.sin(pop * Math.PI / 2) + Math.sin(pop * Math.PI) * 0.15 : 1);
        const a = o.userData.aim; let dy = t.aim - a.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); a.rotation.y += dy * Math.min(1, dt * 10);
        a.position.z = -t.recoil * 0.12 * Math.cos(a.rotation.y); a.position.x = -t.recoil * 0.12 * Math.sin(a.rotation.y);
        if (o.userData.spin) o.userData.spin.rotation.y += dt * 1.5;
        if (o.userData.aura) { o.userData.aura.scale.setScalar(7 * Math.sqrt(sim.stats.towerRange) * (1 + Math.sin(this.time * 2) * 0.02)); }
        if (o.userData.flag) o.userData.flag.rotation.y = Math.sin(this.time * 3) * 0.15;
      }
    }

    // ---------- coins ----------
    initCoins() {
      const geo = new THREE.CylinderGeometry(0.22, 0.22, 0.07, 16); geo.rotateX(Math.PI / 2);
      const mat = this.std(0xffc21a, { metalness: 0.35, roughness: 0.3, emissive: 0xb07000, emissiveIntensity: 0.55 });
      this.coinM = new THREE.InstancedMesh(geo, mat, KM.Sim.CCAP); this.coinM.frustumCulled = false; this.coinM.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(this.coinM);
      this.coinGlow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: radialTex('rgba(255,210,80,0.6)', 'rgba(255,210,80,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), KM.Sim.CCAP); this.coinGlow.frustumCulled = false; this.scene.add(this.coinGlow);
    }
    drawCoins(sim) {
      const C = sim.c, m = this.m, q = this.q, e = this.e, p = this.v, s = this.s3; let n = 0;
      for (let k = 0; k < KM.Sim.CCAP; k++) {
        if (!C.st[k]) continue;
        const big = Math.min(1.8, 0.9 + Math.sqrt(C.v[k]) * 0.25), fade = C.st[k] === 1 && C.age[k] > 19 ? (Math.floor(C.age[k] * 8) % 2 ? 0.6 : 1) : 1;
        const y = C.y[k] + (C.st[k] === 1 && C.vy[k] === 0 ? 0.12 + Math.sin(this.time * 4 + k) * 0.08 : 0);
        e.set(0, this.time * 3 + k, 0); q.setFromEuler(e); p.set(C.x[k], y + 0.1, C.z[k]); s.setScalar(big * fade); m.compose(p, q, s); this.put(this.coinM, n, m);
        q.identity(); p.set(C.x[k], 0.06, C.z[k]); s.setScalar(big * 1.6); m.compose(p, q, s); this.put(this.coinGlow, n, m); n++;
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
    onEvent(sim, type, a, b, c) {
      switch (type) {
        case 'kill': { const i = a, d = b, s = sim.sc[i]; this.burst(sim.x[i], 0.6 * s, sim.z[i], d.el ? 30 : 6, ENEMY_COL[d.k], d.el ? 7 : 3.5, d.el ? 0.7 : 0.4, 0.45); if (d.el) this.ring(sim.x[i], sim.z[i], 0xff5a3a, 4); this.emit(sim.x[i], 0.3, sim.z[i], 0, 0.6, 0, 0xffe7a0, 1.4 * s, 0.25, 0); break; }
        case 'fdie': this.burst(sim.x[a], 0.6, sim.z[a], 4, 0x5aa0ff, 3, 0.35, 0.4); break;
        case 'hit': if (Math.random() < 0.35) { const t = b; if (t >= 0) this.burst((sim.x[a] + sim.x[t]) / 2, 0.7, (sim.z[a] + sim.z[t]) / 2, c ? 8 : 2, c ? 0xffe14a : 0xfff4d0, c ? 4 : 2.5, c ? 0.5 : 0.28, 0.25); } break;
        case 'cleave': this.burst(sim.x[a], 0.5, sim.z[a] + 1, 14, 0xffffff, 4, 0.35, 0.3); this.ring(sim.x[a], sim.z[a] + 1, 0xffaaaa, 2.5, 0.35); break;
        case 'deploy': { const L = sim.L; this.burst(L.x, 1.6, L.z - 1.4, 3, 0x7cc4ff, 2.5, 0.45, 0.3, 2); break; }
        case 'boom': this.burst(a, 0.5, b, 40, 0xff8a2a, 7, 0.9, 0.6, 6); this.burst(a, 0.5, b, 14, 0x555555, 3, 1.4, 0.9, -1); this.ring(a, b, 0xff7a2a, c * 1.2, 0.4); this.shake = Math.max(this.shake, 0.15); break;
        case 'impact': if (a === 1) { this.burst(b, 0.4, c, 18, 0xffa040, 5, 0.7, 0.45); this.ring(b, c, 0xffa040, 2.6, 0.35); } else if (a === 2) { this.burst(b, 0.4, c, 18, 0x9ff0ff, 4, 0.6, 0.6, 2); this.ring(b, c, 0x9ff0ff, 3, 0.5); } else if (a === 4) this.burst(b, 0.8, c, 12, 0xe4c2ff, 5, 0.5, 0.35); break;
        case 'coin': if (Math.random() < 0.5) this.burst(sim.L.x, 1.4, sim.L.z, 3, 0xffd34a, 3, 0.4, 0.35); break;
        case 'lhit': this.burst(sim.L.x, 1, sim.L.z, 10, 0xff4a3a, 4, 0.5, 0.35); this.shake = Math.max(this.shake, 0.12); break;
        case 'upgrade': this.burst(sim.L.x, 1, sim.L.z, 60, 0xffd23a, 6, 0.6, 0.7, 5); this.ring(sim.L.x, sim.L.z, 0xffd23a, 6, 0.7); this.ring(sim.L.x, sim.L.z, 0x7cc4ff, 4, 0.5); break;
        case 'heal': this.burst(sim.x[a], 1, sim.z[a], 6, 0x8aff7a, 2, 0.5, 0.6, -1); break;
        case 'death': this.burst(sim.L.x, 1, sim.L.z, 120, 0xffa040, 9, 1.0, 1.0, 6); this.burst(sim.L.x, 1, sim.L.z, 40, 0x666666, 4, 2, 1.6, -1.5); this.ring(sim.L.x, sim.L.z, 0xff6a2a, 10, 0.9); this.shake = 0.4; this.deathT = 0; break;
        case 'revive': this.ring(sim.L.x, sim.L.z, 0x7cc4ff, 12, 0.9); this.burst(sim.L.x, 1, sim.L.z, 80, 0x7cc4ff, 7, 0.8, 0.8); break;
        case 'tower': { const t = a; if (t.type === 'arrow' || t.type === 'sniper') this.emit(t.x, 2.2 + t.lvl * 0.3, t.z, 0, 0.5, 0, t.type === 'sniper' ? 0xe4c2ff : 0xfff0c0, 0.9, 0.12, 0); if (t.type === 'cannon') this.burst(t.x + Math.sin(t.aim), 2.2 + t.lvl * 0.3, t.z + Math.cos(t.aim), 8, 0xaaaaaa, 2, 0.8, 0.5, -1); break; }
      }
    }

    // ---------- camera ----------
    drawCamera(sim, dt) {
      const L = sim.L, army = sim.count[0] + sim.count[1];
      const halfW = 9.6, fov = this.cam.fov * Math.PI / 180;
      const pitch = 0.95; // ~54°
      let dist = halfW / (Math.tan(fov / 2) * Math.min(this.aspect, 1.15)) * 0.86;
      dist = Math.max(dist, this.aspect > 1 ? 36 : 26) * (1 + Math.min(0.18, army / 3000));
      const tx = L.x * 0.35, tz = sim.front - 11 + L.offZ * 0.3;
      if (!this.camT) this.camT = new V3(tx, 0, tz);
      this.camT.x += (tx - this.camT.x) * Math.min(1, dt * 3); this.camT.z += (tz - this.camT.z) * Math.min(1, dt * 4);
      this.camD = (this.camD || dist) + (dist - (this.camD || dist)) * Math.min(1, dt * 1.5);
      this.shake = Math.max(0, this.shake - dt * 1.2);
      const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
      this.cam.position.set(this.camT.x + sx, Math.sin(pitch) * this.camD + sy, this.camT.z + Math.cos(pitch) * this.camD);
      this.cam.lookAt(this.camT.x, 0, this.camT.z);
      this.scene.fog.near = this.camD + 6; this.scene.fog.far = this.camD + 95;
      this.sun.position.set(this.camT.x + 12, 30, this.camT.z + 14); this.sun.target.position.set(this.camT.x, 0, this.camT.z - 4);
    }

    frame(sim, dt) {
      this.time += dt; if (this.deathT != null) this.deathT += dt;
      this.streamWorld(sim.front);
      this.drawCamera(sim, dt); this.drawLauncher(sim, dt); this.drawTowers(sim, dt);
      this.drawCrowd(sim, dt); this.drawCoins(sim); this.drawProjectiles(sim); this.stepFx(dt);
      this.R.render(this.scene, this.cam);
    }
    resetRun() { this.deathT = null; this.camT = null; this.camD = null; for (let s = 0; s < 6; s++) if (this.towerObjs[s]) { this.scene.remove(this.towerObjs[s]); this.towerObjs[s] = null; } this.pl.fill(0); this.ry.fill(Math.PI); this.fogCol.setHex(KM.BIOMES[0].fog); }
  }
  KM.Render = Render;
})(window);
