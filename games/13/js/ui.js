/* UI: boot → Lantern HQ → cinematic → play. HUD, panels, keypad, input (keyboard/mouse + touch). */
(function () {
  const U = T13.ui = {}, $ = id => document.getElementById(id), G = T13.game, A = T13.audio;
  const touch = matchMedia('(pointer: coarse)').matches; if (touch) document.body.classList.add('touch');
  let paused = false, subT = 0, toastT = 0;
  U.paused = () => paused;

  /* ---------- HUD ---------- */
  U.hud = on => { $('hud').classList.toggle('hidden', !on); if (!on && document.pointerLockElement) document.exitPointerLock(); };
  U.obj = t => { $('obj').textContent = t || ''; };
  U.sub = (text, who, css = '#ddd', ms = 4200) => { const el = $('sub'); el.innerHTML = `${who ? `<b style="color:${css}">${who}</b> — ` : ''}${text.replace(/</g, '&lt;')}`; el.style.opacity = 1; clearTimeout(subT); subT = setTimeout(() => { el.style.opacity = 0; }, ms); };
  U.toast = t => { const el = $('ability-cd'); el.dataset.toast = t; clearTimeout(toastT); toastT = setTimeout(() => { el.dataset.toast = ''; }, 1600); };
  U.prompt = t => { const el = $('prompt'); el.textContent = t ? (touch ? '✋ ' : 'E · ') + t : ''; el.classList.toggle('on', !!t); };
  U.team = (list, active) => { $('team').innerHTML = list.map((b, i) => `<button class="tm${i === active ? ' on' : ''}" data-sw="${i}" style="color:${b.css}">${b.name}<small>${b.power}${b.cd ? ' · ' + b.cd + 's' : ' · ready'}</small></button>`).join(''); };
  U.fear = (k, state, hidden, battery, stamina) => { $('fearbar').firstElementChild.style.width = Math.round(k * 100) + '%'; const el = $('ability-cd'); el.textContent = el.dataset.toast || `${state.toLowerCase()} · 🔦 ${Math.round(battery)}% · stamina ${Math.round(stamina * 100)}%`;
    $('vignette').style.background = hidden ? 'linear-gradient(#000 0 34%,#0000 34% 66%,#000 66%)' : `radial-gradient(ellipse at center,#0000 ${45 - k * 20}%,#000${k > 0.7 ? 'e' : 'c'} 100%)`; };
  U.flash = (o = 0.5) => { const el = $('flash'); el.style.transition = 'none'; el.style.opacity = o; requestAnimationFrame(() => { el.style.transition = 'opacity .6s'; el.style.opacity = 0; }); };
  U.over = (title, text, kind) => { $('overT').textContent = title; $('overP').textContent = text; $('overBtn').textContent = kind === 'complete' ? 'Play again' : 'Try again (checkpoint)'; $('overBtn').dataset.kind = kind || 'dead'; $('over').classList.remove('hidden'); };
  $('overBtn').onclick = () => { $('over').classList.add('hidden'); if ($('overBtn').dataset.kind === 'complete') G.start(false); else G.start(true); lock(); };
  $('overHQ').onclick = () => { $('over').classList.add('hidden'); showHQ(); };

  /* ---------- keypad ---------- */
  let code = '';
  const kpShow = () => { $('kpShow').textContent = (code + '___').slice(0, 3).split('').join(' '); };
  $('keypad').querySelector('.kpgrid').innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9, '⌫', 0, '↵'].map(k => `<button data-kp="${k}">${k}</button>`).join('');
  $('keypad').addEventListener('click', e => { const k = e.target.dataset.kp; if (e.target.classList.contains('pclose')) { U.keypad(false); G.closeKeypad(); return; } if (k === undefined) return;
    if (k === '⌫') code = code.slice(0, -1); else if (k === '↵') { if (!G.tryCode(code)) { $('kpMsg').textContent = 'Wrong code. Something heard that.'; code = ''; } } else if (code.length < 3) code += k; kpShow(); });
  U.keypad = on => { code = ''; kpShow(); $('kpMsg').textContent = 'Three digits.'; $('keypad').classList.toggle('hidden', !on); if (on && document.pointerLockElement) document.exitPointerLock(); if (!on) lock(); };

  /* ---------- cinematic: first N seconds mandatory, then SKIP ---------- */
  U.cinematic = (lines, { mandatory = 6, who = '' } = {}, done) => {
    const el = $('cine'), tx = $('cineText'), sk = $('cineSkip'); el.classList.remove('hidden'); $('cineWho').textContent = who; sk.classList.add('hidden');
    let i = 0, t0 = performance.now(), timer = null, fin = false;
    const finish = () => { if (fin) return; fin = true; clearTimeout(timer); clearInterval(gate); el.classList.add('hidden'); done && done(); };
    const show = () => { if (i >= lines.length) return finish(); const [w, t] = lines[i]; tx.classList.remove('on'); setTimeout(() => { tx.innerHTML = (w ? `<em>${w}</em>` : '') + t.replace(/\n/g, '<br>'); tx.classList.add('on'); }, 300); timer = setTimeout(() => { i++; show(); }, Math.max(3200, t.length * 55)); };
    const gate = setInterval(() => { if (performance.now() - t0 > mandatory * 1000) { sk.classList.remove('hidden'); clearInterval(gate); } }, 250);
    sk.onclick = finish; show();
  };

  /* ---------- HQ ---------- */
  const PHOTO = s => s?.prologueDone ? 'A new photo is pinned to the board: the Ashgrove exit door, a lantern scratched into the paint.' : 'Five people in an old photograph. Two of the faces have been scratched out. Nobody here remembers doing it.';
  function showHQ() {
    G.stop(); $('hq').classList.remove('hidden'); const sv = G.save(); $('hqphoto').textContent = PHOTO(sv); $('hqbuild').textContent = T13.BUILD + ' · gray-box prototype';
    $('hq').querySelector('.board b').textContent = sv?.checkpoint ? 'CONTINUE' : sv?.prologueDone ? 'REPLAY PROLOGUE' : 'NEW GAME';
  }
  const panel = html => { $('pbody').innerHTML = html; $('panel').classList.remove('hidden'); };
  $('panel').addEventListener('click', e => { if (e.target.classList.contains('pclose') || e.target.id === 'panel') $('panel').classList.add('hidden'); });
  const SIBS = T13.SIBLINGS;
  const PANELS = {
    cases: () => `<h2>CASES · SEASON ONE</h2><p>Thirteen cases. The prologue is playable now; each real-location case opens only after its history and paranormal reports have been verified with sources.</p>
      <div class="case"><b>0</b><div><div>Prologue — The Ashgrove Wing</div><small class="tag">FICTIONAL</small><small class="tag">PLAYABLE</small></div></div>
      ${T13.CASES.map(c => `<div class="case"><b>${c.number}</b><div class="locked">${c.title} — ${c.note}</div></div>`).join('')}`,
    characters: () => `<h2>THE FILES</h2><div class="chars">${SIBS.map(b => `<div><b style="color:${b.css}">${b.name.toUpperCase()}</b> · ${b.domain}<p><b>${b.power}.</b> ${b.powerHow}</p></div>`).join('')}</div>
      <h3>Controls</h3><p>${touch ? 'Left thumb moves. Drag the right side to look. ✋ interact · RUN · ⤓ crouch · 🔦 light · ✦ power · ⇄ switch sibling.' : 'WASD move · mouse look · E interact · Shift run · C crouch · F flashlight · Q power · Tab or 1-2-3 switch sibling · Esc pause.'}</p>`,
    loadout: () => `<h2>EQUIPMENT TABLE</h2><p>Flashlight (battery drains while on, recharges while off). Everything else is found in the field.</p><p class="tag">MORE GEAR ARRIVES WITH CASE I</p>`,
    dossiers: () => `<h2>LANTERN DOSSIER · PROLOGUE</h2>
      <h3>Historical record</h3><p>None. The Ashgrove wing is a fictional location created for this prologue. It depicts no real place or real tragedy.</p>
      <h3>Paranormal reports</h3><p>None — fictional.</p><h3>Sources</h3><p>Real cases will carry full citations here.</p>
      <h3>Evidence found</h3><p>${G.save()?.prologueDone ? 'The fuse, the nurse’s count (4-1-3), a lantern scratched into the exit door.' : 'Nothing yet.'}</p>
      <h3>Lantern notes</h3><p>“It copies voices.” — written where only Daniel could see it.</p><h3>Fictional interpretation</h3><p>The Hollow. It cannot create — only counterfeit.</p>`,
    theater: () => { const f = G.save()?.films || []; const row = (id, t) => `<div class="case"><b>${f.includes(id) ? '▶' : '🔒'}</b><div class="${f.includes(id) ? '' : 'locked'}">${f.includes(id) ? t : '— locked —'}</div></div>`;
      return `<h2>THEATER</h2><p><span class="tag">CASE FILMS</span><span class="tag">FAMILY STORY</span><span class="tag">WATCH SEASON</span><span class="tag">COMPLETE CUT</span></p>${row('case-0', 'Case film · Prologue: The Ashgrove Wing')}${row('family-1', 'Family film 1 · Day Zero')}${Array.from({ length: 12 }, (_, i) => row('case-' + (i + 1), '')).join('')}<p><small>27 films in Season One. Locked films show no spoilers.</small></p>`; },
    lore: () => `<h2>JOURNAL</h2><p>Lantern investigates places where something is still listening. Our parents started it. Now it’s the three of us.</p><p><i>The rest of this journal is blank. For now.</i></p>`,
    settings: () => `<h2>SETTINGS</h2><p><button class="ghost" id="wipe">Erase local progress</button></p><p><small>Progress is saved on this device for the prototype. Cloud save with a KEEPITIL account comes with the Case I build.</small></p><p><small>${T13.BUILD}</small></p>`,
  };
  $('hq').addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (!b) return; A.init(); const go = b.dataset.go;
    if (go === 'continue') { const sv = G.save(); $('hq').classList.add('hidden'); if (sv?.checkpoint) { G.start(true); lock(); return; }
      U.cinematic(T13.PROLOGUE.film.lines, { mandatory: T13.PROLOGUE.film.mandatorySeconds, who: 'CASE FILM · PROLOGUE' }, () => { G.start(false); lock(); }); return; }
    panel(PANELS[go]()); if (go === 'settings') $('wipe').onclick = () => { try { localStorage.removeItem('t13-save'); } catch (err) {} $('panel').classList.add('hidden'); showHQ(); }; });

  /* ---------- boot ---------- */
  function boot() {
    const steps = [['bt1', 0, 2300], ['bt2', 2600, 4900], ['bt3', 5200, 8200]];
    $('tapstart').classList.add('hidden');
    steps.forEach(([id, on, off]) => { setTimeout(() => $(id).classList.add('on'), on); setTimeout(() => $(id).classList.remove('on'), off); });
    // the short environmental scare before HQ
    setTimeout(() => { A.whisper(2, 1.6, -1); }, 6400);
    setTimeout(() => { U.flash(0.35); A.sting(); }, 8000);
    setTimeout(() => { $('boot').classList.add('hidden'); showHQ(); }, 8700);
  }
  $('tapstart').onclick = () => { A.init(); boot(); };
  $('boot').addEventListener('dblclick', () => { $('boot').classList.add('hidden'); showHQ(); });

  /* ---------- input: keyboard + mouse ---------- */
  const canvas = $('view'), keys = {};
  const lock = () => { if (!touch && canvas.requestPointerLock) try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {} };
  canvas.addEventListener('click', () => { if (G.isRunning() && !paused) lock(); });
  document.addEventListener('mousemove', e => { if (document.pointerLockElement === canvas) { G.input.dx += e.movementX; G.input.dy += e.movementY; } });
  const axes = () => { G.input.mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0); G.input.mz = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0); G.input.run = !!(keys.ShiftLeft || keys.ShiftRight); };
  addEventListener('keydown', e => { if (!G.isRunning()) return; if (e.code === 'Tab') e.preventDefault(); if (e.repeat) return; keys[e.code] = true; axes();
    const m = { KeyE: 'interact', KeyF: 'light', KeyQ: 'ability', Tab: 'switch', Digit1: 'switch1', Digit2: 'switch2', Digit3: 'switch3', KeyC: 'crouch' }[e.code]; if (m) G.act(m);
    if (e.code === 'Escape' || e.code === 'KeyP') togglePause(); });
  addEventListener('keyup', e => { keys[e.code] = false; axes(); });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; axes(); });
  document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && G.isRunning() && !paused && $('keypad').classList.contains('hidden') && !touch) togglePause(true); });
  function togglePause(force) { paused = force === true ? true : !paused; if (paused) { panel(`<h2>PAUSED</h2><p>${touch ? '' : 'Click the game to look around again.'}</p><p><button class="big" id="resume">Resume</button> <button class="ghost" id="toHQ">Lantern HQ</button></p>`); $('resume').onclick = () => { paused = false; $('panel').classList.add('hidden'); lock(); }; $('toHQ').onclick = () => { paused = false; $('panel').classList.add('hidden'); showHQ(); }; } else { $('panel').classList.add('hidden'); lock(); } }
  $('pauseBtn').onclick = () => togglePause();
  $('team').addEventListener('click', e => { const b = e.target.closest('[data-sw]'); if (b) G.act('switch' + (+b.dataset.sw + 1)); });

  /* ---------- input: touch (left stick, right look, buttons) ---------- */
  const stick = $('stick'), knob = stick.firstElementChild; let sid = null, sx = 0, sy = 0, lid = null, lx = 0, ly = 0;
  stick.addEventListener('pointerdown', e => { sid = e.pointerId; const r = stick.getBoundingClientRect(); sx = r.left + r.width / 2; sy = r.top + r.height / 2; stick.setPointerCapture(sid); e.preventDefault(); });
  stick.addEventListener('pointermove', e => { if (e.pointerId !== sid) return; let dx = e.clientX - sx, dy = e.clientY - sy; const m = Math.hypot(dx, dy), R = 55; if (m > R) { dx *= R / m; dy *= R / m; } knob.style.transform = `translate(${dx}px,${dy}px)`; G.input.mx = dx / R; G.input.mz = dy / R; G.input.run = G.input.run && m > 20; });
  const endStick = e => { if (e.pointerId !== sid) return; sid = null; knob.style.transform = ''; G.input.mx = G.input.mz = 0; };
  stick.addEventListener('pointerup', endStick); stick.addEventListener('pointercancel', endStick);
  canvas.addEventListener('pointerdown', e => { if (!touch || lid !== null) return; if (e.clientX < innerWidth * 0.4) return; lid = e.pointerId; lx = e.clientX; ly = e.clientY; });
  canvas.addEventListener('pointermove', e => { if (e.pointerId !== lid) return; G.input.dx += (e.clientX - lx) * 1.5; G.input.dy += (e.clientY - ly) * 1.5; lx = e.clientX; ly = e.clientY; });
  const endLook = e => { if (e.pointerId === lid) lid = null; }; canvas.addEventListener('pointerup', endLook); canvas.addEventListener('pointercancel', endLook);
  $('touchBtns').addEventListener('pointerdown', e => { const b = e.target.closest('[data-k]'); if (!b) return; e.preventDefault(); A.init(); const k = b.dataset.k;
    if (k === 'run') { G.input.run = !G.input.run; b.classList.toggle('active', G.input.run); return; } if (k === 'crouch') { G.act('crouch'); b.classList.toggle('active', G.input.crouch); return; } G.act(k); });
  document.addEventListener('gesturestart', e => e.preventDefault());
  // QA hook (read-only state) — the game has no cheats in the shipped UI
  window.T13QA = { state: () => G.debug(), director: () => ({ state: T13.director.state, log: T13.director.log.slice(-20) }) };
})();
