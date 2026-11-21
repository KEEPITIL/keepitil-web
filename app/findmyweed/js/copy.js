// Every word a visitor reads lives here, so Muse's final copy replaces it in one place.
// PLACEHOLDER COPY: Muse posts the first-screen copy and the 3 basics in the master doc by 9 AM PT.
// Rules (Joe / KODE 2026-11-17): the name is just "Find My Weed"; no sales or ordering language; no payments.
(function (root) {
  // The launch switch (site.json "launched", via the generated js/site-config.js). Missing config = draft (safe default).
  var CFG = (typeof module !== 'undefined' && module.exports) ? (function () { try { return require('./site-config.js'); } catch (e) { return null; } })() : root.FMW_CONFIG;
  var COPY = {
    PLACEHOLDER: !(CFG && CFG.launched === true),   // draft banner + placeholder copy flag: follows the ONE launch switch
    draftBanner: 'Draft: placeholder copy and sample listings (invented businesses), not real data.',
    name: 'Find My Weed',
    tagline: 'Licensed cannabis storefronts and delivery services near you.',
    searchLabel: 'City or ZIP',
    searchHint: 'Try Los Angeles, Oakland or 90012',   // Grok 2026-11-21 01:36 / 02:10 PT: real examples that return results (Muse's final copy pending)
    searchButton: 'Search',
    filtersLabel: 'Show',
    fDelivery: 'Delivery',
    fStorefront: 'Storefront',
    fOpenNow: 'Open now',
    licensedOnly: 'Only state-licensed businesses are listed. Every listing shows its license number.',
    // near a searched place; IN a chosen city when only the city was given (#15)
    resultsTitle: function (n, place, city) { return n + (n === 1 ? ' licensed business' : ' licensed businesses') + (place ? ' near ' + place : city ? ' in ' + city : ''); },
    noPlace: function (q) { return 'We could not find "' + q + '" yet. Try a city name or a 5-digit ZIP.'; },
    noResults: 'No licensed businesses match these filters. Try removing a filter.',
    newSearch: 'New search',
    // Empty and error states (PLACEHOLDER, like everything here)
    badZipTitle: 'That ZIP code doesn’t look right',
    badZipBody: function (q) { return '“' + q + '” is not a 5-digit ZIP code. Check the number, or search by city.'; },
    unknownZipTitle: function (zip) { return 'No licensed shops match ' + zip; },
    unknownCityTitle: function (q) { return 'No licensed shops match “' + q + '”'; },
    unknownBody: 'Find My Weed is starting in a few areas. Try a nearby city or ZIP.',
    emptyTitle: function (place) { return 'No licensed shops match these filters' + (place ? ' in ' + place : ''); },
    emptyBody: 'Try removing a filter. “Open now” hides businesses that are closed at the moment.',
    clearFilters: 'Clear filters',
    clearSearch: 'Clear search',
    loadErrorTitle: 'We couldn’t load listings',
    loadErrorOffline: 'You seem to be offline. Check your connection and try again.',
    loadErrorOther: 'Something went wrong on our side. Please try again in a moment.',
    retry: 'Try again',
    listingMissingTitle: 'This listing isn’t available',
    listingMissingDocTitle: 'Listing not found · Find My Weed',
    listingMissingBody: 'It may have been removed, or its license may no longer be active.',
    backToSearch: 'Back to search',
    open: 'Open',
    closed: 'Closed',
    hoursNotListed: 'Hours not listed',
    fCity: 'City',
    fCityAll: 'All cities',
    openUntil: function (t) { return 'Open until ' + t; },
    closedToday: 'Closed today',
    deliveryOnly: 'Delivery only (no storefront)',
    storefrontAndDelivery: 'Storefront + delivery',
    storefrontOnly: 'Storefront',
    miles: function (d) { return d.toFixed(1) + ' mi'; },
    license: 'License #',
    // Only the two shown statuses ever reach a page; "About to Expire" is still an active license.
    // the short form on a results card (the same rule: About to Expire is Active, and says so)
    cardStatus: function (s) { return s === 'About to Expire' ? 'Active (about to expire)' : s; },
    // Map (Phase 1, PLACEHOLDER like everything here). Each dot is a link to the same detail page as its card.
    mapTitle: 'Map',
    mapLabel: function (n) { return 'Map of ' + n + (n === 1 ? ' licensed business' : ' licensed businesses') + '. Each dot opens the business.'; },
    mapDot: function (name, kind, city) { return name + ', ' + (kind === 'delivery' ? 'delivery service, shown at the centre of ' + (city || 'its city') : 'storefront' + (city ? ' in ' + city : '')); },
    mapDeliveryNote: 'Delivery services are shown at the centre of their city, never at their own address.',
    mapNotShown: function (n) { return n === 1 ? '1 business has no map location and is in the list only.' : n + ' businesses have no map location and are in the list only.'; },
    licenseStatus: function (s) { return 'State status: ' + (s === 'About to Expire' ? 'Active (about to expire)' : s); },
    licenseChecked: function (date) { return 'License checked on ' + date; },
    licenseStale: 'This check may be out of date. Confirm on the state record.',
    licenseRecord: 'View the official state record',
    hours: 'Hours',
    address: 'Address',
    addressNone: 'Address not listed',
    addressNoStreet: 'Street address not listed',
    addressDeliveryNote: 'Delivery only: we show the city, not the street address.',
    menu: 'Menu',
    // This link leaves Find My Weed for the business's own site, which may take orders there (Find My Weed never does).
    // Sentinel B/D (2026-11-21): the hand-off says the business checks ID and shows the age rule; Find My Weed claims no check.
    menuLink: 'View menu on their website',
    menuNote: 'Opens the business’s own site. The business checks ID there: 21+ (18+ medical where legal). Find My Weed does not check ID.',
    noMenu: 'No menu link yet.',
    claim: 'Claim this listing',
    claimSoon: 'Coming soon: business owners will be able to claim and update their listing.',
    // "Report a problem with this listing" (W3r). No reporter identity is asked for or kept. While the reports queue is
    // not live (DRAFT SQL, not applied) the form checks the input and says plainly that nothing was sent.
    report: 'Report a problem',
    reportIntro: 'Is something wrong with this listing? Tell us. We don’t ask who you are.',
    reportReasonLegend: 'What is wrong?',
    reportReasons: { closed: 'It has closed', wrong_hours: 'The hours are wrong', wrong_address: 'The address is wrong', wrong_license: 'The license details are wrong', not_licensed: 'It is not a licensed business', other: 'Something else' },
    reportDetails: 'Details (optional)',
    reportDetailsHint: 'Up to 500 characters. Please don’t include names, email addresses or phone numbers.',
    reportSend: 'Send report',
    reportErrors: { reason: 'Pick what is wrong.', 'details-required': 'Tell us what is wrong in the details box.', 'too-long': 'Keep the details to 500 characters or less.', contact: 'Please take out the email address or phone number.' },
    reportNotOpen: 'Thanks. Reports open at launch, so nothing was sent yet.',
    back: 'Back to results',
    notFound: 'This listing is not available.',
    // Page titles, descriptions and share-card (Open Graph) text. tools/meta.js writes these into each page's <head>.
    meta: {
      siteName: 'Find My Weed',
      search: { title: 'Find My Weed', description: 'Find state-licensed cannabis storefronts and delivery services near you. Open to all; cannabis is for adults 21+.' },
      results: { title: 'Licensed businesses near you · Find My Weed', description: 'State-licensed cannabis storefronts and delivery services, with license numbers and opening hours. Cannabis is for adults 21+.' },
      listing: { title: 'Licensed business · Find My Weed', description: 'License number, address and hours for a state-licensed cannabis business. Cannabis is for adults 21+.' },
      about: { title: 'About · Find My Weed', description: 'How Find My Weed lists only state-licensed cannabis businesses, where the license data comes from, and its limits.' },
      privacy: { title: 'Privacy · Find My Weed', description: 'What Find My Weed stores: business data from the state license record only, no visitor accounts, no tracking.' },
      notfound: { title: 'Page not found · Find My Weed', description: 'This page does not exist. Search state-licensed cannabis businesses on Find My Weed.' },
      imageAlt: 'Find My Weed: search state-licensed cannabis storefronts and delivery services',   // the real share image (launched)
      imageAltPlaceholder: 'Find My Weed placeholder share image'   // the draft's placeholder image
    },
    // Age notice (Joe 2026-11-21 00:25 PT, Grok 00:14 PT: follow Weedmaps / Leafly): the directory is open to everyone, with
    // no entry wall; age is checked by the business at the point of sale. FMW has no ordering, so nothing here asks for an age.
    footer21: 'Cannabis is for adults 21+, or 18+ medical patients where state law allows. Licensed businesses only. The business checks ID.',
    footerNote: 'Find My Weed is a directory of state-licensed businesses. Check your local laws.',
    footerAbout: 'About',
    footerPrivacy: 'Privacy',
    // About / Privacy / 404 pages (PLACEHOLDER, for Muse; the Privacy text also needs Echo's review before launch).
    // Each page: a title and sections of plain-text paragraphs. Everything stated here is true of the code and
    // docs/DATA_PLAN.md today; keep it that way when editing.
    info: {
      about: {
        title: 'About Find My Weed',
        sections: [
          { h: 'What it is', p: [
            'Find My Weed is a directory of cannabis storefronts and delivery services that hold a state license. Anyone can browse it. Cannabis itself is for adults 21 and older, or medical patients 18 and older where state law allows; the business checks ID.',
            'Find My Weed is not a store. Nothing is sold, reserved or delivered here. Each listing points you to the business itself.'] },
          { h: 'Only licensed businesses', p: [
            'Every listing shows its state license number. A business is listed only while its license is Active (or About to Expire) and its expiry date has not passed. Suspended, revoked, surrendered or expired licenses are hidden.',
            'Each listing says when its license was last checked and links to the official state record so you can confirm it yourself.'] },
          { h: 'Where the license data comes from', p: [
            'License details come from the California Department of Cannabis Control public license search (search.cannabis.ca.gov), which the State publishes as public information.',
            'The State does not guarantee the accuracy of that data, and neither can we. If something looks wrong, check the official record linked on the listing.'] },
          { h: 'Hours and menus', p: [
            'Hours, menu links and delivery details come from the business, not from the State. They can change; confirm with the business before you go.'] }
        ]
      },
      privacy: {
        title: 'Privacy',
        sections: [
          { h: 'No accounts, no tracking', p: [
            'You do not need an account to use Find My Weed. We do not use advertising trackers.',
            'We use Cloudflare Web Analytics to count page views. It uses no cookies and gives us totals only: no ads and no profile that follows you to other sites.',
            'We don\'t keep your searches. Like any website, our host keeps short-lived server logs (IP address and page requested) for security.'] },
          { h: 'What stays on your device', p: [
            'Searching near you uses the city or ZIP you type. Your exact location is never sent to a server.'] },
          { h: 'Business information', p: [
            'Listings show business information only: the business name, its license details, its public address (for storefronts) and the hours and links the business gives us.',
            'The state license record also includes owner names and contact details. We never show those publicly. For delivery-only businesses we show the city, not the street address.'] },
          { h: 'Changes', p: [
            'If this page changes, the new version will be posted here before it takes effect.'] }
        ]
      },
      notfound: {
        title: 'Page not found',
        sections: [{ h: '', p: ['This page does not exist, or it has moved.'] }],
        back: 'Search licensed businesses'
      }
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = COPY; else root.FMW_COPY = COPY;
})(typeof window !== 'undefined' ? window : globalThis);
