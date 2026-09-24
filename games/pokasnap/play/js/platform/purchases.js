/* PURCHASES — the seam, not a store.
   ---------------------------------------------------------------------------
   iOS: digital goods must use Apple In-App Purchase (StoreKit). A native
   StoreKit plugin will implement getProducts()/purchase()/restore() here.
   Web: an approved web checkout may be added separately.
   Until one is wired, available() is false and the app shows NO store UI --
   so there is never a button that cannot deliver. */

import { BUNDLES } from '../data/store.js';

export function available() { return false; }
export async function getProducts() { return available() ? BUNDLES : []; }
export async function purchase(bundleID) { throw new Error('Purchases are not available yet'); }
export async function restore() { return []; }
