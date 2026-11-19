// units.js: pack sizes in any unit, stored in a base unit (g, ml or pc), shown in the unit the family prefers.
// Pure functions only; no DOM, no Firebase.

export const U = {
  kg: { dim: 'g', f: 1000, label: 'kg' },
  g: { dim: 'g', f: 1, label: 'g' },
  lb: { dim: 'g', f: 453.592, label: 'lb' },
  oz: { dim: 'g', f: 28.3495, label: 'oz' },
  l: { dim: 'ml', f: 1000, label: 'L' },
  ml: { dim: 'ml', f: 1, label: 'ml' },
  pc: { dim: 'pc', f: 1, label: 'pc' },
};
export const UNITS_OF = { g: ['kg', 'g', 'lb'], ml: ['l', 'ml'], pc: ['pc'] };

const ALIASES = {
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  g: 'g', gm: 'g', gms: 'g', gr: 'g', gram: 'g', grams: 'g',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  l: 'l', lt: 'l', ltr: 'l', ltrs: 'l', liter: 'l', litre: 'l', liters: 'l', litres: 'l',
  ml: 'ml', mls: 'ml', milliliter: 'ml', millilitre: 'ml',
  pc: 'pc', pcs: 'pc', piece: 'pc', pieces: 'pc', pack: 'pc', packs: 'pc', packet: 'pc', packets: 'pc', box: 'pc', boxes: 'pc',
};
/** 'LBs' -> 'lb', 'Kg' -> 'kg', unknown -> null */
export const parseUnit = (s) => ALIASES[String(s || '').toLowerCase().replace(/[^a-z]/g, '')] || null;

export const toBase = (v, u) => Math.round(+v * U[u].f * 100) / 100;
export const dimOf = (u) => U[u].dim;
const n1 = (x) => String(Number(x.toFixed(1)));

/** What the pack is called in the app: "10 lb", "500 g", "1 L". Keeps the unit it was bought in. */
export const packLabel = (v, u) => `${+(+v).toFixed(2)} ${U[u].label}`;

/** Show an amount in the family's preferred system ('metric' | 'lb'). */
export function fmt(base, dim, system = 'metric') {
  if (dim === 'pc') return `${Math.round(base)} pc`;
  if (dim === 'ml') return base >= 1000 ? `${n1(base / 1000)} L` : `${Math.round(base)} ml`;
  if (system === 'lb') {
    const lb = base / U.lb.f;
    return lb >= 1 ? `${n1(lb)} lb` : `${Math.round(base / U.oz.f)} oz`;
  }
  return base >= 1000 ? `${n1(base / 1000)} kg` : `${Math.round(base)} g`;
}

/** Shorter form for tiles: "8.5 kg", "450 g", "2 pc". */
export const fmtShort = fmt;

/**
 * Parse a quantity like "10 lb", "500g", "1.8 kg", "2 L" -> { v, u } or null.
 * Used by the importer and by barcode product sizes ("500 g", "1 kg").
 */
export function parseQty(text) {
  const m = /(\d+(?:[.,]\d+)?)\s*([a-zA-Z]+)/.exec(String(text || ''));
  if (!m) return null;
  const u = parseUnit(m[2]);
  return u ? { v: +m[1].replace(',', '.'), u } : null;
}
