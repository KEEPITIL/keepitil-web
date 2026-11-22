/* KEEPITIL host dashboard: LIVE checked-in count per event (draft, flag KIL_FLAGS.doorCount). Reads only
 * event_id, qty, refunded_qty, status and checked_in_at of the host's own orders (the organizer read policy already limits rows to
 * the host's events); never buyer_email or any other contact field. Polls every 30 s while the page is visible.
 */
(function (root) {
  var COLUMNS = 'event_id,qty,refunded_qty,status,checked_in_at';
  var COUNTS = { paid: true, partially_refunded: true, checked_in: true };   // statuses whose tickets are valid at the door
  /* rows -> { [event_id]: { checked, total } } counting TICKETS (qty), not orders */
  function summarize(rows) {
    var out = {};
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (!r || !COUNTS[r.status]) return;
      var k = String(r.event_id), q = Math.max(0, (r.qty | 0) - (r.refunded_qty | 0));
      var e = out[k] || (out[k] = { checked: 0, total: 0 });
      e.total += q;
      if (r.checked_in_at || r.status === 'checked_in') e.checked += q;
    });
    return out;
  }
  function line(title, c) { return String(title || 'Event') + ': ' + c.checked + ' of ' + c.total + ' ticket' + (c.total === 1 ? '' : 's') + ' checked in'; }
  function render(doc, el, events, counts) {
    if (!el) return;
    el.textContent = '';
    (events || []).forEach(function (ev) {
      var c = counts[String(ev.id)]; if (!c || !c.total) return;
      var p = doc.createElement('p'); p.className = 'door-count'; p.setAttribute('data-event', String(ev.id)); p.textContent = line(ev.title, c); el.appendChild(p);
    });
  }
  /* sb = supabase-js client (signed-in host); events = [{id,title}] */
  function load(sb, events) {
    var ids = (events || []).map(function (e) { return e.id; });
    if (!ids.length) return Promise.resolve({});
    return sb.from('event_orders').select(COLUMNS).in('event_id', ids).then(function (r) { return r && !r.error ? summarize(r.data) : {}; }, function () { return {}; });
  }
  var api = { COLUMNS: COLUMNS, summarize: summarize, line: line, render: render, load: load, POLL_MS: 30000 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KIL_DOOR_COUNT = api;
})(typeof window !== 'undefined' ? window : globalThis);
