// BRAND COLLAB (events feature, PR 4): an event organizer sends a collab request to a brand, and the brand reads it in its dashboard.
// Built against docs/proposed/migrations/E3_brand_collab.DRAFT.sql (fmw.my_collabs, fmw.send_collab, fmw.brand_collab_inbox, fmw.mark_collab). DORMANT until site.json "bizCollab" is true (FMW_CONFIG.bizCollab):
// off, this file registers nothing, draws nothing and makes no request. NO EMAIL: nothing here sends one (there is no configured sender); the request is stored and shown in the in-site inbox only.
// Two surfaces: (1) the "Request a collab" form on a brand page (listing.html?id=brand-<slug>), drawn only for a signed-in event organizer (the SERVER says who is allowed); (2) a dashboard "Collabs" tab:
// an organizer sees what it sent and its status, a claimed brand sees what was sent to it (a request to an UNCLAIMED brand is held by the server until the brand is claimed).
// The server validates everything again and answers plain sentences. Text goes in with textContent only; no markup, no storage.
(function (root) {
  var COPY = {
    tab: 'Collabs', formTitle: 'Request a collab', formNote: 'Event organizers can ask this brand to team up on an event. The request goes to the brand’s Find My Weed inbox; nothing is emailed.',
    message: 'Your message', event: 'Which event? (optional)', noEvent: 'No specific event', send: 'Send request', sending: 'Sending…', sent: 'Request sent. The brand sees it in its inbox once its page is claimed.',
    needMessage: 'Write a short message (up to 1,000 characters).', failed: 'Could not send the request. Try again in a moment.', signinLine: 'Event organizer? Sign in to ask this brand to collab.', signin: 'Organizer sign in',
    sentTitle: 'Requests you sent', inboxTitle: 'Collab requests from event organizers', none: 'Nothing here yet.', loading: 'Loading…', loadFail: 'Could not load this right now. Try again in a moment.',
    from: 'From', forEvent: 'For the event', seen: 'Mark seen', replied: 'Mark replied', marked: 'Updated.', markFail: 'Could not update it. Try again.', statusNew: 'New', statusSeen: 'Seen', statusReplied: 'Replied',
    howReply: 'To answer, open the organizer’s page: its public contact details are there.', organizerPage: 'Organizer page', to: 'To', readOnly: 'Only an owner or manager can change this.'
  };
  function el(doc, tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function t(v, n) { return typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').slice(0, n) : ''; }
  var UUID = /^[0-9a-f-]{36}$/, STATUS = ['new', 'seen', 'replied'];
  function enabled(win) { var c = win && win.FMW_CONFIG, p = c && c.authProject; return !!(c && c.bizCollab === true && p && p.url && p.anonKey && typeof win.fetch === 'function'); }
  // who can see the tab: a license that can run events, or a brand (the server checks again)
  function canSee(biz) { return !!(biz && biz.caps && (biz.caps.events === true || biz.caps.brand === true)); }
  function cleanSent(list) { return (Array.isArray(list) ? list : []).filter(function (r) { return r && UUID.test(String(r.id)); }).slice(0, 100).map(function (r) { return { id: r.id, brand: t(r.brand, 40), status: STATUS.indexOf(r.status) >= 0 ? r.status : 'new', message: t(r.message, 1000), event: t(r.event, 120), at: typeof r.created_at === 'string' ? r.created_at : '' }; }); }
  function cleanInbox(list) { return (Array.isArray(list) ? list : []).filter(function (r) { return r && UUID.test(String(r.id)); }).slice(0, 100).map(function (r) { return { id: r.id, status: STATUS.indexOf(r.status) >= 0 ? r.status : 'new', message: t(r.message, 1000), organizer: t(r.organizer, 120), license: typeof r.license === 'string' && /^[A-Z0-9-]{6,24}$/.test(r.license) ? r.license : '', event: t(r.event, 120), at: typeof r.created_at === 'string' ? r.created_at : '' }; }); }
  function cleanEvents(list) { return (Array.isArray(list) ? list : []).filter(function (e) { return e && UUID.test(String(e.id)) && typeof e.title === 'string'; }).slice(0, 50).map(function (e) { return { id: e.id, title: t(e.title, 120) }; }); }
  function when(iso) { try { return new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', year: 'numeric' }); } catch (e) { return ''; } }
  function nice(slug) { return String(slug || '').replace(/^[0-9a-f]{32}$/, 'a brand').replace(/-/g, ' ').replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); }); }
  function rpc(win, token, name, body) {
    var cfg = win.FMW_CONFIG && win.FMW_CONFIG.authProject, f = win.fetch; if (!cfg || !cfg.url || !cfg.anonKey || !token || typeof f !== 'function') return Promise.resolve({ ok: false });
    return Promise.resolve().then(function () { return f.call(win, cfg.url + '/rest/v1/rpc/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey, Authorization: 'Bearer ' + token, 'Content-Profile': 'fmw' }, body: JSON.stringify(body || {}) }); })
      .then(function (r) { if (r && r.ok) return r.json().then(function (j) { return { ok: true, data: j }; }, function () { return { ok: false }; }); return (r && r.json ? r.json() : Promise.resolve(null)).then(function (j) { return { ok: false, status: r && r.status, message: j && typeof j.message === 'string' ? j.message : '' }; }, function () { return { ok: false }; }); }, function () { return { ok: false }; });
  }
  // a short, plain sentence from the server about the input (400 / 403 / P0005) is shown; anything else (a database message) is not
  function why(r, fallback) { var m = r && typeof r.message === 'string' ? r.message.trim() : ''; if (m && m.length <= 120 && !/[{}<>\[\]()]|syntax|violat|relation|column|function|constraint|uuid|type /i.test(m)) return m.charAt(0).toUpperCase() + m.slice(1) + (/[.!?]$/.test(m) ? '' : '.'); return fallback; }
  // 1) the form on a brand page
  function mountBrandForm(win, doc, box, slug, brandName, opts) {
    opts = opts || {}; if (!enabled(win) || !box || !/^[a-z0-9][a-z0-9-]{1,39}$|^[0-9a-f]{32}$/.test(String(slug || ''))) return Promise.resolve(false);
    var token = win.FMW_SESSION && typeof win.FMW_SESSION.token === 'function' ? win.FMW_SESSION.token() : null;
    if (!token) { var s0 = el(doc, 'section', 'card collab-signin'); s0.setAttribute('data-card', 'collab'); s0.appendChild(el(doc, 'p', 'muted', COPY.signinLine)); var a = el(doc, 'a', 'btn ghost', COPY.signin); a.href = opts.signinHref || 'signup.html?as=organizer&mode=signin'; s0.appendChild(a); box.appendChild(s0); return Promise.resolve('signin'); }
    return rpc(win, token, 'my_collabs', {}).then(function (r) {
      if (!r.ok || !r.data || r.data.allowed !== true) return false;   // not an event organizer (or the SQL is not applied): nothing is drawn
      var events = cleanEvents(r.data.events), sec = el(doc, 'section', 'card collab'); sec.setAttribute('data-card', 'collab'); sec.appendChild(el(doc, 'h2', null, COPY.formTitle + (brandName ? ': ' + t(brandName, 80) : ''))); sec.appendChild(el(doc, 'p', 'muted', COPY.formNote));
      var f = el(doc, 'form'); f.setAttribute('novalidate', 'novalidate'); var ml = el(doc, 'label', 'field'), msg = el(doc, 'textarea'); msg.name = 'message'; msg.setAttribute('maxlength', '1000'); msg.setAttribute('rows', '5'); ml.appendChild(el(doc, 'span', null, COPY.message)); ml.appendChild(msg); f.appendChild(ml);
      var sel = null; if (events.length) { var el2 = el(doc, 'label', 'field'); sel = el(doc, 'select'); sel.name = 'event'; var o0 = el(doc, 'option', null, COPY.noEvent); o0.value = ''; sel.appendChild(o0); events.forEach(function (e) { var o = el(doc, 'option', null, e.title); o.value = e.id; sel.appendChild(o); }); el2.appendChild(el(doc, 'span', null, COPY.event)); el2.appendChild(sel); f.appendChild(el2); }
      var say = el(doc, 'p', 'muted'); say.setAttribute('role', 'status'); say.setAttribute('aria-live', 'polite'); var btn = el(doc, 'button', 'btn', COPY.send); btn.type = 'submit'; f.appendChild(btn); f.appendChild(say); sec.appendChild(f); box.appendChild(sec);
      var busy = false;
      f.addEventListener('submit', function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault(); if (busy) return;
        var text = String(msg.value || '').trim(); if (!text || text.length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) { say.textContent = COPY.needMessage; return; }
        busy = true; btn.setAttribute('disabled', 'disabled'); btn.textContent = COPY.sending; say.textContent = '';
        rpc(win, token, 'send_collab', { p_brand: String(slug), p_event: sel && sel.value ? sel.value : null, p_message: text }).then(function (x) {
          busy = false; btn.removeAttribute('disabled'); btn.textContent = COPY.send;
          if (x.ok) { say.textContent = COPY.sent; msg.value = ''; } else say.textContent = why(x, COPY.failed);
        });
      });
      return true;
    });
  }
  // 2) the dashboard tab
  function mount(doc, panel, ctx) {
    var role = ctx.biz && ctx.biz.role, canEdit = role === 'owner' || role === 'manager', caps = (ctx.biz && ctx.biz.caps) || {};
    var say = el(doc, 'p', 'muted'); say.setAttribute('role', 'status'); say.setAttribute('aria-live', 'polite');
    var names = {}; if (ctx.win.fetch) ctx.win.fetch('data/brands.json').then(function (r) { return r && r.ok ? r.json() : null; }).then(function (d) { ((d && d.brands) || []).forEach(function (b) { if (b && typeof b.slug === 'string' && typeof b.name === 'string') names[b.slug] = t(b.name, 80); }); }, function () {});
    if (caps.events === true) {
      panel.appendChild(el(doc, 'h2', null, COPY.sentTitle)); var sbox = el(doc, 'div'); panel.appendChild(sbox); sbox.appendChild(el(doc, 'p', 'muted', COPY.loading));
      ctx.rpc('my_collabs', {}).then(function (r) {
        sbox.textContent = ''; if (!r || !r.ok || !r.data) { sbox.appendChild(el(doc, 'p', 'muted', COPY.loadFail)); return; }
        var rows = cleanSent(r.data.sent); if (!rows.length) { sbox.appendChild(el(doc, 'p', 'muted', COPY.none)); return; }
        var ul = el(doc, 'ul', 'biz-plist'); rows.forEach(function (x) { var li = el(doc, 'li'); li.appendChild(el(doc, 'strong', null, COPY.to + ' ' + (names[x.brand] || nice(x.brand)))); li.appendChild(el(doc, 'span', 'muted', ' · ' + COPY[x.status === 'seen' ? 'statusSeen' : x.status === 'replied' ? 'statusReplied' : 'statusNew'] + (x.at ? ' · ' + when(x.at) : '') + (x.event ? ' · ' + x.event : ''))); li.appendChild(el(doc, 'p', null, x.message)); ul.appendChild(li); }); sbox.appendChild(ul);
      });
    }
    if (caps.brand === true) {
      panel.appendChild(el(doc, 'h2', null, COPY.inboxTitle)); panel.appendChild(el(doc, 'p', 'muted', COPY.howReply)); var ibox = el(doc, 'div'); panel.appendChild(ibox);
      var load = function () {
        ibox.textContent = ''; ibox.appendChild(el(doc, 'p', 'muted', COPY.loading));
        ctx.rpc('brand_collab_inbox', {}).then(function (r) {
          ibox.textContent = ''; if (!r || !r.ok) { ibox.appendChild(el(doc, 'p', 'muted', COPY.loadFail)); return; }
          var rows = cleanInbox(r.data); if (!rows.length) { ibox.appendChild(el(doc, 'p', 'muted', COPY.none)); return; }
          var ul = el(doc, 'ul', 'biz-plist');
          rows.forEach(function (x) {
            var li = el(doc, 'li'); li.appendChild(el(doc, 'strong', null, COPY.from + ' ' + (x.organizer || 'an event organizer'))); li.appendChild(el(doc, 'span', 'muted', ' · ' + COPY[x.status === 'seen' ? 'statusSeen' : x.status === 'replied' ? 'statusReplied' : 'statusNew'] + (x.at ? ' · ' + when(x.at) : '') + (x.license ? ' · ' + x.license : '') + (x.event ? ' · ' + COPY.forEvent + ' ' + x.event : '') + ' '));
            li.appendChild(el(doc, 'p', null, x.message));
            if (x.license) { var pa = el(doc, 'a', 'seeall', COPY.organizerPage); pa.href = 'listing.html?id=' + x.license.toLowerCase(); li.appendChild(pa); li.appendChild(doc.createTextNode(' ')); }
            if (canEdit) [['seen', COPY.seen], ['replied', COPY.replied]].forEach(function (m) { if (x.status === m[0]) return; var b = el(doc, 'button', 'btn ghost', m[1]); b.type = 'button'; b.setAttribute('data-act', 'collab-' + m[0]); b.addEventListener('click', function () { b.setAttribute('disabled', 'disabled'); ctx.rpc('mark_collab', { p_id: x.id, p_status: m[0] }).then(function (rr) { say.textContent = rr && rr.ok ? COPY.marked : COPY.markFail; load(); }); }); li.appendChild(b); });
            ul.appendChild(li);
          }); ibox.appendChild(ul);
          if (!canEdit) ibox.appendChild(el(doc, 'p', 'muted', COPY.readOnly));
        });
      }; load();
    }
    panel.appendChild(say);
  }
  var list = root.FMW_DASHBOARD_TABS = root.FMW_DASHBOARD_TABS || [];
  if (root.FMW_CONFIG && root.FMW_CONFIG.bizCollab === true) list.push({ key: 'collabs', label: COPY.tab, roles: ['owner', 'manager', 'editor'], when: canSee, mount: mount });
  var api = { COPY: COPY, enabled: enabled, canSee: canSee, cleanSent: cleanSent, cleanInbox: cleanInbox, cleanEvents: cleanEvents, mountBrandForm: mountBrandForm, mount: mount, why: why, nice: nice };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FMW_COLLAB = api;
})(typeof window !== 'undefined' ? window : globalThis);
