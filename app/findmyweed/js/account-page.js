// ONE shared FMW-branded ACCOUNT PAGE template (owner direction 2026-11-27): every brand page and every licensed-business page is drawn by this function.
//   FMW_ACCOUNT.build(doc, profile, opts) -> <article class="acct">
// profile = { name (required), category, location, phone, website, claimed, source, theme }
//   name / category / location: plain text, drawn with textContent only. Anything empty is simply NOT drawn (no placeholder, no "not listed").
//   phone / website: the PUBLIC contact block, nothing else. A phone must be a real US / E.164 number and a website an http(s) URL with no credentials; anything else is dropped, never repaired or guessed.
//   claimed: false (default) = the page says "Unclaimed listing, info from public sources" and offers "Own this business? Claim it" (a link to the business sign-up). true = both are left out.
//   source: where the public info came from (a short label such as "the brand's own site" or "the state license record"); drawn as a "Source:" line on an unclaimed page.
//   theme: OPTIONAL re-skin for a business that claimed and pays: { band, onBand, accent } as #rrggbb. It becomes three CSS custom properties on the article (--acct-band, --acct-on, --acct-accent)
//   and nothing else: no markup, no URL, no script. A theme that is not three clean colours with readable contrast is ignored and the FMW colours stay. No colour is hard-coded in the markup or in this file's drawing code.
//   contactNote: OPTIONAL one line drawn under the contact block (e.g. "From the state license record (DCC), Nov 25, 2026"); correctHref: OPTIONAL link drawn as "Remove or correct this info" (a mailto: or an https: link).
// opts = { copy (default window.FMW_COPY), claimHref }
(function (root) {
  var HEX = /^#[0-9a-f]{6}$/i;
  function text(v, max) { return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : ''; }
  // same rules as js/contact.js (a US number whose area code and exchange start 2-9, or +E.164) and https-only websites
  function cleanPhone(raw) {
    var s = typeof raw === 'string' ? raw.trim() : ''; if (!s || !/^\+?[0-9 ().-]+$/.test(s)) return '';
    var plus = s.charAt(0) === '+', d = s.replace(/[^0-9]/g, '');
    if (plus) return /^[1-9][0-9]{7,14}$/.test(d) && !(d.length === 11 && d.charAt(0) === '1' && !/^1[2-9][0-9]{2}[2-9][0-9]{6}$/.test(d)) ? '+' + d : '';
    if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
    return /^[2-9][0-9]{2}[2-9][0-9]{6}$/.test(d) ? '+1' + d : '';
  }
  function cleanWebsite(raw) {
    var s = typeof raw === 'string' ? raw.trim() : ''; if (!s || s.length > 300 || /[\s<>"'`\\]/.test(s) || !/^https?:\/\//i.test(s)) return '';
    var u; try { u = new URL(s); } catch (e) { return ''; }
    return (u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(u.hostname) && u.href.length <= 300 ? u.href : '';
  }
  function showPhone(e164) { var m = /^\+1([2-9][0-9]{2})([2-9][0-9]{2})([0-9]{4})$/.exec(e164); return m ? '(' + m[1] + ') ' + m[2] + '-' + m[3] : e164; }
  function showSite(url) { try { return new URL(url).hostname.replace(/^www\./i, ''); } catch (e) { return url; } }
  function lum(hex) { var c = [1, 3, 5].map(function (i) { var v = parseInt(hex.substr(i, 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  function ratio(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  // a theme is used only when all three are #rrggbb, the text reads on the band (4.5:1) and the accent reads on the band (3:1); otherwise null (= the FMW colours)
  function theme(t) {
    if (!t || typeof t !== 'object' || !HEX.test(t.band || '') || !HEX.test(t.onBand || '') || !HEX.test(t.accent || '')) return null;
    return ratio(t.band, t.onBand) >= 4.5 && ratio(t.band, t.accent) >= 3 ? { band: t.band.toLowerCase(), onBand: t.onBand.toLowerCase(), accent: t.accent.toLowerCase() } : null;
  }
  // the initial tile: the first letters of the first two words (text in FMW style: never a logo or mark)
  function initials(name) { var w = name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean); return (w.length > 1 ? w[0].charAt(0) + w[1].charAt(0) : (w[0] || '?').slice(0, 2)).toUpperCase(); }
  function build(doc, profile, opts) {
    opts = opts || {}; var C = opts.copy || root.FMW_COPY || {}, p = profile && typeof profile === 'object' ? profile : {};
    var name = text(p.name, 120); if (!name) return null;
    function el(tag, cls, t) { var e = doc.createElement(tag); if (cls) e.className = cls; if (t != null) e.textContent = t; return e; }
    var art = el('article', 'acct'), th = theme(p.theme);
    if (th && art.style && art.style.setProperty) { art.style.setProperty('--acct-band', th.band); art.style.setProperty('--acct-on', th.onBand); art.style.setProperty('--acct-accent', th.accent); art.setAttribute('data-skin', 'custom'); }
    else art.setAttribute('data-skin', 'fmw');
    var head = el('header', 'acct-head'), tile = el('div', 'acct-tile', initials(name)); tile.setAttribute('aria-hidden', 'true'); head.appendChild(tile);
    var who = el('div', 'acct-who'); who.appendChild(el('h1', 'name', name));
    var cat = text(p.category, 80), loc = text(p.location, 120);
    if (cat) who.appendChild(el('p', 'acct-cat', cat)); if (loc) who.appendChild(el('p', 'acct-loc', loc));
    head.appendChild(who); art.appendChild(head);
    var tel = cleanPhone(p.phone), web = cleanWebsite(p.website);
    if (tel || web) {   // the public contact block: a phone number and a website link, nothing else
      var cc = el('section', 'card acct-contact'); cc.setAttribute('data-card', 'contact'); cc.appendChild(el('h2', null, C.contactTitle || 'Contact'));
      var ul = el('ul', 'acct-lines');
      if (tel) { var li = el('li'), a = el('a', 'call', showPhone(tel)); a.href = 'tel:' + tel; a.setAttribute('aria-label', C.callLabel ? C.callLabel(name) : 'Call ' + name); li.appendChild(a); ul.appendChild(li); }
      if (web) { var l2 = el('li'), w = el('a', 'website', showSite(web)); w.href = web; w.target = '_blank'; w.rel = 'noopener noreferrer nofollow'; w.setAttribute('aria-label', C.websiteLabel ? C.websiteLabel(name) : 'Website for ' + name + ' (opens in a new tab)'); l2.appendChild(w); ul.appendChild(l2); }
      cc.appendChild(ul);
      var cn = text(p.contactNote, 160); if (cn) cc.appendChild(el('p', 'muted acct-contact-src', cn));
      var ch = typeof p.correctHref === 'string' && /^(mailto:[^\s]+|https:\/\/[^\s]+)$/.test(p.correctHref) ? p.correctHref : '';
      if (ch) { var cx = el('a', 'acct-correct', C.acctCorrect || 'Remove or correct this info'); cx.href = ch; cc.appendChild(cx); }
      art.appendChild(cc);
    }
    if (p.claimed !== true) {
      var un = el('section', 'card acct-unclaimed'); un.setAttribute('data-card', 'unclaimed');
      un.appendChild(el('p', 'acct-flag', C.acctUnclaimed || 'Unclaimed listing — info from public sources'));
      var src = text(p.source, 120); if (src) un.appendChild(el('p', 'muted acct-source', C.acctSource ? C.acctSource(src) : 'Source: ' + src));
      var ca = el('a', 'btn ghost acct-claim', C.acctClaim || 'Own this business? Claim it'); ca.href = typeof opts.claimHref === 'string' && opts.claimHref ? opts.claimHref : 'signup.html?as=business'; un.appendChild(ca); art.appendChild(un);
    }
    return art;
  }
  var api = { build: build, cleanPhone: cleanPhone, cleanWebsite: cleanWebsite, theme: theme, initials: initials, showPhone: showPhone };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FMW_ACCOUNT = api;
})(typeof window !== 'undefined' ? window : globalThis);
