/**
 * store-local.js: demo storage. Everything stays on THIS phone (localStorage), nothing syncs.
 * Used until Firebase is configured (js/config.js) or when the page is opened with ?demo,
 * and by the browser tests. It implements exactly the same interface as store-firebase.js.
 *
 * Store interface
 *   mode                          'demo' | 'firebase'
 *   watchItems(cb)  -> unsub      cb(items[]) now and on every change
 *   watchBarcodes(cb) -> unsub    cb({ [code]: { itemId, v, u } })
 *   saveItem(item, logText)       create or replace one item (+ audit log line)
 *   saveItems(items, logText)     many at once (import)
 *   deleteItem(id)
 *   saveBarcode(code, rec)        the family-shared barcode memory
 *   watchWants(cb) / saveWant(w) / deleteWant(id) / deleteWants(ids)   one-time shopping items
 *   watchConfig(cb) / saveConfig(cfg)   shared settings (categories, prediction tuning)
 *   reset()                       demo only
 */
const KEY = 'kothar-demo-v2';

export function createLocalStore() {
  let data = { items: [], barcodes: {}, logs: [], wants: [], config: {} };
  try { data = { ...data, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* first run or private mode */ }
  const subs = { items: new Set(), barcodes: new Set(), wants: new Set(), config: new Set() };
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* quota/private: keep working in memory */ } };
  const emit = () => {
    subs.items.forEach((cb) => cb(structuredClone(data.items)));
    subs.barcodes.forEach((cb) => cb(structuredClone(data.barcodes)));
    subs.wants.forEach((cb) => cb(structuredClone(data.wants)));
    subs.config.forEach((cb) => cb(structuredClone(data.config)));
  };
  const log = (itemId, text) => { if (text) { data.logs.unshift({ itemId, text, at: Date.now() }); data.logs.length = Math.min(data.logs.length, 200); } };
  const upsert = (item) => {
    const i = data.items.findIndex((x) => x.id === item.id);
    const copy = { ...structuredClone(item), updatedAt: Date.now() };
    if (i < 0) data.items.push(copy); else data.items[i] = copy;
  };
  return {
    mode: 'demo',
    watchItems(cb) { subs.items.add(cb); cb(structuredClone(data.items)); return () => subs.items.delete(cb); },
    watchBarcodes(cb) { subs.barcodes.add(cb); cb(structuredClone(data.barcodes)); return () => subs.barcodes.delete(cb); },
    saveItem(item, logText) { upsert(item); log(item.id, logText); persist(); emit(); },
    saveItems(items, logText) { items.forEach(upsert); log(null, logText); persist(); emit(); },
    deleteItem(id) { data.items = data.items.filter((x) => x.id !== id); persist(); emit(); },
    saveBarcode(code, rec) { data.barcodes[code] = { ...rec, at: Date.now() }; persist(); emit(); },
    watchWants(cb) { subs.wants.add(cb); cb(structuredClone(data.wants)); return () => subs.wants.delete(cb); },
    saveWant(w) { const i = data.wants.findIndex((x) => x.id === w.id); const c = { ...structuredClone(w), updatedAt: Date.now() }; if (i < 0) data.wants.push(c); else data.wants[i] = c; persist(); emit(); },
    deleteWant(id) { data.wants = data.wants.filter((x) => x.id !== id); persist(); emit(); },
    deleteWants(ids) { const s = new Set(ids); data.wants = data.wants.filter((x) => !s.has(x.id)); persist(); emit(); },
    watchConfig(cb) { subs.config.add(cb); cb(structuredClone(data.config)); return () => subs.config.delete(cb); },
    saveConfig(cfg) { data.config = structuredClone(cfg); persist(); emit(); },
    reset() { data = { items: [], barcodes: {}, logs: [], wants: [], config: {} }; persist(); emit(); },
  };
}
