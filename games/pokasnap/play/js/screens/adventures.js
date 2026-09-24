/* ADVENTURES — the weekly event, Choose Your Adventure, the three commitment
   tracks (streak / week / month), Poka Friday and the Daily Snap entry.
   Every progress bar also shows its number, and status never relies on
   colour alone (✓ / 🔒 / "earn only" text). */

import { h, fmt, coin, sheet, toast } from '../ui.js';
import { livePet } from './flow.js';
import { get, update } from '../game/state.js';
import { PATHS, EVENT_LADDER, PLUS_EVENT_BOOST } from '../data/economy.js';
import { item as itemOf } from '../data/items.js';
import { ladderView, join, currentEvent, nextEvent, maxDailyPoints } from '../game/events.js';
import { view as activityView } from '../game/activity.js';
import { plusSubscribed } from '../game/entitlements.js';
import { dailyPrompt, dailyDone, fridayClaimable, fridayGift, claimFriday, isFriday } from '../game/adventure.js';
import { drawItemThumb } from '../render/items.js';
import { track } from '../platform/analytics.js';
import { sfx } from '../platform/sound.js';
import { haptic } from '../platform/native.js';
import { announce } from './result.js';

const thumb = (id, size = 64) => { const c = h('canvas', { width: size * 2, height: size * 2, style: `width:${size}px;height:${size}px` }); drawItemThumb(c, id); return c; };
const bar = (value, max, label) => h('div', { class: 'meter', role: 'progressbar', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': max, 'aria-valuenow': Math.min(value, max) },
  h('i', { style: `width:${Math.min(100, 100 * value / max)}%` }), h('span', {}, `${fmt(Math.min(value, max))} / ${fmt(max)}`));

export function adventuresScreen(app, opts = {}) {
  const st = get(), pet = st.pet, lv = ladderView(st), act = activityView(st), plus = plusSubscribed(st);
  const body = [];

  // ---- Daily Snap ----
  const dp = dailyPrompt(), done = dailyDone(st);
  body.push(h('div', { class: 'card dsnap' + (done ? ' done' : '') },
    h('div', { class: 'row between' }, h('b', {}, '☀️ DAILY SNAP'), h('span', { class: 'small' }, done ? '✓ Done today' : '30 seconds · +' + (plus ? 75 : 50) + ' coins')),
    h('p', { class: 'dsnap-prompt' }, dp.icon, ' ', dp.text),
    done ? h('p', { class: 'small', style: 'margin:0' }, 'A new prompt arrives tomorrow. Normal photos are always unlimited.')
      : h('button', { class: 'btn block', onclick: () => app.go('camera', { missionId: 'daily_snap', daily: true }) }, '📸 TAKE THE DAILY SNAP')));

  // ---- Friday ----
  if (isFriday()) {
    const g = fridayGift(), can = fridayClaimable(st);
    body.push(h('div', { class: 'card friday' },
      h('b', {}, '🎁 POKA FRIDAY'),
      h('p', { style: 'margin:6px 0 10px' }, can ? `${pet.name} found a gift for you!` : `Opened: ${g.label}. See you next Friday!`),
      can ? h('button', { class: 'btn sun block', onclick: () => openFriday(app) }, 'OPEN THE GIFT') : null));
  } else {
    const d = (5 - new Date().getDay() + 7) % 7 || 7;
    body.push(h('p', { class: 'small friday-next' }, `🎁 Next Poka Friday gift in ${d} day${d > 1 ? 's' : ''}.`));
  }

  // ---- weekly event ----
  if (lv) {
    const ev = lv.event, head = itemOf(ev.items.headline), pres = itemOf(ev.items.prestige);
    const pv = h('canvas', { width: 280, height: 280, class: 'ev-pet' });
    const petWith = { ...pet, equipped: { ...pet.equipped, BODY: ev.items.headline } };
    livePetInto(pv, petWith);
    body.push(h('div', { class: `card event theme-${ev.theme}` },
      h('div', { class: 'row between' }, h('b', {}, `${ev.icon} ${ev.name.toUpperCase()}`), h('span', { class: 'small' }, `${ev.daysLeft} day${ev.daysLeft === 1 ? '' : 's'} left`)),
      h('div', { class: 'ev-head' }, pv, h('div', {},
        h('p', { class: 'small', style: 'margin:0' }, ev.blurb),
        h('p', { style: 'margin:6px 0 2px;font-weight:900' }, `Headline: ${head.name}`),
        h('p', { class: 'small', style: 'margin:0' }, plus ? 'PokaSnap+: headline included — keep playing for 125 and 150.' : 'Earn it at 100 AP — or get it with PokaSnap+ or Buy Now.'))),
      bar(lv.points, lv.max, 'Adventure Points'),
      plus ? h('p', { class: 'small', style: 'margin:4px 0 0' }, `PokaSnap+ enhanced catch-up: ×${PLUS_EVENT_BOOST} Adventure Points`) : null,
      h('ol', { class: 'ladder' }, ...lv.steps.map(s => h('li', { class: (s.claimed ? 'got ' : s.reached ? 'reach ' : '') + (s.earnOnly ? 'prestige' : '') },
        h('span', { class: 'pts' }, s.points),
        s.item ? thumb(s.item, 40) : h('span', { class: 'lic' }, s.coins ? '🪙' : '🍪'),
        h('span', { class: 'lbl' }, s.item ? itemOf(s.item).name : s.coins ? `${s.coins} coins` : s.label,
          s.slot === 'headline' ? h('small', {}, 'Earn · Plus · Buy') : s.earnOnly ? h('small', {}, 'Prestige — earn only') : null),
        h('span', { class: 'st' }, s.claimed ? '✓' : s.owned ? 'Owned' : '🔒'))))));

    // ---- choose your adventure ----
    body.push(h('div', { class: 'card' },
      h('b', {}, '🧭 CHOOSE YOUR ADVENTURE'),
      h('p', { class: 'small', style: 'margin:4px 0 10px' }, 'Every path reaches the same rewards. Switch any time — your points stay.'),
      h('div', { class: 'paths' }, ...Object.entries(PATHS).map(([id, p]) => h('button', {
        class: 'path' + (lv.path === id ? ' on' : ''), 'aria-pressed': String(lv.path === id),
        onclick: () => { let r; update(s => { r = join(s, id); }); if (r?.first) track('event_joined', { event: ev.id, path: id }); sfx.tap(); adventuresScreen(app); },
      }, h('span', { class: 'e' }, p.icon), h('b', {}, p.name), h('span', {}, p.blurb),
        lv.path === id ? h('span', { class: 'ok' }, '✓ Your path') : null))),
      lv.path ? h('div', { class: 'earnlist' }, h('p', { class: 'small', style: 'margin:10px 0 4px' }, `Ways to earn as ${PATHS[lv.path].name}:`),
        ...Object.entries(PATHS[lv.path].points).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 6)
          .map(([k, v]) => h('span', { class: 'chipline' }, `${LABEL[k] || k} +${v}`))) : null,
      h('p', { class: 'small', style: 'margin:10px 0 0' }, `Catch-up friendly: points add up until the event ends. A busy player on any path can still reach 100 in ${Math.ceil(100 / maxDailyPoints(lv.path || 'photographer'))} active day(s).`)));
    const nx = nextEvent();
    if (nx) body.push(h('p', { class: 'small', style: 'text-align:center' }, `Next week: ${nx.icon} ${nx.name}`));
  }

  // ---- commitment tracks ----
  body.push(h('div', { class: 'card tracks' },
    h('b', {}, '🔥 YOUR ACTIVE DAYS'),
    h('p', { class: 'small', style: 'margin:4px 0 8px' }, act.today ? 'Today counts! ✓' : 'Snap, care, train or walk to make today count.'),
    h('div', { class: 'track' }, h('span', { class: 'k' }, `Streak: ${act.streak} day${act.streak === 1 ? '' : 's'}`),
      h('div', { class: 'dots7' }, ...act.streakLadder.map((s, i) => h('i', { class: i < (act.streak % 7 || (act.streak ? 7 : 0)) ? 'on' : '', title: `Day ${s.day}: ${s.coins} coins${s.label ? ' · ' + s.label : ''}` }, s.day)))),
    h('p', { class: 'small', style: 'margin:2px 0 10px' }, 'Missing a day only restarts the streak count. Nothing you earned is ever taken away.'),
    h('div', { class: 'track' }, h('span', { class: 'k' }, `This week: ${act.weekDays} / 7 active days`), bar(act.weekDays, 7, 'Active days this week')),
    h('div', { class: 'miles' }, ...act.weeklyLadder.map(m => h('span', { class: 'mile' + (act.weekDays >= m.days ? ' got' : '') }, `${act.weekDays >= m.days ? '✓ ' : ''}${m.days}d · ${m.coins} coins`))),
    h('div', { class: 'track' }, h('span', { class: 'k' }, `This month: ${act.monthDays} active days`), bar(act.monthDays, 25, 'Active days this month')),
    h('div', { class: 'miles' }, ...act.monthlyLadder.map(m => h('span', { class: 'mile' + (act.monthDays >= m.days ? ' got' : '') },
      `${act.monthDays >= m.days ? '✓ ' : ''}${m.days}d · ${m.coins ? m.coins + ' coins' : m.item ? itemOf(m.item).name : 'Monthly keepsake'}`)))));

  app.mount(h('div', { class: 'screen adventures' },
    h('div', { class: 'row' }, h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => app.go('home') }, '←'), h('h1', { style: 'margin:0' }, 'Adventures')),
    ...body));
  if (opts.friday && fridayClaimable(st)) openFriday(app);
}
const LABEL = { dailySnap: 'Daily Snap', mission: 'Mission snap', rareMoment: 'Rare Moment', greatShot: '4,000+ score', journeySnap: 'Journey Snap', training: 'Training', care: 'Care', steps: 'Step milestone', walk: 'Walk milestone', trick: 'Learn a trick' };

function livePetInto(canvas, pet) {
  import('../render/pet.js').then(({ portrait }) => {
    const loop = t => { if (!canvas.isConnected && canvas._started) return; canvas._started = true; portrait(canvas, pet, 'happy', { t: t / 1000 }); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  });
}

function openFriday(app) {
  let r; update(s => { r = claimFriday(s); });
  if (!r) return;
  track('friday_gift_claimed', { gift: r.gift.id });
  sfx.unlock(); haptic('success');
  const pet = get().pet;
  const layer = h('div', { class: 'levelup', onclick: () => { layer.remove(); adventuresScreen(app); } },
    h('div', { class: 'card' },
      h('p', { class: 'tag', style: 'margin:0' }, 'POKA FRIDAY'),
      h('div', { class: 'big', style: 'font-size:54px' }, r.gift.icon),
      livePet(() => pet, () => 'jump', 150),
      h('h2', { style: 'margin:6px 0' }, r.gift.label),
      r.item ? thumb(r.item, 70) : null,
      h('p', { class: 'small' }, [r.coins ? `+${r.coins} coins` : null, r.xp ? `+${r.xp} Bond XP` : null, r.points ? `+${r.points} AP` : null].filter(Boolean).join(' · ')),
      h('button', { class: 'btn block', style: 'margin-top:10px' }, 'YAY!')));
  document.body.append(layer);
}
