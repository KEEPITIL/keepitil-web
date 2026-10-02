/* SPEAR GEOMETRY — the one shared model of where a spear physically is (Build 62 spear-realism directive §2–§7).
   The host (index.html) computes each spear's grip/tip from the SAME rig pose the renderer draws, every sim step,
   and stores it on the unit as u._spear. Everything that needs the weapon's position -- the frontal standoff that
   keeps an enemy body at the point, the swept-tip thrust collision, the debug overlay, the goldens -- reads that
   record. There is no second "unit centre + range number" spear anywhere.
     grip      world point of the weapon hand
     dir       unit vector along the shaft (world)
     len       rendered shaft length beyond the hand (world px)
     tip       current tip world point
     prevTip   last step's tip (the swept segment prevTip->tip is what can hit something)
     tipGuard  the tip at the guard/idle pose: the standoff line an enemy body cannot cross
     phase     thrust phase p (0..1) when thrusting, else null
     integrity successful shield interceptions remaining (20 per spear; the weapon owns it)              */
(function(){
  'use strict';
  const INTEGRITY = 20;                 // owner rule: 20 successful shield interceptions, then the spear breaks
  const LANE = 12;                      // same-lane band in world px (row pitch is 15)
  const TIP_R = 3;                      // tip/head collision radius, world px
  const HOLD_STEP = 3;                  // the standoff may move a body at most this far per step (no teleport)
  const THRUST_WINDOW = [0.22, 0.56];   // thrust phase in which the tip can damage (drive -> peak reach)
  const BODY_H = 40;                    // soldiers stand on u.y and are drawn 40px tall
  /* §10 rear-rank grip shift, rig units. Ranks stand 28px apart and the dory projects ~53px at rest, so a rear rank
     with the same grip peaks ~15px short of an enemy held at the front rank's point. Sliding the hands 70 units
     (~20px) back along the shaft puts the rear-rank thrust ~6px past that line while its RESTING point stays behind
     the front rank's (so the front rank still defines the standoff). */
  const REAR_GRIP = 70;
  /* Giants, bosses and siege engines are pricked by a spear, never impaled: documented exception (§7). */
  const EXCEPT = new Set(['eboss', 'aetherwing', 'mech', 'hammer']);
  function ordinaryInfantry(u, types){ const T = types[u.type] || {}; return !u.boss && !EXCEPT.has(u.type) && T.role !== 'BOSS' && !u.folkGiant && !u.giant; }
  function hasSpear(u, types){ const w = types[u.type] && types[u.type].weapon; return (w === 'spear' || w === 'spartan') && !u.spearThrown && !u.spearLost && u.hp > 0; }
  function initIntegrity(u){ if (u.spearIntegrity === undefined) u.spearIntegrity = INTEGRITY; return u.spearIntegrity; }
  function update(u, rec){
    const prev = u._spear;
    u._spear = { grip: rec.grip, dir: rec.dir, len: rec.len, tip: rec.tip, prevTip: prev ? prev.tip : rec.tip, tipGuard: rec.tipGuard,
      phase: rec.phase, thrusting: !!rec.thrusting, mismatch: !!rec.mismatch, integrity: initIntegrity(u) };
    return u._spear;
  }
  /* A carried shield intercepts frontal contact: the plane is the body's front edge, full body height. */
  function facingShield(o, fromX){ return (o.shield || 0) > 0 && Math.sign(fromX - o.x) === (o.face || 1); }
  function shieldPlane(o, half){ const f = o.face || 1; return { x: o.x + f * half, y0: o.y - BODY_H, y1: o.y, facing: f }; }
  /* swept tip segment a->b against a vertical plane */
  function sweepHitsPlane(a, b, plane){
    const dx = b[0] - a[0]; let t;
    if (Math.abs(dx) < 1e-6){ if (Math.abs(a[0] - plane.x) > TIP_R) return null; t = 1; }
    else { t = (plane.x - a[0]) / dx; if (t < -TIP_R / Math.abs(dx) || t > 1 + TIP_R / Math.abs(dx)) return null; t = Math.max(0, Math.min(1, t)); }
    const y = a[1] + (b[1] - a[1]) * t; if (y < plane.y0 - TIP_R || y > plane.y1 + TIP_R) return null;
    return { t, x: plane.x, y };
  }
  /* swept tip against a body ellipse (half-width hw, height BODY_H above the feet) */
  function sweepHitsBody(a, b, o, hw){
    const cx = o.x, cy = o.y - BODY_H / 2, rx = hw + TIP_R, ry = BODY_H / 2 + TIP_R;
    for (let k = 0; k <= 10; k++){ const t = k / 10, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
      const nx = (x - cx) / rx, ny = (y - cy) / ry; if (nx * nx + ny * ny <= 1) return { t, x, y }; }
    return null;
  }
  window.KW_SPEAR = Object.freeze({ INTEGRITY, LANE, TIP_R, HOLD_STEP, THRUST_WINDOW, BODY_H, EXCEPT, REAR_GRIP,
    ordinaryInfantry, hasSpear, initIntegrity, update, facingShield, shieldPlane, sweepHitsPlane, sweepHitsBody });
})();
