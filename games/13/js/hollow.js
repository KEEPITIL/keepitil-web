/* THE HOLLOW — counterfeit thing. Tall, emaciated, hunched; arms to the knees, long fingers; a pale mask of a face
   with empty sockets and a jaw that opens too far. Movement is irregular: stutter-holds, head snaps, limbs out of sync.
   Reveal modes: full · shadow (pure silhouette) · limbs (only arms/hands) · face (only the head) · none. Forward is −z. */
(function () {
  const H = T13.hollow = {}, X = T13.gfx;
  H.build = () => {
    const skinT = X.tex('hollowskin', 256, 256, (g, w, h) => { g.fillStyle = '#8e8f86'; g.fillRect(0, 0, w, h); for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(${X.rnd() < 0.5 ? '40,45,40' : '140,120,110'},${X.rnd() * 0.25})`; g.beginPath(); g.arc(X.rnd() * w, X.rnd() * h, 1 + X.rnd() * 7, 0, 7); g.fill(); } for (let i = 0; i < 30; i++) { g.strokeStyle = 'rgba(50,40,60,.35)'; g.beginPath(); let x = X.rnd() * w, y = X.rnd() * h; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += X.rnd() * 20 - 10; y += X.rnd() * 20; g.lineTo(x, y); } g.stroke(); } });
    const skin = X.mat({ color: 0xb0b0a6, map: skinT, shininess: 30 }), dark = X.mat({ color: 0x0f0f11 }), cloth = X.mat({ color: 0x1a1816, side: THREE.DoubleSide, map: X.fabricTex('#ffffff', 'cloth') });
    const black = new THREE.MeshBasicMaterial({ color: 0x000000 }), socket = new THREE.MeshBasicMaterial({ color: 0x020202 });
    const glint = new THREE.MeshBasicMaterial({ color: 0xd8d2b8, transparent: true, opacity: 0.9 });
    const root = new THREE.Group(), parts = { body: [], limbs: [], face: [] };
    const reg = (m, cat) => { m.castShadow = true; m.userData.mat = m.material; m.userData.cat = cat; parts[cat].push(m); return m; };
    const cyl = (a, b, h, mat, cat, seg = 8) => reg(new THREE.Mesh(new THREE.CylinderGeometry(a, b, h, seg), mat), cat);
    const sph = (r, mat, cat, w = 12, hs = 10) => reg(new THREE.Mesh(new THREE.SphereGeometry(r, w, hs), mat), cat);
    const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
    const pelvis = at(new THREE.Group(), 0, 1.18, 0); root.add(pelvis);
    const s1 = at(new THREE.Group(), 0, 0.12, 0); pelvis.add(s1); s1.rotation.x = -0.25;
    const s2 = at(new THREE.Group(), 0, 0.3, 0); s1.add(s2); s2.rotation.x = -0.3;
    const s3 = at(new THREE.Group(), 0, 0.3, 0); s2.add(s3); s3.rotation.x = -0.35;
    const neck = at(new THREE.Group(), 0, 0.22, 0); s3.add(neck); neck.rotation.x = 0.55;
    const head = at(new THREE.Group(), 0, 0.2, 0); neck.add(head);
    pelvis.add(at(cyl(0.12, 0.1, 0.2, skin, 'body'), 0, 0, 0));
    s1.add(at(cyl(0.1, 0.12, 0.32, skin, 'body'), 0, 0.15, 0));
    s2.add(at(cyl(0.15, 0.1, 0.32, skin, 'body'), 0, 0.15, 0));
    const rib = at(cyl(0.2, 0.15, 0.3, skin, 'body'), 0, 0.12, 0); rib.scale.z = 0.62; s3.add(rib);
    // vertebrae ridge
    for (let i = 0; i < 7; i++) s2.add(at(sph(0.028, skin, 'body', 6, 5), 0, -0.1 + i * 0.07, 0.085));
    neck.add(at(cyl(0.04, 0.05, 0.24, skin, 'body'), 0, 0.1, 0));
    // head: long skull, mask face, empty sockets, gaping jaw
    const skull = at(sph(0.13, skin, 'face', 16, 14), 0, 0.12, 0); skull.scale.set(0.82, 1.38, 0.92); head.add(skull);
    const cheek = at(sph(0.1, skin, 'face', 14, 10), 0, 0.02, -0.05); cheek.scale.set(0.95, 0.9, 0.8); head.add(cheek);
    const eyes = [];
    [-1, 1].forEach(s => { const so = at(sph(0.025, socket, 'face', 10, 8), s * 0.042, 0.095, -0.098); so.scale.set(0.9, 1.7, 0.55); so.rotation.z = s * 0.35; head.add(so); const gl = at(sph(0.0028, glint, 'face', 6, 4), s * 0.042, 0.09, -0.112); head.add(gl); eyes.push(gl);
      const ridge = at(sph(0.04, skin, 'face', 10, 6), s * 0.043, 0.128, -0.078); ridge.scale.set(1.15, 0.4, 0.75); ridge.rotation.z = -s * 0.3; head.add(ridge);
      const hollowC = at(sph(0.03, X.mat({ color: 0x2d2a26 }), 'face', 8, 6), s * 0.06, 0.02, -0.08); hollowC.scale.set(0.6, 1.3, 0.3); head.add(hollowC); });
    const jawG = at(new THREE.Group(), 0, -0.02, -0.02); head.add(jawG);
    const jaw = at(sph(0.08, skin, 'face', 12, 8), 0, -0.07, -0.02); jaw.scale.set(0.8, 1.2, 0.75); jawG.add(jaw);
    const mouth = at(sph(0.05, black, 'face', 10, 8), 0, -0.035, -0.078); mouth.scale.set(0.5, 0.3, 0.3); mouth.userData.anim = true; head.add(mouth);
    for (let i = -2; i <= 2; i++) head.add(at(reg(new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.02, 0.006), X.mat({ color: 0xcfc8a8 })), 'face'), i * 0.012, -0.012, -0.093));
    // limbs: very long, thin; four long fingers
    const arm = s => {
      const sh = at(new THREE.Group(), s * 0.19, 0.22, 0); s3.add(sh); sh.rotation.z = s * 0.1;
      sh.add(at(cyl(0.04, 0.03, 0.56, skin, 'limbs'), 0, -0.28, 0));
      const el = at(new THREE.Group(), 0, -0.56, 0); sh.add(el); el.add(at(sph(0.035, skin, 'limbs', 8, 6), 0, 0, 0));
      el.add(at(cyl(0.03, 0.022, 0.56, skin, 'limbs'), 0, -0.28, 0));
      const wr = at(new THREE.Group(), 0, -0.57, 0); el.add(wr); wr.add(at(sph(0.035, skin, 'limbs', 8, 6), 0, -0.02, 0));
      const fingers = []; for (let f = 0; f < 4; f++) { const fg = at(new THREE.Group(), (f - 1.5) * 0.018, -0.04, 0); wr.add(fg); fg.add(at(cyl(0.008, 0.005, 0.2, skin, 'limbs', 5), 0, -0.1, 0)); const tip = at(new THREE.Group(), 0, -0.2, 0); fg.add(tip); tip.add(at(cyl(0.005, 0.002, 0.12, dark, 'limbs', 5), 0, -0.06, 0)); fg.rotation.z = (f - 1.5) * 0.12; fingers.push({ fg, tip }); }
      return { sh, el, wr, fingers };
    };
    const armL = arm(-1), armR = arm(1);
    const leg = s => { const hp = at(new THREE.Group(), s * 0.1, -0.05, 0); pelvis.add(hp); hp.add(at(cyl(0.05, 0.035, 0.6, skin, 'body'), 0, -0.3, 0)); const kn = at(new THREE.Group(), 0, -0.6, 0); hp.add(kn); kn.add(at(cyl(0.035, 0.025, 0.58, skin, 'body'), 0, -0.29, 0)); const ft = at(reg(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.22), skin), 'body'), 0, -0.6, -0.05); kn.add(ft); return { hp, kn }; };
    const legL = leg(-1), legR = leg(1);
    // tattered shroud strips hanging from the shoulders and hips
    for (let i = 0; i < 9; i++) { const w = 0.07 + X.rnd() * 0.06, h = 0.5 + X.rnd() * 0.5; const strip = reg(new THREE.Mesh(new THREE.PlaneGeometry(w, h, 1, 3), cloth), 'body'); const a = (i / 9) * Math.PI * 2; strip.position.set(Math.cos(a) * 0.17, -h / 2 + 0.25, Math.sin(a) * 0.12); strip.rotation.y = -a + Math.PI / 2; s3.add(strip); }
    const st = { t: Math.random() * 10, hold: 0, snap: 0, snapTo: 0, phase: 0, mode: 'full', gape: 0 };
    const api = { root, head, mode: 'full',
      setReveal(mode) { st.mode = api.mode = mode; for (const cat of ['body', 'limbs', 'face']) parts[cat].forEach(m => { const vis = mode === 'full' || mode === 'shadow' || (mode === 'limbs' && cat === 'limbs') || (mode === 'face' && cat === 'face'); m.visible = vis; m.material = mode === 'shadow' ? black : m.userData.mat; }); eyes.forEach(e => { e.visible = mode === 'full' || mode === 'face'; }); },
      /* ctx: { speed, hunting, stagger, dt } */
      update(dt, ctx = {}) {
        st.t += dt;
        // stutter: sometimes the whole body freezes for a beat, then catches up
        if (st.hold > 0) { st.hold -= dt; return; } if (Math.random() < dt * (ctx.hunting ? 1.8 : 0.7)) st.hold = 0.08 + Math.random() * 0.22;
        const sp = ctx.speed || 0; st.phase += dt * sp * 2.3;
        const s = Math.sin(st.phase), c = Math.cos(st.phase), amp = Math.min(1, sp / 2);
        legL.hp.rotation.x = s * 0.6 * amp; legR.hp.rotation.x = -s * 0.6 * amp; legL.kn.rotation.x = -Math.max(0, -c) * 1.1 * amp - 0.2; legR.kn.rotation.x = -Math.max(0, c) * 1.1 * amp - 0.2;
        pelvis.position.y = 1.18 + Math.abs(c) * 0.05 * amp + (ctx.stagger ? -0.25 : 0);
        // arms dangle out of sync, reach forward when hunting
        const reach = ctx.hunting ? 1 : 0;
        armL.sh.rotation.x = reach * 1.05 + 0.25 + Math.sin(st.t * 1.3) * 0.2 + (-s * 0.25 * amp); armR.sh.rotation.x = reach * 1.2 + 0.25 + Math.sin(st.t * 0.9 + 2) * 0.22 + (s * 0.3 * amp);
        armL.el.rotation.x = 0.3 + reach * 0.35; armR.el.rotation.x = 0.2 + reach * 0.5;
        [armL, armR].forEach((a, i) => a.fingers.forEach((f, j) => { const curl = 0.4 + Math.sin(st.t * 3 + j + i * 2) * 0.35; f.fg.rotation.x = curl * 0.6; f.tip.rotation.x = curl; }));
        s1.rotation.x = -0.25 - (ctx.hunting ? 0.25 : 0) + Math.sin(st.t * 0.7) * 0.04; s3.rotation.z = Math.sin(st.t * 0.5) * 0.08;
        // head: slow tilt, then an occasional violent snap
        st.snap -= dt; if (st.snap <= 0) { st.snap = 1.5 + Math.random() * 3.5; st.snapTo = (Math.random() - 0.5) * (ctx.hunting ? 1.4 : 2.2); }
        head.rotation.z += (st.snapTo * 0.6 - head.rotation.z) * Math.min(1, dt * (Math.random() < 0.1 ? 40 : 3)); head.rotation.y = Math.sin(st.t * 0.6) * 0.3;
        st.gape += ((ctx.hunting ? 1 : 0.1) - st.gape) * Math.min(1, dt * 2); jawG.rotation.x = st.gape * 0.55; mouth.scale.y = 0.3 + st.gape * 1.9;
        eyes.forEach(e => { e.material.opacity = ctx.hunting ? 1 : 0.55 + Math.sin(st.t * 7) * 0.2; });
      } };
    root.traverse(o => { if (o.isMesh) o.receiveShadow = false; });
    eyes.forEach(e => { e.userData.anim = true; });
    api.baked = X.bake(root, m => !!m.userData.anim, m => m.material.uuid + '|' + m.userData.cat);
    parts.body = []; parts.limbs = []; parts.face = []; root.traverse(o => { if (o.isMesh && o.userData.cat) parts[o.userData.cat].push(o); });
    return api;
  };
})();
