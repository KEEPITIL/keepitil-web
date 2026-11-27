// Event page "Add to calendar": .ics + Google link built client-side from the event's own fields. Run: node --test tests/event-add-to-calendar.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = process.env.AC_ROOT || path.resolve(__dirname, "..");
const cal = require(path.join(ROOT, "assets/js/kil-calendar.js"));
const html = require("./helpers/event-assembled.cjs").assemble(fs.readFileSync(path.join(ROOT, "event.html"), "utf8"));
const row = { slug: "winter-wonderland", title: "Winter, Wonderland; live", venue: "Watermark Bar", city: "New York", state: "NY", starts_at: "2026-11-27T03:00:00Z", ends_at: null };
const NOW = new Date("2026-11-25T12:00:00Z");

test("ics has the event's own start, a 2h default end, escaped title, venue and address", () => {
  const s = cal.ics(row, "https://keepitil.com/event/winter-wonderland/", NOW);
  assert.match(s, /^BEGIN:VCALENDAR\r\n/); assert.match(s, /END:VCALENDAR\r\n$/);
  assert.match(s, /DTSTART:20261127T030000Z/); assert.match(s, /DTEND:20261127T050000Z/);
  assert.match(s, /SUMMARY:Winter\\, Wonderland\\; live/);
  assert.match(s, /LOCATION:Watermark Bar\\, New York\\, NY/);
  assert.match(s, /URL:https:\/\/keepitil\.com\/event\/winter-wonderland\//);
});
test("a real end time wins over the default", () => {
  assert.match(cal.ics({ ...row, ends_at: "2026-11-27T07:30:00Z" }, "", NOW), /DTEND:20261127T073000Z/);
});
test("google link carries title, dates and location", () => {
  const g = cal.googleUrl(row, "https://keepitil.com/e");
  assert.match(g, /^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE&text=Winter%2C%20Wonderland%3B%20live&dates=20261127T030000Z\/20261127T050000Z/);
  assert.match(g, /location=Watermark%20Bar%2C%20New%20York%2C%20NY/);
});
test("negative controls: no start = no file and no link; ended events get no button; bad end falls back", () => {
  assert.equal(cal.ics({ title: "x" }, "", NOW), ""); assert.equal(cal.googleUrl({ title: "x", starts_at: "nope" }, ""), "");
  assert.equal(cal.upcoming({ ...row, starts_at: "2026-11-20T03:00:00Z" }, NOW), false);
  assert.equal(cal.upcoming(row, NOW), true);
  assert.match(cal.ics({ ...row, ends_at: "2026-11-26T00:00:00Z" }, "", NOW), /DTEND:20261127T050000Z/, "an end before the start is ignored");
});
test("event.html loads the module and wires the buttons into the Share row, using window.URL (the page shadows URL)", () => {
  assert.match(html, /<script src="\/assets\/js\/kil-calendar\.js\?v=h[0-9a-f]{8}"><\/script>/);
  assert.match(html, /id="ev-ics">📅 Add to calendar/); assert.match(html, /id="ev-gcal"/);
  assert.match(html, /window\.URL\.createObjectURL/); assert.doesNotMatch(html, /[^.\w]URL\.createObjectURL/);
});

test("every semicolon in text fields is backslash-escaped (RFC 5545); the old no-op escape fails this", () => {
  const unescapedSemi = (line) => /(^|[^\\]);/.test(line.replace(/^[A-Z]+:/, ""));
  const lines = cal.ics({ ...row, title: "Rave; Part 2", venue: "Hall; East" }, "", NOW).split("\r\n").filter((l) => /^(SUMMARY|LOCATION):/.test(l));
  assert.equal(lines.length, 2);
  for (const l of lines) assert.equal(unescapedSemi(l), false, l);
  assert.match(lines[0], /^SUMMARY:Rave\\; Part 2$/);
  const oldEsc = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,");   // the buggy version: '\;' is just ';'
  assert.equal(unescapedSemi("SUMMARY:" + oldEsc("Rave; Part 2")), true, "negative control: the old escape leaves the semicolon bare");
});
