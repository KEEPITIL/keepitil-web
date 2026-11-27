# 15A test plan

## A. Proven offline (this PR)
`node --test assets/js/door-scanner.test.mjs`: 31 tests, real `door.html` + real `kil-door-scanner.js` in jsdom with a fake Supabase client, fake `fetch`, fake `BarcodeDetector`/`getUserMedia`. Covers: payload table (raw, `KIL-`, `kil-`, whitespace, double prefix, URL-form, garbage, empty, oversize); the RPC call (URL, method, user token as bearer, anon key only as `apikey`, body keys = `p_qr_token`); no session -> redirect before any RPC; code stripped from URL; each result code -> state/tone/focus/aria-live; unknown/garbage server replies -> error; 401/403/42501 -> sign-in state with camera stopped and server message not shown; session lost mid-use -> no network call; network failure/500/502 never show Admitted and retry works; duplicate scans debounced, in-flight submits ignored; evil response with buyer/email/handle/phone/name/token/order keys never reaches DOM text or attributes; hostile event title rendered as text; camera scan -> one RPC, loop paused while result shown, resumes on "Scan next", still debounced; stream stopped on `pagehide`, hidden visibility, Stop, sign-out; unsupported/denied/no-camera paths; no web storage/cookies/console; no third-party script, noindex, no zoom lock, 44px-plus targets, input has no `name`; door.html is referenced by nothing else; adapter copy byte-identical to PR #137.

Negative controls (each is a passing test that asserts the guard fails on the bad variant): the bug-#139 style anon-key bearer fails the token assertion; a leaky adapter and a renderer that prints `buyer` both fail the no-contact assertion.

Also run once by hand: `node --test db/proposed/12a-door-hardening/adapter/door-scan-adapter.test.mjs` (the adapter's own 10 tests; unchanged).

Headless Chrome (real browser engine, real ES-module import, real layout) at 375px and 1280px with a mocked session and RPC: `evidence/` (+ `harness-report.json`: states reached, no horizontal scroll at 375, `buyer`/phone strings absent from the page HTML).

## B. NOT proven offline: real-device plan (needs Joe's OK)
Preconditions: 12A packs applied and verified on the target database (see ENABLE-CHECKLIST), a test-mode event owned by the tester's handle and a paid test-mode order created by an approved process (Stripe test mode, never a live card), page deployed to a non-indexed preview or served locally over HTTPS (camera needs a secure context), the tester signed in as the event owner.

| # | Device | Step | Pass |
|---|---|---|---|
| 1 | iPhone Safari | open `/door.html` signed out | lands on `/apply?next=/door.html`; after sign-in returns to the scanner |
| 2 | iPhone Safari | Start camera | permission sheet appears; if `BarcodeDetector` is missing the page says so and manual entry works (**expected on current iOS Safari; this is the open decision D1**) |
| 3 | Android Chrome | scan a ticket QR from `/tickets` on another phone | one "Admitted"; camera pauses; Scan next resumes |
| 4 | either | scan the same ticket again | "Already admitted" + first-scan time (server), no second admission |
| 5 | either | scan an unpaid / refunded order's code | "Not paid" |
| 6 | either | sign in as a non-owner, scan | "Not your event" |
| 7 | either | scan a random QR (e.g. a URL) | "Not a KEEPITIL ticket", and the network panel shows NO request |
| 8 | either | airplane mode, scan | "Could not check this ticket", never Admitted; back online, Try again -> admitted once |
| 9 | either | background the app / lock screen while camera on | camera indicator off (stream stopped) |
| 10 | either | Network panel / proxy | `Authorization: Bearer` is the user JWT, never the publishable key; body only `p_qr_token`; no code in any URL |
| 11 | native app (only after the bundle patch, see NATIVE-APP-PATCH-SPEC) | repeat 2-8 | camera permission string and WKWebView capture work |
| 12 | VoiceOver / TalkBack | scan | result announced once; focus on the result region |

Evidence to capture (filed under the evidence protocol): screenshots of each state on the real device, a redacted HAR or proxy log of one scan (headers only), the DB rows before/after (`event_orders.checked_in_at`) read by an approved process, the deployed response `Content-Type` of `/assets/js/kil-door-scan-adapter.mjs` (must be a JavaScript type, else the module import fails and the page shows "The scanner could not load").
