/* door-scan-adapter.mjs - PROPOSAL ONLY. Pure, dependency-free response adapter for the hardened door RPCs (public.event_checkin_scan / public.check_in_ticket).
   NOT wired into any page. Lives under db/proposed (pages-excluded). A future scanner UI would import it (or inline it).
   Guarantees (all unit-tested in door-scan-adapter.test.mjs):
     - TOKEN-FREE: the scanned payload is never copied into the adapted result, a UI string or an error object.
     - NO-CONTACT: only an explicit whitelist of keys survives; if a server ever regresses and returns buyer/email/handle/phone/anything else, it is dropped here too.
     - one canonical result shape for both RPCs, one place that owns the UI wording. */

export const CODES = ["admitted", "already_used", "unpaid", "forbidden", "invalid", "empty", "unauth", "error"];

/* what the UI shows per result code (server `message` text is deliberately NOT used: the adapter owns the wording) */
export const UI = {
  admitted:     { tone: "success", title: "Admitted",              detail: "Let them in." },
  already_used: { tone: "warning", title: "Already admitted",      detail: "This ticket was already scanned." },
  unpaid:       { tone: "error",   title: "Not paid",              detail: "This order is not paid, so it cannot be admitted." },
  forbidden:    { tone: "error",   title: "Not your event",        detail: "You are not on the door for this event." },
  invalid:      { tone: "error",   title: "Not a KEEPITIL ticket", detail: "This code is not a valid ticket." },
  empty:        { tone: "neutral", title: "No code scanned",       detail: "Scan a ticket QR code." },
  unauth:       { tone: "error",   title: "Sign in to scan",       detail: "Sign in with your organizer account to scan tickets." },
  error:        { tone: "error",   title: "Could not check this ticket", detail: "Check your connection and try again." },
};

/* the ONLY keys read from a server response */
const SCAN_KEYS = ["ok", "result", "event_title", "tier", "qty", "checked_in_at"];
const TICKET_KEYS = ["status", "event", "tier", "qty", "checked_in", "sold", "at"];
const TICKET_STATUS = { valid: "admitted", already: "already_used", notpaid: "unpaid", notyours: "forbidden", notfound: "invalid", unauth: "unauth" };

/* client-side convenience normalisation (the database does the authoritative version): trim, strip ONE leading 'KIL-' (any case), trim */
export function normalizePayload(raw) {
  if (raw === null || raw === undefined) return "";
  return String(raw).replace(/^\s+|\s+$/g, "").replace(/^KIL-/i, "").replace(/^\s+|\s+$/g, "");
}

/* PostgREST / supabase-js request for the scan RPC. Returns null when there is nothing to send. */
export function buildScanRequest(raw) {
  const p = normalizePayload(raw);
  if (p === "" || p.length > 128) return null;
  return { rpc: "event_checkin_scan", args: { p_qr_token: p } };
}

/* classify by code/status or an anchored message prefix only (a message could echo the scanned payload, so it is never searched freely) */
const isAuthError = (e) => !!e && (["42501", "PGRST301", "PGRST302"].includes(String(e.code)) || [401, 403].includes(Number(e.status)) || /^(JWT|permission denied)/i.test(String(e.message || "")));
const pickInt = (v) => (Number.isInteger(v) && v >= 0 && v < 1e6 ? v : null);
const pickStr = (v, max = 200) => (typeof v === "string" ? v.slice(0, max) : null);
const pickTime = (v) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null);

function shape(code, f = {}) {
  const code2 = CODES.includes(code) ? code : "error";
  return { ok: code2 === "admitted", code: code2, ui: UI[code2], admission: code2 === "admitted" || code2 === "already_used"
    ? { eventTitle: pickStr(f.eventTitle), tier: pickStr(f.tier, 80), qty: pickInt(f.qty), checkedInAt: pickTime(f.checkedInAt) } : null,
    eventTitle: code2 === "unpaid" ? pickStr(f.eventTitle) : undefined };
}

/* event_checkin_scan -> canonical result. `resp` is the supabase-js {data, error} OR the bare jsonb. Never throws. */
export function adaptScanResponse(resp) {
  if (resp && typeof resp === "object" && "error" in resp && resp.error) return shape(isAuthError(resp.error) ? "unauth" : "error");
  const j = resp && typeof resp === "object" && "data" in resp ? resp.data : resp;
  if (!j || typeof j !== "object" || Array.isArray(j)) return shape("error");
  const w = {}; for (const k of SCAN_KEYS) if (k in j) w[k] = j[k];
  return shape(w.result, { eventTitle: w.event_title, tier: w.tier, qty: w.qty, checkedInAt: w.checked_in_at });
}

/* legacy check_in_ticket -> the SAME canonical result (so a UI written against the canonical shape works with either RPC) */
export function adaptTicketResponse(resp) {
  if (resp && typeof resp === "object" && "error" in resp && resp.error) return shape(isAuthError(resp.error) ? "unauth" : "error");
  const j = resp && typeof resp === "object" && "data" in resp ? resp.data : resp;
  if (!j || typeof j !== "object" || Array.isArray(j)) return shape("error");
  const w = {}; for (const k of TICKET_KEYS) if (k in j) w[k] = j[k];
  return shape(TICKET_STATUS[w.status], { eventTitle: w.event, tier: w.tier, qty: w.qty, checkedInAt: w.at });
}
