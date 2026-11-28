// The prerender workflow must stay least-privilege: read-only by default, contents:write on the one job only, never create or approve a PR, never push to main unless EVENT_PRERENDER_PUSH is on (generated paths only),
// off unless EVENT_PRERENDER is "on". Run: node --test tests/event-prerender-workflow.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = process.env.EW_ROOT || path.resolve(__dirname, "..");
const y = fs.readFileSync(path.join(ROOT, ".github/workflows/event-prerender.yml"), "utf8");
const code = y.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
test("workflow default permissions are read-only; write is granted on the one job", () => {
  const top = code.match(/\npermissions:\n((?:  .+\n)+)/)[1];
  assert.equal(top.trim(), "contents: read");
  const job = code.slice(code.indexOf("\njobs:"));
  assert.match(job, /\n    permissions:\n      contents: write\n/);
  assert.doesNotMatch(code, /pull-requests:|id-token:|checks:|statuses:/, "no other permission is requested");
  assert.match(job, /\n      actions: write\n/, "actions: write only to start Deploy Pages by dispatch");
  assert.equal(code.match(/actions: write/g).length, 1);
});
test("it never creates, approves or merges a pull request", () => {
  assert.doesNotMatch(code, /gh pr |pulls\.create|pull-request|gh api [^\n]*pulls|--admin|auto-merge|approve/i);
});
test("it pushes to prerender/run-<id>, or (only with EVENT_PRERENDER_PUSH on) the generated files to main without force; never anything else", () => {
  const pushes = [...code.matchAll(/git push([^\n]*)/g)].map((m) => m[1].trim());
  assert.deepEqual(pushes, ['origin "$branch"', 'origin HEAD:main; then pushed=yes; break; fi']);
  assert.match(code, /branch="prerender\/run-\$\{\{ github\.run_id \}\}"/);
  assert.doesNotMatch(code, /--force|-f\b|\+HEAD|--force-with-lease/);
  const branchStep = code.slice(code.indexOf("Push the generated pages to a branch"), code.indexOf("Publish the generated files to main"));
  assert.match(branchStep, /vars\.EVENT_PRERENDER_PUSH != 'on'/, "the branch push is off when direct publishing is on");
  const mainStep = code.slice(code.indexOf("Publish the generated files to main"));
  assert.match(mainStep, /if: \$\{\{ vars\.EVENT_PRERENDER_PUSH == 'on' && steps\.dedupe\.outputs\.skip != 'none' \}\}/);
  assert.match(mainStep, /grep -vE '\^\(event\/\|sitemap-events/, "refuses to commit anything outside the generated paths");
  assert.match(mainStep, /git add event sitemap-events\.xml/); assert.match(mainStep, /gh workflow run pages\.yml --ref main/);
});
test("it only runs when the repository variable EVENT_PRERENDER is on", () => {
  assert.match(code, /if: \$\{\{ vars\.EVENT_PRERENDER == 'on' \}\}/);
});
test("the prerender branch carries the regenerated events sitemap too", () => {
  assert.match(code, /git status --porcelain event sitemap-events\.xml/);
  assert.match(code, /git add event sitemap-events\.xml/);
});
test("scheduled every 30 minutes (offset from the hour), plus manual and dispatch triggers", () => {
  assert.match(code, /cron: '11,41 \* \* \* \*'/); assert.match(code, /workflow_dispatch:/); assert.match(code, /types: \[event-changed\]/);
});
test("a run whose pages are already waiting on a prerender branch pushes nothing; the push step is gated on that", () => {
  assert.match(code, /sh scripts\/prerender-dedupe\.sh/); assert.match(code, /if: \$\{\{ steps\.dedupe\.outputs\.skip == 'no' && vars\.EVENT_PRERENDER_PUSH != 'on' \}\}/);
  assert.doesNotMatch(code, /git push[^\n]*--delete|git push origin :|branch -D|push -d/, "never deletes a branch (that could close someone's open PR)");
});
