// The site must not ship a dangling store-link placeholder or a visible internal review note.
// NEGATIVE CONTROL: the same scan run on origin/main html (git show) must find them.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const SKIP = new Set(["node_modules", ".git", "build-service"]);
function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f, out); else if (e.name.endsWith(".html")) out.push(f);
  }
  return out;
}
const visible = (html) => html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "");
export function findProblems(files) {   // files: [[relPath, html], ...]
  const bad = [];
  for (const [f, html] of files) {
    if (html.includes("APP_STORE_URL_PENDING")) bad.push(f + ": APP_STORE_URL_PENDING");
    if (/draft note/i.test(visible(html))) bad.push(f + ": visible draft note");
  }
  return bad;
}

test("no APP_STORE_URL_PENDING placeholder and no visible \"Draft note\" in any site html", () => {
  const files = walk(root).map((f) => [path.relative(root, f), fs.readFileSync(f, "utf8")]);
  assert.ok(files.length > 50, "scanned the site html");
  assert.deepEqual(findProblems(files), []);
});

test("the wifi-remote article keeps the restore marker and has no App Store link", () => {
  const h = fs.readFileSync(path.join(root, "article/wifi-remote-control-the-room/index.html"), "utf8");
  assert.ok(h.includes("<!-- TODO: restore App Store link when the store URL exists -->"));
  assert.doesNotMatch(visible(h), /Download on the App Store/);
});

test("NEGATIVE CONTROL: origin/main html holds the placeholder and the visible notes (the scan flags them)", { skip: !process.env.KIL_BASE_REF && "set KIL_BASE_REF=origin/main to run" }, () => {
  const ref = process.env.KIL_BASE_REF;
  const rel = ["article/wifi-remote-control-the-room/index.html", "article/kform-lead-capture/index.html"];
  const files = rel.map((f) => [f, execFileSync("git", ["-C", root, "show", ref + ":" + f], { encoding: "utf8" })]);
  const bad = findProblems(files);
  assert.ok(bad.some((b) => /wifi-remote.*APP_STORE_URL_PENDING/.test(b)), bad.join("; "));
  assert.ok(bad.some((b) => /wifi-remote.*visible draft note/.test(b)), bad.join("; "));
  assert.ok(bad.some((b) => /kform.*visible draft note/.test(b)), bad.join("; "));
});
