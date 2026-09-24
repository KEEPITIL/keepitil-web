/* ANALYTICS — the MVP event list only, behind one function.
   ---------------------------------------------------------------------------
   track() records to a small local ring (inspectable at window.PokaAnalytics)
   and forwards to a sink if one is configured. No photo, no free text and no
   personal data is ever an event property. A dashboard is out of scope for V1:
   pointing the sink at a real endpoint later is a one-line change. */

export const EVENTS = [
  'app_open', 'signup_started', 'signup_completed', 'pet_created', 'pet_selected', 'pet_customized',
  'mission_started', 'pet_poked', 'pose_selected', 'photo_taken', 'photo_saved', 'mission_completed',
  'score_received', 'level_up', 'cosmetic_equipped',
];

const ring = [];
let sink = null;

export function setSink(fn) { sink = fn; }

export function track(name, props = {}) {
  if (!EVENTS.includes(name)) { console.warn('[analytics] unknown event', name); return; }
  const ev = { name, at: Date.now(), ...props };
  ring.push(ev); if (ring.length > 200) ring.shift();
  if (sink) { try { sink(ev); } catch (e) {} }
}

window.PokaAnalytics = { events: ring, EVENTS };
