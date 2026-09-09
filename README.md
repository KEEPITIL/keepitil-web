# KEEPITIL — public production build

Deployment artifact for https://keepitil.com. Not a development repository; it holds no
source of truth.

Development, internal documentation, tests, tooling, operational playbooks and planning
live in the **private** KEEPITIL source repository. Only files a customer's browser needs
are published here, selected by an allowlist in the source repo
(`.github/internal/scripts/build-public.mjs`), which is deny-by-default and fails the
build if a private family ever matches.

History starts at this repository's first commit on purpose: the source repository's
46,660 commits contain internal material and were deliberately not mirrored.

**Never commit here by hand.** Regenerate from the private source.
