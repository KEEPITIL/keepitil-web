/* Weekly centre dioramas (C1.4): one painter per mode in the landmark art kit. The
   board centre shows the ACTIVE week's diorama (world.js) and concepts.html shows all
   four. Each painter draws into a 360x330 box; the diorama island is at (180, ~220). */
import { KIT } from './landmarks.js';
const { box, cyl, cone, sign, post, lamp, bush, flower, bunting, lights, flagpole, rock, cast, lg, ell, quad } = KIT;
const TAU = Math.PI * 2;
let x = null;
function base(cx, cy, rx, ry, top, rim) {
  x.fillStyle = 'rgba(40,60,30,.25)'; x.beginPath(); x.ellipse(cx + 8, cy + 20, rx + 6, ry + 6, 0, 0, TAU); x.fill();
  x.beginPath(); x.moveTo(cx - rx, cy); x.ellipse(cx, cy, rx, ry, 0, Math.PI, 0, true); x.lineTo(cx + rx, cy + 16); x.ellipse(cx, cy + 16, rx, ry, 0, 0, Math.PI); x.closePath(); x.fillStyle = lg(x, cx - rx, 0, cx + rx, 0, [rim[0], rim[1]]); x.fill(); x.strokeStyle = 'rgba(60,40,60,.4)'; x.lineWidth = 1.5; x.stroke();
  const g = x.createRadialGradient(cx - rx * 0.3, cy - ry * 0.4, 6, cx, cy, rx); g.addColorStop(0, top[0]); g.addColorStop(1, top[1]); ell(x, cx, cy, rx, ry, g, 'rgba(60,40,60,.35)');
}
const P = {
  dance() {
  base(180, 214, 150, 70, ['#d9c8ff', '#9a86ea'], ['#e8dccb', '#a8977c']);
  quad(x, [[150, 290], [210, 290], [196, 214], [164, 214]], lg(x, 0, 214, 0, 290, ['#5a48c8', '#2b2350']));
  for (let l = 0; l < 4; l++) for (let k = 0; k < 4; k++) { const u = k / 4, px = 166 + l * 9.3 + (l - 1.5) * u * 10, py = 220 + u * 64; x.fillStyle = ['#ff6b8b', '#ffd84a', '#4fc3f7', '#7dffb0'][l]; x.globalAlpha = 0.35 + u * 0.6; x.beginPath(); x.ellipse(px, py, 3 + u * 3, 2 + u * 1.6, 0, 0, TAU); x.fill(); } x.globalAlpha = 1;
  x.strokeStyle = '#fff'; x.lineWidth = 2.5; x.beginPath(); x.moveTo(146, 282); x.lineTo(214, 282); x.stroke();
  cyl(x, 180, 214, 90, 34, 18, '#ffb3d0', lg(x, 0, 170, 0, 214, ['#fff0f6', '#ffc8dc']));
  for (const px of [92, 268]) { box(x, px - 9, 216, 18, 92, 10, '#5b4a6a'); for (let i = 0; i < 3; i++) { const g = x.createRadialGradient(px, 134 + i * 16, 0, px, 134 + i * 16, 16); g.addColorStop(0, ['rgba(255,107,139,.95)', 'rgba(255,216,74,.95)', 'rgba(79,195,247,.95)'][i]); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.beginPath(); x.arc(px, 134 + i * 16, 16, 0, TAU); x.fill(); } }
  for (let i = 0; i < 5; i++) { x.fillStyle = `rgba(255,255,255,${0.12 + 0.04 * i})`; x.beginPath(); x.moveTo(180, 70); x.lineTo(110 + i * 35, 205); x.lineTo(126 + i * 35, 205); x.closePath(); x.fill(); }
  x.fillStyle = '#fff'; x.beginPath(); x.ellipse(180, 178, 16, 22, 0, 0, TAU); x.fill(); x.beginPath(); x.ellipse(172, 150, 5, 12, -0.4, 0, TAU); x.ellipse(188, 150, 5, 12, 0.6, 0, TAU); x.fill(); x.fillStyle = '#3d8bf0'; x.fillRect(172, 168, 16, 4);
  for (const px of [130, 150, 210, 230]) { x.fillStyle = '#ffd84a'; x.font = '900 14px system-ui'; x.fillText('♪', px, 120 + (px % 3) * 10); }
  bunting(x, 92, 128, 268, 128, 10);
  },
  flight() {
  base(180, 236, 150, 60, ['#b7e48e', '#62bb5a'], ['#e8dccb', '#a8977c']);
  for (const [px, py, r] of [[110, 150, 34], [250, 120, 30], [190, 190, 26]]) { x.fillStyle = lg(x, 0, py, 0, py + r, ['#a98a6a', '#6d4a2e']); x.beginPath(); x.moveTo(px - r, py); x.quadraticCurveTo(px, py + r * 1.4, px + r, py); x.fill(); ell(x, px, py, r, r * 0.35, lg(x, 0, py - 10, 0, py + 10, ['#b4ea8a', '#5fb85a'])); for (let i = 0; i < 4; i++) flower(x, px - r * 0.6 + i * r * 0.4, py - 3, 4, ['#ff6b8b', '#ffd84a', '#fff', '#c49bf0'][i]); }
  for (const [ax, ay] of [[150, 230], [240, 220]]) { for (let i = 0; i < 9; i++) { const a = Math.PI + i / 8 * Math.PI; x.fillStyle = ['#ff6b8b', '#ffd84a', '#4fc3f7'][i % 3]; x.beginPath(); x.arc(ax + Math.cos(a) * 34, ay + Math.sin(a) * 44, 7, 0, TAU); x.fill(); } }
  x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 2; for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(40, 100 + i * 30); x.bezierCurveTo(110, 80 + i * 30, 200, 130 + i * 20, 330, 100 + i * 26); x.stroke(); }
  x.strokeStyle = '#7a5a40'; x.lineWidth = 1; for (const dx of [-8, 0, 8]) { x.beginPath(); x.moveTo(196 + dx, 112); x.lineTo(200, 150); x.stroke(); }
  for (const [px, c] of [[188, '#ff6b8b'], [200, '#ffd84a'], [212, '#4fc3f7']]) { x.fillStyle = c; x.beginPath(); x.ellipse(px, 98, 9, 11, 0, 0, TAU); x.fill(); }
  x.fillStyle = '#fff'; x.beginPath(); x.ellipse(200, 160, 10, 13, 0, 0, TAU); x.fill(); x.beginPath(); x.ellipse(194, 142, 3.5, 9, -0.6, 0, TAU); x.ellipse(206, 142, 3.5, 9, 0.6, 0, TAU); x.fill();
  },
  switch() {
  base(180, 236, 150, 60, ['#b7e48e', '#62bb5a'], ['#e8dccb', '#a8977c']);
  quad(x, [[86, 296], [274, 296], [204, 100], [156, 100]], lg(x, 0, 100, 0, 296, ['#f2e2c2', '#d9b07a']));
  x.strokeStyle = '#fff'; x.lineWidth = 2; x.setLineDash([8, 6]); for (const k of [1 / 3, 2 / 3]) { x.beginPath(); x.moveTo(86 + 188 * k, 296); x.lineTo(156 + 48 * k, 100); x.stroke(); } x.setLineDash([]);
  for (const [u, l, kind] of [[0.25, 0, 'gate'], [0.45, 2, 'gate'], [0.65, 1, 'bar']]) { const y = 100 + (1 - u) * 196, w0 = 48 + (188 - 48) * (1 - u), xl = 156 - (156 - 86) * (1 - u) + l * w0 / 3; if (kind === 'gate') { box(x, xl + 4, y, w0 / 3 - 8, 22 * (1 - u * 0.6), 6, '#ff6b8b', 'plank'); } else { post(x, xl + 4, y, 30 * (1 - u * 0.5), 3, '#7a5236'); post(x, xl + w0 / 3 - 4, y, 30 * (1 - u * 0.5), 3, '#7a5236'); x.fillStyle = '#5fbf5a'; x.fillRect(xl + 2, y - 32 * (1 - u * 0.5), w0 / 3 - 4, 7); } }
  for (let i = 0; i < 6; i++) { const u = 0.08 + i * 0.07, y = 100 + (1 - u) * 196; x.fillStyle = '#ffd84a'; x.beginPath(); x.arc(180 + (1 - u) * 10, y - 6, 4 - u * 2, 0, TAU); x.fill(); }
  x.fillStyle = '#fff'; x.beginPath(); x.ellipse(180, 268, 16, 20, 0, 0, TAU); x.fill(); x.beginPath(); x.ellipse(170, 246, 5, 13, -0.3, 0, TAU); x.ellipse(190, 246, 5, 13, 0.3, 0, TAU); x.fill(); x.fillStyle = '#fff8f0'; x.beginPath(); x.arc(180, 286, 7, 0, TAU); x.fill();
  for (const [px, t] of [[60, '←'], [300, '→'], [180, '↑']]) { x.fillStyle = 'rgba(43,35,80,.7)'; x.beginPath(); x.arc(px, px === 180 ? 80 : 230, 14, 0, TAU); x.fill(); x.fillStyle = '#fff'; x.font = '900 16px system-ui'; x.textAlign = 'center'; x.fillText(t, px, (px === 180 ? 80 : 230) + 6); }
  for (const px of [96, 264]) bush(x, px, 150, 16, '#4fae6a', '#ff9fc4');
  },
};
export const DIORAMA_W = 360, DIORAMA_H = 330;
export function paintDiorama(ctx, id) { x = ctx; P[id]?.(); x = null; }
export const DIORAMA_IDS = Object.keys(P);
