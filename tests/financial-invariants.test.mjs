/**
 * Node-runnable tests for core/financial-invariants.js (Phase 2 / B3).
 * Run: node tests/financial-invariants.test.mjs
 *
 * Pure tests — no Firestore, no DOM. Validates I15/I16/I17.
 */
import { detectFinancialDrift } from '../core/financial-invariants.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`✗ ${name}\n    ${e.message}`);
    failed++;
  }
}
function has(violations, code) {
  return violations.some(v => v.code === code);
}
function assertHas(violations, code) {
  if (!has(violations, code)) {
    throw new Error(`expected violation '${code}' in [${violations.map(v=>v.code).join(',')}]`);
  }
}
function assertNotHas(violations, code) {
  if (has(violations, code)) {
    throw new Error(`unexpected violation '${code}' present`);
  }
}

// ── I15: SETTLED_WITHOUT_COLLECTION ──
test('I15 fires when shipSettled=true + company method + shipCollected=0', () => {
  const order = {
    stage: 'shipping', shipMethod: 'company',
    shipSettled: true, shipCollected: 0, shipSettledAmount: 100,
    salePrice: 100, totalPaid: 100, remaining: 0,
  };
  assertHas(detectFinancialDrift(order), 'SETTLED_WITHOUT_COLLECTION');
});

test('I15 silent when shipSettledManual=true (manual override allowed)', () => {
  const order = {
    stage: 'shipping', shipMethod: 'company',
    shipSettled: true, shipSettledManual: true,
    shipCollected: 0, shipSettledAmount: 100,
    salePrice: 100, totalPaid: 100, remaining: 0,
  };
  assertNotHas(detectFinancialDrift(order), 'SETTLED_WITHOUT_COLLECTION');
});

test('I15 silent when shipMethod=pickup (no collection model)', () => {
  const order = {
    stage: 'shipping', shipMethod: 'pickup',
    shipSettled: true, shipCollected: 0,
    salePrice: 100, totalPaid: 100, remaining: 0,
  };
  assertNotHas(detectFinancialDrift(order), 'SETTLED_WITHOUT_COLLECTION');
});

test('I15 silent when shipCollected > 0 (proper flow)', () => {
  const order = {
    stage: 'shipping', shipMethod: 'company',
    shipSettled: true, shipCollected: 100, shipSettledAmount: 90,
    salePrice: 100, totalPaid: 100, remaining: 0,
  };
  assertNotHas(detectFinancialDrift(order), 'SETTLED_WITHOUT_COLLECTION');
});

// ── I16: ARCHIVED_WITHOUT_TERMINAL_FINANCIAL ──
test('I16 fires when archived with paymentStatus=partial', () => {
  const order = {
    stage: 'archived', paymentStatus: 'partial',
    salePrice: 100, totalPaid: 50, remaining: 50,
  };
  assertHas(detectFinancialDrift(order), 'ARCHIVED_WITHOUT_TERMINAL_FINANCIAL');
});

test('I16 silent when archived with paymentStatus=paid', () => {
  const order = {
    stage: 'archived', paymentStatus: 'paid',
    salePrice: 100, totalPaid: 100, remaining: 0,
  };
  assertNotHas(detectFinancialDrift(order), 'ARCHIVED_WITHOUT_TERMINAL_FINANCIAL');
});

test('I16 silent when archived with shipStage=returned_full', () => {
  const order = {
    stage: 'archived', paymentStatus: 'pending', shipStage: 'returned_full',
    salePrice: 100, totalPaid: 0, remaining: 0,
  };
  assertNotHas(detectFinancialDrift(order), 'ARCHIVED_WITHOUT_TERMINAL_FINANCIAL');
});

test('I16 silent when stage=shipping (not yet archived)', () => {
  const order = {
    stage: 'shipping', paymentStatus: 'partial',
    salePrice: 100, totalPaid: 50, remaining: 50,
  };
  assertNotHas(detectFinancialDrift(order), 'ARCHIVED_WITHOUT_TERMINAL_FINANCIAL');
});

// ── I17: ARCHIVED_COMPANY_NOT_SETTLED ──
test('I17 fires when archived + company + shipSettled=false', () => {
  const order = {
    stage: 'archived', shipMethod: 'company', shipSettled: false,
    paymentStatus: 'paid', salePrice: 100, totalPaid: 100, remaining: 0,
  };
  assertHas(detectFinancialDrift(order), 'ARCHIVED_COMPANY_NOT_SETTLED');
});

test('I17 fires when archived + company + shipSettled missing', () => {
  const order = {
    stage: 'archived', shipMethod: 'company',
    paymentStatus: 'paid', salePrice: 100, totalPaid: 100, remaining: 0,
  };
  assertHas(detectFinancialDrift(order), 'ARCHIVED_COMPANY_NOT_SETTLED');
});

test('I17 silent when archived + company + shipSettled=true', () => {
  const order = {
    stage: 'archived', shipMethod: 'company', shipSettled: true,
    paymentStatus: 'paid', salePrice: 100, totalPaid: 100, remaining: 0,
  };
  assertNotHas(detectFinancialDrift(order), 'ARCHIVED_COMPANY_NOT_SETTLED');
});

test('I17 silent when archived + shipMethod=pickup (no settlement needed)', () => {
  const order = {
    stage: 'archived', shipMethod: 'pickup', shipSettled: false,
    paymentStatus: 'paid', salePrice: 100, totalPaid: 100, remaining: 0,
  };
  assertNotHas(detectFinancialDrift(order), 'ARCHIVED_COMPANY_NOT_SETTLED');
});

// ── Existing invariants regression check ──
test('Healthy order produces no violations', () => {
  const order = {
    stage: 'shipping', shipMethod: 'company',
    shipSettled: true, shipCollected: 100, shipSettledAmount: 90,
    shipSettledWalletId: 'w1',
    paymentStatus: 'paid', salePrice: 100, totalPaid: 100, remaining: 0,
  };
  const violations = detectFinancialDrift(order);
  if (violations.length !== 0) {
    throw new Error(`expected 0 violations, got: ${violations.map(v=>v.code).join(',')}`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
