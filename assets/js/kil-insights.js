/* KEEPITIL event insights. Swappable: /dashboard and /member both call this.
   Owner numbers are copied only from organizer_dashboard rows, and only
   sold, checked_in, and revenue_cents. Bars are one event each, ordered by
   start date. This is not a day-by-day sales chart: that RPC has no order
   timestamps, and this module does not read event_orders.

   A public rollup counts published upcoming events and their cities. It does
   not include sold, check-in, or revenue. A count under 5 is shown as "<5"
   so the exact small number is not published.

   Nothing here writes. Nothing changes a price. No buyer identity, no
   password hash, no ticket token. */
(function (root) {
  'use strict';

  var FIELDS = {
    slug: 1, title: 1, status: 1, starts_at: 1, ends_at: 1, tz: 1,
    venue: 1, city: 1, cover_url: 1, sold: 1, checked_in: 1, revenue_cents: 1
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function slugOf(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9-]/g, ''); }
  function safeUrl(u) {
    var s = String(u == null ? '' : u).trim();
    if (/^https:\/\/[^\s<>"'\\]+$/i.test(s)) return s;
    if (/^\/(?![/\\])[^\s<>"'\\]*$/.test(s)) return s;
    return '';
  }
  /** is_protected is the server flag. Missing means protected. The hash is not read. */
  function locked(e) {
    if (!e) return true;
    if (e.is_protected === true || e.password_protected === true) return true;
    if (e.is_protected === false) return false;
    return true;
  }
  function publicCountLabel(n) {
    if (n == null || n === '') return '<5';
    var v = Number(n);
    if (!isFinite(v)) return '<5';
    if (v <= 0) return '';
    if (v < 5) return '<5';
    return String(Math.round(v));
  }
  function metric(row, key) {
    if (!row || !Object.prototype.hasOwnProperty.call(row, key) || row[key] == null || row[key] === '') return null;
    var n = Number(row[key]);
    return isFinite(n) ? n : null;
  }
  function money(cents) {
    if (cents == null) return '\u2014';
    var n = Number(cents);
    if (!isFinite(n)) return '\u2014';
    var sign = n < 0 ? '-' : '';
    return sign + '$' + (Math.abs(n) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function count(n) {
    if (n == null || !isFinite(Number(n))) return '\u2014';
    return Math.round(Number(n)).toLocaleString('en-US');
  }
  function rateOf(checked, sold) {
    if (sold == null || checked == null || !(sold > 0)) return null;
    return Math.round((checked / sold) * 100);
  }
  function rateText(r) { return r == null ? '\u2014' : (r + '%'); }
  function statusLabel(status) {
    var s = String(status == null ? '' : status).trim();
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function shortWhen(iso, tz) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return 'Date TBD';
    var o = { month: 'short', day: 'numeric' };
    if (tz && /^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+)+$/.test(tz)) o.timeZone = tz;
    try { return d.toLocaleDateString('en-US', o); }
    catch (e) { return d.toISOString().slice(0, 10); }
  }
  function eventHref(e) {
    var slug = encodeURIComponent(slugOf(e.slug));
    if (e.status && e.status !== 'published') return '/create-event?e=' + slug;
    return '/event?e=' + slug;
  }
  function failedNote() {
    return '<p class="kil-in-note kil-in-failed" data-kil="failed">Event numbers couldn\u2019t load. Check your connection and try again.</p>';
  }

  /** Allowlisted copy of one dashboard row. Unknown fields are dropped. */
  function pick(row) {
    if (!row || typeof row !== 'object') return null;
    var slug = row.slug;
    if (!slugOf(slug)) return null;
    var out = {};
    Object.keys(FIELDS).forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(row, key)) out[key] = row[key];
    });
    out.slug = slug;
    if (out.cover_url) out.cover_url = safeUrl(out.cover_url);
    return out;
  }

  /**
   * Join the host's event rows with organizer_dashboard rows on slug.
   * Counts are taken only from the metrics list. A metrics value of null
   * means that read failed; pass [] when the read succeeded and was empty.
   */
  function merge(events, metrics) {
    var by = {};
    function ensure(row, withMetrics) {
      var picked = pick(row);
      if (!picked) return;
      var key = slugOf(picked.slug);
      var cur = by[key];
      if (!cur) {
        cur = {
          slug: picked.slug, title: picked.title || '', status: picked.status || '',
          starts_at: picked.starts_at || '', ends_at: picked.ends_at || '', tz: picked.tz || '',
          venue: picked.venue || '', city: picked.city || '', cover_url: picked.cover_url || '',
          sold: null, checked_in: null, revenue_cents: null
        };
        by[key] = cur;
      } else {
        if (!cur.title && picked.title) cur.title = picked.title;
        if (!cur.status && picked.status) cur.status = picked.status;
        if (!cur.starts_at && picked.starts_at) cur.starts_at = picked.starts_at;
        if (!cur.ends_at && picked.ends_at) cur.ends_at = picked.ends_at;
        if (!cur.tz && picked.tz) cur.tz = picked.tz;
        if (!cur.venue && picked.venue) cur.venue = picked.venue;
        if (!cur.city && picked.city) cur.city = picked.city;
        if (!cur.cover_url && picked.cover_url) cur.cover_url = picked.cover_url;
      }
      if (withMetrics) {
        cur.sold = metric(picked, 'sold');
        cur.checked_in = metric(picked, 'checked_in');
        cur.revenue_cents = metric(picked, 'revenue_cents');
        if (picked.status) cur.status = picked.status;
        if (picked.title) cur.title = picked.title;
        if (picked.starts_at) cur.starts_at = picked.starts_at;
      }
    }
    (events || []).forEach(function (e) { if (e) ensure(e, false); });
    (metrics || []).forEach(function (m) { if (m) ensure(m, true); });
    return Object.keys(by).map(function (k) { return by[k]; });
  }

  function sumField(rows, key) {
    var any = false, n = 0;
    rows.forEach(function (row) {
      var v = metric(row, key);
      if (v == null) return;
      any = true;
      n += v;
    });
    return any ? n : null;
  }

  function totals(rows) {
    var list = rows || [];
    if (!list.length) {
      return { events: 0, sold: 0, checked_in: 0, revenue_cents: 0, rate: null };
    }
    var sold = sumField(list, 'sold');
    var checked = sumField(list, 'checked_in');
    var cents = sumField(list, 'revenue_cents');
    return {
      events: list.length,
      sold: sold,
      checked_in: checked,
      revenue_cents: cents,
      rate: rateOf(checked, sold)
    };
  }

  function isPast(e, t) {
    return !!(e && e.starts_at && new Date(e.starts_at).getTime() < t);
  }

  function byStart(a, b) {
    var da = a.starts_at ? new Date(a.starts_at).getTime() : NaN;
    var db = b.starts_at ? new Date(b.starts_at).getTime() : NaN;
    if (isNaN(da) && isNaN(db)) return 0;
    if (isNaN(da)) return 1;
    if (isNaN(db)) return -1;
    return da - db;
  }

  function split(rows, now) {
    var t = (now || new Date()).getTime();
    var list = (rows || []).filter(Boolean);
    return {
      upcoming: list.filter(function (e) { return !isPast(e, t); }).sort(byStart),
      past: list.filter(function (e) { return isPast(e, t); }).sort(function (a, b) { return byStart(b, a); })
    };
  }

  /** Recent past (oldest of those on the left) then the next upcoming, capped. */
  function chartRows(parts) {
    var past = parts.past.filter(function (e) { return e.starts_at; }).slice(0, 8).reverse();
    var upcoming = parts.upcoming.filter(function (e) { return e.starts_at; }).slice(0, 4);
    return past.concat(upcoming);
  }

  function model(rows, now) {
    if (!Array.isArray(rows)) return null;
    var list = rows.map(pick).filter(Boolean);
    var parts = split(list, now);
    var chart = chartRows(parts);
    var max = 0;
    chart.forEach(function (e) {
      var s = metric(e, 'sold');
      var c = metric(e, 'checked_in');
      if (s != null && s > max) max = s;
      if (c != null && c > max) max = c;
    });
    return {
      totals: totals(list),
      upcoming: parts.upcoming,
      past: parts.past,
      upcomingTotals: totals(parts.upcoming),
      pastTotals: totals(parts.past),
      chart: chart,
      max: max
    };
  }

  function barHeight(value, max) {
    if (value == null || !(value > 0) || !(max > 0)) return 0;
    return Math.max(4, Math.round((value / max) * 100));
  }

  function tile(value, label) {
    return '<div class="kil-in-tile"><b>' + esc(value) + '</b><span>' + esc(label) + '</span></div>';
  }

  function sideCard(title, t) {
    var line = count(t.events) + (t.events === 1 ? ' event' : ' events');
    return '<div class="kil-in-side"><h3>' + esc(title) + '</h3><p>' + esc(line) + '</p>' +
      '<small>' + esc(count(t.sold)) + ' sold · ' + esc(count(t.checked_in)) + ' checked in · ' +
      esc(rateText(t.rate)) + ' check-in · ' + esc(money(t.revenue_cents)) + '</small></div>';
  }

  function datedCount(m) {
    return m.upcoming.concat(m.past).filter(function (e) { return e.starts_at; }).length;
  }

  function chartHtml(m, showMoreNote) {
    if (!m.chart.length) {
      return '<div class="kil-in-chartbox" data-kil="event-chart"><h3>Tickets by event date</h3>' +
        '<p class="kil-in-note">No dated events to chart yet.</p></div>';
    }
    var cols = m.chart.map(function (e) {
      var sold = metric(e, 'sold');
      var checked = metric(e, 'checked_in');
      var tip = (e.title || 'Event') + ': ' + count(sold) + ' sold, ' + count(checked) + ' checked in';
      return '<div class="kil-in-col" title="' + esc(tip) + '">' +
        '<div class="kil-in-pair">' +
        '<div class="kil-in-bar" style="height:' + barHeight(sold, m.max) + '%"></div>' +
        '<div class="kil-in-bar is-in" style="height:' + barHeight(checked, m.max) + '%"></div>' +
        '</div><span class="kil-in-xl">' + esc(shortWhen(e.starts_at, e.tz)) + '</span></div>';
    }).join('');
    var more = (m.upcoming.length + m.past.length) > m.chart.length;
    return '<div class="kil-in-chartbox" data-kil="event-chart"><h3>Tickets by event date</h3>' +
      '<p class="kil-in-note">Each pair of bars is one event, in start-date order. Blue is tickets sold. Green is checked in.</p>' +
      '<div class="kil-in-bars" aria-hidden="true">' + cols + '</div>' +
      '<div class="kil-in-legend"><span><i class="kil-in-sw"></i>Sold</span><span><i class="kil-in-sw is-in"></i>Checked in</span></div>' +
      (showMoreNote ? '<p class="kil-in-note">The chart shows the latest dated events. The tables list every event.</p>' : '') +
      '</div>';
  }

  function rowHtml(e) {
    var when = [shortWhen(e.starts_at, e.tz), [e.venue, e.city].filter(Boolean).join(' · ')].filter(Boolean).join(' · ');
    return '<tr>' +
      '<td><a href="' + esc(eventHref(e)) + '">' + esc(e.title || 'Event') + '</a></td>' +
      '<td>' + esc(when) + '</td>' +
      '<td>' + esc(statusLabel(e.status) || '\u2014') + '</td>' +
      '<td class="num">' + esc(count(metric(e, 'sold'))) + '</td>' +
      '<td class="num">' + esc(count(metric(e, 'checked_in'))) + '</td>' +
      '<td class="num">' + esc(rateText(rateOf(metric(e, 'checked_in'), metric(e, 'sold')))) + '</td>' +
      '<td class="num">' + esc(money(metric(e, 'revenue_cents'))) + '</td>' +
      '</tr>';
  }

  function tableHtml(title, rows, empty) {
    var body = rows.length
      ? rows.map(rowHtml).join('')
      : '<tr><td colspan="7">' + esc(empty) + '</td></tr>';
    return '<h3 class="kil-in-h">' + esc(title) + '</h3>' +
      '<div class="kil-in-tablewrap"><table class="kil-in-table"><thead><tr>' +
      '<th>Event</th><th>When</th><th>Status</th>' +
      '<th class="num">Sold</th><th class="num">Checked in</th><th class="num">Check-in</th><th class="num">Revenue</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function focusHtml(rows, slug, now) {
    var want = slugOf(slug);
    if (!want) return '';
    var found = null;
    (rows || []).forEach(function (e) { if (!found && slugOf(e.slug) === want) found = e; });
    if (!found) {
      return '<div class="kil-in-focus" data-kil="focus"><h3>This event</h3>' +
        '<p class="kil-in-note">This event is not on your dashboard.</p></div>';
    }
    var side = isPast(found, (now || new Date()).getTime()) ? 'Past' : 'Upcoming';
    var rate = rateOf(metric(found, 'checked_in'), metric(found, 'sold'));
    return '<div class="kil-in-focus" data-kil="focus"><h3>This event · ' + esc(side) + '</h3>' +
      '<p><a href="' + esc(eventHref(found)) + '">' + esc(found.title || 'Event') + '</a></p>' +
      '<small>' + esc(shortWhen(found.starts_at, found.tz)) +
      (statusLabel(found.status) ? ' · ' + esc(statusLabel(found.status)) : '') + '</small>' +
      '<div class="kil-in-tiles kil-in-tiles-4">' +
      tile(count(metric(found, 'sold')), 'Sold') +
      tile(count(metric(found, 'checked_in')), 'Checked in') +
      tile(rateText(rate), 'Check-in') +
      tile(money(metric(found, 'revenue_cents')), 'Revenue') +
      '</div></div>';
  }

  function renderOwner(rows, opts) {
    if (!Array.isArray(rows)) return failedNote();
    opts = opts || {};
    var now = opts.now || new Date();
    var m = model(rows, now);
    var t = m.totals;
    var h = '<section class="kil-in" data-kil="owner">';
    h += focusHtml(m.upcoming.concat(m.past), opts.focus, now);
    h += '<div class="kil-in-tiles" data-kil="totals">' +
      tile(count(t.events), 'Events') +
      tile(count(t.sold), 'Sold') +
      tile(count(t.checked_in), 'Checked in') +
      tile(rateText(t.rate), 'Check-in') +
      tile(money(t.revenue_cents), 'Revenue') +
      '</div>';
    h += '<div class="kil-in-split" data-kil="compare">' +
      sideCard('Upcoming', m.upcomingTotals) +
      sideCard('Past', m.pastTotals) +
      '</div>';
    h += chartHtml(m, opts.table !== false && datedCount(m) > m.chart.length);
    h += '<p class="kil-in-note">Sold, checked in, and revenue are the figures already stored for your events. Bars follow each event\u2019s start date.</p>';
    if (opts.table !== false) {
      var cap = 40;
      h += tableHtml('Upcoming', m.upcoming.slice(0, cap), 'No upcoming events.');
      h += tableHtml('Past', m.past.slice(0, cap), 'No past events.');
      if (m.upcoming.length > cap || m.past.length > cap) {
        h += '<p class="kil-in-note">Showing the first ' + cap + ' events on each side.</p>';
      }
    }
    h += '</section>';
    return h;
  }

  /** Published upcoming events only. Counts and cities. No ticket figures. */
  function publicRollup(events, now) {
    var t = (now || new Date()).getTime();
    var rows = (events || []).filter(function (e) {
      return e && !locked(e) && e.status === 'published' && e.starts_at && new Date(e.starts_at).getTime() >= t;
    });
    var cities = [], seen = {};
    rows.forEach(function (e) {
      var c = String(e.city || '').replace(/\s+/g, ' ').trim();
      var key = c.toLowerCase();
      if (c && !seen[key]) { seen[key] = 1; cities.push(c); }
    });
    cities.sort(function (a, b) { return a.localeCompare(b); });
    return { upcoming: rows.length, cities: cities.slice(0, 6) };
  }

  function summaryCities(list) {
    var cities = [], seen = {};
    (Array.isArray(list) ? list : []).forEach(function (c) {
      var city = String(c == null ? '' : c).replace(/\s+/g, ' ').trim();
      var key = city.toLowerCase();
      if (city && !seen[key] && cities.length < 6) { seen[key] = 1; cities.push(city); }
    });
    cities.sort(function (a, b) { return a.localeCompare(b); });
    return cities;
  }

  /**
   * Public line only. An event array is reduced to a count and cities.
   * A summary object is { upcoming_count, cities }. null upcoming_count
   * means the server already bucketed a count of 1–4 as "<5".
   * A count of 0 renders nothing. Titles are never written.
   */
  function renderPublic(input, now) {
    if (input == null || input === '') return '';
    var p;
    if (Array.isArray(input)) p = publicRollup(input, now);
    else if (typeof input === 'object') p = { upcoming: input.upcoming_count, cities: summaryCities(input.cities) };
    else return '';
    var label = publicCountLabel(p.upcoming);
    if (!label) return '';
    label += ' upcoming';
    if (p.cities && p.cities.length) label += ' · ' + p.cities.join(' · ');
    return '<p class="kil-in-public" data-kil="public-rollup">' + esc(label) + '</p>';
  }

  var api = {
    esc: esc, slugOf: slugOf, money: money, count: count, rateOf: rateOf, pick: pick,
    merge: merge, totals: totals, split: split, model: model, publicRollup: publicRollup,
    renderOwner: renderOwner, renderPublic: renderPublic, failedNote: failedNote
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KilInsights = api;
  if (typeof globalThis !== 'undefined') globalThis.KilInsights = api;
})(typeof window !== 'undefined' ? window : this);
