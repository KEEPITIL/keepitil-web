/* THIRTEEN — case runtime (Ashgrove prologue today; the same runtime hosts Case I).
   Third-person over-the-shoulder; three siblings always present (one controlled, two autonomous);
   capture/rescue instead of death; powers registry; Echoes; hazards + dynamic gating; Fear Director 2.0;
   spatial audio stages; dialogue system with provenance. */
(function () {
  const G = T13.game = {}; G.DEBUG = new URLSearchParams(location.search).has('debug');
  const L = T13.level, A = T13.audio, D = T13.director, SIB = T13.SIBLINGS, CASE = T13.PROLOGUE, X = T13.gfx, K = T13.cam, SB = T13.sibs, DL = T13.dialogue, HZ = T13.hazards, EC = T13.echoes;
  let renderer, scene, camera, spot, spotTarget, hemi, hol = null, holShadow = null, enemyMesh, shadowMesh, running = false, last = 0;
  const RAD = 0.3;
  const input = G.input = { mx: 0, mz: 0, run: false, crouch: false, dx: 0, dy: 0 };
  const stats = G.stats = { deaths: 0, captures: 0, rescues: 0, hides: 0, powers: {}, switches: 0, started: 0 };
  let s = null;
  G.init = () => { if (renderer) return; renderer = X.initRenderer(document.getElementById('view')); };
  const loadSave = () => { try { return JSON.parse(localStorage.getItem('t13-save') || 'null'); } catch (e) { return null; } };
  const writeSave = o => { try { localStorage.setItem('t13-save', JSON.stringify(o)); } catch (e) {} };
  G.save = loadSave;
  const settings = () => { try { return JSON.parse(localStorage.getItem('t13-settings') || '{}'); } catch (e) { return {}; } };
  const DIFF = { story: { hollow: 0.85, grab: 7 }, normal: { hollow: 1, grab: 5 }, hard: { hollow: 1.12, grab: 3.8 } };
  const cur = () => s.sibs[s.active];
  /* delayed callbacks must never touch a later run (e.g. an old ritual stopping a new game) */
  const later = (fn, ms) => { const run = G.runId; return setTimeout(() => { if (run === G.runId && running) fn(); }, ms); };
  const now = () => s ? s.t : 0;
  T13.clock = now;

  /* ---------- dialogue hooks: subtitles + positional voice ---------- */
  const PITCH = { mara: 1.25, gabriel: 0.8, daniel: 1.0 };
  DL.hooks = {
    show: (l, text, src) => { const b = SIB.find(x => x.id === l.speaker); T13.ui.sub(text + (src ? `  [${src.label}${src.source ? ' · ' + src.source : ''}]` : ''), b ? b.name.toUpperCase() : (l.speaker || '').toUpperCase(), b ? b.css : '#c9c2ae', l.ms);
      const sb = s && s.sibs.find(x => x.id === l.speaker); if (sb) { s.speaker = sb.id; s.speakerUntil = s.t + Math.min(4, l.ms / 1000); sb.p.say(Math.min(3500, l.ms)); if (l.spatial && sb !== cur()) A.voiceAt(sb.x, 1.6, sb.z, PITCH[sb.id] || 1, Math.min(2, l.ms / 1500)); if (l.pointAt && sb !== cur()) { const q = L.center(l.pointAt[0], l.pointAt[1]); sb.p.act('point', new THREE.Vector3(q.x, 1.2, q.z)); } } },
    audio: l => { if (!l.audioAsset) return false; const sb = s && s.sibs.find(x => x.id === l.speaker); A.playAt('assets/' + l.audioAsset, sb ? sb.x : 0, 1.6, sb ? sb.z : 0, l.spatial).then(ok => { if (!ok) DL.missing.add(l.audioAsset); }); return true; },
  };
  const say = (id, text, ms, pointAt, priority = 'story', extra = {}) => DL.play({ speaker: id, subtitle: text, ms, pointAt, priority, ...extra });
  const bark = (cat, id) => DL.bark(cat, id);

  /* ---------- start ---------- */
  G.start = (fromCheckpoint = false) => {
    G.init(); A.init(); DL.reset(); EC.reset();
    const st = settings(), diff = DIFF[st.difficulty || 'normal'];
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x07080b); scene.fog = new THREE.FogExp2(0x0a0b0f, 0.03);
    camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.05, X.Q().far); X.cams.add(camera);
    hemi = new THREE.HemisphereLight(X.col(0x8c95a6), X.col(0x3e3428), 0.6); scene.add(hemi); X.setLighting('NORMAL'); X.light.cur = { ...X.LS.NORMAL }; X.light.until = 0;
    spot = new THREE.SpotLight(X.col(0xfff2dc), 1.9, 24, 0.55, 0.5, 1.15); spotTarget = new THREE.Object3D(); scene.add(spot, spotTarget); spot.target = spotTarget;
    if (X.Q().shadows) { spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0008; spot.shadow.camera.near = 0.2; spot.shadow.camera.far = 20; }
    L.build(scene);
    const sp = L.find('S')[0], p0 = L.center(sp.c, sp.r), cp = fromCheckpoint ? loadSave()?.checkpoint : null;
    G.runId = (G.runId || 0) + 1; const myRun = G.runId;
    s = { run: myRun, t: 0, stage: 'enter', flags: {}, active: 0, diff, sibs: SIB.map((d, i) => ({ ...d, x: p0.x + (i - 1) * 0.8, z: p0.z + 0.9, yaw: Math.PI, cds: {}, health: 'STABLE', mesh: null, still: 0 })),
      light: true, battery: 100, stamina: 1, hidden: null, over: false, codeTries: 0, stepT: 0, said: {}, chatT: 25, keypad: false, sounds: [], captureDir: 0, ritual: false, throwables: [], flying: [], ghosts: [] };
    if (cp) { Object.assign(s.flags, cp.flags); s.stage = cp.stage; s.sibs.forEach((b, i) => { b.x = cp.x + (i - 1) * 0.7; b.z = cp.z + (i ? 0.8 : 0); }); }
    s.sibs.forEach(b => { b.p = T13.people.build(b.id); b.mesh = b.p.root; scene.add(b.mesh); b.lastX = b.x; b.lastZ = b.z;
      if (false) { const cl = new THREE.SpotLight(X.col(0xfff0d0), 0.8, 12, 0.45, 0.6, 1.3); cl.position.set(0.25, 1.25, -0.2); const tg = new THREE.Object3D(); tg.position.set(0.1, 0.9, -5); b.mesh.add(cl, tg); cl.target = tg; b.cl = cl; }
      b.tether = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.05, 2.2, 5), new THREE.MeshBasicMaterial({ color: 0x220a18, transparent: true, opacity: 0.8 })); b.tether.visible = false; scene.add(b.tether); });
    hol = T13.hollow.build(); enemyMesh = hol.root; scene.add(enemyMesh);
    holShadow = T13.hollow.build(); shadowMesh = holShadow.root; shadowMesh.visible = false; scene.add(shadowMesh);
    const h = L.find('H')[0], hp = L.center(h.c, h.r);
    s.enemy = { x: hp.x, z: hp.z, yaw: 0, state: 'dormant', path: null, pi: 0, t: s.flags.fuseTaken ? 2 : 40, lastSeen: null, repath: 0, stag: 0, contact: -99, target: null, grabbing: null, buff: 0, atkT: 0 };
    HZ.init(scene, L, { siblings: () => s.sibs, onHurt: (b, n, why) => SB.hurt(b, n, why), noise: (x, z, r) => G.noise(x, z, r), setDoor, shake: a => K.shake(a), zoneDark: (z, secs) => { s.zoneDark = { z, until: s.t + secs }; }, openWall: (c, r) => { const g = L.breakWalls[c + ',' + r]; if (g) g.visible = false; } });
    SB.init(sbContext()); SB.GRAB_WINDOW = s.diff.grab;
    spawnThrowables();
    if (!s.flags.echoResolved) s.echo = EC.spawn('ashgrove.nurse', scene, L);
    if (cp) applyFlags();
    if (s.flags.fuseTaken) { s.enemy.state = 'patrol'; placeEnemyAway(24); s.enemy.contact = 8; wander(); }
    enemyMesh.visible = s.enemy.state !== 'dormant';
    K.state.yaw = Math.PI; K.state.pitch = -0.1; K.setContext('explore');
    D.reset(); s.over = false; running = true; stats.started = performance.now();
    T13.ui.hud(true); T13.ui.obj(objectiveText()); updateTeam();
    last = performance.now(); requestAnimationFrame(loop);
    if (!cp) later(() => say('gabriel', 'Stay close. Nobody wanders off.', 3000), 1500); else say(s.sibs[0].id, 'We go again. Quietly this time.', 2500);
  };
  G.stop = () => { running = false; T13.ui.hud(false); };
  G.isRunning = () => running;

  /* ---------- the context the siblings module works through ---------- */
  function sbContext() {
    return {
      L, list: () => s.sibs, active: () => cur(), enemy: () => s.enemy, now, enemyPos: () => new THREE.Vector3(s.enemy.x, 1.6, s.enemy.z),
      say: (id, t) => say(id, t, undefined, null, 'bark'), bark, noise: (x, z, r) => G.noise(x, z, r), setDoor, shake: a => K.shake(a), flash: o => T13.ui.flash(o * (settings().flash ?? 1)), hazards: HZ, echoes: EC,
      holdCell: b => { const cand = [[24, 13], [19, 1], [1, 8], [7, 13], [24, 5]].filter(([c, r]) => !L.blocked(c, r)); let best = cand[0], bd = -1; cand.forEach(([c, r]) => { const p = L.center(c, r), d = Math.min(...s.sibs.filter(o => o !== b && o.health !== 'CAPTURED').map(o => Math.hypot(o.x - p.x, o.z - p.z)).concat([99])); if (d > bd && !s.sibs.some(o => o.capturedAt && o.capturedAt[0] === c && o.capturedAt[1] === r)) { bd = d; best = [c, r]; } }); return best; },
      onCapture: b => { stats.captures++; if (b === cur()) { const nxt = s.sibs.findIndex(o => o.health !== 'CAPTURED'); if (nxt >= 0) switchTo(nxt, true); } s.captureDir = 6; T13.ui.toast(`${b.name} was taken`); updateTeam(); },
      onAllCaptured: () => ritual(),
      sense: a => senseTarget(a), senseCue: t => { T13.ui.senseCue(t.side); A.whisper(t.x, 1.6, t.z); },
      memoryNear: a => MEMORIES.find(m => near2(a, m.c, m.r, 3.4) && !s.flags['mem_' + m.id]),
      readMemory: (a, m) => { if (!m) return false; s.flags['mem_' + m.id] = true; T13.ui.flash(0.15); A.ability('mara'); say('mara', m.text, 6500, [m.c, m.r], 'story', { historicalSource: m.src }); if (m.id === 'musicbox') s.flags.musicbox = true; return true; },
      echoNear: a => s.echo && !s.echo.outcome && Math.hypot(s.echo.x - a.x, s.echo.z - a.z) < 3.6 ? s.echo : null,
      talkEcho: (a, e) => talkEcho(e), recentFalseVoice: () => s.falseVoiceT && s.t - s.falseVoiceT < 6,
      cabinetNear: a => !s.flags.cabinetMoved && near2(a, 18, 7, 6.5), doorNear: a => L.doors.find(d => { const p = L.center(d.userData.c, d.userData.r); return Math.hypot(p.x - a.x, p.z - a.z) < 3.2; }),
      throwableNear: (a, r = 6, any) => s.throwables.filter(t => !t.flying && Math.hypot(t.m.position.x - a.x, t.m.position.z - a.z) < r && (any || true)).sort((p, q) => Math.hypot(p.m.position.x - a.x, p.m.position.z - a.z) - Math.hypot(q.m.position.x - a.x, q.m.position.z - a.z))[0] || null,
      push: a => push(a), pull: a => pull(a), throwAt: a => throwAt(a),
      reconstructNear: a => RECON.find(r => near2(a, r.c, r.r, 4) && !s.flags['rec_' + r.id]), reconstruct: (a, r) => reconstruct(r),
      falseWallNear: a => !s.flags.falseGone && near2(a, 22, 9, 7), unmaskWall: a => { s.flags.falseGone = true; L.st.falseGone = true; const fw = L.objects.find(o => o.userData.kind === 'falsewall'); fw.userData.fade = 1; say('daniel', 'It was never a wall. It was a picture of one.'); T13.ui.obj(objectiveText()); return true; },
      freshSound: b => s.sounds.filter(q => s.t - q.t < 2.5 && Math.hypot(q.x - b.x, q.z - b.z) < 10).slice(-1)[0] || null,
    };
  }
  const near2 = (a, c, r, d) => { const p = L.center(c, r); return Math.hypot(p.x - a.x, p.z - a.z) < d; };
  const MEMORIES = [
    { id: 'musicbox', c: 23, r: 2, src: 'fic.ashgrove', text: 'I can hear her. A nurse, running, counting the wards out loud — four… one… three…' },
    { id: 'fusebox', c: 2, r: 3, src: 'fic.ashgrove', text: 'Somebody pulled this fuse on purpose. A man in a long coat. He was… protecting us?' },
    { id: 'exit', c: 2, r: 13, src: 'fic.hollow', text: 'Fresh. Someone scratched this door tonight. It hurt them to do it.' },
  ];
  const RECON = [
    { id: 'ward', c: 21, r: 7, path: [[18, 7], [20, 7], [22, 7]], text: 'The cabinet was dragged across the ward door from the inside. Someone sealed it in.' },
    { id: 'utility', c: 22, r: 11, path: [[23, 11], [22, 10], [22, 9]], text: 'Someone carried the fuse in here and hid it behind a wall that isn’t real.' },
  ];

  function applyFlags() {
    if (s.flags.cabinetMoved) L.st.cabinetMoved = true; if (s.flags.falseGone) L.st.falseGone = true;
    L.objects.forEach(o => { const k = o.userData.kind; if (k === 'cabinet' && s.flags.cabinetMoved) knockCabinet(o, true); if (k === 'falsewall' && s.flags.falseGone) o.visible = false; if (k === 'fuse' && s.flags.fuseTaken) o.userData.item.visible = false; });
    if (s.flags.gated) { HZ.trigger('ceiling_collapse', 18, 7, { now: s.t }); HZ.trigger('exposed_passage', 18, 11, { now: s.t }); }
    if (s.flags.power) powerOn(true);
    if (s.flags.echoResolved && s.echo) s.echo.fig.root.visible = false;
  }
  function checkpoint(stage) { s.stage = stage; const a = cur(); const sv = loadSave() || {}; sv.checkpoint = { stage, flags: { ...s.flags }, x: a.x, z: a.z }; sv.at = Date.now(); writeSave(sv); T13.ui.obj(objectiveText()); T13.ui.toast('Checkpoint'); }
  function objectiveText() { const O = CASE.objectives, f = s.flags; if (f.escaped) return ''; if (f.power) return O.exit; if (f.fuseTaken) return O.hunt; if (f.cabinetMoved) return O.fuse; if (f.cabinetSeen) return O.blocked; if (f.fuseboxSeen) return O.fusebox; return O.enter; }
  const once = (k, fn) => { if (s.said[k]) return; s.said[k] = 1; fn(); };
  function updateTeam() { T13.ui.team(s.sibs.map(b => { const bp = SB.best(b); return { name: b.name, css: b.css, power: bp ? bp.label : b.power, health: b.health, cd: 0, grabbed: !!b.grabbed }; }), s.active); }

  /* ---------- movement ---------- */
  function collide(e, nx, nz, rad = RAD) {
    const ok = (x, z) => { for (const [ox, oz] of [[-rad, -rad], [rad, -rad], [-rad, rad], [rad, rad]]) { const [c, r] = L.cell(x + ox, z + oz); if (L.blocked(c, r)) return false; } return true; };
    if (ok(nx, e.z)) e.x = nx; if (ok(e.x, nz)) e.z = nz;
  }
  G.noise = (x, z, radius) => { const e = s.enemy; s.sounds.push({ x, y: 0.5, z, t: s.t }); if (!e || ['dormant', 'hunt', 'stagger', 'flee', 'grab'].includes(e.state)) return; if (Math.hypot(e.x - x, e.z - z) < radius * (1 + e.buff)) goTo(x, z, 'investigate'); };

  /* ---------- the Hollow ---------- */
  function placeEnemyAway(minD) { const a = cur(), cells = L.floorCells().filter(([c, r]) => { const p = L.center(c, r); return Math.hypot(p.x - a.x, p.z - a.z) > minD && !L.los(a.x, a.z, p.x, p.z); }); const [c, r] = cells[Math.floor(Math.random() * cells.length)] || [22, 7]; const p = L.center(c, r); s.enemy.x = p.x; s.enemy.z = p.z; }
  function goTo(x, z, state) { const e = s.enemy, p = L.path(L.cell(e.x, e.z), L.cell(x, z)); if (!p) return false; e.path = p; e.pi = 1; e.state = state; return true; }
  function wander() { const cells = L.floorCells(); const pick = cells[Math.floor(Math.random() * cells.length)]; const p = L.center(...pick); goTo(p.x, p.z, 'patrol'); }
  const targets = () => s.sibs.filter(b => b.health !== 'CAPTURED' && !(b === cur() && s.hidden));
  function sees(b) { const e = s.enemy; const d = Math.hypot(e.x - b.x, e.z - b.z), lit = b === cur() ? s.light : true; const range = (lit ? 16 : 8) * (b === cur() && input.crouch ? 0.6 : 1) * (s.flags.power ? 1.25 : 1) * (s.flags.fuseTaken ? 1.2 : 1) * (1 + e.buff * 0.5); return d < range && L.los(e.x, e.z, b.x, b.z); }
  function updateEnemy(dt) {
    const e = s.enemy; if (e.state === 'dormant') { e.t -= dt; if (e.t <= 0) { placeEnemyAway(16); e.state = 'patrol'; enemyMesh.visible = true; wander(); } return; }
    if (e.state === 'grab') { SB.stepGrab(dt); return; }
    if (e.state === 'stagger') { e.stag -= dt; if (e.stag <= 0) { e.state = 'hunt'; const t = nearestTarget(); e.lastSeen = t ? { x: t.x, z: t.z } : null; } return; }
    // WARD: Gabriel's barrier pushes it out
    const g = s.sibs.find(b => b.id === 'gabriel' && b.wardUntil > s.t && b.health !== 'CAPTURED'); if (g) { const d = Math.hypot(e.x - g.x, e.z - g.z); if (d < 2.4) { e.x = g.x + (e.x - g.x) / (d || 1) * 2.45; e.z = g.z + (e.z - g.z) / (d || 1) * 2.45; } }
    const vis = targets().filter(sees).sort((p, q) => Math.hypot(e.x - p.x, e.z - p.z) - Math.hypot(e.x - q.x, e.z - q.z)); const tgt = vis[0] || null;
    if (tgt) { if (e.state !== 'hunt' && e.state !== 'flee') { A.sting(); A.growl(e.x, 1.8, e.z); D.bump(0.35); T13.ui.flash(0.2 * (settings().flash ?? 1)); once('firstHunt', () => later(() => say('gabriel', 'RUN. Find somewhere to hide!', 2500, null, 'warning'), 400)); } if (e.state !== 'flee') e.state = 'hunt'; e.target = tgt; e.lastSeen = { x: tgt.x, z: tgt.z }; e.contact = s.t; }
    // the locker rule, and the grab (it needs them alive)
    if (s.hidden && e.state === 'hunt' && e.sawHide && Math.hypot(e.x - cur().x, e.z - cur().z) < 2.2) { const a = cur(); s.hidden = null; SB.grab(a); T13.ui.sub('It watched you hide.', '', '#c9c2ae', 2500); return; }
    e.atkT -= dt;
    const warded = b => g && b !== g && Math.hypot(b.x - g.x, b.z - g.z) < 2.6;
    if (e.state !== 'flee' && e.atkT <= 0) { const victim = targets().find(b => Math.hypot(e.x - b.x, e.z - b.z) < 1.15 && !warded(b) && !(b === g && g.wardUntil > s.t)); if (victim) { e.atkT = 2.5; if (victim.health === 'STABLE' && Math.random() < 0.35) { SB.hurt(victim, 1, 'swipe'); e.state = 'stagger'; e.stag = 0.8; } else SB.grab(victim); return; } }
    if (s.flags.fuseTaken && !s.flags.power && e.state === 'patrol' && s.t - e.contact > 22) { e.contact = s.t; goTo(cur().x, cur().z, 'investigate'); }
    if (e.state === 'patrol' && s.t - e.contact > 45 && !s.flags.fuseTaken) { e.contact = s.t; placeEnemyAway(14); wander(); }
    // Echo consumption: an unresolved Echo the Hollow reaches first is consumed
    if (s.echo && !s.echo.outcome && s.flags.fuseTaken && Math.hypot(e.x - s.echo.x, e.z - s.echo.z) < 2.5) resolveEcho('CONSUMED');
    if (s.echo && !s.echo.outcome && s.flags.fuseTaken && e.state === 'patrol' && !e.echoHunt) { e.echoHunt = true; goTo(s.echo.x, s.echo.z, 'investigate'); }
    e.repath -= dt;
    if (e.state === 'hunt' && e.repath <= 0) { e.repath = 0.45; if (e.lastSeen) goTo(e.lastSeen.x, e.lastSeen.z, 'hunt'); if (!tgt && e.lastSeen && Math.hypot(e.x - e.lastSeen.x, e.z - e.lastSeen.z) < 1.2) { e.state = 'search'; e.t = 7; } }
    if (e.state === 'search') { e.t -= dt; if (e.t <= 0) wander(); else if (!e.path || e.pi >= e.path.length) { const p = L.center(...L.cell(e.x, e.z)); goTo(p.x + (Math.random() - 0.5) * 9, p.z + (Math.random() - 0.5) * 9, 'search'); } }
    if (e.state === 'flee') { e.t -= dt; if (e.t <= 0) wander(); }
    if ((e.state === 'patrol' || e.state === 'investigate') && (!e.path || e.pi >= e.path.length)) { if (e.state === 'investigate') { e.state = 'search'; e.t = 5; } else wander(); }
    const exposed = e.exposedUntil > s.t, sp = ({ patrol: 1.35, investigate: 2.2, search: 1.6, hunt: s.flags.fuseTaken ? 3.7 : 3.6, flee: 4.5 }[e.state] || 1.4) * s.diff.hollow * (1 + e.buff) * (exposed ? 0.7 : 1);
    if (e.path && e.pi < e.path.length) {
      const [c, r] = e.path[e.pi]; const door = L.doorAt(c, r); if (door && !door.userData.open) { if (door.userData.jammedUntil > s.t) { e.path = null; e.state = e.state === 'hunt' ? 'search' : e.state; e.t = 3; return; } setDoor(door, true, true); e.wait = 0.9; }
      if (e.wait > 0) { e.wait -= dt; return; }
      const tp = L.center(c, r), dx = tp.x - e.x, dz = tp.z - e.z, dd = Math.hypot(dx, dz), direct = e.state === 'hunt' && tgt && Math.hypot(e.x - tgt.x, e.z - tgt.z) < 3.6;
      if (direct) { const d = Math.hypot(tgt.x - e.x, tgt.z - e.z), k = Math.min(1, sp * dt / Math.max(d, 0.001)); e.x += (tgt.x - e.x) * k; e.z += (tgt.z - e.z) * k; e.yaw = Math.atan2(-(tgt.x - e.x), -(tgt.z - e.z)); }
      else if (dd < 0.15) e.pi++; else { const k = Math.min(dd, sp * dt); e.x += dx / dd * k; e.z += dz / dd * k; e.yaw = Math.atan2(-dx, -dz); }
      e.stepT = (e.stepT || 0) - dt * sp; if (e.stepT <= 0) { e.stepT = 1.25; A.step(e.x, 0.2, e.z, true, e.state === 'hunt' ? 0.5 : 0.3); }
    }
  }
  const nearestTarget = () => { const e = s.enemy; return targets().sort((p, q) => Math.hypot(e.x - p.x, e.z - p.z) - Math.hypot(e.x - q.x, e.z - q.z))[0]; };
  function ritual() {
    if (s.ritual) return; s.ritual = true; stats.deaths++; const e = s.enemy;
    K.cinematic({ pos: new THREE.Vector3(e.x + 3, 2.6, e.z + 3), look: new THREE.Vector3(e.x, 1.4, e.z), secs: 1.2, hold: 3 });
    hol.setReveal('full'); X.setLighting('BLACKOUT', 3); A.sting(); A.growl(e.x, 1.8, e.z);
    const run = G.runId; setTimeout(() => { if (run !== G.runId) return; running = false; T13.ui.hud(false); T13.ui.over('THE RITUAL', 'It has all three of them now. That is what it wanted from the start. — Try again from the checkpoint: stay together, rescue fast, and never let it take the last of you.'); }, 3800);
  }

  /* ---------- world objects ---------- */
  function setDoor(d, open, slam = false) { if (d.userData.open === open) return; d.userData.open = open; const p = L.center(d.userData.c, d.userData.r); A.door(p.x, 1.5, p.z, slam); if (s) s.sounds.push({ x: p.x, y: 1.5, z: p.z, t: s.t }); if (slam) D.bump(0.12); }
  function knockCabinet(o, instant) { o.userData.fallen = true; if (instant) { o.rotation.z = Math.PI / 2; o.position.y = 0.6; o.position.x += 1.7; } else o.userData.fallT = 0; }
  function powerOn(silent) { s.flags.power = true; X.setLighting('RESTORED'); if (L.fixtureMat.emissive) L.fixtureMat.emissive.set(X.col(0xbfc6c8)); L.objects.forEach(o => { if (o.userData.kind === 'fusebox') o.userData.lamp.material.color.set(0x33ff66); if (o.userData.kind === 'exit') o.userData.sign.visible = true; }); if (!silent) { A.power(true); const e = s.enemy; placeEnemyAway(20); wander(); e.state = 'flee'; e.t = 7; later(() => { if (running && !s.flags.shocked) { s.flags.shocked = true; HZ.trigger('electrical_failure', 13, 10, { now: s.t, secs: 25 }); say('daniel', 'The wiring in the hall just shorted — don’t walk through the sparks. I can stabilize it.', 4200, [13, 10], 'warning'); } }, 6000); } }
  function spawnThrowables() { const m = X.mat({ map: X.woodTex('#6b4a2e') }), m2 = X.mat({ map: X.metalTex('#6a716d') }); [[12, 5, 'crate'], [14, 9, 'chair'], [10, 11, 'crate'], [21, 7, 'can'], [5, 3, 'chair'], [16, 12, 'can']].forEach(([c, r, kind]) => { const p = L.center(c, r); const mesh = kind === 'can' ? new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.8, 12), m2) : new THREE.Mesh(new THREE.BoxGeometry(0.6, kind === 'chair' ? 0.9 : 0.6, 0.6), m); mesh.position.set(p.x + 0.7, kind === 'can' ? 0.4 : 0.3, p.z - 0.6); mesh.castShadow = true; scene.add(mesh); s.throwables.push({ m: mesh, kind }); }); }
  function push(a) {
    const e = s.enemy, fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
    const cab = L.objects.find(o => o.userData.kind === 'cabinet'); if (cab && !s.flags.cabinetMoved && near2(a, 18, 7, 6.5)) { s.flags.cabinetMoved = true; L.st.cabinetMoved = true; knockCabinet(cab, false); const cp = L.center(18, 7); A.door(cp.x, 1, cp.z, true); G.noise(cp.x, cp.z, 18); say('gabriel', 'There. The east ward’s open.'); checkpoint('cabinet'); once('wardwarn', () => later(() => say('mara', 'Careful. That room isn’t empty.', 2500), 2500)); return true; }
    if (e.state !== 'dormant' && Math.hypot(e.x - a.x, e.z - a.z) < 5.5) { const exposed = e.exposedUntil > s.t; if (e.grabbing) SB.rescue(a, 'push'); e.state = exposed ? 'flee' : 'stagger'; e.stag = 3.5; e.t = exposed ? 9 : 0; for (let i = 0; i < (exposed ? 20 : 12); i++) { const nx = e.x + (e.x - a.x) / (Math.hypot(e.x - a.x, e.z - a.z) || 1) * 0.25, nz = e.z + (e.z - a.z) / (Math.hypot(e.x - a.x, e.z - a.z) || 1) * 0.25; const [c, r] = L.cell(nx, nz); if (L.blocked(c, r, true)) break; e.x = nx; e.z = nz; } A.growl(e.x, 1.8, e.z); K.shake(0.3);
      if (exposed) { SB.log.push({ t: s.t, ev: 'combo', step: 'repelled', by: a.id }); say('gabriel', 'GET OUT!', 1500, null, 'warning'); if (!s.flags.firstCombo) { s.flags.firstCombo = true; K.cinematic({ pos: new THREE.Vector3(a.x + 2.5, 2.2, a.z + 2.5), look: new THREE.Vector3(e.x, 1.4, e.z), secs: 0.5, hold: 1.2 }); } } else say('gabriel', 'GO! I can’t hold it long!', 2000, null, 'warning'); return true; }
    const t = s.throwables.find(o => !o.flying && Math.hypot(o.m.position.x - a.x, o.m.position.z - a.z) < 3.5); if (t) { flyTo(t, t.m.position.x + fx * 4, t.m.position.z + fz * 4); return true; }
    const door = L.doors.find(dd => { const p = L.center(dd.userData.c, dd.userData.r); return Math.hypot(p.x - a.x, p.z - a.z) < 3.2; }); if (door) { setDoor(door, !door.userData.open, true); G.noise(a.x, a.z, 12); return true; } return true;
  }
  function pull(a) { const t = s.throwables.filter(o => !o.flying).sort((p, q) => Math.hypot(p.m.position.x - a.x, p.m.position.z - a.z) - Math.hypot(q.m.position.x - a.x, q.m.position.z - a.z))[0]; if (!t) return false; flyTo(t, a.x + (t.m.position.x - a.x) * 0.15, a.z + (t.m.position.z - a.z) * 0.15); say('gabriel', 'Come here…', 1200, null, 'bark'); return true; }
  function throwAt(a) { const e = s.enemy, t = s.throwables.filter(o => !o.flying && Math.hypot(o.m.position.x - a.x, o.m.position.z - a.z) < 6)[0]; if (!t || e.state === 'dormant') return false; flyTo(t, e.x, e.z, () => { if (Math.hypot(t.m.position.x - e.x, t.m.position.z - e.z) < 1.4) { const exposed = e.exposedUntil > s.t; if (e.grabbing) SB.rescue(a, 'throw'); e.state = exposed ? 'flee' : 'stagger'; e.stag = exposed ? 5 : 2.5; e.t = exposed ? 8 : 0; A.thump(e.x, 1.5, e.z, 0.6); if (exposed) SB.log.push({ t: s.t, ev: 'combo', step: 'repelled', by: a.id }); } }); say('gabriel', 'Catch.', 1000, null, 'bark'); return true; }
  function flyTo(t, x, z, done) { t.flying = { fx: t.m.position.x, fz: t.m.position.z, tx: x, tz: z, t: 0, done }; s.flying.push(t); }
  function reconstruct(r) { s.flags['rec_' + r.id] = true; const g = T13.people.buildProcedural('gabriel'); g.root.traverse(o => { if (o.isMesh) o.material = new THREE.MeshBasicMaterial({ color: 0x8fe0d4, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending }); }); scene.add(g.root); s.ghosts.push({ g, path: r.path.map(([c, rr]) => L.center(c, rr)), t: 0 }); say('daniel', r.text, 6000, [r.c, r.r], 'story', { historicalSource: 'fic.ashgrove' }); return true; }
  function senseTarget(a) { const range = 40 * ((loadSave()?.persistent || {})['mara.sense_range'] || 1); let t = null;
    const cap = s.sibs.find(b => b.health === 'CAPTURED'); if (cap) t = { x: cap.x, z: cap.z, line: `${cap.name}’s still alive. That way.` };
    else if (s.echo && !s.echo.outcome && Math.hypot(s.echo.x - a.x, s.echo.z - a.z) < range) t = { x: s.echo.x, z: s.echo.z, line: 'Someone is still here. Frightened. Not the thing — a person.' };
    else { const f = s.flags; const goal = !f.cabinetMoved ? [18, 7] : !f.fuseTaken ? [23, 11] : !f.power ? [2, 3] : [2, 13]; const p = L.center(goal[0], goal[1]); t = { x: p.x, z: p.z, line: 'There’s a pull… that way.' }; }
    if (Math.hypot(t.x - a.x, t.z - a.z) > range) return null;
    const ang = Math.atan2(-(t.x - a.x), -(t.z - a.z)) - K.state.yaw; const n = Math.atan2(Math.sin(ang), Math.cos(ang)); t.side = Math.abs(n) < 0.6 ? 'ahead' : Math.abs(n) > 2.4 ? 'behind' : n > 0 ? 'left' : 'right'; return t; }
  function talkEcho(e) { if (!e || e.outcome) return false; const d = e.d; s.echoActive = s.t; say('mara', 'Hello? We can hear you.', 2200, null, 'story');
    setTimeout(() => { say('mara', d.lines.greet, 4500, null, 'story', { historicalSource: d.historical_source }); T13.ui.choice('Nurse Hale · Echo', [
      { label: 'Tell her the children are safe (release)', go: () => resolveEcho('RELEASED') },
      { label: 'Ask her for the ward count', go: () => resolveEcho('SAVED') },
      { label: 'Leave her', go: () => resolveEcho('LEFT') }]); }, 2300); return true; }
  function resolveEcho(outcome) { const e = s.echo; if (!e || e.outcome) return; EC.resolve(e, outcome); const d = e.d; s.flags.echoResolved = outcome !== 'LEFT' && outcome !== 'SAVED'; s.flags.echoOutcome = outcome;
    const sv = loadSave() || {}; sv.echoes = { ...(sv.echoes || {}), [e.id]: outcome }; sv.persistent = sv.persistent || {};
    if (outcome === 'RELEASED') { sv.persistent[d.persistent_reward.id] = d.persistent_reward.value; s.flags.codeKnown = true; say('mara', d.lines.released, 4000, null, 'story'); later(() => say('mara', 'She said it as she went: four, one, three.', 3500), 4200); }
    if (outcome === 'SAVED') { s.flags.codeKnown = true; s.flags.echoDistraction = true; say('mara', d.lines.saved, 4000, null, 'story'); }
    if (outcome === 'LEFT') say('mara', d.lines.left, 2500, null, 'bark');
    if (outcome === 'CONSUMED') { s.enemy.buff = d.hollow_reward_if_consumed.value; A.growl(e.x, 1.6, e.z); say('mara', 'NO — it took her. It’s stronger now. I can feel it.', 4000, null, 'warning'); T13.ui.toast('The Hollow consumed an Echo'); }
    writeSave(sv); }

  /* ---------- interaction (generous targeting; camera-forward + proximity) ---------- */
  function lookTarget() {
    const a = cur(); let best = null, bs = -1; const fx = -Math.sin(K.state.yaw), fz = -Math.cos(K.state.yaw);
    for (const o of L.objects) { const { c, r, kind } = o.userData; if ((kind === 'falsewall' && s.flags.falseGone) || (kind === 'cabinet' && s.flags.cabinetMoved) || (kind === 'fuse' && s.flags.fuseTaken)) continue;
      const p = L.center(c, r), dx = p.x - a.x, dz = p.z - a.z, d = Math.hypot(dx, dz); if (d > (kind === 'door' ? 2.8 : 3.8)) continue; const dot = (dx * fx + dz * fz) / (d || 1); if (dot < 0.25) continue; const sc = dot * 2 - d * 0.3; if (sc > bs) { bs = sc; best = o; } }
    const cap = s.sibs.find(b => b.health === 'CAPTURED' && Math.hypot(b.x - a.x, b.z - a.z) < 2.2); if (cap) return { captured: cap };
    const crit = s.sibs.find(b => b !== a && b.health === 'CRITICAL' && Math.hypot(b.x - a.x, b.z - a.z) < 2); if (crit) return { critical: crit };
    if (s.enemy.grabbing && s.enemy.grabbing !== a && Math.hypot(s.enemy.x - a.x, s.enemy.z - a.z) < 2.4) return { grab: true };
    return best;
  }
  const PROMPT = { door: o => o.userData.open ? 'Close door' : 'Open door', locker: () => 'Hide', fusebox: () => s.flags.fuseTaken && !s.flags.power ? 'Put the fuse in' : 'Fuse box', cabinet: () => 'Heavy cabinet', falsewall: () => 'Wall…', fuse: () => 'Take the fuse', musicbox: () => 'Music box', exit: () => 'Exit door' };
  const promptFor = t => !t ? '' : t.captured ? `Free ${t.captured.name}` : t.critical ? `Steady ${t.critical.name}` : t.grab ? 'PULL THEM FREE' : PROMPT[t.userData.kind](t);
  G.act = what => {
    if (!s || !running || s.ritual) return; A.init();
    if (what === 'switch') return switchTo(nextFree(s.active));
    if (/^switch[123]$/.test(what)) return switchTo(+what.slice(-1) - 1);
    if (what === 'light') { if (!s.hidden) { s.light = !s.light; A.pickup(); } return; }
    if (what === 'crouch') { input.crouch = !input.crouch; return; }
    if (what === 'ability') { const a = cur(); if (a.grabbed) { a.grabbed.t = Math.max(0, a.grabbed.t - 0.6); return; } const p = SB.best(a); if (!p) return A.error(); stats.powers[p.id] = (stats.powers[p.id] || 0) + 1; if (!SB.use(a, p)) A.error(); updateTeam(); return; }
    if (what === 'interact') return interact();
  };
  const nextFree = i => { for (let k = 1; k <= 3; k++) { const j = (i + k) % 3; if (s.sibs[j].health !== 'CAPTURED') return j; } return i; };
  function switchTo(i, forced) { if (i === s.active || s.hidden || s.sibs[i].health === 'CAPTURED') return; s.active = i; stats.switches++; A.ability('switch'); const b = cur(); K.state.yaw = b.yaw; T13.ui.toast(`${b.name} — ${b.domain}${forced ? ' (taken over)' : ''}`); updateTeam(); }
  function interact() {
    const a = cur(); if (a.grabbed) { a.grabbed.t = Math.max(0, a.grabbed.t - 0.6); T13.ui.toast('Struggle!'); return; }
    if (s.hidden) { const h = s.hidden; s.hidden = null; a.x = h.x; a.z = h.z; A.door(a.x, 1, a.z); return; }
    const t = lookTarget(); if (!t) return;
    if (t.captured) { SB.free(t.captured, a); stats.rescues++; say(t.captured.id, 'You came back for me.', 2500, null, 'story'); updateTeam(); return; }
    if (t.critical) { SB.heal(t.critical, 'HURT'); say(a.id, 'Breathe. I’ve got you.', 2000, null, 'bark'); return; }
    if (t.grab) { SB.rescue(a, 'hands'); stats.rescues++; return; }
    const o = t, k = o.userData.kind;
    if (k === 'door') { setDoor(o, !o.userData.open); G.noise(a.x, a.z, 7); return; }
    if (k === 'locker') { const e = s.enemy; e.sawHide = e.state === 'hunt' && sees(a) && Math.hypot(e.x - a.x, e.z - a.z) < 8; s.hidden = { x: a.x, z: a.z, o }; stats.hides++; A.door(a.x, 1, a.z); once('hid', () => later(() => say('mara', '(whispering) Don’t breathe. It hears everything.', 3000), 600)); return; }
    if (k === 'fusebox') { if (s.flags.fuseTaken && !s.flags.power) { powerOn(false); T13.ui.flash(0.3); say('daniel', 'Power’s back. Lights hurt it — look, it’s pulling away.'); checkpoint('power'); return; } if (s.flags.power) return say(a.id, 'Power’s on. Get to the exit.', 2500); s.flags.fuseboxSeen = true; T13.ui.obj(objectiveText()); return say('gabriel', 'Main fuse is gone. Someone took it out on purpose.', 4200, [2, 3]); }
    if (k === 'cabinet') { s.flags.cabinetSeen = true; T13.ui.obj(objectiveText()); return say(a.id === 'gabriel' ? 'gabriel' : a.id, a.id === 'gabriel' ? 'Stand back. I can move this. [✦]' : 'Too heavy. Gabriel could shift it. [⇄]', 3500); }
    if (k === 'falsewall') return say(a.id, a.id === 'daniel' ? 'This wall is wrong. Let me look properly. [✦]' : a.id === 'mara' ? 'Daniel keeps staring at this wall.' : 'Just a wall… right?', 3000);
    if (k === 'musicbox') { if (a.id === 'mara') return SB.use(a, SB.POWERS.PSYCHOMETRY); return say(a.id, 'An old music box. Mara should touch this, not me.', 3000); }
    if (k === 'fuse') { o.userData.item.visible = false; s.flags.fuseTaken = true; A.pickup(); A.staticBurst(); A.growl(s.enemy.x, 1.8, s.enemy.z); D.bump(0.4); T13.ui.flash(0.25 * (settings().flash ?? 1));
      const e = s.enemy; if (e.state === 'dormant') { e.state = 'patrol'; enemyMesh.visible = true; placeEnemyAway(14); } goTo(a.x, a.z, 'investigate'); say('mara', 'Oh no. It felt that. It’s coming — back to the fuse box, now!', 3500, null, 'warning'); checkpoint('fuseTaken');
      // DYNAMIC GATING: the way back collapses; a new way opens (the player recognises the space, but it has changed)
      later(() => { if (!running) return; s.flags.gated = true; HZ.trigger('ceiling_collapse', 18, 7, { now: s.t }); K.cinematic({ pos: new THREE.Vector3(L.center(18, 7).x + 3, 2.5, L.center(18, 7).z + 2), look: new THREE.Vector3(L.center(18, 7).x, 1, L.center(18, 7).z), secs: 0.4, hold: 1.0 }); setTimeout(() => { HZ.trigger('exposed_passage', 18, 11, { now: s.t }); say('daniel', 'The ward door’s gone — but that wall just opened into the hall. Through there!', 4000, [18, 11], 'warning'); }, 2200); }, 3500);
      later(() => { if (running && !s.flags.fire) { s.flags.fire = true; HZ.trigger('fire', 4, 11, { now: s.t, secs: 45 }); } }, 9000); return; }
    if (k === 'exit') { if (!s.flags.power) return say('daniel', 'Electronic lock. No power, no exit.', 2500); s.keypad = true; T13.ui.keypad(true); return; }
  }
  G.tryCode = code => { if (code === CASE.code) { s.keypad = false; T13.ui.keypad(false); escape(); return true; } s.codeTries++; A.error(); G.noise(cur().x, cur().z, 10); if (s.codeTries === 3) later(() => say('mara', 'Wait — I can still hear that nurse. She was counting the wards: four, one, three.', 6000), 500); return false; };
  G.closeKeypad = () => { s.keypad = false; };
  function escape() {
    s.flags.escaped = true; running = false; A.power(false); D.releaseUntil = 1e9;
    const sv = loadSave() || {}; sv.prologueDone = true; sv.xp = (sv.xp || 0) + 250; sv.films = Array.from(new Set([...(sv.films || []), 'case-0', 'family-1', 'intro'])); sv.progress = sv.progress || { completed: [], flags: {} }; sv.progress.flags.prologue = true; sv.progress.flags.echo_ashgrove = s.flags.echoOutcome || 'LEFT'; delete sv.checkpoint; writeSave(sv);
    T13.ui.hud(false);
    T13.ui.cinematic([['', 'You step out into the cold.'], ['', CASE.breadcrumb], ['GABRIEL', 'That’s Lantern’s mark. Dad’s mark.'], ['DANIEL', 'Or something that knows it.'], ['MARA', 'It’s him. I’d know it anywhere.']], { mandatory: 3, who: 'LANTERN · AFTER' }, () =>
      T13.ui.over('PROLOGUE COMPLETE', `+250 XP · Echo: ${s.flags.echoOutcome || 'unresolved'} · captures ${stats.captures} · rescues ${stats.rescues} · switches ${stats.switches}. Case I — Winchester — is next.`, 'complete'));
  }

  /* ---------- director events ---------- */
  function fire(ev) {
    const a = cur(), e = s.enemy, back = { x: a.x + Math.sin(K.state.yaw) * 6, z: a.z + Math.cos(K.state.yaw) * 6 }, discerning = s.sibs.some(b => b.discernUntil > s.t), unmasked = s.sibs.some(b => b.unmaskUntil > s.t);
    const heard = (x, y, z) => s.sounds.push({ x, y, z, t: s.t });
    if (ev === 'creak') { const x = a.x + (Math.random() - 0.5) * 16, z = a.z + (Math.random() - 0.5) * 16; heard(x, 2.8, z); return A.creak(x, 2.8, z); }
    if (ev === 'step_far') return A.step(a.x + (Math.random() - 0.5) * 24, 0.2, a.z + (Math.random() - 0.5) * 24, true, 0.18);
    if (ev === 'step_near') { heard(back.x, 0.3, back.z); if (Math.random() < 0.5 && cur().id !== 'gabriel') later(() => say('gabriel', 'Did you hear that?', 2200, null, 'bark'), 700); A.step(back.x, 0.2, back.z, false, 0.35); setTimeout(() => A.step(back.x + 0.4, 0.2, back.z + 0.4, false, 0.35), 450); return; }
    if (ev === 'whisper') { heard(back.x, 1.6, back.z); return A.whisper(back.x, 1.6, back.z); }
    if (ev === 'door_far' || ev === 'door_slam') { const ds = L.doors.map(d => ({ d, p: L.center(d.userData.c, d.userData.r) })).filter(x => { const dd = Math.hypot(x.p.x - a.x, x.p.z - a.z); return dd > 5 && dd < 22; }); const pick = ds[Math.floor(Math.random() * ds.length)]; if (pick) { if (ev === 'door_slam') HZ.trigger('door_slam', pick.d.userData.c, pick.d.userData.r, { now: s.t, secs: 6 }); else setDoor(pick.d, !pick.d.userData.open); } return; }
    if (ev === 'flicker') { s.flickerUntil = s.t + 1.2; return; }
    if (ev === 'radio') { A.staticBurst(); return T13.ui.sub('… kkssh … not your father … kssh …', 'RADIO', '#8d8573', 3000); }
    if (ev === 'blackout') { X.setLighting('BLACKOUT', 3.5 + Math.random() * 3); A.power(false); later(() => say('gabriel', 'Lights! Stay together — don’t move.', 3000, null, 'warning'), 500); if (e.state !== 'dormant' && e.state !== 'hunt' && Math.random() < 0.5) goTo(a.x, a.z, 'investigate'); return; }
    if (ev === 'glass') { const w = (L.windows || []).map(g => ({ g, d: Math.hypot(g.position.x - a.x, g.position.z - a.z) })).filter(o => o.d < 16).sort((p, q) => p.d - q.d)[0]; if (w) { const [c, r] = L.cell(w.g.position.x - Math.sin(w.g.rotation.y) * 0.5, w.g.position.z - Math.cos(w.g.rotation.y) * 0.5); HZ.trigger('glass_break', c, r, { now: s.t }); } return; }
    if (ev === 'object_fall') { const x = a.x + (Math.random() - 0.5) * 10, z = a.z + (Math.random() - 0.5) * 10; heard(x, 0.5, z); A.thump(x, 0.5, z, 0.35); return; }
    if (ev === 'sibling_react') { const o = s.sibs.filter((b, i) => i !== s.active && b.health !== 'CAPTURED')[0]; if (o) { bark('fear', o.id); o.p.act('flinch'); } return; }
    if (ev === 'false_voice') { const others = s.sibs.filter((_, i) => i !== s.active), who = others[Math.floor(Math.random() * others.length)], line = ['Over here…', 'Come here. I found something.', 'Why did you leave me?'][Math.floor(Math.random() * 3)];
      s.falseVoiceT = s.t; A.voiceAt(back.x, 1.6, back.z, PITCH[who.id] || 1, 1.4, 0.18); T13.ui.sub(`“${line}”${discerning || unmasked ? '  — COUNTERFEIT' : ''}`, who.name.toUpperCase() + '?', who.css, 3200); later(() => say(who.id, 'That wasn’t me. I’m right here.', 2400, null, 'bark'), 2600); return; }
    if (ev === 'shadow') { const kind = ['shadow', 'limbs', 'face', 'window', 'nothing'][Math.floor(Math.random() * 5)]; if (kind === 'nothing') return; const fx = -Math.sin(K.state.yaw), fz = -Math.cos(K.state.yaw); const show = (x, z, mode, secs, yaw) => { shadowMesh.position.set(x, 0, z); shadowMesh.rotation.y = yaw; holShadow.setReveal(mode); shadowMesh.visible = true; s.shadowUntil = s.t + secs; heard(x, 1.8, z); if (discerning || unmasked) T13.ui.sub('Not real. A picture of it.', 'DANIEL', SIB[2].css, 2000); };
      if (kind === 'window') { const w = (L.windows || []).map(g => ({ g, d: Math.hypot(g.position.x - a.x, g.position.z - a.z) })).filter(o => o.d > 3 && o.d < 14).sort((p, q) => p.d - q.d)[0]; if (w) { const out = new THREE.Vector3(0, 0, -0.9).applyAxisAngle(new THREE.Vector3(0, 1, 0), w.g.rotation.y); show(w.g.position.x + out.x, w.g.position.z + out.z, 'shadow', 0.7, w.g.rotation.y); } return; }
      if (kind === 'limbs') { const d = L.doors.map(dd => ({ dd, p: L.center(dd.userData.c, dd.userData.r) })).filter(o => { const dist = Math.hypot(o.p.x - a.x, o.p.z - a.z); return dist > 5 && dist < 13 && L.los(a.x, a.z, o.p.x, o.p.z); })[0]; if (d) { if (!d.dd.userData.open) setDoor(d.dd, true); show(d.p.x + fz * 0.9, d.p.z - fx * 0.9, 'limbs', 1.1, K.state.yaw + Math.PI); } return; }
      for (let dist = 13; dist > 6; dist -= 1.5) { const x = a.x + fx * dist, z = a.z + fz * dist, [c, r] = L.cell(x, z); if (!L.blocked(c, r) && L.los(a.x, a.z, x, z)) { show(x, z, kind === 'face' ? 'face' : 'shadow', kind === 'face' ? 0.6 : 0.45, K.state.yaw + Math.PI); if (kind === 'face') shadowMesh.position.y = -0.4; return; } } return; }
    if (ev === 'silence') { D.silenceUntil = s.t + 6; return; }
  }

  /* ---------- per-frame ---------- */
  function loop() {
    if (!running) return; requestAnimationFrame(loop);
    const tnow = performance.now(), dt = Math.max(0, Math.min(0.05, (tnow - last) / 1000)); last = tnow; if (s.keypad || T13.ui.paused() || T13.ui.choosing()) { renderer.render(scene, camera); return; }
    s.t += dt; const a = cur(), e = s.enemy;
    K.look(input.dx, input.dy); input.dx = input.dy = 0;
    // controlled sibling: camera-relative movement, body turns toward travel
    let moving = false, mySpeed = 0;
    if (!s.hidden && !a.grabbed && a.health !== 'CAPTURED') { const len = Math.hypot(input.mx, input.mz); if (len > 0.08) {
      const want = input.run && !input.crouch && s.stamina > 0.05, [cc, rr] = L.cell(a.x, a.z), sp = (input.crouch ? 1.35 : want ? 4.5 : 2.5) * Math.min(1, len) * SB.speedMul(a) * HZ.slow(cc, rr);
      const fx = -Math.sin(K.state.yaw), fz = -Math.cos(K.state.yaw), rx = Math.cos(K.state.yaw), rz = -Math.sin(K.state.yaw);
      const vx = (fx * -input.mz + rx * input.mx) / Math.max(1, len), vz = (fz * -input.mz + rz * input.mx) / Math.max(1, len);
      collide(a, a.x + vx * sp * dt, a.z + vz * sp * dt); moving = true; mySpeed = sp; const ty = Math.atan2(-vx, -vz); let dy = ty - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); a.yaw += dy * Math.min(1, dt * 10);
      if (want) s.stamina = Math.max(0, s.stamina - dt / 7);
      s.stepT -= dt * sp; if (s.stepT <= 0) { s.stepT = 1.5; A.myStep(want, input.crouch); G.noise(a.x, a.z, input.crouch ? 1.5 : want ? 13 : 5); } } }
    if (!(moving && input.run)) s.stamina = Math.min(1, s.stamina + dt / 9);
    a.still = moving ? 0 : a.still + dt;
    // siblings: AI decisions, steering, health, grabs
    s.sibs.forEach(b => SB.think(b, dt)); SB.stepHealth(dt);
    const V3 = THREE.Vector3, holVis = e.state !== 'dormant' && enemyMesh.visible && Math.hypot(e.x - a.x, e.z - a.z) < 16 && L.los(a.x, a.z, e.x, e.z);
    s.sounds = s.sounds.filter(q => s.t - q.t < 3.5);
    s.sibs.forEach((b, i) => {
      const isMe = i === s.active; let speed = isMe ? mySpeed : SB.steer(b, dt, collide);
      if (b.health === 'CAPTURED') { const p = L.center(b.capturedAt[0], b.capturedAt[1]); b.x = p.x; b.z = p.z; speed = 0; }
      if (s.hidden && isMe) b.mesh.visible = false; else b.mesh.visible = true;
      if (b.grabbed) { b.x += (e.x - b.x) * Math.min(1, dt * 4) * 0.2; b.z += (e.z - b.z) * Math.min(1, dt * 4) * 0.2; }
      // behaviour: what to look at, and how to feel
      const de = Math.hypot(e.x - b.x, e.z - b.z), seesIt = holVis && de < 14 && L.los(b.x, b.z, e.x, e.z); let look = null, expr = b.health === 'CRITICAL' || b.health === 'HURT' ? 'pain' : 'neutral';
      if (b.grabbed || b.health === 'CAPTURED') { expr = 'fear'; look = new V3(e.x, 2.2, e.z); }
      else if (seesIt) { look = new V3(e.x, 2.2, e.z); expr = de < 7 ? 'fear' : 'concern'; if (!b.sawHollow) { b.sawHollow = true; b.p.act('flinch'); if (!isMe && Math.random() < 0.6) bark('hollow', b.id); } }
      else { b.sawHollow = false; if (s.speaker && s.t < s.speakerUntil && !isMe) { const sp2 = s.sibs.find(o => o.id === s.speaker); look = sp2 && sp2 !== b ? new V3(sp2.x, 1.6, sp2.z) : camera.position.clone(); } else if (s.sounds.length && !isMe) { const q = s.sounds[s.sounds.length - 1]; look = new V3(q.x, q.y, q.z); expr = expr === 'pain' ? expr : 'concern'; } else if (!isMe && ((s.t + i * 3.7) % 11) < 2.5) look = new V3(a.x, 1.6, a.z); }
      if (e.state === 'hunt' && !seesIt && expr === 'neutral') expr = 'concern';
      b.p.lookAt(look); b.p.setExpr(expr); b.mesh.position.set(b.x, 0, b.z); b.mesh.rotation.y = b.yaw;
      const moved = Math.hypot(b.x - b.lastX, b.z - b.lastZ) / Math.max(dt, 1e-4); b.lastX = b.x; b.lastZ = b.z;
      b.p.update(dt, { speed: b.health === 'CAPTURED' || b.grabbed ? 0 : moved, crouch: b.health === 'CAPTURED' || (isMe ? input.crouch : input.crouch && b.mode === 'FOLLOW'), lightOn: s.light && !s.flags.power && b.health !== 'CAPTURED', afraid: expr === 'fear' });
      if (b.cl) b.cl.intensity = s.light && !s.flags.power && b.health !== 'CAPTURED' && !isMe ? 0.8 : 0;
      b.tether.visible = b.health === 'CAPTURED'; if (b.tether.visible) b.tether.position.set(b.x, 2.1, b.z);
      if (b.wardUntil > s.t) { if (!b.wardMesh) { b.wardMesh = new THREE.Mesh(new THREE.SphereGeometry(2.4, 20, 14), new THREE.MeshBasicMaterial({ color: 0xff6a5a, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); scene.add(b.wardMesh); } b.wardMesh.visible = true; b.wardMesh.position.set(b.x, 1.2, b.z); } else if (b.wardMesh) b.wardMesh.visible = false;
    });
    // the Hollow
    const ex0 = e.x, ez0 = e.z; updateEnemy(dt); const eSpeed = Math.hypot(e.x - ex0, e.z - ez0) / Math.max(dt, 1e-4);
    const dE = e.state === 'dormant' ? 99 : Math.hypot(e.x - a.x, e.z - a.z);
    enemyMesh.position.set(e.x, 0, e.z); enemyMesh.rotation.y = e.yaw;
    const fxv = -Math.sin(K.state.yaw), fzv = -Math.cos(K.state.yaw), inBeam = s.light && dE < 11 && ((e.x - a.x) * fxv + (e.z - a.z) * fzv) / Math.max(dE, 0.01) > 0.8;
    const want = e.state === 'hunt' || e.state === 'stagger' || e.state === 'grab' || inBeam || dE < 5 || s.forceReveal === 'full' || e.exposedUntil > s.t ? 'full' : 'shadow'; if (hol.mode !== want) hol.setReveal(want);
    hol.update(dt, { speed: eSpeed, hunting: e.state === 'hunt' || e.state === 'grab', stagger: e.state === 'stagger' });
    const discern = s.sibs.some(b => b.discernUntil > s.t), resonance = discern && e.identifiedUntil > s.t; enemyMesh.traverse(m => { if (m.material) { m.material.depthTest = !resonance; m.renderOrder = resonance ? 5 : 0; } });
    // spatial audio: Hollow proximity stage
    const sameZone = L.zoneOf(...L.cell(e.x, e.z)) === L.zoneOf(...L.cell(a.x, a.z)); s.hollowStage = A.hollowStage({ dist: dE, hunting: e.state === 'hunt' || e.state === 'grab', sameZone, active: e.state !== 'dormant' }); A.hollowTick(dt, s.hollowStage, e.x, e.z);
    // world
    const unmasked = s.sibs.some(b => b.unmaskUntil > s.t), perceive = s.sibs.some(b => b.perceiveUntil > s.t); L.hiddenDecals.forEach(dc => { dc.material.opacity += ((unmasked ? 1 : 0) - dc.material.opacity) * Math.min(1, dt * 3); });
    L.objects.forEach(o => { if (o.userData.kind === 'falsewall' && o.visible) { const ms = o.userData.mats || []; if (o.userData.fade) { o.userData.op = Math.max(0, (o.userData.op ?? 1) - dt * 0.8); if (o.userData.op <= 0) o.visible = false; } else o.userData.op = unmasked || perceive ? 0.55 + Math.sin(s.t * 12) * 0.2 : 1; ms.forEach(m => { m.opacity = o.userData.op; }); }
      if (o.userData.kind === 'cabinet' && o.userData.fallT !== undefined && o.userData.fallT < 1) { o.userData.fallT = Math.min(1, o.userData.fallT + dt * 2.4); o.rotation.z = o.userData.fallT * Math.PI / 2; o.position.y = 1.25 - o.userData.fallT * 0.65; o.position.x += dt * 4; }
      if (o.userData.kind === 'door') { const tgt = o.userData.base + (o.userData.open ? -Math.PI * 0.5 : 0); o.rotation.y += (tgt - o.rotation.y) * Math.min(1, dt * 7); }
      if (o.userData.kind === 'fuse' && o.userData.item.visible) o.userData.item.rotation.x += dt; });
    s.flying = s.flying.filter(t => { const f = t.flying; f.t += dt / 0.5; const k = Math.min(1, f.t); t.m.position.x = f.fx + (f.tx - f.fx) * k; t.m.position.z = f.fz + (f.tz - f.fz) * k; t.m.position.y = 0.3 + Math.sin(k * Math.PI) * 1.4; t.m.rotation.x += dt * 8; if (k >= 1) { t.m.position.y = 0.3; t.flying = null; A.thump(t.m.position.x, 0.3, t.m.position.z, 0.3); f.done && f.done(); return false; } return true; });
    s.ghosts = s.ghosts.filter(gh => { gh.t += dt; const seg = gh.t / 1.6, i = Math.floor(seg); if (i >= gh.path.length - 1) { scene.remove(gh.g.root); return false; } const p0 = gh.path[i], p1 = gh.path[i + 1], f = seg - i; gh.g.root.position.set(p0.x + (p1.x - p0.x) * f, 0, p0.z + (p1.z - p0.z) * f); gh.g.root.rotation.y = Math.atan2(-(p1.x - p0.x), -(p1.z - p0.z)); gh.g.update(dt, { speed: 2 }); return true; });
    HZ.tick(dt, s.t); T13.echoes.tick(dt);
    if (shadowMesh.visible) { holShadow.update(dt, { speed: 0 }); if (s.t > s.shadowUntil) shadowMesh.visible = false; }
    // lighting state
    if (!s.flags.power) X.setLighting(D.state === 'DANGER' || D.state === 'TERROR' ? 'DIM' : 'NORMAL'); else X.setLighting('RESTORED');
    const Lc = X.stepLighting(dt); hemi.intensity = 0.62 * Lc.hemi * (settings().brightness ?? 1); scene.fog.density = Lc.fog * (s.hidden ? 1.4 : 1);
    L.lamps.forEach(l => { let f = 1; const t2 = s.t + l.seed; if (l.kind === 'fluor') f = Math.random() < 0.02 ? 0.15 : 0.85 + Math.sin(t2 * 50) * 0.03; else if (l.kind === 'emergency') f = s.flags.power ? 0.25 : (Math.sin(t2 * 2.2) > -0.2 ? 1 : 0.1); else if (l.kind === 'clinical') f = (t2 % 6) < 0.25 ? (Math.random() < 0.5 ? 0.1 : 1) : 1; else if (l.kind === 'bulb') { f = 0.9 + Math.sin(t2 * 1.3) * 0.08; l.pl.position.x = l.bulb.position.x + Math.sin(t2 * 0.9) * 0.08; }
      if (dE < 9 && Math.hypot(l.pl.position.x - e.x, l.pl.position.z - e.z) < 10 && Math.random() < 0.35) f *= 0.1; if (s.zoneDark && s.t < s.zoneDark.until && l.zone === s.zoneDark.z) f = 0; l.pl.intensity = l.base * Lc.zone * f * (s.flags.power && (l.kind === 'fluor' || l.kind === 'clinical') ? 1.3 : 1); });
    if (L.fixtureMat.emissive) L.fixtureMat.emissive.setScalar(s.flags.power ? 0.75 * Lc.zone : 0.04 * Lc.zone);
    // flashlight: from the controlled sibling's hand, along the camera's aim
    if (s.light) s.battery = Math.max(0, s.battery - dt * 0.4); else s.battery = Math.min(100, s.battery + dt * 1.4);
    let li = s.light && s.battery > 0 ? 1.9 : 0; if (s.battery < 15 && s.light) li *= Math.random() < 0.15 ? 0.2 : 1; if ((s.flickerUntil && s.t < s.flickerUntil) || (dE < 7 && Math.random() < 0.25)) li *= Math.random() < 0.5 ? 0.05 : 1;
    spot.intensity = s.hidden || a.health === 'CAPTURED' ? 0 : li; spot.position.set(a.x + Math.cos(K.state.yaw) * 0.25, 1.35, a.z - Math.sin(K.state.yaw) * 0.25); spotTarget.position.set(a.x + fxv * 10, 1.35 + Math.sin(K.state.pitch) * 8, a.z + fzv * 10);
    // camera: context, then collision-aware over-the-shoulder
    K.setContext(s.hidden ? 'hidden' : a.grabbed ? 'threat' : (e.state === 'hunt' && dE < 12) ? (dE < 6 ? 'threat' : 'danger') : input.crouch ? 'crouch' : (s.powerFrameUntil > s.t ? 'power' : 'explore'));
    if (s.hidden) { const lp = L.center(s.hidden.o.userData.c, s.hidden.o.userData.r); camera.position.set(lp.x + (s.hidden.x - lp.x) * 0.25, 1.55, lp.z + (s.hidden.z - lp.z) * 0.25); camera.lookAt(s.hidden.x, 1.5, s.hidden.z); }
    else K.update(camera, L, { x: a.x, z: a.z, crouch: input.crouch }, dt);
    A.setListener(camera.position.x, camera.position.y, camera.position.z, K.state.yaw);
    // director 2.0
    const free = s.sibs.filter(b => b.health !== 'CAPTURED'), sep = free.length > 1 ? Math.max(...free.map(b => Math.hypot(b.x - a.x, b.z - a.z))) : 0;
    const prog = ['fuseboxSeen', 'cabinetMoved', 'falseGone', 'fuseTaken', 'power'].filter(k => s.flags[k]).length / 5;
    const dir = D.update(dt, { dark: !s.flags.power, dist: dE, hunting: e.state === 'hunt' || e.state === 'grab', hidden: !!s.hidden, provoked: !!s.flags.fuseTaken, health: { STABLE: 0, HURT: 1, CRITICAL: 2 }[a.health] || 0, speed: mySpeed, zone: L.zoneOf(...L.cell(a.x, a.z)), progress: prog, hollowStage: s.hollowStage, echoActive: s.echoActive && s.t - s.echoActive < 20, separation: sep, t: s.t }, fire);
    A.setIntensity(dir.k, dir.silence);
    s.heartT = (s.heartT || 0) - dt; if ((dir.k > 0.55 || a.health === 'CRITICAL') && s.heartT <= 0) { s.heartT = 1.2 - Math.max(dir.k, a.health === 'CRITICAL' ? 0.8 : 0) * 0.6; A.heart(Math.max(dir.k, a.health === 'CRITICAL' ? 0.8 : 0) - 0.4); }
    DL.tick();
    // contextual discovery comments (a companion notices, points, and explains — nobody reads a manual)
    const nearObj = (kind, dmax) => L.objects.some(o => { if (o.userData.kind !== kind) return false; const p = L.center(o.userData.c, o.userData.r); return Math.hypot(p.x - a.x, p.z - a.z) < dmax; });
    if (!s.flags.cabinetMoved && nearObj('cabinet', 6)) once('cab', () => { s.flags.cabinetSeen = true; T13.ui.obj(objectiveText()); say('gabriel', a.id === 'gabriel' ? 'That cabinet’s blocking the ward. I can move it. [✦]' : 'That cabinet’s blocking the ward. Let me — switch to me, or give me a second.', 4200, [18, 7]); });
    if (s.flags.cabinetMoved && !s.flags.falseGone && nearObj('falsewall', 6)) once('fw', () => say('daniel', a.id === 'daniel' ? 'That wall doesn’t belong on the plan. Let me look. [✦]' : 'Hold on. That wall shouldn’t be there.', 4200, [22, 9]));
    if (s.echo && !s.echo.outcome && Math.hypot(s.echo.x - a.x, s.echo.z - a.z) < 7) once('echoSeen', () => { bark('echo', 'mara'); say('mara', 'There’s someone in here. Not the thing — a woman. Let me talk to her. [✦]', 4200, [23, 2]); });
    if (e.state !== 'dormant' && dE < 13) once('sense', () => say('mara', a.id === 'mara' ? 'It’s here. I can feel where it is. [✦]' : 'It’s here. I can feel it.', 3000, null, 'warning'));
    // AI auto-completes the story beats it owns if the player doesn't switch: Gabriel shifts the cabinet, Daniel reads the wall (competent, not required)
    const gab = s.sibs.find(b => b.id === 'gabriel'), dan = s.sibs.find(b => b.id === 'daniel');
    if (s.flags.cabinetSeen && !s.flags.cabinetMoved && gab !== a && gab.health !== 'CAPTURED' && a.still > 3 && near2(gab, 18, 7, 6.5)) SB.use(gab, SB.POWERS.PUSH);
    if (s.flags.cabinetMoved && !s.flags.falseGone && dan !== a && dan.health !== 'CAPTURED' && a.still > 3 && near2(dan, 22, 9, 7)) SB.use(dan, SB.POWERS.UNMASK);
    // HUD
    const tg = s.hidden ? null : lookTarget(); T13.ui.prompt(s.hidden ? 'Leave the locker' : a.grabbed ? 'STRUGGLE — tap ✋' : promptFor(tg));
    T13.ui.fear(dir.k, dir.state, s.hidden, s.battery, s.stamina);
    const bp = SB.best(a); T13.ui.power(bp ? bp.label : '', !!bp, a.id);
    const cap = s.sibs.find(b => b.health === 'CAPTURED'); if (cap && (s.captureDir -= dt) <= 0) { s.captureDir = 12; const ang = Math.atan2(-(cap.x - a.x), -(cap.z - a.z)) - K.state.yaw, n = Math.atan2(Math.sin(ang), Math.cos(ang)); T13.ui.senseCue(Math.abs(n) < 0.6 ? 'ahead' : Math.abs(n) > 2.4 ? 'behind' : n > 0 ? 'left' : 'right', cap.name); }
    if ((s.hudT = (s.hudT || 0) - dt) <= 0) { s.hudT = 0.25; updateTeam(); }
    if (G.DEBUG && (s.dbgT = (s.dbgT || 0) - dt) <= 0) { s.dbgT = 0.2; let el = document.getElementById('dbg'); if (!el) { el = document.createElement('div'); el.id = 'dbg'; el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:30;font:11px/1.35 monospace;color:#cfe;background:#000b;padding:6px 8px;border-radius:4px;pointer-events:none;white-space:pre;max-width:46vw'; document.body.appendChild(el); }
      const ev = D.events.slice(-4).map(x => `${x.t}s ${x.state} → ${x.ev}`).join('\n'), st = A.stageLog.slice(-1)[0], lg = SB.log.slice(-3).map(x => `${x.t}s ${x.ev}${x.step ? ':' + x.step : ''}${x.power ? ':' + x.power : ''} ${x.who || x.by || ''}`).join('\n');
      el.textContent = `FEAR DIRECTOR ${D.state} k=${D.k.toFixed(2)} builds=${D.builds}\n${ev}\nHOLLOW ${e.state} · AUDIO STAGE ${s.hollowStage}${st ? ' (last cue ' + st.stage + ')' : ''} · dist ${dE.toFixed(1)}m\nCAMERA ${K.state.ctx} boom ${K.state.dist.toFixed(2)}m\n` + s.sibs.map((b, i) => `${i === s.active ? '▶' : ' '} ${b.name.padEnd(8)} ${b.health.padEnd(8)} ${(i === s.active ? 'PLAYER' : (b.mode || '-')).padEnd(11)} ${b.grabbed ? 'GRABBED ' + (SB.GRAB_WINDOW - b.grabbed.t).toFixed(1) + 's' : ''}`).join('\n') + `\n${lg}`; }
    renderer.render(scene, camera); X.perfTick(renderer);
  }

  G.debug = () => s && ({ t: +s.t.toFixed(1), stage: s.stage, flags: { ...s.flags }, active: cur().id, pos: [+cur().x.toFixed(2), +cur().z.toFixed(2)], enemy: { state: s.enemy.state, x: +s.enemy.x.toFixed(1), z: +s.enemy.z.toFixed(1), buff: s.enemy.buff }, director: D.state, k: +D.k.toFixed(2), hidden: !!s.hidden, dead: s.ritual, health: Object.fromEntries(s.sibs.map(b => [b.id, b.health + (b.grabbed ? '+GRABBED' : '')])), modes: Object.fromEntries(s.sibs.map(b => [b.id, b.mode || '-'])), hollowStage: s.hollowStage, cam: { ctx: K.state.ctx, dist: +K.state.dist.toFixed(2) }, stats });
  G.dev = { lighting: st2 => X.setLighting(st2, st2 === 'NORMAL' ? 0 : 60), reveal: m => { if (s) { s.forceReveal = m; enemyMesh.visible = true; } }, teleport: (c, r) => { const p = L.center(c, r); cur().x = p.x; cur().z = p.z; }, face: yaw => { K.state.yaw = yaw; cur().yaw = yaw; }, state: () => s, grab: id => SB.grab(s.sibs.find(b => b.id === id)), capture: id => SB.capture(s.sibs.find(b => b.id === id)), hazard: (t, c, r) => HZ.trigger(t, c, r, { now: s.t }), echo: o => resolveEcho(o), fire: ev => fire(ev) };
})();
