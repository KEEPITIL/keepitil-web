# KMOB · Endless War

**Play:** https://keepitil.com/games/kmob/

A one-finger endless army game. Drag the launcher; soldiers deploy on their own; enemies keep coming. The score is how long you survive. It runs in the browser on desktop and mobile with three.js r128 and needs no build step. This folder in **KEEPITIL/keepitil-web** is the canonical source. The site deploys from `main` through GitHub Pages and is mirrored to keepitil.github.io.

```
games/kmob/
  index.html          UI: HUD, upgrade cards, results, Gift Shop, settings
  js/core.js          pure logic: difficulty, enemy roster, upgrades, towers, shop, save data, chunk plan
  js/sim.js           headless simulation: deployment, enemy director, combat grid + steering, projectiles, coins, towers
  js/anim.js          shared humanoid skeleton, 15-clip library, cross-fade blending, additive hit layers, LOD budget
  js/kit.js           original character kit (13 unit kinds), lean mid-LOD parts, far statues, cel-shaded materials
  js/render.js        instanced crowds on the skeleton, launcher (5 stages), towers (6 types × 5 levels), world, VFX, camera
  js/audio.js         synthesized SFX, layered crowd beds (4 intensity bands), stereo placement, adaptive music
  js/main.js          game flow, one-finger input, HUD, analytics hooks, debug tools, adaptive quality, ?bench=1
  dev/lineup.html     every unit kind cycling through every clip (art review)
  js/assets.js        production GLB character loader (part-by-part swap-in, validation, fallback)
  assets/manifest.json            points at the production character GLB (null = procedural)
  assets/template/kmob-parts-template.glb   every part on its pivot, for the artist to model over
  tests/kmob.test.js        109 sim/economy/save/structures/quality/edges/melee/pacing/soak  node tests/kmob.test.js
  tests/anim.test.js        24 animation/LOD tests                     node tests/anim.test.js
  tests/browser.test.js     57 rendering/assets/atlas/clips/tiers/bench/playtest/framing/occlusion/asset page  PW=<playwright> node tests/browser.test.js
  dev/assets.html     ?assets=1 character validation + procedural-vs-GLB preview
  docs/MILESTONE-5.md pre-art polish report (mixed melee, phone composition, occlusion, lighting, asset page)
  docs/MILESTONE-6.md mobile warfare rework (command tank, force field, support vehicles, ATTACK/DEFEND, collectors, weapon eras)
  tests/acceptance-shots.js the 20-shot acceptance set + 4 escalation shots, mobile + desktop
  tests/export-template.js  regenerates the artist template GLB
  docs/shots/         acceptance captures (git-ignored here; committed in KEEPITIL/thirteen games/kmob/docs/shots)
  docs/DEVICE-TEST.md how to measure on a real iPhone
  docs/CHARACTER-ASSET-SPEC.md   the contract for hand-modelled production characters
  docs/MILESTONE-3.md            status report for the production/visual milestone
  docs/MILESTONE-4.md            Track A report (atlas/material/clip pipeline, environment, lighting, tiers, bench, playtest)
  assets/characters/…            drop folders per unit (README lists the part names)
  vendor/post/                   bloom post-processing (loaded only on the HIGH tier when allowed)
```

**URL flags**
- `?debug=1`: FPS readout plus a panel to jump to minute 1, 5, 10, 30, 60 or 120, spawn 500/1000/2000-unit stress tests, and toggle bot or god mode.
- `?bench=1`: on-device benchmark → COPY RESULTS + recommended quality. See `docs/DEVICE-TEST.md`.
- `?playtest=1`: after each run, a summary + 3 yes/no questions + whether TRY AGAIN was actually pressed (and after how long) + COPY PLAYTEST.
- `?assets=1`: character asset validation page (drop a .glb to check it).
- `?quality=high|medium|low`: force a graphics tier (otherwise auto / benchmark recommendation). `?bloom=1` allows bloom on HIGH.
- `?autoplay=1`: start a run straight away.
- `?bot=1`: autopilot.
- `?revive=1`: show the revive hook. No ads are wired to it.

## What this milestone changed (visual production pass)

- **Characters:** the capsule placeholders are gone. There are 13 original models in one stylized miniature-warrior family:
  - Blue: soldier (round crested helmet), archer (hood + bow), knight (gold plume, plate armor, shield).
  - Red: grunt (horned helmet), imp, shield bearer (bucket helm), runner, archer, armored knight, bomber (goggles), shaman (hood + mask), brute (horned beast with axe), warlord (crowned boss), and the siege cannon.

  All of them are built from sculpted primitives: lathe bodies, oversized helmets, mitten hands, chunky boots and baked AO. They're drawn with a cel-shaded rim-lit material and faction-tinted per instance.
- **Animation:** every infantry kind shares one skeleton (hips, torso, head, two arms, two legs). Clips: idle, run, sprint, two light attacks, a heavy attack, aim, fire, cast, shield brace, cheer, deploy hop, and three deaths. Clips cross-fade, hit reactions are layered on top, and a stagger plays on heavy knockback. Each unit varies in phase, stride, lean, tempo and attack choice. Melee damage now lands on the frame the swing connects instead of at the start of the wind-up.
- **Crowd steering:** units spread out (soft separation), fan out to find open fighting room, and flow around towers. The front line compresses under knockback.
- **Animation LOD:** budgeted from a distance histogram. The closest ~120 units get the full skeleton (~1,300 triangles each). The next ~450 get the same skeleton with lean parts (~300–500 triangles). The rest are single-mesh statues that bob and lean. At 1,600 units that comes to 776k triangles and ~100 draw calls, against 6.9M before the LOD work. Crowd JavaScript runs ~5 ms per frame.
- **Launcher:** five clearly different stages:
  1. Small spawner.
  2. Long barrel with muzzle brake, troop-capsule hopper and lanterns.
  3. Twin barrels, six wheels, crystal reinforcement core.
  4. Armor skirts, front ram, shield plates.
  5. Triple barrels, crown, gold fins, second banner and a hover energy ring.

  Each stage-up plays a pop, burst and ring effect.
- **Towers:** all six types (arrow, cannon, frost, sniper, barracks, shield banner) have five visible levels. Height, crenellations, gold rings, side banners (level 3+), weapon size and count, and a level-5 halo all change. Every build or upgrade rises out of the ground part by part. Each type has its own motion: ballista reload pull-back, cannon barrel recoil, frost crystal pulse and orbiting shards, sniper slow tracking with a tracer line, barracks doors swinging open as troops deploy, and a waving banner with a pulsing aura. Soldiers inside the aura get a green ring.
- **Defense upgrades added:** tower damage, cannon splash, deep freeze, sniper crit, barracks speed and banner radius. Each card only appears if you own that tower type.
- **World:** foreground bushes and grass tufts along the fences, signposts and camp tents. Distant hills, snow peaks and blue-roofed castle silhouettes vary by biome. Lighting is brighter and the camera framing follows the concept: launcher at the bottom, the clash filling the upper half.
- **VFX:** sword-trail sparks, shield-hit sparks, elite and boss spawn rings, a pulsing red screen edge for boss and push warnings, tower construction bursts, launcher stage-up, and troops cheering after upgrades. Effect density scales down automatically as the crowd grows.
- **Audio:** crowd beds for marching, clash and roar, driven by combat intensity in four bands. Towers, bosses and launcher hits are stereo-placed, and coin pickups chain upward in pitch.
- **Early game:** the first clash comes at ~5 s, the first coin at ~10 s, the first upgrade at ~17–23 s and the second by ~35 s. Before this pass those were ~11 s, ~25 s, ~30 s and ~90 s.
- **Robustness:** losing the WebGL context pauses the run and it recovers when the context comes back. Tower models are disposed of on rebuild. Quality changes are applied before a frame draws, which fixed a one-frame black flash.

## Evidence

| | |
|---|---|
| Tests | **72 automated:** 34 sim/economy/save (including a 60-simulated-minute soak), 24 animation/LOD, 14 browser (kit, statues, launcher stages, tower levels, LOD tiers, no GPU leaks across 10 restarts, context loss/restore, 10-minute browser soak with bounded heap, no runtime errors). |
| Balance (bot) | A bot picking upgrades at random survives 4:41–9:27 across 8 seeds. This is not a human playtest. |
| Screenshots | `docs/shots/{mobile,desktop}-01…12`: opening, medium army, large army, ~1,000-unit battle, extreme swarm (~1,900), basic towers, max-level towers, upgrade selection, boss push, coin collection, upgraded launcher, results. |
| Device FPS | **Not measured on a real device.** Headless capture uses software GL, so its fps means nothing. Run `?bench=1` on an iPhone (see `docs/DEVICE-TEST.md`). |

## Not done yet

- **Physical iPhone testing:** none so far. FPS, frame-time variance, CPU, GPU, memory, thermals, battery and touch latency are all unmeasured. The `?bench=1` tool and the procedure are ready.
- **Human balancing:** not done. The targets are 3–7 minutes for a first-timer and 15+ for strong players, and they need real players to check.
- **Art:** the models are procedural originals, not hand-sculpted or rigged assets, and the animation is procedural rigid-bone, not skinned mocap. Side by side with the concept they clearly belong to the same family: blue/red, oversized helmets, horned red brutes, a blue/gold launcher. Up close they are simpler, and faces, materials and silhouettes have less detail. Closing that gap needs authored GLB characters with skinned or VAT animation. The kit and skeleton are set up so per-part meshes can be swapped for authored ones.
- **Later defense structures:** barricade, shield wall, healing post, beacon and mines are only planned. Tower health and armor upgrades are deferred because towers can't be damaged yet.
- **Online leaderboards, ads and revive, more meta:** deferred by the directive.
