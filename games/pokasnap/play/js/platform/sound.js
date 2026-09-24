/* SOUND — tiny synthesized blips, no audio files to ship or license.
   A single AudioContext is created on the first user gesture (iOS rule). */

import { get } from '../game/state.js';

let ac = null;
function ctx() {
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
function tone(freq, dur, type = 'sine', vol = 0.12, slide = 0, delay = 0) {
  if (!get().settings.sound) return;
  const c = ctx(); if (!c) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.02);
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
};
export function unlockAudio() { ctx(); }
