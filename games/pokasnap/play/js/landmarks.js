/* PokaSnap 2.2 C1.2 — the ten Puddle Park landmarks as SOLID illustrated
   destinations. Every landmark is a small 2.5D diorama on its own stone-and-
   grass island: real volumes (lit top, front and shaded side faces), material
   texture (brick, plank, shingle, stone), contact shadows, signage, props,
   and three stages that add structure — never a recolour.

   Each landmark also publishes its physical contract (FOOT): the island's
   radius in sprite pixels. world.js turns it into a collision footprint
   (radius × scale / 100 world units) that the trail lane is proven to clear
   (tools/tests/v22.mjs). Solid objects are never drawn translucent.

   Light comes from the upper left, matching the board, Pudding and props. */
import { shade } from './pudding.js';

const TAU = Math.PI * 2;
export const LM_W = 220, LM_H = 252;
export const ANCHOR = { x: 110, y: 186 };          // island centre = the landmark's world position
export const ISLAND = { rx: 92, ry: 40, h: 13 };    // island ellipse in sprite px
/* Physical footprint radius per landmark, sprite px (the island rim). */
/* On a board tile the tile itself is the base: the 'tight' variant drops the island
   and keeps only a paved pad and contact shadow, so the building can be larger inside
   the same physical footprint. */
export const FOOT_TIGHT = 66;
let TIGHT = false, CUR = null;
/* C1.4: landmarks no longer share one round island. Each base fits its place: paved plazas,
   organic lawns at the water, wide play lawns, raised rocky hills (footprints unchanged). */
export const BASE = { gate: 'plaza', fountain: 'round', snack: 'plaza', cafe: 'plaza', garden: 'organic', pond: 'organic', field: 'wide', trail: 'wide', gazebo: 'hill', lookout: 'tallhill' };
export function paint(x, id, st, tight = false) { TIGHT = tight; CUR = id; try { PAINT[id](x, st); } finally { TIGHT = false; CUR = null; } }
export const FOOT = { gate: 92, fountain: 92, snack: 92, garden: 92, field: 92, pond: 92, gazebo: 92, cafe: 92, trail: 92, lookout: 92 };

/* ------------------------------------------------------------- the kit -- */
const DX = 0.62, DY = -0.5;                         // depth shear: back faces go up-right
const lg = (x, x0, y0, x1, y1, stops) => { const g = x.createLinearGradient(x0, y0, x1, y1); stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c)); return g; };
const ink = c => shade(c, -0.45);
function quad(x, pts, fill, line, lw = 1.4) { x.beginPath(); pts.forEach(([a, b], i) => i ? x.lineTo(a, b) : x.moveTo(a, b)); x.closePath(); if (fill) { x.fillStyle = fill; x.fill(); } if (line) { x.lineWidth = lw; x.strokeStyle = line; x.lineJoin = 'round'; x.stroke(); } }
function ell(x, cx, cy, rx, ry, fill, line, lw = 1.4) { x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, TAU); if (fill) { x.fillStyle = fill; x.fill(); } if (line) { x.lineWidth = lw; x.strokeStyle = line; x.stroke(); } }

/* Box with its front-bottom-left corner at (X, Y). Returns the face rects for texturing. */
function box(x, X, Y, w, h, d, col, tex = null, top = null) {
  const dx = d * DX, dy = d * DY, o = ink(col);
  quad(x, [[X + w, Y], [X + w + dx, Y + dy], [X + w + dx, Y + dy - h], [X + w, Y - h]], lg(x, X + w, 0, X + w + dx, 0, [shade(col, -0.22), shade(col, -0.32)]), o);
  quad(x, [[X, Y - h], [X + w, Y - h], [X + w + dx, Y - h + dy], [X + dx, Y - h + dy]], top || lg(x, 0, Y - h + dy, 0, Y - h, [shade(col, 0.42), shade(col, 0.22)]), o);
  quad(x, [[X, Y], [X + w, Y], [X + w, Y - h], [X, Y - h]], lg(x, X, Y - h, X + w * 0.4, Y, [shade(col, 0.12), col]), o);
  if (tex) texture(x, X, Y, w, h, tex, col);
  // ambient occlusion where the box meets the ground, and a crisp lit edge on the front-left
  x.fillStyle = 'rgba(40,20,30,.16)'; x.fillRect(X, Y - 3, w, 3);
  x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(X + 1, Y - 2); x.lineTo(X + 1, Y - h + 1); x.lineTo(X + w - 1, Y - h + 1); x.stroke();
}
function texture(x, X, Y, w, h, tex, col) {
  x.save(); x.beginPath(); x.rect(X, Y - h, w, h); x.clip(); x.strokeStyle = shade(col, -0.2); x.lineWidth = 1;
  if (tex === 'brick') for (let r = 0, yy = Y - 6; yy > Y - h; r++, yy -= 7) { x.globalAlpha = 0.5; x.beginPath(); x.moveTo(X, yy); x.lineTo(X + w, yy); x.stroke(); for (let xx = X + (r % 2 ? 6 : 0); xx < X + w; xx += 12) { x.beginPath(); x.moveTo(xx, yy); x.lineTo(xx, yy + 7); x.stroke(); } }
  if (tex === 'plank') for (let xx = X + 7; xx < X + w; xx += 8) { x.globalAlpha = 0.45; x.beginPath(); x.moveTo(xx, Y - h); x.lineTo(xx, Y); x.stroke(); }
  if (tex === 'siding') for (let yy = Y - 5; yy > Y - h; yy -= 6) { x.globalAlpha = 0.35; x.beginPath(); x.moveTo(X, yy); x.lineTo(X + w, yy); x.stroke(); }
  if (tex === 'stone') for (let r = 0, yy = Y - 9; yy > Y - h - 9; r++, yy -= 10) for (let xx = X - (r % 2) * 9; xx < X + w; xx += 18) { x.globalAlpha = 0.55; x.beginPath(); x.roundRect(xx + 1, yy + 1, 16, 8, 3); x.stroke(); }
  x.restore();
}
/* Gable roof over a box (X, Ytop = top of the front wall). */
function gable(x, X, Yt, w, d, rh, col, wall) {
  const dx = d * DX, dy = d * DY, o = ink(col), m = X + w / 2, e = 6;
  quad(x, [[X - e, Yt + 2], [m, Yt - rh], [m + dx, Yt - rh + dy], [X - e + dx, Yt + 2 + dy]], lg(x, 0, Yt - rh, 0, Yt, [shade(col, 0.35), shade(col, 0.1)]), o);
  quad(x, [[m, Yt - rh], [X + w + e, Yt + 2], [X + w + e + dx, Yt + 2 + dy], [m + dx, Yt - rh + dy]], lg(x, m, 0, X + w + dx, 0, [shade(col, -0.12), shade(col, -0.3)]), o);
  shingles(x, [[m, Yt - rh], [X + w + e, Yt + 2], [X + w + e + dx, Yt + 2 + dy], [m + dx, Yt - rh + dy]], col);
  quad(x, [[X - e, Yt + 2], [X + w + e, Yt + 2], [m, Yt - rh]], lg(x, X, Yt - rh, X + w, Yt, [shade(wall, 0.2), wall]), ink(wall));
  quad(x, [[X - e - 2, Yt + 4], [m, Yt - rh - 3], [X + w + e + 2, Yt + 4], [X + w + e - 2, Yt + 6], [m, Yt - rh + 2], [X - e + 2, Yt + 6]], shade(col, -0.05), o, 1);
}
function shingles(x, pts, col) { x.save(); quad(x, pts); x.clip(); x.strokeStyle = shade(col, -0.35); x.globalAlpha = 0.45; x.lineWidth = 1; const [a, b, c] = pts; for (let k = 0.15; k < 1; k += 0.17) { x.beginPath(); x.moveTo(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k); x.lineTo(a[0] + (b[0] - a[0]) * k + (c[0] - b[0]), a[1] + (b[1] - a[1]) * k + (c[1] - b[1])); x.stroke(); } x.restore(); }
/* Cylinder standing on (cx, by). */
function cyl(x, cx, by, rx, ry, h, col, topCol) {
  const o = ink(col);
  x.beginPath(); x.moveTo(cx - rx, by - h); x.lineTo(cx - rx, by); x.ellipse(cx, by, rx, ry, 0, Math.PI, 0, true); x.lineTo(cx + rx, by - h); x.closePath();
  x.fillStyle = lg(x, cx - rx, 0, cx + rx, 0, [shade(col, 0.28), col, shade(col, -0.32)]); x.fill(); x.lineWidth = 1.4; x.strokeStyle = o; x.stroke();
  ell(x, cx, by - h, rx, ry, topCol || shade(col, 0.35), o);
}
function cone(x, cx, by, rx, ry, h, col) {
  x.beginPath(); x.moveTo(cx, by - h); x.lineTo(cx + rx, by); x.ellipse(cx, by, rx, ry, 0, 0, Math.PI); x.closePath();
  x.fillStyle = lg(x, cx - rx, 0, cx + rx, 0, [shade(col, 0.32), col, shade(col, -0.35)]); x.fill(); x.lineWidth = 1.4; x.strokeStyle = ink(col); x.stroke();
  x.save(); x.clip(); x.globalAlpha = 0.3; x.strokeStyle = shade(col, -0.4); for (let k = 0.25; k < 1; k += 0.22) { x.beginPath(); x.ellipse(cx, by - h + h * k, rx * k, ry * k, 0, 0, Math.PI); x.stroke(); } x.restore();
}
function win(x, X, Y, w, h, lit = true, arch = false) {
  x.beginPath(); arch ? (x.moveTo(X, Y), x.lineTo(X, Y - h + w / 2), x.arc(X + w / 2, Y - h + w / 2, w / 2, Math.PI, 0), x.lineTo(X + w, Y), x.closePath()) : x.roundRect(X, Y - h, w, h, 2);
  x.fillStyle = lit ? lg(x, 0, Y - h, 0, Y, ['#fff6c8', '#ffcf6b']) : lg(x, 0, Y - h, 0, Y, ['#bfe9ff', '#5fa8d6']); x.fill(); x.lineWidth = 2.4; x.strokeStyle = '#fffaf0'; x.stroke(); x.lineWidth = 1; x.strokeStyle = 'rgba(80,50,40,.6)'; x.stroke();
  x.strokeStyle = '#fffaf0'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(X + w / 2, Y - h + 2); x.lineTo(X + w / 2, Y); x.moveTo(X, Y - h * 0.5); x.lineTo(X + w, Y - h * 0.5); x.stroke();
  x.fillStyle = 'rgba(255,255,255,.55)'; x.beginPath(); x.moveTo(X + 2, Y - h * 0.55); x.lineTo(X + w * 0.35, Y - h + 3); x.lineTo(X + w * 0.45, Y - h + 3); x.lineTo(X + 2, Y - h * 0.38); x.fill();
  x.fillStyle = shade('#c98a5a', -0.1); x.fillRect(X - 2, Y, w + 4, 3);
}
function door(x, X, Y, w, h, col = '#c47a4a') { x.beginPath(); x.moveTo(X, Y); x.lineTo(X, Y - h + w / 2); x.arc(X + w / 2, Y - h + w / 2, w / 2, Math.PI, 0); x.lineTo(X + w, Y); x.closePath(); x.fillStyle = lg(x, X, 0, X + w, 0, [shade(col, 0.2), shade(col, -0.2)]); x.fill(); x.lineWidth = 1.4; x.strokeStyle = ink(col); x.stroke(); x.fillStyle = '#ffd84a'; x.beginPath(); x.arc(X + w - 4, Y - h / 2, 1.8, 0, TAU); x.fill(); }
function sign(x, cx, cy, w, text, bg = '#fff3dc', fg = '#c45a2a', font = 12) {
  const h = font + 10;
  x.fillStyle = 'rgba(40,20,20,.25)'; x.beginPath(); x.roundRect(cx - w / 2 + 2, cy - h / 2 + 3, w, h, h / 2); x.fill();
  x.beginPath(); x.roundRect(cx - w / 2, cy - h / 2, w, h, h / 2); x.fillStyle = lg(x, 0, cy - h / 2, 0, cy + h / 2, [shade(bg, 0.15), shade(bg, -0.08)]); x.fill(); x.lineWidth = 2.2; x.strokeStyle = fg; x.stroke();
  x.fillStyle = 'rgba(255,255,255,.6)'; x.beginPath(); x.roundRect(cx - w / 2 + 5, cy - h / 2 + 2.5, w - 10, 3, 2); x.fill();
  x.font = `900 ${font}px system-ui, -apple-system, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 3; x.strokeStyle = '#fffaf0'; x.strokeText(text, cx, cy + 1); x.fillStyle = fg; x.fillText(text, cx, cy + 1); x.textBaseline = 'alphabetic';
}
function post(x, px, by, h, w = 4, col = '#8a5a3a') { x.fillStyle = lg(x, px - w / 2, 0, px + w / 2, 0, [shade(col, 0.25), shade(col, -0.25)]); x.fillRect(px - w / 2, by - h, w, h); x.strokeStyle = ink(col); x.lineWidth = 1; x.strokeRect(px - w / 2, by - h, w, h); }
function lamp(x, px, by, h = 46) { post(x, px, by, h, 3, '#4a5578'); x.fillStyle = '#3a4466'; x.beginPath(); x.moveTo(px - 6, by - h); x.lineTo(px + 6, by - h); x.lineTo(px + 3, by - h - 9); x.lineTo(px - 3, by - h - 9); x.closePath(); x.fill(); const g = x.createRadialGradient(px, by - h - 4, 0, px, by - h - 4, 13); g.addColorStop(0, 'rgba(255,240,170,.95)'); g.addColorStop(1, 'rgba(255,240,170,0)'); x.fillStyle = g; x.beginPath(); x.arc(px, by - h - 4, 13, 0, TAU); x.fill(); x.fillStyle = '#ffe9a0'; x.fillRect(px - 3, by - h - 7, 6, 5); }
function bush(x, px, py, r, hue = '#5fbf5a', fl = null) { for (const [a, b, k] of [[-0.7, 0.1, 0.7], [0.7, 0.1, 0.7], [0, -0.3, 1]]) { const cx = px + a * r, cy = py + b * r, rr = r * k; const g = x.createRadialGradient(cx - rr * 0.4, cy - rr * 0.5, rr * 0.1, cx, cy, rr * 1.1); g.addColorStop(0, shade(hue, 0.4)); g.addColorStop(0.6, hue); g.addColorStop(1, shade(hue, -0.32)); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, rr, 0, TAU); x.fill(); } if (fl) { x.fillStyle = fl; for (let i = 0; i < 5; i++) { x.beginPath(); x.arc(px - r * 0.8 + i * r * 0.4, py - r * 0.2 - (i % 2) * r * 0.4, r * 0.13, 0, TAU); x.fill(); } } }
function tree(x, px, by, s = 1, hue = '#5fbf5a', blossom = null) { x.fillStyle = lg(x, px - 3 * s, 0, px + 3 * s, 0, ['#a87650', '#6d4a2e']); x.beginPath(); x.moveTo(px - 3 * s, by); x.lineTo(px - 2 * s, by - 22 * s); x.lineTo(px + 2 * s, by - 22 * s); x.lineTo(px + 3 * s, by); x.fill(); bush(x, px, by - 30 * s, 13 * s, hue, blossom); }
function flower(x, px, py, r, c) { x.fillStyle = c; for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; x.beginPath(); x.ellipse(px + Math.cos(a) * r * 0.6, py + Math.sin(a) * r * 0.6, r * 0.5, r * 0.32, a, 0, TAU); x.fill(); } x.fillStyle = '#ffd84a'; x.beginPath(); x.arc(px, py, r * 0.3, 0, TAU); x.fill(); }
function bunting(x, x0, y0, x1, y1, sag = 8) { x.strokeStyle = '#7a5a40'; x.lineWidth = 1; x.beginPath(); x.moveTo(x0, y0); x.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + sag * 2, x1, y1); x.stroke(); for (let i = 1; i < 9; i++) { const u = i / 9, bx = x0 + (x1 - x0) * u, by = y0 + (y1 - y0) * u + Math.sin(u * Math.PI) * sag; x.fillStyle = ['#ff6b8b', '#ffd84a', '#4fc3f7', '#2fc2a3'][i % 4]; x.beginPath(); x.moveTo(bx - 4, by); x.lineTo(bx + 4, by); x.lineTo(bx, by + 8); x.closePath(); x.fill(); } }
function lights(x, x0, y0, x1, y1, sag = 6) { x.strokeStyle = '#5b4a6a'; x.lineWidth = 0.8; x.beginPath(); x.moveTo(x0, y0); x.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + sag * 2, x1, y1); x.stroke(); for (let i = 1; i < 10; i++) { const u = i / 10, bx = x0 + (x1 - x0) * u, by = y0 + (y1 - y0) * u + Math.sin(u * Math.PI) * sag; const g = x.createRadialGradient(bx, by + 2, 0, bx, by + 2, 5); g.addColorStop(0, 'rgba(255,236,150,1)'); g.addColorStop(1, 'rgba(255,236,150,0)'); x.fillStyle = g; x.beginPath(); x.arc(bx, by + 2, 5, 0, TAU); x.fill(); } }
function flagpole(x, px, by, h, c, dir = 1) { post(x, px, by, h, 2.5, '#5b4a6a'); x.fillStyle = lg(x, px, 0, px + 18 * dir, 0, [c, shade(c, -0.2)]); x.beginPath(); x.moveTo(px, by - h); x.quadraticCurveTo(px + 9 * dir, by - h - 3, px + 18 * dir, by - h + 4); x.lineTo(px, by - h + 11); x.closePath(); x.fill(); x.fillStyle = '#ffd84a'; x.beginPath(); x.arc(px, by - h - 2, 2.4, 0, TAU); x.fill(); }
function fence(x, x0, x1, by, col = '#fff6e6') { for (let px = x0; px <= x1; px += 7) { x.fillStyle = col; x.beginPath(); x.moveTo(px - 2.5, by); x.lineTo(px - 2.5, by - 11); x.lineTo(px, by - 14); x.lineTo(px + 2.5, by - 11); x.lineTo(px + 2.5, by); x.closePath(); x.fill(); x.strokeStyle = shade(col, -0.35); x.lineWidth = 0.8; x.stroke(); } x.fillStyle = shade(col, -0.1); x.fillRect(x0 - 3, by - 9, x1 - x0 + 6, 2.5); }
function rock(x, px, py, r, col = '#c9c0b0') { const g = x.createRadialGradient(px - r * 0.4, py - r * 0.5, r * 0.1, px, py, r * 1.2); g.addColorStop(0, shade(col, 0.35)); g.addColorStop(1, shade(col, -0.3)); x.fillStyle = g; x.beginPath(); x.ellipse(px, py, r, r * 0.7, 0, 0, TAU); x.fill(); }
/* Soft contact shadow cast down-right onto the island. */
function cast(x, cx, cy, rx, ry, k = 0.22) { const g = x.createRadialGradient(cx + rx * 0.15, cy, 0, cx + rx * 0.15, cy, rx); g.addColorStop(0, `rgba(40,50,30,${k})`); g.addColorStop(1, 'rgba(40,50,30,0)'); x.fillStyle = g; x.beginPath(); x.ellipse(cx + rx * 0.15, cy, rx, ry, 0, 0, TAU); x.fill(); }

/* The island every landmark stands on: a stone-rimmed plinth, grass top, paved
   apron in the landmark's colour, and edge tufts so it sits in the world. */
function island(x, pave = '#f0dcb4', grass = ['#9be07a', '#5fb85a']) {
  const { x: cx, y: cy } = ANCHOR, { rx, ry, h } = ISLAND;
  const shape = BASE[CUR] || 'oval';
  if (!TIGHT && shape !== 'oval' && shape !== 'round') return baseShape(x, shape, pave, grass);
  if (TIGHT && (shape === 'plaza')) {   // tile-mounted plaza: a square paved pad with a kerb
    const g0 = x.createRadialGradient(cx + 6, cy + 4, 0, cx + 6, cy + 4, FOOT_TIGHT + 10); g0.addColorStop(0, 'rgba(40,40,30,.28)'); g0.addColorStop(1, 'rgba(40,40,30,0)'); x.fillStyle = g0; x.beginPath(); x.ellipse(cx + 6, cy + 4, FOOT_TIGHT + 10, (FOOT_TIGHT + 10) * 0.44, 0, 0, TAU); x.fill();
    quad(x, [[cx - 62, cy], [cx, cy - 27], [cx + 62, cy], [cx, cy + 27]], lg(x, 0, cy - 27, 0, cy + 27, [shade(pave, 0.2), shade(pave, -0.08)]), shade(pave, -0.35), 1.6);
    x.save(); quad(x, [[cx - 62, cy], [cx, cy - 27], [cx + 62, cy], [cx, cy + 27]]); x.clip(); x.strokeStyle = shade(pave, -0.18); x.lineWidth = 0.8; for (let i = -6; i <= 6; i++) { x.beginPath(); x.moveTo(cx + i * 11 - 30, cy - 14); x.lineTo(cx + i * 11 + 30, cy + 14); x.stroke(); x.beginPath(); x.moveTo(cx + i * 11 + 30, cy - 14); x.lineTo(cx + i * 11 - 30, cy + 14); x.stroke(); } x.restore();
    return;
  }
  if (TIGHT) {   // tile-mounted: soft shadow + paved pad only
    const g = x.createRadialGradient(cx + 6, cy + 4, 0, cx + 6, cy + 4, FOOT_TIGHT + 8); g.addColorStop(0, 'rgba(40,40,30,.28)'); g.addColorStop(1, 'rgba(40,40,30,0)'); x.fillStyle = g; x.beginPath(); x.ellipse(cx + 6, cy + 4, FOOT_TIGHT + 8, (FOOT_TIGHT + 8) * 0.44, 0, 0, TAU); x.fill();
    ell(x, cx, cy, FOOT_TIGHT, FOOT_TIGHT * 0.42, lg(x, 0, cy - 28, 0, cy + 28, [shade(pave, 0.18), shade(pave, -0.1)]), shade(pave, -0.35), 1.4);
    return;
  }
  x.fillStyle = 'rgba(40,60,30,.28)'; x.beginPath(); x.ellipse(cx + 6, cy + h + 4, rx + 4, ry + 4, 0, 0, TAU); x.fill();
  x.beginPath(); x.moveTo(cx - rx, cy); x.ellipse(cx, cy, rx, ry, 0, Math.PI, 0, true); x.lineTo(cx + rx, cy + h); x.ellipse(cx, cy + h, rx, ry, 0, 0, Math.PI); x.closePath();
  x.fillStyle = lg(x, cx - rx, 0, cx + rx, 0, ['#e8dccb', '#cdbfa5', '#a8977c']); x.fill(); x.lineWidth = 1.5; x.strokeStyle = '#8a7a62'; x.stroke();
  x.save(); x.clip(); x.strokeStyle = 'rgba(110,90,70,.45)'; x.lineWidth = 1; for (let i = -6; i <= 6; i++) { const a = Math.PI / 2 + i * 0.22, px = cx + Math.cos(a) * rx; x.beginPath(); x.moveTo(px, cy + Math.sin(a) * ry); x.lineTo(px, cy + Math.sin(a) * ry + h); x.stroke(); } x.restore();
  const g = x.createRadialGradient(cx - rx * 0.3, cy - ry * 0.5, 4, cx, cy, rx); g.addColorStop(0, grass[0]); g.addColorStop(1, grass[1]); ell(x, cx, cy, rx, ry, g, '#4a9a48', 1.4);
  ell(x, cx + 4, cy + 6, rx * 0.62, ry * 0.5, lg(x, 0, cy - ry * 0.5, 0, cy + ry * 0.5, [shade(pave, 0.15), shade(pave, -0.08)]), shade(pave, -0.3), 1);
  x.save(); x.beginPath(); x.ellipse(cx + 4, cy + 6, rx * 0.62, ry * 0.5, 0, 0, TAU); x.clip(); x.strokeStyle = shade(pave, -0.18); x.lineWidth = 0.8; for (let i = -6; i < 7; i++) { x.beginPath(); x.moveTo(cx + i * 10, cy - 20); x.lineTo(cx + i * 10 + 12, cy + 30); x.stroke(); } x.restore();
  for (let i = 0; i < 16; i++) { const a = Math.PI * 0.08 + i / 15 * Math.PI * 0.84, px = cx + Math.cos(a) * rx * 0.97, py = cy + Math.sin(a) * ry * 0.97; x.strokeStyle = '#4fa84a'; x.lineWidth = 1.3; x.beginPath(); x.moveTo(px - 2, py + 2); x.lineTo(px - 1, py - 4); x.moveTo(px + 1, py + 2); x.lineTo(px + 2, py - 3); x.stroke(); }
}

function baseShape(x, shape, pave, grass) {
  const { x: cx, y: cy } = ANCHOR, h = shape === 'tallhill' ? 34 : shape === 'hill' ? 20 : 12;
  x.fillStyle = 'rgba(40,60,30,.28)'; x.beginPath(); x.ellipse(cx + 6, cy + h + 4, 96, 40, 0, 0, TAU); x.fill();
  if (shape === 'plaza') {   // a square paved plaza with low hedges at the corners
    const pts = [[cx - 92, cy], [cx, cy - 40], [cx + 92, cy], [cx, cy + 40]];
    quad(x, [pts[0], pts[3], [pts[3][0], pts[3][1] + h], [pts[0][0], pts[0][1] + h]], '#cdbfa5', '#8a7a62', 1.2); quad(x, [pts[3], pts[2], [pts[2][0], pts[2][1] + h], [pts[3][0], pts[3][1] + h]], '#a8977c', '#8a7a62', 1.2);
    quad(x, pts, lg(x, 0, cy - 40, 0, cy + 40, [shade(pave, 0.22), shade(pave, -0.06)]), '#8a7a62', 1.4);
    x.save(); quad(x, pts); x.clip(); x.strokeStyle = shade(pave, -0.16); x.lineWidth = 0.9; for (let i = -10; i <= 10; i++) { x.beginPath(); x.moveTo(cx + i * 14 - 46, cy - 20); x.lineTo(cx + i * 14 + 46, cy + 20); x.stroke(); x.beginPath(); x.moveTo(cx + i * 14 + 46, cy - 20); x.lineTo(cx + i * 14 - 46, cy + 20); x.stroke(); } x.restore();
    for (const [px, py] of [[cx - 80, cy - 2], [cx + 80, cy - 2], [cx, cy + 33]]) bush(x, px, py, 9, '#4fae6a', '#ffd84a');
    return;
  }
  if (shape === 'organic') {   // an irregular lawn, tufts and stones at the edge
    const path = () => { x.beginPath(); for (let i = 0; i <= 24; i++) { const a = i / 24 * TAU, r = 1 + 0.08 * Math.sin(a * 3 + 1) + 0.05 * Math.sin(a * 5); const px = cx + Math.cos(a) * 96 * r, py = cy + Math.sin(a) * 40 * r; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.closePath(); };
    x.save(); x.translate(0, 9); path(); x.fillStyle = '#7a5a40'; x.fill(); x.restore();
    path(); const g = x.createRadialGradient(cx - 30, cy - 18, 4, cx, cy, 100); g.addColorStop(0, grass[0]); g.addColorStop(1, grass[1]); x.fillStyle = g; x.fill(); x.strokeStyle = '#4a9a48'; x.lineWidth = 1.4; x.stroke();
    for (const [px, py, r] of [[cx - 84, cy + 14, 7], [cx + 78, cy + 20, 6], [cx + 20, cy + 40, 5]]) rock(x, px, py, r);
    return;
  }
  if (shape === 'wide') {   // a long flat play lawn with a picket edge
    x.beginPath(); x.ellipse(cx, cy + h, 104, 34, 0, 0, Math.PI); x.lineTo(cx - 104, cy); x.ellipse(cx, cy, 104, 34, 0, Math.PI, 0, false); x.lineTo(cx + 104, cy + h); x.closePath(); x.fillStyle = '#8a6a48'; x.fill();
    ell(x, cx, cy, 104, 34, lg(x, 0, cy - 34, 0, cy + 34, [grass[0], grass[1]]), '#4a9a48', 1.4);
    for (let i = 0; i < 13; i++) { const a = Math.PI * 0.12 + i / 12 * Math.PI * 0.76, px = cx + Math.cos(a) * 100, py = cy + Math.sin(a) * 32; x.fillStyle = '#fff6e6'; x.fillRect(px - 1.5, py - 9, 3, 9); } x.strokeStyle = '#fff6e6'; x.lineWidth = 1.5; x.beginPath(); x.ellipse(cx, cy - 6, 100, 32, 0, Math.PI * 0.12, Math.PI * 0.88); x.stroke();
    return;
  }
  // hill / tallhill: tiers of rock rising under the structure
  const tiers = shape === 'tallhill' ? 3 : 2;
  for (let k = 0; k < tiers; k++) { const r = 96 - k * 14, ry = 40 - k * 6, y = cy + h - k * (h / tiers);
    x.beginPath(); x.ellipse(cx, y, r, ry, 0, 0, Math.PI); x.lineTo(cx - r, y - h / tiers); x.ellipse(cx, y - h / tiers, r, ry, 0, Math.PI, 0, false); x.closePath(); x.fillStyle = lg(x, cx - r, 0, cx + r, 0, ['#d8ccb8', '#b4a48a', '#8e7e64']); x.fill(); x.strokeStyle = '#7a6a52'; x.lineWidth = 1.2; x.stroke(); }
  const r = 96 - (tiers - 1) * 14; ell(x, cx, cy, r, 40 - (tiers - 1) * 6, lg(x, 0, cy - 40, 0, cy + 30, [grass[0], grass[1]]), '#4a9a48', 1.4);
  for (const [px, py] of [[cx - r + 10, cy + 6], [cx + r - 14, cy + 10]]) bush(x, px, py, 8, '#4fae6a');
}

/* ------------------------------------------------------- the landmarks -- */
const C = ANCHOR;
export const PAINT = {
  gate(x, s) {
    island(x, '#f4d8a8');
    for (const px of [44, 176]) { cast(x, px + 6, C.y + 4, 22, 9); box(x, px - 13, C.y + 8, 26, 82, 12, '#e8dccb', 'stone'); box(x, px - 16, C.y + 8 - 82, 32, 8, 14, '#f4ead8'); }
    // the arch: a lit timber beam with a hanging plaque
    x.lineCap = 'round'; x.strokeStyle = '#7a4a2a'; x.lineWidth = 15; x.beginPath(); x.moveTo(36, 106); x.quadraticCurveTo(110, 40, 184, 106); x.stroke();
    x.strokeStyle = lg(x, 0, 60, 0, 110, ['#f0a060', '#c8682a']); x.lineWidth = 11; x.stroke(); x.strokeStyle = 'rgba(255,240,210,.7)'; x.lineWidth = 2; x.beginPath(); x.moveTo(40, 100); x.quadraticCurveTo(110, 38, 180, 100); x.stroke(); x.lineCap = 'butt';
    post(x, 88, 98, 18, 1.5, '#5b4a3a'); post(x, 132, 98, 18, 1.5, '#5b4a3a');
    sign(x, 110, 96, 104, 'PUDDLE PARK', '#fff3dc', '#c45a2a', 12);
    bush(x, 26, C.y + 14, 10, '#5fbf5a', '#ff9fc4'); bush(x, 194, C.y + 14, 10, '#5fbf5a', '#ffd84a');
    if (s >= 1) {   // ticket kiosk, lanterns, bunting
      lights(x, 44, 96, 176, 96, 6);
      cast(x, 168, C.y + 22, 20, 7); box(x, 152, C.y + 26, 26, 30, 12, '#ff9fc4', 'siding'); quad(x, [[148, C.y - 4], [182, C.y - 4], [189, C.y - 10], [155, C.y - 10]], '#ff6b8b', ink('#ff6b8b')); win(x, 157, C.y + 12, 16, 12);
      for (const px of [44, 176]) { const ly = C.y - 96; post(x, px, ly - 6, 6, 2, '#5b4a6a'); const g = x.createRadialGradient(px, ly - 12, 0, px, ly - 12, 13); g.addColorStop(0, 'rgba(255,230,150,1)'); g.addColorStop(1, 'rgba(255,230,150,0)'); x.fillStyle = g; x.beginPath(); x.arc(px, ly - 12, 13, 0, TAU); x.fill(); ell(x, px, ly - 12, 5, 7, '#ffcf6b', '#c47d10', 1); }
    }
    if (s >= 2) {   // flower crown, banners and topiary bunnies
      for (let i = 0; i < 11; i++) { const u = i / 10, px = 36 + 148 * u, py = 106 - Math.sin(u * Math.PI) * 50; flower(x, px, py - 4, 6, ['#ff9fc4', '#fff', '#ff6b8b'][i % 3]); }
      for (const [px, c] of [[44, '#4fc3f7'], [176, '#2fc2a3']]) { quad(x, [[px - 10, C.y - 66], [px + 10, C.y - 66], [px + 10, C.y - 34], [px, C.y - 40], [px - 10, C.y - 34]], c, ink(c)); flower(x, px, C.y - 54, 5, '#fff'); }
      for (const px of [24, 196]) { bush(x, px, C.y + 2, 9, '#4fae6a'); x.fillStyle = '#4fae6a'; x.beginPath(); x.ellipse(px - 4, C.y - 16, 3.5, 9, -0.2, 0, TAU); x.ellipse(px + 4, C.y - 16, 3.5, 9, 0.2, 0, TAU); x.fill(); }
      x.fillStyle = '#ffd84a'; x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 5 : 11; x.lineTo(110 + Math.cos(a) * r, 52 + Math.sin(a) * r); } x.closePath(); x.fill(); x.strokeStyle = '#c47d10'; x.lineWidth = 1.2; x.stroke();
    }
  },
  fountain(x, s) {
    island(x, '#e9e2d4', ['#a6e48a', '#5fb85a']);
    cast(x, C.x, C.y + 8, 70, 22);
    cyl(x, C.x, C.y + 14, 66, 22, 16, '#e3d8c4', '#d9ccb4');
    ell(x, C.x, C.y - 2, 58, 18, lg(x, 0, C.y - 20, 0, C.y + 16, ['#b9eeff', '#3fa9e0']), '#2a8ac0');
    x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineWidth = 1.2; for (const r of [22, 40]) { x.beginPath(); x.ellipse(C.x + 6, C.y + 2, r, r * 0.3, 0, 0.3, 2.6); x.stroke(); }
    cyl(x, C.x, C.y - 4, 12, 4, 40, '#efe5d2');
    cyl(x, C.x, C.y - 44, 30, 9, 7, '#e8dcc6', lg(x, 0, C.y - 60, 0, C.y - 44, ['#cff4ff', '#58b8e8']));
    if (s >= 1) {
      cyl(x, C.x, C.y - 52, 7, 2.5, 22, '#efe5d2'); cyl(x, C.x, C.y - 74, 17, 5, 5, '#e8dcc6', lg(x, 0, C.y - 84, 0, C.y - 74, ['#cff4ff', '#58b8e8']));
      x.fillStyle = '#ffd84a'; for (let i = 0; i < 8; i++) { x.beginPath(); x.ellipse(C.x - 40 + i * 11, C.y + 2 + (i % 3) * 3, 3, 2, 0, 0, TAU); x.fill(); }
      for (const px of [24, 196]) { box(x, px - 12, C.y + 30, 24, 6, 8, '#ffb38a', 'plank'); post(x, px - 9, C.y + 34, 5, 2, '#5b4a6a'); post(x, px + 9, C.y + 34, 5, 2, '#5b4a6a'); }
    }
    if (s >= 2) {   // a bunny statue crowns the jets; planters and lamps ring the plaza
      x.fillStyle = lg(x, C.x - 10, 0, C.x + 10, 0, ['#fffaf0', '#cfc4b0']); x.beginPath(); x.ellipse(C.x, C.y - 88, 9, 8, 0, 0, TAU); x.ellipse(C.x + 3, C.y - 98, 6.5, 6, 0, 0, TAU); x.fill(); x.beginPath(); x.ellipse(C.x + 1, C.y - 108, 2.6, 7, -0.2, 0, TAU); x.ellipse(C.x + 6, C.y - 107, 2.6, 7, 0.3, 0, TAU); x.fill(); x.strokeStyle = '#a89a80'; x.lineWidth = 1; x.stroke();
      for (const [px, py] of [[34, C.y - 18], [186, C.y - 18], [60, C.y + 30], [160, C.y + 30]]) { cyl(x, px, py, 9, 3, 8, '#c98a5a', '#7a5a40'); bush(x, px, py - 12, 7, '#5fbf5a', ['#ff6b8b', '#ffd84a', '#c49bf0', '#ff9fc4'][(px + py) % 4]); }
      lamp(x, 18, C.y + 4, 50); lamp(x, 202, C.y + 4, 50);
    }
  },
  snack(x, s) {
    island(x, '#ffe3c2');
    if (s >= 2) {   // a proper kiosk hut behind the cart
      cast(x, 140, C.y - 8, 40, 12); box(x, 104, C.y - 4, 64, 46, 26, '#ffe8c8', 'plank'); gable(x, 104, C.y - 50, 64, 26, 22, '#ff6b8b', '#fff3dc'); win(x, 114, C.y - 14, 18, 18); win(x, 140, C.y - 14, 18, 18);
      lights(x, 96, C.y - 52, 180, C.y - 52, 5);
    }
    cast(x, C.x - 8, C.y + 22, 48, 12);
    box(x, 54, C.y + 22, 96, 42, 22, '#fff3dc', 'plank');
    x.fillStyle = lg(x, 0, C.y - 20, 0, C.y - 8, ['#ff8aa6', '#e84d74']); x.beginPath(); x.roundRect(52, C.y - 24, 100, 14, 4); x.fill(); x.strokeStyle = ink('#ff6b8b'); x.lineWidth = 1.2; x.stroke();
    sign(x, 102, C.y - 40, 92, 'SNACK STOP', '#fff3dc', '#e04a6e', 11); post(x, 70, C.y - 24, 8, 2, '#8a5a3a'); post(x, 134, C.y - 24, 8, 2, '#8a5a3a');
    for (const [px, c] of [[72, '#ffd84a'], [100, '#ff8a6b'], [128, '#2fc2a3']]) { cyl(x, px, C.y + 2, 9, 3, 10, '#fffaf0'); ell(x, px, C.y - 8, 7, 2.5, c); }
    for (const px of [64, 140]) { ell(x, px, C.y + 24, 7, 7, '#5b4a6a'); ell(x, px, C.y + 24, 3, 3, '#c9c0b0'); }
    if (s >= 1) {   // striped umbrella, menu board and stools
      post(x, 44, C.y + 20, 72, 3, '#8a5a3a');
      for (let i = 0; i < 8; i++) { const a0 = Math.PI + i * Math.PI / 8, a1 = a0 + Math.PI / 8; x.fillStyle = i % 2 ? '#fff' : '#ff6b8b'; x.beginPath(); x.moveTo(44, C.y - 66); x.lineTo(44 + Math.cos(a0) * 40, C.y - 46 + Math.sin(a0) * -2); x.lineTo(44 + Math.cos(a1) * 40, C.y - 46 + Math.sin(a1) * -2); x.closePath(); x.fill(); }
      x.strokeStyle = ink('#ff6b8b'); x.lineWidth = 1.2; x.beginPath(); x.moveTo(4, C.y - 46); x.lineTo(44, C.y - 66); x.lineTo(84, C.y - 46); x.stroke();
      for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#ff6b8b' : '#fff'; x.beginPath(); x.arc(9 + i * 10, C.y - 46, 5, 0, Math.PI); x.fill(); }
      box(x, 160, C.y + 30, 26, 30, 4, '#5b4a6a'); for (let i = 0; i < 3; i++) { x.fillStyle = '#fffaf0'; x.fillRect(165, C.y + 8 + i * 6 - 30 + 20, 14, 2); }
      for (const px of [76, 120]) { cyl(x, px, C.y + 40, 6, 2, 9, '#ffd84a'); }
    }
  },
  garden(x, s) {
    island(x, '#efe0c0', ['#b4ea8a', '#62bb5a']);
    if (s >= 1) {   // a little greenhouse and birdbath
      cast(x, 150, C.y - 12, 34, 10); box(x, 120, C.y - 8, 50, 34, 24, '#dff6ff', null, 'rgba(220,245,255,.8)');
      x.strokeStyle = '#fff'; x.lineWidth = 1.6; for (let px = 128; px < 170; px += 10) { x.beginPath(); x.moveTo(px, C.y - 8); x.lineTo(px, C.y - 42); x.stroke(); }
      gable(x, 120, C.y - 42, 50, 24, 16, '#bfe9ff', '#e8fbff');
      for (let i = 0; i < 4; i++) bush(x, 128 + i * 11, C.y - 14, 4, '#5fbf5a', '#ff9fc4');
      cyl(x, 44, C.y - 2, 4, 1.5, 18, '#e8dccb'); cyl(x, 44, C.y - 20, 14, 4, 4, '#e8dccb', '#9ee4ff');
    }
    for (const [bx, by, w] of [[30, C.y + 10, 56], [94, C.y + 26, 64], [60, C.y + 42, 90]]) {
      cast(x, bx + w / 2, by + 2, w * 0.55, 6); box(x, bx, by, w, 10, 12, '#9a6a44', 'plank');
      for (let i = 0; i < w / 9; i++) { const px = bx + 6 + i * 9, py = by - 14 - (i % 2) * 4; x.strokeStyle = '#4f9f4a'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(px, by - 10); x.lineTo(px, py); x.stroke(); flower(x, px, py, 5, ['#ff6b8b', '#ffd84a', '#c49bf0', '#ff9fc4', '#4fc3f7'][(i + bx) % 5]); }
    }
    fence(x, 18, 70, C.y - 22);
    if (s >= 2) {   // blossom arch over the path, stepping stones and a butterfly house
      const P0 = [72, C.y + 40], P1 = [110, C.y - 76], P2 = [148, C.y + 40], B = u => [(1 - u) ** 2 * P0[0] + 2 * u * (1 - u) * P1[0] + u * u * P2[0], (1 - u) ** 2 * P0[1] + 2 * u * (1 - u) * P1[1] + u * u * P2[1]];
      x.lineCap = 'round'; x.strokeStyle = '#7a4a2a'; x.lineWidth = 7; x.beginPath(); x.moveTo(...P0); x.quadraticCurveTo(...P1, ...P2); x.stroke(); x.strokeStyle = '#b07a4a'; x.lineWidth = 4; x.stroke(); x.lineCap = 'butt';
      for (let i = 0; i < 15; i++) { const [px, py] = B(i / 14); bush(x, px, py - 2, 5.5, i % 2 ? '#ffc4d8' : '#ff9fc4', i % 3 ? '#fff' : '#ff6b8b'); }
      box(x, 172, C.y + 6, 22, 24, 10, '#c49bf0', 'siding'); quad(x, [[168, C.y - 18], [198, C.y - 18], [183, C.y - 34]], '#8f7fe8', ink('#8f7fe8')); ell(x, 183, C.y - 6, 4, 4, '#2b2350');
      for (const [px, py] of [[96, C.y + 2], [112, C.y + 12], [128, C.y + 4]]) rock(x, px, py, 6, '#efe5d2');
    }
  },
  field(x, s) {
    island(x, '#dff0c0', ['#a8e07a', '#4fae4a']);
    x.strokeStyle = 'rgba(255,255,255,.8)'; x.lineWidth = 2; x.beginPath(); x.ellipse(C.x, C.y + 4, 64, 24, 0, 0, TAU); x.stroke(); x.beginPath(); x.moveTo(C.x, C.y - 20); x.lineTo(C.x, C.y + 28); x.stroke();
    for (let i = 0; i < 5; i++) { const px = 46 + i * 32, py = C.y + 22 - (i % 2) * 18; cast(x, px + 3, py + 1, 9, 3); x.beginPath(); x.moveTo(px, py - 22); x.lineTo(px + 8, py); x.lineTo(px - 8, py); x.closePath(); x.fillStyle = lg(x, px - 8, 0, px + 8, 0, ['#ffc28a', '#ff7a3c', '#d85a20']); x.fill(); x.strokeStyle = '#b84a18'; x.lineWidth = 1; x.stroke(); x.fillStyle = '#fff'; x.fillRect(px - 5, py - 12, 10, 4); ell(x, px, py, 9, 3, '#ff7a3c', '#b84a18', 1); }
    flagpole(x, 196, C.y - 2, 50, '#ffd84a', -1);
    if (s >= 1) {   // hoops and a crawl tunnel
      for (const px of [70, 150]) { post(x, px - 16, C.y - 8, 26, 3, '#5b4a6a'); post(x, px + 16, C.y - 8, 26, 3, '#5b4a6a'); x.strokeStyle = '#ff6b8b'; x.lineWidth = 6; x.beginPath(); x.ellipse(px, C.y - 46, 18, 20, 0, 0, TAU); x.stroke(); x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineWidth = 2; x.beginPath(); x.ellipse(px, C.y - 46, 18, 20, 0, 3.6, 5.4); x.stroke(); }
      x.fillStyle = lg(x, 0, C.y + 10, 0, C.y + 44, ['#9e8fff', '#5a48c8']); x.beginPath(); x.moveTo(30, C.y + 44); x.lineTo(30, C.y + 26); x.quadraticCurveTo(30, C.y + 8, 52, C.y + 8); x.lineTo(92, C.y + 8); x.quadraticCurveTo(108, C.y + 8, 108, C.y + 26); x.lineTo(108, C.y + 44); x.closePath(); x.fill(); x.strokeStyle = '#3b2d8a'; x.lineWidth = 1.4; x.stroke();
      x.strokeStyle = 'rgba(255,255,255,.35)'; for (let px = 42; px < 106; px += 10) { x.beginPath(); x.moveTo(px, C.y + 9); x.lineTo(px, C.y + 44); x.stroke(); } ell(x, 108, C.y + 32, 6, 12, '#2b2350');
    }
    if (s >= 2) {   // A-frame agility ramp and a scoreboard
      quad(x, [[120, C.y + 40], [150, C.y - 2], [154, C.y - 2], [184, C.y + 40]], null, null);
      quad(x, [[118, C.y + 40], [152, C.y - 6], [186, C.y + 40], [176, C.y + 40], [152, C.y + 8], [128, C.y + 40]], '#4fc3f7', ink('#4fc3f7'));
      x.fillStyle = '#ffd84a'; for (let k = 0; k < 4; k++) { const u = 0.2 + k * 0.2; x.fillRect(118 + 34 * u - 3, C.y + 40 - 46 * u, 6, 2); }
      box(x, 14, C.y - 26, 40, 26, 6, '#2b2350'); x.fillStyle = '#7dffb0'; x.font = '900 13px system-ui'; x.textAlign = 'center'; x.fillText('10', 34, C.y - 32); post(x, 22, C.y - 4, 22, 3, '#5b4a6a'); post(x, 46, C.y - 4, 22, 3, '#5b4a6a');
    }
  },
  pond(x, s) {
    island(x, '#ecdcae', ['#a6e48a', '#56b058']);
    x.beginPath(); x.ellipse(C.x + 4, C.y + 6, 74, 26, 0, 0, TAU); x.fillStyle = '#d9c38c'; x.fill();
    x.beginPath(); x.ellipse(C.x + 4, C.y + 6, 68, 22, 0, 0, TAU); x.fillStyle = lg(x, 0, C.y - 16, 0, C.y + 28, ['#bdf0ff', '#2f9ad6']); x.fill(); x.strokeStyle = '#2a7ab0'; x.lineWidth = 1.2; x.stroke();
    x.save(); x.clip(); x.fillStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.ellipse(C.x - 20, C.y, 30, 5, -0.1, 0, TAU); x.fill(); x.restore();
    for (const [px, py, r] of [[40, C.y + 18, 7], [176, C.y + 14, 8], [160, C.y - 10, 6]]) rock(x, px, py, r);
    for (let i = 0; i < 9; i++) { const px = 34 + i * 7 + (i > 4 ? 110 : 0), by = C.y + (i % 3) * 4 - 6; x.strokeStyle = '#3f9a4a'; x.lineWidth = 2; x.beginPath(); x.moveTo(px, by); x.quadraticCurveTo(px + 2, by - 18, px + 4, by - 30); x.stroke(); ell(x, px + 4, by - 30, 2.4, 6, '#7a5a40'); }
    if (s >= 1) {   // lily pads and a duck house
      for (const [px, py] of [[80, C.y + 14], [130, C.y + 4], [108, C.y + 20]]) { x.fillStyle = '#5fbf5a'; x.beginPath(); x.ellipse(px, py, 10, 4.5, 0, 0.3, TAU - 0.3); x.lineTo(px, py); x.fill(); flower(x, px - 3, py - 3, 3.4, '#ff9fc4'); }
      cyl(x, 150, C.y + 12, 3, 1, 22, '#8a5a3a'); box(x, 138, C.y - 10, 24, 16, 12, '#fff3dc', 'plank'); gable(x, 138, C.y - 26, 24, 12, 10, '#ff8a6b', '#fff3dc'); ell(x, 150, C.y - 16, 4, 4, '#2b2350');
    }
    if (s >= 2) {   // an arched wooden bridge with lanterns
      x.lineCap = 'round'; x.strokeStyle = '#7a4a2a'; x.lineWidth = 9; x.beginPath(); x.moveTo(52, C.y + 26); x.quadraticCurveTo(108, C.y - 34, 164, C.y + 26); x.stroke(); x.strokeStyle = '#c98a5a'; x.lineWidth = 6; x.stroke();
      x.strokeStyle = '#8a5a3a'; x.lineWidth = 1; for (let k = 1; k < 10; k++) { const u = k / 10, px = 52 + 112 * u, py = C.y + 26 - Math.sin(u * Math.PI) * 30; x.beginPath(); x.moveTo(px, py - 3); x.lineTo(px, py + 3); x.stroke(); post(x, px, py - 2, 12, 2, '#8a5a3a'); }
      x.strokeStyle = '#8a5a3a'; x.lineWidth = 2; x.beginPath(); x.moveTo(52, C.y + 12); x.quadraticCurveTo(108, C.y - 48, 164, C.y + 12); x.stroke(); x.lineCap = 'butt';
      for (const px of [52, 164]) { post(x, px, C.y + 26, 34, 3, '#5b4a6a'); const g = x.createRadialGradient(px, C.y - 12, 0, px, C.y - 12, 11); g.addColorStop(0, 'rgba(255,220,140,1)'); g.addColorStop(1, 'rgba(255,220,140,0)'); x.fillStyle = g; x.beginPath(); x.arc(px, C.y - 12, 11, 0, TAU); x.fill(); ell(x, px, C.y - 12, 4, 6, '#ff9a5c', '#c45a2a', 1); }
    }
  },
  gazebo(x, s) {
    island(x, '#efe6f6', ['#b0e88a', '#5fb85a']);
    cast(x, C.x, C.y + 8, 70, 22);
    cyl(x, C.x, C.y + 14, 64, 22, 10, '#f3e7d3', '#fbf4e8');
    for (const a of [Math.PI * 0.08, Math.PI * 0.35, Math.PI * 0.65, Math.PI * 0.92]) post(x, C.x + Math.cos(a) * 54, C.y + Math.sin(a) * 18 + 4, 76, 6, '#fff6e6');
    if (s >= 1) {   // the bubble tub under the roof
      cyl(x, C.x, C.y + 8, 30, 10, 18, '#ffffff', lg(x, 0, C.y - 18, 0, C.y - 2, ['#d8f6ff', '#7fd4f4']));
      for (let i = 0; i < 9; i++) { x.strokeStyle = 'rgba(255,255,255,.95)'; x.lineWidth = 1.4; x.beginPath(); x.arc(C.x - 24 + i * 6, C.y - 14 - (i % 3) * 5, 3 + (i % 2) * 2.5, 0, TAU); x.stroke(); }
      for (const px of [C.x - 28, C.x + 28]) { post(x, px, C.y + 8, 4, 3, '#c9c0b0'); }
    }
    for (const a of [Math.PI * 1.15, Math.PI * 1.5, Math.PI * 1.85]) post(x, C.x + Math.cos(a) * 54, C.y + Math.sin(a) * 18 + 4, 72, 5, '#efe2cc');
    cone(x, C.x, C.y - 66, 78, 24, 56, '#a98cf0');
    for (let i = 0; i < 14; i++) { const a = i / 13 * Math.PI; x.fillStyle = i % 2 ? '#fff' : '#c49bf0'; x.beginPath(); x.arc(C.x - Math.cos(a) * 74, C.y - 66 + Math.sin(a) * 22, 5, 0, Math.PI); x.fill(); }
    x.fillStyle = '#ffd84a'; x.beginPath(); x.arc(C.x, C.y - 124, 6, 0, TAU); x.fill(); x.strokeStyle = '#c47d10'; x.lineWidth = 1.2; x.stroke();
    if (s >= 2) {   // mirror stand, bow ribbons and a salon wing with flower boxes
      cast(x, 182, C.y + 8, 20, 6); box(x, 166, C.y + 12, 30, 40, 14, '#ffd1e4', 'siding'); quad(x, [[162, C.y - 28], [200, C.y - 28], [208, C.y - 35], [170, C.y - 35]], '#ff9fc4', ink('#ff9fc4')); win(x, 172, C.y - 2, 18, 18);
      x.fillStyle = '#5fbf5a'; x.fillRect(170, C.y + 2, 22, 4); for (let i = 0; i < 4; i++) flower(x, 173 + i * 6, C.y + 1, 3, '#ff6b8b');
      x.beginPath(); x.roundRect(20, C.y - 44, 26, 40, 13); x.fillStyle = '#fff'; x.fill(); x.strokeStyle = '#c49bf0'; x.lineWidth = 3; x.stroke(); ell(x, 33, C.y - 24, 9, 15, lg(x, 24, 0, 42, 0, ['#f4fbff', '#bfe0f4'])); post(x, 33, C.y + 6, 10, 3, '#c49bf0');
      for (const px of [60, 160]) { x.fillStyle = '#ff6b8b'; x.beginPath(); x.moveTo(px, C.y - 70); x.lineTo(px - 9, C.y - 76); x.lineTo(px - 9, C.y - 64); x.closePath(); x.moveTo(px, C.y - 70); x.lineTo(px + 9, C.y - 76); x.lineTo(px + 9, C.y - 64); x.closePath(); x.fill(); ell(x, px, C.y - 70, 2.4, 2.4, '#e04a6e'); }
    }
  },
  cafe(x, s) {
    island(x, '#f6dcc0');
    if (s >= 2) {   // a second wing with a pastry window and a chimney
      cast(x, 172, C.y - 18, 30, 10); box(x, 148, C.y - 14, 46, 54, 22, '#ffe2c4', 'brick'); gable(x, 148, C.y - 68, 46, 22, 18, '#c98a5a', '#fff3dc');
      box(x, 178, C.y - 82, 9, 22, 7, '#c86a4a', 'brick'); win(x, 156, C.y - 22, 30, 22, true);
      for (let i = 0; i < 4; i++) { ell(x, 162 + i * 6, C.y - 28, 2.6, 2.6, ['#ffd84a', '#ff9fc4', '#c98a5a', '#ff8a6b'][i]); }
    }
    cast(x, C.x - 10, C.y + 10, 58, 16);
    box(x, 44, C.y + 6, 92, 62, 30, '#fff3e2', 'siding');
    gable(x, 44, C.y - 56, 92, 30, 34, '#ff7a96', '#fff3e2');
    sign(x, 90, C.y - 66, 84, 'POKA CAFÉ', '#fff3dc', '#e04a6e', 11);
    win(x, 54, C.y - 14, 22, 26); win(x, 104, C.y - 14, 22, 26); door(x, 80, C.y + 6, 20, 32);
    x.fillStyle = '#5fbf5a'; for (const px of [52, 102]) { x.fillRect(px, C.y - 14, 26, 5); for (let i = 0; i < 4; i++) flower(x, px + 4 + i * 6, C.y - 15, 3, ['#ff6b8b', '#ffd84a'][i % 2]); }
    // one café table out front
    cast(x, 30, C.y + 34, 14, 4); cyl(x, 30, C.y + 32, 2, 1, 16, '#5b4a6a'); cyl(x, 30, C.y + 16, 13, 4, 3, '#ffffff'); post(x, 30, C.y + 16, 26, 2, '#7a5a40'); x.fillStyle = '#ff6b8b'; x.beginPath(); x.ellipse(30, C.y - 12, 18, 7, 0, Math.PI, TAU); x.fill(); x.strokeStyle = ink('#ff6b8b'); x.lineWidth = 1; x.stroke();
    if (s >= 1) {   // striped awning, patio set and string lights
      for (let i = 0; i < 9; i++) { x.fillStyle = i % 2 ? '#fff' : '#2fc2a3'; x.beginPath(); x.moveTo(44 + i * 10.2, C.y - 52); x.lineTo(54.2 + i * 10.2, C.y - 52); x.lineTo(54.2 + i * 10.2, C.y - 40); x.arc(49.1 + i * 10.2, C.y - 40, 5.1, 0, Math.PI); x.closePath(); x.fill(); }
      x.strokeStyle = ink('#2fc2a3'); x.lineWidth = 1; x.strokeRect(44, C.y - 52, 92, 12);
      cast(x, 160, C.y + 40, 14, 4); cyl(x, 160, C.y + 38, 2, 1, 16, '#5b4a6a'); cyl(x, 160, C.y + 22, 13, 4, 3, '#ffffff'); post(x, 160, C.y + 22, 26, 2, '#7a5a40'); x.fillStyle = '#2fc2a3'; x.beginPath(); x.ellipse(160, C.y - 6, 18, 7, 0, Math.PI, TAU); x.fill();
      for (const px of [146, 174]) cyl(x, px, C.y + 44, 5, 2, 8, '#ffb38a');
      lights(x, 30, C.y - 30, 160, C.y - 14, 6);
    }
  },
  trail(x, s) {
    island(x, '#ecd7ab', ['#a8e07a', '#56b058']);
    x.fillStyle = lg(x, 0, C.y - 10, 0, C.y + 30, ['#f2d6a2', '#d9b07a']); x.beginPath(); x.ellipse(C.x, C.y + 8, 80, 22, 0, 0, TAU); x.fill(); x.strokeStyle = 'rgba(255,255,255,.75)'; x.setLineDash([6, 5]); x.lineWidth = 1.5; x.beginPath(); x.ellipse(C.x, C.y + 8, 66, 16, 0, 0, TAU); x.stroke(); x.setLineDash([]);
    for (let i = 0; i < 3; i++) { const px = 56 + i * 44, py = C.y + 18 - (i % 2) * 18; cast(x, px, py + 2, 18, 4); post(x, px - 15, py, 26, 4, '#fff6e6'); post(x, px + 15, py, 26, 4, '#fff6e6'); x.fillStyle = lg(x, 0, py - 28, 0, py - 20, [i % 2 ? '#7fdcff' : '#ff9ab2', i % 2 ? '#2a9fd6' : '#e84d74']); x.beginPath(); x.roundRect(px - 18, py - 28, 36, 8, 3); x.fill(); x.fillStyle = '#fff'; x.fillRect(px - 5, py - 28, 9, 8); }
    flagpole(x, 18, C.y + 4, 58, '#ffd84a'); flagpole(x, 202, C.y + 4, 58, '#ff6b8b', -1);
    if (s >= 1) {   // tunnel and weave poles
      x.fillStyle = lg(x, 0, C.y - 40, 0, C.y - 8, ['#9e8fff', '#5a48c8']); x.beginPath(); x.moveTo(132, C.y - 8); x.lineTo(132, C.y - 22); x.quadraticCurveTo(132, C.y - 38, 152, C.y - 38); x.lineTo(176, C.y - 38); x.quadraticCurveTo(192, C.y - 38, 192, C.y - 22); x.lineTo(192, C.y - 8); x.closePath(); x.fill(); x.strokeStyle = '#3b2d8a'; x.lineWidth = 1.2; x.stroke(); ell(x, 132, C.y - 18, 6, 10, '#2b2350');
      for (let i = 0; i < 6; i++) post(x, 40 + i * 12, C.y - 12 + (i % 2) * 2, 30, 3, i % 2 ? '#ff6b8b' : '#fff');
    }
    if (s >= 2) {   // a training clubhouse with a stopwatch board
      cast(x, 66, C.y - 30, 30, 9); box(x, 40, C.y - 26, 52, 40, 22, '#d6ecff', 'plank'); gable(x, 40, C.y - 66, 52, 22, 20, '#4f8fe0', '#eef6ff'); door(x, 58, C.y - 26, 14, 22, '#4f8fe0'); win(x, 44, C.y - 40, 10, 12); win(x, 78, C.y - 40, 10, 12);
      ell(x, 66, C.y - 78, 11, 11, '#fffaf0', '#2b2350', 2); x.strokeStyle = '#ff6b8b'; x.lineWidth = 2; x.beginPath(); x.moveTo(66, C.y - 78); x.lineTo(66, C.y - 85); x.moveTo(66, C.y - 78); x.lineTo(71, C.y - 76); x.stroke();
    }
  },
  lookout(x, s) {
    island(x, '#e6dcc6', ['#9fd87a', '#4fa04a']);
    for (const [px, py, r] of [[34, C.y + 10, 11], [182, C.y + 16, 10], [60, C.y + 26, 7]]) rock(x, px, py, r);
    cast(x, C.x + 6, C.y + 4, 62, 18);
    for (const px of [56, 164]) { post(x, px, C.y + 14, 58, 7, '#8a5a3a'); post(x, px + 16, C.y - 6, 52, 6, '#7a4a2a'); }
    x.strokeStyle = '#7a4a2a'; x.lineWidth = 2; x.beginPath(); x.moveTo(56, C.y + 10); x.lineTo(164, C.y - 40); x.moveTo(164, C.y + 10); x.lineTo(56, C.y - 40); x.stroke();
    box(x, 44, C.y - 44, 132, 9, 22, '#c98a5a', 'plank');
    for (let i = 0; i <= 10; i++) post(x, 46 + i * 13, C.y - 53, 18, 2.5, '#8a5a3a'); x.fillStyle = '#a86a3a'; x.fillRect(42, C.y - 72, 136, 4); x.fillStyle = 'rgba(255,240,210,.6)'; x.fillRect(42, C.y - 72, 136, 1.5);
    if (s >= 1) {   // telescope, flags and a stair
      post(x, 110, C.y - 53, 18, 3, '#5b4a6a'); x.save(); x.translate(110, C.y - 74); x.rotate(-0.5); x.fillStyle = lg(x, -5, 0, 5, 0, ['#7a86b0', '#3a4466']); x.beginPath(); x.roundRect(-5, -22, 10, 30, 4); x.fill(); x.fillStyle = '#ffd84a'; x.fillRect(-6, -24, 12, 4); x.restore();
      flagpole(x, 48, C.y - 53, 40, '#ff6b8b'); flagpole(x, 172, C.y - 53, 40, '#4fc3f7', -1);
      for (let i = 0; i < 6; i++) box(x, 176 + i * 2, C.y + 22 - i * 11, 16, 3, 8, '#c98a5a');
    }
    if (s >= 2) {   // a roofed top and a golden photo frame for the vista
      for (const px of [52, 168]) post(x, px, C.y - 53, 48, 4, '#fff6e6');
      cone(x, C.x, C.y - 100, 74, 14, 30, '#2fc2a3');
      x.strokeStyle = '#ffd84a'; x.lineWidth = 6; x.strokeRect(84, C.y - 96, 52, 34); x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(84, C.y - 96, 52, 34); for (const [px, py] of [[84, C.y - 96], [136, C.y - 96], [84, C.y - 62], [136, C.y - 62]]) ell(x, px, py, 4, 4, '#ffd84a', '#c47d10', 1);
    }
  },
};

/* Ambient life in screen space; (sx, sy) is the island centre, u = px scale. */
export function lmAmbient(ctx, id, st, sx, sy, u, t) {
  const P = (px, py) => [sx + (px - C.x) * u, sy + (py - C.y) * u];
  switch (id) {
    case 'fountain': { const [cx, cy] = P(C.x, C.y - (st >= 1 ? 80 : 50)); for (let i = 0; i < 12; i++) { const k = ((t * 0.9 + i / 12) % 1), a = i / 12 * TAU; ctx.fillStyle = `rgba(210,245,255,${0.95 * (1 - k)})`; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 40 * u * k, cy - Math.sin(Math.PI * k) * 26 * u + k * 46 * u, (1.8 + (i % 3)) * u, 0, TAU); ctx.fill(); }
      if (st >= 2) for (let i = 0; i < 5; i++) { ctx.strokeStyle = ['#ff6b8b', '#ffd84a', '#2fc2a3', '#4fc3f7', '#c49bf0'][i]; ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 3 + i); ctx.lineWidth = 2.2 * u; ctx.beginPath(); ctx.moveTo(cx, cy - 6 * u); ctx.quadraticCurveTo(cx + (i - 2) * 22 * u, cy - 60 * u, cx + (i - 2) * 34 * u, cy + 70 * u); ctx.stroke(); } ctx.globalAlpha = 1; break; }
    case 'garden': for (let i = 0; i < (st >= 1 ? 6 : 3); i++) { const [bx0, by0] = P(110, 120); const bx = bx0 + Math.sin(t * 0.7 + i * 1.7) * 70 * u, by = by0 - Math.abs(Math.sin(t * 1.1 + i)) * 40 * u, fl = Math.max(0.6 * u, 3 * u + Math.sin(t * 14 + i) * 2.4 * u); ctx.fillStyle = ['#ff9fc4', '#ffd84a', '#c49bf0', '#4fc3f7', '#ff8a6b', '#fff'][i]; ctx.beginPath(); ctx.ellipse(bx - 4 * u, by, 5 * u, fl, -0.4, 0, TAU); ctx.ellipse(bx + 4 * u, by, 5 * u, fl, 0.4, 0, TAU); ctx.fill(); } break;
    case 'pond': { for (let i = 0; i < 3; i++) { const k = (t * 0.5 + i / 3) % 1, [rx, ry] = P(90 + i * 24, C.y + 8); ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - k)})`; ctx.lineWidth = 1.2 * u; ctx.beginPath(); ctx.ellipse(rx, ry, (4 + k * 18) * u, (1.5 + k * 6) * u, 0, 0, TAU); ctx.stroke(); }
      if (st >= 1) for (let i = 0; i < 2; i++) { const [px, py] = P(90 + Math.sin(t * 0.3 + i * 2) * 30, C.y + 2 + i * 10); ctx.fillStyle = '#fff6d6'; ctx.beginPath(); ctx.ellipse(px, py, 7 * u, 4.5 * u, 0, 0, TAU); ctx.arc(px + 6 * u, py - 5 * u, 3.6 * u, 0, TAU); ctx.fill(); ctx.fillStyle = '#ff9a5c'; ctx.beginPath(); ctx.moveTo(px + 9 * u, py - 5 * u); ctx.lineTo(px + 13 * u, py - 4 * u); ctx.lineTo(px + 9 * u, py - 3 * u); ctx.fill(); } break; }
    case 'snack': case 'cafe': { const [cx, cy] = id === 'cafe' ? P(st >= 2 ? 182 : 120, st >= 2 ? C.y - 104 : C.y - 40) : P(100, C.y - 30); for (let i = 0; i < 3; i++) { const k = (t * 0.4 + i * 0.33) % 1; ctx.fillStyle = `rgba(255,255,255,${0.6 * (1 - k)})`; ctx.beginPath(); ctx.arc(cx + Math.sin(k * 6 + i) * 4 * u, cy - k * 34 * u, (3 + k * 6) * u, 0, TAU); ctx.fill(); } break; }
    case 'gazebo': if (st >= 1) for (let i = 0; i < 6; i++) { const k = (t * 0.35 + i / 6) % 1, [bx, by] = P(C.x + (i - 2.5) * 10, C.y - 20); ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - k)})`; ctx.lineWidth = 1.2 * u; ctx.beginPath(); ctx.arc(bx + Math.sin(k * 5 + i) * 5 * u, by - k * 60 * u, (3 + (i % 2) * 3) * u, 0, TAU); ctx.stroke(); } break;
    case 'gate': case 'trail': case 'lookout': { const [fx, fy] = P(C.x, C.y - 130); for (let i = 0; i < 3; i++) { const k = (t * 0.6 + i * 0.33) % 1; ctx.fillStyle = `rgba(255,216,74,${0.8 * (1 - k)})`; ctx.beginPath(); ctx.arc(fx + (i - 1) * 34 * u, fy - k * 24 * u, 2.4 * u, 0, TAU); ctx.fill(); } break; }
    case 'field': { const k = (t * 0.6) % 1, [fx, fy] = P(50 + k * 120, C.y + 6); ctx.fillStyle = '#2fc2a3'; ctx.beginPath(); ctx.arc(fx, fy - Math.abs(Math.sin(k * Math.PI * 3)) * 18 * u, 5 * u, 0, TAU); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1 * u; ctx.stroke(); break; }
  }
}
/* The kit is shared with the weekly-event concept cards (concepts.html). */
export const KIT = { box, gable, cyl, cone, win, door, sign, post, lamp, bush, tree, flower, bunting, lights, flagpole, fence, rock, cast, lg, ell, quad };
