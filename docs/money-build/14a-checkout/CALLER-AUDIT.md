# 14A caller audit: Edge Function calls and which bearer they send

Scope: keepitil-web (this branch, grep of `functions/v1/` and `functions.invoke`, excluding `db/`, `docs/`, the compiled `app/tuitea` bundle) and keepitil-app (`origin/main`, plus `origin/app/payments-off` for the bundle copies). Read-only. `verify_jwt` is known only for the two functions captured by KODE (create-checkout v58: true; stripe-webhook v52: false); for the others it is **not captured**, so "user token needed" below is a judgement from what the function does, and any "unknown" should be confirmed with `list_edge_functions` before relying on it.

| # | file:line | function | verify_jwt | bearer sent | user token needed? | status |
|---|---|---|---|---|---|---|
| 1 | `event.html:735` (was :733) | create-checkout | true (v58; caller() also requires a real user, else 401 `needs_account`) | **was the anon key**; now `sess.access_token` | **yes** | **FIXED in this slice** |
| 2 | `vs-app.js:1848` | create-checkout (`kind: vs_entry`) via `SB.functions.invoke` | true | supabase-js attaches the session token when signed in, the anon key otherwise | yes | not changed; OK while signed in. The entry flow calls the authenticated rpc `vs_create_entry` first, so a signed-out user fails before reaching checkout (not verified in a browser) |
| 3 | `keepitil-app` `origin/main:www/event.html:464` | create-checkout | true | **anon key** (an older copy of the web page, same bug) | yes | not changed (app repo untouched). In `origin/app/payments-off` (#42) the call is patched out of the bundle (`NO_PAYMENT_PATCHES` "event buy: no checkout call"); it becomes live again only if the native slice re-enables it, so the bundle copy of `event.html` must be refreshed from the fixed web page |
| 4 | `keepitil-app` `origin/main:www/vs-app.js:487` | create-checkout vs_entry via invoke | true | as #2 | yes | #42 refuses paid entries; free path via invoke |
| 5 | (none) | create-promo-checkout | not captured | no caller in web or app | n/a | nothing to fix; untested |
| 6 | `create-event.html:465` (app `www/create-event.html:463`) | connect-onboard | not captured | `s.access_token` | yes | correct |
| 7 | `dashboard.html:994,1000,1003,1012` (app `www/dashboard.html:715-733`) | publish-dispatch via `functions.invoke` | not captured | session token when signed in | yes | correct (dashboard is signed-in only) |
| 8 | `assets/js/keepitil-ai.js:778` (locked file) | ask-echo | not captured | anon key, by design (public Echo chat) | no (answers signed-out visitors) | not changed |
| 9 | `profile.html:2666` (app `www/profile.html:2171`) | ask-echo | not captured | anon key | no, same as #8 | not changed |
| 10 | `assets/js/keepitil-ai.js:738` / `:1033` / `:1110` / `:1455` (locked) | nexus / agent-tool-invoke | not captured | session `access_token` (738 uses `tok`) | yes | correct |
| 11 | `assets/js/keepitil-ai.js:1190,1303,1732` | PostgREST / rpc reads (`public_profile_list`, `cho_app_brain`, REST) | n/a (rpc, not Edge) | anon key | no (public reads) | out of scope |
| 12 | `kode/app.html:379,399` | kode-oauth-start, kode-ayrshare-sync | not captured | `session.access_token` | yes | correct |
| 13 | `games/kmob/js/account.js:30`, `games/kmob-staging/js/account.js:31` | kmob-wallet | not captured | user token via `this.token()`; throws "sign in required" without one | yes | correct |
| 14 | `games/kbeats/js/api.js:40` | kbeats-api | not captured | `Bearer ' + token` (user token) | likely yes | correct as written |
| 15 | `games/kbeats-preview/js/api.js:112` | kbeats-api `op: audio_url` | not captured | anon key (`PROD_ANON`) | probably no (public audio url) | out of scope; confirm |
| 16 | `support/index.html:206` | support-request | not captured | none (`Content-Type` only) | no | out of scope |
| 17 | `stripe-webhook`, `ticketing-webhook` | called by Stripe / platforms | false (webhook) | n/a | n/a | no page calls them |

Only the ticket path (#1) is changed here. #3 is the one other place where the same defect exists in code; it is dormant in the shipped bundle.

Static guard: `assets/js/event-checkout-bearer.test.mjs` fails the build if any line calling `functions/v1/create-checkout` or `create-promo-checkout` (in the web tree outside `db/`, `docs/`, `tests/`, `app/tuitea`) is followed within 3 lines by an `Authorization: Bearer <anon-key-variable>` header. `functions.invoke` callers are not covered by it (supabase-js chooses the token).
