// FMW ADVERTISING RULES (deals + strain copy), slice 1 of docs/FMW_DEALS_STRAIN_SPEC_DRAFT.md. Pure functions, shared by the deals UI (and, later,
// the server publish check). Starting rules from the compliance brief; COUNSEL CONFIRMS the exact wording. No network, no storage.
//   - no health or medical claims, nothing that appeals to minors, no encouragement to over-consume,
//   - no free / giveaway / BOGO deals until counsel confirms (Grok 2026-11-23), bundle and set-price deals must state the real price and terms,
//   - every deal carries the license number; no payment, no stored value (a deal only changes the displayed price).
(function (root) {
  var LIC = /^[A-Z]{1,4}[0-9]{1,2}-[0-9]{7}-LIC$/;
  var RULES = [
    ['health', /\b(cures?|cured|treats?|treatment|heals?|healing|relie(f|ves?)|therapeutic|remed(y|ies)|anxiety|depress(ion|ed)|insomnia|sleep aid|chronic pain|pain relief|cancer|seizures?|ptsd|helps? (you )?(with|sleep|relax))\b/i],
    ['minors', /\b(kids?|child(ren)?|toys?|cartoons?|candy|santa|bunny|teens?|school|youth|playground|baby|babies)\b/i],
    ['overconsume', /\b(bulk|stock up|unlimited|all you can|binge|get (super )?high|max(imum)? potency guaranteed)\b/i],
    ['free-or-giveaway', /\b(free|giveaways?|give away|gift with purchase|bogo|buy one get one|raffle|sweepstakes?|win a)\b/i]
  ];
  var KINDS = ['percent', 'amount_off', 'bundle', 'set_price'];   // 'free_item', 'bogo', 'giveaway' are NOT allowed (counsel pending)
  function checkText(s) {
    var t = String(s == null ? '' : s), hits = [];
    RULES.forEach(function (r) { var m = r[1].exec(t); if (m) hits.push(r[0] + ':' + m[0].toLowerCase()); });
    return { ok: hits.length === 0, hits: hits };
  }
  function money(c) { return '$' + Math.floor(c / 100) + '.' + ('0' + (c % 100)).slice(-2); }
  // d: { license, title, description, kind, value, priceCents, termsText, startsAt, endsAt, status } -> { ok, errors: [codes] }
  function validateDeal(d, now) {
    var e = [], t = now ? new Date(now) : new Date();
    if (!d || typeof d !== 'object') return { ok: false, errors: ['bad-deal'] };
    if (!LIC.test(String(d.license || ''))) e.push('no-license');
    var title = String(d.title || '').trim(), desc = String(d.description || '').trim(), terms = String(d.termsText || '').trim();
    if (!title) e.push('no-title'); if (title.length > 60) e.push('title-too-long'); if (desc.length > 200) e.push('description-too-long'); if (!terms) e.push('no-terms'); if (terms.length > 400) e.push('terms-too-long');
    if (KINDS.indexOf(d.kind) < 0) e.push('kind-not-allowed');
    var v = Number(d.value), p = Number(d.priceCents);
    if (d.kind === 'percent' && !(Number.isInteger(v) && v >= 1 && v <= 90)) e.push('bad-percent');
    if (d.kind === 'amount_off' && !(Number.isInteger(v) && v >= 1 && v <= 1000000)) e.push('bad-amount');
    if ((d.kind === 'bundle' || d.kind === 'set_price') && !(Number.isInteger(p) && p >= 1 && p <= 1000000)) e.push('real-price-required');
    var s = new Date(d.startsAt), en = new Date(d.endsAt);
    if (isNaN(s.getTime()) || isNaN(en.getTime())) e.push('bad-dates'); else { if (en.getTime() <= s.getTime()) e.push('ends-before-start'); if (en.getTime() <= t.getTime()) e.push('already-ended'); }
    [['title', title], ['description', desc], ['terms', terms]].forEach(function (x) { checkText(x[1]).hits.forEach(function (h) { e.push('copy-' + x[0] + ':' + h); }); });
    return { ok: e.length === 0, errors: e };
  }
  // the one line a card shows for the discount, from the validated fields (never from free text)
  function discountLine(d) {
    if (d.kind === 'percent') return d.value + '% off';
    if (d.kind === 'amount_off') return money(d.value) + ' off';
    if (d.kind === 'bundle') return 'Bundle price ' + money(d.priceCents);
    if (d.kind === 'set_price') return 'Set price ' + money(d.priceCents);
    return '';
  }
  var api = { RULES: RULES, KINDS: KINDS, checkText: checkText, validateDeal: validateDeal, discountLine: discountLine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FMW_AD_RULES = api;
})(this);
