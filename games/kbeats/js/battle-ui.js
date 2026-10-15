/* KBeats live 1v1 — lobby, live opponent panel and battle results for phones, mobile browsers and
   desktop. Gameplay itself is the unchanged single-player engine: app.js starts a normal ranked run
   with opts.battle, judges locally, and only reports progress here. Nothing in this file runs unless
   the player opens #/battle, so solo play is untouched. */
import * as S from './store.js';
import * as D from './data.js';
import { makeCode, normCode, validCode, seat, liveSnapshot, ROOM_TTL_MS, expired, acceptRoom, tvAudioGate, AUD_TEXT } from './battle.js';
import { RoomChannel, SharedClock, deviceId, battleResult, battleCreate, battleJoin, battleSession } from './battle-net.js';

let A = null;                 // app context (injected by app.js)
/* Measurements for acceptance tests (read by automation; never sent anywhere). wallZero = wall-clock ms at
   which this device's song time 0 occurs — comparable across devices that share a wall clock. */
const M = (globalThis.__kbBattle = { clockErrMs: null, lagMs: [], starts: [], results: [] });
const B = { net: null, shared: null, room: null, me: null, code: null, match: null, opp: null, mine: null, theirs: null, result: null, lastLive: 0, jq: [], lastJ: 0, cal: null };
export const active = () => !!B.match;
export function init(ctx) { A = ctx; }

const keepitil = () => A.catalog().filter(t => D.isDev() ? true : !t.dev);   // approved KEEPITIL catalog only (DEV tracks only in local DEV)
const players = r => (r?.members || []).filter(m => m.role === 'player').sort((a, b) => a.slot - b.slot);
const tvIn = r => (r?.members || []).some(m => m.role === 'tv');
const joinUrl = code => { const q = new URLSearchParams(location.search); q.delete('qa'); const qs = q.toString(); return `${location.origin}/games/kbeats/play/${qs ? '?' + qs : ''}#/battle/${code}`; };

/* ── room lifecycle ────────────────────────────────────────────────────── */
async function enter(code) {
  if (B.code === code && B.net) return;
  leave();
  B.code = code; B.me = { id: deviceId(), role: 'player', name: (A.me()?.name || S.settings().name || 'Player').slice(0, 20) };
  B.shared = new SharedClock();
  B.room = null; B.result = null; B.mySlot = null; B.submitted = false;
  render();
  await syncClock();
  B.net = new RoomChannel(code, B.me); B.net.on(onMsg);
  try { await B.net.open(); } catch { B.net._setStatus('offline'); B.net._retry?.(); }   // shown with a Retry button; the lobby never dead-ends
  B.net.send('join', B.me);
  // nobody answered with a room: this device founds it as player 1 (the TV, if any, is seated as it says hello)
  setTimeout(() => { if (!B.room && B.code === code && B.net) { B.room = { code, host: B.me.id, members: [{ ...B.me, slot: 1 }], track: null, diff: 'normal', tvAudio: true, ready: {}, phase: 'lobby', rev: 1, expires: nowMs() + ROOM_TTL_MS }; seatKnown(); publish(); } }, 1500);
  B.hostTick = setInterval(hostDuty, 2000); B.audTick = setInterval(audDuty, 1000);
}
// the match clock is required before anyone can start; a failure is shown with a retry, never a dead lobby
async function syncClock() {
  try { const e = await B.shared.sync(); B.shared.start(); B.clockErr = null; M.clockErrMs = e.errMs; } catch (e) { B.clockErr = e.message || 'match clock unavailable'; }
  render();
}
const nowMs = () => (B.shared?.delta != null ? B.shared.now() : Date.now());
function leave() {
  if (B.net) { if (B.match) B.net.send('quit', { id: B.me.id, match: B.match.match }); B.net.close(); }
  clearInterval(B.hostTick); clearInterval(B.audTick); B.shared?.stop();
  Object.assign(B, { net: null, room: null, code: null, match: null, opp: null });
}
const isHost = () => B.room?.host === B.me?.id;
const known = new Map();      // id → {role, name} from hello/join
function seatKnown() {
  for (const [id, k] of known) if (!B.room.members.some(m => m.id === id)) { const s = seat(B.room.members, id, k.role); if (s != null) B.room.members.push({ id, role: k.role, name: k.name, slot: s }); }
}
/** host: TV music readiness, now (see tvAudioGate); the state is published for the other player's lobby */
function hostGate() { const tv = B.room?.members.find(m => m.role === 'tv'); return tvAudioGate(B.room, B.aud, performance.now(), !!tv && B.net?.online(tv.id, 3000)); }
function audDuty() {
  if (!isHost() || !B.room) return;
  const tv = B.room.members.find(m => m.role === 'tv'), ok = !!tv && !!known.get(tv.id)?.aud;
  if (tv && B.room.tvAudOk !== ok) B.room.tvAudOk = ok;          // does the seated TV's page report readiness?
  const st = hostGate().state; if (B.room.tvAudState !== st) { B.room.tvAudState = st; publish(); }
  maybeStart();
}
function publish() { M.room = B.room && { phase: B.room.phase, host: B.room.host === B.me.id ? 'me' : 'other', ready: Object.keys(B.room.ready || {}).length, track: B.room.track, rev: B.room.rev }; if (!isHost()) return; B.room.rev++; B.net.send('room', { id: B.me.id, room: B.room }); render(); }
function hostDuty() {
  if (B.clockErr && B.net) syncClock();
  if (!B.room || !B.net) return;
  // host failover: the lowest-slot player that is still online takes over the room
  if (!isHost() && !B.net.online(B.room.host, 5000)) {
    const alive = players(B.room).filter(p => p.id === B.me.id || B.net.online(p.id, 5000));
    if (alive[0]?.id === B.me.id) { B.room.host = B.me.id; publish(); }
  }
  if (isHost()) B.net.send('room', { id: B.me.id, room: B.room });      // periodic snapshot: late joiners and a rejoining TV catch up
  render();
}

function onMsg(type, p, self = false) {
  if (type === '_status') return render();
  if (p.id === B.me.id && !self) return;
  if (type === 'hello' || type === 'join') {
    known.set(p.id, { role: p.role === 'tv' ? 'tv' : 'player', name: String(p.name || '').slice(0, 20), aud: p.aud === 1 });
    // a TV (re)connecting or reloading: its readiness is unknown until it reports again
    if (p.role === 'tv' && B.aud?.id === p.id) B.aud = null;
    if (isHost()) { seatKnown(); publish(); }
    return;
  }
  if (type === 'room') {
    // only the room's own host may publish it; another device takes over only when that host is gone
    if (!acceptRoom(B.room, p.id, p.room, B.room ? B.net.online(B.room.host, 5000) : false)) return;
    B.room = p.room;
    if (B.room.phase === 'playing' && B.room.match && !B.match && !A.inGame()) start(B.room.start);   // rejoin mid-match is not supported for players: they forfeit
    return render();
  }
  if (!B.room) return;
  if (isHost()) {
    if (type === 'pick' && B.room.phase === 'lobby') { B.room.track = p.track; B.room.diff = p.diff; B.room.ready = {}; publish(); }
    if (type === 'ready' && B.room.phase === 'lobby') { B.room.ready[p.id] = !!p.ready; maybeStart(); publish(); }
    if (type === 'mode' && B.room.phase === 'lobby') { B.room.tvAudio = !!p.tvAudio; B.room.ready = {}; publish(); }
    if (type === 'aud' && B.room.members.some(m => m.id === p.id && m.role === 'tv')) { B.aud = { id: p.id, track: String(p.track), state: String(p.state), at: performance.now() }; audDuty(); }
    if ((type === 'done' || type === 'quit') && players(B.room).some(x => x.id === p.id)) { B.room.phase = 'lobby'; B.room.ready = {}; }
  }
  if (type === 'start') { if (p.id !== B.room.host) return; return start(p); }   // starts are accepted from the room host only
  if (type === 'live' && B.match && p.match === B.match.match) { B.opp = p.st; paintOpp(); const z = B.shared?.perfAt(B.match.epoch); if (z != null && p.st.t > 0) { M.lagMs.push(Math.round((performance.now() - z) / 1000 * 1000 - p.st.t * 1000)); if (M.lagMs.length > 400) M.lagMs.shift(); } }
  // untrusted hints: a session id is only a claim (the server checks the pair); done/quit only trigger a server re-check
  if (type === 'done' && B.match && p.match === B.match.match) poll();
  if (type === 'quit' && B.match && p.match === B.match.match) { B.opp = { ...(B.opp || {}), left: true }; paintOpp(); poll(); }
}

let creating = false;
async function maybeStart() {
  if (creating || !isHost() || B.room?.phase !== 'lobby' || B.shared?.delta == null || expired(B.room, nowMs())) return;
  const ps = players(B.room);
  if (ps.length !== 2 || !B.room.track || !ps.every(p => B.room.ready[p.id])) return;
  if (!hostGate().ok) return;                     // music on the TV: wait for a fresh "decoded" report from the connected TV
  const t = A.findTrack(B.room.track); if (!t) return;
  const ch = t.charts[B.room.diff]; if (!ch) return;
  // the server owns the match: create its record first (the host is slot 1); players join it with their own identity.
  // A record created for a start that was then held back is reused for the same song.
  const key = [B.code, B.room.track, B.room.diff, ch.hash].join('|');
  creating = true; let created = B.created?.key === key ? B.created : null;
  try { if (!created) { M.creates = (M.creates || 0) + 1; created = B.created = { key, ...(await battleCreate(B.code, B.room.track, B.room.diff, ch.hash)) }; } }
  catch (e) { M.startError = e.message; A.toast('Could not start the match: ' + e.message); B.room.ready = {}; publish(); return; }
  finally { creating = false; }
  // re-check everything after the server round trip, immediately before broadcasting the start
  const now = players(B.room);
  if (!isHost() || B.room.phase !== 'lobby' || [B.code, B.room.track, B.room.diff, ch.hash].join('|') !== key || now.length !== 2 || !now.every(p => B.room.ready[p.id])) return;
  if (!hostGate().ok) { M.heldBack = (M.heldBack || 0) + 1; audDuty(); return render(); }
  B.created = null;
  const s = { id: B.me.id, match: 'm' + Date.now().toString(36), matchId: created.matchId, epoch: Math.round(B.shared.now() + 6000), track: B.room.track, diff: B.room.diff, chartHash: ch.hash, tvAudio: !!(B.room.tvAudio && tvIn(B.room)) };
  Object.assign(B.room, { phase: 'playing', match: s.match, start: s });
  B.net.send('start', s); start(s);
}

async function start(s) {
  if (B.match?.match === s.match) return;
  if (B.shared?.delta == null) { A.toast('Match clock not ready — the match was not started on this device'); return; }
  const t = A.findTrack(s.track);
  if (!t || t.charts[s.diff]?.hash !== s.chartHash) { A.toast('Your game has a different version of this song — reload'); return; }
  B.match = s; B.opp = null; B.mySlot = null; B.submitted = false; B.result = null; B.jq = []; clearInterval(B.pollT);
  const opp = players(B.room).find(p => p.id !== B.me.id);
  B.oppName = opp?.name || 'Opponent';
  // the countdown leaves ~6 s: a quick burst of clock samples tightens this device's estimate of the shared start moment
  const lead = B.shared.perfAt(s.epoch) - performance.now();
  if (lead > 3000 && B.net?.status === 'online') { try { await Promise.race([B.shared.sync(6), new Promise(r => setTimeout(r, Math.min(2500, lead - 2500)))]); } catch {} }
  if (B.match !== s) return;
  M.starts.push({ match: s.match, matchId: s.matchId, wallZero: performance.timeOrigin + B.shared.perfAt(s.epoch), receivedBeforeMs: Math.round(B.shared.perfAt(s.epoch) - performance.now()), clockErrMs: B.shared.errMs });
  A.startGame(t, s.diff, { battle: { match: s.match, zeroPerf: B.shared.perfAt(s.epoch), tvAudio: s.tvAudio, oppName: B.oppName } });
}

/* ── in-game hooks (called by app.js) ─────────────────────────────────── */
export function frame(judge, songT, events) {
  if (!B.match || !B.net) return;
  for (const ev of events) if (ev.note >= 0) B.jq.push([ev.note, ev.j, ev.lane, ev.kind === 'head' ? 1 : 0]);
  const now = performance.now();
  if (B.jq.length && now - B.lastJ > 100) { B.net.send('j', { id: B.me.id, match: B.match.match, ev: B.jq.splice(0) }); B.lastJ = now; }
  if (now - B.lastLive > 200) { B.net.send('live', { id: B.me.id, match: B.match.match, st: liveSnapshot(judge, songT) }); B.lastLive = now; }
}
function paintOpp() {
  const el = document.getElementById('oppo'); if (!el) return;
  const o = B.opp, online = B.net && players(B.room).some(p => p.id !== B.me.id && B.net.online(p.id));
  el.innerHTML = `<div class="on-name">VS ${A.esc(B.oppName || 'Opponent')}${o?.left ? ' · left' : online ? '' : ' · reconnecting'}</div>
    <b>${(o?.score ?? 0).toLocaleString()}</b><div class="on-sub">${o ? `${o.acc.toFixed(1)}% · ${o.combo}x` : 'waiting…'}</div>
    <i style="width:${o && o.total ? Math.min(100, o.judged / o.total * 100) : 0}%"></i>`;
}
/* ── result: server-decided only ──────────────────────────────────────────
   The client never decides an outcome. It shares its server session id, submits its run through the
   normal verified path, then asks the server (battle_result over both sessions) until it says final. */
/** Join the server's match record with this device's signed-in identity and open the match's only play
    session (called by app.js before the countdown). Errors (full, expired, not a member) stop this device's run. */
export async function matchSession(platform) {
  if (!B.match?.matchId) throw new Error('no match');
  const j = await battleJoin(B.match.matchId); B.mySlot = j.slot;
  return battleSession(B.match.matchId, platform);
}
export async function finished(r, submit) {
  if (!B.match) return;
  await submit;                                                       // the normal score_submit (server replay)
  B.submitted = true;
  B.net?.send('done', { id: B.me.id, match: B.match.match });
  renderResultCard(); poll();
  clearInterval(B.pollT); const m = B.match;
  B.pollT = setInterval(() => { if (B.match !== m || ['final', 'void', 'invalid'].includes(B.result?.status)) return clearInterval(B.pollT); poll(); }, 5000);
}
export function forfeit() { if (B.match && B.net) B.net.send('quit', { id: B.me.id, match: B.match.match }); clearInterval(B.pollT); B.match = null; }

let polling = false;
async function poll() {
  if (!B.match?.matchId || !B.submitted || polling) return renderResultCard();
  polling = true;
  try { B.result = await battleResult(B.match.matchId); }
  catch (e) { B.result = { status: 'pending', decidedBy: 'could not reach the result service (' + e.message + ') — retrying' }; }
  finally { polling = false; }
  if (B.result?.status !== 'pending' && B.room) { B.room.phase = 'lobby'; B.room.ready = {}; }
  if (B.result && B.result.status !== 'pending') M.results.push({ matchId: B.match?.matchId, ...B.result });
  renderResultCard();
}
export function resultCard() {
  if (!B.match && !B.result) return '';
  const r = B.result, back = `<a class="btn primary" href="#/battle/${B.code || ''}" style="width:100%;margin-top:10px">${r?.status === 'final' ? 'Rematch' : 'Back to the room'}</a>`;
  if (!B.submitted || !r || r.status === 'pending') return `<div class="card battle-res"><h3>RESULT PENDING</h3><p class="x">${A.esc(!B.submitted ? 'Submitting your run for server verification…' : r?.decidedBy || 'Waiting for the server-verified result…')}</p></div>`;
  if (r.status !== 'final') return `<div class="card battle-res"><h3>NO RESULT</h3><p class="x">${A.esc(r.decidedBy || 'The match could not be verified')} · no winner is declared.</p>${back}</div>`;
  const won = r.winnerSlot != null && r.winnerSlot === B.mySlot, draw = !r.winner;
  const row = e => `<tr><td>P${e.slot} · ${A.esc(e.name)}${e.slot === B.mySlot ? ' (you)' : ''}${e.slot === r.winnerSlot ? ' 👑' : ''}</td>${e.submitted ? `<td>${e.score.toLocaleString()}</td><td>${(+e.accuracy).toFixed(2)}%</td><td>${e.maxCombo}</td><td>${e.perfect}/${e.great}/${e.good}/${e.miss}</td><td>${e.verified ? '✓' : '✗'}</td>` : '<td colspan="5">no run submitted</td>'}</tr>`;
  return `<div class="card battle-res ${won ? 'won' : draw ? '' : 'lost'}"><h3>${draw ? 'DRAW' : won ? 'YOU WIN!' : `${A.esc(B.oppName)} WINS`}</h3>
    <p class="x">Decided by ${A.esc(r.decidedBy)} · server-verified</p>
    ${r.entries?.filter(Boolean).length ? `<table class="bt"><tr><th></th><th>Score</th><th>Acc.</th><th>Combo</th><th>P/G/G/M</th><th>Valid</th></tr>${r.entries.filter(Boolean).map(row).join('')}</table>` : ''}${back}</div>`;
}
function renderResultCard() { const el = document.querySelector('#battleCard'); if (el) el.innerHTML = resultCard(); }
export function endMatch() { B.match = null; }

/* ── lobby screen ─────────────────────────────────────────────────────── */
export function screen(code) {
  code = normCode(code || '');
  if (!validCode(code)) { leave(); return renderEntry(); }
  if (B.code !== code) enter(code); else render();
}
function renderEntry() {
  const el = document.querySelector('#s-battle');
  el.innerHTML = `<div class="wrapc"><header class="top bar"><a class="ico" href="#/home" aria-label="Back">${A.icon('back')}</a><b class="ttl">LIVE 1V1</b></header>
    <div class="card"><h3>Play a friend, live</h3><p class="x">Same song, same chart, same start. Each of you plays on your own phone or computer; the winner is verified on the server.</p>
      <button class="btn primary" id="bCreate" style="width:100%;margin-top:10px">Create a private room</button>
      <div style="display:flex;gap:8px;margin-top:12px"><input id="bCode" maxlength="6" placeholder="ROOM CODE" autocapitalize="characters" style="flex:1;text-transform:uppercase;letter-spacing:.2em;font-weight:800"><button class="btn ghost" id="bJoin">Join</button></div></div>
    <div class="card"><h3>On a TV</h3><p class="x">Open <b>keepitil.com/games/kbeats/tv</b> on a TV browser or a computer connected to the TV, then scan its QR code with both phones.</p></div></div>`;
  el.querySelector('#bCreate').onclick = () => A.go('#/battle/' + makeCode());
  el.querySelector('#bJoin').onclick = () => { const c = normCode(el.querySelector('#bCode').value); if (validCode(c)) A.go('#/battle/' + c); else A.toast('Enter the 6-character room code'); };
}
function render() {
  const el = document.querySelector('#s-battle'); if (!el || !B.code) return;
  if (B.match && A.inGame()) return paintOpp();
  const r = B.room, me = r?.members.find(m => m.id === B.me.id), ps = players(r), tv = tvIn(r);
  const tracks = keepitil(), gate = isHost() ? hostGate() : { state: r?.tvAudio && tv && r?.track ? r.tvAudState || 'offline' : null };
  const t = r?.track ? A.findTrack(r.track) : null;
  if (r && expired(r, nowMs())) { el.innerHTML = `<div class="wrapc"><div class="card"><h3>Room ${B.code} expired</h3><p class="x">Private rooms last 2 hours.</p><a class="btn primary" href="#/battle" style="width:100%;margin-top:10px">Create a new room</a></div></div>`; return; }
  const status = B.clockErr ? 'Match clock unavailable: ' + B.clockErr : !B.net ? 'Connecting…' : B.net.status === 'offline' ? 'Live connection unavailable' : B.net.status !== 'online' ? 'Reconnecting…' : !r ? 'Joining room…' : !me ? 'Room is full (2 players)' : ps.length < 2 ? 'Waiting for your opponent…' : !r.track ? 'Pick a song' : ps.every(p => r.ready[p.id]) ? (gate.state && gate.state !== 'ready' ? 'Waiting for the TV music: ' + AUD_TEXT[gate.state] + ' — or choose Wired earbuds' : 'Starting…') : 'Both players tap Ready';
  const dot = id => id === B.me.id || B.net?.online(id) ? '<i class="dot on"></i>' : '<i class="dot"></i>';
  el.innerHTML = `<div class="wrapc"><header class="top bar"><a class="ico" href="#/battle" aria-label="Leave room">${A.icon('back')}</a><b class="ttl">LIVE 1V1</b></header>
    <div class="card bl-code"><div><small>ROOM CODE</small><b>${B.code}</b><small class="x">${A.esc(status)}${B.shared?.errMs != null ? ` · clock ±${Math.round(B.shared.errMs)} ms` : ''}</small></div><canvas id="bQr" width="132" height="132" aria-label="QR code to join"></canvas></div>
    ${B.clockErr || B.net?.status === 'offline' ? `<div class="card"><p class="x">The live connection is not available right now. Nothing is lost: retry, or play solo meanwhile.</p><button class="btn primary" id="bRetry" style="width:100%;margin-top:8px">Retry connection</button></div>` : ''}
    <div class="card"><h3>Players</h3>${[1, 2].map(s => { const p = ps.find(x => x.slot === s); return `<div class="bl-p">${p ? dot(p.id) : '<i class="dot"></i>'}<b>P${s}</b> ${p ? A.esc(p.name) + (p.id === B.me.id ? ' (you)' : '') : '<span class="x">open seat — share the code or QR</span>'}${p && r.ready[p.id] ? ' <span class="pill easy">READY</span>' : ''}</div>`; }).join('')}
      ${tv ? `<div class="bl-p">${dot(r.members.find(m => m.role === 'tv').id)}<b>TV</b> connected${gate.state ? ` · <span id="bTvAud" data-state="${gate.state}" class="${gate.state === 'ready' ? '' : 'x'}">${AUD_TEXT[gate.state] || gate.state}</span>` : ''}</div>` : ''}</div>
    ${me ? `<div class="card"><h3>Song</h3><select id="bTrack" style="width:100%"><option value="">Choose a song…</option>${tracks.map(x => `<option value="${A.esc(x.slug)}" ${x.slug === r?.track ? 'selected' : ''}>${A.esc(x.title)} — ${A.esc(x.artist)}</option>`).join('')}</select>
      <div class="seg" style="margin-top:10px">${['easy', 'normal', 'expert'].map(d => `<button class="btn ${r?.diff === d ? 'primary' : 'ghost'}" data-d="${d}" ${t && !t.charts[d] ? 'disabled' : ''}>${A.DIFF[d]}</button>`).join(' ')}</div>
      ${tv ? `<div class="seg" style="margin-top:10px"><button class="btn ${r.tvAudio ? 'primary' : 'ghost'}" data-a="1">Music on TV</button> <button class="btn ${!r.tvAudio ? 'primary' : 'ghost'}" data-a="0">Wired earbuds</button></div>
        ${r.tvAudio ? `<p class="x" style="margin-top:8px">TV calibration: <b>${S.settings().offsets.tv != null ? Math.round(S.settings().offsets.tv * 1000) + ' ms' : 'not set'}</b> <button class="btn ghost" id="bCal">Tap to the TV</button></p>` : ''}` : ''}
      <button class="btn primary" id="bReady" style="width:100%;margin-top:12px" ${!r?.track || ps.length < 2 || B.clockErr || B.net?.status !== 'online' ? 'disabled' : ''}>${r?.ready?.[B.me.id] ? 'Not ready' : 'Ready'}</button></div>` : ''}
    <div id="battleCard">${resultCard()}</div>
    <div class="card"><p class="x">Invite: <a href="${joinUrl(B.code)}">${A.esc(joinUrl(B.code))}</a></p></div></div>`;
  drawQr(el.querySelector('#bQr'), joinUrl(B.code));
  const send = (type, body) => { if (isHost()) onHost(type, body); else B.net.send(type, body); };
  el.querySelector('#bTrack')?.addEventListener('change', e => send('pick', { id: B.me.id, track: e.target.value, diff: r.diff || 'normal' }));
  el.querySelectorAll('[data-d]').forEach(b => b.onclick = () => r?.track && send('pick', { id: B.me.id, track: r.track, diff: b.dataset.d }));
  el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => send('mode', { id: B.me.id, tvAudio: b.dataset.a === '1' }));
  el.querySelector('#bReady')?.addEventListener('click', () => send('ready', { id: B.me.id, ready: !r.ready[B.me.id] }));
  el.querySelector('#bCal')?.addEventListener('click', calibrateToTv);
  el.querySelector('#bRetry')?.addEventListener('click', () => { B.net?.retryNow(); syncClock(); });
}
function onHost(type, p) { onMsg(type, p, true); }   // the host applies its own lobby actions through the same path

/* ── TV calibration: the TV plays a metronome on the match clock; taps are measured on the same clock */
function calibrateToTv() {
  const bpm = 100, beats = 16, per = 60000 / bpm, epoch = Math.round(B.shared.now() + 2500), taps = [];
  B.net.send('cal', { epoch, bpm, beats });
  const ov = document.createElement('div'); ov.className = 'overlay on bl-cal';
  ov.innerHTML = '<h2>Tap with the TV clicks</h2><p class="x">Tap anywhere on each click you hear from the TV.</p><div class="bl-tap">TAP</div>';
  document.body.appendChild(ov);
  ov.addEventListener('pointerdown', e => { e.preventDefault(); taps.push(B.shared.now() - (performance.now() - e.timeStamp)); });
  setTimeout(() => {
    ov.remove();
    const d = taps.map(t => { const k = Math.round((t - epoch) / per); return { k, d: t - (epoch + k * per) }; }).filter(x => x.k >= 4 && x.k < beats && Math.abs(x.d) < per / 2).map(x => x.d).sort((a, b) => a - b);
    if (d.length < 6) return A.toast('Not enough taps — try again');
    const s = S.settings(); s.offsets.tv = d[Math.floor(d.length / 2)] / 1000; S.saveSettings(s); A.toast(`TV calibration: ${Math.round(s.offsets.tv * 1000)} ms`); render();
  }, 2500 + beats * per + 600);
}

function drawQr(cv, text) {
  if (!cv) return;
  const go = () => { const q = window.qrcode(0, 'M'); q.addData(text); q.make(); const n = q.getModuleCount(), g = cv.getContext('2d'), s = cv.width / (n + 4);
    g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = '#000';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) g.fillRect((x + 2) * s, (y + 2) * s, Math.ceil(s), Math.ceil(s)); };
  if (window.qrcode) return go();
  const sc = document.createElement('script'); sc.src = '/games/kbeats/vendor/qrcode.js'; sc.onload = go; document.head.appendChild(sc);
}
