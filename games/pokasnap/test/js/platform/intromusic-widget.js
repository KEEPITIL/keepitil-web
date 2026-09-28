/* SoundCloud Widget API glue for the intro player: only used to notice the end of the track.
   Loaded after the widget iframe exists; if the API script cannot load, nothing breaks. */
let api = null;
function load() {
  if (window.SC?.Widget) return Promise.resolve(true);
  if (api) return api;
  api = new Promise(res => { const s = document.createElement('script'); s.src = 'https://w.soundcloud.com/player/api.js'; s.async = true;
    const to = setTimeout(() => res(false), 8000); s.onload = () => { clearTimeout(to); res(!!window.SC?.Widget); }; s.onerror = () => { clearTimeout(to); res(false); }; document.head.append(s); });
  return api;
}
export async function onFinish(frame, cb) {
  if (!(await load()) || !frame.isConnected) return;
  const w = window.SC.Widget(frame); w.bind(window.SC.Widget.Events.FINISH, cb);
  if (window.__pokaQA) w.bind(window.SC.Widget.Events.READY, () => w.getCurrentSound(s => window.__pokaQA?.log(`intro-widget ready "${s?.title || '?'}"`)));
}
