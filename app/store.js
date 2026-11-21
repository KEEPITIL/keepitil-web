// KEEPITIL storefront (/app/). Renders /app/catalog.json into the Today, Apps, Games and Search
// panels of /app/index.html. Same-origin only: the catalog is the one network request, every link
// is a root-relative path on keepitil.com, and text is set with textContent (no HTML parsing).
// No analytics, no storage, no third-party calls.
(function () {
  'use strict';

  var TABS = ['today', 'apps', 'games', 'search'];

  // Only root-relative same-site paths are allowed ("/x", never "//host" or "https:").
  function safePath(p) {
    return typeof p === 'string' && /^\/(?!\/)[^\s"'<>\\]*$/.test(p) ? p : null;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function img(src, cls, alt) {
    var s = safePath(src);
    var i = el('img', cls);
    if (s) i.src = s;
    i.alt = alt || '';
    i.loading = 'lazy';
    i.decoding = 'async';
    return i;
  }

  function actionButton(item) {
    var href = safePath(item.href);
    var a = el('a', 'get' + (item.status === 'soon' ? ' soon' : ''), item.cta || 'Open');
    if (href) a.href = href;
    a.setAttribute('aria-label', (item.cta || 'Open') + ' ' + item.name);
    return a;
  }

  function row(item) {
    var r = el('div', 'row');
    r.dataset.item = item.id;
    r.appendChild(img(item.icon, 'icon', ''));
    var meta = el('div', 'meta');
    meta.appendChild(el('div', 'name', item.name));
    meta.appendChild(el('div', 'subt', item.subtitle));
    if (item.kids) meta.appendChild(el('span', 'kids', 'For kids'));
    r.appendChild(meta);
    var act = el('div', 'act');
    act.appendChild(actionButton(item));
    if (item.caption && !item.kids) act.appendChild(el('span', 'cap', item.caption));
    r.appendChild(act);
    return r;
  }

  function storyCard(story, item) {
    var card = el('article', 'story');
    var link = el('a');
    var href = safePath(item.href);
    if (href) link.href = href;
    link.style.display = 'block';
    link.style.textDecoration = 'none';
    var art = el('div', 'art' + (story.image ? '' : ' icon-art'));
    if (story.image) {
      art.appendChild(img(story.image, 'photo', story.imageAlt || item.name));
    } else {
      art.appendChild(img(item.icon, 'center-icon', item.name));
    }
    art.appendChild(el('div', 'scrim'));
    art.appendChild(el('div', 'tag', story.eyebrow || ''));
    var copy = el('div', 'copy');
    copy.appendChild(el('h2', null, story.title));
    if (story.blurb) copy.appendChild(el('p', 'blurb', story.blurb));
    art.appendChild(copy);
    link.appendChild(art);
    card.appendChild(link);
    var foot = el('div', 'foot');
    var r = row(item);
    r.style.padding = '12px 20px';
    foot.appendChild(r);
    card.appendChild(foot);
    return card;
  }

  function feature(f, item) {
    var wrap = el('section', 'feature');
    wrap.appendChild(el('div', 'eyebrow', f.eyebrow || ''));
    wrap.appendChild(el('h2', null, f.title));
    if (f.blurb) wrap.appendChild(el('p', 'blurb', f.blurb));
    var card = el('a', 'card');
    var href = safePath(item.href);
    if (href) card.href = href;
    if (f.image) {
      card.appendChild(img(f.image, 'photo', f.imageAlt || item.name));
    } else {
      var art = el('div', 'art icon-art');
      art.style.position = 'absolute';
      art.style.inset = '0';
      art.appendChild(img(item.icon, 'center-icon', item.name));
      card.classList.add('story');
      card.appendChild(art);
    }
    var bar = el('div', 'bar');
    bar.appendChild(img(item.icon, null, ''));
    var t = el('div');
    t.appendChild(el('b', null, item.name));
    t.appendChild(el('small', null, item.subtitle));
    bar.appendChild(t);
    card.appendChild(bar);
    wrap.appendChild(card);
    return wrap;
  }

  function shelf(s, byId) {
    var sec = el('section', 'shelf');
    var h = el('h3', null, s.title + ' ');
    h.appendChild(el('span', 'chev', '›'));
    sec.appendChild(h);
    if (s.subtitle) sec.appendChild(el('p', 'sub', s.subtitle));
    var track = el('div', 'track');
    (s.items || []).forEach(function (id) { if (byId[id]) track.appendChild(row(byId[id])); });
    sec.appendChild(track);
    return sec;
  }

  function slot(name) { return document.querySelector('[data-slot="' + name + '"]'); }

  function selectTab(name, focus) {
    if (TABS.indexOf(name) < 0) name = 'today';
    TABS.forEach(function (t) {
      var tab = document.getElementById('tab-' + t);
      var panel = document.getElementById('panel-' + t);
      var on = t === name;
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
      panel.hidden = !on;
    });
    if (focus) document.getElementById('tab-' + name).focus();
    try { history.replaceState(null, '', '#' + name); } catch (e) { /* file:// or sandboxed */ }
  }

  function wireTabs() {
    var list = document.querySelector('[role="tablist"]');
    list.addEventListener('click', function (e) {
      var b = e.target.closest('[role="tab"]');
      if (b) selectTab(b.dataset.tab);
    });
    list.addEventListener('keydown', function (e) {
      var cur = TABS.indexOf(document.activeElement && document.activeElement.dataset.tab);
      if (cur < 0) return;
      var next = null;
      if (e.key === 'ArrowRight') next = (cur + 1) % TABS.length;
      else if (e.key === 'ArrowLeft') next = (cur + TABS.length - 1) % TABS.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = TABS.length - 1;
      if (next != null) { e.preventDefault(); selectTab(TABS[next], true); }
    });
    window.addEventListener('hashchange', function () { selectTab(location.hash.slice(1)); });
    selectTab(location.hash.slice(1));
  }

  function haystack(item) {
    return [item.name, item.subtitle, item.description, item.kind, item.kind === 'game' ? 'games' : 'apps',
      item.caption, (item.keywords || []).join(' ')].join(' ').toLowerCase();
  }

  function wireSearch(items) {
    var input = document.getElementById('q');
    var out = slot('search');
    var label = document.getElementById('search-label');
    function render() {
      var q = input.value.trim().toLowerCase();
      var terms = q.split(/\s+/).filter(Boolean);
      var hits = items.filter(function (it) {
        var h = haystack(it);
        return terms.every(function (t) { return h.indexOf(t) >= 0; });
      });
      label.textContent = q ? 'Results' : 'Suggested';
      out.textContent = '';
      if (!hits.length) { out.appendChild(el('p', 'empty', 'Nothing matches “' + input.value.trim() + '” yet.')); return; }
      hits.forEach(function (it) { out.appendChild(row(it)); });
    }
    input.addEventListener('input', render);
    document.querySelectorAll('[data-goto]').forEach(function (b) {
      b.addEventListener('click', function () { selectTab(b.dataset.goto); window.scrollTo(0, 0); });
    });
    document.querySelectorAll('[data-query]').forEach(function (b) {
      b.addEventListener('click', function () { input.value = b.dataset.query; render(); input.focus(); });
    });
    render();
  }

  function render(cat) {
    var items = (cat.items || []).filter(function (it) { return safePath(it.href) && safePath(it.icon); });
    var byId = {};
    items.forEach(function (it) { byId[it.id] = it; });

    var today = slot('today');
    (cat.today || []).forEach(function (s) { if (byId[s.item]) today.appendChild(storyCard(s, byId[s.item])); });
    var dev = el('a', 'story');
    dev.href = '/app/submit/';
    var art = el('div', 'art icon-art');
    art.style.aspectRatio = '16/7';
    art.appendChild(el('div', 'scrim'));
    art.appendChild(el('div', 'tag', 'For developers'));
    var copy = el('div', 'copy');
    copy.appendChild(el('h2', null, 'List your app on KEEPITIL'));
    copy.appendChild(el('p', 'blurb', 'How to send us your app or game for a listing.'));
    art.appendChild(copy);
    dev.appendChild(art);
    today.appendChild(dev);

    ['apps', 'games'].forEach(function (k) {
      var f = cat.features && cat.features[k];
      if (f && byId[f.item]) slot('feature-' + k).appendChild(feature(f, byId[f.item]));
      var box = slot('shelves-' + k);
      ((cat.shelves && cat.shelves[k]) || []).forEach(function (s) { box.appendChild(shelf(s, byId)); });
    });

    wireSearch(items);
  }

  wireTabs();
  fetch('/app/catalog.json', { credentials: 'same-origin' })
    .then(function (r) { if (!r.ok) throw new Error('catalog ' + r.status); return r.json(); })
    .then(render)
    .catch(function () {
      var t = slot('today');
      t.appendChild(el('p', 'empty', 'The catalog did not load. Try again in a moment.'));
    });
})();
