/* MISSIONS · ADVENTURE BOOK (My Snaps) · CLOSET · SETTINGS */

import { h, fmt, toast, coin, sheet, plural } from '../ui.js';
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
import { accessKind, hasAccess, plusSubscribed, previewActive } from '../game/entitlements.js';
import { species as speciesOf, freeAppearances } from '../data/pets.js';
import { activeCollections, collectionView } from '../game/adventure.js';
import { TRACKS } from '../platform/sound.js';
import * as cloud from '../platform/cloud.js';
import * as notify from '../platform/notify.js';
import * as health from '../platform/health.js';
import * as UP from '../platform/update.js';
import * as introMusic from '../platform/intromusic.js';
import * as P from '../platform/purchases.js';
import { NOTIFY } from '../data/economy.js';

import { STAR_TEXT, GATES } from '../data/progression.js';
import { totalStars } from '../game/progress.js';
import '../data/challenges.js';
import { saveLoadout, applyLoadout, activeSetBonuses, MAX_LOADOUTS } from '../game/build.js';
const header = (app, title, back = 'home', right = null) => h('div', { class: 'row between', style: 'margin-bottom:12px' },
  h('div', { class: 'row' }, h('button', { class: 'icon-btn', onclick: () => app.go(back), 'aria-label': 'Back' }, '←'), h('h1', { style: 'margin:0' }, title)), right);

/* ------------------------------------------------------------ MISSIONS -- */
export function missionsScreen(app) {
  const st = get(), done = st.progress.missions, lvl = st.progress.level || 1;
  const all = activeMissions(new Date(), lvl), n = all.filter(m => m.missionID in done).length;
  const card = m => {
    const best = done[m.missionID], p = poseOf(m.recommendedPose), s5 = st.stars?.[m.missionID] || 0;
    return h('div', { class: 'mission' + (best != null ? ' done' : '') + (m.master ? ' master' : ''), role: 'button', tabindex: 0, onclick: () => app.go('brief', { missionId: m.missionID }) },
      h('div', { class: 'ic' }, m.icon),
      h('div', { class: 'grow' }, h('b', {}, m.title), h('span', {}, m.instruction),
        h('span', { class: 'mmeta' }, m.anySkill ? '🎓 any trick' : `${p.icon} ${p.name}`, ' · ', m.XPReward, ' XP', m.sequence ? ` · 🔁 ×${m.sequence}` : '', m.noGear ? ' · no gear' : '')),
      h('div', { class: 'best' }, best != null ? [h('div', { class: 'stars' }, STAR_TEXT(s5)), fmt(best)] : h('span', { class: 'new' }, 'NEW')));
  };
  const nextGate = GATES.find(g => g.level > lvl);
  app.mount(h('div', { class: 'screen' }, header(app, 'Challenges'),
    h('p', { class: 'sub' }, `${n} of ${all.length} open challenges completed · ⭐ ${plural(totalStars(st), 'star')} · replay to earn more stars`),
    ...GATES.flatMap((g, i) => {
      const hi = GATES[i + 1]?.level ?? 999, ms = all.filter(m => (m.level || 1) >= g.level && (m.level || 1) < hi);
      return ms.length ? [h('p', { class: 'cat-h' }, `${g.icon} ${g.name.toUpperCase()}`), h('div', { class: 'stack', style: 'gap:10px' }, ...ms.map(card))] : [];
    }),
    nextGate ? h('div', { class: 'card note' }, h('b', {}, `🔒 ${nextGate.icon} ${nextGate.name} — level ${nextGate.level}`), h('p', { class: 'small', style: 'margin:4px 0 0' }, nextGate.blurb)) : null));
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
  function loadouts() {
    const s = get(), bonuses = activeSetBonuses(s.pet.equipped);
    const sh = sheet(h('h2', {}, 'Saved looks'),
      h('p', { class: 'small', style: 'margin:0 0 8px' }, `Save up to ${MAX_LOADOUTS} outfits and switch in one tap.${bonuses.length ? ' Active: ' + bonuses.map(b => `${b.name} (${b.pieces})`).join(', ') : ''}`),
      h('div', { class: 'stack' }, ...(s.loadouts || []).map(l => h('div', { class: 'row between card' }, h('b', {}, l.name), h('span', { class: 'small' }, `${Object.keys(l.equipped).length} items`),
        h('button', { class: 'btn ghost', onclick: () => { let r; update(x => { r = applyLoadout(x, l.name, hasAccess); }); sh.close(); toast(r.skipped?.length ? `Wearing ${l.name} (${r.skipped.length} item not available)` : `Wearing ${l.name}`); draw(); } }, 'WEAR')))),
      h('button', { class: 'btn block', style: 'margin-top:8px', onclick: () => { const name = prompt('Name this look', `Look ${(s.loadouts || []).length + 1}`); if (!name) return; let r; update(x => { r = saveLoadout(x, name); }); sh.close(); if (r.ok) { track('loadout_saved', {}); toast('Look saved!'); } else toast(`You can keep ${MAX_LOADOUTS} looks — overwrite one by using its name.`); } }, '＋ SAVE CURRENT LOOK'));
  }
  function looks(s) {
    const sp = speciesOf(s.pet.species);
    return sp.appearances.map(a => ({ appearance: a.id, name: a.name, a, slot: 'LOOK', itemID: a.item || null, ok: !a.item || hasAccess(s, a.item) }));
  }
  function draw() {
    const s = get(), eq = s.pet.equipped || {};
    tabs.replaceChildren(...CLOSET_TABS.map(t => h('button', { class: t === tab ? 'on' : '', 'aria-pressed': String(t === tab), onclick: () => { tab = t; preview = null; draw(); } }, t)),
      h('button', { class: 'loadout-btn', onclick: () => loadouts() }, '💾 LOOKS'));
    action.replaceChildren();
    if (tab === 'LOOK') {
      grid.replaceChildren(...looks(s).map(l => h('button', { class: 'item look' + (s.pet.appearance === l.appearance ? ' eq' : '') + (l.ok ? '' : ' locked'), 'aria-label': l.name,
        onclick: () => { preview = l; sfx.tap(); if (!l.ok) { action.replaceChildren(h('button', { class: 'btn sun block', onclick: () => app.go('item', { id: l.itemID }) }, 'SEE WAYS TO GET CANDY LOOKS')); return; }
          update(x => { x.pet.appearance = l.appearance; }); track('pet_customized', { appearance: l.appearance }); equipped(); preview = null; draw(); } },
        h('span', { class: 'swatch mini', style: `background:radial-gradient(circle at 35% 30%, ${l.a.belly}, ${l.a.base} 55%, ${l.a.shade})` }), h('b', {}, l.name), l.ok ? null : h('span', { class: 'lk' }, '🍬 CANDY PACK'))));
      return;
    }
    const list = visibleItems().filter(it => !['POSE', 'LOOK', 'PROP', 'BG', 'FILTER'].includes(it.slot) && it.petCompatibility.includes(s.pet.species))
      .map(it => ({ ...it, kind: accessKind(s, it.itemID), isEquipped: Object.values(eq).includes(it.itemID) }))
      .filter(v => tab === 'OWNED' ? !!v.kind : v.slot === tab && (!!v.kind || !v.paths.every(p => p.type === 'PREVIEW' || p.type === 'PLUS_ACCESS') || previewActive(s)));
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
  const sec = t => h('p', { class: 'small set-h' }, t);
  const row = (label, sub, onclick, cls = '') => h('button', { class: cls, onclick }, h('span', {}, label, sub ? h('br') : null, sub ? h('span', { class: 'small' }, sub) : null), h('span', { class: 'chev' }, '›'));
  const link = (label, href) => h('a', { href, target: '_blank', rel: 'noopener' }, label, h('span', { class: 'chev' }, '›'));
  app.mount(h('div', { class: 'screen settings-screen', style: 'gap:14px' }, header(app, 'Settings'),
    sec('ACCOUNT'),
    h('div', { class: 'list' },
      h('div', {}, signedIn ? `Signed in as ${sess.user.email || 'KEEPITIL member'}` : 'Playing as a guest', h('span', {}, signedIn ? '✅' : '👤')),
      signedIn
        ? h('button', { onclick: async () => { await signOut(); update(s => { s.account = { mode: 'guest', userId: null, email: null }; }); toast('Signed out. Your pet stays on this device'); settingsScreen(app); } }, 'Sign out', h('span', { class: 'chev' }, '›'))
        : row(`Protect ${st.pet?.name || 'your pet'} with an account`, 'Back up memories and add friends', () => app.go('email')),
      row('🤝 Friends & Invites', 'Your friend code, invites and friend list', () => app.go('friends', { from: 'settings' })),
      signedIn ? h('button', { class: 'danger', onclick: () => confirmDelete(app) }, 'Delete account', h('span', { class: 'chev' }, '›')) : null),
    sec('CLOUD & BACKUP'),
    cloudCard(app, st),
    sec('NOTIFICATIONS'),
    notifyCard(app, st),
    sec('AUDIO'),
    h('div', { class: 'list' },
      tg('music', 'Music', on => { if (on) music.start(); else { music.stop(); introMusic.stop('quiet'); } }),
      h('div', { class: 'player' }, h('button', { class: 'icon-btn', 'aria-label': 'Previous track', onclick: e => { const t = music.prev(); e.currentTarget.parentNode.querySelector('.tname').textContent = t.name; } }, '⏮'),
        h('span', { class: 'tname', 'aria-live': 'polite' }, music.track().name),
        h('button', { class: 'icon-btn', 'aria-label': music.playing() ? 'Pause music' : 'Play music', onclick: e => { const on = music.toggle(); e.currentTarget.textContent = on ? '⏸' : '▶'; } }, music.playing() ? '⏸' : '▶'),
        h('button', { class: 'icon-btn', 'aria-label': 'Next track', onclick: e => { const t = music.next(); e.currentTarget.parentNode.querySelector('.tname').textContent = t.name; } }, '⏭')),
      slider('musicVolume', 'Music volume', v => music.setVolume(v)),
      tg('sound', 'Sound Effects'),
      slider('sfxVolume', 'Effects volume'),
      tg('haptics', 'Haptics'),
      h('p', { class: 'small', style: 'margin:0;padding:6px 14px' }, 'Music on also plays the intro song (“Meow Meow” from Raving Animals, via SoundCloud). Music off keeps the intro silent.'),
      row('🎧 KEEPITIL Music', 'Stations by genre and your own playlists', () => app.go('music', { from: 'settings' }))),
    sec('HEALTH · WALK WITH POKA'),
    healthCard(app),
    sec('POKASNAP+ & PURCHASES'),
    P.isTestStore() ? h('div', { class: 'test-store' }, 'TEST STORE: QA only, no real charges') : null,
    h('div', { class: 'list' },
      h('button', { onclick: () => app.go('plus') }, plusSubscribed(st) ? '🌟 PokaSnap+ is active' : previewActive(st) ? '👀 PokaSnap+ Preview is on' : '🌟 PokaSnap+', h('span', { class: 'chev' }, '›')),
      h('button', { onclick: () => app.go('store', { back: 'settings' }) }, '🛍️ Store', h('span', { class: 'chev' }, '›')),
      h('button', { onclick: () => app.go('plus') }, 'Restore Purchases', h('span', { class: 'chev' }, '›'))),
    sec('PRIVACY'),
    h('div', { class: 'list' },
      link('Privacy Policy', 'https://keepitil.com/games/pokasnap/privacy.html'),
      h('button', { class: 'danger', onclick: async () => {
        if (!confirm('Start over? This erases your pet, progress and snaps on this device.')) return;
        reset(); await album.clearAll(); app.go('welcome');
      } }, 'Start over (erase this device)', h('span', { class: 'chev' }, '›'))),
    sec('HELP & SUPPORT'),
    h('div', { class: 'list' },
      row('🛟 Help & Support', 'Answers, and email to a person', () => app.go('help', { from: 'settings' })),
      link('Support website', 'https://keepitil.com/games/pokasnap/support.html')),
    aboutCard(app)));
}

/* ABOUT + UPDATES: always the last block. Version/build come from the installed native bundle. */
function aboutCard(app) {
  const ver = h('p', { class: 'about-ver', 'data-version': '' }, '…');
  const status = h('div', { class: 'update-status', role: 'status', 'aria-live': 'polite' });
  const btn = h('button', { class: 'btn block', onclick: () => run(true) }, 'Check for Updates');
  const badge = h('span', { class: 'update-badge', hidden: true }, 'UPDATE AVAILABLE');
  async function run(manual) {
    btn.disabled = true; btn.textContent = 'Checking…'; track('update_check', { manual });
    const r = await UP.checkForUpdate();
    btn.disabled = false; btn.textContent = 'Check for Updates';
    badge.hidden = r.state !== 'update';
    if (r.state === 'current') status.replaceChildren(h('p', { class: 'ok' }, '✓ PokaSnap is up to date'), h('p', { class: 'small' }, UP.displayVersion(r.info)));
    else if (r.state === 'update') status.replaceChildren(h('p', { class: 'up' }, h('b', {}, 'Update Available'), h('br'), `Version ${r.latestVersion}`),
      r.releaseNotes ? h('p', { class: 'small' }, r.releaseNotes) : null,
      r.url ? h('button', { class: 'btn sky block', onclick: async () => { track('update_open', { kind: r.urlKind }); const o = await UP.openUpdate(r.url); if (!o.ok) toast('Open the App Store app and search “PokaSnap”.'); } }, r.urlKind === 'testflight' ? 'Update in TestFlight' : 'Update PokaSnap')
        : h('p', { class: 'small' }, 'Open the App Store app and search “PokaSnap” to update.'));
    else status.replaceChildren(h('p', {}, 'Unable to check for updates right now.'), h('p', { class: 'small' }, `Your installed version is ${r.info.source === 'native' ? `${r.info.version} (${r.info.build})` : 'the web version'}.`));
  }
  UP.appInfo().then(i => { ver.textContent = UP.displayVersion(i); ver.dataset.version = i.version; ver.dataset.build = i.build; });
  run(false);   // one lightweight check when Settings opens
  return h('div', { class: 'card about-card' },
    h('div', { class: 'row', style: 'align-items:center;justify-content:space-between' }, h('b', { class: 'about-name' }, h('span', { class: 'poka' }, 'Poka'), h('span', { class: 'snap' }, 'Snap')), badge),
    ver, btn, status,
    h('p', { class: 'small about-credits' }, 'Presented by KEEPITIL · Developed by Tuitea'),
    h('p', { class: 'small about-links' },
      h('a', { href: 'https://keepitil.com/games/pokasnap/privacy.html', target: '_blank', rel: 'noopener' }, 'Privacy Policy'), ' · ',
      h('a', { href: 'https://keepitil.com/games/pokasnap/support.html', target: '_blank', rel: 'noopener' }, 'Support'), ' · ',
      h('a', { href: 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/', target: '_blank', rel: 'noopener' }, 'Terms of Use')));
}

function healthCard(app) {
  const box = h('div', { class: 'list' }, h('div', {}, 'Checking step access…'));
  health.status().then(s => {
    const txt = { available: 'Step counting is connected', denied: 'Step counting is off', unavailable: 'Step counting isn’t available here', unknown: 'Step counting not set up yet' }[s] || 'Step counting not set up yet';
    box.replaceChildren(h('div', { class: 'col' }, h('b', {}, txt), h('span', { class: 'small' }, 'PokaSnap reads today’s step count only. It stays on your phone and is never backed up or used for ads.')),
      h('button', { onclick: () => app.go('walk') }, s === 'available' ? '🥾 Walk With Poka' : '🥾 Set up Walk With Poka', h('span', { class: 'chev' }, '›')));
  }).catch(() => box.replaceChildren(h('div', {}, 'Step counting isn’t available here')));
  return box;
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
    box.replaceChildren(...[
      p === 'granted' ? null : h('button', { onclick: async () => { track('notification_permission_requested', { from: 'settings' }); const r = await notify.request(); update(s => { s.notify.asked = true; }); if (r === 'granted') window.PokaNotifyReschedule?.(); settingsScreen(app); } },
        p === 'denied' ? 'Notifications are off in iOS Settings' : 'Turn on gentle reminders', h('span', { class: 'chev' }, '›')),
      ...rows].filter(Boolean));   // never pass null: replaceChildren renders it as the text "null"
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
