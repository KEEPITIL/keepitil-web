/* BALL PHYSICS (2.1) — the throwable ball is a real object: drag, release, fly, bounce, roll, stop.
   Pure and DOM-free. World units: x 0..1 of the width, y = the ground line it is over (0..1 of the
   height; smaller = farther away), h = height above that ground line (width units). */

export const G = 2.6;                       // gravity (width units / s²)
export const BOUNDS = { x0: 0.1, x1: 0.9, y0: 0.6, y1: 0.965 };   // inside the Pokas' reach
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function makeBall(x = 0.5, y = 0.93) { return { x, y, h: 0, vx: 0, vy: 0, vh: 0, state: 'rest', bounces: 0, heldBy: null, thrownAt: 0, landedAt: 0 }; }

/**
 * A drag gesture becomes a throw. dx/dy are the drag in WIDTH units (dy negative = flicked up/away),
 * ms is the gesture duration. Longer + faster drags throw farther; tiny drags are a gentle toss.
 */
export function throwFromDrag(ball, dx, dy, ms) {
  const t = Math.max(60, Math.min(900, ms || 200)) / 1000;
  const power = Math.min(1, Math.hypot(dx, dy) / Math.max(0.08, t * 0.9));   // 0..1
  const len = Math.hypot(dx, dy) || 1;
  ball.vx = clamp((dx / len) * power * 1.1, -1.2, 1.2);
  ball.vy = clamp((dy / len) * power * 0.35, -0.4, 0.25);   // up = away from the camera
  ball.vh = 0.35 + power * 0.9;                             // arc height follows power
  ball.h = Math.max(ball.h, 0.02); ball.state = 'flying'; ball.bounces = 0; ball.heldBy = null; ball.power = +power.toFixed(2);
  return ball;
}

/** Advance dt seconds. Returns the list of events that happened: 'landed' (first touch), 'bounce', 'rest'. */
export function step(ball, dt) {
  const ev = [];
  if (ball.heldBy || ball.state === 'rest') return ev;
  ball.vh -= G * dt; ball.h += ball.vh * dt;
  ball.x += ball.vx * dt; ball.y += ball.vy * dt;
  if (ball.x < BOUNDS.x0 || ball.x > BOUNDS.x1) { ball.x = clamp(ball.x, BOUNDS.x0, BOUNDS.x1); ball.vx = -ball.vx * 0.6; ev.push('wall'); }
  if (ball.y < BOUNDS.y0 || ball.y > BOUNDS.y1) { ball.y = clamp(ball.y, BOUNDS.y0, BOUNDS.y1); ball.vy = -ball.vy * 0.5; }
  if (ball.h <= 0) {
    ball.h = 0;
    if (ball.state === 'flying') { ball.state = 'rolling'; ev.push('landed'); }
    if (Math.abs(ball.vh) > 0.25) { ball.vh = -ball.vh * 0.5; ball.bounces++; ev.push('bounce'); }
    else ball.vh = 0;
    // rolling friction
    const f = Math.pow(0.4, dt); ball.vx *= f; ball.vy *= f;
    if (Math.hypot(ball.vx, ball.vy) < 0.02 && ball.vh === 0) { ball.vx = ball.vy = 0; ball.state = 'rest'; ev.push('rest'); }
  }
  return ev;
}
/** Where a flying ball will come to rest (used by Pokas that "read" the throw and run ahead). */
export function predictRest(ball, maxT = 6) {
  const b = { ...ball }; let t = 0;
  while (t < maxT && b.state !== 'rest') { step(b, 1 / 60); t += 1 / 60; }
  return { x: b.x, y: b.y, t };
}
export const pick = (ball, petId) => { ball.heldBy = petId; ball.state = 'held'; ball.vx = ball.vy = ball.vh = 0; ball.h = 0; return ball; };
export const drop = (ball, x, y) => { ball.heldBy = null; ball.state = 'rest'; ball.x = clamp(x, BOUNDS.x0, BOUNDS.x1); ball.y = clamp(y, BOUNDS.y0, BOUNDS.y1); ball.h = 0; return ball; };
