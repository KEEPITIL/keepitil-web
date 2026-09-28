/* FRIENDS & INVITES — reward rules (owner decision 2026-09-27). Pure; no network.
   ---------------------------------------------------------------------------
   +100 coins when the player actually SENDS an invite (share sheet completed, not
   cancelled), at most once per day. +100 for every friend who joins with the player's
   code (a new, real account that has taken a photo, verified server-side), once per
   friend. +100 when two players become friends in the app, once per friend.
   Every payout goes through the ledger with a stable id, so replays, refreshes and
   restores can never pay twice. Lifetime caps keep the economy sane. */

import * as ledger from './ledger.js';

export const SOCIAL = { inviteSent: 100, friendJoined: 100, befriended: 100, maxReferralsPaid: 50, maxFriendsPaid: 50 };

// Count by ledger ids, never by entries: entries are trimmed over time, ids are kept forever.
const paidCount = (st, prefix) => Object.keys(ledger.ensure(st).ids).filter(k => k.startsWith(prefix)).length;

/** The share sheet reported a completed send. */
export function rewardInviteSent(st, now = Date.now()) {
  return ledger.earn(st, { id: `invite:${ledger.dayKey(now)}`, source: 'invite_sent', amount: SOCIAL.inviteSent, now });
}
/** Friends who joined with this player's code (from pokasnap_my_referrals). Pays new ones only. */
export function rewardReferrals(st, referrals, now = Date.now()) {
  const paid = [];
  for (const r of referrals || []) {
    if (paidCount(st, 'ref:') >= SOCIAL.maxReferralsPaid) break;
    const res = ledger.earn(st, { id: `ref:${r.referee_id}`, source: 'friend_joined', amount: SOCIAL.friendJoined, now });
    if (res.ok) paid.push({ name: r.display_name, coins: res.amount });
  }
  return paid;
}
/** Accepted friendships (from pokasnap_friends). Pays each friend once. */
export function rewardFriendships(st, friends, now = Date.now()) {
  const paid = [];
  for (const f of friends || []) {
    if (f.status !== 'friends') continue;
    if (paidCount(st, 'friend:') >= SOCIAL.maxFriendsPaid) break;
    const res = ledger.earn(st, { id: `friend:${f.other_id}`, source: 'befriended', amount: SOCIAL.befriended, now });
    if (res.ok) paid.push({ name: f.display_name, coins: res.amount });
  }
  return paid;
}
/** A code can be redeemed only by a real account that has played (taken a photo). */
export function canRedeem(st, signedIn) {
  if (!signedIn) return { ok: false, reason: 'signin' };
  if ((st.progress?.snaps || 0) < 1) return { ok: false, reason: 'play' };
  if (st.social?.redeemed) return { ok: false, reason: 'already' };
  return { ok: true };
}
export const inviteText = (code, pet) => `Come play PokaSnap with me${pet ? ` and ${pet}` : ''}! 📸 Add my friend code ${code} in Friends & Invites.`;
export const INVITE_URL = 'https://keepitil.com/games/pokasnap/';
