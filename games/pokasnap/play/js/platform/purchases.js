/* PURCHASES — one contract, three adapters.
   ---------------------------------------------------------------------------
   storekit  iOS: StoreKit 2 via the PokaStore native plugin (AppDelegate.swift).
             Transactions are verified by StoreKit before they reach JS.
   mock      QA ONLY: enabled by localStorage 'pokasnap-qa-store' = '1'. Every
             screen shows a visible "TEST STORE" badge while it is on. Never on
             by default, never shipped enabled.
   none      web: products are listed with "available in the iPhone app"; there
             is no buy button that cannot deliver. (A web-commerce adapter would
             be added here separately -- never Stripe for iOS digital goods.)

   Contract: available() · loadProducts() · buy(key) · restore() · entitlements()
   Every result is applied to the save through game/entitlements.applyTransaction,
   which is idempotent by transaction id (duplicate protection). */

import { PRODUCTS, productId } from '../data/store.js';
import { isNative } from './native.js';

const call = (m, o) => window.Capacitor.nativePromise('PokaStore', m, o);
let mode = null, products = new Map(), listeners = new Set();

export function adapter() {
  if (mode) return mode;
  let qa = false; try { qa = localStorage.getItem('pokasnap-qa-store') === '1'; } catch (e) {}
  mode = qa ? 'mock' : (isNative && typeof window.Capacitor?.nativePromise === 'function') ? 'storekit' : 'none';
  return mode;
}
export const isTestStore = () => adapter() === 'mock';
export function available() { return adapter() !== 'none'; }
export function onTransaction(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function product(key) { return products.get(key) || null; }

/** Load StoreKit products. Returns the keys that App Store Connect actually has. */
export async function loadProducts() {
  const ids = PRODUCTS.map(p => productId(p.key));
  if (adapter() === 'none') return [];
  if (adapter() === 'mock') {
    for (const p of PRODUCTS) products.set(p.key, { key: p.key, id: productId(p.key), displayName: p.name, displayPrice: p.referencePrice.split('/')[0], type: p.type });
    return [...products.keys()];
  }
  try {
    const r = await call('products', { ids });
    products.clear();
    for (const x of r.products || []) { const p = PRODUCTS.find(q => productId(q.key) === x.id); if (p) products.set(p.key, { ...x, key: p.key }); }
  } catch (e) { console.warn('[store] products failed', e?.message || e); }
  return [...products.keys()];
}

/** Buy. Resolves { status:'success'|'cancelled'|'pending'|'failed', tx?, error? }. */
export async function buy(key) {
  const p = products.get(key); if (!p) return { status: 'failed', error: 'This item is not available yet.' };
  if (adapter() === 'mock') {
    const now = Date.now(), sub = p.type === 'subscription';
    const tx = { transactionId: 'mock-' + now.toString(36) + Math.random().toString(36).slice(2, 6), productId: p.id, purchaseDate: new Date(now).toISOString(),
      expirationDate: sub ? new Date(now + (key.endsWith('yearly') ? 365 : 30) * 864e5).toISOString() : null, source: 'mock' };
    mockTx.push(tx); saveMock(); emit(tx); return { status: 'success', tx };
  }
  try {
    const r = await call('purchase', { id: p.id });
    if (r.status === 'success' && r.transaction) { emit(r.transaction); return { status: 'success', tx: r.transaction }; }
    return { status: r.status || 'failed' };
  } catch (e) { return { status: 'failed', error: String(e?.message || e) }; }
}
/** Current verified entitlements (purchases that still apply). */
export async function entitlements() {
  if (adapter() === 'mock') { loadMock(); return mockTx.filter(t => !t.expirationDate || +new Date(t.expirationDate) > Date.now() - 1); }
  if (adapter() !== 'storekit') return [];
  try { return (await call('entitlements', {})).transactions || []; } catch (e) { return []; }
}
/** Restore Purchases: re-sync with the App Store, then return entitlements. */
export async function restore() {
  if (adapter() === 'storekit') { try { await call('restore', {}); } catch (e) { return { ok: false, error: String(e?.message || e), list: [] }; } }
  return { ok: true, list: await entitlements() };
}
export function manageSubscriptionsUrl() { return 'https://apps.apple.com/account/subscriptions'; }

function emit(tx) { listeners.forEach(f => { try { f(tx); } catch (e) {} }); }
/* storekit pushes Transaction.updates (renewals, refunds, Ask-to-Buy approvals) */
export function listenNative() {
  if (adapter() !== 'storekit' || listenNative.on) return;
  try { window.Capacitor.addListener('PokaStore', 'transaction', tx => emit(tx)); listenNative.on = true; } catch (e) {}
}

/* ---- mock persistence (QA only) ---- */
let mockTx = [];
function loadMock() { try { mockTx = JSON.parse(localStorage.getItem('pokasnap-qa-store-tx') || '[]'); } catch (e) { mockTx = []; } }
function saveMock() { try { localStorage.setItem('pokasnap-qa-store-tx', JSON.stringify(mockTx)); } catch (e) {} }
/** QA: move the mock clock so a subscription can be expired in a test. */
export function mockExpireAll() { loadMock(); mockTx = mockTx.map(t => t.expirationDate ? { ...t, expirationDate: new Date(Date.now() - 1000).toISOString() } : t); saveMock(); }
