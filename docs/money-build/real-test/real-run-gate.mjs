/* real-run-gate.mjs - the ONLY way the real test-mode run is started (Sentinel S5, round 2: "enforce the preflight when the run starts").
   Usage:  node real-run-gate.mjs -- <command> [args...]
   It runs checkStaging(process.env) FIRST. If any check fails it prints the failed check NAMES (never a value), exits 2, and the command is NEVER spawned. If the checks pass it spawns the command with the
   same environment and returns its exit code. Anything that creates a checkout session, calls Stripe or touches the staging database during the real run is launched through this gate (see REAL-CHECKOUT-DOOR-TEST.md 2a),
   so a missing, production-pointing or live-key configuration cannot be run by mistake. Pure part: gate(env) -> { ok, failed }. */
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { checkStaging } from "./preflight-staging-only.mjs";

export function gate(env) { return checkStaging(env); }
export function runGated(argv, env = process.env, spawn = spawnSync) {
  const r = gate(env);
  if (!r.ok) return { code: 2, failed: r.failed, ran: false };
  if (!argv.length) return { code: 0, failed: [], ran: false };
  const s = spawn(argv[0], argv.slice(1), { stdio: "inherit", env });
  return { code: s.status ?? 1, failed: [], ran: true };
}
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const i = process.argv.indexOf("--"); const cmd = i >= 0 ? process.argv.slice(i + 1) : [];
  const r = runGated(cmd);
  if (!r.ok && r.code === 2) { console.error("REAL-RUN GATE REFUSED. The command was NOT started. Failed checks (names only, no values):"); for (const f of r.failed) console.error(" - " + f); }
  else if (!r.ran) console.log("GATE OK (no command given).");
  process.exit(r.code);
}
