// 11A harness: runs the ACTUAL upload_event_photo tool (media.ts) with a mocked db + signing counter.
//   node --experimental-strip-types --test harness/upload-ownership.test.mjs
// - PATCHED = ../media.PROPOSED.ts   - CONTROL = ./deployed-v44/media.ts (verbatim deployed v44)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runCases } from "./cases.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROPOSED = path.join(HERE, "..", "media.PROPOSED.ts");
const DEPLOYED = path.join(HERE, "deployed-v44", "media.ts");
const PATCH = path.join(HERE, "..", "media.ts.PATCH");
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

const patched = await runCases(await import(PROPOSED));
const control = await runCases(await import(DEPLOYED));

test("deployed v44 media.ts is the verbatim source (sha256 pinned)", () => {
  assert.equal(sha(DEPLOYED), "de79b03e09c3c472fcbb1b51469ae489bf17c964ea55d124e166b0d1b043043e");
});

test("media.ts.PATCH applies to deployed v44 media.ts and reproduces media.PROPOSED.ts byte for byte", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "11a-patch-"));
  fs.copyFileSync(DEPLOYED, path.join(dir, "media.ts"));
  execFileSync("patch", ["-s", "-p1", "-i", PATCH], { cwd: dir });
  assert.equal(sha(path.join(dir, "media.ts")), sha(PROPOSED));
});

for (const c of patched) {
  test(`PATCHED ${c.id} [${c.kind}] ${c.title}`, () => assert.ok(c.pass, c.detail));
}

test("PATCHED: every case passes (summary)", () => {
  const failed = patched.filter((c) => !c.pass).map((c) => c.id);
  assert.deepEqual(failed, []);
  console.log(`# PATCHED cases: ${patched.length} pass, 0 fail (deny ${patched.filter((c) => c.kind === "deny").length}, allow ${patched.filter((c) => c.kind === "allow").length}, other ${patched.filter((c) => c.kind === "other").length})`);
});

// ---------------------------------------------------------------- NEGATIVE CONTROL
// The same invariants against the UNPATCHED deployed code. The non-owner cases must FAIL
// (signing-count 1), and the legitimate-owner cases must still PASS (so the harness is not simply broken).
const EXPECT_CONTROL_FAIL_DENY = ["D1", "D1b", "D2", "D2b", "D2c", "D5", "D6", "D7", "D7b"];
const EXPECT_CONTROL_PASS_DENY = ["D3", "D4", "D8"]; // deployed code already denies these (not visible / no match)

test("NEGATIVE CONTROL: unpatched v44 lets non-owners obtain signing (signing-count 1)", () => {
  const byId = Object.fromEntries(control.map((c) => [c.id, c]));
  for (const id of EXPECT_CONTROL_FAIL_DENY) assert.equal(byId[id].pass, false, `control ${id} unexpectedly passed: ${byId[id].detail}`);
  for (const id of EXPECT_CONTROL_PASS_DENY) assert.equal(byId[id].pass, true, `control ${id}: ${byId[id].detail}`);
  for (const c of control.filter((x) => x.kind === "allow")) assert.equal(c.pass, true, `control ${c.id} (owner flow) should still work: ${c.detail}`);
  assert.equal(byId["N1"].pass, false, "control note still says to mark the row published");
  assert.match(byId["D2"].detail, /sign=1 /);
  assert.match(byId["D2c"].detail, /sign=1 insertAttempts=1 rows=1/); // open INSERT policy: the non-owner fully succeeds
  console.log(`# CONTROL (unpatched v44): deny-cases failing ${control.filter((c) => c.kind === "deny" && !c.pass).length}/${control.filter((c) => c.kind === "deny").length}, allow-cases failing ${control.filter((c) => c.kind === "allow" && !c.pass).length}/${control.filter((c) => c.kind === "allow").length}`);
  for (const c of control.filter((x) => x.kind === "deny")) console.log(`#   control ${c.id} ${c.pass ? "pass" : "FAIL"}  ${c.detail}`);
});
