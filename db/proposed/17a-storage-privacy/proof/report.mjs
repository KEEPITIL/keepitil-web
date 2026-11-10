/* report.mjs: render MATRIX-RESULTS.md from proof/out/results.json (+ run.log peak line). Usage: node proof/report.mjs */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const H = join(dirname(fileURLToPath(import.meta.url)), "..");
const r = JSON.parse(readFileSync(join(H, "proof/out/results.json"), "utf8"));
let peak = ""; try { peak = readFileSync(join(H, "proof/out/peak.txt"), "utf8").trim(); } catch {}
const s = r.summary, esc = (x) => String(x).replace(/\|/g, "/");
const L = [`# MATRIX-RESULTS (17A, real PostgreSQL 17.6, replica + synthetic data)`, "",
  `Engine: ${s.engine}. Run time ${s.seconds}s. Last run peak/min: ${peak}. (An earlier full run on the same Mac peaked at 12.46 load1 while other jobs were running; the preflight load was 4.1; free memory stayed >= 57%.)`, "",
  `**Behavioural matrix ${s.matrix.pass}/${s.matrix.total}** (negative controls "detects": ${s.negativeControls.detectsMet}/${s.negativeControls.detects} fail on the original and pass hardened; "baseline": ${s.negativeControls.baselineMet}/${s.negativeControls.baseline} pass on both = nothing legitimate broke). **Pack mechanics ${s.packs.pass}/${s.packs.total}. Partial-fix mutants caught ${s.mutants.pass}/${s.mutants.total}. Adjacent ${s.adjacent.pass}/${s.adjacent.total}.** Fatal: ${s.fatal || "none"}.`, "",
  "**Not reproducible on plain Postgres (UNVERIFIED against real Supabase Storage):** real public-URL serving (modelled by `public_url_readable(bucket,name)` = bucket.public), `createSignedUrl` issuance/expiry (modelled as SELECT visibility for the signing user; the expiry arithmetic is a pure-JS test in PR-B), upload/download through the Storage API, MIME/size enforcement, `move`, SVG headers. Replica assumptions (marked `A:` in proof/replica.sql): owner-scoped write predicates, `is_admin()`/`vs_is_admin()` bodies, profile_owners RLS, vs_entries columns.", "",
  "## A. Behavioural matrix (hardened vs original replica)", "", "| id | test | hardened | original | control |", "|---|---|---|---|---|",
  ...r.results.map((x) => `| ${x.id} | ${esc(x.name)} | ${x.hardened ? "PASS" : "FAIL"} | ${x.original ? "passes" : "fails"} | ${x.control}${x.controlOK ? " (met)" : " (NOT MET)"} |`), "",
  "## B. Pack mechanics (apply/rollback byte-identity, drift guards, lock, 55P03, order, read-only checks)", "", "| id | test | result |", "|---|---|---|", ...r.packRows.map((x) => `| ${x.id} | ${esc(x.name)} | ${x.pass ? "PASS" : "FAIL " + esc(x.why).slice(0, 200)} |`), "",
  "## C. Partial-fix mutants (each must be caught)", "", "| id | mutant | result |", "|---|---|---|", ...r.mutRows.map((x) => `| ${x.id} | ${esc(x.name)} | ${x.pass ? "CAUGHT" : "NOT CAUGHT"} |`), "",
  "## D. Adjacent", "", "| id | test | result |", "|---|---|---|", ...r.adjRows.map((x) => `| ${x.id} | ${esc(x.name)} | ${x.pass ? "PASS" : "FAIL"} |`), ""];
writeFileSync(join(H, "MATRIX-RESULTS.md"), L.join("\n"));
console.log("wrote MATRIX-RESULTS.md");
