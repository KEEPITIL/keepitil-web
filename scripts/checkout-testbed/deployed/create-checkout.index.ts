// KEEPITIL — Supabase Edge Function: create-checkout
//
// v41 (KODE 2026-08-28): TICKET RETURN ROUTE FIXED — it pointed into the purged /v3/.
//   SITE was `https://keepitil.com/${b.return_base === "v31" ? "v31" : "v3"}`, so a buyer who
//   PAID landed on https://keepitil.com/v3/event.html?e=…&paid=1 — verified 404 on production,
//   while the canonical /event.html?e=… returns 200 and is what every link on the site uses.
//   The VS branch was corrected in v37; the ticket branch kept the dead base. Nothing else in
//   this function changed: amounts, fees, transfers, inventory and auth are untouched.
//   b.return_base is now ignored rather than removed from the caller's payload — an older page
//   still sending it must not start failing.
//
// v38 (Atlas 2026-08-19, Founder): TICKETS NOW REQUIRE AN ACCOUNT.
//   "users must create an account before purchasing a ticket"
// Two things were wrong before, and they were the same bug wearing two hats:
//   1. The ticket branch never resolved a caller, so guest checkout was possible.
//   2. fulfill_ticket_order derives event_orders.buyer_handle by matching the Stripe email to
//      auth.users → app_users. A guest, or a signed-in buyer who typed a different email at
//      checkout, produced buyer_handle = NULL — so the ticket existed but could never appear on
//      anyone's profile. The new EVENTS tab keys on buyer_handle, so it would have shown an
//      empty list to someone holding a real ticket.
// Fix: require an authenticated caller, and pass THAT account's email to Stripe as
// customer_email so the handle resolves deterministically rather than from what was typed.
//
// The VS entry-fee branch already required auth; it is unchanged.
// The fee / transfer / inventory logic is unchanged.
import Stripe from "https://esm.sh/stripe@14?target=deno&no-check";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const J = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function cfg(key: string, dflt: number) {
  const { data } = await admin.from("platform_config").select("value").eq("key", key).maybeSingle();
  return data ? parseInt(data.value, 10) : dflt;
}

// resolve the calling user from their JWT (verify_jwt is on, so one is always present)
async function caller(req: Request): Promise<{ id: string; email: string | null } | null> {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  try {
    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data } = await anon.auth.getUser();
    if (!data?.user?.id) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  } catch (_e) {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const b = await req.json();
    // Canonical root. There is no /v3 or /v31 any more — both were deleted, and pointing a
    // POST-PAYMENT redirect at a deleted namespace is a 404 at the worst possible moment.
    const SITE = "https://keepitil.com";

    // ═══ VS ENTRY FEE — runs first, returns early; ticket logic below is untouched ═══
    if (b.kind === "vs_entry") {
      const entryId = Number(b.vs_entry_id);
      if (!entryId) return J({ error: "vs_entry_id required" }, 400);

      const me = await caller(req);
      if (!me) return J({ error: "sign in to pay an entry fee" }, 401);
      const uid = me.id;

      const { data: entry } = await admin.from("vs_entries")
        .select("id,competition_id,creator_user_id,payment_status,entitlement,status")
        .eq("id", entryId).maybeSingle();
      if (!entry) return J({ error: "entry not found" }, 404);
      if (entry.creator_user_id !== uid) return J({ error: "not your entry" }, 403);
      if (entry.entitlement || entry.payment_status === "paid") {
        return J({ error: "this entry is already paid", already_paid: true }, 400);
      }

      const { data: comp } = await admin.from("vs_competitions")
        .select("id,title,slug,status,entry_fee_cents,submissions_close_at")
        .eq("id", entry.competition_id).maybeSingle();
      if (!comp) return J({ error: "competition not found" }, 404);
      if (comp.status !== "published" && comp.status !== "voting") {
        return J({ error: "this competition is not open for entries" }, 400);
      }
      if (comp.submissions_close_at && Date.now() > Date.parse(comp.submissions_close_at)) {
        return J({ error: "submissions are closed for this competition" }, 400);
      }

      // AMOUNT IS READ SERVER-SIDE. Anything the client sent about price is ignored.
      // FREE ENTRY NEVER TOUCHES STRIPE (Founder: CREATE is free to enter). A zero fee is
      // comped here and returns before any Stripe call is made.
      const fee = Number(comp.entry_fee_cents) || 0;
      if (fee <= 0) {
        await admin.from("vs_entries")
          .update({ payment_status: "comped", entitlement: true })
          .eq("id", entryId).eq("creator_user_id", uid);
        return J({ free: true, entitlement_granted: true, url: null,
                   note: "free competition — no payment required, you can submit for review" });
      }
      if (fee < 100) return J({ error: "Paid entries must be at least $1.00." }, 400);

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        ...(me.email ? { customer_email: me.email } : {}),
        line_items: [{
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: fee,                       // from the DB, never the client
            product_data: { name: `${comp.title} — entry fee` },
          },
        }],
        payment_intent_data: {
          metadata: { vs_entry_id: String(entryId), vs_competition_id: String(comp.id), kind: "vs_entry" },
        },
        metadata: { vs_entry_id: String(entryId), vs_competition_id: String(comp.id), kind: "vs_entry" },
        success_url: `${SITE}/create/?view=mine&paid=1`,
        cancel_url: `${SITE}/create/?view=mine`,
      });
      return J({ url: session.url });
    }

    // ═══ EVENT TICKETS ══════════════════════════════════════════════════
    // ACCOUNT REQUIRED (Founder 2026-08-19). Also the only way buyer_handle can resolve.
    const buyer = await caller(req);
    if (!buyer) {
      return J({ error: "Create a free KEEPITIL account to buy tickets.", needs_account: true }, 401);
    }

    let items: Array<{ tier_id: number | string; quantity: number }> = Array.isArray(b.items) ? b.items : [];
    if (!items.length && b.tier_id) items = [{ tier_id: b.tier_id, quantity: b.quantity }];
    items = items.map((i) => ({ tier_id: i.tier_id, quantity: Math.max(1, Math.min(20, Number(i.quantity) || 1)) }))
                 .filter((i) => i.tier_id != null);
    if (!items.length) return J({ error: "no tickets selected" }, 400);

    const salesOn = await cfg("ticketing_enabled", 1);
    if (!salesOn) return J({ error: "Ticket sales are temporarily paused." }, 503);

    const ids = items.map((i) => i.tier_id);
    const { data: tiers } = await admin.from("ticket_tiers").select("id,name,price_cents,currency,event_id,qty_total,qty_sold,sales_start,sales_end").in("id", ids);
    if (!tiers || !tiers.length) return J({ error: "tier not found" }, 404);
    const byId: Record<string, any> = {}; tiers.forEach((t) => (byId[String(t.id)] = t));

    const evId = tiers[0].event_id;
    if (tiers.some((t) => t.event_id !== evId)) return J({ error: "tiers must belong to the same event" }, 400);
    const { data: ev } = await admin.from("events").select("id,title,slug,owner_handle,status,starts_at").eq("id", evId).maybeSingle();
    if (!ev || ev.status !== "published") return J({ error: "event not on sale" }, 400);

    const now = Date.now();
    if (ev.starts_at && now > Date.parse(ev.starts_at)) return J({ error: "This event has already started." }, 400);

    const rateBps = await cfg("application_fee_bps", 250);
    const flatLow = await cfg("per_ticket_fee_under10_cents", 49);
    const flatHigh = await cfg("per_ticket_fee_over10_cents", 99);

    const line_items: any[] = [];
    const metaItems: Array<{ t: number; q: number; u: number }> = [];
    let applicationFee = 0;

    for (const it of items) {
      const t = byId[String(it.tier_id)];
      if (!t) return J({ error: "tier not found" }, 404);
      const qty = it.quantity;
      if (t.sales_start && now < Date.parse(t.sales_start)) return J({ error: `“${t.name}” is not on sale yet.` }, 400);
      if (t.sales_end && now > Date.parse(t.sales_end)) return J({ error: `Sales for “${t.name}” have ended.` }, 400);
      if (t.qty_total != null) {
        const remaining = t.qty_total - (t.qty_sold || 0);
        if (remaining <= 0) return J({ error: `“${t.name}” is sold out.` }, 400);
        if (qty > remaining) return J({ error: `Only ${remaining} left for “${t.name}”.` }, 400);
      }
      const unit = t.price_cents;
      if (unit <= 0) continue; // free tiers are RSVP'd client-side, never charged
      if (unit < 100) return J({ error: "Paid tickets must be at least $1.00." }, 400);
      line_items.push({ quantity: qty, price_data: { currency: t.currency || "usd", unit_amount: unit, product_data: { name: `${ev.title} — ${t.name}` } } });
      applicationFee += (Math.round(unit * rateBps / 10000) + (unit < 1000 ? flatLow : flatHigh)) * qty;
      metaItems.push({ t: Number(t.id), q: qty, u: unit });
    }
    if (!line_items.length) return J({ error: "no paid tickets selected" }, 400);

    const { data: org } = await admin.from("app_users").select("stripe_account_id,payouts_enabled").eq("handle", ev.owner_handle).maybeSingle();
    if (!org?.stripe_account_id || !org.payouts_enabled) return J({ error: "organizer has not finished payout setup" }, 400);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Pinned to the ACCOUNT's email so fulfill_ticket_order can resolve buyer_handle. Without
      // this the ticket cannot be attributed to a profile and the EVENTS tab stays empty.
      ...(buyer.email ? { customer_email: buyer.email } : {}),
      line_items,
      payment_intent_data: {
        application_fee_amount: applicationFee,
        transfer_data: { destination: org.stripe_account_id },
        metadata: { event_id: String(ev.id), items: JSON.stringify(metaItems), buyer_user_id: buyer.id },
      },
      metadata: { event_id: String(ev.id), items: JSON.stringify(metaItems), buyer_user_id: buyer.id },
      success_url: `${SITE}/event.html?e=${ev.slug}&paid=1`,
      cancel_url: `${SITE}/event.html?e=${ev.slug}`,
    });
    return J({ url: session.url });
  } catch (e) {
    return J({ error: String(e) }, 500);
  }
});
