// The ONE rule for the listing slug that rides through "Save" and sign-in (docs/FMW_SIGNIN_RETURN_TARGET_DESIGN_DRAFT.md). Shared by the listing page's
// Save link, the account page, and the sign-up page, so the three can never disagree. Pure: no network, no storage.
//   fromSearch(search, cfg) -> the slug in a page address's ?save=, or ''. '' unless FMW_CONFIG.favorites === true (off today).
// Only the slug shape is accepted, never a URL. If ?save= appears more than once, ONLY THE FIRST counts: a bad first value is dropped, and a good
// second one is never promoted (?save=bad&save=good is '', so nothing can be smuggled behind a decoy).
(function (root) {
  var RE = /^[a-z0-9-]{3,80}$/;
  function fromSearch(search, cfg) {
    if (!cfg || cfg.favorites !== true) return '';
    var v = '';
    try { v = new URLSearchParams(String(search == null ? '' : search)).get('save') || ''; } catch (e) { v = ''; }
    return RE.test(v) ? v : '';
  }
  var api = { RE: RE, fromSearch: fromSearch };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FMW_SAVEID = api;
})(this);
