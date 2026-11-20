/* extract-web-payloads.mjs - runs the REAL final web save code (profile.html of the #129 / 10B branch) through the same node:vm harness as
   assets/js/profile-noop-save.test.mjs and writes the profile_meta / profile_content calls it makes as JSON fixtures.
   It does not re-implement the save: it loads the test file's own harness text (fake DOM + vm build()) and its STORED fixture, then drives
   open() / edit / save() for the scenarios Atlas's C4/C5 need (no-op, bio edit, link edit, business-type request, + insert fallback, + public toggle).
   Usage: node extract-web-payloads.mjs <repo-root>   (writes web-payloads.json next to this file)                                         */
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
const HERE = dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] || join(HERE, "..", "..", "..", "..");
const testPath = join(root, "assets/js/profile-noop-save.test.mjs"), htmlPath = join(root, "profile.html");
const T = readFileSync(testPath, "utf8");
const cut = T.indexOf("\nconst J = ");
const storedStart = T.indexOf("\nconst STORED = {"), storedEnd = T.indexOf("\n/* Owner client write grants");
if (cut < 0 || storedStart < 0 || storedEnd < 0) throw new Error("test file layout changed; extractor needs an update");
const mod = T.slice(0, cut) + "\n" + T.slice(storedStart, storedEnd) + "\nexport { build, STORED };\n";
const dir = mkdtempSync(join(tmpdir(), "w11b-"));
const tmp = join(dir, "harness.mjs");
writeFileSync(tmp, mod);
process.env.PROFILE_HTML = htmlPath;
const { build, STORED } = await import(pathToFileURL(tmp).href);
const rec = (t) => t.writes.map((w) => ({ table: w.table, op: w.op, payload: w.payload === undefined ? null : w.payload, eq: w.eq }));
const out = { source: { file: "profile.html", sha256: createHash("sha256").update(readFileSync(htmlPath)).digest("hex"), test: "assets/js/profile-noop-save.test.mjs" }, stored: STORED, scenarios: {} };
async function run(name, stored, mutate, opts) { const t = build(stored, opts); t.open(); if (mutate) mutate(t); await t.save(); out.scenarios[name] = { writes: rec(t), toasts: t.toasts }; }
await run("noop", STORED, null);
await run("bio_edit", STORED, (t) => { t.el("epBio").value = "A new bio"; });
await run("link_edit", STORED, (t) => { t.el("epL4").value = "https://new.test/4"; });
await run("btype_request", STORED, (t) => { t.el("epAcctRequest").value = "brand"; });
await run("public_toggle", STORED, (t) => { t.el("epPublic").checked = false; });
await run("insert_fallback", STORED, (t) => { t.el("epBio").value = "first bio"; }, { updateMatches: false });
writeFileSync(join(HERE, "web-payloads.json"), JSON.stringify(out, null, 1) + "\n");
console.log("web payloads:", Object.entries(out.scenarios).map(([k, v]) => k + "=" + v.writes.map((w) => w.table + "." + w.op + (w.payload ? "[" + Object.keys(w.payload).join(",") + "]" : "")).join("+")).join(" | "));
