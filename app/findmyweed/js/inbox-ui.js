// FMW DISPENSARY INBOX (slice 6, front end): on the account page for a BUSINESS account, behind FMW_CONFIG.ordering (off today, nothing sets it).
// Lists the business's orders and offers only the status moves the database allows (mirror of fmw.move_order in the DRAFT W7 migration; the
// server re-checks every move). Orders and moves go through an injected source: window.FMW_ORDERING_SOURCE.loadOrders() -> Promise of rows
// [{id, status, fulfilment, requestedFor, notes, items:[{name, qty}], createdAt}], and .move(id, to, note) -> Promise. Email/SMS notices are
// sent by the server, not from here. NO payments: nothing here handles money; the page says the customer pays at pickup or delivery.
(function (root) {
  var MOVES = { placed: ['accepted', 'declined'], accepted: ['preparing', 'declined'], preparing: ['ready', 'out_for_delivery'], ready: ['completed', 'no_show'], out_for_delivery: ['completed', 'no_show'] };
  var LABEL = { accepted: 'Accept', declined: 'Decline', preparing: 'Start preparing', ready: 'Mark ready', out_for_delivery: 'Out for delivery', completed: 'Complete (ID checked)', no_show: 'No-show' };
  var T = { title: 'Orders', intro: 'New orders appear here. Customers pay you at pickup or delivery; check government ID (21+, or 18+ medical where the law allows) before you hand over.', none: 'Orders are not open yet.', empty: 'No orders yet.', loading: 'Loading orders…', failed: 'That did not go through. Try again.', refresh: 'Refresh' };
  function moves(status) { return (MOVES[status] || []).slice(); }
  function mount(doc, into, opts) {
    var win = (opts && opts.win) || root, CFG = win.FMW_CONFIG || {};
    if (CFG.ordering !== true || !into) return null;
    var src = win.FMW_ORDERING_SOURCE || null;
    function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    var sec = el('section', 'card inbox'); sec.setAttribute('data-state', 'inbox'); sec.appendChild(el('h2', null, T.title)); sec.appendChild(el('p', 'muted', T.intro)); into.appendChild(sec);
    if (!src || typeof src.loadOrders !== 'function') { sec.appendChild(el('p', 'muted', T.none)); sec.setAttribute('data-state', 'closed'); return { state: 'closed' }; }
    var msg = el('p', 'muted'); msg.setAttribute('role', 'status'); var list = el('div'); sec.appendChild(msg); sec.appendChild(list);
    function draw(rows) {
      while (list.firstChild) list.removeChild(list.firstChild);
      if (!rows.length) { list.appendChild(el('p', 'muted', T.empty)); return; }
      rows.forEach(function (o) {
        var card = el('div', 'order-card'); card.setAttribute('data-status', String(o.status));
        card.appendChild(el('p', 'order-head', String(o.status).replace(/_/g, ' ') + ' · ' + (o.fulfilment === 'delivery' ? 'delivery' : 'pickup') + (o.requestedFor ? ' · ' + o.requestedFor : '')));
        (Array.isArray(o.items) ? o.items : []).forEach(function (i) { card.appendChild(el('p', null, (Math.floor(Number(i.qty)) || 0) + ' × ' + String(i.name || ''))); });
        if (o.notes) card.appendChild(el('p', 'muted', 'Note: ' + String(o.notes)));
        moves(o.status).forEach(function (to) {
          var b = el('button', to === 'declined' || to === 'no_show' ? 'btn ghost small' : 'btn small', LABEL[to]); b.type = 'button'; b.setAttribute('data-act', to);
          b.addEventListener('click', function () {
            b.disabled = true; msg.textContent = '';
            Promise.resolve().then(function () { return src.move(o.id, to, null); }).then(load, function () { b.disabled = false; msg.textContent = T.failed; });
          });
          card.appendChild(b);
        });
        list.appendChild(card);
      });
    }
    function load() { msg.textContent = T.loading; return Promise.resolve().then(function () { return src.loadOrders(); }).then(function (rows) { msg.textContent = ''; draw(Array.isArray(rows) ? rows : []); }, function () { msg.textContent = T.failed; }); }
    var rf = el('button', 'btn ghost small', T.refresh); rf.type = 'button'; rf.setAttribute('data-act', 'refresh'); rf.addEventListener('click', load); sec.appendChild(rf);
    load();
    return { state: 'open', reload: load };
  }
  var api = { MOVES: MOVES, moves: moves, T: T, mount: mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FMW_INBOX = api;
})(this);
