/* MISSIONS · MY SNAPS · CLOSET · SETTINGS */

import { h, fmt, toast } from '../ui.js';
import { activeMissions } from '../data/missions.js';
import { stars } from '../game/score.js';
import { get, update, reset } from '../game/state.js';
import * as album from '../game/album.js';
import { portrait } from '../render/pet.js';
import { drawItemThumb } from '../render/items.js';
import { visibleItems, itemView, CLOSET_TABS } from '../data/items.js';
import { saveToPhotos, share, haptic, platform } from '../platform/native.js';
import { track } from '../platform/analytics.js';
import { sfx } from '../platform/sound.js';
import { signOut, deleteAccount, session } from '../platform/auth.js';

const header = (app, title, back = 'home') => h('div', { class: 'row', style: 'margin-bottom:14px' },
  h('button', { class: 'icon-btn', onclick: () => app.go(back), 'aria-label': 'Back' }, '←'), h('h1', { style: 'margin:0' }, title));

/* ------------------------------------------------------------ MISSIONS -- */
export function missionsScreen(app) {
  const st = get(), done = st.progress.missions;
  const n = Object.keys(done).length, all = activeMissions();
  app.mount(h('div', { class: 'screen' }, header(app, 'Missions'),
    h('p', { class: 'sub' }, `${n} of ${all.length} completed`),
    h('div', { class: 'stack' }, ...all.map(m => {
      const best = done[m.missionID];
      return h('div', { class: 'mission' + (best ? ' done' : ''), role: 'button', onclick: () => app.go('brief', { missionId: m.missionID }) },
        h('div', { class: 'ic' }, m.icon),
        h('div', {}, h('b', {}, m.title), h('span', {}, m.instruction)),
        h('div', { class: 'best' }, best ? [h('div', { class: 'stars' }, '★'.repeat(stars(best)) + '☆'.repeat(3 - stars(best))), fmt(best)] : h('span', { class: 'small' }, `+${m.XPReward} XP`)));
    }))));
}

/* ------------------------------------------------------------ MY SNAPS -- */
export async function albumScreen(app) {
  const grid = h('div', { class: 'grid3' });
  const screen = h('div', { class: 'screen' }, header(app, 'My Snaps'), grid);
  app.mount(screen);
  const snaps = await album.list();
  if (!snaps.length) {
    grid.replaceWith(h('div', { class: 'empty' }, h('div', { class: 'e' }, '📷'), h('p', {}, 'No snaps yet!'),
      h('button', { class: 'btn', onclick: () => app.go('brief', { missionId: get().currentMission }) }, 'Take your first snap')));
    return;
  }
  for (const s of snaps) grid.append(h('div', { class: 'snap-thumb', onclick: () => viewer(s) },
    h('img', { src: album.urlFor(s), alt: s.missionTitle, loading: 'lazy' }), h('b', {}, fmt(s.score))));

  function viewer(s) {
    const v = h('div', { class: 'viewer', role: 'dialog' },
      h('div', { class: 'row between' },
        h('div', { class: 'meta' }, h('b', {}, `${s.petName} · ${s.missionTitle}`), h('br'), h('span', {}, `${fmt(s.score)} points · ${new Date(s.at).toLocaleDateString()}`)),
        h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => v.remove() }, '✕')),
      h('img', { src: album.urlFor(s), alt: s.missionTitle }),
      h('div', { class: 'actions4' },
        h('button', { class: 'btn mint', onclick: async () => { const r = await saveToPhotos(s.blob); if (r.ok) { toast('Saved to Photos! 📸'); track('photo_saved', { how: r.how, from: 'album' }); } } }, '💾 SAVE'),
        h('button', { class: 'btn sky', onclick: () => share(s.blob) }, '📤 SHARE')),
      h('button', { class: 'linkbtn', style: 'color:#ff8fa3', onclick: async () => {
        if (!confirm('Delete this snap from PokaSnap? Copies you saved to Photos are not affected.')) return;
        await album.remove(s.id); v.remove(); albumScreen(app);
      } }, 'Delete from PokaSnap'));
    document.body.append(v);
  }
}

/* ------------------------------------------------------------ CLOSET -- */
export function closetScreen(app, opts = {}) {
  let tab = opts.tab || 'OWNED', preview = null;
  const st = get();
  const petCanvas = h('canvas', { width: 480, height: 480, style: 'width:220px;height:220px;display:block;margin:0 auto' });
  let raf = 0;
  const loop = now => { if (!petCanvas.isConnected && raf) return; const eq = { ...get().pet.equipped }; if (preview) eq[preview.slot] = preview.itemID;
    portrait(petCanvas, { ...get().pet, equipped: eq }, preview ? 'happy' : 'idle', { t: now / 1000 }); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);

  const tabs = h('div', { class: 'tabs' });
  const grid = h('div', { class: 'items' });
  const action = h('div', { style: 'min-height:60px' });
  const coins = h('div', { class: 'pill' }, '🪙 ', fmt(st.progress.coins));

  function lockText(v) {
    const u = v.unlockRequirement;
    if (u.type === 'level') return `UNLOCK AT LEVEL ${u.level}`;
    if (u.type === 'coins') return `${u.amount} 🪙`;
    return 'STARTER';
  }
  function draw() {
    const s = get(), inv = s.inventory, eq = s.pet.equipped || {};
    tabs.replaceChildren(...CLOSET_TABS.map(t => h('button', { class: t === tab ? 'on' : '', onclick: () => { tab = t; preview = null; draw(); } }, t)));
    const list = visibleItems().map(it => itemView(it, inv, eq, s.pet.species)).filter(v => v.fits && (tab === 'OWNED' ? v.isOwned : v.slot === tab && v.unlockRequirement.type !== 'starter' || (v.slot === tab && v.isOwned)));
    grid.replaceChildren(...(list.length ? list : [h('p', { class: 'small', style: 'grid-column:1/-1;text-align:center' }, tab === 'OWNED' ? 'Nothing here yet.' : 'More coming soon!')]).map(v => {
      if (!v.itemID) return v;
      const c = h('canvas', { width: 180, height: 180 }); drawItemThumb(c, v.itemID);
      return h('div', { class: `item rar-${v.rarity}` + (preview?.itemID === v.itemID ? ' on' : '') + (v.isEquipped ? ' eq' : '') + (v.isOwned ? '' : ' locked'),
        onclick: () => { preview = v; sfx.tap(); draw(); } },
        c, h('b', {}, v.name), v.isOwned ? null : h('span', { class: 'lk' }, lockText(v)));
    }));
    // action for the previewed item
    action.replaceChildren();
    if (!preview) { action.append(h('p', { class: 'small', style: 'text-align:center' }, 'Tap an item to try it on.')); return; }
    const v = itemView(preview, inv, eq, s.pet.species);
    if (v.isOwned) {
      action.append(v.isEquipped
        ? h('button', { class: 'btn ghost block', onclick: () => { update(x => { delete x.pet.equipped[v.slot]; }); sfx.tap(); draw(); } }, 'TAKE OFF')
        : h('button', { class: 'btn block', onclick: () => { update(x => { x.pet.equipped = { ...x.pet.equipped, [v.slot]: v.itemID }; }); sfx.equip(); haptic('light'); track('cosmetic_equipped', { item: v.itemID }); preview = null; draw(); } }, 'EQUIP'));
    } else if (v.unlockRequirement.type === 'coins') {
      const cost = v.unlockRequirement.amount, can = s.progress.coins >= cost;
      action.append(h('button', { class: 'btn sun block', disabled: !can, onclick: () => {
        update(x => { x.progress.coins -= cost; x.inventory.push(v.itemID); x.pet.equipped = { ...x.pet.equipped, [v.slot]: v.itemID }; });
        sfx.unlock(); haptic('success'); track('cosmetic_equipped', { item: v.itemID, via: 'coins' }); coins.lastChild.textContent = fmt(get().progress.coins);
        toast(`${v.name} unlocked!`); preview = null; draw();
      } }, can ? `UNLOCK FOR ${cost} 🪙` : `NEED ${cost - s.progress.coins} MORE 🪙`));
    } else {
      action.append(h('button', { class: 'btn ghost block', disabled: true }, lockText(v)));
    }
  }
  app.mount(h('div', { class: 'screen', style: 'gap:10px' },
    h('div', { class: 'row between' }, h('div', { class: 'row' }, h('button', { class: 'icon-btn', onclick: () => app.go('home'), 'aria-label': 'Back' }, '←'), h('h1', { style: 'margin:0' }, 'Closet')), coins),
    petCanvas, action, tabs, grid));
  draw();
}

/* ------------------------------------------------------------ SETTINGS -- */
export async function settingsScreen(app) {
  const st = get();
  const tg = (key, label) => {
    const t = h('span', { class: 'toggle' + (st.settings[key] ? ' on' : '') });
    return h('button', { onclick: () => { update(s => { s.settings[key] = !s.settings[key]; }); t.classList.toggle('on'); } }, label, t);
  };
  const sess = await session();
  const signedIn = !!sess;
  app.mount(h('div', { class: 'screen', style: 'gap:14px' }, header(app, 'Settings'),
    h('p', { class: 'small', style: 'margin:0' }, 'ACCOUNT'),
    h('div', { class: 'list' },
      h('div', {}, signedIn ? `Signed in as ${sess.user.email || 'KEEPITIL member'}` : 'Playing as a guest', h('span', {}, signedIn ? '✅' : '👤')),
      signedIn
        ? h('button', { onclick: async () => { await signOut(); update(s => { s.account = { mode: 'guest', userId: null, email: null }; }); toast('Signed out — your pet stays on this device'); settingsScreen(app); } }, 'Sign out', '›')
        : h('button', { onclick: () => app.go('email') }, 'Save progress to an account', '›'),
      signedIn ? h('button', { class: 'danger', onclick: () => confirmDelete(app) }, 'Delete account', '›') : null),
    h('p', { class: 'small', style: 'margin:0' }, 'GAME'),
    h('div', { class: 'list' }, tg('sound', 'Sound'), tg('haptics', 'Haptics')),
    h('p', { class: 'small', style: 'margin:0' }, 'HELP'),
    h('div', { class: 'list' },
      h('a', { href: 'https://keepitil.com/games/pokasnap/privacy.html', target: '_blank', rel: 'noopener' }, 'Privacy Policy', '›'),
      h('a', { href: 'https://keepitil.com/games/pokasnap/support.html', target: '_blank', rel: 'noopener' }, 'Support', '›'),
      h('button', { class: 'danger', onclick: async () => {
        if (!confirm('Start over? This erases your pet, progress and snaps on this device.')) return;
        reset(); await album.clearAll(); app.go('welcome');
      } }, 'Start over', '›')),
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
