/* KBeats revenue ledger rules (pure; the backend persists the same shapes — REVENUE_LEDGER.md).
   Integer minor units only (cents). Append-only: entries are frozen, corrections are new
   'adjustment' entries, a repeated eventId is rejected (no duplicate ledger entries). */
import { REVENUE } from './config.js';

export function split(distributable, bps = REVENUE) {
  if (!Number.isInteger(distributable)) throw new Error('amounts must be integer minor units');
  if (bps.platform_fee_bps + bps.artist_share_bps !== 10000) throw new Error('split must total 10000 bps');
  const artist = Math.floor(distributable * bps.artist_share_bps / 10000);   // rounding remainder goes to platform
  return { artist, platform: distributable - artist };
}

export class Ledger {
  constructor() { this.entries = []; this.ids = new Set(); }
  append({ eventId, kind = 'revenue', source, trackId, artistId, gross, storeFees = 0, adjustments = 0, currency = 'USD', period, status = 'estimated', ref = null, at = Date.now() }) {
    if (!eventId) throw new Error('eventId required');
    if (this.ids.has(eventId)) throw new Error('duplicate eventId ' + eventId);
    if (!['revenue', 'adjustment'].includes(kind)) throw new Error('bad kind');
    if (!['estimated', 'finalized', 'paid'].includes(status)) throw new Error('bad status');
    if (kind === 'adjustment' && !this.ids.has(ref)) throw new Error('adjustment must reference an existing entry');
    const distributable = gross - storeFees - adjustments;
    const s = split(distributable, REVENUE);
    const e = Object.freeze({ eventId, kind, source, trackId, artistId, gross, storeFees, adjustments, distributable, artistShare: s.artist, platformShare: s.platform,
      currency, period, status, ref, at, bps: Object.freeze({ platform: REVENUE.platform_fee_bps, artist: REVENUE.artist_share_bps }), agreement: REVENUE.agreement_version });
    this.entries.push(e); this.ids.add(eventId);
    return e;
  }
  /* Artist totals per status for one statement period: estimated is never counted as paid. */
  statement(artistId, period) {
    const t = { estimated: 0, finalized: 0, paid: 0 };
    for (const e of this.entries) if (e.artistId === artistId && e.period === period) t[e.status] += e.artistShare;
    return t;
  }
}
