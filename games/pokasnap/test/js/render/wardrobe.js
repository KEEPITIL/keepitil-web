/* WARDROBE RENDERER (1.3) — procedural art for the expanded catalog.
   ---------------------------------------------------------------------------
   Same conventions as render/items.js: each draw fn works in anchor space
   (origin at the anchor, pet head radius ~115 units) so every piece fits every
   pet in every pose. Garments use one body-hugging silhouette per style plus a
   pattern, clipped to the garment so patterns never spill onto fur.
   Props, backgrounds, filters/effects and frames draw at their own origins. */

export function dk(hex, a = 0.25) {
  const n = parseInt(hex.slice(1), 16), f = v => Math.max(0, Math.round(v * (1 - a)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
export function lt(hex, a = 0.4) {
  const n = parseInt(hex.slice(1), 16), f = v => Math.min(255, Math.round(v + (255 - v) * a));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
function of(ctx, fill, stroke, lw = 4) { ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.stroke(); }
function star(ctx, x, y, r, col, pts = 5) { ctx.beginPath(); for (let j = 0; j < pts * 2; j++) { const rr = j % 2 ? r * 0.45 : r, a = -Math.PI / 2 + j * Math.PI / pts; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); ctx.fillStyle = col; ctx.fill(); }
function heart(ctx, x, y, s, col) { ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.beginPath(); ctx.moveTo(0, 6); ctx.bezierCurveTo(-14, -6, -8, -18, 0, -9); ctx.bezierCurveTo(8, -18, 14, -6, 0, 6); ctx.fillStyle = col; ctx.fill(); ctx.restore(); }
function circ(ctx, x, y, r, col) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); }

/* ------------------------------------------------------------- patterns -- */
function pattern(ctx, it, box) {
  const { x0, y0, x1, y1 } = box, c = it.trim, w = x1 - x0, h = y1 - y0;
  ctx.save(); ctx.globalAlpha = 0.9;
  switch (it.pattern) {
    case 'stripes': ctx.fillStyle = c; for (let y = y0 + 8; y < y1; y += 26) ctx.fillRect(x0, y, w, 10); break;
    case 'stripe2': ctx.fillStyle = c; ctx.fillRect(-14, y0, 10, h); ctx.fillRect(4, y0, 10, h); break;
    case 'zigzag': ctx.strokeStyle = c; ctx.lineWidth = 7; for (let y = y0 + 16; y < y1; y += 30) { ctx.beginPath(); for (let x = x0, k = 0; x <= x1; x += 16, k++) ctx.lineTo(x, y + (k % 2 ? 8 : -8)); ctx.stroke(); } break;
    case 'dots': case 'berry': case 'seed': for (let y = y0 + 12, r = 0; y < y1; y += 24, r++) for (let x = x0 + (r % 2 ? 12 : 0); x < x1; x += 26) {
      if (it.pattern === 'berry') { heart(ctx, x, y, 0.7, c); circ(ctx, x, y - 6, 2, '#3f9a5b'); } else if (it.pattern === 'seed') { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, 3, 5, 0, 0, 7); ctx.fill(); } else circ(ctx, x, y, 5, c); } break;
    case 'snow': for (let y = y0 + 14, r = 0; y < y1; y += 30, r++) for (let x = x0 + (r % 2 ? 14 : 0); x < x1; x += 32) { ctx.strokeStyle = c; ctx.lineWidth = 3; for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3; ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * 7, y - Math.sin(a) * 7); ctx.lineTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7); ctx.stroke(); } } break;
    case 'stars': for (let i = 0; i < 14; i++) star(ctx, x0 + ((i * 37) % w), y0 + ((i * 53) % h), 5 + (i % 3) * 2, c); break;
    case 'aurora': { const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, '#53d3a2'); g.addColorStop(0.5, '#5ec8f2'); g.addColorStop(1, '#a98bf0'); ctx.fillStyle = g; ctx.fillRect(x0, y0, w, h); for (let i = 0; i < 8; i++) star(ctx, x0 + ((i * 41) % w), y0 + ((i * 29) % h), 4, '#ffffff'); break; }
    case 'plaid': case 'gingham': ctx.fillStyle = it.pattern === 'plaid' ? 'rgba(0,0,0,.28)' : lt(c, 0.1); ctx.globalAlpha = 0.45;
      for (let x = x0; x < x1; x += 24) ctx.fillRect(x, y0, 10, h); for (let y = y0; y < y1; y += 24) ctx.fillRect(x0, y, w, 10); break;
    case 'quilt': ctx.strokeStyle = dk(it.color, 0.15); ctx.lineWidth = 3; for (let y = y0 + 18; y < y1; y += 22) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); } break;
    case 'stitch': ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(0, y1); ctx.stroke(); ctx.setLineDash([]); break;
    case 'clouds': for (let i = 0; i < 6; i++) { const x = x0 + ((i * 47) % w), y = y0 + 16 + ((i * 31) % (h - 20)); for (const [dx, r] of [[-8, 7], [0, 10], [9, 7]]) circ(ctx, x + dx, y, r, c); } break;
    case 'moon': for (let i = 0; i < 5; i++) { const x = x0 + 20 + ((i * 43) % (w - 30)), y = y0 + 16 + ((i * 37) % (h - 20)); circ(ctx, x, y, 8, c); circ(ctx, x + 4, y - 3, 7, it.color); } break;
    case 'heart': heart(ctx, 0, y0 + h * 0.4, 2.2, c); break;
    case 'star': star(ctx, 0, y0 + h * 0.38, 22, c); break;
    case 'lemon': ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, y0 + h * 0.38, 20, 15, 0.3, 0, 7); ctx.fill(); break;
    case 'logo': ctx.fillStyle = c; ctx.font = '900 22px system-ui'; ctx.textAlign = 'center'; ctx.fillText('Poka', 0, y0 + h * 0.36); ctx.fillStyle = '#2fa4d6'; ctx.fillText('Snap', 0, y0 + h * 0.36 + 22); break;
    case 'num': ctx.fillStyle = c; ctx.font = '900 40px system-ui'; ctx.textAlign = 'center'; ctx.fillText(String(7 + (it.name.length % 20)), 0, y0 + h * 0.48); break;
    case 'ringer': ctx.fillStyle = c; ctx.fillRect(x0, y0, w, 12); ctx.fillRect(x0, y1 - 14, w, 14); break;
    case 'spikes': ctx.fillStyle = c; for (let y = y0 + 10; y < y1 - 6; y += 22) { ctx.beginPath(); ctx.moveTo(-10, y); ctx.lineTo(0, y - 14); ctx.lineTo(10, y); ctx.fill(); } break;
    case 'bolt': ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(6, y0 + 12); ctx.lineTo(-14, y0 + h * 0.45); ctx.lineTo(0, y0 + h * 0.45); ctx.lineTo(-8, y1 - 10); ctx.lineTo(16, y0 + h * 0.35); ctx.lineTo(2, y0 + h * 0.35); ctx.closePath(); ctx.fill(); break;
    case 'trim': ctx.fillStyle = c; ctx.fillRect(x0, y1 - 14, w, 14); for (let x = x0 + 10; x < x1; x += 22) circ(ctx, x, y1 - 7, 3, '#ffffff'); break;
    case 'leaves': for (let i = 0; i < 8; i++) { const x = x0 + ((i * 37) % w), y = y0 + ((i * 23) % h); ctx.save(); ctx.translate(x, y); ctx.rotate(i); ctx.beginPath(); ctx.ellipse(0, 0, 9, 5, 0, 0, 7); ctx.fillStyle = [c, '#e8812f', '#c9384f'][i % 3]; ctx.fill(); ctx.restore(); } break;
    case 'bats': ctx.fillStyle = c; for (let i = 0; i < 5; i++) { const x = x0 + 20 + ((i * 41) % (w - 30)), y = y0 + 20 + ((i * 29) % (h - 30)); ctx.beginPath(); ctx.moveTo(x - 12, y); ctx.quadraticCurveTo(x - 6, y - 8, x, y); ctx.quadraticCurveTo(x + 6, y - 8, x + 12, y); ctx.quadraticCurveTo(x, y + 6, x - 12, y); ctx.fill(); } break;
    case 'buttons': for (const y of [y0 + h * 0.3, y0 + h * 0.52]) circ(ctx, 0, y, 5, c); break;
    case 'splat': for (let i = 0; i < 7; i++) circ(ctx, x0 + ((i * 43) % w), y0 + ((i * 31) % h), 4 + (i % 3) * 3, ['#ff6b8b', '#5ec8f2', '#ffd84a', '#53d3a2'][i % 4]); break;
    case 'pockets': ctx.fillStyle = dk(it.color, 0.12); ctx.strokeStyle = dk(it.color, 0.35); ctx.lineWidth = 3;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.roundRect(s * 34 - 14, y0 + h * 0.42, 28, 24, 5); ctx.fill(); ctx.stroke(); ctx.fillStyle = c; ctx.fillRect(s * 34 - 14, y0 + h * 0.42, 28, 6); ctx.fillStyle = dk(it.color, 0.12); } break;
    case 'lens': circ(ctx, 0, y0 + h * 0.4, 18, '#1f2230'); circ(ctx, 0, y0 + h * 0.4, 11, '#5ec8f2'); circ(ctx, -4, y0 + h * 0.4 - 4, 4, '#ffffff'); break;
  }
  ctx.restore();
}

function garment(ctx, it, A, { top = -0.62, hem = 0.72, inflate = 1.05, neck = 'round', sleeves = false } = {}) {
  const rx = A.rx * inflate, ry = A.ry * inflate, y0 = ry * top, y1 = ry * hem;
  ctx.save();
  ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.clip();
  ctx.beginPath(); ctx.rect(-rx - 4, y0, rx * 2 + 8, y1 - y0);
  if (neck === 'v') { ctx.moveTo(-24, y0); ctx.lineTo(0, y0 + 40); ctx.lineTo(24, y0); }
  ctx.fillStyle = it.color; ctx.fill('evenodd');
  ctx.save(); ctx.clip('evenodd'); pattern(ctx, it, { x0: -rx, y0, x1: rx, y1 }); ctx.restore();
  ctx.restore();
  // outline of the garment edge
  ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.clip();
  ctx.strokeStyle = dk(it.color, 0.38); ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(-rx, y0); ctx.lineTo(rx, y0); ctx.moveTo(-rx, y1); ctx.lineTo(rx, y1); ctx.stroke();
  ctx.restore();
  ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, Math.asin(Math.max(-1, Math.min(1, y1 / ry))) , Math.PI - Math.asin(Math.max(-1, Math.min(1, y1 / ry))), true);
  ctx.strokeStyle = dk(it.color, 0.38); ctx.lineWidth = 5; ctx.stroke();
  if (sleeves) for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * rx * 0.86, y0 + 26, 20, 24, s * 0.5, 0, 7); of(ctx, it.color, dk(it.color, 0.38), 4); }
  return { rx, ry, y0, y1 };
}

export const WEAR = {
  /* ---------------- BODY ---------------- */
  sweater(ctx, it, A) { const g = garment(ctx, it, A, { top: -0.6, hem: 0.66, sleeves: true });
    ctx.fillStyle = dk(it.color, 0.12); ctx.fillRect(-g.rx * 0.7, g.y1 - 14, g.rx * 1.4, 14);
    ctx.beginPath(); ctx.roundRect(-34, g.y0 - 8, 68, 18, 9); of(ctx, dk(it.color, 0.08), dk(it.color, 0.38), 4); },
  vest(ctx, it, A) { const g = garment(ctx, it, A, { top: -0.58, hem: 0.6, neck: 'v' });
    for (const s of [-1, 1]) circ(ctx, s * 6, g.y0 + 58, 4, it.trim); },
  tee(ctx, it, A) { const g = garment(ctx, it, A, { top: -0.6, hem: 0.42, sleeves: true });
    ctx.beginPath(); ctx.ellipse(0, g.y0, 26, 10, 0, 0, Math.PI); of(ctx, lt(it.color, 0.3), dk(it.color, 0.38), 3); },
  jersey(ctx, it, A) { const g = garment(ctx, it, A, { top: -0.6, hem: 0.5, neck: 'v', sleeves: true });
    ctx.strokeStyle = it.trim; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-24, g.y0); ctx.lineTo(0, g.y0 + 40); ctx.lineTo(24, g.y0); ctx.stroke(); },
  pajamas(ctx, it, A) { const g = garment(ctx, it, A, { top: -0.58, hem: 0.8, sleeves: true });
    ctx.fillStyle = lt(it.color, 0.4); for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, g.y0); ctx.lineTo(s * 30, g.y0 - 4); ctx.lineTo(s * 16, g.y0 + 22); ctx.closePath(); of(ctx, lt(it.color, 0.4), dk(it.color, 0.38), 3); }
    for (let y = g.y0 + 30; y < g.y1 - 10; y += 22) circ(ctx, 0, y, 4, it.trim); },
  cape(ctx, it, A) { const rx = A.rx, ry = A.ry;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 26, -ry * 0.62); ctx.quadraticCurveTo(s * rx * 1.5, -ry * 0.1, s * rx * 1.25, ry * 0.95); ctx.quadraticCurveTo(s * rx * 1.0, ry * 1.05, s * rx * 0.8, ry * 0.8); ctx.quadraticCurveTo(s * rx * 0.9, 0, s * 20, -ry * 0.5); ctx.closePath();
      ctx.save(); ctx.fillStyle = it.color; ctx.fill(); ctx.clip(); pattern(ctx, { ...it, pattern: it.pattern === 'bolt' ? 'trim' : it.pattern }, { x0: s < 0 ? -rx * 1.5 : 0, y0: -ry, x1: s < 0 ? 0 : rx * 1.5, y1: ry * 1.1 }); ctx.restore();
      ctx.lineWidth = 5; ctx.strokeStyle = dk(it.color, 0.4); ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(0, -ry * 0.6, 40, 14, 0, 0, Math.PI * 2); of(ctx, it.color, dk(it.color, 0.4), 4);
    circ(ctx, 0, -ry * 0.56, 10, it.trim); if (it.pattern === 'bolt') star(ctx, 0, -ry * 0.56, 8, '#ffffff'); if (it.pattern === 'lens') { circ(ctx, 0, -ry * 0.56, 7, '#1f2230'); circ(ctx, 0, -ry * 0.56, 4, '#5ec8f2'); } },
  overalls(ctx, it, A) { const rx = A.rx * 1.04, ry = A.ry * 1.04;
    ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 7); ctx.clip();
    ctx.beginPath(); ctx.rect(-rx, ry * 0.05, rx * 2, ry); ctx.fillStyle = it.color; ctx.fill(); ctx.save(); ctx.clip(); pattern(ctx, it, { x0: -rx, y0: ry * 0.05, x1: rx, y1: ry }); ctx.restore(); ctx.restore();
    ctx.beginPath(); ctx.roundRect(-30, -ry * 0.35, 60, ry * 0.45, 8); of(ctx, it.color, dk(it.color, 0.38), 4);
    ctx.strokeStyle = dk(it.color, 0.2); ctx.lineWidth = 9; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 24, -ry * 0.33); ctx.lineTo(s * 36, -ry * 0.66); ctx.stroke(); circ(ctx, s * 22, -ry * 0.3, 5, it.trim); }
    ctx.beginPath(); ctx.roundRect(-14, -ry * 0.22, 28, 18, 4); of(ctx, dk(it.color, 0.12), dk(it.color, 0.38), 3); },

  /* ---------------- HEAD (origin = crown) ---------------- */
  bow(ctx, it, A) { if (!A.thumb) ctx.translate(A.hR * 0.45, 10); ctx.rotate(0.25);
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(s * 20, -34, s * 56, -24, s * 50, 0); ctx.bezierCurveTo(s * 56, 24, s * 20, 34, 0, 0); of(ctx, it.color, dk(it.color, 0.35), 4); if (/Polka/.test(it.name)) for (const [x, y] of [[20, -8], [34, 6], [26, 14]]) circ(ctx, s * x, y, 4, it.trim); }
    ctx.beginPath(); ctx.ellipse(0, 0, 11, 13, 0, 0, 7); of(ctx, dk(it.color, 0.1), it.trim, 3); },
  flowercrown(ctx, it) { for (let i = 0; i < 7; i++) { const a = Math.PI + (i + 0.5) * Math.PI / 7, x = Math.cos(a) * 74, y = Math.sin(a) * 26 + 10;
      ctx.save(); ctx.translate(x, y); for (let k = 0; k < 5; k++) { const b = k * 1.26; ctx.beginPath(); ctx.ellipse(Math.cos(b) * 8, Math.sin(b) * 8, 7, 5, b, 0, 7); of(ctx, i % 2 ? it.color : lt(it.color, 0.5), dk(it.color, 0.3), 1.5); } circ(ctx, 0, 0, 5, '#ffd84a'); ctx.restore();
      if (i < 6) { ctx.save(); ctx.translate(x + 10, y - 4); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, 0, 9, 4, 0, 0, 7); ctx.fillStyle = it.trim; ctx.fill(); ctx.restore(); } } },
  tophat(ctx, it) { ctx.beginPath(); ctx.ellipse(0, 22, 74, 14, 0, 0, 7); of(ctx, it.color, dk(it.color, 0.5), 5);
    ctx.beginPath(); ctx.roundRect(-44, -76, 88, 100, 8); of(ctx, it.color, dk(it.color, 0.5), 5); ctx.fillStyle = it.trim; ctx.fillRect(-44, 0, 88, 14);
    ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(-34, -68, 10, 64); },
  beret(ctx, it) { ctx.rotate(-0.18); ctx.beginPath(); ctx.ellipse(0, -2, 82, 34, 0, 0, 7); of(ctx, it.color, dk(it.color, 0.4), 5);
    ctx.beginPath(); ctx.roundRect(-8, -48, 16, 16, 5); of(ctx, dk(it.color, 0.2), dk(it.color, 0.4), 3); ctx.beginPath(); ctx.ellipse(0, 26, 58, 9, 0, 0, 7); of(ctx, it.trim, dk(it.color, 0.4), 3); },
  wizard(ctx, it) { ctx.beginPath(); ctx.ellipse(0, 22, 80, 15, 0, 0, 7); of(ctx, it.color, dk(it.color, 0.45), 5);
    ctx.beginPath(); ctx.moveTo(-50, 22); ctx.quadraticCurveTo(-10, -60, 26, -118); ctx.quadraticCurveTo(12, -40, 50, 22); ctx.closePath(); of(ctx, it.color, dk(it.color, 0.45), 5);
    for (const [x, y, r] of [[-12, -10, 9], [10, -50, 7], [-22, 8, 6]]) star(ctx, x, y, r, it.trim); },
  helmet(ctx, it) { ctx.beginPath(); ctx.moveTo(-84, 26); ctx.bezierCurveTo(-78, -76, 78, -76, 84, 26); ctx.closePath(); of(ctx, it.color, dk(it.color, 0.4), 5);
    ctx.beginPath(); ctx.ellipse(0, 26, 90, 14, 0, 0, 7); of(ctx, dk(it.color, 0.1), dk(it.color, 0.4), 4); ctx.fillStyle = it.trim; ctx.fillRect(-80, 4, 160, 10);
    if (/Spelunker/.test(it.name)) { circ(ctx, 0, -30, 16, '#fff6c9'); circ(ctx, 0, -30, 10, '#ffffff'); } },
  sunhat(ctx, it) { ctx.beginPath(); ctx.ellipse(0, 20, 118, 26, 0, 0, 7); of(ctx, it.color, dk(it.color, 0.35), 5);
    ctx.beginPath(); ctx.moveTo(-58, 20); ctx.bezierCurveTo(-54, -54, 54, -54, 58, 20); of(ctx, it.color, dk(it.color, 0.35), 5); ctx.fillStyle = it.trim; ctx.fillRect(-58, 2, 116, 12);
    heart(ctx, 44, 6, 1.1, it.trim); },
  antlers(ctx, it) { ctx.strokeStyle = it.color; ctx.lineCap = 'round'; ctx.lineWidth = 12;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 42, 16); ctx.quadraticCurveTo(s * 56, -40, s * 88, -64); ctx.moveTo(s * 58, -26); ctx.lineTo(s * 90, -30); ctx.moveTo(s * 70, -48); ctx.lineTo(s * 70, -80); ctx.stroke(); }
    if (/Glow/.test(it.name)) for (const s of [-1, 1]) for (const [x, y] of [[88, -64], [90, -30], [70, -80]]) circ(ctx, s * x, y, 6, '#fff6c9'); else circ(ctx, 0, 30, 0.01, it.trim); },
  halo(ctx, it) { ctx.save(); ctx.translate(0, -50); ctx.shadowColor = it.color; ctx.shadowBlur = 18; ctx.lineWidth = 12;
    if (/Rainbow/.test(it.name)) { const g = ctx.createLinearGradient(-60, 0, 60, 0); for (const [k, c] of [[0, '#ff6b8b'], [0.3, '#ffd84a'], [0.6, '#53d3a2'], [1, '#a98bf0']]) g.addColorStop(k, c); ctx.strokeStyle = g; } else ctx.strokeStyle = it.color;
    ctx.beginPath(); ctx.ellipse(0, 0, 62, 16, 0, 0, 7); ctx.stroke(); ctx.restore(); },
  headphones(ctx, it) { ctx.strokeStyle = it.color; ctx.lineWidth = 14; ctx.beginPath(); ctx.arc(0, 40, 100, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.roundRect(s * 100 - 20, 34, 40, 56, 16); of(ctx, it.color, dk(it.color, 0.4), 4); ctx.beginPath(); ctx.roundRect(s * 100 - 12, 44, 24, 36, 10); ctx.fillStyle = it.trim; ctx.fill(); } },
  chefhat(ctx, it) { ctx.beginPath(); ctx.roundRect(-52, -10, 104, 36, 8); of(ctx, it.color, '#cfc8bc', 4);
    for (const [x, y, r] of [[-38, -32, 30], [0, -52, 36], [38, -32, 30]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); of(ctx, it.color, '#cfc8bc', 4); } ctx.fillStyle = it.color; ctx.fillRect(-48, -30, 96, 34); },
  visor(ctx, it) { ctx.beginPath(); ctx.roundRect(-80, 4, 160, 22, 11); of(ctx, it.trim, dk(it.trim, 0.4), 4); ctx.beginPath(); ctx.ellipse(34, 26, 70, 14, -0.05, 0, Math.PI); of(ctx, it.color, dk(it.color, 0.4), 4); },
  captain(ctx, it) { ctx.beginPath(); ctx.ellipse(0, -18, 84, 30, 0, 0, 7); of(ctx, it.trim, '#cfc8bc', 5); ctx.beginPath(); ctx.roundRect(-70, -10, 140, 34, 8); of(ctx, it.color, dk(it.color, 0.5), 5);
    ctx.beginPath(); ctx.ellipse(28, 26, 60, 12, 0, 0, Math.PI); of(ctx, it.color, dk(it.color, 0.5), 4); star(ctx, 0, 6, 10, '#ffd84a'); },

  /* ---------------- NECK / FACE / BACK ---------------- */
  bell(ctx, it, A) { const w = A.w * 0.5; ctx.beginPath(); ctx.moveTo(-w, -10); ctx.quadraticCurveTo(0, 22, w, -10); ctx.lineTo(w, 2); ctx.quadraticCurveTo(0, 36, -w, 2); ctx.closePath(); of(ctx, it.color, dk(it.color, 0.35));
    ctx.beginPath(); ctx.arc(0, 36, 15, 0, 7); of(ctx, it.trim, dk(it.trim, 0.35), 3); ctx.fillStyle = dk(it.trim, 0.45); ctx.fillRect(-10, 36, 20, 3); circ(ctx, 0, 45, 3, dk(it.trim, 0.5)); },
  lei(ctx, it, A) { const w = A.w * 0.52; for (let i = 0; i <= 10; i++) { const t = i / 10, x = -w + t * 2 * w, y = 18 * Math.sin(t * Math.PI) - 4;
      ctx.save(); ctx.translate(x, y); for (let k = 0; k < 5; k++) { const b = k * 1.26; ctx.beginPath(); ctx.ellipse(Math.cos(b) * 7, Math.sin(b) * 7, 6, 4, b, 0, 7); ctx.fillStyle = i % 2 ? it.color : it.trim; ctx.fill(); } circ(ctx, 0, 0, 3, '#fff6c9'); ctx.restore(); } },
  necktie(ctx, it) { ctx.beginPath(); ctx.moveTo(-12, -4); ctx.lineTo(12, -4); ctx.lineTo(8, 10); ctx.lineTo(-8, 10); ctx.closePath(); of(ctx, dk(it.color, 0.1), dk(it.color, 0.4), 3);
    ctx.beginPath(); ctx.moveTo(-8, 10); ctx.lineTo(8, 10); ctx.lineTo(16, 64); ctx.lineTo(0, 80); ctx.lineTo(-16, 64); ctx.closePath(); of(ctx, it.color, dk(it.color, 0.4), 3);
    ctx.strokeStyle = it.trim; ctx.lineWidth = 4; for (const y of [30, 50]) { ctx.beginPath(); ctx.moveTo(-12, y); ctx.lineTo(12, y + 8); ctx.stroke(); } },
  pearls(ctx, it, A) { const w = A.w * 0.5; for (let i = 0; i <= 14; i++) { const t = i / 14; const x = -w + t * 2 * w, y = 22 * Math.sin(t * Math.PI) - 6;
      const g = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, 7); g.addColorStop(0, '#ffffff'); g.addColorStop(1, it.trim); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 6.5, 0, 7); ctx.fill(); } },
  locket(ctx, it, A) { const w = A.w * 0.44; ctx.strokeStyle = it.trim; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-w, -8); ctx.quadraticCurveTo(0, 30, w, -8); ctx.stroke();
    ctx.save(); ctx.translate(0, 34); ctx.scale(1.6, 1.6); heart(ctx, 0, 0, 1.3, it.color); ctx.restore(); circ(ctx, -3, 28, 3, 'rgba(255,255,255,.7)'); },
  roundglasses(ctx, it, A) { const ex = A.hR * 0.4; ctx.lineWidth = 6; ctx.strokeStyle = it.color;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * ex, 0, 30, 0, 7); ctx.fillStyle = 'rgba(223,243,255,.35)'; ctx.fill(); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-ex + 30, -4); ctx.quadraticCurveTo(0, -16, ex - 30, -4); ctx.stroke(); },
  heartglasses(ctx, it, A) { const ex = A.hR * 0.4; for (const s of [-1, 1]) { ctx.save(); ctx.translate(s * ex, 6); ctx.scale(2.8, 2.8); heart(ctx, 0, 0, 1, it.color); ctx.restore(); ctx.save(); ctx.translate(s * ex, 4); ctx.scale(1.9, 1.9); heart(ctx, 0, 0, 1, it.trim); ctx.restore(); }
    ctx.strokeStyle = it.color; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-ex + 26, -6); ctx.lineTo(ex - 26, -6); ctx.stroke(); },
  backpack(ctx, it, A) { const rx = A.rx; ctx.save(); ctx.translate(rx * 0.72, -A.ry * 0.1);
    ctx.beginPath(); ctx.roundRect(-30, -48, 60, 86, 16); of(ctx, it.color, dk(it.color, 0.4), 5); ctx.beginPath(); ctx.roundRect(-22, 0, 44, 30, 8); of(ctx, dk(it.color, 0.12), dk(it.color, 0.4), 3);
    ctx.fillStyle = it.trim; ctx.fillRect(-30, -10, 60, 8); ctx.restore();
    ctx.strokeStyle = dk(it.color, 0.2); ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(-A.rx * 0.2, -A.ry * 0.55); ctx.quadraticCurveTo(A.rx * 0.2, -A.ry * 0.1, A.rx * 0.5, A.ry * 0.2); ctx.stroke(); },
  wings(ctx, it, A) { const y = -A.ry * 0.3;
    for (const s of [-1, 1]) { ctx.save(); ctx.translate(s * A.rx * 0.7, y); ctx.scale(s, 1);
      if (/Butterfly/.test(it.name)) { ctx.beginPath(); ctx.ellipse(36, -26, 40, 30, -0.5, 0, 7); of(ctx, it.color, dk(it.color, 0.35), 4); ctx.beginPath(); ctx.ellipse(30, 22, 26, 20, 0.5, 0, 7); of(ctx, it.trim, dk(it.trim, 0.35), 4); circ(ctx, 40, -28, 8, '#ffffff'); }
      else { for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(28 + k * 10, -10 + k * 14, 42 - k * 8, 14, -0.5 + k * 0.3, 0, 7); of(ctx, it.color, '#cfd8e8', 3); } }
      ctx.restore(); } },
};

/* ----------------------------------------------------------------- props --
   Origin = the prop's centre; ~60 units across. 'held' props are drawn at the
   pet's paw anchor; tossed/placed props are drawn in world space by the camera. */
export const PROPS = {
  prop_ball: (c, it) => { const g = c.createRadialGradient(-10, -12, 4, 0, 0, 30); g.addColorStop(0, lt(it.color, 0.5)); g.addColorStop(1, it.color); c.beginPath(); c.arc(0, 0, 28, 0, 7); of(c, g, dk(it.color, 0.4), 4); c.strokeStyle = it.trim; c.lineWidth = 4; c.beginPath(); c.arc(0, 0, 19, -0.5, 0.8); c.stroke(); },
  prop_yarn: (c, it) => { c.beginPath(); c.arc(0, 0, 28, 0, 7); of(c, it.color, dk(it.color, 0.35), 4); c.strokeStyle = lt(it.color, 0.4); c.lineWidth = 3; for (let k = -2; k <= 2; k++) { c.beginPath(); c.ellipse(0, 0, 26, 10 + Math.abs(k) * 3, k * 0.6, 0, 7); c.stroke(); } c.strokeStyle = it.color; c.lineWidth = 4; c.beginPath(); c.moveTo(20, 18); c.quadraticCurveTo(40, 30, 30, 44); c.stroke(); },
  prop_frisbee: (c, it) => { c.beginPath(); c.ellipse(0, 0, 36, 12, 0, 0, 7); of(c, it.color, dk(it.color, 0.4), 4); c.beginPath(); c.ellipse(0, -2, 22, 6, 0, 0, 7); c.strokeStyle = it.trim; c.lineWidth = 3; c.stroke(); },
  prop_treat: (c, it) => { c.rotate(0.4); c.fillStyle = it.color; c.strokeStyle = it.trim; c.lineWidth = 3; c.beginPath(); c.roundRect(-22, -7, 44, 14, 7); c.fill(); c.stroke(); for (const s of [-1, 1]) for (const v of [-1, 1]) { c.beginPath(); c.arc(s * 22, v * 6, 8, 0, 7); c.fill(); c.stroke(); } },
  prop_toycamera: (c, it) => { c.beginPath(); c.roundRect(-30, -20, 60, 40, 9); of(c, it.color, dk(it.color, 0.4), 4); c.beginPath(); c.arc(4, 2, 14, 0, 7); of(c, it.trim, '#000', 3); circ(c, 4, 2, 7, '#5ec8f2'); circ(c, 1, -1, 3, '#fff'); c.fillStyle = '#ffd84a'; c.fillRect(-24, -26, 14, 8); },
  prop_flower: (c, it) => { c.strokeStyle = it.trim; c.lineWidth = 5; c.beginPath(); c.moveTo(0, 8); c.lineTo(0, 40); c.stroke(); c.beginPath(); c.ellipse(9, 26, 9, 4, -0.5, 0, 7); c.fillStyle = it.trim; c.fill(); for (let k = 0; k < 6; k++) { const a = k * 1.05; c.beginPath(); c.ellipse(Math.cos(a) * 12, Math.sin(a) * 12 - 6, 10, 7, a, 0, 7); of(c, it.color, dk(it.color, 0.3), 2); } circ(c, 0, -6, 7, '#ffd84a'); },
  prop_umbrella: (c, it) => { c.beginPath(); c.moveTo(-42, 0); c.quadraticCurveTo(0, -56, 42, 0); for (let k = 3; k >= -3; k -= 2) c.quadraticCurveTo((k + 1) * 14 - 7, -8, k * 14, 0); c.closePath(); of(c, it.color, dk(it.color, 0.35), 4); c.strokeStyle = '#6b4a2a'; c.lineWidth = 4; c.beginPath(); c.moveTo(0, -30); c.lineTo(0, 38); c.arc(-7, 38, 7, 0, Math.PI); c.stroke(); },
  prop_stick: (c, it) => { c.rotate(-0.3); c.strokeStyle = it.color; c.lineCap = 'round'; c.lineWidth = 9; c.beginPath(); c.moveTo(-36, 0); c.lineTo(36, 0); c.moveTo(8, 0); c.lineTo(22, -14); c.stroke(); c.beginPath(); c.ellipse(24, -18, 7, 4, 0.6, 0, 7); c.fillStyle = '#6fbf73'; c.fill(); },
  prop_bubbles: (c, it) => { c.strokeStyle = it.trim; c.lineWidth = 5; c.beginPath(); c.moveTo(-26, 30); c.lineTo(-6, 4); c.stroke(); c.beginPath(); c.arc(0, -4, 10, 0, 7); c.stroke(); for (const [x, y, r] of [[18, -18, 12], [34, -34, 8], [10, -40, 6]]) { c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = 'rgba(191,232,255,.45)'; c.fill(); c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 2; c.stroke(); } },
  prop_donut: (c, it) => { c.beginPath(); c.arc(0, 0, 28, 0, 7); of(c, it.color, dk(it.color, 0.35), 4); c.beginPath(); c.arc(0, 0, 22, 0, 7); c.fillStyle = it.trim; c.fill(); c.beginPath(); c.arc(0, 0, 9, 0, 7); c.fillStyle = '#fff6ec'; c.fill(); for (let k = 0; k < 10; k++) { const a = k * 0.63; c.fillStyle = ['#fff', '#5ec8f2', '#ffd84a'][k % 3]; c.fillRect(Math.cos(a) * 16 - 2, Math.sin(a) * 16 - 1, 5, 2); } },
  // Homeland furniture: each has its own silhouette (1.4 K1: all three drew as a plush bear).
  obj_couch: (c, it) => { c.beginPath(); c.roundRect(-44, -26, 88, 30, 12); of(c, it.color, dk(it.color, 0.35), 3); c.beginPath(); c.roundRect(-50, -6, 100, 30, 10); of(c, dk(it.color, 0.08), dk(it.color, 0.4), 3);
    for (const s of [-1, 1]) { c.beginPath(); c.roundRect(s * 50 - 8, -14, 16, 38, 8); of(c, it.color, dk(it.color, 0.4), 3); } c.fillStyle = dk(it.color, 0.25); c.fillRect(-2, -2, 4, 24); for (const s of [-1, 1]) { c.fillStyle = '#6b4a2a'; c.fillRect(s * 38 - 3, 24, 6, 8); } },
  obj_pillow: (c, it) => { c.beginPath(); c.moveTo(-34, -20); c.quadraticCurveTo(0, -30, 34, -20); c.quadraticCurveTo(44, 0, 34, 20); c.quadraticCurveTo(0, 30, -34, 20); c.quadraticCurveTo(-44, 0, -34, -20); of(c, it.color, dk(it.color, 0.35), 3);
    for (const [x, y] of [[-34, -20], [34, -20], [34, 20], [-34, 20]]) circ(c, x, y, 4, it.trim); c.strokeStyle = dk(it.color, 0.2); c.lineWidth = 2; c.beginPath(); c.moveTo(-18, 0); c.quadraticCurveTo(0, -6, 18, 0); c.stroke(); },
  obj_blanket: (c, it) => { c.beginPath(); c.moveTo(-46, -8); c.quadraticCurveTo(-20, -22, 4, -10); c.quadraticCurveTo(28, 2, 46, -6); c.lineTo(42, 22); c.quadraticCurveTo(0, 30, -42, 22); c.closePath(); of(c, it.color, dk(it.color, 0.35), 3);
    c.save(); c.clip(); c.strokeStyle = it.trim; c.lineWidth = 5; for (let x = -60; x < 60; x += 16) { c.beginPath(); c.moveTo(x, -30); c.lineTo(x + 20, 34); c.stroke(); } c.restore();
    c.fillStyle = it.trim; for (let x = -40; x <= 40; x += 8) c.fillRect(x, 22, 3, 7); },
  prop_plush: (c, it) => { for (const s of [-1, 1]) circ(c, s * 18, -24, 9, it.color); c.beginPath(); c.arc(0, -6, 22, 0, 7); of(c, it.color, dk(it.color, 0.35), 3); c.beginPath(); c.ellipse(0, 22, 20, 18, 0, 0, 7); of(c, it.color, dk(it.color, 0.35), 3); circ(c, -7, -8, 3, '#2a1a12'); circ(c, 7, -8, 3, '#2a1a12'); c.beginPath(); c.ellipse(0, 0, 9, 6, 0, 0, 7); c.fillStyle = it.trim; c.fill(); circ(c, 0, -1, 2.5, '#2a1a12'); },
  prop_pumpkin: (c, it) => { for (const [x, rx] of [[-16, 18], [16, 18], [0, 20]]) { c.beginPath(); c.ellipse(x, 4, rx, 26, 0, 0, 7); of(c, it.color, dk(it.color, 0.35), 3); } c.strokeStyle = it.trim; c.lineWidth = 6; c.beginPath(); c.moveTo(0, -20); c.quadraticCurveTo(4, -32, 12, -34); c.stroke(); },
  prop_snowball: (c, it) => { const g = c.createRadialGradient(-8, -10, 3, 0, 0, 28); g.addColorStop(0, '#fff'); g.addColorStop(1, it.trim); c.beginPath(); c.arc(0, 0, 26, 0, 7); of(c, g, '#a8cfe8', 3); for (const [x, y] of [[8, -6], [-6, 8], [12, 12]]) circ(c, x, y, 2, '#d8ecff'); },
  prop_feather: (c, it) => { c.rotate(-0.5); c.strokeStyle = '#8a5a3c'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, 40); c.lineTo(0, -30); c.stroke(); c.beginPath(); c.moveTo(0, -38); c.quadraticCurveTo(22, -10, 0, 22); c.quadraticCurveTo(-22, -10, 0, -38); of(c, it.color, dk(it.color, 0.3), 2); c.beginPath(); c.moveTo(0, -20); c.quadraticCurveTo(10, -4, 0, 10); c.quadraticCurveTo(-10, -4, 0, -20); c.fillStyle = it.trim; c.fill(); },
  prop_box: (c, it) => { c.beginPath(); c.moveTo(-32, -10); c.lineTo(32, -10); c.lineTo(28, 30); c.lineTo(-28, 30); c.closePath(); of(c, it.color, it.trim, 4); for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 32, -10); c.lineTo(s * 44, -26); c.lineTo(s * 8, -26); c.lineTo(0, -10); c.closePath(); of(c, lt(it.color, 0.15), it.trim, 3); } c.strokeStyle = it.trim; c.lineWidth = 2; c.beginPath(); c.moveTo(-10, 4); c.lineTo(10, 4); c.stroke(); },
  prop_mouse: (c, it) => { c.beginPath(); c.ellipse(0, 0, 28, 17, 0, 0, 7); of(c, it.color, dk(it.color, 0.35), 3); circ(c, -18, -14, 8, it.trim); circ(c, -26, -2, 3, '#2a1a12'); c.strokeStyle = it.trim; c.lineWidth = 3; c.beginPath(); c.moveTo(26, 2); c.quadraticCurveTo(44, -6, 46, 12); c.stroke(); },
  prop_squeaky: (c, it) => { c.beginPath(); c.ellipse(4, 10, 28, 18, 0, 0, 7); of(c, it.color, dk(it.color, 0.3), 3); c.beginPath(); c.arc(-10, -12, 15, 0, 7); of(c, it.color, dk(it.color, 0.3), 3); c.beginPath(); c.moveTo(-24, -12); c.lineTo(-36, -8); c.lineTo(-24, -4); c.closePath(); of(c, it.trim, dk(it.trim, 0.3), 2); circ(c, -12, -16, 3, '#2a1a12'); },
  prop_carrot: (c, it) => { c.rotate(0.5); c.beginPath(); c.moveTo(0, 36); c.quadraticCurveTo(-14, -10, 0, -22); c.quadraticCurveTo(14, -10, 0, 36); of(c, it.color, dk(it.color, 0.3), 3); c.fillStyle = it.trim; for (const a of [-0.5, 0, 0.5]) { c.save(); c.translate(0, -22); c.rotate(a); c.beginPath(); c.ellipse(0, -12, 4, 13, 0, 0, 7); c.fill(); c.restore(); } },
  prop_kite: (c, it) => { c.beginPath(); c.moveTo(0, -40); c.lineTo(26, 0); c.lineTo(0, 40); c.lineTo(-26, 0); c.closePath(); of(c, it.color, dk(it.color, 0.35), 3); c.beginPath(); c.moveTo(0, -40); c.lineTo(0, 40); c.moveTo(-26, 0); c.lineTo(26, 0); c.strokeStyle = it.trim; c.lineWidth = 3; c.stroke(); c.beginPath(); c.moveTo(0, 40); c.quadraticCurveTo(10, 56, -4, 68); c.stroke(); for (const y of [50, 62]) { c.fillStyle = it.trim; c.fillRect(-4, y, 8, 5); } },
  prop_book: (c, it) => { c.beginPath(); c.roundRect(-28, -22, 56, 44, 5); of(c, it.color, dk(it.color, 0.4), 4); c.fillStyle = '#fff6ec'; c.fillRect(-24, 18, 48, 5); star(c, 0, -2, 11, it.trim); },
  prop_guitar: (c, it) => { c.rotate(-0.4); c.beginPath(); c.ellipse(0, 16, 20, 18, 0, 0, 7); c.ellipse(0, -8, 15, 14, 0, 0, 7); of(c, it.color, dk(it.color, 0.4), 3); circ(c, 0, 10, 6, '#2a1a12'); c.fillStyle = it.trim; c.fillRect(-3, -48, 6, 44); c.fillRect(-6, -56, 12, 10); },
  prop_leaf: (c, it) => { c.rotate(0.6); c.beginPath(); c.moveTo(0, 36); c.quadraticCurveTo(-34, 0, 0, -36); c.quadraticCurveTo(34, 0, 0, 36); of(c, it.color, dk(it.color, 0.35), 3); c.strokeStyle = it.trim; c.lineWidth = 2.5; c.beginPath(); c.moveTo(0, 40); c.lineTo(0, -30); for (const y of [-14, 0, 14]) { c.moveTo(0, y); c.lineTo(-12, y - 10); c.moveTo(0, y); c.lineTo(12, y - 10); } c.stroke(); },
  prop_starwand: (c, it) => { c.strokeStyle = it.trim; c.lineWidth = 5; c.beginPath(); c.moveTo(-22, 36); c.lineTo(4, -4); c.stroke(); star(c, 10, -16, 22, it.color); star(c, 10, -16, 10, '#fff6c9'); for (const [x, y] of [[-8, -30], [30, 4], [28, -38]]) star(c, x, y, 4, '#ffffff'); },
  prop_gift: (c, it) => { c.beginPath(); c.roundRect(-26, -14, 52, 42, 5); of(c, it.color, dk(it.color, 0.4), 4); c.fillStyle = it.trim; c.fillRect(-5, -14, 10, 42); c.fillRect(-26, 2, 52, 8); for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 10, -20, 12, 7, s * 0.5, 0, 7); of(c, it.trim, dk(it.trim, 0.3), 2); } },
  prop_icecream: (c, it) => { c.beginPath(); c.moveTo(-16, 0); c.lineTo(0, 40); c.lineTo(16, 0); c.closePath(); of(c, '#e8b465', '#b8864a', 3); c.beginPath(); c.arc(0, -8, 18, 0, 7); of(c, it.color, dk(it.color, 0.3), 3); c.beginPath(); c.arc(-4, -26, 12, 0, 7); of(c, it.trim, dk(it.trim, 0.3), 3); circ(c, 4, -38, 5, '#e0474c'); },
  prop_cupcake: (c, it) => { c.beginPath(); c.moveTo(-22, 4); c.lineTo(22, 4); c.lineTo(16, 32); c.lineTo(-16, 32); c.closePath(); of(c, it.trim, dk(it.trim, 0.3), 3); for (const [x, y, r] of [[-12, -2, 13], [12, -2, 13], [0, -14, 15]]) { c.beginPath(); c.arc(x, y, r, 0, 7); of(c, it.color, dk(it.color, 0.25), 2.5); } circ(c, 0, -30, 6, '#e0474c'); },
  prop_wateringcan: (c, it) => { c.beginPath(); c.roundRect(-24, -16, 44, 38, 8); of(c, it.color, it.trim, 4); c.beginPath(); c.moveTo(18, 0); c.lineTo(46, -22); c.lineTo(50, -16); c.lineTo(20, 12); c.closePath(); of(c, it.color, it.trim, 3); c.strokeStyle = it.trim; c.lineWidth = 5; c.beginPath(); c.arc(-4, -18, 14, Math.PI, 0); c.stroke(); },
  prop_soccer: (c, it) => { c.beginPath(); c.arc(0, 0, 28, 0, 7); of(c, it.color, it.trim, 3); c.fillStyle = it.trim; c.beginPath(); for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * 1.2566; c.lineTo(Math.cos(a) * 10, Math.sin(a) * 10); } c.fill(); for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * 1.2566 + 0.63; circ(c, Math.cos(a) * 23, Math.sin(a) * 23, 6, it.trim); } },
  prop_beachball: (c, it) => { const cols = [it.color, '#ffffff', it.trim, '#ffd84a', '#ffffff', '#53d3a2']; for (let k = 0; k < 6; k++) { c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 28, k * 1.047, (k + 1) * 1.047); c.closePath(); c.fillStyle = cols[k]; c.fill(); } c.beginPath(); c.arc(0, 0, 28, 0, 7); c.strokeStyle = '#b8b8c8'; c.lineWidth = 3; c.stroke(); circ(c, 0, 0, 5, '#ffffff'); },
  prop_shell: (c, it) => { c.beginPath(); c.moveTo(0, 24); for (let k = 0; k <= 8; k++) { const a = Math.PI + k * Math.PI / 8; c.lineTo(Math.cos(a) * 30, Math.sin(a) * 30 + 6); } c.closePath(); of(c, it.color, dk(it.color, 0.3), 3); c.strokeStyle = it.trim; c.lineWidth = 2; for (let k = 1; k < 8; k++) { const a = Math.PI + k * Math.PI / 8; c.beginPath(); c.moveTo(0, 24); c.lineTo(Math.cos(a) * 28, Math.sin(a) * 28 + 6); c.stroke(); } },
  prop_lantern: (c, it) => { c.save(); c.shadowColor = it.trim; c.shadowBlur = 20; c.beginPath(); c.ellipse(0, 4, 24, 30, 0, 0, 7); of(c, it.color, dk(it.color, 0.35), 3); c.restore(); c.strokeStyle = dk(it.color, 0.35); c.lineWidth = 2; for (const x of [-12, 0, 12]) { c.beginPath(); c.ellipse(x * 0.8, 4, 4 + Math.abs(x), 30, 0, 0, 7); c.stroke(); } c.fillStyle = '#3a2a4a'; c.fillRect(-10, -30, 20, 6); c.fillRect(-10, 32, 20, 6); },
  prop_glowstick: (c, it) => { c.save(); c.rotate(0.6); c.shadowColor = it.color; c.shadowBlur = 24; c.beginPath(); c.roundRect(-6, -36, 12, 72, 6); c.fillStyle = it.color; c.fill(); c.restore(); c.save(); c.rotate(0.6); c.fillStyle = it.trim; c.fillRect(-2, -30, 4, 60); c.restore(); },
  prop_pinecone: (c, it) => { for (let r = 0; r < 5; r++) for (let k = -2 + (r % 2) * 0.5; k <= 2; k++) { c.beginPath(); c.ellipse(k * 9, -20 + r * 11, 7, 6, 0, 0, 7); of(c, r % 2 ? it.color : it.trim, dk(it.color, 0.4), 1.5); } },
  prop_goldball: (c, it) => { c.save(); c.shadowColor = '#ffd84a'; c.shadowBlur = 20; const g = c.createRadialGradient(-10, -12, 3, 0, 0, 30); g.addColorStop(0, '#fff6c9'); g.addColorStop(1, it.color); c.beginPath(); c.arc(0, 0, 28, 0, 7); of(c, g, '#c98f0e', 4); c.restore(); star(c, 0, 0, 12, '#fff6c9'); },
  prop_balloon: (c, it) => { c.strokeStyle = '#b8b8c8'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 28); c.quadraticCurveTo(8, 44, -2, 60); c.stroke(); c.beginPath(); c.ellipse(0, -6, 24, 30, 0, 0, 7); of(c, it.color, dk(it.color, 0.35), 3); c.beginPath(); c.moveTo(-4, 24); c.lineTo(4, 24); c.lineTo(0, 30); c.closePath(); c.fillStyle = dk(it.color, 0.2); c.fill(); c.beginPath(); c.ellipse(-8, -16, 5, 9, -0.4, 0, 7); c.fillStyle = 'rgba(255,255,255,.55)'; c.fill(); },
};
export function drawProp(ctx, it, t = 0) { const f = PROPS[it.draw]; if (!f) return false; ctx.save(); f(ctx, it, t); ctx.restore(); return true; }

/* ----------------------------------------------------------- backgrounds -- */
function sky(c, W, H, a, b) { const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, a); g.addColorStop(1, b); c.fillStyle = g; c.fillRect(0, 0, W, H); }
function ground(c, W, H, y, col, curve = 0.06) { c.fillStyle = col; c.beginPath(); c.moveTo(0, H * y); c.quadraticCurveTo(W / 2, H * (y - curve), W, H * y); c.lineTo(W, H); c.lineTo(0, H); c.fill(); }
function tree(c, x, y, s, trunk = '#8a5a3c', leaf = '#5fb84a') { c.fillStyle = trunk; c.fillRect(x - 8 * s, y - 60 * s, 16 * s, 60 * s); for (const [dx, dy, r] of [[0, -90, 40], [-26, -70, 30], [26, -70, 30]]) circ(c, x + dx * s, y + dy * s, r * s, leaf); }
function stars(c, W, H, n = 60) { for (let i = 0; i < n; i++) circ(c, (i * 97) % W, (i * 53) % (H * 0.6), 1 + (i % 3) * 0.7, 'rgba(255,255,255,.85)'); }
export const BACKDROPS = {
  bg_park: (c, W, H) => { sky(c, W, H, '#8fd3ff', '#dff3ff'); circ(c, W * 0.8, H * 0.14, W * 0.08, '#fff8c4'); ground(c, W, H, 0.64, '#9fdc7a'); ground(c, W, H, 0.76, '#7cc85a'); tree(c, W * 0.15, H * 0.66, W / 400); tree(c, W * 0.86, H * 0.66, W / 500); },
  bg_beach: (c, W, H) => { sky(c, W, H, '#7fd0ff', '#e6f7ff'); c.fillStyle = '#3fa9e0'; c.fillRect(0, H * 0.5, W, H * 0.14); c.fillStyle = '#9fe0ff'; for (let x = 0; x < W; x += 40) { c.beginPath(); c.arc(x + 20, H * 0.5, 20, Math.PI, 0); c.fill(); } ground(c, W, H, 0.64, '#f7dfa6', 0.02); circ(c, W * 0.82, H * 0.14, W * 0.07, '#ffe066'); },
  bg_bedroom: (c, W, H) => { sky(c, W, H, '#ffe9f0', '#fff6ec'); c.fillStyle = '#e9d5c0'; c.fillRect(0, H * 0.7, W, H * 0.3); c.fillStyle = '#bfe3ff'; c.fillRect(W * 0.62, H * 0.14, W * 0.28, H * 0.22); c.strokeStyle = '#fff'; c.lineWidth = 8; c.strokeRect(W * 0.62, H * 0.14, W * 0.28, H * 0.22); c.fillStyle = '#a98bf0'; c.beginPath(); c.roundRect(W * 0.04, H * 0.54, W * 0.5, H * 0.18, 16); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.roundRect(W * 0.06, H * 0.5, W * 0.16, H * 0.08, 12); c.fill(); },
  bg_kitchen: (c, W, H) => { sky(c, W, H, '#fff6ec', '#ffeedd'); for (let x = 0; x < W; x += W / 10) for (let y = 0; y < H * 0.5; y += W / 10) { c.fillStyle = ((x + y) / (W / 10)) % 2 ? '#ffffff' : '#e6f4ff'; c.fillRect(x, y, W / 10, W / 10); } c.fillStyle = '#c49a6c'; c.fillRect(0, H * 0.62, W, H * 0.06); c.fillStyle = '#f4e4c1'; c.fillRect(0, H * 0.68, W, H * 0.32); circ(c, W * 0.8, H * 0.58, W * 0.05, '#ff8a2a'); circ(c, W * 0.7, H * 0.59, W * 0.04, '#e0474c'); },
  bg_snowhill: (c, W, H) => { sky(c, W, H, '#bcd7f2', '#eef6ff'); ground(c, W, H, 0.6, '#ffffff', 0.1); for (const x of [0.2, 0.8]) { c.fillStyle = '#3f7f4a'; for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(W * x - 40 + k * 8, H * 0.6 - k * 34); c.lineTo(W * x, H * 0.5 - k * 34); c.lineTo(W * x + 40 - k * 8, H * 0.6 - k * 34); c.fill(); } } for (let i = 0; i < 40; i++) circ(c, (i * 71) % W, (i * 43) % H, 3, '#fff'); },
  bg_forest: (c, W, H) => { sky(c, W, H, '#bfe8c8', '#eaf7e6'); ground(c, W, H, 0.7, '#6fae4a'); for (let i = 0; i < 6; i++) tree(c, W * (0.05 + i * 0.18), H * 0.72, W / (420 + (i % 3) * 80), '#6b4a2a', ['#3f8a3c', '#5fb84a', '#2f7a3c'][i % 3]); c.fillStyle = '#c9a86b'; c.beginPath(); c.moveTo(W * 0.42, H); c.quadraticCurveTo(W * 0.5, H * 0.8, W * 0.46, H * 0.7); c.lineTo(W * 0.54, H * 0.7); c.quadraticCurveTo(W * 0.6, H * 0.8, W * 0.62, H); c.fill(); },
  bg_citynight: (c, W, H) => { sky(c, W, H, '#1b1f4a', '#3a3470'); stars(c, W, H, 40); for (let i = 0; i < 8; i++) { const w = W / 8, h = H * (0.25 + ((i * 37) % 30) / 100); c.fillStyle = ['#2c2f5a', '#262a52', '#30345f'][i % 3]; c.fillRect(i * w, H * 0.72 - h, w - 4, h); for (let y = H * 0.72 - h + 12; y < H * 0.7; y += 20) for (let x = i * w + 8; x < (i + 1) * w - 12; x += 16) if (((x + y) | 0) % 3) { c.fillStyle = '#ffd84a'; c.fillRect(x, y, 7, 9); } } c.fillStyle = '#1a1c38'; c.fillRect(0, H * 0.72, W, H); },
  bg_stage: (c, W, H) => { sky(c, W, H, '#3a1030', '#6b1f4a'); for (const x of [0.25, 0.75]) { const g = c.createRadialGradient(W * x, 0, 10, W * x, H * 0.7, H * 0.7); g.addColorStop(0, 'rgba(255,246,201,.55)'); g.addColorStop(1, 'rgba(255,246,201,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H); } c.fillStyle = '#c9384f'; for (const s of [0, 1]) { c.beginPath(); c.moveTo(s * W, 0); c.quadraticCurveTo(s ? W * 0.82 : W * 0.18, H * 0.4, s * W, H * 0.8); c.fill(); } c.fillStyle = '#8a5a3c'; c.fillRect(0, H * 0.76, W, H); },
  bg_space: (c, W, H) => { sky(c, W, H, '#0b0d26', '#2a1f5a'); stars(c, W, H, 90); circ(c, W * 0.78, H * 0.22, W * 0.1, '#ff9a6b'); c.strokeStyle = 'rgba(255,220,180,.7)'; c.lineWidth = 6; c.beginPath(); c.ellipse(W * 0.78, H * 0.22, W * 0.16, W * 0.04, -0.3, 0, 7); c.stroke(); ground(c, W, H, 0.76, '#8f8c9c', 0.04); for (const [x, r] of [[0.2, 30], [0.6, 18], [0.85, 24]]) { c.beginPath(); c.ellipse(W * x, H * 0.84, r, r * 0.4, 0, 0, 7); c.fillStyle = '#716e7e'; c.fill(); } },
  bg_rainbow: (c, W, H) => { sky(c, W, H, '#bfe6ff', '#fff6ec'); ['#ff6b8b', '#ffa94d', '#ffd84a', '#53d3a2', '#5ec8f2', '#a98bf0'].forEach((col, k) => { c.strokeStyle = col; c.lineWidth = W * 0.035; c.beginPath(); c.arc(W / 2, H * 0.72, W * 0.42 - k * W * 0.035, Math.PI, 0); c.stroke(); }); for (const x of [0.12, 0.88]) for (const [dx, r] of [[-30, 30], [0, 40], [30, 30]]) circ(c, W * x + dx, H * 0.7, r, '#fff'); },
  bg_garden: (c, W, H) => { sky(c, W, H, '#a8e0ff', '#eaf8ff'); ground(c, W, H, 0.62, '#8fd06a'); for (let i = 0; i < 30; i++) { const x = (i * 83) % W, y = H * 0.7 + (i * 37) % (H * 0.28); c.strokeStyle = '#3f9a5b'; c.lineWidth = 3; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 20); c.stroke(); for (let k = 0; k < 5; k++) circ(c, x + Math.cos(k * 1.26) * 8, y + Math.sin(k * 1.26) * 8, 6, ['#ff8fb1', '#ffd84a', '#ffffff', '#b28cff'][i % 4]); circ(c, x, y, 4, '#ffcf33'); } },
  bg_cafe: (c, W, H) => { sky(c, W, H, '#f4e4c1', '#fff6ec'); c.fillStyle = '#c9384f'; for (let x = 0; x < W; x += 40) { c.fillStyle = (x / 40) % 2 ? '#c9384f' : '#ffffff'; c.beginPath(); c.moveTo(x, H * 0.1); c.lineTo(x + 40, H * 0.1); c.lineTo(x + 40, H * 0.18); c.quadraticCurveTo(x + 20, H * 0.22, x, H * 0.18); c.fill(); } c.fillStyle = '#8a5a3c'; c.fillRect(0, H * 0.7, W, H * 0.3); c.fillStyle = '#6b4a2a'; c.beginPath(); c.ellipse(W * 0.3, H * 0.66, W * 0.14, H * 0.02, 0, 0, 7); c.fill(); c.fillRect(W * 0.29, H * 0.66, W * 0.02, H * 0.1); c.fillStyle = '#fff'; c.beginPath(); c.roundRect(W * 0.25, H * 0.6, W * 0.06, H * 0.05, 6); c.fill(); },
  bg_library: (c, W, H) => { sky(c, W, H, '#6b4a2a', '#8a5a3c'); for (let r = 0; r < 4; r++) { c.fillStyle = '#4a3220'; c.fillRect(0, H * (0.08 + r * 0.17), W, H * 0.02); for (let x = 6; x < W - 10; x += 14 + ((x * 7) % 8)) { c.fillStyle = ['#c9384f', '#2f6fd6', '#53d3a2', '#ffd84a', '#a98bf0', '#e8812f'][(x * 13) % 6]; c.fillRect(x, H * (0.1 + r * 0.17) - (x % 3) * 3, 11, H * 0.13 + (x % 3) * 3); } } c.fillStyle = '#c49a6c'; c.fillRect(0, H * 0.76, W, H * 0.24); },
  bg_lakesunset: (c, W, H) => { sky(c, W, H, '#ff9a6b', '#ffd6a0'); circ(c, W * 0.5, H * 0.52, W * 0.12, '#ffe066'); c.fillStyle = '#6b3fa0'; c.beginPath(); c.moveTo(0, H * 0.54); c.lineTo(W * 0.25, H * 0.36); c.lineTo(W * 0.48, H * 0.54); c.lineTo(W * 0.72, H * 0.4); c.lineTo(W, H * 0.54); c.fill(); c.fillStyle = '#4f7ac9'; c.fillRect(0, H * 0.54, W, H * 0.2); c.fillStyle = 'rgba(255,224,102,.6)'; for (let y = H * 0.56; y < H * 0.72; y += 10) c.fillRect(W * 0.42, y, W * 0.16 * (1 - (y - H * 0.56) / (H * 0.2)), 4); ground(c, W, H, 0.74, '#4f7a3c', 0.02); },
  bg_autumntrail: (c, W, H) => { sky(c, W, H, '#ffd6a0', '#fff0d6'); ground(c, W, H, 0.7, '#c9a86b'); for (let i = 0; i < 5; i++) tree(c, W * (0.06 + i * 0.22), H * 0.72, W / (420 + (i % 2) * 100), '#6b4a2a', ['#e8812f', '#c9384f', '#f2b233'][i % 3]); for (let i = 0; i < 26; i++) { c.save(); c.translate((i * 67) % W, H * 0.74 + (i * 29) % (H * 0.24)); c.rotate(i); c.beginPath(); c.ellipse(0, 0, 8, 4, 0, 0, 7); c.fillStyle = ['#e8812f', '#c9384f', '#f2b233'][i % 3]; c.fill(); c.restore(); } },
  bg_campsite: (c, W, H) => { sky(c, W, H, '#2c3e7a', '#6b8ad8'); stars(c, W, H, 30); ground(c, W, H, 0.7, '#3f6a3c'); c.fillStyle = '#e8812f'; c.beginPath(); c.moveTo(W * 0.1, H * 0.74); c.lineTo(W * 0.3, H * 0.44); c.lineTo(W * 0.5, H * 0.74); c.fill(); c.fillStyle = '#b5452b'; c.beginPath(); c.moveTo(W * 0.26, H * 0.74); c.lineTo(W * 0.3, H * 0.56); c.lineTo(W * 0.34, H * 0.74); c.fill(); c.save(); c.shadowColor = '#ffb46b'; c.shadowBlur = 30; c.fillStyle = '#ffb46b'; c.beginPath(); c.moveTo(W * 0.72, H * 0.8); c.quadraticCurveTo(W * 0.68, H * 0.7, W * 0.74, H * 0.64); c.quadraticCurveTo(W * 0.8, H * 0.72, W * 0.76, H * 0.8); c.fill(); c.restore(); },
  bg_pool: (c, W, H) => { sky(c, W, H, '#bfe8ff', '#eaf8ff'); c.fillStyle = '#f2f2f2'; c.fillRect(0, H * 0.5, W, H * 0.5); c.fillStyle = '#5ec8f2'; c.beginPath(); c.roundRect(W * 0.06, H * 0.58, W * 0.88, H * 0.36, 18); c.fill(); c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 3; for (let y = H * 0.62; y < H * 0.92; y += 18) { c.beginPath(); for (let x = W * 0.08; x < W * 0.92; x += 12) c.lineTo(x, y + Math.sin(x * 0.06) * 3); c.stroke(); } },
  bg_observatory: (c, W, H) => { sky(c, W, H, '#070a24', '#1f2a5c'); stars(c, W, H, 120); c.strokeStyle = 'rgba(169,139,240,.4)'; c.lineWidth = 2; c.beginPath(); c.moveTo(W * 0.2, H * 0.2); c.lineTo(W * 0.32, H * 0.14); c.lineTo(W * 0.4, H * 0.24); c.lineTo(W * 0.52, H * 0.18); c.stroke(); c.fillStyle = '#c9c8dc'; c.beginPath(); c.arc(W * 0.7, H * 0.72, W * 0.2, Math.PI, 0); c.fill(); c.fillStyle = '#1f2a5c'; c.fillRect(W * 0.66, H * 0.54, W * 0.06, H * 0.18); ground(c, W, H, 0.72, '#2c2f5a', 0.02); },
  bg_underwater: (c, W, H) => { sky(c, W, H, '#1f8ad8', '#0b3f7a'); for (let i = 0; i < 20; i++) { c.beginPath(); c.arc((i * 71) % W, (i * 97) % H, 3 + (i % 4) * 2, 0, 7); c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 2; c.stroke(); } ground(c, W, H, 0.82, '#f2d49b', 0.03); for (const x of [0.12, 0.3, 0.84]) { c.strokeStyle = '#3fbf73'; c.lineWidth = 8; c.beginPath(); c.moveTo(W * x, H * 0.84); c.quadraticCurveTo(W * x - 20, H * 0.7, W * x + 10, H * 0.56); c.stroke(); } circ(c, W * 0.62, H * 0.86, 22, '#ff6b8b'); },
  bg_sakura: (c, W, H) => { sky(c, W, H, '#ffe1ea', '#fff6f8'); ground(c, W, H, 0.74, '#bfe8a0'); for (const x of [0.15, 0.85]) { c.fillStyle = '#6b4a2a'; c.fillRect(W * x - 10, H * 0.34, 20, H * 0.42); for (let k = 0; k < 9; k++) circ(c, W * x + Math.cos(k) * 70, H * 0.3 + Math.sin(k * 1.7) * 40, 36, ['#ffc2d4', '#ffd3de', '#ffb0c8'][k % 3]); } for (let i = 0; i < 30; i++) heartish(c, (i * 67) % W, (i * 41) % H); },
  bg_desert: (c, W, H) => { sky(c, W, H, '#ffcf8a', '#fff0d6'); circ(c, W * 0.78, H * 0.18, W * 0.08, '#fff8c4'); ground(c, W, H, 0.6, '#f2c97a', 0.08); ground(c, W, H, 0.74, '#e8b465', 0.05); c.fillStyle = '#4f9a5b'; c.beginPath(); c.roundRect(W * 0.2 - 10, H * 0.46, 20, H * 0.22, 10); c.roundRect(W * 0.2 - 34, H * 0.52, 16, H * 0.08, 8); c.roundRect(W * 0.2 + 18, H * 0.5, 16, H * 0.08, 8); c.fill(); },
  bg_mountain: (c, W, H) => { sky(c, W, H, '#9fd6ff', '#eaf8ff'); c.fillStyle = '#8f9cb8'; c.beginPath(); c.moveTo(0, H * 0.66); c.lineTo(W * 0.3, H * 0.24); c.lineTo(W * 0.52, H * 0.6); c.lineTo(W * 0.72, H * 0.3); c.lineTo(W, H * 0.66); c.fill(); c.fillStyle = '#ffffff'; for (const [x, y] of [[0.3, 0.24], [0.72, 0.3]]) { c.beginPath(); c.moveTo(W * x - W * 0.07, H * (y + 0.1)); c.lineTo(W * x, H * y); c.lineTo(W * x + W * 0.07, H * (y + 0.1)); c.fill(); } ground(c, W, H, 0.66, '#7cc85a'); },
  bg_carnival: (c, W, H) => { sky(c, W, H, '#5a3fa0', '#ff8fb1'); stars(c, W, H, 20); c.strokeStyle = '#ffd84a'; c.lineWidth = 6; c.beginPath(); c.arc(W * 0.3, H * 0.44, W * 0.2, 0, 7); c.stroke(); for (let k = 0; k < 8; k++) { const a = k * 0.785; c.beginPath(); c.moveTo(W * 0.3, H * 0.44); c.lineTo(W * 0.3 + Math.cos(a) * W * 0.2, H * 0.44 + Math.sin(a) * W * 0.2); c.stroke(); circ(c, W * 0.3 + Math.cos(a) * W * 0.2, H * 0.44 + Math.sin(a) * W * 0.2, 10, ['#ff6b8b', '#5ec8f2', '#53d3a2', '#ffd84a'][k % 4]); } c.fillStyle = '#ff6b8b'; c.beginPath(); c.moveTo(W * 0.62, H * 0.72); c.lineTo(W * 0.78, H * 0.4); c.lineTo(W * 0.94, H * 0.72); c.fill(); ground(c, W, H, 0.74, '#3a2a4a', 0.02); },
  bg_studio: (c, W, H) => { const g = c.createRadialGradient(W / 2, H * 0.45, 10, W / 2, H * 0.5, H * 0.8); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#e8e2da'); c.fillStyle = g; c.fillRect(0, 0, W, H); c.fillStyle = 'rgba(0,0,0,.05)'; c.beginPath(); c.ellipse(W / 2, H * 0.84, W * 0.36, H * 0.04, 0, 0, 7); c.fill(); },
  bg_hallmasters: (c, W, H) => { sky(c, W, H, '#3a1030', '#1f2230'); for (let i = 0; i < 5; i++) { c.fillStyle = '#ffd84a'; c.fillRect(W * (0.08 + i * 0.2), H * 0.2, 10, H * 0.56); } c.fillStyle = '#c9384f'; c.fillRect(W * 0.3, H * 0.76, W * 0.4, H * 0.24); for (let i = 0; i < 4; i++) { c.strokeStyle = '#ffd84a'; c.lineWidth = 6; c.strokeRect(W * (0.12 + i * 0.2), H * 0.3, W * 0.12, H * 0.14); } star(c, W / 2, H * 0.12, 26, '#ffd84a'); c.fillStyle = '#2a1a22'; c.fillRect(0, H * 0.76, W * 0.3, H); c.fillRect(W * 0.7, H * 0.76, W * 0.3, H); },
};
/* Homeland scenes (1.4) — not catalog items; the Homeland draws them with state overlays. */
Object.assign(BACKDROPS, {
  homeland_living: (c, W, H) => { sky(c, W, H, '#fbe7d3', '#fff3e6'); c.fillStyle = '#e9c9a8'; c.fillRect(0, H * 0.68, W, H * 0.32); c.fillStyle = '#d9b48f'; for (let x = 0; x < W; x += W / 8) c.fillRect(x, H * 0.68, 3, H * 0.32);
    c.fillStyle = '#bfe3ff'; c.fillRect(W * 0.64, H * 0.12, W * 0.26, H * 0.26); c.strokeStyle = '#fff'; c.lineWidth = 10; c.strokeRect(W * 0.64, H * 0.12, W * 0.26, H * 0.26); c.beginPath(); c.moveTo(W * 0.77, H * 0.12); c.lineTo(W * 0.77, H * 0.38); c.stroke();
    c.fillStyle = '#c96f5a'; c.beginPath(); c.roundRect(W * 0.04, H * 0.5, W * 0.46, H * 0.2, 22); c.fill(); c.fillStyle = '#b25e4b'; c.beginPath(); c.roundRect(W * 0.02, H * 0.44, W * 0.5, H * 0.1, 18); c.fill();
    c.fillStyle = '#8f5a3c'; c.fillRect(W * 0.08, H * 0.7, 10, 14); c.fillRect(W * 0.44, H * 0.7, 10, 14);
    c.fillStyle = '#f2d49b'; c.beginPath(); c.ellipse(W * 0.62, H * 0.86, W * 0.3, H * 0.06, 0, 0, 7); c.fill(); },
  // 2.1: the living room with NO painted furniture — couch, rug and the rest are movable objects now
  homeland_living_room: (c, W, H) => { sky(c, W, H, '#fbe7d3', '#fff3e6'); c.fillStyle = '#f6dcc2'; c.fillRect(0, H * 0.6, W, 8); c.fillStyle = '#e9c9a8'; c.fillRect(0, H * 0.64, W, H * 0.36); c.fillStyle = '#d9b48f'; for (let x = 0; x < W; x += W / 8) c.fillRect(x, H * 0.64, 3, H * 0.36);
    c.fillStyle = '#bfe3ff'; c.fillRect(W * 0.62, H * 0.1, W * 0.28, H * 0.22); c.strokeStyle = '#fff'; c.lineWidth = 10; c.strokeRect(W * 0.62, H * 0.1, W * 0.28, H * 0.22); c.beginPath(); c.moveTo(W * 0.76, H * 0.1); c.lineTo(W * 0.76, H * 0.32); c.stroke(); c.fillStyle = '#fff'; c.fillRect(W * 0.6, H * 0.32, W * 0.32, 10); },
  homeland_backyard: (c, W, H) => { sky(c, W, H, '#9fd8ff', '#e3f6ff'); c.fillStyle = '#d9b48f'; for (let x = 0; x < W; x += W / 12) { c.fillRect(x + 4, H * 0.44, W / 12 - 8, H * 0.2); c.beginPath(); c.moveTo(x + 4, H * 0.44); c.lineTo(x + W / 24, H * 0.4); c.lineTo(x + W / 12 - 4, H * 0.44); c.fill(); }
    c.fillStyle = '#c49a6c'; c.fillRect(0, H * 0.5, W, 6); ground(c, W, H, 0.62, '#8fd06a', 0.03); ground(c, W, H, 0.78, '#7cc85a', 0.03); tree(c, W * 0.1, H * 0.62, W / 380); circ(c, W * 0.84, H * 0.14, W * 0.07, '#fff8c4');
    c.fillStyle = '#8a5a3c'; c.fillRect(W * 0.78, H * 0.5, W * 0.14, H * 0.12); c.fillStyle = '#c9384f'; c.beginPath(); c.moveTo(W * 0.76, H * 0.5); c.lineTo(W * 0.85, H * 0.42); c.lineTo(W * 0.94, H * 0.5); c.fill(); c.fillStyle = '#3a2a2a'; c.beginPath(); c.arc(W * 0.85, H * 0.6, W * 0.03, Math.PI, 0); c.fill(); },
  homeland_playground: (c, W, H) => { sky(c, W, H, '#a8e0ff', '#eaf8ff'); ground(c, W, H, 0.64, '#f2d49b', 0.02); ground(c, W, H, 0.8, '#e8c27f', 0.02);
    c.strokeStyle = '#ff6b8b'; c.lineWidth = 10; c.beginPath(); c.moveTo(W * 0.08, H * 0.64); c.lineTo(W * 0.08, H * 0.3); c.lineTo(W * 0.3, H * 0.3); c.lineTo(W * 0.3, H * 0.64); c.stroke();
    c.strokeStyle = '#5ec8f2'; c.lineWidth = 4; for (const x of [0.14, 0.24]) { c.beginPath(); c.moveTo(W * x, H * 0.3); c.lineTo(W * x, H * 0.52); c.stroke(); c.fillStyle = '#5ec8f2'; c.fillRect(W * x - 16, H * 0.52, 32, 7); }
    c.fillStyle = '#ffd23f'; c.beginPath(); c.moveTo(W * 0.62, H * 0.32); c.lineTo(W * 0.7, H * 0.32); c.lineTo(W * 0.92, H * 0.64); c.lineTo(W * 0.84, H * 0.64); c.fill(); c.fillStyle = '#53d3a2'; c.fillRect(W * 0.58, H * 0.32, 18, H * 0.32); for (let y = 0.36; y < 0.62; y += 0.06) c.fillRect(W * 0.56, H * y, 30, 5); },
  homeland_training: (c, W, H) => { sky(c, W, H, '#bfe8ff', '#eefaff'); ground(c, W, H, 0.6, '#9fdc7a', 0.02);
    for (const x of [0.2, 0.45, 0.7]) { c.fillStyle = '#ff6b8b'; c.fillRect(W * x - 30, H * 0.66, 8, H * 0.12); c.fillRect(W * x + 22, H * 0.66, 8, H * 0.12); c.fillStyle = '#ffd23f'; c.fillRect(W * x - 30, H * 0.68, 60, 8); }
    for (let k = 0; k < 5; k++) { c.fillStyle = k % 2 ? '#5ec8f2' : '#a98bf0'; c.fillRect(W * (0.08 + k * 0.035), H * 0.5, 6, H * 0.14); }
    c.fillStyle = '#fff'; c.beginPath(); c.arc(W * 0.88, H * 0.42, W * 0.06, 0, 7); c.fill(); c.fillStyle = '#e0474c'; c.beginPath(); c.arc(W * 0.88, H * 0.42, W * 0.04, 0, 7); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(W * 0.88, H * 0.42, W * 0.02, 0, 7); c.fill(); c.fillStyle = '#8a5a3c'; c.fillRect(W * 0.875, H * 0.48, 8, H * 0.14); },
  homeland_kitchen: (c, W, H) => { sky(c, W, H, '#fde8cf', '#fff4e4'); c.fillStyle = '#f7d9b8'; c.fillRect(0, H * 0.3, W, H * 0.32);
    c.fillStyle = '#b97a4e'; for (let i = 0; i < 3; i++) { c.fillRect(W * (0.06 + i * 0.3), H * 0.1, W * 0.24, H * 0.16); c.fillStyle = '#e8b98f'; c.fillRect(W * (0.075 + i * 0.3), H * 0.115, W * 0.21, H * 0.13); c.fillStyle = '#b97a4e'; }
    c.fillStyle = '#9c6a44'; c.fillRect(0, H * 0.5, W, H * 0.13); c.fillStyle = '#efe2cf'; c.fillRect(0, H * 0.48, W, H * 0.03);
    c.fillStyle = '#f4e4c1'; c.fillRect(0, H * 0.68, W, H * 0.32); c.fillStyle = '#e6d0a4'; for (let x = 0; x < W; x += W / 6) c.fillRect(x, H * 0.68, 3, H * 0.32);
    circ(c, W * 0.8, H * 0.45, W * 0.05, '#ff8a2a'); circ(c, W * 0.7, H * 0.46, W * 0.04, '#e0474c'); circ(c, W * 0.25, H * 0.45, W * 0.045, '#8fd06a'); },
  // 1.5: Homeland Garden and Photo Studio get their own recognisable sets (were a flat lawn / a blank wall)
  homeland_garden: (c, W, H) => { sky(c, W, H, '#bfe8ff', '#f2fbff'); ground(c, W, H, 0.6, '#8fd06a', 0.03);
    c.fillStyle = '#e8f6ff'; c.strokeStyle = '#9ec9b0'; c.lineWidth = 4; c.beginPath(); c.moveTo(W * 0.66, H * 0.6); c.lineTo(W * 0.66, H * 0.4); c.quadraticCurveTo(W * 0.8, H * 0.28, W * 0.94, H * 0.4); c.lineTo(W * 0.94, H * 0.6); c.closePath(); c.fill(); c.stroke();
    for (let k = 1; k < 4; k++) { c.beginPath(); c.moveTo(W * (0.66 + k * 0.07), H * 0.6); c.lineTo(W * (0.66 + k * 0.07), H * (0.35 + Math.abs(k - 2) * 0.03)); c.stroke(); }
    c.strokeStyle = '#8a5a3c'; c.lineWidth = 10; c.beginPath(); c.moveTo(W * 0.14, H * 0.62); c.lineTo(W * 0.14, H * 0.38); c.quadraticCurveTo(W * 0.27, H * 0.24, W * 0.4, H * 0.38); c.lineTo(W * 0.4, H * 0.62); c.stroke();
    for (let k = 0; k < 16; k++) { const a = Math.PI + k / 15 * Math.PI, x = W * 0.27 + Math.cos(a) * W * 0.13, y = H * 0.38 + Math.sin(a) * H * 0.1; circ(c, x, y, 13, '#5fb84a'); circ(c, x + 5, y - 4, 7, ['#ff6b8b', '#ffffff', '#ff9fb8'][k % 3]); }
    for (const [x0, col] of [[0.02, '#ff6b8b'], [0.46, '#ffd84a'], [0.7, '#a98bf0']]) { c.fillStyle = '#9b6b43'; c.fillRect(W * x0, H * 0.66, W * 0.26, H * 0.05);
      for (let k = 0; k < 7; k++) { const x = W * x0 + 14 + k * W * 0.035; c.strokeStyle = '#3f9a5b'; c.lineWidth = 3; c.beginPath(); c.moveTo(x, H * 0.66); c.lineTo(x, H * 0.62); c.stroke(); circ(c, x, H * 0.615, 9, col); circ(c, x, H * 0.615, 3.5, '#fff3c4'); } }
    c.fillStyle = '#d9d2c4'; for (let k = 0; k < 5; k++) { c.beginPath(); c.ellipse(W * (0.3 + k * 0.1), H * (0.8 + (k % 2) * 0.05), 34, 14, 0, 0, 7); c.fill(); } },
  homeland_studio: (c, W, H) => { c.fillStyle = '#3a3346'; c.fillRect(0, 0, W, H);
    const g = c.createLinearGradient(0, H * 0.1, 0, H * 0.9); g.addColorStop(0, '#fbe3ec'); g.addColorStop(1, '#fff6f0'); c.fillStyle = g; c.beginPath(); c.moveTo(W * 0.14, H * 0.08); c.lineTo(W * 0.86, H * 0.08); c.lineTo(W * 0.86, H * 0.66); c.quadraticCurveTo(W * 0.86, H * 0.86, W, H * 0.9); c.lineTo(W, H); c.lineTo(0, H); c.lineTo(0, H * 0.9); c.quadraticCurveTo(W * 0.14, H * 0.86, W * 0.14, H * 0.66); c.closePath(); c.fill();
    c.fillStyle = '#6a6275'; c.fillRect(W * 0.12, H * 0.05, W * 0.76, H * 0.035);
    for (const s of [-1, 1]) { const x = W / 2 + s * W * 0.43; c.strokeStyle = '#222'; c.lineWidth = 5; c.beginPath(); c.moveTo(x, H * 0.3); c.lineTo(x, H * 0.84); c.moveTo(x, H * 0.84); c.lineTo(x - 30, H * 0.88); c.moveTo(x, H * 0.84); c.lineTo(x + 30, H * 0.88); c.stroke();
      c.save(); c.translate(x, H * 0.27); c.rotate(s * -0.35); c.fillStyle = '#2b2b33'; c.fillRect(-56, -44, 112, 88); c.fillStyle = '#fffdf4'; c.fillRect(-48, -36, 96, 72); c.restore();
      c.fillStyle = 'rgba(255,250,220,.18)'; c.beginPath(); c.moveTo(x, H * 0.27); c.lineTo(W / 2 - s * W * 0.05, H * 0.9); c.lineTo(W / 2 + s * W * 0.25, H * 0.9); c.closePath(); c.fill(); }
    c.strokeStyle = '#ffcc33'; c.lineWidth = 8; for (const d of [-1, 1]) { c.beginPath(); c.moveTo(W / 2 - 40, H * 0.9 + d * 16); c.lineTo(W / 2 + 40, H * 0.9 - d * 16); c.stroke(); } },
  homeland_gate: (c, W, H) => { sky(c, W, H, '#bfe8c8', '#eaf7e6'); ground(c, W, H, 0.66, '#6fae4a'); for (let i = 0; i < 5; i++) tree(c, W * (0.04 + i * 0.24), H * 0.66, W / (440 + (i % 2) * 90), '#6b4a2a', ['#3f8a3c', '#5fb84a'][i % 2]);
    c.fillStyle = '#c9384f'; c.fillRect(W * 0.34, H * 0.28, 16, H * 0.4); c.fillRect(W * 0.64, H * 0.28, 16, H * 0.4); c.fillRect(W * 0.28, H * 0.26, W * 0.46, 16); c.fillRect(W * 0.31, H * 0.33, W * 0.4, 10);
    c.fillStyle = '#c9a86b'; c.beginPath(); c.moveTo(W * 0.44, H); c.quadraticCurveTo(W * 0.5, H * 0.8, W * 0.47, H * 0.68); c.lineTo(W * 0.55, H * 0.68); c.quadraticCurveTo(W * 0.58, H * 0.8, W * 0.6, H); c.fill(); },
});
function heartish(c, x, y) { c.save(); c.translate(x, y); c.rotate(x); c.beginPath(); c.ellipse(0, 0, 6, 3.5, 0, 0, 7); c.fillStyle = '#ffb0c8'; c.fill(); c.restore(); }
export function drawBackdrop(ctx, it, W, H, t = 0) { const f = BACKDROPS[it.draw]; if (!f) return false; ctx.save(); f(ctx, W, H, t); ctx.restore(); return true; }

/* ------------------------------------------------------- filters/effects --
   Tonal filters use canvas `filter` (Chrome + Safari 18+) with a pixel-free
   overlay fallback; effects draw particles over the photo. */
export const LOOKS = {
  filter_warm:    { css: 'sepia(.3) saturate(1.35) hue-rotate(-10deg)', tint: 'rgba(255,150,50,.16)' },
  filter_cool:    { css: 'saturate(1.1) hue-rotate(18deg) brightness(1.03)', tint: 'rgba(70,150,255,.18)' },
  filter_vintage: { css: 'sepia(.45) contrast(.92) saturate(.8)', tint: 'rgba(160,110,60,.12)', grain: true },
  filter_dreamy:  { css: 'brightness(1.1) saturate(1.15) blur(0.8px)', tint: 'rgba(255,190,240,.22)', bloom: true },
  filter_bw:      { css: 'grayscale(1) contrast(1.1)', tint: null },
  filter_glow:    { css: 'brightness(1.1) contrast(.95)', tint: 'rgba(255,255,255,.12)', bloom: true },
  filter_vignette:{ css: 'none', tint: null, vignette: true },
  filter_sepia:   { css: 'sepia(.85)', tint: null },
  filter_pastel:  { css: 'saturate(.7) brightness(1.12) contrast(.9)', tint: 'rgba(255,220,240,.12)' },
  filter_vivid:   { css: 'saturate(1.6) contrast(1.08)', tint: null },
};
export function applyLook(ctx, it, W, H) {
  const L = LOOKS[it.itemID]; if (!L) return;
  ctx.save();
  if (L.tint) { ctx.fillStyle = L.tint; ctx.fillRect(0, 0, W, H); }
  if (L.vignette || it.itemID === 'filter_vintage') { const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.45)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  if (L.grain) { ctx.globalAlpha = 0.08; for (let i = 0; i < 600; i++) { ctx.fillStyle = i % 2 ? '#000' : '#fff'; ctx.fillRect((i * 97) % W, (i * 61) % H, 2, 2); } }
  if (L.bloom) { const g = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.max(W, H) * 0.6); g.addColorStop(0, 'rgba(255,255,255,.18)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
}
export const EFFECTS = {
  filter_snow: (c, W, H, t) => { for (let i = 0; i < 70; i++) { const x = (i * 97 + Math.sin(t + i) * 20) % W, y = ((i * 53) + t * 40 * (1 + (i % 3))) % H; circ(c, (x + W) % W, y, 2 + (i % 3), 'rgba(255,255,255,.9)'); } },
  filter_rain: (c, W, H, t) => { c.strokeStyle = 'rgba(200,230,255,.7)'; c.lineWidth = 2; for (let i = 0; i < 90; i++) { const x = (i * 71) % W, y = ((i * 37) + t * 400) % H; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 4, y + 16); c.stroke(); } },
  filter_leaves: (c, W, H, t) => { for (let i = 0; i < 24; i++) { c.save(); c.translate((i * 83 + Math.sin(t + i) * 30) % W, ((i * 47) + t * 50) % H); c.rotate(t + i); c.beginPath(); c.ellipse(0, 0, 9, 5, 0, 0, 7); c.fillStyle = ['#e8812f', '#c9384f', '#f2b233'][i % 3]; c.fill(); c.restore(); } },
  filter_sparkle: (c, W, H, t) => { for (let i = 0; i < 26; i++) star(c, (i * 89) % W, (i * 61) % H, (4 + (i % 4) * 2) * (0.6 + 0.4 * Math.sin(t * 4 + i)), 'rgba(255,246,201,.95)', 4); },
  filter_bubbles: (c, W, H, t) => { for (let i = 0; i < 22; i++) { const x = (i * 73) % W, y = H - (((i * 41) + t * 60) % H); c.beginPath(); c.arc(x, y, 6 + (i % 4) * 4, 0, 7); c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 2; c.stroke(); c.fillStyle = 'rgba(191,232,255,.25)'; c.fill(); } },
  filter_hearts: (c, W, H, t) => { for (let i = 0; i < 16; i++) heart(c, (i * 97) % W, H - (((i * 57) + t * 50) % H), 1 + (i % 3) * 0.5, ['rgba(255,95,143,.85)', 'rgba(255,143,177,.85)'][i % 2]); },
  filter_confetti: (c, W, H, t) => { for (let i = 0; i < 60; i++) { c.save(); c.translate((i * 67) % W, ((i * 43) + t * 90) % H); c.rotate(i + t * 3); c.fillStyle = ['#ff6b8b', '#5ec8f2', '#ffd84a', '#53d3a2', '#a98bf0'][i % 5]; c.fillRect(-5, -2, 10, 4); c.restore(); } },
  filter_stardust: (c, W, H, t) => { c.save(); c.globalCompositeOperation = 'lighter'; for (let i = 0; i < 80; i++) circ(c, (i * 53 + t * 10) % W, (i * 89) % H, 1.5 + (i % 3), `rgba(255,${200 + (i % 55)},150,.7)`); for (let i = 0; i < 8; i++) star(c, (i * 131) % W, (i * 71) % H, 8, 'rgba(255,246,201,.9)', 4); c.restore(); },
  filter_fireflies: (c, W, H, t) => { c.save(); c.shadowColor = '#fff6a0'; c.shadowBlur = 14; for (let i = 0; i < 24; i++) circ(c, (i * 83 + Math.sin(t * 0.7 + i) * 30 + W) % W, (i * 57 + Math.cos(t * 0.6 + i) * 20 + H) % H, 3, `rgba(255,246,160,${0.5 + 0.5 * Math.sin(t * 3 + i)})`); c.restore(); },
  filter_petals: (c, W, H, t) => { for (let i = 0; i < 30; i++) { c.save(); c.translate((i * 79 + Math.sin(t + i) * 30 + W) % W, ((i * 49) + t * 45) % H); c.rotate(t + i); c.beginPath(); c.ellipse(0, 0, 7, 4, 0, 0, 7); c.fillStyle = ['#ffc2d4', '#ffd3de', '#ffb0c8'][i % 3]; c.fill(); c.restore(); } },
};
export function drawEffect(ctx, it, W, H, t = 0) { const f = EFFECTS[it.itemID]; if (!f) return false; ctx.save(); f(ctx, W, H, t); ctx.restore(); return true; }

/* ------------------------------------------------------------ frames (1.3) */
function band(c, W, H, b, col, r = 0) { c.save(); c.beginPath(); c.rect(0, 0, W, H); c.roundRect(b, b, W - 2 * b, H - 2 * b, r); c.fillStyle = col; c.fill('evenodd'); c.restore(); }
function around(W, H, n, fn) { const per = 2 * (W + H); for (let i = 0; i < n; i++) { let d = (i + 0.5) * per / n, x, y; if (d < W) { x = d; y = 0; } else if ((d -= W) < H) { x = W; y = d; } else if ((d -= H) < W) { x = W - d; y = H; } else { d -= W; x = 0; y = H - d; } fn(x, y, i); } }
const inward = (x, y, W, H, u, k = 3) => [x + (x < W / 2 ? k : -k) * u, y + (y < H / 2 ? k : -k) * u];
export const FRAMES_EXT = {
  frame_starlight(c, it, W, H, t) { const u = Math.min(W, H) / 100; band(c, W, H, 2.6 * u, it.color, 3 * u); around(W, H, 22, (x, y, i) => { const [px, py] = inward(x, y, W, H, u, 1.3); star(c, px, py, (1.6 + (i % 3)) * u * (0.8 + 0.2 * Math.sin(t * 3 + i)), i % 2 ? it.trim : '#ffffff'); }); },
  frame_polaroid(c, it, W, H) { const u = Math.min(W, H) / 100; c.save(); c.beginPath(); c.rect(0, 0, W, H); c.rect(4 * u, 4 * u, W - 8 * u, H - 22 * u); c.fillStyle = it.color; c.fill('evenodd'); c.fillStyle = '#b8b0a4'; c.font = `700 ${4 * u}px system-ui`; c.textAlign = 'center'; c.fillText('PokaSnap', W / 2, H - 8 * u); c.restore(); },
  frame_film(c, it, W, H) { const u = Math.min(W, H) / 100; c.fillStyle = it.color; c.fillRect(0, 0, 9 * u, H); c.fillRect(W - 9 * u, 0, 9 * u, H); c.fillStyle = it.trim; for (let y = 3 * u; y < H; y += 7 * u) { c.fillRect(2.5 * u, y, 4 * u, 3.5 * u); c.fillRect(W - 6.5 * u, y, 4 * u, 3.5 * u); } },
  frame_stamp(c, it, W, H) { const u = Math.min(W, H) / 100; band(c, W, H, 5 * u, it.color); c.fillStyle = 'rgba(0,0,0,0)'; c.save(); c.globalCompositeOperation = 'destination-out'; around(W, H, 60, (x, y) => circ(c, x, y, 1.6 * u, '#000')); c.restore(); c.strokeStyle = it.trim; c.lineWidth = 0.7 * u; c.strokeRect(5 * u, 5 * u, W - 10 * u, H - 10 * u); },
  frame_washi(c, it, W, H) { const u = Math.min(W, H) / 100; for (const [x, y, a] of [[0, 0, -0.6], [W, 0, 0.6], [0, H, 0.6], [W, H, -0.6]]) { c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = it.color; c.globalAlpha = 0.9; c.fillRect(-14 * u, -3.5 * u, 28 * u, 7 * u); c.fillStyle = it.trim; for (let k = -12; k < 14; k += 5) c.fillRect(k * u, -3.5 * u, 2 * u, 7 * u); c.restore(); } },
  frame_scallop(c, it, W, H) { const u = Math.min(W, H) / 100; band(c, W, H, 4 * u, it.color); c.fillStyle = it.color; around(W, H, 50, (x, y) => { const [px, py] = inward(x, y, W, H, u, 4); circ(c, px, py, 2.4 * u, it.color); }); c.strokeStyle = it.trim; c.lineWidth = 0.8 * u; c.setLineDash([2 * u, 2 * u]); c.strokeRect(2 * u, 2 * u, W - 4 * u, H - 4 * u); c.setLineDash([]); },
  frame_neon(c, it, W, H, t) { const u = Math.min(W, H) / 100; c.save(); c.shadowColor = it.color; c.shadowBlur = 4 * u; c.strokeStyle = it.color; c.lineWidth = 1.4 * u; c.beginPath(); c.roundRect(3 * u, 3 * u, W - 6 * u, H - 6 * u, 4 * u); c.stroke(); c.shadowColor = it.trim; c.strokeStyle = it.trim; c.globalAlpha = 0.6 + 0.4 * Math.sin(t * 4); c.beginPath(); c.roundRect(5 * u, 5 * u, W - 10 * u, H - 10 * u, 3 * u); c.stroke(); c.restore(); },
  frame_gold(c, it, W, H) { const u = Math.min(W, H) / 100; const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#fff2a8'); g.addColorStop(0.5, it.color); g.addColorStop(1, it.trim); band(c, W, H, 5 * u, g, 2 * u); c.strokeStyle = it.trim; c.lineWidth = 0.6 * u; c.strokeRect(5 * u, 5 * u, W - 10 * u, H - 10 * u); for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) { circ(c, x + (x ? -5 : 5) * u, y + (y ? -5 : 5) * u, 4 * u, '#fff2a8'); circ(c, x + (x ? -5 : 5) * u, y + (y ? -5 : 5) * u, 2 * u, it.trim); } },
  frame_wood(c, it, W, H) { const u = Math.min(W, H) / 100; band(c, W, H, 5 * u, it.color); c.strokeStyle = it.trim; c.lineWidth = 0.4 * u; for (let k = 1; k < 5; k++) { c.beginPath(); c.moveTo(0, k * u); c.lineTo(W, k * u); c.moveTo(0, H - k * u); c.lineTo(W, H - k * u); c.stroke(); } },
  frame_doodle(c, it, W, H) { const u = Math.min(W, H) / 100; c.strokeStyle = it.trim; c.lineWidth = 0.8 * u; c.lineCap = 'round'; around(W, H, 30, (x, y, i) => { const [px, py] = inward(x, y, W, H, u, 3); c.beginPath(); if (i % 3 === 0) { star(c, px, py, 2.4 * u, it.trim); } else if (i % 3 === 1) { c.arc(px, py, 2 * u, 0, 7); c.stroke(); } else { c.moveTo(px - 2 * u, py); c.quadraticCurveTo(px, py - 3 * u, px + 2 * u, py); c.stroke(); } }); },
  frame_clouds(c, it, W, H) { const u = Math.min(W, H) / 100; around(W, H, 40, (x, y) => { const [px, py] = inward(x, y, W, H, u, 1); circ(c, px, py, 5 * u, it.color); circ(c, px, py, 3.5 * u, '#ffffff'); }); },
  frame_flowers(c, it, W, H) { const u = Math.min(W, H) / 100; around(W, H, 28, (x, y, i) => { const [px, py] = inward(x, y, W, H, u, 3); for (let k = 0; k < 5; k++) circ(c, px + Math.cos(k * 1.26) * 2.2 * u, py + Math.sin(k * 1.26) * 2.2 * u, 1.8 * u, i % 2 ? it.color : '#ffffff'); circ(c, px, py, 1.2 * u, '#ffd84a'); }); c.strokeStyle = it.trim; c.lineWidth = 0.7 * u; c.strokeRect(1 * u, 1 * u, W - 2 * u, H - 2 * u); },
  frame_stars(c, it, W, H) { const u = Math.min(W, H) / 100; band(c, W, H, 3 * u, it.trim); around(W, H, 30, (x, y, i) => { const [px, py] = inward(x, y, W, H, u, 1.5); star(c, px, py, 1.6 * u, it.color); }); },
  frame_rainbow(c, it, W, H) { const u = Math.min(W, H) / 100; ['#ff6b8b', '#ffa94d', '#ffd84a', '#53d3a2', '#5ec8f2', '#a98bf0'].forEach((col, k) => { c.strokeStyle = col; c.lineWidth = u; c.strokeRect((0.5 + k) * u, (0.5 + k) * u, W - (1 + 2 * k) * u, H - (1 + 2 * k) * u); }); },
  frame_snow(c, it, W, H) { const u = Math.min(W, H) / 100; band(c, W, H, 2 * u, it.color); around(W, H, 24, (x, y) => { const [px, py] = inward(x, y, W, H, u, 3); c.strokeStyle = it.trim; c.lineWidth = 0.6 * u; for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3; c.beginPath(); c.moveTo(px - Math.cos(a) * 2.6 * u, py - Math.sin(a) * 2.6 * u); c.lineTo(px + Math.cos(a) * 2.6 * u, py + Math.sin(a) * 2.6 * u); c.stroke(); } }); },
  frame_pumpkin(c, it, W, H) { const u = Math.min(W, H) / 100; band(c, W, H, 2 * u, it.trim); around(W, H, 20, (x, y, i) => { const [px, py] = inward(x, y, W, H, u, 3.5); for (const dx of [-1.2, 0, 1.2]) { c.beginPath(); c.ellipse(px + dx * u, py, 1.6 * u, 2.4 * u, 0, 0, 7); c.fillStyle = it.color; c.fill(); } c.fillStyle = it.trim; c.fillRect(px - 0.3 * u, py - 3.2 * u, 0.6 * u, 1.2 * u); }); },
  frame_comic(c, it, W, H) { const u = Math.min(W, H) / 100; band(c, W, H, 3 * u, '#ffffff'); c.strokeStyle = it.trim; c.lineWidth = 1.4 * u; c.strokeRect(3 * u, 3 * u, W - 6 * u, H - 6 * u); c.save(); c.translate(W - 18 * u, 12 * u); c.fillStyle = it.color; c.beginPath(); for (let k = 0; k < 16; k++) { const r = k % 2 ? 6 * u : 10 * u, a = k * Math.PI / 8; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.fill(); c.fillStyle = it.trim; c.font = `900 ${5 * u}px system-ui`; c.textAlign = 'center'; c.fillText('POW!', 0, 2 * u); c.restore(); },
  frame_ribbon(c, it, W, H) { const u = Math.min(W, H) / 100; band(c, W, H, 2.5 * u, it.color); c.fillStyle = it.color; c.fillRect(W / 2 - 3 * u, 0, 6 * u, H); c.fillRect(0, H / 2 - 3 * u, W, 6 * u); c.globalAlpha = 0.5; c.clearRect(4 * u, 4 * u, 0, 0); c.globalAlpha = 1; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(W / 2 + s * 6 * u, 5 * u, 6 * u, 3.5 * u, s * 0.4, 0, 7); c.fillStyle = it.trim; c.fill(); } },
  frame_master(c, it, W, H) { const u = Math.min(W, H) / 100; const g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#1f2230'); g.addColorStop(0.5, '#3a3470'); g.addColorStop(1, '#1f2230'); band(c, W, H, 6 * u, g, 3 * u); c.strokeStyle = it.trim; c.lineWidth = 0.8 * u; c.strokeRect(4 * u, 4 * u, W - 8 * u, H - 8 * u); c.fillStyle = it.trim; c.font = `900 ${3.4 * u}px system-ui`; c.textAlign = 'center'; c.fillText('MASTER PHOTOGRAPHER', W / 2, H - 1.6 * u); star(c, W / 2, 3 * u, 2.4 * u, it.trim); },
};

/* Flat garment icon for store/catalog thumbnails (clothes laid flat). */
export function flatGarment(ctx, it) {
  const d = it.draw, c = it.color, o = dk(c, 0.4);
  const tee = (sleeve = 26, len = 70, collar = 'round') => { ctx.beginPath();
    ctx.moveTo(-26, -58); ctx.quadraticCurveTo(0, collar === 'v' ? -30 : -46, 26, -58); ctx.lineTo(56, -44); ctx.lineTo(56 + sleeve * 0.6, -44 + sleeve); ctx.lineTo(40, -44 + sleeve + 8);
    ctx.lineTo(40, len); ctx.lineTo(-40, len); ctx.lineTo(-40, -44 + sleeve + 8); ctx.lineTo(-56 - sleeve * 0.6, -44 + sleeve); ctx.lineTo(-56, -44); ctx.closePath(); };
  const lum = (() => { const n = parseInt(c.slice(1), 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; })();
  const shape = () => {
  if (d === 'cape') { ctx.beginPath(); ctx.moveTo(-24, -60); ctx.quadraticCurveTo(0, -50, 24, -60); ctx.quadraticCurveTo(70, 0, 64, 70); ctx.quadraticCurveTo(0, 84, -64, 70); ctx.quadraticCurveTo(-70, 0, -24, -60); ctx.closePath(); }
  else if (d === 'vest') { ctx.beginPath(); ctx.moveTo(-24, -60); ctx.lineTo(-6, -8); ctx.lineTo(6, -8); ctx.lineTo(24, -60); ctx.lineTo(44, -50); ctx.quadraticCurveTo(36, -20, 44, 0); ctx.lineTo(44, 64); ctx.lineTo(-44, 64); ctx.lineTo(-44, 0); ctx.quadraticCurveTo(-36, -20, -44, -50); ctx.closePath(); }
  else if (d === 'overalls') { ctx.beginPath(); ctx.moveTo(-28, -30); ctx.lineTo(28, -30); ctx.lineTo(28, 0); ctx.lineTo(44, 4); ctx.lineTo(44, 70); ctx.lineTo(6, 70); ctx.lineTo(0, 40); ctx.lineTo(-6, 70); ctx.lineTo(-44, 70); ctx.lineTo(-44, 4); ctx.lineTo(-28, 0); ctx.closePath(); }
  else if (d === 'raincoat') { tee(40, 72, 'v'); }
  else if (d === 'hoodie') { tee(40, 66); }
  else if (d === 'jersey') { tee(18, 64, 'v'); }
  else if (d === 'tee') { tee(16, 56); }
  else if (d === 'pajamas') { tee(40, 30); }
  else tee(40, 64);
  };
  const edge = lum > 0.85 ? '#8a7a9a' : o;   // pale garments need a visible outline on a white tile
  shape(); ctx.save(); ctx.fillStyle = c; ctx.fill(); ctx.clip(); pattern(ctx, it, { x0: -80, y0: -70, x1: 80, y1: 90 }); ctx.restore();
  shape(); ctx.lineWidth = 5; ctx.strokeStyle = edge; ctx.lineJoin = 'round'; ctx.stroke();   // re-trace: pattern() replaced the current path
  if (d === 'hoodie') { ctx.beginPath(); ctx.ellipse(0, -62, 30, 16, 0, Math.PI, 0); of(ctx, dk(c, 0.1), o, 4); ctx.strokeStyle = it.trim; ctx.lineWidth = 4; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 10, -52); ctx.lineTo(s * 12, -28); ctx.stroke(); } ctx.beginPath(); ctx.roundRect(-26, 20, 52, 26, 8); of(ctx, dk(c, 0.08), o, 3); }
  if (d === 'raincoat') for (const y of [-20, 6, 32]) circ(ctx, 0, y, 5, it.trim);
  if (d === 'pajamas') { ctx.beginPath(); ctx.moveTo(-36, 36); ctx.lineTo(36, 36); ctx.lineTo(38, 80); ctx.lineTo(4, 80); ctx.lineTo(0, 54); ctx.lineTo(-4, 80); ctx.lineTo(-38, 80); ctx.closePath(); const legs = () => { ctx.beginPath(); ctx.moveTo(-36, 36); ctx.lineTo(36, 36); ctx.lineTo(38, 80); ctx.lineTo(4, 80); ctx.lineTo(0, 54); ctx.lineTo(-4, 80); ctx.lineTo(-38, 80); ctx.closePath(); }; ctx.save(); ctx.fillStyle = c; ctx.fill(); ctx.clip(); pattern(ctx, it, { x0: -40, y0: 30, x1: 40, y1: 84 }); ctx.restore(); legs(); ctx.lineWidth = 4; ctx.strokeStyle = edge; ctx.stroke(); }
  if (d === 'overalls') { ctx.strokeStyle = dk(c, 0.2); ctx.lineWidth = 8; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 22, -28); ctx.lineTo(s * 30, -64); ctx.stroke(); circ(ctx, s * 20, -22, 5, it.trim); } }
  if (d === 'cape') { circ(ctx, 0, -54, 9, it.trim); }
}
