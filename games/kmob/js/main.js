/* KMOB main — game flow (title → run → results → instant restart), one-finger input, HUD, upgrades, shop, save,
   analytics hooks, debug tools (?debug=1) and adaptive quality. */
(function () {
  if (window.KM_REDIRECT) return;               // ?assets=1 → dev/assets.html (validation page), no game
  const KM = window.KM, $ = id => document.getElementById(id);
  const Q = new URLSearchParams(location.search), DEBUG = Q.has('debug');

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
    fence: '<path d="M3 8l2-3 2 3v13H3zM10 8l2-3 2 3v13h-4zM17 8l2-3 2 3v13h-4z" fill="#d9a86a" stroke="#6a3a10" stroke-width="1"/><path d="M2 11h20v2H2zM2 16h20v2H2z" fill="#9a6a3c"/>',
    wall: '<path d="M2 9h20v12H2z" fill="#3f7cff" stroke="#0e3a8a" stroke-width="1.2"/><path d="M2 9h20v2H2z" fill="#ffc21a"/><circle cx="7" cy="15" r="2" fill="#ffc21a"/><circle cx="17" cy="15" r="2" fill="#ffc21a"/><path d="M12 9v12" stroke="#0e3a8a"/>',
    home: '<path d="M3 11l9-8 9 8v10h-6v-6H9v6H3z" fill="#fff"/>',
    shop: '<path d="M4 9h16l-1 12H5z" fill="#ff5a6a"/><path d="M3 6h18v4H3z" fill="#ffc21a"/><path d="M12 6v15" stroke="#fff" stroke-width="2"/><path d="M12 6c-2-4-6-3-5 0M12 6c2-4 6-3 5 0" stroke="#ffc21a" stroke-width="2" fill="none"/>',
  };
  const T_ICON = { arrow: '#3a8bff', cannon: '#ff7a2f', frost: '#5fe0ff', sniper: '#c58cff', barracks: '#ffd23a', banner: '#3cd27a' };
  const svg = k => {
    if (k && k.startsWith('t_')) { const c = T_ICON[k.slice(2)]; return `<svg viewBox="0 0 24 24">${ICON.tower}<circle cx="12" cy="13.5" r="3" fill="${c}" stroke="#fff" stroke-width="1"/></svg>`; }
    return `<svg viewBox="0 0 24 24">${ICON[k] || ICON.star}</svg>`;
  };
  $('armyIco').innerHTML = ICON.army; $('coinIco').innerHTML = ICON.coin;
  $('homeBtn').innerHTML = svg('home') + 'HOME'; $('shopBtn2').innerHTML = svg('shop') + 'SHOP';
  $('tipHand').innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 11V4.5a1.5 1.5 0 013 0V10l5.2 1.1c1.2.3 1.9 1.4 1.7 2.6L18 20H9.5l-4-5.2c-.6-.8-.4-1.9.4-2.4.7-.5 1.7-.3 2.3.3z" fill="#fff" stroke="#0e1a33" stroke-width="1.2"/></svg>';

  // ---------- analytics (clean interface; no provider required) ----------
  const Analytics = KM.analytics = {
    q: [], sinks: [],
    track(name, props) { const e = { name, t: Date.now(), ...props }; this.q.push(e); if (this.q.length > 500) this.q.shift(); for (const s of this.sinks) try { s(e); } catch (x) { /* sink errors never break the game */ } if (DEBUG) console.log('[analytics]', name, props || ''); },
    addSink(fn) { this.sinks.push(fn); },
  };

  // ---------- save ----------
  let store; try { store = window.localStorage; store.setItem('kmob.t', '1'); } catch (e) { const m = {}; store = { getItem: k => m[k] || null, setItem: (k, v) => { m[k] = String(v); } }; }
  const save = KM.save = KM.loadSave(store);
  const persist = () => KM.writeSave(store, save);

  // ---------- systems ----------
  const canvas = $('c');
  let render;
  try { render = new KM.Render(canvas, { lowPower: /Android/i.test(navigator.userAgent) }); }
  catch (e) { document.body.innerHTML = '<div style="padding:40px;font:16px Nunito,sans-serif;color:#fff">This game needs WebGL. Please try a newer browser or device.</div>'; return; }
  render.setSkin(KM.SHOP.find(s => s.id === save.equip.skin) || KM.SHOP[3]);
  // quality tier: ?quality= forces, else the stored benchmark recommendation, else device heuristics
  KM.loadScripts = list => list.reduce((pr, src) => pr.then(() => new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = src; sc.onload = res; sc.onerror = () => rej(new Error(src)); document.head.appendChild(sc); })), Promise.resolve());
  let storedQ = null; try { storedQ = localStorage.getItem('kmob.quality'); } catch (e) { /* private mode */ }
  KM.bloomAllowed = Q.has('bloom') || storedQ === 'high';
  let quality = KM.detectQuality({ forced: Q.get('quality'), stored: Q.get('quality') ? null : storedQ, ua: navigator.userAgent, cores: navigator.hardwareConcurrency, touch: 'ontouchstart' in window, minSide: Math.min(screen.width, screen.height) });
  if (Q.get('quality') && KM.QUALITY[Q.get('quality')]) quality = Q.get('quality');
  render.applyQuality(quality);
  const assetBase = /^[\w-]+(\/[\w-]+)*\/$/.test(Q.get('assets') || '') ? Q.get('assets') : 'assets/';   // same-origin relative folders only
  KM.assetsReady = KM.loadCharacterAssets(render, assetBase);   // authored characters swap in when available
  const audio = new KM.Audio(); audio.setSound(save.settings.sound); audio.setMusic(save.settings.music);
  const sim = new KM.Sim({ seed: 1 });
  let combatHits = 0, combatLvl = 0, combatT = 0;
  let state = 'title', paused = false, runId = 0, tut = 0, lastResults = null, botOn = Q.has('bot');

  sim.on((type, a, b, c, d, e) => {
    render.onEvent(sim, type, a, b, c, d, e);
    switch (type) {
      case 'deploy': audio.play('deploy'); break;
      case 'hit': combatHits++; if (b >= 0 && sim.def(b).sh) audio.play('shieldhit'); else audio.play('hit'); break;
      case 'kill': audio.play('kill'); if (b.el) { KM.haptic(30); } Analytics.track && b.el && Analytics.track('enemy_type_death', { type: b.k, t: Math.floor(sim.t) }); break;
      case 'coin': audio.play('coin'); if (a >= 5) KM.haptic(8); if (tut === 1) setTip(2); break;
      case 'shot': if (a === 1) audio.play('cannon', 0, b / 9); else if (a === 0) audio.play('bow'); else if (a === 2) audio.play('frost'); break;
      case 'boom': audio.play('boom'); break;
      case 'shove': if ((e || 0) >= 2) audio.play('thud', 0, c / 10); break;
      case 'lhit': audio.play('lhit', 0, sim.L.x / 10); KM.haptic(15); break;
      case 'tower': audio.play(a.type === 'sniper' ? 'snipe' : 'tower', 0, a.x / 9); break;
      case 'offer': showOffer(a); audio.play('offer'); if (tut === 2) setTip(3); break;
      case 'upgrade': if (a.id.startsWith('build:') || a.id.startsWith('tup:')) audio.play('build', 0, a.id.startsWith('tup:') ? KM.TOWER_SLOTS[+a.id.slice(4)].x / 9 : 0); audio.play('upgrade'); KM.haptic(20); Analytics.track('upgrades_selected', { id: a.id, n: sim.upgrades, t: Math.floor(sim.t) }); break;
      case 'skip': Analytics.track('upgrade_skipped', { n: sim.upgrades }); break;
      case 'warn': banner(a === 'boss' ? 'A WARLORD APPROACHES' : 'MASSIVE PUSH INCOMING', 3.2); audio.play('warn'); KM.haptic(25); $('vig').classList.add('warn'); setTimeout(() => $('vig').classList.remove('warn'), 3200); break;
      case 'elite': audio.play('elite', 0, 0); break;
      case 'death': onDeath(); break;
      case 'towerDown': audio.play('boom', 0, a.x / 9); KM.haptic(30); banner('TOWER DESTROYED', 1.4); break;
      case 'wallDown': audio.play('cannon', 0, a.x / 9); break;
      case 'wall': audio.play('build'); break;
    }
  });

  // ---------- one-finger input: relative drag moves the launcher ----------
  let drag = null, moved = 0;
  const worldPerPx = () => 23 / Math.min(innerWidth, innerHeight * 1.1);
  canvas.addEventListener('pointerdown', e => { audio.unlock(); if (state !== 'run' || paused) return; drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* ok */ } });
  canvas.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const k = worldPerPx() * 1.15, dx = (e.clientX - drag.x) * k, dz = (e.clientY - drag.y) * k * 0.9;
    sim.moveBy(dx, dz); drag.x = e.clientX; drag.y = e.clientY; moved += Math.abs(dx) + Math.abs(dz);
    if (tut === 0 && moved > 4) setTip(1);
  });
  const up = e => { if (drag && e.pointerId === drag.id) drag = null; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  // keyboard fallback for desktop (still one control: move)
  const keys = {}; addEventListener('keydown', e => { keys[e.key] = 1; if (e.key === 'Escape' && state === 'run') setPause(!paused); if ((e.key === ' ' || e.key === 'Enter') && state === 'over') startRun(); if (state === 'run' && sim.offer && '123'.includes(e.key)) pickCard(+e.key - 1); });
  addEventListener('keyup', e => { keys[e.key] = 0; });

  // ---------- HUD + prompts ----------
  const tips = [['DRAG TO MOVE', 'SOLDIERS DEPLOY AUTOMATICALLY'], ['MOVE OVER COINS', 'GET CLOSE TO THE FIGHT TO GRAB THEM'], ['GROW YOUR ARMY', 'TAP AN UPGRADE. THE FIGHT KEEPS GOING'], null];
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
    $('hTime').textContent = KM.fmtTime(sim.t); $('hArmy').textContent = sim.count[0]; $('hCoins').textContent = KM.fmtNum(sim.coins);
    const cost = KM.upgradeCost(sim.upgrades); $('hNext').textContent = sim.offer ? 'UPGRADE!' : 'NEXT ' + cost;
    const hp = sim.L.hp / sim.stats.maxHp; $('hpFill').style.width = (hp * 100).toFixed(1) + '%'; $('hpFill').style.background = hp > 0.5 ? 'linear-gradient(90deg,#4cff8a,#2fbf4f)' : hp > 0.25 ? 'linear-gradient(90deg,#ffe14a,#ff9a1f)' : 'linear-gradient(90deg,#ff6a4a,#d6281f)';
    $('vig').style.boxShadow = `inset 0 0 120px ${20 + 40 * (1 - hp)}px rgba(220,20,20,${hp < 0.35 ? (0.55 - hp) * (0.8 + 0.2 * Math.sin(performance.now() / 150)) : 0})`;
  }

  // ---------- upgrade offer (combat keeps going in slow-motion) ----------
  function showOffer(list) {
    const el = $('offer'); el.innerHTML = '';
    list.forEach((o, i) => { const d = document.createElement('div'); d.className = 'card ' + o.color; d.innerHTML = svg(o.icon) + `<div class="t">${o.title}</div><div class="n">${o.val}</div>`; d.addEventListener('pointerdown', e => { e.stopPropagation(); pickCard(i); }); el.appendChild(d); });
    const c = $('offerCost'); c.innerHTML = `COST ${KM.upgradeCost(sim.upgrades)} <u id="skipBtn">SKIP</u>`; c.classList.remove('hidden');
    requestAnimationFrame(() => { const r = el.getBoundingClientRect(); c.style.top = (r.bottom + 6) + 'px'; });
    $('skipBtn').onpointerdown = e => { e.stopPropagation(); sim.skipOffer(); hideOffer(); };
  }
  function hideOffer() { $('offer').innerHTML = ''; $('offerCost').classList.add('hidden'); }
  function pickCard(i) { if (sim.pick(i)) { hideOffer(); audio.play('tap'); } }

  // ---------- flow ----------
  function show(id) { for (const s of ['title', 'over', 'pause', 'shop', 'settings']) $(s).classList.toggle('hidden', s !== id); }
  function startRun() {
    audio.unlock(); runId++;
    const comp = !!save.settings.competitive;
    sim.reset({ seed: (Date.now() ^ (runId * 2654435761)) >>> 0, perm: comp ? null : save.perm });
    render.resetRun(); render.setSkin(KM.SHOP.find(s => s.id === save.equip.skin) || KM.SHOP[3]); hideOffer();
    state = 'run'; paused = false; show(null);
    $('hud').classList.remove('hidden'); $('hpbar').classList.remove('hidden');
    moved = 0; setTip(save.ach.tutorial ? 4 : 0);
    if (save.ach.tutorial) { tut = 4; banner('SURVIVE!', 1.2); }
    Analytics.track('run_start', { run: save.totals.runs + 1, competitive: comp });
    PT.picks = []; PT.runNo++; const old = $('ptBox'); if (old) old.remove();
  }
  function onDeath() {
    audio.play('death'); audio.crowd(0, 0); KM.haptic([40, 60, 80]); hideOffer();
    const r = lastResults = sim.results();
    const { pb } = KM.recordRun(save, r); persist();
    Analytics.track('run_end', { survival_time: Math.floor(r.time), death_reason: r.reason, peak_army_size: r.peakArmy, currency_collected: r.coins, kills: r.kills, upgrades: r.upgrades, player_death_position: { x: +sim.L.x.toFixed(1), offZ: +sim.L.offZ.toFixed(1) }, revive_used: !!sim.revived });
    if (pb) Analytics.track('personal_best', { t: Math.floor(r.time) });
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
      $('reviveBtn').classList.toggle('hidden', !!sim.revived || !!save.settings.competitive || !Q.has('revive'));
      show('over'); showPlaytest(r);
    }, 1300);
  }
  function setPause(p) { if (state !== 'run') return; paused = p; show(p ? 'pause' : null); audio.suspend(p); if (p) { buildToggles($('pToggles')); audio.crowd(0, 0); } }
  function goTitle() {
    state = 'title'; $('hud').classList.add('hidden'); $('hpbar').classList.add('hidden'); $('tip').classList.add('hidden'); hideOffer();
    const b = save.settings.competitive ? save.best.comp : save.best.all;
    $('titleBest').innerHTML = `<span>BEST<b>${KM.fmtTime(b)}</b></span><span>TODAY<b>${KM.fmtTime(save.best.daily.d === KM.dayKey(new Date()) ? save.best.daily.t : 0)}</b></span><span class="tok">${ICON.token ? `<svg viewBox="0 0 24 24">${ICON.token}</svg>` : ''}${save.tokens}</span>`;
    show('title');
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

  $('playBtn').onclick = () => startRun();
  $('againBtn').onclick = () => { ptLeave(true); startRun(); };
  $('homeBtn').onclick = () => { ptLeave(false); goTitle(); };
  $('shopBtn1').onclick = () => openShop(goTitle);
  $('shopBtn2').onclick = () => openShop(() => show('over'));
  $('setBtn1').onclick = () => { buildToggles($('sToggles')); show('settings'); };
  $('setClose').onclick = () => goTitle();
  $('pauseBtn').onclick = () => setPause(true);
  $('resumeBtn').onclick = () => setPause(false);
  $('quitBtn').onclick = () => { paused = false; show(null); audio.suspend(false); sim.hurtLauncher(1e9, 'quit'); };
  $('reviveBtn').onclick = () => { if (sim.revive()) { state = 'run'; show(null); Analytics.track('revive_used', {}); } };
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (state === 'run' && !paused) setPause(true); audio.suspend(true); } else if (!paused) audio.suspend(false); });
  addEventListener('resize', () => render.resize());
  // WebGL context loss (iOS backgrounding, GPU resets): stop drawing, keep the run paused, resume when restored
  let glLost = false;
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); glLost = true; if (state === 'run' && !paused) setPause(true); Analytics.track('webgl_context_lost', {}); }, false);
  canvas.addEventListener('webglcontextrestored', () => { glLost = false; render.resize(); Analytics.track('webgl_context_restored', {}); }, false);

  // ---------- debug tools (?debug=1): jump time, stress, bot ----------
  if (DEBUG) {
    const d = document.createElement('div'); d.id = 'dbg';
    d.innerHTML = 'JUMP: ' + [1, 5, 10, 30, 60, 120].map(m => `<button data-m="${m}">${m}m</button>`).join('') + '<br>STRESS: ' + [500, 1000, 2000].map(n => `<button data-s="${n}">${n}</button>`).join('') + '<br><button id="dBot">bot</button><button id="dGod">god</button><button id="dCoins">+500c</button><div id="dInfo"></div>';
    document.body.appendChild(d); $('fps').classList.remove('hidden');
    d.querySelectorAll('[data-m]').forEach(b => b.onclick = () => jumpTo(+b.dataset.m));
    d.querySelectorAll('[data-s]').forEach(b => b.onclick = () => stress(+b.dataset.s));
    $('dBot').onclick = () => { botOn = !botOn; }; $('dGod').onclick = () => { sim.L.inv = 1e9; }; $('dCoins').onclick = () => { sim.coins += 500; };
  }
  // Fast-forward difficulty to minute m with a comparable build, so late-game balance can be checked in seconds.
  function jumpTo(m) {
    if (state !== 'run') startRun();
    sim.t = m * 60; sim.nextPush = sim.t + 10; sim.nextBoss = Math.max(sim.t + 20, KM.TUNE.bossFrom * 60);
    const n = Math.round(m * 2.6); for (let k = 0; k < n; k++) { sim.coins += KM.upgradeCost(sim.upgrades); sim.offer = KM.makeOffer(sim, sim.rng); sim.pick(0); }
    sim.coins = 0; sim.offer = null; hideOffer(); banner('MINUTE ' + m, 1.2);
  }
  function stress(n) { // spawn n units split between both armies, ignoring caps
    const D = KM.difficulty(sim.t);
    for (let k = 0; k < n / 2; k++) { const gx = (Math.random() - 0.5) * 17, arcF = Math.cos(gx * 0.25) * 4; sim.spawn(0, KM.FRIEND[0], gx, sim.front - 4 - Math.random() * 18 - arcF * Math.random(), { hp: sim.stats.hp, dmg: sim.stats.dmg, spd: 1 }); sim.spawn(1, KM.ENEMY[k % 5 === 0 ? 2 : k % 7 === 0 ? 4 : 0], (Math.random() - 0.5) * 17, sim.front - 26 - Math.random() * 26 - (Math.random() < 0.3 ? 12 : 0) - Math.abs(Math.sin(k)) * 6, { hp: D.hp, dmg: D.dmg, spd: D.speed }); }
    sim.stats.cap = Math.max(sim.stats.cap, sim.count[0]);
  }

  // ---------- adaptive quality: sustained low fps steps the tier down (high → medium → low), never up mid-session ----------
  let fpsAcc = 0, fpsN = 0, slow = 0, pendingQ = null;
  function adapt(dt) {
    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 1) {
      const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; const ri = render.R.info.render;
      if (DEBUG) { $('fps').textContent = `${fps.toFixed(0)} fps · ${render.quality} · units ${sim.count[0] + sim.count[1]} · tris ${(ri.triangles / 1000).toFixed(0)}k · calls ${ri.calls} · js ${jsCost.toFixed(1)}ms`; $('dInfo').textContent = `t=${sim.t.toFixed(0)} hp×${sim.diff.hp.toFixed(2)} spawn ${sim.diff.spawnRate.toFixed(1)}/s era ${sim.diff.era}`; }
      KM.perf = { fps, units: sim.count[0] + sim.count[1], drawn: render.drawn, dpr: render.R.getPixelRatio(), quality: render.quality, tris: ri.triangles, calls: ri.calls, jsMs: jsCost };
      if (bench.qAfter && --bench.qAfter.wait <= 0) { bench.qAfter.fpsAfter = Math.round(fps * 10) / 10; bench.qAfter = null; }
      if (state === 'run' && !paused && !Q.has('fixed') && !Q.get('quality')) { slow = fps < 45 ? slow + 1 : Math.max(0, slow - 1); if (slow >= 4 && render.quality !== 'low') { slow = 0; pendingQ = KM.nextLowerQuality(render.quality); Analytics.track('quality_down', { to: pendingQ, fps: Math.round(fps) });
        // the benchmark keeps the same adaptive behaviour as real play, but every step-down is logged so it cannot hide poor performance
        if (bench.on && bench.ti >= 0) { const c = { from: render.quality.toUpperCase(), to: pendingQ.toUpperCase(), stage: bench.tiers[bench.ti][0], units: sim.count[0] + sim.count[1], fpsBefore: Math.round(fps * 10) / 10, fpsAfter: null, atSec: Math.round(bench.el * 10) / 10, reason: 'fps < 45 for 4 consecutive seconds' }; bench.qlog.push(c); bench.qAfter = Object.assign(c, { wait: 2 }); } } }
    }
  }
  let jsCost = 0, rawMs = 16.7;

  // ---------- main loop (fixed-step sim, interpolated render) ----------
  let lastT = performance.now(), acc = 0; const STEP = 1 / 60;
  function loop(now) {
    requestAnimationFrame(loop);
    // quality changes are applied before drawing so a resize never presents a cleared (black) canvas
    if (pendingQ) { render.applyQuality(pendingQ); pendingQ = null; }
    const js0 = performance.now();
    rawMs = now - lastT; let dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    if (state === 'run' && !paused) {
      if (keys.ArrowLeft || keys.a) sim.moveBy(-dt * 14, 0); if (keys.ArrowRight || keys.d) sim.moveBy(dt * 14, 0);
      if (keys.ArrowUp || keys.w) sim.moveBy(0, -dt * 10); if (keys.ArrowDown || keys.s) sim.moveBy(0, dt * 10);
      const scale = sim.offer ? 0.35 : 1;
      acc += dt * scale; let n = 0;
      while (acc >= STEP && n < 4) { if (botOn) KM.bot(sim, STEP, 1); sim.step(STEP); acc -= STEP; n++; }
      if (n === 4) acc = 0;
      hud(dt);
      combatT += dt; if (combatT > 0.5) { combatLvl += (Math.min(1, combatHits / combatT / 40) - combatLvl) * 0.5; combatHits = 0; combatT = 0; audio.crowd(combatLvl, sim.count[0] / 150); }
      audio.tick(Math.min(1, (sim.count[1] / 300) * 0.6 + sim.danger * 0.4 + (sim.diff.m / 30) * 0.3), true);
    } else if (state !== 'run') { sim.step(dt * 0.5); } // keep the battlefield alive behind menus
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').classList.remove('on'); }
    if (!paused && !glLost) { render.frame(sim, state === 'run' ? dt * (sim.offer ? 0.6 : 1) : dt); }
    jsCost += ((performance.now() - js0) - jsCost) * 0.1;   // JS cost: sim + scene update + draw submission (GPU time excluded)
    adapt(dt); benchTick(dt);
  }
  // attract mode behind the title: the bot plays a demo battle
  sim.reset({ seed: 7 }); for (let k = 0; k < 900; k++) { KM.bot(sim, STEP, 0.6); sim.step(STEP); }
  const attract = () => { if (state !== 'run' && sim.alive) KM.bot(sim, STEP, 0.6); if (state !== 'run' && !sim.alive) { sim.reset({ seed: 7 + Math.floor(Math.random() * 99) }); render.resetRun(); } };
  setInterval(attract, 50);
  // Debug: force a build for screenshots (tower level 1-5 for all six slots, launcher level 1-5).
  function showcase(towerLv, launcherLv) {
    if (state !== 'run') startRun();
    sim.t = Math.max(sim.t, 9 * 60); const types = Object.keys(KM.TOWERS);
    for (let s = 0; s < 6; s++) sim.towers[s] = towerLv ? { type: types[s], lvl: towerLv, cd: 0.5, aim: Math.PI, recoil: 0, slot: s, x: 0, z: 0, tgt: -1, born: 0 } : null;
    sim.upgrades = Math.max(0, ((launcherLv || 1) - 1) * 4);
  }
  KM.game = { sim, render, audio, startRun, jumpTo, stress, showcase, get glLost() { return glLost; }, setPause, get state() { return state; }, save, persist };
  // ---------- on-device benchmark (?bench=1): tiers of crowd size, FPS / frame-time spread / heap ----------
  // ---------- on-device benchmark (?bench=1): four crowd stages → numbers + recommended quality ----------
  const bench = { on: Q.has('bench'), tiers: [['EARLY', 100], ['MEDIUM', 400], ['HEAVY', 900], ['EXTREME', 1600]], ti: -1, t: 0, ft: [], js: [], tri: 0, calls: 0, out: [], qlog: [], qAfter: null, el: 0, startQ: null, secs: Math.max(1, Math.min(30, +(Q.get('benchSecs') || 15))) };
  if (bench.on && !Q.get('quality')) { quality = 'high'; render.applyQuality('high'); }   // measure the heaviest tier; the recommendation steps down from it
  function benchTick(dt) {
    if (!bench.on || state !== 'run') return;
    if (!bench.startQ) bench.startQ = render.quality; bench.el += dt;
    bench.t += dt; if (bench.ti >= 0 && bench.t > bench.secs * 0.2) { bench.ft.push(rawMs); bench.js.push(jsCost); const ri = render.R.info.render; bench.tri = Math.max(bench.tri, ri.triangles); bench.calls = Math.max(bench.calls, ri.calls); }
    if (bench.ti < 0 || bench.t > bench.secs) {
      if (bench.ti >= 0) bench.out.push(Object.assign(KM.benchStage(bench.tiers[bench.ti][0], sim.count[0] + sim.count[1], bench.ft, bench.js, bench.tri, bench.calls, performance.memory ? performance.memory.usedJSHeapSize : null), { quality: render.quality.toUpperCase() }));
      bench.ti++; bench.t = 0; bench.ft = []; bench.js = []; bench.tri = 0; bench.calls = 0;
      if (bench.ti >= bench.tiers.length) { bench.on = false; showBench(); return; }
      sim.L.inv = 1e9; sim.budget = 0; const want = bench.tiers[bench.ti][1], have = sim.count[0] + sim.count[1]; if (want > have) stress(want - have);
      banner('TESTING ' + bench.tiers[bench.ti][1] + ' UNITS · ' + (bench.ti + 1) + '/4', 2);
    }
    sim.L.inv = 1e9; const want = bench.tiers[bench.ti][1], have = sim.count[0] + sim.count[1]; if (have < want * 0.85) stress(Math.min(200, want - have));
  }
  function showBench() {
    const gl = render.R.getContext(), gpu = (() => { try { const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a'; } catch (x) { return 'n/a'; } })();
    const info = { ua: navigator.userAgent, gpu, screen: screen.width + 'x' + screen.height, viewport: innerWidth + 'x' + innerHeight, render: gl.drawingBufferWidth + 'x' + gl.drawingBufferHeight, dpr: +render.R.getPixelRatio().toFixed(2), deviceDpr: devicePixelRatio, quality: render.quality, bloom: !!render.bloomOn, cores: navigator.hardwareConcurrency || null };
    const rec = KM.benchRecommend(bench.out, bench.qlog); try { localStorage.setItem('kmob.quality', rec); } catch (e) { /* ignore */ }
    for (const c of bench.qlog) delete c.wait;
    const result = { kmob: 'bench', version: 3, when: new Date().toISOString(), info, recommended: rec.toUpperCase(), startQuality: (bench.startQ || render.quality).toUpperCase(), finalQuality: render.quality.toUpperCase(), qualityChanges: bench.qlog, results: bench.out };
    const txt = JSON.stringify(result, null, 1); KM.benchResult = result; console.log(txt);
    const row = r => `<div><span>${r.units} units · ${r.quality}</span><b>${r.fps} fps</b></div><div style="font-size:12px;opacity:.8;display:block">avg ${r.avgMs} ms · 1% low ${r.low1} fps · worst ${r.worstMs} ms · ${Math.round(r.tris / 1000)}k tris · ${r.calls} calls · JS ${r.jsMs} ms${r.heapMB ? ' · ' + r.heapMB + ' MB' : ''}</div>`;
    const d = document.createElement('div'); d.className = 'screen'; d.id = 'benchScreen';
    d.innerHTML = `<div class="panel"><h2 class="disp" style="margin:0;text-align:center;font-size:30px">TEST COMPLETE</h2>
      <div style="text-align:center;margin:6px 0 10px;font-weight:900">Recommended quality: <span class="disp" style="color:var(--gold);font-size:22px">${rec.toUpperCase()}</span></div>
      <button class="btn" id="benchCopy" style="font-size:30px;padding:18px">COPY RESULTS</button>
      <div style="text-align:center;font-size:12px;opacity:.8;margin:8px 0">Then paste them back into the chat. That's all.</div>
      ${bench.qlog.length ? `<div style="background:#5a1d1d;border-radius:10px;padding:8px;margin:6px 0;font-size:12px;font-weight:800">⚠ Quality dropped automatically during the test (${result.startQuality} → ${result.finalQuality}). Stages after the drop were measured at the lower tier.<br>${bench.qlog.map(c => `${c.stage} · ${c.units} units · ${c.from}→${c.to} · ${c.fpsBefore} → ${c.fpsAfter == null ? '?' : c.fpsAfter} fps · ${c.reason}`).join('<br>')}</div>` : `<div style="font-size:12px;opacity:.8;text-align:center">Quality stayed ${result.startQuality} for the whole test.</div>`}
      <div class="stats">${bench.out.map(row).join('')}</div>
      <div style="font-size:11px;opacity:.7">${info.render} @ ${info.dpr}x · ${info.quality} · ${gpu}</div>
      <textarea id="benchTxt" style="width:100%;height:70px;font:10px monospace;margin-top:8px" readonly>${txt}</textarea></div>`;
    document.body.appendChild(d);
    const copy = () => { const ta = d.querySelector('#benchTxt'); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ } try { navigator.clipboard.writeText(txt).then(() => { d.querySelector('#benchCopy').textContent = 'COPIED ✓'; }); } catch (e) { /* ignore */ } if (ok) d.querySelector('#benchCopy').textContent = 'COPIED ✓'; };
    d.querySelector('#benchCopy').onclick = copy;
    state = 'bench-done'; Analytics.track('bench', result);
  }
  // ---------- ?playtest=1: per-run summary + three yes/no questions + COPY PLAYTEST ----------
  const PT = { on: Q.has('playtest'), picks: [], runNo: 0, cur: null, log: [] };
  // the real retention signal: did the player actually press TRY AGAIN, and how long after the death screen appeared
  function ptLeave(retried) { const c = PT.cur; if (!PT.on || !c || c.retried != null) return; c.retried = retried; c.secs = Math.round((performance.now() - c.at) / 100) / 10; PT.log.push({ run: c.run, retried, secs: c.secs });
    try { localStorage.setItem('kmob.playtestLog', JSON.stringify(PT.log.slice(-50))); } catch (e) { /* ignore */ } KM.playtestRetries = PT.log; }
  KM.ptLeave = ptLeave;
  sim.on((t, a) => { if (t === 'upgrade' && PT.on) PT.picks.push(a.title + (a.val ? ' ' + a.val : '')); });
  function showPlaytest(r) {
    if (!PT.on) return; PT.cur = { run: PT.runNo, at: performance.now(), retried: null }; const ans = {}; const box = document.createElement('div'); box.id = 'ptBox'; box.className = 'stats'; box.style.marginTop = '10px';
    const q = (k, label) => `<div style="display:flex;gap:6px;align-items:center"><span style="flex:1;font-size:13px">${label}</span><button class="btn sec pt" data-k="${k}" data-v="1" style="width:auto;font-size:14px;padding:6px 12px">YES</button><button class="btn sec pt" data-k="${k}" data-v="0" style="width:auto;font-size:14px;padding:6px 12px">NO</button></div>`;
    const prev = PT.log[PT.log.length - 1];
    box.innerHTML = `<div style="font-weight:900;font-size:13px;display:block">PLAYTEST · run ${PT.runNo} · ${PT.picks.length} upgrades</div>` + (prev ? `<div style="font-size:12px;opacity:.85;display:block">Run ${prev.run}: TRY AGAIN ${prev.retried ? 'pressed after ' + prev.secs + ' s' : 'not pressed (left after ' + prev.secs + ' s)'}</div>` : '') + q('easy', 'Was it easy to understand?') + q('fair', 'Did the death feel fair?') + q('again', 'Would you play again immediately?') + `<button class="btn" id="ptCopy" style="margin-top:8px;font-size:20px">COPY PLAYTEST</button>`;
    $('oStats').after(box);
    box.querySelectorAll('.pt').forEach(b => b.onclick = () => { ans[b.dataset.k] = b.dataset.v === '1'; box.querySelectorAll(`.pt[data-k="${b.dataset.k}"]`).forEach(x => x.style.outline = x === b ? '3px solid #7dff6a' : 'none'); });
    box.querySelector('#ptCopy').onclick = () => { const rep = KM.playtestReport({ ...r, picks: PT.picks }, ans, { runNo: PT.runNo, ua: navigator.userAgent, retry: PT.cur, history: PT.log }); KM.lastPlaytest = rep; const t = rep.text + '\n' + JSON.stringify(rep); try { navigator.clipboard.writeText(t); } catch (e) { /* ignore */ } const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) { /* ignore */ } ta.remove(); box.querySelector('#ptCopy').textContent = 'COPIED ✓'; };
  }
  if (Q.has('autoplay') || bench.on) startRun(); else goTitle();
  requestAnimationFrame(loop);
})();
