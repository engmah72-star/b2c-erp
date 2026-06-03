/**
 * Node-runnable tests for scripts/reset-app-data.mjs.
 *
 * What we test:
 *   - resolveCollections: presets, groups, include/exclude, dedup, errors
 *   - parseArgs: scope/include/exclude/confirm/keep/limits parsing
 *   - deleteCollection: dry-run counts vs real delete, keep-set, batching,
 *     recursiveDelete path — all against an in-memory mock Firestore.
 *   - resetAppData: scope resolution + keep-uid wiring + totals
 *
 * Run: node tests/reset-app-data.test.mjs
 */

import {
  COLLECTION_GROUPS,
  SCOPE_PRESETS,
  resolveCollections,
  parseArgs,
  deleteCollection,
  resetAppData,
} from '../scripts/reset-app-data.mjs';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
async function atest(name, fn) {
  try { await fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}
function assert(cond, hint = '') { if (!cond) throw new Error(`assertion failed ${hint}`); }

// ── in-memory mock Firestore ───────────────────────────────────────────
// يحاكي ما تستخدمه deleteCollection: collection(name).limit().startAfter().get()
// + batch().delete()/commit() + (اختياري) recursiveDelete().
function makeMockDb(seed = {}, { recursive = false } = {}) {
  // store: { collName: Map<id, data> } — مرتّبة بـ id لمحاكاة ترتيب __name__
  const store = {};
  for (const [name, ids] of Object.entries(seed)) {
    store[name] = new Map(ids.map((id) => [String(id), { v: 1 }]));
  }
  let commits = 0, recursiveCalls = 0;

  function makeRef(name, id) {
    return { id, _coll: name, path: `${name}/${id}` };
  }
  function makeQuery(name, { after = null, lim = Infinity } = {}) {
    return {
      limit(n) { return makeQuery(name, { after, lim: n }); },
      startAfter(docSnap) { return makeQuery(name, { after: docSnap.id, lim }); },
      async get() {
        const m = store[name] || new Map();
        let ids = [...m.keys()].sort();
        if (after != null) ids = ids.filter((id) => id > after);
        ids = ids.slice(0, lim);
        const docs = ids.map((id) => ({ id, ref: makeRef(name, id) }));
        return { docs, empty: docs.length === 0 };
      },
    };
  }
  const db = {
    collection(name) { return makeQuery(name); },
    batch() {
      const ops = [];
      return {
        delete(ref) { ops.push(ref); },
        async commit() { commits++; for (const ref of ops) store[ref._coll]?.delete(ref.id); },
      };
    },
    _store: store,
    _stats: () => ({ commits, recursiveCalls }),
  };
  if (recursive) {
    db.recursiveDelete = async (ref) => { recursiveCalls++; store[ref._coll]?.delete(ref.id); };
  }
  return db;
}

// ══ resolveCollections ══════════════════════════════════════════════════
test('preset "all" = operational+financial+hr+logs (no config/identity)', () => {
  const cols = resolveCollections({ scope: 'all' });
  assert(cols.includes('orders') && cols.includes('wallets'), 'has operational+financial');
  assert(cols.includes('attendance') && cols.includes('audit_logs'), 'has hr+logs');
  assert(!cols.includes('users') && !cols.includes('employees'), 'no identity');
  assert(!cols.includes('master_lists') && !cols.includes('settings'), 'no config');
});

test('preset "everything" includes identity + config', () => {
  const cols = resolveCollections({ scope: 'everything' });
  assert(cols.includes('users') && cols.includes('employees'), 'identity');
  assert(cols.includes('master_lists') && cols.includes('settings'), 'config');
});

test('group name + include + exclude + dedup', () => {
  const cols = resolveCollections({ scope: 'operational', include: ['notifications', 'orders'], exclude: ['clients'] });
  assert(cols.includes('orders'), 'orders present (dedup ok)');
  assert(cols.includes('notifications'), 'include added');
  assert(!cols.includes('clients'), 'exclude removed');
  assertEq(cols.filter((c) => c === 'orders').length, 1, 'no duplicate orders');
});

test('comma-separated scope tokens', () => {
  const cols = resolveCollections({ scope: 'financial,hr' });
  assert(cols.includes('wallets') && cols.includes('attendance'), 'both groups');
  assert(!cols.includes('orders'), 'no operational');
});

test('unknown scope token throws', () => {
  let threw = false;
  try { resolveCollections({ scope: 'bogus' }); } catch { threw = true; }
  assert(threw, 'should throw on unknown scope');
});

test('groups/presets are non-empty and consistent', () => {
  assert(Object.keys(COLLECTION_GROUPS).length === 6, 'six groups');
  assert(SCOPE_PRESETS.all.length === 4 && SCOPE_PRESETS.everything.length === 6, 'preset sizes');
});

// ══ parseArgs ════════════════════════════════════════════════════════════
test('parseArgs parses all flags', () => {
  const o = parseArgs([
    '--scope=operational,financial', '--include=a,b', '--exclude=clients',
    '--confirm=my-proj', '--keep-uid=U1', '--keep-email=x@y.com',
    '--page-size=50', '--batch-limit=600',
  ]);
  assertEq(o.scope, 'operational,financial');
  assertEq(o.include.join(','), 'a,b');
  assertEq(o.exclude.join(','), 'clients');
  assertEq(o.confirm, 'my-proj');
  assertEq(o.keepUid, 'U1');
  assertEq(o.keepEmail, 'x@y.com');
  assertEq(o.pageSize, 50);
  assertEq(o.batchLimit, 500, 'batch-limit capped at Firestore max 500');
});

test('parseArgs defaults', () => {
  const o = parseArgs([]);
  assertEq(o.scope, 'all');
  assertEq(o.confirm, '');
  assertEq(o.pageSize, 300);
  assertEq(o.batchLimit, 400);
});

// ══ deleteCollection ════════════════════════════════════════════════════
await atest('dry-run counts all, deletes nothing', async () => {
  const db = makeMockDb({ orders: range(7) });
  const r = await deleteCollection(db, 'orders', { dryRun: true, pageSize: 3 });
  assertEq(r.scanned, 7);
  assertEq(r.deleted, 0);
  assertEq(db._store.orders.size, 7, 'nothing deleted in dry-run');
});

await atest('real delete empties collection across pages (batch path)', async () => {
  const db = makeMockDb({ orders: range(10) });
  const r = await deleteCollection(db, 'orders', { dryRun: false, pageSize: 3, batchLimit: 2 });
  assertEq(r.scanned, 10);
  assertEq(r.deleted, 10);
  assertEq(db._store.orders.size, 0, 'collection emptied');
});

await atest('keep-set excludes specific ids and terminates', async () => {
  const db = makeMockDb({ users: ['a', 'b', 'c', 'd'] });
  const r = await deleteCollection(db, 'users', { dryRun: false, pageSize: 2, keep: new Set(['b']) });
  assertEq(r.deleted, 3);
  assertEq(r.kept, 1);
  assert(db._store.users.has('b') && db._store.users.size === 1, 'only kept id remains');
});

await atest('recursiveDelete path used when available', async () => {
  const db = makeMockDb({ orders: range(4) }, { recursive: true });
  const r = await deleteCollection(db, 'orders', { dryRun: false, pageSize: 10 });
  assertEq(r.deleted, 4);
  assertEq(db._stats().recursiveCalls, 4, 'recursiveDelete called per doc');
  assertEq(db._stats().commits, 0, 'no batch commits when recursive available');
  assertEq(db._store.orders.size, 0);
});

await atest('empty collection → zero, no error', async () => {
  const db = makeMockDb({});
  const r = await deleteCollection(db, 'orders', { dryRun: false });
  assertEq(r.scanned, 0);
  assertEq(r.deleted, 0);
});

// ══ resetAppData ═════════════════════════════════════════════════════════
await atest('resetAppData dry-run totals across scope', async () => {
  const db = makeMockDb({ orders: range(5), clients: range(3), wallets: range(2) });
  const r = await resetAppData(db, { scope: 'operational,financial', dryRun: true, onLog: () => {} });
  assert(r.dryRun, 'dryRun flag');
  assertEq(r.totalScanned, 10);
  assertEq(r.totalDeleted, 10, 'dry-run reports would-delete = scanned - kept');
  assertEq(db._store.orders.size, 5, 'nothing actually deleted');
});

await atest('resetAppData real run with keep-uid preserves admin', async () => {
  const db = makeMockDb({ users: ['admin1', 'u2', 'u3'], employees: range(2) });
  const r = await resetAppData(db, {
    scope: 'identity', dryRun: false, keepUid: 'admin1', onLog: () => {},
  });
  assertEq(r.totalKept, 1);
  assert(db._store.users.has('admin1'), 'admin kept');
  assertEq(db._store.users.size, 1, 'other users deleted');
  assertEq(db._store.employees.size, 0, 'employees wiped');
});

await atest('resetAppData empty scope throws', async () => {
  const db = makeMockDb({});
  let threw = false;
  try { await resetAppData(db, { scope: 'operational', exclude: COLLECTION_GROUPS.operational }); }
  catch { threw = true; }
  assert(threw, 'empty resolved scope should throw');
});

function range(n) { return Array.from({ length: n }, (_, i) => `id${String(i).padStart(3, '0')}`); }

// ── summary ──────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
