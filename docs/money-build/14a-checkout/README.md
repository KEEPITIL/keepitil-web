# 14A: ticket checkout path (DRAFT, stacked on the 13A branch of #138 [CLOSED, superseded by #154, which carries the R1 + 12A + 13A inert proposals on main]; nothing applied, nothing deployed)

| file | what |
|---|---|
| `../../../event.html` | the fix: `create-checkout` now gets the signed-in user's `access_token` as bearer (was the anon key); no session -> existing sign-in redirect with return path, before any call; 401 / `needs_account` -> the account message + sign-in redirect; free RSVP and the `?paid=1` banner untouched. Inline script, so no `?v=` cache param to bump. Locked files untouched. |
| `../../../assets/js/event-checkout-bearer.test.mjs` | jsdom test of the real `event.html` (9 tests incl. negative controls) + static guard |
| `CALLER-AUDIT.md` | every Edge Function caller in web and app, with the bearer it sends |
| `TEST-PLAN.md` | what is proven offline, the Stripe test-mode plan (gated on Joe), fee table, Apple Pay, decisions D1-D7, approval wording, evidence |
| `NATIVE-PAYMENTSHEET-NOTES.md` | how keepitil-app #42's payments-off guards must be re-scoped, and the server change needed |
| `handoff/create-checkout-paymentsheet.PROPOSED.diff` | illustrative PaymentIntent + webhook patch spec (not applied) |

Run: `npm test` (or `node --test assets/js/event-checkout-bearer.test.mjs`; needs `jsdom`, already a devDependency). Pre-existing unrelated failure on the base: `admin_move_house_page moves only the named page`.

Not verified: a real browser / the in-app browser; the real function; Stripe; the deployed page (the page on keepitil.com may differ from this tree); the fee formula (create-checkout source is not vendored).
