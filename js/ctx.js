// ctx.js: the one shared state object. UI modules read it and call ctx.render(); app.js owns the wiring.
import { status, total, toBuy, suggestions } from './stock.js';

export const ctx = {
  mode: 'demo',            // 'demo' (this phone only) | 'firebase'
  store: null,             // see store-local.js / store-firebase.js for the interface
  items: [], barcodes: {}, members: [],
  user: null, hid: null, household: null, isAdmin: false, invite: null,
  tab: 'pantry', query: '',
  units: 'metric', theme: 'system',
  sheetLive: null,         // function that re-renders the open sheet when data changes (item sheet only)
  render() {}, signOut() {}, invites: null,   // filled in by app.js
};

export const now = () => Date.now();
export const byId = (id) => ctx.items.find((i) => i.id === id);
export const stat = (it) => status(it, now());

/* ----- per-device settings (not shared with the family) ----- */
const KEY = 'kothar-settings';
export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (s.units === 'lb' || s.units === 'metric') ctx.units = s.units;
    if (['system', 'light', 'dark'].includes(s.theme)) ctx.theme = s.theme;
  } catch { /* private mode: defaults are fine */ }
  applyTheme();
}
export function saveSettings(patch) {
  Object.assign(ctx, patch);
  try { localStorage.setItem(KEY, JSON.stringify({ units: ctx.units, theme: ctx.theme })); } catch { /* ignore */ }
  applyTheme();
}
export function applyTheme() {
  const r = document.documentElement;
  if (ctx.theme === 'system') r.removeAttribute('data-theme'); else r.dataset.theme = ctx.theme;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', getComputedStyle(r).getPropertyValue('--bg').trim() || '#14110E');
}

export const stockCount = (items) => items.filter((i) => total(i) > 0).length;

/** Badge on the Shopping tab: things to buy plus suggestions waiting for a decision. */
export const toBuyCount = () => toBuy(ctx.items).length + suggestions(ctx.items, Date.now()).length;
