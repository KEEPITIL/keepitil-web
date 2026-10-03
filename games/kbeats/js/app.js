/* KBeats web client: discovery screens + gameplay loop + results.
   Gameplay rule: once the countdown starts, nothing here touches the network. Catalog, chart (hash
   verified), audio and the ranked play session are all resolved before play(); score submission,
   analytics and every other call happen only after the result screen is up. */
import { CONFIG, LANES } from './config.js';
import { Judge, multiplierFor } from './judge.js';
import { loadChart } from './chart.js';
import { SongClock, runCalibration } from './audio.js';
import { Highway } from './render.js';
import { renderDevTrack } from './devtracks.js';
import { coverArt } from './art.js';
import * as S from './store.js';
import * as D from './data.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = s => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const big = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K' : String(n || 0);
const DIFF = { easy: 'Easy', normal: 'Normal', expert: 'Expert' };
const GENRES = ['Rock', 'Pop', 'Hip-Hop', 'R&B', 'EDM', 'Country', 'Christian/Gospel', 'Alternative', 'Latin', 'Instrumental', 'Other'];
const I = {   // original line icons
  search: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  bell: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
  gear: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  heart: '<svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M12 21s-7.5-4.6-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2 4.4-9.5 9-9.5 9z"/></svg>',
  user: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>',
  share: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3v13M7 8l5-5 5 5"/><path d="M5 12v8h14v-8"/></svg>',
  cloud: '<svg viewBox="0 0 32 20" width="40" height="26" fill="#ff7a1a"><path d="M14 6c1.5-2.5 4-4 7-4a8 8 0 0 1 8 8 5 5 0 0 1-1 10H14zM11 8h1.5v12H11zM8 9.5h1.5V20H8zM5 11.5h1.5V20H5zM2 14h1.5v6H2z"/></svg>',
  clock: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="11" fill="#3aa0ff"/><path d="m7 12 3.5 3.5L17 9" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round"/></svg>',
  crown: '<svg viewBox="0 0 24 24" width="14" height="14" fill="#facc15"><path d="M3 18 2 7l6 4 4-7 4 7 6-4-1 11z"/></svg>',
};

let catalog = [], clock = null, settings = S.settings(), lastPlay = null, ME = null, FLAGS = { soundcloud_outbound_enabled: true };
const toast = m => { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(toast.h); toast.h = setTimeout(() => t.style.display = 'none', 2600); };
const starsHtml = (n, cls = 'stars') => `<span class="${cls}" aria-label="${n} of 5 stars">${'★'.repeat(n)}<span class="off">${'★'.repeat(5 - n)}</span></span>`;
function applyA11y() { document.body.classList.toggle('big-text', settings.textScale > 1); }

const findTrack = id => catalog.find(t => t.slug === id || t.id === id);
const topDiff = t => t.charts.expert ? 'expert' : t.charts.normal ? 'normal' : 'easy';
const pb = (t, d) => ME?.personalBests?.find(p => p.slug === t.slug && p.difficulty === d) || null;
const pbAny = t => ['expert', 'normal', 'easy'].map(d => pb(t, d)).filter(Boolean).sort((a, b) => b.score - a.score)[0] || null;
const starsFor = t => Math.max(0, ...['easy', 'normal', 'expert'].map(d => pb(t, d)?.stars || 0));
const isFav = t => ME?.favorites?.includes(t.slug);
const isFol = slug => ME?.follows?.includes(slug);
const devTag = t => t.dev ? '<span class="pill dev" title="Development test track, not an artist release">DEV</span>' : '';
const art = (t, px, size) => `<span class="aw"><img src="${coverArt(t, size)}" alt="" width="${px}" height="${px}">${t.dev ? '<span class="devb" title="Development test track">DEV</span>' : ''}</span>`;

/* ── shared chrome ───────────────────────────────────────────────────── */
function topBar() {
  return `<header class="top"><span class="logo">KBEATS</span><span class="lvl">${I.crown} Lv. ${ME?.level || 1}</span><span class="sp"></span>
    <a class="ico" href="#/discover" aria-label="Search">${I.search}</a><a class="ico" href="#/challenges" aria-label="Challenges">${I.bell}</a><a class="ico" href="#/settings" aria-label="Settings">${I.gear}</a></header>`;
}
function homeRow(t) {
  const d = topDiff(t);
  return `<div class="row">${art(t, 56, 128)}
    <div class="meta"><div class="t">${esc(t.title)}</div><div class="a">${esc(t.artist)}</div></div>
    <div class="mid"><span class="pill ${d}">${d === 'expert' ? 'Hard' : DIFF[d]}</span>${starsHtml(starsFor(t))}</div>
    <a class="playb" href="#/track/${encodeURIComponent(t.slug)}" aria-label="Play ${esc(t.title)}">PLAY</a></div>`;
}
function selectRow(t) {
  const d = topDiff(t);
  return `<div class="row sel">${art(t, 58, 128)}
    <div class="meta"><div class="t">${esc(t.title)}</div><div class="a">${esc(t.artist)}</div>
      <div class="x">${I.clock} ${fmt(t.durationSec)} &nbsp; ${Math.round(t.analysis?.bpm || t.bpm)} BPM</div></div>
    <div class="r"><a class="playb" href="#/track/${encodeURIComponent(t.slug)}" aria-label="Play ${esc(t.title)}">PLAY</a>
      <div><span class="pill ${d} sm">${DIFF[d]}</span> ${starsHtml(starsFor(t))}</div></div></div>`;
}

/* ── screens ─────────────────────────────────────────────────────────── */
const screens = {
  home(tab = 'foryou') {
    const live = catalog.filter(t => ['published', 'development'].includes(t.status));
    const lists = {
      foryou: live,                                                    // already in server rotation order
      trending: [...live].sort((a, b) => (b.plays || 0) - (a.plays || 0)),
      new: [...live].sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0)),
    };
    const feat = live.find(t => t.featured) || live[0];
    const isNew = feat && (feat.dev || (Date.now() - new Date(feat.publishedAt || 0)) < 14 * 864e5);
    $('#s-home').innerHTML = `<div class="wrapc">${topBar()}
      <div class="tabs" role="tablist">${[['foryou', 'For You'], ['trending', 'Trending'], ['new', 'New']].map(([k, l]) => `<button role="tab" aria-selected="${k === tab}" class="${k === tab ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}
        <button role="tab" onclick="location.hash='#/genres'">Genres</button></div>
      ${feat ? `<a class="hero" href="#/track/${encodeURIComponent(feat.slug)}"><img src="${coverArt(feat, 640)}" alt="">
        <div>${isNew ? '<span class="newb">NEW</span>' : ''}<h2>${esc(feat.title)}</h2><div class="ha">${esc(feat.artist)}</div><small>${esc(feat.genre)}${feat.dev ? ' · development test track' : ''}</small>
        <div class="dots"><i class="on"></i><i></i><i></i><i></i></div></div><span class="play-c" aria-hidden="true">${I.play}</span></a>` : '<p class="empty">No tracks are live yet.</p>'}
      <div class="sect"><h3>${{ foryou: 'Top Tracks', trending: 'Trending', new: 'New' }[tab]}</h3><a href="#/discover">See All ›</a></div>
      ${lists[tab].slice(0, 10).map(homeRow).join('')}
      ${D.RELEASE.mode !== 'production' && live.some(t => t.dev) ? `<p class="fine">Beta: tracks marked DEV are KBeats development test tracks, not artist releases. <a href="/games/kbeats/submit/">Submit your music →</a></p>` : ''}
    </div>`;
    $('#s-home').querySelectorAll('[data-tab]').forEach(b => b.onclick = () => screens.home(b.dataset.tab));
    D.track('track_impression', { track: feat?.slug });
  },
  discover() {
    $('#s-discover').innerHTML = `<div class="wrapc"><header class="top bar"><a class="ico" href="#/home" aria-label="Back">${I.back}</a><b class="ttl">SONG SELECT</b><span class="sp"></span><label class="ico" for="q" aria-label="Search">${I.search}</label></header>
      <input type="search" id="q" placeholder="Search tracks, artists, genres" aria-label="Search" class="qbox"><div id="qr"></div></div>`;
    const run = () => { const q = $('#q').value.toLowerCase(); $('#qr').innerHTML = catalog.filter(t => !q || [t.title, t.artist, t.genre].join(' ').toLowerCase().includes(q)).map(selectRow).join('') || '<p class="empty">No matches.</p>'; };
    $('#q').oninput = run; run();
  },
  genres(g) {
    $('#s-genres').innerHTML = `<div class="wrapc">${topBar()}<div class="sect"><h3>Playlists</h3></div><div class="tabs wrap">${GENRES.map(x => `<button class="${x === g ? 'on' : ''}" data-g="${esc(x)}">${esc(x)}</button>`).join('')}</div>
      ${g ? (catalog.filter(t => t.genre === g).map(selectRow).join('') || `<p class="empty">No ${esc(g)} tracks yet. <a href="/games/kbeats/submit/">Be the first</a>.</p>`) : '<p class="empty">Pick a genre.</p>'}</div>`;
    $('#s-genres').querySelectorAll('[data-g]').forEach(b => b.onclick = () => screens.genres(b.dataset.g));
  },
  track(id, chall) {
    const t = findTrack(id); if (!t) { toast('That track is not available.'); return go('#/home'); }
    let diff = chall?.difficulty || S.LS.get('lastDiff', 'normal'); if (!t.charts[diff]) diff = topDiff(t);
    D.track('track_selected', { track: t.slug });
    const draw = () => {
      const p = pb(t, diff), ch = t.charts[diff];
      $('#s-track').innerHTML = `<div class="wrapc"><header class="top bar"><a class="ico" href="#/discover" aria-label="Back">${I.back}</a><b class="ttl">SONG SELECT</b></header>
        ${chall ? `<div class="banner">⚔ <b>${esc(chall.name || 'A friend')}</b> challenged you to beat <b>${Number(chall.score).toLocaleString()}</b> (${chall.accuracy}%) on ${DIFF[diff]}.</div>` : ''}
        <div class="card dt"><img src="${coverArt(t, 256)}" alt="" width="112" height="112">
          <div><h2>${esc(t.title)} ${devTag(t)}</h2><a href="#/artist/${encodeURIComponent(t.artistId)}" class="al">${esc(t.artist)}</a>
          <div class="x">${esc(t.genre)} · ${I.clock} ${fmt(t.durationSec)} · ${t.analysis?.bpm || t.bpm} BPM</div>
          <p class="x">${esc(t.desc || '')}</p></div></div>
        <div class="diffs" role="radiogroup" aria-label="Difficulty">${['easy', 'normal', 'expert'].filter(d => t.charts[d]).map(d => `<button role="radio" aria-checked="${d === diff}" class="${d === diff ? 'on' : ''}" data-d="${d}"><span class="pill ${d}">${DIFF[d]}</span><small>${t.charts[d].notes.length} notes</small>${starsHtml(pb(t, d)?.stars || 0)}</button>`).join('')}</div>
        <div class="card kv"><span>Personal best</span><b>${p ? `${p.score.toLocaleString()} · ${p.grade} · ${p.accuracy}%` : '—'}</b>
          <span>Global best</span><b id="gbest">…</b><span>Chart</span><b class="mono">v${ch.chartVersion} · ${ch.hash}</b></div>
        <div class="gobar"><button class="btn primary big" id="go">${I.play} PLAY</button><button class="btn ghost" id="prac">Practice</button></div>
        <div class="acts">
          <button id="fav" class="${isFav(t) ? 'on' : ''}"><b>${I.heart}</b>Favorite</button>
          <button id="fol" class="${isFol(t.artistId) ? 'on' : ''}"><b>${I.user}</b>${isFol(t.artistId) ? 'Following' : 'Follow Artist'}</button>
          <a href="#/leaderboard/${encodeURIComponent(t.slug)}/${diff}"><b>▤</b>Leaderboard</a>${scLink(t)}</div>
        <p class="fine">Keyboard: D F J K or ← ↓ ↑ →. Touch: tap the pads, flick on arrow notes. Esc pauses.</p></div>`;
      $('#s-track').querySelectorAll('[data-d]').forEach(b => b.onclick = () => { diff = b.dataset.d; S.LS.set('lastDiff', diff); D.track('difficulty_selected', { track: t.slug, diff }); draw(); });
      $('#go').onclick = () => startGame(t, diff, { challenge: chall });
      $('#prac').onclick = () => startGame(t, diff, { practice: true });
      $('#fav').onclick = () => toggleFav(t, draw);
      $('#fol').onclick = () => toggleFollow(t.artistId, draw, 'track');
      bindSc();
      D.leaderboard(t.slug, diff, 'all').then(r => { const e = r.entries[0]; const el = $('#gbest'); if (el) el.textContent = e ? `${e.score.toLocaleString()} · ${e.name}` : '—'; }).catch(() => { const el = $('#gbest'); if (el) el.textContent = 'offline'; });
    };
    draw();
  },
  async artist(id, tab = 'tracks') {
    $('#s-artist').innerHTML = `<div class="wrapc"><p class="empty">Loading…</p></div>`;
    let a; try { a = await D.artistPublic(id); } catch { $('#s-artist').innerHTML = '<div class="wrapc"><p class="empty">Artist not found.</p></div>'; return; }
    const tracks = a.tracks.map(x => ({ ...(findTrack(x.slug) || x) }));
    const draw = () => {
      $('#s-artist').innerHTML = `<div class="wrapc artist">
        <header class="top bar"><a class="ico" href="#/home" aria-label="Back">${I.back}</a><b class="ttl">ARTIST PAGE</b></header>
        <div class="ahead"><img class="av" src="${a.avatar || coverArt({ id: a.slug, hue: 300, bpm: '' }, 240)}" alt="" width="120" height="120">
          <div><h2>${esc(a.name)} ${a.verified ? I.check : ''}</h2><div class="x">${esc((a.genres || []).join(' / '))}</div>
          <div class="stats2"><div><b>${big(a.followers)}</b><small>Followers</small></div><div><b>${big(a.plays)}</b><small>Plays</small></div></div>
          <div class="fr"><button class="btn sm primary" id="fol">${isFol(a.slug) ? 'Following' : 'Follow'}</button><button class="btn sm ghost circ" id="more" aria-label="More">•••</button></div></div></div>
        ${a.dev ? '<p class="fine">KBeats internal test tracks. Not a real artist.</p>' : ''}
        <div class="utabs">${['tracks', 'about', 'social'].map(k => `<button class="${k === tab ? 'on' : ''}" data-at="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
        ${tab === 'tracks' ? tracks.map(t => `<div class="row art"><img src="${coverArt(t, 128)}" alt="" width="58" height="58"><div class="meta"><div class="t">${esc(t.title)}</div>
            <div class="x">${big(t.plays)} plays &nbsp; ${I.clock} ${fmt(t.durationSec)} &nbsp; ${t.analysis?.bpm || t.bpm} BPM</div></div>
            <div class="mid"><span class="pill ${topDiff(t)}">${DIFF[topDiff(t)]}</span>${starsHtml(starsFor(t))}</div>
            <a class="pc" href="#/track/${encodeURIComponent(t.slug)}" aria-label="Play ${esc(t.title)}">${I.play}</a></div>`).join('') || '<p class="empty">No tracks live yet.</p>'
        : tab === 'about' ? `<div class="card"><p>${esc(a.bio || 'No bio yet.')}</p></div>`
        : `<div class="card">${a.soundcloud && FLAGS.soundcloud_outbound_enabled ? `<a href="${esc(a.soundcloud)}" target="_blank" rel="noopener" data-sc-artist="${esc(a.slug)}">${I.cloud} SoundCloud</a><p class="fine">Opens the artist's SoundCloud page. SoundCloud does not endorse KBeats.</p>` : '<p class="x">No social links yet.</p>'}</div>`}
      </div>`;
      $('#fol').onclick = () => toggleFollow(a.slug, () => { a.followers += isFol(a.slug) ? 1 : -1; draw(); }, 'artist');
      $('#more').onclick = () => navigator.share ? navigator.share({ title: a.name + ' on KBeats', url: `${location.origin}/games/kbeats/artist/${a.slug}/` }).catch(() => {}) : toast('Link copied');
      $('#s-artist').querySelectorAll('[data-at]').forEach(b => b.onclick = () => { tab = b.dataset.at; draw(); });
      document.querySelectorAll('[data-sc-artist]').forEach(x => x.onclick = () => { D.track('soundcloud_outbound', {}); D.flushEvents(); });
    };
    draw();
  },
  async leaderboard(id, diff = 'normal', scope = 'all') {
    const t = findTrack(id) || catalog[0]; if (!t) return;
    if (!t.charts[diff]) diff = topDiff(t);
    const head = `<div class="wrapc">${topBar()}<div class="sect"><h3>Leaderboards</h3><small>verified scores only</small></div>
      <div class="grid2 lbsel"><select id="lt" aria-label="Track">${catalog.map(x => `<option value="${esc(x.slug)}" ${x.slug === t.slug ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}</select>
      <select id="ld" aria-label="Difficulty">${['easy', 'normal', 'expert'].map(d => `<option value="${d}" ${d === diff ? 'selected' : ''}>${DIFF[d]}</option>`).join('')}</select></div>
      <div class="utabs">${[['all', 'All Time'], ['weekly', 'Weekly']].map(([k, l]) => `<button class="${k === scope ? 'on' : ''}" data-sc="${k}">${l}</button>`).join('')}</div>`;
    $('#s-leaderboard').innerHTML = head + '<p class="empty">Loading…</p></div>';
    const bind = () => {
      const re = (s = scope) => go(`#/leaderboard/${encodeURIComponent($('#lt').value)}/${$('#ld').value}/${s}`);
      $('#lt').onchange = () => re(); $('#ld').onchange = () => re();
      $('#s-leaderboard').querySelectorAll('[data-sc]').forEach(b => b.onclick = () => re(b.dataset.sc));
    };
    bind();
    try {
      const r = await D.leaderboard(t.slug, diff, scope);
      $('#s-leaderboard').innerHTML = head + (r.entries.length ? r.entries.map(e => `<div class="row lb ${e.me ? 'me' : ''}"><b class="rk">${e.rank}</b><div class="meta"><div class="t">${esc(e.name)}${e.me ? ' (you)' : ''}</div>
        <div class="x">${e.accuracy}% · ${e.grade} · ${e.perfect}/${e.great}/${e.good}/${e.miss} · combo ${e.maxCombo} · v${e.chartVersion}</div></div><b>${e.score.toLocaleString()}</b></div>`).join('')
        : '<p class="empty">No verified scores yet. Be first.</p>') + (r.myRank > 100 ? `<p class="fine">Your rank: #${r.myRank} of ${r.total}</p>` : '') + '</div>';
    } catch (e) { $('#s-leaderboard').innerHTML = head + `<p class="empty">Leaderboard unavailable (${esc(e.message)}).</p></div>`; }
    bind();
  },
  profile() {
    const anon = !ME || ME.anonymous;
    const pbs = (ME?.personalBests || []).slice().sort((a, b) => b.score - a.score).slice(0, 8);
    $('#s-profile').innerHTML = `<div class="wrapc">${topBar()}
      <div class="card"><div class="prof"><img src="${coverArt({ id: ME?.userId || 'guest', hue: 200, bpm: '' }, 120)}" alt="" width="64" height="64" class="av sm">
        <div><h2>${esc(ME?.name || (anon ? 'Guest player' : 'Player'))}</h2><div class="x">Lv. ${ME?.level || 1} · ${(ME?.xp || 0).toLocaleString()} XP${ME?.email ? ' · ' + esc(ME.email) : anon ? ' · guest account' : ''}</div></div></div>
        <label class="set"><span>Display name<small>shown on leaderboards</small></span><input type="text" id="nm" maxlength="24" value="${esc(ME?.name || '')}"></label></div>
      ${anon ? `<div class="card"><h3>Save your progress</h3><p class="x">You're playing as a guest. Your scores already sync to this guest account. Add an email to keep them across devices; signing in to an existing account moves your guest progress over.</p>
        <form id="authf" class="authf" onsubmit="return false"><input type="email" id="em" placeholder="Email" autocomplete="email" required><input type="password" id="pw" placeholder="Password (optional for a magic link)" autocomplete="current-password" minlength="6">
        <div class="grid2"><button class="btn primary" id="si">Sign in</button><button class="btn ghost" id="su">Create account</button></div>
        <button class="btn ghost" id="gg" style="width:100%;margin-top:8px">Continue with Google</button><p class="fine" id="am"></p></form>
        <p class="fine">Uses your KEEPITIL account. SoundCloud is never required.</p></div>`
      : `<div class="card"><p>Signed in${ME?.email ? ' as <b>' + esc(ME.email) + '</b>' : ''}.</p><button class="btn ghost sm" id="so">Sign out</button></div>`}
      <div class="card kv"><span>Favorites</span><b>${ME?.favorites?.length || 0}</b><span>Artists followed</span><b>${ME?.follows?.length || 0}</b></div>
      ${pbs.length ? `<div class="sect"><h3>Personal bests</h3></div>${pbs.map(p => { const t = findTrack(p.slug); return t ? `<div class="row"><img src="${coverArt(t, 96)}" width="44" height="44" alt=""><div class="meta"><div class="t">${esc(t.title)}</div><div class="x">${DIFF[p.difficulty]} · ${p.accuracy}% · ${p.grade}</div></div><b>${p.score.toLocaleString()}</b></div>` : ''; }).join('')}` : ''}
      ${ME?.favorites?.length ? `<div class="sect"><h3>Favorites</h3></div>${catalog.filter(isFav).map(homeRow).join('')}` : ''}
      <a class="btn ghost" href="#/settings" style="width:100%;margin:10px 0">Settings &amp; calibration</a>
      ${ME?.isAdmin ? '<a class="btn ghost" href="/games/kbeats/admin/" style="width:100%;margin-bottom:10px">Admin console</a>' : ''}
      <a class="btn ghost" href="/games/kbeats/submit/" style="width:100%">${ME?.artist ? 'Artist dashboard' : 'Artist? Submit your music'}</a></div>`;
    $('#nm').onchange = async e => { try { ME = await D.profileUpdate(e.target.value.trim()); toast('Name saved'); } catch (x) { toast(x.message); } };
    const am = m => { const el = $('#am'); if (el) el.textContent = m; };
    if ($('#si')) $('#si').onclick = async () => { if (!$('#authf').reportValidity()) return; try { const r = await D.auth.signInEmail($('#em').value, $('#pw').value); am(r.session ? 'Signed in.' : 'Check your email for a sign-in link.'); if (r.session) await refreshMe(true); } catch (x) { am(x.message); } };
    if ($('#su')) $('#su').onclick = async () => { if (!$('#authf').reportValidity() || $('#pw').value.length < 6) return am('Choose a password of at least 6 characters.'); try { const r = await D.auth.signUpEmail($('#em').value, $('#pw').value); am(r.upgraded ? 'Check your email to confirm. Your guest progress stays with this account.' : 'Check your email to confirm your account.'); } catch (x) { am(x.message); } };
    if ($('#gg')) $('#gg').onclick = () => D.auth.signInGoogle().catch(x => am(x.message));
    if ($('#so')) $('#so').onclick = async () => { await D.auth.signOut(); ME = null; await refreshMe(true); };
  },
  challenges() {
    const seen = S.LS.get('challengesSeen', []);
    $('#s-challenges').innerHTML = `<div class="wrapc">${topBar()}<div class="sect"><h3>Challenges</h3></div>
      ${seen.length ? seen.map(c => { const t = findTrack(c.track); return t ? `<div class="row"><img src="${coverArt(t, 96)}" width="48" height="48" alt=""><div class="meta"><div class="t">${esc(c.name)} · ${esc(t.title)}</div><div class="x">${DIFF[c.difficulty]} · beat ${Number(c.score).toLocaleString()}</div></div><a class="playb" href="#/challenge/${encodeURIComponent(c.id)}">PLAY</a></div>` : ''; }).join('')
        : '<p class="empty">No challenges yet. Finish a song and tap Share to challenge a friend.</p>'}</div>`;
  },
  async challenge(id) {
    try {
      const c = await D.challengeGet(id);
      const seen = S.LS.get('challengesSeen', []).filter(x => x.id !== c.id); seen.unshift({ ...c, id }); S.LS.set('challengesSeen', seen.slice(0, 30));
      screens.track(c.track, c); $('#s-track').classList.add('on');
    } catch { toast('Challenge not found'); go('#/home'); }
  },
  settings() {
    const s = settings;
    $('#s-settings').innerHTML = `<div class="wrapc"><header class="top bar"><a class="ico" href="#/profile" aria-label="Back">${I.back}</a><b class="ttl">SETTINGS</b></header>
      <div class="card"><h3>Audio &amp; timing</h3>
      <label class="set"><span>Audio output<small>offsets are stored per output</small></span><select id="out"><option value="speaker">Device speaker</option><option value="wired">Wired headphones</option><option value="bluetooth">Bluetooth</option></select></label>
      <label class="set"><span>Input offset: <b id="offv">${Math.round(s.offsets[s.output] * 1000)} ms</b><small>+ if you hit late. Calibrate for best timing.</small></span><input type="range" id="off" min="-250" max="400" step="1" value="${Math.round(s.offsets[s.output] * 1000)}"></label>
      <a class="btn primary" href="#/calibrate" style="width:100%;margin-top:12px">Calibrate (tap to the beat)</a>
      <label class="set"><span>Music volume</span><input type="range" id="mv" min="0" max="1" step="0.05" value="${s.music}"></label>
      <label class="set"><span>Effects volume</span><input type="range" id="sv" min="0" max="1" step="0.05" value="${s.sfx}"></label>
      <label class="set"><span>Hit sounds</span><input type="checkbox" id="hs" ${s.hitSounds ? 'checked' : ''}></label></div>
      <div class="card"><h3>Accessibility &amp; comfort</h3>
      <label class="set"><span>Haptics<small>where the device supports it</small></span><input type="checkbox" id="hp" ${s.haptics ? 'checked' : ''}></label>
      <label class="set"><span>Reduced motion</span><input type="checkbox" id="rm" ${s.reducedMotion ? 'checked' : ''}></label>
      <label class="set"><span>Reduced flashes</span><input type="checkbox" id="rf" ${s.reducedFlash ? 'checked' : ''}></label>
      <label class="set"><span>Effect intensity</span><input type="range" id="fx" min="0.2" max="1" step="0.1" value="${s.effects}"></label>
      <label class="set"><span>Larger text</span><input type="checkbox" id="tx" ${s.textScale > 1 ? 'checked' : ''}></label></div>
      <div class="card"><h3>Controls</h3><p class="x">Lanes 1–4: <kbd>D</kbd> <kbd>F</kbd> <kbd>J</kbd> <kbd>K</kbd> or <kbd>←</kbd> <kbd>↓</kbd> <kbd>↑</kbd> <kbd>→</kbd>. Arrow notes accept a key press on desktop and a flick on touch.</p></div>
      <p class="fine" style="text-align:center">KBeats ${D.RELEASE.mode} · <a href="/games/kbeats/terms/">Terms</a> · <a href="/games/kbeats/privacy/">Privacy</a></p></div>`;
    $('#out').value = s.output;
    const save = () => { S.saveSettings(s); applyA11y(); };
    $('#out').onchange = e => { s.output = e.target.value; save(); screens.settings(); };
    $('#off').oninput = e => { s.offsets[s.output] = e.target.value / 1000; $('#offv').textContent = e.target.value + ' ms'; save(); };
    $('#off').onchange = () => D.saveCalibration(s.output, s.offsets[s.output], platform()).catch(() => {});
    $('#mv').oninput = e => { s.music = +e.target.value; save(); };
    $('#sv').oninput = e => { s.sfx = +e.target.value; save(); };
    $('#fx').oninput = e => { s.effects = +e.target.value; save(); };
    for (const [id, k] of [['hs', 'hitSounds'], ['hp', 'haptics'], ['rm', 'reducedMotion'], ['rf', 'reducedFlash']]) $('#' + id).onchange = e => { s[k] = e.target.checked; save(); };
    $('#tx').onchange = e => { s.textScale = e.target.checked ? 1.15 : 1; save(); };
  },
  calibrate() {
    $('#s-calibrate').innerHTML = `<div class="wrapc"><header class="top bar"><a class="ico" href="#/settings" aria-label="Back">${I.back}</a><b class="ttl">CALIBRATION</b></header>
      <div class="card" style="text-align:center"><p>Output: <b>${{ speaker: 'Device speaker', wired: 'Wired headphones', bluetooth: 'Bluetooth' }[settings.output]}</b> (change in Settings).</p>
      <p class="x">Press Start, listen, and tap the circle (or any key) on every click. 20 clicks; the first 4 are warm-up.</p>
      <div class="cal-dot" id="dot" role="button" tabindex="0" aria-label="Tap on the beat">TAP</div>
      <button class="btn primary" id="cs">Start</button><p id="cr" class="x" style="margin-top:12px"></p></div></div>`;
    $('#cs').onclick = async () => {
      await ensureClock(); clock.setVolumes(settings.music, Math.max(0.4, settings.sfx));
      $('#cs').disabled = true; $('#cr').textContent = 'Listen…';
      const cal = runCalibration(clock, { onBeat: k => { if (k >= 0) $('#dot').textContent = k < 4 ? 'READY' : String(k - 3); } });
      const tap = e => { e.preventDefault(); cal.tap(e.timeStamp); $('#dot').classList.add('hit'); setTimeout(() => $('#dot').classList.remove('hit'), 80); };
      $('#dot').onpointerdown = tap; const kd = e => { if (!e.repeat) tap(e); }; addEventListener('keydown', kd);
      setTimeout(() => {
        removeEventListener('keydown', kd); $('#dot').onpointerdown = null; $('#cs').disabled = false;
        const r = cal.finish();
        if (!r.ok) { $('#cr').textContent = `Only ${r.n} usable taps. Try again.`; return; }
        settings.offsets[settings.output] = Math.round(r.offset * 1000) / 1000; S.saveSettings(settings);
        D.saveCalibration(settings.output, settings.offsets[settings.output], platform()).catch(() => {});
        $('#cr').innerHTML = `Offset set to <b>${Math.round(r.offset * 1000)} ms</b> (±${Math.round(r.spread * 1000)} ms over ${r.n} taps). Saved to your account.`;
        $('#dot').textContent = '✓';
      }, cal.duration + 300);
    };
  },
};

function platform() { const u = navigator.userAgent; return window.Capacitor?.getPlatform?.() || (/iPhone|iPad/.test(u) ? 'ios-web' : /Android/.test(u) ? 'android-web' : 'web'); }
async function toggleFav(t, after) {
  const on = !isFav(t);
  try { await D.favorite(t.slug, on); ME.favorites = on ? [...ME.favorites, t.slug] : ME.favorites.filter(x => x !== t.slug); after(); } catch (e) { toast('Could not save: ' + e.message); }
}
async function toggleFollow(slug, after, from) {
  const on = !isFol(slug);
  try { await D.follow(slug, on, from); ME.follows = on ? [...ME.follows, slug] : ME.follows.filter(x => x !== slug); after(); } catch (e) { toast('Could not save: ' + e.message); }
}
function scLink(t) {
  const url = t.soundcloud || t.artistSoundcloud;
  if (!FLAGS.soundcloud_outbound_enabled || !url) return `<span class="dis"><b>${I.cloud}</b>No SoundCloud link</span>`;
  return `<a href="${esc(url)}" target="_blank" rel="noopener" data-sc="${esc(t.slug)}"><b>${I.cloud}</b>Listen on SoundCloud</a>`;
}
function bindSc() { document.querySelectorAll('[data-sc]').forEach(a => { if (a.tagName === 'A') a.onclick = () => { D.track('soundcloud_outbound', { track: a.dataset.sc }); D.flushEvents(); }; }); }

/* ── router ──────────────────────────────────────────────────────────── */
function go(h) { if (location.hash === h) route(); else location.hash = h; }
function route() {
  if (game.active) return;
  const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  let [name, a, b, c] = parts; if (!name || (!screens[name] && name !== 'results')) name = 'home';
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('on'));
  document.body.classList.toggle('on-results', name === 'results');
  const target = name === 'challenge' ? 'track' : name;
  if (name === 'results') { if (!lastPlay) return go('#/home'); }
  else screens[name](a, b, c);
  $('#s-' + target)?.classList.add('on');
  const navKey = { discover: 'discover', genres: 'genres', leaderboard: 'leaderboard', profile: 'profile', home: 'home' }[name] || '';
  document.querySelectorAll('[data-nav]').forEach(n => n.classList.toggle('on', n.dataset.nav === navKey));
  $('#s-' + target)?.scrollTo(0, 0);
}
addEventListener('hashchange', route);

/* ── gameplay ────────────────────────────────────────────────────────── */
const game = { active: false };
let hw = null;
const audioCache = new Map();

async function ensureClock() {
  if (!clock) clock = new SongClock();
  await clock.unlock();
  return clock;
}
async function loadAudio(t) {
  if (audioCache.has(t.slug)) return audioCache.get(t.slug);
  let buf;
  if (t.dev) { const pcm = renderDevTrack({ ...t, id: t.slug }); buf = clock.bufferFromPCM(pcm, 44100); }
  else {
    const { url } = await D.audioUrl(t.slug);                    // short-lived signed URL to the gameplay copy (never the master)
    const r = await fetch(url); if (!r.ok) throw new Error('audio download failed');
    buf = await clock.decode(await r.arrayBuffer());
  }
  audioCache.clear(); audioCache.set(t.slug, buf);
  return buf;
}

async function startGame(t, diff, opts = {}) {
  const gEl = $('#game'); gEl.classList.add('on'); $('#loading').classList.add('on'); $('#count').textContent = '';
  game.active = true;
  let notes, buffer, session = null;
  try {
    await ensureClock();
    notes = loadChart(t.charts[diff]);                           // verifies chart hash
    buffer = await loadAudio(t);
    if (Math.abs(buffer.duration * 1000 - t.charts[diff].durationMs) > 2000) throw new Error('chart/audio duration mismatch');
    if (!QA_AUTOPLAY) {
      try { session = await D.sessionStart(t.slug, diff, t.charts[diff].hash, !!opts.practice, platform()); }
      catch (e) { if (e.status === 409) throw new Error('this chart was updated, reload the page'); session = null; }   // offline: play unranked
    }
  } catch (e) {
    $('#loading').classList.remove('on'); gEl.classList.remove('on'); game.active = false; toast('Could not start: ' + e.message); return;
  }
  settings = S.settings();
  clock.inputOffset = settings.offsets[settings.output] || 0;
  clock.setVolumes(settings.music * (t.gain || 1), settings.sfx);   // loudness-normalised playback; master untouched
  if (!hw) { hw = new Highway($('#cv')); addEventListener('resize', () => hw.resize()); }
  hw.setOpts({ effects: settings.effects, reducedMotion: settings.reducedMotion, reducedFlash: settings.reducedFlash }); hw.resize();
  const judge = new Judge(notes, { practice: !!opts.practice });
  const ch = t.charts[diff];
  const energy = t.analysis?.energy || [], barSec = t.analysis?.barSec || 2, down = t.analysis?.downbeatSec || 0;
  Object.assign(game, { t, diff, opts, judge, ch, session, notes: judge.notes.slice().sort((a, b) => a.t - b.t), cursor: 0, duration: buffer.duration, ended: false, paused: false, buffer,
    st: { bpm: ch.bpm, offset: ch.offsetMs / 1000, lead: CONFIG.leadSec[diff], practice: !!opts.practice } });
  game.energyAt = s => energy[Math.max(0, Math.min(energy.length - 1, Math.floor((s - down) / barSec)))] ?? 0.5;
  $('#hTitle').textContent = t.title; $('#hArtist').textContent = t.artist + (opts.practice ? ' · PRACTICE' : session ? '' : ' · UNRANKED');
  const dp = $('#hDiff'); dp.className = 'pill dpill ' + diff; dp.textContent = DIFF[diff].toUpperCase();
  $('#sideL').innerHTML = `<img src="${coverArt(t, 256)}" alt=""><h4>${esc(t.title)}</h4><p>${esc(t.artist)}</p>`;
  $('#sideR').innerHTML = `<p>${t.analysis?.bpm || t.bpm} BPM · ${ch.notes.length} notes</p><div class="keys">${LANES.map(l => `<kbd style="color:${l.color}">${l.key}</kbd>`).join('')}</div><p style="margin-top:8px;font-size:12px">Esc to pause</p>`;
  D.track('track_started', { track: t.slug, diff, practice: !!opts.practice });
  $('#loading').classList.remove('on');
  clock.play(buffer, 3);                                         // song t=0 three seconds from now
  bindInput(true);
  requestAnimationFrame(frame);
}

function frame() {
  if (!game.active) return;
  const pn = performance.now();
  const now = clock.renderTime(pn);
  const j = game.judge;
  if (!game.paused) j.update(clock.judgeTimeAt(pn) - CONFIG.expireLagMs / 1000);
  for (const ev of j.events.splice(0)) {
    hw.feedback(ev, now);
    if (ev.j !== 'miss' && ev.j !== 'hype' && settings.hitSounds) clock.tick(0.08);
    haptic(ev.j);
  }
  const st = game.st;
  st.notes = game.notes; st.cursor = game.cursor; st.combo = j.combo; st.hype = j.hype; st.hypeOn = j.hypeActive(now);
  st.hypeLeft = st.hypeOn ? (j.hypeUntil - now) / CONFIG.hype.durationSec : 0; st.health = j.health; st.energy = game.energyAt(now);
  hw.draw(now, st); game.cursor = st.cursor;
  if (QA_AUTOPLAY) autoplay(pn);
  $('#count').textContent = now < 0 ? (now < -2 ? '3' : now < -1 ? '2' : '1') : now < 0.5 ? 'GO' : '';
  const sc = j.score.toLocaleString(); if ($('#hScore').textContent !== sc) $('#hScore').textContent = sc;
  const m = multiplierFor(j.combo) * (st.hypeOn ? CONFIG.hype.multiplier : 1);
  const cb = j.combo > 1 ? `COMBO x${m}` : ''; if ($('#hCombo').textContent !== cb) $('#hCombo').textContent = cb;
  $('#hProg').style.width = Math.max(0, Math.min(100, now / game.duration * 100)) + '%';
  $('#hT0').textContent = fmt(now); $('#hT1').textContent = '-' + fmt(game.duration - now);
  if (j.failed && !game.ended) return endGame(true);
  const lastT = game.notes.length ? Math.max(...game.notes.slice(-4).map(n => n.t + (n.dur || 0))) : 0;
  if (!game.ended && !game.paused && (now > game.duration + 0.3 || (j.done && now > lastT + 1.2))) return endGame(false);
  requestAnimationFrame(frame);
}
/* Capacitor Haptics on native, navigator.vibrate on Android web; iOS Safari has neither. */
function haptic(kind) {
  if (!settings.haptics) return;
  const H = window.Capacitor?.Plugins?.Haptics;
  if (H) { if (kind === 'perfect') H.impact({ style: 'LIGHT' }); else if (kind === 'hype') H.impact({ style: 'HEAVY' }); else if (kind === 'miss') H.notification({ type: 'WARNING' }); return; }
  if (navigator.vibrate) navigator.vibrate(kind === 'hype' ? 40 : kind === 'perfect' ? 8 : kind === 'miss' ? [4, 30, 4] : 0);
}

/* DEV-only QA: ?mode=dev&qa=autoplay drives the real keyboard path (dispatched KeyboardEvents, judged
   from their own timeStamp through the audio clock) at each note time, so headless runs measure
   end-to-end timing and drift. Disabled outside DEV; QA runs are never submitted. */
const QA_AUTOPLAY = D.isDev() && new URLSearchParams(location.search).get('qa') === 'autoplay';
function autoplay(pn) {
  const t = clock.judgeTimeAt(pn) + clock.inputOffset;
  for (const n of game.notes) {
    if (n.qa || n.t > t) continue;
    if (n.t < t - 0.1) { n.qa = 1; continue; }
    n.qa = 1; const L = LANES[n.lane];
    dispatchEvent(new KeyboardEvent('keydown', { key: L.key.toLowerCase() }));
    const up = n.type === 'hold' ? n.dur * 1000 + 20 : 40;
    setTimeout(() => dispatchEvent(new KeyboardEvent('keyup', { key: L.key.toLowerCase() })), up);
  }
}
// QA screenshot helper: finish the run by hitting the remaining notes on time (DEV only, never submitted)
if (QA_AUTOPLAY) window.__kbQAFinish = () => { if (!game.active) return; const j = game.judge;
  for (const n of game.notes) if (n.state === 0) { j.press(n.lane, n.t + 0.008, 'key'); j.release(n.lane, n.t + (n.dur || 0.04)); }
  j.update(Infinity); endGame(false); };
function laneFromKey(e) {
  const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  return LANES.findIndex(l => l.key === k || l.alt === k);
}
const pointers = new Map();
function onKeyDown(e) {
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { e.preventDefault(); return game.paused ? resume() : pause(); }
  const lane = laneFromKey(e); if (lane < 0 || e.repeat || game.paused) return;
  e.preventDefault(); hw.pressed[lane] = true;
  game.judge.press(lane, clock.judgeTimeAt(e.timeStamp), 'key');
}
function onKeyUp(e) { const lane = laneFromKey(e); if (lane < 0) return; hw.pressed[lane] = false; if (!game.paused) game.judge.release(lane, clock.judgeTimeAt(e.timeStamp)); }
function onDown(e) {
  if (game.paused || e.target.closest('.pause')) return;
  e.preventDefault();
  const r = $('#cv').getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  if (y < hw.H * 0.3) return;
  const lane = hw.laneAtX(x);
  pointers.set(e.pointerId, { lane, x, y, t: clock.judgeTimeAt(e.timeStamp), swiped: false });
  hw.pressed[lane] = true;
  game.judge.press(lane, clock.judgeTimeAt(e.timeStamp), 'touch');
}
function onMove(e) {
  const p = pointers.get(e.pointerId); if (!p || p.swiped) return;
  const r = $('#cv').getBoundingClientRect(), dx = e.clientX - r.left - p.x, dy = e.clientY - r.top - p.y;
  if (Math.hypot(dx, dy) < CONFIG.swipeMinPx) return;
  p.swiped = true;
  const dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
  game.judge.swipe(p.lane, p.t, dir);
}
function onUp(e) {
  const p = pointers.get(e.pointerId); if (!p) return; pointers.delete(e.pointerId);
  if (![...pointers.values()].some(q => q.lane === p.lane)) hw.pressed[p.lane] = false;
  if (!game.paused) game.judge.release(p.lane, clock.judgeTimeAt(e.timeStamp));
}
function onVis() { if (document.hidden && game.active && !game.paused) pause(); }
function bindInput(on) {
  const f = on ? addEventListener : removeEventListener, cv = $('#cv');
  f('keydown', onKeyDown); f('keyup', onKeyUp); document[on ? 'addEventListener' : 'removeEventListener']('visibilitychange', onVis);
  for (const [ev, fn] of [['pointerdown', onDown], ['pointermove', onMove], ['pointerup', onUp], ['pointercancel', onUp]]) cv[on ? 'addEventListener' : 'removeEventListener'](ev, fn);
}
function pause() {
  if (!game.active || game.paused || game.ended) return;
  game.paused = true; clock.pause();
  for (let l = 0; l < 4; l++) { hw.pressed[l] = false; if (game.judge.holding[l]) game.judge.release(l, clock.pausedAt); }
  pointers.clear(); $('#pauseO').classList.add('on');
}
function resume() { if (!game.paused) return; $('#pauseO').classList.remove('on'); clock.resume(1.5); game.paused = false; }
$('#pauseBtn').onclick = pause;
$('#resumeBtn').onclick = resume;
$('#restartBtn').onclick = () => { const { t, diff, opts } = game; quit(true); startGame(t, diff, opts); };
$('#quitBtn').onclick = () => quit();
function quit(silent) { clock.stop(); bindInput(false); game.active = false; game.paused = false; $('#pauseO').classList.remove('on'); $('#game').classList.remove('on'); if (!silent) { D.flushEvents(); route(); } }
// app suspended / resumed (Capacitor): pause gameplay, re-unlock audio on return
document.addEventListener('pause', () => game.active && !game.paused && pause());
document.addEventListener('resume', () => clock?.unlock());

function endGame(failed) {
  game.ended = true; const { t, diff, judge, opts, session, ch } = game;
  clock.stop(); bindInput(false);
  judge.update(Infinity);
  const r = judge.result(); if (failed) r.failed = true;
  game.active = false; $('#game').classList.remove('on');
  D.track(failed ? 'track_failed' : 'track_completed', { track: t.slug, diff, practice: r.practice });
  if (QA_AUTOPLAY) window.__kbQA = { ...r, deltas: judge.deltas, track: t.slug, diff };
  const prev = pb(t, diff);
  lastPlay = { t, diff, r, opts, rank: null, ranked: false, status: session ? 'verifying' : (r.practice ? 'practice' : 'unranked'), newBest: !prev || r.score > prev.score, scoreId: null };
  renderResults(); location.hash = '#/results'; route();
  // network only now, after the results are on screen
  (async () => {
    if (session && !QA_AUTOPLAY) {
      const res = await D.submitScore({ sessionId: session.sessionId, nonce: session.nonce, chartHash: ch.hash, log: judge.log,
        result: { score: r.score, perfect: r.perfect, great: r.great, good: r.good, miss: r.miss, maxCombo: r.maxCombo, accuracy: r.accuracy } }).catch(e => ({ error: e.message }));
      Object.assign(lastPlay, res.queued ? { status: 'queued' } : res.error ? { status: 'error', reason: res.error } : { status: res.ranked ? 'ranked' : res.verified ? (r.practice ? 'practice' : 'unranked') : 'rejected', rank: res.rank, scoreId: res.scoreId, reasons: res.reasons });
      if (res.ranked) await refreshMe();
      if (location.hash === '#/results') renderResults();
    }
    await D.flushEvents();
  })();
}

function renderResults() {
  const { t, diff, r, rank, newBest, opts, status } = lastPlay;
  const chall = opts.challenge;
  const conf = settings.reducedMotion ? '' : Array.from({ length: 26 }, (_, i) => `<i style="left:${(i * 37) % 100}%;top:${(i * 53) % 60}%;background:hsl(${(i * 47) % 360},90%,60%);transform:rotate(${i * 29}deg)"></i>`).join('');
  const statusLine = { ranked: `Verified · global rank #${rank}`, verifying: 'Verifying score…', queued: 'Offline: score will be submitted when you reconnect', unranked: 'Unranked run', practice: 'Practice (unranked)', rejected: 'Score could not be verified (unranked)', error: 'Score not saved: ' + (lastPlay.reason || '') }[status] || '';
  $('#s-results').innerHTML = `<div class="confetti" aria-hidden="true">${conf}</div><div class="wrapc res">
    <h1 class="sc">${r.failed ? 'TRACK FAILED' : 'SONG COMPLETE'}</h1>
    <div class="res-grade ${r.failed ? 'f' : ''}">${r.grade}</div>${starsHtml(r.stars, 'big-stars')}
    <div class="rtrk"><img src="${coverArt(t, 160)}" alt="" width="76" height="76"><div><b>${esc(t.title)}</b><div class="x">${esc(t.artist)} · <span class="pill ${diff}">${DIFF[diff]}</span></div></div></div>
    ${chall ? `<div class="banner">${r.score > +chall.score ? `You beat ${esc(chall.name)}'s ${Number(chall.score).toLocaleString()}! 🎉` : `${esc(chall.name)} still leads with ${Number(chall.score).toLocaleString()}.`}</div>` : ''}
    <div class="card stats"><span>Score</span><b class="s1">${r.score.toLocaleString()} ${newBest && !r.practice && !r.failed ? '<span class="nb">NEW BEST!</span>' : ''}</b>
      <span>Accuracy</span><b class="s1">${r.accuracy}%</b><span class="p">Perfect</span><b>${r.perfect}</b><span class="g">Great</span><b>${r.great}</b>
      <span class="o">Good</span><b>${r.good}</b><span class="m">Miss</span><b>${r.miss}</b><span>Max Combo</span><b>${r.maxCombo}${r.fullCombo ? ' · FC' : ''}</b></div>
    <p class="fine ctr" id="rstat">${esc(statusLine)}</p>
    <div class="grid2"><button class="btn ghost big" id="rp">REPLAY</button><button class="btn primary big" id="nx">NEXT TRACK</button></div>
    <div class="acts four"><button id="fv" class="${isFav(t) ? 'on' : ''}"><b>${I.heart}</b>Favorite</button><button id="fo" class="${isFol(t.artistId) ? 'on' : ''}"><b>${I.user}</b>${isFol(t.artistId) ? 'Following' : 'Follow Artist'}</button>
      <button id="sh"><b>${I.share}</b>Share</button>${scLink(t)}</div></div>`;
  $('#rp').onclick = () => { D.track('track_replayed', { track: t.slug }); startGame(t, diff, opts); };
  $('#nx').onclick = () => { const live = catalog.filter(x => ['published', 'development'].includes(x.status)); const nx = live[(live.findIndex(x => x.slug === t.slug) + 1) % live.length]; go('#/track/' + encodeURIComponent(nx.slug)); };
  $('#fv').onclick = () => toggleFav(t, renderResults);
  $('#fo').onclick = () => toggleFollow(t.artistId, renderResults, 'results');
  $('#sh').onclick = async () => {
    let url = `${location.origin}/games/kbeats/track/${encodeURIComponent(t.slug)}/`;
    if (lastPlay.scoreId && lastPlay.status === 'ranked') { try { url = (await D.challengeCreate(lastPlay.scoreId)).url; } catch {} }
    const text = `I scored ${r.score.toLocaleString()} (${r.grade}, ${r.accuracy}%) on ${t.title} in KBeats. Beat it:`;
    try { if (navigator.share) await navigator.share({ title: 'KBeats challenge', text, url }); else { await navigator.clipboard.writeText(`${text} ${url}`); toast('Challenge link copied'); } } catch {}
  };
  bindSc();
}

async function refreshMe(rerender) {
  try { ME = await D.me(); } catch { ME = ME || { level: 1, favorites: [], follows: [], personalBests: [], anonymous: true }; }
  if (ME?.calibration) { for (const [k, v] of Object.entries(ME.calibration)) settings.offsets[k] = v; S.saveSettings(settings); }
  if (rerender) route();
}

/* ── boot ────────────────────────────────────────────────────────────── */
(async function boot() {
  applyA11y();
  D.track('app_open');
  try {
    const cat = await D.loadCatalog();
    catalog = cat.tracks.map(t => ({ ...t, slug: t.slug || t.id }));
    FLAGS = { ...FLAGS, ...(cat.flags || {}) };
  } catch (e) {
    $('#s-home').innerHTML = `<div class="wrapc"><p class="empty">Could not reach KBeats. Check your connection and reload.<br><small>${esc(e.message)}</small></p></div>`; $('#s-home').classList.add('on'); return;
  }
  document.body.dataset.mode = D.RELEASE.mode;
  await D.auth.finishPendingMigration?.().catch(() => {});
  await refreshMe();
  const q = new URLSearchParams(location.search);
  if (q.get('track') && !location.hash) location.hash = '#/track/' + encodeURIComponent(q.get('track'));
  route();
  D.flushPendingScores().catch(() => {});
  D.flushEvents();
})();
