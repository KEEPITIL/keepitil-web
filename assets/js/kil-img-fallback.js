/* KEEPITIL image fallback, delegated (replaces inline onerror="..." handlers so a Content-Security-Policy without 'unsafe-inline' for script can be enforced later).
   An <img> opts in with data-fb:
     data-fb="hide-parent"     a broken image hides its parent box
     data-fb="ph"              a broken image is replaced by <div class="ph">{data-ini}</div> (initials placeholder; text only, never HTML)
   `error` does not bubble, so the listener is on document in the CAPTURE phase and covers images added later. Images that failed before this script ran are caught on DOMContentLoaded. */
(function () {
  if (window.__kilImgFallback) return; window.__kilImgFallback = true;
  function apply(img) {
    var mode = img.getAttribute('data-fb');
    if (!mode || img.__kilFb) return;
    img.__kilFb = true;
    if (mode === 'hide-parent') { if (img.parentNode && img.parentNode.style) img.parentNode.style.display = 'none'; }
    else if (mode === 'ph') {
      if (!img.parentNode) return;
      var d = document.createElement('div'); d.className = 'ph'; d.textContent = img.getAttribute('data-ini') || '';
      img.parentNode.replaceChild(d, img);
    }
  }
  document.addEventListener('error', function (e) { var t = e.target; if (t && t.tagName === 'IMG') apply(t); }, true);
  function sweep() { var l = document.querySelectorAll('img[data-fb]'); for (var i = 0; i < l.length; i++) if (l[i].complete && l[i].naturalWidth === 0 && l[i].getAttribute('src')) apply(l[i]); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sweep); else sweep();
})();
