/* MISSIONS · ADVENTURE BOOK (My Snaps) · CLOSET · SETTINGS */

import { h, fmt, toast, coin } from '../ui.js';
import { activeMissions, CATEGORIES } from '../data/missions.js';
import { pose as poseOf } from '../data/poses.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { stars } from '../game/score.js';
import { get, update, reset } from '../game/state.js';
import * as album from '../game/album.js';
import { portrait } from '../render/pet.js';
import { drawItemThumb } from '../render/items.js';
import { visibleItems, itemView, CLOSET_TABS } from '../data/items.js';
import { profile, markDaily, boost } from '../game/companion.js';
import { saveToPhotos, share, haptic, platform } from '../platform/native.js';
import { track } from '../platform/analytics.js';
import { sfx, music } from '../platform/sound.js';
import { signOut, deleteAccount, session } from '../platform/auth.js';
import { CONFIG } from '../config.js';

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
const BOOK_TABS = ['RECENT', 'BEST SHOTS', 'MISSIONS', 'FAVORITES', 'BADGES'];
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
        s.caption ? h('p', { class: 'caption' }, `“${s.caption}”`) : null),
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
export function closetScreen(app, opts = {}) {
  let tab = opts.tab || 'OWNED', preview = null;
  const st = get();
  const size = Math.round(Math.max(160, Math.min(260, window.innerHeight * 0.3)));
  const petCanvas = h('canvas', { width: size * 2, height: size * 2, style: `width:${size}px;height:${size}px;display:block;margin:0 auto` });
  let raf = 0;
  const loop = now => { if (!petCanvas.isConnected && raf) return; const eq = { ...get().pet.equipped }; if (preview) eq[preview.slot] = preview.itemID;
    portrait(petCanvas, { ...get().pet, equipped: eq }, preview ? 'happy' : 'idle', { t: now / 1000 }); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);

  const tabs = h('div', { class: 'tabs fit' });
  const grid = h('div', { class: 'items' });
  const action = h('div', { style: 'min-height:60px' });
  const coins = h('div', { class: 'pill' }, coin(), h('span', {}, fmt(st.progress.coins)));
  const equipped = () => {
    let r; update(x => { r = markDaily(x, 'outfit'); boost(x, 'outfit'); });
    if (r.newly) { track('daily_task_completed', { task: 'outfit' }); if (r.bonus) toast(`💞 Daily bond bonus! +${r.bonus.coins} coins`); }
  };

  function lockText(v) {
    const u = v.unlockRequirement;
    if (u.type === 'level') return `UNLOCK AT LEVEL ${u.level}`;
    if (u.type === 'coins') return [String(u.amount) + ' ', coin()];
    if (u.type === 'achievement') { const a = ACHIEVEMENTS.find(x => x.id === u.id); return `BADGE: ${a ? a.name.toUpperCase() : '?'}`; }
    return 'STARTER';
  }
  function draw() {
    const s = get(), inv = s.inventory, eq = s.pet.equipped || {};
    tabs.replaceChildren(...CLOSET_TABS.map(t => h('button', { class: t === tab ? 'on' : '', onclick: () => { tab = t; preview = null; draw(); } }, t)));
    const list = visibleItems().map(it => itemView(it, inv, eq, s.pet.species)).filter(v => v.fits && (tab === 'OWNED' ? v.isOwned : v.slot === tab && (v.unlockRequirement.type !== 'starter' || v.isOwned)));
    grid.replaceChildren(...(list.length ? list : [h('p', { class: 'small', style: 'grid-column:1/-1;text-align:center' }, tab === 'OWNED' ? 'Nothing here yet.' : 'More coming soon!')]).map(v => {
      if (!v.itemID) return v;
      const c = h('canvas', { width: 180, height: 180 }); drawItemThumb(c, v.itemID);
      return h('div', { class: `item rar-${v.rarity}` + (preview?.itemID === v.itemID ? ' on' : '') + (v.isEquipped ? ' eq' : '') + (v.isOwned ? '' : ' locked'),
        role: 'button', 'aria-label': v.name, onclick: () => { preview = v; sfx.tap(); draw(); } },
        c, h('b', {}, v.name), v.isOwned ? null : h('span', { class: 'lk' }, lockText(v)));
    }));
    action.replaceChildren();
    if (!preview) { action.append(h('p', { class: 'small', style: 'text-align:center;margin:8px 0' }, 'Tap an item to try it on.')); return; }
    const v = itemView(preview, inv, eq, s.pet.species);
    if (v.isOwned) {
      action.append(v.isEquipped
        ? h('button', { class: 'btn ghost block', onclick: () => { update(x => { delete x.pet.equipped[v.slot]; }); sfx.tap(); draw(); } }, 'TAKE OFF')
        : h('button', { class: 'btn block', onclick: () => { update(x => { x.pet.equipped = { ...x.pet.equipped, [v.slot]: v.itemID }; }); sfx.equip(); haptic('light'); track('cosmetic_equipped', { item: v.itemID }); equipped(); preview = null; draw(); } }, 'EQUIP'));
    } else if (v.unlockRequirement.type === 'coins') {
      const cost = v.unlockRequirement.amount, can = s.progress.coins >= cost;
      action.append(h('button', { class: 'btn sun block', disabled: !can, onclick: () => {
        update(x => { x.progress.coins -= cost; x.inventory.push(v.itemID); x.pet.equipped = { ...x.pet.equipped, [v.slot]: v.itemID }; });
        sfx.unlock(); haptic('success'); track('cosmetic_equipped', { item: v.itemID, via: 'coins' }); equipped(); coins.lastChild.textContent = fmt(get().progress.coins);
        toast(`${v.name} unlocked!`); preview = null; draw();
      } }, ...(can ? [`UNLOCK FOR ${cost} `, coin()] : [`NEED ${cost - s.progress.coins} MORE `, coin()])));
    } else {
      action.append(h('button', { class: 'btn ghost block', disabled: true }, lockText(v)));
    }
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
      tg('sound', 'Sound Effects'),
      tg('haptics', 'Haptics')),
    h('p', { class: 'small', style: 'margin:0' }, 'MUSIC'),
    h('div', { class: 'list' },
      h('div', { class: 'radio' }, h('div', {}, h('b', {}, '📻 PokaSnap Radio'), h('br'), h('span', { class: 'small' }, 'The cozy tune you hear on menus is made for PokaSnap.'))),
      sc ? h('a', { href: sc, target: '_blank', rel: 'noopener external', onclick: () => track('soundcloud_link_opened', {}) },
        h('span', {}, 'More music from KEEPITIL', h('br'), h('span', { class: 'small' }, 'Opens SoundCloud (external)')), h('span', { class: 'sc-btn' }, 'LISTEN ON SOUNDCLOUD ↗')) : null,
      sc && CONFIG.soundcloudTrackUrl ? h('a', { href: CONFIG.soundcloudTrackUrl, target: '_blank', rel: 'noopener external', onclick: () => track('soundcloud_track_opened', {}) },
        'Listen to the PokaSnap soundtrack', '↗') : null),
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

function confirmDelete(app) {
  const ok = confirm('Delete your KEEPITIL account? This permanently deletes your account and cloud data. Your pet and snaps on this device are kept unless you also choose Start over.');
  if (!ok) return;
  deleteAccount().then(() => {
    update(s => { s.account = { mode: 'guest', userId: null, email: null }; });
    toast('Your account has been deleted', 3000); app.go('settings');
  }).catch(e => toast(e.message || 'Could not delete account — try again'));
}
