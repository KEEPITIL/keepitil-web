/* Shared art + UI kit for the four weekly games (C1.4): cached layers, gradients,
   toasts, the first-entry paw legend and small HUD pieces, so Race, Dance, Flight
   and Switch share one visual language with the board. */
import { PAW_MODES, PAW_ROLES } from './config.js';

export const TAU = Math.PI * 2;
const cache = {};
export function layer(key, w, h, paint) { if (cache[key]) return cache[key]; const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2; const x = c.getContext('2d'); x.scale(2, 2); paint(x, w, h); return (cache[key] = { c, w, h }); }
export const lg = (x, x0, y0, x1, y1, st) => { const g = x.createLinearGradient(x0, y0, x1, y1); st.forEach((c, i) => g.addColorStop(i / (st.length - 1), c)); return g; };
export const shadeC = (hex, k) => { const n = parseInt(hex.slice(1), 16); let r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255; const f = k < 0 ? 0 : 255, p = Math.abs(k); return `rgb(${Math.round((f - r) * p + r)},${Math.round((f - g) * p + g)},${Math.round((f - b) * p + b)})`; };
export function blob(x, cx, cy, r, c) { const g = x.createRadialGradient(cx - r * 0.4, cy - r * 0.5, r * 0.1, cx, cy, r * 1.1); g.addColorStop(0, shadeC(c, 0.35)); g.addColorStop(0.6, c); g.addColorStop(1, shadeC(c, -0.3)); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill(); }
export function repeatX(ctx, L, off, y, W, sc = 1) { const w = L.w * sc; const x0 = -((off % w) + w) % w; for (let x = x0; x < W; x += w) ctx.drawImage(L.c, x, y, w, L.h * sc); }
export function star(ctx, x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); }
export const SAT = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0;
export const ORD = n => n + ['st', 'nd', 'rd', 'th'][Math.min(3, n - 1)];

/* pill: rounded label with the board's white sticker border */
export function pill(ctx, cx, cy, text, bg = 'rgba(43,35,80,.85)', fg = '#fff', size = 12) {
  ctx.font = `900 ${size}px system-ui`; const tw = ctx.measureText(text).width + size * 1.6, h = size + 12;
  ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(cx - tw / 2, cy - h / 2, tw, h, h / 2); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.stroke();
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, cx, cy + 1); ctx.textBaseline = 'alphabetic';
}
export function bigText(ctx, text, x, y, size, fill = '#fff', stroke = '#2b2350') { ctx.font = `900 ${size}px system-ui`; ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.lineWidth = size / 7; ctx.strokeStyle = stroke; ctx.strokeText(text, x, y); ctx.fillStyle = fill; ctx.fillText(text, x, y); }

/* toasts: short, stacked, never blocking */
export function toaster() {
  let cues = [];
  return {
    push(text, c = '#8f7fe8') { cues.push({ text, c, t0: performance.now() }); if (cues.length > 3) cues.shift(); },
    draw(ctx, W, y0) { const now = performance.now(); cues = cues.filter(c => now - c.t0 < 1800); cues.forEach((c, i) => { ctx.globalAlpha = Math.min(1, (1800 - (now - c.t0)) / 300); pill(ctx, W / 2, y0 - i * 30, c.text, c.c, '#fff', 12); ctx.globalAlpha = 1; }); },
    clear() { cues = []; },
  };
}
/* First-entry legend: what each of the five pads does in this mode, laid out like the paw. */
const seen = new Set();
export function legendDue(mode) { if (seen.has(mode)) return false; seen.add(mode); return true; }
export function drawLegend(ctx, W, H, mode, a = 1) {
  const m = PAW_MODES[mode]; if (!m || a <= 0) return;
  ctx.save(); ctx.globalAlpha = a;
  const w = Math.min(W - 24, 330), h = 150, x = (W - w) / 2, y = H * 0.18;
  ctx.fillStyle = 'rgba(255,250,242,.96)'; ctx.beginPath(); ctx.roundRect(x, y, w, h, 20); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.fillStyle = '#3b2d4f'; ctx.font = '900 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText('YOUR PAW IN THIS GAME', W / 2, y + 22);
  const pos = { left: [0.14, 0.62], upLeft: [0.34, 0.38], upRight: [0.66, 0.38], right: [0.86, 0.62], center: [0.5, 0.74] };
  for (const r of PAW_ROLES) { const [px, py] = pos[r], cx = x + w * px, cy = y + h * py, big = r === 'center';
    ctx.fillStyle = big ? '#ff6b8b' : '#ff8aa6'; ctx.beginPath(); ctx.ellipse(cx, cy, big ? 34 : 24, big ? 22 : 18, 0, 0, TAU); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `900 ${big ? 15 : 13}px system-ui`; ctx.fillText(m[r].icon || '', cx, cy - 1); ctx.font = '900 9px system-ui'; ctx.fillText(m[r].label, cx, cy + 12); }
  ctx.restore();
}
