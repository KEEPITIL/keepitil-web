/* proof/report.mjs - renders proof/out/results.json (+ peak.txt) into MATRIX-RESULTS.md. Usage: node proof/report.mjs */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = join(dirname(fileURLToPath(import.meta.url)), "..");
const r = JSON.parse(readFileSync(join(HERE, "proof/out/results.json"), "utf8"));
let peak = ""; try { peak = readFileSync(join(HERE, "proof/out/peak.txt"), "utf8").trim(); } catch {}
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const yn = (v) => (v === true ? "pass" : v === false ? "FAIL" : String(v));
const L = [];
const nc = r.summary.negativeControls;
L.push("# 13A orders hardening: proof results (real PostgreSQL 17.6, replica, synthetic data)", "");
L.push(`Generated from \`proof/out/results.json\` by \`proof/report.mjs\`. Engine: ${r.summary.engine}. Wall time ${r.summary.seconds}s. ${peak ? "Machine: " + peak + "." : ""}`, "");
L.push(`Totals: behavioural matrix ${r.summary.matrix.pass}/${r.summary.matrix.total} (negative controls: ${nc.detectsMet}/${nc.detects} 'detects' tests FAIL on the original as required; ${nc.baselineMet}/${nc.baseline} 'baseline' regression tests pass on both); pack / structural / mutants / F-D ${r.summary.packs.pass}/${r.summary.packs.total}; informational findings ${r.summary.adjacent.pass}/${r.summary.adjacent.total}; fatal: ${r.summary.fatal || "none"}.`, "");
L.push("Every behavioural test runs on BOTH worlds: **original** = replica of the captured prod ticketing tables with the 12A packs applied; **hardened** = the same plus the real 13A pack 01 (the committed SQL file, executed). 'control' says what the original MUST do for the test to be a valid proof:",
  "`detects` = the test must FAIL on the original (it proves a defect that 13A removes); `baseline` = the original also passes (regression guard that the fix did not break the real flows).", "");
L.push("## A. Behavioural matrix", "", "| id | test | hardened | original | control | control met | original failure detail |", "|---|---|---|---|---|---|---|");
for (const x of r.results) L.push(`| ${x.id} | ${esc(x.name)} | ${yn(x.hardened)} | ${yn(x.original)} | ${x.control} | ${x.controlOK ? "yes" : "NO"} | ${x.control === "detects" ? esc(String(x.originalWhy).slice(0, 150)) : ""} |`);
L.push("", "## B. Packs, drift guard, rollback, lock, PRECHECK, ordering vs 12A, mutants, F-D get_ticket", "", "| id | test | result | detail |", "|---|---|---|---|");
for (const x of r.packRows) L.push(`| ${x.id} | ${esc(x.name)} | ${x.pass ? "pass" : "FAIL"} | ${esc(x.why)} |`);
L.push("", "## C. Informational findings (replica only; NOT changed by 13A)", "", "| id | test | result | detail |", "|---|---|---|---|");
for (const x of r.adjRows) L.push(`| ${x.id} | ${esc(x.name)} | ${x.pass ? "pass (finding reproduced)" : "FAIL"} | ${esc(x.why)} |`);
L.push("", `Fingerprints used by the guards: ${JSON.stringify(r.summary.md5)}`, "");
writeFileSync(join(HERE, "MATRIX-RESULTS.md"), L.join("\n"));
console.log("wrote MATRIX-RESULTS.md");
