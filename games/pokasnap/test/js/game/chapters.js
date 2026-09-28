/* CHAPTERS & CERTIFICATIONS (1.4)
   ---------------------------------------------------------------------------
   Ten chapters give the 100 levels a story. From level 50, XP alone is not
   enough: the level is held at L-1 (XP keeps banking) until that level's
   certification is earned. Each certification accepts several paths, so no
   single playstyle is forced. Nothing here can be bought: every counter comes
   from play (photos, Academy, relationships, projects, League, Journal). */

import { CHAPTERS, CERTS, chapterFor } from '../data/world.js';
import { DISCIPLINES } from '../data/academy.js';
import * as W from './world.js';

export { CHAPTERS, chapterFor };

function academyRanks(st) {
  const d = st.academy?.disciplines || {};
  return DISCIPLINES.map(x => { let r = 0; for (let k = 1; k <= 10; k++) if (d[x.id]?.nodes?.[`${x.id}-${k}-5`]) r = k; else break; return r; });
}
const totalStars = st => Object.values(st.stars || {}).reduce((a, b) => a + b, 0);

/** Evaluate one requirement against real save state. */
export function testPath(st, t) {
  const c = st.world?.counts || {};
  if (t.stars) return totalStars(st) >= t.stars;
  if (t.journal) return W.journalCount(st) >= t.journal;
  if (t.projects) return (c.projects || 0) >= t.projects;
  if (t.ranksAtLeast) { const [r, k] = t.ranksAtLeast; return academyRanks(st).filter(x => x >= r).length >= k; }
  if (t.relation) { const types = W.relationTypes(st); return t.relation === 'friend' ? [...types].length > 0 : types.has(t.relation); }
  if (t.relations) return W.relationTypes(st).size >= t.relations || Object.values(st.world?.relations || {}).filter(r => r.type !== 'acquainted').length >= t.relations;
  if (t.journeys) return (c.journeys || 0) >= t.journeys;
  if (t.locations) return Object.values(st.world?.locations || {}).filter(l => l.photos > 0).length >= t.locations;
  if (t.rares) return (c.rares || 0) >= t.rares;
  if (t.fiveStars) return Object.values(st.stars || {}).filter(s => s >= 5).length >= t.fiveStars;
  if (t.puzzles) return (c.puzzles || 0) >= t.puzzles;
  if (t.lifeAdv) return (c.life_adventures || 0) >= t.lifeAdv;
  if (t.collections) return (c.collections || 0) >= t.collections;
  if (t.legendary) return (c.legendary || 0) >= t.legendary;
  if (t.leagueTop3) return (st.world?.league?.top3 || 0) >= t.leagueTop3;
  if (t.leagueWins) return (st.world?.league?.wins || 0) >= t.leagueWins;
  if (t.albumMilestones) return (c.album_milestones || 0) >= t.albumMilestones;
  if (t.honorTiers) return W.honorTiers(st) >= t.honorTiers;
  if (t.combos) return Object.keys(st.progress?.missions || {}).filter(id => id.startsWith('combo_') && (st.stars?.[id] || 0) >= 1).length >= t.combos;
  if (t.masters) return Object.keys(st.progress?.missions || {}).filter(id => id.startsWith('master_') && (st.stars?.[id] || 0) >= 1).length >= t.masters;
  return false;
}
export function certView(st, id) {
  const c = CERTS[id], paths = c.paths.map(p => ({ ...p, done: testPath(st, p.test) })), got = paths.filter(p => p.done).length;
  return { id, ...c, paths, got, earned: !!st.certs?.[id] || got >= c.need };
}
/** Mark any certification whose paths are met (permanent once earned). */
export function checkCerts(st, now = Date.now()) {
  st.certs = st.certs || {}; const out = [];
  for (const id of Object.keys(CERTS)) if (!st.certs[id] && certView(st, id).got >= CERTS[id].need) { st.certs[id] = now; out.push(id); }
  return out;
}
/** The highest level XP allows, capped by the first unearned certification. */
export function capLevel(st, xpLevel) {
  checkCerts(st);
  for (const [id, c] of Object.entries(CERTS).sort((a, b) => a[1].level - b[1].level)) if (xpLevel >= c.level && !st.certs?.[id]) return c.level - 1;
  return xpLevel;
}
export function nextGateInfo(st, xpLevel) {
  const blocked = Object.entries(CERTS).sort((a, b) => a[1].level - b[1].level).find(([id, c]) => xpLevel >= c.level && !st.certs?.[id]);
  return blocked ? certView(st, blocked[0]) : null;
}
export function chapterView(st) {
  const L = st.progress?.level || 1, ch = chapterFor(L);
  const next = CHAPTERS.find(c => c.milestone.level > L - (L === 100 ? 1 : 0) && c.milestone.level >= L) || null;
  return { level: L, chapter: ch, next, cert: ch.milestone.cert ? certView(st, ch.milestone.cert) : null };
}
