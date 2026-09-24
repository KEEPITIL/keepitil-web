/* ANALYTICS — the MVP event list only, behind one function.
   ---------------------------------------------------------------------------
   track() records to a small local ring (inspectable at window.PokaAnalytics)
   and forwards to a sink if one is configured. No photo, no free text and no
   personal data is ever an event property. A dashboard is out of scope for V1:
   pointing the sink at a real endpoint later is a one-line change. */

export const EVENTS = [
  // launch & account
  'app_open', 'session_started', 'play_now_tapped', 'returning_user', 'signup_started', 'signup_completed',
  // pet
  'pet_created', 'pet_selected', 'pet_customized', 'pet_named', 'pet_poked', 'pet_fed', 'pet_mood_changed',
  // train
  'training_started', 'skill_learned',
  // photo loop
  'mission_started', 'pose_selected', 'photo_taken', 'score_received', 'personal_best', 'mission_completed',
  'photo_saved', 'album_opened', 'level_up', 'cosmetic_equipped',
  // retention
  'daily_task_completed', 'achievement_unlocked',
  // music (outbound only; never tied to rewards)
  'soundcloud_link_opened', 'soundcloud_track_opened',
  // future purchases (not emitted until a store exists)
  'store_viewed', 'product_viewed', 'purchase_started', 'purchase_completed',
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

if (typeof window !== "undefined") window.PokaAnalytics = { events: ring, EVENTS };
