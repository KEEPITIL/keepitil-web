// PROPOSED, NOT DEPLOYED. "Transfer after the event" for KEEPITIL host payouts (TEST MODE design).
// Ticket money already reaches the host's Stripe account at purchase (destination charges: create-checkout v58 and
// steps 2-5 build on that, incl. step 5's transfer reversals for refunds). So the money is HELD on the connected
// account (payout schedule = manual, set at onboarding) and RELEASED to the host's bank only once every paid event of
// that host has ended plus HOLD_DAYS (the refund / dispute window). Pure functions: unit-tested directly.

/** PLACEHOLDER (Joe decides): days after an event ends before its money is released to the host's bank. */
export const HOLD_DAYS = 3;
const DAY = 86_400_000;

export type HostEvent = { id: number | string; ends_at: string | null; starts_at: string | null; paid_orders: number };

/** When an event's money may be released: ends_at (or starts_at + 1 day if no end time) + holdDays. null = unknown. */
export function releaseAt(e: HostEvent, holdDays = HOLD_DAYS): number | null {
  const end = e.ends_at ? Date.parse(e.ends_at) : e.starts_at ? Date.parse(e.starts_at) + DAY : NaN;
  return Number.isFinite(end) ? end + holdDays * DAY : null;
}

/**
 * Decide for one host: release now, or hold until when. Only events with paid orders count (free RSVPs move no money).
 * Any paid event without a usable date holds everything (fail safe).
 */
export function releaseDecision(events: HostEvent[], now: number, holdDays = HOLD_DAYS): { release: boolean; nextReleaseAt: number | null; reason: string } {
  const paid = events.filter((e) => (e.paid_orders | 0) > 0);
  if (!paid.length) return { release: false, nextReleaseAt: null, reason: "no paid events" };
  const times = paid.map((e) => releaseAt(e, holdDays));
  if (times.some((t) => t === null)) return { release: false, nextReleaseAt: null, reason: "a paid event has no date" };
  const latest = Math.max(...(times as number[]));
  return latest <= now ? { release: true, nextReleaseAt: null, reason: "every paid event ended + hold" }
                       : { release: false, nextReleaseAt: latest, reason: "an event is still in its hold window" };
}

/** Idempotency key: one release per connected account per UTC day, so a retried cron never pays out twice. */
export const releaseKey = (account: string, now: number) => `kil-release-${account}-${new Date(now).toISOString().slice(0, 10)}`;
