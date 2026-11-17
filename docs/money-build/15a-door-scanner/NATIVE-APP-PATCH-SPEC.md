# 15A: what the native app needs for `/door.html` (SPEC ONLY; keepitil-app is not edited)

Read-only against `~/work/keepitil-app` at `88b5e91` (branch `fix/carry-16-into-stack`; the payments guards live on `origin/app/payments-off`, PR #42, per the 14A notes).

## Files and guards involved
| item | where | today | needed for the door page |
|---|---|---|---|
| bundle seed list | `scripts/build-bundle.mjs:17-20` `SEEDS` (already lists `dashboard.html`, `tickets.html`) | `door.html` is not a seed, and nothing links to it, so it is not bundled | add `'door.html'` to `SEEDS`. The crawler then also pulls `assets/js/kil-door-scanner.js`, `assets/js/kil-door-scan-adapter.mjs` (the `.mjs` is reached through a dynamic `import()` string, which the crawler may NOT follow: add `assets/js/kil-door-scan-adapter.mjs` AND `assets/js/vendor/jsqr/jsQR.js` to the "runtime paths" block near `build-bundle.mjs:61-64`, or list them as seeds) |
| clean-URL map | `app-src/kil-native.js:25` `CLEAN` | `/door` would not resolve to `door.html` | add `"door"` (so `/door` and `/door.html` both open the bundled page) |
| **vendored decoder path (15B)** | `assets/js/vendor/jsqr/jsQR.js` | loaded at runtime by `kil-door-scanner.js` through a dynamically created `<script>` (a string path the bundle crawler cannot follow) | the native bundle's allowed/runtime paths MUST include `assets/js/vendor/jsqr/jsQR.js` (add it next to the `.mjs` in the runtime block, with the `?v=` query ignored); `LICENSE` and `README.md` in that folder should ship too (Apache-2.0 notice). The test `door-bundle` below must assert the file exists in `www/` and its SHA-256 equals the web one. WKWebView is not expected to have `BarcodeDetector`, so in the native shell the jsQR path is the one that runs; the camera and `playsinline` requirements below apply |
| payments/commerce guards | `FLAGS.paymentsInApp=false`, `payBlocked()`, `COMMERCE_*`, `NO_PAYMENT_PATCHES`, `tests/payments-off.test.mjs`, `tests/commerce-links.test.mjs` | none match `door.html` (no Stripe host, no `create-checkout`, no commerce anchor). The door page calls only `event_checkin_scan` on the Supabase REST host | nothing to relax. Add a test that the bundled `door.html` contains no `stripe.com`, no `create-checkout`, and calls `event_checkin_scan` only |
| network allow-list | `capacitor.config.json` `server.allowNavigation` | the page makes a `fetch` (XHR) to `ovmqtzjfpzrbzrlkxwgw.supabase.co`, same as the existing pages; `allowNavigation` only governs navigation | no change expected; confirm in TestFlight |
| camera permission string | `ios/App/App/Info.plist` `NSCameraUsageDescription` = "KEEPITIL uses the camera when you choose to take a photo for your profile, an event or a post." | App Review checks the string matches use | reword to include scanning tickets, e.g. "...to take a photo, or to scan a ticket QR code at the door." |
| WKWebView capture | Capacitor iOS | `getUserMedia` inside the capacitor:// scheme needs a secure context and (iOS 15+) the WebView capture prompt; BarcodeDetector is not expected in WKWebView | with 15B the vendored jsQR decodes frames from `getUserMedia` in the WebView (needs the capture permission and `playsinline`, both already set); a Capacitor barcode plugin remains an option if WebView capture proves poor on a real device |
| review notes | `docs/release/REVIEW_ACCOUNT.md`, `docs/SUBMIT-READINESS.md` | describe no purchasing | add one line: organizers can check in tickets for their own events (no purchase) |
| older bundled copies | `www/*` is generated; do not hand-edit | n/a | rebuild with `scripts/build-bundle.mjs` after the seed change |

## Proposed patch (illustrative, against the files above)
```diff
--- a/scripts/build-bundle.mjs
+++ b/scripts/build-bundle.mjs
@@ SEEDS = [
-  'tickets.html', 'ticket-terms.html', 'submit-event.html', 'create-event.html', 'dashboard.html', 'offline.html',
+  'tickets.html', 'ticket-terms.html', 'submit-event.html', 'create-event.html', 'dashboard.html', 'door.html', 'offline.html',
@@ (runtime paths block)
+  add('assets/js/kil-door-scan-adapter.mjs', 'runtime');   // reached via import(), invisible to the crawl
+  add('assets/js/vendor/jsqr/jsQR.js', 'runtime');         // 15B: lazy <script>, invisible to the crawl (also copy LICENSE + README.md)
--- a/app-src/kil-native.js
+++ b/app-src/kil-native.js
-  var CLEAN = ["apply", "community-guidelines", "create-event", "dashboard", "event", ...
+  var CLEAN = ["apply", "community-guidelines", "create-event", "dashboard", "door", "event", ...
--- a/ios/App/App/Info.plist
-<string>KEEPITIL uses the camera when you choose to take a photo for your profile, an event or a post.</string>
+<string>KEEPITIL uses the camera when you choose to take a photo for your profile, an event or a post, or to scan a ticket QR code at the door.</string>
```
plus a `tests/door-bundle.test.mjs` asserting: `www/door.html` exists, `www/assets/js/kil-door-scan-adapter.mjs` exists, `www/assets/js/vendor/jsqr/jsQR.js` exists with the same SHA-256 as the web copy, no `stripe.com`/`create-checkout` in `www/door.html`, the file is not reachable from any commerce-stripped anchor, and `payments-off` / `commerce-links` still pass unchanged.

Order: web page deployed and verified on Safari/Chrome first (website-first rule), then this app PR, then TestFlight evidence (TEST-PLAN rows 11-12). Nothing here is applied.
