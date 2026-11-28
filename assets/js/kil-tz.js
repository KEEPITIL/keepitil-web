/* Event time zones for the create/edit form. The organizer's <input type=datetime-local> holds a wall-clock time with no zone; it must be read in the EVENT's zone,
   not the browser's. Pure helpers, no DOM; used by create-event.html and tests/kil-tz.test.cjs. */
(function (root) {
  var ZONES = [
    ['America/New_York', 'Eastern Time'], ['America/Chicago', 'Central Time'], ['America/Denver', 'Mountain Time'],
    ['America/Phoenix', 'Arizona (no daylight time)'], ['America/Los_Angeles', 'Pacific Time'], ['America/Anchorage', 'Alaska Time'], ['Pacific/Honolulu', 'Hawaii Time']
  ];
  var CITY = { 'miami': 'America/New_York', 'tampa': 'America/New_York', 'austin': 'America/Chicago', 'boston': 'America/New_York', 'dallas': 'America/Chicago', 'denver': 'America/Denver',
    'anaheim': 'America/Los_Angeles', 'atlanta': 'America/New_York', 'chicago': 'America/Chicago', 'detroit': 'America/New_York', 'houston': 'America/Chicago', 'oakland': 'America/Los_Angeles',
    'orlando': 'America/New_York', 'phoenix': 'America/Phoenix', 'tempe': 'America/Phoenix', 'seattle': 'America/Los_Angeles', 'brooklyn': 'America/New_York', 'columbus': 'America/New_York',
    'new york': 'America/New_York', 'portland': 'America/Los_Angeles', 'san jose': 'America/Los_Angeles', 'baltimore': 'America/New_York', 'charlotte': 'America/New_York',
    'las vegas': 'America/Los_Angeles', 'nashville': 'America/Chicago', 'san diego': 'America/Los_Angeles', 'santa ana': 'America/Los_Angeles', 'st. louis': 'America/Chicago',
    'long beach': 'America/Los_Angeles', 'pittsburgh': 'America/New_York', 'sacramento': 'America/Los_Angeles', 'washington': 'America/New_York', 'kansas city': 'America/Chicago',
    'los angeles': 'America/Los_Angeles', 'minneapolis': 'America/Chicago', 'new orleans': 'America/Chicago', 'san antonio': 'America/Chicago', 'philadelphia': 'America/New_York',
    'san francisco': 'America/Los_Angeles', 'indio': 'America/Los_Angeles', 'st. petersburg': 'America/New_York' };
  function known(tz) { for (var i = 0; i < ZONES.length; i++) if (ZONES[i][0] === tz) return true; return false; }
  /* default zone: the city's zone when we know it, else the device zone when it is one of ours, else Pacific */
  function defaultTz(city, deviceTz) {
    var c = CITY[String(city || '').trim().toLowerCase().replace(/,.*$/, '')];
    if (c) return c;
    return known(deviceTz) ? deviceTz : 'America/Los_Angeles';
  }
  /* wall-clock fields of an instant in a zone, as a UTC-epoch number */
  function wallMs(ms, tz) {
    var f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    var o = {}; f.formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; });
    return Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour % 24, +o.minute, +o.second);
  }
  /* '2027-03-05T20:00' read in tz -> ISO instant. A time that does not exist (spring-forward gap) moves forward; an ambiguous one (fall back) takes the first. */
  function wallToISO(v, tz) {
    var m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(String(v || '')); if (!m || !known(tz)) return null;
    var want = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]), DAY = 864e5;
    var o1 = wallMs(want - DAY, tz) - (want - DAY), o2 = wallMs(want + DAY, tz) - (want + DAY);   // the zone's offset the day before and the day after
    var c = [want - o1, want - o2].sort(function (x, y) { return x - y; });
    for (var i = 0; i < c.length; i++) if (wallMs(c[i], tz) === want) return new Date(c[i]).toISOString();   // exists (ambiguous: the first)
    return new Date(c[c.length - 1]).toISOString();   // inside the spring-forward gap: the later reading
  }
  /* ISO instant -> 'YYYY-MM-DDTHH:mm' wall clock in tz (what a datetime-local input wants) */
  function isoToWall(iso, tz) {
    var t = Date.parse(iso); if (isNaN(t) || !known(tz)) return '';
    return new Date(wallMs(t, tz)).toISOString().slice(0, 16);
  }
  var api = { ZONES: ZONES, known: known, defaultTz: defaultTz, wallToISO: wallToISO, isoToWall: isoToWall };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KilTz = api;
})(typeof window !== 'undefined' ? window : this);
