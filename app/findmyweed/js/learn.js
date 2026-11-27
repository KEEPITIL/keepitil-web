// FMW LEARN page logic (learn.html; KODE/Joe 2026-11-23, 1.0 plan: original articles + curated LINK-OUT video cards).
// No iframes, no external images, no network call besides data/learn.json, nothing to buy. Written for plain text only (text nodes).
// An item is public only when status is "published" AND reviewed_by is set AND every text passes the shared ad rules (FMW_AD_RULES.checkText,
// health / minors / over-consumption / free) plus the checks below. Not linked from any page until Echo approves the copy.
(function (root) {
  var TOPICS = ['basics', 'licenses', 'lab-results', 'age-and-id', 'delivery', 'reporting'];
  var TOPIC_LABEL = { basics: 'First visit', licenses: 'Licenses', 'lab-results': 'Lab results', 'age-and-id': 'Age and ID', delivery: 'Delivery', reporting: 'Reporting a seller' };
  var ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  // The site-wide no-sales rule (tests/basics.test.js scans all copy): Learn explains, it never sells or prices anything.
  var SALES = /\b(buy|buying|order|orders|ordering|purchase|checkout|check out|cart|basket|price|prices|pricing|pay|payment|payments|paid|sale|sales|sell|selling|deal|deals|discount|coupon|promo|shop now|add to)\b|\$\d/i;
  var YT = /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/;
  function rules() {
    if (root && root.FMW_AD_RULES) return root.FMW_AD_RULES;
    try { return require('./ad-rules.js'); } catch (e) { return null; }
  }
  function textProblems(s) {
    var r = rules(), p = [];
    if (!r) return ['no-ad-rules'];            // never publish without the rules loaded
    var c = r.checkText(String(s == null ? '' : s));
    c.hits.forEach(function (h) { p.push(h); });
    return p;
  }
  function checkItem(e) {
    var p = [];
    if (!e || typeof e !== 'object') return ['item'];
    if (typeof e.id !== 'string' || !ID.test(e.id) || e.id.length > 60) p.push('id');
    if (e.kind !== 'article' && e.kind !== 'video') p.push('kind');
    if (TOPICS.indexOf(e.topic) < 0) p.push('topic');
    if (typeof e.title !== 'string' || !e.title.trim() || e.title.length > 90 || /[<>]/.test(e.title)) p.push('title');
    if (typeof e.blurb !== 'string' || !e.blurb.trim() || e.blurb.length > 240 || /[<>]/.test(e.blurb)) p.push('blurb');
    if (typeof e.source_note !== 'string' || !e.source_note.trim()) p.push('source_note');
    if (e.kind === 'video') {
      if (typeof e.url !== 'string' || !YT.test(e.url)) p.push('url');
      if (typeof e.channel !== 'string' || !e.channel.trim() || e.channel.length > 60 || /[<>]/.test(e.channel)) p.push('channel');
    }
    if (e.kind === 'article') {
      if (!Array.isArray(e.body) || !e.body.length || e.body.length > 40 || e.body.some(function (x) { return typeof x !== 'string' || !x.trim() || x.length > 1200 || /[<>]/.test(x); })) p.push('body');
    }
    [e.title, e.blurb, e.channel].concat(Array.isArray(e.body) ? e.body : []).forEach(function (t, i) {
      textProblems(t).forEach(function (x) { p.push('copy' + i + ':' + x); });
      if (SALES.test(String(t == null ? '' : t))) p.push('copy' + i + ':sales-word');
    });
    return p;
  }
  function publicItems(data) {
    var list = data && Array.isArray(data.items) ? data.items : [];
    return list.filter(function (e) { return e && e.status === 'published' && typeof e.reviewed_by === 'string' && e.reviewed_by.trim() && checkItem(e).length === 0; });
  }
  function find(data, id) { var s = String(id || '').toLowerCase(); return publicItems(data).filter(function (e) { return e.id === s && e.kind === 'article'; })[0] || null; }
  var COPY = {
    title: 'Learn', none: 'Learning pages are coming soon.', articles: 'Guides', videos: 'Videos', back: 'All guides', search: 'Search licensed businesses',
    ytNote: 'Opens YouTube in a new tab. YouTube may set cookies; Find My Weed does not.', watch: 'Watch on YouTube', missing: 'We do not have that guide.',
    note: 'Cannabis is for adults 21+. These pages are general information, not medical or legal advice.'
  };
  function render(doc, data, articleId) {
    var title = doc.getElementById('learn-title'), box = doc.getElementById('learn');
    if (!title || !box) return;
    while (box.firstChild) box.removeChild(box.firstChild);
    function el(tag, text, cls) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    var items = publicItems(data);
    if (articleId) {
      var a = find(data, articleId);
      if (!a) { title.textContent = COPY.missing; }
      else {
        title.textContent = a.title; box.appendChild(el('p', TOPIC_LABEL[a.topic], 'muted'));
        a.body.forEach(function (para) { box.appendChild(el('p', para)); });
      }
      var back = el('a', COPY.back); back.setAttribute('href', 'learn.html'); box.appendChild(el('p')).appendChild(back);
    } else {
      title.textContent = COPY.title;
      if (!items.length) box.appendChild(el('p', COPY.none));
      var arts = items.filter(function (e) { return e.kind === 'article'; }), vids = items.filter(function (e) { return e.kind === 'video'; });
      if (arts.length) {
        box.appendChild(el('h2', COPY.articles));
        arts.forEach(function (e) {
          var card = el('div', null, 'learn-card'); card.appendChild(el('p', TOPIC_LABEL[e.topic], 'muted'));
          var h = el('h3'); var l = el('a', e.title); l.setAttribute('href', 'learn.html?a=' + encodeURIComponent(e.id)); h.appendChild(l); card.appendChild(h);
          card.appendChild(el('p', e.blurb)); box.appendChild(card);
        });
      }
      if (vids.length) {
        box.appendChild(el('h2', COPY.videos)); box.appendChild(el('p', COPY.ytNote, 'muted'));
        vids.forEach(function (e) {
          var card = el('div', null, 'learn-card'); card.appendChild(el('p', TOPIC_LABEL[e.topic] + ' · ' + e.channel, 'muted'));
          card.appendChild(el('h3', e.title)); card.appendChild(el('p', e.blurb));
          var l = el('a', COPY.watch); l.setAttribute('href', e.url); l.setAttribute('target', '_blank'); l.setAttribute('rel', 'noopener noreferrer'); card.appendChild(l);
          box.appendChild(card);
        });
      }
    }
    box.appendChild(el('p', COPY.note, 'muted'));
  }
  var api = { TOPICS: TOPICS, checkItem: checkItem, publicItems: publicItems, find: find, render: render, COPY: COPY };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.FMW_LEARN = api;
  var doc = root.document;
  if (!doc || doc.body.getAttribute('data-page') !== 'learn') return;
  var a = new URLSearchParams(root.location.search).get('a') || '';
  root.fetch('data/learn.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).catch(function () { return { items: [] }; })
    .then(function (data) { render(doc, data, a); });
})(typeof self !== 'undefined' ? self : this);
