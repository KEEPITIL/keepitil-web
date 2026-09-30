/* FEAR DIRECTOR 2.0 — CALM → UNEASY → TENSION → DANGER → TERROR → RELEASE.
   Inputs (all optional): dark, dist (Hollow m), hunting, hidden, provoked, health (0 stable…2 critical), speed, zone,
   progress (0..1), hollowStage (DISTANT/NEAR/SAME_AREA/HUNT/IMMEDIATE), echoActive, separation (m), t.
   Output: state, intensity k, and at most one event per decision. Repetition is prevented per event AND per zone;
   sometimes it deliberately builds and delivers NOTHING (tracked as 'build') so later scares land harder. */
(function () {
  const STATES = ['CALM', 'UNEASY', 'TENSION', 'DANGER', 'TERROR', 'RELEASE'];
  const POOL = {
    CALM: [['creak', 3], ['step_far', 1], ['nothing', 5], ['build', 2]],
    UNEASY: [['creak', 2], ['step_far', 3], ['whisper', 2], ['door_far', 1], ['shadow', 1], ['object_fall', 1], ['build', 3], ['nothing', 2]],
    TENSION: [['step_near', 3], ['whisper', 3], ['door_slam', 2], ['flicker', 2], ['radio', 2], ['false_voice', 1], ['shadow', 2], ['blackout', 1], ['glass', 1], ['object_fall', 1], ['sibling_react', 2], ['build', 2]],
    DANGER: [['step_near', 3], ['flicker', 2], ['false_voice', 2], ['shadow', 2], ['radio', 1], ['silence', 2], ['blackout', 2], ['glass', 1], ['sibling_react', 1], ['build', 1]],
    TERROR: [['flicker', 2], ['whisper', 1], ['nothing', 1]],
    RELEASE: [['nothing', 1]],
  };
  const INTENSITY = { creak: 0.05, step_far: 0.08, whisper: 0.15, door_far: 0.12, shadow: 0.3, object_fall: 0.2, step_near: 0.25, door_slam: 0.3, flicker: 0.15, radio: 0.2, false_voice: 0.35, blackout: 0.45, glass: 0.3, sibling_react: 0.1, silence: 0.2, build: 0, nothing: 0 };
  const D = T13.director = { state: 'CALM', k: 0, log: [], events: [], last: null, next: 6, releaseUntil: 0, silenceUntil: 0, recent: 0, sinceMeaningful: 0, zoneHist: {}, builds: 0 };
  D.reset = () => { Object.assign(D, { state: 'CALM', k: 0, last: null, next: 6, releaseUntil: 0, silenceUntil: 0, recent: 0, sinceMeaningful: 0, zoneHist: {}, builds: 0, lastFired: null }); D.log = []; D.events = []; };
  D.bump = v => { D.k = Math.min(1, D.k + v); D.recent = Math.min(1, D.recent + v); D.sinceMeaningful = 0; };
  D.STATES = STATES; D.POOL = POOL;
  D.update = (dt, ctx, fire) => {
    const near = ctx.dist < 30 ? (30 - ctx.dist) / 30 : 0, stage = ctx.hollowStage || '';
    D.recent = Math.max(0, D.recent - dt * 0.03); D.sinceMeaningful += dt;
    let target = 0.08 + (ctx.dark ? 0.1 : 0) + near * 0.5 + (ctx.hunting ? 0.35 : 0) + (ctx.provoked ? 0.1 : 0)
      + (ctx.health || 0) * 0.07 + Math.min(0.15, (ctx.separation || 0) / 80) + (ctx.echoActive ? 0.06 : 0) + (ctx.progress || 0) * 0.08
      + (stage === 'SAME_AREA' ? 0.1 : stage === 'IMMEDIATE' ? 0.25 : 0) + Math.min(0.12, D.sinceMeaningful / 400);
    if (ctx.hidden) target *= 0.55;
    D.k += (Math.min(1, target) - D.k) * Math.min(1, dt * (target > D.k ? 0.5 : 0.18));
    const prev = D.state;
    if (ctx.t < D.releaseUntil) D.state = 'RELEASE';
    else D.state = ctx.hunting && near > 0.5 ? 'TERROR' : D.k > 0.62 ? 'DANGER' : D.k > 0.42 ? 'TENSION' : D.k > 0.22 ? 'UNEASY' : 'CALM';
    if (prev === 'TERROR' && D.state !== 'TERROR') { D.releaseUntil = ctx.t + 9; D.state = 'RELEASE'; }
    if (prev !== D.state) D.log.push(`${(ctx.t || 0).toFixed(1)} ${prev}→${D.state}`);
    D.next -= dt;
    if (D.next <= 0) {
      const zone = ctx.zone || '-', zh = D.zoneHist[zone] = D.zoneHist[zone] || [];
      // exclude: the last event anywhere, anything this zone produced in its last 3 events, and big scares when recent intensity is already high
      let pool = POOL[D.state].filter(e => e[0] !== D.last && e[0] !== D.lastFired && !zh.slice(-3).includes(e[0]) && !(D.recent > 0.6 && INTENSITY[e[0]] > 0.25));
      if (!pool.length) pool = POOL[D.state].filter(e => e[0] !== D.last && e[0] !== D.lastFired); if (!pool.length) pool = [['nothing', 1]];
      const tot = pool.reduce((a, e) => a + e[1], 0); let r = Math.random() * tot, pick = pool[0][0];
      for (const e of pool) { if ((r -= e[1]) <= 0) { pick = e[0]; break; } }
      D.last = pick; zh.push(pick); if (zh.length > 6) zh.shift();
      const base = { CALM: 14, UNEASY: 10, TENSION: 7, DANGER: 5, TERROR: 4, RELEASE: 12 }[D.state];
      D.next = base * (0.6 + Math.random() * 0.9) * (1 + D.recent * 0.8) * (ctx.speed > 3.5 ? 0.8 : 1);
      if (pick === 'build') { D.builds++; D.next *= 0.6; }   // anticipation: a quiet beat, then the next decision comes sooner
      D.events.push({ t: +(ctx.t || 0).toFixed(1), state: D.state, ev: pick, zone }); if (D.events.length > 300) D.events.shift();
      if (INTENSITY[pick]) { D.recent = Math.min(1, D.recent + INTENSITY[pick]); D.sinceMeaningful = 0; }
      if (pick !== 'nothing' && pick !== 'build') { D.lastFired = pick; fire(pick); }
    }
    return { state: D.state, k: D.k, silence: (ctx.t || 0) < D.silenceUntil };
  };
})();
