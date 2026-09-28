/* MASTER CATALOG · STAR TRACK · CHALLENGES BY GATE
   ---------------------------------------------------------------------------
   The catalog shows EVERY collectible with its real art. Anything whose art
   cannot be drawn shows a loud MISSING ART tile instead of silently vanishing,
   so a gap is visible to players, QA and Echo alike. */

import { h, fmt, toast } from '../ui.js';
import { get, update } from '../game/state.js';
import { ITEMS, CATEGORIES, RARITIES } from '../data/items.js';
import { accessKind } from '../game/entitlements.js';
import { drawItemThumb, DRAW, FRAMES } from '../render/items.js';
import { PROPS, BACKDROPS, LOOKS, EFFECTS } from '../render/wardrobe.js';
import { portrait } from '../render/pet.js';
import { PERKS, PET_PROFILES, PLANNED_PETS } from '../data/attributes.js';
import { POSES } from '../data/poses.js';
import { SPECIES, LAUNCH_SPECIES } from '../data/pets.js';
import { STAR_TRACK, STAR_TEXT, GATES } from '../data/progression.js';
import { CHALLENGES } from '../data/challenges.js';
import { totalStars } from '../game/progress.js';
import { item as itemOf } from '../data/items.js';
import { track } from '../platform/analytics.js';

export function hasArt(it) {
  switch (it.slot) {
    case 'POSE': return !!POSES[it.pose];
    case 'LOOK': return LAUNCH_SPECIES.every(sp => SPECIES[sp].appearances.some(a => a.item === it.itemID));
    case 'PROP': return !!PROPS[it.draw];
    case 'BG': return !!BACKDROPS[it.draw];
    case 'FILTER': return !!(EFFECTS[it.itemID] || LOOKS[it.draw]);
    case 'FRAME': return !!FRAMES[it.draw];
    default: return !!DRAW[it.draw];
  }
}
export function tile(id, size = 96) {
  const it = itemOf(id), c = h('canvas', { width: size * 2, height: size * 2, style: `width:${size}px;height:${size}px` });
  if (!it || !hasArt(it)) return h('div', { class: 'missing-art', style: `width:${size}px;height:${size}px` }, 'MISSING ART');
  drawItemThumb(c, id); return c;
}

const ROUTE_ICON = { COIN: '🪙', DIAMOND: '💎', LEVEL: '⬆️', STAR: '⭐', TRAINING: '🎓', EVENT: '🧭', WALKING: '🥾', ADVENTURE_BOOK: '📔', ACHIEVEMENT: '🏅', PRESTIGE: '👑', PLUS_PURCHASE: '🌟', PLUS_ACCESS: '🌟', DIRECT_PURCHASE: '💳', SEASONAL: '🍂' };
const has = (it, t) => it.paths.some(p => p.type === t);
const levelOf = it => it.paths.find(p => p.type === 'LEVEL')?.level;
/* Owner/developer catalog: the directive's 22 categories. */
export const CATALOG_CATS = {
  PETS: null, OUTFITS: it => it.category === 'outfit' && it.slot === 'BODY', HEADWEAR: it => it.category === 'headwear', ACCESSORIES: it => it.category === 'accessory',
  PROPS: it => it.slot === 'PROP', POSES: it => it.slot === 'POSE', ANIMATIONS: it => it.slot === 'LOOK', BACKGROUNDS: it => it.slot === 'BG',
  FILTERS: it => it.slot === 'FILTER' && !EFFECTS[it.itemID], EFFECTS: it => it.slot === 'FILTER' && !!EFFECTS[it.itemID], FRAMES: it => it.slot === 'FRAME',
  SETS: it => !!it.set, TRAINING: it => has(it, 'TRAINING'), 'LEVEL REWARDS': it => levelOf(it) > 0, 'STAR REWARDS': it => has(it, 'STAR'), EVENTS: it => has(it, 'EVENT'),
  'COIN STORE': it => has(it, 'COIN'), 'DIAMOND STORE': it => has(it, 'DIAMOND'), PLUS: it => has(it, 'PLUS_ACCESS') || has(it, 'PLUS_PURCHASE') || it.paths.some(p => p.plusAuto),
  PRESTIGE: it => it.prestige, SEASONAL: it => has(it, 'SEASONAL'), UNRELEASED: it => it.release.status !== 'LIVE',
};
export function catalogScreen(app, opts = {}) {
  track('catalog_viewed', {});
  const st = get();
  const F = { cat: opts.cat || 'OUTFITS', rarity: 'all', level: 'all', route: 'all', season: 'all', attr: 'all', pet: 'all', release: 'all', own: 'all', view: opts.view || 'ALL', sort: 'newest' };
  const favs = () => new Set(get().favorites || []);
  const VIEWS = { ALL: () => true, NEW: it => (Date.now() - +new Date(it.release.date || 0)) < 45 * 864e5, OWNED: it => accessKind(get(), it.itemID) === 'owned', FAVORITES: it => favs().has(it.itemID),
    EARNABLE: it => it.paths.some(p => ['LEVEL', 'STAR', 'TRAINING', 'EVENT', 'WALKING', 'ADVENTURE_BOOK', 'ACHIEVEMENT', 'PRESTIGE'].includes(p.type)), COINS: it => has(it, 'COIN'), DIAMONDS: it => has(it, 'DIAMOND'),
    PLUS: it => has(it, 'PLUS_ACCESS') || has(it, 'PLUS_PURCHASE'), PRESTIGE: it => it.prestige, SEASONAL: it => has(it, 'SEASONAL') || !!it.season };
  const RANK = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
  const price = it => it.paths.find(p => p.type === 'COIN')?.cost ?? (it.paths.find(p => p.type === 'DIAMOND')?.cost * 20) ?? 1e9;
  const SORTS = { newest: (a, b) => String(b.release.date).localeCompare(String(a.release.date)), rarity: (a, b) => RANK[b.rarity] - RANK[a.rarity], earnable: (a, b) => Number(VIEWS.EARNABLE(b)) - Number(VIEWS.EARNABLE(a)),
    price: (a, b) => price(a) - price(b), seasonal: (a, b) => Number(!!b.season) - Number(!!a.season) };
  const toggleFav = id => update(x => { const f = new Set(x.favorites || []); f.has(id) ? f.delete(id) : f.add(id); x.favorites = [...f]; });
  const chips = h('div', { class: 'tabs wrap' }), views = h('div', { class: 'tabs wrap cat-views' }), grid = h('div', { class: 'catalog-grid' }), count = h('span', { class: 'small' });
  const opt = (k, label, vals) => h('select', { 'aria-label': label, onchange: e => { F[k] = e.target.value; draw(); } }, h('option', { value: 'all' }, label), ...vals.map(([v, t]) => h('option', { value: v }, t || v)));
  const filters = h('div', { class: 'row filters', style: 'gap:6px;flex-wrap:wrap' },
    opt('rarity', 'Any rarity', RARITIES.map(r => [r])), opt('level', 'Any level', [['1-19', 'Levels 1–19'], ['20-39', '20–39'], ['40-59', '40–59'], ['60-79', '60–79'], ['80-100', '80–100']]),
    opt('route', 'Any acquisition', Object.keys(ROUTE_ICON).map(r => [r, `${ROUTE_ICON[r]} ${r}`])), opt('season', 'Any season', [...new Set(ITEMS.map(i => i.season).filter(Boolean))].map(x => [x])),
    opt('attr', 'Any attribute', Object.entries(PERKS).map(([k, d]) => [k, d.name])), opt('pet', 'Any pet', LAUNCH_SPECIES.map(sp => [sp, SPECIES[sp].name])),
    opt('release', 'Any release', [['LIVE'], ['PLANNED']]), opt('own', 'Any ownership', [['owned', 'Yours forever'], ['plus', 'Plus access'], ['locked', 'Locked']]));
  const pass = it => (F.rarity === 'all' || it.rarity === F.rarity)
    && (F.level === 'all' || (() => { const l = levelOf(it), [a, b] = F.level.split('-').map(Number); return l != null && l >= a && l <= b; })())
    && (F.route === 'all' || has(it, F.route)) && (F.season === 'all' || it.season === F.season) && (F.attr === 'all' || it.perks.some(p => p.perk === F.attr))
    && (F.pet === 'all' || it.petCompatibility.includes(F.pet)) && (F.release === 'all' || it.release.status === F.release)
    && (F.own === 'all' || (F.own === 'locked' ? !accessKind(st, it.itemID) : accessKind(st, it.itemID) === (F.own === 'owned' ? 'owned' : 'plus')));
  const petTile = sp => { const c = h('canvas', { width: 144, height: 144, style: 'width:72px;height:72px' }); portrait(c, { species: sp, appearance: SPECIES[sp].appearances[0].id, equipped: {} }, 'happy', { t: 0.3 });
    return h('div', { class: 'cat-tile has' }, c, h('b', {}, SPECIES[sp].name), h('span', { class: 'tiny' }, `LIVE · ${PET_PROFILES[sp].archetype}`)); };
  const draw = () => {
    chips.replaceChildren(...Object.keys(CATALOG_CATS).map(c => h('button', { class: c === F.cat ? 'on' : '', onclick: () => { F.cat = c; draw(); } }, c)));
    if (F.cat === 'PETS') { count.textContent = `${LAUNCH_SPECIES.length} live pets · ${PLANNED_PETS.length} planned (not live)`; grid.replaceChildren(...LAUNCH_SPECIES.map(petTile), ...PLANNED_PETS.map(p => h('div', { class: 'cat-tile' }, h('div', { class: 'missing-art', style: 'width:72px;height:72px' }, 'PLANNED'), h('b', {}, p.name), h('span', { class: 'tiny' }, 'NOT LIVE')))); return; }
    views.replaceChildren(...Object.keys(VIEWS).map(v => h('button', { class: v === F.view ? 'on' : '', onclick: () => { F.view = v; draw(); } }, v === 'FAVORITES' ? '❤️ FAVORITES' : v)),
      h('select', { 'aria-label': 'Sort', onchange: e => { F.sort = e.target.value; draw(); } }, ...[['newest', 'Newest'], ['rarity', 'Rarity'], ['earnable', 'Earnable first'], ['price', 'Price'], ['seasonal', 'Seasonal']].map(([v, l]) => h('option', { value: v, selected: v === F.sort ? '' : null }, `Sort: ${l}`))));
    const list = ITEMS.filter(it => (F.view !== 'ALL' || CATALOG_CATS[F.cat](it)) && VIEWS[F.view](it) && pass(it)).sort(SORTS[F.sort]);
    count.textContent = `${list.length} items · ${list.filter(i => !hasArt(i)).length} missing art`;
    grid.replaceChildren(...list.map(it => { const k = accessKind(st, it.itemID);
      return h('button', { class: `cat-tile rar-${it.rarity}` + (k ? ' has' : ''), onclick: () => app.go('item', { id: it.itemID }) },
        h('span', { class: 'lockstate', 'aria-label': k ? 'unlocked' : 'locked' }, k === 'owned' ? '✓' : k === 'plus' ? '🌟' : '🔒'),
        h('span', { class: 'fav' + (favs().has(it.itemID) ? ' on' : ''), role: 'button', 'aria-label': favs().has(it.itemID) ? `Remove ${it.name} from favourites` : `Favourite ${it.name}`, onclick: e => { e.stopPropagation(); toggleFav(it.itemID); draw(); } }, favs().has(it.itemID) ? '❤️' : '🤍'),
        tile(it.itemID, 72), h('b', {}, it.name), h('span', { class: `rar-chip rar-${it.rarity}` }, it.rarity + (it.prestige ? ' · 👑' : '')),
        h('span', { class: 'tiny' }, [...new Set(it.paths.map(p => ROUTE_ICON[p.type]))].join(' '))); }));
  };
  app.mount(h('div', { class: 'screen catalog' },
    h('div', { class: 'row' }, h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => app.go(opts.back || 'store') }, '←'), h('h1', { style: 'margin:0' }, 'Master Catalog')),
    views, chips, filters, count, grid));
  draw();
}

export function starsScreen(app) {
  const st = get(), have = totalStars(st), max = CHALLENGES.length * 5;
  const next = STAR_TRACK.find(m => m.stars > have);
  const byGate = GATES.map((g, i) => {
    const hi = GATES[i + 1]?.level ?? 999, list = CHALLENGES.filter(c => (c.level || 1) >= g.level && (c.level || 1) < hi);
    const got = list.reduce((a, c) => a + (st.stars?.[c.missionID] || 0), 0);
    return h('div', { class: 'gate-row' + (st.progress.level >= g.level ? '' : ' locked') }, h('b', {}, `${g.icon} ${g.name}`), h('span', { class: 'small' }, st.progress.level >= g.level ? `${got} / ${list.length * 5} ★ · ${list.length} challenges` : `Unlocks at level ${g.level}`));
  });
  app.mount(h('div', { class: 'screen stars' },
    h('div', { class: 'row' }, h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => app.go('home') }, '←'), h('h1', { style: 'margin:0' }, 'Star Track')),
    h('div', { class: 'card' }, h('div', { class: 'big-stars' }, `⭐ ${have}`), h('p', { class: 'small', style: 'margin:0' }, `of ${max} possible · up to 5 per challenge · stars can't be bought`),
      next ? h('p', { class: 'small' }, `Next reward at ${next.stars} ★ (${next.stars - have} to go)`) : h('p', { class: 'small' }, 'Every Star Track reward claimed!')),
    h('div', { class: 'track-list' }, ...STAR_TRACK.map(m => {
      const done = !!st.starTrack?.claimed?.[m.stars];
      return h('div', { class: 'track-row' + (done ? ' done' : have >= m.stars ? ' ready' : '') },
        m.item ? tile(m.item, 52) : h('div', { class: 'reward-ico' }, m.diamonds ? '💎' : '🪙'),
        h('div', {}, h('b', {}, `${m.stars} ★`), h('span', { class: 'small' }, [m.item ? itemOf(m.item)?.name : null, m.coins ? `${m.coins} coins` : null, m.diamonds ? `${m.diamonds} 💎` : null, m.title ? `Title “${m.title}”` : null].filter(Boolean).join(' · '))),
        h('span', { class: 'tag' + (done ? ' own' : '') }, done ? '✓ claimed' : have >= m.stars ? 'Ready' : `${m.stars - have} to go`));
    })),
    h('h2', {}, 'Stars by gate'), ...byGate,
    h('button', { class: 'btn block', onclick: () => app.go('missions') }, 'See all challenges')));
}
