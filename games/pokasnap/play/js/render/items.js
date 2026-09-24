/* COSMETIC RENDERER — draws equipped items at pose anchors.
   ---------------------------------------------------------------------------
   An item knows its slot and its anchor, never the pose. Coordinates below are
   in "anchor space": origin at the anchor, rotated with it, scaled by the
   pet's head size, so one drawing fits a fluffy cat and a puffball pup alike.

   Future raster items: an entry with art:'sprite' draws item.assetPath here at
   the same anchor, same scale -- no other code changes. */

import { item } from '../data/items.js';

const SLOT_ANCHOR = { HEAD: 'head_top', NECK: 'neck', BODY: 'body', FACE: 'face', SPECIAL: 'body' };

function dk(hex, a = 0.25) {
  const n = parseInt(hex.slice(1), 16);
  const f = v => Math.max(0, Math.round(v * (1 - a)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
function outlineFill(ctx, fill, stroke, lw = 4) {
  ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.stroke();
}

const DRAW = {
  /* ---------------- NECK (origin = under the chin) ---------------- */
  collar(ctx, it, A) {
    const w = A.w * 0.5;
    ctx.beginPath(); ctx.moveTo(-w, -10); ctx.quadraticCurveTo(0, 22, w, -10);
    ctx.lineTo(w, 4); ctx.quadraticCurveTo(0, 38, -w, 4); ctx.closePath();
    outlineFill(ctx, it.color, dk(it.color, .35));
    // tag
    ctx.beginPath(); ctx.arc(0, 38, 13, 0, Math.PI * 2); outlineFill(ctx, it.trim, dk(it.trim, .35), 3);
    ctx.fillStyle = dk(it.trim, .3); ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText('♥', 0, 43);
  },
  bowtie(ctx, it) {
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(s * 40, -12); ctx.quadraticCurveTo(s * 48, 8, s * 40, 28); ctx.closePath();
      outlineFill(ctx, it.color, it.trim);
    }
    ctx.beginPath(); ctx.ellipse(0, 8, 11, 13, 0, 0, Math.PI * 2); outlineFill(ctx, dk(it.color, .1), it.trim);
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 26, 4, 4, 0, Math.PI * 2); ctx.fill(); }
  },
  bandana(ctx, it, A) {
    const w = A.w * 0.52;
    ctx.beginPath(); ctx.moveTo(-w, -8); ctx.quadraticCurveTo(0, 12, w, -8);
    ctx.lineTo(8, 62); ctx.quadraticCurveTo(0, 70, -8, 62); ctx.closePath();
    outlineFill(ctx, it.color, dk(it.color, .35));
    ctx.fillStyle = it.trim;
    for (const [x, y] of [[-30, 8], [0, 24], [26, 10], [-10, 44], [12, 42]]) { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); }
  },
  medal(ctx, it, A) {
    const w = A.w * 0.42;
    ctx.beginPath(); ctx.moveTo(-w, -8); ctx.lineTo(-10, 40); ctx.lineTo(10, 40); ctx.lineTo(w, -8);
    ctx.lineWidth = 12; ctx.strokeStyle = it.trim; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 58, 22, 0, Math.PI * 2); outlineFill(ctx, it.color, dk(it.color, .4));
    ctx.fillStyle = '#fff6c9'; ctx.font = '900 24px system-ui'; ctx.textAlign = 'center'; ctx.fillText('★', 0, 67);
  },
  scarf(ctx, it, A) {
    const w = A.w * 0.55;
    ctx.beginPath(); ctx.moveTo(-w, -14); ctx.quadraticCurveTo(0, 20, w, -14);
    ctx.lineTo(w, 10); ctx.quadraticCurveTo(0, 46, -w, 10); ctx.closePath();
    outlineFill(ctx, it.color, dk(it.color, .35));
    ctx.beginPath(); ctx.roundRect(w * 0.35, 8, 30, 70, 8); outlineFill(ctx, it.color, dk(it.color, .35));
    ctx.strokeStyle = it.trim; ctx.lineWidth = 6;
    for (const y of [26, 48, 70]) { ctx.beginPath(); ctx.moveTo(w * 0.35 + 3, y); ctx.lineTo(w * 0.35 + 27, y); ctx.stroke(); }
  },

  /* ---------------- HEAD (origin = crown of the head) ---------------- */
  daisy(ctx, it, A) {
    if (!A.thumb) ctx.translate(A.hR * 0.5, 22);   // on the pet it sits by the ear; thumbnails centre it
    else ctx.scale(2, 2);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4; ctx.beginPath();
      ctx.ellipse(Math.cos(a) * 16, Math.sin(a) * 16, 11, 7, a, 0, Math.PI * 2);
      outlineFill(ctx, it.color, '#d9d4c8', 2.5);
    }
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); outlineFill(ctx, it.trim, '#d9a400', 3);
  },
  cap(ctx, it) {
    ctx.beginPath(); ctx.moveTo(-72, 26); ctx.bezierCurveTo(-72, -52, 72, -52, 72, 26); ctx.closePath();
    outlineFill(ctx, it.color, dk(it.color, .4), 5);
    ctx.beginPath(); ctx.ellipse(40, 28, 62, 13, -0.08, 0, Math.PI * 2); outlineFill(ctx, dk(it.color, .12), dk(it.color, .4), 5);
    ctx.beginPath(); ctx.arc(0, -26, 8, 0, Math.PI * 2); outlineFill(ctx, it.trim, dk(it.color, .4), 3);
    ctx.fillStyle = it.trim; ctx.font = '900 30px "Baloo 2", system-ui'; ctx.textAlign = 'center'; ctx.fillText('P', 0, 16);
  },
  beanie(ctx, it) {
    ctx.beginPath(); ctx.moveTo(-76, 30); ctx.bezierCurveTo(-76, -64, 76, -64, 76, 30); ctx.closePath();
    outlineFill(ctx, it.color, dk(it.color, .38), 5);
    ctx.beginPath(); ctx.roundRect(-80, 14, 160, 30, 14); outlineFill(ctx, dk(it.color, .1), dk(it.color, .38), 5);
    ctx.strokeStyle = dk(it.color, .18); ctx.lineWidth = 3;
    for (let x = -64; x <= 64; x += 16) { ctx.beginPath(); ctx.moveTo(x, 18); ctx.lineTo(x, 40); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(0, -46, 20, 0, Math.PI * 2); outlineFill(ctx, it.trim, '#d9d4c8', 4);
  },
  crown(ctx, it) {
    ctx.beginPath(); ctx.moveTo(-50, 20); ctx.lineTo(-56, -30); ctx.lineTo(-26, -6); ctx.lineTo(0, -44);
    ctx.lineTo(26, -6); ctx.lineTo(56, -30); ctx.lineTo(50, 20); ctx.closePath();
    const g = ctx.createLinearGradient(0, -44, 0, 20); g.addColorStop(0, '#fff2a8'); g.addColorStop(1, it.color);
    outlineFill(ctx, g, '#c79400', 5);
    for (const [x, y, c] of [[0, 2, it.trim], [-32, 8, '#3fa7ff'], [32, 8, '#3fd08a']]) { ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); outlineFill(ctx, c, '#ffffff', 2); }
  },
  party(ctx, it) {
    ctx.rotate(-0.22);
    ctx.beginPath(); ctx.moveTo(-40, 20); ctx.lineTo(0, -96); ctx.lineTo(40, 20); ctx.closePath();
    outlineFill(ctx, it.color, dk(it.color, .4), 5);
    ctx.save(); ctx.clip(); ctx.strokeStyle = it.trim; ctx.lineWidth = 10;
    for (let y = -80; y < 30; y += 26) { ctx.beginPath(); ctx.moveTo(-50, y + 20); ctx.lineTo(50, y - 10); ctx.stroke(); }
    ctx.restore();
    ctx.beginPath(); ctx.arc(0, -98, 13, 0, Math.PI * 2); outlineFill(ctx, it.trim, dk(it.trim, .35), 3);
  },
  starclip(ctx, it, A) {
    if (!A.thumb) ctx.translate(A.hR * 0.52, 18); else ctx.scale(2, 2);
    ctx.rotate(0.2); ctx.beginPath();
    for (let j = 0; j < 10; j++) { const r = j % 2 ? 11 : 26, a = -Math.PI / 2 + j * Math.PI / 5; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); outlineFill(ctx, it.color, it.trim, 3.5);
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(-6, -7, 4, 0, Math.PI * 2); ctx.fill();
  },
  rainhat(ctx, it) {
    ctx.beginPath(); ctx.ellipse(0, 8, 92, 22, 0, 0, Math.PI * 2); outlineFill(ctx, it.color, it.trim, 5);
    ctx.beginPath(); ctx.moveTo(-54, 8); ctx.quadraticCurveTo(-50, -58, 0, -60); ctx.quadraticCurveTo(50, -58, 54, 8); ctx.closePath();
    outlineFill(ctx, it.color, it.trim, 5);
    ctx.strokeStyle = it.trim; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(-52, -6); ctx.quadraticCurveTo(0, 6, 52, -6); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.ellipse(-22, -36, 10, 16, -0.4, 0, Math.PI * 2); ctx.fill();
  },
  leafcrown(ctx, it) {
    const cols = [it.color, it.trim, '#f2b233', it.color, '#d9602a', it.trim, it.color];
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i + 0.5) * Math.PI / 7, x = Math.cos(a) * 70, y = Math.sin(a) * 30 + 4;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a + Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(0, 10); ctx.quadraticCurveTo(-18, -8, 0, -34); ctx.quadraticCurveTo(18, -8, 0, 10); ctx.closePath();
      outlineFill(ctx, cols[i], dk(cols[i], .35), 3);
      ctx.strokeStyle = dk(cols[i], .35); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(0, -26); ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath(); ctx.ellipse(0, 6, 72, 12, 0, Math.PI, 0); ctx.strokeStyle = '#7a4a2a'; ctx.lineWidth = 6; ctx.stroke();
  },
  bunnyears(ctx, it) {
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(s * 34, 6); ctx.rotate(s * 0.18);
      ctx.beginPath(); ctx.ellipse(0, -62, 22, 64, 0, 0, Math.PI * 2); outlineFill(ctx, it.color, '#d9d4c8', 5);
      ctx.beginPath(); ctx.ellipse(0, -58, 11, 46, 0, 0, Math.PI * 2); ctx.fillStyle = it.trim; ctx.fill();
      ctx.restore();
    }
    ctx.beginPath(); ctx.roundRect(-58, 0, 116, 14, 7); outlineFill(ctx, '#ff8fb1', '#d9607f', 3);
  },

  /* ---------------- FACE (origin = between the eyes) ---------------- */
  sunnies(ctx, it, A) {
    const ex = A.hR * 0.4;
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.roundRect(s * ex - 36, -26, 72, 50, 20);
      const g = ctx.createLinearGradient(0, -26, 0, 24); g.addColorStop(0, '#3a3f5c'); g.addColorStop(1, it.color);
      outlineFill(ctx, g, it.trim, 6);
      ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.ellipse(s * ex - 12, -10, 12, 6, -0.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = it.trim; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-ex + 36, -6); ctx.quadraticCurveTo(0, -18, ex - 36, -6); ctx.stroke();
  },

  /* ---------------- BODY (origin = centre of the body) ---------------- */
  hoodie(ctx, it, A) {
    const rx = A.rx * 1.04, ry = A.ry * 1.02;
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, Math.PI * 1.08, Math.PI * 1.92, true);
    ctx.closePath(); outlineFill(ctx, it.color, dk(it.color, .38), 5);
    ctx.beginPath(); ctx.roundRect(-rx * 0.42, ry * 0.08, rx * 0.84, ry * 0.46, 14); outlineFill(ctx, dk(it.color, .1), dk(it.color, .38), 4);
    ctx.strokeStyle = it.trim; ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 14, -ry * 0.62); ctx.lineTo(s * 18, -ry * 0.2); ctx.stroke(); }
  },
  raincoat(ctx, it, A) {
    const rx = A.rx * 1.06, ry = A.ry * 1.04;
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, Math.PI * 1.1, Math.PI * 1.9, true);
    ctx.closePath(); outlineFill(ctx, it.color, it.trim, 5);
    ctx.fillStyle = it.trim;
    for (const y of [-ry * 0.3, 0, ry * 0.3]) { ctx.beginPath(); ctx.arc(0, y, 6, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = it.trim; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, -ry * 0.7); ctx.lineTo(0, ry * 0.8); ctx.stroke();
  },
};

/* ------------------------------------------------------------ FRAMES --
   Drawn over the whole photo (and the camera preview) at size W x H. */
function star(ctx, x, y, r, col) {
  ctx.beginPath();
  for (let j = 0; j < 10; j++) { const rr = j % 2 ? r * 0.42 : r, a = -Math.PI / 2 + j * Math.PI / 5; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fillStyle = col; ctx.fill();
}
function heartAt(ctx, x, y, s, col) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.beginPath();
  ctx.moveTo(0, 6); ctx.bezierCurveTo(-14, -6, -8, -18, 0, -9); ctx.bezierCurveTo(8, -18, 14, -6, 0, 6);
  ctx.fillStyle = col; ctx.fill(); ctx.restore();
}
function border(ctx, W, H, b, col, r) {
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.roundRect(b, b, W - 2 * b, H - 2 * b, r); ctx.fillStyle = col; ctx.fill('evenodd'); ctx.restore();
}
function around(W, H, n, fn) {           // n points spread along the edge
  const per = 2 * (W + H), out = [];
  for (let i = 0; i < n; i++) { let d = (i + 0.5) * per / n, x, y;
    if (d < W) { x = d; y = 0; } else if ((d -= W) < H) { x = W; y = d; } else if ((d -= H) < W) { x = W - d; y = H; } else { d -= W; x = 0; y = H - d; }
    fn(x, y, i); }
}
export const FRAMES = {
  frame_trail(ctx, it, W, H) {
    const u = Math.min(W, H) / 100; border(ctx, W, H, 3.2 * u, it.color, 4 * u);
    ctx.fillStyle = it.trim; ctx.globalAlpha = .75;
    for (let i = 0; i < 7; i++) { const x = W * (0.12 + i * 0.13), y = H - 1.6 * u - (i % 2) * 1.2 * u;
      ctx.beginPath(); ctx.ellipse(x, y, 1.1 * u, 1.5 * u, 0.3, 0, 7); ctx.fill();
      for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.arc(x + k * 0.9 * u, y - 1.9 * u, 0.45 * u, 0, 7); ctx.fill(); } }
    ctx.globalAlpha = 1;
    for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) for (let k = 0; k < 3; k++) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(k * 0.9 + (x ? 2 : 0)); ctx.beginPath(); ctx.ellipse(6 * u, 0, 5 * u, 2.2 * u, 0, 0, 7);
      ctx.fillStyle = ['#4f9a5b', '#7cc85a', '#3f7f4a'][k]; ctx.fill(); ctx.restore(); }
  },
  frame_puddle(ctx, it, W, H, t = 0) {
    const u = Math.min(W, H) / 100; border(ctx, W, H, 3 * u, it.color, 5 * u);
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    for (let i = 0; i < 9; i++) { const x = W * (0.08 + i * 0.105), y = 1.5 * u + ((t * 20 + i * 7) % 5) * u * 0.3;
      ctx.beginPath(); ctx.moveTo(x, y - 1.6 * u); ctx.quadraticCurveTo(x + 1.1 * u, y + 0.4 * u, x, y + 1.1 * u); ctx.quadraticCurveTo(x - 1.1 * u, y + 0.4 * u, x, y - 1.6 * u); ctx.fill(); }
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 0.6 * u;
    for (const [x, r] of [[0.2, 6], [0.5, 9], [0.8, 5]]) { ctx.beginPath(); ctx.ellipse(W * x, H - 1.5 * u, r * u, r * u * 0.3, 0, Math.PI, 0); ctx.stroke(); }
  },
  frame_sparkle(ctx, it, W, H, t = 0) {
    const u = Math.min(W, H) / 100; border(ctx, W, H, 1.8 * u, '#ffffff', 3 * u);
    around(W, H, 14, (x, y, i) => star(ctx, x + (x < W / 2 ? 3 : -3) * u, y + (y < H / 2 ? 3 : -3) * u, (2.2 + (i % 3)) * u * (0.8 + 0.2 * Math.sin(t * 4 + i)), i % 2 ? it.color : '#fff6c9'));
  },
  frame_confetti(ctx, it, W, H) {
    const u = Math.min(W, H) / 100, cols = ['#ff6b8b', '#5ec8f2', '#ffd84a', '#53d3a2', '#a98bf0'];
    border(ctx, W, H, 1.6 * u, '#ffffff', 3 * u);
    around(W, H, 46, (x, y, i) => { ctx.save(); ctx.translate(x + (x < W / 2 ? 2.5 : -2.5) * u * ((i * 7) % 3), y + (y < H / 2 ? 2.5 : -2.5) * u * ((i * 5) % 3));
      ctx.rotate(i * 1.7); ctx.fillStyle = cols[i % 5]; ctx.fillRect(-1.2 * u, -0.5 * u, 2.4 * u, 1 * u); ctx.restore(); });
  },
  frame_hearts(ctx, it, W, H) {
    const u = Math.min(W, H) / 100; border(ctx, W, H, 2.6 * u, it.trim, 4 * u);
    around(W, H, 22, (x, y, i) => heartAt(ctx, x + (x < W / 2 ? 2.6 : -2.6) * u, y + (y < H / 2 ? 2.6 : -2.6) * u, u * (i % 2 ? 0.22 : 0.3), i % 3 ? it.color : '#ff8fb1'));
  },
  frame_leaves(ctx, it, W, H) {
    const u = Math.min(W, H) / 100, cols = ['#e8812f', '#c9384f', '#f2b233', '#b5452b'];
    border(ctx, W, H, 1.8 * u, '#fff4e6', 3 * u);
    around(W, H, 26, (x, y, i) => { ctx.save(); ctx.translate(x + (x < W / 2 ? 3 : -3) * u, y + (y < H / 2 ? 3 : -3) * u); ctx.rotate(i * 2.1);
      ctx.beginPath(); ctx.moveTo(0, 2.4 * u); ctx.quadraticCurveTo(-3 * u, -1 * u, 0, -4 * u); ctx.quadraticCurveTo(3 * u, -1 * u, 0, 2.4 * u);
      ctx.fillStyle = cols[i % 4]; ctx.fill(); ctx.restore(); });
  },
};
export function drawFrame(ctx, id, W, H, t = 0) {
  const it = item(id); if (!it || !FRAMES[it.draw]) return;
  ctx.save(); FRAMES[it.draw](ctx, it, W, H, t); ctx.restore();
}

/**
 * Draw every equipped item in `slot` at its anchor.
 * @param equipped { HEAD:itemID, NECK:itemID, ... }
 * @param layer    'behind' for SPECIAL items drawn behind the pet
 */
export function drawItems(ctx, equipped, slot, anchors, t, layer) {
  const id = equipped && equipped[slot];
  if (!id) return;
  const it = item(id); if (!it) return;
  if (slot === 'SPECIAL' && layer !== 'behind') return;
  const fn = DRAW[it.draw]; if (!fn) return;
  const A = anchors[SLOT_ANCHOR[slot]];
  ctx.save();
  ctx.translate(A.x, A.y); ctx.rotate(A.rot || 0); ctx.scale(A.scale || 1, A.scale || 1);
  fn(ctx, it, { ...A, hR: (A.hR || 115) / (A.scale || 1), w: (A.w || 120) / (A.scale || 1), rx: (A.rx || 60) / (A.scale || 1), ry: (A.ry || 60) / (A.scale || 1) }, t);
  ctx.restore();
}

/* Thumbnail for the closet: the item alone, centred. */
export function drawItemThumb(canvas, id) {
  const it = item(id); if (!it) return;
  const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (it.slot === 'FRAME') {
    ctx.save(); ctx.translate(W * 0.14, H * 0.08);
    const w = W * 0.72, h = H * 0.84, g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#bfe6ff'); g.addColorStop(1, '#d9f2c6'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    FRAMES[it.draw](ctx, it, w, h, 0.4); ctx.restore(); return;
  }
  if (it.slot === 'POSE' || it.slot === 'LOOK') {
    const g = ctx.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, W / 2);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, it.color); ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(W / 2, H / 2, W * 0.42, 0, 7); ctx.fill();
    ctx.font = `${Math.round(W * 0.42)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(it.slot === 'LOOK' ? '🎨' : (it.icon || '💫'), W / 2, H / 2 + 2); return;
  }
  ctx.save(); ctx.translate(W / 2, H * (it.draw === 'daisy' || it.draw === 'starclip' ? 0.5 : it.slot === 'HEAD' ? 0.66 : it.slot === 'NECK' ? 0.36 : 0.5));
  const s = W / 190; ctx.scale(s, s);
  DRAW[it.draw]?.(ctx, it, { hR: 115, w: 120, rx: 70, ry: 60, thumb: true });
  ctx.restore();
}
