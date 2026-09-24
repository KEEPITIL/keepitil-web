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
  ctx.save(); ctx.translate(W / 2, H * (it.draw === 'daisy' ? 0.5 : it.slot === 'HEAD' ? 0.66 : it.slot === 'NECK' ? 0.36 : 0.5));
  const s = W / 190; ctx.scale(s, s);
  DRAW[it.draw](ctx, it, { hR: 115, w: 120, rx: 70, ry: 60, thumb: true });
  ctx.restore();
}
