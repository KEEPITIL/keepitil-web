// A signed-out visitor who is sent to log in must come back to what they were doing (apply.html honours a safe ?next=).
// Run: node --test tests/login-keeps-destination.test.cjs
const test = require("node:test");
const __A = require("./helpers/event-assembled.cjs").assemble;
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = process.env.LD_ROOT || path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

test("create-event and settings signed-out gates carry ?next= to their own page", () => {
  assert.match(read("create-event.html"), /<a class="btn primary" href="\/apply\?next=%2Fcreate-event">Log in to create your event<\/a>/);   // the link (?next=) is the rule; the label says what it is for
  assert.match(read("settings.html"), /<a class="btn primary" href="\/apply\?next=%2Fsettings">Log in \/ Join<\/a>/);
  assert.doesNotMatch(read("create-event.html"), /class="btn primary" href="\/apply">/, "negative control: the old bare link is gone");
});
test("profile MESSAGE and the sign-in-check retry send the visitor back to this profile", () => {
  const p = __A(read("profile.html"));
  assert.match(p, /Sign in to message\.'\); setTimeout\(function\(\)\{location\.href='\/apply\?next='\+encodeURIComponent\(location\.pathname\+location\.search\);\}/);
  assert.match(p, /label:'Sign in', go:function\(\)\{ location\.href='\/apply\?next='\+encodeURIComponent\(location\.pathname\+location\.search\); \}/);
  assert.doesNotMatch(p, /location\.href='\/apply';\},700\)/);
});
test("apply.html still accepts only a safe same-origin path (the thing ?next= relies on)", () => {
  const a = read("apply.html");
  assert.match(a, /n\.charAt\(0\) !== '\/' \|\| n\.charAt\(1\) === '\/'/);
});
