/* Ranked score verification (server side; pure so it is unit-tested in Node).
   A ranked score is accepted only if ALL of these hold:
     1. the play session exists, belongs to the caller, is unused, and names this exact beatmap
     2. the stored chart's hash verifies and equals the hash the client says it played
     3. enough wall-clock time passed since the session started to have played the chart
     4. the input log is well formed (bounded size, known kinds, lanes 0-3, times monotonic and in range,
        human-possible input rate)
     5. replaying the log through the shared judge reproduces the claimed score, every judgement count
        and max combo exactly
     6. the score does not exceed the chart's theoretical maximum
     7. hit timing is not machine-perfect (a stddev under 1 ms across 30+ hits is a bot)
   Practice runs and failed runs are stored but never ranked. */
import { simulate, perfectRun, Judge } from './judge.js';
import { loadChart } from './chart.js';

export const LIMITS = { maxInputsPerNote: 6, extraInputs: 300, maxInputsPerSec: 40, minPlayFraction: 0.9, sessionMaxAgeMs: 3 * 3600e3, minHitStdMs: 1 };

export function verifyRanked({ chart, session, userId, claimed, log, clientHash, nowMs = Date.now() }, L = LIMITS) {
  const reasons = [];
  if (!session) return { ok: false, reasons: ['no session'] };
  if (session.user_id !== userId) reasons.push('session belongs to another user');
  if (session.used_at) reasons.push('session already used');
  let notes;
  try { notes = loadChart(chart); } catch (e) { return { ok: false, reasons: ['stored chart invalid: ' + e.message] }; }
  if (clientHash !== chart.hash) reasons.push('chart hash mismatch');
  const started = new Date(session.started_at).getTime();
  if (nowMs - started > L.sessionMaxAgeMs) reasons.push('session expired');
  if (!Array.isArray(log)) return { ok: false, reasons: [...reasons, 'missing input log'] };
  if (log.length > notes.length * L.maxInputsPerNote + L.extraInputs) reasons.push('input log too large');
  const dur = chart.durationMs / 1000;
  let prev = -Infinity, bad = false;
  for (const e of log) {
    if (!Array.isArray(e) || typeof e[0] !== 'number' || !Number.isFinite(e[0]) || !(e[1] >= 0 && e[1] <= 3 && Number.isInteger(e[1])) || !['p', 'r', 's'].includes(e[2])) { bad = true; break; }
    if (e[0] < prev - 1e-6 || e[0] < -5 || e[0] > dur + 5) { bad = true; break; }
    prev = e[0];
  }
  if (bad) reasons.push('malformed input log');
  const presses = log.filter(e => e[2] !== 'r');
  for (let i = 0, j = 0; i < presses.length && !bad; i++) {
    while (presses[i][0] - presses[j][0] > 1) j++;
    if (i - j + 1 > L.maxInputsPerSec) { reasons.push('inhuman input rate'); break; }
  }
  if (bad) return { ok: false, reasons };
  const replay = simulate(notes, log, { practice: !!session.practice });
  const failedAt = replay.failed ? (() => { const j = new Judge(notes); for (const [t, l, k, x] of log) { k === 'p' ? j.press(l, t, x) : k === 'r' ? j.release(l, t) : j.swipe(l, t, x); if (j.failed) return j.failedAt; } return dur; })() : dur;
  const needMs = Math.min(dur, failedAt) * 1000 * L.minPlayFraction;
  if (nowMs - started < needMs) reasons.push('submitted faster than the song can be played');
  for (const k of ['score', 'perfect', 'great', 'good', 'miss', 'maxCombo'])
    if (claimed?.[k] !== replay[k]) { reasons.push(`claimed ${k} ${claimed?.[k]} ≠ replay ${replay[k]}`); }
  const max = perfectRun(notes).score;
  if (replay.score > max || (claimed?.score ?? 0) > max) reasons.push('score above theoretical maximum');
  const j = new Judge(notes); for (const [t, l, k, x] of log) { k === 'p' ? j.press(l, t, x) : k === 'r' ? j.release(l, t) : j.swipe(l, t, x); }
  const d = j.deltas.map(x => x[1] * 1000);
  if (d.length >= 30) {
    const m = d.reduce((a, b) => a + b, 0) / d.length, sd = Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / d.length);
    if (sd < L.minHitStdMs) reasons.push('machine-perfect timing');
  }
  const ranked = reasons.length === 0 && !session.practice && !replay.failed;
  return { ok: reasons.length === 0, ranked, reasons, replay, max, notes: notes.length };
}
