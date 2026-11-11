// TUITEA PREVIEW: registers its own pass-through worker at /app/tuitea-preview/ so neither the
// site-wide /sw.js nor the live app's /app/tuitea/sw.js ever caches the preview. It caches nothing.
(function () {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/app/tuitea-preview/sw.js', { scope: '/app/tuitea-preview/' }).catch(function () {});
})();
