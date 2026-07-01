/**
 * scripts/reconcile-supplier-orders.mjs
 *
 * تسوية (reconciliation) — supplier_orders.paidAmount لا يعكس الدفعات الحقيقية.
 *
 * المشكلة: صفحة مدفوعات الموردين (supplier-payments.html) تسجّل الدفعات عبر
 * supplierActions.createPayment بدون تمرير supplierOrderIds (متعمّد — الدالة
 * تعمل increment(amount) على *كل* أوردر مُمرَّر، وهو غلط في حالة دفعة واحدة
 * على عدة أوردرات). النتيجة: paidAmount على supplier_orders فضل صفر/غير
 * محدَّث لكل الدفعات القديمة، فكل الأوردرات بتظهر "معلق" بكامل قيمتها حتى لو
 * المورد فعلياً مسدِّد جزء كبير منها. الرصيد الإجمالي (orders.costItems مقابل
 * supplier_payments) هو مصدر الحقيقة ودايماً صحيح — المشكلة بصرية فقط في
 * تفصيل الأوردرات.
 *
 * الحل: لكل مورد، احسب المستحق الحقيقي (purchases − paid)، ثم وزّع "المدفوع"
 * على أوردراته من الأقدم للأحدث (FIFO — نفس منطق التطبيق) لحد ما يفضل بس
 * المتبقي يساوي المستحق الحقيقي. الأوردر اللي بيقع على الحد بيتقسم جزئياً.
 *
 * ⚠️ ملاحظة مهمة: السكريبت *يعيد حساب* paidAmount من الصفر لكل أوردر (مش
 * increment) لأنه مفيش طريقة نعرف بيها فعلياً أنهي أوردر اتدفع من أنهي دفعة
 * تاريخياً (الدفعات كانت مسجَّلة كمبلغ إجمالي على المورد، مش على أوردر بعينه).
 * ده تقريب/تسوية معقولة يطابق الرصيد الإجمالي، مش إعادة بناء تاريخي دقيق 100%.
 *
 * **أداة سيرفر-سايد فقط** (Firebase Admin SDK يتجاوز firestore.rules).
 * ─────────────────────────────────────────────────────────────────────
 * التشغيل:
 *   export GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
 *   node scripts/reconcile-supplier-orders.mjs --dry-run                    # كل الموردين — عرض فقط
 *   node scripts/reconcile-supplier-orders.mjs --supplier=SUP_ID --dry-run  # مورد واحد — عرض فقط
 *   node scripts/reconcile-supplier-orders.mjs --supplier=SUP_ID            # مورد واحد — تنفيذ فعلي
 *   node scripts/reconcile-supplier-orders.mjs                              # كل الموردين — تنفيذ فعلي
 *
 * المعاملات:
 *   --supplier=ID   اقتصر على مورد واحد فقط (موصى به للاختبار أولاً)
 *   --dry-run       لا تكتب — اعرض التعديلات المقترحة فقط
 *
 * موصى به: شغّل --dry-run على مورد واحد الأول، راجع المخرجات، بعدين نفّذ
 * فعلياً على نفس المورد، بعدين وسّع لكل الموردين.
 */

import admin from 'firebase-admin';

function parseArgs(argv) {
  const out = { supplierId: '', dryRun: false };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a.startsWith('--supplier=')) out.supplierId = a.slice(11).trim();
  }
  return out;
}

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function tsMillis(v) {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v._seconds === 'number') return v._seconds * 1000;
  return 0;
}

/** يبني خرائط supplierId → إجمالي المشتريات / إجمالي المدفوع (مطابق getSupBalance في supplier-payments.html) */
async function computeBalances(db) {
  const purchases = new Map();
  const ordersSnap = await db.collection('orders').get();
  ordersSnap.forEach(doc => {
    const o = doc.data();
    for (const ci of (o.costItems || [])) {
      if (!ci.supplierId) continue;
      const t = parseFloat(ci.total) || 0;
      purchases.set(ci.supplierId, (purchases.get(ci.supplierId) || 0) + t);
    }
  });

  const paid = new Map();
  const paySnap = await db.collection('supplier_payments').get();
  paySnap.forEach(doc => {
    const p = doc.data();
    if (!p.supplierId) return;
    const a = parseFloat(p.amount) || 0;
    paid.set(p.supplierId, (paid.get(p.supplierId) || 0) + a);
  });

  return { purchases, paid };
}

/** يحسب التعديلات المطلوبة على supplier_orders لمورد واحد بدون كتابة */
async function planSupplier(db, supplierId, purchases, paid) {
  const due = Math.max(0, (purchases.get(supplierId) || 0) - (paid.get(supplierId) || 0));

  const snap = await db.collection('supplier_orders')
    .where('supplierId', '==', supplierId)
    .where('isDeleted', '==', false)
    .get();

  const orders = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => tsMillis(a.createdAt) - tsMillis(b.createdAt)); // الأقدم أولاً (FIFO)

  const totalOfOrders = orders.reduce((s, o) => s + (parseFloat(o.total) || 0), 0);
  let budget = Math.max(0, totalOfOrders - due); // اللي المفروض يتعلّم "مدفوع" عبر الأوردرات، من الأقدم

  const changes = [];
  for (const o of orders) {
    const total = parseFloat(o.total) || 0;
    const existingPaid = parseFloat(o.paidAmount) || 0;
    let target;
    if (budget <= 0) target = 0;
    else if (budget >= total) { target = total; budget = round2(budget - total); }
    else { target = round2(budget); budget = 0; }

    if (Math.abs(target - existingPaid) > 0.009) {
      changes.push({
        id: o.id, orderRef: o.orderRef || o.orderId?.slice(-6) || '—',
        type: o.type || 'خدمة', total, from: existingPaid, to: target,
      });
    }
  }

  return { supplierId, due, totalOfOrders, orderCount: orders.length, changes };
}

export async function reconcile(db, opts) {
  const log = (...m) => console.log('[reconcile-supplier-orders]', ...m);

  const { purchases, paid } = await computeBalances(db);
  const supplierIds = opts.supplierId
    ? [opts.supplierId]
    : [...new Set([...purchases.keys(), ...paid.keys()])];

  log(`${supplierIds.length} مورد سيُفحص${opts.dryRun ? ' — DRY-RUN' : ''}`);

  let suppliersTouched = 0, totalChanges = 0;

  for (const supplierId of supplierIds) {
    const plan = await planSupplier(db, supplierId, purchases, paid);
    if (!plan.changes.length) continue;

    suppliersTouched++;
    totalChanges += plan.changes.length;
    log(`— مورد ${supplierId}: مستحق حقيقي=${plan.due}ج · إجمالي أوردرات=${plan.totalOfOrders}ج (${plan.orderCount} أوردر) · تعديلات=${plan.changes.length}`);
    for (const c of plan.changes) {
      log(`    ${c.id} [${c.type} #${c.orderRef}] total=${c.total}ج: paidAmount ${c.from}ج → ${c.to}ج`);
    }

    if (!opts.dryRun) {
      for (let i = 0; i < plan.changes.length; i += 400) {
        const batch = db.batch();
        for (const c of plan.changes.slice(i, i + 400)) {
          batch.update(db.collection('supplier_orders').doc(c.id), {
            paidAmount: c.to,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            reconciledAt: admin.firestore.FieldValue.serverTimestamp(),
            reconciledBy: 'reconcile-supplier-orders-script',
          });
        }
        await batch.commit();
      }
    }
  }

  log(`✓ موردين متأثرين=${suppliersTouched} · إجمالي تعديلات=${totalChanges}${opts.dryRun ? ' (لم يُكتب شيء — DRY-RUN)' : ''}`);

  if (!opts.dryRun && totalChanges > 0) {
    await db.collection('audit_logs').add({
      date: new Date().toLocaleString('ar-EG'),
      action: `🔧 تسوية أوردرات الموردين: ${suppliersTouched} مورد، ${totalChanges} أوردر`,
      by: 'Reconcile Script', byId: 'system:reconcile-supplier-orders', kind: 'self-heal',
      meta: { suppliersTouched, totalChanges, supplierFilter: opts.supplierId || null },
    }).catch(e => log('⚠️ تعذّرت كتابة audit_logs (غير حرِج):', e.message));
  }

  return { suppliersTouched, totalChanges, dryRun: !!opts.dryRun };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const opts = parseArgs(process.argv.slice(2));
  if (!admin.apps.length) admin.initializeApp(); // GOOGLE_APPLICATION_CREDENTIALS
  const db = admin.firestore();
  console.log('[reconcile-supplier-orders] بدء', opts.dryRun ? '· DRY-RUN' : '· تنفيذ فعلي', opts.supplierId ? `· مورد=${opts.supplierId}` : '· كل الموردين');
  reconcile(db, opts)
    .then(r => { console.log('[reconcile-supplier-orders] ✅ تم:', r); process.exit(0); })
    .catch(e => { console.error('[reconcile-supplier-orders] ❌', e.message); process.exit(1); });
}
