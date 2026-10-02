# KMOB milestone 4: Track A report

## Track A (done in code)

- **Asset pipeline v2** (`js/assets.js`):
  - Texture atlases: base-colour, normal and emissive maps, one shared atlas, downscaled above 2048, with texture memory reported.
  - Metalness and roughness become a cel metal highlight. Emissive accents follow the glow tier.
  - `tint*` materials keep faction colouring on textured parts.
  - Each part is checked for scale, pivot and orientation against its template part.
  - Several GLB files can be listed in the manifest, applied in load order.
  - Authored clips (`idle`, `run`, `attack_01` … `death_02`, hits, `stagger`) are baked onto the shared skeleton. Any clip not delivered keeps its procedural version.
- **Artist package:**
  - `assets/characters/<faction>/<unit>/` folders, each with a README listing its part names;
  - the template GLB, now with the `rig` and every current clip under its authored name;
  - `docs/CHARACTER-ASSET-SPEC.md`: rig, pivots, scale, orientation, materials, atlas rules, tiered budgets, clip names, export settings and what the loader checks.
- **Budgets enforced on load:** standard near unit 1,500–3,000 triangles, with per-part limits and 6,000 for the hero prop. Procedural parts stay as the mid and far tiers, the fallback and the low-quality mode.
- **Battlefield edges**, all visual only, from world-space masks so there are no seams between chunks:
  - cliff walls with strata and mossy upper shelves just past the fence;
  - rivers with banks, sand beds and an animated shader (ripples, sparkle, foam edge);
  - waterfalls with foam particles;
  - broken bridges, ruined walls on cliff shelves, abandoned siege wrecks and rock clusters;
  - distant snow-capped peaks.

  The start area stays open meadow, and the playable lane stays flat (tested).
- **Frontline shape:**
  - Mass spawns get depth jitter, a random arc, lateral clusters and late subgroups.
  - Enemies advance unevenly, wander gently and bulge toward the centre. The debug stress fill uses arcs and stragglers.
- **Lighting without bloom:**
  - warm cel ramp: cool shadow band, warm light band;
  - stronger warm rim;
  - warm haze leaning toward the sun;
  - brighter coin emissive;
  - a per-tier glow level for emissive accents.
- **Quality tiers:**
  - HIGH, MEDIUM and LOW set pixel ratio, shadow size, animated-unit budgets, effect density and glow.
  - Auto-detect: desktop HIGH, phones MEDIUM, weak devices LOW, and a stored benchmark recommendation takes precedence.
  - Sustained low fps steps the tier down, never up, mid-session.
  - Bloom (EffectComposer + UnrealBloom) is lazy-loaded on HIGH only, and only when allowed (`?bloom=1` or a HIGH recommendation).
- **`?bench=1`:**
  - four stages (100, 400, 900, 1,600 units);
  - per stage: average FPS, 1% low, average and worst frame time, triangles, draw calls, JS cost and memory;
  - the user agent, GPU string, render resolution, pixel ratio and tier;
  - a big COPY RESULTS button and a recommended quality, which is stored.
- **`?playtest=1`:** after each run, a summary (time, upgrades, death reason, peak army, coins) plus three yes/no questions and COPY PLAYTEST.
- **Pacing kept:** first clash ~5–6 s, first coin ~11 s, first upgrade 18–23 s, second 35–41 s.

## Evidence

- **Tests:** 61 core + 24 animation + 37 browser = **122 automated, 0 failures** (baseline 99).
- **Performance at 1,600 units (headless budget counters):** 794k triangles and 109 draw calls, with crowd JS ~2.3 ms, against 743k / 104 / ~4 ms. That's +7% triangles and +5 calls from the terrain, water and edge dressing; JS is lower.
- **Environment captures:** `docs/shots/{mobile,desktop}-ENV-1…7`, plus `side-by-side-env-*.png`.

## Track B (external)

- **Real-device benchmark results:** **not supplied yet.**
- **Production character GLBs:** **not supplied yet.**

## Side-by-side

**NOT YET.** The remaining reasons:
1. The characters are still code-built. This needs the authored GLBs.
2. The concept's clash is a dense mixed melee with glow everywhere, while ours meets in a mostly horizontal band, more irregular than before. Bloom is ready on the HIGH tier but waits on device numbers.
3. On narrow phones the 20 m road fills most of the frame, so the new cliffs and water only frame the edges. On desktop and wide screens they read well.
