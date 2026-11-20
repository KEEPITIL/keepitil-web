/* proof/report.mjs - renders proof/out/results.json (+ peak.txt) into MATRIX-RESULTS.md. Usage: node proof/report.mjs */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = join(dirname(fileURLToPath(import.meta.url)), "..");
const r = JSON.parse(readFileSync(join(HERE, "proof/out/results.json"), "utf8"));
let peak = ""; try { peak = readFileSync(join(HERE, "proof/out/peak.txt"), "utf8").trim(); } catch {}
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const yn = (v) => (v === true ? "pass" : v === false ? "FAIL" : v === "n/a" || v === null ? "n/a" : String(v));
const lines = [];
lines.push("# 12A door hardening: proof results (real PostgreSQL 17.6, replica, synthetic data)", "");
lines.push(`Generated from \`proof/out/results.json\` by \`proof/report.mjs\`. Engine: ${r.summary.engine}. Wall time ${r.summary.seconds}s. ${peak ? "Machine: " + peak + "." : ""}`, "");
lines.push(`Totals: behavioural matrix ${r.summary.matrix.pass}/${r.summary.matrix.total}; pack/structural ${r.summary.packs.pass}/${r.summary.packs.total}; adjacent findings (replica only) ${r.summary.adjacent.pass}/${r.summary.adjacent.total}; fatal: ${r.summary.fatal || "none"}.`, "");
lines.push("Every behavioural test runs on BOTH the original (prod-captured bodies, replica) and the hardened replica (built by running the real packs). Column 'control' says what the original MUST do for the test to be a valid proof:",
  "`detects` = the test must FAIL on the original (it proves a defect that the hardening removes); `baseline` = the original also passes (regression guard, not a discriminating test); `n/a` = object does not exist on the original.", "");
lines.push("## A. Behavioural matrix", "", "| id | function | test | hardened | original | control | control met | original failure detail |", "|---|---|---|---|---|---|---|---|");
for (const x of r.results) lines.push(`| ${x.id} | ${x.fn} | ${esc(x.name)} | ${yn(x.hardened)} | ${yn(x.original)} | ${x.control} | ${x.controlOK === null ? "n/a" : x.controlOK ? "yes" : "NO"} | ${x.control === "detects" ? esc(String(x.originalWhy).slice(0, 140)) : ""} |`);
lines.push("", "## B. Detector self-checks, packs, drift guard, rollback, lock, precheck", "", "| id | test | result | detail |", "|---|---|---|---|");
for (const x of r.packRows) lines.push(`| ${x.id} | ${esc(x.name)} | ${x.pass ? "pass" : "FAIL"} | ${esc(x.why)} |`);
lines.push("", "## C. Adjacent findings proven on the replica only (NOT fixed by 12A)", "", "| id | test | result | detail |", "|---|---|---|---|");
for (const x of r.adjRows) lines.push(`| ${x.id} | ${esc(x.name)} | ${x.pass ? "pass (finding reproduced / follow-up sketch verified)" : "FAIL"} | ${esc(x.why)} |`);
lines.push("", `Function body md5s used by the guards: ${JSON.stringify(r.summary.md5)}`, "");
writeFileSync(join(HERE, "MATRIX-RESULTS.md"), lines.join("\n"));
console.log("wrote MATRIX-RESULTS.md");
