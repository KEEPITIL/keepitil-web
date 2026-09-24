/* SCORING — deterministic, no image analysis.
   ---------------------------------------------------------------------------
   Everything scored is already known to the app: the pet's bounding box in
   the photo, its scale, placement, rotation, flip, pose, equipped cosmetics,
   and whether it was poked just before the shutter. The same inputs always
   produce the same score -- so a test can pin it, and a future computer-vision
   judge can replace a component without touching the rest.

   Maximum 5,000:
     FRAMING   0-1000   the pet is actually in the picture (or deliberately
                        half-hidden, for Hide and Seek)
     SIZE      0-750    the scale the mission asks for
     POSITION  0-750    where the mission wants the pet in frame
     POSE      0-1000   the recommended pose, partial credit for a relative
     MISSION   0-1000   completing the mission at all
     BONUS     0-500    CREATIVE BONUS: tilt, flip, outfit, a well-timed poke

   Technical scoring never punishes creative intent: a "Biggest Pet Ever" pet
   spilling off the frame, an edge-framed pet on an edge mission, or a
   half-hidden Hide and Seek pet all score full FRAMING. explain() turns the
   weakest component into one concrete tip, so a score is never a mystery. */

import { pose as poseOf } from '../data/poses.js';

export const MAX = { framing: 1000, size: 750, position: 750, pose: 1000, mission: 1000, bonus: 500 };
const clamp01 = v => Math.max(0, Math.min(1, v));

/**
 * @param snap {
 *   frame: { w, h },                  photo size
 *   box:   { x, y, w, h },            pet bounding box in photo pixels
 *   rot, flipped, poseId, equippedCount, pokedRecently
 * }
 * @param mission  mission record
 */
export function scoreSnap(snap, mission) {
  const { frame, box } = snap;
  const W = frame.w, H = frame.h;

  // ---- FRAMING: how much of the pet is inside the photo ----
  const ix = Math.max(0, Math.min(box.x + box.w, W) - Math.max(box.x, 0));
  const iy = Math.max(0, Math.min(box.y + box.h, H) - Math.max(box.y, 0));
  const visible = box.w * box.h > 0 ? (ix * iy) / (box.w * box.h) : 0;
  let framing;
  const big = mission.size === 'big';
  if (big) {
    // overflowing the frame IS the shot; only a pet that is mostly gone loses points
    framing = visible >= 0.55 ? 1 : Math.pow(visible / 0.55, 2);
  } else if (mission.partial) {
    // Hide and Seek wants roughly half the pet showing
    framing = visible <= 0.05 ? 0 : 1 - Math.min(1, Math.abs(visible - 0.55) / 0.45);
  } else {
    framing = visible >= 0.98 ? 1 : Math.pow(visible, 2.2);
  }
  // breathing room from the edges reads as a well-framed shot
  if (!mission.partial && !big && mission.place !== 'edge' && visible >= 0.98) {
    const margin = Math.min(box.x, box.y, W - box.x - box.w, H - box.y - box.h) / Math.min(W, H);
    if (margin < 0.02) framing *= 0.9;
  }

  // ---- SIZE: pet height as a fraction of the photo ----
  const hf = box.h / H;
  const want = { big: [0.62, 1.4], tiny: [0.06, 0.2], normal: [0.3, 0.6], any: [0.2, 0.75] }[mission.size || 'any'];
  let size;
  if (hf >= want[0] && hf <= want[1]) size = 1;
  else {
    const d = hf < want[0] ? (want[0] - hf) / want[0] : (hf - want[1]) / want[1];
    size = clamp01(1 - d * 1.6);
  }

  // ---- POSITION: where the pet sits in frame ----
  const cx = (box.x + box.w / 2) / W, feet = (box.y + box.h) / H;
  let position;
  switch (mission.place) {
    case 'low':    position = clamp01(1 - Math.max(0, 0.62 - feet) / 0.4) * (1 - Math.max(0, Math.abs(cx - 0.5) - 0.35)); break;
    case 'edge':   position = clamp01(1 - Math.min(Math.abs(cx - 1 / 3), Math.abs(cx - 2 / 3)) / 0.22); break;
    case 'center': position = clamp01(1 - Math.abs(cx - 0.5) / 0.3) * clamp01(1 - Math.abs(feet - 0.72) / 0.45); break;
    default: {
      // rule of thirds, or dead centre -- both are good photography
      const thirds = Math.min(Math.abs(cx - 1 / 3), Math.abs(cx - 2 / 3), Math.abs(cx - 0.5));
      position = clamp01(1 - thirds / 0.3);
    }
  }

  // ---- POSE ----
  let poseScore;
  if (mission.anySkill) poseScore = poseOf(snap.poseId).skill ? 1 : 0.25;
  else if (!mission.recommendedPose || snap.poseId === mission.recommendedPose) poseScore = 1;
  else if (poseOf(snap.poseId).posture === poseOf(mission.recommendedPose).posture) poseScore = 0.6;
  else poseScore = 0.25;

  // ---- MISSION: completed by taking the photo with the pet actually visible ----
  let missionScore = visible > 0.05 ? 1 : 0;
  if (missionScore && mission.outfit && !(snap.equippedCount > 0)) missionScore = 0.4;   // Pet Fashion needs an outfit

  // ---- BONUS: creativity ----
  let bonus = 0;
  const tiltDeg = Math.abs((snap.rot || 0) * 180 / Math.PI) % 360;
  if (tiltDeg > 8 && tiltDeg < 352) bonus += 150;
  if (snap.flipped) bonus += 50;
  bonus += Math.min(2, snap.equippedCount || 0) * 100;
  if (snap.pokedRecently) bonus += 100;
  bonus = Math.min(MAX.bonus, bonus);

  const parts = {
    framing:  Math.round(framing * MAX.framing),
    size:     Math.round(size * MAX.size),
    position: Math.round(position * MAX.position),
    pose:     Math.round(poseScore * MAX.pose),
    mission:  Math.round(missionScore * MAX.mission),
    bonus,
  };
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  return { parts, total, grade: grade(total), detail: { visible, hf, cx, feet, want } };
}

export const LABELS = { framing: 'FRAMING', size: 'PET SIZE', position: 'POSITION', pose: 'POSE', mission: 'MISSION', bonus: 'CREATIVE BONUS' };

/**
 * One concrete, mission-aware way to score higher. Picks the component with
 * the most points left on the table. poseName(id) -> display name.
 * Returns { part, text } -- text uses {name} for the pet.
 */
export function explain(sc, mission, snap, poseName = id => id) {
  const lost = Object.keys(MAX).map(k => ({ k, left: MAX[k] - sc.parts[k] })).sort((a, b) => b.left - a.left);
  const top = lost[0], d = sc.detail;
  if (!top || top.left < 60) return { part: null, text: 'Perfect shot! Try a new pose or mission for fun.' };
  switch (top.k) {
    case 'framing':
      return { part: 'framing', text: mission.partial ? (d.visible > 0.55 ? 'Hide a bit more of {name} behind something.' : 'Let a little more of {name} peek out.')
        : 'Keep all of {name} inside the photo, with a little space around.' };
    case 'size':
      if (mission.size === 'big') return { part: 'size', text: 'Make {name} even BIGGER — pinch outward.' };
      if (mission.size === 'tiny') return { part: 'size', text: 'Shrink {name} way down — pinch inward.' };
      return { part: 'size', text: d.hf < d.want[0] ? 'Make {name} larger in the frame.' : 'Make {name} a little smaller in the frame.' };
    case 'position':
      if (mission.place === 'low') return { part: 'position', text: 'Move {name} lower, as if standing on the ground.' };
      if (mission.place === 'edge') return { part: 'position', text: 'Slide {name} to the left or right third.' };
      return { part: 'position', text: 'Move {name} slightly closer to the center.' };
    case 'pose':
      return { part: 'pose', text: mission.anySkill ? 'Use a trick {name} learned in Train.' : `Try the ${poseName(mission.recommendedPose)} pose — this mission loves it.` };
    case 'mission':
      return { part: 'mission', text: mission.outfit ? 'Put an accessory on {name} first — it\'s a fashion mission!' : 'Make sure {name} is in the photo.' };
    default:
      return { part: 'bonus', text: 'Tilt, flip, poke or add an outfit for creative points.' };
  }
}

export function grade(total) {
  if (total >= 4500) return 'PAWSOME SNAP!';
  if (total >= 3800) return 'AWESOME SNAP!';
  if (total >= 3000) return 'GREAT SNAP!';
  if (total >= 2000) return 'NICE SNAP!';
  return 'CUTE SNAP!';
}

export function stars(total) { return total >= 4200 ? 3 : total >= 3000 ? 2 : 1; }
