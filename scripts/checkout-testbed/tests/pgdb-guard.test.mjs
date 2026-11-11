/* S1 / Atlas 1 unit proofs (no database needed): the harness refuses every non-local PostgreSQL host; the redactor removes tokens. */
import test from "node:test";
import assert from "node:assert/strict";
import { assertLocalPgHost } from "../lib/guards.mjs";
import { redact, registerToken, leaks } from "../lib/redact.mjs";

test("assertLocalPgHost accepts only a socket directory or loopback", () => {
  for (const ok of ["/Users/x/work/pg-local/run", "/var/run/postgresql", "127.0.0.1", "::1", "localhost"]) assert.equal(assertLocalPgHost(ok), ok);
  for (const bad of ["db.abcdefghijkl.supabase.co", "aws-0-us-west-1.pooler.supabase.com", "10.0.0.5", "192.168.1.113", "0.0.0.0", "", undefined, null, "127.0.0.1.evil.example", "localhost.evil.example", "relative/path"]) assert.throws(() => assertLocalPgHost(bad), /LOCAL-ONLY/, String(bad));
});
test("redact removes known tokens, qr_tokens fields, KIL- payloads and bare 32-hex but keeps md5 values", () => {
  const tok = "0123456789abcdef0123456789abcdef"; registerToken("Z".repeat(32));
  const before = leaks();
  assert.ok(!redact(`order ${tok} ok`).includes(tok));
  assert.ok(!redact(JSON.stringify({ qr_tokens: [tok, tok] })).includes(tok));
  assert.ok(!redact(`scan KIL-${tok} x`).includes(tok));
  assert.ok(!redact("tok " + "Z".repeat(32)).includes("ZZZZ"));
  assert.ok(leaks() >= before + 4);
  assert.equal(redact('"md5":"33840e79eebb15fbb5d8a2a02787e002"'), '"md5":"33840e79eebb15fbb5d8a2a02787e002"');
  assert.equal(redact("deployed md5 33840e79eebb15fbb5d8a2a02787e002"), "deployed md5 33840e79eebb15fbb5d8a2a02787e002");
});
