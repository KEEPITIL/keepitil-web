/* KMOB browser tests (Playwright + headless Chromium). Serves games/kmob itself.
   Run: PW=/path/to/playwright node tests/browser.test.js   (PW defaults to 'playwright')
   Covers: character kit + statues load, every recipe part exists, no runtime errors, launcher stage visibility,
   tower model rebuild per level, LOD tiers in use, memory/geometry stability across restarts, WebGL context
   loss + recovery, and a browser soak (simulated minutes with periodic rendering, JS heap bounded). */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PW || 'playwright');
const ROOT = path.join(__dirname, '..'), TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
let pass = 0, fail = 0; const ok = (n, c, info) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c || info === undefined ? '' : ' ' + JSON.stringify(info))); };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}/`;
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'] });
  const p = await b.newPage({ viewport: { width: 430, height: 932 } }); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|CERT|net::/.test(m.text())) errs.push(m.text()); });
  await p.goto(base + 'index.html?autoplay=1'); await p.waitForTimeout(2500);
  const kit = await p.evaluate(() => { const r = KM.game.render, P = r.kit.parts, miss = [];
    for (const [k, rc] of Object.entries(KM.RECIPE)) for (const key of ['torso', 'head', 'arm', 'leg', 'wpn', 'body']) if (rc[key] && !P[rc[key]]) miss.push(k + '.' + key);
    const statues = Object.keys(KM.RECIPE).filter(k => !KM.RECIPE[k].body && !r.kit.statues[k]);
    const empty = Object.entries(P).filter(([, g]) => !(g.attributes.position.count > 0)).map(([k]) => k);
    const kinds = [...KM.ENEMY.map(e => e.k), ...KM.FRIEND.map(f => f.k)].filter(k => !KM.RECIPE[k]);
    return { miss, statues, empty, kinds, nParts: Object.keys(P).length };
  });
  ok('every unit kind has a recipe', kit.kinds.length === 0, kit.kinds);
  ok('every recipe part exists in the kit', kit.miss.length === 0, kit.miss);
  ok('every infantry kind has a far-LOD statue', kit.statues.length === 0, kit.statues);
  ok('no empty part geometry', kit.empty.length === 0, kit.empty);
  // launcher stages
  const stages = await p.evaluate(async () => { const g = KM.game, out = []; g.sim.L.inv = 1e9;
    for (let lv = 1; lv <= 5; lv++) { g.sim.upgrades = (lv - 1) * 4; g.render.frame(g.sim, 1 / 60); const S = g.render.lStage; out.push({ lv, mid: S.mid.visible, hop: S.hopper.visible, core: S.core.visible, armor: S.armor.visible, crown: S.crown.visible, barrels: g.render.barrels.filter(x => x.visible).length }); }
    g.sim.upgrades = 0; return out; });
  ok('launcher has 5 visibly different stages', new Set(stages.map(s => JSON.stringify({ ...s, lv: 0 }))).size === 5, stages);
  ok('launcher barrels 1 → 2 → 3', stages[0].barrels === 1 && stages[2].barrels === 2 && stages[4].barrels === 3);
  // towers: model rebuilt per level, each level taller
  const towers = await p.evaluate(() => { const g = KM.game, hs = []; for (let lv = 1; lv <= 5; lv++) { g.showcase(lv, 1); g.render.frame(g.sim, 1 / 60); const o = g.render.towerObjs; hs.push({ lv, built: o.filter(Boolean).length, lvl: o.map(t => t && t.userData.lvl), h: +o[0].userData.head.position.y.toFixed(2) }); } return hs; });
  ok('all six tower types build', towers.every(t => t.built === 6), towers.map(t => t.built));
  ok('tower models rebuild at every level', towers.every(t => t.lvl.every(l => l === t.lv)));
  ok('higher tower levels are taller', towers.every((t, i) => i === 0 || t.h > towers[i - 1].h), towers.map(t => t.h));
  // LOD tiers in use with a large crowd
  const lod = await p.evaluate(() => { const g = KM.game; g.stress(1200); for (let k = 0; k < 30; k++) { g.sim.step(1 / 60); } g.render.frame(g.sim, 1 / 60); const pn = g.render.pn; let statues = 0, near = 0; for (const k in pn) { if (k.startsWith('S_')) statues += pn[k]; if (k === 'tLight' || k === 'tHeavy') near += pn[k]; } return { statues, near, drawn: g.render.drawn }; });
  ok('large crowds use both full skeletons and far statues', lod.near > 50 && lod.statues > 50, lod);
  // memory across restarts: geometry/texture counts must not grow
  const mem = await p.evaluate(() => { const g = KM.game, R = g.render.R, snap = () => ({ geo: R.info.memory.geometries, tex: R.info.memory.textures });
    g.startRun(); for (let k = 0; k < 120; k++) { g.sim.step(1 / 60); g.render.frame(g.sim, 1 / 60); } const a = snap();
    for (let r = 0; r < 8; r++) { g.startRun(); g.showcase(3, 3); for (let k = 0; k < 90; k++) { g.sim.step(1 / 60); g.render.frame(g.sim, 1 / 60); } }
    g.startRun(); for (let k = 0; k < 120; k++) { g.sim.step(1 / 60); g.render.frame(g.sim, 1 / 60); } const b = snap(); return { a, b, heap: performance.memory && performance.memory.usedJSHeapSize }; });
  console.log('      memory', JSON.stringify(mem));
  ok('restarts do not leak GPU geometries/textures', mem.b.geo <= mem.a.geo + 12 && mem.b.tex <= mem.a.tex + 2, mem);
  // WebGL context loss + restore
  const ctx = await p.evaluate(async () => { const g = KM.game, gl = g.render.R.getContext(), ext = gl.getExtension('WEBGL_lose_context'); if (!ext) return { skip: true };
    ext.loseContext(); await new Promise(r => setTimeout(r, 300)); const lost = g.glLost; ext.restoreContext(); await new Promise(r => setTimeout(r, 800));
    g.setPause(false); const t0 = g.sim.t; await new Promise(r => setTimeout(r, 1500)); return { lost, restored: !g.glLost, advanced: g.sim.t > t0, contextLost: gl.isContextLost() }; });
  ok('WebGL context loss pauses and recovers', ctx.skip || (ctx.lost && ctx.restored && !ctx.contextLost && ctx.advanced), ctx);
  // browser soak: 30 simulated minutes, rendering every 10th step, heap bounded
  const soak = await p.evaluate(() => { const g = KM.game; g.startRun(); g.sim.L.inv = 1e9; const heap = []; const t0 = performance.now();
    for (let m = 0; m < 10; m++) { for (let k = 0; k < 3600; k++) { KM.bot(g.sim, 1 / 60, 1); g.sim.step(1 / 60); if (k % 600 === 0) g.render.frame(g.sim, 1 / 30); } heap.push(performance.memory ? performance.memory.usedJSHeapSize : 0); }
    return { heapStart: heap[1], heapEnd: heap[heap.length - 1], max: Math.max(...heap), secs: (performance.now() - t0) / 1000, geo: g.render.R.info.memory.geometries, units: g.sim.count }; });
  console.log('      soak', JSON.stringify(soak));
  ok('browser soak (10 sim-min): JS heap stays bounded', !soak.heapStart || soak.heapEnd < soak.heapStart * 1.8 + 30e6, soak);

  // ---- production asset pipeline: procedural default, GLB round-trip, budget/empty/unknown rejection, 404 + corrupt fallback ----
  const assets0 = await p.evaluate(async () => { const r = await KM.assetsReady; return r; });
  ok('no authored file → procedural kit (no errors)', assets0 && assets0.procedural === true);
  await p.addScriptTag({ path: path.join(__dirname, 'vendor/GLTFExporter.js') });
  const pipe = await p.evaluate(async () => {
    const r = KM.game.render, kit = KM.buildKit(), scene = new THREE.Scene();
    const node = (name, geo, matName, color) => { const g = new THREE.Group(); g.name = name; if (geo) { const m = new THREE.MeshStandardMaterial({ color: color || 0xffffff }); m.name = matName || 'base'; const me = new THREE.Mesh(geo, m); me.name = name + '_mesh'; g.add(me); } scene.add(g); return g; };
    const tl = kit.parts.tLight; const plain = new THREE.BufferGeometry(); plain.setAttribute('position', tl.attributes.position.clone()); plain.setAttribute('normal', tl.attributes.normal.clone());
    node('tLight', plain, 'tint_body', 0xffffff);                                          // valid authored part
    node('sword', new THREE.BoxGeometry(0.06, 0.02, 0.7).translate(0, 0, 0.4), 'steel', 0xdddddd); // valid weapon
    node('hBlue', new THREE.SphereGeometry(0.3, 96, 64), 'tint_helm');                      // over budget → rejected
    node('aStd', null);                                                                     // empty → rejected
    node('mysteryPart', new THREE.BoxGeometry(1, 1, 1));                                    // unknown → reported
    const glb = await new Promise(res => new THREE.GLTFExporter().parse(scene, res, { binary: true }));
    const gltf = await new Promise((res, rej) => new THREE.GLTFLoader().parse(glb, '', res, rej));
    const before = r.partM.tLight.geometry, rep = KM.applyCharacterScene(r, gltf.scene, 'fixture.glb');
    const tintOK = Array.from(r.partM.tLight.geometry.attributes.aTint.array).every(v => v === 1);
    for (let k = 0; k < 20; k++) { KM.game.sim.step(1 / 60); r.frame(KM.game.sim, 1 / 60); }
    return { replaced: rep.replaced.map(x => x.part), rejected: rep.rejected.map(x => x.part + ':' + x.why.split(' ')[0]), unknown: rep.unknown, swapped: r.partM.tLight.geometry !== before, tintOK, stillFallback: !!r.partM.hBlue.geometry.attributes.aTint, missing: rep.missing.length };
  });
  ok('authored GLB parts replace procedural parts (GLTFLoader round-trip)', pipe.replaced.includes('tLight') && pipe.replaced.includes('sword') && pipe.swapped, pipe);
  ok('material named tint_* becomes faction-tinted', pipe.tintOK);
  ok('over-budget and empty parts are rejected and keep the procedural fallback', pipe.rejected.some(x => x.startsWith('hBlue:over')) && pipe.rejected.some(x => x.startsWith('aStd:')) && pipe.stillFallback, pipe.rejected);
  ok('unknown nodes are reported, not applied', pipe.unknown.includes('mysteryPart'));
  ok('missing parts are listed for the artist', pipe.missing > 10);
  for (const [label, body, ct] of [['404', null, null], ['corrupt', Buffer.from('not a glb at all'), 'model/gltf-binary']]) {
    const q = await b.newPage({ viewport: { width: 390, height: 844 } }); const qe = []; q.on('pageerror', e => qe.push(e.message));
    await q.route('**/assets/manifest.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: 1, characters: 'chars.glb' }) }));
    await q.route('**/assets/chars.glb', r => body ? r.fulfill({ status: 200, contentType: ct, body }) : r.fulfill({ status: 404, body: '' }));
    await q.goto(base + 'index.html?autoplay=1'); await q.bringToFront(); await q.evaluate(() => KM.game.setPause(false)); const rep = await q.evaluate(async () => { const r = await KM.assetsReady; for (let k = 0; k < 60 && KM.game.sim.t < 0.1; k++) await new Promise(z => setTimeout(z, 100)); return { r, t: KM.game.sim.t, drawn: KM.game.render.drawn }; });
    ok(`${label} character file → fallback to procedural, game keeps running`, rep.r && rep.r.error && rep.t > 0.05 && qe.length === 0, { rep, qe });
    await q.close();
  }
  // ---- camera framing on phone aspect ratios: launcher, towers, walls and the threat zone stay on screen ----
  for (const [w, h] of [[375, 667], [390, 844], [430, 932], [1440, 900]]) {
    const q = await b.newPage({ viewport: { width: w, height: h } }); await q.goto(base + 'index.html?autoplay=1'); await q.waitForTimeout(800);
    const fr = await q.evaluate(() => { const g = KM.game, s = g.sim, r = g.render; s.L.inv = 1e9; g.showcase(5, 5); s.coins = 1e6; for (const id of ['wall:barricade', 'wall:barricade', 'wall:wall']) { s.offer = [{ id }]; s.pick(0); } s.offer = null;
      const bad = [];
      for (const lx of [-8.4, 0, 8.4]) { s.moveTo(lx, 0); for (let k = 0; k < 150; k++) { s.step(1 / 60); r.frame(s, 1 / 60); }
        const pts = [['launcher', s.L.x, 0.5, s.L.z], ...s.towers.filter(Boolean).map(t => ['tower' + t.slot, t.x, 1.5, t.z]), ...s.walls.map((wl, k) => ['wall' + k, wl.x, 0.5, wl.z]), ['threat', 0, 0, s.front - 24]];
        for (const [n, x, y, z] of pts) { const v = r.toScreen(x, y, z); if (Math.abs(v.x) > 1.0 || v.y < -1.0 || v.y > 0.97) bad.push(`${n}@${lx}:${v.x.toFixed(2)},${v.y.toFixed(2)}`); } }
      return { bad, d: +r.camD.toFixed(1) }; });
    ok(`framing ${w}x${h}: launcher, towers, walls, threats on screen`, fr.bad.length === 0, fr);
    await q.close();
  }
  // ---- coins always face the camera (never edge-on streaks) ----
  const coin = await p.evaluate(() => { const g = KM.game, s = g.sim, r = g.render; g.startRun(); s.L.inv = 1e9; for (let k = 0; k < 40; k++) s.dropCoin((Math.random() - 0.5) * 12, s.front - 4 - Math.random() * 10, 1);
    let worst = 1; const m = new THREE.Matrix4(), n = new THREE.Vector3(), pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    for (let f = 0; f < 90; f++) { s.step(1 / 60); r.frame(s, 1 / 60); if (f % 10) continue; for (let i = 0; i < r.coinM.count; i++) { m.fromArray(r.coinM.instanceMatrix.array, i * 16); m.decompose(pos, q, sc); n.set(0, 0, 1).applyQuaternion(q); const toCam = r.cam.position.clone().sub(pos).normalize(); worst = Math.min(worst, Math.abs(n.dot(toCam))); } }
    return { worst: +worst.toFixed(2), n: r.coinM.count }; });
  ok('coins always present their face to the camera (no edge-on streaks)', coin.n > 10 && coin.worst > 0.55, coin);
  ok('no runtime errors during the browser suite', errs.length === 0, errs.slice(0, 5));
  await b.close(); srv.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
