// The "Download my data" sentence on /settings must describe what export_my_data() really returns (keepitil.github.io #95, applied 2026-11-25).
// Run: node --test tests/export-copy.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const st = fs.readFileSync(path.join(__dirname, "..", "settings.html"), "utf8");
const line = (id) => (st.match(new RegExp('id="' + id + '"[\\s\\S]*?<small>([^<]*)</small>')) || [])[1] || "";
// top-level keys of export_my_data() and the plain words that cover each
const KEYS = {
  account: /account details/, settings: /settings/, profiles: /your profiles/, profile_content: /what you posted/,
  events_submitted: /events/, saved_events: /saved events/, following: /who you follow/, ticket_orders: /ticket orders/,
  event_registrations: /registrations/, other_content: /comments, chat messages, playlists and other activity/,
  financial: /billing and payout records/, messages_sent: /messages you sent/,
};
test("the download row names every top-level part of the export in plain words", () => {
  const s = line("exp-row");
  assert.ok(s.length > 100, "found the sentence");
  for (const [k, re] of Object.entries(KEYS)) assert.match(s, re, k);
});
test("the email-fallback row says the same things", () => {
  const s = line("exp-mail-row");
  for (const [k, re] of Object.entries(KEYS)) { if (k === "events_submitted") continue; assert.match(s, re, k); }
});
test("NEGATIVE CONTROL: the old four-item sentence is caught by the same checks", () => {
  const old = "A copy of your profile, events, saves, follows and orders as a JSON file";
  const missing = Object.entries(KEYS).filter(([, re]) => !re.test(old)).map(([k]) => k);
  assert.ok(missing.length >= 6, "the old text misses most of the export: " + missing.join(","));
});
test("no new claim that the export holds anything it does not (no bank numbers, tax IDs, passwords)", () => {
  assert.doesNotMatch(line("exp-row"), /password|bank|tax|ssn|card number/i);
});
