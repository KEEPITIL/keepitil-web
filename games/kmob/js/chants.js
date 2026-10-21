/* KMOB War Chants — 2.0 (Phase 0 foundations + Phase 1 station balance).
   Pure functions shared by the game, the pack builder (scripts/build-chant-packs.js) and the tests.
   - Bar states from KBeats per-bar analysis: S = surge (energy ≥ 0.75), B = breath (≤ 0.35), - = steady.
   - Crescendo rule (fixes the inconsistent kbeats `drops[]` indexing): for each listed drop d, the crescendo is the first bar
     i in [d-1, d+2] where energy[i] rises ≥ 0.3 above the mean of the 4 bars before it; listed drops with no such rise are ignored.
   - ChantClock: the bar/beat grid runs on SIM time (deterministic, same at 1×–5×, muted or not, survives save/resume);
     the music only follows it. */
(function (G) {
  const KM = G.KM = G.KM || {};
  const SURGE = 0.75, BREATH = 0.35, RISE = 0.3;
  KM.chantBarState = e => (e >= SURGE ? 'S' : e <= BREATH ? 'B' : '-');
  KM.chantCrescendos = (energy, drops) => {
    const out = new Set();
    for (const d of drops || []) for (let i = Math.max(4, d - 1); i <= Math.min(energy.length - 1, d + 2); i++) {
      const prev = (energy[i - 1] + energy[i - 2] + energy[i - 3] + energy[i - 4]) / 4;
      if (energy[i] - prev >= RISE) { out.add(i); break; }
    }
    return [...out].sort((a, b) => a - b);
  };
  // a pack = one looping bar range of a track: bars [fromBar, fromBar + bars)
  KM.chantPack = (id, track, fromBar, bars) => {
    const e = track.energy.slice(fromBar, fromBar + bars), cres = KM.chantCrescendos(track.energy, track.drops).filter(i => i >= fromBar && i < fromBar + bars).map(i => i - fromBar);
    const states = e.map(KM.chantBarState).join(''), n = states.length, count = c => states.split(c).length - 1;
    const budget = { fS: +(count('S') / n).toFixed(3), fB: +(count('B') / n).toFixed(3), nDperMin: +(cres.length / (n * track.barSec / 60)).toFixed(2) };
    return { id, slug: track.slug, title: track.title, bpm: track.bpm, barSec: track.barSec, downbeatSec: track.downbeatSec,
      loop: { fromBar, bars: n }, bars: states, crescendo: cres, budget, tune: KM.chantTune(budget) };
  };
  // 2.0 Phase 1 balance (research §3.9). Every station has the SAME average power; stations only change its shape (ATTACK vs DEFEND lean,
  // steady vs spiky). Cadence: always-on +3 % on each class's signature stat. Surge bars feed classes that are ATTACKING, breath bars
  // classes that are DEFENDING; the per-bar bonus is scaled so bonus × (surge + breath share) is equal for every station.
  // Chant multipliers add up inside the chant system and are capped at ×1.10 per stat, then multiply with War Cry etc. (×1.25).
  // Crescendos (one class action per drop bar, ≥ 8 bars apart per class) are scaled so strength × crescendos-per-minute is equal too.
  KM.CHANT = { CAD: 0.03, AVG: 0.025, BAR_MAX: 0.07, CAP: 1.10, CRES_REF: 2.0, CRES_CD: 8, STR_MIN: 0.6, STR_MAX: 1.6 };
  KM.CHANT_STAT = {   // which stat each source feeds per class: dmg · rof (attack speed) · arm (armour) · heal · spd (move speed)
    cad: { collector: 'arm', range: 'rof', melee: 'dmg', mizard: 'heal', elite: 'arm', giant: 'arm' },
    surge: { collector: 'spd', range: 'rof', melee: 'dmg', mizard: 'heal', elite: 'dmg', giant: 'dmg' },
    breath: { collector: 'arm', range: 'arm', melee: 'arm', mizard: 'heal', elite: 'arm', giant: 'arm' } };
  KM.chantTune = b => { const C = KM.CHANT, r = b.nDperMin;
    return { bar: +Math.min(C.BAR_MAX, C.AVG / Math.max(0.05, b.fS + b.fB)).toFixed(4), str: +Math.max(C.STR_MIN, Math.min(C.STR_MAX, r > 0 ? C.CRES_REF / r : C.STR_MAX)).toFixed(3) }; };
  // where the chant grid is at sim time t for a pack started at sim time t0
  KM.chantAt = (pack, t, t0) => {
    if (!pack) return null;
    const x = Math.max(0, t - (t0 || 0)) / pack.barSec, k = Math.floor(x), n = pack.loop.bars, i = k % n, beats = x * 4;
    return { bar: k, loopBar: i, songBar: pack.loop.fromBar + i, state: pack.bars[i], crescendo: pack.crescendo.includes(i), beat: Math.floor(beats) % 4, beatPhase: beats - Math.floor(beats) };
  };
  // the radio dial (owner 2026-10-21): STEEL is free; IRON / FURY unlock by playing OR with War Tokens / Diamonds (either one).
  // All three have the same power budget, so buying one never raises the power ceiling (no pay-to-win).
  KM.STATIONS = [
    { id: 'steel', name: 'STEEL', lean: 'MARCH', song: 'MOOOVE IT', desc: 'Balanced. The KMOB battle song.' },
    { id: 'iron', name: 'IRON', lean: 'HOLD', song: 'FCawf FCawf', desc: 'Long calm stretches that reward DEFEND, then one huge drop.', unlock: { boss: 1, text: 'DEFEAT A BOSS' } },
    { id: 'fury', name: 'FURY', lean: 'CHARGE', song: 'WOOF WOOF', desc: 'Fast and loud. Rewards ATTACK, many small drops.', unlock: { wave: 30, text: 'REACH WAVE 30' } }];
  KM.STATION_BY = Object.fromEntries(KM.STATIONS.map(s => [s.id, s]));
  KM.STATION_COST = { tokens: 9, diamonds: 3 };   // owner-approved 2026-10-21 (same as a tier-2 perk); loops approved by ear the same day
  // play unlock check from a finished or running battle: { bosses, wave } → station ids newly earned
  KM.stationEarned = (owned, got) => KM.STATIONS.filter(s => s.unlock && !(owned && owned[s.id]) && ((s.unlock.boss && (got.bosses || 0) >= s.unlock.boss) || (s.unlock.wave && (got.wave || 0) >= s.unlock.wave))).map(s => s.id);
})(typeof window !== 'undefined' ? window : globalThis);
