/* fake-stripe.mjs - LOCAL FAKE Stripe API + SIMULATED hosted-checkout page (127.0.0.1, random port). NOT Stripe. Implements ONLY what the deployed functions call:
     POST /v1/checkout/sessions          -> session {id, url (local simulated page), payment_intent:null until paid, amount_total, metadata, customer_email, ...}
     GET  /v1/payment_intents/:id        -> {application_fee_amount, transfer_data.destination, amount, status, latest_charge}
     POST /v1/refunds {payment_intent}   -> refund; then emits a SIGNED charge.refunded webhook
     GET/POST /pay/:session              -> SIMULATED hosted page ("this is not Stripe's page"); only 4242 4242 4242 4242 succeeds; success emits a SIGNED checkout.session.completed webhook
   Webhooks use Stripe's v1 scheme: header "t=<unix>,v1=<HMAC-SHA256 hex of '<t>.<body>'>" with the fake endpoint secret. Everything is recorded in .log for evidence.
   NOT modelled (real Stripe only): 3-D Secure, Apple Pay, async payment methods, disputes, transfer / application-fee reversal on refund, webhook retry schedule, event ordering, Connect account state. */
import http from "node:http";
import { createHmac, randomBytes } from "node:crypto";
import { decodeForm } from "./form.mjs";
import { assertLocalUrl } from "./guards.mjs";

const rid = (p) => p + randomBytes(9).toString("hex");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export class FakeStripe {
  constructor({ secretKey, whsec }) { this.secretKey = secretKey; this.whsec = whsec; this.sessions = new Map(); this.pis = new Map(); this.charges = new Map(); this.refunds = []; this.log = []; this.webhookUrl = null; this.deliveries = []; this.events = []; this.server = null; this.base = null; }
  async start() {
    this.server = http.createServer((req, res) => this._handle(req, res).catch((e) => { res.writeHead(500, { "content-type": "application/json" }); res.end(JSON.stringify({ error: { message: String(e) } })); }));
    await new Promise((r) => this.server.listen(0, "127.0.0.1", r));
    this.base = `http://127.0.0.1:${this.server.address().port}`; return this.base;
  }
  async stop() { if (this.server) await new Promise((r) => this.server.close(r)); this.server = null; }
  setWebhookTarget(url) { this.webhookUrl = assertLocalUrl(url); }
  sign(body, t = Math.floor(Date.now() / 1000), secret = this.whsec) { return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`; }
  event(type, obj) { return { id: rid("evt_local_"), object: "event", api_version: "2024-06-20", created: Math.floor(Date.now() / 1000), livemode: false, pending_webhooks: 1, type, data: { object: obj } }; }
  async deliver(event, { secret, t, rawBody, header } = {}) {
    const body = rawBody ?? JSON.stringify(event);
    const sig = header !== undefined ? header : this.sign(body, t, secret);
    const headers = { "content-type": "application/json", "user-agent": "Stripe/1.0 (LOCAL FAKE)" }; if (sig !== null) headers["stripe-signature"] = sig;
    const r = await fetch(assertLocalUrl(this.webhookUrl), { method: "POST", headers, body });
    this.events.push(event); const text = await r.text(); const d = { type: event?.type, id: event?.id, status: r.status, text: text.slice(0, 200) }; this.deliveries.push(d); return d;
  }
  async _body(req) { const c = []; for await (const x of req) c.push(x); return Buffer.concat(c).toString("utf8"); }
  async _handle(req, res) {
    const url = new URL(req.url, "http://127.0.0.1"); const raw = await this._body(req);
    this.log.push({ method: req.method, path: url.pathname, host: req.headers.host });
    const json = (code, o) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    const html = (code, s) => { res.writeHead(code, { "content-type": "text/html; charset=utf-8" }); res.end(s); };
    if (url.pathname.startsWith("/v1/")) {
      if (req.headers.authorization !== `Bearer ${this.secretKey}`) return json(401, { error: { type: "invalid_request_error", message: "Invalid API Key provided (local fake)" } });
      if (req.method === "POST" && url.pathname === "/v1/checkout/sessions") {
        const p = decodeForm(raw); const li = p.line_items || [];
        const bad = (m) => json(400, { error: { type: "invalid_request_error", message: m } });
        if (p.mode !== "payment") return bad("mode must be payment (fake supports only payment)");
        if (!li.length) return bad("line_items required");
        for (const m of [p.metadata, p.payment_intent_data?.metadata]) for (const v of Object.values(m || {})) if (typeof v !== "string") return bad("metadata values must be strings");
        const amount = li.reduce((a, l) => a + Number(l.price_data.unit_amount) * Number(l.quantity), 0);
        const id = rid("cs_test_local_");
        const s = { id, object: "checkout.session", mode: "payment", livemode: false, status: "open", payment_status: "unpaid", payment_intent: null, customer_email: p.customer_email || null, customer_details: null, currency: li[0].price_data.currency, amount_total: amount, metadata: p.metadata || {}, success_url: p.success_url, cancel_url: p.cancel_url, url: `${this.base}/pay/${id}`, _params: p };
        this.sessions.set(id, s); return json(200, this._pub(s));
      }
      let m;
      if (req.method === "GET" && (m = url.pathname.match(/^\/v1\/payment_intents\/([\w]+)$/))) { const pi = this.pis.get(m[1]); return pi ? json(200, pi) : json(404, { error: { type: "invalid_request_error", message: "No such payment_intent" } }); }
      if (req.method === "POST" && url.pathname === "/v1/refunds") {
        const p = decodeForm(raw); const pi = this.pis.get(p.payment_intent);
        if (!pi) return json(404, { error: { type: "invalid_request_error", message: "No such payment_intent" } });
        if (pi.status === "refunded") return json(400, { error: { type: "invalid_request_error", message: "Charge already refunded" } });
        pi.status = "refunded"; const ch = this.charges.get(pi.latest_charge); ch.refunded = true; ch.amount_refunded = ch.amount;
        const rf = { id: rid("re_local_"), object: "refund", amount: ch.amount, charge: ch.id, payment_intent: pi.id, status: "succeeded" }; this.refunds.push(rf);
        const d = await this.deliver(this.event("charge.refunded", { ...ch }));
        res.setHeader("x-local-webhook-status", String(d.status)); return json(200, rf);
      }
      return json(404, { error: { type: "invalid_request_error", message: "Unrecognized request URL (local fake)" } });
    }
    let m;
    if ((m = url.pathname.match(/^\/pay\/(cs_test_local_\w+)$/))) {
      const s = this.sessions.get(m[1]); if (!s) return html(404, "unknown session");
      if (req.method === "GET") return html(200, this._page(s));
      const card = (decodeForm(raw).card || "").replace(/\s/g, "");
      if (s.status === "complete") return html(409, "<p>Already paid (simulated).</p>");
      if (card !== "4242424242424242") return html(402, "<p>SIMULATED: card declined. Only 4242 4242 4242 4242 is accepted by this local fake.</p>");
      const pi = { id: rid("pi_local_"), object: "payment_intent", amount: s.amount_total, currency: s.currency, status: "succeeded", livemode: false, application_fee_amount: s._params.payment_intent_data?.application_fee_amount != null ? Number(s._params.payment_intent_data.application_fee_amount) : null, transfer_data: s._params.payment_intent_data?.transfer_data ? { destination: s._params.payment_intent_data.transfer_data.destination } : null, latest_charge: rid("ch_local_"), metadata: s._params.payment_intent_data?.metadata || {} };
      this.pis.set(pi.id, pi); this.charges.set(pi.latest_charge, { id: pi.latest_charge, object: "charge", amount: pi.amount, currency: pi.currency, payment_intent: pi.id, paid: true, refunded: false, amount_refunded: 0, livemode: false });
      s.status = "complete"; s.payment_status = "paid"; s.payment_intent = pi.id; s.customer_details = { email: s.customer_email };
      const d = await this.deliver(this.event("checkout.session.completed", this._pub(s)));
      return html(200, `<p>SIMULATED payment succeeded. Webhook delivery status: ${d.status}. Return URL (not followed): ${esc(s.success_url)}</p>`);
    }
    return html(404, "not found");
  }
  _pub(s) { const { _params, ...rest } = s; return rest; }
  _page(s) {
    return `<!doctype html><meta charset="utf-8"><title>SIMULATED checkout</title><body style="font-family:sans-serif;max-width:30rem;margin:2rem auto">
<p style="background:#fde;border:2px solid #c00;padding:.6rem"><b>SIMULATED local test page.</b> This is NOT Stripe's hosted checkout. No real card is used or charged.</p>
<h1>Pay ${(s.amount_total / 100).toFixed(2)} ${esc(s.currency.toUpperCase())}</h1><p>Email: ${esc(s.customer_email || "")}</p>
<form method="post"><label>Test card <input name="card" value="4242 4242 4242 4242"></label> <button>Pay (simulated)</button></form></body>`;
  }
}
