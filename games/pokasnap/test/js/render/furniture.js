/* Movable furniture, decor and toys (2.1). Drawn procedurally, anchored at the FOOT centre,
   in a box of w × h pixels. rot 180 mirrors, 90/270 turn side-on (narrower, shaded side). */

const rr = (c, x, y, w, h, r, fill) => { c.beginPath(); c.roundRect(x, y, w, h, r); c.fillStyle = fill; c.fill(); };
const circ = (c, x, y, r, fill) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); };
const DRAW = {
  rug: (c, w, h) => { c.beginPath(); c.ellipse(0, -h / 2, w / 2, h / 2, 0, 0, 7); c.fillStyle = '#f2d49b'; c.fill(); c.beginPath(); c.ellipse(0, -h / 2, w / 2 - 12, h / 2 - 6, 0, 0, 7); c.strokeStyle = '#e0b870'; c.lineWidth = 5; c.stroke(); },
  couch: (c, w, h) => { rr(c, -w / 2, -h * 0.95, w, h * 0.45, 22, '#b25e4b'); rr(c, -w / 2 + 6, -h * 0.6, w - 12, h * 0.46, 20, '#c96f5a');
    rr(c, -w / 2 - 4, -h * 0.75, w * 0.12, h * 0.6, 14, '#a8523f'); rr(c, w / 2 - w * 0.12 + 4, -h * 0.75, w * 0.12, h * 0.6, 14, '#a8523f');
    for (const s of [-0.2, 0.2]) rr(c, w * s - w * 0.17, -h * 0.72, w * 0.34, h * 0.2, 12, '#d98470'); c.fillStyle = '#8f5a3c'; c.fillRect(-w / 2 + 12, -h * 0.14, 10, h * 0.14); c.fillRect(w / 2 - 22, -h * 0.14, 10, h * 0.14); },
  armchair: (c, w, h) => { rr(c, -w / 2, -h * 0.95, w, h * 0.5, 20, '#6a8fd0'); rr(c, -w / 2 + 4, -h * 0.55, w - 8, h * 0.42, 16, '#7ea3e0'); rr(c, -w / 2 - 4, -h * 0.7, w * 0.2, h * 0.55, 12, '#5b7fbf'); rr(c, w / 2 - w * 0.2 + 4, -h * 0.7, w * 0.2, h * 0.55, 12, '#5b7fbf'); c.fillStyle = '#4a5a80'; c.fillRect(-w / 2 + 10, -h * 0.13, 8, h * 0.13); c.fillRect(w / 2 - 18, -h * 0.13, 8, h * 0.13); },
  petbed: (c, w, h) => { c.beginPath(); c.ellipse(0, -h / 2, w / 2, h / 2, 0, 0, 7); c.fillStyle = '#a98bf0'; c.fill(); c.beginPath(); c.ellipse(0, -h * 0.55, w / 2 - 14, h / 2 - 8, 0, 0, 7); c.fillStyle = '#e8dcff'; c.fill(); },
  bed: (c, w, h) => { rr(c, -w / 2, -h, w * 0.14, h, 10, '#8a5a3c'); rr(c, -w / 2 + 8, -h * 0.7, w - 8, h * 0.5, 14, '#fdf6ec'); rr(c, -w / 2 + w * 0.3, -h * 0.68, w * 0.7 - 8, h * 0.44, 12, '#5ec8f2'); rr(c, -w / 2 + 14, -h * 0.86, w * 0.26, h * 0.24, 12, '#fff'); c.fillStyle = '#6b4a2a'; c.fillRect(-w / 2 + 8, -h * 0.22, w - 8, h * 0.1); c.fillRect(w / 2 - 12, -h * 0.5, 12, h * 0.5); },
  table: (c, w, h) => { rr(c, -w / 2, -h, w, h * 0.16, 6, '#b97a4e'); c.fillStyle = '#9c6a44'; c.fillRect(-w / 2 + 8, -h * 0.86, 9, h * 0.86); c.fillRect(w / 2 - 17, -h * 0.86, 9, h * 0.86); },
  shelf: (c, w, h) => { rr(c, -w / 2, -h, w, h, 6, '#9c6a44'); for (let i = 1; i < 4; i++) { c.fillStyle = '#7a4f30'; c.fillRect(-w / 2 + 6, -h + i * h / 4, w - 12, 5); for (let k = 0; k < 4; k++) rr(c, -w / 2 + 10 + k * (w - 20) / 4, -h + i * h / 4 - h * 0.14, (w - 30) / 5, h * 0.14, 2, ['#ff6b8b', '#5ec8f2', '#ffd23f', '#53d3a2'][(i + k) % 4]); } },
  toybox: (c, w, h) => { rr(c, -w / 2, -h, w, h, 8, '#ffd23f'); c.fillStyle = '#e8aa14'; c.fillRect(-w / 2, -h * 0.72, w, 6); circ(c, -w * 0.2, -h * 0.4, h * 0.14, '#ff6b8b'); circ(c, w * 0.18, -h * 0.4, h * 0.14, '#5ec8f2'); },
  cattree: (c, w, h) => { c.fillStyle = '#c9a86b'; c.fillRect(-8, -h, 16, h); for (const [y, x] of [[0.95, 0], [0.62, -0.2], [0.32, 0.2]]) rr(c, -w / 2 + w * (0.5 + x) - w * 0.35, -h * y, w * 0.7, 14, 6, '#8a6fcf'); rr(c, -w / 2, -h * 0.08, w, h * 0.08, 6, '#8a6fcf'); },
  plant: (c, w, h) => { rr(c, -w * 0.3, -h * 0.34, w * 0.6, h * 0.34, 6, '#c96f5a'); for (let i = 0; i < 7; i++) { c.save(); c.translate(0, -h * 0.34); c.rotate(-1.1 + i * 0.37); c.beginPath(); c.ellipse(0, -h * 0.3, w * 0.14, h * 0.3, 0, 0, 7); c.fillStyle = i % 2 ? '#3f9a5b' : '#5fb84a'; c.fill(); c.restore(); } },
  lamp: (c, w, h) => { c.fillStyle = '#6a6275'; c.fillRect(-4, -h * 0.7, 8, h * 0.7); rr(c, -w * 0.3, -h * 0.08, w * 0.6, h * 0.08, 4, '#6a6275'); c.beginPath(); c.moveTo(-w / 2, -h * 0.6); c.lineTo(w / 2, -h * 0.6); c.lineTo(w * 0.28, -h); c.lineTo(-w * 0.28, -h); c.closePath(); c.fillStyle = '#ffe9a8'; c.fill(); },
  vase: (c, w, h) => { c.beginPath(); c.moveTo(-w * 0.3, 0); c.quadraticCurveTo(-w * 0.6, -h * 0.5, -w * 0.2, -h * 0.7); c.lineTo(w * 0.2, -h * 0.7); c.quadraticCurveTo(w * 0.6, -h * 0.5, w * 0.3, 0); c.closePath(); c.fillStyle = '#5ec8f2'; c.fill(); for (let i = 0; i < 3; i++) circ(c, (i - 1) * w * 0.25, -h * 0.9 - (i % 2) * 6, w * 0.16, ['#ff6b8b', '#ffd23f', '#fff'][i]); },
  picture: (c, w, h) => { rr(c, -w / 2, -h, w, h, 4, '#8a5a3c'); rr(c, -w / 2 + 6, -h + 6, w - 12, h - 12, 2, '#bfe3ff'); c.beginPath(); c.moveTo(-w / 2 + 6, -6); c.lineTo(-w * 0.1, -h * 0.55); c.lineTo(w * 0.15, -h * 0.25); c.lineTo(w / 2 - 6, -h * 0.6); c.lineTo(w / 2 - 6, -6); c.closePath(); c.fillStyle = '#7cc85a'; c.fill(); circ(c, w * 0.22, -h * 0.72, h * 0.1, '#fff3a0'); },
  clock: (c, w, h) => { circ(c, 0, -h / 2, w / 2, '#fff'); c.lineWidth = 5; c.strokeStyle = '#3b2a33'; c.beginPath(); c.arc(0, -h / 2, w / 2 - 2, 0, 7); c.stroke(); const t = Date.now() / 1000; for (const [len, sp] of [[0.3, 1 / 3600], [0.42, 1 / 60]]) { c.beginPath(); c.moveTo(0, -h / 2); c.lineTo(Math.sin(t * sp * 6.283) * w * len, -h / 2 - Math.cos(t * sp * 6.283) * w * len); c.stroke(); } },
  bench: (c, w, h) => { rr(c, -w / 2, -h * 0.9, w, h * 0.18, 4, '#b97a4e'); rr(c, -w / 2, -h * 0.55, w, h * 0.2, 4, '#c98a5e'); c.fillStyle = '#6b4a2a'; c.fillRect(-w / 2 + 10, -h * 0.4, 10, h * 0.4); c.fillRect(w / 2 - 20, -h * 0.4, 10, h * 0.4); },
  kennel: (c, w, h) => { c.fillStyle = '#b97a4e'; c.fillRect(-w / 2, -h * 0.66, w, h * 0.66); c.beginPath(); c.moveTo(-w / 2 - 8, -h * 0.64); c.lineTo(0, -h); c.lineTo(w / 2 + 8, -h * 0.64); c.closePath(); c.fillStyle = '#c9384f'; c.fill(); c.beginPath(); c.arc(0, 0, w * 0.2, Math.PI, 0); c.fillStyle = '#3a2a2a'; c.fill(); },
  flowerpot: (c, w, h) => { rr(c, -w * 0.35, -h * 0.5, w * 0.7, h * 0.5, 5, '#c96f5a'); for (let i = 0; i < 5; i++) circ(c, (i - 2) * w * 0.18, -h * 0.62 - (i % 2) * 8, w * 0.14, ['#ff6b8b', '#ffd23f', '#a98bf0', '#fff', '#ff9fb8'][i]); },
  sandbox: (c, w, h) => { rr(c, -w / 2, -h, w, h, 8, '#b97a4e'); rr(c, -w / 2 + 8, -h + 5, w - 16, h - 10, 6, '#f2d49b'); },
  ball: (c, w, h) => { circ(c, 0, -h / 2, w / 2, '#e0474c'); c.strokeStyle = '#fff'; c.lineWidth = Math.max(3, w * 0.12); c.beginPath(); c.arc(0, -h / 2, w * 0.3, 0.4, 2.6); c.stroke(); },
  yarn: (c, w, h) => { circ(c, 0, -h / 2, w / 2, '#b58ae0'); c.strokeStyle = '#8f63c8'; c.lineWidth = 3; for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(0, -h / 2, w * (0.15 + i * 0.1), i, i + 2.4); c.stroke(); } },
  squeaky: (c, w, h) => { c.beginPath(); c.ellipse(0, -h * 0.45, w / 2, h * 0.45, 0, 0, 7); c.fillStyle = '#ffd23f'; c.fill(); circ(c, w * 0.22, -h * 0.62, w * 0.08, '#3b2a33'); c.beginPath(); c.moveTo(w * 0.45, -h * 0.45); c.lineTo(w * 0.7, -h * 0.4); c.lineTo(w * 0.45, -h * 0.3); c.fillStyle = '#ff8a2a'; c.fill(); },
  plush: (c, w, h) => { circ(c, 0, -h * 0.35, w * 0.4, '#f2a65a'); circ(c, 0, -h * 0.78, w * 0.3, '#f2a65a'); circ(c, -w * 0.22, -h * 1.02, w * 0.1, '#d98639'); circ(c, w * 0.22, -h * 1.02, w * 0.1, '#d98639'); circ(c, -w * 0.1, -h * 0.8, 3, '#3b2a33'); circ(c, w * 0.1, -h * 0.8, 3, '#3b2a33'); },
};
/** Draw one placement at (px, py) = its foot line, box w × h px. */
export function drawFurniture(c, obj, px, py, w, h, rot = 0, opts = {}) {
  const f = DRAW[obj]; if (!f) return;
  c.save(); c.translate(px, py);
  if (rot === 180) c.scale(-1, 1);
  if (rot === 90 || rot === 270) { c.scale(rot === 90 ? 0.6 : -0.6, 1); }
  if (!['rug', 'sandbox', 'picture', 'clock'].includes(obj) && !opts.noShadow) { c.fillStyle = 'rgba(0,0,0,.12)'; c.beginPath(); c.ellipse(0, 2, w * 0.5, Math.max(6, h * 0.08), 0, 0, 7); c.fill(); }
  f(c, w, h);
  if (rot === 90 || rot === 270) { c.fillStyle = 'rgba(40,20,30,.12)'; c.fillRect(-w / 2, -h, w / 2, h); }   // the turned side reads as a side face
  c.restore();
  if (opts.selected || opts.ghost) { c.save(); c.setLineDash([12, 8]); c.lineWidth = 5; c.strokeStyle = opts.selected ? '#ff6b8b' : 'rgba(255,255,255,.8)'; c.strokeRect(px - w / 2 - 8, py - h - 8, w + 16, h + 16); c.restore(); }
}
export const hasArt = obj => !!DRAW[obj];
