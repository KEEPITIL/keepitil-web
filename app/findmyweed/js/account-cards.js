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
    bizHelp: 'Questions about your license? See the About page.',
    bizNone: 'Your business license check is not on record yet.',
    // PLACEHOLDER WORDING (Grok 2026-11-24): Muse words these two lines, Echo checks them.
    bizPending: 'We\'ll confirm you own this business.', bizPendingHelp: 'Your license was found. Business features open once our team has confirmed the claim.',
    savedTitle: 'Saved listings', savedSoon: 'Saving listings is coming soon.',
    dataTitle: 'Your data', dataSoon: 'Download and delete are coming soon.',
    download: 'Download my data', downloading: 'Preparing your file…', downloaded: 'Your file was downloaded.', downloadFail: 'We could not prepare your file. Nothing was changed. Try again later.',
    del: 'Delete account', delSure: 'Yes, delete my account', delCancel: 'Keep my account', delWarn: 'This deletes your account and its data. It cannot be undone.',
    deleting: 'Deleting…', deleted: 'Your Find My Weed account and its data were deleted.', deletedData: 'Your Find My Weed data was deleted. Your other account was not changed; to delete that too, use the account page there.', deleteFail: 'We could not delete your account. Nothing was changed. Try again later.'
  };
  function el(doc, tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function card(doc, title, state) { var c = el(doc, 'section', 'card'); c.setAttribute('data-state', state); c.appendChild(el(doc, 'h2', null, title)); return c; }

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
    // the card appears after the page loaded, so a #business link does not land on it by itself: bring it into view
    try { if (ctx.win.location && ctx.win.location.hash === '#business' && s.scrollIntoView) s.scrollIntoView(); } catch (e) { /* the card is there anyway */ }
    return st;
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
      if (acct.known && acct.state && acct.state !== 'none') { out.kind = acct.state === 'approved' ? 'business' : 'customer'; out.license = businessCard(doc, holder, ctx, acct); if (acct.state !== 'approved') out.saved = savedCard(doc, holder, ctx); }
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
  var api = { T: T, mount: mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FMW_ACCOUNT_CARDS = api;
})(this);
