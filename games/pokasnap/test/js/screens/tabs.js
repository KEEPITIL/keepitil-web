/* 2.0 tab destinations: WINS · POKA (Pokapets) · PETS (Friends & Community) · ALBUM (seasonal photo sets)
   and the rotating EVENT screen. All progress is read from game/v2.js + game/world.js; nothing here
   keeps its own copy. Every 1.x screen stays reachable from one of these (see v2.ROUTE_HOME). */

import { h, toast, sheet, plural, fmt, coin } from '../ui.js';
import { get, update } from '../game/state.js';
import * as V from '../game/v2.js';
import * as C21 from '../game/core21.js';
import * as W from '../game/world.js';
import { SPECIES } from '../data/pets.js';
import { PERSONALITIES } from '../data/personality.js';
import { RELATION_TYPES, SPECIALTIES, PACK, LOCATIONS, OBJECTS } from '../data/world.js';
import { POSES } from '../data/poses.js';
import { portrait } from '../render/pet.js';
import { moodOf } from '../game/choreo.js';
import { levelProgress } from '../game/progress.js';
import { livePet } from './flow.js';
import * as album from '../game/album.js';
import { track } from '../platform/analytics.js';
import { sfx } from '../platform/sound.js';
import { haptic } from '../platform/native.js';
import { shell, currencyPills } from './nav.js';

const dur = ms => { const m = Math.max(0, Math.round(ms / 60e3)); return m >= 1440 ? `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h` : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
const rewardText = r => h('span', { class: 'rw', 'aria-label': [r.coins ? `${fmt(r.coins)} coins` : null, r.diamonds ? `${fmt(r.diamonds)} diamonds` : null, r.badge ? `badge ${r.badge}` : null].filter(Boolean).join(' and ') },
  r.coins ? [coin(), fmt(r.coins)] : null, r.coins && (r.diamonds || r.badge) ? ' + ' : null, r.diamonds ? `💎 ${fmt(r.diamonds)}` : null, r.diamonds && r.badge ? ' + ' : null, r.badge ? `🏅 ${r.badge}` : null);
const bar = (have, n, label) => h('div', { class: 'pbar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(n), 'aria-valuenow': String(have), 'aria-label': label }, h('i', { style: `width:${Math.round(100 * Math.min(1, have / Math.max(1, n)))}%` }));
function celebrate(text) { sfx.reward?.(); haptic('success'); const l = h('div', { class: 'levelup celebrate', onclick: () => l.remove() }, h('div', { class: 'card' }, h('div', { class: 'burst', 'aria-hidden': 'true' }, '🎉'), h('h2', {}, text), h('button', { class: 'btn block' }, 'NICE!'))); document.body.append(l); }
const paid = r => [r.coins ? `+${fmt(r.coins)} coins` : null, r.diamonds ? `+${fmt(r.diamonds)} diamonds` : null, r.badge ? `badge: ${r.badge}` : null].filter(Boolean).join(', ') || 'claimed';
const petThumb = (pet, size = 72, pose = 'happy') => { const c = h('canvas', { width: size * 2, height: size * 2, style: `width:${size}px;height:${size}px`, 'aria-hidden': 'true' }); portrait(c, pet, pose, { t: 0.3 }); return c; };

/* ================================================================ WINS */
export function winsScreen(app) {
  const st = get(); update(x => V.ensureV2(x));
  const v = V.winsView(get());
  const goal = w => h('div', { class: 'win' + (w.done ? ' done' : '') + (w.claimed ? ' claimed' : '') },
    h('div', { class: 'win-top' }, h('b', {}, w.label), h('span', { class: 'win-n' }, `${w.have}/${w.n}`)),
    bar(w.have, w.n, `${w.label}: ${w.have} of ${w.n}`),
    h('div', { class: 'win-foot' }, h('span', { class: 'small' }, rewardText(w.reward)),
      w.claimed ? h('span', { class: 'claimed-tag' }, '✓ Claimed') : w.done ? h('button', { class: 'btn claim', onclick: () => claim(w.claimId) }, 'CLAIM') : h('span', { class: 'small' }, `${w.n - w.have} to go`)));
  function claim(id) { let r; update(x => { r = V.claimWin(x, id); }); if (r.ok) { track('win_claimed', { id }); celebrate(`Win claimed! ${paid(r)}`); } else toast(r.reason === 'claimed' ? 'Already claimed' : 'Not finished yet'); winsScreen(app); }
  const near = [...v.day, ...v.week].filter(w => !w.done).sort((a, b) => b.have / b.n - a.have / a.n)[0];
  const ev21 = C21.currentEvent(), ev = ev21 ? { ...ev21, type: ev21.mode } : null, ep = ev ? (() => { const v = C21.eventView(get(), ev21); return { endsIn: v.endsIn, total: v.per - v.toNext, goal: v.per, milestones: [], avail: v.available }; })() : null;
  app.mount(shell(app, 'wins', { title: 'Wins', sub: v.claimable ? `${plural(v.claimable, 'reward')} ready to claim` : near ? `Almost there: ${near.label} (${near.have}/${near.n})` : 'Everything claimed — nice!', right: currencyPills(app) },
    h('section', { class: 'win-sec' }, h('div', { class: 'sec-head' }, h('h2', {}, '☀️ TODAY'), h('span', { class: 'small' }, `resets in ${dur(v.dayEndsIn)}`)), ...v.day.map(goal)),
    h('section', { class: 'win-sec' }, h('div', { class: 'sec-head' }, h('h2', {}, '📅 THIS WEEK'), h('span', { class: 'small' }, `resets in ${dur(v.weekEndsIn)}`)), ...v.week.map(goal)),
    ev ? h('section', { class: 'win-sec' }, h('div', { class: 'sec-head' }, h('h2', {}, `${ev.icon} ACTIVE EVENT`), h('span', { class: 'small' }, `ends in ${dur(ep.endsIn)}`)),
      h('button', { class: 'card event-card', onclick: () => app.go('event21') }, h('b', {}, ev.title), h('span', { class: 'small' }, ev.type === 'team' ? ' · Team' : ' · Solo'),
        bar(ep.total, ep.goal, `${ev.title}: ${ep.total} of ${ep.goal}`), h('span', { class: 'small' }, `${ep.total}/${ep.goal} SP to the next ${ev.conversion.currency.replace(/s$/, '')} · ${ep.avail} ready ›`))) : null,
    h('section', { class: 'win-sec' }, h('div', { class: 'sec-head' }, h('h2', {}, `${v.season.icon} SEASON ROAD`), h('span', { class: 'small' }, `${v.season.name} · ${plural(v.season.daysLeft, 'day')} left`)),
      h('p', { class: 'small' }, 'Every Album slot you fill moves you along the road.'),
      h('div', { class: 'road' }, ...v.road.map(r => h('div', { class: 'road-stop' + (r.done ? ' done' : '') },
        h('span', { class: 'road-dot', 'aria-hidden': 'true' }, r.claimed ? '✓' : String(r.n)),
        h('div', { class: 'grow' }, h('b', {}, `${r.n} Album slots`), h('div', { class: 'small' }, rewardText(r.reward)), bar(r.have, r.n, `${r.have} of ${r.n} slots`)),
        r.claimed ? h('span', { class: 'claimed-tag' }, '✓') : r.done ? h('button', { class: 'btn claim', onclick: () => claim(r.claimId) }, 'CLAIM') : null)))),
    h('section', { class: 'win-sec more-links' }, h('h2', {}, 'MORE GOALS'),
      h('div', { class: 'link-grid' },
        h('button', { onclick: () => app.go('missions') }, '📷', h('span', {}, 'Photo Challenges')),
        h('button', { onclick: () => app.go('catalog') }, '⭐', h('span', {}, 'Star Catalog')),
        h('button', { onclick: () => app.go('chapters') }, '📜', h('span', {}, 'Chapters')),
        h('button', { onclick: () => app.go('adventures') }, '🗺️', h('span', {}, 'Adventures'))))));
}

/* ================================================================ POKA → POKAPETS */
let pokaFilter = 'all', pokaQuery = '';
export function pokaScreen(app) {
  const st = get(); W.ensure(st);
  const owned = W.pets(st), bySpecies = new Set(owned.map(p => p.species));
  const discovered = new Set([...bySpecies, ...Object.keys(W.ensure(st).journal || {})]);
  const favs = new Set(get().v2?.favs || []);
  const species = Object.values(SPECIES);
  const grid = h('div', { class: 'pokagrid' });
  const cells = () => {
    const q = pokaQuery.trim().toLowerCase();
    const petCells = owned.filter(p => pokaFilter === 'all' || pokaFilter === 'owned' || (pokaFilter === 'favs' && favs.has(p.id)) || (PERSONALITIES[pokaFilter] && p.personality === pokaFilter))
      .filter(p => !q || p.name.toLowerCase().includes(q) || SPECIES[p.species].name.toLowerCase().includes(q) || (PERSONALITIES[p.personality]?.name || '').toLowerCase().includes(q))
      .map(p => { const cs = W.careState(st, p.id), spec = W.specialtyOf(st, p.id);
        return h('button', { class: 'pcell owned' + (p.memorial ? ' memorial' : ''), 'aria-label': `${p.name}, ${SPECIES[p.species].name}, ${PERSONALITIES[p.personality]?.name || ''}${favs.has(p.id) ? ', favourite' : ''}`, onclick: () => app.go('pokaprofile', { pet: p.id }) },
          petThumb(p, 84, p.memorial ? 'sleep' : cs.id === 'healthy' ? 'happy' : moodOf(cs.id).idle || 'idle'),
          favs.has(p.id) ? h('i', { class: 'fav', 'aria-hidden': 'true' }, '★') : null,
          h('b', { class: 'pname' }, p.name), h('small', {}, `${PERSONALITIES[p.personality]?.icon || ''} ${spec ? SPECIALTIES[spec].icon : ''} ${SPECIES[p.species].name}`)); });
    const speciesCells = pokaFilter === 'all' || pokaFilter === 'species' ? species.filter(s => !q || s.name.toLowerCase().includes(q)).filter(s => pokaFilter === 'species' || !bySpecies.has(s.id)).map(s => {
      const seen = discovered.has(s.id), have = bySpecies.has(s.id);
      return h('div', { class: 'pcell ' + (have ? 'owned' : seen ? 'seen' : 'unknown'), 'aria-label': have ? `${s.name}: owned` : seen ? `${s.name}: discovered` : 'Unknown species' },
        seen || have ? petThumb({ species: s.id, appearance: s.appearances[0].id, equipped: {} }, 84, 'sit') : h('div', { class: 'unknown-sil', 'aria-hidden': 'true' }, '?'),
        h('b', { class: 'pname' }, seen || have ? s.name : '???'), h('small', {}, have ? 'Owned' : seen ? 'Discovered' : 'Not yet discovered'));
    }) : [];
    grid.replaceChildren(...petCells, ...speciesCells);
    if (!grid.children.length) grid.append(h('p', { class: 'small', style: 'grid-column:1/-1;text-align:center' }, 'No Pokas match.'));
  };
  const chips = [['all', 'All'], ['owned', 'Owned'], ['species', 'Species'], ['favs', '★ Favourites'], ...Object.values(PERSONALITIES).map(p => [p.id, `${p.icon} ${p.name}`])];
  const chipRow = h('div', { class: 'chips', role: 'toolbar', 'aria-label': 'Filter' }, ...chips.map(([id, label]) => h('button', { class: 'chipbtn' + (pokaFilter === id ? ' on' : ''), 'aria-pressed': String(pokaFilter === id), onclick: e => { pokaFilter = id; chipRow.querySelectorAll('button').forEach(b => { b.classList.toggle('on', b === e.currentTarget); b.setAttribute('aria-pressed', String(b === e.currentTarget)); }); cells(); } }, label)));
  const search = h('input', { class: 'search', type: 'search', placeholder: 'Search Pokas', 'aria-label': 'Search Pokas', value: pokaQuery, oninput: e => { pokaQuery = e.target.value; cells(); } });
  cells();
  const lim = W.activeLimit(st);
  app.mount(shell(app, 'poka', { title: 'Pokapets', sub: `${plural(owned.length, 'Poka')} · ${discovered.size}/${species.length} species discovered · ${plural(lim, 'active slot')}` },
    search, chipRow, grid,
    h('div', { class: 'link-grid', style: 'margin-top:10px' },
      h('button', { onclick: () => app.go('pack') }, '🐾', h('span', {}, 'Pack & adopt')),
      h('button', { onclick: () => app.go('journal') }, '📔', h('span', {}, 'Species Journal')),
      h('button', { onclick: () => app.go('care') }, '🍽️', h('span', {}, 'Care')),
      h('button', { onclick: () => app.go('academy') }, '🎓', h('span', {}, 'Academy')),
      h('button', { onclick: () => app.go('training21') }, '🎯', h('span', {}, 'Training')),
      h('button', { onclick: () => app.go('train') }, '🪄', h('span', {}, 'Tricks')),
      h('button', { onclick: () => app.go('closet') }, '👒', h('span', {}, 'Closet')),
      h('button', { onclick: () => app.go('life') }, '🌿', h('span', {}, 'Poka Life')),
      h('button', { onclick: () => app.go('lookback') }, '🗓️', h('span', {}, 'Lookback'))),
    W.canAdopt(st) ? h('button', { class: 'btn block', style: 'margin-top:10px', onclick: () => app.go('pack') }, '🐾 Adopt a new Poka') :
      h('p', { class: 'small center' }, (st.progress.level || 1) < PACK.secondPetLevel ? `A second Poka can join at level ${PACK.secondPetLevel}.` : 'Your home is full for now.')));
}

/* ---- individual profile */
export function pokaProfileScreen(app, { pet: petId } = {}) {
  const st = get(), p = W.petById(st, petId) || W.pets(st)[0]; if (!p) return app.go('snap');
  const cs = W.careState(st, p.id), spec = W.specialtyOf(st, p.id), v = W.albumView(st, p.id), pers = PERSONALITIES[p.personality] || {};
  const lp = levelProgress(st.progress.xp || 0), favs = new Set(get().v2?.favs || []);
  const photos = (W.ensure(st).photos || []).filter(m => (m.subjects || []).includes(p.id));
  const name = (kind, id) => !id ? '—' : kind === 'pose' ? POSES[id]?.name || '—' : kind === 'place' ? LOCATIONS.find(l => l.id === id)?.name || '—' : OBJECTS[id]?.name || '—';
  const row = (k, val) => h('div', { class: 'brow' }, h('span', { class: 'k' }, k), h('span', {}, val));
  app.mount(shell(app, 'poka', { title: p.name, sub: `${SPECIES[p.species].name} · ${pers.icon || ''} ${pers.name || ''}`,
    right: h('button', { class: 'icon-btn', 'aria-label': 'Back to Pokapets', onclick: () => app.go('poka') }, '←') },
    h('div', { class: 'profile-hero' }, livePet(() => W.petById(get(), p.id) || p, () => cs.id === 'healthy' ? 'happy' : moodOf(cs.id).idle || 'idle', 170, { mood: () => cs.id }),
      h('button', { class: 'chipbtn fav-btn' + (favs.has(p.id) ? ' on' : ''), 'aria-pressed': String(favs.has(p.id)), onclick: () => { update(x => { const f = new Set(V.ensureV2(x).favs || []); f.has(p.id) ? f.delete(p.id) : f.add(p.id); x.v2.favs = [...f]; }); pokaProfileScreen(app, { pet: p.id }); } }, favs.has(p.id) ? '★ Favourite' : '☆ Favourite')),
    h('div', { class: 'card' },
      row('LEVEL', `${lp.level} · ${Math.round(lp.pct * 100)}% to next`),
      row('CARE', p.memorial ? 'Resting in the Memorial Garden' : cs.name),
      row('NATURE', `${pers.icon || ''} ${pers.name || '—'} — ${pers.blurb || ''}`),
      row('SPECIALTY', spec ? `${SPECIALTIES[spec].icon} ${SPECIALTIES[spec].name}` : 'Not yet — keep playing together'),
      row('FAV TOY', name('toy', v.favorites?.toy)), row('FAV POSE', name('pose', v.favorites?.pose)), row('FAV PLACE', name('place', v.favorites?.place)),
      row('PHOTOS', fmt(photos.length))),
    h('h2', {}, 'Relationships'),
    ...(W.relationsOf(st, p.id).length ? W.relationsOf(st, p.id).map(r => { const o = W.petById(st, r.other), T = RELATION_TYPES[r.type];
      return o ? h('div', { class: 'rel' }, h('span', {}, `${T.icon} ${T.name} with ${o.name}`), bar(r.points, 100, `Bond ${Math.round(r.points)} of 100`)) : null; }).filter(Boolean) : [h('p', { class: 'small' }, 'Relationships grow when Pokas play and pose together.')]),
    h('div', { class: 'link-grid' },
      h('button', { onclick: () => app.go('album-life', { pet: p.id }) }, '📖', h('span', {}, 'Life Album')),
      h('button', { onclick: () => app.go('care') }, '🍽️', h('span', {}, 'Care')),
      h('button', { onclick: () => app.go('training21') }, '🎯', h('span', {}, 'Training')),
      h('button', { onclick: () => app.go('train') }, '🪄', h('span', {}, 'Tricks')),
      h('button', { onclick: () => app.go('academy') }, '🎓', h('span', {}, 'Upgrades & Academy')),
      h('button', { onclick: () => app.go('closet') }, '👒', h('span', {}, 'Outfits')),
      h('button', { onclick: () => app.go('pack') }, '🐾', h('span', {}, 'Active Pokas')))));
}

/* ================================================================ PETS → Friends & Community */
export function petsScreen(app) {
  const st = get(); update(x => V.ensureV2(x));
  const signed = !!st.account?.userId, n = st.social?.friendCount || 0;
  const e21 = C21.currentEvent(), ev = e21 ? { ...e21, type: e21.mode, next: (n => n && { ...n, type: n.mode })(C21.nextEvent()) } : null, team = ev?.type === 'team', ep = null;
  const proj = (st.progress.level || 1) >= 30 ? W.activeProject(st) : null;
  app.mount(shell(app, 'pets', { title: 'Friends & Community', sub: signed ? (n ? `${plural(n, 'friend')} in PokaSnap` : 'Add friends to team up in events') : 'Play solo, or sign in to add friends' },
    h('div', { class: 'card social-hero' },
      h('b', {}, signed ? '🤝 Your friends' : '🤝 Friends need a PokaSnap account'),
      h('p', { class: 'small' }, signed ? 'Friends see only your display name. Add each other with friend codes — invites earn coins.' : 'Guests can keep playing everything else. Friends are optional.'),
      h('div', { class: 'row', style: 'gap:8px' },
        h('button', { class: 'btn', style: 'flex:1', onclick: () => app.go('friends', { from: 'pets' }) }, signed ? '👥 FRIENDS & REQUESTS' : 'SIGN IN / CREATE ACCOUNT'),
        signed ? h('button', { class: 'btn ghost', onclick: () => app.go('friends', { from: 'pets' }) }, '📤 INVITE') : null)),
    ev ? h('div', { class: 'card team-card' + (team ? ' team' : '') },
      h('div', { class: 'row between' }, h('b', {}, `${ev.icon} ${ev.title}`), h('span', { class: 'tagpill' }, team ? 'TEAM' : 'SOLO')),
      h('p', { class: 'small' }, team ? `A real team event: you and up to ${ev.teamSize - 1} other players (friends first) share one score on the server. Needs a signed-in account.` : `This event is solo. The next one is ${ev.next.icon} ${ev.next.title} (${ev.next.type === 'team' ? 'team' : 'solo'}).`),
      h('button', { class: 'btn ghost block', onclick: () => app.go('event21') }, 'OPEN EVENT ›')) : null,
    h('div', { class: 'card' }, h('b', {}, '🏘️ Community'), h('p', { class: 'small' }, proj ? `Current Community Project: ${proj.name}. Your photos build it and the world changes.` : 'Community Projects open at level 30.'),
      h('div', { class: 'link-grid' },
        h('button', { onclick: () => app.go('community') }, '🏗️', h('span', {}, 'Community Projects')),
        (st.progress.level || 1) >= 70 ? h('button', { onclick: () => app.go('league') }, '🏆', h('span', {}, 'Poka League')) : h('button', { onclick: () => toast('Poka League opens at level 70') }, '🔒', h('span', {}, 'League (Lv 70)')),
        h('button', { onclick: () => app.go('party') }, '🧭', h('span', {}, 'Adventure Party')))),
    h('p', { class: 'small center' }, 'No public chat — PokaSnap keeps friends simple and safe.')));
}
/* the shared garden visibly grows with the team meter */
function gardenView(ep) {
  const stage = Math.min(4, Math.floor(4 * ep.total / Math.max(1, ep.goal)));
  const parts = ['🌱', '🌷🌱', '🌷🌻🌱', '🌷🌻⛲🌷', '🌷🌻⛲🌻🖼️'];
  return h('div', { class: 'garden', 'aria-label': `Shared garden, stage ${stage + 1} of 5` }, parts[stage]);
}

/* ================================================================ ALBUM (seasonal photo sets) */
export async function seasonAlbumScreen(app, opts = {}) {
  update(x => V.ensureV2(x));
  const v = V.albumView(get());
  const snaps = await album.list().catch(() => []), byId = new Map(snaps.map(s => [s.id, s]));
  const thumb = id => { const s = byId.get(id); return s ? h('img', { src: album.urlFor(s), alt: '' }) : h('span', { class: 'ok', 'aria-hidden': 'true' }, '✓'); };
  const open = opts.set ? v.sets.find(s => s.id === opts.set) : null;
  function claim(id, what) { let r; update(x => { r = V.claimAlbum(x, id); }); if (r.ok) { track('album_claimed', { id }); celebrate(`${what} complete! ${paid(r)}`); } else toast(r.reason === 'claimed' ? 'Already claimed' : 'Not complete yet'); seasonAlbumScreen(app, opts); }
  if (open) {
    app.mount(shell(app, 'album', { title: `${open.icon} ${open.name}`, sub: `${open.have}/${open.total} moments · ${v.season.name}`, right: h('button', { class: 'icon-btn', 'aria-label': 'Back to Album', onclick: () => app.go('album') }, '←') },
      bar(open.have, open.total, `${open.have} of ${open.total}`),
      h('div', { class: 'slots' }, ...open.slots.map(sl => h('div', { class: 'slot' + (sl.photoId || sl.at ? ' got' : ''), 'aria-label': `${sl.name}: ${sl.at ? 'collected' : 'not yet'}` },
        h('div', { class: 'slot-img' }, sl.at ? thumb(sl.photoId) : h('span', { class: 'q', 'aria-hidden': 'true' }, '?')), h('small', {}, sl.name)))),
      h('div', { class: 'card set-reward' }, h('b', {}, 'Set reward: ', rewardText(open.reward)),
        open.claimed ? h('p', { class: 'claimed-tag' }, '✓ Claimed') : open.complete ? h('button', { class: 'btn block claim', onclick: () => claim(open.claimId, open.name) }, 'CLAIM SET REWARD') : h('p', { class: 'small' }, 'Snap the missing moments in the world. Each moment counts once — duplicates don\'t fill a slot twice.'))));
    return;
  }
  app.mount(shell(app, 'album', { title: `${v.season.icon} ${v.season.name}`, sub: `${v.filled}/${v.total} moments · ${v.setsDone}/${v.sets.length} sets · ${plural(v.season.daysLeft, 'day')} left` },
    bar(v.filled, v.total, `Season ${v.filled} of ${v.total}`),
    h('div', { class: 'sets' }, ...v.sets.map(s => h('button', { class: 'setcard' + (s.complete ? ' complete' : ''), 'aria-label': `${s.name}, ${s.have} of ${s.total}${s.complete && !s.claimed ? ', reward ready' : ''}`, onclick: () => app.go('album', { set: s.id }) },
      h('span', { class: 'set-ic', 'aria-hidden': 'true' }, s.icon), h('b', {}, s.name), h('span', { class: 'set-n' }, `${s.have}/${s.total}`),
      h('div', { class: 'mini-slots', 'aria-hidden': 'true' }, ...s.slots.map(x => h('i', { class: x.at ? 'on' : '' }))),
      s.complete && !s.claimed ? h('span', { class: 'ready' }, 'REWARD READY') : s.claimed ? h('span', { class: 'claimed-tag' }, '✓') : null))),
    h('h2', {}, 'Season milestones'),
    ...v.milestones.map(m => h('div', { class: 'win' + (m.done ? ' done' : '') },
      h('div', { class: 'win-top' }, h('b', {}, m.season ? `Complete the whole season (${m.sets} sets)` : `Complete ${m.sets} sets`), h('span', { class: 'win-n' }, `${Math.min(v.setsDone, m.sets)}/${m.sets}`)),
      bar(Math.min(v.setsDone, m.sets), m.sets, `${v.setsDone} of ${m.sets} sets`),
      h('div', { class: 'win-foot' }, h('span', { class: 'small' }, rewardText(m.reward)), m.claimed ? h('span', { class: 'claimed-tag' }, '✓ Claimed') : m.done ? h('button', { class: 'btn claim', onclick: () => claim(m.claimId, m.season ? 'Season' : `${m.sets} sets`) }, 'CLAIM') : null))),
    h('button', { class: 'btn ghost block', onclick: () => app.go('snaps') }, '🖼️ All my photos (My Snaps)')));
}

/* ================================================================ ROTATING EVENT */
export function event2Screen(app) {
  update(x => V.ensureV2(x));
  const st = get(), ev = V.currentEvent2(st);
  if (!ev) { app.go('snap'); return; }
  const p = V.eventProgress(st, ev), tv = V.turnsView(st), team = ev.type === 'team';
  function claim(id) { let r; update(x => { r = V.claimEvent(x, ev, id); }); if (r.ok) { track('event2_claimed', { event: ev.id }); celebrate(`${ev.title} reward! ${paid(r)}`); } else toast('Not yet'); event2Screen(app); }
  app.mount(shell(app, 'snap', { title: `${ev.icon} ${ev.title}`, sub: `${team ? 'TEAM event' : 'SOLO event'} · ends in ${dur(p.endsIn)}`, right: h('button', { class: 'icon-btn', 'aria-label': 'Back to the world', onclick: () => app.go('snap') }, '←') },
    h('div', { class: 'card' }, h('p', { style: 'margin:0 0 6px' }, ev.blurb),
      bar(p.total, p.goal, `${p.total} of ${p.goal} points`), h('p', { class: 'small' }, team ? `Team ${p.total}/${p.goal} · you ${p.mine} · ${plural(p.friends, 'friend')} cheering (+${p.friendBoost})` : `${p.total}/${p.goal} points`),
      team ? gardenView(p) : null,
      h('p', { class: 'small' }, `How to score: take a turn to start the event in the world (+1), then SNAP it — the right moments earn up to 6 points each. Album set: ${V.ALBUM_SETS.find(s => s.id === ev.album)?.name}.`)),
    h('div', { class: 'card' }, h('b', {}, 'Milestones'), ...p.milestones.map((m, i) => h('div', { class: 'win' + (m.done ? ' done' : '') },
      h('div', { class: 'win-top' }, h('b', {}, `${m.at} points`), h('span', { class: 'small' }, rewardText(m.reward))),
      m.claimed ? h('span', { class: 'claimed-tag' }, '✓ Claimed') : m.done ? h('button', { class: 'btn claim', onclick: () => claim(m.claimId) }, 'CLAIM') : bar(Math.min(p.total, m.at), m.at, `${Math.min(p.total, m.at)} of ${m.at}`)))),
    h('button', { class: 'btn block big', disabled: tv.empty ? true : null, onclick: () => { let r; update(x => { r = V.eventTurn(x, ev); }); if (!r.ok) return toast(`No Snap Turns left — +1 in ${V.clock(tv.nextInMs)}`); track('event2_turn', { event: ev.id }); app.go('snap', { stage: ev.action }); } },
      tv.empty ? `NO TURNS · +1 in ${V.clock(tv.nextInMs)}` : `▶ PLAY A TURN (${tv.n}/${tv.max})`),
    h('p', { class: 'small center' }, `Next up: ${ev.next.icon} ${ev.next.title} (${ev.next.type === 'team' ? 'team' : 'solo'}) in ${dur(ev.next.start - Date.now())}.`),
    h('button', { class: 'linkbtn', onclick: () => app.go('adventures') }, 'Weekly events & Adventures ›')));
}
