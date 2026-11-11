/* shims/stripe.mjs - LOCAL STAND-IN for the `stripe` npm package (v14 for create-checkout, v16 for stripe-webhook in prod).
   It is NOT the real Stripe library. It implements only what the two deployed functions call:
     new Stripe(key, opts), .checkout.sessions.create(params), .paymentIntents.retrieve(id), .webhooks.constructEventAsync(payload, header, secret, tolerance)
   Network: every call goes to the LOCAL FAKE Stripe at process.env.KIL_FAKE_STRIPE_BASE (127.0.0.1 only; anything else throws). The key must be the local fake (sk_test_local_FAKE...).
   constructEventAsync re-implements Stripe's documented v1 signature scheme (header "t=<unix>,v1=<hex>[,v1=...]"; HMAC-SHA256 of "<t>.<raw body>" with the endpoint secret; 300 s tolerance; constant-time compare).
   UNVERIFIED against the real library: error message wording and any behaviour beyond that scheme. */
import { createHmac, timingSafeEqual } from "node:crypto";
import { assertLocalUrl } from "../lib/guards.mjs";
import { encodeForm } from "../lib/form.mjs";

class StripeSignatureVerificationError extends Error { constructor(m) { super(m); this.name = "StripeSignatureVerificationError"; this.type = "StripeSignatureVerificationError"; } }

export default class Stripe {
  constructor(key, cfg = {}) {
    if (!/^sk_test_local_FAKE/.test(String(key))) throw new Error("testbed Stripe shim: key must be the local fake (sk_test_local_FAKE...)");
    this._key = key; this._cfg = cfg;
    this._base = assertLocalUrl(process.env.KIL_FAKE_STRIPE_BASE || "");
    const self = this;
    this.checkout = { sessions: { create: (p) => self._req("POST", "/v1/checkout/sessions", p) } };
    this.paymentIntents = { retrieve: (id) => self._req("GET", "/v1/payment_intents/" + encodeURIComponent(id)) };
    this.webhooks = {
      constructEventAsync: async (payload, header, secret, tolerance = 300) => self._construct(payload, header, secret, tolerance),
      constructEvent: (payload, header, secret, tolerance = 300) => self._construct(payload, header, secret, tolerance),
    };
  }
  async _req(method, path, params) {
    const init = { method, headers: { Authorization: `Bearer ${this._key}`, "Stripe-Version": this._cfg.apiVersion || "" } };
    if (method === "POST") { init.headers["Content-Type"] = "application/x-www-form-urlencoded"; init.body = encodeForm(params); }
    const r = await fetch(this._base + path, init);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j?.error?.message || `Stripe fake error ${r.status}`); e.type = j?.error?.type; e.statusCode = r.status; throw e; }
    return j;
  }
  _construct(payload, header, secret, tolerance) {
    if (!secret) throw new Error("No webhook secret configured");
    if (header == null || header === "") throw new StripeSignatureVerificationError("No stripe-signature header value was provided.");
    const parts = String(header).split(",").map((s) => s.split("="));
    const t = parts.find(([k]) => k.trim() === "t")?.[1];
    const sigs = parts.filter(([k]) => k.trim() === "v1").map(([, v]) => v);
    if (!t || !/^\d+$/.test(t) || !sigs.length) throw new StripeSignatureVerificationError("Unable to extract timestamp and signatures from header");
    const want = createHmac("sha256", secret).update(`${t}.${payload}`).digest();
    const ok = sigs.some((s) => { const b = Buffer.from(s, "hex"); return b.length === want.length && timingSafeEqual(b, want); });
    if (!ok) throw new StripeSignatureVerificationError("No signatures found matching the expected signature for payload. Are you passing the raw request body you received from Stripe?");
    if (tolerance && Math.abs(Date.now() / 1000 - Number(t)) > tolerance) throw new StripeSignatureVerificationError("Timestamp outside the tolerance zone");
    return JSON.parse(payload);
  }
}
