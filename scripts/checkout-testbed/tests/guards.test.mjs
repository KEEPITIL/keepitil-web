/* guards.test.mjs - node --test: the NO-LIVE-MODE / LOCAL-ONLY guards and the Stripe-signature shim. No database needed. Negative controls are marked NC. */
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { refuseLiveKeys, refuseNonLocalHosts, assertLocalUrl, GuardError, hostOf } from "../lib/guards.mjs";
import { signJwt, verifyJwt } from "../lib/jwt.mjs";
import { encodeForm, decodeForm } from "../lib/form.mjs";

const throwsGuard = (fn) => assert.throws(fn, (e) => e instanceof GuardError);
test("NC: live keys are refused wherever they appear", () => {
  for (const v of ["sk_live_x", "pk_live_x", "rk_live_x"]) throwsGuard(() => refuseLiveKeys({ ANY_NAME: v }));
});
test("NC: a webhook secret that is not the local fake is refused", () => { throwsGuard(() => refuseLiveKeys({ STRIPE_WEBHOOK_SECRET: "whsec_abc123" })); });
test("NC: a real-looking Stripe TEST key is refused (belongs in staging, not the local bed)", () => { throwsGuard(() => refuseLiveKeys({ STRIPE_SECRET_KEY: "sk_test_51abc" })); throwsGuard(() => refuseLiveKeys({ P: "pk_test_51abc" })); });
test("the local fakes are accepted", () => { refuseLiveKeys({ STRIPE_SECRET_KEY: "sk_test_local_FAKEabc", STRIPE_WEBHOOK_SECRET: "whsec_localtestabc", PUB: "pk_test_local_FAKEabc", PATH: "/usr/bin" }); });
test("NC: a non-127.0.0.1 host in any testbed URL/host variable is refused", () => {
  for (const e of [{ SUPABASE_URL: "https://x.supabase.co" }, { KIL_FAKE_STRIPE_BASE: "http://localhost:1234" }, { STRIPE_API_HOST: "api.stripe.com:443" }, { FAKE_URL: "http://192.168.1.113:80" }]) throwsGuard(() => refuseNonLocalHosts(e));
});
test("127.0.0.1 passes; unrelated env is ignored", () => { refuseNonLocalHosts({ SUPABASE_URL: "http://127.0.0.1:54321", KIL_FAKE_STRIPE_BASE: "http://127.0.0.1:9", HOME_URL: "https://example.com" }); });
test("NC: runtime URL guard refuses stripe.com, supabase.co, localhost, LAN; allows 127.0.0.1", () => {
  for (const u of ["https://api.stripe.com/v1", "https://abc.supabase.co", "http://localhost:1", "http://10.0.0.1", "not a url"]) throwsGuard(() => assertLocalUrl(u));
  assert.equal(assertLocalUrl("http://127.0.0.1:5/x"), "http://127.0.0.1:5/x"); assert.equal(hostOf("127.0.0.1:80"), "127.0.0.1");
});
test("JWT shim: signed token verifies; tampered / wrong-secret / expired are rejected", () => {
  const t = signJwt({ sub: "u", exp: Math.floor(Date.now() / 1000) + 60 }, "s1"); assert.equal(verifyJwt(t, "s1").sub, "u");
  assert.equal(verifyJwt(t, "s2"), null); assert.equal(verifyJwt(t.slice(0, -2) + "AA", "s1"), null); assert.equal(verifyJwt(signJwt({ sub: "u", exp: 1 }, "s1"), "s1"), null);
});
test("form encoding round-trips Stripe bracket notation", () => {
  const o = { mode: "payment", line_items: [{ quantity: 2, price_data: { unit_amount: 100 } }], metadata: { a: "1" } };
  assert.deepEqual(decodeForm(encodeForm(o)), { mode: "payment", line_items: [{ quantity: "2", price_data: { unit_amount: "100" } }], metadata: { a: "1" } });
});
test("Stripe signature shim: valid ok; tampered body, wrong secret, stale timestamp, missing header all throw (NC)", async () => {
  process.env.KIL_FAKE_STRIPE_BASE = "http://127.0.0.1:9";
  const { default: Stripe } = await import("../shims/stripe.mjs"); const s = new Stripe("sk_test_local_FAKEx", {});
  const body = JSON.stringify({ id: "evt", amount: 5 }), t = Math.floor(Date.now() / 1000), sec = "whsec_localtestx";
  const h = (b, k = sec, tt = t) => `t=${tt},v1=${createHmac("sha256", k).update(`${tt}.${b}`).digest("hex")}`;
  assert.equal((await s.webhooks.constructEventAsync(body, h(body), sec)).id, "evt");
  await assert.rejects(s.webhooks.constructEventAsync(body.replace("5", "6"), h(body), sec));
  await assert.rejects(s.webhooks.constructEventAsync(body, h(body, "whsec_localtestOTHER"), sec));
  await assert.rejects(s.webhooks.constructEventAsync(body, h(body, sec, t - 1000), sec));
  await assert.rejects(s.webhooks.constructEventAsync(body, undefined, sec));
  assert.throws(() => new Stripe("sk_live_real", {}));
});

/* Sentinel S1, round 2: the production ref is refused BY NAME, in any variable, even one that is never dialled. */
import { refuseProductionRefs, guardEnv, PROD_REF } from "../lib/guards.mjs";
test("NC: the production ref is refused in ANY variable name (value never echoed)", () => {
  for (const k of ["PGHOST", "SUPABASE_URL", "SOMETHING_UNRELATED", "NOTES"]) {
    assert.throws(() => refuseProductionRefs({ [k]: `https://${PROD_REF}.supabase.co` }), (e) => e instanceof GuardError && e.message.includes(k) && !e.message.includes(PROD_REF));
  }
  assert.throws(() => guardEnv({ X: "db." + PROD_REF }), (e) => e instanceof GuardError);
});
test("NC: kode / NEXUS / staging refs are refused in database-ish variables only", () => {
  for (const ref of ["xdoxfoectugsbbujjezq", "dojmswwxmdtizrtoirem", "efuuwcgifgbukplrbyuf"]) {
    assert.throws(() => refuseProductionRefs({ SUPABASE_URL: `https://${ref}.supabase.co` }), (e) => e instanceof GuardError);
    assert.throws(() => refuseProductionRefs({ KIL_STAGING_REF: ref }), (e) => e instanceof GuardError);
    refuseProductionRefs({ MY_NOTES: ref });          // an unrelated variable is not our business for these three
  }
});
test("clean environments pass", () => { refuseProductionRefs({ PATH: "/usr/bin", PGHOST: "/Users/x/work/pg-local/run", SUPABASE_URL: "http://127.0.0.1:54321" }); });
