/* PokaSnap 2.2 — Pudding, illustrated 2.5D rabbit renderer (Phase C1).
   ---------------------------------------------------------------------------
   One rig, four camera views (front, side, back, elevated three-quarter) and
   every pose the rabbit reaction families need. Origin = centre of the feet
   on the ground, y up is NEGATIVE. Pudding stands ~160 units tall.

   Art direction (original PokaSnap, not a third-party mascot): cream lop-
   eared rabbit, oversized head, long weighted ears that lag and swing, ruby
   eyes with two catch-lights, blue polka-dot bow tie, cotton tail.
   Light from the upper left: radial body gradients, a core shadow on the
   lower-right, a warm rim light on the far edge, fur-direction strokes,
   occlusion under the head and between body and feet, and a contact shadow
   under every foot so she stands on the world rather than floating.

   drawPudding() returns anchors (head_top, face, neck, body, mouth, paw) so
   wardrobe and held objects always attach to the pose being drawn. */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = amt < 0 ? 0 : 255, p = Math.abs(amt);
  r = Math.round((f - r) * p + r); g = Math.round((f - g) * p + g); b = Math.round((f - b) * p + b);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

/* ----------------------------------------------------------- pose model -- */
/* Converts a behaviour phase into rig parameters. Every value is continuous
   so poses blend instead of snapping. Anticipation and follow-through live
   here: hops crouch before leaving and settle after landing. */
export function poseFor(phase, u, t) {
  const p = {
    stretch: 0, squash: 0, lean: 0, bob: 0, headTilt: 0, headDip: 0, earLift: 0, earSwing: 0,
    legCycle: 0, legAmp: 0, rear: 0, pawUp: 0, mouth: 'smile', eyes: 'open', chew: 0, tail: 0, sparkle: 0, twist: 0, kick: 0, nose: 0,
  };
  const breathe = Math.sin(t * 2.6) * 0.02;
  p.squash = breathe; p.tail = Math.sin(t * 5) * 0.3;
  p.earSwing = Math.sin(t * 1.7) * 0.06; p.nose = (Math.sin(t * 16) > 0.6 ? 1 : 0) * 1.2;
  switch (phase) {
    case 'idle': default: break;
    case 'ready': case 'curious':
      p.headTilt = Math.sin(t * 3) * 0.12 + 0.12; p.earLift = 0.15; p.eyes = 'wide'; p.squash = -0.04 + Math.sin(t * 9) * 0.03; p.tail = Math.sin(t * 14) * 0.6; p.nose = Math.sin(t * 24) * 1.5; break;
    case 'sniff':
      p.lean = 0.18; p.headDip = 12; p.mouth = 'nose'; p.bob = Math.sin(t * 22) * 1.4; p.earSwing += Math.sin(t * 6) * 0.05; p.nose = Math.sin(t * 30) * 1.6; break;
    case 'approach':
      // C1.4: a real hop-gait: hind legs drive, the body arcs, ears trail half a beat behind
      p.legCycle = t * 7; p.legAmp = 0.68; p.stretch = 0.03 + Math.max(0, Math.sin(p.legCycle)) * 0.06; p.squash = Math.max(0, -Math.sin(p.legCycle)) * 0.06; p.bob = -Math.abs(Math.sin(p.legCycle)) * 6; p.lean = 0.05 + Math.sin(p.legCycle) * 0.04; p.earLift = 0.15 - Math.sin(p.legCycle - 1.2) * 0.12; p.earSwing = Math.sin(p.legCycle - 1.2) * 0.16; p.tail = Math.sin(t * 18) * 0.8; break;
    case 'hop': {       // anticipation crouch, airborne stretch, landing squash
      const air = Math.sin(Math.PI * u);
      p.squash = u < 0.12 ? 0.18 * (1 - u / 0.12) : u > 0.86 ? 0.2 * ((u - 0.86) / 0.14) : 0;
      p.stretch = 0.2 * air; p.lean = lerp(-0.2, 0.28, u); p.earLift = 0.35 + 0.5 * air - 0.35 * Math.cos(Math.PI * u) * (u < 0.5 ? 1 : -0.6); p.earSwing = 0.1 * air + 0.12 * Math.sin(u * TAU); p.kick = air;   // ears lag the climb, then flop on the way down
      p.eyes = 'wide'; p.mouth = 'open'; p.legAmp = 0.3; p.legCycle = 1.2; p.tail = 0.6; break;
    }
    case 'binky': {     // the rabbit joy-leap: twist in the air, ears flung, feet kicked out
      const air = Math.sin(Math.PI * u);
      p.squash = u < 0.1 ? 0.22 * (1 - u / 0.1) : 0; p.stretch = 0.18 * air; p.twist = Math.sin(u * Math.PI) * 0.9; p.kick = air * 1.4;
      p.earLift = 1; p.earSwing = 0.3 * Math.sin(u * TAU); p.eyes = 'happy'; p.mouth = 'open'; p.sparkle = air; p.tail = 1; break;
    }
    case 'nudge':       // head down, pushing the ball along with the nose
      p.lean = 0.22; p.headDip = 16 + Math.sin(t * 9) * 3; p.mouth = 'nose'; p.legCycle = t * 8; p.legAmp = 0.5; p.bob = -Math.abs(Math.sin(p.legCycle)) * 3; p.earLift = -0.1; p.eyes = 'focus'; p.nose = Math.sin(t * 28) * 1.8; break;
    case 'land':
      p.squash = 0.3 * Math.sin(Math.PI * u) * (1 - u * 0.4); p.earLift = -0.35 + 0.55 * u + 0.08 * Math.sin(u * 14) * (1 - u); p.earSwing = 0.1 * Math.sin(u * 12) * (1 - u); p.eyes = u < 0.45 ? 'squint' : 'open'; p.mouth = 'open'; break;   // landing: deeper compression, ears settle with a small overshoot
    case 'eat':
      p.headDip = 12 + Math.sin(t * 11) * 3; p.chew = (Math.sin(t * 11) + 1) / 2; p.mouth = 'chew'; p.eyes = 'happy'; p.pawUp = 0.35; break;
    case 'savor':
      p.headTilt = 0.18 + Math.sin(t * 2.2) * 0.06; p.chew = (Math.sin(t * 6) + 1) / 4; p.mouth = 'chew'; p.eyes = 'happy'; p.sparkle = 0.6; p.squash = Math.sin(t * 3) * 0.05; break;
    case 'rear':
      p.rear = Math.sin(Math.PI * clamp(u * 1.4, 0, 1)) * 0.9 + 0.1; p.pawUp = p.rear; p.earLift = 0.2; p.eyes = 'wide'; p.mouth = 'open'; p.headTilt = -0.1; break;
    case 'paw':
      p.rear = 0.85; p.pawUp = 0.7 + Math.sin(u * TAU * 2) * 0.3; p.eyes = 'happy'; p.mouth = 'open'; p.headTilt = 0.15; break;
    case 'happy':
      p.bob = -Math.abs(Math.sin(t * 9)) * 12; p.squash = Math.abs(Math.sin(t * 9)) < 0.2 ? 0.12 : -0.05; p.eyes = 'happy'; p.mouth = 'open'; p.sparkle = 1; p.earLift = 0.35 + Math.sin(t * 9) * 0.3; p.tail = Math.sin(t * 20) * 1; break;
    case 'loaf':
      p.squash = 0.14 + breathe; p.headDip = 6; p.eyes = Math.sin(t * 0.8) > 0.2 ? 'sleepy' : 'open'; p.earLift = -0.15; break;
    case 'groom':
      p.headTilt = 0.35; p.headDip = 8; p.pawUp = 0.55 + Math.sin(t * 12) * 0.1; p.eyes = 'squint'; p.mouth = 'smile'; break;
    /* C1.5 board moments */
    case 'pose':        // sit pretty for the lens: up on the haunches, one paw lifted, head tilted, sparkle
      p.rear = 0.55 + Math.sin(t * 2) * 0.05; p.pawUp = 0.8; p.headTilt = 0.22 + Math.sin(t * 1.6) * 0.05; p.eyes = 'happy'; p.mouth = 'smile'; p.earLift = 0.25; p.sparkle = 0.8; p.tail = Math.sin(t * 8) * 0.5; break;
    case 'dig':         // front paws scrabbling, nose down, little dirt-kick bob
      p.lean = 0.26; p.headDip = 14; p.pawUp = 0.3 + Math.abs(Math.sin(t * 18)) * 0.35; p.bob = -Math.abs(Math.sin(t * 18)) * 3; p.eyes = 'focus'; p.mouth = 'nose'; p.earSwing += Math.sin(t * 18) * 0.08; p.tail = Math.sin(t * 20) * 0.8; break;
    case 'zoom':        // RUSH zoomies: a fast stretched gait, ears streaming back
      p.legCycle = t * 15; p.legAmp = 0.85; p.stretch = 0.08 + Math.max(0, Math.sin(p.legCycle)) * 0.1; p.bob = -Math.abs(Math.sin(p.legCycle)) * 9; p.lean = 0.16; p.earLift = 0.55; p.earSwing = -0.25 + Math.sin(p.legCycle - 1.2) * 0.12; p.eyes = 'happy'; p.mouth = 'open'; p.tail = 1; break;
    case 'cam':         // camera reaction: notices the lens, ears up, big eyes, small head tilt
      p.headTilt = 0.18 * Math.sin(t * 2.4); p.earLift = 0.45; p.eyes = 'wide'; p.mouth = 'smile'; p.squash = -0.05; p.nose = Math.sin(t * 20) * 1.4; break;
  }
  return p;
}

/* ------------------------------------------------------------ primitives -- */
function fillShape(ctx, pathFn, grad, line, lw = 3) {
  ctx.beginPath(); pathFn(ctx); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  if (line) { ctx.lineWidth = lw; ctx.strokeStyle = line; ctx.lineJoin = 'round'; ctx.stroke(); }
}
function radial(ctx, x, y, r, c0, c1, c2, ox = -0.35, oy = -0.45) {
  const g = ctx.createRadialGradient(x + r * ox, y + r * oy, r * 0.08, x, y, r * 1.15);
  g.addColorStop(0, c0); g.addColorStop(0.55, c1); g.addColorStop(1, c2); return g;
}
/* Rim light: a soft highlight hugging the edge away from the key light.
   Two strokes instead of a canvas blur filter: the filter forces WebKit onto
   a software path and cost a third of the frame on the SE. */
function rim(ctx, pathFn, color, w, dx, dy) {
  ctx.save(); ctx.beginPath(); pathFn(ctx); ctx.closePath(); ctx.clip();
  ctx.translate(dx, dy); ctx.beginPath(); pathFn(ctx); ctx.closePath();
  ctx.strokeStyle = color; ctx.globalAlpha = 0.45; ctx.lineWidth = w * 1.6; ctx.stroke(); ctx.globalAlpha = 0.8; ctx.lineWidth = w * 0.7; ctx.stroke(); ctx.restore();
}
/* Core shadow: a darker band on the lower-right inside the shape. */
function core(ctx, pathFn, x, y, r, pal, a = 0.22) {
  ctx.save(); ctx.beginPath(); pathFn(ctx); ctx.closePath(); ctx.clip();
  const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.5, r * 0.5, x, y, r * 1.2);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.75, 'rgba(0,0,0,0)'); g.addColorStop(1, rgba(pal.deep, a));
  ctx.fillStyle = g; ctx.fillRect(x - r * 2, y - r * 2, r * 4, r * 4); ctx.restore();
}
function occlude(ctx, pathFn, x, y, rx, ry, a) {
  ctx.save(); ctx.beginPath(); pathFn(ctx); ctx.closePath(); ctx.clip();
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  g.addColorStop(0, `rgba(120,86,60,${a})`); g.addColorStop(1, 'rgba(120,86,60,0)');
  ctx.fillStyle = g; ctx.save(); ctx.translate(x, y); ctx.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry)); ctx.beginPath(); ctx.arc(0, 0, Math.max(rx, ry), 0, TAU); ctx.restore(); ctx.fill(); ctx.restore();
}
/* Fur direction: short soft strokes inside a shape, following a flow. */
function fur(ctx, pathFn, cx, cy, r, pal, n = 14, seed = 0) {
  ctx.save(); ctx.beginPath(); pathFn(ctx); ctx.closePath(); ctx.clip();
  ctx.strokeStyle = rgba(pal.deep, 0.16); ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) { const a = (i * 2.399 + seed) % TAU, d = r * (0.35 + ((i * 7919) % 100) / 100 * 0.6); const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.9; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 2, y + 5, x + 1, y + 10); ctx.stroke(); }
  ctx.restore();
}
/* Fur fringe: soft tufts breaking the silhouette along an ellipse edge, so
   the outline reads as fluff rather than a vector oval. from/to = arc range. */
function fringe(ctx, cx, cy, rx, ry, rot, pal, n, from = 0, to = TAU, len = 7) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
  for (let i = 0; i < n; i++) {
    const a = from + (to - from) * (i + 0.5) / n, ca = Math.cos(a), sa = Math.sin(a);
    const x = ca * rx, y = sa * ry, nx = ca * ry, ny = sa * rx, nl = Math.hypot(nx, ny) || 1, ux = nx / nl, uy = ny / nl;
    const L = len * (0.5 + 0.3 * ((i * 37) % 10) / 10), side = (i % 2 ? 1 : -1) * 3.6;
    ctx.beginPath(); ctx.moveTo(x - uy * side - ux * 3, y + ux * side - uy * 3);
    ctx.quadraticCurveTo(x + ux * L * 0.6, y + uy * L * 0.6, x + ux * L + uy * side * 0.6, y + uy * L - ux * side * 0.6);
    ctx.quadraticCurveTo(x + ux * L * 0.3, y + uy * L * 0.3, x + uy * side - ux * 3, y - ux * side - uy * 3); ctx.closePath();
    const g = ctx.createLinearGradient(x, y, x + ux * L, y + uy * L); g.addColorStop(0, pal.base); g.addColorStop(1, shade(pal.base, 0.35));
    ctx.fillStyle = g; ctx.fill();
  }
  ctx.restore();
}
/* Warm bounce light along the light/shadow terminator (subsurface feel). */
function warm(ctx, pathFn, x, y, r) {
  ctx.save(); ctx.beginPath(); pathFn(ctx); ctx.closePath(); ctx.clip();
  const g = ctx.createRadialGradient(x + r * 0.35, y + r * 0.45, r * 0.55, x + r * 0.35, y + r * 0.45, r * 0.95);
  g.addColorStop(0, 'rgba(255,190,160,0)'); g.addColorStop(0.7, 'rgba(255,180,150,.16)'); g.addColorStop(1, 'rgba(255,180,150,0)');
  ctx.fillStyle = g; ctx.fillRect(x - r * 2, y - r * 2, r * 4, r * 4); ctx.restore();
}
const ell = (x, y, rx, ry, r = 0) => c => c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), r, 0, TAU);
/* A lop ear rooted at (x,y), hanging along angle a (0 = straight down). */
function earPath(x, y, a, L, w, curl) {
  return c => {
    const dx = Math.sin(a), dy = Math.cos(a);
    const tx = x + dx * L + curl * dy * 0.25 * L, ty = y + dy * L - curl * dx * 0.12 * L;
    const nx = dy, ny = -dx;
    c.moveTo(x - nx * w * 0.42, y - ny * w * 0.42);
    c.bezierCurveTo(x - nx * w * 0.9 + dx * L * 0.35, y - ny * w * 0.9 + dy * L * 0.35, tx - nx * w * 0.75, ty - ny * w * 0.75, tx, ty + 2);
    c.bezierCurveTo(tx + nx * w * 0.75, ty + ny * w * 0.75, x + nx * w * 0.9 + dx * L * 0.35, y + ny * w * 0.9 + dy * L * 0.35, x + nx * w * 0.42, y + ny * w * 0.42);
  };
}
function ear(ctx, root, a, L, w, curl, pal, inner, innerK, near = true) {
  const e = earPath(root[0], root[1], a, L, w, curl);
  fillShape(ctx, e, radial(ctx, root[0], root[1] + L * 0.4, L * 0.7, '#ffffff', near ? pal.base : pal.shade, pal.shade), pal.line, 2.8);
  core(ctx, e, root[0], root[1] + L * 0.45, L * 0.6, pal, 0.18);
  if (inner) { ctx.save(); ctx.beginPath(); e(ctx); ctx.clip(); ctx.globalAlpha = clamp(innerK, 0, 0.9); fillShape(ctx, earPath(root[0], root[1] + 8, a, L * 0.82, w * 0.5, curl), radial(ctx, root[0], root[1] + L * 0.4, L * 0.5, shade(pal.inner, 0.3), pal.inner, shade(pal.inner, -0.1)), null); ctx.restore(); }
  // translucency: warm light passing through the thin lobe near its tip
  ctx.save(); ctx.beginPath(); e(ctx); ctx.clip();
  const dx = Math.sin(a), dy = Math.cos(a), tx = root[0] + dx * L * 0.82, ty = root[1] + dy * L * 0.82;
  const tg = ctx.createRadialGradient(tx, ty, 2, tx, ty, w * 0.9); tg.addColorStop(0, 'rgba(255,190,190,.45)'); tg.addColorStop(1, 'rgba(255,190,190,0)');
  ctx.fillStyle = tg; ctx.fillRect(tx - w, ty - w, w * 2, w * 2); ctx.restore();
  rim(ctx, e, 'rgba(255,236,200,.9)', 4, -2, -2);
}

/* ---------------------------------------------------------------- face -- */
function eye(ctx, x, y, s, mode, pal, blink, look = 0) {
  const h = 16 * s, w = 12.5 * s;
  if (mode === 'happy' || mode === 'sleepy' || blink > 0.85) {
    ctx.beginPath(); ctx.lineCap = 'round'; ctx.lineWidth = 3.8 * s; ctx.strokeStyle = '#4a2730';
    if (mode === 'happy') { ctx.moveTo(x - w * 0.8, y + 2 * s); ctx.quadraticCurveTo(x, y - h * 0.75, x + w * 0.8, y + 2 * s); }
    else { ctx.moveTo(x - w * 0.8, y); ctx.quadraticCurveTo(x, y + h * 0.35, x + w * 0.8, y); }
    ctx.stroke(); return;
  }
  let sy = 1; if (mode === 'squint') sy = 0.45; if (mode === 'focus') sy = 0.82; if (mode === 'wide') sy = 1.12;
  ctx.save(); ctx.translate(x, y); ctx.scale(1, sy);
  // eye socket shadow
  const sg = ctx.createRadialGradient(0, 0, w * 0.6, 0, 0, w * 1.5); sg.addColorStop(0, rgba(pal.deep, 0.25)); sg.addColorStop(1, rgba(pal.deep, 0)); ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(0, 2 * s, w * 1.5, h * 1.2, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, 0, w, h, 0, 0, TAU); ctx.fillStyle = '#2b1218'; ctx.fill();
  const g = ctx.createRadialGradient(look * 2, h * 0.35, 1, 0, 0, h);
  g.addColorStop(0, shade(pal.eye, 0.5)); g.addColorStop(0.45, pal.eye); g.addColorStop(1, shade(pal.eye, -0.6));
  ctx.beginPath(); ctx.ellipse(look * 1.5, 1 * s, w * 0.84, h * 0.88, 0, 0, TAU); ctx.fillStyle = g; ctx.fill();
  ctx.beginPath(); ctx.ellipse(look * 2, 2 * s, w * 0.4, h * 0.48, 0, 0, TAU); ctx.fillStyle = '#1d0a10'; ctx.fill();
  // catch-lights: one large soft, one small sharp, plus a lower bounce
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.ellipse(-w * 0.32 + look, -h * 0.38, w * 0.36, h * 0.3, -0.4, 0, TAU); ctx.fill();
  ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(w * 0.38 + look, h * 0.34, w * 0.16, 0, TAU); ctx.fill();
  ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.ellipse(look, h * 0.62, w * 0.5, h * 0.14, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.lineWidth = 2.8 * s; ctx.strokeStyle = '#3b1d24'; ctx.lineCap = 'round';
  ctx.ellipse(0, 0, w + 0.5, h + 0.5, 0, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
  ctx.restore();
}
function mouth(ctx, x, y, s, mode, chew) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#7a3a44'; ctx.lineWidth = 2.6 * s;
  if (mode === 'open' || mode === 'hold') {
    ctx.beginPath(); ctx.moveTo(x - 7 * s, y); ctx.quadraticCurveTo(x, y + 12 * s, x + 7 * s, y); ctx.closePath();
    ctx.fillStyle = '#b8434f'; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x, y + 6 * s, 3.6 * s, 2.4 * s, 0, 0, TAU); ctx.fillStyle = '#ff8fa3'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(x - 3 * s, y, 2.4 * s, 3 * s); ctx.fillRect(x + 0.6 * s, y, 2.4 * s, 3 * s);   // rabbit incisors
  } else if (mode === 'chew') {
    const o = 2 + chew * 5;
    ctx.beginPath(); ctx.ellipse(x, y + 2 * s, 5 * s, o * s * 0.6, 0, 0, TAU); ctx.fillStyle = '#9e3b48'; ctx.fill(); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(x - 8 * s, y); ctx.quadraticCurveTo(x - 4 * s, y + 5 * s, x, y); ctx.quadraticCurveTo(x + 4 * s, y + 5 * s, x + 8 * s, y); ctx.stroke();
  }
}
function nose(ctx, x, y, s, pal, twitch = 0) {
  ctx.save(); ctx.translate(x, y + twitch); ctx.beginPath();
  ctx.moveTo(-5.5 * s, -2 * s); ctx.quadraticCurveTo(0, -5 * s, 5.5 * s, -2 * s); ctx.quadraticCurveTo(2 * s, 4 * s, 0, 4 * s); ctx.quadraticCurveTo(-2 * s, 4 * s, -5.5 * s, -2 * s);
  const g = ctx.createLinearGradient(0, -5 * s, 0, 4 * s); g.addColorStop(0, shade(pal.nose, 0.3)); g.addColorStop(1, shade(pal.nose, -0.15));
  ctx.fillStyle = g; ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.ellipse(-1.5 * s, -2.2 * s, 1.8 * s, 1 * s, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = rgba(pal.line, 0.5); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(0, 4 * s); ctx.lineTo(0, 9 * s); ctx.stroke();   // philtrum
  ctx.restore();
}
function whiskers(ctx, x, y, s, dir) {
  ctx.strokeStyle = 'rgba(90,70,60,.4)'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
  for (const [dy, len] of [[-4, 24], [0, 28], [4, 22]]) { ctx.beginPath(); ctx.moveTo(x, y + dy * s); ctx.quadraticCurveTo(x + dir * len * 0.6 * s, y + (dy - 2) * s, x + dir * len * s, y + (dy - 5) * s); ctx.stroke(); }
}
function blush(ctx, x, y, s) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, 11 * s); g.addColorStop(0, 'rgba(255,128,150,.5)'); g.addColorStop(1, 'rgba(255,128,150,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, 11 * s, 7 * s, 0, 0, TAU); ctx.fill();
}

/* --------------------------------------------------------------- bow tie -- */
export function drawBowtie(ctx, a, view) {
  const { x, y, rot = 0, s = 1 } = a; ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  const blue = '#3d8bf0', dk = '#1f5fb8', hi = '#9cc8ff';
  if (view === 'back') { ctx.fillStyle = dk; ctx.beginPath(); ctx.roundRect(-26, -4, 52, 8, 4); ctx.fill(); ctx.restore(); return; }
  const wing = (dir, k = 1) => {
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(dir * 8 * k, -14, dir * 24 * k, -16, dir * 25 * k, -2); ctx.bezierCurveTo(dir * 26 * k, 12, dir * 10 * k, 13, 0, 0);
    const g = ctx.createLinearGradient(0, -14, 0, 12); g.addColorStop(0, shade(blue, 0.15)); g.addColorStop(1, dk);
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = '#174a92'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(dir * 6 * k, -6); ctx.quadraticCurveTo(dir * 16 * k, -12, dir * 21 * k, -6); ctx.strokeStyle = hi; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(dir * 15 * k, 2, 2, 0, TAU); ctx.arc(dir * 20 * k, -5, 1.6, 0, TAU); ctx.fill();
  };
  if (view === 'side') { wing(1, 0.55); } else if (view === 'elevated') { wing(-1, 0.85); wing(1, 1); } else { wing(-1); wing(1); }
  ctx.beginPath(); ctx.roundRect(-6, -7, 12, 14, 4); ctx.fillStyle = blue; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#174a92'; ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------- the rig -- */
/* view: 'front' | 'side' | 'back' | 'elevated'. Side and elevated face +x;
   the caller mirrors for facing left. Returns anchors in local space. */
export function drawPudding(ctx, { view = 'front', phase = 'idle', u = 0, t = 0, pal, blink = 0, held = null, drawHeld = null, look = 0, bow = true }) {
  const p = poseFor(phase, u, t);
  if (view === 'aerial') view = 'elevated';
  const side = view === 'side', back = view === 'back', elev = view === 'elevated';
  const sq = p.squash, st = p.stretch;
  const sx = 1 + sq * 0.5 - st * 0.12, sy = 1 - sq * 0.55 + st * 0.18;
  const anchors = {};
  ctx.save();
  ctx.translate(0, p.bob);
  ctx.rotate((side || elev) ? p.lean * 0.6 + p.twist * 0.35 : p.twist * 0.25);
  ctx.scale(sx, sy);

  /* ---------- body geometry ---------- */
  const rear = p.rear;
  // elevated = a three-quarter view: the body reads like the side rig but
  // foreshortened, with the head turned toward the lens so both eyes show.
  const q = elev ? 0.62 : 1;                           // foreshortening along the facing axis
  const bodyCx = (side || elev) ? (-14 + rear * 10) * q : 0, bodyCy = -46 - rear * 16 + (elev ? -6 : 0);
  const bodyRx = (side || elev) ? (50 - rear * 16) * (elev ? 0.82 : 1) : 44, bodyRy = (side || elev) ? 34 + rear * 10 + (elev ? 6 : 0) : 40 + rear * 4;
  const bodyRot = (side || elev) ? -rear * 0.9 : 0;
  const headCx = (side || elev) ? (26 - rear * 6 + p.lean * 20) * q : 0, headCy = -104 - rear * 30 + p.headDip + (elev ? -8 : 0);
  const headR = 44;
  const tilt = p.headTilt;
  const L = pal.line;
  const kick = p.kick;

  /* ---------- contact shadows under feet (the world-contact cue) ---------- */
  const legSw = Math.sin(p.legCycle) * p.legAmp, legSw2 = Math.sin(p.legCycle + Math.PI) * p.legAmp;
  const footShadow = (x, y, w) => { const g = ctx.createRadialGradient(x, y, 0, x, y, w); g.addColorStop(0, 'rgba(60,40,30,.35)'); g.addColorStop(1, 'rgba(60,40,30,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, w, w * 0.4, 0, 0, TAU); ctx.fill(); };
  if (side || elev) { footShadow(bodyCx - 22 + legSw * 12, 2, 30); footShadow(bodyCx + 36 + legSw2 * 14, 2, 16); }
  else { footShadow(-26, 2, 22); footShadow(26, 2, 22); }

  /* ---------- far parts ---------- */
  if (side || elev) {
    footSide(ctx, bodyCx - 26 + legSw2 * 12 - kick * 10, -6 + Math.min(0, legSw2) * 6 - kick * 14, pal, true, rear, kick);
    pawSide(ctx, bodyCx + 30 + legSw * 14 + rear * 6, -10 - p.pawUp * 46 + Math.min(0, legSw) * 6, pal, true, p.pawUp);
    tailPuff(ctx, bodyCx - bodyRx + 4, bodyCy - 4 - rear * 10, 15, pal, p.tail);
    const a = -(0.12 + p.earLift * 1.5 + p.earSwing);
    ctx.save(); ctx.translate(headCx, headCy); ctx.rotate(tilt);
    ear(ctx, [elev ? -16 : -4, -34], a - 0.2, 68, 26, -0.3, pal, false, 0, false);
    ctx.restore();
  }

  /* ---------- one silhouette (C1.2) ----------
     Body, neck and head share ONE outline: the union is stroked first, then
     every fur mass fills without its own border, so no seam separates the
     head from the body and she reads as one illustrated animal. */
  const bodyPath = ell(bodyCx, bodyCy, bodyRx, bodyRy, bodyRot);
  const headRot = tilt + ((side || elev) ? p.lean * 0.3 : 0);
  const nkx = (side || elev) ? lerp(bodyCx + bodyRx * 0.45, headCx, 0.45) : 0, nky = lerp(bodyCy - bodyRy * 0.55, headCy + headR * 0.6, 0.5);
  const neckPath = ell(nkx, nky, (side || elev) ? 28 : 30, 24, (side || elev) ? -0.5 : 0);
  const headOutline = c => { c.save(); c.translate(headCx, headCy); c.rotate(headRot); c.moveTo(headR * 1.06, 0); c.ellipse(0, 0, headR * 1.06, headR * 0.96, 0, 0, TAU); c.restore(); };
  ctx.save(); ctx.lineJoin = 'round'; ctx.strokeStyle = L; ctx.lineWidth = 6;
  for (const pf of [bodyPath, neckPath, headOutline]) { ctx.beginPath(); pf(ctx); ctx.closePath(); ctx.stroke(); }
  ctx.restore();
  fillShape(ctx, bodyPath, radial(ctx, bodyCx, bodyCy, Math.max(bodyRx, bodyRy), '#ffffff', pal.base, pal.shade), null);
  core(ctx, bodyPath, bodyCx, bodyCy, Math.max(bodyRx, bodyRy), pal, 0.26);
  fur(ctx, bodyPath, bodyCx, bodyCy, Math.max(bodyRx, bodyRy), pal, 16, 1);
  warm(ctx, bodyPath, bodyCx, bodyCy, Math.max(bodyRx, bodyRy));
  if (!back) {
    const bx = (side || elev) ? bodyCx + 18 * q : 0, by = bodyCy + 8;
    ctx.save(); ctx.beginPath(); bodyPath(ctx); ctx.clip();
    ctx.beginPath(); ctx.ellipse(bx, by, (side || elev) ? 24 : 28, 26, bodyRot, 0, TAU); ctx.fillStyle = rgba(pal.belly, 0.9); ctx.fill(); ctx.restore();
  }
  rim(ctx, bodyPath, 'rgba(255,236,200,.95)', 5, -3, -3);
  fringe(ctx, bodyCx, bodyCy, bodyRx - 1, bodyRy - 1, bodyRot, pal, (side || elev) ? 9 : 8, (side || elev) ? 0.35 : 0.5, (side || elev) ? 2.6 : 2.65, 7);
  fillShape(ctx, neckPath, radial(ctx, nkx, nky, 30, '#ffffff', pal.base, pal.shade, -0.5, -0.7), null);
  occlude(ctx, bodyPath, headCx * 0.6, headCy + headR * 0.95, headR * 0.95, 16, 0.26);
  if (!back) furTufts(ctx, (side || elev) ? bodyCx + bodyRx * 0.55 : 0, bodyCy - bodyRy * 0.62, (side || elev) ? 3 : 5, pal);

  /* ---------- legs (near side) ---------- */
  if (side || elev) {
    footSide(ctx, bodyCx - 22 + legSw * 12 - kick * 6, -4 + Math.min(0, legSw) * 6 - kick * 10, pal, false, rear, kick);
    const pp = { x: bodyCx + 36 + legSw2 * 14 + rear * 4, y: -8 - p.pawUp * 48 + Math.min(0, legSw2) * 6 };
    pawSide(ctx, pp.x, pp.y, pal, false, p.pawUp); anchors.paw = pp;
  } else {
    const hf = back ? 1 : 0.85;
    footFront(ctx, -26 - kick * 8, -4 - kick * 12, pal, back, legSw * 4, hf); footFront(ctx, 26 + kick * 8, -4 - kick * 12, pal, back, legSw2 * 4, hf);
    if (!back) {
      const raise = p.pawUp * 52;
      const lp = { x: -18 - p.pawUp * 6, y: -22 - raise + Math.max(0, legSw) * -6 }, rp = { x: 18 + p.pawUp * 6, y: -22 - raise * (phase === 'paw' ? (0.6 + 0.4 * Math.sin(u * TAU * 2)) : 1) + Math.max(0, legSw2) * -6 };
      pawFront(ctx, lp.x, lp.y, pal); pawFront(ctx, rp.x, rp.y, pal); anchors.paw = { x: 0, y: (lp.y + rp.y) / 2 - 4 };
    }
  }

  /* ---------- head ---------- */
  ctx.save(); ctx.translate(headCx, headCy); ctx.rotate(headRot);
  const headPath = c => { c.ellipse(0, 0, headR * 1.06, headR * 0.96, 0, 0, TAU); };
  fillShape(ctx, headPath, radial(ctx, 0, 0, headR, '#ffffff', pal.base, pal.shade), null);
  core(ctx, headPath, 0, 0, headR, pal, 0.22);
  fur(ctx, headPath, 0, -10, headR, pal, 10, 3);
  warm(ctx, headPath, 0, 0, headR);
  rim(ctx, headPath, 'rgba(255,236,200,.95)', 6, -3, -3);
  if (!back) fringe(ctx, 0, 2, headR * 1.03, headR * 0.92, 0, pal, side ? 4 : 7, side ? 1.2 : 0.55, side ? 2.0 : 2.6, 6);
  else fringe(ctx, 0, 2, headR * 1.03, headR * 0.92, 0, pal, 8, 0.35, 2.8, 6);
  if (side) { fillShape(ctx, ell(30, 14, 22, 18), radial(ctx, 30, 14, 22, '#ffffff', pal.belly, pal.base), null); }
  else if (elev) { fillShape(ctx, ell(14, 18, 24, 16), radial(ctx, 14, 14, 22, '#ffffff', '#fffdf9', pal.base), null); }
  else if (!back) { fillShape(ctx, ell(0, 18, 24, 16), radial(ctx, 0, 14, 22, '#ffffff', '#fffdf9', pal.base), null); }
  tuft(ctx, side ? -4 : elev ? -6 : 0, -headR * 0.92, pal, t);

  if (!back) {
    if (side) {
      eye(ctx, 18, -4, 0.95, p.eyes, pal, blink, 1.5);
      nose(ctx, 46, 8, 0.9, pal, p.nose);
      blush(ctx, 18, 16, 0.9);
      whiskers(ctx, 40, 14, 0.8, 1);
      ctx.save(); ctx.translate(40, 20); mouth(ctx, 0, 0, 0.8, p.mouth, p.chew); ctx.restore();
      anchors.mouth = { x: headCx + 46, y: headCy + 26 };
    } else if (elev) {   // three-quarter face: far eye smaller and closer to centre
      eye(ctx, -8, -6, 0.82, p.eyes, pal, blink, look + 1);
      eye(ctx, 24, -2, 1, p.eyes, pal, blink, look + 1);
      blush(ctx, -14, 12, 0.8); blush(ctx, 34, 16, 1);
      nose(ctx, 14, 14, 0.95, pal, p.nose);
      whiskers(ctx, 24, 18, 0.8, 1); whiskers(ctx, 4, 18, 0.6, -1);
      mouth(ctx, 14, 23, 0.95, p.mouth, p.chew);
      anchors.mouth = { x: headCx + 14, y: headCy + 32 };
    } else {
      eye(ctx, -19, -4, 1, p.eyes, pal, blink, look); eye(ctx, 19, -4, 1, p.eyes, pal, blink, look);
      blush(ctx, -30, 14, 1); blush(ctx, 30, 14, 1);
      nose(ctx, 0, 12, 1, pal, p.nose);
      whiskers(ctx, 8, 16, 0.8, 1); whiskers(ctx, -8, 16, 0.8, -1);
      mouth(ctx, 0, 21, 1, p.mouth, p.chew);
      anchors.mouth = { x: headCx, y: headCy + 30 };
    }
  } else {
    occlude(ctx, headPath, 0, headR * 0.7, headR * 0.9, headR * 0.5, 0.18);
  }

  /* lop ears */
  const earA = 0.22 + p.earLift * 1.55;
  if (side) {
    const a = -(0.32 + p.earLift * 1.5 + p.earSwing);
    ctx.save(); ear(ctx, [-16, -30], a, 72, 28, -0.3, pal, true, p.earLift * 1.2); ctx.restore();
  } else if (elev) {
    ear(ctx, [-30, -24], -(earA + 0.35 + p.earSwing), 70, 28, -0.25, pal, true, 0.25 + p.earLift, false);
    ear(ctx, [28, -26], earA + 0.1 + p.earSwing, 72, 29, 0.2, pal, true, 0.25 + p.earLift);
  } else {
    for (const dir of [-1, 1]) {
      const sw = p.earSwing * dir + (dir < 0 ? -0.02 : 0.02);
      ear(ctx, [dir * 38, -24], dir * (earA + 0.2 + sw), 70, 28, -dir * 0.2, pal, !back, 0.25 + p.earLift);
    }
  }
  ctx.restore();

  anchors.head_top = { x: headCx, y: headCy - headR };
  anchors.face = { x: headCx + (side ? 20 : elev ? 12 : 0), y: headCy };
  anchors.neck = { x: (side || elev) ? headCx - 4 + bodyCx * 0.15 : 0, y: headCy + headR + 8, rot: side ? -0.25 - rear * 0.5 : elev ? -0.1 - rear * 0.4 : tilt * 0.5 };
  anchors.body = { x: bodyCx, y: bodyCy };

  if (bow) drawBowtie(ctx, { ...anchors.neck, s: side ? 0.95 : 1 }, side ? 'side' : back ? 'back' : elev ? 'elevated' : 'front');
  if (back) tailPuff(ctx, 0, bodyCy + 14, 18, pal, p.tail);

  if (held && drawHeld) {
    const at = (p.mouth === 'hold') ? anchors.mouth : anchors.paw;
    if (at && !back) drawHeld(ctx, held, at.x, at.y, side || elev);
  }
  if (p.sparkle) sparkles(ctx, headCx, headCy - 20, t, p.sparkle);
  ctx.restore();
  for (const k in anchors) { anchors[k].x *= sx; anchors[k].y = anchors[k].y * sy + p.bob; }
  anchors.view = view; anchors.pose = phase;
  return anchors;
}

/* ---------------------------------------------------------- body parts -- */
function footSide(ctx, x, y, pal, far, rear, kick = 0) {
  const c0 = far ? pal.shade : '#ffffff', c1 = far ? pal.deep : pal.base;
  const fp = ell(x, y, 26, 11, -rear * 0.2 - kick * 0.5);
  fillShape(ctx, fp, radial(ctx, x, y, 26, c0, c1, far ? pal.deep : pal.shade), pal.line, 2.6);
  core(ctx, fp, x, y, 26, pal, 0.2);
  if (!far) { ctx.fillStyle = rgba(pal.inner, 0.6); ctx.beginPath(); ctx.ellipse(x - 6, y + 4, 9, 3.5, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = rgba(pal.line, 0.5); ctx.lineWidth = 1.4; for (const o of [-14, -6, 2]) { ctx.beginPath(); ctx.moveTo(x + o, y + 6); ctx.lineTo(x + o + 1, y + 10); ctx.stroke(); } }
}
function pawSide(ctx, x, y, pal, far, up) {
  const pp = ell(x, y, 11, 14 - up * 2, up * 0.6);
  fillShape(ctx, pp, radial(ctx, x, y, 14, far ? pal.shade : '#ffffff', far ? pal.shade : pal.base, far ? pal.deep : pal.shade), pal.line, 2.4);
  if (!far) core(ctx, pp, x, y, 14, pal, 0.18);
}
function footFront(ctx, x, y, pal, back, lift, k) {
  const fp = ell(x, y + lift * -1, 18 * k, 11 * k);
  fillShape(ctx, fp, radial(ctx, x, y, 18, '#ffffff', pal.base, pal.shade), pal.line, 2.6);
  core(ctx, fp, x, y, 18, pal, 0.2);
  if (back) {
    ctx.fillStyle = rgba(pal.inner, 0.85);
    ctx.beginPath(); ctx.ellipse(x, y + 1 - lift, 8, 5, 0, 0, TAU); ctx.fill();
    for (const o of [-8, 0, 8]) { ctx.beginPath(); ctx.arc(x + o, y - 7 - lift, 2.6, 0, TAU); ctx.fill(); }
  } else { ctx.strokeStyle = rgba(pal.line, 0.5); ctx.lineWidth = 1.4; for (const o of [-6, 0, 6]) { ctx.beginPath(); ctx.moveTo(x + o, y + 3 - lift); ctx.lineTo(x + o, y + 8 - lift); ctx.stroke(); } }
}
function pawFront(ctx, x, y, pal) {
  const pp = ell(x, y, 12, 11);
  fillShape(ctx, pp, radial(ctx, x, y, 12, '#ffffff', pal.base, pal.shade), pal.line, 2.4);
  core(ctx, pp, x, y, 12, pal, 0.18);
  ctx.strokeStyle = rgba(pal.line, 0.6); ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(x - 3, y + 4); ctx.lineTo(x - 3, y + 8); ctx.moveTo(x + 3, y + 4); ctx.lineTo(x + 3, y + 8); ctx.stroke();
}
function tailPuff(ctx, x, y, r, pal, wag) {
  ctx.save(); ctx.translate(x + wag * 3, y);
  const puff = c => { for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; c.moveTo(Math.cos(a) * r * 0.6 + r * 0.48, Math.sin(a) * r * 0.6); c.arc(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6, r * 0.48, 0, TAU); } c.moveTo(r * 0.7, 0); c.arc(0, 0, r * 0.7, 0, TAU); };
  ctx.beginPath(); puff(ctx); ctx.lineWidth = 4; ctx.strokeStyle = pal.line; ctx.stroke();
  ctx.fillStyle = radial(ctx, 0, 0, r, '#ffffff', '#fffaf3', pal.shade); ctx.fill();
  ctx.restore();
}
function furTufts(ctx, x, y, n, pal) {
  ctx.strokeStyle = rgba(pal.line, 0.35); ctx.lineWidth = 2; ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) { const ox = (i - (n - 1) / 2) * 9; ctx.beginPath(); ctx.moveTo(x + ox - 3, y); ctx.quadraticCurveTo(x + ox, y + 6, x + ox + 3, y); ctx.stroke(); }
}
function tuft(ctx, x, y, pal, t) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 2) * 0.08);
  for (const [ox, ang, len] of [[-7, -0.5, 13], [0, 0.05, 17], [7, 0.55, 12]]) {
    ctx.save(); ctx.translate(ox, 4); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(-5, 0); ctx.quadraticCurveTo(-4, -len * 0.8, 2, -len); ctx.quadraticCurveTo(1, -len * 0.45, 5, 0); ctx.closePath();
    ctx.fillStyle = radial(ctx, 0, -len / 2, len, '#ffffff', pal.base, pal.shade); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = pal.line; ctx.stroke(); ctx.restore();
  }
  ctx.restore();
}
function sparkles(ctx, x, y, t, k) {
  ctx.save(); ctx.globalAlpha = k;
  for (let i = 0; i < 5; i++) {
    const a = t * 1.6 + i * 1.26, r = 72 + Math.sin(t * 3 + i) * 10, s = 5 + 3 * Math.sin(t * 6 + i * 2);
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * 0.7;
    ctx.fillStyle = i % 2 ? '#ffd84a' : '#ff9fc4';
    ctx.beginPath(); for (let j = 0; j < 8; j++) { const rr = j % 2 ? s * 0.38 : s; const aa = j / 8 * TAU; ctx.lineTo(px + Math.cos(aa) * rr, py + Math.sin(aa) * rr); } ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
