/* KBeats highway renderer (Canvas 2D). Original art: perspective four-lane highway on a dark arena floor,
   glowing capsule notes, chevron swipe notes, four large circular hit pads behind a lit strike bar,
   beat-driven equalizer skyline + crowd, hit shockwaves, combo milestones, Hype bar.
   Readability rules: lanes stay dark so notes are the brightest objects on screen; effects never sit on the
   note path above the strike bar; everything decorative honours effects / reducedMotion / reducedFlash.
   Every lane is told apart by colour AND glyph (◀ ▼ ▲ ▶), never colour alone.
   Draw cost is bounded: note/glow sprites are pre-rendered per lane, particles are pre-pooled. */
import { LANES } from './config.js';

const POOL = 360;

export class Highway {
  constructor(canvas, opts = {}) {
    this.c = canvas; this.g = canvas.getContext('2d', { alpha: false });
    this.opts = { effects: 1, reducedMotion: false, reducedFlash: false, ...opts };
    this.parts = Array.from({ length: POOL }, () => ({ life: 0 }));
    this.pi = 0; this.flash = [0, 0, 0, 0]; this.pressed = [false, false, false, false];
    this.judgeText = null; this.fps = 60; this._ft = []; this.quality = 1;
    this.rings = Array.from({ length: 16 }, () => ({ life: 0 })); this.ri = 0;   // hit shockwaves (pooled)
    this.milestone = null; this._lastCombo = 0;
    this.resize();
  }
  setOpts(o) { Object.assign(this.opts, o); this._bg = null; }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.c.clientWidth || innerWidth, h = this.c.clientHeight || innerHeight;
    this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr);
    this.dpr = dpr; this.W = w; this.H = h;
    const bw = Math.min(w * 0.97, h * 0.6, this.opts.maxBw || 640);
    // padPx (TV battle view): pads drawn at a target radius, never wider than their lane allows
    const padR = this.opts.padPx ? Math.min(this.opts.padPx, bw / 8 * 0.98) : bw / 8 * 0.88;
    this.geo = { cx: w / 2, topY: h * 0.12, hitY: h * 0.83, bw, tw: bw * 0.3, padR, hypeY: h * 0.94 };
    this._bg = null; this._sprites = null;
  }

  /* perspective: z=0 at the pads, z=1 at the horizon */
  f(z) { return (1 - z) / (1 + 2.4 * Math.max(-0.4, z)); }
  yAt(fz) { const { topY, hitY } = this.geo; return topY + (hitY - topY) * fz; }
  widthAt(fz) { const { tw, bw } = this.geo; return tw + (bw - tw) * fz; }
  laneX(lane, fz) { return this.geo.cx + ((lane + 0.5) / 4 - 0.5) * this.widthAt(fz); }
  laneAtX(x) { const { cx, bw } = this.geo; const l = Math.floor(((x - cx) / bw + 0.5) * 4); return Math.max(0, Math.min(3, l)); }

  _makeSprites() {
    const s = Math.round(this.geo.bw / 4 * 0.86 * this.dpr), out = [];
    for (const L of LANES) {
      const cv = document.createElement('canvas'); cv.width = s; cv.height = Math.round(s * 0.5);
      const g = cv.getContext('2d'); const h = cv.height;
      g.shadowColor = L.color; g.shadowBlur = h * 0.35;
      const r = h * 0.3, x0 = s * 0.08, x1 = s * 0.92, y0 = h * 0.14, y1 = h * 0.86;
      const grd = g.createLinearGradient(0, y0, 0, y1); grd.addColorStop(0, '#fff'); grd.addColorStop(0.35, L.color); grd.addColorStop(1, L.glow);
      g.fillStyle = grd; g.beginPath(); g.roundRect(x0, y0, x1 - x0, y1 - y0, r); g.fill();
      g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.roundRect(x0 + r * 0.6, y0 + 2, x1 - x0 - r * 1.2, (y1 - y0) * 0.28, r * 0.4); g.fill();
      g.fillStyle = 'rgba(0,0,0,.55)'; g.font = `900 ${Math.round(h * 0.32)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(L.glyph, s / 2, h * 0.52);
      out.push(cv);
    }
    this._sprites = out;
  }

  _makeBg() {
    const { W, H, dpr, geo } = this; const cv = document.createElement('canvas'); cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#05021a'); bg.addColorStop(0.42, '#150637'); bg.addColorStop(1, '#03020a');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // horizon glow behind the far end of the highway
    const hz = g.createRadialGradient(geo.cx, geo.topY, 0, geo.cx, geo.topY, Math.max(W, H) * 0.6);
    hz.addColorStop(0, 'rgba(160,80,255,.38)'); hz.addColorStop(0.35, 'rgba(60,40,200,.14)'); hz.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = hz; g.fillRect(0, 0, W, H);
    // arena floor grid fading into the horizon (either side of the highway)
    g.strokeStyle = 'rgba(120,90,255,.10)'; g.lineWidth = 1;
    for (let k = -12; k <= 12; k++) { g.beginPath(); g.moveTo(geo.cx + k * W * 0.012, geo.topY); g.lineTo(geo.cx + k * W * 0.16, H); g.stroke(); }
    for (let k = 1; k < 9; k++) { const y = geo.topY + (H - geo.topY) * Math.pow(k / 9, 2.2); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    // crowd silhouettes (deterministic), darker and lower so they frame rather than compete
    let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    g.fillStyle = '#05020e';
    for (let row = 0; row < 3; row++) {
      const base = H * (0.58 + row * 0.09);
      for (let x = -10; x < W + 20; x += 14 + r() * 10) {
        const hr = 6 + r() * 5 + row * 2, y = base - r() * 8;
        g.beginPath(); g.arc(x, y, hr, 0, Math.PI * 2); g.fill();
        g.fillRect(x - hr * 1.3, y + hr * 0.8, hr * 2.6, H);
        if (r() < 0.25) { g.save(); g.translate(x, y); g.rotate(-0.4 + r() * 0.8); g.fillRect(-2, -hr * 4, 4, hr * 3.2); g.restore(); }
      }
      g.fillStyle = row === 0 ? '#070313' : '#030209';
    }
    // vignette
    const vg = g.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.85);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
    this._bg = cv;
  }

  // beat-reactive equalizer skyline on the horizon (cheap: ~40 rects; frozen under reducedMotion)
  _skyline(now, pulse, energy, fx) {
    const { g, W, geo, opts } = this; const n = Math.max(16, Math.round(W / 34)), bw = W / n, base = geo.topY + 6;
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const d = Math.abs(i + 0.5 - n / 2) / (n / 2);                 // 0 centre → 1 edge
      const wob = opts.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(now * (1.3 + (i % 5) * 0.37) + i * 1.7);
      const h = (12 + 46 * energy * wob * (0.55 + 0.45 * pulse)) * (0.45 + 0.75 * d) * (0.4 + 0.6 * fx);
      const hue = 190 + (i / n) * 140;
      g.fillStyle = `hsla(${hue},95%,60%,${0.12 + 0.2 * pulse * fx})`;
      g.fillRect(i * bw + bw * 0.18, base - h, bw * 0.64, h);
    }
    g.globalCompositeOperation = 'source-over';
  }

  // expanding ring at a pad on every hit (Perfect = white core + lane colour)
  ring(lane, color, big) {
    const r = this.rings[this.ri = (this.ri + 1) % this.rings.length];
    r.lane = lane; r.c = color; r.life = r.max = big ? 0.34 : 0.26; r.big = big;
  }

  burst(lane, color, n = 18) {
    const { hitY } = this.geo, x = this.laneX(lane, 1);
    n = Math.round(n * this.opts.effects * this.quality);
    for (let k = 0; k < n; k++) {
      const p = this.parts[this.pi = (this.pi + 1) % POOL];
      const a = -Math.PI * (0.1 + 0.8 * Math.random()), v = 120 + Math.random() * 380;
      p.x = x; p.y = hitY; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; p.life = 0.35 + Math.random() * 0.35; p.max = p.life; p.c = color;
    }
  }

  feedback(ev, t) {
    if (ev.j === 'hype') { this.hypeFlash = 1; return; }
    const L = LANES[ev.lane] || LANES[0];
    if (ev.j !== 'miss') { this.flash[ev.lane] = 1; this.burst(ev.lane, ev.j === 'perfect' ? '#ffffff' : L.color, ev.j === 'perfect' ? 22 : 12); this.ring(ev.lane, L.color, ev.j === 'perfect'); }
    if (ev.kind === 'head' || ev.j === 'miss') this.judgeText = { j: ev.j, t };
  }

  draw(now, st) {
    // adaptive quality: if frames run long, shed cosmetic load (judgement never depends on this)
    const pn = performance.now(); if (this._last) { const dt = pn - this._last; this._ft.push(dt); if (this._ft.length > 60) this._ft.shift(); }
    this._last = pn;
    if (this._ft.length === 60) { const avg = this._ft.reduce((a, b) => a + b) / 60; this.fps = 1000 / avg; this.quality = avg > 22 ? Math.max(0.3, this.quality - 0.02) : Math.min(1, this.quality + 0.005); }
    const { g, W, H, dpr, geo, opts } = this;
    if (!this._bg) this._makeBg();
    if (!this._sprites) this._makeSprites();
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(this._bg, 0, 0); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const hype = st.hypeOn ? 1 : 0;
    const beat = st.bpm ? ((now - st.offset) * st.bpm / 60) : 0;
    const pulse = opts.reducedFlash ? 0.15 : Math.exp(-((beat % 1 + 1) % 1) * 5);
    const energy = st.energy ?? 0.5, fx = opts.effects * this.quality;
    // light beams
    g.globalCompositeOperation = 'lighter';
    const beams = Math.round(6 * fx);
    for (let i = 0; i < beams; i++) {
      const sx = W * (0.1 + i * 0.16), sw = opts.reducedMotion ? 0 : Math.sin(now * 0.6 + i) * 0.25;
      const a = (0.03 + 0.08 * energy * (0.6 + 0.4 * pulse) + 0.08 * hype) * (opts.reducedFlash ? 0.5 : 1);
      const grd = g.createLinearGradient(sx, 0, sx, H * 0.75); const hue = (i % 3 === 0 ? 190 : i % 3 === 1 ? 300 : 50);
      grd.addColorStop(0, `hsla(${hue},100%,65%,${a})`); grd.addColorStop(1, 'hsla(0,0%,0%,0)');
      g.fillStyle = grd; g.beginPath(); g.moveTo(sx - 6, 0); g.lineTo(sx + 6, 0); g.lineTo(sx + W * (sw + 0.12), H * 0.75); g.lineTo(sx + W * (sw - 0.12), H * 0.75); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    this._skyline(now, pulse, energy, fx);
    // highway body
    const fTop = this.f(1), fBot = this.f(-0.12);
    const quad = (fa, fb, xa0, xa1, xb0, xb1) => { g.beginPath(); g.moveTo(xa0, this.yAt(fa)); g.lineTo(xa1, this.yAt(fa)); g.lineTo(xb1, this.yAt(fb)); g.lineTo(xb0, this.yAt(fb)); g.closePath(); };
    const edgeX = (k, fz) => geo.cx + (k / 4 - 0.5) * this.widthAt(fz);
    quad(fTop, fBot, edgeX(0, fTop), edgeX(4, fTop), edgeX(0, fBot), edgeX(4, fBot));
    const hg = g.createLinearGradient(0, geo.topY, 0, geo.hitY); hg.addColorStop(0, 'rgba(6,4,22,.62)'); hg.addColorStop(1, 'rgba(8,5,26,.96)');
    g.fillStyle = hg; g.fill();
    for (let l = 0; l < 4; l++) {   // lane tint + held-lane glow
      const L = LANES[l]; const on = this.pressed[l] ? 0.22 : 0; const fl = this.flash[l];
      quad(fTop, fBot, edgeX(l, fTop), edgeX(l + 1, fTop), edgeX(l, fBot), edgeX(l + 1, fBot));
      const lg = g.createLinearGradient(0, geo.topY, 0, geo.hitY); lg.addColorStop(0, hexA(L.color, 0.0)); lg.addColorStop(0.55, hexA(L.color, 0.04 + on * 0.4 + fl * 0.1)); lg.addColorStop(1, hexA(L.color, 0.13 + on + fl * 0.3 + hype * 0.08));
      g.fillStyle = lg; g.fill();
    }
    g.lineWidth = 2;
    for (let k = 0; k <= 4; k++) {
      const L = LANES[Math.min(3, k)]; g.strokeStyle = k === 0 || k === 4 ? hexA(k ? LANES[3].color : LANES[0].color, 0.95) : 'rgba(255,255,255,.13)';
      g.shadowColor = g.strokeStyle; g.shadowBlur = k === 0 || k === 4 ? 12 * fx : 0;
      g.beginPath(); g.moveTo(edgeX(k, fTop), this.yAt(fTop)); g.lineTo(edgeX(k, fBot), this.yAt(fBot)); g.stroke();
      void L;
    }
    g.shadowBlur = 0;
    // beat lines
    if (st.bpm) {
      const per = 60 / st.bpm; let b = Math.ceil((now - st.offset) / per);
      for (; ; b++) { const tb = st.offset + b * per, z = (tb - now) / st.lead; if (z > 1) break; const fz = this.f(z);
        g.strokeStyle = `rgba(255,255,255,${b % 4 === 0 ? 0.16 : 0.06})`; g.lineWidth = b % 4 === 0 ? 2 : 1;
        g.beginPath(); g.moveTo(edgeX(0, fz), this.yAt(fz)); g.lineTo(edgeX(4, fz), this.yAt(fz)); g.stroke(); }
    }
    // notes (far → near)
    const notes = st.notes, lead = st.lead;
    while (st.cursor < notes.length && notes[st.cursor].t + (notes[st.cursor].dur || 0) < now - 0.35) st.cursor++;
    let end = st.cursor; while (end < notes.length && notes[end].t - now < lead) end++;
    for (let i = end - 1; i >= st.cursor; i--) {
      const n = notes[i]; if (n.state === 2) continue;
      const L = LANES[n.lane];
      if (n.type === 'hold') {
        const z0 = Math.max(n.state === 1 ? 0 : -0.12, (n.t - now) / lead), z1 = Math.min(1, (n.t + n.dur - now) / lead);
        if (z1 < z0) continue;
        const f0 = this.f(z0), f1 = this.f(z1), w0 = this.widthAt(f0) / 4 * 0.34, w1 = this.widthAt(f1) / 4 * 0.34;
        const x0 = this.laneX(n.lane, f0), x1 = this.laneX(n.lane, f1);
        g.beginPath(); g.moveTo(x0 - w0, this.yAt(f0)); g.lineTo(x1 - w1, this.yAt(f1)); g.lineTo(x1 + w1, this.yAt(f1)); g.lineTo(x0 + w0, this.yAt(f0)); g.closePath();
        const tg = g.createLinearGradient(0, this.yAt(f1), 0, this.yAt(f0)); tg.addColorStop(0, hexA(L.color, 0.15)); tg.addColorStop(1, hexA(L.color, n.state === 1 ? 0.95 : 0.6));
        g.fillStyle = tg; g.fill();
        if (n.state === 1) continue;
      }
      const z = (n.t - now) / lead; if (z < -0.15) continue;
      const fz = this.f(z), x = this.laneX(n.lane, fz), y = this.yAt(fz), w = this.widthAt(fz) / 4 * 0.9;
      if (n.type === 'swipe') this._chevron(x, y, w, L.color, n.dir);
      else { const sp = this._sprites[n.lane]; g.drawImage(sp, x - w / 2, y - w / 4, w, w / 2); }
    }
    // strike bar: a lit line across the highway at the hit point, breathing with the beat
    { const y = geo.hitY, x0 = edgeX(0, 1), x1 = edgeX(4, 1);
      g.globalCompositeOperation = 'lighter';
      const sb = g.createLinearGradient(x0, 0, x1, 0); LANES.forEach((L, i) => sb.addColorStop(i / 3, hexA(L.color, 0.55 + 0.35 * pulse)));
      g.fillStyle = sb; g.fillRect(x0, y - 2, x1 - x0, 4);
      const halo = g.createLinearGradient(0, y - geo.padR * 1.3, 0, y + 2); halo.addColorStop(0, 'rgba(255,255,255,0)'); halo.addColorStop(1, `rgba(190,170,255,${0.10 + 0.10 * pulse * fx})`);
      g.fillStyle = halo; g.fillRect(x0, y - geo.padR * 1.3, x1 - x0, geo.padR * 1.3);
      g.globalCompositeOperation = 'source-over'; }
    // hit pads
    for (let l = 0; l < 4; l++) {
      const L = LANES[l], x = this.laneX(l, 1), y = geo.hitY, r = geo.padR, p = this.pressed[l], fl = this.flash[l];
      g.shadowColor = L.color; g.shadowBlur = (14 + fl * 30 + (p ? 10 : 0)) * fx;
      const pg = g.createRadialGradient(x, y - r * 0.3, r * 0.1, x, y, r);
      pg.addColorStop(0, hexA(L.color, p ? 0.75 : 0.35)); pg.addColorStop(1, 'rgba(8,6,24,.92)');
      g.fillStyle = pg; g.beginPath(); g.arc(x, y, r * (p ? 0.95 : 1), 0, Math.PI * 2); g.fill();
      g.lineWidth = Math.max(3, r * 0.1); g.strokeStyle = L.color; g.stroke(); g.shadowBlur = 0;
      g.lineWidth = Math.max(4, r * 0.16); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#fff';
      this._arrow(x, y, r * 0.42, L.dir);
      if (!opts.reducedMotion && fx > 0.3) { g.lineWidth = 2; g.strokeStyle = hexA(L.color, 0.35 * pulse); g.beginPath(); g.arc(x, y, r * (1.08 + 0.1 * (1 - pulse)), 0, Math.PI * 2); g.stroke(); }
      this.flash[l] = Math.max(0, fl - 0.08);
    }
    // shockwave rings
    g.globalCompositeOperation = 'lighter';
    for (const rg of this.rings) { if (rg.life <= 0) continue; rg.life -= 1 / 60; const k = 1 - Math.max(0, rg.life) / rg.max;
      const x = this.laneX(rg.lane, 1), y = geo.hitY, r0 = geo.padR * (1 + k * (rg.big ? 0.9 : 0.6));
      g.lineWidth = Math.max(2, geo.padR * 0.14 * (1 - k)); g.strokeStyle = hexA(rg.big ? '#ffffff' : rg.c, (1 - k) * 0.85 * fx);
      g.beginPath(); g.arc(x, y, r0, 0, Math.PI * 2); g.stroke();
      if (rg.big) { g.strokeStyle = hexA(rg.c, (1 - k) * 0.7 * fx); g.lineWidth *= 0.6; g.beginPath(); g.arc(x, y, r0 * 1.12, 0, Math.PI * 2); g.stroke(); } }
    g.globalCompositeOperation = 'source-over';
    // particles
    g.globalCompositeOperation = 'lighter';
    const dt = 1 / 60;
    for (const p of this.parts) { if (p.life <= 0) continue; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 700 * dt;
      const a = Math.max(0, p.life / p.max), sz = 1.5 + 2.5 * a; g.fillStyle = hexA(p.c, a); g.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz); }
    g.globalCompositeOperation = 'source-over';
    // judgement: compact, just above the pads (off the far note path), outlined for contrast
    if (this.judgeText && now - this.judgeText.t < 0.5) {
      const a = 1 - (now - this.judgeText.t) / 0.5, j = this.judgeText.j, s = Math.min(W, 520) * 0.085 * (1 + (opts.reducedMotion ? 0 : 0.18 * a * a));
      const col = { perfect: ['#ff7ad9', '#ffffff', '#ffd6f5'], great: ['#22d3ee', '#ecfeff', '#a5f3fc'], good: ['#facc15', '#fefce8', '#fde68a'], miss: ['#64748b', '#e2e8f0', '#94a3b8'] }[j];
      const y = geo.hitY - geo.padR * 2.15;
      g.globalAlpha = Math.min(1, a * 1.6); g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `italic 900 ${s}px "Space Grotesk",system-ui,sans-serif`;
      g.lineWidth = Math.max(3, s * 0.12); g.strokeStyle = 'rgba(5,3,16,.85)'; g.lineJoin = 'round'; g.strokeText(j.toUpperCase(), geo.cx, y);
      const tg = g.createLinearGradient(0, y - s / 2, 0, y + s / 2); tg.addColorStop(0, col[1]); tg.addColorStop(1, col[2]);
      g.shadowColor = col[0]; g.shadowBlur = 18 * fx; g.fillStyle = tg; g.fillText(j.toUpperCase(), geo.cx, y); g.shadowBlur = 0;
      if (st.combo > 1 && j !== 'miss') { const cs = s * 0.55; g.font = `800 ${cs}px "Space Grotesk",system-ui,sans-serif`; g.strokeText(st.combo + ' COMBO', geo.cx, y + s * 0.78); g.fillStyle = '#fff'; g.fillText(st.combo + ' COMBO', geo.cx, y + s * 0.78); }
      g.globalAlpha = 1;
    }
    // combo milestones: 25, 50, then every 50
    { const c = st.combo || 0, ms = c >= 25 && (c === 25 || c % 50 === 0) ? c : 0;
      if (ms && ms !== this._lastCombo) { this.milestone = { n: ms, t: now }; this._lastCombo = ms; }
      if (c < this._lastCombo && c < 25) this._lastCombo = 0;
      const m = this.milestone;
      if (m && now - m.t < 1.1 && now >= m.t) {
        const k = (now - m.t) / 1.1, a = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85, s = Math.min(W, 560) * 0.11 * (opts.reducedMotion ? 1 : 0.85 + 0.25 * Math.min(1, k * 6));
        const y = geo.topY + (geo.hitY - geo.topY) * 0.16;
        g.globalAlpha = Math.max(0, a); g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `italic 900 ${s}px "Space Grotesk",system-ui,sans-serif`;
        const mg = g.createLinearGradient(geo.cx - s * 2, 0, geo.cx + s * 2, 0); mg.addColorStop(0, '#4cc9ff'); mg.addColorStop(0.5, '#ffffff'); mg.addColorStop(1, '#ff5ab4');
        g.lineWidth = Math.max(3, s * 0.1); g.strokeStyle = 'rgba(5,3,16,.8)'; g.strokeText(m.n + ' COMBO!', geo.cx, y);
        g.shadowColor = '#e540ff'; g.shadowBlur = 26 * fx; g.fillStyle = mg; g.fillText(m.n + ' COMBO!', geo.cx, y); g.shadowBlur = 0; g.globalAlpha = 1;
        if (!opts.reducedFlash && k < 0.3) { const eg = g.createLinearGradient(0, 0, W, 0); eg.addColorStop(0, `rgba(76,201,255,${0.22 * (1 - k / 0.3)})`); eg.addColorStop(0.12, 'rgba(0,0,0,0)'); eg.addColorStop(0.88, 'rgba(0,0,0,0)'); eg.addColorStop(1, `rgba(255,90,180,${0.22 * (1 - k / 0.3)})`); g.fillStyle = eg; g.fillRect(0, 0, W, H); }
      }
    }
    // accent frame (TV battle view: the player's colour identity)
    if (opts.accent) { const ag = g.createLinearGradient(0, 0, 0, H); ag.addColorStop(0, hexA(opts.accent, 0.32)); ag.addColorStop(0.25, hexA(opts.accent, 0)); g.fillStyle = ag; g.fillRect(0, 0, W, H * 0.25);
      g.strokeStyle = hexA(opts.accent, 0.9); g.lineWidth = 3; g.strokeRect(1.5, 1.5, W - 3, H - 3); }
    // hype bar
    const hb = { w: geo.bw * 0.8, h: 14 }; const hx = geo.cx - hb.w / 2, hy = geo.hypeY;
    g.font = '800 13px "Space Grotesk",system-ui'; g.fillStyle = '#ffd34d'; g.textAlign = 'center'; g.fillText(st.hypeOn ? 'HYPE ×2' : 'HYPE', geo.cx, hy - 10);
    g.fillStyle = 'rgba(255,255,255,.08)'; g.beginPath(); g.roundRect(hx, hy, hb.w, hb.h, 7); g.fill();
    const fill = st.hypeOn ? st.hypeLeft : st.hype; const segs = 20;
    for (let k = 0; k < segs; k++) { if (k / segs >= fill) break;
      g.fillStyle = `hsl(${190 + (k / segs) * 170},100%,${st.hypeOn ? 65 : 55}%)`; g.fillRect(hx + 3 + k * (hb.w - 6) / segs, hy + 3, (hb.w - 6) / segs - 2, hb.h - 6); }
    g.strokeStyle = st.hypeOn ? '#ffd34d' : 'rgba(255,255,255,.25)'; g.lineWidth = 1.5; g.beginPath(); g.roundRect(hx, hy, hb.w, hb.h, 7); g.stroke();
    { // flame at the end of the bar (original shape), brighter while Hype is active
      const fx0 = hx + hb.w + 14, fy0 = hy + hb.h / 2, fs = 15 * (st.hypeOn ? 1.25 : 1);
      const fg = g.createLinearGradient(0, fy0 - fs, 0, fy0 + fs * 0.6); fg.addColorStop(0, '#fff3b0'); fg.addColorStop(0.5, '#ff9a1f'); fg.addColorStop(1, '#ff3d1f');
      g.fillStyle = fg; g.globalAlpha = st.hypeOn || st.hype > 0.6 ? 1 : 0.55;
      g.beginPath(); g.moveTo(fx0, fy0 - fs); g.bezierCurveTo(fx0 + fs * 0.9, fy0 - fs * 0.2, fx0 + fs * 0.7, fy0 + fs * 0.7, fx0, fy0 + fs * 0.6);
      g.bezierCurveTo(fx0 - fs * 0.7, fy0 + fs * 0.7, fx0 - fs * 0.8, fy0, fx0 - fs * 0.2, fy0 - fs * 0.45); g.quadraticCurveTo(fx0 - fs * 0.05, fy0 - fs * 0.1, fx0, fy0 - fs); g.fill(); g.globalAlpha = 1;
    }
    if (this.hypeFlash > 0 && !opts.reducedFlash) { g.fillStyle = `rgba(255,210,80,${this.hypeFlash * 0.18})`; g.fillRect(0, 0, W, H); this.hypeFlash -= 0.04; }
    // health edge
    if (!st.practice) { g.fillStyle = st.health < 0.25 ? '#f43f5e' : 'rgba(255,255,255,.35)'; g.fillRect(8, H * 0.3, 4, H * 0.4); g.fillStyle = st.health < 0.25 ? '#fb7185' : '#22e07a'; g.fillRect(8, H * 0.3 + H * 0.4 * (1 - st.health), 4, H * 0.4 * st.health); }
  }

  _arrow(x, y, s, dir) {
    const g = this.g, rot = { left: Math.PI, down: Math.PI / 2, up: -Math.PI / 2, right: 0 }[dir];
    g.save(); g.translate(x, y); g.rotate(rot); g.beginPath(); g.moveTo(-s * 0.35, -s * 0.8); g.lineTo(s * 0.45, 0); g.lineTo(-s * 0.35, s * 0.8); g.stroke(); g.restore();
  }
  _chevron(x, y, w, color, dir) {
    const g = this.g; g.save(); g.shadowColor = color; g.shadowBlur = 16 * this.opts.effects * this.quality;
    g.strokeStyle = color; g.lineWidth = Math.max(3, w * 0.09); g.lineCap = 'round'; g.lineJoin = 'round';
    const s = w * 0.32; this._arrow(x, y - s * 0.4, s, dir); this._arrow(x, y + s * 0.45, s, dir);
    g.strokeStyle = '#fff'; g.lineWidth = Math.max(1.5, w * 0.03); this._arrow(x, y - s * 0.4, s, dir);
    g.restore();
  }
}

export function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`; }
