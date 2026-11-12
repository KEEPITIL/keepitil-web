# Digital-shelf plan for Muse (one page, draft)

**Status: draft. No Shopify or site changes were made.** Read-only look at the store on 2026-11-05. Product handles and prices below are the real ones from Shopify. I have not created, edited or invented any product, variant or ID; KMOB #11 stays on hold until Muse sends the real variant IDs.

## Why digital first
In the newest 50 orders the only sales since February are digital (two Rollout Kit orders and one custom sale); no merch (see `docs/STORE-SHORTLIST.md`). Lead with what sells.

## 1. Order the digital shelf on /shop
Today `/shop` lists merch first and "For Artists" second. Put the five live digital products first, in this order:

| # | Product (Shopify handle) | Price | Role |
|---|---|---|---|
| 1 | Release Strategy Session (`release-strategy-session`) | $150 | Premium anchor; makes the rest look easy to say yes to |
| 2 | Release Graphics Pack (`release-graphics-pack`) | $99 | Done-for-you, the main mid-price offer |
| 3 | Release Rollout Kit: 7-Day Launch Plan (`release-rollout-kit`) | $19 | Low-price entry; also the free lead magnet (section 2) |
| 4 | SoundCloud Profile Audit (`soundcloud-profile-audit-written`) | $29 | Quick win, easy first purchase |
| 5 | Lyric Visual & Social Content Pack (`lyric-visual-social-content-pack`) | $35 | Add-on for artists who already bought a rollout |

Then the merch below a "Merch" heading. Same order on the keepitil.com page (`shop/index.html`, a small follow-up PR if Joe approves) and in Shopify's collection sort. Each card: price, one-line outcome, delivery time, link to its Shopify page. No change to prices.

## 2. Use the free kit as the lead magnet
Facts: the free-order on Nov 1 was the Rollout Kit at $0 (probably a discount code). Proposed flow (nothing built):
1. A short page, "Get the 7-Day Rollout Kit free". It asks for an email with an **unchecked consent box** ("Send me release tips and offers; unsubscribe any time").
2. The kit arrives by the normal Shopify digital delivery email.
3. Follow-ups (only to people who consented): day 2 a useful tip plus the SoundCloud Audit ($29); day 5 the Graphics Pack ($99); day 9 the Strategy Session ($150). Three emails, then stop.
4. Every email has a one-click unsubscribe and the KEEPITIL postal address (CAN-SPAM).
5. Measure free-to-paid conversion for four weeks before setting any target.

**Needs from Muse/Joe:** which sending tool (Shopify Email, or another); wording of the consent line; whether the free kit is kept free permanently or for a launch window.

## 3. Collections cleanup list (Muse's actions, in Shopify)
Collection sizes today include drafts, so they overlap heavily.

**Digital (the big overlap):**
- **For Artists** (handle `all-digital-assets`, 18 items) already holds every digital product, including 13 drafts. Make it the single digital shelf: active products only, in the order from section 1.
- **Digital Marketing Packages** (16) duplicates For Artists and Services. Hide it from the online store (unpublish; do not delete yet).
- **Services** (13) and **Downloads** (5): keep as two sub-collections (done-for-you services vs PDFs/files). Remove draft products from both until they are real.
- **14 draft products** ("draft-shelf") clutter the admin. Decide per item: publish, archive, or delete later. Do not publish any as part of this plan.
- **Duplicate:** "Release Ready: The Independent Artist Rollout Kit" ($19, draft) and "Release Rollout Kit: 7-Day Launch Plan (PDF)" ($19, active) are the same idea. The Oct 28 order was for the Release Ready title at $19.95. Pick one and archive the other.

**Merch:**
- **Tees** (75) and **T-Shirts & Tees** (68): merge into one.
- **All Merch** (304) is a catch-all; keep it for search but don't make it the landing page.
- **New Parents & Family** (215) overlaps **MOM** (117), **DAD** (72), **Kids & Boss Club** (51), **Grandparents** (10) and **Aunts & Uncles** (8): keep the family ones, drop or rename the 215-item catch-all.
- **KEEPITIL** (6) is the right front-of-store merch collection; lead with it.
- **DJ & Music** (4): keep only if it holds real items.

## Questions for Muse
1. Are the five products in section 1 all ready to sell (delivery works, files attached)? Their inventory shows 0, which is normal for digital, but please confirm.
2. Release Ready vs Rollout Kit: which stays?
3. Which sending tool for the lead magnet?
