/**
 * Node-runnable tests for scripts/backfill-supplier-nameKey.js.
 * Run: node tests/backfill-supplier-nameKey.test.mjs
 *
 * Uses a tiny in-memory fake of the Firestore admin SDK surface the script
 * relies on (collection/orderBy/limit/startAfter/get + batch/update/commit).
 * Validates: normalization, dry-run safety, real-run writes, idempotency,
 * and blank-name skipping.
 */
import { nameKeyOf, backfillSupplierNameKey } from '../scripts/backfill-supplier-nameKey.js';

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}

// ── Minimal fake admin Firestore ───────────────────────────────────────────
function makeFakeDb(seed) {
  const store = {};
  for (const [col, docs] of Object.entries(seed)) {
    store[col] = docs.map(d => ({ id: d.id, data: { ...d } }));
    store[col].forEach(d => delete d.data.id);
  }
  function makeQuery(col, { after = null } = {}) {
    return {
      orderBy() { return this; },
      limit() { return this; },
      startAfter(doc) { return makeQuery(col, { after: doc.id }); },
      async get() {
        let rows = (store[col] || []).slice().sort((a, b) => a.id < b.id ? -1 : 1);
        if (after) rows = rows.filter(r => r.id > after);
        const docs = rows.map(r => ({
          id: r.id,
          data: () => ({ ...r.data }),
          ref: { _col: col, _id: r.id },
        }));
        return { empty: docs.length === 0, size: docs.length, docs };
      },
    };
  }
  return {
    _store: store,
    collection(col) { return makeQuery(col); },
    batch() {
      const ops = [];
      return {
        update(ref, patch) { ops.push({ ref, patch }); },
        async commit() {
          for (const { ref, patch } of ops) {
            const row = store[ref._col].find(r => r.id === ref._id);
            Object.assign(row.data, patch);
          }
        },
      };
    },
  };
}

const silent = () => {};

// ── nameKeyOf ──
await test('nameKeyOf trims, collapses spaces, lowercases', () => {
  assertEq(nameKeyOf('  Al  Noor  PRINT '), 'al noor print');
  assertEq(nameKeyOf('مطبعة   النور'), 'مطبعة النور');
  assertEq(nameKeyOf(''), '');
  assertEq(nameKeyOf(null), '');
});

// ── dry-run writes nothing ──
await test('dry-run computes needsKey but writes nothing', async () => {
  const db = makeFakeDb({
    suppliers_v2: [
      { id: 'a', name: 'Al Noor', nameKey: 'al noor' }, // already correct
      { id: 'b', name: 'Future Press' },                // missing nameKey
    ],
    shippers_v2: [],
  });
  const res = await backfillSupplierNameKey(db, { dryRun: true, onLog: silent });
  assertEq(res.totalNeedsKey, 1, 'one doc needs key');
  assertEq(res.totalWritten, 0, 'dry-run writes nothing');
  assertEq(db._store.suppliers_v2.find(r => r.id === 'b').data.nameKey, undefined, 'b untouched');
});

// ── real run writes only missing/differing, then idempotent ──
await test('real run backfills missing keys and is idempotent', async () => {
  const db = makeFakeDb({
    suppliers_v2: [
      { id: 'a', name: 'Al Noor', nameKey: 'al noor' },     // correct
      { id: 'b', name: '  Future  Press ' },                // missing
      { id: 'c', name: 'Old', nameKey: 'STALE' },           // differs
      { id: 'd', name: '   ' },                             // blank → skip
    ],
    shippers_v2: [
      { id: 's1', name: 'Bosta' },                          // missing
    ],
  });
  const res = await backfillSupplierNameKey(db, { dryRun: false, onLog: silent });
  assertEq(res.totalWritten, 3, 'b + c + s1 written');
  assertEq(res.blankName, 1, 'd skipped as blank');
  assertEq(db._store.suppliers_v2.find(r => r.id === 'b').data.nameKey, 'future press');
  assertEq(db._store.suppliers_v2.find(r => r.id === 'c').data.nameKey, 'old');
  assertEq(db._store.shippers_v2.find(r => r.id === 's1').data.nameKey, 'bosta');

  // re-run → nothing left to write
  const res2 = await backfillSupplierNameKey(db, { dryRun: false, onLog: silent });
  assertEq(res2.totalWritten, 0, 'idempotent on second run');
  assertEq(res2.totalNeedsKey, 0, 'nothing needs key after converge');
});

console.log(`\n${passed}/${passed + failed} tests passed`);
if (failed) process.exit(1);
