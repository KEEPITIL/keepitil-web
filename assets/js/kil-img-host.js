/* Picture hosts that are known NOT to load from our pages (they refuse hotlinking, e.g. images.ra.co answers 403 and Chrome reports ERR_BLOCKED_BY_ORB).
   The shell already swaps a failed outside picture for the branded placeholder after the failure (keepitil-shell.js, tests/img-placeholder.test.cjs); this list lets pages
   skip the request in the first place, so there is no dead request and no flash of a broken picture. ONE list, used by the pages and by scripts/build-event-pages.mjs.
   clean(url) returns '' for a denied host (callers then show the placeholder or the no-cover layout), the url unchanged otherwise. Add a host only when it is proven unloadable. */
(function (root) {
  'use strict';
  var DENY = ['images.ra.co'];
  function host(u) { try { return new URL(String(u), 'https://keepitil.com/').hostname.toLowerCase(); } catch (e) { return ''; } }
  function denied(u) { var h = host(u); return !!h && DENY.indexOf(h) !== -1; }
  function clean(u) { return u && denied(u) ? '' : u; }
  var api = { DENY: DENY, denied: denied, clean: clean };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.KilImgHost = api;
})(typeof window !== 'undefined' ? window : globalThis);
