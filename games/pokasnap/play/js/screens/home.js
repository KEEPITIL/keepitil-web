/* HOME — the pet is the focus. One big PLAY; three secondary doors. */

import { h, fmt } from '../ui.js';
import { livePet } from './flow.js';
import { get } from '../game/state.js';
import { levelProgress, MAX_LEVEL } from '../game/progress.js';
import { mission as missionOf } from '../data/missions.js';
import { line } from '../data/personality.js';
import { POKE_CYCLE as CYCLE } from '../data/poses.js';
import { poseUnlocked } from '../game/progress.js';
import { sfx } from '../platform/sound.js';
import { haptic } from '../platform/native.js';
import { track } from '../platform/analytics.js';

export function homeScreen(app, opts = {}) {
  const st = get(), pet = st.pet, lp = levelProgress(st.progress.xp);
  let pose = 'idle', squash = 0, k = 0;
  const bubble = h('p', { class: 'bubble', style: 'align-self:center;margin:4px 0 0' }, line(pet.personality, opts.greet ? 'greet' : 'greet', pet.name));
  const hero = livePet(() => pet, () => pose, Math.min(300, window.innerWidth * 0.72), { squash: () => (squash *= 0.86) > 0.02 ? Math.sin(squash * Math.PI) * squash : 0 });
  hero.setAttribute('aria-label', `${pet.name}. Tap to poke.`);
  hero.onclick = () => {
    const order = CYCLE.filter(p => poseUnlocked(p, st.progress.level));
    pose = order[k++ % order.length]; squash = 1;
    bubble.textContent = line(pet.personality, 'poke', pet.name);
    sfx.poke(); haptic('light'); track('pet_poked', { pose, via: 'home' });
    clearTimeout(hero._t); hero._t = setTimeout(() => { pose = 'idle'; }, 2600);
  };
  const m = missionOf(st.currentMission);

  app.mount(h('div', { class: 'screen bg-dots' },
    h('div', { class: 'topbar' },
      h('div', { class: 'pill' }, '🪙 ', fmt(st.progress.coins)),
      h('div', { class: 'pill' }, '📸 ', fmt(st.progress.snaps)),
      h('div', { class: 'grow' }),
      h('button', { class: 'icon-btn', 'aria-label': 'Settings', onclick: () => app.go('settings') }, '⚙️')),
    h('div', { style: 'text-align:center;margin-top:10px' },
      h('h1', { style: 'margin:0' }, pet.name),
      h('p', { class: 'small', style: 'margin:2px 0 8px' }, `Level ${lp.level}${lp.level >= MAX_LEVEL ? ' · MAX' : ''}`),
      h('div', { class: 'xp', style: 'max-width:260px;margin:0 auto', role: 'progressbar', 'aria-valuenow': Math.round(lp.pct * 100) }, h('i', { style: `width:${Math.round(lp.pct * 100)}%` })),
      h('p', { class: 'small', style: 'margin:4px 0 0' }, lp.level >= MAX_LEVEL ? 'Max level!' : `${fmt(lp.into)} / ${fmt(lp.need)} XP`)),
    bubble,
    hero,
    h('div', { class: 'stack', style: 'margin-top:auto' },
      h('button', { class: 'btn block big', onclick: () => { sfx.tap(); app.go('brief', { missionId: st.currentMission }); } },
        '📸 PLAY'),
      h('p', { class: 'small', style: 'text-align:center;margin:-4px 0 0' }, `Next: ${m.icon} ${m.title}`),
      h('div', { class: 'nav3' },
        h('button', { onclick: () => app.go('missions') }, h('span', {}, '🗺️'), 'MISSIONS'),
        h('button', { onclick: () => app.go('album') }, h('span', {}, '🖼️'), 'MY SNAPS'),
        h('button', { onclick: () => app.go('closet') }, h('span', {}, '👒'), 'CLOSET')))));
}

/* Mission briefing: a short beat before the camera opens. */
export function briefScreen(app, { missionId }) {
  const st = get(), pet = st.pet, m = missionOf(missionId);
  app.mount(h('div', { class: 'screen center bg-dots' },
    h('div', { style: 'font-size:64px' }, m.icon),
    h('p', { class: 'tag', style: 'margin:0' }, 'PHOTO MISSION'),
    h('h1', {}, m.title),
    h('p', { class: 'sub', style: 'max-width:320px' }, m.instruction),
    livePet(() => pet, () => m.recommendedPose, 190),
    h('p', { class: 'bubble' }, line(pet.personality, 'mission', pet.name)),
    h('div', { class: 'row', style: 'gap:8px;margin:18px 0 6px' },
      h('div', { class: 'pill' }, '⭐ ', m.XPReward, ' XP'), h('div', { class: 'pill' }, '🪙 ', m.coinReward),
      st.progress.missions[m.missionID] ? h('div', { class: 'pill' }, '🏆 ', fmt(st.progress.missions[m.missionID])) : null),
    h('div', { class: 'stack', style: 'width:100%;max-width:360px' },
      h('button', { class: 'btn block big', onclick: () => app.go('camera', { missionId }) }, '📷 OPEN CAMERA'),
      h('button', { class: 'linkbtn', onclick: () => app.go('missions') }, 'Choose a different mission'),
      h('button', { class: 'linkbtn', onclick: () => app.go('home') }, 'Back home'))));
}
