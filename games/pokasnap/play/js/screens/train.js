/* TRAIN — PLAY -> TRAIN -> UNLOCK POSE -> USE IN PHOTO.
   Pick a trick, play one short microgame (a rep), and after REPS reps the
   trick is learned and becomes a camera pose. You can't fail a rep: a low
   score just pays fewer coins. Two microgames, same canvas pet renderer, no
   separate engine. */

import { h, coin, fmt, sheet, toast } from '../ui.js';
import { livePet } from './flow.js';
import { get, update } from '../game/state.js';
import { SKILLS, REPS, skill as skillOf } from '../data/skills.js';
import { MISSIONS } from '../data/missions.js';
import { pose as poseOf } from '../data/poses.js';
import { line } from '../data/personality.js';
import { species as speciesOf } from '../data/pets.js';
import { canTrain, practice, learned, grantXP } from '../game/progress.js';
import { markDaily, boost, checkBadges } from '../game/companion.js';
import { drawPet } from '../render/pet.js';
import { sfx } from '../platform/sound.js';
import { haptic } from '../platform/native.js';
import { track } from '../platform/analytics.js';
import { levelUpCard, badgeToast } from './result.js';

const GAMES = {
  catch:  { id: 'catch',  name: 'Treat Catch',     icon: '🦴', blurb: 'Slide to catch falling treats.' },
  follow: { id: 'follow', name: 'Follow the Poke', icon: '👆', blurb: 'Watch the moves, then copy them.' },
};
const dur = () => (window.POKA_FAST ? 4 : 30);   // test hook shortens games

export function trainScreen(app) {
  const st = get(), pet = st.pet, known = learned(st);
  const list = h('div', { class: 'skills' }, ...SKILLS.map(s => {
    const has = known.includes(s.id), reps = st.skills.practice[s.id] || 0, can = canTrain(st, s.id);
    const locked = !has && !can;
    return h('button', {
      class: 'skill' + (has ? ' has' : '') + (locked ? ' locked' : ''),
      onclick: () => {
        if (has) { toast(`${pet.name} knows ${s.name}! Use it with 🎭 POSE in the camera.`); return; }
        if (locked) { toast(`Train ${s.name} at level ${s.level}`); return; }
        chooseGame(app, s);
      },
    },
      h('span', { class: 'e' }, locked ? '🔒' : s.icon),
      h('b', {}, s.name),
      has ? h('span', { class: 'ok' }, s.starter ? 'Knows it' : '✓ LEARNED')
        : locked ? h('span', { class: 'lk' }, `LEVEL ${s.level}`)
        : h('span', { class: 'dots', 'aria-label': `${reps} of ${REPS} practice` }, ...Array.from({ length: REPS }, (_, i) => h('i', { class: i < reps ? 'on' : '' }))));
  }));
  app.mount(h('div', { class: 'screen train' },
    h('div', { class: 'row' }, h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => app.go('home') }, '←'), h('h1', { style: 'margin:0' }, 'Train')),
    h('div', { class: 'row train-intro' }, livePet(() => pet, () => 'wave', 96),
      h('p', { class: 'sub', style: 'margin:0' }, `Teach ${pet.name} tricks. Every trick learned becomes a new pose in the camera. ${REPS} practices each.`)),
    list));
}

function chooseGame(app, s) {
  const sh = sheet(h('h2', {}, `Teach ${get().pet.name} ${s.icon} ${s.name}`),
    h('p', { class: 'small', style: 'margin:0 0 12px' }, s.blurb + ' Pick a practice game:'),
    h('div', { class: 'stack' }, ...Object.values(GAMES).map(g => h('button', { class: 'choice game-choice', onclick: () => { sh.close(); app.go('game', { skillId: s.id, game: g.id }); } },
      h('span', { class: 'emoji' }, g.icon), h('div', {}, h('b', {}, g.name), h('span', {}, g.blurb))))));
}

/* ------------------------------------------------------------ microgames -- */
export function gameScreen(app, { skillId, game }) {
  const s = skillOf(skillId);
  track('training_started', { skill: skillId, game });
  const done = stats => finish(app, s, game, stats);
  return game === 'follow' ? followGame(app, s, done) : catchGame(app, s, done);
}

function finish(app, s, game, stats) {
  const coins = game === 'catch' ? Math.min(20, 5 + stats.caught) : Math.max(6, 14 - stats.mistakes * 2);
  let r, lv, daily, badges;
  update(st => {
    r = practice(st, s.id); lv = grantXP(st, 10, coins);
    daily = markDaily(st, 'train'); boost(st, 'train'); badges = checkBadges(st);
  });
  if (daily.newly) track('daily_task_completed', { task: 'train' });
  badges.forEach(badgeToast);
  if (r.learnedNow) { track('skill_learned', { skill: s.id }); app.go('learned', { skillId: s.id, coins }); }
  else {
    const pet = get().pet;
    app.mount(h('div', { class: 'screen center bg-dots' },
      h('p', { class: 'tag' }, 'PRACTICE COMPLETE'),
      livePet(() => pet, () => 'happy', 200),
      h('h1', {}, `${s.icon} ${s.name} ${r.reps}/${REPS}`),
      h('div', { class: 'dots big', style: 'justify-content:center' }, ...Array.from({ length: REPS }, (_, i) => h('i', { class: i < r.reps ? 'on' : '' }))),
      h('p', { class: 'bubble', style: 'margin:14px 0' }, line(pet.personality, 'train', pet.name)),
      h('div', { class: 'rewards' }, h('div', { class: 'reward' }, '+10 XP'), h('div', { class: 'reward' }, '+', coins, ' ', coin())),
      h('div', { class: 'stack', style: 'width:100%;max-width:360px;margin-top:16px' },
        h('button', { class: 'btn block big', onclick: () => app.go('game', { skillId: s.id, game }) }, 'PRACTICE AGAIN'),
        h('button', { class: 'linkbtn', onclick: () => app.go('train') }, 'Back to Train'))));
    sfx.reward();
  }
  if (daily.bonus) setTimeout(() => toast(`💞 Daily bond bonus! +${daily.bonus.coins} coins`), 600);
  if (lv.levelUp) setTimeout(() => levelUpCard(lv), 1200);
}

/* The payoff moment: a new trick = a new pose for photos. */
export function learnedScreen(app, { skillId }) {
  const s = skillOf(skillId), pet = get().pet;
  const m = MISSIONS.find(x => x.recommendedPose === s.pose && !x.anySkill) || MISSIONS.find(x => x.anySkill);
  sfx.level(); haptic('success');
  app.mount(h('div', { class: 'screen center bg-dots' },
    h('p', { class: 'tag', style: 'color:var(--pink)' }, 'NEW SKILL LEARNED!'),
    livePet(() => pet, () => s.pose, 240),
    h('h1', {}, `${pet.name} learned ${s.name.toUpperCase()}!`),
    h('p', { class: 'sub' }, `${poseOf(s.pose).icon} ${poseOf(s.pose).name} is now a pose in your camera.`),
    h('p', { class: 'bubble', style: 'margin-bottom:16px' }, line(pet.personality, 'learned', pet.name)),
    h('div', { class: 'stack', style: 'width:100%;max-width:360px' },
      h('button', { class: 'btn block big', onclick: () => app.go('brief', { missionId: m.missionID }) }, '📸 USE IT IN A PHOTO'),
      h('button', { class: 'linkbtn', onclick: () => app.go('train') }, 'Keep training'))));
}

/* A small shared stage: canvas + HUD, pet drawn with the real renderer. */
function stage(app, s, title, hud) {
  const cv = h('canvas', { class: 'game-canvas' });
  const quit = h('button', { class: 'icon-btn', 'aria-label': 'Stop practice', onclick: () => app.go('train') }, '✕');
  app.mount(h('div', { class: 'screen game' },
    h('div', { class: 'row between' }, quit, h('b', { class: 'game-title' }, `${s.icon} ${title}`), hud),
    cv));
  const fit = () => { const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); cv.width = r.width * d; cv.height = r.height * d; return { W: r.width, H: r.height, d }; };
  return { cv, fit };
}

/* A. TREAT CATCH -------------------------------------------------------- */
function catchGame(app, s, done) {
  const pet = get().pet;
  const score = h('div', { class: 'pill' }, '🦴 ', h('span', {}, '0'));
  const timeEl = h('div', { class: 'pill' }, '⏱ ', h('span', {}, String(dur())));
  const hud = h('div', { class: 'row', style: 'gap:6px' }, score, timeEl);
  const { cv, fit } = stage(app, s, 'Treat Catch', hud);
  let dim = fit(), x = dim.W / 2, targetX = x, treats = [], caught = 0, t0 = performance.now(), last = t0, spawn = 0, pose = 'look', poseUntil = 0, over = false;
  const move = e => { const r = cv.getBoundingClientRect(); targetX = Math.max(30, Math.min(r.width - 30, e.clientX - r.left)); };
  cv.addEventListener('pointerdown', move); cv.addEventListener('pointermove', e => { if (e.buttons || e.pointerType === 'touch') move(e); });
  const onResize = () => { dim = fit(); }; window.addEventListener('resize', onResize);
  const petScale = () => Math.min(dim.W, dim.H) / 900;
  function frame(now) {
    if (!cv.isConnected) { window.removeEventListener('resize', onResize); return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const left = Math.max(0, dur() - (now - t0) / 1000);
    timeEl.lastChild.textContent = Math.ceil(left);
    x += (targetX - x) * Math.min(1, dt * 12);
    spawn -= dt;
    if (spawn <= 0 && left > 0.6) { spawn = 0.55 + Math.random() * 0.35; treats.push({ x: 24 + Math.random() * (dim.W - 48), y: -20, v: 150 + (dur() - left) * 6 + Math.random() * 60, gold: Math.random() < 0.12 }); }
    const k = petScale(), mouthY = dim.H - 300 * k, reach = 150 * k;
    for (const tr of treats) {
      tr.y += tr.v * dt;
      if (!tr.hit && tr.y > mouthY - 20 && tr.y < mouthY + 40 && Math.abs(tr.x - x) < reach) {
        tr.hit = true; caught += tr.gold ? 3 : 1; score.lastChild.textContent = caught;
        sfx.catch(); haptic('light'); pose = tr.gold ? 'jump' : 'happy'; poseUntil = now + 500;
      }
    }
    treats = treats.filter(t => !t.hit && t.y < dim.H + 30);
    if (now > poseUntil) pose = 'look';
    const ctx = cv.getContext('2d'); ctx.setTransform(dim.d, 0, 0, dim.d, 0, 0); ctx.clearRect(0, 0, dim.W, dim.H);
    ctx.font = '34px system-ui'; ctx.textAlign = 'center';
    for (const tr of treats) ctx.fillText(tr.gold ? '⭐' : '🦴', tr.x, tr.y);
    ctx.save(); ctx.translate(x, dim.H - 12); ctx.scale(k, k); drawPet(ctx, pet, pose, { t: now / 1000 }); ctx.restore();
    if (left <= 0 && !over) { over = true; setTimeout(() => done({ caught }), 400); return; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* B. FOLLOW THE POKE ----------------------------------------------------- */
const PADS = [
  { id: 'left',  icon: '⬅️', label: 'LEFT',  pose: 'look',  flip: -1 },
  { id: 'right', icon: '➡️', label: 'RIGHT', pose: 'look',  flip: 1 },
  { id: 'pet',   icon: '🤚', label: 'PET',   pose: 'happy', flip: 1 },
  { id: 'jump',  icon: '⭐', label: 'JUMP',  pose: 'jump',  flip: 1 },
];
function followGame(app, s, done) {
  const pet = get().pet, animal = speciesOf(pet.species).animal;
  const roundEl = h('div', { class: 'pill' }, 'Round ', h('span', {}, '1'), '/3');
  const { cv, fit } = stage(app, s, 'Follow the Poke', roundEl);
  const msg = h('p', { class: 'bubble follow-msg' }, 'Watch closely…');
  const pads = h('div', { class: 'pads' }, ...PADS.map(p => h('button', { class: 'pad', 'data-pad': p.id, 'aria-label': p.label, onclick: () => press(p.id) }, h('span', {}, p.icon), p.label)));
  cv.after(msg, pads);
  let dim = fit(), pose = 'idle', flip = 1, round = 0, seq = [], input = [], watching = true, mistakes = 0;
  const lens = [3, 4, 5];
  const light = id => { const b = pads.querySelector(`[data-pad="${id}"]`); b.classList.add('lit'); setTimeout(() => b.classList.remove('lit'), 380); };
  const act = id => { const p = PADS.find(x => x.id === id); pose = p.pose; flip = p.flip; light(id); sfx.tap(); setTimeout(() => { pose = 'idle'; flip = 1; }, 420); };
  async function show() {
    watching = true; input = []; msg.textContent = 'Watch closely…'; roundEl.children[0].textContent = round + 1;
    await wait(600);
    for (const id of seq) { if (!cv.isConnected) return; act(id); await wait(window.POKA_FAST ? 250 : 720); }
    watching = false; msg.textContent = 'Your turn! Copy the moves.';
  }
  function newRound() { seq = Array.from({ length: lens[round] }, () => PADS[Math.floor(Math.random() * 4)].id); show(); }
  function press(id) {
    if (watching) return;
    act(id); input.push(id);
    const i = input.length - 1;
    if (input[i] !== seq[i]) { mistakes++; sfx.miss(); msg.textContent = 'Oops! Watch again 🙂'; haptic('light'); watching = true; setTimeout(show, 700); return; }
    if (input.length === seq.length) {
      sfx.pet(animal); haptic('success'); round++;
      if (round >= lens.length) { watching = true; msg.textContent = 'Perfect! 🎉'; setTimeout(() => done({ mistakes }), 700); }
      else { msg.textContent = 'Great! Next round…'; watching = true; setTimeout(newRound, 800); }
    }
  }
  window.PokaFollow = { seq: () => seq, press, watching: () => watching };   // test hook
  const onResize = () => { dim = fit(); }; window.addEventListener('resize', onResize);
  function frame(now) {
    if (!cv.isConnected) { window.removeEventListener('resize', onResize); return; }
    const ctx = cv.getContext('2d'); ctx.setTransform(dim.d, 0, 0, dim.d, 0, 0); ctx.clearRect(0, 0, dim.W, dim.H);
    const k = Math.min(dim.W, dim.H) / 520;
    ctx.save(); ctx.translate(dim.W / 2, dim.H - 10); ctx.scale(k * flip, k); drawPet(ctx, pet, pose, { t: now / 1000 }); ctx.restore();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  newRound();
}
const wait = ms => new Promise(r => setTimeout(r, ms));
