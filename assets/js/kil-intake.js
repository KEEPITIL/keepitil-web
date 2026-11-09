/* KEEPITIL /connect services intake form.
 * Renders into <section id="kil-intake"></section>. Submissions go to the EXISTING prod table
 * public.feedback (anonymous INSERT allowed by policy feedback_anon_insert; no read for anon; the
 * team reads it as admin). No DDL, no new function. Row: category 'other', status default 'new',
 * contact = the visitor's email, message = a labelled block starting "[SERVICE INTAKE]".
 * Bots: a hidden honeypot and a minimum time on the page answer like a success and store nothing.
 */
(function (root) {
  'use strict';
  var SUPA_URL = 'https://ovmqtzjfpzrbzrlkxwgw.supabase.co';
  /* Public anon key, the same one the site ships in index.html. */
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ';
  var THANKS = 'Got it — we’ll reply within 48 hours.';
  var NEEDS = [['', 'What do you need?'], ['release-strategy', 'Release strategy'], ['graphics', 'Graphics'], ['lyrics', 'Lyrics'], ['audit', 'Audit'], ['rollout', 'Rollout'], ['other', 'Other']];
  var NEED_LABEL = {}; NEEDS.forEach(function (n) { NEED_LABEL[n[0]] = n[1]; });
  var MIN_MS = 3000, COOLDOWN_MS = 30000, K_LAST = 'kil_intake_last';

  function clip(s, n) { return String(s == null ? '' : s).replace(/\r/g, '').trim().slice(0, n); }
  function validEmail(s) { return typeof s === 'string' && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim()); }
  function validate(f) {
    if (clip(f.name, 100).length < 2) return 'Add your name.';
    if (!validEmail(f.email || '')) return 'Enter an email we can reply to.';
    if (!NEED_LABEL[f.need] || !f.need) return 'Choose what you need.';
    if (clip(f.message, 2000).length < 5) return 'Tell us a little about what you need.';
    return '';
  }
  function buildMessage(f) {
    return ('[SERVICE INTAKE]\n' +
      'Name: ' + clip(f.name, 100) + '\n' +
      'Artist/brand: ' + (clip(f.brand, 120) || '-') + '\n' +
      'Need: ' + NEED_LABEL[f.need] + '\n' +
      'Links: ' + (clip(f.links, 600) || '-') + '\n' +
      'Message: ' + clip(f.message, 2000)).slice(0, 4000);
  }
  function buildRow(f, path) {
    return { category: 'other', message: buildMessage(f), contact: clip(f.email, 254).toLowerCase(), page_url: String(path || '/connect/').slice(0, 200), user_handle: null };
  }
  function submit(fetchFn, f, path) {
    return fetchFn(SUPA_URL + '/rest/v1/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, Prefer: 'return=minimal' },
      body: JSON.stringify(buildRow(f, path))
    }).then(function (r) { return { ok: r.ok }; }, function () { return { ok: false }; });
  }
  /* A bot is a filled honeypot or a form sent faster than a person can type. */
  function isBot(f, elapsedMs) { return !!(f.website && String(f.website).length) || !(elapsedMs >= MIN_MS); }

  var CSS = '#kil-intake{max-width:640px;margin:48px auto 32px;padding:0 16px;color:var(--ink,#f4f2fb)}' +
    '#kil-intake .ki-card{box-sizing:border-box;background:var(--panel,rgba(255,255,255,.035));border:1px solid var(--panel-brd,rgba(255,255,255,.09));border-radius:16px;padding:22px 18px}' +
    '#kil-intake h2{margin:0 0 6px;font-size:1.35rem}#kil-intake p.ki-sub{margin:0 0 16px;color:var(--ink2,#9a94b4);font-size:.95rem;line-height:1.5}' +
    '#kil-intake label{display:block;margin:0 0 4px;font-size:.82rem;color:var(--ink2,#9a94b4)}' +
    '#kil-intake input,#kil-intake select,#kil-intake textarea{box-sizing:border-box;width:100%;margin:0 0 12px;padding:12px 13px;font:inherit;font-size:16px;color:#fff;background:#07060d;border:1px solid rgba(255,255,255,.2);border-radius:10px}' +
    '#kil-intake textarea{min-height:110px;resize:vertical}' +
    '#kil-intake input:focus-visible,#kil-intake select:focus-visible,#kil-intake textarea:focus-visible,#kil-intake button:focus-visible{outline:2px solid #d0a0ff;outline-offset:2px}' +
    '#kil-intake .ki-go{width:100%;padding:14px;font-size:1rem;font-weight:700;color:#0d0b16;background:#d0a0ff;border:0;border-radius:10px;cursor:pointer}' +
    '#kil-intake .ki-go[disabled]{opacity:.6;cursor:default}' +
    '#kil-intake .ki-msg{min-height:1.3em;margin:10px 0 0;font-size:.92rem}#kil-intake .ki-msg.err{color:#ff7a7a}#kil-intake .ki-msg.ok{color:#7fe0a0}' +
    '#kil-intake .ki-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}';

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function mount(host) {
    var doc = root.document, t0 = Date.now();
    var st = doc.createElement('style'); st.textContent = CSS; doc.head.appendChild(st);
    host.innerHTML = '<div class="ki-card"><h2>Work with KEEPITIL</h2>' +
      '<p class="ki-sub">Release strategy, graphics, lyrics, audits and rollout help for independent artists. Tell us what you need.</p>' +
      '<form novalidate>' +
      '<label for="ki-name">Your name</label><input id="ki-name" name="name" autocomplete="name" maxlength="100" required>' +
      '<label for="ki-email">Email</label><input id="ki-email" name="email" type="email" inputmode="email" autocomplete="email" maxlength="254" required>' +
      '<label for="ki-brand">Artist or brand name</label><input id="ki-brand" name="brand" maxlength="120">' +
      '<label for="ki-links">Links (music, socials, site)</label><input id="ki-links" name="links" maxlength="600" placeholder="https://">' +
      '<label for="ki-need">What do you need?</label><select id="ki-need" name="need" required>' +
        NEEDS.map(function (n) { return '<option value="' + esc(n[0]) + '">' + esc(n[1]) + '</option>'; }).join('') + '</select>' +
      '<label for="ki-message">Message</label><textarea id="ki-message" name="message" maxlength="2000" required></textarea>' +
      '<div class="ki-hp" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>' +
      '<button class="ki-go" type="submit">Send</button>' +
      '<div class="ki-msg" role="status" aria-live="polite"></div></form></div>';
    var form = host.querySelector('form'), msg = host.querySelector('.ki-msg'), btn = host.querySelector('.ki-go');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = {}; ['name', 'email', 'brand', 'links', 'need', 'message', 'website'].forEach(function (k) { f[k] = form.elements[k].value; });
      msg.className = 'ki-msg';
      var bad = validate(f);
      if (bad) { msg.textContent = bad; msg.className = 'ki-msg err'; return; }
      var last = 0; try { last = Number(root.localStorage.getItem(K_LAST)) || 0; } catch (x) {}
      if (Date.now() - last < COOLDOWN_MS) { msg.textContent = 'Please wait a moment before sending again.'; msg.className = 'ki-msg err'; return; }
      if (isBot(f, Date.now() - t0)) { msg.textContent = THANKS; msg.className = 'ki-msg ok'; form.reset(); return; }
      btn.disabled = true; msg.textContent = 'Sending...';
      submit(root.fetch.bind(root), f, root.location.pathname).then(function (r) {
        btn.disabled = false;
        if (!r.ok) { msg.textContent = 'Something went wrong. Please try again or email info@keepitil.com.'; msg.className = 'ki-msg err'; return; }
        try { root.localStorage.setItem(K_LAST, String(Date.now())); } catch (x) {}
        msg.textContent = THANKS; msg.className = 'ki-msg ok'; form.reset();
      });
    });
  }

  var api = { validate: validate, validEmail: validEmail, buildMessage: buildMessage, buildRow: buildRow, submit: submit, isBot: isBot, THANKS: THANKS };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  else {
    root.KILIntake = api;
    var go = function () { var h = root.document.getElementById('kil-intake'); if (h) mount(h); };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', go); else go();
  }
})(typeof window !== 'undefined' ? window : globalThis);
