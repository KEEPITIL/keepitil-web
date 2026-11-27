# keepitil.com Content-Security-Policy-Report-Only: proposal (NOT APPLIED, report-only, does not enforce)

**Status: proposal. Nothing here is applied to Cloudflare, and nothing here can block anything.** Applying it needs Grok's written GO (live infrastructure). Merging this PR does not apply it. A `Content-Security-Policy-Report-Only` header never blocks a request; the browser only records what it would have blocked.

Why now: today's audit found stored XSS sinks (homepage Spotlight, share menu, profile pages, KMOB/KBeats/KWARS views, KODE). They are fixed in code, but the site sends no script policy, so any future sink would run. A CSP is the second layer.

## What the site sends today (`curl -I`, 2026-11-27, `/`, `/profile`, `/event`: identical)
| Header | Today |
| --- | --- |
| `Strict-Transport-Security` | `max-age=31556952` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | camera/microphone/geolocation/payment/usb/serial/bluetooth off |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `Content-Security-Policy` | **`frame-ancestors 'self'` only**: no `script-src`, no `object-src`, no `base-uri` |

(GitHub Pages cannot set headers; all of these come from the Cloudflare rule in `security-headers.md`. A `<meta http-equiv>` CSP cannot be report-only, so the Cloudflare rule is the only place for this.)

## Proposed header (one rule, "Set static", same expression as the baseline rule: keepitil.com, not `/app/`, not `/apps/`)
```csp
Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://www.googletagmanager.com https://www.clarity.ms https://scripts.clarity.ms https://static.cloudflareinsights.com https://w.soundcloud.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; media-src 'self' blob: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://*.clarity.ms https://cloudflareinsights.com https://api.soundcloud.com; frame-src https://w.soundcloud.com https://www.youtube.com https://www.youtube-nocookie.com; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'
```
Deliberately **no `'unsafe-inline'` and no `'unsafe-eval'` in `script-src`**, so the reports tell us exactly which inline scripts and handlers would have to move (below). `style-src` keeps `'unsafe-inline'`: pages use 18-76 `style=""` attributes each, and style injection is a far smaller risk than script injection. `img-src https:` is wide on purpose: event covers come from many hosts (RA, SeatGeek, Posh, Shopify, Pexels, SoundCloud art, ...).

If you want a quieter first week, ship the same policy with `'unsafe-inline'` added to `script-src`; it then reports only unexpected hosts. Measured on 12 pages this variant reported **zero** violations, i.e. the host allowlist above is complete for today's pages.

### Where the allowlist comes from (measured, not guessed)
Headless Chrome loaded 12 signed-out public pages through a proxy that adds the header above, and recorded every `securitypolicyviolation`: `/`, an event page, a profile, a venue, `/discover/los-angeles/`, an article, `/tickets`, `/apply`, `/dashboard` (signed out), `/shop/`, `/games/`, `/artists`. Third parties actually contacted: Supabase (`ovmqtzjfpzrbzrlkxwgw.supabase.co`), Google Analytics / Tag Manager, Microsoft Clarity (`clarity.ms`, `c.bing.com` image), Cloudflare Web Analytics (`static.cloudflareinsights.com`, injected by Cloudflare), the SoundCloud widget (`w.soundcloud.com`), jsDelivr (CDN libs), and the YouTube embeds in articles. Not covered by the 12 pages (add if reports show them): signed-in flows, Stripe checkout (a top-level redirect, not a subresource, so CSP does not apply), pages that embed other players.

## What would have to move before this could ever be enforced (script-src without inline)
Measured violations per page (inline `<script>` blocks / inline `on*=` handlers that are present in the loaded DOM):

| Page | inline scripts | inline handlers |
| --- | --- | --- |
| `/` | 12 | 1 |
| `/event?e=...` | 3 | 0 |
| `/profile?slug=...` (owner view) | 6 | 48 |
| `/venue?v=...` | 1 | 26 |
| `/dashboard` | 3 | 10 |
| `/discover/...`, `/tickets`, `/apply`, article | 1 each | 0-1 |

Repo-wide (static markup, excluding `app/`, `apps/`, tests): **227 `onclick=`**, 7 `onkeydown`, 7 `onchange`, 4 `onsubmit`, 3 `oninput`, and ~3,000 `onerror=` (almost all are the image-fallback handlers `this.parentNode.style.display='none'` / `this.outerHTML=...` repeated on the generated `event/*/index.html` pages: one `addEventListener('error', ..., true)` delegate fixes them all). Biggest hand-written offenders: `profile.html` (75), `dashboard.html` (55), `organizers/dashboard.html` (22), `venue.html` (13), `kode/app.html` (13), `culture/index.html` (12), `settings.html` (10), `tickets.html` (6). JS that builds handler strings: `games/kwars/src/systems/*.js` (~65), `vs-app.js` (8), `keepitil-shell.js` (6), `assets/js/keepitil-radio.js` (3). JSON-LD blocks (`type="application/ld+json"`, ~1,000 pages) are data, not scripts, and are not affected.

Migration path, in order of payoff: (1) one delegated `error` listener replaces the ~3,000 image handlers; (2) convert the `onclick=` attributes to `data-act` + one delegated `click` listener per page (the pattern already used in `profile.html` after #476/#481); (3) move the inline `<script>` blocks into versioned files under `assets/js/` (the homepage's 12 are the bulk); (4) only then consider enforcing, using a Cloudflare Worker that adds per-response nonces, or hashes for the few that cannot move.

## Reporting: our own collector (Grok GO 2026-11-27)
`supabase/functions/csp-report/` is a small Supabase Edge Function that receives the reports. **Not deployed by merging this PR** (deploy and the Cloudflare change are separate steps for Grok / Sentinel).
- Accepts `POST` with `application/csp-report` (the `report-uri` format) and `application/reports+json` (the Reporting API format). Anything else: 415; other methods: 405; bodies over 8 KB: 413 (checked by `Content-Length` and by bytes actually read); malformed JSON: 400; more than 30 requests a minute per hashed address (per running instance): 429. Success is **204** with an empty body.
- Writes **one compact JSON log line per violation** and nothing else: `{"t":"csp","ip":"<8 hex>","d":"script-src-elem","b":"https://host/path","u":"https://keepitil.com/profile","s":"","l":0,"c":0,"m":"report"}`. No table, no migration, no cookies. Query strings, fragments and userinfo are stripped from every URL (`document-uri`, `blocked-uri`, `source-file`); `data:`, `blob:` and extension URLs are reduced to their scheme; script samples and the policy text are dropped; at most 10 violations per request. The address is only ever an HMAC with a random per-instance salt (comparable inside one running instance, like the rate limiter), never logged raw.
- `verify_jwt` off (browsers send reports with no credentials); no CORS (reports are not preflighted).
- Deploy (needs a GO): `supabase functions deploy csp-report --no-verify-jwt --project-ref ovmqtzjfpzrbzrlkxwgw` (keepitil-prod). Read the reports in the project's Edge Function logs for `csp-report`.
- Then add these to the Cloudflare rule (still no enforcement): append `; report-uri https://ovmqtzjfpzrbzrlkxwgw.supabase.co/functions/v1/csp-report; report-to csp` to the Report-Only value, and set a second header:
```text
Reporting-Endpoints: csp="https://ovmqtzjfpzrbzrlkxwgw.supabase.co/functions/v1/csp-report"
```
  (`report-uri` for browsers that only know it, `report-to csp` for those that use the Reporting API.)
- Tests: `tests/csp-report.test.cjs` (sample Chrome and Reporting API reports, URL stripping, size cap, rate limit, one log line, no raw address in the log). Also run once under Deno (`deno run --allow-net --allow-env supabase/functions/csp-report/index.ts`) with curl: 204 / 204 / 405 / 415 / 413 and the expected two log lines.

## Verify after applying (read-only)
```bash
curl -sI https://keepitil.com/ | grep -i -E '^content-security-policy'
# expect: the enforcing frame-ancestors header AND the new -report-only header
curl -sI https://keepitil.com/app/tuitea/app/ | grep -i -E '^content-security-policy-report-only'   # expect none (excluded)
```
Open `/`, an event page and the radio in a browser with the console open: violations print as `[Report Only] Refused to ...` and nothing is blocked.

## Rollback
Delete the rule in Cloudflare (takes effect in seconds; no deploy). Nothing depends on it.
