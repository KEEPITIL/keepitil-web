// The create-event success screen follows the stored status. Old RPC results have no status.
// Run: node --test assets/js/kil-event-outcome.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(read('assets/js/kil-event-outcome.js'), ctx);
const outcome = ctx.window.kilEventSaveOutcome;

test('a missing status is the old RPC shape and is treated as published', () => {
  const o = outcome({ slug: 'warehouse-night', id: 4 });
  assert.equal(o.live, true);
  assert.equal(o.title, "You're live");
  assert.match(o.text, /published/);
  assert.doesNotMatch(o.text, /waiting for review/);
});

test('only status published says you are live', () => {
  const o = outcome({ status: 'published', review_reason: 'stale', in_review: 0 });
  assert.equal(o.live, true);
  assert.equal(o.title, "You're live");
});

test('status review shows the waiting copy, the reason, and who to email', () => {
  const o = outcome({ status: 'review', review_reason: 'Missing venue' });
  assert.equal(o.live, false);
  assert.equal(o.title, 'Saved, waiting for review');
  assert.match(o.text, /Missing venue/);
  assert.match(o.text, /info@keepitil.com/);
  assert.match(o.text, /can't edit an event while it is in review/);
  assert.doesNotMatch(o.title, /You're live/);
});

test('a series shows the in_review count and does not say live while any date is in review', () => {
  const one = outcome({ status: 'published', in_review: 1, review_reason: 'Duplicate' });
  assert.equal(one.live, false);
  assert.equal(one.title, 'Saved, waiting for review');
  assert.match(one.text, /1 date is waiting for review/);
  assert.match(one.text, /Duplicate/);
  const many = outcome({ status: 'review', in_review: 3, review_reason: 'Past date' });
  assert.match(many.text, /3 dates are waiting for review/);
  assert.match(many.text, /Past date/);
});

test('the reason is returned as text, not markup', () => {
  const o = outcome({ status: 'review', review_reason: '<img src=x onerror=alert(1)>' });
  assert.match(o.text, /<img src=x onerror=alert\(1\)>/);
  const page = read('create-event.html');
  assert.match(page, /dh\.textContent=outcome\.title/);
  assert.match(page, /dp\.textContent=outcome\.text/);
  assert.match(page, /kil-event-outcome\.js/);
});

test('the migration is idempotent and returns the stored status, reason, and series count', () => {
  const sql = read('supabase/migrations/20261128020000_event_status_truthful.sql').replace(/^\s*--.*$/gm, '');
  const rb = read('supabase/migrations/20261128020000_event_status_truthful.rollback.sql').replace(/^\s*--.*$/gm, '');
  assert.match(sql, /create or replace function public\.kil_insert_event/);
  assert.match(sql, /create or replace function public\.kil_update_own_event/);
  assert.match(sql, /create or replace function public\.kil_publish_own_series/);
  assert.match(sql, /select e\.status, e\.review_reason into v_status, v_reason/);
  assert.match(sql, /select e\.status, e\.review_reason into st, v_reason/);
  assert.match(sql, /count\(\*\)::int into n_review/);
  assert.match(sql, /'in_review', n_review/);
  assert.match(sql, /set search_path = ''/);
  assert.doesNotMatch(sql, /drop (table|column|function)/i);
  assert.match(rb, /'status', 'published'/);
  assert.doesNotMatch(rb, /in_review/);
  assert.doesNotMatch(rb, /drop (table|column)/i);
});
