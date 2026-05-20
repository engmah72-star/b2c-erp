/**
 * scripts/drop-legacy-shippingStatus.js
 *
 * One-time migration — drops the legacy `shippingStatus` field from orders/*
 * documents. The field has been unread by application code since Step 4.3
 * (PR #590). Only `dispatched` and `returned` values were ever written, and
 * both have been replaced by `shipStage` reads (RULE W1.1 canonical).
 *
 * **DRY-RUN by default.** Set DRY_RUN=false to actually delete the field.
 *
 * ────────────────────────────────────────────────────────────────────────
 * Background (from STABILIZATION_PLAN.md Step 4 + audit results):
 *   - PR #588 removed the write of `shippingStatus:'dispatched'` (was unread)
 *   - PR #589 migrated `shippingStatus==='delivered'` reads to isDelivered()
 *   - PR #590 migrated `shippingStatus==='returned'` reads to shipStage check
 *           and dropped the write of `shippingStatus:'returned'`
 *   - This script (PR #599 — Step 4.4) cleans up legacy values still in
 *     existing Firestore docs. The field is harmless when unread but
 *     removing it shrinks doc size and makes the model clearer.
 *
 * ────────────────────────────────────────────────────────────────────────
 * Usage:
 *   1. Set GOOGLE_APPLICATION_CREDENTIALS env to your service account JSON
 *   2. Dry-run (count + sample only):
 *        node scripts/drop-legacy-shippingStatus.js
 *   3. Real run (actually deletes the field):
 *        DRY_RUN=false node scripts/drop-legacy-shippingStatus.js
 *
 * Safety:
 *   - Reads orders in pages of 200 (no full-scan in memory)
 *   - Only touches docs where shippingStatus IS defined
 *   - Uses FieldValue.delete() to remove a single field — does NOT
 *     overwrite the doc
 *   - Writes in batches of 400 (Firestore limit is 500)
 *   - Logs every batch result
 *
 * Rollback:
 *   The field had only legacy values ('dispatched', 'returned'). If a
 *   rollback is ever needed, replay timeline entries to reconstruct the
 *   intent — but this is unlikely since no app code reads the field.
 */

// ── Admin SDK setup ──────────────────────────────────────────────────────
// import { initializeApp, cert } from 'firebase-admin/app';
// import { getFirestore, FieldValue } from 'firebase-admin/firestore';
// initializeApp({ credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS) });
// const db = getFirestore();

// Uncomment the lines above when running locally. They're commented here
// so the file is importable from tests without requiring the admin SDK.

const DRY_RUN = process.env.DRY_RUN !== 'false';
const PAGE_SIZE = 200;
const BATCH_LIMIT = 400;

export async function dropLegacyShippingStatus(db, FieldValue, opts = {}) {
  const dryRun = opts.dryRun !== undefined ? !!opts.dryRun : DRY_RUN;
  const pageSize = opts.pageSize || PAGE_SIZE;
  const batchLimit = opts.batchLimit || BATCH_LIMIT;
  const onLog = opts.onLog || ((msg) => console.log(msg));

  onLog(`[migration] drop-legacy-shippingStatus — DRY_RUN=${dryRun}`);
  onLog(`[migration] page size: ${pageSize}, batch limit: ${batchLimit}`);

  let lastDoc = null;
  let totalScanned = 0;
  let totalAffected = 0;
  let totalDeleted = 0;
  const valueCounts = { dispatched: 0, returned: 0, other: 0, null: 0 };
  const samples = [];

  while (true) {
    let q = db.collection('orders').orderBy('__name__').limit(pageSize);
    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    if (snap.empty) break;

    totalScanned += snap.size;
    const toDelete = [];

    for (const doc of snap.docs) {
      const data = doc.data();
      if (!('shippingStatus' in data)) continue;

      totalAffected++;
      const val = data.shippingStatus;
      if (val === 'dispatched') valueCounts.dispatched++;
      else if (val === 'returned') valueCounts.returned++;
      else if (val === null || val === undefined) valueCounts.null++;
      else valueCounts.other++;

      if (samples.length < 5) {
        samples.push({ id: doc.id, value: val, shipStage: data.shipStage, orderNumber: data.orderNumber });
      }

      toDelete.push(doc.ref);
    }

    if (!dryRun && toDelete.length) {
      // Commit in chunks of batchLimit (Firestore writeBatch limit is 500)
      for (let i = 0; i < toDelete.length; i += batchLimit) {
        const chunk = toDelete.slice(i, i + batchLimit);
        const batch = db.batch();
        for (const ref of chunk) {
          batch.update(ref, { shippingStatus: FieldValue.delete() });
        }
        await batch.commit();
        totalDeleted += chunk.length;
        onLog(`[migration] committed batch: ${chunk.length} docs (running total ${totalDeleted})`);
      }
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < pageSize) break;
  }

  onLog('───────────────────────────────────────────────');
  onLog(`[migration] DONE${dryRun ? ' (dry-run — no writes)' : ''}`);
  onLog(`  total scanned : ${totalScanned}`);
  onLog(`  affected docs : ${totalAffected}`);
  onLog(`  by value:     dispatched=${valueCounts.dispatched}, returned=${valueCounts.returned}, other=${valueCounts.other}, null=${valueCounts.null}`);
  if (!dryRun) onLog(`  fields deleted: ${totalDeleted}`);
  if (samples.length) {
    onLog('  sample docs:');
    for (const s of samples) {
      onLog(`    - ${s.id} (#${s.orderNumber || ''}) shippingStatus=${JSON.stringify(s.value)} shipStage=${JSON.stringify(s.shipStage)}`);
    }
  }
  onLog('───────────────────────────────────────────────');

  return { totalScanned, totalAffected, totalDeleted, valueCounts, samples };
}

// ── Direct invocation ────────────────────────────────────────────────────
// Uncomment to run as a CLI:
//
// import { initializeApp, cert } from 'firebase-admin/app';
// import { getFirestore, FieldValue } from 'firebase-admin/firestore';
// initializeApp({
//   credential: cert(JSON.parse(require('fs').readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'))),
// });
// const db = getFirestore();
// dropLegacyShippingStatus(db, FieldValue).catch(e => { console.error(e); process.exit(1); });
