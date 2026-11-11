/* scenario-settled.mjs - "payment settled" proof for the stripe-webhook ticket branch (DRAFT). LOCAL ONLY, simulated Stripe, no secrets, 127.0.0.1 only (same guards as scenario.mjs).
   Two edge hosts serve the webhook: (1) the DEPLOYED v52 source, unmodified (md5-pinned) = NEGATIVE CONTROL; (2) a PATCHED COPY made at run time by applying
   patches/stripe-webhook-payment-settled.PROPOSED.diff (the handoff diff from PR #154) to a copy of the deployed source. The deployed file itself is never modified.
   Usage: node --no-warnings scenario-settled.mjs      (run-settled.sh starts/stops Postgres around it and enforces the load gate) */
import { registerToken, redact } from "./lib/redact.mjs";   // FIRST: no QR token in any log or evidence file (Atlas 2 / S4)
import "./shims/register.mjs";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdirSync, writeFileSync as writeFileSyncRaw, readFileSync, copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { guardEnv, installEgressGuard } from "./lib/guards.mjs";
import { signJwt } from "./lib/jwt.mjs";
import { FakeStripe } from "./lib/fake-stripe.mjs";
import { startEdgeHost, verifyDeployedSources, DEPLOYED, md5File } from "./lib/edge-host.mjs";
import { buildTemplates, insertFixture, PG } from "./lib/testbed-db.mjs";

const writeFileSync2 = (f, d) => writeFileSyncRaw(f, typeof d === "string" ? redact(d) : d);   // evidence files are redacted too
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.KIL_OUT || join(HERE, "out"); mkdirSync(OUT, { recursive: true });
const results = []; const rnd = () => randomBytes(12).toString("hex");
async function step(id, name, fn) { let r; try { r = await fn(); } catch (e) { r = { pass: false, note: "EXCEPTION " + (e?.stack || e) }; } results.push({ id, name, pass: !!r.pass, note: r.note || "" }); console.log(`${r.pass ? "PASS" : "FAIL"}  ${id}  ${name}${r.note ? "\n        " + String(r.note).replace(/\n/g, "\n        ") : ""}`); }

async function main() {
  console.log("== webhook payment-settled proof: LOCAL ONLY, simulated Stripe, DRAFT ==");
  guardEnv(process.env); installEgressGuard();
  const src = verifyDeployedSources(); console.log("deployed sources (unmodified, md5-pinned):", JSON.stringify(src));
  const jwtSecret = "jwtlocalFAKE" + rnd(), whsec = "whsec_localtest" + rnd(), sk = "sk_test_local_FAKE" + rnd();
  const anonKey = signJwt({ role: "anon", iss: "local-testbed" }, jwtSecret), serviceKey = signJwt({ role: "service_role", iss: "local-testbed" }, jwtSecret);
  const userJwt = (id, email) => signJwt({ role: "authenticated", sub: id, email, exp: Math.floor(Date.now() / 1000) + 3600 }, jwtSecret);
  Object.assign(process.env, { SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_ANON_KEY: anonKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey, STRIPE_SECRET_KEY: sk, STRIPE_WEBHOOK_SECRET: whsec });
  guardEnv(process.env);

  const T = await buildTemplates(); const hardDb = await PG.createDb(T.hard);
  const ids = { org: randomUUID(), buyer: randomUUID(), other: randomUUID(), nohandle: randomUUID(), org2: randomUUID() }; await insertFixture(hardDb.client, ids);
  const shimDb = await PG.newClient(hardDb.name, "authenticator"); globalThis.__KIL_TESTBED = { jwtSecret, client: shimDb.client }; const pc = hardDb.client;
  const q = async (sql, p) => (await pc.query(sql, p)).rows;
  const fake = new FakeStripe({ secretKey: sk, whsec }); const fakeBase = await fake.start(); process.env.KIL_FAKE_STRIPE_BASE = fakeBase; guardEnv(process.env);

  // ---- the patched copy: applied with the system `patch` to a COPY of the deployed source; the diff is the one handed off in PR #154
  const tmp = mkdtempSync(join(tmpdir(), "kil-settled-")); const copy = join(tmp, "index.ts"); copyFileSync(DEPLOYED["stripe-webhook"].file, copy);
  const diff = readFileSync(join(HERE, "patches", "stripe-webhook-payment-settled.PROPOSED.diff"), "utf8");
  execFileSync("patch", ["-p1", "--quiet"], { cwd: tmp, input: diff });
  const patchedMd5 = md5File(copy), deployedMd5 = md5File(DEPLOYED["stripe-webhook"].file);
  const hostU = await startEdgeHost();                                                       // unpatched = the deployed source
  const hostP = await startEdgeHost({ overrides: { "stripe-webhook": copy } });              // patched copy
  console.log(`listeners (127.0.0.1): fake-stripe ${fakeBase}  edge-unpatched ${hostU.base}  edge-patched ${hostP.base}`);

  const call = (token, body) => fetch(hostU.url("create-checkout"), { method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  const buyerTok = userJwt(ids.buyer, "buyer@example.test");
  const TIER = 7;                                                                            // 'Control tier' $5.00, qty_total 50
  const sold = async () => (await q("select qty_sold from public.ticket_tiers where id=$1", [TIER]))[0].qty_sold;
  const orders = (s) => q("select * from public.event_orders where stripe_session_id=$1 order by id", [s]);
  const mkSession = async () => { const r = await call(buyerTok, { items: [{ tier_id: TIER, quantity: 1 }] }); if (r.status !== 200) throw new Error("create-checkout " + JSON.stringify(r)); return fake.sessions.get(r.body.url.split("/").pop()); };
  const evt = (type, s, payment_status) => fake.event(type, { ...fake._pub(s), status: "complete", payment_status, payment_intent: null, customer_details: { email: s.customer_email } });
  const point = (host) => fake.setWebhookTarget(host.url("stripe-webhook"));

  await step("s0", "the diff applies cleanly to a COPY of the pinned deployed v52 source (md5 33840e79...); the deployed file is untouched; the patched copy is a different file", async () => ({ pass: deployedMd5 === "33840e79eebb15fbb5d8a2a02787e002" && patchedMd5 !== deployedMd5 && /payment_status !== "paid"/.test(readFileSync(copy, "utf8")) && !/payment_status/.test(readFileSync(DEPLOYED["stripe-webhook"].file, "utf8")), note: `deployed md5 ${deployedMd5}; patched copy md5 ${patchedMd5}` }));

  point(hostU);
  await step("u1", "NEGATIVE CONTROL (UNPATCHED deployed v52): a signed checkout.session.completed with payment_status 'unpaid' IS FULFILLED: 200, a paid order with a qr_token exists and qty_sold went up -> the hole is real", async () => {
    const s = await mkSession(), n0 = await sold(); const d = await fake.deliver(evt("checkout.session.completed", s, "unpaid")); const o = await orders(s.id);
    return { pass: d.status === 200 && o.length === 1 && o[0].status === "paid" && /^[0-9a-f]{32}$/.test(o[0].qr_token || "") && (await sold()) === n0 + 1, note: `webhook ${d.status}; rows=${o.length}; status=${o[0]?.status}; qty_sold ${n0}->${await sold()}` };
  });

  point(hostP);
  let sAsync;
  await step("p1", "PATCHED: the same unpaid completed event -> 200, NO order, qty_sold unchanged", async () => {
    sAsync = await mkSession(); const n0 = await sold(); const d = await fake.deliver(evt("checkout.session.completed", sAsync, "unpaid")); const o = await orders(sAsync.id);
    return { pass: d.status === 200 && o.length === 0 && (await sold()) === n0, note: `webhook ${d.status}; rows=${o.length}; qty_sold ${n0}->${await sold()}` };
  });
  await step("p2", "PATCHED: then checkout.session.async_payment_succeeded for that session -> exactly ONE paid order, qty_sold +1", async () => {
    const n0 = await sold(); const d = await fake.deliver(evt("checkout.session.async_payment_succeeded", sAsync, "paid")); const o = await orders(sAsync.id);
    return { pass: d.status === 200 && o.length === 1 && o[0].status === "paid" && o[0].qty === 1 && /^[0-9a-f]{32}$/.test(o[0].qr_token || "") && (await sold()) === n0 + 1, note: `webhook ${d.status}; rows=${o.length}; qty_sold ${n0}->${await sold()}` };
  });
  await step("p3", "PATCHED: redelivering the async_payment_succeeded event (Stripe retry) is idempotent: still one row, qty_sold unchanged", async () => {
    const n0 = await sold(); const e = fake.events.filter((x) => x.type === "checkout.session.async_payment_succeeded").at(-1); const d = await fake.deliver(e); const o = await orders(sAsync.id);
    return { pass: d.status === 200 && o.length === 1 && (await sold()) === n0, note: `webhook ${d.status}; rows=${o.length}; qty_sold ${n0}->${await sold()}` };
  });
  await step("p4", "PATCHED regression: a normal paid completed event still fulfils exactly once (and a retry is idempotent)", async () => {
    const s = await mkSession(), n0 = await sold(); const e = evt("checkout.session.completed", s, "paid"); const d = await fake.deliver(e); const d2 = await fake.deliver(e); const o = await orders(s.id);
    return { pass: d.status === 200 && d2.status === 200 && o.length === 1 && o[0].status === "paid" && (await sold()) === n0 + 1, note: `webhook ${d.status}/${d2.status}; rows=${o.length}; qty_sold ${n0}->${await sold()}` };
  });
  await step("p5", "PATCHED: checkout.session.async_payment_failed -> 200, NO order, qty_sold unchanged", async () => {
    const s = await mkSession(), n0 = await sold(); const d = await fake.deliver(evt("checkout.session.async_payment_failed", s, "unpaid")); const o = await orders(s.id);
    return { pass: d.status === 200 && o.length === 0 && (await sold()) === n0, note: `webhook ${d.status}; rows=${o.length}` };
  });
  await step("p6", "PATCHED: payment_status 'no_payment_required' is NOT accepted for tickets: 200, NO order", async () => {
    const s = await mkSession(), n0 = await sold(); const d = await fake.deliver(evt("checkout.session.completed", s, "no_payment_required")); const o = await orders(s.id);
    return { pass: d.status === 200 && o.length === 0 && (await sold()) === n0, note: `webhook ${d.status}; rows=${o.length}` };
  });
  await step("p7", "PATCHED: unpaid completed, THEN paid completed for the same session (settled later by another event) -> one order only after the paid event", async () => {
    const s = await mkSession(); await fake.deliver(evt("checkout.session.completed", s, "unpaid")); const mid = (await orders(s.id)).length; await fake.deliver(evt("checkout.session.completed", s, "paid")); const o = await orders(s.id);
    return { pass: mid === 0 && o.length === 1, note: `after unpaid=${mid}; after paid=${o.length}` };
  });
  await step("p8", "bad signature still refused on the patched host (400, no row): the patch did not touch verification", async () => {
    const s = await mkSession(); const e = evt("checkout.session.completed", s, "paid"); const d = await fake.deliver(e, { header: `t=${Math.floor(Date.now() / 1000)},v1=${"0".repeat(64)}` }); return { pass: d.status === 400 && (await orders(s.id)).length === 0, note: `status ${d.status}` };
  });

  await hostU.stop(); await hostP.stop(); await fake.stop(); await shimDb.disconnect(); await hardDb.close(); await PG.dropDb(T.s0); await PG.dropDb(T.hard); await PG.dropRoles(); await PG.shutdownAdmin();
  writeFileSync2(join(OUT, "settled-evidence.json"), JSON.stringify({ deployedMd5, patchedMd5, diffSha256: createHash("sha256").update(diff).digest("hex") }, null, 1));
}
let failure = null; try { await main(); } catch (e) { failure = e; console.log("FATAL", e?.stack || e); try { await PG.cleanupAll(); await PG.dropRoles(); await PG.shutdownAdmin(); } catch {} }
const pass = results.filter((r) => r.pass).length; console.log("\n===== RESULTS =====");
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.id.padEnd(3)} ${r.name.slice(0, 140)}`);
console.log(`\n${pass}/${results.length} PASS` + (failure ? "  (run aborted: " + failure.message + ")" : ""));
writeFileSync2(join(OUT, "results-settled.json"), JSON.stringify({ results, pass, total: results.length, aborted: failure ? String(failure.message) : null }, null, 1));
process.exit(failure || pass !== results.length ? 1 : 0);
