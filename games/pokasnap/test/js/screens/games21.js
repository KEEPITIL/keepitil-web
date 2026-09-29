/* ROTATING GAMES + PLAYABLE TRAINING (2.1)
   ---------------------------------------------------------------------------
   Every game here is real play, not a progress button:
     Poka Racing (team)    — run an obstacle course: TAP hurdles, HOLD through tunnels, TAP-TAP-TAP the weave,
                             TAP on green at gates, TAP the beam marker. Time + mistakes go to the server,
                             which computes the team points.
     Community Build (team)— drag the next piece onto the glowing spot; the server records the action and
                             the shared project grows for everyone on the team.
     Treasure Dig (solo)   — 6×6 grid, 3 hidden treasures; each dig shows how many treasures touch it. Decide.
     Fashion Show (solo)   — theme → Poka → outfit → runway → SNAP each pose at its peak.
     Dance Party (solo)    — watch the sequence, then hit the cues on the beat; SNAP the finale.
   Event games spend one unit of the event currency (earned from Snap Points). Training runs the same games
   in practice mode (no currency) and levels a discipline, which gives a modest, capped edge.
   The ONE shutter is still the nav's SNAP: each game registers window.__snapAction for its photo moment. */

import { h, toast, sheet, plural, fmt, fill } from '../ui.js';
import { get, update } from '../game/state.js';
import * as W from '../game/world.js';
import * as V from '../game/v2.js';
import * as C from '../game/core21.js';
import * as Phys from '../game/physics.js';
import * as E from '../platform/events.js';
import { drawPet } from '../render/pet.js';
import { drawFurniture } from '../render/furniture.js';
import { ITEMS } from '../data/items.js';
import { starsFor } from '../data/progression.js';
import * as album from '../game/album.js';
import { track } from '../platform/analytics.js';
import { sfx } from '../platform/sound.js';
import { haptic } from '../platform/native.js';
import { navBar } from './nav.js';
import { celebrateSet } from './album21.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const GW = 900;
/** A full-screen game: header, canvas stage, overlay, the permanent bar (its SNAP is this game's shutter). */
function shell(app, title, back, sub = '') {
  const canvas = h('canvas', { class: 'g21-canvas' }), overlay = h('div', { class: 'g21-overlay' }), hud = h('div', { class: 'g21-hud' });
  const stage = h('div', { class: 'g21-stage' }, canvas, hud, overlay);
  const head = h('div', { class: 'g21-head' }, h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => app.go(back) }, '←'), h('div', {}, h('b', {}, title), sub ? h('small', {}, sub) : null));
  const nav = navBar(app, 'snap');
  app.mount(h('div', { class: 'screen game21' }, head, stage, nav));
  const ctx = canvas.getContext('2d'); let GH = 1200;
  const size = () => { const r = stage.getBoundingClientRect(); if (!r.width) return; GH = Math.round(GW * r.height / r.width); canvas.width = GW; canvas.height = GH; };
  size(); const ro = new ResizeObserver(size); ro.observe(stage);
  const snapState = s => { const b = nav.querySelector('.nav-snap'); if (b) b.dataset.state = s; };
  return { canvas, ctx, overlay, hud, stage, nav, get GH() { return GH; }, ro, snapState };
}
const leadPet = () => W.activePets(get())[0] || get().pet;
function petAt(ctx, pet, x, y, k, pose, t, flip = 1) { ctx.save(); ctx.translate(x, y); ctx.scale(k * flip, k); drawPet(ctx, pet, pose, { t, alive: true }); ctx.restore(); }
const idemFor = (ev, n) => `${ev.id}-${ev.key.slice(-5)}-${n}-${Math.random().toString(36).slice(2, 8)}`;

/** Save a game photo through the SAME spine as the world (Album + SP + event). facts = show metadata. */
async function gamePhoto(app, canvas, facts) {
  const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.88)), id = 'g' + Date.now().toString(36);
  const score = clamp(Math.round(facts.score), 25, 100), stars = starsFor(score), pet = leadPet();
  let rec; update(x => { rec = W.recordPhoto(x, { id, missionId: `game:${facts.show || facts.training}`, score, stars, poseId: facts.pose || 'happy', subjects: [pet.id], location: 'event', rarity: facts.rarity || 'common', ...facts }); });
  await album.add({ id, blob, petName: pet.name, missionID: `game:${facts.show || facts.training}`, missionTitle: facts.title || 'Event', score, poseId: facts.pose || 'happy', caption: '', fav: false });
  const v = rec.v2 || {}, sp = v.sp || { total: 0, items: [] }, a = v.album || {};
  const url = URL.createObjectURL(blob);
  const layer = h('div', { class: 'levelup snap-result r21' }, h('div', { class: 'card' },
    h('img', { src: url, class: 'hl-photo', alt: 'Your photo' }),
    h('div', { class: 'sp-box' }, h('div', { class: 'sp-total' }, h('span', {}, '⚡'), h('b', {}, `+${sp.total} SP`)), h('div', { class: 'sp-lines' }, h('span', {}, `Photo score ${sp.base}`), ...sp.items.map(i => h('span', {}, `${i.label} +${i.n}`)))),
    a.slot ? h('div', { class: 'album-unlock' }, h('div', { class: 'au-card' }, h('img', { src: url, alt: '' }), h('span', {}, a.slot.slotName)), h('div', {}, h('small', {}, 'NEW ALBUM PHOTO'), h('b', {}, `${a.slot.setIcon} ${a.slot.setName}`), h('span', { class: 'small' }, a.slot.slotName)))
      : a.duplicate ? h('p', { class: 'small' }, `Already in your Album — +${C.DUPLICATE_SP} SP.`) : a.capped ? h('p', { class: 'small dup-line' }, `📖 Today's ${C.SEASON.dailyNew} new Album photos are in — this moment will count again tomorrow.`) : null,
    h('button', { class: 'btn block', onclick: () => layer.remove() }, 'OK')));
  document.body.append(layer);
  if (a.setComplete) setTimeout(() => celebrateSet(app, a.slot.set, a.seasonComplete), 800);
  return rec;
}
function finishCard(title, lines, actions) {
  const l = h('div', { class: 'levelup' }, h('div', { class: 'card g21-finish' }, h('h2', {}, title), ...lines.map(x => typeof x === 'string' ? h('p', { class: 'small' }, x) : x), h('div', { class: 'res-actions' }, ...actions.map(([t, f, primary]) => h('button', { class: 'btn' + (primary ? '' : ' ghost'), onclick: () => { l.remove(); f(); } }, t)))));
  document.body.append(l); return l;
}
/** Event unit gate: returns true if a unit was spent (or this is practice). */
function spendUnit(ev, practice) {
  if (practice) return true;
  let r; update(x => { r = C.spendEventUnit(x, ev); });
  if (!r.ok) { toast(r.reason === 'none' ? `No ${ev.conversion.currency} yet — take photos in the world to earn Snap Points (${ev.conversion.sp} SP each).` : 'This event isn\'t running now.', 3600); return false; }
  update(x => V.note(x, 'event_actions')); return true;
}

/* ================================================================ POKA RACING */
const OBST = { hurdle: { name: 'Hurdle', how: 'TAP to jump', icon: '🚧' }, tunnel: { name: 'Tunnel', how: 'HOLD through', icon: '🕳️' }, weave: { name: 'Weave', how: 'TAP-TAP-TAP', icon: '〰️' },
  gate: { name: 'Gate', how: 'TAP on green', icon: '🚦' }, balance: { name: 'Balance Beam', how: 'TAP when centred', icon: '➖' } };
export function raceScreen(app, { practice = false } = {}) {
  const ev = C.currentEvent(), pet = leadPet(), lvl = C.trainLevel(get(), pet.id, 'agility');
  if (!practice && ev?.id !== 'racing') { app.go('event21'); return; }
  const G = shell(app, practice ? 'Agility Training' : 'Poka Racing', practice ? 'training21' : 'event21', practice ? `Level ${lvl} · practice` : 'Team race · spend 1 Race Move to run');
  const speedK = C.benefit.raceSpeed(lvl);
  const course = Array.from({ length: 8 }, (_, i) => Object.keys(OBST)[(i * 3 + Math.floor(Math.random() * 5)) % 5]);
  let run = null, raf = 0, alive = true, pressing = false, pressAt = 0, taps = [], moment = null, lastShot = null;
  const X0 = 0.12, GAP = 0.7;   // obstacle spacing in "track widths"
  function start() {
    if (!spendUnit(ev, practice)) return;
    run = { t0: performance.now(), pos: 0, speed: 0.45 * speedK, mistakes: 0, i: 0, state: 'run', stun: 0, done: false, results: [] };
    fill(G.overlay, ); sfx.tap?.(); track('race_start', { practice });
  }
  function obstacleAt(i) { return X0 + 1.1 + i * GAP; }
  function judge(kind, ok) { const o = course[run.i]; run.results.push({ o, ok }); if (!ok) { run.mistakes++; run.stun = performance.now() + 800; haptic('light'); } else sfx.tap?.(); run.i++; if (ok && (o === 'hurdle' || o === 'tunnel') && !moment) moment = { o, until: performance.now() + 700 }; }
  G.canvas.addEventListener('pointerdown', () => {
    if (!run || run.done) return; pressing = true; pressAt = performance.now(); taps.push(pressAt);
    const d = obstacleAt(run.i) - run.pos, o = course[run.i];
    if (o === 'hurdle' && d < 0.16 && d > -0.02) judge('hurdle', d < 0.12 && d > 0.01);
    else if (o === 'gate' && d < 0.18 && d > -0.02) judge('gate', Math.floor(performance.now() / 600) % 2 === 0);
    else if (o === 'balance' && d < 0.2 && d > -0.02) judge('balance', Math.abs(Math.sin(performance.now() / 300)) < 0.35);
    else if (o === 'weave' && d < 0.24 && d > -0.04) { const recentTaps = taps.filter(t => performance.now() - t < 900).length; if (recentTaps >= 3) { judge('weave', true); taps = []; } }
  });
  G.canvas.addEventListener('pointerup', () => { pressing = false; });
  function step(dt, now) {
    if (!run || run.done) return;
    const o = course[run.i], d = obstacleAt(run.i) - run.pos;
    // tunnels need a HOLD while passing; missed obstacles count as mistakes
    if (o === 'tunnel' && d < 0.02 && d > -0.08) { if (!pressing) judge('tunnel', false); else if (d < -0.06) judge('tunnel', true); }
    else if (o && o !== 'tunnel' && d < -0.05) judge(o, false);
    const sp = now < run.stun ? run.speed * 0.35 : run.speed;
    run.pos += sp * dt;
    if (run.i >= course.length && run.pos > obstacleAt(course.length - 1) + 0.5) finish(now);
  }
  async function finish(now) {
    run.done = true; const ms = Math.round(now - run.t0), mist = run.mistakes;
    G.snapState('challenge'); moment = { o: 'finish', until: performance.now() + 4000 };
    const score = clamp(Math.round(100 - mist * 10 - Math.max(0, ms - 14000) / 300), 10, 100);
    let lines = [`Time ${(ms / 1000).toFixed(1)} s · ${plural(mist, 'mistake')}`], srv = null;
    if (practice) { let r; update(x => { r = C.trainSession(x, pet.id, 'agility', score); V.note(x, 'training'); }); lines.push(r.rewarded ? `Agility +${r.gain} XP (level ${r.level}${r.levelUp ? ' — LEVEL UP!' : ''})` : 'Practice logged (daily training XP already earned)'); run.levelUp = r.levelUp; }
    else {
      const key = idemFor(ev, 'race'); srv = await E.contribute(ev.key, 'race_run', { ms, mistakes: mist, obstacles: course.length }, key);
      if (!srv.ok && srv.reason === 'server') srv = await E.contribute(ev.key, 'race_run', { ms, mistakes: mist, obstacles: course.length }, key);   // same key: can never count twice
      if (srv.ok) { lines.push(`Team +${srv.amount} (server) · team score ${fmt(srv.team_score)}`); update(x => { const w = C.wallet(x, ev); w.progress = srv.team_score; w.local.lastTeam = srv.team_score; }); }
      else lines.push(E.REASON[srv.reason] || E.REASON.server);
      track('race_finish', { ms, mistakes: mist, team: !!srv?.ok });
    }
    lastShot = { score, ms, mist, srv };
    finishCard(mist === 0 ? '🏁 Clean run!' : '🏁 Finished!', [...lines, h('p', { class: 'small hint' }, '📸 Press SNAP now for a Photo Finish!')], [['Run again', () => start()], ['Done', () => app.go(practice ? 'training21' : 'event21'), true]]);
  }
  window.__snapAction = async () => {
    if (!moment || performance.now() > moment.until) { toast(run && !run.done ? 'SNAP when your Poka clears an obstacle or crosses the line!' : 'Start a run first.'); return; }
    const m = moment; moment = null; G.snapState('ready'); sfx.shutter(); haptic('heavy');
    await gamePhoto(app, G.canvas, { show: practice ? null : 'race', training: practice ? 'agility' : null, trainingLevelUp: !!run?.levelUp, obstacle: m.o === 'finish' ? null : m.o, finish: m.o === 'finish', place: m.o === 'finish' && lastShot?.mist === 0 ? 1 : 2, team: !practice && !!lastShot?.srv?.ok,
      score: m.o === 'finish' ? (lastShot?.score || 70) : 78, pose: m.o === 'finish' ? 'champion' : 'leap', title: 'Poka Racing' });
  };
  function draw(now) {
    const c = G.ctx, GH = G.GH, t = now / 1000, cam = run ? run.pos - 0.25 : 0;
    c.fillStyle = '#bfe8ff'; c.fillRect(0, 0, GW, GH); c.fillStyle = '#9fdc7a'; c.fillRect(0, GH * 0.58, GW, GH * 0.42); c.fillStyle = '#e8c27f'; c.fillRect(0, GH * 0.68, GW, GH * 0.12);
    for (let k = 0; k < 12; k++) { const x = ((k * 0.3 - cam * 1) % 3.6 + 3.6) % 3.6 / 3.6 * GW * 1.2 - 60; c.fillStyle = '#fff'; c.fillRect(x, GH * 0.735, 50, 8); }
    course.forEach((o, i) => { const x = (obstacleAt(i) - cam) * GW, y = GH * 0.78; if (x < -200 || x > GW + 200) return;
      c.save(); c.translate(x, y); const done = run && i < run.i;
      if (o === 'hurdle') { c.fillStyle = '#ff6b8b'; c.fillRect(-40, -110, 10, 110); c.fillRect(30, -110, 10, 110); c.fillStyle = '#ffd23f'; c.fillRect(-40, -110, 80, 16); }
      else if (o === 'tunnel') { c.fillStyle = '#5ec8f2'; c.beginPath(); c.ellipse(0, -60, 120, 70, 0, Math.PI, 0); c.lineTo(120, 0); c.lineTo(-120, 0); c.fill(); c.fillStyle = '#2f4a60'; c.beginPath(); c.ellipse(0, -40, 70, 44, 0, Math.PI, 0); c.fill(); }
      else if (o === 'weave') for (let k = 0; k < 5; k++) { c.fillStyle = k % 2 ? '#a98bf0' : '#ffd23f'; c.fillRect(-100 + k * 50, -130, 10, 130); }
      else if (o === 'gate') { const green = Math.floor(now / 600) % 2 === 0; c.fillStyle = '#6a6275'; c.fillRect(-60, -170, 12, 170); c.fillRect(48, -170, 12, 170); c.fillRect(-60, -170, 120, 12); c.fillStyle = green ? '#53d3a2' : '#e0474c'; c.beginPath(); c.arc(0, -150, 18, 0, 7); c.fill(); }
      else if (o === 'balance') { c.fillStyle = '#b97a4e'; c.fillRect(-140, -40, 280, 14); c.fillStyle = '#6b4a2a'; c.fillRect(-120, -26, 10, 26); c.fillRect(110, -26, 10, 26); const mk = Math.sin(now / 300) * 110; c.fillStyle = Math.abs(Math.sin(now / 300)) < 0.35 ? '#53d3a2' : '#ff6b8b'; c.beginPath(); c.arc(mk, -60, 14, 0, 7); c.fill(); }
      if (done) { const r = run.results[i]; c.font = '900 48px system-ui'; c.textAlign = 'center'; c.fillText(r?.ok ? '✓' : '✗', 0, -200); }
      c.restore(); });
    const fx = (obstacleAt(course.length - 1) + 0.5 - cam) * GW; c.fillStyle = '#3b2a33'; for (let k = 0; k < 8; k++) { c.fillStyle = k % 2 ? '#fff' : '#3b2a33'; c.fillRect(fx, GH * 0.58 + k * 30, 20, 30); }
    const o = run && course[run.i], d = run ? obstacleAt(run.i) - run.pos : 1;
    const jump = run && (o === 'hurdle' && d < 0.12 && d > -0.04 && run.results.length === run.i) ? 0 : 0;
    let py = GH * 0.8, pose = run ? (now < run.stun ? 'stumble' : 'leap') : 'bow';
    if (run && run.results[run.i - 1]?.ok && ['hurdle', 'gate'].includes(run.results[run.i - 1].o) && obstacleAt(run.i - 1) - run.pos > -0.12) py -= 140 * Math.sin(clamp((0.12 + (obstacleAt(run.i - 1) - run.pos)) / 0.12, 0, 1) * Math.PI);
    if (run?.done) pose = run.mistakes === 0 ? 'champion' : 'happy';
    petAt(c, pet, GW * 0.25, py + jump, 0.72, pose, t);
    if (moment && performance.now() < moment.until) { c.strokeStyle = '#ffd84a'; c.lineWidth = 14; c.strokeRect(7, 7, GW - 14, GH - 14); }
  }
  function hudDraw() {
    const v = !practice && ev ? C.eventView(get(), ev) : null, o = run && course[run.i];
    fill(G.hud, h('span', { class: 'chip' }, practice ? `🏃 Agility lv ${lvl}` : `🏁 ${v?.available ?? 0} Race Moves`), run && !run.done && o ? h('span', { class: 'chip big' }, `${OBST[o].icon} ${OBST[o].name}: ${OBST[o].how}`) : null, run ? h('span', { class: 'chip' }, `✗ ${run.mistakes}`) : null);
  }
  let last = 0; const loop = now => { if (!alive) return; const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now; step(dt, now); draw(now); if (Math.floor(now / 200) !== Math.floor((now - dt * 1000) / 200)) hudDraw(); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop); hudDraw();
  if (!practice) teamPanel(G.overlay, ev);
  G.overlay.append(h('div', { class: 'g21-start' }, h('p', {}, 'Your Poka runs by itself. Clear each obstacle:'), h('ul', { class: 'small' }, ...Object.values(OBST).map(o => h('li', {}, `${o.icon} ${o.name} — ${o.how}`))),
    h('button', { class: 'btn big block', onclick: start }, practice ? '▶ START PRACTICE' : '▶ RUN (1 Race Move)')));
  return () => { alive = false; cancelAnimationFrame(raf); G.ro.disconnect(); delete window.__snapAction; };
}
async function teamPanel(root, ev) {
  const box = h('div', { class: 'team-panel' }, h('small', {}, 'Loading your team…')); root.prepend(box);
  const s = await E.state(ev.key);
  if (!s.ok) { fill(box, h('b', {}, 'Team'), h('p', { class: 'small' }, E.REASON[s.reason] || E.REASON.server)); return s; }
  if (!s.team) { fill(box, h('b', {}, 'Team'), h('p', { class: 'small' }, 'You\'ll join a team (friends first) with your first contribution.')); return s; }
  fill(box, h('b', {}, `👥 ${s.team.name} · ${fmt(s.team.score)}${ev.id === 'build' ? ` · ${s.team.progress}%` : ''}`), h('div', { class: 'members' }, ...s.team.members.map(m => h('span', { class: m.me ? 'me' : '' }, `${m.name} ${fmt(m.amount)}`))));
  return s;
}

/* ================================================================ COMMUNITY BUILD */
const pieceIcon = p => ({ foundation: '⬛', wall: '🧱', door: '🚪', window: '🪟', tower: '🗼', bridge: '🌉', roof: '🔺', flag: '🚩', flower: '🌸', lamp: '🏮', shell: '🐚', bench: '🪑' })[p] || '🧱';
const PIECES = ['foundation', 'wall', 'wall', 'door', 'window', 'tower', 'tower', 'bridge', 'roof', 'flag', 'flower', 'lamp', 'shell', 'bench'];
export function buildScreen(app) {
  const ev = C.currentEvent(); if (ev?.id !== 'build') { app.go('event21'); return; }
  const project = ev.projects[Math.floor((ev.start / 864e5)) % ev.projects.length];
  const G = shell(app, `Community Build: ${project}`, 'event21', 'Team project · drag the next piece onto the glowing spot (1 Build Action)');
  let pct = 0, placed = 0, alive = true, raf = 0, drag = null, busy = false, snapWin = 0;
  const pet = leadPet();
  const slotXY = i => [0.2 + (i % 5) * 0.15, 0.78 - Math.floor(i / 5) * 0.14];
  async function refresh() { const s = await teamPanel(G.overlay, ev); if (s?.ok && s.team) { pct = s.team.progress; update(x => { C.wallet(x, ev).progress = pct; }); } }
  refresh();
  const tray = h('div', { class: 'build-tray' }); G.stage.append(tray);
  function drawTray() { const v = C.eventView(get(), ev), next = PIECES[placed % PIECES.length];
    fill(tray, h('span', {}, `🧱 ${v.available} Build Actions`), h('button', { class: 'piece', 'aria-label': `Drag the ${next} onto the glowing spot`, onpointerdown: e => { drag = { piece: next, x: e.clientX, y: e.clientY }; e.preventDefault(); } }, pieceIcon(next), h('small', {}, next))); }
  drawTray();
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  function mv(e) { if (drag) { drag.x = e.clientX; drag.y = e.clientY; } }
  async function up(e) {
    if (!drag || busy) { drag = null; return; } const d = drag; drag = null;
    const r = G.canvas.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height, [sx, sy] = slotXY(placed % 10);
    if (Math.hypot(x - sx, (y - sy) * 1.3) > 0.1) { toast('Drop it on the glowing spot.'); return; }
    if (!spendUnit(ev, false)) return;
    busy = true; const key = E.idem(); let res = await E.contribute(ev.key, 'build_action', { piece: d.piece }, key);
    if (!res.ok && res.reason === 'server') res = await E.contribute(ev.key, 'build_action', { piece: d.piece }, key);
    busy = false;
    if (res.ok) { placed++; pct = res.progress; update(x => { C.wallet(x, ev).progress = pct; }); sfx.reward?.(); haptic('success'); snapWin = performance.now() + 5000; G.snapState('challenge'); toast(`+${res.amount} build points · team ${pct}%`); track('build_action', { piece: d.piece, pct }); }
    else { update(x => { const w = C.wallet(x, ev); w.spent = Math.max(0, w.spent - 1); }); toast(E.REASON[res.reason] || E.REASON.server, 3200); }   // not counted → the Build Action is returned
    drawTray(); refresh();
  }
  window.__snapAction = async () => { if (performance.now() > snapWin) return toast('Place a piece, then SNAP your Poka with the build!'); snapWin = 0; G.snapState('ready'); sfx.shutter();
    await gamePhoto(app, G.canvas, { show: 'build', buildPct: pct, team: true, n: 1, score: 70 + Math.min(25, pct / 4), pose: 'happy', title: project }); };
  function draw(now) {
    const c = G.ctx, GH = G.GH, t = now / 1000; c.fillStyle = '#aee3ff'; c.fillRect(0, 0, GW, GH); c.fillStyle = '#f2d49b'; c.fillRect(0, GH * 0.62, GW, GH * 0.38); c.fillStyle = '#5ec8f2'; c.fillRect(0, GH * 0.93, GW, GH * 0.07);
    // the shared project grows with TEAM progress (from the server): 0 foundation → 25 structure → 50 big pieces → 75 decoration → 100 complete
    const stage = pct >= 100 ? 4 : pct >= 75 ? 3 : pct >= 50 ? 2 : pct >= 25 ? 1 : 0, cx = GW * 0.55, by = GH * 0.8;
    c.fillStyle = '#e0b870'; c.fillRect(cx - 240, by - 40, 480, 40);
    if (stage >= 1) { c.fillStyle = '#e8c27f'; c.fillRect(cx - 200, by - 200, 400, 160); for (let k = 0; k < 6; k++) c.fillRect(cx - 200 + k * 72, by - 230, 40, 30); }
    if (stage >= 2) { c.fillStyle = '#d9b06a'; c.fillRect(cx - 250, by - 320, 90, 280); c.fillRect(cx + 160, by - 320, 90, 280); c.fillStyle = '#8a5a3c'; c.beginPath(); c.arc(cx, by - 40, 60, Math.PI, 0); c.fill(); }
    if (stage >= 3) { c.fillStyle = '#ff6b8b'; c.beginPath(); c.moveTo(cx - 205, by - 440); c.lineTo(cx - 205, by - 380); c.lineTo(cx - 150, by - 410); c.fill(); for (let k = 0; k < 5; k++) { c.fillStyle = ['#ff6b8b', '#ffd23f', '#fff'][k % 3]; c.beginPath(); c.arc(cx - 180 + k * 90, by - 250, 14, 0, 7); c.fill(); } }
    if (stage >= 4) for (let k = 0; k < 14; k++) { c.fillStyle = ['#ff6b8b', '#ffd23f', '#53d3a2', '#a98bf0'][k % 4]; c.fillRect((k * 71 + now / 8) % GW, (k * 53 + now / 5) % (GH * 0.6), 10, 18); }
    c.fillStyle = '#3b2a33'; c.font = '900 34px system-ui'; c.textAlign = 'center'; c.fillText(`${project} · team ${pct}%`, GW / 2, GH * 0.12);
    const [sx, sy] = slotXY(placed % 10); c.save(); c.globalAlpha = 0.5 + Math.sin(t * 5) * 0.3; c.strokeStyle = '#fff'; c.lineWidth = 8; c.setLineDash([14, 10]); c.strokeRect(GW * sx - 60, GH * sy - 60, 120, 120); c.restore();
    petAt(c, pet, GW * 0.14, GH * 0.9, 0.55, snapWin > performance.now() ? 'happy' : 'look', t);
    if (drag) { const r = G.canvas.getBoundingClientRect(); c.font = '90px system-ui'; c.fillText(pieceIcon(drag.piece), (drag.x - r.left) / r.width * GW, (drag.y - r.top) / r.height * GH); }
  }
  const loop = now => { if (!alive) return; draw(now); raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop);
  return () => { alive = false; cancelAnimationFrame(raf); G.ro.disconnect(); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); delete window.__snapAction; };
}

/* ================================================================ TREASURE DIG (puzzle) */
export function newDig(seed = Date.now()) {
  let s = seed % 2147483647 || 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const cells = Array.from({ length: 36 }, () => ({ t: null, dug: false })), kinds = ['key', 'gem', 'gem'];
  for (const k of kinds) { let i; do { i = Math.floor(rnd() * 36); } while (cells[i].t); cells[i].t = k; }
  return { cells, found: 0, digs: 0, seed };
}
export const neighbours = i => { const r = Math.floor(i / 6), c = i % 6, out = []; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && r + dr >= 0 && r + dr < 6 && c + dc >= 0 && c + dc < 6) out.push((r + dr) * 6 + c + dc); return out; };
export function dig(stage, i) {
  const c = stage.cells[i]; if (!c || c.dug) return { ok: false };
  c.dug = true; stage.digs++;
  if (c.t) { stage.found++; return { ok: true, treasure: c.t, cleared: stage.found === 3 }; }
  return { ok: true, hint: neighbours(i).filter(j => stage.cells[j].t && !stage.cells[j].dug).length };
}
export function puzzleScreen(app) {
  const ev = C.currentEvent(); if (ev?.id !== 'puzzle') { app.go('event21'); return; }
  const G = shell(app, 'Treasure Dig', 'event21', 'Each dig costs 1 Puzzle Move · numbers tell how many treasures touch that square');
  update(x => { const w = C.wallet(x, ev); if (!w.local.dig || w.local.dig.found === 3) { w.local.dig = newDig(Date.now()); } w.local.streak = w.local.streak || 0; });
  const grid = h('div', { class: 'dig-grid', role: 'grid', 'aria-label': 'Treasure grid' }); G.overlay.append(grid);
  let snapWin = 0, last = null; const pet = leadPet();
  function drawGrid() {
    const w = C.wallet(get(), ev), st = w.local.dig, v = C.eventView(get(), ev);
    fill(G.hud, h('span', { class: 'chip' }, `⛏️ ${v.available} Moves`), h('span', { class: 'chip' }, `💎 ${st.found}/3 found`), h('span', { class: 'chip' }, `🏅 ${w.progress} stages`));
    fill(grid, ...st.cells.map((c, i) => h('button', { class: 'dig' + (c.dug ? ' dug' : '') + (c.dug && c.t ? ' t' : ''), role: 'gridcell', 'aria-label': c.dug ? (c.t ? `Found ${c.t}` : `${c.h ?? 0} treasures next to this square`) : `Dig square ${i + 1}`, onclick: () => tap(i) },
      c.dug ? (c.t === 'key' ? '🗝️' : c.t === 'gem' ? '💎' : String(c.h ?? '')) : '')));
  }
  function tap(i) {
    const w0 = C.wallet(get(), ev); if (w0.local.dig.cells[i].dug) return;
    if (!spendUnit(ev, false)) return;
    let r; update(x => { const w = C.wallet(x, ev); r = dig(w.local.dig, i); if (!r.treasure) w.local.dig.cells[i].h = r.hint;
      if (r.cleared) { w.progress++; const perfect = w.local.dig.digs <= 10; w.local.streak = (w.local.streak || 0) + 1; r.perfect = perfect; r.streak = w.local.streak; V.note(x, 'puzzle_stages'); } });
    haptic(r.treasure ? 'success' : 'light'); sfx[r.treasure ? 'reward' : 'tap']?.();
    if (r.treasure) { last = r; snapWin = performance.now() + 6000; G.snapState('challenge'); toast(r.cleared ? `Stage clear! ${r.perfect ? 'Perfect — ' : ''}Press SNAP to capture the find!` : `Found a ${r.treasure}! Press SNAP!`, 3000); }
    track('puzzle_dig', { treasure: r.treasure || null, cleared: !!r.cleared });
    drawGrid();
    if (r.cleared) finishCard('🗝️ Stage clear!', [`${C.wallet(get(), ev).local.dig.digs} digs${r.perfect ? ' — perfect!' : ''}`, `Stages cleared this event: ${C.wallet(get(), ev).progress}`],
      [['Next stage', () => { update(x => { C.wallet(x, ev).local.dig = newDig(Date.now()); }); drawGrid(); }, true]]);
  }
  window.__snapAction = async () => { if (performance.now() > snapWin || !last) return toast('Dig up a treasure, then SNAP the find!'); snapWin = 0; G.snapState('ready'); sfx.shutter();
    await gamePhoto(app, G.canvas, { show: 'puzzle', found: true, key: last.treasure === 'key', cleared: !!last.cleared, perfect: !!last.perfect, streak: last.streak || 0, score: last.cleared ? 88 : 76, pose: last.cleared ? 'happy' : 'sniff', title: 'Treasure Dig' }); };
  let alive = true, raf = 0;
  const loop = now => { if (!alive) return; const c = G.ctx, GH = G.GH; c.fillStyle = '#c9e7a8'; c.fillRect(0, 0, GW, GH); c.fillStyle = '#b08a5a'; c.fillRect(0, GH * 0.78, GW, GH * 0.22);
    petAt(c, pet, GW * 0.82, GH * 0.95, 0.5, snapWin > performance.now() ? 'happy' : 'sniff', now / 1000, -1); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop); drawGrid();
  return () => { alive = false; cancelAnimationFrame(raf); G.ro.disconnect(); delete window.__snapAction; };
}

/* ================================================================ FASHION SHOW */
const WEARABLE = new Set(['BODY', 'HEAD', 'NECK', 'FACE', 'BACK']);
export function fashionScreen(app, { practice = false } = {}) {
  const ev = C.currentEvent(); if (!practice && ev?.id !== 'fashion') { app.go('event21'); return; }
  const G = shell(app, practice ? 'Style Training' : 'Fashion Show', practice ? 'training21' : 'event21', practice ? 'Practice' : 'Spend 1 Show Ticket to walk the runway');
  const themes = Object.keys(C.THEMES), theme = themes[Math.floor(Math.random() * themes.length)];
  const s = get(), owned = new Set(s.inventory || []), pets = W.activePets(s);
  let pet = pets[0], outfit = {}, phase = 'prep', t0 = 0, poses = ['sitpretty', 'heart', 'bow']   /* the finale is a bow: Community Life → Curtain Call is earnable */, shots = [], raf = 0, alive = true;
  const clothes = Object.values(ITEMS).filter(i => WEARABLE.has(i.slot) && owned.has(i.itemID));
  function prep() {
    fill(G.overlay, h('div', { class: 'g21-start' },
      h('p', {}, h('b', {}, `Theme: ${C.THEMES[theme].name}`)),
      pets.length > 1 ? h('div', { class: 'chips' }, ...pets.map(p => h('button', { class: 'chipbtn' + (p.id === pet.id ? ' on' : ''), onclick: () => { pet = p; prep(); } }, p.name))) : null,
      h('p', { class: 'small' }, clothes.length ? 'Choose up to 3 pieces (one per slot):' : 'No clothes yet — earn some in the Poka Shop or events. You can still walk!'),
      h('div', { class: 'outfit-grid' }, ...clothes.slice(0, 24).map(i => h('button', { class: 'chipbtn' + (outfit[i.slot] === i.itemID ? ' on' : ''), onclick: () => { if (outfit[i.slot] === i.itemID) delete outfit[i.slot]; else if (Object.keys(outfit).length < 3 || outfit[i.slot]) outfit[i.slot] = i.itemID; prep(); } }, i.name))),
      h('p', { class: 'small' }, `Theme match: ${C.themeScore(theme, Object.values(outfit).map(id => ITEMS[id]?.draw))}/100`),
      h('button', { class: 'btn big block', onclick: walk }, practice ? '▶ WALK (practice)' : '▶ WALK THE RUNWAY (1 Ticket)')));
  }
  function walk() { if (!spendUnit(ev, practice)) return; phase = 'walk'; t0 = performance.now(); shots = []; fill(G.overlay, h('p', { class: 'g21-tip' }, '📸 Press SNAP when each pose is at its peak (the gold frame)!')); G.snapState('challenge'); }
  const holdMs = C.benefit.poseHoldMs(C.trainLevel(get(), pet.id, 'fashion'));
  const poseAt = el => { const k = Math.floor((el - 1500) / 2200); if (k < 0 || k >= poses.length) return null; const into = (el - 1500) - k * 2200; return { k, peak: Math.abs(into - 1100) < holdMs / 2, into }; };
  window.__snapAction = async () => {
    if (phase !== 'walk') return toast(phase === 'prep' ? 'Walk the runway first.' : 'Show finished.');
    const p = poseAt(performance.now() - t0); if (!p) return toast('Wait for a pose!');
    if (shots.some(x => x.k === p.k)) return toast('You already snapped this pose.');
    sfx.shutter(); haptic('heavy'); shots.push({ k: p.k, peak: p.peak, off: Math.abs(p.into - 1100) });
    if (p.peak) toast('✨ Peak!'); else toast('A little early/late…');
  };
  async function finishShow() {
    phase = 'done'; G.snapState('ready');
    const ts = C.themeScore(theme, Object.values(outfit).map(id => ITEMS[id]?.draw)), timing = shots.length ? shots.reduce((a, s) => a + Math.max(0, 100 - s.off / 12), 0) / poses.length : 0;
    const score = Math.round(ts * 0.4 + timing * 0.35 + (shots.filter(s => s.peak).length / poses.length) * 25);
    if (practice) { let r; update(x => { r = C.trainSession(x, pet.id, 'fashion', score); V.note(x, 'training'); }); }
    else update(x => { const w = C.wallet(x, ev); w.progress++; });
    track('fashion_show', { theme, score, practice });
    await gamePhoto(app, G.canvas, { show: practice ? null : 'fashion', training: practice ? 'fashion' : null, theme, showScore: score, pose: poses[poses.length - 1], dressed: Object.keys(outfit).length ? 1 : 0, score: 55 + score * 0.45, title: 'Fashion Show' });
    finishCard(`👗 ${score}/100`, [`Theme match ${ts} · timing ${Math.round(timing)} · peaks ${shots.filter(s => s.peak).length}/${poses.length}`], [['Again', () => { phase = 'prep'; prep(); }], ['Done', () => app.go(practice ? 'training21' : 'event21'), true]]);
  }
  const loop = now => { if (!alive) return; const c = G.ctx, GH = G.GH, t = now / 1000; c.fillStyle = '#3a3346'; c.fillRect(0, 0, GW, GH); c.fillStyle = '#fbe3ec'; c.fillRect(GW * 0.1, GH * 0.62, GW * 0.8, GH * 0.2);
    for (let k = 0; k < 7; k++) { c.fillStyle = 'rgba(255,250,220,.12)'; c.beginPath(); c.moveTo(GW * (0.1 + k * 0.13), 0); c.lineTo(GW * (0.05 + k * 0.13), GH * 0.8); c.lineTo(GW * (0.15 + k * 0.13), GH * 0.8); c.fill(); }
    const dressed = { ...pet, equipped: { ...(pet.equipped || {}), ...outfit } };
    let x = GW * 0.5, pose = 'idle';
    if (phase === 'walk') { const el = now - t0, p = poseAt(el); x = GW * (0.15 + clamp(el / 8600, 0, 1) * 0.7); pose = p ? poses[p.k] : 'idle';
      if (p?.peak) { c.strokeStyle = '#ffd84a'; c.lineWidth = 14; c.strokeRect(7, 7, GW - 14, GH - 14); }
      if (el > 8600) finishShow(); }
    petAt(c, dressed, x, GH * 0.8, 0.8, pose, t); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop); prep();
  return () => { alive = false; cancelAnimationFrame(raf); G.ro.disconnect(); delete window.__snapAction; };
}

/* ================================================================ DANCE PARTY */
const ARROWS = ['←', '↑', '↓', '→'];
export function danceScreen(app, { practice = false } = {}) {
  const ev = C.currentEvent(); if (!practice && ev?.id !== 'dance') { app.go('event21'); return; }
  const G = shell(app, practice ? 'Dance Training' : 'Dance Party', practice ? 'training21' : 'event21', practice ? 'Practice' : 'Spend 1 Show Ticket to dance');
  const pet = leadPet(), win = C.benefit.danceWindowMs(C.trainLevel(get(), pet.id, 'dance'));
  const seq = Array.from({ length: 12 }, () => Math.floor(Math.random() * 4));
  let phase = 'ready', t0 = 0, hits = [], combo = 0, best = 0, raf = 0, alive = true, finale = 0;
  const BEAT = 650, LEAD = 1800;
  const pads = h('div', { class: 'dance-pads' }, ...ARROWS.map((a, i) => h('button', { class: 'pad', 'aria-label': `Lane ${a}`, onpointerdown: e => { e.preventDefault(); hit(i); } }, a)));
  G.stage.append(pads); pads.hidden = true; G.overlay.style.bottom = '88px';   // instructions sit above the pads   // the pads appear only while dancing (they covered the Start button)
  function start() { if (!spendUnit(ev, practice)) return; phase = 'learn'; t0 = performance.now(); hits = []; combo = best = 0; fill(G.overlay, h('p', { class: 'g21-tip' }, 'Watch the sequence… then hit each arrow as it reaches the line!')); }
  function hit(lane) {
    if (phase !== 'play') return; const el = performance.now() - t0;
    const i = seq.findIndex((l, k) => l === lane && !hits[k] && Math.abs(el - k * BEAT) < win * 1.6);
    if (i >= 0 && Math.abs(el - i * BEAT) <= win) { hits[i] = 'perfect'; combo++; best = Math.max(best, combo); sfx.tap?.(); haptic('light'); }
    else if (i >= 0) { hits[i] = 'ok'; combo++; best = Math.max(best, combo); } else { combo = 0; }
  }
  window.__snapAction = async () => { if (phase !== 'finale' || performance.now() > finale) return toast(phase === 'play' ? 'Dance first — SNAP the finale!' : 'Start the dance.'); phase = 'done'; G.snapState('ready'); sfx.shutter(); haptic('heavy');
    const per = hits.filter(x => x === 'perfect').length, ok = hits.filter(x => x === 'ok').length, score = Math.round((per + ok * 0.5) / seq.length * 100);
    if (practice) update(x => { C.trainSession(x, pet.id, 'dance', score); V.note(x, 'training'); }); else update(x => { C.wallet(x, ev).progress++; });
    track('dance_show', { score, best, practice });
    await gamePhoto(app, G.canvas, { show: practice ? null : 'dance', training: practice ? 'dance' : null, combo: best, finale: true, showScore: score, pose: 'disco', score: 55 + score * 0.45, title: 'Dance Party' });
    finishCard(`💃 ${score}/100`, [`Perfect ${per} · good ${ok} · best combo ${best}`], [['Again', () => { phase = 'ready'; fill(G.overlay, startBtn()); }], ['Done', () => app.go(practice ? 'training21' : 'event21'), true]]); };
  const startBtn = () => h('div', { class: 'g21-start' }, h('p', {}, 'Learn the moves, then keep the rhythm. The last pose is the finale — press SNAP to catch it!'), h('button', { class: 'btn big block', onclick: start }, practice ? '▶ PRACTICE' : '▶ DANCE (1 Ticket)'));
  const loop = now => { if (!alive) return; const c = G.ctx, GH = G.GH, t = now / 1000; c.fillStyle = '#2b2440'; c.fillRect(0, 0, GW, GH);
    for (let k = 0; k < 12; k++) { c.fillStyle = `hsla(${(k * 30 + now / 20) % 360},80%,60%,.18)`; c.beginPath(); c.arc(GW * (k % 4 + 0.5) / 4, GH * (0.1 + Math.floor(k / 4) * 0.12), 50, 0, 7); c.fill(); }
    let pose = 'idle';
    if (phase === 'learn') { const el = now - t0, k = Math.floor(el / 500); if (k < 4) { c.fillStyle = '#fff'; c.font = '900 200px system-ui'; c.textAlign = 'center'; c.fillText(ARROWS[seq[k]], GW / 2, GH * 0.4); } else { phase = 'play'; t0 = now + LEAD; pads.hidden = false; } pose = 'look'; }
    if (phase === 'play') { const el = now - t0; c.strokeStyle = '#ffd84a'; c.lineWidth = 6; c.beginPath(); c.moveTo(0, GH * 0.62); c.lineTo(GW, GH * 0.62); c.stroke();
      seq.forEach((l, k) => { const dy = (k * BEAT - el) / LEAD; if (dy < -0.2 || dy > 1) return; c.fillStyle = hits[k] === 'perfect' ? '#53d3a2' : hits[k] ? '#ffd23f' : '#fff'; c.font = '900 90px system-ui'; c.textAlign = 'center'; c.fillText(ARROWS[l], GW * (l + 0.5) / 4, GH * 0.62 - dy * GH * 0.5); });
      pose = ['dance', 'spin', 'twirl', 'disco'][Math.floor(el / BEAT) % 4] || 'dance';
      if (el > seq.length * BEAT + 400) { phase = 'finale'; pads.hidden = true; finale = now + 3000; G.snapState('challenge'); } }
    if (phase === 'finale') { pose = 'disco'; c.strokeStyle = '#ffd84a'; c.lineWidth = 14; c.strokeRect(7, 7, GW - 14, GH - 14); c.fillStyle = '#ffd84a'; c.font = '900 60px system-ui'; c.textAlign = 'center'; c.fillText('FINALE — SNAP!', GW / 2, GH * 0.18); if (now > finale) { phase = 'finale-missed'; G.snapState('ready'); toast('The finale passed — try again!'); } }
    if (phase === 'play') { c.fillStyle = '#fff'; c.font = '900 40px system-ui'; c.textAlign = 'right'; c.fillText(`combo ${combo}`, GW - 30, 60); }
    petAt(c, pet, GW / 2, GH * 0.95, 0.75, pose, t); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop); fill(G.overlay, startBtn());
  return () => { alive = false; cancelAnimationFrame(raf); G.ro.disconnect(); delete window.__snapAction; };
}

/* ================================================================ TRAINING: fetch · build · pose */
export function fetchTraining(app) {
  const G = shell(app, 'Fetch Training', 'training21', 'Drag the ball and let go — 5 throws');
  const pet = leadPet(), lvl = C.trainLevel(get(), pet.id, 'fetch'), ret = C.benefit.fetchReturn(lvl);
  const ball = Phys.makeBall(0.3, 0.9); let a = { x: 0.2, y: 0.9, s: 'wait' }, throws = 0, good = 0, drag = null, alive = true, raf = 0, snapWin = 0, results = [];
  G.canvas.addEventListener('pointerdown', e => { if (a.s !== 'wait' || throws >= 5) return; const r = G.canvas.getBoundingClientRect(); drag = { t: performance.now(), x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; });
  G.canvas.addEventListener('pointerup', e => { if (!drag) return; const r = G.canvas.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height; const d = drag; drag = null;
    if (Math.hypot(x - d.x, y - d.y) < 0.03) return; ball.x = a.x + 0.05; ball.y = 0.9; Phys.throwFromDrag(ball, x - d.x, (y - d.y) * G.GH / GW, performance.now() - d.t); throws++; a.s = 'chase'; sfx.tap?.(); });
  function step(dt, now) {
    Phys.step(ball, dt);
    if (a.s === 'chase' && ball.state !== 'flying') { const dx = ball.x - a.x; a.x += Math.sign(dx) * Math.min(Math.abs(dx), 0.45 * dt); if (Math.abs(dx) < 0.03) { Phys.pick(ball, 'p'); a.s = Math.random() < ret ? 'return' : 'keep'; } }
    if (a.s === 'return') { a.x -= Math.min(a.x - 0.2, 0.4 * dt); ball.x = a.x + 0.04; ball.y = 0.9; if (a.x <= 0.201) { Phys.drop(ball, 0.25, 0.9); good++; results.push('return'); a.s = 'wait'; snapWin = now + 3500; G.snapState('challenge'); toast('Returned! 📸 SNAP it!', 1600); end(); } }
    if (a.s === 'keep') { ball.x = a.x + 0.04; a.keepT = (a.keepT || 0) + dt; if (a.keepT > 1.6) { a.keepT = 0; Phys.drop(ball, a.x, 0.9); results.push('keep'); a.s = 'walkback'; toast('Kept it… keep practising!', 1400); } }
    if (a.s === 'walkback') { a.x -= Math.min(a.x - 0.2, 0.3 * dt); if (a.x <= 0.201) { a.s = 'wait'; ball.x = 0.3; end(); } }
  }
  function end() { if (throws < 5 || a.s !== 'wait') return; const score = good * 20; let r; update(x => { r = C.trainSession(x, pet.id, 'fetch', score); V.note(x, 'training'); });
    finishCard('🎾 Fetch practice done', [`${good}/5 returns`, r.rewarded ? `Fetch +${r.gain} XP (level ${r.level}${r.levelUp ? ' — LEVEL UP!' : ''})` : 'Daily training XP already earned'], [['Again', () => { throws = good = 0; results = []; }], ['Done', () => app.go('training21'), true]]); }
  window.__snapAction = async () => { if (performance.now() > snapWin) return toast('SNAP when your Poka brings the ball back!'); snapWin = 0; G.snapState('ready'); sfx.shutter(); await gamePhoto(app, G.canvas, { training: 'fetch', reaction: 'return', toy: 'ball', score: 80, pose: 'catch', title: 'Fetch Training' }); };
  let last = 0; const loop = now => { if (!alive) return; const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now; step(dt, now); const c = G.ctx, GH = G.GH;
    c.fillStyle = '#bfe8ff'; c.fillRect(0, 0, GW, GH); c.fillStyle = '#9fdc7a'; c.fillRect(0, GH * 0.6, GW, GH * 0.4);
    petAt(c, pet, GW * a.x, GH * a.y, 0.7, a.s === 'chase' ? 'leap' : a.s === 'return' ? 'catch' : 'bow', now / 1000, a.s === 'return' || a.s === 'walkback' ? -1 : 1);
    drawFurniture(c, 'ball', GW * ball.x, GH * ball.y - ball.h * GW, 54, 54, 0);
    c.fillStyle = '#3b2a33'; c.font = '900 36px system-ui'; c.textAlign = 'center'; c.fillText(`Throw ${Math.min(5, throws)}/5 · returns ${good}`, GW / 2, 60); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
  return () => { alive = false; cancelAnimationFrame(raf); G.ro.disconnect(); delete window.__snapAction; };
}
export function stackTraining(app) {
  const G = shell(app, 'Building Training', 'training21', 'Tap to drop each block onto the tower');
  const pet = leadPet(), tol = C.benefit.buildWindow(C.trainLevel(get(), pet.id, 'build'));
  let tower = [{ x: 0.5, w: 0.34 }], cur = { x: 0, dir: 1, w: 0.34 }, done = false, alive = true, raf = 0, snapWin = 0;
  G.canvas.addEventListener('pointerdown', () => { if (done) return; const top = tower[tower.length - 1], off = cur.x - top.x;
    if (Math.abs(off) > top.w * (0.5 + tol)) { done = true; finish(); return; }
    const w = clamp(top.w - Math.abs(off) * 0.6, 0.08, 0.4); tower.push({ x: cur.x, w }); cur = { x: 0.1, dir: 1, w }; sfx.tap?.(); if (tower.length > 9) { done = true; finish(); } });
  function finish() { const score = clamp((tower.length - 1) * 12, 0, 100); let r; update(x => { r = C.trainSession(x, pet.id, 'build', score); V.note(x, 'training'); }); snapWin = performance.now() + 4000; G.snapState('challenge');
    finishCard(`🧱 ${tower.length - 1} blocks`, [r.rewarded ? `Building +${r.gain} XP (level ${r.level})` : 'Daily training XP already earned', '📸 SNAP your builder!'], [['Again', () => { tower = [{ x: 0.5, w: 0.34 }]; cur = { x: 0, dir: 1, w: 0.34 }; done = false; }], ['Done', () => app.go('training21'), true]]); }
  window.__snapAction = async () => { if (performance.now() > snapWin) return toast('Finish a tower, then SNAP!'); snapWin = 0; G.snapState('ready'); sfx.shutter(); await gamePhoto(app, G.canvas, { training: 'build', score: 60 + tower.length * 3, pose: 'happy', title: 'Building Training' }); };
  let last = 0; const loop = now => { if (!alive) return; const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now; if (!done) { cur.x += cur.dir * dt * 0.45; if (cur.x > 0.9 || cur.x < 0.1) cur.dir *= -1; }
    const c = G.ctx, GH = G.GH; c.fillStyle = '#fff3e0'; c.fillRect(0, 0, GW, GH); c.fillStyle = '#e0b870'; c.fillRect(0, GH * 0.86, GW, GH * 0.14);
    tower.forEach((b, i) => { c.fillStyle = ['#ff6b8b', '#ffd23f', '#5ec8f2', '#53d3a2', '#a98bf0'][i % 5]; c.fillRect(GW * (b.x - b.w / 2), GH * 0.86 - (i + 1) * 60, GW * b.w, 56); });
    if (!done) { c.fillStyle = '#3b2a33'; c.fillRect(GW * (cur.x - cur.w / 2), GH * 0.86 - (tower.length + 1) * 60 - 80, GW * cur.w, 56); }
    petAt(c, pet, GW * 0.12, GH * 0.95, 0.5, done ? 'happy' : 'look', now / 1000); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
  return () => { alive = false; cancelAnimationFrame(raf); G.ro.disconnect(); delete window.__snapAction; };
}
export function poseTraining(app) {
  const G = shell(app, 'Posing Training', 'training21', 'Cue a pose, then SNAP it at its peak — 5 cues');
  const pet = leadPet(), hold = C.benefit.poseHoldMs(C.trainLevel(get(), pet.id, 'pose')), POSES = ['sit', 'wave', 'sitpretty', 'jump', 'heart'];
  let cue = -1, at = 0, results = [], alive = true, raf = 0;
  const cueBtn = h('button', { class: 'btn big block g21-cue', onclick: () => { if (cue >= POSES.length - 1 && results.length >= POSES.length) return; cue++; at = performance.now() + 700 + Math.random() * 900; } }, '📣 CUE A POSE'); G.overlay.append(cueBtn);
  const peak = () => { const d = performance.now() - at; return d >= 0 && d <= hold; };
  window.__snapAction = async () => {
    if (cue < 0 || results[cue] != null) return toast('Cue a pose first.');
    const ok = peak(), d = performance.now() - at; results[cue] = ok ? 100 - Math.round(Math.abs(d - hold / 2) / hold * 60) : 0; sfx.shutter(); toast(ok ? '✨ Captured at the peak!' : d < 0 ? 'Too early!' : 'Too late!', 1400);
    if (results.filter(x => x != null).length === POSES.length) { const score = Math.round(results.reduce((a, b) => a + b, 0) / POSES.length); let r; update(x => { r = C.trainSession(x, pet.id, 'pose', score); V.note(x, 'training'); });
      if (ok) await gamePhoto(app, G.canvas, { training: 'pose', trainingLevelUp: r.levelUp, score: 60 + score * 0.4, pose: POSES[cue], title: 'Posing Training' });
      finishCard(`📸 ${score}/100`, [r.rewarded ? `Posing +${r.gain} XP (level ${r.level}${r.levelUp ? ' — LEVEL UP!' : ''})` : 'Daily training XP already earned'], [['Again', () => { cue = -1; results = []; }], ['Done', () => app.go('training21'), true]]); }
  };
  const loop = now => { if (!alive) return; const c = G.ctx, GH = G.GH; c.fillStyle = '#fbe3ec'; c.fillRect(0, 0, GW, GH);
    const p = cue >= 0 && results[cue] == null && now >= at ? (now - at <= hold ? POSES[cue] : 'idle') : 'idle';
    if (p !== 'idle' && peak()) { c.strokeStyle = '#ffd84a'; c.lineWidth = 14; c.strokeRect(7, 7, GW - 14, GH - 14); }
    petAt(c, pet, GW / 2, GH * 0.8, 0.9, p, now / 1000); c.fillStyle = '#3b2a33'; c.font = '900 36px system-ui'; c.textAlign = 'center'; c.fillText(`Pose ${Math.max(0, cue + 1)}/${POSES.length}`, GW / 2, 60); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
  return () => { alive = false; cancelAnimationFrame(raf); G.ro.disconnect(); delete window.__snapAction; };
}
