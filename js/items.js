/**
 * items.js — Firestore reads/writes for pantry items and the tracking log.
 *
 * Writes are intentionally NOT awaited by the UI: with offline persistence on, Firestore
 * applies them to the local cache instantly (the screen updates) and syncs later. Awaiting
 * a commit while offline would leave the button "stuck" until the phone reconnects.
 */
import { auth, db } from './firebase-init.js';
import { doc, collection, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch, Timestamp } from './fb.js';
import { applyStatusChange, sizeKey, sizeLabel, snoozeUntilMs } from './predict.js';

const itemsCol = (hid) => collection(db, 'households', hid, 'items');
const itemRef = (hid, id) => doc(db, 'households', hid, 'items', id);
const logsCol = (hid) => collection(db, 'households', hid, 'logs');

// predict.js works in plain ms numbers; convert these fields to Timestamps on the way out.
const DATE_FIELDS = ['lastRestockedAt', 'lastEmptiedAt', 'prevRestockedAt', 'suggestionSnoozedUntil'];
const toTs = (ms) => (ms == null ? null : Timestamp.fromMillis(ms));
function serialize(patch) {
  const out = { ...patch };
  for (const f of DATE_FIELDS) if (f in out) out[f] = toTs(out[f]);
  return out;
}

const uid = () => auth.currentUser?.uid ?? null;

export function watchItems(hid, cb) {
  return onSnapshot(
    itemsCol(hid),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => console.error('watchItems', err),
  );
}

function newItemDoc(f) {
  const now = Timestamp.now();
  return {
    name: f.name.trim(),
    nameGu: (f.nameGu || '').trim(),
    aliases: f.aliases || [],            // extra search words: "haldi", "tuver"…
    category: f.category,
    sizeValue: Number(f.sizeValue),
    sizeUnit: f.sizeUnit,
    sizeLabel: sizeLabel(f.sizeValue, f.sizeUnit),
    sizeKey: sizeKey(f.sizeValue, f.sizeUnit),
    status: f.status || 'have',
    onShoppingList: false,
    lastRestockedAt: null,               // first cycle starts at the first real refill
    lastEmptiedAt: null,
    prevRestockedAt: null,
    cycleSizeKey: null,
    suggestionSnoozedUntil: null,
    lifespans: {},
    createdAt: now, updatedAt: now, updatedBy: uid(),
  };
}

export function addItem(hid, fields) {
  const ref = doc(itemsCol(hid));
  setDoc(ref, newItemDoc(fields)).catch(console.error);
  return ref.id;
}

/** Editing the size keeps history: lifespans are stored per pack size. */
export function updateItem(hid, id, f) {
  updateDoc(itemRef(hid, id), {
    name: f.name.trim(), nameGu: (f.nameGu || '').trim(), category: f.category,
    sizeValue: Number(f.sizeValue), sizeUnit: f.sizeUnit,
    sizeLabel: sizeLabel(f.sizeValue, f.sizeUnit), sizeKey: sizeKey(f.sizeValue, f.sizeUnit),
    updatedAt: Timestamp.now(), updatedBy: uid(),
  }).catch(console.error);
}

export function deleteItem(hid, id) {
  deleteDoc(itemRef(hid, id)).catch(console.error);
}

/** One-tap starter pantry (batch limit is 500 writes; the seed list is ~40). */
export function seedItems(hid, seeds) {
  const batch = writeBatch(db);
  for (const s of seeds) batch.set(doc(itemsCol(hid)), newItemDoc(s));
  return batch.commit();
}

/**
 * The "Have it / Need it" toggle. Updates the item AND appends a log entry in one batch.
 * Returns true if something changed.
 */
export function setStatus(hid, item, next) {
  const res = applyStatusChange(item, next, Date.now());
  if (!res) return false;

  const { at, ...logRest } = res.log;
  const batch = writeBatch(db);
  batch.update(itemRef(hid, item.id), {
    ...serialize(res.patch), updatedAt: Timestamp.fromMillis(at), updatedBy: uid(),
  });
  batch.set(doc(logsCol(hid)), {
    itemId: item.id, itemName: item.name, sizeLabel: item.sizeLabel,
    ...logRest, at: Timestamp.fromMillis(at), by: uid(),
  });
  batch.commit().catch(console.error);
  return true;
}

/** "Add to list" on a suggestion. Deliberately does NOT mark the item empty (see predict.js). */
export function addSuggestionToList(hid, item) {
  updateDoc(itemRef(hid, item.id), { onShoppingList: true, updatedAt: Timestamp.now(), updatedBy: uid() })
    .catch(console.error);
}

/** "Dismiss": hide the suggestion for a while, then let the algorithm re-evaluate. */
export function dismissSuggestion(hid, item) {
  updateDoc(itemRef(hid, item.id), {
    suggestionSnoozedUntil: Timestamp.fromMillis(snoozeUntilMs(item)),
    updatedAt: Timestamp.now(), updatedBy: uid(),
  }).catch(console.error);
}
