// FMW strain page logic (strain.html; docs/FMW_DEALS_STRAIN_SPEC_DRAFT.md). Facts only: type label, aroma and flavor words, lineage
// when known. NO effects, NO medical claims, NO ratings, NO lab numbers (those come from a product's own certificate), nothing to buy here.
// An entry is public only when status is "published" AND reviewed_by is set. Not linked from any page yet; the page is noindex.
// Pure functions are exported for tests; the page part only runs in a browser and writes text nodes only (textContent).
(function (root) {
  var TYPES = ['indica', 'sativa', 'hybrid'];
  var SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  // Words that make a strain page an effect or health claim (spec section 1, rule 4). Reuse of FMW_AD_RULES.checkText (deals) is added
  // on top when that module is loaded on the page.
  var EFFECT = /\b(uplift(ing|s)?|relax(ing|es|ed|ation)?|euphori(a|c)|energi[sz]ing|sedat(ing|ive)|calm(ing|s)?|creative|focused|sleepy|couch[- ]?lock|munchies|giggly|happy|effects?|relie(f|ves|ve)|treat(s|ment|ing)?|cure[sd]?|heal(s|ing)?|therap(y|eutic)|medicinal|anxiety|depression|insomnia|pain|cancer|ptsd|helps?)\b/i;
  function textProblems(s) {
    var p = [], t = String(s == null ? '' : s);
    if (EFFECT.test(t)) p.push('effect-or-health-claim');
    var ar = root && root.FMW_AD_RULES;
    if (ar && typeof ar.checkText === 'function') { var r = ar.checkText(t); if (r && r.hits && r.hits.length) p.push('ad-rules'); }
    return p;
  }
  function checkEntry(e) {
    var p = [];
    if (!e || typeof e !== 'object') return ['entry'];
    if (typeof e.slug !== 'string' || !SLUG.test(e.slug) || e.slug.length > 40) p.push('slug');
    if (typeof e.name !== 'string' || !e.name.trim() || e.name.length > 60 || !/^[A-Za-z0-9][A-Za-z0-9 '’.&#-]*$/.test(e.name)) p.push('name');   // letters, digits and a few marks only: never markup
    if (TYPES.indexOf(e.type) < 0) p.push('type');
    ['aroma_words', 'flavor_words'].forEach(function (k) {
      if (!Array.isArray(e[k]) || e[k].length > 8 || e[k].some(function (w) { return typeof w !== 'string' || !w.trim() || w.length > 24; })) p.push(k);
    });
    ['lineage_text', 'description_text'].forEach(function (k) {
      if (e[k] != null && (typeof e[k] !== 'string' || e[k].length > 400)) p.push(k);
    });
    [e.name, Array.isArray(e.aroma_words) ? e.aroma_words.join(' ') : '', Array.isArray(e.flavor_words) ? e.flavor_words.join(' ') : '', e.lineage_text, e.description_text].forEach(function (t, i) {
      textProblems(t).forEach(function (x) { p.push('copy' + i + ':' + x); });
    });
    if (typeof e.source_note !== 'string' || !e.source_note.trim()) p.push('source_note');
    return p;
  }
  // The entries a visitor may see: published, reviewed, and with no problem at all.
  function publicEntries(data) {
    var list = data && Array.isArray(data.strains) ? data.strains : [];
    return list.filter(function (e) {
      return e && e.status === 'published' && typeof e.reviewed_by === 'string' && e.reviewed_by.trim() && checkEntry(e).length === 0;
    });
  }
  function find(data, slug) {
    var s = String(slug || '').toLowerCase();
    return publicEntries(data).filter(function (e) { return e.slug === s; })[0] || null;
  }
  function typeLabel(t) { return t === 'indica' ? 'Indica' : t === 'sativa' ? 'Sativa' : 'Hybrid'; }
  var COPY = {
    note: 'Cannabis is for adults 21+. This page states facts only: no effects and no medical claims.',
    type: 'Type',
    typeNote: 'A label used in the trade, not a promise about how anything feels.',
    aroma: 'Aroma', flavor: 'Flavor', lineage: 'Lineage',
    where: 'Where to find it',
    whereNone: 'No licensed menu carries this strain yet.',
    missing: 'We do not have a page for that strain.',
    missingNote: 'Strain pages are being added. Licensed businesses are listed on the search page.',
    back: 'Search licensed businesses'
  };
  function render(doc, data, slug) {
    var title = doc.getElementById('strain-title'), box = doc.getElementById('strain');
    if (!title || !box) return;
    while (box.firstChild) box.removeChild(box.firstChild);
    function el(tag, text, cls) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    var e = find(data, slug);
    if (!e) {
      title.textContent = COPY.missing; box.appendChild(el('p', COPY.missingNote));
    } else {
      title.textContent = e.name;
      var dl = el('dl');
      function row(k, v) { if (v == null || v === '' || (Array.isArray(v) && !v.length)) return; dl.appendChild(el('dt', k)); dl.appendChild(el('dd', Array.isArray(v) ? v.join(', ') : v)); }
      row(COPY.type, typeLabel(e.type)); row(COPY.aroma, e.aroma_words); row(COPY.flavor, e.flavor_words); row(COPY.lineage, e.lineage_text);
      box.appendChild(dl);
      box.appendChild(el('p', COPY.typeNote, 'muted'));
      if (e.description_text) box.appendChild(el('p', e.description_text));
      box.appendChild(el('h2', COPY.where)); box.appendChild(el('p', COPY.whereNone, 'muted'));   // menu links arrive with the menu slice
    }
    box.appendChild(el('p', COPY.note, 'muted'));
    var a = el('a', COPY.back); a.setAttribute('href', 'results.html'); box.appendChild(el('p')).appendChild(a);
  }
  var api = { TYPES: TYPES, checkEntry: checkEntry, publicEntries: publicEntries, find: find, render: render, COPY: COPY };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.FMW_STRAIN = api;
  var doc = root.document;
  if (!doc || doc.body.getAttribute('data-page') !== 'strain') return;
  var slug = (new URLSearchParams(root.location.search).get('s') || '');
  root.fetch('data/strains.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).catch(function () { return { strains: [] }; })
    .then(function (data) { render(doc, data, slug); });
})(typeof self !== 'undefined' ? self : this);
