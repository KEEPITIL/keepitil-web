// Every visible word of the "List your licensed business" page (for-business.html), in our own words. js/biz-lead.js draws them with textContent only.
// No testimonials, no logos, no statistics, no prices, no "verified" wording, no person's name. tests/biz-lead.test.js checks these rules.
(function (root) {
  var C = {
    hero: {
      title: 'List your licensed business on Find My Weed',
      body: 'People look here for state-licensed cannabis businesses near them. Tell us about yours and we will help you get listed.',
      cta: 'Get started',
      art: 'Find My Weed'
    },
    pick: {
      title: 'I am a...',
      hint: 'Pick the closest one. You can change it in the form.',
      tiles: [
        { id: 'storefront', label: 'Storefront', body: 'A shop customers walk into.', icon: 'M4 10l1.5-5h13L20 10M5 10v9h14v-9M9 19v-5h6v5' },
        { id: 'delivery', label: 'Delivery service', body: 'We bring orders to the door.', icon: 'M3 7h11v9H3zM14 10h4l3 3v3h-7M7.5 18.5a1.5 1.5 0 1 0 0-.01M17.5 18.5a1.5 1.5 0 1 0 0-.01' },
        { id: 'brand', label: 'Brand or other licensed business', body: 'Cultivation, manufacturing, distribution, labs, events and more.', icon: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5' }
      ]
    },
    form: {
      title: 'Tell us about your business',
      required: 'Fields marked * are required.',
      first: 'First name', last: 'Last name', email: 'Business email', company: 'Company', zip: 'ZIP code', phone: 'Phone',
      type: 'Type of business', typePick: 'Choose one',
      license: 'California DCC license number', licenseHint: 'Optional. Looks like C10-0000123-LIC.',
      active: 'Do you have an active license?',
      goal: 'What do you want to do on Find My Weed?', goalHint: 'For example: list my shop, show my menu link, promote my brand.',
      consentPre: 'I agree to the ', privacy: 'Privacy policy', consentPost: '.',
      consentLine: 'We use what you send only to answer this request and to set up your listing. We do not sell it or share it with advertisers. You can ask us to delete it any time at info@keepitil.com.',
      submit: 'Send request', sending: 'Sending...', hpLabel: 'Leave this field empty'
    },
    types: [
      { id: 'storefront', label: 'Storefront' }, { id: 'delivery', label: 'Delivery only' }, { id: 'cultivation', label: 'Cultivation' },
      { id: 'manufacturing', label: 'Manufacturing' }, { id: 'distribution', label: 'Distribution' }, { id: 'microbusiness', label: 'Microbusiness' },
      { id: 'lab', label: 'Testing lab' }, { id: 'event', label: 'Event organizer' }, { id: 'brand', label: 'Brand' }, { id: 'other', label: 'Other' }
    ],
    active: [
      { id: 'yes-number', label: 'Yes, I have the number' }, { id: 'yes-no-number', label: 'Yes, but I do not have it on hand' },
      { id: 'not-yet', label: 'Not yet' }, { id: 'no', label: 'No' }
    ],
    lookup: {
      found: function (name, county) { return 'We found ' + name + ', ' + county + ' County.'; },
      confirm: 'Yes, that is my business',
      notMine: 'No, that is not mine',
      notFound: 'We could not find that number in our listings. You can still send your request.',
      typeNote: 'This number does not usually belong to the type you picked. Check the number or the type.'
    },
    errors: {
      required: 'This is required.', email: 'Enter an email like name@example.com.', zip: 'Enter a 5-digit California ZIP code.',
      phone: 'Enter a 10-digit US phone number.',
      phoneNanp: 'That is not a working US number. The area code and the next three digits each need to start with 2–9, and 555-0100 numbers are reserved.',
      license: 'Use the format on your license, like C10-0000123-LIC.',
      ticketFast: 'Please wait a few seconds, then try again. Nothing was sent yet.',
      ticketExpired: 'This form was open too long, so it was not sent. Please try again.',
      licenseNeeded: 'Add your license number, or pick another answer.', consent: 'Please agree to the Privacy policy to continue.',
      summary: 'Please fix the fields marked below.', failed: 'We could not send that. Please try again, or email info@keepitil.com.'
    },
    done: {
      title: 'Thanks, we got your request',
      body: 'We read every request and reply to the business email you gave us, in the order they arrive.',
      next: 'Want to start your business account now?', cta: 'Create a business account', home: 'Back to search'
    },
    soon: {
      title: 'Business sign-up is opening soon',
      body: 'The form is not open yet. Email us about your business and we will write back.',
      mail: 'Email info@keepitil.com',
      mailto: 'mailto:info@keepitil.com?subject=List%20my%20business%20on%20Find%20My%20Weed&body=Business%20name%3A%0A%0AType%20of%20business%3A%0A%0ALicense%20number%20(optional)%3A%0A%0AWhat%20I%20would%20like%20to%20do%3A%0A',
      account: 'Create a business account'
    },
    faq: {
      title: 'Questions',
      items: [
        { q: 'Why list my business here?', a: 'Find My Weed shows only state-licensed businesses, and every listing carries its license number. People who want a licensed shop, delivery service or brand can find you by place and by what you offer.' },
        { q: 'What does it cost?', a: 'Claiming your listing and keeping its basics up to date costs nothing. If you later want a featured spot, it is billed by invoice. We never ask for a card on this site.' },
        { q: 'How do I edit my listing?', a: 'After we approve your business account, you sign in and update your listing\'s contact details yourself. Your license number and address come from the state record and are not edited here.' },
        { q: 'Do I need a license to be listed?', a: 'Yes. Listings are for businesses that hold an active California license. If you are applying for one, send your request and tell us where you are in the process.' },
        { q: 'What do you do with my information?', a: 'We use it to answer your request and set up your listing. We do not sell it. The Privacy policy has the details.' }
      ]
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = C; else root.FMW_BIZ_COPY = C;
})(typeof window !== 'undefined' ? window : globalThis);
