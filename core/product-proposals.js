// ============================================================
// core/product-proposals.js
// ============================================================
// Product Proposals — "نقترح بالمنتج الكامل، مش بالمورد".
//
// المبدأ (BUSINESS DNA):
//   وحدة الاقتراح = المنتج الكامل (prodIdx داخل الأوردر)، وليست المورد.
//   المقترح الواحد يحوي عدة سطور (lines) — كل سطر = (مورد + نوع بند + مبلغ)،
//   ويُسمح بعدّة موردين للمنتج الواحد. تبني المقترح كاملاً ثم تعتمده مرة واحدة،
//   فيُولِّد بنود التكلفة (order.costItems) دفعةً واحدة ذرّياً ويحرّك حالة التنفيذ.
//
// لماذا طبقة فوق costItems وليس بديلاً (E1 — تطوّر تدريجي):
//   • costItems يظل المصدر المالي الوحيد (ledger / supplier_orders / المدفوعات
//     كلها تشتغل بلا تغيير). المقترح يولّدها فقط.
//   • backward-compatible: لو ما فيش proposals، النظام يعمل بالضبط كما هو.
//   • feature-flagged في الـ UI (production.productProposals).
//
// لماذا هذا الملف وليس order-actions.js/orders.js:
//   كلاهما > 2500 سطر (قاعدة G5 = freeze حتى decomposition). core/ مسموح
//   له بالكتابة (H1.1 allowlist)، فنضع الـ action + الـ validator هنا دون
//   تضخيم الملفات المجمّدة.
//
// ضمانات الدستور:
//   • RULE 3: كل بنود المقترح تُولَّد في writeBatch واحد ذرّي.
//   • FSE: القيود المالية عبر addLedgerToBatch + FE فقط (لا تجاوز للمحرّك).
//   • H1.2: acceptProposal مغلّف بـ withIdempotency (نافذة 60s).
//   • H1.5: كل action يُرجع { ok, errors, warnings, ... }.
//   • H3: الأحداث المهمّة عبر auditEntry (الاعتماد → timeline؛ المسوّدة →
//     ختم audit داخل المقترح بدون تلويث timeline).
//   • RULE 1: costItem المولَّد يحمل proposalId للربط/العكس المستقبلي.
// ============================================================

import {
  doc, getDoc, writeBatch, serverTimestamp, collection,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { addLedgerToBatch, FE } from '../financial-sync-engine.js';
import { db as defaultDb } from './firebase-init.js';
import { withIdempotency } from './idempotency.js';
import { auditEntry, nowStr } from './audit.js';
import {
  validateProductProposal,
  normalizeProposalLines as _normalizeLines,
  genLineId as genId,
} from './product-proposals-validate.js';

// re-export النقي للاستهلاك الخارجي + التوافق
export { validateProductProposal };

// ── helpers ──────────────────────────────────────────────────────
async function _loadOrder(db, orderId) {
  if (!db || !orderId) return null;
  const ref = doc(db, 'orders', orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { ...snap.data(), _id: orderId, _ref: ref };
}

// ── actions ──────────────────────────────────────────────────────
export const productProposalActions = {
  /**
   * saveProposal — إنشاء/تحديث مسوّدة مقترح للمنتج (draft).
   * لا يولّد أي تكلفة — مجرد staging داخل order.productProposals[].
   *
   * @param {Object} args
   * @param {Object} [args.db=defaultDb]
   * @param {string} args.orderId
   * @param {number} args.prodIdx
   * @param {Array}  args.lines           — [{type, supplierId, supplierName, total, note, paperMeta}]
   * @param {string} [args.proposalId]    — لو موجود → تحديث مسوّدة قائمة
   * @param {string} args.userId
   * @param {string} [args.userName]
   * @returns {{ ok, errors, warnings, orderId, proposalId }}
   */
  async saveProposal({ db = defaultDb, orderId, prodIdx, lines, proposalId = '', userId, userName = '' }) {
    if (!orderId) return { ok: false, errors: ['orderId مطلوب'], warnings: [] };
    if (!userId)  return { ok: false, errors: ['userId مطلوب'],  warnings: [] };

    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };

    const v = validateProductProposal({ order, prodIdx, lines });
    if (!v.ok) return { ...v, orderId };

    const norm = _normalizeLines(lines);
    const totalCost = norm.reduce((s, l) => s + l.total, 0);
    const products = order.products || [];
    const productName = products[prodIdx]?.name || `منتج ${Number(prodIdx) + 1}`;

    const all = [...(order.productProposals || [])];
    const idx = proposalId ? all.findIndex((p) => p && p.proposalId === proposalId) : -1;
    const stamp = auditEntry({ action: `📝 حفظ مقترح — ${productName}`, userId, userName, kind: 'edit' });

    let pid = proposalId || genId();
    if (idx >= 0) {
      const existing = all[idx];
      if (existing.status === 'accepted') {
        return { ok: false, errors: ['⛔ المقترح معتمد بالفعل — لا يمكن تعديله'], warnings: [], orderId };
      }
      all.splice(idx, 1, {
        ...existing,
        prodIdx: Number(prodIdx),
        productName,
        lines: norm,
        totalCost,
        status: 'draft',
        updatedAt: stamp.date,
        updatedBy: userId,
        updatedByName: userName,
      });
    } else {
      all.push({
        proposalId: pid,
        prodIdx: Number(prodIdx),
        productName,
        lines: norm,
        totalCost,
        status: 'draft',
        generatedCostItemIds: [],
        createdAt: stamp.date,
        createdBy: userId,
        createdByName: userName,
      });
    }

    try {
      const batch = writeBatch(db);
      batch.update(order._ref, { productProposals: all, updatedAt: serverTimestamp() });
      await batch.commit();
      return { ok: true, errors: [], warnings: v.warnings, orderId, proposalId: pid };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل حفظ المقترح'], warnings: [], orderId };
    }
  },

  /**
   * acceptProposal — اعتماد المقترح → توليد بنود التكلفة دفعةً واحدة.
   *
   * يبني batch واحد ذرّي (RULE 3) يحوي:
   *   • costItem لكل سطر (نفس شكل recordCostItem) + proposalId/lineId للربط
   *   • supplier_orders لكل سطر له مورد
   *   • قيد ledger لكل سطر عبر addLedgerToBatch (FE.VENDOR_PAYMENT)
   *   • order.costItems += [...newItems] + تحديث المقترح (accepted + ids)
   *   • تحريك products[prodIdx].execStatus: pending → wip (محافظ)
   *   • timeline auditEntry (H3)
   *
   * @returns {{ ok, errors, warnings, orderId, proposalId, generatedCostItemIds, operationId?, idempotent? }}
   */
  async acceptProposal({ db = defaultDb, orderId, proposalId, userId, userName = '' }) {
    if (!orderId)    return { ok: false, errors: ['orderId مطلوب'], warnings: [] };
    if (!proposalId) return { ok: false, errors: ['proposalId مطلوب'], warnings: [], orderId };
    if (!userId)     return { ok: false, errors: ['userId مطلوب'], warnings: [], orderId };

    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };

    const all = [...(order.productProposals || [])];
    const idx = all.findIndex((p) => p && p.proposalId === proposalId);
    if (idx < 0) return { ok: false, errors: ['المقترح غير موجود'], warnings: [], orderId };
    const proposal = all[idx];
    if (proposal.status === 'accepted') {
      return { ok: false, errors: ['⛔ المقترح معتمد بالفعل'], warnings: [], orderId };
    }

    const v = validateProductProposal({ order, prodIdx: proposal.prodIdx, lines: proposal.lines });
    if (!v.ok) return { ...v, orderId };

    return withIdempotency(db, {
      actionType: 'accept_product_proposal',
      entityId: orderId,
      actorId: userId,
      payload: { orderId, proposalId, totalCost: proposal.totalCost },
    }, async () => {
      const prodIdx = Number(proposal.prodIdx);
      const norm = _normalizeLines(proposal.lines);
      const today = new Date().toISOString().slice(0, 10);
      const addedAt = nowStr();

      const batch = writeBatch(db);
      const newItems = [];
      const generatedCostItemIds = [];

      for (const line of norm) {
        const costItemId = genId();
        const soRef = line.supplierId ? doc(collection(db, 'supplier_orders')) : null;
        const supplierOrderId = soRef ? soRef.id : '';

        const item = {
          costItemId,
          orderId,
          proposalId,                 // ربط البند بمقترحه (RULE 1 — للعكس/التتبّع)
          proposalLineId: line.lineId,
          isExternal: !!line.supplierId,
          ...(supplierOrderId ? { supplierOrderId } : {}),
          type: line.type,
          supplierId: line.supplierId,
          supplierName: line.supplierName,
          prodIdx: prodIdx >= 0 ? prodIdx : null,
          total: line.total,
          note: line.note,
          ...(line.paperMeta ? { paperMeta: line.paperMeta } : {}),
          date: today,
          addedAt,
          addedBy: userName,
        };
        newItems.push(item);
        generatedCostItemIds.push(costItemId);

        // قيد ledger — نفس eventType لـ recordCostItem (مورد → VENDOR_PAYMENT)
        const eventType = line.supplierId ? FE.VENDOR_PAYMENT : FE.GENERAL_EXPENSE;
        addLedgerToBatch(batch, db, eventType, {
          amount: line.total,
          orderId,
          clientName: order.clientName || '',
          vendorId: line.supplierId,
          vendorName: line.supplierName,
          notes: `تكلفة تنفيذ (مقترح) — ${line.type}${line.note ? ' — ' + line.note : ''} · ${proposal.productName}`,
          userId, userName,
        });

        // supplier_orders — سجل المورد الرسمي (نفس شكل recordCostItem)
        if (soRef) {
          batch.set(soRef, {
            costItemId,
            proposalId,
            orderId, orderRef: order.orderId || orderId.slice(-6),
            clientName: order.clientName || '',
            supplierId: line.supplierId, supplierName: line.supplierName,
            type: line.type, total: line.total,
            note: line.note || '',
            status: 'pending',
            deliveryStatus: 'awaiting',
            paidAmount: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy: userId,
            createdByName: userName,
            isDeleted: false,
          });
        }
      }

      // تحديث المقترح → accepted
      all.splice(idx, 1, {
        ...proposal,
        lines: norm,
        totalCost: norm.reduce((s, l) => s + l.total, 0),
        status: 'accepted',
        generatedCostItemIds,
        acceptedAt: addedAt,
        acceptedBy: userId,
        acceptedByName: userName,
      });

      // تحريك حالة التنفيذ للمنتج: pending/فاضي → wip (محافظ — لا نلمس done/problem)
      const products = [...(order.products || [])];
      let productsPatch = null;
      if (prodIdx >= 0 && products[prodIdx]) {
        const cur = products[prodIdx].execStatus || 'pending';
        if (cur === 'pending' || cur === '') {
          products[prodIdx] = { ...products[prodIdx], execStatus: 'wip' };
          productsPatch = products;
        }
      }

      const entry = auditEntry({
        action: `✅ اعتماد مقترح — ${proposal.productName}: ${newItems.length} بند · ${proposal.totalCost.toLocaleString('ar-EG')} ج`,
        userId, userName, kind: 'op',
        meta: { proposalId, prodIdx, lines: newItems.length, totalCost: proposal.totalCost },
      });

      batch.update(order._ref, {
        costItems: [...(order.costItems || []), ...newItems],
        productProposals: all,
        ...(productsPatch ? { products: productsPatch } : {}),
        ...(!order.productionAgent && userId ? { productionAgent: userId, productionAgentName: userName } : {}),
        timeline: [...(order.timeline || []), entry],
        updatedAt: serverTimestamp(),
      });

      await batch.commit();

      return {
        ok: true, errors: [], warnings: v.warnings,
        orderId, proposalId,
        generatedCostItemIds,
      };
    });
  },

  /**
   * rejectProposal — حذف/رفض مسوّدة (draft فقط — المعتمد لا يُرفض).
   * @returns {{ ok, errors, warnings, orderId }}
   */
  async rejectProposal({ db = defaultDb, orderId, proposalId, userId, userName = '' }) {
    if (!orderId)    return { ok: false, errors: ['orderId مطلوب'], warnings: [] };
    if (!proposalId) return { ok: false, errors: ['proposalId مطلوب'], warnings: [], orderId };
    if (!userId)     return { ok: false, errors: ['userId مطلوب'], warnings: [], orderId };

    const order = await _loadOrder(db, orderId);
    if (!order) return { ok: false, errors: ['الأوردر غير موجود'], warnings: [], orderId };

    const all = [...(order.productProposals || [])];
    const idx = all.findIndex((p) => p && p.proposalId === proposalId);
    if (idx < 0) return { ok: false, errors: ['المقترح غير موجود'], warnings: [], orderId };
    if (all[idx].status === 'accepted') {
      return { ok: false, errors: ['⛔ المقترح معتمد — احذف بنود التكلفة المولَّدة بدلاً من رفضه'], warnings: [], orderId };
    }

    const productName = all[idx].productName || '';
    all.splice(idx, 1);
    const entry = auditEntry({ action: `🗑 رفض مقترح — ${productName}`, userId, userName, kind: 'op' });

    try {
      const batch = writeBatch(db);
      batch.update(order._ref, {
        productProposals: all,
        timeline: [...(order.timeline || []), entry],
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return { ok: true, errors: [], warnings: [], orderId };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل رفض المقترح'], warnings: [], orderId };
    }
  },
};

// إتاحة عالمية للـ inline handlers + الـ console debugging (نفس نمط feature-flags).
try {
  window.__productProposalActions = productProposalActions;
} catch (_) { /* non-browser env */ }
