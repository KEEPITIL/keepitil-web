// Profile contact form: validation, off-by-default gating, no owner email in the page, draft-only backend.
// Run: node --test tests/profile-inquiry.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = process.env.PI_ROOT || path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const js = read("assets/js/profile-inquiry.js");
const page = read("profile.html");
const fn = read("db/drafts/profile-inquiry/index.ts");
const sql = read("db/drafts/2026-11-25-profile-inquiries.sql");
const mod = require(path.join(ROOT, "assets/js/profile-inquiry.js"));
const good = { name: "Sam", email: "Sam@Example.com", message: "Can you play our night in March?" };

test("accepts a normal message and lowercases the email", () => {
  const r = mod.validate(good);
  assert.equal(r.ok, true);
  assert.equal(r.v.email, "sam@example.com");
});
test("rejects bad name, email and message (negative controls)", () => {
  assert.equal(mod.validate({ ...good, name: "" }).ok, false);
  assert.equal(mod.validate({ ...good, email: "not-an-email" }).ok, false);
  assert.equal(mod.validate({ ...good, message: "hi" }).ok, false);
  assert.equal(mod.validate({ ...good, message: "x".repeat(2001) }).ok, false);
  assert.equal(mod.validate({}).ok, false);
});
test("LIVE: visible to visitors on keepitil.com (flipped after the function was deployed)", () => {
  assert.equal(mod.enabled({ hostname: "keepitil.com", search: "" }), true);
  assert.match(js, /var LIVE = true;/);
});
test("the profile page loads the module and has the CONTACT button, hidden by default", () => {
  assert.match(page, /src="\/assets\/js\/profile-inquiry\.js/);
  assert.match(page, /id="pfContact"[^>]*display:none/);
});
test("no owner email, no money, no banned wording in the form code", () => {
  assert.doesNotMatch(js, /book_email|mailto:/);
  assert.doesNotMatch(js, /verif|\$\d|price|payment|checkout/i);
});
test("form has a honeypot and a minimum-time signal", () => {
  assert.match(js, /kilInqWeb/);
  assert.match(js, /elapsed_ms/);
});
test("backend is draft-only: service-role table with RLS on and no policies", () => {
  assert.match(sql, /DRAFT — NOT APPLIED/);
  assert.match(sql, /enable row level security/);
  assert.doesNotMatch(sql, /create policy/i);
  assert.match(sql, /revoke all on public\.profile_inquiries from anon, authenticated/);
  assert.match(fn, /DRAFT — NOT DEPLOYED/);
  assert.match(fn, /ip_hash/);
  assert.doesNotMatch(fn, /return json\([^)]*book_email/);
});
test("nothing under supabase/functions or db/migrations was added (no prod change)", () => {
  assert.equal(fs.existsSync(path.join(ROOT, "supabase/functions/profile-inquiry")), false);
});
