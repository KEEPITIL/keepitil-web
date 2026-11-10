# CLASSIFICATION (template) of the chat-images objects

**DO NOT DELETE any object (or row) because of this table. This classification only decides what gets COPIED to `public-assets`. The 11 unreferenced objects stay exactly where they are.**
How to fill it: KODE runs `PRECHECK-17A-INVENTORY_READONLY.sql` (read-only; object names + per-table.column reference counts; never row contents) in the approved window, then pastes one row per object below. Facts known without prod access: 17 objects; 13 at path depth 3 (`profiles/<slug>/<file>`), 4 at depth 2 (`event-flyers/<file>`); 6 are referenced by public event/profile pages, 11 are unreferenced (per Grok/Sentinel; Sentinel's inventory file was NOT reviewed).

Categories (the query's `category` column)
| category | meaning | action |
|---|---|---|
| referenced-by-profile-or-event | a public profile/event column mentions the object | COPY to `public-assets` (runbook step 2), rewrite the reference, then P3c |
| referenced-by-message | a table whose name matches message/chat mentions it (e.g. `community_chat_messages.image_url`) | stays in chat-images (private after P3c); needs signed URLs in the reader |
| referenced-other-table | some other public text/jsonb column mentions it | review by hand before P3c |
| orphan-test-upload (name heuristic) | no reference and the name looks like a test | keep; owner decides later |
| unknown-unreferenced | no reference found | keep; owner decides later; NOT deleted |

| # | object name (from the query) | prefix | depth | bytes | mimetype | created | referenced by (table.column x rows) | category | decision (copy / keep) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | |
| ... | (17 rows) | | | | | | | | |

Totals to confirm: referenced-by-profile-or-event = 6 (P3c's `PUBLIC_ASSETS_MIN`), unreferenced = 11. If the count of assets to copy differs from 6, change the literal in `build.mjs` (`PUBLIC_ASSETS_MIN`) and regenerate.
Limits of the query: matches `chat-images/<name>` as a substring in text/varchar/json/jsonb columns of public base tables (not arrays, not `_bak_` tables, not outside `public`); a reference stored in an external system (a social post, an email) is invisible to it.
