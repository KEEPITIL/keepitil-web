/* KMOB DAILY DEFENSE — one free challenge per UTC day (owner 2026-10-22: reset 00:00 UTC, 3 ranked attempts + unlimited practice,
   badges + 1 earned War Token for completing the day). Shared by the game, the tests and the score verifier, so all three agree on:
   - the day's rules (seed + objective from the date alone: everyone plays the same battle),
   - the standard loadout (no perks, gear, skins, boss buffs, power levels or items: nothing bought or ground affects the score),
   - the score, computed from the finished simulation,
   - the replay: seed + recorded inputs → the same battle and the same score on any engine (tests/cross-engine.test.js). */
(function (G) {
  const KM = G.KM = G.KM || {};
  const CAP = 240;   // 4 minutes of battle time (target 3–5 minutes at 1×; faster game speeds finish sooner in real time)
  KM.DAILY = { RANKED: 3, CAP, STEP: 1 / 60, POWERS: ['linebreaker', 'arrowstorm', 'fortress'], STATIONS: [null, 'steel', 'iron', 'fury'], VERSION: 1 };
  KM.DAILY_VERIFY_URL = "https://kmob-daily-verify-staging.illestratedlifestyle.workers.dev";   // the score verifier (server/verifier). null until the owner approves it: no submissions, no board, local bests only
  // one objective per weekday (UTC), so the week has variety and players learn each one
  // one objective per weekday (UTC). Each day starts mid-war with a war chest (tuned with the bot 2026-10-22: early waves never threaten
  // the tank in 4 minutes, so the challenge is the SCORE; the restricted days at wave 16 also carry real risk of falling)
  KM.DAILY_TYPES = [
    { id: 'endurance', name: 'ENDURANCE', desc: 'Join the war at wave 26 with a big war chest. The wave 30 boss arrives before the 4 minutes are up.', startWave: 26, bank: 70000 },   // Sunday
    { id: 'survival', name: 'SURVIVAL', desc: 'Join the war at wave 16. Every kill, wave and boss scores; the wave 20 boss is worth the most.', startWave: 16, bank: 30000 },            // Monday
    { id: 'lean', name: 'LEAN PURSE', desc: 'Join at wave 12 with only 8,000 Gold, and waves pay half. Spend wisely.', startWave: 12, bank: 8000, waveGoldMul: 0.5 },                    // Tuesday
    { id: 'archers', name: 'ARCHER LINE', desc: 'Only Looters, Archers and Mizards can be deployed. Join the war at wave 16.', startWave: 16, bank: 30000, allow: ['collector', 'range', 'mizard'] },   // Wednesday
    { id: 'boss', name: 'BOSS RUSH', desc: 'Join at wave 18 with a war chest. The boss arrives at wave 20: bring it down fast.', startWave: 18, bank: 45000 },                             // Thursday
    { id: 'economy', name: 'WAR ECONOMY', desc: 'Join at wave 16. Gold left at the end scores too: win without overspending.', startWave: 16, bank: 30000, goldScore: 0.05 },             // Friday
    { id: 'iron', name: 'IRON WALL', desc: 'Only Looters, Elites and Giants can be deployed. Join the war at wave 16.', startWave: 16, bank: 30000, allow: ['collector', 'elite', 'giant'] }];   // Saturday
  // FNV-1a over the day key: the battle seed is public and the same for everyone (fairness comes from equal conditions, not secrecy)
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  KM.dailyDay = d => (d || new Date()).toISOString().slice(0, 10);
  KM.dailyResetIn = d => { d = d || new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - d.getTime(); };   // ms to 00:00 UTC
  KM.dailyRules = day => { if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('bad day'); const T = KM.DAILY_TYPES[new Date(day + 'T00:00:00Z').getUTCDay()];
    return Object.assign({ day, v: KM.DAILY.VERSION, seed: hash('kmob-daily:' + day), cap: CAP }, T); };
  // the standard loadout: identical for every player, whatever they own
  KM.dailyOpts = (rules, station, record) => ({ seed: rules.seed, daily: rules, record: !!record, chant: KM.DAILY.STATIONS.includes(station) ? station : null,
    equip: KM.DAILY.POWERS, powerLv: {}, skins: {}, buffs: { cls: {}, tank: {} }, cons: {}, loadout: {}, mercTier: 1, plan: KM.emptyPlan() });
  // SCORE (shown to players as-is): kills ×10 · waves cleared ×300 · bosses ×2,500 · reaching the 4-minute finish +1,000 and +10 per % tank HP left · WAR ECONOMY: +5 % of Gold left
  KM.dailyScore = (sim, rules) => { const done = !!sim.done, hp = done ? Math.round(100 * Math.max(0, sim.L.hp) / sim.stats.maxHp) : 0;
    const parts = { kills: sim.kills * 10, waves: sim.cleared * 300, bosses: sim.bossesKilled * 2500, finish: done ? 1000 + hp * 10 : 0, gold: rules.goldScore ? Math.floor(sim.coins * rules.goldScore) : 0 };
    return { score: parts.kills + parts.waves + parts.bosses + parts.finish + parts.gold, parts, done, hp, t: +sim.t.toFixed(3), kills: sim.kills, cleared: sim.cleared, bosses: sim.bossesKilled }; };
  // REPLAY: the verifier's whole job. Same rules + station + recorded inputs → the same battle, step for step.
  KM.dailyReplay = (rules, station, rec, endStep) => { const s = new KM.Sim(KM.dailyOpts(rules, station, false)), STEP = KM.DAILY.STEP, lim = Math.min(endStep, Math.ceil(rules.cap / STEP) + 2);
    let k = 0; const apply = () => { while (k < rec.length && rec[k][0] === s.stepN) { const [, m, a] = rec[k++]; if (!KM.Sim.INPUTS.includes(m)) throw new Error('bad input ' + m); s[m].apply(s, a); } };
    // the live game follows the same rule: a run ends on the step where the tank falls or the 4-minute finish line is crossed
    for (;;) { apply(); if (s.done || !s.alive || s.stepN >= lim) break; s.step(STEP); }
    if (k < rec.length) throw new Error('inputs after the end of the run'); return { sim: s, result: KM.dailyScore(s, rules), applied: k }; };
})(typeof window !== 'undefined' ? window : globalThis);
