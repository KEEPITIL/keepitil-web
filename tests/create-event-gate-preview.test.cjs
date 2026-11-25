// Signed-out /create-event says what the form asks before it asks for a login. Plain wording: no prices, no verification claims.
// Run: node --test tests/create-event-gate-preview.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = process.env.CG_ROOT || path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "create-event.html"), "utf8");
const gate = (html.match(/<div class="gate" id="gate"[\s\S]*?<\/div>\s*<\/div>/) || [""])[0];

test("the gate lists what you will fill in and still has the login button with ?next=", () => {
  assert.match(gate, /id="gate-peek"/);
  for (const w of ["event name", "start date and time", "description", "cover image", "lineup", "ticket tiers"]) assert.ok(gate.includes(w), w);
  assert.match(gate, /<a class="btn primary" href="\/apply\?next=%2Fcreate-event">Log in \/ Join<\/a>/);
});
test("gate copy has no price, money or verification wording (negative control on a bad sample)", () => {
  assert.doesNotMatch(gate, /verif|\$\d|price|fee|payout/i);
  assert.match("Tickets are $10 verified", /verif|\$\d/i);
});
test("the peek lives only in the signed-out gate, not in the form", () => {
  assert.equal((html.match(/id="gate-peek"/g) || []).length, 1);
  assert.ok(html.indexOf('id="gate-peek"') < html.indexOf('<form id="form"'));
});
