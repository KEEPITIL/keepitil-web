/* KEEPITIL "Add to calendar" for event pages: an .ics file built in the browser plus a Google Calendar link, both from the event's own
   start time, end time (else 2 hours after the start), title, venue and page address. Nothing is sent anywhere. */
(function (root) {
  'use strict';
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function utc(d) { return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z'; }
  function esc(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  /* Pure: { start, end } Dates or null when the event has no usable start. */
  function span(row) {
    var s = new Date(row && row.starts_at); if (!row || !row.starts_at || isNaN(s)) return null;
    var e = row.ends_at ? new Date(row.ends_at) : null; if (!e || isNaN(e) || e <= s) e = new Date(s.getTime() + 2 * 3600 * 1000);
    return { start: s, end: e };
  }
  function where(row) { return [row.venue, row.city, row.state].filter(Boolean).join(', '); }
  function ics(row, url, now) {
    var sp = span(row); if (!sp) return '';
    var slug = String(row.slug || 'event').replace(/[^a-z0-9._-]/gi, '');
    var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//KEEPITIL//Event//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      'UID:' + slug + '@keepitil.com', 'DTSTAMP:' + utc(now || new Date()), 'DTSTART:' + utc(sp.start), 'DTEND:' + utc(sp.end),
      'SUMMARY:' + esc(row.title || 'Event')];
    if (where(row)) L.push('LOCATION:' + esc(where(row)));
    if (url) L.push('URL:' + url, 'DESCRIPTION:' + esc('Details: ' + url));
    L.push('END:VEVENT', 'END:VCALENDAR');
    return L.join('\r\n') + '\r\n';
  }
  function googleUrl(row, url) {
    var sp = span(row); if (!sp) return '';
    var q = 'action=TEMPLATE&text=' + encodeURIComponent(row.title || 'Event') + '&dates=' + utc(sp.start) + '/' + utc(sp.end);
    if (where(row)) q += '&location=' + encodeURIComponent(where(row));
    if (url) q += '&details=' + encodeURIComponent('Details: ' + url);
    return 'https://calendar.google.com/calendar/render?' + q;
  }
  /* An event that has already ended gets no button. */
  function upcoming(row, now) { var sp = span(row); return !!sp && sp.end > (now || new Date()); }
  var api = { ics: ics, googleUrl: googleUrl, upcoming: upcoming, span: span };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.KilCalendar = api;
})(typeof window !== 'undefined' ? window : globalThis);
