/* PokaSnap 2.2 — 2.5D world renderer (Phase C1): perspective camera over a
   ground plane, a dominant 40-space extruded trail, ten illustrated landmarks
   with upgrade stages and ambient life, a Race diorama centre, and depth-
   sorted billboard scenery. Pure canvas 2D; no WebGL needed on the SE.

   Performance model: the world is split into a STATIC layer (sky, ground,
   plinth, tiles, emblems, diorama base) that only changes when the camera
   moves, and a DYNAMIC layer (highlights, racers, scenery, landmarks with
   their ambient life, the Poka, props, birds). While the camera is still the
   static layer is rendered once into an offscreen canvas and blitted.

   World axes: x right, y up, z toward the default camera. 1 unit = 1 space. */
import { BOARD, BOARD_HALF, SPACE_COUNT, CATEGORIES, LANDMARKS, WORLDS, LM_PLACE, PROP_FOOT, TILE_TYPES } from './config.js';
import { spacePos, spaceInfo, outward } from './core.js';
import { shade } from './pudding.js';
import { PAINT, FOOT, FOOT_TIGHT, ANCHOR, LM_W, LM_H, lmAmbient, paint } from './landmarks.js';
import { paintDiorama, DIORAMA_W, DIORAMA_H } from './dioramas.js';

const TAU = Math.PI * 2;
const HALF = BOARD_HALF;
const prof = (k, t0) => { const p = typeof window !== 'undefined' && window.__prof; if (p) p[k] = (p[k] || 0) + performance.now() - t0; };

/* ================================================================ camera == */
export function makeCamera() { return { tx: 0, ty: 0, tz: 0, yaw: 0.6, pitch: 0.92, dist: 19.5, f: 1, cx: 0, cy: 0, W: 1, H: 1 }; }
export function frame(cam, W, H, fit = 1) {
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
  const sz = cam.sz || 1; cam.px = cam.tx + cam.dist * sy * cp; cam.py = cam.ty + cam.dist * sp; cam.pz = cam.tz * sz + cam.dist * cy * cp;   // C1.5: sz = render-only depth stretch (portrait board)
  cam.F = [-sy * cp, -sp, -cy * cp]; cam.R = [cy, 0, -sy];
  const [fx, fy, fz] = cam.F, [rx, ry, rz] = cam.R;
  cam.U = [ry * fz - rz * fy, rz * fx - rx * fz, rx * fy - ry * fx];
  cam.W = W; cam.H = H; cam.f = Math.min(W * 1.55, H * 1.05) * fit; cam.cx = W / 2; cam.cy = H * (cam.cyK ?? 0.47);
}
export function toCam(cam, x, y, z) {
  const dx = x - cam.px, dy = y - cam.py, dz = z * (cam.sz || 1) - cam.pz;
  return [dx * cam.R[0] + dy * cam.R[1] + dz * cam.R[2], dx * cam.U[0] + dy * cam.U[1] + dz * cam.U[2], dx * cam.F[0] + dy * cam.F[1] + dz * cam.F[2]];
}
export function project(cam, x, y, z) {
  const [a, b, c] = toCam(cam, x, y, z);
  if (c < 0.05) return null;
  const k = cam.f / c; return { x: cam.cx + a * k, y: cam.cy - b * k, k, z: c };
}
const NEAR = 0.15;
function projPoly(cam, pts) {
  const cs = pts.map(p => toCam(cam, p[0], p[1], p[2])), out = [];
  for (let i = 0; i < cs.length; i++) {
    const a = cs[i], b = cs[(i + 1) % cs.length];
    if (a[2] >= NEAR) out.push(a);
    if ((a[2] >= NEAR) !== (b[2] >= NEAR)) { const t = (NEAR - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR]); }
  }
  return out.map(c => ({ x: cam.cx + c[0] * cam.f / c[2], y: cam.cy - c[1] * cam.f / c[2] }));
}
function pathPoly(ctx, sp) { ctx.beginPath(); sp.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); }
function poly(ctx, cam, pts, fill, stroke, lw = 1) {
  const sp = projPoly(cam, pts); if (sp.length < 3) return null;
  pathPoly(ctx, sp); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); } return sp;
}
const circlePts = (cx, cz, r, y, n = 40, sx = 1) => Array.from({ length: n }, (_, i) => { const a = i / n * TAU; return [cx + Math.cos(a) * r * sx, y, cz + Math.sin(a) * r]; });

/* =========================================================== sprite cache == */
const sprites = {};
function sprite(name, w, h, paint, lit = true, ay = h) {
  if (sprites[name]) return sprites[name];
  const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2; const x = c.getContext('2d'); x.scale(2, 2); paint(x, w, h);
  if (lit) bakeLight(c, name);
  return (sprites[name] = { c, w, h, ay });
}
/* Baked lighting, done ONCE per sprite: a warm rim on the upper-left edges
   (silhouette minus itself shifted down-right), a cool shade band on the
   lower-right, and a fine speckle texture so surfaces stop reading as flat
   vector fills. Costs nothing per frame. */
function bakeLight(c, seedName) {
  const W = c.width, H = c.height, x = c.getContext('2d');
  const band = (dx, dy, color) => { const m = document.createElement('canvas'); m.width = W; m.height = H; const mx = m.getContext('2d'); mx.drawImage(c, 0, 0); mx.globalCompositeOperation = 'destination-out'; mx.drawImage(c, dx, dy); mx.globalCompositeOperation = 'source-in'; mx.fillStyle = color; mx.fillRect(0, 0, W, H); return m; };
  const rimL = band(4, 4, 'rgba(255,248,220,.55)'), shadeR = band(-5, -5, 'rgba(70,40,60,.22)');
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(shadeR, 0, 0); x.drawImage(rimL, 0, 0);
  x.globalCompositeOperation = 'source-atop';
  x.fillStyle = x.createPattern(noiseTile(), 'repeat'); x.fillRect(0, 0, W, H);
  x.restore();
}
/* One 64x64 speckle tile, generated once and reused as a pattern by every sprite. */
let NOISE = null;
function noiseTile() {
  if (NOISE) return NOISE;
  NOISE = document.createElement('canvas'); NOISE.width = NOISE.height = 64; const x = NOISE.getContext('2d');
  let h = 2166136261; const rnd = () => (h = (h * 1103515245 + 12345) >>> 0) / 4294967296;
  for (let i = 0; i < 90; i++) { x.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,.08)' : 'rgba(60,30,40,.07)'; x.fillRect(rnd() * 64, rnd() * 64, 2, 2); }
  return NOISE;
}
/* Bake every sprite the board needs before the first frame, so the first
   seconds of play never stall on lazy sprite creation. */
export function prebake(scene) {
  const t0 = performance.now();
  for (const k of Object.keys(TILE_TYPES)) SPR['ti_' + k]();
  for (const it of scene.items) { if (it.type === 'landmark') { for (let st = 0; st < 3; st++) SPR['lm_' + it.id](st, it.tight); } else if (it.type === 'tprop') SPR[it.key](); else if (SPR[it.type]) SPR[it.type](it.v ?? it.c); }
  return Math.round(performance.now() - t0);
}
const blobFill = (x, cx, cy, r, c0, c1, c2) => { const g = x.createRadialGradient(cx - r * 0.35, cy - r * 0.45, r * 0.1, cx, cy, r * 1.1); g.addColorStop(0, c0); g.addColorStop(0.6, c1); g.addColorStop(1, c2); return g; };
const vgrad = (x, y0, y1, c0, c1) => { const g = x.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, c0); g.addColorStop(1, c1); return g; };
const rr = (x, px, py, w, h, r, fill, line, lw = 1.5) => { x.beginPath(); x.roundRect(px, py, w, h, r); x.fillStyle = fill; x.fill(); if (line) { x.lineWidth = lw; x.strokeStyle = line; x.stroke(); } };
const flag = (x, px, py, c, dir = 1) => { x.fillStyle = c; x.beginPath(); x.moveTo(px, py); x.lineTo(px + 14 * dir, py + 4); x.lineTo(px, py + 9); x.closePath(); x.fill(); };
const post = (x, px, py, h, c = '#7a5a40') => { x.fillStyle = c; x.fillRect(px - 2, py - h, 4, h); };
const bunting = (x, x0, x1, y, sag = 8) => { for (let i = 0; i < 9; i++) { const u = i / 8, bx = x0 + (x1 - x0) * u, by = y + Math.sin(u * Math.PI) * sag; x.fillStyle = ['#ff6b8b', '#ffd84a', '#4fc3f7', '#2fc2a3'][i % 4]; x.beginPath(); x.moveTo(bx - 5, by); x.lineTo(bx + 5, by); x.lineTo(bx, by + 9); x.closePath(); x.fill(); } x.strokeStyle = '#7a5a40'; x.lineWidth = 1; x.beginPath(); x.moveTo(x0, y); x.quadraticCurveTo((x0 + x1) / 2, y + sag * 2, x1, y); x.stroke(); };
const petal = (x, px, py, r, c) => { x.fillStyle = c; for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; x.beginPath(); x.ellipse(px + Math.cos(a) * r * 0.6, py + Math.sin(a) * r * 0.6, r * 0.5, r * 0.32, a, 0, TAU); x.fill(); } x.fillStyle = '#ffd84a'; x.beginPath(); x.arc(px, py, r * 0.3, 0, TAU); x.fill(); };

/* Tile icons: bold toy-like shapes with a dark outline and a white sticker border,
   painted once per type (owner reference: outlined, dimensional, readable at a glance). */
function tileIcon(x, k) {
  const OL = '#3b2d4f';
  const out = (lw = 3) => { x.lineJoin = 'round'; x.lineCap = 'round'; x.strokeStyle = '#fff'; x.lineWidth = lw + 5; x.stroke(); x.strokeStyle = OL; x.lineWidth = lw; x.stroke(); };
  const fillO = (c, lw) => { x.fillStyle = c; x.fill(); x.save(); out(lw); x.restore(); x.fillStyle = c; x.fill(); };
  x.translate(32, 34);
  switch (k) {
    case 'gift': case 'treat': {
      x.beginPath(); x.roundRect(-18, -6, 36, 24, 4); fillO(vgrad(x, -6, 18, '#ff9fc4', '#ff4f86'), 2.5);
      x.beginPath(); x.roundRect(-21, -14, 42, 10, 3); fillO(vgrad(x, -14, -4, '#ffd1e2', '#ff8ab5'), 2.5);
      x.fillStyle = '#ffd23f'; x.fillRect(-4, -14, 8, 32); x.beginPath(); x.ellipse(-8, -18, 8, 5, -0.5, 0, TAU); x.ellipse(8, -18, 8, 5, 0.5, 0, TAU); fillO('#ffd23f', 2); break; }
    case 'chest': {
      x.beginPath(); x.roundRect(-20, -4, 40, 22, 4); fillO(vgrad(x, -4, 18, '#c47a3a', '#8a4a20'), 2.5);
      x.beginPath(); x.moveTo(-20, -4); x.quadraticCurveTo(0, -24, 20, -4); x.closePath(); fillO(vgrad(x, -18, -4, '#e09a52', '#b2632a'), 2.5);
      x.fillStyle = '#ffd23f'; x.fillRect(-20, -6, 40, 4); x.beginPath(); x.roundRect(-5, -6, 10, 12, 2); fillO('#ffd23f', 2);
      x.fillStyle = '#fff6b0'; for (const [a, b] of [[-14, -16], [14, -15], [0, -22]]) { x.beginPath(); x.arc(a, b, 2.2, 0, TAU); x.fill(); } break; }
    case 'camera': case 'lens': {
      const body = k === 'camera' ? ['#6fc6ff', '#2a8fe0'] : ['#b9c3ff', '#6f7fe8'];
      x.beginPath(); x.roundRect(-21, -12, 42, 28, 7); fillO(vgrad(x, -12, 16, body[0], body[1]), 2.5);
      x.beginPath(); x.roundRect(-9, -18, 16, 8, 3); fillO(body[1], 2);
      x.beginPath(); x.arc(0, 2, 10, 0, TAU); fillO('#2b2350', 2); x.fillStyle = '#9ee4ff'; x.beginPath(); x.arc(0, 2, 6, 0, TAU); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(-2.5, -0.5, 2, 0, TAU); x.fill();
      x.fillStyle = '#ffd23f'; x.beginPath(); x.arc(14, -6, 3, 0, TAU); x.fill(); break; }
    case 'hammer': {
      x.save(); x.rotate(-0.6); x.beginPath(); x.roundRect(-4, -6, 8, 30, 3); fillO(vgrad(x, -6, 24, '#d99a5c', '#9a5a2a'), 2.5);
      x.beginPath(); x.roundRect(-16, -18, 32, 13, 4); fillO(vgrad(x, -18, -5, '#c9d2e6', '#7d88a8'), 2.5); x.restore(); break; }
    case 'clover': {
      for (const a of [0, 1, 2, 3]) { x.save(); x.rotate(a * Math.PI / 2 + Math.PI / 4); x.beginPath(); x.moveTo(0, 0); x.bezierCurveTo(-14, -6, -12, -22, 0, -14); x.bezierCurveTo(12, -22, 14, -6, 0, 0); fillO(vgrad(x, -20, 0, '#8fe07a', '#2fa85a'), 2.5); x.restore(); }
      x.strokeStyle = '#2f7d45'; x.lineWidth = 3.5; x.beginPath(); x.moveTo(0, 2); x.quadraticCurveTo(4, 14, 10, 20); x.stroke(); break; }
    case 'pad': {
      x.beginPath(); x.moveTo(-22, 2); x.bezierCurveTo(-24, -14, -10, -12, 0, -10); x.bezierCurveTo(10, -12, 24, -14, 22, 2); x.bezierCurveTo(22, 16, 12, 18, 8, 8); x.lineTo(-8, 8); x.bezierCurveTo(-12, 18, -22, 16, -22, 2); x.closePath();
      fillO(vgrad(x, -12, 16, '#c9a8ff', '#7a4fe0'), 2.5);
      x.fillStyle = '#fff'; x.fillRect(-15, -3, 10, 3); x.fillRect(-11.5, -6.5, 3, 10); x.beginPath(); x.arc(11, -4, 2.6, 0, TAU); x.arc(15, 0, 2.6, 0, TAU); x.fill(); break; }
    case 'heart': {
      x.beginPath(); x.moveTo(0, 18); x.bezierCurveTo(-30, 0, -16, -26, 0, -10); x.bezierCurveTo(16, -26, 30, 0, 0, 18); fillO(vgrad(x, -20, 18, '#ff8fa0', '#ff3f5f'), 2.5);
      x.fillStyle = 'rgba(255,255,255,.7)'; x.beginPath(); x.ellipse(-9, -7, 4, 6, -0.6, 0, TAU); x.fill(); break; }
    case 'rocket': {
      x.save(); x.rotate(0.75);
      x.beginPath(); x.moveTo(0, -24); x.bezierCurveTo(12, -12, 10, 8, 7, 14); x.lineTo(-7, 14); x.bezierCurveTo(-10, 8, -12, -12, 0, -24); fillO(vgrad(x, -24, 14, '#ffffff', '#d9dff0'), 2.5);
      x.beginPath(); x.moveTo(-7, 4); x.lineTo(-15, 16); x.lineTo(-6, 14); x.closePath(); fillO('#ff4f5f', 2); x.beginPath(); x.moveTo(7, 4); x.lineTo(15, 16); x.lineTo(6, 14); x.closePath(); fillO('#ff4f5f', 2);
      x.beginPath(); x.arc(0, -6, 4.5, 0, TAU); fillO('#6fc6ff', 2); x.fillStyle = '#ffb32b'; x.beginPath(); x.moveTo(-5, 15); x.lineTo(0, 27); x.lineTo(5, 15); x.fill(); x.restore(); break; }
    case 'flag': {   // STAGE: a star on a spotlight stand
      x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r2 = i % 2 ? 10 : 23; x.lineTo(Math.cos(a) * r2, Math.sin(a) * r2 - 2); } x.closePath(); fillO(vgrad(x, -24, 18, '#b48cff', '#7a4fe0'), 2.5);
      x.fillStyle = '#fff6b0'; x.beginPath(); x.arc(-5, -8, 3, 0, TAU); x.fill(); break; }
    case 'album': {
      x.save(); x.rotate(-0.18); x.beginPath(); x.roundRect(-20, -18, 30, 34, 4); fillO(vgrad(x, -18, 16, '#7fd0ff', '#3a8fe0'), 2.5); x.restore();
      x.save(); x.rotate(0.16); x.beginPath(); x.roundRect(-8, -14, 30, 34, 4); fillO('#fff', 2.5); x.fillStyle = '#c39bff'; x.fillRect(-4, -10, 22, 18); x.fillStyle = '#ffd23f'; x.beginPath(); x.arc(12, -5, 3, 0, TAU); x.fill(); x.fillStyle = '#7fe08a'; x.beginPath(); x.moveTo(-4, 8); x.lineTo(5, -2); x.lineTo(18, 8); x.fill(); x.restore(); break; }
    case 'paw': {
      x.beginPath(); x.ellipse(0, 8, 13, 11, 0, 0, TAU); fillO(vgrad(x, -4, 18, '#c9a8ff', '#8a5fe8'), 2.5);
      for (const [a, b] of [[-15, -6], [-6, -16], [6, -16], [15, -6]]) { x.beginPath(); x.ellipse(a, b, 5.5, 7, 0, 0, TAU); fillO('#b48cff', 2); } break; }
    case 'house': {
      x.beginPath(); x.roundRect(-16, -4, 32, 22, 3); fillO(vgrad(x, -4, 18, '#fff3dc', '#f0d6a8'), 2.5);
      x.beginPath(); x.moveTo(-22, -2); x.lineTo(0, -22); x.lineTo(22, -2); x.closePath(); fillO(vgrad(x, -22, -2, '#ff8a6b', '#e0503a'), 2.5);
      x.beginPath(); x.roundRect(-5, 4, 10, 14, 2); fillO('#8a5a3a', 2); x.fillStyle = '#7fd0ff'; x.fillRect(7, 2, 6, 6); break; }
  }
}
const ICON_OF = { stage: 'flag', album: 'album', poka: 'paw', home: 'house', treat: 'gift', stash: 'chest', snap: 'camera', build: 'hammer', lucky: 'clover', pose: 'lens', play: 'pad', care: 'heart', rush: 'rocket' };

const SPR = {
  tree: (v = 0) => sprite('tree' + v, 120, 150, (x) => {
    const hue = ['#5fbf5a', '#7ccf5e', '#4fae6a'][v];
    x.fillStyle = vgrad(x, 80, 150, '#9a6a44', '#6d4a2e'); x.beginPath(); x.moveTo(52, 150); x.quadraticCurveTo(56, 100, 50, 80); x.lineTo(70, 80); x.quadraticCurveTo(64, 100, 68, 150); x.closePath(); x.fill();
    const lobes = [[60, 52, 40], [32, 66, 26], [88, 66, 26], [44, 34, 24], [78, 36, 24], [60, 22, 22]];
    x.fillStyle = shade(hue, -0.4); for (const [a, b, r] of lobes) { x.beginPath(); x.arc(a + 2, b + 5, r + 1, 0, TAU); x.fill(); }
    for (const [a, b, r] of lobes) { x.fillStyle = blobFill(x, a, b, r, shade(hue, 0.4), hue, shade(hue, -0.28)); x.beginPath(); x.arc(a, b, r, 0, TAU); x.fill(); }
    x.fillStyle = 'rgba(255,255,220,.4)'; for (const [a, b] of [[44, 30], [70, 18], [30, 58]]) { x.beginPath(); x.ellipse(a, b, 9, 5, -0.5, 0, TAU); x.fill(); }
    if (v === 1) { x.fillStyle = '#ff9fc4'; for (let i = 0; i < 9; i++) { x.beginPath(); x.arc(28 + (i * 37) % 64, 26 + (i * 23) % 52, 3.2, 0, TAU); x.fill(); } }
    if (v === 2) { x.fillStyle = '#ff6b6b'; for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(32 + (i * 29) % 58, 40 + (i * 17) % 38, 3.6, 0, TAU); x.fill(); } }
  }),
  pine: () => sprite('pine', 90, 160, (x) => {
    x.fillStyle = '#7a4e33'; x.fillRect(40, 130, 10, 30);
    for (let i = 0; i < 4; i++) { const y = 30 + i * 28, wd = 22 + i * 10;
      x.fillStyle = shade('#2f9a6e', -0.35); x.beginPath(); x.moveTo(45, y - 30); x.lineTo(45 + wd + 2, y + 24); x.lineTo(45 - wd - 2, y + 24); x.closePath(); x.fill();
      x.fillStyle = vgrad(x, y - 30, y + 20, '#6fd39b', '#2a8a62'); x.beginPath(); x.moveTo(45, y - 32); x.quadraticCurveTo(52, y, 45 + wd, y + 18); x.quadraticCurveTo(45, y + 24, 45 - wd, y + 18); x.quadraticCurveTo(38, y, 45, y - 32); x.fill(); }
  }),
  bush: (v = 0) => sprite('bush' + v, 80, 50, (x) => {
    const hue = v ? '#58b96a' : '#6cc36a';
    for (const [a, b, r] of [[22, 32, 18], [58, 32, 18], [40, 24, 21]]) { x.fillStyle = blobFill(x, a, b, r, shade(hue, 0.35), hue, shade(hue, -0.3)); x.beginPath(); x.arc(a, b, r, 0, TAU); x.fill(); }
    const fc = ['#ffd84a', '#ff9fc4', '#ffffff'][v % 3]; x.fillStyle = fc; for (let i = 0; i < 7; i++) { x.beginPath(); x.arc(14 + i * 9, 22 + (i % 3) * 7, 2.6, 0, TAU); x.fill(); }
  }),
  lamp: () => sprite('lamp', 40, 130, (x) => {
    x.fillStyle = '#4a5578'; x.fillRect(18, 30, 5, 100); x.fillRect(12, 122, 17, 8);
    x.fillStyle = '#3a4466'; x.beginPath(); x.moveTo(8, 30); x.lineTo(33, 30); x.lineTo(26, 14); x.lineTo(15, 14); x.closePath(); x.fill();
    const g = x.createRadialGradient(20, 26, 1, 20, 26, 20); g.addColorStop(0, 'rgba(255,240,170,1)'); g.addColorStop(1, 'rgba(255,240,170,0)'); x.fillStyle = g; x.beginPath(); x.arc(20, 26, 20, 0, TAU); x.fill();
    x.fillStyle = '#ffe9a0'; x.fillRect(14, 22, 13, 8);
  }),
  bench: () => sprite('bench', 90, 50, (x) => {
    x.fillStyle = '#5b4a6a'; x.fillRect(10, 30, 5, 20); x.fillRect(75, 30, 5, 20);
    x.fillStyle = vgrad(x, 8, 34, '#ffb38a', '#e07a52'); for (let i = 0; i < 3; i++) { x.beginPath(); x.roundRect(4, 6 + i * 9, 82, 7, 3); x.fill(); }
    x.fillStyle = '#d0653f'; x.beginPath(); x.roundRect(2, 32, 86, 6, 3); x.fill();
  }),
  balloon: (c = '#ff6b8b') => sprite('bal' + c, 30, 80, (x) => {
    x.strokeStyle = 'rgba(80,60,90,.6)'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(15, 34); x.quadraticCurveTo(10, 56, 15, 80); x.stroke();
    x.fillStyle = blobFill(x, 15, 18, 14, shade(c, 0.5), c, shade(c, -0.25)); x.beginPath(); x.ellipse(15, 18, 12, 15, 0, 0, TAU); x.fill();
  }),

  /* ---------------- C1.5 tile icons: one illustrated, outlined icon per space type ---------------- */
  ...Object.fromEntries(Object.keys(TILE_TYPES).map(k => ['ti_' + k, () => sprite('ti_' + k, 64, 64, x => tileIcon(x, ICON_OF[k]), false, 64)])),
  /* the ten Puddle Park landmarks (landmarks.js), three stages each, anchored at their island centre */
  ...Object.fromEntries(Object.keys(PAINT).map(id => ['lm_' + id, (st, tight = false) => sprite('lm_' + id + st + (tight ? 't' : ''), LM_W, LM_H, x => paint(x, id, st, tight), true, ANCHOR.y)])),
};

/* ================================================================== scene == */
function lcg(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
export function buildScene(worldId = 'park', stages = {}) {
  const r = lcg(22022), items = [];
  const clear = (x, z) => Math.abs(x) < HALF + 2.8 && Math.abs(z) < HALF + 2.8;
  for (let i = 0; i < 90; i++) {
    const a = r() * TAU, d = 9 + r() * 12;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (clear(x, z)) continue;
    const k = r();
    items.push(k < 0.45 ? { type: 'tree', v: Math.floor(r() * 3), x, z, s: 1.7 + r() * 0.8 } : k < 0.62 ? { type: 'pine', x, z, s: 2.0 + r() * 0.7 } : { type: 'bush', v: Math.floor(r() * 3), x, z, s: 0.9 + r() * 0.4 });
  }
  // C1.2 placement. Corners: the anchor stands on the outer diagonal of its big tile.
  // Near sides (facing the Board camera): a micro-destination on the tile's OUTER half,
  // so the inner square stays free for the weekly event. Far sides: a full destination
  // on its own lot outside the board. Pudding walks the INNER lane (core.trailPoint), and
  // every footprint is proven clear of that lane (tools/tests/v22.mjs).
  const lms = LANDMARKS.map(l => {
    const p = spacePos(l.space), [nx, nz] = outward(l.space);
    // C1.5: every landmark stands on its own lot outside the trail (the tiles carry icon + word)
    const kind = p.corner ? 'corner' : p.side === 0 ? 'near' : 'far', P = LM_PLACE[kind];
    const [dx, dz] = p.corner ? [Math.sign(p.x) * P.off * 0.72, Math.sign(p.z) * P.off * 0.72] : [nx * P.off, nz * P.off];
    return { type: 'landmark', id: l.id, x: p.x + dx, z: p.z + dz, s: P.s, r: FOOT[l.id] * P.s / 100, tight: false, h: LM_H * P.s / 100 * 0.8, stage: stages[l.id] ?? 1, lm: l, kind, onTile: false, corner: false };
  });
  items.push(...lms);
  // C1.5: no loose props on tiles — each tile is a labelled, iconned space (drawTile).
  // Blossom islands inside the trail: a cherry tree, two flower bushes and a lamp each.
  { const c0 = INNER - 0.22 - 1.15;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const cx = sx * c0, cz = sz * c0;
      items.push({ type: 'tree', v: 1, x: cx + sx * 0.25, z: cz + sz * 0.15, s: 1.15, inner: true });
      items.push({ type: 'bush', v: 1, x: cx - sx * 0.45, z: cz + sz * 0.35, s: 0.75, inner: true }, { type: 'bush', v: 2, x: cx + sx * 0.35, z: cz - sz * 0.5, s: 0.7, inner: true });
      items.push({ type: 'lamp', x: cx - sx * 0.55, z: cz - sz * 0.45, s: 0.95, inner: true });
    } }
  // citizens: generic visitors who idle at landmarks (not roster pets)
  const cit = [['cafe', 0.5, '#ffd1a6'], ['cafe', -0.6, '#cfc6f2'], ['fountain', 0.6, '#bfe8d6'], ['garden', -0.5, '#ffc6d6'], ['pond', 0.5, '#fff0b3'], ['lookout', -0.5, '#d9d0c2'], ['gate', 0.6, '#c6e6ff']];
  cit.forEach(([id, turn, c], k) => {
    const L = lms.find(l => l.id === id), a0 = Math.atan2(L.z, L.x) + turn, rr = L.r + 0.22;   // outside the island, away from the board centre
    items.push({ type: 'citizen', x: L.x + Math.cos(a0) * rr, z: L.z + Math.sin(a0) * rr, c, ph: k * 1.37 + 0.4, act: ['wave', 'bob', 'turn', 'hop'][k % 4], r: 0.12 });
  });
  for (const [x, z] of [[-HALF - 0.9, -HALF - 0.9], [HALF + 0.9, -HALF - 0.9], [-HALF - 0.9, HALF + 0.9], [HALF + 0.9, HALF + 0.9]]) items.push({ type: 'lamp', x, z, s: 1.3 });
  items.push({ type: 'bench', x: -2.2, z: HALF + 1.5, s: 1.2 }, { type: 'bench', x: HALF + 1.6, z: 2.2, s: 1.2 });
  for (const [x, z, c] of [[HALF + 1.2, -2.5, '#ff6b8b'], [HALF + 1.5, -2.8, '#ffd84a'], [HALF + 1.0, -3.0, '#4fc3f7']]) items.push({ type: 'balloon', x, z, s: 0.9, c });
  const walkers = Array.from({ length: 6 }, (_, i) => ({ type: 'walker', loop: 10.4 + (i % 2) * 1.5, ph: i * 1.1, sp: 0.05 + i * 0.011, c: ['#ffd1a6', '#cfc6f2', '#bfe8d6', '#ffc6d6', '#d9d0c2', '#fff0b3'][i] }));
  // every solid thing the Poka, the lens and racers must respect
  const solids = items.filter(it => it.r).map(it => ({ type: it.type, id: it.id || it.key, x: it.x, z: it.z, r: it.r, h: it.h || 0.6 }));
  for (const it of items) if (it.type === 'tree' || it.type === 'pine') solids.push({ type: it.type, x: it.x, z: it.z, r: 0.35 * it.s, h: 1.4 * it.s });
  return { id: worldId, world: WORLDS[worldId], items, walkers, landmarks: lms, solids };
}
export function setStage(scene, id, stage) { const l = scene.landmarks.find(x => x.id === id); if (l) l.stage = Math.max(0, Math.min(2, stage)); }

/* =================================================================== draw == */
const cache = { key: '', stable: 0, canvas: null };
function horizonOf(cam) { const hz = project(cam, cam.px - cam.F[0] * 900, 0, cam.pz - cam.F[2] * 900); return hz ? hz.y : -40; }
export function drawWorld(ctx, cam, scene, t, dyn) {
  const horizon = horizonOf(cam);
  const key = `${cam.W}|${cam.H}|${cam.f}|${cam.cy}|${(cam.sz || 1).toFixed(4)}|${cam.px.toFixed(3)}|${cam.py.toFixed(3)}|${cam.pz.toFixed(3)}|${cam.yaw.toFixed(4)}|${cam.pitch.toFixed(4)}`;
  if (key === cache.key) cache.stable++; else { cache.key = key; cache.stable = 0; cache.canvas = null; }
  cam.moving = cache.stable < 1;
  const t0 = performance.now();
  if (cache.canvas) {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(cache.canvas, 0, 0); ctx.restore();
  } else if (cache.stable >= 1 && !dyn.noCache) {
    // the camera has been still for two frames: render the static layer once
    const m = ctx.getTransform(), dpr = m.a || 1;
    const off = document.createElement('canvas'); off.width = Math.round(cam.W * dpr); off.height = Math.round(cam.H * dpr);
    const o = off.getContext('2d'); o.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawStatic(o, cam, scene, horizon); cache.canvas = off;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(off, 0, 0); ctx.restore();
  } else drawStatic(ctx, cam, scene, horizon);
  prof('static', t0);
  drawDynamic(ctx, cam, scene, t, dyn, horizon);
}

/* ---- STATIC: sky, sun, hills, ground, walkway, plinth, lawn, tiles, emblems, diorama base ---- */
function drawStatic(ctx, cam, scene, horizon) {
  const { W, H } = cam, wd = scene.world;
  const sky = ctx.createLinearGradient(0, Math.min(0, horizon - H * 0.6), 0, Math.max(horizon, 1));
  sky.addColorStop(0, wd.sky[0]); sky.addColorStop(0.7, wd.sky[1]); sky.addColorStop(1, wd.sky[2]);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, Math.max(horizon + 2, 0));
  if (horizon > 0) {
    const par = cam.yaw / TAU;
    const sx = W * 0.78, sy = horizon - H * 0.18;
    const sg = ctx.createRadialGradient(sx, sy, 2, sx, sy, H * 0.25); sg.addColorStop(0, 'rgba(255,248,215,.95)'); sg.addColorStop(0.2, 'rgba(255,236,170,.5)'); sg.addColorStop(1, 'rgba(255,236,170,0)');
    ctx.fillStyle = sg; ctx.fillRect(sx - H * 0.25, Math.max(0, sy - H * 0.25), H * 0.5, Math.min(horizon, sy + H * 0.25) - Math.max(0, sy - H * 0.25));
    for (const [k, col, amp, base] of [[0.5, '#a8d8a0', 26, 16], [0.8, '#8cc98a', 18, 4]]) {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, horizon + 2);
      for (let x = 0; x <= W; x += 12) ctx.lineTo(x, horizon - base - amp * (0.5 + 0.5 * Math.sin((x / W) * 5 + par * TAU * k * 3 + k * 7)));
      ctx.lineTo(W, horizon + 2); ctx.closePath(); ctx.fill();
    }
  }
  const G = 48;
  const gp = projPoly(cam, [[-G, 0, -G], [G, 0, -G], [G, 0, G], [-G, 0, G]]);
  if (gp.length > 2) { const gg = ctx.createLinearGradient(0, Math.max(0, horizon), 0, H); gg.addColorStop(0, '#b6dd8f'); gg.addColorStop(0.35, wd.grass[0]); gg.addColorStop(1, wd.grass[1]); pathPoly(ctx, gp); ctx.fillStyle = gg; ctx.fill(); }
  if (!cam.moving) { ctx.save(); pathPoly(ctx, gp); ctx.clip();      // mowing stripes: decorative, skipped while the lens moves
    for (let i = -20; i < 20; i += 2) poly(ctx, cam, [[i, 0.001, -22], [i + 1, 0.001, -22], [i + 1, 0.001, 22], [i, 0.001, 22]], 'rgba(255,255,255,.05)');
    ctx.restore(); }
  poly(ctx, cam, [[-HALF - 2.4, 0.002, -HALF - 2.4], [HALF + 2.4, 0.002, -HALF - 2.4], [HALF + 2.4, 0.002, HALF + 2.4], [-HALF - 2.4, 0.002, HALF + 2.4]], '#f1dfb8');
  for (const [a, b, c, d] of [[-0.5, HALF, 0.5, 22], [-0.5, -22, 0.5, -HALF], [HALF, -0.5, 22, 0.5], [-22, -0.5, -HALF, 0.5]]) poly(ctx, cam, [[a, 0.002, b], [c, 0.002, b], [c, 0.002, d], [a, 0.002, d]], '#ecd7ab');
  ctx.save(); for (const rr2 of [10.4, 11.9]) { const sp = projPoly(cam, circlePts(0, 0, rr2, 0.002, 64)); if (sp.length > 2) { pathPoly(ctx, sp); ctx.strokeStyle = 'rgba(236,215,171,.9)'; ctx.lineWidth = Math.max(2, cam.f / 60); ctx.stroke(); } } ctx.restore();
  const P = HALF + 0.3, ph = PLINTH;
  extrudeRect(ctx, cam, -P, -P, P, P, 0, ph, '#fff4de', '#d9b98a', '#c4a271');
  drawInnerPark(ctx, cam);
  for (const { i, p } of sortedTiles(cam)) drawTile(ctx, cam, i, p, 0, null);
  drawPlazaBase(ctx, cam);
}
const PLINTH = 0.18, TILE_H = 0.15;
function sortedTiles(cam) {
  const tiles = [];
  for (let i = 0; i < SPACE_COUNT; i++) { const p = spacePos(i), c = toCam(cam, p.x, 0, p.z); tiles.push({ i, p, d: c[2] }); }
  return tiles.sort((a, b) => b.d - a.d);
}
function drawTile(ctx, cam, i, p, t, hl) {
  const c0 = project(cam, p.x, PLINTH, p.z);
  if (!c0 || c0.x < -c0.k * 1.4 || c0.x > cam.W + c0.k * 1.4 || c0.y < -c0.k * 1.4 || c0.y > cam.H + c0.k * 1.4) return;   // off screen
  const s = spaceInfo(i), tt = TILE_TYPES[s.type], g = BOARD.gap / 2;
  // footprint: corners are square; side tiles are one unit along the trail and corner-deep across it
  const along = p.dir && p.dir[0] !== 0;
  const hx = (p.corner ? p.w : along ? p.w : p.d) / 2 - g, hz = (p.corner ? p.d : along ? p.d : p.w) / 2 - g;
  const lift = hl === 'land' ? 0.07 + Math.sin(t * 8) * 0.03 : hl === 'next' ? 0.03 : 0;
  const top = PLINTH + TILE_H + (p.corner ? 0.06 : 0) + lift;
  const hue = tt.hue, topCol = hl === 'land' ? shade(hue, 0.42) : shade(hue, p.corner ? 0.22 : 0.3);
  extrudeRect(ctx, cam, p.x - hx, p.z - hz, p.x + hx, p.z + hz, PLINTH, top, topCol, shade(hue, -0.18), shade(hue, -0.38), p.corner ? 0.34 : 0.12, true);
  // C1.5: illustrated icon + one-word label, readable at a glance (owner reference)
  const c = project(cam, p.x, top + 0.002, p.z); if (!c) return;
  const k = c.k, icon = SPR['ti_' + s.type](), isz = k * (p.corner ? 0.95 : 0.6);
  const ly = p.corner ? 0.2 : 0.17;
  ctx.drawImage(icon.c, c.x - isz / 2, c.y - isz * (p.corner ? 0.78 : 0.86), isz, isz);
  const fs = Math.max(6, k * (p.corner ? 0.3 : 0.185));
  ctx.font = `900 ${fs}px system-ui, -apple-system, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  const tx = c.x, ty = c.y + k * ly;
  ctx.lineWidth = fs * 0.32; ctx.strokeStyle = p.corner ? '#7a3f10' : shade(hue, -0.5); ctx.strokeText(tt.label, tx, ty);
  ctx.fillStyle = '#fff'; ctx.fillText(tt.label, tx, ty);
  if (hl === 'land') { ctx.globalAlpha = 0.45 + 0.35 * Math.sin(t * 8); poly(ctx, cam, [[p.x - hx, top + 0.004, p.z - hz], [p.x + hx, top + 0.004, p.z - hz], [p.x + hx, top + 0.004, p.z + hz], [p.x - hx, top + 0.004, p.z + hz]], null, '#fff6b0', Math.max(2, k * 0.06)); ctx.globalAlpha = 1; }
}

/* ---- DYNAMIC: clouds, highlighted tiles, diorama life, billboards, birds ---- */
function drawDynamic(ctx, cam, scene, t, dyn, horizon) {
  const { W, H } = cam;
  let t0 = performance.now();
  if (horizon > 0) {
    const par = cam.yaw / TAU;
    for (let i = 0; i < 6; i++) {
      const cx = ((i * 0.21 + t * 0.006 - par * 0.9) % 1 + 1) % 1 * (W + 240) - 120, cy = horizon - 30 - (i % 3) * H * 0.05 - 12;
      ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.beginPath(); for (const [ox, oy, rr2] of [[0, 0, 22], [24, -8, 26], [52, 0, 20], [26, 6, 22]]) ctx.ellipse(cx + ox, cy + oy, rr2, rr2 * 0.7, 0, 0, TAU); ctx.fill();
    }
  }
  // highlighted tiles are redrawn over the static layer (a handful per frame)
  if (dyn.highlight) { const hl = dyn.highlight; for (const { i, p } of sortedTiles(cam)) if (hl[i]) drawTile(ctx, cam, i, p, t, hl[i]); }
  prof('tiles-hl', t0); t0 = performance.now();
  drawPlazaLife(ctx, cam, t, dyn);
  prof('diorama', t0); t0 = performance.now();
  const bb = [];
  for (const it of scene.items) bb.push({ it, d: toCam(cam, it.x, 0, it.z)[2] });
  for (const w of scene.walkers) { const a = w.ph + t * w.sp; const it = { type: 'walker', x: Math.cos(a) * w.loop, z: Math.sin(a) * w.loop, c: w.c, a }; bb.push({ it, d: toCam(cam, it.x, 0, it.z)[2] }); }
  for (const e of dyn.extras || []) bb.push({ it: e, d: toCam(cam, e.x, e.y || 0, e.z)[2] - (e.bias || 0) });
  bb.sort((a, b) => b.d - a.d);
  for (const { it, d } of bb) drawBillboard(ctx, cam, it, t, PLINTH, d, dyn);
  prof('billboards', t0); t0 = performance.now();
  if (horizon > 30) for (let i = 0; i < 4; i++) {
    const bx = ((t * 0.03 + i * 0.27) % 1) * (W + 80) - 40, by = horizon - H * 0.12 - i * 9 + Math.sin(t * 2 + i) * 6, fl = Math.sin(t * 9 + i * 2) * 4;
    ctx.strokeStyle = 'rgba(70,70,100,.55)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(bx - 6, by - fl); ctx.quadraticCurveTo(bx - 2, by - 2, bx, by); ctx.quadraticCurveTo(bx + 2, by - 2, bx + 6, by - fl); ctx.stroke();
  }
}

function tileTop(hue, hl, isLm) { if (hl === 'range') return shade(hue, 0.5); if (hl === 'land') return shade(hue, 0.3); return isLm ? shade(hue, 0.45) : shade(hue, 0.72); }

/* Extruded axis-aligned slab with lit side faces, chamfered top and a soft
   ground shadow so tiles sit on the plinth instead of floating. */
function extrudeRect(ctx, cam, x0, z0, x1, z1, y0, y1, topCol, sideA, sideB, ch = 0, bold = false) {
  const sides = [
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], sideA],
    [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], sideA],
    [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], sideB],
    [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], sideB],
  ];
  poly(ctx, cam, [[x0 + 0.04, y0 + 0.001, z0 + 0.06], [x1 + 0.08, y0 + 0.001, z0 + 0.06], [x1 + 0.08, y0 + 0.001, z1 + 0.1], [x0 + 0.04, y0 + 0.001, z1 + 0.1]], 'rgba(60,40,20,.16)');
  for (const [a, b, c, d, n, col] of sides) {
    const mx = (a[0] + c[0]) / 2, mz = (a[2] + c[2]) / 2;
    if ((cam.px - mx) * n[0] + (cam.pz - mz) * n[2] <= 0) continue;
    poly(ctx, cam, [a, b, c, d], col);
  }
  const k = ch;
  const topPts = k ? [[x0 + k, y1, z0], [x1 - k, y1, z0], [x1, y1, z0 + k], [x1, y1, z1 - k], [x1 - k, y1, z1], [x0 + k, y1, z1], [x0, y1, z1 - k], [x0, y1, z0 + k]] : [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
  const sp = projPoly(cam, topPts); if (sp.length < 3) return;
  pathPoly(ctx, sp);
  let yMin = Infinity, yMax = -Infinity; for (const p of sp) { if (p.y < yMin) yMin = p.y; if (p.y > yMax) yMax = p.y; }
  const g = ctx.createLinearGradient(0, yMin, 0, yMax);
  g.addColorStop(0, shade(topCol, 0.3)); g.addColorStop(1, topCol); ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = bold ? 2 : 1.2; ctx.strokeStyle = bold ? '#fff' : 'rgba(255,255,255,.8)'; ctx.stroke();
  const inset = projPoly(cam, [[x0 + 0.1, y1 + 0.001, z0 + 0.1], [x1 - 0.1, y1 + 0.001, z0 + 0.1], [x1 - 0.1, y1 + 0.001, z1 - 0.1], [x0 + 0.1, y1 + 0.001, z1 - 0.1]]);
  if (inset.length > 2) { pathPoly(ctx, inset); ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1; ctx.stroke(); }
}

/* Emblem gradients are reused per hue and radius (they are drawn in a translated space). */
const EMB = new Map();
function embGradient(ctx, hue, r) {
  const k = hue + '|' + r; let g = EMB.get(k);
  if (!g) { g = ctx.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.1, 0, 0, r); g.addColorStop(0, shade(hue, 0.45)); g.addColorStop(1, hue); if (EMB.size > 400) EMB.clear(); EMB.set(k, g); }
  return g;
}
function emblem(ctx, cam, x, y, z, kind, t, hl, isLm) {
  const c = project(cam, x, y, z); if (!c) return;
  const r = Math.round(c.k * (isLm ? 0.3 : 0.26) * 2) / 2, squash = Math.max(0.25, Math.abs(Math.sin(cam.pitch)));
  if (r < 1.5) return;
  ctx.save(); ctx.translate(c.x, c.y); ctx.scale(1, squash);
  ctx.beginPath(); ctx.arc(0, r * 0.14, r, 0, TAU); ctx.fillStyle = shade(kind.hue, -0.38); ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = embGradient(ctx, kind.hue, r); ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.1); ctx.strokeStyle = '#fff'; ctx.stroke();
  glyph(ctx, kind.glyph, r * 0.62, t);
  if (hl === 'range') { ctx.lineWidth = r * 0.14; ctx.setLineDash([r * 0.35, r * 0.25]); ctx.lineDashOffset = -t * r; ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.beginPath(); ctx.arc(0, 0, r * 1.32, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
  if (hl === 'land') { ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 8); ctx.lineWidth = r * 0.16; ctx.strokeStyle = '#fff6b0'; ctx.beginPath(); ctx.arc(0, 0, r * 1.35, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
  ctx.restore();
}
export function glyph(ctx, g, s, t = 0) {
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = s * 0.18; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
  switch (g) {
    case 'crown': ctx.moveTo(-s * 0.9, s * 0.6); ctx.lineTo(-s * 0.9, -s * 0.3); ctx.lineTo(-s * 0.45, s * 0.1); ctx.lineTo(0, -s * 0.8); ctx.lineTo(s * 0.45, s * 0.1); ctx.lineTo(s * 0.9, -s * 0.3); ctx.lineTo(s * 0.9, s * 0.6); ctx.closePath(); ctx.fill(); break;
    case 'ball': ctx.arc(0, 0, s * 0.85, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.85, s * 0.3, 0, 0, TAU); ctx.fill(); break;
    case 'coin': ctx.arc(0, 0, s * 0.85, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.arc(0, 0, s * 0.5, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, s * 0.28, 0, TAU); ctx.fill(); break;
    case 'question': ctx.lineWidth = s * 0.26; ctx.moveTo(-s * 0.45, -s * 0.3); ctx.quadraticCurveTo(0, -s * 1.1, s * 0.45, -s * 0.3); ctx.quadraticCurveTo(s * 0.4, s * 0.1, 0, s * 0.2); ctx.lineTo(0, s * 0.45); ctx.stroke(); ctx.beginPath(); ctx.arc(0, s * 0.8, s * 0.16, 0, TAU); ctx.fill(); break;
    case 'heart': ctx.moveTo(0, s * 0.8); ctx.bezierCurveTo(-s * 1.2, -s * 0.1, -s * 0.5, -s * 1.0, 0, -s * 0.35); ctx.bezierCurveTo(s * 0.5, -s * 1.0, s * 1.2, -s * 0.1, 0, s * 0.8); ctx.fill(); break;
    case 'paw': ctx.ellipse(0, s * 0.3, s * 0.45, s * 0.38, 0, 0, TAU); for (const [px, py] of [[-0.55, -0.25], [-0.2, -0.65], [0.2, -0.65], [0.55, -0.25]]) { ctx.moveTo(px * s + s * 0.18, py * s); ctx.arc(px * s, py * s, s * 0.18, 0, TAU); } ctx.fill(); break;
    case 'ticket': ctx.roundRect(-s * 0.85, -s * 0.5, s * 1.7, s, s * 0.2); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.arc(-s * 0.85, 0, s * 0.22, 0, TAU); ctx.arc(s * 0.85, 0, s * 0.22, 0, TAU); ctx.fill(); break;
    case 'lens': ctx.roundRect(-s * 0.85, -s * 0.5, s * 1.7, s * 1.15, s * 0.25); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(0, s * 0.08, s * 0.36, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(-s * 0.35, -s * 0.72, s * 0.7, s * 0.3, s * 0.1); ctx.fill(); break;
  }
}

/* ============================================ C1.5 inner park + Stage == */
/* Inside the trail: canals, four blossom islands, four bridges and the round
   centre plaza whose raised platform is the STAGE (Speedshot happens here). */
export const INNER = HALF - BOARD.corner - 0.05, PLAZA_R = 2.05, STAGE_R = 0.95;
const WATER = ['#7fd8f6', '#3fb3e6'];
function drawInnerPark(ctx, cam) {
  const I = INNER, y = PLINTH + 0.001;
  // grass bank, then the canal water
  poly(ctx, cam, [[-I, y, -I], [I, y, -I], [I, y, I], [-I, y, I]], '#9fd67a');
  const wI = I - 0.22;
  const wp = poly(ctx, cam, [[-wI, y + 0.001, -wI], [wI, y + 0.001, -wI], [wI, y + 0.001, wI], [-wI, y + 0.001, wI]], WATER[1]);
  if (wp) { let y0 = Infinity, y1 = -Infinity; for (const q of wp) { y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); } const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, WATER[0]); g.addColorStop(1, WATER[1]); pathPoly(ctx, wp); ctx.fillStyle = g; ctx.fill(); }
  // four lawn islands in the inner corners (rounded), each with a flower border
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const cx = sx * (wI - 1.15), cz = sz * (wI - 1.15);
    poly(ctx, cam, circlePts(cx, cz, 1.25, y + 0.002, 28), '#e9d3a6');
    poly(ctx, cam, circlePts(cx, cz, 1.12, y + 0.003, 28), '#a3d97c', '#ffffff', 1);
  }
  // four bridges plaza -> trail
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const w = 0.38, a = PLAZA_R - 0.1, b = I;
    const pts = dx ? [[dx * a, y + 0.01, -w], [dx * b, y + 0.01, -w], [dx * b, y + 0.01, w], [dx * a, y + 0.01, w]] : [[-w, y + 0.01, dz * a], [w, y + 0.01, dz * a], [w, y + 0.01, dz * b], [-w, y + 0.01, dz * b]];
    poly(ctx, cam, pts, '#f3dfb6', '#c9a46a', 1.2);
    for (const side of [-1, 1]) { const rail = dx ? [[dx * a, y + 0.06, side * w], [dx * b, y + 0.06, side * w]] : [[side * w, y + 0.06, dz * a], [side * w, y + 0.06, dz * b]]; const r1 = project(cam, ...rail[0]), r2 = project(cam, ...rail[1]); if (r1 && r2) { ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1.5, r1.k * 0.035); ctx.beginPath(); ctx.moveTo(r1.x, r1.y); ctx.lineTo(r2.x, r2.y); ctx.stroke(); } }
  }
}
function drawPlazaBase(ctx, cam) {
  const y0 = PLINTH, y1 = PLINTH + 0.08;
  poly(ctx, cam, circlePts(0.06, 0.08, PLAZA_R + 0.1, y0 + 0.004, 48), 'rgba(40,70,90,.25)');
  // the plaza rim (lit facets) and paving
  const n = 48, R = PLAZA_R;
  for (let i = 0; i < n; i++) { const a0 = i / n * TAU, a1 = (i + 1) / n * TAU, am = (a0 + a1) / 2, nx = Math.cos(am), nz = Math.sin(am); if ((cam.px - nx * R) * nx + (cam.pz - nz * R) * nz <= 0) continue; poly(ctx, cam, [[Math.cos(a0) * R, y0, Math.sin(a0) * R], [Math.cos(a1) * R, y0, Math.sin(a1) * R], [Math.cos(a1) * R, y1, Math.sin(a1) * R], [Math.cos(a0) * R, y1, Math.sin(a0) * R]], '#d8b98a'); }
  const top = poly(ctx, cam, circlePts(0, 0, R, y1, 56), '#f6e6c8', '#ffffff', 2);
  for (const r of [1.65, 1.25]) poly(ctx, cam, circlePts(0, 0, r, y1 + 0.001, 48), null, 'rgba(201,164,106,.55)', 1.2);
  // flower ring and pink rosette tiles
  for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, q = project(cam, Math.cos(a) * 1.85, y1 + 0.002, Math.sin(a) * 1.85); if (!q) continue; ctx.fillStyle = ['#ff9fc4', '#ffffff', '#ffd23f', '#c39bff'][i % 4]; ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(1.5, q.k * 0.07), 0, TAU); ctx.fill(); }
  // the STAGE platform: a raised round stage with a lit edge
  const sy0 = y1, sy1 = y1 + 0.16, SR = STAGE_R;
  for (let i = 0; i < 40; i++) { const a0 = i / 40 * TAU, a1 = (i + 1) / 40 * TAU, am = (a0 + a1) / 2, nx = Math.cos(am), nz = Math.sin(am); if ((cam.px - nx * SR) * nx + (cam.pz - nz * SR) * nz <= 0) continue; poly(ctx, cam, [[Math.cos(a0) * SR, sy0, Math.sin(a0) * SR], [Math.cos(a1) * SR, sy0, Math.sin(a1) * SR], [Math.cos(a1) * SR, sy1, Math.sin(a1) * SR], [Math.cos(a0) * SR, sy1, Math.sin(a0) * SR]], i % 2 ? '#8f6cf0' : '#7a56e0'); }
  poly(ctx, cam, circlePts(0, 0, SR, sy1, 40), '#ffe9f2', '#ffffff', 2);
  poly(ctx, cam, circlePts(0, 0, SR * 0.72, sy1 + 0.001, 40), '#ffc9de');
  const c = project(cam, 0, sy1 + 0.002, 0); if (c) { ctx.save(); ctx.translate(c.x, c.y); ctx.scale(1, Math.max(0.3, Math.sin(cam.pitch))); glyph(ctx, 'paw', c.k * 0.32); ctx.restore(); }
}
/* Plaza life: fountains, the Stage arch with spotlights (bright while a Speedshot runs), ducks on the canal. */
function drawPlazaLife(ctx, cam, t, dyn) {
  const y1 = PLINTH + 0.08, glow = dyn.stage || 0;
  { const c = project(cam, 0, y1, 0), e = c && c.k * PLAZA_R * 1.6; if (!c || c.x + e < 0 || c.x - e > cam.W || c.y + e < -e || c.y - e > cam.H) return; }
  const items = [];
  for (const sx of [-1, 1]) items.push({ kind: 'fountain', x: sx * 1.5, z: 0.35 });
  items.push({ kind: 'arch', x: 0, z: -0.82 });
  for (const sx of [-1, 1]) items.push({ kind: 'spot', x: sx * 1.05, z: -0.55, sx });
  for (let i = 0; i < 3; i++) { const a = t * 0.12 + i * 2.1, r = INNER - 0.55; items.push({ kind: 'duck', x: Math.cos(a) * r * (i % 2 ? 1 : 0.92), z: Math.sin(a) * r, a, i }); }
  items.sort((p, q) => toCam(cam, q.x, 0, q.z)[2] - toCam(cam, p.x, 0, p.z)[2]);
  for (const it of items) {
    const p = project(cam, it.x, it.kind === 'duck' ? PLINTH : y1, it.z); if (!p) continue; const u = p.k / 100;
    ctx.save(); ctx.translate(p.x, p.y);
    if (it.kind === 'fountain') {
      ctx.fillStyle = '#e8d2a6'; ctx.beginPath(); ctx.ellipse(0, 0, 26 * u, 9 * u, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#7fd8f6'; ctx.beginPath(); ctx.ellipse(0, -2 * u, 21 * u, 6.5 * u, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#f3e2c4'; ctx.fillRect(-3 * u, -22 * u, 6 * u, 20 * u);
      for (let j = 0; j < 7; j++) { const k = ((t * 1.4 + j / 7) % 1), ang = (j / 7 - 0.5) * 1.4; ctx.fillStyle = `rgba(220,245,255,${0.9 - k * 0.7})`; ctx.beginPath(); ctx.arc(Math.sin(ang) * 18 * u * k, -22 * u - Math.sin(k * Math.PI) * 16 * u + k * 18 * u, (2.4 - k) * u, 0, TAU); ctx.fill(); }
    } else if (it.kind === 'arch') {
      const lw = 7 * u; ctx.lineCap = 'round';
      ctx.strokeStyle = '#fff'; ctx.lineWidth = lw + 4 * u; ctx.beginPath(); ctx.moveTo(-58 * u, 0); ctx.lineTo(-58 * u, -70 * u); ctx.quadraticCurveTo(0, -112 * u, 58 * u, -70 * u); ctx.lineTo(58 * u, 0); ctx.stroke();
      ctx.strokeStyle = '#ff6b8b'; ctx.lineWidth = lw; ctx.stroke();
      for (let j = 0; j < 9; j++) { const u2 = j / 8, bx = -58 * u + 116 * u * u2, by = -70 * u - Math.sin(u2 * Math.PI) * 26 * u; ctx.fillStyle = (Math.floor(t * 4) + j) % 2 ? '#fff6b0' : '#ffd23f'; ctx.beginPath(); ctx.arc(bx, by, 3 * u * (1 + glow * 0.6), 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#7a4fe0'; ctx.beginPath(); ctx.roundRect(-34 * u, -108 * u, 68 * u, 22 * u, 8 * u); ctx.fill(); ctx.lineWidth = 2.5 * u; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `900 ${13 * u}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('STAGE', 0, -96.5 * u);
    } else if (it.kind === 'spot') {
      ctx.fillStyle = '#4a5578'; ctx.fillRect(-2 * u, -40 * u, 4 * u, 40 * u); ctx.fillStyle = '#2b2350'; ctx.beginPath(); ctx.roundRect(-8 * u, -50 * u, 16 * u, 12 * u, 4 * u); ctx.fill();
      if (glow > 0) { const g = ctx.createLinearGradient(0, -44 * u, -it.sx * 70 * u, 30 * u); g.addColorStop(0, `rgba(255,246,176,${0.65 * glow})`); g.addColorStop(1, 'rgba(255,246,176,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-5 * u, -44 * u); ctx.lineTo(5 * u, -44 * u); ctx.lineTo(-it.sx * 110 * u + 40 * u, 40 * u); ctx.lineTo(-it.sx * 110 * u - 40 * u, 40 * u); ctx.closePath(); ctx.fill(); }
    } else if (it.kind === 'duck') {
      const bob = Math.sin(t * 3 + it.i) * 1.5 * u, d = Math.cos(it.a) > 0 ? -1 : 1;
      ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.ellipse(0, 2 * u, 14 * u, 4 * u, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.ellipse(0, -5 * u + bob, 10 * u, 7 * u, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(7 * u * d, -13 * u + bob, 5.5 * u, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ff8a3c'; ctx.beginPath(); ctx.moveTo(11 * u * d, -13 * u + bob); ctx.lineTo(17 * u * d, -12 * u + bob); ctx.lineTo(11 * u * d, -10 * u + bob); ctx.fill(); ctx.fillStyle = '#2b2350'; ctx.beginPath(); ctx.arc(8.5 * u * d, -14.5 * u + bob, 1.2 * u, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}

/* The centre diorama: this week's Poka Race as a miniature course. The plaza,
   track, lanes and checker strip are static; the racers, crowd, flags, gate,
   hurdles, podium and progress ring are drawn every frame. */
const DIO = { R: 3.45, h: 0.24, ex: 1.25, k: 1.45 };
function drawDioramaBase(ctx, cam, week = 'race') {
  const { R, h, ex } = DIO, y0 = PLINTH, y1 = PLINTH + h;
  { const c = project(cam, 0, y1, 0.1), e = c && c.k * R * 1.4; if (c && (c.x + e < 0 || c.x - e > cam.W || c.y + e < 0 || c.y - e > cam.H)) return; }
  poly(ctx, cam, circlePts(0.1, 0.12, R + 0.12, y0 + 0.002, 48), 'rgba(60,90,40,.28)');
  const n = 48;
  for (let i = 0; i < n; i++) {
    const a0 = i / n * TAU, a1 = (i + 1) / n * TAU, am = (a0 + a1) / 2, nx = Math.cos(am), nz = Math.sin(am);
    if ((cam.px - nx * R) * nx + (cam.pz - nz * R) * nz <= 0) continue;
    const lit = 0.5 + 0.5 * (-nx * 0.6 + nz * 0.8);
    poly(ctx, cam, [[Math.cos(a0) * R, y0, Math.sin(a0) * R], [Math.cos(a1) * R, y0, Math.sin(a1) * R], [Math.cos(a1) * R, y1, Math.sin(a1) * R], [Math.cos(a0) * R, y1, Math.sin(a0) * R]], shade('#7b6cd9', -0.25 + lit * 0.3));
  }
  const top = poly(ctx, cam, circlePts(0, 0, R, y1, 56), '#a9d884');
  const c = top && project(cam, 0, y1, 0);          // the centre can sit behind the near plane while the plaza is still partly visible
  if (c) { const g = ctx.createRadialGradient(c.x, c.y, 2, c.x, c.y, c.k * R * 1.1); g.addColorStop(0, 'rgba(255,255,255,.3)'); g.addColorStop(1, 'rgba(255,255,255,0)'); pathPoly(ctx, top); ctx.fillStyle = g; ctx.fill();
 ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke(); }
  if (week !== 'race') return;   // Dance / Flight / Switch weeks dress the plaza with their own diorama (drawDioramaLife)
  const K = DIO.k;
  poly(ctx, cam, circlePts(0, 0.1, 1.72 * K, y1 + 0.002, 64, ex), '#e9c995');
  poly(ctx, cam, circlePts(0, 0.1, 1.65 * K, y1 + 0.0025, 64, ex), '#f1dfb8');
  poly(ctx, cam, circlePts(0, 0.1, 0.78 * K, y1 + 0.003, 48, ex), '#a9d884');
  // infield flower bed + painted PokaSnap paw in the centre
  poly(ctx, cam, circlePts(0, 0.1, 0.55 * K, y1 + 0.0035, 40, ex), '#8fcf6c');
  for (let l = 0; l < 4; l++) { const sp = projPoly(cam, circlePts(0, 0.1, (1.0 + l * 0.2) * K, y1 + 0.004, 64, ex)); if (sp.length > 2) { pathPoly(ctx, sp); ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]); } }
  for (let i = 0; i < 7; i++) for (let j = 0; j < 2; j++) { const z0 = 0.1 + 0.78 * K + i * 0.13 * K; poly(ctx, cam, [[j * 0.13, y1 + 0.005, z0], [0.13 + j * 0.13, y1 + 0.005, z0], [0.13 + j * 0.13, y1 + 0.005, z0 + 0.13 * K], [j * 0.13, y1 + 0.005, z0 + 0.13 * K]], (i + j) % 2 ? '#2b2350' : '#fff'); }
  // two grandstands behind the back straight
  for (const side of [-1, 1]) for (let row = 0; row < 3; row++) { const a0 = -Math.PI / 2 + side * 0.28, a1 = -Math.PI / 2 + side * 0.95, rr2 = 1.85 * K + row * 0.18; const pts = []; for (let k = 0; k <= 8; k++) { const a = a0 + (a1 - a0) * k / 8; pts.push([Math.cos(a) * rr2 * ex, y1 + 0.06 + row * 0.12, 0.1 + Math.sin(a) * rr2]); } for (let k = 8; k >= 0; k--) { const a = a0 + (a1 - a0) * k / 8; pts.push([Math.cos(a) * (rr2 + 0.16) * ex, y1 + 0.06 + row * 0.12, 0.1 + Math.sin(a) * (rr2 + 0.16)]); } poly(ctx, cam, pts, ['#8f7fe8', '#b7a9ff', '#d8cffd'][row]); }
}
function drawDioramaLife(ctx, cam, t, dyn) {
  const { R, h, ex } = DIO, y1 = PLINTH + h;
  { const c = project(cam, 0, y1, 0.1), e = c && c.k * R * 1.4; if (!c || c.x + e < 0 || c.x - e > cam.W || c.y + e < 0 || c.y - e > cam.H) return; }
  if (dyn.week && dyn.week !== 'race') return weekDiorama(ctx, cam, t, dyn.week, y1);
  const props = [];
  props.push({ x: 0.12, z: 0.1 + 1.36 * DIO.k, y: y1, kind: 'gate' });
  const K = DIO.k; props.push({ x: 0.12, z: 0.1 + 1.38 * K, y: y1, kind: 'gate' }); props.pop();
  for (const a of [0.9, 2.3, 3.9, 5.2, 1.6, 4.6]) props.push({ x: Math.cos(a) * 1.3 * K * ex, z: 0.1 + Math.sin(a) * 1.3 * K, y: y1, kind: 'hurdle', a });
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + 0.2; props.push({ x: Math.cos(a) * (R - 0.18), z: Math.sin(a) * (R - 0.18), y: y1, kind: 'flag', c: ['#ff6b8b', '#ffd84a', '#4fc3f7', '#2fc2a3'][i % 4] }); }
  props.push({ x: 0, z: 0.1, y: y1, kind: 'podium' });
  for (const sd of [-1, 1]) props.push({ x: sd * 1.25 * DIO.k * 1.25, z: -0.9 * DIO.k, y: y1, kind: 'banner', sd });
  for (let i = 0; i < 14; i++) { const sd = i < 7 ? -1 : 1, a = -Math.PI / 2 + sd * (0.32 + (i % 7) * 0.09), rr3 = 1.92 * K + (i % 3) * 0.18; props.push({ x: Math.cos(a) * rr3 * ex, z: 0.1 + Math.sin(a) * rr3, y: y1 + 0.1 + (i % 3) * 0.12, kind: 'crowd', c: ['#ffd1a6', '#cfc6f2', '#bfe8d6', '#ffc6d6', '#d9d0c2', '#fff0b3', '#c6e6ff'][i % 7], i }); }
  const lanes = ['#ffd84a', '#ff8a6b', '#4fc3f7', '#2fc2a3'];
  for (let i = 0; i < 4; i++) { const a = -t * (0.42 + i * 0.05) - i * 0.5 + 1.57, rr2 = (1.0 + i * 0.2) * K; const hop = Math.abs(Math.sin(a * 4)) * 0.12; props.push({ x: Math.cos(a) * rr2 * ex, z: 0.1 + Math.sin(a) * rr2, y: y1 + hop, kind: 'racer', c: lanes[i], i, a }); }
  props.sort((p, q) => toCam(cam, q.x, 0, q.z)[2] - toCam(cam, p.x, 0, p.z)[2]);
  for (const p of props) drawProp(ctx, cam, p, t);
  const prog = dyn.raceProgress ?? 0.42;
  for (let i = 0; i < 48; i++) { const a = i / 48 * TAU - Math.PI / 2; const p = project(cam, Math.cos(a) * (R - 0.08), y1 + 0.01, Math.sin(a) * (R - 0.08)); if (!p || p.x < -20 || p.x > cam.W + 20 || p.y < -20 || p.y > cam.H + 20) continue; ctx.fillStyle = i / 48 < prog ? '#ffd84a' : 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, p.k * 0.035), 0, TAU); ctx.fill(); }
}
/* the active week's centre: its diorama stands on the plaza, with a little life */
function weekDiorama(ctx, cam, t, week, y1) {
  const spr = sprite('dio_' + week, DIORAMA_W, DIORAMA_H, x => paintDiorama(x, week), true, 232);
  const p = project(cam, 0, y1, 0.15); if (!p) return;
  const unit = p.k * 2.25 / 100, w = spr.w * unit, hh = spr.h * unit;
  const bob = week === 'dance' ? Math.abs(Math.sin(t * 7.4)) * 3 * unit : week === 'flight' ? Math.sin(t * 1.6) * 4 * unit : 0;
  ctx.drawImage(spr.c, p.x - w / 2, p.y - spr.ay * unit - bob, w, hh);
  if (week === 'dance') for (let i = 0; i < 4; i++) { ctx.fillStyle = ['rgba(255,107,139,.35)', 'rgba(79,195,247,.35)', 'rgba(47,208,138,.35)', 'rgba(255,194,61,.35)'][i]; ctx.beginPath(); ctx.moveTo(p.x + (i - 1.5) * 40 * unit, p.y - 230 * unit); ctx.lineTo(p.x + (i - 1.5) * 60 * unit - 30 * unit, p.y - 20 * unit + Math.sin(t * 3 + i) * 10 * unit); ctx.lineTo(p.x + (i - 1.5) * 60 * unit + 30 * unit, p.y - 20 * unit + Math.sin(t * 3 + i) * 10 * unit); ctx.fill(); }
  if (week === 'switch') { const k = (t * 0.4) % 1; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(p.x, p.y - (20 + k * 140) * unit, (14 - k * 8) * unit, (18 - k * 10) * unit, 0, 0, TAU); ctx.fill(); }
}
function drawProp(ctx, cam, p, t) {
  const s = project(cam, p.x, p.y, p.z); if (!s) return;
  const u = s.k / 100 * (p.kind === 'racer' || p.kind === 'gate' || p.kind === 'podium' ? 1.5 : 1.25);
  if (s.x < -90 * u || s.x > cam.W + 90 * u || s.y < -10 || s.y > cam.H + 90 * u) return;   // off screen
  ctx.save(); ctx.translate(s.x, s.y);
  switch (p.kind) {
    case 'gate': {
      ctx.fillStyle = 'rgba(40,30,60,.25)'; ctx.beginPath(); ctx.ellipse(0, 0, 40 * u, 8 * u, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#5b4a6a'; ctx.fillRect(-36 * u, -60 * u, 5 * u, 60 * u); ctx.fillRect(31 * u, -60 * u, 5 * u, 60 * u);
      const gr = ctx.createLinearGradient(0, -74 * u, 0, -56 * u); gr.addColorStop(0, '#ff9a5c'); gr.addColorStop(1, '#ff5f7e'); ctx.fillStyle = gr; ctx.beginPath(); ctx.roundRect(-42 * u, -76 * u, 84 * u, 20 * u, 8 * u); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff3d6'; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `italic 900 ${11 * u}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('POKA RACE', 0, -66 * u);
      for (let i = 0; i < 7; i++) { ctx.fillStyle = ['#ffd84a', '#4fc3f7', '#2fc2a3', '#c49bf0'][i % 4]; ctx.beginPath(); ctx.moveTo((-36 + i * 12) * u, -56 * u); ctx.lineTo((-28 + i * 12) * u, -56 * u); ctx.lineTo((-32 + i * 12) * u, -48 * u); ctx.closePath(); ctx.fill(); }
      break;
    }
    case 'hurdle': {
      ctx.fillStyle = 'rgba(40,30,60,.22)'; ctx.beginPath(); ctx.ellipse(0, 0, 14 * u, 4 * u, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(-12 * u, -16 * u, 2.5 * u, 16 * u); ctx.fillRect(9.5 * u, -16 * u, 2.5 * u, 16 * u);
      ctx.fillStyle = '#ff6b8b'; ctx.fillRect(-13 * u, -16 * u, 26 * u, 4 * u); ctx.fillStyle = '#fff'; ctx.fillRect(-13 * u, -16 * u, 6 * u, 4 * u); ctx.fillRect(1 * u, -16 * u, 6 * u, 4 * u);
      break;
    }
    case 'banner': {
      ctx.fillStyle = '#5b4a6a'; ctx.fillRect(-1.5 * u, -70 * u, 3 * u, 70 * u);
      const sw = Math.sin(t * 2 + p.sd) * 3 * u; ctx.fillStyle = p.sd < 0 ? '#ff6b8b' : '#4fc3f7';
      ctx.beginPath(); ctx.moveTo(1.5 * u, -68 * u); ctx.lineTo(26 * u + sw, -66 * u); ctx.lineTo(24 * u + sw, -36 * u); ctx.lineTo(13 * u + sw * 0.5, -42 * u); ctx.lineTo(1.5 * u, -36 * u); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(13 * u + sw * 0.5, -54 * u, 5 * u, 0, TAU); ctx.fill();
      break;
    }
    case 'flag': { ctx.fillStyle = '#5b4a6a'; ctx.fillRect(-1 * u, -26 * u, 2 * u, 26 * u); ctx.fillStyle = p.c; ctx.beginPath(); ctx.moveTo(0, -26 * u); ctx.lineTo(12 * u + Math.sin(t * 6 + p.x) * 2 * u, -22 * u); ctx.lineTo(0, -17 * u); ctx.closePath(); ctx.fill(); break; }
    case 'podium': {
      ctx.fillStyle = 'rgba(40,30,60,.22)'; ctx.beginPath(); ctx.ellipse(0, 0, 30 * u, 7 * u, 0, 0, TAU); ctx.fill();
      const blk = (px, hh, c, n2) => { const gr = ctx.createLinearGradient(0, -hh * u, 0, 0); gr.addColorStop(0, shade(c, 0.3)); gr.addColorStop(1, shade(c, -0.15)); ctx.fillStyle = gr; ctx.beginPath(); ctx.roundRect(px * u, -hh * u, 18 * u, hh * u, 3 * u); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = `900 ${9 * u}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(n2, (px + 9) * u, (-hh + 7) * u); };
      blk(-28, 16, '#c49bf0', '2'); blk(-9, 24, '#ffd84a', '1'); blk(10, 12, '#ff8a6b', '3');
      break;
    }
    case 'crowd': {
      const b = Math.abs(Math.sin(t * 6 + p.i)) * 3 * u;
      ctx.fillStyle = 'rgba(40,30,60,.2)'; ctx.beginPath(); ctx.ellipse(0, 0, 7 * u, 2.5 * u, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = p.c; ctx.beginPath(); ctx.ellipse(0, -7 * u - b, 6 * u, 6 * u, 0, 0, TAU); ctx.ellipse(0, -16 * u - b, 6.5 * u, 6 * u, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-3.5 * u, -23 * u - b, 2 * u, 4 * u, -0.3, 0, TAU); ctx.ellipse(3.5 * u, -23 * u - b, 2 * u, 4 * u, 0.3, 0, TAU); ctx.fill();
      break;
    }
    case 'racer': {
      ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(0, 4 * u, 9 * u, 3.5 * u, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = p.c; ctx.beginPath(); ctx.ellipse(0, -5 * u, 8 * u, 6.5 * u, 0, 0, TAU); ctx.fill(); ctx.lineWidth = Math.max(1, 2 * u); ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(-4 * u, -12 * u, 2.4 * u, 4.5 * u, -0.3, 0, TAU); ctx.ellipse(4 * u, -12 * u, 2.4 * u, 4.5 * u, 0.3, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2b2350'; ctx.beginPath(); ctx.arc(-2.5 * u, -6 * u, 1.2 * u, 0, TAU); ctx.arc(2.5 * u, -6 * u, 1.2 * u, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = `900 ${6 * u}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(p.i + 1), 0, -2 * u);
      break;
    }
  }
  ctx.restore();
}

/* Billboards (scenery, landmarks, the Poka). Landmarks also get ambient life. */
function drawBillboard(ctx, cam, it, t, base, depth, dyn = {}) {
  if (it.draw) { it.draw(ctx, cam, t); return; }
  const gy = it.corner ? PLINTH + TILE_H + 0.05 : it.onTile ? PLINTH + TILE_H : it.inner ? PLINTH : 0;   // stand on whatever surface is under it
  const p = project(cam, it.x, gy, it.z); if (!p) return;
  if (it.type === 'walker') return walker(ctx, cam, p, it, t);
  if (it.type === 'citizen') return citizen(ctx, cam, p, it, t, dyn);
  if (depth < 1.8) return;
  let spr;
  if (it.type === 'landmark') spr = SPR['lm_' + it.id](it.stage, it.tight);
  else if (it.type === 'tprop') spr = SPR[it.key]();
  else spr = it.type === 'tree' ? SPR.tree(it.v) : it.type === 'pine' ? SPR.pine() : it.type === 'bush' ? SPR.bush(it.v) : it.type === 'lamp' ? SPR.lamp() : it.type === 'bench' ? SPR.bench() : it.type === 'balloon' ? SPR.balloon(it.c) : null;
  if (!spr) return;
  const bounce = it.type === 'landmark' && dyn.bounce && dyn.bounce.id === it.id ? Math.max(0, 1 - (t - dyn.bounce.t0) / 0.9) : 0;
  const unit = p.k * it.s / 100 * (1 + Math.sin(bounce * Math.PI * 3) * 0.07 * bounce);
  const w = spr.w * unit, h = spr.h * unit;
  if (it.type === 'tprop' && depth < 2.6) return;
  if (w < 0.6) return;
  // C1.2: solid things are drawn solid. No proximity ghosting, no Camera-Mode ghosting;
  // the lane, the footprints and the camera's clear-line nudge keep Pudding visible.
  const shK = { tree: 0.4, pine: 0.34, bush: 0.42, lamp: 0.18, bench: 0.42, landmark: 0, tprop: 0.4 }[it.type] || 0;
  if (shK) { ctx.fillStyle = 'rgba(40,70,30,.22)'; ctx.beginPath(); ctx.ellipse(p.x + w * 0.06, p.y, w * shK, w * shK * Math.max(0.25, Math.sin(cam.pitch)) * (it.type === 'lamp' ? 0.6 : 1), 0, 0, TAU); ctx.fill(); }
  const sway = it.type === 'tree' || it.type === 'pine' ? Math.sin(t * 1.3 + it.x) * 0.02 : it.type === 'balloon' ? Math.sin(t * 2 + it.x * 3) * 0.08 : 0;
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(sway); ctx.drawImage(spr.c, -w / 2, -spr.ay * unit, w, h); ctx.restore();
  if (it.type === 'landmark') lmAmbient(ctx, it.id, it.stage, p.x, p.y, unit, t);
}
/* A park citizen: a generic visitor (not a roster pet) with its own idle loop
   and a random phase, so the board never moves in lockstep. */
function citizen(ctx, cam, p, it, t, dyn) {
  const s = p.k * 0.0026; if (s < 0.04) return;
  const alpha = 1;
  const tt = t + it.ph, act = it.act;
  const bob = act === 'hop' ? Math.max(0, Math.sin(tt * 3)) * 14 * s : Math.abs(Math.sin(tt * 2.2)) * 3 * s;
  const lean = act === 'turn' ? Math.sin(tt * 0.7) * 0.25 : 0;
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(40,70,30,.24)'; ctx.beginPath(); ctx.ellipse(0, 0, 24 * s, 7 * s, 0, 0, TAU); ctx.fill();
  ctx.translate(0, -bob); ctx.rotate(lean);
  const g = ctx.createRadialGradient(-8 * s, -70 * s, 4 * s, 0, -50 * s, 40 * s); g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, it.c); g.addColorStop(1, shade(it.c, -0.25));
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -24 * s, 22 * s, 22 * s, 0, 0, TAU); ctx.ellipse(0, -60 * s, 24 * s, 22 * s, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-13 * s, -86 * s, 6.5 * s, 14 * s, -0.3, 0, TAU); ctx.ellipse(13 * s, -86 * s, 6.5 * s, 14 * s, 0.3, 0, TAU); ctx.fill();
  if (act === 'wave') { const w = Math.sin(tt * 5) * 0.6; ctx.save(); ctx.translate(18 * s, -40 * s); ctx.rotate(-1.2 + w); ctx.fillStyle = it.c; ctx.beginPath(); ctx.ellipse(0, -10 * s, 5 * s, 11 * s, 0, 0, TAU); ctx.fill(); ctx.restore(); }
  ctx.fillStyle = '#3b2d4f'; ctx.beginPath(); ctx.arc(-7 * s, -62 * s, 2.4 * s, 0, TAU); ctx.arc(7 * s, -62 * s, 2.4 * s, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,128,150,.45)'; ctx.beginPath(); ctx.ellipse(-12 * s, -55 * s, 4 * s, 2.5 * s, 0, 0, TAU); ctx.ellipse(12 * s, -55 * s, 4 * s, 2.5 * s, 0, 0, TAU); ctx.fill();
  ctx.restore();
}
function walker(ctx, cam, p, it, t) {
  const s = p.k * 0.0032, bob = Math.abs(Math.sin(t * 7 + it.a * 5)) * 4 * s * 10;
  if (s < 0.05) return;
  ctx.save(); ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(40,70,30,.2)'; ctx.beginPath(); ctx.ellipse(0, 0, 26 * s, 8 * s, 0, 0, TAU); ctx.fill();
  ctx.translate(0, -bob); ctx.globalAlpha = 0.92;
  ctx.fillStyle = it.c; ctx.beginPath(); ctx.ellipse(0, -26 * s, 24 * s, 24 * s, 0, 0, TAU); ctx.ellipse(0, -62 * s, 26 * s, 24 * s, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-14 * s, -88 * s, 7 * s, 15 * s, -0.3, 0, TAU); ctx.ellipse(14 * s, -88 * s, 7 * s, 15 * s, 0.3, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.ellipse(-8 * s, -70 * s, 8 * s, 5 * s, -0.5, 0, TAU); ctx.fill();
  ctx.restore();
}
export { SPR };
