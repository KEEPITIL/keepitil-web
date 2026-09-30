/* THIRD-PERSON CAMERA — over the right shoulder of the controlled sibling.
   • collision: the boom is ray-marched through the level grid (walls, closed doors) and the ceiling; it shortens, then eases back out
   • context: explore 2.7 m · danger (hunted) 2.1 m tight · threat-in-view 3.2 m wide · power framing (lower, closer, more shoulder)
   • cinematic overrides blend in/out; the player's yaw/pitch are preserved and control returns smoothly
   • sensitivity + invert from settings */
(function () {
  const K = T13.cam = {}, V = THREE.Vector3;
  const setting = (k, d) => { try { const v = JSON.parse(localStorage.getItem('t13-settings') || '{}')[k]; return v === undefined ? d : v; } catch (e) { return d; } };
  K.settings = () => ({ sens: setting('sens', 1), invert: setting('invert', false) });
  K.state = { yaw: Math.PI, pitch: -0.12, dist: 2.7, wantDist: 2.7, side: 0.55, height: 1.55, ctx: 'explore', cine: null, blend: 0, shake: 0 };
  const CTX = { explore: { dist: 2.7, side: 0.55, height: 1.58, fov: 64 }, danger: { dist: 2.1, side: 0.5, height: 1.5, fov: 62 }, threat: { dist: 3.2, side: 0.75, height: 1.7, fov: 68 }, power: { dist: 1.9, side: 0.8, height: 1.45, fov: 58 }, crouch: { dist: 2.3, side: 0.5, height: 1.05, fov: 64 }, hidden: { dist: 0.01, side: 0, height: 1.5, fov: 70 } };
  K.CTX = CTX;
  K.look = (dx, dy) => { const s = K.settings(); K.state.yaw -= dx * 0.0032 * s.sens; K.state.pitch = Math.max(-1.0, Math.min(0.55, K.state.pitch - dy * 0.0032 * s.sens * (s.invert ? -1 : 1))); };
  K.setContext = c => { K.state.ctx = CTX[c] ? c : 'explore'; };
  /* cinematic override: {pos, look, secs, hold} — returns a promise when control is back */
  K.cinematic = (o) => new Promise(res => { K.state.cine = { pos: o.pos.clone(), look: o.look.clone(), secs: o.secs || 1.2, hold: o.hold || 1.5, t: 0, res }; });
  K.shake = (amt = 0.3) => { K.state.shake = Math.max(K.state.shake, amt); };
  /* boom collision against the grid + ceiling: returns the safe distance along the boom */
  function clearDist(L, from, dir, max) { const step = 0.12; for (let d = step; d <= max; d += step) { const x = from.x + dir.x * d, y = from.y + dir.y * d, z = from.z + dir.z * d; if (y > L.H - 0.15 || y < 0.15) return Math.max(0.35, d - 0.25); const [c, r] = L.cell(x, z); if (L.opaque(c, r)) return Math.max(0.35, d - 0.3); } return max; }
  const tmp = new V(), pivot = new V(), want = new V(), look = new V(), dir = new V();
  K.update = (camera, L, target, dt) => {
    const S = K.state, c = CTX[S.ctx];
    S.wantDist += (c.dist - S.wantDist) * Math.min(1, dt * 3); S.side += (c.side - S.side) * Math.min(1, dt * 3); S.height += (c.height - S.height) * Math.min(1, dt * 4);
    camera.fov += (c.fov - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix();
    pivot.set(target.x, (target.crouch ? 1.0 : S.height), target.z);
    // boom direction from yaw/pitch; shoulder offset to the right of the view
    const cy = Math.cos(S.yaw), sy = Math.sin(S.yaw), cp = Math.cos(S.pitch), spp = Math.sin(S.pitch);
    dir.set(sy * cp, -spp, cy * cp);   // backwards from the view
    const right = tmp.set(cy, 0, -sy);
    const shoulder = pivot.clone().addScaledVector(right, S.side);
    const free = clearDist(L, shoulder, dir, S.wantDist);
    S.dist = free < S.dist ? free : S.dist + (free - S.dist) * Math.min(1, dt * 2.5);   // snap in, ease out
    want.copy(shoulder).addScaledVector(dir, S.dist);
    look.copy(shoulder).addScaledVector(dir, -6);
    if (S.cine) { const q = S.cine; q.t += dt; const inT = Math.min(1, q.t / q.secs), outT = Math.max(0, (q.t - q.secs - q.hold) / q.secs); S.blend = Math.min(inT, 1 - outT); if (outT >= 1) { S.blend = 0; S.cine = null; q.res(); } }
    const b = S.cine ? S.blend * S.blend * (3 - 2 * S.blend) : 0;
    if (S.cine) { want.lerp(S.cine.pos, b); look.lerp(S.cine.look, b); }
    camera.position.copy(want); if (S.shake > 0) { camera.position.x += (Math.random() - 0.5) * S.shake * 0.2; camera.position.y += (Math.random() - 0.5) * S.shake * 0.2; S.shake = Math.max(0, S.shake - dt); }
    camera.lookAt(look);
    return { yaw: S.yaw, dist: S.dist, cine: !!S.cine };
  };
})();
