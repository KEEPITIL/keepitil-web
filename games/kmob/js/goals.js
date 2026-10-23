/* KMOB GOALS & COMMANDER RANK (Phase 1B, 2026-10-23). Optional, non-coercive progression:
   - one new DAILY goal per UTC day and one WEEKLY goal per ISO week; unfinished goals BANK (up to 6 daily + 2 weekly), so missing
     days never loses anything and there is no streak to break;
   - goals progress from ordinary play (Endless War and Daily Defense) and complete on their own; claiming gives Commander XP;
   - COMMANDER RANK 1–30 is cosmetic, front-loaded (the first ranks arrive in a session or two);
   - currency: KM.GOALS_TOKENS (War Tokens per rank-up) is 0 until the owner approves an amount (economy change). */
(function (G) {
  const KM = G.KM = G.KM || {};
  KM.GOALS_TOKENS = 0;   // OWNER DECISION PENDING: War Tokens granted per Commander rank-up (0 = recognition only)
  KM.GOAL_BANK = { daily: 6, weekly: 2 };
  // stat: what one finished battle reports (KM.goalStats). n: target. xp: Commander XP on claim. sum = totals across battles; best = in one battle
  KM.GOAL_POOL = {
    daily: [
      { id: 'kills300', text: 'Defeat 300 enemies', stat: 'kills', n: 300, sum: true, xp: 40 },
      { id: 'waves5', text: 'Clear 5 waves in one battle', stat: 'cleared', n: 5, xp: 40 },
      { id: 'boss1', text: 'Defeat a boss', stat: 'bosses', n: 1, sum: true, xp: 60 },
      { id: 'loot2k', text: 'Looters bring 2,000 Gold to the tank', stat: 'loot', n: 2000, sum: true, xp: 40 },
      { id: 'daily1', text: 'Play a Daily Defense (practice counts)', stat: 'daily', n: 1, sum: true, xp: 40 },
      { id: 'chant3', text: 'Fight 3 battles with a War Chant on', stat: 'chant', n: 3, sum: true, xp: 40 },
      { id: 'powers5', text: 'Use tank powers 5 times', stat: 'powers', n: 5, sum: true, xp: 40 },
      { id: 'heal3k', text: 'Mizards heal 3,000 HP', stat: 'healed', n: 3000, sum: true, xp: 40 },
      { id: 'battles3', text: 'Fight 3 battles', stat: 'battles', n: 3, sum: true, xp: 30 }],
    weekly: [
      { id: 'w_kills2k', text: 'Defeat 2,000 enemies this week', stat: 'kills', n: 2000, sum: true, xp: 150 },
      { id: 'w_bosses3', text: 'Defeat 3 bosses this week', stat: 'bosses', n: 3, sum: true, xp: 150 },
      { id: 'w_daily4', text: 'Play Daily Defense on 4 different days', stat: 'dailyDays', n: 4, xp: 150 },
      { id: 'w_wave15', text: 'Reach wave 15 in Endless War', stat: 'wave', n: 15, xp: 150 }] };
  // Commander rank r needs XP_FOR(r) total XP: front-loaded (rank 2 after ~1 claim, rank 5 after ~6) then gently rising
  KM.RANK_NAMES = ['RECRUIT', 'PRIVATE', 'LANCE', 'CORPORAL', 'SERGEANT', 'STAFF SERGEANT', 'WARRANT', 'LIEUTENANT', 'CAPTAIN', 'MAJOR', 'COLONEL', 'BRIGADIER', 'GENERAL', 'MARSHAL', 'WARLORD'];
  KM.RANK_MAX = 30;
  KM.xpFor = r => r <= 1 ? 0 : Math.round(25 * (r - 1) + 10 * (r - 1) * (r - 1));
  KM.rankOf = xp => { let r = 1; while (r < KM.RANK_MAX && xp >= KM.xpFor(r + 1)) r++; return r; };
  KM.rankName = r => KM.RANK_NAMES[Math.min(KM.RANK_NAMES.length - 1, Math.floor((r - 1) / 2))] + (r > 1 && r % 2 === 0 ? ' II' : '');
  // early wave titles (bridge to the first boss milestone): recognition only
  KM.EARLY_TITLES = [{ wave: 3, title: 'FIRST STAND' }, { wave: 5, title: 'IRON NERVE' }, { wave: 7, title: 'BATTLE READY' }];
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  KM.goalsEmpty = () => ({ xp: 0, rank: 1, list: [], lastDay: '', lastWeek: '', weekDays: [], done: 0 });
  // deal today's / this week's goal (once per period), never the same goal twice in the bank; oldest unfinished goals drop only past the bank cap
  KM.goalsDeal = (g, now) => { const day = now.toISOString().slice(0, 10), wk = KM.weekKey(now), out = [];
    if (!g.lastDay && !g.list.length) { g.lastDay = day; g.list.push({ id: 'kills300', kind: 'daily', key: day, got: 0, claimed: false }); out.push('kills300'); }   // a brand-new commander's first goal is one any first battle can finish
    const deal = (kind, key) => { const pool = KM.GOAL_POOL[kind], have = new Set(g.list.filter(x => x.kind === kind && !x.claimed).map(x => x.id));
      const free = pool.filter(p => !have.has(p.id)); if (!free.length) return; const p = free[hash(kind + key) % free.length];
      g.list.push({ id: p.id, kind, key, got: 0, claimed: false }); out.push(p.id);
      const open = g.list.filter(x => x.kind === kind && !x.claimed); while (open.length > KM.GOAL_BANK[kind]) { const old = open.shift(); g.list.splice(g.list.indexOf(old), 1); } };
    if (g.lastDay !== day) { g.lastDay = day; deal('daily', day); }
    if (g.lastWeek !== wk) { g.lastWeek = wk; g.weekDays = []; deal('weekly', wk); }
    g.list = g.list.filter(x => !x.claimed || x.key === day || x.key === wk).slice(-20); return out; };
  KM.goalDef = x => KM.GOAL_POOL[x.kind].find(p => p.id === x.id);
  // one finished battle → progress on every open goal; returns the goals that just completed
  KM.goalsProgress = (g, st, now) => { const day = now.toISOString().slice(0, 10), done = [];
    if (st.daily && !g.weekDays.includes(day)) g.weekDays.push(day); const ext = Object.assign({ dailyDays: g.weekDays.length }, st);
    for (const x of g.list) { if (x.claimed) continue; const d = KM.goalDef(x); if (!d) continue; const was = x.got >= d.n, v = ext[d.stat] || 0;
      x.got = Math.min(d.n, d.sum ? x.got + v : Math.max(x.got, v)); if (!was && x.got >= d.n) done.push(x); }
    return done; };
  KM.goalClaim = (g, x) => { const d = KM.goalDef(x); if (!d || x.claimed || x.got < d.n) return null; x.claimed = true; g.done++;
    const r0 = g.rank; g.xp += d.xp; g.rank = KM.rankOf(g.xp); return { xp: d.xp, rankUp: g.rank > r0 ? g.rank : 0, tokens: g.rank > r0 ? (g.rank - r0) * KM.GOALS_TOKENS : 0 }; };
  // what one battle reports (Endless War or Daily Defense)
  KM.goalStats = (sim, opts) => ({ kills: sim.kills || 0, cleared: sim.cleared || 0, bosses: sim.bossesKilled || 0, loot: Math.round(sim.colCoins || 0), healed: Math.round(sim.healed || 0),
    powers: typeof sim.powersUsed === 'number' ? sim.powersUsed : 0, chant: sim.chant && sim.chant.pack ? 1 : 0, battles: 1, daily: opts && opts.daily ? 1 : 0, wave: opts && opts.daily ? 0 : sim.wave || 0 });
  KM.validGoals = raw => { const g = KM.goalsEmpty(); if (!raw || typeof raw !== 'object') return g; const num = (v, max) => (typeof v === 'number' && isFinite(v) && v >= 0) ? Math.min(Math.floor(v), max) : 0;
    g.xp = num(raw.xp, 1e7); g.rank = KM.rankOf(g.xp); g.done = num(raw.done, 1e6);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw.lastDay)) g.lastDay = raw.lastDay; if (/^\d{4}-W\d{2}$/.test(raw.lastWeek)) g.lastWeek = raw.lastWeek;
    if (Array.isArray(raw.weekDays)) g.weekDays = raw.weekDays.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(-7);
    if (Array.isArray(raw.list)) for (const x of raw.list.slice(-20)) { if (!x || !['daily', 'weekly'].includes(x.kind)) continue; const d = KM.GOAL_POOL[x.kind].find(p => p.id === x.id); if (!d) continue;
      g.list.push({ id: x.id, kind: x.kind, key: String(x.key || '').slice(0, 10), got: Math.min(d.n, num(x.got, 1e9)), claimed: !!x.claimed }); }
    return g; };
})(typeof window !== 'undefined' ? window : globalThis);
