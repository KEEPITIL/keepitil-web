/* node --test db/proposed/12a-door-hardening/adapter/door-scan-adapter.test.mjs   (pure JS; no database, no network, no page) */
import test from "node:test";
import assert from "node:assert/strict";
import { normalizePayload, buildScanRequest, adaptScanResponse, adaptTicketResponse, UI, CODES } from "./door-scan-adapter.mjs";

const TOKEN = "0123456789abcdef0123456789abcdef";
const SECRETS = ["buyer@example.invalid", "buyer_handle_x", "+1 555 0100", TOKEN];

test("normalizePayload: trim, strip one KIL- prefix in any case, trim again", () => {
  assert.equal(normalizePayload(TOKEN), TOKEN);
  assert.equal(normalizePayload("KIL-" + TOKEN), TOKEN);
  assert.equal(normalizePayload("kil-" + TOKEN), TOKEN);
  assert.equal(normalizePayload("Kil-" + TOKEN), TOKEN);
  assert.equal(normalizePayload(" \tKIL-" + TOKEN + "\n "), TOKEN);
  assert.equal(normalizePayload("KIL-KIL-" + TOKEN), "KIL-" + TOKEN);   // only ONE prefix, same as the database
  assert.equal(normalizePayload(null), ""); assert.equal(normalizePayload(undefined), ""); assert.equal(normalizePayload("KIL-"), "");
});

test("buildScanRequest: rpc name + argument name match the database; empty/oversized payloads are not sent", () => {
  assert.deepEqual(buildScanRequest("KIL-" + TOKEN), { rpc: "event_checkin_scan", args: { p_qr_token: TOKEN } });
  assert.equal(buildScanRequest(""), null); assert.equal(buildScanRequest("   "), null); assert.equal(buildScanRequest("KIL-"), null); assert.equal(buildScanRequest("x".repeat(129)), null);
});

test("every result code has UI wording and the list of codes is closed", () => {
  for (const c of CODES) { assert.ok(UI[c] && UI[c].title && UI[c].detail && UI[c].tone, c); }
  assert.equal(adaptScanResponse({ ok: false, result: "something_new" }).code, "error");
});

test("scan: admitted / already_used keep ONLY event title, tier, qty, checked_in_at", () => {
  const a = adaptScanResponse({ data: { ok: true, result: "admitted", message: "Admitted", event_title: "Doors Open", tier: "VIP", qty: 2, checked_in_at: "2026-11-09T22:45:28.798043-08:00" }, error: null });
  assert.equal(a.ok, true); assert.equal(a.code, "admitted"); assert.deepEqual(a.admission, { eventTitle: "Doors Open", tier: "VIP", qty: 2, checkedInAt: "2026-11-09T22:45:28.798043-08:00" });
  const b = adaptScanResponse({ ok: false, result: "already_used", event_title: "Doors Open", tier: "GA", qty: 1, checked_in_at: "2026-01-01T10:00:00+00:00" });
  assert.equal(b.ok, false); assert.equal(b.code, "already_used"); assert.equal(b.admission.tier, "GA");
});

test("NO-CONTACT even if the server regresses: buyer / email / handle / phone / token keys and values never reach the result", () => {
  const evil = { ok: true, result: "admitted", event_title: "Doors Open", tier: "VIP", qty: 1, checked_in_at: "2026-11-09T22:45:28-08:00",
    buyer: "buyer@example.invalid", buyer_email: "buyer@example.invalid", buyer_handle: "buyer_handle_x", phone: "+1 555 0100", qr_token: TOKEN, message: "Admitted " + TOKEN };
  for (const r of [adaptScanResponse(evil), adaptScanResponse({ data: evil }), adaptTicketResponse({ status: "valid", event: "Doors Open", tier: "VIP", qty: 1, at: "2026-11-09T22:45:28-08:00", buyer: "buyer@example.invalid", qr_token: TOKEN, phone: "+1 555 0100", buyer_handle: "buyer_handle_x" })]) {
    const s = JSON.stringify(r); for (const x of SECRETS) assert.equal(s.includes(x), false, x + " leaked");
    assert.deepEqual(Object.keys(r).sort(), ["admission", "code", "eventTitle", "ok", "ui"].sort());
  }
});

test("TOKEN-FREE: a server message that echoes the token is never surfaced; the UI strings never contain it", () => {
  const r = adaptScanResponse({ ok: false, result: "invalid", message: "No ticket " + TOKEN });
  assert.equal(JSON.stringify(r).includes(TOKEN), false); assert.equal(r.ui.detail.includes(TOKEN), false);
  const e = adaptScanResponse({ data: null, error: { message: "bad input " + TOKEN } });
  assert.equal(JSON.stringify(e).includes(TOKEN), false);
});

test("scan: non-owner / unpaid / invalid / empty / unauth map to the right code and tone", () => {
  assert.equal(adaptScanResponse({ ok: false, result: "forbidden" }).ui.title, "Not your event");
  assert.equal(adaptScanResponse({ ok: false, result: "unpaid", event_title: "Doors Open" }).code, "unpaid");
  assert.equal(adaptScanResponse({ ok: false, result: "invalid" }).ui.tone, "error");
  assert.equal(adaptScanResponse({ ok: false, result: "empty" }).ui.tone, "neutral");
  assert.equal(adaptScanResponse({ ok: false, result: "unauth" }).code, "unauth");
});

test("transport failures: permission/JWT errors -> unauth, anything else -> generic error; garbage in -> error; never throws", () => {
  assert.equal(adaptScanResponse({ data: null, error: { code: "42501", message: "permission denied for function event_checkin_scan" } }).code, "unauth");
  assert.equal(adaptScanResponse({ data: null, error: { code: "PGRST301", message: "JWT expired" } }).code, "unauth");
  assert.equal(adaptScanResponse({ data: null, error: { message: "Failed to fetch" } }).code, "error");
  for (const g of [null, undefined, 5, "x", [], [1], {}, { data: "x" }, { data: [] }]) assert.equal(adaptScanResponse(g).code, "error");
});

test("legacy check_in_ticket statuses map onto the same canonical codes", () => {
  const m = { valid: "admitted", already: "already_used", notpaid: "unpaid", notyours: "forbidden", notfound: "invalid", unauth: "unauth" };
  for (const [s, c] of Object.entries(m)) assert.equal(adaptTicketResponse({ status: s, event: "E", tier: "GA", qty: 1, at: null, checked_in: 1, sold: 2 }).code, c);
  assert.equal(adaptTicketResponse({ status: "wat" }).code, "error");
  const v = adaptTicketResponse({ status: "valid", event: "Doors Open", tier: "VIP", qty: 2, checked_in: 3, sold: 9, at: "2026-11-09T22:45:28-08:00" });
  assert.deepEqual(v.admission, { eventTitle: "Doors Open", tier: "VIP", qty: 2, checkedInAt: "2026-11-09T22:45:28-08:00" });
});

test("field hygiene: wrong types are dropped, long strings are truncated", () => {
  const r = adaptScanResponse({ ok: true, result: "admitted", event_title: "x".repeat(500), tier: { a: 1 }, qty: "2", checked_in_at: "not a date" });
  assert.equal(r.admission.eventTitle.length, 200); assert.equal(r.admission.tier, null); assert.equal(r.admission.qty, null); assert.equal(r.admission.checkedInAt, null);
});
