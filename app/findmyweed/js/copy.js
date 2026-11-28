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
    notifLabel: 'Notifications', notifNone: 'No new updates.', cartLabel: 'Cart', cartTitle: 'Ordering is coming soon', cartBody: 'Find My Weed is a directory for now. Contact a licensed business directly.',
    headSearchHint: 'Search', locDefault: 'California',
    searchHint: 'Try Los Angeles, Oakland or 90012',   // real examples that return results (final copy pending)
    searchButton: 'Search',
    nearButton: 'Use my location',
    nearAsking: 'Your browser may ask to share your location. It is used here only and is not stored or sent.',
    nearShowing: 'Showing the storefronts nearest to you. Your location stays in this browser.',
    nearDenied: 'Location is blocked for this site. Allow it in your browser settings, or pick an area instead.',
    nearUnavailable: 'Your location could not be found. Pick an area instead.',
    nearTimeout: 'Finding your location took too long. Try again, or pick an area.',
    nearNoSupport: 'This browser cannot share a location. Pick an area instead.',
    filtersLabel: 'Show',
    fDelivery: 'Delivery',
    fStorefront: 'Storefronts',
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
    // NEW LINES for Muse's review (draft wording, marked): the paged card list and the paid-placement label
    seeAllRow: function (title) { return 'See all ' + title; },   // NEW (draft, for Muse): the accessible name of a row's link, built from the row's own title (the sales-word guard allows only the two approved labels)
    seeAll: 'See all',   // NEW (draft, for Muse): the link on a carousel row's title
    adTag: 'Ad',         // NEW (draft, for Muse): the label on an ad tile
    showMore: function (n) { return 'Show ' + n + ' more'; },
    showMoreCount: function (shown, total) { return 'Showing ' + shown + ' of ' + total; },
    sponsored: 'Sponsored',
    fCity: 'City',
    fCityAll: 'All cities',
    // Discovery home (2026-11-21; PENDING design review: written from a summary of the design spec).
    // County = the location selector (#69 copy). Rails: ONLY rails with real data are drawn; the others have no copy here.
    fCounty: 'County',
    fCountyAll: 'All counties',
    countyName: function (c) { return c + ' County'; },
    // Delivery chip in a city search (Grok 2026-11-25 20:48): the services licensed in the city's county, worded exactly so (no "delivers to you", no city claim); c is "<Name> County"
    deliveryCountyNote: function (c) { return 'Licensed in ' + c + ". The state doesn't list service areas, so check with the service."; },
    unknownCountyTitle: function (c) { return 'No licensed shops in ' + c + ' County'; },
    signIn: 'Sign in',
    account: 'Account',
    signOut: 'Sign out',
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
    fPickup: 'Curbside pickup', fProducts: 'Products', fBrandMenu: 'Brand', fMedical: 'Medical', fRecreational: 'Recreational',
    locButton: 'Location', locPanelLabel: 'Choose a location', locState: 'State', locCounty: 'County', locCity: 'City', locAllCounties: 'All counties', locAllCities: 'All cities',
    fHome: 'Home',
    fDeals: 'Deals',
    fRetail: 'Retail',
    fBrands: 'Brands',
    fCultivation: 'Cultivation',
    fManufacturing: 'Manufacturing',
    fDistribution: 'Distribution',
    fTesting: 'Testing',
    fEventorg: 'Event Organizer',
    fMicrobusiness: 'Microbusiness',
    fServices: 'Services',
    fEvents: 'Events',
    // A chip with nothing real behind it yet in this area: said plainly, never filled with invented rows
    filterEmptyTitle: function (label, place) { return label + ': none on file' + (place ? ' in ' + place : '') + ' yet'; },   // Grok 8:05: "none on file" (the old "no licensed businesses listed" read as if the county had none)
    filterEmptyOpen: 'Opening hours are not on file yet, so no business can be shown as open now.',
    filterEmptyOther: 'Nothing listed here has this on file yet. Only real license and business data is shown.',
    showAll: 'Show all',
    // Home rows drawn ONLY from real entries (FMW.promoRows); hidden while there are none. No ranking-by-rating row and no paid-placement slot exist.
    // Redesign PR-4 (home), our own words: the hero, the area tiles, three plain facts, the claim band.
    // Homepage layout v2: the per-county pages (/dispensaries/<county>/ and /delivery/<county>/), generated by tools/county-pages.js. Counts are the real counts of shown rows.
    countyPage: {
      storefront: {
        h1: function (n, c) { return n === 0 ? 'No licensed storefronts listed in ' + c + ' yet' : (n === 1 ? '1 licensed storefront' : n + ' licensed storefronts') + ' in ' + c; },
        title: function (n, c) { return (n === 0 ? 'Licensed storefronts in ' + c : (n === 1 ? '1 licensed storefront' : n + ' licensed storefronts') + ' in ' + c) + ' · Find My Weed'; },
        description: function (n, c) { return n === 0 ? 'No state-licensed cannabis storefronts are listed in ' + c + ', California, yet. Search the rest of the directory on Find My Weed.' : (n === 1 ? 'A state-licensed cannabis storefront' : n + ' state-licensed cannabis storefronts') + ' in ' + c + ', California, each with its license number, status and expiry date. A directory only: nothing is sold here.'; }
      },
      delivery: {
        h1: function (n, c) { return n === 0 ? 'No licensed delivery services listed in ' + c + ' yet' : (n === 1 ? '1 licensed delivery service' : n + ' licensed delivery services') + ' based in ' + c; },
        title: function (n, c) { return (n === 0 ? 'Licensed delivery services in ' + c : (n === 1 ? '1 licensed delivery service' : n + ' licensed delivery services') + ' based in ' + c) + ' · Find My Weed'; },
        description: function (n, c) { return n === 0 ? 'No state-licensed cannabis delivery services are listed in ' + c + ', California, yet. Search the rest of the directory on Find My Weed.' : (n === 1 ? 'A state-licensed cannabis delivery service' : n + ' state-licensed cannabis delivery services') + ' based in ' + c + ', California, each with its license number and status. The state lists the county only. A directory only: nothing is sold or delivered here.'; }
      },
      noscriptHead: 'The licensed businesses on this page:'
    },
    heroTitle: 'Find licensed weed near you',
    browseTitle: 'Dispensaries by county', browseAllCounties: 'All counties', browseAllCities: 'All cities', browseCitiesTitle: 'Top cities',
    browseCityLabel: function (name, n) { return name + ': ' + (n === 1 ? '1 licensed storefront' : n + ' licensed storefronts'); },
    browseTile: function (n) { return n === 1 ? '1 licensed storefront' : n + ' licensed storefronts'; },
    browseTileLabel: function (name, n) { return name + ': ' + (n === 1 ? '1 licensed storefront' : n + ' licensed storefronts'); },
    claimTitle: 'Claim your free listing',
    claimBody: 'Own a licensed business here? Add your phone number and website so people can reach you.',
    rowAds: 'Ads',
    rowDeals: 'Deals nearby',
    rowCategories: 'Categories',
    rowFeatured: 'Featured',
    resultsHeading: 'Licensed businesses',   // NEW (draft, for Muse): a visually hidden heading above the card list (heading order h1 > h2 > h3); never shown, no count
    // Categories row tiles (FMW.categoryTiles): a tile only for a category with real rows in the area
    catTile: { storefront: 'Storefronts', delivery: 'Deliveries', brands: 'Brands' },   // Services / Events: the chip words (fServices / fEvents)
    catTileLabel: function (name) { return 'Show ' + name; },
    // Listing card lines (FMW.cardLines): 6 lines, unnumbered, unlabelled
    rating: function (n) { return n.toFixed(1) + ' ★'; },
    kindStorefront: 'Storefront',
    kindDelivery: 'Delivery',
    kindNone: 'Licensed business',   // a record with neither a storefront nor delivery on file never says "Delivery" (Grok 2026-11-25 11:36)
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
    railLabel: 'Main',
    navMenuLabel: 'Main menu',  // the menu's navigation landmark name
    signUp: 'Sign up',
    themeLabel: 'Theme',
    themeSystem: 'System',
    themeBright: 'Bright',
    themeDark: 'Dark',
    // Homepage layout v2 (owner, 2026-11-25): the menu is a LEFT drawer on phone and desktop. Order: the account pills, the main links, "Licensed categories", then Help / About /
    // Privacy / Terms / Report. A link whose page or data does not exist yet is shown as "Coming soon" (disabled, announced), never as a dead link: Delivery needs delivery data,
    // Brands needs claimed brand pages, and the licensed categories other than Retail Storefront wait for their own pages (PR-9).
    NAV_MENU: [
      { key: 'signin', label: 'Sign in', account: true, visitorOnly: true, pill: 'outline', page: 'signup.html?mode=signin' },
      { key: 'signup', label: 'Sign up', account: true, visitorOnly: true, pill: 'fill', page: 'signup.html' },
      { key: 'home', label: 'Home', group: 1, icon: 'home', page: 'index.html' },
      { key: 'storefronts', label: 'Dispensaries', group: 1, icon: 'store', page: 'dispensaries/' },   // always a live link: the directory IS storefronts
      { key: 'deliveries', label: 'Delivery', group: 1, icon: 'truck', page: 'delivery/' },
      { key: 'map', label: 'Map', group: 1, icon: 'pin', page: 'dispensaries/#map' },
      { key: 'brands', label: 'Brands', group: 1, icon: 'star', page: 'brands/' },
      { key: 'learning', label: 'Learn', group: 1, icon: 'book', page: 'learn/' },   // Find My Weed's own Learn page
      { key: 'mybusiness', label: 'My business', group: 1, icon: 'briefcase', account: true, signedInOnly: true, businessOnly: true, page: 'account.html#business' },   // a signed-in business account only
      { key: 'favorites', label: 'Favorites', group: 1, icon: 'heart', account: true, page: 'account.html#saved' },
      // "Find My Weed Business" (Joe 2026-11-27): the names and the ORDER of the home carousel (C.industryCarousel; tests/menu.test.js keeps them equal), then "+ For businesses" last
      { key: 'services', label: 'Services', group: 2, page: 'services/' },
      { key: 'cat-retail', label: 'Storefront', group: 2, page: 'dispensaries/?f=storefront' },
      { key: 'cat-delivery', label: 'Delivery', group: 2, page: 'delivery/?f=delivery' },
      { key: 'cat-cultivation', label: 'Cultivation', group: 2, page: 'cultivation/' },
      { key: 'cat-manufacturing', label: 'Manufacture', group: 2, page: 'manufacturing/' },
      { key: 'cat-distribution', label: 'Distribution', group: 2, page: 'distribution/' },
      { key: 'cat-testing', label: 'Laboratory', group: 2, page: 'testing/' },
      { key: 'cat-microbusiness', label: 'Microbusiness', group: 2, page: 'microbusiness/' },
      { key: 'cat-events', label: 'Event Organizer', group: 2, needsData: 'licensed-events' },
      { key: 'listbiz', label: 'For businesses', group: 2, icon: 'plus', page: 'business/' },
      { key: 'help', label: 'Help', group: 3, page: 'help.html' },
      { key: 'about', label: 'About', group: 3, page: 'about.html' },
      { key: 'privacy', label: 'Privacy', group: 3, page: 'privacy.html' },
      { key: 'terms', label: 'Terms', group: 3, page: 'terms.html' },
      { key: 'report', label: 'Report an unlicensed seller', group: 3, report: true }
    ],
    NAV_GROUP_HEADINGS: { 2: 'Find My Weed Business' },
    navDrawerLabel: 'Menu',
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
    // license strip (cards + listing page): status and expiry from the listing's own fields; plain "not on file" when missing
    stripActive: 'Active license',
    stripSoon: 'Active license, ends soon',
    stripNoStatus: 'License status not on file',
    stripUntil: function (d) { return 'Expires ' + d; },
    stripNoExpiry: 'Expiry date not on file',
    stripNoNumber: 'License number not on file',
    // the short words for the directory CARD (one nowrap line, about 144 px on a 320 px phone); the full words above stay on the listing page
    stripCardActive: function (d) { return 'Active · exp ' + d; },
    stripCardSoon: function (d) { return 'Ends soon · ' + d; },
    stripCardActiveNoDate: 'Active · exp not on file',
    stripCardSoonNoDate: 'Ends soon · no date',
    stripCardNoStatus: 'Status not on file',
    licenseVerified: 'License checked against the state record',   // key name kept for stability; the text carries the green-check-plus-number rule (Joe/Muse home rules 2026-11-24)
    hours: 'Hours',
    address: 'Address',
    addressNone: 'Address not listed',
    addressNoStreet: 'Street address not listed',
    addressDeliveryNote: 'Delivery only: we show the city, not the street address.',
    addressDeliveryCountyNote: 'Delivery only: the state does not list a city or street address, so we show the county.',
    designationText: function (d) { return 'Licensed for ' + d; },
    contactTitle: 'Contact',
    callLabel: function (name) { return 'Call ' + name; },
    websiteLabel: function (name) { return 'Website for ' + name + ' (opens in a new tab)'; },
    call: 'Call',
    website: 'Website',
    directions: 'Directions',
    cardLicensed: 'Licensed',   // the card's license line: a check mark, this word, then the license number
    cardKindDelivery: 'Delivery',
    directionsLabel: function (name) { return 'Directions to ' + name + ' (opens a maps app)'; },
    addressCityNote: 'We show the city, not the street address.',   // no storefront on file and no delivery on file: the city only, with no claim about delivery
    menu: 'Menu',
    // This link leaves Find My Weed for the business's own site, which may take orders there (Find My Weed never does).
    // Review B/D (2026-11-21): the hand-off says the business checks ID and shows the age rule; Find My Weed claims no check.
    menuLink: 'View menu on their website',
    menuNote: 'Opens the business’s own site. The business checks ID there: 21+ (18+ medical where legal). Find My Weed does not check ID.',
    noMenu: 'No menu link yet.',
    claim: 'Claim this listing',
    acctUnclaimed: 'Unclaimed listing — info from public sources',
    acctClaim: 'Own this business? Claim it',
    acctSourceLicense: 'the state license record',
    acctContactDcc: function (date) { return 'From the state license record (DCC)' + (date ? ', ' + date : ''); },
    acctCorrect: 'Remove or correct this info',
    acctCorrectHref: function (license) { return 'mailto:info@keepitil.com?subject=' + encodeURIComponent('Remove or correct contact info (' + license + ')') + '&body=' + encodeURIComponent('License number: ' + license + '\n\nWhat should be removed or corrected:\n'); },
    acctSource: function (s) { return 'Source: ' + s; },
    claimNote: 'Own this business? Sign up and we will confirm you own it.',
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
      // the List-your-business page (for-business.html). Its own words are in js/biz-lead-copy.js.
      forbusiness: { title: 'List your licensed business · Find My Weed', description: 'Own a state-licensed cannabis storefront, delivery service or brand? Tell Find My Weed about your business and get listed.' },
      terms: { title: 'Terms · Find My Weed', description: 'The terms for using Find My Weed: licensed businesses only, how to report an unlicensed seller, and what Find My Weed is and is not.' },
      account: { title: 'Your account · Find My Weed', description: 'Your Find My Weed account: who is signed in, and sign out.' },
      strain: { title: 'Strain · Find My Weed', description: 'Facts about a cannabis strain: type, aroma and flavor words, and lineage when known. No effect or medical claims.' },
      help: { title: 'Help · Find My Weed', description: 'Short answers on how Find My Weed works, what a license means, how to report an unlicensed seller, accounts and contact.' },   // DRAFT for Muse; kept out of search results until Muse OKs it
      learn: { title: 'Learn · Find My Weed', description: 'Plain-language guides to licenses, lab results, age and ID rules, delivery and reporting, plus links to videos. No health claims.' },
      events: { title: 'Events · Find My Weed', description: 'A short, reviewed list of upcoming events, with the age rule for each. Cannabis is for adults 21+ (18+ medical where legal).' },
      imageAlt: 'Find My Weed: search state-licensed cannabis storefronts and delivery services',   // the real share image (launched)
      imageAltPlaceholder: 'Find My Weed placeholder share image'   // the draft's placeholder image
    },
    // Age notice (owner decision 2026-11-21: follow Weedmaps / Leafly): the directory is open to everyone, with
    // no entry wall; age is checked by the business at the point of sale. FMW has no ordering, so nothing here asks for an age.
    footer21: 'Cannabis is for adults 21+ (18+ medical where legal). Licensed businesses only. The business checks your ID.',
    footerNote: 'Find My Weed is a directory only: nothing is sold, reserved or delivered here. Check your local laws.',
    footerAbout: 'About',
    footerPrivacy: 'Privacy',
    footerTerms: 'Terms',
    footerHelp: 'Help',   // DRAFT for Muse
    // SB 378 (Bus. & Prof. Code 22943, cannabis marketplaces): a PUBLIC way to report an unlicensed seller, in the footer of
    // every page, no account needed. A plain mailto to info@keepitil.com (the support address): no form, no network call,
    // no database. The same href is written into each page so it works before (and without) JavaScript.
    footerReport: 'Report an unlicensed seller',
    // Homepage layout v2, rows 9-14: the licensed INDUSTRY categories (non-retail), from data/business-summary.json (counts) and data/business/<county>.json (the cards). County only, no address.
    industryTitle: 'Find My Weed Business',
    industryNoneYet: 'none listed yet',
    // the Find My Weed Business carousel card names (Joe 2026-11-27), name only; the ORDER is in js/pages.js
    industryCarousel: { car_services: 'Services', car_retail: 'Storefront', car_delivery: 'Delivery', car_cultivation: 'Cultivation', car_manufacturing: 'Manufacture', car_distribution: 'Distribution', car_testing: 'Laboratory', car_microbusiness: 'Microbusiness', car_eventorg: 'Event Organizer' },
    industryCat: { cultivation: 'Cultivation', manufacturing: 'Manufacturing', distribution: 'Distribution', testing: 'Testing laboratories', microbusiness: 'Microbusinesses', eventorg: 'Event organizers' },
    industryViewAll: 'View all',
    // The URL map (Joe 2026-11-26): /dispensaries/ and /delivery/ (list + map), /learn/, /brands/, /services/ (tools/county-pages.js writes them)
    topPage: {
      dispensaries: { title: 'Licensed dispensaries in California · Find My Weed', description: 'State-licensed cannabis storefronts across California on a map and in a list, each with its license number, status and expiry date. A directory only: nothing is sold here.', h1: 'Licensed dispensaries in California' },
      delivery: { title: 'Licensed delivery services in California · Find My Weed', description: 'State-licensed cannabis delivery services in California, each with its license number and status. The state lists the county only. A directory only: nothing is sold or delivered here.', h1: 'Licensed delivery services in California' },
      business: { title: 'For businesses · Find My Weed', description: 'Claim and manage your licensed business on Find My Weed for free: profile, hours, photos, menu or catalog, specials, inquiries and a small team.', h1: 'Find My Weed for businesses',
        p1: 'Every state-licensed business is already listed. Claim yours, add what people want to know, and keep it current. The account is free.', p2: 'Retail businesses manage a menu and specials; cultivators, makers, distributors, labs and event organizers get a wholesale catalog and a contact-for-wholesale form instead. Nothing is sold on Find My Weed.',
        stepsTitle: 'How it works', steps: ['Create a business account with your email.', 'Enter your license number and legal business name. We check it against the state record.', 'Our team approves the claim, and your dashboard opens.'],
        featuresTitle: 'What you can manage', features: ['Public profile: name, about, phone, website, social links, amenities', 'Weekly hours and holiday notes', 'Logo, hero and gallery photos', 'Menu (retail) or wholesale catalog (everyone else)', 'Specials (retail), events (organizers), COA files (labs)', 'Inquiries from people who find you, and a small team with roles'],
        ctaSignup: 'Create a business account', ctaSignin: 'Sign in', ctaDash: 'Open my dashboard', ctaLead: 'Or tell us about your business', note: 'Your license number is shown on every placement.' },
      brands: { title: 'Brands · Find My Weed', description: 'Cannabis brands on Find My Weed, with the public contact details each brand lists itself. A directory only.', h1: 'Brands', p1: 'Real cannabis brands, with the public details each one lists on its own site.', p2: 'Brand names belong to their owners. These pages use public information and do not mean a brand works with Find My Weed. Own a brand? Open its page and claim it.' },
      services: { title: 'Licensed cultivators, makers, distributors and labs in California · Find My Weed', description: 'State-licensed cannabis cultivation, manufacturing, distribution, testing and microbusiness licenses in California, by county, each with its license number and status. A directory only.', h1: 'Licensed businesses behind the product', p1: 'Beyond the shops: the state-licensed cultivators, manufacturers, distributors, testing laboratories and microbusinesses. Pick a category to see its counties.', line: function (cat, n) { return cat + ': ' + (n === 1 ? '1 licensed business' : n + ' licensed businesses'); } }
    },
    // The map page (map/, js/mapview.js): the Leafly-style layout. The sort offers only orders the data really supports.
    mapPage: { heading: 'FIND MY WEED', resultsRange: function (n) { return 'Results 1\u2013' + n; }, sortLabel: 'Sort', sortDefault: 'Nearest first', sortName: 'Name A to Z', filters: 'Filters',
      loadFailed: 'The map could not load. The list still works.', noPoints: 'No business here has a map point yet. The list shows every result.', popupClose: 'Close' },
    // Homepage v2 sections 2-7 (js/home.js): ads (real Prime ads from data/ads.json, else OUR house ads), product tiles, brands, the delivery and storefront carousels
    adSponsored: 'Sponsored', adHouse: 'Find My Weed',
    adGoTo: function (i, n) { return 'Show slide ' + i + ' of ' + n; },
    adPrimeLabel: function (county) { return 'Prime spots in ' + county; },
    adPrimeCta: function (county) { return 'Prime spot for ' + county; },
    adNonretailLabel: 'Licensed makers, growers and labs', adNonretailCta: 'Advertise your licensed business',
    productsTitle: 'Product category',
    productsNote: 'Product guides are on the way. For now, find a licensed storefront near you.',
    productName: { 'product-flower': 'Flower', 'product-pre-rolls': 'Pre-rolls', 'product-vapes': 'Vapes', 'product-edibles': 'Edibles', 'product-concentrates': 'Concentrates', 'product-topicals': 'Topicals', 'product-tinctures': 'Tinctures', 'product-accessories': 'Accessories' },
    featuredHeading: 'Featured',
    featuredSlot: function (cat, place) { return 'Featured spot for ' + cat + ' in ' + place; }, featuredClaim: 'Claim a featured spot',
    brandsTitle: 'Brands', brandHere: 'Your brand here',
    brandsCta: 'Brands are coming. Licensed makers and growers can claim a brand page.', brandsCtaLink: 'Claim a brand page',
    homeDeliveryTitle: function (county) { return 'Delivery in ' + county; },
    homeStorefrontTitle: function (county) { return 'Dispensaries in ' + county; },
    homeDeliveryNone: function (county) { return 'No licensed delivery services are listed in ' + county + ' yet.'; },
    homeStorefrontNone: function (county) { return 'No licensed storefronts are listed in ' + county + ' yet.'; },
    homeViewAllLabel: function (title) { return 'View all: ' + title; },
    // /<category>/ index pages (tools/county-pages.js): the counties that have rows, with their real counts
    licensedIndex: {
      h1: function (cat, total) { return cat + ': ' + (total === 1 ? '1 licensed business' : total + ' licensed businesses') + ' in California'; },
      title: function (cat, total) { return cat + ': ' + (total === 1 ? '1 licensed business' : total + ' licensed businesses') + ' by county · Find My Weed'; },
      description: function (cat, total, counties) { return (total === 1 ? 'A state-licensed' : total + ' state-licensed') + ' ' + String(cat).toLowerCase() + ' business' + (total === 1 ? '' : 'es') + ' in ' + counties + ' California ' + (counties === 1 ? 'county' : 'counties') + ', each with its license number and status. A directory only: nothing is sold here.'; },
      intro: 'Pick a county to see its licensed businesses in this category. The state lists the county only.',
      countyLine: function (county, n) { return county + ': ' + (n === 1 ? '1 licensed business' : n + ' licensed businesses'); }
    },
    industryViewAllLabel: function (cat, county) { return 'View all ' + cat + ' in ' + county; },
    // the /<category>/<county>/ pages (tools/county-pages.js)
    licensedPage: {
      h1: function (cat, n, c) { return cat + ': ' + (n === 1 ? '1 licensed business' : n + ' licensed businesses') + ' in ' + c; },
      title: function (cat, n, c) { return cat + ': ' + (n === 1 ? '1 licensed business' : n + ' licensed businesses') + ' in ' + c + ' · Find My Weed'; },
      description: function (cat, n, c) { return (n === 1 ? 'A state-licensed' : n + ' state-licensed') + ' ' + String(cat).toLowerCase() + ' business' + (n === 1 ? '' : 'es') + ' in ' + c + ', California, each with its license number, status and expiry date. The state lists the county only. A directory only: nothing is sold here.'; }
    },
    industryTile: function (n, county) { return n + ' in ' + county; },
    industryRowCount: function (n, county, shown) { return (n === 1 ? '1 licensed business' : n + ' licensed businesses') + ' in ' + county + (shown < n ? ' (showing ' + shown + ')' : ''); },
    industryNone: function (county, statewide) { return 'None listed in ' + county + ' yet. ' + statewide + ' statewide.'; },
    industryRowLabel: function (cat, county) { return cat + ' in ' + county; },
    // Grok 21:16 (condition for serving the business files): EVERY listing card and the listing page carry this link. It is a plain mailto to the same address the footer already uses.
    // Joe's Leafly-style card (2026-11-26): ONLY these rows. Real data only: no rating, deals or hours line unless the record really has them.
    cardOpen: 'Open', cardClosed: 'Closed', cardDelivery: 'Delivery', cardPickup: 'Pickup', cardRec: 'REC', cardMed: 'MED',
    cardRecLabel: 'Recreational (adult-use)', cardMedLabel: 'Medical',
    cardMiles: function (n) { return n < 1 ? '<1 mi' : n + ' mi'; },
    cardRating: function (avg, n) { return avg.toFixed(1) + ' \u2605 (' + n + ')'; },
    cardDeals: function (n) { return n === 1 ? '1 deal' : n + ' deals'; },
    cardRank: function (i) { return i + '. '; },
    footerReportNote: 'Opens an email to info@keepitil.com. No account needed.',
    // the footer's columns, app badges and copyright (tools/footer.js writes them into every page). Own words. Link targets are pages that exist; tests/footer.test.js resolves every one.
    // No store links: the Apple and Google apps are "Coming soon" text until the listings are live (no badge art, no URL). Social accounts come from site.json "social" only.
    FOOTER: {
      navLabel: 'Site', social: 'Follow Find My Weed', appsLabel: 'Apps',
      apple: 'Apple App', google: 'Google App', soon: 'Coming soon', web: 'WEB App', webNote: 'Open this site in your browser and save it to your Home Screen.',
      columns: [
        { h: 'Find', links: [{ t: 'Licensed businesses near you', p: 'index.html' }, { t: 'Dispensaries', p: 'dispensaries/' }, { t: 'Delivery', p: 'delivery/' }, { t: 'Brands', p: 'brands/' }] },
        // "Licensed" takes the Learn column's place for now: the Learn and Events pages are drafts, linked from nowhere (tests/learn.test.js, events.test.js). Learn returns when /learn/ is indexable.
        { h: 'Licensed', links: [{ t: 'Cultivation', p: 'cultivation/' }, { t: 'Manufacturing', p: 'manufacturing/' }, { t: 'Distribution', p: 'distribution/' }, { t: 'Testing labs', p: 'testing/' }, { t: 'Microbusinesses', p: 'microbusiness/' }, { t: 'All services', p: 'services/' }] },
        { h: 'Business', links: [{ biz: true }, { t: 'Claim your listing', p: 'for-business.html#biz-start' }] },   // biz: the existing List Your Business link (js/pages.js points it by the switches)
        { h: 'Company', links: [{ k: 'footerAbout', p: 'about.html' }, { k: 'footerHelp', p: 'help.html' }] },
        { h: 'Legal', links: [{ k: 'footerPrivacy', p: 'privacy.html' }, { k: 'footerTerms', p: 'terms.html' }] }
      ],
      copyright: '© Find My Weed'
    },
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
            'Hours, menu links and delivery details come from the business, not from the State. They can change; confirm with the business before you go.'] },
          { h: 'Help and contact', p: [
            'Questions, a correction, or a problem with a listing? Email info@keepitil.com.',
            'To report an unlicensed seller, use the "Report an unlicensed seller" link at the bottom of any page. It opens an email to the same address.'] }
        ]
      },
      // DRAFT FOR MUSE (2026-11-24): the Help FAQ. Every line is true of the live code today (search, license data, the report link, email-link sign-in, 30-day token, claims approved by the team).
      help: {
        title: 'Help',
        sections: [
          { h: 'How search works', p: [
            'Type a city, county or ZIP code in the search bar, or pick an area from the location list. The list and the map show the licensed businesses there.',
            'The filter chips under the search bar narrow the list, for example to storefronts or delivery. Hours come from the business, so check with it before you go.'] },
          { h: 'What "licensed" means', p: [
            'Every business here holds a state cannabis license, and its license number is on its listing. A business is listed only while its license is Active (or About to Expire) and has not expired.',
            'License details come from the California Department of Cannabis Control public license search. Each listing links to the official record so you can check it yourself.'] },
          { h: 'Report an unlicensed seller', p: [
            'Use the "Report an unlicensed seller" link at the bottom of any page. It opens an email to info@keepitil.com. Tell us the name of the seller and where you saw it.'] },
          { h: 'Accounts', p: [
            'You do not need an account to browse. A customer account is for saving your choices; a business account is for a licensed business that manages its listing.',
            'Signing in uses a link we email to you. There is no password. You stay signed in on this device for up to 30 days, or until you sign out.',
            'To sign out of this device, open the menu and choose Sign out.',
            'If you save listings, they are stored with your account and are visible only to you. On the account page, under Your data, you can download a copy of your account data and delete your account. If you cannot sign in, email info@keepitil.com from your account address and we will help.'] },
          { h: 'Claim your business', p: [
            'A licensed business can ask to manage its listing from the menu. Our team approves each request before anything changes on the listing.'] },
          { h: 'Contact', p: [
            'Questions, a correction or a problem with a listing? Email info@keepitil.com.'] }
        ]
      },
      privacy: {
        title: 'Privacy',
        sections: [
          { h: 'Accounts are optional; no ad tracking', p: [
            'You do not need an account to browse Find My Weed. We do not use advertising trackers.',
            'Find My Weed pages don\'t use analytics or tracking scripts.',   // Grok 2026-11-24 5:08 PM: exact wording; the page-view beacon is off
            'We don\'t keep your searches. Like any website, our host keeps short-lived server logs (IP address and page requested) for security.'] },
          // Accounts (sign-up live since 2026-11-22). Every line is true of js/signup.js, js/fmw-auth.js and
          // supabase/migrations/20261123010000_fmw_signup.sql; tests/privacy-accounts.test.js checks each against the code.
          // DRAFT for Echo's review (Joe/KODE 2026-11-25): the one outside service, on the map page only.
          { h: 'The map page', p: [
            'The map page shows a basemap from OpenFreeMap (tiles.openfreemap.org), a free map service. When you open it, your browser asks that service for the map pieces for the area on screen, so it can see your IP address and which area you are looking at.',
            'Find My Weed sends it nothing else: not your searches, your location or your account. No other page loads an outside service.'] },
          { h: 'If you create an account', p: [
            'Signing in uses a link we email to you. There is no password.',
            // PLACEHOLDER WORDING (Grok 2026-11-24): Muse words this line, Echo checks it. The facts are true of js/session-store.js.
            'When you sign in, a sign-in token is kept on this device so you stay signed in. It is removed when you sign out, and it ends 30 days after you sign in.',
            'Your account holds your email address and whether it is a customer or a business account. For 18 to 20 year olds with a medical recommendation, it also notes that the account is medical-only. It also keeps your light or dark choice if you make one. If you save listings, they are stored with your account and are visible only to you.',
            'Sign-up asks when you were born, to check eligibility. That check runs in your browser, and the answer is not stored.',
            'Business accounts: To check a license, we look it up in the state\'s public license records. We use the license number, the legal business name and the category you enter. When you are signed in, the result of that check is kept with your account, together with the license number.',
            'An approved business account can add a public phone number and website. They are shown on that business\'s listing, and they are removed when the business deletes its account.',
            'Accounts are stored in a hosted database that we run. Find My Weed keeps its own account records, separate from member profiles on our other sites. A login you made on one of our other sites can also sign in here.'] },
          // Business listing requests (the List your business form, js/biz-lead.js; stored by supabase W11_business_leads.DRAFT.sql once applied). tests/privacy-business-requests.test.js checks each line against the form and the table.
          { h: 'If you ask to list your business', p: [
            'The List your business form asks for your first and last name, business email, company, ZIP code and phone number, the type of business, your answer about an active license, an optional license number, and what you want to do on Find My Weed. We store what you send, and the time you agreed to this page.',
            'We use it only to answer your request and set up your listing. Only our team can read it. It is never shown on a listing, and we do not share it with advertisers.',
            'To have it deleted, email info@keepitil.com from the address you gave us.'] },
          { h: 'What we do not do', p: [
            'Find My Weed does not take reservations or requests for cannabis, and it takes no payment: no card details are collected here. Nothing is sold, reserved or delivered here.',
            'Each listing points you to the business itself. Anything you arrange, you arrange with the business, and the business checks your ID.'] },
          { h: 'Who sees your information, and deleting it', p: [
            'We do not sell your information and we do not share it with advertisers. Services that host and email the site process it only to run Find My Weed.',
            'If you report an unlicensed seller, we keep your email and what you wrote only to handle the report and to tell you the result.',   // DRAFT for Muse / Grok GO
            'You can download a copy of your account data, and delete your account and what is kept with it, from the account page under Your data. If you cannot sign in, email info@keepitil.com from the address on the account and we will do it for you.'] },
          { h: 'What stays on your device', p: [
            'Searching near you uses the city or ZIP you type. Your exact location is never sent to a server.',
            'If you choose Use my location, your browser asks first. Your location is used in your browser only, to sort the businesses nearest to you; it is not stored or sent anywhere.',
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
