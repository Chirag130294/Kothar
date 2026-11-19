// pantry.js: the home screen. Categories stack vertically; each category is a horizontal rail whose
// next tile peeks in from the right (about 20%), Netflix-style, so people see there is more to swipe.
import { ctx, stat } from '../ctx.js';
import { CATS, lookup, norm } from '../catalog.js';
import { h, sheet, icon } from './dom.js';
import { railTile } from './thumb.js';
import { openItem } from './sheets.js';
import { openForm } from './form.js';

const rank = { out: 0, low: 1, in: 2, new: 3 };
const order = (a, b) => rank[stat(a)] - rank[stat(b)] || a.name.localeCompare(b.name);

export function matches(it, q) {
  if (!q) return true;
  return [it.name, it.gu, ...(it.keys || [])].some((s) => norm(s).includes(q) || (s || '').toLowerCase().includes(q));
}

export function pantryView() {
  const page = h('div', { class: 'page', style: 'padding:6px 0 0;gap:0' });
  const q = norm(ctx.query);

  if (!ctx.items.length && !q) {
    page.append(h('div', { class: 'empty', style: 'padding:40px var(--gut)' },
      h('h2', {}, 'Your pantry is empty'),
      h('p', { class: 'muted' }, 'Set it up in a minute: paste your list, load a spreadsheet, or scan a photo. Or add items one at a time.'),
      h('button', { class: 'btn primary', style: 'min-height:54px', onclick: async () => (await import('./setup.js')).openSetup() }, 'Set up my pantry'),
      h('button', { class: 'btn', onclick: () => openForm() }, 'Add one item')));
    return page;
  }

  const shown = ctx.items.filter((i) => matches(i, q));
  if (q) {
    const have = new Set(ctx.items.map((i) => norm(i.name)));
    const ideas = lookup(ctx.query).filter((r) => !have.has(norm(r.e.en))).slice(0, 4);
    if (!shown.length) {
      page.append(h('div', { class: 'empty', style: 'padding:24px var(--gut)' },
        h('p', {}, `Nothing in your pantry matches "${ctx.query}".`),
        ...ideas.map((r) => h('button', { class: 'btn', onclick: () => openForm(null, r.e.en) }, `Add ${r.e.en}  ${r.e.gu}`)),
        h('button', { class: 'btn primary', onclick: () => openForm(null, ctx.query) }, `Add "${ctx.query}" as a new item`)));
      return page;
    }
  }

  for (const cat of CATS) {
    const list = shown.filter((i) => i.cat === cat.id).sort(order);
    if (!list.length) continue;
    const low = list.filter((i) => stat(i) !== 'in').length;
    page.append(h('section', { class: 'cat', 'aria-label': cat.name },
      h('div', { class: 'cathead' },
        h('div', { class: 'catname' }, cat.name, h('span', { class: 'gu' }, cat.gu)),
        h('button', { class: 'seeall', onclick: () => openCategory(cat.id) }, low ? `${low} low · See all ${list.length}` : `See all ${list.length}`)),
      h('div', { class: 'rail', role: 'list', tabindex: '-1' }, list.map((it) => railTile(it, (x) => openItem(x.id))))));
  }
  // Items whose category no longer exists still show up.
  const known = new Set(CATS.map((c) => c.id));
  const stray = shown.filter((i) => !known.has(i.cat)).sort(order);
  if (stray.length) page.append(h('section', { class: 'cat' }, h('div', { class: 'cathead' }, h('div', { class: 'catname' }, 'Other')),
    h('div', { class: 'rail' }, stray.map((it) => railTile(it, (x) => openItem(x.id))))));
  return page;
}

/** "See all": the whole category as a grid. */
export function openCategory(id) {
  const cat = CATS.find((c) => c.id === id);
  const list = ctx.items.filter((i) => i.cat === id).sort(order);
  sheet.open(h('div', { class: 'stack' },
    h('div', { class: 'shead' }, h('div', { class: 'grow' }, h('h2', {}, cat.name), h('div', { class: 'gu muted' }, cat.gu)),
      h('button', { class: 'iconbtn', 'aria-label': 'Close', onclick: () => sheet.close() }, icon('x', 18))),
    h('div', { class: 'grid' }, list.map((it) => railTile(it, (x) => openItem(x.id))))));
}

