/* Door QR payload shared by /tickets and /profile.
   Stored tokens are 32 hex characters. order_id is not a ticket.
   check_in_ticket strips a leading KIL-. event_checkin_scan only trims,
   so a prefixed code is rejected there. /tickets opts into the prefix.
   /profile does not. */
(function (root) {
  function payload(qrToken, options) {
    var token = String(qrToken || '');
    if (!/^[0-9a-f]{32}$/i.test(token)) return '';
    if (options && options.prefix) return 'KIL-' + token;
    return token;
  }
  function checkInTicket(raw) {
    return String(raw || '').replace(/^KIL-/i, '');
  }
  function eventCheckinScan(raw) {
    return String(raw || '').trim();
  }
  var api = {
    payload: payload,
    checkInTicket: checkInTicket,
    eventCheckinScan: eventCheckinScan
  };
  root.KilTicketQr = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
