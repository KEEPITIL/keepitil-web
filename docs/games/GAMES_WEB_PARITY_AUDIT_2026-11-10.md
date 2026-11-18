# KEEPITIL games on the web: parity and responsive audit (2026-11-10)

Queue item 7d (KMOB & games web), as relayed by KODE.

**Read-only.** I opened the live site in a browser at 375×812, 768×1024 and 1280×800. A script measured horizontal overflow, broken images, failed requests, off-screen buttons and small tap targets. Builds were compared with each game's repo through `gh`. Nothing was deployed or written.

The browser was not signed in. Saved games already in the browser (KMOB "Continue wave 4", KWARS "Wave 50") were left untouched: I never chose New Game.

Key: ✅ fine · ⚠️ works, defect noted · ❌ broken or missing.

## Builds: web compared with iOS and repos

| Game | Web (live) | iOS / repo | Parity |
|---|---|---|---|
| **KMOB** | `games/kmob` build `4b32a21cd556`, last updated 2026-10-24 (Daily Defense ranked) | iOS **1.0.0 build 18** = KMOB `main` `0d40e08` (2026-10-30). Its menu has **⚔ CRUSADES** (`js/crusades.js`: 30 missions, earned classes, 15 enemy types, victory sequence). | ❌ **Crusades missing on the web.** The live menu is Play · Daily Defense · Goals · Continue · Shop. Crusades exists only at `games/kmob-staging` (noindex, shows as 404). |
| **KWARS** | `games/kwars`, "v1.0.0 · build 90" | kingdom-wars `main` = Build 90 (B90 gem-security hotfix, 2026-10-23) | ✅ same build |
| **PokaSnap** | `/games/pokasnap/play/` = **2.2.0 build 22**, the *board* game ("Pudding", 40-space park, Race/Dance/Flight/Switch). Built 2026-10-03 from branch `feature/pokasnap-2.2-board-core`, not `main`. | iOS **1.5.0 build 13** = pokasnap `main` (2026-09-28): the *camera* pet game (missions, pose, snap) | ⚠️ **Two different games.** The web runs an unreleased newer generation; the iPhone runs the camera game. Product decision (see the PokaSnap 3.0 web decision packet). |
| **Thirteen** | `games/13`, prototype `bf99465` (2026-09-30), noindex | thirteen `main` `66e40c0` (2026-10-07): **93 commits ahead** of the web copy (cinematic overhaul). No iOS build. | ⚠️ The web copy is stale. keepitil-web draft #82 (Ashgrove prologue) and thirteen #5 (Episode One RC) wait on a decision. |

## Pages at each size

| Page | 375 | 768 | 1280 | Findings |
|---|---|---|---|---|
| `/games/` hub | ✅ | ✅ | ✅ | No overflow, no failed requests. **Only KMOB and KBEATS are linked as games.** KWARS, PokaSnap and Thirteen have no card, so they are reachable only by direct URL. Whether they should be listed is a decision. At 768 the KBEATS card's art area renders as an empty dark tile (out of scope; noted). |
| KMOB landing `/games/kmob/` | ✅ | ✅ | ✅ | No overflow, no failed requests, no console errors. Layout adapts: one column at 375; hero and art side by side at 1280. |
| KMOB in game (menu) | ✅ | – | ✅ | The menu card is centred over the battlefield at both sizes. No off-screen or under-32 px buttons. |
| KWARS menu `/games/kwars/` | ✅ | ✅ | ✅ | No overflow or errors. At 768 and 1280 the menu stays a 384 px column (by design). War mode shows Continue / New Game / Back at 375. |
| PokaSnap landing `/games/pokasnap/` | ❌ | ❌ | ❌ | **Broken at every size.** It imports `./play/js/render/pet.js`, `data/pets.js`, `data/missions.js` and `render/items.js`, which were removed when `/play` became the 2.2 board game: **4 × 404**. As a result:<ul><li>the hero canvas is an empty pink gradient;</li><li>"Meet the pets", "Photo missions" and "Customize your pet" are empty;</li><li>the copy ("pose your pet with your camera") describes the iOS camera game, not the board game behind every Play button.</li></ul> |
| PokaSnap play `/games/pokasnap/play/` | ✅ | ✅ | ✅ | Board, HUD and bottom bar fit at all three sizes, with no overflow or failed requests. At 768 the app column is 360 px wide over the full-width board (by design). |
| Thirteen `/games/13/` | ⚠️ | – | ✅ | Title and "Tap to begin" fit. The **first-viewing intro is unskippable** (by design, `cinema.js`). **In portrait at 375 the 3-D scene is letterboxed to roughly 45% of the screen height, with no "rotate your phone" hint.** At 1280 it fills the frame. |
| Stale builds: kwars1/2/3, kwars-build89, kmob-staging, kbeats-preview, pokasnap/test | – | – | – | All are noindex. kwars1 redirects ("has moved"); the others serve the 404 page or a noindex test page. ✅ |

## Plan, smallest first (drafts only; keepitil-web `main` is the live site, so any merge is a deploy)

1. **PokaSnap landing: stop the 404s and empty boxes** (keepitil-web, one file).
   - Remove the module script that imports deleted files.
   - The hero shows the PokaSnap icon instead of an empty canvas.
   - The three sections that only script could fill are removed.
   - The copy is left as it is; which game it should describe is a decision (below).
2. **Thirteen in portrait: a "turn your phone sideways" hint.** It is small, but the web copy is 93 commits behind its repo. Better done in `KEEPITIL/thirteen` and shipped with the next Thirteen web build than patched into the stale copy.
3. **KMOB web = iOS build 18 (Crusades).** Publish KMOB `main` to `games/kmob` with the repo's own `scripts/publish.js`, as a draft keepitil-web PR. Merging it is the deploy, so it needs Joe's go.

## Decisions for Muse / Echo / Joe
- **(a) PokaSnap:** should the web landing describe the board game that `/play` runs, or should `/play` go back to the camera game the iPhone has? Until then, item 1 only removes what is broken.
- **(b) Games hub:** list KWARS (web build = iOS build 90) and PokaSnap?
- **(c) KMOB:** ship Crusades on the web (item 3)?
- **(d) Thirteen:** which build goes on the web (#82 or thirteen #5)?
