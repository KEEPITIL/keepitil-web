// Frame-busting for the Kids experience: the page stays hidden (html{display:none} in index.html) unless it is
// the top window. If someone embeds it in a frame, try to break out; if that is blocked, it stays blank.
// Kept as a file (not inline) so the Content-Security-Policy can forbid inline scripts.
(function () {
  if (window.top === window.self) { document.documentElement.style.display = 'block'; return; }
  try { window.top.location.replace(window.self.location.href); } catch (e) { /* sandboxed frame: stay hidden */ }
})();
