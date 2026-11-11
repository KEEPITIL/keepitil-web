/* check-session-redirect.mjs - N4, automated (Sentinel S5 / Atlas 8). After the staging create-checkout makes a session, its success_url and cancel_url must be on the STAGING site and never on keepitil.com.
   Pure: checkRedirect(session, env) -> { ok, failed[] }. CLI: node check-session-redirect.mjs cs_test_...   reads the session from Stripe with STRIPE_SECRET_KEY (a TEST key, enforced by the preflight)
   and compares the two URLs' host with KIL_SITE_URL's host. Prints names and hosts only, never a key. Run it through real-run-gate.mjs. */
import { pathToFileURL } from "node:url";
import { DENY_HOSTS } from "./preflight-staging-only.mjs";
const hostOf = (v) => { try { return new URL(v).hostname.toLowerCase(); } catch { return null; } };
export function checkRedirect(session, env) {
  const bad = []; const site = hostOf(env.KIL_SITE_URL || "");
  if (!site) bad.push("KIL_SITE_URL is not a valid URL");
  for (const k of ["success_url", "cancel_url"]) {
    const h = hostOf(session?.[k] || "");
    if (!h) { bad.push(`${k} is missing or not a URL`); continue; }
    if (DENY_HOSTS.includes(h) || h.endsWith(".keepitil.com")) bad.push(`${k} points at a keepitil production host (${h})`);
    if (site && h !== site) bad.push(`${k} host (${h}) is not the staging site host (${site})`);
  }
  if (session?.livemode === true) bad.push("the session is LIVE mode");
  return { ok: bad.length === 0, failed: bad };
}
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const id = process.argv[2]; const key = process.env.STRIPE_SECRET_KEY || "";
  if (!/^cs_test_[A-Za-z0-9]+$/.test(id || "") || !/^(sk|rk)_test_/.test(key)) { console.error("usage: STRIPE_SECRET_KEY=<test key> KIL_SITE_URL=<staging site> node check-session-redirect.mjs cs_test_..."); process.exit(2); }
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions/" + id, { headers: { authorization: "Bearer " + key } });
  if (!res.ok) { console.error("could not read the session: HTTP " + res.status); process.exit(2); }
  const r = checkRedirect(await res.json(), process.env);
  if (r.ok) { console.log("REDIRECT OK: success_url and cancel_url are on the staging site."); process.exit(0); }
  console.error("REDIRECT CHECK FAILED:"); for (const f of r.failed) console.error(" - " + f); process.exit(2);
}
