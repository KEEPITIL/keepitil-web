# KMOB milestone 3: production visuals and device proof (status)

## Done in this milestone

- **Production character pipeline.** You chose to supply authored GLB characters. This environment has no modelling tools, and its network can't reach asset stores. The pipeline is built:
  - **Loader** (`js/assets.js`) with part-by-part swap-in. Each part is validated (geometry, finite vertices, triangle budget), and anything missing or broken keeps its procedural fallback. The full report is in `KM.assetReport`.
  - **Artist template** (`assets/template/kmob-parts-template.glb`) with every part named on its pivot.
  - **Spec** in `docs/CHARACTER-ASSET-SPEC.md`.
  - **Tests:** a round-trip through the real GLTFLoader; budget, empty and unknown parts; and 404 and corrupt-file fallback.
- **Tower damage system:**
  - Towers have HP and armor, and enemies that reach them attack them.
  - Damaged towers show a health bar, a hit shake, smoke and sparks.
  - Destroyed towers collapse with debris. The slot can then be rebuilt.
  - Upgrading a tower fully repairs it, and towers regenerate out of combat.
  - New cards: TOWER HEALTH and TOWER ARMOR.
- **Barricade:**
  - Four segments at a fixed line ahead of the launcher, built two at a time.
  - Slows enemies, has HP, can be destroyed.
  - Once complete, further cards reinforce it.
- **Shield wall:**
  - Three durable segments closer in.
  - Blocks enemies until they break it, with heavier armor and a stronger look.
- **Coins** always face the camera with a wobble of at most 35°, so they're never seen edge-on as streaks. They have a rim, a star face and a pulse. A test checks orientation, which doesn't depend on the adaptive-quality level.
- **Phone-safe camera:** the camera solves, four times a second, for the closest distance that keeps on screen:
  - the launcher, built towers and wall lines;
  - the central lane;
  - the incoming threat zone, below the HUD.

  Tests cover 375×667, 390×844, 430×932 and 1440×900 with all six towers, both wall lines, and the launcher at both lane edges.
- **Animation content pass:**
  - planted-foot gait: a linear stance phase and an eased swing;
  - hip sway and twist, with shoulders countering and arms trailing;
  - attacks with anticipation, lunge, overshoot and recovery;
  - harder staggers;
  - deaths that bounce and settle;
  - forward or back lean on acceleration and braking.
- **Escalation:**
  - era 1+: enemies get iron spiked pauldrons;
  - era 2+: horns on the light infantry;
  - era 3+: glowing eyes and angry brows;
  - a war haze warms the light and fog over the first 40 minutes, with embers from about minute 12;
  - stone gates over the road at each biome boundary.

  The minute 1 / 5 / 15 / 30 captures show the escalation.
- **Environment:** banners on both sides of every chunk, rock clusters, and the biome gates.
- **Upgrade feedback:** a launcher stage's new parts snap in with an overshoot and rise. Tower builds and upgrades rise piece by piece, and walls rise into place.
- **Camera:** about 50° pitch and a 50° FOV, closer to the concept's framing. The lane edges may crop the way they do in the concept, while gameplay objects stay framed.

## Evidence

- **Tests:** 48 core + 24 animation + 27 browser = **99 automated, all passing.**
- **Performance (headless, triangle and draw-call budget):** 1,600 units = 743k triangles and 104 draw calls, with crowd JavaScript at ~4 ms per frame. That's no regression from the 776k / ~100 / ~5 ms baseline.
- **Screenshots:** `docs/shots/{mobile,desktop}-01…20` and `E-minute-01/05/15/30`, plus `side-by-side-*.png` against the concept. They're published on the KEEPITIL/thirteen archive branch.

## Not done, and why

- **Production characters are not in yet.** They're waiting on the GLB files you're supplying. The current characters are still the code-built kit, now as the fallback tier.
- **No physical-device results.** This session has no phone. Run `https://keepitil.com/games/kmob/?bench=1` on the iPhone and send back the copied JSON, following the steps in `docs/DEVICE-TEST.md`. No real-device video exists for the same reason.
- **No human playtests.** These need people: a first-time player, someone after 3 runs and someone after 10. Watch whether they press Try Again unprompted.
- **Side-by-side gate: does NOT pass yet.** Army density, faction colours, launcher, towers and UI are in the concept's world. The concept still differs in:
  - hand-painted detailed characters (blocked on the GLB delivery);
  - warmer lighting with glow and bloom (post-processing is deferred until device numbers exist);
  - richer close environment edges: cliffs and water hugging the road.
