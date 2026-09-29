/* SNAP — the full-screen living Poka world (2.1).
   ---------------------------------------------------------------------------
   The phone IS the world: one full-bleed canvas with a floating compact HUD, a slim tool dock on
   the left edge, the live event on the right edge, and the permanent bar underneath whose raised
   centre SNAP is the ONLY shutter (nav.js calls window.__snapAction while this screen is open).
   Touch the world directly:
     drag the ball and let go → it flies, bounces, rolls → every Poka decides (game/behave.js);
     tap a Poka = boop · stroke across it = pet · hold = small action menu;
     🥣 then tap the floor = a bowl of food (hunger, favourite food, bond and personality decide);
     toys are carried, chased, fought over and hidden with — by the Pokas, on their own;
     ✏️ Edit Room: drag, rotate, put away, add furniture; Done saves, Cancel restores.
   Photography never costs energy. A photo → score → Snap Points → the live rotating game, and it may
   unlock ONE seasonal Album slot with the actual photo (game/core21.js via world.recordPhoto). */

import { h, toast, sheet, plural, fmt, fill } from '../ui.js';
import { get, update } from '../game/state.js';
import { LOCATIONS, OBJECTS, TIMES_OF_DAY, RELATION_TYPES } from '../data/world.js';
import * as W from '../game/world.js';
import * as V from '../game/v2.js';
import * as C from '../game/core21.js';
import * as Room from '../game/room.js';
import * as Phys from '../game/physics.js';
import * as B from '../game/behave.js';
import * as Choreo from '../game/choreo.js';
import { drawPet } from '../render/pet.js';
import { drawBackdrop } from '../render/items.js';
import { drawFurniture } from '../render/furniture.js';
import { SPECIES } from '../data/pets.js';
import { starsFor, STAR_TEXT } from '../data/progression.js';
import { grantXP, levelProgress } from '../game/progress.js';
import * as album from '../game/album.js';
import { track } from '../platform/analytics.js';
import { sfx } from '../platform/sound.js';
import { haptic } from '../platform/native.js';
import { navBar, compact } from './nav.js';
import { celebrateSet } from './album21.js';

const WW = 900;                                   // world canvas width; height follows the screen
const floorCol = {};
const RARITY_LABEL = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', legendary: 'Legendary' };
export const RARITY_COLOR = { common: '#9aa3ad', uncommon: '#3fae78', rare: '#2f86c0', legendary: '#d4a017' };
const LANES = [0.9, 0.78, 0.67];
const FY = 0.6;                                   // nearest a Poka/bowl/toy may stand to the wall
const CUSTOM = new Set(['go', 'chaseBall', 'carryBall', 'returnBall', 'keepAway', 'eat', 'carryToy', 'hide', 'beg', 'watchBall', 'sniff']);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function worldScreen(app, opts = {}) {
  const s0 = get();
  const open = W.locationsOpen(s0);
  if (!open.length || !W.activePets(s0).length) { app.go('poka'); return; }
  update(x => { V.ensureV2(x); C.ensureV21(x); Room.ensureRooms(x, open.map(l => l.id)); for (const p of W.pets(x)) B.ensureTraits(p); if (x.pet) B.ensureTraits(x.pet); });
  let loc = open.find(l => l.id === (opts.loc || get().v21.loc)) || open[0];
  track('homeland_entered', { location: loc.id });

  // ------------------------------------------------------------ DOM
  const canvas = h('canvas', { class: 'w21-canvas', 'aria-label': 'Your Pokas\' world. Drag the ball to throw it, tap or stroke a Poka, and press SNAP to take a photo.' });
  const banner = h('div', { class: 'w21-banner', role: 'status', 'aria-live': 'polite' }); banner.hidden = true;
  const bubble = h('div', { class: 'w21-bubble', role: 'status', 'aria-live': 'polite' }); bubble.hidden = true;
  const coach = h('div', { class: 'w21-coach', role: 'note' }); coach.hidden = true;
  const hud = h('div', { class: 'w21-hud' });
  const dock = h('div', { class: 'w21-dock', role: 'toolbar', 'aria-label': 'World tools' });
  const evChip = h('button', { class: 'w21-event' });
  const editBar = h('div', { class: 'w21-editbar', role: 'toolbar', 'aria-label': 'Edit Room' }); editBar.hidden = true;
  const stage = h('div', { class: 'w21-stage' }, canvas, hud, dock, evChip, banner, bubble, coach, editBar);
  const nav = navBar(app, 'snap');
  app.mount(h('div', { class: 'screen world21' }, stage, nav));
  const ctx = canvas.getContext('2d');
  let HH = 1600, aspect = HH / WW;
  function size() { const r = stage.getBoundingClientRect(); if (!r.width) return; HH = Math.round(WW * r.height / r.width); aspect = HH / WW; canvas.width = WW; canvas.height = HH; }
  size(); const ro = new ResizeObserver(size); ro.observe(stage);

  // ------------------------------------------------------------ world state
  let actors = [], ballObj = null, ball = null, bowls = [], edit = null, drag = null, moment = null, momentUntil = 0, nextMomentAt = performance.now() + 12000;
  let recent = [], raf = 0, alive = true, paused = false, lastTick = 0, lastFrame = 0, worldChoreo = {}, foodArmed = null, dirty = 0;
  const room = () => (edit ? edit.draft : get().v21.rooms[loc.id]) || [];
  const sc = () => W.locationState(get(), loc.id);
  const indoor = () => Room.INDOOR.has(loc.id);
  function buildWorld() {
    const s = get(), pets = W.activePets(s);
    actors = pets.map((p, i) => ({ pet: { ...p, ...B.ensureTraits({ ...p }) }, x: 0.25 + i * 0.25, y: LANES[i] ?? 0.86, lane: LANES[i] ?? 0.86, vx: 0, pose: 'idle', until: 0, flip: i % 2 ? -1 : 1, mood: W.careState(s, p.id).id, s: null, fx: [] }));
    ballObj = room().find(p => p.obj === 'ball'); ball = Phys.makeBall(ballObj?.x ?? 0.5, ballObj?.y ?? 0.93);
    bowls = []; recent = []; worldChoreo = {};
  }
  const actorOf = id => actors.find(a => a.pet.id === id);
  const persistBall = () => { if (!ballObj) return; clearTimeout(persistBall.t); persistBall.t = setTimeout(() => update(x => { const b = x.v21.rooms[loc.id]?.find(p => p.obj === 'ball'); if (b) { b.x = +ball.x.toFixed(3); b.y = +ball.y.toFixed(3); } }), 800); };
  const remember = (kind, plans, extra = {}) => { recent.push({ kind, plans, at: performance.now(), ...extra }); recent = recent.filter(r => performance.now() - r.at < 9000); };

  // ------------------------------------------------------------ HUD, dock, event chip
  function drawHud() {
    const s = get(), lp = levelProgress(s.progress.xp || 0);
    fill(hud, 
      h('button', { class: 'w21-me', 'aria-label': `Level ${lp.level}. Menu: Poka Shop, settings, music, help`, onclick: menu }, h('span', { class: 'w21-av', 'aria-hidden': 'true' }, SPECIES[s.pet?.species]?.animal === 'dog' ? '🐶' : SPECIES[s.pet?.species]?.animal === 'rabbit' ? '🐰' : '🐱'),
        h('span', { class: 'w21-lv' }, h('b', {}, `${lp.level}`), h('i', { style: `--p:${Math.round(lp.pct * 100)}%` }))),
      h('button', { class: 'w21-loc', 'aria-haspopup': 'dialog', 'aria-label': `Location: ${loc.name}. Change location`, onclick: locationSheet }, h('span', { 'aria-hidden': 'true' }, loc.icon), h('b', {}, loc.name), h('span', { 'aria-hidden': 'true' }, '▾')),
      h('div', { class: 'w21-cur' },
        h('button', { class: 'cur coins', 'aria-label': `${fmt(s.progress.coins || 0)} coins — Poka Shop`, onclick: () => app.go('store', { from: 'snap' }) }, h('span', { class: 'coin' }), h('b', {}, compact(s.progress.coins || 0))),
        h('button', { class: 'cur dia', 'aria-label': `${fmt(s.progress.diamonds || 0)} diamonds — Poka Shop`, onclick: () => app.go('store', { from: 'snap' }) }, '💎', h('b', {}, compact(s.progress.diamonds || 0)))));
  }
  function drawDock() {
    fill(dock, 
      h('button', { class: 'w21-tool' + (foodArmed ? ' on' : ''), 'aria-label': 'Food: choose a food, then tap the floor to put a bowl down', onclick: foodSheet }, '🥣'),
      h('button', { class: 'w21-tool', 'aria-label': 'Call your Pokas over', onclick: callPokas }, '📣'),
      h('button', { class: 'w21-tool', 'aria-label': 'Edit Room: move, rotate and put away furniture', onclick: () => startEdit() }, '✏️'));
  }
  function drawEvent() {
    const ev = C.currentEvent(), v = ev ? C.eventView(get(), ev) : null;
    if (!v || v.state !== 'active') { evChip.hidden = true; return; }
    evChip.hidden = false;
    const pct = Math.round(100 * (1 - v.toNext / v.per)), d = Math.floor(v.endsIn / 864e5), hr = Math.floor((v.endsIn % 864e5) / 36e5);
    evChip.setAttribute('aria-label', `${v.title}: ${v.available} ${v.conversion.currency} ready, ${v.per - v.toNext} of ${v.per} Snap Points to the next. Ends in ${d} days ${hr} hours.`);
    evChip.onclick = () => app.go(v.screen === 'race' || v.screen === 'build' || v.screen === 'puzzle' || v.screen === 'fashion' || v.screen === 'dance' ? 'event21' : 'event21');
    fill(evChip, h('span', { class: 'e-ic', 'aria-hidden': 'true' }, v.icon), h('i', { class: 'e-ring', style: `--p:${pct}%`, 'aria-hidden': 'true' }),
      v.available ? h('b', { class: 'e-badge' }, String(v.available)) : null, h('small', {}, d ? `${d}d ${hr}h` : `${hr}h`));
  }
  function setSnapState(state) { const b = nav.querySelector('.nav-snap'); if (b) { b.dataset.state = state; b.setAttribute('aria-label', state === 'rare' ? 'SNAP — a Rare Moment is happening!' : state === 'edit' ? 'SNAP (finish editing first)' : 'SNAP — take a photo'); } }

  // ------------------------------------------------------------ sheets
  function locationSheet() {
    const s = get(), lvl = s.progress.level || 1;
    const sh = sheet(h('h2', {}, 'Where to?'), h('div', { class: 'loc-list' }, ...LOCATIONS.map(l => { const ok = lvl >= l.level;
      return h('button', { class: 'loc-row' + (l.id === loc.id ? ' on' : '') + (ok ? '' : ' locked'), 'aria-label': ok ? `${l.name}${l.id === loc.id ? ', current' : ''}` : `${l.name}, opens at level ${l.level}`,
        onclick: () => { if (!ok) return toast(`${l.name} opens at level ${l.level}`); sh.close(); if (edit) cancelEdit(); loc = l; update(x => { x.v21.loc = l.id; Room.ensureRooms(x, [l.id]); }); track('homeland_entered', { location: l.id }); buildWorld(); drawHud(); } },
        h('span', { class: 'li', 'aria-hidden': 'true' }, ok ? l.icon : '🔒'), h('b', {}, l.name), h('small', {}, ok ? (l.id === loc.id ? 'You are here' : `${l.objects.length} things to play with`) : `Level ${l.level}`)); })));
  }
  function foodSheet() {
    if (foodArmed) { foodArmed = null; drawDock(); say('Food put away.'); return; }
    const sh = sheet(h('h2', {}, 'Put some food down'), h('p', { class: 'small' }, 'Pick a food, then tap the floor where the bowl should go.'),
      h('div', { class: 'food-row' }, ...B.FOODS.map(f => h('button', { class: 'food-btn', onclick: () => { sh.close(); foodArmed = f.id; drawDock(); say(`Tap the floor to put down ${f.name.toLowerCase()}.`); } }, h('span', { 'aria-hidden': 'true' }, f.icon), f.name))));
  }
  function menu() {
    const go = (r, p) => () => { sh.close(); app.go(r, p); }, lvl = get().progress.level || 1;
    const sh = sheet(h('h2', {}, 'Menu'), h('div', { class: 'menu-grid' },
      h('button', { onclick: go('store', { from: 'snap' }) }, '🛍️', h('span', {}, 'Poka Shop')), h('button', { onclick: go('training21') }, '🎯', h('span', {}, 'Training')),
      h('button', { onclick: go('event21') }, '🎪', h('span', {}, 'Events')), h('button', { onclick: go('music', { from: 'snap' }) }, '🎧', h('span', {}, 'Music')),
      h('button', { onclick: go('settings') }, '⚙️', h('span', {}, 'Settings')), h('button', { onclick: go('help') }, '🛟', h('span', {}, 'Help')),
      h('button', { onclick: go('missions') }, '📷', h('span', {}, 'Photo Challenges')), h('button', { onclick: go('snaps') }, '🖼️', h('span', {}, 'My Snaps')),
      h('button', { onclick: go('walk') }, '🥾', h('span', {}, 'Walk')), h('button', { onclick: go('adventures') }, '🗺️', h('span', {}, 'Adventures')),
      h('button', { onclick: go('chapters') }, '📜', h('span', {}, 'Chapters')), lvl >= 70 ? h('button', { onclick: go('league') }, '🏆', h('span', {}, 'League')) : h('button', { onclick: go('lookback') }, '🗓️', h('span', {}, 'Lookback'))));
  }
  function say(text, ms = 3600) { bubble.textContent = text; bubble.hidden = false; clearTimeout(say.t); say.t = setTimeout(() => { bubble.hidden = true; }, ms); }
  function openMoment(r, label = 'MOMENT') {
    const now = performance.now(); if (moment && now < momentUntil) return;
    moment = { rarity: r }; momentUntil = now + 6500; nextMomentAt = now + 22000;
    banner.textContent = `${r === 'legendary' ? '🌟' : '✨'} ${RARITY_LABEL[r].toUpperCase()} ${label} — SNAP IT!`; banner.style.borderColor = RARITY_COLOR[r]; banner.hidden = false;
    stage.classList.add('rare-glow'); setSnapState('rare');
    track(r === 'legendary' ? 'legendary_moment' : 'rare_moment', { location: loc.id, captured: false }); haptic('light'); sfx.reward?.();
  }
  function closeMoment() { moment = null; banner.hidden = true; stage.classList.remove('rare-glow'); setSnapState(edit ? 'edit' : 'ready'); }

  // ------------------------------------------------------------ plans → scripts
  const plansLine = plans => plans.map(p => p.line).filter(Boolean).join('  ·  ');
  function runBallPlans(plans) {
    const now = performance.now();
    for (const p of plans) { const a = actorOf(p.id); if (!a) continue;
      a.until = now + 9000; a.beh = { id: 'ball', reaction: p.action }; a.t0 = now;
      if (p.action === 'chase' || p.action === 'race' || p.action === 'guard') a.s = { kind: 'chaseBall', speed: p.speed, start: now + p.delay * 1000, act: p.action };
      else if (p.action === 'investigate') a.s = { kind: 'chaseBall', speed: 0.8, start: now + p.delay * 1000, act: 'investigate', afterLand: true };
      else if (p.action === 'wait_join') a.s = { kind: 'watchBall', joinAfter: p.follow, start: now + p.delay * 1000 };
      else a.s = { kind: 'watchBall', pose: p.action === 'refuse' ? 'confused' : p.action === 'ignore' ? 'yawn' : 'look' };
    }
    remember('ball', plans); say(plansLine(plans));
    if (B.divergent(plans) && Math.random() < 0.3) openMoment(Math.random() < 0.25 ? 'rare' : 'uncommon', 'SPLIT DECISION');
  }
  function ballLanded() {
    const s = get(), pets = actors.map(a => ({ ...a.pet, mood: a.mood, dist: Math.min(1, Math.hypot(a.x - ball.x, (a.y - ball.y) * 2)) }));
    runBallPlans(B.reactToBall(pets));
  }
  function grabBall(a) {
    const others = actors.filter(o => o !== a && o.s?.kind === 'chaseBall' && Math.hypot(o.x - ball.x, o.y - ball.y) < 0.09);
    let winner = a, contest = null;
    if (others.length) { contest = B.resolveBallContest(a.pet, others[0].pet); winner = actorOf(contest.winner); const loser = actorOf(contest.loser);
      loser.s = { kind: 'go', x: loser.x + (loser.x < winner.x ? -0.06 : 0.06), y: loser.y, then: contest.loserAction === 'stumble' ? 'stumble' : contest.loserAction === 'tug' ? 'catch' : contest.loserAction === 'steal_try' ? 'wink' : 'surprised' };
      loser.beh = { id: 'ball', reaction: contest.loserAction === 'steal_try' ? 'steal_try' : contest.loserAction === 'stumble' ? 'stumble' : 'tug' }; loser.until = performance.now() + 3500;
      say(`${winner.pet.name} gets it first — ${loser.pet.name} ${contest.loserAction === 'stumble' ? 'stumbles!' : contest.loserAction === 'steal_try' ? 'tries to steal it!' : contest.loserAction === 'tug' ? 'grabs the other end!' : 'is surprised!'}`);
      if (contest.funny && Math.random() < 0.45) openMoment(Math.random() < 0.2 ? 'legendary' : 'rare', 'MOMENT'); }
    Phys.pick(ball, winner.pet.id); winner.pose = 'catch';
    const next = B.afterCatch(winner.pet);
    winner.beh = { id: 'ball', reaction: next === 'return' ? 'return' : next === 'keep_away' ? 'keep_away' : 'catch' }; winner.until = performance.now() + 6000;
    winner.s = next === 'return' ? { kind: 'returnBall' } : next === 'keep_away' ? { kind: 'keepAway', until: performance.now() + 3500 } : { kind: 'carryBall', until: performance.now() + 2500 };
    for (const o of actors) if (o !== winner && o.s?.kind === 'chaseBall') { o.s = { kind: 'watchBall', pose: 'look' }; o.until = performance.now() + 2500; }
    remember('catch', [{ id: winner.pet.id, action: winner.beh.reaction }], { contest });
  }
  function dropFood(food, x, y) {
    const s = get(), now = performance.now();
    bowls = [{ food, x, y: clamp(y, FY, 0.95), bites: 4, until: now + 20000, eaters: new Set() }];
    const rel = id => Object.fromEntries(actors.filter(o => o.pet.id !== id).map(o => [o.pet.id, W.relation(s, id, o.pet.id).type]));
    const pets = actors.map(a => ({ ...a.pet, mood: a.mood, hunger: B.hungerOf(s.v21.fed?.[a.pet.id] || W.ensure(s).care[a.pet.id]?.lastCare || 0), relation: rel(a.pet.id) }));
    const plans = B.reactToFood(pets, food);
    for (const p of plans) { const a = actorOf(p.id); if (!a) continue; a.beh = { id: 'food', reaction: p.action }; a.until = now + 9000; a.t0 = now;
      const b = bowls[0], side = a.x < b.x ? -1 : 1;
      if (['rush', 'steal', 'guard_food', 'share'].includes(p.action)) a.s = { kind: 'eat', start: now + p.delay * 1000, x: b.x + side * 0.07, y: b.y, act: p.action, fav: p.fav };
      else if (p.action === 'polite') a.s = { kind: 'eat', start: now + 2600, x: b.x + side * 0.12, y: b.y, act: 'polite', wait: 2200 };
      else if (p.action === 'reject') a.s = { kind: 'sniff', x: b.x + side * 0.08, y: b.y, then: 'confused' };
      else if (p.action === 'beg') a.s = { kind: 'beg' };
      else if (p.action === 'invite') { const f = actorOf(p.with); a.s = { kind: 'go', x: f ? f.x : a.x, y: f ? f.y : a.y, then: 'wave', next: { kind: 'eat', x: b.x + side * 0.07, y: b.y, act: 'share' } }; if (f) { f.s = { kind: 'eat', start: now + 1800, x: b.x - side * 0.07, y: b.y, act: 'share' }; f.beh = { id: 'food', reaction: 'share' }; f.until = now + 9000; } }
      else a.s = { kind: 'hold', pose: 'confused' };
    }
    remember('food', plans, { food }); say(plansLine(plans)); sfx.tap?.();
    if (B.divergent(plans) && Math.random() < 0.3) openMoment('uncommon', 'MEALTIME');
    track('interact_used', { tool: 'food', reactions: plans.map(p => p.action).join(','), pets: plans.length });
    update(x => V.note(x, 'interacts'));
  }
  function touchPet(a, kind) {
    const r = B.reactToTouch({ ...a.pet, mood: a.mood }, kind);
    a.s = { kind: 'hold', pose: r.pose }; a.until = performance.now() + 2600; a.beh = { id: 'touch', reaction: r.action }; if (r.hearts) a.fx = ['hearts'];
    remember('touch', [{ id: a.pet.id, action: r.action }]); say(r.line, 2400); haptic('light'); sfx.poke?.();
    if (kind === 'stroke') update(x => { const c = (x.v21.petAt = x.v21.petAt || {}); if (Date.now() - (c[a.pet.id] || 0) > 6e5) { c[a.pet.id] = Date.now(); W.careAction(x, a.pet.id, 'care'); } });
    update(x => V.note(x, 'interacts'));
    track('interact_used', { tool: kind, reactions: r.action, pets: 1 });
  }
  function petMenu(a, px, py) {
    const sh = sheet(h('h2', {}, a.pet.name), h('div', { class: 'food-row' },
      h('button', { class: 'food-btn', onclick: () => { sh.close(); touchPet(a, 'stroke'); } }, h('span', {}, '🤚'), 'Pet'),
      h('button', { class: 'food-btn', onclick: () => { sh.close(); touchPet(a, 'poke'); } }, h('span', {}, '👉'), 'Poke'),
      h('button', { class: 'food-btn', onclick: () => { sh.close(); foodArmed = 'cookie'; dropFood('cookie', clamp(a.x + 0.08, 0.1, 0.9), a.y); foodArmed = null; } }, h('span', {}, '🍪'), 'Treat'),
      h('button', { class: 'food-btn', onclick: () => { sh.close(); a.s = { kind: 'go', x: 0.5, y: 0.95, then: 'wave' }; a.until = performance.now() + 5000; say(`${a.pet.name} trots over.`); } }, h('span', {}, '📣'), 'Call')));
  }
  function callPokas() {
    const plans = actors.map(a => { const r = V.reactTo({ personality: a.pet.personality, tool: 'call', name: a.pet.name, mood: a.mood, bond: 60 }); if (r.kind === 'approach') { a.s = { kind: 'go', x: 0.3 + actors.indexOf(a) * 0.2, y: 0.95, then: r.pose }; a.until = performance.now() + 6000; } else { a.s = { kind: 'hold', pose: r.pose }; a.until = performance.now() + 3000; } a.beh = { id: 'call', reaction: r.kind }; return { id: a.pet.id, action: r.kind, line: r.line }; });
    remember('call', plans); say(plansLine(plans)); update(x => V.note(x, 'interacts'));
  }

  // ------------------------------------------------------------ Edit Room
  function startEdit(selectUid = null) {
    if (edit) return; edit = Room.beginEdit(get(), loc.id); edit.selected = selectUid; editBar.hidden = false; dock.hidden = true; evChip.hidden = true; setSnapState('edit'); drawEditBar();
    say('Edit Room: drag furniture to move it. Tap to select, then rotate or put it away.', 4200); track('room_edit', { location: loc.id, action: 'start' });
  }
  function drawEditBar() {
    const sel = edit?.draft.find(p => p.uid === edit.selected);
    fill(editBar, 
      h('span', { class: 'eb-name' }, sel ? Room.FURNITURE[sel.obj].name : 'Tap something to select it'),
      h('button', { disabled: sel ? null : true, onclick: () => { Room.rotate(edit, edit.selected); drawEditBar(); } }, '↻ Rotate'),
      h('button', { disabled: sel && sel.obj !== 'ball' ? null : true, onclick: () => { Room.store(edit, edit.selected); edit.selected = null; drawEditBar(); } }, '📦 Put away'),
      h('button', { onclick: addSheet }, '＋ Add'),
      h('button', { class: 'eb-cancel', onclick: cancelEdit }, 'Cancel'),
      h('button', { class: 'eb-done', onclick: doneEdit }, '✓ Done'));
  }
  function addSheet() {
    const s = get(), stored = s.v21.storage || [], cats = indoor() ? ['floor', 'wall', 'surface', 'toy'] : ['outdoor', 'floor', 'toy'];
    const items = Object.entries(Room.FURNITURE).filter(([id, f]) => id !== 'ball' && cats.includes(f.cat) && (indoor() || !f.indoor));
    const sh = sheet(h('h2', {}, 'Add to this room'), stored.length ? h('p', { class: 'small' }, `Put away: ${stored.map(o => Room.FURNITURE[o]?.name).join(', ')}`) : null,
      h('div', { class: 'food-row wrap' }, ...items.map(([id, f]) => h('button', { class: 'food-btn', onclick: () => { sh.close(); const p = Room.add(edit, id, 0.5); if (stored.includes(id)) update(x => Room.takeFromStorage(x, id)); edit.selected = p.uid; drawEditBar(); } }, h('span', {}, ({ floor: '🛋️', wall: '🖼️', surface: '🪔', toy: '🧸', outdoor: '🌼' })[f.cat]), f.name))));
  }
  function cancelEdit() { edit = null; editBar.hidden = true; dock.hidden = false; drawEvent(); setSnapState('ready'); say('Changes cancelled.'); }
  function doneEdit() {
    const moved = edit.moved; update(x => { Room.confirm(x, edit); if (moved) x.v21.roomEditedAt = Date.now(); });
    track('room_edit', { location: loc.id, action: 'done', changes: moved });
    edit = null; editBar.hidden = true; dock.hidden = false; drawEvent(); setSnapState('ready');
    ballObj = room().find(p => p.obj === 'ball'); say(moved ? 'Room saved ✓ Your Pokas are checking it out.' : 'No changes.'); for (const a of actors) a.until = 0;
  }

  // ------------------------------------------------------------ pointer input
  const toWorld = e => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, px: e.clientX, py: e.clientY }; };
  const actorAt = (x, y) => [...actors].sort((a, b) => b.y - a.y).find(a => { const k = petScale(a) * 0.5; return Math.abs(a.x - x) < 0.12 * k * 1.6 && y <= a.y + 0.01 && y >= a.y - 0.3 * k / aspect * 1.6; });
  canvas.addEventListener('pointerdown', e => {
    const w = toWorld(e); canvas.setPointerCapture?.(e.pointerId);
    const now = performance.now();
    if (edit) { const hit = Room.hitTest(edit.draft, w.x, w.y, aspect); edit.selected = hit?.uid || null; drawEditBar(); if (hit) drag = { kind: 'furniture', uid: hit.uid, dx: hit.x - w.x, dy: hit.y - w.y }; return; }
    // the ball (finger radius generous)
    if (!ball.heldBy && Math.hypot(ball.x - w.x, (ball.y - ball.h / aspect - w.y) * aspect) < 0.07) { drag = { kind: 'ball', samples: [[now, w.x, w.y]] }; ball.state = 'grabbed'; ball.vx = ball.vy = ball.vh = 0; return; }
    if (foodArmed) { dropFood(foodArmed, w.x, Math.max(w.y, FY)); foodArmed = null; drawDock(); return; }   // food goes where you tap, even at a Poka's feet
    const a = actorAt(w.x, w.y);
    if (a) { drag = { kind: 'pet', a, start: w, t0: now, path: 0, last: w }; drag.hold = setTimeout(() => { if (drag?.kind === 'pet' && drag.path < 0.03) { const d = drag; drag = null; petMenu(d.a, w.px, w.py); } }, 550); return; }
    const toy = Room.hitTest(room().filter(p => p.cat === 'toy' && p.obj !== 'ball'), w.x, w.y, aspect, 0.03);
    if (toy) { drag = { kind: 'toy', uid: toy.uid }; return; }
    const furn = Room.hitTest(room().filter(p => p.cat !== 'toy'), w.x, w.y, aspect);
    if (furn) { drag = { kind: 'press', t0: now, hold: setTimeout(() => { drag = null; startEdit(furn.uid); }, 600) }; }
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return; const w = toWorld(e), now = performance.now();
    if (drag.kind === 'ball') { ball.x = clamp(w.x, 0.05, 0.95); ball.h = clamp((0.93 - w.y) * aspect * 0.6, 0, 0.5); ball.y = clamp(Math.max(w.y, 0.72), Phys.BOUNDS.y0, Phys.BOUNDS.y1); drag.samples.push([now, w.x, w.y]); drag.samples = drag.samples.filter(s => now - s[0] < 160); }
    else if (drag.kind === 'furniture') { Room.move(edit, drag.uid, w.x + drag.dx, w.y + drag.dy, aspect); }
    else if (drag.kind === 'toy') { const t = room().find(p => p.uid === drag.uid); if (t) { t.x = clamp(w.x, 0.08, 0.92); t.y = clamp(w.y, FY, 0.965); } }   // in memory; saved once on release
    else if (drag.kind === 'pet') { drag.path += Math.hypot(w.x - drag.last.x, (w.y - drag.last.y) * aspect); drag.last = w; }
  });
  const endDrag = e => {
    if (!drag) return; const d = drag; drag = null; clearTimeout(d.hold); const w = e ? toWorld(e) : null, now = performance.now();
    if (d.kind === 'ball') {
      const s0 = d.samples[0], s1 = d.samples[d.samples.length - 1] || s0;
      const dx = s1[1] - s0[1], dy = (s1[2] - s0[2]) * aspect, ms = Math.max(16, s1[0] - s0[0]);
      if (Math.hypot(dx, dy) < 0.02) { ball.state = 'rest'; ball.h = 0; say('Drag the ball and let go to throw it.', 2200); return; }
      Phys.throwFromDrag(ball, dx, dy, ms); sfx.tap?.(); haptic('light');
      track('interact_used', { tool: 'ball', reactions: 'thrown', pets: actors.length, power: ball.power });
      update(x => V.note(x, 'interacts')); tutorial('thrown');
    } else if (d.kind === 'pet' && w) {
      const kind = d.path > 0.06 ? 'stroke' : now - d.t0 < 450 ? 'tap' : null; if (kind) touchPet(d.a, kind); tutorial('touched');
    } else if (d.kind === 'toy') {
      const t = room().find(p => p.uid === d.uid); if (t) { update(() => {}); remember('toy', [], { toy: t.obj }); for (const a of actors) a.until = Math.min(a.until, performance.now() + 600); say(`${Room.FURNITURE[t.obj].name} placed — who will notice it?`, 2200); }
    }
  };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', () => { if (drag?.kind === 'ball') { ball.state = 'rest'; ball.h = 0; } clearTimeout(drag?.hold); drag = null; });

  // ------------------------------------------------------------ simulation
  function tick(now) {
    const s = get(), scene = sc(); lastTick = now;
    for (const a of actors) {
      if (now < a.until || (a.s && CUSTOM.has(a.s.kind))) continue;
      a.lane = LANES[actors.indexOf(a)] ?? 0.86;
      // a free toy in the room sometimes catches a Poka's eye
      const toys = room().filter(p => p.cat === 'toy' && p.obj !== 'ball' && !p.heldBy);
      if (toys.length && Math.random() < 0.22) {
        const t = toys[Math.floor(Math.random() * toys.length)], holder = actors.find(o => o.carry === t.uid);
        const act = B.reactToToy({ ...a.pet, mood: a.mood }, holder?.pet.id || null, holder ? W.relation(s, a.pet.id, holder.pet.id).type : null);
        a.until = now + 7000; a.beh = { id: 'toy', reaction: act, object: t.obj }; a.t0 = now;
        if (act === 'approach' || act === 'carry') a.s = { kind: 'carryToy', uid: t.uid, carry: act === 'carry', until: now + 6000 };
        else if (act === 'hide') a.s = { kind: 'hide', uid: t.uid, until: now + 7000 };
        else { a.s = { kind: 'hold', pose: 'yawn' }; a.until = now + 2500; }
        remember('toy', [{ id: a.pet.id, action: act }], { toy: t.obj });
        continue;
      }
      const others = actors.filter(o => o !== a).map(o => o.pet);
      const b = W.pickBehavior(s, a.pet, scene, others);
      a.until = now + 3400 + Math.random() * 2600;
      const partner = b.with ? actorOf(b.with) : null; if (partner && !CUSTOM.has(partner.s?.kind)) partner.until = a.until;
      worldChoreo = {}; Choreo.start(a, b, actors, { ...scene, OBJECTS }, now);
      if (b.duo && b.with && Choreo.moodOf(a.mood).social > 0) update(x => { W.bond(x, a.pet.id, b.with, b.id === 'race' || b.id === 'tug' || b.id === 'chase' ? 'rival' : b.id === 'practice_together' || b.id === 'teach' ? 'train' : 'play', 0.2); });
      if (!moment && now > nextMomentAt) { const r = W.momentRoll(s, b, scene); if (r && r !== 'common') openMoment(r); }
    }
    if (moment && now > momentUntil) closeMoment();
    bowls = bowls.filter(b => now < b.until && b.bites > 0);
    if (dirty && now - dirty > 1500) { dirty = 0; }
  }
  function goTo(a, tx, ty, speed, dt) {
    const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy * 1.4), sp = 0.3 * speed * Choreo.moodOf(a.mood).speed;
    if (d < 0.012) { a.vx = 0; a.gait = 0; return true; }
    const stepv = Math.min(d, sp * dt); a.x = clamp(a.x + dx / d * stepv, 0.13, 0.87); a.y = clamp(a.y + dy / d * stepv, FY, 0.965);
    a.vx = dx / d * sp; a.gait = Math.min(1, sp / 0.3); a.flip = dx >= 0 ? 1 : -1; return false;
  }
  function stepCustom(a, dt, now) {
    const s = a.s; a.fx = a.fx?.filter(f => f === 'hearts') || [];
    switch (s.kind) {
      case 'go': if (goTo(a, s.x, s.y, s.speed || 1, dt)) { a.pose = s.then || 'idle'; a.gait = 0; if (s.next) { a.s = { ...s.next, start: now }; } else if (now > a.until) a.s = null; } else a.pose = a.gait > 0.7 ? 'leap' : 'idle'; break;
      case 'watchBall': a.flip = ball.x > a.x ? 1 : -1; a.pose = s.pose || 'look'; a.gait = 0;
        if (s.joinAfter && now > (s.start || 0)) { const f = actorOf(s.joinAfter); if (!f || f.s?.kind === 'chaseBall' || now - s.start > 800) { a.s = { kind: 'chaseBall', speed: 1.3, start: now, act: 'join' }; a.beh.reaction = 'chase'; } }
        if (now > a.until) a.s = null; break;
      case 'chaseBall': {
        if (now < s.start) { a.pose = 'bow'; a.flip = ball.x > a.x ? 1 : -1; break; }
        if (s.afterLand && ball.state === 'flying') { a.pose = 'look'; break; }
        if (ball.heldBy) { a.s = { kind: 'watchBall', pose: 'surprised' }; a.until = now + 1800; break; }
        const arrived = goTo(a, ball.x, ball.y, s.speed || 1.4, dt); a.pose = a.gait > 0.6 ? 'leap' : 'idle';
        if ((arrived || Math.hypot(ball.x - a.x, (ball.y - a.y) * 1.4) < 0.07) && ball.h < 0.06) grabBall(a);   /* a Poka reaches the ball, even against a wall */ if (now > a.until) a.s = null; break; }
      case 'returnBall': if (goTo(a, 0.5, 0.95, 1.1, dt)) { Phys.drop(ball, 0.5, 0.95); a.pose = 'happy'; a.s = { kind: 'hold', pose: 'happy' }; a.until = now + 2000; say(`${a.pet.name} brings the ball back!`, 2000); persistBall(); } else a.pose = 'catch'; ball.x = a.x + a.flip * 0.035; ball.y = a.y; break;
      case 'carryBall': ball.x = a.x + a.flip * 0.035; ball.y = a.y; a.pose = 'happy'; if (now > s.until) { Phys.drop(ball, ball.x, ball.y); a.s = null; persistBall(); } break;
      case 'keepAway': { const o = actors.filter(x => x !== a).sort((p, q) => Math.abs(p.x - a.x) - Math.abs(q.x - a.x))[0]; const tx = o ? (o.x < a.x ? 0.9 : 0.1) : a.x; goTo(a, tx, a.y, 1.3, dt); a.pose = 'wink'; ball.x = a.x + a.flip * 0.035; ball.y = a.y;
        if (now > s.until) { Phys.drop(ball, ball.x, ball.y); a.s = { kind: 'hold', pose: 'wink' }; a.until = now + 1500; persistBall(); } break; }
      case 'eat': { const bw = bowls[0]; if (!bw) { a.s = null; break; } if (now < (s.start || 0)) { a.pose = 'sit'; a.flip = bw.x > a.x ? 1 : -1; break; }
        if (goTo(a, s.x, s.y, s.act === 'rush' ? 1.5 : 1.1, dt)) { a.flip = bw.x > a.x ? 1 : -1; a.pose = s.act === 'steal' ? 'wink' : s.act === 'guard_food' ? 'wink' : 'happy';
          if (!bw.eaters.has(a.pet.id)) { bw.eaters.add(a.pet.id); bw.bites--; update(x => { const f = (x.v21.fed = x.v21.fed || {}); f[a.pet.id] = Date.now(); const c = (x.v21.petAt = x.v21.petAt || {}); if (Date.now() - (c['food:' + a.pet.id] || 0) > 6e5) { c['food:' + a.pet.id] = Date.now(); W.careAction(x, a.pet.id, 'care'); } }); }
          if (now > a.until) a.s = null; } else a.pose = 'idle'; break; }
      case 'sniff': if (goTo(a, s.x, s.y, 0.9, dt)) { a.pose = 'sniff'; if (!s.at) s.at = now; if (now - s.at > 1200) { a.s = { kind: 'go', x: clamp(a.x + (Math.random() < 0.5 ? -0.2 : 0.2), 0.1, 0.9), y: a.y, then: s.then || 'confused' }; } } break;
      case 'beg': if (goTo(a, 0.5, 0.95, 1, dt)) { a.pose = 'sitpretty'; if (now > a.until) a.s = null; } break;
      case 'carryToy': { const t = room().find(p => p.uid === s.uid); if (!t) { a.s = null; break; }
        if (a.carry !== t.uid) { if (goTo(a, t.x, t.y, 1.1, dt)) { const holder = actors.find(o => o !== a && o.carry === t.uid); if (holder) { a.pose = 'catch'; a.beh.reaction = 'tug'; } else if (s.carry) { a.carry = t.uid; } else { a.pose = 'sniff'; } } else a.pose = 'idle'; }
        else { goTo(a, clamp(a.x + Math.sin(now / 900) * 0.2, 0.1, 0.9), a.lane, 0.8, dt); t.x = a.x + a.flip * 0.04; t.y = a.y; a.pose = 'happy'; }
        if (now > s.until) { if (a.carry) { a.carry = null; update(x => { const p = x.v21.rooms[loc.id].find(o => o.uid === t.uid); if (p) { p.x = +t.x.toFixed(3); p.y = +t.y.toFixed(3); } }); } a.s = null; } break; }
      case 'hide': { const t = room().find(p => p.uid === s.uid), f = room().filter(p => p.cat === 'floor' && !Room.FURNITURE[p.obj].flat).sort((p, q) => Math.abs(p.x - a.x) - Math.abs(q.x - a.x))[0];
        if (!t || !f) { a.s = null; break; }
        if (!s.got) { if (goTo(a, t.x, t.y, 1.2, dt)) { s.got = true; a.carry = t.uid; } a.pose = 'idle'; }
        else { if (goTo(a, f.x, Math.max(FY, f.y - 0.02), 1.2, dt)) { a.pose = 'peek'; a.hidden = f.uid; } t.x = a.x; t.y = a.y; }
        if (now > s.until) { a.carry = null; a.hidden = null; update(x => { const p = x.v21.rooms[loc.id].find(o => o.uid === t.uid); if (p) { p.x = +clamp(t.x, 0.08, 0.92).toFixed(3); p.y = +clamp(t.y, FY, 0.965).toFixed(3); } }); a.s = null; } break; }
    }
  }
  function stepAll(now, dt) {
    for (const ev of Phys.step(ball, dt)) { if (ev === 'landed') { ballLanded(); sfx.tap?.(); } if (ev === 'rest') persistBall(); }
    for (const a of actors) {
      if (a.s && CUSTOM.has(a.s.kind)) stepCustom(a, dt, now);
      else { Choreo.step(a, dt, now, worldChoreo); a.y = a.y + ((a.lane ?? 0.86) - a.y) * Math.min(1, dt * 2); }
    }
    const close = new Set(['snuggle', 'tug', 'turns', 'drill', 'chase', 'flee', 'race', 'chaseBall', 'eat']);
    for (const a of actors) for (const b of actors) if (a !== b && !(close.has(a.s?.kind) && close.has(b.s?.kind))) { const d = a.x - b.x; if (Math.abs(d) < 0.1 && Math.abs(a.y - b.y) < 0.04) a.x = clamp(a.x + (d >= 0 ? 1 : -1) * dt * 0.08, 0.08, 0.92); }
  }

  // ------------------------------------------------------------ drawing
  const petScale = a => (actors.length > 2 ? 0.82 : actors.length > 1 ? 0.9 : 1) * Room.depthScale(a.y) * 1.05;
  function heart(x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y + r); ctx.bezierCurveTo(x - r * 2, y - r * .4, x - r * .8, y - r * 1.8, x, y - r * .6); ctx.bezierCurveTo(x + r * .8, y - r * 1.8, x + r * 2, y - r * .4, x, y + r); ctx.fill(); }
  function drawBowl(b, t) { const X = WW * b.x, Y = HH * b.y, s = Room.depthScale(b.y); ctx.save(); ctx.translate(X, Y); ctx.scale(s, s); ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.beginPath(); ctx.ellipse(0, 4, 60, 12, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#5ec8f2'; ctx.beginPath(); ctx.moveTo(-56, -34); ctx.lineTo(56, -34); ctx.lineTo(40, 0); ctx.lineTo(-40, 0); ctx.closePath(); ctx.fill();
    const col = { kibble: '#c98a4b', fish: '#9ec9e8', carrot: '#ff8a2a', cookie: '#e8b465' }[b.food] || '#c98a4b';
    ctx.fillStyle = col; for (let i = 0; i < b.bites * 2; i++) { ctx.beginPath(); ctx.arc(-34 + i * 10, -38 - (i % 2) * 6, 8, 0, 7); ctx.fill(); } ctx.restore(); }
  function draw(now) {
    const t = now / 1000, list = room();
    ctx.clearRect(0, 0, WW, HH);
    const scene = LOCATIONS.find(l => l.id === loc.id).scene;
    // the scene art's ground line (~62 % of its height) is placed on the world's floor line; the floor continues below it
    const Hb = HH * Room.FLOOR / 0.63, key = loc.id === 'living_room' ? 'homeland_living_room' : scene;
    ctx.save(); drawBackdrop(ctx, { draw: key }, WW, Hb, t); ctx.restore();
    if (!floorCol[key]) { try { const d = ctx.getImageData(WW / 2, Math.floor(Hb) - 3, 1, 1).data; floorCol[key] = `rgb(${d[0]},${d[1]},${d[2]})`; } catch (e) { floorCol[key] = '#e9c9a8'; } }
    ctx.fillStyle = floorCol[key]; ctx.fillRect(0, Hb - 1, WW, HH - Hb + 1);
    const px = p => WW * p.x, py = p => HH * p.y, size = p => { const f = Room.FURNITURE[p.obj], s = Room.scaleOf(p); return [WW * f.w * s, WW * f.h * s]; };
    // walls and rugs first, then everything standing on the floor sorted by depth (Pokas included)
    for (const p of list.filter(p => p.z <= 1).sort((a, b) => a.z - b.z)) { const [w, hh] = size(p); drawFurniture(ctx, p.obj, px(p), py(p), w, hh, p.rot, { selected: edit?.selected === p.uid }); }
    const items = [...list.filter(p => p.z > 1 && p.obj !== 'ball' && !actors.some(a => a.carry === p.uid)).map(p => ({ y: p.y, p })), ...actors.map(a => ({ y: a.y + (a.hidden ? -0.03 : 0), a })), ...bowls.map(b => ({ y: b.y - 0.001, b })), { y: ball.y + 0.001, ball: true }];
    for (const it of items.sort((a, b) => a.y - b.y)) {
      if (it.p) { const [w, hh] = size(it.p); drawFurniture(ctx, it.p.obj, px(it.p), py(it.p), w, hh, it.p.rot, { selected: edit?.selected === it.p.uid, ghost: !!edit }); }
      else if (it.b) drawBowl(it.b, t);
      else if (it.ball) { const s = Room.depthScale(ball.y) * 60 * 1.1, X = WW * ball.x, Y = HH * ball.y - ball.h * WW;
        ctx.fillStyle = 'rgba(0,0,0,.16)'; ctx.beginPath(); ctx.ellipse(X, HH * ball.y + 2, s * 0.45 * (1 - Math.min(0.5, ball.h)), 8, 0, 0, 7); ctx.fill();
        drawFurniture(ctx, 'ball', X, Y, s, s, 0, { noShadow: true, selected: edit?.selected === ballObj?.uid });
        if (ball.state === 'rest' && !edit && !recent.length) { ctx.save(); ctx.globalAlpha = 0.35 + Math.sin(t * 3) * 0.25; ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(X, Y - s / 2, s * 0.75, 0, 7); ctx.stroke(); ctx.restore(); } }
      else { const a = it.a, m = Choreo.moodOf(a.mood), k = petScale(a) * (m.curl ? 0.92 : 1);
        const stride = a.gait ? Math.abs(Math.sin(now / (a.gait > 0.7 ? 70 : 120))) * (a.gait > 0.7 ? 22 : 10) * a.gait : 0;
        ctx.save(); ctx.translate(WW * (a.x + (a.tug || 0)), HH * a.y - stride); ctx.scale(k * (a.flip || 1), k); ctx.rotate((a.gait || 0) * 0.06);
        if (m.dim) ctx.filter = `saturate(${1 - m.dim}) brightness(${1 - m.dim * 0.25})`;
        drawPet(ctx, a.pet, a.pose, { t: now / 1000 * (0.5 + m.speed * 0.5) + a.x * 3, blink: m.curl || Math.sin(now / 700 + a.x * 9) > 0.97, alive: true, gait: a.gait || 0 });
        ctx.restore();
        if ((a.fx || []).includes('hearts')) for (let i = 0; i < 3; i++) { const yy = HH * a.y - 330 * k - ((t * 40 + i * 40) % 120); ctx.save(); ctx.globalAlpha = 1 - ((t * 40 + i * 40) % 120) / 120; heart(WW * a.x + (i - 1) * 30, yy, 14, '#ff5f8f'); ctx.restore(); } }
    }
    const T = TIMES_OF_DAY.find(x => x.id === sc().time); if (T?.tint) { ctx.fillStyle = T.tint; ctx.fillRect(0, 0, WW, HH); }
    if (sc().season === 'autumn') for (let i = 0; i < 10; i++) { ctx.save(); ctx.translate((i * 97 + now / 30) % WW, (i * 61 + now / 12) % (HH * 0.7)); ctx.rotate(i + now / 900); ctx.fillStyle = ['#e8812f', '#c9384f', '#f2b233'][i % 3]; ctx.beginPath(); ctx.ellipse(0, 0, 10, 5, 0, 0, 7); ctx.fill(); ctx.restore(); }
  }
  function loop(now) {
    if (!alive || paused) return;
    const dt = Math.min(0.05, (now - (lastFrame || now)) / 1000); lastFrame = now;
    if (now - lastTick > 250) tick(now);
    stepAll(now, dt); draw(now);
    raf = requestAnimationFrame(loop);
  }
  const onVis = () => { if (document.hidden) { paused = true; cancelAnimationFrame(raf); } else if (paused && alive) { paused = false; lastFrame = 0; raf = requestAnimationFrame(loop); } };
  document.addEventListener('visibilitychange', onVis);

  // ------------------------------------------------------------ SNAP (the ONE shutter lives in the nav)
  async function doSnap() {
    if (edit) { toast('Finish editing the room first (✓ Done or Cancel).'); return; }
    if (doSnap.busy) return; doSnap.busy = true;
    try {
      const now = performance.now(), s = get(), scene = sc();
      sfx.shutter(); haptic('heavy'); stage.classList.remove('flash21'); void stage.offsetWidth; stage.classList.add('flash21');
      const subjects = actors.map(a => a.pet.id), poses = Object.fromEntries(actors.map(a => [a.pet.id, a.pose])), lead = actors[0];
      const captured = moment && now < momentUntil ? moment : null;
      const fresh = recent.filter(r => now - r.at < 6000), last = fresh[fresh.length - 1];
      const reactions = [...new Set(actors.map(a => a.beh?.reaction).filter(Boolean))];
      const reaction = actors.map(a => a.beh?.reaction).find(Boolean) || null;
      const toyP = actors.map(a => a.carry && room().find(p => p.uid === a.carry)).find(Boolean);
      const toy = toyP?.obj || (fresh.some(r => r.kind === 'ball' || r.kind === 'catch') ? 'ball' : fresh.find(r => r.toy)?.toy) || null;
      const food = bowls[0] && fresh.some(r => r.kind === 'food') ? bowls[0].food : null;
      const onF = room().filter(p => p.cat !== 'toy' && p.cat !== 'wall').map(p => ({ p, d: Math.hypot(p.x - lead.x, (p.y - lead.y) * 2) })).sort((a, b) => a.d - b.d)[0];
      const relationType = subjects.length > 1 ? W.relation(s, subjects[0], subjects[1]).type : null;
      const rarity = W.momentRarity({ puzzle: null, rolled: captured?.rarity, subjects, relationType, object: null, time: scene.time });
      // quality = observation + timing: something happening, framing, the reaction at its peak
      const active = actors.filter(a => a.pose !== 'idle').length / actors.length;
      const inFrame = actors.every(a => a.x > 0.12 && a.x < 0.88) ? 6 : -8;
      const el = last ? (now - last.at) / 1000 : 99, timing = el >= 0.6 && el <= 3.5;
      const quality = clamp(Math.round(34 + active * 14 + (captured ? 14 : 0) + (subjects.length > 1 ? 5 : 0) + (timing ? 12 : last ? 4 : 0) + inFrame + (toy || food ? 6 : 0) + Math.random() * 6), 25, 100);   // a great shot needs a moment + timing, not just three Pokas
      const stars = starsFor(quality);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.88));
      const id = 'w' + Date.now().toString(36);
      const favFood = food && actors.some(a => a.pet.favFood === food && a.beh?.reaction && a.beh.id === 'food');
      const meta = { id, missionId: `world:${loc.id}`, score: quality, stars, poseId: lead.pose, poses, location: loc.id, time: scene.time, season: scene.season, subjects, rarity, relationType,
        reaction, reactions, toy, food, favFood, onFurniture: onF && onF.d < 0.16 ? onF.p.obj : null, indoor: indoor(), duo: actors[0].s?.kind || null, divergent: !!last?.plans && B.divergent(last.plans),
        roomEdited: Date.now() - (s.v21.roomEditedAt || 0) < 864e5, timing, interaction: !!last, petName: lead.pet.name, dressed: actors.filter(a => Object.keys(a.pet.equipped || {}).length).length };
      let rec;
      update(x => { rec = W.recordPhoto(x, meta); grantXP(x, 10); for (const pid of subjects) W.careAction(x, pid, 'photo'); });
      await album.add({ id, blob, petName: actors.map(a => a.pet.name).join(' & '), missionID: `world:${loc.id}`, missionTitle: loc.name, score: quality, poseId: lead.pose, caption: captured ? 'Caught it!' : '', fav: false, rare: rarity !== 'common' ? RARITY_LABEL[rarity] : null });
      track('world_snap', { quality, rarity, tool: last?.kind || 'none', pets: subjects.length, sp: rec.v2?.sp?.total || 0 });
      closeMoment();
      showResult(blob, quality, stars, rarity, rec);
    } finally { doSnap.busy = false; }
  }
  function showResult(blob, quality, stars, rarity, rec) {
    const v = rec.v2 || {}, sp = v.sp || { base: 0, items: [], total: 0 }, a21 = v.album || {}, ev = v.event, feed = v.feed;
    const url = URL.createObjectURL(blob);
    const layer = h('div', { class: 'levelup snap-result r21' }, h('div', { class: 'card homeland-result' },
      h('img', { src: url, alt: 'Your photo', class: 'hl-photo' }),
      h('div', { class: 'photo-dims' },
        h('div', {}, h('small', {}, 'SCORE'), h('b', {}, `${quality}`)),
        h('div', {}, h('small', {}, 'RATING'), h('b', { class: 'stars-row' }, STAR_TEXT(stars))),
        h('div', {}, h('small', {}, 'MOMENT'), h('b', { style: `color:${RARITY_COLOR[rarity]}` }, RARITY_LABEL[rarity].toUpperCase()))),
      h('div', { class: 'sp-box', 'aria-label': `Snap Points: ${sp.total}` },
        h('div', { class: 'sp-total' }, h('span', {}, '⚡'), h('b', {}, `+${sp.total} SP`)),
        h('div', { class: 'sp-lines' }, h('span', {}, `Photo score ${sp.base}`), ...sp.items.map(i => h('span', {}, `${i.label} +${i.n}`)), sp.capped ? h('span', { class: 'cap' }, `Bonuses capped at +${C.SP_BONUS_CAP}`) : null)),
      ev ? h('p', { class: 'reward-line ev-line' }, feed?.made ? `${ev.icon} +${feed.made} ${feed.made === 1 ? ev.currency.replace(/s$/, '') : ev.currency}! ` : `${ev.icon} ${ev.title}: `, h('b', {}, `${ev.per - feed?.toNext} / ${ev.per} SP`), ` to the next ${ev.currency.replace(/s$/, '')}`) : null,
      a21.slot ? h('div', { class: 'album-unlock' }, h('div', { class: 'au-card' }, h('img', { src: url, alt: '' }), h('span', {}, a21.slot.slotName)), h('div', {}, h('small', {}, 'NEW ALBUM PHOTO'), h('b', {}, `${a21.slot.setIcon} ${a21.slot.setName}`), h('span', { class: 'small' }, a21.slot.slotName)))
        : a21.duplicate ? h('p', { class: 'small dup-line' }, `Already in your Album — duplicate +${C.DUPLICATE_SP} SP.`) : a21.capped ? h('p', { class: 'small dup-line' }, `📖 Today's ${C.SEASON.dailyNew} new Album photos are in — this moment will count again tomorrow.`) : null,
      v.wins?.length ? h('p', { class: 'reward-line' }, `🏆 Win ready: ${v.wins[0]}${v.wins.length > 1 ? ` (+${v.wins.length - 1})` : ''}`) : null,
      h('p', { class: 'small' }, quality < 70 ? (recent.length ? 'Tip: snap the reaction a beat after it starts.' : 'Tip: throw the ball or put food down — then snap what happens.') : 'Great shot!'),
      h('div', { class: 'res-actions' },
        a21.slot ? h('button', { class: 'btn ghost', onclick: () => { layer.remove(); app.go('album', { set: a21.slot.set }); } }, '📖 ALBUM') : null,
        ev ? h('button', { class: 'btn ghost', onclick: () => { layer.remove(); app.go('event21'); } }, `${ev.icon} EVENT`) : null,
        h('button', { class: 'btn', onclick: () => { layer.remove(); drawHud(); drawEvent(); tutorial('snapped'); } }, 'KEEP PLAYING'))));
    document.body.append(layer);
    if (a21.setComplete) setTimeout(() => celebrateSet(app, a21.slot.set, a21.seasonComplete), 900);
  }

  // ------------------------------------------------------------ first session: throw → react → SNAP
  function tutorial(step) {
    const t = get().v2.tut21 || {}; if (t.done) return;
    const set = (text, auto) => { fill(coach, h('span', {}, text), h('button', { class: 'linkbtn', onclick: () => { update(x => { x.v2.tut21 = { done: Date.now() }; }); coach.hidden = true; } }, 'Skip')); coach.hidden = false; if (auto) setTimeout(() => { coach.hidden = true; }, auto); };
    if (step === 'start') set('Touch the ball, drag, and let go to throw it 🎾');
    else if (step === 'thrown' || step === 'touched') set('Watch how each Poka reacts — then press the big SNAP button! 📸');
    else if (step === 'snapped') { update(x => { x.v2.tut21 = { done: Date.now() }; }); set('Great photos earn Snap Points for the current event, and fill your Album.', 4500); }
  }

  // ------------------------------------------------------------ go
  window.__snapAction = () => doSnap();
  buildWorld(); drawHud(); drawDock(); drawEvent(); setSnapState('ready'); raf = requestAnimationFrame(loop); tutorial('start');
  const evTimer = setInterval(drawEvent, 30000);
  window.PokaWorld = {   // QA hook (logged by every harness that uses it)
    state: () => ({ loc: loc.id, aspect: +aspect.toFixed(3), ball: { x: +ball.x.toFixed(3), y: +ball.y.toFixed(3), h: +ball.h.toFixed(3), state: ball.state, heldBy: ball.heldBy }, bowls: bowls.length, edit: !!edit,
      actors: actors.map(a => ({ id: a.pet.id, name: a.pet.name, personality: a.pet.personality, trait: a.pet.trait, x: +a.x.toFixed(3), y: +a.y.toFixed(3), pose: a.pose, kind: a.s?.kind || null, reaction: a.beh?.reaction || null, carry: a.carry || null })) }),
    ballScreen: () => { const r = canvas.getBoundingClientRect(); return { x: r.left + ball.x * r.width, y: r.top + (ball.y - ball.h / aspect) * r.height - Room.depthScale(ball.y) * 30 * r.width / WW }; },
    petScreen: i => { const a = actors[i], r = canvas.getBoundingClientRect(); return a ? { x: r.left + a.x * r.width, y: r.top + (a.y - 0.08 * petScale(a) / aspect) * r.height } : null; },
    furnitureScreen: obj => { const p = room().find(o => o.obj === obj), r = canvas.getBoundingClientRect(); if (!p) return null; const b = Room.bbox(p, aspect); return { x: r.left + p.x * r.width, y: r.top + ((b.y0 + b.y1) / 2) * r.height, uid: p.uid, rot: p.rot, px: p.x, py: p.y }; },
    forceMoment: (r = 'rare') => openMoment(r), snap: () => doSnap(),
  };
  return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); clearInterval(evTimer); document.removeEventListener('visibilitychange', onVis); clearTimeout(say.t); clearTimeout(persistBall.t); delete window.PokaWorld; if (window.__snapAction) delete window.__snapAction; };
}
