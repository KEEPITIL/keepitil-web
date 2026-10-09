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
  // friendly reference palette: cool white trim (reads white, not cream, under the warm ramp), silver plate, warm leather/wood browns
  const TRIM = 0xe8eef8, SILVER = 0xaab6c8, BROWN = 0x7d4c2a, PACK = 0x93603a, NAVY = 0x7a88b4, STAFFW = 0x8a5630;
  // GIANT: the warm sun + warm ramp lift back/top faces ~(1.45, 1.3, 1.05) per channel, so a neutral grey stone needs a cool albedo and skin
  // needs red/green below ~0.75 (brighter values clip to pale yellow-white at phone distance)
  const STONE = 0x7886a0, STONE2 = 0x4a5468, STONE3 = 0x9aa8c4, GSKIN = 0xc8987a, GSKIN2 = 0xb2826a, HAFT = 0x6a4226, PAD = TRIM, PADS = 0x8494c0, PADRIM = 0xa8b8e8;
  // ELITE silver: cool albedo so the helm / trim render silver-grey under the warm sun (plain SILVER turns cream-white from the game camera)
  const ESILV = 0x94a8d8, CREST = 0x9cb0e8;   // crest: a deeper base so the (lighter) Elite class tint still reads royal blue, not sky blue
  const HGO = [0, 0.04, 0.06];   // GIANT head sits a little high and forward (hunched, like the reference side view): the cap breaks the shoulder line from behind
  const GEM = new C(0.36, 0.95, 2.0);
  const PIKE = { butt: -0.45, tip: 1.105 };   // ELITE pike in weapon space (grip at 0). Tip chosen so the thrust strike frame reaches W.ELITE_RNG + rad (tests/anim.test.js)
  // GEM crystal blue above 1.0: stays luminous on the toon shadow band (cheap fake emissive, no extra draw)

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
  // LOOTER: white work shirt with a blue collar, blue apron, brown belt + suspenders, big brown backpack heaped with gold coins
  function torsoLooter() {
    const L = [
      part(lathe([[0.0, -0.02], [0.2, -0.0], [0.25, 0.1], [0.265, 0.22], [0.245, 0.33], [0.18, 0.4], [0.0, 0.43]], 18), TRIM, 0),        // white shirt
      part(cyl(0.15, 0.175, 0.07, 14), WHITE, 1, TRS(0, 0.4, 0)), part(box(0.16, 0.1, 0.03), WHITE, 1, TRS(0, 0.34, 0.215, -0.5, 0, 0)),     // blue collar + V
      part(box(0.3, 0.3, 0.035), WHITE, 1, TRS(0, -0.03, 0.262, -0.1, 0, 0)), part(box(0.3, 0.035, 0.04), 0xb8c4e8, 1, TRS(0, -0.17, 0.276, -0.1, 0, 0)),   // blue apron
      part(cyl(0.26, 0.26, 0.065, 18), BROWN, 0, TRS(0, 0.1, 0)), part(box(0.1, 0.075, 0.035), SILVER, 0, TRS(0, 0.1, 0.262)), part(box(0.1, 0.1, 0.07), DLEATHER, 0, TRS(0.2, 0.06, 0.16, 0, 0.7, 0)),
      ...[-1, 1].map(x => part(box(0.045, 0.34, 0.025), BROWN, 0, TRS(x * 0.12, 0.27, 0.24, -0.14, 0, 0))),
      // backpack: leather body, darker flap + side pockets, steel buckle, a heap of gold on top (the yellow read from the camera)
      part(box(0.42, 0.42, 0.25), PACK, 0, TRS(0, 0.24, -0.36)), part(box(0.44, 0.07, 0.27), DLEATHER, 0, TRS(0, 0.1, -0.36)), part(box(0.44, 0.13, 0.08), 0x6e4426, 0, TRS(0, 0.36, -0.235, 0.15, 0, 0)),
      ...[-1, 1].map(x => part(box(0.07, 0.2, 0.17), 0x6e4426, 0, TRS(x * 0.24, 0.2, -0.36))), part(box(0.07, 0.06, 0.02), SILVER, 0, TRS(0, 0.32, -0.19)),
      part(sph(0.17, 12, 6, 0, Math.PI / 2), GOLD, 0, TRS(0, 0.44, -0.36, 0, 0, 0, 1.15, 0.55, 0.7)),
    ];
    for (const [x, z, r] of [[-0.12, -0.3, 0.2], [0.1, -0.42, -0.3], [0.03, -0.33, 0.5]]) L.push(part(cyl(0.065, 0.065, 0.025, 10), 0xffd23a, 0, TRS(x, 0.5 + (x + z) * 0.05, z, 0.35 * Math.cos(r * 3), r, 0.3 * Math.sin(r * 4))));
    return merge(L, [-0.08, 0.3, 0.7]);
  }
  // RANGE: slim blue tunic with a lighter skirt, short cape, brown belt + baldric, brown quiver with blue-fletched arrows
  function torsoArcher() {
    return merge([
      part(lathe([[0.0, -0.02], [0.19, 0.0], [0.232, 0.1], [0.248, 0.22], [0.23, 0.33], [0.17, 0.4], [0.0, 0.43]], 16), WHITE, 1),         // blue tunic
      part(lathe([[0.22, 0.12], [0.248, 0.03], [0.268, -0.1], [0.0, -0.11]], 16), WHITE, 0.5),                                            // lighter skirt
      part(cyl(0.242, 0.242, 0.06, 16), BROWN, 0, TRS(0, 0.1, 0)), part(box(0.08, 0.065, 0.03), SILVER, 0, TRS(0, 0.1, 0.243)),
      part(box(0.05, 0.6, 0.03), BROWN, 0, TRS(0.02, 0.25, 0.235, -0.05, 0, 0.7)), part(box(0.05, 0.6, 0.03), BROWN, 0, TRS(0.02, 0.25, -0.232, 0.05, 0, -0.7)),
      part(box(0.44, 0.4, 0.035), 0xb4c0e6, 1, TRS(0, 0.2, -0.235, 0.12, 0, 0)),                                                          // cape
      part(cyl(0.088, 0.078, 0.5, 10), BROWN, 0, TRS(0.13, 0.3, -0.3, 0, 0, -0.38)), part(cyl(0.095, 0.095, 0.05, 10), DLEATHER, 0, TRS(0.04, 0.53, -0.3, 0, 0, -0.38)),
      ...[[-0.04, 0, 0.3], [0.03, 0.03, 0.34], [0.04, -0.03, 0.31], [-0.01, -0.04, 0.37]].flatMap(([dx, dz, d], k) => [part(box(0.03, 0.15, 0.08), WHITE, 1, TRS(0.13 + 0.37 * d + dx, 0.3 + 0.93 * d, -0.3 + dz, 0, k * 0.8, -0.38)), part(box(0.016, 0.05, 0.016), TRIM, 0, TRS(0.13 + 0.37 * (d + 0.1) + dx, 0.3 + 0.93 * (d + 0.1), -0.3 + dz, 0, 0, -0.38))]),
    ], [-0.08, 0.3, 0.7]);
  }
  // MELEE: blue plate tunic, white collar + hem, blue pauldrons rimmed white, brown straps + belt, steel buckle (no gold)
  function torsoMelee() {
    return merge([
      part(lathe([[0.0, -0.02], [0.2, -0.0], [0.255, 0.1], [0.272, 0.22], [0.252, 0.33], [0.18, 0.4], [0.0, 0.43]], 18), WHITE, 1),
      part(lathe([[0.238, 0.12], [0.27, 0.04], [0.292, -0.08], [0.0, -0.09]], 18), 0x98a6d6, 1),
      part(cyl(0.264, 0.264, 0.065, 18), BROWN, 0, TRS(0, 0.1, 0)), part(box(0.1, 0.075, 0.03), SILVER, 0, TRS(0, 0.1, 0.265)),
      part(cyl(0.14, 0.165, 0.055, 14), TRIM, 0, TRS(0, 0.405, 0)), part(box(0.05, 0.22, 0.03), TRIM, 0, TRS(0, 0.27, 0.262)),
      part(box(0.045, 0.42, 0.025), BROWN, 0, TRS(-0.1, 0.26, 0.255, -0.05, 0, -0.42)), part(box(0.045, 0.42, 0.025), BROWN, 0, TRS(-0.1, 0.26, -0.252, 0.05, 0, 0.42)),
      ...[-1, 1].flatMap(x => [part(sph(0.15, 12, 8, 0, Math.PI / 2), WHITE, 1, TRS(x * 0.27, 0.35, 0, 0, 0, -x * 0.45)), part(tor(0.135, 0.022, 4, 14), TRIM, 0, TRS(x * 0.283, 0.335, 0, Math.PI / 2, -x * 0.45, 0))]),
    ], [-0.08, 0.3, 0.7]);
  }
  // ELITE: heavier blue cuirass edged in white, blue pauldrons rimmed in silver, blue/white pteruges, brown belt
  function torsoElite() {
    const L = [
      part(lathe([[0.0, -0.02], [0.21, 0.0], [0.27, 0.1], [0.29, 0.22], [0.27, 0.33], [0.19, 0.4], [0.0, 0.43]], 18), WHITE, 1),
      part(sph(0.25, 14, 8, 0, Math.PI * 0.55), WHITE, 1, TRS(0, 0.19, 0.06, -Math.PI / 2 + 0.35, 0, 0, 1, 1, 0.7)), part(box(0.05, 0.3, 0.03), TRIM, 0, TRS(0, 0.25, 0.29, -0.12, 0, 0)),
      part(tor(0.17, 0.025, 4, 14), TRIM, 0, TRS(0, 0.39, 0, Math.PI / 2, 0, 0)),
      part(cyl(0.28, 0.28, 0.07, 18), BROWN, 0, TRS(0, 0.09, 0)), part(box(0.1, 0.08, 0.03), ESILV, 0, TRS(0, 0.09, 0.282)),
      ...[-1, 1].flatMap(x => [part(sph(0.165, 12, 8, 0, Math.PI / 2), WHITE, 1, TRS(x * 0.29, 0.355, 0, 0, 0, -x * 0.5)), part(tor(0.15, 0.024, 4, 14), ESILV, 0, TRS(x * 0.302, 0.338, 0, Math.PI / 2, -x * 0.5, 0))]),
    ];
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; L.push(part(box(0.18, 0.17, 0.035), k % 2 ? TRIM : WHITE, k % 2 ? 0 : 1, TRS(Math.sin(a) * 0.28, -0.03, Math.cos(a) * 0.28, 0.12, a, 0))); }   // pteruges skirt
    return merge(L, [-0.08, 0.3, 0.7]);
  }
  // GIANT: a huge bearded soldier, not a golem: big blue vest, blue back plate, navy seat, brown belt + steel buckle, compact white/silver
  // pauldrons on blue rims riding the shoulder edges (accents, not slabs: the phone camera looks down on the shoulders)
  const padsGolem = () => [-1, 1].flatMap(x => { const m = TRS(x * 0.46, 0.53, 0, 0, 0, -x * 0.22), at = (y, dx) => m.clone().multiply(TRS((dx || 0) * x, y, 0));
    return [part(box(0.2, 0.03, 0.24), PAD, 0, at(0.045)), part(box(0.27, 0.09, 0.31), PADS, 0, at(-0.01)), part(box(0.3, 0.05, 0.34), PADRIM, 1, at(-0.07, 0.01))]; });
  function torsoGolem() {
    return merge([
      part(box(0.78, 0.5, 0.5), WHITE, 1, TRS(0, 0.24, 0)), part(box(0.64, 0.24, 0.44), NAVY, 1, TRS(0, -0.05, 0)),
      part(box(0.5, 0.06, 0.05), 0xb4c2ec, 1, TRS(0, 0.46, 0.24)),
      part(box(0.81, 0.09, 0.53), BROWN, 0, TRS(0, 0.03, 0)), part(box(0.15, 0.12, 0.04), SILVER, 0, TRS(0, 0.03, 0.27)),
      part(box(0.56, 0.34, 0.06), 0xc8d0ec, 1, TRS(0, 0.27, -0.265)), part(box(0.26, 0.09, 0.24), GSKIN, 0, TRS(0, 0.5, 0)),
      ...padsGolem(),
    ], [-0.15, 0.4, 0.72]);
  }
  // MIZARD: ankle-length blue robe with a lighter hem + placket, shoulder mantle, brown belt with a blue gem buckle
  function torsoMizard() {
    return merge([
      part(lathe([[0.0, -0.27], [0.3, -0.26], [0.305, -0.18], [0.27, 0.0], [0.25, 0.18], [0.22, 0.33], [0.15, 0.42], [0.0, 0.44]], 18), WHITE, 1),
      part(tor(0.3, 0.024, 4, 18), WHITE, 0.45, TRS(0, -0.255, 0, Math.PI / 2, 0, 0)), part(box(0.08, 0.56, 0.025), WHITE, 0.45, TRS(0, -0.02, 0.275, -0.12, 0, 0)),
      part(lathe([[0.27, 0.22], [0.27, 0.3], [0.22, 0.38], [0.15, 0.43], [0.0, 0.45]], 18), 0xb0bce6, 1),
      part(cyl(0.262, 0.266, 0.065, 18), BROWN, 0, TRS(0, 0.12, 0)), part(new THREE.OctahedronGeometry(0.055, 0), GEM, 0, TRS(0, 0.12, 0.27, 0, 0, 0, 1, 1, 0.5)),
    ], [-0.27, 0.3, 0.65]);
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
    blue: () => merge([...face(SKIN), dome(0.262, WHITE, 1), part(cyl(0.268, 0.268, 0.055, 20), 0xc4ceee, 1, TRS(0, 0.17, -0.012)),   // MELEE: blue helm, silver ridge + cheek guards
      part(tor(0.268, 0.04, 4, 16, Math.PI), TRIM, 0, TRS(0, 0.2, -0.012, 0, Math.PI / 2, 0, 1, 1, 2.0)), part(box(0.06, 0.07, 0.04), TRIM, 0, TRS(0, 0.215, 0.255)),
      ...[-1, 1].map(x => part(box(0.06, 0.17, 0.14), TRIM, 0, TRS(x * 0.236, 0.09, 0.07, 0, -x * 0.32, 0))), part(box(0.3, 0.1, 0.06), WHITE, 1, TRS(0, 0.1, -0.235, 0.3, 0, 0))]),
    knight: () => merge([...face(SKIN), dome(0.27, 0xe8eeff, 1), part(cyl(0.276, 0.276, 0.06, 20), GOLD, 0, TRS(0, 0.17, -0.012)), part(box(0.24, 0.04, 0.04), DARK, 0, TRS(0, 0.2, 0.25)),
      part(box(0.05, 0.16, 0.03), GOLD, 0, TRS(0, 0.14, 0.27)), part(sph(0.1, 10, 8), GOLD, 0, TRS(0, 0.5, -0.06, 0, 0, 0, 0.55, 1.2, 1.6)), part(cone(0.04, 0.12, 6), GOLD, 0, TRS(0, 0.5, 0))]),
    hood: () => merge([...face(SKIN), part(sph(0.212, 12, 8, 0, Math.PI * 0.32), 0x2e2420, 0, TRS(0, 0.19, 0.035)),                    // RANGE: pointed blue hood with a face opening, lighter rim
      part(sph(0.262, 16, 10, 0, Math.PI * 0.3), WHITE, 1, TRS(0, 0.19, -0.035)), part(new THREE.SphereGeometry(0.262, sg(16, 6), sg(10, 4), Math.PI / 2 + 0.85, Math.PI * 2 - 1.7, Math.PI * 0.28, Math.PI * 0.4), WHITE, 1, TRS(0, 0.19, -0.035)),
      part(cone(0.15, 0.44, 8), WHITE, 1, TRS(0, 0.4, -0.2, -1.15, 0, 0)), part(tor(0.18, 0.034, 5, 16), WHITE, 0.42, TRS(0, 0.2, 0.14, 0, 0, 0, 1.12, 0.85, 1)), part(cyl(0.2, 0.3, 0.13, 14, true), WHITE, 1, TRS(0, 0.0, -0.03))]),
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
    looter: () => merge([...face(SKIN), part(sph(0.218, 16, 10, 0, Math.PI * 0.56), HAIR, 0, TRS(0, 0.19, -0.015)),                    // LOOTER: spiky brown hair, blue headband
      ...[[0, 0.43, 0.02, -0.15, 0], [0.11, 0.41, -0.04, -0.3, -0.5], [-0.11, 0.41, -0.04, -0.3, 0.5], [0.0, 0.38, -0.16, -0.9, 0], [0.16, 0.33, 0.06, 0.1, -1.0], [-0.16, 0.33, 0.06, 0.1, 1.0], [-0.02, 0.36, 0.14, 0.72, 0.1]].map(([x, y, z, rx, rz]) => part(cone(0.075, 0.18, 5), HAIR, 0, TRS(x, y, z, rx, 0, rz))),
      part(tor(0.22, 0.042, 5, 16), WHITE, 1, TRS(0, 0.25, 0, Math.PI / 2 - 0.12, 0, 0)), part(box(0.06, 0.2, 0.04), WHITE, 1, TRS(0.05, 0.17, -0.25, 0.45, 0, 0.3)), part(box(0.06, 0.17, 0.04), WHITE, 1, TRS(-0.045, 0.15, -0.255, 0.65, 0, -0.3))]),
    wizard: () => merge([...face(SKIN), part(sph(0.165, 12, 10), BEARD, 0, TRS(0, 0.04, 0.12, 0, 0, 0, 1.05, 1.35, 0.75)), part(box(0.2, 0.04, 0.05), BEARD, 0, TRS(0, 0.115, 0.205)),
      part(box(0.07, 0.025, 0.03), BEARD, 0, TRS(-0.07, 0.215, 0.19, 0, 0, -0.2)), part(box(0.07, 0.025, 0.03), BEARD, 0, TRS(0.07, 0.215, 0.19, 0, 0, 0.2)),
      part(sph(0.08, 8, 6), BEARD, 0, TRS(-0.18, 0.15, -0.02)), part(sph(0.08, 8, 6), BEARD, 0, TRS(0.18, 0.15, -0.02)),
      part(cyl(0.34, 0.34, 0.04, 22), 0xe8eeff, 1, TRS(0, 0.3, -0.01)), part(cyl(0.225, 0.235, 0.07, 18), DLEATHER, 0, TRS(0, 0.345, -0.01)),
      part(cone(0.225, 0.62, 14), 0xe8eeff, 1, TRS(0, 0.68, -0.07, -0.22, 0, 0)), part(sph(0.035, 6, 4), CRYSTAL, 0, TRS(0, 0.98, -0.15))]),
    elite: () => {   // ELITE: silver Corinthian helm (face opening, cheek guards, nose bar, neck guard) under a tall swept blue crest
      const cr = new THREE.Shape(); cr.moveTo(0.18, -0.06); cr.quadraticCurveTo(0.16, 0.3, -0.06, 0.34); cr.quadraticCurveTo(-0.36, 0.34, -0.52, 0.0); cr.lineTo(-0.5, -0.22); cr.lineTo(-0.36, -0.2); cr.quadraticCurveTo(-0.2, 0.02, 0.0, 0.0); cr.lineTo(0.18, -0.06);
      const crest = new THREE.ExtrudeGeometry(cr, { depth: 0.17, bevelEnabled: false, curveSegments: 3 }); crest.translate(0, 0, -0.085); crest.computeVertexNormals();
      return merge([...face(SKIN), part(sph(0.272, 16, 10, 0, Math.PI * 0.5), ESILV, 0, TRS(0, 0.2, -0.015)), part(cyl(0.276, 0.276, 0.07, 18, true), TRIM, 0, TRS(0, 0.215, -0.015)),
        ...[-1, 1].map(x => part(box(0.08, 0.22, 0.17), ESILV, 0, TRS(x * 0.205, 0.09, 0.115, 0, -x * 0.42, 0))), part(box(0.045, 0.14, 0.04), ESILV, 0, TRS(0, 0.145, 0.262)),
        part(box(0.44, 0.17, 0.12), ESILV, 0, TRS(0, 0.09, -0.2, 0.35, 0, 0)),         part(crest, CREST, 1, TRS(0, 0.45, 0.0, 0, -Math.PI / 2, 0))]); },
    golem: () => merge([part(box(0.34, 0.32, 0.32), GSKIN, 0, TRS(0, 0.16, 0.01)), part(box(0.07, 0.07, 0.06), GSKIN2, 0, TRS(0, 0.15, 0.185)),   // GIANT: bearded human face, blue cap
      ...[-1, 1].flatMap(x => [part(box(0.07, 0.045, 0.03), DARK, 0, TRS(x * 0.075, 0.2, 0.17)), part(box(0.11, 0.035, 0.035), HAIR, 0, TRS(x * 0.075, 0.25, 0.172, 0, 0, x * 0.18)), part(box(0.06, 0.2, 0.22), HAIR, 0, TRS(x * 0.172, 0.08, 0.06))]),
      part(box(0.36, 0.16, 0.13), HAIR, 0, TRS(0, 0.05, 0.13)), part(box(0.24, 0.12, 0.11), HAIR, 0, TRS(0, -0.04, 0.16)), part(box(0.2, 0.045, 0.05), 0x4a2c18, 0, TRS(0, 0.115, 0.185)),
      part(box(0.39, 0.12, 0.37), WHITE, 0.85, TRS(0, 0.325, 0)), part(box(0.32, 0.05, 0.3), WHITE, 0.85, TRS(0, 0.405, -0.01)), part(box(0.4, 0.06, 0.38), 0x9aaad8, 1, TRS(0, 0.27, 0)), part(box(0.36, 0.04, 0.12), 0x9aaad8, 1, TRS(0, 0.27, 0.22, 0.15, 0, 0)),
      part(box(0.35, 0.2, 0.05), HAIR, 0, TRS(0, 0.13, -0.16))]).translate(...HGO),
    mizard: () => merge([...face(SKIN), part(sph(0.17, 12, 10), BEARD, 0, TRS(0, 0.03, 0.12, 0, 0, 0, 1.08, 1.45, 0.75)), part(box(0.22, 0.045, 0.05), BEARD, 0, TRS(0, 0.115, 0.205)),   // MIZARD: white beard, bent blue hat
      ...[-1, 1].flatMap(x => [part(box(0.075, 0.03, 0.03), BEARD, 0, TRS(x * 0.07, 0.218, 0.19, 0, 0, -x * 0.2)), part(sph(0.085, 8, 6), BEARD, 0, TRS(x * 0.18, 0.14, -0.02))]),
      part(cyl(0.37, 0.37, 0.035, 22), WHITE, 1, TRS(0, 0.3, -0.01)), part(cyl(0.232, 0.242, 0.085, 18), BROWN, 0, TRS(0, 0.355, -0.01)), part(new THREE.OctahedronGeometry(0.06, 0), GEM, 0, TRS(0, 0.355, 0.24, 0, 0, 0, 1, 1, 0.5)),
      part(cyl(0.13, 0.232, 0.3, 14), WHITE, 1, TRS(0, 0.54, -0.03, -0.1, 0, 0)), part(cone(0.135, 0.38, 12), WHITE, 1, TRS(0, 0.8, -0.13, -0.6, 0, 0))]),
    hoodI: () => merge([...face(SKIN), part(sph(0.258, 16, 10, 0, Math.PI * 0.64), 0xc0ccff, 1, TRS(0, 0.19, -0.03)), part(cone(0.11, 0.24, 8), 0xc0ccff, 1, TRS(0, 0.3, -0.25, -1.1, 0, 0)), part(box(0.3, 0.035, 0.04), DARK, 0, TRS(0, 0.215, 0.2))]),   // enemy infantry: red hood, dark brow band
    heavyE: () => merge([...face(SKIN), dome(0.268, 0xeaeaea, 1, 0.21, Math.PI * 0.6), part(box(0.3, 0.05, 0.05), DARK, 0, TRS(0, 0.2, 0.245)), part(box(0.05, 0.14, 0.05), DSTEEL, 0, TRS(0, 0.13, 0.255)),
      part(cone(0.06, 0.3, 8), IVORY, 0, TRS(-0.24, 0.42, 0, 0.1, 0, 0.85)), part(cone(0.06, 0.3, 8), IVORY, 0, TRS(0.24, 0.42, 0, 0.1, 0, -0.85))]),   // enemy heavy: horned red helm
    eliteE: () => merge([...face(SKIN), dome(0.27, 0xeaeaea, 1, 0.21, Math.PI * 0.62), part(box(0.3, 0.05, 0.05), DARK, 0, TRS(0, 0.2, 0.245)), part(cone(0.06, 0.32, 8), IVORY, 0, TRS(-0.24, 0.44, 0, 0.1, 0, 0.8)), part(cone(0.06, 0.32, 8), IVORY, 0, TRS(0.24, 0.44, 0, 0.1, 0, -0.8)),
      ...[-0.1, 0, 0.1].map((x, k) => part(cone(0.035, k === 1 ? 0.2 : 0.14, 6), DSTEEL, 0, TRS(x, 0.5, -0.02)))]),   // enemy elite: horns + spiked crest
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
  function armLooter() {   // white sleeve with a blue band, bare forearm, big brown gauntlet + glove
    return merge([part(sph(0.088, 10, 8), TRIM, 0), ...capsule(0.072, 0.07, TRIM, 0, TRS(0, -0.01, 0)), part(tor(0.074, 0.024, 4, 10), WHITE, 1, TRS(0, -0.075, 0, Math.PI / 2, 0, 0)),
      part(cyl(0.058, 0.06, 0.06, 8, true), SKIN, 0, TRS(0, -0.11, 0)), part(cyl(0.088, 0.074, 0.12, 10), BROWN, 0, TRS(0, -0.19, 0)), part(cyl(0.094, 0.094, 0.03, 10, true), DLEATHER, 0, TRS(0, -0.135, 0)),
      part(sph(0.09, 12, 9), BROWN, 0, TRS(0, -0.27, 0.012, 0, 0, 0, 1, 0.95, 1.05))], [-0.3, 0.0, 0.75]);
  }
  function armGolem() {   // GIANT arm: blue sleeve under the pauldron, bare upper arm, blue bracer (dark band, thin white cuff), big fist
    return merge([part(box(0.25, 0.14, 0.26), WHITE, 1, TRS(0, -0.01, 0)), part(box(0.2, 0.15, 0.21), GSKIN, 0, TRS(0, -0.14, 0)), part(box(0.26, 0.15, 0.27), WHITE, 1, TRS(0, -0.265, 0)),
      part(box(0.27, 0.04, 0.28), 0x8a9ad0, 1, TRS(0, -0.235, 0)), part(box(0.265, 0.025, 0.275), TRIM, 0, TRS(0, -0.335, 0)),
      part(box(0.25, 0.2, 0.26), GSKIN, 0, TRS(0, -0.4, 0.01)), part(box(0.1, 0.1, 0.1), GSKIN2, 0, TRS(-0.1, -0.38, 0.12))], [-0.45, 0.0, 0.72]);
  }
  function legGolem() {   // navy trousers, brown boots
    return merge([part(box(0.24, 0.22, 0.26), NAVY, 1, TRS(0, -0.09, 0)), part(box(0.26, 0.06, 0.28), 0x5a6890, 1, TRS(0, -0.19, 0.0)), part(box(0.28, 0.13, 0.34), BROWN, 0, TRS(0, -0.27, 0.04)), part(box(0.29, 0.03, 0.35), DLEATHER, 0, TRS(0, -0.325, 0.04))], [-0.33, 0.0, 0.6]);
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
    staff: () => merge([part(cyl(0.032, 0.038, 1.14, 7), STAFFW, 0, TRS(0, 0, 0.38, Math.PI / 2, 0, 0)), part(tor(0.04, 0.016, 4, 10), DLEATHER, 0, TRS(0, 0, 0.12)), part(tor(0.046, 0.018, 4, 10), DLEATHER, 0, TRS(0, 0, 0.86)),   // MIZARD staff: brown shaft, prongs, glowing crystal
      ...[0, 1, 2].map(k => part(cone(0.025, 0.14, 4), STAFFW, 0, TRS(Math.cos(k * 2.1) * 0.05, Math.sin(k * 2.1) * 0.05, 0.98, Math.PI / 2 - Math.sin(k * 2.1) * 0.4, 0, 0, 1, 1, 1))),
      part(new THREE.OctahedronGeometry(0.115, 0), GEM, 0, TRS(0, 0, 1.08, 0, 0, Math.PI / 4, 0.78, 0.78, 1.55))]),
    // LOOTER knife: compact broad white blade, dark guard, brown grip
    knife: () => merge([part(box(0.07, 0.022, 0.2), TRIM, 0, TRS(0, 0, 0.16)), part(cone(0.035, 0.08, 4), TRIM, 0, TRS(0, 0, 0.3, Math.PI / 2, Math.PI / 4, 0, 1, 1, 0.35)), part(box(0.13, 0.035, 0.04), DSTEEL, 0, TRS(0, 0, 0.05)), part(cyl(0.024, 0.024, 0.1, 6), BROWN, 0, TRS(0, 0, -0.01, Math.PI / 2, 0, 0))]),
    // MELEE short sword: broad white blade, dark guard, brown grip
    swordS: () => merge([part(box(0.12, 0.028, 0.38), TRIM, 0, TRS(0, 0, 0.29)), part(cone(0.06, 0.14, 4), TRIM, 0, TRS(0, 0, 0.55, Math.PI / 2, Math.PI / 4, 0, 1, 1, 0.35)), part(box(0.03, 0.03, 0.34), SILVER, 0, TRS(0, 0.013, 0.28)),
      part(box(0.21, 0.045, 0.055), DSTEEL, 0, TRS(0, 0, 0.08)), part(cyl(0.026, 0.026, 0.13, 6), BROWN, 0, TRS(0, 0, 0, Math.PI / 2, 0, 0)), part(sph(0.036, 8, 6), DSTEEL, 0, TRS(0, 0, -0.075))]),
    // ELITE pike: long ash shaft, steel butt, blue binding, broad white leaf head. Tip length is matched to W.ELITE_RNG + rad (tests/anim.test.js)
    pike: () => merge([part(cyl(0.028, 0.032, PIKE.tip - 0.3 - PIKE.butt, 6), WOOD, 0, TRS(0, 0, (PIKE.tip - 0.3 + PIKE.butt) / 2, Math.PI / 2, 0, 0)), part(cyl(0.04, 0.03, 0.1, 6), DSTEEL, 0, TRS(0, 0, PIKE.butt, Math.PI / 2, 0, 0)),
      part(cyl(0.045, 0.045, 0.12, 6), WHITE, 1, TRS(0, 0, PIKE.tip - 0.42, Math.PI / 2, 0, 0)), part(cyl(0.03, 0.04, 0.08, 6), DSTEEL, 0, TRS(0, 0, PIKE.tip - 0.33, Math.PI / 2, 0, 0)),
      part(new THREE.OctahedronGeometry(0.1, 0), TRIM, 0, TRS(0, 0, PIKE.tip - 0.15, 0, 0, Math.PI / 4, 0.75, 0.3, 1.5))]),
    // GIANT stone hammer: thick brown haft, big grey stone head with darker faces
    hammer: () => merge([part(cyl(0.046, 0.052, 1.06, 7), HAFT, 0, TRS(0, 0, 0.31, Math.PI / 2, 0, 0)), part(cyl(0.058, 0.058, 0.2, 7), DLEATHER, 0, TRS(0, 0, 0.02, Math.PI / 2, 0, 0)), part(cyl(0.062, 0.062, 0.05, 7), DLEATHER, 0, TRS(0, 0, 0.66, Math.PI / 2, 0, 0)),
      part(box(0.36, 0.46, 0.3), STONE, 0, TRS(0, 0, 0.84)), ...[-1, 1].map(y => part(box(0.4, 0.08, 0.34), STONE2, 0, TRS(0, y * 0.215, 0.84))), part(box(0.38, 0.05, 0.32), STONE2, 0, TRS(0, 0, 0.84)),
      part(box(0.13, 0.12, 0.04), STONE3, 0, TRS(0.08, 0.1, 1.0)), part(box(0.04, 0.1, 0.1), STONE3, 0, TRS(0.19, -0.1, 0.9))]),
    // RANGE recurve bow (off hand): chunky brown limbs bent toward the archer (+y) with flicked tips, leather grip, white string
    bowF: () => { const seg = (y0, z0, y1, z1, w, t, col) => { const dy = y1 - y0, dz = z1 - z0, L = Math.hypot(dy, dz); return part(box(w, t, L), col, 0, TRS(0, (y0 + y1) / 2, (z0 + z1) / 2, Math.atan2(-dy, dz), 0, 0)); };
      const pts = [[-0.02, 0.0], [0.0, 0.1], [0.05, 0.21], [0.115, 0.32], [0.095, 0.43]], L = [part(box(0.07, 0.075, 0.16), DLEATHER, 0, TRS(0, -0.01, 0))];
      for (const sz of [1, -1]) for (let k = 0; k < pts.length - 1; k++) L.push(seg(pts[k][0], pts[k][1] * sz, pts[k + 1][0], pts[k + 1][1] * sz, 0.07 - k * 0.008, 0.05, k === 3 ? 0x6e4426 : 0x9a6236));
      L.push(part(box(0.012, 0.012, 0.86), TRIM, 0, TRS(0, 0.098, 0))); return merge(L); },
    staffE: () => merge([part(cyl(0.028, 0.034, 1.0, 7), 0x2a1a1a, 0, TRS(0, 0, 0.35, Math.PI / 2, 0, 0)), part(new THREE.OctahedronGeometry(0.11), 0xff3a3a, 0, TRS(0, 0, 0.92, 0, 0, 0, 0.8, 0.8, 1.5)), part(tor(0.08, 0.015, 5, 12), DSTEEL, 0, TRS(0, 0, 0.82))]),
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
  // MELEE kite shield (~60% of body height) and ELITE aspis. The blue core is thicker than the white rim plate, so both faces read
  // blue-with-white-rim (the camera sees the army from behind); the white diamond sits on the front face. Faces +z, centred on the grip.
  function kite(w, h) { const s = new THREE.Shape(), hw = w / 2, top = h * 0.42, sh = h * 0.2, bot = -h * 0.58;
    s.moveTo(0, top + h * 0.03); s.lineTo(hw * 0.72, top); s.quadraticCurveTo(hw, top, hw, sh); s.quadraticCurveTo(hw * 0.92, -h * 0.2, 0, bot); s.quadraticCurveTo(-hw * 0.92, -h * 0.2, -hw, sh); s.quadraticCurveTo(-hw, top, -hw * 0.72, top); s.lineTo(0, top + h * 0.03); return s; }
  const slab = (shape, depth) => { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 3 }); g.translate(0, 0, -depth / 2); g.computeVertexNormals(); return g; };
  const diamond = (w, h, d) => new THREE.CylinderGeometry(w, w, d, 4).rotateX(Math.PI / 2).scale(1, h / w, 1);
  function shieldKite() {
    return merge([part(slab(kite(0.5, 0.76), 0.045), TRIM, 0, TRS(0, -0.02, 0)), part(slab(kite(0.42, 0.65), 0.07), WHITE, 1, TRS(0, -0.01, 0)),
      part(diamond(0.07, 0.15, 0.03), TRIM, 0, TRS(0, 0.0, 0.04)), part(box(0.05, 0.22, 0.04), BROWN, 0, TRS(0, 0.0, -0.05))]);
  }
  function shieldAspis() {
    return merge([part(cyl(0.335, 0.335, 0.05, 24), TRIM, 0, TRS(0, 0, 0, Math.PI / 2, 0, 0)), part(cyl(0.285, 0.285, 0.08, 24), WHITE, 1, TRS(0, 0, 0, Math.PI / 2, 0, 0)),
      part(diamond(0.085, 0.17, 0.03), TRIM, 0, TRS(0, 0, 0.048)), part(box(0.06, 0.2, 0.04), BROWN, 0, TRS(0, 0, -0.055))]);
  }
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
    // friendly kinds use friendly-only parts (enemy parts are never edited for them) and friendly-only far families
    soldier: { torso: 'tMelee', head: 'hBlue', arm: 'aStd', leg: 'lStd', wpn: 'swordS', shield: 'shieldK', midShield: 1, far: 'F_melee' },   // MELEE: blue helm + silver ridge, short sword, large kite shield
    archerF: { torso: 'tArcher', head: 'hHood', arm: 'aStd', leg: 'lStd', wpn: 'bowF', far: 'F_range' },                        // RANGE: pointed hood, recurve bow, quiver
    knightF: { torso: 'tElite', head: 'hElite', arm: 'aStd', leg: 'lStd', wpn: 'pike', shield: 'shieldA', midShield: 1, far: 'F_elite' },     // ELITE: Corinthian helm + tall crest, aspis, long pike
    grunt: { torso: 'tLight', head: 'hHoodI', arm: 'aStd', leg: 'lStd', wpn: 'sword' },
    imp: { torso: 'tLight', head: 'hImp', arm: 'aStd', leg: 'lStd', wpn: 'claws' },
    shield: { torso: 'tHeavy', head: 'hHeavyE', arm: 'aStd', leg: 'lStd', wpn: 'sword', shield: 1 },
    runner: { torso: 'tLight', head: 'hBandana', arm: 'aStd', leg: 'lStd', wpn: 'dagger' },
    archer: { torso: 'tLight', head: 'hHoodE', arm: 'aStd', leg: 'lStd', wpn: 'bow' },   // enemy ranged: masked hood with dark horns (never the friendly archer silhouette)
    knight: { torso: 'tHeavy', head: 'hEliteE', arm: 'aHeavy', leg: 'lStd', wpn: 'axe', shield: 1 },
    brute: { torso: 'tBrute', head: 'hBrute', arm: 'aBrute', leg: 'lBrute', wpn: 'axe' },
    bomber: { torso: 'tLight', head: 'hGoggles', arm: 'aStd', leg: 'lStd', wpn: 'bomb' },
    shaman: { torso: 'tRobe', head: 'hWizard', arm: 'aStd', leg: 'lStd', wpn: 'staffE' },   // enemy Mizard: red hat, red crystal
    warlord: { torso: 'tBrute', head: 'hWarlord', arm: 'aBrute', leg: 'lBrute', wpn: 'axe' },
    spearman: { torso: 'tHeavy', head: 'hKnight', arm: 'aStd', leg: 'lStd', wpn: 'spear', shield: 1 },
    giant: { torso: 'tBrute', head: 'hBrute', arm: 'aBrute', leg: 'lBrute', wpn: 'axe' },
    titan: { torso: 'tBrute', head: 'hHorn', arm: 'aBrute', leg: 'lBrute', wpn: 'axe' },
    colossus: { torso: 'tBrute', head: 'hBucket', arm: 'aBrute', leg: 'lBrute', wpn: 'axe', shield: 1 },
    hunter: { torso: 'tBrute', head: 'hGoggles', arm: 'aBrute', leg: 'lBrute', wpn: 'axe' },
    cannon: { body: 'cannon' },
    collector: { torso: 'tLooter', head: 'hLooter', arm: 'aLooter', leg: 'lStd', wpn: 'knife', far: 'F_looter' },    // LOOTER: spiky hair, headband, gold-laden backpack, knife
    medic: { torso: 'tMizard', head: 'hMizard', arm: 'aStd', leg: 'lStd', wpn: 'staff', far: 'F_mizard' },          // MIZARD: bent blue hat, white beard, glowing crystal staff
    giantF: { torso: 'tGolem', head: 'hGolem', arm: 'aGolem', leg: 'lGolem', wpn: 'hammer', far: 'F_giant' },       // GIANT: bearded human giant with a stone hammer ('tGolem' keys keep the giant rig)
  };
  // skeleton offsets per body family (std vs brute proportions)
  KM.isBig = r => r.torso === 'tBrute' || r.torso === 'tGolem';
  KM.rigOf = r => r.torso === 'tGolem' ? KM.RIG.golem : r.torso === 'tBrute' ? KM.RIG.brute : KM.RIG.std;
  KM.RIG = {
    std: { hip: [0.11, 0.33], torso: 0.34, neck: 0.4, shoulder: [0.3, 0.33], fist: -0.27, shieldAt: [-0.03, -0.17, 0.1] },
    brute: { hip: [0.17, 0.33], torso: 0.32, neck: 0.44, shoulder: [0.47, 0.34], fist: -0.31, shieldAt: [0, -0.2, 0.12] },
    golem: { hip: [0.17, 0.33], torso: 0.34, neck: 0.44, shoulder: [0.52, 0.36], fist: -0.35, shieldAt: [0, -0.2, 0.12] },
  };
  KM.OFFHAND = { bow: 1, bowF: 1 };                                    // bows are held in the off (shield) hand
  KM.shieldOf = r => r.shield === 1 ? 'shield' : r.shield || null;     // recipe shield: 1 = the shared round shield, or a part key
  KM.PIKE = PIKE; KM.STAFF_TIP = 1.08; KM.FAR_TIP = [0.33, 1.27, 0.2];   // weapon-space tips (crystal glow, beam origin); far Mizard crystal
  // One unit's bone matrices from a pose (shared by the renderer, the lineup and the asset pages). M[0] = root (position, yaw, scale).
  // Fills M[1..2] legs, M[3] torso, M[4] head, M[5..6] arms L/R, M[7] held item (wrist-corrected, KM.ANIM.wrist), M[8] shield.
  const eR = new E(0, 0, 0, 'YXZ'), boneM = (m, x, y, z, rx, ry, rz) => { eR.set(rx, ry, rz, 'YXZ'); m.makeRotationFromEuler(eR); m.setPosition(x, y, z); return m; };
  KM.poseRig = function (r, p, o, M, wk) {
    const I = KM.ANIM.I, rig = KM.rigOf(r); wk = wk || r.wpn;
    boneM(M[1], -rig.hip[0], rig.hip[1], 0, p[o + I.legLP], 0, 0).premultiply(M[0]); boneM(M[2], rig.hip[0], rig.hip[1], 0, p[o + I.legRP], 0, 0).premultiply(M[0]);
    boneM(M[3], 0, rig.torso, 0, p[o + I.torsoP], p[o + I.torsoY], p[o + I.torsoR]).premultiply(M[0]); boneM(M[4], 0, rig.neck, 0, p[o + I.headP], p[o + I.headY], 0).premultiply(M[3]);
    boneM(M[5], -rig.shoulder[0], rig.shoulder[1], 0, p[o + I.armLP], 0, p[o + I.armLR]).premultiply(M[3]); boneM(M[6], rig.shoulder[0], rig.shoulder[1], 0, p[o + I.armRP], p[o + I.armRY], p[o + I.armRR]).premultiply(M[3]);
    const off = KM.OFFHAND[wk]; boneM(M[7], 0, rig.fist, off ? 0.02 : 0.03, KM.ANIM.wrist(wk, p, o, off ? I.armLP : I.armRP), 0, 0).premultiply(off ? M[5] : M[6]);
    if (r.shield) M[8].makeTranslation(rig.shieldAt[0], rig.shieldAt[1], rig.shieldAt[2]).premultiply(M[5]);
    return M;
  };

  // Build all part geometries + far-LOD statues (one merged mesh per kind posed at rest).
  const buildParts = () => ({
      lStd: legStd(), lBrute: legBrute(), lGolem: legGolem(), tLight: merge(torsoLight(), [-0.08, 0.3, 0.7]), tHeavy: torsoHeavy(), tBrute: torsoBrute(), tRobe: torsoRobe(), tLooter: torsoLooter(), tArcher: torsoArcher(), tGolem: torsoGolem(),
      tMelee: torsoMelee(), tElite: torsoElite(), tMizard: torsoMizard(), hMizard: H.mizard(),
      hBlue: H.blue(), hKnight: H.knight(), hHood: H.hood(), hHorn: H.horn(), hBucket: H.bucket(), hBandana: H.bandana(), hImp: H.imp(), hBrute: H.brute(), hWarlord: H.warlord(), hShaman: H.shaman(), hGoggles: H.goggles(), hLooter: H.looter(), hWizard: H.wizard(), hElite: H.elite(), hGolem: H.golem(), hHoodE: H.hoodE(), hHoodI: H.hoodI(), hHeavyE: H.heavyE(), hEliteE: H.eliteE(),
      aStd: armStd(), aHeavy: armHeavy(), aBrute: armBrute(), aLooter: armLooter(), aGolem: armGolem(),
      sword: W.sword(), swordGold: W.sword(true), dagger: W.dagger(), axe: W.axe(), bow: W.bow(), staff: W.staff(), bomb: W.bomb(), staffE: W.staffE(), claws: W.claws(),
            rock: W.rock(), spear: W.spear(), xbow: W.xbow(), musket: W.musket(), rifle: W.rifle(), pulse: W.pulse(), sack: W.sack(),
      swordS: W.swordS(), knife: W.knife(), pike: W.pike(), hammer: W.hammer(), bowF: W.bowF(), shieldK: shieldKite(), shieldA: shieldAspis(),
      shield: shield(), cannon: cannon(), pads: pads(), plume: plume(), padsIron: padsIron(), hornsAdd: hornsAdd(), eyesGlow: eyesGlow(),
  });
  KM.KIT_DETAIL = { near: 0.5 };
  // Lean bone parts (~300 tris/unit) for mid-distance animated units, and far statues composed from the same pieces.
  function leanParts() {
    const P = {}, box = (w, h, d) => new THREE.BoxGeometry(w, h, d), SG = (r, w, h, t0, tl) => new THREE.SphereGeometry(r, w, h, 0, Math.PI * 2, t0 || 0, tl || Math.PI), CY = (a, b, h, n, open) => new THREE.CylinderGeometry(a, b, h, n, 1, !!open);
    for (const [k, S] of [['m_leg', 1], ['m_legB', 1.45]]) P[k] = merge([part(box(0.14 * S, 0.28, 0.16 * S), 0x5c6178, 1, TRS(0, -0.15, 0)), part(box(0.17 * S, 0.08, 0.25 * S), LEATHER, 0, TRS(0, -0.29, 0.03))], [-0.33, 0, 0.62]);
    for (const [k, S, c] of [['m_arm', 1, 0xd8e0ff], ['m_armB', 1.55, 0xffc4b4]]) P[k] = merge([part(box(0.12 * S, 0.24, 0.12 * S), c, 1, TRS(0, -0.11, 0)), part(new THREE.SphereGeometry(0.09 * S, 5, 3), c === 0xd8e0ff ? SKIN : c, c === 0xd8e0ff ? 0 : 1, TRS(0, -0.27, 0.01))], [-0.3, 0, 0.75]);
    // friendly GIANT limbs: navy trousers + brown boots; blue sleeve, bare arm, blue bracer with a white cuff, big fist
    P.m_legG = merge([part(box(0.24, 0.24, 0.26), NAVY, 1, TRS(0, -0.1, 0)), part(box(0.28, 0.12, 0.33), BROWN, 0, TRS(0, -0.28, 0.04))], [-0.33, 0, 0.62]);
    P.m_armG = merge([part(box(0.25, 0.14, 0.26), WHITE, 1, TRS(0, -0.01, 0)), part(box(0.2, 0.15, 0.21), GSKIN, 0, TRS(0, -0.14, 0)), part(box(0.26, 0.15, 0.27), WHITE, 1, TRS(0, -0.265, 0)), part(box(0.265, 0.03, 0.275), TRIM, 0, TRS(0, -0.335, 0)), part(box(0.25, 0.2, 0.26), GSKIN, 0, TRS(0, -0.4, 0.01))], [-0.45, 0, 0.72]);
    P.m_shield = merge([part(new THREE.CylinderGeometry(0.21, 0.21, 0.05, 7), 0xe6ecff, 1, TRS(0, 0, 0, Math.PI / 2, 0, 0)), part(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 5), GOLD, 0, TRS(0, 0, 0.03, Math.PI / 2, 0, 0))]);
    const slab1 = (shape, depth) => { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 }); g.translate(0, 0, -depth / 2); g.computeVertexNormals(); return g; };
    // mid LOD MELEE / ELITE carry their shield inside the torso piece (recipe midShield): held at the stance pose, one draw less each
    const R0 = KM.RIG.std, armAt = (lp, lr, m) => new M4().multiplyMatrices(TRS(-R0.shoulder[0], R0.shoulder[1], 0), new M4().makeRotationFromEuler(new E(lp, 0, lr, 'YXZ'))).multiply(TRS(...R0.shieldAt)).multiply(m);
    const kiteMid = () => [part(slab1(kite(0.5, 0.76), 0.045), TRIM, 0, armAt(-0.15, 0.12, TRS(0, -0.02, 0))), part(slab1(kite(0.42, 0.65), 0.07), WHITE, 1, armAt(-0.15, 0.12, TRS(0, -0.01, 0))), part(diamond(0.07, 0.15, 0.03), TRIM, 0, armAt(-0.15, 0.12, TRS(0, 0, 0.04)))];
    const aspisMid = () => [part(CY(0.335, 0.335, 0.05, 8), TRIM, 0, armAt(-0.5, -0.32, TRS(0, 0, 0, Math.PI / 2, 0, 0))), part(CY(0.285, 0.285, 0.08, 8), WHITE, 1, armAt(-0.5, -0.32, TRS(0, 0, 0, Math.PI / 2, 0, 0))), part(diamond(0.085, 0.17, 0.03), TRIM, 0, armAt(-0.5, -0.32, TRS(0, 0, 0.048)))];
    const stick = (len, col, extra) => merge([part(box(0.05, 0.03, len), col, 0, TRS(0, 0, len / 2 + 0.05)), ...(extra || [])]);
    P.m_w_sword = stick(0.62, STEEL, [part(box(0.18, 0.04, 0.05), GOLD, 0, TRS(0, 0, 0.08))]); P.m_w_swordGold = stick(0.62, GOLD, [part(box(0.18, 0.04, 0.05), GOLD, 0, TRS(0, 0, 0.08))]);
    P.m_w_dagger = stick(0.3, STEEL); P.m_w_staffE = stick(1.0, 0x2a1a1a, [part(new THREE.OctahedronGeometry(0.1, 0), 0xff3a3a, 0, TRS(0, 0, 0.95))]);
    P.m_w_staff = merge([part(box(0.06, 0.06, 1.14), STAFFW, 0, TRS(0, 0, 0.38)), part(new THREE.OctahedronGeometry(0.115, 0), GEM, 0, TRS(0, 0, KM.STAFF_TIP, 0, 0, Math.PI / 4, 0.8, 0.8, 1.5))]);
    P.m_w_axe = stick(0.9, WOOD, [part(box(0.05, 0.3, 0.24), 0x9aa4b2, 0, TRS(0, 0.15, 0.7))]); P.m_w_bow = merge([part(box(0.03, 0.03, 0.7), WOOD, 0, TRS(0, 0.1, 0))]);
    P.m_w_bomb = merge([part(new THREE.SphereGeometry(0.15, 5, 4), 0x24252c, 0, TRS(0, 0, 0.09))]);
    P.m_w_rock = merge([part(new THREE.SphereGeometry(0.09, 4, 3), 0x9a9488, 0, TRS(0, 0, 0.06))]); P.m_w_spear = stick(1.1, WOOD); P.m_w_xbow = stick(0.5, WOOD, [part(box(0.4, 0.03, 0.04), DSTEEL, 0, TRS(0, 0, 0.42))]);
    P.m_w_musket = stick(0.95, DSTEEL); P.m_w_rifle = stick(0.8, DARK); P.m_w_pulse = stick(0.75, 0x3fd0ff); P.m_w_sack = merge([part(new THREE.SphereGeometry(0.17, 5, 4), 0xd9b27a, 0, TRS(0, 0.05, -0.05))]); P.m_w_claws = merge([part(box(0.1, 0.02, 0.12), IVORY, 0, TRS(0, 0, 0.08))]);
    // friendly weapons (lean): short white sword, long pike, stone hammer, recurve bow
    P.m_w_knife = merge([part(box(0.07, 0.03, 0.24), TRIM, 0, TRS(0, 0, 0.18)), part(box(0.13, 0.04, 0.04), DSTEEL, 0, TRS(0, 0, 0.05))]);
    P.m_w_swordS = merge([part(box(0.12, 0.03, 0.46), TRIM, 0, TRS(0, 0, 0.32)), part(box(0.2, 0.05, 0.06), DSTEEL, 0, TRS(0, 0, 0.08)), part(box(0.05, 0.05, 0.14), BROWN, 0, TRS(0, 0, 0))]);
    P.m_w_pike = merge([part(box(0.055, 0.055, PIKE.tip - 0.3 - PIKE.butt), WOOD, 0, TRS(0, 0, (PIKE.tip - 0.3 + PIKE.butt) / 2)), part(box(0.08, 0.08, 0.12), WHITE, 1, TRS(0, 0, PIKE.tip - 0.42)), part(new THREE.OctahedronGeometry(0.1, 0), TRIM, 0, TRS(0, 0, PIKE.tip - 0.15, 0, 0, Math.PI / 4, 0.8, 0.35, 1.5))]);
    P.m_w_hammer = merge([part(box(0.09, 0.09, 1.06), HAFT, 0, TRS(0, 0, 0.31)), part(box(0.36, 0.46, 0.3), STONE, 0, TRS(0, 0, 0.84)), ...[-1, 1].map(y => part(box(0.4, 0.08, 0.34), STONE2, 0, TRS(0, y * 0.215, 0.84)))]);
    { const L = [], seg = (y0, z0, y1, z1, w) => { const dy = y1 - y0, dz = z1 - z0; L.push(part(box(w, 0.05, Math.hypot(dy, dz)), 0x9a6236, 0, TRS(0, (y0 + y1) / 2, (z0 + z1) / 2, Math.atan2(-dy, dz), 0, 0))); };
      for (const sz of [1, -1]) { seg(-0.02, 0, 0.06, 0.22 * sz, 0.07); seg(0.06, 0.22 * sz, 0.1, 0.43 * sz, 0.06); } L.push(part(box(0.014, 0.014, 0.86), TRIM, 0, TRS(0, 0.098, 0))); P.m_w_bowF = merge(L); }
    // friendly mid torso+head pieces: each carries its class read (the phone shows most of the army at this LOD)
    const crest = (n) => { const cr = new THREE.Shape(); cr.moveTo(0.18, -0.06); cr.quadraticCurveTo(0.16, 0.3, -0.06, 0.34); cr.quadraticCurveTo(-0.36, 0.34, -0.52, 0.0); cr.lineTo(-0.5, -0.22); cr.lineTo(-0.36, -0.2); cr.quadraticCurveTo(-0.2, 0.02, 0.0, 0.0); cr.lineTo(0.18, -0.06);
      const g = new THREE.ExtrudeGeometry(cr, { depth: 0.17, bevelEnabled: false, curveSegments: n }); g.translate(0, 0, -0.085); g.computeVertexNormals(); return g; };
    const torso = (r, col, tint) => part(new THREE.LatheGeometry([[0, -0.02], [0.22 * r, 0.0], [0.28 * r, 0.13], [0.26 * r, 0.3], [0.14 * r, 0.4], [0, 0.42]].map(([a, b]) => new THREE.Vector2(a, b)), 7), col, tint);
    const head = (hy, L) => L.push(part(SG(0.2, 6, 4), SKIN, 0, TRS(0, hy, 0)));
    const MIDF = {
      soldier: (hy, L) => { L.push(torso(1, WHITE, 1), part(CY(0.272, 0.272, 0.065, 7, true), BROWN, 0, TRS(0, 0.1, 0)));
        for (const x of [-1, 1]) L.push(part(SG(0.145, 5, 2, 0, Math.PI / 2), WHITE, 1, TRS(x * 0.27, 0.34, 0)), part(box(0.06, 0.16, 0.13), TRIM, 0, TRS(x * 0.236, hy - 0.08, 0.07, 0, -x * 0.32, 0)));
        head(hy, L); L.push(part(SG(0.262, 8, 3, 0, Math.PI * 0.56), WHITE, 1, TRS(0, hy + 0.03, -0.012)), part(CY(0.268, 0.268, 0.05, 8, true), 0xc4ceee, 1, TRS(0, hy, -0.012)), part(new THREE.TorusGeometry(0.268, 0.04, 3, 5, Math.PI), TRIM, 0, TRS(0, hy + 0.03, -0.012, 0, Math.PI / 2, 0, 1, 1, 2.0)), ...kiteMid()); },
      archerF: (hy, L) => { L.push(torso(0.9, WHITE, 1), part(CY(0.25, 0.27, 0.12, 7, true), WHITE, 0.5, TRS(0, -0.04, 0)), part(CY(0.245, 0.245, 0.06, 7, true), BROWN, 0, TRS(0, 0.1, 0)), part(box(0.42, 0.38, 0.035), 0xb4c0e6, 1, TRS(0, 0.2, -0.235, 0.12, 0, 0)),
          part(CY(0.088, 0.078, 0.5, 6, true), BROWN, 0, TRS(0.13, 0.3, -0.3, 0, 0, -0.38)), part(box(0.1, 0.14, 0.09), WHITE, 1, TRS(0.25, 0.62, -0.3, 0, 0, -0.38)), part(box(0.08, 0.04, 0.06), TRIM, 0, TRS(0.29, 0.71, -0.3, 0, 0, -0.38)));
        head(hy, L); L.push(part(SG(0.262, 8, 3, 0, Math.PI * 0.64), WHITE, 1, TRS(0, hy + 0.02, -0.035)), part(new THREE.ConeGeometry(0.15, 0.44, 5), WHITE, 1, TRS(0, hy + 0.23, -0.2, -1.15, 0, 0)), part(new THREE.TorusGeometry(0.212, 0.034, 3, 6), WHITE, 0.42, TRS(0, hy + 0.01, 0.085))); },
      knightF: (hy, L) => { L.push(torso(1.06, WHITE, 1), part(CY(0.3, 0.3, 0.17, 8, true), WHITE, 1, TRS(0, -0.03, 0)), part(CY(0.282, 0.282, 0.07, 7, true), BROWN, 0, TRS(0, 0.09, 0)));
        for (const x of [-1, 1]) L.push(part(SG(0.165, 5, 2, 0, Math.PI / 2), WHITE, 1, TRS(x * 0.29, 0.355, 0, 0, 0, -x * 0.5)), part(box(0.08, 0.22, 0.17), ESILV, 0, TRS(x * 0.205, hy - 0.08, 0.115, 0, -x * 0.42, 0)));
        head(hy, L); L.push(part(SG(0.272, 8, 3, 0, Math.PI * 0.5), ESILV, 0, TRS(0, hy + 0.03, -0.015)), part(box(0.44, 0.17, 0.12), ESILV, 0, TRS(0, hy - 0.08, -0.2, 0.35, 0, 0)), part(crest(1), CREST, 1, TRS(0, hy + 0.28, 0, 0, -Math.PI / 2, 0)), ...aspisMid()); },
      medic: (hy, L) => { L.push(part(new THREE.LatheGeometry([[0, -0.27], [0.3, -0.26], [0.27, 0.0], [0.24, 0.22], [0.15, 0.42], [0, 0.44]].map(([a, b]) => new THREE.Vector2(a, b)), 8), WHITE, 1), part(CY(0.262, 0.266, 0.065, 8, true), BROWN, 0, TRS(0, 0.12, 0)), part(new THREE.OctahedronGeometry(0.055, 0), GEM, 0, TRS(0, 0.12, 0.27, 0, 0, 0, 1, 1, 0.5)));
        head(hy, L); L.push(part(SG(0.17, 6, 4), BEARD, 0, TRS(0, hy - 0.14, 0.12, 0, 0, 0, 1.08, 1.45, 0.75)), part(CY(0.37, 0.37, 0.035, 10), WHITE, 1, TRS(0, hy + 0.13, -0.01)), part(CY(0.232, 0.242, 0.085, 8), BROWN, 0, TRS(0, hy + 0.185, -0.01)),
          part(CY(0.13, 0.232, 0.3, 7), WHITE, 1, TRS(0, hy + 0.37, -0.03, -0.1, 0, 0)), part(new THREE.ConeGeometry(0.135, 0.38, 6), WHITE, 1, TRS(0, hy + 0.63, -0.13, -0.6, 0, 0))); },
      collector: (hy, L) => { L.push(torso(0.96, TRIM, 0), part(CY(0.15, 0.175, 0.07, 7, true), WHITE, 1, TRS(0, 0.4, 0)), part(box(0.3, 0.3, 0.035), WHITE, 1, TRS(0, -0.03, 0.262, -0.1, 0, 0)), part(CY(0.262, 0.262, 0.065, 7, true), BROWN, 0, TRS(0, 0.1, 0)),
          part(box(0.42, 0.42, 0.25), PACK, 0, TRS(0, 0.24, -0.36)), part(box(0.44, 0.12, 0.08), 0x6e4426, 0, TRS(0, 0.36, -0.235, 0.15, 0, 0)), part(box(0.38, 0.09, 0.2), GOLD, 0, TRS(0, 0.48, -0.36)));
        head(hy, L); L.push(part(SG(0.218, 7, 3, 0, Math.PI * 0.56), HAIR, 0, TRS(0, hy + 0.02, -0.015)), part(CY(0.222, 0.222, 0.075, 8, true), WHITE, 1, TRS(0, hy + 0.08, 0, -0.12, 0, 0)));
        for (const [x, y, z, rx, rz] of [[0, 0.26, 0.0, -0.2, 0], [0.12, 0.23, -0.05, -0.4, -0.6], [-0.12, 0.23, -0.05, -0.4, 0.6], [0.0, 0.2, -0.16, -1.0, 0]]) L.push(part(new THREE.ConeGeometry(0.075, 0.18, 4), HAIR, 0, TRS(x, hy + y, z, rx, 0, rz))); },
    };
    for (const [k, r] of Object.entries(KM.RECIPE)) {
      if (r.body) continue;
      if (r.torso === 'tGolem') { const G = KM.RIG.golem, hy = G.neck;   // friendly GIANT: blue vest, compact white pauldrons on blue rims, bearded face under a blue cap
        P['m_th_' + k] = merge([part(box(0.78, 0.5, 0.5), WHITE, 1, TRS(0, 0.24, 0)), part(box(0.64, 0.24, 0.44), NAVY, 1, TRS(0, -0.05, 0)), part(box(0.81, 0.09, 0.53), BROWN, 0, TRS(0, 0.03, 0)), part(box(0.56, 0.34, 0.06), 0xc8d0ec, 1, TRS(0, 0.27, -0.265)),
          ...padsGolem(), ...[part(box(0.34, 0.32, 0.32), GSKIN, 0, TRS(0, hy + 0.16, 0.01)), part(box(0.36, 0.17, 0.13), HAIR, 0, TRS(0, hy + 0.05, 0.13)), part(box(0.25, 0.045, 0.03), DARK, 0, TRS(0, hy + 0.2, 0.17)), part(box(0.39, 0.12, 0.37), WHITE, 0.85, TRS(0, hy + 0.325, 0)),
            part(box(0.32, 0.05, 0.3), WHITE, 0.85, TRS(0, hy + 0.405, -0.01)), part(box(0.4, 0.06, 0.38), 0x9aaad8, 1, TRS(0, hy + 0.27, 0)), part(box(0.35, 0.2, 0.05), HAIR, 0, TRS(0, hy + 0.13, -0.16))].map(g => g.translate(...HGO))], [-0.15, 0.4, 0.72]);
        continue; }
      if (MIDF[k]) { const L = []; MIDF[k](KM.RIG.std.neck + 0.17, L); P['m_th_' + k] = merge(L, [k === 'medic' ? -0.27 : -0.05, 0.3, 0.7]); continue; }
      const brute = r.torso === 'tBrute', S = brute ? 1.45 : 1, rig = brute ? KM.RIG.brute : KM.RIG.std, L = [];   // enemy kinds
      const hs = { hBlue: 'dome', hKnight: 'plume', hHood: 'hood', hHoodE: 'hood', hHoodI: 'hood', hHeavyE: 'horns', hEliteE: 'horns', hHorn: 'horns', hBucket: 'bucket', hBandana: 'band', hLooter: 'band', hImp: 'imp', hBrute: 'bhorns', hWarlord: 'crown', hShaman: 'cone', hWizard: 'cone', hElite: 'helm', hGoggles: 'dome' }[r.head];
      L.push(part(new THREE.LatheGeometry([[0, -0.02], [0.22, 0.0], [0.28, 0.13], [0.26, 0.3], [0.14, 0.4], [0, 0.42]].map(([a, b]) => new THREE.Vector2(a * S, b * (brute ? 1.08 : 1))), 7), r.torso === 'tRobe' ? 0xd8c8ff : brute ? 0xffd2c4 : 0xe6ebff, 1));
      L.push(part(new THREE.CylinderGeometry(0.27 * S, 0.27 * S, 0.06, 7), LEATHER, 0, TRS(0, 0.1, 0)));
      if (r.torso === 'tHeavy' || brute) for (const x of [-1, 1]) L.push(part(new THREE.SphereGeometry(0.13 * S, 5, 3, 0, Math.PI * 2, 0, Math.PI / 2), brute ? DSTEEL : 0xd8e0ff, brute ? 0 : 1, TRS(x * 0.27 * S, 0.34, 0)));
      const hy = rig.neck + 0.17, skinTint = r.head === 'hImp' || brute ? 1 : 0, skinC = skinTint ? 0xffc4b4 : r.head === 'hShaman' ? 0x2a1a33 : SKIN;
      L.push(part(new THREE.SphereGeometry(0.2 * (brute ? 1.08 : r.head === 'hImp' ? 1.12 : 1), 7, 5), skinC, skinTint, TRS(0, hy, 0)));
      if (!skinTint && r.head !== 'hShaman') for (const x of [-1, 1]) L.push(part(new THREE.SphereGeometry(0.03, 4, 2), DARK, 0, TRS(x * 0.072, hy - 0.015, 0.186)));
      const dome = (col, t, y) => L.push(part(new THREE.SphereGeometry(0.262, 8, 3, 0, Math.PI * 2, 0, Math.PI * 0.56), col, t, TRS(0, hy + (y || 0.03), -0.012)));
      if (hs === 'dome' || hs === 'plume') { dome(0xe8eeff, 1); L.push(part(new THREE.CylinderGeometry(0.268, 0.268, 0.05, 8), 0xb4c0ff, 1, TRS(0, hy, -0.012))); }
      if (hs === 'plume') L.push(part(new THREE.SphereGeometry(0.08, 5, 3), GOLD, 0, TRS(0, hy + 0.33, -0.05, 0, 0, 0, 0.6, 1.2, 1.6)));
      if (hs === 'hood') dome(0xc0ccff, 1, 0.02); if (hs === 'band') L.push(part(new THREE.CylinderGeometry(0.21, 0.21, 0.07, 7), 0xeaeaea, 1, TRS(0, hy + 0.05, 0)));
      if (hs === 'horns' || hs === 'bhorns' || hs === 'imp' || hs === 'crown') { if (hs === 'horns') dome(0xeaeaea, 1); if (hs === 'bhorns' || hs === 'crown') L.push(part(new THREE.SphereGeometry(0.225, 7, 3, 0, Math.PI * 2, 0, Math.PI * 0.45), DSTEEL, 0, TRS(0, hy + 0.03, -0.02))); const hl = hs === 'bhorns' || hs === 'crown' ? 0.36 : 0.22; for (const x of [-1, 1]) L.push(part(new THREE.ConeGeometry(0.06, hl, 5), IVORY, 0, TRS(x * 0.22, hy + 0.2, 0, 0, 0, -x * 0.8))); }
      if (hs === 'crown') L.push(part(new THREE.CylinderGeometry(0.2, 0.22, 0.1, 7), GOLD, 0, TRS(0, hy + 0.2, 0)));
      if (hs === 'bucket') L.push(part(new THREE.CylinderGeometry(0.24, 0.25, 0.32, 8), 0xd8d8d8, 1, TRS(0, hy + 0.05, 0)), part(new THREE.BoxGeometry(0.3, 0.035, 0.04), DARK, 0, TRS(0, hy + 0.03, 0.24)));
      if (hs === 'cone') L.push(part(new THREE.ConeGeometry(0.27, 0.58, 7), 0xd8c8ff, 1, TRS(0, hy + 0.23, -0.04)));
      if (r.head === 'hWizard') L.push(part(new THREE.SphereGeometry(0.16, 6, 4), BEARD, 0, TRS(0, hy - 0.12, 0.12, 0, 0, 0, 1, 1.3, 0.75)), part(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 8), 0xe8eeff, 1, TRS(0, hy + 0.14, 0)));
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
    add(P[am], aL); add(P[am], aR); if (r.wpn !== 'none') add(P['m_w_' + r.wpn], new M4().multiplyMatrices(KM.OFFHAND[r.wpn] ? aL : aR, TRS(0, rig.fist, 0.02)));
    if (r.shield && !r.midShield) add(P['m_' + KM.shieldOf(r)], new M4().multiplyMatrices(aL, TRS(...rig.shieldAt)));
    const g = concat(list); list.forEach(x => x.dispose()); return g;
  }
  // Far crowd: shared low-poly silhouettes (~90–160 tris) instead of one ~400-tri statue per kind; one instanced draw per family.
  // Enemies share F_std / F_shield / F_brute / F_hat; every friendly class has its own family so it stays readable when far.
  KM.farFamily = r => r.far || (r.torso === 'tBrute' ? 'F_brute' : r.head === 'hWizard' ? 'F_hat' : r.shield ? 'F_shield' : 'F_std');
  function farParts() {
    const out = {}, B = (w, h, d) => new THREE.BoxGeometry(w, h, d), SG = (r, w, h, tl) => new THREE.SphereGeometry(r, w, h, 0, Math.PI * 2, 0, tl || Math.PI), CY = (a, b, h, n) => new THREE.CylinderGeometry(a, b, h, n);
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
    { const L = [];   // enemy Mizard (shaman) far silhouette: robe + tall pointed hat
      L.push(part(new THREE.CylinderGeometry(0.2, 0.32, 0.72, 6), 0xe6ebff, 1, TRS(0, 0.36, 0)), part(new THREE.SphereGeometry(0.2, 5, 3), SKIN, 0, TRS(0, 0.91, 0)), part(new THREE.SphereGeometry(0.15, 5, 3), BEARD, 0, TRS(0, 0.8, 0.1)),
        part(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 6), 0xe8eeff, 1, TRS(0, 1.04, 0)), part(new THREE.ConeGeometry(0.22, 0.6, 5), 0xe8eeff, 1, TRS(0, 1.36, -0.05)), part(new THREE.BoxGeometry(0.04, 0.04, 1.0), 0x4a2f22, 0, TRS(0.32, 0.5, 0.2)));
      out.F_hat = merge(L, [0, 0.6, 0.7]); }
    // friendly far families (rest pose, face +z): shared std proportions, head centre y 0.91
    const legs = (L, w) => L.push(part(B(w || 0.34, 0.32, 0.2), 0x5c6178, 1, TRS(0, 0.16, 0.01))), body = (L, col, t, r) => L.push(part(new THREE.LatheGeometry([[0, -0.02], [0.23 * r, 0], [0.28 * r, 0.16], [0.2 * r, 0.38], [0, 0.42]].map(([a, b]) => new THREE.Vector2(a, b)), 5), col, t, TRS(0, 0.34, 0)));
    const hd = (L) => L.push(part(SG(0.2, 5, 3), SKIN, 0, TRS(0, 0.91, 0)));
    { const L = []; legs(L); body(L, WHITE, 1, 1); hd(L); L.push(part(SG(0.265, 5, 2, Math.PI * 0.55), WHITE, 1, TRS(0, 0.94, -0.01)), part(B(0.16, 0.06, 0.5), TRIM, 0, TRS(0, 1.2, -0.01)),   // F_melee: blue helm + ridge, kite shield, short sword
        part(B(0.48, 0.7, 0.04), TRIM, 0, TRS(-0.33, 0.48, 0.12)), part(B(0.4, 0.6, 0.07), WHITE, 1, TRS(-0.33, 0.49, 0.12)), part(B(0.07, 0.04, 0.42), TRIM, 0, TRS(0.32, 0.42, 0.24)));
      out.F_melee = merge(L, [0, 0.6, 0.7]); }
    { const L = []; legs(L, 0.3); body(L, WHITE, 1, 0.9); hd(L); L.push(part(SG(0.262, 5, 2, Math.PI * 0.64), WHITE, 1, TRS(0, 0.93, -0.035)), part(new THREE.ConeGeometry(0.14, 0.34, 4), WHITE, 1, TRS(0, 1.1, -0.2, -0.95, 0, 0)),   // F_range: hood point, quiver, bow
        part(B(0.14, 0.5, 0.14), BROWN, 0, TRS(0.12, 0.66, -0.28, 0, 0, -0.38)), part(B(0.1, 0.14, 0.09), WHITE, 1, TRS(0.24, 0.96, -0.28, 0, 0, -0.38)),
        part(B(0.06, 0.44, 0.06), 0x9a6236, 0, TRS(-0.36, 0.62, 0.08, 0.25, 0, 0)), part(B(0.06, 0.44, 0.06), 0x9a6236, 0, TRS(-0.36, 0.24, 0.08, -0.25, 0, 0)));
      out.F_range = merge(L, [0, 0.6, 0.7]); }
    { const L = []; legs(L, 0.38); body(L, WHITE, 1, 1.08); hd(L); L.push(part(SG(0.272, 5, 2, Math.PI * 0.5), ESILV, 0, TRS(0, 0.94, -0.015)), part(B(0.17, 0.3, 0.62), CREST, 1, TRS(0, 1.3, -0.1, 0.25, 0, 0)),   // F_elite: silver helm + tall crest, aspis, pike
        part(CY(0.335, 0.335, 0.05, 5), TRIM, 0, TRS(-0.34, 0.5, 0.14, Math.PI / 2, 0, 0)), part(CY(0.28, 0.28, 0.08, 5), WHITE, 1, TRS(-0.34, 0.5, 0.14, Math.PI / 2, 0, 0)),
        part(B(0.055, 1.45, 0.055), WOOD, 0, TRS(0.34, 0.74, 0.12)), part(new THREE.ConeGeometry(0.07, 0.32, 3), TRIM, 0, TRS(0.34, 1.6, 0.12)));
      out.F_elite = merge(L, [0, 0.6, 0.7]); }
    { const L = []; L.push(part(CY(0.2, 0.31, 0.78, 6), WHITE, 1, TRS(0, 0.4, 0))); hd(L); L.push(part(SG(0.15, 5, 3), BEARD, 0, TRS(0, 0.79, 0.11)), part(CY(0.37, 0.37, 0.04, 6), WHITE, 1, TRS(0, 1.04, 0)), part(CY(0.23, 0.24, 0.08, 6), BROWN, 0, TRS(0, 1.09, 0)),   // F_mizard: hat + band, beard, staff + crystal
        part(new THREE.ConeGeometry(0.22, 0.62, 5), WHITE, 1, TRS(0, 1.39, -0.07, -0.25, 0, 0)), part(B(0.05, 1.12, 0.05), STAFFW, 0, TRS(0.33, 0.6, 0.2)), part(new THREE.OctahedronGeometry(0.11, 0), GEM, 0, TRS(KM.FAR_TIP[0], KM.FAR_TIP[1], KM.FAR_TIP[2], 0, 0, 0, 0.8, 1.5, 0.8)));
      out.F_mizard = merge(L, [0, 0.6, 0.7]); }
    { const L = []; legs(L); body(L, TRIM, 0, 0.96); hd(L); L.push(part(B(0.3, 0.3, 0.04), WHITE, 1, TRS(0, 0.3, 0.25)), part(SG(0.218, 5, 2, Math.PI * 0.56), HAIR, 0, TRS(0, 0.93, -0.015)), part(CY(0.222, 0.222, 0.075, 6), WHITE, 1, TRS(0, 0.99, 0)),   // F_looter: hair + band, gold-topped backpack
        part(new THREE.ConeGeometry(0.075, 0.2, 4), HAIR, 0, TRS(0, 1.18, -0.02, -0.25, 0, 0)), part(B(0.42, 0.42, 0.25), PACK, 0, TRS(0, 0.58, -0.36)), part(B(0.38, 0.09, 0.2), GOLD, 0, TRS(0, 0.82, -0.36)));
      out.F_looter = merge(L, [0, 0.6, 0.7]); }
    { const G = KM.RIG.golem, ty = G.torso, hy = ty + G.neck, L = [];   // F_giant: bearded human giant, blue vest + cap, silver pauldrons, blue bracers + fists, grey stone hammer on a brown haft
      L.push(part(B(0.5, 0.34, 0.28), NAVY, 1, TRS(0, 0.17, 0)), part(B(0.78, 0.56, 0.5), WHITE, 1, TRS(0, ty + 0.22, 0)), ...[-1, 1].map(x => part(B(0.26, 0.11, 0.3), PADS, 0, TRS(x * 0.46, ty + 0.53, 0, 0, 0, -x * 0.22))),   // silver pauldron accents
        ...[part(B(0.34, 0.32, 0.32), GSKIN, 0, TRS(0, hy + 0.16, 0)), part(B(0.36, 0.17, 0.12), HAIR, 0, TRS(0, hy + 0.05, 0.12)), part(B(0.4, 0.22, 0.4), WHITE, 0.85, TRS(0, hy + 0.32, -0.02))].map(g => g.translate(...HGO)),
        ...[-1, 1].flatMap(x => [part(B(0.25, 0.3, 0.26), WHITE, 1, TRS(x * 0.52, ty + 0.2, 0)), part(B(0.23, 0.18, 0.24), GSKIN, 0, TRS(x * 0.52, ty - 0.04, 0.01))]),
        part(B(0.09, 1.0, 0.09), HAFT, 0, TRS(0.56, ty + 0.25, 0.14)), part(B(0.36, 0.3, 0.46), STONE, 0, TRS(0.56, ty + 0.78, 0.14)));
      out.F_giant = merge(L, [0, 0.6, 0.7]); }
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
