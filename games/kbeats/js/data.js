/* KBeats data layer. Production/beta: every authoritative read and write goes to the kbeats-api
   backend (catalog, scores, leaderboards, favorites, follows, calibration, challenges, analytics).
   localStorage keeps only per-device conveniences (settings cache, last difficulty) and a retry
   queue for score submissions that failed on a bad connection.

   DEV mode exists only on localhost (?mode=dev): it may use an in-browser MOCK backend
   (?api=mock, or automatically when the real backend is unreachable) so the client can be tested
   offline. The mock never runs on keepitil.com. */
import * as API from './api.js';
import { verifyRanked } from './verify.js';
import { DEV_TRACKS } from './devtracks.js';

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const Q = new URLSearchParams(location.search);
export const RELEASE = { mode: LOCAL && Q.get('mode') === 'dev' ? 'dev' : 'beta', mock: LOCAL && Q.get('api') === 'mock' };
export const isDev = () => RELEASE.mode === 'dev';

const LS = { get(k, d) { try { const v = localStorage.getItem('kb.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('kb.' + k, JSON.stringify(v)); } catch {} } };

/* ── mock backend (DEV only) ──────────────────────────────────────────── */
const mock = {
  _cat: null,
  async catalog() {
    if (!this._cat) {
      const cat = await (await fetch('/games/kbeats/data/catalog.json')).json();
      const byId = Object.fromEntries(DEV_TRACKS.map(t => [t.id, t]));
      this._cat = cat.tracks.map(t => ({ ...byId[t.id], ...t, slug: t.id, id: t.id, status: 'development', dev: true, artistId: 'kbeats-dev-lab', plays: 0 }));
    }
    return { mode: 'dev', mock: true, tracks: this._cat, flags: { soundcloud_outbound_enabled: true } };
  },
  st() { return LS.get('mock.state', { name: 'Dev Player', xp: 0, scores: [], fav: [], follow: [], cal: {}, sessions: {}, challenges: {} }); },
  save(s) { LS.set('mock.state', s); },
  async me() { const s = this.st(); const pbs = {}; for (const x of s.scores) if (x.verified) { const k = x.track + '|' + x.difficulty; if (!pbs[k] || pbs[k].score < x.score) pbs[k] = x; }
    return { userId: 'mock-user', anonymous: true, isAdmin: false, name: s.name, xp: s.xp, level: Math.floor(Math.sqrt(s.xp / 250)) + 1, personalBests: Object.values(pbs).map(p => ({ slug: p.track, difficulty: p.difficulty, score: p.score, accuracy: p.accuracy, grade: p.grade, stars: p.stars })),
      favorites: s.fav, follows: s.follow, calibration: s.cal, artist: null, mock: true }; },
  async profile_update({ name }) { const s = this.st(); s.name = name; this.save(s); return this.me(); },
  async favorite({ track, on }) { const s = this.st(); s.fav = s.fav.filter(x => x !== track); if (on) s.fav.push(track); this.save(s); return { on }; },
  async follow({ artist, on }) { const s = this.st(); s.follow = s.follow.filter(x => x !== artist); if (on) s.follow.push(artist); this.save(s); return { on }; },
  async calibration_save({ output, offset }) { const s = this.st(); s.cal[output] = offset; this.save(s); return { ok: true }; },
  async session_start({ track, difficulty, practice }) { const s = this.st(); const id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const t = (await this.catalog()).tracks.find(x => x.slug === track); s.sessions[id] = { user_id: 'mock-user', started_at: new Date().toISOString(), practice: !!practice, track, difficulty, used_at: null }; this.save(s);
    return { sessionId: id, nonce: 'mock', chartHash: t.charts[difficulty].hash, chartVersion: t.charts[difficulty].chartVersion }; },
  async score_submit({ sessionId, log, result, chartHash }) {
    const s = this.st(); const sess = s.sessions[sessionId]; if (!sess) throw Object.assign(new Error('session'), { status: 404 });
    const t = (await this.catalog()).tracks.find(x => x.slug === sess.track);
    const v = verifyRanked({ chart: t.charts[sess.difficulty], session: sess, userId: 'mock-user', claimed: result, log, clientHash: chartHash, nowMs: Date.now() }, { maxInputsPerNote: 6, extraInputs: 300, maxInputsPerSec: 40, minPlayFraction: 0, sessionMaxAgeMs: 3 * 3600e3, minHitStdMs: 0 });
    sess.used_at = new Date().toISOString();
    const r = v.replay || result; const id = 's' + Date.now().toString(36);
    s.scores.push({ id, track: sess.track, difficulty: sess.difficulty, score: r.score, accuracy: r.accuracy, grade: r.grade, stars: r.stars, maxCombo: r.maxCombo, perfect: r.perfect, great: r.great, good: r.good, miss: r.miss, verified: v.ranked, name: s.name, at: new Date().toISOString() });
    if (v.ranked) s.xp += Math.round(r.score / 100);
    this.save(s);
    const board = s.scores.filter(x => x.verified && x.track === sess.track && x.difficulty === sess.difficulty).sort((a, b) => b.score - a.score);
    return { scoreId: id, verified: v.ok, ranked: v.ranked, reasons: v.reasons, rank: v.ranked ? board.findIndex(x => x.id === id) + 1 : null, replay: v.replay };
  },
  async leaderboard({ track, difficulty, scope }) { const s = this.st(); const wk = Date.now() - 7 * 864e5;
    const e = s.scores.filter(x => x.verified && x.track === track && x.difficulty === difficulty && (scope !== 'weekly' || +new Date(x.at) > wk)).sort((a, b) => b.score - a.score).slice(0, 1)
      .map((x, i) => ({ rank: i + 1, name: x.name, me: true, ...x }));
    return { entries: e, myRank: e.length ? 1 : null, total: e.length }; },
  async challenge_create({ scoreId }) { const s = this.st(); const x = s.scores.find(y => y.id === scoreId); const id = 'MOCK' + Math.random().toString(36).slice(2, 8);
    s.challenges[id] = { id, track: x.track, difficulty: x.difficulty, name: s.name, score: x.score, accuracy: x.accuracy }; this.save(s); return { id, url: `${location.origin}/games/kbeats/challenge/?id=${id}` }; },
  async challenge_get({ id }) { const c = this.st().challenges[id]; if (!c) throw Object.assign(new Error('challenge'), { status: 404 }); return c; },
  async artist_public({ artist }) { const cat = await this.catalog(); const tr = cat.tracks.filter(t => t.artistId === artist);
    return { slug: artist, name: 'KBeats Dev Lab', bio: 'KBeats internal synthesized test tracks. Not a real artist. DEVELOPMENT ONLY.', genres: [...new Set(tr.map(t => t.genre))], verified: false, dev: true, followers: this.st().follow.includes(artist) ? 1 : 0, plays: this.st().scores.length, tracks: tr }; },
  async events({ events }) { const q = LS.get('mock.events', []); q.push(...events); LS.set('mock.events', q.slice(-500)); return { stored: events.length }; },
};

async function call(op, body = {}, opts) {
  if (RELEASE.mock) { if (!mock[op]) throw new Error('mock: ' + op); return mock[op](body); }
  return API.call(op, body, opts);
}

export async function loadCatalog() {
  try {
    const review = Q.get('review') === '1';                      // admin playtest of tracks in review (server checks admin)
    const r = await call('catalog', { includeReview: review }, { auth: review });
    if (r.mode && !RELEASE.mock) RELEASE.mode = RELEASE.mode === 'dev' ? 'dev' : r.mode;
    return r;
  } catch (e) {
    if (LOCAL && isDev()) { RELEASE.mock = true; return call('catalog'); }     // offline dev fallback only
    throw e;
  }
}
export const me = () => call('me');
export const profileUpdate = name => call('profile_update', { name });
export const favorite = (track, on) => call('favorite', { track, on });
export const follow = (artist, on, from) => call('follow', { artist, on, from });
export const saveCalibration = (output, offset, platform) => call('calibration_save', { output, offset, platform });
export const leaderboard = (track, difficulty, scope = 'all') => call('leaderboard', { track, difficulty, scope }, { auth: true });
export const artistPublic = artist => call('artist_public', { artist }, { auth: false });
export const challengeCreate = scoreId => call('challenge_create', { scoreId });
export const challengeGet = id => call('challenge_get', { id }, { auth: false });
export const audioUrl = track => call('audio_url', { track });
export const sessionStart = (track, difficulty, chartHash, practice, platform) => call('session_start', { track, difficulty, chartHash, practice, platform });

/* Score submission happens after the result screen is up. Network failures queue the payload and
   retry later (sessions stay valid for 3 h server-side); never during play. */
export async function submitScore(payload) {
  try { return await call('score_submit', payload, { timeoutMs: 30000 }); }
  catch (e) {
    if (!e.status || e.status >= 500) { const q = LS.get('pendingScores', []); q.push(payload); LS.set('pendingScores', q.slice(-20)); return { queued: true }; }
    throw e;
  }
}
export async function flushPendingScores() {
  const q = LS.get('pendingScores', []); if (!q.length) return 0;
  const left = []; let sent = 0;
  for (const p of q) { try { await call('score_submit', p); sent++; } catch (e) { if (!e.status || e.status >= 500) left.push(p); } }
  LS.set('pendingScores', left); return sent;
}

const evq = [];
export const track = (name, props = {}) => evq.push({ name, props, at: Date.now() });
export async function flushEvents() {
  if (!evq.length) return;
  const batch = evq.splice(0, 200);
  try { await call('events', { events: batch }); } catch { evq.unshift(...batch.slice(-100)); }
}
export const auth = API;
