/* Browser chart editor: waveform + beat grid + four lanes on a horizontal timeline.
   Click empty cell = add tap · click note = select · drag = move (snaps to 1/16) · Delete = remove
   T/H/S = tap/hold/swipe · [ ] = shorten/lengthen hold · Space = preview from playhead
   Ctrl+Z / Ctrl+Shift+Z = undo/redo. Saving always produces a NEW chart version (live charts and
   the leaderboards bound to them are never altered in place). */
import { makeChart, decodeNotes, validate } from './chart.js';
import { LANES } from './config.js';

export class ChartEditor {
  constructor(root, { ctx, onChange }) {
    this.root = root; this.ctx = ctx; this.onChange = onChange;
    root.innerHTML = `<div class="ed-tools">
      <button class="btn sm primary" data-a="play">▶ Preview</button>
      <button class="btn sm ghost" data-a="undo" title="Ctrl+Z">↶ Undo</button><button class="btn sm ghost" data-a="redo" title="Ctrl+Shift+Z">↷ Redo</button>
      <button class="btn sm ghost" data-a="del">Delete</button>
      <select data-a="type" aria-label="Note type"><option value="tap">Tap</option><option value="hold">Hold</option><option value="swipe">Swipe</option></select>
      <button class="btn sm ghost" data-a="shorter">[ Hold −</button><button class="btn sm ghost" data-a="longer">Hold + ]</button>
      <label style="font-size:12px;color:var(--dim)">Zoom <input type="range" data-a="zoom" min="60" max="600" value="160"></label>
      <button class="btn sm pink" data-a="save">Save revision</button><span data-a="info" style="font-size:12px;color:var(--dim)"></span></div>
      <canvas tabindex="0" aria-label="Chart editor timeline" style="width:100%;height:300px;display:block;border-radius:12px;background:#0b0820;touch-action:none"></canvas>
      <input type="range" data-a="scroll" min="0" max="1000" value="0" style="width:100%" aria-label="Scroll timeline">`;
    this.cv = root.querySelector('canvas'); this.g = this.cv.getContext('2d');
    this.pps = 160; this.x0 = 0; this.sel = null; this.undo = []; this.redo = []; this.play = null; this.playhead = 0;
    const A = a => root.querySelector(`[data-a=${a}]`);
    A('play').onclick = () => this.toggle();
    A('undo').onclick = () => this.doUndo(); A('redo').onclick = () => this.doRedo();
    A('del').onclick = () => this.del();
    A('type').onchange = e => this.setType(e.target.value);
    A('shorter').onclick = () => this.resize(-1); A('longer').onclick = () => this.resize(1);
    A('zoom').oninput = e => { this.pps = +e.target.value; this.draw(); };
    A('scroll').oninput = e => { this.x0 = e.target.value / 1000 * Math.max(0, this.dur - this.cv.clientWidth / this.pps); this.draw(); };
    A('save').onclick = () => this.commit(true);
    this.A = A;
    this.cv.addEventListener('pointerdown', e => this.down(e));
    this.cv.addEventListener('pointermove', e => this.move(e));
    addEventListener('pointerup', () => { if (this.drag) { this.drag = null; this.changed(); } });
    this.cv.addEventListener('wheel', e => { e.preventDefault(); this.x0 = Math.max(0, this.x0 + (e.deltaX || e.deltaY) / this.pps); this.draw(); }, { passive: false });
    this.cv.addEventListener('keydown', e => this.key(e));
    addEventListener('resize', () => this.draw());
  }
  load({ chart, wave, duration, bpm, gridStart, buffer, onSave }) {
    this.chart = chart; this.notes = decodeNotes(chart.notes); this.wave = wave; this.wmax = Math.max(0.01, ...wave); this.dur = duration; this.bpm = bpm; this.grid0 = gridStart;
    this.buffer = buffer; this.onSave = onSave; this.undo = []; this.redo = []; this.sel = null; this.dirty = false; this.x0 = 0;
    this.step = 60 / bpm / 4; this.draw(); this.info();
  }
  snap(t) { return Math.max(0, this.grid0 + Math.round((t - this.grid0) / this.step) * this.step); }
  geom() { const W = this.cv.clientWidth, H = this.cv.clientHeight; return { W, H, wh: 56, lh: (H - 64) / 4 }; }
  tx(t) { return (t - this.x0) * this.pps; }
  hit(x, y) {
    const { wh, lh } = this.geom(); if (y < wh) return { wave: true, t: this.x0 + x / this.pps };
    const lane = Math.min(3, Math.floor((y - wh - 4) / lh)), t = this.x0 + x / this.pps;
    const n = this.notes.find(n => n.lane === lane && t >= n.t - 8 / this.pps && t <= n.t + Math.max(8 / this.pps, n.type === 'hold' ? n.dur : 0));
    return { lane, t, n };
  }
  snapshot() { this.undo.push(JSON.stringify(this.notes)); if (this.undo.length > 200) this.undo.shift(); this.redo = []; }
  changed() { this.dirty = true; this.notes.sort((a, b) => a.t - b.t || a.lane - b.lane); this.draw(); this.info(); }
  down(e) {
    this.cv.focus(); const r = this.cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, h = this.hit(x, y);
    if (h.wave) { this.playhead = Math.max(0, h.t); if (this.play) { this.stop(); this.toggle(); } this.draw(); return; }
    if (h.n) { this.sel = h.n; this.snapshot(); this.drag = { n: h.n, dt: h.t - h.n.t }; this.A('type').value = h.n.type; }
    else { this.snapshot(); const n = { t: this.snap(h.t), lane: h.lane, type: 'tap' }; this.notes.push(n); this.sel = n; this.changed(); }
    this.draw();
  }
  move(e) {
    if (!this.drag) return;
    const r = this.cv.getBoundingClientRect(), { wh, lh } = this.geom();
    const t = this.snap(this.x0 + (e.clientX - r.left) / this.pps - this.drag.dt), lane = Math.max(0, Math.min(3, Math.floor((e.clientY - r.top - wh - 4) / lh)));
    this.drag.n.t = t; this.drag.n.lane = lane; if (this.drag.n.type === 'swipe') this.drag.n.dir = LANES[lane].dir; this.dirty = true; this.draw();
  }
  key(e) {
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? this.doRedo() : this.doUndo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); this.doRedo(); return; }
    if (k === 'delete' || k === 'backspace') { e.preventDefault(); this.del(); }
    else if (k === 't') this.setType('tap'); else if (k === 'h') this.setType('hold'); else if (k === 's') this.setType('swipe');
    else if (k === '[') this.resize(-1); else if (k === ']') this.resize(1);
    else if (k === ' ') { e.preventDefault(); this.toggle(); }
    else if (this.sel && (k === 'arrowup' || k === 'arrowdown')) { e.preventDefault(); this.snapshot(); this.sel.lane = Math.max(0, Math.min(3, this.sel.lane + (k === 'arrowup' ? -1 : 1))); this.changed(); }
  }
  del() { if (!this.sel) return; this.snapshot(); this.notes = this.notes.filter(n => n !== this.sel); this.sel = null; this.changed(); }
  setType(ty) {
    if (!this.sel) return; this.snapshot(); const n = this.sel; n.type = ty;
    if (ty === 'hold') n.dur = n.dur || this.step * 4; else delete n.dur;
    if (ty === 'swipe') n.dir = LANES[n.lane].dir; else delete n.dir;
    this.changed();
  }
  resize(d) { const n = this.sel; if (!n || n.type !== 'hold') return; this.snapshot(); n.dur = Math.max(this.step * 2, n.dur + d * this.step); this.changed(); }
  doUndo() { if (!this.undo.length) return; this.redo.push(JSON.stringify(this.notes)); this.notes = JSON.parse(this.undo.pop()); this.sel = null; this.changed(); }
  doRedo() { if (!this.redo.length) return; this.undo.push(JSON.stringify(this.notes)); this.notes = JSON.parse(this.redo.pop()); this.sel = null; this.changed(); }
  toggle() {
    if (this.play) return this.stop();
    const s = this.ctx.createBufferSource(); s.buffer = this.buffer; s.connect(this.ctx.destination);
    const at = this.ctx.currentTime + 0.05; s.start(at, this.playhead); this.play = { s, at, from: this.playhead };
    s.onended = () => { if (this.play?.s === s) this.stop(); };
    const loop = () => { if (!this.play) return; this.playhead = this.play.from + Math.max(0, this.ctx.currentTime - this.play.at);
      const W = this.cv.clientWidth; if (this.tx(this.playhead) > W * 0.8) this.x0 = this.playhead - W * 0.2 / this.pps; this.draw(); requestAnimationFrame(loop); };
    loop(); this.A('play').textContent = '■ Stop';
  }
  stop() { if (this.play) { try { this.play.s.stop(); } catch {} } this.play = null; this.A('play').textContent = '▶ Preview'; this.draw(); }
  /* Persist edits as a new chart version (only if something changed). */
  commit(force) {
    if (!this.chart || (!this.dirty && !force)) return this.chart;
    const c = makeChart({ trackId: this.chart.trackId, chartVersion: this.chart.chartVersion + 1, difficulty: this.chart.difficulty, bpm: this.chart.bpm,
      offsetMs: this.chart.offsetMs, durationMs: this.chart.durationMs, notes: this.notes });
    this.chart = c; this.dirty = false; this.onSave && this.onSave(c); this.draw(); this.info(); return c;
  }
  draw() {
    const cv = this.cv, dpr = Math.min(2, devicePixelRatio || 1), { W, H, wh, lh } = this.geom();
    if (!W) return;
    cv.width = W * dpr; cv.height = H * dpr; const g = this.g; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0b0820'; g.fillRect(0, 0, W, H);
    // waveform
    if (this.wave) { g.fillStyle = 'rgba(167,139,250,.6)'; const n = this.wave.length;
      for (let x = 0; x < W; x++) { const t = this.x0 + x / this.pps; const i = Math.floor(t / this.dur * n); if (i < 0 || i >= n) continue; const v = this.wave[i] / this.wmax * (wh - 8) / 2; g.fillRect(x, wh / 2 - v, 1, v * 2); } }
    // grid
    const t0 = this.x0, t1 = this.x0 + W / this.pps;
    for (let k = Math.floor((t0 - this.grid0) / this.step); ; k++) {
      const t = this.grid0 + k * this.step; if (t > t1) break; const x = this.tx(t);
      g.fillStyle = k % 16 === 0 ? 'rgba(255,255,255,.35)' : k % 4 === 0 ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.05)';
      if (k % 4 === 0 || this.pps > 220) g.fillRect(x, wh, 1, H - wh);
      if (k % 16 === 0) { g.fillStyle = 'rgba(255,255,255,.5)'; g.font = '10px system-ui'; g.fillText(String(k / 16 + 1), x + 3, wh + 12); }
    }
    for (let l = 0; l < 4; l++) { g.fillStyle = l % 2 ? 'rgba(255,255,255,.025)' : 'rgba(255,255,255,.045)'; g.fillRect(0, wh + 4 + l * lh, W, lh); g.fillStyle = LANES[l].color; g.font = '700 12px system-ui'; g.fillText(LANES[l].glyph, 4, wh + 4 + l * lh + lh / 2 + 4); }
    // notes
    for (const n of this.notes) {
      const x = this.tx(n.t); if (x < -400 || x > W + 20) continue;
      const y = wh + 4 + n.lane * lh, L = LANES[n.lane];
      if (n.type === 'hold') { g.fillStyle = L.color + '66'; g.fillRect(x, y + lh * 0.3, n.dur * this.pps, lh * 0.4); }
      g.fillStyle = L.color; g.beginPath();
      if (n.type === 'swipe') { g.moveTo(x - 7, y + lh * 0.2); g.lineTo(x + 7, y + lh / 2); g.lineTo(x - 7, y + lh * 0.8); g.closePath(); }
      else g.roundRect(x - 6, y + lh * 0.2, 12, lh * 0.6, 4);
      g.fill();
      if (n === this.sel) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(x - 9, y + lh * 0.12, 18 + (n.type === 'hold' ? n.dur * this.pps : 0), lh * 0.76); }
    }
    g.fillStyle = '#fff'; g.fillRect(this.tx(this.playhead), 0, 2, H);
    const sc = this.A('scroll'), max = Math.max(0.001, this.dur - W / this.pps); sc.value = Math.round(this.x0 / max * 1000);
  }
  info() {
    const tmp = makeChart({ trackId: this.chart.trackId, chartVersion: this.chart.chartVersion, difficulty: this.chart.difficulty, bpm: this.chart.bpm, offsetMs: this.chart.offsetMs, durationMs: this.chart.durationMs, notes: this.notes });
    const r = validate(tmp);
    this.A('info').innerHTML = `${this.notes.length} notes · v${this.chart.chartVersion}${this.dirty ? ' · unsaved' : ''} · validator <b style="color:${r.ok ? '#4ade80' : '#fb7185'}">${r.ok ? 'PASS' : 'FAIL: ' + r.errors[0]}</b>`;
  }
}
