/* NOTIFICATIONS — restrained, contextual, local-only.
   ---------------------------------------------------------------------------
   Never asked on first launch: the app offers once, after the first Daily
   Snap. At most NOTIFY.maxRoutinePerDay routine reminders per day (plus a
   genuinely time-sensitive event-ending notice). Every type has its own
   switch in Settings. iOS uses UNUserNotificationCenter via PokaNative; the
   web shows the settings as "iPhone app only". */

import { NOTIFY } from '../data/economy.js';
import { isNative } from './native.js';

const call = (m, o = {}) => window.Capacitor.nativePromise('PokaNative', m, o);
export const supported = () => isNative && typeof window.Capacitor?.nativePromise === 'function';

export async function permission() { if (!supported()) return 'unsupported'; try { return (await call('notifyStatus')).status; } catch (e) { return 'unsupported'; } }
export async function request() { if (!supported()) return 'unsupported'; try { return (await call('notifyRequest')).status; } catch (e) { return 'denied'; } }

/**
 * Pure planner: which notifications to schedule for the next 7 days.
 * prefs: { type: bool }, facts: { dailyDoneToday, eventEndsAt, fridayClaimedThisWeek }
 * Returns [{ id, type, at, title, body }] with <= maxRoutinePerDay routine items per day.
 */
export function plan(prefs, facts, petName, now = Date.now()) {
  const out = [], perDay = {};
  const at = (dayOffset, hour) => { const d = new Date(now); d.setDate(d.getDate() + dayOffset); d.setHours(hour, 0, 0, 0); return +d; };
  const push = (type, t, title, body) => {
    if (!prefs[type] || t <= now) return;
    const k = new Date(t).toDateString();
    if (NOTIFY.types[type].routine) { if ((perDay[k] || 0) >= NOTIFY.maxRoutinePerDay) return; perDay[k] = (perDay[k] || 0) + 1; }
    out.push({ id: `${type}-${t}`, type, at: t, title, body });
  };
  for (let d = 0; d < 7; d++) {
    const t = at(d, NOTIFY.types.friday.hour);
    if (new Date(t).getDay() === 5 && !(d === 0 && facts.fridayClaimedThisWeek)) push('friday', t, '🎁 Poka Friday!', `${petName} has a gift for you.`);
    if (!(d === 0 && facts.dailyDoneToday)) push('dailySnap', at(d, NOTIFY.types.dailySnap.hour), '📸 Daily Snap is ready', `Take today's photo with ${petName}.`);
  }
  if (facts.eventEndsAt) push('eventEnding', facts.eventEndsAt - 6 * 3600e3, '⏳ Event ends soon', 'A few hours left to earn your Adventure rewards.');
  // 1.4 — useful life moments only. Care copy is factual: never "open now or X will die".
  if (facts.careNeed) push('care', at(facts.careNeed.inDays || 1, NOTIFY.types.care.hour), `💚 ${facts.careNeed.name} would love some time with you`, 'A meal, some play or a short walk helps.');
  if (facts.relationshipNear) push('relationship', at(1, NOTIFY.types.relationship.hour), `💞 ${facts.relationshipNear.a} & ${facts.relationshipNear.b}`, 'They are close to becoming best friends.');
  if (facts.homelandProject) push('homeland', at(2, NOTIFY.types.homeland.hour), `🏗️ ${facts.homelandProject} is almost built`, 'A few more walks and meals will finish it.');
  return out.sort((a, b) => a.at - b.at);
}
export async function schedule(list) { if (!supported()) return false; try { await call('notifySchedule', { items: list }); return true; } catch (e) { return false; } }
