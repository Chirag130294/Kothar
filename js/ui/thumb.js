// thumb.js: the auto-generated thumbnail for an item (packaging illustration tinted by item colour,
// or the family's own photo) with the Gujarati name inside the tile.
import { art } from '../catalog.js';
import { fmt } from '../units.js';
import { total } from '../stock.js';
import { ctx, stat } from '../ctx.js';
import { h, shortName } from './dom.js';

// Colour and photo come from shared data: only accept a plain hex colour and an image data URL.
export const safeColor = (c) => (/^#[0-9a-fA-F]{3,8}$/.test(c || '') ? c : '#B08D4F');
const safePhoto = (p) => (typeof p === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p) ? p : null);

export function tileEl(it, { label = true, dot = false } = {}) {
  const color = safeColor(it.color);
  const d = h('div', { class: 'tile', style: `--c:${color}` });
  const photo = safePhoto(it.photo);
  if (photo) d.append(h('img', { src: photo, alt: '' })); else d.insertAdjacentHTML('afterbegin', art(it.form, color));
  if (label && it.gu) d.append(h('span', { class: 'gl' }, it.gu));
  const st = stat(it);
  if (dot && (st === 'low' || st === 'out')) d.append(h('i', { class: 'dot ' + st }));
  return d;
}

export const qtyText = (it) => {
  const st = stat(it);
  if (st === 'out') return 'Out';
  if (st === 'new') return 'Set amount';
  const t = fmt(total(it), it.dim, ctx.units);
  return st === 'low' ? `Low · ${t}` : t;
};

/** One thumbnail in a rail or grid: tile (Gujarati inside) + English name + quantity. */
export function railTile(it, onOpen) {
  const st = stat(it);
  return h('button', { class: 't ' + st, onclick: () => onOpen(it), 'aria-label': `${it.name}, ${qtyText(it)}` },
    tileEl(it, { dot: true }),
    h('div', { class: 'nm' }, shortName(it.name)),
    h('div', { class: 'q ' + st }, qtyText(it)));
}
