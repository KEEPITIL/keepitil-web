# 12A door hardening: proof results (real PostgreSQL 17.6, replica, synthetic data)

Generated from `proof/out/results.json` by `proof/report.mjs`. Engine: real PostgreSQL (socket). Wall time 32s. Machine: peak load1=4.47 min free mem pct=63.

Totals: behavioural matrix 59/59; pack/structural 29/29; adjacent findings (replica only) 4/4; fatal: none.

Every behavioural test runs on BOTH the original (prod-captured bodies, replica) and the hardened replica (built by running the real packs). Column 'control' says what the original MUST do for the test to be a valid proof:
`detects` = the test must FAIL on the original (it proves a defect that the hardening removes); `baseline` = the original also passes (regression guard, not a discriminating test); `n/a` = object does not exist on the original.

## A. Behavioural matrix

| id | function | test | hardened | original | control | control met | original failure detail |
|---|---|---|---|---|---|---|---|
| M01.scan | scan | raw token admits once (owner, paid order) | pass | pass | baseline | yes |  |
| M01.ticket | ticket | raw token admits once (owner, paid order) | pass | pass | baseline | yes |  |
| M01b.scan | scan | admit response carries event title, tier name, qty and checked_in_at | pass | FAIL | detects | yes | {"ok":true,"qty":2,"buyer":"sentinel_buyer_handle_9f3k","result":"admitted","message":"Admitted","event_slug":"doors-open","event_title":"Do |
| M01b.ticket | ticket | admit response carries event title, tier name, qty and checked_in_at | pass | FAIL | detects | yes | {"qty":2,"sold":9,"tier":"VIP","buyer":"sentinel.buyer.9f3k@example.invalid","event":"Doors Open Night","status":"valid","checked_in":2} |
| M02.scan | scan | 'KIL-' prefixed token admits | pass | FAIL | detects | yes | not admitted |
| M02.ticket | ticket | 'KIL-' prefixed token admits | pass | pass | baseline | yes |  |
| M03.scan | scan | 'kil-' / 'Kil-' (case-insensitive prefix) admits | pass | FAIL | detects | yes | ["invalid","invalid"] |
| M03.ticket | ticket | 'kil-' / 'Kil-' (case-insensitive prefix) admits | pass | pass | baseline | yes |  |
| M04.scan | scan | surrounding whitespace/newlines are trimmed (' \tKIL-<token>\n ') | pass | FAIL | detects | yes | not admitted |
| M04.ticket | ticket | surrounding whitespace/newlines are trimmed (' \tKIL-<token>\n ') | pass | FAIL | detects | yes | not admitted |
| M05.scan | scan | second scan of the same ticket = already_used, admission time unchanged | pass | pass | baseline | yes |  |
| M05.ticket | ticket | second scan of the same ticket = already_used, admission time unchanged | pass | pass | baseline | yes |  |
| M05b.scan | scan | an order already admitted before (replay) is already_used and keeps its original time | pass | pass | baseline | yes |  |
| M05b.ticket | ticket | an order already admitted before (replay) is already_used and keeps its original time | pass | pass | baseline | yes |  |
| M06.scan | scan | two concurrent scans (two real connections, row-lock handshake) -> exactly one admission | pass | pass | baseline | yes |  |
| M06.ticket | ticket | two concurrent scans (two real connections, row-lock handshake) -> exactly one admission | pass | pass | baseline | yes |  |
| M07.scan | scan | ten concurrent scans of one ticket -> exactly one admitted | pass | pass | baseline | yes |  |
| M07.ticket | ticket | ten concurrent scans of one ticket -> exactly one admitted | pass | pass | baseline | yes |  |
| M08.scan | scan | refunded / cancelled / pending orders are refused (unpaid) and never admitted | pass | pass | baseline | yes |  |
| M08.ticket | ticket | refunded / cancelled / pending orders are refused (unpaid) and never admitted | pass | pass | baseline | yes |  |
| M08b.scan | scan | status 'checked_in' is refused as already_used (never re-admitted) | pass | FAIL | detects | yes | "unpaid" |
| M08b.ticket | ticket | status 'checked_in' is refused as already_used (never re-admitted) | pass | FAIL | detects | yes | "unpaid" |
| M09.scan | scan | unknown token refused (invalid), nothing admitted | pass | pass | baseline | yes |  |
| M09.ticket | ticket | unknown token refused (invalid), nothing admitted | pass | pass | baseline | yes |  |
| M10.scan | scan | empty / whitespace / null / 'KIL-' only refused, nothing admitted | pass | pass | baseline | yes |  |
| M10.ticket | ticket | empty / whitespace / null / 'KIL-' only refused, nothing admitted | pass | pass | baseline | yes |  |
| M11.scan | scan | non-owner refused (forbidden) both ways; nothing admitted | pass | pass | baseline | yes |  |
| M11.ticket | ticket | non-owner refused (forbidden) both ways; nothing admitted | pass | pass | baseline | yes |  |
| M12.scan | scan | NULL-OWNER HOLE: signed-in caller with NO app_users handle vs event with NULL owner_handle is refused | pass | pass | baseline | yes |  |
| M12.ticket | ticket | NULL-OWNER HOLE: signed-in caller with NO app_users handle vs event with NULL owner_handle is refused | pass | FAIL | detects | yes | code=admitted admitted_in_db=true |
| M12b.scan | scan | no-handle caller vs a normally owned event is refused | pass | pass | baseline | yes |  |
| M12b.ticket | ticket | no-handle caller vs a normally owned event is refused | pass | pass | baseline | yes |  |
| M13.scan | scan | EMPTY-STRING handle caller vs event with '' owner_handle is refused (original ADMITS on both functions) | pass | FAIL | detects | yes | code=admitted |
| M13.ticket | ticket | EMPTY-STRING handle caller vs event with '' owner_handle is refused (original ADMITS on both functions) | pass | FAIL | detects | yes | code=admitted |
| M14.scan | scan | owner handle match is case-insensitive (event owner DoorOwner vs caller handle DOOROWNER); the ORIGINAL check_in_ticket compares case-sensitively | pass | pass | baseline | yes |  |
| M14.ticket | ticket | owner handle match is case-insensitive (event owner DoorOwner vs caller handle DOOROWNER); the ORIGINAL check_in_ticket compares case-sensitively | pass | FAIL | detects | yes | not admitted |
| M15.scan | scan | duplicated qr_token (no UNIQUE constraint) is refused as ambiguous, never guessed | pass | FAIL | detects | yes | code=admitted admitted_rows=1 |
| M15.ticket | ticket | duplicated qr_token (no UNIQUE constraint) is refused as ambiguous, never guessed | pass | FAIL | detects | yes | code=admitted admitted_rows=1 |
| M16.scan | scan | token match is exact (stored UPPERCASE hex admits as stored; lowercased copy is invalid) - documented behaviour, same as original | pass | pass | baseline | yes |  |
| M16.ticket | ticket | token match is exact (stored UPPERCASE hex admits as stored; lowercased copy is invalid) - documented behaviour, same as original | pass | pass | baseline | yes |  |
| M17.scan | scan | stale token: after the token is rotated the old one is invalid and the new one admits | pass | pass | baseline | yes |  |
| M17.ticket | ticket | stale token: after the token is rotated the old one is invalid and the new one admits | pass | pass | baseline | yes |  |
| M18.scan | scan | REFUND RACE: a refund committing while a scan waits on the row is NOT overridden (stays unpaid, not admitted) | pass | FAIL | detects | yes | {"waited":true,"code":"admitted","admitted":true} |
| M18.ticket | ticket | REFUND RACE: a refund committing while a scan waits on the row is NOT overridden (stays unpaid, not admitted) | pass | FAIL | detects | yes | {"waited":true,"code":"admitted","admitted":true} |
| M19.scan | scan | anon: no EXECUTE and a call is refused (42501) | pass | pass | baseline | yes |  |
| M19.ticket | ticket | anon: no EXECUTE and a call is refused (42501) | pass | FAIL | detects | yes | {"p":true,"code":"unauth"} |
| M20.scan | scan | no PUBLIC EXECUTE; sorted ACL is exactly {authenticated, postgres, service_role} | pass | pass | baseline | yes |  |
| M20.ticket | ticket | no PUBLIC EXECUTE; sorted ACL is exactly {authenticated, postgres, service_role} | pass | FAIL | detects | yes | {anon=X/postgres,authenticated=X/postgres,postgres=X/postgres,service_role=X/postgres} |
| M21.scan | scan | service_role (no JWT subject) executes but is refused (unauth/forbidden/invalid) and admits nothing | pass | pass | baseline | yes |  |
| M21.ticket | ticket | service_role (no JWT subject) executes but is refused (unauth/forbidden/invalid) and admits nothing | pass | pass | baseline | yes |  |
| M22.scan | scan | NO attendee contact: responses never contain the buyer email / buyer handle / any 'buyer' key / '@' (all result codes, owner and non-owner callers) | pass | FAIL | detects | yes | {"bad":["{\"ok\":true,\"qty\":2,\"buyer\":\"sentinel_buyer_handle_9f3k\",\"result\":\"admitted\",\"message\":\"Admitted\",\"event_slug\":\"d |
| M22.ticket | ticket | NO attendee contact: responses never contain the buyer email / buyer handle / any 'buyer' key / '@' (all result codes, owner and non-owner callers) | pass | FAIL | detects | yes | {"bad":["{\"qty\":2,\"sold\":9,\"tier\":\"VIP\",\"buyer\":\"sentinel.buyer.9f3k@example.invalid\",\"event\":\"Doors Open Night\",\"status\": |
| M23.scan | scan | functions are SECURITY DEFINER with search_path set to empty (catalog) | pass | FAIL | detects | yes | {"prosecdef":true,"cfg":"search_path=public"} |
| M23.ticket | ticket | functions are SECURITY DEFINER with search_path set to empty (catalog) | pass | FAIL | detects | yes | {"prosecdef":true,"cfg":"search_path=public"} |
| M24.scan | scan | search_path hijack: caller path 'evil, public' with look-alike tables never reaches the function | pass | pass | baseline | yes |  |
| M24.ticket | ticket | search_path hijack: caller path 'evil, public' with look-alike tables never reaches the function | pass | pass | baseline | yes |  |
| M25 | core | private core is not reachable: no EXECUTE/USAGE for anon, authenticated, service_role; direct call refused | pass | n/a | n/a | n/a |  |
| M26 | ticket | response codes: ticket keeps its legacy keys (status,event,tier,qty,checked_in,sold,at) minus 'buyer' | pass | FAIL | detects | yes | buyer,checked_in,event,qty,sold,status,tier |
| M27 | ticket | ticket counters: checked_in/sold are aggregate counts for the event's paid orders | pass | pass | baseline | yes |  |

## B. Detector self-checks, packs, drift guard, rollback, lock, precheck

| id | test | result | detail |
|---|---|---|---|
| D01 | detector: core WITHOUT 'and eo.checked_in_at is null' lets two concurrent scans both admit (race test fails as it should) | pass |  |
| D02 | detector: core WITHOUT status='paid' in the UPDATE admits an order refunded mid-scan (M18 fails as it should) | pass |  |
| D03 | detector: an UNQUALIFIED, no-SET-search_path copy of the core IS hijacked by 'evil, public' (the M24 test fails as it should); the hardened functions are not | pass |  |
| P01 | static: every APPLY/ROLLBACK pack = ONE BEGIN, advisory lock 2979301232487107403 as the FIRST statement after it, one COMMIT last, drift guard, no data DML, no secrets | pass |  |
| P02 | generator is reproducible: build.mjs --check is clean (packs == inputs) | pass |  |
| P03 | replica sanity: the installed ORIGINAL functions equal the captured prod text (pg_get_functiondef == facts) and DRIFT_QUERY/POSTCHECKS(S0) read S0_original | pass |  |
| P04 | APPLY-01 on the original: succeeds, retained SELECT all ok, state S1, POSTCHECKS(S1) ok; check_in_ticket still original | pass |  |
| P05 | APPLY-02 after 01: succeeds, state S2, POSTCHECKS(S2) ok | pass |  |
| P06 | apply order is enforced: APPLY-02 on the original (core absent) refuses with DRIFT and changes nothing | pass |  |
| P07 | second run refuses cleanly: APPLY-01 twice and APPLY-02 twice (DRIFT, nothing changed) | pass |  |
| P08.1 | drift guard aborts APPLY-01 when: scan body altered (comment appended) | pass |  |
| P08.2 | drift guard aborts APPLY-01 when: scan ACL changed (anon granted) | pass |  |
| P08.3 | drift guard aborts APPLY-01 when: scan search_path changed | pass |  |
| P08.4 | drift guard aborts APPLY-01 when: schema private already exists | pass |  |
| P08.5 | drift guard aborts APPLY-01 when: event_orders policy dropped | pass |  |
| P08.6 | drift guard aborts APPLY-01 when: event_orders policy added | pass |  |
| P08.7 | drift guard aborts APPLY-01 when: event_orders column added | pass |  |
| P08.8 | drift guard aborts APPLY-01 when: event_orders table ACL narrowed (TRUNCATE revoked from anon) | pass |  |
| P08.9 | drift guard aborts APPLY-01 when: event_orders CHECK changed (extra status value) | pass |  |
| P08.10 | drift guard aborts APPLY-01 when: event_orders trigger added | pass |  |
| P08.11 | drift guard aborts APPLY-01 when: event_orders UNIQUE constraint added | pass |  |
| P08.12 | drift guard aborts APPLY-01 when run by a role other than postgres | pass |  |
| P08.13 | drift guard aborts APPLY-02 when check_in_ticket body drifted (after step 1) | pass |  |
| P08.14 | drift guard aborts APPLY-02 when the core was tampered with | pass |  |
| P09 | ROLLBACK restores the captured originals EXACTLY: byte-identical pg_get_functiondef and prosrc, equal sorted ACL, config, owner; private schema and core gone; data untouched | pass |  |
| P10 | rollback order is enforced and rollback has its own drift guard | pass |  |
| P11 | advisory lock serialises two runs: B waits on the advisory lock while A holds the transaction open, then B refuses cleanly (DRIFT); end state S1 | pass |  |
| P12 | lock is shared across packs: a concurrent ROLLBACK/APPLY of a different pack also queues (same key) | pass |  |
| P13 | PRECHECK-12A.sql runs read-only (READ ONLY transaction), errors on nothing, and leaks no row contents (sentinel email/handle/tokens absent from output) | pass |  |

## C. Adjacent findings proven on the replica only (NOT fixed by 12A)

| id | test | result | detail |
|---|---|---|---|
| A01 | FORGED ORDER: anon INSERTs a 'paid' order with its own qr_token for a real event (orders_anon_insert WITH CHECK true) and the door ADMITS it - on the ORIGINAL and on the HARDENED functions (12A does not and cannot fix this) | pass (finding reproduced / follow-up sketch verified) |  |
| A02 | ORGANIZER UPDATE reaches every column: an organizer can set status='paid', rotate qr_token and even NULL checked_in_at (un-admit -> re-admit) on their orders | pass (finding reproduced / follow-up sketch verified) |  |
| A03 | TABLE-LEVEL ALL: anon and authenticated hold TRUNCATE (and MAINTAIN) on event_orders; RLS does not apply to TRUNCATE, so ANY anon request can empty the orders table (replica only) | pass (finding reproduced / follow-up sketch verified) |  |
| A04 | PROPOSED follow-up sketch (FOLLOWUP-13A-14A_orders_PROPOSED_SKETCH.sql, NOT part of 12A) closes A01-A03 on the replica and keeps the door, service_role writes and organizer reads working | pass (finding reproduced / follow-up sketch verified) |  |

Function body md5s used by the guards: {"origTicket":"efad86c3acfe2498b19c1fedfa96e1d1","origScan":"566910baa68086daf08323a562922c7f","hardTicket":"2a4721a5c4b66c05f112ffd6ae9b7e2e","hardScan":"3196a34cd3b118ca02c1250c3816eb18","core":"809f6c9c2a7a26f50ef88dad46d4edc3"}
