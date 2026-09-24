/* CARE — Feed · Pet · Treat · Rest. Takes seconds, always works, never
   required. Rewards pay once per action per cooldown; the animation and the
   love are unlimited. */

import { h, coin, fmt, toast, moodChip, pokeGestures } from '../ui.js';
import { livePet } from './flow.js';
import { petBrain } from './home.js';
import { get, update } from '../game/state.js';
import { ACTIONS, FOODS } from '../data/care.js';
import { line } from '../data/personality.js';
import { species as speciesOf } from '../data/pets.js';
import { care, moodFor, careReadyIn } from '../game/companion.js';
import { sfx } from '../platform/sound.js';
import { haptic } from '../platform/native.js';
import { track } from '../platform/analytics.js';
import { levelUpCard } from './result.js';

export function careScreen(app) {
  const pet = get().pet;
  let pose = 'idle', squash = 0, strokes = 0;
  const brain = petBrain(() => pose, p => { pose = p; }, (k = 1) => { squash = k; });
  const size = Math.round(Math.max(170, Math.min(300, window.innerWidth * 0.72, window.innerHeight - 470)));
  const stage = h('div', { class: 'care-stage' });
  const hero = livePet(() => get().pet, () => pose, size, {
    squash: () => (squash *= 0.86) > 0.02 ? Math.sin(squash * Math.PI) * squash : 0,
    tick: now => brain.tick(now, false),
  });
  stage.append(hero);
  const bubble = h('p', { class: 'bubble', style: 'align-self:center' }, `How should we look after ${pet.name}?`);
  const moodBox = h('div', { style: 'text-align:center' }, moodChip(moodFor(get())));
  const coins = h('div', { class: 'pill' }, coin(), h('span', {}, fmt(get().progress.coins)));
  const foods = h('div', { class: 'foods' }); foods.hidden = true;

  // PET is a gesture: rub the pet
  pokeGestures(hero, { onTap: () => { strokes++; brain.strike('happy', 1200); sfx.pet(speciesOf(pet.species).animal); if (strokes >= 3) { strokes = 0; doAction('pet'); } else bubble.textContent = line(pet.personality, 'pet', pet.name); } });

  function floatEmoji(ch) {
    const e = h('div', { class: 'float-food' }, ch); stage.append(e);
    setTimeout(() => e.remove(), 1100);
  }
  function doAction(id, foodId = null) {
    const a = ACTIONS.find(x => x.id === id);
    let r; update(st => { r = care(st, id, Date.now(), foodId); });
    brain.strike(r.fav ? 'jump' : a.pose, id === 'rest' ? 4000 : 2600);
    if (id === 'feed') { floatEmoji(FOODS.find(f => f.id === foodId).icon); sfx.eat(); }
    else if (id === 'treat') { floatEmoji('🦴'); sfx.eat(); }
    else if (id === 'pet') { floatEmoji('💞'); sfx.pet(speciesOf(pet.species).animal); }
    else floatEmoji('💤');
    haptic('light');
    bubble.textContent = line(pet.personality, r.fav ? 'fav' : id === 'rest' ? 'rest' : id === 'pet' ? 'pet' : 'fed', pet.name);
    if (id === 'feed' || id === 'treat') track('pet_fed', { food: foodId || 'treat', fav: r.fav, rewarded: r.rewarded });
    if (r.moodChanged) track('pet_mood_changed', { mood: r.moodChanged, via: id });
    if (r.daily?.newly) { track('daily_task_completed', { task: 'feed' }); if (r.daily.bonus) toast(`💞 Daily bond bonus! +${r.daily.bonus.coins} coins`, 2600, 'top'); }
    if (r.rewarded) { toast(`+${r.xp} XP  +${r.coins} coins`, 2200, 'top'); sfx.reward(); }
    moodBox.replaceChildren(moodChip(moodFor(get())));
    coins.lastChild.textContent = fmt(get().progress.coins);
    if (r.levelUp) setTimeout(() => levelUpCard(r), 900);
    draw();
  }

  const grid = h('div', { class: 'care-actions' });
  function draw() {
    grid.replaceChildren(...ACTIONS.map(a => {
      const wait = careReadyIn(get(), a.id);
      return h('button', { class: 'care-btn', onclick: () => {
        sfx.tap();
        if (a.id === 'feed') { foods.hidden = !foods.hidden; return; }
        if (a.id === 'pet') { bubble.textContent = `Rub ${pet.name} — tap three times!`; brain.strike('happy', 1500); return; }
        foods.hidden = true; doAction(a.id);
      } }, h('span', { class: 'e' }, a.icon), a.name, h('small', {}, ...(wait ? ['just for love 💞'] : ['+XP +', coin()])));
    }));
  }
  foods.append(...FOODS.map(f => h('button', { class: 'food', onclick: () => { foods.hidden = true; doAction('feed', f.id); } },
    h('span', { class: 'e' }, f.icon), f.name)));
  draw();

  app.mount(h('div', { class: 'screen care' },
    h('div', { class: 'row between' },
      h('div', { class: 'row' }, h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => app.go('home') }, '←'), h('h1', { style: 'margin:0' }, 'Care')), coins),
    moodBox, bubble, stage, foods, grid,
    h('p', { class: 'small', style: 'text-align:center;margin:10px 0 0' }, `Care is optional. ${pet.name} never gets sick, never runs away and never loses progress.`)));
}
