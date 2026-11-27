// Owner page editing: a visible EDIT PAGE button on the page itself, owner-only, reusing the existing
// RLS-protected Edit Profile modal (profile_meta upsert). No new writes, no new tables.
// Run: node --test tests/profile-edit-button.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = process.env.PE_ROOT || path.resolve(__dirname, "..");
const page = fs.readFileSync(path.join(ROOT, "profile.html"), "utf8");

test("EDIT PAGE button exists, hidden by default, opens the existing editor", () => {
  assert.match(page, /<button[^>]*id="pfEditPage"[^>]*style="display:none"[^>]*data-click="openEditProfile"[^>]*>EDIT PAGE<\/button>/);
});
test("it is shown only through the CAN_EDIT() owner gate, alongside DASH", () => {
  assert.match(page, /\['pfDashWrap','pfEditPage'\]\.forEach\(function\(id\)\{[^}]*CAN_EDIT\(\)\?'':'none'/);
  // negative control: no other place un-hides it
  const hits = page.match(/pfEditPage/g) || [];
  assert.equal(hits.filter(Boolean).length, 4, "button id, gate, and 2 css selectors only");
});
test("the editor still refuses non-owners and writes only the owner's own slug via RLS upsert", () => {
  assert.match(page, /function openEditProfile\(\)\{\s*if\(!CAN_EDIT\(\)\)\{ toast\('Only the profile owner can edit\.'\); return; \}/);
  assert.match(page, /SB\.from\('profile_meta'\)\.upsert\(meta\)/);
  assert.match(page, /var meta=\{ slug:PROFILE_SLUG,/);
});
test("editor covers text, links and photos (nothing missing to build)", () => {
  for (const id of ["epName", "epBio", "epAbout", "epAvatarFile", "epCoverFile", "epCoverMFile", "epIG", "epWeb"]) {
    assert.ok(page.includes('id="' + id + '"'), id);
  }
});
