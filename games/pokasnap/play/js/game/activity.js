/* ACTIVITY — Active Days and the three commitment tracks.
   ---------------------------------------------------------------------------
   An ACTIVE DAY needs one qualifying action (Daily Snap, mission, Journey
   Snap, training, meaningful care, step milestone, Rare Moment, event
   objective, walk). Opening the app does not count.

   Tracks, all independent and all paid through the ledger (once per id):
     1. consecutive streak -> STREAK_LADDER (day 1..7, repeats). A gap restarts
        the COUNT only; nothing earned is ever removed.
     2. weekly active days (Mon-Sun) -> WEEKLY_ACTIVE, for busy players.
     3. monthly active days -> MONTHLY_ACTIVE, up to the monthly keepsake. */

import { STREAK_LADDER, WEEKLY_ACTIVE, MONTHLY_ACTIVE, ACTIVE_DAY_ACTIONS } from '../data/economy.js';
import { ITEMS, path } from '../data/items.js';
import * as ledger from './ledger.js';
import { grant, monthKey } from './entitlements.js';
import { bonusPoints } from './events.js';

const DAY = 864e5;
export function weekKey(now = Date.now()) {       // Monday of the local week
  const d = new Date(now); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return ledger.dayKey(+d);
}
function prevDayKey(k) { const [y, m, d] = k.split('-').map(Number); return ledger.dayKey(+new Date(y, m - 1, d - 1, 12)); }

export function ensure(st) {
  st.activity = st.activity || { days: [], streak: 0, best: 0, lastDay: null };
  // 1.1 saves: carry the old streak best forward so nothing looks lost
  if (st.streak?.best && st.activity.best < st.streak.best) st.activity.best = st.streak.best;
  return st.activity;
}

/** Record a qualifying action. Returns { newDay, rewards[] } (rewards only on a new active day). */
export function qualify(st, action, now = Date.now()) {
  if (!ACTIVE_DAY_ACTIONS.includes(action)) return { newDay: false, rewards: [] };
  const A = ensure(st), k = ledger.dayKey(now);
  if (A.days.includes(k)) return { newDay: false, rewards: [] };
  if (!ledger.clockOk(st, now)) return { newDay: false, rewards: [], clock: true };
  A.days.push(k); if (A.days.length > 400) A.days.shift();
  A.streak = A.lastDay === prevDayKey(k) ? A.streak + 1 : 1;
  A.lastDay = k; A.best = Math.max(A.best, A.streak);
  const rewards = [];

  // 1. streak ladder (day 1..7, repeating)
  const step = STREAK_LADDER[(A.streak - 1) % STREAK_LADDER.length];
  const sr = { track: 'streak', day: A.streak, label: step.label || `Day ${A.streak} streak` };
  sr.coins = ledger.earn(st, { id: `streak:${k}`, source: 'streak', amount: step.coins || 0, now }).amount;
  if (step.points) sr.points = bonusPoints(st, step.points, now).points;
  rewards.push(sr);

  // 2. weekly active days
  const wk = weekKey(now), inWeek = A.days.filter(d => d >= wk && d <= ledger.dayKey(+new Date(wk.replace(/-/g, '/')) + 6 * DAY)).length;
  for (const m of WEEKLY_ACTIVE) if (m.days === inWeek) {
    const r = { track: 'weekly', days: m.days, label: m.label || `${m.days} active day${m.days > 1 ? 's' : ''} this week` };
    r.coins = ledger.earn(st, { id: `weekly:${wk}:${m.days}`, source: 'weekly', amount: m.coins || 0, now }).amount;
    if (m.points) r.points = bonusPoints(st, m.points, now).points;
    rewards.push(r);
  }

  // 3. monthly active days
  const mk = monthKey(now), inMonth = A.days.filter(d => d.startsWith(mk)).length;
  for (const m of MONTHLY_ACTIVE) if (m.days === inMonth) {
    const r = { track: 'monthly', days: m.days, label: m.label || `${m.days} active days this month` };
    if (m.coins) r.coins = ledger.earn(st, { id: `monthly:${mk}:${m.days}`, source: 'monthly', amount: m.coins, now }).amount;
    if (m.item && grant(st, m.item, 'EVENT_EARNED', `monthly:${mk}`, now)) r.item = m.item;
    if (m.keepsake) {
      const ks = ITEMS.find(it => path(it, 'POKASNAP_PLUS')?.keepsakeMonth === mk);
      if (ks && grant(st, ks.itemID, 'EVENT_EARNED', `monthly:${mk}:25`, now)) r.item = ks.itemID;
    }
    rewards.push(r);
  }
  return { newDay: true, rewards };
}

export function view(st, now = Date.now()) {
  const A = ensure(st), k = ledger.dayKey(now);
  const alive = A.lastDay === k || A.lastDay === prevDayKey(k);
  const wk = weekKey(now), mk = monthKey(now);
  const weekDays = A.days.filter(d => d >= wk && d <= ledger.dayKey(+new Date(wk.replace(/-/g, '/')) + 6 * DAY)).length;
  const monthDays = A.days.filter(d => d.startsWith(mk)).length;
  return { today: A.days.includes(k), streak: alive ? A.streak : 0, best: A.best, weekDays, monthDays,
    streakLadder: STREAK_LADDER, weeklyLadder: WEEKLY_ACTIVE, monthlyLadder: MONTHLY_ACTIVE };
}
