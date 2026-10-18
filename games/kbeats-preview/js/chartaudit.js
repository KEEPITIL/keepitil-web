/* Chart-quality audit of one song (pure; runs in the staging edge function and in Node tests).
   Input: the analyzer output for the real audio and the song's published charts. Output: statistics only —
   no audio, no URLs. For the live charts (v1, four lanes) and for freshly generated v2 charts (Easy 3 /
   Medium 4 / Hard 5) it measures density, chords, lane travel, note-to-onset timing alignment, coverage of
   the song's strong attacks, the difficulty progression, and applies the acceptance criteria for publishing. */
import { generateAll } from './generator.js';
import { validate, chartLanes } from './chart.js';
import { chartStats, songChallenge, challengeBand } from './chartstats.js';
import { analyze } from './generator.js';
import { probeWav, decodeWavMono } from './intake.js';

export const D = ['easy', 'normal', 'expert'];
/* Publishing gate for a regenerated song (docs/CHART_TRANSITION_PLAN.md). */
/* Gates are calibrated so the synthetic dev tracks — whose charts are proven on real hits by ground truth — pass.
   The off-grid control and raw coverage are reported for review but are not gates (too noisy on dense mixes). */
export const ACCEPT = { onsetWithin20ms: 0.9, maxMedianDevMs: 12, maxBpmDiff: 0.5 };

const pctl = (a, p) => { const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(p * s.length))] || 0; };
/* Independent fine-timed onset reference (not the analyzer the charts came from): spectral flux on a 512-sample
   window with a 128-sample hop at ~22 kHz (≈ 6 ms resolution), adaptive threshold, 50 ms non-maximum suppression.
   Times are corrected by half a window. Used only to measure where real attacks are. */
export function fineOnsets(samples, sampleRate) {
  const f = Math.max(1, Math.round(sampleRate / 22050)), sr = sampleRate / f, len = Math.floor(samples.length / f), x = new Float32Array(len);
  for (let i = 0; i < len; i++) { let s = 0; for (let k = 0; k < f; k++) s += samples[i * f + k]; x[i] = s / f; }
  const N = 512, hop = 128, frames = Math.max(1, Math.floor((len - N) / hop) + 1), fr = sr / hop, win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  const re = new Float64Array(N), im = new Float64Array(N), flux = new Float32Array(frames); let prev = new Float32Array(N / 2), cur = new Float32Array(N / 2);
  for (let fi = 0; fi < frames; fi++) { const o = fi * hop; for (let i = 0; i < N; i++) { re[i] = (x[o + i] || 0) * win[i]; im[i] = 0; } fftInPlace(re, im);
    let s = 0; for (let b = 1; b < N / 2; b++) { const m = Math.log1p(10 * Math.hypot(re[b], im[b])); cur[b] = m; const d = m - prev[b]; if (d > 0) s += d; } flux[fi] = s; const t = prev; prev = cur; cur = t; }
  const w = Math.round(0.025 * fr), out = [], loc = Math.round(0.4 * fr);
  for (let i = w; i < frames - w; i++) { const v = flux[i]; let m = 0, c = 0; for (let k = Math.max(0, i - loc); k < Math.min(frames, i + loc); k++) { m += flux[k]; c++; }
    if (v <= 1.5 * m / c) continue; let peak = true; for (let k = i - w; k <= i + w; k++) if (flux[k] > v || (flux[k] === v && k < i)) { peak = false; break; }
    if (peak) out.push({ t: (i * hop + N / 2) / sr, s: v }); }
  return out;
}
function fftInPlace(re, im) { const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) { const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const a = i + k, b = a + len / 2, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
      re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } } } }
const nearest = (arr, t) => { if (!arr.length) return { t: Infinity }; let lo = 0, hi = arr.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].t < t) lo = m + 1; else hi = m; }
  return [arr[lo], arr[lo - 1]].filter(Boolean).reduce((b, x) => Math.abs(x.t - t) < Math.abs(b.t - t) ? x : b); };

export function judgeChart(c, peaks, strong, stepSec) {
  const times = [...new Set(c.notes.map(n => n[0] / 1000))], dev = times.map(t => (nearest(peaks, t).t - t) * 1000);
  const abs = dev.map(Math.abs).sort((a, b) => a - b), st = chartStats(c), v = validate(c);
  // control: the same notes moved half a sixteenth off the grid; a real chart must align far better than that
  const ctrl = times.filter(t => Math.abs(nearest(peaks, t + stepSec / 2).t - (t + stepSec / 2)) <= 0.02).length / (times.length || 1);
  const on20 = abs.filter(x => x <= 20).length / (abs.length || 1);
  return { v: c.v, lanes: chartLanes(c), ...st, travel: +(st.meanJump * st.laneChangeRate).toFixed(2),
    onsetWithin20ms: +on20.toFixed(3), offGridControl: +ctrl.toFixed(3), alignMargin: +(on20 - ctrl).toFixed(3), medianOnsetDevMs: +(abs[abs.length >> 1] ?? 0).toFixed(1),
    meanSignedDevMs: +(dev.reduce((a, b) => a + b, 0) / (dev.length || 1)).toFixed(1),
    strongEventCoverage: +(strong.filter(e => times.some(t => Math.abs(t - e.t) <= 0.03)).length / (strong.length || 1)).toFixed(3),
    offsetMs: c.offsetMs, bpm: c.bpm, valid: v.ok, errors: v.errors.slice(0, 3) };
}
export function ladder(s) { const [e, m, h] = D.map(d => s[d]), f = [];
  if (!(e.notes < m.notes && m.notes < h.notes)) f.push(`note counts not rising (${e.notes}/${m.notes}/${h.notes})`);
  if (!(h.nps > m.nps)) f.push(`Hard not denser than Medium (${m.nps}/${h.nps} nps)`);
  if (!(h.peakNps >= m.peakNps)) f.push(`Hard peak below Medium (${m.peakNps}/${h.peakNps})`);
  if (!(h.chords >= m.chords)) f.push(`Hard has fewer chords than Medium (${m.chords}/${h.chords})`);
  if (!(h.travel > m.travel)) f.push(`Hard lane travel not above Medium (${m.travel}/${h.travel})`);
  if (!(h.lanes >= m.lanes && h.leadSec < m.leadSec)) f.push('Hard lanes/speed not above Medium');
  return f; }

/* samples/sampleRate: the decoded audio (mono); an: the analyzer output; storedBpm: the catalog's BPM;
   published: { difficulty: chart } (live charts); trackId/nextVersion for v2 generation */
export function auditSong(samples, sampleRate, an, { storedBpm, published = {}, trackId, nextVersion }) {
  const peaks = fineOnsets(samples, sampleRate), thr = pctl(peaks.map(x => x.s), 0.75), step = an.stepSec;
  const strong = peaks.filter(x => x.s >= thr && x.t > 0.8 && x.t < an.duration - 0.6);
  const gen = generateAll(an, { trackId, chartVersion: nextVersion }), v1 = {}, v2 = {};
  for (const d of D) { if (published[d]) v1[d] = judgeChart(published[d], peaks, strong, step); v2[d] = judgeChart(gen[d].chart, peaks, strong, step); }
  const issues = [];
  if (storedBpm && Math.abs(an.bpm - storedBpm) > ACCEPT.maxBpmDiff) issues.push(`analysed BPM ${an.bpm} differs from stored ${storedBpm}`);
  for (const d of D) { const x = v2[d];
    if (!x.valid) issues.push(`${d}: v2 chart invalid (${x.errors.join('; ')})`);
    if (x.onsetWithin20ms < ACCEPT.onsetWithin20ms) issues.push(`${d}: only ${(x.onsetWithin20ms * 100).toFixed(0)}% of notes within 20 ms of an onset`);
    if (x.medianOnsetDevMs > ACCEPT.maxMedianDevMs) issues.push(`${d}: median onset deviation ${x.medianOnsetDevMs} ms`); }
  if (!(v2.easy.strongEventCoverage <= v2.normal.strongEventCoverage && v2.normal.strongEventCoverage <= v2.expert.strongEventCoverage))
    issues.push(`coverage of strong attacks does not rise Easy → Medium → Hard (${D.map(d => Math.round(v2[d].strongEventCoverage * 100)).join('/')}%)`);
  const prog = ladder(v2); issues.push(...prog.map(p => 'progression: ' + p));
  const level = songChallenge(Object.fromEntries(D.map(d => [d, gen[d].chart])));
  return { analysedBpm: an.bpm, storedBpm, gridStartMs: Math.round(an.gridStart * 1000), downbeatMs: Math.round(an.downbeatSec * 1000), durationMs: Math.round(an.duration * 1000),
    strongEvents: strong.length, v1, v2, v1Ladder: Object.keys(v1).length === 3 ? ladder(v1) : ['missing charts'], v2Ladder: prog,
    challengeLevel: level, challengeBand: challengeBand(level), accepted: issues.length === 0, issues,
    v2Hashes: Object.fromEntries(D.map(d => [d, gen[d].chart.hash])) };
}

/* The full path the staging op runs: WAV bytes → decoded mono audio (≈22 kHz) → analysis → audit. */
export function auditWav(u8, opts) {
  const p = probeWav(u8); if (!p) throw new Error('not a PCM WAV');
  const { pcm, sampleRate } = decodeWavMono(u8, 22050);
  return { audio: { sampleRate: p.sampleRate, channels: p.channels, bits: p.bits, durationMs: p.durationMs }, ...auditSong(pcm, sampleRate, analyze(pcm, sampleRate), opts) };
}
