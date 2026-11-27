# keepitil.com security headers: proposed Cloudflare rule (PROPOSAL ONLY, NOT APPLIED)

**Status: proposal. Nothing in this file has been applied to Cloudflare.** Applying it needs Grok's written GO first (live infrastructure). Merging the PR that adds this file does not apply it.

Why: GitHub Pages cannot set response headers. Cloudflare sits in front (`server: cloudflare`), so a Transform Rule is the only place.

## What is live today (curl -I https://keepitil.com/, 2026-11-24)
| Header | Today |
| --- | --- |
| `Strict-Transport-Security` | `max-age=31556952` (present) |
| `X-Frame-Options` | `SAMEORIGIN` (present) |
| `Content-Security-Policy` | `frame-ancestors 'self'` only (present) |
| `Cross-Origin-Opener-Policy` | `same-origin` (present) |
| `X-Content-Type-Options` | **absent** |
| `Referrer-Policy` | **absent** (browsers default to `strict-origin-when-cross-origin`; naming it makes it explicit and survives browser changes) |
| `Permissions-Policy` | **absent** |

## Proposed rule: Rules > Transform Rules > Modify Response Header
- **Name:** `KEEPITIL: baseline security headers`
- **When incoming requests match** (Edit expression):
```
(http.host eq "keepitil.com" and not starts_with(http.request.uri.path, "/app/") and not starts_with(http.request.uri.path, "/apps/"))
```
  The app builds (TUITEA Flutter web under `/app/`, `/apps/`) are excluded on purpose: they may legitimately use camera, microphone or location, and they are owned elsewhere.
- **Then, Set static** (each is "Set"):
  - `X-Content-Type-Options` = `nosniff`
  - `Referrer-Policy` = `strict-origin-when-cross-origin`
  - `Permissions-Policy` = `camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()`

Not proposed, on purpose:
- **No full Content-Security-Policy yet.** The pages use inline scripts and styles throughout and load SoundCloud, YouTube, Supabase and analytics; an enforced CSP would break them. If wanted later: ship `Content-Security-Policy-Report-Only` first and read the reports for a week.
- **No `autoplay`, `fullscreen` or `encrypted-media` restriction**: the radio (SoundCloud iframe) and article videos rely on them.
- **No HSTS change** (`includeSubDomains` / `preload` would also bind subdomains this zone may not control).

## Why these three are safe for the current site
A guard test (`tests/security-headers-guard.test.cjs`) scans every shipped page and script outside `app/` and `apps/` for the browser features the Permissions-Policy turns off (geolocation, getUserMedia, PaymentRequest, WebUSB, Web Serial, Web Bluetooth). None is used today; the test fails if a future change starts using one, so the header cannot silently break a feature. `nosniff` only affects files served with a wrong content type (Pages serves the right ones: check the verify step on `/assets/` JS and CSS). `Referrer-Policy` matches the browser default for most visitors.

## Verify after applying (read-only)
```bash
curl -sI https://keepitil.com/ | grep -i -E '^(x-content-type-options|referrer-policy|permissions-policy)'
curl -sI https://keepitil.com/app/tuitea/app/ | grep -i -E '^(x-content-type-options|referrer-policy|permissions-policy)'   # expect none (excluded)
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' https://keepitil.com/assets/js/keepitil-radio.js   # 200 and a JavaScript type (nosniff blocks wrong types)
```
Then open `/`, an event page and `/support/` with the browser console open: no new "blocked by nosniff" or "Permissions policy violation" messages, and the radio still starts on first tap.

## Rollback
Disable or delete the rule in Cloudflare (takes effect within seconds; no deploy). Nothing else depends on it.
