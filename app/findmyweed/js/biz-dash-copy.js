// Copy for the business dashboard tabs added after the first dashboard (Stats now, Reviews next). Kept in its own file so it can ship without touching js/copy.js; it hangs off the same
// FMW_COPY object (C.bizDash.<tab>) and needs js/copy.js loaded first. Plain text only. Nothing here promises a result or names a competitor.
(function (root) {
  var C = root.FMW_COPY = root.FMW_COPY || {};
  C.bizDash = C.bizDash || {};
  C.bizDash.stats = {
    tab: 'Stats',
    title: 'How people found your page',
    note: 'First-party counts from Find My Weed only. No names, no cookies. A visitor who reloads many times in a minute is counted a limited number of times.',
    range: function (n) { return 'Last ' + n + ' days'; },
    rangeLabel: 'Time range',
    ranges: [7, 30, 90],
    views: 'Page views', website: 'Website clicks', phone: 'Phone clicks', directions: 'Directions clicks', inquiries: 'Inquiries',
    perDay: 'By day',
    dayRow: function (day, n) { return day + ': ' + n; },
    none: 'Nothing recorded in this range yet.',
    loading: 'Loading your stats…',
    error: 'Could not load your stats right now. Try again in a moment.',
    retry: 'Try again'
  };
  C.bizDash.csv = {
    tab: 'CSV import',
    title: 'Import your menu from a CSV file',
    note: 'One row per item. Columns we read: title, category, description, brand, strain_type, thc, cbd, size, price, in_stock, moq, lead_time. We check the file first and write nothing until you confirm. If any row has a problem nothing is imported.',
    limits: 'Up to 500 KB, 250 rows, and 5 imports a day.',
    choose: 'Choose a CSV file', checkBtn: 'Check the file', importBtn: function (n) { return 'Import ' + n + (n === 1 ? ' row' : ' rows'); },
    read: function (n, cols) { return n + (n === 1 ? ' row' : ' rows') + ' read. Columns used: ' + cols + '.'; },
    ignored: function (cols) { return 'Ignored columns: ' + cols + '.'; },
    tooBig: 'That file is over 500 KB.', tooMany: 'That file has more than 250 rows. Split it and import in parts.', empty: 'No rows found. The first line must be the column names.', noTitle: 'The file needs a title column.',
    checking: 'Checking…', checkedOk: function (n) { return 'All ' + n + ' rows look good. Nothing has been imported yet.'; },
    problems: function (bad, n) { return bad + ' of ' + n + ' rows have a problem. Nothing was imported. Fix the rows below and check again.'; },
    rowErr: function (row, msg) { return 'Row ' + row + ': ' + msg; },
    importing: 'Importing…', done: function (n) { return 'Imported ' + n + (n === 1 ? ' row.' : ' rows.'); },
    fail: 'Could not complete that. Try again in a moment.', limit: 'You have reached the limit of 5 imports today. Try again tomorrow.', unavailable: 'CSV import is not available for this license.'
  };
  C.bizDash.keys = {
    tab: 'API keys',
    title: 'API keys',
    note: 'A key lets your own software update your menu or hours. Anyone with the key can do what its scopes allow, so keep it private. You can have up to 3 active keys. We show a key once and store only a fingerprint of it.',
    scopeLabel: { 'catalog:read': 'Read the menu', 'catalog:write': 'Change the menu', 'hours:write': 'Change the hours' },
    scopesLegend: 'What this key may do', nameLabel: 'Name for this key (for example, Menu sync)', create: 'Create key',
    secretHead: 'Copy this key now: it is not shown again.', copy: 'Copy', copied: 'Copied.', copyFail: 'Select the key and copy it by hand.',
    listHead: 'Your keys', none: 'No keys yet.', revoke: 'Revoke', revokeSure: 'Really revoke?', revoked: 'Revoked',
    row: function (name, prefix, scopes) { return name + ' · ' + prefix + '… · ' + scopes; },
    created: function (d) { return 'Created ' + d; }, used: function (d) { return d ? 'Last used ' + d : 'Never used'; },
    max: 'You already have 3 active keys. Revoke one first.', fail: 'Could not complete that. Try again in a moment.', needName: 'Give the key a name and pick at least one thing it may do.',
    loading: 'Loading keys…', error: 'Could not load your keys right now. Try again in a moment.', retry: 'Try again'
  };
  C.bizDash.reviews = {
    tab: 'Reviews',
    title: 'Reviews from customers',
    note: 'Only approved reviews from signed-in Find My Weed customers appear here. Staff check each one before it is published. You can reply once to each review.',
    summary: function (n, avg) { return avg == null ? 'No reviews yet' : n + (n === 1 ? ' review' : ' reviews') + ' · average ' + avg + ' out of 5'; },
    rating: function (n) { return 'Rating: ' + n + ' out of 5'; },
    replyHead: 'Your reply', replyLabel: 'Write a reply (up to 1000 characters)', replySend: 'Post reply', replyEdit: 'Edit reply', replySaved: 'Reply saved.', replyFail: 'Could not save the reply. Try again.',
    none: 'No reviews yet. Reviews appear here after staff approve them.',
    loading: 'Loading reviews…', error: 'Could not load reviews right now. Try again in a moment.', retry: 'Try again', viewerNote: 'Only an owner or manager can reply.'
  };
  C.bizDash.placements = {
    tab: 'Placements',
    title: 'Your placements and invoices',
    note: 'PRIME and Featured spots are sold by invoice and switched on by our team. Nothing is bought or paid on this site, and no card is ever asked for here.',
    placementsTitle: 'Placements',
    invoicesTitle: 'Invoices',
    slot: function (n) { return 'slot ' + n; },
    placementsNone: 'You have no PRIME or Featured placement.',
    invoicesNone: 'No invoices yet.',
    loading: 'Loading…',
    error: 'Could not load this right now. Try again in a moment.'
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = C.bizDash;
})(typeof window !== 'undefined' ? window : globalThis);
