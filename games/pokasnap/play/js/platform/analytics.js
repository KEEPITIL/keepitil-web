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
  // 1.2 funnel & economy
  'onboarding_started', 'onboarding_completed', 'first_pet_created', 'first_snap', 'first_mission_complete',
  'daily_snap_complete', 'active_day', 'streak_milestone', 'weekly_milestone', 'monthly_milestone',
  'event_joined', 'event_points_earned', 'event_headline_unlocked', 'prestige_reward_unlocked',
  'coins_earned', 'coins_spent', 'friday_gift_claimed',
  'store_opened', 'item_previewed', 'purchase_restored', 'plus_viewed', 'plus_started', 'plus_expired', 'plus_restored', 'plus_preview_started',
  'rewarded_media_started', 'rewarded_media_completed', 'rewarded_media_skipped',
  'walk_permission_requested', 'walk_permission_granted', 'walk_permission_denied', 'walk_session_started', 'walk_session_completed',
  'step_milestone', 'journey_snap', 'rare_moment', 'adventure_recap_shared', 'cloud_backup', 'cloud_restore',
  'notification_permission_requested',
  // music (outbound only; never tied to rewards)
  'soundcloud_link_opened', 'soundcloud_track_opened',
  'store_viewed', 'product_viewed', 'purchase_started', 'purchase_completed', 'purchase_failed',
];

const ring = [];
let sink = null;

export function setSink(fn) { sink = fn; }

/* Health data never enters analytics: step counts are reported only as the
   milestone bucket reached (1000/2500/...), never the raw number. */
const FORBIDDEN_PROPS = ['steps', 'stepCount', 'rawSteps', 'heartRate', 'sleep', 'weight', 'calories', 'lat', 'lng', 'location'];
export function track(name, props = {}) {
  if (!EVENTS.includes(name)) { console.warn('[analytics] unknown event', name); return; }
  for (const k of Object.keys(props)) if (FORBIDDEN_PROPS.includes(k)) { console.warn('[analytics] dropped private prop', k); delete props[k]; }
  const ev = { name, at: Date.now(), ...props };
  ring.push(ev); if (ring.length > 200) ring.shift();
  if (sink) { try { sink(ev); } catch (e) {} }
}

if (typeof window !== "undefined") window.PokaAnalytics = { events: ring, EVENTS };
