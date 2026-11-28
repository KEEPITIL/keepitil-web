// Public "Reviews" block on a listing page: the APPROVED reviews and the average of an approved business (public.fmw_public_reviews, anon), plus a "Write a review" form for a signed-in
// Find My Weed customer (fmw.submit_review with the visitor's own token). INERT until the reviews SQL (docs/proposed/migrations/P3_business_reviews.DRAFT.sql) is applied: while the function
// does not answer, or the business is not an approved one, NOTHING is drawn (no empty box, no invented rating). The server checks every rule (customer only, one per listing, no self-review,
// 5 a day, moderated before publish); this file only asks and shows the answer. textContent only, no markup, no tracker. It wraps window.FMW_LISTING.mount so pages.js is not edited.
(function (root) {
  var COPY = {
    title: 'Reviews',
    summary: function (n, avg) { return n + (n === 1 ? ' review' : ' reviews') + ' · average ' + avg + ' out of 5'; },
    none: 'No reviews yet.',
    rating: function (n) { return 'Rating: ' + n + ' out of 5'; },
    replyHead: 'Reply from the business',
    write: 'Write a review', signIn: 'Sign in to write a review',
    ratingLabel: 'Your rating', starOption: function (n) { return n + ' out of 5'; },
    textLabel: 'Your review (plain text, up to 1000 characters)', send: 'Send review', cancel: 'Cancel',
    thanks: 'Thank you. Your review will appear after staff check it.',
    errors: { already: 'You already reviewed this business.', own: 'You cannot review your own business.', kind: 'Only customer accounts can write reviews.', many: 'You have sent several reviews today. Try again tomorrow.', confirm: 'Confirm your email first, then try again.', other: 'Could not send your review. Try again in a moment.', empty: 'Pick a rating and write a few words first.' },
    note: 'Reviews are from signed-in customers and are checked by staff before they are published.'
  };
  function el(doc, tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function cfg(win) { var c = win.FMW_CONFIG && win.FMW_CONFIG.authProject; return c && c.url && c.anonKey ? c : null; }
  var SHAPE = /^(?:C\d{1,2}-\d{7}-LIC|CCL\d{2}-\d{7}|DCC-\d{8})$/i;
  function clean(data) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.reviews)) return null;
    var n = Number(data.count), avg = data.average == null ? null : Number(data.average);
    var rows = data.reviews.filter(function (r) { return r && Number(r.rating) >= 1 && Number(r.rating) <= 5; }).map(function (r) {
      return { rating: Math.floor(Number(r.rating)), body: String(r.body == null ? '' : r.body).slice(0, 1000), date: String(r.date || '').slice(0, 10),
        reply: r.reply && typeof r.reply === 'object' && typeof r.reply.body === 'string' ? { body: r.reply.body.slice(0, 1000), date: String(r.reply.date || '').slice(0, 10) } : null };
    });
    return { count: isFinite(n) && n >= 0 ? Math.floor(n) : rows.length, average: avg != null && isFinite(avg) && avg >= 1 && avg <= 5 ? Math.round(avg * 10) / 10 : null, reviews: rows };
  }
  function errorKey(status, message) {
    var m = String(message || '').toLowerCase();
    if (m.indexOf('already reviewed') >= 0) return 'already';
    if (m.indexOf('your own business') >= 0) return 'own';
    if (m.indexOf('only customer') >= 0) return 'kind';
    if (m.indexOf('too many reviews') >= 0 || status === 429) return 'many';
    if (m.indexOf('confirm your email') >= 0) return 'confirm';
    return 'other';
  }
  function draw(doc, box, data, session, sendReview) {
    var d = clean(data); if (!d) return null;
    var sec = el(doc, 'section', 'card reviews'); sec.setAttribute('data-card', 'reviews');
    sec.appendChild(el(doc, 'h2', null, COPY.title));
    sec.appendChild(el(doc, 'p', 'muted', d.count && d.average != null ? COPY.summary(d.count, d.average) : COPY.none));
    if (d.reviews.length) {
      var ul = el(doc, 'ul', 'rev-list');
      d.reviews.forEach(function (r) {
        var li = el(doc, 'li', 'rev'); li.appendChild(el(doc, 'p', 'rev-rating', COPY.rating(r.rating) + (r.date ? ' · ' + r.date : ''))); li.appendChild(el(doc, 'p', 'rev-body', r.body));
        if (r.reply) { var rp = el(doc, 'div', 'rev-reply'); rp.appendChild(el(doc, 'p', 'rev-reply-h', COPY.replyHead + (r.reply.date ? ' · ' + r.reply.date : ''))); rp.appendChild(el(doc, 'p', null, r.reply.body)); li.appendChild(rp); }
        ul.appendChild(li);
      });
      sec.appendChild(ul);
    }
    var area = el(doc, 'div', 'rev-write');
    if (session && session.signedIn && typeof sendReview === 'function') {
      var open = el(doc, 'button', 'btn ghost', COPY.write); open.type = 'button'; open.setAttribute('aria-expanded', 'false'); area.appendChild(open);
      var form = el(doc, 'form'); form.hidden = true; form.noValidate = true; form.setAttribute('aria-label', COPY.write);
      var fs = el(doc, 'fieldset'); fs.appendChild(el(doc, 'legend', null, COPY.ratingLabel));
      var chosen = 0, radios = [];
      [1, 2, 3, 4, 5].forEach(function (n) {
        var lab = el(doc, 'label', 'rev-opt'), r = el(doc, 'input'); r.type = 'radio'; r.name = 'rating'; r.value = String(n); r.addEventListener('change', function () { chosen = n; });
        lab.appendChild(r); lab.appendChild(el(doc, 'span', null, COPY.starOption(n))); fs.appendChild(lab); radios.push(r);
      });
      var tl = el(doc, 'label', null, COPY.textLabel), ta = el(doc, 'textarea'); ta.maxLength = 1000; tl.appendChild(ta);
      var send = el(doc, 'button', 'btn', COPY.send); send.type = 'submit'; var cancel = el(doc, 'button', 'btn ghost', COPY.cancel); cancel.type = 'button';
      var msg = el(doc, 'p', 'muted'); msg.setAttribute('role', 'status');
      form.appendChild(fs); form.appendChild(tl); form.appendChild(send); form.appendChild(cancel); form.appendChild(msg); area.appendChild(form);
      open.addEventListener('click', function () { form.hidden = false; open.setAttribute('aria-expanded', 'true'); });
      cancel.addEventListener('click', function () { form.hidden = true; open.setAttribute('aria-expanded', 'false'); });
      form.addEventListener('submit', function (e) {
        if (e && e.preventDefault) e.preventDefault();
        var body = String(ta.value || '').trim(); msg.textContent = '';
        if (!chosen || !body) { msg.textContent = COPY.errors.empty; return; }
        send.disabled = true;
        sendReview(chosen, body).then(function (r) { send.disabled = false; if (r && r.ok) { msg.textContent = COPY.thanks; form.hidden = true; open.hidden = true; } else msg.textContent = COPY.errors[errorKey(r && r.status, r && r.message)]; });
      });
    } else {
      var a = el(doc, 'a', 'btn ghost', COPY.signIn); a.href = 'signup.html'; area.appendChild(a);
    }
    sec.appendChild(area); sec.appendChild(el(doc, 'p', 'muted', COPY.note));
    box.appendChild(sec); return sec;
  }
  function call(win, path, body, token, profile) {
    var c = cfg(win), f = win.fetch; if (!c || typeof f !== 'function') return Promise.resolve({ ok: false });
    var h = { 'Content-Type': 'application/json', apikey: c.anonKey, Authorization: 'Bearer ' + (token || c.anonKey) }; if (profile) h['Content-Profile'] = profile;
    return f(c.url + '/rest/v1/rpc/' + path, { method: 'POST', headers: h, body: JSON.stringify(body) }).then(function (r) {
      if (r && r.ok) return r.json().then(function (j) { return { ok: true, data: j }; }, function () { return { ok: false }; });
      return (r && r.json ? r.json() : Promise.resolve({})).then(function (j) { return { ok: false, status: r && r.status, message: j && j.message }; }, function () { return { ok: false, status: r && r.status }; });
    }, function () { return { ok: false }; });
  }
  function mountReviews(doc, box, l, win) {
    win = win || root;
    var lic = l && typeof l.license === 'string' ? l.license.toUpperCase() : '';
    if (!SHAPE.test(lic) || !cfg(win)) return;
    // DORMANT until site.json "bizReviews" is true (FMW_CONFIG.bizReviews): the same switch as the owner's Reviews tab (#355), so the public block and the owner's reply tool go live together.
    if (!(win.FMW_CONFIG && win.FMW_CONFIG.bizReviews === true)) return;
    call(win, 'fmw_public_reviews', { p_license: lic, p_limit: 20, p_offset: 0 }, null, null).then(function (r) {
      if (!r || !r.ok || !r.data) return;   // not applied yet, not an approved business, or unreachable: nothing is drawn
      var s = win.FMW_SESSION, tok = s && s.token ? s.token() : null;
      draw(doc, box, r.data, tok ? { signedIn: true } : { signedIn: false }, tok ? function (rating, body) { return call(win, 'submit_review', { p_license: lic, p_rating: rating, p_body: body }, tok, 'fmw'); } : null);
    });
  }
  var L = root.FMW_LISTING;
  if (L && typeof L.mount === 'function' && !L.__reviews) {
    var prev = L.mount; L.__reviews = true;
    L.mount = function (doc, box, l) { var out = prev.apply(this, arguments); try { mountReviews(doc, box, l, root); } catch (e) { /* the reviews block must never break the listing page */ } return out; };
  }
  var api = { COPY: COPY, clean: clean, draw: draw, errorKey: errorKey, mountReviews: mountReviews, SHAPE: SHAPE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FMW_LISTING_REVIEWS = api;
})(typeof window !== 'undefined' ? window : globalThis);
