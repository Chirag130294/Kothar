import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLine, parseList, mergeRows, parseCsv, tableToText } from '../js/importer.js';
import { parseQty } from '../js/units.js';

// The family's real list (typed from the photos), spellings and all.
const NOTE = `Vastuoo

Talod handva 2
Talod dhokla 1
Sooji 4 LB   1
Masoor dal 4 LB 1
Tal 2 kg 1
Mug 8 LB 1
Makhana 2 LB 1
Moong dal 4 LB-1 10 LB-1
Yellow peas 2 LB-1 4 LB 1 10 LB-1
Bhalhri lot 8 LB 4
Maida 1.8 kg 1
Papad doll ma
Khichiya papad 1
Toor dal 10 LB 1
Chana dal 10 LB 1
Chana dal 4 LB 1
Basmati rice 10 LB 1
Basmati rice 40 LB 1
Sona masoori rice 10 LB 1
Idli rice
Sugar 15 LB 1
Mosabi chana 4 LB 1
Ganthoda powder plastic bag

Dhanajiru 1(tutelu packet) and 500 g 4
Haddar 400 g 1 500 g 4
Jiru 1 kg 1
Garamasala 125 g 8
Chilli powder 500 g 3
Kashmiri 500 g 1

Box
Butter milk
Pav bhaji 2
Kitchen king
Jaljira
Sabji
Chhole
Pani puri
Amchoor
Achar`;

const row = (rows, re) => rows.find((r) => re.test(r.raw));

test('size + count patterns', () => {
  assert.deepEqual(parseLine('Toor dal 10 LB 1').packs, [{ v: 10, u: 'lb', count: 1 }]);
  assert.deepEqual(parseLine('Moong dal 4 LB-1 10 LB-1').packs, [{ v: 4, u: 'lb', count: 1 }, { v: 10, u: 'lb', count: 1 }]);
  assert.deepEqual(parseLine('Haddar 400 g 1 500 g 4').packs, [{ v: 400, u: 'g', count: 1 }, { v: 500, u: 'g', count: 4 }]);
  assert.deepEqual(parseLine('Yellow peas 2 LB-1 4 LB 1 10 LB-1').packs.map((p) => `${p.v}${p.u}x${p.count}`), ['2lbx1', '4lbx1', '10lbx1']);
  assert.deepEqual(parseLine('Maida 1.8 kg 1').packs, [{ v: 1.8, u: 'kg', count: 1 }]);
  assert.deepEqual(parseLine('Bhalhri lot 8 LB 4').packs, [{ v: 8, u: 'lb', count: 4 }]);
});

test('size with no count means one pack; bare number means count', () => {
  assert.deepEqual(parseLine('Rice 5 kg').packs, [{ v: 5, u: 'kg', count: 1 }]);
  const p = parseLine('Pav bhaji 2');
  assert.equal(p.packs.length, 0); assert.deepEqual(p.bare, [2]);
});

test('opened packet note', () => {
  const p = parseLine('Dhanajiru 1(tutelu packet) and 500 g 4');
  assert.equal(p.name, 'Dhanajiru'); assert.equal(p.opened, true);
  assert.deepEqual(p.packs, [{ v: 500, u: 'g', count: 4 }]); assert.deepEqual(p.bare, [1]);
});

test('the whole family note imports sensibly', () => {
  const { rows, headings } = parseList(NOTE);
  assert.deepEqual(headings, ['Vastuoo', 'Box']);
  assert.equal(rows.length, 38);

  const hal = row(rows, /Haddar/);
  assert.equal(hal.name, 'Turmeric (Haldar)'); assert.equal(hal.gu, 'હળદર');
  assert.equal(hal.packs.length, 2);

  assert.equal(row(rows, /^Mug/).name, 'Whole Moong');
  assert.equal(row(rows, /^Tal /).name, 'Sesame Seeds (Tal)');
  assert.equal(row(rows, /^Jiru/).name, 'Cumin Seeds (Jeera)');
  assert.equal(row(rows, /Bhalhri/).name, 'Bhakhri Flour');
  assert.equal(row(rows, /Sooji/).name, 'Rava (Sooji)');
  assert.equal(row(rows, /Kashmiri/).name, 'Kashmiri Chilli Powder');
  assert.equal(row(rows, /Mosabi/).name, 'Whole Chana (Sabut)');
  assert.equal(row(rows, /Idli/).name, 'Idli Rice');

  const dj = row(rows, /Dhanajiru/);
  assert.match(dj.name, /Coriander-Cumin/);
  assert.deepEqual(dj.packs.map((p) => [p.v, p.u, p.count, !!p.opened]), [[500, 'g', 1, true], [500, 'g', 4, false]]);

  const handva = row(rows, /handva/);
  assert.equal(handva.name, 'Handvo Mix'); assert.equal(handva.assumed, true); assert.equal(handva.packs[0].count, 2);

  // Lines with no amount are kept, flagged, with no packs.
  for (const re of [/Papad doll/, /Idli/, /Ganthoda/]) {
    const r = row(rows, re); assert.equal(r.packs.length, 0); assert.ok(r.issues.some((i) => /No amount/.test(i)));
  }
});

test('the Box section steers Chhole to the masala, not the chickpeas', () => {
  const { rows } = parseList(NOTE);
  assert.equal(row(rows, /^Chhole/).name, 'Chole Masala');
  assert.equal(row(rows, /^Pav bhaji/).cat, 'mixes');
  assert.equal(row(rows, /^Sabji/).name, 'Sabji Masala');
});

test('merging duplicates adds packs together', () => {
  const { rows } = parseList('Chana dal 10 LB 1\nChana dal 4 LB 1\nChana dal 10 LB 2');
  const m = mergeRows(rows);
  assert.equal(m.length, 1);
  assert.deepEqual(m[0].packs.map((p) => [p.v, p.u, p.count]), [[10, 'lb', 3], [4, 'lb', 1]]);
});

test('unknown items are created with a phonetic Gujarati name and flagged', () => {
  const { rows } = parseList('Zorba flour 2 kg 1');
  assert.equal(rows[0].conf === 'new' || rows[0].conf === 'check', true);
  assert.ok(rows[0].gu.length > 0);
});

test('CSV with headers and without', () => {
  const withHead = tableToText(parseCsv('Item,Size,Unit,Count\nToor dal,10,lb,1\n"Rice, basmati",5 kg,,2'));
  assert.equal(withHead, 'Toor dal 10 lb 1\nRice, basmati 5 kg 2');
  const { rows } = parseList(withHead);
  assert.equal(rows[0].name, 'Toor Dal'); assert.equal(rows[0].packs[0].u, 'lb');
  const noHead = tableToText(parseCsv('Toor dal,10 lb,1\nGhee,1 kg,2'));
  assert.equal(noHead, 'Toor dal 10 lb 1\nGhee 1 kg 2');
});

test('parseQty reads product sizes', () => {
  assert.deepEqual(parseQty('Toor dal 2 kg pack'), { v: 2, u: 'kg' });
  assert.deepEqual(parseQty('500g'), { v: 500, u: 'g' });
  assert.deepEqual(parseQty('1,5 L'), { v: 1.5, u: 'l' });
  assert.equal(parseQty('no size here'), null);
});
