/* PokaSnap 2.2 — object/prop art (original). Shared by the board, the held
   item in Pudding's mouth/paws, and the Object button icon. */
const TAU = Math.PI * 2;

export function drawFrisbee(ctx, x, y, s = 1, tilt = 0.45, spin = 0) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.beginPath(); ctx.ellipse(0, 3, 24, 24 * tilt, 0, 0, TAU); ctx.fillStyle = '#c94a3e'; ctx.fill();
  const g = ctx.createRadialGradient(-6, -4, 2, 0, 0, 24); g.addColorStop(0, '#ffb39a'); g.addColorStop(0.6, '#ff6f5a'); g.addColorStop(1, '#e2513f');
  ctx.beginPath(); ctx.ellipse(0, 0, 24, 24 * tilt, 0, 0, TAU); ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#a5362c'; ctx.stroke();
  // rotating paw-stripe ring
  ctx.save(); ctx.scale(1, tilt); ctx.rotate(spin);
  ctx.strokeStyle = '#fff3d6'; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.arc(0, 0, 15, 0.2, 1.5); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 15, 3.3, 4.6); ctx.stroke();
  ctx.fillStyle = '#fff3d6'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(-9, -4 * tilt * 2, 7, 2.5, -0.2, 0, TAU); ctx.fill();
  ctx.restore();
}
export function drawBall(ctx, x, y, s = 1, roll = 0) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  const r = 15;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
  const g = ctx.createRadialGradient(-5, -6, 1, 0, 0, r); g.addColorStop(0, '#a6f1e0'); g.addColorStop(0.55, '#2fc2a3'); g.addColorStop(1, '#16866f');
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip(); ctx.rotate(roll);
  ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.1, 5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ff8a6b'; ctx.beginPath(); ctx.arc(0, -r * 0.62, 3.4, 0, TAU); ctx.arc(0, r * 0.62, 3.4, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.lineWidth = 2; ctx.strokeStyle = '#0f6b59'; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.ellipse(-5, -7, 5, 2.8, -0.5, 0, TAU); ctx.fill();
  ctx.restore();
}
/* Treat: a clover-shaped oat biscuit with a jam heart (bunny-friendly). */
export function drawTreat(ctx, x, y, s = 1, bitten = 0) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + Math.PI / 4; ctx.moveTo(Math.cos(a) * 7 + 8, Math.sin(a) * 7); ctx.arc(Math.cos(a) * 7, Math.sin(a) * 7, 8, 0, TAU); }
  const g = ctx.createRadialGradient(-3, -4, 1, 0, 0, 16); g.addColorStop(0, '#ffe2a6'); g.addColorStop(1, '#d89a4c');
  ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = '#a8692c'; ctx.stroke();
  if (bitten > 0) { ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.arc(12, -8, 3 + bitten * 9, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
  ctx.beginPath(); ctx.moveTo(0, 5); ctx.bezierCurveTo(-7, -1, -4, -7, 0, -3); ctx.bezierCurveTo(4, -7, 7, -1, 0, 5); ctx.fillStyle = '#ff5f7e'; ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(-2, -3, 1.4, 0, TAU); ctx.fill();
  ctx.restore();
}
export function drawBubble(ctx, x, y, r, t = 0, alpha = 1) {
  ctx.save(); ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(0.7, 'rgba(180,230,255,.12)'); g.addColorStop(0.9, `hsla(${(t * 90) % 360},90%,72%,.55)`); g.addColorStop(1, 'rgba(160,120,255,.35)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.lineWidth = 1.2; ctx.strokeStyle = `hsla(${(t * 90 + 120) % 360},85%,75%,.8)`; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.4, r * 0.22, r * 0.12, -0.6, 0, TAU); ctx.fill();
  ctx.restore();
}
export function drawWand(ctx, x, y, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.rotate(-0.5);
  ctx.strokeStyle = '#8f63e0'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 26); ctx.stroke();
  ctx.lineWidth = 3.4; ctx.strokeStyle = '#c49bf0'; ctx.beginPath(); ctx.arc(0, -8, 9, 0, TAU); ctx.stroke();
  drawBubble(ctx, 0, -8, 7, 0, 0.8);
  ctx.restore();
}
/* Held in the mouth / paws during carry, eat and paw beats. */
export function drawHeld(ctx, kind, x, y, side) {
  if (kind === 'frisbee') drawFrisbee(ctx, x + (side ? 10 : 0), y + 4, 1.1, side ? 0.28 : 0.5);
  else if (kind === 'ball') drawBall(ctx, x + (side ? 8 : 0), y + 6, 1.1);
  else if (kind === 'treat') drawTreat(ctx, x, y + 6, 1.2, 0.3);
  else if (kind === 'bubble') drawBubble(ctx, x, y - 22, 13, performance.now() / 1000);
}
export function drawObjectIcon(ctx, kind, x, y, s = 1) {
  if (kind === 'frisbee') drawFrisbee(ctx, x, y, s, 0.55, 0.4);
  else if (kind === 'ball') drawBall(ctx, x, y, s * 1.2, 0.5);
  else if (kind === 'treat') drawTreat(ctx, x, y, s * 1.3);
  else drawWand(ctx, x, y + 4 * s, s * 1.1);
}
