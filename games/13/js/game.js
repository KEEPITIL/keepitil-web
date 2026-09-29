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

  G.init = () => { if (renderer) return; renderer = T13.gfx.initRenderer(document.getElementById('view')); };

  const loadSave = () => { try { return JSON.parse(localStorage.getItem('t13-save') || 'null'); } catch (e) { return null; } };
  const writeSave = (o) => { try { localStorage.setItem('t13-save', JSON.stringify(o)); } catch (e) {} };
  G.save = loadSave;

  let hol = null, holShadow = null, hemi = null; const X = T13.gfx;
  /* ---------- start / restart ---------- */
  G.start = (fromCheckpoint = false) => {
    G.init(); A.init();
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x07080b); scene.fog = new THREE.FogExp2(0x0a0b0f, 0.03);
    camera = new THREE.PerspectiveCamera(touch ? 76 : 70, innerWidth / innerHeight, 0.05, X.Q().far); X.cams.add(camera);
    hemi = new THREE.HemisphereLight(X.col(0x8c95a6), X.col(0x3e3428), 0.6); scene.add(hemi); ambient = hemi; X.setLighting('NORMAL'); X.light.cur = { ...X.LS.NORMAL }; X.light.until = 0;
    scene.add(camera);
    spot = new THREE.SpotLight(X.col(0xfff2dc), 2.4, 26, 0.6, 0.5, 1.15); if (X.Q().shadows) { spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0008; spot.shadow.camera.near = 0.2; spot.shadow.camera.far = 20; } spot.position.set(0.18, -0.12, 0.1); camera.add(spot); spotTarget = new THREE.Object3D(); spotTarget.position.set(0, -0.3, -5); camera.add(spotTarget); spot.target = spotTarget;
    L.build(scene);
    const sp = L.find('S')[0], p0 = L.center(sp.c, sp.r);
    const cp = fromCheckpoint ? loadSave()?.checkpoint : null;
    s = {
      t: 0, stage: 'enter', flags: {}, active: 0, sibs: SIB.map((d, i) => ({ ...d, x: p0.x + (i - 1) * 0.7, z: p0.z + 0.8, yaw: Math.PI, pitch: 0, cd: 0, mesh: null })),
      hist: [], light: true, battery: 100, stamina: 1, hidden: null, dead: false, over: false, unmaskUntil: 0, resonanceUntil: 0, codeTries: 0, bob: 0, stepT: 0, said: {}, chatT: 25, keypad: false,
    };
    if (cp) { Object.assign(s.flags, cp.flags); s.stage = cp.stage; s.sibs.forEach((b, i) => { b.x = cp.x + (i - 1) * 0.6; b.z = cp.z + (i ? 0.7 : 0); }); applyFlags(); }
    s.sibs.forEach(b => { b.p = T13.people.build(b.id); b.mesh = b.p.root; scene.add(b.mesh); b.lastX = b.x; b.lastZ = b.z; if (X.tier === 'HIGH') { const cl = new THREE.SpotLight(X.col(0xfff0d0), 0.9, 12, 0.45, 0.6, 1.3); cl.position.set(0.25, 1.25, -0.2); const tg = new THREE.Object3D(); tg.position.set(0.1, 0.9, -5); b.mesh.add(cl, tg); cl.target = tg; b.cl = cl; } });
    s.sounds = [];
    hol = T13.hollow.build(); enemyMesh = hol.root; scene.add(enemyMesh);
    holShadow = T13.hollow.build(); shadowMesh = holShadow.root; shadowMesh.visible = false; scene.add(shadowMesh);
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
  const say = (id, text, ms = 4200, pointAt = null) => { const b = SIB.find(x => x.id === id); T13.ui.sub(text, b ? b.name.toUpperCase() : id, b ? b.css : '#bbb', ms);
    if (s && s.sibs) { const sb = s.sibs.find(x => x.id === id); s.speaker = id; s.speakerUntil = s.t + Math.min(4, ms / 1000); if (sb && sb.p) { sb.p.say(Math.min(3500, text.length * 55)); if (pointAt && s.sibs[s.active] !== sb) { const q = L.center(pointAt[0], pointAt[1]); sb.p.act('point', new THREE.Vector3(q.x, 1.2, q.z)); } } } };
  const heard = (x, y, z) => { if (s && s.sounds) s.sounds.push({ x, y, z, t: s.t }); };
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
    const f = new THREE.Vector3(0, 0, -0.75).applyQuaternion(camera.quaternion); enemyMesh.position.set(camera.position.x + f.x, camera.position.y - 2.35, camera.position.z + f.z); enemyMesh.rotation.y = s.sibs[s.active].yaw; enemyMesh.visible = true; hol.setReveal('full');
    A.sting(); A.growl(a.x, 1.6, a.z); T13.ui.flash(0.9);
    setTimeout(() => { running = false; T13.ui.hud(false); T13.ui.over('THE HOLLOW TOOK ' + a.name.toUpperCase(), (why ? why + ' ' : '') + 'It copies what it hears. Next time: listen first, keep the light low, and don’t let it see where you hide.'); }, 1100);
    void e;
  }

  /* ---------- doors / world objects ---------- */
  function setDoor(d, open, slam = false) { if (d.userData.open === open) return; d.userData.open = open; const p = L.center(d.userData.c, d.userData.r); A.door(p.x, 1.5, p.z, slam); if (slam) D.bump(0.12); }
  function knockCabinet(o, instant) { o.userData.fallen = true; if (instant) { o.rotation.z = Math.PI / 2; o.position.y = 0.8; o.position.x += 1.7; } else o.userData.fallT = 0; }
  function powerOn(silent) {
    s.flags.power = true; X.setLighting('RESTORED'); if (L.fixtureMat.emissive) L.fixtureMat.emissive.set(X.col(0xbfc6c8));
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
      s.flags.fuseboxSeen = true; T13.ui.obj(objectiveText()); return say('gabriel', 'Main fuse is gone. Someone took it out on purpose.', 4200, [2, 3]);
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
    if (ev === 'creak') { const cx2 = a.x + (Math.random() - 0.5) * 16, cz2 = a.z + (Math.random() - 0.5) * 16; heard(cx2, 2.8, cz2); return A.creak(cx2, 2.8, cz2); }
    if (false) return A.creak(a.x + (Math.random() - 0.5) * 16, 2.8, a.z + (Math.random() - 0.5) * 16);
    if (ev === 'step_far') return A.step(a.x + (Math.random() - 0.5) * 24, 0.2, a.z + (Math.random() - 0.5) * 24, true, 0.18);
    if (ev === 'step_near') { heard(back.x, 0.3, back.z); if (Math.random() < 0.5) { const g = s.sibs.find(b => b.id === 'gabriel'); if (g && s.sibs[s.active] !== g) setTimeout(() => say('gabriel', 'Did you hear that?', 2500), 700); } A.step(back.x, 0.2, back.z, false, 0.35); setTimeout(() => A.step(back.x + 0.4, 0.2, back.z + 0.4, false, 0.35), 450); return; }
    if (ev === 'whisper') { heard(back.x, 1.6, back.z); return A.whisper(back.x, 1.6, back.z); }
    if (ev === 'door_far' || ev === 'door_slam') { const ds = L.doors.map(d => ({ d, p: L.center(d.userData.c, d.userData.r) })).filter(x => { const dd = Math.hypot(x.p.x - a.x, x.p.z - a.z); return dd > 5 && dd < 22; }); const pick = ds[Math.floor(Math.random() * ds.length)]; if (pick) { heard(pick.p.x, 1.5, pick.p.z); setDoor(pick.d, !pick.d.userData.open, ev === 'door_slam'); } return; }
    if (ev === 'flicker') { s.flickerUntil = s.t + 1.2; return; }
    if (ev === 'radio') { A.staticBurst(); return T13.ui.sub('… kkssh … not your father … kssh …', 'RADIO', '#8d8573', 3000); }
    if (ev === 'false_voice') {
      const others = s.sibs.filter((_, i) => i !== s.active), who = others[Math.floor(Math.random() * 2)], line = ['Over here…', 'Come here. I found something.', 'Why did you leave me?'][Math.floor(Math.random() * 3)];
      if (!A.falseVoice(line)) A.whisper(back.x, 1.6, back.z);
      T13.ui.sub(`“${line}”${unmasked ? '  — COUNTERFEIT' : ''}`, who.name.toUpperCase() + '?', who.css, 3200);
      setTimeout(() => say(who.id, 'That wasn’t me. I’m right here.'), 2600); return;
    }
    if (ev === 'blackout') { X.setLighting('BLACKOUT', 3.5 + Math.random() * 3); A.power(false); heard(a.x, 2.8, a.z); setTimeout(() => say('gabriel', 'Lights! Stay together — don’t move.', 3000), 500); if (e.state !== 'dormant' && e.state !== 'hunt' && Math.random() < 0.5) goTo(a.x, a.z, 'investigate'); return; }
    if (ev === 'shadow') {
      // a partial reveal: sometimes a silhouette, sometimes limbs round a doorframe, a face at a corner, a figure in a window — sometimes nothing
      const kind = ['shadow', 'limbs', 'face', 'window', 'nothing'][Math.floor(Math.random() * 5)]; if (kind === 'nothing') return;
      const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw), show = (x, z, mode, secs, yaw) => { shadowMesh.position.set(x, 0, z); shadowMesh.rotation.y = yaw; holShadow.setReveal(mode); shadowMesh.visible = true; s.shadowUntil = s.t + secs; heard(x, 1.8, z); if (unmasked) T13.ui.sub('Not real. A picture of it.', 'DANIEL', SIB[2].css, 2000); };
      if (kind === 'window') { const w = (L.windows || []).map(g => ({ g, d: Math.hypot(g.position.x - a.x, g.position.z - a.z) })).filter(o => o.d > 3 && o.d < 14 && L.los(a.x, a.z, o.g.position.x - Math.sin(o.g.rotation.y) * 0.4, o.g.position.z - Math.cos(o.g.rotation.y) * 0.4)).sort((p, q) => p.d - q.d)[0];
        if (w) { const out = new THREE.Vector3(0, 0, -0.9).applyAxisAngle(new THREE.Vector3(0, 1, 0), w.g.rotation.y); show(w.g.position.x + out.x, w.g.position.z + out.z, 'shadow', 0.7, w.g.rotation.y); } return; }
      if (kind === 'limbs') { const d = L.doors.map(dd => ({ dd, p: L.center(dd.userData.c, dd.userData.r) })).filter(o => { const dist = Math.hypot(o.p.x - a.x, o.p.z - a.z); return dist > 5 && dist < 13 && L.los(a.x, a.z, o.p.x, o.p.z) && ((o.p.x - a.x) * fx + (o.p.z - a.z) * fz) / dist > 0.6; })[0];
        if (d) { if (!d.dd.userData.open) setDoor(d.dd, true); show(d.p.x + fz * 0.9, d.p.z - fx * 0.9, 'limbs', 1.1, a.yaw + Math.PI); } return; }
      for (let dist = 13; dist > 6; dist -= 1.5) { const x = a.x + fx * dist, z = a.z + fz * dist, [c, r] = L.cell(x, z); if (!L.blocked(c, r) && L.los(a.x, a.z, x, z)) { show(x, z, kind === 'face' ? 'face' : 'shadow', kind === 'face' ? 0.6 : 0.45, a.yaw + Math.PI); if (kind === 'face') shadowMesh.position.y = -0.4; return; } }
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
    // companions: follow the breadcrumb trail, and BEHAVE — look at sounds, at whoever talks, at you, at the Hollow
    const e = s.enemy, V3 = THREE.Vector3, camPos = new V3(a.x, (input.crouch ? CROUCH_EYE : EYE), a.z);
    const holVis = e.state !== 'dormant' && enemyMesh.visible && Math.hypot(e.x - a.x, e.z - a.z) < 16 && L.los(a.x, a.z, e.x, e.z);
    s.sounds = s.sounds.filter(q => s.t - q.t < 3.5);
    let k = 0; s.sibs.forEach((b, i) => {
      if (i === s.active) { b.mesh.visible = false; return; } k++; b.mesh.visible = !s.hidden;
      const tgt = s.hist[s.hist.length - 1 - k * 5] || s.hist[0];
      if (b.faceCam) { /* capture pose */ }
      else if (tgt) { const dx = tgt.x - b.x, dz = tgt.z - b.z, dd = Math.hypot(dx, dz); if (dd > 0.6) { const spd = Math.min(dd * 2.2, 5); collide(b, b.x + dx / dd * spd * dt, b.z + dz / dd * spd * dt, 0.25); b.yaw = Math.atan2(-dx, -dz); } }
      else if (Math.hypot(b.x - a.x, b.z - a.z) > 9) { b.x = a.x + (k - 1.5) * 0.6; b.z = a.z + 0.7; }
      // back away from the Hollow when it is close and seen
      const de = Math.hypot(e.x - b.x, e.z - b.z), seesIt = holVis && de < 14 && L.los(b.x, b.z, e.x, e.z);
      if (seesIt && de < 6 && !b.faceCam) { collide(b, b.x - (e.x - b.x) / de * 2.2 * dt, b.z - (e.z - b.z) / de * 2.2 * dt, 0.25); }
      if (s.hidden) { b.x = s.hidden.x; b.z = s.hidden.z; }
      const moved = Math.hypot(b.x - b.lastX, b.z - b.lastZ) / Math.max(dt, 1e-4); b.lastX = b.x; b.lastZ = b.z;
      // what to look at, and how to feel about it
      let look = null, expr = 'neutral';
      if (seesIt) { look = new V3(e.x, 2.2, e.z); expr = de < 7 ? 'fear' : 'concern'; if (!b.sawHollow) { b.sawHollow = true; b.p.act('flinch'); } if (de < 5) b.p.act('guard'); }
      else { b.sawHollow = false;
        if (s.speaker && s.t < s.speakerUntil) { look = s.speaker === b.id ? camPos : (s.sibs.find(o => o.id === s.speaker && o !== s.sibs[s.active])?.p.head.getWorldPosition(new V3()) || camPos); }
        else if (s.sounds.length) { const q = s.sounds[s.sounds.length - 1]; look = new V3(q.x, q.y, q.z); expr = 'concern'; }
        else if (b.faceCam || ((s.t + i * 3.7) % 11) < 2.5) look = camPos; }
      if (e.state === 'hunt' && !seesIt) expr = 'fear';
      if (b.faceCam) { b.yaw = Math.atan2(-(a.x - b.x), -(a.z - b.z)); look = camPos; }
      b.p.lookAt(look); b.p.setExpr(b.exprOverride && s.t < b.exprUntil ? b.exprOverride : expr);
      b.mesh.position.set(b.x, 0, b.z); b.mesh.rotation.y = b.yaw;
      b.p.update(dt, { speed: b.faceCam ? 0 : moved, crouch: input.crouch, lightOn: s.light && !s.flags.power, afraid: expr === 'fear' });
      if (b.cl) b.cl.intensity = s.light && !s.flags.power && !s.hidden ? 0.9 : 0;
    });
    // cooldowns
    s.sibs.forEach(b => { if (b.cd > 0) b.cd = Math.max(0, b.cd - dt); });
    // enemy
    const ex0 = e.x, ez0 = e.z;
    if (!s.dead) updateEnemy(dt);
    const eSpeed = Math.hypot(e.x - ex0, e.z - ez0) / Math.max(dt, 1e-4);
    if (e.state !== 'dormant' && eSpeed > 0.5 && (s.soundT = (s.soundT || 0) - dt) <= 0) { s.soundT = 1.2; s.sounds.push({ x: e.x, y: 0.5, z: e.z, t: s.t }); }
    const dE = e.state === 'dormant' ? 99 : Math.hypot(e.x - a.x, e.z - a.z);
    if (!s.dead) {
      enemyMesh.position.set(e.x, 0, e.z); enemyMesh.rotation.y = e.yaw;
      // do not reveal it fully all the time: far away it is a silhouette; in the beam, close, or hunting it is all there
      const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw), inBeam = s.light && dE < 11 && ((e.x - a.x) * fx + (e.z - a.z) * fz) / Math.max(dE, 0.01) > 0.8;
      const want = e.state === 'hunt' || e.state === 'stagger' || inBeam || dE < 5 || s.forceReveal === 'full' ? 'full' : 'shadow';
      if (hol.mode !== want) hol.setReveal(want);
      hol.update(dt, { speed: eSpeed, hunting: e.state === 'hunt', stagger: e.state === 'stagger' });
    }
    const resonance = s.t < s.resonanceUntil; enemyMesh.traverse(m => { if (m.material) { m.material.depthTest = !resonance; m.renderOrder = resonance ? 5 : 0; } });
    // unmask: hidden writing, false wall shimmer
    const unmasked = s.t < s.unmaskUntil; L.hiddenDecals.forEach(dc => { dc.material.opacity += ((unmasked ? 1 : 0) - dc.material.opacity) * Math.min(1, dt * 3); });
    L.objects.forEach(o => { if (o.userData.kind === 'falsewall' && o.visible) { const ms = o.userData.mats || []; if (o.userData.fade) { o.userData.op = Math.max(0, (o.userData.op ?? 1) - dt * 0.8); if (o.userData.op <= 0) o.visible = false; } else o.userData.op = unmasked ? 0.55 + Math.sin(s.t * 12) * 0.2 : 1; ms.forEach(m => { m.opacity = o.userData.op; }); }
      if (o.userData.kind === 'cabinet' && o.userData.fallT !== undefined && o.userData.fallT < 1) { o.userData.fallT = Math.min(1, o.userData.fallT + dt * 2.4); o.rotation.z = o.userData.fallT * Math.PI / 2; o.position.y = 1.25 - o.userData.fallT * 0.65; o.position.x += dt * 4; }
      if (o.userData.kind === 'door') { const tgt = o.userData.base + (o.userData.open ? -Math.PI * 0.5 : 0); o.rotation.y += (tgt - o.rotation.y) * Math.min(1, dt * 7); }
      if (o.userData.kind === 'fuse' && o.userData.item.visible) o.userData.item.rotation.x += dt; });
    if (shadowMesh.visible) { holShadow.update(dt, { speed: 0 }); if (s.t > s.shadowUntil) shadowMesh.visible = false; }
    // LIGHTING STATE → hemisphere, zone lights (each kind has its own behaviour), fog, fixtures
    if (!s.flags.power) X.setLighting(D.state === 'DANGER' || D.state === 'TERROR' ? 'DIM' : 'NORMAL'); else X.setLighting('RESTORED');
    const Lc = X.stepLighting(dt); hemi.intensity = 0.62 * Lc.hemi; scene.fog.density = Lc.fog * (s.hidden ? 1.4 : 1);
    const hollowNear = dE < 9;
    L.lamps.forEach(l => { let f = 1, t = s.t + l.seed;
      if (l.kind === 'fluor') f = Math.random() < 0.02 ? 0.15 : 0.85 + Math.sin(t * 50) * 0.03;
      else if (l.kind === 'emergency') f = s.flags.power ? 0.25 : (Math.sin(t * 2.2) > -0.2 ? 1 : 0.1);
      else if (l.kind === 'clinical') f = (t % 6) < 0.25 ? (Math.random() < 0.5 ? 0.1 : 1) : 1;
      else if (l.kind === 'bulb') { f = 0.9 + Math.sin(t * 1.3) * 0.08; l.pl.position.x = l.bulb.position.x + Math.sin(t * 0.9) * 0.08; }
      if (hollowNear && Math.hypot(l.pl.position.x - e.x, l.pl.position.z - e.z) < 10 && Math.random() < 0.35) f *= 0.1;   // it eats light
      l.pl.intensity = l.base * Lc.zone * f * (s.flags.power && (l.kind === 'fluor' || l.kind === 'clinical') ? 1.3 : 1); if (l.bulb.visible) l.bulb.material.color.setScalar ? null : null; });
    if (L.fixtureMat.emissive) L.fixtureMat.emissive.setScalar(s.flags.power ? 0.75 * Lc.zone : 0.04 * Lc.zone);
    // flashlight: battery, flicker near the Hollow
    if (s.light) s.battery = Math.max(0, s.battery - dt * 0.4); else s.battery = Math.min(100, s.battery + dt * 1.4);
    let li = s.light && s.battery > 0 ? 1.9 : 0; if (s.battery < 15 && s.light) li *= Math.random() < 0.15 ? 0.2 : 1; if ((s.flickerUntil && s.t < s.flickerUntil) || (dE < 7 && Math.random() < 0.25)) li *= Math.random() < 0.5 ? 0.05 : 1;
    spot.intensity = s.hidden ? 0 : li;
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
    if (!s.flags.cabinetMoved && near('cabinet', 5)) once('cab', () => { s.flags.cabinetSeen = true; T13.ui.obj(objectiveText()); say('gabriel', a.id === 'gabriel' ? 'That cabinet’s blocking the ward. I can move it. [✦ / Q]' : 'That cabinet’s blocking the ward. Let me — switch to me. [⇄ / Tab]', 4200, [18, 7]); });
    if (s.flags.cabinetMoved && !s.flags.falseGone && near('falsewall', 5)) once('fw', () => say('daniel', a.id === 'daniel' ? 'That wall doesn’t belong on the plan. Let me look. [✦ / Q]' : 'Hold on. That wall shouldn’t be there. Let me see it — switch to me. [⇄ / Tab]', 4200, [22, 9]));
    if (e.state !== 'dormant' && dE < 13 && !s.said.sense) once('sense', () => say('mara', a.id === 'mara' ? 'It’s here. I can feel where it is. [✦ / Q]' : 'It’s here. I can find it if you let me. [⇄ / Tab]'));
    if (near('musicbox', 4) && !s.flags.musicbox) once('mb', () => say('mara', 'That music box… someone held it the night of the fire.', 4200, [23, 2]));
    s.chatT -= dt; if (s.chatT <= 0 && !s.hidden) { s.chatT = 30 + Math.random() * 25; const lines = { CALM: [['daniel', 'Fire doors, 1960s. Whatever happened here happened fast.'], ['mara', 'It’s quiet. I hate quiet.']], UNEASY: [['gabriel', 'Something moved. Keep the light low.'], ['daniel', 'Footsteps don’t echo like that in a room this size.']], TENSION: [['mara', 'It’s thinking about us. I can feel it.'], ['gabriel', 'If you see it, don’t run first. Hide first.']], DANGER: [['mara', 'Please. Let’s just go.']], TERROR: [], RELEASE: [['gabriel', 'Breathe. It lost us. For now.']] }[dir.state] || []; const pick = lines.filter(([id]) => id !== a.id)[0] || lines[0]; if (pick) say(pick[0], pick[1]); }
    // HUD
    const tg = s.hidden ? null : lookTarget(); T13.ui.prompt(s.hidden ? 'Leave the locker' : tg ? PROMPT[tg.userData.kind](tg) : '');
    T13.ui.fear(dir.k, dir.state, s.hidden, s.battery, s.stamina, a.cd);
    if ((s.hudT = (s.hudT || 0) - dt) <= 0) { s.hudT = 0.25; updateTeam(); }
    renderer.render(scene, camera); X.perfTick(renderer);
  }

  G.debug = () => s && ({ t: +s.t.toFixed(1), stage: s.stage, flags: { ...s.flags }, active: cur().id, pos: [+cur().x.toFixed(2), +cur().z.toFixed(2)], enemy: { state: s.enemy.state, x: +s.enemy.x.toFixed(1), z: +s.enemy.z.toFixed(1) }, director: D.state, k: +D.k.toFixed(2), hidden: !!s.hidden, dead: s.dead, battery: Math.round(s.battery), stats });
  G.dev = { lighting: st2 => X.setLighting(st2, st2 === 'NORMAL' ? 0 : 60), reveal: m => { if (s) { s.forceReveal = m; enemyMesh.visible = true; } }, teleport: (c, r) => { const p = L.center(c, r); cur().x = p.x; cur().z = p.z; }, face: (yaw) => { cur().yaw = yaw; }, state: () => s };
})();
