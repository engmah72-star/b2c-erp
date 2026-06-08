/**
 * Node-runnable tests for core/employee-orders.js (god-page decomp — getEmpOrders).
 * Run: node tests/core-employee-orders.test.mjs
 *
 * Pure tests — locks the role-based ownership filter so employee-profile and the
 * employees board stay in agreement (single source — RULE 1).
 */
import { filterEmployeeOrders } from '../core/employee-orders.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, h = '') { if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${h}`); }
const ids = arr => arr.map(o => o._id).sort().join(',');

// ── guards ─────────────────────────────────────────────────────────
test('no employee → empty', () => {
  assertEq(filterEmployeeOrders({ orders: [{ _id: 'a' }] }).length, 0);
});
test('unknown role → empty', () => {
  assertEq(filterEmployeeOrders({ orders: [{ _id: 'a', createdBy: 'u' }], employee: { role: 'wallet_manager' }, employeeId: 'e' }).length, 0);
});

// ── CS / ops / admin → createdBy ───────────────────────────────────
test('customer_service matches by createdBy (uid, empId, name)', () => {
  const orders = [
    { _id: '1', createdBy: 'U1' },
    { _id: '2', createdBy: 'E1' },
    { _id: '3', createdByName: 'سارة' },
    { _id: '4', createdBy: 'other' },
    { _id: '5', designerId: 'U1' }, // wrong field for this role
  ];
  const r = filterEmployeeOrders({ orders, employee: { role: 'customer_service', name: 'سارة', authUid: 'U1' }, employeeId: 'E1' });
  assertEq(ids(r), '1,2,3');
});

// ── designer → designerId ──────────────────────────────────────────
test('graphic_designer matches by designerId only', () => {
  const orders = [
    { _id: '1', designerId: 'U1' },
    { _id: '2', designerName: 'مازن' },
    { _id: '3', createdBy: 'U1' }, // not a designer signal
  ];
  const r = filterEmployeeOrders({ orders, employee: { role: 'graphic_designer', name: 'مازن', authUid: 'U1' }, employeeId: 'E1' });
  assertEq(ids(r), '1,2');
});

// ── production_agent → id OR (name + stage + timeline/cost) ─────────
test('production_agent matches by id, and by name only at right stage/timeline', () => {
  const orders = [
    { _id: '1', productionAgent: 'U1' },
    { _id: '2', productionAgentName: 'ع', stage: 'production' },     // name + stage ok
    { _id: '3', productionAgentName: 'ع', stage: 'design' },          // name but wrong stage → excluded
    { _id: '4', stage: 'archived', timeline: [{ by: 'ع', action: 'تم التنفيذ' }] }, // timeline match
    { _id: '5', stage: 'shipping', costItems: [{ addedBy: 'ع' }] },   // cost match
  ];
  const r = filterEmployeeOrders({ orders, employee: { role: 'production_agent', name: 'ع', authUid: 'U1' }, employeeId: 'E1' });
  assertEq(ids(r), '1,2,4,5');
});

// ── shipping_officer → multiple id fields + names ──────────────────
test('shipping_officer matches officer id/legacy field + names', () => {
  const orders = [
    { _id: '1', shippingOfficerId: 'U1' },
    { _id: '2', shippingOfficer: 'E1' },
    { _id: '3', shippingOfficerName: 'ر' },
    { _id: '4', collectedByName: 'ر' },
    { _id: '5', createdBy: 'U1' },
  ];
  const r = filterEmployeeOrders({ orders, employee: { role: 'shipping_officer', name: 'ر', authUid: 'U1' }, employeeId: 'E1' });
  assertEq(ids(r), '1,2,3,4');
});

// ── uid override + name-empty safety ───────────────────────────────
test('explicit uid overrides employee.authUid; empty name does not over-match', () => {
  const orders = [{ _id: '1', createdBy: 'OVERRIDE' }, { _id: '2', createdByName: '' }];
  const r = filterEmployeeOrders({ orders, employee: { role: 'admin', name: '' }, employeeId: 'E1', uid: 'OVERRIDE' });
  assertEq(ids(r), '1'); // _id:2 must NOT match on empty name
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
