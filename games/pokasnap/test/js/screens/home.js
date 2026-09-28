/* HOME — the pet dominates. Name, mood, level, today's card, one big PLAY.
   Secondary doors: My Snaps · Closet · Train · Care.
   The pet idles through cheap canned behaviours (blink, tilt, bounce, sit,
   yawn, stretch...) weighted by personality, dances when music plays, and
   answers tap / double-tap / long-press. */

import { h, fmt, coin, sheet, pokeGestures, moodChip, toast, plural } from '../ui.js';
import { livePet } from './flow.js';
import { get, update } from '../game/state.js';
import { levelProgress, MAX_LEVEL, poseAvailable, totalStars } from '../game/progress.js';
import { GATES } from '../data/progression.js';
import { chapterFor, MILESTONES, CHAPTERS } from '../data/world.js';
import { nextGateInfo } from '../game/chapters.js';
import { levelFor } from '../game/progress.js';
import * as W from '../game/world.js';
import { mission as missionOf, activeMissions, category } from '../data/missions.js';
import { line, personality, reaction } from '../data/personality.js';
import { POSES, POSE_ORDER, pose as poseOf } from '../data/poses.js';
import { species as speciesOf } from '../data/pets.js';
import { moodFor, dailyView, dailyMission, DAILY_TASKS, DAILY_BONUS, boost } from '../game/companion.js';
import { sfx, music } from '../platform/sound.js';
import { haptic } from '../platform/native.js';
import { track } from '../platform/analytics.js';
import { ladderView } from '../game/events.js';
import { view as activityView } from '../game/activity.js';
import { dailyPrompt, dailyDone, fridayClaimable } from '../game/adventure.js';
import { ensure as walkState, journeyReady } from '../game/walk.js';
import { plusSubscribed } from '../game/entitlements.js';

/* Pose logic shared by every screen that shows a living pet. */
export function petBrain(getPose, setPose, kick) {
  const st = get(), pet = st.pet, pers = personality(pet.personality);
  const can = id => POSES[id] && (POSES[id].reaction || poseAvailable(get(), id));
  let tapN = 0, dblN = 0, hold = 0, idleN = 0;
  const act = (p, ms = 2400) => { setPose(p); hold = performance.now() + ms; };
  return {
    tap() {
      const p = reaction(pet.personality, 'tap', can, tapN++); act(p); kick();
      sfx.poke(); sfx.pet(speciesOf(pet.species).animal); haptic('light');
      track('pet_poked', { pose: p, gesture: 'tap' });
      return line(pet.personality, 'poke', pet.name);
    },
    double() {
      const p = reaction(pet.personality, 'double', can, dblN++); act(p, 3000); kick();
      sfx.pose(); haptic('medium'); track('pet_poked', { pose: p, gesture: 'double' });
      return line(pet.personality, 'double', pet.name);
    },
    strike(p, ms = 3200) { act(p, ms); kick(); },
    /* Called every frame; picks the next idle behaviour when free. */
    tick(now, dancing) {
      if (now < hold) return;
      if (dancing && can('dance') && Math.random() < 0.5) return act('dance', 2600);
      if (getPose() !== 'idle') { setPose('idle'); hold = now + 2200 + Math.random() * 2600; return; }
      const list = pers.idle.filter(can);
      act(list[(idleN++ * 7 + Math.floor(Math.random() * 3)) % list.length], 1600 + Math.random() * 900);
      if (Math.random() < 0.4) kick(0.5);
    },
  };
}

export function homeScreen(app, opts = {}) {
  const st = get(), pet = st.pet, lp = levelProgress(st.progress.xp);
  const nextGate = GATES.find(g => g.level > lp.level);
  const mood = moodFor(st), daily = dailyView(st);
  let pose = 'idle', squash = 0;
  const kick = (k = 1) => { squash = k; };
  const brain = petBrain(() => pose, p => { pose = p; }, kick);

  // unwell pets say how they feel -- gentle and factual, never a threat
  const CARE_LINE = { lonely: `I missed you. Can we hang out?`, stressed: `Something feels off… maybe a walk?`, snappy: `Hmph. Not now…`,
    withdrawn: `…`, critical: `I feel really weak. Can you stay with me?` };
  const careNow = W.careState(st, pet.id).id;
  const bubble = h('p', { class: 'bubble home-bubble' }, opts.say || CARE_LINE[careNow] || line(pet.personality, 'greet', pet.name));
  // the hero + up to two companions must fit the screen width (1.5: companions were clipped at L30+)
  const nComp = Math.max(0, W.activePets(st).length - 1), avail = Math.min(window.innerWidth, 520) - 24;
  const size = Math.round(Math.max(180, Math.min(300, window.innerWidth * 0.72, window.innerHeight - 560, avail / (1 + 0.55 * nComp * 0.82))));
  const hero = livePet(() => get().pet, () => pose, size, {
    squash: () => (squash *= 0.86) > 0.02 ? Math.sin(squash * Math.PI) * squash : 0,
    tick: now => brain.tick(now, music.playing()),
    mood: p => p ? W.careState(get(), p.id).id : 'healthy',
  });
  hero.setAttribute('aria-label', `${pet.name}. Tap to poke, double-tap for a trick, hold for poses.`);
  hero.setAttribute('role', 'button');
  pokeGestures(hero, {
    onTap: () => { bubble.textContent = brain.tap(); },
    onDouble: () => { bubble.textContent = brain.double(); },
    onLong: () => { haptic('medium'); poseWheel(p => { brain.strike(p); bubble.textContent = `${poseOf(p).icon} ${poseOf(p).name}!`; }); },
  });

  const dm = dailyMission(activeMissions());
  const doneN = DAILY_TASKS.filter(t => daily.done[t.id]).length;
  const next = missionOf(st.currentMission);

  const dailyCard = h('div', { class: 'daily card' },
    h('div', { class: 'row between' },
      h('b', {}, `TODAY WITH ${pet.name.toUpperCase()}`),
      h('span', { class: 'small' }, daily.bonus ? 'Bond bonus earned! 💞' : [`${doneN}/4 · bonus +${DAILY_BONUS.coins} `, coin()])),
    h('div', { class: 'daily-tasks' }, ...DAILY_TASKS.map(t => h('button', {
      class: 'dtask' + (daily.done[t.id] ? ' done' : ''),
      'aria-label': t.name.replace('{name}', pet.name) + (daily.done[t.id] ? ' — done' : ''),
      onclick: () => { sfx.tap(); t.id === 'photo' ? app.go('camera', { missionId: 'daily_snap', daily: true }) : app.go({ feed: 'care', train: 'train', outfit: 'closet' }[t.id]); },
    }, h('span', { class: 'ic' }, daily.done[t.id] ? '✅' : t.icon), t.name.replace('{name}', pet.name)))),
    h('button', { class: 'daily-challenge', onclick: () => app.go('camera', { missionId: 'daily_snap', daily: true }) },
      h('span', {}, dailyDone(st) ? `☀️ Daily Snap done ✓ — ${dailyPrompt().text}` : `☀️ Daily Snap: ${dailyPrompt().icon} ${dailyPrompt().text}`), h('span', {}, '›')),
    null);

  const lv = ladderView(st), act = activityView(st), wk = walkState(st);
  const strip = h('div', { class: 'adv-strip' },
    lv ? h('button', { class: 'chipbtn', onclick: () => app.go('adventures'), 'aria-label': `${lv.event.name}: ${lv.points} of ${lv.max} Adventure Points` },
      h('span', {}, lv.event.icon), h('b', {}, lv.event.name), h('span', { class: 'mini-meter' }, h('i', { style: `width:${Math.min(100, 100 * lv.points / lv.max)}%` })), h('small', {}, `${lv.points}/${lv.max}`)) : null,
    h('button', { class: 'chipbtn', onclick: () => app.go('walk'), 'aria-label': `Walk with ${pet.name}` },
      h('span', {}, journeyReady(st) ? '🥾' : '🐾'), h('b', {}, journeyReady(st) ? 'Journey ready!' : wk.session ? 'Walking…' : 'Walk'), wk.steps ? h('small', {}, `${fmt(wk.steps)}`) : null),
    fridayClaimable(st) ? h('button', { class: 'chipbtn gift', onclick: () => app.go('adventures', { friday: true }) }, h('span', {}, '🎁'), h('b', {}, 'Poka Friday!')) : null);
  const protect = st.account.mode === 'guest' && st.progress.snaps >= 3 && !st.hints.protect
    ? h('div', { class: 'card nudge' },
        h('b', {}, `Protect ${pet.name} across devices`),
        h('p', { class: 'small', style: 'margin:4px 0 10px' }, 'Save your pet, progress and badges to a free account. Photos stay on this phone.'),
        h('div', { class: 'row' },
          h('button', { class: 'btn sky grow', style: 'min-height:44px;font-size:15px', onclick: () => app.go('email') }, 'Save my pet'),
          h('button', { class: 'linkbtn', onclick: e => { update(s => { s.hints.protect = Date.now(); }); e.target.closest('.nudge').remove(); } }, 'Not now')))
    : null;

  app.mount(h('div', { class: `screen home bg-dots ch-${chapterFor(lp.level).n}` },
    h('div', { class: 'topbar' },
      h('button', { class: 'pill', 'aria-label': `${st.progress.coins} Poka Coins. Open the store`, onclick: () => app.go('store') }, coin(), fmt(st.progress.coins), h('span', { class: 'plus-mini' }, '+')),
      act.streak > 1 ? h('button', { class: 'pill', 'aria-label': `${act.streak} day streak. Open adventures`, onclick: () => app.go('adventures') }, '🔥 ', act.streak) : null,
      h('button', { class: 'pill', 'aria-label': `${st.progress.diamonds || 0} Poka Diamonds. Open the store`, onclick: () => app.go('store', { tab: 'Diamonds' }) }, '💎 ', fmt(st.progress.diamonds || 0)),
      h('button', { class: 'pill', 'aria-label': `${plural(totalStars(st), 'star')}. Open the Star Track`, onclick: () => app.go('stars') }, '⭐ ', totalStars(st)),
      plusSubscribed(st) ? h('div', { class: 'pill plus-pill', 'aria-label': 'PokaSnap+ member' }, '🌟') : null,
      h('div', { class: 'grow' }),
      h('button', { class: 'icon-btn', 'aria-label': 'Settings', onclick: () => app.go('settings') }, '⚙️')),
    h('div', { class: 'home-head' },
      h('h1', {}, pet.name),
      h('div', { class: 'row', style: 'justify-content:center;gap:8px' }, moodChip(mood), h('span', { class: 'lvl' }, lp.mastery ? `Level 100 · Mastery ${lp.mastery}` : `Level ${lp.level}`)),
      h('div', { class: 'xp', role: 'progressbar', 'aria-label': 'Experience', 'aria-valuenow': Math.round(lp.pct * 100) }, h('i', { style: `width:${Math.round(lp.pct * 100)}%` })),
      h('p', { class: 'small', style: 'margin:3px 0 0' }, `${fmt(lp.into)} / ${fmt(lp.need)} XP`, nextGate ? ` · ${nextGate.icon} ${nextGate.name} at L${nextGate.level}` : '')),
    bubble, (() => { const comp = W.activePets(st).filter(p => p.id !== st.pet.id);
      return comp.length ? h('div', { class: 'hero-pack' }, livePet(() => comp[0], () => 'sit', Math.round(size * 0.55), { mood: p => W.careState(get(), p.id).id }), hero, comp[1] ? livePet(() => comp[1], () => 'wave', Math.round(size * 0.55), { mood: p => W.careState(get(), p.id).id }) : h('span')) : hero; })(),
    // milestone shelf: grows one badge per 10-level milestone reached -> Home visibly evolves L1 → L100
    (() => { const got = Object.keys(MILESTONES).map(Number).filter(L => lp.level >= L);
      return got.length ? h('div', { class: 'ms-shelf', 'aria-label': `${got.length} of 10 milestones reached` }, ...got.map(L => h('span', { class: 'ms-chip', style: `--mc:${MILESTONES[L].color}`, title: `L${L} ${MILESTONES[L].headline}` }, MILESTONES[L].icon)),
        ...Array.from({ length: 10 - got.length }, () => h('span', { class: 'ms-chip ms-todo' }))) : null; })(),
    (() => { const ch = chapterFor(lp.level), next = ch.milestone.level > lp.level ? ch.milestone : null, rec = recommend(st);
      return h('div', { class: 'card chapter-card' },
        h('button', { class: 'chapter-head', onclick: () => app.go('chapters') },
          h('span', { class: 'tiny' }, `CHAPTER ${ch.n} · LEVELS ${ch.from}–${ch.to}`), h('b', {}, ch.name),
          h('span', { class: 'small' }, next ? `Working toward level ${next.level}: ${next.name}` : lp.mastery ? `Mastery rank ${lp.mastery} — keep adding to your history` : `Milestone reached: ${ch.milestone.name}`)),
        h('button', { class: 'continue-cta', onclick: () => { track('continue_tapped', { rec: rec.text }); app.go(...rec.go); } },
          h('span', { class: 'cc-icon' }, rec.icon), h('span', { class: 'cc-text' }, h('small', {}, 'CONTINUE ADVENTURE'), h('b', {}, rec.text), h('small', { class: 'cc-why' }, rec.why)), h('span', {}, '›'))); })(),
    h('div', { class: 'stack home-bottom' },
      h('button', { class: 'btn block big', onclick: () => { sfx.tap(); track('play_now_tapped', { from: 'home' }); app.go('brief', { missionId: st.currentMission }); } }, '📸 PLAY'),
      h('button', { class: 'linkbtn next-link', onclick: () => app.go('missions') }, `Next: ${next.icon} ${next.title} · All missions ›`),
      strip,
      dailyCard,
      h('div', { class: 'nav4 world-nav' },
        h('button', { onclick: () => app.go('homeland') }, h('span', {}, '🏡'), 'HOMELAND'),
        h('button', { onclick: () => app.go('journal') }, h('span', {}, '📔'), 'JOURNAL'),
        h('button', { onclick: () => app.go('life') }, h('span', {}, '🌿'), 'POKA LIFE'),
        h('button', { onclick: () => app.go('pack') }, h('span', {}, '🐾'), 'PACK')),
      h('div', { class: 'row home-links' },
        h('button', { class: 'linkbtn', onclick: () => app.go('chapters') }, `📜 Chapter ${chapterFor(lp.level).n}: ${chapterFor(lp.level).name}`),
        h('button', { class: 'linkbtn', onclick: () => app.go('lookback') }, '🗓️ Lookback'),
        lp.level >= 70 ? h('button', { class: 'linkbtn', onclick: () => app.go('league') }, '🏆 League') : null),
      careBanner(app, st),
      h('div', { class: 'nav4' },
        h('button', { onclick: () => app.go('snaps') }, h('span', {}, '📔'), 'MY SNAPS'),
        h('button', { onclick: () => app.go('closet') }, h('span', {}, '👒'), 'CLOSET'),
        h('button', { onclick: () => app.go('academy') }, h('span', {}, '🎓'), 'ACADEMY'),
        h('button', { onclick: () => app.go('music', { from: 'home' }) }, h('span', {}, '🎧'), 'MUSIC'),
        h('button', { onclick: () => app.go('care') }, h('span', {}, '🍽️'), 'CARE'),
        h('button', { onclick: () => app.go('friends', { from: 'home' }) }, h('span', {}, '🤝'), 'FRIENDS')),
      protect)));

  if (opts.welcome) welcomeBack(opts.welcome);
}

/* 1.5: ONE contextual next step, so Home always answers "what can I do right now?" */
export function recommend(st) {
  const pet = st.pet, L = st.progress.level || 1;
  const unwell = W.activePets(st).find(p => !['healthy', 'memorial'].includes(W.careState(st, p.id).id));
  const FEELS = { lonely: 'is feeling lonely', stressed: 'is feeling stressed', snappy: 'is feeling snappy', withdrawn: 'has gone quiet', critical: 'really needs you now' };
  if (unwell) return { icon: '💞', text: `Spend time with ${unwell.name}`, why: `${unwell.name} ${FEELS[W.careState(st, unwell.id).id] || 'needs a little care'}`, go: ['care'] };
  const gate = nextGateInfo(st, levelFor(st.progress.xp));
  if (gate) return { icon: '🎓', text: `Prepare for ${gate.name}`, why: 'Your XP is ready — earn the certification to level up', go: ['chapters'] };
  if (journeyReady(st)) return { icon: '🥾', text: 'Take your Journey Snap', why: 'Your walk earned a special photo', go: ['walk'] };
  if (!dailyDone(st)) return { icon: '☀️', text: `Today's Daily Snap: ${dailyPrompt().text}`, why: 'Once a day, extra rewards', go: ['camera', { missionId: 'daily_snap', daily: true }] };
  const proj = L >= 30 ? W.activeProject(st) : null;
  if (proj) return { icon: '🏗️', text: `Help the ${proj.name}`, why: 'Community Project — changes the Homeland', go: ['community'] };
  if (L >= 30) return { icon: '✨', text: 'Catch a Rare Moment in the Homeland', why: 'Your pets are up to something', go: ['homeland'] };
  return { icon: '🎓', text: 'Continue training', why: 'Learn a new trick for your photos', go: ['academy'] };
}

/* Returning after a break: celebrate, never guilt-trip. */
function welcomeBack(w) {
  const st = get(), pet = st.pet;
  const layer = h('div', { class: 'levelup', onclick: () => layer.remove() },
    h('div', { class: 'card' },
      h('p', { class: 'tag', style: 'margin:0' }, 'WELCOME BACK!'),
      livePet(() => pet, () => 'happy', 170),
      h('p', { class: 'bubble', style: 'margin:6px 0 12px' }, line(pet.personality, 'welcome', pet.name)),
      w.gift ? h('div', { class: 'reward', style: 'display:inline-block' }, '+', w.gift, ' ', coin(), ' welcome gift') : null,
      (() => { const lv = ladderView(st); return lv ? h('p', { class: 'small', style: 'margin:10px 0 0' }, `${lv.event.icon} ${lv.event.name}: ${lv.points}/${lv.max} AP · ${lv.event.daysLeft} day${lv.event.daysLeft === 1 ? '' : 's'} left — plenty of time to catch up.`) : null; })(),
      h('p', { class: 'small', style: 'margin:6px 0 0' }, dailyDone(st) ? 'Next: pick any mission and snap away.' : `Next: today's Daily Snap — ${dailyPrompt().text}.`),
      h('button', { class: 'btn block', style: 'margin-top:14px' }, 'HI ' + pet.name.toUpperCase() + '! 👋')));
  document.body.append(layer);
  sfx.reward(); haptic('success');
}

/* Long-press: every pose the pet knows, one tap to strike it. */
export function poseWheel(pick) {
  const st = get();
  const s = sheet(h('h2', {}, 'Strike a pose'),
    h('div', { class: 'poses' }, ...POSE_ORDER.filter(id => poseAvailable(st, id)).map(id => h('button', {
      class: 'pose', onclick: () => { sfx.pose(); pick(id); s.close(); } }, h('span', { class: 'e' }, POSES[id].icon), POSES[id].name))),
    h('p', { class: 'small', style: 'margin:12px 0 0;text-align:center' }, 'Learn more tricks in 🎓 Train.'));
}

/* Mission briefing: TITLE · TASK · RECOMMENDED POSE · REWARD · TIP. */
export function briefScreen(app, { missionId }) {
  const st = get(), pet = st.pet, m = missionOf(missionId);
  const rp = poseOf(m.recommendedPose), has = m.anySkill || poseAvailable(st, m.recommendedPose);
  const best = st.progress.missions[m.missionID];
  const cat = category(m.category);
  app.mount(h('div', { class: 'screen center bg-dots brief' },
    h('p', { class: 'tag', style: 'margin:0' }, `${cat.icon} ${cat.name.toUpperCase()} MISSION`),
    h('div', { class: 'brief-ic' }, m.icon),
    h('h1', {}, m.title),
    h('p', { class: 'sub', style: 'max-width:340px;margin-bottom:6px' }, m.instruction),
    livePet(() => pet, () => (has && !m.anySkill ? m.recommendedPose : 'happy'), Math.min(200, window.innerHeight * 0.24)),
    h('div', { class: 'card brief-card' },
      h('div', { class: 'brow' }, h('span', { class: 'k' }, 'POSE'),
        h('span', {}, m.anySkill ? '🎓 Any trained trick' : `${rp.icon} ${rp.name}`, has ? '' : h('span', { class: 'need' }, ' · learn it in Train'))),
      h('div', { class: 'brow' }, h('span', { class: 'k' }, 'REWARD'),
        h('span', {}, `⭐ ${m.XPReward} XP  `, coin(), ` ${m.coinReward}`)),
      best ? h('div', { class: 'brow' }, h('span', { class: 'k' }, 'YOUR BEST'), h('span', {}, `🏆 ${fmt(best)}`)) : null,
      h('div', { class: 'tip' }, '💡 ', m.tip)),
    h('div', { class: 'stack', style: 'width:100%;max-width:360px;margin-top:14px' },
      h('button', { class: 'btn block big', onclick: () => app.go('camera', { missionId }) }, '📷 OPEN CAMERA'),
      has ? null : h('button', { class: 'btn ghost block', onclick: () => app.go('train') }, `🎓 Teach ${pet.name} ${rp.name}`),
      h('div', { class: 'row', style: 'justify-content:center' },
        h('button', { class: 'linkbtn', onclick: () => app.go('missions') }, 'Other missions'),
        h('button', { class: 'linkbtn', onclick: () => app.go('home') }, 'Home')))));
}

/* A pet needing care gets one calm, factual line on Home — never a threat. */
function careBanner(app, st) {
  W.ensure(st);
  const need = W.pets(st).map(p => ({ p, s: W.careState(st, p.id) })).filter(x => !x.p.memorial && x.s.id !== 'healthy').sort((a, b) => (b.s.days || 0) - (a.s.days || 0))[0];
  if (!need) return null;
  return h('button', { class: 'card care-banner care-' + need.s.id, onclick: () => app.go('care') },
    h('b', {}, `${need.p.name} is feeling ${need.s.name.toLowerCase()}`), h('span', { class: 'small' }, need.s.recovering ? ` · recovering ${need.s.recovering}/6 — keep going` : ' · a meal, play or walk will help'));
}
