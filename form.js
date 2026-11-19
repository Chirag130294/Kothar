// form.js: add / edit an item. Typing the English name fills the Gujarati name, category, packaging look
// and usual size from the dictionary (or a phonetic guess). Everything stays editable.
import { ctx, now, byId } from '../ctx.js';
import { CATS, FORMS, PALETTE, lookup, toGu, guessCat, guessLook, norm } from '../catalog.js';
import { U, UNITS_OF } from '../units.js';
import { makeItem } from '../stock.js';
import { h, icon, sheet, toast } from './dom.js';
import { tileEl, safeColor } from './thumb.js';
import { openBought } from './sheets.js';

const SIZE_UNITS = ['kg', 'g', 'lb', 'l', 'ml'];

/** Resize a chosen photo to a ~96px square JPEG data URL (small enough to live inside the item). */
function readPhoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = 96, c = document.createElement('canvas'); c.width = c.height = s;
      const side = Math.min(img.width, img.height), sx = (img.width - side) / 2, sy = (img.height - side) / 2;
      c.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, s, s);
      URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not an image.')); };
    img.src = url;
  });
}

export function openForm(item = null, prefillName = '') {
  const editing = !!item;
  const f = editing
    ? { name: item.name, gu: item.gu, cat: item.cat, form: item.form, color: item.color, size: item.dsize.v, unit: item.dsize.u, photo: item.photo, keys: item.keys || [] }
    : { name: prefillName, gu: '', cat: CATS[0].id, form: 'jar', color: PALETTE[0], size: 1, unit: 'kg', photo: null, keys: [] };
  let guEdited = editing && !!item.gu;     // once typed by hand, stop auto-filling
  let lookEdited = editing;
  let picked = null;

  const root = h('div', { class: 'stack' });
  const previewBox = h('div', { class: 'shead' });
  const sugg = h('div', { class: 'chips' });

  const autoFill = () => {
    const hits = lookup(f.name);
    picked = hits[0] && hits[0].s >= 60 ? hits[0].e : null;
    if (!editing) {
      sugg.replaceChildren(...hits.filter((r) => r.s >= 45).slice(0, 5).map((r) => h('button', { class: 'chip', onclick: () => take(r.e) }, r.e.en)));
    }
    if (!guEdited) f.gu = picked ? picked.gu : f.name.trim() ? toGu(f.name) : '';
    if (!lookEdited) {
      if (picked) Object.assign(f, { cat: picked.cat, form: picked.form, color: picked.color, size: picked.size, unit: picked.unit });
      else if (f.name.trim()) { const c = guessCat(f.name); const l = guessLook(f.name, c, f.size, f.unit); Object.assign(f, { cat: c, form: l.form, color: l.color }); }
    }
  };
  const take = (e) => {
    Object.assign(f, { name: e.en, gu: e.gu, cat: e.cat, form: e.form, color: e.color, size: e.size, unit: e.unit, keys: e.keys });
    guEdited = false; lookEdited = false; picked = e; draw();
  };
  const drawPreview = () => {
    const tmp = { name: f.name || 'New item', gu: f.gu, form: f.form, color: f.color, photo: f.photo, packs: [], dim: 'g', lifespans: [] };
    previewBox.replaceChildren(tileEl(tmp, { label: true }), h('div', { class: 'grow' },
      h('h2', {}, editing ? 'Edit item' : 'Add item'),
      h('div', { class: 'muted small' }, 'The picture is drawn for you. Change it below if you like.')),
      h('button', { class: 'iconbtn', 'aria-label': 'Close', onclick: () => sheet.close() }, icon('x', 18)));
  };

  const draw = () => {
    drawPreview();
    const name = h('input', { type: 'text', value: f.name, maxlength: 80, autocomplete: 'off', placeholder: 'e.g. Toor Dal', 'aria-label': 'Name',
      oninput: (e) => { f.name = e.target.value; autoFill(); drawPreview(); guInput.value = f.gu; refreshTag(); syncLook(); } });
    const guInput = h('input', { type: 'text', value: f.gu, maxlength: 80, class: 'gu', autocomplete: 'off', placeholder: 'ગુજરાતી નામ', 'aria-label': 'Gujarati name',
      oninput: (e) => { f.gu = e.target.value; guEdited = true; refreshTag(); drawPreview(); } });
    const tag = h('span', { class: 'pill', style: 'align-self:flex-start' });
    const resetBtn = h('button', { class: 'btn link', style: 'min-height:32px;padding:0', onclick: () => { guEdited = false; autoFill(); guInput.value = f.gu; refreshTag(); drawPreview(); } }, 'Reset');
    const refreshTag = () => {
      tag.replaceChildren(guEdited ? 'Edited by you' : 'Filled in automatically');
      resetBtn.hidden = !guEdited;
    };
    const cat = h('select', { 'aria-label': 'Category', onchange: (e) => { f.cat = e.target.value; lookEdited = true; } }, CATS.map((c) => h('option', { value: c.id, selected: c.id === f.cat }, c.name)));
    const size = h('input', { type: 'text', inputmode: 'decimal', value: f.size, 'aria-label': 'Usual pack size', oninput: (e) => { f.size = parseFloat(e.target.value.replace(',', '.')) || 0; } });
    const unit = h('select', { 'aria-label': 'Unit', onchange: (e) => { f.unit = e.target.value; } }, SIZE_UNITS.map((u) => h('option', { value: u, selected: u === f.unit }, U[u].label)));
    const forms = h('div', { class: 'chips', role: 'group', 'aria-label': 'Packaging look' }, Object.entries(FORMS).map(([k, label]) =>
      h('button', { class: 'chip', 'aria-pressed': String(f.form === k), onclick: () => { f.form = k; lookEdited = true; draw(); } }, label)));
    const swatchBtns = () => [...new Set([f.color, ...PALETTE])].map((c) =>
      h('button', { 'aria-label': 'Colour ' + c, 'aria-pressed': String(f.color === c), style: `width:36px;height:36px;border-radius:18px;border:0;background:${safeColor(c)};box-shadow:${f.color === c ? '0 0 0 3px var(--bg),0 0 0 5px var(--tint)' : 'inset 0 0 0 1px var(--line2)'}`,
        onclick: () => { f.color = c; lookEdited = true; draw(); } }));
    const swatches = h('div', { class: 'chips', role: 'group', 'aria-label': 'Colour' }, swatchBtns());
    const photoIn = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try { f.photo = await readPhoto(file); draw(); } catch (err) { toast(err.message); }
    } });

    const save = h('button', { class: 'btn primary', style: 'min-height:54px;font-size:17px', onclick: () => {
      const nm = f.name.trim();
      if (!nm) { name.focus(); return; }
      if (!(f.size > 0)) { size.focus(); return; }
      if (!UNITS_OF[U[f.unit].dim].includes(f.unit)) return;
      const keys = [...new Set([norm(nm), ...(f.keys || [])])];
      if (editing) {
        const cur = byId(item.id) || item;
        const dim = U[f.unit].dim;
        if (cur.packs.length && dim !== cur.dim) { toast('This item already has stock in a different kind of unit (weight vs liquid).'); return; }
        ctx.store.saveItem({ ...cur, name: nm, gu: f.gu.trim(), cat: f.cat, form: f.form, color: f.color, photo: f.photo || null, keys, dim, dsize: { v: f.size, u: f.unit } }, `Edited ${nm}`);
        sheet.close(); toast('Saved');
      } else {
        const dup = ctx.items.find((i) => norm(i.name) === norm(nm));
        if (dup) { toast(`${dup.name} is already in your pantry.`); return; }
        const it = makeItem({ name: nm, gu: f.gu, cat: f.cat, form: f.form, color: f.color, keys, dsize: { v: f.size, u: f.unit }, photo: f.photo }, now());
        ctx.store.saveItem(it, `Added ${nm}`);
        openBought(it);            // "How much do you have?" straight away
      }
    } }, editing ? 'Save' : 'Add and set stock');

    root.replaceChildren(previewBox,
      h('label', { class: 'f' }, 'Name', name), editing ? null : sugg,
      h('label', { class: 'f' }, 'Gujarati name', guInput),
      h('div', { class: 'row' }, tag, resetBtn),
      h('label', { class: 'f' }, 'Category', cat),
      h('div', { class: 'row', style: 'align-items:flex-end' }, h('label', { class: 'f grow' }, 'Usual pack size', size), h('label', { class: 'f', style: 'width:96px' }, 'Unit', unit)),
      h('div', { class: 'stack' }, h('div', { class: 'muted small', style: 'font-weight:600' }, 'Picture'), forms, swatches,
        h('div', { class: 'row' },
          h('button', { class: 'btn sm', onclick: () => photoIn.click() }, f.photo ? 'Change photo' : 'Use my own photo'),
          f.photo ? h('button', { class: 'btn sm link', onclick: () => { f.photo = null; draw(); } }, 'Remove photo') : null, photoIn)),
      save,
      editing ? h('button', { class: 'btn danger link', onclick: () => {
        if (confirm(`Delete ${item.name}? Its history is lost.`)) { ctx.store.deleteItem(item.id); sheet.close(); toast(`${item.name} deleted`); }
      } }, 'Delete item') : null);
    refreshTag();
    // While typing the name the dictionary may change category, size, look: update those controls in place
    // (a full redraw would drop the keyboard).
    function syncLook() {
      cat.value = f.cat; size.value = f.size; unit.value = f.unit;
      Object.keys(FORMS).forEach((k, i) => forms.children[i].setAttribute('aria-pressed', String(f.form === k)));
      swatches.replaceChildren(...swatchBtns());
    }
  };
  if (!editing && f.name) autoFill();
  draw();
  sheet.open(root);
}
