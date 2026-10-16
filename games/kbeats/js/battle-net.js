/* KBeats live 1v1 — network layer: the room channel, the shared match clock and the battle API.
   Room transport is Supabase Realtime broadcast (works from any browser, phone app or TV browser;
   no LAN discovery needed). In DEV mock mode (localhost, ?api=mock) a BroadcastChannel stands in, so
   several tabs on one machine can play a full battle offline.
   Battle ops (time, battle_result) are served by kbeats-api-STAGING only until production is approved. */
import * as API from './api.js';
import { RELEASE } from './data.js';
import { PROTO, msg, validMsg, clockSample, estimateDelta, perfAt } from './battle.js';

const STAGING_FN = API.SUPA_URL + '/functions/v1/kbeats-api-staging';

/** Stable per-tab device id: survives a reload (rejoin), differs between tabs/devices. */
export function deviceId() {
  try { let id = sessionStorage.getItem('kb.battle.id'); if (!id) { id = 'd' + Math.random().toString(36).slice(2, 10); sessionStorage.setItem('kb.battle.id', id); } return id; }
  catch { return 'd' + Math.random().toString(36).slice(2, 10); }
}

async function staging(op, body = {}, auth = true) {
  let token = API.SUPA_ANON; if (auth) { const s = await API.session(); if (s) token = s.access_token; }
  const r = await fetch(STAGING_FN, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: API.SUPA_ANON, Authorization: 'Bearer ' + token }, body: JSON.stringify({ op, ...body }) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { status: r.status });
  return j;
}

/* ── shared clock ─────────────────────────────────────────────────────── */
export class SharedClock {
  constructor() { this.delta = null; this.errMs = null; this._t = null; this.pool = []; }
  async _sample() {
    if (RELEASE.mock) { const t0 = performance.now(); return clockSample(t0, Date.now(), t0); }     // one machine: wall clock is shared
    const t0 = performance.now(); const { now } = await staging('time', {}, false); return clockSample(t0, now, performance.now());
  }
  async sync(n = 10) {
    // the first round trips include connection set-up (DNS/TLS/cold function) and are discarded; samples are
    // pooled across syncs (60 s, so a phone that slept does not keep a stale offset) so the estimate keeps improving toward the tightest round trip seen
    const s = []; for (let i = 0; i < n; i++) { try { const x = await this._sample(); if (i >= 2 || RELEASE.mock) s.push({ ...x, at: performance.now() }); } catch {} }
    this.pool = [...this.pool.filter(x => performance.now() - x.at < 60e3), ...s].slice(-60);
    const e = estimateDelta(this.pool); if (!e) throw new Error('could not reach the match clock');
    this.delta = e.delta; this.errMs = e.errMs; return e;
  }
  start(everyMs = 30000) { this.stop(); this._t = setInterval(() => this.sync(4).catch(() => {}), everyMs); }
  stop() { clearInterval(this._t); this._t = null; }
  now() { return performance.now() + this.delta; }
  perfAt(sharedMs) { return perfAt(sharedMs, this.delta); }
}

/* ── room channel ─────────────────────────────────────────────────────────
   Presence is our own heartbeat (works identically over Realtime and BroadcastChannel): a device not
   heard for 4 s is shown as reconnecting; it is never removed from its seat by the network alone. */
export class RoomChannel {
  constructor(code, me) { this.code = code; this.me = me; this.handlers = new Set(); this.seen = new Map(); this.status = 'connecting'; this._backoff = 1000; }
  on(fn) { this.handlers.add(fn); return () => this.handlers.delete(fn); }
  _emit(type, payload) {
    if (!validMsg(type, payload)) return;
    if (payload.id) this.seen.set(payload.id, performance.now());
    for (const h of this.handlers) h(type, payload);
  }
  online(id, ms = 4000) { const t = this.seen.get(id); return t != null && performance.now() - t < ms; }
  async open() {
    if (RELEASE.mock) {
      try { this.bc = new BroadcastChannel('kb-battle-' + this.code); } catch (e) { this._setStatus('offline'); throw e; }
      this.bc.onmessage = e => this._emit(e.data.type, e.data.payload);
      this._setStatus('online');
    } else await this._openRealtime();
    clearInterval(this._hb); this._hb = setInterval(() => this.send('hb', { id: this.me.id }), 1000);
    this.send('hello', { ...this.me });
    return this;
  }
  async _openRealtime() {
    const sb = await API.supabase().catch(e => { this._setStatus('offline'); throw e; });
    const n = this._attempt = (this._attempt || 0) + 1, live = () => !this.closed && n === this._attempt;
    clearTimeout(this._giveUp);
    if (this.ch) { const old = this.ch; this.ch = null; try { sb.removeChannel(old); } catch {} }
    const ch = sb.channel('kbeats-battle-' + this.code, { config: { broadcast: { self: false, ack: false } } });
    ch.on('broadcast', { event: '*' }, ({ event, payload }) => { if (live()) this._emit(event, payload); });
    this.ch = ch;
    const giveUp = new Promise(res => { this._giveUp = setTimeout(() => { if (live() && this.status !== 'online') { this._setStatus('offline'); this._retry(); } res(); }, 8000); });
    const joined = new Promise(res => ch.subscribe(st => {
      if (!live()) return res(); // events from a channel this one replaced are ignored
      if (st === 'SUBSCRIBED') { clearTimeout(this._giveUp); this._backoff = 1000; this._setStatus('online'); this.send('hello', { ...this.me }); res(); }
      else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') { clearTimeout(this._giveUp); this._setStatus('reconnecting'); res(); this._retry(); }
    }));
    if (!this._net && typeof addEventListener === 'function') {
      this._net = () => { if (navigator.onLine) this.retryNow(); else this._setStatus('offline'); };
      addEventListener('online', this._net); addEventListener('offline', this._net);
    }
    await Promise.race([joined, giveUp]);
  }
  _retry() { if (this.closed || RELEASE.mock) return; clearTimeout(this._rt); this._rt = setTimeout(() => this._openRealtime().catch(() => this._retry()), this._backoff); this._backoff = Math.min(this._backoff * 2, 8000); }
  retryNow() {
    this._backoff = 1000; clearTimeout(this._rt);
    if (RELEASE.mock) { if (!this.bc) this.open().catch(() => {}); return; }
    this._openRealtime().catch(() => this._retry());
  }
  _setStatus(s) { this.status = s; for (const h of this.handlers) h('_status', { status: s }); }
  send(type, body) {
    const m = msg(type, body);
    if (this.bc) { this.bc.postMessage(m); return; }
    if (this.ch && this.status === 'online') this.ch.send({ type: 'broadcast', event: type, payload: m.payload }).catch(() => {});
  }
  close() { this.closed = true; clearInterval(this._hb); clearTimeout(this._rt); clearTimeout(this._giveUp); if (this._net) { removeEventListener('online', this._net); removeEventListener('offline', this._net); } this.bc?.close(); if (this.ch) API.supabase().then(sb => sb.removeChannel(this.ch)).catch(() => {}); }
}

/* ── server-owned match ───────────────────────────────────────────────────
   battle_create (host) → battle_join (each player, own signed-in identity) → battle_session (the match's
   only play session) → score_submit → battle_result (decided by the server from the match record).
   DEV mock mode keeps the same flow and the same decision rule (matchOutcome) in localStorage. */
const LSget = k => { try { return JSON.parse(localStorage.getItem('kb.' + k) || 'null'); } catch { return null; } };
const LSset = (k, v) => { try { localStorage.setItem('kb.' + k, JSON.stringify(v)); } catch {} };
const mockUid = () => { try { return sessionStorage.getItem('kb.battle.id') || 'mock-user'; } catch { return 'mock-user'; } };
const err = (status, message) => Object.assign(new Error(message), { status });
let mockCat = null;
const catalogMock = async () => mockCat ||= await (await fetch('/games/kbeats/data/catalog.json')).json();

export async function battleCreate(roomCode, track, difficulty, chartHash) {
  if (!RELEASE.mock) return staging('battle_create', { roomCode, track, difficulty, chartHash });
  const id = 'bm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  LSset('mock.bm.' + id, { id, code: roomCode, host: mockUid(), beatmap: track + '|' + difficulty, created: Date.now(), expires: Date.now() + 2 * 3600e3, status: 'open', result: null });
  LSset(`mock.bm.${id}.s1`, { user_id: mockUid(), session_id: null });
  return { matchId: id, slot: 1, chartHash };
}
export async function battleJoin(matchId) {
  if (!RELEASE.mock) return staging('battle_join', { matchId });
  const m = LSget('mock.bm.' + matchId); if (!m) throw err(404, 'match not found');
  if (Date.now() > m.expires) throw err(410, 'match expired');
  for (const slot of [1, 2]) if (LSget(`mock.bm.${matchId}.s${slot}`)?.user_id === mockUid()) return { matchId, slot };
  if (m.status !== 'open') throw err(409, 'match already started');
  if (LSget(`mock.bm.${matchId}.s2`)) throw err(409, 'room is full');
  LSset(`mock.bm.${matchId}.s2`, { user_id: mockUid(), session_id: null });
  return { matchId, slot: 2 };
}
export async function battleSession(matchId, platform) {
  if (!RELEASE.mock) return staging('battle_session', { matchId, platform });
  const m = LSget('mock.bm.' + matchId); if (!m) throw err(404, 'match not found');
  const slot = [1, 2].find(s => LSget(`mock.bm.${matchId}.s${s}`)?.user_id === mockUid()); if (!slot) throw err(403, 'not a member of this match');
  const mem = LSget(`mock.bm.${matchId}.s${slot}`);
  if (mem.session_id) { const ps = LSget('mock.session.' + mem.session_id); if (ps?.used_at) throw err(409, "this match's run was already submitted"); return { sessionId: mem.session_id, nonce: 'mock' }; }
  const [track, difficulty] = m.beatmap.split('|');
  const sid = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  LSset('mock.session.' + sid, { id: sid, user_id: mockUid(), started_at: new Date().toISOString(), practice: true, platform: ('battle-' + (platform || 'web')).slice(0, 20), track, difficulty, used_at: null, scoreId: null });
  LSset(`mock.bm.${matchId}.s${slot}`, { ...mem, session_id: sid }); m.status = 'playing'; LSset('mock.bm.' + matchId, m);
  return { sessionId: sid, nonce: 'mock' };
}
export async function battleResult(matchId) {
  if (!RELEASE.mock) return staging('battle_result', { matchId });
  const { matchOutcome, RESULT_GRACE_MS } = await import('./battle.js');
  const m = LSget('mock.bm.' + matchId); if (!m) throw err(404, 'match not found');
  if (m.result) return { matchId, ...m.result };
  const cat = await catalogMock(); const [track, diff] = m.beatmap.split('|');
  const durationMs = cat.tracks.find(x => x.id === track)?.charts[diff]?.durationMs || 0;
  const grace = Number(new URLSearchParams(location.search).get('grace')) || RESULT_GRACE_MS;     // DEV only: shorter forfeit wait in tests
  const row = slot => { const mem = LSget(`mock.bm.${matchId}.s${slot}`); if (!mem) return null; const s = mem.session_id && LSget('mock.session.' + mem.session_id); const sc = s?.scoreId && LSget('mock.score.' + s.scoreId);
    return { slot, mem, side: s ? { sessionId: s.id, userId: s.user_id, beatmapId: s.track + '|' + s.difficulty, practice: s.practice, platform: s.platform, startedAt: +new Date(s.started_at), name: sc?.name || 'Player',
      score: sc ? { scoreId: sc.id, valid: !!sc.ok && !sc.verified, failed: false, score: sc.score, accuracy: sc.accuracy, maxCombo: sc.maxCombo, perfect: sc.perfect, great: sc.great, good: sc.good, miss: sc.miss } : null } : null }; };
  const [r1, r2] = [row(1), row(2)];
  let o;
  if (!r1?.side || !r2?.side) {
    const startedAt = Math.max(m.created, ...[r1, r2].filter(r => r?.side).map(r => r.side.startedAt));
    const done = Date.now() > startedAt + durationMs + grace;
    const only = [r1, r2].map(r => r?.side).find(x => x?.score?.valid);
    o = !done ? { status: 'pending', winner: null, decidedBy: 'waiting for both players' } : only && r1 && r2 ? { status: 'final', winner: only.sessionId, decidedBy: 'forfeit (opponent never started)' } : { status: 'void', winner: null, decidedBy: 'the match did not have two players' };
  } else o = matchOutcome(r1.side, r2.side, { nowMs: Date.now(), durationMs, graceMs: grace });
  const view = r => r && { slot: r.slot, sessionId: r.side?.sessionId || null, name: r.side?.name || 'Player', submitted: !!r.side?.score, ...(r.side?.score ? { verified: r.side.score.valid, ...r.side.score } : {}) };
  const out = { status: o.status, winner: o.winner, winnerSlot: o.winner ? [r1, r2].find(r => r?.side?.sessionId === o.winner)?.slot ?? null : null, decidedBy: o.decidedBy, entries: [view(r1), view(r2)] };
  if (['final', 'void', 'invalid'].includes(o.status)) { m.result = out; m.status = o.status === 'final' ? 'final' : 'void'; LSset('mock.bm.' + matchId, m); }
  return { matchId, ...out };
}
export { PROTO };
