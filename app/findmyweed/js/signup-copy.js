// Words for the sign-up page (signup.html). DRAFT copy: the final wording replaces it here, in one place.
// Three separate sets, so the two audiences never see each other's material (tests/signup.test.js checks it):
//   shared   - the first choice, the age check, the email and theme steps, "coming soon". Neutral: no pricing, no pitch.
//   customer - sign up / sign in basics ONLY. No business pricing or pitch, ever.
//   business - license first: no plans, prices, county ladder or comparison in the public flow at all; after a verified
//              license and a confirmed email the SERVER answers with the pricing.
// NO PRICES and NO PAYMENT LINKS in this file (owner 2026-11-22: "keep it public to verified business owners only"). They come
// only from the server, to a signed-in business with a confirmed email and a verified license (js/fmw-auth.js pricing()).
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
      chooseOrganizer: 'Organizer',
      chooseOrganizerHint: 'I run licensed cannabis events.',
      step: function (n, total) { return total ? 'Step ' + n + ' of ' + total : 'Step ' + n; },
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
      inBodyBusiness: 'Your email is confirmed and your business account is open.',
      linkBadTitle: 'That sign-in link has expired',
      linkBadBody: 'Sign-in links work once and only for a short time. Ask for a new one and open it on this device.',
      linkAgain: 'Email me a new link'
    },
    organizer: {
      // an EVENT ORGANIZER account: the business path, for the Event organizer license only (same check order: 21+, license, then the sign-in link)
      startTitle: 'Create your organizer account',
      startIntro: 'For licensed event organizers. First we check your state event organizer license. Then we email you a sign-in link. It is free.',
      how: ['Confirm you are 21 or older.', 'Tell us about your event organizer license.', 'We check it against the state record.', 'Once it checks out, confirm your email and set up your events.'],
      create: 'Start with my license',
      signIn: 'Organizer sign in',
      organizerType: 'Event organizer',
      licenseNumberHint: 'Like C6-0000123-LIC.',
      errOrganizerLicense: 'Organizer accounts are for event organizer licenses. Enter your license number like C6-0000123-LIC.'
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
      startIntro: 'First we check your state cannabis license. Then we email you a sign-in link. Listing is free, for licensed businesses only.',
      howTitle: 'How it works',
      how: ['Confirm you are 21 or older.', 'Tell us about your license.', 'We check it against the state record.', 'Once it checks out, confirm your email and your pricing shows.'],
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
      licenseType: 'Business type',
      licenseTypes: ['Retailer (storefront)', 'Retailer, non-storefront (delivery)', 'Microbusiness', 'Manufacturer', 'Distributor', 'Cultivator', 'Testing laboratory', 'Event organizer'],
      licenseState: 'State',
      licenseStates: ['California'],
      secContact: 'Contact',
      secBusiness: 'Business',
      secLicense: 'License',
      pick: 'Choose one',
      verify: 'Check my license',
      errLegalName: 'Enter the legal business name.',
      errLicense: 'Enter the license number like C10-0000123-LIC.',
      errType: 'Choose the license type.',
      errState: 'Choose the state.',
      checkFailed: 'We could not check that license just now. Check your connection and try again.',
      pendingTitle: 'License checks are coming soon',
      pendingBody: 'We can\u2019t check licenses online yet, so nothing was sent and nothing you entered was saved. Pricing shows only after a license is checked.',
      flaggedTitle: 'We need to check your license by hand',
      flaggedBody: 'Our team reviews it and emails you. Pricing is not shown until your license is checked.',
      // AFTER a verified license pass (anonymous check): no prices yet. Prices and payment links come ONLY from the server
      // (fmw.business_pricing, migration 20261123030000) once the emailed link has signed the business in with a confirmed
      // email AND the license check is recorded as verified for that account. No price or payment link is in this file.
      verifiedNote: 'License checked. Confirm your email, then we\'ll confirm you own this business.',
      sentBusiness: 'Open the link on this device. Your pricing shows once your email is confirmed.',
      pricingLoading: 'Checking your license and email\u2026',
      pricingTitle: 'Your pricing',
      pricingIntro: 'Your license is checked and your email is confirmed. Pick a plan to start.',
      pricingPay: 'Each button opens a secure checkout page. Questions before you start?',
      contact: 'Contact us',
      contactHref: 'mailto:info@keepitil.com?subject=Find%20My%20Weed%20business%20listing',   // the support address the footer and the business form already use: a plain mailto, no form, no network
      pricingLockedTitle: 'We need to check your license by hand',
      pricingLockedBody: 'We could not confirm a checked license for this account yet. Our team reviews it and emails you. Pricing shows once your license is checked.',
      // verified license + confirmed email, but the team has not confirmed the claim yet (fmw.business_pricing reason 'approval'): not "check your license by hand" (it IS checked); the same words as the account page
      pricingApprovalTitle: 'We\'ll confirm you own this business',
      pricingApprovalBody: 'Your license checked out. Pricing shows once our team has confirmed the claim. We email you.',
      pricingErrorTitle: 'We could not load your pricing',
      pricingErrorBody: 'Something went wrong on our side. Try the sign-in link again in a minute, or contact us.',
      nextTitle: 'What happens next',
      nextSteps: ['Open the sign-in link we emailed you.', 'Your pricing shows once your email is confirmed.'],
      emailTitle: 'Your business email',
      signInTitle: 'Business sign in'
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = COPY; else root.FMW_SIGNUP_COPY = COPY;
})(typeof window !== 'undefined' ? window : globalThis);
