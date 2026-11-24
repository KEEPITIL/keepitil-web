// v3.1 STEP 6 — Phase 1 tools. READ-ONLY, all five already allow-listed.
//
//   search_events · get_event · search_profiles · get_ticket_sales · read_campaign_analytics
//
// No write tools in this run.
//
// Note what is NOT here: credit cost. That is agent_tool_policies.credit_cost (#81).
//
// Every execute() receives a Supabase client bound to the CALLER'S JWT, so the
// agent inherits the user's RLS. Service-role is never used for user-facing work:
// if RLS would hide a row from the user, it hides it from the agent too. That is
// what makes "the agent can only see what you can see" a property of the system
// rather than a promise in a prompt.

import type { ArgResult, ToolDef, ToolExecContext } from "./types.ts";

// ---------------------------------------------------------------- validators

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function clampLimit(v: unknown, def = 20, max = 50): number {
  const n = typeof v === "number" ? v : Number.parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.trunc(n), max);
}

function isUuid(v: unknown): v is string {
  return typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/** Escapes PostgREST `or`/`ilike` metacharacters so a query string stays a value. */
function safeLike(s: string): string {
  return s.replace(/[%_,().*\\]/g, " ").trim().slice(0, 120);
}

function ok<T>(value: T): ArgResult<T> {
  return { ok: true, value };
}
function bad<T>(error: string): ArgResult<T> {
  return { ok: false, error };
}

const PUBLIC_EVENT_COLS =
  "id, slug, title, tagline, venue, city, starts_at, ends_at, tz, genres, status, cover_url, featured";

// ---------------------------------------------------------------- search_events

interface SearchEventsArgs {
  query: string | null;
  city: string | null;
  genre: string | null;
  starts_after: string | null;
  limit: number;
}

const search_events: ToolDef<SearchEventsArgs, unknown> = {
  name: "search_events",
  summary:
    "Search KEEPITIL events by free text, city, genre or start date. Returns upcoming events first.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Free text matched against title, venue and tagline" },
      city: { type: "string" },
      genre: { type: "string" },
      starts_after: { type: "string", description: "ISO 8601 timestamp" },
      limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
    },
    additionalProperties: false,
  },
  validate: (raw) => {
    const starts_after = str(raw.starts_after);
    if (starts_after && Number.isNaN(Date.parse(starts_after))) {
      return bad("starts_after must be an ISO 8601 timestamp");
    }
    return ok({
      query: str(raw.query),
      city: str(raw.city),
      genre: str(raw.genre),
      starts_after,
      limit: clampLimit(raw.limit),
    });
  },
  execute: async (a, { db }: ToolExecContext) => {
    let q = db.from("events").select(PUBLIC_EVENT_COLS);
    if (a.query) {
      const t = safeLike(a.query);
      if (t) q = q.or(`title.ilike.%${t}%,venue.ilike.%${t}%,tagline.ilike.%${t}%`);
    }
    if (a.city) q = q.ilike("city", `%${safeLike(a.city)}%`);
    if (a.genre) q = q.contains("genres", [a.genre]);
    q = q.gte("starts_at", a.starts_after ?? new Date().toISOString());

    const { data, error } = await q.order("starts_at", { ascending: true }).limit(a.limit);
    if (error) throw new Error(error.message);
    return { events: data ?? [], count: data?.length ?? 0 };
  },
  redact: (a) => ({ city: a.city, genre: a.genre, limit: a.limit, has_query: Boolean(a.query) }),
};

// ------------------------------------------------------------------- get_event

interface GetEventArgs {
  event_id: string | null;
  slug: string | null;
}

const get_event: ToolDef<GetEventArgs, unknown> = {
  name: "get_event",
  summary: "Fetch one event by id or slug, including its ticket tiers and lineup.",
  parameters: {
    type: "object",
    properties: { event_id: { type: "string" }, slug: { type: "string" } },
    additionalProperties: false,
  },
  validate: (raw) => {
    const event_id = str(raw.event_id);
    const slug = str(raw.slug);
    if (!event_id && !slug) return bad("provide event_id or slug");
    if (event_id && !isUuid(event_id)) return bad("event_id must be a uuid");
    return ok({ event_id, slug });
  },
  execute: async (a, { db }: ToolExecContext) => {
    let q = db.from("events").select(
      `${PUBLIC_EVENT_COLS}, description, owner_handle, spotify_url, youtube_url, source, source_url`,
    );
    q = a.event_id ? q.eq("id", a.event_id) : q.eq("slug", a.slug);

    const { data: event, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);
    if (!event) return { event: null, found: false };

    const [{ data: tiers }, { data: lineup }] = await Promise.all([
      db.from("ticket_tiers")
        .select("id, name, price_cents, currency, qty_total, qty_sold, sales_start, sales_end, show_qty")
        .eq("event_id", event.id).order("sort", { ascending: true }),
      db.from("event_lineup").select("*").eq("event_id", event.id),
    ]);

    return { found: true, event, ticket_tiers: tiers ?? [], lineup: lineup ?? [] };
  },
  redact: (a) => ({ event_id: a.event_id, slug: a.slug }),
};

// -------------------------------------------------------------- search_profiles

interface SearchProfilesArgs {
  query: string | null;
  account_type: string | null;
  location: string | null;
  limit: number;
}

const search_profiles: ToolDef<SearchProfilesArgs, unknown> = {
  name: "search_profiles",
  summary:
    "Search creator, artist, organizer and venue profiles by name, handle, location or account type.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string" },
      account_type: { type: "string" },
      location: { type: "string" },
      limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
    },
    additionalProperties: false,
  },
  validate: (raw) =>
    ok({
      query: str(raw.query),
      account_type: str(raw.account_type),
      location: str(raw.location),
      limit: clampLimit(raw.limit),
    }),
  execute: async (a, { db }: ToolExecContext) => {
    let q = db.from("profile_meta").select(
      "slug, display_name, handle, location, tagline, account_type, avatar_url, badges, status",
    );
    if (a.query) {
      const t = safeLike(a.query);
      if (t) {
        q = q.or(`display_name.ilike.%${t}%,handle.ilike.%${t}%,tagline.ilike.%${t}%`);
      }
    }
    if (a.account_type) q = q.eq("account_type", a.account_type);
    if (a.location) q = q.ilike("location", `%${safeLike(a.location)}%`);

    const { data, error } = await q.limit(a.limit);
    if (error) throw new Error(error.message);
    return { profiles: data ?? [], count: data?.length ?? 0 };
  },
  redact: (a) => ({ account_type: a.account_type, limit: a.limit, has_query: Boolean(a.query) }),
};

// ------------------------------------------------------------- get_ticket_sales

interface GetTicketSalesArgs {
  event_id: string;
}

/** Per-tier rollup. Named so the reduce callbacks below are not implicitly any. */
interface TierSummary {
  tier_id: unknown;
  name: unknown;
  price_cents: unknown;
  currency: unknown;
  qty_total: number | null;
  qty_sold: number;
  qty_remaining: number | null;
  gross_cents: number;
}

const get_ticket_sales: ToolDef<GetTicketSalesArgs, unknown> = {
  name: "get_ticket_sales",
  summary:
    "Ticket sales summary for one event: per-tier sold/remaining and gross revenue. RLS limits this to events the caller owns.",
  parameters: {
    type: "object",
    properties: { event_id: { type: "string" } },
    required: ["event_id"],
    additionalProperties: false,
  },
  validate: (raw) => {
    const event_id = str(raw.event_id);
    if (!event_id) return bad("event_id is required");
    if (!isUuid(event_id)) return bad("event_id must be a uuid");
    return ok({ event_id });
  },
  execute: async (a, { db }: ToolExecContext) => {
    // RLS decides visibility. A non-owner simply sees nothing — the tool does not
    // second-guess the database, and never falls back to service-role.
    const [{ data: tiers, error: tErr }, { data: orders, error: oErr }] = await Promise.all([
      db.from("ticket_tiers")
        .select("id, name, price_cents, currency, qty_total, qty_sold")
        .eq("event_id", a.event_id),
      db.from("event_orders")
        .select("id, tier_id, qty, status, amount_cents, created_at, checked_in_at")
        .eq("event_id", a.event_id),
    ]);
    if (tErr) throw new Error(tErr.message);
    if (oErr) throw new Error(oErr.message);

    if (!tiers?.length && !orders?.length) {
      return { event_id: a.event_id, visible: false, note: "no rows visible to this caller" };
    }

    const paid = (orders ?? []).filter((o: Record<string, unknown>) => o.status === "paid");
    const byTier = (tiers ?? []).map((t: Record<string, unknown>) => {
      const rows = paid.filter((o: Record<string, unknown>) => o.tier_id === t.id);
      const sold = rows.reduce((s: number, o: Record<string, unknown>) => s + Number(o.qty ?? 0), 0);
      const gross = rows.reduce(
        (s: number, o: Record<string, unknown>) => s + Number(o.amount_cents ?? 0),
        0,
      );
      const total = t.qty_total as number | null;
      return {
        tier_id: t.id,
        name: t.name,
        price_cents: t.price_cents,
        currency: t.currency,
        qty_total: total,
        qty_sold: sold,
        qty_remaining: total === null ? null : Math.max(0, total - sold),
        gross_cents: gross,
      };
    });

    return {
      event_id: a.event_id,
      visible: true,
      tiers: byTier,
      totals: {
        orders_paid: paid.length,
        tickets_sold: byTier.reduce((s: number, t: TierSummary) => s + t.qty_sold, 0),
        gross_cents: byTier.reduce((s: number, t: TierSummary) => s + t.gross_cents, 0),
        checked_in: (orders ?? []).filter((o: Record<string, unknown>) => o.checked_in_at).length,
      },
    };
  },
  redact: (a) => ({ event_id: a.event_id }),
};

// ------------------------------------------------------- read_campaign_analytics

interface ReadCampaignAnalyticsArgs {
  campaign_id: string | null;
  limit: number;
}

const read_campaign_analytics: ToolDef<ReadCampaignAnalyticsArgs, unknown> = {
  name: "read_campaign_analytics",
  summary:
    "Read marketing campaign performance: impressions, reach, engagement, clicks and conversions.",
  parameters: {
    type: "object",
    properties: {
      campaign_id: { type: "string" },
      limit: { type: "integer", minimum: 1, maximum: 50, default: 10 },
    },
    additionalProperties: false,
  },
  validate: (raw) => {
    const campaign_id = str(raw.campaign_id);
    if (campaign_id && !isUuid(campaign_id)) return bad("campaign_id must be a uuid");
    return ok({ campaign_id, limit: clampLimit(raw.limit, 10) });
  },
  execute: async (a, { db }: ToolExecContext) => {
    let cq = db.from("marketing_campaigns")
      .select("id, objective, audience, status, starts_at, ends_at, budget_cents, success_metrics, created_at");
    if (a.campaign_id) cq = cq.eq("id", a.campaign_id);

    const { data: campaigns, error: cErr } = await cq
      .order("created_at", { ascending: false }).limit(a.limit);
    if (cErr) throw new Error(cErr.message);
    if (!campaigns?.length) return { campaigns: [], count: 0 };

    const ids = campaigns.map((c: Record<string, unknown>) => c.id);
    const { data: results, error: rErr } = await db.from("marketing_results")
      .select(
        "campaign_id, impressions, reach, likes, comments, shares, saves, video_views, clicks, profile_visits, event_views, ticket_clicks, conversions, affiliate_revenue_cents, referral_revenue_cents, captured_at",
      )
      .in("campaign_id", ids);
    if (rErr) throw new Error(rErr.message);

    const merged = campaigns.map((c: Record<string, unknown>) => ({
      ...c,
      results: (results ?? []).filter((r: Record<string, unknown>) => r.campaign_id === c.id),
    }));
    return { campaigns: merged, count: merged.length };
  },
  redact: (a) => ({ campaign_id: a.campaign_id, limit: a.limit }),
};

// -------------------------------------------------------------------- registry

export const PHASE_1_TOOLS: ReadonlyArray<ToolDef<any, unknown>> = [
  search_events,
  get_event,
  search_profiles,
  get_ticket_sales,
  read_campaign_analytics,
];
