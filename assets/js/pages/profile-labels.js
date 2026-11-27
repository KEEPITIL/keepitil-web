/* KEEPITIL profile.html: inline script "labels" moved verbatim to an external file (CSP: no executable inline script). */
/* ── S2 — EDITORIAL LABELLING (ATLAS §D1 "Public labels") ─────────────────────────────────
   A truthfulness constraint, not a copy preference: a venue that never signed up must not
   appear to have endorsed KEEPITIL.

   The defect this replaces: badges fell back to a hardcoded membership badge whenever a
   profile had none, so
   every KEEPITIL-authored profile — Dirtybird, Discotech, FNGRS CRSSD, Framework — rendered a
   "Member" badge. And the type line printed account_type raw, which after the taxonomy
   migration would read "editorial_brand" to the public.

   Ownership comes from profile_owners, never from account_type. KIL_IS_CLAIMED is set by the
   ownership lookup; until it resolves the answer is "not claimed", because the safe default is
   the one that cannot overclaim. */
window.KIL_MEMBERSHIP_WORDS = ['member','subscriber','verified','creator','founder','vip'];
window.KIL_IS_CLAIMED = false;

window.KIL_PROFILE_LABEL = function(accountType){
  var t = String(accountType||'').toLowerCase().trim();
  var EDITORIAL = {
    editorial_artist:    'Artist Profile',
    editorial_venue:     'Venue Profile',
    editorial_organizer: 'Organizer Profile',
    editorial_brand:     'Brand Profile'
  };
  if (EDITORIAL[t]) return EDITORIAL[t];
  if (t === 'subscriber_profile') return window.KIL_IS_CLAIMED ? 'Member' : 'Profile';
  /* Unclassified, or a legacy value: say nothing rather than guess a status. */
  return '';
};

/* Strip any membership word from a badge list unless the profile is genuinely claimed. */
window.KIL_FILTER_BADGES = function(badges){
  var list = Array.isArray(badges) ? badges.slice() : [];
  if (window.KIL_IS_CLAIMED) return list;
  return list.filter(function(b){
    return window.KIL_MEMBERSHIP_WORDS.indexOf(String(b).toLowerCase().trim()) === -1;
  });
};
