/* FRIENDS & INVITES screen. Friends are other PokaSnap players you add by friend code;
   they see only your display name (your pet's name by default). Nothing else is shared. */

import { h, toast } from '../ui.js';
import { get, update } from '../game/state.js';
import * as S from '../platform/social.js';
import { shareInvite } from '../platform/native.js';
import { SOCIAL, rewardInviteSent, rewardReferrals, rewardFriendships, canRedeem, inviteText, INVITE_URL } from '../game/social.js';
import { has as ledgerHas, dayKey } from '../game/ledger.js';
import { track } from '../platform/analytics.js';

const REASON = { signin: 'Sign in with your PokaSnap account first.', offline: 'You\'re offline. Friends need a connection.', code: 'That friend code wasn\'t found. Check the 8 letters and numbers.',
  self: 'That\'s your own code.', not_new: 'Invite codes are for new players (within 14 days of signing up).', already: 'You\'ve already used an invite code.',
  play: 'Take your first photo, then enter your friend\'s code.', rate: 'That\'s a lot of requests today. Try again tomorrow.', register: 'Setting up your friend code…', server: 'Couldn\'t reach PokaSnap. Try again in a moment.' };

export async function friendsScreen(app, opts = {}) {
  track('friends_opened', {});
  const body = h('div', { class: 'stack' }, h('p', { class: 'small' }, 'Loading your friends…'));
  app.mount(h('div', { class: 'screen friends-screen', style: 'gap:12px' },
    h('div', { class: 'row' }, h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => app.go(opts.from === 'settings' ? 'settings' : 'pets') }, '←'), h('h1', { style: 'margin:0' }, 'Friends & Invites')),
    h('p', { class: 'sub' }, `Invite friends and add each other. +${SOCIAL.inviteSent} coins for sending an invite (once a day), +${SOCIAL.friendJoined} for every friend who joins with your code, +${SOCIAL.befriended} for every new friend.`),
    body));

  const payout = paid => { if (paid.length) toast(`🪙 +${paid.reduce((a, p) => a + p.coins, 0)} coins: ${paid.map(p => p.name).join(', ')}`, 3200); };
  async function draw() {
    const st = get();
    if (!st.account?.userId) {
      body.replaceChildren(h('div', { class: 'card' }, h('b', {}, 'Friends need a PokaSnap account'), h('p', { class: 'small' }, 'Your friends see only your display name. Guests can keep playing; friends are optional.'),
        h('button', { class: 'btn block', onclick: () => app.go('email') }, 'CREATE OR SIGN IN TO AN ACCOUNT')));
      return;
    }
    let meR = await S.me();
    if (meR.ok && !meR.me) meR = await S.register(st.pet?.name || 'Poka Friend');
    if (!meR.ok) { body.replaceChildren(h('div', { class: 'card warn' }, REASON[meR.reason] || REASON.server), h('button', { class: 'btn ghost block', onclick: draw }, 'TRY AGAIN')); return; }
    const mine = meR.me;
    const [refs, fr] = await Promise.all([S.myReferrals(), S.friends()]);
    let paid = [];
    update(s => { paid = [...(refs.ok ? rewardReferrals(s, refs.list) : []), ...(fr.ok ? rewardFriendships(s, fr.list) : [])]; });
    payout(paid);
    const list = fr.ok ? fr.list : [];
    const friendsNow = list.filter(f => f.status === 'friends');
    if (fr.ok) update(s => { s.social = { ...(s.social || {}), friendCount: friendsNow.length, at: Date.now() }; });   // 2.0 team events read this
    const incoming = list.filter(f => f.status === 'pending' && !f.requested_by_me), outgoing = list.filter(f => f.status === 'pending' && f.requested_by_me);
    const sentToday = ledgerHas(get(), `invite:${dayKey()}`);
    const codeIn = h('input', { type: 'text', maxlength: '8', autocapitalize: 'characters', placeholder: 'FRIEND CODE', 'aria-label': 'Friend code' });
    const redeemIn = h('input', { type: 'text', maxlength: '8', autocapitalize: 'characters', placeholder: 'INVITE CODE', 'aria-label': 'Invite code from the friend who invited you' });
    const can = canRedeem(get(), true);
    body.replaceChildren(
      h('div', { class: 'card friend-code' }, h('p', { class: 'small', style: 'margin:0' }, 'YOUR FRIEND CODE'), h('b', { class: 'code' }, mine.friend_code), h('p', { class: 'small', style: 'margin:4px 0 0' }, `Friends see you as “${mine.display_name}”.`),
        h('button', { class: 'btn block', onclick: async () => {
          const r = await shareInvite(inviteText(mine.friend_code, get().pet?.name), INVITE_URL);
          track('invite_share', { completed: !!r.completed });
          if (!r.completed) return;                                           // cancelled: nothing paid
          let res; update(s => { res = rewardInviteSent(s); });
          toast(res.ok ? `🪙 +${res.amount} coins for sending an invite!` : 'Invite sent! (Invite coins are once a day.)', 2600); draw();
        } }, sentToday ? '📤 INVITE A FRIEND' : `📤 INVITE A FRIEND (+${SOCIAL.inviteSent})`)),
      h('div', { class: 'card' }, h('b', {}, 'Add a friend'), h('div', { class: 'row', style: 'gap:8px;margin-top:6px' }, codeIn, h('button', { class: 'btn', onclick: async () => {
          const r = await S.requestFriend(codeIn.value); if (!r.ok) return toast(REASON[r.reason] || REASON.server, 2600);
          track('friend_requested', { status: r.status }); toast(r.status === 'friends' ? 'You\'re now friends! 🎉' : 'Friend request sent'); draw(); } }, 'ADD'))),
      incoming.length ? h('div', { class: 'card' }, h('b', {}, 'Friend requests'), ...incoming.map(f => h('div', { class: 'row friend-row' }, h('span', {}, f.display_name),
        h('button', { class: 'chipbtn', onclick: async () => { const r = await S.respondFriend(f.other_id, true); if (!r.ok) return toast(REASON.server); track('friend_accepted', {}); draw(); } }, 'Accept'),
        h('button', { class: 'chipbtn', onclick: async () => { await S.respondFriend(f.other_id, false); draw(); } }, 'Decline')))) : null,
      h('div', { class: 'card' }, h('b', {}, `Friends (${friendsNow.length})`),
        ...(friendsNow.length ? friendsNow.map(f => h('div', { class: 'row friend-row' }, h('span', {}, `🐾 ${f.display_name}`), h('button', { class: 'chipbtn', onclick: async () => { if (!confirm(`Remove ${f.display_name} from your friends?`)) return; await S.respondFriend(f.other_id, false); draw(); } }, 'Remove')))
          : [h('p', { class: 'small' }, 'No friends yet. Share your code or add theirs.')]),
        ...outgoing.map(f => h('p', { class: 'small' }, `⏳ Waiting for ${f.display_name}`))),
      refs.ok && refs.list.length ? h('p', { class: 'small' }, `Friends who joined with your code: ${refs.list.length}`) : null,
      get().social?.redeemed ? null : h('div', { class: 'card' }, h('b', {}, 'Were you invited?'), h('p', { class: 'small' }, can.ok ? 'Enter the code from the friend who invited you. They earn coins for inviting you.' : REASON[can.reason]),
        can.ok ? h('div', { class: 'row', style: 'gap:8px' }, redeemIn, h('button', { class: 'btn ghost', onclick: async () => {
          const r = await S.redeem(redeemIn.value);
          if (!r.ok) { if (r.reason === 'already' || r.reason === 'not_new') update(s => { (s.social = s.social || {}).redeemed = true; }); return toast(REASON[r.reason] || REASON.server, 2800); }
          update(s => { (s.social = s.social || {}).redeemed = true; }); track('invite_redeemed', {}); toast('Thanks! Your friend earns coins for inviting you. 🎉', 2800); draw(); } }, 'SUBMIT')) : null),
      h('p', { class: 'small legal' }, `Friend coins: up to ${SOCIAL.maxReferralsPaid} joined friends and ${SOCIAL.maxFriendsPaid} friendships. Friends see only your display name. Remove a friend any time; deleting your account removes your code and friendships.`));
  }
  draw();
}
