/* FRIENDS & INVITES — calls to the PokaSnap social functions on the KEEPITIL project
   (supabase/migrations/*pokasnap_social*.sql). Signed-in, non-anonymous accounts only;
   every function acts as the caller. Returns { ok, ... } and never throws to the UI. */

import { client, session } from './auth.js';

async function rpc(name, args = {}) {
  try {
    if (!navigator.onLine) return { ok: false, reason: 'offline' };
    const s = await session(); if (!s) return { ok: false, reason: 'signin' };
    const { data, error } = await (await client()).rpc(name, args);
    if (error) return { ok: false, reason: /account is required/.test(error.message) ? 'signin' : 'server', error: error.message };
    return { ok: true, data };
  } catch (e) { return { ok: false, reason: 'server', error: String(e?.message || e) }; }
}
export const register = name => rpc('pokasnap_register_player', { p_display_name: name }).then(r => r.ok ? { ok: true, me: r.data?.[0] } : r);
export const me = () => rpc('pokasnap_me').then(r => r.ok ? { ok: true, me: r.data?.[0] || null } : r);
export const redeem = code => rpc('pokasnap_redeem_invite', { p_code: code }).then(r => r.ok ? r.data : r);
export const myReferrals = () => rpc('pokasnap_my_referrals').then(r => r.ok ? { ok: true, list: r.data || [] } : r);
export const requestFriend = code => rpc('pokasnap_request_friend', { p_code: code }).then(r => r.ok ? r.data : r);
export const respondFriend = (other, accept) => rpc('pokasnap_respond_friend', { p_other: other, p_accept: accept }).then(r => r.ok ? r.data : r);
export const friends = () => rpc('pokasnap_friends').then(r => r.ok ? { ok: true, list: r.data || [] } : r);
