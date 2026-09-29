/* LANTERN HEADQUARTERS — the home screen is a place. Late-night paranormal investigation office, circa 2001.
   Tap/click an object → the camera glides to it → the object acts (projector runs, drawer opens) → its interface appears.
   HQ STATE (T13.hq.state) drives what is in the room so it can change with the story. */
(function () {
  const Q = T13.hq = {}, X = T13.gfx, V = THREE.Vector3;
  let scene, cam, built = false, active = false, raf = 0, last = 0, hot = [], hover = null, tween = null, focus = null, onSelect = null, t = 0;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const OVERVIEW = { pos: new V(0, 1.75, 3.6), look: new V(0, 1.35, -1.6) };
  Q.state = { markers: 0, newspapers: [], photos: [], eliasNotes: 0, chairMoved: false, lampFailing: false, evelyn: 'normal', mirror: false, prologueDone: false };
  const loadState = () => { try { const sv = JSON.parse(localStorage.getItem('t13-save') || 'null'); if (sv?.prologueDone) { Q.state.prologueDone = true; Q.state.markers = Math.max(Q.state.markers, 1); Q.state.newspapers = ['ashgrove']; Q.state.eliasNotes = 1; } } catch (e) {} };

  // ---------- textures ----------
  const handwriting = (g, text, x, y, size = 22, col = '#1b1a2a', rot = 0) => { g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = col; g.font = `italic ${size}px "Bradley Hand", "Segoe Print", "Comic Sans MS", cursive`; g.fillText(text, 0, 0); g.restore(); };
  const evidenceTex = () => X.tex('evidence' + JSON.stringify(Q.state), 2048, 820, (g, w, h) => {
    g.fillStyle = '#8b6a44'; g.fillRect(0, 0, w, h); for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${X.rnd() < 0.5 ? '60,40,20' : '170,130,90'},${X.rnd() * 0.35})`; g.fillRect(X.rnd() * w, X.rnd() * h, 2, 2); }
    g.strokeStyle = '#3a2614'; g.lineWidth = 26; g.strokeRect(13, 13, w - 26, h - 26);
    const pins = []; const pin = (x, y, col = '#b3261e') => { pins.push([x, y]); g.fillStyle = col; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(x - 2, y - 2, 2.5, 0, 7); g.fill(); };
    const polaroid = (x, y, rot, draw, cap) => { g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(6, 8, 170, 200); g.fillStyle = '#eee8d6'; g.fillRect(0, 0, 170, 200); g.save(); g.beginPath(); g.rect(12, 12, 146, 146); g.clip(); draw(12, 12, 146); g.restore(); if (cap) handwriting(g, cap, 16, 186, 18); g.restore(); pin(x + 85 * Math.cos(rot), y + 85 * Math.sin(rot) + 4); };
    const sepia = (x, y, s, kind) => { const gr = g.createLinearGradient(x, y, x, y + s); gr.addColorStop(0, '#6b5c48'); gr.addColorStop(1, '#2c241a'); g.fillStyle = gr; g.fillRect(x, y, s, s); g.fillStyle = '#16120d';
      if (kind === 'building') { g.fillRect(x + 10, y + 60, s - 20, s - 60); for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) { g.fillStyle = X.rnd() < 0.2 ? '#b8a070' : '#2a2219'; g.fillRect(x + 20 + i * 24, y + 72 + j * 22, 12, 12); } }
      if (kind === 'corridor') { g.beginPath(); g.moveTo(x, y); g.lineTo(x + s * 0.4, y + s * 0.4); g.lineTo(x + s * 0.6, y + s * 0.4); g.lineTo(x + s, y); g.lineTo(x + s, y + s); g.lineTo(x + s * 0.6, y + s * 0.6); g.lineTo(x + s * 0.4, y + s * 0.6); g.lineTo(x, y + s); g.fill(); g.fillStyle = '#e8dcc0'; g.fillRect(x + s * 0.48, y + s * 0.43, 4, 12); }
      if (kind === 'figure') { g.fillStyle = '#0c0a08'; g.fillRect(x + s * 0.46, y + s * 0.3, 10, s * 0.55); g.beginPath(); g.arc(x + s * 0.5, y + s * 0.27, 9, 0, 7); g.fill(); }
      if (kind === 'lantern') { g.strokeStyle = '#d8c690'; g.lineWidth = 4; g.beginPath(); g.arc(x + s / 2, y + s / 2, s * 0.3, 0, 7); g.stroke(); g.font = 'bold 34px Georgia'; g.fillStyle = '#d8c690'; g.textAlign = 'center'; g.fillText('L', x + s / 2, y + s / 2 + 12); g.textAlign = 'left'; }
      if (kind === 'family') { for (let i = 0; i < 5; i++) { g.fillStyle = '#0e0b08'; g.beginPath(); g.arc(x + 20 + i * 27, y + 60, 10, 0, 7); g.fill(); g.fillRect(x + 12 + i * 27, y + 72, 16, 60); } g.strokeStyle = '#d0c090'; g.lineWidth = 3; [1, 2].forEach(i => { g.beginPath(); g.moveTo(x + 8 + i * 27, y + 48); g.lineTo(x + 32 + i * 27, y + 74); g.moveTo(x + 32 + i * 27, y + 48); g.lineTo(x + 8 + i * 27, y + 74); g.stroke(); }); } };
    const clipping = (x, y, rot, head, lines = 9) => { g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(5, 7, 260, 170); g.fillStyle = '#ddd4bc'; g.fillRect(0, 0, 260, 170); g.fillStyle = '#1d1a14'; g.font = 'bold 21px Georgia'; g.fillText(head, 12, 30); g.fillStyle = 'rgba(30,26,20,.6)'; for (let i = 0; i < lines; i++) g.fillRect(12, 46 + i * 13, 90 + X.rnd() * 140, 5); g.restore(); pin(x + 130 * Math.cos(rot), y + 6 + 130 * Math.sin(rot)); };
    const card = (x, y, rot, text, col = '#1b1a2a') => { g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(4, 6, 200, 110); g.fillStyle = '#f1ead4'; g.fillRect(0, 0, 200, 110); g.strokeStyle = 'rgba(170,40,40,.5)'; g.beginPath(); g.moveTo(0, 26); g.lineTo(200, 26); g.stroke(); g.strokeStyle = 'rgba(80,110,170,.35)'; for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(0, 26 + i * 18); g.lineTo(200, 26 + i * 18); g.stroke(); } text.split('\n').forEach((l, i) => handwriting(g, l, 12, 50 + i * 20, 20, col)); g.restore(); pin(x + 100 * Math.cos(rot), y + 5 + 100 * Math.sin(rot), '#2a5bbf'); };
    // world map strip (13 locations eventually light up)
    g.fillStyle = '#cdbf9a'; g.fillRect(760, 60, 520, 280); g.strokeStyle = '#6b5a3a'; g.lineWidth = 3; g.strokeRect(760, 60, 520, 280); drawContinents(g, 760, 60, 520, 280, '#9a8a62');
    handwriting(g, 'S1 — 13 sites?', 780, 330, 22, '#5a1a14'); pin(1020, 64);
    const SITES = [[0.63, 0.28], [0.8, 0.44], [0.78, 0.52], [0.77, 0.56], [0.88, 0.8], [0.76, 0.5], [0.28, 0.55], [0.48, 0.24], [0.32, 0.46], [0.24, 0.36], [0.23, 0.28], [0.25, 0.29], [0.3, 0.27]];
    SITES.forEach(([u, v], i) => { const x = 760 + u * 520, y = 60 + v * 280; g.fillStyle = i < Q.state.markers ? '#e0b030' : 'rgba(40,30,20,.55)'; g.beginPath(); g.arc(x, y, i < Q.state.markers ? 7 : 4, 0, 7); g.fill(); });
    polaroid(90, 70, -0.06, (x, y, s) => sepia(x, y, s, 'building'), 'Ashgrove — closed');
    polaroid(300, 110, 0.05, (x, y, s) => sepia(x, y, s, 'corridor'), 'east ward');
    polaroid(520, 60, -0.03, (x, y, s) => sepia(x, y, s, 'figure'), 'who is this?');
    polaroid(1380, 80, 0.06, (x, y, s) => sepia(x, y, s, 'lantern'), 'our mark');
    polaroid(1590, 60, -0.05, (x, y, s) => sepia(x, y, s, 'family'), '');
    clipping(80, 330, 0.03, 'WING SEALED AFTER FIRE'); clipping(360, 360, -0.04, 'NIGHT STAFF REPORT VOICES', 8);
    if (Q.state.newspapers.includes('ashgrove')) clipping(1380, 330, 0.05, 'ASHGROVE LIGHTS SEEN AGAIN', 7);
    card(90, 560, -0.02, 'It copies voices.\nNever answer your\nown name.'); card(360, 580, 0.04, 'Something is\nharvesting them.\nWHAT? WHY?', '#5a1a14'); card(640, 540, -0.05, 'Mara: "it listens"\nGabriel: say nothing\nDaniel: 4 · 1 · 3');
    if (Q.state.eliasNotes) card(1380, 580, 0.03, "Don't follow me.", '#2a2a2a');
    // XIII — the conspicuous empty section
    g.setLineDash([16, 12]); g.strokeStyle = 'rgba(245,235,210,.85)'; g.lineWidth = 5; g.strokeRect(1660, 330, 330, 440); g.setLineDash([]);
    g.fillStyle = 'rgba(20,14,8,.35)'; g.fillRect(1660, 330, 330, 440);
    g.fillStyle = '#efe4c4'; g.font = 'bold 110px Georgia'; g.textAlign = 'center'; g.fillText('XIII', 1825, 590); g.font = 'italic 30px Georgia'; g.fillText('?', 1825, 650); g.textAlign = 'left'; pin(1825, 345, '#e0b030');
    // red string
    g.strokeStyle = 'rgba(170,20,20,.85)'; g.lineWidth = 3; const links = [[0, 5], [1, 5], [2, 6], [5, 8], [6, 9], [3, pins.length - 1], [4, pins.length - 1], [8, pins.length - 1]];
    links.forEach(([a, b]) => { const A = pins[a], Bp = pins[b]; if (!A || !Bp) return; g.beginPath(); g.moveTo(A[0], A[1]); g.quadraticCurveTo((A[0] + Bp[0]) / 2, Math.max(A[1], Bp[1]) + 30, Bp[0], Bp[1]); g.stroke(); });
  });
  function drawContinents(g, x0, y0, w, h, col) {
    // coarse, stylised continents (lon/lat polygons) — a period wall map, not a survey
    const P = pts => { g.beginPath(); pts.forEach(([lon, lat], i) => { const x = x0 + (lon + 180) / 360 * w, y = y0 + (90 - lat) / 180 * h; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.fill(); };
    g.fillStyle = col;
    P([[-168, 66], [-140, 70], [-95, 72], [-80, 64], [-60, 55], [-66, 45], [-80, 25], [-97, 18], [-105, 20], [-117, 32], [-125, 48], [-150, 60]]);
    P([[-80, 10], [-60, 8], [-35, -8], [-40, -22], [-58, -38], [-70, -54], [-75, -40], [-72, -18], [-81, -5]]);
    P([[-10, 36], [0, 43], [-9, 44], [0, 50], [10, 55], [25, 60], [30, 70], [40, 66], [30, 45], [26, 38], [10, 38]]);
    P([[-17, 20], [-10, 35], [10, 37], [32, 31], [43, 12], [51, 11], [40, -15], [30, -34], [18, -34], [12, -16], [8, 4], [-8, 5]]);
    P([[30, 45], [40, 66], [70, 72], [110, 76], [140, 72], [170, 66], [160, 58], [140, 52], [130, 40], [122, 30], [120, 22], [108, 10], [100, 20], [90, 22], [80, 8], [72, 20], [58, 25], [50, 30], [45, 40]]);
    P([[114, -22], [122, -18], [135, -12], [145, -15], [153, -27], [148, -38], [138, -35], [130, -32], [115, -34]]);
    P([[-50, 60], [-30, 70], [-22, 80], [-45, 83], [-60, 76]]);
    P([[95, 5], [105, -6], [120, -8], [128, -3], [118, 2], [105, 2]]); P([[130, 32], [135, 35], [141, 41], [140, 36]]); P([[-6, 50], [-3, 58], [1, 53]]);
  }
  const globeTex = () => X.tex('globe', 1024, 512, (g, w, h) => { g.fillStyle = '#6f7c6a'; g.fillRect(0, 0, w, h); for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(0,0,0,${X.rnd() * 0.06})`; g.fillRect(X.rnd() * w, X.rnd() * h, 3, 3); } drawContinents(g, 0, 0, w, h, '#c9b88a'); g.strokeStyle = 'rgba(40,30,20,.3)'; for (let i = 1; i < 12; i++) { g.beginPath(); g.moveTo(i * w / 12, 0); g.lineTo(i * w / 12, h); g.stroke(); } for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(0, i * h / 6); g.lineTo(w, i * h / 6); g.stroke(); } });
  const wallpaper = () => X.tex('wallpaper', 256, 256, (g, w, h) => { g.fillStyle = '#22352c'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(190,170,110,.12)'; g.lineWidth = 2; for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 64) { g.beginPath(); g.moveTo(x + 32, y + 4); g.quadraticCurveTo(x + 60, y + 32, x + 32, y + 60); g.quadraticCurveTo(x + 4, y + 32, x + 32, y + 4); g.stroke(); } for (let i = 0; i < 200; i++) { g.fillStyle = `rgba(0,0,0,${X.rnd() * 0.15})`; g.fillRect(X.rnd() * w, X.rnd() * h, 6, 6); } });
  const rugTex = () => X.tex('rug', 512, 512, (g, w, h) => { g.fillStyle = '#5a1f1b'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c29a55'; g.lineWidth = 10; g.strokeRect(20, 20, w - 40, h - 40); g.lineWidth = 4; g.strokeRect(46, 46, w - 92, h - 92); g.fillStyle = '#2b3a4a'; g.beginPath(); g.ellipse(w / 2, h / 2, 140, 100, 0, 0, 7); g.fill(); g.strokeStyle = '#c29a55'; g.beginPath(); g.ellipse(w / 2, h / 2, 110, 76, 0, 0, 7); g.stroke(); for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(0,0,0,${X.rnd() * 0.2})`; g.fillRect(X.rnd() * w, X.rnd() * h, 3, 3); } });

  // ---------- build ----------
  let lamps = {}, reels = [], screen = null, screenY = 0, beam = null, drawer = null, chairObj = null, rainTex = null, portraits = null, eliasGhost = null;
  function build() {
    loadState(); scene = new THREE.Scene(); scene.background = new THREE.Color(0x07070a); scene.fog = new THREE.FogExp2(0x07070a, 0.035);
    cam = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.05, 40); X.cams.add(cam); cam.position.copy(OVERVIEW.pos); cam.lookAt(OVERVIEW.look);
    const W = 9, D = 7, H = 3.1;
    const M = { panel: X.mat({ map: X.woodTex('#3b2618', 'hqpanel'), shininess: 20 }), paper: X.mat({ map: wallpaper() }), floor: X.mat({ map: X.woodTex('#3a2618', 'hqfloor'), shininess: 25 }), ceil: X.mat({ color: 0x1c1814 }), trim: X.mat({ color: 0x2a1b10, shininess: 30 }),
      brass: X.mat({ color: 0xb48a3c, shininess: 90, specular: 0x886633 }), black: X.mat({ color: 0x141414, shininess: 40 }), metal: X.mat({ map: X.metalTex('#5a605c', 'hqm'), shininess: 50 }), olive: X.mat({ map: X.metalTex('#4d5642', 'hqo'), shininess: 40 }), manila: X.mat({ color: 0xcdb27a }), leather: X.mat({ color: 0x4a2a1a, shininess: 30 }), fabric: X.mat({ map: X.fabricTex('#6a3a2a', 'arm') }), wood: X.mat({ map: X.woodTex('#5a3c24', 'hqw') }) };
    const box = (w, h, d, m, x, y, z, ry = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; scene.add(o); return o; };
    const cyl = (a, b, h, m, x, y, z, seg = 16) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(a, b, h, seg), m); o.position.set(x, y, z); o.castShadow = true; scene.add(o); return o; };
    // room shell
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D), M.floor); fl.rotation.x = -Math.PI / 2; fl.material.map.repeat.set(4, 3); fl.receiveShadow = true; scene.add(fl);
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3), X.mat({ map: rugTex() })); rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.005, 0.4); rug.receiveShadow = true; scene.add(rug);
    const ce = new THREE.Mesh(new THREE.PlaneGeometry(W, D), M.ceil); ce.rotation.x = Math.PI / 2; ce.position.y = H; scene.add(ce);
    [[0, -D / 2, 0, W], [-W / 2, 0, Math.PI / 2, D], [W / 2, 0, -Math.PI / 2, D], [0, D / 2, Math.PI, W]].forEach(([x, z, ry, len]) => {
      const up = new THREE.Mesh(new THREE.PlaneGeometry(len, H - 1.1), M.paper); up.material.map.repeat.set(len / 1.2, (H - 1.1) / 1.2); up.position.set(x, 1.1 + (H - 1.1) / 2, z); up.rotation.y = ry; up.receiveShadow = true; scene.add(up);
      const lo = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.1), M.panel); lo.position.set(x, 0.55, z); lo.rotation.y = ry; lo.receiveShadow = true; scene.add(lo);
      const rail = box(len, 0.06, 0.05, M.trim, x + Math.sin(ry) * 0.02, 1.12, z + Math.cos(ry) * 0.02, ry); const crown = box(len, 0.12, 0.08, M.trim, x + Math.sin(ry) * 0.03, H - 0.06, z + Math.cos(ry) * 0.03, ry); void rail; void crown; });
    // EVIDENCE WALL (continue)
    const evMat = new THREE.MeshPhongMaterial({ map: evidenceTex(), shininess: 4 }); const ev = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2.24, 0.06), evMat); ev.position.set(0, 1.72, -D / 2 + 0.05); ev.receiveShadow = true; scene.add(ev);
    box(5.75, 0.08, 0.1, M.trim, 0, 2.87, -D / 2 + 0.06); box(5.75, 0.08, 0.1, M.trim, 0, 0.57, -D / 2 + 0.06);
    const xiii = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.2), new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.0, depthWrite: false })); xiii.position.set(2.12, 1.28, -D / 2 + 0.09); scene.add(xiii);
    Q.evidence = ev;
    // desk + banker's lamp + three files
    const desk = box(1.9, 0.06, 0.9, M.wood, -2.9, 0.78, 0.1, 0.35); [[-0.85, -0.38], [0.85, -0.38], [-0.85, 0.38], [0.85, 0.38]].forEach(([a, b]) => box(0.07, 0.76, 0.07, M.wood, -2.9 + Math.cos(0.35) * a + Math.sin(0.35) * b, 0.38, 0.1 - Math.sin(0.35) * a + Math.cos(0.35) * b, 0.35)); void desk;
    const files = new THREE.Group(); files.position.set(-2.75, 0.815, 0.25); files.rotation.y = 0.35; scene.add(files);
    portraits = makePortraits();
    ['mara', 'gabriel', 'daniel'].forEach((id, i) => { const f = new THREE.Group(); f.position.set(-0.45 + i * 0.42, 0.004 * i, (i - 1) * 0.06); f.rotation.y = (i - 1) * 0.15; files.add(f);
      const folder = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.012, 0.45), M.manila); f.add(folder); const tab = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.012, 0.04), M.manila); tab.position.set(0.08 * (i - 1), 0, -0.24); f.add(tab);
      const photo = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.16), new THREE.MeshBasicMaterial({ map: portraits[id], color: 0xcccccc })); photo.rotation.x = -Math.PI / 2; photo.position.set(-0.07, 0.008, -0.06); photo.rotation.z = (i - 1) * 0.1; f.add(photo);
      const clip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, 0.05), M.metal); clip.position.set(-0.07, 0.012, -0.14); f.add(clip);
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.035), new THREE.MeshBasicMaterial({ map: X.tex('lbl' + id, 256, 64, (g, w, h) => { g.fillStyle = '#efe6cc'; g.fillRect(0, 0, w, h); g.fillStyle = '#1a1a1a'; g.font = 'bold 34px "Courier New", monospace'; g.fillText(id.toUpperCase(), 14, 44); }) })); label.rotation.x = -Math.PI / 2; label.position.set(0.08, 0.008, 0.12); f.add(label); });
    const lampG = new THREE.Group(); lampG.position.set(-3.55, 0.81, -0.1); scene.add(lampG); const lb = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.03, 16), M.brass); lampG.add(lb); const lpole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.38, 8), M.brass); lpole.position.y = 0.2; lampG.add(lpole);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.12, 16, 1, true), X.mat({ color: 0x1f5a3a, side: THREE.DoubleSide, shininess: 80 })); shade.position.set(0.05, 0.4, 0); shade.rotation.z = 0.3; lampG.add(shade);
    lamps.desk = new THREE.PointLight(X.col(0xffc070), 1.3, 5, 1.6); lamps.desk.position.set(-3.45, 1.1, -0.05); scene.add(lamps.desk);
    // ATLAS — globe on a stand
    const gl = new THREE.Group(); gl.position.set(-3.6, 0, -2.3); scene.add(gl); const gb = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.05, 20), M.wood); gb.position.y = 0.03; gl.add(gb); const gp = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.85, 10), M.wood); gp.position.y = 0.46; gl.add(gp);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.015, 8, 40, Math.PI * 1.2), M.brass); ring.position.y = 1.28; ring.rotation.z = 0.4; gl.add(ring);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.37, 32, 24), X.mat({ map: globeTex(), shininess: 40 })); globe.position.y = 1.28; globe.rotation.z = 0.41; globe.userData.anim = true; gl.add(globe); Q.globe = globe;
    // EQUIPMENT TABLE
    const tbl = new THREE.Group(); tbl.position.set(0.1, 0, 1.0); scene.add(tbl); const tt = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.07, 0.95), M.wood); tt.position.y = 0.76; tt.castShadow = tt.receiveShadow = true; tbl.add(tt); [[-1.1, -0.4], [1.1, -0.4], [-1.1, 0.4], [1.1, 0.4]].forEach(([a, b]) => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.74, 0.07), M.wood); l.position.set(a, 0.37, b); tbl.add(l); });
    const on = (m, x, z, y = 0.8, ry = 0) => { m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; tbl.add(m); return m; };
    [-0.9, -0.72].forEach((x, i) => { const f = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.36, 12), M.black); f.rotation.z = Math.PI / 2; on(f, x, -0.2 + i * 0.14, 0.82, 0.2 * i); });
    const cc = new THREE.Group(); on(cc, -0.3, -0.1, 0.8, -0.4); const cb = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.26), M.black); cb.position.y = 0.06; cc.add(cb); const cl2 = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.08, 16), M.black); cl2.rotation.x = Math.PI / 2; cl2.position.set(0, 0.07, -0.16); cc.add(cl2); const vf = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.08), M.black); vf.position.set(0.07, 0.13, 0.08); cc.add(vf);
    const cam35 = new THREE.Group(); on(cam35, 0.1, 0.2, 0.8, 0.3); const c35 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.05), M.black); c35.position.y = 0.04; cam35.add(c35); const top = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.018, 0.05), M.metal); top.position.y = 0.09; cam35.add(top); const ln = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.03, 0.05, 16), M.black); ln.rotation.x = Math.PI / 2; ln.position.set(0, 0.04, -0.05); cam35.add(ln);
    const rec = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.035, 0.08), X.mat({ color: 0x3a3a3e })); on(rec, 0.4, -0.18, 0.8);
    [0.6, 0.72].forEach(x => { const wt = new THREE.Group(); on(wt, x, 0.15, 0.8, 0.2); const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.035), M.olive); b2.position.y = 0.08; wt.add(b2); const an = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 5), M.black); an.position.set(0.02, 0.22, 0); wt.add(an); });
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 8), X.mat({ color: 0x6d1f1a, shininess: 50 })); bar.rotation.z = Math.PI / 2; on(bar, 0.2, 0.33, 0.8, 0.15);
    const salt = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.14, 14), X.mat({ color: 0x2c4a8a })); on(salt, 0.95, -0.25, 0.87);
    const lan = new THREE.Group(); on(lan, 1.0, 0.18, 0.8); const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.17, 14), X.mat({ color: 0xffd08a, emissive: 0xc86a1a, transparent: true, opacity: 0.75 })); lg.position.y = 0.13; lan.add(lg); const lt = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.07, 14), M.black); lt.position.y = 0.26; lan.add(lt); const lb2 = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.04, 14), M.black); lb2.position.y = 0.03; lan.add(lb2); const hdl = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.005, 5, 14, Math.PI), M.black); hdl.position.y = 0.31; lan.add(hdl);
    lamps.lantern = new THREE.PointLight(X.col(0xffa050), 0.8, 3.5, 1.8); lamps.lantern.position.set(1.1, 0.95, 1.18); scene.add(lamps.lantern);
    chairObj = new THREE.Group(); chairObj.position.set(1.35, 0, 1.75); chairObj.rotation.y = Math.PI + 0.2; scene.add(chairObj); const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.46), M.wood); seat.position.y = 0.46; chairObj.add(seat); const back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.05), M.wood); back.position.set(0, 0.73, 0.21); chairObj.add(back); [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].forEach(([a, b]) => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.46, 0.04), M.wood); l.position.set(a, 0.23, b); chairObj.add(l); });
    // PROJECTOR on a cart + pull-down screen
    const pj = new THREE.Group(); pj.position.set(2.4, 0, 1.45); pj.rotation.y = 2.2; scene.add(pj); const cart = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.5), M.metal); cart.position.y = 0.35; pj.add(cart);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 0.42), X.mat({ color: 0x3c3f3a, shininess: 60 })); body.position.y = 0.84; pj.add(body); const lens2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.14, 16), M.black); lens2.rotation.x = Math.PI / 2; lens2.position.set(0, 0.84, -0.27); pj.add(lens2);
    [[0.95, 0.12], [1.02, -0.2]].forEach(([y, z]) => { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 24), X.mat({ color: 0x77776f, shininess: 70 })); r.rotation.z = Math.PI / 2; r.position.set(0.16, y + 0.12, z); pj.add(r); const sp = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.25, 0.025), M.black); sp.position.set(0.16, y + 0.12, z); pj.add(sp); reels.push(r, sp); r.userData.anim = sp.userData.anim = true; });
    beam = new THREE.Mesh(new THREE.ConeGeometry(1.0, 3.9, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); beam.rotation.x = -Math.PI / 2; beam.position.set(0, 0.84 + 0.2, -2.2); beam.userData.anim = true; pj.add(beam);
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 12), M.black); roll.rotation.z = Math.PI / 2; roll.position.set(W / 2 - 0.12, 2.85, 0.2); roll.rotation.y = Math.PI / 2; scene.add(roll);
    screen = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.6), new THREE.MeshPhongMaterial({ color: 0xe8e4d8, emissive: 0x000000, side: THREE.DoubleSide })); screen.rotation.y = -Math.PI / 2; screen.position.set(W / 2 - 0.13, 2.85, 0.2); screen.scale.y = 0.01; screen.userData.anim = true; scene.add(screen);
    lamps.proj = new THREE.SpotLight(X.col(0xfff0d0), 0, 8, 0.35, 0.5, 1); lamps.proj.position.set(2.4, 1.1, 1.45); lamps.proj.target.position.set(W / 2, 1.9, 0.2); scene.add(lamps.proj, lamps.proj.target);
    // FILING CABINETS (case archive)
    const cabs = new THREE.Group(); cabs.position.set(3.45, 0, -3.05); cabs.rotation.y = Math.PI; scene.add(cabs);
    [0, 0.62, 1.24].forEach((z, i) => { const c = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.35, 0.7), M.olive); c.position.set(z - 0.62, 0.675, 0); c.castShadow = true; cabs.add(c); for (let d = 0; d < 4; d++) { const h2 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.03), M.brass); h2.position.set(z - 0.62, 0.22 + d * 0.32, -0.36); cabs.add(h2); const card2 = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.04), new THREE.MeshBasicMaterial({ color: 0xe8e0c8 })); card2.position.set(z - 0.62, 0.27 + d * 0.32, -0.352); card2.rotation.y = Math.PI; cabs.add(card2); } if (i === 1) { drawer = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.28, 0.66), M.olive); drawer.position.set(z - 0.62, 0.86, 0); drawer.userData.anim = true; cabs.add(drawer); } });
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.22), new THREE.MeshBasicMaterial({ map: X.signTex('CASE ARCHIVE', '#2a2014', '#d8c690') })); plaque.position.set(0, 1.55, -0.36); plaque.rotation.y = Math.PI; cabs.add(plaque); Q.cabs = cabs;
    // ARMCHAIR + side table + ELIAS'S JOURNAL
    const ac = new THREE.Group(); ac.position.set(3.7, 0, -1.05); ac.rotation.y = -Math.PI / 2 - 0.35; scene.add(ac); const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.4, 0.8), M.fabric); s1.position.y = 0.3; ac.add(s1); const bk = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.75, 0.18), M.fabric); bk.position.set(0, 0.8, 0.33); ac.add(bk); [-0.4, 0.4].forEach(x => { const a2 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 0.8), M.fabric); a2.position.set(x, 0.6, 0); ac.add(a2); }); ac.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.04, 20), M.wood); st.position.set(2.9, 0.62, -1.75); scene.add(st); const stl = cyl(0.03, 0.05, 0.6, M.wood, 2.9, 0.31, -1.75, 8); void stl;
    const book = new THREE.Group(); book.position.set(2.9, 0.66, -1.75); book.rotation.y = 0.5; scene.add(book); const cover = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.27), M.leather); book.add(cover); const pages = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.035, 0.26), X.mat({ color: 0xe0d4b4 })); pages.position.set(0.004, 0, 0); book.add(pages); const strap = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.045, 0.28), M.leather); strap.position.x = 0.07; book.add(strap); Q.book = book;
    // RADIO on a shelf (settings)
    const radio = new THREE.Group(); radio.position.set(-2.15, 0.81, -0.15); radio.rotation.y = 0.35 + Math.PI * 0.15; scene.add(radio); const rb = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.26, 0.18), M.wood); rb.position.y = 0.13; radio.add(rb); const dial = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.08), new THREE.MeshBasicMaterial({ color: 0xffc27a })); dial.position.set(-0.06, 0.17, 0.091); radio.add(dial); [0.12, 0.18].forEach(x => { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 12), M.black); k.rotation.x = Math.PI / 2; k.position.set(x, 0.1, 0.1); radio.add(k); }); Q.radio = radio;
    // family photograph (Evelyn) on the left wall + WINDOW with rain on the left wall
    const ph = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.38), new THREE.MeshBasicMaterial({ map: X.tex('famphoto', 256, 192, (g, w, h) => { g.fillStyle = '#3a2c1c'; g.fillRect(0, 0, w, h); g.fillStyle = '#d6c7a4'; g.fillRect(12, 12, w - 24, h - 24); const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#8a7656'); gr.addColorStop(1, '#3c3020'); g.fillStyle = gr; g.fillRect(20, 20, w - 40, h - 40); for (let i = 0; i < 5; i++) { g.fillStyle = '#1a140c'; g.beginPath(); g.arc(50 + i * 38, 85, 13, 0, 7); g.fill(); g.fillRect(40 + i * 38, 100, 22, 60); } }), color: 0xbbbbbb })); ph.position.set(-W / 2 + 0.02, 1.9, -0.9); ph.rotation.y = Math.PI / 2; scene.add(ph); Q.photo = ph;
    rainTex = X.tex('rain', 128, 256, (g, w, h) => { g.fillStyle = '#0c1422'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(170,190,230,.35)'; for (let i = 0; i < 70; i++) { const x = X.rnd() * w, y = X.rnd() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 2, y + 10 + X.rnd() * 14); g.stroke(); } });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.4), new THREE.MeshBasicMaterial({ map: rainTex })); win.position.set(-W / 2 + 0.03, 1.85, -2.6); win.rotation.y = Math.PI / 2; scene.add(win);
    [[0, 0.72, 1.2, 0.06], [0, -0.72, 1.2, 0.08], [0.57, 0, 0.06, 1.5], [-0.57, 0, 0.06, 1.5], [0, 0, 0.04, 1.4], [0, 0, 1.1, 0.04]].forEach(([y2, z2, w2, h2]) => { const f = new THREE.Mesh(new THREE.BoxGeometry(0.06, h2 === 1.5 || h2 === 1.4 ? h2 : h2, w2 === 1.2 || w2 === 1.1 ? w2 : 0.06), M.trim); f.position.set(-W / 2 + 0.05, 1.85 + z2 * 0 + (Math.abs(z2) === 0.72 ? z2 : 0), -2.6 + y2); scene.add(f); });
    lamps.moon = new THREE.PointLight(X.col(0x6f86c8), 0.6, 6, 1.5); lamps.moon.position.set(-W / 2 + 0.6, 1.9, -2.6); scene.add(lamps.moon);
    // pendant ceiling lamp — the room's key light (it can fail)
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.7, 5), M.black); cord.position.set(0, H - 0.35, 0.2); scene.add(cord); const pshade = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.22, 20, 1, true), X.mat({ color: 0x2a3a2a, side: THREE.DoubleSide, shininess: 60 })); pshade.position.set(0, H - 0.78, 0.2); scene.add(pshade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe0a0 })); bulb.position.set(0, H - 0.86, 0.2); bulb.userData.anim = true; scene.add(bulb); lamps.bulb = bulb;
    lamps.key = new THREE.PointLight(X.col(0xffd9a0), 1.4, 9, 1.4); lamps.key.position.set(0, H - 0.95, 0.2); if (X.Q().shadows) { lamps.key.castShadow = true; lamps.key.shadow.mapSize.set(1024, 1024); lamps.key.shadow.bias = -0.001; } scene.add(lamps.key);
    lamps.board = new THREE.SpotLight(X.col(0xffe6c0), 1.3, 8, 0.75, 0.6, 1.2); lamps.board.position.set(0, 2.9, -1.2); lamps.board.target.position.set(0, 1.6, -D / 2); scene.add(lamps.board, lamps.board.target);
    scene.add(new THREE.HemisphereLight(X.col(0x4a4f5e), X.col(0x2a1c12), 0.42));
    // Elias — reserved: a figure that can stand in the doorway after the reveal
    eliasGhost = T13.hollow.build(); eliasGhost.setReveal('shadow'); eliasGhost.root.position.set(3.9, 0, 3.2); eliasGhost.root.scale.setScalar(0.78); eliasGhost.root.visible = false; scene.add(eliasGhost.root);
    // hotspots
    const SHORT = { cases: 'ATLAS', characters: 'FILES', dossiers: 'ARCHIVE', settings: 'RADIO' }; const HS = (name, label, obj, camPos, look) => hot.push({ name, label, short: SHORT[name], obj, cam: { pos: camPos, look } });
    HS('continue', 'CONTINUE', ev, new V(0.4, 1.7, -0.6), new V(0.4, 1.6, -D / 2));
    HS('cases', 'CASES · ATLAS', globe, new V(-2.7, 1.55, -1.35), new V(-3.6, 1.28, -2.3));
    HS('characters', 'INVESTIGATORS', files, new V(-2.45, 1.75, 0.95), new V(-2.8, 0.8, 0.2));
    HS('loadout', 'LOADOUT', tbl, new V(0.1, 1.75, 2.4), new V(0.1, 0.8, 1.0));
    HS('theater', 'THEATER', pj, new V(0.6, 1.6, 1.6), new V(W / 2, 1.9, 0.0));
    HS('dossiers', 'CASE ARCHIVE', cabs, new V(2.9, 1.55, -1.2), new V(3.45, 0.9, -3.05));
    HS('lore', 'CODEX', book, new V(2.3, 1.3, -0.9), new V(2.9, 0.66, -1.75));
    HS('settings', 'SETTINGS', radio, new V(-1.6, 1.35, 0.7), new V(-2.15, 0.95, -0.15));
    scene.traverse(o => { if (o.isMesh && o.receiveShadow === false && o.material && !o.material.isMeshBasicMaterial) o.receiveShadow = true; });
    Q.evidence.userData.anim = true; xiii.userData.anim = true; Q.photo.userData.anim = true; const kept = new Set(hot.map(h => h.obj)); Q.baked = X.bake(scene, m => !!m.userData.anim || kept.has(m));
    applyState(); built = true;
  }
  function makePortraits() {
    // real portraits of the actual character models, rendered once into textures for the files and the dossier
    const out = {}, r = X.renderer, sc = new THREE.Scene(); sc.background = new THREE.Color(0x6e6452); sc.add(new THREE.HemisphereLight(0xd8d0c0, 0x40362a, 1.0)); const k = new THREE.DirectionalLight(0xfff0dc, 0.9); k.position.set(-1, 2, -2); sc.add(k);
    const pc = new THREE.PerspectiveCamera(24, 0.8, 0.05, 10);
    ['mara', 'gabriel', 'daniel'].forEach(id => { const p = T13.people.build(id); sc.add(p.root); p.update(0.016, {}); p.setExpr('neutral'); for (let i = 0; i < 20; i++) p.update(0.05, {}); const hy = p.head.getWorldPosition(new V()).y; pc.position.set(0, hy - 0.02, -0.95); pc.lookAt(0, hy - 0.06, 0);
      const rt = new THREE.WebGLRenderTarget(256, 320); rt.texture.encoding = THREE.sRGBEncoding; r.setRenderTarget(rt); r.render(sc, pc); r.setRenderTarget(null); out[id] = rt.texture;
      // also a DOM image for the dossier UI
      const px = new Uint8Array(256 * 320 * 4); r.readRenderTargetPixels(rt, 0, 0, 256, 320, px); const cv = document.createElement('canvas'); cv.width = 256; cv.height = 320; const g = cv.getContext('2d'); const img = g.createImageData(256, 320); for (let y = 0; y < 320; y++) img.data.set(px.subarray((319 - y) * 1024, (320 - y) * 1024), y * 1024); g.putImageData(img, 0, 0); Q.portraitURL = Q.portraitURL || {}; Q.portraitURL[id] = cv.toDataURL('image/jpeg', 0.85);
      sc.remove(p.root); });
    return out;
  }
  function applyState() {
    const S = Q.state; if (!Q.evidence) return; Q.evidence.material.map = evidenceTex(); Q.evidence.material.needsUpdate = true;
    if (chairObj) chairObj.position.x = S.chairMoved ? 1.9 : 1.35; if (chairObj) chairObj.rotation.y = S.chairMoved ? Math.PI - 0.6 : Math.PI + 0.2;
  }
  Q.setState = patch => { Object.assign(Q.state, patch); applyState(); };

  // ---------- camera + interaction ----------
  const ease = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  let camLook = OVERVIEW.look.clone();
  function flyTo(pos, look, secs = 1.2, done) { tween = { from: cam.position.clone(), fromL: camLook.clone(), pos: pos.clone(), look: look.clone(), t: 0, secs, done }; }
  Q.focusOn = (name, done) => { const h = hot.find(x => x.name === name); if (!h) return; focus = name; hideLabels(); flyTo(h.cam.pos, h.cam.look, 1.2, () => { act(name, true); done && done(); }); };
  Q.back = () => { if (focus) act(focus, false); focus = null; flyTo(OVERVIEW.pos, OVERVIEW.look, 1.1, () => showLabels()); };
  function act(name, on) {
    if (name === 'theater') { Q.projector = on; if (on) T13.audio.creak(2.6, 1, 1.4); }
    if (name === 'dossiers') Q.drawerOpen = on;
    if (name === 'lore') Q.bookOpen = on;
  }
  // labels: small, period-appropriate tags floating near each object (always visible on touch, on hover with a mouse)
  let labelEls = [];
  function showLabels() { hideLabels(); const touch = matchMedia('(pointer: coarse)').matches; hot.forEach(h => { const el = document.createElement('button'); el.className = 'hq-tag'; el.textContent = touch && h.short ? h.short : h.label; el.dataset.name = h.name; el.onclick = e => { e.stopPropagation(); select(h.name); }; if (!touch) el.classList.add('quiet'); document.getElementById('hq').appendChild(el); labelEls.push({ el, h }); }); }
  function hideLabels() { labelEls.forEach(l => l.el.remove()); labelEls = []; }
  function placeLabels() { const boxes = []; labelEls.forEach(({ el, h }) => { const p = h.obj.getWorldPosition(new V()); p.y += h.name === 'continue' ? 1.25 : h.name === 'cases' ? 0.35 : 0.45; if (h.name === 'continue') p.x += 2.1; p.project(cam); const vis = p.z < 1; el.style.display = vis ? '' : 'none'; el.style.left = ((p.x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - p.y) / 2 * innerHeight) + 'px'; el.classList.toggle('hover', hover === h.name); if (!vis) return; let top = (1 - p.y) / 2 * innerHeight; const w2 = el.offsetWidth, h2 = el.offsetHeight, left = (p.x + 1) / 2 * innerWidth - w2 / 2; for (let k = 0; k < 6; k++) { const hit = boxes.find(b => left < b.r && left + w2 > b.l && top - h2 < b.b && top > b.t); if (!hit) break; top = hit.b + h2 + 3; } el.style.top = top + 'px'; boxes.push({ l: left, r: left + w2, t: top - h2, b: top }); }); }
  function select(name) { T13.audio.init(); if (tween) return; onSelect && onSelect(name); }
  function pick(cx, cy) { ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(ndc, cam); const hits = ray.intersectObjects(hot.map(h => h.obj), true); if (!hits.length) return null; let o = hits[0].object; while (o) { const h = hot.find(x => x.obj === o); if (h) return h.name; o = o.parent; } return null; }
  function onDown(e) { if (!active || focus || e.target !== X.renderer.domElement) return; const n = pick(e.clientX, e.clientY); if (n) select(n); }
  function onMove(e) { if (!active || focus) return; hover = pick(e.clientX, e.clientY); X.renderer.domElement.style.cursor = hover ? 'pointer' : ''; }

  // ---------- run ----------
  Q.enter = (selectCb, opts = {}) => {
    X.initRenderer(document.getElementById('view')); if (!built) build(); else { loadState(); applyState(); }
    onSelect = selectCb; active = true; focus = null; tween = null;
    if (opts.reveal) { cam.position.set(0.3, 1.7, 3.45); camLook.set(0, 1.5, 0); flyTo(OVERVIEW.pos, OVERVIEW.look, 3.2, () => showLabels()); lamps.key.intensity = 0; Q.revealT = 0; }
    else { cam.position.copy(OVERVIEW.pos); camLook.copy(OVERVIEW.look); showLabels(); }
    addEventListener('pointerdown', onDown); addEventListener('pointermove', onMove);
    last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  };
  Q.exit = () => { active = false; hideLabels(); cancelAnimationFrame(raf); removeEventListener('pointerdown', onDown); removeEventListener('pointermove', onMove); X.renderer.domElement.style.cursor = ''; };
  Q.isActive = () => active; Q.focused = () => focus; Q.screenRect = () => { if (!screen) return null; const pts = [[-1.1, 0.8], [1.1, -0.8]].map(([a, b]) => { const v = new V(screen.position.x, screen.position.y + b * screen.scale.y, screen.position.z - a).project(cam); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; }); return { left: Math.min(pts[0][0], pts[1][0]), top: Math.min(pts[0][1], pts[1][1]), right: Math.max(pts[0][0], pts[1][0]), bottom: Math.max(pts[0][1], pts[1][1]) }; };
  let manT = 25;
  function loop(now) {
    if (!active) return; raf = requestAnimationFrame(loop); const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now; t += dt;
    if (tween) { tween.t += dt / tween.secs; const k = ease(Math.min(1, tween.t)); cam.position.lerpVectors(tween.from, tween.pos, k); camLook.lerpVectors(tween.fromL, tween.look, k); if (tween.t >= 1) { const d = tween.done; tween = null; d && d(); } }
    else if (!focus) { cam.position.x = OVERVIEW.pos.x + Math.sin(t * 0.15) * 0.08; cam.position.y = OVERVIEW.pos.y + Math.sin(t * 0.21) * 0.03; }
    cam.lookAt(camLook);
    // key lamp: fades up on the reveal; occasional failure (lampFailing makes it worse)
    const fail = Q.state.lampFailing ? 0.06 : 0.008; let key = 1.4; if (Q.revealT !== undefined) { Q.revealT += dt; key = Math.min(1.4, Math.max(0, (Q.revealT - 0.6) * 1.4)); if (Q.revealT > 3) Q.revealT = undefined; }
    if (Math.random() < fail) key *= 0.15; lamps.key.intensity = key; lamps.bulb.material.color.setScalar(key > 0.5 ? 1 : 0.3);
    lamps.lantern.intensity = 0.7 + Math.sin(t * 9) * 0.08 + Math.sin(t * 23) * 0.05;
    // projector: reels spin, beam, screen lowers
    const pOn = !!Q.projector; screenY += ((pOn ? 1 : 0) - screenY) * Math.min(1, dt * 2.2); screen.scale.y = Math.max(0.01, screenY); screen.position.y = 2.85 - 0.8 * screenY;
    reels.forEach((r, i) => { if (pOn) r.rotation.x += dt * (i % 2 ? 6 : 5); }); beam.material.opacity = pOn ? 0.09 + Math.random() * 0.02 : 0; lamps.proj.intensity = pOn ? 2.2 * screenY : 0; screen.material.emissive.setScalar(pOn ? 0.18 * screenY : 0);
    if (drawer) drawer.position.z += ((Q.drawerOpen ? -0.45 : 0) - drawer.position.z) * Math.min(1, dt * 5);
    if (rainTex) rainTex.offset.y -= dt * 0.6; if (Q.globe) Q.globe.rotation.y += dt * (focus === 'cases' ? 0.25 : 0.05);
    // occasional manifestation: a lamp stutter + a knock, or (after the reveal) a figure in the doorway for an instant
    manT -= dt; if (manT <= 0 && !focus) { manT = 35 + Math.random() * 50; lamps.key.intensity *= 0.1; T13.audio.step(3.9, 0.2, 3.2, true, 0.25); if (Q.state.eliasSeen) { eliasGhost.root.visible = true; setTimeout(() => { eliasGhost.root.visible = false; }, 350); } }
    placeLabels(); X.renderer.render(scene, cam); X.perfTick(X.renderer);
  }
})();
