/* Rendering foundation: quality tiers, colour management, procedural textures, geometry merging,
   and the LIGHTING STATE machine (NORMAL → DIM → DARK → BLACKOUT → RESTORED) that the Fear Director drives.
   Principle: the building is readable by default; darkness is an event, not the permanent state. */
(function () {
  const X = T13.gfx = {};
  /* ---------- quality tiers ---------- */
  const touch = matchMedia('(pointer: coarse)').matches, cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4;
  const saved = (() => { try { return localStorage.getItem('t13-quality'); } catch (e) { return null; } })();
  const auto = !touch ? 'HIGH' : (cores <= 4 && mem <= 3) ? 'LOW' : 'MEDIUM';
  X.tier = new URLSearchParams(location.search).get('q') || saved || auto;
  X.TIERS = {
    HIGH: { pr: 1.75, shadows: true, mat: 'phong', bump: true, lights: 10, tex: 1024, far: 70 },
    MEDIUM: { pr: 1.5, shadows: false, mat: 'phong', bump: true, lights: 8, tex: 512, far: 55 },
    LOW: { pr: 1.0, shadows: false, mat: 'lambert', bump: false, lights: 5, tex: 256, far: 40 },
  };
  X.Q = () => X.TIERS[X.tier] || X.TIERS.MEDIUM;
  X.setTier = t => { X.tier = t; try { localStorage.setItem('t13-quality', t); } catch (e) {} };

  X.renderer = null;
  X.initRenderer = canvas => {
    if (X.renderer) return X.renderer;
    const q = X.Q(), r = new THREE.WebGLRenderer({ canvas, antialias: !touch || X.tier === 'HIGH', powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, q.pr));
    r.outputEncoding = THREE.sRGBEncoding; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = q.shadows; r.shadowMap.type = THREE.PCFSoftShadowMap;
    const size = () => { r.setSize(innerWidth, innerHeight, false); X.cams.forEach(c => { c.aspect = innerWidth / innerHeight; c.updateProjectionMatrix(); }); };
    addEventListener('resize', size); size(); X.renderer = r; return r;
  };
  X.cams = new Set();

  /* ---------- materials ---------- */
  X.col = hex => new THREE.Color(hex).convertSRGBToLinear();
  X.mat = (o = {}) => { const q = X.Q(); const base = { color: 0xffffff, ...o }; base.color = X.col(base.color); if (base.emissive !== undefined) base.emissive = X.col(base.emissive); if (base.specular !== undefined) base.specular = X.col(base.specular); if (!q.bump) delete base.bumpMap, delete base.bumpScale;
    if (q.mat === 'lambert') { delete base.shininess; delete base.specular; delete base.bumpMap; delete base.bumpScale; return new THREE.MeshLambertMaterial(base); }
    return new THREE.MeshPhongMaterial({ shininess: 6, specular: X.col(0x111111), ...base }); };

  /* ---------- procedural canvas textures ---------- */
  const cache = new Map();
  X.tex = (key, w, h, draw, rep) => {
    const k = key + w + 'x' + h; if (cache.has(k)) { const t = cache.get(k).clone(); t.needsUpdate = true; if (rep) t.repeat.set(rep[0], rep[1]); return t; }
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'); draw(g, w, h);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; if (rep) t.repeat.set(rep[0], rep[1]); cache.set(k, t); return t;
  };
  const rnd = (() => { let s = 1337; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  X.rnd = rnd;
  const grime = (g, w, h, n, a = 0.12) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(20,16,10,${rnd() * a})`; const x = rnd() * w, y = rnd() * h, s = 3 + rnd() * 40; g.beginPath(); g.ellipse(x, y, s, s * (0.4 + rnd() * 1.4), rnd() * 3, 0, 7); g.fill(); } };
  const streaks = (g, w, h, n, col) => { for (let i = 0; i < n; i++) { const x = rnd() * w, len = 40 + rnd() * h * 0.6, y0 = rnd() * h * 0.3; const gr = g.createLinearGradient(0, y0, 0, y0 + len); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x, y0, 2 + rnd() * 6, len); } };
  /* institutional two-tone wall: lower paint, chair rail, upper paint, peeling, water streaks, scuffs */
  X.wallTex = (lower = '#5f7a66', upper = '#cfc6ad', rail = '#3f4a3f', key = 'wall') => X.tex(key + lower + upper, 512, 512, (g, w, h) => {
    g.fillStyle = upper; g.fillRect(0, 0, w, h); g.fillStyle = lower; g.fillRect(0, h * 0.58, w, h * 0.42);
    g.fillStyle = rail; g.fillRect(0, h * 0.56, w, h * 0.035); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, h * 0.56, w, 3);
    g.fillStyle = '#2b2620'; g.fillRect(0, h * 0.955, w, h * 0.045);   // skirting
    grime(g, w, h, 70, 0.1); streaks(g, w, h, 10, 'rgba(90,70,40,.22)');
    for (let i = 0; i < 3; i++) { const x = rnd() * w, y = rnd() * h * 0.5, s = 6 + rnd() * 18; g.fillStyle = 'rgba(200,190,165,.35)'; g.beginPath(); for (let a = 0; a < 7; a += 0.7) g.lineTo(x + Math.cos(a) * s * (0.5 + rnd()), y + Math.sin(a) * s * (0.5 + rnd()) * 0.7); g.fill(); g.strokeStyle = 'rgba(40,30,20,.25)'; g.stroke(); }
    const bg = g.createLinearGradient(0, h * 0.8, 0, h); bg.addColorStop(0, 'rgba(0,0,0,0)'); bg.addColorStop(1, 'rgba(20,15,8,.35)'); g.fillStyle = bg; g.fillRect(0, h * 0.8, w, h * 0.2);
    for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(rnd() * w, h * 0.8 + rnd() * h * 0.15, 6 + rnd() * 30, 1 + rnd() * 2); }
  });
  X.wallBump = () => X.tex('wallbump', 256, 256, (g, w, h) => { g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); g.fillStyle = '#9a9a9a'; g.fillRect(0, h * 0.56, w, h * 0.035); for (let i = 0; i < 400; i++) { g.fillStyle = rnd() < 0.5 ? '#767676' : '#8a8a8a'; g.fillRect(rnd() * w, rnd() * h, 2, 2); } });
  X.tileTex = (a = '#8a8272', b = '#6f685b', key = 'tile') => X.tex(key + a + b, 512, 512, (g, w, h) => {
    const n = 4, s = w / n; for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) { g.fillStyle = (x + y) % 2 ? a : b; g.fillRect(x * s, y * s, s, s); g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(x * s + 3, y * s + 3, s - 6, 4); g.strokeStyle = 'rgba(0,0,0,.35)'; g.strokeRect(x * s + 0.5, y * s + 0.5, s - 1, s - 1); }
    grime(g, w, h, 90, 0.16); for (let i = 0; i < 20; i++) { g.strokeStyle = 'rgba(0,0,0,.2)'; g.beginPath(); const x = rnd() * w, y = rnd() * h; g.moveTo(x, y); g.lineTo(x + rnd() * 60 - 30, y + rnd() * 60 - 30); g.stroke(); }
  });
  X.concreteTex = () => X.tex('concrete', 512, 512, (g, w, h) => { g.fillStyle = '#6b6a64'; g.fillRect(0, 0, w, h); for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${rnd() * 0.08})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); } grime(g, w, h, 60, 0.18); streaks(g, w, h, 8, 'rgba(60,50,30,.25)'); });
  X.ceilTex = () => X.tex('ceil', 512, 512, (g, w, h) => { g.fillStyle = '#b9b3a2'; g.fillRect(0, 0, w, h); const s = w / 4; g.strokeStyle = '#6e6a5e'; g.lineWidth = 4; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke(); }
    for (let i = 0; i < 1500; i++) { g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(rnd() * w, rnd() * h, 1.5, 1.5); } for (let i = 0; i < 4; i++) { const x = rnd() * w, y = rnd() * h, r = 20 + rnd() * 50; const gr = g.createRadialGradient(x, y, 2, x, y, r); gr.addColorStop(0, 'rgba(120,90,40,.45)'); gr.addColorStop(0.7, 'rgba(120,90,40,.2)'); gr.addColorStop(1, 'rgba(120,90,40,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); } });
  X.woodTex = (c = '#5a3d27', key = 'wood') => X.tex(key + c, 256, 256, (g, w, h) => { g.fillStyle = c; g.fillRect(0, 0, w, h); for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(0,0,0,${0.05 + rnd() * 0.12})`; g.lineWidth = 1 + rnd() * 2; g.beginPath(); const y = rnd() * h; g.moveTo(0, y); for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x / 30 + i) * 3); g.stroke(); } grime(g, w, h, 20, 0.1); });
  X.metalTex = (c = '#5d6461', key = 'metal') => X.tex(key + c, 256, 256, (g, w, h) => { g.fillStyle = c; g.fillRect(0, 0, w, h); for (let i = 0; i < 200; i++) { g.fillStyle = `rgba(255,255,255,${rnd() * 0.05})`; g.fillRect(0, rnd() * h, w, 1); } grime(g, w, h, 30, 0.2); for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(110,60,20,.35)'; g.beginPath(); g.arc(rnd() * w, rnd() * h, 3 + rnd() * 10, 0, 7); g.fill(); } });
  X.fabricTex = (c = '#d9d4c6', key = 'fabric') => X.tex(key + c, 128, 128, (g, w, h) => { g.fillStyle = c; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 2) { g.fillStyle = 'rgba(0,0,0,.05)'; g.fillRect(0, y, w, 1); } grime(g, w, h, 12, 0.12); });
  X.paperTex = (lines = 12, key = 'paper') => X.tex(key + lines, 128, 160, (g, w, h) => { g.fillStyle = '#e6dfcb'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(30,30,40,.55)'; for (let i = 0; i < lines; i++) g.fillRect(12, 18 + i * 10, 30 + rnd() * 80, 2); grime(g, w, h, 6, 0.1); });
  X.signTex = (text, bg = '#1e2a24', fg = '#e9e4d0', key = 'sign') => X.tex(key + text + bg, 512, 128, (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = fg; g.lineWidth = 4; g.strokeRect(8, 8, w - 16, h - 16); g.fillStyle = fg; g.font = 'bold 58px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2); grime(g, w, h, 20, 0.2); });

  /* merge many meshes that share one material into a single draw call (r128 core has no merge util) */
  X.merge = (parts) => {   // parts: [{geo, matrix}] → BufferGeometry
    let n = 0; const flat = parts.map(p => { const g = (p.geo.index ? p.geo.toNonIndexed() : p.geo.clone()); g.applyMatrix4(p.matrix); n += g.attributes.position.count; return g; });
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
    for (const g of flat) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; g.dispose(); }
    const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return out;
  };

  /* bake a rig: under every joint, merge the static child meshes that share a material into one mesh.
     keep(m) → true leaves a mesh alone (animated parts). key(m) groups meshes (default: by material). */
  X.bake = (root, keep = () => false, key = m => m.material.uuid) => {
    const nodes = []; root.traverse(o => { if (!o.isMesh) nodes.push(o); });
    let before = 0, after = 0;
    for (const node of nodes) {
      const groups = new Map(); node.children.filter(c => c.isMesh && !keep(c)).forEach(c => { const k = key(c); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); });
      for (const list of groups.values()) { before += list.length; if (list.length < 2) { after += 1; continue; }
        list.forEach(c => c.updateMatrix()); const geo = X.merge(list.map(c => ({ geo: c.geometry, matrix: c.matrix })));
        const m = new THREE.Mesh(geo, list[0].material); m.castShadow = list.some(c => c.castShadow); m.receiveShadow = list.some(c => c.receiveShadow); m.userData = { ...list[0].userData };
        list.forEach(c => node.remove(c)); node.add(m); after += 1; } }
    return { before, after };
  };

  /* ---------- LIGHTING STATES ---------- */
  const LS = { NORMAL: { hemi: 1, zone: 1, fog: 0.028 }, DIM: { hemi: 0.55, zone: 0.6, fog: 0.04 }, DARK: { hemi: 0.2, zone: 0.25, fog: 0.06 }, BLACKOUT: { hemi: 0.035, zone: 0, fog: 0.085 }, RESTORED: { hemi: 1.25, zone: 1.35, fog: 0.022 } };
  X.LS = LS;
  X.light = { state: 'NORMAL', cur: { ...LS.NORMAL }, until: 0, base: 'NORMAL' };
  X.setLighting = (state, secs = 0, now = performance.now() / 1000) => { if (secs) { X.light.state = state; X.light.until = now + secs; } else { X.light.base = state; if (!X.light.until || now > X.light.until) X.light.state = state; } };
  X.stepLighting = (dt, now = performance.now() / 1000) => { const L = X.light; if (L.until && now > L.until) { L.until = 0; L.state = L.base; } const t = LS[L.state]; const k = Math.min(1, dt * (L.state === 'BLACKOUT' ? 9 : 2.2)); for (const key in t) L.cur[key] += (t[key] - L.cur[key]) * k; return L.cur; };

  /* ---------- perf overlay (?perf=1) ---------- */
  X.perf = { on: new URLSearchParams(location.search).has('perf'), frames: 0, t: performance.now(), fps: 0 };
  X.perfTick = (r) => { const P = X.perf; P.frames++; const now = performance.now(); if (now - P.t >= 1000) { P.fps = P.frames * 1000 / (now - P.t); P.frames = 0; P.t = now;
    if (P.on) { let el = document.getElementById('perfhud'); if (!el) { el = document.createElement('div'); el.id = 'perfhud'; el.style.cssText = 'position:fixed;right:8px;top:54px;z-index:99;font:11px monospace;color:#9f9;background:#000a;padding:4px 6px;border-radius:4px;pointer-events:none;white-space:pre'; document.body.appendChild(el); }
      const i = r.info; el.textContent = `${X.tier} ${P.fps.toFixed(0)} fps\ncalls ${i.render.calls} tris ${i.render.triangles}\ngeo ${i.memory.geometries} tex ${i.memory.textures}${performance.memory ? '\nheap ' + (performance.memory.usedJSHeapSize / 1048576).toFixed(0) + ' MB' : ''}`; } } };
})();
