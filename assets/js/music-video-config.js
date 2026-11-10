/* Music video service: configuration. DRAFT.
 * KIL_MV_PRICES_LIVE: keep false until Grok posts Joe's confirmation that prices are live.
 *   false = tier cards say "Pricing confirmed soon: request a quote" and show no dollar amounts.
 * KIL_MV_SUBMIT_MODE: 'mailto' (default; opens the visitor's email app addressed to info@keepitil.com,
 *   no backend) | 'rpc' (NOT wired: needs the proposed SQL pack applied, Sentinel review, Joe's yes).
 */
window.KIL_MV_PRICES_LIVE = false;
window.KIL_MV_SUBMIT_MODE = 'mailto';
