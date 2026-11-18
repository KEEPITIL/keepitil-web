# iOS candidate note (Nov 21): what would enter the app bundle

**The app change is NOT made in this job.** This note only states what the web slice would put in the bundle if the
app's pin moved. Guardrail (Joe via Grok / Atlas section 8): the Nov 21 candidate only gets the proven low-risk
tab and navigation change. Everything else is web first.

## How the bundle takes web pages (read, not run)

Sources read: `build-bundle.mjs` and `kil-native.js` from the bundle-refresh work (scratch copies from the earlier
bundle job; `KEEPITIL/keepitil-app` was NOT cloned here and its current `main` still has the older flat `www/` layout,
so it has no `earn/` or `shop/` yet). Facts from those scripts:

- The bundle is crawled from SEEDS: `index.html, connect/, create/, culture/, earn/, profile.html, event.html, ...`,
  following local href/src/srcset/url() and quoted asset paths in JS. `BUNDLE-SOURCE.txt` records the keepitil-web sha used.
- `EXCLUDE` keeps games, apps, store, kode, join, radio-tuner, v3/v31 and game-promo articles out.
- `WEB_ONLY` keeps `shop/`, `services/`, `early-access`, `kil-bf-popup`, `shop-hub`, `assets/data/offers.json` out.
- `kil-native.js` `CLEAN` is only a list of clean URL segments mapped to `.html` (apply, privacy, event, ...); it does not
  list earn or shop. Anything not in the bundle opens on keepitil.com in the system browser. With payments off it also hides
  `a[href^="/shop"]` and `a[href^="/services"]` and blocks shop URLs.

## Files of this slice and their bundle fate if the pin moved

| File | Enters bundle? | Note |
|---|---|---|
| `keepitil-shell.js` | YES (loaded by every page) | This is THE low-risk nav change: five slots, Earn lights on /shop. Also adds `data-radio="off"` opt-out and a footer `Merch shop` link (hidden natively by the `/shop` rule, and `/shop/` is not bundled). |
| `earn/index.html` | YES (SEED) | Large rewrite (1823 -> 834 lines). Per Atlas section 8 this is NOT part of the tiny nav slice: it removes radio/playlists but also adds a new four-section page. If the candidate must stay nav-only, keep the old Earn page in the bundle and ship only the shell change. Decision for Grok + Nova + coding owner. |
| `index.html`, `connect/index.html`, `culture/index.html`, `create/index.html` | YES | One-line static-nav change each (SHOP anchor removed). Safe. |
| `apply, dashboard, privacy, profile, refund, reset-password, settings, signup, terms, ticket-terms, tickets, venue, community-guidelines` `.html` | YES (SEEDS) | Same one-line static-nav change. |
| `services/index.html`, `shop/index.html`, `support/index.html` | `shop/`, `services/` NO (WEB_ONLY); `support/` is not a SEED | Static-nav change only; shop gets a breadcrumb. Not bundled. |
| `assets/js/kapp-tabs.test.mjs`, `docs/kapp/*` | NO | Test and docs; excluded from Pages (`assets/js/*.test.mjs`, `docs/`). |

## Risks to check on the Nov 21 candidate (Nova + Sentinel)

1. Earn in the app after the rewrite: the Merch card's `/shop/` link is hidden natively, leaving Merch with only a
   mailbox note. Confirm that is acceptable, or hide the Merch section natively. No dead button is rendered either way.
2. Spec H07/H08: "hide an empty Culture/Earn tab" vs five tabs. Not reconciled here; flagged to Grok + Luna.
3. `kil-bf-popup` is stripped from every bundled page by the bundler; earn keeps its tag so that still works.
4. Radio: Earn no longer loads radio on phone or desktop. The shell's site-wide desktop radio on other pages is unchanged.
5. Nothing in this slice changes ticket, wallet, scanner or privacy code.
