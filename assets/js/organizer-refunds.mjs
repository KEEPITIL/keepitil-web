// ORGANIZER PARTIAL REFUNDS (DRAFT, behind a flag that is OFF by default): the front end for the refund-tickets Edge
// Function (keepitil.github.io #66). An organizer refunds k of a ticket row's tickets; the refund is the TICKET PRICE
// ONLY -- the buyer service fee is NOT refundable (Joe, 2026-11-17, answer 2). The function, not this page, moves the
// money; this page never writes event_orders and never holds a service key (it calls the function with the
// organizer's own session).
//
// Pure logic (amounts, bounds, copy, result states) is exported for node:test; renderRefundPanel builds the DOM with
// createElement + textContent only (no HTML-string sinks). Copy is a PLACEHOLDER until Muse's lands.

/** The flag: on only when the page sets window.KIL_FLAGS.organizerRefunds === true. Absent or anything else = off. */
export function refundsEnabled(win) {
  const f = win && win.KIL_FLAGS;
  return !!(f && f.organizerRefunds === true);
}

/** PLACEHOLDER copy (Muse). Money is always formatted by money(). */
export const COPY = {
  PLACEHOLDER: true,
  button: 'Refund tickets',
  title: 'Refund tickets',
  howMany: 'How many tickets?',
  reason: 'Reason (optional)',
  review: 'Review refund',
  confirm: 'Refund now',
  cancel: 'Cancel',
  checkedIn: 'Checked in at the door. Checked-in tickets can’t be refunded.',
  nothingLeft: 'All tickets in this order are already refunded.',
  notPaid: 'Only paid tickets can be refunded.',
  states: {
    pending: 'Refund requested. It will show as refunded when the card issuer confirms it.',
    succeeded: 'Refunded.',
    reversal_pending: 'Refunded to the buyer. The payout adjustment is still being processed.',
    failed: 'The refund didn’t go through. Nothing was charged back. Please try again.',
    conflict: 'This order changed (another refund or a check-in). Reload and try again.',
    signed_out: 'Please sign in again to refund tickets.',
  },
};

export function money(cents) {
  const c = Math.round(Number(cents) || 0);
  return (c < 0 ? '-$' : '$') + (Math.abs(c) / 100).toFixed(2);
}

/** Tickets on this row that may still be refunded, and why not when none. */
export function refundable(row) {
  const qty = Number.isInteger(row && row.qty) ? row.qty : 0;
  const done = Number.isInteger(row && row.refunded_qty) ? row.refunded_qty : 0;
  if (!row || (row.status !== 'paid' && row.status !== 'partially_refunded')) return { max: 0, reason: 'notPaid' };
  // one QR covers the whole row, so a scanned row is checked in as a whole
  if (row.checked_in_at) return { max: 0, reason: 'checkedIn' };
  const max = Math.max(0, qty - done);
  return max > 0 ? { max, reason: null } : { max: 0, reason: 'nothingLeft' };
}

/** Is k a valid number of tickets to refund on this row? Integers 1..max only. */
export function validK(row, k) {
  const { max } = refundable(row);
  return Number.isInteger(k) && k >= 1 && k <= max;
}

/** The ticket price of ONE ticket on this row, in cents (amount_cents is unit x qty, face value only; no fee). */
export function unitCents(row) {
  const qty = row && row.qty, amt = row && row.amount_cents;
  if (!Number.isInteger(qty) || qty < 1 || !Number.isInteger(amt) || amt < 0) return null;
  return Math.round(amt / qty);
}

/**
 * The order's buyer service fee, in cents, counted ONCE per order (stripe_session_id): the fee is stored on the
 * order's first row since the fee-once change (#62), but older orders repeat it on every row, so never sum it.
 */
export function orderFeeCents(rows, row) {
  const same = (rows || []).filter((r) => r && row && r.stripe_session_id && r.stripe_session_id === row.stripe_session_id);
  const fees = same.map((r) => r.application_fee_cents).filter((v) => Number.isInteger(v) && v > 0);
  if (fees.length) return Math.max(...fees);
  return Number.isInteger(row && row.application_fee_cents) && row.application_fee_cents > 0 ? row.application_fee_cents : 0;
}

/** What a refund of k tickets on this row returns: the ticket price only. The fee is never part of it. */
export function refundAmounts(row, k, feeCents) {
  if (!validK(row, k)) return null;
  const unit = unitCents(row);
  if (unit == null) return null;
  return { k, unitCents: unit, refundCents: unit * k, feeCents: Math.max(0, feeCents | 0), feeRefundedCents: 0 };
}

/** The confirm dialog's sentences, with the exact amounts. */
export function confirmLines(a) {
  const t = a.k === 1 ? '1 ticket' : a.k + ' tickets';
  return [
    'Refund ' + t + ': ' + money(a.refundCents) + ' to the buyer.',
    'Refunds the ticket price only. The ' + money(a.feeCents) + ' service fee is not refundable.',
  ];
}

/** The request body the refund-tickets function takes. */
export function refundBody(row, k, reason) {
  const r = String(reason == null ? '' : reason).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
  return r ? { order_row_id: row.id, qty: k, reason: r } : { order_row_id: row.id, qty: k };
}

/**
 * Call the function with the organizer's own session (the Supabase client carries it). Maps every outcome to one of
 * COPY.states: pending | succeeded | reversal_pending | failed | conflict | signed_out. Never throws.
 */
export async function requestRefund(sb, row, k, reason) {
  if (!validK(row, k)) return { state: 'conflict', detail: 'bounds' };
  let res;
  try {
    res = await sb.functions.invoke('refund-tickets', { body: refundBody(row, k, reason) });
  } catch (e) {
    return { state: 'failed', detail: String(e && e.message || e) };
  }
  const err = res && res.error;
  if (err) {
    const status = (err.context && err.context.status) || err.status || 0;
    if (status === 401 || status === 403) return { state: 'signed_out', detail: status };
    if (status === 409) return { state: 'conflict', detail: status };
    return { state: 'failed', detail: status || String(err.message || err) };
  }
  const s = res && res.data && res.data.status;
  if (s === 'succeeded' || s === 'pending' || s === 'reversal_pending' || s === 'failed') return { state: s, detail: res.data };
  return { state: 'pending', detail: res && res.data };
}

/**
 * One order row's refund control, built with the DOM API only. opts: { doc, sb, rows, onDone }.
 * Returns the element, or null when the flag is off (no UI at all).
 */
export function renderRefundControl(win, row, opts) {
  if (!refundsEnabled(win)) return null;
  const doc = opts.doc || win.document;
  const el = (tag, text, cls) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const wrap = el('div', null, 'kr-refund');
  wrap.setAttribute('data-order-row', String(row.id));
  const can = refundable(row);
  const btn = el('button', COPY.button, 'kr-btn');
  btn.type = 'button';
  if (!can.max) {
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
    const why = el('p', COPY[can.reason], 'kr-why');
    why.setAttribute('data-why', can.reason);
    wrap.appendChild(btn); wrap.appendChild(why);
    return wrap;
  }
  const status = el('p', '', 'kr-status');
  status.setAttribute('role', 'status');
  btn.addEventListener('click', () => {
    btn.disabled = true;
    const form = el('div', null, 'kr-form');
    const sel = el('select', null, 'kr-k');
    sel.setAttribute('aria-label', COPY.howMany);
    for (let i = 1; i <= can.max; i++) { const o = el('option', String(i)); o.value = String(i); sel.appendChild(o); }
    const reason = el('input', null, 'kr-reason');
    reason.setAttribute('aria-label', COPY.reason); reason.setAttribute('maxlength', '300'); reason.placeholder = COPY.reason;
    const review = el('button', COPY.review, 'kr-review'); review.type = 'button';
    form.appendChild(el('label', COPY.howMany)); form.appendChild(sel); form.appendChild(reason); form.appendChild(review);
    wrap.appendChild(form);
    review.addEventListener('click', () => {
      const k = Number(sel.value), a = refundAmounts(row, k, orderFeeCents(opts.rows, row));
      if (!a) { status.textContent = COPY.states.conflict; return; }
      const dlg = el('div', null, 'kr-confirm');
      dlg.setAttribute('role', 'alertdialog'); dlg.setAttribute('aria-modal', 'true');
      for (const line of confirmLines(a)) dlg.appendChild(el('p', line));
      const go = el('button', COPY.confirm, 'kr-go'); go.type = 'button';
      const no = el('button', COPY.cancel, 'kr-no'); no.type = 'button';
      dlg.appendChild(go); dlg.appendChild(no);
      wrap.appendChild(dlg);
      no.addEventListener('click', () => { dlg.remove(); btn.disabled = false; form.remove(); });
      go.addEventListener('click', async () => {
        go.disabled = true; no.disabled = true;
        const out = await requestRefund(opts.sb, row, k, reason.value);
        status.textContent = COPY.states[out.state];
        status.setAttribute('data-state', out.state);
        dlg.remove(); form.remove();
        btn.disabled = out.state === 'pending' || out.state === 'succeeded' || out.state === 'reversal_pending';
        if (opts.onDone) opts.onDone(out);
      });
    });
  });
  wrap.appendChild(btn); wrap.appendChild(status);
  return wrap;
}
