/**
 * Business2Card ERP — features/clients/duplicate-scan.js
 *
 * ━━━ PURE HELPER ━━━
 *
 * Groups loaded clients by normalized phone number (phone1 + phone2)
 * and returns groups containing more than one active (non-deleted) client.
 *
 * Used by clients.html → openDupScan() admin tool. The helper is pure
 * (no Firestore / DOM), takes the already-loaded `clients` array, and
 * is unit-tested in tests/features-clients-duplicate-scan.test.mjs.
 *
 * Schema-faithful: each input client is expected to have
 *   { _id, name, phone1, phone2, isDeleted?, status?, ... }
 * matching the `clients` collection shape.
 */

/** EG mobile: 010/011/012/015 + 8 digits — matches client-actions.js validator. */
const RE_EG_PHONE = /^01[0125][0-9]{8}$/;

/**
 * @param {Array<Object>} clients — loaded client docs (with _id)
 * @returns {Array<{ phone: string, clients: Array<Object> }>}
 *   Sorted: largest group first, ties broken by phone (asc).
 *   Only groups with size ≥ 2 are returned.
 *   Empty/invalid/deleted phones are skipped.
 *   The same client appears once per group it belongs to (e.g. if their
 *   phone1 collides with another client's phone2 the pair is one group).
 */
export function findDuplicatePhones(clients = []) {
  if (!Array.isArray(clients)) return [];

  // Map<normalizedPhone, Set<clientId>>
  const phoneToIds = new Map();
  const clientById = new Map();

  for (const c of clients) {
    if (!c || !c._id) continue;
    if (c.isDeleted) continue;
    clientById.set(c._id, c);

    const p1 = String(c.phone1 || '').trim();
    const p2 = String(c.phone2 || '').trim();
    for (const p of [p1, p2]) {
      if (!p || !RE_EG_PHONE.test(p)) continue;
      if (!phoneToIds.has(p)) phoneToIds.set(p, new Set());
      phoneToIds.get(p).add(c._id);
    }
  }

  const groups = [];
  for (const [phone, idSet] of phoneToIds.entries()) {
    if (idSet.size < 2) continue;
    groups.push({
      phone,
      clients: [...idSet]
        .map((id) => clientById.get(id))
        .filter(Boolean),
    });
  }

  groups.sort((a, b) =>
    b.clients.length - a.clients.length || a.phone.localeCompare(b.phone),
  );
  return groups;
}

/**
 * Pure planner for a client-merge operation. Validates inputs and computes:
 *   - total Firestore ops needed (so the action can refuse if > batch limit)
 *   - merged gallery (deduped by URL)
 *   - friendly warnings (e.g. dup has non-zero wallet balance — must clear first)
 *
 * Does NOT touch Firestore. The action in client-actions.js calls this first
 * and only proceeds when ok=true.
 *
 * @param {Object} args
 * @param {Object} args.primary     — primary client doc (the one to keep)
 * @param {Array}  args.duplicates  — duplicate client docs (to be merged in)
 * @param {Object} args.counts      — { orders, transactions, followups, designItems, returnsTickets } summed across all dups
 * @param {Array}  [args.dupWallets=[]] — customer_wallets docs for dups (each: { _id, balance })
 * @param {number} [args.maxOps=400] — soft cap (Firestore batch limit is 500)
 * @returns {{ ok, errors, warnings, totalOps, mergedGallery }}
 */
export function planClientMerge({
  primary,
  duplicates = [],
  counts = {},
  dupWallets = [],
  maxOps = 400,
} = {}) {
  const errors = [];
  const warnings = [];

  if (!primary || !primary._id) errors.push('⚠️ العميل الأساسي مطلوب');
  if (!Array.isArray(duplicates) || !duplicates.length) {
    errors.push('⚠️ لا يوجد عملاء للدمج');
  }
  if (primary?.isDeleted) errors.push('⚠️ العميل الأساسي محذوف');
  duplicates.forEach((d, i) => {
    if (!d || !d._id) errors.push(`⚠️ العميل المكرر #${i + 1} غير صالح`);
    else if (d.isDeleted) errors.push(`⚠️ العميل المكرر "${d.name || d._id}" محذوف بالفعل`);
    else if (primary && d._id === primary._id) {
      errors.push('⚠️ العميل الأساسي لا يصح أن يكون ضمن العملاء المكررين');
    }
  });

  // Refuse if any dup has non-zero customer wallet balance — needs manual refund first
  for (const w of dupWallets) {
    const bal = Number(w?.balance || 0);
    if (bal !== 0) {
      const dupName = duplicates.find((d) => d._id === w._id)?.name || w._id;
      errors.push(`⛔ العميل "${dupName}" عنده رصيد محفظة ${bal} ج — صفّ الرصيد قبل الدمج`);
    }
  }

  if (errors.length) {
    return { ok: false, errors, warnings, totalOps: 0, mergedGallery: [] };
  }

  // Each related doc = 1 update; each dup = 1 update; primary = 1 update; audit = 1 set
  const ordersN     = Number(counts.orders         || 0);
  const txsN        = Number(counts.transactions   || 0);
  const followupsN  = Number(counts.followups      || 0);
  const designN     = Number(counts.designItems    || 0);
  const returnsN    = Number(counts.returnsTickets || 0);
  const totalOps =
    ordersN + txsN + followupsN + designN + returnsN +
    duplicates.length + 2; // +1 primary update, +1 audit_logs set

  if (totalOps > maxOps) {
    errors.push(
      `⚠️ عدد العمليات (${totalOps}) أكبر من الحد (${maxOps}). ` +
      'قسّم الدمج لمجموعات أصغر.',
    );
    return { ok: false, errors, warnings, totalOps, mergedGallery: [] };
  }

  // Merge galleries — dedupe by URL, primary's items come first
  const mergedGallery = [];
  const seenUrls = new Set();
  for (const g of (primary?.gallery || [])) {
    if (g?.url && !seenUrls.has(g.url)) { mergedGallery.push(g); seenUrls.add(g.url); }
  }
  for (const dup of duplicates) {
    for (const g of (dup?.gallery || [])) {
      if (g?.url && !seenUrls.has(g.url)) { mergedGallery.push(g); seenUrls.add(g.url); }
    }
  }

  return { ok: true, errors, warnings, totalOps, mergedGallery };
}

export default { findDuplicatePhones, planClientMerge };
