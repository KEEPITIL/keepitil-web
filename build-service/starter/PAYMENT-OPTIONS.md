# Build service: payment options (draft note for Joe)

**Status: draft.** No accounts, products, links or invoices were created. Fees and product limits below are from general knowledge and **must be checked on each provider's current pricing page before anyone relies on them**. This is not legal or tax advice.

Context: `OFFER.md` proposes Starter $349, Standard $699 and Pro $1,299, paid **50% to start and 50% before launch**, with an optional $29/month care plan. KEEPITIL already has a Shopify store (merch and digital items) and a Stripe account used for event tickets.

## Options compared

| | **A. Stripe Payment Links** | **B. Invoice** (Stripe Invoicing or a manual invoice) | **C. Shopify product per tier** |
|---|---|---|---|
| How it works | One reusable link per amount (e.g. "Standard, 50% deposit $349.50", "Standard, balance $349.50"). Client pays by card. | We send an invoice with a pay link, due date and a description of the work. | Digital product per tier, bought in the existing store checkout. |
| Deposit / balance split | Two links per tier (6 links for 3 tiers), or one link with a custom amount. Easy. | Two invoices, or one invoice with a deposit schedule. Easiest to match what was agreed. | No native deposits. Needs two products per tier (deposit and balance) or an app. Clunky. |
| Recurring care plan ($29/mo) | Payment Link in subscription mode. Native. | Subscription via Stripe. Native. | Needs a subscriptions app; extra cost and setup. |
| Refunds | From the Stripe dashboard. Card fees are generally not returned on refunds. | Same. A credit note can be issued. | From Shopify admin. Same fee caveat. |
| Client experience | Short, mobile-friendly page. No account needed. | Professional paper trail; fits clients who want an invoice for their books. | Looks like buying merch; confusing for a service with revisions and a brief. |
| Fits custom work | Fixed prices only. Extra revision rounds ($90) and change work ($60/h) need a new link each time. | Best: any amount, any description. | Poor: fixed catalogue items only. |
| Setup effort for Joe | Low: create links in the existing Stripe account. | Low to medium: invoice template, tax and business details. | Medium: products, shipping off, delivery email, and the build-service terms. |
| Fees (verify) | Card processing, roughly 2.9% + $0.30 in the US. | Same, plus a small per-invoice fee on Stripe Invoicing. | Shopify card rates by plan, plus any app fees. |
| Main risk | Clients may pay without having seen the terms. Mitigate by linking the terms on the offer page. | Manual follow-up on late invoices. | Mixing services with merch in one store and one set of reports. |

## Recommendation

1. **Use Stripe: Payment Links for the three fixed tiers and the care plan, and Stripe invoices for anything custom** (extra revisions, change work, Pro quotes). Stripe is already set up, handles deposits and subscriptions natively, and keeps services out of the merch store.
2. **Do not use Shopify products for the build service.** It forces awkward deposit handling and mixes service income with merch reporting. Shopify stays for merch and digital downloads.
3. **Deposit and balance:** 50% at signup (starts the work and books the slot) and 50% before launch (we hand over the live site or files once the balance clears).

## Proposed refund and cancellation terms (for Joe to approve; have them checked)

- **Before work starts:** full refund of the deposit.
- **After the first draft is delivered:** the deposit is not refundable. Work done is the deposit.
- **After launch:** the balance is not refundable, but we fix defects against the brief during the free post-launch period (14, 30 or 60 days by tier).
- **If we fail to deliver** what the tier promises: refund the balance and any unpaid work.
- **Care plan:** cancel any time; no refund for the current month.

## What Joe needs to provide to go live

1. **Confirm the prices, the 50/50 split and the care-plan price** (decision rows 1 and 2 in `docs/DECISIONS-2026-11-05.md`).
2. **Approve the refund terms** above and a short written agreement or terms page that the payment page links to.
3. **Stripe:** confirm which Stripe account to use, that it can take payments for services (not only event tickets), and the business name and statement descriptor clients will see.
4. **Tax:** whether sales tax applies to these services in the states where clients live, and who files it. Stripe Tax is an option; ask an accountant.
5. **An owner for payment support** (a monitored inbox for refund and invoice questions).
6. **Go:** after items 1 to 5, ask Claude to prepare the exact link names, amounts and descriptions. The links themselves are created by someone with Stripe access, not by Claude, and nothing is live until Joe says so.

## Not covered here

Collecting client logins or card details in chat, installment plans beyond 50/50, and international clients (currency, VAT). Ask if any of these are wanted.
