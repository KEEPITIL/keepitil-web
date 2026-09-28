/* POST-SNAP — MISSION COMPLETED, the photo, a transparent breakdown, one
   concrete tip to score higher, personal best, and the rewards.
   The snap is filed in My Snaps immediately; SAVE puts it in the phone's
   Photos library, SHARE opens the share sheet. */

import { h, fmt, countUp, toast, coin } from '../ui.js';
import { scoreSnap, rate, grade } from '../game/score.js';
import { SCORE_LABELS, STAR_TEXT } from '../data/progression.js';
import { perkTotals, noteWear } from '../game/build.js';
import { walkPrompt } from '../game/academy.js';
import * as Wd from '../game/world.js';
import { OBJECTS, MILESTONES, CHAPTERS } from '../data/world.js';
import { RARITY_COLOR } from './homeland.js';
import '../data/challenges.js';
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

const ROWS = ['objective', 'pose', 'composition', 'scale', 'timing', 'creative'];

export async function resultScreen(app, { missionId, blob, snapInfo }) {
  const m = snapInfo.daily ? dailyMissionFor(dailyPrompt()) : missionOf(missionId), pet = get().pet;
  const raw = scoreSnap(snapInfo, m);
  const sc = rate(raw, m, { ...snapInfo, itemIds: Object.values(get().pet.equipped || {}), at: Date.now() }, perkTotals(get(), { noGear: m.noGear }).total);
  sc.total = sc.score; sc.grade = grade(sc.score);
  // MASTER SEQUENCES: n qualifying (80+) photos in one session; until then the photo counts as practice (max 79)
  let seq = null;
  if (m.sequence) update(st => {
    const now = Date.now(), q = st.sequence && st.sequence.challenge === m.missionID && now - st.sequence.at < 20 * 60e3 ? st.sequence : { challenge: m.missionID, hits: 0, at: now };
    q.hits = sc.score >= 80 && !sc.missing.length ? q.hits + 1 : 0; q.at = now;
    seq = { hits: q.hits, need: m.sequence };
    if (q.hits >= m.sequence) st.sequence = null; else { st.sequence = q; sc.total = Math.min(sc.total, 79); }
  });
  const tip = sc.tip;
  let rw, daily, badges, memo, sum, rarity = 'common', mem = { journal: [], album: [], collections: [], honors: [], projects: [] };
  const snapId = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const firstEver = get().progress.snaps === 0;
  update(st => {
    rw = applySnap(st, missionId, sc.total);
    if (!snapInfo.daily) st.currentMission = nextMission(st, missionId);
    sum = onSnap(st, { id: snapId, missionId, poseId: snapInfo.poseId, total: sc.total, first: rw.first, daily: !!snapInfo.daily,
      journey: !!snapInfo.journey, rare: snapInfo.rare || null, equippedCount: snapInfo.equippedCount, itemIds: Object.values(st.pet.equipped || {}), box: snapInfo.box, frame: snapInfo.frame });
    remember(st, snapInfo.poseId, st.pet.equipped);
    noteWear(st);
    // 1.4: the photo's three dimensions + the single record that feeds Journal, Life Album, honors, collections, projects
    const subjects = snapInfo.subjects || [st.pet.id || 'p1'];
    const relationType = subjects.length > 1 ? Wd.relation(st, subjects[0], subjects[1]).type : null;
    const object = snapInfo.prop ? Object.keys(OBJECTS).find(k => OBJECTS[k].prop === snapInfo.prop) || null : null;
    rarity = Wd.momentRarity({ rare: snapInfo.rare, subjects, relationType, object, journey: snapInfo.journey, time: Wd.timeOfDay() });
    mem = Wd.recordPhoto(st, { id: snapId, missionId, score: sc.total, stars: m.isDaily ? null : sc.stars, gear: sc.gear, poseId: snapInfo.poseId, prop: snapInfo.prop, propAction: snapInfo.propAction, object,
      filter: snapInfo.filter, subjects, journey: !!snapInfo.journey, rarity, relationType, tag: snapInfo.meal ? 'meal' : null, itemIds: Object.values(st.pet.equipped || {}), seasonal: !!m.availableFrom });
    if (snapInfo.journey) Wd.completeLife(st, 'journey');
    if (m.missionID?.startsWith('combo_')) Wd.count(st, 'combos');
    boost(st, 'snap');
    daily = markDaily(st, 'photo');
    badges = checkBadges(st, { equippedCount: snapInfo.equippedCount });
    memo = memoryLine(st);
  });
  const great = sc.total >= 80;
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
    return { k, v, bar, els: [h('span', { class: 'k' + (tip.part === k ? ' weak' : '') }, SCORE_LABELS[k], h('small', {}, ` /${sc.weights[k]}`)), v, h('div', { class: 'bar' }, bar)] };
  });
  const starRow = h('div', { class: 'stars-row', 'aria-label': `${sc.stars} of 5 stars` }, STAR_TEXT(sc.stars),
    rw.starsGained ? h('small', { class: 'star-gain' }, `+${rw.starsGained}★ · ${rw.starTotal}★ total`) : rw.prevStars >= sc.stars && rw.prevStars ? h('small', {}, ` best ${STAR_TEXT(rw.prevStars)}`) : null);
  const seqCard = seq ? h('div', { class: 'card tipcard' }, h('b', {}, `Sequence ${Math.min(seq.hits, seq.need)} / ${seq.need}`), h('p', {}, seq.hits >= seq.need ? 'Sequence complete — full score counts!' : seq.hits ? 'Great! Keep going — the next photo must also score 80+.' : 'Each photo in the sequence needs 80+. Starting over.')) : null;
  const missing = sc.missing.length ? h('div', { class: 'card warn-card' }, h('b', {}, 'Challenge needs:'), ...sc.missing.map(x => h('p', { class: 'small', style: 'margin:2px 0' }, '• ' + x.text)), h('p', { class: 'small', style: 'margin:4px 0 0' }, 'Scores stay under 50 until every requirement is met.')) : null;
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
        h('p', { class: 'score-total' }, total, h('small', {}, ' / 100')),
        starRow, h('div', { class: 'moment-chip', style: `border-color:${RARITY_COLOR[rarity]};color:${RARITY_COLOR[rarity]}` }, `${rarity === 'legendary' ? '🌟 ' : rarity === 'common' ? '' : '✨ '}${rarity.toUpperCase()} MOMENT`), record)),
    h('div', { class: 'card breakdown' }, ...rows.flatMap(r => r.els),
      sc.gear ? h('span', { class: 'k' }, 'GEAR BONUS', h('small', {}, ' max +5')) : null, sc.gear ? h('span', { class: 'v' }, '+' + sc.gear) : null, sc.gear ? h('div', { class: 'bar' }, h('i', { style: `width:${sc.gear * 20}%` })) : null,
      h('span', { class: 'k total' }, 'TOTAL'), h('span', { class: 'v total' }, fmt(sc.total))),
    seqCard, missing, tipCard,
    h('div', { class: 'card toast-sink', 'data-toast-sink': '', hidden: true, 'aria-live': 'polite' }, h('b', {}, '🎁 Rewards'), h('div', { class: 'sink-list' })),
    (mem.journal.length || mem.album.length || mem.collections.length || mem.honors.length) ? h('div', { class: 'card memories' }, h('b', {}, '📔 Remembered'),
      ...[...new Set(mem.journal.map(j => j.entry.name))].map(n => h('p', { class: 'small' }, `New Journal entry: ${n}`)),
      ...mem.album.slice(0, 3).map(a => h('p', { class: 'small' }, `${Wd.petById(get(), a.petId)?.name}'s Life Album: ${a.name}`)),
      ...mem.collections.map(c => h('p', { class: 'small' }, c.complete ? `🗂️ Collection complete: ${c.collection.name}!` : `🗂️ ${c.collection.name}: ${c.goal.text} ✓`)),
      ...mem.honors.map(x => h('p', { class: 'small' }, `🏅 ${x.honor.name} — ${x.tier.name}`))) : null,
    snapInfo.meal ? h('button', { class: 'btn mint block', onclick: e => { let r; update(x => { r = Wd.completeLife(x, 'eat'); Wd.recordPhoto(x, { id: snapId + '-fed', missionId: 'life:eat', score: sc.total, tag: 'fed', subjects: snapInfo.subjects }); });
      track('life_adventure_completed', { id: 'eat' }); e.currentTarget.disabled = true; e.currentTarget.textContent = `🍪 ${pet.name} loved it!${r.goal ? ' Daily Poka Life goal done!' : ''}`; } }, `🍪 Share a treat with ${pet.name}`) : null, rewards, extras, say,
    h('div', { class: 'actions4' },
      saveBtn, shareBtn,
      h('button', { class: 'btn ghost', onclick: () => app.go('camera', { missionId: m.missionID }) }, '🔁 RETRY'),
      h('button', { class: 'btn', onclick: () => app.go('brief', { missionId: get().currentMission }) }, 'NEXT ➜')),
    h('button', { class: 'linkbtn', onclick: () => app.go('home') }, 'Home')));

  // the reveal
  sfx.score();
  await countUp(total, sc.total, 900, () => sfx.tick());
  for (const r of rows) { r.bar.style.width = (100 * sc.parts[r.k] / (sc.weights[r.k] || 1)) + '%'; countUp(r.v, sc.parts[r.k], 400); await new Promise(res => setTimeout(res, 90)); }
  record.style.visibility = 'visible';
  if (rw.missionBest) { sfx.unlock(); record.classList.add('pop'); }
  for (const el of [tipCard, rewards, extras, say]) el.style.visibility = 'visible';
  haptic('success');
  let delay = 900;
  delay = announce(sum, delay);
  for (const t of rw.track || []) { setTimeout(() => toast(`⭐ STAR TRACK ${t.stars}: ${t.item ? itemOf(t.item)?.name : t.title || ''}${t.coins ? ' +' + t.coins + ' coins' : ''}${t.diamonds ? ' +' + t.diamonds + ' 💎' : ''}`, 2800), delay); delay += 1600; }
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
  // session-aware walk suggestion (optional, never blocks; shared timer with the Academy)
  let walk = null; update(s => { walk = walkPrompt(s); });
  if (walk) setTimeout(() => { track('walk_prompt_shown', { from: 'result' });
    const layer = h('div', { class: 'levelup' }, h('div', { class: 'card' }, h('p', { class: 'tag', style: 'margin:0' }, 'ADVENTURE TIME?'),
      h('p', { style: 'margin:8px 0 12px' }, walk.text.replace(/\{name\}/g, pet.name)),
      h('button', { class: 'btn mint block', onclick: () => { layer.remove(); track('walk_prompt_accepted', {}); app.go('walk'); } }, '🥾 ' + walk.options[0].replace('{NAME}', pet.name.toUpperCase())),
      h('button', { class: 'linkbtn', onclick: () => layer.remove() }, walk.options[1])));
    document.body.append(layer); }, delay + 1200);
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
  const gate = un.gate ? h('div', { class: 'gate-card' }, h('div', { style: 'font-size:44px' }, un.gate.icon), h('b', {}, `NEW: ${un.gate.name}`), h('p', { class: 'small', style: 'margin:4px 0 0' }, un.gate.blurb)) : null;
  const rw2 = un.reward ? h('p', { class: 'small', style: 'margin:6px 0 0' }, `+${un.reward.coins} coins${un.reward.diamonds ? ` · +${un.reward.diamonds} 💎` : ''}`) : null;
  const MS = MILESTONES[rw.levelUp];
  if (MS) {   // MAJOR milestone: chapter complete → new chapter, what changed, what you can do, rewards
    const done = CHAPTERS.find(c => c.to === rw.levelUp), next = CHAPTERS.find(c => c.from === rw.levelUp + 1);
    track('milestone_reached', { level: rw.levelUp });
    const layer = h('div', { class: 'levelup milestone', style: `--mc:${MS.color}`, onclick: e => { if (e.target.closest('button')) layer.remove(); } },
      h('div', { class: 'card milestone-card' },
        h('div', { class: 'ms-rays', 'aria-hidden': 'true' }),
        h('p', { class: 'ms-kicker' }, done ? `CHAPTER ${done.n} COMPLETE · ${done.name.toUpperCase()}` : 'MILESTONE'),
        h('div', { class: 'ms-badge' }, h('span', { class: 'ms-icon' }, MS.icon), h('span', { class: 'ms-level' }, `LEVEL ${rw.levelUp}`)),
        h('h2', { class: 'ms-title' }, MS.headline),
        h('p', { class: 'ms-change' }, MS.change),
        next ? h('p', { class: 'ms-next' }, `Now beginning Chapter ${next.n}: `, h('b', {}, next.name), ` — “${next.feel}”`) : h('p', { class: 'ms-next' }, h('b', {}, 'Mastery begins'), ' — a new rank every 12,000 XP, forever.'),
        h('div', { class: 'ms-can' }, h('b', {}, 'YOU CAN NOW'), ...MS.can.map(c => h('p', {}, '✓ ' + c))),
        h('p', { class: 'ms-world' }, '🌍 ' + MS.world),
        rw2, (items.length || tricks.length) ? h('div', { class: 'row', style: 'justify-content:center;flex-wrap:wrap' }, ...items, ...tricks) : null,
        h('button', { class: 'btn block', style: 'margin-top:12px' }, next ? `START CHAPTER ${next.n}` : 'CONTINUE AS A MASTER')));
    document.body.append(layer);
    return;
  }
  const layer = h('div', { class: 'levelup', onclick: () => layer.remove() },
    h('div', { class: 'card' },
      h('p', { class: 'tag', style: 'margin:0' }, 'LEVEL UP!'),
      h('div', { class: 'big' }, rw.levelUp),
      h('p', { class: 'bubble', style: 'margin:10px 0 14px' }, line(pet.personality, 'level', pet.name)),
      gate, rw2,
      items.length || tricks.length ? h('p', { class: 'small', style: 'margin:0 0 6px' }, 'Unlocked:') : null,
      h('div', { class: 'row', style: 'justify-content:center;flex-wrap:wrap' }, ...items, ...tricks),
      h('button', { class: 'btn block', style: 'margin-top:14px' }, 'YAY!')));
  document.body.append(layer);
}
