/* KEEPITIL redirect stub: replaces the inline  location.replace(...)  one-liners on the moved-page stubs (CSP: no executable inline script).
   <script src="/assets/js/kil-redirect.js" data-to="/app/findmyweed/" data-keep="search,hash"></script>
   data-to   a site path ("/x", never "//host") or an https://keepitil.com/ URL; anything else is ignored
   data-keep "search", "hash" or "search,hash": append the current query string / fragment (the old  + location.search + location.hash) */
(function () {
  var s = document.currentScript; if (!s) return;
  var to = s.getAttribute('data-to') || '';
  if (!/^(\/(?!\/)|https:\/\/keepitil\.com\/)/.test(to)) return;
  var keep = (s.getAttribute('data-keep') || '').split(',');
  location.replace(to + (keep.indexOf('search') >= 0 ? location.search : '') + (keep.indexOf('hash') >= 0 ? location.hash : ''));
})();
