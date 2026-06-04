/**
 * tests/architecture-order-centric.test.mjs
 *
 * Regression lock for docs/ARCHITECTURE_CENTRALITY_AUDIT.md:
 *   Order (orders/{id}) + FSE collections are the SINGLE source of truth.
 *   Conversations are communication only — no business logic.
 *
 * Static source assertions (no Firestore / no emulator needed):
 *   1) No Cloud Function trigger on conversations/messages.
 *   2) Messaging files never write to order/financial collections.
 *   3) No code reads financial/derived truth from a message snapshot (orderRef.*).
 *   4) The structured order_requests path exists (client create + staff convert).
 *   5) Client design-approval has no chat-message fallback.
 *
 * Run: node tests/architecture-order-centric.test.mjs
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
// strip // line comments and /* */ blocks so matches are real code, not prose
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// ── recursive walk of source files (excl. infra/docs/tests) ──
const ROOT = new URL('..', import.meta.url).pathname;
const SKIP = new Set(['.git', 'node_modules', 'docs', 'tests', '_archive', 'screenshots']);
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(js|html)$/.test(name)) out.push(p);
  }
  return out;
}

// 1) No Cloud Function trigger on conversations/messages
test('functions/index.js — no trigger on conversations/messages', () => {
  const src = code(read('functions/index.js'));
  const m = src.match(/(onDocument[A-Za-z]*|\.document)\s*\(\s*['"]conversations/);
  assert(!m, `found conversations trigger: ${m && m[0]}`);
});

// 2) Messaging files never write to order/financial collections
for (const f of ['inbox-actions.js', 'features/customer-portal/services/chat.service.js']) {
  test(`${f} — no order/financial writes`, () => {
    const src = code(read(f));
    const m = src.match(/dispatchFinancialEvent\s*\(|addLedgerToBatch\s*\(|transactions_v2|financial_ledger/);
    assert(!m, `found business write/ref: ${m && m[0]}`);
  });
}

// 3) No code reads financial/derived truth from a message snapshot (orderRef.*)
test('repo — no orderRef.<financialField> reads', () => {
  const FIN = /orderRef\.(salePrice|remaining|totalPaid|paymentStatus|discount|deposit|paid|grossTotal|dueByCo|net)\b/;
  const offenders = [];
  for (const p of walk(ROOT)) {
    const rel = p.slice(ROOT.length);
    let m;
    try { m = code(readFileSync(p, 'utf8')).match(FIN); } catch { continue; }
    if (m) offenders.push(`${rel}: ${m[0]}`);
  }
  assert(offenders.length === 0, `financial truth read from snapshot:\n    ${offenders.join('\n    ')}`);
});

// 4) Structured order_requests path exists (create + convert)
test('clientActions.createOrderRequest writes order_requests (not orders/financial)', () => {
  const src = code(read('client-actions.js'));
  assert(/createOrderRequest\s*\(/.test(src), 'createOrderRequest missing');
  const body = src.slice(src.indexOf('createOrderRequest'));
  const block = body.slice(0, body.indexOf('sendClientMessage'));
  assert(/['"]order_requests['"]/.test(block), 'does not write order_requests');
  assert(!/dispatchFinancialEvent|transactions_v2|financial_ledger/.test(block), 'must not touch financial collections');
});
test('orderActions.createOrderFromRequest exists and routes through createOrder', () => {
  const src = code(read('order-actions.js'));
  assert(/createOrderFromRequest\s*\(/.test(src), 'createOrderFromRequest missing');
  const block = src.slice(src.indexOf('createOrderFromRequest'), src.indexOf('createOrderFromRequest') + 2000);
  assert(/createOrder\s*\(/.test(block), 'must reuse createOrder (atomic/financial path)');
  assert(/order_requests/.test(block), 'must mark the request converted');
});

// 5) Client approval has no chat-message fallback
test('order-detail approve path has no sendRequest fallback', () => {
  const src = code(read('features/customer-portal/views/order-detail.view.js'));
  const i = src.indexOf("a === 'approve'");
  assert(i !== -1, "approve handler not found");
  const block = src.slice(i, i + 600);
  assert(!/sendRequest/.test(block), 'approve still falls back to a chat message');
  assert(/approveDesign/.test(block), 'approve must call the central Cloud Function');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
