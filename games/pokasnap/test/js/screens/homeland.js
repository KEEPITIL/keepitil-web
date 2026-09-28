/* SNAP — the living Poka world (2.0). Evolved from the 1.4 Homeland, which it replaces.
   ---------------------------------------------------------------------------
   The world is the interface: Pokas act on their own (game/world.js pickBehavior +
   game/choreo.js), the player influences them with INTERACT (game/v2.js reactTo — the same
   input, different personalities, different outcomes) and captures what emerges with SNAP.
   A reward-bearing SNAP spends one Snap Turn; at zero turns photos are still taken and kept.
   One photo reaches every system through world.recordPhoto() -> v2.onPhoto().
   Layout (top→bottom): compact HUD · world (most of the screen) · INTERACT | SNAP | EVENT
   with turns under SNAP · the permanent five-button bar. Nothing floats over the Pokas
   except one calm moment banner. */

import { h, toast, sheet, plural, fmt } from '../ui.js';
import { get, update } from '../game/state.js';
import { LOCATIONS, OBJECTS, TIMES_OF_DAY, PUZZLES, RELATION_TYPES, RARITY_ORDER, objectArt } from '../data/world.js';
import * as W from '../game/world.js';
import * as V from '../game/v2.js';
import { drawPet } from '../render/pet.js';
import { drawProp, drawBackdrop } from '../render/items.js';
import * as Choreo from '../game/choreo.js';
import { item as itemOf } from '../data/items.js';
import { SPECIES } from '../data/pets.js';
import { starsFor, STAR_TEXT } from '../data/progression.js';
import { grantXP, levelProgress } from '../game/progress.js';
import * as album from '../game/album.js';
import { track } from '../platform/analytics.js';
import { sfx } from '../platform/sound.js';
import { haptic } from '../platform/native.js';
import { navBar, currencyPills } from './nav.js';

const SCENE_W = 900, SCENE_H = 1200;
// world x (0.14..0.86) -> drawn x: keeps every Poka's whole body inside the visible stage, even when the stage crops the sides
const sx = x => 0.5 + (x - 0.5) * 0.84;
const RARITY_LABEL = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', legendary: 'Legendary' };
export const RARITY_COLOR = { common: '#9aa3ad', uncommon: '#3fae78', rare: '#2f86c0', legendary: '#d4a017' };
const EVENT_STAGE = { race: 'Poka Race — snap the finish line!', treasure: 'Treasure Hunt — snap the find!', garden: 'Community Garden — snap it for the team!', pose: 'Friend Challenge — catch a happy pose!', rare: 'Rare Moment Hunt — be ready!' };

export function homelandScreen(app, opts = {}) {
  let st = get();
  const open = W.locationsOpen(st);
  if (!open.length || !W.activePets(st).length) { app.go('poka'); return; }
  update(x => { V.ensureV2(x); V.settleTurns(x); });
  let loc = open.find(l => l.id === (opts.loc || get().v2.loc)) || open[0];
  track('homeland_entered', { location: loc.id });
  const canvas = h('canvas', { width: SCENE_W, height: SCENE_H, class: 'homeland-canvas world-canvas', 'aria-label': 'Your Pokas\' world. They move on their own; tap a Poka to pet it, use INTERACT to influence them, and SNAP to photograph a moment.' });
  const banner = h('div', { class: 'moment-banner', role: 'status', 'aria-live': 'polite' }); banner.hidden = true;
  const bubble = h('div', { class: 'react-bubble', role: 'status', 'aria-live': 'polite' }); bubble.hidden = true;
  const hintBox = h('div', { class: 'hint-chip' });
  const tabs = h('div', { class: 'loc-tabs', role: 'tablist', 'aria-label': 'Locations' });
  const info = h('div', { class: 'loc-info small' });
  const coach = h('div', { class: 'coach', role: 'note' }); coach.hidden = true;
  let actors = [], world = {}, staged = null, moment = null, momentUntil = 0, nextMomentAt = performance.now() + 9000, raf = 0, alive = true, lastTick = 0;
  let drops = [], interact = null, stageEvent = null, paused = false;

  const scene = () => W.locationState(get(), loc.id);
  function buildActors() {
    const s = get(), pets = W.activePets(s);
    actors = pets.map((p, i) => ({ pet: p, x: 0.22 + i * 0.28, vx: 0, y: [0.9, 0.84, 0.78][i] ?? 0.86, lane: [0.9, 0.84, 0.78][i] ?? 0.86, pose: 'idle', beh: null, until: 0, flip: i % 2 ? -1 : 1, mood: W.careState(s, p.id).id, s: null, fx: [] }));
    world = {}; drops = [];
  }
  function drawTabs() {
    const s = get();
    tabs.replaceChildren(...LOCATIONS.map(l => { const ok = (s.progress.level || 1) >= l.level;
      return h('button', { class: (l.id === loc.id ? 'on' : '') + (ok ? '' : ' locked'), role: 'tab', 'aria-selected': String(l.id === loc.id), 'aria-label': ok ? l.name : `${l.name}, opens at level ${l.level}`, onclick: () => ok ? (loc = l, update(x => { W.ensure(x); V.ensureV2(x).loc = l.id; (x.world.locations[l.id] = x.world.locations[l.id] || { visits: 0, photos: 0, placed: [] }).visits++; }), track('homeland_entered', { location: l.id }), buildActors(), refresh()) : toast(`${l.name} opens at level ${l.level}`) },
        ok ? l.icon : '🔒', h('span', {}, l.name)); }));
  }
  function refresh() {
    drawTabs(); drawHud(); drawCluster();
    const sc = scene(), s = get(), open = PUZZLES.filter(p => p.location === loc.id && !s.world?.puzzles?.[p.id]?.solved);
    // show the puzzle the player has been working on (most attempts) first
    const pz = open.sort((a, b) => (s.world?.puzzles?.[b.id]?.attempts || 0) - (s.world?.puzzles?.[a.id]?.attempts || 0))[0];
    info.replaceChildren(`${sc.icon} ${sc.name} · ${sc.time} · ${sc.season}`, ` · ${plural(actors.length, 'Poka')}`);
    hintBox.replaceChildren(...(pz ? [h('b', {}, `🧩 ${pz.name}`), h('span', {}, ` ${W.hintFor(s, pz).text}`), h('small', {}, ` (hint ${W.hintFor(s, pz).level}/3)`), open.length > 1 ? h('small', {}, ` · +${open.length - 1} more here`) : null] : [h('span', {}, '✨ Every puzzle here is solved — keep snapping for Rare Moments.')]).filter(Boolean));   // null would render as the text "null"
  }

  // ------------------------------------------------------------ HUD + control cluster
  const hud = h('div', { class: 'hud' });
  function drawHud() {
    const s = get(), lp = levelProgress(s.progress.xp || 0), ev = V.currentEvent2(s);
    hud.replaceChildren(
      h('button', { class: 'hud-me', 'aria-label': 'Menu: settings, shop, music, help and more', onclick: menu }, h('span', { class: 'hud-av', 'aria-hidden': 'true' }, SPECIES[s.pet?.species]?.animal === 'dog' ? '🐶' : SPECIES[s.pet?.species]?.animal === 'rabbit' ? '🐰' : '🐱'),
        h('span', { class: 'hud-lv' }, h('b', {}, `Lv ${lp.level}`), h('i', { class: 'hud-xp', style: `--p:${Math.round(lp.pct * 100)}%` }))),
      ev ? h('button', { class: 'hud-live', 'aria-label': `${ev.title} is live — ends in ${Math.max(1, Math.ceil((ev.end - Date.now()) / 36e5))} hours`, onclick: () => app.go('event2') }, h('span', { 'aria-hidden': 'true' }, ev.icon), h('small', {}, 'LIVE')) : null,
      currencyPills(app));
  }
  const turnsEl = h('div', { class: 'turns', 'aria-live': 'off' });
  const toolBtn = h('button', { class: 'side-btn interact', onclick: () => toggleTray() });
  const eventBtn = h('button', { class: 'side-btn event', onclick: () => app.go('event2') });
  const tray = h('div', { class: 'tool-tray', role: 'menu', 'aria-label': 'Interact' }); tray.hidden = true;
  const snapBtn = h('button', { class: 'snap-btn', 'aria-label': 'SNAP — photograph this moment', onclick: () => snapScene() }, h('span', { class: 'snap-ic', 'aria-hidden': 'true' }), h('b', {}, 'SNAP'));
  function drawCluster() {
    const s = get(), t = V.tool(s.v2.tool), ev = V.currentEvent2(s);
    toolBtn.replaceChildren(h('span', { class: 'sb-ic', 'aria-hidden': 'true' }, t.icon), h('small', {}, 'INTERACT'));
    toolBtn.setAttribute('aria-label', `Interact — current: ${t.name}. Opens the interaction tools.`);
    toolBtn.setAttribute('aria-expanded', String(!tray.hidden));
    eventBtn.replaceChildren(h('span', { class: 'sb-ic', 'aria-hidden': 'true' }, ev ? ev.icon : '🗺️'), h('small', {}, ev ? ev.title : 'EVENTS'));
    eventBtn.setAttribute('aria-label', ev ? `${ev.title}, ${ev.type === 'team' ? 'team event with friends' : 'solo event'}` : 'Events');
    drawTurns();
  }
  function drawTurns() {
    const tv = V.turnsView(get());
    turnsEl.classList.toggle('empty', tv.empty);
    turnsEl.replaceChildren(h('b', {}, `${tv.n} / ${tv.max}`), h('small', {}, tv.full ? 'Turns full' : `+1 in ${V.clock(tv.nextInMs)}`));
    turnsEl.setAttribute('aria-label', `${tv.n} of ${tv.max} Snap Turns. ${tv.full ? 'Full.' : `One more in ${V.clock(tv.nextInMs)}.`}`);
  }
  function toggleTray(force) {
    tray.hidden = force != null ? !force : !tray.hidden;
    if (!tray.hidden) tray.replaceChildren(...V.TOOLS.map(t => h('button', { class: 'tool' + (t.id === get().v2.tool ? ' on' : ''), role: 'menuitem', 'aria-label': `${t.name}: ${t.hint}`, onclick: () => { toggleTray(false); useTool(t.id); } },
      h('span', { 'aria-hidden': 'true' }, t.icon), h('small', {}, t.name))));
    toolBtn.setAttribute('aria-expanded', String(!tray.hidden));
  }

  // ------------------------------------------------------------ INTERACT: influence, then watch who reacts how
  const nearest = x => actors.reduce((b, a) => Math.abs(a.x - x) < Math.abs(b.x - x) ? a : b, actors[0]);
  function useTool(id, target = null) {
    const now = performance.now(), s = get();
    if (id === 'prop') { placeSheet(); update(x => { V.ensureV2(x).tool = 'prop'; }); drawCluster(); return; }
    update(x => { V.ensureV2(x).tool = id; V.noteInteract(x, id); });
    sfx.tap?.(); haptic('light');
    const at = 0.25 + Math.random() * 0.5;
    const who = ['pet', 'poke'].includes(id) ? [target || nearest(0.5)] : actors;
    const reactions = [];
    const toy = id === 'ball' || id === 'toy' ? { x: at, vx: (Math.random() < 0.5 ? -1 : 1) * (id === 'ball' ? 0.34 : 0.12), y: -0.2, vy: -1.2, kind: id === 'ball' ? 'ball' : 'yarn' } : null;
    if (id === 'food' || id === 'treat') drops = [{ kind: id, x: at, until: now + 9000 }];
    for (const a of who) {
      const bond = actors.length > 1 ? Math.max(...actors.filter(o => o !== a).map(o => W.relation(s, a.pet.id, o.pet.id).points || 0)) : 50;
      const r = V.reactTo({ personality: a.pet.personality, tool: id, name: a.pet.name, mood: a.mood, bond });
      reactions.push({ ...r, pet: a.pet.id });
      a.beh = { id: 'interact', tool: id, reaction: r.kind }; a.t0 = now; a.until = now + 4200;
      const x0 = toy ? toy.x : at;
      switch (r.kind) {
        case 'chase': a.s = { kind: 'chase', toy }; break;
        case 'guard': case 'play': a.s = toy ? { kind: 'chase', toy } : { kind: 'goto', x: x0 + 0.06, then: r.pose }; break;
        case 'eat': case 'investigate': case 'steal': case 'beg': a.s = { kind: 'goto', x: x0 + (a.x < x0 ? -0.07 : 0.07), then: r.pose }; break;
        case 'approach': a.s = { kind: 'seek' }; a.lane = 0.9; break;
        case 'dodge': a.s = { kind: 'refuse', from: { x: a.x + 0.01 } }; break;
        default: a.s = { kind: 'hold', pose: r.pose };
      }
      if (['react', 'grumble', 'refuse', 'watch', 'ignore'].includes(r.kind)) a.s = { kind: 'hold', pose: r.pose };
      if (r.fx) a.fx = [r.fx];
    }
    // pets and food count as gentle care (at most once per Poka per 10 minutes)
    if (['food', 'treat', 'pet'].includes(id)) update(x => { const c = (V.ensureV2(x).careAt = x.v2.careAt || {}); for (const a of who) if (Date.now() - (c[a.pet.id] || 0) > 6e5) { c[a.pet.id] = Date.now(); W.careAction(x, a.pet.id, 'care'); } });
    const mixed = V.mixedReaction(reactions);
    interact = { tool: id, reactions, mixed, at: now, until: now + 5000 };
    say(reactions.map(r => r.line).join('  ·  '));
    if (mixed && !moment && Math.random() < 0.35) openMoment(Math.random() < 0.25 ? 'rare' : 'uncommon', 'SPLIT DECISION');
    track('interact_used', { tool: id, reactions: reactions.map(r => r.kind).join(','), pets: who.length });
    drawCluster(); tutorial('interacted');
  }
  function say(text, ms = 3600) { bubble.textContent = text; bubble.hidden = false; clearTimeout(say.t); say.t = setTimeout(() => { bubble.hidden = true; }, ms); }
  function openMoment(r, label = 'MOMENT') {
    const now = performance.now();
    moment = { rarity: r, actor: actors[0] }; momentUntil = now + 6000; nextMomentAt = now + 25000;
    banner.textContent = `${r === 'legendary' ? '🌟' : '✨'} ${RARITY_LABEL[r].toUpperCase()} ${label} — SNAP IT!`; banner.style.borderColor = RARITY_COLOR[r]; banner.hidden = false;
    canvas.parentElement?.classList.add('rare-glow');
    track(r === 'legendary' ? 'legendary_moment' : 'rare_moment', { location: loc.id, captured: false }); haptic('light'); sfx.reward?.();
  }
  function closeMoment() { moment = null; banner.hidden = true; canvas.parentElement?.classList.remove('rare-glow'); }
  // tap a Poka on the stage: a pet (or a poke, when Poke is the chosen tool)
  canvas.addEventListener('click', e => {
    const r = canvas.getBoundingClientRect(), x = 0.5 + ((e.clientX - r.left) / r.width - 0.5) / 0.84;
    const a = nearest(x); if (!a || Math.abs(a.x - x) > 0.16) return;
    useTool(get().v2.tool === 'poke' ? 'poke' : 'pet', a);
  });

  // ------------------------------------------------------------ simulation
  function tick(now) {
    const s = get(), sc = scene(), dt = Math.min(0.1, (now - (lastTick || now)) / 1000); lastTick = now;
    for (const a of actors) {
      if (now > a.until && !staged) {
        const others = actors.filter(o => o !== a).map(o => o.pet);
        const b = W.pickBehavior(s, a.pet, sc, others);
        a.until = now + 3400 + Math.random() * 2600;
        a.lane = [0.9, 0.84, 0.78][actors.indexOf(a)] ?? 0.86;
        const partner = b.with ? actors.find(x => x.pet.id === b.with) : null;
        if (partner) partner.until = a.until;                          // the partner plays along for the same beat
        world = {};
        Choreo.start(a, b, actors, { ...sc, OBJECTS }, now);
        if (b.duo && b.with && Choreo.moodOf(a.mood).social > 0) update(x => { W.bond(x, a.pet.id, b.with, b.id === 'race' || b.id === 'tug' || b.id === 'chase' ? 'rival' : b.id === 'practice_together' || b.id === 'teach' ? 'train' : b.id === 'explore_together' || b.id === 'sniff_together' ? 'walk' : 'play', 0.2); });
        // one calm moment at a time, spaced out (the Rare Moment Hunt event makes them likelier)
        if (!moment && now > nextMomentAt) {
          const r = W.momentRoll(s, b, sc, stageEvent === 'rare' || V.currentEvent2(s)?.id === 'rare_hunt' ? () => Math.random() * 0.6 : Math.random);
          if (r && r !== 'common') openMoment(r);
        }
      }
    }
    if (moment && now > momentUntil) closeMoment();
    if (interact && now > interact.until) interact = null;
    drops = drops.filter(d => now < d.until);
  }
  function stepAll(now, dt) {
    for (const a of actors) {
      Choreo.step(a, dt, now, world);
      a.y = Math.min(0.9, a.y + ((a.lane ?? 0.86) - a.y) * Math.min(1, dt * 2));   // depth lanes: no pet hides fully behind another, none sinks below the stage
    }
    // personal space: pets not in a close-contact behaviour drift apart instead of stacking
    const close = new Set(['snuggle', 'tug', 'turns', 'drill', 'chase', 'flee', 'race']);
    for (const a of actors) for (const b of actors) if (a !== b && !(close.has(a.s?.kind) && close.has(b.s?.kind))) {
      const d = a.x - b.x; if (Math.abs(d) < 0.12) a.x = Math.max(0.14, Math.min(0.86, a.x + (d >= 0 ? 1 : -1) * dt * 0.08));
    }
  }
  // behaviour cues drawn in scene space (toy, rope, hearts, paw prints, sync marks, mood marks) -- no emoji
  function drawFx(ctx, a, now) {
    const X = SCENE_W * sx(a.x), Y = SCENE_H * a.y, t = now / 1000;
    for (const f of a.fx || []) {
      ctx.save();
      if (f.toy) { const tx = SCENE_W * sx(f.toy.x), ty = Y - 30 + f.toy.y * 400; ctx.fillStyle = f.toy.kind === 'glow_ball' ? '#9ff0ff' : f.toy.kind === 'beach_ball' ? '#ffd84a' : f.toy.kind === 'yarn' ? '#b58ae0' : '#e0474c';
        ctx.beginPath(); ctx.arc(tx, ty, 26, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(tx, ty, 16, t * 8, t * 8 + 2); ctx.stroke();
        ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.beginPath(); ctx.ellipse(tx, Y + 2, 24, 7, 0, 0, 7); ctx.fill(); }
      else if (f.rope) { ctx.strokeStyle = '#c9884e'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(X, Y - 120); ctx.quadraticCurveTo((X + SCENE_W * sx(f.rope.x)) / 2, Y - 95 + Math.sin(t * 5) * 8, SCENE_W * sx(f.rope.x), Y - 120); ctx.stroke(); }
      else if (f === 'hearts') for (let i = 0; i < 3; i++) { const y = Y - 320 - ((t * 40 + i * 40) % 120); ctx.globalAlpha = 1 - ((t * 40 + i * 40) % 120) / 120; heart(ctx, X + (i - 1) * 30, y, 16, '#ff5f8f'); }
      else if (f === 'pawprints') { ctx.fillStyle = 'rgba(120,90,60,.3)'; for (let i = 1; i < 6; i++) { const px = X - (a.vx >= 0 ? 1 : -1) * i * 34; ctx.beginPath(); ctx.ellipse(px, Y + 8 + (i % 2) * 10, 9, 6, 0, 0, 7); ctx.fill(); } }
      else if (f === 'sync') { ctx.strokeStyle = '#5ec8f2'; ctx.lineWidth = 5; ctx.setLineDash([12, 10]); ctx.beginPath(); ctx.moveTo(X - 60, Y - 330); ctx.lineTo(X + SCENE_W * 0.16 + 60, Y - 330); ctx.stroke(); }
      else if (f === 'teach') { ctx.fillStyle = '#6a5ad0'; ctx.beginPath(); ctx.moveTo(X + 70, Y - 300); ctx.lineTo(X + 150, Y - 330); ctx.lineTo(X + 150, Y - 270); ctx.closePath(); ctx.fill(); }
      else if (f === 'ready') { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#3a2a4a'; ctx.lineWidth = 4; ctx.fillRect(X - 4, Y - 380, 8, 60); ctx.strokeRect(X - 4, Y - 380, 8, 60); }
      else if (f === 'sparkle') for (let i = 0; i < 5; i++) { const ang = t * 3 + i * 1.26; star(ctx, X + Math.cos(ang) * 110, Y - 180 + Math.sin(ang) * 60, 12, '#ffd84a'); }
      else if (f === 'sweat') { ctx.fillStyle = '#7cc8ff'; ctx.beginPath(); ctx.ellipse(X + 70, Y - 300 + (t * 60 % 30), 7, 11, 0, 0, 7); ctx.fill(); }
      else if (f === 'grumble') { ctx.strokeStyle = '#d0453a'; ctx.lineWidth = 7; ctx.beginPath(); for (let i = 0; i < 5; i++) ctx.lineTo(X + 60 + i * 16, Y - 330 + (i % 2 ? -14 : 14)); ctx.stroke(); }
      ctx.restore();
    }
    const m = Choreo.moodOf(a.mood);
    if (m.curl || a.mood === 'withdrawn') { ctx.save(); ctx.fillStyle = 'rgba(122,140,196,.8)'; ctx.font = '900 34px system-ui'; ctx.fillText('z', X + 60, Y - 200 - (t * 18 % 40)); ctx.restore(); }
  }
  function heart(ctx, x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y + r); ctx.bezierCurveTo(x - r * 2, y - r * .4, x - r * .8, y - r * 1.8, x, y - r * .6); ctx.bezierCurveTo(x + r * .8, y - r * 1.8, x + r * 2, y - r * .4, x, y + r); ctx.fill(); }
  function star(ctx, x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); for (let k = 0; k < 10; k++) { const an = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * .45 : r; ctx.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); } ctx.closePath(); ctx.fill(); }
  function drawDrop(ctx, d, t) {   // a food bowl / treat on the ground
    const X = SCENE_W * sx(d.x), Y = SCENE_H * 0.9;
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.beginPath(); ctx.ellipse(X, Y + 6, 60, 12, 0, 0, 7); ctx.fill();
    if (d.kind === 'sprout') { const g = Math.min(1, (performance.now() - (d.until - 12000)) / 2500);   // a shared garden sprout grows in
      ctx.fillStyle = '#8a5a3c'; ctx.beginPath(); ctx.ellipse(X, Y, 64, 16, 0, 0, 7); ctx.fill(); ctx.strokeStyle = '#3fae78'; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X, Y - 110 * g); ctx.stroke();
      ctx.fillStyle = '#53d3a2'; for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.ellipse(X + sgn * 34 * g, Y - 90 * g, 34 * g, 16 * g, sgn * -0.5, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#ffcf4a'; ctx.beginPath(); ctx.arc(X, Y - 124 * g, 22 * g, 0, 7); ctx.fill(); ctx.restore(); return; }
    if (d.kind === 'food') { ctx.fillStyle = '#5ec8f2'; ctx.beginPath(); ctx.moveTo(X - 58, Y - 34); ctx.lineTo(X + 58, Y - 34); ctx.lineTo(X + 42, Y); ctx.lineTo(X - 42, Y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c98a4b'; for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(X - 36 + i * 12, Y - 38 - (i % 2) * 6, 8, 0, 7); ctx.fill(); } }
    else { ctx.fillStyle = '#e8b465'; ctx.beginPath(); ctx.arc(X, Y - 16, 20, 0, 7); ctx.fill(); ctx.fillStyle = '#7a4a2a'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(X - 8 + (i % 2) * 14, Y - 22 + (i > 1 ? 10 : 0), 3.5, 0, 7); ctx.fill(); }
      star(ctx, X + 26, Y - 44 - Math.sin(t * 4) * 6, 9, '#ffd84a'); }
    ctx.restore();
  }

  function draw(now) {
    const ctx = canvas.getContext('2d'), sc = scene();
    ctx.clearRect(0, 0, SCENE_W, SCENE_H);
    drawBackdrop(ctx, { draw: LOCATIONS.find(l => l.id === loc.id).scene }, SCENE_W, SCENE_H, now / 1000);
    // placed objects on the ground
    const inPlay = new Set(actors.flatMap(a => (a.fx || []).filter(f => f.toy).map(f => f.toy.kind)));   // a toy being chased is drawn where it rolls, not also at its spot
    sc.placed.forEach((obj, i) => { if (inPlay.has(obj)) return; const o = OBJECTS[obj], it = objectArt(o, itemOf); if (!it) return; ctx.save(); ctx.translate(SCENE_W * (0.2 + i * 0.3), SCENE_H * 0.86); ctx.scale(1.3, 1.3); drawProp(ctx, it, now / 1000); ctx.restore(); });
    for (const d of drops) drawDrop(ctx, d, now / 1000);
    if (stageEvent === 'treasure') { const X = SCENE_W * 0.62, Y = SCENE_H * 0.9; ctx.save(); ctx.fillStyle = '#8a5a3c'; ctx.beginPath(); ctx.ellipse(X, Y, 70, 18, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#d4a017'; ctx.fillRect(X - 34, Y - 44, 68, 38); ctx.fillStyle = '#b07d0c'; ctx.fillRect(X - 34, Y - 30, 68, 6); ctx.restore(); star(ctx, X + 40, Y - 70 - Math.sin(now / 250) * 8, 12, '#ffe98a'); }
    // Level-100 monument (earn-only) stands in the Living Room and Photo Studio
    if ((get().monuments || []).includes('master') && ['living_room', 'photo_studio'].includes(loc.id)) {
      ctx.save(); ctx.translate(SCENE_W * 0.9, SCENE_H * 0.74); ctx.fillStyle = '#d8d2c8'; ctx.fillRect(-46, 0, 92, 60); ctx.fillStyle = '#ffcc33';
      ctx.beginPath(); ctx.moveTo(-34, -90); ctx.lineTo(34, -90); ctx.lineTo(22, -30); ctx.lineTo(-22, -30); ctx.closePath(); ctx.fill(); ctx.fillRect(-8, -30, 16, 24); ctx.fillRect(-26, -8, 52, 10);
      ctx.fillStyle = '#3a2a4a'; ctx.font = '900 16px system-ui'; ctx.textAlign = 'center'; ctx.fillText('MASTER', 0, 38); ctx.restore(); }
    // pets, back to front (big: the world makes room for the Pokas, not the other way round)
    for (const a of [...actors].sort((p, q) => p.y - q.y)) {
      const m = Choreo.moodOf(a.mood), k = (actors.length > 2 ? 0.86 : actors.length > 1 ? 1 : 1.12) * (m.curl ? 0.92 : 1);
      const stride = a.gait ? Math.abs(Math.sin(now / (a.gait > 0.7 ? 70 : 120))) * (a.gait > 0.7 ? 26 : 12) * a.gait : 0;   // walk / run bob
      ctx.save(); ctx.translate(SCENE_W * sx(a.x + (a.tug || 0)), SCENE_H * a.y - stride); ctx.scale(k * a.flip, k); ctx.rotate(a.gait * 0.08);
      if (m.dim) ctx.filter = `saturate(${1 - m.dim}) brightness(${1 - m.dim * 0.25})`;
      drawPet(ctx, a.pet, a.pose, { t: now / 1000 * (0.5 + m.speed * 0.5) + a.x * 3, blink: m.curl || Math.sin(now / 700 + a.x * 9) > 0.97, alive: true, gait: a.gait || 0 });
      ctx.restore();
      drawFx(ctx, a, now);
    }
    // time-of-day + season tint
    const T = TIMES_OF_DAY.find(t => t.id === sc.time);
    if (T?.tint) { ctx.fillStyle = T.tint; ctx.fillRect(0, 0, SCENE_W, SCENE_H); }
    if (sc.season === 'autumn') for (let i = 0; i < 14; i++) { ctx.save(); ctx.translate((i * 97 + now / 30) % SCENE_W, (i * 61 + now / 12) % SCENE_H); ctx.rotate(i + now / 900); ctx.fillStyle = ['#e8812f', '#c9384f', '#f2b233'][i % 3]; ctx.beginPath(); ctx.ellipse(0, 0, 10, 5, 0, 0, 7); ctx.fill(); ctx.restore(); }
    if (sc.season === 'winter') for (let i = 0; i < 30; i++) { ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc((i * 71) % SCENE_W, (i * 43 + now / 20) % SCENE_H, 3 + (i % 3), 0, 7); ctx.fill(); }
  }
  let lastFrame = 0, lastTurnsDraw = 0;
  function loop(now) {
    if (!alive || paused) return;
    const dt = Math.min(0.1, (now - (lastFrame || now)) / 1000); lastFrame = now;
    if (now - lastTick > 250) tick(now);
    stepAll(now, dt);
    draw(now);
    if (now - lastTurnsDraw > 1000) { lastTurnsDraw = now; drawTurns(); }
    raf = requestAnimationFrame(loop);
  }
  // nothing animates while the app is in the background
  const onVis = () => { if (document.hidden) { paused = true; cancelAnimationFrame(raf); } else if (paused && alive) { paused = false; lastFrame = 0; update(x => V.settleTurns(x)); raf = requestAnimationFrame(loop); } };
  document.addEventListener('visibilitychange', onVis);

  // ------------------------------------------------------------ actions
  function placeSheet() {
    const sc = scene();
    const sh = sheet(h('h2', {}, `Place something in the ${sc.name}`), h('p', { class: 'small', style: 'margin:0 0 8px' }, 'Objects change what your Pokas do — and what you can photograph. Up to three at once.'),
      h('div', { class: 'studio-grid' }, ...sc.objects.map(id => { const o = OBJECTS[id], c = h('canvas', { width: 120, height: 120 });
        import('../render/items.js').then(R => R.drawItemThumb(c, objectArt(o, itemOf)));
        return h('button', { class: 'studio-item' + (sc.placed.includes(id) ? ' on' : ''), onclick: () => { update(x => { W.placeObject(x, loc.id, id); V.noteInteract(x, 'prop'); }); track('interactive_prop_used', { object: id, location: loc.id }); sh.close(); for (const a of actors) a.until = 0; say('Your Pokas notice something new…'); refresh(); } }, c, h('span', {}, o.name), h('small', {}, o.photo));
      })),
      sc.objects.length ? null : h('p', { class: 'small' }, 'Nothing to place here yet — other locations have toys and props.'));
  }
  function menu() {
    const s = get(), lvl = s.progress.level || 1;
    const go = (r, p) => () => { sh.close(); app.go(r, p); };
    const sh = sheet(h('h2', {}, 'Menu'),
      h('div', { class: 'menu-grid' },
        h('button', { onclick: go('store', { from: 'snap' }) }, '🛍️', h('span', {}, 'Poka Shop')),
        h('button', { onclick: go('settings') }, '⚙️', h('span', {}, 'Settings')),
        h('button', { onclick: go('music', { from: 'snap' }) }, '🎧', h('span', {}, 'Music')),
        h('button', { onclick: go('help') }, '🛟', h('span', {}, 'Help & Support')),
        h('button', { onclick: go('missions') }, '📷', h('span', {}, 'Photo Challenges')),
        h('button', { onclick: go('snaps') }, '🖼️', h('span', {}, 'My Snaps')),
        h('button', { onclick: go('walk') }, '🥾', h('span', {}, 'Walk with Poka')),
        h('button', { onclick: go('adventures') }, '🗺️', h('span', {}, 'Adventures')),
        h('button', { onclick: go('chapters') }, '📜', h('span', {}, 'Chapters')),
        h('button', { onclick: go('lookback') }, '🗓️', h('span', {}, 'Lookback')),
        lvl >= 70 ? h('button', { onclick: go('league') }, '🏆', h('span', {}, 'League')) : null));
  }
  async function snapScene() {
    if (snapScene.busy) return; snapScene.busy = true;
    try { await doSnap(); } finally { snapScene.busy = false; }
  }
  async function doSnap() {
    const now = performance.now(), sc = scene(), s0 = get();
    toggleTray(false);
    sfx.shutter(); haptic('heavy');
    snapBtn.classList.remove('pressed'); void snapBtn.offsetWidth; snapBtn.classList.add('pressed');
    let turn; update(x => { turn = V.spendTurn(x); });
    const subjects = actors.map(a => a.pet.id), poses = Object.fromEntries(actors.map(a => [a.pet.id, a.pose]));
    const lead = actors[0], obj = actors.map(a => a.beh?.object).find(Boolean) || null;
    const captured = moment && now < momentUntil ? moment : null;
    const ix = interact && now < interact.until ? interact : null;
    // puzzles see the scene exactly as it is
    let solved = [];
    update(x => { solved = W.tryPuzzles(x, { location: loc.id, placed: sc.placed, subjects, time: sc.time, poses }); });
    const puzzle = solved[0] || null;
    const relationType = subjects.length > 1 ? W.relation(get(), subjects[0], subjects[1]).type : null;
    const rarity = W.momentRarity({ puzzle: puzzle ? { rarity: puzzle.rarity } : null, rolled: captured?.rarity, subjects, relationType, object: obj, time: sc.time });
    // quality = observation + timing, not luck: something happening, framing, the reaction's peak, the moment
    const spread = subjects.length > 1 ? Math.abs(actors[0].x - actors[actors.length - 1].x) : 0.3;
    const active = actors.filter(a => a.pose !== 'idle').length / actors.length;
    const inFrame = actors.every(a => a.x > 0.16 && a.x < 0.84) ? 6 : -8;
    const peak = ix ? (() => { const el = (now - ix.at) / 1000; return el >= 0.5 && el <= 2.8 ? 14 : el < 0.5 ? 4 : 7; })() : 0;   // snap the reaction, not the input
    const quality = Math.max(30, Math.min(100, Math.round(46 + (obj ? 8 : 0) + active * 14 + (captured ? 14 : 0) + (subjects.length > 1 ? 6 : 0) + peak + inFrame - Math.abs(spread - 0.35) * 24 + Math.random() * 4)));
    const stars = starsFor(quality);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.9));
    const id = 'h' + Date.now().toString(36);
    const ev = V.currentEvent2(get());
    let rec;
    update(x => {
      rec = W.recordPhoto(x, { id, missionId: `homeland:${loc.id}`, score: quality, stars, poseId: lead.pose, poses, object: obj, location: loc.id, time: sc.time, season: sc.season, subjects, rarity, relationType, puzzle: puzzle?.solved.id || null, seasonal: true,
        tool: ix?.tool || null, reaction: ix?.reactions[0]?.kind || null, mixed: !!ix?.mixed, duo: actors[0].s?.kind || null, event: stageEvent && ev ? ev.id : null, eventType: stageEvent && ev ? ev.type : null, noCredit: !turn.ok });
      grantXP(x, turn.ok ? 12 : 4);
      for (const pid of subjects) W.careAction(x, pid, 'photo');
    });
    await album.add({ id, blob, petName: actors.map(a => a.pet.name).join(' & '), missionID: `homeland:${loc.id}`, missionTitle: `${sc.name}${puzzle ? ' — ' + puzzle.solved.name : ''}`, score: quality, poseId: lead.pose, caption: captured ? 'Caught it!' : '', fav: false, rare: rarity !== 'common' ? RARITY_LABEL[rarity] : null });
    if (captured) track(rarity === 'legendary' ? 'legendary_moment' : 'rare_moment', { location: loc.id, captured: true });
    for (const j of rec.journal) track('journal_entry_unlocked', { species: j.species, entry: j.entry.id });
    track('world_snap', { quality, rarity, turn: turn.ok, tool: ix?.tool || 'none', pets: subjects.length });
    closeMoment();
    const v2 = rec.v2 || { album: [], wins: [], event: null, dupAlbum: 0 };
    const tv = V.turnsView(get());
    const layer = h('div', { class: 'levelup snap-result' }, h('div', { class: 'card homeland-result' },
      h('img', { src: URL.createObjectURL(blob), alt: 'Your photo', class: 'hl-photo' }),
      h('div', { class: 'photo-dims' },
        h('div', {}, h('small', {}, 'QUALITY'), h('b', {}, `${quality} / 100`)),
        h('div', {}, h('small', {}, 'RATING'), h('b', { class: 'stars-row' }, STAR_TEXT(stars))),
        h('div', {}, h('small', {}, 'MOMENT'), h('b', { style: `color:${RARITY_COLOR[rarity]}` }, `${rarity === 'legendary' ? '🌟 ' : ''}${RARITY_LABEL[rarity].toUpperCase()}`))),
      h('div', { class: 'res-lines' },
      turn.ok ? null : h('p', { class: 'reward-line warn-line' }, `Out of Snap Turns — this photo is saved in My Snaps. Album, Wins and events count again at +1 turn in ${V.clock(tv.nextInMs)}.`),
      v2.album.length ? h('p', { class: 'reward-line album-line' }, `📖 Album +${v2.album.length}: ${v2.album.map(a => a.slotName).join(', ')}`) : null,
      ...v2.album.filter(a => a.setComplete).map(a => h('p', { class: 'reward-line album-line done' }, `🎉 ${a.setName} SET COMPLETE! Claim it in ALBUM`)),
      v2.dupAlbum && !v2.album.length ? h('p', { class: 'small' }, 'Already in your Album — look for a new kind of moment.') : null,
      v2.event?.pts ? h('p', { class: 'reward-line' }, `${ev?.icon || '🎪'} ${v2.event.title}: +${v2.event.pts} ${v2.event.pts === 1 ? 'point' : 'points'}`) : null,
      v2.wins.length ? h('p', { class: 'reward-line' }, `🏆 Win ready: ${v2.wins[0]}${v2.wins.length > 1 ? ` (+${v2.wins.length - 1} more)` : ''}`) : null,
      puzzle ? h('p', { class: 'reward-line' }, `🧩 Puzzle solved: ${puzzle.solved.name}!`) : null,
      rec.journal.length ? h('p', { class: 'reward-line' }, `📔 Journal: ${[...new Set(rec.journal.map(j => j.entry.name))].join(', ')}`) : null,
      rec.album.length ? h('p', { class: 'reward-line' }, `🌿 Life Album: ${rec.album.slice(0, 3).map(a => `${W.petById(get(), a.petId)?.name || 'Your Poka'} — ${a.name}`).join(' · ')}`) : null,
      ...rec.collections.filter(c => c.complete).map(c => h('p', { class: 'reward-line' }, `🗂️ Collection complete: ${c.collection.name}!`)),
      rec.honors.length ? h('p', { class: 'reward-line' }, `🏅 ${rec.honors.length === 1 ? 'Honour' : `${rec.honors.length} honours`}: ${rec.honors.slice(0, 2).map(x => `${x.honor.name} (${x.tier.name})`).join(', ')}${rec.honors.length > 2 ? ` +${rec.honors.length - 2} more` : ''}`) : null,
      rec.projects[0]?.complete ? h('p', { class: 'reward-line' }, `🏗️ ${rec.projects[0].project.name} complete — the world changes!`) : null,
      h('p', { class: 'small' }, rarity !== 'common' && quality < 80 ? 'Not a perfect photo — but a rare memory.' : quality < 70 ? (ix ? 'Tip: wait a beat after you interact — snap the reaction, not the throw.' : 'Tip: interact first, or snap while your Pokas are doing something.') : 'Lovely shot!')),
      h('div', { class: 'res-actions' },
        v2.album.length ? h('button', { class: 'btn ghost', onclick: () => { layer.remove(); app.go('album'); } }, '📖 ALBUM') : null,
        v2.wins.length ? h('button', { class: 'btn ghost', onclick: () => { layer.remove(); app.go('wins'); } }, '🏆 WINS') : null,
        h('button', { class: 'btn', style: 'flex:1', onclick: () => { layer.remove(); tutorial('snapped'); } }, 'KEEP PLAYING'))));
    document.body.append(layer);
    if (stageEvent) stageEvent = null;
    refresh();
  }

  // ------------------------------------------------------------ first session: teach the core loop only
  function tutorial(step) {
    const s = get(), t = s.v2.tut;
    if (t.done) { coach.hidden = true; return; }
    const set = (k, text) => { coach.replaceChildren(h('span', {}, text), h('button', { class: 'linkbtn', onclick: () => { update(x => { x.v2.tut.done = Date.now(); }); coach.hidden = true; } }, 'Skip')); coach.hidden = false; coach.dataset.step = k; };
    if (step === 'start' && !t.watched) set('watch', `Meet ${actors.map(a => a.pet.name).join(' & ')}! Your Pokas live on their own — watch what they do.`);
    else if (step === 'start' || step === 'watched') set('interact', 'Tap INTERACT and throw the ball 🎾 — see how they react.');
    else if (step === 'interacted') { update(x => { x.v2.tut.watched = 1; x.v2.tut.interacted = 1; }); set('snap', 'Now press SNAP while they react! 📸'); }
    else if (step === 'snapped') { update(x => { x.v2.tut.done = Date.now(); }); set('done', 'That photo counted toward your Album and Wins. Keep exploring!'); setTimeout(() => { coach.hidden = true; }, 4200); }
    if (step === 'start' && !t.watched) setTimeout(() => { if (alive && !get().v2.tut.interacted) { update(x => { x.v2.tut.watched = 1; }); tutorial('watched'); } }, 4500);
  }

  app.mount(h('div', { class: 'screen snapworld homeland' },
    hud,
    h('div', { class: 'world-top' }, tabs, info),
    h('div', { class: 'homeland-stage world-stage' }, canvas, banner, bubble, coach),
    hintBox,
    h('div', { class: 'snap-cluster' },
      h('div', { class: 'side' }, toolBtn, tray),
      h('div', { class: 'snap-col' }, snapBtn, turnsEl),
      h('div', { class: 'side' }, eventBtn)),
    navBar(app, 'snap')));
  buildActors(); refresh(); raf = requestAnimationFrame(loop); tutorial('start');
  // an event turn arrives here with a world action to stage
  if (opts.stage) setTimeout(() => runStage(opts.stage), 400);
  function runStage(kind) {
    stageEvent = kind; say(EVENT_STAGE[kind] || 'Event on!', 3800);
    const now = performance.now();
    if (kind === 'race' && actors.length > 1) window.PokaHomeland.stage('race', 0, 1, 9000);
    else if (kind === 'race') useTool('ball');
    else if (kind === 'treasure') for (const a of actors) { a.s = { kind: 'goto', x: 0.62 + (a.x < 0.62 ? -0.1 : 0.1), then: 'sniff' }; a.t0 = now; a.until = now + 7000; a.beh = { id: 'interact', reaction: 'investigate' }; interact = { tool: 'treasure', reactions: [{ kind: 'investigate' }], mixed: false, at: now, until: now + 7000 }; }
    else if (kind === 'pose') for (const a of actors) { a.s = { kind: 'hold', pose: ['happy', 'wave', 'heart'][actors.indexOf(a) % 3] }; a.until = now + 6000; }
    else if (kind === 'garden') { drops = [{ kind: 'sprout', x: 0.5, until: now + 12000 }]; for (const a of actors) { const i = actors.indexOf(a); a.s = { kind: 'goto', x: 0.5 + (i - 1) * 0.16 + (i === 1 ? 0.12 : 0), then: ['look', 'happy', 'sniff'][i % 3] }; a.t0 = now; a.until = now + 8000; a.beh = { id: 'interact', reaction: 'investigate' }; } interact = { tool: 'garden', reactions: [{ kind: 'investigate' }], mixed: false, at: now, until: now + 8000 }; }
    else if (kind === 'rare') openMoment('rare');
  }
  window.PokaHomeland = { forceMoment: (r = 'rare') => { openMoment(r); },
    // QA: stage one choreography (e.g. 'chase', 'race', 'teach', 'use_object:ball') for pets i/j, held for ms
    stage: (id, i = 0, j = 1, ms = 6000) => { const a = actors[i], b = actors[j], now = performance.now(); world = {};
      const [kind, object] = id.split(':'); if (object && !scene().placed.includes(object)) update(x => W.placeObject(x, loc.id, object));
      Choreo.start(a, { id: kind, with: object ? null : b?.pet.id, object, pose: 'idle', duo: !object }, actors, { ...scene(), OBJECTS }, now);
      for (const x of actors) x.until = now + ms; staged = now + ms; setTimeout(() => { staged = null; }, ms); return actors.map(x => x.s?.kind); },
    interact: (tool, i) => useTool(tool, i != null ? actors[i] : null),
    setMood: (i, mood) => { if (actors[i]) actors[i].mood = mood; },
    state: () => actors.map(a => ({ pet: a.pet.name, personality: a.pet.personality, x: +a.x.toFixed(3), vx: +(a.vx || 0).toFixed(3), pose: a.pose, kind: a.s?.kind, reaction: a.beh?.reaction || null, mood: a.mood, fx: (a.fx || []).map(f => typeof f === 'string' ? f : Object.keys(f)[0]) })) };   // QA hook
  return () => { alive = false; cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); clearTimeout(say.t); delete window.PokaHomeland; };
}
export const snapScreen = homelandScreen;
