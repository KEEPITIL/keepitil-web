/* THE THIRTEEN ANCHORS — playable horror core (Milestone A) + one early power per sibling (Milestone B).
   First person; all three siblings are always present (you control one, the other two follow); instant switching. */
(function () {
  const G = T13.game = {};
  const L = T13.level, A = T13.audio, D = T13.director, SIB = T13.SIBLINGS, CASE = T13.PROLOGUE;
  let renderer, scene, camera, spot, spotTarget, ambient, enemyMesh, shadowMesh, running = false, last = 0;
  const S = 3, EYE = 1.62, CROUCH_EYE = 1.0, RAD = 0.33;
  const input = G.input = { mx: 0, mz: 0, run: false, crouch: false, dx: 0, dy: 0 };
  const touch = matchMedia('(pointer: coarse)').matches;
  const stats = G.stats = { deaths: 0, hides: 0, powers: { mara: 0, gabriel: 0, daniel: 0 }, switches: 0, started: 0 };
  let s = null;   // run state

  G.init = () => {
    if (renderer) return;
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('view'), antialias: !touch, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, touch ? 1.25 : 1.75));
    const size = () => { renderer.setSize(innerWidth, innerHeight, false); if (camera) { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); } };
    addEventListener('resize', size); size();
  };

  const loadSave = () => { try { return JSON.parse(localStorage.getItem('t13-save') || 'null'); } catch (e) { return null; } };
  const writeSave = (o) => { try { localStorage.setItem('t13-save', JSON.stringify(o)); } catch (e) {} };
  G.save = loadSave;

  function sibMesh(sib) {
    const g = new THREE.Group(), m = new THREE.MeshLambertMaterial({ color: sib.color });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 1.2, 10), m); body.position.y = 0.95; g.add(body);
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.5, 8), new THREE.MeshLambertMaterial({ color: 0x1d1d22 })); legs.position.y = 0.25; g.add(legs);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), new THREE.MeshLambertMaterial({ color: 0xc9a88a })); head.position.y = 1.72; g.add(head);
    const lamp = new THREE.SpotLight(0xfff1d0, 0.9, 12, 0.45, 0.6, 1.2); lamp.position.set(0, 1.4, 0); const tg = new THREE.Object3D(); tg.position.set(0, 1.0, -4); g.add(tg); lamp.target = tg; g.add(lamp);
    g.userData.lamp = lamp; return g;
  }
  function hollowMesh() {
    const g = new THREE.Group(), dark = new THREE.MeshLambertMaterial({ color: 0x07070a }), pale = new THREE.MeshLambertMaterial({ color: 0x9c968a, emissive: 0x111111 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 1.7, 8), dark); body.position.y = 1.35; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), pale); head.scale.set(0.9, 1.5, 0.9); head.position.y = 2.42; g.add(head); g.userData.head = head;
    const eyeM = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
    [-0.07, 0.07].forEach(x => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), eyeM); e.position.set(x, 2.46, -0.17); g.add(e); });
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.02), new THREE.MeshBasicMaterial({ color: 0x000000 })); mouth.position.set(0, 2.28, -0.18); g.add(mouth);
    const arms = []; [-1, 1].forEach(sx => { const a = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.035, 1.55, 6), dark); a.position.set(sx * 0.3, 1.45, 0); a.rotation.z = sx * 0.12; g.add(a); arms.push(a); });
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.06, 0.6, 6), dark); legs.position.y = 0.3; g.add(legs);
    g.userData.arms = arms; g.userData.mats = [dark, pale]; return g;
  }

  /* ---------- start / restart ---------- */
  G.start = (fromCheckpoint = false) => {
    G.init(); A.init();
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000); scene.fog = new THREE.FogExp2(0x000000, 0.085);
    camera = new THREE.PerspectiveCamera(touch ? 78 : 72, innerWidth / innerHeight, 0.05, 90);
    ambient = new THREE.AmbientLight(0x2a2a3a, 0.32); scene.add(ambient);
    scene.add(camera);
    spot = new THREE.SpotLight(0xfff3dc, 2.3, 28, 0.52, 0.55, 1.1); spot.position.set(0.18, -0.12, 0.1); camera.add(spot); spotTarget = new THREE.Object3D(); spotTarget.position.set(0, -0.3, -5); camera.add(spotTarget); spot.target = spotTarget;
    L.build(scene);
    const sp = L.find('S')[0], p0 = L.center(sp.c, sp.r);
    const cp = fromCheckpoint ? loadSave()?.checkpoint : null;
    s = {
      t: 0, stage: 'enter', flags: {}, active: 0, sibs: SIB.map((d, i) => ({ ...d, x: p0.x + (i - 1) * 0.7, z: p0.z + 0.8, yaw: Math.PI, pitch: 0, cd: 0, mesh: null })),
      hist: [], light: true, battery: 100, stamina: 1, hidden: null, dead: false, over: false, unmaskUntil: 0, resonanceUntil: 0, codeTries: 0, bob: 0, stepT: 0, said: {}, chatT: 25, keypad: false,
    };
    if (cp) { Object.assign(s.flags, cp.flags); s.stage = cp.stage; s.sibs.forEach((b, i) => { b.x = cp.x + (i - 1) * 0.6; b.z = cp.z + (i ? 0.7 : 0); }); applyFlags(); }
    s.sibs.forEach(b => { b.mesh = sibMesh(b); scene.add(b.mesh); });
    enemyMesh = hollowMesh(); scene.add(enemyMesh);
    shadowMesh = hollowMesh(); shadowMesh.visible = false; scene.add(shadowMesh);
    const h = L.find('H')[0], hp = L.center(h.c, h.r);
    s.enemy = { x: hp.x, z: hp.z, yaw: 0, state: 'dormant', path: null, pi: 0, t: s.flags.fuseTaken ? 2 : 40, see: 0, lastSeen: null, repath: 0, stag: 0, sawHide: false, stepT: 0, contact: -99, manifestT: 0 };
    if (s.flags.fuseTaken) { s.enemy.state = 'patrol'; placeEnemyAway(24); s.enemy.contact = 8; wander(); }
    enemyMesh.visible = s.enemy.state !== 'dormant';
    D.reset(); s.over = false; running = true; stats.started = performance.now();
    T13.ui.hud(true); T13.ui.obj(objectiveText()); updateTeam();
    last = performance.now(); requestAnimationFrame(loop);
    if (!cp) setTimeout(() => say('gabriel', 'Stay close. Nobody wanders off.'), 1500);
    else say(s.sibs[0].id, 'We go again. Quietly this time.');
  };
  G.stop = () => { running = false; T13.ui.hud(false); };
  G.isRunning = () => running;

  function applyFlags() {
    if (s.flags.cabinetMoved) L.st.cabinetMoved = true;
    if (s.flags.falseGone) L.st.falseGone = true;
    L.objects.forEach(o => { const k = o.userData.kind; if (k === 'cabinet' && s.flags.cabinetMoved) knockCabinet(o, true); if (k === 'falsewall' && s.flags.falseGone) o.visible = false; if (k === 'fuse' && s.flags.fuseTaken) o.userData.item.visible = false; });
    if (s.flags.power) powerOn(true);
  }
  function checkpoint(stage) { s.stage = stage; const a = cur(); writeSave({ ...(loadSave() || {}), checkpoint: { stage, flags: { ...s.flags }, x: a.x, z: a.z }, at: Date.now() }); T13.ui.obj(objectiveText()); T13.ui.toast('Checkpoint'); }
  function objectiveText() { const O = CASE.objectives, f = s.flags; if (f.escaped) return ''; if (f.power) return O.exit; if (f.fuseTaken) return O.hunt; if (f.cabinetMoved) return O.fuse; if (f.cabinetSeen) return O.blocked; if (f.fuseboxSeen) return O.fusebox; return O.enter; }

  const cur = () => s.sibs[s.active];
  const say = (id, text, ms) => { const b = SIB.find(x => x.id === id); T13.ui.sub(text, b ? b.name.toUpperCase() : id, b ? b.css : '#bbb', ms); };
  const once = (k, fn) => { if (s.said[k]) return; s.said[k] = 1; fn(); };
  function updateTeam() { T13.ui.team(s.sibs.map(b => ({ name: b.name, css: b.css, power: b.power, cd: Math.max(0, Math.ceil(b.cd)) })), s.active); }

  /* ---------- movement / collision ---------- */
  function collide(e, nx, nz, rad = RAD) {
    const ok = (x, z) => { for (const [ox, oz] of [[-rad, -rad], [rad, -rad], [-rad, rad], [rad, rad]]) { const [c, r] = L.cell(x + ox, z + oz); if (L.blocked(c, r)) return false; } return true; };
    if (ok(nx, e.z)) e.x = nx; if (ok(e.x, nz)) e.z = nz;
  }
  G.noise = (x, z, radius) => { const e = s.enemy; if (!e || e.state === 'dormant' || e.state === 'hunt' || e.state === 'stagger' || e.state === 'flee') return; if (Math.hypot(e.x - x, e.z - z) < radius) goTo(x, z, 'investigate'); };

  /* ---------- the Hollow ---------- */
  function placeEnemyAway(minD) {
    const a = cur(), cells = L.floorCells().filter(([c, r]) => { const p = L.center(c, r); return Math.hypot(p.x - a.x, p.z - a.z) > minD && !L.los(a.x, a.z, p.x, p.z); });
    const [c, r] = cells[Math.floor(Math.random() * cells.length)] || [22, 7]; const p = L.center(c, r); s.enemy.x = p.x; s.enemy.z = p.z;
  }
  function goTo(x, z, state) { const e = s.enemy, from = L.cell(e.x, e.z), to = L.cell(x, z), p = L.path(from, to); if (!p) return false; e.path = p; e.pi = 1; e.state = state; return true; }
  function wander() { const cells = L.floorCells(), a = cur(); let pick; for (let i = 0; i < 8; i++) { pick = cells[Math.floor(Math.random() * cells.length)]; const p = L.center(...pick); if (Math.hypot(p.x - a.x, p.z - a.z) < 40) break; } const p = L.center(...pick); goTo(p.x, p.z, 'patrol'); }
  function canSee() {
    const e = s.enemy, a = cur(); if (s.hidden) return false;
    const d = Math.hypot(e.x - a.x, e.z - a.z), range = (s.light ? 16 : 8) * (input.crouch ? 0.6 : 1) * (s.flags.power ? 1.25 : 1) * (s.flags.fuseTaken ? 1.2 : 1);
    if (d > range) return false; return L.los(e.x, e.z, a.x, a.z);
  }
  function updateEnemy(dt) {
    const e = s.enemy, a = cur();
    if (e.state === 'dormant') { e.t -= dt; if (e.t <= 0) { placeEnemyAway(16); e.state = 'patrol'; enemyMesh.visible = true; wander(); } return; }
    if (e.state === 'stagger') { e.stag -= dt; if (e.stag <= 0) { e.state = 'hunt'; e.lastSeen = { x: a.x, z: a.z }; } return; }
    const seen = canSee(); const d = Math.hypot(e.x - a.x, e.z - a.z);
    if (seen) { if (e.state !== 'hunt' && e.state !== 'flee') { A.sting(); A.growl(e.x, 1.8, e.z); D.bump(0.35); T13.ui.flash(0.2); once('firstHunt', () => setTimeout(() => say('gabriel', 'RUN. Find somewhere to hide!'), 400)); } if (e.state !== 'flee') e.state = 'hunt'; e.lastSeen = { x: a.x, z: a.z }; e.contact = s.t; }
    // lockers: it only finds you if it watched you climb in
    if (s.hidden && e.state === 'hunt' && e.sawHide && d < 2.2) return die('It watched you hide.');
    if (!s.hidden && d < 1.05 && e.state !== 'flee') return die();
    // after the fuse is taken it senses the team every so often
    if (s.flags.fuseTaken && !s.flags.power && (e.state === 'patrol') && s.t - e.contact > 22) { e.contact = s.t; goTo(a.x, a.z, 'investigate'); }
    // re-manifest elsewhere when it has lost you for a long time (it can appear anywhere — it is not a person)
    if (e.state === 'patrol' && s.t - e.contact > 45 && !s.flags.fuseTaken) { e.contact = s.t; placeEnemyAway(14); wander(); }
    e.repath -= dt;
    if (e.state === 'hunt' && e.repath <= 0) { e.repath = 0.45; const tg = e.lastSeen; if (tg) goTo(tg.x, tg.z, 'hunt'); if (!seen && tg && Math.hypot(e.x - tg.x, e.z - tg.z) < 1.2) { e.state = 'search'; e.t = 7; } }
    if (e.state === 'search') { e.t -= dt; if (e.t <= 0) wander(); else if (!e.path || e.pi >= e.path.length) { const p = L.center(...L.cell(e.x, e.z)); goTo(p.x + (Math.random() - 0.5) * 9, p.z + (Math.random() - 0.5) * 9, 'search'); } }
    if (e.state === 'flee') { e.t -= dt; if (e.t <= 0) wander(); }
    if ((e.state === 'patrol' || e.state === 'investigate') && (!e.path || e.pi >= e.path.length)) { if (e.state === 'investigate') { e.state = 'search'; e.t = 5; } else wander(); }
    // follow path
    const sp = { patrol: 1.35, investigate: 2.2, search: 1.6, hunt: s.flags.fuseTaken ? 3.7 : 3.6, flee: 4.5 }[e.state] || 1.4;
    if (e.path && e.pi < e.path.length) {
      const [c, r] = e.path[e.pi]; const door = L.doorAt(c, r); if (door && !door.userData.open) { setDoor(door, true, true); e.wait = 0.9; }
      if (e.wait > 0) { e.wait -= dt; return; }
      const tp = L.center(c, r); const dx = tp.x - e.x, dz = tp.z - e.z, dd = Math.hypot(dx, dz);
      const direct = e.state === 'hunt' && seen && d < S * 1.2;
      if (direct) { const k = Math.min(1, sp * dt / Math.max(d, 0.001)); e.x += (a.x - e.x) * k; e.z += (a.z - e.z) * k; e.yaw = Math.atan2(-(a.x - e.x), -(a.z - e.z)); }
      else if (dd < 0.15) e.pi++; else { const k = Math.min(dd, sp * dt); e.x += dx / dd * k; e.z += dz / dd * k; e.yaw = Math.atan2(-dx, -dz); }
      e.stepT -= dt * sp; if (e.stepT <= 0) { e.stepT = 1.25; A.step(e.x, 0.2, e.z, true, e.state === 'hunt' ? 0.5 : 0.3); }
    }
  }
  function die(why) {
    if (s.dead) return; s.dead = true; stats.deaths++; const a = cur(), e = s.enemy;
    // it lunges into your face
    const f = new THREE.Vector3(0, 0, -0.75).applyQuaternion(camera.quaternion); enemyMesh.position.set(camera.position.x + f.x, camera.position.y - 2.35, camera.position.z + f.z); enemyMesh.rotation.y = s.sibs[s.active].yaw; enemyMesh.visible = true;
    A.sting(); A.growl(a.x, 1.6, a.z); T13.ui.flash(0.9);
    setTimeout(() => { running = false; T13.ui.hud(false); T13.ui.over('THE HOLLOW TOOK ' + a.name.toUpperCase(), (why ? why + ' ' : '') + 'It copies what it hears. Next time: listen first, keep the light low, and don’t let it see where you hide.'); }, 1100);
    void e;
  }

  /* ---------- doors / world objects ---------- */
  function setDoor(d, open, slam = false) { if (d.userData.open === open) return; d.userData.open = open; const p = L.center(d.userData.c, d.userData.r); A.door(p.x, 1.5, p.z, slam); if (slam) D.bump(0.12); }
  function knockCabinet(o, instant) { o.userData.fallen = true; if (instant) { o.rotation.z = Math.PI / 2; o.position.y = 0.8; o.position.x += 1.7; } else o.userData.fallT = 0; }
  function powerOn(silent) {
    s.flags.power = true; L.lamps.forEach(l => { l.pl.intensity = 0.55; l.bulb.material.color.set(0xffe0a8); });
    scene.fog.density = 0.05; ambient.intensity = 0.42;
    L.objects.forEach(o => { if (o.userData.kind === 'fusebox') o.userData.lamp.material.color.set(0x33ff66); if (o.userData.kind === 'exit') o.userData.sign.visible = true; });
    if (!silent) { A.power(true); const e = s.enemy; e.state = 'flee'; e.t = 7; placeEnemyAway(20); wander(); e.state = 'flee'; e.t = 7; }
  }

  /* ---------- interaction ---------- */
  function lookTarget() {
    const a = cur(); let best = null, bd = 99; const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
    for (const o of L.objects) { const { c, r, kind } = o.userData; if (kind === 'falsewall' && s.flags.falseGone) continue; if (kind === 'cabinet' && s.flags.cabinetMoved) continue; if (kind === 'fuse' && s.flags.fuseTaken) continue;
      const p = L.center(c, r), dx = p.x - a.x, dz = p.z - a.z, d = Math.hypot(dx, dz); const reach = kind === 'door' ? 2.6 : 3.6; if (d > reach) continue; const dot = (dx * fx + dz * fz) / (d || 1); if (dot < 0.55) continue; if (d < bd) { bd = d; best = o; } }
    return best;
  }
  const PROMPT = { door: o => o.userData.open ? 'Close door' : 'Open door', locker: () => 'Hide', fusebox: () => s.flags.fuseTaken && !s.flags.power ? 'Put the fuse in' : 'Fuse box', cabinet: () => 'Heavy cabinet', falsewall: () => 'Wall…', fuse: () => 'Take the fuse', musicbox: () => 'Music box', exit: () => 'Exit door' };
  G.act = (what) => {
    if (!s || !running || s.dead) return; A.init();
    if (what === 'switch') return switchTo((s.active + 1) % 3);
    if (what === 'switch1' || what === 'switch2' || what === 'switch3') return switchTo(+what.slice(-1) - 1);
    if (what === 'light') { if (s.hidden) return; s.light = !s.light; A.pickup(); return; }
    if (what === 'crouch') { input.crouch = !input.crouch; return; }
    if (what === 'ability') return ability();
    if (what === 'interact') return interact();
  };
  function switchTo(i) {
    if (i === s.active || s.hidden) return; s.active = i; stats.switches++; s.hist = []; A.ability('switch');
    const b = cur(); T13.ui.toast(`${b.name} — ${b.domain}`); updateTeam();
  }
  function interact() {
    const a = cur();
    if (s.hidden) { const h = s.hidden; s.hidden = null; a.x = h.x; a.z = h.z; A.door(a.x, 1, a.z); return; }
    const o = lookTarget(); if (!o) return; const k = o.userData.kind;
    if (k === 'door') { setDoor(o, !o.userData.open); G.noise(a.x, a.z, 7); return; }
    if (k === 'locker') { const e = s.enemy; e.sawHide = e.state === 'hunt' && canSee() && Math.hypot(e.x - a.x, e.z - a.z) < 8; s.hidden = { x: a.x, z: a.z, o }; stats.hides++; A.door(a.x, 1, a.z); once('hid', () => setTimeout(() => say('mara', '(whispering) Don’t breathe. It hears everything.'), 600)); return; }
    if (k === 'fusebox') {
      if (s.flags.fuseTaken && !s.flags.power) { powerOn(false); T13.ui.flash(0.3); say('daniel', 'Power’s back. Lights hurt it — look, it’s pulling away.'); checkpoint('power'); return; }
      if (s.flags.power) return say(a.id, 'Power’s on. Get to the exit.');
      s.flags.fuseboxSeen = true; T13.ui.obj(objectiveText()); return say('gabriel', 'Main fuse is gone. Someone took it out on purpose.');
    }
    if (k === 'cabinet') { s.flags.cabinetSeen = true; T13.ui.obj(objectiveText()); if (a.id === 'gabriel') return say('gabriel', 'Stand back. I can move this. [✦ / Q]'); return say(a.id === 'mara' ? 'mara' : 'daniel', 'Too heavy. Gabriel could shift it — switch to him. [⇄ / Tab]'); }
    if (k === 'falsewall') { if (a.id === 'daniel') return say('daniel', 'This wall is wrong. The plaster doesn’t match the plan. Let me look properly. [✦ / Q]'); return say(a.id, a.id === 'mara' ? 'Daniel keeps staring at this wall.' : 'Just a wall… right?'); }
    if (k === 'musicbox') { s.flags.musicbox = true; if (a.id === 'mara') { A.ability('mara'); T13.ui.flash(0.12); return say('mara', 'I can hear her. A nurse, running, counting the wards out loud — four… one… three…', 6500); } return say(a.id, 'An old music box. Mara should touch this, not me.'); }
    if (k === 'fuse') { o.userData.item.visible = false; s.flags.fuseTaken = true; A.pickup(); A.staticBurst(); A.growl(s.enemy.x, 1.8, s.enemy.z); D.bump(0.4); T13.ui.flash(0.25);
      const e = s.enemy; if (e.state === 'dormant') { e.state = 'patrol'; enemyMesh.visible = true; placeEnemyAway(14); } goTo(a.x, a.z, 'investigate');
      say('mara', 'Oh no. It felt that. It’s coming — back to the fuse box, now!'); checkpoint('fuseTaken'); return; }
    if (k === 'exit') { if (!s.flags.power) return say('daniel', 'Electronic lock. No power, no exit.'); s.keypad = true; T13.ui.keypad(true); return; }
  }
  G.tryCode = (code) => {
    if (code === CASE.code) { s.keypad = false; T13.ui.keypad(false); escape(); return true; }
    s.codeTries++; A.error(); G.noise(cur().x, cur().z, 10);
    if (s.codeTries === 3) setTimeout(() => say('mara', 'Wait — I can still hear that nurse. She was counting the wards: four, one, three.', 6000), 500);
    return false;
  };
  G.closeKeypad = () => { s.keypad = false; };
  function escape() {
    s.flags.escaped = true; running = false; A.power(false); D.releaseUntil = 1e9;
    const save = loadSave() || {}; save.prologueDone = true; save.xp = (save.xp || 0) + 250; save.films = Array.from(new Set([...(save.films || []), 'case-0', 'family-1'])); delete save.checkpoint; writeSave(save);
    T13.ui.hud(false);
    T13.ui.cinematic([['', 'You step out into the cold.'], ['', CASE.breadcrumb], ['GABRIEL', 'That’s Lantern’s mark. Dad’s mark.'], ['DANIEL', 'Or something that knows it.'], ['MARA', 'It’s him. I’d know it anywhere.']], { mandatory: 3, who: 'LANTERN · AFTER' }, () =>
      T13.ui.over('PROLOGUE COMPLETE', `+250 XP · Theater unlocked: Prologue case film and Family film 1. Deaths: ${stats.deaths} · hides: ${stats.hides} · switches: ${stats.switches}. Case I is next.`, 'complete'));
  }

  /* ---------- powers ---------- */
  function ability() {
    const a = cur(); if (a.cd > 0 || s.hidden) return A.error(); A.ability(a.id); stats.powers[a.id]++;
    const e = s.enemy, d = Math.hypot(e.x - a.x, e.z - a.z), fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
    if (a.id === 'mara') {
      a.cd = a.cd || SIB[0].cd; s.resonanceUntil = s.t + 6;
      if (e.state !== 'dormant' && d < 7 && e.state === 'hunt') { e.state = 'flee'; e.t = 6; placeEnemyAway(16); wander(); e.state = 'flee'; e.t = 6; say('mara', 'GET OUT OF MY HEAD— there. I pushed it away. It won’t work twice in a row.'); }
      else if (e.state === 'dormant') say('mara', 'Nothing yet. But something is waiting in this building.');
      else { A.whisper(e.x, 1.6, e.z); say('mara', d < 12 ? 'It’s close. Right there.' : 'I can feel where it is. Follow the whisper.'); }
      return;
    }
    if (a.id === 'gabriel') {
      a.cd = SIB[1].cd; T13.ui.flash(0.1);
      const cab = L.objects.find(o => o.userData.kind === 'cabinet'); const cp = cab && L.center(cab.userData.c, cab.userData.r);
      if (cab && !s.flags.cabinetMoved && Math.hypot(cp.x - a.x, cp.z - a.z) < 6.5 && L.los(a.x, a.z, cp.x - Math.sign(cp.x - a.x) * 1.6, cp.z)) { s.flags.cabinetMoved = true; L.st.cabinetMoved = true; knockCabinet(cab, false); A.door(cp.x, 1, cp.z, true); G.noise(cp.x, cp.z, 18); say('gabriel', 'There. The east ward’s open.'); checkpoint('cabinet'); once('wardwarn', () => setTimeout(() => say('mara', 'Careful. That room isn’t empty.'), 2500)); return; }
      if (e.state !== 'dormant' && d < 5.5 && ((e.x - a.x) * fx + (e.z - a.z) * fz) / d > 0.5) { e.state = 'stagger'; e.stag = 3.5; collideEnemyBack(e, fx, fz); A.growl(e.x, 1.8, e.z); say('gabriel', 'GO! I can’t hold it long!'); return; }
      // shove the nearest door
      const door = L.doors.find(dd => { const p = L.center(dd.userData.c, dd.userData.r); return Math.hypot(p.x - a.x, p.z - a.z) < 3.2; }); if (door) { setDoor(door, !door.userData.open, true); G.noise(a.x, a.z, 12); }
      return;
    }
    if (a.id === 'daniel') {
      a.cd = SIB[2].cd; s.unmaskUntil = s.t + 8;
      const fw = L.objects.find(o => o.userData.kind === 'falsewall'); const wp = fw && L.center(fw.userData.c, fw.userData.r);
      if (fw && !s.flags.falseGone && Math.hypot(wp.x - a.x, wp.z - a.z) < 7) { s.flags.falseGone = true; L.st.falseGone = true; fw.userData.fade = 1; say('daniel', 'It was never a wall. It was a picture of one.'); A.whisper(wp.x, 1.6, wp.z); T13.ui.obj(objectiveText()); return; }
      say('daniel', 'Looking at what’s actually here…');
      return;
    }
  }
  function collideEnemyBack(e, fx, fz) { for (let i = 0; i < 12; i++) { const nx = e.x + fx * 0.25, nz = e.z + fz * 0.25, [c, r] = L.cell(nx, nz); if (L.blocked(c, r, true)) break; e.x = nx; e.z = nz; } }

  /* ---------- director events ---------- */
  function fire(ev) {
    const a = cur(), e = s.enemy, back = { x: a.x + Math.sin(a.yaw) * 6, z: a.z + Math.cos(a.yaw) * 6 };
    const unmasked = s.t < s.unmaskUntil;
    if (ev === 'creak') return A.creak(a.x + (Math.random() - 0.5) * 16, 2.8, a.z + (Math.random() - 0.5) * 16);
    if (ev === 'step_far') return A.step(a.x + (Math.random() - 0.5) * 24, 0.2, a.z + (Math.random() - 0.5) * 24, true, 0.18);
    if (ev === 'step_near') { A.step(back.x, 0.2, back.z, false, 0.35); setTimeout(() => A.step(back.x + 0.4, 0.2, back.z + 0.4, false, 0.35), 450); return; }
    if (ev === 'whisper') return A.whisper(back.x, 1.6, back.z);
    if (ev === 'door_far' || ev === 'door_slam') { const ds = L.doors.map(d => ({ d, p: L.center(d.userData.c, d.userData.r) })).filter(x => { const dd = Math.hypot(x.p.x - a.x, x.p.z - a.z); return dd > 5 && dd < 22; }); const pick = ds[Math.floor(Math.random() * ds.length)]; if (pick) setDoor(pick.d, !pick.d.userData.open, ev === 'door_slam'); return; }
    if (ev === 'flicker') { s.flickerUntil = s.t + 1.2; return; }
    if (ev === 'radio') { A.staticBurst(); return T13.ui.sub('… kkssh … not your father … kssh …', 'RADIO', '#8d8573', 3000); }
    if (ev === 'false_voice') {
      const others = s.sibs.filter((_, i) => i !== s.active), who = others[Math.floor(Math.random() * 2)], line = ['Over here…', 'Come here. I found something.', 'Why did you leave me?'][Math.floor(Math.random() * 3)];
      if (!A.falseVoice(line)) A.whisper(back.x, 1.6, back.z);
      T13.ui.sub(`“${line}”${unmasked ? '  — COUNTERFEIT' : ''}`, who.name.toUpperCase() + '?', who.css, 3200);
      setTimeout(() => say(who.id, 'That wasn’t me. I’m right here.'), 2600); return;
    }
    if (ev === 'shadow') {
      const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw); for (let dist = 13; dist > 6; dist -= 1.5) { const x = a.x + fx * dist, z = a.z + fz * dist, [c, r] = L.cell(x, z); if (!L.blocked(c, r) && L.los(a.x, a.z, x, z)) { shadowMesh.position.set(x, 0, z); shadowMesh.rotation.y = a.yaw + Math.PI; shadowMesh.visible = true; s.shadowUntil = s.t + 0.4; if (unmasked) T13.ui.sub('Not real. A picture of it.', 'DANIEL', SIB[2].css, 2000); return; } }
      return;
    }
    if (ev === 'silence') { D.silenceUntil = s.t + 6; return; }
    void e;
  }

  /* ---------- per-frame ---------- */
  function loop(now) {
    if (!running) return; requestAnimationFrame(loop);
    now = performance.now(); const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; if (s.keypad || T13.ui.paused()) { renderer.render(scene, camera); return; }
    s.t += dt; const a = cur();
    // look
    a.yaw -= input.dx * 0.0032; a.pitch = Math.max(-1.25, Math.min(1.25, a.pitch - input.dy * 0.0032)); input.dx = input.dy = 0;
    // move
    let moving = false;
    if (!s.hidden && !s.dead) {
      const len = Math.hypot(input.mx, input.mz); if (len > 0.08) {
        const want = input.run && !input.crouch && s.stamina > 0.05, sp = (input.crouch ? 1.35 : want ? 4.5 : 2.5) * Math.min(1, len);
        const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw), rx = Math.cos(a.yaw), rz = -Math.sin(a.yaw);
        const vx = (fx * -input.mz + rx * input.mx) / Math.max(1, len), vz = (fz * -input.mz + rz * input.mx) / Math.max(1, len);
        collide(a, a.x + vx * sp * dt, a.z + vz * sp * dt); moving = true;
        if (want) s.stamina = Math.max(0, s.stamina - dt / 7); 
        s.stepT -= dt * sp; if (s.stepT <= 0) { s.stepT = 1.5; A.myStep(want, input.crouch); G.noise(a.x, a.z, input.crouch ? 1.5 : want ? 13 : 5); }
        const lh = s.hist[s.hist.length - 1]; if (!lh || Math.hypot(lh.x - a.x, lh.z - a.z) > 0.3) { s.hist.push({ x: a.x, z: a.z }); if (s.hist.length > 60) s.hist.shift(); }
      }
    }
    if (!(moving && input.run)) s.stamina = Math.min(1, s.stamina + dt / 9);
    s.bob += moving ? dt * (input.run ? 11 : 7) : 0;
    // companions follow the breadcrumb trail
    let k = 0; s.sibs.forEach((b, i) => { if (i === s.active) { b.mesh.visible = false; return; } k++; b.mesh.visible = !s.hidden;
      const tgt = s.hist[s.hist.length - 1 - k * 5] || s.hist[0]; if (tgt) { const dx = tgt.x - b.x, dz = tgt.z - b.z, dd = Math.hypot(dx, dz); if (dd > 0.6) { const spd = Math.min(dd * 2.2, 5); collide(b, b.x + dx / dd * spd * dt, b.z + dz / dd * spd * dt, 0.25); b.yaw = Math.atan2(-dx, -dz); } }
      else if (Math.hypot(b.x - a.x, b.z - a.z) > 9) { b.x = a.x + (k - 1.5) * 0.6; b.z = a.z + 0.7; }
      if (s.hidden) { b.x = s.hidden.x; b.z = s.hidden.z; }
      b.mesh.position.set(b.x, 0, b.z); b.mesh.rotation.y = b.yaw; b.mesh.userData.lamp.intensity = s.flags.power ? 0.3 : (s.light ? 0.75 : 0); });
    // cooldowns
    s.sibs.forEach(b => { if (b.cd > 0) b.cd = Math.max(0, b.cd - dt); });
    // enemy
    if (!s.dead) updateEnemy(dt);
    const e = s.enemy;
    if (!s.dead) { enemyMesh.position.set(e.x, 0, e.z); enemyMesh.rotation.y = e.yaw + Math.sin(s.t * 13) * 0.04; enemyMesh.userData.head.rotation.z = Math.sin(s.t * 1.7) * 0.35 + (e.state === 'hunt' ? Math.sin(s.t * 31) * 0.12 : 0);
      enemyMesh.userData.arms.forEach((ar, i) => { ar.rotation.x = Math.sin(s.t * (e.state === 'hunt' ? 9 : 3) + i * Math.PI) * 0.5; }); }
    const resonance = s.t < s.resonanceUntil; enemyMesh.traverse(m => { if (m.material) { m.material.depthTest = !resonance; m.renderOrder = resonance ? 5 : 0; } }); enemyMesh.userData.mats[0].emissive.setHex(resonance ? 0x331040 : 0x000000);
    // unmask: hidden writing, false wall shimmer
    const unmasked = s.t < s.unmaskUntil; L.hiddenDecals.forEach(dc => { dc.material.opacity += ((unmasked ? 1 : 0) - dc.material.opacity) * Math.min(1, dt * 3); });
    L.objects.forEach(o => { if (o.userData.kind === 'falsewall' && o.visible) { if (o.userData.fade) { o.material.opacity = Math.max(0, o.material.opacity - dt * 0.8); if (o.material.opacity <= 0) o.visible = false; } else o.material.opacity = unmasked ? 0.55 + Math.sin(s.t * 12) * 0.2 : 1; }
      if (o.userData.kind === 'cabinet' && o.userData.fallT !== undefined && o.userData.fallT < 1) { o.userData.fallT = Math.min(1, o.userData.fallT + dt * 2.4); o.rotation.z = o.userData.fallT * Math.PI / 2; o.position.y = 1.3 - o.userData.fallT * 0.5; o.position.x += dt * 4; }
      if (o.userData.kind === 'door') { const tgt = o.userData.base + (o.userData.open ? -Math.PI * 0.5 : 0); o.rotation.y += (tgt - o.rotation.y) * Math.min(1, dt * 7); }
      if (o.userData.kind === 'fuse' && o.userData.item.visible) o.userData.item.rotation.x += dt; });
    if (shadowMesh.visible && s.t > s.shadowUntil) shadowMesh.visible = false;
    // flashlight: battery, flicker near the Hollow
    const dE = e.state === 'dormant' ? 99 : Math.hypot(e.x - a.x, e.z - a.z);
    if (s.light) s.battery = Math.max(0, s.battery - dt * 0.45); else s.battery = Math.min(100, s.battery + dt * 1.2);
    let li = s.light && s.battery > 0 ? 2.3 : 0; if (s.battery < 15 && s.light) li *= Math.random() < 0.15 ? 0.2 : 1; if ((s.flickerUntil && s.t < s.flickerUntil) || (dE < 7 && Math.random() < 0.25)) li *= Math.random() < 0.5 ? 0.05 : 1;
    spot.intensity = s.hidden ? 0 : li;
    if (s.flags.power) L.lamps.forEach((l, i) => { l.pl.intensity = dE < 9 && Math.random() < 0.3 ? 0.05 : 0.55 + Math.sin(s.t * 3 + i) * 0.03; });
    // camera
    let eyeY = input.crouch ? CROUCH_EYE : EYE; let cx = a.x, cz = a.z;
    if (s.hidden) { const lp = L.center(s.hidden.o.userData.c, s.hidden.o.userData.r); cx = lp.x + (s.hidden.x - lp.x) * 0.25; cz = lp.z + (s.hidden.z - lp.z) * 0.25; eyeY = 1.55; }
    camera.position.set(cx, eyeY + Math.sin(s.bob) * 0.035, cz);
    if (!s.dead) camera.rotation.set(a.pitch, a.yaw, 0, 'YXZ');
    A.setListener(cx, eyeY, cz, a.yaw);
    // fear director
    const dir = D.update(dt, { dark: !s.flags.power, dist: dE, hunting: e.state === 'hunt', hidden: !!s.hidden, provoked: !!s.flags.fuseTaken, t: s.t }, fire);
    A.setIntensity(dir.k, dir.silence);
    s.heartT = (s.heartT || 0) - dt; if (dir.k > 0.55 && s.heartT <= 0) { s.heartT = 1.2 - dir.k * 0.6; A.heart(dir.k - 0.4); }
    // contextual teaching lines — the siblings explain themselves, nobody reads a manual
    const near = (kind, dmax) => L.objects.some(o => { if (o.userData.kind !== kind) return false; const p = L.center(o.userData.c, o.userData.r); return Math.hypot(p.x - a.x, p.z - a.z) < dmax; });
    if (!s.flags.cabinetMoved && near('cabinet', 5)) once('cab', () => { s.flags.cabinetSeen = true; T13.ui.obj(objectiveText()); say('gabriel', a.id === 'gabriel' ? 'That cabinet’s blocking the ward. I can move it. [✦ / Q]' : 'That cabinet’s blocking the ward. Let me — switch to me. [⇄ / Tab]'); });
    if (s.flags.cabinetMoved && !s.flags.falseGone && near('falsewall', 5)) once('fw', () => say('daniel', a.id === 'daniel' ? 'That wall doesn’t belong on the plan. Let me look. [✦ / Q]' : 'Hold on. That wall shouldn’t be there. Let me see it — switch to me. [⇄ / Tab]'));
    if (e.state !== 'dormant' && dE < 13 && !s.said.sense) once('sense', () => say('mara', a.id === 'mara' ? 'It’s here. I can feel where it is. [✦ / Q]' : 'It’s here. I can find it if you let me. [⇄ / Tab]'));
    if (near('musicbox', 4) && !s.flags.musicbox) once('mb', () => say('mara', 'That music box… someone held it the night of the fire.'));
    s.chatT -= dt; if (s.chatT <= 0 && !s.hidden) { s.chatT = 30 + Math.random() * 25; const lines = { CALM: [['daniel', 'Fire doors, 1960s. Whatever happened here happened fast.'], ['mara', 'It’s quiet. I hate quiet.']], UNEASY: [['gabriel', 'Something moved. Keep the light low.'], ['daniel', 'Footsteps don’t echo like that in a room this size.']], TENSION: [['mara', 'It’s thinking about us. I can feel it.'], ['gabriel', 'If you see it, don’t run first. Hide first.']], DANGER: [['mara', 'Please. Let’s just go.']], TERROR: [], RELEASE: [['gabriel', 'Breathe. It lost us. For now.']] }[dir.state] || []; const pick = lines.filter(([id]) => id !== a.id)[0] || lines[0]; if (pick) say(pick[0], pick[1]); }
    // HUD
    const tg = s.hidden ? null : lookTarget(); T13.ui.prompt(s.hidden ? 'Leave the locker' : tg ? PROMPT[tg.userData.kind](tg) : '');
    T13.ui.fear(dir.k, dir.state, s.hidden, s.battery, s.stamina, a.cd);
    if ((s.hudT = (s.hudT || 0) - dt) <= 0) { s.hudT = 0.25; updateTeam(); }
    renderer.render(scene, camera);
  }

  G.debug = () => s && ({ t: +s.t.toFixed(1), stage: s.stage, flags: { ...s.flags }, active: cur().id, pos: [+cur().x.toFixed(2), +cur().z.toFixed(2)], enemy: { state: s.enemy.state, x: +s.enemy.x.toFixed(1), z: +s.enemy.z.toFixed(1) }, director: D.state, k: +D.k.toFixed(2), hidden: !!s.hidden, dead: s.dead, battery: Math.round(s.battery), stats });
  G.dev = { teleport: (c, r) => { const p = L.center(c, r); cur().x = p.x; cur().z = p.z; }, face: (yaw) => { cur().yaw = yaw; }, state: () => s };
})();
