# KMOB publish: keepitil.com/games/kmob/

`games/kmob/` is written by one thing only: `.github/workflows/kmob-publish.yml` in this repo. KMOB (private, `KEEPITIL/KMOB`) builds the game on every merge to its `main` and uploads it as the Actions artifact `kmob-web-<sha>`. KMOB holds **no credential for this repo**. Its side is documented in KMOB `docs/DEPLOY_WEB.md`.

## How a release goes

1. A PR is merged into KMOB `main`. KMOB's `deploy-web` runs `gate`, `browser`, `crusades-balance`, `pr-tests`, then `build`, which uploads `kmob-web-<sha>`. The run summary gives the exact `kmob_sha`.
2. Someone opens this repo's Actions, **kmob-publish**, **Run workflow** on `main`, with `kmob_sha` and `mode`. Start with `dry-run`.
3. The run waits for the **`kmob-publish` environment** reviewer. **That approval is the go.** Nothing reads KMOB before it.
4. The run verifies the commit (below), downloads and checks the artifact, and stages one commit. A dry run prints `live <build> -> <build>` and the changed paths, and stops.
5. In `publish` mode it re-checks that the commit is still KMOB `main`'s tip, pushes, then starts **Deploy Pages**. A push made with `GITHUB_TOKEN` doesn't trigger that by itself.

## What it refuses (fail closed; `scripts/kmob-publish/lib.mjs`)

| check | refused when |
|---|---|
| `tip` | the commit isn't KMOB `main`'s tip, at verify time **and** again immediately before every push attempt. Re-running an old run can't roll the site back. |
| `provenance` | the commit isn't the `merge_commit_sha` of a PR merged into `main`. This is how a **direct push to KMOB main can't publish**. |
| `checks` | the latest `deploy-web` push run on that exact commit isn't green, or any of `gate`, `browser`, `crusades-balance`, `pr-tests`, `build` or the step `pr-tests / crmap-ids` isn't `success`, or its commit status is red |
| `pr-checks` | on the merged PR's head: no green `deploy-web` pull_request run with the same jobs, or any other workflow's latest run on it is red or unfinished |
| `rollback` | the live `games/kmob/version.json` names a KMOB commit that this one isn't the same as or newer than |
| `precondition` | PR **#26** (CAMPAIGN MAP fix) isn't merged, or its merge isn't contained in this commit |
| `artifact` | no unexpired `kmob-web-<sha>` on that run |
| `artifact-integrity` | the zip's sha256 isn't the API's digest, a zip entry is absolute or has `..`, `version.json.source` isn't the commit, any file differs from `build.json`, there's an extra or missing file, a symlink, or `index.html` lacks its `kmob-build` meta |
| `path-guard` | the commit would touch anything outside `games/kmob/`, or there's more than one commit to push (checked again after any rebase) |
| `api` | any GitHub API call fails. That's a refusal, never a pass. |

The required job list, the precondition PR and the KMOB repo are in `scripts/kmob-publish/config.json`, which lives here, not in KMOB.

**Tests:** `kmob-publish-check.yml` runs `node --test scripts/kmob-publish/kmob-publish.test.mjs` on every change to these files. It covers every refusal against API fixtures (including a direct-push commit, a PR commit with a red check, a stale commit and a commit missing #26), plus an end-to-end dry run and publish into a local bare repo. Then come the **negative controls**: each check is switched off in turn (`KMOB_VERIFY_DISABLE`, test-only), and the suite must fail every time. It also checks that every action is SHA-pinned and that the publish workflow is dispatch-only, main-only, environment-gated and dry-run by default.

## Joe: one-time setup (free on a public repo; nothing here was created by Claude)

1. **Environment** `kmob-publish`: Settings, Environments, New environment.
   - **Required reviewers:** Joe (add Atlas's account too if Atlas should be able to give the go). Tick "Prevent self-review" if the person starting runs shouldn't approve their own.
   - **Deployment branches and tags:** "Selected branches and tags", add the rule `main`.
   - Leave "Allow administrators to bypass" **off**.
2. **Token**: a fine-grained personal access token, created by an account that can read KEEPITIL/KMOB.
   - Resource owner `KEEPITIL`. Repository access: **Only select repositories, `KEEPITIL/KMOB` only**.
   - Repository permissions, **all read-only**:
     - **Actions: Read**: runs, jobs, artifacts and artifact download
     - **Contents: Read**: refs, compare
     - **Pull requests: Read**: the merged PR and #26
     - **Commit statuses: Read**
     - **Metadata: Read** (mandatory, set automatically)
   - Nothing else, and no write permission. Set an expiry and note the date. A KEEPITIL org policy may need to approve fine-grained tokens first.
3. **Secret**: in the `kmob-publish` environment (**not** a repository secret), add `KMOB_READ_TOKEN` = that token.
4. Nothing in KMOB. If a `KEEPITIL_WEB_DEPLOY_KEY` secret or a write deploy key for this repo was created under the old plan, delete both.

Cost: none. Public-repo Actions minutes and environments are free, and no paid plan or feature is used. A refusal costs one short run.

## Before the first publish

- The live build is `4b32a21cd556` (Oct 24). The first publish replaces it with whatever KMOB `main` is then. Today that would be `f943d80d1fac` (12 paths, **including `js/crusades.js`**), plus the #26 fix.
- #26 must be merged first, or `precondition` refuses.
- The crusades balance gate is green on KMOB `main` since #27 (the seeded M10/M16 check). `deploy-web` on `main` still has to be green on **every** job before this will publish: on ec297cf (#49) the `browser` job failed on a test-timing race, fixed by KMOB #51, so that commit has no artifact and this refuses it.
- Build ids are content hashes and change with every merge, so this doc names none. `dry-run` prints the live build and the one that would replace it.
- Run `dry-run` first. Atlas + Joe give the go by approving the `publish` run.

## Rollback

Revert the KMOB merge through a PR, merge it, and publish the revert's merge commit. The build id is a content hash, so the old build returns byte for byte. Emergency: revert the `KMOB games/kmob: build …` commit here, then run Deploy Pages.
