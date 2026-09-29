/* FEAR DIRECTOR — CALM → UNEASY → TENSION → DANGER → TERROR → RELEASE.
   Intensity rises from darkness, the Hollow's distance, noise and time without relief; it falls when the player hides or escapes.
   Events are chosen from a weighted pool per state, never the same one twice in a row, on jittered timers
   (the player learns the rules, not the timing). */
(function () {
  const STATES = ['CALM', 'UNEASY', 'TENSION', 'DANGER', 'TERROR', 'RELEASE'];
  const POOL = {
    CALM: [['creak', 3], ['step_far', 1], ['nothing', 4]],
    UNEASY: [['creak', 2], ['step_far', 3], ['whisper', 2], ['door_far', 1], ['shadow', 1], ['nothing', 2]],
    TENSION: [['step_near', 3], ['whisper', 3], ['door_slam', 2], ['flicker', 2], ['radio', 2], ['false_voice', 1], ['shadow', 2], ['blackout', 1]],
    DANGER: [['step_near', 3], ['flicker', 2], ['false_voice', 2], ['shadow', 2], ['radio', 1], ['silence', 2], ['blackout', 2]],
    TERROR: [['flicker', 2], ['whisper', 1]],
    RELEASE: [['nothing', 1]],
  };
  const D = T13.director = { state: 'CALM', k: 0, log: [], last: null, next: 6, releaseUntil: 0, silenceUntil: 0 };
  D.reset = () => { D.state = 'CALM'; D.k = 0; D.last = null; D.next = 6; D.releaseUntil = 0; D.silenceUntil = 0; };
  D.bump = v => { D.k = Math.min(1, D.k + v); };
  /* ctx: {dark, dist (to Hollow, m), hunting, hidden, t} */
  D.update = (dt, ctx, fire) => {
    const near = ctx.dist < 30 ? (30 - ctx.dist) / 30 : 0;
    let target = 0.08 + (ctx.dark ? 0.12 : 0) + near * 0.55 + (ctx.hunting ? 0.35 : 0) + (ctx.provoked ? 0.12 : 0);
    if (ctx.hidden) target *= 0.55;
    D.k += (Math.min(1, target) - D.k) * Math.min(1, dt * (target > D.k ? 0.5 : 0.18));
    const prev = D.state;
    if (ctx.t < D.releaseUntil) D.state = 'RELEASE';
    else D.state = ctx.hunting && near > 0.5 ? 'TERROR' : D.k > 0.62 ? 'DANGER' : D.k > 0.42 ? 'TENSION' : D.k > 0.22 ? 'UNEASY' : 'CALM';
    if (prev === 'TERROR' && D.state !== 'TERROR') { D.releaseUntil = ctx.t + 9; D.state = 'RELEASE'; }
    if (prev !== D.state) D.log.push(`${ctx.t.toFixed(1)} ${prev}→${D.state}`);
    D.next -= dt;
    if (D.next <= 0) {
      let pool = POOL[D.state].filter(e => e[0] !== D.last); if (!pool.length) pool = POOL[D.state].length ? POOL[D.state] : [['nothing', 1]]; const tot = pool.reduce((a, e) => a + e[1], 0); let r = Math.random() * tot, pick = pool[0][0];
      for (const e of pool) { if ((r -= e[1]) <= 0) { pick = e[0]; break; } }
      D.last = pick; const base = { CALM: 14, UNEASY: 10, TENSION: 7, DANGER: 5, TERROR: 4, RELEASE: 12 }[D.state];
      D.next = base * (0.6 + Math.random() * 0.9);
      if (pick !== 'nothing') fire(pick);
    }
    return { state: D.state, k: D.k, silence: ctx.t < D.silenceUntil };
  };
  D.STATES = STATES;
})();
