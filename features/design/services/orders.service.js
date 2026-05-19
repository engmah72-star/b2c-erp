/**
 * features/design/services/orders.service.js
 *
 * طبقة الـ write على entity الـ orders في design context.
 * كل الكتابات تمر هنا — لا direct writes في views أو modals (RULE G6 friendly).
 *
 * Status: STUB — التنفيذ الفعلي في PR-3 (modals) و PR-4 (views).
 * في PR-1 الهدف هو signature contract فقط حتى تستطيع PRs اللاحقة الـ import.
 *
 * المعتمد على:
 *   - orders.js (buildStageAdvance, buildStageRevert, buildOrderSplit)
 *   - financial-sync-engine.js (للـ payments + delete)
 */

// import { db } from '../../../core/firebase-init.js';
// import { buildStageAdvance, buildStageRevert, buildOrderSplit } from '../../../orders.js';
// import { dispatchFinancialEvent, FE } from '../../../financial-sync-engine.js';

/**
 * إنشاء أوردر جديد (CS).
 * payload: { clientId, products[], deposit, paymentMethod, walletId, ... }
 * يتعامل ذرّياً مع: orders + wallet (لو deposit) + tx + ledger + audit.
 *
 * @returns {Promise<{ orderId: string }>}
 */
export async function createOrder(/* payload, ctx */) {
  throw new Error('orders.service.createOrder: not implemented (PR-3)');
}

/**
 * تعيين مصمم لأوردر.
 * يحدّث orders.designerId/Name + يُسجِّل في audit_logs.
 */
export async function assignDesigner(/* { orderId, designerId, designerName }, ctx */) {
  throw new Error('orders.service.assignDesigner: not implemented (PR-3)');
}

/**
 * إعادة تعيين مصمم (workspace).
 */
export async function reassignDesigner(/* { orderId, newDesignerId, newDesignerName, reason }, ctx */) {
  throw new Error('orders.service.reassignDesigner: not implemented (PR-3)');
}

/**
 * بدء العمل على أوردر (designStage: pending → wip).
 */
export async function startWork(/* { orderId }, ctx */) {
  throw new Error('orders.service.startWork: not implemented (PR-3)');
}

export async function acceptOrder(/* { orderId }, ctx */) {
  throw new Error('orders.service.acceptOrder: not implemented (PR-3)');
}

export async function pauseWork(/* { orderId, reason }, ctx */) {
  throw new Error('orders.service.pauseWork: not implemented (PR-3)');
}

/**
 * اعتماد أوردر للطباعة (يستدعي buildStageAdvance).
 */
export async function approveForPrint(/* { orderId, printerId, printerName }, ctx */) {
  throw new Error('orders.service.approveForPrint: not implemented (PR-3)');
}

/**
 * رفض أوردر (designStage → rejected).
 */
export async function rejectOrder(/* { orderId, reason }, ctx */) {
  throw new Error('orders.service.rejectOrder: not implemented (PR-3)');
}

/**
 * إعادة لـ wip (designStage rejected/awaiting → wip).
 */
export async function sendBackToWip(/* { orderId, reason }, ctx */) {
  throw new Error('orders.service.sendBackToWip: not implemented (PR-3)');
}

/**
 * فصل منتجات إلى أوردر جديد (split).
 * يستدعي buildOrderSplit ذرّياً.
 */
export async function splitOrder(/* { orderId, productIndices, targetStage }, ctx */) {
  throw new Error('orders.service.splitOrder: not implemented (PR-3)');
}

/**
 * تحديث حالة منتج داخل أوردر.
 */
export async function setProductStatus(/* { orderId, productIndex, status }, ctx */) {
  throw new Error('orders.service.setProductStatus: not implemented (PR-3)');
}

/**
 * Admin override للـ stage (يكتب audit_logs).
 */
export async function moveStage(/* { orderId, fromStage, toStage, reason }, ctx */) {
  throw new Error('orders.service.moveStage: not implemented (PR-3)');
}

/**
 * Admin: تعديل بنود مالية على أوردر.
 */
export async function saveAdminFinance(/* { orderId, fields }, ctx */) {
  throw new Error('orders.service.saveAdminFinance: not implemented (PR-3)');
}

/**
 * حذف أوردر بالكامل + استرداد عربون (atomic — RULE 3).
 * يستدعي FE.CUSTOMER_REFUND.
 */
export async function deleteOrderFull(/* { orderId, reason }, ctx */) {
  throw new Error('orders.service.deleteOrderFull: not implemented (PR-3)');
}

/**
 * تعديل ملاحظات/بيانات تصميم.
 */
export async function saveDesignNotes(/* { orderId, notes }, ctx */) {
  throw new Error('orders.service.saveDesignNotes: not implemented (PR-3)');
}
