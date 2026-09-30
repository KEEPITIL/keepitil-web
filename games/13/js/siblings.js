/* THE THREE — health states, capture/rescue, powers registry, companion AI, team combinations.
   Health: STABLE → HURT → CRITICAL → CAPTURED (no health bar; readable through posture, breathing, faces, VO).
   The Hollow GRABS (it needs them alive). A grab opens a rescue window; AI siblings respond on their own; the player may switch in.
   Failed rescue → CAPTURED (sibling hidden in the level; the others sense roughly where). 3 captured → ritual → checkpoint. */
(function () {
  const S = T13.sibs = {}, V = THREE.Vector3;
  S.HEALTH = ['STABLE', 'HURT', 'CRITICAL', 'CAPTURED'];
  S.GRAB_WINDOW = 5;
  let G = null;   // game context: { L, list(), active(), enemy(), now(), say, bark, noise, setDoor, shake, flash, hazards, echoes, throwables, holdCells, onCapture, onAllCaptured, sense }
  S.init = ctx => { G = ctx; S.log = []; };
  const log = (e) => { S.log.push({ t: +G.now().toFixed(2), ...e }); if (S.log.length > 400) S.log.shift(); };
  const alive = () => G.list().filter(b => b.health !== 'CAPTURED');
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  /* ---------- health ---------- */
  S.hurt = (b, amount = 1, why = '') => { if (b.health === 'CAPTURED' || b.grabbed) return; const i = S.HEALTH.indexOf(b.health); b.health = S.HEALTH[Math.min(2, i + amount)]; b.lastHurt = G.now(); log({ ev: 'hurt', who: b.id, health: b.health, why }); G.bark('injury', b.id); b.p && b.p.act('flinch'); if (b === G.active()) { G.flash(0.25); G.shake(0.4); T13.ui.vibrate && T13.ui.vibrate(120); } };
  S.heal = (b, to = 'STABLE') => { if (b.health === 'CAPTURED') return; b.health = to; log({ ev: 'heal', who: b.id, health: to }); };
  S.stepHealth = (dt) => { const e = G.enemy(); G.list().forEach(b => { if (b.health === 'HURT' || b.health === 'CRITICAL') { const safe = !e || e.state === 'dormant' || Math.hypot(e.x - b.x, e.z - b.z) > 15; b.safeT = safe ? (b.safeT || 0) + dt : 0; if (b.safeT > 25) { b.health = b.health === 'CRITICAL' ? 'HURT' : 'STABLE'; b.safeT = 0; log({ ev: 'recover', who: b.id, health: b.health }); } } }); };
  S.speedMul = b => b.health === 'CRITICAL' ? 0.55 : b.health === 'HURT' ? 0.8 : 1;

  /* ---------- grab / rescue / capture ---------- */
  S.grab = (b) => { if (b.grabbed || b.health === 'CAPTURED') return false; b.grabbed = { t: 0 }; const e = G.enemy(); e.grabbing = b; e.state = 'grab'; log({ ev: 'grab', who: b.id, active: b === G.active() }); G.bark('rescue', G.list().find(o => o !== b && o.health !== 'CAPTURED')?.id); G.shake(0.6); if (b === G.active() && T13.ui.vibrate) T13.ui.vibrate([80, 60, 200]); return true; };
  S.rescue = (by, how) => { const e = G.enemy(); const b = e && e.grabbing; if (!b) return false; b.grabbed = null; e.grabbing = null; e.state = 'stagger'; e.stag = 3.5; S.hurt(b, 1, 'grab'); log({ ev: 'rescued', who: b.id, by: by && by.id, how }); G.bark('rescue', by && by.id); return true; };
  S.capture = (b) => { const e = G.enemy(); b.grabbed = null; if (e) e.grabbing = null; b.health = 'CAPTURED'; const cell = G.holdCell(b); b.capturedAt = cell; const p = G.L.center(cell[0], cell[1]); b.x = p.x; b.z = p.z; log({ ev: 'captured', who: b.id, cell });
    if (e) { e.state = 'flee'; e.t = 9; } G.onCapture && G.onCapture(b);
    const left = alive(); if (!left.length) { log({ ev: 'ritual' }); G.onAllCaptured && G.onAllCaptured(); return; }
    G.bark('captured', left[0].id); };
  S.free = (b, by) => { if (b.health !== 'CAPTURED') return false; b.health = 'HURT'; b.capturedAt = null; log({ ev: 'freed', who: b.id, by: by && by.id }); return true; };
  S.stepGrab = (dt) => { const e = G.enemy(); const b = e && e.grabbing; if (!b) return; b.grabbed.t += dt; e.x += (b.x - e.x) * 0.2; e.z += (b.z - e.z) * 0.2; if (b.grabbed.t >= S.GRAB_WINDOW) S.capture(b); };

  /* ---------- powers ---------- */
  const P = S.POWERS = {};
  const def = (id, owner, cd, label, score, use, o = {}) => { P[id] = { id, owner, cd, label, score, use, ...o }; };
  const near = (a, x, z, r) => Math.hypot(a.x - x, a.z - z) < r;
  const facing = (a, x, z, cos = 0.5) => { const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw), d = Math.hypot(x - a.x, z - a.z) || 1; return ((x - a.x) * fx + (z - a.z) * fz) / d > cos; };
  const E = () => G.enemy(), eVisible = (a, r = 14) => { const e = E(); return e && e.state !== 'dormant' && e.visible !== false && Math.hypot(e.x - a.x, e.z - a.z) < r && G.L.los(a.x, a.z, e.x, e.z); };
  const grabbedNear = (a, r) => { const e = E(); return e && e.grabbing && e.grabbing !== a && Math.hypot(e.grabbing.x - a.x, e.grabbing.z - a.z) < r; };
  // MARA — MIND
  def('SENSE', 'mara', 10, 'Sense', a => 2, (a) => { const t = G.sense(a); if (!t) { G.say('mara', 'Nothing. It’s quiet — too quiet.'); return true; } G.senseCue(t); G.say('mara', t.line); return true; });
  def('PSYCHOMETRY', 'mara', 6, 'Psychometry', a => G.memoryNear(a) ? 9 : 0, (a) => G.readMemory(a, G.memoryNear(a)));
  def('ECHO_COMMUNICATION', 'mara', 3, 'Speak with Echo', a => { const ec = G.echoNear(a); return ec && !ec.outcome ? 10 : 0; }, (a) => G.talkEcho(a, G.echoNear(a)));
  def('DISCERNMENT', 'mara', 12, 'Discernment', a => (grabbedNear(a, 9) ? 8 : 0) || (eVisible(a, 12) ? 6 : 0) || (G.recentFalseVoice() ? 7 : 0), (a) => { const e = E(); a.discernUntil = G.now() + 8; if (e && eVisible(a, 12)) { e.identifiedUntil = G.now() + 8; log({ ev: 'combo', step: 'identified', by: a.id }); } if (grabbedNear(a, 9)) { S.rescue(a, 'disrupt'); } G.say('mara', e && e.identifiedUntil > G.now() ? 'I see it — that’s the thing wearing a voice. Daniel!' : 'Listen with me. Not every voice here is ours.'); return true; }, { ai: true });
  // GABRIEL — FORCE
  def('PUSH', 'gabriel', 8, 'Push', a => { const e = E(); if (e && e.state !== 'dormant' && near(a, e.x, e.z, 5.5) && facing(a, e.x, e.z)) return grabbedNear(a, 7) ? 10 : 8; return G.cabinetNear(a) ? 9 : G.doorNear(a) ? 2 : 0; }, (a) => G.push(a), { ai: true });
  def('PULL', 'gabriel', 6, 'Pull', a => G.throwableNear(a, 9, true) ? 3 : 0, (a) => G.pull(a));
  def('THROW', 'gabriel', 7, 'Throw', a => { const e = E(); return e && e.state !== 'dormant' && eVisible(a, 11) && G.throwableNear(a, 6) ? 9 : 0; }, (a) => G.throwAt(a), { ai: true });
  def('WARD', 'gabriel', 16, 'Ward', a => { const e = E(); return e && e.state === 'hunt' && near(a, e.x, e.z, 7) ? 7 : 0; }, (a) => { a.wardUntil = G.now() + 6; G.say('gabriel', 'Behind me. Nothing gets through.'); log({ ev: 'ward', by: a.id }); return true; }, { ai: true });
  def('RESCUE', 'gabriel', 5, 'Rescue', a => grabbedNear(a, 10) ? 11 : 0, (a) => S.rescue(a, 'force'), { ai: true });
  def('HOLD', 'gabriel', 12, 'Hold door', a => { const d = G.doorNear(a); const e = E(); return d && e && e.state === 'hunt' ? 6 : 0; }, (a) => { const d = G.doorNear(a); if (!d) return false; G.setDoor(d, false, true); d.userData.jammedUntil = G.now() + 8; G.say('gabriel', 'I’ve got the door — GO!'); log({ ev: 'hold', by: a.id }); return true; });
  // DANIEL — REALITY
  def('PERCEPTION', 'daniel', 10, 'Perception', a => 2, (a) => { a.perceiveUntil = G.now() + 8; G.say('daniel', 'Okay. Let me see what’s actually in here.'); return true; });
  def('RECONSTRUCTION', 'daniel', 10, 'Reconstruction', a => G.reconstructNear(a) ? 9 : 0, (a) => G.reconstruct(a, G.reconstructNear(a)));
  def('UNMASK', 'daniel', 10, 'Unmask', a => (G.falseWallNear(a) ? 10 : 0) || (eVisible(a, 12) && E().identifiedUntil > G.now() ? 9 : 0) || (grabbedNear(a, 8) ? 7 : 0), (a) => { const e = E(); a.unmaskUntil = G.now() + 8; if (G.falseWallNear(a)) return G.unmaskWall(a); if (grabbedNear(a, 8)) { S.rescue(a, 'destabilize'); return true; } if (e && e.identifiedUntil > G.now() && eVisible(a, 12)) { e.exposedUntil = G.now() + 6; log({ ev: 'combo', step: 'exposed', by: a.id }); G.say('daniel', 'Got it — it’s solid now! Gabriel, HIT IT!'); return true; } G.say('daniel', 'Looking at what’s actually here…'); return true; }, { ai: true });
  def('STABILIZE', 'daniel', 9, 'Stabilize', a => (G.hazards.active.some(h => !h.stabilized && ['fire', 'electrical_failure', 'ceiling_collapse', 'falling_beam', 'blocked_passage', 'furniture_move'].includes(h.type) && Math.hypot(G.L.center(h.c, h.r).x - a.x, G.L.center(h.c, h.r).z - a.z) < 6) ? 8 : 0), (a) => { const h = G.hazards.stabilize(a.x, a.z); if (h) { G.say('daniel', 'Hold still— there. It’s just a room again.'); log({ ev: 'stabilize', by: a.id, hazard: h.type }); return true; } return false; }, { ai: true });
  def('EXPOSE', 'daniel', 20, 'Expose', a => 0, (a) => false, { locked: true, note: 'Later ability: force a supernatural entity fully physical. Architecture present; unlocked by campaign progression.' });
  S.forSibling = id => Object.values(P).filter(p => p.owner === id && !p.locked);
  /* contextual pick: the best-scoring ready power for this sibling right now */
  S.best = (a) => { const now = G.now(); let best = null, bs = 0; S.forSibling(a.id).forEach(p => { if ((a.cds[p.id] || 0) > now) return; const sc = p.score(a); if (sc > bs) { bs = sc; best = p; } }); return best; };
  S.use = (a, p) => { if (!p) return false; const now = G.now(); if ((a.cds[p.id] || 0) > now) return false; const ok = p.use(a); if (ok !== false) { a.cds[p.id] = now + p.cd; log({ ev: 'power', who: a.id, power: p.id, ai: a !== G.active() }); T13.audio.ability && T13.audio.ability(a.id); a.p && a.p.act(p.id === 'PUSH' || p.id === 'THROW' || p.id === 'RESCUE' ? 'point' : 'guard', G.enemyPos()); } return ok !== false; };

  /* ---------- companion AI ---------- */
  const TICK = 0.25;
  S.think = (b, dt) => {
    if (b === G.active() || b.health === 'CAPTURED' || b.grabbed) return;
    b.aiT = (b.aiT || 0) - dt; if (b.aiT > 0) return; b.aiT = TICK + Math.random() * 0.1;
    const lead = G.active(), e = E(), now = G.now();
    // 1) rescue a grabbed sibling — immediately, with the right tool
    if (e && e.grabbing && e.grabbing !== b) { const pw = S.forSibling(b.id).filter(p => p.ai && (a => p.score(a))(b) >= 7).sort((p, q) => q.score(b) - p.score(b))[0];
      if (pw && S.use(b, pw)) { b.mode = 'RESCUE'; return; } b.mode = 'RESCUE'; b.goal = { x: e.grabbing.x, z: e.grabbing.z, r: 2.5 }; return; }
    // 2) team combination / defence when the Hollow is in play
    if (e && e.state !== 'dormant' && eVisible(b, 12)) { b.mode = 'DEFEND';
      b.yaw = Math.atan2(-(e.x - b.x), -(e.z - b.z));   // turn to face the threat before acting
      // Gabriel closes in on an EXPOSED Hollow to repel it (the payoff of Mara→Daniel)
      if (b.id === 'gabriel' && e.exposedUntil > now && dist(b, e) > 5) { b.goal = { x: e.x + (b.x - e.x) / dist(b, e) * 4.2, z: e.z + (b.z - e.z) / dist(b, e) * 4.2, r: 0.6 }; b.mode = 'ENGAGE'; if (G.throwableNear(b, 6) && P.THROW.score(b) > 0) S.use(b, P.THROW); return; }
      const order = b.id === 'mara' ? ['DISCERNMENT'] : b.id === 'daniel' ? ['UNMASK', 'STABILIZE'] : ['PUSH', 'THROW', 'WARD'];
      for (const id of order) { const p = P[id]; if (p.score(b) >= 6 && S.use(b, p)) break; }
      // keep distance; protect a critical sibling by standing between
      const d = dist(b, e); const crit = alive().find(o => o.health === 'CRITICAL' && o !== b); if (b.id === 'gabriel' && crit && d < 9) { b.goal = { x: (crit.x + e.x) / 2, z: (crit.z + e.z) / 2, r: 1 }; return; }
      if (d < 4.5) { b.goal = { x: b.x - (e.x - b.x) / d * 3, z: b.z - (e.z - b.z) / d * 3, r: 0.8, flee: true }; return; } }
    // 3) stabilize nearby hazards on their own (Daniel)
    if (b.id === 'daniel' && P.STABILIZE.score(b) > 0 && S.use(b, P.STABILIZE)) return;
    // 4) captured sibling → the nearest free sibling heads toward them if the leader is close enough
    // 5) investigate a fresh sound or discovery if things are calm and the leader has paused
    const snd = G.freshSound(b); if (snd && lead.still > 2.5 && dist(b, lead) < 8 && (!e || e.state !== 'hunt')) { b.mode = 'INVESTIGATE'; b.goal = { x: snd.x, z: snd.z, r: 1.6, until: now + 4 }; return; }
    if (b.mode === 'INVESTIGATE' && b.goal && b.goal.until > now) return;
    // 6) follow: a formation slot behind the leader, left or right
    const k = G.list().filter(o => o !== lead && o.health !== 'CAPTURED').indexOf(b), side = k === 0 ? 1 : -1, fx = -Math.sin(lead.yaw), fz = -Math.cos(lead.yaw);
    b.mode = 'FOLLOW'; b.goal = { x: lead.x - fx * 1.5 + fz * side * 1.1, z: lead.z - fz * 1.5 - fx * side * 1.1, r: 0.7 };
    if (dist(b, lead) > 14 && !b.sepBark) { b.sepBark = true; G.bark('separation', b.id); } if (dist(b, lead) < 8) b.sepBark = false;
  };
  /* steering along a grid path to b.goal, avoiding hazards; returns speed moved */
  S.steer = (b, dt, collide) => {
    if (b === G.active() || b.health === 'CAPTURED' || b.grabbed || !b.goal) return 0;
    const L = G.L, g = b.goal; const d = Math.hypot(g.x - b.x, g.z - b.z); if (d < g.r) return 0;
    b.repath = (b.repath || 0) - dt; if (b.repath <= 0 || !b.path) { b.repath = 0.6; const from = L.cell(b.x, b.z), to = L.cell(g.x, g.z); b.path = L.path(from, to, (c, r) => G.hazards.dangerous(c, r)) || null; b.pi = 1; }
    let tx = g.x, tz = g.z; if (b.path && b.pi < b.path.length) { const p = L.center(b.path[b.pi][0], b.path[b.pi][1]); if (Math.hypot(p.x - b.x, p.z - b.z) < 0.6) b.pi++; else { tx = p.x; tz = p.z; } }
    const [cc, rr] = L.cell(b.x, b.z); const lead = G.active(); const hurry = g.flee || b.mode === 'RESCUE' || dist(b, lead) > 6;
    const sp = (hurry ? 4.2 : Math.min(2.6, 1 + dist(b, lead) * 0.5)) * S.speedMul(b) * G.hazards.slow(cc, rr);
    const dx = tx - b.x, dz = tz - b.z, dd = Math.hypot(dx, dz) || 1; collide(b, b.x + dx / dd * sp * dt, b.z + dz / dd * sp * dt, 0.25); b.yaw = Math.atan2(-dx, -dz); return sp;
  };
})();
