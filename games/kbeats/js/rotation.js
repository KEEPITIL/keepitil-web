/* KBeats rotation: orders eligible tracks for discovery surfaces. Pure + deterministic for a given
   input and day, so it runs identically in tests and in the kbeats-api edge function.
   Eligibility is decided BEFORE this (published + rights + charts validated + not disabled).
   Score = rotation_weight × (freshness + engagement) ; then fairness passes:
     - no artist may hold more than `maxPerArtist` of the first `window` slots
     - consecutive slots avoid repeating a genre when another genre is available
   Engagement uses Bayesian-smoothed rates so a track with 3 plays cannot outrank one with 3,000
   on luck. Featured tracks are pinned first and flagged `featured` so the UI labels them. */
export const ROTATION = { halfLifeDays: 21, priorPlays: 30, prior: { completion: 0.6, favorite: 0.05, replay: 0.15 },
  w: { fresh: 0.35, completion: 0.3, favorite: 0.2, replay: 0.15 }, maxPerArtist: 2, window: 10 };

const smooth = (k, n, p, m) => (k + p * m) / (n + m);

export function scoreTrack(t, stats = {}, now = Date.now(), R = ROTATION) {
  const ageDays = Math.max(0, (now - new Date(t.published_at || t.created_at || now).getTime()) / 864e5);
  const fresh = Math.pow(0.5, ageDays / R.halfLifeDays);
  const n = stats.starts || 0;
  const completion = smooth(stats.completions || 0, n, R.prior.completion, R.priorPlays);
  const favorite = smooth(stats.favorites || 0, n, R.prior.favorite, R.priorPlays);
  const replay = smooth(stats.replays || 0, n, R.prior.replay, R.priorPlays);
  const eng = R.w.completion * completion + R.w.favorite * (favorite / 0.2) + R.w.replay * (replay / 0.5);
  return (t.rotation_weight ?? 1) * (R.w.fresh * fresh + eng);
}

export function rotate(tracks, statsById = {}, now = Date.now(), R = ROTATION) {
  const scored = tracks.map(t => ({ t, s: scoreTrack(t, statsById[t.id], now, R) }))
    .sort((a, b) => b.s - a.s || String(a.t.id).localeCompare(String(b.t.id)));
  const featured = scored.filter(x => x.t.featured), rest = scored.filter(x => !x.t.featured);
  const out = featured.map(x => ({ ...x.t, featured: true }));
  const perArtist = {};
  for (const x of featured) perArtist[x.t.artist_id] = (perArtist[x.t.artist_id] || 0) + 1;
  const pool = [...rest];
  while (pool.length) {
    const inWindow = out.length < R.window;
    const lastGenre = out.length ? out[out.length - 1].genre : null;
    let i = pool.findIndex(x => (!inWindow || (perArtist[x.t.artist_id] || 0) < R.maxPerArtist) && x.t.genre !== lastGenre);
    if (i < 0) i = pool.findIndex(x => !inWindow || (perArtist[x.t.artist_id] || 0) < R.maxPerArtist);
    if (i < 0) i = 0;                                       // only capped artists left: allow them after the window
    const [x] = pool.splice(i, 1);
    perArtist[x.t.artist_id] = (perArtist[x.t.artist_id] || 0) + 1;
    out.push({ ...x.t, featured: false, rotationScore: Math.round(x.s * 1000) / 1000 });
  }
  return out;
}
