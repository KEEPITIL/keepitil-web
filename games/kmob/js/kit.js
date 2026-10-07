/* KMOB character kit — original stylized miniature-warrior models built from sculpted primitives (lathe bodies,
   oversized helmets, mitten hands, chunky boots), split along the shared skeleton in anim.js so every part can be
   GPU-instanced. Vertices flagged tint=1 take the faction colour per instance; everything else keeps its own colour
   (skin, steel, gold, leather). Baked vertical AO darkens lower areas for depth without extra lights.

   Bone-local conventions: legs pivot at the hip (sole at y=-0.33); torso pivots at the hips (neck at y=0.40);
   head pivots at the neck; arms pivot at the shoulder (fist at y=-0.27); weapons grip at the origin pointing +z. */
(function (G) {
  const KM = G.KM;
  const V3 = THREE.Vector3, M4 = THREE.Matrix4, Q = THREE.Quaternion, E = THREE.Euler, C = THREE.Color;
  const SKIN = 0xffcf9f, STEEL = 0xd4dae4, DSTEEL = 0x7d8796, GOLD = 0xf4c247, LEATHER = 0x6b4426, DLEATHER = 0x3d2818, IVORY = 0xf4ead0, DARK = 0x1c1c26, WOOD = 0x8f5c34, WHITE = 0xffffff;
  const HAIR = 0x5a3820, BEARD = 0xf4f4f0, CRYSTAL = 0x6fe0ff, SHIRT = 0xf3efe4, PLATE = 0xd6dde8, HELM = 0xb8c2d0, GLOW = 0x9ff0ff;

  const TRS = (x, y, z, rx, ry, rz, sx, sy, sz) => new M4().compose(new V3(x || 0, y || 0, z || 0), new Q().setFromEuler(new E(rx || 0, ry || 0, rz || 0)), new V3(sx || 1, sy == null ? (sx || 1) : sy, sz == null ? (sx || 1) : sz));
  function part(geo, color, tint, m) { const g = geo.index ? geo.toNonIndexed() : geo.clone(); if (m) g.applyMatrix4(m); g.userData = { color: new C(color), tint: tint || 0 }; return g; }
  // merge parts into one geometry with colour + aTint attributes; ao = [y0, y1, min] darkens below y1
  function merge(parts, ao) {
    let n = 0; for (const p of parts) n += p.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), tin = new Float32Array(n);
    let o = 0;
    for (const p of parts) {
      const c = p.attributes.position.count, pa = p.attributes.position.array; pos.set(pa, o * 3); nor.set(p.attributes.normal.array, o * 3);
      const cc = p.userData.color;
      for (let k = 0; k < c; k++) {
        let f = 1; if (ao) { const y = pa[k * 3 + 1], u = Math.min(1, Math.max(0, (y - ao[0]) / (ao[1] - ao[0]))); f = ao[2] + (1 - ao[2]) * u * u * (3 - 2 * u); }
        col[(o + k) * 3] = cc.r * f; col[(o + k) * 3 + 1] = cc.g * f; col[(o + k) * 3 + 2] = cc.b * f; tin[o + k] = p.userData.tint;
      }
      o += c;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aTint', new THREE.BufferAttribute(tin, 1));
    g.computeBoundingSphere(); return g;
  }
  // DETAIL scales every segment count: near-LOD parts and far-LOD statues are built at different detail levels.
  let DETAIL = 1; const sg = (n, min) => Math.max(min || 3, Math.round(n * DETAIL));
  const sph = (r, w, h, t0, tl) => new THREE.SphereGeometry(r, sg(w || 14, 5), sg(h || 10, 3), 0, Math.PI * 2, t0 || 0, tl || Math.PI);
  const cyl = (a, b, h, s, open) => new THREE.CylinderGeometry(a, b, h, sg(s || 14, 5), 1, !!open);
  const box = (a, b, c) => new THREE.BoxGeometry(a, b, c);
  const cone = (r, h, s) => new THREE.ConeGeometry(r, h, sg(s || 10, 4));
  const tor = (r, t, rs, ts, arc) => new THREE.TorusGeometry(r, t, sg(rs || 6, 3), sg(ts || 18, 6), arc || Math.PI * 2);
  const lathe = (pts, seg) => { const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), sg(seg || 16, 6)); g.computeVertexNormals(); return g; };
  const capsule = (r, len, col, tint, m, seg) => { const s = sg(seg || 10, 5), L = []; L.push(part(cyl(r, r, len, s, true), col, tint, new M4().multiplyMatrices(m || new M4(), TRS(0, -len / 2, 0)))); L.push(part(sph(r, s, 6, 0, Math.PI / 2), col, tint, m)); L.push(part(sph(r, s, 6, Math.PI / 2, Math.PI / 2), col, tint, new M4().multiplyMatrices(m || new M4(), TRS(0, -len, 0)))); return L; };

  // ---------------- LEGS ----------------
  function legStd() {
    return merge([
      ...capsule(0.078, 0.2, 0x5c6178, 1, TRS(0, -0.02, 0)),                                  // trousers (faction-dark)
      part(sph(0.1, 12, 8), LEATHER, 0, TRS(0, -0.275, 0.035, 0, 0, 0, 1, 0.72, 1.45)),            // chunky boot
      part(cyl(0.088, 0.092, 0.06, 12), DLEATHER, 0, TRS(0, -0.21, 0.0)),                           // boot cuff
      part(box(0.17, 0.025, 0.25), DLEATHER, 0, TRS(0, -0.322, 0.04)),                             // sole
    ], [-0.33, 0.0, 0.62]);
  }
  function legBrute() {
    return merge([
      ...capsule(0.13, 0.18, 0x8a5050, 1, TRS(0, -0.02, 0)),
      part(sph(0.16, 12, 8), DLEATHER, 0, TRS(0, -0.27, 0.04, 0, 0, 0, 1, 0.65, 1.35)),
      part(tor(0.135, 0.035, 6, 14), DSTEEL, 0, TRS(0, -0.19, 0, Math.PI / 2, 0, 0)),
    ], [-0.33, 0.0, 0.6]);
  }

  // ---------------- TORSOS ----------------
  function torsoLight(skirt) {
    const L = [
      part(lathe([[0.0, -0.02], [0.2, -0.0], [0.255, 0.1], [0.272, 0.22], [0.25, 0.33], [0.18, 0.4], [0.0, 0.43]], 18), 0xe6ebff, 1), // tunic
      part(lathe([[0.235, 0.12], [0.268, 0.04], [0.29, -0.07], [0.0, -0.08]], 18), 0xa8b2dd, 1),          // skirt flare
      part(cyl(0.262, 0.262, 0.065, 18), LEATHER, 0, TRS(0, 0.1, 0)),                                       // belt
      part(box(0.085, 0.065, 0.03), GOLD, 0, TRS(0, 0.1, 0.262)),                                          // buckle
      part(cyl(0.13, 0.15, 0.05, 14), 0xb8c2e8, 1, TRS(0, 0.405, 0)),                                      // collar
      part(new THREE.CircleGeometry(0.075, 14), WHITE, 0, TRS(0, 0.25, 0.268)),                           // chest emblem
      part(new THREE.CircleGeometry(0.05, 4), GOLD, 0, TRS(0, 0.25, 0.27, 0, 0, Math.PI / 4)),
    ];
    if (skirt) L.push(part(lathe([[0.27, 0.02], [0.3, -0.12], [0.0, -0.13]], 18), 0xc8d0f0, 1));
    return L;
  }
  function torsoHeavy() {
    return merge([
      ...torsoLight(),
      part(sph(0.235, 16, 10, 0, Math.PI * 0.6), STEEL, 0, TRS(0, 0.17, 0.05, -Math.PI / 2 + 0.35, 0, 0, 1, 1, 0.75)), // breastplate
      part(sph(0.14, 12, 8, 0, Math.PI / 2), 0xd8e0ff, 1, TRS(-0.27, 0.34, 0, 0, 0, 0.45)),                   // pauldrons
      part(sph(0.14, 12, 8, 0, Math.PI / 2), 0xd8e0ff, 1, TRS(0.27, 0.34, 0, 0, 0, -0.45)),
      part(tor(0.12, 0.018, 5, 14, Math.PI), GOLD, 0, TRS(-0.27, 0.34, 0, 0, Math.PI / 2, 0.45)), part(tor(0.12, 0.018, 5, 14, Math.PI), GOLD, 0, TRS(0.27, 0.34, 0, 0, Math.PI / 2, -0.45)),
    ], [-0.08, 0.3, 0.7]);
  }
  function torsoBrute() {
    return merge([
      part(lathe([[0.0, -0.04], [0.3, -0.02], [0.4, 0.1], [0.43, 0.24], [0.38, 0.36], [0.24, 0.44], [0.0, 0.47]], 18), 0xffd2c4, 1), // bulky skin torso
      part(lathe([[0.36, 0.08], [0.39, -0.02], [0.4, -0.1], [0.0, -0.11]], 18), DLEATHER, 0),                 // loincloth belt
      part(cyl(0.405, 0.405, 0.07, 18), LEATHER, 0, TRS(0, 0.06, 0)), part(sph(0.07, 8, 6), GOLD, 0, TRS(0, 0.06, 0.4)),
      part(box(0.09, 0.62, 0.05), LEATHER, 0, TRS(0.02, 0.24, 0.36, 0.25, 0, 0.75)),                          // harness strap
      part(sph(0.19, 12, 8, 0, Math.PI / 2), DSTEEL, 0, TRS(-0.38, 0.38, 0, 0, 0, 0.5)), part(sph(0.19, 12, 8, 0, Math.PI / 2), DSTEEL, 0, TRS(0.38, 0.38, 0, 0, 0, -0.5)),
      part(cone(0.05, 0.18, 8), IVORY, 0, TRS(-0.44, 0.5, 0, 0, 0, 0.6)), part(cone(0.05, 0.18, 8), IVORY, 0, TRS(0.44, 0.5, 0, 0, 0, -0.6)),
      part(cone(0.04, 0.14, 8), IVORY, 0, TRS(-0.34, 0.52, 0.06, 0.2, 0, 0.3)), part(cone(0.04, 0.14, 8), IVORY, 0, TRS(0.34, 0.52, 0.06, 0.2, 0, -0.3)),
    ], [-0.1, 0.3, 0.68]);
  }
  // LOOTER: white work shirt under an open blue vest, belt pouch, wooden supply crate on the back
  function torsoLooter() {
    const vest = new THREE.LatheGeometry([[0.212, 0.02], [0.262, 0.1], [0.279, 0.22], [0.26, 0.33], [0.19, 0.405], [0.12, 0.425]].map(([r, y]) => new THREE.Vector2(r, y)), sg(18, 6), 0.55, Math.PI * 2 - 1.1); vest.computeVertexNormals();
    return merge([
      part(lathe([[0.0, -0.02], [0.2, -0.0], [0.25, 0.1], [0.265, 0.22], [0.245, 0.33], [0.18, 0.4], [0.0, 0.43]], 18), SHIRT, 0),
      part(vest, 0xe6ebff, 1), part(lathe([[0.235, 0.12], [0.262, 0.04], [0.28, -0.07], [0.0, -0.08]], 18), 0xa8b2dd, 1),
      part(cyl(0.258, 0.258, 0.06, 18), LEATHER, 0, TRS(0, 0.1, 0)), part(box(0.1, 0.09, 0.06), DLEATHER, 0, TRS(0.17, 0.07, 0.2, 0, 0.6, 0)),
      part(box(0.04, 0.4, 0.025), LEATHER, 0, TRS(-0.12, 0.27, 0.235, -0.12, 0, 0)), part(box(0.04, 0.4, 0.025), LEATHER, 0, TRS(0.12, 0.27, 0.235, -0.12, 0, 0)),
      part(box(0.4, 0.36, 0.22), WOOD, 0, TRS(0, 0.25, -0.34)), part(box(0.42, 0.05, 0.24), DLEATHER, 0, TRS(0, 0.12, -0.34)), part(box(0.42, 0.05, 0.24), DLEATHER, 0, TRS(0, 0.38, -0.34)),
      part(box(0.05, 0.38, 0.24), DLEATHER, 0, TRS(0, 0.25, -0.34)), part(box(0.36, 0.08, 0.2), 0xd9b27a, 0, TRS(0, 0.46, -0.34)),
    ], [-0.08, 0.3, 0.7]);
  }
  // RANGE: light tunic + diagonal strap + quiver of arrows on the back
  function torsoArcher() {
    return merge([...torsoLight(), part(box(0.05, 0.62, 0.03), LEATHER, 0, TRS(0.02, 0.24, 0.255, 0, 0, 0.7)),
      part(cyl(0.07, 0.075, 0.44, 10), LEATHER, 0, TRS(0.12, 0.3, -0.27, 0, 0, -0.35)), part(cyl(0.077, 0.077, 0.04, 10), DLEATHER, 0, TRS(0.04, 0.5, -0.27, 0, 0, -0.35)),
      ...[-0.03, 0.02, 0.07].map((dx, k) => part(box(0.018, 0.12, 0.05), WHITE, 0, TRS(0.0 + dx, 0.6 + k * 0.01, -0.27, 0, 0, -0.35)))], [-0.08, 0.3, 0.7]);
  }
  // friendly GIANT: blocky armoured golem in the army's blue, white/steel plates, smooth pauldrons — no horns, no spikes
  function torsoGolem() {
    return merge([
      part(box(0.8, 0.52, 0.52), 0xe2eaff, 1, TRS(0, 0.22, 0)), part(box(0.62, 0.2, 0.44), 0xe2eaff, 1, TRS(0, -0.06, 0)),
      part(box(0.36, 0.06, 0.05), PLATE, 0, TRS(0, 0.36, 0.27)), part(box(0.3, 0.06, 0.05), PLATE, 0, TRS(0, 0.26, 0.27)), part(box(0.24, 0.06, 0.05), PLATE, 0, TRS(0, 0.16, 0.27)),
      part(box(0.68, 0.07, 0.48), DSTEEL, 0, TRS(0, 0.03, 0)), part(box(0.12, 0.08, 0.04), GOLD, 0, TRS(0, 0.03, 0.25)),
      part(box(0.36, 0.17, 0.46), PLATE, 0, TRS(-0.47, 0.47, 0, 0, 0, 0.22)), part(box(0.36, 0.17, 0.46), PLATE, 0, TRS(0.47, 0.47, 0, 0, 0, -0.22)),
      part(box(0.3, 0.1, 0.4), 0xe2eaff, 1, TRS(-0.45, 0.36, 0, 0, 0, 0.22)), part(box(0.3, 0.1, 0.4), 0xe2eaff, 1, TRS(0.45, 0.36, 0, 0, 0, -0.22)),
      part(box(0.5, 0.3, 0.06), 0xc8d4f0, 1, TRS(0, 0.3, -0.27)),
    ], [-0.15, 0.4, 0.72]);
  }
  function torsoRobe() { // shaman
    return merge([
      part(lathe([[0.0, -0.13], [0.33, -0.12], [0.29, 0.05], [0.26, 0.22], [0.22, 0.34], [0.15, 0.42], [0.0, 0.44]], 18), 0xd8c8ff, 1),
      part(cyl(0.25, 0.25, 0.05, 18), 0x2b1f3a, 0, TRS(0, 0.12, 0)), part(box(0.07, 0.36, 0.02), GOLD, 0, TRS(0, 0.1, 0.27, -0.12, 0, 0)),
      part(sph(0.05, 8, 6), 0xd77bff, 0, TRS(0, 0.28, 0.24)),
    ], [-0.13, 0.3, 0.65]);
  }

  // ---------------- HEADS ---------------- (face at +z; oversized helmets are the silhouette)
  const face = (skin, tint, r) => { r = r || 0.2; return [part(sph(r, 16, 12), skin, tint, TRS(0, 0.17, 0)), part(sph(0.03, 8, 6), DARK, 0, TRS(-0.072, 0.155, r * 0.93)), part(sph(0.03, 8, 6), DARK, 0, TRS(0.072, 0.155, r * 0.93)), part(sph(0.03, 8, 6), new C(skin).offsetHSL(0, 0, -0.06).getHex(), tint, TRS(0, 0.115, r * 0.97, 0, 0, 0, 1, 0.8, 0.8))]; };
  const dome = (r, col, tint, y, tl) => part(sph(r, 18, 12, 0, tl || Math.PI * 0.56), col, tint, TRS(0, y || 0.2, -0.012));
  const H = {
    blue: () => merge([...face(SKIN), dome(0.262, 0xe8eeff, 1), part(cyl(0.268, 0.268, 0.055, 20), 0xb4c0ff, 1, TRS(0, 0.17, -0.012)), part(box(0.05, 0.11, 0.42), 0xa4b2ff, 1, TRS(0, 0.43, -0.03, 0.12, 0, 0)),
      part(box(0.04, 0.12, 0.03), STEEL, 0, TRS(0, 0.15, 0.255)), part(box(0.07, 0.12, 0.04), 0xb4c0ff, 1, TRS(-0.205, 0.08, 0.1, 0, 0.5, 0)), part(box(0.07, 0.12, 0.04), 0xb4c0ff, 1, TRS(0.205, 0.08, 0.1, 0, -0.5, 0))]),
    knight: () => merge([...face(SKIN), dome(0.27, 0xe8eeff, 1), part(cyl(0.276, 0.276, 0.06, 20), GOLD, 0, TRS(0, 0.17, -0.012)), part(box(0.24, 0.04, 0.04), DARK, 0, TRS(0, 0.2, 0.25)),
      part(box(0.05, 0.16, 0.03), GOLD, 0, TRS(0, 0.14, 0.27)), part(sph(0.1, 10, 8), GOLD, 0, TRS(0, 0.5, -0.06, 0, 0, 0, 0.55, 1.2, 1.6)), part(cone(0.04, 0.12, 6), GOLD, 0, TRS(0, 0.5, 0))]),
    hood: () => merge([...face(SKIN), part(sph(0.255, 16, 10, 0, Math.PI * 0.62), 0xc0ccff, 1, TRS(0, 0.19, -0.03)), part(cone(0.1, 0.22, 8), 0xc0ccff, 1, TRS(0, 0.27, -0.24, -1.2, 0, 0)),
      part(box(0.02, 0.24, 0.07), WHITE, 0, TRS(0.17, 0.36, -0.08, -0.4, 0, -0.5)), part(tor(0.205, 0.02, 5, 18), LEATHER, 0, TRS(0, 0.21, 0.02, Math.PI / 2 - 0.2, 0, 0))]),
    horn: () => merge([...face(SKIN), dome(0.258, 0xeaeaea, 1), part(cyl(0.264, 0.264, 0.05, 20), DSTEEL, 0, TRS(0, 0.17, -0.012)),
      part(cone(0.045, 0.2, 8), IVORY, 0, TRS(-0.21, 0.36, 0, 0, 0, 0.75)), part(cone(0.045, 0.2, 8), IVORY, 0, TRS(0.21, 0.36, 0, 0, 0, -0.75)), part(box(0.04, 0.12, 0.03), DSTEEL, 0, TRS(0, 0.15, 0.25))]),
    bucket: () => merge([...face(SKIN), part(cyl(0.235, 0.25, 0.3, 18), 0xd8d8d8, 1, TRS(0, 0.21, 0)), part(sph(0.235, 18, 8, 0, Math.PI / 2), 0xd8d8d8, 1, TRS(0, 0.36, 0)),
      part(box(0.3, 0.035, 0.04), DARK, 0, TRS(0, 0.2, 0.235)), part(box(0.03, 0.18, 0.04), DARK, 0, TRS(0, 0.13, 0.24)), part(tor(0.252, 0.02, 5, 20), DSTEEL, 0, TRS(0, 0.07, 0, Math.PI / 2, 0, 0)),
      part(cone(0.035, 0.14, 6), DSTEEL, 0, TRS(0, 0.65, 0))]),
    bandana: () => merge([...face(SKIN), part(sph(0.212, 16, 10, 0, Math.PI * 0.5), 0x3a2a2a, 0, TRS(0, 0.18, -0.01)), part(tor(0.205, 0.035, 6, 20), 0xeaeaea, 1, TRS(0, 0.22, 0, Math.PI / 2 - 0.15, 0, 0)),
      part(box(0.05, 0.16, 0.04), 0xeaeaea, 1, TRS(0.04, 0.2, -0.22, 0.5, 0, 0.3)), part(box(0.05, 0.14, 0.04), 0xeaeaea, 1, TRS(-0.04, 0.18, -0.23, 0.7, 0, -0.3))]),
    imp: () => merge([part(sph(0.23, 16, 12), 0xffc0b0, 1, TRS(0, 0.17, 0)), part(sph(0.04, 8, 6), 0xffe14a, 0, TRS(-0.08, 0.17, 0.2)), part(sph(0.04, 8, 6), 0xffe14a, 0, TRS(0.08, 0.17, 0.2)), part(sph(0.018, 5, 4), DARK, 0, TRS(-0.08, 0.17, 0.235)), part(sph(0.018, 5, 4), DARK, 0, TRS(0.08, 0.17, 0.235)),
      part(cone(0.05, 0.2, 8), IVORY, 0, TRS(-0.13, 0.38, 0, 0, 0, 0.35)), part(cone(0.05, 0.2, 8), IVORY, 0, TRS(0.13, 0.38, 0, 0, 0, -0.35)), part(cone(0.06, 0.14, 6), 0xffc0b0, 1, TRS(-0.23, 0.2, 0, 0, 0, 1.3)), part(cone(0.06, 0.14, 6), 0xffc0b0, 1, TRS(0.23, 0.2, 0, 0, 0, -1.3)),
      part(box(0.12, 0.025, 0.02), DARK, 0, TRS(0, 0.08, 0.215))]),
    brute: () => merge([part(sph(0.21, 16, 12), 0xffc4b4, 1, TRS(0, 0.16, 0.02)), part(box(0.3, 0.12, 0.2), 0xffc4b4, 1, TRS(0, 0.06, 0.08)), part(cone(0.025, 0.09, 6), IVORY, 0, TRS(-0.09, 0.15, 0.17, 0, 0, 0.1)), part(cone(0.025, 0.09, 6), IVORY, 0, TRS(0.09, 0.15, 0.17, 0, 0, -0.1)),
      part(sph(0.035, 8, 6), 0xffe14a, 0, TRS(-0.075, 0.21, 0.19)), part(sph(0.035, 8, 6), 0xffe14a, 0, TRS(0.075, 0.21, 0.19)), part(box(0.2, 0.03, 0.05), 0x5a1a1a, 0, TRS(0, 0.255, 0.19, 0, 0, 0)),
      part(sph(0.225, 16, 8, 0, Math.PI * 0.45), DSTEEL, 0, TRS(0, 0.2, -0.02)), part(cone(0.07, 0.36, 10), IVORY, 0, TRS(-0.28, 0.42, 0, 0, 0, 0.9)), part(cone(0.07, 0.36, 10), IVORY, 0, TRS(0.28, 0.42, 0, 0, 0, -0.9))]),
    warlord: () => { const b = H.brute(); const extra = merge([part(cyl(0.2, 0.22, 0.08, 14), GOLD, 0, TRS(0, 0.36, 0)), ...[0, 1, 2, 3, 4].map(k => part(cone(0.035, 0.16, 6), GOLD, 0, TRS(Math.cos(k * 1.26) * 0.17, 0.46, Math.sin(k * 1.26) * 0.17))), part(sph(0.04, 8, 6), 0xff3a3a, 0, TRS(0, 0.36, 0.21))]); return mergeGeo([b, extra]); },
    shaman: () => merge([part(sph(0.2, 14, 10), 0x2a1a33, 0, TRS(0, 0.17, 0)), part(sph(0.17, 14, 10, 0, Math.PI * 0.6), IVORY, 0, TRS(0, 0.15, 0.06, Math.PI / 2, 0, 0)), part(sph(0.03, 8, 6), 0xe9a0ff, 0, TRS(-0.065, 0.17, 0.215)), part(sph(0.03, 8, 6), 0xe9a0ff, 0, TRS(0.065, 0.17, 0.215)),
      part(cone(0.27, 0.58, 14), 0xd8c8ff, 1, TRS(0, 0.4, -0.04)), part(tor(0.235, 0.025, 5, 18), GOLD, 0, TRS(0, 0.18, 0, Math.PI / 2, 0, 0))]),
    goggles: () => merge([...face(SKIN), dome(0.235, 0xeaeaea, 1, 0.21, Math.PI * 0.5), part(tor(0.215, 0.03, 6, 20), DLEATHER, 0, TRS(0, 0.2, 0, Math.PI / 2 - 0.1, 0, 0)),
      part(cyl(0.06, 0.06, 0.05, 12), DARK, 0, TRS(-0.075, 0.22, 0.19, Math.PI / 2, 0, 0)), part(cyl(0.06, 0.06, 0.05, 12), DARK, 0, TRS(0.075, 0.22, 0.19, Math.PI / 2, 0, 0)),
      part(new THREE.CircleGeometry(0.045, 12), 0xffb84a, 0, TRS(-0.075, 0.22, 0.216)), part(new THREE.CircleGeometry(0.045, 12), 0xffb84a, 0, TRS(0.075, 0.22, 0.216))]),
    looter: () => merge([...face(SKIN), part(sph(0.214, 16, 10, 0, Math.PI * 0.52), HAIR, 0, TRS(0, 0.19, -0.015)), part(box(0.3, 0.06, 0.12), HAIR, 0, TRS(0, 0.33, 0.12, 0.35, 0, 0)),
      part(sph(0.07, 8, 6), HAIR, 0, TRS(-0.17, 0.16, -0.05)), part(sph(0.07, 8, 6), HAIR, 0, TRS(0.17, 0.16, -0.05)),
      part(tor(0.213, 0.036, 6, 20), 0xe8eeff, 1, TRS(0, 0.25, 0, Math.PI / 2 - 0.12, 0, 0)), part(box(0.05, 0.17, 0.04), 0xe8eeff, 1, TRS(0.05, 0.19, -0.24, 0.55, 0, 0.3)), part(box(0.05, 0.15, 0.04), 0xe8eeff, 1, TRS(-0.04, 0.17, -0.245, 0.75, 0, -0.3))]),
    wizard: () => merge([...face(SKIN), part(sph(0.165, 12, 10), BEARD, 0, TRS(0, 0.04, 0.12, 0, 0, 0, 1.05, 1.35, 0.75)), part(box(0.2, 0.04, 0.05), BEARD, 0, TRS(0, 0.115, 0.205)),
      part(box(0.07, 0.025, 0.03), BEARD, 0, TRS(-0.07, 0.215, 0.19, 0, 0, -0.2)), part(box(0.07, 0.025, 0.03), BEARD, 0, TRS(0.07, 0.215, 0.19, 0, 0, 0.2)),
      part(sph(0.08, 8, 6), BEARD, 0, TRS(-0.18, 0.15, -0.02)), part(sph(0.08, 8, 6), BEARD, 0, TRS(0.18, 0.15, -0.02)),
      part(cyl(0.34, 0.34, 0.04, 22), 0xe8eeff, 1, TRS(0, 0.3, -0.01)), part(cyl(0.225, 0.235, 0.07, 18), DLEATHER, 0, TRS(0, 0.345, -0.01)),
      part(cone(0.225, 0.62, 14), 0xe8eeff, 1, TRS(0, 0.68, -0.07, -0.22, 0, 0)), part(sph(0.035, 6, 4), CRYSTAL, 0, TRS(0, 0.98, -0.15))]),
    elite: () => merge([part(cyl(0.25, 0.262, 0.26, 20), HELM, 0, TRS(0, 0.16, 0)), dome(0.252, HELM, 0, 0.29, Math.PI / 2), part(tor(0.262, 0.022, 5, 20), GOLD, 0, TRS(0, 0.03, 0, Math.PI / 2, 0, 0)),
      part(box(0.32, 0.045, 0.05), DARK, 0, TRS(0, 0.2, 0.245)), part(box(0.04, 0.15, 0.05), HELM, 0, TRS(0, 0.12, 0.258)), ...[-0.08, -0.04, 0.04, 0.08].map(x => part(box(0.015, 0.06, 0.03), DARK, 0, TRS(x, 0.1, 0.26))),
      part(box(0.07, 0.11, 0.42), 0xe8eeff, 1, TRS(0, 0.5, -0.03, 0.1, 0, 0)), part(box(0.05, 0.05, 0.05), GOLD, 0, TRS(0, 0.45, 0.19))]),
    golem: () => merge([part(box(0.38, 0.32, 0.36), 0xe2eaff, 1, TRS(0, 0.14, 0)), part(box(0.32, 0.17, 0.05), PLATE, 0, TRS(0, 0.12, 0.185)), part(box(0.25, 0.045, 0.03), DARK, 0, TRS(0, 0.15, 0.212)),
      part(sph(0.03, 6, 4), GLOW, 0, TRS(-0.07, 0.15, 0.222)), part(sph(0.03, 6, 4), GLOW, 0, TRS(0.07, 0.15, 0.222)), part(box(0.4, 0.08, 0.38), 0xc8d4f0, 1, TRS(0, 0.32, 0)), part(box(0.1, 0.08, 0.36), PLATE, 0, TRS(0, 0.38, 0))]),
    hoodE: () => merge([...face(SKIN), part(sph(0.255, 16, 10, 0, Math.PI * 0.62), 0xc0ccff, 1, TRS(0, 0.19, -0.03)), part(box(0.34, 0.07, 0.04), DARK, 0, TRS(0, 0.1, 0.205)),
      part(cone(0.045, 0.2, 6), DARK, 0, TRS(-0.15, 0.42, -0.02, 0, 0, 0.5)), part(cone(0.045, 0.2, 6), DARK, 0, TRS(0.15, 0.42, -0.02, 0, 0, -0.5))]),
  };
  function mergeGeo(list) { const parts = []; for (const g of list) { const n = g.attributes.position.count, c = g.attributes.color.array, t = g.attributes.aTint.array; for (let k = 0; k < n; k++) { /* keep per-vertex colours */ } parts.push(g); } return concat(parts); }
  function concat(gs) {
    const keys = ['position', 'normal', 'color', 'aTint']; const out = new THREE.BufferGeometry();
    for (const k of keys) { const size = gs[0].attributes[k].itemSize; let n = 0; for (const g of gs) n += g.attributes[k].array.length; const a = new Float32Array(n); let o = 0; for (const g of gs) { a.set(g.attributes[k].array, o); o += g.attributes[k].array.length; } out.setAttribute(k, new THREE.BufferAttribute(a, size)); }
    out.computeBoundingSphere(); return out;
  }

  // ---------------- ARMS ---------------- (shoulder pivot; mitten fist at y=-0.27)
  function armStd() {
    return merge([part(sph(0.085, 10, 8), 0xd8e0ff, 1), ...capsule(0.068, 0.15, 0xd8e0ff, 1, TRS(0, -0.01, 0)), part(cyl(0.078, 0.07, 0.07, 10), LEATHER, 0, TRS(0, -0.2, 0)),
      part(sph(0.088, 12, 9), SKIN, 0, TRS(0, -0.27, 0.012, 0, 0, 0, 1, 0.95, 1.05)), part(sph(0.04, 8, 6), SKIN, 0, TRS(0.05, -0.25, 0.06))], [-0.3, 0.0, 0.75]);
  }
  function armHeavy() {
    return merge([part(sph(0.095, 10, 8), STEEL, 0), ...capsule(0.07, 0.14, 0xd8e0ff, 1, TRS(0, -0.01, 0)), part(cyl(0.09, 0.075, 0.1, 10), STEEL, 0, TRS(0, -0.2, 0)), part(tor(0.088, 0.015, 5, 12), GOLD, 0, TRS(0, -0.16, 0, Math.PI / 2, 0, 0)),
      part(sph(0.096, 12, 9), DSTEEL, 0, TRS(0, -0.275, 0.012))], [-0.3, 0.0, 0.75]);
  }
  function armLooter() {   // rolled white sleeves, bare forearms, fingerless leather gloves
    return merge([part(sph(0.085, 10, 8), SHIRT, 0), ...capsule(0.07, 0.07, SHIRT, 0, TRS(0, -0.01, 0)), ...capsule(0.058, 0.09, SKIN, 0, TRS(0, -0.1, 0)), part(cyl(0.066, 0.066, 0.06, 10), DLEATHER, 0, TRS(0, -0.2, 0)),
      part(sph(0.085, 12, 9), LEATHER, 0, TRS(0, -0.27, 0.012, 0, 0, 0, 1, 0.95, 1.05))], [-0.3, 0.0, 0.75]);
  }
  function armGolem() {
    return merge([part(box(0.22, 0.24, 0.24), 0xe2eaff, 1, TRS(0, -0.08, 0)), part(box(0.25, 0.14, 0.26), PLATE, 0, TRS(0, -0.22, 0)), part(box(0.28, 0.22, 0.28), 0xe2eaff, 1, TRS(0, -0.35, 0.01)),
      part(box(0.29, 0.05, 0.12), PLATE, 0, TRS(0, -0.3, 0.1))], [-0.45, 0.0, 0.72]);
  }
  function legGolem() {
    return merge([part(box(0.24, 0.24, 0.26), 0xe2eaff, 1, TRS(0, -0.1, 0)), part(box(0.2, 0.1, 0.07), PLATE, 0, TRS(0, -0.07, 0.14)), part(box(0.28, 0.12, 0.34), DSTEEL, 0, TRS(0, -0.27, 0.04))], [-0.33, 0.0, 0.6]);
  }
  function armBrute() {
    return merge([...capsule(0.12, 0.18, 0xffc4b4, 1, TRS(0, -0.0, 0)), part(cyl(0.13, 0.12, 0.09, 10), DSTEEL, 0, TRS(0, -0.22, 0)), part(sph(0.14, 12, 9), 0xffc4b4, 1, TRS(0, -0.31, 0.02))], [-0.35, 0.0, 0.72]);
  }

  // ---------------- WEAPONS ---------------- (grip at origin, pointing +z)
  const W = {
    sword: g => merge([part(box(0.075, 0.02, 0.6), g ? GOLD : STEEL, 0, TRS(0, 0, 0.4)), part(cone(0.0375, 0.1, 4), g ? GOLD : STEEL, 0, TRS(0, 0, 0.74, Math.PI / 2, 0, 0, 1, 1, 0.3)), part(box(0.025, 0.022, 0.52), WHITE, 0, TRS(0, 0.011, 0.4)),
      part(box(0.2, 0.04, 0.045), GOLD, 0, TRS(0, 0, 0.075)), part(cyl(0.025, 0.025, 0.13, 6), LEATHER, 0, TRS(0, 0, 0, Math.PI / 2, 0, 0)), part(sph(0.035, 8, 6), GOLD, 0, TRS(0, 0, -0.075))]),
    dagger: () => merge([part(box(0.05, 0.016, 0.24), STEEL, 0, TRS(0, 0, 0.18)), part(box(0.12, 0.03, 0.035), GOLD, 0, TRS(0, 0, 0.055)), part(cyl(0.022, 0.022, 0.09, 6), LEATHER, 0, TRS(0, 0, 0, Math.PI / 2, 0, 0))]),
    axe: () => merge([part(cyl(0.035, 0.035, 0.95, 8), WOOD, 0, TRS(0, 0, 0.3, Math.PI / 2, 0, 0)), part(box(0.05, 0.3, 0.24), 0x9aa4b2, 0, TRS(0, 0.15, 0.68)), part(box(0.056, 0.035, 0.25), 0xe8eef6, 0, TRS(0, 0.31, 0.68)), part(box(0.07, 0.09, 0.09), DSTEEL, 0, TRS(0, 0, 0.68)), part(cone(0.04, 0.12, 6), DSTEEL, 0, TRS(0, 0, 0.83, Math.PI / 2, 0, 0))]),
    bow: () => merge([part(tor(0.36, 0.025, 6, 16, Math.PI * 0.8), WOOD, 0, TRS(0, 0.1, 0, 0, Math.PI / 2, Math.PI / 2 + Math.PI * 0.1)), part(box(0.008, 0.008, 0.68), 0xf0f0f0, 0, TRS(0, 0.1 - 0.2, 0)), part(cyl(0.03, 0.03, 0.12, 6), LEATHER, 0, TRS(0, 0, 0, Math.PI / 2, 0, 0))]),
    staff: () => merge([part(cyl(0.028, 0.034, 1.0, 7), 0x4a2f22, 0, TRS(0, 0, 0.35, Math.PI / 2, 0, 0)), part(new THREE.OctahedronGeometry(0.11), CRYSTAL, 0, TRS(0, 0, 0.92, 0, 0, 0, 0.8, 0.8, 1.5)), part(tor(0.08, 0.015, 5, 12), GOLD, 0, TRS(0, 0, 0.82)), part(tor(0.06, 0.012, 4, 10), 0x4a2f22, 0, TRS(0, 0, 0.78))]),
    bomb: () => merge([part(sph(0.15, 12, 10), 0x24252c, 0, TRS(0, 0.0, 0.09)), part(cyl(0.05, 0.05, 0.05, 8), DSTEEL, 0, TRS(0, 0.15, 0.09)), part(cyl(0.012, 0.012, 0.1, 5), 0xd9b27a, 0, TRS(0.02, 0.22, 0.09, 0, 0, -0.4)), part(sph(0.025, 6, 4), 0xffd24a, 0, TRS(0.04, 0.27, 0.09))]),
    claws: () => merge([0, 1, 2].map(k => part(cone(0.018, 0.1, 5), IVORY, 0, TRS((k - 1) * 0.04, 0, 0.1, Math.PI / 2, 0, 0)))),
    // ranged weapon eras (held in the right hand, pointing +Z): rock → javelin → (bow) → crossbow → musket → rifle → pulse rifle
    rock: () => merge([part(new THREE.DodecahedronGeometry(0.09, 0), 0x9a9488, 0, TRS(0, 0.02, 0.06)), part(cyl(0.03, 0.03, 0.08, 6), LEATHER, 0, TRS(0, 0, 0, Math.PI / 2, 0, 0))]),
    spear: () => merge([part(cyl(0.02, 0.024, 1.15, 6), WOOD, 0, TRS(0, 0, 0.32, Math.PI / 2, 0, 0)), part(cone(0.045, 0.2, 5), STEEL, 0, TRS(0, 0, 0.98, Math.PI / 2, 0, 0)), part(cyl(0.03, 0.03, 0.1, 6), LEATHER, 0, TRS(0, 0, 0, Math.PI / 2, 0, 0))]),
    xbow: () => merge([part(box(0.06, 0.06, 0.55), WOOD, 0, TRS(0, 0, 0.2)), part(tor(0.22, 0.02, 5, 12, Math.PI * 0.75), DSTEEL, 0, TRS(0, 0, 0.42, Math.PI / 2, 0, Math.PI * 0.625)), part(box(0.44, 0.008, 0.008), 0xf0f0f0, 0, TRS(0, 0, 0.34)), part(box(0.03, 0.03, 0.3), STEEL, 0, TRS(0, 0.04, 0.35))]),
    musket: () => merge([part(box(0.07, 0.09, 0.42), WOOD, 0, TRS(0, -0.02, 0.05)), part(cyl(0.022, 0.026, 0.8, 8), DSTEEL, 0, TRS(0, 0.03, 0.55, Math.PI / 2, 0, 0)), part(box(0.03, 0.05, 0.05), GOLD, 0, TRS(0, 0.06, 0.12))]),
    rifle: () => merge([part(box(0.07, 0.1, 0.38), 0x3a3d48, 0, TRS(0, -0.02, 0.08)), part(cyl(0.022, 0.022, 0.62, 8), DARK, 0, TRS(0, 0.03, 0.55, Math.PI / 2, 0, 0)), part(box(0.05, 0.05, 0.22), DSTEEL, 0, TRS(0, 0.09, 0.2)), part(box(0.04, 0.12, 0.06), DARK, 0, TRS(0, -0.1, 0.18))]),
    pulse: () => merge([part(box(0.09, 0.12, 0.5), 0xe8eef6, 0, TRS(0, 0, 0.18)), part(cyl(0.035, 0.035, 0.45, 8), 0x3fd0ff, 0, TRS(0, 0.02, 0.6, Math.PI / 2, 0, 0)), part(box(0.1, 0.03, 0.3), 0x3fd0ff, 0, TRS(0, 0.08, 0.2))]),
    // medic equipment eras: satchel → field kit → modern kit → advanced injector (weapon socket)
    sack: () => merge([part(sph(0.17, 10, 8), 0xd9b27a, 0, TRS(0, 0.05, -0.05, 0, 0, 0, 1, 0.85, 1)), part(cyl(0.05, 0.07, 0.08, 8), 0xa07a4a, 0, TRS(0, 0.2, -0.05)), part(sph(0.06, 8, 6), GOLD, 0, TRS(0, 0.24, -0.05))]),
  };
  function shield() {
    return merge([part(cyl(0.21, 0.21, 0.05, 20), 0xe6ecff, 1, TRS(0, 0, 0, Math.PI / 2, 0, 0)), part(tor(0.21, 0.025, 6, 22), GOLD, 0), part(sph(0.055, 10, 8, 0, Math.PI / 2), GOLD, 0, TRS(0, 0, 0.025, Math.PI / 2, 0, 0)),
      part(box(0.06, 0.3, 0.012), WHITE, 0, TRS(0, 0, 0.028)), part(box(0.3, 0.06, 0.012), WHITE, 0, TRS(0, 0, 0.028))]);
  }
  function cannon() {
    return merge([
      part(cyl(0.2, 0.27, 1.25, 16), 0x34363f, 0, TRS(0, 0.62, 0.15, Math.PI / 2 - 0.22, 0, 0)), part(tor(0.215, 0.05, 6, 16), GOLD, 0, TRS(0, 0.76, 0.75, -0.22, 0, 0)), part(tor(0.24, 0.035, 6, 16), GOLD, 0, TRS(0, 0.56, -0.12, -0.22, 0, 0)),
      part(box(0.74, 0.3, 1.0), 0xf0e0e0, 1, TRS(0, 0.36, -0.1)), part(box(0.78, 0.06, 1.04), DLEATHER, 0, TRS(0, 0.52, -0.1)),
      part(cyl(0.32, 0.32, 0.1, 16), WOOD, 0, TRS(-0.45, 0.32, -0.12, 0, 0, Math.PI / 2)), part(cyl(0.32, 0.32, 0.1, 16), WOOD, 0, TRS(0.45, 0.32, -0.12, 0, 0, Math.PI / 2)),
      part(cyl(0.08, 0.08, 0.12, 8), DSTEEL, 0, TRS(-0.5, 0.32, -0.12, 0, 0, Math.PI / 2)), part(cyl(0.08, 0.08, 0.12, 8), DSTEEL, 0, TRS(0.5, 0.32, -0.12, 0, 0, Math.PI / 2)),
      part(box(0.12, 0.45, 0.08), 0xf0e0e0, 1, TRS(0, 0.75, -0.7, 0.4, 0, 0)), part(box(0.5, 0.35, 0.03), 0xf0e0e0, 1, TRS(0, 0.95, -0.82, 0.4, 0, 0)),
    ], [0, 0.5, 0.7]);
  }
  // add-ons: gold pauldrons (friendly armour upgrade) on the torso, plume on the head
  const pads = () => merge([part(sph(0.135, 12, 8, 0, Math.PI / 2), GOLD, 0, TRS(-0.28, 0.35, 0, 0, 0, 0.45)), part(sph(0.135, 12, 8, 0, Math.PI / 2), GOLD, 0, TRS(0.28, 0.35, 0, 0, 0, -0.45)), part(box(0.3, 0.05, 0.03), GOLD, 0, TRS(0, 0.36, 0.25))]);
  // escalation add-ons for later enemy eras
  const padsIron = () => merge([part(sph(0.14, 12, 8, 0, Math.PI / 2), DSTEEL, 0, TRS(-0.28, 0.35, 0, 0, 0, 0.45)), part(sph(0.14, 12, 8, 0, Math.PI / 2), DSTEEL, 0, TRS(0.28, 0.35, 0, 0, 0, -0.45)), part(cone(0.035, 0.12, 6), IVORY, 0, TRS(-0.33, 0.47, 0, 0, 0, 0.5)), part(cone(0.035, 0.12, 6), IVORY, 0, TRS(0.33, 0.47, 0, 0, 0, -0.5))]);
  const hornsAdd = () => merge([part(cone(0.05, 0.24, 8), IVORY, 0, TRS(-0.2, 0.42, 0.02, 0.2, 0, 0.6)), part(cone(0.05, 0.24, 8), IVORY, 0, TRS(0.2, 0.42, 0.02, 0.2, 0, -0.6))]);
  const eyesGlow = () => merge([part(sph(0.036, 8, 6), 0xffe05a, 0, TRS(-0.072, 0.158, 0.2)), part(sph(0.036, 8, 6), 0xffe05a, 0, TRS(0.072, 0.158, 0.2)), part(box(0.1, 0.02, 0.02), 0x2a0808, 0, TRS(-0.07, 0.205, 0.19, 0, 0, -0.35)), part(box(0.1, 0.02, 0.02), 0x2a0808, 0, TRS(0.07, 0.205, 0.19, 0, 0, 0.35))]);
  const plume = () => merge([part(sph(0.09, 10, 8), 0xff4a4a, 0, TRS(0, 0.5, -0.05, 0, 0, 0, 0.5, 1.1, 1.8)), part(cyl(0.03, 0.04, 0.06, 6), GOLD, 0, TRS(0, 0.45, 0))]);

  // ---------------- recipes: unit kind → parts ----------------
  KM.RECIPE = {
    // friendly classes follow the approved reference portraits (LOOTER · RANGE · MELEE · MIZARD · ELITE · GIANT)
    soldier: { torso: 'tLight', head: 'hBlue', arm: 'aStd', leg: 'lStd', wpn: 'sword', shield: 1 },   // MELEE: blue helmet + sword (shield wall in DEFEND)
    archerF: { torso: 'tArcher', head: 'hHood', arm: 'aStd', leg: 'lStd', wpn: 'bow' },                // RANGE: hood, bow, quiver
    knightF: { torso: 'tHeavy', head: 'hElite', arm: 'aHeavy', leg: 'lStd', wpn: 'sword', shield: 1 },   // ELITE: steel great helm, heavy plate
    grunt: { torso: 'tLight', head: 'hHorn', arm: 'aStd', leg: 'lStd', wpn: 'sword' },
    imp: { torso: 'tLight', head: 'hImp', arm: 'aStd', leg: 'lStd', wpn: 'claws' },
    shield: { torso: 'tHeavy', head: 'hBucket', arm: 'aStd', leg: 'lStd', wpn: 'sword', shield: 1 },
    runner: { torso: 'tLight', head: 'hBandana', arm: 'aStd', leg: 'lStd', wpn: 'dagger' },
    archer: { torso: 'tLight', head: 'hHoodE', arm: 'aStd', leg: 'lStd', wpn: 'bow' },   // enemy ranged: masked hood with dark horns (never the friendly archer silhouette)
    knight: { torso: 'tHeavy', head: 'hBucket', arm: 'aHeavy', leg: 'lStd', wpn: 'axe', shield: 1 },
    brute: { torso: 'tBrute', head: 'hBrute', arm: 'aBrute', leg: 'lBrute', wpn: 'axe' },
    bomber: { torso: 'tLight', head: 'hGoggles', arm: 'aStd', leg: 'lStd', wpn: 'bomb' },
    shaman: { torso: 'tRobe', head: 'hShaman', arm: 'aStd', leg: 'lStd', wpn: 'staff' },
    warlord: { torso: 'tBrute', head: 'hWarlord', arm: 'aBrute', leg: 'lBrute', wpn: 'axe' },
    spearman: { torso: 'tHeavy', head: 'hKnight', arm: 'aStd', leg: 'lStd', wpn: 'spear', shield: 1 },
    giant: { torso: 'tBrute', head: 'hBrute', arm: 'aBrute', leg: 'lBrute', wpn: 'axe' },
    titan: { torso: 'tBrute', head: 'hHorn', arm: 'aBrute', leg: 'lBrute', wpn: 'axe' },
    colossus: { torso: 'tBrute', head: 'hBucket', arm: 'aBrute', leg: 'lBrute', wpn: 'axe', shield: 1 },
    hunter: { torso: 'tBrute', head: 'hGoggles', arm: 'aBrute', leg: 'lBrute', wpn: 'axe' },
    cannon: { body: 'cannon' },
    collector: { torso: 'tLooter', head: 'hLooter', arm: 'aLooter', leg: 'lStd', wpn: 'dagger' },   // LOOTER: headband, crate backpack, knife
    medic: { torso: 'tRobe', head: 'hWizard', arm: 'aStd', leg: 'lStd', wpn: 'staff' },   // MIZARD: pointed hat, white beard, crystal staff
    giantF: { torso: 'tGolem', head: 'hGolem', arm: 'aGolem', leg: 'lGolem', wpn: 'none' },   // GIANT: blue armoured golem, fists
  };
  // skeleton offsets per body family (std vs brute proportions)
  KM.isBig = r => r.torso === 'tBrute' || r.torso === 'tGolem';
  KM.rigOf = r => r.torso === 'tGolem' ? KM.RIG.golem : r.torso === 'tBrute' ? KM.RIG.brute : KM.RIG.std;
  KM.RIG = {
    std: { hip: [0.11, 0.33], torso: 0.34, neck: 0.4, shoulder: [0.3, 0.33], fist: -0.27, shieldAt: [-0.03, -0.17, 0.1] },
    brute: { hip: [0.17, 0.33], torso: 0.32, neck: 0.44, shoulder: [0.47, 0.34], fist: -0.31, shieldAt: [0, -0.2, 0.12] },
    golem: { hip: [0.17, 0.33], torso: 0.34, neck: 0.44, shoulder: [0.52, 0.36], fist: -0.35, shieldAt: [0, -0.2, 0.12] },
  };

  // Build all part geometries + far-LOD statues (one merged mesh per kind posed at rest).
  const buildParts = () => ({
      lStd: legStd(), lBrute: legBrute(), lGolem: legGolem(), tLight: merge(torsoLight(), [-0.08, 0.3, 0.7]), tHeavy: torsoHeavy(), tBrute: torsoBrute(), tRobe: torsoRobe(), tLooter: torsoLooter(), tArcher: torsoArcher(), tGolem: torsoGolem(),
      hBlue: H.blue(), hKnight: H.knight(), hHood: H.hood(), hHorn: H.horn(), hBucket: H.bucket(), hBandana: H.bandana(), hImp: H.imp(), hBrute: H.brute(), hWarlord: H.warlord(), hShaman: H.shaman(), hGoggles: H.goggles(), hLooter: H.looter(), hWizard: H.wizard(), hElite: H.elite(), hGolem: H.golem(), hHoodE: H.hoodE(),
      aStd: armStd(), aHeavy: armHeavy(), aBrute: armBrute(), aLooter: armLooter(), aGolem: armGolem(),
      sword: W.sword(), swordGold: W.sword(true), dagger: W.dagger(), axe: W.axe(), bow: W.bow(), staff: W.staff(), bomb: W.bomb(), claws: W.claws(),
            rock: W.rock(), spear: W.spear(), xbow: W.xbow(), musket: W.musket(), rifle: W.rifle(), pulse: W.pulse(), sack: W.sack(),
      shield: shield(), cannon: cannon(), pads: pads(), plume: plume(), padsIron: padsIron(), hornsAdd: hornsAdd(), eyesGlow: eyesGlow(),
  });
  KM.KIT_DETAIL = { near: 0.5 };
  // Lean bone parts (~300 tris/unit) for mid-distance animated units, and far statues composed from the same pieces.
  function leanParts() {
    const P = {}, box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    for (const [k, S] of [['m_leg', 1], ['m_legB', 1.45]]) P[k] = merge([part(box(0.14 * S, 0.28, 0.16 * S), 0x5c6178, 1, TRS(0, -0.15, 0)), part(box(0.17 * S, 0.08, 0.25 * S), LEATHER, 0, TRS(0, -0.29, 0.03))], [-0.33, 0, 0.62]);
    for (const [k, S, c] of [['m_arm', 1, 0xd8e0ff], ['m_armB', 1.55, 0xffc4b4]]) P[k] = merge([part(box(0.12 * S, 0.24, 0.12 * S), c, 1, TRS(0, -0.11, 0)), part(new THREE.SphereGeometry(0.09 * S, 5, 3), c === 0xd8e0ff ? SKIN : c, c === 0xd8e0ff ? 0 : 1, TRS(0, -0.27, 0.01))], [-0.3, 0, 0.75]);
    P.m_legG = merge([part(box(0.24, 0.26, 0.26), 0xe2eaff, 1, TRS(0, -0.12, 0)), part(box(0.28, 0.1, 0.32), DSTEEL, 0, TRS(0, -0.28, 0.04))], [-0.33, 0, 0.62]);
    P.m_armG = merge([part(box(0.22, 0.26, 0.24), 0xe2eaff, 1, TRS(0, -0.1, 0)), part(box(0.25, 0.1, 0.26), PLATE, 0, TRS(0, -0.23, 0)), part(box(0.28, 0.22, 0.28), 0xe2eaff, 1, TRS(0, -0.35, 0.01))], [-0.45, 0, 0.72]);
    P.m_shield = merge([part(new THREE.CylinderGeometry(0.21, 0.21, 0.05, 7), 0xe6ecff, 1, TRS(0, 0, 0, Math.PI / 2, 0, 0)), part(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 5), GOLD, 0, TRS(0, 0, 0.03, Math.PI / 2, 0, 0))]);
    const stick = (len, col, extra) => merge([part(box(0.05, 0.03, len), col, 0, TRS(0, 0, len / 2 + 0.05)), ...(extra || [])]);
    P.m_w_sword = stick(0.62, STEEL, [part(box(0.18, 0.04, 0.05), GOLD, 0, TRS(0, 0, 0.08))]); P.m_w_swordGold = stick(0.62, GOLD, [part(box(0.18, 0.04, 0.05), GOLD, 0, TRS(0, 0, 0.08))]);
    P.m_w_dagger = stick(0.3, STEEL); P.m_w_staff = stick(1.0, 0x4a2f22, [part(new THREE.OctahedronGeometry(0.1, 0), 0xe39aff, 0, TRS(0, 0, 0.95))]);
    P.m_w_axe = stick(0.9, WOOD, [part(box(0.05, 0.3, 0.24), 0x9aa4b2, 0, TRS(0, 0.15, 0.7))]); P.m_w_bow = merge([part(box(0.03, 0.03, 0.7), WOOD, 0, TRS(0, 0.1, 0))]);
    P.m_w_bomb = merge([part(new THREE.SphereGeometry(0.15, 5, 4), 0x24252c, 0, TRS(0, 0, 0.09))]);
    P.m_w_rock = merge([part(new THREE.SphereGeometry(0.09, 4, 3), 0x9a9488, 0, TRS(0, 0, 0.06))]); P.m_w_spear = stick(1.1, WOOD); P.m_w_xbow = stick(0.5, WOOD, [part(box(0.4, 0.03, 0.04), DSTEEL, 0, TRS(0, 0, 0.42))]);
    P.m_w_musket = stick(0.95, DSTEEL); P.m_w_rifle = stick(0.8, DARK); P.m_w_pulse = stick(0.75, 0x3fd0ff); P.m_w_sack = merge([part(new THREE.SphereGeometry(0.17, 5, 4), 0xd9b27a, 0, TRS(0, 0.05, -0.05))]); P.m_w_claws = merge([part(box(0.1, 0.02, 0.12), IVORY, 0, TRS(0, 0, 0.08))]);
    for (const [k, r] of Object.entries(KM.RECIPE)) {
      if (r.body) continue;
      if (r.torso === 'tGolem') { const G = KM.RIG.golem, hy = G.neck;   // friendly giant: blocky blue golem with white plates
        P['m_th_' + k] = merge([part(box(0.8, 0.52, 0.52), 0xe2eaff, 1, TRS(0, 0.22, 0)), part(box(0.52, 0.36, 0.06), PLATE, 0, TRS(0, 0.26, 0.27)), part(box(0.68, 0.07, 0.48), DSTEEL, 0, TRS(0, 0.03, 0)),
          part(box(0.36, 0.17, 0.46), PLATE, 0, TRS(-0.47, 0.47, 0, 0, 0, 0.22)), part(box(0.36, 0.17, 0.46), PLATE, 0, TRS(0.47, 0.47, 0, 0, 0, -0.22)),
          part(box(0.38, 0.32, 0.36), 0xe2eaff, 1, TRS(0, hy + 0.14, 0)), part(box(0.32, 0.17, 0.05), PLATE, 0, TRS(0, hy + 0.12, 0.185)), part(box(0.25, 0.045, 0.03), DARK, 0, TRS(0, hy + 0.15, 0.212)), part(box(0.4, 0.09, 0.38), PLATE, 0, TRS(0, hy + 0.33, 0))], [-0.15, 0.4, 0.72]);
        continue; }
      const brute = r.torso === 'tBrute', S = brute ? 1.45 : 1, rig = brute ? KM.RIG.brute : KM.RIG.std, L = [];
      const hs = { hBlue: 'dome', hKnight: 'plume', hHood: 'hood', hHoodE: 'hood', hHorn: 'horns', hBucket: 'bucket', hBandana: 'band', hLooter: 'band', hImp: 'imp', hBrute: 'bhorns', hWarlord: 'crown', hShaman: 'cone', hWizard: 'cone', hElite: 'helm', hGoggles: 'dome' }[r.head];
      L.push(part(new THREE.LatheGeometry([[0, -0.02], [0.22, 0.0], [0.28, 0.13], [0.26, 0.3], [0.14, 0.4], [0, 0.42]].map(([a, b]) => new THREE.Vector2(a * S, b * (brute ? 1.08 : 1))), 7), r.torso === 'tRobe' ? 0xd8c8ff : brute ? 0xffd2c4 : 0xe6ebff, 1));
      L.push(part(new THREE.CylinderGeometry(0.27 * S, 0.27 * S, 0.06, 7), LEATHER, 0, TRS(0, 0.1, 0)));
      if (r.torso === 'tHeavy' || brute) for (const x of [-1, 1]) L.push(part(new THREE.SphereGeometry(0.13 * S, 5, 3, 0, Math.PI * 2, 0, Math.PI / 2), brute ? DSTEEL : 0xd8e0ff, brute ? 0 : 1, TRS(x * 0.27 * S, 0.34, 0)));
      const hy = rig.neck + 0.17, skinTint = r.head === 'hImp' || brute ? 1 : 0, skinC = skinTint ? 0xffc4b4 : r.head === 'hShaman' ? 0x2a1a33 : SKIN;
      L.push(part(new THREE.SphereGeometry(0.2 * (brute ? 1.08 : r.head === 'hImp' ? 1.12 : 1), 7, 5), skinC, skinTint, TRS(0, hy, 0)));
      if (!skinTint && r.head !== 'hShaman') for (const x of [-1, 1]) L.push(part(new THREE.SphereGeometry(0.03, 4, 2), DARK, 0, TRS(x * 0.072, hy - 0.015, 0.186)));
      const dome = (col, t, y) => L.push(part(new THREE.SphereGeometry(0.262, 8, 3, 0, Math.PI * 2, 0, Math.PI * 0.56), col, t, TRS(0, hy + (y || 0.03), -0.012)));
      if (hs === 'dome' || hs === 'plume') { dome(0xe8eeff, 1); L.push(part(new THREE.CylinderGeometry(0.268, 0.268, 0.05, 8), 0xb4c0ff, 1, TRS(0, hy, -0.012))); }
      if (hs === 'plume') L.push(part(new THREE.SphereGeometry(0.08, 5, 3), GOLD, 0, TRS(0, hy + 0.33, -0.05, 0, 0, 0, 0.6, 1.2, 1.6)));
      if (hs === 'dome' && r.head === 'hBlue') L.push(part(new THREE.BoxGeometry(0.05, 0.1, 0.4), 0xa4b2ff, 1, TRS(0, hy + 0.26, -0.03)));
      if (hs === 'hood') dome(0xc0ccff, 1, 0.02); if (hs === 'band') L.push(part(new THREE.CylinderGeometry(0.21, 0.21, 0.07, 7), 0xeaeaea, 1, TRS(0, hy + 0.05, 0)));
      if (hs === 'horns' || hs === 'bhorns' || hs === 'imp' || hs === 'crown') { if (hs === 'horns') dome(0xeaeaea, 1); if (hs === 'bhorns' || hs === 'crown') L.push(part(new THREE.SphereGeometry(0.225, 7, 3, 0, Math.PI * 2, 0, Math.PI * 0.45), DSTEEL, 0, TRS(0, hy + 0.03, -0.02))); const hl = hs === 'bhorns' || hs === 'crown' ? 0.36 : 0.22; for (const x of [-1, 1]) L.push(part(new THREE.ConeGeometry(0.06, hl, 5), IVORY, 0, TRS(x * 0.22, hy + 0.2, 0, 0, 0, -x * 0.8))); }
      if (hs === 'crown') L.push(part(new THREE.CylinderGeometry(0.2, 0.22, 0.1, 7), GOLD, 0, TRS(0, hy + 0.2, 0)));
      if (hs === 'bucket') L.push(part(new THREE.CylinderGeometry(0.24, 0.25, 0.32, 8), 0xd8d8d8, 1, TRS(0, hy + 0.05, 0)), part(new THREE.BoxGeometry(0.3, 0.035, 0.04), DARK, 0, TRS(0, hy + 0.03, 0.24)));
      if (hs === 'cone') L.push(part(new THREE.ConeGeometry(0.27, 0.58, 7), 0xd8c8ff, 1, TRS(0, hy + 0.23, -0.04)));
      if (hs === 'helm') { L.push(part(new THREE.CylinderGeometry(0.25, 0.262, 0.28, 8), HELM, 0, TRS(0, hy + 0.02, 0)), part(new THREE.BoxGeometry(0.3, 0.045, 0.05), DARK, 0, TRS(0, hy + 0.04, 0.245)), part(new THREE.BoxGeometry(0.07, 0.12, 0.42), 0xe8eeff, 1, TRS(0, hy + 0.36, -0.03))); }
      if (r.head === 'hWizard') L.push(part(new THREE.SphereGeometry(0.16, 6, 4), BEARD, 0, TRS(0, hy - 0.12, 0.12, 0, 0, 0, 1, 1.3, 0.75)), part(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 8), 0xe8eeff, 1, TRS(0, hy + 0.14, 0)));
      if (r.head === 'hLooter') L.push(part(new THREE.SphereGeometry(0.214, 7, 3, 0, Math.PI * 2, 0, Math.PI * 0.5), HAIR, 0, TRS(0, hy + 0.02, -0.015)), part(new THREE.BoxGeometry(0.4, 0.36, 0.22), WOOD, 0, TRS(0, 0.25, -0.34)));
      if (r.torso === 'tArcher') L.push(part(new THREE.CylinderGeometry(0.07, 0.075, 0.44, 6), LEATHER, 0, TRS(0.12, 0.3, -0.27, 0, 0, -0.35)));
      if (r.head === 'hHoodE') for (const x of [-1, 1]) L.push(part(new THREE.ConeGeometry(0.045, 0.2, 4), DARK, 0, TRS(x * 0.15, hy + 0.25, -0.02, 0, 0, -x * 0.5)));
      if (r.head === 'hGoggles') L.push(part(new THREE.BoxGeometry(0.26, 0.08, 0.05), DARK, 0, TRS(0, hy + 0.05, 0.19)));
      P['m_th_' + k] = merge(L, [-0.05, 0.3, 0.7]);
    }
    return P;
  }
  // Far statue: the lean pieces composed at the rest pose (single draw per kind, ~250 tris).
  function statue(k, r, P) {
    const golem = r.torso === 'tGolem', brute = r.torso === 'tBrute', rig = KM.rigOf(r), list = [], lg = golem ? 'm_legG' : brute ? 'm_legB' : 'm_leg', am = golem ? 'm_armG' : brute ? 'm_armB' : 'm_arm';
    const add = (g, m) => { const c = g.clone(); c.applyMatrix4(m); list.push(c); };
    add(P[lg], TRS(-rig.hip[0], rig.hip[1], 0, -0.1)); add(P[lg], TRS(rig.hip[0], rig.hip[1], 0, 0.1));
    const tor = TRS(0, rig.torso, 0, 0.08); add(P['m_th_' + k], tor);
    const aL = new M4().multiplyMatrices(tor, TRS(-rig.shoulder[0], rig.shoulder[1], 0, -0.15, 0, 0.12)), aR = new M4().multiplyMatrices(tor, TRS(rig.shoulder[0], rig.shoulder[1], 0, -0.55, 0, -0.12));
    add(P[am], aL); add(P[am], aR); if (r.wpn !== 'none') add(P['m_w_' + r.wpn], new M4().multiplyMatrices(r.wpn === 'bow' ? aL : aR, TRS(0, rig.fist, 0.02)));
    if (r.shield) add(P.m_shield, new M4().multiplyMatrices(aL, TRS(...rig.shieldAt)));
    const g = concat(list); list.forEach(x => x.dispose()); return g;
  }
  // Far crowd: three shared low-poly silhouettes (~90–130 tris) instead of one ~400-tri statue per kind. At that
  // distance kind reads from colour + silhouette, and one instanced draw per family replaces fourteen.
  KM.farFamily = r => r.torso === 'tGolem' ? 'F_golem' : r.torso === 'tBrute' ? 'F_brute' : r.head === 'hWizard' ? 'F_hat' : r.shield ? 'F_shield' : 'F_std';
  function farParts() {
    const out = {};
    for (const fam of ['F_std', 'F_shield', 'F_brute']) {
      const brute = fam === 'F_brute', S = brute ? 1.45 : 1, ty = brute ? 0.32 : 0.34, hy = ty + (brute ? 0.44 : 0.4) + 0.17, L = [];
      L.push(part(new THREE.BoxGeometry(0.34 * S, 0.32, 0.2 * S), 0x5c6178, 1, TRS(0, 0.16, 0.01)));                                  // legs as one block
      L.push(part(new THREE.LatheGeometry([[0, -0.02], [0.23, 0], [0.28, 0.16], [0.2, 0.38], [0, 0.42]].map(([a, b]) => new THREE.Vector2(a * S, b)), 5), brute ? 0xffd2c4 : 0xe6ebff, 1, TRS(0, ty, 0)));
      L.push(part(new THREE.SphereGeometry(0.2 * (brute ? 1.08 : 1), 5, 3), brute ? 0xffc4b4 : SKIN, brute ? 1 : 0, TRS(0, hy, 0)));
      L.push(part(new THREE.SphereGeometry(0.265 * (brute ? 0.9 : 1), 5, 2, 0, Math.PI * 2, 0, Math.PI * 0.55), brute ? DSTEEL : 0xe8eeff, brute ? 0 : 1, TRS(0, hy + 0.03, -0.01)));
      if (brute) for (const x of [-1, 1]) L.push(part(new THREE.ConeGeometry(0.07, 0.3, 4), IVORY, 0, TRS(x * 0.2, hy + 0.2, 0, 0, 0, -x * 0.6)));
      L.push(part(new THREE.BoxGeometry(0.05, 0.05, brute ? 0.9 : 0.62), brute ? 0x9aa4b2 : STEEL, 0, TRS(0.3 * S, ty + 0.1, 0.25)));   // weapon stub
      if (fam === 'F_shield') L.push(part(new THREE.CylinderGeometry(0.21, 0.21, 0.05, 6), 0xe6ecff, 1, TRS(-0.3, ty + 0.15, 0.12, Math.PI / 2, 0, 0)));
      out[fam] = merge(L, [0, 0.6, 0.7]);
    }
    { const G = KM.RIG.golem, ty = G.torso, hy = ty + G.neck, L = [];   // friendly giant far silhouette: square blue body, white shoulder plates, no horns
      L.push(part(new THREE.BoxGeometry(0.5, 0.34, 0.28), 0xe2eaff, 1, TRS(0, 0.17, 0)), part(new THREE.BoxGeometry(0.8, 0.56, 0.5), 0xe2eaff, 1, TRS(0, ty + 0.22, 0)),
        part(new THREE.BoxGeometry(1.1, 0.16, 0.44), PLATE, 0, TRS(0, ty + 0.47, 0)), part(new THREE.BoxGeometry(0.38, 0.4, 0.36), 0xe2eaff, 1, TRS(0, hy + 0.16, 0)),
        part(new THREE.BoxGeometry(0.24, 0.5, 0.26), 0xe2eaff, 1, TRS(-0.52, ty + 0.1, 0)), part(new THREE.BoxGeometry(0.24, 0.5, 0.26), 0xe2eaff, 1, TRS(0.52, ty + 0.1, 0)));
      out.F_golem = merge(L, [0, 0.6, 0.7]); }
    { const L = [];   // Mizard far silhouette: robe + tall pointed hat
      L.push(part(new THREE.CylinderGeometry(0.2, 0.32, 0.72, 6), 0xe6ebff, 1, TRS(0, 0.36, 0)), part(new THREE.SphereGeometry(0.2, 5, 3), SKIN, 0, TRS(0, 0.91, 0)), part(new THREE.SphereGeometry(0.15, 5, 3), BEARD, 0, TRS(0, 0.8, 0.1)),
        part(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 6), 0xe8eeff, 1, TRS(0, 1.04, 0)), part(new THREE.ConeGeometry(0.22, 0.6, 5), 0xe8eeff, 1, TRS(0, 1.36, -0.05)), part(new THREE.BoxGeometry(0.04, 0.04, 1.0), 0x4a2f22, 0, TRS(0.32, 0.5, 0.2)));
      out.F_hat = merge(L, [0, 0.6, 0.7]); }
    return out;
  }
  KM.buildKit = function () {
    DETAIL = KM.KIT_DETAIL.near; const parts = buildParts(); DETAIL = 1;
    Object.assign(parts, leanParts());
    const statues = {};
    for (const [k, r] of Object.entries(KM.RECIPE)) if (!r.body) statues[k] = statue(k, r, parts);
    Object.assign(parts, farParts());
    return { parts, statues };
  };

  // Cel-shaded material: 3-band toon ramp + faction tint mask + soft rim light for silhouette separation.
  let ramp = null;
  KM.toonMat = function (opts) {
    if (!ramp) { const d = new Uint8Array([100, 96, 124, 255, 200, 190, 194, 255, 255, 247, 230, 255]); /* cool shadow, warm light */ ramp = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat); ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true; }
    const m = new THREE.MeshToonMaterial(Object.assign({ vertexColors: true, gradientMap: ramp }, opts || {}));
    m.onBeforeCompile = sh => {
      sh.uniforms.uGlow = { value: KM.glowLevel || 1 }; m.userData.shader = sh;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aTint;\nattribute float aMetal;\nvarying float vMetal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMetal = aMetal;')
        .replace('#include <color_vertex>', `#if defined(USE_COLOR) || defined(USE_INSTANCING_COLOR)
          vColor = vec3(1.0);
        #endif
        #ifdef USE_COLOR
          vColor.xyz *= color.xyz;
        #endif
        #ifdef USE_INSTANCING_COLOR
          vColor.xyz *= mix(vec3(1.0), instanceColor.xyz, aTint);
        #endif`);
      sh.fragmentShader = sh.fragmentShader.replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
        'float rimK = 1.0 - max(dot(normal, normalize(vViewPosition)), 0.0); outgoingLight += diffuseColor.rgb * pow(rimK, 2.4) * 0.78 + vec3(0.17, 0.12, 0.05) * pow(rimK, 3.2);\n' +
        // metal (authored metalness/roughness → aMetal): bright cel highlight band from a fake sky reflection
        '\tvec3 rv = reflect(normalize(-vViewPosition), normal); float hi = smoothstep(0.55, 0.75, rv.y); outgoingLight = mix(outgoingLight, outgoingLight * 0.75 + diffuseColor.rgb * hi * 0.95 + vec3(0.34, 0.28, 0.15) * hi, vMetal);\n' +
        '\toutgoingLight += totalEmissiveRadiance * (uGlow - 1.0);\n\tgl_FragColor = vec4( outgoingLight, diffuseColor.a );')
        .replace('#include <common>', '#include <common>\nvarying float vMetal;\nuniform float uGlow;');
    };
    return m;
  };
  // Plain cel-shaded material for props (launcher, towers): same ramp + rim as units, no vertex colours.
  KM.toonPlain = function (color, o) {
    if (!ramp) KM.toonMat();
    o = Object.assign({}, o || {}); delete o.roughness; delete o.metalness;
    const m = new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: ramp }, o));
    m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );', 'float rimK = 1.0 - max(dot(normal, normalize(vViewPosition)), 0.0); outgoingLight += diffuseColor.rgb * pow(rimK, 2.6) * 0.45;\n\tgl_FragColor = vec4( outgoingLight, diffuseColor.a );'); };
    return m;
  };
  KM.kitMerge = merge; KM.kitPart = part; KM.kitTRS = TRS;
})(window);
