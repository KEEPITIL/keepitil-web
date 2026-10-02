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
    const glb = await new Promise(r => new THREE.GLTFExporter().parse(scene, r, { binary: true }));
    let s = ''; const u = new Uint8Array(glb); for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s);
  }, only);
  fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, Buffer.from(b64, 'base64')); console.log('wrote', out, fs.statSync(out).size, 'bytes');
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
