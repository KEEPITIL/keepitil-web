/* POST-SNAP — MISSION COMPLETED, the photo, a transparent breakdown, one
   concrete tip to score higher, personal best, and the rewards.
   The snap is filed in My Snaps immediately; SAVE puts it in the phone's
   Photos library, SHARE opens the share sheet. */

import { h, fmt, countUp, toast, coin } from '../ui.js';
import { scoreSnap, explain, MAX, LABELS } from '../game/score.js';
import { applySnap, nextMission, unlocksAt } from '../game/progress.js';
import { mission as missionOf, dailyMissionFor } from '../data/missions.js';
import { dailyPrompt } from '../game/adventure.js';
import { pose as poseOf } from '../data/poses.js';
import { line } from '../data/personality.js';
import { get, update } from '../game/state.js';
import { markDaily, boost, checkBadges, remember, memoryLine } from '../game/companion.js';
import { onSnap } from '../game/adventure.js';
import { item as itemOf } from '../data/items.js';
import * as album from '../game/album.js';
import { saveToPhotos, share, haptic } from '../platform/native.js';
import { track } from '../platform/analytics.js';
import { sfx } from '../platform/sound.js';
import { drawItemThumb } from '../render/items.js';
import * as notify from '../platform/notify.js';

const ROWS = ['pose', 'framing', 'size', 'position', 'mission', 'bonus'];

export async function resultScreen(app, { missionId, blob, snapInfo }) {
  const m = snapInfo.daily ? dailyMissionFor(dailyPrompt()) : missionOf(missionId), pet = get().pet;
  const sc = scoreSnap(snapInfo, m);
  const tip = explain(sc, m, snapInfo, id => poseOf(id).name);
  let rw, daily, badges, memo, sum;
  const snapId = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const firstEver = get().progress.snaps === 0;
  update(st => {
    rw = applySnap(st, missionId, sc.total);
    if (!snapInfo.daily) st.currentMission = nextMission(st, missionId);
    sum = onSnap(st, { id: snapId, missionId, poseId: snapInfo.poseId, total: sc.total, first: rw.first, daily: !!snapInfo.daily,
      journey: !!snapInfo.journey, rare: snapInfo.rare || null, equippedCount: snapInfo.equippedCount, itemIds: Object.values(st.pet.equipped || {}), box: snapInfo.box, frame: snapInfo.frame });
    remember(st, snapInfo.poseId, st.pet.equipped);
    boost(st, 'snap');
    daily = markDaily(st, 'photo');
    badges = checkBadges(st, { equippedCount: snapInfo.equippedCount });
    memo = memoryLine(st);
  });
  const great = sc.total >= 4000;
  const comment = memo || line(pet.personality, rw.missionBest ? 'favpic' : great ? 'great' : 'snap', pet.name);
  const rec = await album.add({ id: snapId, blob, petName: pet.name, missionID: m.missionID, missionTitle: snapInfo.daily ? 'Daily Snap' : m.title, score: sc.total, poseId: snapInfo.poseId, caption: comment, fav: false,
    journey: !!snapInfo.journey, rare: snapInfo.rare?.name || null, daily: !!snapInfo.daily, frameItem: snapInfo.frameItem || null });
  if (firstEver) track('first_snap', {});
  if (rw.first && !snapInfo.daily && Object.keys(get().progress.missions).length === 1) track('first_mission_complete', { mission: m.missionID });
  if (sum.daily?.done && !sum.daily.missed) track('daily_snap_complete', { prompt: sum.daily.prompt.id });
  if (snapInfo.journey) track('journey_snap', {});
  if (snapInfo.rare) track('rare_moment', { moment: snapInfo.rare.id, captured: true });
  const coinTotal = sum.coins.reduce((a, c) => a + c.amount, 0);
  if (coinTotal) track('coins_earned', { amount: coinTotal, source: 'snap' });
  track('score_received', { mission: m.missionID, total: sc.total });
  track('mission_completed', { mission: m.missionID, first: rw.first });
  if (rw.missionBest || rw.personalBest) track('personal_best', { mission: m.missionID, total: sc.total, overall: rw.personalBest });
  if (daily.newly) track('daily_task_completed', { task: 'photo' });

  const img = h('img', { class: 'result-photo', alt: `${pet.name} — ${m.title}`, src: album.urlFor(rec) });
  const total = h('span', {}, '0');
  const rows = ROWS.map(k => {
    const v = h('span', { class: 'v' }, '0'), bar = h('i');
    return { k, v, bar, els: [h('span', { class: 'k' + (tip.part === k ? ' weak' : '') }, LABELS[k]), v, h('div', { class: 'bar' }, bar)] };
  });
  const record = rw.missionBest ? h('div', { class: 'record' }, '🏆 NEW RECORD! ', h('small', {}, `was ${fmt(rw.prevBest)}`))
    : rw.first ? h('div', { class: 'record first' }, '✨ FIRST CLEAR!')
    : h('div', { class: 'record plain' }, `Mission best: ${fmt(get().progress.missions[m.missionID])}`);
  record.style.visibility = 'hidden';
  const rewards = h('div', { class: 'rewards', style: 'visibility:hidden' },
    h('div', { class: 'reward' }, '+', rw.xpGain, ' XP'),
    coinTotal ? h('div', { class: 'reward' }, '+', coinTotal, ' ', coin()) : h('div', { class: 'reward muted' }, 'Replay: XP only'),
    sum.points ? h('div', { class: 'reward' }, '+', sum.points, ' AP') : null);
  const extras = h('div', { class: 'extras', style: 'visibility:hidden' },
    ...sum.coins.map(c => h('span', { class: 'chipline' }, `${c.label} +${c.amount}`)),
    sum.daily && sum.daily.missed && !sum.daily.done ? h('span', { class: 'chipline warn' }, `Daily Snap: ${sum.daily.prompt.text} — try again!`) : null,
    sum.rare ? h('span', { class: 'chipline rare' }, `✨ RARE MOMENT CAPTURED: ${sum.rare.moment.name}`) : null,
    sum.journey ? h('span', { class: 'chipline' }, '🥾 Journey Snap saved to your Adventure Book') : null);
  const tipCard = h('div', { class: 'card tipcard', style: 'visibility:hidden' },
    h('b', {}, tip.part ? 'Want a higher score?' : 'Wow!'), h('p', {}, tip.text.replace(/\{name\}/g, pet.name)));
  const say = h('p', { class: 'bubble', style: 'align-self:center;visibility:hidden' }, comment);

  const saveBtn = h('button', { class: 'btn mint', onclick: async () => {
    const r = await saveToPhotos(blob, `pokasnap-${m.missionID}.jpg`);
    if (r.ok) { toast(r.how === 'download' ? 'Downloaded!' : 'Saved to Photos! 📸'); track('photo_saved', { how: r.how }); haptic('success'); }
    else if (!r.cancelled) toast(r.error?.includes('denied') ? 'Allow Photos access in Settings to save' : 'Could not save — try Share');
  } }, '💾 SAVE');
  const shareBtn = h('button', { class: 'btn sky', onclick: () => share(blob) }, '📤 SHARE');

  app.mount(h('div', { class: 'screen result', style: 'gap:10px' },
    h('div', { class: 'done-banner' }, 'MISSION COMPLETED ✓', h('small', {}, `${m.icon} ${m.title}`)),
    h('div', { class: 'result-top' }, img,
      h('div', { class: 'result-score' },
        h('p', { class: 'score-title' }, sc.grade),
        h('p', { class: 'score-total' }, total, h('small', {}, ' / 5,000')),
        record)),
    h('div', { class: 'card breakdown' }, ...rows.flatMap(r => r.els),
      h('span', { class: 'k total' }, 'TOTAL'), h('span', { class: 'v total' }, fmt(sc.total))),
    tipCard, rewards, extras, say,
    h('div', { class: 'actions4' },
      saveBtn, shareBtn,
      h('button', { class: 'btn ghost', onclick: () => app.go('camera', { missionId: m.missionID }) }, '🔁 RETRY'),
      h('button', { class: 'btn', onclick: () => app.go('brief', { missionId: get().currentMission }) }, 'NEXT ➜')),
    h('button', { class: 'linkbtn', onclick: () => app.go('home') }, 'Home')));

  // the reveal
  sfx.score();
  await countUp(total, sc.total, 900, () => sfx.tick());
  for (const r of rows) { r.bar.style.width = (100 * sc.parts[r.k] / MAX[r.k]) + '%'; countUp(r.v, sc.parts[r.k], 400); await new Promise(res => setTimeout(res, 90)); }
  record.style.visibility = 'visible';
  if (rw.missionBest) { sfx.unlock(); record.classList.add('pop'); }
  for (const el of [tipCard, rewards, extras, say]) el.style.visibility = 'visible';
  haptic('success');
  let delay = 900;
  delay = announce(sum, delay);
  if (daily.bonus) { setTimeout(() => toast(`💞 Daily bond bonus! +${daily.bonus.coins} coins +${daily.bonus.xp} XP`, 2600), delay); delay += 1400; }
  badges.forEach(b => { setTimeout(() => badgeToast(b), delay); delay += 1600; });
  // contextual notification offer: once, after the first Daily Snap -- never on first launch
  if (sum.daily?.done && !sum.daily.missed && !get().notify.asked && notify.supported()) setTimeout(() => {
    const layer = h('div', { class: 'levelup' }, h('div', { class: 'card' },
      h('p', { class: 'tag', style: 'margin:0' }, 'DAILY SNAP DONE!'),
      h('h2', { style: 'margin:8px 0' }, `Want a nudge when tomorrow's Daily Snap is ready?`),
      h('p', { class: 'small' }, 'At most one gentle reminder a day. Change it any time in Settings.'),
      h('button', { class: 'btn block', onclick: async () => { layer.remove(); track('notification_permission_requested', { from: 'daily_snap' }); update(s => { s.notify.asked = true; }); const r = await notify.request(); if (r === 'granted') window.PokaNotifyReschedule?.(); } }, 'YES, REMIND ME'),
      h('button', { class: 'linkbtn', onclick: () => { layer.remove(); update(s => { s.notify.asked = true; }); } }, 'No thanks')));
    document.body.append(layer);
  }, delay + 600);
  const lvl = rw.levelUp || daily.bonus?.levelUp;
  if (lvl) setTimeout(() => levelUpCard({ levelUp: lvl }), delay + 400);
}

/* Shared reward announcer: event milestones, streak / weekly / monthly tracks,
   collections. Emits the analytics for each. Returns the next free delay. */
export function announce(sum, delay = 300) {
  const say = (msg, ms = 2400) => { setTimeout(() => toast(msg, ms), delay); delay += 1500; };
  for (const r of sum.activity || []) {
    if (r.track === 'streak') { track('active_day', { streak: r.day }); if ([3, 7].includes(r.day) || r.day % 7 === 0) track('streak_milestone', { day: r.day }); if (r.coins) say(`🔥 ${r.label} +${r.coins} coins`); }
    if (r.track === 'weekly') { track('weekly_milestone', { days: r.days }); say(`📅 ${r.label}! +${r.coins || 0} coins`); }
    if (r.track === 'monthly') { track('monthly_milestone', { days: r.days }); say(`🗓️ ${r.label}${r.item ? ' — ' + itemOf(r.item)?.name : ''}${r.coins ? ' +' + r.coins + ' coins' : ''}`); }
  }
  if (sum.points) track('event_points_earned', { points: sum.points });
  for (const r of sum.eventRewards || []) {
    if (r.slot === 'headline') track('event_headline_unlocked', { item: r.item || r.dupOf });
    if (r.slot === 'prestige') track('prestige_reward_unlocked', { item: r.item || r.already });
    const what = r.item ? itemOf(r.item)?.name : r.dupOf ? `${itemOf(r.dupOf)?.name} (already yours) +${r.coins} coins` : r.coins ? `+${r.coins} coins` : r.xp ? `+${r.xp} Bond XP` : r.label;
    say(`${r.slot === 'prestige' ? '🏅 PRESTIGE' : '🧭'} ${r.points} AP reached: ${what}`, 2800);
  }
  for (const c of sum.collections || []) {
    if (c.goal) say(`🍂 Collection: ${c.goal} ✓`);
    if (c.partial) say(`🍂 Collection half done! ${c.item ? itemOf(c.item)?.name : ''} +${c.coins} coins`);
    if (c.full) say(`🍂 Collection complete! ${c.item ? itemOf(c.item)?.name : ''}`);
  }
  return delay;
}

export function badgeToast(b) {
  track('achievement_unlocked', { id: b.id });
  toast(`${b.icon} Badge: ${b.name}! +${b.coins} coins${b.item ? ' + a new accessory' : ''}`, 2600);
  sfx.unlock();
}

export function levelUpCard(rw) {
  sfx.level(); haptic('success');
  track('level_up', { level: rw.levelUp });
  const un = unlocksAt(rw.levelUp), pet = get().pet;
  const items = un.items.map(it => { const c = h('canvas', { width: 120, height: 120, style: 'width:60px;height:60px' }); drawItemThumb(c, it.itemID); return h('div', { class: 'unl' }, c, it.name); });
  const tricks = un.tricks.map(s => h('div', { class: 'unl' }, h('div', { style: 'font-size:38px' }, s.icon), `Train ${s.name}`));
  const layer = h('div', { class: 'levelup', onclick: () => layer.remove() },
    h('div', { class: 'card' },
      h('p', { class: 'tag', style: 'margin:0' }, 'LEVEL UP!'),
      h('div', { class: 'big' }, rw.levelUp),
      h('p', { class: 'bubble', style: 'margin:10px 0 14px' }, line(pet.personality, 'level', pet.name)),
      items.length || tricks.length ? h('p', { class: 'small', style: 'margin:0 0 6px' }, 'Unlocked:') : null,
      h('div', { class: 'row', style: 'justify-content:center;flex-wrap:wrap' }, ...items, ...tricks),
      h('button', { class: 'btn block', style: 'margin-top:14px' }, 'YAY!')));
  document.body.append(layer);
}
