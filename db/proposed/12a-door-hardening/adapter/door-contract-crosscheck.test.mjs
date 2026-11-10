/* node --test db/proposed/12a-door-hardening/adapter/door-contract-crosscheck.test.mjs   (pure JS; parses files; no database, no network)
   The cross-check between #137 (hardened SQL) and #141/#142 (door UI adapter): every result code the SQL can return is mapped by the adapter and vice versa.
   NEGATIVE CONTROLS: each deliberately broken copy (unmapped SQL code, renamed ticket status, adapter code removed, new core code, leaked key, dead adapter code, wrong mapping) MUST produce a problem. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { crossCheck, coreCodes, wrapperBranches, adapterFacts } from "./door-contract-check.mjs";
import { CODES, UI, adaptScanResponse, adaptTicketResponse } from "./door-scan-adapter.mjs";

const HERE = join(dirname(fileURLToPath(import.meta.url)), "..");
const rd = (...p) => readFileSync(join(HERE, ...p), "utf8");
const REAL = { core: rd("src", "door_checkin_core.sql"), scan: rd("src", "event_checkin_scan.hardened.sql"), ticket: rd("src", "check_in_ticket.hardened.sql"), adapter: rd("adapter", "door-scan-adapter.mjs") };
const withChange = (k, from, to) => { assert.ok(REAL[k].includes(from), "anchor missing in " + k + ": " + from); return { ...REAL, [k]: REAL[k].replace(from, to) }; };
const hit = (problems, re) => problems.some((x) => re.test(x));

test("REAL sources: SQL result codes and adapter mapping agree both ways (no problems)", () => { assert.deepEqual(crossCheck(REAL), []); });

test("parsed facts are what the contract says (guards the parser itself)", () => {
  assert.deepEqual([...coreCodes(REAL.core)].sort(), ["admitted", "already_used", "empty", "forbidden", "invalid", "unauth", "unpaid"]);
  const S = wrapperBranches(REAL.scan, "result"), T = wrapperBranches(REAL.ticket, "status");
  assert.deepEqual(S.branches.map((b) => b.out).sort(), ["admitted", "already_used", "empty", "forbidden", "invalid", "unpaid"]); assert.equal(S.fall.out, "unauth");
  assert.deepEqual(T.branches.map((b) => b.out).sort(), ["already", "notfound", "notpaid", "notyours", "valid"]); assert.equal(T.fall.out, "unauth");
  const A = adapterFacts(REAL.adapter); assert.deepEqual(A.ticket, { valid: "admitted", already: "already_used", notpaid: "unpaid", notyours: "forbidden", notfound: "invalid", unauth: "unauth" });
  assert.deepEqual(A.codes, CODES); assert.deepEqual([...A.ui].sort(), [...Object.keys(UI)].sort());
});

test("real adapter functions agree with the parsed mapping: every SQL scan result and ticket status adapts to a non-error canonical code", () => {
  const S = wrapperBranches(REAL.scan, "result"), T = wrapperBranches(REAL.ticket, "status");
  for (const r of [...S.branches.map((b) => b.out), S.fall.out]) assert.notEqual(adaptScanResponse({ data: { ok: r === "admitted", result: r }, error: null }).code, "error", r);
  for (const r of [...T.branches.map((b) => b.out), T.fall.out]) assert.notEqual(adaptTicketResponse({ data: { status: r }, error: null }).code, "error", r);
});

test("NEGATIVE CONTROL 1: a new scan result code the adapter does not map is reported (and a real adapter turns it into 'error')", () => {
  const bad = withChange("scan", "  elsif c = 'invalid' then", "  elsif c = 'refund_pending' then\n    return pg_catalog.jsonb_build_object('ok', false, 'result', 'refund_pending', 'message', 'x');\n  elsif c = 'invalid' then");
  const p = crossCheck(bad); assert.ok(hit(p, /UNMAPPED scan result 'refund_pending'/), JSON.stringify(p)); assert.ok(hit(p, /branch for 'refund_pending' but the core never returns it/));
  assert.equal(adaptScanResponse({ data: { ok: false, result: "refund_pending" }, error: null }).code, "error");
});
test("NEGATIVE CONTROL 2: renaming a ticket status in the SQL ('notyours' -> 'notmine') is reported", () => {
  const p = crossCheck(withChange("ticket", "'status', 'notyours'", "'status', 'notmine'")); assert.ok(hit(p, /UNMAPPED ticket status 'notmine'/), JSON.stringify(p)); assert.ok(hit(p, /DEAD adapter ticket status 'notyours'/));
});
test("NEGATIVE CONTROL 3: removing 'unpaid' from the adapter CODES is reported as an unmapped SQL code", () => {
  const p = crossCheck(withChange("adapter", '"admitted", "already_used", "unpaid",', '"admitted", "already_used",')); assert.ok(hit(p, /UNMAPPED scan result 'unpaid'/), JSON.stringify(p));
});
test("NEGATIVE CONTROL 4: a new core code that a wrapper does not handle is reported (it would silently become 'unauth')", () => {
  const p = crossCheck(withChange("core", "return pg_catalog.jsonb_build_object('code', 'empty');", "return pg_catalog.jsonb_build_object('code', 'throttled');")); assert.ok(hit(p, /core code 'throttled' has no branch/), JSON.stringify(p));
});
test("NEGATIVE CONTROL 5: leaking a contact key in the scan response is reported", () => {
  const p = crossCheck(withChange("scan", "'event_title', r->'event_title', 'tier', r->'tier', 'qty', r->'qty', 'checked_in_at', r->'checked_in_at');\n  elsif c = 'already_used'", "'event_title', r->'event_title', 'buyer', r->'buyer', 'checked_in_at', r->'checked_in_at');\n  elsif c = 'already_used'"));
  assert.ok(hit(p, /key 'buyer'/), JSON.stringify(p));
});
test("NEGATIVE CONTROL 6: a dead adapter code (listed, never returned by SQL) is reported", () => {
  const p = crossCheck(withChange("adapter", '"unauth", "error"];', '"unauth", "legacy_ok", "error"];')); assert.ok(hit(p, /DEAD adapter code 'legacy_ok'/), JSON.stringify(p));
});
test("NEGATIVE CONTROL 7: a wrong ticket mapping (notpaid -> 'forbidden') is reported", () => {
  const p = crossCheck(withChange("adapter", "notpaid: \"unpaid\"", "notpaid: \"forbidden\"")); assert.ok(hit(p, /core 'unpaid' -> status 'notpaid' -> adapter canonical 'forbidden'/), JSON.stringify(p));
});
test("NEGATIVE CONTROL 8: the adapter reading a key the SQL never emits is reported", () => {
  const p = crossCheck(withChange("adapter", 'const SCAN_KEYS = ["ok",', 'const SCAN_KEYS = ["buyer", "ok",')); assert.ok(hit(p, /SCAN_KEYS reads 'buyer'/), JSON.stringify(p));
});
test("NEGATIVE CONTROL 9: an unparseable adapter fails loudly instead of passing vacuously", () => {
  const p = crossCheck({ ...REAL, adapter: "export const nothing = 1;" }); assert.ok(hit(p, /could not be parsed/));
});
