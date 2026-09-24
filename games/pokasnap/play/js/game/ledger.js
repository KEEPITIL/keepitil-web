/* LEDGER — the only way Poka Coins change.
   ---------------------------------------------------------------------------
   Every mutation is an entry { id, source, amount, at, ref } and every id is
   applied at most once (idempotency), so a replayed reward, a double tap, a
   reloaded ad or a re-sent StoreKit transaction can never pay twice.
   st.progress.coins stays the displayed balance; the ledger explains it.

   Daily caps are counted from the ledger itself (entries of a source on a
   local day), so a cap cannot drift from what was actually paid. */

import { CAPS } from '../data/economy.js';

const KEEP = 1500;                         // entries kept for audit; ids are kept forever

export function dayKey(now = Date.now()) {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ensure(st) {
  if (!st.ledger || !Array.isArray(st.ledger.entries)) {
    const opening = st.progress?.coins || 0;
    st.ledger = { entries: [], ids: {}, earned: opening, spent: 0, maxSeen: 0, flags: [] };
    if (opening) { st.ledger.entries.push({ id: 'opening', source: 'opening', amount: opening, at: Date.now() }); st.ledger.ids.opening = 1; }
  }
  return st.ledger;
}

/** Credit coins once per id. Returns { ok, dup, capped, amount }. */
export function earn(st, { id, source, amount, ref = null, cap = null, now = Date.now() }) {
  const L = ensure(st);
  if (!id || !source) throw new Error('ledger.earn needs id and source');
  if (L.ids[id]) return { ok: false, dup: true, amount: 0 };
  if (cap != null && countToday(st, source, now) >= cap) return { ok: false, capped: true, amount: 0 };
  if (!(amount > 0)) return { ok: false, amount: 0 };
  L.ids[id] = 1;
  L.entries.push({ id, source, amount, at: now, ref });
  if (L.entries.length > KEEP) L.entries.splice(0, L.entries.length - KEEP);
  L.earned += amount; st.progress.coins += amount;
  return { ok: true, amount };
}

/** Debit coins once per id. Fails without changing anything if the balance is short. */
export function spend(st, { id, source, amount, ref = null, now = Date.now() }) {
  const L = ensure(st);
  if (L.ids[id]) return { ok: false, dup: true };
  if (!(amount > 0) || st.progress.coins < amount) return { ok: false, short: true };
  L.ids[id] = 1;
  L.entries.push({ id, source, amount: -amount, at: now, ref });
  if (L.entries.length > KEEP) L.entries.splice(0, L.entries.length - KEEP);
  L.spent += amount; st.progress.coins -= amount;
  return { ok: true };
}

export function countToday(st, source, now = Date.now()) {
  const k = dayKey(now);
  return ensure(st).entries.filter(e => e.source === source && e.amount > 0 && dayKey(e.at) === k).length;
}
export function earnedOn(st, k) { return ensure(st).entries.filter(e => e.amount > 0 && dayKey(e.at) === k).reduce((a, e) => a + e.amount, 0); }
export function has(st, id) { return !!ensure(st).ids[id]; }
/** Mark an id used without money (e.g. an item-only reward), so it is also once-only. */
export function mark(st, id) { const L = ensure(st); if (L.ids[id]) return false; L.ids[id] = 1; return true; }

/* ---- clock sanity ----
   If the device clock moves back past the furthest time we've seen (beyond a
   tolerance), time-gated rewards (daily, Friday, streak, steps) pause until
   the clock catches up. Nothing is ever taken away; play continues normally. */
export function clockOk(st, now = Date.now()) {
  const L = ensure(st);
  if (now >= L.maxSeen) { L.maxSeen = now; return true; }
  if (L.maxSeen - now <= CAPS.clockSkewToleranceMs) return true;
  if (!L.flags.some(f => f.kind === 'clock' && f.at === L.maxSeen)) L.flags.push({ kind: 'clock', at: L.maxSeen, seen: now });
  return false;
}
export function flag(st, kind, data = {}) { const L = ensure(st); L.flags.push({ kind, at: Date.now(), ...data }); if (L.flags.length > 50) L.flags.shift(); }
