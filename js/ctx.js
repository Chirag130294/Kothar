// ctx.js: the one shared state object. UI modules read it and call ctx.render(); app.js owns the wiring.
import { status, total, toBuy, suggestions, applyTune } from './stock.js';
import { setCats } from './catalog.js';

export const ctx = {
  mode: 'demo',            // 'demo' (this phone only) | 'firebase'
  store: null,             // see store-local.js / store-firebase.js for the interface
  items: [], barcodes: {}, members: [], wants: [], config: {},   // wants = one-time shopping items; config = shared settings
  user: null, hid: null, household: null, isAdmin: false, invite: null,
  tab: 'pantry', query: '', myName: null,
  units: 'metric', theme: 'system', view: 'rails', collapsed: [], prefs: { accent: 'orange', tile: 'm', gujarati: true, swipe: true, startTab: 'pantry' },   // view: 'rails' (thumbnails) | 'list' (table)
  sheetLive: null,         // function that re-renders the open sheet when data changes (item sheet only)
  render() {}, signOut() {}, invites: null,   // filled in by app.js
};

export const now = () => Date.now();
/** Who is acting on this phone, for "added by" labels. */
export const who = () => ctx.myName || (ctx.user && ctx.user.displayName ? ctx.user.displayName.split(' ')[0] : null) || (ctx.mode === 'demo' ? 'Me' : 'Someone');
export const byId = (id) => ctx.items.find((i) => i.id === id);
export const stat = (it) => status(it, now());

/* ----- per-device settings (not shared with the family) ----- */
const KEY = 'kothar-settings';
export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (s.units === 'lb' || s.units === 'metric') ctx.units = s.units;
    if (['system', 'light', 'dark'].includes(s.theme)) ctx.theme = s.theme;
    if (s.view === 'list' || s.view === 'rails') ctx.view = s.view;
    if (Array.isArray(s.collapsed)) ctx.collapsed = s.collapsed.filter((x) => typeof x === 'string');
    if (s.prefs && typeof s.prefs === 'object') ctx.prefs = { ...ctx.prefs, ...s.prefs };
  } catch { /* private mode: defaults are fine */ }
  applyTheme();
}
export function saveSettings(patch) {
  Object.assign(ctx, patch);
  try { localStorage.setItem(KEY, JSON.stringify({ units: ctx.units, theme: ctx.theme, view: ctx.view, collapsed: ctx.collapsed, prefs: ctx.prefs })); } catch { /* ignore */ }
  applyTheme();
}
export const ACCENTS = {   // [light, dark] pairs for --accent: restrained, used for primary actions only
  blue: ['#0B63CE', '#5B9DF5'], green: ['#2F7D4F', '#5FBF86'], teal: ['#0F766E', '#4FC3B5'],
  terracotta: ['#B4532A', '#E58A5E'], graphite: ['#374151', '#C7CCD4'],
};
export const TILE_ACROSS = { s: 5.2, m: 4.2, l: 3.2 };   // tiles per row; the .2 is the peek of the next tile
export function applyTheme() {
  const r = document.documentElement;
  if (ctx.theme === 'system') r.removeAttribute('data-theme'); else r.dataset.theme = ctx.theme;
  const dark = ctx.theme === 'dark' || (ctx.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const [lt, dk] = ACCENTS[ctx.prefs.accent] || ACCENTS.blue;   // an old saved colour (orange, purple...) falls back to blue
  r.style.setProperty('--accent', dark ? dk : lt);
  r.style.setProperty('--on-accent', dark ? '#08111F' : '#FFFFFF');
  r.style.setProperty('--accent-tint', `color-mix(in srgb, ${dark ? dk : lt} ${dark ? 16 : 9}%, transparent)`);
  r.style.setProperty('--accent-press', `color-mix(in srgb, ${dark ? dk : lt} 82%, ${dark ? '#fff' : '#000'})`);
  r.style.setProperty('--across', String(TILE_ACROSS[ctx.prefs.tile] || 4.2));
  r.classList.toggle('no-gu', ctx.prefs.gujarati === false);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', getComputedStyle(r).getPropertyValue('--bg').trim() || '#F5F5F7');
}

export const stockCount = (items) => items.filter((i) => total(i) > 0).length;

/** Badge on the Shopping tab: things to buy plus suggestions waiting for a decision. */
export const toBuyCount = () => toBuy(ctx.items).length + suggestions(ctx.items, Date.now()).length + ctx.wants.filter((w) => !w.done).length;

/** Shared (household) settings arrived or changed: categories and prediction tuning. */
export function applyShared(cfg) {
  ctx.config = cfg && typeof cfg === 'object' ? cfg : {};
  setCats(ctx.config.categories);
  applyTune(ctx.config.tune);
}
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme()); } catch { /* old browser */ }
