# 12A door scanner: caller and auth contract (PROPOSAL; nothing here is wired into any page)

Scope: the two RPCs after the 12A hardening packs are applied: `public.event_checkin_scan(p_qr_token text) returns jsonb` (the door scanner RPC) and `public.check_in_ticket(p_qr text) returns jsonb` (legacy RPC kept for compatibility). Both signatures are unchanged.

## 1. Who calls these today (grep evidence)

| Repo | Result |
|---|---|
| `keepitil-web` (this repo, worktree of `origin/draft/r1-fix-f3-acl-locks`) | **No caller.** `grep -rIn -E "check_in_ticket\|event_checkin_scan"` outside `db/` finds one hit: a comment in `assets/js/kil-ticket-qr.js` (it documents the two functions' prefix handling and exports two string helpers that nothing calls for scanning). `dashboard.html:326` renders a "Door scanner" link whose `href` is `/dashboard` (a self-link; there is no scanner page or script). `tickets.html:159` only RENDERS a QR (`KilTicketQr.payload(token,{prefix:true})`, i.e. `KIL-<32 hex>`); `profile.html` only reads the buyer's own orders. |
| `keepitil-app` (read-only clone at `88b5e91`) | No hit for either name. (GitHub code-search through the API returned nothing; the local clone grep is the evidence.) |
| Database | `pg_proc.prosrc` scan over all non-system schemas (KODE's capture): no function references either RPC. PRECHECK-12A Q05 re-checks functions and views before apply. |

Conclusion, matching Atlas/Nova: there is **no established scanner caller**. The route selected is an **authenticated organizer scanner** (owner signs in, scans); a self-link or anonymous scanner is not accepted. Building that UI is out of scope for 12A; this document and `adapter/` are the contract it must follow.

## 2. Who may call

| Caller | After hardening |
|---|---|
| Signed-in user whose `app_users.handle` equals (case-insensitively) the event's `owner_handle` (non-null, non-empty on both sides) | allowed; admits their own event's paid tickets |
| Signed-in user with no `app_users` row, a NULL handle, or an empty-string handle | refused (`forbidden`). This closes the null-owner and empty-string-owner holes (original `check_in_ticket` admitted both; original `event_checkin_scan` admitted the empty-string case) |
| Signed-in user who is not the event owner | refused (`forbidden`) |
| `anon` (publishable key, no user session) | **no EXECUTE on either function**; PostgREST returns an error (`42501 permission denied for function ...`, HTTP 401/403 depending on gateway). Previously `check_in_ticket` was anon-executable (it answered `{"status":"unauth"}`) |
| `service_role` | keeps EXECUTE (as today) but has no JWT subject, so it always gets `unauth` and can admit nothing. Server-side admission on behalf of a user is not a supported path |
| `private.door_checkin_core` | not callable by anyone but the function owner (schema `private`, no grants). It is an implementation detail; never expose schema `private` in the API settings |

## 3. Request shape (PostgREST / supabase-js)

- Header `Authorization: Bearer <the signed-in user's access token>` (a user JWT; the anon key alone is NOT enough) and `apikey: <publishable key>`.
- `POST /rest/v1/rpc/event_checkin_scan` with JSON body `{"p_qr_token": "<scanned text>"}`.
- supabase-js: `const { data, error } = await supa.rpc('event_checkin_scan', { p_qr_token: raw })`. The legacy RPC takes `{ "p_qr": raw }`.
- `raw` is whatever the camera decoded. The database trims whitespace and strips ONE leading `KIL-` (any case), so these all work: `<token>`, `KIL-<token>`, `kil-<token>`, ` \tKIL-<token>\n`. Matching of the token itself is exact (case-sensitive), as before.
- The scan is **not idempotent by design but is safe to retry**: the first successful scan admits, every later scan of the same ticket returns `already_used` with the original admission time. A network retry after a lost response therefore shows "Already admitted", never a second admission.
- Auth is checked inside the function with `auth.uid()` from the JWT; the client cannot supply or spoof an identity or an owner handle.

## 4. Response (token-free, no-contact)

`event_checkin_scan` returns only these keys: `ok` (bool), `result` (code), `message` (fixed text), and, depending on the code, `event_title`, `tier`, `qty`, `checked_in_at`. It never returns: the scanned token, `qr_token`, buyer email, buyer handle, phone, order id, Stripe ids, amounts, event slug, or the owner handle. (The previous version returned `buyer` = handle or email and `event_slug`.) Attendee names would need an explicit opt-in column; none exists, so none is returned.

| `result` | `ok` | meaning | extra keys | suggested UI (owned by `adapter/door-scan-adapter.mjs`) |
|---|---|---|---|---|
| `admitted` | true | this scan admitted the order (atomic, once) | `event_title`, `tier`, `qty`, `checked_in_at` | green "Admitted"; show tier and qty (`qty` is the number of people on this one QR; there is no per-seat model) |
| `already_used` | false | already admitted (earlier scan, concurrent scan, or order status `checked_in`) | `event_title`, `tier`, `qty`, `checked_in_at` | amber "Already admitted" with the original time |
| `unpaid` | false | order is `pending`, `refunded`, `cancelled` (or any non-`paid` status), including one refunded while the scan was in flight | `event_title` | red "Not paid" |
| `forbidden` | false | caller is not the door owner of this event | none | red "Not your event" |
| `invalid` | false | no such ticket, an over-long payload, or an ambiguous (duplicated) token | none | red "Not a KEEPITIL ticket" |
| `empty` | false | nothing scanned after trim and prefix removal | none | neutral "No code scanned" |
| `unauth` | false | no JWT subject (only reachable by `service_role`) | none | "Sign in to scan" |

`check_in_ticket` (legacy) keeps its keys `status, event, tier, qty, checked_in, sold, at`, minus `buyer`: `valid` (admitted: event, tier, qty, checked_in, sold, at), `already` (same keys), `notpaid` (+ `order_status`), `notyours`, `notfound` (also used for empty), `unauth`. The adapter maps both RPCs onto the same canonical result.

Transport-level outcomes the UI must also handle: HTTP 401/403 or `42501` (session expired or anon: send the user to sign in), network failure (show "could not check, try again"; a retry is safe, see section 3).

## 5. Adapter

`adapter/door-scan-adapter.mjs` (pure JS, no dependencies, 10 unit tests in `door-scan-adapter.test.mjs`): `normalizePayload`, `buildScanRequest`, `adaptScanResponse`, `adaptTicketResponse`, `UI`. It whitelists the keys above, so even a future server regression that re-adds `buyer`/email/phone cannot reach the screen, and it never echoes the scanned payload into a result, UI string or error. Run: `node --test db/proposed/12a-door-hardening/adapter/door-scan-adapter.test.mjs`. It is under `db/` (pages-excluded) and imported by nothing. No locked file (`index.html`, `connect/index.html`, `culture/index.html`, `earn/index.html`, `keepitil-shell.js`, `assets/js/keepitil-ai.js`) was edited.

## 6. Notes for whoever builds the scanner UI

1. Use `event_checkin_scan` (canonical, token-free). Do not build on `check_in_ticket`; it exists only so nothing breaks.
2. Dashboard "Door scanner" must stop linking to `/dashboard` and route to the new authenticated page; the page needs a signed-in organizer session and must handle the `unauth`/401 case.
3. `assets/js/kil-ticket-qr.js` comments say `event_checkin_scan` "only trims, so a prefixed code is rejected"; that becomes stale once step 1 is applied (both RPCs then accept raw and `KIL-` forms). Update the comment in a follow-up; not edited here.
4. Door staff who are not the event owner cannot scan today (authorisation is owner handle only; there is no staff/delegate table). If delegates are wanted, that is a new authorisation model, not a 12A change.
5. Never log or display the raw scan payload; it is the ticket.
