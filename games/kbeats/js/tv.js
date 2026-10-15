/* KBeats TV — shared live 1v1 view. The TV is a display (and, by default, the speaker): it never
   judges and never hosts the room, so it can join, drop or reload at any moment without affecting the
   match. Players' phones judge locally and stream their judgements here. */
import { LANES } from './config.js';
import { loadChart } from './chart.js';
import { SongClock } from './audio.js';
import { Highway } from './render.js';
import { renderDevTrack } from './devtracks.js';
import * as D from './data.js';
import { makeCode, normCode, validCode, PHONE_PAD_PX, acceptRoom, expired, AUD_TEXT } from './battle.js';
import { RoomChannel, SharedClock, deviceId, battleResult } from './battle-net.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = s => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const Q = new URLSearchParams(location.search);

let code = normCode(Q.get('room') || '');
if (!validCode(code)) { code = makeCode(); Q.set('room', code); history.replaceState(null, '', '?' + Q.toString()); }   // reload = rejoin the same room
const passthrough = new URLSearchParams(Q); passthrough.delete('room');
const joinUrl = `${location.origin}/games/kbeats/play/${passthrough.toString() ? '?' + passthrough : ''}#/battle/${code}`;

const me = { id: deviceId(), role: 'tv', name: 'TV', aud: 1 };   // aud: this TV reports when the picked song's music is ready
const shared = new SharedClock();
const clock = new SongClock();
let catalog = [], room = null, net = null, match = null, clockErr = null;
const P = {};                    // slot → { id, name, hw, notes, st, live, done }
const M = (globalThis.__kbTV = { clockErrMs: null, starts: [], audio: [], lagMs: [], audReady: [] });   // acceptance-test measurements
const audioCache = new Map();

$('#code').textContent = code;
$('#jurl').textContent = `${location.host}/games/kbeats/play → Live 1v1`;
drawQr($('#qr'), joinUrl);

async function boot() {
  try { catalog = (await D.loadCatalog()).tracks || []; } catch (e) { $('#seats').textContent = 'Could not load the catalog: ' + e.message; }
  // the TV never blocks a match: without the clock or Realtime it shows the problem and keeps retrying
  const sync = async () => { try { const e = await shared.sync(); shared.start(); clockErr = null; M.clockErrMs = e.errMs; } catch (e) { clockErr = e.message; setTimeout(sync, 5000); } paintSeats(); };
  await sync();
  net = new RoomChannel(code, me); net.on(onMsg); await net.open();
  setInterval(() => { if (!room?.members.some(m => m.id === me.id)) net.send('join', me); paintSeats(); }, 2000);
  setInterval(sendAud, 1000);                                     // readiness is only trusted while it keeps being confirmed
  addEventListener('pagehide', () => net?.send('aud', { id: me.id, track: '', state: 'loading' }));
  net.send('join', me);
  requestAnimationFrame(loop);
}
$('#unlockBtn').onclick = async () => { await clock.unlock(); $('#unlock').remove(); boot(); };
if (navigator.userActivation?.hasBeenActive || /Electron/.test(navigator.userAgent)) { $('#unlock').remove(); clock.unlock().finally(boot); }

const players = () => (room?.members || []).filter(m => m.role === 'player').sort((a, b) => a.slot - b.slot);
function paintSeats() {
  const ps = players();
  $('#seats').innerHTML = [1, 2].map(s => { const p = ps.find(x => x.slot === s); return `<div><i class="dot ${p && net?.online(p.id) ? 'on' : ''}"></i>P${s} · ${p ? esc(p.name) + (room.ready?.[p.id] ? ' — READY' : '') : 'waiting…'}</div>`; }).join('')
    + (room?.track ? `<div>♪ ${esc(catalog.find(t => t.slug === room.track)?.title || room.track)} · ${esc(room.diff)} · ${room.tvAudio ? 'music on TV' : 'earbuds'}${room.tvAudio && aud?.track === room.track ? ` · <span id="audState" data-state="${audNow()}">${AUD_TEXT[audNow()]}</span>` : ''}</div>` : '')
    + `<div style="font-size:.6em;color:${clockErr || net?.status === 'offline' ? '#fbbf24' : '#64748b'}">${clockErr ? 'match clock unavailable — retrying' : net?.status === 'offline' ? 'live connection unavailable — retrying' : net?.status || 'connecting'}${shared.errMs != null ? ` · clock ±${Math.round(shared.errMs)} ms` : ''}</div>`;
  for (const s of [1, 2]) { const p = P[s]; if (p) $('#pf' + s).classList.toggle('gone', !!match && !p.done && !net?.online(p.id)); }
}

function onMsg(type, p) {
  if (type === '_status') return paintSeats();
  if (type === 'room') {
    if (!acceptRoom(room, p.id, p.room, room ? net.online(room.host, 5000) : false)) return;
    if (expired(p.room, shared.delta != null ? shared.now() : Date.now())) { Q.delete('room'); location.search = Q.toString(); return; }   // expired: open a fresh room
    room = p.room; prepare(); paintSeats(); if (room.phase === 'playing' && room.start && room.start.match !== match?.match) begin(room.start); return; }   // TV (re)joining mid-match
  if (type === 'start') { if (!room || p.id !== room.host) return; return begin(p); }
  if (type === 'cal') return metronome(p);
  if (!match || p.match !== match.match) return;
  const slot = Object.keys(P).find(s => P[s].id === p.id); if (!slot) return;
  const pl = P[slot];
  if (type === 'live') { pl.live = p.st; paintHud(); if (p.st.t > 0) { M.lagMs.push(Math.round(clock.renderTime() * 1000 - p.st.t * 1000)); if (M.lagMs.length > 400) M.lagMs.shift(); } }
  if (type === 'j') for (const [i, j, lane, head] of p.ev) { const n = pl.byIndex[i]; if (n) n.state = head && n.type === 'hold' && j !== 'miss' ? 1 : 2; pl.hw.feedback({ j, lane, kind: head ? 'head' : 'tail' }, clock.renderTime()); }
  // untrusted hints only: done/quit just trigger a server re-check of the match record
  if (type === 'done' || type === 'quit') { pl.left = type === 'quit'; settle(); }
}

async function begin(s) {
  const t = catalog.find(x => x.slug === s.track); if (!t || t.charts[s.diff]?.hash !== s.chartHash || shared.delta == null) return;
  match = s; $('#res').classList.remove('on'); $('#res').innerHTML = '';   /* never show the previous match's result */ $('#lobby').style.display = 'none'; $('#arena').classList.add('on');
  $('#title').textContent = `${t.title} — ${t.artist}`; $('#diff').className = 'pill ' + s.diff; $('#diff').textContent = s.diff.toUpperCase();
  const ch = t.charts[s.diff];
  for (const pl of players()) {
    const notes = loadChart(ch).map((n, i) => ({ ...n, i, state: 0 })).sort((a, b) => a.t - b.t);
    const box = $('#pf' + pl.slot), cv = box.querySelector('canvas');
    const hw = P[pl.slot]?.hw || new Highway(cv, { padPx: PHONE_PAD_PX * 2, maxBw: 1600 });   // directional keys at 2× the phone size, fitted to the half screen
    hw.resize();
    P[pl.slot] = { id: pl.id, name: `P${pl.slot} · ${pl.name}`, hw, notes, byIndex: Object.fromEntries(notes.map(n => [n.i, n])), st: null, live: null, done: null };
    box.querySelector('.nm').textContent = `P${pl.slot} · ${pl.name}`;
  }
  game.ch = ch; game.duration = ch.durationMs / 1000; game.lead = ({ easy: 1.9, normal: 1.6, expert: 1.3 })[s.diff];
  const lead = shared.perfAt(s.epoch) - performance.now();   // countdown: a quick burst of clock samples tightens the start estimate
  if (lead > 3000 && net?.status === 'online') { try { await Promise.race([shared.sync(6), new Promise(r => setTimeout(r, Math.min(2500, lead - 2500)))]); } catch {} }
  if (match !== s) return;
  const zeroPerf = shared.perfAt(s.epoch);
  M.starts.push({ match: s.match, receivedWall: Date.now(), wallZero: performance.timeOrigin + zeroPerf, receivedBeforeMs: Math.round(zeroPerf - performance.now()), tvAudio: s.tvAudio });
  if (s.tvAudio) {
    try { const buf = await loadAudio(t); clock.setVolumes(0.9 * (t.gain || 1), 0.5); clock.playAtPerf(buf, zeroPerf); }
    catch (e) { clock.followTimeline(zeroPerf); $('#stamp').textContent = 'TV audio unavailable: ' + e.message; }
  } else clock.followTimeline(zeroPerf);
  paintHud();
}
/* Music on the TV: download + decode the picked song in the lobby and tell the host, which starts the match only once
   it is ready — so the TV never starts late because the song was still loading. */
let aud = null;                                                   // { track, state: loading | ready | error }
// 'ready' only while this page's audio is unlocked (a TV that blocks sound would start the match silent)
const audNow = () => aud.state === 'ready' && clock.ctx.state !== 'running' ? 'locked' : aud.state;
const sendAud = () => { if (aud && net) net.send('aud', { id: me.id, track: aud.track, state: audNow() }); };
function prepare() {
  if (!room?.tvAudio || !room.track || room.phase !== 'lobby' || (aud?.track === room.track && aud.state !== 'error')) return;
  const t = catalog.find(x => x.slug === room.track); if (!t) return;
  if (aud?.state === 'error' && aud.track === t.slug && performance.now() - aud.at < 10000) return;   // retry a failed load every 10 s
  const a = aud = { track: t.slug, state: 'loading', at: performance.now() }; sendAud(); paintSeats();
  loadAudio(t).then(() => { a.state = 'ready'; M.audReady.push({ track: t.slug, wall: Date.now() }); }, () => { a.state = 'error'; a.at = performance.now(); }).finally(() => { if (aud === a) { sendAud(); paintSeats(); } });
}
function loadAudio(t) {
  if (audioCache.has(t.slug)) return audioCache.get(t.slug);
  const p = fetchAudio(t); audioCache.clear(); audioCache.set(t.slug, p);
  p.catch(() => { if (audioCache.get(t.slug) === p) audioCache.delete(t.slug); });
  return p;
}
async function fetchAudio(t) {
  let buf;
  if (t.dev) buf = clock.bufferFromPCM(renderDevTrack({ ...t, id: t.slug }), 44100);
  else { const t0 = performance.now(); const { url } = await D.audioUrl(t.slug); const r = await fetch(url); if (!r.ok) throw new Error('audio download failed'); const ab = await r.arrayBuffer(); const t1 = performance.now(), bytes = ab.byteLength; buf = await clock.decode(ab); M.audio.push({ track: t.slug, bytes, downloadMs: Math.round(t1 - t0), decodeMs: Math.round(performance.now() - t1) }); }
  return buf;
}
const game = { ch: null, duration: 0, lead: 1.6 };

function loop() {
  requestAnimationFrame(loop);
  if (!match) return;
  const now = clock.renderTime();
  for (const s of [1, 2]) {
    const pl = P[s]; if (!pl) continue;
    for (const n of pl.notes) {            // lost/late events never leave a note hanging on the TV
      if (n.state === 1 && now > n.t + (n.dur || 0) + 0.05) n.state = 2;
      else if (n.state === 0 && now > n.t + 0.4 + (n.dur || 0)) n.state = 2;
    }
    const L = pl.live || {};
    const st = pl.st ||= { notes: pl.notes, cursor: 0 };     // draw() advances st.cursor past finished notes
    Object.assign(st, { bpm: game.ch.bpm, offset: game.ch.offsetMs / 1000, lead: game.lead, combo: L.combo || 0, hype: 0, hypeOn: false, hypeLeft: 0, health: L.hp ?? 0.6, energy: 0.5, practice: false });
    pl.hw.draw(now, st);
  }
  $('#count').textContent = now < 0 ? String(Math.min(3, Math.ceil(-now))) : now < 0.6 ? 'GO' : '';
  $('#prog').style.width = Math.max(0, Math.min(100, now / game.duration * 100)) + '%';
  $('#tleft').textContent = '-' + fmt(game.duration - now);
  if (now > game.duration + 3 && !$('#res').classList.contains('on')) settle();
}
function paintHud() {
  const sc = [1, 2].map(s => P[s]?.live?.score || 0);
  for (const s of [1, 2]) {
    const pl = P[s]; if (!pl) continue; const L = pl.live, box = $('#pf' + s);
    box.querySelector('.sc').textContent = (L?.score || 0).toLocaleString();
    box.querySelector('.st').textContent = L ? `${L.acc.toFixed(1)}% · ${L.combo}x` : '';
    box.classList.toggle('lead', sc[s - 1] > sc[2 - s]);
  }
}

/* The TV never decides a result: it shows RESULT PENDING until the server (battle_result over both
   players' sessions) answers final, void or invalid. */
let polling = false, resultShown = null;
async function settle() {
  if (!match || polling) return;
  const m = match;
  let r;
  polling = true; try { r = await battleResult(m.matchId); } catch (e) { r = { status: 'pending', decidedBy: 'result service unreachable — retrying' }; } finally { polling = false; }
  if (match !== m) return;
  const nameOf = slot => P[slot]?.name || 'P' + slot;
  let html;
  if (r.status === 'final') {
    html = `<h1>${r.winnerSlot ? esc(nameOf(r.winnerSlot)) + ' WINS' : 'DRAW'}</h1><div>Decided by ${esc(r.decidedBy)} · server-verified</div>
      <table><tr><th></th><th>Score</th><th>Accuracy</th><th>Max combo</th><th>Perfect / Great / Good / Miss</th></tr>
      ${(r.entries || []).filter(Boolean).map(e => `<tr><td>${esc(nameOf(e.slot))}${e.slot === r.winnerSlot ? ' 👑' : ''}</td>${e.submitted ? `<td>${e.score.toLocaleString()}</td><td>${(+e.accuracy).toFixed(2)}%</td><td>${e.maxCombo}</td><td>${e.perfect} / ${e.great} / ${e.good} / ${e.miss}</td>` : '<td colspan="4">no run submitted</td>'}</tr>`).join('')}</table>`;
  } else if (r.status === 'pending') html = `<h1 style="color:#a5b4fc">RESULT PENDING</h1><div>${esc(r.decidedBy)}</div>`;
  else html = `<h1 style="color:#94a3b8">NO RESULT</h1><div>${esc(r.decidedBy)}</div>`;
  $('#res').innerHTML = html + '<div style="color:#a5a3c4">Rematch: both players tap Ready on their phones.</div>'; $('#res').classList.add('on');
  if (r.status === 'pending') { clearTimeout(settle.t); settle.t = setTimeout(settle, 5000); return; }
  if (resultShown === m.match) return; resultShown = m.match;
  setTimeout(() => { if (match === m) { match = null; clock.stop(); $('#arena').classList.remove('on'); $('#res').classList.remove('on'); $('#lobby').style.display = ''; for (const k of [1, 2]) delete P[k]; } }, 20000);
}

/* in-room calibration: clicks scheduled on the match clock, exactly the way the song is */
function metronome({ epoch, bpm, beats }) {
  const per = 60 / bpm, zeroPerf = shared.perfAt(epoch);
  for (let k = 0; k < beats; k++) clock.click(clock._audibleCtxAt(zeroPerf + k * per * 1000), k % 4 === 0);
}

function drawQr(cv, text) {
  const q = window.qrcode(0, 'M'); q.addData(text); q.make(); const n = q.getModuleCount(), g = cv.getContext('2d'), s = cv.width / (n + 4);
  g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = '#000';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) g.fillRect((x + 2) * s, (y + 2) * s, Math.ceil(s), Math.ceil(s));
}
addEventListener('resize', () => { for (const s of [1, 2]) P[s]?.hw.resize(); });
export { LANES };
