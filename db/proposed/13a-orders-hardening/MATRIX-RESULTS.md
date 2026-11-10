# 13A orders hardening: proof results (real PostgreSQL 17.6, replica, synthetic data)

Generated from `proof/out/results.json` by `proof/report.mjs`. Engine: PostgreSQL 17.6 (embedded-postgres, Unix socket only). Wall time 45s. Machine: peak load1=7.53 min free mem pct=62.

Totals: behavioural matrix 37/37 (negative controls: 17/17 'detects' tests FAIL on the original as required; 20/20 'baseline' regression tests pass on both); pack / structural / mutants / F-D 31/31; informational findings 3/3; fatal: none.

Every behavioural test runs on BOTH worlds: **original** = replica of the captured prod ticketing tables with the 12A packs applied; **hardened** = the same plus the real 13A pack 01 (the committed SQL file, executed). 'control' says what the original MUST do for the test to be a valid proof:
`detects` = the test must FAIL on the original (it proves a defect that 13A removes); `baseline` = the original also passes (regression guard that the fix did not break the real flows).

## A. Behavioural matrix

| id | test | hardened | original | control | control met | original failure detail |
|---|---|---|---|---|---|---|
| A01 | F-A anon cannot INSERT a forged paid order (42501); original inserts it | pass | FAIL | detects | yes | insert not denied: {"rows":[],"rowCount":1} |
| A02 | F-A authenticated (a buyer) cannot INSERT a forged paid order | pass | FAIL | detects | yes | insert not denied: {"rows":[],"rowCount":1} |
| A03 | F-A authenticated organizer cannot INSERT a fabricated sale on their own event | pass | FAIL | detects | yes | insert not denied: {"rows":[],"rowCount":1} |
| A04 | F-A service_role can still INSERT (direct, BYPASSRLS) - the real writer keeps its right | pass | pass | baseline | yes |  |
| B01 | F-B organizer cannot UPDATE status of their own event's order; original can | pass | FAIL | detects | yes | update applied: {"rows":[],"rowCount":1} |
| B02 | F-B organizer cannot UPDATE qr_token of their own event's order; original can | pass | FAIL | detects | yes | update applied: {"rows":[],"rowCount":1} |
| B03 | F-B organizer cannot UPDATE checked_in_at of their own event's order; original can | pass | FAIL | detects | yes | update applied: {"rows":[],"rowCount":1} |
| B04 | F-B organizer cannot UPDATE amount_cents of their own event's order; original can | pass | FAIL | detects | yes | update applied: {"rows":[],"rowCount":1} |
| B05 | F-B organizer cannot UPDATE event_id / tier_id / buyer_email / buyer_handle / stripe_payment_intent / qty / application_fee_cents either (no column left writable) | pass | FAIL | detects | yes | applied: event_id=5 \| tier_id=2 \| buyer_email='x@example.invalid' \| buyer_handle='x' \| stripe_payment_intent='pi_x' \| qty=9 \| application_fee_cents=1  |
| B06 | organizer cannot swap qr_token to admit a forged token: swap, then scan the forged token at the door -> not admitted | pass | FAIL | detects | yes | {"upd":"applied","scan":"admitted"} |
| B07 | non-organizer authenticated users (another organizer, the buyer) cannot UPDATE someone else's / their own order | pass | pass | baseline | yes |  |
| C01 | F-C anon cannot TRUNCATE event_orders (42501); original truncates it | pass | FAIL | detects | yes | truncate not denied: {"rows":[],"rowCount":null} |
| C02 | F-C authenticated (buyer and organizer) cannot TRUNCATE event_orders | pass | FAIL | detects | yes | ["ok","ok"] |
| C03 | F-C anon DELETE / UPDATE leave every row intact | pass | pass | baseline | yes |  |
| C03b | F-C anon DELETE / UPDATE are refused by PRIVILEGE (42501), not only filtered by RLS | pass | FAIL | detects | yes | ["ok","ok"] |
| C04 | F-C authenticated DELETE leaves every row intact (and is refused by privilege) | pass | FAIL | detects | yes | [0,6,6] |
| C05 | F-C table privileges: anon and authenticated hold exactly SELECT (no INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN); PUBLIC holds nothing | pass | FAIL | detects | yes | {"anon":"DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE","authenticated":"DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE, |
| C06 | F-C service_role and postgres keep ALL eight privileges (unchanged) | pass | pass | baseline | yes |  |
| C07 | F-C sorted table ACL = {anon=r, authenticated=r, postgres=arwdDxtm, service_role=arwdDxtm}; no column ACLs; RLS enabled and not forced | pass | FAIL | detects | yes | ["{anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}",null,"true/false"] |
| C08 | policy set is exactly {event_orders_organizer_read, event_orders_owner_read}; surviving policy texts byte-identical to the original | pass | FAIL | detects | yes | {"names":"event_orders_organizer_read,event_orders_organizer_update,event_orders_owner_read,orders_anon_insert","t":{"event_orders_organizer_read":"(e |
| S01 | service_role: fulfill_ticket_order inserts paid orders (2 items), 32-char qr tokens returned, buyer_handle resolved, qty_sold incremented | pass | pass | baseline | yes |  |
| S02 | service_role: fulfill_ticket_order is idempotent on a duplicate (session,tier): second call inserts 0, skips 2, no extra rows, qty_sold unchanged | pass | pass | baseline | yes |  |
| S03 | anon and authenticated cannot EXECUTE fulfill_ticket_order / refund_ticket_order (42501): the ONLY writer path stays service_role | pass | pass | baseline | yes |  |
| S04 | service_role: refund_ticket_order refunds by session, restores qty_sold, a second refund is a no-op | pass | pass | baseline | yes |  |
| S05 | service_role: refund_ticket_order by payment_intent (fixture order 6) refunds it | pass | pass | baseline | yes |  |
| R01 | buyer SELECT via event_orders_owner_read: sees exactly their own orders (1,3,4,6), none of buyer2's | pass | pass | baseline | yes |  |
| R02 | organizer SELECT via event_orders_organizer_read: sees exactly their events' orders (1,2,3,5,6), not the other organizer's (4); the other organizer sees only 4 | pass | pass | baseline | yes |  |
| R03 | anon sees ZERO rows and gets NO error (SELECT privilege kept, no anon policy) | pass | pass | baseline | yes |  |
| R04 | profile.html Tickets query shape (event_orders + embedded events join, buyer_handle filter, status<>'refunded') works for buyer (orders 1,4,6) and returns [] without error for anon | pass | pass | baseline | yes |  |
| R05 | SELECT in an anon-evaluated policy of ANOTHER table (hypothetical event_chat_rooms) keeps working: no 42501 (the reason anon keeps SELECT) | pass | pass | baseline | yes |  |
| R06 | definer / invoker readers unchanged: get_my_tickets (invoker), has_event_ticket (definer, anon + authenticated), organizer_dashboard (definer) | pass | pass | baseline | yes |  |
| D01 | 12A door: owner admits a raw token once (checked_in_at set), repeat = already_used | pass | pass | baseline | yes |  |
| D02 | 12A door: 'KIL-'-prefixed and padded tokens admit; check_in_ticket wrapper admits too | pass | pass | baseline | yes |  |
| D03 | 12A door: non-owner organizer, buyer and anon are refused; refunded and unknown tokens refused | pass | pass | baseline | yes |  |
| D04 | 12A door response never carries the buyer e-mail | pass | pass | baseline | yes |  |
| E01 | FORGED-ORDER END TO END: anon inserts a 'paid' order with its own token, then the door owner scans it -> original ADMITS the forged ticket; hardened: the order cannot exist, scan = invalid | pass | FAIL | detects | yes | {"insert":"inserted","scan":"admitted","rows":1} |
| E02 | LEGIT END TO END: webhook fulfil (service_role) -> buyer sees the order -> door owner admits the returned token -> a later refund of ANOTHER order is refused at the door | pass | pass | baseline | yes |  |

## B. Packs, drift guard, rollback, lock, PRECHECK, ordering vs 12A, mutants, F-D get_ticket

| id | test | result | detail |
|---|---|---|---|
| P01 | static: every APPLY/ROLLBACK pack = ONE BEGIN, SET LOCAL lock_timeout 5s, advisory lock 2979301232487107403, SET LOCAL lock_timeout 5s as statements 2-4, one COMMIT last, drift guard, no data DML, no secrets | pass |  |
| P02 | generator is reproducible: build.mjs --check is clean (packs + PRECHECK == inputs) | pass |  |
| P03 | replica sanity: replica = captured S0 / G0 (POSTCHECKS S0/G0 all ok, DRIFT_QUERY says S0_original + G0_original); fulfill body whitespace-md5 equals the facts body | pass |  |
| P04 | APPLY-01 on the original: succeeds, retained SELECT all ok, state S1, POSTCHECKS S1 ok, data and fulfill/refund/get_ticket objects untouched | pass |  |
| P05 | second APPLY-01 refuses at the guard (DRIFT, ABORT) and changes nothing | pass |  |
| P06 | ROLLBACK-01 restores the captured original EXACTLY: raw + sorted ACL, column ACLs, policy names/roles/cmd/permissive/qual/with_check byte-identical, indexes, RLS flags, data; state S0; a second ROLLBACK refuses | pass |  |
| P07 | apply -> rollback -> apply cycle works (rollback leaves a re-appliable S0) | pass |  |
| P08 | DRIFT GUARD aborts (nothing changed) on: an extra policy; organizer_update predicate altered; orders_anon_insert check altered; TRUNCATE revoked from anon (ACL differs); a column-level ACL; PUBLIC grant; fulfill ACL widened; fulfill body altered; run as a non-postgres role; index missing; trigger added | pass |  |
| P09 | lock serialises two runs: B waits on the pack advisory lock while A holds its transaction open, then B refuses cleanly (DRIFT); end state S1 | pass |  |
| P10 | lock is shared across packs: pack 02 (get_ticket) queued behind pack 01, then BOTH are applied (independent packs); end state S1 + G1 | pass |  |
| P11 | TIMEOUT: A (real APPLY-01) holds the lock ~7 s; B waits and fails with SQLSTATE 55P03 after ~5 s (4.5-6.5 s), not after A's ~7 s; A unaffected; B changed nothing and holds no advisory lock afterwards | pass |  |
| P11c | NEGATIVE CONTROL for P11: with the PRE-lock lock_timeout removed, B is NOT bounded: it waits out A's whole hold and then refuses with DRIFT (not 55P03) | pass |  |
| P12 | PRECHECK-13A.sql is ONE read-only statement: runs in a READ ONLY transaction on the replica as postgres, returns the qr_token default expression, all four policy texts, column-ACL count, function bodies; leaks NO fixture row content (tokens / e-mails / handles) | pass |  |
| P13 | PRECHECK-13A read-only enforcement: a WRITE inside the same READ ONLY transaction fails (control), and PRECHECK itself changes no catalog fingerprint | pass |  |
| P20 | ORDER: 12A first, then 13A works (built as tplHard12). REVERSE: 13A first -> the 12A step-1 pack REFUSES at its drift guard (orders ACL/policies no longer the captured original) and changes nothing | pass |  |
| P21 | ROLLBACK ORDER: after 12A + 13A, rolling back 12A first REFUSES (guard); 13A rollback first then 12A rollbacks works; end state = original (fingerprint equal to the pre-12A original) | pass |  |
| P22 | 12A hardened door functions installed on an already 13A-hardened table (12A guard bypassed in setup) admit / refuse correctly (door suite D01-D03 shape) | pass |  |
| P30 | SUITE SELF-CHECK: the core suite reports NOTHING failing on the real fix and MANY failures on the original (negative control) | pass |  |
| P31 | MUTANT M1 (drops the two policies but LEAVES the table GRANT ALL (RLS blocks insert/update, TRUNCATE still open)) is CAUGHT by the suite: it fails at least C01.anon-truncate, C02.auth-truncate, C05.anon-privs=SELECT, C05.authenticated-privs=SELECT | pass |  |
| P32 | MUTANT M2 (revokes ALL only from anon, forgetting authenticated (policies kept)) is CAUGHT by the suite: it fails at least A02.auth-insert, B01.status, C02.auth-truncate, C10.policy-set | pass |  |
| P33 | MUTANT M3 (drops both policies, revokes INSERT/UPDATE/DELETE/TRUNCATE but leaves REFERENCES/TRIGGER/MAINTAIN) is CAUGHT by the suite: it fails at least C05.anon-privs=SELECT, C05.authenticated-privs=SELECT | pass |  |
| P34 | MUTANT M4 (revokes INSERT/DELETE/TRUNCATE but leaves UPDATE + the organizer_update policy) is CAUGHT by the suite: it fails at least B01.status, B02.qr_token, B03.checked_in_at, B04.amount_cents, C10.policy-set | pass |  |
| P35 | MUTANT M5 (OVER-fix: revokes ALL incl. SELECT from authenticated (breaks buyers and organizers)) is CAUGHT by the suite: it fails at least R01.buyer-reads-own, R02.organizer-reads-theirs, C05.authenticated-privs=SELECT | pass |  |
| P36 | MUTANT M6 (column-grant remnant: the fix plus GRANT UPDATE (status) to authenticated and the organizer_update policy kept) is CAUGHT by the suite: it fails at least B01.status, C10.policy-set | pass |  |
| P37 | POST-CHECK rolls a partial fix back: the real APPLY-01 with the REVOKE line removed passes the guard, FAILS its own POST-CHECK and leaves state S0 (nothing applied) | pass |  |
| G01 | FINDING (original): anon holding a token gets the buyer's e-mail from get_ticket; after pack 02 the 'buyer' key is gone and every other key is byte-equal to the original result | pass |  |
| G02 | get_ticket other inputs unchanged: unknown token, refunded token, empty and NULL give the same result before and after (null) | pass |  |
| G03 | get_ticket callers' contract kept: anon, authenticated, service_role can EXECUTE the wrapper (grants copied from the original); the renamed original has NO grants (anon / authenticated call = 42501); wrapper sorted ACL == stashed original | pass |  |
| G04 | ROLLBACK-02 restores the original get_ticket EXACTLY (same oid, byte-identical pg_get_functiondef, raw ACL, config, owner, no comment); helper gone; original result (with buyer) is back; second rollback refuses | pass |  |
| G05 | pack 02 guards: second APPLY-02 refuses; refuses on altered ACL (anon exec revoked), a pre-existing comment, a pre-existing helper name, a dependent view, a SECURITY INVOKER original, a non-jsonb return; nothing changed | pass |  |
| G06 | pack 02 independent of pack 01, either order: 02 then 01, and 01 then 02, both end in S1+G1; each rollback in either order restores the original fingerprint | pass |  |

## C. Informational findings (replica only; NOT changed by 13A)

| id | test | result | detail |
|---|---|---|---|
| X01 | STRICT VARIANT (anon SELECT also revoked) is NOT bundled: on the replica it makes a signed-out visitor's profile Tickets query fail with 42501 (profile.html would show 'Could not load your tickets') and breaks the anon-evaluated policy sub-select on another table | pass (finding reproduced) |  |
| X02 | organizer_read exposes buyer_email and qr_token to the organizer of the event (door owner): a signed-in organizer can read every token of their event (documented, NOT changed) | pass (finding reproduced) |  |
| X03 | qr_token is not UNIQUE: two rows can share a token (service_role / definer can write one; 12A's door refuses a duplicate as ambiguous); the 13A fix does not add a constraint (see OPEN QUESTIONS) | pass (finding reproduced) |  |

Fingerprints used by the guards: {"get_ticket_wrapper":"a13fcb2fcb58d332bdd16ac1a31b3e17","fulfill_ws":"d2dc436ae0195ab1ae5573bb17c2e3e8"}
