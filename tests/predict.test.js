import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY_MS, CONFIG, sizeKey, rollingAverage, estimateLifespan, getSuggestion, buildSuggestions,
  applyStatusChange, recordLifespan, snoozeUntilMs,
} from '../js/predict.js';

const T0 = Date.UTC(2026, 0, 1);
const samples = (days, src = 'empty') => days.map((d, i) => ({ days: d, at: T0 + i * 1000, src }));
const rice = (over = {}) => ({
  id: 'rice', name: 'Rice', sizeValue: 10, sizeUnit: 'kg', sizeKey: 'g10000',
  status: 'have', onShoppingList: false, lifespans: {}, ...over,
});

test('sizeKey normalises units', () => {
  assert.equal(sizeKey(5, 'kg'), 'g5000');
  assert.equal(sizeKey(5000, 'g'), 'g5000');
  assert.equal(sizeKey(1.5, 'l'), 'ml1500');
  assert.equal(sizeKey(0, 'kg'), null);
});

test('rollingAverage: steady household -> exact answer, high confidence', () => {
  const r = rollingAverage(samples([45, 45, 45, 45]));
  assert.equal(r.avgDays, 45);
  assert.equal(r.confidence, 'high');
});

test('rollingAverage: recent cycles weigh more than old ones', () => {
  const r = rollingAverage(samples([40, 42, 50, 52]));
  assert.ok(r.avgDays > 46 && r.avgDays < 49, `got ${r.avgDays}`); // plain mean is 46
});

test('rollingAverage: outlier month (guests / travel) is dropped', () => {
  const r = rollingAverage(samples([45, 44, 46, 45, 120]));
  assert.equal(r.dropped, 1);
  assert.ok(Math.abs(r.avgDays - 45) < 1);
});

test('rollingAverage: mis-tap cycles (<2 days) never count', () => {
  assert.equal(rollingAverage(samples([0.1, 0.5])), null);
  assert.deepEqual(recordLifespan([], 0.5, 'empty'), []);
});

test('new pack size is scaled from the consumption rate of another size', () => {
  const item = rice({ lifespans: { g5000: samples([22, 22]) } });
  const est = estimateLifespan(item);
  assert.equal(est.method, 'scaled');
  assert.equal(est.avgDays, 44);
});

test('suggestion thresholds: not yet / running low / likely empty', () => {
  const base = rice({ lifespans: { g10000: samples([45, 45, 45]) } });
  const at = (days) => getSuggestion({ ...base, lastRestockedAt: T0 - days * DAY_MS }, T0);
  assert.equal(at(30), null);
  assert.equal(at(40).state, 'running_low');
  assert.equal(at(50).state, 'likely_empty');
});

test('no suggestion with a single data point, when snoozed, or already listed', () => {
  const one = rice({ lifespans: { g10000: samples([45]) }, lastRestockedAt: T0 - 60 * DAY_MS });
  assert.equal(getSuggestion(one, T0), null);

  const two = { ...one, lifespans: { g10000: samples([45, 45]) } };
  assert.ok(getSuggestion(two, T0));
  assert.equal(getSuggestion({ ...two, suggestionSnoozedUntil: T0 + DAY_MS }, T0), null);
  assert.equal(getSuggestion({ ...two, onShoppingList: true }, T0), null);
  assert.equal(getSuggestion({ ...two, status: 'need' }, T0), null);
});

test('buildSuggestions sorts most overdue first', () => {
  const mk = (id, ago) => rice({ id, lifespans: { g10000: samples([45, 45]) }, lastRestockedAt: T0 - ago * DAY_MS });
  const out = buildSuggestions([mk('a', 40), mk('b', 60), mk('c', 10)], T0);
  assert.deepEqual(out.map((s) => s.item.id), ['b', 'a']);
});

test('dismiss snoozes for 25% of the lifespan (min 3 days)', () => {
  const item = rice({ lifespans: { g10000: samples([44, 44]) } });
  assert.equal(Math.round((snoozeUntilMs(item, T0) - T0) / DAY_MS), 11);
  assert.equal(Math.round((snoozeUntilMs(rice(), T0) - T0) / DAY_MS), 3);
});

test('toggle cycle: restock -> 45 days -> need records one sample', () => {
  const item = rice({ lastRestockedAt: T0, cycleSizeKey: 'g10000' });
  const res = applyStatusChange(item, 'need', T0 + 45 * DAY_MS);
  assert.equal(res.patch.status, 'need');
  assert.equal(res.patch.lifespans.g10000.length, 1);
  assert.equal(res.patch.lifespans.g10000[0].days, 45);
  assert.equal(res.log.counted, true);
});

test('first ever cycle (no restock date) records nothing but does not crash', () => {
  const res = applyStatusChange(rice(), 'need', T0);
  assert.equal(res.log.lifespanDays, null);
  assert.deepEqual(res.patch.lifespans, {});
});

test('oops: Need -> Have within 10 minutes restores the previous cycle', () => {
  const item = rice({ lastRestockedAt: T0, cycleSizeKey: 'g10000' });
  const needAt = T0 + 20 * DAY_MS;
  const needed = { ...item, ...applyStatusChange(item, 'need', needAt).patch };
  const undone = applyStatusChange(needed, 'have', needAt + 5 * 60 * 1000);
  assert.equal(undone.log.type, 'undo');
  assert.equal(undone.patch.lastRestockedAt, T0);
  assert.equal(undone.patch.lifespans.g10000.length, 0);
});

test('real refill later: restock date resets and pack size is remembered', () => {
  const item = rice({ lastRestockedAt: T0, status: 'need', lastEmptiedAt: T0 + 45 * DAY_MS, sizeValue: 5, sizeUnit: 'kg', sizeKey: 'g5000' });
  const res = applyStatusChange(item, 'have', T0 + 47 * DAY_MS);
  assert.equal(res.patch.lastRestockedAt, T0 + 47 * DAY_MS);
  assert.equal(res.patch.cycleSizeKey, 'g5000');
});

test('FEEDBACK LOOP: accepting a suggestion does not shorten the learned lifespan', () => {
  // Learned: 45 days. The app suggests at day ~40; the family buys on day 50.
  let item = rice({ lifespans: { g10000: samples([45, 45, 45]) }, lastRestockedAt: T0, cycleSizeKey: 'g10000' });
  const suggested = getSuggestion(item, T0 + 40 * DAY_MS);
  assert.ok(suggested);

  item = { ...item, onShoppingList: true }; // "Add to list" only sets this flag
  const bought = applyStatusChange(item, 'have', T0 + 50 * DAY_MS);
  const last = bought.patch.lifespans.g10000.at(-1);
  assert.equal(last.days, 50);          // measured from the purchase, not from day 40
  assert.equal(last.src, 'restock');
  assert.equal(bought.patch.onShoppingList, false);
});

test('CONFIG is sane', () => {
  assert.ok(CONFIG.SUGGEST_AT > 0 && CONFIG.SUGGEST_AT < 1);
  assert.ok(CONFIG.MIN_SAMPLES_TO_SUGGEST >= 2);
});
