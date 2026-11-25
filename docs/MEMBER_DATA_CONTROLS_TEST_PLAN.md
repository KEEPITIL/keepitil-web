# Member data controls: signed-in test plan (for NEXUSMAC, right after gh.io #95 is applied and this PR's flag flip is live)

Covers checklist row 11: unpublish own event, delete own event, download my data, and the negative case (nobody can touch another person's event).
Server side: `unpublish_my_community_event(p_id)`, `delete_my_community_event(p_id)`, `export_my_data()`, `get_my_events()` from gh.io #95 (all `auth.uid()`-scoped, `security definer`). Pages: `/submit-event` (Recent list) and `/settings` (Download my data), flag `MEMBER_DATA_CONTROLS`.

## 0. Before you start (stop here if any answer is no)
1. Read-only SQL on keepitil-prod returns 4 rows:
   `select proname from pg_proc where proname in ('unpublish_my_community_event','delete_my_community_event','export_my_data','get_my_events');`
2. Anon cannot run them (expect `false` x3):
   `select has_function_privilege('anon','public.unpublish_my_community_event(bigint)','execute'), has_function_privilege('anon','public.delete_my_community_event(bigint)','execute'), has_function_privilege('anon','public.export_my_data()','execute');`
3. The live pages carry the flag: `curl -s https://keepitil.com/submit-event | grep -c 'MEMBER_DATA_CONTROLS=true'` = 1 and the same on `/settings`.
4. Two TEST accounts, A and B (a human signs them in: Claude cannot type passwords). Use throwaway addresses, no real member's account.
5. Cleanup list at the end. Do not use a real member's event.

## 1. Setup (as A, on /submit-event)
Submit two community events titled `ZZ TEST A1 <date>` and `ZZ TEST A2 <date>` (future date, any venue). Submit one as B: `ZZ TEST B1 <date>`. Note the ids (read-only: `select id,slug,status,submitted_by from events where title like 'ZZ TEST%' order by id;`). Approve or leave them in review: unpublish needs a live status (`published`, `review` or `sold_out`).

## 2. Positive tests (as A)
| # | Step | Expected on screen | Expected in the database (read-only) |
|---|---|---|---|
| P1 | /submit-event, Recent list shows A1 and A2 with Edit, **Unpublish**, **Delete**. B1 is NOT listed. | buttons visible; no "email info@keepitil.com" help line | `get_my_events()` as A returns A1, A2 only |
| P2 | Unpublish A1, confirm the dialog | message "Event unpublished."; list refreshes | A1 `status = 'draft'`; A2 unchanged; B1 unchanged |
| P3 | Delete A2, confirm ("Delete ... permanently?") | message "Event deleted."; A2 gone from the list | no row for A2; its media/lineup/tiers gone; B1 unchanged |
| P4 | /settings, **Download my data** | file `keepitil-my-data-YYYY-MM-DD.json` downloads; text "Downloaded ✓"; the email-request row is hidden | n/a |
| P5 | Open the file | JSON with A's profile, `events_submitted` (A1 only now), saved events, etc. NO row, id, email or handle belonging to B | n/a |
| P6 | Edit A1 (now a draft) and submit again | expected: "Saved — back in review." (record what the page says; if the server refuses to edit a draft, note it, it is not a blocker for this gate) | A1 status `review`, no duplicate row |

## 3. Negative tests (the important ones)
| # | Step | Expected |
|---|---|---|
| N1 | Signed in as **A**, on /submit-event, in the browser console (the page's global `supa` client), call the RPC on B's event: `await supa.rpc('unpublish_my_community_event',{p_id:<B1 id>})` | `data.ok === false`, error "Not your submission, or it is not live"; B1 `status` unchanged |
| N2 | As **A**: `await supa.rpc('delete_my_community_event',{p_id:<B1 id>})` | `ok:false`, "Not your submission"; B1 still exists |
| N3 | As **B**: the Recent list shows only B1; A's events never appear | `get_my_events()` as B has no A row |
| N4 | **Signed out** (or the anon key only): `supa.rpc('export_my_data')`, `unpublish_my_community_event`, `delete_my_community_event` | permission denied / "not authenticated"; nothing changes |
| N5 | As A, an event that has orders or registrations (make one: a ticketed `ZZ TEST` event with one test order, only if safe): Delete | refused with `has_sales`; the event is kept; Unpublish still works |
| N6 | As A, `export_my_data` response, search for B's email and handle | not present anywhere |
| N7 | As A, unpublish an event already in `draft` | `ok:false`, "not live"; nothing changes |

## 4. After the tests
- Delete the remaining `ZZ TEST` events and any test order; confirm with `select count(*) from events where title like 'ZZ TEST%';` = 0.
- Delete or keep the two test accounts per Grok (use Settings > Delete account for A to test row 10 separately).
- Record PASS/FAIL per row with a screenshot or the response JSON for P2, P3, P4, N1, N2, N4 in the shared notes.

## 5. If anything fails
Flip both constants back to `false` (one revert PR; the pages then show the email route again). The server functions can stay. Report which row failed, the response, and the event ids touched.
