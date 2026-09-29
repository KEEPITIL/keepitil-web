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

  L.build = (scene) => {
    const st = L.st = {};   // live cell state: doors open?, cabinet moved?, false wall gone?
    const grid = L.grid = MAP.map(row => [...row]);
    const tex = (draw, w = 256, h = 256) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'); draw(g, w, h); const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
    const grime = (base, spots) => tex((g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); for (let i = 0; i < spots; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.18})`; const s = Math.random() * 40 + 4; g.fillRect(Math.random() * w, Math.random() * h, s, s * (0.5 + Math.random() * 3)); } g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, h - 26, w, 26); g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(0, h * 0.45, w, 3); });
    const wallMat = new THREE.MeshLambertMaterial({ map: grime('#6d6a60', 90) });
    const floorT = tex((g, w, h) => { g.fillStyle = '#3d3a33'; g.fillRect(0, 0, w, h); for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? '#45413a' : '#38352f'; g.fillRect(x * 64 + 1, y * 64 + 1, 62, 62); } for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * .25})`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, Math.random() * 18, 0, 7); g.fill(); } });
    floorT.repeat.set(L.W, L.R);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(L.W * S, L.R * S), new THREE.MeshLambertMaterial({ map: floorT }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(L.W * S / 2, 0, L.R * S / 2); scene.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(L.W * S, L.R * S), new THREE.MeshLambertMaterial({ color: 0x2a2925 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(L.W * S / 2, H, L.R * S / 2); scene.add(ceil);
    // walls as one instanced mesh (mobile-friendly)
    const walls = []; grid.forEach((row, r) => row.forEach((k, c) => { if (k === '#') walls.push([c, r]); }));
    const wg = new THREE.BoxGeometry(S, H, S), wm = new THREE.InstancedMesh(wg, wallMat, walls.length), m4 = new THREE.Matrix4();
    walls.forEach(([c, r], i) => { m4.makeTranslation(c * S + S / 2, H / 2, r * S + S / 2); wm.setMatrixAt(i, m4); }); scene.add(wm);
    L.objects = []; const add = (o, c, r, kind) => { o.userData = { ...o.userData, c, r, kind }; scene.add(o); L.objects.push(o); return o; };
    const P = L.center;
    // doors
    L.doors = [];
    L.find('D').forEach(({ c, r }) => {
      const horiz = grid[r][c - 1] === '#' && grid[r][c + 1] === '#';   // wall runs left-right → door spans x
      const pivot = new THREE.Group(), p = P(c, r);
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(S * 0.92, H * 0.86, 0.12), new THREE.MeshLambertMaterial({ map: grime('#4a3b2c', 40) }));
      leaf.position.x = S * 0.46; leaf.position.y = H * 0.43; pivot.add(leaf);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.16), new THREE.MeshLambertMaterial({ color: 0x8a8070 })); plate.position.set(S * 0.82, 1.05, 0); pivot.add(plate);
      if (horiz) { pivot.position.set(p.x - S * 0.46, 0, p.z); } else { pivot.rotation.y = -Math.PI / 2; pivot.position.set(p.x, 0, p.z - S * 0.46); }
      pivot.userData = { c, r, kind: 'door', open: false, base: pivot.rotation.y, t: 0 }; scene.add(pivot); L.objects.push(pivot); L.doors.push(pivot);
    });
    // lockers
    L.find('L').forEach(({ c, r }) => { const p = P(c, r); const g = new THREE.Group(); const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.2, 0.8), new THREE.MeshLambertMaterial({ color: 0x3b4a45 })); body.position.y = 1.1; g.add(body);
      for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 0.02), new THREE.MeshBasicMaterial({ color: 0x0a0a0a })); s.position.set(0, 1.7 + i * 0.07, 0.41); g.add(s); }
      g.position.set(p.x, 0, p.z); add(g, c, r, 'locker'); });
    // fuse box
    L.find('F').forEach(({ c, r }) => { const p = P(c, r); const g = new THREE.Group(); const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 0.5), new THREE.MeshLambertMaterial({ color: 0x5a5a52 })); box.position.y = 1.4; g.add(box);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0x551111 })); lamp.position.set(0.4, 2.0, 0.27); g.add(lamp); g.userData.lamp = lamp; g.position.set(p.x, 0, p.z); add(g, c, r, 'fusebox'); });
    // cabinet
    L.find('C').forEach(({ c, r }) => { const p = P(c, r); const m = new THREE.Mesh(new THREE.BoxGeometry(S * 0.9, 2.6, 1.6), new THREE.MeshLambertMaterial({ map: grime('#5b4630', 30) })); m.position.set(p.x, 1.3, p.z); m.rotation.y = Math.PI / 2; add(m, c, r, 'cabinet'); });
    // false wall — identical to a real wall until Daniel looks at it
    L.find('W').forEach(({ c, r }) => { const p = P(c, r); const m = new THREE.Mesh(new THREE.BoxGeometry(S, H, S), wallMat.clone()); m.material.transparent = true; m.position.set(p.x, H / 2, p.z); add(m, c, r, 'falsewall'); });
    // items
    L.find('U').forEach(({ c, r }) => { const p = P(c, r); const g = new THREE.Group(); const f = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.32, 10), new THREE.MeshLambertMaterial({ color: 0xb7a36a, emissive: 0x2a2208 })); f.rotation.z = Math.PI / 2; f.position.y = 0.95; g.add(f);
      const t = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.7), new THREE.MeshLambertMaterial({ color: 0x3a342a })); t.position.y = 0.45; g.add(t); g.userData.item = f; g.position.set(p.x, 0, p.z); add(g, c, r, 'fuse'); grid[r][c] = '.'; });
    L.find('M').forEach(({ c, r }) => { const p = P(c, r); const g = new THREE.Group(); const t = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.7), new THREE.MeshLambertMaterial({ color: 0x3a342a })); t.position.y = 0.45; g.add(t);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.24), new THREE.MeshLambertMaterial({ color: 0x6b2a2a })); b.position.y = 1.0; g.add(b); g.position.set(p.x, 0, p.z); add(g, c, r, 'musicbox'); grid[r][c] = '.'; });
    L.find('E').forEach(({ c, r }) => { const p = P(c, r); const g = new THREE.Group(); const d = new THREE.Mesh(new THREE.BoxGeometry(S * 0.95, H * 0.9, 0.5), new THREE.MeshLambertMaterial({ color: 0x2c2f33 })); d.position.y = H * 0.45; g.add(d);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.35), new THREE.MeshBasicMaterial({ map: tex((g2, w, h) => { g2.fillStyle = '#111'; g2.fillRect(0, 0, w, h); g2.fillStyle = '#3c5'; g2.font = 'bold 90px sans-serif'; g2.textAlign = 'center'; g2.fillText('EXIT', w / 2, 100); }, 256, 128) }));
      sign.position.set(0, H * 0.92, -0.26); sign.rotation.y = Math.PI; g.add(sign); g.userData.sign = sign; sign.visible = false;
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, 0.06), new THREE.MeshLambertMaterial({ color: 0x777066, emissive: 0x050505 })); pad.position.set(1.0, 1.3, -0.28); g.add(pad);
      g.position.set(p.x, 0, p.z); add(g, c, r, 'exit'); });
    // hidden writing — only visible under Daniel's Unmask
    const digits = tex((g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(160,20,20,.9)'; g.font = 'bold 120px Georgia'; g.textAlign = 'center'; g.fillText('4 · 1 · 3', w / 2, 165); }, 512, 256);
    const dec = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshBasicMaterial({ map: digits, transparent: true, opacity: 0, depthWrite: false }));
    const w0 = L.find('W')[0]; const pw = P(w0.c, w0.r); dec.position.set(pw.x + S, 1.8, pw.z - S / 2 - 0.02 + 0.03); dec.userData.hidden = true;
    // on the ward's south wall beside the false wall (east of it)
    dec.position.set(pw.x + S, 1.8, pw.z - S / 2 - 0.03); dec.rotation.y = Math.PI; scene.add(dec); L.hiddenDecals = [dec];
    const w2 = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.0), new THREE.MeshBasicMaterial({ map: tex((g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(200,200,190,.85)'; g.font = 'italic 52px Georgia'; g.textAlign = 'center'; g.fillText('IT COPIES VOICES', w / 2, 90); }, 512, 128), transparent: true, opacity: 0, depthWrite: false }));
    const hall = P(9, 11); w2.position.set(hall.x - S / 2 + 0.03, 1.9, hall.z); w2.rotation.y = Math.PI / 2; scene.add(w2); L.hiddenDecals.push(w2);
    // power lights (off until the fuse is in)
    L.lamps = []; [[4, 2], [13, 2], [13, 7], [13, 11], [4, 11], [4, 6], [21, 6], [21, 2]].forEach(([c, r]) => { const p = P(c, r); const pl = new THREE.PointLight(0xffd9a0, 0, 11, 2); pl.position.set(p.x, H - 0.3, p.z); scene.add(pl);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), new THREE.MeshBasicMaterial({ color: 0x222018 })); bulb.position.copy(pl.position); scene.add(bulb); L.lamps.push({ pl, bulb }); });
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
