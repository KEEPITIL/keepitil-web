/* Song library model: search, facets, filters and sorting over the real catalog only.
   Rule: a filter is offered only when real, populated data backs it (at least two distinct values across the
   catalog); nothing is inferred or defaulted. Genre and album are shown only once curated values exist.
   Challenge level comes from the published charts (chartstats.js); favourites come from the account; recently
   played is this device's own play history; best score is the account's verified personal best. Pure. */
import { songChallenge, challengeBand, CHALLENGE_BANDS } from './chartstats.js';
import { chartLanes } from './chart.js';
import { DIFFICULTIES, PLAYABLE_DIFFICULTIES } from './config.js';

const clean = v => (typeof v === 'string' ? v.trim() : '') || null;

/* Per-track derived facts (cached on a WeakMap so a big catalog is computed once). */
const memo = new WeakMap();
export function facts(t) {
  let f = memo.get(t); if (f) return f;
  const level = t.charts ? songChallenge(t.charts) : null;
  f = { artist: clean(t.artist), album: clean(t.album), genre: clean(t.genre), level, band: challengeBand(level),
    diffs: PLAYABLE_DIFFICULTIES.filter(d => t.charts?.[d]).map(d => ({ d, label: DIFFICULTIES[d].label, lanes: chartLanes(t.charts[d]) })),
    durationSec: t.durationSec || (t.charts?.normal?.durationMs || 0) / 1000 || null };
  memo.set(t, f); return f;
}

/* Which filters can be shown, with their real values and counts. */
export function facets(catalog, { favorites = [], recent = [] } = {}) {
  const count = key => { const m = new Map(); for (const t of catalog) { const v = facts(t)[key]; if (v != null) m.set(v, (m.get(v) || 0) + 1); } return m; };
  const list = (m, order) => [...m.entries()].sort(order || ((a, b) => String(a[0]).localeCompare(String(b[0])))).map(([value, n]) => ({ value, n }));
  const out = {};
  for (const key of ['genre', 'album', 'artist']) { const m = count(key); if (m.size >= 2) out[key] = list(m); }
  const bands = count('band'); if (bands.size >= 2) out.band = CHALLENGE_BANDS.filter(([, , b]) => bands.has(b)).map(([, , b]) => ({ value: b, n: bands.get(b) }));
  const dm = new Map(); for (const t of catalog) for (const x of facts(t).diffs) dm.set(x.d, (dm.get(x.d) || 0) + 1);
  if (dm.size >= 2) out.diff = PLAYABLE_DIFFICULTIES.filter(d => dm.has(d)).map(d => ({ value: d, label: DIFFICULTIES[d].label, n: dm.get(d) }));
  const favN = catalog.filter(t => favorites.includes(t.slug)).length; if (favN) out.favorites = favN;
  const recN = catalog.filter(t => recent.includes(t.slug)).length; if (recN) out.recent = recN;
  return out;
}

export const SORTS = { featured: 'Featured', title: 'Title A–Z', artist: 'Artist', challenge: 'Challenge', duration: 'Length', recent: 'Recently played', best: 'Best score' };

/* state: { q, genre, album, artist, band, diff, favorites:bool, recent:bool, sort }. ctx: { favorites, recent, best(t) } */
export function query(catalog, state = {}, ctx = {}) {
  const q = (state.q || '').trim().toLowerCase(), fav = ctx.favorites || [], rec = ctx.recent || [];
  let out = catalog.filter(t => { const f = facts(t);
    if (q && ![t.title, f.artist, f.album].some(v => v && v.toLowerCase().includes(q))) return false;
    for (const k of ['genre', 'album', 'artist', 'band']) if (state[k] && f[k] !== state[k]) return false;
    if (state.diff && !f.diffs.some(x => x.d === state.diff)) return false;
    if (state.favorites && !fav.includes(t.slug)) return false;
    if (state.recent && !rec.includes(t.slug)) return false;
    return true; });
  const by = { title: (a, b) => a.title.localeCompare(b.title), artist: (a, b) => (facts(a).artist || '').localeCompare(facts(b).artist || '') || a.title.localeCompare(b.title),
    challenge: (a, b) => (facts(a).level ?? 99) - (facts(b).level ?? 99) || a.title.localeCompare(b.title), duration: (a, b) => (facts(a).durationSec || 0) - (facts(b).durationSec || 0),
    recent: (a, b) => idx(rec, a.slug) - idx(rec, b.slug), best: (a, b) => (ctx.best?.(b)?.score || 0) - (ctx.best?.(a)?.score || 0) };
  if (by[state.sort]) out = [...out].sort(by[state.sort]);
  return out;
}
const idx = (arr, v) => { const i = arr.indexOf(v); return i < 0 ? 1e9 : i; };

/* Device-local play history (most recent first, unique, capped). Real plays only; nothing else writes it. */
export function pushRecent(list, slug, cap = 30) { return [slug, ...list.filter(x => x !== slug)].slice(0, cap); }
