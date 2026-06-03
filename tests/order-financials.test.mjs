/**
 * tests · order-financials — الواجهة المركزية + كاشف الانحراف (#1). نقي.
 * تشغيل: node tests/order-financials.test.mjs
 */
import { invoiceOf, totalsOf, payStatusOf, detectDrift } from '../core/order-financials.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.error('✗', n); } };

// salePrice 1000 + ship 100 − disc 100 − paid 700 = gross 1000, rem 300
const o = { salePrice: 1000, customerShipFee: 100, discount: 100, totalPaid: 700 };
const inv = invoiceOf(o);
ok('gross', inv.gross === 1000);
ok('rem', inv.rem === 300);
ok('paid', inv.paid === 700);
ok('status partial', inv.status === 'partial');

ok('fully paid', payStatusOf({ salePrice: 500, totalPaid: 500 }) === 'paid');
ok('pending', payStatusOf({ salePrice: 500, totalPaid: 0 }) === 'pending');
ok('none', payStatusOf({}) === 'none');

const t = totalsOf([o, { salePrice: 200, totalPaid: 200 }]);
ok('totals gross', t.gross === 1200);
ok('totals rem', t.rem === 300);
ok('totals paid', t.paid === 900);

// كاشف الانحراف
const clean = detectDrift({ salePrice: 1000, totalPaid: 700, remaining: 300, paymentStatus: 'partial' });
ok('no drift when consistent', clean.hasDrift === false);
const drift = detectDrift({ salePrice: 1000, totalPaid: 700, remaining: 999, paymentStatus: 'paid' });
ok('drift on stale remaining', drift.hasDrift === true && drift.remComputed === 300 && drift.remStored === 999);
ok('status drift detected', drift.statusDrift === true && drift.statusComputed === 'partial');
const noStored = detectDrift({ salePrice: 1000, totalPaid: 700 });
ok('no stored → no false drift', noStored.hasDrift === false && noStored.remStored === null);
ok('returned status ignored', detectDrift({ salePrice: 1000, totalPaid: 0, paymentStatus: 'returned' }).hasDrift === false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
