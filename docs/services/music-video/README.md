# Music video service page (DRAFT)

## REVIEW STATUS (not shown on the public page)
- Copy reviewer: Muse.
- Sentinel review of the form: pending.
- Legal review: pending. The page carries only the placeholder "License and usage terms: pending legal review." Do not write legal terms.
- Rules from Grok (KODE PROJECT LOG 2026-11-10 13:45 PT): keep noindex; turnaround is "Quoted per project" with no day promise; samples are hosted on our own storage, no third-party embeds; KEEPITIL branding.

Page: `services/music-video/index.html`. Script: `assets/js/music-video-service.js`. Config: `assets/js/music-video-config.js`. Tests: `assets/js/music-video-service.test.mjs`. Optional SQL proposal (not applied): `db/proposed/19a-music-video-inquiries/`.

## What is built
- Hero, sample slot, three tier cards (Hook teaser, Full Lyric Cut, Character Story + teaser) with inclusions, exclusions and active-work time caps, how it works, rights section (ownership statement plus the legal-review placeholder), request form, FAQ.
- Inquiry form, not checkout. Default submit: a `mailto:info@keepitil.com` link built from the validated fields (subject names the option; body has the fields, consent text and rights attestation text). No backend, no uploads, no Stripe, no payment fields. Honeypot field drops bot submissions in the script.
- Required checkboxes: contact consent, and the rights attestation (own the song and visuals: master, composition, lyrics, faces, logos, supplied artwork).
- Privacy note links to https://keepitil.com/privacy (that page is not edited). This page adds no analytics of its own, but the site shell it loads (`keepitil-shell.js`, `keepitil-ai.js`) may load analytics, so the page makes no no-tracking claim (render check 2026-11-10 saw gtag and clarity requests, blocked in the harness). The page loads only the shell and `keepitil-ai.js` like `/services/`.

## Placeholders
- Prices hidden. `window.KIL_MV_PRICES_LIVE = false` in `music-video-config.js`; cards show "Pricing confirmed soon: request a quote". The dollar amounts live only in `music-video-service.js` and appear when the flag is true. The HTML contains no dollar amounts.
- Sample slot is empty: the 12.2 MB v2 teaser (`vhs-hearts-v2-teaser.mp4`) was NOT committed (over the ~3 MB limit). The slot shows "Sample video coming soon."
- Turnaround line reads "Turnaround: Quoted per project." No day count or timeframe appears anywhere on the page.
- License and usage terms: a clearly marked placeholder block ("License and usage terms: pending legal review."). No license grants, indemnities or usage-rights language is written. The only rights wording is the required ownership attestation (checkbox) and the matching one-line ownership statement.
- `noindex,nofollow`; not linked from any nav, footer, sitemap or robots.txt. Note: once merged, GitHub Pages serves it at its URL (it is just unlisted).

## Host and show the sample (self-hosted only)
The sample is a `<video data-sample-src="" poster="..." controls preload="none">` inside `[data-sample-slot]`. It stays hidden, and the "Sample video coming soon." placeholder shows, while `data-sample-src` is empty. No YouTube, Vimeo, SoundCloud or other third-party embeds or links are used; the script only accepts a same-origin path ending .mp4/.webm, or a KEEPITIL Supabase `public-assets` bucket public-object URL.
1. Compress the supplied sample to a small vertical mp4 (H.264/AAC, `+faststart`). Do NOT commit the 12.2 MB v2 sample or any large master.
2. Host it on our own storage, one of:
   - the repo's existing media path: put the small file under `assets/video/music-video/` (the repo serves any committed file as-is; the only existing video convention is `wifi_remote_demo_cropped.mp4`), then set `data-sample-src="/assets/video/music-video/<file>.mp4"`;
   - the Supabase storage `public-assets` bucket once it exists (not created and nothing uploaded by this draft): upload there and set `data-sample-src` to its public-object URL `https://<project>.supabase.co/storage/v1/object/public/public-assets/<file>.mp4`.
3. Optionally replace `poster` with a still of the final sample (same storage), update `data-sample-version` and the figcaption.
No other file needs changing.

## Publish checklist (each is a separate step, in order)
1. v3 sample received from Marketing and hosted on our own storage (see above).
2. Sentinel signs off on the form (spam, consent, no public exposure of submissions).
3. Grok gives the go after posting Joe's price confirmation.
4. Flip `KIL_MV_PRICES_LIVE` to `true` in `music-video-config.js`.
5. Change robots meta to `index,follow` (add canonical) and add the page to `sitemap.xml`.
6. Add the nav/footer/services link (the shell is owned elsewhere; do not touch it here).
7. Only if wanted: apply the SQL proposal and set `KIL_MV_SUBMIT_MODE = 'rpc'` (needs Sentinel, Joe's yes, a backup).
Do not merge or deploy this draft before step 1-3. No Stripe until Joe reconnects it.

## Sources
Wording: KODE PROJECT LOG 2026-11-09 21:29 PT (Grok), SPEC.md and music-video-service-draft.md in the Drive folder "CLAUDE KODE / music-video-service". Drive file ids: draft `18VJpinq4w6_pJNhcogMbdCkHwFBMCb1g`, SPEC `1w45jjglSj0XlAobY2Rq3AfE7bWLcv--Y`, v2 sample `1F9W78iAOwE0-27Q3fciy9_BAvd62KKLa`. Price approval: Joe, Nov 9 2026, 9:26 PM PT (not live until confirmed).

## Open questions
- Copy review by Muse (positioning lines, FAQ).
- Unbranded vs KEEPITIL-credited exports (SPEC open question; no claim made on the page).
- License and usage terms: placeholder only, pending legal review.
