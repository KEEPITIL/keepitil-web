# Find My Weed drop-in (app/findmyweed/)

`app/findmyweed/` is a byte-identical copy of the find-my-weed repo's shipped site, plus cache stamps. Every find-my-weed
merge to main gets one drop-in PR here. Steps:

1. Non-HTML files (css/, js/, data/, img/, icons/, manifest, sw files, robots.txt): copy from find-my-weed main when they
   differ. Skip `for-business/`, `invite/` and `sitemap.xml` (step 3).
2. HTML pages: copy the find-my-weed source, then apply the stamps (`tools/stamp.js` logic): each `css/*.css` or `js/*.js`
   reference gets `?v=` plus the first 10 hex of the sha256 of that file with LF line endings. Verify 0 drift.
3. `sitemap.xml` is GENERATED, not copied from source: in find-my-weed main run `node tools/build-site.js --out <dir>`
   and copy `<dir>/sitemap.xml` here unchanged. Skipping this leaves a URL for a pruned or lapsed license
   (kw #400) or omits a new row.
4. `assets/js/fmw-sitemap-listings.test.mjs` fails the PR if the sitemap's `listing.html?id=` URLs and
   `data/listings.json` rows differ in either direction.
