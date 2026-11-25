// FMW_AUTH: the sign-up back end client (loaded by signup.html only; inert while site.json "accounts" is false, which
// stays so until the host site's shell guard is live). Plain fetch to the project's Auth REST API and the fmw-check-license function: no library, no
// secret (the anon key is public). EVERY sign-up is tagged user_metadata.app = 'findmyweed', so the database gives it no
// host-site member row (migration 20261123010000_fmw_signup) and the host site never claims a profile for it.
(function (root) {
  var APP = 'findmyweed';
  function make(cfg, fetchFn) {
    var url = cfg && cfg.url, key = cfg && cfg.anonKey;
    if (!url || !key) return null;
    var base = { 'Content-Type': 'application/json', apikey: key };
    return {
      APP: APP,
      // email-first sign-in link; meta = { kind: 'customer' | 'business', medical_only: boolean, license?, legal_name? }. A
      // business's license number + legal name ride along (account metadata) so that, once the emailed link signs them in,
      // the license is checked AGAIN with their own token and the verified result is recorded against THEIR user id.
      requestSignIn: function (email, meta, redirectTo) {
        var data = { app: APP, kind: meta && meta.kind === 'business' ? 'business' : 'customer', medical_only: !!(meta && meta.medical_only) };
        if (data.kind === 'business' && meta.license) { data.license = String(meta.license).slice(0, 40); data.legal_name = String(meta.legal_name || '').slice(0, 200); }
        return fetchFn(url + '/auth/v1/otp' + (redirectTo ? '?redirect_to=' + encodeURIComponent(redirectTo) : ''), {
          method: 'POST', headers: base, body: JSON.stringify({ email: String(email), create_user: true, data: data })
        }).then(function (r) { return { ok: !!(r && r.ok) }; });
      },
      // the signed-in user's access token, from the sign-in link's return (#access_token=...), else null
      token: function () {
        try { var m = /[#&]access_token=([^&]+)/.exec((root.location && root.location.hash) || ''); return m ? decodeURIComponent(m[1]) : null; } catch (e) { return null; }
      },
      // the whole session from the emailed link's return (#access_token=...&refresh_token=...&expires_in=...), or null
      session: function () {
        try {
          var h = (root.location && root.location.hash) || '', get = function (k) { var m = new RegExp('[#&]' + k + '=([^&]+)').exec(h); return m ? decodeURIComponent(m[1]) : null; };
          var a = get('access_token'); if (!a) return null;
          var n = Number(get('expires_in'));
          return { access: a, refresh: get('refresh_token'), expiresIn: isFinite(n) && n > 0 ? n : null };
        } catch (e) { return null; }
      },
      // the server-side license check: with the user's token when signed in (the result is recorded), else the public key
      verifyLicense: function (token, d) {
        var h = Object.assign({}, base, { Authorization: 'Bearer ' + (token || key) });
        return fetchFn(url + '/functions/v1/fmw-check-license', { method: 'POST', headers: h,
          body: JSON.stringify({ license: d.licenseNumber, legal_name: d.legalName, category: d.category }) })
          .then(function (r) { return r.ok ? r.json() : { result: 'flagged' }; })
          .then(function (j) { return { status: j && j.result === 'verified' ? 'verified' : j && j.result === 'not_found' ? 'not_found' : 'flagged' }; },
                function () { return { status: 'flagged' }; });
      },
      // what the SERVER knows about this account (rpc fmw.my_account, migration 20261124020000): whether it is a business is decided there (a verified + live license check AND
      // a staff approval of the claim; state none | not_verified | pending | approved), never from the client's sign-up "kind". { known: false } when there is no token, the call fails, or the function
      // is not applied yet (the account page then shows nothing business-only).
      myAccount: function (token) {
        if (!token) return Promise.resolve({ known: false });
        var h = Object.assign({}, base, { Authorization: 'Bearer ' + token, 'Content-Profile': 'fmw' });
        return fetchFn(url + '/rest/v1/rpc/my_account', { method: 'POST', headers: h, body: '{}' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) {
            if (!j || j.signed_in !== true) return { known: false };
            var l = j.license && typeof j.license === 'object' ? j.license : null, st = ['none', 'not_verified', 'pending', 'approved'].indexOf(j.business_state) >= 0 ? j.business_state : 'none';
            return { known: true, business: j.business === true && st === 'approved', state: j.business === true && st === 'approved' ? 'approved' : st === 'approved' ? 'pending' : st, emailConfirmed: j.email_confirmed === true,
              license: l ? { number: String(l.number || ''), legalName: String(l.legal_name || ''), checked: String(l.checked || ''), live: l.live === true } : null };
          }, function () { return { known: false }; });
      },
      // first Find My Weed sign-in of a login that was NOT created here (one made in another of our apps): the server-owned join (rpc fmw.join_my_account, migration 20261124050000) makes
      // them a customer member. Nothing is sent: the server reads the caller from the token. { joined: true } only when it created the row; any failure is { joined: false }.
      joinAccount: function (token) {
        if (!token) return Promise.resolve({ joined: false });
        var h = Object.assign({}, base, { Authorization: 'Bearer ' + token, 'Content-Profile': 'fmw' });
        return fetchFn(url + '/rest/v1/rpc/join_my_account', { method: 'POST', headers: h, body: '{}' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) { return { joined: !!j && j.joined === true }; }, function () { return { joined: false }; });
      },
      // business pricing: ONLY from the server (rpc fmw.business_pricing, migration 20261123030000), which answers with prices
      // only for a signed-in FMW user with a confirmed email AND a verified license recorded for them. No token: no call.
      pricing: function (token) {
        if (!token) return Promise.resolve({ allowed: false, reason: 'signin' });
        var h = Object.assign({}, base, { Authorization: 'Bearer ' + token, 'Content-Profile': 'fmw' });
        return fetchFn(url + '/rest/v1/rpc/business_pricing', { method: 'POST', headers: h, body: '{}' })
          .then(function (r) { return r.ok ? r.json() : { allowed: false, reason: 'error' }; })
          .then(function (j) { return j && j.allowed === true && j.pricing ? { allowed: true, pricing: j.pricing } : { allowed: false, reason: (j && j.reason) || 'error' }; },
                function () { return { allowed: false, reason: 'error' }; });
      }
    };
  }
  var api = { make: make, APP: APP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FMW_AUTH = make(root.FMW_CONFIG && root.FMW_CONFIG.authProject, root.fetch && root.fetch.bind(root));
})(this);
