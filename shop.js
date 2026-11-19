// shop.js: the Shopping tab. "To buy" = out of stock or added by someone. "Suggested for you" = items the
// predictor thinks are about to run out. Tapping Bought opens the same sheet as everywhere else.
import { ctx, now } from '../ctx.js';
import { toBuy, suggestions, daysLeft, est, setList, snooze, total, CONFIG } from '../stock.js';
import { fmt } from '../units.js';
import { h, icon, toast, shortName } from './dom.js';
import { tileEl } from './thumb.js';
import { apply, openBought, openItem } from './sheets.js';

const lastSize = (it) => it.recent?.[0] || it.dsize;

function row(it, right, sub) {
  return h('div', { class: 'lrow' },
    h('button', { class: 'iconbtn', style: 'width:44px;height:44px;border-radius:14px;padding:0;background:none;box-shadow:none', 'aria-label': `Open ${it.name}`, onclick: () => openItem(it.id) }, tileEl(it, { label: false })),
    h('div', { class: 'tx' }, h('b', {}, shortName(it.name)), h('span', {}, sub)),
    right);
}

export function shoppingView() {
  const list = toBuy(ctx.items);
  const sugg = suggestions(ctx.items, now());
  const page = h('div', { class: 'page' });

  page.append(h('div', {},
    h('div', { class: 'sechead' }, h('b', {}, 'To buy'), h('span', {}, `${list.length} item${list.length === 1 ? '' : 's'}`)),
    list.length ? h('div', { class: 'list' }, list.map((it) => {
      const out = total(it) <= 0;
      return row(it, h('div', { class: 'row', style: 'gap:6px' },
        h('button', { class: 'btn sm primary', onclick: () => openBought(it, { pre: lastSize(it) }) }, 'Bought'),
        out ? null : h('button', { class: 'iconbtn', 'aria-label': 'Remove from list', style: 'width:40px;height:40px', onclick: () => { apply(it, setList(it, false)); } }, icon('x', 16))),
        out ? 'Out of stock' : `Added to list · ${fmt(total(it), it.dim, ctx.units)} left`);
    })) : h('div', { class: 'card muted' }, 'Nothing to buy. Items appear here when you finish the last pack, or add them from the item sheet.'),
    list.length ? h('div', { class: 'row', style: 'margin-top:10px' },
      h('button', { class: 'btn sm grow', onclick: () => shareList(list) }, [icon('copy', 16), ' Copy or share list'])) : null));

  page.append(h('div', {},
    h('div', { class: 'sechead' }, h('b', {}, 'Suggested for you'), h('span', {}, 'Based on how fast you use things')),
    sugg.length ? h('div', { class: 'stack', style: 'gap:10px' }, sugg.map((it) => {
      const e = est(it), dl = Math.round(daysLeft(it, now()));
      return h('div', { class: 'card', style: 'padding:12px 14px' }, row(it,
        h('div', { class: 'row', style: 'gap:6px' },
          h('button', { class: 'btn sm primary', onclick: () => { apply(it, setList(it, true)); toast(`${shortName(it.name)} added to your list`); } }, 'Add'),
          h('button', { class: 'iconbtn', 'aria-label': 'Dismiss suggestion', style: 'width:40px;height:40px', onclick: () => { apply(it, snooze(it, now())); toast("Okay, I'll check again later"); } }, icon('x', 16))),
        `${dl <= 0 ? 'Almost out' : `~${dl} day${dl === 1 ? '' : 's'} left`} · ${fmt(total(it), it.dim, ctx.units)} · from ${e.n} packs`));
    })) : h('div', { class: 'card muted small', style: 'line-height:1.5' },
      `No suggestions yet. After an item has had ${CONFIG.minSamples} packs finished, Kothar learns how long it lasts and nudges you before it runs out.`)));
  return page;
}

async function shareList(list) {
  const text = 'Shopping list\n' + list.map((it) => `• ${shortName(it.name)}${it.gu ? ' (' + it.gu + ')' : ''}${it.recent?.[0] ? ' – last bought ' + it.recent[0].v + ' ' + it.recent[0].u : ''}`).join('\n');
  try {
    if (navigator.share) { await navigator.share({ text }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text); toast('List copied'); } catch { toast('Could not copy. Select and copy it manually.'); }
}
