# Render evidence (PR #152 corrections, 2026-11-10)

Headless Chrome (one instance, fresh temp profile outside the repos, deleted after), local static server on 127.0.0.1, every non-local request failed with BlockedByClient. Script: `harness-mv.mjs` (style of the #151 evidence harness). Raw numbers: `report.json`. Images are JPEG downscales of the 1x captures.

- `prices-hidden-*`: committed default (KIL_MV_PRICES_LIVE=false), 375x812 and 1280x800, full page, plus form-errors view after submitting the empty form.
- `prices-flag-true-LOCAL-ONLY-*`: the served config was rewritten to true by the harness for ONE local render. Nothing with the flag on is committed.

Assertions (all passed): no horizontal scroll; three tier cards; consent and attestation checkboxes required (24px box inside a 60-132px tap row); no dollar amounts in the page text when the flag is false, and $4/$14/$24 only in the flag-true render; "Turnaround: Quoted per project."; license placeholder present; noindex,nofollow; sample is a hidden self-hosted video with poster while the placeholder shows; empty submit shows errors and marks both checkboxes invalid; no navigation away on submit; the page's own buttons, inputs, selects and summaries are >= 44px tall.

Observations: console errors were only blocked-network ones (fonts.googleapis.com, supabase platform_config, googletagmanager, clarity). Elements under 44px come from the site shell (nav links, footer links, radio bar, Install/Dismiss banner, chat) and two inline text links on the page (info@keepitil.com, privacy page); the shell is locked and not changed here. On desktop the shell injects one radio iframe (w.soundcloud.com, blocked); the page itself has none. The shell also requests analytics, so the earlier "This page adds no tracking" sentence was removed from the page.
