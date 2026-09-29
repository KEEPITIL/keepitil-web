/* Procedural spatial audio (Web Audio). No music loop: the drone, silence and located sounds do the work. */
(function () {
  const A = T13.audio = {};
  let ac = null, master, droneGain, droneF, heartGain, listenerOk = false;
  const noiseBuf = () => { const b = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; };
  let NB;
  A.init = () => {
    if (ac) { if (ac.state === 'suspended') ac.resume().catch(() => {}); return; }
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    NB = noiseBuf();
    master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
    // low drone: two detuned oscillators through a moving low-pass
    droneGain = ac.createGain(); droneGain.gain.value = 0; droneF = ac.createBiquadFilter(); droneF.type = 'lowpass'; droneF.frequency.value = 180;
    [41, 41.7, 55.2].forEach(f => { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(droneF); o.start(); });
    const air = ac.createBufferSource(); air.buffer = NB; air.loop = true; const af = ac.createBiquadFilter(); af.type = 'bandpass'; af.frequency.value = 400; af.Q.value = 0.6; const ag = ac.createGain(); ag.gain.value = 0.035; air.connect(af).connect(ag).connect(master); air.start();
    droneF.connect(droneGain).connect(master);
    heartGain = ac.createGain(); heartGain.gain.value = 0; heartGain.connect(master);
    listenerOk = !!ac.listener;
    if (ac.state === 'suspended') ac.resume().catch(() => {});
  };
  A.ready = () => !!ac;
  A.setListener = (x, y, z, yaw) => {
    if (!ac || !listenerOk) return; const L = ac.listener, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    if (L.positionX) { L.positionX.value = x; L.positionY.value = y; L.positionZ.value = z; L.forwardX.value = fx; L.forwardY.value = 0; L.forwardZ.value = fz; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
    else { L.setPosition(x, y, z); L.setOrientation(fx, 0, fz, 0, 1, 0); }
  };
  const panner = (x, y, z) => { const p = ac.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 2; p.maxDistance = 60; p.rolloffFactor = 1.3; if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z); p.connect(master); return p; };
  const burst = (dest, { dur = 0.12, f = 200, q = 1, type = 'lowpass', vol = 0.5, at = 0 }) => {
    const t = ac.currentTime + at, s = ac.createBufferSource(); s.buffer = NB; const bf = ac.createBiquadFilter(); bf.type = type; bf.frequency.value = f; bf.Q.value = q; const g = ac.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bf).connect(g).connect(dest); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  };
  const tone = (dest, { f = 80, f2 = null, dur = 0.3, vol = 0.4, type = 'sine', at = 0 }) => {
    const t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
  };
  A.step = (x, y, z, heavy = false, vol = 0.35) => { if (!ac) return; const p = panner(x, y, z); burst(p, { dur: heavy ? 0.22 : 0.09, f: heavy ? 140 : 900, q: heavy ? 2 : 0.7, vol: heavy ? vol * 1.8 : vol }); if (heavy) tone(p, { f: 55, dur: 0.25, vol: vol }); };
  A.myStep = (run, crouch) => { if (!ac) return; burst(master, { dur: 0.07, f: run ? 1400 : 800, q: 0.6, vol: crouch ? 0.03 : run ? 0.14 : 0.07 }); };
  A.door = (x, y, z, slam = false) => { if (!ac) return; const p = panner(x, y, z); if (slam) { burst(p, { dur: 0.35, f: 120, q: 1, vol: 1.1 }); tone(p, { f: 70, f2: 40, dur: 0.4, vol: 0.6 }); } else { tone(p, { f: 320, f2: 180, dur: 0.7, vol: 0.12, type: 'triangle' }); tone(p, { f: 410, f2: 260, dur: 0.6, vol: 0.06, type: 'sawtooth', at: 0.1 }); } };
  A.whisper = (x, y, z) => { if (!ac) return; const p = panner(x, y, z); for (let i = 0; i < 6; i++) burst(p, { dur: 0.18 + Math.random() * 0.2, f: 1800 + Math.random() * 2500, q: 6, type: 'bandpass', vol: 0.22, at: i * 0.16 }); };
  A.staticBurst = () => { if (!ac) return; burst(master, { dur: 0.9, f: 3000, q: 0.4, type: 'bandpass', vol: 0.18 }); };
  A.creak = (x, y, z) => { if (!ac) return; const p = panner(x, y, z); tone(p, { f: 180, f2: 120, dur: 1.2, vol: 0.12, type: 'sawtooth' }); };
  A.sting = () => { if (!ac) return; tone(master, { f: 900, f2: 1250, dur: 0.9, vol: 0.18, type: 'sawtooth' }); tone(master, { f: 950, f2: 1310, dur: 0.9, vol: 0.14, type: 'square' }); burst(master, { dur: 0.6, f: 500, q: 0.5, vol: 0.5 }); };
  A.growl = (x, y, z) => { if (!ac) return; const p = panner(x, y, z); tone(p, { f: 60, f2: 38, dur: 1.4, vol: 0.5, type: 'sawtooth' }); burst(p, { dur: 1.2, f: 300, q: 3, type: 'bandpass', vol: 0.4 }); };
  A.power = (on) => { if (!ac) return; tone(master, on ? { f: 50, f2: 120, dur: 1.5, vol: 0.3, type: 'sawtooth' } : { f: 120, f2: 40, dur: 1.2, vol: 0.3, type: 'sawtooth' }); };
  A.ability = (kind) => { if (!ac) return; const f = { mara: [300, 900], gabriel: [80, 30], daniel: [1200, 400] }[kind] || [400, 400]; tone(master, { f: f[0], f2: f[1], dur: 0.8, vol: 0.25, type: kind === 'gabriel' ? 'square' : 'sine' }); burst(master, { dur: 0.5, f: f[0] * 2, q: 2, type: 'bandpass', vol: 0.15 }); };
  A.pickup = () => { if (!ac) return; tone(master, { f: 660, dur: 0.15, vol: 0.12, type: 'triangle' }); tone(master, { f: 990, dur: 0.25, vol: 0.1, type: 'triangle', at: 0.1 }); };
  A.error = () => { if (!ac) return; tone(master, { f: 140, dur: 0.25, vol: 0.2, type: 'square' }); };
  /* intensity 0..1 drives the drone; silence (drone dropping out) is itself a signal */
  A.setIntensity = (k, silence = false) => { if (!ac) return; const t = ac.currentTime; droneGain.gain.setTargetAtTime(silence ? 0 : 0.02 + k * 0.1, t, 0.8); droneF.frequency.setTargetAtTime(120 + k * 500, t, 1.2); };
  A.heart = (rate) => { if (!ac || rate <= 0) return; tone(heartGain, { f: 55, dur: 0.12, vol: 0.9 }); tone(heartGain, { f: 48, dur: 0.14, vol: 0.7, at: 0.18 }); heartGain.gain.setTargetAtTime(Math.min(0.5, rate), ac.currentTime, 0.1); };
  /* a false sibling voice — speech synthesis, pitched down and quiet (browsers that lack it simply get a whisper) */
  A.falseVoice = (text) => { try { if (!('speechSynthesis' in window)) return false; const u = new SpeechSynthesisUtterance(text); u.pitch = 0.35; u.rate = 0.78; u.volume = 0.55; speechSynthesis.cancel(); speechSynthesis.speak(u); return true; } catch (e) { return false; } };
})();
