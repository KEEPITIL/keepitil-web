/* node --test: the staging-only preflight and its NEGATIVE CONTROLS (Sentinel S5). All values are synthetic; JWTs are built locally with fake signatures. */
import test from "node:test";
import assert from "node:assert/strict";
import { checkStaging, DENY_REFS } from "./preflight-staging-only.mjs";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (role, ref) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role, ref })}.sig`;
const STAGING = "abcdefghijklmnopqrst";
const good = () => ({ KIL_STAGING_REF: STAGING, SUPABASE_URL: `https://${STAGING}.supabase.co`, SUPABASE_ANON_KEY: jwt("anon", STAGING), SUPABASE_SERVICE_ROLE_KEY: jwt("service_role", STAGING),
  STRIPE_SECRET_KEY: "sk_test_FAKEFAKEFAKE", STRIPE_PUBLISHABLE_KEY: "pk_test_FAKEFAKEFAKE", STRIPE_WEBHOOK_SECRET: "whsec_FAKEFAKEFAKE", KIL_SITE_URL: "https://staging.example.test", KIL_WEBHOOK_ENDPOINT_URL: `https://${STAGING}.supabase.co/functions/v1/stripe-webhook` });
const fails = (env, re) => { const r = checkStaging(env); assert.equal(r.ok, false); assert.ok(r.failed.some((f) => re.test(f)), `expected a failure matching ${re}; got ${JSON.stringify(r.failed)}`); };

test("control: a fully staging / test configuration passes", () => assert.deepEqual(checkStaging(good()), { ok: true, failed: [] }));
test("NC: production, kode and nexus project refs are refused (as the ref, the URL host, and inside a key's ref claim)", () => {
  for (const ref of Object.keys(DENY_REFS)) { fails({ ...good(), KIL_STAGING_REF: ref, SUPABASE_URL: `https://${ref}.supabase.co`, SUPABASE_ANON_KEY: jwt("anon", ref), SUPABASE_SERVICE_ROLE_KEY: jwt("service_role", ref) }, /denied project/); }
  fails({ ...good(), SUPABASE_URL: "https://ovmqtzjfpzrbzrlkxwgw.supabase.co" }, /SUPABASE_URL host/);
  fails({ ...good(), SUPABASE_SERVICE_ROLE_KEY: jwt("service_role", "ovmqtzjfpzrbzrlkxwgw") }, /service_role|ref claim|denied project ref/);
});
test("NC: a live Stripe key in ANY slot is refused", () => { for (const k of ["STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY"]) fails({ ...good(), [k]: k.includes("SECRET") ? "sk_live_FAKEFAKE" : "pk_live_FAKEFAKE" }, /TEST key|live Stripe/); fails({ ...good(), STRIPE_SECRET_KEY: "rk_live_FAKEFAKE" }, /TEST key/); });
test("NC: checkout redirects / site URL on keepitil.com are refused (apex, www, subdomain, github.io); http non-loopback refused; loopback allowed", () => {
  for (const u of ["https://keepitil.com", "https://www.keepitil.com/", "https://app.keepitil.com", "https://keepitil.github.io"]) fails({ ...good(), KIL_SITE_URL: u }, /KIL_SITE_URL/);
  fails({ ...good(), KIL_SITE_URL: "http://staging.example.test" }, /KIL_SITE_URL/); fails({ ...good(), KIL_SITE_URL: "" }, /KIL_SITE_URL/);
  assert.equal(checkStaging({ ...good(), KIL_SITE_URL: "http://127.0.0.1:8080" }).ok, true);
});
test("NC: the webhook endpoint must be the staging function, not another host or function", () => {
  fails({ ...good(), KIL_WEBHOOK_ENDPOINT_URL: "https://ovmqtzjfpzrbzrlkxwgw.supabase.co/functions/v1/stripe-webhook" }, /KIL_WEBHOOK_ENDPOINT_URL/);
  fails({ ...good(), KIL_WEBHOOK_ENDPOINT_URL: `https://${STAGING}.supabase.co/functions/v1/create-checkout` }, /KIL_WEBHOOK_ENDPOINT_URL/);
  fails({ ...good(), KIL_WEBHOOK_ENDPOINT_URL: "https://example.test/functions/v1/stripe-webhook" }, /KIL_WEBHOOK_ENDPOINT_URL/);
});
test("NC: keys whose ref claim is not the staging ref, or whose role is swapped, are refused; missing values are refused", () => {
  fails({ ...good(), SUPABASE_ANON_KEY: jwt("anon", "zzzzzzzzzzzzzzzzzzzz") }, /ref claim/);
  fails({ ...good(), SUPABASE_ANON_KEY: jwt("service_role", STAGING), SUPABASE_SERVICE_ROLE_KEY: jwt("anon", STAGING) }, /role/);
  for (const k of Object.keys(good())) { const e = good(); delete e[k]; assert.equal(checkStaging(e).ok, false, "missing " + k); }
});
test("NC: production writes flag and any value mentioning a denied ref are refused", () => { fails({ ...good(), KIL_PRODUCTION_WRITES: "1" }, /PRODUCTION_WRITES/); fails({ ...good(), KIL_NOTE: "see ovmqtzjfpzrbzrlkxwgw" }, /denied project ref/); });
test("the failure output never contains a key or token value", () => { const e = { ...good(), STRIPE_SECRET_KEY: "sk_live_SUPERSECRETVALUE" }; const out = JSON.stringify(checkStaging(e)); assert.ok(!out.includes("SUPERSECRETVALUE")); });

test("NC (round 2): the production ref is refused in a variable of ANY name; a missing KIL_SITE_URL has NO default and is refused", () => {
  fails({ ...good(), NOTES_FOR_ME: "db is ovmqtzjfpzrbzrlkxwgw" }, /ANY name/);
  const e = good(); delete e.KIL_SITE_URL; fails(e, /KIL_SITE_URL/);
});
