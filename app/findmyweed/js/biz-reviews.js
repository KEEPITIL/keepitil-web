// Dashboard "Reviews" tab: the approved reviews of this business (fmw.my_reviews) and one owner reply per review (fmw.reply_to_review). The server decides who may read (owner / manager / editor)
// and who may reply (owner / manager); this file draws the answer. Text and form controls only, textContent only, no markup, no network of its own. Registers in window.FMW_DASHBOARD_TABS.
(function (root) {
  function el(doc, tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // the answer is untrusted JSON: keep a fixed shape, strings as strings, ratings 1..5, ids that look like ids
  function clean(data) {
    if (!data || typeof data !== 'object') return null;
    var rows = (Array.isArray(data.reviews) ? data.reviews : []).filter(function (r) { return r && typeof r.id === 'string' && UUID.test(r.id) && Number(r.rating) >= 1 && Number(r.rating) <= 5; }).map(function (r) {
      var rep = r.reply && typeof r.reply === 'object' && typeof r.reply.body === 'string' ? { body: r.reply.body.slice(0, 1000), date: String(r.reply.date || '').slice(0, 10) } : null;
      return { id: r.id, rating: Math.floor(Number(r.rating)), body: String(r.body == null ? '' : r.body).slice(0, 1000), date: String(r.date || '').slice(0, 10), reply: rep };
    });
    var n = Number(data.count), avg = data.average == null ? null : Number(data.average);
    return { count: isFinite(n) && n >= 0 ? Math.floor(n) : rows.length, average: avg != null && isFinite(avg) && avg >= 1 && avg <= 5 ? Math.round(avg * 10) / 10 : null, reviews: rows };
  }
  function draw(doc, box, copy, data, canReply, onReply) {
    box.textContent = '';
    var d = clean(data);
    if (!d) { box.appendChild(el(doc, 'p', 'muted', copy.error)); return false; }
    box.appendChild(el(doc, 'h3', null, copy.summary(d.count, d.count ? d.average : null)));
    if (!d.reviews.length) { box.appendChild(el(doc, 'p', 'muted', copy.none)); return true; }
    var ul = el(doc, 'ul', 'rev-list');
    d.reviews.forEach(function (r) {
      var li = el(doc, 'li', 'rev'); li.setAttribute('data-id', r.id);
      li.appendChild(el(doc, 'p', 'rev-rating', copy.rating(r.rating) + (r.date ? ' · ' + r.date : '')));
      li.appendChild(el(doc, 'p', 'rev-body', r.body));
      if (r.reply) { var rp = el(doc, 'div', 'rev-reply'); rp.appendChild(el(doc, 'p', 'rev-reply-h', copy.replyHead + (r.reply.date ? ' · ' + r.reply.date : ''))); rp.appendChild(el(doc, 'p', null, r.reply.body)); li.appendChild(rp); }
      if (canReply) {
        var label = el(doc, 'label', null, copy.replyLabel), ta = el(doc, 'textarea'); ta.maxLength = 1000; ta.value = r.reply ? r.reply.body : ''; label.appendChild(ta);
        var btn = el(doc, 'button', 'btn ghost', r.reply ? copy.replyEdit : copy.replySend); btn.type = 'button'; var st = el(doc, 'p', 'muted'); st.setAttribute('role', 'status');
        btn.addEventListener('click', function () {
          var v = String(ta.value || '').trim(); if (!v) return;
          st.textContent = '';
          onReply(r.id, v).then(function (ok) { st.textContent = ok ? copy.replySaved : copy.replyFail; });
        });
        li.appendChild(label); li.appendChild(btn); li.appendChild(st);
      }
      ul.appendChild(li);
    });
    box.appendChild(ul);
    if (!canReply) box.appendChild(el(doc, 'p', 'muted', copy.viewerNote));
    return true;
  }
  function mount(doc, panel, ctx) {
    var C = (ctx.win && ctx.win.FMW_COPY) || root.FMW_COPY || {}, copy = C.bizDash && C.bizDash.reviews;
    if (!copy) return;
    var role = ctx.biz && ctx.biz.role, canReply = role === 'owner' || role === 'manager';
    panel.appendChild(el(doc, 'h2', null, copy.title)); panel.appendChild(el(doc, 'p', 'muted', copy.note));
    var out = el(doc, 'div', 'rev-out'); out.setAttribute('aria-live', 'polite'); panel.appendChild(out);
    function load() {
      out.textContent = ''; out.appendChild(el(doc, 'p', 'muted', copy.loading));
      ctx.rpc('my_reviews', {}).then(function (r) {
        if (!r || !r.ok) { out.textContent = ''; out.appendChild(el(doc, 'p', 'muted', copy.error)); var b = el(doc, 'button', 'btn ghost', copy.retry); b.type = 'button'; b.addEventListener('click', load); out.appendChild(b); return; }
        draw(doc, out, copy, r.data, canReply, function (id, body) { return ctx.rpc('reply_to_review', { p_review: id, p_body: body }).then(function (x) { if (x && x.ok) load(); return !!(x && x.ok); }); });
      });
    }
    load();
  }
  var list = root.FMW_DASHBOARD_TABS = root.FMW_DASHBOARD_TABS || [];
  // DORMANT until site.json "bizReviews" is true (FMW_CONFIG.bizReviews): the reviews SQL (P3 reviews draft) is not applied yet, so an always-on tab would show every owner a load error
  if (root.FMW_CONFIG && root.FMW_CONFIG.bizReviews === true) list.push({ key: 'reviews', label: function (C) { return C && C.bizDash && C.bizDash.reviews ? C.bizDash.reviews.tab : 'Reviews'; }, roles: ['owner', 'manager', 'editor'], mount: mount });
  var api = { clean: clean, draw: draw, mount: mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FMW_BIZ_REVIEWS = api;
})(typeof window !== 'undefined' ? window : globalThis);
