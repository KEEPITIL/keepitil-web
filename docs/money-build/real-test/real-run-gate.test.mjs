/* node --test: the real-run gate and the redirect check, with NEGATIVE CONTROLS (Sentinel S5, round 2). Synthetic values only. */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runGated } from "./real-run-gate.mjs";
import { checkRedirect } from "./check-session-redirect.mjs";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (role, ref) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role, ref })}.sig`;
const S = "abcdefghijklmnopqrst";
const good = () => ({ KIL_STAGING_REF: S, SUPABASE_URL: `https://${S}.supabase.co`, SUPABASE_ANON_KEY: jwt("anon", S), SUPABASE_SERVICE_ROLE_KEY: jwt("service_role", S), STRIPE_SECRET_KEY: "sk_test_FAKEFAKEFAKE", STRIPE_PUBLISHABLE_KEY: "pk_test_FAKEFAKEFAKE", STRIPE_WEBHOOK_SECRET: "whsec_FAKEFAKEFAKE", KIL_SITE_URL: "https://staging.example.test", KIL_WEBHOOK_ENDPOINT_URL: `https://${S}.supabase.co/functions/v1/stripe-webhook` });
const fake = (rec) => (cmd, args) => { rec.push([cmd, ...args]); return { status: 0 }; };

test("control: a staging / test configuration runs the command, through the gate", () => {
  const rec = []; const r = runGated(["echo", "hi"], good(), fake(rec));
  assert.deepEqual({ code: r.code, ran: r.ran }, { code: 0, ran: true }); assert.equal(rec.length, 1);
});
test("NC: every broken configuration refuses (exit 2) and the command is NEVER spawned", () => {
  const broken = {
    "KIL_SITE_URL unset (no production or any default)": (e) => { delete e.KIL_SITE_URL; },
    "KIL_SITE_URL = keepitil.com": (e) => { e.KIL_SITE_URL = "https://keepitil.com"; },
    "KIL_SITE_URL = github.io mirror": (e) => { e.KIL_SITE_URL = "https://keepitil.github.io"; },
    "SUPABASE_URL = prod ref": (e) => { e.SUPABASE_URL = "https://ovmqtzjfpzrbzrlkxwgw.supabase.co"; },
    "SUPABASE_URL = kode ref": (e) => { e.SUPABASE_URL = "https://xdoxfoectugsbbujjezq.supabase.co"; },
    "SUPABASE_URL = nexus ref": (e) => { e.SUPABASE_URL = "https://dojmswwxmdtizrtoirem.supabase.co"; },
    "prod ref hidden in an unrelated KIL_ variable": (e) => { e.KIL_NOTE = "see ovmqtzjfpzrbzrlkxwgw"; },
    "live Stripe secret key": (e) => { e.STRIPE_SECRET_KEY = "sk_live_FAKEFAKE"; },
    "live publishable key": (e) => { e.STRIPE_PUBLISHABLE_KEY = "pk_live_FAKEFAKE"; },
    "webhook endpoint on prod": (e) => { e.KIL_WEBHOOK_ENDPOINT_URL = "https://ovmqtzjfpzrbzrlkxwgw.supabase.co/functions/v1/stripe-webhook"; },
    "webhook secret missing": (e) => { delete e.STRIPE_WEBHOOK_SECRET; },
    "service key for another project": (e) => { e.SUPABASE_SERVICE_ROLE_KEY = jwt("service_role", "zzzzzzzzzzzzzzzzzzzz"); },
    "anon and service keys swapped": (e) => { const a = e.SUPABASE_ANON_KEY; e.SUPABASE_ANON_KEY = e.SUPABASE_SERVICE_ROLE_KEY; e.SUPABASE_SERVICE_ROLE_KEY = a; },
    "production writes switch on": (e) => { e.KIL_PRODUCTION_WRITES = "1"; },
    "empty environment": (e) => { for (const k of Object.keys(e)) delete e[k]; },
  };
  for (const [name, mutate] of Object.entries(broken)) { const env = good(); mutate(env); const rec = []; const r = runGated(["echo", "x"], env, fake(rec)); assert.equal(r.code, 2, name); assert.equal(r.ran, false, name); assert.equal(rec.length, 0, name + ": command must not spawn"); assert.ok(r.failed.length > 0, name); }
});
test("NC (end to end, real process): the CLI exits 2 and its command's side effect does not happen when the gate refuses; it happens when the gate passes", () => {
  const d = mkdtempSync(join(tmpdir(), "kil-gate-")); const marker = join(d, "ran");
  try {
    const gateCli = new URL("./real-run-gate.mjs", import.meta.url).pathname;
    const bad = { PATH: process.env.PATH, KIL_SITE_URL: "https://keepitil.com" };
    const r1 = spawnSync(process.execPath, [gateCli, "--", "touch", marker], { env: bad, encoding: "utf8" });
    assert.equal(r1.status, 2); assert.equal(existsSync(marker), false); assert.match(r1.stderr, /REFUSED/);
    const r2 = spawnSync(process.execPath, [gateCli, "--", "touch", marker], { env: { ...good(), PATH: process.env.PATH }, encoding: "utf8" });
    assert.equal(r2.status, 0, r2.stderr); assert.equal(existsSync(marker), true);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
test("N4 automated: session redirects must be on the staging site host; keepitil.com, other hosts, missing URLs and live-mode sessions fail", () => {
  const env = { KIL_SITE_URL: "https://staging.example.test" };
  const ok = { success_url: "https://staging.example.test/event.html?e=1&paid=1", cancel_url: "https://staging.example.test/event.html?e=1", livemode: false };
  assert.deepEqual(checkRedirect(ok, env), { ok: true, failed: [] });
  for (const [name, s] of Object.entries({ "success on keepitil.com": { ...ok, success_url: "https://keepitil.com/event.html?e=1" }, "cancel on www": { ...ok, cancel_url: "https://www.keepitil.com/event.html" }, "other host": { ...ok, success_url: "https://example.test/x" }, "missing cancel": { ...ok, cancel_url: undefined }, "live mode": { ...ok, livemode: true }, "empty session": {} })) {
    const r = checkRedirect(s, env); assert.equal(r.ok, false, name); assert.ok(r.failed.length > 0, name);
  }
  assert.equal(checkRedirect(ok, { KIL_SITE_URL: "" }).ok, false, "no site configured");
});
