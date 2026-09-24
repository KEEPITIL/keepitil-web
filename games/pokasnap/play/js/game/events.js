/* EVENTS — data-driven weekly adventures with Adventure Points.
   ---------------------------------------------------------------------------
   The current event is computed from EVENT_SCHEDULE (a Monday anchor rotating
   through EVENT_TEMPLATES), so a new week needs no code. Points are CUMULATIVE
   until the event ends -- missing a day never makes the headline impossible
   (catch-up rule; a test proves it from the path tables).

   Milestones pay from the ladder: coins, Bond XP, frame, headline (Earn / Plus
   / Buy), bonus, and the earn-only prestige variant. Plus owns the headline
   automatically but still has to PLAY for 125 and 150. Subscribing mid-event
   keeps every point and is recomputed retroactively. */

import { EVENT_TEMPLATES, EVENT_SCHEDULE, EVENT_LADDER, PATHS, DEFAULT_PATH, EVENT_POINT_DAILY_CAP, PLUS_EVENT_BOOST, DUPLICATE_HEADLINE_COINS } from '../data/economy.js';
import * as ledger from './ledger.js';
import { grant, isOwned, plusSubscribed } from './entitlements.js';
import { grantXP } from './progress.js';

const DAY = 864e5;
function startOfLocalDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return +d; }
function parseLocal(s) { const [y, m, d] = s.split('-').map(Number); return +new Date(y, m - 1, d); }

/** The event running at `now`, or null when the schedule is off. */
export function currentEvent(now = Date.now()) {
  if (!EVENT_SCHEDULE.live) return null;
  const anchor = parseLocal(EVENT_SCHEDULE.anchor), len = EVENT_SCHEDULE.weekDays;
  const idx = Math.floor((startOfLocalDay(now) - anchor) / (len * DAY));
  if (idx < 0) return null;
  const t = EVENT_TEMPLATES[idx % EVENT_TEMPLATES.length];
  const start = anchor + idx * len * DAY, end = start + len * DAY;   // DST-safe enough for week buckets
  const s = new Date(start);
  const id = `${t.id}-${s.getFullYear()}${String(s.getMonth() + 1).padStart(2, '0')}${String(s.getDate()).padStart(2, '0')}`;
  return { ...t, template: t.id, id, start, end, daysLeft: Math.max(0, Math.ceil((end - now) / DAY)) };
}
export function nextEvent(now = Date.now()) { const c = currentEvent(now); return c ? currentEvent(c.end + 1000) : null; }

export function state(st, ev) {
  st.events = st.events || {};
  if (!ev) return null;
  st.events[ev.id] = st.events[ev.id] || { points: 0, path: null, joined: false, claimed: {}, today: {} };
  return st.events[ev.id];
}
export function join(st, pathId, now = Date.now()) {
  const ev = currentEvent(now), es = state(st, ev); if (!es) return null;
  const first = !es.joined;
  es.path = PATHS[pathId] ? pathId : DEFAULT_PATH; es.joined = true;
  return { first, event: ev, path: es.path };
}
export function pointsToday(st, now = Date.now()) { const ev = currentEvent(now), es = state(st, ev); return es && es.today?.day === ledger.dayKey(now) ? es.today.points || 0 : 0; }
export function pointsFor(st, template, now = Date.now()) {
  const ev = currentEvent(now);
  if (!ev || ev.template !== template) return null;
  return state(st, ev).points;
}

/** Add Adventure Points for an action. Returns { points, total, rewards[] }. */
export function addPoints(st, action, now = Date.now(), ref = null) {
  const ev = currentEvent(now), es = state(st, ev);
  if (!es) return { points: 0, total: 0, rewards: [] };
  if (!es.path) es.path = ev.suggestedPath || DEFAULT_PATH;
  const base = PATHS[es.path].points[action] || 0;
  if (!base) return { points: 0, total: es.points, rewards: [] };
  const day = ledger.dayKey(now);
  es.today = es.today.day === day ? es.today : { day, counts: {} };
  const cap = EVENT_POINT_DAILY_CAP[action];
  if (cap != null && (es.today.counts[action] || 0) >= cap) return { points: 0, total: es.points, rewards: [], capped: true };
  es.today.counts[action] = (es.today.counts[action] || 0) + 1;
  const pts = Math.round(base * (plusSubscribed(st, now) ? PLUS_EVENT_BOOST : 1));
  es.points += pts; es.today.points = (es.today.points || 0) + pts;
  return { points: pts, total: es.points, rewards: claim(st, ev, now) };
}
/** Plain point grant (streak/weekly/Friday bonuses), no path lookup. */
export function bonusPoints(st, n, now = Date.now()) {
  const ev = currentEvent(now), es = state(st, ev); if (!es || !n) return { points: 0, rewards: [] };
  const day = ledger.dayKey(now); es.today = es.today?.day === day ? es.today : { day, counts: {} };
  es.points += n; es.today.points = (es.today.points || 0) + n;
  return { points: n, total: es.points, rewards: claim(st, ev, now) };
}

/** Pay every milestone reached and not yet claimed. Idempotent (retroactive-safe). */
export function claim(st, ev = currentEvent(), now = Date.now()) {
  const es = state(st, ev); if (!es) return [];
  const out = [];
  for (const m of EVENT_LADDER) {
    if (es.points < m.points || es.claimed[m.points]) continue;
    es.claimed[m.points] = now;
    const r = { points: m.points, label: m.label || null };
    if (m.coins) r.coins = ledger.earn(st, { id: `event:${ev.id}:${m.points}`, source: 'event', amount: m.coins, ref: ev.id, now }).amount;
    if (m.xp) { grantXP(st, m.xp); r.xp = m.xp; }
    if (m.slot) {
      const id = ev.items[m.slot];
      if (grant(st, id, m.slot === 'prestige' ? 'ACHIEVEMENT_LIMITED' : 'EVENT_EARNED', ev.id, now)) r.item = id;
      else if (m.slot === 'headline') { r.coins = ledger.earn(st, { id: `event:${ev.id}:dup`, source: 'event', amount: DUPLICATE_HEADLINE_COINS, ref: ev.id, now }).amount; r.dupOf = id; }
      else r.already = id;
      r.slot = m.slot;
    }
    out.push(r);
  }
  return out;
}

export function ladderView(st, now = Date.now()) {
  const ev = currentEvent(now), es = state(st, ev); if (!es) return null;
  return {
    event: ev, points: es.points, path: es.path, joined: es.joined, max: EVENT_LADDER[EVENT_LADDER.length - 1].points,
    steps: EVENT_LADDER.map(m => ({ ...m, item: m.slot ? ev.items[m.slot] : null, reached: es.points >= m.points, claimed: !!es.claimed[m.points],
      owned: m.slot ? isOwned(st, ev.items[m.slot]) : false, earnOnly: m.slot === 'prestige' })),
  };
}

/** Best-case points a path can still earn per day (used by the catch-up test and the "on track" hint). */
export function maxDailyPoints(pathId) {
  const p = PATHS[pathId].points, caps = EVENT_POINT_DAILY_CAP, perDayActions = { dailySnap: 1, journeySnap: 3, rareMoment: 3, walk: 3, trick: 1 };
  return Object.entries(p).reduce((a, [k, v]) => a + v * (caps[k] ?? perDayActions[k] ?? 1), 0);
}
