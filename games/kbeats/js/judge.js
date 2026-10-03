/* KBeats judgement + scoring engine. Pure: no DOM, no clock of its own. Every call carries the
   song time (seconds, already on the audio clock and offset-corrected) so the same code runs live
   in the browser and in Node to re-simulate a submitted input log (anti-cheat, tests).

   Note shape: { t, lane 0..3, type: 'tap'|'hold'|'swipe', dur (s, holds), dir (swipes) }
   A chord is simply two notes sharing t on different lanes. */
import { CONFIG } from './config.js';

export function classify(deltaMs, w = CONFIG.windows) {
  const a = Math.abs(deltaMs);
  if (a <= w.perfect) return 'perfect';
  if (a <= w.great) return 'great';
  if (a <= w.good) return 'good';
  if (a <= w.miss) return 'miss';
  return null;
}

export function multiplierFor(combo, tiers = CONFIG.comboTiers) {
  let x = 1;
  for (const t of tiers) if (combo >= t.at) x = t.x;
  return x;
}

export function gradeFor(acc, failed, cfg = CONFIG) {
  if (failed) return 'F';
  for (const [g, min] of cfg.grades) if (acc >= min) return g;
  return 'D';
}

export class Judge {
  constructor(notes, opts = {}) {
    this.cfg = opts.config || CONFIG;
    this.practice = !!opts.practice;
    this.notes = notes.map((n, i) => ({ ...n, i, state: 0 }));    // 0 pending · 1 holding · 2 done
    this.byLane = [[], [], [], []];
    for (const n of this.notes) this.byLane[n.lane].push(n);
    for (const l of this.byLane) l.sort((a, b) => a.t - b.t);
    this.ptr = [0, 0, 0, 0];
    this.holding = [null, null, null, null];
    this.total = this.notes.length + this.notes.filter(n => n.type === 'hold').length;
    this.counts = { perfect: 0, great: 0, good: 0, miss: 0 };
    this.score = 0; this.combo = 0; this.maxCombo = 0; this.judged = 0; this.accSum = 0;
    this.hype = 0; this.hypeUntil = -1; this.hypeCount = 0;
    this.health = this.cfg.health.start; this.failed = false; this.failedAt = null;
    this.log = [];       // [t, lane, kind('p'|'r'|'s'), extra] — replayable input record
    this.deltas = [];    // [noteTime, hitTime − noteTime] for timing/drift analysis
    this.events = [];    // feedback for the renderer; drained by the client each frame
  }

  get accuracy() { return this.judged ? this.accSum / this.judged : 1; }
  get done() { return this.judged >= this.total; }
  hypeActive(t) { return t < this.hypeUntil; }

  _apply(j, t, lane, note, kind = 'head') {
    const c = this.cfg;
    this.counts[j]++; this.judged++; this.accSum += c.accuracyWeight[j];
    if (j === 'miss') this.combo = 0; else { this.combo++; if (this.combo > this.maxCombo) this.maxCombo = this.combo; }
    const hyped = this.hypeActive(t);
    this.score += Math.round(c.points[j] * multiplierFor(this.combo, c.comboTiers) * (hyped ? c.hype.multiplier : 1));
    if (!hyped) {
      this.hype = Math.max(0, Math.min(1, this.hype + c.hype[j]));
      if (this.hype >= 1) { this.hype = 0; this.hypeUntil = t + c.hype.durationSec; this.hypeCount++; this.events.push({ t, lane: -1, j: 'hype' }); }
    }
    this.health = Math.max(0, Math.min(1, this.health + c.health[j]));
    if (this.health <= 0 && !this.practice && !this.failed) { this.failed = true; this.failedAt = t; }
    this.events.push({ t, lane, j, kind, note: note ? note.i : -1 });
  }

  _pending(lane) {
    const arr = this.byLane[lane];
    let p = this.ptr[lane];
    while (p < arr.length && arr[p].state !== 0) p++;
    this.ptr[lane] = p;
    return arr[p] || null;
  }

  /* src 'key' | 'touch'. Touch must flick a swipe note (see swipe()); a key press accepts it. */
  press(lane, t, src = 'key') {
    this.update(t);
    this.log.push([t, lane, 'p', src]);
    const n = this._pending(lane);
    if (!n) return null;
    const j = classify((t - n.t) * 1000, this.cfg.windows);
    if (!j) return null;                      // nowhere near a note: ghost tap, no penalty
    if (n.type === 'swipe' && src === 'touch') return null;
    this.deltas.push([n.t, t - n.t]);
    if (n.type === 'hold' && j !== 'miss') { n.state = 1; this.holding[lane] = n; }
    else n.state = 2;
    this._apply(j, t, lane, n);
    if (n.type === 'hold' && j === 'miss') this._apply('miss', t, lane, n, 'tail');
    return j;
  }

  release(lane, t) {
    this.update(t);
    this.log.push([t, lane, 'r']);
    const n = this.holding[lane];
    if (!n) return null;
    this.holding[lane] = null; n.state = 2;
    const end = n.t + n.dur;
    const j = t >= end - this.cfg.holdReleaseGraceMs / 1000 ? 'perfect' : 'miss';
    this._apply(j, Math.min(t, end), lane, n, 'tail');
    return j;
  }

  /* t = when the finger went down, dir = flick direction. Wrong direction still lands, as GOOD. */
  swipe(lane, t, dir) {
    this.update(t);
    this.log.push([t, lane, 's', dir]);
    const n = this._pending(lane);
    if (!n || n.type !== 'swipe') return null;
    let j = classify((t - n.t) * 1000, this.cfg.windows);
    if (!j) return null;
    if (j !== 'miss' && n.dir && dir !== n.dir) j = 'good';
    n.state = 2;
    this._apply(j, t, lane, n);
    return j;
  }

  /* Expire notes whose window has fully passed and complete holds that reached their tail. */
  update(t) {
    const missS = this.cfg.windows.miss / 1000;
    for (let lane = 0; lane < 4; lane++) {
      const h = this.holding[lane];
      if (h && t >= h.t + h.dur) { this.holding[lane] = null; h.state = 2; this._apply('perfect', h.t + h.dur, lane, h, 'tail'); }
      for (;;) {
        const n = this._pending(lane);
        if (!n || n.t + missS >= t) break;
        n.state = 2;
        this._apply('miss', n.t + missS, lane, n);
        if (n.type === 'hold') this._apply('miss', n.t + missS, lane, n, 'tail');
      }
    }
  }

  result() {
    const acc = this.accuracy;
    const grade = gradeFor(acc, this.failed, this.cfg);
    const stars = this.failed ? 0 : this.cfg.stars.filter(s => acc >= s).length;
    return {
      score: this.score, accuracy: Math.round(acc * 1000) / 10, ...this.counts,
      maxCombo: this.maxCombo, grade, stars, failed: this.failed, practice: this.practice,
      fullCombo: this.counts.miss === 0 && this.judged === this.total, judgements: this.judged, total: this.total,
    };
  }
}

/* Deterministic re-simulation of a recorded input log. The server runs exactly this to decide
   whether a submitted ranked score is consistent with the chart it claims to have played. */
export function simulate(notes, log, opts = {}) {
  const j = new Judge(notes, opts);
  for (const [t, lane, kind, extra] of log) {
    if (kind === 'p') j.press(lane, t, extra);
    else if (kind === 'r') j.release(lane, t);
    else if (kind === 's') j.swipe(lane, t, extra);
  }
  j.update(Infinity);
  return j.result();
}

export function verifySubmission(notes, submission, opts = {}) {
  const r = simulate(notes, submission.log || [], opts);
  const reasons = [];
  if (r.score !== submission.score) reasons.push(`score ${submission.score} ≠ replay ${r.score}`);
  if (r.maxCombo !== submission.maxCombo) reasons.push('combo mismatch');
  const log = submission.log || [];
  for (let i = 1; i < log.length; i++) if (log[i][0] < log[i - 1][0] - 1e-6) { reasons.push('non-monotonic input log'); break; }
  return { ok: reasons.length === 0, reasons, replay: r };
}

/* Theoretical maximum for a chart: every note hit dead-on and every hold held to the end. The server
   rejects any claimed score above this before it even replays the log. */
export function perfectRun(notes, opts = {}) {
  const j = new Judge(notes, opts);
  const ev = [];
  for (const n of j.notes) { ev.push([n.t, 0, n]); ev.push([n.t + (n.type === 'hold' ? n.dur : 0.03), -1, n]); }
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const [t, k, n] of ev) k === 0 ? j.press(n.lane, t) : j.release(n.lane, t);
  j.update(Infinity);
  return j.result();
}
