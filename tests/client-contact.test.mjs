// client-contact: unit tests on handle() with an in-memory store, plus a LOCAL ROUND-TRIP:
// the starter template's real contact form fields -> a real HTTP server running handle() ->
// a real Postgres (PGlite) with the draft migration applied -> a stubbed Resend.
// The PGlite parts skip unless it's installed: PGLITE_DIR=<dir with node_modules> node --test tests/client-contact.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { handle, validate, emailFor } from "../supabase/functions/client-contact/logic.mjs";
import { render } from "../build-service/starter/build.mjs";

const SITE = { site_id: "northshore", name: "Northshore Studio", to_email: "owner@northshore.test", allowed_origins: ["https://northshore.test"], active: true };
const ENV = { SALT: "test-salt", RESEND_API_KEY: "re_test", MAIL_FROM: "" };

function memStore(sites = [SITE]) {
  const rows = [];
  return { rows,
    site: async (id) => sites.find((s) => s.site_id === id) ?? null,
    recent: async (site_id, ip_hash, since) => rows.filter((r) => r.site_id === site_id && r.ip_hash === ip_hash && r.created_at >= since).length,
    insert: async (row) => { const id = String(rows.length + 1); rows.push({ id, ...row, created_at: new Date().toISOString() }); return id; },
    update: async (id, patch) => Object.assign(rows.find((r) => r.id === id), patch),
  };
}
const fakeResend = (status = 200) => { const calls = []; return { calls, fetch: async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response("{}", { status }); } }; };
function post(fields, { origin = "https://northshore.test", ip = "203.0.113.9" } = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ site: "northshore", name: "Ana", email: "ana@example.com", message: "We need sound for 300 people.", website: "", elapsed_ms: "8000", ...fields })) fd.append(k, v);
  const headers = { "x-forwarded-for": ip }; if (origin) headers.origin = origin;
  return new Request("https://fn.test/client-contact", { method: "POST", body: fd, headers });
}

test("stores the row and emails the site's inbox with Reply-To = visitor", async () => {
  const store = memStore(), r = fakeResend();
  const res = await handle(post({}), ENV, { store, fetch: r.fetch });
  const body = await res.json();
  assert.equal(res.status, 200); assert.equal(body.stored, true); assert.match(body.reference, /^CC-/);
  assert.equal(res.headers.get("access-control-allow-origin"), "https://northshore.test");
  assert.equal(store.rows.length, 1); assert.ok(store.rows[0].email_sent_at); assert.equal(store.rows[0].ip_hash.length, 64);
  assert.ok(!JSON.stringify(store.rows[0]).includes("203.0.113.9"), "raw IP never stored");
  assert.deepEqual(r.calls[0].body.to, ["owner@northshore.test"]); assert.equal(r.calls[0].body.reply_to, "ana@example.com");
});
test("honeypot or too-fast submit: fake success, nothing stored, no email", async () => {
  for (const f of [{ website: "spam.example" }, { elapsed_ms: "900" }, { elapsed_ms: "" }]) {
    const store = memStore(), r = fakeResend();
    const body = await (await handle(post(f), ENV, { store, fetch: r.fetch })).json();
    assert.equal(body.ok, true); assert.equal(body.stored, false); assert.equal(store.rows.length, 0); assert.equal(r.calls.length, 0);
  }
});
test("unknown site, inactive site, or wrong origin is refused", async () => {
  const r = fakeResend();
  assert.equal((await handle(post({ site: "nope" }), ENV, { store: memStore(), fetch: r.fetch })).status, 404);
  assert.equal((await handle(post({}), ENV, { store: memStore([{ ...SITE, active: false }]), fetch: r.fetch })).status, 404);
  const bad = await handle(post({}, { origin: "https://evil.test" }), ENV, { store: memStore(), fetch: r.fetch });
  assert.equal(bad.status, 403); assert.equal(bad.headers.get("access-control-allow-origin"), "null");
  assert.equal((await handle(post({}, { origin: null }), ENV, { store: memStore(), fetch: r.fetch })).status, 200, "no-JS native post has no Origin");
});
test("per-IP rate limit per site (3/hour)", async () => {
  const store = memStore(), r = fakeResend();
  for (let i = 0; i < 3; i++) assert.equal((await handle(post({}), ENV, { store, fetch: r.fetch })).status, 200);
  assert.equal((await handle(post({}), ENV, { store, fetch: r.fetch })).status, 429);
  assert.equal((await handle(post({}, { ip: "198.51.100.1" }), ENV, { store, fetch: r.fetch })).status, 200, "another IP is fine");
});
test("email failure still stores the row, with email_error", async () => {
  const store = memStore();
  const body = await (await handle(post({}), ENV, { store, fetch: fakeResend(500).fetch })).json();
  assert.equal(body.stored, true); assert.equal(store.rows[0].email_error, "resend_500"); assert.ok(!store.rows[0].email_sent_at);
  const s2 = memStore();
  await handle(post({}), { ...ENV, RESEND_API_KEY: "" }, { store: s2, fetch: fakeResend().fetch });
  assert.equal(s2.rows[0].email_error, "no_resend_key");
});
test("validation and email escaping", () => {
  assert.equal(validate({ name: "A", email: "bad", message: "long enough text" }).ok, false);
  assert.equal(validate({ name: "A", email: "a@b.co", message: "short" }).ok, false);
  const m = emailFor(SITE, { reference: "CC-1", name: "<b>x</b>\r\nBcc: y", email: "a@b.co", message: "<script>1</script> hello" });
  assert.doesNotMatch(m.html, /<script>|<b>x/); assert.doesNotMatch(m.subject, /[\r\n]/);
});

let PGlite = null;
try { PGlite = (await import(createRequire((process.env.PGLITE_DIR || process.cwd()) + "/").resolve("@electric-sql/pglite"))).PGlite; } catch {}
const MIG = readFileSync(new URL("../supabase/migrations/20261105120000_client_contact.sql", import.meta.url), "utf8");
async function pg() {
  const db = new PGlite();
  await db.exec("create role anon nologin; create role authenticated nologin; grant usage on schema public to anon, authenticated;");
  await db.exec(MIG);
  return db;
}

test("migration: service-role only; anon/authenticated can't read or write", { skip: !PGlite && "pglite not installed" }, async () => {
  const db = await pg();
  await db.exec(`insert into client_sites (site_id,name,to_email,allowed_origins) values ('northshore','N','o@n.test','{https://n.test}')`);
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    for (const q of ["select * from client_sites", "select * from client_contact_messages",
      `insert into client_contact_messages (site_id,reference,name,email,message) values ('northshore','CC-X','A','a@b.co','long enough message')`,
      "update client_sites set to_email='x@evil.test'"]) await assert.rejects(db.query(q), /permission denied/, `${role}: ${q}`);
    await db.exec("reset role");
  }
  await assert.rejects(db.query(`insert into client_sites (site_id,name,to_email,allowed_origins) values ('Bad Id','N','o@n.test','{x}')`), /check/);
  await assert.rejects(db.query(`insert into client_contact_messages (site_id,reference,name,email,message) values ('ghost','CC-Y','A','a@b.co','long enough message')`), /foreign key/);
});

test("LOCAL ROUND-TRIP: template form -> HTTP -> handle() -> Postgres -> Resend stub", { skip: !PGlite && "pglite not installed" }, async () => {
  const db = await pg();
  await db.exec(`insert into client_sites (site_id,name,to_email,allowed_origins) values ('northshore','Northshore Studio','owner@northshore.test','{https://northshore.test}')`);
  const store = {
    site: async (id) => (await db.query("select site_id,name,to_email,allowed_origins,active from client_sites where site_id=$1", [id])).rows[0] ?? null,
    recent: async (s, h, since) => (await db.query("select count(*)::int n from client_contact_messages where site_id=$1 and ip_hash=$2 and created_at>=$3", [s, h, since])).rows[0].n,
    insert: async (row) => (await db.query("insert into client_contact_messages (site_id,reference,name,email,message,source,ip_hash) values ($1,$2,$3,$4,$5,$6,$7) returning id",
      [row.site_id, row.reference, row.name, row.email, row.message, row.source, row.ip_hash])).rows[0].id,
    update: async (id, p) => { const [k] = Object.keys(p); await db.query(`update client_contact_messages set ${k === "email_error" ? "email_error" : "email_sent_at"}=$1 where id=$2`, [p[k], id]); },
  };
  const resend = fakeResend();
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const out = await handle(new Request(`http://127.0.0.1${req.url}`, { method: req.method, headers: req.headers, body: req.method === "POST" ? Buffer.concat(chunks) : undefined }), ENV, { store, fetch: resend.fetch });
    res.writeHead(out.status, Object.fromEntries(out.headers)); res.end(Buffer.from(await out.arrayBuffer()));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    // build the client page with the endpoint pointed at this server, then read the form's own field names
    const site = JSON.parse(readFileSync(new URL("../build-service/starter/site.json", import.meta.url), "utf8"));
    site.contact.form = { ...site.contact.form, endpoint: "https://placeholder.test/x", site: "northshore" };
    const html = render(site)["contact.html"];
    const names = [...html.matchAll(/<(?:input|textarea)[^>]*name="([^"]+)"(?:[^>]*value="([^"]*)")?/g)].map((m) => [m[1], m[2] ?? ""]);
    assert.deepEqual(names.map((n) => n[0]).sort(), ["elapsed_ms", "email", "message", "name", "site", "source", "website"]);
    const fd = new FormData();
    const typed = { name: "Ana", email: "ana@example.com", message: "Quote for a 300-person show, please.", elapsed_ms: "6500" };
    for (const [n, v] of names) fd.append(n, typed[n] ?? v);
    const pre = await fetch(`${base}/client-contact?site=northshore`, { method: "OPTIONS", headers: { origin: "https://northshore.test" } });
    assert.equal(pre.headers.get("access-control-allow-origin"), "https://northshore.test");
    const res = await fetch(`${base}/client-contact`, { method: "POST", body: fd, headers: { origin: "https://northshore.test", "x-forwarded-for": "203.0.113.7" } });
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body)); assert.equal(body.stored, true);
    const row = (await db.query("select * from client_contact_messages where reference=$1", [body.reference])).rows[0];
    assert.equal(row.site_id, "northshore"); assert.equal(row.email, "ana@example.com"); assert.ok(row.email_sent_at); assert.equal(row.email_error, null);
    assert.equal(row.source, "site-contact");
    assert.equal(resend.calls.length, 1); assert.deepEqual(resend.calls[0].body.to, ["owner@northshore.test"]); assert.equal(resend.calls[0].body.reply_to, "ana@example.com");
  } finally { server.close(); }
});
