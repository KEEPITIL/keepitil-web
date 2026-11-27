// Local round trip for connect-submit: form -> handler -> table row + upload + inbox email.
// The Supabase client and Resend are fakes that record every call; no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { handle, validate, emailFor, INBOX } from "../supabase/functions/connect-submit/logic.mjs";

function fakeDb(counts = { hour: 0, day: 0 }) {
  const log = { inserts: [], updates: [], uploads: [] };
  let q = 0;
  const db = {
    log,
    from(table) {
      return {
        select() { const n = q++ % 2 ? counts.day : counts.hour; const c = { eq: () => c, gte: () => Promise.resolve({ count: n }) }; return c; },
        insert(row) { log.inserts.push({ table, row }); return { select: () => ({ single: () => Promise.resolve({ data: { id: "row-1" } }) }) }; },
        update(patch) { return { eq: (k, v) => { log.updates.push({ table, patch, [k]: v }); return Promise.resolve({}); } }; },
      };
    },
    storage: { from: (bucket) => ({ upload: (path, file, o) => { log.uploads.push({ bucket, path, type: o.contentType, size: file.size }); return Promise.resolve({ data: { path } }); } }) },
  };
  return db;
}
function fakeResend(status = 200) {
  const sent = [];
  const fetch = (url, init) => { sent.push({ url, auth: init.headers.Authorization, body: JSON.parse(init.body) }); return Promise.resolve(new Response("{}", { status })); };
  return { fetch, sent };
}
function form(fields, file) {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ kind: "artist", name: "Demo Band", email: "Band@Example.com", city: "Long Beach",
    links: "https://example.com/band\nhttps://instagram.com/demoband", about: "We play every weekend in Long Beach.", elapsed_ms: "9000", website: "", source: "dm-2026-11", ...fields })) fd.set(k, v);
  if (file) fd.set("upload", file);
  return new Request("https://x.supabase.co/functions/v1/connect-submit", { method: "POST", body: fd, headers: { origin: "https://keepitil.com", "x-forwarded-for": "203.0.113.9" } });
}
const env = { SALT: "test-salt", RESEND_API_KEY: "re_test", MAIL_FROM: "KEEPITIL Connect <connect@keepitil.com>" };

test("round trip: stores the row, uploads the file to the private bucket, emails info@ with reply-to", async () => {
  const db = fakeDb(), mail = fakeResend();
  const png = new File([new Uint8Array(1200)], "logo.png", { type: "image/png" });
  const res = await handle(form({}, png), env, { db, fetch: mail.fetch, now: () => Date.parse("2026-11-04T12:00:00Z") });
  const j = await res.json();
  assert.equal(res.status, 200);
  assert.equal(j.ok, true); assert.equal(j.stored, true); assert.match(j.reference, /^KL-[2-9A-Z]{4}-[2-9A-Z]{4}$/);
  const { table, row } = db.log.inserts[0];
  assert.equal(table, "connect_submissions");
  assert.equal(row.reference, j.reference); assert.equal(row.email, "band@example.com");
  assert.deepEqual([...row.links], ["https://example.com/band", "https://instagram.com/demoband"]);
  assert.equal(row.upload_path, `submissions/${j.reference}/upload.png`);
  assert.match(row.ip_hash, /^[0-9a-f]{64}$/); assert.ok(!JSON.stringify(row).includes("203.0.113.9"), "raw IP never stored");
  assert.deepEqual(db.log.uploads, [{ bucket: "connect-uploads", path: row.upload_path, type: "image/png", size: 1200 }]);
  assert.equal(mail.sent.length, 1);
  const m = mail.sent[0];
  assert.equal(m.url, "https://api.resend.com/emails"); assert.equal(m.auth, "Bearer re_test");
  assert.deepEqual(m.body.to, [INBOX]); assert.equal(m.body.reply_to, "band@example.com");
  assert.match(m.body.subject, new RegExp(`Get Listed: Artist · Demo Band \\(${j.reference}\\)`));
  assert.match(m.body.text, /About: We play every weekend/);
  assert.equal(db.log.updates[0].patch.email_sent_at, "2026-11-04T12:00:00.000Z");
});

test("bots: honeypot or too-fast submit gets a fake success and nothing is stored or sent", async () => {
  for (const f of [{ website: "http://spam" }, { elapsed_ms: "800" }]) {
    const db = fakeDb(), mail = fakeResend();
    const j = await (await handle(form(f), env, { db, fetch: mail.fetch })).json();
    assert.equal(j.ok, true); assert.equal(j.stored, false);
    assert.equal(db.log.inserts.length + db.log.uploads.length + mail.sent.length, 0);
  }
});

test("rate limit: the 4th in an hour from one IP is refused", async () => {
  const db = fakeDb({ hour: 3, day: 3 }), mail = fakeResend();
  const res = await handle(form({}), env, { db, fetch: mail.fetch });
  assert.equal(res.status, 429); assert.equal(db.log.inserts.length, 0);
});

test("bad file type or size is refused before anything is stored", async () => {
  for (const file of [new File(["x"], "a.exe", { type: "application/x-msdownload" }), new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.png", { type: "image/png" })]) {
    const db = fakeDb();
    const res = await handle(form({}, file), env, { db, fetch: fakeResend().fetch });
    assert.equal(res.status, 400); assert.equal(db.log.inserts.length + db.log.uploads.length, 0);
  }
});

test("email failure still stores the row and records why", async () => {
  const db = fakeDb();
  const j = await (await handle(form({}), env, { db, fetch: fakeResend(500).fetch })).json();
  assert.equal(j.stored, true); assert.deepEqual(db.log.updates[0].patch, { email_error: "resend_500" });
  const db2 = fakeDb();
  await handle(form({}), { ...env, RESEND_API_KEY: "" }, { db: db2, fetch: () => assert.fail("no key, no send") });
  assert.deepEqual(db2.log.updates[0].patch, { email_error: "no_resend_key" });
});

test("validation and email escaping", () => {
  assert.equal(validate({ kind: "spaceship", name: "x", email: "a@b.co", about: "long enough text" }).ok, false);
  assert.equal(validate({ kind: "venue", name: "Hall", email: "nope", about: "long enough text" }).ok, false);
  assert.equal(validate({ kind: "venue", name: "Hall", email: "a@b.co", about: "long enough text", links: "http://insecure.example" }).ok, false);
  assert.equal(validate({ kind: "venue", name: "Hall", email: "a@b.co", about: "long enough text", links: "https://a.co https://b.co https://c.co https://d.co https://e.co https://f.co" }).ok, false);
  const e = emailFor({ reference: "KL-AAAA-BBBB", kind: "brand", name: "<script>x</script>", email: "a@b.co", about: "hi & bye", links: [] });
  assert.doesNotMatch(e.html, /<script>/); assert.match(e.html, /&lt;script&gt;/);
});
