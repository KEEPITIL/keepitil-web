/* STEPS — one provider contract, three implementations.
   ---------------------------------------------------------------------------
   healthkit  iOS: PokaNative.steps* (AppDelegate.swift) reads ONLY today's step
              count (HKQuantityTypeIdentifierStepCount). No heart rate, sleep,
              weight, calories, location or history is requested.
   dev        QA ONLY: window.POKA_DEV_STEPS (set by the capture harness) --
              never user-facing, never on by default.
   none       web / denied / unavailable: the game says so plainly and the
              Photographer and Best Friend paths earn the same rewards.

   Contract: status() -> 'available'|'unavailable'|'denied'|'unknown'
             request() -> status · stepsToday() -> number|null
   Step numbers stay on the device; they are never sent to analytics. */

import { isNative } from './native.js';

const call = (m, o = {}) => window.Capacitor.nativePromise('PokaNative', m, o);
const dev = () => typeof window !== 'undefined' && typeof window.POKA_DEV_STEPS === 'number';

export function provider() { return dev() ? 'dev' : (isNative && typeof window.Capacitor?.nativePromise === 'function') ? 'healthkit' : 'none'; }

export async function status() {
  if (dev()) return window.POKA_DEV_STEPS_STATUS || 'available';
  if (provider() === 'none') return 'unavailable';
  try { const r = await call('stepsStatus'); return r.status || 'unknown'; } catch (e) { return 'unavailable'; }
}
export async function request() {
  if (dev()) { window.POKA_DEV_STEPS_STATUS = window.POKA_DEV_STEPS_GRANT || 'available'; return window.POKA_DEV_STEPS_STATUS; }
  if (provider() === 'none') return 'unavailable';
  try { const r = await call('stepsRequest'); return r.status || 'unknown'; } catch (e) { return 'unavailable'; }
}
/** Steps since local midnight, or null if not readable. */
export async function stepsToday() {
  if (dev()) return window.POKA_DEV_STEPS;
  if (provider() === 'none') return null;
  try { const r = await call('stepsToday'); return typeof r.steps === 'number' ? r.steps : null; } catch (e) { return null; }
}
