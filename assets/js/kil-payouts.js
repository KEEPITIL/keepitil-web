/* KEEPITIL host payouts status (Stripe Connect). The page NEVER decides payout status itself: it asks the server
 * (connect-status, proposed) which reads the organizer's account FROM STRIPE and stores the verified result.
 * Returning from Stripe with ?payouts=done proves nothing; the old client call to mark_payouts_enabled() is gone.
 * Text goes in with textContent only.
 */
(function (root) {
  function normalize(d) {
    if (!d || typeof d !== 'object' || d.error) return null;
    return {
      connected: d.connected === true,
      verified: d.verified === true,
      charges_enabled: d.charges_enabled === true,
      payouts_enabled: d.payouts_enabled === true,
      currently_due: Array.isArray(d.currently_due) ? d.currently_due.filter(function (x) { return typeof x === 'string'; }).slice(0, 20) : [],
      disabled_reason: typeof d.disabled_reason === 'string' ? d.disabled_reason : null,
      test_mode: d.test_mode === true
    };
  }

  // POST /functions/v1/connect-status with the user's own token. Returns the normalized status, or null if the
  // server could not be reached / answered with an error (the caller then keeps the stored, server-written flag).
  function refresh(fetchFn, supaUrl, token) {
    return Promise.resolve().then(function () {
      return fetchFn(supaUrl + '/functions/v1/connect-status', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } });
    }).then(function (r) { return r && r.ok ? r.json() : null; }).then(normalize).catch(function () { return null; });
  }

  // "individual.verification.document" -> "individual verification document"
  function human(field) { return String(field).replace(/[._]+/g, ' ').trim(); }

  // Lines describing the status, for the host dashboard.
  function describe(st) {
    if (!st) return ['Payout status could not be checked with Stripe right now.'];
    if (!st.connected) return ['No Stripe account connected yet.'];
    var out = [
      'Card payments: ' + (st.charges_enabled ? 'enabled' : 'not enabled yet'),
      'Payouts to your bank: ' + (st.payouts_enabled ? 'enabled' : 'not enabled yet')
    ];
    if (st.currently_due.length) out.push('Stripe still needs: ' + st.currently_due.map(human).join(', '));
    if (st.disabled_reason) out.push('Stripe has paused this account: ' + human(st.disabled_reason));
    if (st.test_mode) out.push('Stripe TEST mode: no real money moves.');
    return out;
  }

  function render(doc, card, st) {
    if (!card) return null;
    var box = doc.createElement('div');
    box.className = 'payout-status';
    box.setAttribute('data-verified', st && st.verified ? 'yes' : 'no');
    describe(st).forEach(function (line) { var p = doc.createElement('p'); p.className = 'note'; p.textContent = line; box.appendChild(p); });
    card.appendChild(box);
    return box;
  }

  var api = { refresh: refresh, normalize: normalize, describe: describe, render: render };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KIL_PAYOUTS = api;
})(typeof window !== 'undefined' ? window : globalThis);
