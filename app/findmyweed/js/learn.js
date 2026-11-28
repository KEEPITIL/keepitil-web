// FMW LEARN page logic (learn.html; KODE/Joe 2026-11-23, layout 2026-11-27): a header, topic chips, featured guides and a FEED of posts and video cards.
// Items come from data/learn.json only. An item is public only when status is "published" AND reviewed_by is set AND every text passes the shared ad
// rules (FMW_AD_RULES.checkText: health / minors / over-consumption / free) plus the checks below. Written for plain text only (text nodes).
// VIDEOS: a card draws a LOCAL thumbnail tile (no external image, no request) and nothing else until the visitor presses Play; only then is ONE embedded
// player created, lazy-loaded, never autoplaying, from the privacy-friendly hosts the Learn page CSP allows (youtube-nocookie.com, player.vimeo.com).
// Where a list has no published items yet, clearly marked PLACEHOLDER cards hold the layout; they are not links and carry no outside address.
(function (root) {
  var TOPICS = ['basics', 'strains', 'consumption', 'safety-law', 'medical', 'business', 'licenses', 'lab-results', 'age-and-id', 'delivery', 'reporting'];
  var TOPIC_LABEL = { basics: 'Basics', strains: 'Strains', consumption: 'Consumption', 'safety-law': 'Safety & law', medical: 'Medical', business: 'Business',
    licenses: 'Licenses', 'lab-results': 'Lab results', 'age-and-id': 'Age and ID', delivery: 'Delivery', reporting: 'Reporting a seller' };
  // the chips the page shows; the older, narrower topics fold into them
  var CHIPS = ['basics', 'strains', 'consumption', 'safety-law', 'medical', 'business'];
  var GROUP = { licenses: 'safety-law', 'age-and-id': 'safety-law', delivery: 'safety-law', reporting: 'safety-law', 'lab-results': 'basics' };
  function groupOf(topic) { return GROUP[topic] || topic; }
  var ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  // The site-wide no-sales rule (tests/basics.test.js scans all copy): Learn explains, it never sells or prices anything.
  var SALES = /\b(buy|buying|order|orders|ordering|purchase|checkout|check out|cart|basket|price|prices|pricing|pay|payment|payments|paid|sale|sales|sell|selling|deal|deals|discount|coupon|promo|shop now|add to)\b|\$\d/i;
  var YT = /^https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})$/;
  var VIMEO = /^https:\/\/vimeo\.com\/([0-9]{6,12})$/;
  var DURATION = /^(?:[0-9]{1,2}:)?[0-5]?[0-9]:[0-5][0-9]$/;
  // The one place a video URL from the data file becomes an embed address: two hosts, nothing else, no autoplay parameter.
  function embedFor(url) {
    var u = String(url == null ? '' : url), m = YT.exec(u);
    if (m) return { host: 'YouTube', src: 'https://www.youtube-nocookie.com/embed/' + m[1] + '?rel=0', page: u };
    m = VIMEO.exec(u);
    if (m) return { host: 'Vimeo', src: 'https://player.vimeo.com/video/' + m[1] + '?dnt=1', page: u };
    return null;
  }
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
    if (e.featured != null && typeof e.featured !== 'boolean') p.push('featured');
    if (e.kind === 'video') {
      if (!embedFor(e.url)) p.push('url');
      if (typeof e.channel !== 'string' || !e.channel.trim() || e.channel.length > 60 || /[<>]/.test(e.channel)) p.push('channel');
      if (e.duration != null && (typeof e.duration !== 'string' || !DURATION.test(e.duration))) p.push('duration');
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
  // Featured: the items marked featured (up to three), else the first three guides. The feed is everything else, in file order.
  function split(items) {
    var marked = items.filter(function (e) { return e.featured === true; }), arts = items.filter(function (e) { return e.kind === 'article'; });
    var featured = (marked.length ? marked : arts).slice(0, 3);
    return { featured: featured, feed: items.filter(function (e) { return featured.indexOf(e) < 0; }) };
  }
  var COPY = {
    title: 'Learn', lead: 'Plain-language guides and videos for adults 21+. General information, not medical or legal advice.', none: 'Learning pages are coming soon.',
    chips: 'Topics', all: 'All', featured: 'Featured', feed: 'Feed', feedNote: 'Guides and videos in one list.', back: 'All guides', search: 'Search licensed businesses',
    play: 'Play video', ytNote: 'A video loads from YouTube or Vimeo only when you press Play, and never starts by itself. Those sites may set cookies; Find My Weed does not.',
    watchOn: 'Open on ', placeholder: 'Placeholder', soon: 'Coming soon', missing: 'We do not have that guide.', emptyTopic: 'Nothing in this topic yet.',
    note: 'Cannabis is for adults 21+. These pages are general information, not medical or legal advice.'
  };
  var PH_FEATURED = [{ topic: 'basics', t: 'Guide placeholder' }, { topic: 'safety-law', t: 'Guide placeholder' }, { topic: 'consumption', t: 'Guide placeholder' }];
  var PH_FEED = [{ kind: 'video', topic: 'basics', t: 'Video placeholder' }, { kind: 'article', topic: 'strains', t: 'Post placeholder' }, { kind: 'video', topic: 'safety-law', t: 'Video placeholder' }, { kind: 'article', topic: 'business', t: 'Post placeholder' }];
  function render(doc, data, articleId, opts) {
    var title = doc.getElementById('learn-title'), box = doc.getElementById('learn');
    if (!title || !box) return;
    while (box.firstChild) box.removeChild(box.firstChild);
    function el(tag, text, cls) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function on(node, type, fn) { if (node && typeof node.addEventListener === 'function') node.addEventListener(type, fn); }
    var items = publicItems(data);
    if (articleId) {
      var a = find(data, articleId);
      if (!a) { title.textContent = COPY.missing; }
      else {
        title.textContent = a.title; box.appendChild(el('p', TOPIC_LABEL[a.topic], 'muted'));
        a.body.forEach(function (para) { box.appendChild(el('p', para)); });
      }
      var back = el('a', COPY.back); back.setAttribute('href', 'learn.html'); box.appendChild(el('p')).appendChild(back);
      box.appendChild(el('p', COPY.note, 'muted'));
      return;
    }
    title.textContent = COPY.title;
    box.appendChild(el('p', COPY.lead, 'learn-lead'));
    // topic chips (buttons with a pressed state; they filter the two lists below and change nothing else)
    var chips = el('div', null, 'learn-chips'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', COPY.chips);
    var sel = (opts && opts.topic) || 'all', chipBtns = {};
    ['all'].concat(CHIPS).forEach(function (id) {
      var b = el('button', id === 'all' ? COPY.all : TOPIC_LABEL[id], 'learn-chip'); b.setAttribute('type', 'button'); b.setAttribute('data-topic', id); b.setAttribute('aria-pressed', id === sel ? 'true' : 'false');
      chipBtns[id] = b; chips.appendChild(b);
    });
    box.appendChild(chips);
    var host = el('div', null, 'learn-body'); box.appendChild(host);
    function card(e) {
      var isVid = e.kind === 'video', c = el('article', null, 'learn-card' + (isVid ? ' is-video' : '')); c.setAttribute('data-kind', e.kind); c.setAttribute('data-topic', groupOf(e.topic));
      var thumb = el('div', null, 'learn-thumb' + (isVid ? '' : ' is-guide')); c.appendChild(thumb);
      var emb = isVid ? embedFor(e.url) : null;
      if (isVid && emb) {
        var play = el('button', null, 'learn-play'); play.setAttribute('type', 'button'); play.setAttribute('aria-label', COPY.play + ': ' + e.title); play.appendChild(el('span', COPY.play, 'sr')); thumb.appendChild(play);
        on(play, 'click', function () {
          var f = doc.createElement('iframe'); f.className = 'learn-frame'; f.setAttribute('src', emb.src); f.setAttribute('title', e.title); f.setAttribute('loading', 'lazy');
          f.setAttribute('allow', 'fullscreen; picture-in-picture'); f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin'); f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
          while (thumb.firstChild) thumb.removeChild(thumb.firstChild); thumb.appendChild(f);
        });
      }
      var meta = el('p', null, 'learn-meta muted'); meta.appendChild(el('span', TOPIC_LABEL[e.topic], 'learn-tag'));
      if (isVid) meta.appendChild(el('span', e.channel + (e.duration ? ' · ' + e.duration : ''))); c.appendChild(meta);
      var h = el('h3'); if (isVid) h.appendChild(el('span', e.title)); else { var l = el('a', e.title); l.setAttribute('href', 'learn.html?a=' + encodeURIComponent(e.id)); h.appendChild(l); }
      c.appendChild(h); c.appendChild(el('p', e.blurb, 'learn-blurb'));
      if (isVid && emb) { var o = el('a', COPY.watchOn + emb.host, 'learn-ext'); o.setAttribute('href', emb.page); o.setAttribute('target', '_blank'); o.setAttribute('rel', 'noopener noreferrer'); c.appendChild(o); }
      return c;
    }
    function placeholder(p) {
      var isVid = p.kind === 'video', c = el('article', null, 'learn-card is-placeholder' + (isVid ? ' is-video' : '')); c.setAttribute('data-placeholder', 'true'); c.setAttribute('data-topic', groupOf(p.topic)); c.setAttribute('data-kind', p.kind || 'article');
      c.appendChild(el('div', null, 'learn-thumb' + (isVid ? '' : ' is-guide')));
      var meta = el('p', null, 'learn-meta muted'); meta.appendChild(el('span', COPY.placeholder, 'learn-tag is-ph')); meta.appendChild(el('span', TOPIC_LABEL[p.topic])); c.appendChild(meta);
      c.appendChild(el('h3', p.t)); c.appendChild(el('p', COPY.soon, 'learn-blurb'));
      return c;
    }
    function section(cls, heading, note) {
      var s = el('section', null, 'learn-sec ' + cls); s.appendChild(el('h2', heading)); if (note) s.appendChild(el('p', note, 'muted')); return s;
    }
    function draw(topic) {
      while (host.firstChild) host.removeChild(host.firstChild);
      Object.keys(chipBtns).forEach(function (k) { chipBtns[k].setAttribute('aria-pressed', k === topic ? 'true' : 'false'); });
      var inTopic = function (e) { return topic === 'all' || groupOf(e.topic) === topic; };
      var sp = split(items), feat = sp.featured.filter(inTopic), feed = sp.feed.filter(inTopic);
      var fs = section('learn-featured', COPY.featured), fg = el('div', null, 'learn-grid'); fs.appendChild(fg);
      if (feat.length) feat.forEach(function (e) { fg.appendChild(card(e)); });
      else if (!items.length) PH_FEATURED.filter(inTopic).forEach(function (p) { fg.appendChild(placeholder(p)); });
      if (!fg.firstChild) fs.appendChild(el('p', COPY.emptyTopic, 'muted'));
      host.appendChild(fs);
      var ds = section('learn-feed', COPY.feed, COPY.feedNote), dg = el('div', null, 'learn-grid'); ds.appendChild(dg);
      if (feed.length) feed.forEach(function (e) { dg.appendChild(card(e)); });
      else if (!items.length) PH_FEED.filter(inTopic).forEach(function (p) { dg.appendChild(placeholder(p)); });
      if (!dg.firstChild) ds.appendChild(el('p', COPY.emptyTopic, 'muted'));
      ds.appendChild(el('p', COPY.ytNote, 'muted learn-fine'));
      host.appendChild(ds);
    }
    Object.keys(chipBtns).forEach(function (k) { on(chipBtns[k], 'click', function () { draw(k); }); });
    draw(sel);
    box.appendChild(el('p', COPY.note, 'muted'));
  }
  var api = { TOPICS: TOPICS, CHIPS: CHIPS, groupOf: groupOf, embedFor: embedFor, checkItem: checkItem, publicItems: publicItems, find: find, split: split, render: render, COPY: COPY };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.FMW_LEARN = api;
  var doc = root.document;
  if (!doc || doc.body.getAttribute('data-page') !== 'learn') return;
  var q = new URLSearchParams(root.location.search), a = q.get('a') || '', t = q.get('t') || 'all';
  // /learn/ is a subfolder page and this script is not deferred, so it runs BEFORE pages.js (which prefixes data/ URLs on deep pages): build the absolute URL here, from the site's own base path, the same rule as pages.js (DB)
  var cfg = root.FMW_CONFIG || {}, deep = !!(doc.body.getAttribute('data-deep') || doc.body.getAttribute('data-county')), dataUrl = function (rel) { return (deep ? (cfg.basePath || '') + '/' : '') + rel; };
  root.fetch(dataUrl('data/learn.json'), { cache: 'no-store' }).then(function (r) { return r.json(); }).catch(function () { return { items: [] }; })
    .then(function (data) { render(doc, data, a, { topic: CHIPS.indexOf(t) >= 0 ? t : 'all' }); });
})(typeof self !== 'undefined' ? self : this);
