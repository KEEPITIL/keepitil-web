/* PLUSH PET RENDERER — one renderer, every species, every pose.
   ---------------------------------------------------------------------------
   Style: plush toy. Chibi proportions (head ~ as big as the body), oversized
   glossy eyes with two highlights, blush, soft scalloped fur edges, chunky
   bean paws, and a warm outline one shade darker than the fur.

   Coordinate system: the standard 512 pet canvas with the ORIGIN AT THE CENTRE
   OF THE FEET and y increasing downward (so everything above ground is
   negative y). The caller positions/scales/rotates the pet by transforming the
   context before calling drawPet().

   drawPet() returns the ANCHORS for that exact pose and frame:
     head_top, face, neck, body   -> where cosmetics attach
     bbox                         -> hit-testing and scoring
   Cosmetics never know which pose is active; they only read anchors. */

import { species as speciesOf, appearance as appearanceOf } from '../data/pets.js';
import { pose as poseOf } from '../data/poses.js';
import { drawItems } from './items.js';

/* ---------------------------------------------------------------- colour -- */
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = amt < 0 ? 0 : 255, p = Math.abs(amt);
  r = Math.round((f - r) * p + r); g = Math.round((f - g) * p + g); b = Math.round((f - b) * p + b);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/* ------------------------------------------------------------ fur shapes -- */
/* A soft ellipse whose outline is scalloped into fur tufts. amp=0 is sleek. */
function furEllipse(ctx, cx, cy, rx, ry, bumps, amp, phase = 0) {
  ctx.beginPath();
  if (amp <= 0.2) { ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.closePath(); return; }
  const n = bumps;
  for (let i = 0; i <= n; i++) {
    const a0 = (i / n) * Math.PI * 2 + phase;
    const a1 = ((i + 0.5) / n) * Math.PI * 2 + phase;
    const x0 = cx + Math.cos(a0) * rx, y0 = cy + Math.sin(a0) * ry;
    const cxp = cx + Math.cos(a1) * (rx + amp), cyp = cy + Math.sin(a1) * (ry + amp);
    if (i === 0) ctx.moveTo(x0, y0);
    else ctx.quadraticCurveTo(cxpPrev, cypPrev, x0, y0);
    var cxpPrev = cxp, cypPrev = cyp;
  }
  ctx.closePath();
}

function fillFur(ctx, cx, cy, rx, ry, pal, outline, gradOffsetY = -0.35) {
  const g = ctx.createRadialGradient(cx - rx * 0.25, cy + ry * gradOffsetY, Math.min(rx, ry) * 0.15, cx, cy, Math.max(rx, ry) * 1.1);
  g.addColorStop(0, shade(pal.base, 0.18));
  g.addColorStop(0.6, pal.base);
  g.addColorStop(1, pal.shade);
  ctx.fillStyle = g;
  ctx.fill();
  if (outline) { ctx.lineWidth = 5; ctx.strokeStyle = outline; ctx.lineJoin = 'round'; ctx.stroke(); }
}

function blob(ctx, x, y, rx, ry, rot, fill, stroke, lw = 4) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
}

/* ------------------------------------------------------------- geometry -- */
/* Everything the frame needs is computed ONCE here from species + posture, so
   anchors and drawing can never disagree. */
function layout(sp, ps, t, squash) {
  const breathe = 1 + Math.sin(t * 2.4) * 0.018;
  const hR = sp.headR;
  let lift = 0, body;
  switch (ps.posture) {
    case 'sit':  body = { cx: 0, rx: sp.bodyW * 0.58, ry: sp.bodyH * 0.56 }; break;
    case 'lay':  body = { cx: 0, rx: sp.bodyW * 0.86, ry: sp.bodyH * 0.40 }; break;
    case 'jump': body = { cx: 0, rx: sp.bodyW * 0.48, ry: sp.bodyH * 0.66 }; lift = 58 + Math.sin(t * 6) * 6; break;
    case 'swim': body = { cx: 0, rx: sp.bodyW * 0.58, ry: sp.bodyH * 0.56 }; break;
    default:     body = { cx: 0, rx: sp.bodyW * 0.50, ry: sp.bodyH * 0.62 };
  }
  // poke squash: a quick squash-and-stretch that reads as "boing"
  const sq = squash || 0;
  body.rx *= 1 + sq * 0.16; body.ry *= (1 - sq * 0.14) * breathe;
  body.cy = -body.ry - lift;
  const overlap = ps.posture === 'lay' ? 0.78 : 0.86;
  const headY = body.cy - body.ry * overlap - hR * 0.62 + sq * 10;
  return { hR, body, headY, lift, pivot: { x: 0, y: headY + hR * 0.82 } };
}

function rot(p, pivot, a) {
  const s = Math.sin(a), c = Math.cos(a), dx = p.x - pivot.x, dy = p.y - pivot.y;
  return { x: pivot.x + dx * c - dy * s, y: pivot.y + dx * s + dy * c };
}

/* ----------------------------------------------------------------- parts -- */
function drawTail(ctx, sp, pal, L, ps, t, outline) {
  const wag = Math.sin(t * 5) * 0.35 * (ps.tailWag || 0) + Math.sin(t * 1.8) * 0.12;   // 2.0: a slow idle sway, always
  const baseX = L.body.rx * 0.72, baseY = L.body.cy + L.body.ry * 0.35;
  ctx.save(); ctx.translate(baseX, baseY); ctx.rotate(-0.5 + wag);
  switch (sp.tail) {
    case 'plume': case 'feather': {
      const segs = 6;
      for (let i = segs; i >= 0; i--) {
        const k = i / segs;
        const x = Math.sin(k * 1.9) * 58, y = -k * 120;
        furEllipse(ctx, x, y, 30 - k * 6, 34 - k * 6, 10, sp.tail === 'plume' ? 7 : 5);
        fillFur(ctx, x, y, 30, 34, pal, i === segs || i === 0 ? outline : null);
      }
      if (sp.tail === 'plume') { furEllipse(ctx, Math.sin(1.9) * 58, -120, 22, 22, 10, 6); ctx.fillStyle = shade(pal.base, .35); ctx.fill(); }
      break;
    }
    case 'thin': {
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(50, -30, 20, -110, 70, -140);
      ctx.lineWidth = 30; ctx.strokeStyle = outline; ctx.stroke();
      ctx.lineWidth = 21; ctx.strokeStyle = pal.base; ctx.stroke();
      if (pal.patch) { ctx.lineWidth = 21; ctx.setLineDash([12, 16]); ctx.strokeStyle = pal.patch; ctx.stroke(); ctx.setLineDash([]); }
      break;
    }
    case 'pom':    furEllipse(ctx, 18, -30, 34, 32, 12, 7); fillFur(ctx, 18, -30, 34, 32, pal, outline); break;
    case 'cotton': furEllipse(ctx, 10, -6, 30, 28, 12, 6); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = shade(pal.shade, -.15); ctx.stroke(); break;
  }
  ctx.restore();
}

function drawBody(ctx, sp, pal, L, ps, outline) {
  const b = L.body, amp = 3 + sp.fluff * 8;
  // haunches for sitting poses read as a plush that "sits"
  if (ps.posture === 'sit' || ps.posture === 'swim') {
    for (const s of [-1, 1]) { furEllipse(ctx, s * b.rx * 0.62, -30, b.rx * 0.48, 36, 10, amp * 0.7); fillFur(ctx, s * b.rx * 0.62, -30, b.rx * 0.48, 36, pal, outline); }
  }
  furEllipse(ctx, b.cx, b.cy, b.rx, b.ry, 18, amp, 0.2);
  fillFur(ctx, b.cx, b.cy, b.rx, b.ry, pal, outline);
  // tummy
  const bellyR = ps.posture === 'lay' ? b.ry * 0.6 : b.ry * 0.72;
  furEllipse(ctx, b.cx, b.cy + b.ry * 0.12, b.rx * 0.55, bellyR, 14, amp * 0.5, 0.3);
  ctx.fillStyle = pal.belly; ctx.fill();
  // 2.0 fluff: a chest ruff of layered tufts + a few soft fur strokes on the flanks
  if (ps.posture !== 'lay') {
    furEllipse(ctx, b.cx, b.cy - b.ry * 0.48, b.rx * 0.46, b.ry * 0.24, 11, 5 + sp.fluff * 7, 0.4); ctx.fillStyle = shade(pal.belly, 0.05); ctx.fill();
    furEllipse(ctx, b.cx, b.cy - b.ry * 0.36, b.rx * 0.3, b.ry * 0.16, 9, 4 + sp.fluff * 5, 0.9); ctx.fillStyle = pal.belly; ctx.fill();
  }
  ctx.save(); ctx.strokeStyle = shade(pal.shade, -0.08); ctx.globalAlpha = 0.35; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
  for (const sgn of [-1, 1]) for (let i = 0; i < 3; i++) { const x = sgn * b.rx * (0.62 + i * 0.1), y = b.cy - b.ry * 0.1 + i * b.ry * 0.28;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + sgn * 8, y + 7, x + sgn * 3, y + 16); ctx.stroke(); }
  ctx.restore();
}

function drawBackFeet(ctx, pal, L, ps, outline) {
  if (ps.posture === 'jump') return;
  const b = L.body, y = -14 - (ps.posture === 'jump' ? L.lift : 0);
  const spread = ps.posture === 'lay' ? b.rx * 0.9 : b.rx * 0.78;
  for (const s of [-1, 1]) blob(ctx, s * spread, y, 30, 18, 0, pal.base, outline, 5);
}

function drawPaw(ctx, x, y, r, rotA, pal, outline) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rotA);
  blob(ctx, 0, 0, r, r * 0.78, 0, pal.base, outline, 5);
  // toe beans
  ctx.fillStyle = shade(pal.inner || '#f3a6b6', 0.15);
  for (const tx of [-r * 0.42, 0, r * 0.42]) { ctx.beginPath(); ctx.ellipse(tx, -r * 0.18, r * 0.16, r * 0.13, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

function drawFrontPaws(ctx, sp, pal, L, ps, t, outline) {
  const b = L.body, r = 24;
  const groundY = -14 - L.lift;
  switch (ps.paw) {
    case 'up': {
      for (const s of [-1, 1]) drawPaw(ctx, s * (L.hR * 0.62), L.headY + L.hR * 0.58, r, s * 0.5, pal, outline);
      break;
    }
    case 'tuck': {
      for (const s of [-1, 1]) drawPaw(ctx, s * 34, -18, r, 0, pal, outline);
      break;
    }
    case 'wave': {
      drawPaw(ctx, -b.rx * 0.36, groundY, r, 0, pal, outline);
      break; // the waving paw is drawn last so it sits in front of the face
    }
    default: {
      const spread = ps.posture === 'stand' || ps.posture === 'jump' ? b.rx * 0.46 : b.rx * 0.34;
      for (const s of [-1, 1]) drawPaw(ctx, s * spread, groundY, r, 0, pal, outline);
    }
  }
}

function drawWavePaw(ctx, pal, L, t, outline) {
  const a = Math.sin(t * 9) * 0.45;
  const px = L.hR * 0.92, py = L.headY + L.hR * 0.25;
  ctx.save(); ctx.translate(px, py + 30); ctx.rotate(a);
  // little arm
  ctx.lineCap = 'round'; ctx.lineWidth = 34; ctx.strokeStyle = outline;
  ctx.beginPath(); ctx.moveTo(0, 30); ctx.lineTo(0, -10); ctx.stroke();
  ctx.lineWidth = 25; ctx.strokeStyle = pal.base; ctx.stroke();
  drawPaw(ctx, 0, -24, 25, 0, pal, outline);
  ctx.restore();
  // motion arcs
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(80,80,110,.45)'; ctx.lineCap = 'round';
  for (const k of [1, 2]) { ctx.beginPath(); ctx.arc(px, py, 50 + k * 12, -1.6, -0.9); ctx.stroke(); }
}

function earPath(ctx, kind, s, hR, earMul, pose) {
  // returns [outer path fn, inner path fn] drawn in head-local coords
  const size = hR * earMul;
  if (kind === 'cat') {
    const perk = pose.ears === 'perk' ? 1.12 : pose.ears === 'back' ? 0.82 : 1;
    const tilt = pose.ears === 'back' ? 0.75 : 0.28;
    return (inner) => {
      ctx.save(); ctx.translate(s * hR * 0.58, -hR * 0.62); ctx.rotate(s * tilt);
      const h = size * 0.62 * perk * (inner ? 0.62 : 1), w = size * 0.36 * (inner ? 0.55 : 1);
      ctx.beginPath(); ctx.moveTo(-w, 0); ctx.quadraticCurveTo(-w * 0.35, -h * 1.05, 0, -h);
      ctx.quadraticCurveTo(w * 0.35, -h * 1.05, w, 0); ctx.closePath(); ctx.restore();
    };
  }
  if (kind === 'bunny') {
    const back = pose.ears === 'back';
    return (inner) => {
      ctx.save(); ctx.translate(s * hR * 0.34, -hR * 0.72); ctx.rotate(s * (back ? 1.05 : 0.14));
      const h = size * 1.05 * (inner ? 0.78 : 1), w = size * 0.2 * (inner ? 0.5 : 1);
      ctx.beginPath(); ctx.ellipse(0, -h * 0.55, w, h * 0.55, 0, 0, Math.PI * 2); ctx.restore();
    };
  }
  if (kind === 'pom') {
    return (inner) => {
      if (inner) return false;
      furEllipse(ctx, s * hR * 0.78, -hR * 0.42, size * 0.3, size * 0.34, 10, 7);
    };
  }
  return null;
}

function drawEarsBehind(ctx, sp, pal, L, ps, outline) {
  for (const s of [-1, 1]) {
    const p = earPath(ctx, sp.ears, s, L.hR, sp.earSize, ps);
    if (!p) continue;
    p(false); ctx.fillStyle = pal.base; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = outline; ctx.lineJoin = 'round'; ctx.stroke();
    if (p(true) !== false) { ctx.fillStyle = pal.inner; ctx.fill(); }
  }
}

function drawFloppyEars(ctx, sp, pal, L, ps, t, outline) {
  if (sp.ears !== 'floppy') return;
  const swing = Math.sin(t * 3) * 0.05 + (ps.ears === 'perk' ? -0.18 : ps.ears === 'back' ? 0.2 : 0);
  for (const s of [-1, 1]) {
    // Hung from the OUTER edge of the head and angled outward: the first cut
    // hung them inward, where they covered the eyes and read as earmuffs.
    ctx.save(); ctx.translate(s * L.hR * 0.9, -L.hR * 0.42); ctx.rotate(s * (0.42 + swing));
    furEllipse(ctx, s * L.hR * 0.06, L.hR * 0.34, L.hR * 0.21, L.hR * 0.46, 12, 5);
    const g = ctx.createLinearGradient(0, 0, 0, L.hR);
    g.addColorStop(0, pal.shade); g.addColorStop(1, shade(pal.shade, -.12));
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = outline; ctx.stroke();
    ctx.restore();
  }
}

function drawHead(ctx, sp, pal, L, outline) {
  const hR = L.hR, amp = 2 + sp.fluff * 9;
  furEllipse(ctx, 0, 0, hR, hR * 0.9, 22, amp, 0.12);
  fillFur(ctx, 0, 0, hR, hR * 0.9, pal, outline, -0.45);
  // fluffy cheek tufts make the round head read as a plush face
  // 2.0: every Poka gets cheek tufts (bigger on fluffy species) and a little crown tuft
  for (const s of [-1, 1]) { furEllipse(ctx, s * hR * 0.86, hR * 0.22, hR * (0.2 + sp.fluff * 0.06), hR * (0.17 + sp.fluff * 0.05), 8, 4 + sp.fluff * 3); ctx.fillStyle = shade(pal.base, 0.08); ctx.fill(); }
  for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.ellipse(i * hR * 0.14, -hR * 0.86 - (i ? 0 : 6), hR * 0.1, hR * 0.13, i * 0.5, 0, Math.PI * 2); ctx.fillStyle = shade(pal.base, 0.06); ctx.fill(); }
  // markings
  if (pal.patch) {
    ctx.strokeStyle = pal.patch; ctx.lineCap = 'round'; ctx.lineWidth = 9;
    for (const dx of [-24, 0, 24]) { ctx.beginPath(); ctx.moveTo(dx, -hR * 0.82); ctx.lineTo(dx * 0.8, -hR * 0.58); ctx.stroke(); }
  }
}

function drawEye(ctx, x, y, r, kind, pal, t, blink) {
  const closed = blink && kind !== 'happy' && kind !== 'closed';
  if (kind === 'happy') {
    ctx.lineCap = 'round'; ctx.lineWidth = 9; ctx.strokeStyle = '#2b1d1a';
    ctx.beginPath(); ctx.arc(x, y + r * 0.35, r * 0.72, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke(); return;
  }
  if (kind === 'closed' || closed) {
    ctx.lineCap = 'round'; ctx.lineWidth = 8; ctx.strokeStyle = '#2b1d1a';
    ctx.beginPath(); ctx.arc(x, y - r * 0.15, r * 0.72, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke(); return;
  }
  const big = kind === 'wide' ? 1.12 : 1;
  const rx = r * 0.82 * big, ry = r * big;
  // sclera-less plush eye: dark glossy button with a coloured lower ring
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(x, y + ry * 0.45, ry * 0.1, x, y, ry);
  g.addColorStop(0, pal.eye); g.addColorStop(0.55, shade(pal.eye, -0.55)); g.addColorStop(1, '#1b1216');
  ctx.fillStyle = g; ctx.fill();
  // highlights make the character feel alive
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.ellipse(x - rx * 0.32, y - ry * 0.36, rx * 0.32, ry * 0.3, -0.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + rx * 0.3, y + ry * 0.28, rx * 0.14, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(x + rx * 0.05, y - ry * 0.62, rx * 0.08, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
}

function drawFace(ctx, sp, pal, L, ps, t, blink) {
  const hR = L.hR, ex = hR * 0.4, ey = hR * 0.02, er = hR * 0.2;
  // blush
  ctx.fillStyle = 'rgba(255,120,150,.35)';
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * hR * 0.62, hR * 0.3, hR * 0.15, hR * 0.09, 0, 0, Math.PI * 2); ctx.fill(); }
  // eyes
  if (ps.eyes === 'wink') { drawEye(ctx, -ex, ey, er, 'open', pal, t, false); drawEye(ctx, ex, ey, er, 'happy', pal, t, false); }
  else for (const s of [-1, 1]) drawEye(ctx, s * ex, ey, er, ps.eyes, pal, t, blink);
  // muzzle
  const my = hR * 0.36;
  if (sp.muzzle === 'dog' || sp.muzzle === 'dogSmall') {
    const w = sp.muzzle === 'dog' ? hR * 0.36 : hR * 0.3;
    blob(ctx, 0, my + 6, w, hR * 0.24, 0, pal.belly, null);
  } else {
    for (const s of [-1, 1]) blob(ctx, s * hR * 0.1, my + 8, hR * 0.13, hR * 0.11, 0, pal.belly, null);
  }
  // nose
  const nose = sp.muzzle === 'bunny' ? '#f08fa6' : sp.animal === 'dog' ? '#2b1d1a' : '#f08fa6';
  ctx.fillStyle = nose; ctx.beginPath();
  const nw = sp.animal === 'dog' ? hR * 0.12 : hR * 0.075;
  ctx.moveTo(-nw, my - 8); ctx.quadraticCurveTo(0, my - 14, nw, my - 8);
  ctx.quadraticCurveTo(nw * 0.4, my + 6, 0, my + 7); ctx.quadraticCurveTo(-nw * 0.4, my + 6, -nw, my - 8);
  ctx.fill();
  if (sp.animal === 'dog') { ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.ellipse(-nw * 0.35, my - 6, nw * 0.3, 3, 0, 0, Math.PI * 2); ctx.fill(); }
  // mouth
  ctx.strokeStyle = '#2b1d1a'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const m = ps.mouth, mY = my + 12;
  if (m === 'open' || m === 'tongue') {
    ctx.beginPath(); ctx.moveTo(-22, mY + 2); ctx.quadraticCurveTo(0, mY + 40, 22, mY + 2); ctx.closePath();
    ctx.fillStyle = '#6b2a35'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff7b93'; ctx.beginPath(); ctx.ellipse(0, mY + 20, 12, 9, 0, 0, Math.PI * 2); ctx.fill();
    if (m === 'tongue') { ctx.beginPath(); ctx.ellipse(8, mY + 30, 10, 13, 0.3, 0, Math.PI * 2); ctx.fillStyle = '#ff7b93'; ctx.fill(); ctx.lineWidth = 3; ctx.stroke(); }
  } else if (m === 'o') {
    ctx.beginPath(); ctx.ellipse(0, mY + 12, 10, 12, 0, 0, Math.PI * 2); ctx.fillStyle = '#6b2a35'; ctx.fill(); ctx.stroke();
  } else if (m === 'sleepy') {
    ctx.beginPath(); ctx.moveTo(-8, mY + 8); ctx.quadraticCurveTo(0, mY + 12, 8, mY + 8); ctx.stroke();
  } else {
    // the "w" smile
    ctx.beginPath(); ctx.moveTo(-20, mY); ctx.quadraticCurveTo(-10, mY + 14, 0, mY + 2);
    ctx.quadraticCurveTo(10, mY + 14, 20, mY); ctx.stroke();
  }
  // whiskers for cats
  if (sp.animal === 'cat') {
    ctx.strokeStyle = 'rgba(60,40,40,.45)'; ctx.lineWidth = 3;
    for (const s of [-1, 1]) for (const k of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(s * hR * 0.3, my + 4 + k * 8); ctx.lineTo(s * hR * 0.75, my + k * 16); ctx.stroke();
    }
  }
}

/* ------------------------------------------------------------------- fx -- */
function heart(ctx, x, y, s, col) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.beginPath();
  ctx.moveTo(0, 6); ctx.bezierCurveTo(-14, -6, -8, -18, 0, -9); ctx.bezierCurveTo(8, -18, 14, -6, 0, 6);
  ctx.fillStyle = col; ctx.fill(); ctx.restore();
}
function drawFx(ctx, fx, L, t) {
  if (!fx) return;
  const top = L.headY - L.hR, hR = L.hR;
  ctx.save();
  if (fx === 'hearts') for (let i = 0; i < 3; i++) {
    const k = ((t * 0.7 + i / 3) % 1);
    ctx.globalAlpha = 1 - k; heart(ctx, (i - 1) * 60 + Math.sin(t * 3 + i) * 10, top - k * 90, 1.6 + i * 0.2, ['#ff5f8f', '#ff86a8', '#ff4f7a'][i]);
  }
  if (fx === 'zzz') {
    ctx.fillStyle = '#6c7bd8'; ctx.font = 'bold 44px "Baloo 2", system-ui, sans-serif';
    for (let i = 0; i < 3; i++) { const k = ((t * 0.5 + i / 3) % 1); ctx.globalAlpha = 1 - k; ctx.fillText('z', hR * 0.7 + k * 60, top - k * 80 + 30); }
  }
  if (fx === 'sparkle') for (let i = 0; i < 5; i++) {
    const a = i * 1.26 + t * 1.5, r = hR * 1.25 + Math.sin(t * 4 + i) * 12;
    const x = Math.cos(a) * r, y = L.headY + Math.sin(a) * r * 0.9, s = 8 + Math.sin(t * 6 + i) * 3;
    ctx.fillStyle = '#ffd84a'; ctx.beginPath();
    for (let j = 0; j < 8; j++) { const rr = j % 2 ? s * 0.35 : s; const aa = j * Math.PI / 4; ctx.lineTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr); }
    ctx.closePath(); ctx.fill();
  }
  if (fx === 'bang') {
    ctx.fillStyle = '#ff5a4f'; ctx.font = '900 64px "Baloo 2", system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('!', hR * 0.95, top + 10 + Math.sin(t * 12) * 4);
  }
  if (fx === 'notes') {
    ctx.fillStyle = '#8a63d2'; ctx.font = '900 46px system-ui, sans-serif'; ctx.textAlign = 'center';
    for (let i = 0; i < 3; i++) { const k = ((t * 0.6 + i / 3) % 1); ctx.globalAlpha = 1 - k;
      ctx.fillText(i % 2 ? '♫' : '♪', (i - 1) * hR * 0.9 + Math.sin(t * 4 + i) * 12, top - k * 90 + 10); }
  }
  if (fx === 'question') {
    ctx.fillStyle = '#5ab0e8'; ctx.font = '900 60px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('?', hR * 0.95, top + 6 + Math.sin(t * 5) * 5);
  }
  ctx.restore();
}

/* Swimming: the lower body disappears under a rippling water line. */
function drawWater(ctx, L, t) {
  const y = L.body.cy - L.body.ry * 0.05, w = L.body.rx * 1.9;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(-w, y);
  for (let x = -w; x <= w; x += 12) ctx.lineTo(x, y + Math.sin(x * 0.06 + t * 4) * 5);
  // a rounded pool ring rather than a hard band, fading at the sides so it
  // sits on top of any real photo without a visible rectangle
  ctx.quadraticCurveTo(w * 1.02, y + 30, w * 0.8, 34); ctx.lineTo(-w * 0.8, 34);
  ctx.quadraticCurveTo(-w * 1.02, y + 30, -w, y); ctx.closePath();
  const g = ctx.createLinearGradient(0, y, 0, 40);
  g.addColorStop(0, 'rgba(110,205,250,.9)'); g.addColorStop(1, 'rgba(40,140,220,.55)');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 5; ctx.beginPath();
  for (let x = -w; x <= w; x += 12) { const yy = y + Math.sin(x * 0.06 + t * 4) * 5; x === -w ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); }
  ctx.stroke();
  // splash droplets
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  for (let i = 0; i < 6; i++) { const k = (t * 1.2 + i / 6) % 1; ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.arc((i - 2.5) * 36, y - k * 50, 5, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

/* ----------------------------------------------------------------- main -- */
/**
 * @param ctx      CanvasRenderingContext2D, transformed so the origin is the pet's feet
 * @param pet      { species, appearance, equipped:{HEAD,NECK,BODY,FACE,SPECIAL} }
 * @param poseId   key of POSES
 * @param o        { t: seconds, blink: bool, squash: 0..1, shadow: bool }
 * @returns        { anchors, bbox }
 */
export function drawPet(ctx, pet, poseId, o = {}) {
  const sp = speciesOf(pet.species), pal = appearanceOf(pet.species, pet.appearance), ps = poseOf(poseId);
  const t = o.t || 0, run = o.alive && o.gait > 0.2 ? Math.max(0, Math.sin(t * 9)) * 0.28 * o.gait : 0;   // 2.0: squash-and-stretch on every stride
  const L = layout(sp, ps, t, o.squash || run);
  const outline = shade(pal.shade, -0.32);

  // ground shadow (skipped for the saved photo if the caller asks)
  if (o.shadow !== false) {
    const shrink = L.lift ? 0.7 : 1;
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath();
    ctx.ellipse(0, 4, L.body.rx * 1.25 * shrink, 16 * shrink, 0, 0, Math.PI * 2); ctx.fill();
  }

  // 1.4: whole-body motion — every trained pose reads as a different silhouette,
  // not just a different face. Gear follows because it draws in the same space.
  ctx.save();
  const M = POSE_MOTION[ps.id] || null;
  if (M) {
    const ph = t * (M.hz || 1) * Math.PI * 2, osc = Math.sin(ph);
    const cy = -L.body.ry;                                    // pivot near the middle of the body
    ctx.translate((M.dx || 0) + (M.sway || 0) * osc, (M.dy || 0) - Math.abs(M.bounce || 0) * Math.abs(Math.sin(ph)));
    ctx.translate(0, cy);
    ctx.rotate((M.rot || 0) + (M.spin ? ph * (M.spin > 0 ? 1 : -1) * 0.5 % (Math.PI * 2) : 0) + (M.rock || 0) * osc);
    ctx.scale((M.sx || 1) * (M.flipX ? -1 : 1), (M.sy || 1) * (1 + (M.breathe || 0) * osc));
    ctx.translate(0, -cy);
  }
  const anchors = anchorsFor(L, ps);
  const eq = pet.equipped || {};

  drawItems(ctx, eq, 'SPECIAL', anchors, t, 'behind');
  drawItems(ctx, eq, 'BACK', anchors, t, 'behind');
  if (ps.posture !== 'swim') drawTail(ctx, sp, pal, L, ps, t, outline);
  if (ps.posture !== 'swim') drawBackFeet(ctx, pal, L, ps, outline);
  drawBody(ctx, sp, pal, L, ps, outline);
  drawItems(ctx, eq, 'BODY', anchors, t);
  if (ps.posture !== 'swim' || ps.paw === 'up') drawFrontPaws(ctx, sp, pal, L, ps, t, outline);
  if (ps.posture === 'swim') drawWater(ctx, L, t);

  // head group, tilted around the chin
  ctx.save();
  const twitch = o.alive && (t * 0.37 % 1) < 0.05 ? Math.sin(t * 70) * 0.035 : 0;   // an occasional quick twitch
  ctx.translate(L.pivot.x, L.pivot.y); ctx.rotate((ps.headTilt || 0) + (o.alive ? Math.sin(t * 0.8) * 0.045 + twitch : 0)); ctx.translate(-L.pivot.x, -L.pivot.y);
  ctx.translate(0, L.headY);
  drawEarsBehind(ctx, sp, pal, L, ps, outline);
  drawHead(ctx, sp, pal, L, outline);
  drawFace(ctx, sp, pal, L, ps, t, o.blink);
  drawFloppyEars(ctx, sp, pal, L, ps, t, outline);
  ctx.restore();

  drawItems(ctx, eq, 'NECK', anchors, t);
  drawItems(ctx, eq, 'FACE', anchors, t);
  drawItems(ctx, eq, 'HEAD', anchors, t);
  if (ps.paw === 'wave') drawWavePaw(ctx, pal, L, t, outline);
  // a held prop sits at the front paws (or in the mouth-height paw for 'up' poses)
  if (o.held && o.drawHeld) { ctx.save(); const k = L.hR / 115;
    ctx.translate(L.body.rx * 0.25, ps.paw === 'up' ? L.headY + L.hR * 0.9 : L.body.cy + L.body.ry * 0.35); ctx.scale(k * 1.1, k * 1.1); o.drawHeld(ctx); ctx.restore(); }
  if (M?.extra) drawMotionExtra(ctx, M.extra, L, pal, outline, t);
  ctx.restore();
  drawFx(ctx, ps.fx, L, t);

  const bb = bboxFor(L, sp);
  if (M) { bb.x += M.dx || 0; bb.y += M.dy || 0; if (M.sx > 1) { bb.x -= bb.w * (M.sx - 1) / 2; bb.w *= M.sx; } }   // keep camera framing honest
  return { anchors, bbox: bb };
}

/* Anchors: the ONLY contract between a pose and a cosmetic. */
export function anchorsFor(L, ps) {
  const a = ps.headTilt || 0, hR = L.hR, piv = L.pivot;
  const head_top = rot({ x: 0, y: L.headY - hR * 0.86 }, piv, a);
  const face     = rot({ x: 0, y: L.headY + hR * 0.02 }, piv, a);
  const neck     = rot({ x: 0, y: L.headY + hR * 0.84 }, piv, a * 0.4);
  const k = hR / 115;
  return {
    head_top: { ...head_top, rot: a, scale: k, hR },
    face:     { ...face,     rot: a, scale: k, hR },
    neck:     { ...neck,     rot: a * 0.4, scale: k, w: hR * 1.05 },
    body:     { x: 0, y: L.body.cy, rot: 0, scale: k, rx: L.body.rx, ry: L.body.ry, posture: ps.posture },
    paw:      { x: L.body.rx * 0.25, y: ps.paw === 'up' ? L.headY + hR * 0.9 : L.body.cy + L.body.ry * 0.35, rot: 0, scale: k },
  };
}

function bboxFor(L, sp) {
  const w = Math.max(L.hR * 2.2, L.body.rx * 2.6);
  const top = L.headY - L.hR * (sp.ears === 'bunny' ? 2.1 : 1.45);
  return { x: -w / 2, y: top, w, h: -top + 10 };
}

/* Standalone helper: draw a pet centred in a square canvas (portraits, UI). */
export function portrait(canvas, pet, poseId, o = {}) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  const s = Math.min(W, H) / 470 * (o.zoom || 1);
  ctx.translate(W / 2, H - H * (o.ground ?? 0.08));
  ctx.scale(s, s);
  const r = drawPet(ctx, pet, poseId, o);
  ctx.restore();
  return r;
}


/* ------------------------------------------------------------ pose motion (1.4)
   rot/rock radians, sx/sy squash-stretch, dx/dy offset, sway px, bounce px,
   spin (animated rotation), hz = animation speed, extra = a small prop-like cue. */
export const POSE_MOTION = {
  jump:      { dy: -70, sy: 1.08, sx: .94, bounce: 18, hz: 1.4 },
  leap:      { dy: -50, rot: -.55, sx: 1.12, sy: .9, dx: 30 },
  catch:     { dy: -50, rot: .18, sy: 1.1, extra: 'ball' },
  spin:      { dy: -30, spin: 1, hz: .6 },
  twirl:     { dy: -20, spin: -1, hz: .5, sx: .92 },
  dance:     { rock: .22, sway: 14, hz: 1.2, bounce: 8 },
  disco:     { rot: -.18, sway: 10, hz: 1.6, extra: 'disco_ball' },
  moonwalk:  { rot: .1, dx: -22, sway: 22, hz: .5, flipX: true },
  roll:      { rot: Math.PI, dy: -120, sy: .9 },
  sleepyroll:{ rot: -1.35, dy: 18, sx: 1.05 },
  bow:       { rot: .55, dy: 16, sy: .92 },
  stretch:   { sx: 1.35, sy: .72, rot: -.08 },
  statue:    { sy: 1.06, sx: .96, extra: 'plinth' },
  weave:     { rot: -.32, sway: 26, hz: .9 },
  sniff:     { rot: .36, dx: 12, dy: 12, extra: 'nose_trail' },
  peek:      { dx: -26, rot: -.2, extra: 'paws_over_eyes' },
  superhero: { rot: -1.1, dy: -40, dx: 40, sx: 1.1, extra: 'cape_wind' },
  yoga:      { sy: 1.12, sx: .9, extra: 'yoga_leaf' },
  salute:    { rot: -.06, sy: 1.04, extra: 'salute_line' },
  highfive:  { rot: -.16, dx: 10, extra: 'palm_star' },
  heart:     { breathe: .05, hz: 1.2, extra: 'big_heart' },
  sitpretty: { sy: 1.12, sx: .92, dy: -6 },
  surprised: { dy: -26, sy: 1.14, sx: .9, hz: 3, bounce: 6 },
  look:      { rot: -.08, dx: -8 },
  swim:      { rock: .08, hz: .8 },
  wink:      { rot: .1 },
  happy:     { bounce: 8, hz: 1.6 },
  sleep:     { breathe: .04, hz: .4 },
  lay:       { sx: 1.08, sy: .94 },
  master:    { sy: 1.08, extra: 'laurel' },
  champion:  { dy: -30, rot: -.1, sy: 1.1, extra: 'trophy' },
  wave:      { rot: .05 },
  // 1.5: the last six poses get real body language too (were face/badge swaps only).
  idle:      { breathe: .025, sway: 3, hz: .45 },
  sit:       { sy: .86, sx: 1.08, dy: 14, breathe: .02, hz: .4 },
  sneeze:    { rock: .16, hz: 2.6, dy: 6, sy: .94, extra: 'sneeze_puff' },
  stumble:   { rot: .42, dx: 26, dy: 10, rock: .1, hz: 1.8, extra: 'dust' },
  yawn:      { sy: 1.16, sx: .9, dy: -8, breathe: .05, hz: .35, extra: 'yawn_zz' },
  confused:  { rock: .14, hz: .7, dx: -6, extra: 'question' },
};
function drawMotionExtra(ctx, kind, L, pal, outline, t) {
  const hR = L.hR, top = L.headY - hR, by = L.body.cy;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const star = (x, y, r, c) => { ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * .45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); ctx.fillStyle = c; ctx.fill(); };
  switch (kind) {
    case 'ball': ctx.fillStyle = '#e0474c'; ctx.beginPath(); ctx.arc(hR * .2, top - 26, 26, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(hR * .2, top - 26, 17, -.5, .8); ctx.stroke(); break;
    case 'disco_ball': ctx.fillStyle = '#c9c8dc'; ctx.beginPath(); ctx.arc(hR * .9, top - 40, 24, 0, 7); ctx.fill(); ctx.strokeStyle = '#8f8c9c'; ctx.lineWidth = 2; for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(hR * .9 - 24, top - 40 + k * 9); ctx.lineTo(hR * .9 + 24, top - 40 + k * 9); ctx.stroke(); } break;
    case 'plinth': ctx.fillStyle = '#d8d2c8'; ctx.fillRect(-L.body.rx * 1.2, 0, L.body.rx * 2.4, 26); ctx.strokeStyle = '#a89f92'; ctx.lineWidth = 4; ctx.strokeRect(-L.body.rx * 1.2, 0, L.body.rx * 2.4, 26); break;
    case 'nose_trail': ctx.strokeStyle = 'rgba(120,200,120,.8)'; ctx.lineWidth = 5; ctx.setLineDash([10, 10]); ctx.beginPath(); ctx.moveTo(hR * .8, L.headY + hR * .4); ctx.quadraticCurveTo(hR * 2, L.headY + hR, hR * 2.6, 0); ctx.stroke(); ctx.setLineDash([]); break;
    case 'paws_over_eyes': for (const x of [-hR * .35, hR * .35]) { ctx.fillStyle = pal.base; ctx.beginPath(); ctx.ellipse(x, L.headY - hR * .05, hR * .3, hR * .22, 0, 0, 7); ctx.fill(); ctx.strokeStyle = outline; ctx.lineWidth = 5; ctx.stroke(); } break;
    case 'cape_wind': ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 6; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(L.body.rx * 1.2 + k * 20, by - 20 + k * 22); ctx.lineTo(L.body.rx * 1.2 + 60 + k * 20, by - 20 + k * 22); ctx.stroke(); } break;
    case 'yoga_leaf': ctx.fillStyle = '#5fb84a'; ctx.beginPath(); ctx.ellipse(0, top - 30, 18, 30, 0, 0, 7); ctx.fill(); break;
    case 'salute_line': ctx.strokeStyle = outline; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(hR * .7, L.headY + hR * .2); ctx.lineTo(hR * .55, L.headY - hR * .45); ctx.stroke(); break;
    case 'palm_star': star(hR * 1.2, top + 10, 22, '#ffd84a'); break;
    case 'big_heart': { const x = 0, y = top - 36, k = 1.4 + .1 * Math.sin(t * 6); ctx.fillStyle = '#ff5f8f'; ctx.beginPath(); ctx.moveTo(x, y + 14 * k); ctx.bezierCurveTo(x - 30 * k, y - 8 * k, x - 12 * k, y - 26 * k, x, y - 10 * k); ctx.bezierCurveTo(x + 12 * k, y - 26 * k, x + 30 * k, y - 8 * k, x, y + 14 * k); ctx.fill(); break; }
    case 'laurel': ctx.strokeStyle = '#d4a017'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(0, L.headY, hR * 1.12, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); for (let k = 0; k < 7; k++) { const a = Math.PI * (1.12 + k * .11); ctx.fillStyle = '#e8b82a'; ctx.beginPath(); ctx.ellipse(Math.cos(a) * hR * 1.12, L.headY + Math.sin(a) * hR * 1.12, 9, 5, a, 0, 7); ctx.fill(); } break;
    case 'sneeze_puff': { const p = (t * 2.6) % 1; ctx.fillStyle = `rgba(255,255,255,${0.9 - p * 0.7})`; ctx.strokeStyle = 'rgba(150,170,190,.6)'; ctx.lineWidth = 3;
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(hR * (0.9 + p * 0.9) + k * 16, L.headY + hR * 0.25 - k * 9, 10 + k * 3, 0, 7); ctx.fill(); ctx.stroke(); } break; }
    case 'dust': ctx.fillStyle = 'rgba(190,160,120,.55)'; for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(-L.body.rx * 1.1 - k * 14, -6 - (k % 2) * 10, 12 - k, 0, 7); ctx.fill(); } break;
    case 'yawn_zz': ctx.fillStyle = '#7a8cc4'; ctx.font = `900 ${Math.round(hR * .32)}px system-ui`; for (let k = 0; k < 3; k++) { const y = top - 14 - k * 30 - ((t * 20) % 30); ctx.globalAlpha = 1 - k * .28; ctx.fillText('z', hR * (0.7 + k * .25), y); } ctx.globalAlpha = 1; break;
    case 'question': ctx.strokeStyle = '#6a5ad0'; ctx.lineWidth = 9; for (const [x, s] of [[hR * .75, 1], [hR * 1.2, .7]]) { const y = top - 30 + Math.sin(t * 3 + x) * 5;
      ctx.beginPath(); ctx.arc(x, y - 16 * s, 16 * s, Math.PI * 1.1, Math.PI * 2.4); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y - 1 * s); ctx.lineTo(x, y + 12 * s); ctx.stroke(); ctx.fillStyle = '#6a5ad0'; ctx.beginPath(); ctx.arc(x, y + 26 * s, 5 * s, 0, 7); ctx.fill(); } break;
    case 'trophy': ctx.fillStyle = '#ffcc33'; ctx.beginPath(); ctx.moveTo(hR * .9 - 20, top - 60); ctx.lineTo(hR * .9 + 20, top - 60); ctx.lineTo(hR * .9 + 12, top - 28); ctx.lineTo(hR * .9 - 12, top - 28); ctx.closePath(); ctx.fill(); ctx.fillRect(hR * .9 - 6, top - 28, 12, 14); ctx.fillRect(hR * .9 - 16, top - 14, 32, 7); break;
  }
  ctx.restore();
}
