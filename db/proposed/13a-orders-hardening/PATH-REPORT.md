# 13A PATH-REPORT: who reads and writes `public.event_orders`

Status: DRAFT, repo + captured-facts analysis only. No prod connection from this job. Prod facts: `baseline/PROD-FACTS-13A.md` (captured read-only by KODE) and the 12A facts.

## Verdict (one paragraph)

The ONLY writer of `event_orders` is the server side: Stripe -> `stripe-webhook` (Edge Function, verify_jwt=false, Stripe signature check, **service_role** client) -> `rpc fulfill_ticket_order(...)` (SECURITY DEFINER, owner postgres, ACL `{postgres, service_role}` only) for inserts, and `rpc refund_ticket_order(...)` (same ACL) for `status -> refunded`. The two door RPCs from 12A (`event_checkin_scan`, `check_in_ticket`, both SECURITY DEFINER) are the only code that sets `checked_in_at`. **No code in keepitil-web or keepitil-app inserts into or updates `event_orders` as `anon` or `authenticated`.** Every client touch of the table is a SELECT or an RPC. Therefore the client table privileges that are actually required are: **SELECT for `authenticated`** (buyer own orders, organizer their events' orders) and, to avoid a regression for signed-out profile visitors and any anon-evaluated policy sub-select, **SELECT for `anon`** (RLS gives anon zero rows). INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN are required by nobody except `service_role` / `postgres`. No client INSERT/UPDATE path was found, so no narrow RPC replacement is needed and nothing is flagged as broken by the fix.

## What was searched

| scope | how | result |
|---|---|---|
| keepitil-web, this worktree (= `origin/draft/12a-door-hardening`, which includes the #136 and #137 work on top of main), all tracked files | `git grep -n -I -E "event_orders\|orders_anon_insert\|qr_token\|checked_in_at\|rest/v1/event_orders\|get_ticket\|check_in_ticket\|event_checkin_scan\|fulfill_ticket_order\|refund_ticket_order\|get_my_tickets\|has_event_ticket\|my_ticketed"`, excluding `db/proposed` (those are the drafts) | readers listed below; zero writers |
| keepitil-web `origin/main` | same grep | same result (9 matching lines vs 6 on the draft branch; both are comments/tests/readers) |
| `supabase/` in keepitil-web | `git ls-files supabase` | `migrations/`, `rollbacks/`, `seed/` only; **there is no `supabase/functions` directory: no Edge Function source is vendored in keepitil-web**. The only migration naming `event_orders` is `20261107020000_profile_event_summary.sql`, which defines a SECURITY INVOKER reader. |
| keepitil-app `origin/main` and every `origin/*` remote branch (~80) | `git grep` for `from('event_orders')`, `rest/v1/event_orders`, `insert.*event_orders`, `get_ticket`, `fulfill_ticket`, `check_in_ticket`, `event_checkin_scan`; plus a mutation grep (`insert/update/upsert/delete/rpc` within 4 lines after `from('event_orders')`) | the app ships a copy of the web `profile.html` (`www/profile.html`) with the same SELECT; the mutation grep returned **nothing** on any branch; no Edge Function source in the app repo either |
| Edge Function source in repos (create-checkout, stripe-webhook, ticketing-webhook, create-promo-checkout) | `git ls-files \| grep -i -E "functions/\|webhook\|checkout"` on web and app | **none vendored.** Only `db/proposed/11a-upload-ownership/harness/deployed-v44/*.ts` (a read-only copy of the deployed agent runtime, v44). create-checkout / stripe-webhook behaviour comes from the KODE capture (`PROD-FACTS-13A.md`), NOT from repo source. |
| Client call sites of Edge Functions | `grep -o "functions/v1/[a-z0-9-]*"` over the web tree | `create-checkout` (event.html:733) and `agent-tool-invoke` are the only ticket-relevant ones. No `stripe-webhook`, `ticketing-webhook` or `create-promo-checkout` caller (webhooks are called by Stripe / the platform, not by pages). |

## Every reader / writer found (file:line), caller and role

| # | where | what | role of the caller | needs table privilege |
|---|---|---|---|---|
| 1 | `profile.html:3231` (Events tab, `loadTagged()`; lazy-loaded at :3281 when the tab opens) and the same copy in keepitil-app `www/profile.html` (e.g. `origin/app/m4-my-tickets:www/profile.html:2975`) | `SB.from('event_orders').select('id,qty,amount_cents,status,created_at,events(title,slug,starts_at,venue,city,cover_url)').eq('buyer_handle', PROFILE_SLUG).neq('status','refunded')` - a direct PostgREST SELECT with an embedded join | `authenticated` (own orders via `event_orders_owner_read`, or an organizer viewing their events' orders via `event_orders_organizer_read`) **and `anon`**: the Events tab is reachable by a signed-out visitor of any profile (`showTab('tagged')`, not gated on `OWNS`). Today anon gets `[]` (privilege exists, no anon policy) and the page prints "No tickets yet."; without the SELECT privilege anon would get 42501 and the page would print "Could not load your tickets" | **SELECT** for authenticated and anon |
| 2 | `tickets.html:230` | `supa.rpc('get_my_tickets')` | authenticated | none directly (see 3) |
| 3 | `supabase/migrations/20261107020000_profile_event_summary.sql:156-191` + `assets/js/kil-member.js:402` | `get_my_ticket_summary()` is SECURITY INVOKER over `get_my_tickets()`; grants: authenticated only (revoked from PUBLIC, anon) | authenticated | `get_my_tickets` is described as invoker in this migration's comment (the KODE facts list it as reading via auth.users email); if it is INVOKER it needs **SELECT** for authenticated, which is kept |
| 4 | `assets/js/kil-show.js:145` | `client.rpc('has_event_ticket', { p_slug })` | authenticated (only when a session exists) | none (DEFINER) |
| 5 | `profile.html:2738` | `SB.rpc('my_ticketed_event_chats')` | signed-in | none (DEFINER) |
| 6 | `db/proposed/11a-upload-ownership/harness/deployed-v44/tools.ts:239` (deployed agent runtime v44, tool `get_ticket_sales`) | `db.from("event_orders").select("id, tier_id, qty, status, amount_cents, created_at, checked_in_at").eq("event_id", ...)` with a client **bound to the caller's JWT** ("service-role is never used for user-facing work") | `authenticated` organizer | **SELECT** for authenticated (RLS `organizer_read` decides rows) |
| 7 | `tickets.html:157-159` and keepitil-app `www/tickets.html:146-148`, `assets/js/kil-ticket-qr.js` | display only: `e.checked_in_at`, `KilTicketQr.payload(e.qr_token, {prefix:true})` from the `get_my_tickets` result | authenticated | none |
| 8 | keepitil-app `www/profile.html:939` | link `/ticket.html?t=<qr_token>` | n/a | there is **no `ticket.html` in either repo** (dead link, or a page served from elsewhere). **No repo caller of `get_ticket(p_qr)` exists** in web or app |
| 9 | Edge Function `create-checkout` v58 (captured, not in repo) | reads tiers / event with the service role; creates a Stripe Checkout session with `metadata {event_id, items:[{t,q,u}], buyer_user_id}`; **does not insert event_orders** | service_role (reads only) | none from clients |
| 10 | Edge Function `stripe-webhook` v52 (captured, not in repo) | `checkout.session.completed` (with `metadata.event_id`) -> `rpc fulfill_ticket_order`; `charge.refunded` / `charge.refund.updated` -> `rpc refund_ticket_order(null, payment_intent)` | **service_role** | INSERT / UPDATE only through the DEFINER functions (owner postgres) |
| 11 | DB: `fulfill_ticket_order`, `refund_ticket_order`, `check_in_ticket`, `event_checkin_scan`, `archive_event`, `delete_event`, `get_admin_analytics`, `get_event_for_edit`, `get_event_social`, `get_my_tickets`, `get_ticket`, `has_event_ticket`, `my_metrics`, `my_ticketed_event_chats`, `organizer_dashboard`, `update_event`, `update_series`, `get_system_ai_metrics` (KODE pg_proc scan) | only fulfill (INSERT), refund (UPDATE status) and the two door RPCs (UPDATE checked_in_at) write; the rest read | DEFINER functions run as owner postgres (unaffected by revoking client privileges) | none |

## Client writes: none

* `event_orders` INSERT/UPDATE/DELETE from a page or the app: **0 call sites** (web tree, app main, all app branches).
* `event_checkin_scan` / `check_in_ticket`: **0 client callers** in web or app (the dashboard "Door scanner" is a link, `dashboard.html:326`; 12A's CALLER-CONTRACT.md describes the future caller).
* `get_ticket`: 0 repo callers (see row 8).

If a call site is found that is not in these repos (a page served from another origin, a Zapier/Make scenario, a mobile binary older than the repos), it would show up as a failed INSERT/UPDATE after the fix. `PRECHECK-13A.sql` cannot see client calls; the guard against that risk is the pre-apply observation window below (README, "Apply gate").

## Free-ticket RSVP: confirmed NOT `event_orders`

`event.html:730-733`: the Buy button splits the selected tiers into `paid` and `free`. `regCapture(...)` writes the attendee (name, e-mail, custom answers) with `sb.from('event_registrations').insert(rec)` (`event.html:607`, fail-open, anon-key client). If `paid` is empty the page only paints "You're on the list" and returns (`:731`); **no checkout call, no `event_orders` row**. Only `paid` items are sent to `create-checkout`. So an RSVP is an `event_registrations` row, and `event_registrations` is outside 13A (its own ACL/policies were not captured; worth a separate look, since it is also an anon-insertable table by design).

## Observations (not part of the fix)

1. `event.html:733` calls `create-checkout` with `Authorization: Bearer <anon key>`. The captured v58 requires a signed-in JWT (`verify_jwt=true`, "v38 rule"). Either the deployed page differs from this tree, or paid checkout from this page returns an auth error today. This does not change the 13A verdict (the writer is the webhook either way) but is worth one real-checkout smoke test. Not verified.
2. Prod has 5 orders, all paid, 0 checked in (12A facts): the table is nearly empty, so the blast radius of applying 13A is tiny, and a `TRUNCATE` by anon today would lose all five.
3. `qr_token` has a non-unique index only (`event_orders_qr_token_idx`); see README OPEN QUESTIONS.
