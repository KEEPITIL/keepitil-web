/* Authoritative song clock. Gameplay time is derived ONLY from the AudioContext's DSP clock:
   - render time  = song position currently audible at the speaker (getOutputTimestamp maps the DSP
                    clock to performance.now, which already folds in output latency)
   - judge time   = audible song position at the input event's own timestamp − calibrated offset
   Frame rate never advances the song; a dropped frame just renders a later audio position. */
export class SongClock {
  constructor() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    if (navigator.audioSession) try { navigator.audioSession.type = 'playback'; } catch {}
    this.music = this.ctx.createGain(); this.sfx = this.ctx.createGain();
    this.music.connect(this.ctx.destination); this.sfx.connect(this.ctx.destination);
    this.src = null; this.startCtx = 0; this.pausedAt = null; this.buffer = null;
    this.inputOffset = 0;     // seconds; + means the player hits late on this output
    this.smooth = null;
  }
  setVolumes(music, sfx) { this.music.gain.value = music; this.sfx.gain.value = sfx; }

  /* DSP-time → performance.now mapping. */
  _audibleCtxAt(perfMs) {
    const c = this.ctx;
    const ts = c.getOutputTimestamp ? c.getOutputTimestamp() : null;
    if (ts && ts.performanceTime > 0 && ts.contextTime > 0) return ts.contextTime + (perfMs - ts.performanceTime) / 1000;
    return c.currentTime - (c.outputLatency || c.baseLatency || 0) + (perfMs - performance.now()) / 1000;
  }
  songTimeAt(perfMs) {
    if (this.pausedAt != null) return this.pausedAt;
    return this._audibleCtxAt(perfMs) - this.startCtx;
  }
  /* For rendering: lightly smoothed so getOutputTimestamp quantisation does not jitter notes, but
     re-anchored every frame to the audio clock (no accumulation, no drift). */
  renderTime(perfMs = performance.now()) {
    const raw = this.songTimeAt(perfMs);
    if (this.pausedAt != null || this.smooth == null || Math.abs(raw - this.smooth.v) > 0.05) { this.smooth = { v: raw, p: perfMs }; return raw; }
    const pred = this.smooth.v + (perfMs - this.smooth.p) / 1000;
    const v = pred + (raw - pred) * 0.15;
    this.smooth = { v, p: perfMs };
    return v;
  }
  judgeTimeAt(perfMs) { return this.songTimeAt(perfMs) - this.inputOffset; }

  async unlock() { if (this.ctx.state !== 'running') await this.ctx.resume(); }

  async decode(arrayBuffer) { return await this.ctx.decodeAudioData(arrayBuffer); }
  bufferFromPCM(pcm, sampleRate) {
    const b = this.ctx.createBuffer(1, pcm.length, sampleRate); b.copyToChannel(pcm, 0); return b;
  }

  /* Starts the buffer so that song time 0 is `lead` seconds in the future (countdown). */
  play(buffer, lead = 3, from = 0) {
    this.stop();
    this.buffer = buffer;
    const s = this.ctx.createBufferSource(); s.buffer = buffer; s.connect(this.music);
    const when = this.ctx.currentTime + lead;
    this.startCtx = when - from + 0;    // ctx time at which song position 0 plays
    s.start(when, Math.max(0, from)); this.src = s; this.pausedAt = null; this.smooth = null;
    return s;
  }
  pause() {
    if (!this.src || this.pausedAt != null) return;
    this.pausedAt = Math.max(0, this.songTimeAt(performance.now()));
    try { this.src.stop(); } catch {}
    this.src = null;
  }
  resume(lead = 1.5) { if (this.pausedAt == null || !this.buffer) return; const at = this.pausedAt; this.play(this.buffer, lead, at); }
  stop() { if (this.src) { try { this.src.stop(); } catch {} this.src.disconnect(); } this.src = null; }

  click(when, accent = false) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.value = accent ? 1760 : 1175; o.connect(g); g.connect(this.sfx);
    g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(0.6, when + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.07);
    o.start(when); o.stop(when + 0.08);
  }
  tick(gain = 0.12) {   // hit sound, sfx bus
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(400, t + 0.05);
    o.connect(g); g.connect(this.sfx); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.start(t); o.stop(t + 0.07);
  }
}

/* Calibration: plays a metronome on the DSP clock; taps are converted to DSP time through the same
   mapping gameplay uses. Offset = median(tap − beat) after discarding the first 4 beats. */
export function runCalibration(clock, { bpm = 100, beats = 20, onBeat } = {}) {
  const per = 60 / bpm, start = clock.ctx.currentTime + 0.6, taps = [];
  for (let i = 0; i < beats; i++) clock.click(start + i * per, i % 4 === 0);
  const audibleStart = start + ((clock.ctx.outputLatency || 0));
  let timer = setInterval(() => { const k = Math.floor((clock.ctx.currentTime - start) / per); onBeat && onBeat(k); }, 30);
  return {
    tap(perfMs) { taps.push(clock._audibleCtxAt(perfMs)); },
    finish() {
      clearInterval(timer);
      const d = taps.map(t => { const k = Math.round((t - start) / per); return { k, d: t - (start + k * per) }; })
        .filter(x => x.k >= 4 && x.k < beats && Math.abs(x.d) < per / 2).map(x => x.d).sort((a, b) => a - b);
      if (d.length < 6) return { ok: false, n: d.length };
      const med = d[Math.floor(d.length / 2)];
      const mad = d.map(x => Math.abs(x - med)).sort((a, b) => a - b)[Math.floor(d.length / 2)];
      return { ok: true, offset: med, spread: mad, n: d.length, audibleStart };
    },
    duration: (beats * per + 0.8) * 1000,
  };
}
