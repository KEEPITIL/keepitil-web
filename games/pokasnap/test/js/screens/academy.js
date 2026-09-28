/* TRAINING ACADEMY — hub, rank maps and six playable disciplines.
   ---------------------------------------------------------------------------
   Yarn Lab (sort puzzle + Daily + Endless), Agility (rhythm taps), Fetch
   (power timing), Scent Hunt (warmer/colder grid), Trick Studio (repeat the
   sequence), Focus (tap only the signal). Every game is short, can't
   punish (0 stars = try again, nothing lost) and reads the pet's attribute
   through perkTotals().trainingAssist for slightly wider windows. */

import { h, toast, sheet, fmt, plural } from '../ui.js';
import { livePet } from './flow.js';
import { get, update } from '../game/state.js';
import { DISCIPLINES, RANKS, NODES_PER_RANK, BAND, BAND_COLOR, node as nodeOf, rng, dailyYarn } from '../data/academy.js';
import { ATTRS, ATTR_ORDER, PET_PROFILES } from '../data/attributes.js';
import * as G from '../game/academy.js';
import * as Wd from '../game/world.js';
import { attributes, perkTotals } from '../game/build.js';
import { item as itemOf } from '../data/items.js';
import { dayKey } from '../game/ledger.js';
import { track } from '../platform/analytics.js';
import { sfx } from '../platform/sound.js';
import { haptic } from '../platform/native.js';
import { levelUpCard } from './result.js';

const FAST = () => !!window.POKA_FAST;
const YARN_COLORS = ['#ff6b8b', '#5ec8f2', '#ffd23f', '#53d3a2', '#a98bf0', '#ff9a4d', '#8a5a3c', '#2f6fd6', '#e0474c', '#9be37a', '#ff8fd8', '#6b6b7b'];

/* ================================================================ HUB */
export function academyScreen(app) {
  const st = get(), pet = st.pet, view = G.academyView(st), at = attributes(st), prof = PET_PROFILES[pet.species];
  update(s => G.ensure(s));
  const today = dayKey(Date.now()), daily = G.dailyYarnFor(get(), today);
  const card = d => h('button', { class: 'acad-card', onclick: () => app.go('discipline', { d: d.id }), style: `--band:${BAND_COLOR[BAND(Math.max(1, d.rank + 1 > RANKS ? RANKS : d.rank + 1))]}` },
    h('span', { class: 'acad-icon' }, d.icon),
    h('div', {}, h('b', {}, d.name), h('span', { class: 'small' }, d.rank >= RANKS ? '🏅 MASTERED' : `Rank ${d.rank + 1} · ${BAND(d.rank + 1)}`),
      h('div', { class: 'bar' }, h('i', { style: `width:${100 * d.cleared / d.total}%` })), h('span', { class: 'tiny' }, `${d.cleared}/${d.total} nodes · ${d.stars}★ · ${ATTRS[d.attr].icon} ${ATTRS[d.attr].name}`)));
  app.mount(h('div', { class: 'screen academy' },
    h('div', { class: 'row' }, h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => app.go('home') }, '←'), h('h1', { style: 'margin:0' }, 'Training Academy')),
    h('div', { class: 'row acad-intro' }, livePet(() => pet, () => 'happy', 92),
      h('div', {}, h('p', { class: 'sub', style: 'margin:0' }, `${pet.name} is a `, h('b', {}, prof.archetype), `. ${prof.signature.name}: ${prof.signature.text}`),
        h('p', { class: 'small', style: 'margin:4px 0 0' }, `🧵 ${plural(st.threads || 0, 'Thread')} · ${plural((st.titles || []).length, 'title')}`))),
    h('div', { class: 'card attrs' }, h('b', {}, 'Attributes'), ...ATTR_ORDER.map(a => h('div', { class: 'attr', title: ATTRS[a].effect },
      h('span', {}, `${ATTRS[a].icon} ${ATTRS[a].name}`), h('div', { class: 'bar' }, h('i', { style: `width:${at[a]}%` })), h('span', { class: 'v' }, Math.round(at[a]))))),
    h('div', { class: 'row yarn-specials' },
      h('button', { class: 'card special', onclick: () => app.go('academyPlay', { daily: today }) }, h('b', {}, '🧶 Daily Yarn'), h('span', { class: 'small' }, daily.done ? '✓ Solved today — Endless Yarn is always open' : 'One shared puzzle a day · +XP +coins')),
      h('button', { class: 'card special', onclick: () => app.go('academyPlay', { endless: 1 }) }, h('b', {}, '♾️ Endless Yarn'), h('span', { class: 'small' }, `Best: level ${st.academy?.yarn?.endless?.best || 0} · XP only`))),
    h('div', { class: 'acad-grid' }, ...view.map(card)),
    h('button', { class: 'linkbtn', onclick: () => app.go('train') }, '🎓 Classic trick lessons (Sit, Jump, Dance…)')));
  track('academy_viewed', {});
}

/* ================================================================ RANK MAP */
export function disciplineScreen(app, { d }) {
  const st = get(), D = DISCIPLINES.find(x => x.id === d), rank = G.rankOf(st, d);
  const nodes = st.academy.disciplines[d].nodes;
  const rows = [];
  for (let r = 1; r <= RANKS; r++) {
    const rw = nodeOf(d, r, NODES_PER_RANK).reward;
    rows.push(h('div', { class: 'rank-row' + (r > rank + 1 ? ' locked' : ''), style: `--band:${BAND_COLOR[BAND(r)]}` },
      h('div', { class: 'rank-label' }, h('b', {}, `Rank ${r}`), h('span', { class: 'tiny' }, BAND(r))),
      h('div', { class: 'nodes' }, ...Array.from({ length: NODES_PER_RANK }, (_, i) => {
        const n = i + 1, id = `${d}-${r}-${n}`, s = nodes[id] || 0, open = G.isOpen(st, d, r, n);
        return h('button', { class: 'node' + (s ? ' done' : '') + (open ? '' : ' shut') + (n === NODES_PER_RANK ? ' boss' : ''), 'aria-label': `Rank ${r} node ${n}${s ? `, ${plural(s, 'star')}` : ''}`,
          onclick: () => open ? app.go('academyPlay', { d, r, n }) : toast(r > rank + 1 ? `Clear rank ${r - 1} first` : 'Clear the previous node first') },
          open || s ? (n === NODES_PER_RANK ? '⭐' : n) : '🔒', s ? h('small', {}, '★'.repeat(s)) : null);
      })),
      rw ? h('div', { class: 'rank-reward tiny' }, rewardText(rw)) : null));
  }
  app.mount(h('div', { class: 'screen academy' },
    h('div', { class: 'row' }, h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => app.go('academy') }, '←'), h('h1', { style: 'margin:0' }, `${D.icon} ${D.name}`)),
    h('p', { class: 'sub' }, D.blurb), h('div', { class: 'rank-map' }, ...rows)));
}
function rewardText(rw) {
  const parts = [];
  for (const id of rw.items || []) parts.push('🎁 ' + (itemOf(id)?.name || id));
  if (rw.trick) parts.push('🎓 trick'); if (rw.threads) parts.push(`🧵 ${rw.threads}`); if (rw.grow) parts.push(`+${rw.grow} attribute`); if (rw.title) parts.push(`🏷️ “${rw.title}”`);
  return parts.join(' · ');
}

/* ================================================================ PLAY */
export function academyPlayScreen(app, p) {
  const st = get(), pet = st.pet, assist = perkTotals(st).total.trainingAssist || 0;
  const def = p.daily ? dailyYarn(p.daily) : p.endless ? G.endlessNext(st) : nodeOf(p.d, p.r, p.n);
  const D = DISCIPLINES.find(x => x.id === def.discipline);
  let pose = 'idle', poseUntil = 0;
  const react = (ps, ms = 700) => { pose = ps; poseUntil = performance.now() + ms; };
  const petEl = livePet(() => pet, () => (performance.now() < poseUntil ? pose : 'idle'), 110);
  const stage = h('div', { class: 'game-stage' });
  const status = h('div', { class: 'game-status' });
  const title = p.daily ? '🧶 Daily Yarn' : p.endless ? `♾️ Endless Yarn · level ${(st.academy.yarn.endless.current || 0) + 1}` : `${D.icon} ${D.name} · Rank ${def.rank} · ${def.band} · ${def.index}/${NODES_PER_RANK}`;
  app.mount(h('div', { class: 'screen academy-play' },
    h('div', { class: 'row' }, h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => back() }, '←'), h('b', { class: 'game-title' }, title)),
    h('div', { class: 'row', style: 'justify-content:center;gap:10px' }, petEl, status), stage));
  track('academy_node_started', { node: def.id });
  const back = () => app.go(p.d ? 'discipline' : 'academy', p.d ? { d: p.d } : {});
  let done = false;
  const finish = (stars, extra = {}) => {
    if (done) return; done = true;
    let res;
    update(s => {
      if (p.daily) res = { ...G.completeDaily(s, p.daily, stars), stars };
      else if (p.endless) res = stars ? { ...G.completeEndless(s, (s.academy.yarn.endless.current || 0) + 1), stars } : (G.resetEndless(s), { stars: 0 });
      else res = G.complete(s, p.d, p.r, p.n, stars);
      if (stars) { Wd.completeLife(s, 'train'); if (res.first) Wd.projectEvent(s, 'train'); }
    });
    track('academy_node_completed', { node: def.id, stars });
    if (res.rankUp) track('academy_rank_up', { discipline: p.d, rank: res.rankUp });
    stars ? (sfx.unlock(), haptic('success'), react('jump', 1500)) : react('surprised', 1200);
    const walk = (() => { let w; update(s => { w = G.walkPrompt(s); }); return w; })();
    const layer = h('div', { class: 'levelup' }, h('div', { class: 'card' },
      h('p', { class: 'tag', style: 'margin:0' }, stars ? (res.rankUp ? `RANK ${res.rankUp} COMPLETE!` : 'NICE WORK!') : 'SO CLOSE!'),
      h('div', { class: 'big-stars' }, '★'.repeat(stars) + '☆'.repeat(3 - stars)),
      stars ? h('p', { class: 'small' }, [res.xp ? `+${res.xp} XP` : null, res.coins ? `+${res.coins} coins` : null, extra.note].filter(Boolean).join(' · ')) : h('p', { class: 'small' }, 'No stars this time — nothing lost. Try again!'),
      ...(res.rewards || []).map(r => h('p', { class: 'reward-line' }, r.item ? `🎁 ${itemOf(r.item)?.name}` : r.threads ? `🧵 +${plural(r.threads, 'Thread')}` : r.title ? `🏷️ Title: ${r.title}` : r.trick ? `🎓 New trick: ${r.trick}` : r.attr ? `${ATTRS[r.attr].icon} ${ATTRS[r.attr].name} +${Math.round(r.grow)}` : '')),
      walk ? h('div', { class: 'walk-prompt' }, h('p', { class: 'small', style: 'margin:6px 0' }, walk.text.replace(/\{name\}/g, pet.name)),
        h('div', { class: 'row', style: 'gap:6px;justify-content:center' },
          h('button', { class: 'btn mint', onclick: () => { track('walk_prompt_accepted', {}); layer.remove(); app.go('walk'); } }, '🥾 ' + walk.options[0].replace('{NAME}', pet.name.toUpperCase())),
          h('button', { class: 'btn ghost', onclick: () => { layer.remove(); } }, walk.options[1]))) : null,
      h('div', { class: 'row', style: 'gap:6px;justify-content:center;margin-top:10px' },
        h('button', { class: 'btn ghost', onclick: () => { layer.remove(); app.go('academyPlay', p.endless && !stars ? { endless: 1 } : p); } }, stars && p.endless ? 'NEXT LEVEL ➜' : '🔁 AGAIN'),
        !p.endless && stars ? h('button', { class: 'btn', onclick: () => { layer.remove(); const nx = p.d && G.nextNode(get(), p.d); nx ? app.go('academyPlay', { d: nx.discipline, r: nx.rank, n: nx.index }) : back(); } }, 'NEXT ➜') : null,
        h('button', { class: 'linkbtn', onclick: () => { layer.remove(); back(); } }, 'Map'))));
    if (walk) track('walk_prompt_shown', {});
    setTimeout(() => document.body.append(layer), 700);
    if (res.levelUp) setTimeout(() => levelUpCard({ levelUp: res.levelUp }), 1600);
  };
  window.PokaAcademy = { finish: s => finish(s) };   // QA hook (capture harness only)
  const G_ = { yarn: yarnGame, agility: agilityGame, fetch: fetchGame, scent: scentGame, trick: trickGame, focus: focusGame }[def.discipline];
  const stop = G_({ stage, status, def, assist, react, finish, pet });
  return () => { done = true; stop?.(); delete window.PokaAcademy; };
}

/* ================================================================ YARN LAB */
function yarnGame({ stage, status, def, react, finish }) {
  const b = G.yarnBoard(def.params, def.seed), mode = def.params.mode, t0 = performance.now();
  let sel = null, timer = 0;
  const left = () => Math.max(0, Math.ceil(def.params.seconds - (performance.now() - t0) / 1000));
  if (mode === 'timed') timer = setInterval(() => { if (!document.body.contains(stage)) return clearInterval(timer); render(); if (!left()) { clearInterval(timer); finish(0); } }, 500);
  const render = () => {
    status.replaceChildren(h('div', { class: 'game-hud' }, h('b', {}, `Moves ${b.moves}${b.limit ? ' / ' + b.limit : ''}`), h('span', { class: 'tiny' }, mode === 'perfect' ? '✨ Perfect clear — no undo' : mode === 'timed' ? `⏱ ${left()} s left` : `Par ${b.colors * (b.height - 1) + 2} for ★★★`)));
    stage.replaceChildren(
      h('div', { class: 'yarn-board' + (b.spools.length > 8 ? ' dense' : ''), style: `--h:${b.height}` }, ...b.spools.map((sp, i) => {
        const lock = b.locked.find(l => l.spool === i && b.moves < l.opensAt);
        return h('button', { class: 'spool' + (sel === i ? ' sel' : '') + (lock ? ' lock' : ''), 'aria-label': `Spool ${i + 1}${lock ? ', locked' : ''}`, onclick: () => tap(i) },
          lock ? h('span', { class: 'lock-badge' }, `🔒 ${lock.opensAt - b.moves}`) : null,
          ...sp.map((c, k) => h('i', { class: 'ball' + (sel === i && k >= sp.length - 1 ? ' lift' : ''), style: `background:${YARN_COLORS[c]}` })));
      })),
      h('div', { class: 'row', style: 'gap:8px;justify-content:center' },
        mode === 'perfect' ? null : h('button', { class: 'btn ghost', onclick: () => { if (G.yarnUndo(b)) { sel = null; render(); } } }, '↶ Undo'),
        h('button', { class: 'btn ghost', onclick: () => { const hnt = G.yarnHint(b); if (hnt) { sel = hnt.from; render(); toast(`Try spool ${hnt.from + 1} → ${hnt.to + 1}`); } else toast('No moves left — undo a few'); } }, '💡 Hint')));
  };
  const tap = i => {
    if (sel == null) { if (b.spools[i].length) { sel = i; sfx.tap(); } }
    else if (sel === i) sel = null;
    else if (G.yarnMove(b, sel, i)) { sel = null; sfx.pose(); haptic('light'); if (G.yarnSolved(b)) { clearInterval(timer); render(); react('happy', 2000); return setTimeout(() => finish(G.yarnStars(b), { note: `${b.moves} moves` }), 500); } if (G.yarnOutOfMoves(b)) { render(); return finish(0); } }
    else { sel = i; sfx.tap(); react('surprised', 400); }
    render();
  };
  render();
  // QA/capture hook: replay a verified solution move by move (never exposed in the UI)
  window.PokaYarnSolve = async (ms = 120) => { const path = G.yarnSolve(b); if (!path) return false; for (const [f, t] of path) { sel = f; render(); await new Promise(r => setTimeout(r, ms / 2)); tap(t); await new Promise(r => setTimeout(r, ms / 2)); } return true; };
}

/* ================================================================ AGILITY */
function agilityGame({ stage, status, def, assist, react, finish }) {
  const P = def.params, beatMs = 60000 / P.bpm, win = P.window * (1 + assist), total = FAST() ? 4 : P.beats;
  let hits = 0, idx = 0, raf = 0, t0 = performance.now() + 1200, judged = new Set();
  const track_ = h('div', { class: 'agility-track' }), marks = [];
  for (let k = 0; k < total; k++) { const m = h('div', { class: 'obstacle' }, P.obstacles[k % P.obstacles.length] === 'weave' ? '〰️' : P.obstacles[k % P.obstacles.length] === 'tunnel' ? '🌀' : '🚧'); marks.push(m); track_.append(m); }
  const tapBtn = h('button', { class: 'btn big', onclick: () => press() }, '⬆ JUMP!');
  stage.replaceChildren(h('p', { class: 'small', style: 'text-align:center' }, 'Tap JUMP as each obstacle reaches the paw line.'), h('div', { class: 'agility-wrap' }, h('div', { class: 'paw-line' }), track_), tapBtn);
  const at = k => t0 + k * beatMs;
  const press = () => {
    const now = performance.now(); let best = -1, bd = 1e9;
    for (let k = 0; k < total; k++) { if (judged.has(k)) continue; const d = Math.abs(now - at(k)); if (d < bd) { bd = d; best = k; } }
    if (best >= 0 && bd <= win) { judged.add(best); hits++; marks[best].classList.add('hit'); react('jump', 400); sfx.pose(); } else { react('surprised', 300); sfx.tap(); }
  };
  const loop = now => {
    for (let k = 0; k < total; k++) { const x = 50 + (at(k) - now) / beatMs * 18; marks[k].style.left = x + '%'; if (!judged.has(k) && now > at(k) + win) { judged.add(k); marks[k].classList.add('miss'); } }
    status.replaceChildren(h('div', { class: 'game-hud' }, h('b', {}, `${hits} / ${total}`), h('span', { class: 'tiny' }, `${P.bpm} bpm · ±${Math.round(win)} ms`)));
    if (judged.size >= total) return finish(G.gameStars('agility', { hits, total }));
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  window.PokaAcademyAuto = () => { hits = total; for (let k = 0; k < total; k++) judged.add(k); };
  return () => cancelAnimationFrame(raf);
}

/* ================================================================ FETCH */
function fetchGame({ stage, status, def, assist, react, finish }) {
  const P = def.params, R = rng(def.seed), total = FAST() ? 2 : P.throws, zoneW = P.zone * (1 + assist);
  let hits = 0, thrown = 0, raf = 0, power = 0, dir = 1, zone = 0.45 + R() * 0.3, wind = (R() - 0.5) * 2 * P.wind, zdir = 1;
  const meter = h('div', { class: 'fetch-meter' }), needle = h('i', { class: 'needle' }), zoneEl = h('b', { class: 'zone' });
  meter.append(zoneEl, needle);
  const info = h('p', { class: 'small', style: 'text-align:center' });
  const btn = h('button', { class: 'btn big', onclick: () => throwIt() }, '🎾 THROW');
  stage.replaceChildren(h('p', { class: 'small', style: 'text-align:center' }, 'Stop the power bar inside the green zone.'), meter, info, btn);
  const throwIt = () => {
    const land = power + wind;
    const ok = Math.abs(land - zone) <= zoneW / 2;
    thrown++; if (ok) { hits++; react('catch', 900); sfx.pose(); } else react('surprised', 500);
    info.textContent = ok ? 'Great catch!' : land < zone ? 'A little short…' : 'Too far!';
    zone = 0.3 + R() * 0.55; wind = (R() - 0.5) * 2 * P.wind;
    if (thrown >= total) setTimeout(() => finish(G.gameStars('fetch', { hits, total })), 600);
  };
  const loop = () => {
    power += dir * (0.012 + def.rank * 0.0012); if (power > 1 || power < 0) { dir *= -1; power = Math.max(0, Math.min(1, power)); }
    if (P.moving) { zone += zdir * 0.003; if (zone > 0.85 || zone < 0.2) zdir *= -1; }
    needle.style.left = power * 100 + '%'; zoneEl.style.left = (zone - zoneW / 2) * 100 + '%'; zoneEl.style.width = zoneW * 100 + '%';
    status.replaceChildren(h('div', { class: 'game-hud' }, h('b', {}, `${hits} / ${total}`), h('span', { class: 'tiny' }, P.wind ? `💨 wind ${wind > 0 ? '→' : '←'}` : 'calm')));
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf);
}

/* ================================================================ SCENT HUNT */
function scentGame({ stage, status, def, react, finish }) {
  const P = def.params, R = rng(def.seed), N = P.grid;
  const treat = { x: Math.floor(R() * N), y: Math.floor(R() * N) };
  const decoys = Array.from({ length: P.decoys }, () => ({ x: Math.floor(R() * N), y: Math.floor(R() * N) })).filter(d => d.x !== treat.x || d.y !== treat.y);
  let left = P.sniffs;
  const cells = [];
  const grid = h('div', { class: 'scent-grid', style: `grid-template-columns:repeat(${N},1fr)` });
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const c = h('button', { class: 'cell', 'aria-label': `Sniff ${x + 1},${y + 1}`, onclick: () => sniff(x, y, c) }, '🌿'); cells.push(c); grid.append(c); }
  stage.replaceChildren(h('p', { class: 'small', style: 'text-align:center' }, 'Tap to sniff. 🔥 hot · 🌤️ warm · ❄️ cold. Some spots smell like decoys!'), grid);
  const hud = () => status.replaceChildren(h('div', { class: 'game-hud' }, h('b', {}, `👃 ${plural(left, 'sniff')} left`), h('span', { class: 'tiny' }, `${N}×${N} garden`)));
  const sniff = (x, y, c) => {
    if (c.disabled) return; c.disabled = true; left--;
    if (x === treat.x && y === treat.y) { c.textContent = '🦴'; c.classList.add('found'); react('happy', 1500); sfx.unlock(); hud(); return setTimeout(() => finish(G.gameStars('scent', { found: true, sniffsLeft: left })), 500); }
    const dist = Math.min(Math.abs(x - treat.x) + Math.abs(y - treat.y), ...decoys.map(d => Math.abs(x - d.x) + Math.abs(y - d.y) + 1));
    c.textContent = dist <= 1 ? '🔥' : dist <= 3 ? '🌤️' : '❄️'; react(dist <= 1 ? 'look' : 'sniff', 500); sfx.tap();
    hud(); if (left <= 0) setTimeout(() => finish(0), 500);
  };
  hud();
}

/* ================================================================ TRICK STUDIO */
function trickGame({ stage, status, def, assist, react, finish }) {
  /* 1.4: real trick mastery — each cue maps to a TRICK the pet visibly performs. From rank 4
     some cues must be HELD (a steady "stay" gesture) instead of tapped, and distractions
     flash during the demonstration. Mistakes replay the sequence; three end the attempt. */
  const P = def.params, R = rng(def.seed);
  const CUES = [['🐾', 'sit'], ['⭐', 'jump'], ['❤️', 'heart'], ['🎾', 'catch'], ['🦴', 'sitpretty'], ['🌙', 'roll'], ['🎵', 'dance']].slice(0, P.symbols);
  const seq = Array.from({ length: P.length }, () => Math.floor(R() * CUES.length));
  const holds = new Set(def.rank >= 4 ? seq.map((_, i) => i).filter(() => R() < 0.3) : []);
  let pos = 0, mistakes = 0, showing = true, timers = [], downAt = 0;
  const show = h('div', { class: 'trick-show' }), distract = h('div', { class: 'trick-distract' });
  const pads = h('div', { class: 'trick-pads' }, ...CUES.map(([sym], i) => {
    const b = h('button', { class: 'pad', 'aria-label': `Cue ${sym}` }, sym);
    b.addEventListener('pointerdown', () => { downAt = performance.now(); });
    b.addEventListener('pointerup', () => press(i, performance.now() - downAt >= 450));
    b.addEventListener('click', e => { if (!downAt) press(i, false); downAt = 0; });   // keyboard / synthetic clicks
    return b;
  }));
  stage.replaceChildren(h('p', { class: 'small', style: 'text-align:center' }, def.rank >= 4 ? 'Watch the cues, then repeat them. A ring means HOLD the cue (stay!).' : 'Watch the cues, then repeat them in order.'), show, distract, pads);
  const hud = () => status.replaceChildren(h('div', { class: 'game-hud' }, h('b', {}, showing ? 'Watch…' : `Your turn ${pos}/${seq.length}`), h('span', { class: 'tiny' }, `mistakes ${mistakes}/2`)));
  const play = () => {
    showing = true; pos = 0; hud(); pads.classList.add('wait');
    const step = Math.round(P.showMs * (1 + assist));
    seq.forEach((c, k) => timers.push(setTimeout(() => {
      show.textContent = CUES[c][0]; show.classList.toggle('hold', holds.has(k)); show.classList.remove('pulse'); void show.offsetWidth; show.classList.add('pulse'); react(CUES[c][1], step - 60);
      if (def.rank >= 5 && R() < 0.4) { distract.textContent = ['🐿️', '🔔', '🦋', '🍕'][Math.floor(R() * 4)]; timers.push(setTimeout(() => { distract.textContent = ''; }, step * 0.6)); }
    }, 400 + k * step)));
    timers.push(setTimeout(() => { show.textContent = '❓'; show.classList.remove('hold'); showing = false; pads.classList.remove('wait'); hud(); }, 400 + seq.length * step));
  };
  const press = (i, held) => {
    if (showing) return;
    const wantHold = holds.has(pos);
    if (i === seq[pos] && (!wantHold || held)) { react(CUES[i][1], 600); pos++; sfx.pose(); if (pos >= seq.length) { react('bow', 1600); return finish(G.gameStars('trick', { correct: true, mistakes })); } }
    else { mistakes++; react('surprised', 600); haptic('light'); if (mistakes > 2) return finish(0); toast(wantHold && i === seq[pos] ? 'Hold that one — stay!' : 'Oops — watch again'); play(); }
    hud();
  };
  play();
  window.PokaTrickSeq = () => seq.map((c, k) => ({ sym: CUES[c][0], hold: holds.has(k) }));   // QA: the harness plays the same cues a player sees
  return () => timers.forEach(clearTimeout);
}

/* ================================================================ FOCUS */
function focusGame({ stage, status, def, assist, react, finish }) {
  const P = def.params, R = rng(def.seed), dur = (FAST() ? 4 : P.duration) * 1000, win = P.window * (1 + assist);
  const events = [];
  for (let k = 0; k < P.signals; k++) events.push({ at: 800 + R() * (dur - 1600), good: true });
  for (let k = 0; k < P.distractors; k++) events.push({ at: 600 + R() * (dur - 1200), good: false });
  events.sort((a, b) => a.at - b.at);
  let hits = 0, bad = 0, cur = null, t0 = performance.now(), timers = [];
  const light = h('button', { class: 'focus-light', 'aria-label': 'Tap only on the green paw', onclick: () => tap() }, '…');
  stage.replaceChildren(h('p', { class: 'small', style: 'text-align:center' }, 'Tap only when the 🟢 paw appears. Ignore everything else!'), light);
  const hud = () => status.replaceChildren(h('div', { class: 'game-hud' }, h('b', {}, `✓ ${hits}/${P.signals}  ✗ ${bad}`), h('span', { class: 'tiny' }, `${Math.max(0, Math.ceil((dur - (performance.now() - t0)) / 1000))}s`)));
  for (const e of events) timers.push(setTimeout(() => {
    cur = { ...e, shown: performance.now() };
    light.textContent = e.good ? '🟢🐾' : ['🔴', '🐿️', '🔔', '🦋'][Math.floor(R() * 4)]; light.className = 'focus-light ' + (e.good ? 'go' : 'no');
    timers.push(setTimeout(() => { if (cur && cur.shown === cur.shown) { light.textContent = '…'; light.className = 'focus-light'; cur = null; } }, e.good ? win : 700));
  }, e.at));
  const tap = () => { if (cur?.good) { hits++; cur = null; light.textContent = '✓'; react('sit', 400); sfx.pose(); } else { bad++; react('surprised', 400); } hud(); };
  const iv = setInterval(hud, 250);
  timers.push(setTimeout(() => { clearInterval(iv); finish(G.gameStars('focus', { hits: Math.max(0, hits - bad), total: P.signals })); }, dur + 300));
  hud();
  return () => { timers.forEach(clearTimeout); clearInterval(iv); };
}
