// Words for the sign-up page (signup.html). DRAFT copy: the final wording replaces it here, in one place.
// Three separate sets, so the two audiences never see each other's material (tests/signup.test.js checks it):
//   shared   - the first choice, the age check, the email and theme steps, "coming soon". Neutral: no pricing, no pitch.
//   customer - sign up / sign in basics ONLY. No business pricing or pitch, ever.
//   business - license first: before a VERIFIED license pass no plans, prices, county ladder or comparison are shown; the
//              category prices, Sponsored county placement and the next steps unlock only after it (not wired yet).
// Pricing is DISPLAY ONLY and shows only AFTER a verified license pass (no payment UI; the payment link goes out by email after
// a screening call). Category prices, the standard annual and the county ladder follow the 2026-11-21 business spec; the monthly
// and ladder figures match the live for-business page (source pinned in tests/signup.test.js).
(function (root) {
  var COPY = {
    shared: {
      offTitle: 'Accounts are coming soon',
      offBody: 'Find My Weed accounts are not open yet. You can keep browsing licensed businesses without an account.',
      backToSearch: 'Back to search',
      accountLink: 'Your account',
      chooseTitle: 'Sign in or create an account',
      chooseIntro: 'First, which kind of account is it?',
      chooseCustomer: 'Customer',
      chooseCustomerHint: 'I want to find licensed businesses.',
      chooseBusiness: 'Business',
      chooseBusinessHint: 'I run a licensed cannabis business.',
      step: function (n, total) { return 'Step ' + n + ' of ' + total; },
      back: 'Back',
      next: 'Continue',
      dobLabel: 'Date of birth',
      dobHint: 'We use it only to check that you can have an account. Nothing is saved.',
      dobMissing: 'Enter your date of birth.',
      dobInvalid: 'That date of birth doesn’t look right. Check it and try again.',
      under18Title: 'You must be 18 or older',
      under18Body: 'Find My Weed accounts are for adults. Nothing you entered was saved. You can still browse licensed businesses without an account.',
      emailLabel: 'Email address',
      emailHint: 'We email you a sign-in link. Find My Weed never asks for a password.',
      emailBad: 'Enter an email address like name@example.com.',
      sendLink: 'Email me a sign-in link',
      themeTitle: 'Pick your look',
      themeIntro: 'Last step: light or dark. You can change it any time.',
      themeLegend: 'Theme',
      themeLight: 'Light',
      themeDark: 'Dark',
      finish: 'Finish',
      soonTitle: 'Accounts are coming soon',
      soonBody: 'Thanks for trying. Accounts are not open yet, so nothing was sent and nothing you entered was saved.',
      // with the back end (site.json authProject): the sign-in link was sent
      sentTitle: 'Check your email',
      sentBody: 'We sent you a sign-in link. Open it on this device to finish. Your date of birth was not saved.',
      soonTheme: 'Your light or dark choice is kept in this browser only.',
      // a refused or failed sign-in link request (rate limit, network): stay on the email step and say so
      sendFailed: 'We could not send the sign-in link just now. Wait a minute and try again.',
      // back from the emailed link
      inTitle: 'You’re signed in',
      inBody: 'Your email is confirmed and your Find My Weed account is open. Browsing licensed businesses needs no sign-in.',
      inBodyBusiness: 'Your email is confirmed and your business account is open. We email you next to book the short screening call.',
      linkBadTitle: 'That sign-in link has expired',
      linkBadBody: 'Sign-in links work once and only for a short time. Ask for a new one and open it on this device.',
      linkAgain: 'Email me a new link'
    },
    customer: {
      startTitle: 'Your account',
      startIntro: 'Create an account, or sign in if you already have one.',
      create: 'Create an account',
      signIn: 'Sign in',
      eligTitle: 'Check you can have an account',
      eligRule: 'Accounts are for adults 21 and older. If you are 18 to 20, you need a valid medical cannabis recommendation or medical ID card, and your account shows medical listings and content only.',
      medicalLabel: 'I have a valid medical cannabis recommendation or medical ID card.',
      needMedical: 'At 18 to 20 you need a valid medical cannabis recommendation or medical ID card. Without one, you can have an account once you turn 21.',
      medicalOnly: 'Medical account: you will see medical listings and medical content only.',
      emailTitle: 'Your email',
      signInTitle: 'Sign in'
    },
    business: {
      // BEFORE a verified license pass: no plans, no prices, no county ladder, no comparison. License first.
      startTitle: 'List your business',
      startIntro: 'First we verify your state cannabis license. Plans open only after your license checks out.',
      howTitle: 'How it works',
      how: ['Confirm you are 21 or older.', 'Tell us about your license.', 'We verify it against the state record.', 'Once it checks out, you pick your category and we follow up by email.'],
      create: 'Start with my license',
      signIn: 'Business sign in',
      eligTitle: 'Confirm your age',
      eligRule: 'Business accounts are for people 21 and older.',
      under21Title: 'Business accounts are 21+',
      under21Body: 'Business accounts are for people 21 and older. Nothing you entered was saved.',
      licenseTitle: 'Your license',
      licenseIntro: 'Enter the details exactly as they appear on your state license.',
      legalName: 'Legal business name',
      licenseNumber: 'License number',
      licenseNumberHint: 'Like C10-0000123-LIC.',
      licenseType: 'License type',
      licenseTypes: ['Retailer (storefront)', 'Retailer, non-storefront (delivery)', 'Microbusiness', 'Manufacturer', 'Distributor', 'Cultivator', 'Testing laboratory', 'Event organizer'],
      licenseState: 'State',
      licenseStates: ['California'],
      contactName: 'Your name',
      contactRole: 'Your role at the business',
      contactPhone: 'Business phone (optional)',
      pick: 'Choose one',
      verify: 'Verify my license',
      errLegalName: 'Enter the legal business name.',
      errLicense: 'Enter the license number like C10-0000123-LIC.',
      errType: 'Choose the license type.',
      errState: 'Choose the state.',
      errContact: 'Enter your name and your role.',
      errPhone: 'Enter a 10-digit phone number, or leave it empty.',
      pendingTitle: 'License verification is coming soon',
      pendingBody: 'We can\u2019t verify licenses online yet, so nothing was sent and nothing you entered was saved. Plans open only after a license is verified.',
      flaggedTitle: 'We need to check your license by hand',
      flaggedBody: 'Our team reviews it and emails you. Plans are not shown until your license is verified.',
      // AFTER a verified license pass only (the verification is not wired yet, so a visitor cannot reach these today).
      // Prices are display only: nothing is charged here.
      categoryTitle: 'Pick your category',
      categoryIntro: 'Your license is verified. Your price is set by your category: two tiers, Retail and Standard.',
      // Owner ruling 2026-11-21 16:46 PT: TWO tiers. Retail (storefront + delivery) is the top tier: $50/mo or $500/yr. Standard
      // (every other category): $10/mo or $100/yr. Each annual price belongs to its own tier; no blended annual price.
      categories: [
        { id: 'retail', name: 'Retail storefront', tier: 'retail', price: '$50/mo or $500/yr' }, { id: 'delivery', name: 'Delivery', tier: 'retail', price: '$50/mo or $500/yr' },
        { id: 'brand', name: 'Brand', tier: 'standard', price: '$10/mo or $100/yr' }, { id: 'manufacturer', name: 'Manufacturer', tier: 'standard', price: '$10/mo or $100/yr' },
        { id: 'distributor', name: 'Distributor', tier: 'standard', price: '$10/mo or $100/yr' }, { id: 'cultivator', name: 'Cultivator', tier: 'standard', price: '$10/mo or $100/yr' },
        { id: 'lab', name: 'Testing Lab', tier: 'standard', price: '$10/mo or $100/yr' }, { id: 'microbusiness', name: 'Microbusiness', tier: 'standard', price: '$10/mo or $100/yr' },
        { id: 'services', name: 'Services', tier: 'standard', price: '$10/mo or $100/yr' }, { id: 'venue', name: 'Venue', tier: 'standard', price: '$10/mo or $100/yr' }
      ],
      annual: 'Retail tier: $50/mo or $500/yr. Standard tier: $10/mo or $100/yr.',
      sponsoredTitle: 'Sponsored county placement',
      sponsoredIntro: 'Optional, a flat monthly fee per county, per category, by rank. Labelled Sponsored wherever it shows; live licenses only.',
      ranks: ['1st: $500/mo', '2nd: $400/mo', '3rd: $300/mo', '4th: $200/mo', '5th: $100/mo'],
      errCategory: 'Choose your category.',
      detailsTitle: 'Contacts and services',
      detailsIntro: 'Who should we talk to, and what are you interested in?',
      contactEmailLabel: 'Second contact email (optional)',
      servicesLegend: 'Services you are interested in',
      services: ['Sponsored county placement', 'Menu rotation on email and social', 'Monthly recap call', 'Other marketing services'],
      nextTitle: 'What happens next',
      nextSteps: ['We email you first.', 'We book a short screening call.', 'We send your payment link by email.'],
      nextNote: 'Nothing is charged on this page.',
      refund: 'If your license check fails after you pay, we refund you in full.',
      emailTitle: 'Your business email',
      signInTitle: 'Business sign in'
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = COPY; else root.FMW_SIGNUP_COPY = COPY;
})(typeof window !== 'undefined' ? window : globalThis);
