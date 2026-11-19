// sheets.js: item detail, "Bought" (any pack size/unit), and the Advanced partial-use sheet.
// Whole packs are the default path: Finished (one tap) and Bought. Partial use lives behind Advanced.
import { ctx, now, byId } from '../ctx.js';
import { U, UNITS_OF, toBase, fmt, packLabel } from '../units.js';
import { total, cap, est, daysLeft, status, openPack, sealedCount, addPacks, finishPack, takeAmount, setLeft, setList, CONFIG, DAY } from '../stock.js';
import { catName } from '../catalog.js';
import { h, icon, toast, sheet, shortName } from './dom.js';
import { tileEl } from './thumb.js';

const closeBtn = () => h('button', { class: 'iconbtn', 'aria-label': 'Close', onclick: () => sheet.close() }, icon('x', 18));

/** Run an action, save it, and offer Undo. `prev` is the item as it was before. */
export function apply(prev, res) {
  if (!res) return;
  ctx.store.saveItem(res.item, res.text);
  const restore = prev && prev.packs ? () => ctx.store.saveItem(prev, 'Undid: ' + res.text) : null;
  toast(res.msg, restore);
}

const openedText = (p) => {
  if (p.openedAt == null) return 'sealed';
  const d = Math.max(0, Math.floor((now() - p.openedAt) / DAY));
  return d === 0 ? 'opened today' : d === 1 ? 'opened yesterday' : `opened ${d} days ago`;
};

function usageText(it) {
  const e = est(it);
  if (!e) {
    const need = CONFIG.minSamples;
    return `Not enough history yet. After ${need} finished packs, Kothar learns how fast your family uses this and warns you before it runs out.`;
  }
  const wk = fmt(e.rate * 7, it.dim, ctx.units);
  const dl = daysLeft(it, now());
  const base = `Your family uses about ${wk} a week (learned from ${e.n} finished pack${e.n > 1 ? 's' : ''}).`;
  return e.n >= CONFIG.minSamples && dl != null && total(it) > 0 ? `${base} Roughly ${Math.round(dl)} days left.` : base;
}

/* ───────────────────────────────── item detail ───────────────────────────────── */

export function openItem(id) {
  const render = () => {
    const it = byId(id);
    if (!it) return null;
    const st = status(it, now());
    const op = openPack(it);
    const stock = total(it);

    const packs = it.packs.length
      ? h('div', { class: 'list' }, it.packs.map((p) => h('div', { class: 'packrow' },
        h('div', { class: 'grow' },
          h('div', { style: 'font-weight:600' }, `${p.label} pack `, h('span', { class: 'muted', style: 'font-weight:400' }, `· ${openedText(p)}`)),
          p.openedAt != null && p.left < p.amt ? h('div', { class: 'bar' + (st === 'low' ? ' low' : '') }, h('i', { style: `width:${Math.max(3, p.left / p.amt * 100)}%` })) : null),
        h('div', { class: 'muted', style: 'font-size:14px' }, fmt(p.left, it.dim, ctx.units)))))
      : h('div', { class: 'card muted' }, it.everStocked ? 'Nothing in stock. Tap Bought when you buy it.' : 'Tap Bought to say how much you have.');

    const finish = h('button', { class: 'btn primary grow', disabled: !it.packs.length, onclick: () => {
      apply(it, finishPack(it, null, now())); if (it.packs.length <= 1) sheet.close();
    } }, 'Finished');
    const bought = h('button', { class: 'btn grow' + (it.packs.length ? '' : ' primary'), onclick: () => openBought(it) }, it.packs.length ? 'Bought more' : 'Bought');

    return h('div', { class: 'stack' },
      h('div', { class: 'shead' }, tileEl(it, { label: false }),
        h('div', { class: 'grow' }, h('h2', {}, shortName(it.name)),
          h('div', { class: 'gu muted', style: 'font-size:14px' }, [it.gu, catName(it.cat)].filter(Boolean).join(' · ')),
          st !== 'in' ? h('span', { class: 'pill ' + st, style: 'margin-top:6px' }, h('i'), st === 'out' ? 'Out' : 'Running low') : null),
        closeBtn()),
      h('div', {}, h('span', { class: 'big' }, stock > 0 ? fmt(stock, it.dim, ctx.units) : it.everStocked ? 'Out' : 'No amount yet'), cap(it) > 0 && stock > 0 && stock < cap(it) ? h('span', { class: 'muted', style: 'margin-left:8px' }, `of ${fmt(cap(it), it.dim, ctx.units)}`) : null),
      packs,
      h('div', { class: 'row' }, finish, bought),
      it.packs.length ? h('div', { class: 'muted small' }, op || sealedCount(it)
        ? 'Finished closes the opened pack and opens the next sealed one for you.' : '') : null,
      it.packs.length ? h('details', { class: 'adv' },
        h('summary', {}, 'Advanced', icon('chev', 18)),
        h('div', { class: 'inner' },
          h('div', { class: 'muted small' }, 'Only if you want exact amounts. Finished is enough for predictions.'),
          h('div', { class: 'row' },
            h('button', { class: 'btn sm grow', onclick: () => openPartial(it.id, 'took') }, 'Took some out'),
            h('button', { class: 'btn sm grow', onclick: () => openPartial(it.id, 'left') }, "What's left")))) : null,
      h('div', { class: 'muted small', style: 'line-height:1.5' }, usageText(it)),
      h('div', { class: 'row' },
        h('button', { class: 'btn sm grow', onclick: () => { apply(null, setList(it, !it.onList)); toast(it.onList ? `${shortName(it.name)} removed from your list` : `${shortName(it.name)} added to your list`); } },
          it.onList ? 'Remove from shopping list' : 'Add to shopping list'),
        h('button', { class: 'btn sm', onclick: async () => (await import('./form.js')).openForm(it) }, 'Edit')));
  };
  const node = render();
  if (node) sheet.open(node, render);
}

/* ───────────────────────────────── Bought ───────────────────────────────── */

/**
 * "Bought": any pack size, any unit, any count. Takes the item object (a brand-new item may not have
 * reached the live list yet). `learn` = a barcode to remember for the whole family.
 */
export function openBought(item, opts = {}) {
  const st = { v: null, u: null, count: opts.count || 1 };
  const first = opts.pre || item.recent?.[0] || item.dsize || { v: 1, u: UNITS_OF[item.dim][0] };
  st.v = +first.v; st.u = first.u;
  const units = UNITS_OF[item.dim];
  if (!units.includes(st.u)) st.u = units[0];

  const chipsFor = () => {
    const seen = new Set(), out = [];
    const add = (r) => { if (!r) return; const k = `${+r.v}${r.u}`; if (!seen.has(k) && units.includes(r.u)) { seen.add(k); out.push({ v: +r.v, u: r.u }); } };
    (item.recent || []).forEach(add); add(item.dsize);
    (item.dim === 'ml' ? [[1, 'l'], [2, 'l'], [5, 'l']] : item.dim === 'pc' ? [[1, 'pc']] : [[500, 'g'], [1, 'kg'], [2, 'kg'], [5, 'kg'], [10, 'lb']]).forEach(([v, u]) => add({ v, u }));
    return out.slice(0, 6);
  };

  const root = h('div', { class: 'stack' });
  const draw = () => {
    const cur = byId(item.id) || item;
    const num = h('input', { type: 'text', inputmode: 'decimal', value: st.v || '', 'aria-label': 'Pack size', placeholder: '0', oninput: (e) => { st.v = parseFloat(e.target.value.replace(',', '.')) || 0; preview(); markChips(); } });
    const unitSeg = units.length > 1 ? h('div', { class: 'seg', role: 'group', 'aria-label': 'Unit' }, units.map((u) =>
      h('button', { 'aria-pressed': String(st.u === u), onclick: () => { st.u = u; draw(); } }, U[u].label))) : h('div', { class: 'muted', style: 'align-self:center' }, 'packs');
    const sizeChips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Sizes you have bought before' }, chipsFor().map((c) =>
      h('button', { class: 'chip', 'data-k': `${c.v}${c.u}`, 'aria-pressed': String(c.v === st.v && c.u === st.u), onclick: () => { st.v = c.v; st.u = c.u; draw(); } }, packLabel(c.v, c.u))));
    const after = h('div', { class: 'row', style: 'justify-content:space-between;font-size:14px' });
    const markChips = () => sizeChips.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === `${st.v}${st.u}`)));
    const addBtn = h('button', { class: 'btn primary', style: 'min-height:54px;font-size:17px', onclick: () => {
      if (!(st.v > 0)) return;
      const live = byId(item.id) || item;
      const res = addPacks(live, st.count, st.v, st.u, now());
      if (!res) return;
      apply(byId(item.id) ? live : null, res);
      if (opts.learn) ctx.store.saveBarcode(opts.learn, { itemId: item.id, v: st.v, u: st.u });
      sheet.close();
    } }, 'Add to pantry');
    const preview = () => {
      const was = total(cur), add = toBase(st.v || 0, st.u) * st.count;
      after.replaceChildren(h('span', { class: 'muted' }, "After this you'll have"),
        h('b', {}, st.v > 0 ? [h('span', { class: 'muted', style: 'font-weight:500' }, `${fmt(was, cur.dim, ctx.units)} → `), h('span', { style: 'color:var(--good)' }, fmt(was + add, cur.dim, ctx.units))] : '—'));
      addBtn.disabled = !(st.v > 0);
    };
    root.replaceChildren(
      h('div', { class: 'shead' }, tileEl(item, { label: false }), h('div', { class: 'grow' },
        h('div', { class: 'muted', style: 'font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.06em' }, 'Bought'),
        h('h2', {}, shortName(item.name))), closeBtn()),
      opts.learn ? h('div', { class: 'pill good', style: 'align-self:flex-start' }, h('i'), 'Barcode will be remembered for your family') : null,
      h('div', { class: 'card stack' },
        h('div', { class: 'muted small' }, 'How big was the pack?'),
        h('div', { class: 'row' }, h('div', { class: 'bignum grow' }, num), unitSeg),
        sizeChips,
        h('div', { style: 'height:1px;background:var(--line)' }),
        h('div', { class: 'row', style: 'justify-content:space-between' },
          h('div', {}, h('div', { style: 'font-weight:600' }, 'How many packs?'), h('div', { class: 'muted small' }, 'Each pack is tracked on its own')),
          h('div', { class: 'stepper' },
            h('button', { 'aria-label': 'Fewer packs', onclick: () => { st.count = Math.max(1, st.count - 1); draw(); } }, icon('minus', 18)),
            h('b', { 'aria-live': 'polite' }, st.count),
            h('button', { 'aria-label': 'More packs', onclick: () => { st.count = Math.min(50, st.count + 1); draw(); } }, icon('plus', 18))))),
      after, addBtn,
      h('div', { class: 'muted small', style: 'text-align:center' }, 'Sizes you bought before show above. Type any other size, in kg, g or lb.'));
    preview();
  };
  draw();
  sheet.open(root);
}

/* ───────────────────────── Advanced: took some out / what's left ───────────────────────── */

export function openPartial(id, mode0 = 'took') {
  const it0 = byId(id);
  if (!it0 || !it0.packs.length) return;
  const st = { mode: mode0, pid: (openPack(it0) || it0.packs[0]).id, v: '', u: UNITS_OF[it0.dim][0] };
  if (it0.dim === 'g' && ctx.units === 'lb') st.u = 'lb';
  const root = h('div', { class: 'stack' });

  const draw = () => {
    const it = byId(id); if (!it) return sheet.close();
    const p = it.packs.find((x) => x.id === st.pid) || it.packs[0]; st.pid = p.id;
    const units = UNITS_OF[it.dim];
    const amountBase = () => (parseFloat(String(st.v).replace(',', '.')) > 0 ? toBase(parseFloat(String(st.v).replace(',', '.')), st.u) : 0);
    const result = () => (st.mode === 'took' ? Math.max(0, p.left - amountBase()) : amountBase());
    const out = h('div', { class: 'row', style: 'justify-content:space-between' });
    const go = h('button', { class: 'btn primary', style: 'min-height:54px;font-size:17px', onclick: () => {
      const a = amountBase(); if (!(a > 0) && st.mode === 'took') return;
      apply(it, st.mode === 'took' ? takeAmount(it, p.id, a, now()) : setLeft(it, p.id, a, now()));
      sheet.close();
    } }, st.mode === 'took' ? 'Take it out' : 'Save');
    const refresh = () => {
      const a = amountBase();
      out.replaceChildren(h('span', { class: 'muted' }, st.mode === 'took' ? 'This pack will have' : 'This pack will have'),
        h('b', {}, (st.mode === 'took' && a <= 0) ? '—' : fmt(result(), it.dim, ctx.units) + (result() <= 0.5 ? ' (finished)' : ' left')));
      go.disabled = st.mode === 'took' ? a <= 0 : st.v === '';
    };
    const input = h('input', { type: 'text', inputmode: 'decimal', value: st.v, placeholder: '0', 'aria-label': 'Amount', oninput: (e) => { st.v = e.target.value; refresh(); } });
    const fr = (label, f) => h('button', { class: 'chip', onclick: () => {
      const base = st.mode === 'took' ? p.left * f : p.amt * f;
      const u = st.u, val = base / U[u].f;
      st.v = String(Number(val.toFixed(2))); draw();
    } }, label);

    root.replaceChildren(
      h('div', { class: 'shead' }, tileEl(it, { label: false }), h('div', { class: 'grow' }, h('h2', {}, shortName(it.name)), h('div', { class: 'muted small' }, 'Exact amounts')), closeBtn()),
      h('div', { class: 'seg', role: 'group' },
        h('button', { 'aria-pressed': String(st.mode === 'took'), onclick: () => { st.mode = 'took'; st.v = ''; draw(); } }, 'Took some out'),
        h('button', { 'aria-pressed': String(st.mode === 'left'), onclick: () => { st.mode = 'left'; st.v = ''; draw(); } }, "What's left")),
      it.packs.length > 1 ? h('div', { class: 'stack' }, h('div', { class: 'muted small' }, 'Which pack?'),
        h('div', { class: 'chips' }, it.packs.map((x) => h('button', { class: 'chip', 'aria-pressed': String(x.id === p.id), onclick: () => { st.pid = x.id; draw(); } },
          `${x.label} · ${fmt(x.left, it.dim, ctx.units)} left${x.openedAt == null ? ' (sealed)' : ''}`)))) : null,
      h('div', { class: 'card stack' },
        h('div', { class: 'muted small' }, st.mode === 'took' ? 'How much did you take out?' : 'How much is left in this pack?'),
        h('div', { class: 'row' }, h('div', { class: 'bignum grow' }, input),
          units.length > 1 ? h('div', { class: 'seg' }, units.map((u) => h('button', { 'aria-pressed': String(st.u === u), onclick: () => { st.u = u; st.v = ''; draw(); } }, U[u].label))) : null),
        h('div', { class: 'chips' }, st.mode === 'took'
          ? [fr('¼ of it', .25), fr('½', .5), fr('¾', .75)]
          : [fr('Full', 1), fr('¾', .75), fr('½', .5), fr('¼', .25), fr('Nearly empty', .05)])),
      out, go);
    refresh();
  };
  draw();
  sheet.open(root);
}
