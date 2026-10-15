/* KBeats live 1v1 — pure battle rules (no DOM, no network) so they run in the browser, in Node tests
   and, where needed, in the edge function. One room/scoring model for every device combination:
   two players (phone, mobile browser or desktop) and optionally one TV display.
   Judging never happens here: every player judges their own inputs locally (judge.js). */

export const PROTO = 1;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';     // no 0/O/1/I

/** Six-character private room code. `rand` is injectable for tests. */
export function makeCode(rand = Math.random) {
  let s = ''; for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return s;
}
export const normCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
export const validCode = s => typeof s === 'string' && s.length === 6 && [...s].every(c => CODE_ALPHABET.includes(c));

/* ── shared match clock ──────────────────────────────────────────────────
   Each device estimates  sharedMs = performance.now() + delta  from round trips to one time source
   (the KBeats API). NTP rule: keep the sample with the smallest round trip; its error is ≤ rtt/2. */
export function clockSample(t0Perf, serverMs, t1Perf) { const rtt = t1Perf - t0Perf; return { rtt, delta: serverMs - (t0Perf + t1Perf) / 2 }; }
export function estimateDelta(samples) {
  const ok = samples.filter(s => Number.isFinite(s.rtt) && s.rtt >= 0 && Number.isFinite(s.delta));
  if (!ok.length) return null;
  const best = ok.reduce((a, b) => (b.rtt < a.rtt ? b : a));
  // average the samples whose round trip is within 20% (+2 ms) of the best one: less jitter, same bound
  const near = ok.filter(s => s.rtt <= best.rtt * 1.2 + 2);
  return { delta: near.reduce((a, s) => a + s.delta, 0) / near.length, errMs: best.rtt / 2, n: ok.length };
}
/** performance.now() value at which shared time `sharedMs` occurs on this device. */
export const perfAt = (sharedMs, delta) => sharedMs - delta;

/* ── room membership ──────────────────────────────────────────────────── */
/** The room state is kept by a host: the lowest-slot connected player (never the TV), so any device —
    including the TV — can drop and rejoin without stopping the room. */
export function hostOf(members) {
  const p = members.filter(m => m.role === 'player' && m.slot).sort((a, b) => a.slot - b.slot);
  return p[0]?.id || null;
}
/** Seat a joining device. Returns the slot (1|2) for a player, 0 for the TV, or null when full. */
export function seat(members, id, role) {
  const mine = members.find(m => m.id === id); if (mine) return mine.slot;
  if (role === 'tv') return 0;
  const taken = new Set(members.filter(m => m.role === 'player').map(m => m.slot));
  for (const s of [1, 2]) if (!taken.has(s)) return s;
  return null;
}

/* ── live state for the opponent panel / TV ───────────────────────────── */
export function liveSnapshot(judge, songT) {
  return { t: +songT.toFixed(2), score: judge.score, combo: judge.combo, acc: +(judge.accuracy * 100).toFixed(2), judged: judge.judged, total: judge.total, hp: +judge.health.toFixed(2), failed: !!judge.failed };
}

/* ── verified result ──────────────────────────────────────────────────────
   Inputs are the server-verified rows (replayed input logs), never client claims.
   Order: verified > unverified; higher score; higher accuracy; higher max combo; else draw. */
export function decideWinner(a, b) {
  const key = e => !e ? [-1] : [e.verified ? 1 : 0, e.failed ? 0 : 1, e.score | 0, +e.accuracy || 0, e.maxCombo | 0];
  const ka = key(a), kb = key(b);
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
    const x = ka[i] ?? -1, y = kb[i] ?? -1;
    if (x !== y) return { winner: x > y ? 'a' : 'b', decidedBy: ['verification', 'completion', 'score', 'accuracy', 'max combo'][i] || 'forfeit' };
  }
  return { winner: null, decidedBy: 'draw' };
}

/* ── message schema (Realtime broadcast payloads) ─────────────────────── */
const TYPES = {
  hello: ['id', 'role', 'name'],          // presence announcement / rejoin
  room: ['id', 'room'],                    // host → all: authoritative lobby snapshot
  join: ['id', 'role', 'name'],            // device → host
  pick: ['id', 'track', 'diff'],           // player → host
  ready: ['id', 'ready'],
  mode: ['id', 'tvAudio'],
  aud: ['id', 'track', 'state'],          // TV → host: music for the picked song is loading | ready | error
  start: ['id', 'match', 'matchId', 'epoch', 'track', 'diff', 'chartHash', 'tvAudio'],
  live: ['id', 'match', 'st'],             // ~5 Hz score/combo/accuracy
  j: ['id', 'match', 'ev'],                // judgement events for the TV playfield [[noteIndex, judgement, lane]…]
  done: ['id', 'match'],                   // hint only: re-check the server result now
  quit: ['id', 'match'],
  cal: ['epoch', 'bpm', 'beats'],          // TV metronome for in-room calibration
  hb: ['id'],
};
export function validMsg(type, p) {
  const need = TYPES[type]; if (!need || !p || typeof p !== 'object') return false;
  if (p.v !== PROTO) return false;
  return need.every(k => p[k] !== undefined);
}
export const msg = (type, body) => ({ type, payload: { v: PROTO, ...body } });

/** With music on the TV, a match may start only once the TV has downloaded and decoded the picked song.
    room.tvAud is set by the host when a TV that reports audio readiness joins; a room without it has no such TV. */
export const AUD_STATES = ['loading', 'ready', 'error'];
export function tvAudioGate(room) {
  if (!room?.tvAudio || !room.track || !(room.members || []).some(m => m.role === 'tv') || !room.tvAud) return { ok: true, state: null };
  const a = room.tvAud, state = a.track === room.track && AUD_STATES.includes(a.state) ? a.state : 'loading';
  return { ok: state === 'ready', state };
}

/* ── TV playfield sizing ──────────────────────────────────────────────────
   Directional keys are drawn at `scale` × the phone's pad size, but never wider than a lane allows. */
/** Rooms are private and short-lived: a lobby expires 2 h after it was founded. */
export const ROOM_TTL_MS = 2 * 3600e3;
export const expired = (room, nowMs) => !!room && Number.isFinite(room.expires) && nowMs > room.expires;
/** Accept a room snapshot only from its own host, and only take over from another host when that host is gone. */
export function acceptRoom(current, senderId, incoming, hostOnline) {
  if (!incoming || incoming.host !== senderId) return false;
  if (!current) return true;
  if (incoming.host === current.host) return incoming.rev >= current.rev;
  return !hostOnline;
}
export const PHONE_PAD_PX = 378 / 8 * 0.88;     // pad radius on a 390-px-wide phone (render.js geometry)
export function tvPadRadius(bw, scale = 2) { return Math.min(PHONE_PAD_PX * scale, bw / 8 * 0.98); }

/* ── server-side match outcome ────────────────────────────────────────────
   The ONLY source of a battle result. Inputs are server rows (never broadcast messages):
   each side = { sessionId, userId, beatmapId, startedAt (ms), practice, platform, score }
   where score = null (nothing submitted) or the stored, replay-validated row
   { scoreId, valid (server replay matched), failed, score, accuracy, maxCombo, … }.
   A forfeit is only ever declared by time on the server: one side has a valid run and the other
   session has no run after the song length + grace. Client "done"/"quit" messages decide nothing. */
export const RESULT_GRACE_MS = 3 * 60e3;
export function matchOutcome(a, b, { nowMs, durationMs, graceMs = RESULT_GRACE_MS }) {
  const bad = reason => ({ status: 'invalid', winner: null, decidedBy: reason });
  if (!a || !b) return bad('unknown session');
  if (a.sessionId === b.sessionId) return bad('same session');
  for (const s of [a, b]) if (!s.practice || !String(s.platform || '').startsWith('battle-')) return bad('not a battle session');
  if (a.beatmapId !== b.beatmapId) return bad('not the same chart');
  if (a.userId === b.userId) return bad('same player');
  if (Math.abs(a.startedAt - b.startedAt) > 60e3) return bad('not the same match');
  const deadline = Math.max(a.startedAt, b.startedAt) + (durationMs || 0) + graceMs;
  const view = s => s.score && { ...s.score, verified: !!s.score.valid };
  if (a.score && b.score) {
    const d = decideWinner(view(a), view(b));
    if (!a.score.valid && !b.score.valid) return { status: 'final', winner: null, decidedBy: 'no valid run' };
    return { status: 'final', winner: d.winner === 'a' ? a.sessionId : d.winner === 'b' ? b.sessionId : null, decidedBy: d.decidedBy };
  }
  if (nowMs < deadline) return { status: 'pending', winner: null, decidedBy: 'waiting for both verified runs', deadline };
  const only = a.score ? a : b.score ? b : null;
  if (only?.score.valid) return { status: 'final', winner: only.sessionId, decidedBy: 'forfeit (opponent submitted no run)' };
  return { status: 'void', winner: null, decidedBy: 'no valid run from either player' };
}
