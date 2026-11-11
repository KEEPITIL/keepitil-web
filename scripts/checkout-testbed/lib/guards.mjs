/* guards.mjs - NO-LIVE-MODE and LOCAL-ONLY guards for the checkout testbed (DRAFT; no live Stripe, no prod).
   - refuseLiveKeys(env): throws if ANY env value looks like a live key (sk_live_/pk_live_/rk_live_), a webhook secret that is not the local fake
     (whsec_ not starting whsec_localtest), or a Stripe TEST key that is not the local fake (sk_test_/pk_test_ not starting sk_test_local_FAKE / pk_test_local_FAKE):
     real test keys belong to a STAGING project, never to this local bed.
   - refuseNonLocalHosts(env): throws if any URL/host-like env value (names containing URL, HOST, BASE, ENDPOINT) is not 127.0.0.1.
   - assertLocalUrl(u): the only way the shims reach a network; host must be exactly 127.0.0.1.
   - installEgressGuard(): wraps fetch / http.request / https.request so nothing but 127.0.0.1 can ever be dialled (so no byte reaches stripe.com). */
import http from "node:http";
import https from "node:https";

export class GuardError extends Error { constructor(m) { super(m); this.name = "GuardError"; } }

const LIVE = /^(sk|pk|rk)_live_/;
const SECRETISH = /^(sk|pk|rk)_(test|live)_|^whsec_/;
export function refuseLiveKeys(env) {
  for (const [k, v] of Object.entries(env)) {
    if (typeof v !== "string" || !SECRETISH.test(v)) continue;
    if (LIVE.test(v)) throw new GuardError(`NO-LIVE-MODE: ${k} holds a live key (sk_live_/pk_live_/rk_live_). The testbed refuses to start.`);
    if (/^whsec_/.test(v) && !v.startsWith("whsec_localtest")) throw new GuardError(`NO-LIVE-MODE: ${k} holds a webhook secret that is not the local fake (whsec_localtest...). The testbed refuses to start.`);
    if (/^(sk|pk)_test_/.test(v) && !/^(sk|pk)_test_local_FAKE/.test(v)) throw new GuardError(`NO-LIVE-MODE: ${k} holds a real-looking Stripe TEST key. Real test keys belong in a STAGING project, not the local bed. The testbed refuses to start.`);
  }
}
const HOSTISH = /(URL|HOST|BASE|ENDPOINT)/i;
export function hostOf(v) { try { return new URL(/^[a-z]+:\/\//i.test(v) ? v : "http://" + v).hostname; } catch { return null; } }
export function refuseNonLocalHosts(env) {
  for (const [k, v] of Object.entries(env)) {
    if (typeof v !== "string" || !v || !HOSTISH.test(k)) continue;
    if (!/^[a-z]+:\/\/|^[\w.-]+:\d+/i.test(v)) continue;          // only values that LOOK like a URL / host:port
    if (!/^(KIL_|SUPABASE_|STRIPE_|FAKE_)/.test(k)) continue;      // only the testbed's own variables (the Mac's unrelated env is not our business)
    if (hostOf(v) !== "127.0.0.1") throw new GuardError(`LOCAL-ONLY: ${k}=${v} is not on 127.0.0.1. The testbed refuses to start.`);
  }
}
export function assertLocalUrl(u) {
  const h = hostOf(String(u));
  if (h !== "127.0.0.1") throw new GuardError(`LOCAL-ONLY: refusing to contact host "${h}" (${String(u).slice(0, 60)}). Only 127.0.0.1 is allowed.`);
  return u;
}
/* LOCAL-ONLY PostgreSQL (Sentinel S1): the harness creates and DROPS databases and roles, so it must never reach a remote server. Allowed: a Unix socket directory (starts with "/"), 127.0.0.1, ::1, localhost.
   Anything else (a Supabase / cloud host, a LAN address, undefined) throws before any connection is attempted. */
export function assertLocalPgHost(h) { if (!(typeof h === "string" && (h.startsWith("/") || ["127.0.0.1", "::1", "localhost"].includes(h)))) throw new GuardError(`LOCAL-ONLY: refusing PostgreSQL host "${String(h).slice(0, 80)}": the harness only talks to a local socket / loopback (it creates and drops databases and roles)`); return h; }
export function guardEnv(env = process.env) { refuseLiveKeys(env); refuseNonLocalHosts(env); }

let installed = false;
export function installEgressGuard() {
  if (installed) return; installed = true;
  const f = globalThis.fetch;
  globalThis.fetch = (input, init) => { const u = typeof input === "string" ? input : input?.url ?? String(input); assertLocalUrl(u); return f(input, init); };
  for (const m of [http, https]) {
    const orig = m.request;
    m.request = function (...a) {
      const o = a[0]; const host = typeof o === "string" || o instanceof URL ? hostOf(String(o)) : (o?.hostname || o?.host || "127.0.0.1").split(":")[0];
      if (host !== "127.0.0.1") throw new GuardError(`LOCAL-ONLY: egress to "${host}" blocked`);
      return orig.apply(this, a);
    };
  }
}
