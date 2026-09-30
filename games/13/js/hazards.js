/* ENVIRONMENTAL HAZARDS — reusable events that change the level, not decoration.
   Each trigger returns what it did: cells blocked/opened, damage dealt, zone effects. Game code applies injuries via onHurt.
   Grid effects go through L.st.blockedCells / L.st.openCells / zone sets so pathfinding, collision and AI all see them. */
(function () {
  const Z = T13.hazards = { active: [], log: [] };
  let scene = null, L = null, api = {};
  Z.init = (sc, level, hooks) => { scene = sc; L = level; api = hooks || {}; Z.active = []; Z.log = []; L.st.blockedCells = new Set(); L.st.openCells = new Set(); L.st.fire = new Map(); L.st.flood = new Set(); L.st.shock = new Set(); L.st.dark = new Set(); };
  const key = (c, r) => c + ',' + r, X = () => T13.gfx;
  const debris = (c, r, h = 1.4) => { const p = L.center(c, r), g = new THREE.Group(); const m = X().mat({ map: X().concreteTex(), color: 0x9a9384 }); for (let i = 0; i < 9; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.4 + Math.random() * 0.9, 0.2 + Math.random() * 0.5, 0.4 + Math.random() * 0.9), m); b.position.set(p.x + (Math.random() - 0.5) * 2.4, Math.random() * h * 0.6, p.z + (Math.random() - 0.5) * 2.4); b.rotation.set(Math.random(), Math.random(), Math.random()); b.castShadow = true; g.add(b); } const tile = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 1.2), X().mat({ map: X().ceilTex() })); tile.position.set(p.x, 0.6, p.z); tile.rotation.set(0.4, 0.3, 0.2); g.add(tile); scene.add(g); return g; };
  const hurtNear = (x, z, rad, amount, why) => { const hit = (api.siblings ? api.siblings() : []).filter(b => b.health !== 'CAPTURED' && Math.hypot(b.x - x, b.z - z) < rad); hit.forEach(b => api.onHurt && api.onHurt(b, amount, why)); return hit.map(b => b.id); };
  const TYPES = {
    glass_break: (c, r) => { const p = L.center(c, r); T13.audio.glass && T13.audio.glass(p.x, 1.6, p.z); return { noise: 14, hurt: hurtNear(p.x, p.z, 1.2, 1, 'glass') }; },
    door_slam: (c, r, o) => { const d = L.doorAt(c, r); if (!d) return {}; api.setDoor && api.setDoor(d, false, true); d.userData.jammedUntil = (o.now || 0) + (o.secs || 10); return { jammed: key(c, r), noise: 16 }; },
    furniture_move: (c, r, o) => { L.st.blockedCells.add(key(c, r)); const p = L.center(c, r), m = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.9, 0.9), X().mat({ map: X().woodTex('#4e3521', 'cab') })); m.position.set(p.x, 0.95, p.z); m.rotation.y = o.ry || 0.4; m.castShadow = true; scene.add(m); return { blocked: [key(c, r)], mesh: m, noise: 12 }; },
    ceiling_collapse: (c, r) => { L.st.blockedCells.add(key(c, r)); const p = L.center(c, r); const g = debris(c, r); T13.audio.collapse && T13.audio.collapse(p.x, 2, p.z); api.shake && api.shake(0.8); return { blocked: [key(c, r)], mesh: g, hurt: hurtNear(p.x, p.z, 2.2, 1, 'ceiling'), noise: 24 }; },
    falling_beam: (c, r, o) => { L.st.blockedCells.add(key(c, r)); const p = L.center(c, r), m = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.3, 0.3), X().mat({ map: X().woodTex('#3e2a18', 'beam') })); m.position.set(p.x, 0.5, p.z); m.rotation.set(0, o.ry || 0.3, 0.35); m.castShadow = true; scene.add(m); T13.audio.collapse && T13.audio.collapse(p.x, 2, p.z); return { blocked: [key(c, r)], mesh: m, hurt: hurtNear(p.x, p.z, 1.6, 1, 'beam'), noise: 20 }; },
    floor_collapse: (c, r) => { L.st.blockedCells.add(key(c, r)); const p = L.center(c, r), hole = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ color: 0x000000 })); hole.rotation.x = -Math.PI / 2; hole.position.set(p.x, 0.01, p.z); scene.add(hole); return { blocked: [key(c, r)], mesh: hole, hurt: hurtNear(p.x, p.z, 1.5, 2, 'fall'), noise: 20 }; },
    fire: (c, r, o) => { const p = L.center(c, r), light = new THREE.PointLight(X().col(0xff7a22), 1.6, 9, 1.5); light.position.set(p.x, 1, p.z); scene.add(light); const flames = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.8, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })); flames.position.set(p.x, 0.9, p.z); scene.add(flames); L.st.fire.set(key(c, r), { light, flames, until: (o.now || 0) + (o.secs || 30) }); return { fire: key(c, r), noise: 8 }; },
    flooding: (c, r, o) => { const cells = []; for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) { const cc = c + dc, rr = r + dr; if (!L.blocked(cc, rr, true)) { L.st.flood.add(key(cc, rr)); cells.push(key(cc, rr)); const p = L.center(cc, rr), w = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), X().mat({ color: 0x1a2630, shininess: 120, specular: 0x557788, transparent: true, opacity: 0.8 })); w.rotation.x = -Math.PI / 2; w.position.set(p.x, 0.12, p.z); scene.add(w); } } return { flooded: cells, noise: 6 }; },
    electrical_failure: (c, r, o) => { const cells = []; for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) { L.st.shock.add(key(c + dc, r + dr)); cells.push(key(c + dc, r + dr)); } api.zoneDark && api.zoneDark(L.zoneOf(c, r), o.secs || 20); const p = L.center(c, r); T13.audio.spark && T13.audio.spark(p.x, 2.5, p.z); return { shock: cells, dark: L.zoneOf(c, r), noise: 10 }; },
    blocked_passage: (c, r) => { L.st.blockedCells.add(key(c, r)); return { blocked: [key(c, r)], mesh: debris(c, r, 2.2) }; },
    exposed_passage: (c, r) => { L.st.openCells.add(key(c, r)); if (api.openWall) api.openWall(c, r); T13.audio.collapse && T13.audio.collapse(L.center(c, r).x, 1.5, L.center(c, r).z); return { opened: [key(c, r)], noise: 18 }; },
  };
  Z.TYPES = Object.keys(TYPES);
  Z.trigger = (type, c, r, o = {}) => { const f = TYPES[type]; if (!f) throw new Error('unknown hazard ' + type); const res = { type, c, r, ...f(c, r, o) }; Z.active.push(res); Z.log.push({ type, c, r, t: Math.round(o.now || 0) }); if (res.noise && api.noise) { const p = L.center(c, r); api.noise(p.x, p.z, res.noise); } return res; };
  /* STABILIZE (Daniel): undo the nearest removable hazard — fire out, shock off, a collapse held/cleared */
  Z.stabilize = (x, z, rad = 6) => { let best = null, bd = rad; Z.active.forEach(h => { if (h.stabilized) return; const p = L.center(h.c, h.r), d = Math.hypot(p.x - x, p.z - z); if (d < bd && ['fire', 'electrical_failure', 'ceiling_collapse', 'falling_beam', 'blocked_passage', 'furniture_move'].includes(h.type)) { bd = d; best = h; } }); if (!best) return null;
    best.stabilized = true; const k2 = key(best.c, best.r);
    if (best.type === 'fire') { const f = L.st.fire.get(k2); if (f) { scene.remove(f.light, f.flames); L.st.fire.delete(k2); } }
    else if (best.type === 'electrical_failure') { (best.shock || []).forEach(k => L.st.shock.delete(k)); }
    else { L.st.blockedCells.delete(k2); if (best.mesh) best.mesh.visible = false; }
    return best; };
  /* per-frame: fire damage + spread, shock damage, flood slows (read by movement), jammed doors expire */
  Z.tick = (dt, now) => {
    for (const [k, f] of L.st.fire) { f.flames.scale.y = 0.8 + Math.sin(now * 13 + f.light.position.x) * 0.15; f.light.intensity = 1.3 + Math.random() * 0.6; if (now > f.until) { scene.remove(f.light, f.flames); L.st.fire.delete(k); } }
    (api.siblings ? api.siblings() : []).forEach(b => { if (b.health === 'CAPTURED') return; const k = key(...L.cell(b.x, b.z)); if (L.st.fire.has(k) || L.st.shock.has(k)) { b.hazT = (b.hazT || 0) + dt; if (b.hazT > 0.8) { b.hazT = 0; api.onHurt && api.onHurt(b, 1, L.st.fire.has(k) ? 'fire' : 'shock'); } } else b.hazT = 0; });
  };
  Z.dangerous = (c, r) => { const k = key(c, r); return L.st.fire.has(k) || L.st.shock.has(k); };
  Z.slow = (c, r) => L.st.flood.has(key(c, r)) ? 0.55 : 1;
})();
