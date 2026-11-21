// listview.js: the compact "table" view of the pantry, with swipe-left to take packs out.
//   Swipe a row left (finger or mouse):
//     - one pack size in the pantry  -> one pack is removed right away (Undo is offered)
//     - several pack sizes           -> a small sheet asks which size and how many
//   The "Used" button on every row opens that same sheet, so any number of packs can be taken at once.
import { ctx, stat, saveSettings } from '../ctx.js';
import { packGroups } from '../stock.js';
import { h, icon, shortName } from './dom.js';
import { tileEl, qtyText } from './thumb.js';
import { openItem, openUse, useQuick } from './sheets.js';

const TRIGGER = 80;          // px of leftward drag that counts as a swipe
const MAX_DRAG = 140;

export const packsText = (it) => {
  const g = packGroups(it);
  return g.length ? g.map((x) => `${x.label}${x.count > 1 ? ` ×${x.count}` : ''}`).join(', ') : 'No stock';
};

/** Pointer-based swipe (works with a finger and with a mouse). Vertical scrolling is left alone. */
function enableSwipe(main, rowEl, onFire) {
  let x0 = 0, y0 = 0, dx = 0, live = false, locked = false, pid = null;
  const reset = () => { main.style.transform = ''; rowEl.classList.remove('drag', 'armed'); };
  main.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || e.target.closest('.lused')) return;
    x0 = e.clientX; y0 = e.clientY; dx = 0; live = true; locked = false; pid = e.pointerId;
  });
  main.addEventListener('pointermove', (e) => {
    if (!live || e.pointerId !== pid) return;
    const ax = e.clientX - x0, ay = e.clientY - y0;
    if (!locked) {
      if (Math.abs(ay) > 10 && Math.abs(ay) > Math.abs(ax)) { live = false; return; }
      if (Math.abs(ax) < 8 || Math.abs(ax) < Math.abs(ay) * 1.5) return;
      locked = true; rowEl.classList.add('drag');
      try { main.setPointerCapture(pid); } catch { /* not capturable: fine */ }
    }
    dx = Math.min(0, Math.max(-MAX_DRAG, ax));
    main.style.transform = `translateX(${dx}px)`;
    rowEl.classList.toggle('armed', dx <= -TRIGGER);
  });
  const finish = (fire) => {
    if (!live) return; live = false;
    if (!locked) return;
    const go = fire && dx <= -TRIGGER;
    reset();
    main.dataset.sw = '1'; setTimeout(() => { delete main.dataset.sw; }, 80);   // the drag must not count as a tap
    if (go) onFire();
  };
  main.addEventListener('pointerup', () => finish(true));
  main.addEventListener('pointercancel', () => finish(false));
  main.addEventListener('click', (e) => { if (main.dataset.sw) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
}

function row(it) {
  const st = stat(it);
  const rowEl = h('div', { class: 'trow ' + st + (ctx.prefs.swipe === false ? ' noswipe' : '') });
  const open = () => openItem(it.id);
  const main = h('div', { class: 'lmain', role: 'button', tabindex: '0', 'aria-label': `${it.name}, ${qtyText(it)}, ${packsText(it)}`,
    onclick: open, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } } },
  tileEl(it, { label: false }),
  h('div', { class: 'lname' }, h('b', {}, shortName(it.name)),
    h('span', { class: 'lsub' }, h('span', { class: 'gu' }, it.gu), h('span', { class: 'inpacks' }, ` · ${packsText(it)}`))),
  h('div', { class: 'lpacks' }, packsText(it)),
  h('div', { class: 'lqty ' + st }, qtyText(it)),
  h('button', { class: 'lused', 'aria-label': `Used some ${shortName(it.name)}`, title: 'Took some out', onclick: (e) => { e.stopPropagation(); openUse(it); } }, icon('minus', 16), 'Used'));
  rowEl.append(h('div', { class: 'lact', 'aria-hidden': 'true' }, h('span', { class: 'go' }, 'Release to use'), h('span', { class: 'pull' }, 'Swipe to use'), icon('minus', 18)), main);
  if (ctx.prefs.swipe !== false) enableSwipe(main, rowEl, () => useQuick(it));
  return rowEl;
}

export const listRows = (items) => h('div', { class: 'llist', role: 'list' }, items.map(row));

/**
 * The whole pantry as one table: a band per category (tap to collapse or expand) followed by its rows.
 * groups = [{id, name, gu, items}]. While searching, every category stays open so matches are never hidden.
 */
export function listTable(groups, { searching = false } = {}) {
  const isShut = (id) => !searching && ctx.collapsed.includes(id);
  const setShut = (ids) => { saveSettings({ collapsed: ids }); ctx.render(); };
  const toggle = (id) => setShut(isShut(id) ? ctx.collapsed.filter((x) => x !== id) : [...ctx.collapsed, id]);
  const allShut = groups.every((g) => isShut(g.id));
  const table = h('div', { class: 'llist', role: 'table' });
  for (const g of groups) {
    const shut = isShut(g.id);
    const low = g.items.filter((i) => stat(i) === 'low' || stat(i) === 'out').length;
    table.append(h('button', { class: 'lgh' + (shut ? ' shut' : ''), 'aria-expanded': String(!shut), disabled: searching ? true : null, onclick: () => toggle(g.id) },
      icon('chev', 18), h('span', { class: 'lgn' }, g.name, g.gu ? h('span', { class: 'gu' }, g.gu) : null),
      low ? h('span', { class: 'pill low lgl' }, h('i'), `${low} low`) : null,
      h('span', { class: 'lgc' }, `${g.items.length}`)));
    if (!shut) for (const it of g.items) table.append(row(it));
  }
  return h('div', {},
    searching ? null : h('div', { class: 'ltools' },
      h('button', { class: 'seeall', onclick: () => setShut(allShut ? [] : groups.map((g) => g.id)) }, allShut ? 'Expand all' : 'Collapse all')),
    table);
}
