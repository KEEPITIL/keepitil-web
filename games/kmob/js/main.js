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
    shop: '<path d="M4 9h16l-1 12H5z" fill="#ff5a6a"/><path d="M3 6h18v4H3z" fill="#ffc21a"/><path d="M12 6v15" stroke="#fff" stroke-width="2"/><path d="M12 6c-2-4-6-3-5 0M12 6c2-4 6-3 5 0" stroke="#ffc21a" stroke-width="2" fill="none"/>',
  };
  const T_ICON = { gun: '#3a8bff', artillery: '#ff7a2f', frost: '#5fe0ff', carrier: '#ffd23a' };
  const svg = k => {
    if (k && k.startsWith('t_')) { const c = T_ICON[k.slice(2)]; return `<svg viewBox="0 0 24 24">${ICON.tower}<circle cx="12" cy="13.5" r="3" fill="${c}" stroke="#fff" stroke-width="1"/></svg>`; }
    return `<svg viewBox="0 0 24 24">${ICON[k] || ICON.star}</svg>`;
  };
  $('armyIco').innerHTML = ICON.army; $('coinIco').innerHTML = ICON.coin;
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
      on: !(DEV && !DEV.telemetry), sent: [], fetch: (...a) => fetch(...a),
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
        else if (t === 'wave' && R.waves[a] != null) { R.waves[a]++; if (a !== 'push') R.bosses.push([b, tt]); } else if (t === 'upgrade') R.ups.push([a.id, tt, b || '']); },
      frame(sim, dt, ms, speed) { if (!R) return; if (ms > 250) R.stalls++; if (ms > R.worstMs && ms < 5000) R.worstMs = Math.round(ms); R.speedSecs[speed] = (R.speedSecs[speed] || 0) + dt;
        R.lane[Math.max(0, Math.min(4, Math.floor((sim.L.x + KM.W.LANE) / (2 * KM.W.LANE) * 5)))] += dt; if (sim.posture) R.defendSecs += dt;
        if (!R.comp30 && sim.t >= 30) R.comp30 = Array.from(sim.nKind.slice(0, KM.FRIEND.length));
        const n = sim.count[0]; if (n > R.peak) R.peak = n; if (n >= sim.stats.cap) { R.capSecs += dt; if (R.capFirst < 0) R.capFirst = Math.round(sim.t); } },
      sample(sim, fps, perf) { if (!R) return; R.fps.push(Math.round(fps)); if (R.fps.length > 900) R.fps.splice(0, 300);
        if (R.fps.length % 10 === 1) R.samples.push([Math.round(sim.t), sim.count[0], sim.count[1], Array.from(sim.nKind.slice(0, KM.FRIEND.length)), sim.posture, sim.sector, perf ? perf.quality : '', perf ? +perf.simMs.toFixed(2) : 0]); },
      qdown(to, fps) { if (R) R.qdown.push([to, Math.round(fps)]); },
      end(sim, r, ctx) { if (!R) return; const S = sim.stats;
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
  render.setSkin(KM.SHOP.find(s => s.id === save.equip.skin) || KM.SHOP[3]); mark('engine');
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
  let state = 'title', paused = false, runId = 0, tut = 0, lastResults = null, botOn = !!(DEV && DEV.bot);

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
      case 'collector': if (!cue.col) { cue.col = 1; banner('COLLECTORS\nBRING COINS TO YOUR TANK', 2.4); } break;
      case 'posture': setPostureUI(a); audio.play(a ? 'shieldhit' : 'upgrade'); KM.haptic(12); banner(a ? 'DEFEND\nHOLD FORMATION' : 'ATTACK\nPUSH FORWARD', 1.1); break;
      case 'colLost': banner('COLLECTOR LOST', 0.9); break;
      case 'upgrade': if (a.id.startsWith('build:') || a.id.startsWith('tup:')) audio.play('build', 0, a.id.startsWith('tup:') ? KM.TOWER_SLOTS[+a.id.slice(4)].x / 9 : 0); audio.play('upgrade'); KM.haptic(20); Analytics.track('upgrades_selected', { id: a.id, n: sim.upgrades, t: Math.floor(sim.t) }); break;
      case 'sector': { const S = KM.SECTORS[a]; if (a !== 'opening') banner(S.name + (b ? '\nNEW THREAT' : ''), 1.8); Analytics.track('sector', { k: a, t: Math.floor(sim.t) }); break; }
      case 'bossTell': audio.play('warn'); KM.haptic(15); break;
      case 'stomp': audio.play('boom'); KM.haptic(35); break;
      case 'charge': if (typeof a === 'string') { banner((a === 'elite' ? 'GIANTS' : a.toUpperCase()) + (b ? '\nATTACK' : '\nBACK IN FORMATION'), 1); break; } banner('BRACE!', 0.9); break;
      case 'bossFight': banner(a ? 'BOSS FIGHT\nTHE WAR HOLDS' : 'BOSS DOWN\nADVANCE!', 1.6); if (!a) audio.play('upgrade'); break;
      case 'summon': audio.play('elite', 0, 0); break;
      case 'warn': banner(a === 'boss' ? 'A BOSS APPROACHES' : a === 'mini' ? 'GIANT INCOMING' : 'MASS WAVE INCOMING', 3.2); audio.play('warn'); KM.haptic(25); $('vig').classList.add('warn'); setTimeout(() => $('vig').classList.remove('warn'), 3200); break;
      case 'elite': audio.play('elite', 0, 0); break;
      case 'death': onDeath(); break;
      case 'towerDown': audio.play('boom', 0, a.x / 9); KM.haptic(30); banner(KM.TOWERS[a.type].name.toUpperCase() + ' KNOCKED OUT', 1.4); break;
      case 'towerUp': audio.play('build', 0, a.x / 9); break;
    }
  });

  // ---------- input: horizontal drag slides the tank (= attack lane) · tap the tank deploys one · hold the tank keeps deploying ----------
  let drag = null, moved = 0;
  const worldPerPx = () => 23 / Math.min(innerWidth, innerHeight * 1.1), MOVE_PX = 10, HOLD_MS = 260, HOLD_EVERY = 0.12;
  const onTank = e => { const v = render.toScreen(sim.L.x, 0.6, sim.L.z), sx = (v.x + 1) / 2 * innerWidth, sy = (1 - v.y) / 2 * innerHeight; return Math.hypot(e.clientX - sx, e.clientY - sy) < Math.max(56, innerWidth * 0.16); };
  const tapDeploy = how => { const ok = sim.deployOne(how); if (ok) { Telemetry.count(how); if (tut === 1) setTip(2); } else if (sim.count[0] >= sim.stats.cap) banner('ARMY ' + sim.stats.cap + ' / ' + sim.stats.cap, 0.6); return ok; };
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
  const tips = [['DRAG LEFT / RIGHT', 'THE TANK CHOOSES THE ATTACK LANE'], ['TAP THE TANK', 'DEPLOYS YOUR SELECTED SOLDIER'], ['UPGRADE', 'TAP A GOLD BADGE · THE FIGHT KEEPS GOING'], null];
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
    $('hTime').textContent = KM.fmtTime(sim.t); $('hArmy').innerHTML = sim.count[0] + '<small>/' + sim.stats.cap + '</small>'; $('hArmy').classList.toggle('full', sim.count[0] >= sim.stats.cap); $('hCoins').textContent = KM.fmtShort(sim.coins);
    $('hNext').textContent = 'UPGRADE ' + KM.fmtShort(sim.upCost());
    const hp = sim.L.hp / sim.stats.maxHp; $('hpFill').style.width = (hp * 100).toFixed(1) + '%'; $('hpFill').style.background = hp > 0.5 ? 'linear-gradient(90deg,#4cff8a,#2fbf4f)' : hp > 0.25 ? 'linear-gradient(90deg,#ffe14a,#ff9a1f)' : 'linear-gradient(90deg,#ff6a4a,#d6281f)';
    $('vig').style.boxShadow = `inset 0 0 120px ${20 + 40 * (1 - hp)}px rgba(220,20,20,${hp < 0.35 ? (0.55 - hp) * (0.8 + 0.2 * Math.sin(performance.now() / 150)) : 0})`;
  }


  // ---------- flow ----------
  function show(id) { for (const s of ['title', 'over', 'pause', 'shop', 'settings']) $(s).classList.toggle('hidden', s !== id); }
  function startRun(resume) {
    audio.unlock(); runId++; RunSave.clear();
    const comp = !!save.settings.competitive;
    let resumed = false;
    if (resume) { try { sim.restore(resume.snap); resumed = true; } catch (e) { sim.reset({ seed: (Date.now() ^ (runId * 2654435761)) >>> 0, perm: comp ? null : save.perm }); banner('SAVED RUN COULD NOT BE RESTORED', 2); } }
    else sim.reset({ seed: (Date.now() ^ (runId * 2654435761)) >>> 0, perm: comp ? null : save.perm });
    render.resetRun(); render.setSkin(KM.SHOP.find(s => s.id === save.equip.skin) || KM.SHOP[3]);
    state = 'run'; paused = false; show(null);
    $('hud').classList.remove('hidden'); $('hpbar').classList.remove('hidden'); setPostureUI(sim.posture);
    moved = 0; setTip(save.ach.tutorial ? 4 : 0);
    if (save.ach.tutorial) { tut = 4; banner('SURVIVE!', 1.2); }
    Analytics.track(resumed ? 'run_resume' : 'run_start', { run: save.totals.runs + 1, competitive: comp, resumeFailed: !!resume && !resumed });
    if (resumed) { banner('CONTINUE', 1); RunSave.write(sim); }
    Telemetry.begin(sim, { quality: render.quality, speed: speedNow(), comp, runN: save.totals.runs + 1, resumed, resumeFailed: !!resume && !resumed });
    hook('start');
  }
  function onDeath() {
    audio.play('death'); audio.crowd(0, 0); KM.haptic([40, 60, 80]);
    const r = lastResults = sim.results(); RunSave.clear();
    const { pb } = KM.recordRun(save, r); persist();
    Analytics.track('run_end', { survival_time: Math.floor(r.time), death_reason: r.reason, peak_army_size: r.peakArmy, currency_collected: r.coins, kills: r.kills, upgrades: r.upgrades, player_death_x: +sim.L.x.toFixed(1), revive_used: !!sim.revived });
    if (pb) Analytics.track('personal_best', { t: Math.floor(r.time) });
    Telemetry.end(sim, r, { quality: render.quality });
    setTimeout(() => {
      if (state !== 'run') return;
      state = 'over'; $('tip').classList.add('hidden');
      $('oTime').textContent = KM.fmtTime(r.time);
      const best = save.settings.competitive ? save.best.comp : save.best.all;
      $('oPb').textContent = pb ? '★ NEW PERSONAL BEST ★' : 'BEST ' + KM.fmtTime(best) + ' · TODAY ' + KM.fmtTime(save.best.daily.t);
      if (pb) audio.play('pb');
      const reason = { breach: 'Enemies broke through the line', bomber: 'Hit by a bomber', siege: 'Hit by siege fire', ranged: 'Shot down', overrun: 'Overrun' }[r.reason] || 'Overrun by ' + r.reason + 's';
      $('oStats').innerHTML = [['skull', 'Enemies Defeated', KM.fmtNum(r.kills)], ['coin', 'Coins Collected', KM.fmtNum(r.coins)], ['army', 'Peak Army Size', r.peakArmy], ['flag', 'Distance Reached', KM.fmtNum(r.distance) + ' m'], ['token', 'Reward Tokens', '+' + r.tokens]]
        .map(([i, l, v]) => `<div>${svg(i)}<span>${l}</span><b>${v}</b></div>`).join('') + `<div style="opacity:.7;font-size:12px;justify-content:center">${reason}</div>`;
      $('reviveBtn').classList.toggle('hidden', !!sim.revived || !!save.settings.competitive || !(DEV && DEV.revive));
      $('postureBtn').classList.add('hidden'); prodBar.classList.add('hidden'); show('over'); hook('death', r);
    }, 1300);
  }
  function setPause(p) { if (state !== 'run') return; paused = p; show(p ? 'pause' : null); audio.suspend(p); if (p) { buildToggles($('pToggles')); audio.crowd(0, 0); } }
  function goTitle() {
    Telemetry.flush('quit');
    const rs = RunSave.load(); $('contBtn').classList.toggle('hidden', !rs); if (rs) $('contInfo').textContent = KM.fmtTime(rs.snap.t) + ' · ARMY ' + rs.snap.army.reduce((a, b) => a + b, 0);
    state = 'title'; $('hud').classList.add('hidden'); $('hpbar').classList.add('hidden'); $('postureBtn').classList.add('hidden'); prodBar.classList.add('hidden'); $('tip').classList.add('hidden');
    const b = save.settings.competitive ? save.best.comp : save.best.all;
    $('titleBest').innerHTML = `<span>BEST<b>${KM.fmtTime(b)}</b></span><span>TODAY<b>${KM.fmtTime(save.best.daily.d === KM.dayKey(new Date()) ? save.best.daily.t : 0)}</b></span><span class="tok">${ICON.token ? `<svg viewBox="0 0 24 24">${ICON.token}</svg>` : ''}${save.tokens}</span>`;
    show('title'); mark('interactive');
  }
  function buildToggles(el) {
    const rows = [['sound', 'Sound effects'], ['music', 'Music'], ['haptics', 'Vibration'], ['competitive', 'Competitive mode (same start for everyone)']];
    el.innerHTML = rows.map(([k, l]) => `<label>${l}<input type="checkbox" data-k="${k}" ${save.settings[k] ? 'checked' : ''}></label>`).join('');
    el.querySelectorAll('input').forEach(inp => inp.onchange = () => { const k = inp.dataset.k; save.settings[k] = inp.checked ? 1 : 0; persist(); if (k === 'sound') audio.setSound(inp.checked); if (k === 'music') audio.setMusic(inp.checked); });
  }
  function openShop(back) {
    Analytics.track('shop_open', { tokens: save.tokens });
    const draw = () => {
      $('shopTok').innerHTML = `<svg viewBox="0 0 24 24">${ICON.token}</svg>${save.tokens}`;
      $('shopGrid').innerHTML = KM.SHOP.map(it => {
        if (it.kind === 'bonus') { const lv = save.perm[it.id], max = lv >= it.max, cost = it.cost(lv); return `<div class="item ${max || save.tokens < cost ? 'no' : ''}" data-id="${it.id}"><div class="nm">${it.name}</div><div class="ds">${it.desc} · ${lv}/${it.max}</div><div class="pr">${max ? 'MAXED' : cost + ' tokens'}</div></div>`; }
        const own = save.owned[it.id], eq = save.equip.skin === it.id, cost = it.cost();
        return `<div class="item ${eq ? 'eq' : ''} ${!own && save.tokens < cost ? 'no' : ''}" data-id="${it.id}"><div class="nm"><span class="sw" style="background:${it.color}"></span>${it.name}</div><div class="ds">${it.desc}</div><div class="pr">${eq ? 'EQUIPPED' : own ? 'TAP TO EQUIP' : cost + ' tokens'}</div></div>`;
      }).join('');
      $('shopGrid').querySelectorAll('.item').forEach(n => n.onclick = () => {
        const it = KM.SHOP.find(s => s.id === n.dataset.id);
        if (it.kind === 'bonus') { const lv = save.perm[it.id], c = it.cost(lv); if (lv < it.max && save.tokens >= c) { save.tokens -= c; save.perm[it.id]++; Analytics.track('item_purchase', { id: it.id, lv: lv + 1, cost: c }); audio.play('upgrade'); } }
        else if (save.owned[it.id]) { save.equip.skin = it.id; render.setSkin(it); audio.play('tap'); }
        else if (save.tokens >= it.cost()) { save.tokens -= it.cost(); save.owned[it.id] = 1; save.equip.skin = it.id; render.setSkin(it); Analytics.track('item_purchase', { id: it.id, cost: it.cost() }); audio.play('upgrade'); }
        persist(); draw();
      });
    };
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

  // ---------- game speed: 1× / 1.5× / 2× on ONE authoritative clock ----------
  // game time = real time × speed, consumed in fixed 1/60 s simulation steps (same results on every device / FPS);
  // upgrade choices run in slow motion and introductions hold 1× so nothing important is decided at 2×.
  let autoT = 0, introOn = false;   // the opaque intro covers the canvas: skip drawing so the credits stay on time on slow devices
  const SPEEDS = [1, 1.5, 2]; let speedI = Math.max(0, SPEEDS.indexOf(save.settings.speed || 1)), hold1 = 0, simMs = 0, simDebt = 0;
  const speedNow = () => SPEEDS[speedI];
  function setSpeed(i) { speedI = (i + SPEEDS.length) % SPEEDS.length; save.settings.speed = SPEEDS[speedI]; persist(); $('speedBtn').textContent = SPEEDS[speedI] + '×'; $('speedBtn').classList.toggle('fast', speedI > 0); render.speed = SPEEDS[speedI]; }
  $('speedBtn').addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); audio.unlock(); setSpeed(speedI + 1); audio.play('tap'); });
  sim.on(t => { if (t === 'warn' || t === 'elite' || t === 'boss') hold1 = Math.max(hold1, 3.5); });
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
      hold1 = Math.max(0, hold1 - dt);
      const scale = hold1 > 0 ? 1 : speedNow(); gdt = dt * scale; Telemetry.frame(sim, dt, rawMs, speedNow()); if ((autoT += dt) > 10) { autoT = 0; RunSave.write(sim); }
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
    if (state === 'run' && prodBar.classList.contains('hidden') && sim.alive) { prodBar.classList.remove('hidden'); prodUI(); if (!save.ach.prod) { save.ach.prod = 1; banner('CHOOSE YOUR ARMY', 1.8); } }   // composition is a choice from the first second
    if (state === 'run' && sim.t > 25 && $('postureBtn').classList.contains('hidden') && sim.alive) { $('postureBtn').classList.remove('hidden'); if (!save.ach.posture) { save.ach.posture = 1; banner('TAP DEFEND\nTO HOLD FORMATION', 2.2); } }
    if (!paused && !glLost && !introOn) { render.frame(sim, state === 'run' ? gdt : dt); mark('firstFrame'); if (state === 'run' && sim.t > 0.5) mark('gameplay'); }               // animation follows game time
    jsCost += ((performance.now() - js0) - jsCost) * 0.1;   // JS cost: sim + scene update + draw submission (GPU time excluded)
    adapt(dt); hook('frame', dt);
  }
  // attract mode behind the title: the bot plays a demo battle
  sim.reset({ seed: 7 }); for (let k = 0; k < 240; k++) { KM.bot(sim, STEP, 0.6); sim.step(STEP); }
  const attract = () => { if (state !== 'run' && sim.alive) KM.bot(sim, STEP, 0.6); if (state !== 'run' && !sim.alive) { sim.reset({ seed: 7 + Math.floor(Math.random() * 99) }); render.resetRun(); } };
  setInterval(attract, 50);
  // ---------- army bar: pick the soldier (tile) · buy its upgrade (gold badge) · AUTO on/off ----------
  const prodBar = $('prodBar'), TILE = [...KM.PROD_ORDER, 'tank'];
  const metric = k => { const S = sim.stats, N = sim.nKind, F = KM.FRIEND_BY, n = k === 'tank' ? 0 : N[F[KM.PROD[k].kind].id - 32];
    if (k === 'melee') return [n, 'DMG ' + S.dmg.toFixed(1)]; if (k === 'range') return [n, KM.rtech(S).wpn.toUpperCase()]; if (k === 'collector') return [n, 'BAG ' + Math.round(S.colCap)];
    if (k === 'medic') return [n, 'HEAL ' + Math.round(S.medHeal)]; if (k === 'elite') return [n, 'PWR ' + S.elitePow.toFixed(2)]; return ['ERA ' + (KM.tankEra(S, sim.t) + 1), 'LV ' + sim.upgrades]; };
  prodBar.innerHTML = TILE.map(k => `<div class="pb${k === 'tank' ? ' tk' : ''}" data-p="${k}" role="button"><b>${k === 'tank' ? 'TANK' : KM.PROD[k].name}</b><i></i><small></small><u class="ub hidden" data-g="${k}" role="button"></u>${['melee', 'range', 'elite'].includes(k) ? `<em class="ch hidden" data-c="${k}" role="button" aria-label="${k} attack">⚔</em>` : ''}</div>`).join('') + '<div class="pb auto" id="autoBtn" role="button"><b>AUTO</b><small>ON</small></div>';
  prodBar.querySelectorAll('.pb').forEach(b => b.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); audio.unlock(); if (state !== 'run' || paused) return;
    if (e.target.classList.contains('ch')) { const c = e.target.dataset.c; sim.setCharge(c, !sim.charge[c]); audio.play('tap'); KM.haptic(10); prodUI(); return; }   // DEFEND: this type attacks, the rest hold
    if (e.target.classList.contains('ub')) { if (sim.buy(e.target.dataset.g)) { audio.play('upgrade'); KM.haptic(15); } prodUI(); return; }   // the small badge buys; the tile selects
    if (b.id === 'autoBtn') { sim.setAuto(!sim.auto); audio.play('tap'); prodUI(); return; }
    if (b.dataset.p !== 'tank') { sim.setProd(b.dataset.p); audio.play('tap'); prodUI(); } }));
  function prodUI() {
    const cost = sim.upCost(), afford = sim.coins >= cost;
    for (const b of prodBar.children) { if (b.id === 'autoBtn') { b.classList.toggle('on', sim.auto); b.lastChild.textContent = sim.auto ? 'ON' : 'TAP TANK'; continue; }
      const k = b.dataset.p, m = metric(k), up = sim.ups && sim.ups[k], ub = b.querySelector('.ub');
      b.classList.toggle('on', sim.prod === k); b.children[1].textContent = k === 'tank' ? m[0] : m[0] + (k !== 'tank' ? ' · ' + KM.PROD[k].cost + '¢' : ''); b.children[2].textContent = m[1];
      const ch = b.querySelector('.ch'); if (ch) { ch.classList.toggle('hidden', sim.posture !== 1); ch.classList.toggle('on', !!sim.charge[k]); }
      ub.classList.toggle('hidden', !up); ub.classList.toggle('can', !!up && afford); if (up) { ub.textContent = (up.val || up.title).split(' ')[0].slice(0, 6); ub.title = up.title + ' ' + (up.val || ''); } if (up && afford && tut === 2) setTip(3); }
  }
  setInterval(() => { if (state === 'run' && !prodBar.classList.contains('hidden')) prodUI(); }, 300);
  sim.on(t => { if (t === 'prod' || t === 'auto' || t === 'upgrade' || t === 'posture' || t === 'charge') prodUI(); });
  // ---------- ATTACK / DEFEND: the one posture control ----------
  const cue = {};
  function setPostureUI(p) { const b = $('postureBtn'); b.classList.toggle('def', !!p); $('postureTxt').textContent = p ? 'DEFEND' : 'ATTACK'; $('postureSub').textContent = p ? 'TAP TO ATTACK' : 'TAP TO DEFEND'; }
  $('postureBtn').addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); audio.unlock(); if (state === 'run' && !paused) sim.togglePosture(); });
  addEventListener('keydown', e => { if (e.code === 'Space' && state === 'run' && !paused) { e.preventDefault(); sim.togglePosture(); } });
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
