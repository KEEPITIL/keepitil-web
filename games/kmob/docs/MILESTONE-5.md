# KMOB · Pre-art polish (milestone 5)

Status: code and presentation are done. **Production character art: WAITING** (no final GLBs delivered). **Real-device validation: WAITING** (no physical-device numbers yet).

## Mixed melee
- Every unit gets a role: front, pressure, breakthrough or rear. Ranged units and healers hold the rear. Brutes and the warlord push through.
- The lane has 8 pressure zones. Each zone wins or loses ground on its own, with slow noise per zone and diffusion between neighbours.
- Breakthroughs: a unit in a winning zone can take a temporary breakthrough role for 3–6 s. A losing zone gives ground while it keeps fighting.
- Targeting looks at the 8 nearest enemies and picks by role. Units spread their attacks, finish wounded enemies, hunt specialists, help allies under attack and dive deep.
- Occupancy is soft: opposing units can press into each other. A death opens space, and the victors surge into the gap.
- Heavy blows (brute, warlord, elites, axes) shove a small group back with a shockwave.
- Intensity scales with battle size. There is no effect below 70 units, it ramps through medium battles and reaches full strength at about 160 units.
- Visual feedback for heavy blows: radial dust, a shock ring, a hot spark and a low thud. Only big blows near the player add a tiny camera kick (≤ 0.07).
- Staged mass battle, sampled from 5 to 14 s over 3 seeds and compared with melee switched off:
  - mixing: above 0.28, and at least 0.05 above the banded line;
  - penetration: at least twice the banded line;
  - front spread: above 3 m (the old line was about 1.9 m).

  `tests/kmob.test.js` guards all three.
- Captures: `docs/shots/melee-set.png`, `docs/shots/melee-banded-vs-mixed.png`.

## Phone composition
- In portrait the camera turns slightly diagonal (0.17 rad), so one side's river or cliffs enter the frame.
- The visible dirt road is about ±5 m, narrower than the ±9.4 m playable lane, and the grass between them looks trampled. The grass shoulders rise beyond the fences.
- Before/after pairs use the same seed and the same staged armies: `docs/shots/phone-{medium,large,towers,env}.png`.

## Decor occlusion
- A guard runs when each chunk is built. A prop of height h must keep its inner edge at least `LANE − 0.3 + 0.42·(h − 0.6)` from the lane centre. An offending prop is moved out (≤ 2.5 m), otherwise lowered, otherwise dropped.
- The overhead biome gate is its own mesh, with wider pillars, and fades to 22% while it hangs over the fight.
- Browser test, on phone and desktop: camera rays to the launcher, nearby coins, every tower, the frontline and threats across about 35 road positions (cliffs, rivers, ruins, gates). Result: zero hits. A deliberately bad probe prop is detected.

## Lighting (no bloom needed)
- Warmer sun and sky, a warmer toon ramp with cooler shadows, stronger warm rim light and gold-tinted metal highlights.
- Warmer dirt and grass, more coin emissive and coin glow, and warmer haze.
- Bloom policy is unchanged: HIGH only when allowed or validated, nothing on MEDIUM or LOW.

## Asset pipeline
- `?assets=1` opens `dev/assets.html`. For every unit it shows:
  - production GLB, partial, or procedural fallback;
  - triangles vs budget, draws/materials, texture size;
  - skeleton status;
  - scale, orientation and pivot checks;
  - clips found and missing;
  - budget PASS / WARN / FAIL.

  It previews idle, run, attack, hit and death with the procedural reference and the production model side by side. You can drag and drop a .glb, add `&glb=` files, or use COPY REPORT.
- Policy: warn, don't refuse. Only technically invalid data (empty geometry, NaN vertices, unreadable file) is refused. Budget, scale, pivot and orientation problems load with a flag.

## Benchmark and playtest
- `?bench=1` (version 3) reports `startQuality`, `finalQuality` and `qualityChanges[]`. Each change records from/to, stage, units, fps before, fps after and the reason. Each stage row records the tier it ran at. A banner warns when quality dropped, and the recommendation is capped at the lowest tier reached.
- `?playtest=1` records whether TRY AGAIN was actually pressed and how many seconds after the death screen. The copied report includes `pressedTryAgain`, `retrySeconds`, `sessionRetries[]` and `retryRate`. The current run reads PENDING until the player leaves the results screen; the next run's report carries the result.
