/**
 * stock.js: the pantry stock model and the "Suggested for You" predictor. Pure functions:
 * every action takes an item and the current time and returns a NEW item (never mutates).
 *
 * An item holds packs. Each pack is one physical bag/box/bottle:
 *   { id, amt, left, v, u, label, openedAt|null, noSample? }
 *   amt/left are in base units (g, ml or pc); v,u keep the size as bought ("10 lb").
 * Packs can differ in size and the sizes can change over time.
 *
 * Prediction = consumption RATE learned from finished packs ({amt, days}). Rate (not "days per
 * pack") is what lets a 2 kg pack, a 10 kg pack and a 25 lb bag all teach the same estimate.
 * Accepting a suggestion only puts the item on the list; it never marks anything empty, so the
 * app never learns from its own guesses.
 */
import { toBase, packLabel, dimOf, fmt, U } from './units.js';

export const DAY = 864e5;
export const CONFIG = {
  minDays: 2,          // a pack finished faster than this is probably a mis-tap
  keep: 12,            // samples kept per item
  decay: 0.7,          // newest sample weight 1, each older one x0.7
  minSamples: 2,       // need this many finished packs before suggesting
  leadFrac: 0.15, leadMin: 4, leadMax: 14,   // warn this many days before it runs out
  outlierBand: 0.35,   // drop samples whose rate is >35% from the median (once there are 4+)
  snoozeMin: 3, snoozeFrac: 0.25,
};
/** The knobs the household can change in Settings (shared). Everything else in CONFIG is internal. */
export const TUNE_DEFAULTS = { minSamples: CONFIG.minSamples, leadMin: CONFIG.leadMin, leadMax: CONFIG.leadMax, snoozeMin: CONFIG.snoozeMin };
export function applyTune(t = {}) {
  const n = (x, lo, hi, d) => (Number.isFinite(+x) && +x >= lo && +x <= hi ? Math.round(+x) : d);
  const m = { ...TUNE_DEFAULTS };
  m.minSamples = n(t.minSamples, 1, 10, m.minSamples); m.leadMin = n(t.leadMin, 1, 30, m.leadMin);
  m.leadMax = Math.max(m.leadMin, n(t.leadMax, 1, 60, m.leadMax)); m.snoozeMin = n(t.snoozeMin, 1, 30, m.snoozeMin);
  Object.assign(CONFIG, m);
}

const rid = () => 'p' + Math.random().toString(36).slice(2, 8);
const clone = (o) => JSON.parse(JSON.stringify(o));
const round = (x) => Math.round(x * 100) / 100;

export const total = (it) => it.packs.reduce((s, p) => s + p.left, 0);
export const cap = (it) => it.packs.reduce((s, p) => s + p.amt, 0);
export const sealedCount = (it) => it.packs.filter((p) => p.openedAt == null).length;
export const openPack = (it) => it.packs.find((p) => p.openedAt != null) || null;

export function median(a) {
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Learned consumption: { rate (base units/day), n, cycle (days one average pack lasts) } or null. */
export function est(it) {
  const v = (it.lifespans || []).filter((x) => x.days >= CONFIG.minDays).slice(-CONFIG.keep);
  if (!v.length) return null;
  let r = v.map((x) => ({ rate: x.amt / x.days, amt: x.amt, days: x.days }));
  if (r.length >= 4) {
    const m = median(r.map((x) => x.rate));
    const keep = r.filter((x) => Math.abs(x.rate - m) <= CONFIG.outlierBand * m);
    if (keep.length >= 2) r = keep;
  }
  let w = 0, sr = 0, sa = 0;
  r.forEach((x, i) => { const wt = Math.pow(CONFIG.decay, r.length - 1 - i); w += wt; sr += wt * x.rate; sa += wt * x.amt; });
  return { rate: sr / w, n: r.length, cycle: (sa / w) / (sr / w) };
}

/** Days until it runs out, counted from the last time the stock changed. null = not enough data. */
export function daysLeft(it, now) {
  const e = est(it);
  if (!e) return null;
  return Math.max(0, total(it) / e.rate - (now - (it.tAt || now)) / DAY);
}
export const lead = (e) => Math.min(CONFIG.leadMax, Math.max(CONFIG.leadMin, CONFIG.leadFrac * e.cycle));

/** 'new' (no amount entered yet) | 'out' | 'low' | 'in' */
export function status(it, now) {
  if (total(it) <= 0) return it.everStocked ? 'out' : 'new';
  const e = est(it);
  return e && e.n >= CONFIG.minSamples && daysLeft(it, now) <= lead(e) ? 'low' : 'in';
}

export function suggestions(items, now) {
  return items
    .filter((it) => status(it, now) === 'low' && !it.onList && !(it.snoozeUntil && it.snoozeUntil > now))
    .sort((a, b) => daysLeft(a, now) - daysLeft(b, now));
}
export const toBuy = (items) =>
  items.filter((it) => (total(it) <= 0 && it.everStocked) || it.onList).sort((a, b) => a.name.localeCompare(b.name));

/* ───────────────────────────── building items and packs ───────────────────────────── */

export function mkPack(v, u, now, opts = {}) {
  const a = toBase(v, u);
  return { id: rid(), amt: a, left: a, v: +v, u, label: packLabel(v, u), boughtAt: now,
    openedAt: opts.open ? now : null, ...(opts.noSample ? { noSample: true } : {}), ...(opts.fromImport ? { fromImport: true } : {}) };
}

/** A new item from the form / dictionary. `dsize` is the usual pack size shown as a first suggestion. */
export function makeItem(f, now) {
  const dsize = f.dsize || { v: 1, u: 'kg' };
  return {
    id: f.id || 'i' + Math.random().toString(36).slice(2, 10),
    name: f.name.trim(), gu: (f.gu || '').trim(), cat: f.cat, form: f.form || 'jar', color: f.color || '#B08D4F',
    keys: f.keys || [], dim: dimOf(dsize.u), dsize,
    recent: [], packs: [], lifespans: [], onList: false, everStocked: false, snoozeUntil: null, photo: f.photo || null,
    tAt: now, createdAt: now,
  };
}

const touch = (it, now) => { it.tAt = now; it.snoozeUntil = null; return it; };
const note = (it, extra) => (it.packs.length ? ` ${fmt(total(it), it.dim)} left.` : ' Added to your list.') + (extra || '');

/* ───────────────────────────── actions (all return { item, text, msg } ) ───────────────────────────── */

/** "Bought": `count` packs of size v+u. Packs stay sealed: Kothar counts packs, it does not track which one is open. */
export function addPacks(it0, count, v, u, now, opts = {}) {
  if (!(+v > 0) || count < 1) return null;
  const it = clone(it0);
  for (let k = 0; k < count; k++) it.packs.push(mkPack(v, u, now, opts));
  it.onList = false; it.everStocked = true;
  it.recent = [{ v: +v, u }, ...(it.recent || []).filter((r) => !(+r.v === +v && r.u === u))].slice(0, 4);
  touch(it, now);
  const what = `${count} × ${packLabel(v, u)}`;
  return { item: it, text: `Bought ${what}`, msg: `${it.name}: added ${what}. ${fmt(total(it), it.dim)} in stock.` };
}

/** Import: existing stock described as [{v,u,count,opened?}]. Packs stay sealed unless the list says one is opened
 *  (e.g. "tutelu"); that one's start date is unknown, so it is flagged noSample and never teaches the predictor. */
export function importPacks(it0, specs, now) {
  const it = clone(it0);
  let openedOne = false;
  for (const s of specs) {
    for (let k = 0; k < Math.max(1, s.count || 1); k++) {
      const wantOpen = s.opened && k === 0;
      const p = mkPack(s.v, s.u, now, { open: wantOpen, noSample: wantOpen, fromImport: true });
      if (wantOpen) openedOne = true;
      it.packs.push(p);
    }
  }
  if (it.packs.length) it.everStocked = true;
  const first = specs[0];
  if (first) it.recent = [...new Map([...specs, ...(it.recent || [])].map((r) => [`${+r.v}${r.u}`, { v: +r.v, u: r.u }])).values()].slice(0, 4);
  touch(it, now);
  return { item: it, text: 'Imported from list', msg: `${it.name}: ${fmt(total(it), it.dim)} in stock.` };
}

/**
 * "Finished": the one-tap default. With no pack given it finishes the open pack (or the first one).
 */
export function finishPack(it0, pid, now) {
  const it = clone(it0);
  const i = pid ? it.packs.findIndex((p) => p.id === pid) : Math.max(0, it.packs.findIndex((p) => p.openedAt != null));
  if (i < 0 || !it.packs[i]) return null;
  const p = it.packs[i];
  let how = '';
  // When did this pack start being used? Its opened date if it has one (partial use), otherwise the later of
  // "bought" and "the previous pack finished". Imported packs have no trustworthy purchase date.
  const start = p.noSample ? null : p.openedAt != null ? p.openedAt
    : p.fromImport ? (it.lastFinishAt ?? null)
      : (Number.isFinite(Math.max(p.boughtAt ?? -Infinity, it.lastFinishAt ?? -Infinity)) ? Math.max(p.boughtAt ?? -Infinity, it.lastFinishAt ?? -Infinity) : null);
  if (start != null) {
    const d = (now - start) / DAY;
    if (d >= CONFIG.minDays) {
      it.lifespans = [...(it.lifespans || []), { amt: p.amt, days: +d.toFixed(1), at: now }].slice(-CONFIG.keep);
      how = ` after ${Math.round(d)} days`;
    } else how = ' (too quick to count)';
  }
  it.lastFinishAt = now;
  it.packs.splice(i, 1);
  if (!it.packs.length) it.onList = true;
  touch(it, now);
  return { item: it, text: `Finished the ${p.label} pack${how}` + (it.packs.length ? '' : ', now out'),
    msg: `${it.name}: finished the ${p.label} pack.` + note(it) };
}

/** Pack sizes currently in stock, e.g. [{label:'10 lb', count:2, v:10, u:'lb', amt}, ...] (open pack counted). */
export function packGroups(it) {
  const g = new Map();
  for (const p of it.packs) {
    const e = g.get(p.label) || { label: p.label, count: 0, amt: p.amt, opened: 0 };
    e.count++; if (p.openedAt != null) e.opened++; g.set(p.label, e);
  }
  return [...g.values()].sort((a, b) => a.amt - b.amt);
}

/**
 * "Used": whole packs taken from the pantry, by size. picks = [{label, count}].
 * The open pack of a size goes first. Returns null if nothing could be taken.
 */
export function usePacks(it0, picks, now) {
  let it = it0, taken = [];
  for (const { label, count } of picks) {
    let n = 0;
    for (let k = 0; k < count; k++) {
      const cand = it.packs.filter((p) => p.label === label).sort((a, b) => (b.openedAt != null) - (a.openedAt != null))[0];
      if (!cand) break;
      const r = finishPack(it, cand.id, now);
      if (!r) break;
      it = r.item; n++;
    }
    if (n) taken.push(`${n} × ${label}`);
  }
  if (!taken.length) return null;
  const list = taken.join(' + ');
  return { item: it, text: `Used ${list}`, msg: `${it.name}: used ${list}.` + (it.packs.length ? ` ${fmt(total(it), it.dim)} left.` : ' Now out, added to your list.') };
}

/** Advanced: took `amt` (base units) out of one pack. Taking everything counts as Finished. */
export function takeAmount(it0, pid, amt, now) {
  const p0 = it0.packs.find((x) => x.id === pid);
  if (!p0 || !(amt > 0)) return null;
  if (amt >= p0.left - 0.5) return finishPack(it0, pid, now);
  const it = clone(it0), p = it.packs.find((x) => x.id === pid);
  p.left = round(p.left - amt);
  if (p.openedAt == null) p.openedAt = now;
  touch(it, now);
  return { item: it, text: `Took ${fmt(amt, it.dim)} from the ${p.label} pack`, msg: `${it.name}: took ${fmt(amt, it.dim)}.` + note(it) };
}

/** Advanced: "what's left" in one pack, set directly. */
export function setLeft(it0, pid, left, now) {
  const p0 = it0.packs.find((x) => x.id === pid);
  if (!p0) return null;
  if (left <= 0.5) return finishPack(it0, pid, now);
  const it = clone(it0), p = it.packs.find((x) => x.id === pid);
  p.left = round(Math.min(p.amt, left));
  if (p.openedAt == null && p.left < p.amt) p.openedAt = now;
  touch(it, now);
  return { item: it, text: `Set the ${p.label} pack to ${fmt(p.left, it.dim)} left`, msg: `${it.name}:` + note(it) };
}

export function setList(it0, on) {
  const it = clone(it0); it.onList = on;
  return { item: it, text: on ? 'Added to shopping list' : 'Removed from shopping list', msg: null };
}

export function snooze(it0, now) {
  const it = clone(it0), e = est(it);
  it.snoozeUntil = now + Math.max(CONFIG.snoozeMin, (e ? e.cycle : 0) * CONFIG.snoozeFrac) * DAY;
  return { item: it, text: 'Dismissed suggestion', msg: null };
}

/** Make any stored document safe to draw. Items written by the first version of the app (or by hand in the
 *  Firebase console) lack packs/dsize/etc.; without this one such document would break every screen. */
const CAT_IDS = ['masala', 'grains', 'flours', 'oil', 'dry', 'mixes'];
export function normalizeItem(raw) {
  if (!raw || typeof raw.name !== 'string' || !raw.name.trim()) return null;
  const num = (x, d) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
  const arr = (x) => (Array.isArray(x) ? x : []);
  const u = raw.dsize && U[raw.dsize.u] ? raw.dsize.u : 'kg';
  const dv = raw.dsize ? num(raw.dsize.v, 0) : 0;
  const dsize = { v: dv > 0 ? dv : 1, u };
  const packs = arr(raw.packs).filter((p) => p && typeof p === 'object' && num(p.amt, -1) >= 0 && U[p.u])
    .map((p) => ({ ...p, left: num(p.left, p.amt), v: num(p.v, 1), openedAt: p.openedAt == null ? null : num(p.openedAt, null) }));
  const t = num(raw.createdAt, 0);
  return {
    ...raw,
    id: String(raw.id), name: raw.name.trim(), gu: typeof raw.gu === 'string' ? raw.gu : '',
    cat: CAT_IDS.includes(raw.cat) ? raw.cat : 'dry', form: typeof raw.form === 'string' ? raw.form : 'jar',
    color: typeof raw.color === 'string' ? raw.color : '#B08D4F', keys: arr(raw.keys).filter((k) => typeof k === 'string'),
    dsize, dim: dimOf(dsize.u), packs, recent: arr(raw.recent), lifespans: arr(raw.lifespans),
    onList: raw.onList === true, everStocked: raw.everStocked === true || packs.length > 0,
    snoozeUntil: num(raw.snoozeUntil, null), photo: typeof raw.photo === 'string' ? raw.photo : null,
    tAt: num(raw.tAt, t), createdAt: t,
  };
}
