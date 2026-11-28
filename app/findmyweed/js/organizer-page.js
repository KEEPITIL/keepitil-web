// An EVENT ORGANIZER's public profile: a licensed-business record whose category is "eventorg", drawn on the shared account template (js/account-page.js).
// Draws what the state record gives (name, county or city, license number + the official record link) and, only when the organizer added them and the contact feature is on, a phone and a website.
// Never invents anything: no phone, site, flyer or event text unless it exists. Unclaimed until the organizer's own contact is read from the server.
(function (root) {
  function matches(l) { return !!(l && l.category === 'eventorg' && typeof l.name === 'string' && l.name); }
  function place(l, C) {
    var city = typeof l.city === 'string' ? l.city.trim() : '', county = typeof l.county === 'string' ? l.county.trim().replace(/\s+county$/i, '') : '';
    if (city) return city + ', CA';
    return county ? (C && C.countyName ? C.countyName(county) : county + ' County') : '';
  }
  function mount(win, doc, box, l, o) {
    o = o || {}; var C = o.copy || {}, A = win.FMW_ACCOUNT; if (!matches(l) || !A) return false;
    function el(tag, cls, t) { var e = doc.createElement(tag); if (cls) e.className = cls; if (t != null) e.textContent = t; return e; }
    var base = { name: l.name, category: (C.industryCat && C.industryCat.eventorg) || 'Event organizer', location: place(l, C), claimed: false, source: C.acctSourceRecord || 'the state license record' };
    var draw = function (p) {
      while (box.firstChild) box.removeChild(box.firstChild);
      var art = A.build(doc, p, { copy: C, claimHref: o.claimHref }); if (!art) return;
      box.appendChild(art);
      if (l.license) {   // the license card: the number as the state wrote it and the link to the official record (built by the caller from the allow-listed base)
        var lc = el('section', 'card acct-license'); lc.setAttribute('data-card', 'license'); lc.appendChild(el('h2', null, C.license || 'License')); lc.appendChild(el('p', 'mono', l.license));
        if (o.record) { var a = el('a', 'record', C.licenseRecord || 'Official record'); a.href = o.record; a.target = '_blank'; a.rel = 'noopener noreferrer'; lc.appendChild(a); }
        art.appendChild(lc);
      }
    };
    draw(base);
    // the organizer's own contact (a phone and a website it added itself, read only while site.json "contact" is on): the page then counts as claimed
    if (win.FMW_CONTACT && win.FMW_CONTACT_UTIL && win.FMW_CONTACT.forLicense) win.FMW_CONTACT.forLicense(l.license).then(function (r) {
      var k = r && r.ok ? win.FMW_CONTACT_UTIL.links(r.data) : { tel: '', website: '' };
      if (!k.tel && !k.website) return;
      draw(Object.assign({}, base, { phone: k.tel.replace(/^tel:/, ''), website: k.website, claimed: true }));
    }, function () {});
    return true;
  }
  var api = { matches: matches, mount: mount, place: place };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FMW_ORGANIZER_PAGE = api;
})(typeof window !== 'undefined' ? window : globalThis);
