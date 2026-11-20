# R1-FIX: order-independent F3 fingerprints, F3 REVOKE MAINTAIN, one advisory lock for every pack

STATUS: PROPOSAL ONLY (draft PR stacked on #135). NOT APPLIED. NOTHING here touches production or any hosted database; every run below was on a throw-away
real PostgreSQL 17.6 on the Nexus Mac (Unix socket, synthetic data). The originals in PRs #91, #92, #121, 10A and 11A are **not edited**: this directory delivers
variant files next to a generator that derives them mechanically from the committed originals.

## What R1 was

F3's drift fingerprint, its saved rollback guard and its final exactness guard all hash `relacl::text` (and `attacl`/`proacl`/`nspacl`). On PostgreSQL 17 the
order of the aclitem entries in those arrays is not canonical: revoking a whole entry and granting it back moves it to the end. Several packs do exactly that
(ROLLBACK-2-after-1C, F3's own rollback re-grants), so after a perfectly legitimate forward -> rollback the privileges are identical but the md5 is not, and F3's
rollback refuses ("Forward catalog changed" / "Rollback did not restore original catalog"). `diag-f3-roundtrip-pg.mjs --engine=pg --packs=orig` reproduces it
(fingerprint after rollback differs; the only differing state paths are `functions/22/acl` and `functions/23/acl`, same entries in a different order).

## The three changes

1. **ACL order independence** (`packs/f3/*`). Every F3 fingerprint expression (FORWARD drift check, FORWARD saved guard, ROLLBACK pre-check, ROLLBACK final guard, DRIFT_QUERY) now hashes

   ```sql
   CASE WHEN x IS NULL THEN NULL
        ELSE (SELECT '{'||coalesce(string_agg(acl_e::text,',' ORDER BY acl_e::text COLLATE "C"),'')||'}' FROM unnest(x) acl_e) END
   ```

   in place of `x::text`, for `relacl`, `attacl`, `proacl` and `nspacl`. NULL (default ACL) stays distinct from an empty `{}`; the C collation makes the order independent of the
   database collation. POSTCHECKS shows the sorted form too. Other packs hash no ACL text (grep `relacl|attacl|proacl|nspacl` over `db/proposed` finds only F3 and
   harness code; 10A's block-H fingerprint already aggregates `aclexplode` rows with a sort).
2. **REVOKE MAINTAIN on `event_media`, `venue_media`** (`packs/f3/..._FORWARD_PROPOSED.sql`, version-guarded). MAINTAIN is part of `ALL` on PG17 and none of F3's S1 revokes name it, so an
   anonymous session could `LOCK TABLE ... ACCESS EXCLUSIVE` and block every reader (reproduced with real concurrency in 11B CC.8). The forward records the *direct* MAINTAIN grants that existed
   (`atlas_media_guard.maintain_prior_grants`, empty on servers older than 17) and revokes MAINTAIN from `PUBLIC, anon, authenticated` inside a `DO` block guarded by
   `server_version_num >= 170000` (dynamic `EXECUTE`, so the file still parses and runs on 16). The rollback re-grants exactly the recorded entries and drops the record table.
   POSTCHECKS gains `anon_maintain`, `authenticated_maintain`, `public_maintain` columns in the existing statement (still 8 statements). Assumption: production is PostgreSQL 17.6
   (as stated in 11B); the connector was not queried for this.
3. **One advisory lock for every pack, with a 5 s lock timeout.** Right after the first `BEGIN;` of every APPLY and ROLLBACK pack (16 files) come exactly three statements: `SET LOCAL lock_timeout = '5s';`, `SELECT pg_advisory_xact_lock(2979301232487107403);`, `SET LOCAL lock_timeout = '5s';` (see "Lock timeout" below for why the timeout appears on both sides of the lock):
   #91 APPLY-1/1B/2 + ROLLBACK-1/1B/2, #92 APPLY-92/ROLLBACK-92, 10A APPLY-1C/APPLY-92-44col/ROLLBACK-1C/ROLLBACK-2-after-1C, F3 FORWARD/ROLLBACK, 11A install/rollback.
   Key choice: the **same** key everywhere, so any two runs (APPLY vs APPLY, APPLY vs ROLLBACK, pack vs pack) queue; it is the signed int64 of the first 8 bytes of
   `sha256("keepitil-web db/proposed pack-run-serializer v1")` (reproducible in `build-variants.mjs`), a single-bigint key that does not collide with the two-int4 form
   or with a small application constant. Transaction-scoped, so COMMIT, ROLLBACK, an exception or a dropped connection releases it. The wait is bounded by the timeout (see below).

## "Locked wrapper" files (other PRs' files are not modified)

`packs/locked/{pr91,pr92,10a,11a}/*` are byte-for-byte the originals plus a 3-line header and the lock statement after `BEGIN;`. `ROLLBACK-1/1B/92` are locked from the identical copies in
`11b-combined-rehearsal/rollbacks/` (verified `cmp`-identical to the notes-pack files of PRs #91/#92). For the real PR files, run
`node build-variants.mjs --lock <path-to-pack.sql> --out <locked.sql>` on them. `node build-variants.mjs --check` (also run by the harness's LK.static) fails if any file under `packs/` drifts
from what the originals generate.

The F3 stale-baseline literal (`c917a7df...`) is unchanged and still stale: **the baseline MUST be re-captured with the R1 `DRIFT_QUERY`** (by construction its value differs from the order-sensitive one).

## How to run

```
node db/proposed/r1-fix-f3-acl-locks/build-variants.mjs --check
~/work/pg-local/bin/pg-start.sh
node db/proposed/11b-combined-rehearsal/run-combined.mjs --engine=pg              # R1-FIX packs (default); writes *-real-pg-r1fix.* result files
node db/proposed/11b-combined-rehearsal/run-combined.mjs --engine=pg --packs=orig # the packs as committed: reproduces the 11B baseline (R1 fail)
node db/proposed/11b-combined-rehearsal/diag-f3-roundtrip-pg.mjs --engine=pg --packs=orig|r1
~/work/pg-local/bin/pg-stop.sh
```

Results and the negative controls are in `11b-combined-rehearsal/R1-FIX-REPORT.md`.

## Lock timeout (follow-up, KODE directive 2026-11-10)

Every locked pack now sets `SET LOCAL lock_timeout = '5s';` right after the advisory lock (the directive) **and also immediately before it**. Reason, proven on real PostgreSQL 17.6 (11B LK.5c): a `lock_timeout`
set after the lock statement cannot bound that statement's own wait, so with the timeout only after the lock a second runner still waits out the whole first run (the negative control waited ~8.5 s behind a 7 s holder and then succeeded).
With the timeout before the lock the second runner fails cleanly with SQLSTATE `55P03` (`lock_not_available`, "canceling statement due to lock timeout") after ~5.0 s (LK.5: 5003 ms behind a 7 s holder; LK.6, a real APPLY-1 pair: 5003 ms),
changes nothing and takes no table lock, and the first run is unaffected (commits at ~7 s). The post-lock line covers every later lock wait of the pack (`SET LOCAL`, this transaction only). F3 FORWARD/ROLLBACK and 10A
APPLY-1C/ROLLBACK-1C already carried their own `SET LOCAL lock_timeout = '5s';`; it stays (a harmless third copy). A pack that exits with 55P03 can simply be re-run once the first run has finished.
`LK.static` now asserts the exact four-part sequence (BEGIN, timeout, lock, timeout) for all 16 packs instead of only "lock first", i.e. the old assertion was tightened, not relaxed.

## Accepted risk: UPDATE implies LOCK TABLE on event_media/venue_media

Authenticated owners can still take table locks on `event_media` and `venue_media` through their UPDATE privilege: in PostgreSQL, `LOCK TABLE ... IN ACCESS EXCLUSIVE MODE` (and the other modes) is permitted to a role holding
UPDATE (or DELETE, TRUNCATE) on the table, and it is not subject to RLS. This is **not MAINTAIN** (R1's REVOKE MAINTAIN closes the anonymous path; CC.8 shows anon refused 42501). It needs an **authenticated owner session, not anon**.
F3 needs that UPDATE for the owner flows, so the privilege cannot simply be revoked; changing this (for example moving owner writes behind a SECURITY DEFINER function) is a design call for later.
**Accepted by KODE 2026-11-10.** Not mitigated here; the 5 s `lock_timeout` above does not help a victim session that does not set one.
