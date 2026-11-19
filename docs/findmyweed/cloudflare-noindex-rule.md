# Find My Weed: Cloudflare noindex header (launch gate G-2), DRAFT, NOT APPLIED

**Status: a reviewable draft. Nobody has applied it.** No Cloudflare API call was made to write this file. Applying it is a Cloudflare dashboard change for Joe (or someone Joe names) after Grok's GO.

`docs/` is excluded from the GitHub Pages deploy (`.github/pages-exclude.txt`), so this file is never served.

## What it does
It adds the response header **`X-Robots-Tag: noindex, nofollow`** to everything under **`keepitil.com/findmyweed/`**: the pages, `data/listings.json`, the PNG/SVG images, scripts and styles.

- The pages already carry `<meta name="robots" content="noindex,nofollow">`, but a meta tag doesn't cover JSON or images, and `findmyweed/robots.txt` is ignored below the site root.
- This header covers every file type.

**Not covered, on purpose:**
- the marketing page `/findmyweed` (served from `findmyweed.html`) and `/findmyweed.html`;
- the other `/findmyweed-*` pages;
- the rest of keepitil.com.

The rule matches only paths that start with the folder **and its slash**, `/findmyweed/`.

## The rule
Type: a **Transform Rule → Modify Response Header**, in the `http_response_headers_transform` phase of the keepitil.com zone.

Expression (Cloudflare Rules language):

```cloudflare-expression
(http.host in {"keepitil.com" "www.keepitil.com"} and starts_with(http.request.uri.path, "/findmyweed/"))
```

Action: **Set static** header `X-Robots-Tag` = `noindex, nofollow`.

**The path match is case-sensitive.** `starts_with(http.request.uri.path, "/findmyweed/")` matches `/findmyweed/…` exactly as written. It does **not** match `/FindMyWeed/` or `/FINDMYWEED/`.
- Today that's fine: GitHub Pages serves paths case-sensitively, so a differently-cased path is a 404 with nothing to index, and every link to the directory uses the lower-case folder.
- If the host ever starts serving paths case-insensitively, change the expression to `starts_with(lower(http.request.uri.path), "/findmyweed/")` before relying on it. That's a reviewed change, not done here.

The same rule as one Rulesets API rule object (for review; **not sent**). `ref` is a stable, human-readable id for this rule within the ruleset. It keeps the rule recognisable across edits and exports, so it can be found, updated or removed by `ref` rather than by its generated `id`:

```json
{
  "ref": "fmw_g2_noindex",
  "description": "Find My Weed (G-2): noindex, nofollow for everything under /findmyweed/ until launch",
  "expression": "(http.host in {\"keepitil.com\" \"www.keepitil.com\"} and starts_with(http.request.uri.path, \"/findmyweed/\"))",
  "action": "rewrite",
  "action_parameters": {
    "headers": {
      "X-Robots-Tag": { "operation": "set", "value": "noindex, nofollow" }
    }
  },
  "enabled": true
}
```

## How to apply (later, by a person, after GO)
1. Cloudflare dashboard → keepitil.com zone → **Rules → Transform Rules → Modify Response Header → Create rule**. Paste the expression and set the header as above.
2. **Add** this rule. Never replace the ruleset: the zone already has a Transform Rule for keepitil.com's security headers (see the note in `/_headers`). An API `PUT` on the phase entrypoint would **delete** the existing rules, so if the API is ever used, it's `POST …/rulesets/{ruleset_id}/rules` with the object above, never `PUT`.

## How to check it (after it is applied)
```
curl -sI https://keepitil.com/findmyweed/ | grep -i x-robots-tag                   # expect: noindex, nofollow
curl -sI https://keepitil.com/findmyweed/data/listings.json | grep -i x-robots-tag  # expect: noindex, nofollow
curl -sI https://keepitil.com/findmyweed/img/og-placeholder.png | grep -i x-robots-tag
curl -sI https://keepitil.com/findmyweed | grep -i x-robots-tag                    # expect: nothing (the marketing page)
curl -sI https://keepitil.com/ | grep -i x-robots-tag                              # expect: nothing
```

## How to remove it at launch
Disable or delete this one rule once `site.json` `launched: true` and `prelaunch: false` ship with Grok's GO. The pages' own robots meta follows the same switch.

`assets/js/findmyweed-noindex-rule.test.mjs` checks that this file's expression and JSON agree, and that the expression matches exactly the intended paths.
