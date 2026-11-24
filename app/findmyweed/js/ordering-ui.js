// FMW order-ahead UI on the listing page (slices 3-5 wired, BEHIND A FLAG): drawn only when FMW_CONFIG.ordering === true, which nothing sets
// today (no site.json key yet), so on the live site this file does nothing. NO PAYMENTS: the page says "Pay the business at pickup or
// delivery" and there is no payment field. The menu comes from an injected source (window.FMW_ORDERING_SOURCE.loadMenu(license) -> Promise of
// rows; the menu table is a DRAFT migration), and placing an order goes through source.place(request) (the place-order function, not built).
// With no source the section says ordering is not open for this business. Uses js/menu.js, js/cart.js, js/order.js.
(function (root) {
  var T = {
    title: 'Order ahead', intro: 'Reserve items and pay the business when you pick up or when it is delivered. Find My Weed takes no payment.',
    none: 'Ordering is not open for this business yet.', loading: 'Loading the menu…', empty: 'No items listed.', add: 'Add', cart: 'Your order', emptyCart: 'Nothing added yet.',
    remove: 'Remove', pickup: 'Pickup', delivery: 'Delivery', city: 'Delivery city', notes: 'Notes for the business (optional)', ack: 'I will bring a valid government ID (21+, or 18+ medical where the law allows).',
    total: 'Total (you pay the business, not us)', place: 'Place order', placing: 'Sending…', sent: 'Order sent. The business will confirm.', failed: 'We could not send the order. Try again.',
    other: 'Your order is from another business. Clear it first.', license: 'License'
  };
  var ERR = { 'empty-cart': 'Add an item first.', 'no-fulfilment': 'Choose pickup or delivery.', 'no-delivery-city': 'Enter the delivery city.', 'id-not-acknowledged': 'Please confirm you will bring ID.', 'bad-time': 'That time is not valid.', 'time-in-past': 'Pick a time that has not passed.', 'notes-too-long': 'Notes are too long.' };
  function mount(doc, license, into, opts) {
    var win = (opts && opts.win) || root, CFG = win.FMW_CONFIG || {};
    if (CFG.ordering !== true || !into) return null;
    var M = (opts && opts.M) || root.FMW_MENU, K = (opts && opts.K) || root.FMW_CART, O = (opts && opts.O) || root.FMW_ORDER;
    var src = win.FMW_ORDERING_SOURCE || null;
    function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    var sec = el('section', 'card order'); sec.setAttribute('data-state', 'order-ahead'); sec.appendChild(el('h2', null, T.title)); sec.appendChild(el('p', 'muted', T.intro));
    sec.appendChild(el('p', 'mono', T.license + ' ' + license));
    into.appendChild(sec);
    if (!src || typeof src.loadMenu !== 'function' || !M || !K || !O) { sec.appendChild(el('p', 'muted', T.none)); sec.setAttribute('data-state', 'closed'); return { state: 'closed' }; }
    var store = K.store(win), cart = store.load(), form = { fulfilment: 'pickup', idAck: false, notes: '', deliveryCity: '' }, items = [], body = el('div'), msg = el('p', 'muted'); msg.setAttribute('role', 'status');
    sec.appendChild(msg); sec.appendChild(body); msg.textContent = T.loading;
    function save(c) { cart = K.clean(c); store.save(cart); draw(); }
    function draw() {
      while (body.firstChild) body.removeChild(body.firstChild);
      if (!items.length) { body.appendChild(el('p', 'muted', T.empty)); return; }
      M.group(M.filter(items)).forEach(function (g) {
        body.appendChild(el('h3', null, g.category));
        var ul = el('ul', 'menu-list');
        g.items.forEach(function (i) {
          var li = el('li'); li.appendChild(el('span', 'item-name', i.name + (i.size ? ' · ' + i.size : '')));
          li.appendChild(el('span', 'item-price', K.money(i.priceCents)));
          var b = el('button', 'btn small', T.add); b.type = 'button'; b.setAttribute('data-act', 'add'); b.setAttribute('data-id', i.id);
          b.addEventListener('click', function () { var r = K.add(cart, license, i); if (!r.ok && r.reason === 'other-business') { msg.textContent = T.other; return; } msg.textContent = ''; save(r.cart); });
          li.appendChild(b); ul.appendChild(li);
        });
        body.appendChild(ul);
      });
      var c = el('div', 'cart'); c.appendChild(el('h3', null, T.cart));
      if (!cart.lines.length || cart.license !== license) c.appendChild(el('p', 'muted', T.emptyCart));
      else {
        cart.lines.forEach(function (l) {
          var row = el('div', 'cart-line'); row.appendChild(el('span', null, l.qty + ' × ' + l.name + ' · ' + K.money(l.qty * l.priceCents)));
          var rm = el('button', 'btn ghost small', T.remove); rm.type = 'button'; rm.setAttribute('data-act', 'remove'); rm.addEventListener('click', function () { save(K.setQty(cart, l.id, 0)); }); row.appendChild(rm); c.appendChild(row);
        });
        c.appendChild(el('p', 'total', T.total + ': ' + K.money(K.totals(cart).displayCents)));
        var pick = el('button', 'btn ghost small', T.pickup), del = el('button', 'btn ghost small', T.delivery); pick.type = del.type = 'button';
        pick.setAttribute('data-act', 'pickup'); del.setAttribute('data-act', 'delivery');
        pick.addEventListener('click', function () { form.fulfilment = 'pickup'; draw(); }); del.addEventListener('click', function () { form.fulfilment = 'delivery'; draw(); });
        c.appendChild(pick); c.appendChild(del);
        if (form.fulfilment === 'delivery') { var city = el('input'); city.type = 'text'; city.name = 'deliveryCity'; city.setAttribute('aria-label', T.city); city.value = form.deliveryCity; city.addEventListener('input', function () { form.deliveryCity = city.value; }); c.appendChild(city); }
        var lab = el('label', 'check'), ck = el('input'); ck.type = 'checkbox'; ck.name = 'idAck'; ck.checked = form.idAck; ck.addEventListener('change', function () { form.idAck = ck.checked; }); lab.appendChild(ck); lab.appendChild(el('span', null, T.ack)); c.appendChild(lab);
        var go = el('button', 'btn', T.place); go.type = 'button'; go.setAttribute('data-act', 'place');
        go.addEventListener('click', function () {
          var r = O.build(cart, { fulfilment: form.fulfilment, deliveryCity: form.deliveryCity, notes: form.notes, idAck: form.idAck });
          if (!r.ok) { msg.textContent = r.errors.map(function (e) { return ERR[e] || e; }).join(' '); return; }
          if (typeof src.place !== 'function') { msg.textContent = T.none; return; }
          go.disabled = true; msg.textContent = T.placing;
          Promise.resolve().then(function () { return src.place(r.request); }).then(function () { store.clear(); cart = K.empty(); msg.textContent = T.sent; draw(); }, function () { go.disabled = false; msg.textContent = T.failed; });
        });
        c.appendChild(go);
      }
      body.appendChild(c);
    }
    Promise.resolve().then(function () { return src.loadMenu(license); }).then(function (rows) { items = M.clean(rows); msg.textContent = ''; draw(); }, function () { msg.textContent = T.none; });
    return { state: 'open' };
  }
  var api = { T: T, mount: mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FMW_ORDERING = api;
})(this);
