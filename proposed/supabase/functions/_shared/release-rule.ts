// PROPOSED, NOT DEPLOYED. "Hold the host's money until after the event" (Joe, 2026-11-17 15:10: YES, hold until the
// event has ended; the timing after that is Stripe's, not ours: "Stripe controls the payout, not us").
// Ticket money reaches the host's Stripe account at purchase (destination charges; steps 2-5 rely on that). The
// account's payout schedule is MANUAL (set at onboarding), so nothing leaves for the host's bank while an event is
// still ahead. Once every paid event of that host has ENDED, connect-release-payouts pays out the account's
// AVAILABLE balance only. WHEN a payment becomes available is Stripe's settlement timing for the connected account
// (shown on the account as settings.payouts.schedule.delay_days; Stripe sets the minimum per country and account
// risk), so we add no days of our own. Pure functions: unit-tested directly.
const DAY = 86_400_000;

export type HostEvent = { id: number | string; ends_at: string | null; starts_at: string | null; paid_orders: number };

/** When an event has ended: ends_at, or starts_at + 1 day when no end time was given. null = no usable date. */
export function eventEndsAt(e: HostEvent): number | null {
  const end = e.ends_at ? Date.parse(e.ends_at) : e.starts_at ? Date.parse(e.starts_at) + DAY : NaN;
  return Number.isFinite(end) ? end : null;
}

/**
 * Decide for one host: release now (every paid event has ended), or hold until the last one ends. Only events with
 * paid orders count (free RSVPs move no money). A paid event without a usable date holds everything (fail safe).
 */
export function releaseDecision(events: HostEvent[], now: number): { release: boolean; nextReleaseAt: number | null; reason: string } {
  const paid = events.filter((e) => (e.paid_orders | 0) > 0);
  if (!paid.length) return { release: false, nextReleaseAt: null, reason: "no paid events" };
  const ends = paid.map(eventEndsAt);
  if (ends.some((t) => t === null)) return { release: false, nextReleaseAt: null, reason: "a paid event has no date" };
  const latest = Math.max(...(ends as number[]));
  return latest <= now ? { release: true, nextReleaseAt: null, reason: "every paid event has ended" }
                       : { release: false, nextReleaseAt: latest, reason: "an event has not ended yet" };
}

/** Idempotency key: one release per connected account per UTC day, so a retried cron never pays out twice. */
export const releaseKey = (account: string, now: number) => `kil-release-${account}-${new Date(now).toISOString().slice(0, 10)}`;

/** Stripe's settlement delay for this connected account, as Stripe reports it (null if Stripe did not say). */
export const stripeDelayDays = (account: any): number | null => {
  const d = account?.settings?.payouts?.schedule?.delay_days;
  return Number.isInteger(d) ? d : null;
};
