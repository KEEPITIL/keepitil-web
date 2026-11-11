/* preflight-staging-only.mjs - REFUSES to let the real test-mode run start unless EVERY configured endpoint, key and redirect is provably STAGING / TEST (Sentinel S5, Atlas 8).
   Usage (values come from the environment of the machine that holds them; nothing is printed except the NAMES of failed checks):
     KIL_STAGING_REF=<20-char staging project ref> SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... STRIPE_SECRET_KEY=... STRIPE_PUBLISHABLE_KEY=... KIL_SITE_URL=... KIL_WEBHOOK_ENDPOINT_URL=... node preflight-staging-only.mjs
   Exit 0 only when ok. Never prints a key, a token or a JWT. Pure function checkStaging(env) is unit-tested with negative controls (preflight-staging-only.test.mjs). */
import { pathToFileURL } from "node:url";

export const DENY_REFS = { ovmqtzjfpzrbzrlkxwgw: "keepitil-prod", xdoxfoectugsbbujjezq: "kode (live scheduler)", dojmswwxmdtizrtoirem: "nexus" };
export const DENY_HOSTS = ["keepitil.com", "www.keepitil.com", "keepitil.github.io"];
const REF = /^[a-z]{20}$/;
const hostOf = (v) => { try { return new URL(v).hostname.toLowerCase(); } catch { return null; } };
const jwtRef = (j) => { try { const p = JSON.parse(Buffer.from(String(j).split(".")[1], "base64url").toString("utf8")); return p.ref ?? null; } catch { return null; } };
const jwtRole = (j) => { try { return JSON.parse(Buffer.from(String(j).split(".")[1], "base64url").toString("utf8")).role ?? null; } catch { return null; } };

export function checkStaging(env) {
  const bad = []; const need = (name, cond) => { if (!cond) bad.push(name); };
  const ref = env.KIL_STAGING_REF;
  need("KIL_STAGING_REF is set, is a 20-letter project ref and is not a denied project (prod / kode / nexus)", typeof ref === "string" && REF.test(ref) && !(ref in DENY_REFS));
  const want = typeof ref === "string" ? `${ref}.supabase.co` : null;
  need("SUPABASE_URL host is exactly <staging ref>.supabase.co over https", !!want && env.SUPABASE_URL?.startsWith("https://") && hostOf(env.SUPABASE_URL) === want);
  need("KIL_WEBHOOK_ENDPOINT_URL host is exactly <staging ref>.supabase.co over https", !!want && env.KIL_WEBHOOK_ENDPOINT_URL?.startsWith("https://") && hostOf(env.KIL_WEBHOOK_ENDPOINT_URL) === want && /\/functions\/v1\/stripe-webhook\/?$/.test(env.KIL_WEBHOOK_ENDPOINT_URL));
  for (const k of ["SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) need(`${k} is a JWT whose ref claim equals the staging ref`, !!ref && jwtRef(env[k]) === ref);
  need("SUPABASE_ANON_KEY has role anon and SUPABASE_SERVICE_ROLE_KEY has role service_role", jwtRole(env.SUPABASE_ANON_KEY) === "anon" && jwtRole(env.SUPABASE_SERVICE_ROLE_KEY) === "service_role");
  need("STRIPE_SECRET_KEY is a TEST key (sk_test_ / rk_test_), never live", /^(sk|rk)_test_[A-Za-z0-9]+$/.test(env.STRIPE_SECRET_KEY || ""));
  need("STRIPE_PUBLISHABLE_KEY is a TEST key (pk_test_)", /^pk_test_[A-Za-z0-9]+$/.test(env.STRIPE_PUBLISHABLE_KEY || ""));
  need("STRIPE_WEBHOOK_SECRET looks like a webhook secret (whsec_)", /^whsec_[A-Za-z0-9+/=_-]{8,}$/.test(env.STRIPE_WEBHOOK_SECRET || ""));
  const site = hostOf(env.KIL_SITE_URL || "");
  need("KIL_SITE_URL is set, is not a keepitil production host, and is https staging or loopback", !!site && !DENY_HOSTS.includes(site) && !site.endsWith(".keepitil.com") && (env.KIL_SITE_URL.startsWith("https://") || ["127.0.0.1", "localhost"].includes(site)));
  // no value anywhere in the testbed's own variables may mention a denied project ref, a live key or a production host
  const names = Object.keys(env).filter((k) => /^(KIL_|SUPABASE_|STRIPE_)/.test(k));
  need("no configured value mentions a denied project ref (prod / kode / nexus)", !names.some((k) => Object.keys(DENY_REFS).some((r) => String(env[k]).includes(r)) || Object.keys(DENY_REFS).some((r) => jwtRef(env[k]) === r)));
  need("no configured value is a live Stripe key", !names.some((k) => /(sk|pk|rk)_live_/.test(String(env[k]))));
  need("no configured URL points at a keepitil production host", !names.some((k) => /^https?:\/\//.test(String(env[k])) && DENY_HOSTS.some((h) => hostOf(String(env[k])) === h)));
  need("KIL_PRODUCTION_WRITES is not enabled", !["1", "true", "yes"].includes(String(env.KIL_PRODUCTION_WRITES || "").toLowerCase()));
  return { ok: bad.length === 0, failed: bad };
}
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const r = checkStaging(process.env);
  if (r.ok) { console.log("PREFLIGHT OK: every endpoint, key and redirect is staging / test-mode."); process.exit(0); }
  console.error("PREFLIGHT FAILED. Do NOT start the test. Failed checks (names only, no values):"); for (const f of r.failed) console.error(" - " + f); process.exit(2);
}
