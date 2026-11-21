/**
 * importer.js: turn a written/pasted/spreadsheet/photographed pantry list into reviewable rows.
 *
 * Understands lines like (all from a real family list):
 *   Toor dal 10 LB 1                 -> 1 pack of 10 lb
 *   Moong dal 4 LB-1 10 LB-1         -> 1 x 4 lb + 1 x 10 lb
 *   Haddar 400 g 1 500 g 4           -> 1 x 400 g + 4 x 500 g
 *   Dhanajiru 1(tutelu packet) and 500 g 4   -> an opened pack + 4 x 500 g
 *   Talod handva 2                   -> 2 packs (usual size assumed, flagged)
 *   Idli rice                        -> item with no stock yet (flagged)
 * Section headings ("Box", "Masala:") steer unmatched words toward a category.
 * Nothing here saves anything: the UI shows every row for review first.
 */
import { lookup, ENTRIES, norm, toGu, guessCat, guessLook, catFromHeading, CATS } from './catalog.js';
import { parseUnit, dimOf, U } from './units.js';

const OPENED_RE = /\b(tutel\w*|tuteli|opened?|khull\w*|khulu|started)\b/i;
const UNIT_RE = '(?:kgs?|kilos?|kilograms?|grams?|gms?|gm|gr|g|lbs?|pounds?|oz|ounces?|ml|l|ltrs?|litres?|liters?|pcs?|pieces?|packets?|packs?|box(?:es)?)';
const TOKEN_RE = new RegExp(`(\\d+(?:[.,]\\d+)?)(?:\\s*(${UNIT_RE})(?![a-z]))?(?![\\d])`, 'gi');

const titleCase = (s) => s.replace(/\b([a-z])/g, (m) => m.toUpperCase());

/** "Moong dal 4 LB-1 10 LB-1" -> { name:'Moong dal', packs:[{v:4,u:'lb',count:1}, ...], opened:false } */
export function parseLine(line) {
  let s = line.replace(/^[\s\-•*·•\d]+[.)]\s+/, '').replace(/^[\s\-•*·•]+/, '').trim();
  if (!s) return null;
  const opened = OPENED_RE.test(s);
  const firstDigit = s.search(/\d/);
  let name = (firstDigit === -1 ? s : s.slice(0, firstDigit)).replace(/\(.*?\)/g, ' ').replace(/[-:,;x×]+\s*$/i, '').replace(/\s+/g, ' ').trim();
  let tail = firstDigit === -1 ? '' : s.slice(firstDigit);
  tail = tail.replace(/\(.*?\)/g, ' ');       // notes like (tutelu packet) are read above, not as numbers

  const entries = [];     // sized packs
  const bare = [];        // numbers with no unit
  let last = null;
  for (const m of tail.matchAll(TOKEN_RE)) {
    const num = +m[1].replace(',', '.');
    const unit = m[2] ? parseUnit(m[2]) : null;
    if (unit && unit !== 'pc') { last = { v: num, u: unit, count: null }; entries.push(last); }
    else if (unit === 'pc') { bare.push(num); last = null; }
    else if (last && last.count == null) { last.count = num; last = null; }
    else bare.push(num);
  }
  for (const e of entries) if (e.count == null) e.count = 1;

  // Merge duplicates of the same size.
  const packs = [];
  for (const e of entries) {
    const hit = packs.find((p) => p.v === e.v && p.u === e.u);
    if (hit) hit.count += e.count; else packs.push({ ...e });
  }
  return { name, packs, bare, opened };
}

/** Is this line a section heading rather than an item? */
function isHeading(line, nextBlank, prevBlankOrStart) {
  const t = line.trim();
  if (/\d/.test(t)) return false;
  if (/:\s*$/.test(t)) return true;
  if (catFromHeading(t) && t.split(/\s+/).length <= 3) return !lookup(t).some((r) => r.s >= 85);
  // A lone first line followed by a blank, matching nothing in the dictionary ("Vastuoo"), is a title.
  return prevBlankOrStart && nextBlank && t.split(/\s+/).length <= 2 && lookup(t).length === 0;
}

/** Best dictionary match for a written name, nudged toward the section's category. */
function match(name, sectionCat) {
  const found = lookup(name).map((r) => ({ ...r, s: r.s + (sectionCat && r.e.cat === sectionCat ? 12 : 0) }));
  found.sort((a, b) => b.s - a.s);
  return found;
}

let rowSeq = 0;
/** Text -> { rows, headings }. Every row is editable in the review screen. */
export function parseList(text) {
  const lines = String(text || '').split(/\r?\n/);
  const rows = [], headings = [];
  let section = null, sectionCat = null;
  lines.forEach((raw, i) => {
    if (!raw.trim()) return;
    const prevBlank = i === 0 || !lines.slice(0, i).some((l) => l.trim()) || !lines[i - 1].trim();
    const nextBlank = i + 1 >= lines.length || !lines[i + 1].trim();
    if (isHeading(raw, nextBlank, prevBlank)) {
      section = raw.replace(/:\s*$/, '').trim(); sectionCat = catFromHeading(section);
      headings.push(section);
      return;
    }
    const p = parseLine(raw);
    if (!p || !p.name) return;
    rows.push(buildRow(raw, p, section, sectionCat));
  });
  return { rows, headings };
}

function buildRow(raw, p, section, sectionCat) {
  const found = match(p.name, sectionCat);
  const top = found[0];
  const issues = [];
  let conf, e;
  if (top && top.s >= 85) { conf = 'good'; e = top.e; }
  else if (top && top.s >= 55) { conf = 'check'; e = top.e; issues.push(`Matched "${p.name}" to ${top.e.en}. Is that right?`); }
  else conf = 'new';

  let item;
  if (e) {
    item = { name: e.en, gu: e.gu, cat: e.cat, form: e.form, color: e.color, keys: e.keys, dsize: { v: e.size, u: e.unit } };
  } else {
    const name = titleCase(p.name);
    const cat = sectionCat || guessCat(name);
    const firstU = p.packs[0] ? p.packs[0].u : 'kg';
    const look = guessLook(name, cat, p.packs[0] ? p.packs[0].v : 1, firstU);
    item = { name, gu: toGu(name), cat, form: look.form, color: look.color, keys: [norm(name)], dsize: { v: p.packs[0] ? p.packs[0].v : 1, u: firstU } };
    issues.push('Not in the dictionary yet. Check the Gujarati name.');
  }

  let packs = p.packs.map((x) => ({ ...x }));
  const dim = dimOf(item.dsize.u);
  let assumed = false;
  // Numbers with no unit ("Pav bhaji 2", "Talod handva 2") are packs of the usual size.
  const bareCount = p.bare.reduce((a, b) => a + b, 0);
  if (bareCount > 0) {
    if (p.opened && packs.length) {
      const l = packs[packs.length - 1];
      packs.unshift({ v: l.v, u: l.u, count: 1, opened: true });    // 1 opened packet of the same size
    } else {
      const open = p.opened;
      packs.push({ v: item.dsize.v, u: item.dsize.u, count: bareCount, opened: open });
      assumed = true;
      issues.push(`Assumed the usual size (${item.dsize.v} ${U[item.dsize.u].label}) for each. Change it if different.`);
    }
  } else if (p.opened && packs.length) packs[0] = { ...packs[0], opened: true };

  // Units must match the item's kind (weight vs volume): drop and flag what cannot be used.
  const bad = packs.filter((x) => dimOf(x.u) !== dim && dimOf(x.u) !== 'pc' && dim !== 'pc');
  if (bad.length) {
    packs = packs.filter((x) => !bad.includes(x));
    issues.push(`Skipped ${bad.map((x) => `${x.v} ${U[x.u].label}`).join(', ')}: ${dim === 'ml' ? 'this is a liquid' : 'this is measured by weight'}.`);
  }
  if (!packs.length) issues.push('No amount given. Added with nothing in stock.');

  return {
    id: 'r' + (++rowSeq), raw, section: section || null,
    ...item, packs, conf, assumed, include: true, issues,
    alts: found.filter((r) => r.e.en !== item.name).slice(0, 3).map((r) => r.e.en),
  };
}

/** Two rows pointing at the same item merge into one (packs added together). */
export function mergeRows(rows) {
  const by = new Map(), out = [];
  for (const r of rows) {
    const key = norm(r.name);
    const hit = by.get(key);
    if (!hit) { const c = { ...r, packs: r.packs.map((p) => ({ ...p })), issues: [...r.issues] }; by.set(key, c); out.push(c); continue; }
    for (const p of r.packs) {
      const same = hit.packs.find((q) => q.v === p.v && q.u === p.u && !!q.opened === !!p.opened);
      if (same) same.count += p.count; else hit.packs.push({ ...p });
    }
    hit.issues.push('Listed more than once; combined.');
  }
  return out;
}

/* ───────────────────────────── spreadsheets (CSV text or rows from SheetJS) ───────────────────────────── */

/** Minimal CSV parser (quotes, commas, semicolons or tabs). */
export function parseCsv(text) {
  const first = text.split(/\r?\n/)[0] || '';
  const sep = first.includes('\t') ? '\t' : (first.split(';').length > first.split(',').length ? ';' : ',');
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim()));
}

const HEAD = {
  name: /^(item|name|product|vastu|vastuo|description)$/i,
  size: /^(size|pack|pack size|weight|qty size)$/i,
  unit: /^(unit|uom)$/i,
  count: /^(qty|quantity|count|packs|number|nos|no)$/i,
  section: /^(section|category|group|type)$/i,
};

/** A grid of cells (from CSV or Excel) -> the same text lines parseList understands. */
export function tableToText(grid) {
  if (!grid.length) return '';
  const cols = {};
  const head = grid[0].map((c) => String(c ?? '').trim());
  head.forEach((h, i) => { for (const k of Object.keys(HEAD)) if (!(k in cols) && HEAD[k].test(h)) cols[k] = i; });
  const hasHeader = 'name' in cols;
  const body = hasHeader ? grid.slice(1) : grid;
  const lines = []; let lastSection = null;
  for (const r of body) {
    const cell = (i) => (i == null ? '' : String(r[i] ?? '').trim());
    if (hasHeader) {
      const sec = cell(cols.section);
      if (sec && sec !== lastSection) { lines.push(`${sec}:`); lastSection = sec; }
      const size = cell(cols.size), unit = cell(cols.unit), count = cell(cols.count);
      const sizeText = /[a-z]/i.test(size) ? size : `${size} ${unit}`.trim();
      lines.push(`${cell(cols.name)} ${sizeText} ${count}`.replace(/\s+/g, ' ').trim());
    } else {
      lines.push(r.map((c) => String(c ?? '').trim()).filter(Boolean).join(' '));
    }
  }
  return lines.join('\n');
}

/* ───────────────────────────── browser-only loaders (lazy, from a CDN, only when used) ───────────────────────────── */

const loaded = {};
export function loadScript(src) {
  return (loaded[src] ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true; s.onload = resolve; s.onerror = () => reject(new Error('Could not load ' + src));
    document.head.append(s);
  }));
}

/** .csv/.txt read directly; .xlsx/.xls via SheetJS (downloaded only when a spreadsheet is chosen). */
export async function readListFile(file) {
  const name = file.name.toLowerCase();
  if (/\.(txt|md)$/.test(name)) return await file.text();
  if (/\.csv$|\.tsv$/.test(name)) return tableToText(parseCsv(await file.text()));
  await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
  const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const grid = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  return tableToText(grid);
}

/** Photo/screenshot -> text. Printed or typed text works; handwriting is unreliable. Always reviewed. */
export async function readListPhoto(file, onProgress) {
  await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');
  const { data } = await window.Tesseract.recognize(file, 'eng', {
    logger: (m) => { if (m.status === 'recognizing text' && onProgress) onProgress(m.progress); },
  });
  return data.text;
}

export { CATS, ENTRIES };

/** Review screen: "not right? use X instead". Re-point a row at a dictionary entry, keeping its packs. */
export function rowFromEntry(row, enName) {
  const e = ENTRIES.find((x) => x.en === enName);
  if (!e) return row;
  return { ...row, name: e.en, gu: e.gu, cat: e.cat, form: e.form, color: e.color, keys: e.keys, dsize: { v: e.size, u: e.unit }, conf: 'good',
    issues: row.issues.filter((i) => !/Matched|dictionary/.test(i)), alts: [] };
}

/** "10 lb ×1, 4 lb ×2 (opened)" <-> packs, for the editable field in the review screen. */
export const packsToText = (packs) => packs.map((p) => `${p.v} ${U[p.u].label}${p.count > 1 ? ` ×${p.count}` : ''}${p.opened ? ' (opened)' : ''}`).join(', ');
export function textToPacks(text) {
  const p = parseLine('x ' + text);
  if (!p) return [];
  const packs = p.packs.map((x) => ({ ...x }));
  if (p.opened && packs.length) packs[0].opened = true;
  return packs;
}

/** A typical Gujarati pantry to start from: items with no stock yet. */
export function starterRows() {
  return ENTRIES.filter((e) => e.cat !== 'mixes').slice(0, 40).map((e, i) => ({
    id: 's' + i, raw: e.en, section: null, name: e.en, gu: e.gu, cat: e.cat, form: e.form, color: e.color, keys: e.keys,
    dsize: { v: e.size, u: e.unit }, packs: [], conf: 'good', assumed: false, include: true, issues: [], alts: [],
  }));
}
