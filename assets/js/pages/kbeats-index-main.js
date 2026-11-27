/* KEEPITIL games/kbeats/index.html: inline script "main" moved verbatim to an external file (CSP: no executable inline script). */
  import { call } from '/games/kbeats/js/api.js';
  import { coverArt } from '/games/kbeats/js/art.js';
  import { Highway } from '/games/kbeats/js/render.js';
  // featured tracks come from the live catalog (approved, published tracks only); empty until the first artist track is approved
  const songs = document.getElementById('songs');
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const empty = '<p class="sub">The first artist tracks are in review. <a href="/games/kbeats/submit/">Submit your music</a> to be among them.</p>';
  call('catalog', {}, { auth: false }).then(r => {
    const t = (r.tracks || []).filter(x => !x.dev).slice(0, 4);
    songs.innerHTML = t.length ? t.map(x => `<div class="row"><img src="${coverArt(x, 96)}" width="52" height="52" style="border-radius:10px" alt=""><b>${esc(x.title)}<br><small style="color:var(--dim);font-weight:500">${esc(x.artist)} · ${esc(x.genre)}</small></b><a class="btn sm primary" href="/games/kbeats/play/#/track/${encodeURIComponent(x.slug)}">Play</a></div>`).join('') : empty;
  }).catch(() => { songs.innerHTML = empty; });
  // attract-mode preview: the real renderer on a looping scripted pattern (no audio)
  const cv = document.getElementById('demo'), hw = new Highway(cv, { reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches });
  const pat = []; for (let i = 0; i < 64; i++) pat.push({ t: i * 0.25, lane: [0, 1, 2, 3, 2, 1, 3, 0][i % 8], type: i % 16 === 8 ? 'hold' : i % 16 === 12 ? 'swipe' : 'tap', dur: 0.75, dir: ['left', 'down', 'up', 'right'][[0, 1, 2, 3, 2, 1, 3, 0][i % 8]], state: 0 });
  const t0 = performance.now(); let lastI = -1, combo = 0;
  addEventListener('resize', () => hw.resize());
  (function f() {
    const now = ((performance.now() - t0) / 1000) % 16;
    const i = Math.floor(now / 0.25);
    if (i !== lastI) { if (i < lastI) { combo = 0; } lastI = i; const n = pat[i]; combo++; hw.feedback({ j: 'perfect', lane: n.lane, kind: 'head' }, now); }
    hw.draw(now, { notes: pat.map(n => ({ ...n, state: n.t < now - 0.02 ? 2 : 0 })), cursor: 0, bpm: 120, offset: 0, lead: 1.5, combo, hype: (now % 8) / 8, hypeOn: now % 16 > 12, hypeLeft: (16 - now % 16) / 4, health: 0.8, energy: 0.8, practice: true });
    requestAnimationFrame(f);
  })();
