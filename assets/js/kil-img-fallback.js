/* KEEPITIL image fallback, delegated (replaces inline onerror="..." handlers so a Content-Security-Policy without 'unsafe-inline' for script can be enforced later).
   An <img> opts in with data-fb:
     data-fb="hide-parent"     a broken image hides its parent box
     data-fb="hide"            a broken image hides itself
     data-fb="swap-next"       a broken image hides itself and shows its next sibling (display:flex), e.g. an initials placeholder
     data-fb="hide-closest"     a broken image hides its nearest ancestor matching data-fb-sel (a single class selector such as .gcard)
     data-fb="dim"             a broken image fades to the opacity in data-fb-op (a number 0..1, default .12)
     data-fb="src"             a broken image is swapped ONCE for data-fb-src (a same-site path starting with a single "/"; anything else is ignored)
     data-fb="ph"              a broken image is replaced by <div class="ph">{data-ini}</div> (initials placeholder; text only, never HTML)
   `error` does not bubble, so the listener is on document in the CAPTURE phase and covers images added later. Images that failed before this script ran are caught on DOMContentLoaded. */
(function () {
  if (window.__kilImgFallback) return; window.__kilImgFallback = true;
  function apply(img) {
    var mode = img.getAttribute('data-fb');
    if (!mode || img.__kilFb) return;
    img.__kilFb = true;
    if (mode === 'hide-parent') { if (img.parentNode && img.parentNode.style) img.parentNode.style.display = 'none'; }
    else if (mode === 'swap-next') { if (img.style) img.style.display = 'none'; var nx = img.nextElementSibling; if (nx && nx.style) nx.style.display = 'flex'; }
    else if (mode === 'hide-closest') { var sel = img.getAttribute('data-fb-sel') || ''; if (/^\.[A-Za-z][\w-]*$/.test(sel) && img.closest) { var c = img.closest(sel); if (c && c.style) c.style.display = 'none'; } }
    else if (mode === 'hide') { if (img.style) img.style.display = 'none'; }
    else if (mode === 'dim') { var o = parseFloat(img.getAttribute('data-fb-op')); if (!(o >= 0 && o <= 1)) o = 0.12; if (img.style) img.style.opacity = String(o); }
    else if (mode === 'src') { var u = img.getAttribute('data-fb-src') || ''; if (/^\/(?!\/)[^\s"'<>\\]*$/.test(u)) img.setAttribute('src', u); }
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
