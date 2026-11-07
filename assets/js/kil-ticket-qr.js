/* Door QR payload shared by /tickets and /profile.
   Stored tokens are 32 hex characters. check_in_ticket strips a leading KIL-.
   event_checkin_scan only trims, so it does not accept this payload until it
   strips the same prefix. order_id is not a ticket. */
(function (root) {
  function payload(qrToken) {
    var token = String(qrToken || '');
    if (!/^[0-9a-f]{32}$/i.test(token)) return '';
    return 'KIL-' + token;
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
