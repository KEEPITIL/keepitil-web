// Tab stubs (/app/tuitea/tupu/ and the others) forward to the app.
// The path is always /app/tuitea/app/ (trailing slash). The incoming query
// string and hash are kept, and tab is set to this stub. Nothing in the
// query is allowed to change the path.
export function tuiteaTabTarget(tab, search, hash) {
  const params = new URLSearchParams(typeof search === 'string' ? search : '');
  params.set('tab', String(tab));
  let h = typeof hash === 'string' ? hash : '';
  if (h && h.charAt(0) !== '#') h = '#' + h;
  return '/app/tuitea/app/?' + params.toString() + h;
}
