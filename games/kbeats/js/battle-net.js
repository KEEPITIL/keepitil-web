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
  constructor() { this.delta = null; this.errMs = null; this._t = null; }
  async _sample() {
    if (RELEASE.mock) { const t0 = performance.now(); return clockSample(t0, Date.now(), t0); }     // one machine: wall clock is shared
    const t0 = performance.now(); const { now } = await staging('time', {}, false); return clockSample(t0, now, performance.now());
  }
  async sync(n = 8) {
    const s = []; for (let i = 0; i < n; i++) { try { s.push(await this._sample()); } catch {} }
    const e = estimateDelta(s); if (!e) throw new Error('could not reach the match clock');
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
    this.send('hello', { id: this.me.id, role: this.me.role, name: this.me.name });
    return this;
  }
  async _openRealtime() {
    const sb = await API.supabase().catch(e => { this._setStatus('offline'); throw e; });
    if (this.ch) { try { sb.removeChannel(this.ch); } catch {} }
    const ch = sb.channel('kbeats-battle-' + this.code, { config: { broadcast: { self: false, ack: false } } });
    ch.on('broadcast', { event: '*' }, ({ event, payload }) => this._emit(event, payload));
    this.ch = ch;
    const giveUp = new Promise(res => setTimeout(() => { if (this.status !== 'online') { this._setStatus('offline'); this._retry(); } res(); }, 8000));
    const joined = new Promise(res => ch.subscribe(st => {
      if (st === 'SUBSCRIBED') { this._backoff = 1000; this._setStatus('online'); this.send('hello', { id: this.me.id, role: this.me.role, name: this.me.name }); res(); }
      else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') {
        if (this.closed) return;
        this._setStatus('reconnecting'); res(); this._retry();
      }
    }));
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
  close() { this.closed = true; clearInterval(this._hb); clearTimeout(this._rt); this.bc?.close(); if (this.ch) API.supabase().then(sb => sb.removeChannel(this.ch)).catch(() => {}); }
}

/* ── verified result ──────────────────────────────────────────────────────
   The outcome is decided by the server from the two battle SESSIONS (matchOutcome over stored,
   replay-validated rows). DEV mock mode applies the same rule to the mock store. */
const LSget = k => { try { return JSON.parse(localStorage.getItem('kb.' + k) || 'null'); } catch { return null; } };
export async function battleResult(match, sessionIds) {
  if (RELEASE.mock) {
    const { matchOutcome } = await import('./battle.js');
    const cat = await (await fetch('/games/kbeats/data/catalog.json')).json();
    const side = id => { const s = LSget('mock.session.' + id); if (!s) return null; const sc = s.scoreId && LSget('mock.score.' + s.scoreId);
      return { sessionId: id, userId: s.user_id, beatmapId: s.track + '|' + s.difficulty, practice: s.practice, platform: s.platform, startedAt: +new Date(s.started_at), name: sc?.name || 'Player',
        score: sc ? { scoreId: sc.id, valid: !!sc.ok && !sc.verified, failed: false, score: sc.score, accuracy: sc.accuracy, maxCombo: sc.maxCombo, perfect: sc.perfect, great: sc.great, good: sc.good, miss: sc.miss } : null }; };
    const [a, b] = sessionIds.map(side);
    const t = a && cat.tracks.find(x => x.id === a.beatmapId.split('|')[0]);
    const grace = Number(new URLSearchParams(location.search).get('grace')) || undefined;     // DEV only: shorten the forfeit wait in tests
    const o = matchOutcome(a, b, { nowMs: Date.now(), durationMs: t?.charts[a.beatmapId.split('|')[1]]?.durationMs || 0, graceMs: grace });
    const view = x => x && { sessionId: x.sessionId, name: x.name, submitted: !!x.score, ...(x.score ? { verified: x.score.valid, ...x.score } : {}) };
    return { match, ...o, entries: o.status === 'invalid' ? [] : [view(a), view(b)] };
  }
  return staging('battle_result', { match, sessionIds });
}
export { PROTO };
