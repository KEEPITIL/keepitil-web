# KMOB · Endless War

A one-finger endless army game. You drag the launcher, soldiers deploy on their own, enemies keep coming, and the score is how long you survive. It runs in the browser on desktop and mobile with three.js r128. The target URL is `keepitil.com/games/kmob/`.

```
games/kmob/
  index.html        UI, HUD, upgrade cards, results, shop, settings (one page, no build step)
  js/core.js        pure logic: difficulty curves, enemy roster, upgrades, towers, shop, save data, chunk plan
  js/sim.js         headless simulation: army spawner, enemy director, combat grid, projectiles, coins, towers, launcher
  js/render.js      three.js: instanced crowds, streamed battlefield, launcher/tower models, coins, particles, camera
  js/audio.js       synthesized WebAudio SFX + adaptive music, voice-limited per category; haptics helper
  js/main.js        game flow, input, HUD, analytics hooks, debug tools, adaptive quality
  vendor/three.min.js  (r128, same build as /web/vendor)
  tests/kmob.test.js   34 headless tests (node tests/kmob.test.js)
  tests/shots.js       screenshot capture (Playwright + SwiftShader)
  docs/shots/          captures: early, medium, large army, swarm, upgrade, results (mobile + desktop)
```

Run it locally with `npx http-server -p 8137 games/kmob`, then open `http://127.0.0.1:8137/`.
URL flags:
- `?debug=1` shows the FPS readout and the debug panel. The panel can jump to minute 1, 5, 10, 30, 60 or 120 with a comparable build, spawn stress tests of 500, 1000 or 2000 units, and toggle the bot, god mode and +500 coins.
- `?autoplay=1` skips the title screen.
- `?bot=1` plays the game automatically.
- `?revive=1` shows the one-time revive button. It is a hook for a future rewarded ad.

## How it plays

- **Input:** the only control is dragging, which moves the launcher. Drag left and right freely. Drag up and down for a small forward or back offset. The game never shows an attack button, ability tray or joystick. On desktop the arrow keys and WASD also move the launcher.
- **Loop:** soldiers stream out of the launcher and march forward. Enemy formations come the other way. Dead enemies drop coins that stay on the ground for 22 seconds. The launcher's pickup ring has to touch a coin to collect it, so you have to move toward the fight to earn, which is where the risk comes from. Once you have enough coins, three upgrade cards appear. The game drops to 35% speed while they are up; it never fully pauses. Tap one card, or skip.
- **Upgrades (in-run):** army size, deploy speed, damage, soldier health, armor, attack speed, march speed, coin magnet, crit chance, archers, knights and launcher armor. The defense cards build or upgrade towers and raise tower fire rate or range.
- **Visible growth:** soldiers get gold shoulder pads with armor, bigger swords with damage, and a slightly larger body with health. The launcher goes through five levels: barrels go from 1 to 2 to 3, then it gains ammo crates, a crystal core, side armor, and finally a crown and a second banner.
- **Towers:** these support the army. They are not a separate tower-defense mode. They auto-place into slots beside the lane that move forward with the front. Two slots are open at the start, four from minute 3, and six from minute 8. The six types are Arrow, Cannon (splash), Frost (slow), Sniper (targets the toughest enemy), Barracks (spawns soldiers) and Shield Banner (armor aura). Each type has five levels with visible changes: more height, gold rings, and side banners from level 3.
- **Enemies:** eleven types unlock over time: grunt, imp swarm, shield, runner, archer, armored knight, horned brute (elite), bomber, siege cannon, shaman (heals), and the warlord boss. Each spawn uses one of 13 formations: line, wedge, column, blob, swarm, flank, shield wall, ranged backline, elite squad, siege, mixed, massive push and boss. Pushes and bosses get a 3–4 second warning banner, and elites have a red ring under them.
- **Endless:** there are no levels. 24 m ground chunks stream in and out, and six biomes cycle every ~11 minutes (meadow, autumn, desert, snow, ashlands, crystal), with blended transitions. Chunk types are field, forest, ruins, bridge and canyon. Enemy eras change tint and armor every 8 minutes. The difficulty curves never cap. When the enemy count hits 1,700, the extra spawn budget makes enemies tougher instead of adding more bodies.
- **Death and restart:** the run ends when the launcher's HP reaches 0. It loses HP to enemy hits and to enemies that get past the defensive line. The results screen shows survival time, enemies defeated, coins, peak army, distance, tokens earned, and whether you set a personal best. **TRY AGAIN** starts a new run instantly, with no loading and no ads.
- **Meta:** tokens are rare and stay between runs (√(time/40s) + kills/1500 per run). The Gift Shop sells three small permanent bonuses, each with 3 levels, and five launcher skins. **Competitive mode** turns off all permanent bonuses and the revive, and keeps its own best time. The game tracks personal best, daily best and weekly best. Save data is versioned, validated and backed up, and a corrupt save falls back to the backup.
- **Analytics hooks:** `KM.analytics.track` and `addSink`. The events are run_start, run_end (with survival time, death reason, peak army, coins, upgrades, death position and whether revive was used), upgrades_selected, upgrade_skipped, enemy_type_death, personal_best, shop_open, item_purchase and revive_used. No analytics provider is wired up yet.

## Evidence (first playable build)

| | |
|---|---|
| Tests | `node tests/kmob.test.js`: **34 passed, 0 failed**. They cover: difficulty never decreases over 6 h and stays finite at extreme values; upgrade values; coins never go negative; offer rules; director compositions are valid over 20 simulated minutes; death fires once; restart fully resets the run; tokens survive a restart and coins don't; corrupt-save fallback; no pool leaks over 5 runs; chunk streaming has no gaps across 400 km; and a 60-simulated-minute soak stays bounded (peak 1,905 active entities, 12,267 kills, enemy cap held). |
| Balance | A bot that picks upgrades at random survives **4:47–8:01** across 8 seeded runs. A human choosing upgrades should do better. This is a starting point and needs real playtesting. |
| Sim cost (Node) | ~0.2 ms per step early, ~0.5 ms at 300 enemies, ~2 ms at the 1,700-enemy cap. |
| Max units tested | **~1,290 live units rendered** (stress 1000 at minute 10) on mobile (430×932) and desktop (1440×900) viewports. |
| FPS | Measured only in **headless Chromium with software rendering (SwiftShader)**, where it runs at 11–18 fps. That number says nothing about real devices. **No physical-device testing has been done.** |
| Screenshots | `docs/shots/{mobile,desktop}-{1-early,2-medium,3-large,4-swarm,5-upgrade,6-results}.png` |

## Not done yet

- **Physical devices:** the game has not run on a real iPhone or Android device. Still untested there: touch feel, thermals, battery, 60 fps, and the browser-side 60-minute memory soak. Adaptive quality lowers the pixel ratio below 48 fps and then turns off shadows, but it has not been tuned on hardware.
- **Visual bar:** the characters are original stylized procedural models built to match the blue-vs-red concept art: round armored soldiers, horned red elites and a gold-trimmed launcher. They read well in crowds, but they are not hand-modelled, rigged or animated assets. Animation is procedural: bob, leg swing, weapon swing, flinch, a fall-over death, a deploy hop and staggered timing. A side-by-side review against Mob Control would rate this as clean, but not yet App Store premium. Getting there needs authored models, skinned or vertex-animated (VAT) run and attack cycles, better VFX textures, and post-processing such as bloom and color grading.
- **Fonts:** Lilita One and Nunito load from Google Fonts. The capture sandbox couldn't reach them, so the screenshots show the fallback fonts.
- **Network leaderboards:** not built. The architecture is in place: bests are stored per day and week, and the competitive mode gives equal starts. The revive is a placeholder with no rewarded-ad SDK behind it.
- **Deployment:** the live site is published from the KEEPITIL/keepitil-web and keepitil.github.io repos, which this change doesn't touch. To deploy, copy `games/kmob/` to `games/kmob/` in those repos.
- **Native builds:** none yet. The Capacitor wrapper in this repo ships `/web` (13 Anchors), and KMOB has not been added to it.
