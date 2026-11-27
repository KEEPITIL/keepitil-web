// KEEPITIL — Stripe webhook
// v15: restored the event-ticket branch that the 2026-07-25 wifi-remote rewrite dropped.
// v16 (KODE 2026-08-05): + VS competition entry fees. Branch order is remove_ads → vs_entry →
// event tickets; each returns early, so adding VS cannot change ticket behaviour.
//
// Fulfilment for BOTH money paths is one atomic SQL function with index-enforced idempotency,
// so a Stripe retry can neither double-sell a ticket nor grant two competition entitlements.
import Stripe from "npm:stripe@16";
import { createClient } from "npm:@supabase/supabase-js@2";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateCode(): string {
  let out = "";
  for (let g = 0; g < 3; g++) {
    for (let i = 0; i < 4; i++) out += CHARS[Math.floor(Math.random() * CHARS.length)];
    if (g < 2) out += "-";
  }
  return out;
}

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      sig!,
      Deno.env.get("STRIPE_WEBHOOK_SECRET")!,
    );
  } catch (err) {
    return new Response(`Webhook signature verification failed: ${err}`, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      // ── (A) wifi-remote licence — UNCHANGED ─────────────────────────────────
      if (session.metadata?.product === "remove_ads") {
        const supabase = admin();

        let code = generateCode();
        // Extremely unlikely collision, but guard anyway.
        for (let attempt = 0; attempt < 5; attempt++) {
          const { data: existing } = await supabase
            .from("wifi_remote_licenses")
            .select("id")
            .eq("code", code)
            .maybeSingle();
          if (!existing) break;
          code = generateCode();
        }

        await supabase.from("wifi_remote_licenses").insert({
          code,
          email: session.customer_details?.email ?? session.customer_email ?? "unknown",
          stripe_session_id: session.id,
          stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
          amount_cents: session.amount_total,
          currency: session.currency,
          product: "remove_ads",
        });

        return new Response("ok", { status: 200 });
      }

      // ── (B) VS COMPETITION ENTRY FEE ──────────────────────────────────────
      // Grants an ENTITLEMENT only — the creator still submits and an admin still approves.
      if (session.metadata?.vs_entry_id) {
        const supabase = admin();
        const paymentIntentId =
          typeof session.payment_intent === "string" ? session.payment_intent : null;

        // the buyer is the entry's creator; resolve from the entry rather than trusting metadata
        const { data: entry } = await supabase.from("vs_entries")
          .select("id,creator_user_id,competition_id")
          .eq("id", Number(session.metadata.vs_entry_id)).maybeSingle();
        if (!entry) {
          console.error("vs entry not found for session", session.id);
          return new Response("ok", { status: 200 });
        }

        const { data, error } = await supabase.rpc("vs_fulfill_entry_payment", {
          p_session_id: session.id,
          p_payment_intent: paymentIntentId,
          p_competition: entry.competition_id,
          p_entry: entry.id,
          p_user: entry.creator_user_id,
          p_amount_cents: session.amount_total ?? 0,
        });
        if (error) {
          // 500 makes Stripe retry — safe because fulfilment is idempotent
          console.error("vs_fulfill_entry_payment failed", error.message, session.id);
          return new Response(`vs fulfilment failed: ${error.message}`, { status: 500 });
        }
        console.log("vs entry fulfilment", JSON.stringify(data));
        return new Response("ok", { status: 200 });
      }

      // ── (C) EVENT TICKETS — unchanged from v15 ───────────────────────────────
      const eventId = session.metadata?.event_id;
      if (eventId) {
        let items: Array<{ t: number; q: number; u: number }> = [];
        try {
          items = JSON.parse(session.metadata?.items ?? "[]");
        } catch (_e) {
          items = [];
        }
        if (!Array.isArray(items) || !items.length) {
          console.error("ticket fulfilment: no items in metadata", session.id);
          return new Response("ok", { status: 200 });
        }

        let appFee: number | null = null;
        let destination: string | null = null;
        let paymentIntentId: string | null =
          typeof session.payment_intent === "string" ? session.payment_intent : null;
        try {
          if (paymentIntentId) {
            const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
            appFee = (pi.application_fee_amount as number | null) ?? null;
            const td = pi.transfer_data as { destination?: string } | null;
            destination = td?.destination ?? null;
          }
        } catch (e) {
          console.error("could not read payment intent", String(e));
        }

        const supabase = admin();
        const { data, error } = await supabase.rpc("fulfill_ticket_order", {
          p_session_id: session.id,
          p_payment_intent: paymentIntentId,
          p_event_id: Number(eventId),
          p_items: items,
          p_buyer_email: session.customer_details?.email ?? session.customer_email ?? null,
          p_app_fee_cents: appFee,
          p_organizer_acct: destination,
        });

        if (error) {
          console.error("fulfill_ticket_order failed", error.message, session.id);
          return new Response(`fulfilment failed: ${error.message}`, { status: 500 });
        }
        console.log("ticket fulfilment", JSON.stringify(data));
      }
    }

    // ── (D) REFUNDS — tickets release inventory; VS entries lose their entitlement ────
    if (event.type === "charge.refunded" || event.type === "charge.refund.updated") {
      const charge = event.data.object as Stripe.Charge;
      const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : null;
      if (pi) {
        const supabase = admin();
        // both are no-ops when the payment intent is not theirs, so order does not matter
        const { data: t, error: te } = await supabase.rpc("refund_ticket_order", {
          p_session_id: null, p_payment_intent: pi,
        });
        if (te) console.error("refund_ticket_order failed", te.message, pi);
        else console.log("ticket refund", JSON.stringify(t));

        const { data: v, error: ve } = await supabase.rpc("vs_refund_entry_payment", {
          p_session_id: null, p_payment_intent: pi,
        });
        if (ve) console.error("vs_refund_entry_payment failed", ve.message, pi);
        else console.log("vs refund", JSON.stringify(v));
      }
    }
  } catch (e) {
    console.error("webhook handler error", String(e));
    return new Response(`handler error: ${String(e)}`, { status: 500 });
  }

  return new Response("ok", { status: 200 });
});
