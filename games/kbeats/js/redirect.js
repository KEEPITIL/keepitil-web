/* KBeats legacy-route redirects (CSP: replaces four inline one-liners): /games/kbeats/{artist,track,challenge,leaderboards}/ -> the app at /games/kbeats/play/ with the matching hash route.
   <script src="/games/kbeats/js/redirect.js" data-kind="artist|track|challenge|leaderboards"></script> */
(function () {
  var s = document.currentScript; if (!s) return;
  var kind = s.getAttribute('data-kind') || '', base = '/games/kbeats/play/';
  var id = function () { return new URLSearchParams(location.search).get('id') || location.pathname.split('/').filter(Boolean)[3] || ''; };
  if (kind === 'artist') { var a = id(); location.replace(base + (a ? '#/artist/' + encodeURIComponent(a) : '')); }
  else if (kind === 'track') { var t = id(); location.replace(base + (t ? '#/track/' + encodeURIComponent(t) : '')); }
  else if (kind === 'challenge') { var c = (new URLSearchParams(location.search).get('c') || '').split('~'); location.replace(base + (c[0] ? '#/challenge/' + c.map(encodeURIComponent).join('/') : '')); }
  else if (kind === 'leaderboards') location.replace(base + '#/leaderboard');
})();
