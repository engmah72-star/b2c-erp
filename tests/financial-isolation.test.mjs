/**
 * tests · financial-isolation — حارس عزل الطبقة العامة عن المالية (#2 مركزية).
 * يؤكّد أن بوابة العميل + الصفحات العامة لا تصل لأي مجموعة مالية (قراءة أو كتابة)
 * ولا تستدعي محرّك FSE — كل المال يمرّ حصراً عبر طبقة الأكشن/order-math.
 * يفشل لو سرّبت طبقة العميل أي وصول مالي مستقبلاً.
 * تشغيل: node tests/financial-isolation.test.mjs
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const FIN_COLLECTIONS = ['wallets', 'transactions_v2', 'financial_ledger', 'employee_payments', 'supplier_payments', 'shipping_settlements'];
// نمط وصول فعلي: collection()/doc() باسم مجموعة مالية، أو استدعاء محرّك FSE.
const ACCESS_RE = new RegExp(
  `(collection|doc)\\([^)]*['"\`](${FIN_COLLECTIONS.join('|')})['"\`]|\\b(dispatchFinancialEvent|addLedgerToBatch)\\s*\\(`,
);

const SCAN_DIRS = [join(root, 'features/customer-portal')];
const SCAN_FILES = [join(root, 'u.html'), join(root, 'directory.html')];

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(js|html)$/.test(name)) acc.push(p);
  }
  return acc;
}

const files = [...SCAN_DIRS.flatMap((d) => walk(d)), ...SCAN_FILES];
let pass = 0, fail = 0;
const offenders = [];
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((ln, i) => {
    const code = ln.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, ''); // تجاهل التعليقات السطرية
    if (ACCESS_RE.test(code)) offenders.push(`${f.replace(root + '/', '')}:${i + 1}`);
  });
}

if (offenders.length === 0) { pass++; }
else { fail++; console.error('✗ طبقة العميل تصل لمجموعة مالية مباشرة:', offenders); }

console.log(`ℹ️ فُحص ${files.length} ملف في الطبقة العامة — صفر وصول مالي مباشر = العزل سليم.`);
console.log('ℹ️ الكتّاب الماليون المعتمدون (للعلم): financial-sync-engine.js + طبقة الأكشن (order/wallet/shipping/approval/...) فقط.');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
