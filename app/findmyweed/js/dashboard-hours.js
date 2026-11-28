// The Hours tab of the business workspace (an extra tab registered through FMW_DASHBOARD.registerTab, so dashboard.js is not edited for it). Shown only to an owner or manager of a license whose
// capabilities include hours (the server decides: fmw.set_my_hours), and only while site.json "hours" is on (js/hours.js defines FMW_HOURS_UTIL only then). It replaces the card that used to sit
// above the dashboard (account-cards.js skips that card when this tab is registered). The rules are js/hours.js's own (FMW_HOURS_UTIL), checked here before a round trip and again by the server.
// Text goes in with textContent only.
(function (root) {
  var NAMES = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
  function el(doc, tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function mount(doc, panel, ctx) {
    var U = ctx.win.FMW_HOURS_UTIL || root.FMW_HOURS_UTIL;
    panel.appendChild(el(doc, 'h2', null, 'Opening hours'));
    if (!U) { panel.appendChild(el(doc, 'p', 'muted', 'Hours are not available right now.')); return; }
    panel.appendChild(el(doc, 'p', 'muted', 'Optional. Tick the days you are open and set the times. "Open now" shows on your listing only for hours you add here. A closing time earlier than the opening time means after midnight. A day left unticked is closed.'));
    var rows = {}, msg = el(doc, 'p', 'muted', 'Loading…'); msg.setAttribute('role', 'status'); msg.setAttribute('data-act', 'hours-msg');
    U.DAYS.forEach(function (d) {
      var row = el(doc, 'div', 'hours-row'), on = el(doc, 'input'), ol = el(doc, 'label', 'check'), a = el(doc, 'input'), al = el(doc, 'label', 'sr', NAMES[d] + ' opens'), z = el(doc, 'input'), zl = el(doc, 'label', 'sr', NAMES[d] + ' closes');
      on.type = 'checkbox'; on.id = 'hrt-on-' + d; ol.htmlFor = on.id; on.setAttribute('data-act', 'hours-on-' + d); ol.appendChild(on); ol.appendChild(el(doc, 'span', null, ' ' + NAMES[d] + ': open'));
      a.type = 'time'; a.id = 'hrt-from-' + d; al.htmlFor = a.id; a.setAttribute('data-act', 'hours-from-' + d); a.setAttribute('step', '900');
      z.type = 'time'; z.id = 'hrt-to-' + d; zl.htmlFor = z.id; z.setAttribute('data-act', 'hours-to-' + d); z.setAttribute('step', '900');
      [ol, al, a, el(doc, 'span', 'hours-to', ' to '), zl, z].forEach(function (n) { row.appendChild(n); }); panel.appendChild(row); rows[d] = { on: on, a: a, z: z };
    });
    var nl = el(doc, 'label', null, 'Note (optional, 140 characters)'), ni = el(doc, 'input'), save = el(doc, 'button', 'btn', 'Save hours');
    ni.type = 'text'; ni.setAttribute('maxlength', '140'); ni.setAttribute('data-act', 'hours-note'); nl.appendChild(ni);
    save.type = 'button'; save.setAttribute('data-act', 'hours-save'); save.disabled = true;
    panel.appendChild(nl); panel.appendChild(save); panel.appendChild(msg);
    function fill(data) {
      var wk = data && U.cleanWeek(data.hours);
      U.DAYS.forEach(function (d) { var r = wk && wk[d] && wk[d][0]; rows[d].on.checked = !!r; rows[d].a.value = r ? r[0] : ''; rows[d].z.value = r ? r[1] : ''; });
      ni.value = (data && U.cleanNote(data.note)) || '';
    }
    ctx.rpc('my_hours', {}).then(function (r) { if (r.ok && r.data) { fill(r.data); msg.textContent = ''; } else msg.textContent = 'Could not load your hours. You can still set them.'; save.disabled = false; });
    save.addEventListener('click', function () {
      var week = {};
      U.DAYS.forEach(function (d) { var r = rows[d]; week[d] = r.on.checked ? [[r.a.value, r.z.value]] : []; });
      if (U.cleanWeek(week) === false) { msg.textContent = 'Set an opening and a closing time for each open day. They must be different.'; return; }
      if (U.cleanNote(ni.value) === null) { msg.textContent = 'The note is at most 140 characters.'; return; }
      save.disabled = true; msg.textContent = 'Saving…';
      ctx.rpc('set_my_hours', { p_hours: week, p_note: U.cleanNote(ni.value) || null }).then(function (r) {
        save.disabled = false;
        if (r.ok && r.data) { fill(r.data); msg.textContent = 'Saved.'; } else msg.textContent = ctx.why(r, 'Could not save. Try again.');
      });
    });
  }
  function register() {
    var D = root.FMW_DASHBOARD;
    if (!D || typeof D.registerTab !== 'function' || !root.FMW_HOURS_UTIL) return false;   // the hours switch is off, or the dashboard is not on this page
    return D.registerTab('hours', 'Hours', mount, { roles: ['owner', 'manager'], when: function (biz) { return !!(biz && biz.caps && biz.caps.hours === true); }, after: 'profile' });
  }
  var api = { mount: mount, register: register };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else register();
})(typeof window !== 'undefined' ? window : globalThis);
