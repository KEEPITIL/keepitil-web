# db/proposed/10a-privacy-dependency : slice 10A "Privacy dependency patch" (PROPOSAL ONLY, NOT APPLIED)

Nothing in this directory is applied by any workflow or script (`db/` is in `.github/pages-exclude.txt`; no runner references it). Every SQL file is a proposal. **No production access was used.** Applying any of it needs Sentinel's isolated tests, Joe's relayed approval per window, and a backup.

| file | what |
|---|---|
| `GAP-ANALYSIS-10A.md` | requirement table (I10, I11, C checklist) -> where covered -> gap -> patch -> who decides; grant before/after; writers of account_type/status; readers; events; I10 touchpoints; open questions |
| `ORDER-10A.md` | the one reviewed order (add / client / opt-in / visibility proof / revoke) with rollback points, dependency reasons, stale-baseline caveat, collision matrix |
| `APPLY-1C-grant-narrowing_PROPOSED.sql` | idempotent, one transaction, drift-guarded; profile_meta column grants 22 -> INSERT 19 / UPDATE 14, REFERENCES/TRIGGER/TRUNCATE/MAINTAIN, profile_content DML, `events.submitted_by`, `get_approved_profile` |
| `ROLLBACK-1C_PROPOSED.sql` | exact inverse, fingerprint-checked (`{{PRE_1C_FINGERPRINT}}` from PRECHECK-10A block H) |
| `PRECHECK-10A.sql` | READ-ONLY catalog/count queries for prod (ACLs, function bodies to capture, writers of profile_meta, view dependents, `submitted_by` dependents, fingerprint, I10 touchpoints) |
| `APPLY-92-44col_PROPOSED.sql` | APPLY-92 with the events guard/grant at 44 columns (for the order where 1C precedes #92); `diff` vs the pack file = 4 lines |
| `ROLLBACK-2-after-1C_PROPOSED.sql` | ROLLBACK-2 without the two column re-grants that would undo 1C |
| `REVIEW-TEMPLATE-get_event_view-organizer-mask_PROPOSED.sql` | TEMPLATE only (live body unreadable): the change, the callers, the capture step, the tests |
| `upstream/` | copies of the #91/#92 pack files the proof applies (APPLY-1 is byte-identical to `supabase/migrations/20261107014000_*`; APPLY-92 is the pack's reviewed rewrite) |
| `proof/` | `proof-10a.mjs`, replicas, `proof-10a-run.txt` (71 positive checks, 13 negative controls), `README-PROOF-10A.md` (what the replica stands in for) |

Run the proof: `cd proof && PGLITE_DIR=<dir containing node_modules/@electric-sql/pglite> node proof-10a.mjs` (needs `git fetch origin draft/10b-noop-save` for the static #129 checks, otherwise they are reported SKIP).
