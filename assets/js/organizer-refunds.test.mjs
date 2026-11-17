// Organizer partial refunds (DRAFT, flag OFF by default): the front end of the refund-tickets Edge Function.
// The refund is the TICKET PRICE ONLY; the buyer service fee is NOT refundable (Joe, 2026-11-17).
// Run: node --test assets/js/organizer-refunds.test.mjs   (pure node + fakes: no browser, no network, no keys)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  refundsEnabled, COPY, money, refundable, validK, unitCents, orderFeeCents, refundAmounts, confirmLines,
  refundBody, requestRefund, renderRefundControl,
} from './organizer-refunds.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ON = { KIL_FLAGS: { organizerRefunds: true } };

// One order (session cs_1): 3 x $20 General + 1 x $45.50 VIP; buyer fee $4.78 stored once (on the first row, #62).
const row = (o = {}) => ({ id: 11, qty: 3, refunded_qty: 0, amount_cents: 6000, application_fee_cents: 478, status: 'paid',
  checked_in_at: null, stripe_session_id: 'cs_1', ...o });
const ROWS = [row(), { id: 12, qty: 1, amount_cents: 4550, application_fee_cents: null, status: 'paid', checked_in_at: null, stripe_session_id: 'cs_1' }];

// ---- a tiny fake DOM (createElement + textContent + events), enough for the control
function fakeDoc() {
  const mk = (tag) => {
    const n = { tagName: tag.toUpperCase(), children: [], attrs: {}, listeners: {}, textContent: '', className: '', disabled: false,
      value: '', type: '', placeholder: '', parent: null };
    n.setAttribute = (k, v) => { n.attrs[k] = String(v); };
    n.getAttribute = (k) => (k in n.attrs ? n.attrs[k] : null);
    n.appendChild = (c) => { c.parent = n; n.children.push(c); return c; };
    n.remove = () => { if (n.parent) n.parent.children = n.parent.children.filter((c) => c !== n); n.parent = null; };
    n.addEventListener = (t, fn) => { (n.listeners[t] = n.listeners[t] || []).push(fn); };
    n.click = async () => { if (n.disabled) return; for (const fn of n.listeners.click || []) await fn(); };
    return n;
  };
  return { createElement: mk };
}
const all = (n) => [n, ...n.children.flatMap(all)];
const byClass = (n, c) => all(n).find((x) => x.className === c);
const texts = (n) => all(n).map((x) => x.textContent).filter(Boolean);
function fakeSb(result, calls) {
  return { functions: { invoke: async (name, opts) => { calls.push([name, opts]); if (result instanceof Error) throw result; return result; } } };
}

// ------------------------------------------------------------------------------------------------ the flag
test('flag OFF by default: no UI at all; only an explicit true turns it on', () => {
  assert.equal(refundsEnabled({}), false);
  assert.equal(refundsEnabled(undefined), false);
  assert.equal(refundsEnabled({ KIL_FLAGS: { organizerRefunds: 'true' } }), false, 'a string is not the flag');
  assert.equal(refundsEnabled({ KIL_FLAGS: {} }), false);
  assert.equal(refundsEnabled(ON), true);
  assert.equal(renderRefundControl({}, row(), { doc: fakeDoc(), rows: ROWS }), null, 'flag off: nothing rendered');
  const dash = read('dashboard.html');
  assert.match(dash, /\(window\.KIL_FLAGS&&window\.KIL_FLAGS\.organizerRefunds===true\?'<button type="button" class="ev-refunds"/,
    'the Refunds button only exists when the flag is on');
  assert.match(dash, /if \(refundsEnabled\(window\)\) \{/, 'the panel code does nothing when the flag is off');
});

// ------------------------------------------------------------------------------------------------ amounts
test('amounts: the ticket price only; the order fee is counted once and never refunded', () => {
  assert.equal(unitCents(row()), 2000);
  const a = refundAmounts(row(), 2, orderFeeCents(ROWS, row()));
  assert.deepEqual(a, { k: 2, unitCents: 2000, refundCents: 4000, feeCents: 478, feeRefundedCents: 0 });
  assert.equal(refundAmounts(ROWS[1], 1, orderFeeCents(ROWS, ROWS[1])).refundCents, 4550, 'the VIP row');
  // the fee is the ORDER's: stored once (#62) or repeated on every row (older orders) -- never summed
  assert.equal(orderFeeCents(ROWS, ROWS[1]), 478, 'fee-once: found on the order\'s first row');
  const legacy = [row(), { ...ROWS[1], application_fee_cents: 478 }];
  assert.equal(orderFeeCents(legacy, legacy[1]), 478, 'legacy duplicate fee is not doubled');
  assert.equal(orderFeeCents([row({ stripe_session_id: 'cs_2', application_fee_cents: 0 })], row({ stripe_session_id: 'cs_2', application_fee_cents: 0 })), 0);
  assert.equal(money(478), '$4.78'); assert.equal(money(4000), '$40.00'); assert.equal(money(0), '$0.00');
  assert.equal(unitCents({ qty: 0, amount_cents: 100 }), null); assert.equal(unitCents({ qty: 2, amount_cents: -1 }), null);
});

test('the confirm copy states the exact refund and that the service fee is NOT refundable', () => {
  const lines = confirmLines(refundAmounts(row(), 2, 478));
  assert.deepEqual(lines, ['Refund 2 tickets: $40.00 to the buyer.', 'Refunds the ticket price only. The $4.78 service fee is not refundable.']);
  assert.equal(confirmLines(refundAmounts(row(), 1, 478))[0], 'Refund 1 ticket: $20.00 to the buyer.');
  assert.ok(!/refund(s|ed)? (the )?(service )?fee/i.test(lines[0]), 'the refund line never offers the fee');
  assert.equal(COPY.PLACEHOLDER, true, 'copy is a placeholder until Muse');
});

// ------------------------------------------------------------------------------------------------ bounds
test('k bounds: integers 1..(qty - refunded_qty) only', () => {
  const r = row({ refunded_qty: 1 });
  assert.deepEqual(refundable(r), { max: 2, reason: null });
  for (const k of [1, 2]) assert.equal(validK(r, k), true, String(k));
  for (const k of [0, 3, -1, 1.5, '2', NaN, null, undefined]) assert.equal(validK(r, k), false, String(k));
  assert.equal(refundAmounts(r, 3, 478), null, 'out of bounds: no amounts');
  assert.deepEqual(refundable(row({ refunded_qty: 3 })), { max: 0, reason: 'nothingLeft' });
  assert.deepEqual(refundable(row({ status: 'partially_refunded', refunded_qty: 1 })), { max: 2, reason: null });
  assert.deepEqual(refundable(row({ status: 'refunded' })), { max: 0, reason: 'notPaid' });
  assert.deepEqual(refundable(row({ status: 'pending' })), { max: 0, reason: 'notPaid' });
  assert.deepEqual(refundable(row({ refunded_qty: undefined })), { max: 3, reason: null }, 'no refunded_qty column yet = 0');
});

test('checked-in tickets cannot be refunded: the button is disabled with the reason', () => {
  const r = row({ checked_in_at: '2026-11-17T04:00:00Z' });
  assert.deepEqual(refundable(r), { max: 0, reason: 'checkedIn' });
  const el = renderRefundControl(ON, r, { doc: fakeDoc(), rows: [r] });
  const btn = byClass(el, 'kr-btn');
  assert.equal(btn.disabled, true); assert.equal(btn.getAttribute('aria-disabled'), 'true');
  assert.equal(byClass(el, 'kr-why').textContent, COPY.checkedIn);
  assert.equal(byClass(el, 'kr-why').getAttribute('data-why'), 'checkedIn');
});

// ------------------------------------------------------------------------------------------------ the request
test('the request: refund-tickets with {order_row_id, qty, reason}, through the user\'s session client', async () => {
  const calls = [];
  await requestRefund(fakeSb({ data: { status: 'pending' } }, calls), row(), 2, '  wrong\tdate \u0000 ');
  assert.deepEqual(calls, [['refund-tickets', { body: { order_row_id: 11, qty: 2, reason: 'wrong date' } }]]);
  assert.deepEqual(refundBody(row(), 1, ''), { order_row_id: 11, qty: 1 }, 'no reason: no reason field');
  assert.equal(refundBody(row(), 1, 'x'.repeat(500)).reason.length, 300);
  const src = read('assets/js/organizer-refunds.mjs');
  assert.doesNotMatch(src, /service_role|SERVICE_ROLE|sk_live|sk_test/, 'no service key in the browser');
  assert.doesNotMatch(src, /from\(['"]event_orders['"]\)/, 'the page never writes event_orders');
  const out = await requestRefund(fakeSb({ data: {} }, []), row(), 4, '');
  assert.equal(out.state, 'conflict', 'out-of-bounds k never reaches the function');
});

test('result states: pending / succeeded / reversal_pending / failed, 409 conflict, 500 failed, 401 signed out, a throw', async () => {
  const st = async (res) => (await requestRefund(fakeSb(res, []), row(), 1, '')).state;
  assert.equal(await st({ data: { status: 'pending' } }), 'pending');
  assert.equal(await st({ data: { status: 'succeeded' } }), 'succeeded');
  assert.equal(await st({ data: { status: 'reversal_pending' } }), 'reversal_pending');
  assert.equal(await st({ data: { status: 'failed' } }), 'failed');
  assert.equal(await st({ data: null, error: { message: 'Conflict', context: { status: 409 } } }), 'conflict');
  assert.equal(await st({ data: null, error: { message: 'boom', context: { status: 500 } } }), 'failed');
  assert.equal(await st({ data: null, error: { message: 'no', context: { status: 401 } } }), 'signed_out');
  assert.equal(await st(new Error('network down')), 'failed');
  for (const s of ['pending', 'succeeded', 'reversal_pending', 'failed', 'conflict', 'signed_out']) assert.ok(COPY.states[s], s);
});

// ------------------------------------------------------------------------------------------------ the whole flow
test('flow: Refund tickets -> choose k + reason -> confirm (exact amounts, fee not refundable) -> state shown', async () => {
  const calls = [], doc = fakeDoc();
  const el = renderRefundControl(ON, row(), { doc, sb: fakeSb({ data: { status: 'succeeded' } }, calls), rows: ROWS });
  await byClass(el, 'kr-btn').click();
  const sel = byClass(el, 'kr-k');
  assert.deepEqual(sel.children.map((o) => o.value), ['1', '2', '3'], 'k from 1 to qty - refunded');
  sel.value = '2'; byClass(el, 'kr-reason').value = 'event moved';
  await byClass(el, 'kr-review').click();
  const dlg = byClass(el, 'kr-confirm');
  assert.equal(dlg.getAttribute('role'), 'alertdialog');
  assert.deepEqual(texts(dlg).slice(0, 2), ['Refund 2 tickets: $40.00 to the buyer.', 'Refunds the ticket price only. The $4.78 service fee is not refundable.']);
  await byClass(el, 'kr-go').click();
  assert.deepEqual(calls, [['refund-tickets', { body: { order_row_id: 11, qty: 2, reason: 'event moved' } }]]);
  const status = byClass(el, 'kr-status');
  assert.equal(status.textContent, COPY.states.succeeded); assert.equal(status.getAttribute('data-state'), 'succeeded');
  assert.equal(byClass(el, 'kr-confirm'), undefined, 'the dialog closes');
});

test('flow: Cancel at the confirm sends nothing and gives the button back', async () => {
  const calls = [];
  const el = renderRefundControl(ON, row(), { doc: fakeDoc(), sb: fakeSb({ data: { status: 'succeeded' } }, calls), rows: ROWS });
  await byClass(el, 'kr-btn').click();
  byClass(el, 'kr-k').value = '1';
  await byClass(el, 'kr-review').click();
  await byClass(el, 'kr-no').click();
  assert.deepEqual(calls, []); assert.equal(byClass(el, 'kr-btn').disabled, false);
});

test('flow: a 409 shows the conflict state and leaves the button usable', async () => {
  const el = renderRefundControl(ON, row(), { doc: fakeDoc(), sb: fakeSb({ data: null, error: { context: { status: 409 } } }, []), rows: ROWS });
  await byClass(el, 'kr-btn').click(); byClass(el, 'kr-k').value = '1';
  await byClass(el, 'kr-review').click(); await byClass(el, 'kr-go').click();
  assert.equal(byClass(el, 'kr-status').textContent, COPY.states.conflict);
  assert.equal(byClass(el, 'kr-btn').disabled, false);
});

// ------------------------------------------------------------------------------------------------ no HTML sinks
test('textContent only: no innerHTML in the module or the dashboard refunds panel', () => {
  assert.doesNotMatch(read('assets/js/organizer-refunds.mjs'), /innerHTML|insertAdjacentHTML|outerHTML/);
  const dash = read('dashboard.html'), panel = dash.slice(dash.indexOf("import { refundsEnabled, renderRefundControl"));
  assert.ok(panel.length > 100);
  assert.doesNotMatch(panel.slice(0, panel.indexOf('</script>')), /innerHTML|insertAdjacentHTML/);
});
