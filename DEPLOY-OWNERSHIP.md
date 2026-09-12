# Who publishes what to keepitil.com

keepitil.com is served by GitHub Pages from `KEEPITIL/keepitil-web` (branch
`main`, path `/`). Two independent publishers write to that repository.

| Path | Owner | Published by |
|---|---|---|
| `app/tuitea/app/**`, `app/tuitea/release.json`, `app/tuitea/sw.js`, `app/tuitea/pwa.js` | TUITEA | `deploy-web` job in `KEEPITIL/thrive-app` |
| everything else, including the rest of `app/tuitea/` | the site | sync from this repository |

The two must not overlap. When they did, the site's frozen copy of the TUITEA
bundle republished itself over every TUITEA release and production served an app
several commits old while both publishers reported success. See
`app/tuitea/OWNERSHIP.md` for the detail and for the rsync excludes.

Enforcement, in the order it acts:

1. This repository no longer contains the four TUITEA-owned paths, so a sync
   cannot carry them.
2. `tuitea-path-guard.yml` in keepitil-web reverts any push that changes them
   and is not authored by `TUITEA CI <ci@keepitil.com>`.
3. `web-drift.yml` in thrive-app compares production to `main` hourly and
   rebuilds if they disagree.

Credentials are documented in `thrive-app`'s `docs/WEB_DEPLOYMENT.md`. No secret values
are recorded in either repository.
