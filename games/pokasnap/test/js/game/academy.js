/* ACADEMY LOGIC — node progress, rank rewards, Yarn Lab puzzle engine,
   Daily/Endless Yarn and the optional long-session walk prompt.
   ---------------------------------------------------------------------------
   Pure functions over the save; screens/academy.js draws and plays them.
   A node is cleared with 1-3 stars; the rank opens when the previous rank's
   final node is cleared. Rewards pay once (ledger ids), so replaying a node
   is practice, never a farm. */

import { DISCIPLINES, RANKS, NODES_PER_RANK, node as nodeOf, rng, dailyYarn, endlessYarn, WALK_PROMPT } from '../data/academy.js';
import { grantXP } from './progress.js';
import { grant } from './entitlements.js';
import { grow } from './build.js';
import * as ledger from './ledger.js';
import { novelXP } from './world.js';

export function ensure(st) {
  st.academy = st.academy || {};
  st.academy.disciplines = st.academy.disciplines || {};
  st.academy.yarn = st.academy.yarn || { daily: {}, endless: { best: 0 } };
  st.academy.yarn.daily = st.academy.yarn.daily || {};
  st.academy.yarn.endless = st.academy.yarn.endless || { best: 0 };
  for (const d of DISCIPLINES) st.academy.disciplines[d.id] = st.academy.disciplines[d.id] || { nodes: {} };
  return st.academy;
}
export const nodeStars = (st, id) => ensure(st) && Object.values(st.academy.disciplines).reduce((a, d) => a || d.nodes[id] || 0, 0);
export function rankOf(st, d) {
  const nodes = ensure(st).disciplines[d].nodes;
  let r = 0; for (let k = 1; k <= RANKS; k++) if (nodes[`${d}-${k}-${NODES_PER_RANK}`]) r = k; else break;
  return r;   // highest fully cleared rank
}
export const isOpen = (st, d, r, n) => r <= rankOf(st, d) + 1 && (n === 1 || !!ensure(st).disciplines[d].nodes[`${d}-${r}-${n - 1}`]);
export function academyView(st) {
  ensure(st);
  return DISCIPLINES.map(d => {
    const nodes = st.academy.disciplines[d.id].nodes, rank = rankOf(st, d.id);
    const cleared = Object.keys(nodes).length, stars = Object.values(nodes).reduce((a, b) => a + b, 0);
    return { ...d, rank, cleared, stars, total: RANKS * NODES_PER_RANK, next: nextNode(st, d.id) };
  });
}
export function nextNode(st, d) {
  for (let r = 1; r <= RANKS; r++) for (let n = 1; n <= NODES_PER_RANK; n++) if (!ensure(st).disciplines[d].nodes[`${d}-${r}-${n}`]) return isOpen(st, d, r, n) ? nodeOf(d, r, n) : null;
  return null;
}

/** Record a finished node. stars 0 = not cleared (no penalty, no reward). */
export function complete(st, d, r, n, stars, now = Date.now()) {
  ensure(st);
  if (!isOpen(st, d, r, n)) return { ok: false, reason: 'locked' };
  const nd = nodeOf(d, r, n), rec = st.academy.disciplines[d].nodes;
  stars = Math.max(0, Math.min(3, stars | 0));
  if (!stars) return { ok: true, stars: 0, cleared: false };
  const first = !rec[nd.id], prev = rec[nd.id] || 0;
  rec[nd.id] = Math.max(prev, stars);
  const out = { ok: true, stars, first, improved: stars > prev, xp: 0, rewards: [] };
  // first clear: full XP. Replays: novelty-weighted, decaying within a day, so one node can't be farmed.
  let g;
  if (first) { out.xp = nd.xp; g = grantXP(st, out.xp); }
  else { const lv0 = st.progress.level; out.xp = novelXP(st, `node:${nd.id}`, nd.xp, now, 'repeat'); g = { levelUp: st.progress.level > lv0 ? st.progress.level : 0 }; }
  out.levelUp = g.levelUp;
  if (first && nd.coins) out.coins = ledger.earn(st, { id: `academy:${nd.id}`, source: 'academy', amount: nd.coins, now }).amount;
  if (first) grow(st, nd.attr, n === NODES_PER_RANK ? 1 : 0.4);    // every node nudges the discipline's attribute
  if (first && nd.reward) out.rewards = payRank(st, d, r, nd.reward, now);
  if (first && n === NODES_PER_RANK) out.rankUp = r;
  return out;
}
function payRank(st, d, r, rw, now) {
  const out = [];
  for (const id of rw.items || []) if (grant(st, id, 'TRAINING', `academy:${d}:${r}`, now)) out.push({ item: id });
  if (rw.threads && ledger.mark(st, `threads:${d}:${r}`)) { st.threads = (st.threads || 0) + rw.threads; out.push({ threads: rw.threads }); }
  if (rw.grow) { const a = DISCIPLINES.find(x => x.id === d).attr; out.push({ attr: a, grow: grow(st, a, rw.grow) }); }
  if (rw.trick) { st.skills = st.skills || { learned: [], practice: {} }; if (!st.skills.learned.includes(rw.trick)) { st.skills.learned.push(rw.trick); out.push({ trick: rw.trick }); } }
  if (rw.title) { st.titles = st.titles || []; if (!st.titles.includes(rw.title)) { st.titles.push(rw.title); out.push({ title: rw.title }); } }
  return out;
}

/* ============================================================ YARN LAB */
/* A board is an array of spools; each spool is an array of colour indices,
   bottom -> top. Legal move: top run of A onto B if B is empty or B's top is
   the same colour and B has room. Solved: every non-empty spool is full and
   single-coloured. A shuffled board is VERIFIED with a solver; an unsolvable
   one is re-dealt from the next seed, so every puzzle ships solvable and is
   still identical on every device. */
export function yarnBoard(params, seed) {
  for (let k = 0; k < 40; k++) {
    const b = deal(params, (seed + k * 7919) >>> 0);
    if (yarnSolvable(b, 60000)) return b;
  }
  return deal({ ...params, empty: params.empty + 1 }, seed);   // never reached in tests; safety valve
}
function deal(params, seed) {
  const R = rng(seed), H = params.height, C = params.colors, E = params.empty;
  const balls = []; for (let c = 0; c < C; c++) for (let k = 0; k < H; k++) balls.push(c);
  for (let i = balls.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [balls[i], balls[j]] = [balls[j], balls[i]]; }
  const spools = Array.from({ length: C }, (_, i) => balls.slice(i * H, i * H + H));
  for (let e = 0; e < E; e++) spools.push([]);
  // avoid an accidentally solved start
  if (yarnSolved({ spools, height: H })) { const a = spools[0], b = spools[1]; [a[H - 1], b[H - 1]] = [b[H - 1], a[H - 1]]; }
  const locked = [];   // locked spools open after N moves (Intermediate+)
  for (let l = 0; l < (params.locked || 0) && l < C - 1; l++) locked.push({ spool: C - 1 - l, opensAt: 4 + l * 4 });
  return { spools, height: H, colors: C, locked, moves: 0, limit: params.moves || 0, history: [] };
}
const top = s => s[s.length - 1];
function runLen(s) { if (!s.length) return 0; let k = 1; while (k < s.length && s[s.length - 1 - k] === top(s)) k++; return k; }
export const isLocked = (b, i) => b.locked.some(l => l.spool === i && b.moves < l.opensAt);
export function canMove(b, from, to) {
  if (from === to || isLocked(b, from) || isLocked(b, to)) return false;
  const A = b.spools[from], B = b.spools[to];
  if (!A.length || B.length >= b.height) return false;
  return !B.length || top(B) === top(A);
}
export function yarnMove(b, from, to) {
  if (!canMove(b, from, to)) return false;
  const A = b.spools[from], B = b.spools[to];
  const n = Math.min(runLen(A), b.height - B.length);
  for (let k = 0; k < n; k++) B.push(A.pop());
  b.moves++; b.history.push([from, to, n]);
  return true;
}
export function yarnUndo(b) {
  const h = b.history.pop(); if (!h) return false;
  const [from, to, n] = h; for (let k = 0; k < n; k++) b.spools[from].push(b.spools[to].pop());
  b.moves--; return true;
}
export function yarnSolved(b) { return b.spools.every(s => !s.length || (s.length === b.height && s.every(c => c === s[0]))); }
export const yarnOutOfMoves = b => b.limit && b.moves >= b.limit && !yarnSolved(b);
/** Stars from efficiency against a par derived from the board size. */
export function yarnStars(b) {
  if (!yarnSolved(b)) return 0;
  const par = b.colors * (b.height - 1) + 2;
  return b.moves <= par ? 3 : b.moves <= par * 1.5 ? 2 : 1;
}
/** Is any legal move left? (hint + "stuck" detection) */
export function yarnHint(b) {
  let best = null;
  for (let i = 0; i < b.spools.length; i++) for (let j = 0; j < b.spools.length; j++) if (canMove(b, i, j)) {
    const score = (b.spools[j].length ? 3 : 1) + (runLen(b.spools[i]) === b.spools[i].length ? 0 : 1);
    if (!best || score > best.score) best = { from: i, to: j, score };
  }
  return best;
}
/** Is this board solvable from here? (bounded DFS; used by tests + the "stuck" banner) */
export function yarnSolvable(b0, limit = 20000) {
  const seen = new Set(); let steps = 0;
  const key = b => b.spools.map(s => s.join('')).sort().join('|') + '#' + b.locked.map(l => +(b.moves < l.opensAt)).join('');
  const go = b => {
    if (yarnSolved(b)) return true;
    if (++steps > limit || b.history.length > 400) return null;
    const k = key(b); if (seen.has(k)) return false; seen.add(k);
    for (let i = 0; i < b.spools.length; i++) for (let j = 0; j < b.spools.length; j++) if (canMove(b, i, j)) {
      yarnMove(b, i, j); const r = go(b); yarnUndo(b); if (r) return true; if (r === null) return null;
    }
    return false;
  };
  const copy = { ...b0, spools: b0.spools.map(s => [...s]), history: [], locked: b0.locked.map(l => ({ ...l })), moves: b0.moves || 0 };   // locks included: a lock can strand a player
  return go(copy);
}

/** A full solution (list of [from,to]) from the current position, or null. Used by the
    review/capture harness and by the "stuck" check; players only ever see one hint. */
export function yarnSolve(b0, limit = 80000) { return solveWith(b0, limit, true) || solveWith(b0, limit * 4, false); }
function solveWith(b0, limit, smart) {
  const seen = new Set(), path = []; let steps = 0;
  const key = b => b.spools.map(s => s.join('')).join('|') + '#' + b.locked.map(l => +(b.moves < l.opensAt)).join('');
  const b = { ...b0, spools: b0.spools.map(s => [...s]), history: [], locked: b0.locked.map(l => ({ ...l })), moves: b0.moves || 0 };
  const go = () => {
    if (yarnSolved(b)) return true;
    if (++steps > limit || path.length > 400) return false;
    const k = key(b); if (seen.has(k)) return false; seen.add(k);
    // human-like ordering: stack onto the same colour first, never shuffle a finished
    // or single-colour spool into an empty one (it changes nothing) -> near-par solutions
    const moves = [];
    for (let i = 0; i < b.spools.length; i++) for (let j = 0; j < b.spools.length; j++) if (canMove(b, i, j)) {
      const A = b.spools[i], B = b.spools[j], mono = A.every(c => c === A[0]);
      if (smart && mono && !B.length) continue;
      moves.push([i, j, (B.length ? 10 : 0) + runLen(A) + (B.length && B.every(c => c === B[0]) ? 5 : 0)]);
    }
    if (smart) moves.sort((x, y) => y[2] - x[2]);
    for (const [i, j] of moves) { yarnMove(b, i, j); path.push([i, j]); if (go()) return true; path.pop(); yarnUndo(b); }
    return false;
  };
  return go() ? path : null;
}

/* Daily + Endless */
export function dailyYarnFor(st, dayKey) { ensure(st); return { def: dailyYarn(dayKey), done: !!st.academy.yarn.daily[dayKey] }; }
export function completeDaily(st, dayKey, stars, now = Date.now()) {
  ensure(st); if (!stars || st.academy.yarn.daily[dayKey]) return { ok: false };
  const d = dailyYarn(dayKey); st.academy.yarn.daily[dayKey] = stars;
  const coins = ledger.earn(st, { id: `yarn-daily:${dayKey}`, source: 'academy', amount: d.coins, now }).amount;
  grantXP(st, d.xp); return { ok: true, xp: d.xp, coins };
}
export function endlessNext(st) { ensure(st); return endlessYarn((st.academy.yarn.endless.current || 0) + 1); }
export function completeEndless(st, level) {
  const best0 = st.academy?.yarn?.endless?.best || 0, best = level > best0;
  ensure(st); const e = st.academy.yarn.endless;
  e.current = level; if (best) e.best = level;
  const xp = novelXP(st, `endless:${level}`, endlessYarn(level).xp, Date.now(), best ? 'auto' : 'repeat');   // XP only, and repeats decay
  return { ok: true, xp, best };
}
export const resetEndless = st => { ensure(st).yarn.endless.current = 0; };

/* ========================================================= mini-game stars */
/* Each game reports raw performance; these turn it into 0-3 stars. The
   discipline's attribute widens timing windows (trainingAssist, capped). */
export function gameStars(d, res) {
  const acc = res.total ? res.hits / res.total : 0;
  if (d === 'scent') return res.found ? (res.sniffsLeft >= 3 ? 3 : res.sniffsLeft >= 1 ? 2 : 1) : 0;
  if (d === 'trick') return res.correct ? (res.mistakes === 0 ? 3 : res.mistakes === 1 ? 2 : 1) : 0;
  return acc >= 0.9 ? 3 : acc >= 0.75 ? 2 : acc >= 0.55 ? 1 : 0;
}

/* ===================================================== long-session walk */
/** Gentle, optional. Returns a prompt at most once per snooze window; never blocks play. */
export function walkPrompt(st, now = Date.now()) {
  ensure(st);
  const a = st.academy;
  if (!a.sessionStart || now - (a.lastActive || 0) > 20 * 60e3) a.sessionStart = now;   // a 20-min gap = a new session
  a.lastActive = now;
  const long = now - a.sessionStart >= WALK_PROMPT.afterMinutes * 60e3;
  const snoozed = now - (a.lastWalkPrompt || 0) < WALK_PROMPT.snoozeMinutes * 60e3;
  if (!long || snoozed) return null;
  a.lastWalkPrompt = now;
  return { text: WALK_PROMPT.text, options: WALK_PROMPT.options, blocking: false };
}
