/**
 * Tests for approvals-render.js (pure render + formatting layer for approvals.html).
 *
 * يغطّي العقود السلوكية للطبقة المُستخرَجة من الصفحة (God-page decomposition):
 * المنسّقات، اشتقاق سجلّ العميل/الكيان، أزرار الإجراءات حسب القدرات والطبقات،
 * هروب الـ XSS، إخفاء الهاتف عبر ctx (RULE 8)، وحارس الإجراء الجماعي.
 *
 * Run: node tests/approvals-render.test.mjs
 */
import {
  fn, escapeHtml, fmtDate, fmtAge, REQ_TYPE_LBL,
  getClientHistory, entityHistory,
  renderOrderDetails, renderRequestCard, renderCard, renderSuppliersDue, bulkBar,
} from '../approvals-render.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}
function assert(cond, hint = '') { if (!cond) throw new Error(`assertion failed ${hint}`); }

// قاعدة ctx افتراضية — تُدمَج فوقها التخصيصات لكل اختبار.
function ctx(over = {}) {
  return {
    currentUid: 'me', currentRole: 'admin', currentPerms: {}, financialPolicy: null,
    walletsArr: [], walletsMap: new Map(), allTxs: [], ordersMap: new Map(), requests: [],
    displayPhone: (p) => p, staleHours: 48, activeTab: 'pending',
    ...over,
  };
}

// ── FORMATTERS ──────────────────────────────────────────────────────
test('fn: parses + localizes; NaN → 0', () => {
  assertEq(fn('abc'), (0).toLocaleString('ar-EG'));
  assertEq(fn(1500), (1500).toLocaleString('ar-EG'));
});

test('escapeHtml: escapes the 5 dangerous chars', () => {
  assertEq(escapeHtml(`<b>&"'`), '&lt;b&gt;&amp;&quot;&#39;');
  assertEq(escapeHtml(null), '');
});

test('fmtDate: seconds → date, string passthrough, empty → dash', () => {
  assertEq(fmtDate(null), '—');
  assertEq(fmtDate('2026-01-01'), '2026-01-01');
  assert(fmtDate({ seconds: 1700000000 }) !== '—', 'seconds should format');
});

test('fmtAge: <24h in hours, >=24h in days', () => {
  assertEq(fmtAge(3), '3 ساعة');
  assertEq(fmtAge(48), '2 يوم');
  assertEq(fmtAge(50), '2 ي 2 س');
  assertEq(fmtAge(0), '1 ساعة'); // clamps to min 1 ساعة
});

test('REQ_TYPE_LBL maps known types', () => {
  assert(REQ_TYPE_LBL.supplier_payment.includes('مورد'));
  assert(REQ_TYPE_LBL.salary.includes('مرتب'));
});

// ── getClientHistory ────────────────────────────────────────────────
test('getClientHistory: null clientId → null', () => {
  assertEq(getClientHistory('', ctx()), null);
});

test('getClientHistory: aggregates orders + remaining (clamped ≥0)', () => {
  const ordersMap = new Map([
    ['o1', { _id: 'o1', clientId: 'c1', salePrice: 1000, totalPaid: 400, customerShipFee: 0, discount: 0 }],
    ['o2', { _id: 'o2', clientId: 'c1', salePrice: 500, totalPaid: 500 }],
    ['o3', { _id: 'o3', clientId: 'cX', salePrice: 999 }],
  ]);
  const h = getClientHistory('c1', ctx({ ordersMap }));
  assertEq(h.totalOrders, 2);
  assertEq(h.totalSale, 1500);
  assertEq(h.totalPaid, 900);
  assertEq(h.totalRem, 600); // (1000-400) + max(0,500-500)
});

// ── entityHistory ───────────────────────────────────────────────────
test('entityHistory: matches supplier out-txs, excludes current + reversals', () => {
  const allTxs = [
    { _id: 't1', supplierId: 's1', type: 'out', amount: 100 },
    { _id: 't2', supplierId: 's1', type: 'out', amount: 200, isReversal: true }, // excluded
    { _id: 't3', supplierId: 's1', type: 'in', amount: 50 },  // wrong direction
    { _id: 'cur', supplierId: 's1', type: 'out', amount: 999 }, // current → excluded
  ];
  const h = entityHistory({ type: 'supplier_payment', supplierId: 's1', txId: 'cur' }, ctx({ allTxs }));
  assertEq(h.count, 1);
  assertEq(h.total, 100);
});

// ── renderOrderDetails ──────────────────────────────────────────────
test('renderOrderDetails: null order → empty string', () => {
  assertEq(renderOrderDetails(null, false, ctx()), '');
});

test('renderOrderDetails: shows order id + escapes client name', () => {
  const html = renderOrderDetails(
    { _id: 'abc123def', orderId: 'ORD-1', clientName: '<x>', products: [] }, false, ctx());
  assert(html.includes('ORD-1'), 'order id shown');
  assert(html.includes('&lt;x&gt;'), 'client name escaped');
  assert(!html.includes('<x>'), 'no raw injection');
});

test('renderOrderDetails: phone masked via ctx.displayPhone (RULE 8)', () => {
  const masked = renderOrderDetails(
    { _id: 'o1', clientPhone: '01000000567', products: [] },
    false, ctx({ displayPhone: () => '010****567' }));
  assert(masked.includes('010****567'), 'masked phone shown');
  assert(!masked.includes('01000000567'), 'raw phone hidden');
});

// ── renderCard (wallet tx) ──────────────────────────────────────────
test('renderCard: pending + execute-only → confirm/reject, no direct approve', () => {
  const html = renderCard(
    { _id: 'tx1', category: 'salary', type: 'out', amount: 500, approvalStatus: 'pending' },
    ctx({ currentRole: 'x', currentPerms: { capabilities: { execute_payments: true, final_approve_payments: false } } }));
  assert(html.includes("confirmTx('tx1')"), 'confirm button present');
  assert(html.includes("rejectTx('tx1')"), 'reject button present');
  assert(!html.includes('approveTx'), 'no approve for execute-only');
});

test('renderCard: own recovery → blocked by four-eyes (no action buttons)', () => {
  const html = renderCard(
    { _id: 'tx2', category: 'refund', type: 'out', amount: 100, approvalStatus: 'pending', isRecovery: true, createdBy: 'me' },
    ctx({ currentPerms: { capabilities: { execute_payments: true, final_approve_payments: true } } }));
  assert(html.includes('الأربع عيون'), 'four-eyes message shown');
  assert(!html.includes("confirmTx('tx2')"), 'no confirm on own recovery');
  assert(html.includes('recovery-card'), 'recovery styling applied');
});

test('renderCard: escapes malicious description', () => {
  const html = renderCard(
    { _id: 't', category: 'expense', type: 'out', amount: 1, approvalStatus: 'approved', description: '<img src=x onerror=alert(1)>' },
    ctx());
  assert(!html.includes('<img src=x'), 'raw img not injected');
  assert(html.includes('&lt;img'), 'description escaped');
});

// ── renderRequestCard ───────────────────────────────────────────────
test('renderRequestCard: requested + execute cap → execute button', () => {
  const html = renderRequestCard(
    { _id: 'r1', type: 'salary', status: 'requested', amount: 300, requestedByName: 'Ali' },
    ctx({ currentRole: 'x', currentPerms: { capabilities: { execute_payments: true } } }));
  assert(html.includes("openExecuteModal('r1')"), 'execute modal button');
  assert(html.includes("rejectRequest('r1')"), 'reject button');
});

test('renderRequestCard: confirmed + strict + self-confirmer → blocked', () => {
  const html = renderRequestCard(
    { _id: 'r2', type: 'salary', status: 'confirmed', amount: 300, confirmedBy: 'me' },
    ctx({ financialPolicy: { approval: { strictSeparation: true } },
          currentPerms: { capabilities: { final_approve_payments: true } } }));
  assert(html.includes('الفصل الصارم'), 'strict-separation block shown');
});

test('renderRequestCard: stale request shows late badge', () => {
  const oldSec = Math.floor(Date.now() / 1000) - 100 * 3600; // 100h ago
  const html = renderRequestCard(
    { _id: 'r3', type: 'salary', status: 'requested', amount: 1, requestedAt: { seconds: oldSec } },
    ctx());
  assert(html.includes('متأخّر'), 'late badge shown for stale request');
});

// ── renderSuppliersDue ──────────────────────────────────────────────
test('renderSuppliersDue: empty rows → friendly empty state', () => {
  assert(renderSuppliersDue([]).includes('لا توجد مديونيات'), 'empty message');
});

test('renderSuppliersDue: renders totals + request button when unpaid items', () => {
  const html = renderSuppliersDue([{
    id: 's1', name: 'مطبعة <A>', type: 'printer', totalUnpaid: 500, totalPending: 0,
    items: [{ orderRefId: 'O1', clientName: 'C', type: 'طباعة', amount: 500, pendingReqId: null }],
  }]);
  assert(html.includes('requestForSupplier'), 'request button present');
  assert(html.includes('&lt;A&gt;'), 'supplier name escaped');
});

// ── bulkBar ─────────────────────────────────────────────────────────
test('bulkBar: hidden when fewer than 2 eligible', () => {
  const one = [{ _id: 'a', approvalStatus: 'pending' }];
  assertEq(bulkBar(one, ctx({ activeTab: 'pending', currentPerms: { capabilities: { execute_payments: true } } })), '');
});

test('bulkBar: shows confirm-all on pending tab with cap + >=2 eligible', () => {
  const two = [{ _id: 'a', approvalStatus: 'pending' }, { _id: 'b', approvalStatus: 'pending' }];
  const html = bulkBar(two, ctx({ activeTab: 'pending', currentPerms: { capabilities: { execute_payments: true } } }));
  assert(html.includes('bulkConfirm()'), 'bulk confirm handler');
  assert(html.includes('(2)'), 'eligible count shown');
});

test('bulkBar: hidden without capability', () => {
  const two = [{ _id: 'a', approvalStatus: 'pending' }, { _id: 'b', approvalStatus: 'pending' }];
  assertEq(bulkBar(two, ctx({ activeTab: 'pending', currentPerms: { capabilities: { execute_payments: false } } })), '');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
