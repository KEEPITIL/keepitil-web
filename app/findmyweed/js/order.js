// FMW ORDER REQUEST builder (slice 5 front half): turns a cart + choices into the request the place-order function will receive, and checks it
// the way the server will (the server re-checks everything: this only avoids a round trip). NO payments: the request has no payment field and
// the only money value is a display total. Age is NOT sent from here: the server derives it from the signed-in account. Not wired yet.
(function (root) {
  var LIC = /^[A-Z]{1,4}[0-9]{1,2}-[0-9]{7}-LIC$/;
  function build(cart, o) {
    o = o || {};
    var errors = [];
    if (!cart || !LIC.test(String(cart.license || '')) || !Array.isArray(cart.lines) || !cart.lines.length) errors.push('empty-cart');
    var f = o.fulfilment === 'delivery' ? 'delivery' : o.fulfilment === 'pickup' ? 'pickup' : null;
    if (!f) errors.push('no-fulfilment');
    var city = String(o.deliveryCity || '').trim().slice(0, 80);
    if (f === 'delivery' && !city) errors.push('no-delivery-city');
    var when = o.requestedFor ? new Date(o.requestedFor) : null;
    if (o.requestedFor && (!when || isNaN(when.getTime()))) errors.push('bad-time');
    var now = o.now ? new Date(o.now) : new Date();
    if (when && !isNaN(when.getTime()) && when.getTime() < now.getTime() - 60000) errors.push('time-in-past');
    var notes = String(o.notes || '').trim();
    if (notes.length > 300) errors.push('notes-too-long');
    if (o.idAck !== true) errors.push('id-not-acknowledged');   // "Bring a valid government ID" shown and ticked
    if (errors.length) return { ok: false, errors: errors };
    var total = 0; cart.lines.forEach(function (l) { total += l.qty * l.priceCents; });
    return { ok: true, request: { license: cart.license, fulfilment: f, deliveryCity: f === 'delivery' ? city : null, requestedFor: when ? when.toISOString() : null, notes: notes || null,
      items: cart.lines.map(function (l) { return { id: l.id, qty: l.qty }; }), displayTotalCents: total } };   // names and prices come from the server's menu, not from here
  }
  var api = { build: build };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FMW_ORDER = api;
})(this);
