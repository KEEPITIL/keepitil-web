// FMW account page cards (loaded on account.html): what a signed-in CUSTOMER and a signed-in BUSINESS see below their email. Called by js/account.js.
//   WHO IS A BUSINESS is decided by the SERVER (fmw.my_account: the license check recorded for this account), never by the client's sign-up "kind".
//   business: "Your business": the recorded license number and legal name, and the license status. A GREEN CHECK and the number mean the server's
//     check found the license and it is still live; anything else says the check is not finished. The word "Verified" is never shown (owner rule).
//     If the server cannot be reached (or the function is not applied yet) NOTHING business-only is shown.
//   customer: "Saved listings" (the favorites switch stays OFF: a note until it is on, then the list from js/favorites.js).
//   both: "Your data": Download my data and Delete account. Behind FMW_CONFIG.accountData (OFF): Download is the read-only rpc fmw.export_my_data (migration
//     20261124030000, NOT applied yet) and Delete is the rpc fmw.delete_my_data (20261124040000, NOT applied yet): Find My Weed's own rows only, never a member's shared
//     login on our other sites (deleting that stays on that site's account page). With the
//     switch off the buttons are drawn disabled and say "coming soon". With it on the client calls them with the user's own token; nothing else is sent anywhere.
// Text goes in with textContent only. No secret; the anon key is the public one (FMW_CONFIG). The server checks every call.
(function (root) {
  var T = {
    bizTitle: 'Your business', bizName: 'Legal name', bizLicense: 'License number', bizStatus: 'License status',
    bizOk: 'License found and confirmed for this account', bizNotDone: 'License check not finished', bizUnknown: 'Checking your license…',
    bizGoLive: 'Your listing goes live after review.',   // DRAFT for Muse (Grok 2026-11-24): an approved business whose license is not in the published listings yet
    bizHelp: 'Questions about your license? See the About page.',
    bizNone: 'Your business license check is not on record yet.',
    // PLACEHOLDER WORDING (Grok 2026-11-24): Muse words these two lines, Echo checks them.
    bizPending: 'We\'ll confirm you own this business.', bizPendingHelp: 'Your license was found. Business features open once our team has confirmed the claim.',
    // BUSINESS CHECKLIST (Muse 04:34 via Grok, KODE 5:15): one card, three rows, from the records that exist. "Prime" = the paid top-of-county spots 1-5, EARNED monthly by a good-standing checklist
    // (license current, a 3.5+ rating, replies within 48 h, monthly billing current). It is never part of filtering and is shown apart from the profile. Where no record exists the row says "Not on file".
    clTitle: 'Your checklist', clLicense: 'License', clTier: 'Pricing tier', clPrime: 'Prime standing',
    clLicCurrent: 'Current', clLicConfirming: 'We\'ll confirm you own this business', clLicUnfinished: 'Check not finished',
    clExpires: function (d) { return 'Expires ' + d; }, clExpiryNone: 'Expiry date not on file',
    clTierChecking: 'Checking…', clTierNone: 'Not on file', clTierAfter: 'Shown once your license is confirmed',
    clPrimeNote: '',   // COPY SLOT: Echo writes the one-line explainer of the Prime badge (due 11 AM); an empty string draws nothing
    clCritLicense: 'License current', clCritRating: 'Rating of 3.5 or higher', clCritReply: 'Replies within 48 hours', clCritBilling: 'Monthly billing current',
    clYes: 'Yes', clNotOnFile: 'Not on file', clSpot: 'Prime spot: none',
    ccTitle: 'Contact details', ccIntro: 'Optional. Your listing shows a Call button and a Website link for the fields you fill in, and nothing for the ones you leave empty.',
    ccPhone: 'Phone', ccWebsite: 'Website', ccWebsiteHint: 'Starts with https://', ccSave: 'Save', ccSaved: 'Saved.', ccLoading: 'Loading…',
    ccBadPhone: 'Enter a US phone number such as (510) 555-0199, or a number that starts with +.', ccBadWeb: 'Enter a website that starts with https://', ccFail: 'Could not save. Try again.',
    hrTitle: 'Opening hours', hrIntro: 'Optional. Tick the days you are open and set the times. "Open now" shows on your listing only for hours you add here. A closing time earlier than the opening time means after midnight.',
    hrDays: { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' }, hrOpen: 'Open', hrFrom: 'Opens', hrTo: 'Closes', hrNote: 'Note (optional, up to 140 characters)',
    hrSave: 'Save hours', hrSaved: 'Saved.', hrBad: 'Set an opening and a closing time for each open day. They must be different.', hrBadNote: 'The note is at most 140 characters.', hrFail: 'Could not save. Try again.', hrLoading: 'Loading…',
    savedTitle: 'Saved listings', savedSoon: 'Saving listings is coming soon.',
    dataTitle: 'Your data', dataSoon: 'Download and delete are coming soon. Until then, email info@keepitil.com from your account address and we will do it.',   // the same promise Privacy and About already make (js/copy.js), so the disabled card is not a dead end
    download: 'Download my data', downloading: 'Preparing your file…', downloaded: 'Your file was downloaded.', downloadFail: 'We could not prepare your file. Nothing was changed. Try again later.',
    del: 'Delete account', delSure: 'Yes, delete my account', delCancel: 'Keep my account', delWarn: 'This deletes your account and its data. It cannot be undone.',
    deleting: 'Deleting…', deleted: 'Your Find My Weed account and its data were deleted.', deletedData: 'Your Find My Weed data was deleted. Your other account was not changed; to delete that too, use the account page there.', deleteFail: 'We could not delete your account. Nothing was changed. Try again later.'
  };
  function el(doc, tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function card(doc, title, state) { var c = el(doc, 'section', 'card'); c.setAttribute('data-state', state); c.appendChild(el(doc, 'h2', null, title)); return c; }

  // ONE read of the public listings index (data/listings-index.json) per approved business, shared by the go-live line and the checklist. Resolves { read: false } on any
  // failure or odd answer (quiet), else { read: true, row } where row is the listing with this license (trimmed, case-insensitive; a published one preferred) or null.
  function readIndex(ctx, number) {
    var f = ctx.win && ctx.win.fetch, want = String(number || '').trim().toUpperCase();
    if (typeof f !== 'function' || !want) return Promise.resolve({ read: false });
    return Promise.resolve().then(function () { return f.call(ctx.win, 'data/listings-index.json', { cache: 'no-store' }); })
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !Array.isArray(j.listings)) return { read: false };
        var hits = j.listings.filter(function (l) { return l && String(l.license || '').trim().toUpperCase() === want; });
        return { read: true, row: hits.filter(function (l) { return l.published !== false; })[0] || hits[0] || null };
      })
      .catch(function () { return { read: false }; });
  }
  // An APPROVED business whose license is not yet in the published listings gets a second line: "Your listing goes live after review." Client-only (no SQL): the one
  // public index is read ONLY for an approved card; a failed read or an odd answer adds nothing.
  function goLiveLine(doc, card, read) {
    read.then(function (res) {
      if (!res.read) return;
      if (!(res.row && res.row.published !== false)) { var p = el(doc, 'p', 'muted', T.bizGoLive); p.setAttribute('data-state', 'listing-review'); card.appendChild(p); }
    });
  }

  // ---- the business checklist: license + pricing tier + Prime standing, from the records that exist (no new table, no new data file).
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function expiryText(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || '')); if (!m) return '';
    var y = +m[1], mo = +m[2], da = +m[3], x = new Date(Date.UTC(y, mo - 1, da));
    return x.getUTCFullYear() === y && x.getUTCMonth() === mo - 1 && x.getUTCDate() === da ? MONTHS[mo - 1] + ' ' + da + ', ' + y : '';
  }
  /** The checklist's content, pure. state: approved | pending | not_verified. row: the business's row in the public index (or null). tiers: the server's pricing items for a
   *  listing (or null). Returns { license: { current, text, expiry }, tier: text, criteria: [{ key, label, value, met }], spot }. Rating, reply time and billing have NO source today: "Not on file". */
  function checklist(state, row, tiers) {
    var cur = state === 'approved', lic = { current: cur, text: cur ? T.clLicCurrent : state === 'pending' ? T.clLicConfirming : T.clLicUnfinished, expiry: '' };
    if (cur && row) { var ex = expiryText(row.licenseExpires); lic.expiry = ex ? T.clExpires(ex) : T.clExpiryNone; }
    var tier = !cur ? T.clTierAfter : !tiers || !tiers.length || !row ? T.clTierNone : (row.storefront === true || row.delivery === true ? tiers[0] : tiers[1] || tiers[0]);   // a tier needs BOTH the server's tier names and the listing's own retail / other flags
    return { license: lic, tier: tier,
      criteria: [{ key: 'license', label: T.clCritLicense, value: cur ? T.clYes : T.clNotOnFile, met: cur },
        { key: 'rating', label: T.clCritRating, value: T.clNotOnFile, met: null }, { key: 'reply', label: T.clCritReply, value: T.clNotOnFile, met: null },
        { key: 'billing', label: T.clCritBilling, value: T.clNotOnFile, met: null }], spot: T.clSpot };
  }
  function checklistCard(doc, box, ctx, acct) {
    var st = acct.state, s = card(doc, T.clTitle, 'checklist'); s.id = 'checklist';
    var ul = el(doc, 'ul', 'checklist');
    function li(key, label, value) { var x = el(doc, 'li', null); x.setAttribute('data-row', key); x.appendChild(el(doc, 'strong', null, label + ': ')); var v = el(doc, 'span', null, value); x.appendChild(v); ul.appendChild(x); return { li: x, v: v }; }
    var c0 = checklist(st, null, null), rl = li('license', T.clLicense, c0.license.text), rt = li('tier', T.clTier, st === 'approved' ? T.clTierChecking : c0.tier), rp = li('prime', T.clPrime, '');
    var crit = el(doc, 'ul', 'prime-criteria');
    c0.criteria.forEach(function (c) { var y = el(doc, 'li', null, c.label + ': ' + c.value); y.setAttribute('data-crit', c.key); y.setAttribute('data-met', c.met === true ? 'yes' : 'unknown'); crit.appendChild(y); });
    rp.li.appendChild(crit); var spot = el(doc, 'p', 'muted', c0.spot); spot.setAttribute('data-act', 'prime-spot'); rp.li.appendChild(spot);
    if (T.clPrimeNote) { var note = el(doc, 'p', 'muted', T.clPrimeNote); note.setAttribute('data-act', 'prime-note'); rp.li.appendChild(note); }
    s.appendChild(ul); box.appendChild(s);
    if (st !== 'approved') return;
    // approved: the one index read (shared with the go-live line) gives the expiry date and the retail / other tier; the server's own pricing answer gives the tier names (a failure says "not on file")
    var AUTH = ctx.win && ctx.win.FMW_AUTH, price = AUTH && typeof AUTH.pricing === 'function' ? Promise.resolve(AUTH.pricing(ctx.token)).then(function (r) { return r || { allowed: false }; }, function () { return { allowed: false }; }) : Promise.resolve({ allowed: false });
    Promise.all([ctx._idx || Promise.resolve({ read: false }), price]).then(function (v) {
      var row = v[0].read ? v[0].row : null, p = v[1], items = p.allowed === true && p.pricing && Array.isArray(p.pricing.sections) && p.pricing.sections[0] && Array.isArray(p.pricing.sections[0].items) ? p.pricing.sections[0].items.map(function (i) { return i && typeof i.name === 'string' ? i.name : ''; }).filter(Boolean) : null;
      var c = checklist(st, row, items);
      rl.v.textContent = c.license.text + (c.license.expiry ? ' \u00b7 ' + c.license.expiry : ''); rt.v.textContent = c.tier;
    });
  }

  // ---- business (only from the server's record). acct.state: approved | pending | not_verified
  function businessCard(doc, box, ctx, acct) {
    var L = acct.license || {}, st = acct.state;
    var s = card(doc, T.bizTitle, st === 'approved' ? 'business-license' : st === 'pending' ? 'business-pending' : 'business-license'); s.id = 'business';
    var dl = el(doc, 'dl', 'account-facts');
    function row(k, v) { dl.appendChild(el(doc, 'dt', null, k)); var d = el(doc, 'dd', null, v); dl.appendChild(d); return d; }
    row(T.bizName, L.legalName || ''); row(T.bizLicense, L.number || '');
    var status = row(T.bizStatus, ''); status.setAttribute('data-act', 'license-status');
    if (st === 'approved') {
      var chk = el(doc, 'span', 'license-check', '\u2713'); chk.setAttribute('aria-hidden', 'true'); status.appendChild(chk);
      status.appendChild(el(doc, 'span', null, ' ' + T.bizOk)); status.setAttribute('data-state', 'license-ok');
    } else if (st === 'pending') { status.textContent = T.bizPending; status.setAttribute('data-state', 'license-confirming'); }
    else { status.textContent = T.bizNotDone; status.setAttribute('data-state', 'license-pending'); }
    s.appendChild(dl); s.appendChild(el(doc, 'p', 'muted', st === 'pending' ? T.bizPendingHelp : T.bizHelp)); box.appendChild(s);
    if (st === 'approved') { ctx._idx = readIndex(ctx, L.number); goLiveLine(doc, s, ctx._idx); }
    // the card appears after the page loaded, so a #business link does not land on it by itself: bring it into view
    try { if (ctx.win.location && ctx.win.location.hash === '#business' && s.scrollIntoView) s.scrollIntoView(); } catch (e) { /* the card is there anyway */ }
    return st;
  }

  // ---- CONTACT DETAILS (Grok 2026-11-25, option c): an APPROVED business adds an optional phone and website to its own listing. Drawn only while the contact switch is on
  // (window.FMW_CONTACT exists only when site.json "contact" is true); the server (fmw.set_my_contact) validates again and is the authority. Nothing is sent that fails the same checks here.
  function contactCard(doc, box, ctx) {
    var win = ctx.win, S = win.FMW_CONTACT, U = win.FMW_CONTACT_UTIL;
    if (!S || !U) return null;
    var s = card(doc, T.ccTitle, 'contact'); s.appendChild(el(doc, 'p', 'muted', T.ccIntro));
    var pl = el(doc, 'label', null, T.ccPhone), pi = el(doc, 'input'), wl = el(doc, 'label', null, T.ccWebsite), wi = el(doc, 'input'), hint = el(doc, 'p', 'muted', T.ccWebsiteHint);
    pi.id = 'cc-phone'; pl.htmlFor = 'cc-phone'; pi.type = 'tel'; pi.setAttribute('autocomplete', 'tel'); pi.setAttribute('data-act', 'contact-phone');
    wi.id = 'cc-website'; wl.htmlFor = 'cc-website'; wi.type = 'text'; wi.setAttribute('inputmode', 'url'); wi.setAttribute('autocomplete', 'url'); wi.setAttribute('data-act', 'contact-website'); wi.setAttribute('aria-describedby', 'cc-hint'); hint.id = 'cc-hint';
    var save = el(doc, 'button', 'btn', T.ccSave), msg = el(doc, 'p', 'muted', T.ccLoading); save.type = 'button'; save.setAttribute('data-act', 'contact-save'); save.disabled = true; msg.setAttribute('role', 'status'); msg.setAttribute('data-act', 'contact-msg');
    [pl, pi, wl, wi, hint, save, msg].forEach(function (n) { s.appendChild(n); }); box.appendChild(s);
    Promise.resolve(S.mine(ctx.token)).then(function (r) {   // fill the form with what is saved (nothing is shown for an empty field)
      if (r && r.ok && r.data) { pi.value = r.data.phone || ''; wi.value = r.data.website || ''; }
      msg.textContent = ''; save.disabled = false;
    }, function () { msg.textContent = ''; save.disabled = false; });
    save.addEventListener('click', function () {
      var p = U.cleanPhone(pi.value), w = U.cleanWebsite(wi.value);
      if (p === null) { msg.textContent = T.ccBadPhone; return; }
      if (w === null) { msg.textContent = T.ccBadWeb; return; }
      save.disabled = true; msg.textContent = '';
      Promise.resolve(S.save(ctx.token, pi.value, wi.value)).then(function (r) {
        if (r && r.ok && r.data) { pi.value = r.data.phone || ''; wi.value = r.data.website || ''; msg.textContent = T.ccSaved; } else msg.textContent = T.ccFail;
        save.disabled = false;
      }, function () { msg.textContent = T.ccFail; save.disabled = false; });
    });
    return 'contact';
  }

  // ---- OPENING HOURS (Joe/Grok 2026-11-25): an APPROVED business adds its own weekly hours (and an optional note). Drawn only while the hours switch is on (window.FMW_HOURS exists only when site.json
  // "hours" is true). The server (fmw.set_my_hours) validates again and is the authority; nothing is sent that fails the same checks here. A day left unticked is closed.
  function hoursCard(doc, box, ctx) {
    var win = ctx.win, S = win.FMW_HOURS, U = win.FMW_HOURS_UTIL;
    if (!S || !U) return null;
    var s = card(doc, T.hrTitle, 'hours'); s.appendChild(el(doc, 'p', 'muted', T.hrIntro));
    var rows = {};
    U.DAYS.forEach(function (d) {
      var row = el(doc, 'div', 'hours-row'), on = el(doc, 'input'), ol = el(doc, 'label', null, T.hrDays[d] + ': ' + T.hrOpen), a = el(doc, 'input'), al = el(doc, 'label', 'sr', T.hrDays[d] + ' ' + T.hrFrom), z = el(doc, 'input'), zl = el(doc, 'label', 'sr', T.hrDays[d] + ' ' + T.hrTo);
      on.type = 'checkbox'; on.id = 'hr-on-' + d; ol.htmlFor = on.id; on.setAttribute('data-act', 'hours-on-' + d);
      a.type = 'time'; a.id = 'hr-from-' + d; al.htmlFor = a.id; a.setAttribute('data-act', 'hours-from-' + d); a.setAttribute('step', '900');
      z.type = 'time'; z.id = 'hr-to-' + d; zl.htmlFor = z.id; z.setAttribute('data-act', 'hours-to-' + d); z.setAttribute('step', '900');
      [on, ol, al, a, el(doc, 'span', 'hours-to', 'to'), zl, z].forEach(function (n) { row.appendChild(n); }); s.appendChild(row); rows[d] = { on: on, a: a, z: z };
    });
    var nl = el(doc, 'label', null, T.hrNote), ni = el(doc, 'input'), save = el(doc, 'button', 'btn', T.hrSave), msg = el(doc, 'p', 'muted', T.hrLoading);
    ni.id = 'hr-note'; nl.htmlFor = 'hr-note'; ni.type = 'text'; ni.setAttribute('maxlength', '140'); ni.setAttribute('data-act', 'hours-note');
    save.type = 'button'; save.setAttribute('data-act', 'hours-save'); save.disabled = true; msg.setAttribute('role', 'status'); msg.setAttribute('data-act', 'hours-msg');
    [nl, ni, save, msg].forEach(function (n) { s.appendChild(n); }); box.appendChild(s);
    function fill(data) {
      var wk = data && U.cleanWeek(data.hours);
      U.DAYS.forEach(function (d) { var r = wk && wk[d] && wk[d][0]; rows[d].on.checked = !!r; rows[d].a.value = r ? r[0] : ''; rows[d].z.value = r ? r[1] : ''; });
      ni.value = (data && U.cleanNote(data.note)) || '';
    }
    Promise.resolve(S.mine(ctx.token)).then(function (r) { if (r && r.ok && r.data) fill(r.data); msg.textContent = ''; save.disabled = false; }, function () { msg.textContent = ''; save.disabled = false; });
    save.addEventListener('click', function () {
      var week = {};
      for (var i = 0; i < U.DAYS.length; i++) {
        var d = U.DAYS[i], r = rows[d];
        week[d] = r.on.checked ? [[r.a.value, r.z.value]] : [];
      }
      if (U.cleanWeek(week) === false) { msg.textContent = T.hrBad; return; }
      if (U.cleanNote(ni.value) === null) { msg.textContent = T.hrBadNote; return; }
      save.disabled = true; msg.textContent = '';
      Promise.resolve(S.save(ctx.token, week, ni.value)).then(function (r) {
        if (r && r.ok && r.data) { fill(r.data); msg.textContent = T.hrSaved; } else msg.textContent = T.hrFail;
        save.disabled = false;
      }, function () { msg.textContent = T.hrFail; save.disabled = false; });
    });
    return 'hours';
  }

  // ---- customer
  function savedCard(doc, box, ctx) {
    var win = ctx.win, on = win.FMW_CONFIG && win.FMW_CONFIG.favorites === true;
    if (on && win.FMW_FAVORITES && win.FMW_FAVORITES.mountList) { win.FMW_FAVORITES.mountList(doc, box, { win: win }); return 'list'; }
    var s = card(doc, T.savedTitle, 'saved-soon'); s.appendChild(el(doc, 'p', 'muted', T.savedSoon)); box.appendChild(s); return 'soon';
  }

  // ---- both: Download / Delete (flag-gated; the server functions do not exist yet)
  function authFetch(ctx, path, extraHeaders) {
    var cfg = ctx.win.FMW_CONFIG && ctx.win.FMW_CONFIG.authProject, f = ctx.win.fetch && ctx.win.fetch.bind(ctx.win);
    if (!cfg || !cfg.url || !cfg.anonKey || !f) return Promise.resolve(null);
    var h = Object.assign({ 'Content-Type': 'application/json', apikey: cfg.anonKey, Authorization: 'Bearer ' + ctx.token }, extraHeaders || {});
    return f(cfg.url + path, { method: 'POST', headers: h, body: '{}' }).then(function (r) { return r; }, function () { return null; });
  }
  function exportCall(ctx) { return authFetch(ctx, '/rest/v1/rpc/export_my_data', { 'Content-Profile': 'fmw' }); }   // fmw.export_my_data(): the caller's own rows, read-only
  function deleteCall(ctx) { return authFetch(ctx, '/rest/v1/rpc/delete_my_data', { 'Content-Profile': 'fmw' }); }    // fmw.delete_my_data(): Find My Weed rows only; the shared login only for an FMW-only account
  function dataCard(doc, box, ctx) {
    var win = ctx.win, on = win.FMW_CONFIG && win.FMW_CONFIG.accountData === true;
    var s = card(doc, T.dataTitle, on ? 'data' : 'data-soon');
    var dl = el(doc, 'button', 'btn ghost', T.download), del = el(doc, 'button', 'btn ghost', T.del), msg = el(doc, 'p', 'muted', ''); msg.setAttribute('role', 'status');
    dl.type = 'button'; del.type = 'button'; dl.setAttribute('data-act', 'download'); del.setAttribute('data-act', 'delete');
    var row = el(doc, 'div', 'actions'); row.appendChild(dl); row.appendChild(del); s.appendChild(row); s.appendChild(msg); box.appendChild(s);
    if (!on) { dl.disabled = true; del.disabled = true; msg.textContent = T.dataSoon; return 'soon'; }
    dl.addEventListener('click', function () {
      dl.disabled = true; msg.textContent = T.downloading;
      exportCall(ctx).then(function (r) { return r && r.ok ? r.json() : null; }).then(function (j) {
        if (j == null) { msg.textContent = T.downloadFail; dl.disabled = false; return; }
        try {
          var blob = new win.Blob([JSON.stringify(j, null, 2)], { type: 'application/json' }), a = el(doc, 'a'); a.href = win.URL.createObjectURL(blob); a.download = 'find-my-weed-data.json';
          a.click(); if (win.URL.revokeObjectURL) win.URL.revokeObjectURL(a.href); msg.textContent = T.downloaded;
        } catch (e) { msg.textContent = T.downloadFail; }
        dl.disabled = false;
      }, function () { msg.textContent = T.downloadFail; dl.disabled = false; });
    });
    del.addEventListener('click', function () {   // two steps: nothing is deleted by one click
      del.disabled = true; dl.disabled = true; msg.textContent = T.delWarn;
      var yes = el(doc, 'button', 'btn', T.delSure), no = el(doc, 'button', 'btn ghost', T.delCancel); yes.type = 'button'; no.type = 'button'; yes.setAttribute('data-act', 'delete-confirm'); no.setAttribute('data-act', 'delete-cancel');
      var r2 = el(doc, 'div', 'actions'); r2.appendChild(yes); r2.appendChild(no); s.appendChild(r2);
      no.addEventListener('click', function () { s.removeChild(r2); msg.textContent = ''; del.disabled = false; dl.disabled = false; });
      yes.addEventListener('click', function () {
        yes.disabled = true; no.disabled = true; msg.textContent = T.deleting;
        deleteCall(ctx).then(function (r) {
          if (r && r.ok) {
            Promise.resolve(r.json ? r.json() : null).then(function (j) { return j; }, function () { return null; }).then(function (j) {
              var text = j && j.login_deleted === false ? T.deletedData : T.deleted;   // a member of our other sites keeps the shared login: say so
              if (ctx.onDeleted) ctx.onDeleted(text); else msg.textContent = text;
            });
            return;
          }
          msg.textContent = T.deleteFail; s.removeChild(r2); del.disabled = false; dl.disabled = false;
        });
      });
    });
    return 'on';
  }

  // ctx: { win, token, claims, onKind(label), onDeleted(msg) }. Resolves { kind: 'business' (server-approved only) | 'customer' | 'unverified-business', known, license: 'approved' | 'pending' | 'not_verified' | null } once the server has answered.
  function mount(doc, box, ctx) {
    var win = ctx.win, AUTH = win.FMW_AUTH, claimBiz = !!(ctx.claims && ctx.claims.user_metadata && ctx.claims.user_metadata.kind === 'business');
    var holder = el(doc, 'div'); box.appendChild(holder);
    var ask = AUTH && typeof AUTH.myAccount === 'function' ? Promise.resolve(AUTH.myAccount(ctx.token)).then(function (r) { return r || { known: false }; }, function () { return { known: false }; }) : Promise.resolve({ known: false });
    // a signed-in login that is not a member yet (it was created in another of our apps, then signed in here for the first time): ask the server to make it a customer member ONCE, then read again
    if (AUTH && typeof AUTH.joinAccount === 'function') ask = ask.then(function (acct) {
      if (acct.known) return acct;
      return Promise.resolve(AUTH.joinAccount(ctx.token)).then(function (j) { return j && j.joined === true ? AUTH.myAccount(ctx.token) : acct; }, function () { return acct; }).then(function (r) { return r || { known: false }; }, function () { return acct; });
    });
    return ask.then(function (acct) {
      var out = { known: !!acct.known, kind: 'customer', license: null, saved: null, data: null };
      if (acct.known && acct.state && acct.state !== 'none') { out.kind = acct.state === 'approved' ? 'business' : 'customer'; out.license = businessCard(doc, holder, ctx, acct); checklistCard(doc, holder, ctx, acct); if (acct.state === 'approved') { out.contact = contactCard(doc, holder, ctx); out.hours = hoursCard(doc, holder, ctx); } }   // a business in ANY state (pending, not verified, approved) sees no Saved listings card (Grok 2026-11-25: pending matches approved)
      else if (acct.known) {
        out.saved = savedCard(doc, holder, ctx);
        if (claimBiz) { var n = card(doc, T.bizTitle, 'business-unchecked'); n.appendChild(el(doc, 'p', 'muted', T.bizNone)); holder.appendChild(n); }   // said business at sign-up, nothing recorded: no business-only content
      } else {   // the server could not be asked (or the function is not applied yet): nothing business-only; a customer still gets the customer cards
        if (!claimBiz) out.saved = savedCard(doc, holder, ctx);
        out.kind = claimBiz ? 'unverified-business' : 'customer';   // only a LABEL, from the claim
      }
      out.data = dataCard(doc, holder, ctx);
      if (ctx.onKind) ctx.onKind(out.kind === 'customer' && !(out.license) ? 'Customer' : 'Business');
      return out;
    });
  }
  var api = { T: T, mount: mount, checklist: checklist, expiryText: expiryText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FMW_ACCOUNT_CARDS = api;
})(this);
