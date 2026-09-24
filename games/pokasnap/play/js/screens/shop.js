/* STORE · ITEM (Earn / Plus / Buy) · POKASNAP+ · REWARDED VIDEO
   ---------------------------------------------------------------------------
   The item screen shows EVERY valid way to get something, so the economy
   explains itself: Earn (progress), Coins, PokaSnap+, Buy Now.
   Buy buttons appear only for products StoreKit actually returned -- on the
   web they read "Available in the PokaSnap iPhone app" instead. The QA mock
   store shows a TEST STORE badge on every screen it touches. */

import { h, fmt, coin, sheet, toast } from '../ui.js';
import { get, update } from '../game/state.js';
import { ITEMS, item as itemOf, path } from '../data/items.js';
import { PRODUCTS, productByKey, productId } from '../data/store.js';
import { PLAN_ROWS, PLUS, EARN } from '../data/economy.js';
import { acquisition, buyWithCoins, isOwned, hasAccess, accessKind, plusSubscribed, previewActive, startPreview, applyTransaction, refreshEntitlements, rotatingNow, offered } from '../game/entitlements.js';
import { pointsFor } from '../game/events.js';
import { markDaily, boost } from '../game/companion.js';
import * as P from '../platform/purchases.js';
import { provider as ads, remainingToday } from '../platform/ads.js';
import { portrait } from '../render/pet.js';
import { drawItemThumb, drawFrame } from '../render/items.js';
import { track } from '../platform/analytics.js';
import { sfx } from '../platform/sound.js';
import { haptic, isNative } from '../platform/native.js';

const SECTIONS = [
  ['Featured', it => it.featured || ['body_hoodie_explorer', 'body_raincoat_puddle', 'look_candy', 'pose_disco', 'frame_sparkle'].includes(it.itemID)],
  ['Pets', it => it.slot === 'LOOK'], ['Outfits', it => it.slot === 'BODY'], ['Accessories', it => ['HEAD', 'NECK', 'FACE'].includes(it.slot) && !it.category?.includes('keepsake')],
  ['Poses', it => it.slot === 'POSE'], ['Frames', it => it.slot === 'FRAME'], ['Seasonal', it => !!path(it, 'SEASONAL')],
  ['Plus', it => !!path(it, 'PLUS_ROTATING_ACCESS') || !!path(it, 'POKASNAP_PLUS')], ['Owned', null],
];
const testBadge = () => P.isTestStore() ? h('div', { class: 'test-store', role: 'note' }, 'TEST STORE — QA only, no real charges') : null;
const thumb = (id, size = 90) => { const c = h('canvas', { width: size * 2, height: size * 2, style: `width:${size}px;height:${size}px` }); drawItemThumb(c, id); return c; };
const priceOf = key => P.product(key)?.displayPrice || null;

let productsLoaded = null;
export function ensureProducts() { if (!productsLoaded) productsLoaded = P.loadProducts(); return productsLoaded; }

/* ---------------------------------------------------------------- store -- */
export async function storeScreen(app, opts = {}) {
  track('store_opened', {});
  let tab = opts.tab || 'Featured';
  const st = get();
  const coins = h('div', { class: 'pill', 'aria-label': 'Poka Coins' }, coin(), h('span', {}, fmt(st.progress.coins)));
  const tabs = h('div', { class: 'tabs wrap' }), grid = h('div', { class: 'shop-grid' }), packs = h('div', { class: 'packs' });
  const earn = earnCard(app);
  app.mount(h('div', { class: 'screen shop' },
    h('div', { class: 'row between' }, h('div', { class: 'row' }, h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => app.go(opts.back || 'home') }, '←'), h('h1', { style: 'margin:0' }, 'Store')), coins),
    testBadge(), plusBanner(app), earn, tabs, grid, packs));
  await ensureProducts();
  const draw = () => {
    const s = get();
    tabs.replaceChildren(...SECTIONS.map(([t]) => h('button', { class: t === tab ? 'on' : '', 'aria-pressed': String(t === tab), onclick: () => { tab = t; draw(); } }, t)));
    const f = SECTIONS.find(x => x[0] === tab)[1];
    const list = ITEMS.filter(it => it.slot !== 'SPECIAL' && (f ? f(it) : isOwned(s, it.itemID)) && (tab === 'Owned' || offered(it) || isOwned(s, it.itemID)) && !(path(it, 'FREE_BASE')?.level === 0 && tab !== 'Owned'));
    grid.replaceChildren(...(list.length ? list.map(it => card(app, s, it)) : [h('p', { class: 'small', style: 'grid-column:1/-1;text-align:center' }, tab === 'Owned' ? 'Nothing yet — earn or unlock items and they live here forever.' : 'More coming soon!')]));
    packs.replaceChildren(...(tab === 'Featured' || tab === 'Pets' || tab === 'Poses' || tab === 'Frames' || tab === 'Seasonal' ? packCards(app, s, tab) : []));
  };
  draw();
}
function card(app, s, it) {
  const k = accessKind(s, it.itemID);
  const tag = k === 'owned' ? 'Yours forever' : k === 'plus' ? 'With PokaSnap+' : it.prestige ? 'Earn only' : path(it, 'COIN_UNLOCK') ? `${path(it, 'COIN_UNLOCK').cost} coins` : path(it, 'EVENT_EARNED') ? 'Earn in events' : path(it, 'PERMANENT_PURCHASE') ? 'Pack' : 'Special';
  return h('button', { class: `shop-item rar-${it.rarity}` + (k ? ' has' : ''), 'aria-label': `${it.name}. ${tag}`, onclick: () => itemScreen(app, it.itemID) },
    thumb(it.itemID, 72), h('b', {}, it.name), h('span', { class: 'tag' + (k === 'owned' ? ' own' : it.prestige ? ' pres' : '') }, tag));
}
function packCards(app, s, tab) {
  const fam = { Featured: null, Pets: 'pet_pack', Poses: 'pose_pack', Frames: 'effect_pack', Seasonal: 'season_pack' }[tab];
  const list = PRODUCTS.filter(p => p.type !== 'subscription' && p.key.startsWith('pack.') && (!fam || p.family === fam) && (fam || p.featured));
  if (!list.length) return [];
  return [h('p', { class: 'cat-h' }, 'PACKS — you get exactly what is listed'), ...list.map(p => {
    const owned = p.grants.every(id => isOwned(s, id));
    return h('div', { class: 'card pack' },
      h('div', { class: 'row' }, ...p.grants.slice(0, 3).map(id => thumb(id, 54))),
      h('b', {}, p.name), h('p', { class: 'small', style: 'margin:2px 0 8px' }, p.description),
      owned ? h('span', { class: 'tag own' }, '✓ Yours forever') : buyButton(app, p.key));
  })];
}
function buyButton(app, key, label) {
  const price = priceOf(key);
  if (!P.available()) return h('p', { class: 'small web-buy' }, '📱 Available in the PokaSnap iPhone app');
  if (!price) return h('p', { class: 'small web-buy' }, 'Coming soon to the App Store');
  return h('button', { class: 'btn sun block', onclick: () => purchase(app, key) }, label || `BUY NOW · ${price}`);
}
export async function purchase(app, key, after) {
  track('purchase_started', { product: key });
  const r = await P.buy(key);
  if (r.status === 'success') {
    let res; update(s => { res = applyTransaction(s, r.tx); });
    track(productByKey(key)?.type === 'subscription' ? 'plus_started' : 'purchase_completed', { product: key });
    sfx.unlock(); haptic('success');
    toast(productByKey(key)?.type === 'subscription' ? '🌟 Welcome to PokaSnap+!' : `✓ ${productByKey(key)?.name} is yours forever`, 2600);
    (after || (() => app.go(app.route, {})))();
  } else if (r.status === 'cancelled') toast('Purchase cancelled — nothing was charged.');
  else if (r.status === 'pending') toast('Purchase pending approval. It will appear when approved.', 3000);
  else { track('purchase_failed', { product: key }); toast(`Purchase didn't go through${r.error ? ': ' + r.error : ''}. Nothing was charged.`, 3200); }
}
function plusBanner(app) {
  const s = get(), on = plusSubscribed(s), pv = previewActive(s);
  return h('button', { class: 'plus-banner' + (on ? ' on' : ''), onclick: () => app.go('plus') },
    h('b', {}, on ? '🌟 PokaSnap+ is active' : pv ? '👀 PokaSnap+ Preview is on' : '🌟 PokaSnap+'),
    h('span', {}, on ? 'Premium Closet, auto headline rewards, cloud backup ›' : 'Subscribe past the grind — see what\'s included ›'));
}
function earnCard(app) {
  const s = get(), left = remainingToday(s), ad = ads.requestAd(s);
  if (!ad && left > 0) return null;                                  // no creative available -> no offer at all
  return h('div', { class: 'card earn' },
    h('div', { class: 'row between' }, h('b', {}, '🎬 Watch a short video — earn ', EARN.rewardedMedia, ' ', coin()), h('span', { class: 'small' }, `${left}/3 left today`)),
    left > 0 ? h('button', { class: 'btn ghost block', style: 'margin-top:8px', onclick: () => rewardedScreen(app, { back: app.route }) }, '▶ WATCH (optional)')
      : h('p', { class: 'small', style: 'margin:6px 0 0' }, 'That\'s today\'s videos — come back tomorrow. Playing always earns coins too.'));
}

/* ---------------------------------------------------------------- item -- */
export async function itemScreen(app, id) {
  await ensureProducts();
  const it = itemOf(id), s = get(), pet = s.pet;
  track('item_previewed', { item: id });
  const pv = h('canvas', { width: 440, height: 440, class: 'preview-pet', 'aria-label': `${pet.name} wearing ${it.name}` });
  const eq = { ...pet.equipped }; if (['HEAD', 'NECK', 'BODY', 'FACE'].includes(it.slot)) eq[it.slot] = id;
  let appearance = pet.appearance;
  if (it.slot === 'LOOK') { const sp = (await import('../data/pets.js')).species(pet.species); appearance = sp.appearances.find(a => a.item === id)?.id || appearance; }
  const poseId = it.slot === 'POSE' ? it.pose : 'happy';
  let raf = 0; const loop = t => { if (!pv.isConnected && raf) return; portrait(pv, { ...pet, equipped: eq, appearance }, poseId, { t: t / 1000 }); if (it.slot === 'FRAME') { const c = pv.getContext('2d'); drawFrame(c, id, pv.width, pv.height, t / 1000); } raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
  const rows = acquisition(s, it, { eventPoints: tpl => pointsFor(s, tpl) });
  const k = accessKind(s, id);
  const rowEl = r => {
    switch (r.kind) {
      case 'earn': case 'earnOnly': {
        const have = r.have, prog = have != null && r.points ? h('div', { class: 'meter sm' }, h('i', { style: `width:${Math.min(100, 100 * have / r.points)}%` }), h('span', {}, `${Math.min(have, r.points)} / ${r.points} AP`)) : null;
        return h('div', { class: 'acq' + (r.kind === 'earnOnly' ? ' pres' : '') }, h('span', { class: 'k' }, r.kind === 'earnOnly' ? '🏅 EARN ONLY' : '🧭 EARN'), h('div', {}, h('span', {}, r.label), prog,
          r.event && have == null ? h('span', { class: 'small' }, 'Returns when this event comes back around.') : null));
      }
      case 'coins': return h('div', { class: 'acq' }, h('span', { class: 'k' }, '🪙 COINS'), h('div', {},
        k === 'owned' ? h('span', {}, 'Owned') : h('button', { class: 'btn sun', disabled: !r.can, onclick: () => {
          let res; update(x => { res = buyWithCoins(x, id); });
          if (res.ok) { track('coins_spent', { amount: r.cost, item: id }); sfx.unlock(); haptic('success'); toast(`${it.name} unlocked — yours forever!`); itemScreen(app, id); }
          else toast(res.reason === 'short' ? `You need ${r.cost - get().progress.coins} more coins` : 'Not available right now');
        } }, r.can ? `UNLOCK FOR ${r.cost} ` : `NEED ${r.cost - s.progress.coins} MORE `, coin())));
      case 'plus': return h('div', { class: 'acq plus' }, h('span', { class: 'k' }, '🌟 POKASNAP+'), h('div', {}, h('span', {}, r.active ? '✓ Included — it\'s yours' : r.label), r.active ? null : h('button', { class: 'linkbtn', onclick: () => app.go('plus') }, 'See PokaSnap+ ›')));
      case 'plusAccess': return h('div', { class: 'acq plus' }, h('span', { class: 'k' }, '🌟 PLUS ACCESS'), h('div', {}, h('span', {}, r.label), h('span', { class: 'small' }, 'Use it while PokaSnap+ is active. Premium Closet items are access, not ownership.')));
      case 'buy': return h('div', { class: 'acq' }, h('span', { class: 'k' }, '💳 BUY NOW'), h('div', {}, h('span', {}, r.pack?.name + (r.pack?.grants.length > 1 ? ` (${r.pack.grants.length} items)` : '')),
        k === 'owned' ? h('span', {}, 'Owned') : buyButton(app, r.key)));
      case 'season': return h('div', { class: 'acq' }, h('span', { class: 'k' }, '🍂 SEASON'), h('span', {}, r.label + (r.open ? ' — available now' : ' — out of season')));
      case 'preview': return h('div', { class: 'acq' }, h('span', { class: 'k' }, '👀 PREVIEW'), h('span', {}, 'You\'re previewing it on your pet above.'));
      default: return null;
    }
  };
  app.mount(h('div', { class: 'screen item-detail' },
    h('div', { class: 'row' }, h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => app.go('store') }, '←'), h('h1', { style: 'margin:0;font-size:24px' }, it.name)),
    testBadge(), pv,
    h('p', { class: 'owned-line' }, k === 'owned' ? '✓ Yours forever' : k === 'plus' ? '🌟 Available with your PokaSnap+ access' : it.prestige ? '🏅 Prestige reward — can\'t be bought' : 'Ways to get it'),
    h('div', { class: 'acqs' }, ...rows.map(rowEl).filter(Boolean)),
    k && ['HEAD', 'NECK', 'BODY', 'FACE', 'FRAME'].includes(it.slot) ? h('button', { class: 'btn block', onclick: () => { let d; update(x => { x.pet.equipped = { ...x.pet.equipped, [it.slot]: id }; d = markDaily(x, 'outfit'); boost(x, 'outfit'); }); track('cosmetic_equipped', { item: id, via: 'store' }); if (d?.newly) track('daily_task_completed', { task: 'outfit' }); toast('Equipped!'); app.go('closet'); } }, 'WEAR IT') : null,
    k && it.slot === 'LOOK' ? h('button', { class: 'btn block', onclick: () => app.go('closet', { tab: 'LOOK' }) }, 'CHOOSE A LOOK IN THE CLOSET') : null));
}

/* ---------------------------------------------------------------- plus -- */
export async function plusScreen(app) {
  track('plus_viewed', {});
  await ensureProducts();
  const s = get(), on = plusSubscribed(s), pv = previewActive(s);
  const cell = v => v === 'yes' ? h('span', { class: 'yes', 'aria-label': 'Included' }, '✓') : v === 'no' ? h('span', { class: 'no', 'aria-label': 'Not included' }, '—') : h('span', {}, v);
  const grid = h('table', { class: 'plan-grid' },
    h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Free'), h('th', { class: 'plus' }, 'PokaSnap+'))),
    h('tbody', {}, ...PLAN_ROWS.map(([b, f, p]) => h('tr', { class: f === p ? 'same' : 'diff' }, h('th', { scope: 'row' }, b), h('td', {}, cell(f)), h('td', { class: 'plus' }, cell(p))))));
  const mo = priceOf('plus.monthly'), yr = priceOf('plus.yearly');
  const rot = rotatingNow();
  app.mount(h('div', { class: 'screen plus-screen' },
    h('div', { class: 'row' }, h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => app.go('store') }, '←'), h('h1', { style: 'margin:0' }, 'PokaSnap+')),
    testBadge(),
    h('p', { class: 'sub' }, 'Everyone gets the whole photo game. PokaSnap+ adds time-savers, rotating premium looks and more cloud space.'),
    on ? h('div', { class: 'card plus-on' }, h('b', {}, '🌟 You\'re a PokaSnap+ member'), h('p', { class: 'small', style: 'margin:4px 0 0' }, `Renews or ends ${new Date(s.plus.expiresAt).toLocaleDateString()}. Anything marked "Yours forever" stays yours if Plus ends.`),
      isNative ? h('a', { class: 'linkbtn', href: P.manageSubscriptionsUrl(), target: '_blank', rel: 'noopener' }, 'Manage subscription ›') : null) : null,
    h('div', { class: 'plan-cards' }, grid),
    h('div', { class: 'card' }, h('b', {}, `🌟 Premium Closet this month (${rot.length})`),
      h('div', { class: 'row', style: 'flex-wrap:wrap;gap:8px;margin-top:8px' }, ...rot.map(it => h('button', { class: 'mini-item', onclick: () => itemScreen(app, it.itemID) }, thumb(it.itemID, 56), h('span', {}, it.name)))),
      h('p', { class: 'small', style: 'margin:8px 0 0' }, 'Premium Closet items rotate monthly and are usable while you\'re a member (access, not ownership). Headline rewards and monthly keepsakes are yours forever.')),
    on ? null : h('div', { class: 'stack' },
      !P.available() ? h('p', { class: 'small web-buy' }, `📱 PokaSnap+ is available in the iPhone app (${PLUS.fallbackPrice.monthly}/month or ${PLUS.fallbackPrice.yearly}/year).`)
        : mo || yr ? [mo ? h('button', { class: 'btn block big', onclick: () => purchase(app, 'plus.monthly', () => plusScreen(app)) }, `${mo} / month`) : null,
          yr ? h('button', { class: 'btn sky block', onclick: () => purchase(app, 'plus.yearly', () => plusScreen(app)) }, `${yr} / year`) : null,
          h('p', { class: 'small', style: 'text-align:center;margin:0' }, 'Auto-renews until cancelled in your Apple ID settings. No free trial — try the Preview instead.')]
        : h('p', { class: 'small web-buy' }, 'PokaSnap+ is coming soon to the App Store.'),
      pv ? h('p', { class: 'small', style: 'text-align:center' }, `👀 Preview active until ${new Date(s.plus.preview.until).toLocaleString()} — the Premium Closet is open. Nothing will be charged.`)
        : !s.plus.preview.used ? h('button', { class: 'btn ghost block', onclick: () => { let r; update(x => { r = startPreview(x); }); if (r.ok) { track('plus_preview_started', {}); toast(`👀 ${PLUS.preview.days}-day Preview on — no charge, nothing to cancel.`, 3000); plusScreen(app); } } },
          `👀 Try a free ${PLUS.preview.days}-day Preview (no billing)`) : h('p', { class: 'small', style: 'text-align:center' }, 'Your Preview has been used.')),
    h('button', { class: 'linkbtn', onclick: async () => {
      const r = await P.restore();
      if (!r.ok) { toast('Couldn\'t reach the App Store. Try again.'); return; }
      let ch; update(x => { ch = refreshEntitlements(x, r.list); });
      track('purchase_restored', { count: r.list.length }); if (plusSubscribed(get())) track('plus_restored', {});
      toast(r.list.length ? `Restored ${r.list.length} purchase${r.list.length > 1 ? 's' : ''}.` : 'No purchases to restore.', 2600); plusScreen(app);
    } }, 'Restore Purchases'),
    h('p', { class: 'small legal' }, h('a', { href: 'https://keepitil.com/games/pokasnap/privacy.html', target: '_blank', rel: 'noopener' }, 'Privacy'), ' · ',
      h('a', { href: 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/', target: '_blank', rel: 'noopener' }, 'Terms of Use'))));
}

/* ---------------------------------------------------------------- rewarded -- */
export function rewardedScreen(app, { back = 'home' } = {}) {
  const s = get(), ad = ads.requestAd(s);
  if (!ad) { toast('No videos right now — try again tomorrow.'); app.go(back); return; }
  track('rewarded_media_started', { campaign: ad.campaignId });
  const video = h('video', { class: 'ad-video', playsinline: '', preload: 'auto', 'aria-label': ad.title });
  const prog = h('i'), note = h('p', { class: 'small ad-note' }, `Watch to the end to earn ${ad.rewardCoins} coins. You can close any time.`);
  const close = h('button', { class: 'icon-btn ad-close', 'aria-label': 'Close video (no reward)', onclick: () => video._skip?.() }, '✕');
  const root = h('div', { class: 'screen ad-screen' }, h('div', { class: 'row between' }, h('b', { style: 'color:#fff' }, `🎬 ${ad.title}`), close), video,
    h('div', { class: 'ad-bar' }, prog), note);
  app.mount(root);
  ads.showAd(ad, video, { onProgress: (p, d) => { prog.style.width = `${Math.min(100, 100 * p / d)}%`; } }).then(result => {
    if (result === 'completed') {
      let r; update(x => { r = ads.grantReward(x, ad); });
      track('rewarded_media_completed', { campaign: ad.campaignId, paid: !!r.ok });
      if (r.ok) { sfx.reward(); haptic('success'); track('coins_earned', { amount: r.amount, source: 'rewarded' }); }
      root.replaceChildren(h('div', { class: 'ad-done' },
        h('div', { style: 'font-size:64px' }, '🎉'), h('h2', {}, r.ok ? `+${r.amount} Poka Coins!` : r.capped ? 'That\'s today\'s limit' : 'Already rewarded'),
        h('p', { class: 'small', style: 'color:#e8d6de' }, `${remainingToday(get())} video${remainingToday(get()) === 1 ? '' : 's'} left today.`),
        ad.ctaUrl ? h('a', { class: 'btn ghost', href: ad.ctaUrl, target: '_blank', rel: 'noopener external' }, `${ad.ctaLabel || 'Watch on YouTube'} ↗`) : null,
        ad.ctaUrl ? h('p', { class: 'small', style: 'color:#cdb9c3' }, 'Opens outside PokaSnap. Just for fun — no extra coins.') : null,
        h('button', { class: 'btn block', onclick: () => app.go(back) }, 'DONE')));
    } else {
      track(result === 'skipped' ? 'rewarded_media_skipped' : 'rewarded_media_skipped', { campaign: ad.campaignId, reason: result });
      toast(result === 'failed' ? 'The video could not play. No coins were used up.' : 'Closed early — no coins this time.', 2600);
      app.go(back);
    }
  });
  return () => { try { video.pause(); } catch (e) {} };
}
