# KAPP visual evidence (PR #151, 2026-11-10)

## What was rendered
`/earn/`, `/` and `/shop/` from the PR branch tree (and `/earn/`, `/`, `/shop/` from origin/main for comparison),
at 375x812 (mobile UA, touch emulation) and 1280x800 (desktop). Files kept here are scaled JPEGs (mobile 375 px wide,
desktop 800 px wide) to keep the folder small; the JSON reports hold the full measurements.

- `pr-*`: PR head 6d99ea7 (before the tap-area fix). `main-earn-*`: origin/main before.
- `prfix-shop-*`: /shop/ re-rendered with the breadcrumb tap-area fix.
- `pr-report.json`, `main-report.json`, `prfix-shop-report.json`: DOM probes (tabs, sections, rects, overflow, console, blocked hosts).

## How
Headless Chrome 157 driven over CDP from a script on the Nexus Mac, a fresh temp profile outside any repo (deleted after).
The repo was served by a tiny static server on 127.0.0.1. Network blocked: every request not to 127.0.0.1 failed with
BlockedByClient via CDP Fetch; WebSocket, EventSource and sendBeacon were stubbed. No prod, no sign-in, no secrets.

## Assertions and results (all passed)
- Five tabs in order Discover, Connect, Create, Culture, Earn; no Shop tab (bottom bar, desktop header, footer).
- Active tab is Earn on /earn/ and on /shop/.
- No horizontal scroll at 375 or 1280 on any of the three pages.
- /earn/ shows four sections in order (Partner, Merch, Apps & Games, Content Creators).
- No radio, playlist, competition or arcade content on /earn/.

## Defect found and fixed
The Shop breadcrumb links (Earn / Merch) measured 15 px tall, far under a 44 px tap target. Fix in `assets/css/shop-hub.css`:
`.crumbs a{display:inline-block;padding:15px 5px;margin:-15px -5px}`. Re-rendered /shop/: the links now measure
52x48 (Earn) and 65x48 (Merch) at 375, 51x48 and 64x48 at 1280. Visual position is unchanged; page height at 375 moved
from 2455 to 2451 px (4 px, inline-block line box) and is identical at 1280 (1970).

## Observations
- The Black Friday modal and the PWA install banner cover parts of some folds; they are site-wide and not part of this change.
- The partner rail on /earn/ is sparse because partner data comes from Supabase, which was blocked.
- Console errors in the reports are the blocked third-party hosts (Supabase, GTM, Clarity, SoundCloud, Google Fonts).

## NOT verified
Real devices, the iOS WKWebView app, Safari/WebKit rendering, real (unblocked) data and fonts, signed-in states, and other pages.
