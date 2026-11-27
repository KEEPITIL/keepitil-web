# CSP: staged ENFORCE plan (proposal, NOT APPLIED)

Nothing in this file is applied by the repo. It follows `csp-report-only.md` (the Report-Only policy and the
`csp-report` collector). Cloudflare rules and collector deploys are done by Grok/Sentinel on a written GO.

## 1. Where the pages stand

Inline `on*=` handlers: none anywhere (repo guard `assets/js/leftovers-actions.test.mjs`). Executable inline
`<script>` blocks have been moved to `assets/js/pages/*.js` for every page except the HELD list below.
`<script type="application/ld+json">` blocks are data, not executed, and CSP does not apply to them.

### Held pages (still carry executable inline script)

| page | blocks | status |
|---|---|---|
| `dashboard.html` | 3 | held: waiting on Joe's direct confirmation (#505) |
| `create-event.html` | 1 | held: same |
| `index.html` (home) | 12 | held: same |
| `findmyweed-explore.html` | 1 | not on the original list; handlers already delegated (#498), one block left. Convertible by the same extraction pattern, no dependency on #505 |
| `games/kmob/index.html` | 1 | hash route, section 2 |
| 24 article pages | 1 each | #513 |

Until a held page is converted (or hashed) it is EXCLUDED from every enforcing rule expression below. It stays
Report-Only.

## 2. kmob: hash instead of extraction

The block is one line, runs before any deferred script, and records the HTML parse time: moving it to an external
file would change what it measures.

```
window.KMOB_LT = { html: performance.now() };
```

Allow it with `'sha256-kwYRS359IPmFNOc9LkCalew9aKuAPfVrYSakzgDN8E8='` in `script-src`, in the rule for
`/games/kmob/*` only. Checked in real Chrome against a local copy of the page: with the hash, zero violations;
with the hash removed (control), one `script-src-elem inline` violation. Any edit to that block changes the hash;
`tests/csp-enforce-plan-guard.test.cjs` fails if the page and this doc disagree.

## 3. Staged enforce

The enforced policy is the Report-Only policy from `csp-report-only.md` under the enforcing header name. It adds
no `'unsafe-inline'` / `'unsafe-eval'` to `script-src`. Only the kmob rule adds its hash.

```csp-enforce
Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://www.googletagmanager.com https://www.clarity.ms https://scripts.clarity.ms https://static.cloudflareinsights.com https://w.soundcloud.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; media-src 'self' blob: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://*.clarity.ms https://cloudflareinsights.com https://api.soundcloud.com; frame-src https://w.soundcloud.com https://www.youtube.com https://www.youtube-nocookie.com; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'
```

Both headers are sent during a stage (Report-Only keeps reporting for everything not yet enforced, with
`report-uri` to the collector as before). Widening order, each step gated on the collector:

| stage | enforced for | gate to enter |
|---|---|---|
| 0 | nothing (today: Report-Only on all paths) | collector live, baseline taken |
| 1 | one low-risk path: `/offline.html`, `/culture/*` | N days Report-Only with zero non-noise violations on that path |
| 2 | other fully converted static paths: `/events/*`, `/event/*`, `/article/*` (after #513), `/connect/*`, `/games/kwars/*` | N days zero violations on the new paths AND stage 1 still zero |
| 3 | `/games/kmob/*` with the section 2 hash | the Chrome check above re-run on the deployed page, N days zero |
| 4 | held pages, one at a time, only after each is converted | per page: converted, merged, N days zero |
| 5 | site-wide | every page covered, N days zero everywhere, signed-in flows exercised |

Suggested N: 7 days for stages 1-2 (covers a weekly traffic cycle), 7 for each later stage. "Non-noise" means
not from a browser extension (`chrome-extension:`, `moz-extension:`, `safari-extension:` blocked-uri or source),
not `eval`/`inline` from an injected script that has no source file on the site. Anything else resets the clock.

Stage membership is a Cloudflare rule expression on `http.request.uri.path`; held pages are left out until stage 4.

Rollback at any stage: delete or disable that stage's rule. The page then falls back to Report-Only (no outage,
only a pause in protection).

## 4. Radio PJAX `new Function`: dead code, not a blocker

`assets/js/keepitil-radio.js` has a PJAX block that re-runs a swapped page's inline scripts with
`new Function(code)`, which an enforcing `script-src` without `'unsafe-eval'` would block. It cannot fire today:
its allow-list (`pjOK`) only matches `/v3/...` paths, `/v3` was purged, and the file's own comment says the
allow-list "matched nothing" after that. External page scripts are skipped by its `getAttribute('src')` check
anyway. So enforcing does not change behaviour here. Recommend a separate cleanup PR that deletes the dead PJAX
block, so a future allow-list edit cannot reintroduce a `new Function` path under enforcement. Not part of this
doc PR.

## 5. After enforcement, new pages

A new inline `<script>` on an enforced path is blocked and (while stage 5 is not complete) also visible in the
collector. The page guards (`leftovers-actions.test.mjs`, the sha256 tests for moved blocks) fail first in CI.
