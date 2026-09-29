/* ALBUM (2.1) · EVENT hub · TRAINING hub.
   The Album is the player's own photographs: every card is the actual qualifying photo (from the
   local photo store — nothing is uploaded), with a themed border, the moment name, stars/rarity,
   the Poka and the date. Set Complete and Season Complete are full celebrations, never a toast. */

import { h, toast, sheet, plural, fmt, coin, fill } from '../ui.js';
import { get, update } from '../game/state.js';
import * as C from '../game/core21.js';
import * as V from '../game/v2.js';
import * as W from '../game/world.js';
import * as E from '../platform/events.js';
import * as album from '../game/album.js';
import { track } from '../platform/analytics.js';
import { sfx } from '../platform/sound.js';
import { haptic } from '../platform/native.js';
import { shell, currencyPills } from './nav.js';

const rewardText = r => h('span', { class: 'rw' }, r.coins ? [coin(), fmt(r.coins)] : null, r.coins && r.diamonds ? ' + ' : null, r.diamonds ? `💎 ${fmt(r.diamonds)}` : null, r.badge ? ` + 🏅 ${r.badge}` : null);
const bar = (have, n, label) => h('div', { class: 'pbar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(n), 'aria-valuenow': String(have), 'aria-label': label }, h('i', { style: `width:${Math.round(100 * Math.min(1, have / Math.max(1, n)))}%` }));
const dur = ms => { const m = Math.max(0, Math.round(ms / 60e3)); return m >= 1440 ? `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h` : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
const RC = { common: '#c9b9c4', uncommon: '#3fae78', rare: '#2f86c0', legendary: '#d4a017' };

/** Full-screen celebration for a completed set (and the season, when it is the last one). */
export function celebrateSet(app, setId, season = false) {
  const v = C.albumView(get()), s = v.sets.find(x => x.id === setId); if (!s) return;
  sfx.reward?.(); haptic('success'); track('album_set_complete', { set: setId, season });
  const conf = h('div', { class: 'confetti', 'aria-hidden': 'true' }, ...Array.from({ length: 40 }, (_, i) => h('i', { style: `--x:${(i * 37) % 100}vw;--d:${(i % 9) * 0.12}s;--c:${['#ff6b8b', '#ffd23f', '#53d3a2', '#5ec8f2', '#a98bf0'][i % 5]}` })));
  const l = h('div', { class: 'levelup set-complete' + (season ? ' season' : '') }, conf, h('div', { class: 'card' },
    h('p', { class: 'tag' }, season ? 'SEASON COMPLETE' : 'SET COMPLETE'),
    h('div', { class: 'sc-icon', 'aria-hidden': 'true' }, season ? '🏆' : s.icon), h('h1', {}, season ? C.SEASON.name : s.name),
    h('p', { class: 'small' }, season ? `All ${v.total} photos collected!` : `9 / 9 photos · ${v.setsDone} of ${v.sets.length} sets done`),
    h('p', {}, 'Reward: ', rewardText(season ? C.SEASON.grand.reward : C.SEASON.setReward)),
    h('div', { class: 'res-actions' }, h('button', { class: 'btn ghost', onclick: () => l.remove() }, 'Later'), h('button', { class: 'btn', onclick: () => { l.remove(); app.go('album', { set: setId }); } }, 'SEE & CLAIM'))));
  document.body.append(l);
}

export async function albumScreen(app, opts = {}) {
  update(x => C.ensureV21(x));
  const v = C.albumView(get());
  const snaps = await album.list().catch(() => []), byId = new Map(snaps.map(s => [s.id, s]));
  function claim(id, what) { let r; update(x => { r = C.claimAlbum(x, id); }); if (r.ok) { sfx.reward?.(); toast(`${what}: +${r.coins || 0} coins${r.diamonds ? ` +${r.diamonds} 💎` : ''}${r.badge ? ` · ${r.badge}` : ''}`, 3200); track('album_claimed', { id }); } else toast(r.reason === 'claimed' ? 'Already claimed' : 'Not complete yet'); albumScreen(app, opts); }
  const open = opts.set ? v.sets.find(s => s.id === opts.set) : null;
  if (open) {
    app.mount(shell(app, 'album', { title: `${open.icon} ${open.name}`, sub: `${open.have}/9 photos · ${C.SEASON.name}`, right: h('button', { class: 'icon-btn', 'aria-label': 'Back to Album', onclick: () => app.go('album') }, '←') },
      bar(open.have, 9, `${open.have} of 9`),
      h('div', { class: 'cards9' }, ...open.slots.map(sl => { const ph = sl.photoId && byId.get(sl.photoId);
        return h('div', { class: 'acard' + (sl.got ? ' got' : ''), style: sl.got ? `--rc:${RC[sl.rarity] || RC.common}` : '', 'aria-label': sl.got ? `${sl.name}: collected${sl.pet ? ' with ' + sl.pet : ''}` : `${sl.name}: not yet — ${'★'.repeat(sl.d)} difficulty` },
          h('div', { class: 'aphoto' }, sl.got ? (ph ? h('img', { src: album.urlFor(ph), alt: '' }) : h('span', { class: 'legacy' }, '📷', h('small', {}, 'photo from 2.0'))) : h('span', { class: 'q', 'aria-hidden': 'true' }, '?')),
          h('b', {}, sl.name), sl.got ? h('small', {}, `${'★'.repeat(Math.max(1, Math.min(5, sl.stars || 1)))}${sl.pet ? ' · ' + sl.pet : ''}${sl.at ? ' · ' + new Date(sl.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}`) : h('small', {}, 'difficulty ' + '●'.repeat(sl.d))); })),
      h('div', { class: 'card set-reward' }, h('b', {}, 'Set reward: ', rewardText(C.SEASON.setReward)),
        open.claimed ? h('p', { class: 'claimed-tag' }, '✓ Claimed') : open.complete ? h('button', { class: 'btn block claim', onclick: () => claim(open.claimId, open.name) }, 'CLAIM SET REWARD') : h('p', { class: 'small' }, 'Create these moments in the world, then SNAP them. One photo fills one slot; repeats earn a little SP instead.'))));
    return;
  }
  const grand = v.milestones.find(m => m.id === 'grand');
  app.mount(shell(app, 'album', { title: `${C.SEASON.icon} ${C.SEASON.name}`, sub: `${v.filled}/${v.total} photos · ${v.setsDone}/${v.sets.length} sets · ${plural(v.daysLeft, 'day')} left` },
    h('div', { class: 'card grand' }, h('b', {}, '🏆 Season reward'), h('span', { class: 'small' }, C.SEASON.grand.label), rewardText(grand.reward), bar(v.filled, v.total, `Season ${v.filled} of ${v.total}`)),
    h('div', { class: 'ms-row' }, ...v.milestones.filter(m => m.id !== 'grand').map(m => h('div', { class: 'ms' + (m.done ? ' done' : '') }, h('b', {}, `${m.sets} sets`), rewardText(m.reward), m.claimed ? h('small', { class: 'claimed-tag' }, '✓') : m.done ? h('button', { class: 'btn claim', onclick: () => claim(m.claimId, `${m.sets} sets`) }, 'CLAIM') : h('small', {}, `${Math.min(v.setsDone, m.sets)}/${m.sets}`)))),
    grand.done && !grand.claimed ? h('button', { class: 'btn big block claim', onclick: () => claim(grand.claimId, 'Season') }, 'CLAIM SEASON REWARD') : null,
    h('p', { class: 'small center' }, `New Album photos today: ${v.newToday}/${v.dailyNew}${v.released < v.sets.length ? ` · ${v.released} of ${v.sets.length} sets released · more in ${dur(v.nextWaveIn)}` : ''}`),
    h('div', { class: 'sets' }, ...v.sets.map(s => s.locked ? h('div', { class: 'setcard locked', 'aria-label': `${s.name}: coming in a later week` }, h('span', { class: 'set-ic', 'aria-hidden': 'true' }, '🔒'), h('b', {}, s.name), h('span', { class: 'set-n' }, 'Coming soon')) : h('button', { class: 'setcard' + (s.complete ? ' complete' : ''), 'aria-label': `${s.name}, ${s.have} of 9${s.complete && !s.claimed ? ', reward ready' : ''}`, onclick: () => app.go('album', { set: s.id }) },
      h('span', { class: 'set-ic', 'aria-hidden': 'true' }, s.icon), h('b', {}, s.name), h('span', { class: 'set-n' }, `${s.have}/9`),
      h('div', { class: 'mini-slots', 'aria-hidden': 'true' }, ...s.slots.map(x => h('i', { class: x.got ? 'on' : '' }))),
      s.complete && !s.claimed ? h('span', { class: 'ready' }, 'REWARD READY') : s.claimed ? h('span', { class: 'claimed-tag' }, '✓ Complete') : null))),
    v.dups ? h('p', { class: 'small center' }, `${plural(v.dups, 'duplicate moment')} captured (each earned +${C.DUPLICATE_SP} SP).`) : null,
    h('button', { class: 'btn ghost block', onclick: () => app.go('snaps') }, '🖼️ All my photos (My Snaps)')));
}

/* ================================================================ EVENT HUB */
export async function event21Screen(app) {
  update(x => C.ensureV21(x));
  const ev = C.currentEvent(), next = C.nextEvent();
  if (!ev) { app.go('snap'); return; }
  const v = C.eventView(get(), ev), team = ev.mode === 'team';
  const teamBox = h('div', { class: 'card team-box' }, team ? h('small', {}, 'Loading your team from the server…') : h('p', { class: 'small' }, 'Solo event — your progress is saved on this device.'));
  async function claimTeam(i) { const r = await E.claim(ev.key, i); if (r.ok) { let p; update(x => { p = C.pay(x, `srv:${ev.key}:m${i}`, ev.milestones[i].reward, 'event21'); }); sfx.reward?.(); toast(`Claimed: +${p.coins} coins${p.diamonds ? ` +${p.diamonds} 💎` : ''}`); } else toast(E.REASON[r.reason] || E.REASON.server); event21Screen(app); }
  function claimSolo(i) { let r; update(x => { r = C.claimSolo(x, ev, i); }); toast(r.ok ? `Claimed: +${r.coins} coins${r.diamonds ? ` +${r.diamonds} 💎` : ''}` : r.reason === 'claimed' ? 'Already claimed' : 'Not yet'); event21Screen(app); }
  let srv = null;
  const msList = h('div', {});
  const drawMs = () => fill(msList, ...ev.milestones.map((m, i) => { const prog = team ? (srv?.team?.[ev.id === 'build' ? 'progress' : 'score'] ?? v.progress) : v.progress, done = prog >= m.at, claimed = team ? srv?.claims?.includes(i) : false;
    return h('div', { class: 'win' + (done ? ' done' : '') }, h('div', { class: 'win-top' }, h('b', {}, team ? (ev.id === 'build' ? `${m.at}% built` : `${fmt(m.at)} team points`) : `${m.at} ${ev.id === 'puzzle' ? 'stages' : 'shows'}`), rewardText(m.reward)),
      claimed ? h('span', { class: 'claimed-tag' }, '✓ Claimed') : done ? h('button', { class: 'btn claim', onclick: () => team ? claimTeam(i) : claimSolo(i) }, 'CLAIM') : bar(Math.min(prog, m.at), m.at, `${Math.min(prog, m.at)} of ${m.at}`)); }));
  drawMs();
  app.mount(shell(app, 'snap', { title: `${ev.icon} ${ev.title}`, sub: `${team ? `TEAM of up to ${ev.teamSize}` : 'SOLO'} · ${v.state === 'active' ? `ends in ${dur(v.endsIn)}` : v.state}`, right: h('button', { class: 'icon-btn', 'aria-label': 'Back to the world', onclick: () => app.go('snap') }, '←') },
    h('div', { class: 'card conv' }, h('p', { class: 'small', style: 'margin:0' }, 'Great photos earn Snap Points. Snap Points power this game:'),
      h('div', { class: 'conv-row' }, h('b', {}, `⚡ ${C.ensureV21(get()).sp.bal.toLocaleString()} SP`), h('span', {}, '→'), h('b', {}, `${ev.conversion.icon} ${v.available} ${ev.conversion.currency}`)),
      bar(v.per - v.toNext, v.per, `${v.per - v.toNext} of ${v.per} SP to the next`), h('small', {}, `${v.per - v.toNext} / ${v.per} SP to the next ${ev.conversion.currency.replace(/s$/, '')} · ${v.made} earned this event`)),
    teamBox,
    h('button', { class: 'btn big block', disabled: v.state !== 'active' ? true : null, onclick: () => ({ racing: () => app.go('race'), build: () => app.go('build'), puzzle: () => app.go('puzzle'), fashion: () => app.go('fashion'), dance: () => app.go('dance') })[ev.id]() }, v.available ? `▶ PLAY (${v.available} ${ev.conversion.short})` : `▶ OPEN ${ev.title.toUpperCase()}`),
    v.available ? null : h('p', { class: 'small center' }, `No ${ev.conversion.currency} yet: take photos in the world — every ${ev.conversion.sp} SP makes one.`),
    h('div', { class: 'card' }, h('b', {}, 'Milestones'), msList),
    next ? h('p', { class: 'small center' }, `Next: ${next.icon} ${next.title} (${next.mode}) in ${dur(next.start - Date.now())}.`) : null,
    h('button', { class: 'linkbtn', onclick: () => app.go('training21') }, '🎯 Training: practise for free ›')));
  if (team) {
    srv = await E.state(ev.key);
    if (!srv.ok) fill(teamBox, h('b', {}, '👥 Team'), h('p', { class: 'small' }, E.REASON[srv.reason] || E.REASON.server), srv.reason === 'signin' ? h('button', { class: 'btn ghost block', onclick: () => app.go('friends', { from: 'pets' }) }, 'SIGN IN') : null);
    else if (!srv.team) fill(teamBox, h('b', {}, '👥 Team'), h('p', { class: 'small' }, `You'll join a team of up to ${ev.teamSize} (friends first) with your first ${ev.id === 'build' ? 'build action' : 'race'}.`));
    else fill(teamBox, h('b', {}, `👥 ${srv.team.name}`), h('p', { class: 'small', style: 'margin:2px 0' }, ev.id === 'build' ? `Project ${srv.team.progress}% built · shared with your team` : `Team score ${fmt(srv.team.score)}`),
      ...srv.team.members.map(m => h('div', { class: 'brow' }, h('span', { class: 'k' }, m.me ? `${m.name} (you)` : m.name), h('span', {}, fmt(m.amount)))));
    drawMs();
  }
}

/* ================================================================ TRAINING HUB */
export function training21Screen(app) {
  update(x => C.ensureV21(x));
  const s = get(), pets = W.activePets(s), pet = pets[0];
  app.mount(shell(app, 'poka', { title: 'Training', sub: `${pet.name} · the first ${C.TRAIN.rewardedPerDay} sessions of each a day give XP`, right: h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => app.go('poka') }, '←') },
    h('div', { class: 'train-grid' }, ...Object.entries(C.DISCIPLINES).map(([k, d]) => { const t = C.trainState(get(), pet.id, k);
      return h('button', { class: 'train-card', onclick: () => ({ agility: () => app.go('race', { practice: true }), fetch: () => app.go('trainFetch'), build: () => app.go('trainBuild'), pose: () => app.go('trainPose'), fashion: () => app.go('fashion', { practice: true }), dance: () => app.go('dance', { practice: true }) })[k]() }, h('span', { class: 'ti', 'aria-hidden': 'true' }, d.icon), h('b', {}, d.name), h('small', {}, d.blurb),
        h('div', { class: 'lvl' }, `Level ${t.lvl}/${C.TRAIN.maxLevel}`), bar(t.xp % C.TRAIN.xpPerLevel, C.TRAIN.xpPerLevel, `${d.name} XP`), h('small', {}, t.best ? `Best ${t.best}` : 'Not tried yet')); })),
    h('p', { class: 'small center' }, 'Training gives a small, capped edge (e.g. +1.2% race speed per level, up to +12%). It never guarantees a win and can\'t be bought.')));
}
