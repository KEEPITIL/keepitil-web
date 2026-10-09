/* KMOB audio — fully synthesized WebAudio (no asset downloads). Every category is voice-limited so 500 soldiers
   never produce 500 overlapping sounds; music is a low, slowly-intensifying loop tied to battle pressure. */
(function (G) {
  const KM = G.KM, PRIORITY = { lhit: 1, boom: 1, cannon: 1, elite: 1, warn: 1, death: 1, pb: 1, tap: 1, upgrade: 1, build: 1 };   // tank damage, explosions, the cannon, boss / UI cues
  class Audio {
    constructor() { this.ctx = null; this.on = true; this.music = true; this.last = {}; this.intensity = 0; }
    unlock() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.gain.value = 0.8;
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; this.master.connect(comp); comp.connect(c.destination);
      this.sfx = c.createGain(); this.sfx.gain.value = this.on ? 0.9 : 0; this.sfx.connect(this.master);
      this.mus = c.createGain(); this.mus.gain.value = this.music ? 0.32 : 0; this.mus.connect(this.master);
      const len = c.sampleRate * 0.5, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; this.noise = buf;
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* optional */ }
      this.beat = 0; this.nextBeat = c.currentTime + 0.1;
      // layered crowd beds: one continuous source per layer instead of one sound per soldier
      const bed = (type, freq, q) => { const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = c.createGain(); g.gain.value = 0; src.connect(f); f.connect(g); g.connect(this.sfx); src.start(); return g; };
      this.beds = { march: bed('lowpass', 260, 0.7), clash: bed('bandpass', 1900, 0.8), roar: bed('bandpass', 520, 0.5) };
      this.coinCombo = 0; this.coinT = 0;
    }
    setSound(v) { this.on = !!v; if (this.sfx) this.sfx.gain.value = v ? 0.9 : 0; }
    setMusic(v) { this.music = !!v; if (this.mus) this.mus.gain.value = v ? 0.32 : 0; }
    suspend(s) { if (!this.ctx) return; s ? this.ctx.suspend() : this.ctx.resume(); }
    gate(k, ms) { const n = performance.now(); if (n - (this.last[k] || 0) < ms) return false; if (!PRIORITY[k] && this.ctx && !this.voice(k === 'boom' || k === 'cannon' ? 0.45 : 0.22)) return false; this.last[k] = n; return true; }   // the voice budget is only spent by sounds that will play; priority sounds never wait for it
    // pan helper: route a one-shot through a stereo panner (pseudo-spatial for towers, bosses, launcher)
    out(pan) { if (pan == null || !this.ctx.createStereoPanner) return this.sfx; const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(this.sfx); setTimeout(() => p.disconnect(), 1500); return p; }
    // combat intensity 0..1 → four bands (light / moderate / heavy / massive clash), smoothed so beds never pump
    crowd(level, marching) {
      if (!this.ctx || !this.beds) return; const t = this.ctx.currentTime, band = level < 0.08 ? 0 : level < 0.3 ? 1 : level < 0.6 ? 2 : level < 0.85 ? 3 : 4;
      const g = (n, v) => n.gain.setTargetAtTime(this.on ? v : 0, t, 0.35);
      g(this.beds.march, 0.05 + Math.min(1, marching) * 0.07); g(this.beds.clash, [0, 0.03, 0.06, 0.09, 0.12][band]); g(this.beds.roar, [0, 0, 0.03, 0.06, 0.1][band]); this.band = band;
    }
    tone(f, t, dur, type, vol, f2, dest) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || this.sfx); o.start(t); o.stop(t + dur + 0.02);
    }
    hiss(t, dur, freq, q, vol, type, dest) {
      const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = this.noise; f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f); f.connect(g); g.connect(dest || this.sfx); s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.02);
    }
    // metallic strike: a few inharmonic partials (struck steel, not a beep) + a short bright noise transient; base pitch varies per hit
    metal(t, base, vol, dest) { const P = [1, 2.76, 5.4, 8.93]; for (let i = 0; i < P.length; i++) this.tone(base * P[i] * (1 + (Math.random() - 0.5) * 0.02), t, 0.22 / (1 + i * 0.6), i ? 'sine' : 'triangle', vol / (1 + i * 1.4), 0, dest); this.hiss(t, 0.03, 5200 + Math.random() * 1800, 3, vol * 1.2, 'bandpass', dest); }
    // global voice budget: dense battles never stack dozens of one-shots
    voice(n) { const now = this.ctx.currentTime; this.vq = (this.vq || []).filter(e => e > now); if (this.vq.length > 22) return false; this.vq.push(now + (n || 0.25)); return true; }
    play(k, v, pan) {
      if (!this.ctx || !this.on) return; const t = this.ctx.currentTime, r = 1 + (Math.random() - 0.5) * 0.12, D = pan == null ? undefined : this.out(pan), pick = a => a[Math.floor(Math.random() * a.length)];
      switch (k) {
        case 'deploy': if (this.gate(k, 70)) { this.tone(180 * r, t, 0.09, 'sine', 0.12, 70); this.hiss(t, 0.05, 1800, 1, 0.05); } break;
        case 'hit': if (this.gate(k, 45)) { this.hiss(t, 0.05, 700 * r + Math.random() * 500, 1.5, 0.1); this.tone(140 * r, t, 0.06, 'sine', 0.05, 90); } break;   // body blow: dull slap + low knock
        case 'clang': if (this.gate(k, 90)) this.metal(t + Math.random() * 0.012, pick([820, 940, 1060, 1180]) * r, 0.05); break;   // sword on sword / shield: struck steel, four voicings
        case 'kill': if (this.gate(k, 55)) { this.hiss(t, 0.12, 420 * r, 1.2, 0.07, 'lowpass'); this.tone(pick([180, 200, 225]) * r, t, 0.14, 'sawtooth', 0.025, 110); } break;   // a short grunt + fall, not a beep
        case 'coin': if (this.gate(k, 60)) { const now = performance.now(); this.coinCombo = now - this.coinT < 500 ? Math.min(12, this.coinCombo + 1) : 0; this.coinT = now; const cp = Math.pow(2, this.coinCombo / 12); this.tone(1320 * cp, t, 0.07, 'sine', 0.07); this.tone(1980 * cp, t + 0.05, 0.12, 'sine', 0.06); } break;
        case 'bow': if (this.gate(k, 80)) { this.tone(pick([196, 220, 247]) * r, t, 0.09, 'triangle', 0.05, 120); this.hiss(t, 0.03, 3600, 2, 0.05, 'highpass'); this.hiss(t + 0.02, 0.16, 1500 * r, 0.8, 0.035, 'bandpass'); } break;   // string twang + release + arrow whoosh
        case 'cannon': if (this.gate(k, 120)) { this.hiss(t, 0.05, 2600, 0.7, 0.16, 'highpass', D); this.tone(95 * r, t, 0.38, 'sine', 0.3, 38, D); this.hiss(t, 0.42, 520, 0.7, 0.18, 'lowpass', D); this.hiss(t + 0.06, 0.6, 260, 0.5, 0.06, 'lowpass', D); } break;   // report crack + body + rolling tail
        case 'snipe': if (this.gate(k, 200)) { this.tone(2400, t, 0.08, 'square', 0.05, 600, D); this.hiss(t, 0.18, 3000, 2, 0.12, 'bandpass', D); } break;
        case 'tower': if (this.gate(k, 140)) this.hiss(t, 0.07, 2200, 3, 0.05, 'highpass', D); break;
        case 'build': [392, 523, 659].forEach((f, i) => this.tone(f, t + i * 0.07, 0.2, 'triangle', 0.1, 0, D)); this.hiss(t, 0.3, 800, 0.6, 0.12, 'lowpass', D); break;
        case 'shieldhit': if (this.gate(k, 110)) { this.metal(t, pick([520, 600, 680]) * r, 0.035); this.tone(120 * r, t, 0.08, 'sine', 0.06, 80); } break;   // pike / blade on a wooden-rimmed shield: lower ring + wood knock
        case 'thud': if (this.gate(k, 140)) { this.tone(pick([70, 78, 86]) * r, t, 0.22, 'sine', 0.22, 38, D); this.hiss(t, 0.16, 360, 0.8, 0.14, 'lowpass', D); this.hiss(t + 0.03, 0.22, 1200, 0.6, 0.04, 'bandpass', D); } break;   // giant hammer: deep body + earth + debris
        case 'boom': if (this.gate(k, 100)) { this.hiss(t, 0.06, 1800, 0.6, 0.14, 'highpass'); this.tone(66 * r, t, 0.6, 'sine', 0.35, 28); this.hiss(t, 0.7, 520, 0.6, 0.25, 'lowpass'); } break;
        case 'frost': if (this.gate(k, 140)) { this.tone(2200, t, 0.25, 'sine', 0.04, 3400); this.hiss(t, 0.2, 6000, 4, 0.04); } break;
        case 'lhit': if (this.gate(k, 160)) { this.tone(110, t, 0.2, 'sawtooth', 0.12, 60, D); this.hiss(t, 0.15, 500, 1, 0.15, 'lowpass', D); } break;
        case 'upgrade': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, t + i * 0.06, 0.25, 'triangle', 0.12)); this.hiss(t, 0.4, 5000, 0.8, 0.05, 'highpass'); break;
        case 'elite': if (this.gate(k, 1500)) { this.tone(98, t, 0.9, 'sawtooth', 0.12, 92, D); this.tone(147, t + 0.05, 0.9, 'sawtooth', 0.07, 140, D); } break;
        case 'warn': this.tone(196, t, 0.5, 'sawtooth', 0.1, 185); this.tone(196, t + 0.6, 0.5, 'sawtooth', 0.1, 185); break;
        case 'death': [392, 330, 262, 196].forEach((f, i) => this.tone(f, t + i * 0.16, 0.4, 'triangle', 0.14)); this.hiss(t, 1.2, 300, 0.5, 0.3, 'lowpass'); break;
        case 'pb': [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, t + i * 0.09, 0.4, 'triangle', 0.12)); break;
        case 'tap': this.tone(700, t, 0.05, 'sine', 0.06); break;
        case 'heal': if (this.gate(k, 260)) { const f = pick([880, 988, 1108]) * r; this.tone(f, t, 0.35, 'sine', 0.025); this.tone(f * 1.5, t + 0.05, 0.4, 'sine', 0.018); this.hiss(t, 0.3, 7000, 1, 0.012, 'highpass'); } break;   // Mizard heal: soft sparkle chime
      }
    }
    // gentle procedural war-drum loop; intensity 0..1 adds layers instead of restarting
    tick(intensity, playing) {
      if (!this.ctx || !this.music || !playing) return;
      this.intensity += (intensity - this.intensity) * 0.02;
      const c = this.ctx, bpm = 96 + this.intensity * 30, spb = 60 / bpm / 2;
      while (this.nextBeat < c.currentTime + 0.15) {
        const t = this.nextBeat, b = this.beat++ % 16, I = this.intensity;
        if (b % 8 === 0 || b === 11) this.tone(62, t, 0.3, 'sine', 0.5, 40, this.mus);
        if (b % 8 === 4) this.hiss(t, 0.12, 1400, 0.8, 0.22, 'bandpass', this.mus);
        if (I > 0.3 && b % 2 === 1) this.hiss(t, 0.03, 7000, 1, 0.06, 'highpass', this.mus);
        const scale = [0, 3, 5, 7, 10], root = 110 * (this.beat % 128 < 64 ? 1 : 0.89);
        if (b % 4 === 0) this.tone(root * Math.pow(2, scale[(b / 4 + Math.floor(this.beat / 16)) % 3] / 12), t, spb * 3.5, 'triangle', 0.09 + I * 0.05, 0, this.mus);
        if (I > 0.6 && b % 4 === 2) this.tone(root * 2 * Math.pow(2, scale[(this.beat >> 2) % 5] / 12), t, spb * 1.5, 'square', 0.025, 0, this.mus);
        this.nextBeat += spb;
      }
    }
  }
  KM.Audio = Audio;
  KM.haptic = (ms) => { try { const ua = navigator.userActivation; if (KM.save && KM.save.settings.haptics && navigator.vibrate && (!ua || ua.hasBeenActive)) navigator.vibrate(ms); } catch (e) { /* unsupported */ } };   // browsers refuse vibration before the first real tap
})(window);
