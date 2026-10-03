/* PokaSnap — the board (C1.6A: the ONE production root; 40-space board, Treats, Stash,
   Stage + Speedshot, Quick Milestones, mobile + desktop paw input parity). Pudding only.
   Storage: exactly one key, pokasnap-board-v1 (the board save). The legacy 2.1 save key is
   never read, written or deleted (tools/tests/v22.mjs + c16a.mjs guard this).
   Loop: SNAP → move → land → animate → earn → continue. */
import { OBJECTS, OBJECT_ORDER, CAMERA_PRESETS, CAMERA_ORDER, CAMERA_LETTERS, PET, SNAP_ROLL, SPACE_COUNT, BOARD_HALF, SPEEDS, DAILY_TREAT_ROLL, MULTIPLIER_LADDER, WIDGETS, LANDMARKS, TREATS, STAGE, TILE_TYPES, ACTIVE_MILESTONE, MILESTONE_EVENTS, ALBUM_SEASON, KEYMAP, KEY_GLYPH, PAW_MODES, PAW_ROLES, BUILD } from './config.js';
import { rng, planRun, sampleRun, trailPoint, createRoll, regen, viewFor, isCameraMode, landmarkAt, scorePhoto, legalMultipliers, nextMultiplier, stepDown, playbackDt, nextSpeed, addRoll, clearYaw, spacePos } from './core.js';
import { snapMove, planMove, stageReward, landingOutcome, tileAt, addTreats, pickStashTarget, createDig, dig, stashLoss, createAlbum, albumAttach, albumDone, createMilestone, milestonePoints, addPoints, nextTier, countdown, keyRole, scaleReward } from './board.js';
import { makeCamera, frame, project, drawWorld, buildScene, setStage, prebake } from './world.js';
import { drawPudding } from './pudding.js';
import { drawHeld, drawFrisbee, drawBall, drawTreat, drawBubble, drawObjectIcon } from './props.js';
import * as Radio from './radio.js';
import * as Race from './race.js';
import * as Dance from './dance.js';
import * as Flight from './flight.js';
import * as Switch from './switch.js';
import { WEEKLY_MODES, activeMode } from './weekly.js';
const GAMES = { race: Race, dance: Dance, flight: Flight, switch: Switch };

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('stage'), ctx = canvas.getContext('2d');
const $ = s => document.querySelector(s);
const scene = buildScene('park', { pond: 1, fountain: 1, field: 0, garden: 1, cafe: 1, gate: 1, snack: 1, gazebo: 0, trail: 1, lookout: 0 });
const cam = makeCamera();
const bakeMs = prebake(scene);
const rand0 = rng(+(q.get('seed') || 22));
let forcedNext = q.has('dist') ? +q.get('dist') : null;          // QA/evidence: force the next movement distance
const rand = () => rand0();

const S = window.PokaBoard22 = {
  pos: +(q.get('pos') || 0), heading: 0, run: null, runT: 0, object: 'ball', mult: 1, speed: 'normal', preset: q.get('cam') || 'board',
  roll: createRoll(Date.now(), q.has('snaps') ? +q.get('snaps') : q.has('roll') ? +q.get('roll') : SNAP_ROLL.start), photos: [], moves: 0, log: [],
  coins: 12480, coinsShown: 12480, treats: q.has('treats') ? +q.get('treats') : TREATS.start, treatClaimed: false,
  ms: createMilestone(ACTIVE_MILESTONE, Date.now()), album: createAlbum(), collection: 3, buildSteps: 0, mood: 3,
  orbit: { yaw: 0, pitch: 0, zoom: 1 }, lastLanding: null, freeze: q.has('freeze') ? +q.get('freeze') : null, mode: 'board', upgrades: {}, bounce: null, A: 0,
  scene: 'board', busy: false, photoWin: null, stageGlow: 0, petAt: null, focus: 0, inputs: [], events: [], stats: { stagePass: 0, stageLand: 0, moves: 0, spent: 0 },
};

/* ------------------------------------------------------------- the save -- */
/* One board save. A missing save = a brand-new account (first-run welcome). QA/evidence runs
   pass ?nosave=1 so fixtures never land in a real save. UI caches are never mixed with it. */
export const SAVE_KEY = 'pokasnap-board-v1';
const NOSAVE = q.has('nosave') || q.has('qa');
function readSave() { if (NOSAVE) return null; try { const v = localStorage.getItem(SAVE_KEY); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
const saved = readSave();
if (saved && saved.v === 1) {
  Object.assign(S, { pos: saved.pos ?? S.pos, coins: saved.coins ?? S.coins, coinsShown: saved.coins ?? S.coins, treats: saved.treats ?? S.treats, collection: saved.collection ?? S.collection, buildSteps: saved.buildSteps ?? 0, mood: saved.mood ?? S.mood, mult: saved.mult ?? 1, object: saved.object || S.object, speed: saved.speed || S.speed, upgrades: saved.upgrades || {} });
  if (saved.roll) S.roll = saved.roll;
  if (saved.ms && saved.ms.id === S.ms.id && saved.ms.endsAt > Date.now()) S.ms = saved.ms;
  if (saved.album && saved.album.season === S.album.season) S.album = saved.album;
  S.albumThumbs = saved.albumThumbs || {};
  S.account = saved.account; S.treatDay = saved.treatDay || null; S.evSaved = saved.ev || null;
}
S.albumThumbs = S.albumThumbs || {};
let saveT = 0;
function persist(now = false) {
  if (NOSAVE || !S.account) return;
  clearTimeout(saveT);
  const write = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, savedAt: Date.now(), build: BUILD.label, account: S.account, pos: S.pos, coins: S.coins, roll: S.roll, treats: S.treats, ms: S.ms, album: S.album, albumThumbs: S.albumThumbs, collection: S.collection, buildSteps: S.buildSteps, mood: S.mood, mult: S.mult, object: S.object, speed: S.speed, upgrades: S.upgrades, ev: S.ev, treatDay: S.treatDay })); } catch (e) {} };
  if (now) write(); else saveT = setTimeout(write, 400);
}
addEventListener('visibilitychange', () => { if (document.hidden) persist(true); });
addEventListener('pagehide', () => persist(true));

/* ------------------------------------------------------------- the loop -- */
let W = 0, H = 0, dpr = 1, fitKey = '', fitVal = null;
const CAMERA_DPR = 1.6;
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, S.mode === 'camera' || S.scene !== 'board' ? CAMERA_DPR : 2); W = innerWidth; H = innerHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  document.body.classList.toggle('desktop', DESKTOP());
  fitKey = '';
}
const DESKTOP = () => q.has('desktop') ? q.get('desktop') !== '0' : (matchMedia('(hover: hover) and (pointer: fine)').matches && innerWidth >= 700);
addEventListener('resize', () => { resize(); measureWidgets(); hints(); }); resize();

const angLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
let last = performance.now(), T = 0;
const fps = { frames: 0, t0: performance.now(), value: 0, worst: 99 };
function tick(now) {
  requestAnimationFrame(tick);   // schedule first: one bad frame must never stop the game loop
  try { runFrame(now); } catch (err) { S.renderErrors = (S.renderErrors || 0) + 1; if (S.renderErrors < 4) console.error('frame error', err && err.stack || err); }
}
function runFrame(now) {
  const raw = (now - last) / 1000, dt = Math.min(0.05, raw); last = now;
  T = S.freeze != null ? S.freeze : T + dt;
  fps.frames++; if (now - fps.t0 > 500) { fps.value = Math.round(fps.frames * 1000 / (now - fps.t0)); fps.worst = Math.min(fps.worst, fps.value); fps.frames = 0; fps.t0 = now; if (fpsEl) fpsEl.textContent = `${fps.value} fps · ${S.mode}${S.run ? ' · moving' : ''}`; }
  if (S.scene !== 'board') { const G = GAMES[S.scene]; if (!S.paused) G.step(dt); G.render(ctx, W, H, dpr, T); }
  else { step(dt); render(); fadeWidgetsOverPet(); }
}
function petNow() {
  let p;
  if (!S.run) { const tp = trailPoint(S.pos); p = { x: tp.x, z: tp.z, y: 0, heading: S.heading, phase: S.idlePhase || 'idle', u: 0 }; }
  else { const sm = sampleRun(S.run, S.runT), tp = trailPoint(sm.pos); p = { x: tp.x, z: tp.z, y: sm.y, heading: S.run.kind === 'throw' ? S.heading : tp.heading, phase: S.run.kind === 'rush' && sm.phase === 'hop' ? 'zoom' : sm.phase, u: sm.u, sm }; }
  if (S.petAt) {   // Speedshot: Pudding hops onto the centre STAGE and back
    const a = S.petAt, k = Math.min(1, Math.max(0, (T - a.t0) / a.dur)), e = k * k * (3 - 2 * k), from = a.back ? { x: 0, z: 0.05 } : trailPoint(S.pos), to = a.back ? trailPoint(S.pos) : { x: 0, z: 0.05 };
    const x = from.x + (to.x - from.x) * e, z = from.z + (to.z - from.z) * e, hop = k < 1 ? Math.abs(Math.sin(k * Math.PI * 5)) * 0.25 : 0;
    const w = S.photoWin, ph = w?.phases, cyc = k >= 1 && ph ? ph[Math.floor((T - w.t0) / 0.75) % ph.length] : null, cu = k >= 1 && ph ? ((T - w.t0) / 0.75) % 1 : 0;
    const air = cyc === 'binky' ? Math.sin(Math.PI * cu) * 0.35 : 0;
    p = { x, z, y: hop + air, lift: a.back ? 0.16 * (1 - e) : 0.16 * e, heading: k < 1 ? Math.atan2(to.x - from.x, to.z - from.z) : 0, phase: k < 1 ? 'hop' : (cyc || a.phase || 'pose'), u: k < 1 ? (k * 5) % 1 : cu };
  }
  return p;
}
function step(dt) {
  S.roll = regen(S.roll, Date.now());
  const vdt = playbackDt(dt, S.speed);          // slow motion: visual time only
  S.A += vdt;
  if (S.run) {
    S.runT += vdt;
    const sm = sampleRun(S.run, S.runT);
    if (S.run.move) stagePassCheck(sm.pos);
    if (sm.phase !== S.lastPhase) { S.log.push({ t: +S.runT.toFixed(2), phase: sm.phase, pos: +sm.pos.toFixed(2) }); S.lastPhase = sm.phase; if (sm.phase === 'hop' || sm.phase === 'land') haptic(); }
    if (sm.done) finishRun();
  } else idleLife(dt);
  if (S.photoWin && T - S.photoWin.t0 > S.photoWin.dur) endPhotoWin();
  if (S.photoWin) { const bb = $('#bannerBar'); if (bb) bb.style.width = Math.max(0, 100 - (T - S.photoWin.t0) / S.photoWin.dur * 100) + '%'; }
  S.stageGlow += ((S.photoWin?.kind === 'speedshot' ? 1 : 0) - S.stageGlow) * Math.min(1, dt * 4);
  S.focus += ((S.photoWin && S.photoWin.kind !== 'speedshot' ? 1 : S.photoWin?.kind === 'speedshot' ? 0.7 : 0) - S.focus) * Math.min(1, dt * 3);
  if (S.coinsShown !== S.coins) { S.coinsShown += Math.sign(S.coins - S.coinsShown) * Math.max(1, Math.ceil(Math.abs(S.coins - S.coinsShown) * 0.12)); if (Math.abs(S.coins - S.coinsShown) < 1) S.coinsShown = S.coins; $('#coinN').textContent = Math.round(S.coinsShown).toLocaleString(); }
  if ((S.hudT = (S.hudT || 0) + dt) > 1) { S.hudT = 0; regenLine(); msClock(); }
  const pet = petNow(); S.heading = pet.heading;
  const pr = CAMERA_PRESETS[S.preset];
  cam.cyK = pr.overview ? overviewCy() : 0.47;
  const szT = pr.overview ? boardStretch() : 1; cam.sz = (cam.sz || 1) + (szT - (cam.sz || 1)) * Math.min(1, dt * 4); if (Math.abs(cam.sz - szT) < 0.0005) cam.sz = szT;
  let tgt;
  if (pr.overview) {
    const base = fitOverview(pr);
    // framing improves automatically during photo windows: the lens leans in toward Pudding (never steals control)
    const f = S.focus, k = 0.85;
    tgt = { x: base.x + (pet.x - base.x) * f * k, z: base.z + (pet.z - base.z) * f * k, y: 0, yaw: pr.yaw, pitch: pr.pitch - f * 0.12, dist: base.dist * (1 - f * 0.42) };
  } else tgt = { x: pet.x, z: pet.z, y: 0.45 + pet.y * 0.35, yaw: pet.heading + sideYaw(pr, pet), pitch: pr.pitch, dist: pr.dist };
  if (!pr.overview) { const c = clearYaw(pet, tgt.yaw + S.orbit.yaw, tgt.pitch + S.orbit.pitch, tgt.dist / S.orbit.zoom, scene.solids, S.nudge || 0); S.nudge = c.nudge; S.camBlocked = !!c.blocked; tgt.yaw = c.yaw - S.orbit.yaw; } else S.nudge = 0;
  const k = Math.min(1, dt * (S.snapCam ? 60 : 3.2)), kp = Math.min(1, dt * (S.snapCam ? 60 : 9)), ky = Math.min(1, dt * (S.snapCam ? 60 : 2.4));
  cam.tx += (tgt.x - cam.tx) * kp; cam.tz += (tgt.z - cam.tz) * kp; cam.ty += (tgt.y - cam.ty) * kp;
  cam.yaw = angLerp(cam.yaw, tgt.yaw + S.orbit.yaw, ky);
  cam.pitch += (Math.max(0.12, Math.min(1.35, tgt.pitch + S.orbit.pitch)) - cam.pitch) * k;
  cam.dist += (tgt.dist / S.orbit.zoom - cam.dist) * k;
  if (Math.abs(cam.dist - tgt.dist / S.orbit.zoom) < 0.002 && Math.abs(cam.pitch - tgt.pitch) < 0.0005) { cam.dist = tgt.dist / S.orbit.zoom; cam.pitch = tgt.pitch; }
  S.snapCam = false;
}
/* Board framing: the whole 40-space ring (corners included) fits between the side badges and
   between the milestone bar and the paw, on phones and on desktop alike. Solved once per size. */
const overviewCy = () => 0.5;
/* Portrait phones show a tall ring and wide desktops a wide one (owner references); world rules never change. */
const boardStretch = () => { const a = H / W; return a > 1.3 ? Math.min(1.42, 0.9 + a * 0.24) : W >= 900 ? 0.8 : 1; };
function fitOverview(pr) {
  const key = `${W}x${H}|${pr.pitch}|${boardStretch()}`; if (key === fitKey) return fitVal;
  const E = BOARD_HALF + 0.12, probe = { ...cam, tx: 0, ty: 0, tz: 0.15, yaw: pr.yaw, pitch: pr.pitch, cyK: overviewCy(), sz: boardStretch() };
  const top = W >= 900 ? 150 : Math.max(170, H * 0.3), bottom = H - (W >= 900 ? 175 : 182), sidePad = W >= 900 ? 130 : 2;
  let lo = 6, hi = 60;
  for (let i = 0; i < 28; i++) {
    const d = (lo + hi) / 2; probe.dist = d; frame(probe, W, H);
    const pts = [[-E, E], [E, E], [E, -E], [-E, -E]].map(([x, z]) => project(probe, x, 0.3, z));
    const ok = pts.every(p => p && p.x >= sidePad && p.x <= W - sidePad && p.y >= top && p.y <= bottom);
    if (ok) hi = d; else lo = d;
  }
  // centre the ring vertically in the free band
  probe.dist = hi; frame(probe, W, H);
  const ys = [[-E, E], [E, E], [E, -E], [-E, -E]].map(([x, z]) => project(probe, x, 0.3, z).y), mid = (Math.min(...ys) + Math.max(...ys)) / 2, want = (top + bottom) / 2;
  let z = 0.15;
  for (let i = 0; i < 6; i++) { probe.tz = z; frame(probe, W, H); const yy = [[-E, E], [E, E], [E, -E], [-E, -E]].map(([x, zz]) => project(probe, x, 0.3, zz).y); const m2 = (Math.min(...yy) + Math.max(...yy)) / 2; const g = project(probe, 0, 0.3, 1).y - project(probe, 0, 0.3, 0).y; z += (m2 - want) / g; }
  fitKey = key; fitVal = { x: 0, z, dist: hi };
  return fitVal;
}
function idleLife(dt) {
  S.idleT = (S.idleT || 0) + dt;
  if (S.holdPhase && S.idleT < S.holdPhase.until) { S.idlePhase = S.holdPhase.phase; return; }
  S.holdPhase = null;
  if (!S.idlePlan || S.idleT > S.idlePlan.until) {
    const r = Math.random();
    const pick = r < 0.5 ? 'idle' : r < 0.7 ? 'sniff' : r < 0.85 ? 'groom' : 'loaf';
    S.idlePlan = { phase: pick, until: S.idleT + 2.5 + Math.random() * 3 }; S.idlePhase = pick;
  }
}
function hold(phase, secs) { S.holdPhase = { phase, until: (S.idleT || 0) + secs }; S.idlePhase = phase; }
function sideYaw(pr, pet) {
  if (pr.id !== 'side') return pr.yaw;
  const a = pet.heading + Math.PI / 2, b = pet.heading - Math.PI / 2;
  const da = (pet.x + Math.sin(a)) ** 2 + (pet.z + Math.cos(a)) ** 2, db = (pet.x + Math.sin(b)) ** 2 + (pet.z + Math.cos(b)) ** 2;
  return da >= db ? Math.PI / 2 : -Math.PI / 2;
}

/* ------------------------------------------------------- SNAP → move -- */
/* One press = one movement. The multiplier changes the Snaps spent and eligible rewards,
   never the distance (board.snapMove never receives it for the roll). */
export function move(src = 'api') {
  if (S.run || S.busy || S.photoWin || S.pendingSpeedshot) { shakePad(); return null; }
  S.mult = stepDown(S.mult, S.roll.units);
  const r = forcedNext != null ? (() => { const d = forcedNext; forcedNext = null; const parts = [Math.min(5, d - 2), d - 2 - Math.min(5, d - 2)]; let k = 0; return () => (parts[k++] + 0.5) / 6; })() : rand;
  const m = snapMove({ pos: S.pos, snaps: S.roll.units }, S.mult, r);
  if (!m) { shakePad(); cue(`Out of Snaps · ${SNAP_ROLL.regenChunk} more ${regenEta()}`, '#ff6b8b'); return null; }
  S.roll = { ...S.roll, units: m.snaps }; S.stats.spent += m.spent; S.stats.moves++;
  S.run = planMove(S.pos, m.distance, rand); S.run.move = m; S.run.paidPass = 0; S.runT = 0; S.log = [];
  S.events.push({ t: Date.now(), ev: 'move', from: m.from, distance: m.distance, mult: m.mult, spent: m.spent });
  $('#landing').classList.remove('show'); haptic(); updateHud(); return m;
}
/* STAGE is paid the moment Pudding hops past it, once per crossing; a landing on it is paid on arrival instead. */
function stagePassCheck(pos) {
  const r = S.run, m = r.move, crossed = Math.floor(pos / SPACE_COUNT) - Math.floor(r.from / SPACE_COUNT);
  while (r.paidPass < Math.min(crossed, m.passesStage)) { r.paidPass++; payStage('pass'); }
}
function payStage(kind) {
  const r = stageReward(kind, S.mult);
  S.stats[kind === 'pass' ? 'stagePass' : 'stageLand']++;
  S.events.push({ t: Date.now(), ev: 'stage-' + kind, snaps: r.snaps, coins: r.coins });
  grant({ snaps: r.snaps, coins: r.coins }, kind === 'pass' ? 'STAGE pass' : 'STAGE');
  milestone('stage');
  cue(kind === 'pass' ? `<b style="color:#7a4fe0">STAGE</b> · +${r.snaps} Snaps` : `<b style="color:#7a4fe0">STAGE!</b> · +${r.snaps} Snaps · big show`, '#9a6bff');
  S.pendingSpeedshot = { ...r.speedshot, kind };
}
function finishRun() {
  const run = S.run, kind = run.kind;
  S.pos = ((run.to % SPACE_COUNT) + SPACE_COUNT) % SPACE_COUNT; S.run = null; S.lastPhase = null;
  if (kind === 'throw') { hold('happy', 0.9); return; }
  S.moves++;
  if (run.move && run.move.landsStage) payStage('land');
  if (kind === 'rush' || kind === 'warp') { landed(S.pos, true); return; }
  landed(S.pos, false);
}
/* Landing: tile animation + reward, then (if any) the Speedshot earned by passing STAGE. */
function landed(i, bonusMove) {
  const sp = tileAt(i), tt = TILE_TYPES[sp.type];
  S.lastLanding = { pos: i, at: T, type: sp.type };
  S.events.push({ t: Date.now(), ev: 'land', pos: i, type: sp.type });
  const after = () => { const ss = S.pendingSpeedshot; S.pendingSpeedshot = null; if (ss) { S.busy = true; setTimeout(() => speedshot(ss), 400); } };
  if (bonusMove) { if (sp.type === 'stage') {} after(); return; }
  const out = landingOutcome(i, S.mult, rand);
  if (sp.type !== 'stage' && sp.type !== 'stash' && sp.type !== 'lucky') milestone(sp.type);
  const handler = TILES[sp.type]; handler(out, sp, tt, after);
}
const TILES = {
  stage(out, sp, tt, after) { hold('happy', 1.2); after(); },
  treat(out) { hold('eat', 1.3); treatFx(); grantTreats(out.treats || 1); landCue('TREAT', 'Treat collected', TILE_TYPES.treat.hue); afterLand(); },
  snap(out) { S.flash = 0.7; hold('cam', 1); grant({ snaps: out.snaps }, 'SNAP'); landCue('SNAP', `+${out.snaps} Snaps`, TILE_TYPES.snap.hue); afterLand(); },
  build(out) { hold('happy', 1); const lm = buildTarget(S.pos); if (lm) upgradeLandmark(lm); S.buildSteps += out.buildSteps || 1; grant({ coins: out.coins }, 'BUILD'); landCue('BUILD', lm ? `${LANDMARKS.find(l => l.id === lm).name} grows` : 'Build progress', TILE_TYPES.build.hue); afterLand(); },
  care(out) { hold('groom', 1.4); hearts(); S.mood = Math.min(5, S.mood + (out.mood || 1)); grant({ coins: out.coins }, 'CARE'); landCue('CARE', 'Brushed and happy · photo bonus', TILE_TYPES.care.hue); afterLand(); },
  play(out) { hold('happy', 0.4); S.events.push({ ev: 'play' }); grant({ coins: out.coins }, 'PLAY'); toyPop(); photoWin('play', out.photoWindowS || 2.5, 'binky'); },
  pose(out) { photoWin('pose', out.photoWindowS || 4, 'pose'); },
  lucky(out) { luckyFlip(out); },
  rush(out) { milestone('rush'); landCue('RUSH', 'Zoomies!', TILE_TYPES.rush.hue); S.pendingSpeedshot = S.pendingSpeedshot || { ...out.speedshot, kind: 'rush' }; setTimeout(() => bonusRun(out.extraSpaces, 'rush'), 350); },
  stash(out) { stashDig(); },
  album(out) { milestone('album'); const n = albumDone(S.album), nx = S.album.slots.find(s => !s.photoId); landCue('ALBUM', `Album ${n}/${S.album.slots.length}${nx ? ' · next: ' + nx.label : ' · complete!'}`, '#4fa8e8'); photoWin('album', out.photoWindowS || 3, 'cam'); },
  poka(out) { milestone('poka'); S.collection += out.collection || 1; flyTo('POKA', '[data-nav="POKA"]', '#a88bff'); hold('happy', 1.2); landCue('POKA', `Collection ${S.collection}/24 · new: Spring bow`, '#9a6bff'); afterLand(); },
  home(out) { milestone('home'); hold('loaf', 1.6); S.mood = Math.min(5, S.mood + 1); grant({ snaps: out.snaps, coins: out.coins }, 'HOME'); landCue('HOME', 'Home sweet home · rested', '#ff8a6b'); afterLand(); },
};
function afterLand() { const ss = S.pendingSpeedshot; S.pendingSpeedshot = null; if (ss) { S.busy = true; setTimeout(() => speedshot(ss), 700); } }
function bonusRun(n, kind) { S.run = planMove(S.pos, n, rand, kind); const m = { from: S.pos, to: S.pos + n, passesStage: 0, landsStage: false }; const c = Math.floor((S.pos + n) / SPACE_COUNT); if (c > 0) { if ((S.pos + n) % SPACE_COUNT === 0) m.landsStage = true; else m.passesStage = c; } S.run.move = m; S.run.paidPass = 0; S.runT = 0; }
function buildTarget(i) { let best = null, bd = 1e9; for (const l of LANDMARKS) { const st = scene.landmarks.find(x => x.id === l.id).stage; if (st >= 2) continue; const d = Math.min(Math.abs(l.space - i), SPACE_COUNT - Math.abs(l.space - i)); if (d < bd) { bd = d; best = l.id; } } return best; }

/* ---------------------------------------------------------- rewards -- */
/* Rewards fly to their HUD destination: coins → currency, Snaps → the meter, Treats → the carrots. */
function grant(r, why) {
  if (!r) return;
  if (r.coins) flyReward('coin', r.coins);
  if (r.snaps) { S.roll = addRoll(S.roll, r.snaps); flyReward('snap', r.snaps); }
  if (r.treats) grantTreats(r.treats);
  if (r.buildSteps) { S.buildSteps += r.buildSteps; const lm = buildTarget(S.pos); if (lm) upgradeLandmark(lm); }
  if (r.collection) { S.collection += r.collection; flyTo('POKA', '[data-nav="POKA"]', '#a88bff'); }
  updateHud();
}
function grantTreats(n) {
  const r = addTreats({ treats: S.treats }, n, S.mult);
  const before = S.treats; S.treats = r.treats;
  for (let k = before; k < r.treats; k++) setTimeout(() => { const el = document.querySelector(`.tr[data-i="${k}"]`); el?.classList.remove('pop'); void el?.offsetWidth; el?.classList.add('pop'); }, 450);
  if (r.overflowSnaps) { S.roll = addRoll(S.roll, r.overflowSnaps); flyReward('snap', r.overflowSnaps); cue(`Treats full · +${r.overflowSnaps} Snaps instead`, '#ff8a2b'); }
  S.events.push({ ev: 'treat', before, after: S.treats, overflow: r.overflowSnaps });
  updateHud();
}
/* Quick Milestone: points from the ACTIVE event's rules fly to the bar; a crossed tier
   celebrates for ~1 s and its reward flies to its own destination. Each tier pays once. */
function milestone(kind, mult = S.mult) {
  const pts = milestonePoints(S.ms.id, kind, mult); if (!pts) return 0;
  const r = addPoints(S.ms, pts, Date.now()); S.ms = r.ms;
  flyPts(pts);
  for (const t of r.crossed) setTimeout(() => celebrateTier(t), 800);
  setTimeout(updateMs, 700);
  return pts;
}
function celebrateTier(t) {
  const el = $('#ms'); el.classList.remove('cross'); void el.offsetWidth; el.classList.add('cross');
  S.events.push({ ev: 'milestone', at: t.at, i: t.i, reward: t.reward });
  hold('happy', 1);
  grant(t.reward, 'MILESTONE');
  cue(`🎉 <b>${MILESTONE_EVENTS[S.ms.id].title}</b> ${t.at} · ${rewardText(t.reward)}`, '#ff5f9e');
}
const rewardText = r => Object.entries(r).map(([k, v]) => k === 'snaps' ? `+${v} Snaps` : k === 'coins' ? `+${v.toLocaleString()} coins` : k === 'treats' ? `+${v} Treat` : k === 'buildSteps' ? 'free Build step' : k === 'collection' ? 'POKA reward' : k).join(' · ');
function flyPts(n) {
  const from = S.petScreen || { x: W / 2, y: H * 0.5 }, to = $('.msBar')?.getBoundingClientRect(); if (!to) return;
  const el = document.createElement('div'); el.className = 'msPts'; el.textContent = `+${n}`; document.body.appendChild(el);
  el.animate([{ left: from.x + 'px', top: from.y + 'px', transform: 'translate(-50%,-50%) scale(.5)', opacity: 0 }, { offset: 0.25, transform: 'translate(-50%,-120%) scale(1.15)', opacity: 1 }, { left: (to.left + to.width * 0.5) + 'px', top: (to.top + to.height / 2) + 'px', transform: 'translate(-50%,-50%) scale(.6)', opacity: 0.9 }], { duration: 720, easing: 'cubic-bezier(.4,0,.2,1)' }).onfinish = () => el.remove();
}

/* --------------------------------------------- Speedshot + photo windows -- */
/* Speedshot: Pudding hops onto the centre STAGE, the lights come up, and for a few seconds she
   cycles quick action poses while SNAP takes photos for free (no movement Snaps spent). */
function speedshot(spec) {
  S.busy = true;
  S.petAt = { t0: T, dur: 0.7, phase: 'pose' };
  const phases = ['binky', 'pose', 'happy', 'rear', 'binky', 'pose', 'zoom', 'happy'];
  photoWin('speedshot', spec.seconds, null, { max: spec.shots + 6, phases, label: spec.kind === 'land' ? 'SUPER SPEEDSHOT!' : 'SPEEDSHOT!' });
  S.events.push({ ev: 'speedshot', kind: spec.kind, seconds: spec.seconds });
}
function photoWin(kind, secs, phase, extra = {}) {
  S.photoWin = { kind, t0: T, dur: secs, shots: 0, phase, ...extra };
  if (phase) hold(phase, secs + 0.3);
  const b = $('#banner'); b.hidden = false; b.className = 'banner ' + kind;
  $('#bannerT').textContent = extra.label || { pose: 'POSE!', play: 'PLAY!', album: 'ALBUM SHOT', speedshot: 'SPEEDSHOT!' }[kind] || 'PHOTO!';
  $('#bannerS').textContent = DESKTOP() ? 'press SPACE or tap SNAP' : 'tap SNAP';
  setPadLabel('SNAP', true); updateHud();
}
function endPhotoWin() {
  const w = S.photoWin; S.photoWin = null; $('#banner').hidden = true; setPadLabel('SNAP', false);
  if (w.kind === 'speedshot') { S.petAt = { t0: T, dur: 0.6, back: true }; setTimeout(() => { S.petAt = null; S.busy = false; updateHud(); }, 650); cue(`📸 Speedshot · ${w.shots} photo${w.shots === 1 ? '' : 's'}`, '#9a6bff'); }
  else if (w.shots) cue(`📸 ${w.shots} photo${w.shots === 1 ? '' : 's'}`, '#4fa8e8');
  if (w.kind !== 'speedshot') { const ss = S.pendingSpeedshot; S.pendingSpeedshot = null; if (ss) { S.busy = true; setTimeout(() => speedshot(ss), 300); } }
  updateHud();
}
function setPadLabel(t, cam) { const b = $('#snapBtn b.main'); if (b) b.textContent = t; $('#snapBtn').classList.toggle('shoot', !!cam); }

/* ---------------------------------------------------------------- photo -- */
/* A real photograph: the frame around Pudding is captured off the shutter path. Photos are free;
   only real photos can fill an Album slot (board.albumAttach checks photo.real + its own id). */
let photoSeq = 0;
export function snap(opts = {}) {
  const thumb = document.createElement('canvas'); const tw = 72, th = 90; thumb.width = tw; thumb.height = th;
  const at = opts.at || S.petScreen || { x: W / 2, y: H / 2 };
  const sx = Math.max(0, at.x * dpr - tw * dpr * 1.5), sy = Math.max(0, at.y * dpr - th * dpr * 1.3);
  const grab = window.createImageBitmap ? createImageBitmap(canvas, sx, sy, tw * dpr * 3, th * dpr * 2.8, { resizeWidth: tw, resizeHeight: th, resizeQuality: 'medium' }) : null;
  const pet = petNow();
  const gm = opts.meta || opts.race || null, gid = opts.game || (opts.race ? 'race' : null);
  const tile = gid ? null : tileAt(Math.round(pet.sm ? pet.sm.pos : S.pos)).type;
  const photo = { id: `ph-${Date.now().toString(36)}-${++photoSeq}`, real: true, game: gid, race: opts.race || null, meta: gm, albumTags: gm ? ['weekly:' + gid, ...gm.ops.map(o => gid + ':' + o)] : [], at: Date.now(), mult: S.mult, view: S.view, phase: pet.phase, airborne: pet.y > 0.05, landmark: nearestLandmark(pet), tile, window: S.photoWin?.kind || null, preset: S.preset, canvas: thumb, get url() { return this._u || (this._u = this.canvas.toDataURL('image/jpeg', 0.8)); } };
  photo.score = scorePhoto(photo) + (photo.window === 'pose' ? 12 : photo.window === 'speedshot' ? 8 : 0);
  S.photos.push(photo); S.flash = 0.6;
  if (S.photoWin) S.photoWin.shots++;
  const land = () => flyThumb(thumb);
  if (grab) grab.then(bmp => { thumb.getContext('2d').drawImage(bmp, 0, 0); bmp.close?.(); land(); }).catch(() => { thumb.getContext('2d').drawImage(canvas, sx, sy, tw * dpr * 3, th * dpr * 2.8, 0, 0, tw, th); land(); });
  else { thumb.getContext('2d').drawImage(canvas, sx, sy, tw * dpr * 3, th * dpr * 2.8, 0, 0, tw, th); land(); }
  const a = albumAttach(S.album, photo); S.album = a.album;
  if (a.slot) { photo.albumSlot = a.slot; const keep = () => { try { S.albumThumbs[photo.id] = thumb.toDataURL('image/jpeg', 0.7); persist(); } catch (e) {} }; setTimeout(keep, 900); milestone('albumPhoto', 1); setTimeout(() => cue(`📒 Album · <b>${ALBUM_SEASON.slots.find(s => s.id === a.slot).label}</b> ✓ your photo`, '#4fa8e8'), 300); }
  milestone(photo.landmark === 'garden' ? 'gardenPhoto' : 'photo', 1);
  haptic(); updateHud();
  return photo;
}
function nearestLandmark(pet) { let best = null, bd = 2.6; for (const l of scene.landmarks) { const d = Math.hypot(l.x - pet.x, l.z - pet.z); if (d < bd) { bd = d; best = l.id; } } return best; }

/* ----------------------------------------------------------- STASH dig -- */
/* An original pet-native dig, not a heist: a 3×3 bed with clues (sparkle, pawprints,
   carrot tops, roots...). Limited digs, quick resolution (auto-finishes by 8 s). The
   target's loss is capped and one of their Treats absorbs it completely. */
const CLUE = { sparkle: '✨', pawprint: '🐾', 'carrot-top': '🌱', ribbon: '🎀', root: '〰️', glint: '💎', dirt: '·' };
const FIND = { coins: f => `+${f.coins}`, snaps: f => `+${f.snaps} Snaps`, treat: () => 'Treat!', poka: () => 'POKA', prop: () => 'Acorn cap', photo: () => 'Photo!', dirt: f => `+${f.coins}`, jackpot: f => `JACKPOT ${f.coins}` };
function stashDig() {
  S.busy = true; milestone('stash');
  const target = pickStashTarget(q.get('players') ? JSON.parse(q.get('players')) : [], rand);
  let d = createDig(target, rand); S.dig = d;
  hold('dig', 30);
  $('#stTarget').textContent = `${target.name}'s stash${target.ai ? ' · demo' : ''}`;
  const bed = $('#stBed'); bed.innerHTML = d.cells.map(c => `<button data-k="${c.k}" aria-label="Dig here"><i class="clue">${CLUE[c.clue] || ''}</i></button>`).join('');
  const panel = $('#stash'); panel.hidden = false; $('#stNote').textContent = 'Tap where the clues are!';
  const digsEl = $('#stDigs'); digsEl.textContent = `${d.digsLeft} digs`;
  const t0 = performance.now(); let closed = false;
  const finish = () => {
    if (closed) return; closed = true; clearTimeout(auto);
    const taken = d.finds.reduce((n, f) => n + (f.coins || 0), 0), loss = stashLoss(target, taken);
    S.events.push({ ev: 'stash', target: target.id, finds: d.finds.map(f => f.loot), loss: loss.lost, protected: loss.protected, ms: Math.round(performance.now() - t0) });
    $('#stNote').textContent = loss.protected ? `${target.name}'s Treat kept their coins safe — your finds are still yours!` : `${target.name} lost ${loss.lost} coins (capped).`;
    setTimeout(() => { panel.hidden = true; S.busy = false; hold('happy', 1); afterLand(); updateHud(); }, 1100);
  };
  const digAt = k => {
    const r = dig(d, k, S.mult); if (!r.find) return; d = r.d; S.dig = d;
    const f = r.find, btn = bed.querySelector(`[data-k="${k}"]`); btn.classList.add('dug'); btn.innerHTML = `<span class="find">${FIND[f.loot](f)}</span>`;
    hold('dig', 30); haptic();
    if (f.loot === 'jackpot') milestone('jackpot');
    grant({ coins: f.coins, snaps: f.snaps, treats: f.treats, collection: f.collection }, 'STASH');
    if (f.photoWindowS) S.pendingPhoto = f.photoWindowS;
    digsEl.textContent = `${d.digsLeft} dig${d.digsLeft === 1 ? '' : 's'}`;
    if (d.digsLeft <= 0) finish();
  };
  bed.querySelectorAll('button').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); digAt(+b.dataset.k); }));
  S.digAt = digAt;
  const auto = setTimeout(() => { while (d.digsLeft > 0 && !closed) { const c = d.cells.find(x => !x.dug); if (!c) break; digAt(c.k); } finish(); }, 8000);
}

/* --------------------------------------------------------------- LUCKY -- */
const LUCKY_ICON = { snaps: '📸', coins: '💰', treat: '🥕', poka: '🐾', warp: '🌀', build: '🔨', photo: '✨', points: '🌸' };
function luckyFlip(out) {
  S.busy = true; milestone('lucky');
  const el = $('#lucky'); el.hidden = false; const card = el.querySelector('.lkCard'); card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
  $('#lkIco').textContent = LUCKY_ICON[out.lucky] || '🍀';
  $('#lkTxt').textContent = out.lucky === 'warp' ? 'Warp ahead!' : out.lucky === 'photo' ? 'Photo moment!' : out.lucky === 'points' ? `+${out.points} BLOOM` : out.lucky === 'build' ? 'Free Build step' : out.lucky === 'poka' ? 'POKA reward' : rewardText(out);
  S.events.push({ ev: 'lucky', lucky: out.lucky });
  hold('happy', 1.4);
  setTimeout(() => {
    el.hidden = true; S.busy = false;
    if (out.lucky === 'warp') { const n = (Math.floor(S.pos / 10) + 1) * 10 - S.pos; return bonusRun(n, 'warp'); }
    if (out.lucky === 'photo') return photoWin('play', out.photoWindowS || 3, 'pose');
    if (out.lucky === 'points') { const r = addPoints(S.ms, out.points, Date.now()); S.ms = r.ms; flyPts(out.points); r.crossed.forEach(t => setTimeout(() => celebrateTier(t), 800)); setTimeout(updateMs, 700); }
    else grant({ coins: out.coins, snaps: out.snaps, treats: out.treats, collection: out.collection, buildSteps: out.buildSteps }, 'LUCKY');
    afterLand();
  }, 1500);
}

/* ------------------------------------------------------------- landmarks -- */
function upgradeLandmark(id) {
  const l = scene.landmarks.find(x => x.id === id); if (!l || l.stage >= 2) return;
  setStage(scene, id, l.stage + 1); S.upgrades[id] = l.stage;
  setTimeout(() => { S.bounce = { id, t0: T }; cue(`🔨 <b>${l.lm.name}</b> upgraded · ${l.lm.upgrades[l.stage]}`, '#ff9a3c'); }, 900);
}

/* --------------------------------------------------------------- effects -- */
function flyReward(kind, n) {
  const from = S.petScreen || { x: W / 2, y: H * 0.45 };
  const sel = kind === 'coin' ? '#coinPill' : kind === 'snap' ? '#rollChip' : '[data-widget="race"]';
  const to = $(sel)?.getBoundingClientRect();
  const el = document.createElement('div'); el.className = 'flyIcon ' + kind; el.textContent = kind === 'flag' ? '🏁' : `+${n.toLocaleString()}`;
  document.body.appendChild(el);
  const tx = to ? to.left + to.width / 2 : W / 2, ty = to ? to.top + to.height / 2 : 30;
  el.animate([{ left: from.x + 'px', top: from.y + 'px', transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 }, { offset: 0.2, transform: 'translate(-50%,-90%) scale(1.15)', opacity: 1 }, { left: tx + 'px', top: ty + 'px', transform: 'translate(-50%,-50%) scale(.7)', opacity: 0.9 }], { duration: 760, easing: 'cubic-bezier(.4,0,.2,1)' })
    .onfinish = () => { el.remove(); if (kind === 'coin') S.coins += n; pulse(sel); };
}
function flyTo(label, sel, color) { const to = $(sel)?.getBoundingClientRect(), from = S.petScreen || { x: W / 2, y: H / 2 }; if (!to) return; const el = document.createElement('div'); el.className = 'msPts'; el.style.background = color; el.textContent = label; document.body.appendChild(el); el.animate([{ left: from.x + 'px', top: from.y + 'px', transform: 'translate(-50%,-50%)', opacity: 1 }, { left: (to.left + to.width / 2) + 'px', top: (to.top + to.height / 2) + 'px', transform: 'translate(-50%,-50%) scale(.6)', opacity: 0.8 }], { duration: 700, easing: 'cubic-bezier(.4,0,.2,1)' }).onfinish = () => { el.remove(); pulse(sel); }; }
function pulse(sel) { const e = $(sel); if (!e) return; e.classList.remove('pulse'); void e.offsetWidth; e.classList.add('pulse'); }
function landCue(title, text, hue) { const el = $('#landing'); el.innerHTML = `<b>${title}</b><span>${text}</span>`; el.style.setProperty('--c', hue); el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }
function treatFx() { S.fx = { kind: 'treat', t0: T }; }
function hearts() { S.fx = { kind: 'hearts', t0: T }; }
function toyPop() { S.fx = { kind: 'toy', t0: T }; }
function drawFx() {
  const f = S.fx, p = S.petScreen; if (!f || !p) return; const k = (T - f.t0) / 1.4; if (k > 1) { S.fx = null; return; }
  ctx.save(); ctx.globalAlpha = 1 - k;
  if (f.kind === 'hearts') for (let i = 0; i < 6; i++) { const a = i * 1.05 + k * 2, r = 20 + k * 60; ctx.fillStyle = i % 2 ? '#ff6b8b' : '#ff9fc4'; ctx.font = `${16 + i % 3 * 4}px system-ui`; ctx.textAlign = 'center'; ctx.fillText('❤', p.x + Math.cos(a) * r * 0.6, p.y - k * 70 - Math.sin(a) * 10); }
  if (f.kind === 'treat') { drawTreat(ctx, p.x + 10, p.y + 20 - k * 30, 0.5); }
  if (f.kind === 'toy') for (let i = 0; i < 5; i++) { ctx.fillStyle = ['#ff6b6b', '#ffd23f', '#4fc3f7', '#7fe08a', '#c39bff'][i]; ctx.beginPath(); ctx.arc(p.x + (i - 2) * 22 * k, p.y - 40 - Math.sin(k * Math.PI) * 50 + i * 4, 6, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

/* ------------------------------------------------------------ rendering -- */
const BASE_TOP = 0.18 + 0.15;
function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  frame(cam, W, H);
  const pet = petNow();
  const highlight = {};
  if (S.run && S.run.kind !== 'throw') highlight[((S.run.to % SPACE_COUNT) + SPACE_COUNT) % SPACE_COUNT] = 'land';
  if (S.lastLanding && T - S.lastLanding.at < 1.4) highlight[S.lastLanding.pos] = 'land';
  const extras = [{ x: pet.x, z: pet.z, y: 0, bias: 0.01, draw: (c, cm) => drawPet(c, cm, pet) }];
  const ob = objectInWorld(pet); if (ob) extras.push(ob);
  drawWorld(ctx, cam, scene, T, { highlight, extras, cameraMode: S.mode === 'camera', bounce: S.bounce, week: S.week, stage: S.stageGlow });
  drawFx();
  if (S.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${S.flash})`; ctx.fillRect(0, 0, W, H); S.flash = Math.max(0, S.flash - 0.14); }
}
let widgetRects = [];
function measureWidgets() { widgetRects = [...document.querySelectorAll('[data-widget]')].map(el => ({ el, r: el.getBoundingClientRect() })); }
function fadeWidgetsOverPet() {
  const p = S.petScreen; if (!p || S.mode !== 'board') return;
  for (const { el, r } of widgetRects) { const over = p.x + p.r * 0.5 > r.left && p.x - p.r * 0.5 < r.right && p.y + p.r > r.top && p.y - p.r * 0.6 < r.bottom; el.classList.toggle('overPet', over); }
}
function drawPet(c, cm, pet) {
  const onStage = S.petAt && !S.petAt.back ? 0.16 : 0;
  const g = project(cm, pet.x, BASE_TOP + onStage * 0, pet.z); if (!g) return;
  const body = project(cm, pet.x, BASE_TOP + (pet.lift || 0) + pet.y, pet.z); if (!body) return;
  const unit = g.k * 0.72 / 160 * (CAMERA_PRESETS[S.preset].overview ? 1.9 : 1);
  const sh = Math.max(0.35, 1 - pet.y * 0.5);
  c.fillStyle = 'rgba(50,40,30,.32)'; c.beginPath(); c.ellipse(g.x, g.y, 50 * unit * sh, 50 * unit * sh * Math.max(0.3, Math.sin(cm.pitch)), 0, 0, Math.PI * 2); c.fill();
  const view = viewFor(pet.heading, cm.yaw, cm.pitch);
  const ahead = project(cm, pet.x + Math.sin(pet.heading) * 0.5, BASE_TOP, pet.z + Math.cos(pet.heading) * 0.5);
  const faceRight = ahead ? ahead.x >= g.x : true;
  S.view = view;
  c.save(); c.translate(body.x, body.y); c.scale(unit, unit);
  let v = view;
  if (view === 'side-l' || view === 'side-r') { v = 'side'; if (!faceRight) c.scale(-1, 1); }
  if (view === 'elevated' || view === 'aerial') { v = 'elevated'; if (!faceRight) c.scale(-1, 1); }
  if (S.petAt && !S.run) v = 'front';
  const blink = (S.A % 3.7) > 3.55 ? 1 : 0;
  S.anchors = drawPudding(c, { view: v, phase: pet.phase, u: pet.u, t: S.A, pal: PET.pal, blink, held: heldItem(pet.phase), drawHeld });
  c.restore();
  S.petScreen = { x: body.x, y: body.y - 80 * unit, r: 90 * unit, airborne: pet.y > 0.05 };
}
function heldItem(ph) { const o = S.run?.object; if ((o === 'treat' && (ph === 'eat' || ph === 'savor')) || (!S.run && ph === 'eat')) return 'treat'; if (o === 'bubble' && ph === 'paw') return 'bubble'; return null; }
function objectInWorld(pet) {
  if (!S.run || S.run.kind !== 'throw') return null;
  const r = S.run, sm = pet.sm, A = S.A, toss = r.toss || 2, dest = trailPoint(r.from + toss);
  if (r.object === 'frisbee') {
    const k = Math.min(1, Math.max(0, (S.runT - 0.1) / 1.0));
    const p = trailPoint(r.from + toss * k);
    const y = BASE_TOP + (k < 1 ? 0.45 + Math.sin(Math.PI * k) * 1.2 : 0.05);
    return { x: p.x, z: p.z, y, draw: (c, cm) => { const s = project(cm, p.x, y, p.z), gs = project(cm, p.x, BASE_TOP, p.z); if (!s) return; shadowAt(c, cm, gs, 0.12); drawFrisbee(c, s.x, s.y, s.k / 110, k < 1 ? 0.35 : 0.22, k < 1 ? A * 18 : 0); } };
  }
  if (r.object === 'ball') {
    const k = Math.min(1, S.runT / Math.max(0.5, r.duration * 0.6));
    const p = trailPoint(r.from + toss * k * 0.8);
    return { x: p.x, z: p.z, y: 0, draw: (c, cm) => { const s = project(cm, p.x, BASE_TOP + 0.08, p.z), gs = project(cm, p.x, BASE_TOP, p.z); if (!s) return; shadowAt(c, cm, gs, 0.09); drawBall(c, s.x, s.y, s.k / 190, A * 9); } };
  }
  if (r.object === 'treat' && (sm.phase === 'sniff' || sm.phase === 'approach')) {
    return { x: dest.x, z: dest.z, y: 0, draw: (c, cm) => { const s = project(cm, dest.x, BASE_TOP + 0.05 + Math.abs(Math.sin(A * 3)) * 0.03, dest.z); if (!s) return; drawTreat(c, s.x, s.y, s.k / 150); } };
  }
  if (r.object === 'bubble') {
    return { x: pet.x, z: pet.z, y: 0, bias: -0.2, draw: (c, cm) => { for (let i = 0; i < 7; i++) { const a = i * 2.1 + A * 0.7, rr = 0.35 + (i % 3) * 0.2, hy = BASE_TOP + 0.5 + ((A * 0.35 + i * 0.17) % 1) * 1.3; const s = project(cm, pet.x + Math.cos(a) * rr, hy, pet.z + Math.sin(a) * rr); if (s) drawBubble(c, s.x, s.y, s.k * (0.05 + (i % 3) * 0.02), A + i, 1 - ((A * 0.35 + i * 0.17) % 1) * 0.6); } } };
  }
  return null;
}
function shadowAt(c, cm, g, r) { if (!g) return; c.fillStyle = 'rgba(50,40,30,.22)'; c.beginPath(); c.ellipse(g.x, g.y, g.k * r, g.k * r * Math.max(0.3, Math.sin(cm.pitch)), 0, 0, Math.PI * 2); c.fill(); }

/* --------------------------------------------------------------- actions -- */
/* THROW: a free play moment with the selected object. Pudding reacts where she stands
   (rabbit behaviours only); it never moves her along the board and costs nothing. */
export function play() {
  if (S.run || S.busy) return false;
  const run = planRun(S.object, S.pos, rand, S.mult, PET.species);
  run.toss = run.distance; run.distance = 0; run.to = run.from; run.kind = 'throw';
  S.run = run; S.runT = 0; S.log = []; $('#landing').classList.remove('show');
  haptic(); updateHud(); return true;
}
function claimTreat() {
  const day = new Date().toDateString(); if (S.treatDay === day) S.treatClaimed = true;
  if (S.treatClaimed) { cue('Daily Treats are back tomorrow', '#ff9fc4'); return; }
  S.treatClaimed = true; S.treatDay = new Date().toDateString(); S.roll = addRoll(S.roll, DAILY_TREAT_ROLL); flyReward('snap', DAILY_TREAT_ROLL); updateHud();
}
export function setPreset(p) {
  S.preset = p; S.orbit = { yaw: 0, pitch: 0, zoom: 1 };
  S.mode = isCameraMode(p) ? 'camera' : 'board';
  document.body.classList.toggle('camera-mode', S.mode === 'camera');
  resize(); updateHud();
}
function cycleView() { const i = CAMERA_ORDER.indexOf(S.preset); setPreset(S.mode === 'board' ? 'front' : i === CAMERA_ORDER.length - 1 ? 'board' : CAMERA_ORDER[i + 1]); }

/* ---------------------------------------------------------------- HUD -- */
function regenEta() { const u = S.roll; if (u.units >= SNAP_ROLL.cap) return 'Full'; const ms = SNAP_ROLL.regenEveryMs - ((Date.now() - u.at) % SNAP_ROLL.regenEveryMs); const s = Math.ceil(ms / 1000); return `in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
function regenLine() { const el = $('#regenLine'); if (el) el.textContent = S.roll.units >= SNAP_ROLL.cap ? 'Snaps full' : `${SNAP_ROLL.regenChunk} snaps ready ${regenEta()}`; }
function msClock() { const el = $('#msTime'); if (el) el.textContent = countdown(S.ms, Date.now()); }
function updateMs() {
  const ev = MILESTONE_EVENTS[S.ms.id], nt = nextTier(S.ms), prev = ev.tiers.filter((t, i) => S.ms.claimed.includes(i)).map(t => t.at).pop() || 0;
  $('#msTitle').textContent = ev.title;
  const target = nt ? nt.at : ev.tiers[ev.tiers.length - 1].at;
  $('#msText').textContent = `${S.ms.points}/${target}`;
  $('#msFill').style.width = Math.min(100, (S.ms.points - prev) / Math.max(1, target - prev) * 100) + '%';
  const rw = nt ? nt.reward : {}, [rk, rv] = Object.entries(rw)[0] || ['', ''];
  $('#msRewardN').textContent = rk === 'coins' ? (rv >= 1000 ? (rv / 1000) + 'k' : rv) : rk === 'treats' ? '🥕' : rk === 'buildSteps' ? '🔨' : rk === 'collection' ? '🐾' : rv;
  $('#ms').classList.toggle('next', !!nt && target - S.ms.points <= Math.max(3, (target - prev) * 0.2));
  msClock();
}
function updateHud() {
  persist();
  const u = S.roll.units;
  $('#rollN').textContent = u.toLocaleString(); $('#rollCap').textContent = '/' + SNAP_ROLL.cap;
  $('#rollFill').style.width = Math.min(100, u / SNAP_ROLL.cap * 100) + '%';
  $('#rollChip').classList.toggle('over', u > SNAP_ROLL.cap);
  regenLine();
  S.mult = stepDown(S.mult, u);
  $('#toeMult b').textContent = S.mult + 'x'; $('#toeMult').dataset.m = S.mult;
  $('#toeView b').textContent = S.mode === 'camera' ? CAMERA_LETTERS[S.preset] : 'F';
  $('#toeView').classList.toggle('on', S.mode === 'camera');
  $('#toeSpeed').dataset.speed = S.speed; $('#toeSpeed').setAttribute('aria-label', 'Playback speed: ' + S.speed);
  drawIcon($('#objIcon'), S.object);
  document.querySelectorAll('.tr').forEach((el, i) => el.classList.toggle('off', i >= S.treats));
  $('#treats').setAttribute('aria-label', `Treats ${S.treats} of ${TREATS.max}`);
  $('#snapBtn').classList.toggle('live', !!S.run && S.run.kind !== 'throw');
  $('#toeThrow').classList.toggle('busy', !!S.run);
  document.querySelectorAll('[data-obj]').forEach(b => b.classList.toggle('on', b.dataset.obj === S.object));
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === S.preset));
  const legal = legalMultipliers(u);
  document.querySelectorAll('[data-mult]').forEach(b => { const m = +b.dataset.mult; b.classList.toggle('on', m === S.mult); b.classList.toggle('locked', !legal.includes(m)); });
  const n = albumDone(S.album); $('#albumBadge').textContent = n || ''; $('#albumBadge').hidden = !n;
  $('[data-widget="race"] .wtag').textContent = `${{ race: '🏁', dance: '🎵', flight: '🎈', switch: '🛤️' }[S.week]} ${S.ev[CUR[S.week]]}`; $('[data-widget="race"] .wlabel').textContent = WEEKLY_MODES[S.week].name.replace('Poka ', '').toUpperCase();
}
function drawIcon(cv, kind) { if (!cv) return; const c = cv.getContext('2d'), r = 2; cv.width = 48 * r; cv.height = 48 * r; c.scale(r, r); drawObjectIcon(c, kind, 24, 24, 1.05); }
function cue(html, color) { const el = $('#moment'); el.innerHTML = html; el.style.setProperty('--c', color || '#ff6b8b'); el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }
function flyThumb(thumb) {
  const img = document.createElement('canvas'); img.width = thumb.width; img.height = thumb.height; img.getContext('2d').drawImage(thumb, 0, 0); img.className = 'fly'; document.body.appendChild(img);
  const t = $('[data-nav="ALBUM"]').getBoundingClientRect(), from = S.petScreen || { x: W / 2, y: H * 0.4 };
  img.animate([{ transform: 'translate(-50%,-50%) scale(1) rotate(-4deg)', left: from.x + 'px', top: from.y + 'px', opacity: 1 },
               { transform: 'translate(-50%,-50%) scale(.35) rotate(8deg)', left: (t.left + t.width / 2) + 'px', top: (t.top + t.height / 2) + 'px', opacity: 0.7 }],
              { duration: 520, easing: 'cubic-bezier(.5,0,.3,1)' }).onfinish = () => { img.remove(); pulse('[data-nav="ALBUM"]'); };
}
function shakePad() { $('#snapBtn').animate([{ translate: '0 0' }, { translate: '-6px 0' }, { translate: '6px 0' }, { translate: '0 0' }], { duration: 260 }); }
function haptic() { try { window.Capacitor?.nativePromise?.('PokaNative', 'haptic', { style: 'light' }).catch(() => {}); } catch (e) {} }

/* ------------------------------------------------------------ sheets -- */
function sheet(html) { $('#sheetBody').innerHTML = html; $('#sheet').hidden = false; }
function albumSheet() {
  const slots = S.album.slots.map(sl => { const p = sl.photoId && S.photos.find(x => x.id === sl.photoId), src = p ? p.url : sl.photoId && S.albumThumbs[sl.photoId]; return `<div class="slot${sl.photoId ? ' done' : ''}" data-slot="${sl.id}">${src ? `<img src="${src}" alt=""><span class="id">${sl.photoId.slice(-6)}</span>` : ''}<b>${sl.label}</b></div>`; }).join('');
  sheet(`<h2>📒 ${ALBUM_SEASON.title} Album</h2><p>${albumDone(S.album)}/${S.album.slots.length} · every card is one of YOUR photos — it can't be bought or won</p><div class="slots">${slots}</div>`);
}
function treatSheet() { sheet(`<h2>🥕 Treats ${S.treats}/${TREATS.max}</h2><p>Land on TREAT to fill a slot. Each Treat protects your Stash from one dig. When all five are full, extra Treats turn into ${TREATS.overflowSnaps} Snaps.</p><button class="rBtn" id="shDaily">${S.treatClaimed ? 'Daily Treats claimed' : `Claim Daily Treats · +${DAILY_TREAT_ROLL} Snaps`}</button>`); $('#shDaily').onclick = () => { claimTreat(); $('#sheet').hidden = true; }; }
function pokaSheet() { sheet(`<h2>🐾 POKA</h2><p>Collection ${S.collection}/24 · species, coats, outfits, poses and badges. Pudding (cream lop rabbit) is your Poka. Other species open after the visual gate.</p>`); }

/* --------------------------------------------------------------- the paw -- */
function holdable(el, role, onHold) {
  let timer = null, held = false, fired = false;
  const down = e => { e.preventDefault(); held = false; fired = false; el.classList.add('pressed'); haptic();
    if (S.scene !== 'board') { fired = true; pawTap(role, 'pointer'); return; }
    timer = setTimeout(() => { held = true; el.classList.remove('pressed'); onHold?.(); }, 380); };
  const up = e => { clearTimeout(timer); el.classList.remove('pressed'); if (!held && !fired && e.type === 'pointerup') pawTap(role, 'pointer'); };
  el.addEventListener('pointerdown', down); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', () => { clearTimeout(timer); el.classList.remove('pressed'); });
  el.addEventListener('click', e => { if (e.detail === 0) pawTap(role, 'pointer'); });
}
function openMenu(id) { document.querySelectorAll('.pawMenu').forEach(m => m.classList.toggle('open', m.id === id && !m.classList.contains('open'))); }
function closeMenus() { document.querySelectorAll('.pawMenu').forEach(m => m.classList.remove('open')); }
/* THE one action path. Pointer, touch and keyboard all arrive here with the same role. */
function pawTap(role, src = 'api') {
  const mode = S.scene === 'board' ? 'main' : S.scene;
  S.inputs.push({ t: Math.round(performance.now()), src, role, mode, act: PAW_MODES[mode]?.[role]?.act });
  if (S.inputs.length > 400) S.inputs.splice(0, 100);
  if (S.scene !== 'board') return GAMES[S.scene].input(role);
  closeMenus(); $('#sheet').hidden = true;
  if (role === 'center') { if (S.photoWin || S.mode === 'camera' || S.run?.kind === 'throw') return snap(); return move(src); }
  if (role === 'left') return play();
  if (role === 'upLeft') { S.speed = nextSpeed(S.speed); updateHud(); cue(`Speed · ${SPEEDS.find(s => s.id === S.speed).factor}x`, '#4f9cff'); return; }
  if (role === 'upRight') return cycleView();
  if (role === 'right') { S.mult = nextMultiplier(S.mult, S.roll.units); updateHud(); }
}
const PAD_EL = { center: '#snapBtn', left: '#toeThrow', upLeft: '#toeSpeed', upRight: '#toeView', right: '#toeMult' };
/* Desktop keyboard: the key resolves to a paw ROLE and runs the same pawTap a click runs. Typing in an
   editable field is never hijacked, key-repeat is ignored (a click can't auto-repeat either). */
function onKey(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const mode = S.scene === 'board' ? 'main' : S.scene;
  if (!$('#sheet').hidden && e.key !== 'Escape') return;
  const role = keyRole(mode, e.key, e.target); if (!role) return;
  e.preventDefault(); if (e.repeat) return;
  const el = $(PAD_EL[role]); el.classList.add('pressed'); setTimeout(() => el.classList.remove('pressed'), 120);
  pawTap(role, 'key');
}
/* Desktop hints: glyphs come FROM KEYMAP, so a remap can never leave a stale hint. */
function hints() {
  const mode = S.scene === 'board' ? 'main' : S.scene, map = KEYMAP[mode] || {};
  for (const r of PAW_ROLES) { const key = Object.keys(map).find(k => map[k] === r), el = $(PAD_EL[r] + ' .kh'); if (el) el.textContent = key ? KEY_GLYPH[key] : ''; }
}

/* --------------------------------------------------------------- wiring -- */
let fpsEl = null;
function wire() {
  holdable($('#snapBtn'), 'center');
  holdable($('#toeThrow'), 'left', () => S.scene === 'board' && openMenu('objMenu'));
  holdable($('#toeSpeed'), 'upLeft');
  holdable($('#toeView'), 'upRight', () => S.scene === 'board' && openMenu('viewMenu'));
  holdable($('#toeMult'), 'right', () => S.scene === 'board' && openMenu('multMenu'));
  document.querySelectorAll('[data-obj]').forEach(b => { drawIcon(b.querySelector('canvas'), b.dataset.obj); b.addEventListener('click', () => { if (S.run) return; S.object = b.dataset.obj; closeMenus(); updateHud(); }); });
  document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { setPreset(b.dataset.view); closeMenus(); }));
  document.querySelectorAll('[data-mult]').forEach(b => b.addEventListener('click', () => { const m = +b.dataset.mult; if (!legalMultipliers(S.roll.units).includes(m)) { const need = MULTIPLIER_LADDER.find(r => r.max === m)?.min; cue(`${m}x unlocks at ${need?.toLocaleString()} Snaps`, '#9a6bff'); return; } S.mult = m; closeMenus(); updateHud(); }));
  $('#exitCam').addEventListener('click', () => setPreset('board'));
  $('#menuBtn').addEventListener('click', () => $('#menu').classList.toggle('open'));
  document.querySelectorAll('#menu [data-menu]').forEach(b => b.addEventListener('click', () => { $('#menu').classList.remove('open'); const k = b.dataset.menu; if (k === 'treats') claimTreat(); else if (k === 'radio') Radio.open(); else if (k === 'settings') aboutSheet(); else if (k.startsWith('game:')) enterGame(k.slice(5)); else if (k === 'help') cue(`PokaSnap ${BUILD.label}`, '#9a6bff'); else cue(`${b.textContent.trim()} — opens in a later phase`, '#9a6bff'); }));
  document.querySelectorAll('[data-widget]').forEach(b => b.addEventListener('click', () => { const id = b.dataset.widget; if (id === 'race') enterGame(S.week); else if (id === 'treats') claimTreat(); else if (id === 'photo') albumSheet(); else cue(`${WIDGETS.find(w => w.id === id).label} — live content in a later phase`, '#9a6bff'); }));
  document.querySelectorAll('.nav [data-nav]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.nav; if (k === 'ALBUM') albumSheet(); else if (k === 'TREAT') treatSheet(); else if (k === 'POKA') pokaSheet(); else { $('#sheet').hidden = true; setPreset('board'); cue('🏠 Home · Puddle Park', '#ff8a6b'); } }));
  $('#sheet .shClose').addEventListener('click', () => { $('#sheet').hidden = true; });
  document.addEventListener('keydown', onKey);
  canvas.addEventListener('click', e => { if (S.scene !== 'board' || S.mode !== 'board') return; const c = project(cam, 0, 0.42, 0); if (c && Math.hypot(e.clientX - c.x, (e.clientY - c.y) * 1.6) < c.k * 1.2 && !S.busy && !S.run) enterGame(S.week); });
  const pts = new Map(); let pinch0 = 0, zoom0 = 1, lastTap = 0;
  let sw = null;
  canvas.addEventListener('pointerdown', e => { if (S.scene === 'switch') sw = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', e => { if (S.scene !== 'switch' || !sw) return; const dx = e.clientX - sw.x, dy = e.clientY - sw.y; sw = null; S.inputs.push({ t: Math.round(performance.now()), src: 'swipe', mode: 'switch', dx, dy }); Switch.swipe(dx, dy); });
  $('#gamePause').addEventListener('click', () => { S.paused = true; $('#gamePanel').hidden = false; });
  $('#gpResume').addEventListener('click', () => { S.paused = false; $('#gamePanel').hidden = true; });
  $('#gpRetry').addEventListener('click', () => { const id = S.scene; S.paused = false; $('#gamePanel').hidden = true; GAMES[id].start(gameEnv(id), gameOpts(id)); });
  $('#gpExit').addEventListener('click', () => { S.paused = false; $('#gamePanel').hidden = true; GAMES[S.scene].quit(); });
  canvas.addEventListener('pointerdown', e => { if (S.scene !== 'board' || S.mode !== 'camera') return; canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = S.orbit.zoom; } const now = Date.now(); if (now - lastTap < 280) S.orbit = { yaw: 0, pitch: 0, zoom: 1 }; lastTap = now; closeMenus(); });
  canvas.addEventListener('pointermove', e => { const p = pts.get(e.pointerId); if (!p) return; if (pts.size === 1) { S.orbit.yaw -= (e.clientX - p.x) * 0.008; S.orbit.pitch += (e.clientY - p.y) * 0.004; } p.x = e.clientX; p.y = e.clientY; if (pts.size === 2) { const [a, b] = [...pts.values()]; S.orbit.zoom = Math.max(0.6, Math.min(2.6, zoom0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch0)); } });
  const up = e => pts.delete(e.pointerId); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { if (S.mode !== 'camera') return; S.orbit.zoom = Math.max(0.6, Math.min(2.6, S.orbit.zoom * (e.deltaY < 0 ? 1.08 : 0.92))); e.preventDefault(); }, { passive: false });
  if (q.get('fps') === '1') { fpsEl = document.createElement('div'); fpsEl.className = 'fpsMeter'; document.body.appendChild(fpsEl); }
}

/* --------------------------------------------------------- weekly games -- */
const CUR = { race: 'flags', dance: 'beat', flight: 'wind', switch: 'pass' };
function setPaw(mode) {
  const paw = $('#paw'); paw.dataset.mode = mode;
  for (const r of PAW_ROLES) { const el = $(PAD_EL[r]), m = PAW_MODES[mode]?.[r]; el.removeAttribute('data-state'); el.removeAttribute('data-lane'); el.removeAttribute('data-meter'); el.querySelector('.meter')?.remove();
    if (mode !== 'main' && m) { el.querySelector('.alt .ai').textContent = m.icon; el.querySelector('.alt .al').textContent = m.label; el.setAttribute('aria-label', m.label); el.dataset.act = m.act; } else delete el.dataset.act; }
  hints();
}
function padState(role, st = {}) {
  const el = $(PAD_EL[role]); if (!el) return;
  if (st.icon != null) el.querySelector('.alt .ai').textContent = st.icon;
  if (st.label != null) el.querySelector('.alt .al').textContent = st.label;
  if (st.state) el.dataset.state = st.state; else if (st.state === null) el.removeAttribute('data-state');
  if (st.lane != null) el.dataset.lane = st.lane;
  if (st.meter != null) { let m = el.querySelector('.meter'); if (!m) { m = document.createElement('i'); m.className = 'meter'; el.appendChild(m); } el.dataset.meter = ''; el.style.setProperty('--meter', Math.max(0, Math.min(1, st.meter))); }
}
function gameEnv(id) { return { id, pal: PET.pal, snap: o => snap({ ...o, game: id }), haptic, cue, pad: padState, practice: S.practice, onExit: r => exitGame(id, r) }; }
function gameOpts(id) { return { seed: q.has('gameSeed') ? +q.get('gameSeed') : q.has('raceSeed') ? +q.get('raceSeed') : undefined, autopilot: q.get('autopilot') === '1' }; }
function enterGame(id) {
  if (S.scene !== 'board' || !GAMES[id] || S.busy) return;
  const active = id === S.week, key = CUR[id];
  if (active) { if ((S.ev[key] || 0) < 1) { cue(`Earn a ${WEEKLY_MODES[id].currency.name.replace(/s$/, '')} on the board first`, '#ff6b8b'); return; } S.ev[key] -= 1; S.practice = false; }
  else S.practice = true;
  S.scene = id; document.body.classList.add('game-mode', id + '-mode'); setPaw(id); closeMenus(); $('#menu').classList.remove('open'); $('#sheet').hidden = true;
  $('#gamePause').hidden = false; resize();
  GAMES[id].start(gameEnv(id), gameOpts(id));
  updateHud();
}
function exitGame(id, result) {
  S.scene = 'board'; document.body.classList.remove('game-mode', id + '-mode'); setPaw('main'); $('#gamePause').hidden = true; $('#gamePanel').hidden = true; S.paused = false; resize();
  if (result && !result.quit) {
    const coins = S.practice ? Math.round(result.coins * 0.5) : result.coins;
    flyReward('coin', coins); if (result.roll && !S.practice) { S.roll = addRoll(S.roll, result.roll); flyReward('snap', result.roll); }
    if (!S.practice) milestone('gameFinish', 1);
    cue(`${WEEKLY_MODES[id].name}${S.practice ? ' (practice)' : ''} · ${result.summary || ''}`, '#ff8a6b');
  }
  updateHud();
}
const enterRace = () => enterGame('race'), exitRace = r => exitGame('race', r);
S.ev = S.evSaved || { flags: 3, beat: 3, wind: 3, pass: 3 };
Object.defineProperty(S, 'flags', { get: () => S.ev.flags, set: v => { S.ev.flags = v; } });
S.week = q.has('week') && WEEKLY_MODES[q.get('week')] ? q.get('week') : activeMode(Date.now());
scene.week = S.week;

S.api = { bakeMs: () => bakeMs, move, play, snap, pawTap, nextDistance: d => { forcedNext = d; }, setObject: o => { S.object = o; updateHud(); }, setMult: m => { S.mult = stepDown(m, S.roll.units); updateHud(); }, setPreset: p => { setPreset(p); S.snapCam = true; }, setSpeed: s => { S.speed = s; updateHud(); }, setRoll: u => { S.roll = { units: u, at: Date.now() }; updateHud(); }, setTreats: n => { S.treats = n; updateHud(); }, setPos: p => { S.pos = p; S.heading = trailPoint(p).heading; }, claimTreat, enterRace, exitRace, upgrade: upgradeLandmark, petNow, cam: () => ({ ...cam }), scene: () => scene, fps: () => ({ ...fps }), race: () => Race.state(), raceSim: () => Race.sim(), enterGame, exitGame, game: () => S.scene !== 'board' ? GAMES[S.scene].state() : null, gameSim: () => S.scene !== 'board' ? GAMES[S.scene].sim() : null, setPaw, padState, albumSheet, treatSheet, pokaSheet, speedshot, stashDig, milestone, digAt: k => S.digAt?.(k), ms: () => ({ ...S.ms }), album: () => S.album, keyRole };

S.heading = trailPoint(S.pos).heading;
wire(); setPreset(S.preset); hints(); updateMs(); requestAnimationFrame(measureWidgets);
requestAnimationFrame(tick);
if (q.get('race') === '1') { S.flags = Math.max(S.flags, 1); enterGame('race'); }
if (q.has('game') && GAMES[q.get('game')]) enterGame(q.get('game'));
$('#buildTag').textContent = BUILD.label;
/* First run = a new account: a short welcome, then straight onto the board. */
function welcome() {
  if (S.account || NOSAVE) return;
  sheet(`<h2>Welcome to PokaSnap!</h2><p>Meet <b>Pudding</b>, your cream lop bunny. Tap <b>SNAP</b> to hop around the 40-space park, land on spaces for Treats, Stashes and photo moments, and fill your Album with your own photos.</p><button class="rBtn" id="shStart">Start playing</button>`);
  $('#sheet .shClose').hidden = true;
  $('#shStart').onclick = () => { S.account = { mode: 'guest', id: 'g-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), createdAt: Date.now() }; $('#sheet').hidden = true; $('#sheet .shClose').hidden = false; persist(true); S.events.push({ ev: 'account-created' }); };
}
welcome();

/* ---------------------------------------------------------- identity -- */
/* One canonical identity: version · iOS build · board generation · commit · UI bundle hash.
   build.json is stamped by tools/release/build.mjs; the native shell reports its own version
   and build. If they disagree the app says so instead of silently running a mixed build. */
S.identity = { version: null, build: BUILD.build, phase: BUILD.phase, commit: 'dev', hash: 'dev', native: null, match: true };
async function identity() {
  try { const r = await fetch('build.json', { cache: 'no-store' }); if (r.ok) Object.assign(S.identity, await r.json()); } catch (e) {}
  try { const n = await window.Capacitor?.nativePromise?.('PokaNative', 'appInfo', {}); if (n) S.identity.native = { version: n.version, build: n.build, qa: n.qa, qaPlan: n.qaPlan }; } catch (e) {}
  const I = S.identity, n = I.native;
  I.match = !n || !I.version || (String(n.build) === String(I.build) && n.version === I.version);
  window.POKASNAP_IDENTITY = `PokaSnap ${I.version || '?'} (${I.build}) ${I.phase} ${I.commit} ui:${I.hash}${n ? ` native:${n.version}(${n.build})` : ''} root:board ${I.match ? 'MATCH' : 'MISMATCH'}`;
  console.log('[identity] ' + window.POKASNAP_IDENTITY);
  try { window.Capacitor?.nativePromise?.('PokaNative', 'qaLog', { line: 'identity ' + window.POKASNAP_IDENTITY }).catch(() => {}); } catch (e) {}
  $('#buildTag').textContent = `${I.version ? 'v' + I.version + ' · ' : ''}build ${I.build} · ${I.phase}`;
  if (!I.match) { cue(`⚠️ Build mismatch: app ${n.version} (${n.build}) vs board ${I.version} (${I.build})`, '#ff4f5f'); document.body.classList.add('build-mismatch'); }
  return I;
}
function aboutSheet() {
  const I = S.identity, n = I.native;
  sheet(`<h2>⚙️ PokaSnap</h2><p>About this build</p><table class="about">${[['Version', I.version || '—'], ['iOS build', n ? n.build : I.build], ['Board', I.phase], ['Commit', I.commit], ['UI bundle', I.hash], ['App ↔ board', I.match ? '✓ match' : '✗ MISMATCH'], ['Account', S.account ? `${S.account.mode} · since ${new Date(S.account.createdAt).toLocaleDateString()}` : 'not started']].map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>`);
}
identity().then(I => {
  const plan = I.native?.qa && I.native.qaPlan;
  if (plan === 'v22proto' && !q.has('qa')) location.replace('index.html?qa=1&fps=1');       // SE device tour (never saves)
  else if (plan === 'observe') import('./qa.js').then(m => m.observe(S));                    // owner phone: snapshots + logs only, no input
});
requestAnimationFrame(() => requestAnimationFrame(() => { try { Promise.resolve(window.Capacitor?.nativePromise?.('PokaNative', 'ready', { marks: 'board' })).catch(() => {}); } catch (e) {} }));
window.__ready = true;
/* Web copy: the service worker's cache namespace is this build's UI hash (tools/release/build.mjs). */
if ('serviceWorker' in navigator && !window.Capacitor && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
if (q.get('qa') === '1') import('./qa.js').then(m => m.runTour(S));
