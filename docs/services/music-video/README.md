# Music video service page (DRAFT)

Page: `services/music-video/index.html`. Script: `assets/js/music-video-service.js`. Config: `assets/js/music-video-config.js`. Tests (UNRUN): `assets/js/music-video-service.test.mjs`. Optional SQL proposal (not applied): `db/proposed/19a-music-video-inquiries/`.

## What is built
- Hero, sample slot, three tier cards (Hook teaser, Full Lyric Cut, Character Story + teaser) with inclusions, exclusions and active-work time caps, how it works, rights terms, request form, FAQ.
- Inquiry form, not checkout. Default submit: a `mailto:info@keepitil.com` link built from the validated fields (subject names the option; body has the fields, consent text and rights attestation text). No backend, no uploads, no Stripe, no payment fields. Honeypot field drops bot submissions in the script.
- Required checkboxes: contact consent, and the rights attestation (own the song and visuals: master, composition, lyrics, faces, logos, supplied artwork).
- Privacy note links to https://keepitil.com/privacy (that page is not edited). No analytics added; the page loads only the shell and `keepitil-ai.js` like `/services/`.

## Placeholders
- Prices hidden. `window.KIL_MV_PRICES_LIVE = false` in `music-video-config.js`; cards show "Pricing confirmed soon: request a quote". The dollar amounts live only in `music-video-service.js` and appear when the flag is true. The HTML contains no dollar amounts.
- Sample slot is empty: the 12.2 MB v2 teaser (`vhs-hearts-v2-teaser.mp4`) was NOT committed (over the ~3 MB limit). The slot shows "Sample video coming soon."
- Turnaround line is the draft's wording: 3–5 business-day target only after approval and complete inputs, no rush promises.
- `noindex,nofollow`; not linked from any nav, footer, sitemap or robots.txt. Note: once merged, GitHub Pages serves it at its URL (it is just unlisted).

## Swap the sample (v2 placeholder, then v3 from Marketing)
1. Compress to a small vertical mp4 (H.264/AAC, `+faststart`) and put it under `assets/video/music-video/` (the repo has no video convention beyond `wifi_remote_demo_cropped.mp4`; any file under the repo is served as-is). Keep it small; do not commit large masters.
2. In the page, set `data-sample-src="/assets/video/music-video/<file>.mp4"` on the `[data-sample-slot]` element. The script then builds a `<video controls preload="none">`.
3. Update `data-sample-version` (`v2-placeholder` -> `v3`) and the figcaption.
4. Add the file to nothing else: it needs no exclusion.

## Publish checklist (each is a separate step, in order)
1. v3 sample received from Marketing and added (see above).
2. Sentinel signs off on the form (spam, consent, no public exposure of submissions).
3. Grok gives the go after posting Joe's price confirmation.
4. Flip `KIL_MV_PRICES_LIVE` to `true` in `music-video-config.js`.
5. Change robots meta to `index,follow` (add canonical) and add the page to `sitemap.xml`.
6. Add the nav/footer/services link (the shell is owned elsewhere; do not touch it here).
7. Only if wanted: apply the SQL proposal and set `KIL_MV_SUBMIT_MODE = 'rpc'` (needs Sentinel, Joe's yes, a backup).
Do not merge or deploy this draft before step 1-3. No Stripe until Joe reconnects it.

## Sources
Wording: KODE PROJECT LOG 2026-11-09 21:29 PT (Grok), SPEC.md and music-video-service-draft.md in the Drive folder "CLAUDE KODE / music-video-service". Drive file ids: draft `18VJpinq4w6_pJNhcogMbdCkHwFBMCb1g`, SPEC `1w45jjglSj0XlAobY2Rq3AfE7bWLcv--Y`, `make_story_video.py` `1mCLQolneH6y4U9W7pec4nQSs_FkdGlVS` (internal tooling, not published, not read), v2 sample `1F9W78iAOwE0-27Q3fciy9_BAvd62KKLa`. Price approval: Joe, Nov 9 2026, 9:26 PM PT (not live until confirmed).

## Open questions
- Copy review (positioning lines, FAQ). Is a turnaround line wanted at all?
- Unbranded vs KEEPITIL-credited exports (SPEC open question; no claim made on the page).
- Final license language (SPEC says a legal pass comes before going live).
