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
  const wag = Math.sin(t * 5) * 0.35 * (ps.tailWag || 0);
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
  if (sp.fluff > 0.5) {
    for (const s of [-1, 1]) { furEllipse(ctx, s * hR * 0.86, hR * 0.22, hR * 0.24, hR * 0.2, 8, 5); ctx.fillStyle = shade(pal.base, 0.08); ctx.fill(); }
  }
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
  const t = o.t || 0, L = layout(sp, ps, t, o.squash);
  const outline = shade(pal.shade, -0.32);

  // ground shadow (skipped for the saved photo if the caller asks)
  if (o.shadow !== false) {
    const shrink = L.lift ? 0.7 : 1;
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath();
    ctx.ellipse(0, 4, L.body.rx * 1.25 * shrink, 16 * shrink, 0, 0, Math.PI * 2); ctx.fill();
  }

  const anchors = anchorsFor(L, ps);
  const eq = pet.equipped || {};

  drawItems(ctx, eq, 'SPECIAL', anchors, t, 'behind');
  if (ps.posture !== 'swim') drawTail(ctx, sp, pal, L, ps, t, outline);
  if (ps.posture !== 'swim') drawBackFeet(ctx, pal, L, ps, outline);
  drawBody(ctx, sp, pal, L, ps, outline);
  drawItems(ctx, eq, 'BODY', anchors, t);
  if (ps.posture !== 'swim' || ps.paw === 'up') drawFrontPaws(ctx, sp, pal, L, ps, t, outline);
  if (ps.posture === 'swim') drawWater(ctx, L, t);

  // head group, tilted around the chin
  ctx.save();
  ctx.translate(L.pivot.x, L.pivot.y); ctx.rotate(ps.headTilt || 0); ctx.translate(-L.pivot.x, -L.pivot.y);
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
  drawFx(ctx, ps.fx, L, t);

  return { anchors, bbox: bboxFor(L, sp) };
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
