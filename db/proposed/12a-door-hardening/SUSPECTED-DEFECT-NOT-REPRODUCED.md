# Suspected defect in `private.door_checkin_core`: NOT reproduced

**Suspicion (from the first finalize draft, commit f0e8dae):** the core does a duplicate-count and then a separate order read. If the order vanishes between them, `SELECT ... INTO o` finds no row, `o` stays unassigned, and the next line raises `record "o" is not assigned yet` instead of returning a result.

**Test:** M36 (both RPCs; original and hardened) simulates the vanishing order (FK `event_orders_event_id_fkey` dropped on the replica, the event row deleted, then the owner scans the orphaned order's token). It was run FIRST against the unchanged core on real PostgreSQL 17.6 (2026-11-10).

**Result:** M36 PASSED on the first run; no exception. A probe that printed the response showed `scan: {ok:false,result:forbidden,...}` and `ticket: {status:notyours}`; `checked_in_at` stayed NULL.

**Why:** in PL/pgSQL, `SELECT ... INTO <record>` with no matching row assigns a record whose fields are all NULL (the "not assigned yet" error occurs only if no SELECT INTO has run on that variable). `o.owner_handle is null` is then true, so the owner check fails closed with `forbidden`.

**Decision:** the proposed 3-line guard (`if not found then return 'invalid'`) was NOT applied. It would only change `forbidden` to `invalid` on a path the foreign key makes unreachable in production, change the core md5, and force a pack regeneration and a full proof re-run for no safety gain. The proposed-fix file was removed from the tree (it remains in git history, commit f0e8dae). Test D05 was rewritten to lock the actual semantics (vanished order answers `forbidden` on both RPCs, nothing admitted). If Sentinel prefers `invalid`, apply the guard from f0e8dae, run `node build.mjs`, `node build.mjs --check` and the whole proof again.
