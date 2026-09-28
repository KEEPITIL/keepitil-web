/* ENTITLEMENTS — OWNED vs PLUS ACCESS, made explicit.
   ---------------------------------------------------------------------------
   OWNED   kept forever: earned rewards, achievements, streak rewards, purchases,
           Plus monthly keepsakes and Plus-granted headlines. Stored as
           inventory[] + ownership{ id: { via, at, ref } }. Never removed.
   ACCESS  temporary: PLUS_ACCESS items this month while Plus (or the
           non-billing Preview) is active. Computed, never stored as owned.

   Plus state comes from StoreKit (platform/purchases.js) and is cached in
   st.plus = { active, product, expiresAt, source:'storekit'|'mock', preview:{ until, used } }.
   When Plus ends, only rotating access switches off. */

import { ITEMS, item as itemOf, path } from '../data/items.js';
import { PLUS } from '../data/economy.js';
import { productByKey, productById, productId } from '../data/store.js';
import * as ledger from './ledger.js';

export const monthKey = (now = Date.now()) => { const d = new Date(now); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const md = now => { const d = new Date(now); return String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const inWindow = (from, to, now) => { const x = md(now); return from <= to ? x >= from && x <= to : x >= from || x <= to; };

export function ensure(st) {
  st.ownership = st.ownership || {};
  st.plus = st.plus || { active: false, product: null, expiresAt: 0, source: null, preview: { until: 0, used: false } };
  st.plus.preview = st.plus.preview || { until: 0, used: false };
  return st;
}

/* ---------------------------------------------------------------- plus -- */
export function plusSubscribed(st, now = Date.now()) { ensure(st); return !!(st.plus.active && st.plus.expiresAt > now); }
export function previewActive(st, now = Date.now()) { ensure(st); return st.plus.preview.until > now; }
/** Paid Plus OR Preview: unlocks rotating ACCESS. Only paid Plus grants owned things. */
export function plusAccess(st, now = Date.now()) { return plusSubscribed(st, now) || previewActive(st, now); }

export function startPreview(st, now = Date.now()) {
  ensure(st);
  if (st.plus.preview.used && PLUS.preview.oncePerAccount) return { ok: false, reason: 'used' };
  st.plus.preview = { until: now + PLUS.preview.days * 864e5, used: true };
  return { ok: true, until: st.plus.preview.until };
}

/* ---------------------------------------------------------------- ownership -- */
export function isOwned(st, id) { return (st.inventory || []).includes(id); }
/** Grant permanent ownership once. Returns true if newly owned. */
export function grant(st, id, via, ref = null, now = Date.now()) {
  ensure(st);
  if (!itemOf(id)) return false;
  if (isOwned(st, id)) return false;
  st.inventory.push(id);
  st.ownership[id] = { via, at: now, ref };
  return true;
}
export function hasAccess(st, id, now = Date.now()) {
  if (isOwned(st, id)) return true;
  const it = itemOf(id); if (!it) return false;
  const r = path(it, 'PLUS_ACCESS');
  return !!(r && plusAccess(st, now) && r.months.includes(monthKey(now)));
}
/** Why the player can use it right now: 'owned' | 'plus' | null. */
export function accessKind(st, id, now = Date.now()) { return isOwned(st, id) ? 'owned' : hasAccess(st, id, now) ? 'plus' : null; }

/** Unequip anything the player can no longer use (e.g. Premium Closet after Plus ends).
    Owned items are never touched. Returns the removed item ids. */
export function pruneEquipped(st, now = Date.now()) {
  const eq = st.pet?.equipped || {}, out = [];
  for (const [slot, id] of Object.entries(eq)) if (id && !hasAccess(st, id, now)) { delete eq[slot]; out.push(id); }
  return out;
}
export function rotatingNow(now = Date.now()) {
  return ITEMS.filter(it => path(it, 'PLUS_ACCESS')?.months.includes(monthKey(now)));
}
export function offered(it, now = Date.now()) {
  const s = path(it, 'SEASONAL');
  return !s || inWindow(s.from, s.to, now);
}

/* ---------------------------------------------------------------- coins -- */
export function buyWithCoins(st, id, now = Date.now()) {
  const it = itemOf(id), c = path(it, 'COIN');
  if (!it || !c) return { ok: false, reason: 'not-for-coins' };
  if (isOwned(st, id)) return { ok: false, reason: 'owned' };
  if (!offered(it, now)) return { ok: false, reason: 'out-of-season' };
  const r = ledger.spend(st, { id: `buy:${id}`, source: 'shop', amount: c.cost, ref: id, now });
  if (!r.ok) return { ok: false, reason: r.short ? 'short' : 'dup' };
  grant(st, id, 'COIN', null, now);
  return { ok: true };
}
/** Diamonds: DIAMOND route for everyone, PLUS_PURCHASE route only while subscribed.
    Earn-only items have neither route, so they can never be bought. */
export function buyWithDiamonds(st, id, now = Date.now()) {
  const it = itemOf(id); if (!it) return { ok: false, reason: 'unknown' };
  const d = path(it, 'DIAMOND'), pp = path(it, 'PLUS_PURCHASE');
  const cost = d ? d.cost : pp && plusSubscribed(st, now) ? pp.diamonds : null;
  if (cost == null) return { ok: false, reason: pp ? 'plus-only' : 'not-for-diamonds' };
  if (isOwned(st, id)) return { ok: false, reason: 'owned' };
  if (!offered(it, now)) return { ok: false, reason: 'out-of-season' };
  const r = ledger.spend(st, { id: `dbuy:${id}`, source: 'shop', amount: cost, ref: id, currency: 'dia', now });
  if (!r.ok) return { ok: false, reason: r.short ? 'short' : 'dup' };
  grant(st, id, d ? 'DIAMOND' : 'PLUS_PURCHASE', null, now);
  return { ok: true, cost };
}

/* ---------------------------------------------------------------- purchases -- */
/** Apply a verified App Store transaction (or a restored one). Idempotent by transaction id. */
export function applyTransaction(st, tx, now = Date.now()) {
  ensure(st);
  const p = productById(tx.productId); if (!p) return { ok: false, reason: 'unknown-product' };
  const txKey = `tx:${tx.transactionId || tx.originalId || tx.productId}`;
  if (p.type === 'subscription') {
    const exp = tx.expirationDate ? +new Date(tx.expirationDate) : 0;
    const active = !tx.revoked && exp > now;
    st.plus.active = active; st.plus.expiresAt = exp; st.plus.product = p.key; st.plus.source = tx.source || 'storekit';
    const granted = active ? applyPlusGrants(st, now) : [];
    return { ok: true, plus: active, granted };
  }
  if (p.type === 'consumable') {   // coin / diamond packs: credited once per transaction id
    const r = ledger.earn(st, { id: txKey, source: 'purchase', amount: p.amount, ref: p.key, currency: p.currency === 'dia' ? 'dia' : 'coin', now });
    return { ok: !!r.amount, credited: r.amount || 0, currency: p.currency, dup: !r.amount };
  }
  ledger.mark(st, txKey);
  const granted = p.grants.filter(id => grant(st, id, 'DIRECT_PURCHASE', tx.transactionId || null, now));
  return { ok: true, granted };
}
/** Refresh Plus from the current entitlement list; expired Plus only loses ACCESS. */
export function refreshEntitlements(st, list, now = Date.now()) {
  ensure(st);
  const subs = list.filter(t => productById(t.productId)?.type === 'subscription' && !t.revoked);
  const best = subs.sort((a, b) => +new Date(b.expirationDate || 0) - +new Date(a.expirationDate || 0))[0];
  const was = plusSubscribed(st, now);
  if (best) applyTransaction(st, best, now); else { st.plus.active = false; }
  for (const t of list) if (productById(t.productId)?.type !== 'subscription') applyTransaction(st, t, now);
  const is = plusSubscribed(st, now);
  return { started: !was && is, expired: was && !is };
}

/* Things Plus grants OWNED while subscribed: this month's keepsake and the
   current event headline (retroactive -- recomputed every time). */
import { currentEvent } from './events.js';
export function applyPlusGrants(st, now = Date.now()) {
  if (!plusSubscribed(st, now)) return [];
  const out = [];
  const month = monthKey(now);
  if (PLUS.diamondsMonthly) {
    ledger.earn(st, { id: `plusdia:${month}`, source: 'plus', amount: PLUS.diamondsMonthly, currency: 'dia', now });   // once per month (ledger id)
  }
  for (const it of ITEMS) {
    const pp = it.paths.find(p => p.type === 'EVENT' && p.plusAuto && p.month); if (!pp) continue;
    if (pp.month === month && grant(st, it.itemID, 'PLUS_PURCHASE', `keepsake:${month}`, now)) out.push(it.itemID);
  }
  const ev = currentEvent(now);
  if (ev) {
    const head = ev.items.headline, pp = itemOf(head)?.paths.find(p => p.type === 'EVENT' && p.plusAuto && p.event);
    if (pp && pp.event === ev.template && grant(st, head, 'PLUS_PURCHASE', `headline:${ev.id}`, now)) out.push(head);
  }
  return out;
}

/* ---------------------------------------------------------------- store view -- */
/** Every valid way to get an item, for the Earn / Plus / Buy detail screen. */
export function acquisition(st, it, ctx = {}) {
  const now = ctx.now || Date.now(), rows = [], owned = isOwned(st, it.itemID);
  for (const p of it.paths) {
    switch (p.type) {
      case 'LEVEL': rows.push({ kind: 'earn', label: p.level ? `Reach level ${p.level}` : 'Starter item', done: owned }); break;
      case 'STAR': rows.push({ kind: 'earn', label: `Collect ${p.stars} ★ on the Star Track`, have: ctx.stars ?? null }); break;
      case 'TRAINING': rows.push({ kind: 'earn', label: p.skill ? `Learn ${p.skill} in Trick Studio` : `Reach ${p.discipline} rank ${p.rank} in the Training Academy` }); break;
      case 'WALKING': rows.push({ kind: 'earn', label: `Walk ${p.steps.toLocaleString()} steps together` }); break;
      case 'ADVENTURE_BOOK': rows.push({ kind: 'earn', label: `Adventure Book: ${p.collection}${p.part ? ` (${p.part})` : ''}` }); break;
      case 'ACHIEVEMENT': rows.push({ kind: 'earnOnly', label: 'Earned with a badge' }); break;
      case 'COIN': rows.push({ kind: 'coins', label: `${p.cost} Poka Coins`, cost: p.cost, can: st.progress.coins >= p.cost }); break;
      case 'DIAMOND': rows.push({ kind: 'diamonds', label: `${p.cost} Poka Diamonds`, cost: p.cost, can: (st.progress.diamonds || 0) >= p.cost }); break;
      case 'PLUS_PURCHASE': rows.push({ kind: 'plusBuy', label: `PokaSnap+ members: ${p.diamonds} Diamonds`, cost: p.diamonds, active: plusSubscribed(st, now) }); break;
      case 'EVENT':
        if (p.event) rows.push({ kind: 'earn', label: `${p.points} Adventure Points`, event: p.event, points: p.points, have: ctx.eventPoints?.(p.event) ?? null });
        else if (p.monthlyDays) rows.push({ kind: 'earn', label: `${p.monthlyDays} active days in a month` });
        else if (p.friday) rows.push({ kind: 'earn', label: 'A Friday Gift' });
        if (p.plusAuto) rows.push({ kind: 'plus', label: p.month ? 'PokaSnap+ monthly keepsake (yours forever)' : 'Included with PokaSnap+ (yours forever)', active: plusSubscribed(st, now) });
        break;
      case 'PRESTIGE':
        rows.push({ kind: 'earnOnly', label: p.points ? `${p.points} Adventure Points — prestige, earn only` : p.level ? `Reach level ${p.level} — prestige` : p.mastery ? `Mastery rank ${p.mastery} — prestige` : p.stars ? `${p.stars} ★ — prestige` : 'Prestige — earn only', event: p.event, points: p.points, have: p.event ? ctx.eventPoints?.(p.event) ?? null : null });
        break;
      case 'PLUS_ACCESS': rows.push({ kind: 'plusAccess', label: p.months.includes(monthKey(now)) ? 'In the PokaSnap+ Premium Closet this month' : 'Returns to the Premium Closet later', now: p.months.includes(monthKey(now)) }); break;
      case 'DIRECT_PURCHASE': rows.push({ kind: 'buy', product: productId(p.product), key: p.product, pack: productByKey(p.product) }); break;
      case 'SEASONAL': rows.push({ kind: 'season', label: `Seasonal (${p.from} – ${p.to})`, open: offered(it, now) }); break;
    }
  }
  return rows;
}
