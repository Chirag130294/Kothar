// dom.js: tiny DOM helpers (no framework, never innerHTML with user text), icons, toast, bottom sheet.
import { ctx } from '../ctx.js';

export const $ = (s, r = document) => r.querySelector(s);

// append/prepend/replaceChildren turn a null argument into the text "null". Conditional children
// (`cond ? node : null`) are used everywhere, so make these ignore null/undefined/false.
for (const m of ['append', 'prepend', 'replaceChildren']) {
  const orig = Element.prototype[m];
  Element.prototype[m] = function (...args) { return orig.apply(this, args.filter((x) => x != null && x !== false)); };
}

// Any error inside a click/input handler used to vanish silently ("I tapped and nothing happened").
// Now it is shown on screen so it can be reported and fixed.
function safeHandler(fn) {
  const show = (e) => { console.error(e); try { toast(`Error: ${e && e.message ? e.message : e}`); } catch { /* ignore */ } };
  return function (ev) { try { const r = fn.call(this, ev); if (r && typeof r.catch === 'function') r.catch(show); return r; } catch (e) { show(e); } };
}

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'string') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), safeHandler(v));
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

const IC = {
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M8.5 9v6M12 9v6M15.5 9v6"/>',
  pantry: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  cart: '<path d="M5 7h14l-1.5 11a2 2 0 0 1-2 1.7h-7a2 2 0 0 1-2-1.7zM9 7a3 3 0 0 1 6 0"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14a6.5 6.5 0 0 1 3.5 6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', chev: '<path d="M6 9l6 6 6-6"/>', right: '<path d="M9 6l6 6-6 6"/>',
  paste: '<rect x="6" y="5" width="12" height="16" rx="2.5"/><path d="M9.5 5V4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1M9 11h6M9 15h4"/>',
  file: '<path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v5h5M9 14h6M9 17h4"/>',
  camera: '<path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  copy: '<rect x="8" y="8" width="11" height="12" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H14"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/>',
  dots: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
};
export function icon(name, size = 22) {
  const t = document.createElement('template');
  t.innerHTML = `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[name] || ''}</svg>`;
  return t.content.firstChild;
}

/* ----- toast ----- */
let toastT;
export function toast(msg, undo) {
  if (!msg) return;
  const t = $('#toast'); if (!t) return;
  clearTimeout(toastT);
  t.replaceChildren(...[h('span', {}, msg), undo ? h('button', { onclick: () => { t.hidden = true; undo(); } }, 'Undo') : null].filter(Boolean));
  t.hidden = false;
  // A modal <dialog> makes everything outside it unclickable and hides it. While a sheet is open the toast
  // lives inside the dialog (so it is visible and Undo works); otherwise it sits in the page.
  const d = $('#sheet'), home = d.open ? d : document.body;
  if (t.parentNode !== home) home.append(t);
  toastT = setTimeout(() => { t.hidden = true; }, 6500);
}

export async function guarded(fn) {
  try { return await fn(); } catch (e) { console.error(e); toast(e.message || 'Something went wrong.'); }
}

/* ----- bottom sheet (one native <dialog>: focus trap and Esc come for free) ----- */
let closers = [];
const runClosers = () => { const c = closers; closers = []; c.forEach((f) => { try { f(); } catch (e) { console.warn(e); } }); };
export const sheet = {
  /** Run `fn` when this sheet closes or is replaced (stop the camera, etc.). */
  onClose(fn) { closers.push(fn); },
  init() { $('#sheet').addEventListener('close', () => { ctx.sheetLive = null; const t = $('#toast'); if (t && t.parentNode !== document.body) document.body.append(t); runClosers(); });
    $('#sheet').addEventListener('click', (e) => { if (e.target === e.currentTarget) sheet.close(); }); },
  open(node, live) {
    const d = $('#sheet');
    runClosers();
    ctx.sheetLive = live || null;
    $('#sbody').replaceChildren(h('div', { class: 'grab', 'aria-hidden': 'true' }), node);
    if (!d.open) { $('#toast').hidden = true; d.showModal(); }
    d.scrollTop = 0; $('#sbody').scrollTop = 0;
  },
  /** Re-draw the open sheet if it asked to be live (item sheet), keeping scroll position. */
  refresh() {
    const d = $('#sheet');
    if (!d.open || !ctx.sheetLive) return;
    const y = $('#sbody').scrollTop;
    const node = ctx.sheetLive();
    if (!node) return sheet.close();
    $('#sbody').replaceChildren(h('div', { class: 'grab', 'aria-hidden': 'true' }), node);
    $('#sbody').scrollTop = y;
  },
  close() { const d = $('#sheet'); if (d.open) d.close(); },
  get isOpen() { return $('#sheet').open; },
};

export const shortName = (n) => n.replace(/\s*\(.*?\)\s*/g, ' ').trim();
