/**
 * predict.js — the "Suggested for You" engine.
 *
 * Pure functions only (no Firebase, no DOM) so the same file runs in the browser
 * and in Node unit tests (`npm test`).
 *
 * HOW IT LEARNS
 * -------------
 * Every item stores a lifespan history per pack size:
 *
 *   item.lifespans = { g10000: [ {days: 44, at: 1760000000000, src: 'empty'}, ... ],
 *                      g5000:  [ ... ] }
 *
 * - "Have it" -> logs lastRestockedAt (start of a cycle).
 * - "Need it" -> logs lastEmptiedAt; days between the two is one sample.
 * - The history is keyed by pack size (g10000 = 10 kg) because "10 kg of rice lasts
 *   45 days" and "5 kg of rice lasts 22 days" are different facts about the same item.
 *
 * THE ROLLING AVERAGE
 * -------------------
 *  1. Keep the most recent MAX_SAMPLES cycles; ignore cycles shorter than
 *     MIN_VALID_DAYS (accidental taps).
 *  2. With >= OUTLIER_MIN_SAMPLES cycles, drop outliers (median/MAD test) — e.g. the
 *     month the relatives visited, or the month you were travelling.
 *  3. Weighted mean where the newest cycle has weight 1 and each older cycle is
 *     multiplied by DECAY (0.7). Habits drift; recent cycles matter most.
 *  4. Cycles inferred from a purchase date ("src: restock") count half as much as
 *     cycles where someone really tapped "Need it" (see FEEDBACK LOOP).
 *
 * NEW PACK SIZE
 * -------------
 * If there is no history for the size currently in the pantry but there is for
 * another size of the same item, we convert through the consumption rate:
 *   5 kg lasted 22 days  =>  227 g/day  =>  a 10 kg pack should last ~44 days.
 *
 * FEEDBACK LOOP (important)
 * -------------------------
 * Accepting a suggestion must NOT mark the item as empty. If it did, the app would
 * record "lifespan = the day the app guessed it was empty", and every cycle would get
 * a little shorter. Accepting only sets onShoppingList=true; the lifespan is measured
 * from a real event: either someone taps "Need it", or the purchase date.
 */

export const DAY_MS = 86_400_000;

export const CONFIG = {
  MIN_VALID_DAYS: 2,        // shorter cycles are treated as mis-taps
  MAX_SAMPLES: 12,          // rolling window per pack size
  DECAY: 0.7,               // weight multiplier per step back in time
  OUTLIER_MIN_SAMPLES: 4,   // only trim outliers once we have this many cycles
  OUTLIER_K: 2.5,           // |x - median| > K * scale => outlier
  RESTOCK_SRC_WEIGHT: 0.5,  // weight of cycles inferred from purchase date
  MIN_SAMPLES_TO_SUGGEST: 2,// need at least 2 refills before we dare to suggest
  SUGGEST_AT: 0.85,         // suggest when 85% of the usual lifespan has passed
  SNOOZE_FRACTION: 0.25,    // "Dismiss" hides the suggestion for 25% of the lifespan...
  MIN_SNOOZE_DAYS: 3,       // ...but at least 3 days
  UNDO_WINDOW_MS: 10 * 60 * 1000, // Need -> Have within 10 min = "oops", not a refill
};

/* ------------------------------------------------------------------ sizes */

const UNITS = {
  g:  { dim: 'g',  factor: 1 },
  kg: { dim: 'g',  factor: 1000 },
  ml: { dim: 'ml', factor: 1 },
  l:  { dim: 'ml', factor: 1000 },
  pc: { dim: 'pc', factor: 1 },
};

/** 5 kg -> {dim:'g', base:5000}; 500 ml -> {dim:'ml', base:500}. */
export function toBase(value, unit) {
  const u = UNITS[unit];
  const v = Number(value);
  if (!u || !Number.isFinite(v) || v <= 0) return null;
  return { dim: u.dim, base: Math.round(v * u.factor) };
}

/** Stable key per pack size: 5 kg and 5000 g both give "g5000". */
export function sizeKey(value, unit) {
  const b = toBase(value, unit);
  return b ? `${b.dim}${b.base}` : null;
}

export function parseSizeKey(key) {
  const m = /^(g|ml|pc)(\d+)$/.exec(key || '');
  return m ? { dim: m[1], base: Number(m[2]) } : null;
}

/** "5kg", "500g", "5L" — shown next to the item name. */
export function sizeLabel(value, unit) {
  return `${Number(value)}${unit === 'l' ? 'L' : unit}`;
}

/* ---------------------------------------------------------------- helpers */

const round1 = (n) => Math.round(n * 10) / 10;

/** Firestore Timestamp | Date | ms number | null  ->  ms number | null */
export function toMillis(t) {
  if (t == null) return null;
  if (typeof t === 'number') return t;
  if (t instanceof Date) return t.getTime();
  if (typeof t.toMillis === 'function') return t.toMillis();
  return null;
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/* ------------------------------------------------------- history (pure ops) */

/** Append one cycle to a history array. Returns a NEW array; ignores mis-taps. */
export function recordLifespan(samples, days, src, now = Date.now()) {
  const list = Array.isArray(samples) ? samples.slice() : [];
  if (!Number.isFinite(days) || days < CONFIG.MIN_VALID_DAYS) return list;
  list.push({ days: round1(days), at: now, src });
  return list.slice(-CONFIG.MAX_SAMPLES);
}

/** Drop extreme cycles using a robust (median / MAD) test. */
export function trimOutliers(samples) {
  if (samples.length < CONFIG.OUTLIER_MIN_SAMPLES) return samples;
  const xs = samples.map((s) => s.days);
  const med = median(xs);
  const mad = median(xs.map((x) => Math.abs(x - med)));
  // Floor the scale at 15% of the median so a very regular household
  // (MAD = 0) doesn't treat a normal 10% wobble as an outlier.
  const scale = Math.max(1.4826 * mad, 0.15 * med);
  const kept = samples.filter((s) => Math.abs(s.days - med) <= CONFIG.OUTLIER_K * scale);
  return kept.length >= 2 ? kept : samples;
}

/**
 * Recency-weighted rolling average of a history array.
 * @returns {{avgDays, n, stdDays, cv, confidence, dropped}|null}
 */
export function rollingAverage(samples) {
  const valid = (Array.isArray(samples) ? samples : [])
    .filter((s) => s && Number.isFinite(s.days) && s.days >= CONFIG.MIN_VALID_DAYS)
    .sort((a, b) => (a.at || 0) - (b.at || 0))
    .slice(-CONFIG.MAX_SAMPLES);
  if (!valid.length) return null;

  const kept = trimOutliers(valid);
  const n = kept.length;
  const weights = kept.map(
    (s, i) => Math.pow(CONFIG.DECAY, n - 1 - i) * (s.src === 'restock' ? CONFIG.RESTOCK_SRC_WEIGHT : 1)
  );
  const wSum = weights.reduce((a, b) => a + b, 0);
  const mean = kept.reduce((acc, s, i) => acc + s.days * weights[i], 0) / wSum;
  const variance = kept.reduce((acc, s, i) => acc + weights[i] * (s.days - mean) ** 2, 0) / wSum;
  const std = Math.sqrt(variance);
  const cv = mean > 0 ? std / mean : 0;

  let confidence = 'low';
  if (n >= 4 && cv <= 0.25) confidence = 'high';
  else if (n >= 2 && cv <= 0.5) confidence = 'medium';

  return { avgDays: round1(mean), n, stdDays: round1(std), cv: round1(cv * 100) / 100, confidence, dropped: valid.length - n };
}

/* ---------------------------------------------------------------- estimate */

/** Pack size that is in the pantry right now (the one bought at the last restock). */
export function currentSizeKey(item) {
  return item.cycleSizeKey || item.sizeKey || sizeKey(item.sizeValue, item.sizeUnit);
}

/**
 * How long does THIS pack of THIS item usually last?
 * Exact-size history first; otherwise scale from other sizes of the same item.
 */
export function estimateLifespan(item) {
  const key = currentSizeKey(item);
  const target = parseSizeKey(key);
  if (!target) return null;
  const history = item.lifespans || {};

  const exact = rollingAverage(history[key]);
  if (exact && exact.n >= CONFIG.MIN_SAMPLES_TO_SUGGEST) return { ...exact, method: 'exact' };

  // Convert other pack sizes through the consumption rate (base units per day).
  let rateWeighted = 0;
  let weight = 0;
  for (const [k, samples] of Object.entries(history)) {
    if (k === key) continue;
    const p = parseSizeKey(k);
    if (!p || p.dim !== target.dim) continue;
    const ra = rollingAverage(samples);
    if (!ra) continue;
    rateWeighted += (p.base / ra.avgDays) * ra.n;
    weight += ra.n;
  }
  if (weight > 0 && (!exact || weight > exact.n)) {
    const rate = rateWeighted / weight;
    return {
      avgDays: round1(target.base / rate), n: weight, stdDays: null, cv: null,
      confidence: 'low', method: 'scaled', dropped: 0,
    };
  }
  return exact ? { ...exact, method: 'exact' } : null;
}

/* -------------------------------------------------------------- suggestions */

/**
 * Should this item appear under "Suggested for You" right now?
 * @returns {null | {itemId, state, progress, daysSince, avgDays, daysRemaining, confidence, method, n}}
 */
export function getSuggestion(item, now = Date.now()) {
  if (item.status !== 'have' || item.onShoppingList) return null; // already on the list
  const restocked = toMillis(item.lastRestockedAt);
  if (restocked == null) return null;                              // never saw a restock
  const snoozedUntil = toMillis(item.suggestionSnoozedUntil);
  if (snoozedUntil != null && snoozedUntil > now) return null;     // user dismissed it

  const est = estimateLifespan(item);
  if (!est || est.n < CONFIG.MIN_SAMPLES_TO_SUGGEST) return null;

  const daysSince = (now - restocked) / DAY_MS;
  const progress = daysSince / est.avgDays;
  if (progress < CONFIG.SUGGEST_AT) return null;

  return {
    itemId: item.id,
    state: progress >= 1 ? 'likely_empty' : 'running_low',
    progress: round1(progress * 100) / 100,
    daysSince: round1(daysSince),
    avgDays: est.avgDays,
    daysRemaining: round1(est.avgDays - daysSince),
    confidence: est.confidence,
    method: est.method,
    n: est.n,
  };
}

/** All suggestions for the shopping tab, most overdue first. */
export function buildSuggestions(items, now = Date.now()) {
  return items
    .map((item) => {
      const s = getSuggestion(item, now);
      return s ? { item, ...s } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.progress - a.progress);
}

/** When a dismissed suggestion may come back (ms timestamp). */
export function snoozeUntilMs(item, now = Date.now()) {
  const est = estimateLifespan(item);
  const days = Math.max(CONFIG.MIN_SNOOZE_DAYS, (est?.avgDays ?? 0) * CONFIG.SNOOZE_FRACTION);
  return now + days * DAY_MS;
}

/* ------------------------------------------------- status toggles (the log) */

/**
 * Pure state machine behind the "Have it / Need it" toggle.
 * Returns the fields to write on the item plus the log entry, or null if nothing changes.
 * Dates are ms numbers; items.js converts them to Firestore Timestamps.
 */
export function applyStatusChange(item, next, now = Date.now()) {
  const prev = item.status || 'have';
  const curKey = item.sizeKey || sizeKey(item.sizeValue, item.sizeUnit);
  const cycleKey = currentSizeKey(item);
  const lastRestock = toMillis(item.lastRestockedAt);
  const lastEmpty = toMillis(item.lastEmptiedAt);
  const lifespans = { ...(item.lifespans || {}) };

  // 1) HAVE -> NEED : the pack ran out. Log empty_date, close the cycle.
  if (next === 'need' && prev !== 'need') {
    const days = lastRestock != null ? (now - lastRestock) / DAY_MS : null;
    let counted = false;
    if (days != null) {
      const updated = recordLifespan(lifespans[cycleKey], days, 'empty', now);
      counted = updated.length > 0 && updated[updated.length - 1].at === now;
      lifespans[cycleKey] = updated;
    }
    return {
      patch: {
        status: 'need', onShoppingList: false, lastEmptiedAt: now,
        prevRestockedAt: lastRestock, suggestionSnoozedUntil: null, lifespans,
      },
      log: { type: 'emptied', at: now, sizeKey: cycleKey, lifespanDays: days != null ? round1(days) : null, counted },
    };
  }

  // 2) NEED -> HAVE
  if (next === 'have' && prev === 'need') {
    // Flipped back within minutes = mis-tap: restore the previous cycle untouched.
    if (lastEmpty != null && now - lastEmpty < CONFIG.UNDO_WINDOW_MS) {
      if (lifespans[cycleKey]) lifespans[cycleKey] = lifespans[cycleKey].filter((s) => s.at !== lastEmpty);
      return {
        patch: {
          status: 'have', lastEmptiedAt: null, lastRestockedAt: toMillis(item.prevRestockedAt),
          prevRestockedAt: null, lifespans,
        },
        log: { type: 'undo', at: now, sizeKey: cycleKey },
      };
    }
    // Real refill: log restocked_date and remember which pack size was bought.
    return {
      patch: {
        status: 'have', onShoppingList: false, lastRestockedAt: now, cycleSizeKey: curKey,
        suggestionSnoozedUntil: null,
      },
      log: { type: 'restocked', at: now, sizeKey: curKey },
    };
  }

  // 3) HAVE -> HAVE while on the list: bought straight from a suggestion, nobody
  //    ever tapped "Need it". Cycle length = time between purchases (lower weight).
  if (next === 'have' && prev === 'have' && item.onShoppingList) {
    const days = lastRestock != null ? (now - lastRestock) / DAY_MS : null;
    if (days != null) lifespans[cycleKey] = recordLifespan(lifespans[cycleKey], days, 'restock', now);
    return {
      patch: {
        status: 'have', onShoppingList: false, lastRestockedAt: now, cycleSizeKey: curKey,
        suggestionSnoozedUntil: null, lifespans,
      },
      log: { type: 'restocked', at: now, sizeKey: curKey, lifespanDays: days != null ? round1(days) : null, source: 'suggestion' },
    };
  }

  return null; // nothing to do
}
