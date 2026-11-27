// axe (2026-11-25, real Chrome, signed-out): /settings had no <main> landmark (landmark-one-main) and its h1 and log-in gate sat outside any landmark (region).
// The page content now lives in one <main>. Run: node --test tests/settings-main-landmark.test.cjs
const test = require("node:test");
const __A = require("./helpers/event-assembled.cjs").assemble;
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const html = __A(fs.readFileSync(path.join(__dirname, "..", "settings.html"), "utf8"));
const body = html.slice(html.indexOf("<body"));
const count = (s, re) => (s.match(re) || []).length;
const main = body.slice(body.indexOf("<main"), body.indexOf("</main>"));

test("exactly one <main>, and it holds the h1, the log-in gate and the settings columns", () => {
  assert.equal(count(body, /<main[\s>]/g), 1); assert.equal(count(body, /<\/main>/g), 1);
  for (const w of ['<h1 class="pt">Settings</h1>', 'id="gate"', 'id="cols"', 'id="exp-row"']) assert.ok(main.includes(w), w + " is inside main");
});
test("the nav stays outside main and the scripts come after it", () => {
  assert.ok(body.indexOf("</main>") < body.indexOf("<script src="), "scripts after main");
  assert.ok(body.indexOf('id="main-nav"') < body.indexOf("<main"), "nav before main");
});
test("div balance inside main is intact (a stray </div> would break the layout)", () => {
  assert.equal(count(main, /<div\b/g), count(main, /<\/div>/g));
});
test("NEGATIVE CONTROL: the old markup (a div wrapper) has no main", () => {
  const old = body.replace('<main class="wrap" id="main">', '<div class="wrap">').replace(/<\/main>/, "</div>");
  assert.equal(count(old, /<main[\s>]/g), 0);
});

test("every <select> on the page has an accessible name (axe select-name, theme-only view showed the Language select without one)", () => {
  const sels = html.match(/<select\b[^>]*>/g) || [];
  assert.ok(sels.length >= 4, "found the selects: " + sels.length);
  for (const s of sels) assert.match(s, /aria-label="[^"]+"/, s);
  assert.doesNotMatch('<select data-k="language">', /aria-label=/, "negative control: the old markup had no name");
});

test("every visible text/email/password input has a name (label for=, or aria-label)", () => {
  const inputs = (html.match(/<input\b[^>]*>/g) || []).filter((i) => !/type="(hidden|checkbox|radio|submit|button)"/.test(i));
  assert.ok(inputs.length >= 3);
  for (const i of inputs) {
    const id = (i.match(/\bid="([^"]+)"/) || [])[1];
    assert.ok(/aria-label="[^"]+"/.test(i) || (id && new RegExp('<label[^>]*for="' + id + '"').test(html)), i);
  }
  assert.ok(!/aria-label=/.test('<input type="email" id="acc-email-in" placeholder="you@email.com">'), "negative control: the old email input had only a placeholder");
});
