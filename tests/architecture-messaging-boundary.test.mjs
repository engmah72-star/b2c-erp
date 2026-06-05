/**
 * tests/architecture-messaging-boundary.test.mjs
 *
 * Regression Architecture Lock — حدود Messaging ↔ Business.
 * المرجع: docs/MESSAGING_VS_BUSINESS_BOUNDARY.md
 *
 *   طبقة المراسلة = قناة تواصل فقط، لا تملك Business State.
 *   تُمنع ملفاتها النقية من:
 *     R1) import من وحدة أعمال/مالية.
 *     R2) استدعاء دالة كتابة أعمال/مالية.
 *     R3) الكتابة/الإشارة إلى collection أعمال/مالية عبر doc()/collection().
 *
 * Static source assertions (بلا Firestore / بلا emulator). مُكمِّل للقفل السلوكي
 * في architecture-order-centric.test.mjs.
 *
 * Run: node tests/architecture-messaging-boundary.test.mjs
 */
import { readFileSync, existsSync } from 'fs';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
const path = (p) => new URL(`../${p}`, import.meta.url);
// جرّد التعليقات (// و /* */) فالمطابقة على كود حقيقي لا نصوص/تعليقات.
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// ── مجموعة المراسلة النقية (قناة تواصل فقط) ──
// skip-if-absent: ملفات Phase-0 (messaging-policy / conversation-services) تُقفَل
// تلقائياً فور إنشائها دون كسر القفل الآن.
const MESSAGING_FILES = [
  'inbox-actions.js',
  'core/inbox-utils.js',
  'inbox-badge.js',
  'features/customer-portal/services/chat.service.js',
  'features/customer-portal/views/chat.view.js',
  'features/customer-portal/views/conversations.view.js',
  'features/inbox/views/chat-view.js',
  'features/inbox/views/conv-list-view.js',
  // Phase-0 (لاحقاً):
  'core/messaging-policy.js',
];

// ملفات مستثناة صراحةً (موثّقة في BOUNDARY §5):
//   client-actions.js → ملف مختلط (مراسلة + أعمال مشروعة مثل createOrderRequest)
//   notifications.js   → reader للعرض (يقرأ orders/tasks، لا يكتب أعمالاً)

// ── أنماط ممنوعة ──
const RE_BIZ_IMPORT = /\bfrom\s+['"][^'"]*\b(order-actions|orders\.js|financial-sync-engine|finance-core|returns-core|approval-actions|order-math|wallet-actions|shipping-actions|product-actions|production-actions)\b[^'"]*['"]/;
const RE_BIZ_FN = /\b(dispatchFinancialEvent|addLedgerToBatch|advanceOrderStageWithLock|buildStageAdvance|buildStageRevert|buildArchiveSpec)\s*\(/;
const BIZ_COLLECTIONS = [
  'orders', 'order_requests', 'transactions_v2', 'financial_ledger', 'wallets',
  'employee_payments', 'supplier_payments', 'shipping_settlements',
  'payment_requests', 'reconciliations', 'returns_tickets', 'supplier_orders',
];
const RE_BIZ_WRITE = new RegExp(
  `(collection|doc)\\s*\\(\\s*[^,)]*,\\s*['"](${BIZ_COLLECTIONS.join('|')})['"]`
);

const present = MESSAGING_FILES.filter((f) => existsSync(path(f)));

// meta: القفل ليس no-op صامتاً — لازم الملفات الأساسية موجودة.
test('lock covers the core messaging files (not a silent no-op)', () => {
  for (const must of ['inbox-actions.js', 'features/customer-portal/services/chat.service.js']) {
    assert(present.includes(must), `core messaging file missing from lock set: ${must}`);
  }
  assert(present.length >= 5, `expected ≥5 messaging files present, got ${present.length}`);
});

for (const f of present) {
  const src = code(readFileSync(path(f), 'utf8'));

  test(`R1 ${f} — no import from a business/financial module`, () => {
    const m = src.match(RE_BIZ_IMPORT);
    assert(!m, `business import found: ${m && m[0]}`);
  });

  test(`R2 ${f} — no business/financial write-function call`, () => {
    const m = src.match(RE_BIZ_FN);
    assert(!m, `business write fn found: ${m && m[0]}`);
  });

  test(`R3 ${f} — no write/ref to a business/financial collection`, () => {
    const m = src.match(RE_BIZ_WRITE);
    assert(!m, `business collection ref found: ${m && m[0]}`);
  });
}

console.log(`\n${passed} passed, ${failed} failed  (messaging files locked: ${present.length})`);
process.exit(failed ? 1 : 0);
