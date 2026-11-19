// settings.js: per-phone preferences (units, appearance) plus set-up and sign-out.
import { ctx, saveSettings } from '../ctx.js';
import { h, icon, toast } from './dom.js';
import { openForm } from './form.js';

const seg = (opts, cur, on) => h('div', { class: 'seg', role: 'group' }, opts.map(([v, label]) => h('button', { 'aria-pressed': String(cur === v), onclick: () => on(v) }, label)));

export function settingsView() {
  const page = h('div', { class: 'page' });
  const row = (title, sub, onclick) => h('button', { class: 'setrow', onclick }, h('div', { class: 'tx' }, h('b', {}, title), h('span', {}, sub)), icon('right', 18));

  page.append(
    h('div', { class: 'list' },
      row('Set up pantry', 'Paste a list, load Excel or CSV, read a photo, or start from a typical pantry', async () => (await import('./setup.js')).openSetup()),
      row('Add an item', 'One at a time, with Gujarati name filled in for you', () => openForm())),
    h('div', {}, h('div', { class: 'sechead' }, h('b', {}, 'Show weights in')),
      seg([['metric', 'kg and g'], ['lb', 'lb and oz']], ctx.units, (v) => { saveSettings({ units: v }); ctx.render(); }),
      h('p', { class: 'muted small', style: 'margin-top:8px' }, 'Only changes how amounts are shown on this phone. Each pack keeps the size it was bought in.')),
    h('div', {}, h('div', { class: 'sechead' }, h('b', {}, 'Appearance')),
      seg([['system', 'Match phone'], ['light', 'Light'], ['dark', 'Dark']], ctx.theme, (v) => { saveSettings({ theme: v }); ctx.render(); })));

  if (ctx.mode === 'firebase') {
    page.append(h('div', { class: 'card stack' },
      h('b', {}, ctx.household?.name || 'Household'),
      h('div', { class: 'muted small' }, ctx.isAdmin ? `Admin · ${ctx.user?.email || 'Google account'}` : 'Family member on this phone'),
      h('button', { class: 'btn', onclick: () => ctx.signOut() }, 'Sign out')));
  } else {
    page.append(h('div', { class: 'card stack' },
      h('b', {}, 'Demo mode'),
      h('p', { class: 'muted small', style: 'line-height:1.5' }, 'Your pantry is saved on this phone only. To share it with your family, connect Firebase (see the README), then reopen the app.'),
      h('button', { class: 'btn danger', onclick: () => { if (confirm('Delete everything in this demo pantry?')) { ctx.store.reset(); toast('Demo pantry cleared'); } } }, 'Clear demo pantry')));
  }
  page.append(h('p', { class: 'muted small', style: 'text-align:center' }, 'Kothar · કોઠાર · v2'));
  return page;
}
