/* ANALYTICS — the MVP event list only, behind one function.
   ---------------------------------------------------------------------------
   track() records to a small local ring (inspectable at window.PokaAnalytics)
   and forwards to a sink if one is configured. No photo, no free text and no
   personal data is ever an event property. A dashboard is out of scope for V1:
   pointing the sink at a real endpoint later is a one-line change. */

export const EVENTS = [
  // 2.1 core game
  'album_set_complete', 'room_edit', 'race_start', 'race_finish', 'build_action', 'puzzle_dig', 'fashion_show', 'dance_show',
  // 2.0 living world
  'interact_used', 'world_snap', 'win_claimed', 'album_claimed', 'event2_claimed', 'event2_turn',
  // 1.4 world
  'journal_opened', 'journal_entry_unlocked', 'species_discovery', 'life_album_milestone', 'rare_moment', 'legendary_moment', 'homeland_entered', 'homeland_interaction', 'interactive_prop_used', 'relationship_started', 'relationship_upgraded', 'community_project_progress', 'community_project_completed', 'life_adventure_completed', 'adventure_party_started', 'adventure_party_completed', 'collection_started', 'collection_completed', 'certification_started', 'certification_completed', 'league_entered', 'league_completed', 'neglect_state_changed', 'recovery_started', 'recovery_completed', 'revival_used', 'mastery_rank', 'continue_tapped', 'milestone_reached',
  // 1.3 gameplay depth
  'prop_toss', 'filter_selected', 'backdrop_selected', 'academy_node_started', 'academy_node_completed', 'academy_rank_up', 'yarn_daily_completed', 'yarn_endless_level', 'walk_prompt_shown', 'walk_prompt_accepted', 'style_upgraded', 'item_imbued', 'loadout_saved', 'diamond_purchase', 'star_track_reward', 'gate_unlocked', 'catalog_viewed', 'academy_viewed',
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
  'music_opened', 'music_played', 'music_youtube_opened', 'music_station_started', 'music_playlist_created',
  'friends_opened', 'invite_share', 'friend_requested', 'friend_accepted', 'invite_redeemed', 'help_opened', 'support_email_opened', 'update_check', 'update_open',
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
