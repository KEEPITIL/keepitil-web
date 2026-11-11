/* scenario.mjs - END-TO-END checkout testbed (DRAFT). Local isolated Postgres + the DEPLOYED create-checkout v58 / stripe-webhook v52 sources (unmodified, shimmed) + a FAKE Stripe with a SIGNED webhook.
   NO live mode, NO real Stripe (egress guard: only 127.0.0.1), NO secrets (fake keys generated at runtime, kept in memory/env only).
   Usage: node --no-warnings scenario.mjs        (run.sh starts/stops Postgres around it and enforces the load gate)
   Output: PASS/FAIL table + JSON in $KIL_OUT (default ./out). */
import { registerToken, redact } from "./lib/redact.mjs";   // FIRST: no QR token in any log or evidence file (Atlas 2 / S4)
import "./shims/register.mjs";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync as writeFileSyncRaw, existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { guardEnv, installEgressGuard, refuseLiveKeys, refuseNonLocalHosts, assertLocalUrl, GuardError } from "./lib/guards.mjs";
import { signJwt } from "./lib/jwt.mjs";
import { FakeStripe } from "./lib/fake-stripe.mjs";
import { startEdgeHost, verifyDeployedSources, DEPLOYED, md5File } from "./lib/edge-host.mjs";
import { mkdtempSync, copyFileSync, readFileSync as readFileSync2 } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { loadJsQR, assertDecodes, JSQR_SHA256 } from "./lib/qr-decode.mjs";
import { buildTemplates, makeReq, insertFixture, PG } from "./lib/testbed-db.mjs";

const writeFileSync2 = (f, d) => writeFileSyncRaw(f, typeof d === "string" ? redact(d) : d);   // evidence files are redacted too
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const OUT = process.env.KIL_OUT || join(HERE, "out"); mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
const results = []; const evidence = {};
const rnd = () => randomBytes(12).toString("hex");
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function step(id, name, fn) {
  let r; try { r = await fn(); } catch (e) { r = { pass: false, note: "EXCEPTION " + (e?.stack || e) }; }
  results.push({ id, name, pass: !!r.pass, note: r.note || "" }); console.log(`${r.pass ? "PASS" : "FAIL"}  ${id}  ${name}${r.note ? "\n        " + String(r.note).replace(/\n/g, "\n        ") : ""}`);
}

async function main() {
  console.log("== checkout testbed: LOCAL ONLY, simulated Stripe, DRAFT ==");
  guardEnv(process.env); installEgressGuard();
  const src = verifyDeployedSources(); console.log("deployed sources (unmodified, md5-pinned):", JSON.stringify(src));
  // ---- fake runtime secrets: memory/env only, never written to a file
  const jwtSecret = "jwtlocalFAKE" + rnd(), whsec = "whsec_localtest" + rnd(), sk = "sk_test_local_FAKE" + rnd();
  const anonKey = signJwt({ role: "anon", iss: "local-testbed" }, jwtSecret), serviceKey = signJwt({ role: "service_role", iss: "local-testbed" }, jwtSecret);
  const userJwt = (id, email) => signJwt({ role: "authenticated", sub: id, email, exp: Math.floor(Date.now() / 1000) + 3600 }, jwtSecret);
  Object.assign(process.env, { SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_ANON_KEY: anonKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey, STRIPE_SECRET_KEY: sk, STRIPE_WEBHOOK_SECRET: whsec });
  guardEnv(process.env);                                             // the testbed's own fake values must pass its guards

  // ---- DB
  const t0 = Date.now(); const T = await buildTemplates();
  console.log("templates built:", JSON.stringify(T.packLog), (Date.now() - t0) + " ms");
  const hardDb = await PG.createDb(T.hard), s0Db = await PG.createDb(T.s0);
  const ids = { org: randomUUID(), buyer: randomUUID(), other: randomUUID(), nohandle: randomUUID(), org2: randomUUID() };
  await insertFixture(hardDb.client, ids); await insertFixture(s0Db.client, ids);
  const shimDb = await PG.newClient(hardDb.name, "authenticator"), reqDb = await PG.newClient(hardDb.name, "authenticator"), s0Cl = await PG.newClient(s0Db.name, "authenticator");
  const shimClient = shimDb.client, reqClient = reqDb.client, s0Client = s0Cl.client;   // raw node-postgres clients (parameterised queries)
  globalThis.__KIL_TESTBED = { jwtSecret, client: shimClient };
  const R = makeReq(reqClient), R0 = makeReq(s0Client), pc = hardDb.client;
  const who = { org: { role: "authenticated", sub: ids.org, email: "organizer@example.test" }, buyer: { role: "authenticated", sub: ids.buyer, email: "buyer@example.test" }, other: { role: "authenticated", sub: ids.other, email: "other@example.test" }, nohandle: { role: "authenticated", sub: ids.nohandle, email: "nohandle@example.test" }, anon: { role: "anon" }, service: { role: "service_role" } };
  const q = async (sql, p) => (await pc.query(sql, p)).rows;

  // ---- fake Stripe + edge host
  const fake = new FakeStripe({ secretKey: sk, whsec }); const fakeBase = await fake.start();
  process.env.KIL_FAKE_STRIPE_BASE = fakeBase; guardEnv(process.env);
  // KIL_PATCHED_WEBHOOK=1: serve the webhook from a COPY of the deployed v52 source with the PR #154 handoff diff applied (deployed file untouched)
  const PATCHED = process.env.KIL_PATCHED_WEBHOOK === "1"; let patchedCopy = null, patchedMd5 = null;
  if (PATCHED) {
    const tmp = mkdtempSync(join(tmpdir(), "kil-full-patched-")); patchedCopy = join(tmp, "index.ts"); copyFileSync(DEPLOYED["stripe-webhook"].file, patchedCopy);
    execFileSync("patch", ["-p1", "--quiet"], { cwd: tmp, input: readFileSync2(join(HERE, "patches", "stripe-webhook-payment-settled.PROPOSED.diff"), "utf8") });
    patchedMd5 = md5File(patchedCopy); if (!/payment_status !== "paid"/.test(readFileSync2(patchedCopy, "utf8")) || patchedMd5 === md5File(DEPLOYED["stripe-webhook"].file)) throw new Error("patched copy not different from deployed source");
    console.log("PATCHED WEBHOOK MODE: patched copy md5", patchedMd5);
  }
  const edge = await startEdgeHost(PATCHED ? { overrides: { "stripe-webhook": patchedCopy } } : undefined); fake.setWebhookTarget(edge.url("stripe-webhook"));
  console.log(`listeners (all 127.0.0.1): fake-stripe ${fakeBase}  edge-host ${edge.base}`);

  const cfg = Object.fromEntries((await q("select key, value from public.platform_config")).map((r) => [r.key, parseInt(r.value, 10)]));
  const feeFor = (unit, qty) => (Math.round(unit * cfg.application_fee_bps / 10000) + (unit < 1000 ? cfg.per_ticket_fee_under10_cents : cfg.per_ticket_fee_over10_cents)) * qty;   // the live rule, parameterised by platform_config
  evidence.config = cfg; evidence.feeRule = "round(unit*bps/10000) + (unit<1000 ? under10 : over10), x qty";
  const call = (token, body, extra = {}) => fetch(edge.url("create-checkout"), { method: "POST", headers: { ...(token ? { authorization: "Bearer " + token } : {}), "content-type": "application/json", ...extra }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  const buyerTok = userJwt(ids.buyer, "buyer@example.test"), orgTok = userJwt(ids.org, "organizer@example.test");
  const sid = (url) => url.split("/").pop();
  const orders = (s) => q("select * from public.event_orders where stripe_session_id=$1 order by id", [s]);
  const sold = async (t) => (await q("select qty_sold from public.ticket_tiers where id=$1", [t]))[0].qty_sold;
  const pay = async (url, card = "4242 4242 4242 4242") => { const r = await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "card=" + encodeURIComponent(card) }); return { status: r.status, text: await r.text() }; };

  // ======================= (a) sign-in required, price from DB, fee from config
  await step("a1", "create-checkout with NO Authorization header -> 401 (gateway verify_jwt emulation: Invalid JWT; function not reached)", async () => { const r = await call(null, { items: [{ tier_id: 1, quantity: 1 }] }); return { pass: r.status === 401 && r.body?.message === "Invalid JWT", note: JSON.stringify(r) }; });
  await step("a2", "ANON key as bearer (valid project JWT, no user) -> function answers 401 needs_account", async () => { const r = await call(anonKey, { items: [{ tier_id: 1, quantity: 1 }] }); return { pass: r.status === 401 && r.body?.needs_account === true, note: JSON.stringify(r) }; });
  let P1; await step("a3", "signed-in buyer, $1.00 tier, client sends price_cents=1: session unit_amount comes from DB; fee = formula(config); metadata + customer_email set", async () => {
    const r = await call(buyerTok, { items: [{ tier_id: 1, quantity: 1, price_cents: 1, unit_amount: 1 }], price_cents: 1 });
    if (r.status !== 200 || !r.body?.url) return { pass: false, note: JSON.stringify(r) };
    const s = fake.sessions.get(sid(r.body.url)); const p = s._params; P1 = { url: r.body.url, session: s.id };
    const fee = feeFor(100, 1);
    const checks = { unit_amount: p.line_items[0].price_data.unit_amount === "100", qty: p.line_items[0].quantity === "1", fee: p.payment_intent_data.application_fee_amount === String(fee), dest: p.payment_intent_data.transfer_data.destination === "acct_local_FAKE_org", email: p.customer_email === "buyer@example.test", meta_event: p.metadata.event_id === "1", meta_items: eq(JSON.parse(p.metadata.items), [{ t: 1, q: 1, u: 100 }]), meta_buyer: p.metadata.buyer_user_id === ids.buyer, pi_meta: p.payment_intent_data.metadata.buyer_user_id === ids.buyer };
    evidence.fee_1_00 = { applicationFeeCents: Number(p.payment_intent_data.application_fee_amount), formula: fee, parts: `round(100*${cfg.application_fee_bps}/10000)=${Math.round(100 * cfg.application_fee_bps / 10000)} + flat ${cfg.per_ticket_fee_under10_cents}` };
    return { pass: Object.values(checks).every(Boolean), note: `application_fee_amount=${p.payment_intent_data.application_fee_amount}c (formula ${fee}c)  ${JSON.stringify(checks)}` };
  });
  let P2; await step("a4", "signed-in buyer, 2 x $25.00 tier: fee = 2 x (round(2500*bps/10000)+flat) per formula", async () => {
    const r = await call(buyerTok, { items: [{ tier_id: 2, quantity: 2 }] }); if (r.status !== 200) return { pass: false, note: JSON.stringify(r) };
    const s = fake.sessions.get(sid(r.body.url)); P2 = { url: r.body.url, session: s.id }; const got = Number(s._params.payment_intent_data.application_fee_amount), fee = feeFor(2500, 2);
    evidence.fee_25_00_x2 = { applicationFeeCents: got, formula: fee, perTicket: fee / 2 };
    return { pass: got === fee && s.amount_total === 5000 && s._params.line_items[0].price_data.unit_amount === "2500", note: `application_fee_amount=${got}c for 2 tickets (per ticket ${got / 2}c; formula ${fee}c), amount_total=${s.amount_total}c` };
  });

  // ======================= (b) simulated 4242 payment -> signed webhook -> fulfil
  let tok1, tok2;
  await step("b1", "hosted page is the SIMULATED local page (labelled) and shows the 4242 test card", async () => { const h = await (await fetch(P1.url)).text(); return { pass: /SIMULATED/.test(h) && /NOT Stripe's hosted checkout/.test(h) && /4242 4242 4242 4242/.test(h) }; });
  await step("b2", "a non-4242 card is declined by the fake (402) and nothing is fulfilled", async () => { const n0 = (await q("select count(*)::int n from public.event_orders"))[0].n; const r = await pay(P1.url, "4000 0000 0000 0002"); const n1 = (await q("select count(*)::int n from public.event_orders"))[0].n; return { pass: r.status === 402 && n0 === n1 }; });
  await step("b3", "pay $1 ticket with 4242 -> fake emits SIGNED checkout.session.completed -> deployed webhook -> fulfill_ticket_order: exactly one paid row, qr_token, qty_sold+1, buyer_handle from account email, fee + destination recorded from the PaymentIntent", async () => {
    const s0 = await sold(1); const r = await pay(P1.url); const o = await orders(P1.session); tok1 = o[0]?.qr_token; registerToken(tok1);
    const dd = fake.deliveries.at(-1); const ok = r.status === 200 && dd.status === 200 && o.length === 1 && o[0].status === "paid" && /^[0-9a-f]{32}$/.test(tok1 || "") && o[0].buyer_handle === "buyerhandle" && o[0].qty === 1 && o[0].amount_cents === 100 && o[0].application_fee_cents === feeFor(100, 1) && o[0].organizer_acct === "acct_local_FAKE_org" && (await sold(1)) === s0 + 1;
    return { pass: ok, note: `webhook ${dd.status}; rows=${o.length}; status=${o[0]?.status}; handle=${o[0]?.buyer_handle}; fee=${o[0]?.application_fee_cents}c; qty_sold ${s0}->${await sold(1)}; token present (32 chars, not printed)` };
  });
  await step("b4", "pay 2 x $25 ticket -> one paid row, qty 2, qty_sold+2", async () => { const s0 = await sold(2); await pay(P2.url); const o = await orders(P2.session); tok2 = o[0]?.qr_token; registerToken(tok2); return { pass: o.length === 1 && o[0].status === "paid" && o[0].qty === 2 && o[0].amount_cents === 5000 && (await sold(2)) === s0 + 2, note: `rows=${o.length} qty=${o[0]?.qty} amount=${o[0]?.amount_cents}c application_fee=${o[0]?.application_fee_cents}c qty_sold ${s0}->${await sold(2)}` }; });

  // ======================= (c) idempotency + signature failures
  const ev1 = fake.events.find((e) => e.type === "checkout.session.completed" && e.data.object.id === P1.session);
  const nOrders = async () => (await q("select count(*)::int n from public.event_orders"))[0].n;
  await step("c1", "webhook RETRY (same signed event delivered again) -> 200, still one row, qty_sold unchanged", async () => { const n = await nOrders(), s = await sold(1); const d = await fake.deliver(ev1); const o = await orders(P1.session); return { pass: d.status === 200 && o.length === 1 && (await nOrders()) === n && (await sold(1)) === s, note: `status ${d.status}; rows ${o.length}; qty_sold ${s}->${await sold(1)}` }; });
  const forged = (sess) => ({ ...fake.event("checkout.session.completed", { id: sess, object: "checkout.session", mode: "payment", payment_status: "paid", payment_intent: null, customer_email: "buyer@example.test", customer_details: { email: "buyer@example.test" }, metadata: { event_id: "1", items: JSON.stringify([{ t: 7, q: 1, u: 500 }]), buyer_user_id: ids.buyer }, amount_total: 500, currency: "usd" }) });
  const sigCase = async (id, name, opts, expect) => step(id, name, async () => { const n = await nOrders(); const e = forged("cs_test_local_forged_" + id); const d = await fake.deliver(e, opts(e)); const o = await orders(e.data.object.id); return { pass: d.status === expect && o.length === 0 && (await nOrders()) === n, note: `status ${d.status} (${d.text.slice(0, 90)}); rows for forged session=${o.length}` }; });
  await sigCase("c2", "INVALID signature (garbage v1) -> 400, no row", () => ({ header: `t=${Math.floor(Date.now() / 1000)},v1=${"0".repeat(64)}` }), 400);
  await sigCase("c3", "WRONG secret (signed with another whsec) -> 400, no row", () => ({ secret: "whsec_localtestWRONG" + rnd() }), 400);
  await sigCase("c4", "MISSING stripe-signature header -> 400, no row", () => ({ header: null }), 400);
  await sigCase("c5", "STALE timestamp (10 minutes old, correct secret) -> 400, no row", () => ({ t: Math.floor(Date.now() / 1000) - 600 }), 400);
  await step("c6", "control: the SAME forged body signed with the CORRECT secret and fresh timestamp IS accepted (proves rows appear only when the signature is valid)", async () => { const e = forged("cs_test_local_forged_ctl"); const d = await fake.deliver(e); const o = await orders(e.data.object.id); return { pass: d.status === 200 && o.length === 1, note: `status ${d.status}; rows ${o.length}` }; });

  // ======================= (d) wallet + self-hosted QR
  await step("d1", "get_my_tickets (buyer) returns the paid tickets with their qr_token; another account sees none of them", async () => {
    const r = await R(who.buyer, "select order_id, qty, qr_token, status, title from public.get_my_tickets() order by order_id"); const o = await R(who.other, "select count(*)::int n from public.get_my_tickets()");
    const toks = r.rows.map((x) => x.qr_token); return { pass: !r.err && toks.includes(tok1) && toks.includes(tok2) && r.rows.every((x) => x.status === "paid") && o.rows[0].n === 0, note: `buyer sees ${r.rows.length} (incl. both purchased tokens: ${toks.includes(tok1) && toks.includes(tok2)}); other account sees ${o.rows?.[0]?.n}` };
  });
  await step("d2", "self-hosted wallet QR: the repo's shipped qrcode.js + kil-ticket-qr.js render the ticket code locally (/tickets draws KIL-<token>, /profile draws the raw token); no third-party host involved", async () => {
    const qrcode = require(join(REPO, "assets/js/vendor/qrcode.js")), KQ = require(join(REPO, "assets/js/kil-ticket-qr.js"));
    const mk = (p) => { const c = qrcode(0, "M"); c.addData(p); c.make(); return c; };
    const pTickets = KQ.payload(tok1, { prefix: true }), pProfile = KQ.payload(tok1);
    const svg = mk(pTickets).createSvgTag(4, 8); /* (the QR SVGs encode a real token: not written to disk) */
    const jsQR = loadJsQR(); /* throws (-> FAIL) if the vendored decoder is missing or its sha256 differs: d2 never skips */
    const dT = assertDecodes(jsQR, mk(pTickets), "KIL-" + tok1), dP = assertDecodes(jsQR, mk(pProfile), tok1); /* throws (-> FAIL) unless decoded text equals the payload exactly */
    const okDecode = dT === "KIL-" + tok1 && dP === tok1;
    const decoded = `decoded by vendored jsQR (sha256 ${JSQR_SHA256.slice(0, 12)}): /tickets decoded === "KIL-<token>": ${dT === "KIL-" + tok1}; /profile decoded === raw token: ${dP === tok1}`;
    const ok = pTickets === "KIL-" + tok1 && pProfile === tok1 && /^<svg/.test(svg) && !/https?:\/\//.test(svg.replace(/xmlns="[^"]*"/, "")) && okDecode;
    return { pass: ok, note: `payloads: /tickets "KIL-<32 hex>", /profile "<32 hex>"; SVGs in ${OUT}; ${decoded}` };
  });

  // ======================= (e) door
  const scan = async (w, tok, db = R) => { const r = await db(w, "select public.event_checkin_scan($1) as j", [tok]); return r.err ? { error: r.err, code: r.code } : r.rows[0].j; };
  await step("e1", "hardened event_checkin_scan by the organizer: raw token -> admitted once; second scan -> already_used", async () => { const a = await scan(who.org, tok1), b = await scan(who.org, tok1); return { pass: a.ok === true && a.result === "admitted" && b.ok === false && b.result === "already_used", note: `first=${a.result}, second=${b.result}` }; });
  await step("e2", "hardened door accepts the wallet's KIL-prefixed payload (order 2): admitted once, then already_used", async () => { const a = await scan(who.org, "KIL-" + tok2), b = await scan(who.org, "KIL-" + tok2); return { pass: a.ok === true && a.result === "admitted" && b.result === "already_used", note: `first=${a.result}, second=${b.result}` }; });
  await step("e3", "a non-owner organizer is refused (forbidden) and the anon role cannot execute the scanner (42501)", async () => { const a = await scan(who.other, tok1), b = await scan(who.anon, tok1); return { pass: a.ok === false && a.result === "forbidden" && b.code === "42501", note: `other=${a.result}; anon=${b.code || JSON.stringify(b)}` }; });
  await step("e4", "no buyer contact (email) in any door response; buyer field shown for evidence", async () => {
    const res = [await scan(who.org, tok1), await scan(who.org, "KIL-" + tok2), await scan(who.other, tok1), await scan(who.org, "nonsense")]; const t = JSON.stringify(res);
    const ci = await R(who.org, "select public.check_in_ticket($1) as j", [tok1]); const t2 = JSON.stringify(ci.rows?.[0]?.j ?? ci);
    evidence.doorSample = res.map((x) => ({ result: x.result, keys: Object.keys(x).sort() }));
    return { pass: !/@/.test(t) && !/buyer@example/.test(t) && !/@/.test(t2), note: `scan keys: ${JSON.stringify(evidence.doorSample.map((x) => x.keys))}; check_in_ticket: ${t2.slice(0, 160)}` };
  });
  await step("e5", "null-owner hole closed: a signed-in user with NO handle cannot admit a ticket for an ownerless event (hardened); the ORIGINAL replica admits it (negative control)", async () => {
    const mkOrder = async (c) => (await c.query("insert into public.event_orders (event_id,tier_id,buyer_email,qty,status,stripe_session_id) values (3,9,'buyer@example.test',1,'paid','cs_fixture_' || md5(random()::text)) returning qr_token")).rows[0].qr_token;
    const tH = await mkOrder(pc), tO = await mkOrder(s0Db.client);
    const h = await R(who.nohandle, "select public.check_in_ticket($1) as j", [tH]), o = await R0(who.nohandle, "select public.check_in_ticket($1) as j", [tO]);
    return { pass: h.rows?.[0]?.j?.status !== "valid" && h.rows?.[0]?.j?.status !== "admitted" && o.rows?.[0]?.j?.status === "valid", note: `hardened=${JSON.stringify(h.rows?.[0]?.j?.status)}; original=${JSON.stringify(o.rows?.[0]?.j?.status)}` };
  });

  // ======================= (f) refund
  await step("f1", "fake Stripe refund -> SIGNED charge.refunded -> deployed webhook -> refund_ticket_order: order refunded, qty_sold decremented by qty, a re-scan is refused", async () => {
    const pi = fake.sessions.get(P2.session).payment_intent, s = await sold(2);
    const r = await fetch(fakeBase + "/v1/refunds", { method: "POST", headers: { authorization: "Bearer " + sk, "content-type": "application/x-www-form-urlencoded" }, body: "payment_intent=" + pi }); const wh = r.headers.get("x-local-webhook-status");
    const o = (await orders(P2.session))[0]; const rescan = await scan(who.org, "KIL-" + tok2);
    return { pass: r.status === 200 && wh === "200" && o.status === "refunded" && (await sold(2)) === s - 2 && rescan.ok === false, note: `refund ${r.status}; webhook ${wh}; status=${o.status}; qty_sold ${s}->${await sold(2)}; re-scan result=${rescan.result}` };
  });
  await step("f2", "refund webhook RETRY is idempotent: no second decrement", async () => { const s = await sold(2); const e = fake.events.filter((x) => x.type === "charge.refunded").at(-1); const d = await fake.deliver(e); return { pass: d.status === 200 && (await sold(2)) === s, note: `status ${d.status}; qty_sold ${s}->${await sold(2)}` }; });
  await step("f3", "the refunded ticket also disappears from the buyer's wallet (get_my_tickets lists paid only)", async () => { const r = await R(who.buyer, "select qr_token from public.get_my_tickets()"); return { pass: !r.rows.some((x) => x.qr_token === tok2) && r.rows.some((x) => x.qr_token === tok1) }; });

  // ======================= (g) 13A hazards closed (vs the S0 replica as negative control)
  const FORGE = "insert into public.event_orders (event_id,tier_id,buyer_email,qty,status,qr_token,amount_cents) values (1,1,'forger@example.test',1,'paid','ffffffffffffffffffffffffffffffff',0)";
  await step("g1", "anon INSERT of a forged paid order is refused (hardened); the S0 replica ACCEPTS it (negative control)", async () => { const h = await R(who.anon, FORGE), o = await R0(who.anon, FORGE); return { pass: h.code === "42501" && o.rowCount === 1, note: `hardened=${h.code || "applied"}; S0=${o.err || "inserted " + o.rowCount}` }; });
  await step("g2", "organizer UPDATE of status / qr_token on their own event's order is refused (hardened); S0 allows it (negative control)", async () => {
    const upd = (c) => `update public.event_orders set status='refunded', qr_token='eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' where id=(select min(id) from public.event_orders where event_id=1)`;
    const h = await R(who.org, upd()); const oid = (await s0Db.client.query("insert into public.event_orders (event_id,tier_id,buyer_email,qty,status) values (1,1,'x@example.test',1,'paid') returning id")).rows[0].id; const o = await R0(who.org, upd().replace("select min(id) from public.event_orders where event_id=1", String(oid)));
    const intact = (await q("select count(*)::int n from public.event_orders where qr_token='eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'"))[0].n === 0;
    return { pass: (h.code === "42501" || h.rowCount === 0) && intact && o.rowCount === 1, note: `hardened=${h.code || "rows " + h.rowCount}; S0 updated ${o.rowCount} row` };
  });
  await step("g3", "anon TRUNCATE of event_orders is refused (hardened) and rows survive; S0 allows it (negative control, on the control DB only)", async () => { const n = await nOrders(); const h = await R(who.anon, "truncate table public.event_orders"); const keep = (await nOrders()) === n; const o = await R0(who.anon, "truncate table public.event_orders"); return { pass: h.code === "42501" && keep && !o.err, note: `hardened=${h.code}; rows before/after ${n}/${await nOrders()}; S0=${o.err || "truncated"}` }; });

  // ======================= (h) documented error paths
  const err = async (token, items, re, status, name, id) => step(id, name, async () => { const r = await call(token, { items }); return { pass: r.status === status && re.test(r.body?.error || ""), note: JSON.stringify(r) }; });
  await err(buyerTok, [{ tier_id: 3, quantity: 1 }], /sold out/, 400, "sold-out tier -> 400 'is sold out'", "h1");
  await err(buyerTok, [{ tier_id: 6, quantity: 5 }], /Only 2 left/, 400, "more than remaining -> 400 'Only 2 left'", "h2");
  await err(buyerTok, [{ tier_id: 4, quantity: 1 }], /not on sale yet/, 400, "sales window not open -> 400 'not on sale yet'", "h3");
  await err(buyerTok, [{ tier_id: 5, quantity: 1 }], /have ended/, 400, "sales window closed -> 400 'have ended'", "h4");
  await err(buyerTok, [{ tier_id: 8, quantity: 1 }], /organizer has not finished payout setup/, 400, "organizer without payouts -> 400 'organizer has not finished payout setup'", "h5");
  await err(buyerTok, [], /no tickets selected/, 400, "empty cart -> 400 'no tickets selected'", "h6");
  await err(buyerTok, [{ tier_id: 99999, quantity: 1 }], /tier not found/, 404, "unknown tier -> 404 'tier not found'", "h7");
  await step("h8", "ticketing_enabled=0 -> 503 'temporarily paused' (config read live), restored after", async () => { await pc.query("insert into public.platform_config values ('ticketing_enabled','0')"); const r = await call(buyerTok, { items: [{ tier_id: 1, quantity: 1 }] }); await pc.query("delete from public.platform_config where key='ticketing_enabled'"); const r2 = await call(buyerTok, { items: [{ tier_id: 1, quantity: 1 }] }); return { pass: r.status === 503 && r2.status === 200, note: `paused=${r.status}, restored=${r2.status}` }; });

  // ======================= (i) negative controls
  await step("i1", "BEARER BUG (#153) reproduced: the page sending the ANON key as bearer cannot buy -> 401 needs_account; with the user's session token the same body succeeds", async () => { const bad = await call(anonKey, { items: [{ tier_id: 1, quantity: 1 }] }, { apikey: anonKey }), good = await call(buyerTok, { items: [{ tier_id: 1, quantity: 1 }] }, { apikey: anonKey }); return { pass: bad.status === 401 && bad.body?.needs_account === true && good.status === 200, note: `anon-bearer=${bad.status} needs_account=${bad.body?.needs_account}; user-bearer=${good.status}` }; });
  await step("i2", "TAMPERED webhook body (amount edited after signing) -> 400, no row, no qty change", async () => {
    const e = forged("cs_test_local_tamper"), body = JSON.stringify(e), header = fake.sign(body), n = await nOrders(), s = await sold(7);
    const d = await fake.deliver(e, { rawBody: body.replace('"amount_total":500', '"amount_total":1'), header }); const o = await orders("cs_test_local_tamper");
    return { pass: body.includes('"amount_total":500') && d.status === 400 && o.length === 0 && (await nOrders()) === n && (await sold(7)) === s, note: `status ${d.status}` };
  });
  await step("i3", "no request ever left 127.0.0.1: every fake-Stripe / edge call was local, and a direct fetch to stripe.com is blocked by the egress guard", async () => {
    let blocked = false; try { await fetch("https://api.stripe.com/v1/charges"); } catch (e) { blocked = e instanceof GuardError; }
    const hosts = new Set(fake.log.map((l) => l.host.split(":")[0])); return { pass: blocked && eq([...hosts], ["127.0.0.1"]), note: `fake-stripe saw hosts ${[...hosts]}; ${fake.log.length} requests` };
  });

  // ======================= (j) NO-LIVE-MODE guards
  await step("j1", "guard: any live key / non-fake whsec / real-looking test key in the environment -> refuses to start", async () => {
    const bad = [{ STRIPE_SECRET_KEY: "sk_live_abc" }, { X: "pk_live_abc" }, { STRIPE_WEBHOOK_SECRET: "whsec_realsecret" }, { STRIPE_SECRET_KEY: "sk_test_51Realish" }];
    const refused = bad.map((e) => { try { refuseLiveKeys(e); return false; } catch (x) { return x instanceof GuardError; } });
    let okFake = true; try { refuseLiveKeys({ STRIPE_SECRET_KEY: sk, STRIPE_WEBHOOK_SECRET: whsec }); } catch { okFake = false; }
    return { pass: refused.every(Boolean) && okFake, note: `refused ${refused.filter(Boolean).length}/${bad.length}; local fakes accepted: ${okFake}` };
  });
  await step("j2", "guard: any non-127.0.0.1 host configured -> refuses to start (and runtime URL guard refuses stripe.com / supabase.co)", async () => {
    const bad = [{ SUPABASE_URL: "https://xyz.supabase.co" }, { KIL_FAKE_STRIPE_BASE: "https://api.stripe.com" }, { STRIPE_API_HOST: "localhost:12111" }];
    const refused = bad.map((e) => { try { refuseNonLocalHosts(e); return false; } catch (x) { return x instanceof GuardError; } });
    let rt = 0; for (const u of ["https://api.stripe.com/v1", "http://localhost:1", "https://abc.supabase.co"]) { try { assertLocalUrl(u); } catch { rt++; } }
    return { pass: refused.every(Boolean) && rt === 3, note: `env refused ${refused.filter(Boolean).length}/${bad.length}; runtime refused ${rt}/3` };
  });

  // ---- teardown
  evidence.deliveries = fake.deliveries.map((d) => ({ type: d.type, status: d.status })); evidence.fakeStripeRequests = fake.log.length; evidence.packs = T.packLog; evidence.deployed = src;
  await edge.stop(); await fake.stop();
  for (const c of [shimDb, reqDb, s0Cl]) await c.disconnect();
  await hardDb.close(); await s0Db.close(); await PG.dropDb(T.s0); await PG.dropDb(T.hard); await PG.dropRoles(); await PG.shutdownAdmin();
}

let failure = null;
try { await main(); } catch (e) { failure = e; console.log("FATAL", e?.stack || e); try { await PG.cleanupAll(); await PG.dropRoles(); await PG.shutdownAdmin(); } catch {} }
const pass = results.filter((r) => r.pass).length;
console.log("\n===== RESULTS =====");
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.id.padEnd(3)} ${r.name.slice(0, 130)}`);
console.log(`\n${pass}/${results.length} PASS` + (failure ? "  (run aborted: " + failure.message + ")" : ""));
writeFileSync2(join(OUT, "results.json"), JSON.stringify({ results, evidence, pass, total: results.length, aborted: failure ? String(failure.message) : null }, null, 1));
process.exit(failure || pass !== results.length ? 1 : 0);
