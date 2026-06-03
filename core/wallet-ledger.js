/**
 * Business2Card ERP — core/wallet-ledger.js
 *
 * ━━━ WALLET BALANCE — SINGLE WRITER + INTEGRITY (safety layer · slice 1) ━━━
 *
 * المشكلة (من تدقيق الرقابة المالية):
 *   رصيد المحفظة (wallets.balance) يُكتَب من ~30 موضعاً عبر 5 ملفات
 *   (financial-sync-engine · approval-actions · wallet-actions · order-actions ·
 *   shipping-actions). لا نقطة اختناق واحدة → يصعب فرض الثبات أو التتبّع أو
 *   كشف الانحراف (drift).
 *
 * الحل (طبقة السلامة، تدريجي E1):
 *   1) كاتب مركزي واحد لكل تغييرات الرصيد:
 *        addWalletDeltaToBatch  — تغيير نسبي (increment) — للحركات
 *        setWalletBalanceInBatch — ضبط مطلق — للتسوية/الرصيد الافتتاحي
 *      كلاهما يضيف حقول تتبّع (_balUpdatedAt/_balLastEvent) — إضافية وآمنة،
 *      لا تغيّر السلوك المالي. الهدف: نقطة اختناق واحدة لأي فرض مستقبلي.
 *   2) فاحص توازن نقي: الرصيد ≈ الافتتاحي + Σ(داخل) − Σ(خارج).
 *
 * pure حيثما أمكن → قابل للاختبار وإعادة الاستخدام في UI والـ actions.
 *
 * ملاحظة الهجرة (slice 1): يُستخدَم الآن في approval-actions.js فقط. باقي
 * المواضع (FSE/wallet-actions/order-actions/shipping-actions) تُهاجَر في
 * شرائح لاحقة مع smoke tests — alongside-not-instead.
 */

import { doc, increment, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ══════════════════════════════════════════════════════════
// WRITERS (batch-augmenting — تُستدعى داخل writeBatch قائم)
// ══════════════════════════════════════════════════════════

/**
 * تغيير رصيد محفظة تغييراً نسبياً (atomic increment) داخل batch قائم.
 * يكافئ تماماً `batch.update(walletRef, { balance: increment(delta) })`
 * مع حقول تتبّع إضافية آمنة.
 *
 * @param {Object} batch  — writeBatch قائم
 * @param {Object} db     — Firestore instance
 * @param {Object} args
 * @param {string} args.walletId
 * @param {number} args.delta   — موجب = إيداع، سالب = سحب
 * @param {string} [args.event] — نوع الحدث (تتبّع: VENDOR_PAYMENT/...)
 * @param {string} [args.refId] — مرجع العملية (txId/requestId)
 * @returns {{ok:boolean, errors:string[]}}  (لا يرمي — يبلّغ)
 */
export function addWalletDeltaToBatch(batch, db, { walletId, delta, event = '', refId = '' } = {}) {
  if (!batch || !db) return { ok: false, errors: ['[wallet-ledger] batch/db مطلوب'] };
  if (!walletId) return { ok: false, errors: ['[wallet-ledger] walletId مطلوب'] };
  const d = Number(delta);
  if (!Number.isFinite(d)) return { ok: false, errors: ['[wallet-ledger] delta غير صالح'] };
  if (d === 0) return { ok: true, errors: [] }; // no-op — لا تكتب شيئاً
  batch.update(doc(db, 'wallets', walletId), {
    balance: increment(d),
    _balUpdatedAt: serverTimestamp(),
    ...(event ? { _balLastEvent: event } : {}),
    ...(refId ? { _balLastRef: refId } : {}),
  });
  return { ok: true, errors: [] };
}

/**
 * ضبط رصيد محفظة ضبطاً مطلقاً (تسوية/رصيد افتتاحي) داخل batch قائم.
 * يكافئ `batch.update(walletRef, { balance: target })` مع تتبّع.
 *
 * @param {Object} batch, db
 * @param {Object} args  — { walletId, target, event?, refId? }
 * @returns {{ok, errors}}
 */
export function setWalletBalanceInBatch(batch, db, { walletId, target, event = '', refId = '' } = {}) {
  if (!batch || !db) return { ok: false, errors: ['[wallet-ledger] batch/db مطلوب'] };
  if (!walletId) return { ok: false, errors: ['[wallet-ledger] walletId مطلوب'] };
  const t = Number(target);
  if (!Number.isFinite(t)) return { ok: false, errors: ['[wallet-ledger] target غير صالح'] };
  batch.update(doc(db, 'wallets', walletId), {
    balance: t,
    _balUpdatedAt: serverTimestamp(),
    ...(event ? { _balLastEvent: event } : {}),
    ...(refId ? { _balLastRef: refId } : {}),
  });
  return { ok: true, errors: [] };
}

// ══════════════════════════════════════════════════════════
// INTEGRITY (pure — diagnostic)
// ══════════════════════════════════════════════════════════

/**
 * يحسب الرصيد المتوقَّع لمحفظة من سجل الحركات:
 *   expected = openingBalance + Σ(amount حيث type='in') − Σ(amount حيث type='out')
 *
 * يُضمِّن العكوس (reversal + الأصل المعكوس كلاهما حركة حقيقية تتعادل) فلا
 * يُستثنى شيء. الحركات بلا walletId مطابق تُتجاهَل.
 *
 * @param {string} walletId
 * @param {Array}  transactions  — transactions_v2 (كل/أي مجموعة)
 * @param {Object} [opts] — { openingBalance=0 }
 * @returns {number}
 */
export function computeWalletBalanceFromTxns(walletId, transactions = [], { openingBalance = 0 } = {}) {
  let bal = parseFloat(openingBalance) || 0;
  for (const t of (transactions || [])) {
    if (!t || t.walletId !== walletId) continue;
    const amt = parseFloat(t.amount) || 0;
    if (t.type === 'in') bal += amt;
    else if (t.type === 'out') bal -= amt;
  }
  return bal;
}

/**
 * يقارن رصيد المحفظة المخزَّن بالمتوقَّع من الحركات. تشخيصي (قراءة فقط).
 *
 * @param {Object} wallet — { _id, balance, openingBalance? }
 * @param {Array}  transactions
 * @param {Object} [opts] — { tolerance=0.01 }
 * @returns {{ok:boolean, walletId, expected:number, actual:number, drift:number}}
 */
export function checkWalletBalanceIntegrity(wallet, transactions = [], { tolerance = 0.01 } = {}) {
  const walletId = wallet?._id || wallet?.id || '';
  const actual = parseFloat(wallet?.balance) || 0;
  const opening = parseFloat(wallet?.openingBalance) || 0;
  const expected = computeWalletBalanceFromTxns(walletId, transactions, { openingBalance: opening });
  const drift = +(actual - expected).toFixed(2);
  return { ok: Math.abs(drift) <= tolerance, walletId, expected: +expected.toFixed(2), actual: +actual.toFixed(2), drift };
}

export default {
  addWalletDeltaToBatch,
  setWalletBalanceInBatch,
  computeWalletBalanceFromTxns,
  checkWalletBalanceIntegrity,
};
