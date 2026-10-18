/* KBeats highway renderer (Canvas 2D). Original art: perspective 3/4/5-lane highway on a dark arena floor,
   glowing rounded-square notes, chevron swipe notes, large rounded-square hit pads behind a lit strike bar,
   beat-driven equalizer skyline + crowd, hit shockwaves, combo milestones, Hype bar.
   Readability rules: lanes stay dark so notes are the brightest objects on screen; effects never sit on the
   note path above the strike bar; everything decorative honours effects / reducedMotion / reducedFlash.
   Every lane is told apart by colour AND glyph (◀ ▼ ● ▲ ▶), never colour alone (on the TV, where each side
   is drawn in its player's colour, the glyphs and lane separators carry it).
   Size rule: a note's width and height scale with the perspective and equal its pad's exactly at the
   strike line (noteRect(lane, 0) === padRect(lane)), on every screen and lane count.
   Draw cost is bounded: note/glow sprites are pre-rendered per lane, particles are pre-pooled. */
import { lanesFor } from './config.js';

const POOL = 360;
const MAX_PIXELS = 2.1e6;   // per canvas backing store (≈ 1920×1080)

export class Highway {
  constructor(canvas, opts = {}) {
    this.c = canvas; this.g = canvas.getContext('2d', { alpha: false });
    this.opts = { effects: 1, reducedMotion: false, reducedFlash: false, ...opts };
    this.parts = Array.from({ length: POOL }, () => ({ life: 0 }));
    this.pi = 0; this.n = 0; this.setLanes(this.opts.lanes || 4, true);
    this.judgeText = null; this.fps = 60; this._ft = []; this.quality = 1;
    this.rings = Array.from({ length: 16 }, () => ({ life: 0 })); this.ri = 0;   // hit shockwaves (pooled)
    this.milestone = null; this._lastCombo = 0;
    this.resize();
  }
  setOpts(o) { Object.assign(this.opts, o); this._bg = null; this._sprites = null; }
  /* Lane count comes from the chart being played (3 Easy · 4 Medium · 5 Hard; legacy charts are 4). */
  setLanes(n, quiet) {
    if (n === this.n) return; this.n = n; this.L = lanesFor(n);
    this.flash = Array(n).fill(0); this.pressed = Array(n).fill(false);
    if (!quiet) this.resize();
  }
  color(l) { return this.opts.accent || this.L[l].color; }

  resize() {
    const w = this.c.clientWidth || innerWidth, h = this.c.clientHeight || innerHeight;
    // pixel budget: sharp on phones (dpr 2 stays 2), but a 4K TV or 2x desktop never draws 4x the pixels;
    // frame time scales with backing pixels (1080p at dpr 2 measured ~4x slower than dpr 1)
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(MAX_PIXELS / Math.max(1, w * h))));
    this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr);
    this.dpr = dpr; this.W = w; this.H = h;
    const n = this.n, bw = Math.min(w * 0.97, h * 0.6 * (n + 1) / 5, this.opts.maxBw || 160 * n);
    // pads fill 86% of their lane (TV: a target size, never wider than the lane allows); rounded squares,
    // a little wider than tall, never taller than 13% of the screen
    const lw = bw / n, padW = this.opts.padPx ? Math.min(this.opts.padPx * 2, lw * 0.92) : lw * 0.86;
    const padH = Math.min(padW * 0.62, h * 0.13);
    this.geo = { cx: w / 2, topY: h * 0.12, hitY: h * 0.83, bw, tw: bw * 0.3, padW, padH, padR: padH / 2, hypeY: h * 0.94 };
    this._bg = null; this._sprites = null;
  }

  /* perspective: z=0 at the pads, z=1 at the horizon */
  f(z) { return (1 - z) / (1 + 2.4 * Math.max(-0.4, z)); }
  yAt(fz) { const { topY, hitY } = this.geo; return topY + (hitY - topY) * fz; }
  widthAt(fz) { const { tw, bw } = this.geo; return tw + (bw - tw) * fz; }
  laneX(lane, fz) { return this.geo.cx + ((lane + 0.5) / this.n - 0.5) * this.widthAt(fz); }
  laneAtX(x) { const { cx, bw } = this.geo; const l = Math.floor(((x - cx) / bw + 0.5) * this.n); return Math.max(0, Math.min(this.n - 1, l)); }
  /* note box at time-distance z (0 = on the strike line) and the pad box: centre x/y, width, height */
  noteRect(lane, z) { const fz = this.f(z), k = this.widthAt(fz) / this.geo.bw; return { x: this.laneX(lane, fz), y: this.yAt(fz), w: this.geo.padW * k, h: this.geo.padH * k }; }
  padRect(lane) { return { x: this.laneX(lane, 1), y: this.geo.hitY, w: this.geo.padW, h: this.geo.padH }; }

  _makeSprites() {
    const { padW, padH } = this.geo, sc = this.dpr * 1.25, out = [];
    for (let l = 0; l < this.n; l++) {
      const L = this.L[l], col = this.color(l), pad = Math.ceil(padH * 0.3 * sc);
      const cv = document.createElement('canvas'); cv.width = Math.ceil(padW * sc) + pad * 2; cv.height = Math.ceil(padH * sc) + pad * 2;
      const g = cv.getContext('2d'), w = padW * sc, h = padH * sc, r = h * 0.26;
      g.translate(pad, pad); g.shadowColor = col; g.shadowBlur = pad * 0.9;
      const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.3, col); grd.addColorStop(1, this.opts.accent ? col : L.glow);
      g.fillStyle = grd; g.beginPath(); g.roundRect(0, 0, w, h, r); g.fill();
      g.shadowBlur = 0; g.lineWidth = Math.max(2, h * 0.06); g.strokeStyle = 'rgba(255,255,255,.9)'; g.stroke();
      g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.roundRect(w * 0.12, h * 0.1, w * 0.76, h * 0.2, r * 0.5); g.fill();
      g.fillStyle = 'rgba(5,3,20,.6)'; g.font = `900 ${Math.round(h * 0.42)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(L.glyph, w / 2, h * 0.56);
      out.push({ cv, pad: pad / sc });
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
    if (!(ev.lane >= 0 && ev.lane < this.n)) return;
    const c = this.color(ev.lane);
    if (ev.j !== 'miss') { this.flash[ev.lane] = 1; this.burst(ev.lane, ev.j === 'perfect' ? '#ffffff' : c, ev.j === 'perfect' ? 22 : 12); this.ring(ev.lane, c, ev.j === 'perfect'); }
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
    const N = this.n, edgeX = (k, fz) => geo.cx + (k / N - 0.5) * this.widthAt(fz);
    quad(fTop, fBot, edgeX(0, fTop), edgeX(N, fTop), edgeX(0, fBot), edgeX(N, fBot));
    const hg = g.createLinearGradient(0, geo.topY, 0, geo.hitY); hg.addColorStop(0, 'rgba(6,4,22,.62)'); hg.addColorStop(1, 'rgba(8,5,26,.96)');
    g.fillStyle = hg; g.fill();
    for (let l = 0; l < N; l++) {   // lane tint + held-lane glow
      const L = { color: this.color(l) }; const on = this.pressed[l] ? 0.22 : 0; const fl = this.flash[l];
      quad(fTop, fBot, edgeX(l, fTop), edgeX(l + 1, fTop), edgeX(l, fBot), edgeX(l + 1, fBot));
      const lg = g.createLinearGradient(0, geo.topY, 0, geo.hitY); lg.addColorStop(0, hexA(L.color, 0.0)); lg.addColorStop(0.55, hexA(L.color, 0.04 + on * 0.4 + fl * 0.1)); lg.addColorStop(1, hexA(L.color, 0.13 + on + fl * 0.3 + hype * 0.08));
      g.fillStyle = lg; g.fill();
    }
    g.lineWidth = 2;
    for (let k = 0; k <= N; k++) {   // neon outer rails, faint separators
      const outer = k === 0 || k === N; g.lineWidth = outer ? 3 : 2;
      g.strokeStyle = outer ? hexA(this.color(k ? N - 1 : 0), 0.95) : 'rgba(255,255,255,.16)';
      g.shadowColor = g.strokeStyle; g.shadowBlur = outer ? 16 * fx : 0;
      g.beginPath(); g.moveTo(edgeX(k, fTop), this.yAt(fTop)); g.lineTo(edgeX(k, fBot), this.yAt(fBot)); g.stroke();
    }
    g.shadowBlur = 0;
    // beat lines
    if (st.bpm) {
      const per = 60 / st.bpm; let b = Math.ceil((now - st.offset) / per);
      for (; ; b++) { const tb = st.offset + b * per, z = (tb - now) / st.lead; if (z > 1) break; const fz = this.f(z);
        g.strokeStyle = `rgba(255,255,255,${b % 4 === 0 ? 0.16 : 0.06})`; g.lineWidth = b % 4 === 0 ? 2 : 1;
        g.beginPath(); g.moveTo(edgeX(0, fz), this.yAt(fz)); g.lineTo(edgeX(N, fz), this.yAt(fz)); g.stroke(); }
    }
    // notes (far → near)
    const notes = st.notes, lead = st.lead;
    while (st.cursor < notes.length && notes[st.cursor].t + (notes[st.cursor].dur || 0) < now - 0.35) st.cursor++;
    let end = st.cursor; while (end < notes.length && notes[end].t - now < lead) end++;
    for (let i = end - 1; i >= st.cursor; i--) {
      const n = notes[i]; if (n.state === 2) continue;
      if (!(n.lane < N)) continue;
      const L = { color: this.color(n.lane) };
      if (n.type === 'hold') {
        const z0 = Math.max(n.state === 1 ? 0 : -0.12, (n.t - now) / lead), z1 = Math.min(1, (n.t + n.dur - now) / lead);
        if (z1 < z0) continue;
        const f0 = this.f(z0), f1 = this.f(z1), w0 = this.widthAt(f0) / N * 0.3, w1 = this.widthAt(f1) / N * 0.3;
        const x0 = this.laneX(n.lane, f0), x1 = this.laneX(n.lane, f1);
        g.beginPath(); g.moveTo(x0 - w0, this.yAt(f0)); g.lineTo(x1 - w1, this.yAt(f1)); g.lineTo(x1 + w1, this.yAt(f1)); g.lineTo(x0 + w0, this.yAt(f0)); g.closePath();
        const tg = g.createLinearGradient(0, this.yAt(f1), 0, this.yAt(f0)); tg.addColorStop(0, hexA(L.color, 0.15)); tg.addColorStop(1, hexA(L.color, n.state === 1 ? 0.95 : 0.6));
        g.fillStyle = tg; g.fill();
        if (n.state === 1) continue;
      }
      const z = (n.t - now) / lead; if (z < -0.15) continue;
      const r = this.noteRect(n.lane, z);
      if (n.type === 'swipe') this._chevron(r.x, r.y, r.w, L.color, n.dir);
      else { const sp = this._sprites[n.lane], k = r.w / geo.padW, p = sp.pad * k; g.drawImage(sp.cv, r.x - r.w / 2 - p, r.y - r.h / 2 - p, r.w + 2 * p, r.h + 2 * p); }
    }
    // strike bar: a lit line across the highway at the hit point, breathing with the beat
    { const y = geo.hitY, x0 = edgeX(0, 1), x1 = edgeX(N, 1);
      g.globalCompositeOperation = 'lighter';
      const sb = g.createLinearGradient(x0, 0, x1, 0); for (let i = 0; i < N; i++) sb.addColorStop(i / (N - 1), hexA(this.color(i), 0.55 + 0.35 * pulse));
      g.fillStyle = sb; g.fillRect(x0, y - 2, x1 - x0, 4);
      const halo = g.createLinearGradient(0, y - geo.padR * 1.3, 0, y + 2); halo.addColorStop(0, 'rgba(255,255,255,0)'); halo.addColorStop(1, `rgba(190,170,255,${0.10 + 0.10 * pulse * fx})`);
      g.fillStyle = halo; g.fillRect(x0, y - geo.padR * 1.3, x1 - x0, geo.padR * 1.3);
      g.globalCompositeOperation = 'source-over'; }
    // hit pads: rounded squares, exactly the size every note reaches at the strike line
    for (let l = 0; l < N; l++) {
      const L = this.L[l], c = this.color(l), { x, y, w, h } = this.padRect(l), p = this.pressed[l], fl = this.flash[l], s = p ? 0.95 : 1;
      const pw = w * s, ph = h * s, r = h * 0.26;
      g.shadowColor = c; g.shadowBlur = (14 + fl * 30 + (p ? 12 : 0)) * fx;
      const pg = g.createLinearGradient(0, y - ph / 2, 0, y + ph / 2);
      pg.addColorStop(0, hexA(c, p ? 0.85 : 0.42 + fl * 0.3)); pg.addColorStop(1, 'rgba(8,6,24,.92)');
      g.fillStyle = pg; g.beginPath(); g.roundRect(x - pw / 2, y - ph / 2, pw, ph, r); g.fill();
      g.lineWidth = Math.max(3, h * 0.08); g.strokeStyle = c; g.stroke(); g.shadowBlur = 0;
      g.lineWidth = Math.max(1.5, h * 0.03); g.strokeStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.roundRect(x - pw / 2 + h * 0.1, y - ph / 2 + h * 0.1, pw - h * 0.2, ph - h * 0.2, r * 0.7); g.stroke();
      g.lineWidth = Math.max(4, h * 0.11); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#fff'; g.fillStyle = '#fff';
      if (L.dir === 'center') { g.beginPath(); g.arc(x, y, h * 0.16, 0, Math.PI * 2); g.fill(); } else this._arrow(x, y, h * 0.3, L.dir);
      if (!opts.reducedMotion && fx > 0.3) { const e = 1.06 + 0.08 * (1 - pulse); g.lineWidth = 2; g.strokeStyle = hexA(c, 0.35 * pulse); g.beginPath(); g.roundRect(x - w * e / 2, y - h * e / 2, w * e, h * e, r * e); g.stroke(); }
      this.flash[l] = Math.max(0, fl - 0.08);
    }
    // shockwave rings
    g.globalCompositeOperation = 'lighter';
    for (const rg of this.rings) { if (rg.life <= 0) continue; rg.life -= 1 / 60; const k = 1 - Math.max(0, rg.life) / rg.max;
      if (!(rg.lane < N)) { rg.life = 0; continue; }
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
      const y = geo.hitY - geo.padH / 2 - s * 1.3;   // the "N COMBO" line ends above the pad tops
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
