# Find My Weed G-2: proposed Cloudflare rules (PROPOSAL ONLY, NOT APPLIED)

**Status: proposal. Nothing in this file has been applied to Cloudflare.** Applying either rule needs a written GO
first. Merging the PR that adds this file does not apply them.

Context (live check, 2026-11-20 8:03 PM PT):

| URL | Before this PR |
| --- | --- |
| `/findmyweed` | 200, the old "FindMyWeed — Cannabis Marketing by KEEPITIL" page (served from the root file `findmyweed.html`; GitHub Pages gives `foo.html` priority over the `foo/` redirect) |
| `/findmyweed/` | 404 (there was no `findmyweed/` folder) |
| `/app/findmyweed`, `/app/findmyweed/` | 404 (there was no `app/findmyweed/` folder) |

Decision: `/findmyweed` and `/findmyweed/*` 301 to `/app/findmyweed/`; the marketing page moves to
`/app/findmyweed/for-business/`; everything under `/app/findmyweed` carries `X-Robots-Tag: noindex, nofollow` while
prelaunch is on.

GitHub Pages cannot send a 301. Until Rule 1 is applied, the repo's stubs (`findmyweed.html`, `findmyweed/index.html`)
do the redirect in the browser (meta refresh 0 + `location.replace`, canonical `/app/findmyweed/`, `noindex,nofollow`).
After Rule 1 is applied, the edge answers first and the stubs are never reached; they stay as a fallback.

---

## Rule 1: Single Redirect (Rules > Redirect Rules > Single Redirects)

- **Name:** `FMW G-2: /findmyweed -> /app/findmyweed/ (301)`
- **When incoming requests match** (Edit expression):

```
(http.host eq "keepitil.com" and (http.request.uri.path eq "/findmyweed" or http.request.uri.path eq "/findmyweed.html" or starts_with(http.request.uri.path, "/findmyweed/")))
```

- **Then:**
  - Type: **Static**
  - URL: `https://keepitil.com/app/findmyweed/`
  - Status code: **301**
  - **Preserve query string: ON**
- **Placement:** Last is fine. It does not overlap any other redirect.

Notes:
- `starts_with(..., "/findmyweed/")` includes the trailing slash on purpose. It must NOT match the separate live pages
  `/findmyweed-join`, `/findmyweed-directory`, `/findmyweed-explore` and `/findmyweed-sample`, which stay where they are.
- `/findmyweed.html` is included so the old `.html` URL also gets the real 301. That is one path more than the decision
  names. Drop that clause if it is not wanted; the stub still covers it in the browser.
- Every `/findmyweed/<anything>` goes to the app's front page, as decided. If deep links should keep their path instead
  (`/findmyweed/listing.html?id=1` -> `/app/findmyweed/listing.html?id=1`), use a **Dynamic** target for the
  `starts_with` part instead:
  `wildcard_replace(http.request.full_uri, "https://keepitil.com/findmyweed/*", "https://keepitil.com/app/findmyweed/${1}")`.
  That is an alternative, not the proposal.
- If `www.keepitil.com` is proxied on this zone, change the host test to `http.host in {"keepitil.com" "www.keepitil.com"}`.

**Check after applying:**

```
curl -sI 'https://keepitil.com/findmyweed?utm_source=x'   # 301, location: https://keepitil.com/app/findmyweed/?utm_source=x
curl -sI 'https://keepitil.com/findmyweed/'               # 301, location: https://keepitil.com/app/findmyweed/
curl -sI 'https://keepitil.com/findmyweed/listing.html'   # 301, location: https://keepitil.com/app/findmyweed/
curl -sI 'https://keepitil.com/findmyweed-join'           # 200, NOT redirected
```

**Undo:** disable or delete the rule. The repo stubs take over again (browser redirect).

---

## Rule 2: Response Header Transform (Rules > Transform Rules > Modify Response Header)

- **Name:** `FMW G-2: noindex /app/findmyweed while prelaunch`
- **When incoming requests match** (Edit expression):

```
(http.host eq "keepitil.com" and (http.request.uri.path eq "/app/findmyweed" or starts_with(http.request.uri.path, "/app/findmyweed/")))
```

- **Then:** Modify response header -> **Set static**
  - Header name: `X-Robots-Tag`
  - Value: `noindex, nofollow`
- **Placement:** in the same Modify Response Header ruleset as the existing keepitil.com header rule (`_headers` says the
  live headers come from a Cloudflare Transform Rule). The two set different headers, so order does not matter. Add it
  as a NEW rule; do not edit the existing one.

Notes:
- This is the precise form of "`/app/findmyweed*`". A bare `starts_with(path, "/app/findmyweed")` would also catch a
  future sibling such as `/app/findmyweed-admin/`.
- It covers `/app/findmyweed/for-business/` too, so the moved marketing page drops out of search while prelaunch is on.
  The old `/findmyweed` URL WAS indexable. If the business page should stay indexable, add
  `and not starts_with(http.request.uri.path, "/app/findmyweed/for-business/")` inside the outer parentheses.
  That is an owner choice; the proposal follows the decision as written.
- The Find My Weed build has its OWN noindex: every page carries `<meta name="robots" content="noindex,nofollow">`
  while its `site.json` has `"prelaunch": true`. This header is the second, edge-level layer.

**Check after applying:**

```
curl -sI https://keepitil.com/app/findmyweed/ | grep -i x-robots-tag                # x-robots-tag: noindex, nofollow
curl -sI https://keepitil.com/app/findmyweed/for-business/ | grep -i x-robots-tag   # x-robots-tag: noindex, nofollow
curl -sI https://keepitil.com/ | grep -i x-robots-tag                               # (nothing)
```

### Turning the noindex off at launch

1. Find My Weed's GO to launch arrives (prelaunch off).
2. In Cloudflare: Rules > Transform Rules > Modify Response Header > `FMW G-2: noindex /app/findmyweed while prelaunch`
   -> toggle it **off** (or delete it). Response header transforms are applied on every response, cache hits included,
   so no cache purge is needed.
3. In find-my-weed: `"prelaunch": false` in `site.json`, `npm run meta`, rebuild and re-publish into keepitil-web
   (its own PR), or the pages keep their own `noindex` meta.
4. Verify: `curl -sI https://keepitil.com/app/findmyweed/ | grep -i x-robots-tag` prints nothing, and the page source
   has no `noindex` robots meta.
5. Optional, after launch: add `/app/findmyweed/` (and `/app/findmyweed/for-business/`) to keepitil-web's `sitemap.xml`
   and a `Sitemap:` line for the app's own sitemap to the root `robots.txt`.

---

## Order of operations (important)

- `/app/findmyweed/` is **404 today**. The app is published there by a separate keepitil-web drop-in PR built from
  KEEPITIL/find-my-weed. Until that lands, Rule 1 and the repo stubs both send visitors to a 404.
  So: merge the drop-in first (or together with this PR), then apply Rule 1.
- Rule 2 can be applied any time; it only adds a header.
