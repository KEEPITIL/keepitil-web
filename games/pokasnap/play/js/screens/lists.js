/* MISSIONS · ADVENTURE BOOK (My Snaps) · CLOSET · SETTINGS */

import { h, fmt, toast, coin } from '../ui.js';
import { activeMissions, CATEGORIES } from '../data/missions.js';
import { pose as poseOf } from '../data/poses.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { stars } from '../game/score.js';
import { get, update, reset } from '../game/state.js';
import * as album from '../game/album.js';
import { portrait } from '../render/pet.js';
import { drawItemThumb, drawFrame } from '../render/items.js';
import { visibleItems, itemView, CLOSET_TABS } from '../data/items.js';
import { profile, markDaily, boost } from '../game/companion.js';
import { saveToPhotos, share, haptic, platform } from '../platform/native.js';
import { track } from '../platform/analytics.js';
import { sfx, music } from '../platform/sound.js';
import { signOut, deleteAccount, session } from '../platform/auth.js';
import { CONFIG } from '../config.js';
import { accessKind, hasAccess, plusSubscribed, previewActive } from '../game/entitlements.js';
import { species as speciesOf, freeAppearances } from '../data/pets.js';
import { activeCollections, collectionView } from '../game/adventure.js';
import { TRACKS } from '../platform/sound.js';
import * as cloud from '../platform/cloud.js';
import * as notify from '../platform/notify.js';
import * as P from '../platform/purchases.js';
import { NOTIFY } from '../data/economy.js';

const header = (app, title, back = 'home', right = null) => h('div', { class: 'row between', style: 'margin-bottom:12px' },
  h('div', { class: 'row' }, h('button', { class: 'icon-btn', onclick: () => app.go(back), 'aria-label': 'Back' }, '←'), h('h1', { style: 'margin:0' }, title)), right);

/* ------------------------------------------------------------ MISSIONS -- */
export function missionsScreen(app) {
  const st = get(), done = st.progress.missions;
  const all = activeMissions(), n = all.filter(m => m.missionID in done).length;
  const card = m => {
    const best = done[m.missionID], p = poseOf(m.recommendedPose);
    return h('div', { class: 'mission' + (best ? ' done' : ''), role: 'button', tabindex: 0, onclick: () => app.go('brief', { missionId: m.missionID }) },
      h('div', { class: 'ic' }, m.icon),
      h('div', { class: 'grow' }, h('b', {}, m.title), h('span', {}, m.instruction),
        h('span', { class: 'mmeta' }, m.anySkill ? '🎓 any trick' : `${p.icon} ${p.name}`, ' · ⭐ ', m.XPReward, ' XP · ', coin(), ' ', m.coinReward)),
      h('div', { class: 'best' }, best ? [h('div', { class: 'stars' }, '★'.repeat(stars(best)) + '☆'.repeat(3 - stars(best))), fmt(best)] : h('span', { class: 'new' }, 'NEW')));
  };
  app.mount(h('div', { class: 'screen' }, header(app, 'Missions'),
    h('p', { class: 'sub' }, `${n} of ${all.length} completed · replay any mission to beat your best`),
    ...CATEGORIES.flatMap(c => {
      const ms = all.filter(m => m.category === c.id);
      return ms.length ? [h('p', { class: 'cat-h' }, `${c.icon} ${c.name.toUpperCase()}`), h('div', { class: 'stack', style: 'gap:10px' }, ...ms.map(card))] : [];
    })));
}

/* ---------------------------------------------------- ADVENTURE BOOK -- */
const BOOK_TABS = ['RECENT', 'BEST SHOTS', 'MISSIONS', 'FAVORITES', 'SEASONAL', 'BADGES'];
export async function albumScreen(app, opts = {}) {
  track('album_opened', {});
  const st = get(), pet = st.pet, pr = profile(st);
  let tab = opts.tab || 'RECENT';
  const pc = h('canvas', { width: 180, height: 180, class: 'prof-pet' });
  portrait(pc, pet, 'happy', { t: 0.4 });
  const stat = (k, v) => h('div', { class: 'stat' }, h('b', {}, v), h('span', {}, k));
  const prof = h('div', { class: 'card profile' },
    h('div', { class: 'row' }, pc, h('div', {},
      h('h2', { style: 'margin:0' }, pet.name),
      h('p', { class: 'small', style: 'margin:2px 0 0' }, `Adopted ${new Date(pr.adopted || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`),
      h('p', { class: 'small', style: 'margin:2px 0 0' }, `Favourite pose: ${pr.favoritePose}`))),
    h('div', { class: 'stats' }, stat('photos', pr.photos), stat('missions', pr.missions), stat('best', fmt(pr.best)), stat('outfits', pr.outfits), stat('skills', pr.skills)));
  const tabs = h('div', { class: 'tabs' });
  const body = h('div', {});
  app.mount(h('div', { class: 'screen book' }, header(app, 'Adventure Book'), prof, tabs, body));
  let snaps = await album.list();
  const draw = () => {
    tabs.replaceChildren(...BOOK_TABS.map(t => h('button', { class: t === tab ? 'on' : '', onclick: () => { tab = t; draw(); } }, t)));
    if (tab === 'SEASONAL') {
      const cols = activeCollections();
      body.replaceChildren(...(cols.length ? cols.map(c => { const v = collectionView(get(), c);
        return h('div', { class: 'card collection' },
          h('div', { class: 'row between' }, h('b', {}, `${c.icon} ${c.name}`), h('span', { class: 'small' }, `${v.count} / ${c.goals.length}`)),
          h('div', { class: 'meter sm', role: 'progressbar', 'aria-valuenow': v.count, 'aria-valuemax': c.goals.length }, h('i', { style: `width:${100 * v.count / c.goals.length}%` }), h('span', {}, `${v.count} of ${c.goals.length}`)),
          h('ul', { class: 'goals' }, ...c.goals.map(g => h('li', { class: v.done[g.id] ? 'got' : '' }, v.done[g.id] ? '✓ ' : '○ ', g.label))),
          h('p', { class: 'small', style: 'margin:6px 0 0' }, `${c.partial.need} goals: ${c.partial.coins} coins + Autumn Leaves Frame · All ${c.goals.length}: Leaf Crown (earn only)`)); })
        : [h('div', { class: 'empty' }, h('div', { class: 'e' }, '🍂'), h('p', {}, 'The next seasonal collection is on its way.'))]));
      return;
    }
    if (tab === 'BADGES') {
      body.replaceChildren(h('div', { class: 'badges' }, ...ACHIEVEMENTS.map(a => {
        const got = get().achievements[a.id];
        return h('div', { class: 'badge' + (got ? ' got' : '') }, h('span', { class: 'e' }, got ? a.icon : '🔒'), h('b', {}, a.name), h('span', {}, a.desc));
      })));
      return;
    }
    let list = snaps;
    if (tab === 'BEST SHOTS') list = [...snaps].sort((a, b) => b.score - a.score).slice(0, 12);
    if (tab === 'FAVORITES') list = snaps.filter(s => s.fav);
    if (tab === 'MISSIONS') { const seen = new Map(); for (const s of snaps) { const b = seen.get(s.missionID); if (!b || s.score > b.score) seen.set(s.missionID, s); } list = [...seen.values()]; }
    if (!list.length) {
      body.replaceChildren(h('div', { class: 'empty' }, h('div', { class: 'e' }, tab === 'FAVORITES' ? '💖' : '📷'),
        h('p', {}, tab === 'FAVORITES' ? 'Tap ♡ on a photo to keep it here.' : 'No snaps yet!'),
        tab === 'FAVORITES' ? null : h('button', { class: 'btn', onclick: () => app.go('brief', { missionId: get().currentMission }) }, 'Take your first snap')));
      return;
    }
    body.replaceChildren(h('div', { class: 'grid2' }, ...list.map(s => h('div', { class: 'snap-thumb', role: 'button', 'aria-label': `${s.missionTitle}, ${fmt(s.score)} points`, onclick: () => viewer(s) },
      h('img', { src: album.urlFor(s), alt: s.missionTitle, loading: 'lazy' }),
      h('div', { class: 'cap' }, h('b', {}, s.missionTitle), h('span', {}, fmt(s.score))),
      s.journey || s.rare || s.daily ? h('span', { class: 'snap-tag' }, s.rare ? '✨' : s.journey ? '🥾' : '☀️') : null,
      get().cloud.memories[s.id] ? h('span', { class: 'cloud-tag', 'aria-label': 'Backed up' }, '☁️') : null,
      s.fav ? h('i', { class: 'fav-dot' }, '♥') : null))));
  };
  draw();

  function viewer(s) {
    const favBtn = h('button', { class: 'icon-btn fav' + (s.fav ? ' on' : ''), 'aria-label': s.fav ? 'Remove favourite' : 'Favourite', onclick: async () => {
      s.fav = !s.fav; await album.patch(s.id, { fav: s.fav }); favBtn.classList.toggle('on', s.fav); favBtn.textContent = s.fav ? '♥' : '♡'; sfx.tap(); draw();
    } }, s.fav ? '♥' : '♡');
    const p = s.poseId ? poseOf(s.poseId) : null;
    const v = h('div', { class: 'viewer', role: 'dialog' },
      h('div', { class: 'row between' },
        h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => v.remove() }, '✕'), favBtn),
      h('img', { src: album.urlFor(s), alt: s.missionTitle }),
      h('div', { class: 'meta' },
        h('b', {}, s.missionTitle),
        h('div', { class: 'meta-grid' },
          h('span', {}, `🏆 ${fmt(s.score)}`), h('span', {}, `📅 ${new Date(s.at).toLocaleDateString()}`),
          h('span', {}, `🐾 ${s.petName}`), p ? h('span', {}, `${p.icon} ${p.name}`) : null),
        s.caption ? h('p', { class: 'caption' }, `“${s.caption}”`) : null,
        s.rare ? h('p', { class: 'small', style: 'color:#ffd84a;margin:4px 0 0' }, `✨ Rare Moment: ${s.rare}`) : s.journey ? h('p', { class: 'small', style: 'color:#9fe0bf;margin:4px 0 0' }, '🥾 Journey Snap') : null),
      h('button', { class: 'btn ghost', style: 'min-height:44px', onclick: async e => {
        const b = e.currentTarget; if (get().cloud.memories[s.id]) { toast('Already backed up ☁️'); return; }
        b.disabled = true; b.textContent = 'Backing up…';
        const r = await cloud.uploadCloudCopy(s);
        if (r.ok) { track('cloud_backup', { count: 1, auto: false }); toast(`☁️ Backed up (${Math.round((r.bytes || 0) / 1024)} KB copy)`); b.textContent = '☁️ Backed up'; }
        else { b.disabled = false; b.textContent = '☁️ Back up'; toast(r.reason === 'signin' ? 'Sign in (Settings) to back up memories' : r.reason === 'quota' ? `Cloud is full (${r.usage?.quota}). PokaSnap+ holds 500.` : 'Backup failed — try again later', 3000); }
      } }, get().cloud.memories[s.id] ? '☁️ Backed up' : '☁️ Back up'),
      h('div', { class: 'actions4' },
        h('button', { class: 'btn mint', onclick: async () => { const r = await saveToPhotos(s.blob); if (r.ok) { toast(r.how === 'download' ? 'Downloaded!' : 'Saved to Photos! 📸'); track('photo_saved', { how: r.how, from: 'album' }); } else if (!r.cancelled) toast(r.error?.includes('denied') ? 'Allow Photos access in Settings to save' : 'Could not save — try Share'); } }, '💾 SAVE'),
        h('button', { class: 'btn sky', onclick: () => share(s.blob) }, '📤 SHARE')),
      h('button', { class: 'linkbtn', style: 'color:#ff8fa3', onclick: async () => {
        if (!confirm('Delete this snap from PokaSnap? Copies you saved to Photos are not affected.')) return;
        await album.remove(s.id); v.remove(); snaps = await album.list(); draw();
      } }, 'Delete from PokaSnap'));
    document.body.append(v);
  }
}

/* ------------------------------------------------------------ CLOSET -- */
/* Wear what you own (and Premium Closet items while PokaSnap+ is on).
   Anything not yet yours opens its store page, which lists every way to get it. */
export function closetScreen(app, opts = {}) {
  let tab = opts.tab || 'OWNED', preview = null;
  const st = get();
  const size = Math.round(Math.max(160, Math.min(260, window.innerHeight * 0.3)));
  const petCanvas = h('canvas', { width: size * 2, height: size * 2, style: `width:${size}px;height:${size}px;display:block;margin:0 auto` });
  let raf = 0;
  const loop = now => { if (!petCanvas.isConnected && raf) return; const p = get().pet, eq = { ...p.equipped }; if (preview && preview.slot !== 'LOOK') eq[preview.slot] = preview.itemID;
    portrait(petCanvas, { ...p, equipped: eq, appearance: preview?.appearance || p.appearance }, preview ? 'happy' : 'idle', { t: now / 1000 });
    if (eq.FRAME) drawFrame(petCanvas.getContext('2d'), eq.FRAME, petCanvas.width, petCanvas.height, now / 1000);
    raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);

  const tabs = h('div', { class: 'tabs wrap' });
  const grid = h('div', { class: 'items' });
  const action = h('div', { style: 'min-height:60px' });
  const coins = h('button', { class: 'pill', 'aria-label': 'Poka Coins. Open the store', onclick: () => app.go('store', { back: 'closet' }) }, coin(), h('span', {}, fmt(st.progress.coins)));
  const equipped = () => {
    let r; update(x => { r = markDaily(x, 'outfit'); boost(x, 'outfit'); });
    if (r.newly) { track('daily_task_completed', { task: 'outfit' }); if (r.bonus) toast(`💞 Daily bond bonus! +${r.bonus.coins} coins`); }
  };
  function lockText(v) {
    const u = v.unlockRequirement;
    if (u.type === 'level') return `LEVEL ${u.level}`;
    if (u.type === 'coins') return [String(u.amount) + ' ', coin()];
    if (u.type === 'achievement') { const a = ACHIEVEMENTS.find(x => x.id === u.id); return `BADGE: ${a ? a.name.toUpperCase() : '?'}`; }
    return v.prestige ? 'EARN ONLY' : 'SEE WAYS';
  }
  function looks(s) {
    const sp = speciesOf(s.pet.species);
    return sp.appearances.map(a => ({ appearance: a.id, name: a.name, a, slot: 'LOOK', itemID: a.item || null, ok: !a.item || hasAccess(s, a.item) }));
  }
  function draw() {
    const s = get(), eq = s.pet.equipped || {};
    tabs.replaceChildren(...CLOSET_TABS.map(t => h('button', { class: t === tab ? 'on' : '', 'aria-pressed': String(t === tab), onclick: () => { tab = t; preview = null; draw(); } }, t)));
    action.replaceChildren();
    if (tab === 'LOOK') {
      grid.replaceChildren(...looks(s).map(l => h('button', { class: 'item look' + (s.pet.appearance === l.appearance ? ' eq' : '') + (l.ok ? '' : ' locked'), 'aria-label': l.name,
        onclick: () => { preview = l; sfx.tap(); if (!l.ok) { action.replaceChildren(h('button', { class: 'btn sun block', onclick: () => app.go('item', { id: l.itemID }) }, 'SEE WAYS TO GET CANDY LOOKS')); return; }
          update(x => { x.pet.appearance = l.appearance; }); track('pet_customized', { appearance: l.appearance }); equipped(); preview = null; draw(); } },
        h('span', { class: 'swatch mini', style: `background:radial-gradient(circle at 35% 30%, ${l.a.belly}, ${l.a.base} 55%, ${l.a.shade})` }), h('b', {}, l.name), l.ok ? null : h('span', { class: 'lk' }, '🍬 CANDY PACK'))));
      return;
    }
    const list = visibleItems().filter(it => it.slot !== 'POSE' && it.slot !== 'LOOK' && it.petCompatibility.includes(s.pet.species))
      .map(it => ({ ...it, kind: accessKind(s, it.itemID), isEquipped: Object.values(eq).includes(it.itemID) }))
      .filter(v => tab === 'OWNED' ? !!v.kind : v.slot === tab && (!!v.kind || !v.paths.every(p => p.type === 'PREVIEW' || p.type === 'PLUS_ROTATING_ACCESS') || previewActive(s)));
    grid.replaceChildren(...(list.length ? list : [h('p', { class: 'small', style: 'grid-column:1/-1;text-align:center' }, tab === 'OWNED' ? 'Nothing here yet.' : 'More coming soon!')]).map(v => {
      if (!v.itemID) return v;
      const c = h('canvas', { width: 180, height: 180 }); drawItemThumb(c, v.itemID);
      return h('div', { class: `item rar-${v.rarity}` + (preview?.itemID === v.itemID ? ' on' : '') + (v.isEquipped ? ' eq' : '') + (v.kind ? '' : ' locked'),
        role: 'button', 'aria-label': `${v.name}${v.kind === 'owned' ? ', yours' : v.kind === 'plus' ? ', PokaSnap+ access' : ', locked'}`, onclick: () => { preview = v; sfx.tap(); draw(); } },
        c, h('b', {}, v.name), v.kind === 'plus' ? h('span', { class: 'lk plus' }, '🌟 PLUS') : v.kind ? null : h('span', { class: 'lk' }, lockText(v)));
    }));
    if (!preview) { action.append(h('p', { class: 'small', style: 'text-align:center;margin:8px 0' }, 'Tap an item to try it on.'), h('button', { class: 'linkbtn', style: 'display:block;margin:0 auto', onclick: () => app.go('store', { back: 'closet' }) }, '🛍️ Visit the Store ›')); return; }
    const v = { ...preview, kind: accessKind(s, preview.itemID), isEquipped: Object.values(eq).includes(preview.itemID) };
    if (v.kind) {
      action.append(v.isEquipped
        ? h('button', { class: 'btn ghost block', onclick: () => { update(x => { delete x.pet.equipped[v.slot]; }); sfx.tap(); preview = null; draw(); } }, 'TAKE OFF')
        : h('button', { class: 'btn block', onclick: () => { update(x => { x.pet.equipped = { ...x.pet.equipped, [v.slot]: v.itemID }; }); sfx.equip(); haptic('light'); track('cosmetic_equipped', { item: v.itemID }); equipped(); preview = null; draw(); } }, 'EQUIP'),
        v.kind === 'plus' ? h('p', { class: 'small', style: 'text-align:center;margin:6px 0 0' }, 'Premium Closet: yours to wear while PokaSnap+ is active.') : null);
    } else action.append(h('button', { class: 'btn sun block', onclick: () => app.go('item', { id: v.itemID }) }, 'SEE WAYS TO GET IT'));
  }
  app.mount(h('div', { class: 'screen closet', style: 'gap:10px' },
    header(app, 'Closet', 'home', coins), petCanvas, action, tabs, grid));
  draw();
}

/* ------------------------------------------------------------ SETTINGS -- */
export async function settingsScreen(app) {
  const st = get();
  const tg = (key, label, onChange) => {
    const t = h('span', { class: 'toggle' + (st.settings[key] ? ' on' : '') });
    return h('button', { role: 'switch', 'aria-checked': String(!!st.settings[key]), onclick: e => {
      update(s => { s.settings[key] = !s.settings[key]; }); t.classList.toggle('on'); e.currentTarget.setAttribute('aria-checked', String(get().settings[key])); onChange?.(get().settings[key]);
    } }, label, t);
  };
  const slider = (key, label, onInput) => {
    const inp = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: st.settings[key] ?? 1, 'aria-label': label });
    inp.oninput = () => { const v = +inp.value; update(s => { s.settings[key] = v; }); onInput?.(v); };
    return h('label', { class: 'slider' }, h('span', {}, label), inp);
  };
  const sess = await session();
  const signedIn = !!sess;
  const sc = CONFIG.soundcloudUrl;
  app.mount(h('div', { class: 'screen', style: 'gap:14px' }, header(app, 'Settings'),
    h('p', { class: 'small', style: 'margin:0' }, 'ACCOUNT'),
    h('div', { class: 'list' },
      h('div', {}, signedIn ? `Signed in as ${sess.user.email || 'KEEPITIL member'}` : 'Playing as a guest', h('span', {}, signedIn ? '✅' : '👤')),
      signedIn
        ? h('button', { onclick: async () => { await signOut(); update(s => { s.account = { mode: 'guest', userId: null, email: null }; }); toast('Signed out — your pet stays on this device'); settingsScreen(app); } }, 'Sign out', h('span', { class: 'chev' }, '›'))
        : h('button', { onclick: () => app.go('email') }, `Protect ${st.pet?.name || 'your pet'} with an account`, h('span', { class: 'chev' }, '›')),
      signedIn ? h('button', { class: 'danger', onclick: () => confirmDelete(app) }, 'Delete account', h('span', { class: 'chev' }, '›')) : null),
    h('p', { class: 'small', style: 'margin:0' }, 'SOUND'),
    h('div', { class: 'list' },
      tg('music', 'Music', on => on ? music.start() : music.stop()),
      h('div', { class: 'player' }, h('button', { class: 'icon-btn', 'aria-label': 'Previous track', onclick: e => { const t = music.prev(); e.currentTarget.parentNode.querySelector('.tname').textContent = t.name; } }, '⏮'),
        h('span', { class: 'tname', 'aria-live': 'polite' }, music.track().name),
        h('button', { class: 'icon-btn', 'aria-label': music.playing() ? 'Pause music' : 'Play music', onclick: e => { const on = music.toggle(); e.currentTarget.textContent = on ? '⏸' : '▶'; } }, music.playing() ? '⏸' : '▶'),
        h('button', { class: 'icon-btn', 'aria-label': 'Next track', onclick: e => { const t = music.next(); e.currentTarget.parentNode.querySelector('.tname').textContent = t.name; } }, '⏭')),
      slider('musicVolume', 'Music volume', v => music.setVolume(v)),
      tg('sound', 'Sound Effects'),
      slider('sfxVolume', 'Effects volume'),
      tg('haptics', 'Haptics')),
    h('p', { class: 'small', style: 'margin:0' }, 'MUSIC'),
    h('div', { class: 'list' },
      h('div', { class: 'radio' }, h('div', {}, h('b', {}, '📻 PokaSnap Radio'), h('br'), h('span', { class: 'small' }, 'The cozy tune you hear on menus is made for PokaSnap.'))),
      sc ? h('a', { href: sc, target: '_blank', rel: 'noopener external', onclick: () => track('soundcloud_link_opened', {}) },
        h('span', {}, 'More music from KEEPITIL', h('br'), h('span', { class: 'small' }, 'Opens SoundCloud (external)')), h('span', { class: 'sc-btn' }, 'LISTEN ON SOUNDCLOUD ↗')) : null,
      sc && CONFIG.soundcloudTrackUrl ? h('a', { href: CONFIG.soundcloudTrackUrl, target: '_blank', rel: 'noopener external', onclick: () => track('soundcloud_track_opened', {}) },
        'Listen to the PokaSnap soundtrack', '↗') : null),
    h('p', { class: 'small', style: 'margin:0' }, 'POKASNAP+ & PURCHASES'),
    P.isTestStore() ? h('div', { class: 'test-store' }, 'TEST STORE — QA only, no real charges') : null,
    h('div', { class: 'list' },
      h('button', { onclick: () => app.go('plus') }, plusSubscribed(st) ? '🌟 PokaSnap+ — active' : previewActive(st) ? '👀 PokaSnap+ Preview — on' : '🌟 PokaSnap+', h('span', { class: 'chev' }, '›')),
      h('button', { onclick: () => app.go('store', { back: 'settings' }) }, '🛍️ Store', h('span', { class: 'chev' }, '›')),
      h('button', { onclick: () => app.go('plus') }, 'Restore Purchases', h('span', { class: 'chev' }, '›'))),
    h('p', { class: 'small', style: 'margin:0' }, 'CLOUD MEMORIES'),
    cloudCard(app, st),
    h('p', { class: 'small', style: 'margin:0' }, 'NOTIFICATIONS'),
    notifyCard(app, st),
    h('p', { class: 'small', style: 'margin:0' }, 'HELP'),
    h('div', { class: 'list' },
      h('a', { href: 'https://keepitil.com/games/pokasnap/privacy.html', target: '_blank', rel: 'noopener' }, 'Privacy Policy', h('span', { class: 'chev' }, '›')),
      h('a', { href: 'https://keepitil.com/games/pokasnap/support.html', target: '_blank', rel: 'noopener' }, 'Support', h('span', { class: 'chev' }, '›')),
      h('button', { class: 'danger', onclick: async () => {
        if (!confirm('Start over? This erases your pet, progress and snaps on this device.')) return;
        reset(); await album.clearAll(); app.go('welcome');
      } }, 'Start over', h('span', { class: 'chev' }, '›'))),
    h('p', { class: 'small', style: 'text-align:center' }, `PokaSnap ${window.POKASNAP_VERSION || ''} · ${platform}`)));
}

function cloudCard(app, st) {
  const box = h('div', { class: 'list cloud' }, h('div', {}, 'Checking…'));
  (async () => {
    const u = await cloud.getCloudUsage();
    if (!u.signedIn) { box.replaceChildren(h('div', { class: 'col' }, h('b', {}, 'Photos stay on this phone'), h('span', { class: 'small' }, `Sign in to back up up to ${u.quota} favourite memories (compressed copies). Originals never leave your device unless you choose.`)),
      h('button', { onclick: () => app.go('email') }, 'Sign in to back up', h('span', { class: 'chev' }, '›'))); return; }
    const full = u.used >= u.quota;
    box.replaceChildren(
      h('div', { class: 'col' }, h('b', {}, `${u.used} / ${u.quota} cloud memories`), h('div', { class: 'meter sm', role: 'progressbar', 'aria-valuenow': u.used, 'aria-valuemax': u.quota }, h('i', { style: `width:${Math.min(100, 100 * u.used / u.quota)}%` }), h('span', {}, full ? 'Full' : `${u.quota - u.used} left`)),
        h('span', { class: 'small' }, plusSubscribed(st) ? 'PokaSnap+: favourites can back up automatically.' : 'Free: back up favourites by hand. PokaSnap+ raises this to 500 and can back up automatically.')),
      plusSubscribed(st) ? (() => { const on = cloud.autoBackup(st), t = h('span', { class: 'toggle' + (on ? ' on' : '') });
        return h('button', { role: 'switch', 'aria-checked': String(on), onclick: e => { update(x => { x.cloud.autoBackup = !cloud.autoBackup(x); }); t.classList.toggle('on'); e.currentTarget.setAttribute('aria-checked', String(cloud.autoBackup(get()))); } }, 'Automatic favourite backup', t); })() : null,
      h('button', { disabled: full, onclick: async e => {
        e.currentTarget.disabled = true; let n = 0, fail = null;
        for (const snap of (await album.list()).filter(x => x.fav && !get().cloud.memories[x.id])) { const r = await cloud.uploadCloudCopy(snap); if (!r.ok) { fail = r.reason; break; } n++; }
        await cloud.backupProgress(); track('cloud_backup', { count: n, auto: false });
        toast(fail === 'quota' ? `Cloud is full (${u.quota}). ${n} backed up.` : `Backed up ${n} favourite${n === 1 ? '' : 's'} and your progress.`, 2800); settingsScreen(app);
      } }, full ? 'Cloud full' : '☁️ Back up favourites now', h('span', { class: 'chev' }, '›')),
      h('button', { onclick: async () => { const r = await cloud.restoreCloudLibrary(); const p = await cloud.restoreProgress(); track('cloud_restore', { photos: r.restored || 0, progress: !!p.adopted });
        toast(r.ok ? `Restored ${r.restored} photo${r.restored === 1 ? '' : 's'}${p.adopted ? ' and newer progress' : ''}.` : 'Could not reach the cloud.', 2800); } }, '⬇️ Restore from cloud', h('span', { class: 'chev' }, '›')));
  })().catch(() => box.replaceChildren(h('div', {}, 'Cloud is unavailable offline.')));
  return box;
}

function notifyCard(app, st) {
  if (!notify.supported()) return h('div', { class: 'list' }, h('div', { class: 'col' }, h('span', {}, 'Reminders are available in the PokaSnap iPhone app.'), h('span', { class: 'small' }, 'At most one gentle reminder a day. Never on first launch.')));
  const box = h('div', { class: 'list' });
  const rows = Object.entries(NOTIFY.types).map(([k, t]) => {
    const tgl = h('span', { class: 'toggle' + (st.notify.prefs[k] ? ' on' : '') });
    return h('button', { role: 'switch', 'aria-checked': String(!!st.notify.prefs[k]), onclick: e => { update(s => { s.notify.prefs[k] = !s.notify.prefs[k]; }); tgl.classList.toggle('on'); e.currentTarget.setAttribute('aria-checked', String(get().notify.prefs[k])); window.PokaNotifyReschedule?.(); } }, t.label, tgl);
  });
  notify.permission().then(p => {
    box.replaceChildren(
      p === 'granted' ? null : h('button', { onclick: async () => { track('notification_permission_requested', { from: 'settings' }); const r = await notify.request(); update(s => { s.notify.asked = true; }); if (r === 'granted') window.PokaNotifyReschedule?.(); settingsScreen(app); } },
        p === 'denied' ? 'Notifications are off in iOS Settings' : 'Turn on gentle reminders', h('span', { class: 'chev' }, '›')),
      ...rows);
  });
  return box;
}

function confirmDelete(app) {
  const ok = confirm('Delete your KEEPITIL account? This permanently deletes your account and cloud data. Your pet and snaps on this device are kept unless you also choose Start over.');
  if (!ok) return;
  deleteAccount().then(() => {
    update(s => { s.account = { mode: 'guest', userId: null, email: null }; });
    toast('Your account has been deleted', 3000); app.go('settings');
  }).catch(e => toast(e.message || 'Could not delete account — try again'));
}
