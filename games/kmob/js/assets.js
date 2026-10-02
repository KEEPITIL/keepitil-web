/* KMOB production asset loader — swaps code-built character parts for authored GLB meshes at runtime.
   The game always starts on the procedural kit; authored parts replace it piece by piece as they load, and any part
   that is missing, empty, over budget or broken simply keeps its procedural fallback (reported in KM.assetReport).
   Contract (docs/CHARACTER-ASSET-SPEC.md): one mesh node per part key (tLight, hBlue, aStd, lStd, sword, …), modelled in
   that bone's local space with its origin on the pivot; materials whose name starts with "tint" take the faction
   colour per instance; everything else keeps its own base colour. */
(function (G) {
  const KM = G.KM;
  KM.PART_BUDGET = { default: 900, torso: 1200, head: 1200 };   // max triangles per authored part (near-LOD)
  const budgetFor = k => k[0] === 't' ? KM.PART_BUDGET.torso : k[0] === 'h' ? KM.PART_BUDGET.head : KM.PART_BUDGET.default;

  // Convert one glTF node (any number of primitives / child meshes) into a single kit geometry.
  function nodeToGeometry(node) {
    const parts = []; node.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
    node.traverse(o => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      if (!g.attributes.normal) g.computeVertexNormals();
      const groups = g.groups.length ? g.groups : [{ start: 0, count: g.attributes.position.count, materialIndex: 0 }];
      for (const gr of groups) {
        const m = mats[gr.materialIndex || 0] || {}, sub = new THREE.BufferGeometry();
        for (const a of ['position', 'normal']) { const src = g.attributes[a]; sub.setAttribute(a, new THREE.BufferAttribute(src.array.slice(gr.start * src.itemSize, (gr.start + gr.count) * src.itemSize), src.itemSize)); }
        const n = gr.count, col = new Float32Array(n * 3), tin = new Float32Array(n), base = m.color || new THREE.Color(1, 1, 1), vc = g.attributes.color, tint = /^tint/i.test(m.name || '') ? 1 : 0;
        for (let k = 0; k < n; k++) { const s = vc ? [vc.getX(gr.start + k), vc.getY(gr.start + k), vc.getZ(gr.start + k)] : [1, 1, 1]; col[k * 3] = base.r * s[0]; col[k * 3 + 1] = base.g * s[1]; col[k * 3 + 2] = base.b * s[2]; tin[k] = tint; }
        sub.setAttribute('color', new THREE.BufferAttribute(col, 3)); sub.setAttribute('aTint', new THREE.BufferAttribute(tin, 1)); parts.push(sub);
      }
    });
    if (!parts.length) return null;
    const out = new THREE.BufferGeometry();
    for (const a of ['position', 'normal', 'color', 'aTint']) { const sz = parts[0].attributes[a].itemSize; let len = 0; for (const p of parts) len += p.attributes[a].array.length; const arr = new Float32Array(len); let o = 0; for (const p of parts) { arr.set(p.attributes[a].array, o); o += p.attributes[a].array.length; } out.setAttribute(a, new THREE.BufferAttribute(arr, sz)); }
    out.computeBoundingSphere(); return out;
  }

  // Validate + apply an already-parsed glTF scene to the renderer's instanced part meshes.
  KM.applyCharacterScene = function (render, scene, src) {
    const report = { src, replaced: [], rejected: [], missing: [], unknown: [] }, known = render.partM;
    const seen = new Set();
    scene.traverse(o => {
      if (!o.name || seen.has(o.name) || o === scene) return;
      if (!(o.name in known) || o.name.startsWith('S_')) { if (o.isMesh || o.children.length) report.unknown.push(o.name); return; }
      seen.add(o.name);
      let g = null; try { g = nodeToGeometry(o); } catch (e) { report.rejected.push({ part: o.name, why: 'convert: ' + e.message }); return; }
      if (!g) { report.rejected.push({ part: o.name, why: 'no geometry' }); return; }
      const tris = g.attributes.position.count / 3, max = budgetFor(o.name);
      if (!(tris > 0) || ![...g.attributes.position.array.slice(0, 300)].every(Number.isFinite)) { report.rejected.push({ part: o.name, why: 'invalid vertices' }); g.dispose(); return; }
      if (tris > max) { report.rejected.push({ part: o.name, why: `over budget ${tris | 0} > ${max} tris` }); g.dispose(); return; }
      const im = known[o.name], old = im.geometry; im.geometry = g; if (old !== g && !render.kit.statues[o.name]) old.dispose();
      render.kit.parts[o.name] = g; report.replaced.push({ part: o.name, tris: tris | 0 });
    });
    const recipeParts = new Set(); for (const r of Object.values(KM.RECIPE)) for (const k of ['torso', 'head', 'arm', 'leg', 'wpn']) if (r[k]) recipeParts.add(r[k]);
    report.missing = [...recipeParts].filter(k => !report.replaced.some(x => x.part === k));
    return report;
  };

  // Load the manifest → GLB. Never throws; resolves with a report (fallback = procedural kit stays).
  KM.loadCharacterAssets = function (render, base) {
    base = base || 'assets/';
    const done = r => { KM.assetReport = r; if (r.replaced && r.replaced.length) console.info('[kmob] authored parts:', r.replaced.length, 'fallback:', r.missing.length); return r; };
    return fetch(base + 'manifest.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : { characters: null }).catch(() => ({ characters: null }))
      .then(man => {
        if (!man || !man.characters) return done({ src: null, procedural: true, replaced: [], rejected: [], missing: [], unknown: [] });
        if (!THREE.GLTFLoader) return done({ src: man.characters, error: 'GLTFLoader unavailable', replaced: [], rejected: [], missing: [], unknown: [] });
        return new Promise(res => new THREE.GLTFLoader().load(base + man.characters, gltf => { try { res(done(KM.applyCharacterScene(render, gltf.scene, man.characters))); } catch (e) { res(done({ src: man.characters, error: e.message, replaced: [], rejected: [], missing: [], unknown: [] })); } },
          undefined, err => res(done({ src: man.characters, error: err && err.message ? err.message : (err && err.target && err.target.status ? 'HTTP ' + err.target.status : 'load failed (missing file or network error)'), replaced: [], rejected: [], missing: [], unknown: [] }))));
      });
  };
})(window);
