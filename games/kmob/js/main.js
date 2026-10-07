/* KMOB main — game flow (title → run → results → instant restart), one-finger input, HUD, upgrades, shop, save,
   analytics hooks, debug tools (?debug=1) and adaptive quality. */
(function () {
  if (window.KM_REDIRECT) return;
  const KM = window.KM, $ = id => document.getElementById(id);
  // Public build reads no URL flags. Internal tooling (benchmark, playtest, debug, stress, showcase) lives in js/internal.js,
  // which only the private build loads; it sets KM.DEV and receives the game API through KM.internalInit.
  const DEV = KM.DEV || null;
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
    linebreaker: '<path d="M12 23V4" stroke="#ffd23a" stroke-width="4.5"/><path d="M6 9l6-7 6 7" fill="none" stroke="#fff" stroke-width="2.2"/>',
    arrowstorm: '<g stroke="#e8eef8" stroke-width="1.8"><path d="M6 2v14M12 4v14M18 2v14"/></g><g fill="#ffd23a"><path d="M3.5 15h5L6 21zM9.5 17h5L12 23zM15.5 15h5L18 21z"/></g>',
    elemental: '<path d="M13 2L5 13h6l-2 9 10-13h-6l2-7z" fill="#5fe0ff" stroke="#0a6a8a" stroke-width="1.2" stroke-linejoin="round"/>',
    mercenary: '<path d="M4 14a8 8 0 0116 0v4h-5v-4h-6v4H4z" fill="#d8dee8" stroke="#5a6478" stroke-width="1.2"/><path d="M17 1v8M13 5h8" stroke="#4cff8a" stroke-width="2.6"/>',
    fortress: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="#4cff8a" stroke="#0e5a2a" stroke-width="1.4"/><path d="M12 7v9M7.5 11.5h9" stroke="#fff" stroke-width="2.4"/>',
    shop: '<path d="M4 9h16l-1 12H5z" fill="#ff5a6a"/><path d="M3 6h18v4H3z" fill="#ffc21a"/><path d="M12 6v15" stroke="#fff" stroke-width="2"/><path d="M12 6c-2-4-6-3-5 0M12 6c2-4 6-3 5 0" stroke="#ffc21a" stroke-width="2" fill="none"/>',
  };
  const T_ICON = { gun: '#3a8bff', artillery: '#ff7a2f', frost: '#5fe0ff', carrier: '#ffd23a' };
  const svg = k => {
    if (k && k.startsWith('t_')) { const c = T_ICON[k.slice(2)]; return `<svg viewBox="0 0 24 24">${ICON.tower}<circle cx="12" cy="13.5" r="3" fill="${c}" stroke="#fff" stroke-width="1"/></svg>`; }
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
      on: !(DEV && !DEV.telemetry), key: KEY, sent: [], fetch: (...a) => fetch(...a),
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
        Object.assign(R, { wave: sim.wave, bossesKilled: sim.bossesKilled, warTokens: sim.warTokens, cls: Object.assign({}, S.cls), goldSpent: Math.max(0, Math.round(sim.coinsTotal + KM.START_BANK - sim.coins)), energyUsed: sim.powersUsed || 0, emergencies: sim.emergencies || 0, mizardHeal: Math.round(sim.healed || 0), looterRepair: Math.round(sim.repaired || 0), speedLabel: speedI + 1, giants: sim.nKind[KM.FRIEND_BY.giantF.id - 32], pts: sim.pts, equipped: sim.equipped.slice() });
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
  catch (e) { document.body.innerHTML = '<div style="padding:40px;font:16px Nunito,sans-serif;color:#fff">This game needs WebGL. Please try a newer browser or device.</div>'; return; }
  const applyLooks = () => { render.setSkin(KM.SKIN_BY[save.skins.equip.tank] || KM.SKIN_BY.skin_royal); const tint = {}; for (const c of KM.PROD_ORDER) { const sk = KM.SKIN_BY[save.skins.equip[c]]; if (sk) tint[KM.FRIEND_BY[KM.PROD[c].kind].id] = parseInt(sk.color.slice(1), 16); } render.classTint = tint; };
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
  const audio = new KM.Audio(); audio.setSound(save.settings.sound); audio.setMusic(save.settings.music);
  const sim = new KM.Sim({ seed: 1 });
  let combatHits = 0, combatLvl = 0, combatT = 0;
  let state = 'title', paused = false, runId = 0, tut = 0, lastResults = null, botOn = !!(DEV && DEV.bot); const cue = {};

  sim.on((type, a, b, c, d, e) => {
    render.onEvent(sim, type, a, b, c, d, e);
    switch (type) {
      case 'deploy': audio.play('deploy'); break;
      case 'hit': combatHits++; if (b >= 0 && sim.def(b).sh) audio.play('shieldhit'); else audio.play('hit'); break;
      case 'kill': audio.play('kill'); if (b.el) { KM.haptic(30); } Analytics.track && b.el && Analytics.track('enemy_type_death', { type: b.k, t: Math.floor(sim.t) }); break;
      case 'coin': audio.play('coin'); if (a >= 5) KM.haptic(8); break;
      case 'shot': if (a === 1) audio.play('cannon', 0, b / 9); else if (a === 0) audio.play('bow'); else if (a === 2) audio.play('frost'); break;
      case 'boom': audio.play('boom'); break;
      case 'shove': if ((e || 0) >= 2) audio.play('thud', 0, c / 10); break;
      case 'lhit': audio.play('lhit', 0, sim.L.x / 10); KM.haptic(15); break;
      case 'tower': audio.play(a.type === 'gun' && a.lvl >= 3 ? 'snipe' : 'tower', 0, a.x / 9); break;
      case 'tankfire': audio.play('cannon', 0, sim.L.x / 10); break;
      case 'missiles': audio.play('snipe', 0, sim.L.x / 10); break;
      case 'shieldBreak': audio.play('boom'); KM.haptic(25); banner('SHIELD DOWN', 1.1); break;
      case 'shieldUp': audio.play('frost'); break;
      case 'deposit': audio.play('coin'); break;
      case 'collector': if (!cue.col) { cue.col = 1; banner('LOOTERS\nBRING COINS TO YOUR TANK', 2.4); } break;
      case 'repair': if (!cue.rep) { cue.rep = 1; banner('LOOTERS\nREPAIR THE TANK', 1.6); } break;
      case 'posture': setPostureUI(); break;
      case 'allOrder': allTip(a ? 'ALL DEFEND' : 'ALL ATTACK'); audio.play(a ? 'shieldhit' : 'upgrade'); KM.haptic([20, 30, 20]); setPostureUI(); break;
      case 'colLost': banner('LOOTER LOST', 0.9); break;
      case 'upgrade': if (a.id === 'mastery') banner('TANK MASTERY ' + (sim.stats.lv.mastery || 0), 0.9); if (a.id.startsWith('build:') || a.id.startsWith('tup:')) audio.play('build', 0, a.id.startsWith('tup:') ? KM.TOWER_SLOTS[+a.id.slice(4)].x / 9 : 0); audio.play('upgrade'); KM.haptic(20); Analytics.track('upgrades_selected', { id: a.id, n: sim.upgrades, t: Math.floor(sim.t) }); break;
      case 'sector': { const S = KM.SECTORS[a]; if (a !== 'opening') banner(S.name + (b ? '\nNEW THREAT' : ''), 1.8); Analytics.track('sector', { k: a, t: Math.floor(sim.t) }); break; }
      case 'bossTell': audio.play('warn'); KM.haptic(15); break;
      case 'stomp': audio.play('boom'); KM.haptic(35); break;
      case 'charge': if (typeof a === 'string') { if (KM.PROD[a]) banner(KM.PROD[a].name + (b ? '\nATTACK' : '\nDEFEND'), 0.9); audio.play(b ? 'upgrade' : 'shieldhit'); KM.haptic(12); setPostureUI(); break; } banner('BRACE!', 0.9); break;
      case 'bossFight': banner(a ? 'BOSS FIGHT\nTHE WAR HOLDS' : 'BOSS DOWN\nADVANCE!', 1.6); if (!a) audio.play('upgrade'); break;
      case 'summon': audio.play('elite', 0, 0); break;
      case 'warn': banner(a === 'boss' ? 'A BOSS APPROACHES' : a === 'mini' ? 'GIANT INCOMING' : 'MASS WAVE INCOMING', 3.2); audio.play('warn'); KM.haptic(25); $('vig').classList.add('warn'); setTimeout(() => $('vig').classList.remove('warn'), 3200); break;
      case 'elite': audio.play('elite', 0, 0); break;
      case 'death': onDeath(); break;
      case 'waveStart': { const S = KM.SECTORS[c] || KM.SECTORS.opening; banner('WAVE ' + a + (b === 10 ? '\nBOSS' : '\n' + S.name), 1.4); if (!recordShown && save.records.wave && a > save.records.wave) { recordShown = true; setTimeout(() => banner('NEW RECORD\nWAVE ' + a, 1.8), 1500); audio.play('pb'); } break; }
      case 'waveClear': checkMilestones(); RunSave.write(sim); break;
      case 'bossReward': bank(a.tokens, 0, 'boss'); banner('BOSS DEFEATED\n+' + a.tokens + ' WAR TOKEN · +' + KM.fmtShort(a.gold) + ' GOLD', 2.2); RunSave.write(sim); break;
      case 'levelUp': banner(KM.PROD[a].name + ' LEVEL ' + b, 0.9); break;
      case 'evolve': banner(KM.PROD[a].name + ' VETERANS\nSTRONGER · 2 ARMY POINTS', 1.6); audio.play('pb'); break;
      case 'emergency': if (a) { banner('EMERGENCY DEFENSE', 1.2); KM.haptic(30); } break;
      case 'power': audio.play('boom'); break;
      case 'towerDown': audio.play('boom', 0, a.x / 9); KM.haptic(30); banner(KM.TOWERS[a.type].name.toUpperCase() + ' KNOCKED OUT', 1.4); break;
      case 'towerUp': audio.play('build', 0, a.x / 9); break;
    }
  });

  // ---------- input: horizontal drag slides the tank (= attack lane) · tap the tank deploys one · hold the tank keeps deploying ----------
  let drag = null, moved = 0;
  const worldPerPx = () => 23 / Math.min(innerWidth, innerHeight * 1.1), MOVE_PX = 10, HOLD_MS = 260, HOLD_EVERY = 0.12;
  const onTank = e => { const v = render.toScreen(sim.L.x, 0.6, sim.L.z), sx = (v.x + 1) / 2 * innerWidth, sy = (1 - v.y) / 2 * innerHeight; return Math.hypot(e.clientX - sx, e.clientY - sy) < Math.max(56, innerWidth * 0.16); };
  const tapDeploy = how => { const ok = sim.deployOne(how); if (ok) { Telemetry.count(how); if (tut === 1) setTip(2); } else if (sim.pts + sim.prodPts() > sim.stats.cap) banner('ARMY ' + sim.pts + ' / ' + sim.stats.cap, 0.6); return ok; };
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
  function holdTick(dt) { if (!drag || !drag.tank || drag.horiz || sim.auto || state !== 'run' || paused) return; if (performance.now() - drag.t0 < HOLD_MS) return;
    drag.acc -= dt; if (drag.acc <= 0) { drag.acc = HOLD_EVERY; if (tapDeploy('hold')) drag.held++; } }
  // keyboard fallback for desktop: arrows/A-D slide, Enter deploys
  const keys = {}; addEventListener('keydown', e => { keys[e.key] = 1; if (e.key === 'Escape' && state === 'run') setPause(!paused); if ((e.key === ' ' || e.key === 'Enter') && state === 'over') startRun(); if (e.key === 'Enter' && state === 'run' && !paused && !sim.auto) tapDeploy('tap'); });
  addEventListener('keyup', e => { keys[e.key] = 0; });

  // ---------- HUD + prompts ----------
  const tips = [['DRAG LEFT / RIGHT', 'THE TANK CHOOSES THE ATTACK LANE'], ['TAP THE TANK', 'DEPLOYS YOUR SELECTED SOLDIER'], ['LEVEL UP', 'TAP THE SELECTED CLASS AGAIN · THE FIGHT KEEPS GOING'], null];
  function setTip(n) {
    tut = n; const t = tips[n], el = $('tip');
    if (!t) { el.classList.add('hidden'); save.ach.tutorial = 1; persist(); return; }
    $('tipBig').textContent = t[0]; $('tipSm').textContent = t[1]; $('tipHand').style.display = n === 0 ? '' : 'none'; el.classList.remove('hidden');
    if (n === 3) setTimeout(() => { if (tut === 3) setTip(4); }, 3500);
  }
  let bannerT = 0; function banner(txt, s) { const b = $('banner'); b.textContent = txt; b.classList.add('on'); bannerT = s; }
  let hudAcc = 0;
  function hud(dt) {
    hudAcc += dt; if (hudAcc < 0.1) return; hudAcc = 0;
    $('hTime').textContent = KM.fmtTime(sim.t); $('hArmy').textContent = sim.count[0]; $('hWave').textContent = Math.max(1, sim.wave);   // icons say what they are: no labels, no maximums
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
  function show(id) { for (const s of ['title', 'over', 'pause', 'shop', 'settings']) $(s).classList.toggle('hidden', s !== id); }
  if (!save.player) { save.player = Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join(''); persist(); }   // anonymous commander id for the boards
  const runOpts = () => ({ seed: (Date.now() ^ (runId * 2654435761)) >>> 0, equip: save.powers.equip, powerLv: save.powers.lv, skins: save.skins.equip });
  let recordShown = false;
  function startRun(resume) {
    audio.unlock(); runId++; RunSave.clear();
    let resumed = false;
    if (resume) { try { sim.reset(runOpts()); sim.restore(resume.snap); resumed = true; } catch (e) { sim.reset(runOpts()); banner('SAVED RUN COULD NOT BE RESTORED', 2); } }
    else sim.reset(runOpts());
    render.resetRun(); applyLooks(); recordShown = false;
    state = 'run'; paused = false; show(null);
    for (const id of ['hud', 'tankHp', 'drawer', 'rightCol']) $(id).classList.remove('hidden'); closePops(); setPostureUI(); drawerUI(); choiceUI();
    moved = 0; setTip(save.ach.tutorial ? 4 : 0);
    if (save.ach.tutorial) { tut = 4; banner(resumed ? 'CONTINUE WAR' : 'CHOOSE YOUR ARMY', 1.4); }
    Analytics.track(resumed ? 'run_resume' : 'run_start', { run: save.totals.runs + 1, resumeFailed: !!resume && !resumed });
    if (resumed) RunSave.write(sim);
    Telemetry.begin(sim, { quality: render.quality, speed: speedNow(), runN: save.totals.runs + 1, resumed, resumeFailed: !!resume && !resumed });
    hook('start');
  }
  // permanent rewards bank the moment they are earned (bosses, milestones, records) — a long run can never be lost
  function bank(t, d, why) { if (t) save.tokens += t; if (d) save.diamonds += d; persist(); Analytics.track('bank', { tokens: t || 0, diamonds: d || 0, why }); }
  function checkMilestones() { for (const m of KM.MILESTONES) if (sim.wave >= m.wave && !save.titles.includes(m.title)) { save.titles.push(m.title); bank(m.tokens, m.diamonds || 0, 'milestone'); banner(m.title + '\n+' + m.tokens + ' WAR TOKENS', 2.4); audio.play('pb'); } }
  // leaderboard: anonymous best runs — LIFETIME (highest wave ever) and WEEKLY (best run this week); order wave → time → bosses
  const LB = (() => { const BASE = 'https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/', KEY = Telemetry.key;
    const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };
    return { on: Telemetry.on,
      submit(r) { if (!this.on || !r.wave) return; try { fetch(BASE + 'kmob_scores', { method: 'POST', keepalive: true, headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, H), body: JSON.stringify({ player: save.player, wave: r.wave, secs: Math.round(r.time), bosses: r.bosses, week: KM.weekKey(new Date()), assisted: !!(sim.revived || (DEV && (DEV.bot || DEV.debug || DEV.autoplay))), build: KM.BUILD }) }).catch(() => {}); } catch (e) { /* boards are optional */ } },
      top(kind) { if (!this.on) return Promise.resolve(null); const q = kind === 'weekly' ? 'kmob_lb_weekly?week=eq.' + KM.weekKey(new Date()) + '&' : 'kmob_lb_lifetime?'; return fetch(BASE + q + 'select=player,wave,secs,bosses&order=wave.desc,secs.desc,bosses.desc&limit=5', { headers: H }).then(x => x.ok ? x.json() : null).catch(() => null); } }; })();
  function onDeath() {
    audio.play('death'); audio.crowd(0, 0); KM.haptic([40, 60, 80]);
    const r = lastResults = sim.results(); RunSave.clear();
    const { records } = KM.recordRun(save, r); if (records.includes('wave')) bank(1, 0, 'record');   // a new best wave earns a War Token
    persist(); LB.submit(r);
    Analytics.track('run_end', { wave: r.wave, survival_time: Math.floor(r.time), death_reason: r.reason, bosses: r.bosses, kills: r.kills, records });
    Telemetry.end(sim, r, { quality: render.quality });
    setTimeout(() => {
      if (state !== 'run') return;
      state = 'over'; $('tip').classList.add('hidden');
      $('oTime').textContent = 'WAVE ' + r.wave; $('oPb').textContent = records.length ? '★ NEW RECORD: ' + records.map(k => ({ wave: 'WAVE', time: 'TIME', bosses: 'BOSSES', kills: 'KILLS', army: 'ARMY' })[k]).join(' · ') + ' ★' : 'BEST WAVE ' + save.records.wave + ' · ' + KM.fmtTime(save.records.time);
      if (records.length) audio.play('pb');
      const reason = { breach: 'Enemies broke through the line', bomber: 'Hit by a bomber', siege: 'Hit by siege fire', ranged: 'Shot down', overrun: 'Overrun', quit: 'Run ended' }[r.reason] || 'Overrun by ' + r.reason + 's';
      $('oStats').innerHTML = [['clock', 'Survival Time', KM.fmtTime(r.time)], ['skull', 'Enemies Defeated', KM.fmtNum(r.kills)], ['star', 'Bosses Defeated', r.bosses], ['token', 'War Tokens (banked)', '+' + (r.warTokens + (records.includes('wave') ? 1 : 0))], ['army', 'Army Development', r.armyDev + ' / 60']]
        .map(([i, l, v]) => `<div>${svg(i)}<span>${l}</span><b>${v}</b></div>`).join('') + `<div style="opacity:.7;font-size:12px;justify-content:center">${reason}</div><div id="lbBox" style="font-size:11px;opacity:.85;justify-content:center"></div>`;
      $('reviveBtn').classList.toggle('hidden', !!sim.revived || !(DEV && DEV.revive));
      for (const id of ['drawer', 'rightCol', 'powers', 'clsPop', 'choice', 'bossBar', 'tankHp']) $(id).classList.add('hidden'); show('over'); hook('death', r);
      LB.top('weekly').then(rows => { const el = $('lbBox'); if (!el || !rows || !rows.length) return; el.innerHTML = 'THIS WEEK: ' + rows.map((x, k) => `${k + 1}. ${x.player === save.player ? 'YOU' : x.player.slice(0, 4)} W${x.wave}`).join(' · '); });
    }, 1300);
  }
  function setPause(p) { if (state !== 'run') return; paused = p; show(p ? 'pause' : null); audio.suspend(p); if (p) { buildToggles($('pToggles')); audio.crowd(0, 0); } }
  function goTitle() {
    Telemetry.flush('quit');
    const rs = RunSave.load(); $('contBtn').classList.toggle('hidden', !rs); if (rs) $('contInfo').textContent = 'WAVE ' + (rs.snap.wave || 1) + ' · ' + KM.fmtTime(rs.snap.t);
    state = 'title'; for (const id of ['hud', 'tankHp', 'drawer', 'rightCol', 'powers', 'clsPop', 'choice', 'bossBar', 'tip']) $(id).classList.add('hidden');
    const R = save.records; $('titleBest').innerHTML = `<div class="titleRec"><span>BEST WAVE<b>${R.wave}</b></span><span>LONGEST<b>${KM.fmtTime(R.time)}</b></span><span>BOSSES<b>${R.bosses}</b></span><span>${svg('token')}<b>${save.tokens}</b></span><span>${svg('diamond')}<b>${save.diamonds}</b></span></div>` + (save.titles.length ? `<div style="font-size:10px;font-weight:900;opacity:.75;margin-top:4px">${save.titles[save.titles.length - 1]}</div>` : '');
    show('title'); mark('interactive');
  }
  function buildToggles(el) {
    const rows = [['sound', 'Sound effects'], ['music', 'Music'], ['haptics', 'Vibration']];
    el.innerHTML = rows.map(([k, l]) => `<label>${l}<input type="checkbox" data-k="${k}" ${save.settings[k] ? 'checked' : ''}></label>`).join('');
    el.querySelectorAll('input').forEach(inp => inp.onchange = () => { const k = inp.dataset.k; save.settings[k] = inp.checked ? 1 : 0; persist(); if (k === 'sound') audio.setSound(inp.checked); if (k === 'music') audio.setMusic(inp.checked); });
  }
  // SHOP: ARMORY (one starter skin per class + tank skins) · POWERS (levels + equip 3) · CURRENCY (bundles, priced later from telemetry)
  let shopTab = 'armory';
  function openShop(back) {
    Analytics.track('shop_open', { tokens: save.tokens, diamonds: save.diamonds });
    const pay = (c) => { if (save.tokens >= c.tokens) { save.tokens -= c.tokens; return 'tokens'; } return null; }, payD = (c) => { if (save.diamonds >= c.diamonds) { save.diamonds -= c.diamonds; return 'diamonds'; } return null; };
    const draw = () => {
      $('shopTok').innerHTML = `${svg('token')}${save.tokens} &nbsp; ${svg('diamond')}${save.diamonds}`;
      for (const b of $('shopTabs').children) b.classList.toggle('on', b.dataset.t === shopTab);
      let html = '';
      if (shopTab === 'armory') html = KM.SKIN_CLASSES.map(c => KM.SKINS.filter(k => k.cls === c).map(k => { const own = save.skins.owned[k.id], eq = save.skins.equip[c] === k.id;
        return `<div class="item ${eq ? 'eq' : ''}" data-id="${k.id}"><div class="nm"><span class="sw" style="background:${k.color}"></span>${c.toUpperCase()} · ${k.name}</div><div class="ds">${k.desc}</div>${own ? `<div class="pr">${eq ? 'EQUIPPED · TAP TO REMOVE' : 'TAP TO EQUIP'}</div>` : `<div class="bt"><button data-buy="t" ${save.tokens < k.tokens ? 'disabled' : ''}>${k.tokens} TOKENS</button><button data-buy="d" ${save.diamonds < k.diamonds ? 'disabled' : ''}>${k.diamonds} ◆</button></div>`}</div>`; }).join('')).join('');
      else if (shopTab === 'powers') html = KM.POWER_IDS.map(id => { const P = KM.POWERS[id], lv = save.powers.lv[id] || 0, c = KM.powerCost(lv), eq = save.powers.equip.includes(id), max = lv >= KM.POWER_MAX;
        return `<div class="item ${eq ? 'eq' : ''}" data-pw="${id}"><div class="nm">${svg(id)} ${P.name} · LV ${lv}</div><div class="ds">${P.desc} · ${P.cost} energy</div><div class="bt"><button data-eq="1">${eq ? 'EQUIPPED' : 'EQUIP'}</button>${max ? '<button disabled>MAX</button>' : `<button data-up="t" ${save.tokens < c.tokens ? 'disabled' : ''}>+1 · ${c.tokens} T</button><button data-up="d" ${save.diamonds < c.diamonds ? 'disabled' : ''}>+1 · ${c.diamonds} ◆</button>`}</div></div>`; }).join('') + '<div style="font-size:11px;opacity:.75;font-weight:800">Equip up to 3 powers for a run.</div>';
      else html = KM.BUNDLES.map(b => `<div class="item no"><div class="nm">${svg('diamond')} ${b.name}</div><div class="ds">${b.diamonds} Diamonds</div><div class="pr">COMING SOON</div></div>`).join('') + '<div style="font-size:11px;opacity:.75;font-weight:800">Diamonds only speed things up — everything in the Armory and Powers can be earned with War Tokens.</div>';
      $('shopGrid').innerHTML = html;
      $('shopGrid').querySelectorAll('[data-id]').forEach(n => n.addEventListener('click', e => { const k = KM.SKIN_BY[n.dataset.id], b = e.target.dataset.buy;
        if (save.skins.owned[k.id]) { if (save.skins.equip[k.cls] === k.id) { if (k.cls !== 'tank') delete save.skins.equip[k.cls]; } else save.skins.equip[k.cls] = k.id; audio.play('tap'); }
        else if (b) { const how = b === 't' ? pay(k) : payD(k); if (how) { save.skins.owned[k.id] = 1; save.skins.equip[k.cls] = k.id; audio.play('upgrade'); Analytics.track('item_purchase', { id: k.id, with: how }); } }
        persist(); applyLooks(); draw(); }));
      $('shopGrid').querySelectorAll('[data-pw]').forEach(n => n.addEventListener('click', e => { const id = n.dataset.pw, t = e.target.dataset, lv = save.powers.lv[id] || 0, c = KM.powerCost(lv);
        if (t.eq) { const E = save.powers.equip; if (E.includes(id)) { if (E.length > 1) E.splice(E.indexOf(id), 1); } else { E.push(id); if (E.length > 3) E.shift(); } audio.play('tap'); }
        else if (t.up && lv < KM.POWER_MAX) { const how = t.up === 't' ? pay(c) : payD(c); if (how) { save.powers.lv[id] = lv + 1; audio.play('upgrade'); Analytics.track('power_up', { id, lv: lv + 1, with: how }); } }
        persist(); draw(); }));
    };
    for (const b of $('shopTabs').children) b.onclick = () => { shopTab = b.dataset.t; audio.play('tap'); draw(); };
    draw(); show('shop'); $('shopClose').onclick = () => { audio.play('tap'); back(); };
  }

  $('playBtn').onclick = () => { Telemetry.landing('play'); startRun(); };
  $('contBtn').onclick = () => { const rs = RunSave.load(); Telemetry.landing('continue'); startRun(rs || null); };
  $('menuBtn').onclick = () => { RunSave.write(sim); paused = false; audio.suspend(false); state = 'menu'; hook('leave', false); goTitle(); };
  $('againBtn').onclick = () => { hook('leave', true); startRun(); };
  $('homeBtn').onclick = () => { hook('leave', false); goTitle(); };
  $('shopBtn1').onclick = () => { Telemetry.landing('shop'); openShop(goTitle); };
  $('shopBtn2').onclick = () => openShop(() => show('over'));
  $('setBtn1').onclick = () => { buildToggles($('sToggles')); show('settings'); };
  $('setClose').onclick = () => goTitle();
  $('pauseBtn').onclick = () => setPause(true);
  $('resumeBtn').onclick = () => setPause(false);
  $('quitBtn').onclick = () => { paused = false; show(null); audio.suspend(false); sim.hurtLauncher(1e9, 'quit'); };
  $('reviveBtn').onclick = () => { if (sim.revive()) { state = 'run'; show(null); Analytics.track('revive_used', {}); } };
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (state === 'run') RunSave.write(sim); if (state === 'run' && !paused) setPause(true); audio.suspend(true); } else if (!paused) audio.suspend(false); });
  addEventListener('resize', () => render.resize());
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
  const SPEEDS = [1, 1.5, 2]; let speedI = Math.max(0, SPEEDS.indexOf(save.settings.speed || 1)), simMs = 0, simDebt = 0;
  const speedNow = () => SPEEDS[speedI];
  function setSpeed(i) { speedI = (i + SPEEDS.length) % SPEEDS.length; save.settings.speed = SPEEDS[speedI]; persist(); $('speedTxt').textContent = String(speedI + 1); render.speed = SPEEDS[speedI]; }   // shown as 1 · 2 · 3 (normal · faster · fastest)
  $('speedBtn').addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); audio.unlock(); setSpeed(speedI + 1); audio.play('tap'); });
  sim.on((t, a, b) => { if (state === 'run') Telemetry.ev(sim, t, a, b); });
  let lastT = performance.now(), acc = 0; const STEP = 1 / 60, MAX_STEPS = 8, MAX_DEBT = 0.2;
  function loop(now) {
    requestAnimationFrame(loop);
    // quality changes are applied before drawing so a resize never presents a cleared (black) canvas
    if (pendingQ) { render.applyQuality(pendingQ); pendingQ = null; }
    const js0 = performance.now();
    rawMs = now - lastT; let dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    let gdt = dt;
    if (state === 'run' && !paused) {
      if (keys.ArrowLeft || keys.a) sim.moveBy(-dt * 14); if (keys.ArrowRight || keys.d) sim.moveBy(dt * 14);
      holdTick(dt);
      const scale = speedNow(); gdt = dt * scale; Telemetry.frame(sim, dt, rawMs, speedNow()); if ((autoT += dt) > 10) { autoT = 0; RunSave.write(sim); }
      acc += gdt; let n = 0; const s0 = performance.now();
      while (acc >= STEP && n < MAX_STEPS) { if (botOn) KM.bot(sim, STEP, 1); sim.step(STEP); acc -= STEP; n++; hook('tick', STEP); }
      if (acc > MAX_DEBT) { simDebt += acc; acc = 0; }                                   // spiral-of-death guard: drop the backlog, never stall
      simMs += ((performance.now() - s0) - simMs) * 0.1;
      hud(dt);
      combatT += dt; if (combatT > 0.5) { combatLvl += (Math.min(1, combatHits / combatT / 40) - combatLvl) * 0.5; combatHits = 0; combatT = 0; audio.crowd(combatLvl, sim.count[0] / 150); }
      audio.tick(Math.min(1, (sim.count[1] / 300) * 0.6 + sim.danger * 0.4 + (sim.diff.m / 30) * 0.3), true);
    } else if (state !== 'run') { sim.step(dt * 0.5); } // keep the battlefield alive behind menus
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').classList.remove('on'); }
    // ATTACK/DEFEND arrives once the first fight has started (the first seconds stay: drag + auto-deploy only)
    if (state === 'run') { bossUI(); tankHpUI(); }
    if (state === 'run' && sim.t > 25 && !save.ach.posture && sim.alive) { save.ach.posture = 1; persist(); banner('TAP ATTACK: SELECTED CLASS\nHOLD: WHOLE ARMY', 2.4); }
    if (!paused && !glLost && !introOn) { render.frame(sim, state === 'run' ? gdt : dt); mark('firstFrame'); if (state === 'run' && sim.t > 0.5) mark('gameplay'); }               // animation follows game time
    jsCost += ((performance.now() - js0) - jsCost) * 0.1;   // JS cost: sim + scene update + draw submission (GPU time excluded)
    adapt(dt); hook('frame', dt);
  }
  // attract mode behind the title: the bot plays a demo battle
  sim.reset({ seed: 7 }); for (let k = 0; k < 240; k++) { KM.bot(sim, STEP, 0.6); sim.step(STEP); }
  const attract = () => { if (state !== 'run' && sim.alive) KM.bot(sim, STEP, 0.6); if (state !== 'run' && !sim.alive) { sim.reset({ seed: 7 + Math.floor(Math.random() * 99) }); render.resetRun(); } };
  setInterval(attract, 50);
  // ---------- soldier panel (bottom left): six portrait cards · tap = select · tap the selected class again = its upgrade details ----------
  const drawer = $('drawer'), classes = $('classes'), pop = $('clsPop'), CHARGE = ['collector', 'range', 'melee', 'elite', 'giant'];
  const PORTRAIT = k => `assets/ui/p_${k}.webp`, GOLD_IMG = '<img src="assets/ui/i_gold.png" alt="">';
  classes.innerHTML = KM.PROD_ORDER.map(k => `<div class="cl" data-p="${k}" role="button" aria-label="${KM.PROD[k].name}"><img src="${PORTRAIT(k)}" alt=""><div class="tx"><b>${KM.PROD[k].name}</b><span class="pr">${GOLD_IMG}${KM.PROD[k].cost}</span><i></i></div><u class="ub hidden">▲</u></div>`).join('');
  const setDrawer = open => { drawer.classList.toggle('away', !open); $('drawerTab').textContent = open ? '‹' : '›'; if (!open) closePops(); };
  let dStart = null;
  drawer.addEventListener('pointerdown', e => { dStart = { x: e.clientX, y: e.clientY }; });
  drawer.addEventListener('pointerup', e => { if (!dStart) return; const dx = e.clientX - dStart.x; dStart = null; if (dx < -30) setDrawer(false); else if (dx > 30) setDrawer(true); });   // swipe left = collapse · swipe right = open
  $('drawerTab').addEventListener('click', e => { e.stopPropagation(); setDrawer(drawer.classList.contains('away')); audio.play('tap'); });
  const fmtStat = v => v >= 100 ? KM.fmtShort(Math.round(v)) : v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
  function popUI() { const k = pop.dataset.k; if (!k || pop.classList.contains('hidden')) return;
    const lv = sim.stats.cls[k], max = lv >= KM.CLASS_MAX, A = sim.classInfo(k, lv), B = max ? A : sim.classInfo(k, lv + 1), cost = sim.clsCost(k), arr = (a, b) => fmtStat(a) + (max ? '' : ` <em>→ ${fmtStat(b)}</em>`);
    pop.innerHTML = `<h4>${KM.PROD[k].name}<small>LV ${lv}${max ? ' · MAX' : ' → ' + (lv + 1)}</small></h4><div class="st"><span>HP</span><b>${arr(A.hp, B.hp)}</b><span>${A.heal ? 'HEAL' : 'DMG'}</span><b>${arr(A.dmg, B.dmg)}</b><span>ARMOR</span><b>${arr(A.arm, B.arm)}</b></div>` +
      (max ? '<button disabled>MAX LEVEL</button>' : `<button ${sim.coins >= cost ? '' : 'disabled'}>UPGRADE ${GOLD_IMG}${KM.fmtShort(cost)}</button>`);
    const bt = pop.querySelector('button'); if (!max) bt.addEventListener('click', e => { e.stopPropagation(); if (sim.levelUp(k)) { audio.play('upgrade'); KM.haptic(15); if (tut === 3) setTip(4); } drawerUI(); popUI(); });
    const card = classes.querySelector(`[data-p="${k}"]`).getBoundingClientRect(), wide = innerWidth > innerHeight * 1.25 && innerWidth >= 820;
    if (wide) { pop.style.left = Math.min(innerWidth - 190, card.left) + 'px'; pop.style.top = Math.max(8, card.top - pop.offsetHeight - 8) + 'px'; }
    else { pop.style.left = (card.right + 8) + 'px'; pop.style.top = Math.max(8, Math.min(innerHeight - pop.offsetHeight - 8, card.top + card.height / 2 - pop.offsetHeight / 2)) + 'px'; } }
  function openPop(k) { closePops(); pop.dataset.k = k; pop.classList.remove('hidden'); popUI(); }
  function closePops() { pop.classList.add('hidden'); pop.dataset.k = ''; $('powers').classList.add('hidden'); }
  classes.querySelectorAll('.cl').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); audio.unlock(); if (state !== 'run' || paused) return; const k = b.dataset.p;
    if (sim.prod === k) { if (pop.dataset.k === k && !pop.classList.contains('hidden')) closePops(); else openPop(k); }   // second tap: upgrade details for the selected class only
    else { sim.setProd(k); closePops(); }
    audio.play('tap'); drawerUI(); setPostureUI(); }));
  addEventListener('pointerdown', e => { if (!e.target.closest || e.target.closest('#clsPop,#classes,#powers,#powerBtn')) return; if (!pop.classList.contains('hidden') || !$('powers').classList.contains('hidden')) closePops(); }, true);
  function drawerUI() {
    for (const b of classes.children) { const k = b.dataset.p, lv = sim.stats.cls[k], cost = sim.clsCost(k), info = sim.classInfo(k, lv);
      b.classList.toggle('on', sim.prod === k); b.classList.toggle('atk', CHARGE.includes(k) && sim.attacking(k));
      b.querySelector('.tx i').textContent = `Lv ${lv} · ${info.heal ? 'HEAL' : 'DMG'} ${fmtStat(info.dmg)}`;
      const can = lv < KM.CLASS_MAX && sim.coins >= cost; b.querySelector('.ub').classList.toggle('hidden', !(can && sim.prod === k)); if (can && tut === 2) setTip(3); }
    $('autoTxt').textContent = sim.auto ? 'AUTO' : 'TAP'; $('autoBtn').classList.toggle('tap', !sim.auto);   // one word: the current mode
    const tb = $('tankBtn'), tc = sim.upCost(), up = sim.ups && sim.ups.tank; tb.classList.toggle('can', !!up && sim.coins >= tc); $('tankCost').textContent = up ? KM.fmtShort(tc) : ''; $('tankCost').classList.toggle('hidden', !up); tb.title = up ? up.title + ' ' + (up.val || '') : '';
    $('powerBtn').classList.toggle('ready', sim.equipped.some(id => sim.canPower(id))); powersUI(true); popUI();
  }
  $('autoBtn').addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); audio.unlock(); if (state !== 'run' || paused) return; sim.setAuto(!sim.auto); audio.play('tap'); drawerUI(); });   // AUTO = auto deploy + auto aim · TAP = manual deploy + lane aim
  $('tankBtn').addEventListener('click', e => { e.stopPropagation(); if (state !== 'run' || paused) return; if (sim.buy('tank')) { audio.play('upgrade'); KM.haptic(15); } else if (sim.ups && sim.ups.tank) banner('UPGRADE · ' + KM.fmtShort(sim.upCost()) + ' GOLD', 0.8); drawerUI(); });
  // POWER opens the three equipped powers beside it; using one closes the selection again
  function powersUI(refresh) { const el = $('powers');
    if (!refresh) el.innerHTML = sim.equipped.map(id => `<div class="pw" data-id="${id}" role="button" aria-label="${KM.POWERS[id].name}">${svg(id)}<b>${KM.POWERS[id].name}</b><small></small></div>`).join('');
    for (const p of el.children) { const id = p.dataset.id, cd = sim.pcd[id] || 0; p.classList.toggle('ready', sim.canPower(id)); p.classList.toggle('cd', cd > 0); p.querySelector('small').textContent = cd > 0 ? Math.ceil(cd) + 's' : KM.POWERS[id].cost + ' ⚡'; }
    if (!refresh) el.querySelectorAll('.pw').forEach(p => p.addEventListener('click', e => { e.stopPropagation(); if (state !== 'run' || paused) return; const id = p.dataset.id;
      if (sim.usePower(id)) { audio.play('boom'); KM.haptic(30); banner(KM.POWERS[id].name, 0.9); closePops(); } else banner((sim.pcd[id] || 0) > 0 ? 'RECHARGING' : 'NEED ' + KM.POWERS[id].cost + ' ENERGY', 0.7); drawerUI(); })); }
  $('powerBtn').addEventListener('click', e => { e.stopPropagation(); audio.unlock(); if (state !== 'run' || paused) return; const el = $('powers'), open = el.classList.contains('hidden'); closePops(); if (!open) return;
    powersUI(); el.classList.remove('hidden'); const r = $('powerBtn').getBoundingClientRect(), wide = innerWidth > innerHeight * 1.25 && innerWidth >= 820;
    if (wide) { el.style.left = r.left + 'px'; el.style.top = (r.top - el.offsetHeight - 12) + 'px'; } else { el.style.left = (r.left - el.offsetWidth - 8) + 'px'; el.style.top = Math.max(8, r.bottom - el.offsetHeight) + 'px'; } audio.play('tap'); });
  // choices (supply on waves 5, 15… · power boost after every boss): a small strip, the war keeps going
  function choiceUI() { const c = sim.choice, el = $('choice'); if (!c) { el.classList.add('hidden'); return; } el.classList.remove('hidden'); $('drawer').classList.remove('wide');
    $('choiceT').textContent = c.kind === 'supply' ? 'SUPPLY — CHOOSE ONE' : 'BOSS REWARD — TANK POWER';
    $('choiceO').innerHTML = c.opts.map((o, k) => `<button data-k="${k}">${o.title}<small>${o.val}</small></button>`).join('');
    $('choiceO').querySelectorAll('button').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); sim.takeChoice(+b.dataset.k); audio.play('upgrade'); choiceUI(); })); }
  // boss name + HP right above the boss
  function bossUI() { const el = $('bossBar'), i = sim.bossI; if (state !== 'run' || !sim.nBoss || i < 0 || sim.st[i] !== 1) { el.classList.add('hidden'); return; }
    const v = render.toScreen(sim.x[i], 3.2 * sim.sc[i] * 0.55 + 1, sim.z[i]), x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight;
    el.classList.remove('hidden'); el.style.left = Math.max(80, Math.min(innerWidth - 80, x)) + 'px'; el.style.top = Math.max(110, Math.min(innerHeight - 140, y - 40)) + 'px';
    $('bossName').textContent = KM.ENEMY[sim.kind[i]].k.toUpperCase(); $('bossFill').style.width = Math.max(0, sim.hp[i] / sim.mhp[i] * 100).toFixed(1) + '%'; $('bossHp').textContent = KM.fmtShort(Math.max(0, sim.hp[i])) + ' / ' + KM.fmtShort(sim.mhp[i]); }
  setInterval(() => { if (state === 'run') drawerUI(); }, 300);
  sim.on(t => { if (t === 'prod' || t === 'auto' || t === 'upgrade' || t === 'posture' || t === 'charge' || t === 'levelUp') drawerUI(); if (t === 'choice' || t === 'chose') choiceUI(); });
  // ---------- ATTACK / DEFEND: one word = the action · tap = the selected class · hold = the whole army (Looters included) ----------
  const HOLD_ALL_MS = 450;
  const wordNow = () => (KM.PROD[sim.prod] && CHARGE.includes(sim.prod) ? sim.attacking(sim.prod) : sim.posture === 0) ? 'DEFEND' : 'ATTACK';
  function setPostureUI() { if (state !== 'run') return; const w = wordNow(); $('postureTxt').textContent = w; $('postureBtn').classList.toggle('def', w === 'DEFEND'); for (const b of classes.children) b.classList.toggle('atk', CHARGE.includes(b.dataset.p) && sim.attacking(b.dataset.p)); }
  let allT = 0; function allTip(t) { if (state !== 'run') return; const el = $('allTip'), r = $('postureBtn').getBoundingClientRect(); el.textContent = t; el.style.left = Math.max(8, r.left - 150) + 'px'; el.style.top = (r.top - 34) + 'px'; el.classList.add('on'); clearTimeout(allT); allT = setTimeout(() => el.classList.remove('on'), 900); }
  function orderTap() { const k = sim.prod; if (!CHARGE.includes(k)) { banner(KM.PROD[k].name + ' HEALS FROM THE REAR\nHOLD FOR ALL ATTACK / DEFEND', 1.4); return; }
    sim.orderClass(k, !sim.attacking(k)); setPostureUI(); }
  function orderHold() { if (wordNow() === 'ATTACK') sim.allAttack(); else sim.allDefend(); setPostureUI(); }
  let pHold = null;
  $('postureBtn').addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); audio.unlock(); if (state !== 'run' || paused) return; const id = e.pointerId;
    pHold = { id, done: false, t: setTimeout(() => { if (pHold && pHold.id === id) { pHold.done = true; orderHold(); } }, HOLD_ALL_MS) }; });
  const pEnd = e => { if (!pHold || e.pointerId !== pHold.id) return; clearTimeout(pHold.t); const held = pHold.done; pHold = null; if (!held && e.type === 'pointerup' && state === 'run' && !paused) orderTap(); };
  $('postureBtn').addEventListener('pointerup', pEnd); $('postureBtn').addEventListener('pointercancel', pEnd); $('postureBtn').addEventListener('pointerleave', e => { if (pHold && !pHold.done && e.pointerId === pHold.id) { clearTimeout(pHold.t); pHold = null; } });
  addEventListener('keydown', e => { if (e.code === 'Space' && state === 'run' && !paused) { e.preventDefault(); if (e.shiftKey) orderHold(); else orderTap(); } });   // desktop: Space = selected class · Shift+Space = whole army
  setSpeed(speedI);
  // the private build attaches its tools here; the public build has no KM.internalInit and ships none of them
  const api = { sim, render, audio, startRun, setPause, goTitle, banner, save, persist, H, setSpeed, speedNow, get glLost() { return glLost; }, get state() { return state; }, set state(v) { state = v; }, get jsCost() { return jsCost; }, get rawMs() { return rawMs; }, get botOn() { return botOn; }, set botOn(v) { botOn = !!v; }, setQuality: q => { pendingQ = q; } };
  addEventListener('pagehide', () => { if (state === 'run') RunSave.write(sim); });
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
  if (KM.internalInit) KM.internalInit(api); else intro(goTitle);
  requestAnimationFrame(loop);
})();
