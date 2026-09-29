/* MARA · GABRIEL · DANIEL — procedural rigged people (built in code so real GLB models can replace them later
   behind the same interface: build(id) → { root, update(dt, ctx), setExpr(name), lookAt(v3|null), act(name, target), say(ms) }).
   Face: eyes (blink + gaze), brows, eyelids, nose, ears, mouth (closed arc / open) → expressions neutral · concern · fear · pain · anger.
   Period: 2001–2002 field investigators. No modern devices. Forward is −z. */
(function () {
  const P = T13.people = {}, X = T13.gfx, V = THREE.Vector3;
  const SPECS = {
    mara: { h: 1.70, sw: 1.0, skin: 0xd8ab8a, hair: 0x6a2a18, eye: 0x4f7d4b, lips: 0xa35a52,
      jacket: 0x5a5c3c, jacket2: 0x484a30, shirt: 0x5a2f4f, pants: 0x2b3345, shoe: 0x4a3222, hairStyle: 'long' },
    gabriel: { h: 1.86, sw: 1.14, skin: 0xb88562, hair: 0x2a1b12, eye: 0x4a3020, lips: 0x93574a,
      jacket: 0x6d4b2a, jacket2: 0x4f3620, shirt: 0x8a2d27, pants: 0x262b36, shoe: 0x3a2a1c, hairStyle: 'crop', stubble: true },
    daniel: { h: 1.77, sw: 0.97, skin: 0x7a5136, hair: 0x141010, eye: 0x2a1a10, lips: 0x6e3d33,
      jacket: 0x8a7350, jacket2: 0x6f5c3f, shirt: 0x2e5d58, pants: 0x746a52, shoe: 0x5a4636, hairStyle: 'curly', glasses: true },
  };
  const EXPR = {
    neutral: { browY: 0, browRot: 0, lid: 0.82, curve: 0.15, open: 0 },
    concern: { browY: 0.004, browRot: 0.28, lid: 0.86, curve: -0.35, open: 0.05 },
    fear: { browY: 0.009, browRot: 0.38, lid: 1.0, curve: -0.25, open: 0.75 },
    pain: { browY: -0.003, browRot: 0.42, lid: 0.3, curve: -0.7, open: 0.35 },
    anger: { browY: -0.007, browRot: -0.4, lid: 0.62, curve: -0.55, open: 0.12 },
  };
  P.EXPR = Object.keys(EXPR);
  const cyl = (rt, rb, h, mat, seg = 10) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.castShadow = true; return m; };
  const sph = (r, mat, ws = 14, hs = 10) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat); m.castShadow = true; return m; };
  const box = (w, h, d, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.castShadow = true; return m; };
  const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };

  P.build = (id) => {
    const S = SPECS[id], k = S.h / 1.75, W = S.sw;
    const M = (color, o = {}) => X.mat({ color, ...o });
    const skin = M(S.skin, { shininess: 14 }), hairM = M(S.hair, { shininess: 22 }), jacket = M(S.jacket, { map: X.fabricTex('#ffffff', 'cloth') }), jacket2 = M(S.jacket2), shirt = M(S.shirt, { map: X.fabricTex('#ffffff', 'cloth') }), pants = M(S.pants, { map: X.fabricTex('#ffffff', 'cloth') }), shoe = M(S.shoe, { shininess: 30 });
    const root = new THREE.Group(); root.name = id;
    // --- skeleton
    const hips = at(new THREE.Group(), 0, 0.93 * k, 0); root.add(hips);
    const spine = at(new THREE.Group(), 0, 0.05 * k, 0); hips.add(spine);
    const chest = at(new THREE.Group(), 0, 0.26 * k, 0); spine.add(chest);
    const neck = at(new THREE.Group(), 0, 0.27 * k, 0); chest.add(neck);
    const head = at(new THREE.Group(), 0, 0.12 * k, 0); neck.add(head);
    // --- torso (clothing)
    const pelvis = at(cyl(0.155 * W, 0.16 * W, 0.18 * k, pants), 0, 0.0, 0); pelvis.scale.z = 0.7; hips.add(pelvis);
    const belly = at(cyl(0.15 * W, 0.155 * W, 0.28 * k, shirt), 0, 0.12 * k, 0); belly.scale.z = 0.66; spine.add(belly);
    const torso = at(cyl(0.2 * W, 0.165 * W, 0.34 * k, jacket), 0, 0.1 * k, 0); torso.scale.z = 0.62; chest.add(torso);   // jacket body
    const hem = at(cyl(0.172 * W, 0.182 * W, 0.2 * k, jacket), 0, -0.14 * k, 0); hem.scale.z = 0.68; chest.add(hem);
    const shirtV = at(box(0.1 * W, 0.26 * k, 0.02, shirt), 0, 0.11 * k, -0.118 * W); chest.add(shirtV);            // shirt showing in the open jacket
    [-1, 1].forEach(s => { const lap = at(box(0.05 * W, 0.3 * k, 0.018, jacket2), s * 0.07 * W, 0.1 * k, -0.123 * W); lap.rotation.z = -s * 0.12; chest.add(lap); });
    [-1, 1].forEach(s => { const sh = at(sph(0.068 * W, jacket), s * 0.185 * W, 0.235 * k, 0); sh.scale.set(1.0, 0.72, 0.9); chest.add(sh); });
    const collar = at(new THREE.Mesh(new THREE.TorusGeometry(0.07 * W, 0.025, 6, 14), jacket2), 0, 0.28 * k, 0.005); collar.rotation.x = Math.PI / 2; chest.add(collar);
    const neckM = at(cyl(0.045, 0.052, 0.12 * k, skin), 0, 0.03 * k, 0); neck.add(neckM);
    // --- head + face
    const skull = sph(0.105, skin, 20, 16); skull.scale.set(0.93, 1.16, 1.02); head.add(skull);
    const jaw = at(sph(0.085, skin, 16, 10), 0, -0.045, -0.018); jaw.scale.set(0.9, 0.75, 0.95); head.add(jaw);
    if (S.stubble) { const st = at(sph(0.087, M(0x3a2a20, { transparent: true, opacity: 0.35 }), 16, 10), 0, -0.048, -0.02); st.scale.set(0.91, 0.72, 0.95); head.add(st); }
    [-1, 1].forEach(s => { const ear = at(sph(0.022, skin, 8, 6), s * 0.098, 0.0, 0.004); ear.scale.set(0.45, 1.1, 0.8); head.add(ear); });
    const nose = at(sph(0.0135, skin, 10, 8), 0, -0.012, -0.1); nose.scale.set(0.72, 1.45, 0.95); head.add(nose);
    const noseTip = at(sph(0.0095, skin, 8, 6), 0, -0.028, -0.104); head.add(noseTip);
    const white = X.mat({ color: 0xf2eee6, shininess: 60 }), iris = X.mat({ color: S.eye, shininess: 80 }), pupil = new THREE.MeshBasicMaterial({ color: 0x050505 });
    const eyes = [], lids = [], brows = [];
    [-1, 1].forEach(s => {
      const eg = at(new THREE.Group(), s * 0.036, 0.014, -0.083); head.add(eg);
      const eb = sph(0.019, white, 14, 10); eg.add(eb); const ir = at(sph(0.0115, iris, 12, 8), 0, 0, -0.0128); ir.scale.z = 0.5; eg.add(ir); const pu = at(sph(0.0055, pupil, 8, 6), 0, 0, -0.0182); pu.scale.z = 0.4; eg.add(pu);
      const hl = at(sph(0.0025, new THREE.MeshBasicMaterial({ color: 0xffffff }), 6, 4), 0.005, 0.005, -0.0192); eg.add(hl);
      eyes.push(eg);
      const lid = at(new THREE.Group(), s * 0.036, 0.014, -0.083); head.add(lid);
      const lm = new THREE.Mesh(new THREE.SphereGeometry(0.0205, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), skin); lm.rotation.x = -Math.PI / 2; lid.add(lm); lids.push(lid);
      const bl = new THREE.Mesh(new THREE.SphereGeometry(0.0205, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), skin); bl.rotation.x = Math.PI / 2 + 0.6; bl.position.copy(lid.position); head.add(bl);   // lower lid
      const br = at(box(0.034, 0.0065, 0.008, hairM), s * 0.037, 0.043, -0.093); br.userData.s = s; br.userData.anim = true; head.add(br); brows.push(br);
    });
    const mouthG = at(new THREE.Group(), 0, -0.056, -0.093); head.add(mouthG);
    const lipM = X.mat({ color: S.lips, shininess: 30 });
    const mouthLine = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0042, 6, 16, Math.PI), lipM); mouthLine.userData.anim = true; mouthG.add(mouthLine);
    const mouthOpen = sph(0.017, new THREE.MeshBasicMaterial({ color: 0x1a0606 }), 12, 8); mouthOpen.scale.set(1.15, 0.2, 0.5); mouthOpen.userData.anim = true; mouthG.add(mouthOpen);
    // --- hair
    const hair = new THREE.Group(); head.add(hair);
    if (S.hairStyle === 'long') {
      const cap = at(new THREE.Mesh(new THREE.SphereGeometry(0.112, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), hairM), 0, 0.012, 0.02); cap.rotation.x = 0.5; cap.scale.set(0.99, 1.18, 1.07); hair.add(cap);
      const back = at(new THREE.Mesh(new THREE.SphereGeometry(0.112, 16, 12, 0, Math.PI, 0, Math.PI), hairM), 0, 0.0, 0.012); back.rotation.y = 0; back.scale.set(1.02, 1.15, 1.08); hair.add(back);
      const fall = at(box(0.2, 0.34, 0.06, hairM), 0, -0.2, 0.07); fall.rotation.x = 0.12; hair.add(fall);
      const fallTip = at(cyl(0.1, 0.07, 0.1, hairM, 12), 0, -0.4, 0.085); fallTip.scale.z = 0.35; hair.add(fallTip);
      [-1, 1].forEach(s => { const lock = at(box(0.03, 0.24, 0.05, hairM), s * 0.1, -0.1, -0.035); lock.rotation.z = s * 0.06; hair.add(lock); });
      const sweep = at(new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.022, 8, 16, Math.PI * 0.75), hairM), 0.005, 0.03, -0.035); sweep.rotation.set(-0.9, 0, 0.35); sweep.scale.set(1.05, 1, 0.9); hair.add(sweep);
    } else if (S.hairStyle === 'crop') {
      const cap = at(new THREE.Mesh(new THREE.SphereGeometry(0.109, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), hairM), 0, 0.018, 0.012); cap.rotation.x = 0.38; cap.scale.set(0.96, 1.12, 1.05); hair.add(cap);
      const nape = at(new THREE.Mesh(new THREE.SphereGeometry(0.108, 16, 10, 0, Math.PI, 0, Math.PI * 0.75), hairM), 0, 0.01, 0.01); nape.rotation.y = 0; nape.scale.set(0.97, 1.1, 1.06); hair.add(nape);
    } else {
      const cap = at(new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), hairM), 0, 0.016, 0.01); cap.rotation.x = 0.38; cap.scale.set(0.97, 1.14, 1.05); hair.add(cap);
      const curls = []; for (let i = 0; i < 26; i++) { const a = i * 2.39996, r = 0.07 + (i % 3) * 0.012, y = 0.08 + Math.sin(i) * 0.012; const g = new THREE.SphereGeometry(0.026, 7, 5); curls.push({ geo: g, matrix: new THREE.Matrix4().makeTranslation(Math.cos(a) * r * 0.95, y + 0.012 + (r < 0.075 ? 0.03 : 0), Math.sin(a) * r * 0.85 + 0.028) }); }
      const cm = new THREE.Mesh(X.merge(curls), hairM); cm.castShadow = true; hair.add(cm);
    }
    if (S.glasses) { const gm = X.mat({ color: 0x8c7a55, shininess: 90 }); [-1, 1].forEach(s => { const rim = at(new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.0022, 6, 18), gm), s * 0.036, 0.013, -0.101); head.add(rim); const arm = at(box(0.002, 0.002, 0.1, gm), s * 0.058, 0.016, -0.055); head.add(arm); });
      head.add(at(box(0.02, 0.0025, 0.0025, gm), 0, 0.017, -0.104)); }
    // --- arms
    const arm = s => {
      const sh = at(new THREE.Group(), s * 0.205 * W, 0.225 * k, 0); chest.add(sh);
      const up = at(cyl(0.05 * W, 0.043 * W, 0.29 * k, jacket), 0, -0.145 * k, 0); sh.add(up);
      const el = at(new THREE.Group(), 0, -0.29 * k, 0); sh.add(el);
      const fo = at(cyl(0.043 * W, 0.037 * W, 0.26 * k, jacket), 0, -0.13 * k, 0); el.add(fo);
      const cuff = at(cyl(0.039 * W, 0.039 * W, 0.03, jacket2), 0, -0.25 * k, 0); el.add(cuff);
      const wr = at(new THREE.Group(), 0, -0.27 * k, 0); el.add(wr);
      const palm = at(box(0.062, 0.085, 0.026, skin), 0, -0.045, 0); wr.add(palm);
      const fing = at(box(0.058, 0.07, 0.022, skin), 0, -0.115, -0.004); fing.rotation.x = -0.25; wr.add(fing);
      const th = at(box(0.018, 0.05, 0.02, skin), -s * 0.035, -0.04, -0.018); th.rotation.z = s * 0.5; wr.add(th);
      return { sh, el, wr, fing };
    };
    const armL = arm(-1), armR = arm(1);
    // --- legs
    const leg = s => {
      const hp = at(new THREE.Group(), s * 0.085 * W, -0.04, 0); hips.add(hp);
      const th = at(cyl(0.075 * W, 0.058 * W, 0.44 * k, pants), 0, -0.22 * k, 0); hp.add(th);
      const kn = at(new THREE.Group(), 0, -0.44 * k, 0); hp.add(kn);
      const sh = at(cyl(0.057 * W, 0.047 * W, 0.41 * k, pants), 0, -0.205 * k, 0); kn.add(sh);
      const an = at(new THREE.Group(), 0, -0.42 * k, 0); kn.add(an);
      const ft = at(box(0.1 * W, 0.075, 0.26, shoe), 0, -0.035, -0.055); an.add(ft);
      const toe = at(cyl(0.05 * W, 0.05 * W, 0.075, shoe, 10), 0, -0.035, -0.18); toe.rotation.z = Math.PI / 2; toe.scale.set(1, 1, 1); an.add(toe);
      return { hp, kn, an };
    };
    const legL = leg(-1), legR = leg(1);
    // --- equipment (period-correct, 2001)
    const gear = new THREE.Group(); root.add(gear);
    const light = new THREE.Group(); armR.wr.add(light); light.position.set(0, -0.08, -0.05);
    const tube = at(cyl(0.02, 0.02, 0.26, M(0x1b1b1d, { shininess: 60 }), 10), 0, 0, 0.07); tube.rotation.x = Math.PI / 2; light.add(tube);
    const headL = at(cyl(0.024, 0.032, 0.06, M(0x1b1b1d, { shininess: 60 }), 12), 0, 0, 0.22); headL.rotation.x = Math.PI / 2; light.add(headL);
    const lens = at(new THREE.Mesh(new THREE.CircleGeometry(0.028, 14), new THREE.MeshBasicMaterial({ color: 0xfff1c8 })), 0, 0, 0.251); light.add(lens);
    if (id === 'mara') { const rec = at(box(0.1, 0.065, 0.03, M(0x2a2a2e)), 0.1 * W, -0.05 * k, -0.125); chest.add(rec); const win = at(box(0.05, 0.025, 0.005, M(0x0d0d10, { shininess: 90 })), 0.1 * W, -0.045 * k, -0.141); chest.add(win);
      const strap = at(box(0.025, 0.5 * k, 0.012, M(0x2b2014)), 0.0, 0.08 * k, -0.126); strap.rotation.z = 0.62; chest.add(strap);
      const scarf = at(new THREE.Mesh(new THREE.TorusGeometry(0.085 * W, 0.035, 8, 16), shirt), 0, 0.26 * k, 0); scarf.rotation.x = Math.PI / 2; chest.add(scarf); }
    if (id === 'gabriel') { const hood = at(new THREE.Mesh(new THREE.TorusGeometry(0.1 * W, 0.045, 8, 14, Math.PI), M(0x6a6a6a, { map: X.fabricTex('#ffffff', 'cloth') })), 0, 0.27 * k, 0.07); hood.rotation.x = Math.PI / 2 + 0.3; hood.rotation.z = Math.PI; chest.add(hood); }
    if (id === 'daniel') { const bag = at(box(0.3, 0.22, 0.08, M(0x5a4430)), -0.2 * W, 0.02, 0.02); bag.rotation.y = 0.1; hips.add(bag); const flap = at(box(0.3, 0.12, 0.085, M(0x4b3826)), -0.2 * W, 0.08, 0.022); hips.add(flap);
      const strap = at(box(0.028, 0.66 * k, 0.012, M(0x3b2c1e)), -0.02, 0.05 * k, -0.123); strap.rotation.z = -0.62; chest.add(strap);
      const cam = at(box(0.11, 0.07, 0.05, M(0x1d1d1f, { shininess: 50 })), 0.02, -0.02 * k, -0.15); chest.add(cam); const lensC = at(cyl(0.025, 0.028, 0.05, M(0x121212, { shininess: 80 }), 12), 0.02, -0.02 * k, -0.18); lensC.rotation.x = Math.PI / 2; chest.add(lensC); }

    // --- state + animation
    const st = { phase: Math.random() * 6, blinkT: 1 + Math.random() * 3, blink: 0, expr: { ...EXPR.neutral }, target: 'neutral', look: null, lookW: 0, action: null, actT: 0, actTarget: null, talk: 0, crouch: 0, speed: 0 };
    const tmp = new V(), tmpQ = new THREE.Quaternion();
    const api = { root, id, head, parts: { eyes, lids, brows, mouthLine, mouthOpen, armL, armR, legL, legR, chest, hips, light },
      setExpr: n => { st.target = EXPR[n] ? n : 'neutral'; },
      lookAt: v => { st.look = v ? v.clone() : null; },
      act: (name, target) => { st.action = name; st.actT = 0; st.actTarget = target ? target.clone() : null; },
      say: ms => { st.talk = ms / 1000; },
      update(dt, ctx = {}) {
        const sp = ctx.speed || 0; st.speed += (sp - st.speed) * Math.min(1, dt * 6); st.crouch += ((ctx.crouch ? 1 : 0) - st.crouch) * Math.min(1, dt * 5);
        // expression blend
        const T = EXPR[st.target]; for (const key in T) st.expr[key] += (T[key] - st.expr[key]) * Math.min(1, dt * 6);
        // gait
        const run = st.speed > 3.2, amp = Math.min(1, st.speed / 2.6) * (run ? 1.25 : 0.8);
        st.phase += dt * (st.speed * (run ? 2.6 : 3.1));
        const sw = Math.sin(st.phase), cw = Math.cos(st.phase);
        legL.hp.rotation.x = sw * 0.55 * amp + st.crouch * 1.25; legR.hp.rotation.x = -sw * 0.55 * amp + st.crouch * 1.25;
        legL.kn.rotation.x = -Math.max(0, -cw) * 0.9 * amp - st.crouch * 2.1; legR.kn.rotation.x = -Math.max(0, cw) * 0.9 * amp - st.crouch * 2.1;
        legL.an.rotation.x = st.crouch * 0.85; legR.an.rotation.x = st.crouch * 0.85;
        hips.position.y = 0.93 * k - st.crouch * 0.36 * k + Math.abs(cw) * 0.025 * amp;
        spine.rotation.x = -(run ? 0.22 : 0.04) * amp - st.crouch * 0.35;
        const breathe = Math.sin(performance.now() / 700) * 0.012; chest.scale.set(1, 1 + breathe, 1 + breathe);
        // arms: swing, or hold the flashlight forward (right), or an action
        let rX = -sw * 0.45 * amp, lX = sw * 0.45 * amp, rEl = 0.25 + amp * 0.3, lEl = 0.2 + amp * 0.35, rZ = 0.05, lZ = -0.05;
        if (ctx.lightOn) { rX = 0.75; rEl = 0.55; rZ = 0.12; }
        st.actT += dt; const a = st.action;
        if (a === 'point' && st.actT < 1.8) { const tgt = st.actTarget; if (tgt) { root.updateWorldMatrix(true, false); tmp.copy(tgt); root.worldToLocal(tmp); const yaw = Math.atan2(-tmp.x, -tmp.z); lX = 1.45; lEl = 0.05; lZ = -0.15 - yaw * 0.6; } }
        else if (a === 'flinch' && st.actT < 0.9) { const f = Math.sin(Math.min(1, st.actT / 0.9) * Math.PI); spine.rotation.x += 0.35 * f; rX = 1.5 * f + rX * (1 - f); lX = 1.5 * f + lX * (1 - f); rEl = 1.9 * f + rEl * (1 - f); lEl = 1.9 * f + lEl * (1 - f); }
        else if (a === 'guard') { rX = 1.1; lX = 1.1; rEl = 1.4; lEl = 1.4; rZ = 0.3; lZ = -0.3; }
        else if (a && st.actT > 2) st.action = null;
        const ease = Math.min(1, dt * 9);
        armR.sh.rotation.x += (rX - armR.sh.rotation.x) * ease; armL.sh.rotation.x += (lX - armL.sh.rotation.x) * ease;
        armR.el.rotation.x += (rEl - armR.el.rotation.x) * ease; armL.el.rotation.x += (lEl - armL.el.rotation.x) * ease;
        armR.sh.rotation.z += (rZ - armR.sh.rotation.z) * ease; armL.sh.rotation.z += (lZ - armL.sh.rotation.z) * ease;
        armL.fing.rotation.x = a === 'point' ? 0 : -0.35;
        root.updateWorldMatrix(true, true); tmp.set(0, 1.25 * k, -6); root.localToWorld(tmp); light.lookAt(tmp); light.visible = !!ctx.lightOn || ctx.carryLight !== false;
        // head look: split between neck and head, eyes lead
        let hy = 0, hx = 0; if (st.look) { root.updateWorldMatrix(true, false); tmp.copy(st.look); root.worldToLocal(tmp); tmp.y -= (1.62 * k - st.crouch * 0.36); const yaw = Math.atan2(-tmp.x, -tmp.z), dist = Math.hypot(tmp.x, tmp.z); hy = Math.max(-1.25, Math.min(1.25, yaw)); hx = Math.max(-0.5, Math.min(0.6, Math.atan2(tmp.y, dist))); }
        const jitter = ctx.afraid ? Math.sin(performance.now() / 45) * 0.02 : 0;
        neck.rotation.y += (hy * 0.4 - neck.rotation.y) * Math.min(1, dt * 5); head.rotation.y += (hy * 0.6 + jitter - head.rotation.y) * Math.min(1, dt * 7);
        head.rotation.x += (-hx * 0.8 - head.rotation.x) * Math.min(1, dt * 6);
        eyes.forEach(e => { e.rotation.y = Math.max(-0.35, Math.min(0.35, (hy - head.rotation.y - neck.rotation.y) * 0.8)); e.rotation.x = Math.max(-0.3, Math.min(0.3, -hx * 0.4)); });
        // blink + lids
        st.blinkT -= dt; if (st.blinkT <= 0) { st.blink = 0.14; st.blinkT = 1.8 + Math.random() * 3.5; }
        if (st.blink > 0) st.blink -= dt; const closed = st.blink > 0 ? 1 : 0; const open = st.expr.lid * (1 - closed);
        lids.forEach(l => { l.rotation.x = 0.3 + open * 1.4; });
        brows.forEach(b => { b.position.y = 0.043 + st.expr.browY; b.rotation.z = -b.userData.s * st.expr.browRot; });
        // mouth: curve (smile/frown) + open; talking flaps it
        if (st.talk > 0) st.talk -= dt; const talkOpen = st.talk > 0 ? (Math.sin(performance.now() / 70) * 0.5 + 0.5) * 0.5 : 0; const mo = Math.max(st.expr.open, talkOpen);
        const c = st.expr.curve; mouthLine.rotation.z = c >= 0 ? Math.PI : 0; mouthLine.scale.set(1, Math.max(0.15, Math.abs(c)) * 0.9, 1); mouthLine.position.y = c >= 0 ? 0.004 : -0.004;
        mouthOpen.scale.set(1.1 - mo * 0.25, 0.15 + mo * 0.95, 0.5); mouthOpen.visible = mo > 0.06; mouthLine.visible = mo < 0.5;
      } };
    root.traverse(o => { if (o.isMesh) { o.receiveShadow = true; } });
    api.baked = X.bake(root, m => !!m.userData.anim);
    return api;
  };
  P.SPECS = SPECS;
})();
