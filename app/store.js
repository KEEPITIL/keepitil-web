// KEEPITIL Apps (/app/). Renders /app/catalog.json into the Today, Apps, Games and Search
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

  // ---- Pure catalog logic: no DOM. the /app/ test in assets/js loads this file in node:vm and
  // tests these functions directly. Catalog flags:
  //   hidden: true  in the catalog but never rendered anywhere (pre-launch).
  //   adults: true  age-restricted item (badge "18+"; age rules vary by state). Only inside a shelf marked adults: true; never on Today or a feature
  //                 card; never in the empty-search Suggested list; in search results it is grouped
  //                 under its own "For adults" heading after everything else.
  //   kids: true    never in an adults shelf, and an adults shelf is never directly next to a shelf
  //                 that holds a kids item.
  function visibleItems(cat) {
    return ((cat && cat.items) || []).filter(function (it) {
      return !!it && it.hidden !== true && !!safePath(it.href) && !!safePath(it.icon);
    });
  }

  function indexById(items) {
    var byId = {};
    items.forEach(function (it) { byId[it.id] = it; });
    return byId;
  }

  // Items a shelf may render: adults shelves take only adult, non-kids items; others take no adult items.
  function shelfItems(s, byId) {
    return ((s && s.items) || []).map(function (id) { return byId[id]; }).filter(function (it) {
      if (!it) return false;
      return s.adults === true ? (it.adults === true && !it.kids) : !it.adults;
    });
  }

  // Today stories and feature cards never show adult items.
  function placeable(it) { return !!it && !it.adults; }

  function haystack(item) {
    return [item.name, item.subtitle, item.description, item.kind, item.kind === 'game' ? 'games' : 'apps',
      item.caption, (item.keywords || []).join(' ')].join(' ').toLowerCase();
  }

  // Search: an empty query suggests every non-adult item. A query returns non-adult matches in
  // `main` and adult matches separately in `adults`, so the page can group them apart.
  function searchGroups(items, q) {
    var terms = String(q || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    var out = { main: [], adults: [] };
    items.forEach(function (it) {
      var h = haystack(it);
      if (!terms.every(function (t) { return h.indexOf(t) >= 0; })) return;
      if (it.adults) { if (terms.length) out.adults.push(it); } else out.main.push(it);
    });
    // When a "For adults" group is shown, kids items lead the main results (furthest from that group).
    if (out.adults.length) {
      out.main = out.main.filter(function (it) { return !!it.kids; })
        .concat(out.main.filter(function (it) { return !it.kids; }));
    }
    return out;
  }

  // What the search panel draws, in order: rows of main results, then (only when there are adult
  // results) a divider, the "For adults" heading and the adult rows.
  function searchLayout(items, q) {
    var g = searchGroups(items, q);
    var seq = g.main.map(function (it) { return { type: 'row', item: it }; });
    if (g.adults.length) {
      seq.push({ type: 'divider' });
      seq.push({ type: 'heading', text: 'For adults' });
      g.adults.forEach(function (it) { seq.push({ type: 'row', item: it }); });
    }
    return seq;
  }

  // Shelves to draw for one tab: each with the items it may show. A shelf with nothing visible
  // (for example the For adults shelf while its only item is hidden) is skipped entirely.
  function visibleShelves(list, byId) {
    return (list || []).map(function (s) { return { shelf: s, items: shelfItems(s, byId) }; })
      .filter(function (x) { return x.items.length > 0; });
  }

  // Layout rules checked against the WHOLE catalog, hidden items included, so the launch state is
  // already valid before an item is unhidden. Returns a list of problems ([] when good).
  function layoutProblems(cat) {
    var p = [];
    var byId = indexById((cat && cat.items) || []);
    var isAdult = function (id) { return !!(byId[id] && byId[id].adults); };
    var isKid = function (id) { return !!(byId[id] && byId[id].kids); };
    Object.keys(byId).forEach(function (id) { if (isAdult(id) && isKid(id)) p.push(id + ' is both kids and adults'); });
    ((cat && cat.today) || []).forEach(function (s) { if (isAdult(s.item)) p.push('adult item ' + s.item + ' on Today'); });
    var features = (cat && cat.features) || {};
    Object.keys(features).forEach(function (k) {
      if (isAdult(features[k].item)) p.push('adult item ' + features[k].item + ' in the ' + k + ' feature');
    });
    var shelves = (cat && cat.shelves) || {};
    Object.keys(shelves).forEach(function (tab) {
      var list = shelves[tab] || [];
      list.forEach(function (s, i) {
        var ids = s.items || [];
        if (s.adults === true) {
          ids.forEach(function (id) {
            if (!isAdult(id)) p.push(tab + '/' + s.title + ': non-adult item ' + id + ' in an adults shelf');
            if (isKid(id)) p.push(tab + '/' + s.title + ': kids item ' + id + ' in an adults shelf');
          });
          if (!/\badults\b/i.test(s.title || '')) p.push(tab + '/' + s.title + ': adults shelf title must say adults');
          if (/21\s*\+|21 and over/i.test([s.title, s.subtitle].join(' '))) p.push(tab + '/' + s.title + ': adults shelf must not claim 21+ only');
          [list[i - 1], list[i + 1]].forEach(function (n) {
            if (n && (n.items || []).some(isKid)) p.push(tab + '/' + s.title + ': adults shelf next to kids shelf ' + n.title);
          });
        } else {
          ids.forEach(function (id) { if (isAdult(id)) p.push(tab + '/' + s.title + ': adult item ' + id + ' outside an adults shelf'); });
        }
      });
    });
    return p;
  }

  var LOGIC = { safePath: safePath, visibleItems: visibleItems, shelfItems: shelfItems, placeable: placeable,
    searchGroups: searchGroups, searchLayout: searchLayout, visibleShelves: visibleShelves,
    layoutProblems: layoutProblems };
  if (typeof document === 'undefined') { globalThis.KILStoreLogic = LOGIC; return; }

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
    if (item.adults) meta.appendChild(el('span', 'adult', '18+'));
    r.appendChild(meta);
    var act = el('div', 'act');
    act.appendChild(actionButton(item));
    if (item.caption && !item.kids && !item.adults) act.appendChild(el('span', 'cap', item.caption));
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

  function shelf(s, items) {
    var sec = el('section', 'shelf');
    var h = el('h3', null, s.title + ' ');
    h.appendChild(el('span', 'chev', '›'));
    sec.appendChild(h);
    if (s.subtitle) sec.appendChild(el('p', 'sub', s.subtitle));
    var track = el('div', 'track');
    items.forEach(function (it) { track.appendChild(row(it)); });
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


  function wireSearch(items) {
    var input = document.getElementById('q');
    var out = slot('search');
    var label = document.getElementById('search-label');
    function render() {
      var q = input.value.trim();
      var seq = searchLayout(items, q);
      label.textContent = q ? 'Results' : 'Suggested';
      out.textContent = '';
      if (!seq.length) { out.appendChild(el('p', 'empty', 'Nothing matches \u201C' + q + '\u201D yet.')); return; }
      seq.forEach(function (e) {
        if (e.type === 'row') out.appendChild(row(e.item));
        else if (e.type === 'divider') { var hr = el('hr', 'search-divider'); hr.setAttribute('aria-hidden', 'true'); out.appendChild(hr); }
        else if (e.type === 'heading') out.appendChild(el('h3', 'search-sub', e.text));
      });
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
    var items = visibleItems(cat);
    var byId = indexById(items);

    var today = slot('today');
    (cat.today || []).forEach(function (s) { if (placeable(byId[s.item])) today.appendChild(storyCard(s, byId[s.item])); });
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
      if (f && placeable(byId[f.item])) slot('feature-' + k).appendChild(feature(f, byId[f.item]));
      var box = slot('shelves-' + k);
      visibleShelves((cat.shelves && cat.shelves[k]) || [], byId).forEach(function (x) { box.appendChild(shelf(x.shelf, x.items)); });
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
