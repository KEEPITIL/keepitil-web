/* Profile contact form — a visitor sends a short note to the page owner.
   The owner's email address is never in the page: the message goes to the profile-inquiry
   edge function (DRAFT: db/drafts/profile-inquiry), which looks the owner up server side.
   Off until KIL_INQUIRY_LIVE is true, because the function is applied by Joe/Grok, not here.
   Messages only. Spam: honeypot + minimum time on the form + server rate limit. */
(function (root) {
  'use strict';
  var EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  var ENDPOINT = 'https://ovmqtzjfpzrbzrlkxwgw.supabase.co/functions/v1/profile-inquiry';
  var LIVE = false; /* flip to true in the PR that follows the function being applied */

  /* Pure: the cleaned message or the first problem in plain words. */
  function validate(f) {
    var s = function (k) { return typeof f[k] === 'string' ? f[k].trim() : ''; };
    var name = s('name'), email = s('email').toLowerCase(), message = s('message');
    if (name.length < 2 || name.length > 80) return { ok: false, error: 'Add your name.' };
    if (email.length > 254 || !EMAIL.test(email)) return { ok: false, error: 'Enter an email address they can reply to.' };
    if (message.length < 10 || message.length > 2000) return { ok: false, error: 'Write a short message (10 to 2,000 characters).' };
    return { ok: true, v: { name: name, email: email, message: message } };
  }

  /* Visible only when live (or on a local preview) and the viewer is not the owner. */
  function enabled(loc) {
    if (LIVE || root.KIL_INQUIRY_LIVE === true) return true;
    var h = (loc && loc.hostname) || '';
    return (h === 'localhost' || h === '127.0.0.1') && /[?&]inquiry-preview=1/.test((loc && loc.search) || '');
  }

  var api = { validate: validate, enabled: enabled, ENDPOINT: ENDPOINT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!root.document) return;
  var doc = root.document;
  root.KIL_PROFILE_INQUIRY = api;

  function el(id) { return doc.getElementById(id); }
  function open() {
    if (el('kilInq')) return;
    var slug = root.PROFILE_SLUG || '', started = Date.now();
    var ov = doc.createElement('div');
    ov.id = 'kilInq'; ov.className = 'kil-modal-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'kilInqH');
    ov.innerHTML = '<form class="kil-modal" id="kilInqForm" novalidate>' +
      '<div class="kil-mh"><span id="kilInqH">Contact</span><button type="button" class="kil-mx" id="kilInqX" aria-label="Close">&times;</button></div>' +
      '<div class="kil-mb">' +
      '<label class="kil-mf"><span>Your name</span><input type="text" id="kilInqName" autocomplete="name" maxlength="80" required></label>' +
      '<label class="kil-mf"><span>Your email</span><input type="text" inputmode="email" id="kilInqEmail" autocomplete="email" maxlength="254" required></label>' +
      '<label class="kil-mf"><span>Message</span><textarea id="kilInqMsg" rows="5" maxlength="2000" required></textarea></label>' +
      '<div style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden" aria-hidden="true"><label>Website<input type="text" id="kilInqWeb" tabindex="-1" autocomplete="off"></label></div>' +
      '<p id="kilInqNote" role="status" style="min-height:1.2em;margin:4px 0;font-size:.85rem;color:var(--muted)">Your message goes to the page owner. They reply to the email you enter.</p>' +
      '<button type="submit" class="pf-btn book" id="kilInqSend" style="width:100%;justify-content:center">Send message</button>' +
      '</div></form>';
    doc.body.appendChild(ov);
    function close() { ov.remove(); }
    el('kilInqX').onclick = close;
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ov.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    el('kilInqName').focus();
    function note(t, bad) { var n = el('kilInqNote'); n.textContent = t; n.style.color = bad ? '#ff8a8a' : 'var(--muted)'; }
    el('kilInqForm').onsubmit = function (e) {
      e.preventDefault();
      var r = validate({ name: el('kilInqName').value, email: el('kilInqEmail').value, message: el('kilInqMsg').value });
      if (!r.ok) { note(r.error, true); return; }
      var btn = el('kilInqSend'); btn.disabled = true; btn.textContent = 'Sending…';
      root.fetch(ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: slug, name: r.v.name, email: r.v.email, message: r.v.message, website: el('kilInqWeb').value, elapsed_ms: Date.now() - started })
      }).then(function (res) { return res.json().catch(function () { return {}; }).then(function (j) { return { ok: res.ok && j.ok === true, j: j }; }); })
        .then(function (o) {
          if (o.ok) { el('kilInqForm').innerHTML = '<div class="kil-mh"><span>Sent</span><button type="button" class="kil-mx" id="kilInqX2" aria-label="Close">&times;</button></div><div class="kil-mb"><p>Your message was sent. The page owner will reply to your email.</p></div>'; el('kilInqX2').onclick = close; return; }
          btn.disabled = false; btn.textContent = 'Send message'; note((o.j && o.j.error) || 'Could not send. Please try again.', true);
        }).catch(function () { btn.disabled = false; btn.textContent = 'Send message'; note('Could not send. Please try again.', true); });
    };
  }

  function sync() {
    var b = el('pfContact'); if (!b) return;
    var owner = typeof root.CAN_EDIT === 'function' && root.CAN_EDIT();
    b.style.display = enabled(root.location) && !owner ? '' : 'none';
  }
  doc.addEventListener('DOMContentLoaded', function () {
    var b = el('pfContact'); if (!b) return;
    b.onclick = open;
    var n = 0, t = root.setInterval(function () { sync(); if (++n > 20) root.clearInterval(t); }, 500); sync();
  });
})(typeof window !== 'undefined' ? window : globalThis);
