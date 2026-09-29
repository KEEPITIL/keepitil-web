/* Permanent navigation: WINS | POKA | SNAP | PETS | ALBUM (order is locked; SNAP is the big raised centre).
   2.1: the centre SNAP is the ONE shutter in the app. On the living world (or a game's photo moment) it
   takes the photo via window.__snapAction; anywhere else it returns to the world. No screen ever draws a
   second persistent shutter (tools/tests/v21.mjs counts them).
   Screens that belong to a tab mount inside shell(), which adds the bar and reserves its height,
   so no content ever sits under it. */

import { h, fmt } from '../ui.js';
import { get } from '../game/state.js';
import { NAV, NAV_LABEL, winsView, ensureV2 } from '../game/v2.js';
import { sfx } from '../platform/sound.js';

const ICON = { wins: '🏆', poka: '🐾', snap: '📸', pets: '🤝', album: '📖' };

export function navBar(app, active) {
  let badge = 0; try { const st = get(); ensureV2(st); badge = winsView(st).claimable; } catch (e) {}
  return h('nav', { class: 'navbar', 'aria-label': 'Main' }, ...NAV.map(id => h('button', {
    class: 'nav-' + id + (id === active ? ' on' : ''), 'data-nav': id, 'aria-current': id === active ? 'page' : null, 'aria-label': NAV_LABEL[id],
    onclick: () => {
      if (id === 'snap' && typeof window.__snapAction === 'function') return window.__snapAction();
      if (id === app.route && id !== 'snap') return; sfx.tap?.(); app.go(id); } },
    h('span', { class: 'ni', 'aria-hidden': 'true' }, id === 'snap' ? h('span', { class: 'shutter-ic' }) : ICON[id]), h('span', { class: 'nl' }, NAV_LABEL[id]),
    id === 'wins' && badge ? h('i', { class: 'nav-badge', 'aria-label': `${badge} to claim` }, String(badge)) : null)));
}

/** A tab screen: header + scrolling body + the bar. */
export function shell(app, active, { title, sub, right, cls = '' }, ...body) {
  return h('div', { class: 'screen tabscreen ' + cls },
    h('div', { class: 'tab-head' }, h('div', {}, h('h1', {}, title), sub ? h('p', { class: 'sub' }, sub) : null), right || null),
    h('div', { class: 'tab-body' }, ...body),
    navBar(app, active));
}

/** Big balances stay readable in a small pill: 98.8M, 123K (the exact value is in the label). */
export const compact = n => n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M` : n >= 1e5 ? `${Math.round(n / 1e3)}K` : fmt(n);
export function currencyPills(app) {
  const p = get().progress;
  return h('div', { class: 'cur-pills' },
    h('button', { class: 'cur coins', 'aria-label': `${fmt(p.coins || 0)} coins — open Poka Shop`, onclick: () => app.go('store', { from: app.route }) }, h('span', { class: 'coin' }), h('b', {}, compact(p.coins || 0))),
    h('button', { class: 'cur dia', 'aria-label': `${fmt(p.diamonds || 0)} diamonds — open Poka Shop`, onclick: () => app.go('store', { from: app.route }) }, '💎', h('b', {}, compact(p.diamonds || 0))));
}
