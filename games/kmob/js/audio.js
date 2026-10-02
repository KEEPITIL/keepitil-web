/* KMOB audio — fully synthesized WebAudio (no asset downloads). Every category is voice-limited so 500 soldiers
   never produce 500 overlapping sounds; music is a low, slowly-intensifying loop tied to battle pressure. */
(function (G) {
  const KM = G.KM;
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
    }
    setSound(v) { this.on = !!v; if (this.sfx) this.sfx.gain.value = v ? 0.9 : 0; }
    setMusic(v) { this.music = !!v; if (this.mus) this.mus.gain.value = v ? 0.32 : 0; }
    suspend(s) { if (!this.ctx) return; s ? this.ctx.suspend() : this.ctx.resume(); }
    gate(k, ms) { const n = performance.now(); if (n - (this.last[k] || 0) < ms) return false; this.last[k] = n; return true; }
    tone(f, t, dur, type, vol, f2, dest) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || this.sfx); o.start(t); o.stop(t + dur + 0.02);
    }
    hiss(t, dur, freq, q, vol, type, dest) {
      const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = this.noise; f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f); f.connect(g); g.connect(dest || this.sfx); s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.02);
    }
    play(k, v) {
      if (!this.ctx || !this.on) return; const t = this.ctx.currentTime, r = 1 + (Math.random() - 0.5) * 0.12;
      switch (k) {
        case 'deploy': if (this.gate(k, 70)) { this.tone(180 * r, t, 0.09, 'sine', 0.12, 70); this.hiss(t, 0.05, 1800, 1, 0.05); } break;
        case 'hit': if (this.gate(k, 45)) this.hiss(t, 0.06, 900 * r + Math.random() * 600, 2, 0.11); break;
        case 'clang': if (this.gate(k, 90)) { this.tone(1400 * r, t, 0.12, 'triangle', 0.05); this.hiss(t, 0.05, 4200, 6, 0.06); } break;
        case 'kill': if (this.gate(k, 55)) { this.tone(520 * r, t, 0.08, 'square', 0.035, 260); } break;
        case 'coin': if (this.gate(k, 60)) { this.tone(1320 * r, t, 0.07, 'sine', 0.07); this.tone(1980 * r, t + 0.05, 0.12, 'sine', 0.06); } break;
        case 'bow': if (this.gate(k, 80)) this.hiss(t, 0.08, 2600, 3, 0.05, 'highpass'); break;
        case 'cannon': if (this.gate(k, 120)) { this.tone(90, t, 0.35, 'sine', 0.3, 40); this.hiss(t, 0.3, 400, 0.7, 0.18, 'lowpass'); } break;
        case 'boom': if (this.gate(k, 100)) { this.tone(70, t, 0.5, 'sine', 0.35, 30); this.hiss(t, 0.45, 600, 0.6, 0.25, 'lowpass'); } break;
        case 'frost': if (this.gate(k, 140)) { this.tone(2200, t, 0.25, 'sine', 0.04, 3400); this.hiss(t, 0.2, 6000, 4, 0.04); } break;
        case 'lhit': if (this.gate(k, 160)) { this.tone(110, t, 0.2, 'sawtooth', 0.12, 60); this.hiss(t, 0.15, 500, 1, 0.15, 'lowpass'); } break;
        case 'upgrade': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, t + i * 0.06, 0.25, 'triangle', 0.12)); this.hiss(t, 0.4, 5000, 0.8, 0.05, 'highpass'); break;
        case 'offer': this.tone(880, t, 0.12, 'sine', 0.08); this.tone(1320, t + 0.08, 0.16, 'sine', 0.07); break;
        case 'elite': if (this.gate(k, 1500)) { this.tone(98, t, 0.9, 'sawtooth', 0.12, 92); this.tone(147, t + 0.05, 0.9, 'sawtooth', 0.07, 140); } break;
        case 'warn': this.tone(196, t, 0.5, 'sawtooth', 0.1, 185); this.tone(196, t + 0.6, 0.5, 'sawtooth', 0.1, 185); break;
        case 'death': [392, 330, 262, 196].forEach((f, i) => this.tone(f, t + i * 0.16, 0.4, 'triangle', 0.14)); this.hiss(t, 1.2, 300, 0.5, 0.3, 'lowpass'); break;
        case 'pb': [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, t + i * 0.09, 0.4, 'triangle', 0.12)); break;
        case 'tap': this.tone(700, t, 0.05, 'sine', 0.06); break;
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
  KM.haptic = (ms) => { try { if (KM.save && KM.save.settings.haptics && navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* unsupported */ } };
})(window);
