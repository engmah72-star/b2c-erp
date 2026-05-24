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

export default { findDuplicatePhones };
