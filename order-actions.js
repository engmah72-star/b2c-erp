/**
 * Business2Card ERP — order-actions.js
 *
 * ━━━ CENTRAL ACTIONS LAYER (RULE A1) ━━━
 *
 * طبقة الأفعال المركزية للأوردر. كل workflow action تمر من هنا.
 *
 * الصفحات لا تكتب على Firestore مباشرة — تنادي action واحد:
 *   await orderActions.submitToPrinting({ db, orderId, role, userId, userName });
 *   if (!result.ok) toast(result.errors[0], 'err');
 *
 * كل action:
 *   1. يحمّل الأوردر من Firestore
 *   2. يستدعي validator + buildSpec من orders.js
 *   3. يكتب ذرّياً (transaction أو writeBatch)
 *   4. يمر عبر financial-sync-engine للأحداث المالية
 *   5. يُرجع { ok, errors, warnings, orderId, ... }
 *
 * هذا الملف بديل آمن لـ inline writes في الصفحات.
 */

import { runTransaction, doc, getDoc, writeBatch, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  buildArchiveSpec,
  validatePayment,
  validateRefund,
  advanceOrderStageWithLock,
} from './orders.js';
import { dispatchFinancialEvent, FE } from './financial-sync-engine.js';

// ══════════════════════════════════════════
// INTERNAL HELPERS
// ══════════════════════════════════════════

/** يحمّل أوردر من Firestore مع reference جاهز. يُرجع null لو غير موجود. */
async function _loadOrder(db, orderId) {
  if (!db || !orderId) return null;
  const ref = doc(db, 'orders', orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { ...snap.data(), _id: orderId, _ref: ref };
}

/** wrapper موحَّد للـ stage transitions — يستدعي advanceOrderStageWithLock */
async function _advanceFromStage({
  db, orderId, expectedCurrentStage,
  role, userId, userName,
  nextAssigneeId = '', nextAssigneeName = '',
  bypassWarnings = false, extraFields = {},
}) {
  try {
    const result = await advanceOrderStageWithLock({
      db, runTransaction, doc,
      orderId, expectedCurrentStage,
      role, userId, userName,
      nextAssigneeId, nextAssigneeName,
      bypassWarnings, extraFields,
    });
    return {
      ok: true,
      errors: [],
      warnings: [],
      orderId,
      newStage: result?.newStage || null,
      action: `advance_${expectedCurrentStage}_to_${result?.newStage || 'next'}`,
    };
  } catch (e) {
    return {
      ok: false,
      errors: [e.message || 'فشل تقديم المرحلة'],
      warnings: [],
      orderId,
    };
  }
}

// ══════════════════════════════════════════
// ACTIONS — Central Workflow Operations
// ══════════════════════════════════════════

export const orderActions = {

  // ─── Stage Transitions ───────────────────

  /**
   * design → printing
   * يتطلب موافقة التصميم (validateStageRequirements في buildStageAdvance).
   */
  async submitToPrinting(args) {
    return _advanceFromStage({ ...args, expectedCurrentStage: 'design' });
  },

  /**
   * printing → production
   * يتطلب تجهيز الطباعة (validate في buildStageAdvance).
   */
  async submitToProduction(args) {
    return _advanceFromStage({ ...args, expectedCurrentStage: 'printing' });
  },

  /**
   * production → shipping
   * يتطلب إنهاء التنفيذ (costItems معلَّمة، products done).
   */
  async submitToShipping(args) {
    return _advanceFromStage({ ...args, expectedCurrentStage: 'production' });
  },

  // ─── Archive ─────────────────────────────

  /**
   * any active stage → archived
   * يستخدم buildArchiveSpec (نفس الفحوصات المركزية).
   *
   * @param {string} args.source — 'shipping'|'production'|'bulk_admin'|'status_change'|'manual'
   */
  async archiveOrder({
    db, orderId, role, userId, userName,
    source = 'manual', reason = '',
    bypassWarnings = false, extraFields = {},
  }) {
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };

    const spec = buildArchiveSpec({
      order, role, userId, userName,
      source, reason, bypassWarnings, extraFields,
    });

    if (!spec.ok) {
      return {
        ok: false,
        errors: spec.errors,
        warnings: spec.warnings,
        needsConfirmation: spec.needsConfirmation || false,
        orderId,
      };
    }

    try {
      const batch = writeBatch(db);
      batch.update(order._ref, {
        ...spec.fields,
        timeline: [...(order.timeline || []), spec.timelineEntry],
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return {
        ok: true,
        errors: [],
        warnings: spec.warnings,
        orderId,
        action: 'archive',
        source,
      };
    } catch (e) {
      return {
        ok: false,
        errors: [e.message || 'فشل تنفيذ الأرشفة'],
        warnings: [],
        orderId,
      };
    }
  },

  // ─── Financial Actions ────────────────────

  /**
   * تسجيل دفعة عميل (CUSTOMER_PAYMENT).
   * يمر عبر validatePayment + financial-sync-engine (atomic, audit-tracked).
   *
   * @param {string} args.walletId       — المحفظة المستلِمة
   * @param {string} [args.walletName]
   * @param {number} args.amount
   * @param {string} [args.source='customer']  — 'customer' | 'refund'
   * @param {string} [args.note]
   */
  async recordPayment({
    db, orderId, amount, walletId, walletName = '',
    role, userId, userName,
    note = '', source = 'customer',
  }) {
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };

    const v = validatePayment({ order, amount, source, role });
    if (!v.ok) return { ...v, orderId };

    const eventType = source === 'refund' ? FE.CUSTOMER_REFUND : FE.CUSTOMER_PAYMENT;

    try {
      const eventResult = await dispatchFinancialEvent(db, eventType, {
        orderId,
        clientId:   order.clientId   || '',
        clientName: order.clientName || '',
        walletId,
        walletName,
        amount:     parseFloat(amount) || 0,
        note,
        createdBy:     userId   || '',
        createdByName: userName || '',
      });
      return {
        ok: true,
        errors: [],
        warnings: v.warnings,
        orderId,
        eventType,
        action: 'payment',
        eventResult,
      };
    } catch (e) {
      return {
        ok: false,
        errors: [e.message || 'فشل تسجيل الدفعة'],
        warnings: [],
        orderId,
      };
    }
  },

  /**
   * استرداد مبلغ للعميل (CUSTOMER_REFUND).
   * يمر عبر validateRefund + financial-sync-engine.
   *
   * @param {string} args.walletId  — المحفظة المسحوب منها
   * @param {number} args.amount
   * @param {string} [args.reason]  — سبب الاسترداد (للـ audit)
   */
  async refundOrder({
    db, orderId, amount, walletId, walletName = '',
    role, userId, userName,
    note = '', reason = '',
  }) {
    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };

    const v = validateRefund({ order, amount, role });
    if (!v.ok) return { ...v, orderId };

    try {
      const eventResult = await dispatchFinancialEvent(db, FE.CUSTOMER_REFUND, {
        orderId,
        clientId:   order.clientId   || '',
        clientName: order.clientName || '',
        walletId,
        walletName,
        amount:     parseFloat(amount) || 0,
        note:       note || reason || '',
        createdBy:     userId   || '',
        createdByName: userName || '',
      });
      return {
        ok: true,
        errors: [],
        warnings: v.warnings,
        orderId,
        eventType: FE.CUSTOMER_REFUND,
        action: 'refund',
        eventResult,
      };
    } catch (e) {
      return {
        ok: false,
        errors: [e.message || 'فشل تنفيذ الاسترداد'],
        warnings: [],
        orderId,
      };
    }
  },
};

// ══════════════════════════════════════════
// DEFAULT EXPORT (للتوافق مع import default)
// ══════════════════════════════════════════
export default orderActions;
