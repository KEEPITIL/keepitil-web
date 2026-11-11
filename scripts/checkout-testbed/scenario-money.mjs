/* scenario-money.mjs - MONEY-HARDENING proofs (DRAFT; Atlas 3-7, Sentinel S1-S4). LOCAL ONLY, simulated Stripe, no secrets, 127.0.0.1 / local socket only.
   Runs the PROPOSED stripe-webhook v53 (patches/stripe-webhook-money-hardening.PROPOSED.diff applied to a COPY of the pinned deployed v52) and the PROPOSED create-checkout KIL_SITE_URL patch,
   against a replica = S0 + 12A/13A packs + 14A-01 (proposed/14a_01_...APPLY_PROPOSED.sql, applied by running the file itself). The deployed files are never modified.
   Output: PASS/FAIL table + JSON in $KIL_OUT. No QR token is ever printed (lib/redact.mjs), and leaks() must be 0 for the proposed source. */
import { registerToken, redact, leaks } from "./lib/redact.mjs";
import "./shims/register.mjs";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdirSync, writeFileSync as wfRaw, readFileSync, copyFileSync, mkdtempSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { guardEnv, installEgressGuard } from "./lib/guards.mjs";
import { signJwt } from "./lib/jwt.mjs";
import { FakeStripe } from "./lib/fake-stripe.mjs";
import { startEdgeHost, verifyDeployedSources, DEPLOYED, md5File } from "./lib/edge-host.mjs";
import { buildTemplates, makeReq, insertFixture, PG } from "./lib/testbed-db.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.KIL_OUT || join(HERE, "out"); mkdirSync(OUT, { recursive: true });
const wf = (f, d) => wfRaw(f, typeof d === "string" ? redact(d) : d);
const results = []; const evidence = {};
const rnd = () => randomBytes(12).toString("hex");
async function step(id, name, fn) {
  let r; try { r = await fn(); } catch (e) { r = { pass: false, note: "EXCEPTION " + (e?.stack || e) }; }
  results.push({ id, name, pass: !!r.pass, note: r.note || "" }); console.log(`${r.pass ? "PASS" : "FAIL"}  ${id}  ${name}${r.note ? "\n        " + String(r.note).replace(/\n/g, "\n        ") : ""}`);
}
const applyPatch = (srcFile, diffFile) => { const tmp = mkdtempSync(join(tmpdir(), "kil-money-")); const copy = join(tmp, "index.ts"); copyFileSync(srcFile, copy); execFileSync("patch", ["-p1", "--quiet"], { cwd: tmp, input: readFileSync(diffFile, "utf8") }); return copy; };

async function main() {
  console.log("== money-hardening testbed: LOCAL ONLY, simulated Stripe, DRAFT ==");
  guardEnv(process.env); installEgressGuard();
  const src = verifyDeployedSources(); console.log("deployed sources (unmodified, md5-pinned):", JSON.stringify(src));
  const jwtSecret = "jwtlocalFAKE" + rnd(), whsec = "whsec_localtest" + rnd(), sk = "sk_test_local_FAKE" + rnd();
  const anonKey = signJwt({ role: "anon", iss: "local-testbed" }, jwtSecret), serviceKey = signJwt({ role: "service_role", iss: "local-testbed" }, jwtSecret);
  const userJwt = (id, email) => signJwt({ role: "authenticated", sub: id, email, exp: Math.floor(Date.now() / 1000) + 3600 }, jwtSecret);
  Object.assign(process.env, { SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_ANON_KEY: anonKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey, STRIPE_SECRET_KEY: sk, STRIPE_WEBHOOK_SECRET: whsec });
  guardEnv(process.env);

  const T = await buildTemplates({ money: true });
  console.log("templates built:", JSON.stringify(T.packLog));
  const hardDb = await PG.createDb(T.hard), s0Db = await PG.createDb(T.s0);
  const ids = { org: randomUUID(), buyer: randomUUID(), other: randomUUID(), nohandle: randomUUID(), org2: randomUUID() };
  await insertFixture(hardDb.client, ids); await insertFixture(s0Db.client, ids);
  const shimDb = await PG.newClient(hardDb.name, "authenticator"), reqDb = await PG.newClient(hardDb.name, "authenticator");
  globalThis.__KIL_TESTBED = { jwtSecret, client: shimDb.client };
  const R = makeReq(reqDb.client), pc = hardDb.client;
  const who = { org: { role: "authenticated", sub: ids.org, email: "organizer@example.test" }, buyer: { role: "authenticated", sub: ids.buyer, email: "buyer@example.test" }, anon: { role: "anon" }, authed: { role: "authenticated", sub: ids.other, email: "other@example.test" } };
  const q = async (sql, p) => (await pc.query(sql, p)).rows;
  await pc.query(`insert into public.ticket_tiers (id,event_id,name,price_cents,qty_total,qty_sold,currency) overriding system value values
    (10,1,'Cap3 probe',500,3,0,'usd'),(11,1,'Cap3 control',500,3,0,'usd'),(12,1,'Cap1 webhook',500,1,0,'usd'),(13,1,'Dispute GA',500,50,0,'usd'),(14,1,'Refund GA',2500,50,0,'usd'),(15,1,'Pending GA',500,50,0,'usd'),(16,1,'Order GA',500,50,0,'usd'),(17,1,'Replay GA',500,50,0,'usd')`);

  const fake = new FakeStripe({ secretKey: sk, whsec }); const fakeBase = await fake.start(); process.env.KIL_FAKE_STRIPE_BASE = fakeBase; guardEnv(process.env);
  const webhookCopy = applyPatch(DEPLOYED["stripe-webhook"].file, join(HERE, "patches", "stripe-webhook-money-hardening.PROPOSED.diff"));
  const checkoutCopy = applyPatch(DEPLOYED["create-checkout"].file, join(HERE, "patches", "create-checkout-site-env.PROPOSED.diff"));
  const webhookMd5 = md5File(webhookCopy), checkoutMd5 = md5File(checkoutCopy);
  const edge = await startEdgeHost({ overrides: { "stripe-webhook": webhookCopy, "create-checkout": checkoutCopy } }); fake.setWebhookTarget(edge.url("stripe-webhook"));
  console.log(`listeners (127.0.0.1): fake-stripe ${fakeBase}  edge ${edge.base}; v53 md5 ${webhookMd5}; create-checkout patched md5 ${checkoutMd5}`);
  const call = (token, body) => fetch(edge.url("create-checkout"), { method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  const buyerTok = userJwt(ids.buyer, "buyer@example.test");
  const sid = (url) => url.split("/").pop();
  const sold = async (t) => (await q("select qty_sold from public.ticket_tiers where id=$1", [t]))[0].qty_sold;
  const orderOf = async (s) => (await q("select id, status, qty, qr_token from public.event_orders where stripe_session_id=$1 order by id", [s]));
  const regTok = (rows) => rows.forEach((r) => registerToken(r.qr_token));
  const pay = (url) => fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "card=" + encodeURIComponent("4242 4242 4242 4242") });
  const ledger = async (e) => (await q("select outcome, detail from private.stripe_event_ledger where stripe_event_id=$1", [e]))[0];
  const nLedger = async () => (await q("select count(*)::int n from private.stripe_event_ledger"))[0].n;
  const scan = async (w, tok) => { const r = await R(w, "select public.event_checkin_scan($1) as j", [tok]); return r.err ? { error: r.err, code: r.code } : r.rows[0].j; };
  const buy = async (tier, qty = 1) => {          // create session + pay; webhooks go through (or are held when fake.hold)
    const r = await call(buyerTok, { items: [{ tier_id: tier, quantity: qty }] }); if (r.status !== 200) throw new Error("buy failed " + JSON.stringify(r));
    const s = fake.sessions.get(sid(r.body.url)); await pay(r.body.url); const fresh = fake.sessions.get(s.id);
    return { session: s.id, pi: fresh.payment_intent, amount: s.amount_total };
  };
  const refund = async (pi, amount) => { const r = await fetch(fakeBase + "/v1/refunds", { method: "POST", headers: { authorization: "Bearer " + sk, "content-type": "application/x-www-form-urlencoded" }, body: "payment_intent=" + pi + (amount ? "&amount=" + amount : "") }); return { status: r.status, wh: r.headers.get("x-local-webhook-status"), body: await r.json() }; };
  const dispute = (pi, type, status) => fake.event(type, { id: "dp_local_" + rnd(), object: "dispute", payment_intent: pi, status: status || "needs_response" });

  // =================== setup facts
  await step("m0", "14A-01 applied by running the pack file on the 12A/13A-hardened replica; all POSTCHECKS ok; deployed v52/v58 sources untouched, v53 and the site-env copy are patched COPIES", async () => ({
    pass: T.packLog.every((p) => p.ok) && T.packLog.some((p) => /14a_01/.test(p.pack)) && webhookMd5 !== DEPLOYED["stripe-webhook"].md5 && checkoutMd5 !== DEPLOYED["create-checkout"].md5 && md5File(DEPLOYED["stripe-webhook"].file) === DEPLOYED["stripe-webhook"].md5,
    note: JSON.stringify(T.packLog.map((p) => ({ pack: p.pack, ok: p.ok, checks: p.checks }))) }));

  // =================== S1 / Atlas 1: harness is local-only and owns only what it creates
  await step("s1a", "S1: the harness refuses every non-local PostgreSQL host (remote name, LAN IP, empty, Supabase-style) and accepts only a socket dir / loopback", async () => {
    const bad = ["db.abcdefghijkl.supabase.co", "10.0.0.5", "192.168.1.113", "", "example.com", undefined, "127.0.0.1.evil.example"], good = ["/Users/x/work/pg-local/run", "127.0.0.1", "::1", "localhost"];
    const refused = bad.filter((h) => { try { PG.assertLocalPgHost(h); return false; } catch { return true; } }).length, accepted = good.filter((h) => { try { PG.assertLocalPgHost(h); return true; } catch { return false; } }).length;
    return { pass: refused === bad.length && accepted === good.length, note: `refused ${refused}/${bad.length}; accepted ${accepted}/${good.length}; connected host = ${PG.connInfo().host.startsWith("/") ? "unix socket" : PG.connInfo().host}` };
  });
  await step("s1b", "Atlas 1: cleanup is limited to objects THIS run created: dropDb refuses a database it did not create; dropRoles can only touch the 5 roles it created", async () => {
    let refused = false; try { await PG.dropDb("postgres"); } catch (e) { refused = /not created by this run/.test(String(e.message)); }
    const roles = PG.ownedRoles().sort().join(","), want = PG.STANDIN_ROLES.slice().sort().join(","); const owned = PG.ownedDbs();
    return { pass: refused && roles === want && owned.every((d) => d.startsWith("kil_rehearsal_")), note: `dropDb(postgres) refused=${refused}; owned roles=${roles}; owned dbs=${owned.length} all kil_rehearsal_*` };
  });

  // =================== normal flow + S2 ledger
  let A; await step("t1", "happy path through v53: pay $1 -> one paid order, qty_sold+1, ledger row 'fulfilled', response 200", async () => {
    const s0 = await sold(1); A = await buy(1, 1); const o = await orderOf(A.session); regTok(o); const dd = fake.deliveries.at(-1);
    const ev = fake.events.find((e) => e.type === "checkout.session.completed" && e.data.object.id === A.session); const L = await ledger(ev.id);
    return { pass: dd.status === 200 && o.length === 1 && o[0].status === "paid" && (await sold(1)) === s0 + 1 && L?.outcome === "fulfilled", note: `webhook ${dd.status}; rows ${o.length}; ledger=${L?.outcome} ${JSON.stringify(L?.detail)}` };
  });
  await step("r1", "S2 replay: the SAME signed event delivered again (and a 3rd time) is a no-op: one order, qty_sold unchanged, one ledger row", async () => {
    const ev = fake.events.find((e) => e.type === "checkout.session.completed" && e.data.object.id === A.session); const s = await sold(1), n = await nLedger();
    const d1 = await fake.deliver(ev), d2 = await fake.deliver(ev, { force: true }); const o = await orderOf(A.session);
    return { pass: d1.status === 200 && d2.status === 200 && o.length === 1 && (await sold(1)) === s && (await nLedger()) === n, note: `statuses ${d1.status}/${d2.status}; rows ${o.length}; qty_sold ${s}->${await sold(1)}; ledger rows ${n}->${await nLedger()}` };
  });
  await step("r1b", "S2 payment replay: a DIFFERENT event id for the same paid session (async_payment_succeeded after completed) cannot double-issue", async () => {
    const ev = fake.events.find((e) => e.type === "checkout.session.completed" && e.data.object.id === A.session); const s = await sold(1);
    const e2 = fake.event("checkout.session.async_payment_succeeded", ev.data.object); const d = await fake.deliver(e2, { force: true }); const o = await orderOf(A.session);
    return { pass: d.status === 200 && o.length === 1 && (await sold(1)) === s, note: `status ${d.status}; rows ${o.length}; qty_sold ${s}->${await sold(1)}` };
  });
  const forgedEv = (over = {}) => { const id = "cs_test_local_forged_" + rnd(); const meta = { event_id: "1", items: JSON.stringify([{ t: 7, q: 1, u: 500 }]), buyer_user_id: ids.buyer, ...(over.metadata || {}) };
    return { id, ev: fake.event("checkout.session.completed", { id, object: "checkout.session", mode: "payment", payment_status: "paid", payment_intent: "pi_forged_" + rnd(), customer_email: "buyer@example.test", customer_details: { email: "buyer@example.test" }, amount_total: 500, currency: "usd", ...over, metadata: meta }) }; };
  await step("r2", "S2 reconciliation: a correctly SIGNED event whose amount / currency / unit price / event / tier / quantity do not match the server-side price issues NOTHING (200, ledger 'rejected', no order, no inventory change)", async () => {
    const cases = { amount: { amount_total: 1 }, currency: { currency: "eur" }, price: { metadata: { items: JSON.stringify([{ t: 7, q: 1, u: 1 }]) }, amount_total: 1 }, wrong_event: { metadata: { event_id: "2" } }, unknown_tier: { metadata: { items: JSON.stringify([{ t: 99999, q: 1, u: 500 }]) } }, qty_range: { metadata: { items: JSON.stringify([{ t: 7, q: 21, u: 500 }]) }, amount_total: 10500 }, no_pi: { payment_intent: null } };
    const out = []; let ok = true; const s7 = await sold(7); const n0 = (await q("select count(*)::int n from public.event_orders"))[0].n;
    for (const [k, over] of Object.entries(cases)) { const f = forgedEv(over); const d = await fake.deliver(f.ev, { force: true }); const L = await ledger(f.ev.id); const o = await orderOf(f.id); const good = d.status === 200 && o.length === 0 && L?.outcome === "rejected"; ok = ok && good; out.push(`${k}:${good ? "rejected(" + L?.detail?.rejected + ")" : "FAIL " + d.status + "/" + o.length + "/" + L?.outcome}`); }
    const n1 = (await q("select count(*)::int n from public.event_orders"))[0].n;
    return { pass: ok && n0 === n1 && (await sold(7)) === s7, note: out.join("; ") + `; orders ${n0}->${n1}` };
  });
  await step("r2b", "S2 control: the same forged shape with the CORRECT server-side price and amount IS fulfilled (so the rejections above are the reconciliation, not a broken harness)", async () => {
    const f = forgedEv({}); const d = await fake.deliver(f.ev, { force: true }); const o = await orderOf(f.id); regTok(o); const L = await ledger(f.ev.id);
    return { pass: d.status === 200 && o.length === 1 && o[0].status === "paid" && L?.outcome === "fulfilled", note: `status ${d.status}; order ${o[0]?.status}; ledger ${L?.outcome}` };
  });

  // =================== refunds (Atlas 3, 4, 5; S3)
  let B; await step("f1", "Atlas 3: a refund whose DB work FAILS answers 500 (not 200); nothing changes; after the fault clears the SAME event retried applies exactly once, and a further retry is a no-op", async () => {
    B = await buy(14, 2); const o0 = await orderOf(B.session); regTok(o0); const s0 = await sold(14);
    await pc.query("revoke execute on function public.refund_ticket_order_v2(text,text,text,boolean,integer) from service_role");   // injected fault
    const r = await refund(B.pi); const mid = (await orderOf(B.session))[0];
    await pc.query("grant execute on function public.refund_ticket_order_v2(text,text,text,boolean,integer) to service_role");
    const ev = fake.events.filter((e) => e.type === "charge.refunded").at(-1); const d = await fake.deliver(ev, { force: true }); const after = (await orderOf(B.session))[0];
    const d2 = await fake.deliver(ev, { force: true });
    return { pass: r.wh === "500" && mid.status === "paid" && (await sold(14)) === s0 - 2 && d.status === 200 && after.status === "refunded" && d2.status === 200, note: `failing refund -> webhook ${r.wh}, order still ${mid.status}; retry ${d.status} -> ${after.status}; qty_sold ${s0}->${await sold(14)} (2 released once); replay ${d2.status}` };
  });
  let C; await step("f2", "Atlas 4 / S3 PARTIAL refund ($10 of $50): the order is NOT revoked, the ticket still scans, inventory unchanged, ledger records 1000c; a SECOND partial still does not revoke", async () => {
    C = await buy(14, 2); const o = await orderOf(C.session); regTok(o); const s0 = await sold(14);
    const r = await refund(C.pi, 1000); const st = (await orderOf(C.session))[0]; const L = (await q("select refunded_cents, fully_refunded from private.payment_ledger where payment_intent=$1", [C.pi]))[0];
    const r2 = await refund(C.pi, 1500); const st2 = (await orderOf(C.session))[0];
    return { pass: r.wh === "200" && st.status === "paid" && st2.status === "paid" && (await sold(14)) === s0 && L.refunded_cents === 1000 && !L.fully_refunded, note: `partials -> ${r.wh}/${r2.wh}; order ${st.status}/${st2.status}; ledger refunded ${L.refunded_cents}c full=${L.fully_refunded}; qty_sold unchanged ${s0}->${await sold(14)}` };
  });
  await step("f2b", "S3: the partially refunded ticket still ADMITS at the door (organizer scan), then the remaining refund covers the charge -> revoked once, inventory released once", async () => {
    const o = (await orderOf(C.session))[0]; const a = await scan(who.org, o.qr_token);
    const s0 = await sold(14); const r = await refund(C.pi, 2500); const st = (await orderOf(C.session))[0];
    return { pass: a.ok === true && r.wh === "200" && st.status === "refunded" && (await sold(14)) === s0 - 2, note: `door ${a.result}; remainder refund webhook ${r.wh}; order ${st.status}; qty_sold ${s0}->${await sold(14)}` };
  });
  await step("f3", "Atlas 4: a PENDING full refund does not revoke; when Stripe later marks it succeeded (charge.refund.updated, a Refund object) the order is revoked", async () => {
    const D = await buy(15, 1); regTok(await orderOf(D.session)); const s0 = await sold(15);
    fake.nextRefundStatus = "pending"; const r = await refund(D.pi); const st = (await orderOf(D.session))[0];
    const rf = fake.refunds.at(-1); rf.status = "succeeded"; const ch = fake.charges.get(rf.charge); ch.amount_refunded = ch.amount; ch.refunded = true;
    const d = await fake.deliver(fake.event("charge.refund.updated", { ...rf }), { force: true }); const st2 = (await orderOf(D.session))[0];
    return { pass: r.wh === "200" && st.status === "paid" && (await sold(15)) === s0 - 1 && d.status === 200 && st2.status === "refunded", note: `pending refund webhook ${r.wh} -> order ${st.status}; succeeded update ${d.status} -> ${st2.status}; qty_sold ${s0}->${await sold(15)}` };
  });
  await step("f4", "Atlas 5 OUT-OF-ORDER: the full refund arrives BEFORE checkout.session.completed -> when the payment event arrives no live ticket is issued (order 'refunded', inventory not consumed, door refuses it)", async () => {
    fake.hold = true; const E = await buy(16, 1); const s0 = await sold(16);
    const comp = fake.takeHeld((e) => e.type === "checkout.session.completed" && e.data.object.id === E.session); const r = await refund(E.pi); const ref = fake.takeHeld((e) => e.type === "charge.refunded");
    fake.hold = false; const dr = await fake.deliver(ref, { force: true }); const none = (await orderOf(E.session)).length; const dc = await fake.deliver(comp, { force: true });
    const o = await orderOf(E.session); regTok(o); const door = o[0] ? await scan(who.org, o[0].qr_token) : null; const dup = await fake.deliver(comp, { force: true });
    return { pass: dr.status === 200 && none === 0 && dc.status === 200 && o.length === 1 && o[0].status === "refunded" && (await sold(16)) === s0 && door?.ok === false && dup.status === 200, note: `refund first ${dr.status} (no order yet: ${none}); completed ${dc.status} -> order ${o[0]?.status}; qty_sold ${s0}->${await sold(16)}; door ok=${door?.ok}` };
  });

  // =================== disputes (S3)
  await step("d1", "S3 DISPUTE opened -> ticket held (status cancelled, door refuses, seat still counted); dispute WON -> restored and admits; replay of each event is a no-op", async () => {
    const F = await buy(13, 1); const o0 = (await orderOf(F.session))[0]; registerToken(o0.qr_token); const s0 = await sold(13);
    const dc = dispute(F.pi, "charge.dispute.created"); const d1 = await fake.deliver(dc, { force: true }); const held = (await orderOf(F.session))[0]; const door1 = await scan(who.org, o0.qr_token); const d1b = await fake.deliver(dc, { force: true });
    const dw = dispute(F.pi, "charge.dispute.closed", "won"); const d2 = await fake.deliver(dw, { force: true }); const back = (await orderOf(F.session))[0]; const door2 = await scan(who.org, o0.qr_token);
    return { pass: d1.status === 200 && held.status === "cancelled" && door1.ok === false && (await sold(13)) === s0 && d1b.status === 200 && d2.status === 200 && back.status === "paid" && door2.ok === true, note: `created ${d1.status} -> ${held.status}, door ok=${door1.ok}; won ${d2.status} -> ${back.status}, door ok=${door2.ok}; qty_sold held ${s0}` };
  });
  await step("d2", "S3 DISPUTE LOST -> seat released once, order stays cancelled; a dispute that arrives BEFORE the payment event holds the ticket when it lands (never a live ticket)", async () => {
    const G = await buy(13, 2); registerToken((await orderOf(G.session))[0].qr_token); const s0 = await sold(13);
    const dd = await fake.deliver(dispute(G.pi, "charge.dispute.created"), { force: true }); const dl = await fake.deliver(dispute(G.pi, "charge.dispute.closed", "lost"), { force: true }); const st = (await orderOf(G.session))[0]; const s1 = await sold(13);
    fake.hold = true; const H = await buy(13, 1); const comp = fake.takeHeld((e) => e.type === "checkout.session.completed" && e.data.object.id === H.session); fake.hold = false;
    const de = await fake.deliver(dispute(H.pi, "charge.dispute.created"), { force: true }); const dcomp = await fake.deliver(comp, { force: true }); const o = (await orderOf(H.session))[0]; registerToken(o.qr_token); const door = await scan(who.org, o.qr_token);
    return { pass: dd.status === 200 && dl.status === 200 && st.status === "cancelled" && s1 === s0 - 2 && de.status === 200 && dcomp.status === 200 && o.status === "cancelled" && door.ok === false && (await sold(13)) === s1 + 1, note: `lost: order ${st.status}, qty_sold ${s0}->${s1} (2 released); early dispute then payment: order ${o.status}, door ok=${door.ok}, seat counted while held (qty_sold ${await sold(13)})` };
  });

  // =================== atomic capacity (Atlas 6)
  const probe = async (n, sqlOf) => { const cls = await Promise.all(Array.from({ length: n }, () => PG.newClient(hardDb.name, "authenticator")));
    const rs = await Promise.all(cls.map(async (c, i) => { const cl = c.client; try { await cl.query("BEGIN"); await cl.query("SET LOCAL ROLE service_role"); const r = await cl.query(sqlOf(i)); await cl.query("COMMIT"); return r.rows[0]?.j; } catch (e) { try { await cl.query("ROLLBACK"); } catch {} return { err: e.message }; } }));
    await Promise.all(cls.map((c) => c.disconnect())); return rs; };
  await step("c1", "Atlas 6: 5 CONCURRENT buyers (separate DB connections) on a capacity-3 tier -> exactly 3 live tickets, 2 flagged oversold; the ORIGINAL baseline function oversells the same race (negative control)", async () => {
    const v2 = await probe(5, (i) => `select public.fulfill_ticket_order_v2('evt_probe_${i}','cs_probe_${i}','pi_probe_${i}',1,'[{"t":10,"q":1,"u":500}]'::jsonb,'buyer@example.test',null,null,500,'usd') as j`);
    const live = (await q("select count(*)::int n from public.event_orders where tier_id=10 and status='paid'"))[0].n, over = (await q("select count(*)::int n from public.event_orders where tier_id=10 and status='cancelled'"))[0].n;
    const base = await probe(5, (i) => `select public.fulfill_ticket_order('cs_ctl_${i}','pi_ctl_${i}',1,'[{"t":11,"q":1,"u":500}]'::jsonb,'buyer@example.test',null,null) as j`);
    const baseSold = await sold(11);
    return { pass: v2.every((x) => x?.ok) && live === 3 && over === 2 && (await sold(10)) === 3 && baseSold === 5, note: `v2: live=${live} oversold=${over} qty_sold=${await sold(10)} (capacity 3); baseline control: qty_sold=${baseSold} (capacity 3) -> oversold by ${baseSold - 3}` };
  });
  await step("c2", "Atlas 6 end to end: when capacity is gone by the time a payment lands, v53 flags the overflow and asks Stripe to refund exactly its price (idempotent); no live ticket is issued for it", async () => {
    const r1 = await call(buyerTok, { items: [{ tier_id: 12, quantity: 1 }] }), r2 = await call(buyerTok, { items: [{ tier_id: 12, quantity: 1 }] });   // both sessions created while 1 seat is left
    const s1 = fake.sessions.get(sid(r1.body.url)), s2 = fake.sessions.get(sid(r2.body.url)); await pay(r1.body.url); await pay(r2.body.url);
    const o1 = (await orderOf(s1.id))[0], o2 = (await orderOf(s2.id))[0]; regTok([o1, o2]); const pi2 = fake.sessions.get(s2.id).payment_intent; const rfs = fake.refunds.filter((x) => x.payment_intent === pi2);
    const ev = fake.events.find((e) => e.type === "checkout.session.completed" && e.data.object.id === s2.id); await fake.deliver(ev, { force: true });   // replay: idempotency key must not double-refund
    const rfs2 = fake.refunds.filter((x) => x.payment_intent === pi2);
    return { pass: o1.status === "paid" && o2.status === "cancelled" && (await sold(12)) === 1 && rfs.length === 1 && rfs[0].amount === 500 && rfs2.length === 1, note: `first ${o1.status}, second ${o2.status}; qty_sold ${await sold(12)}/1; refund of ${rfs[0]?.amount}c issued ${rfs.length}x (after replay ${rfs2.length}x)` };
  });

  // =================== search_path (Atlas 7)
  await step("sp1", "Atlas 7: every new SECURITY DEFINER function has search_path = '' , is owned by postgres, and only service_role can execute it (anon / authenticated get 42501)", async () => {
    const rows = await q("select p.proname, p.proconfig, pg_get_userbyid(p.proowner) owner from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('fulfill_ticket_order_v2','refund_ticket_order_v2','dispute_ticket_order')");
    const call3 = async (w) => (await R(w, "select public.dispute_ticket_order('e','p','created')")).code;
    const codes = [await call3(who.anon), await call3(who.authed), await call3(who.buyer)];
    return { pass: rows.length === 3 && rows.every((r) => JSON.stringify(r.proconfig) === JSON.stringify(['search_path=""']) && r.owner === "postgres") && codes.every((c) => c === "42501"), note: `${rows.map((r) => r.proname + ":" + r.proconfig).join(" | ")}; non-service callers -> ${codes}` };
  });
  await step("sp2", "Atlas 7: the captured BASELINE fulfill_ticket_order / refund_ticket_order bodies are byte-identical before and after 14A-01 (S0 replica vs hardened+14A)", async () => {
    const f = async (db) => (await db.client.query("select p.proname, md5(p.prosrc) m, p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('fulfill_ticket_order','refund_ticket_order') order by 1")).rows;
    const a = JSON.stringify(await f(s0Db)), b = JSON.stringify(await f(hardDb)); return { pass: a === b, note: a === b ? "identical md5 + proconfig for both baselines" : a + " != " + b };
  });

  // =================== redirects (Atlas 8) + logging (Atlas 2 / S4)
  await step("g1", "Atlas 8: with KIL_SITE_URL set (staging), success_url and cancel_url stay on the staging site and never contain keepitil.com; unset = the production default is unchanged", async () => {
    process.env.KIL_SITE_URL = "http://127.0.0.1:18080/"; const r = await call(buyerTok, { items: [{ tier_id: 17, quantity: 1 }] }); const s = fake.sessions.get(sid(r.body.url));
    const stagingOk = s.success_url.startsWith("http://127.0.0.1:18080/event.html?e=") && s.cancel_url.startsWith("http://127.0.0.1:18080/event.html?e=") && !/keepitil\.com/.test(s.success_url + s.cancel_url);
    delete process.env.KIL_SITE_URL; const r2 = await call(buyerTok, { items: [{ tier_id: 17, quantity: 1 }] }); const s2 = fake.sessions.get(sid(r2.body.url));
    return { pass: stagingOk && s2.success_url.startsWith("https://keepitil.com/event.html?e="), note: `staging success_url host = ${new URL(s.success_url).host}; default host = ${new URL(s2.success_url).host}` };
  });
  await step("l1", "Atlas 2 / S4: across this whole run the proposed webhook, the scenario and the fake wrote NO QR token (redactor saw zero token-shaped output); the unredacted v52 source is what logs `qr_tokens`", async () => {
    const v52logs = /qr_tokens/.test(readFileSync(DEPLOYED["stripe-webhook"].file, "utf8")) || /JSON\.stringify\(data\)/.test(readFileSync(DEPLOYED["stripe-webhook"].file, "utf8"));
    const v53logs = /qr_token/.test(readFileSync(webhookCopy, "utf8"));
    return { pass: leaks() === 0 && v52logs && !v53logs, note: `redaction events in this run: ${leaks()}; v52 source logs rpc data (tokens): ${v52logs}; v53 source mentions qr_token: ${v53logs}` };
  });
  await step("i3", "no request ever left 127.0.0.1 (fake-Stripe / edge calls local; direct fetch to stripe.com blocked)", async () => {
    let blocked = false; try { await fetch("https://api.stripe.com/v1/charges"); } catch (e) { blocked = /LOCAL-ONLY/.test(String(e.message)); }
    const hosts = new Set(fake.log.map((l) => l.host.split(":")[0])); return { pass: blocked && [...hosts].join() === "127.0.0.1", note: `fake-stripe saw hosts ${[...hosts]}; ${fake.log.length} requests` };
  });
  evidence.packs = T.packLog; evidence.v53Md5 = webhookMd5; evidence.siteEnvMd5 = checkoutMd5; evidence.deliveries = fake.deliveries.map((d) => ({ type: d.type, status: d.status }));
  await edge.stop(); await fake.stop();
  for (const c of [shimDb, reqDb]) await c.disconnect();
  await hardDb.close(); await s0Db.close(); await PG.dropDb(T.s0); await PG.dropDb(T.hard); await PG.dropRoles(); await PG.shutdownAdmin();
}
let failure = null;
try { await main(); } catch (e) { failure = e; console.log("FATAL", e?.stack || e); try { await PG.cleanupAll(); await PG.dropRoles(); await PG.shutdownAdmin(); } catch {} }
const pass = results.filter((r) => r.pass).length;
console.log("\n===== RESULTS =====");
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.id.padEnd(4)} ${r.name.slice(0, 140)}`);
console.log(`\n${pass}/${results.length} PASS` + (failure ? "  (run aborted: " + failure.message + ")" : ""));
wf(join(OUT, "results-money.json"), JSON.stringify({ results, evidence, pass, total: results.length, aborted: failure ? String(failure.message) : null }, null, 1));
process.exit(failure || pass !== results.length ? 1 : 0);
