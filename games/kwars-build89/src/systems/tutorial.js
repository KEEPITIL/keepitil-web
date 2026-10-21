/* TASK N — FIRST-WAR TUTORIAL (D-07). Teaches by doing, inside the real first Crusade battle (Kingdom 1 of the first
   civilization), without pausing the game. A slim banner names ONE action and highlights the control that does it;
   the step advances when the player has actually done it (polled from game state), so nothing is a wall of text.
   Always skippable. Completion/skip persists in its own key (`kingdom-wars-tutorial-v1`, inside the protected
   kingdom-wars-* namespace) and never touches the campaign or battle saves. Touch devices are told to "Tap", mouse
   users to "Click"; no keyboard instruction is ever shown on touch.                                                 */
(function(){
  'use strict';
  const KEY = 'kingdom-wars-tutorial-v1';
  const touch = () => matchMedia('(pointer:coarse)').matches || matchMedia('(hover:none)').matches;
  const verb = () => touch() ? 'Tap' : 'Click';
  const wideInline = () => matchMedia('(min-width:1180px) and (pointer:fine)').matches;   // drawers sit inline in the bar
  let state = { done:false, step:0 };
  try { const r = JSON.parse(localStorage.getItem(KEY) || 'null'); if (r && typeof r === 'object') state = Object.assign(state, r); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };
  let el = null, active = false, stepStart = 0, mark = null;
  const firstKingdomId = () => { try { return window.KW_DATA.campaignKingdoms[0].id; } catch (e) { return null; } };
  const army = () => { let n = 0; for (const u of S.units) if (u.team === 1 && u.hp > 0) n++; return n; };
  const has = w => S.units.some(u => u.team === 1 && u.hp > 0 && (TYPES[u.type] || {}).weapon === w);
  const thrown = () => S.units.some(u => u.team === 1 && u.spearLost === 'thrown');
  const foesNear = () => S.units.some(u => u.team === -1 && u.hp > 0 && S.units.some(m => m.team === 1 && m.hp > 0 && Math.abs(m.x - u.x) < 260));
  const btn = cmd => document.querySelector('[data-cmd="' + cmd + '"]');
  const unitsOpen = () => wideInline() || document.getElementById('unitsdrawer').classList.contains('open');
  const tacticsOpen = () => wideInline() || document.getElementById('tacticsdrawer').classList.contains('open');
  /* Each step: text(), the control to highlight, and done() -- advanced by what the player actually did.
     `soft` steps also advance on their own after a while, so a player who never needs them is not stranded. */
  const STEPS = [
    { text: () => 'Gold comes in every second and from every enemy you defeat. ' + (unitsOpen() ? verb() + ' SWORD to recruit your first soldier.' : verb() + ' UNITS, then SWORD.'),
      target: () => unitsOpen() ? btn('sword') : btn('unitsbtn'), done: () => has('sword') },
    { text: () => 'Spears hold the line; archers shoot over it. Recruit a SPEAR and an ARCHER.',
      target: () => unitsOpen() ? (has('spear') ? btn('archer') : btn('spear')) : btn('unitsbtn'), done: () => has('spear') && has('bow') },
    { text: () => 'Your army is holding the line (DEFEND). ' + verb() + ' the centre button to MARCH forward.',
      target: () => btn('hold'), done: () => S.stance === 'march' },
    { text: () => verb() + ' it again to DEFEND: let the enemy walk onto your spear points.',
      target: () => btn('hold'), done: () => S.stance === 'defend' },
    { text: () => 'When they close in, open TACTICS and THROW SPEARS — then your spearmen draw swords.',
      target: () => tacticsOpen() ? btn('throwspears') : btn('tacticsbtn'), done: () => thrown(), soft: 40, ready: () => foesNear() || S.time - stepStart > 18 },
    { text: () => verb() + ' ATTACK to send everyone forward and break their army.',
      target: () => btn('attack'), done: () => S.stance === 'attack' },
    { text: () => 'Hurt soldiers can RETREAT behind your walls to heal. Try it, then ATTACK again.',
      target: () => btn('retreat'), done: () => !!S.retreatMode, soft: 25 },
    { text: () => S.phase === 'siege' ? 'Their field army is broken — ATTACK and storm the fortress to win the kingdom!' : 'Break the enemy army, then storm their fortress to win the kingdom.',
      target: () => btn('attack'), done: () => !!S.over },
  ];
  function ensureEl(){
    if (el) return el;
    el = document.createElement('div'); el.id = 'kwtutorial'; el.setAttribute('role', 'status');
    el.innerHTML = '<span class="tut-step" id="kwtutstep"></span><span class="tut-text" id="kwtuttext"></span><button type="button" id="kwtutskip">Skip tutorial</button>';
    document.body.appendChild(el);
    el.querySelector('#kwtutskip').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); finish(true); });
    return el;
  }
  function highlight(t){ if (mark === t) return; if (mark) mark.classList.remove('kw-tut-target'); mark = t || null; if (mark) mark.classList.add('kw-tut-target'); }
  function show(){
    const st = STEPS[state.step]; if (!st) return;
    ensureEl(); el.hidden = false;
    document.getElementById('kwtutstep').textContent = (state.step + 1) + '/' + STEPS.length;
    document.getElementById('kwtuttext').textContent = st.text();
    highlight(st.target && st.target());
  }
  function finish(skipped){
    state.done = true; state.skipped = !!skipped; save(); active = false;
    highlight(null); if (el) el.hidden = true;
  }
  function tick(){
    try {
      // winning the first kingdom IS completing the tutorial (the result screen stops the battle before a tick can see S.over)
      if (!state.done && window.KWCampaign && KWCampaign.state.completed[firstKingdomId()]) return finish(false);
      const inFirst = typeof started !== 'undefined' && started && typeof S !== 'undefined' && S && S.campaignMissionId && S.campaignMissionId === firstKingdomId();
      if (state.done || !inFirst){ if (active){ active = false; highlight(null); if (el) el.hidden = true; } return; }
      if (!active){ active = true; stepStart = S.time; }
      if (S.over){ if (S.over === 'win') return finish(false); highlight(null); if (el) el.hidden = true; return; }   // a defeat keeps the tutorial for the retry
      const st = STEPS[state.step];
      if (!st) return finish(false);
      if (st.ready && !st.ready()) { if (el) el.hidden = true; highlight(null); return; }
      if (st.done() || (st.soft && S.time - stepStart > st.soft)){ state.step++; stepStart = S.time; save(); }
      show();
    } catch (e) { /* the tutorial must never break the battle */ }
  }
  setInterval(tick, 300);
  window.KWTutorial = Object.freeze({ get state(){ return { ...state }; }, reset(){ state = { done:false, step:0 }; save(); }, skip(){ finish(true); }, STEPS: STEPS.length });
})();
