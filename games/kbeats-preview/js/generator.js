/* KBeats automatic song → chart generator. Deterministic DSP only (no AI service, no network):
     PCM → STFT → band spectral flux (onsets) + RMS (energy)
         → tempo (autocorrelation, then fine bpm/phase search over the whole song)
         → beat grid + downbeat → 1/16 slot strengths → structure (bar energy, drops, sustains)
         → per-difficulty note selection → lane patterns (seeded) → repair → validate
   Same input + same trackId/chartVersion ⇒ byte-identical charts (and hashes). Runs in the browser
   (artist upload preview) and in Node (server pipeline / tests). See AUDIO_ANALYSIS.md. */
import { makeChart, repair, validate, fnv64 } from './chart.js';
import { DIFFICULTIES, PLAYABLE_DIFFICULTIES } from './config.js';

export function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

const pct = (arr, p) => { const s = Float64Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor(p * s.length))] || 0; };
function normalize(a) { const hi = pct(a, 0.97) || 1; for (let i = 0; i < a.length; i++) a[i] = Math.min(1.5, a[i] / hi); return a; }

export function analyze(samples, sampleRate) {
  const f = Math.max(1, Math.round(sampleRate / 22050));
  const sr = sampleRate / f, len = Math.floor(samples.length / f);
  const x = new Float32Array(len);
  for (let i = 0; i < len; i++) { let s = 0; for (let k = 0; k < f; k++) s += samples[i * f + k]; x[i] = s / f; }
  const N = 1024, hop = 256, fr = sr / hop;
  const frames = Math.max(1, Math.floor((len - N) / hop) + 1);
  const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  const binHz = sr / N, lowTop = Math.ceil(160 / binHz), midTop = Math.ceil(2200 / binHz), airBot = Math.ceil(6000 / binHz);
  const low = new Float32Array(frames), mid = new Float32Array(frames), high = new Float32Array(frames), air = new Float32Array(frames), rms = new Float32Array(frames);
  let prev = new Float32Array(N / 2), cur = new Float32Array(N / 2);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let fi = 0; fi < frames; fi++) {
    const o = fi * hop; let e = 0;
    for (let i = 0; i < N; i++) { const v = (x[o + i] || 0); e += v * v; re[i] = v * win[i]; im[i] = 0; }
    rms[fi] = Math.sqrt(e / N);
    fft(re, im);
    let l = 0, m = 0, h = 0, a = 0;
    for (let b = 1; b < N / 2; b++) {
      const mag = Math.log1p(10 * Math.hypot(re[b], im[b]));
      cur[b] = mag;
      const d = mag - prev[b];
      if (d > 0) { if (b < lowTop) l += d; else if (b < midTop) m += d; else { h += d; if (b >= airBot) a += d; } }
    }
    low[fi] = l; mid[fi] = m; high[fi] = h; air[fi] = a;
    const t = prev; prev = cur; cur = t;
  }
  low[0] = mid[0] = high[0] = air[0] = 0;
  normalize(low); normalize(mid); normalize(high); normalize(air);
  const env = new Float32Array(frames);
  for (let i = 0; i < frames; i++) env[i] = 1.2 * low[i] + mid[i] + 0.6 * high[i];
  // adaptive: subtract local mean (~0.25 s) so sustained loudness is not an onset
  const w = Math.round(fr * 0.25), onset = new Float32Array(frames);
  { let s = 0; const q = [];
    for (let i = 0; i < frames + w; i++) {
      if (i < frames) { s += env[i]; q.push(env[i]); }
      if (q.length > 2 * w + 1) s -= q.shift();
      const c = i - w; if (c >= 0 && c < frames) onset[c] = Math.max(0, env[c] - s / q.length);
    } }

  const tempo = estimateTempo(onset, fr);
  const duration = len / sr;
  return { sampleRate: sr, frameRate: fr, frames, duration, low, mid, high, rms, onset, air, ...tempo, ...structure(onset, low, mid, high, rms, fr, tempo, duration, air) };
}

function interp(a, pos) { const i = Math.floor(pos), f = pos - i; return i < 0 || i + 1 >= a.length ? 0 : a[i] * (1 - f) + a[i + 1] * f; }

function estimateTempo(onset, fr) {
  const n = onset.length;
  let mean = 0; for (const v of onset) mean += v; mean /= n || 1;
  const lagMin = Math.floor(fr * 60 / 200), lagMax = Math.ceil(fr * 60 / 55);
  let best = 0, bestLag = Math.round(fr * 0.5);
  for (let L = lagMin; L <= lagMax && L < n; L++) {
    let s = 0; for (let i = 0; i + L < n; i++) s += (onset[i] - mean) * (onset[i + L] - mean);
    s /= (n - L);
    const bpm = 60 * fr / L, prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 115) / 1.1, 2));
    const sc = s * prior;
    if (sc > best) { best = sc; bestLag = L; }
  }
  // fine search: bpm ±3 % and phase, scoring onset energy on the predicted beats across the song
  const coarse = 60 * fr / bestLag;
  let bestScore = -1, bpm = coarse, phase = 0;
  for (let b = coarse * 0.97; b <= coarse * 1.03; b += 0.02) {
    const per = 60 * fr / b;
    for (let ph = 0; ph < per; ph += 0.5) {
      let s = 0; for (let p = ph; p < n; p += per) s += interp(onset, p) + 0.5 * interp(onset, p + per / 2);
      if (s > bestScore) { bestScore = s; bpm = b; phase = ph; }
    }
  }
  if (Math.abs(bpm - Math.round(bpm)) < 0.25) {          // most produced music sits on an integer tempo
    const b = Math.round(bpm), per = 60 * fr / b; let bs = -1;
    for (let ph = 0; ph < per; ph += 0.25) { let s = 0; for (let p = ph; p < n; p += per) s += interp(onset, p); if (s > bs) { bs = s; phase = ph; } }
    bpm = b;
  }
  // octave check: if the kick band is just as busy on the half-beats, the true pulse is twice as fast
  { const per = 60 * fr / bpm; let on = 0, half = 0, k = 0;
    for (let p = phase; p + per / 2 < n; p += per, k++) { on += interp(onset, p); half += interp(onset, p + per / 2); }
    if (k && half > 0.62 * on && bpm * 2 <= 165) { bpm *= 2; const per2 = per / 2; if (phase >= per2) phase -= per2; } }
  const beatSec = 60 / bpm;
  /* A hann-windowed frame "sees" an onset before its centre reaches it; 27 ms is the measured lag
     of this STFT (1024/256 @ 22.05 kHz) against synthetic ground truth (tests hold it ≤ 6 ms). */
  const FRAME_LAG = 0.027;
  return { bpm: Math.round(bpm * 100) / 100, beatSec, phaseSec: (phase / fr + FRAME_LAG) % beatSec };
}

function structure(onset, low, mid, high, rms, fr, { beatSec, phaseSec }, duration, air = high) {
  const step = beatSec / 4;
  // downbeat = which of the 4 beat phases carries the most low-band (kick) weight
  const dbScore = [0, 0, 0, 0];
  for (let k = 0, t = phaseSec; t < duration; t += beatSec, k++) dbScore[k % 4] += interp(low, t * fr) + 0.3 * interp(onset, t * fr);
  const db = dbScore.indexOf(Math.max(...dbScore));
  const firstDown = phaseSec + db * beatSec;
  const gridStart = firstDown - Math.floor(firstDown / step) * step;
  const slots = [];
  const pick = (a, c) => Math.max(interp(a, c - 1), interp(a, c), interp(a, c + 1), interp(a, c + 2));
  /* band attacks (instrument roles): the frames whose windows contain the attack start up to one window before
     the slot time (frame index = window start); sampling later frames reads the next hit at fast tempos */
  const W = 1024 / 256, band = (a, c) => Math.max(interp(a, c - W), interp(a, c - W + 1), interp(a, c - W + 2), interp(a, c - 1), interp(a, c));
  for (let t = gridStart, i = 0; t < duration - 0.05; t += step, i++) {
    const c = t * fr;
    const rel = Math.round((t - firstDown) / step);
    slots.push({ t, i, pos: ((rel % 16) + 16) % 16, bar: Math.floor(rel / 16), low: band(low, c), mid: band(mid, c), high: band(high, c), air: band(air, c), on: pick(onset, c), rms: interp(rms, c) });
  }
  // adaptive threshold per slot: local median over ±2 bars
  const win = 32;
  for (let i = 0; i < slots.length; i++) {
    const a = slots.slice(Math.max(0, i - win), i + win + 1).map(s => s.on);
    slots[i].thr = pct(a, 0.6) * 1.15 + 0.04;
  }
  // bar energy (0..1) and drops
  const bars = {};
  for (const s of slots) { (bars[s.bar] ||= { e: 0, n: 0 }); bars[s.bar].e += s.rms; bars[s.bar].n++; }
  const keys = Object.keys(bars).map(Number).sort((a, b) => a - b);
  const raw = keys.map(k => bars[k].e / bars[k].n);
  const lo = pct(raw, 0.05), hi = pct(raw, 0.95) || 1;
  const energy = {};
  keys.forEach((k, i) => { energy[k] = Math.max(0, Math.min(1, (raw[i] - lo) / ((hi - lo) || 1))); });
  const drops = [];
  keys.forEach((k, i) => { if (i >= 2) { const p = (energy[keys[i - 1]] + energy[keys[i - 2]]) / 2; if (energy[k] - p > 0.3 && energy[k] > 0.65) drops.push(k); } });
  const sections = [];
  keys.forEach((k, i) => { if (!i || Math.abs(energy[k] - energy[keys[i - 1]]) > 0.25) sections.push(k); });
  // sustains: strong onset followed by ≥1 beat with no strong onset while energy holds up
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i]; s.sustain = 0;
    if (s.on < s.thr) continue;
    let j = i + 1;
    while (j < slots.length && j - i < 32 && slots[j].on < slots[j].thr * 0.9 && slots[j].rms > s.rms * 0.55) j++;
    if (j - i >= 4) s.sustain = j - i;
  }
  return { downbeatSec: firstDown, gridStart, stepSec: step, slots, energy, drops, sections };
}

/* Per-difficulty charting rules. `every` is the finest grid step allowed (16ths: 4 = quarter notes);
   Easy follows the beat and the strongest hits only, Medium adds eighths and syncopation, Hard adds clear
   sixteenths and more chords. GOD is defined for a later release and is never generated by generateAll. */
const RULES = {
  easy:   { every: 4, thrMul: 0.8,  quietEvery: 8, chordP: 0,    swipeP: 0.0,  holdMin: 8 },
  normal: { every: 2, thrMul: 0.95, quietEvery: 4, chordP: 0.18, swipeP: 0.05, holdMin: 4 },
  expert: { every: 1, thrMul: 1.0,  quietEvery: 2, chordP: 0.3,  swipeP: 0.08, holdMin: 4 },
  god:    { every: 1, thrMul: 0.9,  quietEvery: 1, chordP: 0.4,  swipeP: 0.1,  holdMin: 4 },
};

/* Otsu split on log attack strength: the threshold that best separates a band's real attacks into a quiet and
   a loud cluster on this track (e.g. kicks vs. bass bleed and hats in the low band). */
export function bandSplit(vals) {
  const v = vals.filter(x => x > 0).map(Math.log).sort((a, b) => a - b); if (v.length < 8) return Infinity;
  let best = -1, thr = v[v.length >> 1], sum = v.reduce((a, b) => a + b, 0), sl = 0;
  for (let i = 1; i < v.length; i++) { sl += v[i - 1]; const w0 = i / v.length, w1 = 1 - w0, m0 = sl / i, m1 = (sum - sl) / (v.length - i);
    const b = w0 * w1 * (m0 - m1) ** 2; if (b > best) { best = b; thr = (v[i - 1] + v[i]) / 2; } }
  return Math.exp(thr);
}

/* Lane roles by lane count: kick → the outer lanes, snare/clap → the inner lanes (the centre on three
   lanes), everything else (hats, melody) walks across the lanes. Same musical role, same region of the
   highway, at every difficulty. */
export function laneRoles(n) {
  // `jump`: Hard's hat/melody walk skips lanes, so hands travel further between consecutive notes
  if (n === 3) return { kick: [0, 2], snare: [1], walk: [0, 1, 2, 1], jump: [0, 2, 1, 2, 0, 1] };
  if (n === 5) return { kick: [0, 4], snare: [1, 3], walk: [0, 1, 2, 3, 4, 3, 2, 1], jump: [0, 2, 4, 1, 3, 0, 4, 2] };
  return { kick: [0, 3], snare: [1, 2], walk: [0, 1, 2, 3, 2, 1], jump: [0, 2, 1, 3, 0, 3] };
}

export function generateChart(an, { trackId, chartVersion = 1, difficulty, lanes = DIFFICULTIES[difficulty]?.lanes || 4 }) {
  const R = RULES[difficulty], N = lanes, roles = laneRoles(N);
  const other = (set, prev) => set.length === 1 ? set[0] : set[0] === prev ? set[1] : set[1] === prev ? set[0] : set[0];
  const rnd = mulberry32(parseInt(fnv64(`${trackId}|${chartVersion}|${difficulty}`).slice(0, 8), 16));
  const notes = [];
  let last = -1, lastT = -1, dirCycle = 0, holdUntil = -1, pattern = 0, chordFlip = 0;
  const step = an.stepSec;
  // off-beat notes also need an attack of real size for this track (not a faint wobble in a quiet section)
  const real = an.slots.filter(x => x.on >= x.thr);
  const split = { low: bandSplit(real.map(x => x.low)), mid: bandSplit(real.map(x => x.mid)), high: bandSplit(real.map(x => x.high)), air: bandSplit(real.map(x => x.air)) };
  split.airOverLow = bandSplit(an.slots.filter(x => x.on >= 2 * x.thr && x.low >= split.low).map(x => x.air / Math.max(1e-6, x.low)));
  const ons = an.slots.map(x => x.on).sort((x, y) => x - y), onFloor = 0.3 * (ons[Math.floor(ons.length * 0.9)] || 0);
  for (const s of an.slots) {
    if (s.t < 0.8 || s.t > an.duration - 0.6) continue;
    const e = an.energy[s.bar] ?? 0.5;
    const every = e < 0.3 ? R.quietEvery : R.every;
    if (s.pos % every) continue;
    const strong = s.on >= s.thr * R.thrMul;
    const onBeat = s.pos % 4 === 0;
    // musical gate: on-beats only need a modest onset; off-beats must be clearly there; expert 16ths very clear
    const gate = onBeat ? strong || (difficulty !== 'easy' && s.low > 0.5)
      : s.pos % 2 === 0 ? s.on >= s.thr * (difficulty === 'normal' ? 1.1 : 0.85)
      : s.on >= s.thr * 1.15 && e > 0.4;
    if (!gate || (!onBeat && s.on < onFloor)) continue;
    if (s.t < holdUntil) continue;
    // lane: kick → outer, snare/vocal → inner, hats → walking pattern
    let lane;
    // instrument role: is this slot's attack in the upper cluster of its band for this track (split per band
    // and per track, see bandSplit)? Low → kick. Otherwise mid with a noisy high band → snare. Otherwise hats/melody.
    const kHi = s.low >= split.low, mHi = s.mid >= split.mid;
    const isSnare = mHi && s.high >= split.high * 0.7 && s.mid / split.mid >= s.low / split.low, isKick = kHi && !isSnare;
    if (isKick) lane = roles.kick.includes(last) ? other(roles.kick, last) : roles.kick[rnd() < 0.5 ? 0 : 1];
    else if (isSnare) lane = roles.snare.includes(last) ? other(roles.snare, last) : roles.snare[Math.floor(rnd() * roles.snare.length)];
    else { const W = difficulty === 'expert' || difficulty === 'god' ? roles.jump : roles.walk; pattern = (pattern + 1) % W.length; lane = W[pattern]; }
    if (lane === last && s.t - lastT < 0.25) lane = (lane + 1 + Math.floor(rnd() * (N - 1))) % N;
    const isDrop = an.drops.includes(s.bar) && s.pos === 0;
    const sectionStart = an.sections.includes(s.bar) && s.pos === 0;
    let type = 'tap', dur = 0, dir;
    if (s.sustain >= R.holdMin && onBeat && rnd() < (difficulty === 'easy' ? 0.6 : difficulty === 'normal' ? 0.45 : 0.3)) {
      type = 'hold'; dur = Math.min(s.sustain - 1, 16) * step; holdUntil = s.t + dur + step;
    } else if ((isDrop || sectionStart) && R.swipeP > 0 && rnd() < 0.6) { type = 'swipe'; }
    else if (R.swipeP && e > 0.6 && onBeat && rnd() < R.swipeP) { type = 'swipe'; }
    if (difficulty === 'easy' && isDrop && rnd() < 0.5) type = 'swipe';
    if (type === 'swipe') dir = lane === 0 ? 'left' : lane === N - 1 ? 'right' : (dirCycle++ % 2 ? 'up' : 'down');
    notes.push({ t: s.t, lane, type, dur, dir });
    last = lane; lastT = s.t;
    // chords only where two instruments really strike together (kick with a clear snare or hat attack in the
    // same slot); never with a swipe, never 3+. Medium takes some on downbeats and drops,
    // Hard takes most of them. The second note goes where the second instrument lives.
    // a second instrument must show in the air band (> 6 kHz): hats and snares are noise up there, while a
    // bass's or kick's harmonics have faded. Judged per track: this accent's air-to-low ratio must be in the upper
    // cluster of the track's accented low-band hits.
    const together = isKick && s.on >= 2 * s.thr && s.air / Math.max(1e-6, s.low) >= split.airOverLow, hard = difficulty === 'expert' || difficulty === 'god';
    if (type === 'tap' && R.chordP && together && (hard ? rnd() < (isDrop ? 0.9 : 0.6) : (s.pos === 0 || isDrop) && rnd() < R.chordP)) {
      let partner = N - 1 - lane;
      if (together) {   // same side of the highway as the kick, so each pair moves across together
        const side = l => Math.sign(l - (N - 1) / 2), pool = (mHi ? roles.snare : [...Array(N).keys()]).filter(l => l !== lane && side(l) !== -side(lane) && !roles.kick.includes(l));
        partner = pool.length ? pool[chordFlip++ % pool.length] : N - 1 - lane;
      }
      if (partner === lane) partner = (lane + Math.ceil(N / 2)) % N;
      notes.push({ t: s.t, lane: partner, type: 'tap' });
    }
  }
  let chart = makeChart({ trackId, chartVersion, difficulty, bpm: an.bpm, offsetMs: Math.round(an.gridStart * 1000), durationMs: Math.round(an.duration * 1000), notes, lanes: N });
  chart = repair(chart);
  return { chart, report: validate(chart) };
}

export function generateAll(an, opts) {
  const out = {};
  for (const d of PLAYABLE_DIFFICULTIES) out[d] = generateChart(an, { ...opts, difficulty: d });
  return out;
}

/* Downsampled peak envelope for waveform drawing (editor). */
export function waveform(samples, buckets = 2000) {
  const per = Math.max(1, Math.floor(samples.length / buckets)), out = new Float32Array(buckets);
  for (let b = 0; b < buckets; b++) { let m = 0; for (let i = b * per, e = Math.min(samples.length, i + per); i < e; i += 4) { const v = Math.abs(samples[i]); if (v > m) m = v; } out[b] = m; }
  return out;
}
