import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { join } from 'node:path';

const root = new URL('../..', import.meta.url);
const require = createRequire(import.meta.url);

function read(rel) {
  return readFileSync(new URL(rel, root), 'utf8');
}

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'vendor' || name === 'app' || name === 'games' || name === 'canvaskit') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(html|js|mjs)$/.test(name) && !name.endsWith('.dart.js') && !name.endsWith('.test.mjs')) out.push(path);
  }
  return out;
}

function messageListeners(html) {
  return html.match(/addEventListener\(\s*['"]message['"][\s\S]*?\}\s*\)\s*;/g) || [];
}

function repliesFrom(html, event) {
  const replies = [];
  const listeners = [];
  const window = {
    addEventListener(type, fn) {
      if (type === 'message') listeners.push(fn);
    }
  };
  const source = {
    postMessage(payload, target) {
      replies.push({ payload, target });
    }
  };
  for (const stmt of messageListeners(html)) {
    const run = new Function('window', 'source', 'event', `${stmt}\n`);
    run(window, source, event);
  }
  for (const fn of listeners) fn(event);
  return replies;
}

test('a message from another origin gets no session reply', () => {
  const event = {
    origin: 'https://evil.example',
    source: {
      postMessage(payload, target) {
        event.replies.push({ payload, target });
      }
    },
    data: { kilNeedSession: true },
    replies: []
  };
  for (const file of ['tickets.html', 'profile.html']) {
    const html = read(file);
    assert.equal(html.includes('kilNeedSession'), false, file);
    assert.equal(messageListeners(html).length, 0, file);
    assert.deepEqual(repliesFrom(html, event), []);
  }
  assert.deepEqual(event.replies, []);
});

test('the ticket page does not ask an outside host to draw a door code', () => {
  const tickets = read('tickets.html');
  const profile = read('profile.html');
  for (const html of [tickets, profile]) {
    assert.equal(/qrserver|chart\.googleapis|quickchart|api\.qrserver/i.test(html), false);
    assert.match(html, /\/assets\/js\/vendor\/qrcode\.js/);
    assert.match(html, /createDataURL/);
  }
  assert.match(tickets, /KilTicketQr\.payload\(e\.qr_token,\s*\{\s*prefix:\s*true\s*\}\)/);
  assert.match(profile, /KilTicketQr\.payload\(t\.qr_token\)/);
  assert.equal(/order_id/.test(tickets), false);
  const eventPage = read('event.html');
  assert.equal(/qrserver/i.test(eventPage), false);
  assert.match(eventPage, /canonFor\(ev\.slug\)/);
  assert.equal(/location\.href/.test(eventPage.slice(eventPage.indexOf('ev-qr'), eventPage.indexOf('ev-qr') + 500)), false);
  const qrcode = require('./vendor/qrcode.js');
  const drawn = qrcode(0, 'M');
  drawn.addData('KIL-door-token');
  drawn.make();
  const url = drawn.createDataURL(4, 0);
  assert.match(url, /^data:image\/gif;base64,/);
  assert.equal(/^https?:/i.test(url), false);
});

test('no first-party page posts a token', () => {
  const files = walk(new URL('.', root).pathname, []);
  const hits = [];
  for (const path of files) {
    const text = readFileSync(path, 'utf8');
    if (/postMessage\([\s\S]{0,500}(access_token|refresh_token)/.test(text)) hits.push(path);
    if (/kilNeedSession/.test(text)) hits.push(path);
  }
  assert.deepEqual(hits, []);
});

test('profile draws the raw token and tickets draws the KIL- form', () => {
  const qr = require('./kil-ticket-qr.js');
  const token = '0123456789abcdef0123456789abcdef';
  const fromTickets = qr.payload(token, { prefix: true });
  const fromProfile = qr.payload(token);
  assert.equal(fromTickets, 'KIL-' + token);
  assert.equal(fromProfile, token);
  assert.equal(qr.checkInTicket(fromTickets), token);
  assert.equal(qr.checkInTicket(fromProfile), token);
  assert.equal(qr.eventCheckinScan(fromProfile), token);
  assert.notEqual(qr.eventCheckinScan(fromTickets), token);
  assert.equal(qr.payload(''), '');
  assert.equal(qr.payload('99', { prefix: true }), '');
  assert.match(read('tickets.html'), /KilTicketQr\.payload\(e\.qr_token,\s*\{\s*prefix:\s*true\s*\}\)/);
  assert.match(read('profile.html'), /KilTicketQr\.payload\(t\.qr_token\)/);
  assert.equal(/prefix:\s*true/.test(read('profile.html')), false);
});

test('every page is framed only by this site', () => {
  const headers = read('_headers');
  const coop = headers.match(/Cross-Origin-Opener-Policy:\s*(\S+)/);
  assert.ok(coop);
  assert.equal(coop[1], 'same-origin');
  assert.match(headers, /Content-Security-Policy:\s*frame-ancestors 'self'/);
  assert.match(headers, /X-Frame-Options:\s*SAMEORIGIN/);
  assert.match(headers, /\/\*/);
});
