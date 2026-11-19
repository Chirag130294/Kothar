/**
 * store-firebase.js: the shared household data in Firestore (same interface as store-local.js).
 *
 *   households/{hid}/items/{itemId}       one document per item, packs + learned lifespans inside it
 *   households/{hid}/barcodes/{code}      { itemId, v, u, by, at }: the family-shared barcode memory
 *   households/{hid}/logs/{logId}         append-only audit trail
 *
 * Writes are deliberately NOT awaited by the UI: with offline persistence on, Firestore applies them
 * to the local cache instantly (screen updates) and syncs later. Awaiting would leave buttons stuck offline.
 * Two phones editing the SAME item while both are offline: last write wins.
 */
import { auth, db } from './firebase-init.js';
import { doc, collection, setDoc, deleteDoc, onSnapshot, writeBatch, serverTimestamp } from './fb.js';

const clean = (o) => JSON.parse(JSON.stringify(o));   // Firestore rejects `undefined`
const BATCH = 200;
const fail = (what) => (e) => { console.error(what, e); window.dispatchEvent(new CustomEvent('kothar-store-error', { detail: { what, code: e?.code, message: e?.message } })); };                                     // item + log per write -> 400 < the 500 limit

export function createFirebaseStore(hid) {
  const items = collection(db, 'households', hid, 'items');
  const logs = collection(db, 'households', hid, 'logs');
  const barcodes = collection(db, 'households', hid, 'barcodes');
  const uid = () => auth.currentUser?.uid ?? null;
  const stamp = (item) => ({ ...clean(item), updatedAt: Date.now(), updatedBy: uid() });
  const logDoc = (itemId, text) => ({ itemId, itemName: null, text, at: serverTimestamp(), by: uid() });

  return {
    mode: 'firebase',
    watchItems(cb) {
      return onSnapshot(items, (s) => cb(s.docs.map((d) => ({ ...d.data(), id: d.id }))), fail('read items'));
    },
    watchBarcodes(cb) {
      return onSnapshot(barcodes, (s) => cb(Object.fromEntries(s.docs.map((d) => [d.id, d.data()]))), fail('read barcodes'));
    },
    saveItem(item, logText) {
      const b = writeBatch(db);
      b.set(doc(items, item.id), stamp(item));
      if (logText) b.set(doc(logs), { ...logDoc(item.id, logText), itemName: item.name });
      b.commit().catch(fail('save'));
    },
    saveItems(list, logText) {
      for (let i = 0; i < list.length; i += BATCH) {
        const b = writeBatch(db);
        for (const it of list.slice(i, i + BATCH)) b.set(doc(items, it.id), stamp(it));
        if (logText && i === 0) b.set(doc(logs), logDoc(null, logText));
        b.commit().catch(fail('save'));
      }
    },
    deleteItem(id) { deleteDoc(doc(items, id)).catch(fail('save')); },
    saveBarcode(code, rec) {
      setDoc(doc(barcodes, code), { ...clean(rec), by: uid(), at: Date.now() }).catch(fail('save'));
    },
  };
}
