/**
 * setup.js: first-time pantry setup. Four ways in (paste/type, Excel or CSV, photo or screenshot, a typical
 * starter list), then ONE review screen. Nothing is saved until the family taps Import.
 */
import { ctx, now } from '../ctx.js';
import { CATS, norm } from '../catalog.js';
import { parseList, mergeRows, readListFile, readListPhoto, rowFromEntry, packsToText, textToPacks, starterRows } from '../importer.js';
import { makeItem, importPacks, total } from '../stock.js';
import { h, icon, sheet, toast, guarded } from './dom.js';
import { tileEl } from './thumb.js';

const close = () => h('button', { class: 'iconbtn', 'aria-label': 'Close', onclick: () => sheet.close() }, icon('x', 18));
const EXAMPLE = `Toor dal 10 lb 1
Moong dal 4 lb 1, 10 lb 1
Haddar 400 g 1, 500 g 4
Basmati rice 10 lb 1
Ghee 1 kg 2`;

export function openSetup() {
  const method = (ic, title, sub, onclick) => h('button', { class: 'method', onclick }, h('span', { class: 'mi' }, icon(ic, 22)), h('span', {}, h('b', {}, title), h('span', {}, sub)));
  sheet.open(h('div', { class: 'stack' },
    h('div', { class: 'shead' }, h('div', { class: 'grow' }, h('h2', {}, 'Set up your pantry'), h('div', { class: 'muted small' }, 'Pick whatever is easiest. You will check everything before it is saved.')), close()),
    method('paste', 'Paste or type a list', 'Like "Toor dal 10 lb 1" on each line', () => openPaste()),
    method('file', 'Excel or CSV file', 'Columns can be Item, Size, Unit, Count, or just a list', pickFile),
    method('camera', 'Photo or screenshot', 'Best with typed text. Handwriting may need fixing.', pickPhoto),
    method('sparkle', 'Start from a typical pantry', 'About 40 common items with Gujarati names. Add stock later.', () => review(starterRows(), 'starter'))));
}

/* ───────────── step 1: get text ───────────── */

export function openPaste(initial = '') {
  if (typeof initial !== 'string') initial = '';
  const ta = h('textarea', { placeholder: EXAMPLE, 'aria-label': 'Your pantry list', spellcheck: 'false' });
  ta.value = initial;
  sheet.open(h('div', { class: 'stack' },
    h('div', { class: 'shead' }, h('div', { class: 'grow' }, h('h2', {}, 'Paste your list'), h('div', { class: 'muted small note' }, 'One item per line: name, then size and unit, then how many. Several sizes are fine: "Moong dal 4 lb 1, 10 lb 1". Headings like "Masala" are understood.')), close()),
    ta,
    h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: () => openSetup() }, 'Back'),
      h('button', { class: 'btn primary grow', onclick: () => {
        const { rows } = parseList(ta.value);
        if (!rows.length) { toast('I could not find any items. Put one item on each line.'); return; }
        review(mergeRows(rows), 'text');
      } }, 'Review'))));
  setTimeout(() => ta.focus(), 60);
}

function pickFile() {
  const inp = h('input', { type: 'file', accept: '.xlsx,.xls,.csv,.tsv,.txt', hidden: true, onchange: (e) => guarded(async () => {
    const f = e.target.files[0]; if (!f) return;
    toast('Reading ' + f.name + '…');
    let text;
    try { text = await readListFile(f); } catch (err) {
      toast(/\.xlsx?$/i.test(f.name) ? 'Could not read the Excel file here. Save it as CSV (File > Save As) and try again.' : err.message); return;
    }
    const { rows } = parseList(text);
    if (!rows.length) { toast('No items found in that file.'); return; }
    review(mergeRows(rows), 'file');
  }) });
  document.body.append(inp); inp.click(); setTimeout(() => inp.remove(), 60000);
}

function pickPhoto() {
  const inp = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: (e) => guarded(async () => {
    const f = e.target.files[0]; if (!f) return;
    const prog = h('progress', { max: '1', value: '0' });
    sheet.open(h('div', { class: 'stack' }, h('h2', {}, 'Reading the photo…'), prog, h('div', { class: 'muted small' }, 'This happens on your phone. The first time it downloads a reading tool, so it can take a little while.')));
    let text;
    try { text = await readListPhoto(f, (p) => { prog.value = p; }); }
    catch { toast('Could not read the photo here. Paste or type the list instead.'); return openPaste(); }
    openPaste(text);   // show what it read so mistakes can be fixed before reviewing
    toast('Check the text, fix anything wrong, then tap Review.');
  }) });
  document.body.append(inp); inp.click(); setTimeout(() => inp.remove(), 60000);
}

/* ───────────── step 2: review ───────────── */

function summary(r) {
  if (!r.packs.length) return 'No stock yet';
  return packsToText(r.packs);
}

function review(rows0, source) {
  let rows = rows0.map((r) => ({ ...r }));
  const open = new Set();
  const root = h('div', { class: 'stack' });

  const draw = () => {
    const included = rows.filter((r) => r.include);
    const flagged = rows.filter((r) => r.include && (r.conf !== 'good' || r.issues.length)).length;
    const list = h('div', { class: 'list' }, rows.map((r) => {
      const editing = open.has(r.id);
      const tile = tileEl({ ...r, packs: [], dim: 'g', lifespans: [] }, { label: false });
      const cb = h('input', { type: 'checkbox', checked: r.include, 'aria-label': `Include ${r.name}`, onchange: (e) => { r.include = e.target.checked; draw(); } });
      const top = h('div', { class: 'top1' }, cb,
        h('button', { class: 'setrow grow flush', 'aria-expanded': String(editing), onclick: () => { editing ? open.delete(r.id) : open.add(r.id); draw(); } },
          tile, h('div', { class: 'tx grow' }, h('b', {}, r.name), h('span', { class: 'gu' }, r.gu), h('div', { class: 'packs' }, summary(r))), icon(editing ? 'chev' : 'right', 16)));
      const body = [top];
      if (r.include && r.issues.length && !editing) body.push(h('div', { class: 'iss' }, r.issues[0]));
      if (editing) {
        const gu = h('input', { type: 'text', class: 'gu', value: r.gu, 'aria-label': 'Gujarati name', oninput: (e) => { r.gu = e.target.value; } });
        const nm = h('input', { type: 'text', value: r.name, 'aria-label': 'Name', oninput: (e) => { r.name = e.target.value; } });
        const pk = h('input', { type: 'text', value: packsToText(r.packs), placeholder: 'e.g. 10 lb ×2, 4 lb', 'aria-label': 'Packs', onchange: (e) => {
          const t = e.target.value.trim(); r.packs = t ? textToPacks(t) : []; r.issues = r.issues.filter((i) => !/No amount|Assumed|Skipped/.test(i)); draw();
        } });
        const cat = h('select', { 'aria-label': 'Category', onchange: (e) => { r.cat = e.target.value; } }, CATS.map((c) => h('option', { value: c.id, selected: c.id === r.cat }, c.name)));
        body.push(h('div', { class: 'edit' },
          r.issues.map((i) => h('div', { class: 'iss flat' }, i)),
          r.alts?.length ? h('div', { class: 'chips' }, h('span', { class: 'muted small vmid' }, 'Not right? Use:'), r.alts.map((a) => h('button', { class: 'chip', onclick: () => { rows = rows.map((x) => (x.id === r.id ? rowFromEntry(x, a) : x)); draw(); } }, a))) : null,
          h('label', { class: 'f' }, 'Name', nm), h('label', { class: 'f' }, 'Gujarati', gu),
          h('label', { class: 'f' }, 'What you have: size, then ×count', pk), h('label', { class: 'f' }, 'Category', cat)));
      }
      return h('div', { class: 'rev' }, body);
    }));

    root.replaceChildren(
      h('div', { class: 'shead' }, h('div', { class: 'grow' }, h('h2', {}, 'Check your pantry'),
        h('div', { class: 'muted small' }, source === 'starter' ? 'A typical starter list. Untick what you do not use.' : `${rows.length} items found${flagged ? `, ${flagged} to double-check` : ''}. Tap a row to fix it.`)), close()),
      list,
      h('div', { class: 'sticky-foot row' },
        h('button', { class: 'btn', onclick: () => openSetup() }, 'Back'),
        h('button', { class: 'btn primary grow', disabled: !included.length, onclick: () => doImport(included) }, `Import ${included.length} item${included.length === 1 ? '' : 's'}`)));
  };
  draw();
  sheet.open(root);
}

function doImport(rows) {
  const t = now(), out = []; let kept = 0;
  for (const r of rows) {
    const name = r.name.trim(); if (!name) continue;
    const k = norm(name);
    const existing = ctx.items.find((i) => norm(i.name) === k || (i.keys || []).includes(k));
    const base = existing || makeItem({ name, gu: r.gu, cat: r.cat, form: r.form, color: r.color, keys: [...new Set([k, ...(r.keys || [])])], dsize: r.dsize }, t);
    const dimOk = !r.packs.length || r.packs.every((p) => p.u && ({ kg: 'g', g: 'g', lb: 'g', oz: 'g', l: 'ml', ml: 'ml', pc: 'pc' }[p.u]) === base.dim);
    // Importing twice must not double the stock: an item that already has packs keeps them.
    const packs = dimOk && !(existing && total(existing) > 0) ? r.packs : [];
    if (existing && !packs.length && r.packs.length) kept++;
    out.push(packs.length ? importPacks(base, packs, t).item : base);
  }
  ctx.store.saveItems(out, `Imported ${out.length} items`);
  sheet.close();
  toast(`${out.length} item${out.length === 1 ? '' : 's'} saved` + (kept ? `. ${kept} already had stock, so I left those amounts alone.` : '.'));
  ctx.tab = 'pantry'; ctx.render();
}

