# KWARS: keep old links working (plan only)

Status: PLAN. Nothing here is built. No file is deleted. Joe approves before any step.
Goes with draft PR #27 (games hub shows one KWARS card).

## Target
- One current entry: `/games/kwars/` (2D, canvas). It is the only path the hub links.
- Archived: `/games/kwars1/`, `/games/kwars2/`, `/games/kwars3/`, `/games/kwars-build89/`.
- Every archived URL keeps answering 200 and sends the visitor to `/games/kwars/`.

## Hosting constraint
keepitil.com is GitHub Pages (`CNAME`, `.nojekyll`). Pages has no server redirect rules,
so a "redirect" here is a small bridge page at the old path:
`<meta http-equiv="refresh" content="0; url=/games/kwars/">`, `<link rel="canonical" href="https://keepitil.com/games/kwars/">`,
`location.replace('/games/kwars/')`, and a visible "Kingdom Wars has moved" link for no-JS readers.
`/games/kwars1/` already is this kind of bridge (title "Kingdom Wars has moved").

## What exists today (main @ fb69d8a)
| Path | Today | Own service worker | Plan |
|---|---|---|---|
| `/games/kwars1/` | bridge page, canonical → `/games/kwars/` | yes (`sw.js`) | keep; add meta refresh if missing |
| `/games/kwars2/` | 2.5D build, robots `Disallow` | yes | move build to `/games/archive/kwars2/` (copy, not delete), bridge at old path |
| `/games/kwars3/` | 3D build, robots `Disallow` | yes | same as kwars2 |
| `/games/kwars-build89/` | build 89 preview, canonical → `/games/kwars/` | no | same; bridge at old path |

## Steps (each its own draft PR)
1. Copy kwars2, kwars3, kwars-build89 into `games/archive/<name>/` unchanged. Verify each archive copy loads.
2. Replace each old `index.html` with the bridge. Leave its other files in place.
3. Service workers: the old `sw.js` files must keep existing. Ship a version that clears its own
   `kwars[123]-` caches and unregisters, so returning players are not stuck on a cached old build.
   Root `sw.js` already treats `kwars[123]-` caches as app-owned; do not touch that rule.
4. Inbound links: `games/kwars/manifest.webmanifest` and `games/kwars1/manifest.webmanifest`
   mention `games/kwars1/`; `article/aow2-world-crusade/index.html` mentions kwars2 in a comment.
   Update only after the bridges are live.
5. Leave `robots.txt` and `sitemap.xml` as they are (sitemap already lists only `/games/kwars/`).

## Checks before Joe approves
- Each old URL: 200, lands on `/games/kwars/` in Safari iOS, Chrome Android, desktop.
- A device that played kwars2/kwars3 before: opening the old URL does not show the cached old build.
- Hub tile image `/games/kwars/app-icon-512.png` loads; tile reads well at 375px width.

## Open for Joe
- Should archived builds stay playable at `/games/archive/...` or only be kept in git history?
- #27 currently shows KWARS as "Coming soon" with no Play link (Joe, 11:25 PM). Bridges would then send
  old links to a page the hub calls coming soon. Confirm that is wanted.
