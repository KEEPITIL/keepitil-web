// The home page (index.html) is indexable, but the same page with a search or filter in the address (?q=, ?f=, ?area=, ?city=, ?county=,
// ?delivery=, ?open=, ?storefront=) is a results view: keep those out of search indexes, like other directories do. A static host cannot send
// a different header per query, so this script switches the page's robots meta to noindex,follow when such a query is present.
// It only ever makes the page LESS indexable and never touches the user's browser, requests or data.
(function (root) {
  var KEYS = ['q', 'f', 'area', 'city', 'county', 'delivery', 'open', 'storefront'];
  function hasQuery(search) {
    var s = String(search == null ? '' : search).replace(/^\?/, '');
    if (!s) return false;
    return s.split('&').some(function (kv) { var i = kv.indexOf('='), k = i < 0 ? kv : kv.slice(0, i), v = i < 0 ? '' : kv.slice(i + 1); return KEYS.indexOf(k) >= 0 && v !== ''; });
  }
  function apply(doc, search) {
    if (!hasQuery(search) || !doc || !doc.querySelector) return false;
    var m = doc.querySelector('meta[name="robots"]');
    if (m) { m.setAttribute('content', 'noindex,follow'); return true; }
    return false;
  }
  var api = { KEYS: KEYS, hasQuery: hasQuery, apply: apply };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else if (root.document && root.location) apply(root.document, root.location.search);
})(this);
