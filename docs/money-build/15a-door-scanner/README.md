# 15A: owner-authorized door scanner (DRAFT, stacked on #139; nothing deployed, nothing linked)

The web page and network path for the 12A "real caller / auth contract" (Atlas I08, Nova: "authenticated owner route selected; no self-link scanner accepted"). It calls `public.event_checkin_scan(p_qr_token)` as the signed-in user and shows only token-free, no-contact results.

| file | what |
|---|---|
| `door.html` | standalone scanner page. `noindex`, not in the sitemap, **not linked from any page, nav or script** (a test enforces it). No third-party scripts. |
| `assets/js/kil-door-scanner.js` | logic: payload parsing, the RPC call, the scan state machine, the camera wrapper, rendering, `boot()`. No `localStorage`, no `innerHTML`, no `console`. |
| `assets/js/kil-door-scan-adapter.mjs` | **byte-identical copy** of `db/proposed/12a-door-hardening/adapter/door-scan-adapter.mjs` (PR #137). `db/` is excluded from the Pages artifact, so the page cannot import from there; a test fails if the two copies differ. |
| `assets/js/door-scanner.test.mjs` | 31 tests (jsdom, real `door.html`), including 3 negative controls. |
| `ENABLE-CHECKLIST.md` | what must be true before this is merged, linked, or used at a door |
| `TEST-PLAN.md` | offline proof vs the real-device test (needs Joe) and the evidence to capture |
| `NATIVE-APP-PATCH-SPEC.md` | exact keepitil-app files/guards and a proposed patch (not applied; keepitil-app untouched) |
| `evidence/` | headless-Chrome screenshots at 375px and 1280px with a MOCKED session and RPC |

Behaviour in one paragraph: no session -> `location.replace('/apply?next=%2Fdoor.html')` before any RPC. Otherwise the owner scans with the camera (BarcodeDetector, when the browser has it) or types the code. Each submit sends exactly one `POST /rest/v1/rpc/event_checkin_scan` with `Authorization: Bearer <the user's access token>`, `apikey: <publishable key>`, body `{"p_qr_token": "<normalised code>"}` (the bug in #139 was the anon key as bearer). The result is mapped by the 12A adapter to one of: Admitted, Already admitted, Not paid, Not your event, Not a KEEPITIL ticket, No code scanned, Sign in to scan, or "Could not check this ticket" (network/server error: never shown as admitted, retry is safe because the server answers `already_used` for a repeat). While a result is on screen the camera loop sends nothing; "Scan next ticket" resumes. The same code scanned again within 4 s is ignored client-side (convenience only: **the server is the real guard**). The code is never put in the URL, history, storage, console or DOM; a code found in the URL is stripped.

Design choices worth knowing:
* The scanner does **not** load `keepitil-shell.js` / `keepitil-ai.js` (no bottom nav, no AI widget over a scanner). Header is minimal with a Dashboard link. Fonts are the system stack (no Google Fonts request from a door device).
* Local pre-check: payloads with inner whitespace/control characters, a `://` or > 128 chars are refused without a request. URL-form payloads are **not** accepted: the ticket QR encodes the raw 32-hex token or `KIL-<token>` only (`kil-ticket-qr.js`, `tickets.html:159`; CALLER-CONTRACT does not mention URLs).
* Client-side token shape (32 hex) is deliberately **not** enforced, so a legacy token format would still reach the server (which answers `invalid`).
* The page reads the session with the site's normal Supabase client (`detectSessionInUrl:false`), which keeps its own session where the other pages keep it. This page adds no storage of its own.

Not wired / gates: see `ENABLE-CHECKLIST.md`. `dashboard.html:326` still renders a "Door scanner" link to `/dashboard` (a self-link). Pointing it at `/door.html` is a separate, later change (dashboard.html is not part of this PR).

Run: `npm test` or `node --test assets/js/door-scanner.test.mjs` (needs `jsdom`, already a devDependency).

Not verified: a real camera, the real RPC/database, Safari/iOS behaviour, the deployed Pages MIME type for the `.mjs` adapter import (see TEST-PLAN), VoiceOver/TalkBack.
