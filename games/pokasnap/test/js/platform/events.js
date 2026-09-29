/* TEAM EVENTS — calls to the server functions in supabase/migrations/*pokasnap_team_events.sql.
   Signed-in, non-anonymous accounts only. The server computes every contribution from bounded inputs
   (the client never sends a score), dedupes by idempotency key, rate-limits, and allows one claim per
   milestone. Returns { ok, ... } and never throws to the UI. */
import { client, session } from './auth.js';

async function rpc(name, args = {}) {
  try {
    if (!navigator.onLine) return { ok: false, reason: 'offline' };
    const s = await session(); if (!s) return { ok: false, reason: 'signin' };
    const { data, error } = await (await client()).rpc(name, args);
    if (error) return { ok: false, reason: /account is required/.test(error.message) ? 'signin' : /not active/.test(error.message) ? 'not_active' : 'server', error: error.message };
    return data && typeof data === 'object' && 'ok' in data ? data : { ok: true, data };
  } catch (e) { return { ok: false, reason: 'server', error: String(e?.message || e) }; }
}
export const idem = () => 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
export const state = eventId => rpc('pokasnap_event_state', { p_event: eventId });
export const join = eventId => rpc('pokasnap_event_join', { p_event: eventId });
/** detail: racing { ms, mistakes, obstacles } · build { piece }. key must be reused if the same action is retried. */
export const contribute = (eventId, action, detail, key) => rpc('pokasnap_event_contribute', { p_event: eventId, p_action: action, p_detail: detail, p_idem: key });
export const claim = (eventId, milestone) => rpc('pokasnap_event_claim', { p_event: eventId, p_milestone: milestone });
export const REASON = { signin: 'Team events need a signed-in PokaSnap account (Friends & Community → sign in).', offline: 'You\'re offline — team progress will sync when you\'re back.',
  not_active: 'This event isn\'t running right now.', too_fast: 'Catch your breath — try again in a few seconds.', daily_cap: 'That\'s the daily team limit — great work!',
  invalid: 'That action couldn\'t be counted.', claimed: 'Already claimed.', not_done: 'Your team hasn\'t reached that yet.', not_member: 'Join the team first.', server: 'Couldn\'t reach PokaSnap. Try again.' };
