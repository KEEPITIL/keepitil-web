// "Contact for wholesale": a small form on the listing of a WHOLESALE licence (cultivation, manufacturing, distribution, ...), so another licensed business can write to it. It is a message to the business,
// nothing is sold here. DORMANT until site.json "wholesaleInquiry" is true (FMW_CONFIG.wholesaleInquiry): off, this file makes no request and draws nothing.
// Calls the public RPCs of the dashboard migration: fmw_listing_overlay (is this a live wholesale business?), fmw_inquiry_ticket (a signed ticket, valid 3 s to 2 h after it is issued) and
// fmw_submit_inquiry (kind "wholesale"). The server drops a bad ticket, a filled honeypot, a rate-limited sender and a business that is not live WITHOUT an error, so the page can only know that the request
// went through: its thank-you says exactly that and never promises a reply. A failed request (HTTP error or no network) shows an error and no thank-you. Text goes in with textContent only; no secret, no storage.
(function (root) {
  var LIC = /^(?:[A-Z]{1,4}\d{0,2}-\d{7}-LIC|CCL\d{2}-\d{7}|DCC-\d{8})$/, EMAIL = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[^\s@<>"']{2,}$/, MIN_AGE_MS = 3500, MAX_AGE_MS = 100 * 60 * 1000;
  var COPY = {
    title: 'Contact for wholesale',
    note: 'For licensed businesses buying wholesale. This sends a message to the business; nothing is sold or paid for on Find My Weed.',
    name: 'Your name', business: 'Your business and license number', email: 'Your email', phone: 'Phone (optional)', message: 'What are you looking for?', send: 'Send message', sending: 'Sending…',
    needEmail: 'Enter a valid email so the business can reply.', needMessage: 'Write a short message (up to 1,000 characters).',
    sent: 'Your message was sent to the business. Whether and when it replies is up to it.',
    failed: 'Could not send your message. Check your connection and try again in a moment.'
  };
  function el(doc, tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function rpc(win, name, body) {
    var cfg = win.FMW_CONFIG && win.FMW_CONFIG.authProject, f = win.fetch;
    if (!cfg || !cfg.url || !cfg.anonKey || typeof f !== 'function') return Promise.resolve({ ok: false });
    return Promise.resolve().then(function () {
      return f.call(win, cfg.url + '/rest/v1/rpc/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey }, body: JSON.stringify(body || {}) });
    }).then(function (r) {
      if (!r || !r.ok) return { ok: false };
      // a void function answers with an empty body: that is success; a body, when there is one, is parsed and kept
      return (typeof r.text === 'function' ? r.text() : Promise.resolve('')).then(function (t) { var d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = null; } return { ok: true, data: d }; }, function () { return { ok: true, data: null }; });
    }, function () { return { ok: false }; });
  }
  function field(doc, label, name, tag, extra) {
    var wrap = el(doc, 'label', 'field'), span = el(doc, 'span', null, label), input = el(doc, tag === 'textarea' ? 'textarea' : 'input');
    if (tag !== 'textarea') input.type = tag || 'text';
    input.setAttribute('name', name); if (extra) Object.keys(extra).forEach(function (k) { input.setAttribute(k, extra[k]); });
    wrap.appendChild(span); wrap.appendChild(input); return { wrap: wrap, input: input };
  }
  function build(doc, win, license) {
    var sec = el(doc, 'section', 'card wholesale-inquiry'); sec.setAttribute('data-card', 'wholesale-inquiry');
    sec.appendChild(el(doc, 'h2', null, COPY.title)); sec.appendChild(el(doc, 'p', 'muted', COPY.note));
    var form = el(doc, 'form'); form.setAttribute('novalidate', 'novalidate');
    var nm = field(doc, COPY.name, 'name', 'text', { maxlength: '120', autocomplete: 'name' }), biz = field(doc, COPY.business, 'business', 'text', { maxlength: '120' }),
      em = field(doc, COPY.email, 'email', 'email', { maxlength: '254', autocomplete: 'email' }), ph = field(doc, COPY.phone, 'phone', 'tel', { maxlength: '20', autocomplete: 'tel' }),
      msg = field(doc, COPY.message, 'message', 'textarea', { maxlength: '1000', rows: '5' });
    // the honeypot: a real person never sees or fills it (class "sr" = visually hidden, out of the tab order, hidden from assistive tech)
    var hpWrap = el(doc, 'div', 'sr'); hpWrap.setAttribute('aria-hidden', 'true'); var hp = el(doc, 'input'); hp.type = 'text'; hp.setAttribute('name', 'hp'); hp.setAttribute('tabindex', '-1'); hp.setAttribute('autocomplete', 'off'); hpWrap.appendChild(hp);
    var status = el(doc, 'p', 'muted'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    var btn = el(doc, 'button', 'btn', COPY.send); btn.type = 'submit';
    [nm.wrap, biz.wrap, em.wrap, ph.wrap, msg.wrap, hpWrap, btn, status].forEach(function (n) { form.appendChild(n); });
    sec.appendChild(form);
    var ticket = null, issued = 0;
    function getTicket() {
      if (ticket && Date.now() - issued < MAX_AGE_MS) return Promise.resolve(ticket);
      return rpc(win, 'fmw_inquiry_ticket', {}).then(function (r) { if (r.ok && typeof r.data === 'string' && /^\d{1,12}\.[0-9a-f]{64}$/.test(r.data)) { ticket = r.data; issued = Date.now(); return ticket; } return null; });
    }
    getTicket();   // fetched as soon as the form is on the page, so it is older than 3 s by the time anyone has typed a message
    var sending = false;
    form.addEventListener('submit', function (ev) {
      if (ev && ev.preventDefault) ev.preventDefault();
      if (sending) return;
      var email = String(em.input.value || '').trim(), text = String(msg.input.value || '').trim();
      if (!EMAIL.test(email) || email.length > 254) { status.textContent = COPY.needEmail; return; }
      if (!text || text.length > 1000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) { status.textContent = COPY.needMessage; return; }
      sending = true; btn.setAttribute('disabled', 'disabled'); btn.textContent = COPY.sending; status.textContent = '';
      var who = String(nm.input.value || '').trim(), company = String(biz.input.value || '').trim();
      var fail = function () { ticket = null; sending = false; btn.removeAttribute('disabled'); btn.textContent = COPY.send; status.textContent = COPY.failed; };
      getTicket().then(function (t) {
        if (!t) { fail(); return; }
        var wait = Math.max(0, MIN_AGE_MS - (Date.now() - issued));
        var go = function () {
          // the business and license number the sender types go in front of the message: the server stores name, email, phone and message only
          var full = (company ? 'From: ' + company + '\n' : '') + text;
          rpc(win, 'fmw_submit_inquiry', { p_license: license, p_kind: 'wholesale', p_name: who, p_email: email, p_phone: String(ph.input.value || '').trim(), p_message: full.slice(0, 1000), p_hp: String(hp.value || ''), p_ticket: t }).then(function (r) {
            if (!r.ok) { fail(); return; }
            ticket = null; sending = false; btn.textContent = COPY.send; status.textContent = COPY.sent; msg.input.value = '';
          });
        };
        if (wait > 0 && typeof win.setTimeout === 'function') win.setTimeout(go, wait); else go();
      });
    });
    return sec;
  }
  // mount(doc, box, listing): draws the form only for a live WHOLESALE business (the server's own caps answer), and only while the flag is on
  function mount(doc, box, listing, win) {
    win = win || root;
    var CFG = win.FMW_CONFIG;
    if (!CFG || CFG.wholesaleInquiry !== true || !box) return Promise.resolve(false);
    var license = String(listing && listing.license || '').trim().toUpperCase();
    if (!LIC.test(license)) return Promise.resolve(false);
    return rpc(win, 'fmw_listing_overlay', { p_license: license }).then(function (r) {
      var caps = r.ok && r.data && r.data.caps;
      if (!caps || caps.wholesale !== true) return false;
      box.appendChild(build(doc, win, license)); return true;
    });
  }
  var api = { mount: mount, rpc: rpc, COPY: COPY, EMAIL: EMAIL, LIC: LIC };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FMW_WHOLESALE = api;
})(typeof window !== 'undefined' ? window : globalThis);
