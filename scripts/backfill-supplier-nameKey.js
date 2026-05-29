/**
 * scripts/backfill-supplier-nameKey.js
 *
 * One-time migration — populates the `nameKey` field on existing supplier
 * documents in `suppliers_v2` and `shippers_v2`.
 *
 * Background (Supplier Charter — RULE SUP1, principles 4 + 7):
 *   `supplier-actions.js` added a duplicate guard on create() that queries
 *   `where('nameKey','==', key)`. New/edited suppliers get `nameKey` written
 *   automatically. Legacy docs created before that change have no `nameKey`,
 *   so the name-based dedup can't see them (the phone fallback still works).
 *   This backfill computes `nameKey` for legacy docs so duplicate detection
 *   covers the full supplier base.
 *
 * **DRY-RUN by default.** Set DRY_RUN=false to actually write.
 *
 * ────────────────────────────────────────────────────────────────────────
 * Usage:
 *   1. Set GOOGLE_APPLICATION_CREDENTIALS env to your service account JSON
 *   2. Dry-run (count + sample only):
 *        node scripts/backfill-supplier-nameKey.js
 *   3. Real run (actually writes nameKey):
 *        DRY_RUN=false node scripts/backfill-supplier-nameKey.js
 *
 * Safety:
 *   - Reads each collection in pages of 200 (no full-scan in memory)
 *   - Only touches docs where nameKey is MISSING or DIFFERS from the
 *     computed key (idempotent — re-running is a no-op once converged)
 *   - Never overwrites any other field (batch.update with a single key)
 *   - Writes in batches of 400 (Firestore limit is 500)
 *   - Docs with an empty/blank name are skipped (logged as `blankName`)
 *
 * Rollback:
 *   `nameKey` is a derived, additive field read only by the dedup query.
 *   To roll back, delete the field — no operational data depends on it.
 */

// ── Admin SDK setup ──────────────────────────────────────────────────────
// import { initializeApp, cert } from 'firebase-admin/app';
// import { getFirestore } from 'firebase-admin/firestore';
// initializeApp({ credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS) });
// const db = getFirestore();
//
// Uncomment the lines above when running locally. They're commented here so
// the file is importable from tests without requiring the admin SDK.

const DRY_RUN = process.env.DRY_RUN !== 'false';
const PAGE_SIZE = 200;
const BATCH_LIMIT = 400;
const COLLECTIONS = ['suppliers_v2', 'shippers_v2'];

/**
 * MUST stay identical to `_nameKey()` in supplier-actions.js — the dedup
 * query matches on this exact normalization (trim + collapse spaces + lower).
 */
export function nameKeyOf(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * @param db          Firestore (admin SDK) instance
 * @param opts.dryRun       default from DRY_RUN env (true)
 * @param opts.collections  default ['suppliers_v2','shippers_v2']
 * @param opts.pageSize / opts.batchLimit / opts.onLog
 * @returns per-collection + aggregate stats
 */
export async function backfillSupplierNameKey(db, opts = {}) {
  const dryRun = opts.dryRun !== undefined ? !!opts.dryRun : DRY_RUN;
  const pageSize = opts.pageSize || PAGE_SIZE;
  const batchLimit = opts.batchLimit || BATCH_LIMIT;
  const collections = opts.collections || COLLECTIONS;
  const onLog = opts.onLog || ((msg) => console.log(msg));

  onLog(`[migration] backfill-supplier-nameKey — DRY_RUN=${dryRun}`);
  onLog(`[migration] collections: ${collections.join(', ')} | page=${pageSize} batch=${batchLimit}`);

  const agg = { totalScanned: 0, totalNeedsKey: 0, totalWritten: 0, blankName: 0 };
  const perCollection = {};

  for (const col of collections) {
    let lastDoc = null;
    const stats = { scanned: 0, needsKey: 0, written: 0, blankName: 0, samples: [] };

    while (true) {
      let q = db.collection(col).orderBy('__name__').limit(pageSize);
      if (lastDoc) q = q.startAfter(lastDoc);

      const snap = await q.get();
      if (snap.empty) break;

      stats.scanned += snap.size;
      const toWrite = [];

      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        const key = nameKeyOf(data.name);
        if (!key) { stats.blankName++; continue; }       // blank name — skip
        if (data.nameKey === key) continue;              // already correct — idempotent

        stats.needsKey++;
        if (stats.samples.length < 5) {
          stats.samples.push({ id: docSnap.id, name: data.name, oldKey: data.nameKey ?? '(unset)', newKey: key });
        }
        toWrite.push({ ref: docSnap.ref, key });
      }

      if (!dryRun && toWrite.length) {
        for (let i = 0; i < toWrite.length; i += batchLimit) {
          const chunk = toWrite.slice(i, i + batchLimit);
          const batch = db.batch();
          for (const { ref, key } of chunk) batch.update(ref, { nameKey: key });
          await batch.commit();
          stats.written += chunk.length;
          onLog(`[migration] ${col}: committed ${chunk.length} (running ${stats.written})`);
        }
      }

      lastDoc = snap.docs[snap.docs.length - 1];
      if (snap.size < pageSize) break;
    }

    perCollection[col] = stats;
    agg.totalScanned += stats.scanned;
    agg.totalNeedsKey += stats.needsKey;
    agg.totalWritten += stats.written;
    agg.blankName += stats.blankName;

    onLog(`[migration] ${col}: scanned=${stats.scanned} needsKey=${stats.needsKey} written=${stats.written} blankName=${stats.blankName}`);
    for (const s of stats.samples) {
      onLog(`    - ${s.id} name=${JSON.stringify(s.name)} ${s.oldKey} → ${JSON.stringify(s.newKey)}`);
    }
  }

  onLog('───────────────────────────────────────────────');
  onLog(`[migration] DONE${dryRun ? ' (dry-run — no writes)' : ''}`);
  onLog(`  scanned=${agg.totalScanned} needsKey=${agg.totalNeedsKey} written=${agg.totalWritten} blankName=${agg.blankName}`);
  onLog('───────────────────────────────────────────────');

  return { ...agg, perCollection };
}

// ── Direct invocation ────────────────────────────────────────────────────
// Uncomment to run as a CLI:
//
// import { initializeApp, cert } from 'firebase-admin/app';
// import { getFirestore } from 'firebase-admin/firestore';
// import { readFileSync } from 'fs';
// initializeApp({
//   credential: cert(JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'))),
// });
// const db = getFirestore();
// backfillSupplierNameKey(db).catch(e => { console.error(e); process.exit(1); });
