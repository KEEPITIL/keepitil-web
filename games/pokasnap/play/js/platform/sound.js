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
   A soft, looping pentatonic tune scheduled a bar ahead. Menu screens only:
   the camera and minigames stop it so nothing competes with the shutter. */
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16];
const MELODY = [0, 2, 4, 2, 5, 4, 2, 0, 3, 4, 5, 7, 5, 4, 2, 4];
const BASS = [0, 0, -5, -5, -3, -3, -5, -5];
let musicOn = false, musicTimer = 0, bus = null, step = 0, nextAt = 0;
const BEAT = 60 / 96 / 2;
function note(semi, base = 523.25) { return base * Math.pow(2, semi / 12); }
function schedule() {
  const c = ctx(); if (!c || !musicOn) return;
  while (nextAt < c.currentTime + 0.6) {
    const d = nextAt - c.currentTime;
    const m = MELODY[step % MELODY.length];
    if (step % 2 === 0 || Math.random() < 0.5) tone(note(SCALE[m % SCALE.length]), BEAT * 1.6, 'triangle', 0.05, 0, Math.max(0, d), bus);
    if (step % 4 === 0) tone(note(BASS[(step / 4) % BASS.length], 130.8), BEAT * 3.6, 'sine', 0.07, 0, Math.max(0, d), bus);
    step++; nextAt += BEAT;
  }
}
export const music = {
  start() {
    if (musicOn || !get().settings.music) return;
    const c = ctx(); if (!c) return;
    bus = c.createGain(); bus.gain.value = 0.9; bus.connect(c.destination);
    musicOn = true; nextAt = c.currentTime + 0.1; step = 0;
    musicTimer = setInterval(schedule, 200); schedule();
  },
  stop() {
    if (!musicOn) return; musicOn = false; clearInterval(musicTimer);
    try { bus.gain.setTargetAtTime(0, ac.currentTime, 0.08); const b = bus; setTimeout(() => b.disconnect(), 400); } catch (e) {}
  },
  playing: () => musicOn,
};
export function unlockAudio() { ctx(); }
