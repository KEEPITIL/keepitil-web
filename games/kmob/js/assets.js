/* KMOB production asset loader v2: authored GLB characters swap in part by part at runtime.
   - geometry + materials: base colour (texture atlas or flat), normal map, emissive map, metalness/roughness → cel metal
   - validation per part: geometry present, finite vertices, triangle budget, scale/pivot/orientation vs the reference part
   - authored animation clips (idle, run, attack_01 …) baked onto the shared skeleton; procedural clips remain as fallback
   - several files (assets/characters/<faction>/<unit>/*.glb) listed in assets/manifest.json; failures never break the game
   Contract: docs/CHARACTER-ASSET-SPEC.md */
(function (G) {
  const KM = G.KM;
  // Near-LOD budgets (triangles). A whole standard near unit ≈ legs×2 + torso + head + arms×2 + weapon ≤ ~3,000.
  KM.PART_BUDGET = { leg: 450, torso: 900, head: 1100, arm: 400, weapon: 500, shield: 400, other: 600, hero: 6000 };
  const kindOf = k => /^l[A-Z]/.test(k) ? 'leg' : /^t[A-Z]/.test(k) ? 'torso' : /^h[A-Z]/.test(k) ? 'head' : /^a[A-Z]/.test(k) ? 'arm' : k === 'shield' ? 'shield' : ['sword', 'swordGold', 'dagger', 'axe', 'bow', 'staff', 'bomb', 'claws', 'rock', 'spear', 'xbow', 'musket', 'rifle', 'pulse', 'sack', 'medkit', 'medkit2', 'medkit3'].includes(k) ? 'weapon' : k === 'cannon' ? 'hero' : 'other';
  KM.budgetFor = k => KM.PART_BUDGET[kindOf(k)];
  KM.TEX_MAX = 2048;   // largest atlas edge accepted on mobile (bigger images are downscaled)
  // authored clip name → skeleton clip it replaces (additive hits map onto the reaction layers)
  KM.CLIP_MAP = { idle: 'idle', walk: 'run', run: 'run', sprint: 'sprint', attack_01: 'attackA', attack_02: 'attackB', heavy_attack: 'heavy', ranged_aim: 'aim', ranged_fire: 'fire', cast: 'cast', shield_block: 'brace', cheer: 'cheer', death_01: 'deathA', death_02: 'deathB', death_heavy: 'deathHeavy', hit_01: '+hitFront', hit_02: '+hitLeft', hit_03: '+hitRight', stagger: '+stagger', knockback: '+stagger' };
  KM.RIG_BONES = ['hips', 'torso', 'head', 'armL', 'armR', 'legL', 'legR'];

  const texCache = new Map();
  function fitTexture(t, report) {
    if (!t || !t.image) return t; if (texCache.has(t.uuid)) return texCache.get(t.uuid);
    const img = t.image, w = img.width || 0, h = img.height || 0;
    if (Math.max(w, h) > KM.TEX_MAX && typeof document !== 'undefined') {          // downscale oversize atlases for mobile memory
      const k = KM.TEX_MAX / Math.max(w, h), c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      t.image = c; t.needsUpdate = true; report.warnings.push(`texture ${w}x${h} downscaled to ${c.width}x${c.height}`);
    }
    t.anisotropy = 1; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; texCache.set(t.uuid, t);
    report.textures.add(t.uuid); report.texBytes += (t.image.width || 0) * (t.image.height || 0) * 4 * 1.33;
    return t;
  }

  // Convert one glTF node into a single kit geometry (+ the textures it uses).
  function nodeToGeometry(node, report) {
    const parts = [], maps = { map: null, normalMap: null, emissiveMap: null }; let hasUV = false;
    node.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
    node.traverse(o => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); if (!g.attributes.normal) g.computeVertexNormals();
      const groups = g.groups.length ? g.groups : [{ start: 0, count: g.attributes.position.count, materialIndex: 0 }];
      for (const gr of groups) {
        const m = mats[gr.materialIndex || 0] || {}, sub = new THREE.BufferGeometry(), n = gr.count;
        for (const a of ['position', 'normal']) { const src = g.attributes[a]; sub.setAttribute(a, new THREE.BufferAttribute(src.array.slice(gr.start * src.itemSize, (gr.start + n) * src.itemSize), src.itemSize)); }
        const uvSrc = g.attributes.uv, uv = new Float32Array(n * 2); if (uvSrc) { hasUV = true; uv.set(uvSrc.array.slice(gr.start * 2, (gr.start + n) * 2)); } sub.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        for (const k of Object.keys(maps)) if (m[k]) { if (maps[k] && maps[k].uuid !== m[k].uuid && maps[k].image !== m[k].image) report.warnings.push(`${node.name}: several ${k} textures in one part (use the shared atlas); first one kept`); maps[k] = maps[k] || m[k]; }
        const textured = !!m.map, base = textured ? new THREE.Color(1, 1, 1).multiply(m.color || new THREE.Color(1, 1, 1)) : (m.color || new THREE.Color(1, 1, 1)), vc = g.attributes.color;
        const tint = /^tint/i.test(m.name || '') ? 1 : 0, metal = Math.max(0, Math.min(1, (m.metalness || 0) * (1 - 0.5 * (m.roughness == null ? 1 : m.roughness))));
        const col = new Float32Array(n * 3), tin = new Float32Array(n).fill(tint), met = new Float32Array(n).fill(metal);
        for (let k = 0; k < n; k++) { const s0 = vc ? vc.getX(gr.start + k) : 1, s1 = vc ? vc.getY(gr.start + k) : 1, s2 = vc ? vc.getZ(gr.start + k) : 1; col[k * 3] = base.r * s0; col[k * 3 + 1] = base.g * s1; col[k * 3 + 2] = base.b * s2; }
        sub.setAttribute('color', new THREE.BufferAttribute(col, 3)); sub.setAttribute('aTint', new THREE.BufferAttribute(tin, 1)); sub.setAttribute('aMetal', new THREE.BufferAttribute(met, 1)); parts.push(sub);
      }
    });
    if (!parts.length) return null;
    const out = new THREE.BufferGeometry();
    for (const a of ['position', 'normal', 'uv', 'color', 'aTint', 'aMetal']) { const sz = parts[0].attributes[a].itemSize; let len = 0; for (const p of parts) len += p.attributes[a].array.length; const arr = new Float32Array(len); let o = 0; for (const p of parts) { arr.set(p.attributes[a].array, o); o += p.attributes[a].array.length; } out.setAttribute(a, new THREE.BufferAttribute(arr, sz)); }
    out.computeBoundingBox(); out.computeBoundingSphere(); return { geo: out, maps, hasUV };
  }

  // Scale / pivot / orientation check against the reference (procedural) part on the same bone.
  function compareToReference(geo, ref) {
    if (!ref) return null; if (!ref.boundingBox) ref.computeBoundingBox();
    const a = geo.boundingBox, b = ref.boundingBox; if (!a || !b) return null;
    const sa = a.getSize(new THREE.Vector3()), sb = b.getSize(new THREE.Vector3()), ca = a.getCenter(new THREE.Vector3()), cb = b.getCenter(new THREE.Vector3());
    const ratio = [sa.x / Math.max(sb.x, 0.02), sa.y / Math.max(sb.y, 0.02), sa.z / Math.max(sb.z, 0.02)], dist = ca.distanceTo(cb), refSize = Math.max(sb.x, sb.y, sb.z);
    const scaleBad = ratio.some(r => r < 0.35 || r > 2.8), pivotBad = dist > Math.max(0.25, refSize * 0.6);
    // orientation: a part rotated 90° swaps its long axis; flag when the longest axis differs and the shape is elongated
    const ax = v => [v.x, v.y, v.z].indexOf(Math.max(v.x, v.y, v.z)), elong = v => Math.max(v.x, v.y, v.z) / Math.max(0.01, Math.min(v.x, v.y, v.z));
    const orientBad = ax(sa) !== ax(sb) && elong(sb) > 2.2 && elong(sa) > 2.2;
    return { scaleBad, pivotBad, orientBad, ratio: ratio.map(r => +r.toFixed(2)), offset: +dist.toFixed(2) };
  }

  // Bake an authored clip (tracks on rig nodes hips/torso/head/armL/armR/legL/legR) into skeleton pose frames.
  function bakeClip(clip, rigRoot) {
    const A = KM.ANIM, I = A.I, fps = 30, N = Math.max(2, Math.ceil(clip.duration * fps) + 1), frames = new Float32Array(N * A.P);
    const nodes = {}; for (const b of KM.RIG_BONES) { const o = rigRoot.getObjectByName(b); if (o) nodes[b] = o; }
    if (!nodes.torso && !nodes.armR && !nodes.legL) return null;
    const rest = {}; for (const b in nodes) rest[b] = { q: nodes[b].quaternion.clone(), p: nodes[b].position.clone() };
    const mixer = new THREE.AnimationMixer(rigRoot), act = mixer.clipAction(clip); act.play(); const e = new THREE.Euler(), dq = new THREE.Quaternion();
    for (let f = 0; f < N; f++) {
      mixer.setTime(Math.min(clip.duration, f / fps)); const o = f * A.P;
      const rot = b => { if (!nodes[b]) return null; dq.copy(rest[b].q).invert().multiply(nodes[b].quaternion); e.setFromQuaternion(dq, 'YXZ'); return e; };
      let r;
      if ((r = rot('hips'))) { frames[o + I.rootP] = r.x; frames[o + I.rootY] = r.y; frames[o + I.rootR] = r.z; frames[o + I.y] = nodes.hips.position.y - rest.hips.p.y; }
      if ((r = rot('torso'))) { frames[o + I.torsoP] = r.x; frames[o + I.torsoY] = r.y; frames[o + I.torsoR] = r.z; }
      if ((r = rot('head'))) { frames[o + I.headP] = r.x; frames[o + I.headY] = r.y; }
      if ((r = rot('armL'))) { frames[o + I.armLP] = r.x; frames[o + I.armLR] = r.z; }
      if ((r = rot('armR'))) { frames[o + I.armRP] = r.x; frames[o + I.armRY] = r.y; frames[o + I.armRR] = r.z; }
      if ((r = rot('legL'))) frames[o + I.legLP] = r.x;
      if ((r = rot('legR'))) frames[o + I.legRP] = r.x;
    }
    for (const b in nodes) { nodes[b].quaternion.copy(rest[b].q); nodes[b].position.copy(rest[b].p); }
    act.stop(); mixer.uncacheRoot(rigRoot);
    for (let k = 0; k < frames.length; k++) if (!Number.isFinite(frames[k])) return null;
    return { frames, N, duration: clip.duration, fps };
  }

  // Validate + apply an already-parsed glTF (scene + animations) to the renderer.
  KM.applyCharacterScene = function (render, scene, src, animations) {
    const report = { src, replaced: [], rejected: [], flags: [], missing: [], unknown: [], warnings: [], clips: [], parts: {}, textures: new Set(), texBytes: 0 }, known = render.partM, seen = new Set();
    const isPart = n => n in known && !n.startsWith('S_') && !n.startsWith('m_') && !n.startsWith('F_');
    scene.traverse(o => {
      if (!o.name || seen.has(o.name) || o === scene) return;
      if (!isPart(o.name)) { if ((o.isMesh || o.children.length) && !KM.RIG_BONES.includes(o.name) && !/_(tint|base|mesh)$/.test(o.name) && o.name !== 'rig') report.unknown.push(o.name); return; }
      seen.add(o.name);
      let r = null; try { r = nodeToGeometry(o, report); } catch (e) { report.rejected.push({ part: o.name, why: 'convert: ' + e.message }); return; }
      if (!r) { report.rejected.push({ part: o.name, why: 'no geometry' }); return; }
      const g = r.geo, tris = g.attributes.position.count / 3, max = KM.budgetFor(o.name);
      if (!(tris > 0) || !g.attributes.position.array.every(Number.isFinite)) { report.rejected.push({ part: o.name, why: 'invalid vertices (NaN/Infinity)' }); g.dispose(); return; }
      // policy: warn, don't refuse — only technically invalid data (empty / NaN) is refused; budget and fit problems load with a flag
      if (tris > max) report.flags.push({ part: o.name, level: 'FAIL', why: `over budget ${tris | 0} > ${max} tris` });
      const cmp = compareToReference(g, render.kit.refParts && render.kit.refParts[o.name] ? render.kit.refParts[o.name] : render.kit.parts[o.name]);
      if (cmp && cmp.scaleBad) report.flags.push({ part: o.name, level: 'WARN', why: `scale ${cmp.ratio.join('/')} × reference` });
      if (cmp && cmp.pivotBad) report.flags.push({ part: o.name, level: 'WARN', why: `pivot off by ${cmp.offset} m` });
      if (cmp && cmp.orientBad) { report.flags.push({ part: o.name, level: 'WARN', why: 'orientation: long axis differs from the reference (+Z forward, +Y up)' }); report.warnings.push(`${o.name}: long axis differs from the reference (check orientation: +Z forward, +Y up)`); }
      const im = known[o.name], old = im.geometry; im.geometry = g;
      if (r.maps.map || r.maps.normalMap || r.maps.emissiveMap) {
        const opt = {}; for (const k of ['map', 'normalMap', 'emissiveMap']) if (r.maps[k]) opt[k] = fitTexture(r.maps[k], report);
        if (opt.emissiveMap) opt.emissive = new THREE.Color(1, 1, 1);
        if (opt.map && !r.hasUV) report.warnings.push(`${o.name}: textured but has no UVs`);
        const om = im.material; im.material = KM.toonMat(opt); if (om && om.dispose) om.dispose();
      }
      if (!render.kit.refParts) render.kit.refParts = {};
      if (!render.kit.refParts[o.name]) render.kit.refParts[o.name] = old; else old.dispose();   // keep the procedural part as reference/fallback
      render.kit.parts[o.name] = g; report.replaced.push({ part: o.name, tris: tris | 0, textured: !!r.maps.map });
      const img = r.maps.map && r.maps.map.image; report.parts[o.name] = { tris: tris | 0, budget: max, cmp, textured: !!r.maps.map, tex: img ? [img.width | 0, img.height | 0] : null, materials: 1 };
    });
    // authored animation clips → skeleton overrides
    const rig = scene.getObjectByName('rig') || scene;
    for (const clip of animations || []) {
      const target = KM.CLIP_MAP[clip.name]; if (!target) { report.warnings.push(`clip "${clip.name}" has no mapping (see KM.CLIP_MAP)`); continue; }
      const baked = bakeClip(clip, rig); if (!baked) { report.rejected.push({ part: 'clip:' + clip.name, why: 'no rig bones animated or invalid values' }); continue; }
      KM.ANIM.override(target, baked); report.clips.push({ clip: clip.name, as: target, frames: baked.N });
    }
    const recipeParts = new Set(); for (const r of Object.values(KM.RECIPE)) for (const k of ['torso', 'head', 'arm', 'leg', 'wpn']) if (r[k]) recipeParts.add(r[k]);
    report.missing = [...recipeParts].filter(k => !report.replaced.some(x => x.part === k));
    report.textures = report.textures.size; report.texMB = +(report.texBytes / 1e6).toFixed(1); delete report.texBytes;
    return report;
  };

  const emptyReport = (src, extra) => Object.assign({ src, replaced: [], rejected: [], flags: [], parts: {}, missing: [], unknown: [], warnings: [], clips: [] }, extra);
  KM.compareToReference = compareToReference;
  const mergeReports = (a, b) => { a.parts = Object.assign(a.parts || {}, b.parts || {}); for (const k of ['replaced', 'rejected', 'flags', 'unknown', 'warnings', 'clips']) a[k] = a[k].concat(b[k] || []); if (b.missing) a.missing = b.missing; a.textures = (a.textures || 0) + (b.textures || 0); a.texMB = +((a.texMB || 0) + (b.texMB || 0)).toFixed(1); if (b.error) a.errors.push({ src: b.src, error: b.error }); return a; };
  // Load the manifest → one or more GLBs (applied in order; later files override earlier parts). Never throws.
  KM.loadCharacterAssets = function (render, base) {
    base = base || 'assets/';
    const done = r => { KM.assetReport = r; if (r.replaced && r.replaced.length) console.info('[kmob] authored parts:', r.replaced.length, 'fallback:', r.missing.length, r); return r; };
    const one = file => new Promise(res => {
      if (!THREE.GLTFLoader) return res(emptyReport(file, { error: 'GLTFLoader unavailable' }));
      new THREE.GLTFLoader().load(base + file, gltf => { try { res(KM.applyCharacterScene(render, gltf.scene, file, gltf.animations)); } catch (e) { res(emptyReport(file, { error: e.message })); } },
        undefined, err => res(emptyReport(file, { error: err && err.message ? err.message : (err && err.target && err.target.status ? 'HTTP ' + err.target.status : 'load failed (missing file or network error)') })));
    });
    const chain = fetch(base + 'manifest.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : { characters: null }).catch(() => ({ characters: null }))
      .then(man => {
        const raw = !man || !man.characters ? [] : Array.isArray(man.characters) ? man.characters : [man.characters];
        const list = raw.filter(x => typeof x === 'string' && /^[\w\-./]+\.glb$/i.test(x) && !x.includes('..'));
        if (!list.length) return done(emptyReport(null, { procedural: true }));
        // the GLTF loader is fetched only when production characters actually exist (keeps the first load small)
        if (!THREE.GLTFLoader && KM.loadScripts) return KM.loadScripts([(base.replace(/assets\/?$/, '') || '') + 'vendor/loaders/GLTFLoader.js']).catch(() => null).then(() => go(list));
        return go(list);
      });
    const go = list => {
        return list.reduce((pr, f) => pr.then(acc => one(f).then(r => mergeReports(acc, r))), Promise.resolve(emptyReport(list.join(','), { errors: [], textures: 0, texMB: 0 })))
          .then(acc => { if (acc.errors.length && !acc.replaced.length) acc.error = acc.errors.map(e => e.error).join('; '); return done(acc); });
    };
    return chain;
  };
})(window);
