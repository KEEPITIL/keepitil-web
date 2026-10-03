/* Device-QA tour for the 2.2 prototype (Phase C1.5: 40-space board, Treats, Stash, Stage + Speedshot, Quick Milestones; earlier tours are in git). Loaded only with ?qa=1
   inside a POKA_DEVICE_QA native build. Every step presses the real control
   (taps via click, holds via real pointerdown/up) and is logged as ACTION; the
   only injected state is the QA wallet fixture and landmark stage previews,
   both logged as ACTION inject. Every file carries a run id (the device folder
   accumulates across launches). Burst snapshots are tagged per video:
   V1 board loop, V2 STAGE + Speedshot, V3 STASH dig, V4 Quick Milestone, V6 paw tour + gates.
   Only fixtures: the next movement distance (nextDistance) and start position (setPos), logged as ACTION inject.
   Perf GATES are measured with the snapshot burst OFF. */
import { trailPoint, pathClearance } from './core.js';
import { PET_R } from './config.js';
import * as Sim from './raceSim.js';
import * as Dance from './dance.js';
import * as Flight from './flight.js';
import * as SwitchM from './switch.js';
const call = (m, o) => window.Capacitor?.nativePromise?.('PokaNative', m, o) ?? Promise.resolve();
const wait = ms => new Promise(r => setTimeout(r, ms));
const t0 = performance.now();
const RUN = 'r' + Date.now().toString(36);
const log = line => { if (!window.Capacitor) console.log(`js22 ${Math.round(performance.now() - t0)} ${line}`); return call('qaLog', { line: `js22 ${Math.round(performance.now() - t0)} ${line}` }).catch(() => {}); };
const snap = name => Promise.race([call('qaSnapshot', { name: `${RUN}-${name}` }).catch(() => {}), wait(1200)]);
const $ = s => document.querySelector(s);
const click = (sel, why, quiet) => { const el = $(sel); if (!quiet) log(`ACTION tap ${why} (${sel}) ${el ? 'found' : 'MISSING'}`); el?.click(); return !!el; };
async function hold(sel, why) {
  const el = $(sel); log(`ACTION hold ${why} (${sel}) ${el ? 'found' : 'MISSING'}`); if (!el) return;
  const r = el.getBoundingClientRect(), o = { bubbles: true, pointerId: 7, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
  el.dispatchEvent(new PointerEvent('pointerdown', o)); await wait(480); el.dispatchEvent(new PointerEvent('pointerup', o));
}
const rect = s => { const e = $(s); if (!e) return 'MISSING'; const b = e.getBoundingClientRect(); return `${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.width)}x${Math.round(b.height)}`; };
const vis = s => { const e = $(s); if (!e) return 'MISSING'; const cs = getComputedStyle(e); return `${cs.opacity}/${cs.pointerEvents}`; };
async function fps(ms = 2000) { let n = 0, run = true, worst = 999, last = performance.now(); const f = now => { n++; worst = Math.min(worst, 1000 / Math.max(1, now - last)); last = now; if (run) requestAnimationFrame(f); }; requestAnimationFrame(f); await wait(ms); run = false; return { avg: +(n / (ms / 1000)).toFixed(1), worstFrame: +worst.toFixed(1) }; }
let burstOn = false;
function burst(tag, gap = 0) { burstOn = true; return (async () => { let i = 0; while (burstOn) { await snap(`vid-${String(Math.round(performance.now() - t0)).padStart(7, '0')}-${tag}`); i++; if (gap) await wait(gap); } return i; })(); }
const stop = async b => { burstOn = false; return b && b; };
/* how close Pudding has come to any solid footprint during a stretch of play */
function watchClearance(A) { let worst = Infinity, at = null, on = true; const solids = A.scene().solids; (async () => { while (on) { const p = A.petNow(); for (const s of solids) { const g = Math.hypot(p.x - s.x, p.z - s.z) - s.r - PET_R; if (g < worst) { worst = g; at = s.id || s.type; } } await wait(40); } })(); return () => { on = false; return { worst: +worst.toFixed(3), at }; }; }

const PAD = { center: '#snapBtn', left: '#toeThrow', upLeft: '#toeSpeed', upRight: '#toeView', right: '#toeMult' };
const tap = (role, why, quiet = true) => click(PAD[role], why || role, quiet);
async function openGame(id) { click('#menuBtn', 'menu'); await wait(350); click(`[data-menu="game:${id}"]`, `open ${id} from the menu`); await wait(600); }
const exitGame = async () => { click('#gamePause', 'pause'); await wait(300); click('#gpExit', 'exit to board'); await wait(900); };
function pawReport(mode) { return [...Object.entries(PAD)].map(([r, sel]) => { const e = $(sel), b = e.getBoundingClientRect(), cs = getComputedStyle(e); return `${r}:${e.dataset.act || 'main'}:${cs.opacity}/${cs.pointerEvents}/${Math.round(b.width)}x${Math.round(b.height)}`; }).join(' '); }
function overlaps() { const rs = Object.values(PAD).map(s => $(s).getBoundingClientRect()); let n = 0; for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { const a = rs[i], b = rs[j]; if (!(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top)) n++; } return n; }
async function gate(name, ms = 8000) { const g = await fps(ms); log(`GATE ${name} avg=${g.avg} worst=${g.worstFrame}`); return g; }

export async function runTour(S) {
  const B = window.PokaBoard22, A = B.api;
  log(`run=${RUN} plan=v22c15 build="${$('#buildTag')?.textContent}" week=${B.week} boot vw=${innerWidth} vh=${innerHeight} dpr=${devicePixelRatio} bake=${A.bakeMs()}ms`);
  await wait(1600);
  const idle = async (ms = 20000) => { const t = performance.now(); while ((B.run || B.busy || B.photoWin || B.pendingSpeedshot) && performance.now() - t < ms) await wait(80); };
  const at = (pos, d, why) => { A.setPos(pos); A.nextDistance(d); log(`ACTION inject start=${pos} nextDistance=${d} (${why})`); };
  const res = () => `snaps=${B.roll.units} treats=${B.treats} coins=${B.coins} ms=${B.ms.points} album=${B.album.slots.filter(s => s.photoId).length}`;
  const nav = [...document.querySelectorAll('.nav [data-nav]')].map(e => e.dataset.nav).join('|');
  log(`layout paw ${pawReport('main')} overlaps=${overlaps()} nav=${nav} treatIcons=${document.querySelectorAll('#treats .tr').length} meter=${rect('#rollChip')} palm=${rect('#snapBtn')} ms=${rect('#ms')} hud=${rect('.hud')}`);
  await snap('d01-board');
  const landTile = async (pos, d, why, onLand) => { at(pos, d, why); click('#snapBtn', `SNAP → ${why}`); await wait(200); while (B.run) await wait(60); await wait(250); log(`land ${why} pos=${B.pos} type=${B.lastLanding?.type} ${res()}`); if (onLand) await onLand(); await idle(); };
  const shoot = async (n, gap, why) => { for (let i = 0; i < n; i++) { click('#snapBtn', `SNAP photo (${why})`, true); await wait(gap); } log(`photos ${why} n=${n} total=${B.photos.length} album=${B.album.slots.filter(s => s.photoId).map(s => s.id).join(',')}`); };

  // V1 — board loop: SNAP → movement → tile → quick animation → reward → continue
  let b = burst('V1board', 40);
  await landTile(39, 2, 'TREAT (stage pass on the way)', async () => { await snap('d02-treat'); });
  await landTile(1, 2, 'STASH (auto-resolves)', null);
  await landTile(2, 2, 'SNAP', async () => { await snap('d03-snaptile'); });
  await landTile(3, 2, 'CARE', null);
  await landTile(0, 2, 'POSE', async () => { await wait(500); await snap('d04-pose'); await shoot(2, 500, 'pose window'); });
  await landTile(5, 2, 'PLAY', async () => { await shoot(1, 300, 'play window'); });
  await landTile(6, 2, 'BUILD', async () => { await wait(900); await snap('d05-build'); });
  await landTile(4, 2, 'LUCKY', async () => { await wait(700); await snap('d06-lucky'); });
  await landTile(7, 2, 'RUSH', null);
  b = await stop(b);

  // V2 — STAGE: pass → Snap reward → centre-stage → Speedshot; then an exact landing (SUPER)
  b = burst('V2stage', 40);
  const ss = async (why) => { for (let i = 0; i < 80 && !(B.photoWin && B.photoWin.kind === 'speedshot'); i++) await wait(80); await wait(800); await snap('d07-' + why); const g = fps(3000); await shoot(4, 650, why); log(`speedshot ${why} ${JSON.stringify(await g)}`); await idle(); };
  await landTile(35, 6, 'STAGE pass → TREAT', () => ss('speedshot-pass'));
  await landTile(35, 5, 'STAGE exact landing', () => ss('speedshot-land'));
  b = await stop(b);

  // V3 — STASH: land → target → dig (real taps on the clue spots) → reward/protection
  b = burst('V3stash', 40);
  A.setTreats(5); log('ACTION inject treats=5 (show Treat overflow next)');
  await landTile(13, 2, 'STASH', async () => {
    await wait(700); await snap('d08-stash');
    for (const k of [0, 4, 8]) { const el = document.querySelector(`#stBed [data-k="${k}"]`); log(`ACTION dig spot ${k} ${el ? 'found' : 'MISSING'}`); el?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 9 })); await wait(550); }
    await snap('d09-stash-done'); log(`stash ${JSON.stringify(B.events.filter(e => e.ev === 'stash').pop())}`);
  });
  await landTile(11, 2, 'TREAT at 5/5 (overflow → Snaps)', async () => { log(`treat-overflow ${JSON.stringify(B.events.filter(e => e.ev === 'treat').pop())}`); });
  b = await stop(b);

  // V4 — Quick Milestone: points fly to the bar, tiers celebrate and pay once
  b = burst('V4milestone', 40);
  log(`ms before ${JSON.stringify(A.ms())}`);
  for (const [p, d, why] of [[23, 2, 'TREAT'], [20, 2, 'STASH'], [17, 2, 'POSE'], [8, 2, 'ALBUM corner'], [18, 2, 'POKA corner'], [28, 2, 'HOME corner']]) await landTile(p, d, why, why === 'POSE' ? () => shoot(2, 500, 'pose') : why === 'ALBUM corner' ? () => shoot(1, 400, 'album window') : null);
  await snap('d10-milestone'); log(`ms after ${JSON.stringify(A.ms())} tiersPaid=${B.events.filter(e => e.ev === 'milestone').length}`);
  b = await stop(b);

  // V6 — paw tour in every game + gates (burst OFF while measuring)
  b = burst('V6paw', 60);
  click('#toeSpeed', 'speed → slow'); await wait(250); click('#toeMult', 'multiplier'); await wait(250); click('#toeView', 'camera angle → F'); await wait(1200); click('#snapBtn', 'SNAP (camera photo)'); await wait(500); await snap('d11-camera'); click('#toeView', 'angle → S'); await wait(500); click('#exitCam', 'back to board'); await wait(900); click('#toeSpeed', 'speed'); click('#toeSpeed', 'speed → normal'); click('#toeThrow', 'THROW (free play)'); await wait(1600);
  click('[data-nav="ALBUM"]', 'ALBUM sheet'); await wait(900); await snap('d12-album'); click('#sheet .shClose', 'close'); await wait(300);
  for (const id of ['race', 'dance', 'flight', 'switch']) { await openGame(id); log(`${id} paw ${pawReport(id)}`); for (const r of ['center', 'left', 'upLeft', 'upRight', 'right']) { click(PAD[r], `${id} ${r}`); await wait(260); } await snap('d13-' + id); await exitGame(); }
  b = await stop(b);
  await idle();
  await gate('idle-board', 5000);
  const loop = async (ms) => { const t = performance.now(); while (performance.now() - t < ms) { if (!B.run && !B.busy && !B.photoWin && !B.pendingSpeedshot) { A.setPos(Math.random() < 0.5 ? 2 : 22); A.nextDistance(2); click('#snapBtn', 'move', true); } await wait(120); } };
  { const g = gate('board-movement+micro-events', 9000); await loop(9000); await g; }
  at(35, 5, 'gate STAGE'); click('#snapBtn', 'SNAP → STAGE', true); for (let i = 0; i < 80 && !(B.photoWin && B.photoWin.kind === 'speedshot'); i++) await wait(80);
  { const g = gate('speedshot', 4500); for (let i = 0; i < 5; i++) { click('#snapBtn', 'speedshot photo', true); await wait(700); } await g; } await idle();
  at(1, 2, 'gate STASH'); click('#snapBtn', 'SNAP → STASH', true); await wait(1500);
  { const g = gate('stash', 4000); for (const k of [1, 3, 5]) { document.querySelector(`#stBed [data-k="${k}"]`)?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 9 })); await wait(700); } await g; } await idle();
  click('#toeView', 'angle → F'); await wait(1500);
  { const g = gate('camera-capture', 4000); for (let i = 0; i < 4; i++) { click('#snapBtn', 'camera photo', true); await wait(800); } await g; }
  click('#exitCam', 'back'); await wait(800);
  log(`inputs ${B.inputs.length} renderErrors=${B.renderErrors || 0} final ${res()}`);
  log('PLAN-DONE v22c15');
}

/* Owner-phone OBSERVE plan: no input of any kind. It records the identity, the root it booted
   into, the visible nav, and a few snapshots over time, so a clean install can be proven without
   touching the owner's account. */
export async function observe(S) {
  const nav = [...document.querySelectorAll('.nav [data-nav]')].map(e => e.dataset.nav).join('|');
  log(`observe run=${RUN} root=board identity="${window.POKASNAP_IDENTITY}" nav=${nav} account=${S.account ? S.account.mode : 'new'} welcome=${!document.getElementById('sheet').hidden} navExact=${nav === 'TREAT|POKA|ALBUM|HOME'}`);
  for (const [ms, name] of [[600, 'o1-first-screen'], [4000, 'o2-settled'], [9000, 'o3-later']]) { await wait(ms); await snap(name); }
  log('OBSERVE-DONE');
}
