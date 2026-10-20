/* KMOB audio — synthesized WebAudio effects plus one music file (assets/audio/moove-it.m4a). Every category is voice-limited so 500 soldiers
   never produce 500 overlapping sounds; music is a low, slowly-intensifying loop tied to battle pressure. */
(function (G) {
  const KM = G.KM, PRIORITY = { lhit: 1, boom: 1, cannon: 1, elite: 1, warn: 1, death: 1, pb: 1, tap: 1, upgrade: 1, build: 1, pw_lb: 1, pw_as: 1, pw_rain: 1, pw_el: 1, pw_mc: 1, pw_fo: 1, c_warcry: 1, c_titan: 1, c_barrage: 1, c_fortress: 1, c_rapid: 1, c_contract: 1 };   // + tank powers: never dropped by the voice budget   // tank damage, explosions, the cannon, boss / UI cues
  const MUSIC = { src: 'assets/audio/moove-it.m4a', start: 1.0611 + 17 * 1.875, bar: 1.875, bars: 59, gain: 0.6 };   // (owner audio review) skip the slow intro: start at the drop (bar 17, 32.9 s) and loop bars 17–76 of the 145.4 s master
  // BOSS MUSIC (owner audio review 2026-10-19): KEEPITIL's own KBeats tracks, one per boss in rotation, each looping its most energetic
  // bar-aligned section; crossfaded in when a boss fight starts and back to the battle music (which keeps its place) when it ends.
  const BOSS = [{ src: 'assets/audio/boss-woof-woof.m4a', start: 54.427, end: 73.627 }, { src: 'assets/audio/boss-quack-quack.m4a', start: 81.098, end: 94.339 }, { src: 'assets/audio/boss-fcawf-fcawf.m4a', start: 113.533, end: 135.518 }];
  class Audio {
    constructor() { this.ctx = null; this.on = true; this.music = true; this.last = {}; this.intensity = 0; }
    unlock() {
      // iOS leaves the context 'interrupted' after a call / Siri / alarm; any non-running state is resumed unless the game holds it paused
      if (this.ctx) { if (this.ctx.state !== 'running' && this.ctx.state !== 'closed' && !this.held) this.ctx.resume().catch(() => {}); return; }
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const c = this.ctx = new AC();
      c.onstatechange = () => { if (c.state === 'interrupted' || (c.state === 'suspended' && !this.held && !document.hidden)) setTimeout(() => { if (!this.held && !document.hidden && c.state !== 'running') c.resume().catch(() => {}); }, 400); };
      this.master = c.createGain(); this.master.gain.value = 0.8;
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; this.master.connect(comp); comp.connect(c.destination);
      this.sfx = c.createGain(); this.sfx.gain.value = this.on ? 0.9 : 0; this.sfx.connect(this.master);
      this.mus = c.createGain(); this.mus.gain.value = this.music ? 0.32 : 0; this.mus.connect(this.master);
      const len = c.sampleRate * 0.5, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; this.noise = buf;
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* optional */ }
      this.beat = 0; this.nextBeat = c.currentTime + 0.1;
      // layered crowd beds: one continuous source per layer instead of one sound per soldier
      const bed = (type, freq, q) => { const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = c.createGain(); g.gain.value = 0; src.connect(f); f.connect(g); g.connect(this.sfx); src.start(); return g; };
      this.beds = null; void bed;   // crowd beds REMOVED (owner audio review 2026-10-19): no continuous noise layers
      this.coinCombo = 0; this.coinT = 0;
      // GAMEPLAY MUSIC: "MOOOVE IT" by KEEPITIL (KBeats catalogue, 128 BPM). Decoded once, looped bar-aligned while a battle runs;
      // the synthesized drum loop below plays only until it is ready (or if it cannot load, e.g. offline on the first web visit).
      fetch(MUSIC.src).then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status)).then(a => new Promise((ok, no) => c.decodeAudioData(a, ok, no))).then(b => { this.track = b; }, () => { /* fallback loop */ });
      // dense combat one-shots pre-rendered once (pure synthesis, no assets) and replayed with pitch variation:
      // 2 nodes per sound instead of 5-13, so big fights stay under iOS's audio rate limits
      const SR = c.sampleRate, mk = (sec, fn) => { const n = Math.floor(SR * sec), b = c.createBuffer(1, n, SR), d = b.getChannelData(0); fn(d, n, SR); let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(d[i])); if (pk) for (let i = 0; i < n; i++) d[i] /= pk; return b; };
      const noise = () => Math.random() * 2 - 1;
      this.buf = {
        steel: mk(0.4, (d, n, S) => { const P = [1, 2.76, 5.4, 8.93]; for (let i = 0; i < n; i++) { const s = i / S; let v = 0; for (let j = 0; j < 4; j++) v += Math.sin(2 * Math.PI * 1000 * P[j] * s) * Math.exp(-s / (0.05 / (1 + j * 0.6))) / (1 + j * 1.4); d[i] = v; } let h = 0; for (let i = 0; i < Math.min(n, S * 0.03); i++) { const x = noise(); d[i] += (x - h) * 0.25 * (1 - i / (S * 0.03)); h = x; } }),
        cannon: mk(0.75, (d, n, S) => { let lp = 0, lp2 = 0, ph = 0, hp = 0; for (let i = 0; i < n; i++) { const s = i / S, f = 95 * Math.pow(38 / 95, Math.min(1, s / 0.38)); ph += 2 * Math.PI * f / S; const x = noise(); lp += (x - lp) * 0.07; lp2 += (x - lp2) * 0.035;
          d[i] = Math.sin(ph) * Math.exp(-s / 0.12) * 1.1 + lp * 2.2 * Math.exp(-s / 0.1) + lp2 * 1.2 * Math.exp(-Math.max(0, s - 0.06) / 0.18) * (s > 0.06) + (s < 0.05 ? (x - hp) * 0.35 * (1 - s / 0.05) : 0); hp = x; } }),
        hit: mk(0.12, (d, n, S) => { let a = 0, b = 0, ph = 0; for (let i = 0; i < n; i++) { const s = i / S, x = noise(); a += (x - a) * 0.15; b += (a - b) * 0.05; ph += 2 * Math.PI * (140 * Math.pow(90 / 140, Math.min(1, s / 0.06))) / S;
          d[i] = (a - b) * 3 * Math.exp(-s / 0.015) + Math.sin(ph) * 0.5 * Math.exp(-s / 0.02); } }),
      };
    }
    setSound(v) { this.on = !!v; if (this.sfx) this.sfx.gain.value = v ? 0.9 : 0; }
    setMusic(v) { this.music = !!v; if (this.mus) this.mus.gain.value = v ? 0.32 : 0; }
    stopMusic() { for (const k of ['song', 'bossSong']) if (this[k]) { try { this[k].stop(); } catch (e) { /* already stopped */ } this[k] = null; } this.inBoss = false; }
    // boss fight on/off: 1.5 s crossfade into the next boss track (rotating), 2 s back; battle music keeps playing silently underneath
    boss(on) { if (!this.ctx || !this.music) return; const c = this.ctx, now = c.currentTime;
      if (on && !this.inBoss) { this.inBoss = true; const B = BOSS[(this.bossN = ((this.bossN ?? -1) + 1) % BOSS.length)], go = buf => { if (!this.inBoss || this.bossSong) return;
          const src = c.createBufferSource(), g = c.createGain(), t0 = c.currentTime; src.buffer = buf; src.loop = true; src.loopStart = B.start; src.loopEnd = Math.min(buf.duration, B.end);
          g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(MUSIC.gain, t0 + 1.5); src.connect(g); g.connect(this.mus); src.start(t0, B.start); this.bossSong = src; this.bossGain = g;
          if (this.songGain) { this.songGain.gain.setValueAtTime(this.songGain.gain.value, t0); this.songGain.gain.linearRampToValueAtTime(0.0001, t0 + 1.5); } };
        (this.bossBufs = this.bossBufs || {})[B.src] ? go(this.bossBufs[B.src]) : fetch(B.src).then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status)).then(a => new Promise((ok, no) => c.decodeAudioData(a, ok, no))).then(b => { this.bossBufs[B.src] = b; go(b); }, () => { /* offline: battle music continues */ }); }
      if (!on && this.inBoss) { this.inBoss = false; const s0 = this.bossSong, g0 = this.bossGain; this.bossSong = null;
        if (g0) { g0.gain.setValueAtTime(g0.gain.value, now); g0.gain.linearRampToValueAtTime(0.0001, now + 2); setTimeout(() => { try { s0.stop(); } catch (e) { /* stopped */ } }, 2300); }
        if (this.songGain) { this.songGain.gain.setValueAtTime(this.songGain.gain.value, now); this.songGain.gain.linearRampToValueAtTime(MUSIC.gain, now + 2); } } }   // menus / results: the next battle starts the song from its first downbeat
    suspend(s) { this.held = !!s; if (!this.ctx) return; (s ? this.ctx.suspend() : this.ctx.resume()).catch(() => {}); }
    gate(k, ms) { const n = performance.now(); if (n - (this.last[k] || 0) < ms) return false; if (!PRIORITY[k] && this.ctx && !this.voice(k === 'boom' || k === 'cannon' ? 0.45 : 0.22)) return false; this.last[k] = n; return true; }   // the voice budget is only spent by sounds that will play; priority sounds never wait for it
    // pan helper: route a one-shot through a stereo panner (pseudo-spatial for towers, bosses, launcher)
    // nine persistent panners (pan quantised to 0.25) instead of a new node + timer per positioned sound
    out(pan) { if (pan == null || !this.ctx.createStereoPanner) return this.sfx; const i = Math.round((Math.max(-1, Math.min(1, pan)) + 1) * 4), P = this.pans || (this.pans = []);
      if (!P[i]) { this.made = (this.made || 0) + 1; const p = P[i] = this.ctx.createStereoPanner(); p.pan.value = i / 4 - 1; p.connect(this.sfx); } return P[i]; }
    // combat intensity 0..1 → four bands (light / moderate / heavy / massive clash), smoothed so beds never pump
    crowd(level, marching) {
      if (!this.ctx || !this.beds) return; const t = this.ctx.currentTime, band = level < 0.08 ? 0 : level < 0.3 ? 1 : level < 0.6 ? 2 : level < 0.85 ? 3 : 4;
      const g = (n, v) => n.gain.setTargetAtTime(this.on ? v : 0, t, 0.35);
      g(this.beds.march, 0.05 + Math.min(1, marching) * 0.07); g(this.beds.clash, [0, 0.03, 0.06, 0.09, 0.12][band]); g(this.beds.roar, [0, 0, 0.03, 0.06, 0.1][band]); this.band = band;
    }
    tone(f, t, dur, type, vol, f2, dest) {
      this.made = (this.made || 0) + 2; const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || this.sfx); o.start(t); o.stop(t + dur + 0.02);
    }
    hiss(t, dur, freq, q, vol, type, dest) {
      this.made = (this.made || 0) + 3; const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = this.noise; f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f); f.connect(g); g.connect(dest || this.sfx); s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.02);
    }
    shot(name, t, rate, vol, dest) { const b = this.buf && this.buf[name]; if (!b) return false; this.made = (this.made || 0) + 2; const c = this.ctx, s = c.createBufferSource(), g = c.createGain();
      s.buffer = b; s.playbackRate.value = rate; g.gain.value = vol; s.connect(g); g.connect(dest || this.sfx); s.start(t); s.stop(t + b.duration / rate + 0.02); return true; }
    // metallic strike: a few inharmonic partials (struck steel, not a beep) + a short bright noise transient; base pitch varies per hit
    metal(t, base, vol, dest) { if (this.shot('steel', t, base / 1000 * (1 + (Math.random() - 0.5) * 0.02), vol * 1.4, dest)) return; const P = [1, 2.76, 5.4, 8.93]; for (let i = 0; i < P.length; i++) this.tone(base * P[i] * (1 + (Math.random() - 0.5) * 0.02), t, 0.22 / (1 + i * 0.6), i ? 'sine' : 'triangle', vol / (1 + i * 1.4), 0, dest); this.hiss(t, 0.03, 5200 + Math.random() * 1800, 3, vol * 1.2, 'bandpass', dest); }
    // global voice budget: dense battles never stack dozens of one-shots
    voice(n) { const now = this.ctx.currentTime; this.vq = (this.vq || []).filter(e => e > now); if (this.vq.length > 22) return false; this.vq.push(now + (n || 0.25)); return true; }
    play(k, v, pan) {
      if (!this.ctx || !this.on) return; const m0 = this.made || 0; const t = this.ctx.currentTime, r = 1 + (Math.random() - 0.5) * 0.12, D = pan == null ? undefined : this.out(pan), pick = a => a[Math.floor(Math.random() * a.length)];
      switch (k) {
        case 'deploy': if (this.gate(k, 70)) { this.tone(180 * r, t, 0.09, 'sine', 0.12, 70); this.hiss(t, 0.05, 1800, 1, 0.05); } break;
        case 'hit': if (this.gate(k, 45) && !this.shot('hit', t, r * (0.85 + Math.random() * 0.4), 0.11)) { this.hiss(t, 0.05, 700 * r + Math.random() * 500, 1.5, 0.1); this.tone(140 * r, t, 0.06, 'sine', 0.05, 90); } break;   // body blow: dull slap + low knock
        case 'clang': if (this.gate(k, 90)) this.metal(t + Math.random() * 0.012, pick([820, 940, 1060, 1180]) * r, 0.05); break;   // sword on sword / shield: struck steel, four voicings
        case 'kill': if (this.gate(k, 55)) { this.hiss(t, 0.12, 420 * r, 1.2, 0.07, 'lowpass'); this.tone(pick([180, 200, 225]) * r, t, 0.14, 'sawtooth', 0.025, 110); } break;   // a short grunt + fall, not a beep
        case 'coin': if (this.gate(k, 60)) { const now = performance.now(); this.coinCombo = now - this.coinT < 500 ? Math.min(12, this.coinCombo + 1) : 0; this.coinT = now; const cp = Math.pow(2, this.coinCombo / 12); this.tone(1320 * cp, t, 0.07, 'sine', 0.07); this.tone(1980 * cp, t + 0.05, 0.12, 'sine', 0.06); } break;
        case 'bow': if (this.gate(k, 80)) { const f = pick([196, 220, 247]) * r; this.tone(f, t, 0.1, 'triangle', 0.14, f * 0.6); this.tone(110 * r, t, 0.06, 'sine', 0.14, 70); this.hiss(t, 0.035, 3800, 2, 0.12, 'highpass'); this.hiss(t + 0.02, 0.2, 1700 * r, 0.9, 0.1, 'bandpass'); } break;   // (owner: IMPROVE) taut string snap + low thump + louder arrow whoosh
        case 'cannon': if (this.gate(k, 120)) { if (!this.shot('cannon', t, r, 0.36, D)) { this.hiss(t, 0.05, 2600, 0.7, 0.18, 'highpass', D); this.tone(95 * r, t, 0.38, 'sine', 0.32, 38, D); this.hiss(t, 0.42, 520, 0.7, 0.18, 'lowpass', D); this.hiss(t + 0.06, 0.6, 260, 0.5, 0.06, 'lowpass', D); } this.tone(48 * r, t, 0.3, 'sine', 0.3, 30, D); this.hiss(t + 0.01, 0.07, 4200, 1.4, 0.06, 'highpass', D); } break;   // (owner: IMPROVE) report + added sub punch + sharper crack
        case 'snipe': if (this.gate(k, 200)) { this.tone(2400, t, 0.08, 'square', 0.05, 600, D); this.hiss(t, 0.18, 3000, 2, 0.12, 'bandpass', D); } break;
        case 'tower': if (this.gate(k, 140)) this.hiss(t, 0.07, 2200, 3, 0.05, 'highpass', D); break;
        case 'build': [392, 523, 659].forEach((f, i) => this.tone(f, t + i * 0.07, 0.2, 'triangle', 0.1, 0, D)); this.hiss(t, 0.3, 800, 0.6, 0.12, 'lowpass', D); break;
        case 'shieldhit': if (this.gate(k, 110)) { if (!this.shot('steel', t, pick([520, 600, 680]) * r / 1000, 0.05)) this.metal(t, pick([520, 600, 680]) * r, 0.035); this.shot('hit', t, 0.6 * r, 0.05); } break;   // pike / blade on a wooden-rimmed shield: lower ring + wood knock
        case 'thud': if (this.gate(k, 140)) { this.tone(pick([70, 78, 86]) * r, t, 0.22, 'sine', 0.22, 38, D); this.hiss(t, 0.16, 360, 0.8, 0.14, 'lowpass', D); this.hiss(t + 0.03, 0.22, 1200, 0.6, 0.04, 'bandpass', D); } break;   // giant hammer: deep body + earth + debris
        case 'boom': if (this.gate(k, 100)) { this.hiss(t, 0.06, 1800, 0.6, 0.18, 'highpass'); this.tone(66 * r, t, 0.6, 'sine', 0.38, 28); this.tone(42 * r, t + 0.02, 0.8, 'sine', 0.3, 24); this.hiss(t, 0.8, 520, 0.6, 0.28, 'lowpass'); this.hiss(t + 0.08, 0.5, 3000, 1.5, 0.05, 'bandpass'); } break;   // (owner: IMPROVE) deeper double-layer blast + debris crackle
        case 'frost': if (this.gate(k, 140)) { this.tone(2200, t, 0.25, 'sine', 0.04, 3400); this.hiss(t, 0.2, 6000, 4, 0.04); } break;
        case 'lhit': if (this.gate(k, 160)) { this.tone(110, t, 0.2, 'sawtooth', 0.12, 60, D); this.hiss(t, 0.15, 500, 1, 0.15, 'lowpass', D); } break;
        case 'upgrade': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, t + i * 0.06, 0.25, 'triangle', 0.12)); this.hiss(t, 0.4, 5000, 0.8, 0.05, 'highpass'); break;
        case 'elite': if (this.gate(k, 1500)) { [98, 98.6, 147].forEach((f, i) => this.tone(f * 0.94, t + i * 0.03, 0.12, 'sawtooth', 0.1, f, D)); [98, 98.6, 147].forEach((f, i) => this.tone(f, t + 0.12 + i * 0.03, 0.85, 'sawtooth', 0.09, f * 0.97, D)); this.tone(62, t, 0.35, 'sine', 0.3, 40, D); this.hiss(t, 0.3, 700, 0.6, 0.08, 'lowpass', D); } break;   // (owner: IMPROVE) detuned brass horn with a scoop + war-drum hit
        case 'warn': for (let q = 0; q < 2; q++) { const u = t + q * 0.55; this.tone(196, u, 0.22, 'sawtooth', 0.07, 294); this.tone(294, u + 0.22, 0.26, 'sawtooth', 0.07, 196); this.tone(55, u, 0.3, 'sine', 0.2, 38); } break;   // (owner: IMPROVE) rising-falling alarm, two pulses, each on a low drum
        case 'death': [392, 330, 262, 196].forEach((f, i) => this.tone(f, t + i * 0.16, 0.4, 'triangle', 0.14)); this.hiss(t, 1.2, 300, 0.5, 0.3, 'lowpass'); break;
        case 'pb': [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, t + i * 0.09, 0.4, 'triangle', 0.12)); break;
        case 'tap': this.tone(700, t, 0.05, 'sine', 0.06); break;
        // TANK POWERS — one signature each, played at the moment the effect lands (sim emits once per activation / per volley)
        case 'pw_lb': this.tone(220, t, 0.18, 'sawtooth', 0.11, 1320, D); this.hiss(t, 0.18, 1200, 1.2, 0.06, 'bandpass', D); this.tone(58, t + 0.16, 0.8, 'sine', 0.42, 28, D); this.tone(40, t + 0.16, 0.9, 'sine', 0.3, 22, D); this.hiss(t + 0.16, 0.6, 2400, 0.5, 0.24, 'bandpass', D); this.hiss(t + 0.16, 0.08, 6000, 1, 0.12, 'highpass', D); this.metal(t + 0.17, 1320, 0.07); break;   // (owner: IMPROVE) longer charge → heavier sub impact + crack
        case 'pw_as': [660, 880].forEach((f, i) => this.tone(f, t + i * 0.09, 0.16, 'square', 0.06, f * 0.98, D)); for (let q = 0; q < 6; q++) { const f = 2400 + q * 260; this.tone(f, t + 0.2 + q * 0.05, 0.22, 'sine', 0.05, f * 0.45, D); } this.hiss(t, 0.7, 4200, 1.2, 0.12, 'highpass', D); break;   // (owner: IMPROVE) lock chirp + a sky full of falling arrow whistles + wind
        case 'pw_rain': if (this.gate(k, 120)) { for (let q = 0; q < 6; q++) this.hiss(t + q * 0.035, 0.04, 3000 + q * 300, 3, 0.05, 'highpass', D); this.tone(150, t + 0.24, 0.12, 'sine', 0.08, 90, D); } break;   // a volley lands: arrow hiss cascade + thuds
        case 'pw_el': this.hiss(t, 0.15, 400, 0.7, 0.08, 'lowpass', D); this.hiss(t + 0.1, 0.8, 900, 0.7, 0.34, 'lowpass', D); this.tone(70, t + 0.1, 0.6, 'sine', 0.22, 45, D); this.tone(1760, t + 0.1, 0.5, 'sine', 0.08, 2640, D); this.tone(2640, t + 0.18, 0.45, 'sine', 0.06, 3960, D); this.metal(t + 0.12, 2100, 0.05); break;   // (owner: IMPROVE) swelling wave with weight + brighter frost shimmer
        case 'pw_mc': [[196, 0], [294, 0.32]].forEach(([f, d]) => { this.tone(f * 0.95, t + d, 0.08, 'sawtooth', 0.09, f, D); this.tone(f, t + d + 0.08, 0.36, 'sawtooth', 0.1, f, D); this.tone(f * 1.006, t + d + 0.08, 0.36, 'sawtooth', 0.06, f, D); }); [0, 0.16, 0.32, 0.48, 0.64].forEach(d => this.tone(80, t + d, 0.12, 'sine', 0.26, 48, D)); break;   // (owner: IMPROVE) two-note war horn (root → fifth) over five marching drums
        case 'pw_fo': this.tone(110, t, 0.9, 'triangle', 0.14, 165, D); this.tone(330, t + 0.05, 0.8, 'sine', 0.05, 495, D); this.metal(t + 0.02, 760, 0.05); this.metal(t + 0.09, 1020, 0.04); break;   // FORTRESS SURGE: shield hum + bright clang
        // CONSUMABLES — five signatures distinct from the energy powers
        case 'c_warcry': [294, 370, 440, 587].forEach((f, i) => this.tone(f, t + i * 0.05, 0.6, 'sawtooth', 0.08, f * 1.08, D)); this.hiss(t, 0.5, 900, 0.7, 0.16, 'bandpass', D); this.hiss(t + 0.1, 0.4, 1800, 0.8, 0.12, 'bandpass', D); this.tone(62, t, 0.3, 'sine', 0.3, 40, D); break;   // (owner: IMPROVE) bigger rising roar chord + crowd shout + drum
        case 'c_titan': [0, 0.28, 0.56].forEach(d => this.tone(46, t + d, 0.3, 'sine', 0.4, 30, D)); this.tone(98, t + 0.6, 0.8, 'triangle', 0.12, 147, D); break;   // TITAN GIANT: three ground-shaking steps + call
        case 'c_barrage': for (let q = 0; q < 8; q++) { const u = t + q * 0.06; this.tone(170 - q * 10, u, 0.07, 'square', 0.08, 85, D); this.hiss(u, 0.04, 2400, 1, 0.1, 'highpass', D); this.tone(55, u, 0.08, 'sine', 0.14, 40, D); } this.metal(t, 1600, 0.06); break;   // (owner: IMPROVE) eight-shot rapid barrage, each with crack + thump
        case 'c_fortress': this.metal(t, 520, 0.11); this.metal(t + 0.14, 690, 0.1); this.tone(130, t, 0.8, 'triangle', 0.16, 130, D); this.tone(65, t, 0.8, 'sine', 0.2, 60, D); this.hiss(t + 0.14, 0.5, 5000, 1, 0.04, 'highpass', D); break;   // (owner: IMPROVE) heavier anvil strikes + low hold + armour shimmer
        case 'c_rapid': [880, 1175, 1568, 2093, 2637].forEach((f, i) => { this.tone(f, t + i * 0.035, 0.09, 'square', 0.022, f, D); this.hiss(t + i * 0.035, 0.02, 6000, 1, 0.025, 'highpass', D); }); this.hiss(t, 0.3, 6000, 1.5, 0.04, 'highpass', D); break;   // (owner: IMPROVE) louder up-arpeggio with a click per step
        case 'c_contract': this.metal(t, 1180, 0.09); this.tone(90, t, 0.2, 'sine', 0.24, 50, D); [220, 277, 330, 440].forEach((f, i) => { this.tone(f, t + 0.1 + i * 0.08, 0.32, 'sawtooth', 0.08, f, D); this.tone(f * 1.005, t + 0.1 + i * 0.08, 0.32, 'sawtooth', 0.04, f, D); }); [0.12, 0.32, 0.52].forEach(d => this.tone(70, t + d, 0.14, 'sine', 0.26, 45, D)); break;   // (owner: IMPROVE) seal strike + fuller fanfare + three drum hits
        case 'heal': if (this.gate(k, 260)) { const f = pick([880, 988, 1108]) * r; this.tone(f, t, 0.35, 'sine', 0.025); this.tone(f * 1.5, t + 0.05, 0.4, 'sine', 0.018); this.hiss(t, 0.3, 7000, 1, 0.012, 'highpass'); } break;   // Mizard heal: soft sparkle chime
      }
      if ((this.made || 0) > m0) { const P = this.perKey || (this.perKey = {}); P[k] = (P[k] || 0) + (this.made - m0); }
    }
    // battle music: the KEEPITIL song once it has loaded (intensity is no longer used)
    tick(intensity, playing) {
      if (!this.ctx || !this.music || !playing) return;
      if (this.track) { if (!this.song) { const c = this.ctx, src = c.createBufferSource(), g = c.createGain(); src.buffer = this.track; src.loop = true;
          src.loopStart = MUSIC.start; src.loopEnd = Math.min(this.track.duration, MUSIC.start + MUSIC.bars * MUSIC.bar); g.gain.value = this.inBoss ? 0.0001 : MUSIC.gain; src.connect(g); g.connect(this.mus); src.start(c.currentTime + 0.05, MUSIC.start); this.song = src; this.songGain = g; } }
      // the synthesized drum loop was REMOVED (owner audio review 2026-10-19): silence until the song has loaded
    }
  }
  KM.Audio = Audio;
  KM.haptic = (ms) => { try { const ua = navigator.userActivation; if (KM.save && KM.save.settings.haptics && navigator.vibrate && (!ua || ua.hasBeenActive)) navigator.vibrate(ms); } catch (e) { /* unsupported */ } };   // browsers refuse vibration before the first real tap
})(window);
