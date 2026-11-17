/* KEEPITIL host dashboard: the PAYOUTS row (Stripe Connect, TEST MODE draft). The page never decides anything about
 * money: it asks connect-payout-summary (server, reads Stripe) and shows the answer. Text goes in with textContent only.
 */
(function (root) {
  var money = function (c) { return '$' + ((c | 0) / 100).toFixed(2); };
  var day = function (iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toISOString().slice(0, 10); };
  function lines(s) {
    if (!s || s.error) return ['Payout status could not be checked with Stripe right now.'];
    if (!s.connected) return ['No Stripe account connected yet. Connect one on the Create event page to sell paid tickets.'];
    var out = [];
    out.push(s.verified ? 'Payouts: ready (Stripe verified your account).' : 'Payouts: not ready yet. Stripe still needs details from you.');
    if (Array.isArray(s.currently_due) && s.currently_due.length) out.push('Stripe still needs: ' + s.currently_due.map(function (f) { return String(f).replace(/[._]+/g, ' '); }).join(', '));
    out.push('Held for you: ' + money(s.held_cents) + (s.pending_cents ? ' (+ ' + money(s.pending_cents) + ' still clearing)' : ''));
    if (s.next_release_at === 'next daily run') out.push('Next payout to your bank: at the next daily payout run.');
    else if (s.next_release_at) out.push('Next payout to your bank: from ' + day(s.next_release_at) + ' (' + (s.hold_days | 0) + ' days after your event ends).');
    (Array.isArray(s.payouts) ? s.payouts : []).slice(0, 3).forEach(function (p) {
      out.push('Paid out ' + money(p.amount) + ' · ' + String(p.status) + (p.arrival_date ? ' · arrives ' + day(p.arrival_date) : ''));
    });
    if (s.test_mode) out.push('Stripe TEST mode: no real money moves.');
    return out;
  }
  function render(doc, el, s) {
    if (!el) return null;
    while (el.firstChild) el.removeChild(el.firstChild);
    el.setAttribute('data-verified', s && s.verified ? 'yes' : 'no');
    lines(s).forEach(function (t) { var p = doc.createElement('p'); p.className = 'payout-line'; p.textContent = t; el.appendChild(p); });
    return el;
  }
  function load(fetchFn, supaUrl, token) {
    return Promise.resolve().then(function () {
      return fetchFn(supaUrl + '/functions/v1/connect-payout-summary', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
    }).then(function (r) { return r && r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  var api = { lines: lines, render: render, load: load };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KIL_HOST_PAYOUTS = api;
})(typeof window !== 'undefined' ? window : globalThis);
