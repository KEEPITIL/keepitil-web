/* SOUND — synthesized effects and a gentle menu tune. No audio files to ship
   or license. A single AudioContext is created on the first user gesture (iOS
   rule). Three independent switches: Music, Sound Effects, Haptics. */

import { get } from '../game/state.js';

let ac = null;
function ctx() {
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
function tone(freq, dur, type = 'sine', vol = 0.12, slide = 0, delay = 0, dest = null) {
  if (!dest && !get().settings.sound) return;
  const c = ctx(); if (!c) return;
  const t0 = c.currentTime + delay;
  if (!dest) vol *= (get().settings.sfxVolume ?? 1);
  if (vol <= 0.0001) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(dest || c.destination); o.start(t0); o.stop(t0 + dur + 0.02);
}

export const sfx = {
  tap:     () => tone(660, 0.07, 'triangle', 0.08),
  poke:    () => { tone(520, 0.12, 'sine', 0.14, 380); tone(880, 0.1, 'triangle', 0.06, 0, 0.06); },
  pose:    () => tone(740, 0.09, 'triangle', 0.1, 120),
  shutter: () => { tone(1400, 0.03, 'square', 0.05); tone(300, 0.08, 'triangle', 0.08, -120, 0.03); },
  tick:    () => tone(1200, 0.03, 'triangle', 0.04),
  score:   () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.14, 'triangle', 0.1, 0, i * 0.08)),
  level:   () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.18, 'sine', 0.12, 0, i * 0.09)),
  equip:   () => { tone(880, 0.06, 'triangle', 0.08); tone(1320, 0.08, 'triangle', 0.07, 0, 0.05); },
  unlock:  () => [784, 988, 1318].forEach((f, i) => tone(f, 0.12, 'sine', 0.1, 0, i * 0.07)),
  reward:  () => [988, 1318].forEach((f, i) => tone(f, 0.1, 'triangle', 0.09, 0, i * 0.06)),
  eat:     () => [0, 0.11, 0.22].forEach(d => tone(180 + Math.random() * 60, 0.05, 'square', 0.04, -60, d)),
  catch:   () => tone(900, 0.07, 'triangle', 0.08, 300),
  miss:    () => tone(300, 0.1, 'sine', 0.05, -80),
  /* soft pet voices -- a slide, not a sample */
  pet(animal) {
    if (animal === 'cat') { tone(700, 0.22, 'sine', 0.07, 280); tone(980, 0.16, 'sine', 0.04, -300, 0.12); }
    else if (animal === 'dog') { tone(420, 0.09, 'triangle', 0.09, -120); tone(460, 0.09, 'triangle', 0.08, -140, 0.13); }
    else tone(1300, 0.08, 'sine', 0.06, 400);
  },
};

/* ---------------------------------------------------------------- music --
   PokaSnap Music Journeys, provider LOCAL_OWNED: three original, generated
   tunes (nothing to license). Future providers (SOUNDCLOUD, YOUTUBE_DISCOVERY)
   plug in behind the same controls. Playback itself never earns anything --
   rewards come from what you DO while it plays (walks, snaps, training). */
export const MUSIC_PROVIDERS = ['LOCAL_OWNED', 'SOUNDCLOUD', 'YOUTUBE_DISCOVERY'];
export const TRACKS = [
  { id: 'home', name: 'Cozy Home',  bpm: 96,  root: 523.25, scale: [0, 2, 4, 7, 9, 12, 14, 16], melody: [0, 2, 4, 2, 5, 4, 2, 0, 3, 4, 5, 7, 5, 4, 2, 4], bass: [0, 0, -5, -5, -3, -3, -5, -5], wave: 'triangle' },
  { id: 'walk', name: 'Walk Along', bpm: 112, root: 587.33, scale: [0, 2, 4, 5, 7, 9, 11, 12], melody: [0, 4, 7, 4, 5, 4, 2, 0, 2, 4, 5, 7, 9, 7, 5, 4], bass: [0, 0, 5, 5, 7, 7, 5, 5], wave: 'sine' },
  { id: 'snap', name: 'Snap Party', bpm: 124, root: 659.25, scale: [0, 3, 5, 7, 10, 12, 15, 17], melody: [0, 2, 3, 2, 4, 3, 2, 1, 0, 2, 4, 5, 4, 2, 3, 1], bass: [0, 0, -2, -2, -4, -4, -5, -5], wave: 'triangle' },
];
let musicOn = false, musicTimer = 0, bus = null, step = 0, nextAt = 0, trackIdx = 0;
function note(semi, base) { return base * Math.pow(2, semi / 12); }
function schedule() {
  const c = ctx(); if (!c || !musicOn) return;
  const T = TRACKS[trackIdx], BEAT = 60 / T.bpm / 2;
  while (nextAt < c.currentTime + 0.6) {
    const d = nextAt - c.currentTime, m = T.melody[step % T.melody.length];
    if (step % 2 === 0 || Math.random() < 0.5) tone(note(T.scale[m % T.scale.length], T.root), BEAT * 1.6, T.wave, 0.05, 0, Math.max(0, d), bus);
    if (step % 4 === 0) tone(note(T.bass[(step / 4) % T.bass.length], T.root / 4), BEAT * 3.6, 'sine', 0.07, 0, Math.max(0, d), bus);
    step++; nextAt += BEAT;
  }
}
export const music = {
  start(trackId) {
    if (trackId) { const i = TRACKS.findIndex(t => t.id === trackId); if (i >= 0) trackIdx = i; }
    if (musicOn || !get().settings.music) return;
    const c = ctx(); if (!c) return;
    bus = c.createGain(); bus.gain.value = 0.9 * (get().settings.musicVolume ?? 1); bus.connect(c.destination);
    musicOn = true; nextAt = c.currentTime + 0.1; step = 0;
    musicTimer = setInterval(schedule, 200); schedule();
  },
  stop() {
    if (!musicOn) return; musicOn = false; clearInterval(musicTimer);
    try { bus.gain.setTargetAtTime(0, ac.currentTime, 0.08); const b = bus; setTimeout(() => b.disconnect(), 400); } catch (e) {}
  },
  toggle() { musicOn ? music.stop() : music.start(); return musicOn; },
  next() { trackIdx = (trackIdx + 1) % TRACKS.length; step = 0; return TRACKS[trackIdx]; },
  prev() { trackIdx = (trackIdx + TRACKS.length - 1) % TRACKS.length; step = 0; return TRACKS[trackIdx]; },
  setVolume(v) { if (bus) try { bus.gain.setTargetAtTime(0.9 * v, ac.currentTime, 0.05); } catch (e) {} },
  track: () => TRACKS[trackIdx],
  playing: () => musicOn,
};

export function unlockAudio() { ctx(); }
