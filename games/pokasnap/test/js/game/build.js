/* BUILD — what the equipped look actually DOES, always capped.
   ---------------------------------------------------------------------------
   perkTotals(st) sums every source -- pet attributes, species signature,
   equipped item perks x Style Mastery, set bonuses and Imbues -- then clamps
   each stat to CAPS. Nothing here can bypass a challenge requirement: score.js
   only ever adds totals.photoScore (≤5) and small tolerances. */

import { ITEMS, SETS, item as itemOf } from '../data/items.js';
import { ATTR_ORDER, ATTR_EFFECT, CAPS, PERKS, STYLE, IMBUE, PET_PROFILES } from '../data/attributes.js';
import { isOwned } from './entitlements.js';
import * as ledger from './ledger.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ------------------------------------------------------------ attributes -- */
export function attributes(st) {
  const prof = PET_PROFILES[st.pet?.species] || PET_PROFILES.cat_fluffy;
  const out = {};
  for (const a of ATTR_ORDER) out[a] = clamp((prof.base[a] || 0) + (st.growth?.[a] || 0), 0, 100);
  return out;
}
/** Growth from Academy ranks / care. Returns the points actually added (attr max 100). */
export function grow(st, attr, pts) {
  st.growth = st.growth || {};
  const before = attributes(st)[attr];
  const add = clamp(pts, 0, 100 - before);
  st.growth[attr] = (st.growth[attr] || 0) + add;
  return add;
}

/* ------------------------------------------------------------ style -- */
export const styleOf = (st, id) => st.style?.[id]?.level || (isOwned(st, id) ? 1 : 0);
export function styleInfo(st, id) {
  const lvl = styleOf(st, id), wear = st.style?.[id]?.wear || 0;
  if (!lvl || lvl >= STYLE.max) return { level: lvl, max: lvl >= STYLE.max, wear };
  return { level: lvl, next: lvl + 1, cost: STYLE.cost[lvl + 1], wearNeed: STYLE.wearSnaps[lvl + 1], wear, ready: wear >= STYLE.wearSnaps[lvl + 1] };
}
/** Count one photo taken wearing each equipped owned item. */
export function noteWear(st) {
  st.style = st.style || {};
  for (const id of Object.values(st.pet?.equipped || {})) if (id && isOwned(st, id)) {
    const s = st.style[id] = st.style[id] || { level: 1, wear: 0 };
    s.wear += 1;
  }
}
/** Upgrade: needs the wear photos AND coins. Earn-only items upgrade the same way (coins are earnable). */
export function upgradeStyle(st, id, now = Date.now()) {
  const inf = styleInfo(st, id);
  if (!isOwned(st, id)) return { ok: false, reason: 'not-owned' };
  if (inf.max) return { ok: false, reason: 'max' };
  if (!inf.ready) return { ok: false, reason: 'wear', need: inf.wearNeed - inf.wear };
  const r = ledger.spend(st, { id: `style:${id}:${inf.next}`, source: 'style', amount: inf.cost, ref: id, now });
  if (!r.ok) return { ok: false, reason: r.short ? 'short' : 'dup' };
  st.style[id] = { level: inf.next, wear: 0 };
  return { ok: true, level: inf.next };
}

/* ------------------------------------------------------------ imbue -- */
/** Add one extra perk to a Style-5 item using Threads (earned, never sold). */
export function imbue(st, id, perk) {
  if (!isOwned(st, id)) return { ok: false, reason: 'not-owned' };
  if (styleOf(st, id) < IMBUE.requiresStyle) return { ok: false, reason: 'style' };
  if (!PERKS[perk]) return { ok: false, reason: 'perk' };
  st.imbue = st.imbue || {};
  if (st.imbue[id]) return { ok: false, reason: 'already' };
  if ((st.threads || 0) < IMBUE.threadCost) return { ok: false, reason: 'threads' };
  st.threads -= IMBUE.threadCost;
  st.imbue[id] = perk;
  return { ok: true };
}

/* ------------------------------------------------------------ sets -- */
export function setCounts(equipped) {
  const n = {};
  for (const id of Object.values(equipped || {})) { const s = itemOf(id)?.set; if (s) n[s] = (n[s] || 0) + 1; }
  return n;
}
export function activeSetBonuses(equipped) {
  const out = [];
  for (const [set, count] of Object.entries(setCounts(equipped))) {
    const def = SETS[set]; if (!def) continue;
    const tier = Object.keys(def.bonus).map(Number).filter(k => count >= k).sort((a, b) => b - a)[0];
    if (tier) out.push({ set, name: def.name, pieces: count, tier, perks: def.bonus[tier] });
  }
  return out;
}

/* ------------------------------------------------------------ totals -- */
/** Every stat, uncapped sources itemised, then capped. `noGear` = master challenges. */
export function perkTotals(st, { noGear = false, equipped } = {}) {
  const eq = equipped || st.pet?.equipped || {};
  const raw = {}, src = [];
  const add = (stat, v, from) => { if (!v) return; raw[stat] = (raw[stat] || 0) + v; src.push({ stat, v, from }); };
  const at = attributes(st);
  for (const a of ATTR_ORDER) for (const [stat, per] of Object.entries(ATTR_EFFECT[a] || {})) add(stat, at[a] * per, a);
  const sig = PET_PROFILES[st.pet?.species]?.signature;
  if (sig) add(sig.stat, sig.value, sig.name);
  if (!noGear) {
    for (const id of Object.values(eq)) {
      const it = itemOf(id); if (!it) continue;
      const mult = STYLE.perkMult[Math.max(1, styleOf(st, id))];
      for (const p of it.perks || []) { const d = PERKS[p.perk]; if (d) add(d.stat, (p.value ?? d.per) * mult, it.name); }
      const im = st.imbue?.[id]; if (im && PERKS[im]) add(PERKS[im].stat, PERKS[im].per, `${it.name} (imbued)`);
    }
    for (const b of activeSetBonuses(eq)) for (const p of b.perks) { const d = PERKS[p.perk]; if (d) add(d.stat, p.value ?? d.per, b.name); }
  }
  const total = {}, capped = {};
  for (const [stat, cap] of Object.entries(CAPS)) {
    const v = raw[stat] || 0;   // noGear already excluded every gear source above
    total[stat] = Math.min(cap, v);
    capped[stat] = v > cap;
  }
  return { total, raw, capped, sources: src };
}

/* ------------------------------------------------------------ loadouts -- */
export const MAX_LOADOUTS = 5;
export function saveLoadout(st, name) {
  st.loadouts = st.loadouts || [];
  const entry = { name: String(name || `Look ${st.loadouts.length + 1}`).slice(0, 24), equipped: { ...(st.pet?.equipped || {}) } };
  const i = st.loadouts.findIndex(l => l.name === entry.name);
  if (i >= 0) st.loadouts[i] = entry;
  else { if (st.loadouts.length >= MAX_LOADOUTS) return { ok: false, reason: 'full' }; st.loadouts.push(entry); }
  return { ok: true };
}
/** Apply a loadout, skipping anything the player no longer has access to. */
export function applyLoadout(st, name, hasAccess) {
  const l = (st.loadouts || []).find(x => x.name === name); if (!l || !st.pet) return { ok: false };
  const eq = {}, skipped = [];
  for (const [slot, id] of Object.entries(l.equipped)) (hasAccess(st, id) ? (eq[slot] = id) : skipped.push(id));
  st.pet.equipped = eq;
  return { ok: true, skipped };
}

/* Items a challenge's requirements point at, for "recommended build" hints. */
export function recommendFor(req) {
  if (!req) return [];
  const ids = [req.prop, req.filter, req.backdrop, req.outfit].filter(x => x && x !== 'any' && x !== 'set');
  if (req.outfitSet) ids.push(...ITEMS.filter(i => i.set === req.outfitSet).map(i => i.itemID));
  return [...new Set(ids)].filter(id => itemOf(id));
}
