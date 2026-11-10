# KAPP five tabs + Earn: code map (verified against keepitil-web main)

Spec: Atlas, "KEEPITIL: five tabs, Earn programs, Culture, Create and California Discover" (Nov 10, 2026),
read in full (sections 0 through 9). Verified against `origin/main` = `23d718a099608c7fae243b3077d1f10ebbcb2fa7`,
which is the same commit the spec pinned. **Drift: none** (0 commits between the pin and main at the time of
this slice; every line number the spec cites for sections 1 and 2 matched main before the edits).
Line numbers below are the BEFORE numbers (main) with the AFTER state in the last column.

Status: this slice is DRAFT. Nothing here has been run (tests, builds, browser): see the PR body.

## Navigation (section 1)

| Surface | main file:line | Outcome in this slice |
|---|---|---|
| Destination list (one source) | keepitil-shell.js:594-613 (`var DESTINATIONS=[`); Shop row 607-608; Earn row 611-612 | Shop row removed. Earn `match` widened to also match `/shop` at any depth. Five rows remain. |
| Bottom bar render | keepitil-shell.js:956 (`bn.innerHTML=DESTINATIONS.map`) | Unchanged code; renders five. |
| Active state (movable after mount) | keepitil-shell.js:948-955 (`__kilBnavActive`, indexes DESTINATIONS by position against `#kil-bnav > a`) | Unchanged; render and indexing still share one list, so no mis-highlight. |
| Desktop header + header menu | keepitil-shell.js:729-744 (`namedDestinations()` at 717) | Unchanged code; renders four words plus the DISCOVER wordmark. |
| Footer sitemap | keepitil-shell.js:784 | Unchanged list, plus one secondary link `Merch shop` (class `v3-foot-sub`) to `/shop/`. |
| Destination rail (opt-in) | keepitil-shell.js:692-713 (`KIL_DESTINATIONS`, `renderDestinationRail`) | Unchanged; no page currently mounts it (index.html:1851 comment). |
| 404 chooser links | keepitil-shell.js:678 | `['/shop/','Shop']` replaced by `['/earn/','Earn']`. |
| Equal-width phone slots | keepitil-shell.js:1424-1430 (`#kil-bnav a{flex:1 1 0;...}`) | Unchanged: flex-based, no six-column assumption. |
| Static / no-JS nav copies | index.html:1822,1830; earn/index.html:450; culture/index.html:620; create/index.html:175; shop/index.html:96; connect/index.html:520,525 | SHOP anchor removed in all. Inventory found 26 copies in 21 files (also apply, community-guidelines, dashboard, privacy, profile, refund, reset-password, services/index, settings, signup, support/index, terms, ticket-terms, tickets, venue). The shell removes `#main-nav` at keepitil-shell.js:729, so HTML-only edits would not change runtime nav; both are done. |
| Shop page | shop/index.html:96 (static nav), 100-135 (Merch 108, For Artists 122) | Static nav fixed; kicker line replaced by breadcrumb `Earn / Merch / Shop` (links to /earn/ and /earn/#merch). Shopify links untouched. |

## Earn (section 2), earn/index.html on main (1823 lines) -> after (834 lines)

| Item | main lines | After |
|---|---|---|
| Radio opt-in `data-radio="page"` | 2 | `data-radio="off"`; shell now honours `off` (keepitil-shell.js RADIO_OFF, next to RADIO_ALLOWED at main:248) on BOTH breakpoints |
| Title / description / og / twitter advertise Radio, Playlists | 6-7, 422-426 | Rewritten to the four programs |
| Stats row (Stations / Competitions / Games counters) | 459-466 | Removed (no fabricated counts) |
| Filter bar (All/Radio/Playlists/Create/Earn + station search) | 471-485 | Four programs + All, program search; ids `radControls radSeg radQ radCount` kept so the shared coarse-pointer CSS and `connect-earn-responsive.test.mjs` still apply |
| "How you earn" guarantees | 501-567 | Removed |
| Radio section | 575-593 | Removed |
| Playlists section | 596-622 | Removed |
| Competition rail `#create` | 626-629 | Removed |
| Old Earn section `#earn` | 635-658 | Becomes `#partner` (affiliate rail + Kit tile kept, same ids) |
| Arcade `#games` | 663-667 | Becomes `#apps-games` (contribution programme, no catalogue) |
| Radio include | 947 | Removed |
| Station config fetch / `renderStations` | 1105-1159 | Removed |
| Playlist path (`PL_API`, `renderPls`) | 1243-1260 | Removed |
| Dormant airplay submission `submitAirplay` | 1295 (spec: ~1306) | Removed (table and rows untouched) |
| Competition fetch (`vs_competitions`) | 1363-1378 | Removed |
| Playlist component (`keepitil-playlist-submit.js` + mount) | 1792-1815 | Removed; tuner loader removed too |
| Pager (`keepitil-pager.js` + Radio pager script), mobile radio enhancer, radio/search swap | 1631-1716, 874-942, 1718-1789 | Removed. Only the `body.rad-m` class toggle is kept because the retained mobile CSS keys off it. |
| Info overlay / `hyeOv` / `radScroll` / `vrGoSub` | 684-688, 1546-1629 | Removed (no nodes left for them to touch). CSS for `.hye-info` is kept only because an existing test pins it. |
| Partner rail painter (`KIL_SPONSORS`) | ~1185-1215 | Kept verbatim in a small script |

Dead CSS left on purpose (selectors for removed ids such as `#stationGrid`, `#krBar`, `#hyeOv`): removing it would
break `assets/js/connect-earn-responsive.test.mjs` assertions that read the CSS text. Follow-up cleanup, with that test updated.

New section ids (the spec gives names, not ids; these are this slice's choice): `partner`, `merch`, `apps-games`, `creators`
(each also carries `data-program`). Legacy hashes handled in the page script: `#earn` -> `#partner`, `#games` -> `#apps-games`,
`#stations #playlists #create #howyouearn` -> page top.

## Not touched in this slice (spec sections 3-7)

Create (create/index.html:180-191, vs-app.js:584/1304-1316/1374/1622/1857, shell quick-create 840-861), Culture connector
(culture/index.html:688, 1173-1184, 1950-2008, 2185-2222, 2349-2443, 2444-2593), Discover filter anchor (index.html:1886-1905),
data model SQL, Stripe. See `PLAN-NEXT-SLICES.md`.
