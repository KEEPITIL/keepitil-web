/* KEEPITIL music video service page: price flag, tier pick, validation, mailto/rpc submit.
 * DRAFT. No analytics, no storage, no network calls in the default 'mailto' mode.
 * Pure helpers are exported (module.exports) so the UNRUN node test can exercise them without a DOM. */
(function (root) {
  'use strict';

  var TO = 'info@keepitil.com';
  var PRICES = { hook: '$4', lyric_cut: '$14', character_story: '$24' }; // shown ONLY when KIL_MV_PRICES_LIVE === true
  var HIDDEN_PRICE_TEXT = 'Pricing confirmed soon: request a quote';
  var TIER_NAMES = { hook: 'Hook teaser', lyric_cut: 'Full Lyric Cut', character_story: 'Character Story + teaser', not_sure: 'Not sure yet' };
  var CONSENT_TEXT = 'I agree that KEEPITIL may use the details in this request only to reply to it. It is not made public.';
  var ATTEST_TEXT = 'I own, or have written permission to use, the song (master and composition), the lyrics, and every face, logo and piece of artwork I supply for this video. I understand KEEPITIL grants no rights to the underlying song and cannot guarantee platform clearance.';
  var LIMITS = { name: 120, email: 254, song: 160, link: 500, message: 1500 };
  var EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;

  function pricesLive(w) { return !!w && w.KIL_MV_PRICES_LIVE === true; }
  function priceLabel(tier, live) { return live && PRICES[tier] ? PRICES[tier] : HIDDEN_PRICE_TEXT; }
  function oneLine(s) { return String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').trim(); }

  // els: array of { dataset: { tierPrice: 'hook' }, textContent } (real DOM nodes or test doubles)
  function applyPrices(els, live) {
    for (var i = 0; i < els.length; i++) {
      els[i].textContent = priceLabel(els[i].dataset.tierPrice, live);
    }
  }

  function validate(v) {
    var e = {};
    var name = oneLine(v.name), email = oneLine(v.email), song = oneLine(v.song), link = oneLine(v.link);
    var msg = String(v.message == null ? '' : v.message).trim();
    if (!name) e.name = 'Enter your name.'; else if (name.length > LIMITS.name) e.name = 'Name is too long.';
    if (!EMAIL_RE.test(email) || email.length > LIMITS.email) e.email = 'Enter a valid email address.';
    if (!TIER_NAMES[v.tier]) e.tier = 'Choose an option.';
    if (!song) e.song = 'Enter the song title.'; else if (song.length > LIMITS.song) e.song = 'Song title is too long.';
    if (!/^https?:\/\/[^\s]+\.[^\s]+$/i.test(link) || link.length > LIMITS.link) e.link = 'Enter a link that starts with http:// or https://.';
    if (msg.length > LIMITS.message) e.message = 'Keep the message under ' + LIMITS.message + ' characters.';
    if (v.consent !== true) e.consent = 'Please agree so we can reply to you.';
    if (v.attest !== true) e.attest = 'The rights confirmation is required.';
    var ok = true; for (var k in e) { if (Object.prototype.hasOwnProperty.call(e, k)) ok = false; }
    return { ok: ok, errors: e };
  }

  function buildMailto(v) {
    var subject = 'Music video request: ' + (TIER_NAMES[v.tier] || TIER_NAMES.not_sure);
    var body = [
      'Option: ' + (TIER_NAMES[v.tier] || ''),
      'Name: ' + oneLine(v.name),
      'Email: ' + oneLine(v.email),
      'Song title: ' + oneLine(v.song),
      'Song or lyrics link: ' + oneLine(v.link),
      'Message: ' + String(v.message || '').trim(),
      '',
      'Contact consent: YES - ' + CONSENT_TEXT,
      'Rights confirmation: YES - ' + ATTEST_TEXT
    ].join('\r\n');
    return 'mailto:' + TO + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }

  // 'rpc' mode only. Disabled unless the page owner sets the three globals AND the SQL pack is applied.
  function submitRpc(w, v, fetchFn) {
    var url = w.KIL_MV_SUPABASE_URL, key = w.KIL_MV_SUPABASE_ANON_KEY;
    if (!url || !key) return Promise.reject(new Error('rpc-not-configured'));
    return fetchFn(url.replace(/\/$/, '') + '/rest/v1/rpc/submit_music_video_inquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        p_name: oneLine(v.name), p_email: oneLine(v.email), p_tier: v.tier, p_song: oneLine(v.song),
        p_link: oneLine(v.link), p_message: String(v.message || '').trim(),
        p_consent: v.consent === true, p_attest: v.attest === true, p_hp: v.hp || ''
      })
    }).then(function (r) { if (!r.ok) throw new Error('rpc-failed'); return true; });
  }

  function init(doc, w) {
    applyPrices(Array.prototype.slice.call(doc.querySelectorAll('[data-tier-price]')), pricesLive(w));
    var live = pricesLive(w);
    if (live) {
      var opts = doc.querySelectorAll('select[name="tier"] option[data-tier]');
      for (var i = 0; i < opts.length; i++) {
        var t = opts[i].getAttribute('data-tier');
        opts[i].textContent = TIER_NAMES[t] + ' (' + PRICES[t] + ')';
      }
    }
    // Sample slot: only creates a <video> when data-sample-src is filled in.
    var slot = doc.querySelector('[data-sample-slot]');
    if (slot) {
      var src = slot.getAttribute('data-sample-src');
      if (src) {
        var vid = doc.createElement('video');
        vid.controls = true; vid.preload = 'none'; vid.setAttribute('playsinline', '');
        vid.setAttribute('aria-label', 'Sample music video');
        vid.src = src;
        var ph = slot.querySelector('[data-sample-placeholder]');
        if (ph) ph.hidden = true;
        slot.appendChild(vid);
      }
    }
    var form = doc.getElementById('mv-form');
    if (!form) return;
    var status = doc.getElementById('mv-status');
    var picks = doc.querySelectorAll('[data-tier-pick]');
    Array.prototype.forEach.call(picks, function (a) {
      a.addEventListener('click', function () { form.elements.tier.value = a.getAttribute('data-tier-pick'); });
    });
    function read() {
      var f = form.elements;
      return { name: f.name.value, email: f.email.value, tier: f.tier.value, song: f.song.value, link: f.link.value,
        message: f.message.value, consent: f.consent.checked, attest: f.attest.checked, hp: f.company_site.value };
    }
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var v = read();
      Array.prototype.forEach.call(form.querySelectorAll('[aria-invalid]'), function (n) { n.removeAttribute('aria-invalid'); });
      Array.prototype.forEach.call(form.querySelectorAll('[data-err]'), function (n) { n.textContent = ''; });
      if (v.hp) { status.textContent = 'Thanks.'; return; } // honeypot: silently drop
      var r = validate(v);
      if (!r.ok) {
        var first = null;
        for (var k in r.errors) {
          if (!Object.prototype.hasOwnProperty.call(r.errors, k)) continue;
          var field = k === 'attest' ? form.elements.attest : form.elements[k];
          var msg = doc.querySelector('[data-err="' + k + '"]');
          if (msg) msg.textContent = r.errors[k];
          if (field) { field.setAttribute('aria-invalid', 'true'); if (!first) first = field; }
        }
        status.textContent = 'Please fix the highlighted fields.';
        if (first && first.focus) first.focus();
        return;
      }
      if (w.KIL_MV_SUBMIT_MODE === 'rpc') {
        status.textContent = 'Sending...';
        submitRpc(w, v, w.fetch ? w.fetch.bind(w) : null).then(function () {
          status.textContent = 'Thanks. We received your request and will reply by email.';
          form.reset();
        }, function () {
          status.textContent = 'Could not send. Email ' + TO + ' instead.';
        });
        return;
      }
      status.textContent = 'Your email app should open with the request filled in. Press send there. If nothing opens, email ' + TO + '.';
      w.location.href = buildMailto(v);
    });
  }

  var api = { TO: TO, PRICES: PRICES, HIDDEN_PRICE_TEXT: HIDDEN_PRICE_TEXT, TIER_NAMES: TIER_NAMES, CONSENT_TEXT: CONSENT_TEXT,
    ATTEST_TEXT: ATTEST_TEXT, pricesLive: pricesLive, priceLabel: priceLabel, applyPrices: applyPrices,
    validate: validate, buildMailto: buildMailto, submitRpc: submitRpc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(document, root); });
    else init(document, root);
  }
})(typeof window !== 'undefined' ? window : globalThis);
