/* GLB character adapter — a production rigged model behind the SAME interface as the procedural rig
   (root, head, update(dt,ctx), setExpr, lookAt, act, say). Supports:
   • Mixamo-style bone names (mixamorigHips/Spine2/Neck/Head/LeftArm/…), with or without the "mixamorig" prefix
   • ARKit-style face blendshapes (eyeBlinkLeft/Right, browInnerUp, browDownLeft/Right, jawOpen, mouthSmileLeft/Right, mouthFrownLeft/Right, eyeWideLeft/Right)
   • animation clips named idle/walk/run/crouch/point/flinch/guard/talk (any missing clip falls back to procedural bone motion)
   Capabilities actually found are recorded in api.caps so missing features are visible, not assumed. */
(function () {
  const G = T13.peopleGLB = {}, V = THREE.Vector3;
  const EXPR = { neutral: {}, concern: { browInnerUp: 0.6, mouthFrownLeft: 0.3, mouthFrownRight: 0.3 }, fear: { browInnerUp: 1, eyeWideLeft: 0.8, eyeWideRight: 0.8, jawOpen: 0.45 }, pain: { browDownLeft: 0.5, browDownRight: 0.5, eyeSquintLeft: 0.7, eyeSquintRight: 0.7, mouthFrownLeft: 0.7, mouthFrownRight: 0.7, jawOpen: 0.2 }, anger: { browDownLeft: 0.9, browDownRight: 0.9, mouthFrownLeft: 0.5, mouthFrownRight: 0.5, noseSneerLeft: 0.4, noseSneerRight: 0.4 } };
  const findBone = (root, name) => { let hit = null; const want = name.toLowerCase(); root.traverse(o => { if (hit) return; const n = (o.name || '').toLowerCase().replace(/^mixamorig[:_]?/, ''); if (n === want) hit = o; }); return hit; };
  G.build = (id, gltf, entry, spec) => {
    const src = gltf.scene, root = new THREE.Group(); root.name = id + '-glb';
    const model = THREE.SkeletonUtils ? THREE.SkeletonUtils.clone(src) : src.clone(true); root.add(model);
    // normalise height to the character spec (feet at y=0)
    model.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(model), h = bb.max.y - bb.min.y || 1; const s = (spec?.h || 1.75) / h; model.scale.setScalar(s); model.position.y = -bb.min.y * s;
    model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = !o.isSkinnedMesh; } });
    const B = n => findBone(model, n);
    const bones = { hips: B('Hips'), spine: B('Spine'), chest: B('Spine2') || B('Spine1'), neck: B('Neck'), head: B('Head'), armL: B('LeftArm'), armR: B('RightArm'), foreL: B('LeftForeArm'), foreR: B('RightForeArm'), handR: B('RightHand'), legL: B('LeftUpLeg'), legR: B('RightUpLeg'), kneeL: B('LeftLeg'), kneeR: B('RightLeg') };
    const base = {}; for (const k in bones) if (bones[k]) base[k] = bones[k].quaternion.clone();
    // morph targets (face)
    const morphs = []; model.traverse(o => { if (o.isMesh && o.morphTargetDictionary) morphs.push(o); });
    const hasMorph = n => morphs.some(m => n in m.morphTargetDictionary);
    const setMorph = (n, v) => morphs.forEach(m => { const i = m.morphTargetDictionary[n]; if (i !== undefined) m.morphTargetInfluences[i] = v; });
    // clips
    const mixer = new THREE.AnimationMixer(model), actions = {};
    (gltf.animations || []).forEach(c => { const key = c.name.toLowerCase().replace(/.*\|/, ''); for (const want of ['idle', 'walk', 'run', 'crouch', 'point', 'flinch', 'guard', 'talk']) if (key.includes(want) && !actions[want]) actions[want] = mixer.clipAction(c); });
    const caps = { bones: Object.keys(bones).filter(k => bones[k]), missingBones: Object.keys(bones).filter(k => !bones[k]), faceMorphs: ['eyeBlinkLeft', 'browInnerUp', 'jawOpen', 'mouthSmileLeft', 'mouthFrownLeft', 'eyeWideLeft'].filter(hasMorph), clips: Object.keys(actions), source: entry?.status || 'unknown' };
    let cur = null; const play = (name, fade = 0.25) => { const a = actions[name]; if (!a || cur === a) return !!a; a.reset().fadeIn(fade).play(); if (cur) cur.fadeOut(fade); cur = a; return true; };
    // flashlight in the right hand
    const light = new THREE.Group(); const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.26, 10), T13.gfx.mat({ color: 0x1b1b1d, shininess: 60 })); tube.rotation.x = Math.PI / 2; tube.position.z = 0.07; light.add(tube);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.028, 14), new THREE.MeshBasicMaterial({ color: 0xfff1c8 })); lens.position.z = 0.201; light.add(lens);
    if (bones.handR) { bones.handR.add(light); light.scale.setScalar(1 / s); } else root.add(light);
    const st = { expr: 'neutral', w: {}, look: null, blinkT: 2, blink: 0, talk: 0, action: null, actT: 0, target: null, phase: 0, speed: 0 };
    const tmp = new V(), q1 = new THREE.Quaternion(), e1 = new THREE.Euler();
    const api = { root, id, head: bones.head || root, caps, glb: true,
      setExpr: n => { st.expr = EXPR[n] ? n : 'neutral'; }, lookAt: v => { st.look = v ? v.clone() : null; },
      act: (name, target) => { st.action = name; st.actT = 0; st.target = target ? target.clone() : null; if (!play(name, 0.15)) { /* procedural fallback below */ } },
      say: ms => { st.talk = ms / 1000; },
      update(dt, ctx = {}) {
        mixer.update(dt); st.speed += ((ctx.speed || 0) - st.speed) * Math.min(1, dt * 6); st.actT += dt; if (st.action && st.actT > 1.8) st.action = null;
        const loco = ctx.crouch ? 'crouch' : st.speed > 3.2 ? 'run' : st.speed > 0.3 ? 'walk' : 'idle';
        const clipped = !st.action && play(loco);
        if (!clipped && !st.action) { // procedural locomotion on the bones when the asset ships no clips
          st.phase += dt * st.speed * 3; const sw = Math.sin(st.phase) * Math.min(1, st.speed / 2.6) * 0.5;
          const rot = (k, x, y = 0, z = 0) => { if (!bones[k]) return; e1.set(x, y, z); q1.setFromEuler(e1); bones[k].quaternion.copy(base[k]).multiply(q1); };
          rot('legL', sw); rot('legR', -sw); rot('kneeL', -Math.max(0, -Math.cos(st.phase)) * 0.8 * Math.min(1, st.speed / 2.6)); rot('kneeR', -Math.max(0, Math.cos(st.phase)) * 0.8 * Math.min(1, st.speed / 2.6));
          rot('armL', -sw * 0.8); rot('armR', ctx.lightOn ? 0.9 : sw * 0.8);
        }
        // head look (additive on top of any clip)
        if (bones.head && st.look) { root.updateWorldMatrix(true, false); tmp.copy(st.look); root.worldToLocal(tmp); const yaw = Math.max(-1.1, Math.min(1.1, Math.atan2(-tmp.x, -tmp.z))), pitch = Math.max(-0.5, Math.min(0.5, Math.atan2(tmp.y - 1.6, Math.hypot(tmp.x, tmp.z)))); e1.set(-pitch * 0.7, yaw * 0.6, 0); q1.setFromEuler(e1); bones.head.quaternion.multiply(q1); if (bones.neck) { e1.set(0, yaw * 0.35, 0); q1.setFromEuler(e1); bones.neck.quaternion.multiply(q1); } }
        // face
        const E = EXPR[st.expr] || {}; const keys = new Set([...Object.keys(E), ...Object.keys(st.w)]); keys.forEach(k => { st.w[k] = (st.w[k] || 0) + ((E[k] || 0) - (st.w[k] || 0)) * Math.min(1, dt * 6); setMorph(k, st.w[k]); });
        st.blinkT -= dt; if (st.blinkT <= 0) { st.blink = 0.14; st.blinkT = 1.8 + Math.random() * 3.5; } if (st.blink > 0) st.blink -= dt; setMorph('eyeBlinkLeft', st.blink > 0 ? 1 : 0); setMorph('eyeBlinkRight', st.blink > 0 ? 1 : 0);
        if (st.talk > 0) { st.talk -= dt; setMorph('jawOpen', Math.max(E.jawOpen || 0, (Math.sin(performance.now() / 70) * 0.5 + 0.5) * 0.4)); }
        root.updateWorldMatrix(true, true); tmp.set(0, 1.25, -6); root.localToWorld(tmp); light.lookAt(tmp); light.visible = !!ctx.lightOn || ctx.carryLight !== false;
      } };
    return api;
  };
})();
