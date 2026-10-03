/* DEVELOPMENT ONLY test tracks. Synthesized deterministically in pure JS (no samples, no third-party
   audio) so the full pipeline — audio → analysis → charts → gameplay — runs on real PCM with known
   ground truth (tempo, structure). They are never presented as artist music: catalog entries carry
   dev:true and the UI labels them DEVELOPMENT ONLY. Real tracks go through the same code path. */
import { mulberry32 } from './generator.js';

const P = s => [...s].map(c => c === 'x' ? 1 : c === 'o' ? 0.6 : 0);   // 16-step pattern strings

const SEC = {
  intro:  { kick: '................', snare: '................', hat: 'x...x...x...x...', bass: 0, pad: 1, lead: 0, gain: 0.55 },
  four:   { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.o.x.o.x.o.x.o.', bass: 1, pad: 0.6, lead: 0, gain: 0.8 },
  groove: { kick: 'x.....x...x.....', snare: '....x..o....x...', hat: 'x.xox.xox.xox.xo', bass: 1, pad: 0.4, lead: 1, gain: 0.85 },
  sync:   { kick: 'x..x..x...x..x..', snare: '....x.......x..o', hat: '..x...x...x...x.', bass: 1, pad: 0.3, lead: 1, gain: 0.85 },
  build:  { kick: 'x...x...x...x...', snare: 'x.x.x.x.x.x.xxxx', hat: 'xxxxxxxxxxxxxxxx', bass: 0, pad: 0.8, lead: 0, gain: 0.8 },
  drop:   { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'oxoxoxoxoxoxoxox', bass: 2, pad: 0, lead: 1, gain: 1 },
  sustain:{ kick: 'x...............', snare: '................', hat: '................', bass: 0, pad: 1.2, lead: 0, gain: 0.7 },
  dense:  { kick: 'x.x.x..xx.x.x..x', snare: '....x.......x.x.', hat: 'xxxxxxxxxxxxxxxx', bass: 1, pad: 0, lead: 1, gain: 0.95 },
};

export const DEV_TRACKS = [
  { id: 'dev-60-slow-pulse', title: 'Slow Pulse', bpm: 60, genre: 'Instrumental', root: 45, hue: 200,
    form: [['intro', 4], ['four', 8], ['sustain', 4], ['four', 6]], desc: '60 BPM · straight rhythm · long sustained sections' },
  { id: 'dev-90-night-drive', title: 'Night Drive', bpm: 90, genre: 'Hip-Hop', root: 41, hue: 280,
    form: [['intro', 2], ['groove', 8], ['sync', 8], ['groove', 6]], desc: '90 BPM · syncopation · swung hats' },
  { id: 'dev-120-neon-grid', title: 'Neon Grid', bpm: 120, genre: 'EDM', root: 43, hue: 320,
    form: [['intro', 4], ['four', 8], ['build', 4], ['drop', 12], ['sustain', 4], ['drop', 8]], desc: '120 BPM · soft intro · heavy drop' },
  { id: 'dev-150-overdrive', title: 'Overdrive', bpm: 150, genre: 'Rock', root: 40, hue: 20,
    form: [['four', 8], ['dense', 16], ['build', 4], ['drop', 16]], desc: '150 BPM · dense sixteenths · Expert test' },
  { id: 'dev-128-bass-drop', title: 'Bass Drop', bpm: 128, genre: 'EDM', root: 38, hue: 140,
    form: [['intro', 8], ['build', 4], ['drop', 16], ['sync', 8], ['drop', 8]], desc: '128 BPM · soft intro · bass-heavy drop' },
].map(t => ({ ...t, dev: true, artist: 'KBeats Dev Lab', artistId: 'kbeats-dev-lab', soundcloud: '',
  durationSec: t.form.reduce((s, [, b]) => s + b, 0) * 4 * 60 / t.bpm }));

const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);

export function renderDevTrack(track, sampleRate = 44100) {
  const step = 60 / track.bpm / 4;
  const total = Math.ceil((track.durationSec + 1.5) * sampleRate);
  const out = new Float32Array(total);
  const rnd = mulberry32(track.bpm * 7919);
  const noise = new Float32Array(sampleRate); for (let i = 0; i < noise.length; i++) noise[i] = rnd() * 2 - 1;
  const add = (t0, durS, fn, g) => {
    const s0 = Math.floor(t0 * sampleRate), n = Math.floor(durS * sampleRate);
    for (let i = 0; i < n && s0 + i < total; i++) out[s0 + i] += g * fn(i / sampleRate, i);
  };
  const kick = (t) => { const f = 50 + 110 * Math.exp(-t * 30); return Math.sin(2 * Math.PI * (50 * t + 110 * (1 - Math.exp(-t * 30)) / 30)) * Math.exp(-t * 7) * (f > 0 ? 1 : 0); };
  const snare = (t, i) => noise[i % noise.length] * Math.exp(-t * 22) * 0.7 + Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t * 30) * 0.5;
  let hp = 0; const hat = (t, i) => { const n = noise[(i * 7) % noise.length]; const v = n - hp; hp = n; return v * Math.exp(-t * 70) * 0.5; };
  const prog = [0, 5, 3, 7];
  let bar = 0;
  for (const [name, bars] of track.form) {
    const S = SEC[name];
    const K = P(S.kick), Sn = P(S.snare), H = P(S.hat);
    for (let b = 0; b < bars; b++, bar++) {
      const bt = bar * 16 * step, root = track.root + prog[bar % 4];
      for (let k = 0; k < 16; k++) {
        const t = bt + k * step;
        if (K[k]) add(t, 0.45, kick, 0.9 * S.gain * K[k]);
        if (Sn[k]) add(t, 0.25, snare, 0.55 * S.gain * Sn[k]);
        if (H[k]) add(t, 0.06, hat, 0.35 * S.gain * H[k]);
        if (S.bass && (k % 4 === 0 || (S.bass > 1 && k % 2 === 0))) {
          const f = midiHz(root - 12), d = step * (S.bass > 1 ? 1.8 : 3.6);
          add(t, d, tt => { const ph = (f * tt) % 1; return (2 * ph - 1) * 0.6 * Math.min(1, tt * 200) * Math.exp(-tt * 3); }, 0.32 * S.gain * (S.bass > 1 ? 1.4 : 1));
        }
        if (S.lead && [0, 3, 6, 10, 12].includes(k) && (bar + k) % 3) {
          const f = midiHz(root + 24 + [0, 3, 7, 10, 12][(bar * 3 + k) % 5]);
          add(t, step * 1.6, tt => (Math.sin(2 * Math.PI * f * tt) > 0 ? 1 : -1) * 0.25 * Math.exp(-tt * 9), 0.18 * S.gain);
        }
      }
      if (S.pad) {
        const fs = [0, 4, 7].map(o => midiHz(root + 12 + o)), d = 16 * step;
        add(bt, d, tt => { const env = Math.min(1, tt / 0.6) * Math.min(1, (d - tt) / 0.3); let v = 0; for (const f of fs) v += Math.sin(2 * Math.PI * f * tt); return v * env / 3; }, 0.22 * S.pad * S.gain);
      }
    }
  }
  let peak = 0; for (const v of out) peak = Math.max(peak, Math.abs(v));
  const g = 0.89 / (peak || 1); for (let i = 0; i < total; i++) out[i] *= g;
  return out;
}
