// Every word a visitor reads lives here, so final copy replaces it in one place.
// PLACEHOLDER COPY: final first-screen copy and the 3 basics are pending.
// Rules (owner decision 2026-11-17): the name is just "Find My Weed"; no sales or ordering language; no payments.
(function (root) {
  // The launch switch (site.json "launched", via the generated js/site-config.js). Missing config = draft (safe default).
  var CFG = (typeof module !== 'undefined' && module.exports) ? (function () { try { return require('./site-config.js'); } catch (e) { return null; } })() : root.FMW_CONFIG;
  var COPY = {
    PLACEHOLDER: !(CFG && CFG.launched === true),   // draft banner + placeholder copy flag: follows the ONE launch switch
    draftBanner: 'Draft: placeholder copy and sample listings (invented businesses), not real data.',
    name: 'Find My Weed',
    tagline: 'Licensed cannabis storefronts and delivery services near you.',
    searchLabel: 'City or ZIP',
    searchHint: 'Try Los Angeles, Oakland or 90012',   // real examples that return results (final copy pending)
    searchButton: 'Search',
    filtersLabel: 'Show',
    fDelivery: 'Delivery',
    fStorefront: 'Storefront',
    fOpenNow: 'Open now',
    licensedOnly: 'Only state-licensed businesses are listed. Every listing shows its license number.',
    // near a searched place; IN a chosen city when only the city was given (#15)
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
    // Discovery home (2026-11-21; PENDING design review: written from a summary of the design spec).
    // County = the location selector (#69 copy). Rails: ONLY rails with real data are drawn; the others have no copy here.
    fCounty: 'County',
    fCountyAll: 'All counties',
    countyName: function (c) { return c + ' County'; },
    unknownCountyTitle: function (c) { return 'No licensed shops in ' + c + ' County'; },
    signIn: 'Sign in',
    signInSoon: 'Coming soon: accounts are not open yet.',
    forBusiness: 'List Your Business',
    comingSoon: 'Coming soon',
    // The approved home (owner 2026-11-21 17:53 PT). Search bar: ONE location dropdown (State / County / City) inside it.
    fArea: 'Location',
    fAreaState: 'California',          // "" = the whole state (the only state FMW lists today)
    areaGroupState: 'State',
    areaGroupCounty: 'County',
    areaGroupCity: 'City',
    mapShow: function (name) { return 'Show ' + name + ' on the map'; },
    // Phone (< 768px): two buttons switch between the card list and the map (owner 19:16 PT)
    viewToggleLabel: 'Show as',
    viewList: 'List',
    viewMap: 'Map',
    // The filter carousel: the full approved set, "Home" (default) first (FMW.FILTERS). Each filters in place.
    filterBarLabel: 'Filters',
    fHome: 'Home',
    fDeals: 'Deals',
    fRetail: 'Retail',
    fBrands: 'Brands',
    fCultivation: 'Cultivation',
    fManufacturing: 'Manufacturing',
    fDistribution: 'Distribution',
    fTesting: 'Testing Labs',
    fMicrobusiness: 'Microbusiness',
    fServices: 'Services',
    fEvents: 'Events',
    // A chip with nothing real behind it yet in this area: said plainly, never filled with invented rows
    filterEmptyTitle: function (label, place) { return label + ': no licensed businesses listed' + (place ? ' in ' + place : '') + ' yet'; },
    filterEmptyOpen: 'Opening hours are not on file yet, so no business can be shown as open now.',
    filterEmptyOther: 'Nothing listed here has this on file yet. Only real license and business data is shown.',
    showAll: 'Show all',
    // Home rows drawn ONLY from real entries (FMW.promoRows); hidden while there are none. No ranking-by-rating row and no paid-placement slot exist.
    rowAds: 'Ads',
    rowDeals: 'Deals nearby',
    rowCategories: 'Categories',
    rowFeatured: 'Featured',
    // Categories row tiles (FMW.categoryTiles): a tile only for a category with real rows in the area
    catTile: { storefront: 'Storefronts', delivery: 'Deliveries', brands: 'Brands' },   // Services / Events: the chip words (fServices / fEvents)
    catTileLabel: function (name) { return 'Show ' + name; },
    // Listing card lines (FMW.cardLines): 6 lines, unnumbered, unlabelled
    rating: function (n) { return n.toFixed(1) + ' ★'; },
    kindStorefront: 'Storefront',
    kindDelivery: 'Delivery',
    kindBoth: 'Storefront + Delivery',
    cardLicense: function (n) { return 'License ' + n; },   // the check mark's accessible text: the plain license number
    // The menu page (approved spec item 9; supersedes the five-section menu of #79). ONE list in display order;
    // js/fmw.js menuItems() decides link vs "coming soon", js/pages.js draws it. It opens only on a click (never on load).
    //   group 0: the two account pills (Sign in outlined, Sign up filled); groups 1-3: icon + label rows; the theme pill
    //   (System / Bright / Dark) is drawn at the bottom by pages.js.
    // Fields: label; icon (a key of the page script's icon set); ONE destination:
    //   page: a page of this site (relative; under basePath on 404.html) | biz: <basePath>/for-business/
    //   host: a page of the HOST site this folder is served inside (root-relative, e.g. /support/); a link only while
    //         site.json basePath is set
    //   account: true = needs accounts (site.json "accounts", false today): disabled + "coming soon".
    //   needsData: '<flag>' = a link only once that data exists (pages.js passes offered.<flag>); until then disabled +
    //         "coming soon". An item with no destination is also "coming soon": nothing links to a page that does not exist.
    //   storefront / delivery: automatic from the licensed listings. deals / brands / services / events: add the real
    //   data and its page first, give the item a page:, and pass offered.<flag> = true from js/pages.js.
    navMenu: 'Menu',            // the menu button's accessible name
    navMenuLabel: 'Main menu',  // the menu's navigation landmark name
    signUp: 'Sign up',
    themeLabel: 'Theme',
    themeSystem: 'System',
    themeBright: 'Bright',
    themeDark: 'Dark',
    NAV_MENU: [
      { key: 'signin', label: 'Sign in', account: true, pill: 'outline', page: 'signup.html?mode=signin' },
      { key: 'signup', label: 'Sign up', account: true, pill: 'fill', page: 'signup.html' },
      { key: 'home', label: 'Home', group: 1, icon: 'home', page: 'index.html' },
      { key: 'storefronts', label: 'Storefronts', group: 1, icon: 'store', page: 'index.html?storefront=1', needsData: 'storefront' },
      { key: 'deliveries', label: 'Deliveries', group: 1, icon: 'truck', page: 'index.html?delivery=1', needsData: 'delivery' },
      { key: 'deals', label: 'Deals', group: 1, icon: 'tag', needsData: 'deals' },
      { key: 'brands', label: 'Brands', group: 2, icon: 'star', needsData: 'brands' },
      { key: 'business', label: 'Business', group: 2, icon: 'building', page: 'results.html' },   // the whole licensed-business directory
      { key: 'services', label: 'Services', group: 2, icon: 'wrench', needsData: 'services' },
      { key: 'events', label: 'Events', group: 2, icon: 'calendar', needsData: 'events' },
      { key: 'learning', label: 'Learning', group: 2, icon: 'book', host: '/culture/' },   // the host site's culture stories feed
      { key: 'favorites', label: 'Favorites', group: 3, icon: 'heart', account: true },
      { key: 'help', label: 'Help', group: 3, icon: 'help', host: '/support/' },          // the host site's standing support page
      { key: 'listbiz', label: 'List Your Business', group: 3, icon: 'plus', biz: true }
    ],
    railDelivery: 'Delivery',
    railOpenNow: 'Open now',
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
    // Map pin shapes (owner 19:11 PT): one per customer category; the legend names the shapes on the map
    pinCat: { retail: 'Retail', business: 'Business' },   // Events / Services: the chip words (fEvents / fServices)
    mapLegendLabel: 'Pin shapes',
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
    // Review B/D (2026-11-21): the hand-off says the business checks ID and shows the age rule; Find My Weed claims no check.
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
      search: { title: 'Find My Weed', description: 'Find state-licensed cannabis storefronts and delivery services near you. Open to all; cannabis is for adults 21+ (18+ medical where legal).' },
      results: { title: 'Licensed businesses near you · Find My Weed', description: 'State-licensed cannabis storefronts and delivery services, with license numbers and opening hours. Cannabis is for adults 21+ (18+ medical where legal).' },
      listing: { title: 'Licensed business · Find My Weed', description: 'License number, address and hours for a state-licensed cannabis business. Cannabis is for adults 21+ (18+ medical where legal).' },
      about: { title: 'About · Find My Weed', description: 'How Find My Weed lists only state-licensed cannabis businesses, where the license data comes from, and its limits.' },
      privacy: { title: 'Privacy · Find My Weed', description: 'What Find My Weed stores: business data from the state license record, optional accounts with email sign-in, no ad tracking, nothing sold.' },
      notfound: { title: 'Page not found · Find My Weed', description: 'This page does not exist. Search state-licensed cannabis businesses on Find My Weed.' },
      // the sign-up page (signup.html, behind site.json "accounts"). Its own words are in js/signup-copy.js.
      signup: { title: 'Account · Find My Weed', description: 'Create a Find My Weed account or sign in with an emailed link. Browsing licensed businesses needs no account.' },
      account: { title: 'Your account · Find My Weed', description: 'Your Find My Weed account: who is signed in, and sign out.' },
      imageAlt: 'Find My Weed: search state-licensed cannabis storefronts and delivery services',   // the real share image (launched)
      imageAltPlaceholder: 'Find My Weed placeholder share image'   // the draft's placeholder image
    },
    // Age notice (owner decision 2026-11-21: follow Weedmaps / Leafly): the directory is open to everyone, with
    // no entry wall; age is checked by the business at the point of sale. FMW has no ordering, so nothing here asks for an age.
    footer21: 'Cannabis is for adults 21+, or 18+ medical patients where state law allows. Licensed businesses only. The business checks ID.',
    footerNote: 'Find My Weed is a directory of state-licensed businesses. Check your local laws.',
    footerAbout: 'About',
    footerPrivacy: 'Privacy',
    // SB 378 (Bus. & Prof. Code 22943, cannabis marketplaces): a PUBLIC way to report an unlicensed seller, in the footer of
    // every page, no account needed. A plain mailto to info@keepitil.com (the support address): no form, no network call,
    // no database. The same href is written into each page so it works before (and without) JavaScript.
    footerReport: 'Report an unlicensed seller',
    footerReportNote: 'Opens an email to info@keepitil.com. No account needed.',
    reportSellerHref: 'mailto:info@keepitil.com?subject=Report%20an%20unlicensed%20seller%20(Find%20My%20Weed)&body=Business%20or%20seller%20name%3A%0A%0AWhere%20you%20saw%20it%20(address%2C%20website%2C%20app%20or%20social%20account)%3A%0A%0AWhat%20happened%2C%20and%20when%3A%0A%0A',
    // About / Privacy / 404 pages (PLACEHOLDER; the Privacy text also needs a privacy review before launch).
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
          { h: 'Accounts are optional; no ad tracking', p: [
            'You do not need an account to browse Find My Weed. We do not use advertising trackers.',
            'We use Cloudflare Web Analytics to count page views. It uses no cookies and gives us totals only: no ads and no profile that follows you to other sites.',
            'We don\'t keep your searches. Like any website, our host keeps short-lived server logs (IP address and page requested) for security.'] },
          // Accounts (sign-up live since 2026-11-22). Every line is true of js/signup.js, js/fmw-auth.js and
          // supabase/migrations/20261123010000_fmw_signup.sql; tests/privacy-accounts.test.js checks each against the code.
          { h: 'If you create an account', p: [
            'Signing in uses a link we email to you. There is no password.',
            'Your account holds your email address and whether it is a customer or a business account. For 18 to 20 year olds with a medical recommendation, it also notes that the account is medical-only. It also keeps your light or dark choice if you make one.',
            'Sign-up asks when you were born, to check eligibility. That check runs in your browser, and the answer is not stored.',
            'Business accounts: to verify a license, we check the license number, the legal business name and the category you enter against the state license record. When you are signed in, the result of that check is kept with your account, together with the license number.',
            'Accounts are stored in a hosted database that we run. They are kept separate from member profiles on our other sites.'] },
          { h: 'Ordering ahead (where a business offers it)', p: [
            'When a business accepts orders, we send it the items you chose, whether you want pickup or delivery, the city for a delivery, any note you add and the time you ask for. We ask for your date of birth again when you place an order, check that you are old enough, and then discard it: it is not saved.',
            'Find My Weed takes no payment. You pay the business when you pick up or when it is delivered, and the business checks your ID.'] },
          { h: 'Who sees your information, and deleting it', p: [
            'We do not sell your information and we do not share it with advertisers. Services that host and email the site process it only to run Find My Weed.',
            'To delete your account and what is kept with it, email info@keepitil.com from the address on the account. Until a delete button exists, we will do it for you.'] },
          { h: 'What stays on your device', p: [
            'Searching near you uses the city or ZIP you type. Your exact location is never sent to a server.',
            'This site saves up to two settings in your browser: fmw-theme (System, Bright or Dark), if you pick a theme in the menu, and fmw-area, the last location you chose in the search bar, so the home opens there next time. They stay on this device and aren\'t sent to us or anyone else. Clear this site\'s data in your browser settings to remove them.'] },
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
