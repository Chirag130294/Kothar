import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY, makeItem, addPacks, importPacks, finishPack, takeAmount, setLeft, setList, snooze,
  total, est, status, daysLeft, suggestions, toBuy, sealedCount, openPack } from '../js/stock.js';
import { toBase, fmt, packLabel, parseUnit } from '../js/units.js';

const T0 = Date.UTC(2026, 0, 1);
const day = (n) => T0 + n * DAY;
const rice = () => makeItem({ name: 'Rice', cat: 'grains', dsize: { v: 10, u: 'lb' } }, T0);

test('units: lb, kg, g convert to a base and back', () => {
  assert.equal(toBase(10, 'lb'), 4535.92);
  assert.equal(fmt(4535.92, 'g', 'lb'), '10 lb');
  assert.equal(fmt(4535.92, 'g', 'metric'), '4.5 kg');
  assert.equal(fmt(250, 'g', 'metric'), '250 g');
  assert.equal(fmt(1500, 'ml'), '1.5 L');
  assert.equal(packLabel(10, 'lb'), '10 lb');
  assert.equal(parseUnit('LBs'), 'lb');
});

test('bought: every pack stays sealed (Kothar counts packs, it does not track which is open)', () => {
  let r = addPacks(rice(), 2, 10, 'lb', day(0));
  assert.equal(r.item.packs.length, 2);
  assert.equal(openPack(r.item), null);
  assert.equal(sealedCount(r.item), 2);
  r = addPacks(r.item, 1, 4, 'lb', day(5));
  assert.equal(sealedCount(r.item), 3);
  assert.deepEqual(r.item.recent[0], { v: 4, u: 'lb' });
  assert.equal(r.item.packs.map((p) => p.label).join(), '10 lb,10 lb,4 lb');
});

test('does not mutate its input', () => {
  const it = addPacks(rice(), 1, 10, 'lb', day(0)).item;
  const copy = JSON.stringify(it);
  finishPack(it, null, day(40)); takeAmount(it, it.packs[0].id, 100, day(1)); setLeft(it, it.packs[0].id, 50, day(1));
  assert.equal(JSON.stringify(it), copy);
});

test('Finished with one tap: removes one pack; the next pack is timed from that moment, nothing is marked opened', () => {
  let it = addPacks(rice(), 2, 10, 'lb', day(0)).item;
  const r = finishPack(it, null, day(40));
  assert.equal(r.item.packs.length, 1);
  assert.equal(r.item.packs[0].openedAt, null);
  assert.equal(r.item.lifespans.length, 1);
  assert.equal(r.item.lifespans[0].days, 40);
  assert.equal(r.item.onList, false);
  const r2 = finishPack(r.item, null, day(65));          // second pack lasted from day 40 to day 65
  assert.equal(r2.item.lifespans[1].days, 25);
});

test('imported packs: no sample for the first finish (unknown start), then the chain teaches', () => {
  const imp = importPacks(rice(), [{ v: 10, u: 'lb', count: 3 }], day(0)).item;
  assert.ok(imp.packs.every((p) => p.openedAt == null));
  let r = finishPack(imp, null, day(20));
  assert.equal((r.item.lifespans || []).length, 0);
  r = finishPack(r.item, null, day(50));
  assert.equal(r.item.lifespans[0].days, 30);
});

test('finishing the last pack puts the item on the list', () => {
  const it = addPacks(rice(), 1, 10, 'lb', day(0)).item;
  const r = finishPack(it, null, day(30));
  assert.equal(total(r.item), 0); assert.equal(r.item.onList, true);
  assert.equal(status(r.item, day(30)), 'out');
  assert.deepEqual(toBuy([r.item]).map((x) => x.name), ['Rice']);
});

test('a pack finished within 2 days is a mis-tap and teaches nothing', () => {
  const it = addPacks(rice(), 2, 10, 'lb', day(0)).item;
  const r = finishPack(it, null, day(1));
  assert.equal(r.item.lifespans.length, 0);
});

test('imported opened packs never teach the predictor (their start date is unknown)', () => {
  const it = importPacks(rice(), [{ v: 500, u: 'g', count: 3, opened: true }], day(0)).item;
  assert.equal(it.packs.length, 3);
  assert.equal(openPack(it).noSample, true);
  const r = finishPack(it, null, day(30));
  assert.equal(r.item.lifespans.length, 0);
  // the next pack opened by the tap is real: finishing it counts
  const r2 = finishPack(r.item, null, day(60));
  assert.equal(r2.item.lifespans.length, 1);
  assert.equal(r2.item.lifespans[0].days, 30);
});

test('importing a list with sizes and an opened packet', () => {
  const it = importPacks(rice(), [{ v: 500, u: 'g', count: 1, opened: true }, { v: 500, u: 'g', count: 4 }], day(0)).item;
  assert.equal(it.packs.length, 5);
  assert.equal(sealedCount(it), 4);
  assert.equal(total(it), 2500);
});

test('Advanced: took some out / what is left keep exact amounts', () => {
  const it = addPacks(rice(), 1, 1, 'kg', day(0)).item;
  const pid = it.packs[0].id;
  const a = takeAmount(it, pid, 250, day(3)).item;
  assert.equal(total(a), 750);
  const b = setLeft(a, pid, 400, day(4)).item;
  assert.equal(total(b), 400);
  const c = takeAmount(b, pid, 400, day(5));         // taking it all = Finished
  assert.equal(total(c.item), 0);
  assert.equal(setLeft(it, pid, 0, day(6)).item.packs.length, 0);
});

test('prediction works across pack sizes (rate, not days-per-pack)', () => {
  // The family eats 100 g/day. A 2 kg pack lasts 20 days, a 5 kg pack 50 days, a 10 lb pack ~45 days.
  let it = rice(); it.dim = 'g'; let t0 = 0;
  for (const [v, u, days] of [[2, 'kg', 20], [5, 'kg', 50], [2, 'kg', 20]]) {
    it = addPacks(it, 1, v, u, t0).item;
    t0 += days * DAY;
    it = finishPack(it, null, t0).item;
  }
  const e = est(it);
  assert.equal(e.n, 3);
  assert.ok(Math.abs(e.rate - 100) < 1, `rate ${e.rate}`);
});

test('status turns low as stock runs down; suggestions list it; Add to list does not mark it empty', () => {
  let it = rice();
  let t = 0;
  for (let k = 0; k < 3; k++) {            // three 30-day cycles of a 10 lb bag, then a fresh bag + a spare
    it = addPacks(it, 1, 10, 'lb', t).item; t += 30 * DAY; it = finishPack(it, null, t).item;
  }
  it = addPacks(it, 1, 10, 'lb', t).item;
  assert.equal(status(it, t), 'in');
  assert.equal(suggestions([it], t).length, 0);
  const later = t + 27 * DAY;              // about 3 days of rice left
  assert.equal(status(it, later), 'low');
  assert.equal(suggestions([it], later).length, 1);
  const added = setList(it, true).item;
  assert.equal(total(added), total(it));    // still in stock
  assert.equal(suggestions([added], later).length, 0);
  const sn = snooze(it, later).item;
  assert.equal(suggestions([sn], later).length, 0);
  assert.equal(suggestions([sn], later + 30 * DAY).length, 1);
  assert.ok(daysLeft(it, later) < 5);
});

test('needs two finished packs before suggesting', () => {
  let it = rice();
  it = addPacks(it, 1, 10, 'lb', 0).item; it = finishPack(it, null, 30 * DAY).item;
  it = addPacks(it, 1, 10, 'lb', 30 * DAY).item;
  assert.equal(status(it, 58 * DAY), 'in');     // only one sample so far
});

test('outliers (the month the guests came) are ignored once there are 4+ samples', () => {
  let it = rice(); let t = 0;
  for (const d of [30, 31, 29, 8]) {
    it = addPacks(it, 1, 10, 'lb', t).item; t += d * DAY; it = finishPack(it, null, t).item;
  }
  const e = est(it);
  assert.equal(e.n, 3);
});

test('normalizeItem repairs v1-shaped documents and drops junk', async () => {
  const { normalizeItem } = await import('../js/stock.js');
  const v1 = normalizeItem({ id: 'a', name: ' Toor Dal ', weight: '5kg', status: 'have' });
  assert.equal(v1.name, 'Toor Dal'); assert.deepEqual(v1.packs, []); assert.equal(v1.dim, 'g'); assert.equal(v1.cat, 'dry');
  assert.equal(normalizeItem({ id: 'b' }), null);
  assert.equal(normalizeItem({ id: 'c', name: 'X', packs: [{ amt: 'bad' }, { amt: 500, u: 'g', v: 500 }] }).packs.length, 1);
});

test('usePacks removes whole packs by size, open one first, one undoable result', async () => {
  const { usePacks, packGroups, importPacks, makeItem } = await import('../js/stock.js');
  const t = 1_700_000_000_000;
  let it = makeItem({ name: 'Rice', cat: 'grains', dsize: { v: 10, u: 'lb' } }, t);
  it = importPacks(it, [{ v: 10, u: 'lb', count: 2 }, { v: 4, u: 'lb', count: 1 }], t).item;
  assert.deepEqual(packGroups(it).map((g) => [g.label, g.count]), [['4 lb', 1], ['10 lb', 2]]);
  const r = usePacks(it, [{ label: '10 lb', count: 1 }], t + 5 * 86400000);
  assert.equal(r.item.packs.filter((p) => p.label === '10 lb').length, 1);
  assert.equal(it.packs.length, 3, 'original untouched');
  const r2 = usePacks(r.item, [{ label: '10 lb', count: 5 }, { label: '4 lb', count: 1 }], t + 9 * 86400000);
  assert.equal(r2.item.packs.length, 0); assert.equal(r2.item.onList, true);
  assert.equal(usePacks(it, [{ label: '99 kg', count: 1 }], t), null);
});
