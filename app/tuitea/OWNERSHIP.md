# /app/tuitea — path ownership

This directory has **two owners**. Publishing one owner's files over the other's is
how production ended up serving a frozen `51.f7b5d36` bundle while TUITEA CI
believed it had shipped a later commit.

## TUITEA CI owns these. DO NOT publish them from this repository.

    app/tuitea/app/**          the compiled Flutter bundle (~70 MB)
    app/tuitea/release.json    the release stamp
    app/tuitea/sw.js           service worker, generated with this release's file list
    app/tuitea/pwa.js          shell runtime, generated with this release's version

They are built and pushed to `KEEPITIL/keepitil-web` by the `deploy-web` job in
`KEEPITIL/thrive-app` (`.github/workflows/ci.yml`), from `tool/build_web.sh`.
That job is the **sole writer** for these four paths.

They were deleted from this repository deliberately. A copy here is a copy that
goes stale the moment TUITEA ships, and any sync that carries it republishes an
old app over a new one. **Do not restore them, and do not let a sync recreate
them.** The four names are generated, mutually consistent artefacts of one
build: `sw.js` precaches a file list that only matches the `app/` it was built
with, so publishing a mixed set produces a service worker that can never install.

## This repository owns the rest, and should keep publishing it.

    index.html  app.html  manifest.webmanifest  flags.json
    apple-touch-icon.png  icon-192.png  icon-512.png  icon-maskable-512.png
    fastbeta/  password/  privacy/  support/

These are the static shell and the standalone pages. `fastbeta/` holds the
base-release IPA install artefacts staged by `thrive-app`'s `tool/publish_ota.sh`
— CI does not publish them, so they must not be removed here either.

`flags.json` is the human rollback lever. `build_web.sh` deliberately never
writes it, so a flag edit survives every release.

## If you are syncing this repository to keepitil-web

Exclude the four CI-owned paths. For example:

    rsync -a --delete \
      --exclude 'app/tuitea/app/' \
      --exclude 'app/tuitea/release.json' \
      --exclude 'app/tuitea/sw.js' \
      --exclude 'app/tuitea/pwa.js' \
      ./ /path/to/keepitil-web/

A push that changes those paths without being authored by `TUITEA CI
<ci@keepitil.com>` is reverted automatically by `tuitea-path-guard.yml` in
keepitil-web, and any drift that survives is repaired hourly by `web-drift.yml`
in thrive-app. Both are backstops. The fix is to not publish them.
