/* Player-record rules across chart versions (pure). A result belongs to the exact chart it was played on
   (its hash; a v2 hash also fixes the lane count), so:
   - a personal best counts only for the chart that is published now; bests on earlier versions are history;
   - a challenge is compared only on the chart it was set on.
   Records from before the server returned hashes have none; every chart before v2 was a four-lane v1 chart, so
   such a record is matched only while the published chart is still v1 (never to a 3- or 5-button chart). */
const sameChart = (rec, chart) => !!chart && (rec.chartHash ? rec.chartHash === chart.hash : chart.v === 1);

export function bestFor(pbs, slug, diff, chart) {
  return (pbs || []).filter(p => p.slug === slug && p.difficulty === diff && sameChart(p, chart)).sort((a, b) => b.score - a.score)[0] || null;
}
/* bests on chart versions that are no longer published (kept and shown as history, never as current) */
export function pastBests(pbs, chartOf) {
  return (pbs || []).filter(p => { const c = chartOf(p.slug, p.difficulty); return !c || !sameChart(p, c); });
}
export const challengeComparable = (chall, chart) => !!chall && sameChart(chall, chart);
