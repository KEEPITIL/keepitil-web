/* KEEPITIL MUSIC — genre stations, every track, and the player's own playlists.
   ---------------------------------------------------------------------------
   Only KEEPITIL's own releases (data/music.js, evidence in docs/music). Playback is the
   OFFICIAL SoundCloud widget, visible and started by a tap; YouTube opens in YouTube
   (app or site) so its branding, controls and ads stay intact. Nothing here is ever
   rewarded, nothing autoplays at startup, no stream is extracted. While external music
   plays, the game's own music is held off so the two never overlap. Playlists are
   plain track-id lists in the save. */

import { h, toast } from '../ui.js';
import { get, update } from '../game/state.js';
import { GENRES, TRACKS, MUSIC_ACCOUNTS, trackById, stationTracks } from '../data/music.js';
import { music } from '../platform/sound.js';
import { track } from '../platform/analytics.js';

const SC_WIDGET = 'https://w.soundcloud.com/player/';
const MAX_PLAYLISTS = 20, MAX_PLAYLIST_TRACKS = 100;
export const musicState = st => (st.music = st.music || { playlists: [], lastTab: 'stations' });

/* ---------------------------------------------------------------- pure playlist rules (tested) -- */
export function createPlaylist(st, name, now = Date.now()) {
  const M = musicState(st), n = String(name || '').trim().slice(0, 40);
  if (!n) return { ok: false, reason: 'name' };
  if (M.playlists.length >= MAX_PLAYLISTS) return { ok: false, reason: 'limit' };
  const p = { id: 'pl' + now.toString(36) + M.playlists.length, name: n, tracks: [], createdAt: now };
  M.playlists.push(p); return { ok: true, playlist: p };
}
export function addToPlaylist(st, pid, tid) {
  const p = musicState(st).playlists.find(x => x.id === pid); if (!p || !trackById(tid)) return { ok: false, reason: 'missing' };
  if (p.tracks.includes(tid)) return { ok: false, reason: 'dup' };
  if (p.tracks.length >= MAX_PLAYLIST_TRACKS) return { ok: false, reason: 'limit' };
  p.tracks.push(tid); return { ok: true };
}
export function removeFromPlaylist(st, pid, tid) { const p = musicState(st).playlists.find(x => x.id === pid); if (p) p.tracks = p.tracks.filter(t => t !== tid); return { ok: !!p }; }
export function deletePlaylist(st, pid) { const M = musicState(st), n = M.playlists.length; M.playlists = M.playlists.filter(p => p.id !== pid); return { ok: M.playlists.length < n }; }
export function moveInPlaylist(st, pid, tid, dir) {
  const p = musicState(st).playlists.find(x => x.id === pid); if (!p) return { ok: false };
  const i = p.tracks.indexOf(tid), j = i + dir; if (i < 0 || j < 0 || j >= p.tracks.length) return { ok: false };
  [p.tracks[i], p.tracks[j]] = [p.tracks[j], p.tracks[i]]; return { ok: true };
}
// auto_play only for a real player's tap; automated QA (POKA_REVIEW) never starts a monetized stream
export const widgetUrl = t => `${SC_WIDGET}?url=${encodeURIComponent(t.sc)}&auto_play=${typeof window !== 'undefined' && window.POKA_REVIEW ? 'false' : 'true'}&visual=false&show_comments=false&show_teaser=false&hide_related=true&color=%23ff6b8b`;

/* ---------------------------------------------------------------- player (one at a time) -- */
let player = null;   // { queue:[ids], i, frame, widget, label }
function stopExternal() {
  if (player?.frame) player.frame.remove();
  player = null; window.__externalAudio = false;
}
function loadWidgetApi() {
  if (window.SC?.Widget) return Promise.resolve(true);
  return new Promise(res => { const s = document.createElement('script'); s.src = SC_WIDGET + 'api.js'; s.async = true;
    const to = setTimeout(() => res(false), 8000); s.onload = () => { clearTimeout(to); res(!!window.SC?.Widget); }; s.onerror = () => { clearTimeout(to); res(false); }; document.head.append(s); });
}
async function playQueue(dock, queue, i, label) {
  if (!navigator.onLine) { toast('You\'re offline. KEEPITIL Music needs a connection.'); return; }
  const t = trackById(queue[i]); if (!t) return;
  music.stop(); window.__externalAudio = true;                    // never overlap with the game's own music
  if (player?.frame) player.frame.remove();
  const status = h('p', { class: 'small music-status', 'aria-live': 'polite' }, `Loading “${t.title}” from SoundCloud…`);
  const frame = h('iframe', { class: 'sc-frame', title: `SoundCloud player: ${t.title} by KEEPITIL`, allow: 'autoplay', src: widgetUrl(t), height: '120', loading: 'eager' });
  const fallback = h('a', { class: 'linkbtn', href: t.sc, target: '_blank', rel: 'noopener external' }, 'Open in SoundCloud ↗');
  dock.replaceChildren(h('div', { class: 'card music-now' },
    h('div', { class: 'row', style: 'justify-content:space-between;align-items:center' }, h('b', {}, `▶ ${label}`),
      h('button', { class: 'icon-btn', 'aria-label': 'Stop music', onclick: () => { stopExternal(); dock.replaceChildren(); } }, '■')),
    frame, status, h('div', { class: 'row', style: 'gap:10px;flex-wrap:wrap' },
      queue.length > 1 ? h('button', { class: 'chipbtn', onclick: () => playQueue(dock, queue, (i + 1) % queue.length, label) }, 'Next ⏭') : null, fallback)));
  player = { queue, i, frame, label };
  track('music_played', { genre: t.genre, source: 'soundcloud_widget' });
  const giveUp = setTimeout(() => { if (player?.frame === frame) status.textContent = 'SoundCloud is taking a while. You can open it in SoundCloud instead.'; }, 9000);
  frame.addEventListener('load', async () => {
    clearTimeout(giveUp); status.textContent = `Playing on SoundCloud · ${t.title} · KEEPITIL`;
    if (queue.length > 1 && await loadWidgetApi() && player?.frame === frame) {
      const w = window.SC.Widget(frame); player.widget = w;
      w.bind(window.SC.Widget.Events.FINISH, () => { if (player?.frame === frame) playQueue(dock, queue, (i + 1) % queue.length, label); });
    }
  }, { once: true });
}

/* ---------------------------------------------------------------- screen -- */
export function musicScreen(app, opts = {}) {
  track('music_opened', { from: opts.from || 'home' });
  const st = get(), M = musicState(st);
  let tab = opts.tab || M.lastTab || 'stations', genre = opts.genre || null, pid = opts.playlist || null;
  const dock = h('div', { class: 'music-dock' });
  const body = h('div', { class: 'stack' });
  const art = t => { const im = h('img', { class: 'music-art', alt: '', loading: 'lazy', src: t.art || '', referrerpolicy: 'no-referrer' }); im.onerror = () => { im.replaceWith(h('div', { class: 'music-art ph', 'aria-hidden': 'true' }, '🎵')); }; return im; };
  const addMenu = t => {
    const pls = musicState(get()).playlists;
    if (!pls.length) { toast('Create a playlist first (Playlists tab).'); return; }
    const sheet = h('div', { class: 'sheet' }, h('h2', {}, `Add “${t.title}” to…`), ...pls.map(p => h('button', { class: 'btn ghost block', onclick: () => {
      let r; update(s => { r = addToPlaylist(s, p.id, t.id); }); toast(r.ok ? `Added to ${p.name}` : r.reason === 'dup' ? `Already in ${p.name}` : 'That playlist is full'); sheet.remove(); back.remove(); } }, `${p.name} (${p.tracks.length})`)),
      h('button', { class: 'linkbtn', onclick: () => { sheet.remove(); back.remove(); } }, 'Cancel'));
    const back = h('div', { class: 'sheet-back', onclick: () => { sheet.remove(); back.remove(); } }); document.body.append(back, sheet);
  };
  const row = (t, queue, label, extra = null) => h('div', { class: 'music-row' + (extra ? ' in-playlist' : '') }, art(t),
    h('div', { class: 'music-meta' }, h('b', {}, t.title), h('span', { class: 'small' }, `KEEPITIL · ${t.dur}`)),
    h('div', { class: 'music-acts' },
      h('button', { class: 'icon-btn', 'aria-label': `Play ${t.title} on SoundCloud`, onclick: () => playQueue(dock, queue, queue.indexOf(t.id), label) }, '▶'),
      extra ? null : h('button', { class: 'icon-btn', 'aria-label': `Add ${t.title} to a playlist`, onclick: () => addMenu(t) }, '＋'),
      t.yt ? h('a', { class: 'icon-btn yt', href: `https://www.youtube.com/watch?v=${t.yt}`, target: '_blank', rel: 'noopener external', 'aria-label': `Open ${t.title} in YouTube`, onclick: () => track('music_youtube_opened', { genre: t.genre }) }, '▶︎YT') : null,
      extra));
  const draw = () => {
    update(s => { musicState(s).lastTab = tab; });
    const tabs = h('div', { class: 'seg', role: 'tablist' }, ...[['stations', '📻 Stations'], ['playlists', '🎶 My Playlists'], ['all', '🎵 All Tracks']].map(([k, n]) =>
      h('button', { role: 'tab', 'aria-selected': String(tab === k), class: tab === k ? 'on' : '', onclick: () => { tab = k; genre = null; pid = null; draw(); } }, n)));
    let content;
    if (tab === 'stations' && !genre) content = h('div', { class: 'station-grid' }, ...GENRES.map(g => { const n = stationTracks(g.id).length; return n ? h('button', { class: 'station', onclick: () => { genre = g.id; draw(); } },
      h('span', { class: 'station-icon' }, g.icon), h('b', {}, g.name), h('span', { class: 'small' }, `${n} tracks · ${g.blurb}`)) : null; }));
    else if (tab === 'stations') {
      const g = GENRES.find(x => x.id === genre), ids = stationTracks(genre).map(t => t.id);
      content = h('div', { class: 'stack' }, h('div', { class: 'row', style: 'gap:10px;align-items:center' }, h('button', { class: 'chipbtn', onclick: () => { genre = null; draw(); } }, '← Stations'), h('b', {}, `${g.icon} ${g.name}`)),
        h('button', { class: 'btn block', onclick: () => { playQueue(dock, [...ids].sort(() => Math.random() - 0.5), 0, `${g.name} station`); track('music_station_started', { genre }); } }, `▶ PLAY ${g.name.toUpperCase()} STATION`),
        ...stationTracks(genre).map(t => row(t, ids, `${g.name} station`)));
    } else if (tab === 'playlists' && !pid) {
      const input = h('input', { type: 'text', maxlength: '40', placeholder: 'New playlist name', 'aria-label': 'New playlist name' });
      content = h('div', { class: 'stack' }, h('div', { class: 'row', style: 'gap:8px' }, input, h('button', { class: 'btn', onclick: () => {
          let r; update(s => { r = createPlaylist(s, input.value); }); if (!r.ok) return toast(r.reason === 'name' ? 'Give your playlist a name' : 'You have the maximum of 20 playlists');
          track('music_playlist_created', {}); pid = r.playlist.id; draw(); } }, 'CREATE')),
        ...(musicState(get()).playlists.length ? musicState(get()).playlists.map(p => h('button', { class: 'station', onclick: () => { pid = p.id; draw(); } }, h('span', { class: 'station-icon' }, '🎶'), h('b', {}, p.name), h('span', { class: 'small' }, `${p.tracks.length} track${p.tracks.length === 1 ? '' : 's'}`)))
          : [h('p', { class: 'small' }, 'No playlists yet. Name one above, then tap ＋ on any track to add it.')]));
    } else if (tab === 'playlists') {
      const p = musicState(get()).playlists.find(x => x.id === pid); if (!p) { pid = null; return draw(); }
      content = h('div', { class: 'stack' }, h('div', { class: 'row', style: 'gap:10px;align-items:center' }, h('button', { class: 'chipbtn', onclick: () => { pid = null; draw(); } }, '← Playlists'), h('b', {}, `🎶 ${p.name}`)),
        p.tracks.length ? h('button', { class: 'btn block', onclick: () => playQueue(dock, [...p.tracks], 0, p.name) }, '▶ PLAY PLAYLIST') : h('p', { class: 'small' }, 'Empty. Open Stations or All Tracks and tap ＋ on a song.'),
        ...p.tracks.map(trackById).filter(Boolean).map(t => row(t, p.tracks, p.name, h('span', { class: 'row', style: 'gap:2px' },
          h('button', { class: 'icon-btn', 'aria-label': `Move ${t.title} up`, onclick: () => { update(s => { moveInPlaylist(s, p.id, t.id, -1); }); draw(); } }, '↑'),
          h('button', { class: 'icon-btn', 'aria-label': `Remove ${t.title}`, onclick: () => { update(s => { removeFromPlaylist(s, p.id, t.id); }); draw(); } }, '✕')))),
        h('button', { class: 'linkbtn danger', onclick: () => { if (!confirm(`Delete the playlist “${p.name}”?`)) return; update(s => { deletePlaylist(s, p.id); }); pid = null; draw(); } }, 'Delete playlist'));
    } else { const ids = TRACKS.map(t => t.id); content = h('div', { class: 'stack' }, ...TRACKS.map(t => row(t, ids, 'All tracks'))); }
    body.replaceChildren(tabs, content);
  };
  const offline = !navigator.onLine;
  app.mount(h('div', { class: 'screen music-screen' },
    h('div', { class: 'row' }, h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => app.go(opts.from === 'settings' ? 'settings' : 'home') }, '←'), h('h1', { style: 'margin:0' }, 'KEEPITIL Music')),
    h('p', { class: 'sub' }, 'Official KEEPITIL tracks, played on SoundCloud or YouTube. Build your own playlists.'),
    offline ? h('div', { class: 'card warn', role: 'status' }, '📶 You\'re offline. Browse and edit playlists now; playing needs a connection.') : null,
    dock, body,
    h('p', { class: 'small legal' }, 'Music © KEEPITIL. Playback by SoundCloud and YouTube under their terms. ',
      h('a', { href: MUSIC_ACCOUNTS.soundcloud, target: '_blank', rel: 'noopener external' }, 'KEEPITIL on SoundCloud'), ' · ',
      h('a', { href: MUSIC_ACCOUNTS.youtube, target: '_blank', rel: 'noopener external' }, 'KEEPITIL on YouTube'))));
  draw();
  return () => { stopExternal(); if (get().settings.music) music.start(); };   // leaving the screen stops SoundCloud; game music only if the player has it on
}
