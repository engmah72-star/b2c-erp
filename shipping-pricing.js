/**
 * shipping-pricing.js — Expected shipping cost engine (Step 7.7)
 *
 * Pure read-side module. Computes the *expected* shipping cost for a given
 * shipment based on a rules table. The actual cost is whatever the operator
 * recorded in `order.shippingCost` — this module exists so the row can show
 * "expected vs actual" (Step 7.4) and flag overcost shipments.
 *
 * Architecture (RULE C1 + F1.3):
 *   - Rules table lives in Firestore: `shipping_pricing/{rulesetId}`
 *   - Loaded once via loadPricingRules(db) and cached in module state
 *   - getExpectedCost({...}) is pure — works on the cached rules
 *   - Missing rules → returns null (caller decides how to render)
 *
 * Rules document shape (one or more rulesets per shipping company):
 *   {
 *     companyId: 'shipper_abc',
 *     companyName: 'شركة س',
 *     defaultBaseCost: 50,             // fallback when gov/city not mapped
 *     weightSurcharges: [
 *       { overKg: 1, surcharge: 15 },  // > 1kg: +15ج per extra kg
 *       { overKg: 5, surcharge: 35 },  // > 5kg: +35ج (overrides above)
 *     ],
 *     govRules: {
 *       'القاهرة': { baseCost: 45, cities: { 'مدينة نصر': 55, 'المعادي': 50 } },
 *       'الجيزة' : { baseCost: 50, cities: { '6 أكتوبر': 60 } },
 *       'الإسكندرية': { baseCost: 70 },
 *     },
 *     productSurcharge: {              // optional, by product type
 *       'بنر': 20,
 *       'فوم': 30,
 *     },
 *     updatedAt: <timestamp>,
 *     updatedBy: <uid>,
 *   }
 *
 * Lookup priority (first match wins):
 *   1. city-specific override in govRules[gov].cities[city]
 *   2. gov base in govRules[gov].baseCost
 *   3. companyDefault.defaultBaseCost
 *   4. SYSTEM_FALLBACK (50ج)
 *
 * Then add:
 *   - weightSurcharge (highest threshold the weight crosses)
 *   - productSurcharge for first product's name match
 *
 * No application code currently writes to this collection — Step 7.7 only
 * provides the engine; admin UI for managing rulesets comes later.
 */

const SYSTEM_FALLBACK_COST = 50;

let _rulesCache = new Map();  // companyId → ruleset
let _rulesLoadedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes — rules don't change often

/**
 * Load all shipping pricing rulesets into the in-memory cache.
 * Bounded query (G3): limit 100 rulesets (one company should have one).
 *
 * @param {Firestore} db — Firestore instance from core/firebase-init
 * @returns {Promise<number>} — number of rulesets loaded
 */
export async function loadPricingRules(db) {
  if (!db) return 0;
  // Lazy-import firestore lib so this module can be unit-tested without it
  const { collection, getDocs, query, limit } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
  const snap = await getDocs(query(collection(db, 'shipping_pricing'), limit(100)));
  _rulesCache = new Map();
  snap.forEach(d => {
    const data = d.data();
    if (data && data.companyId) _rulesCache.set(data.companyId, data);
  });
  _rulesLoadedAt = Date.now();
  return _rulesCache.size;
}

/** Returns true if the cache is loaded and fresh. */
export function isPricingLoaded() {
  return _rulesCache.size > 0 && (Date.now() - _rulesLoadedAt) < CACHE_TTL_MS;
}

/** Direct cache injection — for tests and for admin UI updates. */
export function _setPricingCache(rulesByCompany) {
  _rulesCache = new Map(Object.entries(rulesByCompany || {}));
  _rulesLoadedAt = Date.now();
}

/**
 * Compute the expected shipping cost for a shipment.
 *
 * @param {Object} args
 * @param {string} args.companyId  — shipping company id (matches shippers_v2._id)
 * @param {string} [args.gov]      — governorate (Arabic name as stored)
 * @param {string} [args.city]     — city
 * @param {number} [args.weightKg] — total shipment weight (defaults 0)
 * @param {string} [args.productName] — first product name (for surcharge match)
 * @param {number} [args.qty]      — total quantity (reserved for future use)
 * @returns {Object|null} — { expected, breakdown: [{label, amount}], source }
 *   - null when companyId missing (caller decides fallback)
 */
export function getExpectedCost({ companyId, gov, city, weightKg = 0, productName = '', qty = 0 }) {
  if (!companyId) return null;
  const ruleset = _rulesCache.get(companyId);
  if (!ruleset) {
    return {
      expected: SYSTEM_FALLBACK_COST,
      breakdown: [{ label: 'افتراضي عام', amount: SYSTEM_FALLBACK_COST }],
      source: 'system_fallback',
    };
  }

  const breakdown = [];
  let total = 0;
  let source = '';

  // 1. Base by city / gov / company default
  const govEntry = (ruleset.govRules || {})[gov];
  const cityCost = govEntry && govEntry.cities ? govEntry.cities[city] : undefined;
  if (typeof cityCost === 'number') {
    total += cityCost;
    breakdown.push({ label: `${gov} · ${city}`, amount: cityCost });
    source = 'city';
  } else if (govEntry && typeof govEntry.baseCost === 'number') {
    total += govEntry.baseCost;
    breakdown.push({ label: gov || 'محافظة', amount: govEntry.baseCost });
    source = 'gov';
  } else if (typeof ruleset.defaultBaseCost === 'number') {
    total += ruleset.defaultBaseCost;
    breakdown.push({ label: `افتراضي ${ruleset.companyName || ''}`.trim(), amount: ruleset.defaultBaseCost });
    source = 'company_default';
  } else {
    total += SYSTEM_FALLBACK_COST;
    breakdown.push({ label: 'افتراضي عام', amount: SYSTEM_FALLBACK_COST });
    source = 'system_fallback';
  }

  // 2. Weight surcharge (highest threshold the weight crosses)
  if (weightKg > 0 && Array.isArray(ruleset.weightSurcharges)) {
    const applicable = ruleset.weightSurcharges
      .filter(r => weightKg > r.overKg)
      .sort((a, b) => b.overKg - a.overKg)[0];
    if (applicable) {
      total += applicable.surcharge;
      breakdown.push({ label: `وزن > ${applicable.overKg}كجم`, amount: applicable.surcharge });
    }
  }

  // 3. Product surcharge (first product type match)
  if (productName && ruleset.productSurcharge) {
    const surcharge = ruleset.productSurcharge[productName];
    if (typeof surcharge === 'number' && surcharge > 0) {
      total += surcharge;
      breakdown.push({ label: `إضافة ${productName}`, amount: surcharge });
    }
  }

  return { expected: total, breakdown, source };
}

/**
 * Diff helper — convenience wrapper that returns a structured comparison.
 *
 * @param {number} actual — actual cost recorded on the order
 * @param {Object|null} expected — output of getExpectedCost(...)
 * @returns {Object} — { ok, diff, diffPct, severity }
 *   severity: 'ok' (|diff| <= 5ج) | 'minor' (<=15%) | 'major' (>15%)
 */
export function diffActualVsExpected(actual, expected) {
  if (!expected || typeof expected.expected !== 'number') {
    return { ok: false, diff: 0, diffPct: 0, severity: 'unknown' };
  }
  const a = parseFloat(actual) || 0;
  const e = expected.expected;
  const diff = a - e;
  const absDiff = Math.abs(diff);
  const diffPct = e > 0 ? (diff / e) * 100 : 0;
  let severity = 'ok';
  if (absDiff > 5 && Math.abs(diffPct) > 15) severity = 'major';
  else if (absDiff > 5) severity = 'minor';
  return { ok: severity === 'ok', diff, diffPct, severity };
}
