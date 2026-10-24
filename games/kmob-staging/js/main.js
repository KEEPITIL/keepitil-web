/* KMOB main — game flow (title → run → results → instant restart), one-finger input, HUD, upgrades, shop, save,
   analytics hooks, debug tools (?debug=1) and adaptive quality. */
(function () {
  if (window.KM_REDIRECT) return;
  const KM = window.KM, $ = id => document.getElementById(id);
  // Public build reads no URL flags. Internal tooling (benchmark, playtest, debug, stress, showcase) lives in js/internal.js,
  // which only the private build loads; it sets KM.DEV and receives the game API through KM.internalInit.
  const DEV = KM.DEV || null, NATIVE = !!window.KMOB_NATIVE;   // NATIVE: the bundled iOS app (no network telemetry, no boards, no real-money storefront)
  const LT = KM.loadTimes || {}, mark = k => { if (LT[k] == null) LT[k] = Math.round(performance.now()); };
  const H = { tick: [], start: [], death: [], leave: [], fps: [], qdown: [], frame: [] }, hook = (k, a, b, c) => { for (const f of H[k]) f(a, b, c); };

  // ---------- icons (inline SVG, original) ----------
  const ICON = {
    army: '<g fill="#7cc4ff" stroke="#0e3a8a" stroke-width="1.2"><circle cx="7" cy="9" r="3"/><circle cx="17" cy="9" r="3"/><path d="M2 20c0-4 2-6 5-6s5 2 5 6z"/><path d="M12 20c0-4 2-6 5-6s5 2 5 6z"/><circle cx="12" cy="7" r="3.4" fill="#a8dcff"/><path d="M6 21c0-5 3-7 6-7s6 2 6 7z" fill="#a8dcff"/></g>',
    coin: '<circle cx="12" cy="12" r="9.5" fill="#ffc21a" stroke="#b07000" stroke-width="1.6"/><circle cx="12" cy="12" r="6.4" fill="none" stroke="#fff3b0" stroke-width="1.4"/><path d="M12 8l1.2 2.6 2.8.3-2.1 1.9.6 2.8-2.5-1.5-2.5 1.5.6-2.8-2.1-1.9 2.8-.3z" fill="#fff3b0"/>',
    sword: '<path d="M18.5 3.5l2 2-10 10-2-2z" fill="#e8eef8" stroke="#5a6478" stroke-width="1"/><path d="M6 14l4 4-1.5 1.5-4-4z" fill="#f2c14e" stroke="#8a5a10" stroke-width="1"/><path d="M5 17l2 2-3 3-2-2z" fill="#8a5a33"/>',
    swords: '<g stroke="#5a6478" stroke-width="1"><path d="M18 3l3 0 0 3-10 10-3-3z" fill="#e8eef8"/><path d="M6 3l-3 0 0 3 10 10 3-3z" fill="#d0d8e8"/></g><path d="M4 17l3 3-2 2-3-3zM20 17l-3 3 2 2 3-3z" fill="#f2c14e"/>',
    helm: '<path d="M4 14a8 8 0 0116 0v4h-5v-4h-6v4H4z" fill="#d8dee8" stroke="#5a6478" stroke-width="1.2"/><path d="M11 3h2v8h-2z" fill="#e2312c"/><path d="M4 14h16" stroke="#5a6478" stroke-width="1.2"/>',
    shield: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="#7cc4ff" stroke="#0e3a8a" stroke-width="1.4"/><path d="M12 5l5 2v4c0 3-2 6-5 7.5z" fill="#fff" opacity=".5"/>',
    bolt: '<path d="M13 2L4 14h6l-1 8 9-12h-6z" fill="#ffe14a" stroke="#b07a00" stroke-width="1.2" stroke-linejoin="round"/>',
    boot: '<path d="M7 3h6v9l6 3v4H5V3z" fill="#c88a4a" stroke="#6a3a10" stroke-width="1.2"/><path d="M4 19h17v2H4z" fill="#6a3a10"/><path d="M16 7l3 0M17 4l3 0" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>',
    magnet: '<path d="M5 3h4v9a3 3 0 006 0V3h4v9a7 7 0 01-14 0z" fill="#e2312c" stroke="#7a0d0d" stroke-width="1.2"/><path d="M5 3h4v3H5zM15 3h4v3h-4z" fill="#e8eef8"/>',
    star: '<path d="M12 2l3 6.5 7 .8-5.2 4.8 1.5 7-6.3-3.6-6.3 3.6 1.5-7L2 9.3l7-.8z" fill="#ffe14a" stroke="#b07a00" stroke-width="1.2" stroke-linejoin="round"/>',
    bow: '<path d="M6 2c8 4 8 16 0 20" fill="none" stroke="#8a5a33" stroke-width="2.6"/><path d="M6 2v20" stroke="#fff" stroke-width="1"/><path d="M4 12h16" stroke="#e8eef8" stroke-width="1.6"/><path d="M20 12l-3-2v4z" fill="#e8eef8"/>',
    heart: '<path d="M12 21s-8-5-8-11a4.5 4.5 0 018-3 4.5 4.5 0 018 3c0 6-8 11-8 11z" fill="#ff5a6a" stroke="#8a0d1a" stroke-width="1.2"/>',
    tower: '<path d="M6 22V9h12v13z" fill="#c4c9d2" stroke="#5a6478" stroke-width="1.2"/><path d="M5 9V5h2v2h2V5h2v2h2V5h2v2h2V5h2v4z" fill="#d8dee8" stroke="#5a6478" stroke-width="1.2"/><path d="M10 22v-5h4v5z" fill="#6a4a2a"/>',
    token: '<circle cx="12" cy="12" r="9.5" fill="#2fb8ff" stroke="#0a5a8a" stroke-width="1.5"/><path d="M12 5l2 5h5l-4 3 1.5 5L12 15l-4.5 3L9 13 5 10h5z" fill="#e6fbff"/>',
    skull: '<path d="M12 3a8 8 0 00-8 8c0 3 1.5 4.5 3 5.5V20h10v-3.5c1.5-1 3-2.5 3-5.5a8 8 0 00-8-8z" fill="#cfd6e2" stroke="#5a6478" stroke-width="1.2"/><circle cx="9" cy="11.5" r="2" fill="#26304a"/><circle cx="15" cy="11.5" r="2" fill="#26304a"/>',
    flag: '<path d="M5 2v20" stroke="#8a5a33" stroke-width="2"/><path d="M6 3h12l-3 4 3 4H6z" fill="#ffc21a" stroke="#b07000" stroke-width="1"/>',
    home: '<path d="M3 11l9-8 9 8v10h-6v-6H9v6H3z" fill="#fff"/>',
    gear: '<g fill="#cfe2ff" stroke="#0e1a33" stroke-width="1.2"><path d="M12 2l2 3 3.5-.8.8 3.5 3 2-2 3 2 3-3 2-.8 3.5-3.5-.8-2 3-2-3-3.5.8-.8-3.5-3-2 2-3-2-3 3-2 .8-3.5 3.5.8z"/><circle cx="12" cy="12" r="3.4" fill="#0e1a33"/></g>',
    collector: '<path d="M8 5h8l-1.5 3.5c4 2 5.5 6 5.5 8.5a3.5 3.5 0 01-3.5 3.5H7.5A3.5 3.5 0 014 17c0-2.5 1.5-6.5 5.5-8.5z" fill="#c8964a" stroke="#5a3a10" stroke-width="1.2"/><circle cx="12" cy="15" r="2.6" fill="#ffd23a" stroke="#8a5a00"/>',
    range: '<path d="M7 2c8 4 8 16 0 20" fill="none" stroke="#a06a33" stroke-width="2.6"/><path d="M7 2v20" stroke="#fff" stroke-width="1"/><path d="M3 12h17" stroke="#e8eef8" stroke-width="1.8"/><path d="M21 12l-4-2.5v5z" fill="#e8eef8"/>',
    melee: '<path d="M3 5l6-2 6 2v5c0 5-3 8-6 9-3-1-6-4-6-9z" fill="#7cc4ff" stroke="#0e3a8a" stroke-width="1.3"/><path d="M20.5 3.5l1 1-8 9-1-1z" fill="#e8eef8" stroke="#5a6478" stroke-width=".8"/><path d="M12 12l3 3-1 1-3-3z" fill="#f2c14e"/>',
    elite: '<path d="M4 14a8 8 0 0116 0v4h-5v-4h-6v4H4z" fill="#e8c35a" stroke="#6a4a10" stroke-width="1.2"/><path d="M11 2h2v9h-2z" fill="#e2312c"/><path d="M12 2c3 0 6 1 7 4" stroke="#e2312c" stroke-width="2" fill="none"/>',
    mizard: '<path d="M7 22L15 8" stroke="#8a5a33" stroke-width="2.4" stroke-linecap="round"/><circle cx="16" cy="6" r="4" fill="#9dffb0" stroke="#1f7a4a" stroke-width="1.2"/><path d="M16 3.2v5.6M13.2 6h5.6" stroke="#fff" stroke-width="1.4"/>',
    giant: '<circle cx="12" cy="4.8" r="3.2" fill="#a8dcff" stroke="#0e3a8a" stroke-width="1.2"/><path d="M3.5 22l1-9c0-3 3.5-4.5 7.5-4.5s7.5 1.5 7.5 4.5l1 9h-5l-1-6h-5l-1 6z" fill="#2a5fd8" stroke="#0e1a33" stroke-width="1.2"/>',
    tank: '<path d="M2 14h20v5H2z" fill="#2f6dff" stroke="#0e1a33"/><path d="M6 9h10v5H6z" fill="#4a86ff" stroke="#0e1a33"/><path d="M14 11h9" stroke="#cfe2ff" stroke-width="2.2"/><circle cx="6" cy="19" r="2" fill="#0e1a33"/><circle cx="12" cy="19" r="2" fill="#0e1a33"/><circle cx="18" cy="19" r="2" fill="#0e1a33"/>',
    clock: '<circle cx="12" cy="13" r="8.5" fill="none" stroke="#fff" stroke-width="2.5"/><path d="M12 8v5l3 2" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
    wave: '<path d="M2 16c3-4 5-4 8 0s5 4 8 0 3-2 4-1" fill="none" stroke="#7cc4ff" stroke-width="2.4"/><path d="M2 9c3-4 5-4 8 0s5 4 8 0" fill="none" stroke="#cfe2ff" stroke-width="1.8"/>',
    diamond: '<path d="M6 3h12l4 6-10 12L2 9z" fill="#5fe0ff" stroke="#0a6a8a" stroke-width="1.2"/><path d="M2 9h20M9 3l3 18 3-18" stroke="#e6fbff" stroke-width="1" fill="none"/>',
    linebreaker: '<path d="M8 21h8l1.5-3h-11z" fill="#2d58b8" stroke="#0a1a3a" stroke-width="1.2" stroke-linejoin="round"/><rect x="10.6" y="2" width="2.8" height="15" rx="1" fill="#ffd23a" stroke="#6a3c00" stroke-width="1"/><path d="M8.5 9l3.5-3 3.5 3M8.5 13.5l3.5-3 3.5 3" fill="none" stroke="#fff6d8" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    arrowstorm: '<circle cx="12" cy="16" r="6.5" fill="none" stroke="#ff5a2a" stroke-width="2"/><path d="M12 8.6v2.2M12 21.2v1.6M4.6 16h1.6M17.8 16h1.6" stroke="#ff5a2a" stroke-width="1.8" stroke-linecap="round"/><g stroke="#3a2410" stroke-width="1.6" stroke-linecap="round"><path d="M7 1.5l2.2 9M12 1v10M17 1.5l-2.2 9"/></g><g fill="#fff"><path d="M7.6 9.5l2.6-.4.2 2.6z"/><path d="M10.7 10h2.6L12 12.6z"/><path d="M13.6 11.7l.2-2.6 2.6.4z"/></g>',
    elemental: '<path d="M2 18c3-6 7-8 11-6 3 1.5 3.5 4.5 1 5.5 3 1 6-1 8-4v8H2z" fill="#3fc8ff" stroke="#08506e" stroke-width="1.3" stroke-linejoin="round"/><path d="M5 16c2-3.5 5-4.6 8-3.4" fill="none" stroke="#e8fbff" stroke-width="1.6" stroke-linecap="round"/><path d="M17 2v8M13.5 4l7 4M20.5 4l-7 4" stroke="#e8fbff" stroke-width="1.6" stroke-linecap="round"/>',
    mercenary: '<path d="M12 1.5l2.2 3-2.2 3-2.2-3z" fill="#ffd23a" stroke="#6a3c00" stroke-width="1"/><path d="M4 18a8 8 0 0116 0v3h-5.2v-3.4H9.2V21H4z" fill="#d8dee8" stroke="#3a4458" stroke-width="1.3"/><path d="M12 10v7.4" stroke="#3a4458" stroke-width="1.3"/><path d="M1.5 12.5l3 1.2v2.6l-3 1.2z" fill="#ffd23a" stroke="#6a3c00" stroke-width="1"/>',
    recruits: '<circle cx="12" cy="7" r="4" fill="#e8b52e" stroke="#6a4a00" stroke-width="1.2"/><path d="M4 22c0-6 4-10 8-10s8 4 8 10z" fill="#e8b52e" stroke="#6a4a00" stroke-width="1.2"/>',
    fortress: '<path d="M3 19a9 9 0 0118 0z" fill="#3fa8ff" fill-opacity=".35" stroke="#8fe0ff" stroke-width="1.6"/><path d="M7.5 12.2l4.5-2.6 4.5 2.6M12 9.6V19M7.5 12.2V19M16.5 12.2V19M3.6 16l8.4-2.2 8.4 2.2" fill="none" stroke="#e8fbff" stroke-width="1.1"/><path d="M6 19h12l-1.5 3h-9z" fill="#2d58b8" stroke="#0a1a3a" stroke-width="1.2"/>',
    shop: '<path d="M4 9h16l-1 12H5z" fill="#ff5a6a"/><path d="M3 6h18v4H3z" fill="#ffc21a"/><path d="M12 6v15" stroke="#fff" stroke-width="2"/><path d="M12 6c-2-4-6-3-5 0M12 6c2-4 6-3 5 0" stroke="#ffc21a" stroke-width="2" fill="none"/>',
  };
  const svg = k => {
    return `<svg viewBox="0 0 24 24">${ICON[k] || ICON.star}</svg>`;
  };
  $('setBtn1').innerHTML = svg('gear');
  $('homeBtn').innerHTML = svg('home') + 'HOME'; $('shopBtn2').innerHTML = svg('shop') + 'SHOP';
  $('tipHand').innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 11V4.5a1.5 1.5 0 013 0V10l5.2 1.1c1.2.3 1.9 1.4 1.7 2.6L18 20H9.5l-4-5.2c-.6-.8-.4-1.9.4-2.4.7-.5 1.7-.3 2.3.3z" fill="#fff" stroke="#0e1a33" stroke-width="1.2"/></svg>';

  // ---------- analytics (clean interface; no provider required) ----------
  const Analytics = KM.analytics = {
    q: [], sinks: [],
    track(name, props) { const e = { name, t: Date.now(), ...props }; this.q.push(e); if (this.q.length > 500) this.q.shift(); for (const s of this.sinks) try { s(e); } catch (x) { /* sink errors never break the game */ } if (DEV && DEV.debug) console.log('[analytics]', name, props || ''); },
    addSink(fn) { this.sinks.push(fn); },
  };

  // ---------- save ----------
  let store; try { store = window.localStorage; store.setItem('kmob.t', '1'); } catch (e) { const m = {}; store = { getItem: k => m[k] || null, setItem: (k, v) => { m[k] = String(v); } }; }
  const save = KM.save = KM.loadSave(store);
  const persist = () => KM.writeSave(store, save);

  // ---------- run telemetry: one anonymous record per run → private insert-only table (never read back by the client) ----------
  // No personal data: random ids, coarse device class, gameplay numbers. Any failure is swallowed; gameplay never waits on it.
  const Telemetry = KM.telemetry = (() => {
    const URL_ = 'https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/kmob_runs', KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ';
    const rid = () => { try { return crypto.randomUUID(); } catch (e) { return (Date.now().toString(36) + Math.random().toString(36).slice(2, 12)); } };
    let sid; try { sid = sessionStorage.getItem('kmob.sid') || rid(); sessionStorage.setItem('kmob.sid', sid); } catch (e) { sid = rid(); }
    let R = null, pending = null;
    const T = {
      on: false, key: KEY, sent: [], fetch: (...a) => fetch(...a),
      begin(sim, ctx) { this.flush('restart'); const ua = navigator.userAgent;
        R = { v: 1, build: KM.BUILD, run: rid(), dev: /iPhone|iPad|iPod/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android' : 'desktop', cores: navigator.hardwareConcurrency || 0, mem: navigator.deviceMemory || 0,
          vp: [innerWidth, innerHeight, +(devicePixelRatio || 1).toFixed(2)], landing: this.pre || '', resumed: !!ctx.resumed, resumeFailed: !!ctx.resumeFailed, t0: Math.round(sim.t), q0: ctx.quality, spd0: ctx.speed, comp: ctx.comp, runN: ctx.runN,
          prod: [[sim.prod, 0]], auto: [[sim.auto ? 1 : 0, 0]], deploys: {}, moves: 0, lane: [0, 0, 0, 0, 0], defendSecs: 0, comp30: null, posture: [], sectors: [], waves: { push: 0, mini: 0, boss: 0 }, bosses: [], ups: [], qdown: [], samples: [], fps: [], stalls: 0, worstMs: 0,
          capFirst: -1, capSecs: 0, peak: 0, speedSecs: { 1: 0, 1.5: 0, 2: 0 } }; },
      landing(c) { this.pre = c; },
      count(how) { if (R) R.deploys[how] = (R.deploys[how] || 0) + 1; },
      move(x) { if (R) R.moves++; },
      ev(sim, t, a, b) { if (!R) return; const tt = Math.round(sim.t);
        if (t === 'prod') R.prod.push([a, tt]); else if (t === 'auto') R.auto.push([a ? 1 : 0, tt]); else if (t === 'charge' && typeof a === 'string') (R.charges = R.charges || []).push([a, b, tt]); else if (t === 'bossFight') (R.bossFights = R.bossFights || []).push([a, tt]); else if (t === 'posture') R.posture.push([a, tt]); else if (t === 'sector') R.sectors.push([a, tt]);
        else if (t === 'bossReward') (R.bossKills = R.bossKills || []).push([sim.wave, tt]); else if (t === 'power') (R.powerUse = R.powerUse || []).push([a, tt]); else if (t === 'levelUp') (R.levels = R.levels || []).push([a, b, tt]); else if (t === 'emergency') R.emerg = (R.emerg || 0) + 1; else if (t === 'allOrder') (R.allOrders = R.allOrders || []).push([a, tt]);
        else if (t === 'wave' && R.waves[a] != null) { R.waves[a]++; if (a !== 'push') R.bosses.push([b, tt]); } else if (t === 'upgrade') R.ups.push([a.id, tt, b || '']); },
      frame(sim, dt, ms, speed) { if (!R) return; if (ms > 250) R.stalls++; if (ms > R.worstMs && ms < 5000) R.worstMs = Math.round(ms); R.speedSecs[speed] = (R.speedSecs[speed] || 0) + dt;
        R.lane[Math.max(0, Math.min(4, Math.floor((sim.L.x + KM.W.LANE) / (2 * KM.W.LANE) * 5)))] += dt; if (sim.posture) R.defendSecs += dt;
        if (!R.comp30 && sim.t >= 30) R.comp30 = Array.from(sim.nKind.slice(0, KM.FRIEND.length));
        const n = sim.count[0]; if (n > R.peak) R.peak = n; if (n >= sim.stats.cap) { R.capSecs += dt; if (R.capFirst < 0) R.capFirst = Math.round(sim.t); } },
      sample(sim, fps, perf) { if (!R) return; R.fps.push(Math.round(fps)); if (R.fps.length > 900) R.fps.splice(0, 300);
        if (R.fps.length % 10 === 1) R.samples.push([Math.round(sim.t), sim.count[0], sim.count[1], Array.from(sim.nKind.slice(0, KM.FRIEND.length)), sim.posture, sim.sector, perf ? perf.quality : '', perf ? +perf.simMs.toFixed(2) : 0]); },
      qdown(to, fps) { if (R) R.qdown.push([to, Math.round(fps)]); },
      end(sim, r, ctx) { if (!R) return; const S = sim.stats;
        Object.assign(R, { chant: sim.chant.pack || 'off', chantFx: Object.assign({}, sim.chantFx), wave: sim.wave, bossesKilled: sim.bossesKilled, warTokens: sim.warTokens, cls: Object.assign({}, S.cls), goldSpent: Math.max(0, Math.round(sim.coinsTotal + KM.START_BANK - sim.coins)), energyUsed: sim.powersUsed || 0, emergencies: sim.emergencies || 0, mizardHeal: Math.round(sim.healed || 0), looterRepair: Math.round(sim.repaired || 0), speedLabel: speedI + 1, giants: sim.nKind[KM.FRIEND_BY.giantF.id - 32], pts: sim.pts, equipped: sim.equipped.slice() });
        Object.assign(R, { secs: Math.round(r.time), reason: r.reason, kills: r.kills, coins: r.coins, peakArmy: r.peakArmy, upgrades: r.upgrades, era: KM.tankEra(S, sim.t), q1: ctx.quality,
          dmg: { melee: Math.round(sim.dmgBy[0]), ranged: Math.round(sim.dmgBy[1]), tank: Math.round(sim.dmgBy[2]), support: Math.round(sim.dmgBy[3]) },
          collectors: { coins: Math.round(sim.colCoins), lost: sim.colLost }, healed: Math.round(sim.healed), shield: Math.round(sim.shAbsorbed), lastSector: sim.sector,
          breaches: sim.breaches, rowLoss: sim.rowLoss.slice(), refillAvg: sim.fillN ? +(sim.fillSum / sim.fillN).toFixed(2) : null, refills: sim.fillN });
        pending = R; R = null; },
      flush(after) { if (R && after !== 'restart') { R.partial = 1; R.secs = R.secs || 0; pending = R; R = null; } if (!pending) return; pending.after = after; const p = pending; pending = null; this.send(p); },
      send(p) { this.sent.push(p); if (this.sent.length > 5) this.sent.shift(); if (!this.on) return;
        try { this.fetch(URL_, { method: 'POST', keepalive: true, headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ run_id: p.run, session_id: sid, build: p.build, kind: p.partial ? 'partial' : 'run', payload: p }) }).catch(() => {}); } catch (e) { /* telemetry never breaks the game */ } },
    };
    addEventListener('pagehide', () => { try { T.flush('left'); } catch (e) { /* ignore */ } });
    return T;
  })();

  // ---------- one-slot run autosave (gameplay-critical; independent of telemetry) ----------
  const RUNKEY = 'kmob.run.v1';
  const RunSave = {
    load() { try { const raw = store.getItem(RUNKEY); if (!raw) return null; const r = JSON.parse(raw); if (!r || !r.snap || r.snap.v !== 1 || !(r.snap.t > 0)) throw 0; return r; } catch (e) { this.clear(); return null; } },
    write(sim) { if (!sim.alive || sim.t < 1) return; try { store.setItem(RUNKEY, JSON.stringify({ at: Date.now(), build: KM.BUILD, speed: save.settings.speed || 1, snap: sim.snapshot() })); } catch (e) { /* storage full / private mode: the run simply is not resumable */ } },
    clear() { try { store.setItem(RUNKEY, ''); } catch (e) { /* ignore */ } },
  };
  KM.runSave = RunSave;

  // ---------- systems ----------
  const canvas = $('c');
  let render;
  try { render = new KM.Render(canvas, { lowPower: /Android/i.test(navigator.userAgent), mobile: !!(DEV && DEV.mobile) || KM.isMobileEnv(navigator.userAgent, 'ontouchstart' in window, Math.min(screen.width, screen.height)) }); }
  catch (e) { window.__kmErr = e && (e.stack || e.message); document.body.innerHTML = '<div style="padding:40px;font:16px Nunito,sans-serif;color:#fff">This game needs WebGL. Please try a newer browser or device.</div>'; return; }
  const applyLooks = () => { const st = KM.SEASON_BY[save.season.equip.tank]; render.setSkin(st ? { id: st.id, name: st.name, color: st.color, trim: '#fff4c2', bonus: {} } : KM.SKIN_BY[save.skins.equip.tank] || KM.SKIN_BY.skin_royal); const tint = {};
    const mix = (a, b, t) => [16, 8, 0].reduce((o, sh) => o | Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t) << sh, 0);   // seasonal themes keep a blue base so the army never reads as the (red) enemy
    for (const c of KM.PROD_ORDER) { const se = KM.SEASON_BY[save.season.equip[c]], sk = se || KM.SKIN_BY[save.skins.equip[c]]; if (sk) { const hex = parseInt(sk.color.slice(1), 16); tint[KM.FRIEND_BY[KM.PROD[c].kind].id] = se ? mix(0x3a66f0, hex, 0.4) : hex; } } render.classTint = tint; const gl = {}; for (const c of KM.PROD_ORDER) gl[KM.FRIEND_BY[KM.PROD[c].kind].id] = KM.gearLook(c, save.gear.equip[c]); render.gearLook = gl; };   // one skin per unit: a seasonal set wins over a legacy class skin
  applyLooks(); mark('engine');
  // quality tier: the stored benchmark recommendation, else device heuristics (internal builds may force one)
  KM.loadScripts = list => list.reduce((pr, src) => pr.then(() => new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = src; sc.onload = res; sc.onerror = () => rej(new Error(src)); document.head.appendChild(sc); })), Promise.resolve());
  let storedQ = null; try { storedQ = localStorage.getItem('kmob.quality'); } catch (e) { /* private mode */ }
  const forcedQ = DEV && DEV.quality && KM.QUALITY[DEV.quality] ? DEV.quality : null;
  KM.bloomAllowed = !!(DEV && DEV.bloom) || storedQ === 'high';
  let quality = KM.detectQuality({ forced: forcedQ, stored: forcedQ ? null : storedQ, ua: navigator.userAgent, cores: navigator.hardwareConcurrency, touch: 'ontouchstart' in window, minSide: Math.min(screen.width, screen.height) });
  if (forcedQ) quality = forcedQ;
  render.applyQuality(quality);
  KM.assetsReady = KM.loadCharacterAssets ? KM.loadCharacterAssets(render, (DEV && DEV.assetBase) || 'assets/') : Promise.resolve({ procedural: true });   // authored characters swap in when available
  const audio = new KM.Audio(); audio.setSound(save.settings.sound); audio.setMusic(save.settings.music); audio.setChantVol(save.chants.vol);
  audio.pos = () => sim.chant && sim.chant.pack ? sim.t - sim.chant.t0 : 0;   // WAR CHANTS: seconds into the station loop, from SIM time (the music follows the sim, never the reverse)
  for (const id of KM.stationEarned(save.chants.owned, { bosses: save.records.bosses, wave: save.records.wave })) save.chants.owned[id] = 1;   // players who already beat a boss / reached wave 30 before 2.0 keep that progress
  let cresBar = false;
  const sim = new KM.Sim({ seed: 1 });
  let combatHits = 0, combatLvl = 0, combatT = 0;
  let daily = null, lastDaily = false;   // DAILY DEFENSE: the active daily run { day, rules, station, ranked } · results screen belongs to a daily
  let state = 'title', paused = false, runId = 0, tut = 0, lastResults = null, botOn = !!(DEV && DEV.bot); const cue = {};

  sim.on((type, a, b, c, d, e) => {
    render.onEvent(sim, type, a, b, c, d, e);
    switch (type) {
      case 'deploy': audio.play('deploy'); break;
      case 'hit': combatHits++; break;   // (owner audio review 2026-10-19: hit + shieldhit REMOVED)
      case 'kill': if (b.el) { KM.haptic(30); } Analytics.track && b.el && Analytics.track('enemy_type_death', { type: b.k, t: Math.floor(sim.t) }); break;
      case 'coin': audio.play('coin'); if (a >= 5) KM.haptic(8); break;
      case 'shot': if (a === 1) audio.play('cannon', 0, b / 9); else if (a === 0) audio.play('bow'); else if (a === 2) audio.play('frost'); break;
      case 'boom': audio.play('boom'); break;
      case 'shove': if ((e || 0) >= 2) audio.play('thud', 0, c / 10); break;
      case 'lhit': audio.play('lhit', 0, sim.L.x / 10); KM.haptic(15); break;
      case 'tankfire': audio.play('cannon', 0, sim.L.x / 10); break;
      case 'missiles': audio.play('snipe', 0, sim.L.x / 10); break;
      case 'shieldBreak': audio.play('boom'); KM.haptic(25); banner('SHIELD DOWN', 1.1); break;
      case 'shieldUp': audio.play('frost'); break;
      case 'deposit': audio.play('coin'); break;
      case 'collector': if (!cue.col) { cue.col = 1; banner('LOOTERS\nBRING COINS TO YOUR TANK', 2.4); } break;
      case 'repair': if (!cue.rep) { cue.rep = 1; banner('LOOTERS\nREPAIR THE TANK', 1.6); } break;
      case 'posture': setPostureUI(); break;
      case 'allOrder': allTip(a ? 'ALL DEFEND' : 'ALL ATTACK'); if (!a) audio.play('upgrade'); KM.haptic([20, 30, 20]); setPostureUI(); break;   // DEFEND order is silent now (shieldhit removed); banner + haptic stay
      case 'colLost': banner('LOOTER LOST', 0.9); break;
      case 'upgrade': if (a.id === 'mastery') banner('TANK MASTERY ' + (sim.stats.lv.mastery || 0), 0.9); audio.play('upgrade'); KM.haptic(20); Analytics.track('upgrades_selected', { id: a.id, n: sim.upgrades, t: Math.floor(sim.t) }); break;
      case 'sector': { const S = KM.SECTORS[a]; if (a !== 'opening') banner(S.name + (b ? '\nNEW THREAT' : ''), 1.8); Analytics.track('sector', { k: a, t: Math.floor(sim.t) }); break; }
      case 'bossTell': audio.play('warn'); KM.haptic(15); break;
      case 'stomp': audio.play('boom'); KM.haptic(35); break;
      case 'charge': if (typeof a === 'string') { if (KM.PROD[a]) banner(KM.PROD[a].name + (b ? '\nATTACK' : '\nDEFEND'), 0.9); if (b) audio.play('upgrade'); KM.haptic(12); setPostureUI(); break; } banner('BRACE!', 0.9); break;
      case 'bossFight': audio.boss(!!a); render.viewGuard && render.viewGuard(); setTimeout(() => render.viewGuard && render.viewGuard(), 400); banner(a ? 'BOSS FIGHT\nTHE WAR HOLDS' : 'BOSS DOWN\nADVANCE!', 1.6); if (!a) audio.play('upgrade'); break;
      case 'summon': audio.play('elite', 0, 0); break;
      case 'warn': banner(a === 'boss' ? 'A BOSS APPROACHES' : a === 'mini' ? 'GIANT INCOMING' : 'MASS WAVE INCOMING', 3.2); audio.play('warn'); KM.haptic(25); $('vig').classList.add('warn'); setTimeout(() => $('vig').classList.remove('warn'), 3200); break;
      case 'elite': audio.play('elite', 0, 0); break;
      case 'death': if (daily) onDailyEnd(); else onDeath(); break;
      case 'dailyEnd': onDailyEnd(); break;
      case 'waveStart': { const S = KM.SECTORS[c] || KM.SECTORS.opening; banner('WAVE ' + a + (b === 10 ? '\nBOSS' : '\n' + S.name), 1.4); if (!recordShown && save.records.wave && a > save.records.wave) { recordShown = true; setTimeout(() => banner('NEW RECORD\nWAVE ' + a, 1.8), 1500); audio.play('pb'); } break; }
      case 'waveClear': if (!daily) { checkMilestones(); earnStations(); RunSave.write(sim); } break;   // DAILY: no records, unlocks or saved run
      case 'bossReward': if (daily) { banner('BOSS DEFEATED\n+2,500 POINTS', 1.8); break; } if (!save.paid.includes(a.id)) { save.paid.push(a.id); save.paid = save.paid.slice(-200); bank(a.tokens, a.diamonds, 'boss'); }   // exactly once per boss, even after a reload
        banner('BOSS DEFEATED\n+' + KM.fmtShort(a.gold) + ' GOLD · ' + (a.tokens ? '+' + a.tokens + ' WAR TOKENS' : '+' + a.diamonds + ' DIAMOND'), 2.2); setTimeout(earnStations, 2400); RunSave.write(sim); break;
      case 'forge': audio.play('upgrade'); KM.haptic(15); break;
      case 'consUse': save.cons[a] = Math.max(0, (save.cons[a] || 0) - 1); persist(); banner(KM.CONSUMABLES[a].name, 1.0); audio.play('c_' + a); break;
      case 'bossCard': save.buffs = JSON.parse(JSON.stringify(sim.buffs)); if (a.id === 'cons') save.cons[a.item] = (save.cons[a.item] || 0) + 1; persist(); break;
      case 'levelUp': banner(KM.PROD[a].name + ' LEVEL ' + b, 0.9); break;
      case 'evolve': banner(KM.PROD[a].name + ' VETERANS\nSTRONGER · 2 ARMY POINTS', 1.6); audio.play('pb'); break;
      case 'emergency': if (a) { banner('EMERGENCY DEFENSE', 1.2); KM.haptic(30); } break;
      case 'power': audio.play({ linebreaker: 'pw_lb', arrowstorm: 'pw_as', elemental: 'pw_el', mercenary: 'pw_mc', fortress: 'pw_fo' }[a] || 'boom'); break;   // each power has its own signature, at the moment it lands
      case 'volley': audio.play('pw_rain'); break;   // every Arrow Storm volley, when its damage lands
      case 'beam': break;   // heal sound REMOVED (owner audio review)
      case 'station': audio.station(a); banner('WAR CHANT\n' + (a ? KM.STATION_BY[a].name : 'OFF'), 1.2); break;   // a station picked mid-run starts on this wave's first beat
      case 'crescendo': cresBar = true; break;
      case 'chantBar': audio.sync(SPEEDS[speedI]); if (cresBar) { cresBar = false; audio.stinger('cres'); KM.haptic(12); } break;   // one stinger per drop bar, however many classes answer it
      case 'rally': audio.stinger('rally'); KM.haptic(8); break;
    }
  });

  // ---------- input: horizontal drag slides the tank (= attack lane) · tap the tank deploys one · hold the tank keeps deploying ----------
  let drag = null, moved = 0;
  const worldPerPx = () => 23 / Math.min(innerWidth, innerHeight * 1.1), MOVE_PX = 10, HOLD_MS = 260, HOLD_EVERY = 0.12;
  const onTank = e => { const v = render.toScreen(sim.L.x, 0.6, sim.L.z), sx = (v.x + 1) / 2 * innerWidth, sy = (1 - v.y) / 2 * innerHeight; return Math.hypot(e.clientX - sx, e.clientY - sy) < Math.max(56, (render.layout === 'landscape' ? Math.min(innerWidth, innerHeight) : innerWidth) * 0.16); };
  const tapDeploy = how => { const ok = sim.deployOne(how); if (ok) { Telemetry.count(how); if (tut === 1) setTip(2); } else if (sim.pts + sim.prodPts() > sim.stats.cap) banner('CAPACITY ' + sim.pts + ' / ' + sim.stats.cap + '\n' + KM.PROD[sim.prod].name + ' NEEDS ' + sim.prodPts() + ' CAP', 0.9); return ok; };
  canvas.addEventListener('pointerdown', e => { audio.unlock(); if (state !== 'run' || paused) return; drag = { x: e.clientX, x0: e.clientX, y0: e.clientY, id: e.pointerId, t0: performance.now(), tank: onTank(e), held: 0, acc: 0, horiz: false }; try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* ok */ } });
  canvas.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.horiz && Math.abs(e.clientX - drag.x0) > MOVE_PX) drag.horiz = true;   // past the threshold this touch is a slide, never a deploy
    if (!drag.horiz) return;
    const dx = (e.clientX - drag.x) * worldPerPx() * 1.15; sim.moveBy(dx); drag.x = e.clientX; moved += Math.abs(dx); Telemetry.move(sim.L.tx);
    if (tut === 0 && moved > 4) setTip(1);
  });
  const up = e => { if (!drag || e.pointerId !== drag.id) return; if (drag.tank && !drag.horiz && !drag.held && !sim.auto) tapDeploy('tap'); drag = null; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', e => { if (drag && e.pointerId === drag.id) drag = null; });
  function holdTick(dt) { if (drag && drag.horiz && state === 'run') sim.holdManual();   // a held slide stays manual (AUTO aim never takes over under the finger)
    if (!drag || !drag.tank || drag.horiz || sim.auto || state !== 'run' || paused) return; if (performance.now() - drag.t0 < HOLD_MS) return;
    drag.acc -= dt; if (drag.acc <= 0) { drag.acc = HOLD_EVERY; if (tapDeploy('hold')) drag.held++; } }
  // keyboard fallback for desktop: arrows/A-D slide, Enter deploys
  const keys = {}; addEventListener('keydown', e => { keys[e.key] = 1; if (e.key === 'Escape' && planMode) { planBack(); return; } if (e.key === 'Escape' && state === 'run') setPause(!paused); if ((e.key === ' ' || e.key === 'Enter') && state === 'over') startRun(); if (e.key === 'Enter' && state === 'run' && !paused && !sim.auto) tapDeploy('tap'); });
  addEventListener('keyup', e => { keys[e.key] = 0; });

  // ---------- HUD + prompts ----------
  const tips = [['DRAG LEFT / RIGHT', 'THE TANK CHOOSES THE ATTACK LANE'], ['TAP THE TANK', 'DEPLOYS YOUR SELECTED SOLDIER'], ['LEVEL UP', 'TAP THE SELECTED CLASS AGAIN · THE FIGHT KEEPS GOING'], null];
  function setTip(n) {
    if (n >= 1 && n <= 2 && sim && sim.auto) n = 4;   // AUTO War Plan ignores tank taps: the tap / level-up hints could never be completed
    tut = n; const t = tips[n], el = $('tip');
    if (!t) { el.classList.add('hidden'); save.ach.tutorial = 1; persist(); return; }
    $('tipBig').textContent = t[0]; $('tipSm').textContent = t[1]; $('tipHand').style.display = n === 0 ? '' : 'none'; el.classList.remove('hidden');
    if (n === 3) setTimeout(() => { if (tut === 3) setTip(4); }, 3500);
  }
  let bannerT = 0; function banner(txt, s) { const b = $('banner'); b.textContent = txt; b.classList.add('on'); bannerT = s; }
  let hudAcc = 0;
  // tank position marker: when the command tank is behind the class roster or the right controls, a marker above that panel shows its lane x
  function tankMark() { const el = $('tankMark'); if (!el) return; if (state !== 'run' || !render.toScreen) { el.classList.add('hidden'); return; }
    const p = render.toScreen(sim.L.x, 0.6, sim.L.z), x = (p.x + 1) / 2 * innerWidth, y = (1 - p.y) / 2 * innerHeight; let top = null;
    for (const id of ['classes', 'rightCol']) { const e = $(id); if (!e || $(id === 'classes' ? 'drawer' : 'rightCol').classList.contains('hidden')) continue; /* fixed panels have no offsetParent */ const r = e.getBoundingClientRect(); if (r.width && x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 10 && y <= r.bottom + 10) top = Math.min(top == null ? 1e9 : top, r.top); }
    if (top == null) { el.classList.add('hidden'); return; } el.classList.remove('hidden'); el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(top - 26) + 'px'; }
  function hud(dt) {
    hudAcc += dt; if (hudAcc < 0.1) return; hudAcc = 0;
    tankMark();
    $('hTime').textContent = daily ? KM.fmtTime(Math.max(0, daily.rules.cap - sim.t)) : KM.fmtTime(sim.t); $('hArmy').textContent = sim.count[0]; $('hWave').textContent = Math.max(1, sim.wave);   // icons say what they are: no labels, no maximums
    const cur = v => v < 1e6 ? KM.fmtNum(Math.floor(v)) : KM.fmtShort(v); $('hCoins').textContent = cur(sim.coins); $('hDia').textContent = cur(save.diamonds);
    $('enFill').style.width = (sim.energy / KM.ENERGY_MAX * 100).toFixed(0) + '%';
    const hp = sim.L.hp / sim.stats.maxHp; $('hpFill').style.width = (hp * 100).toFixed(1) + '%'; $('hpFill').style.background = hp > 0.5 ? 'linear-gradient(90deg,#4cff8a,#2fbf4f)' : hp > 0.25 ? 'linear-gradient(90deg,#ffe14a,#ff9a1f)' : 'linear-gradient(90deg,#ff6a4a,#d6281f)';
    $('shFill').style.width = (sim.L.shMax ? Math.min(1, sim.L.sh / sim.L.shMax) * 100 : 0).toFixed(0) + '%';
    $('vig').style.boxShadow = `inset 0 0 120px ${20 + 40 * (1 - hp)}px rgba(220,20,20,${hp < 0.35 ? (0.55 - hp) * (0.8 + 0.2 * Math.sin(performance.now() / 150)) : 0})`;
  }
  // tank HP rides above the tank (the top of the screen stays: time · army · wave · gold · diamonds · settings · speed · mode)
  function tankHpUI() { const el = $('tankHp'); if (state !== 'run') return; const v = render.toScreen(sim.L.x, 2.3, sim.L.z), x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight;
    el.style.left = Math.max(44, Math.min(innerWidth - 44, x)) + 'px'; el.style.top = Math.max(60, Math.min(innerHeight - 20, y)) + 'px'; }



  // ---------- flow ----------
  // ---------- ONE PUBLIC ADDRESS (owner 2026-10-13): keepitil.com/games/kmob/ = this document. Its first view is the static, crawlable
  // marketing home (#kmob-home); PLAY enters the game IN PLACE (War Plan, or the CONTINUE menu when a run is saved) — no other URL,
  // no iframe. HOME, the end-of-run home button and the browser Back button return to it. The 3D scene does not draw behind it.
  const KH = $('kmob-home');
  function khOn() { return !!KH && !KH.hidden; }
  function khShow() { if (!KH || khOn()) return; KH.hidden = false; KH.scrollTop = 0; document.body.classList.add('kh-on'); try { if (history.state && history.state.kmob) history.back(); } catch (e) { /* ok */ } }   // drop the in-game history entry: Back from the home page leaves the site as usual
  function khHide() { if (!KH || !khOn()) return; KH.hidden = true; document.body.classList.remove('kh-on'); try { if (!(history.state && history.state.kmob)) history.pushState({ kmob: 'game' }, ''); } catch (e) { /* ok */ } }
  if (KH) {
    const deep = /^#kh-(privacy|support)$/.test(location.hash) && $(location.hash.slice(1)); if (deep) setTimeout(() => deep.scrollIntoView({ block: 'start' }), 0);   // keepitil.com/games/kmob/#kh-privacy (store privacy / support URLs) opens on that section
    KH.addEventListener('click', e => { const play = e.target.closest('[data-kmob-play]'), sc = e.target.closest('[data-kmob-scroll]');
      if (play) { e.preventDefault(); audio.unlock(); Telemetry.landing('home_play'); khHide(); const rs = RunSave.load(); if (rs) { $('contBtn').classList.remove('hidden'); $('contInfo').textContent = 'WAVE ' + (rs.snap.wave || 1) + ' · ' + KM.fmtTime(rs.snap.t); show('title'); } else openPlan('start'); return; }   // a saved run: the menu offers CONTINUE and PLAY
      if (e.target.closest('[data-kmob-goals]')) { e.preventDefault(); audio.unlock(); khHide(); openGoals('title'); return; }
      if (e.target.closest('[data-kmob-daily]')) { e.preventDefault(); audio.unlock(); Telemetry.landing('home_daily'); khHide(); openDaily(); return; }   // DAILY DEFENSE straight from the home page
      if (sc) { const el = $(sc.dataset.kmobScroll); if (el) el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); } });
    addEventListener('popstate', () => { if (khOn()) return;   // browser Back from the game: save the run and show the home page (same address)
      if (planMode) { const m = planMode; planClose(); if (m === 'run') { paused = false; } }
      if (state === 'run' && daily) { sim.forfeit(); return; }   // Back during a daily ends that attempt (it was counted when it started)
      if (state === 'run') $('menuBtn').onclick(); else goTitle(); });
  }
  function show(id) { for (const s of ['title', 'over', 'pause', 'shop', 'settings', 'plan', 'dailyScr', 'goalsScr']) $(s).classList.toggle('hidden', s !== id); if (id === 'title' || id === 'over') audio.stopMusic(); }
  if (!save.player) { save.player = Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join(''); persist(); }   // anonymous commander id for the boards
  const runOpts = () => ({ seed: (Date.now() ^ (runId * 2654435761)) >>> 0, equip: save.powers.equip, powerLv: save.powers.lv, skins: save.skins.equip, buffs: save.buffs, cons: save.cons, loadout: { perks: save.perks, equip: save.gear.equip, skin: save.season.equip }, mercTier: save.mercTier, plan: save.plan, chant: save.chants.on ? save.chants.station : null });   // the saved WAR PLAN becomes this run's active plan
  let recordShown = false;
  function startRun(resume, dr) {
    khHide(); audio.unlock(); runId++; if (!dr) RunSave.clear(); daily = dr || null;   // DAILY DEFENSE runs leave a saved Endless War run untouched
    let resumed = false;
    if (dr) sim.reset(KM.dailyOpts(dr.rules, dr.station, true));
    else if (resume) { try { sim.reset(runOpts()); sim.restore(resume.snap); resumed = true; } catch (e) { sim.reset(runOpts()); banner('SAVED RUN COULD NOT BE RESTORED', 2); } }
    else sim.reset(runOpts());
    render.resetRun(); applyLooks(); recordShown = false; cresBar = false; audio.station(sim.chant.pack);
    state = 'run'; paused = false; show(null);
    for (const id of ['hud', 'tankHp', 'drawer', 'rightCol']) $(id).classList.remove('hidden'); closePops(); setPostureUI(); drawerUI(); choiceUI(); safeFrame();
    moved = 0; setTip(save.ach.tutorial ? 4 : 0);
    if (save.ach.tutorial) { tut = 4; banner(dr ? 'DAILY DEFENSE\n' + dr.rules.name + (dr.ranked ? '' : ' · PRACTICE') : resumed ? 'CONTINUE WAR' : 'CHOOSE YOUR ARMY', 1.6); }
    Analytics.track(dr ? 'daily_start' : resumed ? 'run_resume' : 'run_start', dr ? { day: dr.day, type: dr.rules.id, ranked: dr.ranked ? 1 : 0, station: dr.station || 'off', attempt: save.daily.ranked } : { run: save.totals.runs + 1, resumeFailed: !!resume && !resumed });
    if (resumed) RunSave.write(sim);
    Telemetry.begin(sim, { quality: render.quality, speed: speedNow(), runN: save.totals.runs + 1, resumed, resumeFailed: !!resume && !resumed });
    hook('start');
  }
  // WAR CHANTS play unlocks (IRON: first boss · FURY: wave 30); kept forever like the other permanent rewards
  function earnStations() { const got = KM.stationEarned(save.chants.owned, { bosses: Math.max(sim.bossesKilled || 0, save.records.bosses || 0), wave: Math.max(sim.wave || 0, save.records.wave || 0) }); if (!got.length) return;
    for (const id of got) save.chants.owned[id] = 1; persist(); banner('NEW WAR CHANT\n' + got.map(id => KM.STATION_BY[id].name).join(' · ') + ' UNLOCKED', 2.2); audio.play('pb'); Analytics.track('chant_unlock', { ids: got.join(','), how: 'play' }); }
  // permanent rewards bank the moment they are earned (bosses, milestones, records) — a long run can never be lost
  function bank(t, d, why) { if (t) save.tokens += t; if (d) save.diamonds += d; persist(); Analytics.track('bank', { tokens: t || 0, diamonds: d || 0, why }); }
  function checkEarly() { for (const m of KM.EARLY_TITLES) if (sim.wave >= m.wave && !save.titles.includes(m.title)) { save.titles.push(m.title); persist(); banner('TITLE EARNED\n' + m.title, 1.8); audio.play('pb'); Analytics.track('title', { t: m.title }); } }   // early wave titles (recognition only)
  function checkMilestones() { checkEarly(); for (const m of KM.MILESTONES) if (sim.wave >= m.wave && !save.titles.includes(m.title)) { save.titles.push(m.title); bank(m.tokens, m.diamonds || 0, 'milestone'); banner(m.title + '\n+' + m.tokens + ' WAR TOKENS', 2.4); audio.play('pb'); } }
  // leaderboard: anonymous best runs — LIFETIME (highest wave ever) and WEEKLY (best run this week); order wave → time → bosses
  KM.PUBLIC_KEY = Telemetry.key; if (KM.Account) KM.Account.load(); if (KM.walletStart) KM.walletStart();   // public anon key (same as leaderboards); account stays dormant while KM.ACCOUNT_ENABLED is false
  const LB = (() => { const BASE = 'https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/', KEY = Telemetry.key;
    const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };
    return { on: Telemetry.on,
      submit(r) { if (!this.on || !r.wave) return; try { fetch(BASE + 'kmob_scores', { method: 'POST', keepalive: true, headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, H), body: JSON.stringify({ player: save.player, wave: r.wave, secs: Math.round(r.time), bosses: r.bosses, week: KM.weekKey(new Date()), assisted: !!(sim.revived || (DEV && (DEV.bot || DEV.debug || DEV.autoplay))), build: KM.BUILD }) }).catch(() => {}); } catch (e) { /* boards are optional */ } },
      top(kind) { if (!this.on) return Promise.resolve(null); const q = kind === 'weekly' ? 'kmob_lb_weekly?week=eq.' + KM.weekKey(new Date()) + '&' : 'kmob_lb_lifetime?'; return fetch(BASE + q + 'select=player,wave,secs,bosses&order=wave.desc,secs.desc,bosses.desc&limit=5', { headers: H }).then(x => x.ok ? x.json() : null).catch(() => null); } }; })();
  function onDeath() {
    audio.play('death'); audio.crowd(0, 0); KM.haptic([40, 60, 80]);
    const r = lastResults = sim.results(); RunSave.clear();
    const { records } = KM.recordRun(save, r); if (records.includes('wave')) bank(1, 0, 'record');   // a new best wave earns a War Token
    const gDone = goalsAfter({ daily: false });
    persist(); LB.submit(r);
    Analytics.track('run_end', { wave: r.wave, survival_time: Math.floor(r.time), death_reason: r.reason, bosses: r.bosses, kills: r.kills, records });
    Telemetry.end(sim, r, { quality: render.quality });
    setTimeout(() => {
      if (state !== 'run') return;
      state = 'over'; $('tip').classList.add('hidden'); lastDaily = false; $('againBtn').textContent = 'TRY AGAIN'; $('over').querySelector('.sv').textContent = 'REACHED';
      $('oTime').textContent = 'WAVE ' + r.wave; $('oPb').textContent = records.length ? '★ NEW RECORD: ' + records.map(k => ({ wave: 'WAVE', time: 'TIME', bosses: 'BOSSES', kills: 'KILLS', army: 'ARMY' })[k]).join(' · ') + ' ★' : 'BEST WAVE ' + save.records.wave + ' · ' + KM.fmtTime(save.records.time);
      if (records.length) audio.play('pb');
      const reason = { breach: 'Enemies broke through the line', bomber: 'Hit by a bomber', siege: 'Hit by siege fire', ranged: 'Shot down', overrun: 'Overrun', quit: 'Run ended' }[r.reason] || 'Overrun by ' + r.reason + 's';
      $('oStats').innerHTML = [['clock', 'Survival Time', KM.fmtTime(r.time)], ['skull', 'Enemies Defeated', KM.fmtNum(r.kills)], ['star', 'Bosses Defeated', r.bosses], ['token', 'War Tokens (banked)', '+' + (r.warTokens + (records.includes('wave') ? 1 : 0))], ['army', 'Army Development', r.armyDev + ' / 60']]
        .map(([i, l, v]) => `<div>${svg(i)}<span>${l}</span><b>${v}</b></div>`).join('') + `<div style="opacity:.7;font-size:12px;justify-content:center">${reason}</div>` + goalsLine(gDone) + `<div id="lbBox" style="font-size:11px;opacity:.85;justify-content:center"></div>`;
      $('reviveBtn').classList.toggle('hidden', !!sim.revived || !(DEV && DEV.revive));
      for (const id of ['drawer', 'rightCol', 'powers', 'tankUps', 'consPop', 'clsPop', 'choice', 'bossBar', 'tankHp']) $(id).classList.add('hidden'); show('over'); hook('death', r);
      LB.top('weekly').then(rows => { const el = $('lbBox'); if (!el || !rows || !rows.length) return; el.innerHTML = 'THIS WEEK: ' + rows.map((x, k) => `${k + 1}. ${x.player === save.player ? 'YOU' : x.player.slice(0, 4)} W${x.wave}`).join(' · '); });
    }, 1300);
  }
  function setPause(p) { if (state !== 'run') return; paused = p; show(p ? 'pause' : null); audio.suspend(p); if (p) { buildToggles($('pToggles')); audio.crowd(0, 0); $('menuBtn').textContent = daily ? 'LEAVE' + (daily.ranked ? ' (ATTEMPT USED)' : '') : 'SAVE & MENU'; } }
  function goTitle() {
    Telemetry.flush('quit');
    const rs = RunSave.load(); $('contBtn').classList.toggle('hidden', !rs); if (rs) $('contInfo').textContent = 'WAVE ' + (rs.snap.wave || 1) + ' · ' + KM.fmtTime(rs.snap.t);
    state = 'title'; for (const id of ['hud', 'tankHp', 'drawer', 'rightCol', 'powers', 'tankUps', 'consPop', 'clsPop', 'choice', 'bossBar', 'tip']) $(id).classList.add('hidden');
    const R = save.records; $('titleBest').innerHTML = `<div class="titleRec"><span><i>BEST WAVE</i><b>${R.wave}</b></span><span><i>LONGEST</i><b>${KM.fmtTime(R.time)}</b></span><span><i>BOSSES</i><b>${R.bosses}</b></span></div>` +
      `<div class="titleBadges"><span>${svg('token')}<b>${save.tokens}</b></span><span>${svg('diamond')}<b>${save.diamonds}</b></span>${save.titles.length ? `<span class="rank">${save.titles[save.titles.length - 1]}</span>` : ''}</div>`;   // records card + currency / rank badges (owner 2026-10-20)
    dailyTitle(); show('title'); khShow(); mark('interactive');
  }
  function buildToggles(el) {
    const rows = [['sound', 'Sound effects'], ['music', 'Music'], ['haptics', 'Vibration']];
    el.innerHTML = rows.map(([k, l]) => `<label>${l}<input type="checkbox" data-k="${k}" ${save.settings[k] ? 'checked' : ''}></label>`).join('') +
      `<div class="chantRow"></div><label class="cvol">Chant sounds<input type="range" min="0" max="100" step="10" data-cv value="${Math.round(save.chants.vol * 100)}" aria-label="Chant sounds volume"></label>`;   // 2.0 WAR CHANTS radio + stinger volume
    el.querySelectorAll('input[data-k]').forEach(inp => inp.onchange = () => { const k = inp.dataset.k; save.settings[k] = inp.checked ? 1 : 0; persist(); if (k === 'sound') audio.setSound(inp.checked); if (k === 'music') audio.setMusic(inp.checked); });
    const cv = el.querySelector('[data-cv]'); cv.oninput = () => audio.setChantVol(+cv.value / 100); cv.onchange = () => { save.chants.vol = +cv.value / 100; persist(); audio.setChantVol(save.chants.vol); };
    chantRow(el.querySelector('.chantRow'));
  }
  // WAR CHANTS radio dial (Settings, pause menu and the WAR PLAN page): OFF or an unlocked station. In a battle the change starts at the next wave.
  function chantRow(el) { if (!el) return; const C = save.chants, run = state === 'run', cur = run ? (sim.chantNext !== undefined ? sim.chantNext : sim.chant.pack) : (C.on ? C.station : null);
    el.innerHTML = `<div class="ch-h"><b>WAR CHANT</b><small>${run ? 'CHANGES AT THE NEXT WAVE' : 'ALL EQUALLY STRONG · DIFFERENT RHYTHM'}</small></div><div class="ch-b">` +
      [null, ...KM.STATIONS.map(x => x.id)].map(id => { const st = id && KM.STATION_BY[id], own = !id || C.owned[id];
        return `<button type="button" data-ch="${id || ''}" class="${cur === id ? 'on' : ''}" ${own ? '' : 'disabled'} aria-pressed="${cur === id}">${st ? (own ? '' : '🔒 ') + st.name + '<small>' + (own ? st.lean : st.unlock.text) + '</small>' : 'OFF<small>NO BONUS</small>'}</button>`; }).join('') + '</div>';
    el.querySelectorAll('button').forEach(b => b.onclick = e => { e.stopPropagation(); const id = b.dataset.ch || null; if (id) { C.station = id; C.on = 1; } else C.on = 0; persist();
      if (run) { sim.setStation(id); banner('WAR CHANT: ' + (id ? KM.STATION_BY[id].name : 'OFF') + '\nSTARTS NEXT WAVE', 1.2); } audio.play('tap'); Analytics.track('chant_pick', { id: id || 'off', run }); chantRow(el); }); }
  let shopTab = 'skins', gearCls = 'melee', skinTier = 0;
  const TIER_COL = ['#c08040', '#c8d0dc', '#ffd23a', '#7fe8ff'];
  const GEAR_GLYPH = {
    bag: '<path d="M18 26h28l4 28H14z" fill="#8a5a2a" stroke="#2a1a0a" stroke-width="2.5"/><path d="M24 26c0-8 16-8 16 0" fill="none" stroke="#2a1a0a" stroke-width="3"/>',
    dagger: '<path d="M32 6l5 30h-10z" fill="#e8eef8" stroke="#3a4458" stroke-width="2"/><rect x="24" y="36" width="16" height="5" rx="2" fill="#8a5a2a"/><rect x="29" y="41" width="6" height="14" rx="2" fill="#5a3a1a"/>',
    boots: '<path d="M20 12h14v26l14 6v8H20z" fill="#6a4a2a" stroke="#2a1a0a" stroke-width="2.5" stroke-linejoin="round"/>',
    bow: '<path d="M22 6c22 10 22 42 0 52" fill="none" stroke="#8a5a2a" stroke-width="4"/><path d="M22 6v52" stroke="#e8e0c8" stroke-width="1.5"/><path d="M12 32h34l-6-4M46 32l-6 4" stroke="#e8eef8" stroke-width="2.5" fill="none"/>',
    quiver: '<rect x="22" y="18" width="18" height="38" rx="5" fill="#8a5a2a" stroke="#2a1a0a" stroke-width="2.5"/><path d="M26 18l-2-12M31 18V4M36 18l2-12" stroke="#e8eef8" stroke-width="2.5"/>',
    armguard: '<path d="M18 16h28l-4 34H22z" fill="#8f9bb0" stroke="#2a3448" stroke-width="2.5"/><path d="M22 26h20M23 36h18" stroke="#2a3448" stroke-width="2"/>',
    sword: '<path d="M32 4l5 38h-10z" fill="#e8eef8" stroke="#3a4458" stroke-width="2"/><rect x="20" y="42" width="24" height="5" rx="2" fill="#ffd23a"/><rect x="29" y="47" width="6" height="12" rx="2" fill="#5a3a1a"/>',
    shield: '<path d="M32 6l20 8v16c0 14-9 23-20 28-11-5-20-14-20-28V14z" fill="#2d58b8" stroke="#0a1a3a" stroke-width="3" stroke-linejoin="round"/><path d="M32 16v34M20 26h24" stroke="#e8eef8" stroke-width="3"/>',
    bodyarmor: '<path d="M18 12l8-4h12l8 4 6 14-8 4v26H20V30l-8-4z" fill="#8f9bb0" stroke="#2a3448" stroke-width="2.5" stroke-linejoin="round"/><path d="M32 12v44" stroke="#2a3448" stroke-width="2"/>',
    staff: '<path d="M30 20l4 0 -2 40z" fill="#8a5a2a"/><circle cx="32" cy="14" r="9" fill="#7fe8ff" stroke="#0a5a8a" stroke-width="2.5"/>',
    spellbook: '<rect x="14" y="12" width="36" height="42" rx="4" fill="#5a2a8a" stroke="#1a0a2a" stroke-width="2.5"/><path d="M32 12v42" stroke="#1a0a2a" stroke-width="2"/><circle cx="41" cy="30" r="5" fill="#ffd23a"/>',
    crystal: '<path d="M32 4l14 18-14 38-14-38z" fill="#9fe8ff" stroke="#0a5a8a" stroke-width="2.5" stroke-linejoin="round"/><path d="M18 22h28" stroke="#0a5a8a" stroke-width="2"/>',
    pike: '<path d="M30 14h4v46h-4z" fill="#8a5a2a"/><path d="M32 2l7 14h-14z" fill="#e8eef8" stroke="#3a4458" stroke-width="2"/>',
    helmet: '<path d="M14 40c0-16 8-28 18-28s18 12 18 28z" fill="#8f9bb0" stroke="#2a3448" stroke-width="2.5"/><rect x="14" y="40" width="36" height="8" rx="3" fill="#6a7690"/><path d="M32 12v-8" stroke="#c8323a" stroke-width="4"/>',
    chest: '<path d="M16 14h32l-2 40H18z" fill="#c8d0dc" stroke="#2a3448" stroke-width="2.5"/><path d="M22 24h20M22 34h20M22 44h20" stroke="#6a7690" stroke-width="2"/>',
    hammer: '<rect x="14" y="8" width="36" height="18" rx="4" fill="#8f9bb0" stroke="#2a3448" stroke-width="2.5"/><rect x="29" y="26" width="6" height="32" rx="2" fill="#5a3a1a"/>',
    gauntlets: '<path d="M20 22h24v24c0 8-6 12-12 12s-12-4-12-12z" fill="#8f9bb0" stroke="#2a3448" stroke-width="2.5"/><path d="M24 22v-10M30 22V8M36 22V9M42 22v-8" stroke="#8f9bb0" stroke-width="5" stroke-linecap="round"/>',
    recruits: '<circle cx="32" cy="18" r="9" fill="#e8b52e" stroke="#6a4a00" stroke-width="2.4"/><path d="M14 58c0-14 8-24 18-24s18 10 18 24z" fill="#e8b52e" stroke="#6a4a00" stroke-width="2.6"/><path d="M22 6l10 4 10-4" stroke="#fff4c2" stroke-width="3" fill="none"/>',
    magnet: '<path d="M16 10v22a16 16 0 0 0 32 0V10h-10v22a6 6 0 0 1-12 0V10z" fill="#ff4a5a" stroke="#5a0a1a" stroke-width="2.5"/><rect x="16" y="10" width="10" height="8" fill="#e8eef8"/><rect x="38" y="10" width="10" height="8" fill="#e8eef8"/>',
    plating: '<rect x="8" y="30" width="48" height="18" rx="5" fill="#2f6dff" stroke="#0a1a3a" stroke-width="2.6"/><path d="M14 30V20h36v10" fill="#8f9bb0" stroke="#2a3448" stroke-width="2.4"/><path d="M20 24h24" stroke="#2a3448" stroke-width="2"/>',
  };
  const TANK_MINI = c => `<svg viewBox="0 0 64 64"><rect x="6" y="30" width="52" height="18" rx="5" fill="${c}" stroke="#0a1a3a" stroke-width="2.6"/><rect x="18" y="20" width="24" height="12" rx="4" fill="${c}" stroke="#0a1a3a" stroke-width="2.4"/><path d="M40 25h18" stroke="#cfd8e8" stroke-width="5" stroke-linecap="round"/></svg>`;
  // SHOP UI (2026-10-19 redesign, layout only). One card per product: name + (i), one large image, short metric chips, the tier being viewed,
  // its cost and ONE action button. Tiered products open on the highest tier the player owns; ‹ › / swipe / dots browse the others.
  // Buying takes two taps (BUY → CONFIRM, which names the exact tier and price); a swipe never buys and nothing moves while confirming.
  // Effects, prices, unlock rules and what a purchase grants are unchanged: every action calls the same pay() / save mutations as before.
  const STAT_S = { dmg: 'DMG', hp: 'HP', arm: 'ARMOR', rof: 'ATK SPD', speed: 'SPEED', carry: 'CARRY', healR: 'HEAL AREA', steady: 'STEADY' };
  const statS = (cls, st) => cls === 'mizard' && st === 'dmg' ? 'HEALING' : STAT_S[st];
  const gearVal = (sl, t) => { const b = KM.equipBonus(sl.stat, t); return sl.stat === 'arm' ? '+' + b : '+' + Math.round(b * 100) + '%'; };
  const skinChips = k => { const e = KM.elemOf(k); return [...Object.entries(k.perks).map(([st, v]) => [STAT_S[st], '+' + Math.round(v * 100) + '%']), ...(k.elem ? [[k.elem.toUpperCase(), e ? 'ON HIT' : 'PENDING']] : [])]; };
  const esc = x => String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  // purchased Diamonds / War Tokens live on the server (iOS app: KM.Purchased mirrors them); earned currency stays in the local save
  const has = cur => save[cur] + (KM.Purchased && KM.Purchased[cur] || 0), short = (cur, n) => save[cur] < n && !(KM.Purchased && KM.Purchased[cur] >= n);
  const box = (inner, tier) => `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="2" y="2" width="60" height="60" rx="14" fill="#0e1a36" stroke="${tier ? TIER_COL[tier - 1] : '#3a4a6a'}" stroke-width="3"/>${inner}</svg>`;
  const skinArt = c => `<div class="pv-skin" style="--c:${c}">${['melee', 'range', 'mizard'].map(k => `<span><img src="${PORTRAIT(k)}" alt=""></span>`).join('')}<span>${TANK_MINI(c)}</span></div>`;   // the set covers all six classes + the tank (listed in (i))
  const gearArt = (cls, sl, t) => `<div class="pv-gear" style="--m:${t ? TIER_COL[t - 1] : '#3a4a6a'}"><img src="${PORTRAIT(cls)}" alt=""><span class="gb"><svg viewBox="0 0 64 64" aria-hidden="true">${GEAR_GLYPH[sl.id]}</svg></span></div>`;
  const CUR = { tokens: ['⚔', 'War Tokens'], diamonds: ['💎', 'Diamonds'] };
  const chantArt = id => { const c = { steel: '#c8d0dc', iron: '#6fb6ff', fury: '#ff6a3a' }[id], h = [5, 9, 14, 7, 12, 4, 10, 15, 8, 6, 13, 9]; return `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="2" y="2" width="60" height="60" rx="14" fill="#0e1a36" stroke="${c}" stroke-width="3"/>${h.map((v, i) => `<rect x="${9 + i * 4}" y="${32 - v}" width="2.6" height="${v * 2}" rx="1.3" fill="${c}" opacity="${0.55 + (i % 3) * 0.15}"/>`).join('')}<circle cx="32" cy="52" r="3" fill="${c}"/></svg>`; };   // WAR CHANTS card: a station's beat bars
  const tierSel = {}, curSel = {}; let conf = null, confTimer = 0, infoKey = null;
  // a product: { key, name, tag, art, chips:[[label,value]], tiers:[{ t, label, art, chips, state, cost, act, btn }], sel, info:{ desc, rows, notes, ctrl } }
  // state: 'buy' (cost + BUY) · 'owned' (btn names the select/equip action) · 'locked' (why) · 'max' · 'free' (select only)
  function products() {
    if (shopTab === 'skins') {
      const best = Math.max(0, ...KM.SEASON.filter(k => save.season.owned[k.id]).map(k => k.tier));
      if (!skinTier) skinTier = best || 1;
      return KM.SEASON.filter(k => k.tier === skinTier).map(k => { const own = save.season.owned[k.id], all = [...KM.PROD_ORDER, 'tank'], eqAll = all.every(x => save.season.equip[x] === k.id);
        return { key: 'sk:' + k.id, name: k.name, tag: 'T' + k.tier, art: skinArt(k.color), chips: skinChips(k),
          state: own ? 'owned' : 'buy', cost: KM.skinCost(k.tier), btn: own ? (eqAll ? 'EQUIPPED ✓' : 'EQUIP ALL') : null, on: own && eqAll,
          buy: () => { save.season.owned[k.id] = 1; }, use: () => { for (const x of all) { if (eqAll) delete save.season.equip[x]; else save.season.equip[x] = k.id; } applyLooks(); },
          info: { desc: 'Season 1 skin set. One purchase covers all six soldier classes and the tank. One skin per unit; an unequipped skin gives no bonus.', rows: [['Tier', 'T' + k.tier], ['Bonus', KM.perkTxt(k) || 'cosmetic'], ['Price', KM.skinCost(k.tier).tokens + ' War Tokens or ' + KM.skinCost(k.tier).diamonds + ' Diamonds']],
            notes: k.elem && !KM.elemOf(k) ? 'The ' + k.elem + ' effect is shown but has no effect until its numbers are approved.' : '',
            ctrl: own ? all.map(x => `<button data-eq1="${x}" class="${save.season.equip[x] === k.id ? 'on' : ''}">${x === 'tank' ? 'TANK' : KM.PROD[x].name}</button>`).join('') : '' },
          eq1: x => { if (save.season.equip[x] === k.id) delete save.season.equip[x]; else save.season.equip[x] = k.id; applyLooks(); } }; });
    }
    if (shopTab === 'gear') return KM.EQUIP[gearCls].map(sl => { const key = gearCls + '.' + sl.id, owned = save.gear.owned[key] || [], E = save.gear.equip[gearCls] || {}, eq = E[sl.id] || 0;
      return { key: 'g:' + key, name: sl.name, def: Math.max(0, ...owned) || 1,
        tiers: [1, 2, 3, 4].map(t => { const own = owned.includes(t);
          return { t, label: 'T' + t + ' · ' + KM.EQUIP_TIERS[t - 1], art: gearArt(gearCls, sl, t), chips: [[statS(gearCls, sl.stat), gearVal(sl, t)]], state: own ? 'owned' : 'buy', cost: KM.equipCost(t),
            btn: own ? (eq === t ? 'EQUIPPED ✓' : 'EQUIP') : null, on: own && eq === t,
            buy: () => { save.gear.owned[key] = [...owned, t].sort(); (save.gear.equip[gearCls] = save.gear.equip[gearCls] || {})[sl.id] = t; },
            use: () => { const X = save.gear.equip[gearCls] = save.gear.equip[gearCls] || {}; if (X[sl.id] === t) delete X[sl.id]; else X[sl.id] = t; } }; }),
        info: { desc: `${KM.PROD[gearCls].name} equipment. Bought once per class and owned forever; every ${KM.PROD[gearCls].name} uses the equipped tier, and it shows on the soldier in that tier's metal.`,
          rows: [1, 2, 3, 4].map(t => ['T' + t + ' ' + KM.EQUIP_TIERS[t - 1], gearVal(sl, t) + ' ' + statS(gearCls, sl.stat).toLowerCase() + ' · ' + KM.equipCost(t).tokens + ' ⚔ / ' + KM.equipCost(t).diamonds + ' 💎' + (owned.includes(t) ? ' · owned' : '')]),
          notes: 'Equipment bonus values are defaults pending approval.' } }; });
    if (shopTab === 'perks') return KM.PERK_IDS.map(id => { const P = KM.PERKS[id], cur = save.perks[id] || 0;
      return { key: 'pk:' + id, name: P.name, def: cur || 1,
        tiers: [1, 2, 3].slice(0, P.max).map(t => ({ t, label: 'TIER ' + t, art: box(GEAR_GLYPH[id], t), chips: perkChips(id, t),
          state: t <= cur ? 'owned' : t === cur + 1 ? 'buy' : 'locked', cost: KM.perkCost(t), lock: 'BUY TIER ' + (cur + 1) + ' FIRST', btn: 'OWNED ✓', on: t <= cur,
          buy: () => { save.perks[id] = t; } })),
        info: { desc: P.desc(1).replace(/\d+/g, '…'), rows: [1, 2, 3].slice(0, P.max).map(t => ['Tier ' + t, P.desc(t) + ' · ' + KM.perkCost(t).tokens + ' ⚔ / ' + KM.perkCost(t).diamonds + ' 💎']), notes: 'Tiers are bought in order and kept forever.' } }; });
    if (shopTab === 'items') return KM.CONS_IDS.map(id => ({ key: 'cs:' + id, name: KM.CONSUMABLES[id].name, tag: 'OWNED ×' + (save.cons[id] || 0), art: box(CONS_ART[id]), chips: consChips(id),
      state: 'buy', cost: KM.CONS_PRICE, buy: () => { save.cons[id] = (save.cons[id] || 0) + 1; },
      info: { desc: KM.CONSUMABLES[id].desc + '.', rows: [['Price', KM.CONS_PRICE.tokens + ' War Tokens or ' + KM.CONS_PRICE.diamonds + ' Diamond'], ['You own', String(save.cons[id] || 0)]], notes: 'Kept until you use it from ITEMS during a battle; buying never fires it.' } }));
    if (shopTab === 'powers') return KM.POWER_IDS.map(id => { const P = KM.POWERS[id], lv = save.powers.lv[id] || 0, eq = save.powers.equip.includes(id), max = lv >= KM.POWER_MAX;
      const ctrl = `<button data-peq="1" class="${eq ? 'on' : ''}">${eq ? 'EQUIPPED ✓ (tap to remove)' : 'EQUIP (max 3)'}</button>` + (id === 'mercenary' ? KM.MERC_TIERS.map((m, k) => `<button data-mt="${k + 1}" class="${save.mercTier === k + 1 ? 'on' : ''}">TIER ${k + 1} · ${m.n} mercs · ${m.energy} ⚡</button>`).join('') : '');
      return { key: 'pw:' + id, name: P.name, tag: (eq ? 'EQUIPPED · ' : '') + 'LV ' + lv + '/' + KM.POWER_MAX, art: `<span class="pv-ico">${svg(id)}</span>`,
        chips: [['POWER', '+' + lv * 10 + '%'], ['ENERGY', String(id === 'mercenary' ? KM.MERC_TIERS[save.mercTier - 1].energy : P.cost)]].concat(max ? [] : [['NEXT', '+' + (lv + 1) * 10 + '%']]),
        state: max ? 'max' : 'buy', cost: KM.powerCost(lv), buyLabel: 'LEVEL ' + (lv + 1), buy: () => { save.powers.lv[id] = lv + 1; },
        info: { desc: P.desc + '. Each permanent level adds +10% power.', rows: [['Level', lv + ' / ' + KM.POWER_MAX], ['Energy', String(id === 'mercenary' ? KM.MERC_TIERS[save.mercTier - 1].energy : P.cost)], ['Next level', max ? '—' : KM.powerCost(lv).tokens + ' ⚔ / ' + KM.powerCost(lv).diamonds + ' 💎']],
          notes: 'Up to 3 powers are equipped for battle.' + (id === 'mercenary' ? ' Choose the Mercenary tier below.' : ''), ctrl } }; });
    if (shopTab === 'chants') return KM.STATIONS.map(st => { const own = !!save.chants.owned[st.id], eq = !!save.chants.on && save.chants.station === st.id, P = KM.CHANT_PACKS[st.id];
      return { key: 'ch:' + st.id, name: st.name, tag: own ? st.lean : '🔒 ' + st.unlock.text, art: chantArt(st.id), chips: [['SONG', st.song], ['BPM', String(P.bpm)]],
        state: own ? 'owned' : 'buy', cost: KM.STATION_COST, buyLabel: 'UNLOCK', btn: own ? (eq ? 'PLAYING ✓' : 'PLAY') : null, on: eq,
        buy: () => { save.chants.owned[st.id] = 1; save.chants.station = st.id; save.chants.on = 1; }, use: () => { save.chants.station = st.id; save.chants.on = 1; },
        info: { desc: st.desc + ' Every war chant is equally strong: they change WHEN your army is strong, not how strong.', rows: [['Song', st.song + ' by KEEPITIL'], ['Tempo', P.bpm + ' BPM'], ['Unlock', st.unlock ? st.unlock.text + ' (free), or ' + KM.STATION_COST.tokens + ' War Tokens / ' + KM.STATION_COST.diamonds + ' Diamonds' : 'Free']],
          notes: 'Loud bars boost classes on ATTACK, calm bars boost classes on DEFEND, and each drop fires every class\'s Crescendo. It all works with the sound off.' } }; });
    if (shopTab === 'armory') return KM.SKINS.filter(k => save.skins.owned[k.id]).map(k => { const eq = save.skins.equip[k.cls] === k.id;
      return { key: 'ar:' + k.id, name: k.name, tag: k.cls.toUpperCase(), art: k.cls === 'tank' ? `<span class="pv-ico">${TANK_MINI(k.color)}</span>` : `<div class="pv-gear" style="--m:${k.color}"><img src="${PORTRAIT(k.cls)}" alt=""></div>`,
        chips: [[k.desc, '']], state: 'owned', btn: eq ? 'EQUIPPED ✓' : 'EQUIP', on: eq, use: () => { if (eq) { if (k.cls !== 'tank') delete save.skins.equip[k.cls]; } else save.skins.equip[k.cls] = k.id; applyLooks(); },
        info: { desc: 'Legacy skin (no longer sold).', rows: [['Class', k.cls], ['Bonus', k.desc]] } }; });
    // 💎 (website only): the six approved packs, bought with Stripe Checkout; credited by the server webhook, never by the browser
    const A = KM.Account, open = !!(KM.WEB_STORE && A && (KM.WEB_PUBLIC || KM.WEB_PREVIEW)), signed = !!(A && A.session), ready = open && (KM.WEB_PUBLIC || !!(A.wallet && A.wallet.webBuy));
    return WEB_PACKS.map(([id, n, cur, usd]) => ({ key: 'wp:' + id, name: n + ' ' + CUR[cur][1], art: `<span class="pv-ico pv-cur">${cur === 'diamonds' ? '💎' : '⚔️'}</span>`, chips: [[CUR[cur][1].toUpperCase(), '+' + n]],
      state: ready ? 'web' : 'soon', price: usd, pid: id,
      info: { desc: n + ' ' + CUR[cur][1] + ' for your KMOB account, paid with Stripe Checkout. They are added to the same account on the website and the iPhone app.', rows: [['Price', usd + ' (USD)'], ['You get', n + ' ' + CUR[cur][1]], ['Payment', 'Stripe Checkout (card, Apple Pay, Google Pay where available)']],
        notes: ready ? (signed ? '' : 'Sign in above to buy.') : 'Website checkout is not active yet.' } }));
  }
  const WEB_PACKS = [['diamonds_5', 5, 'diamonds', '$0.99'], ['diamonds_55', 55, 'diamonds', '$4.99'], ['diamonds_120', 120, 'diamonds', '$9.99'], ['tokens_15', 15, 'tokens', '$0.99'], ['tokens_165', 165, 'tokens', '$4.99'], ['tokens_360', 360, 'tokens', '$9.99']];
  let webMsg = '', webBusy = false, signAsk = false;   // signAsk: false | 'buy' | 'ranked'   // signAsk: the "create an account" reminder shown when a signed-out player taps BUY (owner 2026-10-24)
  function accountCard() {
    const A = KM.Account; if (!A || !KM.WEB_STORE || !(KM.WEB_PUBLIC || KM.WEB_PREVIEW)) return '';
    if (!A.session) return `<div class="pc pc-acct"><b class="pc-n">YOUR ACCOUNT</b><p>Free play never needs an account. Sign in to buy — purchases stay on your KEEPITIL account, on this website and in the iPhone app.</p>
      <button class="pc-act sec" data-web="apple"> Sign in with Apple</button><button class="pc-act sec" data-web="google">Sign in with Google</button>
      <div class="pc-email"><input id="webEmail" type="email" placeholder="email for a sign-in link" autocomplete="email"><button class="pc-act sec" data-web="link">SEND LINK</button></div>${webMsg || KM.webNotice ? `<p class="pc-msg">${esc(webMsg || KM.webNotice)}</p>` : ''}</div>`;
    const w = A.wallet || {};
    return `<div class="pc pc-acct"><b class="pc-n">SIGNED IN</b><p>${esc(A.session.user.email || 'KEEPITIL account')}${A.mode === 'test' ? ' · TEST MODE (no real charges)' : ''}</p>
      <div class="pc-m"><span><i>PURCHASED 💎</i><b>${w.diamonds ?? '…'}</b></span><span><i>PURCHASED ⚔</i><b>${w.tokens ?? '…'}</b></span></div>
      <div class="pc-cost"><button data-web="signout">SIGN OUT</button><button data-web="del">DELETE ACCOUNT</button></div>${webMsg || KM.webNotice ? `<p class="pc-msg">${esc(webMsg || KM.webNotice)}</p>` : ''}</div>`;
  }
  const perkChips = (id, t) => id === 'recruits' ? [['ELITES', '+' + KM.RECRUITS(t).n], ['ENERGY', String(KM.RECRUITS(t).energy)]] : id === 'magnet' ? [['PICKUP', '+' + 10 * t + '%']] : [['TANK HP', '+' + 10 * t]];
  const consChips = id => ({ warcry: [['DMG', '+25%'], ['TIME', '1 WAVE']], titan: [['GIANT', '2×'], ['CAP', 'FREE']], barrage: [['WEAPON', 'AUTO'], ['TIME', '1 WAVE']], fortress: [['ARMOR', '+25%'], ['TIME', '1 WAVE']], rapid: [['ATK SPD', '+25%'], ['TIME', '1 WAVE']], contract: [['MERCS', '+' + KM.CONTRACT.n], ['TIME', KM.CONTRACT.dur + ' S']] })[id] || [];
  // the tier a card shows: what the player picked, else the highest owned (else the first); never above what exists
  const view = P => { if (!P.tiers) return P; const n = P.tiers.length; let i = tierSel[P.key]; if (i == null) i = P.tiers.findIndex(x => x.t === P.def); i = Math.max(0, Math.min(n - 1, i)); tierSel[P.key] = i; return Object.assign({}, P, P.tiers[i], { idx: i }); };
  const pickCur = (key, cost) => curSel[key] || (!short('tokens', cost.tokens) ? 'tokens' : !short('diamonds', cost.diamonds) ? 'diamonds' : 'tokens');   // a currency the player picked is never swapped for them; the default is the first affordable one
  function card(P) {
    const V = view(P), k = P.key, cf = conf && conf.key === k;
    let foot = '';
    if (V.state === 'buy') { const cur = pickCur(k, V.cost); curSel[k] = cur;
      foot = `<div class="pc-cost">${['tokens', 'diamonds'].map(c => `<button data-cur="${c}" class="${c === cur ? 'on' : ''}" ${cf ? 'disabled' : ''} aria-pressed="${c === cur}">${CUR[c][0]} ${V.cost[c]}</button>`).join('')}</div>` +
        (cf ? `<button class="pc-act cf" data-act="confirm">CONFIRM · ${conf.label}</button>`
          : `<button class="pc-act" data-act="buy" ${short(cur, V.cost[cur]) ? 'disabled' : ''}>${short(cur, V.cost[cur]) ? 'NEED ' + V.cost[cur] + ' ' + CUR[cur][0] : 'BUY ' + (V.buyLabel || (V.tiers ? 'T' + V.t : ''))}</button>`); }
    else if (V.state === 'owned') foot = V.use ? `<button class="pc-act ${V.on ? 'on' : 'sec'}" data-act="use">${V.btn}</button>` : `<button class="pc-act on" disabled>${V.btn}</button>`;
    else if (V.state === 'locked') foot = `<button class="pc-act" disabled>🔒 ${V.lock}</button>`;
    else if (V.state === 'max') foot = '<button class="pc-act on" disabled>MAX LEVEL ✓</button>';
    else if (V.state === 'web') foot = `<div class="pc-cost"><span class="pc-price">${V.price}</span></div><button class="pc-act" data-act="checkout" ${webBusy ? 'disabled' : ''}>BUY</button>`;
    else foot = `<div class="pc-cost"><span class="pc-price">${V.price}</span></div><button class="pc-act" disabled>COMING SOON</button>`;
    const nav = P.tiers ? `<div class="pc-tn"><button data-tier="-1" aria-label="Lower tier" ${V.idx === 0 || cf ? 'disabled' : ''}>‹</button><div class="pc-dots">${P.tiers.map((x, i) => `<button data-ti="${i}" class="${i === V.idx ? 'sel ' : ''}${x.state === 'owned' ? 'own' : x.state === 'locked' ? 'lock' : ''}" aria-label="Tier ${x.t}${x.state === 'owned' ? ', owned' : x.state === 'locked' ? ', locked' : ''}" ${cf ? 'disabled' : ''}>${x.t}</button>`).join('')}</div><button data-tier="1" aria-label="Higher tier" ${V.idx === P.tiers.length - 1 || cf ? 'disabled' : ''}>›</button></div>` : '';
    return `<div class="pc ${V.on ? 'eq' : ''}" data-p="${k}"><div class="pc-h"><b class="pc-n">${esc(P.name)}</b>${V.label || P.tag ? `<span class="pc-tag">${esc(V.label || P.tag)}</span>` : ''}<button class="pc-i" data-act="info" aria-label="Details: ${esc(P.name)}">i</button></div>` +
      `<div class="pc-img" data-swipe="${P.tiers ? 1 : ''}">${V.art}</div>${nav}<div class="pc-m">${(V.chips || []).map(([a, b]) => `<span><i>${esc(a)}</i>${b ? `<b>${esc(b)}</b>` : ''}</span>`).join('')}</div>${foot}</div>`;
  }
  function openShop(back) {
    Analytics.track('shop_open', { tokens: save.tokens, diamonds: save.diamonds });
    const pay = (c, how) => { if (how === 't' && save.tokens >= c.tokens) { save.tokens -= c.tokens; return 'tokens'; } if (how === 'd' && save.diamonds >= c.diamonds) { save.diamonds -= c.diamonds; return 'diamonds'; }
      const P = KM.Purchased, cur = how === 't' ? 'tokens' : how === 'd' ? 'diamonds' : null;   // not enough earned: spend purchased currency once, through the server
      if (P && cur && P[cur] >= c[cur] && P.spend(cur, c[cur])) return cur + ':purchased'; return null; };   // one confirmed press = one charge, only when affordable
    const cancelConf = () => { conf = null; clearTimeout(confTimer); };
    let list = [];
    const draw = () => {
      $('shopTok').innerHTML = ['tokens', 'diamonds'].map(c => `<span class="bal">${svg(c === 'tokens' ? 'token' : 'diamond')}<b>${has(c)}</b></span>`).join('');
      for (const b of $('shopTabs').children) b.classList.toggle('on', b.dataset.t === shopTab);
      list = products(); const G = $('shopGrid');
      const sub = shopTab === 'gear' ? `<div class="pc-sub">${KM.PROD_ORDER.map(c => `<button data-gc="${c}" class="${gearCls === c ? 'on' : ''}"><img src="${PORTRAIT(c)}" alt=""><span>${KM.PROD[c].name}</span></button>`).join('')}</div>`
        : shopTab === 'currency' ? accountCard()
        : shopTab === 'skins' ? `<div class="pc-sub pc-tiers">${[1, 2, 3, 4].map(t => `<button data-st="${t}" class="${skinTier === t ? 'on' : ''}${KM.SEASON.some(k => k.tier === t && save.season.owned[k.id]) ? ' own' : ''}">TIER ${t}</button>`).join('')}</div>` : '';
      G.innerHTML = sub + (list.map(card).join('') || '<div class="pc-empty">No legacy skins owned.</div>');
      const I = infoKey && list.find(x => x.key === infoKey);
      $('shopInfo').classList.toggle('hidden', !I && !signAsk);
      if (signAsk && !I) $('shopInfo').innerHTML = `<div class="si-card si-sign" role="dialog" aria-label="Create an account"><div class="pc-h"><b class="pc-n">CREATE AN ACCOUNT</b><button class="pc-i" data-close aria-label="Close">✕</button></div>` +
        `<p>${signAsk === 'ranked' ? 'Sign in to play ranked Daily Defense. Verified scores, badges and War Tokens are saved to your KEEPITIL account. Practice never needs an account.' : 'To save your purchase history, create an account. Your Diamonds and War Tokens stay on your KEEPITIL account, on this website and in the iPhone app.'}</p>` +
        `<button class="pc-act sec" data-web="apple"> Sign in with Apple</button><button class="pc-act sec" data-web="google">Sign in with Google</button>` +
        `<div class="pc-email"><input id="webEmail2" type="email" placeholder="email for a sign-in link" autocomplete="email"><button class="pc-act sec" data-web="link">SEND LINK</button></div>${webMsg ? `<p class="pc-msg">${esc(webMsg)}</p>` : ''}<button class="pc-act sec" data-close>NOT NOW</button></div>`;
      if (I) { const V = view(I); $('shopInfo').innerHTML = `<div class="si-card" role="dialog" aria-label="${esc(I.name)} details"><div class="pc-h"><b class="pc-n">${esc(I.name)}</b><button class="pc-i" data-close aria-label="Close details">✕</button></div><div class="pc-img">${V.art}</div>` +
        `<p>${esc(I.info.desc)}</p><table>${I.info.rows.map(([a, b]) => `<tr><th>${esc(a)}</th><td>${esc(b)}</td></tr>`).join('')}</table>${I.info.notes ? `<p class="si-n">${esc(I.info.notes)}</p>` : ''}${I.info.ctrl ? `<div class="si-ctrl">${I.info.ctrl}</div>` : ''}</div>`; }
    };
    const act = (P, a) => { const V = view(P);
      if (a === 'info') { infoKey = P.key; cancelConf(); audio.play('tap'); return draw(); }
      if (a === 'buy' && V.state === 'buy') { const cur = curSel[P.key]; if (short(cur, V.cost[cur])) return;
        conf = { key: P.key, idx: V.idx, cur, n: V.cost[cur], label: (V.tiers ? 'T' + V.t + ' · ' : '') + V.cost[cur] + ' ' + CUR[cur][0] }; audio.play('tap');
        clearTimeout(confTimer); confTimer = setTimeout(() => { conf = null; draw(); }, 4000); return draw(); }
      if (a === 'confirm' && conf && conf.key === P.key) { const c = conf; cancelConf();   // buy exactly the tier + price that were confirmed
        const W = P.tiers ? Object.assign({}, P, P.tiers[c.idx]) : P; if (W.state !== 'buy' || W.cost[c.cur] !== c.n) return draw();
        const how = pay(W.cost, c.cur === 'tokens' ? 't' : 'd'); if (how) { W.buy(); audio.play('upgrade'); Analytics.track(P.key.startsWith('pw:') ? 'power_up' : 'item_purchase', { id: P.key + (W.t ? ':' + W.t : ''), with: how }); persist(); applyLooks(); }
        return draw(); }
      if (a === 'use' && V.use) { V.use(); audio.play('tap'); persist(); return draw(); }
      if (a === 'checkout' && KM.Account && !KM.Account.session) { signAsk = 'buy'; infoKey = null; webMsg = ''; audio.play('tap'); return draw(); }   // reminder first: purchases need an account
      if (a === 'checkout' && KM.Account && KM.Account.session && !webBusy) { webBusy = true; webMsg = 'Opening secure checkout…'; draw();   // Stripe's hosted page is the confirmation step
        KM.Account.wallet_({ action: 'stripe_checkout', productId: V.pid }).then(r => { if (r && /^https:\/\/checkout\.stripe\.com\//.test(r.url)) location.href = r.url; else throw new Error('checkout unavailable'); })
          .catch(e => { webBusy = false; webMsg = 'Checkout unavailable: ' + e.message; draw(); }); } };
    const G = $('shopGrid');
    let sw = null;
    G.onpointerdown = e => { const im = e.target.closest('[data-swipe="1"]'); sw = im ? { x: e.clientX, y: e.clientY, key: im.closest('.pc').dataset.p } : null; };
    G.onpointerup = e => { if (!sw || conf) { sw = null; return; } const dx = e.clientX - sw.x, dy = e.clientY - sw.y, P = list.find(x => x.key === sw.key); sw = null;
      if (P && Math.abs(dx) > 36 && Math.abs(dx) > 1.5 * Math.abs(dy)) { tierSel[P.key] = (tierSel[P.key] || 0) + (dx < 0 ? 1 : -1); audio.play('tap'); draw(); } };
    G.onclick = e => { const t = e.target.closest('button'); if (!t) { if (conf) { cancelConf(); draw(); } return; } const d = t.dataset;
      if (d.web) return webAct(t, d);

      if (d.gc) { gearCls = d.gc; cancelConf(); audio.play('tap'); return draw(); }
      if (d.st) { skinTier = +d.st; cancelConf(); audio.play('tap'); return draw(); }
      const P = list.find(x => x.key === (t.closest('.pc') || {}).dataset?.p); if (!P) return;
      if (conf && conf.key !== P.key) cancelConf();
      if (d.tier) { tierSel[P.key] = (tierSel[P.key] || 0) + +d.tier; audio.play('tap'); return draw(); }
      if (d.ti) { tierSel[P.key] = +d.ti; audio.play('tap'); return draw(); }
      if (d.cur) { curSel[P.key] = d.cur; audio.play('tap'); return draw(); }
      if (d.act) act(P, d.act); };
    function webAct(t, d) { const A = KM.Account, done = m => { webMsg = m; webBusy = false; draw(); }; audio.play('tap'); webMsg = '';
        if (d.web === 'apple' || d.web === 'google') return A.signInWith(d.web);
        if (d.web === 'link') { webBusy = true; return A.sendLink((($('webEmail2') || $('webEmail')) || {}).value).then(() => done('Check your email and open the KEEPITIL sign-in link on this device.'), e => done(e.message)); }
        if (d.web === 'signout') { A.signOut(); return done('Signed out.'); }
        if (d.web === 'del') { if (t.dataset.sure) return A.deleteAccount().then(() => done('Your KMOB account was deleted. Your KEEPITIL login for other apps is unchanged.'), e => done(e.message));
          t.dataset.sure = 1; t.textContent = 'TAP AGAIN TO DELETE'; return; } }
    $('shopInfo').onclick = e => { const t = e.target.closest('button'); const P = list.find(x => x.key === infoKey);
      if (e.target === $('shopInfo') || (t && t.dataset.close != null)) { infoKey = null; signAsk = false; audio.play('tap'); return draw(); }
      if (t && t.dataset.web) return webAct(t, t.dataset);
      if (!t || !P) return; const d = t.dataset;
      if (d.eq1 && P.eq1) { P.eq1(d.eq1); audio.play('tap'); persist(); return draw(); }
      if (d.peq) { const id = P.key.slice(3), E = save.powers.equip; if (E.includes(id)) { if (E.length > 1) E.splice(E.indexOf(id), 1); } else { E.push(id); if (E.length > 3) E.shift(); } audio.play('tap'); persist(); return draw(); }
      if (d.mt) { save.mercTier = +d.mt; audio.play('tap'); persist(); return draw(); } };
    if (NATIVE) { const cb = $('shopTabs').querySelector('[data-t="currency"]'); if (cb) cb.remove(); }   // iOS: real-money packs are in the STORE (Apple In-App Purchase)
    for (const b of $('shopTabs').children) b.onclick = () => { shopTab = b.dataset.t; cancelConf(); infoKey = null; audio.play('tap'); draw(); };
    KM.shopRedraw = draw;   // the native STORE redraws the SHOP balance after a purchase
    cancelConf(); infoKey = null; skinTier = 0; for (const k in tierSel) delete tierSel[k]; for (const k in curSel) delete curSel[k];   // every visit opens on the highest owned tier
    draw(); show('shop'); $('shopClose').onclick = () => { cancelConf(); infoKey = null; audio.play('tap'); back(); };
  }

  $('playBtn').onclick = () => { Telemetry.landing('play'); openPlan('start'); };   // HOME → PLAY → WAR PLAN → START BATTLE
  $('contBtn').onclick = () => { const rs = RunSave.load(); Telemetry.landing('continue'); startRun(rs || null); };
  $('menuBtn').onclick = () => { if (daily) { paused = false; show(null); audio.suspend(false); sim.forfeit(); return; } RunSave.write(sim); paused = false; audio.suspend(false); state = 'menu'; hook('leave', false); goTitle(); };
  $('againBtn').onclick = () => { hook('leave', true); if (lastDaily) return openDaily(); startRun(); };
  $('homeBtn').onclick = () => { hook('leave', false); goTitle(); };
  $('shopBtn1').onclick = () => { Telemetry.landing('shop'); openShop(goTitle); };
  $('shopBtn2').onclick = () => openShop(() => show('over'));
  $('setBtn1').onclick = () => { buildToggles($('sToggles')); show('settings'); };
  $('setClose').onclick = () => goTitle();
  $('pauseBtn').onclick = () => setPause(true);
  $('resumeBtn').onclick = () => setPause(false);
  $('quitBtn').onclick = () => { paused = false; show(null); audio.suspend(false); if (daily) sim.forfeit(); else sim.hurtLauncher(1e9, 'quit'); };
  $('reviveBtn').onclick = () => { if (sim.revive()) { state = 'run'; show(null); Analytics.track('revive_used', {}); } };
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (state === 'run') RunSave.write(sim); if (state === 'run' && !paused) setPause(true); audio.suspend(true); } else if (!paused) audio.suspend(false); });
  // ---------- layout: portrait (base CSS) · desktop · phone landscape — one simulation; only the HUD and the camera reflow ----------
  // the same queries as index.html: desktop needs a tall window, so a short landscape phone always gets the phone-landscape layout
  const DESK_Q = matchMedia('(min-aspect-ratio:5/4) and (min-width:820px) and (min-height:541px)'), LAND_Q = matchMedia('(orientation:landscape) and (max-height:540px)');
  const layoutNow = () => LAND_Q.matches ? 'landscape' : DESK_Q.matches ? 'desktop' : 'portrait';
  let holdUntil = 0, safeCol = [0, innerWidth];   // holdUntil: wall-clock end of the silent reflow hold (ms, rAF time base)
  const insetEl = document.createElement('div'); insetEl.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)'; document.body.appendChild(insetEl);
  const measure = (ids, fn) => { const tmp = ids.map($).filter(e => e.classList.contains('hidden')); for (const e of tmp) { e.style.visibility = 'hidden'; e.classList.remove('hidden'); } try { return fn(); } finally { for (const e of tmp) { e.classList.add('hidden'); e.style.visibility = ''; } } };
  // landscape framing inputs for the camera: HUD row height, home-bar inset, and the free centre column between the roster and the right column
  function safeFrame() {
    if (render.layout !== 'landscape') { delete render.safeTopPx; delete render.safeBotPx; delete render.safeSideNdc; safeCol = [0, innerWidth]; return; }
    measure(['hud', 'drawer', 'rightCol'], () => { const cs = getComputedStyle(insetEl), dr = $('drawer'), rc = $('rightCol');
      const left = dr.offsetLeft + dr.offsetWidth, right = rc.offsetLeft, half = innerWidth / 2;   // offsets ignore the collapse transform: frame for the open roster
      safeCol = [left, right]; render.safeTopPx = Math.ceil($('hud').getBoundingClientRect().bottom) + 8; render.safeBotPx = parseFloat(cs.paddingBottom) || 0;
      render.safeSideNdc = Math.max(0.3, Math.min(1, (Math.min(half - left, right - half) - 6) / half)); });
  }
  // orientation / layout change mid-run: same battle, no PAUSED screen — a short silent hold while the HUD reflows and the camera snaps
  function relayout(transition) {
    const lay = layoutNow(), changed = lay !== render.layout; render.layout = lay; render.resize(); safeFrame();
    if (!changed && !transition) return;                                       // same composition (desktop window resize, toolbars): the camera eases
    render.camT = null; render.camD = null; render.fitD = null; render.fitT = 0;
    if (changed) { closePops(); drag = null; if (state === 'run') holdUntil = Math.max(holdUntil, performance.now() + 300); }
    if (paused && !glLost && !introOn) render.frame(sim, 0);                    // the resize cleared the canvas and a paused loop does not redraw
  }
  const onLayout = () => { const was = render.layout; relayout(false); if (render.layout !== was) { requestAnimationFrame(() => relayout(true)); setTimeout(() => relayout(true), 250); } };   // iOS reports the final size late
  addEventListener('resize', onLayout);
  // VIEWPORT GUARD (P0): the battlefield always fills the screen. iOS can scroll / offset the visual viewport (toolbar changes,
  // home-screen mode resume, rotation, overlays), which slides the fixed canvas up and leaves the lower screen dark. Undo any page
  // scroll and re-fit the drawing buffer whenever the canvas box and the window disagree.
  function viewGuard() {
    const se = document.scrollingElement || document.documentElement; if (scrollX || scrollY || se.scrollTop || se.scrollLeft || document.body.scrollTop) { scrollTo(0, 0); se.scrollTop = 0; se.scrollLeft = 0; document.body.scrollTop = 0; }
    const cv = $('c'), w = cv.clientWidth, h = cv.clientHeight; if (w && h && (Math.abs(w - (render.sizeW || 0)) > 1 || Math.abs(h - (render.sizeH || 0)) > 1)) relayout(true);
  }
  render.viewGuard = viewGuard;
  if (window.visualViewport) { visualViewport.addEventListener('resize', () => { viewGuard(); onLayout(); }); visualViewport.addEventListener('scroll', viewGuard); }
  for (const ev of ['orientationchange', 'pageshow', 'focus']) addEventListener(ev, () => { viewGuard(); setTimeout(viewGuard, 300); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { viewGuard(); setTimeout(viewGuard, 300); } });
  addEventListener('scroll', viewGuard, { passive: true });
  for (const q of [LAND_Q, DESK_Q]) q.addEventListener ? q.addEventListener('change', onLayout) : q.addListener(onLayout);
  // WebGL context loss (iOS backgrounding, GPU resets): stop drawing, keep the run paused, resume when restored
  let glLost = false;
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); glLost = true; if (state === 'run' && !paused) setPause(true); Analytics.track('webgl_context_lost', {}); }, false);
  canvas.addEventListener('webglcontextrestored', () => { glLost = false; render.resize(); Analytics.track('webgl_context_restored', {}); }, false);

  // ---------- adaptive quality: sustained low fps steps the tier down (high → medium → low), never up mid-session ----------
  let fpsAcc = 0, fpsN = 0, slow = 0, pendingQ = null;
  function adapt(dt) {
    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 1) {
      const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; const ri = render.R.info.render;
      KM.perf = { fps, units: sim.count[0] + sim.count[1], drawn: render.drawn, dpr: render.R.getPixelRatio(), quality: render.quality, tris: ri.triangles, calls: ri.calls, jsMs: jsCost, simMs, speed: speedNow(), simDebt };
      hook('fps', fps); if (state === 'run' && !paused) Telemetry.sample(sim, fps, KM.perf);
      if (state === 'run' && !paused && !forcedQ && !(DEV && DEV.fixed)) { slow = fps < 45 ? slow + 1 : Math.max(0, slow - 1); if (slow >= 4 && render.quality !== 'low') { slow = 0; pendingQ = KM.nextLowerQuality(render.quality); Analytics.track('quality_down', { to: pendingQ, fps: Math.round(fps) }); Telemetry.qdown(pendingQ, fps);
        hook('qdown', fps, render.quality, pendingQ); } }
    }
  }
  let jsCost = 0, rawMs = 16.7;

  // ---------- game speed: 1 / 2 / 3 on the HUD = 1× / 1.5× / 2× on ONE authoritative clock ----------
  // game time = real time × speed, consumed in fixed 1/60 s simulation steps (same results on every device / FPS);
  // upgrade choices run in slow motion and introductions hold 1× so nothing important is decided at 2×.
  let autoT = 0, introOn = false;   // the opaque intro covers the canvas: skip drawing so the credits stay on time on slow devices
  const SPEEDS = KM.SPEEDS; let speedI = Math.max(0, SPEEDS.indexOf(save.settings.speed || 1)), simMs = 0, simDebt = 0;   // 1× · 1.5× · 2× · 3× · 5× (older saves keep 1 / 1.5 / 2)
  const speedNow = () => SPEEDS[speedI], fmtX = v => v + '×';
  // HONEST SPEED: game seconds actually simulated ÷ game seconds asked for, over ~1 s of play. When a slow device cannot keep up the
  // label turns amber with "~" and the real rate (the simulation stays exact, it just runs slower than asked — never a fake label)
  let spWant = 0, spGot = 0, speedEff = 1;
  function speedLabel() { const v = speedNow(), lag = v > 1 && speedEff < v * 0.9; $('speedTxt').textContent = lag ? '~' + fmtX(Math.round(speedEff * 10) / 10) : fmtX(v); $('speedBtn').classList.toggle('lag', lag); $('speedBtn').setAttribute('aria-label', 'Game speed ' + fmtX(v)); $('speedBtn').title = lag ? 'This device is running ' + fmtX(Math.round(speedEff * 10) / 10) + ' of the chosen ' + fmtX(v) : ''; }
  function setSpeed(i) { speedI = (i + SPEEDS.length) % SPEEDS.length; save.settings.speed = SPEEDS[speedI]; persist(); render.speed = SPEEDS[speedI]; spWant = spGot = 0; speedEff = SPEEDS[speedI]; speedLabel(); audio.sync(SPEEDS[speedI]); }   // shown as the real multiplier: 1× · 1.5× · 2× · 3× · 5×
  $('speedBtn').addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); audio.unlock(); if (planMode) return; setSpeed(speedI + 1); audio.play('tap'); if (state === 'run') banner('SPEED ' + fmtX(speedNow()), 0.8); });   // icon-only button: the new value flashes as a banner
  // ZOOM (camera only): 1× · 1.5× · 2× · 3× the fitted camera distance; world, units, aim, range and speed are untouched
  const ZOOMS = KM.ZOOMS; let zoomI = Math.max(0, ZOOMS.indexOf(save.settings.zoom || 1));
  const zoomNow = () => ZOOMS[zoomI];
  function setZoom(i) { zoomI = (i + ZOOMS.length) % ZOOMS.length; save.settings.zoom = ZOOMS[zoomI]; persist(); render.zoom = ZOOMS[zoomI]; render.fitT = 0; $('zoomTxt').textContent = fmtX(ZOOMS[zoomI]); $('zoomBtn').setAttribute('aria-label', 'Camera zoom out ' + fmtX(ZOOMS[zoomI])); $('zoomBtn').title = 'Zoom ' + fmtX(ZOOMS[zoomI]); }
  $('zoomBtn').addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); audio.unlock(); if (planMode) return; setZoom(zoomI + 1); audio.play('tap'); if (state === 'run') banner('ZOOM ' + fmtX(zoomNow()), 0.8); });
  sim.on((t, a, b) => { if (state === 'run') Telemetry.ev(sim, t, a, b); });
  let lastT = performance.now(), acc = 0; const STEP = KM.FRAME.STEP;
  let guardT = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    if (now - guardT > 500) { guardT = now; render.viewGuard && render.viewGuard(); }   // cheap: two clientWidth reads
    // quality changes are applied before drawing so a resize never presents a cleared (black) canvas
    if (pendingQ) { render.applyQuality(pendingQ); pendingQ = null; }
    const js0 = performance.now();
    rawMs = now - lastT; let dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    audio.quiet = state !== 'run' || paused;
    if (state === 'run') { const c = sim.chantNow(), el = $('chantPulse'); if (c && el) { const k = (1 - c.beatPhase) * (1 - c.beatPhase); el.style.setProperty('--cp', (k * (c.beat === 0 ? 1.4 : 0.9)).toFixed(3)); el.style.setProperty('--cc', c.crescendo ? '#7dff9a' : c.state === 'S' ? '#ffd23a' : c.state === 'B' ? '#6fb6ff' : '#ffffff'); } }   // 2.0 Phase 0: beat pulse on the sim's chant grid (visual only)   // the demo battle behind the menus / shop / pause is silent (owner 2026-10-20)
    let gdt = dt;
    if (state === 'run' && !paused) {
      if (keys.ArrowLeft || keys.a) sim.moveBy(-dt * 14); if (keys.ArrowRight || keys.d) sim.moveBy(dt * 14);
      holdTick(dt);
      const scale = speedNow(); gdt = now < holdUntil ? 0 : dt * scale; Telemetry.frame(sim, dt, rawMs, speedNow()); if ((autoT += dt) > 10) { autoT = 0; if (!daily) RunSave.write(sim); }
      const fs = KM.frameSteps(acc, now < holdUntil ? 0 : dt, scale); acc = fs.acc; simDebt += fs.dropped; const s0 = performance.now();   // pacing: KM.frameSteps (tested without a GPU)
      for (let n = 0; n < fs.n; n++) { if (botOn) KM.bot(sim, STEP, 1); sim.step(STEP); hook('tick', STEP); }
      if (now >= holdUntil && !sim.choice) { spWant += Math.min(KM.FRAME.MAX_DT, dt) * scale; spGot += fs.n * STEP; if (spWant >= scale) { speedEff = spGot / spWant * scale; spWant = spGot = 0; speedLabel(); } }
      simMs += ((performance.now() - s0) - simMs) * 0.1;
      hud(dt);
      combatT += dt; if (combatT > 0.5) { combatLvl += (Math.min(1, combatHits / combatT / 40) - combatLvl) * 0.5; combatHits = 0; combatT = 0; audio.crowd(combatLvl, sim.count[0] / 150); }
      audio.tick(Math.min(1, (sim.count[1] / 300) * 0.6 + sim.danger * 0.4 + (sim.diff.m / 30) * 0.3), true);
    } else if (state !== 'run' && !khOn()) { sim.step(dt * 0.5); } // keep the battlefield alive behind menus
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').classList.remove('on'); }
    // ATTACK/DEFEND arrives once the first fight has started (the first seconds stay: drag + auto-deploy only)
    if (state === 'run') { bossUI(); tankHpUI(); }
    if (state === 'run' && sim.t > 25 && !save.ach.posture && sim.alive) { save.ach.posture = 1; persist(); banner('TAP ATTACK: SELECTED CLASS\nHOLD: WHOLE ARMY', 2.4); }
    if (!paused && !glLost && !introOn && !khOn()) { render.frame(sim, state === 'run' ? gdt : dt); mark('firstFrame'); if (state === 'run' && sim.t > 0.5) mark('gameplay'); }               // animation follows game time
    jsCost += ((performance.now() - js0) - jsCost) * 0.1;   // JS cost: sim + scene update + draw submission (GPU time excluded)
    adapt(dt); hook('frame', dt);
  }
  // attract mode behind the title: the bot plays a demo battle
  sim.reset({ seed: 7 }); for (let k = 0; k < 240; k++) { KM.bot(sim, STEP, 0.6); sim.step(STEP); }
  const attract = () => { if (khOn()) return; if (state !== 'run' && sim.alive) KM.bot(sim, STEP, 0.6); if (state !== 'run' && !sim.alive) { sim.reset({ seed: 7 + Math.floor(Math.random() * 99) }); render.resetRun(); } };
  setInterval(attract, 50);
  // ---------- soldier panel (bottom left): six portrait cards · tap = select · tap the selected class again = its upgrade details ----------
  const drawer = $('drawer'), classes = $('classes'), pop = $('clsPop'), CHARGE = ['collector', 'range', 'melee', 'elite', 'giant'];
  const PORTRAIT = k => `assets/ui/p_${k}.webp?v=4b32a21cd556`, GOLD_IMG = '<img src="assets/ui/i_gold.png?v=4b32a21cd556" alt="">';
  classes.innerHTML = KM.PROD_ORDER.map(k => `<div class="cl" data-p="${k}" role="button" aria-label="${KM.PROD[k].name}"><img src="${PORTRAIT(k)}" alt=""><div class="tx"><b>${KM.PROD[k].name} <s class="cap">${KM.unitPts(k)} CAP</s></b><span class="pr">${GOLD_IMG}${KM.PROD[k].cost}</span><i></i></div><u class="ub hidden">▲</u></div>`).join('');
  const setDrawer = open => { if (render.layout === 'desktop') open = true;   // desktop: the soldier cards always show
    drawer.classList.toggle('away', !open); $('drawerTab').textContent = open ? '‹' : '›'; if (!open) closePops(); };
  let dStart = null;
  drawer.addEventListener('pointerdown', e => { dStart = { x: e.clientX, y: e.clientY }; });
  drawer.addEventListener('pointerup', e => { if (!dStart) return; const dx = e.clientX - dStart.x; dStart = null; if (dx < -30) setDrawer(false); else if (dx > 30) setDrawer(true); });   // swipe left = collapse · swipe right = open
  $('drawerTab').addEventListener('click', e => { e.stopPropagation(); setDrawer(drawer.classList.contains('away')); audio.play('tap'); });
  // PORTRAIT AUTO-TUCK (owner option A): in portrait combat the roster folds into its tab so the fence-to-fence army is never under it.
  // Any touch on the roster or its upgrade popover keeps it open; 2.5 s after the last one (and never while a popover is open) it tucks
  // away again. Tucking only hides the panel: the selected class, AUTO / TAP and every purchase rule are untouched. Outside portrait it
  // stays as the player left it, and a roster the auto-tuck folded comes back when the screen leaves portrait.
  const TUCK_MS = 2500; let rosterT = performance.now(), autoTucked = false;
  const rosterTouch = () => { rosterT = performance.now(); };
  for (const el of [drawer, pop]) for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'click']) el.addEventListener(ev, rosterTouch, { passive: true });
  KM.rosterTuck = () => { const portrait = render.layout === 'portrait', away = drawer.classList.contains('away');
    if (!portrait) { if (autoTucked && away) setDrawer(true); autoTucked = false; return; }
    if (state !== 'run' || paused || away) { if (!away) autoTucked = false; return; }
    if (!pop.classList.contains('hidden') || performance.now() - rosterT < TUCK_MS) return;
    setDrawer(false); autoTucked = true; };
  setInterval(() => KM.rosterTuck(), 250);
  $('drawerTab').addEventListener('click', () => { rosterTouch(); autoTucked = false; });
  const fmtStat = v => v >= 100 ? KM.fmtShort(Math.round(v)) : v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
  const choiceBottom = () => { const c = $('choice'); return c.classList.contains('hidden') ? 0 : c.getBoundingClientRect().bottom + 6; };   // landscape popovers open below the supply strip while it is up
  function popUI() { const k = pop.dataset.k; if (!k || pop.classList.contains('hidden')) return;
    const lv = sim.stats.cls[k], max = lv >= KM.CLASS_MAX, A = sim.classInfo(k, lv), B = max ? A : sim.classInfo(k, lv + 1), cost = sim.clsCost(k), arr = (a, b) => fmtStat(a) + (max ? '' : ` <em>→ ${fmtStat(b)}</em>`);
    if (max) return forgeUI(k);
    pop.innerHTML = `<h4>${KM.PROD[k].name}<small>LV ${lv}${max ? ' · MAX' : ' → ' + (lv + 1)}</small></h4><div class="st"><span>HP</span><b>${arr(A.hp, B.hp)}</b><span>${A.heal ? 'HEAL' : 'DMG'}</span><b>${arr(A.dmg, B.dmg)}</b><span>ARMOR</span><b>${arr(A.arm, B.arm)}</b></div>` +
      (max ? '<button disabled>MAX LEVEL</button>' : `<button ${sim.coins >= cost ? '' : 'disabled'}>UPGRADE ${GOLD_IMG}${KM.fmtShort(cost)}</button>`);
    const bt = pop.querySelector('button'); if (!max) bt.addEventListener('click', e => { e.stopPropagation(); if (sim.levelUp(k)) { audio.play('upgrade'); KM.haptic(15); if (tut === 3) setTip(4); } drawerUI(); popUI(); });
    placePop(k); }
  // every screen (owner 2026-10-24: desktop matches mobile): the popover opens to the RIGHT of the soldier card, centred on it, kept inside the window
  function placePop(k) { const card = classes.querySelector(`[data-p="${k}"]`).getBoundingClientRect(), land = !DESK_Q.matches && render.layout === 'landscape',
      lo = land ? Math.max(render.safeTopPx || 8, choiceBottom()) : 8, hi = innerHeight - pop.offsetHeight - (land ? (render.safeBotPx || 0) + 6 : 8);   // phone landscape: below the HUD row and the supply strip, above the home bar
    pop.style.left = Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, card.right + 8)) + 'px'; pop.style.top = Math.max(lo, Math.min(hi, card.top + card.height / 2 - pop.offsetHeight / 2)) + 'px'; }
  // WAR FORGE (Lv10 classes): two Gold tracks with exact before → after numbers; one tap = one purchase (sim.forgeBuy is atomic)
  function forgeUI(k) { const F = sim.forge[k], A = sim.classInfo(k, KM.CLASS_MAX), heal = A.heal, nx = t => (KM.forgeGain(F[t] + 1) - KM.forgeGain(F[t])) * ((KM.FORGE.pts[t] || {})[k] || 1);
    const row = (t, label, now) => { const c = sim.forgeCost(k, t), ok = sim.canForge(k, t); return `<div class="st"><span>${label}</span><b>${fmtStat(now)} <em>→ ${fmtStat(now + nx(t))}</em></b><span>FORGED</span><b>×${F[t]}</b></div><button data-ft="${t}" ${ok ? '' : 'disabled'}>${label} ${GOLD_IMG}${KM.fmtShort(c)}${ok ? '' : ' · NEED ' + KM.fmtShort(Math.max(0, c - sim.coins))}</button>`; };
    pop.innerHTML = `<h4>${KM.PROD[k].name}<small>LV 10 · WAR FORGE</small></h4><div class="st"><span>GOLD</span><b>${KM.fmtShort(Math.floor(sim.coins))}</b><span>HP</span><b>${fmtStat(A.hp)}</b></div>` + (sim.forgeOpen() ? row('a', heal ? 'HEAL' : 'DMG', A.dmg) + row('d', 'ARMOR', A.arm)
      : `<div class="st"><span>${heal ? 'HEAL' : 'DMG'}</span><b>${fmtStat(A.dmg)}</b><span>ARMOR</span><b>${fmtStat(A.arm)}</b></div><button disabled data-forge-lock>WAR FORGE UNLOCKS AFTER THE FIRST BOSS</button>`);
    pop.querySelectorAll('[data-ft]').forEach(bt => bt.addEventListener('click', e => { e.stopPropagation(); sim.forgeBuy(k, bt.dataset.ft); drawerUI(); popUI(); }));
    placePop(k); }
  function openPop(k) { closePops(); pop.dataset.k = k; pop.classList.remove('hidden'); popUI(); }
  function closePops() { pop.classList.add('hidden'); pop.dataset.k = ''; $('powers').classList.add('hidden'); $('tankUps').classList.add('hidden'); $('consPop').classList.add('hidden'); }
  classes.querySelectorAll('.cl').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); audio.unlock(); if (state !== 'run' || paused) return; const k = b.dataset.p;
    if (sim.prod === k) { if (pop.dataset.k === k && !pop.classList.contains('hidden')) closePops(); else openPop(k); }   // second tap: upgrade details for the selected class only
    else { sim.setProd(k); closePops(); }
    audio.play('tap'); drawerUI(); setPostureUI(); }));
  addEventListener('pointerdown', e => { if (!e.target.closest || e.target.closest('#clsPop,#classes,#powers,#powerBtn,#tankUps,#tankBtn,#consPop,#consBtn')) return; if (!pop.classList.contains('hidden') || !$('powers').classList.contains('hidden') || !$('tankUps').classList.contains('hidden') || !$('consPop').classList.contains('hidden')) closePops(); }, true);
  function drawerUI() {
    planSumUI(); for (const b of classes.querySelectorAll('.cl')) { const k = b.dataset.p, lv = sim.stats.cls[k], cost = sim.clsCost(k), info = sim.classInfo(k, lv);
      b.classList.toggle('on', sim.prod === k); b.classList.toggle('atk', CHARGE.includes(k) && sim.attacking(k));
      b.querySelector('.tx i').textContent = `Lv ${lv} · ${info.heal ? 'HEAL' : 'DMG'} ${fmtStat(info.dmg)}`;
      const pr = b.querySelector('.pr'); if (pr.dataset.c !== String(info.cost)) { pr.dataset.c = info.cost; pr.innerHTML = GOLD_IMG + info.cost; }   // deploy price rises +5 (Giant +25) per level
      const can = lv < KM.CLASS_MAX && sim.coins >= cost; b.querySelector('.ub').classList.toggle('hidden', !(can && sim.prod === k)); if (can && tut === 2) setTip(3); }
    $('autoTxt').textContent = sim.auto ? 'AUTO' : 'TAP'; $('autoBtn').classList.toggle('tap', !sim.auto);   // one word: the current mode
    const tb = $('tankBtn'), tc = Math.min(...KM.TANK_SKILLS.map(t => sim.tankCost(t.id))), up = isFinite(tc); tb.classList.toggle('can', up && sim.coins >= tc); $('tankCost').textContent = up ? KM.fmtShort(tc) : ''; $('tankCost').classList.toggle('hidden', !up); tb.title = 'Tank skills';
    if (!$('tankUps').classList.contains('hidden')) tankUI(true); if (!$('consPop').classList.contains('hidden')) consUI(true); { const n = consCount(); $('consN').textContent = n ? String(n) : ''; }
    $('powerBtn').classList.toggle('ready', sim.equipped.some(id => sim.canPower(id))); powersUI(true); popUI();
  }
  $('autoBtn').addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); audio.unlock(); if (state !== 'run' || paused) return; sim.setAuto(!sim.auto); audio.play('tap'); drawerUI(); });   // AUTO = auto deploy + auto aim · TAP = manual deploy + lane aim
  // UPGRADE opens the command tank's skill tracks: each row shows Lv, current → next value and its own Gold price; + buys one level
  const fmtTV = (t, v) => t.kind === 'count' ? String(Math.round(v)) : t.stat === 'maxHp' ? String(Math.round(v)) : t.stat === 'tankRate' ? v.toFixed(2) + '/s' : t.stat === 'tankRange' ? (KM.W.TANK_RANGE * v / KM.baseStats().tankRange).toFixed(0) + ' m' : t.stat === 'tankSplash' ? v.toFixed(2) + ' m' : v.toFixed(1);
  function tankUI(refresh) { const el = $('tankUps');
    if (!refresh) el.innerHTML = KM.TANK_SKILLS.map(t => `<div class="tu" data-id="${t.id}"><b>${t.title}<em></em></b><button type="button"></button></div>`).join('');
    for (const r of el.children) { const id = r.dataset.id, t = KM.TANK_SKILL_BY[id], lv = sim.tankLv(id), max = lv >= KM.CLASS_MAX, c = sim.tankCost(id), b = r.querySelector('button');
      r.classList.toggle('max', max); r.querySelector('em').textContent = 'LV ' + lv + ' · ' + fmtTV(t, sim.tankValue(id, lv)) + (max ? '' : ' → ' + fmtTV(t, sim.tankValue(id, lv + 1)));
      b.textContent = max ? 'MAX' : '+ ' + KM.fmtShort(c); b.disabled = max || sim.coins < c; }
    if (!refresh) el.querySelectorAll('.tu button').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); if (state !== 'run' || paused) return; const id = b.parentNode.dataset.id;
      if (sim.tankUp(id)) { audio.play('upgrade'); KM.haptic(15); } else banner(sim.tankLv(id) >= KM.CLASS_MAX ? 'MAX LEVEL' : 'NEED ' + KM.fmtShort(sim.tankCost(id)) + ' GOLD', 0.8); tankUI(true); drawerUI(); })); }
  $('tankBtn').addEventListener('click', e => { e.stopPropagation(); audio.unlock(); if (state !== 'run' || paused) return; const el = $('tankUps'), open = el.classList.contains('hidden'); closePops(); if (!open) return;
    tankUI(); el.classList.remove('hidden'); const r = $('tankBtn').getBoundingClientRect(), wide = DESK_Q.matches, lo = render.layout === 'landscape' ? Math.max(8, choiceBottom()) : 8;
    void wide; el.style.left = Math.max(8, r.left - el.offsetWidth - 8) + 'px'; el.style.top = Math.max(lo, Math.min(innerHeight - el.offsetHeight - 8, r.bottom - el.offsetHeight)) + 'px'; audio.play('tap'); });   // always opens LEFT of the column, never over it
  // ITEMS: the five energy-free consumables with art, quantity, effect and USE; opens to the left of the column like POWER
  const CONS_ART = {
    warcry: '<rect width="64" height="64" rx="10" fill="#3a1414"/><path d="M14 40l14-6V22l-14-6z" fill="#ffb02e" stroke="#5a2a00" stroke-width="2.5" stroke-linejoin="round"/><path d="M28 24h8l14-10v36L36 40h-8z" fill="#ff6a3a" stroke="#5a1a00" stroke-width="2.5" stroke-linejoin="round"/><path d="M54 22l6-4M54 32h8M54 42l6 4" stroke="#ffd23a" stroke-width="3" stroke-linecap="round"/>',
    titan: '<rect width="64" height="64" rx="10" fill="#14243a"/><circle cx="32" cy="16" r="9" fill="#7fb0ff" stroke="#0a1a3a" stroke-width="2.4"/><path d="M10 60c0-20 9-34 22-34s22 14 22 34z" fill="#3a6dd8" stroke="#0a1a3a" stroke-width="2.6"/><path d="M6 6h10M11 1v10M48 6h10M53 1v10" stroke="#ffd23a" stroke-width="3" stroke-linecap="round"/>',
    barrage: '<rect width="64" height="64" rx="10" fill="#1a2030"/><rect x="10" y="40" width="40" height="14" rx="4" fill="#2f6dff" stroke="#0a1a3a" stroke-width="2.4"/><path d="M26 40V30h12v10" fill="#4f8bff" stroke="#0a1a3a" stroke-width="2.4"/><g stroke="#ffb02e" stroke-width="3" stroke-linecap="round"><path d="M32 28l-10-18M32 28l0-20M32 28l10-18"/></g><circle cx="22" cy="10" r="3" fill="#fff2c0"/><circle cx="32" cy="8" r="3" fill="#fff2c0"/><circle cx="42" cy="10" r="3" fill="#fff2c0"/>',
    fortress: '<rect width="64" height="64" rx="10" fill="#10203a"/><path d="M32 6l20 8v16c0 14-9 23-20 28-11-5-20-14-20-28V14z" fill="#8f9bb0" stroke="#1a2438" stroke-width="3" stroke-linejoin="round"/><path d="M32 14l12 5v11c0 9-5 15-12 18z" fill="#cfd8e8"/>',
    contract: '<rect width="64" height="64" rx="10" fill="#2a1418"/><path d="M14 10h30l6 6v38H14z" fill="#efe2bf" stroke="#5a3a1a" stroke-width="2.5" stroke-linejoin="round"/><path d="M20 20h22M20 27h22M20 34h14" stroke="#8a6a3a" stroke-width="2.5" stroke-linecap="round"/><circle cx="42" cy="46" r="8" fill="#c8323a" stroke="#5a0a10" stroke-width="2.4"/><path d="M38 46l3 3 5-6" stroke="#ffd23a" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
    rapid: '<rect width="64" height="64" rx="10" fill="#2a2410"/><path d="M8 44h20M12 34h22M8 24h18" stroke="#ffd23a" stroke-width="4" stroke-linecap="round"/><path d="M38 10L26 34h10l-4 20 18-28H40z" fill="#ffe08a" stroke="#6a4a00" stroke-width="2.6" stroke-linejoin="round"/>',
  };
  function consUI(refresh) { const el = $('consPop');
    if (!refresh) el.innerHTML = KM.CONS_IDS.map(id => `<div class="cs" data-id="${id}"><svg viewBox="0 0 64 64" aria-hidden="true">${CONS_ART[id]}</svg><b>${KM.CONSUMABLES[id].name} <span class="n"></span><em>${KM.CONSUMABLES[id].desc}</em></b><button type="button">USE</button></div>`).join('');
    for (const r of el.children) { const id = r.dataset.id, n = sim.cons[id] || 0, on = sim.consActive(id); r.classList.toggle('on', on); r.querySelector('.n').textContent = '×' + n;
      const b = r.querySelector('button'); b.textContent = on ? 'ACTIVE' : 'USE'; b.disabled = !sim.canCons(id); }
    if (!refresh) el.querySelectorAll('.cs button').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); if (state !== 'run' || paused) return;   // one press = at most one unit (useCons refuses a second same-wave effect)
      if (sim.useCons(b.parentNode.dataset.id)) { KM.haptic(30); closePops(); } else consUI(true); })); }
  const consCount = () => KM.CONS_IDS.reduce((a, id) => a + (sim.cons[id] || 0), 0);
  $('consBtn').addEventListener('click', e => { e.stopPropagation(); audio.unlock(); if (state !== 'run' || paused) return; const el = $('consPop'), open = el.classList.contains('hidden'); closePops(); if (!open) return;
    consUI(); el.classList.remove('hidden'); const r = $('consBtn').getBoundingClientRect(), lo = render.layout === 'landscape' ? Math.max(8, choiceBottom()) : 8;
    el.style.left = Math.max(8, r.left - el.offsetWidth - 8) + 'px'; el.style.top = Math.max(lo, Math.min(innerHeight - el.offsetHeight - 8, r.top)) + 'px'; audio.play('tap'); });
  // POWER opens the three equipped powers beside it; using one closes the selection again
  function powersUI(refresh) { const el = $('powers');
    if (!refresh) el.innerHTML = [...sim.equipped, ...((sim.mods.perks.recruits || 0) ? ['recruits'] : [])].map(id => `<div class="pw" data-id="${id}" role="button" aria-label="${KM.POWERS[id].name}">${svg(id)}<b>${KM.POWERS[id].name}</b><small></small></div>`).join('');
    for (const p of el.children) { const id = p.dataset.id, cd = sim.pcd[id] || 0; p.classList.toggle('ready', sim.canPower(id)); p.classList.toggle('cd', cd > 0); p.querySelector('small').textContent = cd > 0 ? Math.ceil(cd) + 's' : sim.powerCost(id) + ' ⚡'; }
    if (!refresh) el.querySelectorAll('.pw').forEach(p => p.addEventListener('click', e => { e.stopPropagation(); if (state !== 'run' || paused) return; const id = p.dataset.id;
      if (sim.usePower(id)) { KM.haptic(30); banner(KM.POWERS[id].name, 0.9); closePops(); } else banner((sim.pcd[id] || 0) > 0 ? 'RECHARGING' : 'NEED ' + sim.powerCost(id) + ' ENERGY', 0.7); drawerUI(); })); }
  $('powerBtn').addEventListener('click', e => { e.stopPropagation(); audio.unlock(); if (state !== 'run' || paused) return; const el = $('powers'), open = el.classList.contains('hidden'); closePops(); if (!open) return;
    powersUI(); el.classList.remove('hidden'); const r = $('powerBtn').getBoundingClientRect(), wide = DESK_Q.matches;
    void wide; { const lo = render.layout === 'landscape' ? Math.max(8, choiceBottom()) : 8; el.style.left = (r.left - el.offsetWidth - 8) + 'px'; el.style.top = Math.max(lo, r.bottom - el.offsetHeight) + 'px'; } audio.play('tap'); });   // leftward on every layout
  // choices (supply on waves 5, 15… · power boost after every boss): a small strip, the war keeps going
  // original card art for every prompted choice (supply rewards + tank powers): one 2:3 card style, the KMOB palette
  const CARD_ART = {
    gold: '<circle cx="32" cy="36" r="17" fill="#f2b21c" stroke="#8a5a08" stroke-width="3"/><circle cx="32" cy="36" r="11" fill="none" stroke="#ffe48a" stroke-width="2.5"/><circle cx="22" cy="24" r="12" fill="#ffd04a" stroke="#8a5a08" stroke-width="3"/><path d="M17 20a7 7 0 0 1 9-3" stroke="#fff6c8" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
    energy: '<path d="M36 6L14 38h14l-4 22 24-34H34z" fill="#6fd8ff" stroke="#14507a" stroke-width="3" stroke-linejoin="round"/><path d="M33 13L22 30" stroke="#e8fbff" stroke-width="3" stroke-linecap="round"/>',
    recover: '<path d="M32 56S10 42 10 25a11 11 0 0 1 22-3 11 11 0 0 1 22 3c0 17-22 31-22 31z" fill="#ff5a6a" stroke="#7a1022" stroke-width="3"/><path d="M32 22v20M22 32h20" stroke="#fff" stroke-width="5" stroke-linecap="round"/>',
    linebreaker: '<rect x="0" y="0" width="64" height="64" rx="10" fill="#1a2a50"/><path d="M24 4h16l-2 44H26z" fill="#ffb02e" opacity=".55"/><rect x="28.5" y="4" width="7" height="44" rx="2.5" fill="#fff2c0"/><path d="M21 22l11-8 11 8M21 34l11-8 11 8" fill="none" stroke="#ffe08a" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 50h32l4 9H12z" fill="#2d58b8" stroke="#0a1a3a" stroke-width="2.4" stroke-linejoin="round"/><rect x="29" y="44" width="6" height="9" rx="2" fill="#3a6bd8" stroke="#0a1a3a" stroke-width="2"/>',
    arrowstorm: '<rect x="0" y="0" width="64" height="64" rx="10" fill="#2a1a18"/><ellipse cx="32" cy="46" rx="22" ry="11" fill="#ff5a2a" opacity=".18" stroke="#ff5a2a" stroke-width="3"/><ellipse cx="32" cy="46" rx="12" ry="6" fill="none" stroke="#ffb02e" stroke-width="2.4"/><path d="M32 30v5M32 57v4M8 46h4M52 46h4" stroke="#ff5a2a" stroke-width="3" stroke-linecap="round"/><g stroke="#e8d0a8" stroke-width="2.6" stroke-linecap="round"><path d="M18 4l7 32M32 2v34M46 4l-7 32"/></g><g fill="#ffffff" stroke="#3a2410" stroke-width="1.2"><path d="M22 34l6-1 0 6z"/><path d="M29 35h6l-3 6z"/><path d="M36 33l6 1-6 5z"/></g>',
    elemental: '<rect x="0" y="0" width="64" height="64" rx="10" fill="#0e2a3a"/><path d="M2 46c8-18 22-24 34-17 9 5 8 14 1 16 9 3 18-3 25-12v29H2z" fill="#3fc8ff" stroke="#08506e" stroke-width="3" stroke-linejoin="round"/><path d="M10 42c6-11 15-14 24-10" fill="none" stroke="#e8fbff" stroke-width="3.4" stroke-linecap="round"/><g stroke="#e8fbff" stroke-width="3" stroke-linecap="round"><path d="M46 4v20M37 9l18 10M55 9L37 19"/></g><circle cx="46" cy="14" r="3" fill="#8ff0ff"/>',
    mercenary: '<rect x="0" y="0" width="64" height="64" rx="10" fill="#1e2a1a"/><path d="M32 2l6 8-6 8-6-8z" fill="#ffd23a" stroke="#6a3c00" stroke-width="2"/><path d="M12 50a20 20 0 0140 0v10H38V50H26v10H12z" fill="#d8dee8" stroke="#3a4458" stroke-width="3" stroke-linejoin="round"/><path d="M32 30v18" stroke="#3a4458" stroke-width="3"/><path d="M14 44h36" stroke="#9aa6b8" stroke-width="2.4"/><path d="M2 28l10 4v8l-10 4z" fill="#ffd23a" stroke="#6a3c00" stroke-width="2" stroke-linejoin="round"/><path d="M12 32h4v8h-4" fill="#c88a1a" stroke="#6a3c00" stroke-width="2"/>',
    cls: '<rect x="0" y="0" width="64" height="64" rx="10" fill="#1a2a50"/><circle cx="32" cy="20" r="9" fill="#ffd2b0" stroke="#3a2a1a" stroke-width="2.4"/><path d="M14 58c0-14 8-24 18-24s18 10 18 24z" fill="#2d58b8" stroke="#0a1a3a" stroke-width="2.6"/><path d="M44 8l6-6 6 6M50 2v18" stroke="#7dff9a" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tank: '<rect x="0" y="0" width="64" height="64" rx="10" fill="#14243a"/><rect x="8" y="34" width="44" height="16" rx="5" fill="#2f6dff" stroke="#0a1a3a" stroke-width="2.6"/><rect x="18" y="24" width="22" height="12" rx="4" fill="#4f8bff" stroke="#0a1a3a" stroke-width="2.4"/><path d="M38 28h20" stroke="#cfd8e8" stroke-width="5" stroke-linecap="round"/><circle cx="16" cy="54" r="4" fill="#1a1a22"/><circle cx="30" cy="54" r="4" fill="#1a1a22"/><circle cx="44" cy="54" r="4" fill="#1a1a22"/><path d="M50 4l5-4 5 4M55 0v14" stroke="#7dff9a" stroke-width="3" fill="none" stroke-linecap="round"/>',
    cons: '<rect x="0" y="0" width="64" height="64" rx="10" fill="#2a1a3a"/><path d="M24 8h16v8l8 10v28a6 6 0 0 1-6 6H22a6 6 0 0 1-6-6V26l8-10z" fill="#b36cff" stroke="#3a1a5a" stroke-width="2.6" stroke-linejoin="round"/><path d="M22 34h20v18H22z" fill="#e8d0ff" opacity=".55"/><path d="M28 14h8" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M32 38l3 6h-6z" fill="#ffd23a"/>',
    fortress: '<rect x="0" y="0" width="64" height="64" rx="10" fill="#0e1a33"/><path d="M6 50a26 26 0 0152 0z" fill="#3fa8ff" fill-opacity=".3" stroke="#8fe0ff" stroke-width="3.2"/><path d="M19 31l13-7 13 7M32 24v26M19 31v19M45 31v19M8 42l24-6 24 6" fill="none" stroke="#e8fbff" stroke-width="2.2" stroke-linejoin="round"/><path d="M14 50h36l-4 9H18z" fill="#2d58b8" stroke="#0a1a3a" stroke-width="2.4" stroke-linejoin="round"/>',
  };
  function choiceUI() { const c = sim.choice, el = $('choice'); if (!c) { el.classList.add('hidden'); return; } el.classList.remove('hidden'); $('drawer').classList.remove('wide');
    $('choiceT').textContent = c.kind === 'supply' ? 'SUPPLY — CHOOSE ONE' : 'BOSS REWARD — CHOOSE ONE (PERMANENT)';
    $('choiceO').innerHTML = c.opts.map((o, k) => `<button data-k="${k}" class="card23"><span class="art"><svg viewBox="0 0 64 64" aria-hidden="true">${CARD_ART[o.id] || CARD_ART.energy}</svg></span><span class="tt">${o.title}</span><small>${o.val}</small></button>`).join('');
    $('choiceO').querySelectorAll('button').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); sim.takeChoice(+b.dataset.k); audio.play('upgrade'); choiceUI(); })); }
  // boss name + HP right above the boss
  function bossUI() { const el = $('bossBar'), i = sim.bossI; if (state !== 'run' || !sim.nBoss || i < 0 || sim.st[i] !== 1) { el.classList.add('hidden'); return; }
    const v = render.toScreen(sim.x[i], 3.2 * sim.sc[i] * 0.55 + 1, sim.z[i]), x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight;
    el.classList.remove('hidden'); const lo = render.layout === 'landscape' ? safeCol[0] + 80 : 80, hi = render.layout === 'landscape' ? safeCol[1] - 80 : innerWidth - 80; el.style.left = Math.max(lo, Math.min(hi, x)) + 'px'; el.style.top = Math.max(110, Math.min(innerHeight - 140, y - 40)) + 'px';
    $('bossName').textContent = KM.ENEMY[sim.kind[i]].k.toUpperCase(); $('bossFill').style.width = Math.max(0, sim.hp[i] / sim.mhp[i] * 100).toFixed(1) + '%'; $('bossHp').textContent = KM.fmtShort(Math.max(0, sim.hp[i])) + ' / ' + KM.fmtShort(sim.mhp[i]); }
  setInterval(() => { if (state === 'run') drawerUI(); }, 300);
  sim.on(t => { if (t === 'prod' || t === 'auto' || t === 'upgrade' || t === 'posture' || t === 'charge' || t === 'levelUp') drawerUI(); if (t === 'choice' || t === 'chose') choiceUI(); });
  // ---------- ATTACK / DEFEND: one word = the action · tap = the selected class · hold = the whole army (Looters included) ----------
  const HOLD_ALL_MS = 450;
  const wordNow = () => (KM.PROD[sim.prod] && CHARGE.includes(sim.prod) ? sim.attacking(sim.prod) : sim.posture === 0) ? 'DEFEND' : 'ATTACK';
  function setPostureUI() { if (state !== 'run') return; const w = wordNow(); $('postureTxt').textContent = w; $('postureBtn').classList.toggle('def', w === 'DEFEND'); for (const b of classes.querySelectorAll('.cl')) b.classList.toggle('atk', CHARGE.includes(b.dataset.p) && sim.attacking(b.dataset.p)); }
  let allT = 0; function allTip(t) { if (state !== 'run') return; const el = $('allTip'), r = $('postureBtn').getBoundingClientRect(); el.textContent = t; el.style.left = Math.max(8, r.left - 150) + 'px'; el.style.top = (r.top - 34) + 'px'; el.classList.add('on'); clearTimeout(allT); allT = setTimeout(() => el.classList.remove('on'), 900); }
  function orderTap() { const k = sim.prod; if (!CHARGE.includes(k)) { banner(KM.PROD[k].name + ' HEALS FROM THE REAR\nHOLD FOR ALL ATTACK / DEFEND', 1.4); return; }
    sim.orderClass(k, !sim.attacking(k)); setPostureUI(); }
  function orderHold() { if (wordNow() === 'ATTACK') sim.allAttack(); else sim.allDefend(); setPostureUI(); }
  let pHold = null;
  $('postureBtn').addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); audio.unlock(); if (state !== 'run' || paused) return; const id = e.pointerId;
    pHold = { id, done: false, t: setTimeout(() => { if (pHold && pHold.id === id) { pHold.done = true; orderHold(); } }, HOLD_ALL_MS) }; });
  const pEnd = e => { if (!pHold || e.pointerId !== pHold.id) return; clearTimeout(pHold.t); const held = pHold.done; pHold = null; if (!held && e.type === 'pointerup' && state === 'run' && !paused) orderTap(); };
  $('postureBtn').addEventListener('pointerup', pEnd); $('postureBtn').addEventListener('pointercancel', pEnd); $('postureBtn').addEventListener('pointerleave', e => { if (pHold && !pHold.done && e.pointerId === pHold.id) { clearTimeout(pHold.t); pHold = null; } });
  // a long press on a gameplay control must never reach Safari's image preview / share sheet / drag: scoped to the HUD, not the page's panels
  for (const el of document.querySelectorAll('#hud img, #drawer img, #rightCol img')) { el.draggable = false; el.setAttribute('draggable', 'false'); }
  const isCtl = t => t && t.closest && t.closest('#hud, #drawer, #rightCol, #postureBtn');
  addEventListener('contextmenu', e => { if (isCtl(e.target)) e.preventDefault(); }, { capture: true });
  addEventListener('dragstart', e => { if (isCtl(e.target)) e.preventDefault(); }, { capture: true });
  addEventListener('selectstart', e => { if (isCtl(e.target)) e.preventDefault(); }, { capture: true });
  addEventListener('keydown', e => { if (e.code === 'Space' && state === 'run' && !paused) { e.preventDefault(); if (e.shiftKey) orderHold(); else orderTap(); } });   // desktop: Space = selected class · Shift+Space = whole army

  // ---------- GOALS & COMMANDER RANK (Phase 1B, js/goals.js): optional goals that wait for you (no streaks), cosmetic ranks ----------
  if (!save.goals) save.goals = KM.goalsEmpty();
  const gReady = () => save.goals.list.filter(x => !x.claimed && x.got >= KM.goalDef(x).n).length;
  function goalsDeal() { const got = KM.goalsDeal(save.goals, new Date()); if (got.length) persist(); return got; }
  function goalsAfter(o) { goalsDeal(); const done = KM.goalsProgress(save.goals, KM.goalStats(sim, o), new Date()); persist(); if (done.length) Analytics.track('goal_complete', { n: done.length, ids: done.map(x => x.id).join(',') }); return done; }
  function goalsLine(done) { const n = gReady(); return n ? `<div style="justify-content:center;font-weight:900;color:#7dff9a">🎯 ${done && done.length ? 'GOAL COMPLETE: ' + esc(done.map(x => KM.goalDef(x).text).join(' · ')) + ' · ' : ''}${n} READY TO CLAIM (HOME → GOALS)</div>` : ''; }
  function goalsLabel() { const n = gReady(); return 'GOALS · ' + KM.rankName(save.goals.rank) + (n ? ' · ' + n + ' READY' : ''); }
  function openGoals(back) { khHide(); audio.unlock(); state = 'goals'; goalsDeal(); const G = save.goals, r = G.rank, x0 = KM.xpFor(r), x1 = KM.xpFor(Math.min(KM.RANK_MAX, r + 1)), pct = r >= KM.RANK_MAX ? 100 : Math.round(100 * (G.xp - x0) / Math.max(1, x1 - x0));
    $('gRank').innerHTML = `<b>${KM.rankName(r)}</b><small>COMMANDER RANK ${r} / ${KM.RANK_MAX} · ${KM.fmtNum(G.xp)} XP${r < KM.RANK_MAX ? ' · ' + KM.fmtNum(x1 - G.xp) + ' TO NEXT' : ''}</small><span class="gBar"><i style="width:${pct}%"></i></span>`;
    const open = G.list.filter(x => !x.claimed).sort((a, b) => (b.got >= KM.goalDef(b).n) - (a.got >= KM.goalDef(a).n) || (a.kind === 'weekly') - (b.kind === 'weekly'));
    $('gList').innerHTML = open.length ? open.map(x => { const d = KM.goalDef(x), done = x.got >= d.n, i = G.list.indexOf(x);
      return `<div class="gItem ${done ? 'done' : ''}"><div class="gTxt"><small>${x.kind === 'weekly' ? 'WEEKLY' : 'DAILY'} · +${d.xp} XP</small><b>${esc(d.text)}</b><span class="gBar"><i style="width:${Math.round(100 * x.got / d.n)}%"></i></span><small>${KM.fmtNum(x.got)} / ${KM.fmtNum(d.n)}</small></div>${done ? `<button class="btn" data-claim="${i}">CLAIM</button>` : ''}</div>`; }).join('')
      : '<p class="gNote">All caught up. A new goal arrives every day at 00:00 UTC.</p>';
    $('gList').querySelectorAll('[data-claim]').forEach(b => b.onclick = () => { const x = G.list[+b.dataset.claim], r2 = KM.goalClaim(G, x); if (!r2) return; if (r2.tokens) bank(r2.tokens, 0, 'rank'); persist(); audio.play(r2.rankUp ? 'pb' : 'upgrade'); KM.haptic(15);
      Analytics.track('goal_claim', { id: x.id, kind: x.kind, rank: G.rank }); if (r2.rankUp) banner('RANK UP\n' + KM.rankName(r2.rankUp) + (r2.tokens ? ' · +' + r2.tokens + ' WAR TOKEN' + (r2.tokens > 1 ? 'S' : '') : ''), 2); openGoals(back); });
    $('gBack').onclick = () => { audio.play('tap'); if (back === 'daily') openDaily(); else goTitle(); }; show('goalsScr'); }

  // ---------- DAILY DEFENSE (owner 2026-10-22): one free challenge per UTC day · 3 ranked attempts + unlimited practice · badges + 1 War Token ----------
  // Ranked attempts are counted when they START (leaving early never refunds one). Everything a player owns is ignored (KM.dailyOpts).
  const DBADGES = [[1, KM.DAILY_BADGES[0]], [7, KM.DAILY_BADGES[1]], [30, KM.DAILY_BADGES[2]], [100, KM.DAILY_BADGES[3]]];
  { let fixed = 0; for (const [n, t] of DBADGES) if (save.daily.total >= n && !save.titles.includes(t)) { save.titles.push(t); fixed++; } if (fixed) persist(); }   // repair: Daily badges were dropped on reload (2026-10-23 build); days completed were kept, so restore from them
  const dToday = () => { const D = save.daily, day = KM.dailyDay(); if (D.day !== day) Object.assign(D, { day, ranked: 0, practice: 0, best: 0, bestParts: null, done: 0 }); return D; };
  const dWeek = () => { const wk = KM.weekKey(new Date()); return save.daily.days.filter(d => KM.weekKey(new Date(d + 'T12:00:00Z')) === wk).length; };
  const dCount = ms => { const t = Math.max(0, Math.floor(ms / 1000)); return Math.floor(t / 3600) + ':' + String(Math.floor(t / 60) % 60).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
  function dailyTitle() { const D = dToday(), r = KM.dailyRules(D.day), left = KM.DAILY.RANKED - D.ranked; goalsDeal(); if ($('goalsBtn')) $('goalsBtn').textContent = goalsLabel(); if ($('khGoals')) $('khGoals').textContent = goalsLabel(); if ($('dGoals')) $('dGoals').textContent = '🎯 ' + goalsLabel();
    if ($('khDaily')) $('khDaily').textContent = r.name + ' · ' + (left ? left + ' ranked left' : 'practice only') + ' · new in ' + dCount(KM.dailyResetIn());
    $('dailyBtn').innerHTML = `DAILY DEFENSE<small>${r.name} · ${left ? left + ' RANKED LEFT' : 'PRACTICE ONLY'} · NEW IN ${dCount(KM.dailyResetIn())}</small>`; }
  function dStationRow() { const el = $('dChant'), cur = save.daily.station;
    el.innerHTML = `<div class="ch-h"><b>WAR CHANT</b><small>ALL STATIONS FREE IN DAILY DEFENSE</small></div><div class="ch-b">` + ['off', 'steel', 'iron', 'fury'].map(id => { const st = KM.STATION_BY[id];
      return `<button type="button" data-ch="${id}" class="${cur === id ? 'on' : ''}" aria-pressed="${cur === id}">${st ? st.name + '<small>' + st.lean + '</small>' : 'OFF<small>NO BONUS</small>'}</button>`; }).join('') + '</div>';
    el.querySelectorAll('button').forEach(b => b.onclick = () => { save.daily.station = b.dataset.ch; persist(); audio.play('tap'); dStationRow(); }); }
  function openDaily(keepMsg) { khHide(); audio.unlock(); state = 'daily'; lastDaily = false; const msg = keepMsg === true ? $('dLb').textContent : ''; const D = dToday(), r = KM.dailyRules(D.day), left = KM.DAILY.RANKED - D.ranked;
    $('dName').textContent = r.name; $('dDesc').textContent = r.desc; goalsDeal(); $('dGoals').textContent = '🎯 ' + goalsLabel();
    $('dInfo').innerHTML = `<span><i>RANKED LEFT</i><b>${left} / ${KM.DAILY.RANKED}</b></span><span><i>BEST TODAY</i><b>${D.best ? KM.fmtNum(D.best) : '—'}</b></span><span><i>NEW CHALLENGE IN</i><b id="dCount">${dCount(KM.dailyResetIn())}</b></span>`;
    $('dRules').innerHTML = `<b>SCORING</b> enemies ×10 · waves cleared ×300 · bosses ×2,500 · reach the 4:00 finish +1,000 (+10 per % tank HP)${r.goldScore ? ' · +5 % of Gold left' : ''}.<br><b>FAIR START</b> everyone gets the same battle, ${KM.fmtNum(r.bank != null ? r.bank : KM.START_BANK)} Gold and Linebreaker / Arrow Storm / Fortress at level 0. Upgrades, skins, gear, perks and items you own are not used.<br><b>PROGRESS</b> days completed ${save.daily.total} · this week ${dWeek()} / 5${D.done ? ' · today ✓ (+1 War Token earned)' : ' · finish a ranked attempt (4:00 or 2+ minutes) for +1 War Token'}`;
    $('dLb').textContent = KM.DAILY_VERIFY_URL ? 'Loading today\'s verified scores…' : 'Verified daily leaderboard: launching after server verification is approved. Your best today is kept on this device.'; if (msg) $('dLb').textContent = msg; else dBoard(); dFlush();
    $('dRanked').textContent = left ? `PLAY RANKED (${left} LEFT)` : 'NO RANKED ATTEMPTS LEFT'; $('dRanked').disabled = !left;
    dStationRow(); show('dailyScr'); Analytics.track('daily_open', { day: D.day, type: r.id, left }); }
  // VERIFIED SCORES (active only when KM.DAILY_VERIFY_URL is set; owner review 2026-10-23): ranked play needs a KEEPITIL sign-in; the
  // server RESERVES the attempt before the battle (/start) and replays the recorded run (/submit). Best score, War Token and badges come
  // only from a verified result. If the verifier is down, ranked is unavailable and practice still works (the game never depends on it).
  const DQ = 'kmob.daily.queue', dq = { load() { try { return JSON.parse(store.getItem(DQ) || '[]'); } catch (e) { return []; } }, save(q) { try { store.setItem(DQ, JSON.stringify(q.slice(-3))); } catch (e) { /* storage full */ } } };
  async function dCall(path, body) { const A = KM.Account, tok = A && A.session ? await A.token() : null; if (!tok) return { ok: false, reason: 'sign in to play ranked' };
    const raw = JSON.stringify(body); let data = raw; const h = { 'content-type': 'application/json', authorization: 'Bearer ' + tok };
    try { if (path === '/submit' && window.CompressionStream) { data = await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer(); h['content-encoding'] = 'gzip'; } } catch (e) { data = raw; delete h['content-encoding']; }
    const r = await fetch(KM.DAILY_VERIFY_URL + path, { method: 'POST', headers: h, body: data }); return r.json(); }
  // a verified result: the only place best score, days completed, badges and the daily War Token are granted in verified mode
  function dVerified(it, r) { const D = dToday(), out = { badge: '' }; if (!r || !r.ok || D.day !== it.day) return out;
    if (r.score > D.best) { D.best = r.score; D.bestParts = r.parts; }
    if (r.rewarded) { D.done = 1; save.daily.days = [...new Set([...save.daily.days, it.day])].slice(-400); save.daily.total = save.daily.days.length; bank(1, 0, 'daily');
      const b = DBADGES.find(([n]) => n === save.daily.total); if (b) { out.badge = b[1]; if (!save.titles.includes(b[1])) save.titles.push(b[1]); } if (dWeek() === 5) out.badge = out.badge || 'FULL WEEK'; }
    persist(); return out; }
  async function dFlush(onResult) { if (!KM.DAILY_VERIFY_URL || dFlush.busy) return; dFlush.busy = true; let q = dq.load();
    try { while (q.length) { const it = q[0]; let r; try { r = await dCall('/submit', it.body); } catch (e) { break; }   // offline: retried on the next Daily visit
        q.shift(); dq.save(q); const v = dVerified(it, r); Analytics.track('daily_verify', { ok: r && r.ok ? 1 : 0, reason: r && r.reason || '', rewarded: r && r.rewarded ? 1 : 0 }); if (onResult) onResult(it, r, v); } } finally { dFlush.busy = false; } }
  function dBoard() { if (!KM.DAILY_VERIFY_URL) return; const day = dToday().day, H = { apikey: Telemetry.key, Authorization: 'Bearer ' + Telemetry.key };
    fetch('https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/rpc/kmob_daily_board', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, H), body: JSON.stringify({ p_day: day, p_limit: 10 }) }).then(x => x.ok ? x.json() : null).then(rows => {
      if (!rows || state !== 'daily') return; $('dLb').innerHTML = rows.length ? 'TODAY · VERIFIED: ' + rows.map((x, k) => `${k + 1}. ${x.player === save.player ? '<b>YOU</b>' : esc(x.player.slice(0, 4))} ${KM.fmtNum(x.score)}`).join(' · ') : 'No verified scores yet today. Be the first.'; }).catch(() => { if (state === 'daily') $('dLb').textContent = 'Verified scores are unavailable right now. Practice works as usual.'; }); }
  async function playDaily(ranked) { const D = dToday(), st = save.daily.station === 'off' ? null : save.daily.station; if (ranked && D.ranked >= KM.DAILY.RANKED) return;
    let ticket = 0;
    if (ranked && KM.DAILY_VERIFY_URL) { $('dRanked').disabled = true; $('dRanked').textContent = 'RESERVING ATTEMPT…'; let r;
      try { r = await dCall('/start', { player: save.player }); } catch (e) { r = { ok: false, reason: 'offline' }; }
      if (r && r.reason === 'sign in to play ranked') { $('dRanked').disabled = false; signAsk = 'ranked'; webMsg = ''; shopTab = 'currency'; return openShop(() => openDaily()); }   // the sign-in pop-up, then back to Daily
      if (!r || !r.ok) { $('dLb').textContent = r && r.reason === 'no ranked attempts left' ? 'No ranked attempts left today. Practice is unlimited.' : 'Ranked is unavailable right now (' + (r && r.reason || 'offline') + '). Practice works as usual.';
        if (r && r.reason === 'no ranked attempts left') D.ranked = KM.DAILY.RANKED; persist(); return openDaily(true); }
      ticket = r.ticket; D.ranked = Math.max(D.ranked, r.attempt); }   // the server's count is the truth
    else if (ranked) D.ranked++; else D.practice++;
    persist(); startRun(false, { day: D.day, rules: KM.dailyRules(D.day), station: st, ranked: !!ranked, attempt: ranked ? D.ranked : 0, ticket }); }
  function onDailyEnd() { const dr = daily; if (!dr || dr.ended) return; dr.ended = true;
    const res = KM.dailyScore(sim, dr.rules), D = dToday(), sameDay = D.day === dr.day, newBest = dr.ranked && sameDay && res.score > D.best; let token = 0, badge = '';
    const V = !!(KM.DAILY_VERIFY_URL && dr.ticket);   // verified mode: nothing is granted until the server confirms the run
    if (dr.ranked && sameDay && !V) { if (newBest) { D.best = res.score; D.bestParts = res.parts; }
      if (!D.done && (res.done || res.t >= 120)) { D.done = 1; token = 1; save.daily.days = [...new Set([...save.daily.days, dr.day])].slice(-400); save.daily.total = save.daily.days.length; bank(1, 0, 'daily');
        const b = DBADGES.find(([n]) => n === save.daily.total); if (b) { badge = b[1]; if (!save.titles.includes(b[1])) save.titles.push(b[1]); } if (dWeek() === 5) badge = badge || 'FULL WEEK'; } }
    const gDone = goalsAfter({ daily: true }); persist(); audio.play(res.done ? 'pb' : 'death'); KM.haptic([30, 40, 30]);
    if (V && sim.rec) { const q = dq.load(); q.push({ day: dr.day, body: { ticket: dr.ticket, station: dr.station || 'off', rec: sim.rec, endStep: sim.stepN, claim: res.score, build: KM.BUILD || '' } }); dq.save(q);
      dFlush((it, r, v) => { if (it.body.ticket !== dr.ticket || !$('dVer')) return; $('dVer').innerHTML = r && r.ok ? '✓ VERIFIED · RANK ' + r.rank + ' OF ' + r.of + ' TODAY' + (r.rewarded ? ' · +1 WAR TOKEN' : '') + (v.badge ? ' · BADGE: ' + esc(v.badge) : '') : 'NOT VERIFIED: ' + esc(r && r.reason || 'unknown') + ' (no reward)'; }); }
    Analytics.track('daily_end', { day: dr.day, type: dr.rules.id, ranked: dr.ranked ? 1 : 0, station: dr.station || 'off', score: res.score, done: res.done ? 1 : 0, t: Math.round(res.t), inputs: sim.rec ? sim.rec.length : 0, best: newBest ? 1 : 0 });
    Telemetry.end(sim, Object.assign(sim.results(), { daily: { day: dr.day, type: dr.rules.id, ranked: dr.ranked, score: res.score } }), { quality: render.quality });
    setTimeout(() => { if (state !== 'run' || daily !== dr) return; state = 'over'; lastDaily = true; daily = null; $('tip').classList.add('hidden');
      const P = res.parts, left = KM.DAILY.RANKED - D.ranked;
      $('over').querySelector('.sv').textContent = 'DAILY DEFENSE · ' + dr.rules.name + (dr.ranked ? '' : ' · PRACTICE'); $('oTime').textContent = KM.fmtNum(res.score);
      $('oPb').textContent = V ? 'SUBMITTED FOR VERIFICATION · BEST TODAY ' + (D.best ? KM.fmtNum(D.best) : '—') : newBest ? '★ NEW BEST TODAY ★' : dr.ranked ? 'BEST TODAY ' + KM.fmtNum(D.best) : 'PRACTICE (NOT RANKED) · BEST TODAY ' + (D.best ? KM.fmtNum(D.best) : '—');
      $('oStats').innerHTML = [['skull', 'Enemies ×10', '+' + KM.fmtNum(P.kills)], ['wave', 'Waves cleared ×300', '+' + KM.fmtNum(P.waves)], ['star', 'Bosses ×2,500', '+' + KM.fmtNum(P.bosses)], ['clock', res.done ? 'Finished 4:00 (+' + res.hp + '% HP)' : 'Fell at ' + KM.fmtTime(res.t), '+' + KM.fmtNum(P.finish)]]
        .concat(P.gold ? [['coin', 'Gold left (5 %)', '+' + KM.fmtNum(P.gold)]] : []).concat(token ? [['token', 'Daily completed', '+1 War Token']] : [])
        .map(([i, l, v]) => `<div>${svg(i)}<span>${l}</span><b>${v}</b></div>`).join('') + (badge ? `<div style="justify-content:center;color:var(--gold);font-weight:900">BADGE: ${badge}</div>` : '') + goalsLine(gDone) +
        `<div style="opacity:.75;font-size:12px;justify-content:center">${left ? left + ' ranked attempt' + (left > 1 ? 's' : '') + ' left today' : 'No ranked attempts left · practice is unlimited'}</div>` + (V ? '<div id="dVer" style="font-size:12px;justify-content:center;font-weight:900">VERIFYING… (best, War Token and badges are granted once the server confirms)</div>' : '');
      $('againBtn').textContent = 'DAILY DEFENSE'; $('reviveBtn').classList.add('hidden');
      for (const id of ['drawer', 'rightCol', 'powers', 'tankUps', 'consPop', 'clsPop', 'choice', 'bossBar', 'tankHp']) $(id).classList.add('hidden'); show('over'); hook('death', res); }, 1300); }
  $('dailyBtn').onclick = () => { audio.play('tap'); openDaily(); };
  $('goalsBtn').onclick = () => { audio.play('tap'); openGoals('title'); };
  $('dGoals').onclick = () => { audio.play('tap'); openGoals('daily'); };
  $('dRanked').onclick = () => { audio.play('tap'); playDaily(true); };
  $('dPractice').onclick = () => { audio.play('tap'); playDaily(false); };
  $('dBack').onclick = () => { audio.play('tap'); goTitle(); };
  setInterval(() => { if (state === 'title' || khOn()) dailyTitle(); else if (state === 'daily' && $('dCount')) { $('dCount').textContent = dCount(KM.dailyResetIn()); if (save.daily.day !== KM.dailyDay()) openDaily(); } }, 1000);   // the countdown ticks; a new day refreshes the screen

  // ---------- WAR PLAN (owner-approved 2026-10-13): pre-battle page and in-run PLAN card (left soldier column, under the six classes) ----------
  // A plan is a TARGET of living ordinary soldiers per class. AUTO deploys toward it as Gold and CAP allow (round robin Looter → Giant);
  // nothing is free, nothing is despawned, TAP stays manual. In battle the editor pauses the simulation and restores the prior state.
  let planMode = null, planDraft = null, planWas = false;
  classes.insertAdjacentHTML('beforeend', '<div id="planCard" role="button" aria-label="War plan: edit soldier targets"><span>PLAN</span><small id="planSum"></small></div>');
  const planCard = $('planCard');
  const planSumUI = () => { const p = state === 'run' ? sim.plan : save.plan, n = KM.planPts(p); $('planSum').textContent = n ? n + '/' + KM.ARMY_CAP : 'OFF'; };
  planCard.addEventListener('click', e => { e.stopPropagation(); audio.unlock(); if (state !== 'run' || paused) return; audio.play('tap'); openPlan('run'); });
  function openPlan(mode) {
    planMode = mode; planDraft = KM.validPlan(mode === 'run' ? sim.plan : save.plan);
    if (mode === 'run') { planWas = paused; paused = true; audio.suspend(true); audio.crowd(0, 0); closePops(); }
    $('planBack').textContent = mode === 'run' ? 'CANCEL' : 'BACK'; $('planGo').textContent = mode === 'run' ? 'APPLY & RESUME' : 'START BATTLE';
    $('planRows').innerHTML = KM.PROD_ORDER.map(k => `<div class="pr" data-k="${k}"><img src="${PORTRAIT(k)}" alt=""><div class="nm">${KM.PLAN_LABEL[k]}<small>${KM.PROD[k].pts} / ${KM.planRow(k)} / ${KM.planMax(k)}</small></div><div class="ct"><button type="button" data-d="-1" aria-label="One fewer ${KM.PLAN_LABEL[k]}">−</button><input inputmode="numeric" pattern="[0-9]*" aria-label="${KM.PLAN_LABEL[k]} target" value="0"><button type="button" data-d="1" aria-label="One more ${KM.PLAN_LABEL[k]}">+</button></div></div>`).join('');
    for (const r of $('planRows').children) { const k = r.dataset.k, inp = r.querySelector('input');
      r.querySelectorAll('button').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); planStep(k, +b.dataset.d); }));
      inp.addEventListener('change', () => planSet(k, inp.value)); inp.addEventListener('focus', () => inp.select()); }
    $('planMsg').textContent = ''; planUI(); chantRow($('planChant')); show('plan'); $('plan').querySelector('.panel').scrollTop = 0;
  }
  function planStep(k, d) { if (d > 0 && !KM.planCanAdd(planDraft, k)) { $('planMsg').textContent = planDraft[k] >= KM.planMax(k) ? KM.PLAN_LABEL[k] + ' MAX IS ' + KM.planMax(k) : 'NOT ENOUGH CAP: ' + KM.PLAN_LABEL[k] + ' NEEDS ' + KM.PROD[k].pts; return; }
    planDraft[k] = Math.max(0, planDraft[k] + d); $('planMsg').textContent = ''; audio.play('tap'); planUI(); }
  function planSet(k, raw) { const want = /^\s*\d+\s*$/.test(String(raw)) ? parseInt(raw, 10) : 0, room = Math.floor((KM.ARMY_CAP - KM.planPts(planDraft) + planDraft[k] * KM.PROD[k].pts) / KM.PROD[k].pts), n = Math.max(0, Math.min(want, KM.planMax(k), room));
    $('planMsg').textContent = n < want ? KM.PLAN_LABEL[k] + ' SET TO ' + n + ' (CAP ' + KM.ARMY_CAP + ' LIMIT)' : /^\s*\d*\s*$/.test(String(raw)) ? '' : 'WHOLE NUMBERS ONLY'; planDraft[k] = n; planUI(); }
  function planUI() { const tot = KM.planPts(planDraft), lv = planMode === 'run' ? sim.stats.cls : null;
    for (const r of $('planRows').children) { const k = r.dataset.k, [m, p] = r.querySelectorAll('button'), inp = r.querySelector('input'); inp.value = planDraft[k]; m.disabled = planDraft[k] <= 0; p.disabled = !KM.planCanAdd(planDraft, k); }
    const t = $('planTot'); t.textContent = tot + ' / ' + KM.ARMY_CAP; t.classList.toggle('full', tot >= KM.ARMY_CAP);
    $('planGold').textContent = tot ? 'GOLD TO FIELD THIS PLAN: ' + KM.fmtNum(KM.planGold(planDraft, lv)) + (lv ? ' at current class prices' : ' at Lv 1 prices') + ' · deployed as Gold allows' : 'ALL ZERO = PLAN OFF (AUTO deploys the selected class)'; }
  function planClose() { planMode = null; planDraft = null; show(null); }
  function planBack() { const m = planMode; if (!m) return; planClose(); if (m === 'start') goTitle(); else { paused = planWas; if (paused) show('pause'); else audio.suspend(false); } }
  $('planReset').onclick = () => { planDraft = KM.emptyPlan(); $('planMsg').textContent = ''; planUI(); };
  $('planBack').onclick = () => planBack();
  $('planGo').onclick = () => { const m = planMode, p = KM.validPlan(planDraft); save.plan = p; persist(); planClose(); Analytics.track('plan_set', { mode: m, pts: KM.planPts(p) });
    if (m === 'start') startRun(); else { sim.setPlan(p); RunSave.write(sim); paused = planWas; if (paused) show('pause'); else audio.suspend(false); drawerUI(); } planSumUI(); };
  setSpeed(speedI); setZoom(zoomI);
  relayout(false);
  // the private build attaches its tools here; the public build has no KM.internalInit and ships none of them
  const api = { sim, render, audio, startRun, setPause, goTitle, banner, save, persist, H, setSpeed, speedNow, setZoom, zoomNow, openPlan, openDaily, openGoals, closeDaily: st0 => { if (st0 === 'run') { state = 'run'; show(paused ? 'pause' : null); } else goTitle(); }, get speedEff() { return speedEff; }, get planMode() { return planMode; }, get planDraft() { return planDraft; }, get glLost() { return glLost; }, get state() { return state; }, set state(v) { state = v; }, get jsCost() { return jsCost; }, get rawMs() { return rawMs; }, get botOn() { return botOn; }, set botOn(v) { botOn = !!v; }, setQuality: q => { pendingQ = q; } };
  addEventListener('pagehide', () => { if (state === 'run' && !daily) RunSave.write(sim); });
  // short credits on a fresh session (tap to skip), then the landing screen; gameplay assets finish loading underneath
  function intro(done) {
    let seen = false; try { seen = sessionStorage.getItem('kmob.intro') === '1'; sessionStorage.setItem('kmob.intro', '1'); } catch (e) { /* ignore */ }
    if (seen) return done();
    const el = $('intro'), ln = $('introLine'), cards = ['<small>PRESENTED BY</small><b>KEEPITIL</b>', '<small>DEVELOPED BY</small><b>TUITEA</b>', '<b class="logo">KMOB</b>'];
    let k = 0, t = 0, end = false; el.classList.remove('hidden'); introOn = true; mark('credits');
    const fin = () => { if (end) return; end = true; introOn = false; clearTimeout(t); el.classList.add('hidden'); done(); };
    const next = () => { if (k >= cards.length) return fin(); ln.classList.remove('on'); setTimeout(() => { ln.innerHTML = cards[k++]; ln.classList.add('on'); t = setTimeout(next, k === cards.length ? 900 : 780); }, k ? 160 : 0); };
    el.addEventListener('pointerdown', fin); next();
  }
  if (KM.internalInit) KM.internalInit(api); else if (KH) goTitle(); else intro(goTitle);   // the marketing home is the first view: no credits flash over it
  requestAnimationFrame(loop);
})();
