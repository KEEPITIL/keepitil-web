DRAFT. Proposal only: nothing here is applied or deployed, nothing touched production, no prod SQL of any kind. Stacked on #135 (base `draft/11b-real-postgres`).

## Fixes R1 (from the 11B real-PostgreSQL run)
1. **F3 fingerprints are ACL-entry-order independent.** Every F3 fingerprint/guard (FORWARD drift + saved guard, ROLLBACK pre-check + final guard, DRIFT_QUERY, POSTCHECKS display) hashes a sorted aclitem list instead of `relacl::text` / `attacl::text` / `proacl::text` / `nspacl::text` (NULL stays NULL, `{}` stays distinct, C collation). Only F3 hashed ACL text.
2. **`REVOKE MAINTAIN` on `event_media`, `venue_media`** in the F3 forward (PUBLIC, anon, authenticated; guarded by `server_version_num >= 170000`, dynamic EXECUTE so it still runs on older servers), recording the prior direct grants in `atlas_media_guard.maintain_prior_grants`; the F3 rollback restores exactly those. POSTCHECKS gains `anon_maintain`, `authenticated_maintain`, `public_maintain` (same 8 statements).
3. **One transaction-scoped advisory lock in every APPLY/ROLLBACK pack**, first statement after `BEGIN;`, same key everywhere (`pg_advisory_xact_lock(2979301232487107403)`, signed int64 of sha256("keepitil-web db/proposed pack-run-serializer v1")): #91 APPLY-1/1B/2 + ROLLBACK-1/1B/2, #92 APPLY-92/ROLLBACK-92, 10A APPLY-1C/APPLY-92-44col/ROLLBACK-1C/ROLLBACK-2-after-1C, F3 FORWARD/ROLLBACK, 11A install/rollback (16 files).

**Locked wrappers:** the files of #91, #92, #121, 10A and 11A are NOT edited. `db/proposed/r1-fix-f3-acl-locks/packs/` holds generated variants (`locked/*` = original + lock only; `f3/*` = lock + sorted ACLs + MAINTAIN) produced by `build-variants.mjs` (`--check` fails on drift; `--lock <file>` wraps any other pack file).

## Real-PG 11B matrix with the fix (PostgreSQL 17.6, Unix socket, synthetic)
| | before (`--packs=orig`, re-run) | R1-FIX |
|---|---:|---:|
| EXECUTED-PASS / FAIL / PARTIAL / BLOCKED | 22 / 1 / 2 / 1 | **23 / 0 / 2 / 1** |
| sub-checks | 203 / 205 | **205 / 205** |
| real-PG-only checks | 22 / 22 | 32 / 32 |
| failures overall | 1 | **0** |

Negative controls: old `relacl::text` fingerprint differs after revoke+regrant (original F3 round trip refused by its own guard) vs sorted equal; original F3 lets anon `LOCK TABLE event_media`, R1 refuses 42501; two real connections: with the lock B waits on an ungranted advisory lock and starts after A commits, without the lock B overlaps A by 1.5 s; abort releases; cross-pack F3 vs 11A queues. Details: `db/proposed/11b-combined-rehearsal/R1-FIX-REPORT.md`.

## Open / not verified
* `authenticated` can still `LOCK TABLE` event_media/venue_media through UPDATE (not MAINTAIN; needs a design decision).
* The lock wait is unbounded unless the session sets `lock_timeout`.
* F3 baseline literal still stale: re-capture with the R1 DRIFT_QUERY on prod (read-only) before any apply; an original-F3 forward cannot be rolled back with the R1 rollback.
* PG16 branch of the version guards and prod's server version (assumed 17.6) not verified; wrappers derived from the in-repo copies of #91/#92 files.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
