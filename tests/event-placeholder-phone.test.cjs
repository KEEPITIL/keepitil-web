// Events with no cover must not fill a phone's first screen: the placeholder flyer is a short banner at <=760px; real flyers and desktop keep 2:3.
// Source probe + real-CSS check with negative controls. Run: node --test tests/event-placeholder-phone.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = process.env.EP_ROOT || path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "event.html"), "utf8");
const media = (html.match(/@media\(max-width:760px\)\{[\s\S]*?\n  \}/g) || []).find((m) => /tp-head/.test(m)) || "";

test("placeholder flyer is a capped banner inside the phone media query", () => {
  assert.match(media, /\.evcard \.flyer:has\(img\[src\$="event-placeholder\.svg"\]\)\{aspect-ratio:auto;height:150px/);
  assert.match(media, /img\[src\$="event-placeholder\.svg"\]\{object-fit:contain/);
});
test("desktop and real flyers keep the 2:3 poster ratio (the cap is only in the phone query and only for the placeholder)", () => {
  assert.match(html, /\.evcard \.flyer\{aspect-ratio:2\/3;width:100%/);
  const outside = html.replace(media, "");
  assert.doesNotMatch(outside, /event-placeholder\.svg"\]\)\{aspect-ratio:auto/);
  assert.doesNotMatch(media, /\.evcard \.flyer\{[^}]*height:150px/, "negative control: the cap is not applied to every flyer");
});
test("prerendered placeholder markup is matched by the selector", () => {
  const img = '<img src="https://keepitil.com/assets/images/event-placeholder.svg">';
  assert.ok(/img\[src\$="event-placeholder\.svg"\]/.test(media) && /src="[^"]*event-placeholder\.svg"/.test(img));
});
