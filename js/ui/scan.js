/**
 * scan.js: barcode scanning. A barcode is only a number, so the app has to look it up:
 *   1. the family's own memory (shared through the household, filled in as people scan)
 *   2. Open Food Facts (free public database; patchy for Indian staples, and loose items have no barcode)
 *   3. ask once ("what is this?") and remember the answer for everybody
 * Camera: the browser's BarcodeDetector where it exists (Chrome on Android), otherwise ZXing is downloaded
 * on demand (iPhone). The number can always be typed instead.
 */
import { ctx, now, byId } from '../ctx.js';
import { lookup, norm } from '../catalog.js';
import { parseQty } from '../units.js';
import { makeItem } from '../stock.js';
import { loadScript } from '../importer.js';
import { h, icon, sheet, toast, shortName } from './dom.js';
import { tileEl } from './thumb.js';
import { openBought, openItem } from './sheets.js';
import { matches } from './pantry.js';

const ZXING = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
const validCode = (c) => /^\d{6,14}$/.test(c);
const close = () => h('button', { class: 'iconbtn', 'aria-label': 'Close', onclick: () => sheet.close() }, icon('x', 18));

async function offLookup(code) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 5000);
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,quantity`, { signal: ac.signal });
    if (!r.ok) return null;
    const j = await r.json();
    return j.status === 1 && j.product?.product_name ? j.product : null;
  } catch { return null; } finally { clearTimeout(t); }
}

export function openScan() {
  let stop = () => {};
  const box = h('div', { class: 'scanbox' });
  const video = h('video', { playsinline: true, muted: true, autoplay: true, 'aria-label': 'Camera' });
  const msg = h('div', { class: 'scanmsg' }, 'Starting camera…');
  box.append(video, h('div', { class: 'corners', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i')), h('div', { class: 'line', 'aria-hidden': 'true' }), msg);
  const manual = h('input', { type: 'text', inputmode: 'numeric', placeholder: 'or type the barcode number', 'aria-label': 'Barcode number', autocomplete: 'off',
    onkeydown: (e) => { if (e.key === 'Enter') go(); } });
  const go = () => { const c = manual.value.replace(/\D/g, ''); if (!validCode(c)) { toast('Barcodes are 6 to 14 digits.'); return; } found(c); };

  sheet.open(h('div', { class: 'stack' },
    h('div', { class: 'shead' }, h('div', { class: 'grow' }, h('h2', {}, 'Scan a bag'), h('div', { class: 'muted small' }, 'Point the camera at the barcode')), close()),
    box,
    h('div', { class: 'row' }, manual, h('button', { class: 'btn', onclick: go }, 'Look up')),
    h('div', { class: 'muted small note' }, 'Loose staples have no barcode: just tap the item on the home screen. The first time you scan a new barcode you tell Kothar what it is, and your whole family remembers.')));
  sheet.onClose(() => stop());

  const found = (code) => { stop(); identify(code); };

  (async () => {
    if (!navigator.mediaDevices?.getUserMedia) { msg.textContent = 'The camera is not available here. Type the number below.'; return; }
    try {
      if ('BarcodeDetector' in window) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        video.srcObject = stream; await video.play();
        const det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'itf'] });
        let busy = false;
        const timer = setInterval(async () => {
          if (busy) return; busy = true;
          try { const r = await det.detect(video); const c = r[0]?.rawValue; if (c && validCode(c)) found(c); } catch { /* keep trying */ } busy = false;
        }, 300);
        stop = () => { clearInterval(timer); stream.getTracks().forEach((t) => t.stop()); };
      } else {
        msg.textContent = 'Loading the scanner…';
        await loadScript(ZXING);
        const reader = new window.ZXing.BrowserMultiFormatReader();
        reader.decodeFromVideoDevice(null, video, (res) => { const c = res?.getText?.(); if (c && validCode(c)) found(c); });
        stop = () => { try { reader.reset(); } catch { /* already stopped */ } };
      }
      msg.hidden = true;
    } catch (e) {
      msg.textContent = e.name === 'NotAllowedError' ? 'Camera permission is off. Allow it in your browser settings, or type the number below.' : 'Could not start the camera. Type the number below.';
    }
  })();
}

/* ─────────────── what is this barcode? ─────────────── */

async function identify(code) {
  const rec = ctx.barcodes[code];
  const known = rec && byId(rec.itemId);
  if (known) return showKnown(code, known, rec);
  sheet.open(h('div', { class: 'stack waiting' }, h('div', { class: 'spinner', 'aria-hidden': 'true' }), h('div', { class: 'muted' }, 'Looking it up…')));
  const p = navigator.onLine ? await offLookup(code) : null;
  if (p) return showGuess(code, p);
  showAsk(code, null);
}

function showKnown(code, it, rec) {
  sheet.open(h('div', { class: 'stack' },
    h('div', { class: 'shead' }, tileEl(it, { label: false }), h('div', { class: 'grow' }, h('h2', {}, shortName(it.name)), h('div', { class: 'gu muted' }, it.gu),
      h('span', { class: 'pill good mt' }, h('i'), 'Remembered by your family')), close()),
    h('div', { class: 'card muted small' }, `This barcode is a ${rec.v} ${rec.u} pack of ${shortName(it.name)}.`),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary grow', onclick: () => openBought(it, { pre: { v: rec.v, u: rec.u } }) }, 'Bought it'),
      h('button', { class: 'btn grow', onclick: () => openItem(it.id) }, 'Open item'))));
}

function showGuess(code, p) {
  const name = p.product_name || '';
  const qty = parseQty(p.quantity);
  const mine = ctx.items.find((i) => matches(i, norm(name)) && norm(name).length > 2) || null;
  const best = mine || lookup(name)[0]?.e || null;
  const label = [p.brands, name, p.quantity].filter(Boolean).join(' · ');
  sheet.open(h('div', { class: 'stack' },
    h('div', { class: 'shead' }, h('div', { class: 'grow' }, h('h2', {}, 'Found a product'), h('div', { class: 'muted small' }, label)), close()),
    best ? h('div', { class: 'card stack' }, h('div', {}, 'Is this ', h('b', {}, shortName(best.name || best.en)), '?'),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary grow', onclick: () => chosen(code, best, qty) }, 'Yes'),
        h('button', { class: 'btn grow', onclick: () => showAsk(code, qty) }, 'No, choose')))
      : h('div', { class: 'card muted small' }, "I could not match that to anything you have. Choose what it is once and your family will remember it."),
    best ? null : h('button', { class: 'btn primary', onclick: () => showAsk(code, qty) }, 'Choose item')));
}

function showAsk(code, qty) {
  const results = h('div', { class: 'list' });
  const input = h('input', { type: 'text', placeholder: 'Search: Toor dal, haldi, rice…', autocomplete: 'off', 'aria-label': 'Search items', oninput: () => draw() });
  const draw = () => {
    const q = norm(input.value);
    const mine = ctx.items.filter((i) => matches(i, q)).slice(0, 8);
    const have = new Set(ctx.items.map((i) => norm(i.name)));
    const ideas = q ? lookup(input.value).filter((r) => !have.has(norm(r.e.en))).slice(0, 4) : [];
    results.replaceChildren(
      ...mine.map((it) => h('button', { class: 'setrow', onclick: () => chosen(code, it, qty) }, tileEl(it, { label: false }), h('div', { class: 'tx grow' }, h('b', {}, shortName(it.name)), h('span', { class: 'gu' }, it.gu)))),
      ...ideas.map((r) => h('button', { class: 'setrow', onclick: () => chosen(code, r.e, qty) }, h('div', { class: 'tx grow' }, h('b', {}, `Add ${r.e.en}`), h('span', { class: 'gu' }, r.e.gu)))),
      ...(q && !mine.length && !ideas.length ? [h('button', { class: 'setrow', onclick: async () => (await import('./form.js')).openForm(null, input.value) }, h('div', { class: 'tx grow' }, h('b', {}, `Add "${input.value}" as a new item`)))] : []));
    results.hidden = !results.children.length;
  };
  sheet.open(h('div', { class: 'stack' },
    h('div', { class: 'shead' }, h('div', { class: 'grow' }, h('h2', {}, 'What is this?'), h('div', { class: 'muted small' }, `Barcode ${code}. You only need to tell Kothar once; everyone in the family will see the same answer next time.`)), close()),
    input, results));
  draw();
  setTimeout(() => input.focus(), 50);
}

/** Item picked (existing, or a dictionary entry that becomes a new item): go to Bought and remember the barcode. */
function chosen(code, target, qty) {
  let it = target.packs ? target : null;
  if (!it) {
    it = makeItem({ name: target.en, gu: target.gu, cat: target.cat, form: target.form, color: target.color, keys: target.keys, dsize: { v: target.size, u: target.unit } }, now());
    ctx.store.saveItem(it, `Added ${it.name}`);
  }
  openBought(it, { learn: code, pre: qty && qty.u && (it.dim === (qty.u === 'l' || qty.u === 'ml' ? 'ml' : 'g')) ? qty : null });
}
