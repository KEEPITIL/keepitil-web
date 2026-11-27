// Find My Weed sign up / sign in: FRONT END ONLY (draft). Runs on signup.html.
// - Inert unless site.json "accounts" is true (js/site-config.js). Off: the page only says accounts are coming soon.
//   "claims" true (needs accounts) adds the business path. Both default to false.
// - The FIRST choice is Customer or Business; each path shows only its own words (js/signup-copy.js: customer / business /
//   shared), so customers never see business pricing or pitch, and businesses never see the customer material.
// - Business is LICENSE FIRST: age (21+), then the license details, checked by the server. NO price or payment link is in any
//   file this page loads (owner 2026-11-22: "keep it public to verified business owners only"; "they need business license
//   and verified email"). A verified license says "License verified. Confirm your email to see pricing" and goes on to the
//   email step (the license number + legal name ride along in the sign-up metadata). Back from the emailed link, the license
//   is checked AGAIN with the user's own token (so the verified result is recorded for THAT account), then the server's
//   fmw.business_pricing() answers: prices + payment links only for a confirmed email AND a verified license; anything
//   else shows no prices. Flagged / not found / pending show no prices either. Without the back end the stub says pending.
// - Eligibility at signup: 21+; 18 to 20 only with a valid medical cannabis recommendation or medical ID card, and then a
//   MEDICAL-ONLY account; under 18 never gets an account. Business accounts: 21+.
// - The theme picker (light / dark, through js/theme.js) is the LAST step.
// - NO network and NO storage here: no fetch, XMLHttpRequest, beacon or socket, nothing written to storage or cookies. The
//   date of birth and email stay in the form fields and are dropped when the step changes. The only thing kept is the light /
//   dark choice, by js/theme.js, as the existing Dark mode toggle already does. Finishing says accounts are coming soon.
// Text goes in with textContent only. The pure rules are exported for node tests (tests/signup.test.js).
(function (root) {
  'use strict';
  var TZ = 'America/Los_Angeles';   // every listing is in California: the age check uses California's date

  // Today's date in California as { y, m, d }.
  function todayParts(now) {
    var s = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now || new Date());
    return parseDate(s);
  }
  // "YYYY-MM-DD" (what <input type=date> gives) -> { y, m, d }, or null for anything that is not a real calendar date.
  function parseDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s == null ? '' : s).trim());
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3], t = new Date(Date.UTC(y, mo - 1, d));
    if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
    return { y: y, m: mo, d: d };
  }
  // Whole years from dob to today (a birthday counts from that day; 29 Feb counts from 1 Mar in other years).
  function ageOn(dob, today) {
    var a = today.y - dob.y;
    if (today.m < dob.m || (today.m === dob.m && today.d < dob.d)) a--;
    return a;
  }
  function ageOf(dobStr, now) {
    var dob = parseDate(dobStr), t = todayParts(now);
    if (!dob) return null;
    var a = ageOn(dob, t);
    return a < 0 || a > 120 ? null : a;
  }
  // The signup rule. Returns { ok: true, cls: 'adult_21' | 'medical_18_20' } or { ok: false, reason, stop }.
  // stop: true = no account on this path (nothing more to ask); stop: false = fix the answer and try again.
  function eligibility(dobStr, medical, audience, now) {
    if (!String(dobStr == null ? '' : dobStr).trim()) return { ok: false, reason: 'dob-missing', stop: false };
    var a = ageOf(dobStr, now);
    if (a === null) return { ok: false, reason: 'dob-invalid', stop: false };
    if (a < 18) return { ok: false, reason: 'under-18', stop: true };
    if (audience === 'business') return a >= 21 ? { ok: true, cls: 'adult_21' } : { ok: false, reason: 'business-under-21', stop: true };
    if (a >= 21) return { ok: true, cls: 'adult_21' };
    return medical === true ? { ok: true, cls: 'medical_18_20' } : { ok: false, reason: 'need-medical', stop: false };
  }
  // Ask the medical question only of customers aged 18 to 20.
  function asksMedical(dobStr, audience, now) { var a = ageOf(dobStr, now); return audience !== 'business' && a !== null && a >= 18 && a < 21; }
  // The steps of a path, in order. The theme picker is always LAST on sign up. "choose" only when there are two audiences.
  // preset: the audience was picked before the page opened (List Your Business -> ?as=business), so the choose screen is never shown and
  // is not counted: the first screen the visitor sees is step 1.
  function steps(mode, twoAudiences, audience, preset) {
    var s = twoAudiences && !preset ? ['choose', 'start'] : ['start'];
    if (mode === 'signin') return s.concat(['signin']);
    if (mode !== 'signup') return s;
    var mid = audience === 'business' ? ['license'] : [];
    return s.concat(['eligibility'], mid, ['email', 'theme']);
  }
  // A state license number as the state record writes it, e.g. C10-0000123-LIC (format only; the record check is the back end's).
  function licenseOk(s) { return /^[A-Z]{1,4}\d{0,2}-\d{7}-LIC$/.test(String(s == null ? '' : s).trim().toUpperCase()); }
  function phoneOk(s) { s = String(s == null ? '' : s).replace(/[\s().+-]/g, ''); return s === '' || /^1?\d{10}$/.test(s); }
  // The license check is NOT wired: this stub is the only verifier the page uses, and it always answers "pending".
  function verifyStub() { return { status: 'pending' }; }
  // The emailed link's return, from the URL hash: { ok: true, kind, token[, license, legalName] } when it carries a session
  // (#access_token=...), { ok: false } when the project answered with an error (#error=... / #error_code=..., e.g. an expired
  // or used link), else null. kind / license / legalName are read from the token's own claims (user_metadata) for the wording
  // and as the INPUT of the server's re-check only; the server decides. The token is kept in memory only, never stored.
  // Where the "signed in" step sends the visitor (2026-11-24, option b): always the fixed page account.html. Behind FMW_CONFIG.favorites, a valid
  // listing slug in this page's own query (?save=<id>, kept by the emailed link's return address) rides along as account.html?save=<id>, where the
  // visible confirm does the save. The slug rule is js/save-id.js (shared with the account and listing pages); anything else is plain account.html.
  function sid() { return root.FMW_SAVEID || (typeof require === 'function' ? require('./save-id.js') : null); }
  function returnHref(search, cfg) {
    var S = sid(), v = S ? S.fromSearch(search, cfg) : '';
    return v ? 'account.html?save=' + encodeURIComponent(v) : 'account.html';
  }
  // The address the emailed link returns to (redirect_to): this page WITHOUT its query string or hash, plus only what the return needs: mode=signin,
  // as=business when the visitor came that way, and a valid save slug. No other query (tracking, decoys, anything unvalidated) rides in the email.
  function signInReturn(loc, cfg, business) {
    var base = String((loc && loc.href) || '').split('#')[0].split('?')[0], q = ['mode=signin'], S = sid(), v = S ? S.fromSearch((loc && loc.search) || '', cfg) : '';
    if (business) q.unshift('as=business');
    if (v) q.push('save=' + encodeURIComponent(v));
    return base + '?' + q.join('&');
  }
  function linkReturn(hash) {
    var h = String(hash == null ? '' : hash).replace(/^#/, '');
    if (!h) return null;
    var q = {};
    h.split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) { try { q[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' ')); } catch (e) { /* skip a bad pair */ } } });
    if (q.error || q.error_code) return { ok: false, code: q.error_code || q.error };
    if (!q.access_token) return null;
    var out = { ok: true, kind: 'customer', token: q.access_token };
    try {
      var part = q.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      var claims = JSON.parse(typeof atob === 'function' ? atob(part + '==='.slice((part.length + 3) % 4)) : Buffer.from(part, 'base64').toString());
      var md = (claims && claims.user_metadata) || {};
      if (md.kind === 'business') {
        out.kind = 'business';
        if (licenseOk(md.license)) { out.license = String(md.license).trim().toUpperCase(); out.legalName = String(md.legal_name || ''); }
      }
    } catch (e) { /* not a readable token: the neutral wording */ }
    return out;
  }
  function emailOk(s) { s = String(s == null ? '' : s).trim(); return s.length <= 254 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(s); }

  // ------------------------------------------------------------------------------------------------ the page
  function app(doc, win, opts) {
    var CFG = win.FMW_CONFIG || {}, SC = win.FMW_SIGNUP_COPY, S = SC.shared;
    // THE back-end seam: site.json "authProject" (null today) names the owner's chosen project (option A or B). Only with it set
    // AND an auth module loaded (window.FMW_AUTH, the auth PR) does a real license check run; otherwise the stub (pending).
    var AUTH = CFG.authProject && win.FMW_AUTH && typeof win.FMW_AUTH.verifyLicense === 'function' ? win.FMW_AUTH : null;
    // the server check is async (a Promise); the stub and test verifiers answer at once. Both go through ONE handler.
    var backend = AUTH ? function (d) { return AUTH.verifyLicense(AUTH.token ? AUTH.token() : null, d); } : null;
    var verify = (opts && opts.verify) || backend || verifyStub;   // node tests pass a verifier; the page has none today
    var box = doc.getElementById('signup'), title = doc.getElementById('signup-title'), prog = doc.getElementById('signup-step');
    if (!box || !title) return null;
    var accounts = CFG.accounts === true, business = accounts && CFG.claims === true;
    var st = { audience: business ? null : 'customer', mode: null, step: null, cls: null, unlocked: false, lic: null, preset: false };
    var wanted = /(?:^|[?&])as=business(?:&|$)/.test((win.location && win.location.search) || '');
    // the menu's "Sign in" (signup.html?mode=signin) opens the sign-in path, not the sign-up one
    var wantSignin = /(?:^|[?&])mode=signin(?:&|$)/.test((win.location && win.location.search) || '');
    // back from the emailed link: the project's Auth puts the session (#access_token=...) or the error (#error_code=...) in the
    // URL hash. Read once here, then drop it from the address bar and history (a token must never stay in a URL).
    var ret = linkReturn((win.location && win.location.hash) || '');

    function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
    function W() { return SC[st.audience] || {}; }   // the chosen audience's words ONLY
    function button(text, act, cls, type) { var b = el('button', cls || 'btn', text); b.type = type || 'button'; b.setAttribute('data-act', act); return b; }
    function backLink() { var a = el('a', 'btn ghost', S.backToSearch); a.href = 'index.html'; return a; }
    function head(text, stepIdx) {
      title.textContent = text;
      if (prog) { prog.textContent = stepIdx ? S.step(stepIdx, path().length) : ''; prog.hidden = !stepIdx; }
    }
    function focusTitle() { if (title.focus) title.focus(); }
    function path() { return steps(st.mode || 'signup', business, st.audience, st.preset); }   // before Sign up / Sign in is picked, count the sign-up path
    function idx(step) { return path().indexOf(step) + 1; }
    function go(step) { st.step = step; render(); focusTitle(); }
    function back() {
      var all = path(), prev = all[all.indexOf(st.step) - 1] || 'start';
      if (prev === 'start' || prev === 'choose') { st.mode = null; st.cls = null; }   // back to the start forgets the path taken
      if (prev === 'choose') st.audience = null;
      go(prev);
    }
    function actions() { var a = el('div', 'actions'); for (var i = 0; i < arguments.length; i++) a.appendChild(arguments[i]); return a; }
    function form(onSubmit) {
      var f = el('form', 'signup-form');
      f.setAttribute('method', 'post');   // never a GET: nothing typed can end up in a URL
      f.setAttribute('novalidate', '');
      f.addEventListener('submit', function (e) { e.preventDefault(); onSubmit(); });
      return f;
    }
    function field(label, hint, input) {
      var l = el('label', 'field'); l.appendChild(el('span', null, label)); l.appendChild(input);
      if (hint) l.appendChild(el('span', 'hint', hint));
      return l;
    }
    function select(name, options) {
      var sel = el('select'); sel.name = name;
      var o0 = el('option', null, SC.business.pick); o0.value = ''; sel.appendChild(o0);
      options.forEach(function (x) { var o = el('option', null, x); o.value = x; sel.appendChild(o); });
      return sel;
    }
    function input(type, name, auto) { var i = el('input'); i.type = type; i.name = name; if (auto) i.setAttribute('autocomplete', auto); return i; }
    function errorLine() { var p = el('p', 'form-error'); p.setAttribute('role', 'alert'); return p; }
    function stop(name, t, body) {   // the end of this path: no account
      st.step = 'stopped'; clear(box); head(t, 0); box.setAttribute('data-step', 'stopped');
      var s = el('div', 'state error'); s.setAttribute('role', 'alert'); s.setAttribute('data-state', name);
      s.appendChild(el('p', null, body)); s.appendChild(backLink()); box.appendChild(s); focusTitle();
    }
    function ended(step, name, t, body) {   // an end state that is not an error (pending / flagged verification)
      st.step = step; clear(box); head(t, 0); box.setAttribute('data-step', step);
      var s = el('div', 'state info'); s.setAttribute('role', 'status'); s.setAttribute('data-state', name);
      s.appendChild(el('p', null, body)); s.appendChild(backLink()); box.appendChild(s); focusTitle();
    }
    function done() {   // the end: with a back end the sign-in link went out (email / sign-in step); without one nothing is sent or kept
      st.step = 'done'; clear(box); head(AUTH ? S.sentTitle : S.soonTitle, 0); box.setAttribute('data-step', 'done');
      var s = el('div', 'state info'); s.setAttribute('role', 'status'); s.setAttribute('data-state', AUTH ? 'link-sent' : 'coming-soon');
      if (st.audience === 'business' && st.unlocked) {   // after a verified license: open the link, then the pricing shows
        s.appendChild(el('h2', null, W().nextTitle));
        var ol = el('ol', 'claim-steps'); W().nextSteps.forEach(function (x) { ol.appendChild(el('li', null, x)); }); s.appendChild(ol);
      }
      s.appendChild(el('p', null, AUTH ? S.sentBody : S.soonBody));
      if (AUTH && st.audience === 'business' && st.unlocked) s.appendChild(el('p', null, W().sentBusiness));
      if (st.mode === 'signup') s.appendChild(el('p', null, S.soonTheme));
      s.appendChild(backLink()); box.appendChild(s); focusTitle();
    }

    // ONE sender for both email steps. No back end: straight on (nothing is sent). With one: the submit button is disabled
    // while the request is out; only an accepted request moves on; a refused one (rate limit, bad address) or a network
    // failure shows S.sendFailed and lets the visitor try again.
    function send(f, err, email, meta, next) {
      if (!(AUTH && AUTH.requestSignIn)) return next();
      var btn = f.querySelector ? f.querySelector('[data-act="continue"]') : null;
      if (btn) btn.disabled = true;
      err.textContent = '';
      var fail = function () { if (btn) btn.disabled = false; err.textContent = S.sendFailed; err.setAttribute('data-reason', 'send-failed'); };
      var res;
      try { res = AUTH.requestSignIn(email, meta, signInReturn(win.location, win.FMW_CONFIG, wanted)); } catch (e) { return fail(); }
      return Promise.resolve(res).then(function (r) { if (r && r.ok) next(); else fail(); }, fail);
    }
    function cleanUrl() { var l = win.location || {}; return String(l.href || '').split('#')[0]; }

    // Back from the emailed link as a business: re-check the license with the user's OWN token (records it for this account),
    // then ask the server for pricing. Only { allowed: true } from fmw.business_pricing() shows prices and payment links.
    function loadPricing(si) {
      var B = SC.business, tok = ret.token;
      var wait = el('p', 'muted', B.pricingLoading); wait.setAttribute('data-state', 'pricing-loading'); si.appendChild(wait);
      var recheck = ret.license ? Promise.resolve(AUTH.verifyLicense(tok, { licenseNumber: ret.license, legalName: ret.legalName, category: '' })).catch(function () { return null; }) : Promise.resolve(null);
      return recheck.then(function () { return AUTH.pricing(tok); }).then(function (r) { return r || {}; }, function () { return { allowed: false, reason: 'error' }; }).then(function (r) {
        if (wait.parentNode) wait.parentNode.removeChild(wait);
        if (r.allowed === true && r.pricing && Array.isArray(r.pricing.sections)) return showPricing(si, r.pricing);
        var errd = r.reason === 'error', appr = r.reason === 'approval';   // appr: licence checked, the team has not confirmed the claim yet
        var s = el('section', 'card'); s.setAttribute('data-state', errd ? 'pricing-error' : appr ? 'pricing-approval' : 'pricing-locked');
        s.appendChild(el('h2', null, errd ? B.pricingErrorTitle : appr ? B.pricingApprovalTitle : B.pricingLockedTitle)); s.appendChild(el('p', null, errd ? B.pricingErrorBody : appr ? B.pricingApprovalBody : B.pricingLockedBody));
        si.appendChild(s); si.appendChild(backLink());
      });
    }
    function showPricing(si, P) {
      var B = SC.business, s = el('section', 'card pitch pricing'); s.setAttribute('data-state', 'pricing');
      box.setAttribute('data-step', 'pricing');
      s.appendChild(el('h2', null, B.pricingTitle)); s.appendChild(el('p', null, B.pricingIntro));
      P.sections.forEach(function (sec) {
        if (!sec || !Array.isArray(sec.items)) return;
        s.appendChild(el('h3', null, String(sec.title || '')));
        if (sec.intro) s.appendChild(el('p', 'muted', String(sec.intro)));
        var ul = el('ul', 'ranks plans');
        sec.items.forEach(function (it) {
          var li = el('li', 'plan'); li.appendChild(el('strong', null, String(it.name || ''))); li.appendChild(el('span', 'plan-price', ' ' + String(it.price || '')));
          // NO payment links are drawn, whatever the server sends: billing is by invoice (the contact link below)
          if (it.note) li.appendChild(el('p', 'muted', String(it.note)));
          ul.appendChild(li);
        });
        s.appendChild(ul);
      });
      if (/^mailto:[^\s"<>]+$/.test(String(P.contact || ''))) {   // the contact address comes with the pricing (server), mailto only
        var c = el('p', 'muted', B.pricingPay + ' '); var m = el('a', null, B.contact); m.href = P.contact; c.appendChild(m); s.appendChild(c);
      }
      si.appendChild(s); si.appendChild(backLink());
    }

    var VIEWS = {
      choose: function () {
        head(S.chooseTitle, idx('choose'));
        box.appendChild(el('p', 'muted', S.chooseIntro));
        var c = el('div', 'choices');
        [['customer', S.chooseCustomer, S.chooseCustomerHint], ['business', S.chooseBusiness, S.chooseBusinessHint]].forEach(function (x) {
          var b = button(null, x[0], 'choice');
          b.appendChild(el('strong', null, x[1])); b.appendChild(el('span', null, x[2]));
          b.addEventListener('click', function () { st.audience = x[0]; go(st.mode === 'signin' ? 'signin' : 'start'); });
          c.appendChild(b);
        });
        box.appendChild(c);
      },
      start: function () {
        var w = W();
        head(w.startTitle, idx('start'));
        box.appendChild(el('p', 'muted', w.startIntro));
        if (st.audience === 'business') {   // the process only: no plans or prices before a verified license
          var how = el('section', 'card'); how.appendChild(el('h2', null, w.howTitle));
          var ol = el('ol', 'claim-steps'); w.how.forEach(function (x) { ol.appendChild(el('li', null, x)); }); how.appendChild(ol); box.appendChild(how);
        }
        var create = button(w.create, 'create'), signin = button(w.signIn, 'signin', 'btn ghost');
        create.addEventListener('click', function () { st.mode = 'signup'; go('eligibility'); });
        signin.addEventListener('click', function () { st.mode = 'signin'; go('signin'); });
        box.appendChild(actions(create, signin));
        if (business) { var b = button(S.back, 'back', 'btn ghost'); b.addEventListener('click', back); box.appendChild(actions(b)); }
      },
      eligibility: function () {
        var w = W(), aud = st.audience;
        head(w.eligTitle, idx('eligibility'));
        var f = form(submit), err = errorLine();
        f.appendChild(el('p', null, w.eligRule));
        var dob = input('date', 'dob', 'bday');
        dob.setAttribute('max', fmt(todayParts()));
        dob.setAttribute('required', '');
        f.appendChild(field(S.dobLabel, S.dobHint, dob));
        var med = null, medRow = null;
        if (aud === 'customer') {   // the medical question exists on the customer path only, shown for ages 18 to 20
          med = input('checkbox', 'medical'); medRow = el('label', 'check'); medRow.appendChild(med); medRow.appendChild(el('span', null, w.medicalLabel));
          medRow.hidden = true; f.appendChild(medRow);
          var sync = function () { medRow.hidden = !asksMedical(dob.value, aud); if (medRow.hidden) med.checked = false; };
          dob.addEventListener('input', sync); dob.addEventListener('change', sync);
        }
        f.appendChild(err);
        var bk = button(S.back, 'back', 'btn ghost'); bk.addEventListener('click', back);
        f.appendChild(actions(button(S.next, 'continue', 'btn', 'submit'), bk));
        box.appendChild(f);
        function submit() {
          var r = eligibility(dob.value, !!(med && med.checked), aud);
          if (r.ok) { st.cls = r.cls; return go(aud === 'business' ? 'license' : 'email'); }
          if (r.reason === 'under-18') return stop('under-18', S.under18Title, S.under18Body);
          if (r.reason === 'business-under-21') return stop('business-under-21', w.under21Title, w.under21Body);
          if (medRow) medRow.hidden = !asksMedical(dob.value, aud);
          err.textContent = r.reason === 'dob-missing' ? S.dobMissing : r.reason === 'need-medical' ? w.needMedical : S.dobInvalid;
          err.setAttribute('data-reason', r.reason);
        }
      },
      email: function () {
        var w = W();
        head(w.emailTitle, idx('email'));
        var f = form(submit), err = errorLine(), em = input('email', 'email', 'email');
        if (st.cls === 'medical_18_20') { var n = el('p', 'note-line', w.medicalOnly); n.setAttribute('data-state', 'medical-only'); f.appendChild(n); }
        if (st.audience === 'business' && st.unlocked) { var v = el('p', 'note-line', w.verifiedNote); v.setAttribute('data-state', 'license-verified'); f.appendChild(v); }
        f.appendChild(field(S.emailLabel, S.emailHint, em));
        f.appendChild(err);
        var bk = button(S.back, 'back', 'btn ghost'); bk.addEventListener('click', back);
        f.appendChild(actions(button(S.next, 'continue', 'btn', 'submit'), bk));
        box.appendChild(f);
        function submit() {
          if (!emailOk(em.value)) { err.textContent = S.emailBad; return; }
          // with a back end: the email-first sign-in link, ALWAYS tagged app = 'findmyweed' (js/fmw-auth.js) so the
          // account never becomes a member of the host site. Without one: nothing is sent. The next step shows only after
          // the project ACCEPTED the request: a refused or failed send stays here and says so (never a false "check your email").
          var meta = { kind: st.audience === 'business' ? 'business' : 'customer', medical_only: st.cls === 'medical_18_20' };
          if (st.audience === 'business' && st.unlocked && st.lic) { meta.license = st.lic.licenseNumber; meta.legal_name = st.lic.legalName; }
          send(f, err, em.value.trim(), meta, function () { go('theme'); });
        }
      },
      theme: function () {   // ALWAYS the last step; js/theme.js applies and keeps the choice
        head(S.themeTitle, idx('theme'));
        var T = win.FMW_THEME, cur = T && T.current ? T.current() : 'light';
        var f = form(done), fs = el('fieldset', 'theme-pick');
        f.appendChild(el('p', null, S.themeIntro));
        fs.appendChild(el('legend', null, S.themeLegend));
        [['light', S.themeLight], ['dark', S.themeDark]].forEach(function (x) {
          var r = input('radio', 'theme'); r.value = x[0]; r.checked = cur === x[0];
          r.addEventListener('change', function () { if (r.checked && T && T.set) T.set(x[0]); });
          var l = el('label', 'chip'); l.appendChild(r); l.appendChild(el('span', null, x[1])); fs.appendChild(l);
        });
        f.appendChild(fs);
        var bk = button(S.back, 'back', 'btn ghost'); bk.addEventListener('click', back);
        f.appendChild(actions(button(S.finish, 'finish', 'btn', 'submit'), bk));
        box.appendChild(f);
      },
      license: function () {   // business: the license details first
        var w = W();
        head(w.licenseTitle, idx('license'));
        var f = form(submit), err = errorLine();
        f.appendChild(el('p', null, w.licenseIntro));
        var name = input('text', 'legalName', 'organization'), num = input('text', 'licenseNumber', 'off');
        var type = select('licenseType', w.licenseTypes), state = select('licenseState', w.licenseStates);
        var who = input('text', 'contactName', 'name'), role = input('text', 'contactRole', 'organization-title'), tel = input('tel', 'contactPhone', 'tel');
        f.appendChild(field(w.legalName, null, name)); f.appendChild(field(w.licenseNumber, w.licenseNumberHint, num));
        f.appendChild(field(w.licenseType, null, type)); f.appendChild(field(w.licenseState, null, state));
        f.appendChild(field(w.contactName, null, who)); f.appendChild(field(w.contactRole, null, role)); f.appendChild(field(w.contactPhone, null, tel));
        f.appendChild(err);
        var bk = button(S.back, 'back', 'btn ghost'); bk.addEventListener('click', back);
        f.appendChild(actions(button(w.verify, 'continue', 'btn', 'submit'), bk));
        box.appendChild(f);
        function submit() {
          var bad = !name.value.trim() ? w.errLegalName : !licenseOk(num.value) ? w.errLicense : !type.value ? w.errType : !state.value ? w.errState :
            !(who.value.trim() && role.value.trim()) ? w.errContact : !phoneOk(tel.value) ? w.errPhone : '';
          if (bad) { err.textContent = bad; return; }
          var d = { legalName: name.value.trim(), licenseNumber: num.value.trim().toUpperCase(), licenseType: type.value, state: state.value, category: '' };
          var res = verify(d);
          // a verified answer goes on to the email step (still NO prices: they need the confirmed email too, and come from the
          // server); flagged / not found = checked by hand; anything else = pending
          var handle = function (r) {
            r = r || {};
            if (r.status === 'verified') { st.unlocked = true; st.lic = { licenseNumber: d.licenseNumber, legalName: d.legalName }; return go('email'); }
            if (r.status === 'flagged' || r.status === 'not_found') return ended('flagged', 'license-flagged', w.flaggedTitle, w.flaggedBody);
            ended('pending', 'verification-pending', w.pendingTitle, w.pendingBody);   // the stub: always
          };
          if (res && typeof res.then === 'function') { err.textContent = ''; res.then(handle, function () { handle({ status: 'flagged' }); }); }
          else handle(res);
        }
      },
      signin: function () {
        var w = W();
        head(w.signInTitle, idx('signin'));
        var f = form(submit), err = errorLine(), em = input('email', 'email', 'email');
        f.appendChild(field(S.emailLabel, S.emailHint, em));
        f.appendChild(err);
        var bk = button(S.back, 'back', 'btn ghost'); bk.addEventListener('click', back);
        f.appendChild(actions(button(S.sendLink, 'continue', 'btn', 'submit'), bk));
        box.appendChild(f);
        function submit() {
          if (!emailOk(em.value)) { err.textContent = S.emailBad; return; }
          send(f, err, em.value.trim(), { kind: st.audience === 'business' ? 'business' : 'customer' }, done);
        }
      }
    };
    function render() {
      clear(box);
      box.setAttribute('data-step', st.step);
      box.setAttribute('data-audience', st.audience || '');
      VIEWS[st.step]();
    }

    if (!accounts) {   // the switch is OFF: no sign-up UI at all
      head(S.offTitle, 0);
      var off = el('div', 'state info'); off.setAttribute('data-state', 'accounts-off');
      off.appendChild(el('p', null, S.offBody)); off.appendChild(backLink());
      box.setAttribute('data-step', 'off'); box.appendChild(off);
      return st;
    }
    if (ret) {   // back from the emailed link: drop the token / error from the URL, then say where the visitor stands
      // the session is KEPT across tab closes (js/session-store.js: persistent "fmw_session" with the refresh token), for account.html and the header.
      // Without the store or usable storage it falls back to the old per-tab token.
      var tok = ret.ok && AUTH && AUTH.token ? AUTH.token() : null, sess = ret.ok && AUTH && AUTH.session ? AUTH.session() : null, kept = false;
      try { if (sess && win.FMW_SESSION_STORE && win.FMW_SESSION_STORE.save) kept = win.FMW_SESSION_STORE.save(sess.access, sess.refresh, sess.expiresIn); } catch (e) { kept = false; }
      try { if (!kept && tok && win.sessionStorage) win.sessionStorage.setItem('fmw_token', tok); } catch (e) { /* no storage: the account page says signed out */ }
      try { if (win.history && win.history.replaceState) win.history.replaceState(null, '', cleanUrl()); } catch (e) { /* the hash stays; nothing else */ }
      if (ret.ok) {
        st.step = 'signed-in'; clear(box); head(S.inTitle, 0); box.setAttribute('data-step', 'signed-in');
        var si = el('div', 'state info'); si.setAttribute('role', 'status'); si.setAttribute('data-state', 'signed-in');
        si.appendChild(el('p', null, ret.kind === 'business' ? S.inBodyBusiness : S.inBody));
        var acct = el('a', 'btn', S.accountLink); acct.href = returnHref((win.location && win.location.search) || '', win.FMW_CONFIG); si.appendChild(acct);
        box.appendChild(si);
        if (ret.kind === 'business' && business && AUTH && typeof AUTH.pricing === 'function') { st.audience = 'business'; loadPricing(si); }
        else si.appendChild(backLink());
        focusTitle();
        return st;
      }
      st.step = 'link-error'; clear(box); head(S.linkBadTitle, 0); box.setAttribute('data-step', 'link-error');
      var le = el('div', 'state error'); le.setAttribute('role', 'alert'); le.setAttribute('data-state', 'link-error');
      le.appendChild(el('p', null, S.linkBadBody));
      var again = button(S.linkAgain, 'again'); again.addEventListener('click', function () { st.mode = 'signin'; go(st.audience ? 'signin' : 'choose'); });
      le.appendChild(actions(again, backLink())); box.appendChild(le); focusTitle();
      return st;
    }
    if (business && wanted) { st.audience = 'business'; st.preset = true; }   // "List Your Business" opens the business path directly; no choose screen, so it starts at step 1
    if (wantSignin) st.mode = 'signin';
    st.step = st.audience ? (st.mode === 'signin' ? 'signin' : 'start') : 'choose';
    render();
    return st;
  }
  function fmt(t) { var p = function (n) { return (n < 10 ? '0' : '') + n; }; return t.y + '-' + p(t.m) + '-' + p(t.d); }

  var api = { signInReturn: signInReturn, returnHref: returnHref, linkReturn: linkReturn, eligibility: eligibility, asksMedical: asksMedical, steps: steps, emailOk: emailOk, licenseOk: licenseOk, phoneOk: phoneOk, parseDate: parseDate, ageOn: ageOn, todayParts: todayParts };
  if (typeof module !== 'undefined' && module.exports) module.exports = Object.assign({ app: app, verifyStub: verifyStub }, api);
  else {
    root.FMW_SIGNUP = api;   // the pure rules only: the page itself is never handed a verifier
    if (root.document && root.document.getElementById('signup')) app(root.document, root);
  }
})(typeof window !== 'undefined' ? window : globalThis);
