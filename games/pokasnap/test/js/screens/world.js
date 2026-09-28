/* WORLD SCREENS (1.4): Pack · Journal · Life Album · Poka Life · Adventure Party ·
   Community · Poka League · Lookback · Chapters & Certifications · Memorial.
   Every screen reads game/world.js; none keeps its own copy of progress. */

import { h, toast, sheet, plural, fmt } from '../ui.js';
import { get, update } from '../game/state.js';
import * as W from '../game/world.js';
import * as CH from '../game/chapters.js';
import { SPECIES, LAUNCH_SPECIES } from '../data/pets.js';
import { RELATION_TYPES, LIFE_ADVENTURES, LIFE_GOAL, PROJECTS, COLLECTIONS, HONOR_TIERS, CHAPTERS, CERTS, NEGLECT, REVIVAL, SPECIALTIES, PACK, DIVISION_NAMES, OBJECTS, LOCATIONS } from '../data/world.js';
import { PERSONALITIES } from '../data/personality.js';
import { livePet } from './flow.js';
import { portrait } from '../render/pet.js';
import { moodOf } from '../game/choreo.js';
import { STAR_TEXT } from '../data/progression.js';
import * as album from '../game/album.js';
import { track } from '../platform/analytics.js';
import { sfx } from '../platform/sound.js';
import { RARITY_COLOR } from './homeland.js';
import { POSES } from '../data/poses.js';
import { item } from '../data/items.js';
// Life Album favourites are stored as ids; show names, never the id itself (S-10)
const favName = {
  toy: id => (id && (OBJECTS[id]?.name || Object.values(OBJECTS).find(o => o.prop === id)?.name || item(id)?.name)) || '—',
  pose: id => (id && POSES[id]?.name) || '—',
  place: id => (id && LOCATIONS.find(l => l.id === id)?.name) || '—',
};

const header = (app, title, back = 'home', right = null) => h('div', { class: 'row between', style: 'margin-bottom:6px' },
  h('div', { class: 'row' }, h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => app.go(back) }, '←'), h('h1', { style: 'margin:0' }, title)), right);
// a care state reads from the body: pose, dimming and facing (1.5)
// what each relationship visibly does in the Homeland (1.5 — Echo: cards read as label + bar only)
const REL_DOES = { acquainted: 'Curious — keeps a little distance', friend: 'Takes turns playing', best_friend: 'Stays close, cuddles and poses together',
  adventure_buddy: 'Explores side by side — more Journey moments', training_partner: 'Practises tricks in sync', playful_rival: 'Races and plays tug-of-war', mentor: 'Teaches tricks — the student copies' };
const moodThumb = (pet, size, id) => { const M = moodOf(id), c = petThumb(pet, size, id === 'healthy' ? 'happy' : M.idle || 'idle');
  if (M.dim) c.style.filter = `saturate(${1 - M.dim}) brightness(${1 - M.dim * 0.2})`; if (M.turnAway) c.style.transform = 'scaleX(-1)'; c.dataset.mood = id; return c; };
const petThumb = (pet, size = 72, pose = 'happy') => { const c = h('canvas', { width: size * 2, height: size * 2, style: `width:${size}px;height:${size}px` }); portrait(c, pet, pose, { t: 0.3 }); return c; };

/* ================================================================ PACK */
export function packScreen(app) {
  const st = get(); W.ensure(st);
  const all = W.pets(st), act = new Set(W.activePets(st).map(p => p.id)), lim = W.activeLimit(st);
  const card = p => {
    const cs = W.careState(st, p.id), spec = W.specialtyOf(st, p.id);
    return h('div', { class: 'card pet-card' + (p.memorial ? ' memorial' : '') },
      h('div', { class: 'row', style: 'gap:10px' }, moodThumb(p, 76, p.memorial ? 'memorial' : cs.id),
        h('div', { class: 'grow' }, h('b', { style: 'font-size:18px' }, p.name), h('span', { class: 'small' }, ` · ${SPECIES[p.species].name}`),
          h('div', { class: 'care-line care-' + cs.id }, p.memorial ? '🕯️ Resting in the Memorial Garden' : `${careIcon(cs.id)} ${cs.name}${cs.recovering ? ` · recovering ${cs.recovering}/${NEGLECT.recoveryCareActions}` : ''}`),
          spec ? h('div', { class: 'small' }, `${SPECIALTIES[spec].icon} Specialty: ${SPECIALTIES[spec].name}`) : null),
        p.memorial ? null : h('button', { class: 'chipbtn' + (act.has(p.id) ? ' gift' : ''), 'aria-pressed': String(act.has(p.id)), onclick: () => {
          const ids = act.has(p.id) ? [...act].filter(x => x !== p.id) : [...act, p.id];
          let r; update(x => { r = W.setActive(x, ids); }); if (!r.ok) toast('Keep at least one pet active'); else if (ids.length > lim) toast(`Up to ${plural(lim, 'active pet')} at your level`); packScreen(app);
        } }, act.has(p.id) ? '✓ Active' : 'Make active')),
      h('div', { class: 'rel-list' }, ...W.relationsOf(st, p.id).map(r => { const o = W.petById(st, r.other), T = RELATION_TYPES[r.type];
        return o ? h('div', { class: 'rel' }, h('span', {}, `${T.icon} ${T.name} with ${o.name}`), h('div', { class: 'bar', role: 'progressbar', 'aria-label': `Bond ${Math.round(r.points)} of 100` }, h('i', { style: `width:${r.points}%` })), h('small', { class: 'bond-n' }, `Bond ${Math.round(r.points)}/100`), REL_DOES[r.type] ? h('small', { class: 'rel-does' }, REL_DOES[r.type]) : null) : null; })),
      h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' },
        h('button', { class: 'btn ghost', onclick: () => app.go('album-life', { pet: p.id }) }, '📖 Life Album'),
        p.memorial ? h('button', { class: 'btn ghost', onclick: () => memorialSheet(app, p) }, '🕯️ Memorial') : null));
  };
  app.mount(h('div', { class: 'screen', style: 'gap:12px' }, header(app, 'My Pack', 'home'),
    h('p', { class: 'sub' }, `Residents: ${all.length} · Active: ${act.size}/${lim}. Active pets appear in the Homeland, on walks and in photos.`),
    ...all.map(card),
    W.canAdopt(st) ? h('button', { class: 'btn block', onclick: () => adoptSheet(app) }, '🐾 Adopt a new pet') :
      h('p', { class: 'small center' }, (st.progress.level || 1) < PACK.secondPetLevel ? `A second pet can join your family at level ${PACK.secondPetLevel}.` : 'Your home is full for now — more room comes with your level.'),
    W.ensure(st).revival.treats ? h('p', { class: 'small center' }, `🍪 Revival Treats: ${W.ensure(st).revival.treats} (earned at levels 50 and 100)`) : null));
}
const careIcon = id => ({ healthy: '💚', lonely: '🥺', stressed: '😣', snappy: '😾', withdrawn: '🫥', critical: '⚠️' })[id] || '💚';
function adoptSheet(app) {
  let species = LAUNCH_SPECIES.find(s => !W.pets(get()).some(p => p.species === s)) || LAUNCH_SPECIES[0], name = '', personality = 'playful';
  const prev = h('div', { class: 'row', style: 'justify-content:center' });
  const draw = () => prev.replaceChildren(petThumb({ species, appearance: SPECIES[species].appearances[0].id, equipped: {} }, 120));
  const sh = sheet(h('h2', {}, 'Adopt a pet'), prev,
    h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap;justify-content:center' }, ...LAUNCH_SPECIES.map(s => h('button', { class: 'chipbtn', onclick: () => { species = s; draw(); } }, SPECIES[s].name))),
    h('input', { class: 'name-input', placeholder: 'Name', maxlength: 16, oninput: e => { name = e.target.value; } }),
    h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap;justify-content:center' }, ...Object.keys(PERSONALITIES).map(p => h('button', { class: 'chipbtn', onclick: e => { personality = p; e.currentTarget.parentNode.querySelectorAll('button').forEach(b => b.classList.remove('gift')); e.currentTarget.classList.add('gift'); } }, PERSONALITIES[p].name || p))),
    h('button', { class: 'btn block', onclick: () => { let r; update(x => { r = W.adopt(x, { species, name: name || SPECIES[species].name, personality }); }); if (r.ok) { track('relationship_started', { pet: r.pet.id }); sfx.unlock(); toast(`Welcome home, ${r.pet.name}!`); sh.close(); packScreen(app); } else toast('Not yet'); } }, 'ADOPT'));
  draw();
}
function memorialSheet(app, p) {
  const st = get(), w = W.ensure(st), c = w.care[p.id], hrs = (Date.now() - (c.dead || 0)) / 3600e3;
  sheet(h('h2', {}, `🕯️ ${p.name}`), h('p', {}, `${p.name} is resting in the Memorial Garden. Every photo and memory in the Life Album is kept forever.`),
    w.revival.treats ? h('button', { class: 'btn mint block', onclick: () => { let r; update(x => { r = W.revive(x, p.id, { with: 'treat' }); }); if (r.ok) { track('revival_used', { method: 'treat' }); toast(`${p.name} is home. Trust will take time — care, play and walks help.`, 3200); app.go('pack'); } } }, `🍪 Use a Revival Treat (${w.revival.treats})`) : h('p', { class: 'small' }, 'Revival Treats are earned at levels 50 and 100.'),
    hrs >= REVIVAL.promoteAfterLossHours ? h('button', { class: 'linkbtn', onclick: () => { let r; update(x => { r = W.revive(x, p.id, { with: 'diamonds' }); }); toast(r.ok ? `${p.name} is home.` : r.reason === 'short' ? `Needs ${fmt(REVIVAL.diamondCost)} Diamonds.` : 'Not available.'); if (r.ok) { track('revival_used', { method: 'diamonds' }); app.go('pack'); } } }, `Other option: ${fmt(REVIVAL.diamondCost)} Diamonds`) : null);
}

/* ================================================================ LIFE ALBUM */
export function lifeAlbumScreen(app, { pet: petId } = {}) {
  const st = get(), p = W.petById(st, petId) || st.pet, v = W.albumView(st, p.id);
  track('life_album_milestone', { pet: p.id, viewed: true });
  app.mount(h('div', { class: 'screen', style: 'gap:12px' }, header(app, `${p.name}'s Life`, 'pack'),
    h('div', { class: 'row', style: 'gap:12px' }, petThumb(p, 96), h('div', {}, h('b', {}, SPECIES[p.species].name), h('p', { class: 'small', style: 'margin:2px 0' }, `Favourite toy: ${favName.toy(v.favorites.toy)} · Pose: ${favName.pose(v.favorites.pose)} · Place: ${favName.place(v.favorites.location)}`),
      v.specialty ? h('p', { class: 'small', style: 'margin:0' }, `${SPECIALTIES[v.specialty].icon} ${SPECIALTIES[v.specialty].name}`) : null)),
    h('div', { class: 'album-timeline' }, ...v.milestones.map(m => h('div', { class: 'ms' + (m.done ? ' done' : '') }, h('span', { class: 'dot' }, m.done ? '✓' : ''), h('b', {}, m.name), h('small', {}, m.done ? new Date(m.at).toLocaleDateString() : '—')))),
    h('h2', {}, 'Relationships'), ...(v.relations.length ? v.relations.map(r => h('p', { class: 'small' }, `${RELATION_TYPES[r.type].icon} ${RELATION_TYPES[r.type].name} with ${W.petById(st, r.other)?.name}`)) : [h('p', { class: 'small' }, 'No friends yet — a second pet arrives around level 15.')])));
}

/* ================================================================ JOURNAL */
export function journalScreen(app, opts = {}) {
  const st = get(); W.ensure(st); track('journal_opened', {});
  const speciesList = [...new Set(W.pets(st).map(p => p.species))];
  let sp = opts.species || speciesList[0], tab = opts.tab || 'journal';
  const body = h('div', { class: 'stack', style: 'gap:10px' });
  const draw = () => {
    const s = get();
    if (tab === 'journal') {
      update(x => { const got = W.claimJournal(x, sp); for (const g of got) toast(`📔 Journal reward: ${g.coins ? g.coins + ' coins' : g.item || g.title}`); });
      const v = W.journalView(get(), sp);
      body.replaceChildren(
        h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' }, ...speciesList.map(x => h('button', { class: 'chipbtn' + (x === sp ? ' gift' : ''), onclick: () => { sp = x; draw(); } }, SPECIES[x].name))),
        h('div', { class: 'card' }, h('b', {}, `${SPECIES[sp].name} Journal — ${v.found} / ${v.total}`), h('div', { class: 'bar' }, h('i', { style: `width:${100 * v.found / v.total}%` }))),
        ...v.categories.map(c => h('div', { class: 'card jcat' }, h('b', {}, `${c.icon} ${c.name} · ${c.entries.filter(e => e.found).length}/${c.entries.length}`),
          h('div', { class: 'jgrid' }, ...c.entries.map(e => h('div', { class: 'jentry' + (e.found ? ' found' : '') }, h('span', { class: 'jicon' }, e.found ? c.icon : '❔'), h('small', {}, e.found ? e.name : '???')))))));
    } else if (tab === 'honors') {
      body.replaceChildren(...W.honorView(s).map(x => h('div', { class: 'card honor' }, h('b', {}, `${['', '🥉', '🥈', '🥇', '💎'][x.tier] || '▫️'} ${x.name}`), h('span', { class: 'small' }, x.next ? ` ${x.n}/${x.next.need} to ${x.next.name}` : ' — complete!'),
        h('div', { class: 'bar' }, h('i', { style: `width:${x.next ? Math.min(100, 100 * x.n / x.next.need) : 100}%` })))));
    } else if (tab === 'collections') {
      body.replaceChildren(...COLLECTIONS.map(c => { const d = s.world.collections[c.id] || { done: {} };
        return h('div', { class: 'card' }, h('b', {}, `${d.claimed ? '✅' : '🗂️'} ${c.name} · ${Object.keys(d.done).length}/${c.goals.length}`),
          h('ul', { class: 'goals' }, ...c.goals.map(g => h('li', { class: d.done[g.id] ? 'done' : '' }, `${d.done[g.id] ? '✓' : '○'} ${g.text}`))), h('p', { class: 'small', style: 'margin:0' }, `Reward: ${c.reward}`)); }));
    }
    const retro = s.world.retro.splice(0); if (retro.length) toast(`You've already captured this memory! ${retro.length} credited.`, 3000);
  };
  const tabs = h('div', { class: 'tabs' }, ...[['journal', '📔 Journal'], ['honors', '🏅 Honors'], ['collections', '🗂️ Collections']].map(([k, l]) => h('button', { class: tab === k ? 'on' : '', onclick: e => { tab = k; tabs.querySelectorAll('button').forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on'); draw(); } }, l)));
  app.mount(h('div', { class: 'screen', style: 'gap:10px' }, header(app, 'Poka Journal'), tabs, body));
  draw();
}

/* ================================================================ POKA LIFE */
export function lifeScreen(app) {
  const st = get(), v = W.lifeView(st), pet = st.pet;
  const act = id => {
    if (id === 'walk') return app.go('party');
    if (id === 'train') return app.go('academy');
    if (id === 'journey') return app.go('walk');
    if (id === 'play') return app.go('homeland');
    if (id === 'eat') return app.go('camera', { missionId: 'fun_center_stage', meal: true });
    if (id === 'focus') return focusSheet(app);
    if (id === 'evening') { const hr = new Date().getHours(); if (hr < 18) return toast('Evening With Poka opens after 6 pm.'); let r; update(x => { r = W.completeLife(x, 'evening'); }); track('life_adventure_completed', { id: 'evening' }); toast(`🌙 Goodnight, ${pet.name}!${r.goal ? ' Daily Poka Life goal complete!' : ''}`); lifeScreen(app); }
  };
  app.mount(h('div', { class: 'screen', style: 'gap:12px' }, header(app, 'Poka Life'),
    h('div', { class: 'card' }, h('b', {}, `Complete any ${LIFE_GOAL.any} today · ${Math.min(v.count, LIFE_GOAL.any)}/${LIFE_GOAL.any}`), h('div', { class: 'bar' }, h('i', { style: `width:${100 * Math.min(1, v.count / LIFE_GOAL.any)}%` })),
      h('p', { class: 'small', style: 'margin:6px 0 0' }, v.paid ? '✓ Today\'s goal is done — everything else still grows your pets.' : 'Pick whatever fits your day. No chore list.')),
    ...LIFE_ADVENTURES.map(a => h('button', { class: 'card life-row' + (v.done[a.id] ? ' done' : ''), onclick: () => act(a.id) }, h('span', { class: 'life-ic' }, a.icon), h('div', {}, h('b', {}, a.name), h('span', { class: 'small' }, a.text)), h('span', {}, v.done[a.id] ? '✓' : '›')))));
}
function focusSheet(app) {
  const pet = get().pet;
  const sh = sheet(h('h2', {}, `⏳ Focus With ${pet.name}`), h('p', { class: 'small' }, `${pet.name} studies quietly next to you. Leave the app open or come back when you're done.`),
    h('div', { class: 'row', style: 'gap:8px;justify-content:center' }, ...[15, 25, 45].map(m => h('button', { class: 'btn', onclick: () => { sh.close(); focusRun(app, m); } }, `${m} min`))));
}
function focusRun(app, mins) {
  const pet = get().pet, end = Date.now() + mins * 60e3 / (window.POKA_FAST ? 600 : 1);
  const timeEl = h('div', { class: 'focus-time' }), pv = livePet(() => pet, () => 'statue', 180);
  const iv = setInterval(() => { const left = Math.max(0, end - Date.now()); timeEl.textContent = `${Math.floor(left / 60e3)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`;
    if (!left) { clearInterval(iv); let r; update(x => { r = W.completeLife(x, 'focus'); }); track('life_adventure_completed', { id: 'focus', minutes: mins }); toast(`🎉 Focus done! ${pet.name} is proud of you.${r.goal ? ' Daily goal complete!' : ''}`, 3000); app.go('life'); } }, 250);
  app.mount(h('div', { class: 'screen focus-screen', style: 'gap:12px;align-items:center' }, h('h1', {}, `Focus With ${pet.name}`), pv, timeEl, h('p', { class: 'small' }, 'No penalty for stopping early.'), h('button', { class: 'btn ghost', onclick: () => { clearInterval(iv); app.go('life'); } }, 'Stop')));
  return () => clearInterval(iv);
}

/* ================================================================ ADVENTURE PARTY */
export function partyScreen(app) {
  const st = get(), all = W.activePets(st);
  let party = all.map(p => p.id);
  const pick = h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;justify-content:center' });
  const drawPick = () => pick.replaceChildren(...W.pets(st).filter(p => !p.memorial).map(p => h('button', { class: 'party-pet' + (party.includes(p.id) ? ' on' : ''), 'aria-pressed': String(party.includes(p.id)), onclick: () => { party = party.includes(p.id) ? party.filter(x => x !== p.id) : [...party, p.id].slice(0, 3); drawPick(); } }, petThumb(p, 64), h('small', {}, p.name))));
  drawPick();
  app.mount(h('div', { class: 'screen', style: 'gap:12px' }, header(app, 'Adventure Party', 'life'),
    h('p', { class: 'sub' }, 'Choose 1–3 pets to walk with. Health steps are optional — a timed walk counts too.'), pick,
    h('button', { class: 'btn block big', onclick: () => { track('adventure_party_started', { size: party.length }); app.go('walk', { party }); } }, '🥾 START THE WALK'),
    h('button', { class: 'linkbtn', onclick: () => partyResult(app, party, 4218, 32) }, 'Log a walk I already took (demo)')));
}
/** One concise result — never seven modals. */
export function partyResult(app, party, steps, minutes) {
  let r; update(x => { r = W.adventureResult(x, { party, steps, minutes }); });
  if (!r?.ok) return toast('Pick at least one pet');
  track('adventure_party_completed', { size: party.length, discovery: r.discoveries });
  const s = get();
  const layer = h('div', { class: 'levelup' }, h('div', { class: 'card adv-result' },
    h('p', { class: 'tag', style: 'margin:0' }, 'ADVENTURE COMPLETE'),
    h('div', { class: 'big' }, `${fmt(steps)} steps`),
    ...r.bonds.map(b => h('p', {}, `${b.name} Bond +${b.bond}`)),
    ...r.friendships.map(f => h('p', {}, `${f.upgraded ? RELATION_TYPES[f.upgraded].icon + ' Now ' + RELATION_TYPES[f.upgraded].name + '!' : 'Friendship +' + f.gain}`)),
    r.community ? h('p', {}, `Community +${r.community}${r.project?.project ? ` (${r.project.project.name})` : ''}`) : null,
    r.discoveries ? h('p', {}, `${r.discoveries} Discovery`) : null,
    r.journeyReady ? h('p', { class: 'reward-line' }, '📸 Journey Snap Ready') : null,
    h('button', { class: 'btn block', onclick: () => { layer.remove(); app.go(r.journeyReady ? 'walk' : 'life'); } }, r.journeyReady ? 'TAKE THE JOURNEY SNAP' : 'DONE')));
  document.body.append(layer);
}

/* ================================================================ COMMUNITY */
export function communityScreen(app) {
  const st = get(); W.ensure(st);
  const cur = W.activeProject(st);
  app.mount(h('div', { class: 'screen', style: 'gap:12px' }, header(app, 'Community Projects', 'homeland'),
    h('p', { class: 'sub' }, 'Projects grow from things you already do — walks, meals, training, great photos. No extra currency.'),
    ...PROJECTS.map(p => { const s = st.world.projects[p.id] || { points: 0 }, locked = (st.progress.level || 1) < p.level, isCur = cur?.id === p.id;
      return h('div', { class: 'card project' + (s.done ? ' done' : '') + (isCur ? ' current' : '') },
        h('b', {}, `${s.done ? '✅' : locked ? '🔒' : '🏗️'} ${p.name}${isCur ? ' — in progress' : ''}`),
        h('div', { class: 'bar' }, h('i', { style: `width:${100 * (s.done ? 1 : s.points / p.goal)}%` })),
        h('p', { class: 'small', style: 'margin:4px 0' }, s.done ? `Built! ${p.unlocks.facility ? 'New in the Homeland: ' + p.unlocks.facility.replace(/_/g, ' ') : ''}` : locked ? `Opens at level ${p.level}` : `${s.points} / ${p.goal} · ` + Object.entries(p.weights).map(([k, v]) => `${k.replace('_', '-')} +${v}`).join(' · '))); })));
}

/* ================================================================ POKA LEAGUE */
export function leagueScreen(app) {
  const st = get(); W.ensure(st);
  const e = W.leagueEvent(), entry = st.world.league.entries[e.key];
  const L = st.progress.level || 1;
  track('league_entered', { event: e.id, viewed: true });
  const photos = [...st.world.photos].reverse().slice(0, 30);
  app.mount(h('div', { class: 'screen', style: 'gap:12px' }, header(app, 'Poka League'),
    L < 70 ? h('div', { class: 'card note' }, h('b', {}, '🔒 Poka League opens at level 70'), h('p', { class: 'small' }, 'Friendly photo and skill competitions against other Pokas. No combat — ever.')) : null,
    h('div', { class: 'card league-event' }, h('b', {}, `🏆 This week: ${e.name}`), h('p', { class: 'small', style: 'margin:4px 0' }, `${DIVISION_NAMES[e.division] || 'Open'} Division. Judged on how well your entry fits the theme, photo quality (gear bonuses don't count), moment rarity and creativity.`)),
    entry ? h('div', { class: 'card' }, h('b', {}, `Your entry placed #${entry.place} of 8`), h('p', { class: 'small' }, 'A new event starts next week.')) :
      L >= 70 ? h('div', { class: 'stack' }, h('p', { class: 'small' }, 'Pick one of your photos to enter:'), h('div', { class: 'league-pick' }, ...photos.map(p => h('button', { class: 'chipbtn', onclick: () => {
        let r; update(x => { r = W.leagueEnter(x, p.id); }); if (!r.ok) return toast('Already entered this week');
        track('league_completed', { event: e.id, place: r.place });
        sheet(h('h2', {}, `#${r.place} — ${r.event.name}`), h('p', { class: 'small' }, 'This week\'s rivals are League pets, not other players.'), ...r.board.map((b, i) => h('p', { class: b.you ? 'reward-line' : 'small' }, `${i + 1}. ${b.name} — ${b.score}`)), h('button', { class: 'btn block', onclick: () => leagueScreen(app) }, 'OK'));
      } }, `${p.missionId?.startsWith('homeland') ? '🏡' : '📸'} ${POSES[p.poseId]?.name ? POSES[p.poseId].name + ' pose' : 'Photo'} · Score ${p.score}`)))) : null));
}

/* ================================================================ LOOKBACK */
export function lookbackScreen(app, { span = 'day' } = {}) {
  const st = get(), pet = st.pet;
  let hideSteps = false;
  const v = W.lookback(st, span);
  const title = span === 'day' ? `TODAY WITH ${pet.name.toUpperCase()}` : span === 'week' ? 'THIS WEEK WITH YOUR POKAS' : `${new Date().toLocaleString('en', { month: 'long' }).toUpperCase()} TOGETHER`;
  const img = h('img', { class: 'lb-photo', alt: 'Best photo' });
  if (v.best) album.list().then(l => { const s = l.find(x => x.id === v.best.id); if (s) img.src = album.urlFor(s); });
  const stats = h('div', { class: 'lb-stats' });
  const drawStats = () => stats.replaceChildren(...[
    hideSteps ? null : ['🥾', plural(v.steps, 'step')], ['📸', plural(v.photos, 'photo')], ['⭐', plural(v.fiveStars, 'five-star photo')], ['✨', plural(v.rare, 'Rare Moment')],
    ['📔', plural(v.journal, 'Journal discovery', 'Journal discoveries')], ['💞', plural(v.relations.length, 'relationship change')], ['🌿', plural(v.life, 'Poka Life adventure')]].filter(Boolean).map(([i, t]) => h('div', { class: 'lb-stat' }, h('span', {}, i), h('b', {}, t))));
  drawStats();
  app.mount(h('div', { class: 'screen lookback', style: 'gap:12px' }, header(app, 'Lookback'),
    h('div', { class: 'tabs' }, ...[['day', 'Today'], ['week', 'Week'], ['month', 'Month']].map(([k, l]) => h('button', { class: span === k ? 'on' : '', onclick: () => lookbackScreen(app, { span: k }) }, l))),
    h('div', { class: 'card lb-card', id: 'lookback-card' }, h('p', { class: 'tag', style: 'margin:0' }, title), v.best ? img : h('p', { class: 'small' }, 'Take a photo to fill this page.'), stats),
    h('label', { class: 'row small', style: 'gap:8px' }, h('input', { type: 'checkbox', onchange: e => { hideSteps = e.target.checked; drawStats(); } }), 'Hide step count before sharing'),
    h('button', { class: 'btn block', onclick: () => shareLookback(title) }, '📤 SAVE / SHARE')));
}
async function shareLookback(title) {
  const node = document.getElementById('lookback-card'); if (!node) return;
  const c = document.createElement('canvas'), r = node.getBoundingClientRect(); c.width = r.width * 2; c.height = r.height * 2;
  const x = c.getContext('2d'); x.scale(2, 2); x.fillStyle = '#fff6ec'; x.fillRect(0, 0, r.width, r.height); x.fillStyle = '#3a2a4a'; x.font = '900 18px system-ui'; x.fillText(title, 16, 30);
  let y = 60; const img = node.querySelector('img'); if (img?.complete && img.naturalWidth) { const w = r.width - 32, hh = w * img.naturalHeight / img.naturalWidth; x.drawImage(img, 16, y, w, hh); y += hh + 16; }
  x.font = '800 14px system-ui'; for (const s of node.querySelectorAll('.lb-stat')) { x.fillText(s.innerText.replace(/\n/g, ' '), 16, y); y += 22; }
  const blob = await new Promise(res => c.toBlob(res, 'image/png'));
  const { share } = await import('../platform/native.js'); share(blob);
}

/* ================================================================ CHAPTERS & CERTIFICATIONS */
export function chaptersScreen(app) {
  const st = get(); CH.checkCerts(st);
  const L = st.progress.level || 1;
  app.mount(h('div', { class: 'screen', style: 'gap:10px' }, header(app, 'Your Journey'),
    ...CHAPTERS.map(c => { const cur = L >= c.from && L <= c.to, done = L > c.to || (c.to === 100 && L >= 100 && st.certs?.cert100);
      const cv = c.milestone.cert ? CH.certView(st, c.milestone.cert) : null;
      return h('div', { class: 'card chapter' + (cur ? ' current' : '') + (done ? ' done' : '') + (L < c.from ? ' locked' : '') },
        h('b', {}, `Chapter ${c.n} · Levels ${c.from}–${c.to} · ${c.name}`), h('p', { class: 'small', style: 'margin:2px 0' }, `“${c.feel}”`),
        h('p', { class: 'small', style: 'margin:2px 0' }, `Level ${c.milestone.level}: ${c.milestone.name}`),
        cv ? h('div', { class: 'cert' }, h('p', { class: 'small', style: 'margin:4px 0' }, `${cv.earned ? '✅' : '📜'} ${cv.name} certification — any ${cv.need} of ${cv.paths.length} (${cv.got}/${cv.need})`),
          h('ul', { class: 'goals' }, ...cv.paths.map(p => h('li', { class: p.done ? 'done' : '' }, `${p.done ? '✓' : '○'} ${p.text}`)))) : null); })));
}
