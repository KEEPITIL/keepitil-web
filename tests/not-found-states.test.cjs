// /event with no slug and /venue with a missing or unknown venue used to end in a bare line of text
// (or an empty shell), while /profile and /event?e=bad render the shared KIL_NOT_FOUND state
// (heading, links, noindex). Run: node --test tests/not-found-states.test.cjs
const test = require("node:test");
const __A = require("./helpers/event-assembled.cjs").assemble;
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = process.env.NF_ROOT || path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

test("event.html renders the not-found state when the URL has no slug", () => {
  const h = require("./helpers/event-assembled.cjs").assemble(read("event.html"));
  assert.match(h, /if\(!ev\.slug\)\{[\s\S]{0,400}window\.KIL_NOT_FOUND\(\{ what:'event'/);
});
test("venue.html uses KIL_NOT_FOUND for both a missing and an unknown venue", () => {
  const h = __A(read("venue.html"));
  assert.match(h, /function venueNF\(\)/);
  assert.match(h, /KIL_NOT_FOUND\(\{ what:'venue'/);
  assert.match(h, /if\(!SB\|\|!SLUG\)\{ venueNF\(\)/);
  assert.match(h, /if\(!V\)\{ venueNF\(\)/);
  assert.ok(!/textContent='Venue not found\.'/.test(h), "bare dead-end text must be gone");
});
test("the shared helper still sets noindex and is defined in the shell", () => {
  const s = read("keepitil-shell.js");
  assert.match(s, /m\.content = 'noindex,follow'/);
  assert.match(s, /KIL_NOT_FOUND = function/);
});
