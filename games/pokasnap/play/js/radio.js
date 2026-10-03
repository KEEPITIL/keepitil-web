/* Poka Radio — Phase C1 page. Default library is the Animal Rave album from
   the KEEPITIL catalog, minus tracks tagged `fcawf` (config.js RADIO).
   Playback is the OFFICIAL SoundCloud widget, visible and started by a tap,
   the same engine the 2.1 Music screen uses. YouTube is a separate, explicit
   connection; it never runs hidden and is never the gameplay audio engine.
   Nothing here is persisted: the prototype has no storage. */
import { TRACKS } from './data/music.js';
import { RADIO } from './config.js';
import { radioLibrary, radioExcluded } from './core.js';

const SC_WIDGET = 'https://w.soundcloud.com/player/';
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const R = window.PokaRadio22 = { open: false, album: RADIO.defaultAlbum, library: [], i: 0, playing: false, muted: false, volume: 0.8, yt: { connected: false, visible: false } };

export function library() { return radioLibrary(TRACKS, R.album); }
export function excluded() { return radioExcluded(TRACKS, R.album); }

/* ---------------------------------------------------------------- render -- */
function render() {
  R.library = library();
  const t = R.library[R.i] || null;
  const list = R.library.map((x, i) => `<li class="${i === R.i ? 'on' : ''}" data-i="${i}"><img src="${esc(x.art)}" alt=""><span><b>${esc(x.title)}</b><small>${esc(x.album || '')} · ${esc(x.dur)}</small></span>${i === R.i && R.playing ? '<i class="eq"></i>' : ''}</li>`).join('');
  const ex = excluded();
  $('#radio').innerHTML = `
    <header class="rHead"><button id="radioClose" class="rBack" aria-label="Back to the board">‹</button><h1>Poka Radio</h1><span class="rSub">KEEPITIL · Animal Rave</span></header>
    <section class="rNow">
      <div class="rArt"><img src="${t ? esc(t.art) : ''}" alt=""><div class="rDisc ${R.playing ? 'spin' : ''}"></div></div>
      <div class="rMeta"><b id="rTitle">${t ? esc(t.title) : 'No track'}</b><small>${t ? esc(t.album) : ''} · ${t ? esc(t.dur) : ''}</small></div>
      <div class="rCtl">
        <button id="rPrev" aria-label="Previous">⏮</button>
        <button id="rPlay" class="big" aria-label="${R.playing ? 'Pause' : 'Play'}">${R.playing ? '❚❚' : '▶'}</button>
        <button id="rNext" aria-label="Next">⏭</button>
        <button id="rMute" aria-label="${R.muted ? 'Unmute' : 'Mute'}">${R.muted ? '🔇' : '🔊'}</button>
      </div>
      <input id="rVol" type="range" min="0" max="100" value="${Math.round(R.volume * 100)}" aria-label="Volume">
      <div id="rDock" class="rDock"></div>
    </section>
    <section class="rLib"><h2>Library <small>${R.library.length} tracks</small></h2><ul>${list}</ul>
      ${ex.length ? `<p class="rNote">${ex.length} track${ex.length > 1 ? 's' : ''} hidden by the FCAWF rule (${RADIO.fcawfStatus.replace(/-/g, ' ')}).</p>` : ''}
      ${RADIO.unresolved.length ? `<p class="rNote">${RADIO.unresolved.length} unmapped: ${RADIO.unresolved.map(u => esc(u.title)).join(', ')} — not included until confirmed.</p>` : ''}
    </section>
    <section class="rYT">
      <h2>YouTube</h2>
      ${R.yt.connected
        ? `<p>Connected. Your playlist “${esc(RADIO.youtube.playlistTitle)}” is created only when you tap below.</p><button id="rMakePl" class="rBtn">Create My Poka Radio Playlist</button><button id="rShowYT" class="rBtn ghost">${R.yt.visible ? 'Hide' : 'Show'} YouTube player</button>${R.yt.visible ? '<div id="rYTPlayer" class="rYTPlayer" data-visible="1">YouTube player (visible, user-started)</div>' : ''}`
        : `<p>Connect to make a Poka Radio playlist of official KEEPITIL releases on your account. Nothing is created or changed without a tap.</p><button id="rConnectYT" class="rBtn">Connect YouTube</button>`}
      <p class="rNote">Gameplay music always comes from the library above, never from a hidden YouTube player.</p>
    </section>`;
  wire();
}
function wire() {
  $('#radioClose').onclick = close;
  $('#rPlay').onclick = () => R.playing ? pause() : play(R.i, true);
  $('#rPrev').onclick = () => play((R.i - 1 + R.library.length) % R.library.length, R.playing);
  $('#rNext').onclick = () => play((R.i + 1) % R.library.length, R.playing);
  $('#rMute').onclick = () => { R.muted = !R.muted; applyVolume(); render(); };
  $('#rVol').oninput = e => { R.volume = +e.target.value / 100; R.muted = false; applyVolume(); };
  document.querySelectorAll('#radio .rLib li').forEach(li => li.onclick = () => play(+li.dataset.i, true));
  const c = $('#rConnectYT'); if (c) c.onclick = connectYouTube;
  const m = $('#rMakePl'); if (m) m.onclick = () => { toastR('Playlist creation needs the owner’s Google OAuth client (RADIO.youtube.clientId). Nothing was created.'); };
  const s = $('#rShowYT'); if (s) s.onclick = () => { R.yt.visible = !R.yt.visible; render(); };
}

/* --------------------------------------------------------------- player -- */
let frame = null, widget = null;
function widgetUrl(t, auto) { return `${SC_WIDGET}?url=${encodeURIComponent(t.sc)}&auto_play=${auto ? 'true' : 'false'}&visual=false&show_comments=false&show_teaser=false&hide_related=true&color=%23ff6b8b`; }
export function play(i, start) {
  R.i = i; const t = R.library[i]; if (!t) return;
  // automated QA never starts a monetized stream: POKA_REVIEW keeps auto_play off
  const auto = !!start && !window.POKA_REVIEW;
  R.playing = !!start;
  render();
  const dock = $('#rDock'); if (frame) frame.remove();
  frame = document.createElement('iframe'); frame.className = 'sc-frame'; frame.title = `SoundCloud player: ${t.title} by KEEPITIL`; frame.allow = 'autoplay'; frame.src = widgetUrl(t, auto); frame.height = '120';
  dock.replaceChildren(frame);
  frame.addEventListener('load', async () => { if (await loadWidgetApi() && frame) { widget = window.SC.Widget(frame); applyVolume(); widget.bind(window.SC.Widget.Events.FINISH, () => play((R.i + 1) % R.library.length, true)); } }, { once: true });
}
function pause() { R.playing = false; try { widget?.pause(); } catch (e) {} render(); }
function applyVolume() { try { widget?.setVolume(R.muted ? 0 : Math.round(R.volume * 100)); } catch (e) {} }
function loadWidgetApi() {
  if (window.SC?.Widget) return Promise.resolve(true);
  return new Promise(res => { const s = document.createElement('script'); s.src = SC_WIDGET + 'api.js'; s.async = true; const to = setTimeout(() => res(false), 8000); s.onload = () => { clearTimeout(to); res(!!window.SC?.Widget); }; s.onerror = () => { clearTimeout(to); res(false); }; document.head.append(s); });
}
/* Explicit OAuth: without a configured client id this surfaces the gap instead of pretending. */
function connectYouTube() {
  if (!RADIO.youtube.clientId) { toastR('Connect YouTube needs the owner’s Google OAuth client id (RADIO.youtube.clientId). Not connected.'); return; }
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.search = new URLSearchParams({ client_id: RADIO.youtube.clientId, redirect_uri: location.origin + location.pathname, response_type: 'token', scope: RADIO.youtube.scope, include_granted_scopes: 'true' });
  location.assign(u.toString());
}
function toastR(msg) { const el = $('#radio .rToast') || Object.assign(document.createElement('div'), { className: 'rToast' }); el.textContent = msg; $('#radio').append(el); el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }

/* --------------------------------------------------------------- open/close -- */
export function open() { R.open = true; document.body.classList.add('radio-open'); $('#radio').hidden = false; render(); }
export function close() { R.open = false; document.body.classList.remove('radio-open'); $('#radio').hidden = true; }
