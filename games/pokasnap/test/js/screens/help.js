/* HELP & SUPPORT — answers from the game's own knowledge, plus a human.
   ---------------------------------------------------------------------------
   Not an AI: no assistant is connected (docs/nexus/NEXUS-STATUS.md), so nothing here is
   labelled AI. Email goes to a person. The only detail an email can include is the app
   version and screen, and only if the player ticks the box after seeing exactly what is
   sent. No photos, saves, step data, account details or payment data, ever. */

import { h } from '../ui.js';
import { track } from '../platform/analytics.js';

export const SUPPORT_EMAIL = 'info@keepitil.com';
export const FAQ = [
  ['The camera won\'t open', 'PokaSnap needs camera permission: iPhone Settings → PokaSnap → Camera. You can also play with SCENE (built-in backdrops) or Use a photo.'],
  ['Saving a photo doesn\'t work', 'Allow adding photos: iPhone Settings → PokaSnap → Photos → Add Photos Only. PokaSnap never reads your library.'],
  ['My steps don\'t show', 'Walk uses Apple Health steps: Health app → Sharing → Apps → PokaSnap → Steps. Steps stay on your phone. No Health access? A timed walk earns the same rewards.'],
  ['I don\'t get reminders', 'Turn on reminders in Settings → Notifications, and check iPhone Settings → Notifications → PokaSnap.'],
  ['Where did my purchase go?', 'Open PokaSnap+ or Settings and tap Restore Purchases. Purchases are tied to your Apple ID.'],
  ['How do I cancel PokaSnap+?', 'iPhone Settings → your name → Subscriptions → PokaSnap+. You keep anything marked "yours forever".'],
  ['KEEPITIL Music won\'t play', 'Music needs an internet connection. Tap "Open in SoundCloud" or the YouTube button to listen in those apps. Game music pauses while KEEPITIL Music plays.'],
  ['How do friends and invite coins work?', 'Friends need an account. +100 coins when you send an invite (once a day), +100 for each friend who joins with your code, +100 for each new friend. Friends see only your display name.'],
  ['Back up and restore', 'Sign in, then My Snaps → Back up on a photo, or Settings → Back up favourites now. On a new phone, sign in and tap Restore from cloud. Step counts are never backed up.'],
  ['My pet seems sad or withdrawn', 'Pets need regular care. Feed, pet and play a little each day and they recover. After about a month without care a pet may rest in the Memorial Garden; Revival Treats (earned at levels 50 and 100) bring a pet back.'],
  ['Delete my account', 'Settings → Delete account. This removes your account, cloud progress, backed-up photos, friend code and friendships. Settings → Start over erases the game on this phone.'],
];

export function mailtoHref({ includeVersion, route } = {}) {
  const body = includeVersion ? `\n\n---\nApp: PokaSnap ${window.POKASNAP_VERSION || ''}\nScreen: ${route || ''}` : '';
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('PokaSnap help')}&body=${encodeURIComponent('Hi KEEPITIL team,\n\n' + body)}`;
}

export function helpScreen(app, opts = {}) {
  track('help_opened', {});
  const tick = h('input', { type: 'checkbox', id: 'incl' });
  const preview = h('pre', { class: 'small help-preview', hidden: true }, `App: PokaSnap ${window.POKASNAP_VERSION || ''}\nScreen: ${opts.from || 'settings'}`);
  tick.onchange = () => { preview.hidden = !tick.checked; };
  app.mount(h('div', { class: 'screen help-screen', style: 'gap:12px' },
    h('div', { class: 'row' }, h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => app.go(opts.from === 'home' ? 'home' : 'settings') }, '←'), h('h1', { style: 'margin:0' }, 'Help & Support')),
    h('p', { class: 'sub' }, 'Quick answers from the PokaSnap team. Still stuck? Email a real person below.'),
    ...FAQ.map(([q, a]) => h('details', { class: 'card faq' }, h('summary', {}, h('b', {}, q)), h('p', { class: 'small', style: 'margin:8px 0 0' }, a))),
    h('div', { class: 'card' }, h('b', {}, 'Talk to a person'),
      h('label', { class: 'row small', style: 'gap:8px;align-items:center;margin-top:8px', for: 'incl' }, tick, 'Include the app version and this screen (shown below; nothing else)'),
      preview,
      h('a', { class: 'btn block', style: 'margin-top:8px;text-align:center', onclick: e => { e.currentTarget.href = mailtoHref({ includeVersion: tick.checked, route: opts.from || 'settings' }); track('support_email_opened', { version: tick.checked }); } , href: mailtoHref({}) }, `✉️ EMAIL ${SUPPORT_EMAIL.toUpperCase()}`))));
}
