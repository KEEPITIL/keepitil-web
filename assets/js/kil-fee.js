/* KEEPITIL ticket service fee, for the page (Joe 2026-11-17): the BUYER pays 5% + $0.50 per ORDER on top of the
 * tickets; the organizer receives the full ticket price.
 *
 * ONE SOURCE OF NUMBERS: bps / flatCents here MUST equal the create-checkout defaults
 * (cfg("buyer_fee_bps", 500), cfg("buyer_fee_per_order_cents", 50)) and the formula must equal serviceFeeCents in
 * keepitil.github.io .github/internal/supabase/proposed/create-checkout/fee.ts. The checkout charges; this file only
 * SHOWS the fee before payment. tests (event-fee-summary.test.mjs here, fee-copy-consistency.test.mjs in
 * keepitil.github.io) fail if they drift. Card-type extras (+1% / +2%) are not included: not decided.
 */
(function (root) {
  var FEE = { bps: 500, flatCents: 50 };

  // Same rules as the checkout: 0 for a free order; else round(subtotal * bps / 10000) (half up) + flat, once per order.
  function serviceFeeCents(subtotalCents, bps, flatCents) {
    bps = bps == null ? FEE.bps : bps; flatCents = flatCents == null ? FEE.flatCents : flatCents;
    if (!(subtotalCents > 0)) return 0;
    return Math.round(subtotalCents * bps / 10000) + flatCents;
  }

  // "Service fee (5% + $0.50 per order)": built from the numbers, so the words cannot disagree with the amount.
  function label(bps, flatCents) {
    bps = bps == null ? FEE.bps : bps; flatCents = flatCents == null ? FEE.flatCents : flatCents;
    var pct = (bps / 100).toFixed(2).replace(/\.?0+$/, '');
    return 'Service fee (' + pct + '% + $' + (flatCents / 100).toFixed(2) + ' per order)';
  }

  var api = { bps: FEE.bps, flatCents: FEE.flatCents, serviceFeeCents: serviceFeeCents, label: label };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KIL_FEE = api;
})(typeof window !== 'undefined' ? window : globalThis);
