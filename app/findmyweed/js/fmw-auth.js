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
      // email-first sign-in link; meta = { kind: 'customer' | 'business', medical_only: boolean }
      requestSignIn: function (email, meta, redirectTo) {
        var data = { app: APP, kind: meta && meta.kind === 'business' ? 'business' : 'customer', medical_only: !!(meta && meta.medical_only) };
        return fetchFn(url + '/auth/v1/otp' + (redirectTo ? '?redirect_to=' + encodeURIComponent(redirectTo) : ''), {
          method: 'POST', headers: base, body: JSON.stringify({ email: String(email), create_user: true, data: data })
        }).then(function (r) { return { ok: !!(r && r.ok) }; });
      },
      // the signed-in user's access token, from the sign-in link's return (#access_token=...), else null
      token: function () {
        try { var m = /[#&]access_token=([^&]+)/.exec((root.location && root.location.hash) || ''); return m ? decodeURIComponent(m[1]) : null; } catch (e) { return null; }
      },
      // the server-side license check: with the user's token when signed in (the result is recorded), else the public key
      verifyLicense: function (token, d) {
        var h = Object.assign({}, base, { Authorization: 'Bearer ' + (token || key) });
        return fetchFn(url + '/functions/v1/fmw-check-license', { method: 'POST', headers: h,
          body: JSON.stringify({ license: d.licenseNumber, legal_name: d.legalName, category: d.category }) })
          .then(function (r) { return r.ok ? r.json() : { result: 'flagged' }; })
          .then(function (j) { return { status: j && j.result === 'verified' ? 'verified' : j && j.result === 'not_found' ? 'not_found' : 'flagged' }; },
                function () { return { status: 'flagged' }; });
      }
    };
  }
  var api = { make: make, APP: APP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FMW_AUTH = make(root.FMW_CONFIG && root.FMW_CONFIG.authProject, root.fetch && root.fetch.bind(root));
})(this);
