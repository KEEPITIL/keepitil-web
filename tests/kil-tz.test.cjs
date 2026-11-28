const test = require('node:test'), assert = require('node:assert/strict');
const T = require('../assets/js/kil-tz.js');
test('wall time is read in the EVENT zone, whatever the machine zone is', () => {
  assert.equal(T.wallToISO('2027-03-05T20:00', 'America/New_York'), '2027-03-06T01:00:00.000Z');
  assert.equal(T.wallToISO('2027-03-05T20:00', 'America/Los_Angeles'), '2027-03-06T04:00:00.000Z');
  assert.equal(T.wallToISO('2027-07-04T20:00', 'America/Chicago'), '2027-07-05T01:00:00.000Z');
  assert.equal(T.wallToISO('2027-07-04T20:00', 'America/Phoenix'), '2027-07-05T03:00:00.000Z');
  assert.equal(T.wallToISO('2027-07-04T20:00', 'Pacific/Honolulu'), '2027-07-05T06:00:00.000Z');
});
test('round trip, daylight-saving edges, bad input', () => {
  for (const tz of ['America/New_York', 'America/Los_Angeles', 'America/Denver', 'America/Anchorage']) for (const v of ['2027-01-15T09:30', '2027-06-15T23:45', '2027-11-07T12:00', '2027-03-14T12:00'])
    assert.equal(T.isoToWall(T.wallToISO(v, tz), tz), v, tz + ' ' + v);
  assert.equal(T.wallToISO('2027-03-14T02:30', 'America/New_York'), '2027-03-14T07:30:00.000Z', 'a time inside the spring-forward gap moves forward, never throws');
  assert.equal(T.wallToISO('2027-11-07T01:30', 'America/New_York'), '2027-11-07T05:30:00.000Z', 'an ambiguous fall-back time takes the first');
  assert.equal(T.wallToISO('', 'America/New_York'), null); assert.equal(T.wallToISO('2027-01-01T10:00', 'Mars/Base'), null); assert.equal(T.isoToWall('nope', 'America/New_York'), '');
});
test('default zone: known city, comma suffix, unknown city falls back to a supported device zone, else Pacific', () => {
  assert.equal(T.defaultTz('New York', 'America/Los_Angeles'), 'America/New_York'); assert.equal(T.defaultTz(' Chicago, IL ', 'x'), 'America/Chicago');
  assert.equal(T.defaultTz('Smalltown', 'America/Denver'), 'America/Denver'); assert.equal(T.defaultTz('Smalltown', 'Europe/Paris'), 'America/Los_Angeles'); assert.equal(T.defaultTz('', undefined), 'America/Los_Angeles');
});
test('create-event.html wires the select and never reads a form time in the browser zone', () => {
  const s = require('fs').readFileSync(require('path').join(__dirname, '..', 'create-event.html'), 'utf8');
  assert.match(s, /<select id="tz"/); assert.doesNotMatch(s, /Pacific Time · America\/Los_Angeles/);
  assert.doesNotMatch(s, /new Date\(\$\('starts_at'\)\.value\)/); assert.doesNotMatch(s, /new Date\(\$\('ends_at'\)\.value\)/); assert.doesNotMatch(s, /new Date\(sv\)|new Date\(ev2\)|new Date\(inp\.value\)/);
  assert.match(s, /kil_set_my_event_tz/); assert.match(s, /kil-tz\.js/);
});
