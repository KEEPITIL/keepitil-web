/* The Ashgrove wing — a FICTIONAL gray-box location (prologue). One grid, 3 m cells.
   # wall · . floor · D door · L locker (hide) · F fuse box · C heavy cabinet (Gabriel) · W false wall (Daniel)
   U fuse · M music box (Mara) · E exit door (keypad) · S start · H where the Hollow waits */
(function () {
  const MAP = [
    '##########################',
    '#.......#.........#......#',
    '#..S....D.........D....M.#',
    '#.F.....#....L....#......#',
    '####D####.........########',
    '#.......####.#####.......#',
    '#.L.....#.........#......#',
    '#.......#.........C...H..#',
    '#.......#.........#....L.#',
    '#####D###.........####W###',
    '#.......#.........#......#',
    '#...L...#...L.....#....U.#',
    '#.......D.........#......#',
    '#.E.....#.........#......#',
    '##########################',
  ];
  const S = 3, H = 3.2;
  const L = T13.level = { MAP, S, H, W: MAP[0].length, R: MAP.length };
  L.cell = (x, z) => [Math.floor(x / S), Math.floor(z / S)];
  L.center = (c, r) => ({ x: c * S + S / 2, z: r * S + S / 2 });
  L.find = ch => { const out = []; MAP.forEach((row, r) => [...row].forEach((k, c) => { if (k === ch) out.push({ c, r }); })); return out; };

  /* zones give each part of the wing its own paint, floor and light — subconscious navigation */
  const ZONES = {
    lobby: { wall: ['#5f7563', '#d2c9ae', '#3a463b'], floor: ['#847d6f', '#6b665a'], light: { col: 0xd9e4ff, i: 0.9, d: 13, kind: 'fluor' } },
    archive: { wall: ['#5b4330', '#bba57c', '#3a2a1c'], floor: ['#6e5a44', '#5a4836'], light: { col: 0xffb05a, i: 1.3, d: 10, kind: 'lamp' } },
    hall: { wall: ['#58705f', '#cfc5a8', '#36443a'], floor: ['#78756a', '#64625a'], light: { col: 0xff3a24, i: 0.9, d: 11, kind: 'emergency' } },
    dayroom: { wall: ['#4c7470', '#d8d0a6', '#2e4745'], floor: ['#877f66', '#746d57'], light: { col: 0x8aa4ff, i: 0.8, d: 11, kind: 'moon' } },
    ward: { wall: ['#9db3ba', '#dcdcd2', '#6d8289'], floor: ['#b3b6ad', '#a2a59c'], light: { col: 0xcfe6ff, i: 1.1, d: 12, kind: 'clinical' } },
    utility: { wall: null, floor: null, light: { col: 0xffc26e, i: 1.2, d: 10, kind: 'bulb' } },
    exitway: { wall: ['#6a3b36', '#d0c6aa', '#442522'], floor: ['#807a6c', '#6a655a'], light: { col: 0x55ff95, i: 0.7, d: 9, kind: 'exit' } },
  };
  L.ZONES = ZONES;
  L.zoneOf = (c, r) => {
    if (c >= 19) return r <= 3 ? 'dayroom' : r <= 8 ? 'ward' : 'utility';
    if (c <= 7) return r <= 4 ? 'lobby' : r <= 9 ? 'archive' : 'exitway';
    return 'hall';
  };
  L.build = (scene) => {
    const X = T13.gfx, q = X.Q();
    const st = L.st = {};   // live cell state: doors open?, cabinet moved?, false wall gone?
    const grid = L.grid = MAP.map(row => [...row]);
    const isSolid = (c, r) => r < 0 || c < 0 || r >= L.R || c >= L.W || grid[r][c] === '#';
    // --- materials per zone
    const ZM = {};
    for (const [z, d] of Object.entries(ZONES)) {
      const wallMap = d.wall ? X.wallTex(d.wall[0], d.wall[1], d.wall[2], 'w' + z) : X.concreteTex();
      const floorMap = d.floor ? X.tileTex(d.floor[0], d.floor[1], 'f' + z) : X.concreteTex();
      ZM[z] = { wall: X.mat({ map: wallMap, bumpMap: X.wallBump(), bumpScale: 0.02 }), floor: X.mat({ map: floorMap, shininess: 18, specular: 0x222222 }) };
    }
    const ceilMat = X.mat({ map: X.ceilTex() }), concCeil = X.mat({ map: X.concreteTex(), color: 0x8a8a84 });
    // --- wall faces: one quad per floor-cell side that touches solid wall, textured by the zone it faces; merged per zone
    const wallParts = {}, fwParts = {}, floorParts = {}, ceilParts = { tile: [], conc: [] };
    const quad = new THREE.PlaneGeometry(S, H), fquad = new THREE.PlaneGeometry(S, S);
    const DIRS = [[0, -1, 0], [1, 0, -Math.PI / 2], [0, 1, Math.PI], [-1, 0, Math.PI / 2]];   // neighbour offset → quad faces back into this cell
    grid.forEach((row, r) => row.forEach((k, c) => {
      if (k === '#' || k === 'W') return; const z = L.zoneOf(c, r), p = L.center(c, r);
      (floorParts[z] = floorParts[z] || []).push({ geo: fquad, matrix: new THREE.Matrix4().makeRotationX(-Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(p.x, 0, p.z)) });
      (z === 'utility' ? ceilParts.conc : ceilParts.tile).push({ geo: fquad, matrix: new THREE.Matrix4().makeRotationX(Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(p.x, H, p.z)) });
      for (const [dc, dr, ry] of DIRS) { const nc = c + dc, nr = r + dr; const nk = (nr >= 0 && nc >= 0 && nr < L.R && nc < L.W) ? grid[nr][nc] : '#'; if (nk !== '#' && nk !== 'W') continue;
        const m = new THREE.Matrix4().makeRotationY(ry).premultiply(new THREE.Matrix4().makeTranslation(p.x + dc * S / 2, H / 2, p.z + dr * S / 2));
        ((nk === 'W' ? fwParts : wallParts)[z] = (nk === 'W' ? fwParts : wallParts)[z] || []).push({ geo: quad, matrix: m }); }
    }));
    for (const z in wallParts) { const m = new THREE.Mesh(X.merge(wallParts[z]), ZM[z].wall); m.receiveShadow = true; scene.add(m); }
    for (const z in floorParts) { const m = new THREE.Mesh(X.merge(floorParts[z]), ZM[z].floor); m.receiveShadow = true; scene.add(m); }
    scene.add(new THREE.Mesh(X.merge(ceilParts.tile), ceilMat)); if (ceilParts.conc.length) scene.add(new THREE.Mesh(X.merge(ceilParts.conc), concCeil));
    L.objects = []; const add = (o, c, r, kind) => { o.userData = { ...o.userData, c, r, kind }; scene.add(o); L.objects.push(o); return o; };
    const P = L.center;
    // --- static prop batching: everything that never moves is merged per material (few draw calls)
    const batches = new Map(); const B = (mat) => { if (!batches.has(mat)) batches.set(mat, []); return batches.get(mat); };
    const put = (mat, geo, x, y, z, ry = 0, rx = 0, rz = 0) => { const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)).premultiply(new THREE.Matrix4().makeTranslation(x, y, z)); B(mat).push({ geo, matrix: m }); };
    const bx = (w, h, d) => new THREE.BoxGeometry(w, h, d), cy = (a, b, h, s = 10) => new THREE.CylinderGeometry(a, b, h, s);
    const M = {
      wood: X.mat({ map: X.woodTex('#6b4a2e') }), darkwood: X.mat({ map: X.woodTex('#3c2a1c', 'dw') }), metal: X.mat({ map: X.metalTex('#6a716d'), shininess: 40 }), metalG: X.mat({ map: X.metalTex('#4d5a52', 'mg'), shininess: 40 }),
      chrome: X.mat({ color: 0xa9aca8, shininess: 80, specular: 0x666666 }), sheet: X.mat({ map: X.fabricTex('#d8d4c8') }), mattress: X.mat({ map: X.fabricTex('#8a9aa0', 'mat') }), vinyl: X.mat({ color: 0x3b4a58, shininess: 30 }),
      paper: X.mat({ map: X.paperTex(12), side: THREE.DoubleSide }), pipe: X.mat({ color: 0x6c6a62, shininess: 30 }), pipeR: X.mat({ color: 0x7a3a2a, shininess: 30 }), black: X.mat({ color: 0x151515 }), cork: X.mat({ color: 0x8e6a45 }),
      curtain: X.mat({ color: 0x9fb4a8, side: THREE.DoubleSide, map: X.fabricTex('#ffffff', 'cloth') }), pot: X.mat({ color: 0x7a4a30 }), deadplant: X.mat({ color: 0x4a4a2a }), glass: X.mat({ color: 0x0e1a28, emissive: 0x0c1a30, shininess: 90, specular: 0x8899aa }),
      fixture: X.mat({ color: 0xe8e8e0, emissive: 0x000000 }),
    };
    L.fixtureMat = M.fixture;
    const zc = (c, r) => P(c, r);
    // ceiling fluorescent troffers + pipes in the hall
    for (let r = 1; r <= 13; r += 2) { const p = zc(13, r); put(M.fixture, bx(1.2, 0.07, 0.35), p.x, H - 0.04, p.z); }
    [[4, 2], [4, 6], [4, 11], [21, 6], [21, 5], [21, 2]].forEach(([c, r]) => { const p = zc(c, r); put(M.fixture, bx(1.2, 0.07, 0.35), p.x, H - 0.04, p.z); });
    put(M.pipe, cy(0.07, 0.07, 13 * S), 9 * S + 0.3, H - 0.25, 7.5 * S, 0, Math.PI / 2); put(M.pipeR, cy(0.05, 0.05, 13 * S), 9 * S + 0.55, H - 0.18, 7.5 * S, 0, Math.PI / 2);
    put(M.pipe, cy(0.06, 0.06, 13 * S), 18 * S - 0.3, H - 0.22, 7.5 * S, 0, Math.PI / 2);
    for (let r = 1; r <= 13; r += 3) put(M.pipe, bx(0.12, 0.2, 0.06), 9 * S + 0.3, H - 0.12, r * S);   // pipe brackets
    const chair = (x, z, ry, tipped = false) => { const g = [[bx(0.45, 0.05, 0.45), 0, 0.46, 0], [bx(0.45, 0.45, 0.05), 0, 0.72, 0.2], [cy(0.018, 0.018, 0.46, 6), -0.19, 0.23, -0.19], [cy(0.018, 0.018, 0.46, 6), 0.19, 0.23, -0.19], [cy(0.018, 0.018, 0.46, 6), -0.19, 0.23, 0.19], [cy(0.018, 0.018, 0.46, 6), 0.19, 0.23, 0.19]];
      g.forEach(([geo, a, b, c2], i) => { const m = new THREE.Matrix4().makeTranslation(a, b, c2); if (tipped) m.premultiply(new THREE.Matrix4().makeRotationX(Math.PI / 2 * 0.95)).premultiply(new THREE.Matrix4().makeTranslation(0, 0.23, 0)); m.premultiply(new THREE.Matrix4().makeRotationY(ry)).premultiply(new THREE.Matrix4().makeTranslation(x, 0, z)); B(i < 2 ? M.vinyl : M.chrome).push({ geo, matrix: m }); }); };
    const desk = (x, z, ry, w = 1.5) => { put(M.darkwood, bx(w, 0.05, 0.75), x, 0.76, z, ry); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => { const dx = a * (w / 2 - 0.06), dz = b * 0.3; put(M.metal, bx(0.05, 0.74, 0.05), x + Math.cos(ry) * dx + Math.sin(ry) * dz, 0.37, z - Math.sin(ry) * dx + Math.cos(ry) * dz, ry); }); put(M.darkwood, bx(0.45, 0.6, 0.7), x + Math.cos(ry) * (w / 2 - 0.25), 0.42, z - Math.sin(ry) * (w / 2 - 0.25), ry); };
    const cabinetF = (x, z, ry) => { put(M.metalG, bx(0.5, 1.35, 0.62), x, 0.675, z, ry); for (let i = 0; i < 4; i++) put(M.chrome, bx(0.14, 0.025, 0.03), x - Math.sin(ry) * 0.32, 0.25 + i * 0.3, z - Math.cos(ry) * 0.32, ry); };
    const papers = (x, z, n = 6, spread = 1) => { for (let i = 0; i < n; i++) put(M.paper, new THREE.PlaneGeometry(0.21, 0.29), x + (X.rnd() - 0.5) * spread, 0.005 + i * 0.001, z + (X.rnd() - 0.5) * spread, X.rnd() * 6, -Math.PI / 2); };
    const bed = (x, z, ry) => { put(M.chrome, bx(0.95, 0.05, 2.0), x, 0.55, z, ry); put(M.mattress, bx(0.9, 0.16, 1.95), x, 0.66, z, ry); put(M.sheet, bx(0.93, 0.05, 1.3), x + Math.sin(ry) * 0.3, 0.76, z + Math.cos(ry) * 0.3, ry); put(M.sheet, bx(0.55, 0.12, 0.35), x - Math.sin(ry) * 0.75, 0.8, z - Math.cos(ry) * 0.75, ry);
      [[-0.45, -0.95], [0.45, -0.95], [-0.45, 0.95], [0.45, 0.95]].forEach(([a, b]) => put(M.chrome, cy(0.02, 0.02, 0.55, 6), x + Math.cos(ry) * a + Math.sin(ry) * b, 0.28, z - Math.sin(ry) * a + Math.cos(ry) * b)); put(M.chrome, bx(0.95, 0.5, 0.04), x - Math.sin(ry) * 1.0, 0.85, z - Math.cos(ry) * 1.0, ry); };
    const bench = (x, z, ry) => { put(M.wood, bx(1.6, 0.06, 0.4), x, 0.45, z, ry); put(M.wood, bx(1.6, 0.35, 0.05), x - Math.sin(ry) * 0.2, 0.7, z - Math.cos(ry) * 0.2, ry); put(M.metal, bx(0.05, 0.45, 0.35), x + Math.cos(ry) * 0.7, 0.22, z - Math.sin(ry) * 0.7, ry); put(M.metal, bx(0.05, 0.45, 0.35), x - Math.cos(ry) * 0.7, 0.22, z + Math.sin(ry) * 0.7, ry); };
    const wheelchair = (x, z, ry) => { put(M.vinyl, bx(0.45, 0.05, 0.45), x, 0.5, z, ry); put(M.vinyl, bx(0.45, 0.45, 0.05), x - Math.sin(ry) * 0.22, 0.75, z - Math.cos(ry) * 0.22, ry); [-1, 1].forEach(s => put(M.chrome, new THREE.TorusGeometry(0.3, 0.02, 6, 18), x + Math.cos(ry) * s * 0.26, 0.32, z - Math.sin(ry) * s * 0.26, ry + Math.PI / 2)); };
    const shelves = (x, z, ry) => { for (let i = 0; i < 4; i++) put(M.metal, bx(1.2, 0.03, 0.4), x, 0.3 + i * 0.5, z, ry); [[-0.58, -0.18], [0.58, -0.18], [-0.58, 0.18], [0.58, 0.18]].forEach(([a, b]) => put(M.metal, bx(0.03, 1.9, 0.03), x + Math.cos(ry) * a + Math.sin(ry) * b, 0.95, z - Math.sin(ry) * a + Math.cos(ry) * b, ry)); for (let i = 0; i < 7; i++) put(X.rnd() < 0.5 ? M.cork : M.sheet, bx(0.25 + X.rnd() * 0.1, 0.2 + X.rnd() * 0.12, 0.28), x + Math.cos(ry) * (-0.45 + (i % 4) * 0.3), 0.43 + Math.floor(i / 4) * 1.0, z - Math.sin(ry) * (-0.45 + (i % 4) * 0.3), ry + X.rnd() * 0.3); };
    const wallZ = (c, r, side) => { const p = P(c, r); return { x: p.x + (side === 'e' ? S / 2 - 0.02 : side === 'w' ? -S / 2 + 0.02 : 0), z: p.z + (side === 's' ? S / 2 - 0.02 : side === 'n' ? -S / 2 + 0.02 : 0), ry: { n: 0, s: Math.PI, e: -Math.PI / 2, w: Math.PI / 2 }[side] }; };
    const sign = (text, c, r, side, y = 2.45, bg, fg, w = 1.1) => { const at2 = wallZ(c, r, side); const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: X.signTex(text, bg, fg), color: 0x9a9a9a })); m.position.set(at2.x + Math.sin(at2.ry) * -0.01, y, at2.z + Math.cos(at2.ry) * -0.01); m.rotation.y = at2.ry; scene.add(m); return m; };
    // LOBBY: reception desk, waiting chairs, notice board, dead plant, clock
    { const p = P(5, 1); put(M.darkwood, bx(2.4, 1.05, 0.6), p.x, 0.52, p.z + 0.2); put(M.darkwood, bx(2.5, 0.05, 0.75), p.x, 1.07, p.z + 0.2); papers(p.x - 0.3, p.z + 0.2, 0); }
    [0, 1, 2].forEach(i => chair(P(6, 3).x - 0.8 + i * 0.55, P(6, 3).z + 0.9, Math.PI)); chair(P(1, 1).x + 0.2, P(1, 1).z + 0.3, 0.6, true);
    { const at2 = wallZ(1, 2, 'w'); put(M.cork, bx(0.04, 0.9, 1.4), at2.x, 1.6, at2.z); for (let i = 0; i < 5; i++) put(M.paper, new THREE.PlaneGeometry(0.21, 0.29), at2.x + 0.03, 1.4 + (i % 2) * 0.35, at2.z - 0.5 + i * 0.25, Math.PI / 2, 0, (X.rnd() - 0.5) * 0.3); }
    { const p = P(7, 1); put(M.pot, cy(0.2, 0.15, 0.4), p.x + 0.9, 0.2, p.z - 0.9); put(M.deadplant, new THREE.ConeGeometry(0.28, 0.8, 7), p.x + 0.9, 0.75, p.z - 0.9); }
    sign('ASHGROVE WING', 8, 2, 'w', 2.7, '#1b2620', '#e6dfc6', 1.6); sign('RECEPTION', 5, 1, 'n', 2.55, '#2a2a2a', '#e6dfc6', 1.2);
    // ARCHIVE: filing cabinets, desk with lamp, tipped chair, papers everywhere, shelves
    [1, 2, 3].forEach(i => cabinetF(P(i, 5).x + 0.4, P(i, 5).z - 0.95, Math.PI));
    desk(P(5, 6).x, P(5, 6).z, Math.PI * 0.5); chair(P(5, 6).x + 1.0, P(5, 6).z + 0.2, -Math.PI / 2, true); papers(P(4, 7).x, P(4, 7).z, 14, 2.4); shelves(P(1, 8).x + 0.3, P(1, 8).z, Math.PI / 2); shelves(P(7, 8).x - 0.3, P(7, 8).z + 0.4, -Math.PI / 2);
    { const p = P(5, 6); put(M.black, cy(0.08, 0.1, 0.03), p.x, 0.8, p.z - 0.4); put(M.black, cy(0.012, 0.012, 0.4), p.x, 1.0, p.z - 0.4); put(M.fixture, new THREE.ConeGeometry(0.14, 0.18, 10, 1, true), p.x, 1.2, p.z - 0.35, 0, 0.5); }
    sign('RECORDS', 4, 5, 'n', 2.45, '#2a241c', '#e6dfc6');
    // HALL: benches, wheelchair, gurney, ward signs, extinguisher
    bench(P(10, 6).x - 1, P(10, 6).z, Math.PI / 2); bench(P(16, 12).x + 1, P(16, 12).z, -Math.PI / 2); wheelchair(P(16, 3).x + 0.6, P(16, 3).z, 0.7); bed(P(11, 10).x - 0.4, P(11, 10).z, 0.15);
    sign('WARD 4  →', 17, 6, 'e', 2.45, '#1e2a3a', '#dfe6ee'); sign('WARD 1', 17, 2, 'e', 2.45, '#1e2a3a', '#dfe6ee'); sign('← RECORDS', 9, 7, 'w', 2.45, '#1e2a3a', '#dfe6ee'); sign('WARD 3', 9, 12, 'w', 2.45, '#1e2a3a', '#dfe6ee');
    { const at2 = wallZ(9, 9, 'w'); put(M.pipeR, cy(0.08, 0.08, 0.55), at2.x + 0.1, 0.4, at2.z); }
    // DAYROOM (nurse station): desk, chairs, CRT television on a cart, board game table
    desk(P(21, 2).x, P(21, 2).z - 0.6, 0, 2.0); chair(P(20, 3).x, P(20, 3).z, 0.4); chair(P(22, 1).x + 0.4, P(22, 1).z + 0.9, 3.0);
    { const p = P(20, 1); put(M.metal, bx(0.7, 0.04, 0.5), p.x - 0.3, 0.75, p.z + 0.2); put(M.black, bx(0.55, 0.45, 0.5), p.x - 0.3, 1.0, p.z + 0.2); put(M.glass, new THREE.PlaneGeometry(0.42, 0.33), p.x - 0.3, 1.02, p.z + 0.451 - 0.0); }
    // WARD: beds, curtains, IV stands
    [[20, 5], [23, 5], [20, 8]].forEach(([c, r]) => bed(P(c, r).x, P(c, r).z, r === 5 ? Math.PI : 0));
    [[20, 6], [23, 6]].forEach(([c, r]) => { const p = P(c, r); put(M.chrome, cy(0.012, 0.012, 2.4, 6), p.x, 2.6, p.z - 0.6, 0, 0, Math.PI / 2); put(M.curtain, new THREE.PlaneGeometry(1.6, 2.0, 1, 1), p.x + 0.2, 1.55, p.z - 0.62); put(M.chrome, cy(0.012, 0.012, 1.8, 6), p.x + 1.0, 0.9, p.z + 0.4); put(M.chrome, cy(0.18, 0.18, 0.02, 8), p.x + 1.0, 0.02, p.z + 0.4); });
    sign('WARD 4', 19, 6, 'w', 2.45, '#dfe6ee', '#223344');
    // UTILITY: shelves, boiler, electrical panels, bare bulb, puddle
    shelves(P(24, 12).x - 0.3, P(24, 12).z, -Math.PI / 2); { const p = P(20, 12); put(M.metalG, cy(0.6, 0.6, 2.2, 14), p.x - 0.2, 1.1, p.z + 0.2); put(M.pipe, cy(0.08, 0.08, 1.2), p.x - 0.2, 2.7, p.z + 0.2); }
    { const at2 = wallZ(24, 10, 'e'); put(M.metal, bx(0.2, 0.8, 0.6), at2.x - 0.1, 1.5, at2.z); put(M.metal, bx(0.2, 0.5, 0.4), at2.x - 0.1, 1.5, at2.z + 0.8); }
    { const p = P(22, 12); const pud = new THREE.Mesh(new THREE.CircleGeometry(0.8, 20), X.mat({ color: 0x0a0a0c, shininess: 120, specular: 0x556677 })); pud.rotation.x = -Math.PI / 2; pud.position.set(p.x, 0.004, p.z); pud.scale.set(1.4, 0.8, 1); scene.add(pud); }
    // EXITWAY: benches, dead vending machine
    bench(P(6, 11).x, P(6, 11).z + 0.9, Math.PI); { const p = P(6, 13); put(M.metal, bx(0.9, 1.8, 0.7), p.x + 0.8, 0.9, p.z + 0.4); put(M.glass, new THREE.PlaneGeometry(0.6, 1.2), p.x + 0.8, 1.05, p.z + 0.04); }
    papers(P(3, 11).x, P(3, 11).z, 5, 1.5);
    // WINDOWS on outer walls (moonlight; the Hollow can appear in them)
    L.windows = [];
    [[3, 1, 'n'], [21, 1, 'n'], [23, 1, 'n'], [24, 6, 'e'], [4, 13, 's']].forEach(([c, r, side]) => { const at2 = wallZ(c, r, side); const g = new THREE.Group(); g.position.set(at2.x, 1.75, at2.z); g.rotation.y = at2.ry; scene.add(g);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.3), new THREE.MeshBasicMaterial({ map: X.tex('night', 128, 128, (gg, w, h) => { const gr = gg.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1d2a44'); gr.addColorStop(1, '#0a0f1a'); gg.fillStyle = gr; gg.fillRect(0, 0, w, h); gg.fillStyle = 'rgba(200,210,255,.08)'; for (let i = 0; i < 40; i++) gg.fillRect(X.rnd() * w, X.rnd() * h * 0.5, 1, 1); gg.fillStyle = '#05070b'; for (let i = 0; i < 5; i++) { const x = X.rnd() * w; gg.fillRect(x, h * 0.55 + X.rnd() * 20, 8 + X.rnd() * 20, h); } }) }));
      pane.position.z = 0.02; g.add(pane);
      [[0, 0.68, 1.55, 0.07], [0, -0.68, 1.55, 0.09], [0.74, 0, 0.07, 1.4], [-0.74, 0, 0.07, 1.4], [0, 0, 0.04, 1.3], [0, 0, 1.4, 0.04]].forEach(([x, y, w, h]) => { const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), M.wood); f.position.set(x, y, 0.04); g.add(f); });
      for (let i = 0; i < 6; i++) { const sl = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.05, 0.01), M.sheet); sl.position.set(0, 0.58 - i * 0.07, 0.07); sl.rotation.x = 0.5; g.add(sl); }
      L.windows.push(g); });
    // doors — institutional wood with a wired-glass panel, kick plate, handle; a lintel fills the wall above
    L.doors = [];
    const doorWood = X.mat({ map: X.woodTex('#7a5a3a', 'door') }), kick = X.mat({ color: 0x9a9a92, shininess: 60 }), wired = X.mat({ color: 0x223040, emissive: 0x0a1018, shininess: 90, transparent: true, opacity: 0.85 });
    L.find('D').forEach(({ c, r }) => {
      const horiz = grid[r][c - 1] === '#' && grid[r][c + 1] === '#';
      const pivot = new THREE.Group(), p = P(c, r), dw = S * 0.62, dh = 2.25;
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(dw, dh, 0.07), doorWood); leaf.position.set(dw / 2, dh / 2, 0); pivot.add(leaf);
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.075), wired); win.position.set(dw / 2, 1.55, 0); pivot.add(win);
      const kp = new THREE.Mesh(new THREE.BoxGeometry(dw - 0.08, 0.25, 0.08), kick); kp.position.set(dw / 2, 0.14, 0); pivot.add(kp);
      const hd = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.12), kick); hd.position.set(dw - 0.12, 1.02, 0); pivot.add(hd);
      // lintel + side infill so the doorway is a real door-sized hole in the wall
      const zoneA = L.zoneOf(c + (horiz ? 0 : -1), r + (horiz ? -1 : 0)), lin = new THREE.Mesh(new THREE.BoxGeometry(S, H - dh, 0.3), ZM[zoneA].wall); lin.position.set(p.x, dh + (H - dh) / 2, p.z); if (!horiz) lin.rotation.y = Math.PI / 2; lin.updateMatrixWorld(true); B(lin.material).push({ geo: lin.geometry, matrix: lin.matrixWorld.clone() });
      const fw = (S - dw) / 2, off = dw / 2 + fw / 2;
      const frameM = X.mat({ color: 0x3a2c20 }); const fr = new THREE.Mesh(new THREE.BoxGeometry(dw + 0.12, 0.08, 0.34), frameM); fr.position.set(0, dh + 0.04, 0); const fl2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, dh, 0.34), frameM); fl2.position.set(-dw / 2 - 0.03, dh / 2, 0); const fr2 = fl2.clone(); fr2.position.x = dw / 2 + 0.03;
      const frame = new THREE.Group(); frame.add(fr, fl2, fr2);
      const fill = new THREE.Mesh(new THREE.BoxGeometry(fw, dh, 0.3), ZM[zoneA].wall), fill2 = fill.clone();
      if (horiz) { pivot.position.set(p.x - dw / 2, 0, p.z); frame.position.set(p.x, 0, p.z); fill.position.set(p.x + off, dh / 2, p.z); fill2.position.set(p.x - off, dh / 2, p.z); }
      else { pivot.rotation.y = -Math.PI / 2; pivot.position.set(p.x, 0, p.z - dw / 2); frame.rotation.y = Math.PI / 2; frame.position.set(p.x, 0, p.z); fill.rotation.y = fill2.rotation.y = Math.PI / 2; fill.position.set(p.x, dh / 2, p.z + off); fill2.position.set(p.x, dh / 2, p.z - off); }
      const toBatch = o => { o.updateMatrixWorld(true); o.traverse(m => { if (m.isMesh) B(m.material).push({ geo: m.geometry, matrix: m.matrixWorld.clone() }); }); };
      toBatch(fill2);
      toBatch(fill); toBatch(frame);
      pivot.traverse(o => { if (o.isMesh) { o.castShadow = q.shadows; o.receiveShadow = true; } });
      pivot.userData = { c, r, kind: 'door', open: false, base: pivot.rotation.y, t: 0 }; scene.add(pivot); L.objects.push(pivot); L.doors.push(pivot);
    });
    // lockers
    const lockM = X.mat({ map: X.metalTex('#50625c', 'locker'), shininess: 40 });
    L.find('L').forEach(({ c, r }) => { const p = P(c, r); const g = new THREE.Group(); const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.1, 0.7), lockM); body.position.y = 1.05; g.add(body);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.46, 1.95, 0.02), X.mat({ map: X.metalTex('#5d706a', 'lockd'), shininess: 50 })); door.position.set(-0.24, 1.05, 0.36); g.add(door); const door2 = door.clone(); door2.position.x = 0.24; g.add(door2);
      for (let i = 0; i < 5; i++) [-0.24, 0.24].forEach(x => { const s2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.02), new THREE.MeshBasicMaterial({ color: 0x0a0a0a })); s2.position.set(x, 1.72 + i * 0.05, 0.375); g.add(s2); });
      // face the locker into the open side of its cell
      const open = [[0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]].find(([dc, dr]) => !isSolid(c + dc, r + dr) && grid[r + dr][c + dc] !== 'L'); if (open) g.rotation.y = open[2];
      g.position.set(p.x, 0, p.z); g.traverse(o => { if (o.isMesh) o.castShadow = q.shadows; }); add(g, c, r, 'locker'); });
    // fuse box
    L.find('F').forEach(({ c, r }) => { const p = P(c, r); const g = new THREE.Group(); const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.35), X.mat({ map: X.metalTex('#7a7a70', 'fuse'), shininess: 40 })); box.position.y = 1.5; g.add(box);
      const warn = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.18), new THREE.MeshBasicMaterial({ map: X.signTex('DANGER 480V', '#c9a227', '#111') })); warn.position.set(0, 1.95, 0.18); g.add(warn);
      const cond = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 8), M.pipe); cond.position.set(0.3, 2.55, 0); g.add(cond);
      const stand = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.35), X.mat({ color: 0x4a4a44 })); stand.position.y = 0.45; g.add(stand);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0x881111 })); lamp.position.set(0.3, 1.8, 0.19); g.add(lamp); g.userData.lamp = lamp; g.position.set(p.x, 0, p.z); add(g, c, r, 'fusebox'); });
    // the heavy cabinet (Gabriel)
    L.find('C').forEach(({ c, r }) => { const p = P(c, r); const m = new THREE.Mesh(new THREE.BoxGeometry(S * 0.9, 2.5, 1.2), X.mat({ map: X.woodTex('#4e3521', 'cab') })); m.position.set(p.x, 1.25, p.z); m.rotation.y = Math.PI / 2; m.castShadow = q.shadows; add(m, c, r, 'cabinet'); });
    // false wall — its faces are exactly the neighbouring zones' wall faces until Daniel looks at it
    L.find('W').forEach(({ c, r }) => { const g = new THREE.Group(); for (const z in fwParts) { const mm = ZM[z].wall.clone(); mm.transparent = true; g.add(new THREE.Mesh(X.merge(fwParts[z]), mm)); } g.userData.mats = g.children.map(ch => ch.material); scene.add(g); g.userData = { ...g.userData, c, r, kind: 'falsewall' }; L.objects.push(g); });
    // items
    L.find('U').forEach(({ c, r }) => { const p = P(c, r); const g = new THREE.Group(); const f = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 12), X.mat({ color: 0xc8b074, emissive: 0x3a2e10, shininess: 70 })); f.rotation.z = Math.PI / 2; f.position.y = 0.95; g.add(f);
      const t = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.7), M.metal); t.position.y = 0.45; g.add(t); g.userData.item = f; g.position.set(p.x, 0, p.z); add(g, c, r, 'fuse'); grid[r][c] = '.'; });
    L.find('M').forEach(({ c, r }) => { const p = P(c, r); const g = new THREE.Group(); const t = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.8, 0.6), M.darkwood); t.position.y = 0.4; g.add(t);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.22), X.mat({ color: 0x7a2e2e, shininess: 50 })); b.position.y = 0.88; g.add(b); const lid = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.22), X.mat({ color: 0xc9a44a, shininess: 90 })); lid.position.set(0, 1.0, -0.08); lid.rotation.x = -1.0; g.add(lid);
      const dancer = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 8), X.mat({ color: 0xe8dcc8 })); dancer.position.y = 1.02; g.add(dancer); g.position.set(p.x, 0, p.z); add(g, c, r, 'musicbox'); grid[r][c] = '.'; });
    L.find('E').forEach(({ c, r }) => { const p = P(c, r); const g = new THREE.Group(); const d = new THREE.Mesh(new THREE.BoxGeometry(S * 0.9, H * 0.85, 0.4), X.mat({ map: X.metalTex('#3a4046', 'exit'), shininess: 40 })); d.position.y = H * 0.425; g.add(d);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.1), M.chrome); bar.position.set(0, 1.05, -0.24); g.add(bar);
      const sign2 = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.3), new THREE.MeshBasicMaterial({ map: X.signTex('EXIT', '#0c1a10', '#46ff7a') })); sign2.position.set(0, H * 0.9, -0.22); sign2.rotation.y = Math.PI; g.add(sign2); g.userData.sign = sign2; sign2.visible = false;
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.06), X.mat({ color: 0x77706a, emissive: 0x0a1a0a })); pad.position.set(1.05, 1.3, -0.23); g.add(pad);
      g.position.set(p.x, 0, p.z); add(g, c, r, 'exit'); });
    // hidden writing — only visible under Daniel's Unmask
    const digits = X.tex('digits', 512, 256, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(160,20,20,.9)'; g.font = 'bold 120px Georgia'; g.textAlign = 'center'; g.fillText('4 · 1 · 3', w / 2, 165); });
    const dec = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshBasicMaterial({ map: digits, transparent: true, opacity: 0, depthWrite: false }));
    const w0 = L.find('W')[0]; const pw = P(w0.c, w0.r); dec.position.set(pw.x + S, 1.8, pw.z - S / 2 - 0.03); dec.rotation.y = Math.PI; scene.add(dec); L.hiddenDecals = [dec];
    const w2 = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.0), new THREE.MeshBasicMaterial({ map: X.tex('copies', 512, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(200,200,190,.85)'; g.font = 'italic 52px Georgia'; g.textAlign = 'center'; g.fillText('IT COPIES VOICES', w / 2, 90); }), transparent: true, opacity: 0, depthWrite: false }));
    const hall = P(9, 11); w2.position.set(hall.x - S / 2 + 0.03, 1.9, hall.z); w2.rotation.y = Math.PI / 2; scene.add(w2); L.hiddenDecals.push(w2);
    for (const [mat, parts] of batches) { const m = new THREE.Mesh(X.merge(parts), mat); m.castShadow = q.shadows; m.receiveShadow = true; scene.add(m); }
    // bake static groups (doors, lockers, windows, frames, props) → far fewer draw calls
    L.objects.forEach(o => { const it = o.userData.item; X.bake(o, m => m === it || m === o.userData.lamp || m === o.userData.sign); });
    (L.windows || []).forEach(w => X.bake(w));
    scene.children.filter(o => o.type === 'Group' && !L.objects.includes(o) && !(L.windows || []).includes(o)).forEach(g => X.bake(g));
    // ZONE LIGHTS (the lighting language) — count set by the quality tier, most important first
    const ORDER = [['lobby', 4, 2], ['archive', 5, 6], ['hall', 13, 4], ['ward', 21, 6], ['utility', 21, 11], ['exitway', 3, 12], ['hall', 13, 10], ['dayroom', 21, 2], ['hall2', 13, 7], ['lobby', 2, 2]];
    L.lamps = []; ORDER.slice(0, q.lights).forEach(([z, c, r]) => { const d = (ZONES[z] || { light: { col: 0xd8e2f2, i: 0.6, d: 11, kind: 'fluor' } }).light, p = P(c, r);
      const pl = new THREE.PointLight(X.col(d.col), d.i, d.d, 1.6); pl.position.set(p.x, H - 0.35, p.z); if (d.kind === 'lamp') pl.position.set(p.x, 1.3, p.z - 0.35); scene.add(pl);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(d.kind === 'bulb' ? 0.07 : 0.05, 8, 6), new THREE.MeshBasicMaterial({ color: d.col })); bulb.position.copy(pl.position); if (d.kind === 'bulb') { const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.5, 4), M.black); cord.position.set(p.x, H - 0.1, p.z); scene.add(cord); bulb.position.y = H - 0.38; pl.position.y = H - 0.4; }
      if (d.kind !== 'lamp' && d.kind !== 'bulb') bulb.visible = d.kind === 'emergency' || d.kind === 'exit';
      scene.add(bulb); L.lamps.push({ pl, bulb, base: d.i, kind: d.kind, zone: z, seed: X.rnd() * 10 }); });
  };

  /* blocking for the player (and companions) */
  L.blocked = (c, r, forEnemy = false) => {
    if (r < 0 || c < 0 || r >= L.R || c >= L.W) return true;
    const k = L.grid[r][c];
    if (k === '#' || k === 'L' || k === 'F' || k === 'E') return true;
    if (k === 'C') return !L.st.cabinetMoved;
    if (k === 'W') return !L.st.falseGone;
    if (k === 'D') { const d = L.doorAt(c, r); return forEnemy ? false : !(d && d.userData.open); }
    return false;
  };
  L.doorAt = (c, r) => L.doors.find(d => d.userData.c === c && d.userData.r === r);
  L.opaque = (c, r) => { if (r < 0 || c < 0 || r >= L.R || c >= L.W) return true; const k = L.grid[r][c]; if (k === '#' || k === 'E' || k === 'F') return true; if (k === 'C') return !L.st.cabinetMoved; if (k === 'W') return !L.st.falseGone; if (k === 'D') { const d = L.doorAt(c, r); return !(d && d.userData.open); } return false; };
  /* grid line of sight */
  L.los = (x0, z0, x1, z1) => { const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.5); for (let i = 1; i < n; i++) { const t = i / n, [c, r] = L.cell(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t); if (L.opaque(c, r)) return false; } return true; };
  /* BFS path on the grid (the Hollow opens doors) */
  L.path = (from, to) => {
    const key = (c, r) => r * L.W + c, prev = new Map([[key(from[0], from[1]), null]]), q = [from];
    while (q.length) { const [c, r] = q.shift(); if (c === to[0] && r === to[1]) break;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nc = c + dc, nr = r + dr, k = key(nc, nr); if (prev.has(k) || L.blocked(nc, nr, true)) continue; prev.set(k, [c, r]); q.push([nc, nr]); } }
    if (!prev.has(key(to[0], to[1]))) return null; const out = []; let cur = to; while (cur) { out.unshift(cur); cur = prev.get(key(cur[0], cur[1])); } return out;
  };
  L.floorCells = () => { const o = []; L.grid.forEach((row, r) => row.forEach((k, c) => { if (!L.blocked(c, r, true) && k !== 'D') o.push([c, r]); })); return o; };
})();
