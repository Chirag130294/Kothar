// settings.js: "On this phone" preferences, "Shared with the family" settings (admin edits), set-up and sign-out.
// Shared settings live in the household's config doc, so changing them never needs an app update.
import { ctx, saveSettings, ACCENTS } from '../ctx.js';
import { CATS, DEFAULT_CATS, toGu } from '../catalog.js';
import { TUNE_DEFAULTS } from '../stock.js';
import { h, icon, toast, sheet } from './dom.js';
import { openForm } from './form.js';

const seg = (opts, cur, on) => h('div', { class: 'seg', role: 'group' }, opts.map(([v, label]) => h('button', { 'aria-pressed': String(cur === v), onclick: () => on(v) }, label)));
const setPref = (patch) => { saveSettings({ prefs: { ...ctx.prefs, ...patch } }); ctx.render(); };

const group = (title, sub, ...kids) => h('section', { class: 'sgroup' },
  h('div', { class: 'sechead' }, h('b', {}, title), sub ? h('span', {}, sub) : null), ...kids);
const field = (label, hint, control) => h('div', { class: 'sfield' }, h('div', { class: 'stx' }, h('b', {}, label), hint ? h('span', {}, hint) : null), control);

/** − n + control for small whole numbers. */
function stepper(value, min, max, onChange, disabled) {
  const b = (d, ic, lab) => h('button', { class: 'iconbtn', 'aria-label': lab, disabled: disabled || value + d < min || value + d > max ? true : null, onclick: () => onChange(value + d) }, icon(ic, 16));
  return h('div', { class: 'stepper' }, b(-1, 'minus', 'Less'), h('b', { class: 'usen' }, String(value)), b(1, 'plus', 'More'));
}

export function settingsView() {
  const page = h('div', { class: 'page' });
  const row = (title, sub, onclick) => h('button', { class: 'setrow', onclick }, h('div', { class: 'tx' }, h('b', {}, title), h('span', {}, sub)), icon('right', 18));
  const p = ctx.prefs;
  const can = ctx.isAdmin;
  const tune = { ...TUNE_DEFAULTS, ...(ctx.config.tune || {}) };
  const setTune = (patch) => { ctx.store.saveConfig({ ...ctx.config, tune: { ...tune, ...patch } }); };

  page.append(
    h('div', { class: 'list' },
      row('Set up pantry', 'Paste a list, load Excel or CSV, read a photo, or start from a typical pantry', async () => (await import('./setup.js')).openSetup()),
      row('Add an item', 'One at a time, with Gujarati name filled in for you', () => openForm())),

    group('On this phone', 'Only changes how the app looks here',
      field('Weights shown in', 'Each pack keeps the size it was bought in', seg([['metric', 'kg, g'], ['lb', 'lb, oz']], ctx.units, (v) => { saveSettings({ units: v }); ctx.render(); })),
      field('Appearance', null, seg([['system', 'Phone'], ['light', 'Light'], ['dark', 'Dark']], ctx.theme, (v) => { saveSettings({ theme: v }); ctx.render(); })),
      field('Accent colour', null, h('div', { class: 'swatches', role: 'group', 'aria-label': 'Accent colour' }, Object.entries(ACCENTS).map(([k, [light]]) =>
        h('button', { class: 'sw', 'aria-label': k, 'aria-pressed': String(p.accent === k), style: `background:${light}`, onclick: () => setPref({ accent: k }) }, p.accent === k ? icon('check', 14) : null)))),
      field('Thumbnail size', 'How many fit across the screen', seg([['s', 'Small'], ['m', 'Medium'], ['l', 'Large']], p.tile, (v) => setPref({ tile: v }))),
      field('Gujarati names', 'On thumbnails and in lists', seg([[true, 'Show'], [false, 'Hide']].map(([v, l]) => [String(v), l]), String(p.gujarati !== false), (v) => setPref({ gujarati: v === 'true' }))),
      field('Swipe left to use', 'In list view, swipe a row to take a pack out', seg([['true', 'On'], ['false', 'Off']], String(p.swipe !== false), (v) => setPref({ swipe: v === 'true' }))),
      field('Open the app on', null, seg([['pantry', 'Pantry'], ['shopping', 'Shopping']], p.startTab, (v) => setPref({ startTab: v })))),

    group('Shared with the family', can ? 'Everyone sees these' : 'Only the admin can change these',
      row('Categories', `${CATS.length} categories · rename, reorder, add or remove`, () => (can ? openCategories() : toast('Ask the admin to change categories.'))),
      field('Learn after', 'Finished packs before Kothar predicts for an item', stepper(tune.minSamples, 1, 10, (v) => setTune({ minSamples: v }), !can)),
      field('Warn at least', 'Days before an item runs out', stepper(tune.leadMin, 1, 30, (v) => setTune({ leadMin: v }), !can)),
      field('Warn at most', 'Days before, for slow-moving items', stepper(tune.leadMax, 1, 60, (v) => setTune({ leadMax: v }), !can)),
      field('Dismissed suggestions return after', 'Days', stepper(tune.snoozeMin, 1, 30, (v) => setTune({ snoozeMin: v }), !can)),
      can && (ctx.config.tune || ctx.config.categories) ? h('button', { class: 'btn sm', onclick: () => { if (confirm('Put categories and prediction settings back to the defaults for everyone?')) { ctx.store.saveConfig({}); toast('Settings reset'); } } }, 'Reset shared settings') : null));

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

/* ───────────────────────────── categories editor ───────────────────────────── */

function openCategories() {
  let list = CATS.map((c) => ({ ...c }));
  const count = (id) => ctx.items.filter((i) => i.cat === id).length;
  const root = h('div', { class: 'stack' });
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; draw(); };
  const draw = () => {
    root.replaceChildren(
      h('div', { class: 'shead' }, h('div', { class: 'grow' }, h('h2', {}, 'Categories'), h('div', { class: 'muted small' }, 'These are the rows on the home screen, in this order.')),
        h('button', { class: 'iconbtn', 'aria-label': 'Close', onclick: () => sheet.close() }, icon('x', 18))),
      h('div', { class: 'list' }, list.map((c, i) => h('div', { class: 'catedit' },
        h('div', { class: 'grow stack', style: 'gap:6px' },
          h('input', { type: 'text', value: c.name, maxlength: 40, placeholder: 'Name', 'aria-label': 'Category name', oninput: (e) => { c.name = e.target.value; } }),
          h('input', { type: 'text', value: c.gu, maxlength: 40, placeholder: 'ગુજરાતી (optional, filled in for you)', 'aria-label': 'Gujarati name', oninput: (e) => { c.gu = e.target.value; } }),
          h('div', { class: 'muted small' }, `${count(c.id)} item${count(c.id) === 1 ? '' : 's'}`)),
        h('div', { class: 'catbtns' },
          h('button', { class: 'iconbtn', 'aria-label': 'Move up', disabled: i === 0 ? true : null, onclick: () => move(i, -1) }, icon('chev', 16)),
          h('button', { class: 'iconbtn', 'aria-label': 'Move down', disabled: i === list.length - 1 ? true : null, onclick: () => move(i, 1) }, icon('chev', 16)),
          h('button', { class: 'iconbtn', 'aria-label': `Remove ${c.name}`, disabled: list.length <= 1 ? true : null, onclick: () => {
            const n = count(c.id);
            if (n && !confirm(`${n} item${n === 1 ? '' : 's'} in ${c.name} will move to "Other" until you give them a new category. Remove it?`)) return;
            list.splice(i, 1); draw();
          } }, icon('x', 16))))) ),
      h('div', { class: 'row' },
        h('button', { class: 'btn grow', onclick: () => { list.push({ id: 'c' + Math.random().toString(36).slice(2, 8), name: '', gu: '' }); draw(); root.querySelector('.catedit:last-child input')?.focus(); } }, 'Add a category'),
        h('button', { class: 'btn', onclick: () => { list = DEFAULT_CATS.map((c) => ({ ...c })); draw(); } }, 'Defaults')),
      h('button', { class: 'btn primary', style: 'min-height:54px', onclick: () => {
        const clean = list.map((c) => ({ id: c.id, name: c.name.trim(), gu: (c.gu || '').trim() })).filter((c) => c.name);
        if (!clean.length) { toast('Keep at least one category.'); return; }
        clean.forEach((c) => { if (!c.gu) c.gu = toGu(c.name); });
        ctx.store.saveConfig({ ...ctx.config, categories: clean });
        sheet.close(); toast('Categories saved');
      } }, 'Save'));
  };
  sheet.open(root); draw();
}
