/* THIRTEEN asset pipeline: manifest (with provenance) → GLTFLoader + Draco + Meshopt + KTX2 → adapters.
   Missing or failed assets fall back to the procedural builders and are REPORTED (T13.assets.report), never hidden. */
(function () {
  const A = T13.assets = { manifest: null, report: [], loader: null, ktx2: null, cache: new Map() };
  const note = (level, msg, extra) => { A.report.push({ t: Math.round(performance.now()), level, msg, ...(extra || {}) }); (level === 'error' ? console.warn : console.log)('[assets]', msg); };
  A.init = async (renderer) => {
    if (A.loader) return A;
    try { A.manifest = await (await fetch('assets/manifest.json', { cache: 'no-cache' })).json(); } catch (e) { A.manifest = { characters: {} }; note('error', 'manifest missing — every asset falls back', { err: String(e) }); }
    const L = new THREE.GLTFLoader();
    try { const d = new THREE.DRACOLoader(); d.setDecoderPath('vendor/draco/'); L.setDRACOLoader(d); } catch (e) { note('error', 'Draco unavailable', { err: String(e) }); }
    try { if (window.MeshoptDecoder) L.setMeshoptDecoder(window.MeshoptDecoder); } catch (e) { note('error', 'Meshopt unavailable', { err: String(e) }); }
    try { const m = await import('../vendor/jsm/loaders/KTX2Loader.js'); A.ktx2 = new m.KTX2Loader().setTranscoderPath('vendor/basis/').detectSupport(renderer); L.setKTX2Loader(A.ktx2); } catch (e) { note('warn', 'KTX2 unavailable (textures load uncompressed)', { err: String(e) }); }
    A.loader = L; return A;
  };
  A.entry = (group, id) => (A.manifest?.[group] || {})[id] || null;
  /* load a GLB by manifest id; resolves {gltf, entry} or null (with a report line) */
  A.load = async (group, id) => {
    const e = A.entry(group, id); if (!e) { note('warn', `${group}/${id}: not in manifest`); return null; }
    if (e.status === 'missing') { note('warn', `${group}/${id}: MISSING asset — procedural fallback in use`, { status: 'missing' }); return null; }
    if (A.cache.has(e.url)) return { gltf: A.cache.get(e.url), entry: e };
    const t0 = performance.now();
    try { const gltf = await new Promise((res, rej) => A.loader.load(e.url, res, undefined, rej)); A.cache.set(e.url, gltf);
      const tex = A.audit(gltf.scene); note('info', `${group}/${id}: loaded (${e.status}) in ${Math.round(performance.now() - t0)} ms`, { status: e.status, ...tex }); return { gltf, entry: e }; }
    catch (err) { note('error', `${group}/${id}: FAILED to load — procedural fallback in use`, { err: String(err && err.message || err) }); return null; }
  };
  /* texture memory audit: GPU bytes are width×height×4 (×1.33 with mips) for uncompressed; compressed formats are ~1 byte/px or less */
  A.audit = (root) => { const seen = new Set(); let bytes = 0, count = 0, largest = 0, tris = 0;
    root.traverse(o => { if (o.isMesh) { const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; const ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach(m => ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'].forEach(k => { const t = m && m[k]; if (!t || seen.has(t)) return; seen.add(t); count++; const img = t.image || (t.mipmaps && t.mipmaps[0]) || {}; const w = img.width || 0, h = img.height || 0; largest = Math.max(largest, w, h); bytes += t.isCompressedTexture ? w * h * 1.33 : w * h * 4 * 1.33; })); } });
    return { textures: count, gpuTexMB: +(bytes / 1048576).toFixed(1), largestTex: largest, triangles: Math.round(tris) }; };
})();
