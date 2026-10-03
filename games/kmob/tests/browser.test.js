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
    for (let lv = 1; lv <= 5; lv++) { g.startRun(); g.sim.L.inv = 1e9; g.showcase(0, lv); g.render.frame(g.sim, 1 / 60); const S = g.render.lStage; out.push({ lv, mid: S.mid.visible, hop: S.hopper.visible, core: S.core.visible, armor: S.armor.visible, crown: S.crown.visible, barrels: g.render.barrels.filter(x => x.visible).length }); }
    g.startRun(); return out; });
  ok('launcher has 5 visibly different stages', new Set(stages.map(s => JSON.stringify({ ...s, lv: 0 }))).size === 5, stages);
  ok('launcher barrels 1 → 2 → 3', stages[0].barrels === 1 && stages[2].barrels === 2 && stages[4].barrels === 3);
  // support vehicles: model rebuilt per level, each level bigger
  const towers = await p.evaluate(() => { const g = KM.game, hs = []; for (let lv = 1; lv <= 5; lv++) { g.showcase(lv, 1); g.render.frame(g.sim, 1 / 60); const o = g.render.towerObjs; const bb = new THREE.Box3().setFromObject(o[0]); hs.push({ lv, built: o.filter(Boolean).length, lvl: o.filter(Boolean).map(t => t.userData.lvl), h: +o[0].userData.head.position.y.toFixed(2), len: +(bb.max.z - bb.min.z).toFixed(2), wheels: o[0].userData.wheels.length, barrels: o[0].userData.barrels.length }); } return hs; });
  ok('all four support vehicle types build', towers.every(t => t.built === 4), towers.map(t => t.built));
  ok('vehicle models rebuild at every level', towers.every(t => t.lvl.every(l => l === t.lv)));
  ok('higher vehicle levels are visibly bigger, more wheels/tracks and barrels', towers.every((t, i) => i === 0 || (t.len > towers[i - 1].len && t.h > towers[i - 1].h)) && towers[0].barrels < towers[4].barrels && towers[0].wheels < towers[4].wheels, towers);
  // LOD tiers in use with a large crowd
  const lod = await p.evaluate(() => { const g = KM.game; g.stress(1200); for (let k = 0; k < 30; k++) { g.sim.step(1 / 60); } g.render.frame(g.sim, 1 / 60); const pn = g.render.pn; let statues = 0, near = 0; for (const k in pn) { if (k.startsWith('F_')) statues += pn[k]; if (k === 'tLight' || k === 'tHeavy') near += pn[k]; } return { statues, near, drawn: g.render.drawn }; });
  ok('large crowds use both full skeletons and far statues', lod.near > 50 && lod.statues > 50, lod);
  // memory across restarts: geometry/texture counts must not grow
  const mem = await p.evaluate(() => { const g = KM.game, R = g.render.R, snap = () => ({ geo: R.info.memory.geometries, tex: R.info.memory.textures });
    g.startRun(); g.showcase(3, 3); for (let k = 0; k < 90; k++) { g.sim.step(1 / 60); g.render.frame(g.sim, 1 / 60); }   // warm-up: one-time uploads of upgrade hardware are not leaks
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
    node('sword', new THREE.BoxGeometry(0.18, 0.05, 0.78).translate(0, 0, 0.3), 'steel', 0xdddddd); // valid weapon
    node('hBlue', new THREE.SphereGeometry(0.3, 96, 64), 'tint_helm');                      // over budget → loads with a FAIL flag
    node('aStd', null);                                                                     // empty → rejected
    node('mysteryPart', new THREE.BoxGeometry(1, 1, 1));                                    // unknown → reported
    const glb = await new Promise(res => new THREE.GLTFExporter().parse(scene, res, { binary: true }));
    const gltf = await new Promise((res, rej) => new THREE.GLTFLoader().parse(glb, '', res, rej));
    const before = r.partM.tLight.geometry, rep = KM.applyCharacterScene(r, gltf.scene, 'fixture.glb');
    const tintOK = Array.from(r.partM.tLight.geometry.attributes.aTint.array).every(v => v === 1);
    for (let k = 0; k < 20; k++) { KM.game.sim.step(1 / 60); r.frame(KM.game.sim, 1 / 60); }
    return { replaced: rep.replaced.map(x => x.part), rejected: rep.rejected.map(x => x.part + ':' + x.why.split(' ')[0]), flags: rep.flags.map(x => x.part + ':' + x.level + ':' + x.why.split(' ')[0]), unknown: rep.unknown, swapped: r.partM.tLight.geometry !== before, tintOK, stillFallback: !!r.partM.aStd.geometry.attributes.aTint, missing: rep.missing.length };
  });
  ok('authored GLB parts replace procedural parts (GLTFLoader round-trip)', pipe.replaced.includes('tLight') && pipe.replaced.includes('sword') && pipe.swapped, pipe);
  ok('material named tint_* becomes faction-tinted', pipe.tintOK);
  ok('over-budget parts load with a budget FAIL flag (warn, not refuse)', pipe.flags.some(x => x.startsWith('hBlue:FAIL:over')) && pipe.replaced.includes('hBlue'), pipe);
  ok('technically invalid (empty) parts are refused and keep the procedural fallback', pipe.rejected.some(x => x.startsWith('aStd:')) && pipe.stillFallback, pipe.rejected);
  ok('unknown nodes are reported, not applied', pipe.unknown.includes('mysteryPart'));
  ok('missing parts are listed for the artist', pipe.missing > 10);
  for (const [label, body, ct] of [['404', null, null], ['corrupt', Buffer.from('not a glb at all'), 'model/gltf-binary']]) {
    const q = await b.newPage({ viewport: { width: 390, height: 844 } }); const qe = []; q.on('pageerror', e => qe.push(e.message));
    await q.route('**/assets/manifest.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: 1, characters: 'chars.glb' }) }));
    await q.route('**/assets/chars.glb', r => body ? r.fulfill({ status: 200, contentType: ct, body }) : r.fulfill({ status: 404, body: '' }));
    await q.goto(base + 'index.html?autoplay=1'); await q.bringToFront(); await q.evaluate(() => KM.game.setPause(false)); const rep = await q.evaluate(async () => { const r = await KM.assetsReady; const g = KM.game; for (let k = 0; k < 30; k++) { g.sim.step(1 / 60); g.render.frame(g.sim, 1 / 60); } return { r, t: g.sim.t, drawn: g.render.drawn }; });
    ok(`${label} character file → fallback to procedural, game keeps running`, rep.r && rep.r.error && rep.t > 0.05 && qe.length === 0, { rep, qe });
    await q.close();
  }

  // ---- ?bench=1 result generation + recommendation stored; ?playtest=1 summary + answers + COPY ----
  { const bq = await b.newPage({ viewport: { width: 390, height: 844 } }); const be = []; bq.on('pageerror', e => be.push(e.message));
    await bq.goto(base + 'index.html?bench=1&benchSecs=0.6'); await bq.bringToFront();
    let br = null; for (let k = 0; k < 240 && !br; k++) { await bq.waitForTimeout(500); br = await bq.evaluate(() => KM.benchResult || null); }
    const ui = await bq.evaluate(() => ({ copy: !!document.getElementById('benchCopy'), stored: localStorage.getItem('kmob.quality') }));
    const fields = br && br.results.every(r => ['fps', 'low1', 'avgMs', 'worstMs', 'tris', 'calls', 'jsMs', 'units'].every(k => typeof r[k] === 'number'));
    ok('benchmark runs 4 stages and reports fps/1% low/frame times/tris/calls/JS/units', br && br.results.length === 4 && fields && br.info && br.info.ua && br.info.render && br.info.quality, br && br.results);
    const ql = br && br.qualityChanges, qfields = ql && ql.every(c => ['from', 'to', 'stage', 'units', 'fpsBefore', 'reason'].every(k => c[k] != null) && 'fpsAfter' in c);
    ok('benchmark report exposes start/final quality and every automatic quality change', br && br.startQuality && br.finalQuality && Array.isArray(ql) && qfields && br.results.every(r => r.quality) && (ql.length > 0 || br.startQuality === br.finalQuality), br && { s: br.startQuality, f: br.finalQuality, ql });
    ok('benchmark recommendation never exceeds the tier it was stepped down to', !ql || !ql.length || ['low', 'medium', 'high'].indexOf(br.recommended.toLowerCase()) <= Math.min(...ql.map(c => ['low', 'medium', 'high'].indexOf(c.to.toLowerCase()))), br && br.recommended);
    ok('benchmark recommends a tier, stores it, shows COPY RESULTS', br && ['HIGH', 'MEDIUM', 'LOW'].includes(br.recommended) && ui.copy && ui.stored === br.recommended.toLowerCase(), { rec: br && br.recommended, ui, be });
    await bq.close(); }
  { const pq = await b.newPage({ viewport: { width: 390, height: 844 } }); await pq.goto(base + 'index.html?autoplay=1&playtest=1'); await pq.bringToFront(); await pq.waitForTimeout(800);
    await pq.evaluate(() => { const s = KM.game.sim; for (let k = 0; k < 600; k++) { s.L.inv = 1e9; KM.bot(s, 1 / 60, 1); s.step(1 / 60); } s.L.inv = 0; s.hurtLauncher(1e9, 'breach'); });
    let has = false; for (let k = 0; k < 40 && !has; k++) { await pq.waitForTimeout(250); has = await pq.evaluate(() => !!document.getElementById('ptBox')); }
    const pt = has ? await pq.evaluate(() => { const box = document.getElementById('ptBox'); box.querySelector('.pt[data-k="easy"][data-v="1"]').click(); box.querySelector('.pt[data-k="fair"][data-v="0"]').click(); box.querySelector('.pt[data-k="again"][data-v="1"]').click(); box.querySelector('#ptCopy').click(); return KM.lastPlaytest; }) : null;
    ok('?playtest=1 shows the summary + 3 questions and COPY PLAYTEST builds the report', pt && pt.easyToUnderstand === 'YES' && pt.deathFair === 'NO' && pt.playAgain === 'YES' && pt.death === 'breach' && pt.seconds >= 9, pt);
    // actual retry behaviour: press TRY AGAIN after a pause, die again, the next report carries it
    await pq.waitForTimeout(700); await pq.evaluate(() => document.getElementById('againBtn').click());
    await pq.evaluate(() => { const s = KM.game.sim; for (let k = 0; k < 120; k++) s.step(1 / 60); s.L.inv = 0; s.hurtLauncher(1e9, 'breach'); });
    let has2 = false; for (let k = 0; k < 40 && !has2; k++) { await pq.waitForTimeout(250); has2 = await pq.evaluate(() => !!document.getElementById('ptBox') && /Run 1: TRY AGAIN/.test(document.getElementById('ptBox').textContent)); }
    const pt2 = has2 ? await pq.evaluate(() => { document.querySelector('#ptBox #ptCopy').click(); return KM.lastPlaytest; }) : null;
    ok('?playtest=1 records whether TRY AGAIN was actually pressed + seconds after the death screen', pt && pt.pressedTryAgain === 'PENDING' && pt2 && pt2.sessionRetries.length === 1 && pt2.sessionRetries[0].pressedTryAgain === 'YES' && pt2.sessionRetries[0].seconds >= 0.5 && pt2.retryRate === 1 && /Pressed TRY AGAIN/.test(pt2.text), pt2 && { r: pt2.sessionRetries, rate: pt2.retryRate });
    await pq.close(); }
  // ---- edge modules stream with chunks: water appears beside a river section ----
  const water = await p.evaluate(() => { const g = KM.game, s = g.sim, r = g.render; let z = -60; while (z > -6000 && KM.edgeAt(1, z).river < 0.9 && KM.edgeAt(-1, z).river < 0.9) z -= 10; s.front = z + 20; for (let k = 0; k < 8; k++) r.frame(s, 1 / 60);
    let w = 0, falls = 0; for (const [, ch] of r.chunks) ch.traverse(o => { if (o.material === r.waterMat) w++; if (o.material === r.fallMat) falls++; }); return { z, w, falls, chunks: r.chunks.size }; });
  ok('river sections stream animated water strips with their chunks', water.w > 0, water);
  // ---- camera framing on phone aspect ratios: tank, support vehicles and the threat zone stay on screen ----
  for (const [w, h] of [[375, 667], [390, 844], [430, 932], [1440, 900]]) {
    const q = await b.newPage({ viewport: { width: w, height: h } }); await q.goto(base + 'index.html?autoplay=1'); await q.waitForTimeout(800);
    const fr = await q.evaluate(() => { const g = KM.game, s = g.sim, r = g.render; s.L.inv = 1e9; g.showcase(5, 5); s.offer = null;
      const bad = [];
      for (const lx of [-8.4, 0, 8.4]) { s.moveTo(lx, 0); for (let k = 0; k < 150; k++) { s.step(1 / 60); r.frame(s, 1 / 60); }
        const pts = [['launcher', s.L.x, 0.5, s.L.z], ...s.towers.filter(Boolean).map(t => ['tower' + t.slot, t.x, 1.5, t.z]), ['threat', 0, 0, s.front - 24]];
        for (const [n, x, y, z] of pts) { const v = r.toScreen(x, y, z); if (Math.abs(v.x) > 1.0 || v.y < -1.0 || v.y > 0.97) bad.push(`${n}@${lx}:${v.x.toFixed(2)},${v.y.toFixed(2)}`); } }
      return { bad, d: +r.camD.toFixed(1) }; });
    ok(`framing ${w}x${h}: tank, support vehicles, threats on screen`, fr.bad.length === 0, fr);
    await q.close();
  }
  // ---- coins always face the camera (never edge-on streaks) ----
  const coin = await p.evaluate(() => { const g = KM.game, s = g.sim, r = g.render; g.startRun(); s.L.inv = 1e9; for (let k = 0; k < 40; k++) s.dropCoin((Math.random() - 0.5) * 12, s.front - 4 - Math.random() * 10, 1);
    let worst = 1; const m = new THREE.Matrix4(), n = new THREE.Vector3(), pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    for (let f = 0; f < 90; f++) { s.step(1 / 60); r.frame(s, 1 / 60); if (f % 10) continue; for (let i = 0; i < r.coinM.count; i++) { m.fromArray(r.coinM.instanceMatrix.array, i * 16); m.decompose(pos, q, sc); n.set(0, 0, 1).applyQuaternion(q); const toCam = r.cam.position.clone().sub(pos).normalize(); worst = Math.min(worst, Math.abs(n.dot(toCam))); } }
    return { worst: +worst.toFixed(2), n: r.coinM.count }; });
  ok('coins always present their face to the camera (no edge-on streaks)', coin.n > 10 && coin.worst > 0.55, coin);

  // ---- texture atlas + PBR→cel materials + scale/pivot rejection + authored clips (GLB round-trips) ----
  const tex = await p.evaluate(async () => {
    const r = KM.game.render, scene = new THREE.Scene(), cv = document.createElement('canvas'); cv.width = cv.height = 256; const cx = cv.getContext('2d');
    cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, 256, 128); cx.fillStyle = '#c0c0c0'; cx.fillRect(0, 128, 256, 128);
    const atlas = new THREE.CanvasTexture(cv), emis = new THREE.CanvasTexture(cv);
    const mk = (name, geo, mat) => { const g = new THREE.Group(); g.name = name; const me = new THREE.Mesh(geo, mat); g.add(me); scene.add(g); return g; };
    const ref = kitPart => kitPart.attributes.position.clone();
    const head = new THREE.SphereGeometry(0.24, 16, 12).translate(0, 0.2, 0);
    const steel = new THREE.MeshStandardMaterial({ map: atlas, metalness: 1, roughness: 0.2, emissiveMap: emis, emissive: 0xffffff }); steel.name = 'tint_helmet';
    mk('hBlue', head, steel);
    mk('aStd', new THREE.BoxGeometry(0.15, 0.3, 0.15).translate(0, -0.15, 0).scale(6, 6, 6), new THREE.MeshStandardMaterial());          // 6× too big → scale reject
    mk('lStd', new THREE.BoxGeometry(0.14, 0.3, 0.16).translate(3, -0.15, 0), new THREE.MeshStandardMaterial());                       // 3 m off pivot → reject
    // rig + authored attack clip on armR
    const rig = new THREE.Group(); rig.name = 'rig'; scene.add(rig); const hips = new THREE.Object3D(); hips.name = 'hips'; rig.add(hips); const torso = new THREE.Object3D(); torso.name = 'torso'; torso.position.y = 0.34; hips.add(torso); const armR = new THREE.Object3D(); armR.name = 'armR'; armR.position.set(0.3, 0.33, 0); torso.add(armR);
    const qa = new THREE.Quaternion(), qb = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.0, 0, 0)), clip = new THREE.AnimationClip('attack_01', 0.5, [new THREE.QuaternionKeyframeTrack('armR.quaternion', [0, 0.25, 0.5], [...qa.toArray(), ...qb.toArray(), ...qa.toArray()])]);
    const glb = await new Promise(res => new THREE.GLTFExporter().parse(scene, res, { binary: true, animations: [clip] }));
    const gltf = await new Promise((res, rej) => new THREE.GLTFLoader().parse(glb, '', res, rej));
    const rep = KM.applyCharacterScene(r, gltf.scene, 'atlas.glb', gltf.animations);
    const pm = r.partM.hBlue, A = KM.ANIM, pose = new Float32Array(A.P); A.sample(A.ID.attackA, 0.5, A.variation(1, 1, {}), pose);
    const res = { replaced: rep.replaced.map(x => x.part + (x.textured ? ':tex' : '')), rejected: rep.rejected.map(x => x.part + ':' + x.why.split(' ')[0]), flags: rep.flags.map(x => x.part + ':' + x.level + ':' + x.why.split(' ')[0]), map: !!pm.material.map, emissiveMap: !!pm.material.emissiveMap, metal: Math.max(...pm.geometry.attributes.aMetal.array), uv: !!pm.geometry.attributes.uv, textures: rep.textures, texMB: rep.texMB, clips: rep.clips, armRmid: +pose[A.I.armRP].toFixed(2) };
    for (let k = 0; k < 10; k++) { KM.game.sim.step(1 / 60); r.frame(KM.game.sim, 1 / 60); }
    A.restore('attackA'); return res;
  });
  ok('texture atlas: base-colour + emissive maps reach the instanced part material', tex.replaced.includes('hBlue:tex') && tex.map && tex.emissiveMap && tex.uv && tex.textures >= 1 && tex.texMB < 2, tex);
  ok('metalness/roughness become the cel metal highlight attribute', tex.metal > 0.7, tex.metal);
  ok('wrong scale and off-pivot parts are flagged WARN with a reason (still loaded)', tex.flags.some(x => x.startsWith('aStd:WARN:scale')) && tex.flags.some(x => x.startsWith('lStd:WARN:pivot')), tex.flags);
  ok('authored clip "attack_01" is baked onto the skeleton and drives the pose', tex.clips.some(c => c.clip === 'attack_01' && c.as === 'attackA') && Math.abs(tex.armRmid + 1.0) < 0.15, { clips: tex.clips, armRmid: tex.armRmid });
  // ---- quality tiers + bloom tier ----
  const q = await p.evaluate(async () => { const r = KM.game.render, out = {};
    for (const t of ['low', 'medium', 'high']) { r.applyQuality(t); out[t] = { near: r.lodNear, shadows: r.R.shadowMap.enabled, dpr: r.R.getPixelRatio(), fx: r.fxScale }; }
    KM.bloomAllowed = true; r.applyQuality('high'); for (let k = 0; k < 100 && !r.composer; k++) await new Promise(z => setTimeout(z, 100));
    for (let k = 0; k < 5; k++) r.frame(KM.game.sim, 1 / 60); out.bloom = !!(r.composer && r.bloomOn); r.setBloom(false); KM.bloomAllowed = false; r.applyQuality('medium'); out.after = r.bloomOn; return out; });
  ok('quality tiers apply budgets, shadows and effect density', q.low.near < q.medium.near && q.medium.near < q.high.near && !q.low.shadows && q.high.shadows && q.low.fx < q.high.fx, q);
  ok('bloom post-processing tier loads on demand and renders', q.bloom === true && q.after === false, q);
  // ---- heavy hits are visible: shove → dust/ring/spark particles, tiny camera kick only for big blows ----
  const shove = await p.evaluate(() => { const g = KM.game, s = g.sim, r = g.render; g.startRun(); s.L.inv = 1e9; for (let k = 0; k < 5; k++) r.frame(s, 1 / 60);
    const rings = () => r.rings.filter(q => q.m.visible).length, r0 = rings(); r.shake = 0; r.shoveT = 0; r.fxBudget = 50;
    r.onEvent(s, 'shove', 0, 5, 0, s.front, 2.6); const kick = r.shake; r.shoveT = 0; r.fxBudget = 50; r.shake = 0; r.onEvent(s, 'shove', 0, 1, 2, s.front, 1.3); const small = r.shake;
    return { ring: rings() > r0, kick: +kick.toFixed(3), small }; });
  ok('heavy impacts show a shock ring + dust, big blows add only a tiny camera kick', shove.ring && shove.kick > 0 && shove.kick <= 0.08 && shove.small === 0, shove);
  // ---- decor never hides launcher / coins / towers / frontline / threats (camera ray test, phone + desktop) ----
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    const q = await b.newPage({ viewport: { width: w, height: h } }); await q.goto(base + 'index.html?autoplay=1'); await q.waitForTimeout(800);
    const oc = await q.evaluate(() => { const g = KM.game, s = g.sim, R = g.render; s.L.inv = 1e9; g.showcase(5, 5); const rc = new THREE.Raycaster(), dir = new THREE.Vector3(), tp = new THREE.Vector3(), bad = []; let rays = 0;
      const cast = (objs, pts) => { let hits = 0; for (const [n, x, y, z] of pts) { tp.set(x, y, z); dir.copy(tp).sub(R.cam.position); const d = dir.length(); rc.set(R.cam.position, dir.normalize()); rc.far = d - 0.4; rays++; const hit = rc.intersectObjects(objs, false)[0]; if (hit) { hits++; if (bad.length < 8) bad.push(n + '@' + Math.round(s.front)); } } return hits; };
      const scene = () => { const o = []; for (const [, ch] of R.chunks) ch.traverse(m => { if (m.isMesh && (m.userData.decor || m.material === R.groundMat || m.material === R.fallMat)) { if (m.userData.gateZ != null && m.material.opacity < 0.5) return; o.push(m); } }); return o; };
      const pts = () => { const L = s.L; return [['launcher', L.x, 1, L.z], ['coin', L.x - 2, 1.2, L.z - 4], ['coin', L.x + 2, 1.2, L.z - 6], ...s.towers.filter(Boolean).map(t => ['tower', t.x, 2, t.z]), ['front', 0, 1, s.front], ['front', -7, 1, s.front], ['front', 7, 1, s.front], ['threat', 0, 1, s.front - 24], ['threat', -7, 1, s.front - 24], ['threat', 7, 1, s.front - 24]]; };
      let hits = 0; for (let f = -60; f > -2200; f -= 61) { const dz = s.L.z - s.front; s.front = f; s.L.z = f + dz; s.L.tz = s.L.z; for (let k = 0; k < 4; k++) R.streamWorld(f); for (let k = 0; k < 12; k++) R.frame(s, 1 / 30); hits += cast(scene(), pts()); }
      // the probe is not vacuous: a tall prop placed at the fence (bypassing the guard) is detected
      const probe = new THREE.Mesh(new THREE.BoxGeometry(1.2, 9, 1.2).translate(0, 4.5, 0), R.decoMat); const on = R.cam.position.clone().lerp(new THREE.Vector3(s.L.x, 1, s.L.z), 0.93); probe.position.set(on.x, 0, on.z); probe.updateMatrixWorld(); probe.userData.decor = 1; R.scene.add(probe);
      const pr = cast([probe], [['launcher', s.L.x, 1, s.L.z], ['coin', s.L.x + 2, 1.2, s.L.z - 4], ['front', 7, 1, s.front], ['front', 4, 1, s.front + 3]]); R.scene.remove(probe);
      const G = R.decorGuard, viol = G.boxes.filter(b => { const inner = b[0] > 0 ? b[0] : b[1] < 0 ? -b[1] : 0; return inner < KM.decorClear(b[4]) - 0.02; }).length;
      return { rays, hits, bad, probe: pr, viol, guard: { placed: G.placed, moved: G.moved, lowered: G.lowered, hidden: G.hidden } }; });
    ok(`decor occlusion ${w}x${h}: no prop/cliff/gate hides launcher, coins, towers, frontline or threats`, oc.hits === 0 && oc.rays > 300, oc);
    ok(`decor guard ${w}x${h}: every placed prop keeps clear of the sight-lines (moved/lowered/hidden when needed); probe detects a bad prop`, oc.viol === 0 && oc.probe > 0, { viol: oc.viol, probe: oc.probe, guard: oc.guard });
    await q.close();
  }
  // ---- ?assets=1 validation page ----
  { const aq = await b.newPage({ viewport: { width: 1280, height: 900 } }); const ae = []; aq.on('pageerror', e => ae.push(e.message));
    await aq.goto(base + 'index.html?assets=1'); await aq.waitForFunction(() => window.KM && KM.assetsPageReady, null, { timeout: 15000 });
    const v0 = await aq.evaluate(async () => { const v = await KM.assetsPageReady; await new Promise(r => setTimeout(r, 400)); return { path: location.pathname, n: v.units.length, src: v.units.map(u => u.source), lv: v.units.map(u => u.budgetLv), keys: Object.keys(v.units[0]), clips: document.querySelectorAll('#clips button').length }; });
    ok('?assets=1 opens the validation page with every unit + clip controls (idle/run/attack/hit/death)', /dev\/assets\.html$/.test(v0.path) && v0.n === Object.keys(await aq.evaluate(() => KM.RECIPE)).length && v0.clips >= 5 && ['tris', 'materials', 'textures', 'skeleton', 'scale', 'orient', 'pivot', 'clipsFound', 'clipsMissing', 'budgetLv', 'source'].every(k => v0.keys.includes(k)), v0);
    ok('?assets=1 with no GLB delivered: every unit is PROCEDURAL FALLBACK and within budget', v0.src.every(x => x === 'PROCEDURAL FALLBACK') && v0.lv.every(x => x === 'PASS'), v0);
    await aq.goto(base + 'index.html?assets=1&glb=template/kmob-parts-template.glb&unit=brute'); await aq.waitForFunction(() => window.KM && KM.assetsPageReady, null, { timeout: 15000 });
    const v1 = await aq.evaluate(async () => { const v = await KM.assetsPageReady; const u = v.units.find(x => x.unit === 'soldier'); return { src: u.source, found: u.clipsFound, scale: u.scale, pivot: u.pivot, cap: document.getElementById('prodCap').textContent }; });
    ok('?assets=1 validates a delivered GLB: production source, clips found, scale/pivot checks', v1.src === 'PRODUCTION GLB' && /idle/.test(v1.found) && v1.scale === 'PASS' && v1.pivot === 'PASS', v1);
    ok('?assets=1 page has no runtime errors', ae.length === 0, ae);
    await aq.close(); }
  // ---- mobile war: tank hardware, force field, posture control, collectors, weapon eras, projectiles ----
  const mw = await p.evaluate(() => { const g = KM.game, s = g.sim, r = g.render, out = {};
    g.startRun(); s.L.inv = 1e9; r.frame(s, 1 / 60); out.base = { pod: r.lPod.visible, ant: r.lAnt.visible, emit: r.lEmit.visible, shield: r.shieldM.visible, barrels: r.barrels.filter(b => b.visible).length };
    g.showcase(0, 5); r.frame(s, 1 / 60); out.late = { pod: r.lPod.visible, ant: r.lAnt.visible, emit: r.lEmit.visible, shield: r.shieldM.visible, barrels: r.barrels.filter(b => b.visible).length, crown: r.crown.visible };
    s.L.sh = s.L.shMax = s.shieldMax(); s.L.shDown = 0; r.frame(s, 1 / 60); out.fullOp = r.shieldMat.opacity; s.L.sh = s.L.shMax * 0.1; r.frame(s, 1 / 60); out.weakOp = r.shieldMat.opacity; s.L.inv = 0; s.hurtLauncher(1e4 * 0 + s.L.sh + 1, 'test'); s.L.inv = 1e9; r.frame(s, 1 / 60); out.down = s.L.shDown > 0;
    // posture button
    const btn = document.getElementById('postureBtn'); out.btnShown = !btn.classList.contains('hidden'); btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); out.afterTap = { posture: s.posture, txt: document.getElementById('postureTxt').textContent }; btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); out.afterTap2 = s.posture;
    // collectors + weapon eras drawn
    s.stats.collectors = 1; s.stats.archer = 1; const wp = []; for (let e = 0; e < KM.RTECH.length; e++) { s.stats.rtech = e; for (let k = 0; k < 40; k++) s.step(1 / 60); r.frame(s, 1 / 60); wp.push(r.pn[KM.RTECH[e].wpn] + r.pn['m_w_' + KM.RTECH[e].wpn]); }
    out.eraParts = wp; out.sack = r.pn.sack + r.pn.m_w_sack;
    // projectiles of every new kind get drawn
    for (const kd of [10, 11, 13, 14, 15, 16, 20, 21]) s.fire(0, s.L.x, s.L.z, -1, s.L.x, s.L.z - 30, 1, kd, 0, 0, 5, false, 1);
    r.frame(s, 1 / 60); out.proj = [10, 11, 13, 14, 15, 16, 20, 21].map(k => r.proj[k].count);
    return out; });
  ok('tank starts basic: one barrel, no pod/antenna/emitters/shield', mw.base.barrels === 1 && !mw.base.pod && !mw.base.ant && !mw.base.emit && !mw.base.shield, mw.base);
  ok('late tank shows its upgrades: 3 barrels, missile pod, targeting mast, field emitters, heavy crown, force field', mw.late.barrels === 3 && mw.late.pod && mw.late.ant && mw.late.emit && mw.late.shield && mw.late.crown, mw.late);
  ok('force field reads its state: bright when full, fainter when weak, gone when collapsed', mw.fullOp > mw.weakOp && mw.down, mw);
  ok('ATTACK/DEFEND: one button toggles the posture both ways', mw.afterTap.posture === 1 && mw.afterTap.txt === 'DEFEND' && mw.afterTap2 === 0, mw);
  ok('ranged troops visibly carry each weapon era (rock → pulse rifle)', mw.eraParts.every(n => n > 0), mw.eraParts);
  ok('collectors carry a visible sack', mw.sack > 0, mw.sack);
  ok('every new projectile kind is drawn', mw.proj.every(n => n > 0), mw.proj);
  ok('no runtime errors during the browser suite', errs.length === 0, errs.slice(0, 5));
  await b.close(); srv.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
