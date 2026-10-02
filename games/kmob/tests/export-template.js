/* Exports the procedural kit as a GLB template for character artists (each part = one named node on its pivot,
   tinted surfaces use materials named "tint_*"). Also used by tests to build fixtures.
   Run: PW=<playwright> node tests/export-template.js assets/template/kmob-parts-template.glb [part,part,...] */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PW || 'playwright');
const ROOT = path.join(__dirname, '..'), out = process.argv[2] || path.join(ROOT, 'assets/template/kmob-parts-template.glb'), only = process.argv[3] ? process.argv[3].split(',') : null;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); const p = await b.newPage();
  await p.goto(`http://127.0.0.1:${srv.address().port}/dev/lineup.html?kinds=soldier`); await p.addScriptTag({ path: path.join(__dirname, 'vendor/GLTFExporter.js') });
  const b64 = await p.evaluate(async only => {
    const kit = KM.buildKit(), scene = new THREE.Scene(); let x = 0;
    for (const [k, g] of Object.entries(kit.parts)) {
      if (only && !only.includes(k)) continue; if (k.startsWith('m_')) continue;      // lean mid-LOD parts stay procedural
      const tint = g.attributes.aTint.array, col = g.attributes.color.array, n = g.attributes.position.count;
      // split into a tinted and a non-tinted primitive so the material-name contract is visible to the artist
      const node = new THREE.Group(); node.name = k; node.position.x = 0; scene.add(node);
      for (const want of [1, 0]) {
        const idx = []; for (let i = 0; i < n; i++) if ((tint[i] > 0.5 ? 1 : 0) === want) idx.push(i); if (!idx.length) continue;
        const sub = new THREE.BufferGeometry(), pick = (src, sz) => { const a = new Float32Array(idx.length * sz); idx.forEach((v, j) => { for (let c = 0; c < sz; c++) a[j * sz + c] = src[v * sz + c]; }); return a; };
        sub.setAttribute('position', new THREE.BufferAttribute(pick(g.attributes.position.array, 3), 3)); sub.setAttribute('normal', new THREE.BufferAttribute(pick(g.attributes.normal.array, 3), 3)); sub.setAttribute('color', new THREE.BufferAttribute(pick(col, 3), 3));
        const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }); m.name = want ? 'tint_faction' : 'base';
        const mesh = new THREE.Mesh(sub, m); mesh.name = k + (want ? '_tint' : '_base'); node.add(mesh);
      }
      x++;
    }
    // reference rig (empties) + every procedural clip exported under its authored name, so the artist can retime/replace
    const R = KM.RIG.std, rig = new THREE.Group(); rig.name = 'rig'; scene.add(rig);
    const bone = (name, parent, x, y, z) => { const b = new THREE.Object3D(); b.name = name; b.position.set(x, y, z); parent.add(b); return b; };
    const hips = bone('hips', rig, 0, 0, 0), torso = bone('torso', hips, 0, R.torso, 0); bone('head', torso, 0, R.neck, 0); bone('armL', torso, -R.shoulder[0], R.shoulder[1], 0); bone('armR', torso, R.shoulder[0], R.shoulder[1], 0); bone('legL', hips, -R.hip[0], R.hip[1], 0); bone('legR', hips, R.hip[0], R.hip[1], 0);
    const A = KM.ANIM, I = A.I, inv = {}; for (const [k, v] of Object.entries(KM.CLIP_MAP)) if (!inv[v] && v[0] !== '+') inv[v] = k;
    const v = { seed: 0.4, seed2: 0.3, amp: 1, lean: 0, tempo: 1 }, pose = new Float32Array(A.P), q = new THREE.Quaternion(), e = new THREE.Euler();
    const anims = [];
    for (const [clipName, authored] of Object.entries(inv)) {
      const c = A.CLIPS[clipName]; if (!c) continue; const dur = c.loop ? 0.8 : c.dur, N = Math.ceil(dur * 30) + 1, times = [], tr = { hips: [], torso: [], head: [], armL: [], armR: [], legL: [], legR: [] }, hipsY = [];
      for (let f = 0; f < N; f++) { const t = f / 30; times.push(t); A.sample(A.ID[clipName], c.loop ? (t / dur) * Math.PI * 2 : t / dur, v, pose);
        const put = (b, x, y, z) => { q.setFromEuler(e.set(x, y, z, 'YXZ')); tr[b].push(q.x, q.y, q.z, q.w); };
        put('hips', pose[I.rootP], pose[I.rootY], pose[I.rootR]); put('torso', pose[I.torsoP], pose[I.torsoY], pose[I.torsoR]); put('head', pose[I.headP], pose[I.headY], 0);
        put('armL', pose[I.armLP], 0, pose[I.armLR]); put('armR', pose[I.armRP], pose[I.armRY], pose[I.armRR]); put('legL', pose[I.legLP], 0, 0); put('legR', pose[I.legRP], 0, 0); hipsY.push(0, pose[I.y], 0); }
      const tracks = Object.entries(tr).map(([b, vals]) => new THREE.QuaternionKeyframeTrack(b + '.quaternion', times, vals)); tracks.push(new THREE.VectorKeyframeTrack('hips.position', times, hipsY));
      anims.push(new THREE.AnimationClip(authored, dur, tracks));
    }
    const glb = await new Promise(r => new THREE.GLTFExporter().parse(scene, r, { binary: true, animations: anims }));
    let s = ''; const u = new Uint8Array(glb); for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s);
  }, only);
  fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, Buffer.from(b64, 'base64')); console.log('wrote', out, fs.statSync(out).size, 'bytes');
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
