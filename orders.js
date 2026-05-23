/**
 * Business2Card ERP — orders.js
 * محرك الأوردرات المركزي + بوابة المراحل الموحّدة (Stage Gate)
 *
 * الـ Flow الفعلي: design → printing → production → shipping → archived
 * (cancelled مرحلة طرفية مستقلة)
 *
 * كل أوردر له `stage` واحد فقط في أي وقت.
 * أي انتقال بين المراحل يجب أن يمر عبر `buildStageAdvance()`
 * وأي رجوع للخلف عبر `buildStageRevert()`.
 *
 * هذه الدوال **خالصة (pure)**: لا تتصل بقاعدة البيانات.
 * المُتَّصِل (الصفحة) يأخذ النتيجة ويكتبها داخل batch/updateDoc الخاص به.
 * هذا يسمح للصفحة بدمج تحديث المرحلة مع writes أخرى داخل batch ذرّي واحد (RULE 3).
 */

// ══════════════════════════════════════════
// FIREBASE CONFIG — Deprecated (re-exported from core/firebase-init.js)
// ══════════════════════════════════════════
// G2 Migration: FB_CONFIG الآن في core/firebase-init.js. هذا re-export
// للتوافق مع أي مستهلك قديم. الصفحات الجديدة يجب تستورد من core مباشرة.
export { FB_CONFIG } from './core/firebase-init.js';

// ══════════════════════════════════════════
// STAGES — تعريف المراحل وترتيبها (يطابق الواقع)
// ══════════════════════════════════════════
export const STAGES = {
  design:     { label:'تصميم', ico:'✏️', col:'#a78bfa', next:'printing',   prev:null,         page:'design.html'     },
  printing:   { label:'طباعة', ico:'🖨️', col:'#ffaa00', next:'production', prev:'design',     page:'print.html'      },
  production: { label:'تنفيذ', ico:'🏭', col:'#ff3d6e', next:'shipping',   prev:'printing',   page:'production.html' },
  shipping:   { label:'شحن',   ico:'🚚', col:'#22d3ee', next:'archived',   prev:'production', page:'shipping.html'   },
  archived:   { label:'أرشيف', ico:'📁', col:'#4e5672', next:null,         prev:'shipping',   page:'archive.html'    },
  cancelled:  { label:'ملغي',  ico:'✕',  col:'#4e5672', next:null,         prev:null,         page:'archive.html'    },
};

// من له صلاحية تقديم الأوردر **من** هذه المرحلة للتالية
export const STAGE_PERMISSIONS = {
  design:     ['admin','operation_manager','customer_service','graphic_designer','design_operator'],
  printing:   ['admin','operation_manager','customer_service','production_agent'],
  production: ['admin','operation_manager','production_agent'],
  shipping:   ['admin','operation_manager','shipping_officer'],
  archived:   ['admin','operation_manager'],
};

// ══════════════════════════════════════════
// STAGE OWNERSHIP — أصحاب كل مرحلة (من يستلم العمل)
// ══════════════════════════════════════════
// يحدد أي حقل في الأوردر يحمل id الموظف المسؤول عن المرحلة،
// وأي أدوار يمكن تعيينها في تلك المرحلة.
export const STAGE_OWNERSHIP = {
  design:     { idField:'designerId',         nameField:'designerName',         roles:['graphic_designer','design_operator'] },
  printing:   { idField:'printerId',          nameField:'printerName',          roles:['production_agent'] },
  production: { idField:'productionAgent',    nameField:'productionAgentName',  roles:['production_agent'] },
  shipping:   { idField:'shippingOfficerId',  nameField:'shippingOfficerName',  roles:['shipping_officer'] },
};

/** يُرجع تعريف ملكية المرحلة (الحقل + الأدوار المسموحة) */
export function getStageOwnership(stage) {
  return STAGE_OWNERSHIP[stage] || null;
}

// ══════════════════════════════════════════
// FLAT ENUMS — RULE C2 (Central Constants)
// ══════════════════════════════════════════
// Single source of truth لكل قيمة ثابتة في النظام.
// استخدمها بدل magic strings في كل مكان:
//   ❌ if (order.stage === 'shipping')
//   ✅ if (order.stage === ORDER_STAGES.SHIPPING)
//
// القيم متطابقة 100% مع الـ keys في STAGES/PRODUCT_STATUS/ROLES المُعرَّفة فوق/تحت،
// فلا تعارض ولا تكرار — مجرد طبقة semantic للاستخدام في الفحوصات.

export const ORDER_STAGES = Object.freeze({
  DESIGN:     'design',
  PRINTING:   'printing',
  PRODUCTION: 'production',
  SHIPPING:   'shipping',
  ARCHIVED:   'archived',
  CANCELLED:  'cancelled',
});

export const USER_ROLES = Object.freeze({
  ADMIN:             'admin',
  OPERATION_MANAGER: 'operation_manager',
  CUSTOMER_SERVICE:  'customer_service',
  GRAPHIC_DESIGNER:  'graphic_designer',
  DESIGN_OPERATOR:   'design_operator',
  PRODUCTION_AGENT:  'production_agent',
  SHIPPING_OFFICER:  'shipping_officer',
  WALLET_MANAGER:    'wallet_manager',
});

export const SHIPPING_METHODS = Object.freeze({
  COMPANY: 'company',  // شركة شحن خارجية (تحتاج shipSettled)
  PICKUP:  'pickup',   // استلام من المحل
  COURIER: 'courier',  // مندوب داخلي
});

export const PAYMENT_TYPES = Object.freeze({
  CUSTOMER: 'customer', // دفعة عميل عادية
  REFUND:   'refund',   // استرداد للعميل
  DISCOUNT: 'discount', // خصم
});

// SHIP_STAGES — PR-1 (scalable-drifting-ember):
// New canonical values added alongside legacy. Existing data keeps reading
// legacy values; `normalizeShipStage` maps both to the canonical set.
// Legacy values stay in the enum for backward compat (read + audit).
export const SHIP_STAGES = Object.freeze({
  READY:            'ready',
  // Legacy (kept for backward compatibility — DO NOT remove until data migration):
  WAIT_DELIVERY:    'wait_delivery',     // → SHIPPED
  WAIT_COLLECTION:  'wait_collection',   // → DELIVERED
  RETURNED:         'returned',          // → RETURNED_FULL
  COMPLETED:        'completed',         // → CLOSED
  // New canonical (PR-1):
  SHIPPED:          'shipped',
  DELIVERED:        'delivered',
  UNDER_COLLECTION: 'under_collection',
  COLLECTED:        'collected',
  RETURNED_FULL:    'returned_full',
  RETURNED_PARTIAL: 'returned_partial',
  CLOSED:           'closed',
});

/**
 * normalizeShipStage — يحوّل قيمة `shipStage` المخزَّنة (قديمة أو جديدة)
 * إلى القيمة الـ canonical الجديدة. read-only normalizer — لا يكتب على الـ DB.
 * يُستخدم في الـ UI labels و الـ helpers الجديدة فقط (PR-1).
 * @param {string} v
 * @returns {string}
 */
export function normalizeShipStage(v) {
  switch (v) {
    case 'wait_delivery':   return 'shipped';
    case 'wait_collection': return 'delivered';
    case 'returned':        return 'returned_full';
    case 'completed':       return 'closed';
    default:                return v || 'ready';
  }
}

// SHIP_STAGE_LABELS — Arabic labels للقيم الجديدة (post-normalize).
// الترجمة موحَّدة بين الصفحات بدلاً من تكرار `{pickup:'🏠 استلام', ...}`.
const SHIP_STAGE_LABELS = Object.freeze({
  ready:            { ico:'📦', text:'جاهز للشحن' },
  shipped:          { ico:'🚚', text:'تم الشحن' },
  delivered:        { ico:'✅', text:'تم التسليم' },
  under_collection: { ico:'⏳', text:'تحت التحصيل' },
  collected:        { ico:'💰', text:'تم التحصيل' },
  returned_full:    { ico:'↩️', text:'مرتجع كامل' },
  returned_partial: { ico:'↪️', text:'مرتجع جزئي' },
  closed:           { ico:'🗄️', text:'مغلق' },
});

const SHIP_METHOD_LABELS = Object.freeze({
  pickup:  { ico:'🏠', text:'استلام بالمحل' },
  courier: { ico:'🏍️', text:'مندوب' },
  company: { ico:'📦', text:'شركة شحن' },
});

/**
 * getShipStageLabel — نص + أيقونة لمرحلة الشحن (post-normalize).
 * المصدر الوحيد لـ "كيف نعرض shipStage" — يُسقط الـ `methodLabel` الـ inline.
 * @param {Object} order
 * @returns {{ ico:string, text:string, raw:string }}
 */
export function getShipStageLabel(order) {
  const raw = normalizeShipStage(order?.shipStage);
  const lbl = SHIP_STAGE_LABELS[raw] || { ico:'⏸', text: raw || 'غير محدد' };
  return { ico: lbl.ico, text: lbl.text, raw };
}

/**
 * getShipMethodLabel — نص + أيقونة لطريقة الشحن.
 * يحلّ ReferenceError القديم اللي كان كل صفحة تبني `methodLabel` بنفسها.
 * @param {Object} order
 * @returns {{ ico:string, text:string, raw:string }}
 */
export function getShipMethodLabel(order) {
  const raw = order?.shipMethod || '';
  const lbl = SHIP_METHOD_LABELS[raw];
  if (!lbl) return { ico:'⏸', text:'غير محدد', raw };
  // لـ company نرفق اسم الشركة لو موجود
  const text = raw === 'company' && order?.shipCompanyName
    ? lbl.text + ' — ' + order.shipCompanyName
    : lbl.text;
  return { ico: lbl.ico, text, raw };
}

/**
 * getExpectedCollection — المتوقَّع تحصيله من العميل.
 * salePrice + customerShipFee − discount − totalPaid (لا يطرح أقل من 0).
 * يُستخدم في الـ UI كـ "المطلوب تحصيله من العميل عند التسليم".
 * @param {Object} order
 * @returns {number}
 */
export function getExpectedCollection(order) {
  if (!order) return 0;
  const sale     = Number(order.salePrice)        || 0;
  const shipFee  = Number(order.customerShipFee)  || 0;
  const discount = Number(order.discount)         || 0;
  const paid     = Number(order.totalPaid)        || 0;
  return Math.max(0, sale + shipFee - discount - paid);
}

/**
 * getExpectedFromCompany — المتوقَّع تحصيله من شركة الشحن.
 * shipCollected − shippingCost (يقبل سالباً لو الشركة تطالبنا).
 * @param {Object} order
 * @returns {number}
 */
export function getExpectedFromCompany(order) {
  if (!order) return 0;
  const collected = Number(order.shipCollected) || 0;
  const cost      = Number(order.shippingCost)  || 0;
  return collected - cost;
}

export const PRODUCT_STATUSES = Object.freeze({
  PENDING:     'pending',
  IN_PROGRESS: 'in_progress',
  READY:       'ready',
  PRINTED:     'printed',
  DONE:        'done',
  ON_HOLD:     'on_hold',
});

export const RETURN_STATUSES = Object.freeze({
  REQUESTED:  'requested',
  INSPECTING: 'inspecting',
  APPROVED:   'approved',
  REJECTED:   'rejected',
  REFUNDED:   'refunded',
  CANCELLED:  'cancelled',
  CLOSED:     'closed',
});

// PAYMENT_STATUSES — حالة الدفع للأوردر (order.paymentStatus)
// مكتشَف في CONSTANTS_AUDIT: 132 magic string بدون enum مركزي
export const PAYMENT_STATUSES = Object.freeze({
  PENDING:  'pending',
  PARTIAL:  'partial',
  PAID:     'paid',
  RETURNED: 'returned',
});

// ORDER_DESIGN_STAGES — قيم order.designStage (sub-state داخل مرحلة design)
// المصدر الوحيد للحالات الفرعية للتصميم (RULE C2 — Phase 2 / B2).
// التدفق المتوقع:
//   pending → wip → awaiting_payment → approved
//                ↘ rejected (يحتاج معالجة CS)
// كل الـ comparisons في orders.js / order-actions.js يجب أن تستخدم هذا الـ enum
// بدلاً من magic strings. الـ UI يهاجر تدريجياً (RULE G9).
export const ORDER_DESIGN_STAGES = Object.freeze({
  PENDING:          'pending',           // الافتراضي عند الإنشاء
  WIP:              'wip',                // المصمم بدأ العمل
  AWAITING_PAYMENT: 'awaiting_payment',   // ينتظر دفع العميل قبل المتابعة
  APPROVED:         'approved',           // معتمد — جاهز للانتقال لـ printing
  REJECTED:         'rejected',           // مرفوض — يحتاج CS
});

// ROLE GROUPINGS — مجموعات الأدوار المتكررة (مكتشَف في 15+ ملف)
export const ADMIN_ROLES            = Object.freeze(['admin', 'operation_manager']);
export const PAYMENT_ROLES_REFUND   = Object.freeze(['admin', 'operation_manager', 'wallet_manager']);
export const PAYMENT_ROLES_CUSTOMER = Object.freeze(['admin', 'operation_manager', 'customer_service', 'wallet_manager']);

// ─ Helper: التحقق من صحة قيمة constant ─
/** يفحص لو القيمة تنتمي إلى enum معين. مفيد للـ validators. */
export function isValidConstant(enumObj, value) {
  return Object.values(enumObj).includes(value);
}

// ══════════════════════════════════════════
// PRODUCT STATUS — حالة المنتج داخل الأوردر
// ══════════════════════════════════════════
// كل منتج في order.products[] يحمل productStatus مستقل عن الأوردر،
// فيتمكن المصمم من إنهاء بعض المنتجات بينما يبقى الباقي معلَّقاً.
//
// التدفق المتوقع:
//   pending → in_progress → ready → printed → done
//                              ↘ on_hold (مؤجَّل بطلب العميل)
//
// كل صفحة تفلتر المنتجات بحسب حالتها:
//   - design.html: pending / in_progress (يعمل عليها)
//   - print.html : ready (جاهز للطباعة)
//   - production.html: printed (مطبوع، جاهز للتنفيذ)
//   - shipping.html: done (كله جاهز للشحن)
export const PRODUCT_STATUS = {
  pending:     { label:'في الانتظار',     ico:'⏳', col:'#647298', sort:0 },
  in_progress: { label:'جاري التصميم',    ico:'✏️', col:'#4a8ef5', sort:1 },
  ready:       { label:'جاهز للطباعة',    ico:'✅', col:'#00c87a', sort:2 },
  printed:     { label:'مطبوع',            ico:'🖨️', col:'#a78bfa', sort:3 },
  done:        { label:'منتهي',            ico:'✓',  col:'#00c87a', sort:4 },
  on_hold:     { label:'مؤجَّل',           ico:'⏸',  col:'#f0a020', sort:-1 },
};

/** badge HTML لحالة المنتج */
export function productStatusBadge(status) {
  const s = PRODUCT_STATUS[status] || PRODUCT_STATUS.pending;
  return `<span class="bdg" style="background:${s.col}1f;color:${s.col};border-color:${s.col}40">${s.ico} ${s.label}</span>`;
}

/**
 * يُرجع المنتجات المؤهَّلة لمرحلة معينة من الأوردر.
 * @param {Object} order
 * @param {string} stage  — design | printing | production | shipping
 * @returns {Array<{product, idx, status}>}
 */
export function getProductsForStage(order, stage) {
  if (!order || !order.products) return [];
  const eligibleStatuses = {
    design:     ['pending', 'in_progress'],
    printing:   ['ready'],
    production: ['printed'],
    shipping:   ['done', 'printed'],
  }[stage] || [];
  return (order.products || [])
    .map((p, idx) => ({ product: p, idx, status: p.productStatus || 'pending' }))
    .filter(item => eligibleStatuses.includes(item.status));
}

/** هل كل منتجات الأوردر بنفس الحالة (أو بحالة أعلى/مساوية)؟ */
export function allProductsAtLeast(order, status) {
  if (!order || !order.products?.length) return true;
  const target = PRODUCT_STATUS[status]?.sort ?? 0;
  return order.products.every(p => {
    const s = PRODUCT_STATUS[p.productStatus || 'pending'];
    return (s?.sort ?? 0) >= target;
  });
}

// ══════════════════════════════════════════
// ORDER SPLIT — تقسيم الأوردر (إرسال جزء للمرحلة التالية)
// ══════════════════════════════════════════
/**
 * يبني spec لتقسيم الأوردر إلى أوردر أصلي (parent) وأوردر فرعي (child).
 *
 * الفرعي:
 *   - يأخذ المنتجات المختارة فقط
 *   - يبدأ في المرحلة التالية (printing أو production)
 *   - **عملياتي فقط** — لا يحمل سعراً ولا دفعات (الأصلي يحتفظ بكل المالية)
 *   - مرتبط بالأصلي عبر parentOrderId
 *
 * الأصلي:
 *   - تُحذف منه المنتجات المنفصلة
 *   - يضاف child.id إلى childOrderIds[]
 *   - يبقى في مرحلته الحالية
 *
 * **لا يتصل بقاعدة البيانات** — المُتَّصِل يكتب الـ batch بنفسه.
 *
 * @param {Object} args
 * @param {Object} args.order            — الأوردر الأصلي
 * @param {Array<number>} args.productIndices — indices من products[] لفصلها
 * @param {string} args.role             — دور المستخدم
 * @param {string} args.userId
 * @param {string} args.userName
 * @param {string} [args.targetStage]    — مرحلة الفرعي (افتراضي: المرحلة التالية للأصلي)
 * @returns { ok, errors, parentUpdate, childOrderData }
 *   - parentUpdate: حقول لتحديث الأصلي
 *   - childOrderData: doc كامل للأوردر الفرعي (بدون id بعد، يُولَّد بـ doc())
 */
export function buildOrderSplit({ order, productIndices, role, userId, userName, targetStage = null }) {
  if (!order) return { ok:false, errors:['لا يوجد أوردر'] };
  if (!Array.isArray(productIndices) || !productIndices.length)
    return { ok:false, errors:['اختر منتجاً واحداً على الأقل'] };
  const allProducts = order.products || [];
  const total = allProducts.length;
  if (productIndices.length === total)
    return { ok:false, errors:['لا يمكن فصل كل المنتجات — حرّك الأوردر بالكامل بدلاً من ذلك'] };
  // تحقق من صحة الـ indices
  for (const i of productIndices) {
    if (i < 0 || i >= total) return { ok:false, errors:[`فهرس منتج غير صالح: ${i}`] };
  }

  const cur = order.stage || 'design';
  const stageConf = STAGES[cur];
  if (!stageConf) return { ok:false, errors:['مرحلة غير معروفة: ' + cur] };
  const target = targetStage || stageConf.next;
  if (!target) return { ok:false, errors:['لا توجد مرحلة تالية'] };
  if (!STAGES[target]) return { ok:false, errors:['مرحلة هدف غير معروفة: ' + target] };

  // فحص الصلاحية
  const allowed = STAGE_PERMISSIONS[cur] || [];
  const isAdmin = role === 'admin' || role === 'operation_manager';
  if (!isAdmin && !allowed.includes(role)) {
    return { ok:false, errors:['ليس لديك صلاحية فصل الأوردر'] };
  }

  const idxSet = new Set(productIndices);
  const splitOff = allProducts.filter((_, i) => idxSet.has(i));
  const remaining = allProducts.filter((_, i) => !idxSet.has(i));
  const now = nowStr();
  const parentRef = order.orderId || (order._id ? order._id.slice(-8) : '');
  const childOrderId = (parentRef ? parentRef + '/' : 'ORD-') +
                       String.fromCharCode(65 + ((order.childOrderIds || []).length)); // /A, /B, /C...

  // بناء بيانات الأوردر الفرعي (عملياتي — بلا مالية)
  const childOrderData = {
    orderId:     childOrderId,
    parentOrderId: order._id || '',
    parentOrderRef: parentRef,
    isSplit:     true,
    isChildOrder:true,

    // العميل
    clientId:    order.clientId    || '',
    clientName:  order.clientName  || '',
    clientPhone: order.clientPhone || '',

    // المرحلة
    stage: target,
    stageEnteredAt: { [target]: now },

    // المنتجات المنفصلة
    products: splitOff,

    // المسؤولون (نسخ من الأصلي حيث ينطبق)
    designerId:          order.designerId          || '',
    designerName:        order.designerName        || '',
    printerId:           order.printerId           || '',
    printerName:         order.printerName         || '',
    productionAgent:     order.productionAgent     || '',
    productionAgentName: order.productionAgentName || '',
    shippingOfficerId:   order.shippingOfficerId   || '',
    shippingOfficerName: order.shippingOfficerName || '',

    // المالية = صفر (الأصلي يحتفظ بكل المال)
    salePrice:     0,
    deposit:       0,
    totalPaid:     0,
    remaining:     0,
    paymentStatus: 'parent_holds',
    costItems:     [],

    // متابعة
    deadline: order.deadline || '',
    notes:    order.notes    || '',

    timeline: [
      {
        date:  now,
        stage: target,
        action: `🔀 أوردر فرعي مفصول من ${parentRef} — ${splitOff.length} منتجات`,
        by:    userName || '',
        byId:  userId   || '',
      },
    ],

    createdBy:     userId   || '',
    createdByName: userName || '',
    createdAt:     null, // serverTimestamp في الـ caller
    updatedAt:     null,
  };

  // تحديث الأوردر الأصلي
  const parentUpdate = {
    fields: {
      products: remaining,
    },
    timelineEntry: {
      date:  now,
      stage: cur,
      action: `🔀 فُصل ${splitOff.length} منتج → ${childOrderId}: ${splitOff.map(p => p.name).join('، ')}`,
      by:    userName || '',
      byId:  userId   || '',
    },
    childOrderIdPlaceholder: childOrderId, // الـ caller يضيف الـ docId الفعلي بعد إنشاء الفرعي
  };

  return { ok:true, parentUpdate, childOrderData, childOrderId, splitCount: splitOff.length };
}

// ══════════════════════════════════════════
// STAGE SLA — الحدود الزمنية القياسية لكل مرحلة (بالساعات)
// ══════════════════════════════════════════
// يمكن override عبر settings/main.stageSla لاحقاً
export const STAGE_SLA_DEFAULTS = {
  design:     24,
  printing:    8,
  production: 24,
  shipping:   48,
};

/**
 * عمر الأوردر في مرحلته الحالية بالساعات.
 * يستخدم order.stageEnteredAt[stage] إن وجد، وإلا يرجع 0.
 */
export function getStageAge(order, slaOverride = null) {
  if (!order || !order.stage) return 0;
  const stage = order.stage;
  const enteredStr = order.stageEnteredAt?.[stage];
  if (!enteredStr) return 0;
  const enteredMs = parseArDate(enteredStr);
  if (!enteredMs) return 0;
  return Math.max(0, (Date.now() - enteredMs) / (1000 * 60 * 60));
}

/** هل الأوردر تجاوز SLA مرحلته الحالية؟ */
export function isStageOverdue(order, slaTable = null) {
  if (!order || !order.stage) return false;
  const stage = order.stage;
  const sla = (slaTable && slaTable[stage]) || STAGE_SLA_DEFAULTS[stage];
  if (!sla) return false;
  return getStageAge(order) > sla;
}

/** SLA badge HTML للأوردر في المرحلة الحالية */
export function stageSlaBadge(order, slaTable = null) {
  if (!order || !order.stage) return '';
  const age = getStageAge(order);
  if (age <= 0) return '';
  const stage = order.stage;
  const sla = (slaTable && slaTable[stage]) || STAGE_SLA_DEFAULTS[stage];
  if (!sla) return '';
  const overdue = age > sla;
  const ageFmt = age < 1
    ? `${Math.round(age * 60)} د`
    : age < 24 ? `${Math.round(age)} س` : `${Math.round(age / 24)} ي`;
  if (overdue) return `<span class="bdg bdg-danger">⏰ ${ageFmt} متأخر</span>`;
  return `<span class="bdg bdg-mute">⏱ ${ageFmt}</span>`;
}

// ══════════════════════════════════════════
// SKELETON LOADER — placeholder cards شيمر
// ══════════════════════════════════════════
/** يبني HTML لعدة بطاقات skeleton أثناء التحميل */
export function skeletonCards(count = 4) {
  const card = `
    <div class="skel-card">
      <div style="display:flex;align-items:flex-start;gap:10px">
        <div class="skel skel-circle"></div>
        <div style="flex:1">
          <div class="skel skel-line w-50"></div>
          <div class="skel skel-line w-70"></div>
          <div class="skel skel-line w-30"></div>
        </div>
      </div>
    </div>`;
  return Array(count).fill(card).join('');
}

// ══════════════════════════════════════════
// EMPTY STATE — حالة فاضية مع CTA
// ══════════════════════════════════════════
/**
 * @param {Object} opts
 * @param {string} [opts.ico='📭']
 * @param {string} opts.title
 * @param {string} [opts.sub]
 * @param {{label, href, onclick}} [opts.cta]
 */
export function emptyState(opts = {}) {
  const ico   = opts.ico || '📭';
  const title = opts.title || 'لا توجد بيانات';
  const sub   = opts.sub || '';
  const cta   = opts.cta || null;
  const ctaHtml = cta
    ? (cta.href
        ? `<a class="empty-state-btn" href="${cta.href}">${cta.label}</a>`
        : `<button class="empty-state-btn" onclick="${cta.onclick}">${cta.label}</button>`)
    : '';
  return `
    <div class="empty-state">
      <div class="empty-state-ico">${ico}</div>
      <div class="empty-state-title">${title}</div>
      ${sub ? `<div class="empty-state-sub">${sub}</div>` : ''}
      ${ctaHtml}
    </div>`;
}

// helper داخلي: parse تاريخ عربي بصيغة dd/mm/yyyy hh:mm
function parseArDate(str) {
  if (!str) return null;
  // محاولة 1: ISO date
  const iso = Date.parse(str);
  if (!isNaN(iso)) return iso;
  // محاولة 2: dd/mm/yyyy hh:mm (ar-EG)
  const m = String(str).match(/(\d{1,2})\D(\d{1,2})\D(\d{4})\D*(\d{1,2})?\D*(\d{1,2})?/);
  if (m) {
    const d = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]),
                       parseInt(m[4] || 0), parseInt(m[5] || 0));
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return null;
}

// ══════════════════════════════════════════
// ROLES
// ══════════════════════════════════════════
export const ROLES = {
  admin:            { label:'Admin',             ico:'👑', col:'#a78bfa' },
  operation_manager:{ label:'Ops Manager',       ico:'📋', col:'#3b9eff' },
  customer_service: { label:'Cust. Service',     ico:'💬', col:'#22d3ee' },
  graphic_designer: { label:'Designer',          ico:'✏️', col:'#a78bfa' },
  design_operator:  { label:'Design Supervisor', ico:'⚙️', col:'#ffaa00' },
  production_agent: { label:'Production',        ico:'🏭', col:'#ff3d6e' },
  shipping_officer: { label:'Shipping',          ico:'🚚', col:'#22d3ee' },
  wallet_manager:   { label:'Wallet Mgr',        ico:'💰', col:'#00d97e' },
};

// ══════════════════════════════════════════
// ORDER STRUCTURE — بنية الأوردر الافتراضية
// ══════════════════════════════════════════
export function createOrderData(data, userId, userName) {
  const id = 'ORD-' + Date.now().toString().slice(-8);
  const now = nowStr();
  return {
    orderId: id,

    // العميل
    clientId:    data.clientId    || '',
    clientName:  data.clientName  || '',
    clientPhone: data.clientPhone || '',

    // المرحلة الحالية — مصدر الحقيقة الوحيد
    stage: 'design',
    designStage: ORDER_DESIGN_STAGES.PENDING,

    // أصحاب المراحل — يُعيَّن مالك المرحلة عند دخول الأوردر إليها
    designerId:   data.designerId   || '',
    designerName: data.designerName || '',
    printerId:    '',
    printerName:  '',
    productionAgent:     '',
    productionAgentName: '',
    shippingOfficerId:   '',
    shippingOfficerName: '',

    // طوابع زمن دخول كل مرحلة (لـ SLA tracking)
    stageEnteredAt: { design: now },
    designFiles:  [],
    designFileUrl:'',
    designFileNote: data.designFileNote || '',
    deadline:     data.deadline     || '',
    notes:        data.notes        || '',

    // المنتجات
    products: data.products || [],

    // المالية
    salePrice:     parseFloat(data.salePrice) || 0,
    deposit:       parseFloat(data.deposit)   || 0,
    totalPaid:     parseFloat(data.deposit)   || 0,
    remaining:     0,
    paymentStatus: 'pending',

    // التنفيذ
    costItems:    [],
    printAddons:  [],

    // الشحن
    shipMethod:    '',
    shipStage:     '',
    shipCompanyName: '',
    shipCost:      0,
    shipSettled:   false,

    // الشحن — PR-1 (scalable-drifting-ember) — additive defaults، لم يُستخدم بعد
    priceIncludesShipping: false,         // هل salePrice يشمل الشحن؟
    deliveryAddress:       null,          // {gov, city, area, street, landmark, notes}
    customerPhoneShip:     '',            // رقم تواصل التسليم (يفول back على clientPhone)
    shipPrepaid:           false,         // الشركة دفعتنا قبل التسليم
    returnedItems:         [],            // Array<{idx, qty, reason}> — partial returns
    partialReturnLoss:     0,             // تكلفة الجزء المرفوض

    // Timeline
    timeline: [{
      date:  now,
      stage: 'design',
      action:'🆕 تم إنشاء الأوردر',
      by:    userName,
      byId:  userId,
    }],

    // Metadata
    createdBy:     userId,
    createdByName: userName,
    createdAt:     null, // serverTimestamp مكان الـ caller
    updatedAt:     null,
  };
}

// ══════════════════════════════════════════
// VALIDATE STAGE REQUIREMENTS — شروط الانتقال للأمام
// ══════════════════════════════════════════
/**
 * يتحقق أن الأوردر مستوفي شروط الانتقال **من** المرحلة الحالية للتالية.
 *
 * يُفرّق بين:
 *  - errors:   مشاكل تمنع الانتقال نهائياً (data integrity)
 *  - warnings: ملاحظات يمكن تجاوزها بتأكيد المستخدم (مرونة للموظف)
 *
 * @returns { ok, errors[], warnings[] }
 */
export function validateStageRequirements(order, fromStage) {
  const errors = [];
  const warnings = [];
  if (!order) { return { ok:false, errors:['لا يوجد أوردر'], warnings }; }
  const stage = fromStage || order.stage;

  if (stage === 'design') {
    const hasFiles = !!(order.designFileUrl
                     || (order.designFiles && order.designFiles.length)
                     || (order.products || []).some(p => p.designImageUrl));
    if (!hasFiles) warnings.push('لم يُرفع ملف التصميم — يفضّل رفعه قبل الانتقال للطباعة');
    // 🔒 W1: لو CS علّم الأوردر "بانتظار التحويل" والباقي > 0 → بلوك صلب
    // (مُمَركَز هنا بدل تكرار الفحص في design.html — RULE V1.5)
    if (order.designStage === ORDER_DESIGN_STAGES.AWAITING_PAYMENT) {
      const sale = parseFloat(order.salePrice) || 0;
      const paid = parseFloat(order.totalPaid) || 0;
      const rem  = Math.max(0, sale - paid);
      if (rem > 0) errors.push(`يجب تحويل الباقي أولاً (${rem.toLocaleString('ar-EG')} ج)`);
    }
  }
  else if (stage === 'printing') {
    // إلزامي: صورة واحدة على الأقل على الأوردر أو على أحد المنتجات (يُقبل designImages[] أو designImageUrl)
    const productHasImg = (order.products || []).some(p =>
      (Array.isArray(p.designImages) && p.designImages.filter(Boolean).length > 0) ||
      !!p.designImageUrl
    );
    const orderHasImg = !!(order.designImageUrl
                        || order.printFinalUrl
                        || order.designFileUrl
                        || (order.designFiles && order.designFiles.length));
    if (!productHasImg && !orderHasImg) {
      errors.push('يجب رفع صورة واحدة على الأقل قبل التحويل للتنفيذ');
    }
  }
  else if (stage === 'production') {
    if (!(order.costItems || []).length) warnings.push('لم تُسجَّل تكاليف الأوردر — يفضّل تسجيلها قبل التحويل للشحن');
  }
  else if (stage === 'shipping') {
    // شحن → أرشيف
    const sale = parseFloat(order.salePrice) || 0;
    const paid = parseFloat(order.totalPaid) || parseFloat(order.paid) || 0;
    const rem  = Math.max(0, sale - paid);
    if (!(order.costItems || []).length) warnings.push('سجّل تكلفة الأوردر أولاً');
    if (rem > 0) warnings.push(`المتبقي ${rem} ج لم يُسوَّى — حصِّل أو سجّل المبلغ`);
    if (order.shipMethod === 'company' && !order.shipSettled) warnings.push('شركة الشحن لم تتم تسويتها');
    // المرتجع المعلَّق = خطأ صلب (يجب معالجته فعلاً قبل الأرشفة)
    if (order.shipStage === 'returned') errors.push('يوجد مرتجع لم تتم معالجته — اذهب لمعالجة المرتجع أولاً');
  }
  else if (stage === 'archived' || stage === 'cancelled') {
    errors.push('لا توجد مرحلة تالية');
  }

  return { ok: errors.length === 0 && warnings.length === 0, errors, warnings };
}

// ══════════════════════════════════════════
// BUILD STAGE ADVANCE — بناء تحديث الانتقال للأمام
// ══════════════════════════════════════════
/**
 * بيرجع spec التحديث المطلوب عمله للانتقال للمرحلة التالية.
 * **لا يتصل بقاعدة البيانات** — المُتَّصِل يكتب النتيجة في batch/updateDoc بنفسه.
 *
 * @param {Object}  args
 * @param {Object}  args.order            — وثيقة الأوردر الحالية
 * @param {string}  args.role             — دور المستخدم
 * @param {string}  args.userId           — uid المستخدم
 * @param {string}  args.userName         — اسم المستخدم
 * @param {Object} [args.extraFields]     — حقول إضافية تُكتب مع تغيير المرحلة
 * @param {string} [args.targetStage]     — مرحلة هدف صريحة (override، يحتاج admin)
 * @param {string} [args.nextAssigneeId]  — uid الموظف الذي يستلم المرحلة التالية
 * @param {string} [args.nextAssigneeName]— اسم الموظف المستلِم
 * @param {boolean}[args.bypassWarnings]  — تجاوز الـ warnings (بعد تأكيد المستخدم)
 * @returns { ok, newStage, errors, warnings, fields, timelineEntry }
 *   - errors:   مشاكل تمنع الانتقال نهائياً (data integrity)
 *   - warnings: ملاحظات يمكن تجاوزها بـ bypassWarnings:true
 */
export function buildStageAdvance({ order, role, userId, userName, extraFields = {}, targetStage = null, nextAssigneeId = '', nextAssigneeName = '', bypassWarnings = false }) {
  if (!order) return { ok:false, errors:['لا يوجد أوردر'], warnings:[] };
  const cur = order.stage || 'design';
  const stageConf = STAGES[cur];
  if (!stageConf) return { ok:false, errors:['مرحلة غير معروفة: ' + cur], warnings:[] };

  const target = targetStage || stageConf.next;
  if (!target) return { ok:false, errors:['لا توجد مرحلة تالية'], warnings:[] };
  if (!STAGES[target]) return { ok:false, errors:['مرحلة هدف غير معروفة: ' + target], warnings:[] };

  // فحص الصلاحية
  const allowed = STAGE_PERMISSIONS[cur] || [];
  const isAdmin = role === 'admin' || role === 'operation_manager';
  if (!isAdmin && !allowed.includes(role)) {
    return { ok:false, errors:['ليس لديك صلاحية تقديم هذه المرحلة'], warnings:[] };
  }

  // فحص الشروط (يتجاوزه admin لو حدد targetStage صراحة)
  if (!targetStage) {
    const v = validateStageRequirements(order, cur);
    // errors → bloc صلب
    if (v.errors.length > 0) return { ok:false, errors: v.errors, warnings: v.warnings };
    // warnings → يحتاج تأكيد المستخدم (bypassWarnings:true)
    if (v.warnings.length > 0 && !bypassWarnings) {
      return { ok:false, errors:[], warnings: v.warnings, needsConfirmation: true };
    }
  }

  const targetConf = STAGES[target];
  const now = nowStr();

  // ـ تعيين الموظف المستلم للمرحلة الجديدة (إن وُجد) ـ
  const ownership = STAGE_OWNERSHIP[target];
  const assigneeFields = {};
  if (ownership && nextAssigneeId) {
    assigneeFields[ownership.idField]   = nextAssigneeId;
    assigneeFields[ownership.nameField] = nextAssigneeName || '';
  }

  // ـ طابع زمن دخول المرحلة الجديدة ـ
  const enteredAtPath = `stageEnteredAt.${target}`;

  const fields = {
    stage: target,
    [enteredAtPath]: now,
    ...assigneeFields,
    ...extraFields,
  };

  // B1 (Phase 2): تهيئة shipStage عند الدخول لـ shipping (يسد فجوة G1).
  // الأوردر كان يدخل shipping بـ shipStage=null، فالـ UI يضطر لقراءة دفاعية
  // (o.shipStage || 'ready'). نكتب القيمة الافتراضية مرة واحدة هنا.
  // idempotent: لا نكتب فوق قيمة موجودة أو قيمة مرسلة في extraFields.
  if (target === 'shipping' && !order.shipStage && !('shipStage' in extraFields)) {
    fields.shipStage = SHIP_STAGES.READY;
  }

  // ـ سطر timeline يوضح الانتقال + المستلم لو معيَّن ـ
  const handoffSuffix = nextAssigneeName ? ` — تسليم إلى ${nextAssigneeName}` : '';
  const timelineEntry = {
    date:  now,
    stage: target,
    action: `${targetConf.ico} انتقل ${stageConf.label} → ${targetConf.label}${handoffSuffix}`,
    by:    userName || '',
    byId:  userId   || '',
    assigneeId:   nextAssigneeId   || '',
    assigneeName: nextAssigneeName || '',
  };

  return { ok:true, newStage: target, fields, timelineEntry };
}

// ══════════════════════════════════════════
// BUILD STAGE REVERT — بناء تحديث الرجوع لمرحلة سابقة
// ══════════════════════════════════════════
/**
 * يُرجع الأوردر لمرحلة سابقة بسبب موثَّق (مثلاً: التصميم يحتاج تعديل).
 * يتطلب admin/operation_manager أو دور صلاحية في المرحلة الهدف.
 *
 * @returns { ok, newStage, errors, fields, timelineEntry }
 */
export function buildStageRevert({ order, role, userId, userName, targetStage, reason = '', extraFields = {} }) {
  if (!order) return { ok:false, errors:['لا يوجد أوردر'] };
  const cur = order.stage || 'design';
  const stageConf = STAGES[cur];
  if (!stageConf) return { ok:false, errors:['مرحلة غير معروفة: ' + cur] };

  const target = targetStage || stageConf.prev;
  if (!target) return { ok:false, errors:['لا توجد مرحلة سابقة'] };
  if (!STAGES[target]) return { ok:false, errors:['مرحلة هدف غير معروفة: ' + target] };
  if (!reason || !reason.trim()) return { ok:false, errors:['يجب إدخال سبب الإرجاع'] };

  // الصلاحية: admin/ops دائماً، أو من له دور في المرحلة الهدف (يستلم العمل من جديد)
  const isAdmin = role === 'admin' || role === 'operation_manager';
  const targetAllowed = STAGE_PERMISSIONS[target] || [];
  if (!isAdmin && !targetAllowed.includes(role)) {
    return { ok:false, errors:['ليس لديك صلاحية إرجاع الأوردر'] };
  }

  const targetConf = STAGES[target];
  const fields = {
    stage: target,
    ...extraFields,
  };
  const timelineEntry = {
    date:  nowStr(),
    stage: target,
    action: `↩️ ارتداد ${stageConf.label} → ${targetConf.label} — ${reason.trim()}`,
    by:    userName || '',
    byId:  userId   || '',
  };

  return { ok:true, newStage: target, fields, timelineEntry };
}

// ══════════════════════════════════════════
// BUILD ARCHIVE SPEC — بناء تحديث الأرشفة (مُمَركَز — RULE C1.3 + C1.5)
// ══════════════════════════════════════════
/**
 * بناء spec أرشفة موحَّد لكل المسارات (production, shipping, bulk admin).
 * دالة نقية: لا تكتب في Firestore — تُرجع spec يستخدمه الـ caller داخل updateDoc/batch.
 *
 * الفحوصات المُوحَّدة:
 *   1. الأوردر مش مؤرشف بالفعل (error)
 *   2. الصلاحية: admin/operation_manager دائماً، أو دور مرحلة حالية في STAGE_PERMISSIONS (error)
 *   3. الدفع كامل: remaining<=0 أو paymentStatus ∈ {paid,returned,refunded} (error)
 *   4. لو cur==='shipping' و shipMethod==='company' → shipSettled=true (error)
 *   5. costItems موجودة → warning قابل للتجاوز عبر bypassWarnings:true
 *
 * @param  source   مصدر الأرشفة: 'shipping' | 'production' | 'bulk_admin' | 'status_change' | 'manual'
 * @returns { ok, errors, warnings, fields, timelineEntry, needsConfirmation }
 */
export function buildArchiveSpec({
  order,
  role,
  userId,
  userName,
  reason = '',
  source = 'manual',
  bypassWarnings = false,
  extraFields = {},
}) {
  if (!order) return { ok:false, errors:['لا يوجد أوردر'], warnings:[] };

  const cur = order.stage || 'design';

  // 1. مش مؤرشف بالفعل
  if (cur === 'archived') {
    return { ok:false, errors:['الأوردر مؤرشف بالفعل'], warnings:[] };
  }

  // 2. الصلاحية
  const isAdmin = role === 'admin' || role === 'operation_manager';
  const currentAllowed = STAGE_PERMISSIONS[cur] || [];
  if (!isAdmin && !currentAllowed.includes(role)) {
    return { ok:false, errors:['ليس لديك صلاحية أرشفة هذا الأوردر'], warnings:[] };
  }

  const errors = [];
  const warnings = [];

  // 3. الدفع كامل
  const rem = parseFloat(order.remaining) || 0;
  const ps  = (order.paymentStatus || '').toLowerCase();
  if (rem > 0 && !['paid','returned','refunded'].includes(ps)) {
    errors.push(`متبقّي ${rem.toLocaleString('ar-EG')} ج — حصّل أو ارجع المبلغ أولاً`);
  }

  // 4. تسوية شركة الشحن (لو في الشحن via company)
  if (cur === 'shipping' && order.shipMethod === 'company' && !order.shipSettled) {
    errors.push('لازم تسوّي شركة الشحن قبل الأرشفة');
  }

  // 5. costItems → warning
  if (!(order.costItems || []).length) {
    warnings.push('لا توجد بنود تكلفة مسجلة');
  }

  // إن وُجدت errors → بلوك صلب
  if (errors.length) {
    return { ok:false, errors, warnings, needsConfirmation:false };
  }

  // إن وُجدت warnings ولم يتم التجاوز → يحتاج تأكيد المستخدم
  if (warnings.length && !bypassWarnings) {
    return { ok:false, errors:[], warnings, needsConfirmation:true };
  }

  // ─ بناء الـ fields ─
  const now = nowStr();

  // shipStage: ضع 'completed' لو الأوردر من الشحن (لتوحيد السلوك مع shipping.html الحالي)
  const shipStageUpdate = {};
  if (cur === 'shipping') {
    shipStageUpdate.shipStage = 'completed';
  }

  const fields = {
    stage: 'archived',
    'stageEnteredAt.archived': now,
    archivedAt:     now,
    archivedBy:     userId || '',
    archivedByName: userName || '',
    archivedFrom:   cur,
    archiveSource:  source,
    archiveReason:  reason || '',
    ...shipStageUpdate,
    ...extraFields,
  };

  // ─ timeline entry ─
  const sourceLabel = {
    bulk_admin:    '[أدمن] أرشفة جماعية',
    shipping:      'أرشفة بعد إتمام الشحن',
    production:    'أرشفة يدوية بعد مراجعة التكلفة',
    status_change: '[أدمن] تغيير الحالة → أرشيف',
    manual:        'أرشفة يدوية',
  }[source] || 'أرشفة';

  const reasonSuffix = reason ? ` — ${reason}` : '';
  const timelineEntry = {
    date:   now,
    stage:  'archived',
    action: `📁 ${sourceLabel}${reasonSuffix}`,
    by:     userName || '',
    byId:   userId   || '',
  };

  return { ok:true, errors:[], warnings, fields, timelineEntry, needsConfirmation:false };
}

// ══════════════════════════════════════════
// CENTRAL VALIDATORS — RULE V1 (Central Validation)
// ══════════════════════════════════════════
// Pure validators تُرجع {ok, errors, warnings} — لا تكتب في Firestore.
// الـ caller يقرّر بناءً على النتيجة.
// تستخدم نفس قواعد التحقق الداخلية المستخدَمة في build*Spec — لا تكرار.

/**
 * validatePayment — التحقق من صحة دفعة قبل تسجيلها (RULE V1.3)
 *
 * @param {Object} args
 * @param {Object} args.order   — الأوردر المستهدف
 * @param {number} args.amount  — قيمة الدفعة
 * @param {string} args.source  — 'customer' | 'refund' | 'discount' (افتراضي: 'customer')
 * @param {string} args.role    — دور المستخدم
 * @returns { ok, errors, warnings }
 */
export function validatePayment({ order, amount, source = 'customer', role }) {
  const errors = [];
  const warnings = [];

  if (!order) return { ok:false, errors:['لا يوجد أوردر'], warnings:[] };

  const amt = parseFloat(amount) || 0;
  if (amt <= 0) errors.push('قيمة الدفعة يجب أن تكون أكبر من صفر');

  // الأوردر يقبل دفعات؟
  const cur = order.stage || 'design';
  if (cur === 'cancelled') errors.push('لا يمكن تسجيل دفعة على أوردر ملغي');

  // overpayment للدفعات العميل
  if (source === 'customer' && amt > 0) {
    const sale = parseFloat(order.salePrice) || 0;
    const paid = parseFloat(order.totalPaid) || 0;
    const remaining = Math.max(0, sale - paid);
    if (amt > remaining && remaining >= 0) {
      warnings.push(`الدفعة أكبر من المتبقّي (${remaining.toLocaleString('ar-EG')} ج)`);
    }
  }

  // الصلاحية
  if (role) {
    const allowedRoles = source === 'refund'
      ? ['admin','operation_manager','wallet_manager']
      : ['admin','operation_manager','customer_service','wallet_manager'];
    if (!allowedRoles.includes(role)) {
      errors.push(`ليس لديك صلاحية تسجيل ${source === 'refund' ? 'استرداد' : 'دفعة'}`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * validateRefund — التحقق من صحة عملية استرداد (RULE V1.3)
 *
 * @returns { ok, errors, warnings }
 */
export function validateRefund({ order, amount, role }) {
  const errors = [];
  const warnings = [];

  if (!order) return { ok:false, errors:['لا يوجد أوردر'], warnings:[] };

  const amt = parseFloat(amount) || 0;
  if (amt <= 0) errors.push('قيمة الاسترداد يجب أن تكون أكبر من صفر');

  const paid = parseFloat(order.totalPaid) || 0;
  if (amt > paid) {
    errors.push(`الاسترداد (${amt.toLocaleString('ar-EG')}) أكبر من المدفوع (${paid.toLocaleString('ar-EG')} ج)`);
  }

  // refund warning لو الأوردر في مرحلة لم تكتمل
  const cur = order.stage || 'design';
  if (cur !== 'archived' && cur !== 'shipping') {
    warnings.push('الأوردر ليس في مرحلة الشحن/الأرشيف — استرداد مبكر');
  }

  // الصلاحية
  if (role && !['admin','operation_manager','wallet_manager'].includes(role)) {
    errors.push('ليس لديك صلاحية تسجيل استرداد');
  }

  return { ok: errors.length === 0, errors, warnings };
}

// ═══════════════════════════════════════════════════════════════════
// SHIPPING VALIDATORS — RULE V1.3 (Shipping Stabilization Step 1)
// ═══════════════════════════════════════════════════════════════════
// Pure functions. No Firestore reads, no side effects. Each returns
// { ok, errors[], warnings[] } so the caller can:
//   - block on errors (toast the first one)
//   - request user confirmation on warnings (bypassWarnings:true)
//   - present a unified message set across pages
//
// These mirror the existing validatePayment/validateRefund pattern and
// are intended to replace the inline checks currently duplicated across
// shipping.html, shipping-followup.html, and shipping-accounts.html.

const SHIPPING_DISPATCH_ROLES = ['admin', 'operation_manager', 'shipping_officer'];
const SHIPPING_COLLECT_ROLES  = ['admin', 'operation_manager', 'shipping_officer', 'wallet_manager'];
const SHIPPING_SETTLE_ROLES   = ['admin', 'operation_manager', 'shipping_officer', 'wallet_manager'];
const SHIPPING_RETURN_ROLES   = ['admin', 'operation_manager', 'shipping_officer', 'wallet_manager'];

/**
 * validateDispatch — التحقق من تسليم أوردر لشركة شحن (مرحلة الشحن)
 *
 * @param {Object} args
 * @param {Object} args.order        — الأوردر المستهدف
 * @param {string} args.companyId    — معرّف شركة الشحن
 * @param {string} args.method       — 'company' | 'pickup' | 'courier' | 'prepaid'
 * @param {number} args.cost         — تكلفة الشحن
 * @param {string} [args.walletId]   — محفظة الخصم (لو cost>0)
 * @param {string} [args.role]       — دور المستخدم
 * @returns { ok, errors, warnings }
 */
export function validateDispatch({ order, companyId, method, cost, walletId, role }) {
  const errors = [];
  const warnings = [];

  if (!order) return { ok: false, errors: ['لا يوجد أوردر'], warnings: [] };

  if (order.stage === 'archived')           errors.push('⛔ الأوردر مؤرشف');
  if (order.stage === 'cancelled')          errors.push('⛔ الأوردر ملغي');
  if (order.shipStage === 'returned')       errors.push('⛔ الأوردر مرتجع');

  // Pickup (استلام من المطبعة) doesn't need a shipping company — العميل بيستلم
  // من المطبعة مباشرة. Only require company for methods that involve one.
  const needsCompany = method !== 'pickup';
  if (needsCompany && !companyId) errors.push('⚠️ اختر شركة الشحن');
  const amt = parseFloat(cost) || 0;
  if (amt < 0) errors.push('⚠️ التكلفة غير صالحة');

  // prepaid method requires wallet to debit from
  if (method === 'prepaid' && amt > 0 && !walletId) {
    errors.push('⚠️ مدفوع مسبقاً: اختر محفظة الخصم');
  }

  // Soft warning: cost>0 without wallet (caller may proceed but skips expense recording)
  if (amt > 0 && !walletId && method !== 'prepaid') {
    warnings.push('لا توجد محفظة محددة — التكلفة لن تُسجَّل كمصروف الآن');
  }

  if (role && !SHIPPING_DISPATCH_ROLES.includes(role)) {
    errors.push('ليس لديك صلاحية تسليم الأوردر للشحن');
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * validateCollect — التحقق من تحصيل مبلغ من العميل (pickup/courier فقط).
 * شحنات الشركات (company) تُسوَّى عبر validateSettle بدل التحصيل المباشر.
 *
 * @param {Object} args
 * @param {Object} args.order      — الأوردر
 * @param {number} args.amount     — المبلغ المراد تحصيله
 * @param {string} args.walletId   — المحفظة المُودَع فيها
 * @param {number} args.remaining  — المتبقّي على الأوردر (محسوب مسبقاً)
 * @param {string} [args.role]
 * @returns { ok, errors, warnings }
 */
export function validateCollect({ order, amount, walletId, remaining, role }) {
  const errors = [];
  const warnings = [];

  if (!order) return { ok: false, errors: ['⚠️ الأوردر غير موجود'], warnings: [] };

  if (order.stage === 'archived')        errors.push('⛔ الأوردر مغلق');
  if (order.shipStage === 'returned')    errors.push('⛔ الأوردر مرتجع');
  if (order.shipSettled === true)        errors.push('⛔ مسوّى مع شركة الشحن — ألغِ التسوية أولاً');
  if (order.shipMethod === 'company')    errors.push('⛔ شحنات الشركات تتم تسويتها من "📦 حسابات الشحن" فقط');

  const amt = parseFloat(amount) || 0;
  if (amt <= 0) errors.push('⚠️ أدخل المبلغ');
  if (!walletId) errors.push('⚠️ اختر طريقة الدفع');

  const rem = parseFloat(remaining);
  if (Number.isFinite(rem) && amt > rem + 0.01) {
    errors.push(`⚠️ المبلغ (${amt.toLocaleString('ar-EG')} ج) أكبر من المتبقّي (${rem.toLocaleString('ar-EG')} ج)`);
  }

  if (role && !SHIPPING_COLLECT_ROLES.includes(role)) {
    errors.push('ليس لديك صلاحية تحصيل دفعة');
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * validateCompanyCollect — التحقق من "تأكيد التحصيل" لشحنة شركة (Step 1.2).
 * هذا marker فقط — العميل دفع للشركة (CoD)، الفلوس لسه ما دخلتش محفظتنا.
 * الدخول الفعلي للمحفظة يحصل عبر validateSettle لاحقاً.
 *
 * الفرق عن validateCollect: لا يلزم walletId، لا يطبّق سقف remaining،
 * ويتطلب صراحةً shipMethod === 'company'.
 *
 * Settle-Fix #5 enhancement: warnings for amount-vs-expected drift.
 * الـ amount اللي بيدخله الموظف يجب يكون قريب من المتوقع من العميل.
 * لو فرق كبير → warning (مش error) — قد يكون typo أو حالة حقيقية تحتاج توثيق.
 *
 * @param {Object} args
 * @param {Object} args.order              — الأوردر
 * @param {number} args.amount             — المبلغ المُحصَّل (>=0)
 * @param {number} [args.expectedFromCustomer] — المتوقَّع من العميل (عادة = order.remaining).
 *                                              لو غير محدد، يُحسب من الـ order.
 * @param {string} [args.role]
 * @returns { ok, errors, warnings }
 */
export function validateCompanyCollect({ order, amount, expectedFromCustomer, role }) {
  const errors = [];
  const warnings = [];

  if (!order) return { ok: false, errors: ['⚠️ الأوردر غير موجود'], warnings: [] };

  if (order.stage === 'archived')        errors.push('⛔ الأوردر مغلق');
  if (order.stage === 'cancelled')       errors.push('⛔ الأوردر ملغي');
  if (order.shipStage === 'returned')    errors.push('⛔ الأوردر مرتجع');
  if (order.shipSettled === true)        errors.push('⛔ مسوّى مع شركة الشحن بالفعل');

  // هذا الـ marker مخصّص لشحنات الشركات فقط.
  // pickup/courier يستخدم validateCollect (يدخل المحفظة فوراً).
  if (order.shipMethod && order.shipMethod !== 'company') {
    errors.push('⛔ هذا الـ marker لشحنات الشركات فقط — استخدم تحصيل المحفظة لـ pickup/courier');
  }

  const amt = parseFloat(amount);
  if (!Number.isFinite(amt) || amt < 0) {
    errors.push('⚠️ المبلغ غير صالح');
  }

  if (role && !SHIPPING_COLLECT_ROLES.includes(role)) {
    errors.push('ليس لديك صلاحية تأكيد التحصيل');
  }

  // Warnings on drift between operator-entered amount and customer's
  // remaining balance. The "expected from customer" defaults to:
  //   salePrice + customerShipFee − discount − totalPaid
  // i.e. what the customer owes us at the moment of collect.
  if (Number.isFinite(amt) && amt >= 0 && errors.length === 0) {
    let expected = parseFloat(expectedFromCustomer);
    if (!Number.isFinite(expected)) {
      const sale = parseFloat(order.salePrice) || 0;
      const cust = parseFloat(order.customerShipFee) || 0;
      const disc = parseFloat(order.discount) || 0;
      const paid = parseFloat(order.totalPaid) || parseFloat(order.deposit) || 0;
      expected = Math.max(0, sale + cust - disc - paid);
    }
    const diff = amt - expected;
    const absDiff = Math.abs(diff);
    if (expected > 0 && absDiff > 0.5) {
      const fmt = (n) => n.toLocaleString('ar-EG', { maximumFractionDigits: 0 });
      if (amt > expected) {
        warnings.push(`⚠️ المبلغ (${fmt(amt)} ج) أكبر من المتوقع من العميل (${fmt(expected)} ج) بـ ${fmt(absDiff)} ج — تأكد أن الرقم صحيح`);
      } else {
        warnings.push(`⚠️ المبلغ (${fmt(amt)} ج) أقل من المتوقع (${fmt(expected)} ج) بـ ${fmt(absDiff)} ج — الشركة قصّرت في التحصيل، سيُسجَّل العجز على العميل`);
      }
    }
    if (amt === 0 && expected > 0) {
      warnings.push(`⚠️ صفر تحصيل — هل الشركة لم تحصِّل شيئاً؟ المتوقع كان ${expected.toLocaleString('ar-EG', { maximumFractionDigits: 0 })} ج`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * validateSettle — التحقق من تسوية مع شركة شحن (bulk أو single-order).
 * الـ optimistic lock الفعلي يُفرَض داخل runTransaction في
 * shipping-accounts.html:saveSettle. هذا الـ validator هو UX guard.
 *
 * @param {Object} args
 * @param {Array<Object>} args.orders     — الأوردرات المختارة (بعد التحقق من snapshot الـ cache)
 * @param {number} args.amount            — المبلغ الفعلي المُستلَم
 * @param {number} args.expectedAmount    — المبلغ المتوقَّع (sum of dueByCo)
 * @param {string} args.walletId          — المحفظة المُودَع فيها
 * @param {string} [args.diffReason]      — سبب الفرق (لو فيه فرق)
 * @param {string} [args.diffNote]        — ملاحظة الفرق (للسبب 'other')
 * @param {string} [args.role]
 * @returns { ok, errors, warnings }
 */
export function validateSettle({ orders, amount, expectedAmount, walletId, diffReason, diffNote, role }) {
  const errors = [];
  const warnings = [];

  const amt = parseFloat(amount);
  const expected = parseFloat(expectedAmount) || 0;
  // No-op close (UX fix): when expected from the company is 0 (because the
  // customer paid us directly, or it's a free/internal shipment), allow a
  // 0-amount settle to formally close the order without money flow. The
  // wallet is still required for the audit field (shipSettledWalletId).
  const isNoopClose = (amt === 0 && expected === 0);
  if (!isNoopClose && !(amt > 0)) errors.push('⚠️ أدخل المبلغ الوارد');
  if (!walletId) errors.push('⚠️ اختر المحفظة');
  if (!Array.isArray(orders) || !orders.length) {
    errors.push('⚠️ اختر أوردر واحد على الأقل');
  }

  const diff = Number.isFinite(amt) ? (amt - expected) : 0;
  if (Math.abs(diff) > 0.01 && !diffReason) {
    errors.push('⚠️ يوجد فرق بين المبلغ والأوردرات — حدد سبب الفرق');
  }
  if (diffReason === 'other' && (!diffNote || diffNote.trim().length < 5)) {
    errors.push('⚠️ اكتب ملاحظة سبب الفرق (≥ 5 أحرف)');
  }

  // UX guard: pre-flight check against the cache. The atomic enforcement
  // lives inside runTransaction at shipping-accounts.html:saveSettle.
  const settled = (orders || []).filter(o => o && o.shipSettled === true);
  if (settled.length) {
    errors.push(`⛔ ${settled.length} أوردر مسوّى بالفعل — أعد فتح الشاشة`);
  }

  // Returned orders cannot enter a settlement batch
  const returned = (orders || []).filter(o => o && o.shipStage === 'returned');
  if (returned.length) {
    errors.push(`⛔ ${returned.length} أوردر مرتجع — لا يدخل في التسوية`);
  }

  if (Math.abs(diff) > 0.01) {
    const sign = diff > 0 ? '+' : '';
    warnings.push(`فرق ${sign}${diff.toLocaleString('ar-EG')} ج عن المتوقع`);
  }

  if (role && !SHIPPING_SETTLE_ROLES.includes(role)) {
    errors.push('ليس لديك صلاحية تنفيذ التسوية');
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * validateReturn — التحقق من تسجيل مرتجع.
 *
 * @param {Object} args
 * @param {Object} args.order        — الأوردر
 * @param {string} args.reason       — مفتاح السبب (e.g. 'damaged', 'wrong_design', 'other')
 * @param {string} args.lossParty    — 'client' | 'company' | 'shipper'
 * @param {number} args.cost         — تكلفة الخسارة (≥ 0)
 * @param {string} [args.returnType] — 'full' | 'partial' (افتراضي: 'full')
 * @param {string} [args.note]       — ملاحظة (إلزامية لو reason='other')
 * @param {string} [args.role]
 * @returns { ok, errors, warnings }
 */
export function validateReturn({ order, reason, lossParty, cost, returnType = 'full', note = '', role }) {
  const errors = [];
  const warnings = [];

  if (!order) return { ok: false, errors: ['⚠️ اختر أوردر'], warnings: [] };

  if (order.stage === 'cancelled') errors.push('⛔ الأوردر ملغي');
  if (order.shipStage === 'returned' && returnType === 'full') {
    errors.push('⛔ الأوردر مرتجع بالفعل');
  }

  if (!reason)    errors.push('⚠️ اختر سبب المرتجع');
  if (!lossParty) errors.push('⚠️ حدد من يتحمل الخسارة');

  const lossAmt = parseFloat(cost) || 0;
  if (lossAmt < 0) errors.push('⚠️ تكلفة المرتجع غير صالحة');

  if (reason === 'other' && note.trim().length < 5) {
    errors.push('⚠️ اكتب ملاحظة سبب المرتجع (≥ 5 أحرف)');
  }

  if (!['full', 'partial'].includes(returnType)) {
    errors.push('⚠️ نوع المرتجع غير صالح');
  }

  if (returnType === 'full' && order.shipSettled === true) {
    warnings.push('الأوردر مسوّى — المرتجع سيُلغي التسوية');
  }

  if (role && !SHIPPING_RETURN_ROLES.includes(role)) {
    errors.push('ليس لديك صلاحية تسجيل مرتجع');
  }

  return { ok: errors.length === 0, errors, warnings };
}

// ══════════════════════════════════════════
// SHIPPING VALIDATORS — PR-2 (scalable-drifting-ember)
// Additive — لم تُستخدم بعد من الـ UI. PR-3 يبني الـ actions المركزية فوقها.
// كلها تستخدم normalizeShipStage داخلياً → تقبل القيم القديمة والجديدة.
// ══════════════════════════════════════════

/**
 * validatePrepareShipping — التحقق من تجهيز أوردر للشحن.
 * الـ caller يحضّر فيه: العنوان، طريقة الشحن، التكلفة، رقم تواصل التسليم.
 *
 * @param {Object} args
 * @param {Object} args.order            — الأوردر المستهدف
 * @param {string} args.shipMethod       — 'company' | 'pickup' | 'courier'
 * @param {string} [args.shipCompanyName]
 * @param {Object} [args.deliveryAddress]— {gov, city, area, street, landmark, notes}
 * @param {number} [args.customerShipFee]— رسم الشحن المُحمَّل على العميل
 * @param {boolean}[args.priceIncludesShipping] — هل salePrice يشمل الشحن؟
 * @param {string} [args.role]
 * @returns { ok, errors, warnings }
 */
export function validatePrepareShipping({
  order, shipMethod, shipCompanyName, deliveryAddress,
  customerShipFee, priceIncludesShipping, role,
}) {
  const errors = [];
  const warnings = [];

  if (!order) return { ok: false, errors: ['لا يوجد أوردر'], warnings: [] };
  if (order.stage === 'archived')      errors.push('⛔ الأوردر مؤرشف');
  if (order.stage === 'cancelled')     errors.push('⛔ الأوردر ملغي');
  const ss = normalizeShipStage(order.shipStage);
  if (ss === 'returned_full')          errors.push('⛔ الأوردر مرتجع');

  if (!shipMethod) errors.push('⚠️ اختر طريقة الشحن');
  const validMethods = ['company', 'pickup', 'courier'];
  if (shipMethod && !validMethods.includes(shipMethod)) {
    errors.push('⚠️ طريقة شحن غير صالحة');
  }

  // pickup لا يحتاج عنوان أو شركة — العميل يستلم من المحل
  if (shipMethod && shipMethod !== 'pickup') {
    if (!deliveryAddress?.gov) errors.push('⚠️ اختر المحافظة');
    if (shipMethod === 'company' && !shipCompanyName) {
      errors.push('⚠️ اختر شركة الشحن');
    }
  }

  const fee = parseFloat(customerShipFee) || 0;
  if (fee < 0) errors.push('⚠️ رسم الشحن غير صالح');
  if (priceIncludesShipping === true && fee > 0) {
    errors.push('⛔ السعر شامل الشحن — لا يجوز customerShipFee > 0');
  }

  if (role && !SHIPPING_DISPATCH_ROLES.includes(role)) {
    errors.push('ليس لديك صلاحية تجهيز الشحن');
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * validateMarkDelivered — التحقق من "تم التسليم" (shipped → delivered).
 * pickup يدخل delivered مباشرة من ready عبر confirmShipped — هذا الـ
 * validator لطريقة company/courier فقط.
 *
 * @param {Object} args
 * @param {Object} args.order
 * @param {string} [args.role]
 * @returns { ok, errors, warnings }
 */
export function validateMarkDelivered({ order, role }) {
  const errors = [];
  const warnings = [];

  if (!order) return { ok: false, errors: ['لا يوجد أوردر'], warnings: [] };
  if (order.stage === 'archived')   errors.push('⛔ الأوردر مؤرشف');
  if (order.stage === 'cancelled')  errors.push('⛔ الأوردر ملغي');

  const ss = normalizeShipStage(order.shipStage);
  if (ss === 'returned_full' || ss === 'returned_partial') {
    errors.push('⛔ الأوردر مرتجع');
  }
  if (ss !== 'shipped') {
    errors.push(`⛔ الأوردر ليس في مرحلة "تم الشحن" (الحالة: ${ss})`);
  }

  if (order.shipMethod === 'pickup') {
    errors.push('⛔ pickup يدخل "تم التسليم" مباشرة من confirmShipped');
  }

  if (role && !SHIPPING_DISPATCH_ROLES.includes(role)) {
    errors.push('ليس لديك صلاحية تأكيد التسليم');
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * validatePartialReturn — التحقق من تسجيل مرتجع جزئي.
 * الـ partial return يقلّل من salePrice ويُسجّل خسارة جزئية، مع إبقاء
 * الأوردر في حالة `returned_partial` (لا يقفل الأوردر).
 *
 * @param {Object} args
 * @param {Object} args.order
 * @param {Array<{idx:number,qty:number,reason?:string}>} args.items
 * @param {number} args.lossCost              — تكلفة الجزء المرفوض (≥ 0)
 * @param {number} args.salePriceDelta        — مقدار خصم salePrice (≥ 0)
 * @param {string} args.reason                — سبب المرتجع
 * @param {string} args.lossParty             — 'client' | 'company' | 'shipper'
 * @param {string} [args.note]
 * @param {string} [args.role]
 * @returns { ok, errors, warnings }
 */
export function validatePartialReturn({
  order, items, lossCost, salePriceDelta, reason, lossParty, note = '', role,
}) {
  const errors = [];
  const warnings = [];

  if (!order) return { ok: false, errors: ['لا يوجد أوردر'], warnings: [] };
  if (order.stage === 'archived')   errors.push('⛔ الأوردر مؤرشف');
  if (order.stage === 'cancelled')  errors.push('⛔ الأوردر ملغي');

  const ss = normalizeShipStage(order.shipStage);
  if (ss === 'returned_full') {
    errors.push('⛔ الأوردر مرتجع كامل — لا يقبل مرتجع جزئي');
  }
  // المرتجع الجزئي مسموح فقط بعد التسليم
  const allowedStages = ['delivered', 'under_collection', 'collected', 'returned_partial'];
  if (!allowedStages.includes(ss)) {
    errors.push(`⛔ المرتجع الجزئي مسموح بعد التسليم فقط (الحالة الحالية: ${ss})`);
  }

  // items
  if (!Array.isArray(items) || !items.length) {
    errors.push('⚠️ اختر منتجاً واحداً على الأقل للمرتجع');
  } else {
    const products = order.products || [];
    items.forEach((it, i) => {
      if (!it || typeof it.idx !== 'number') {
        errors.push(`⚠️ المنتج #${i + 1}: فهرس غير صالح`);
        return;
      }
      if (it.idx < 0 || it.idx >= products.length) {
        errors.push(`⚠️ المنتج #${i + 1}: فهرس خارج النطاق (${it.idx})`);
        return;
      }
      const origQty = parseFloat(products[it.idx]?.qty) || 0;
      const retQty  = parseFloat(it.qty) || 0;
      if (retQty <= 0) errors.push(`⚠️ المنتج #${i + 1}: الكمية يجب أن تكون > 0`);
      // accumulate previous partial returns on same idx
      const prevRet = (order.returnedItems || [])
        .filter(p => p && p.idx === it.idx)
        .reduce((s, p) => s + (parseFloat(p.qty) || 0), 0);
      if (retQty + prevRet > origQty + 0.001) {
        errors.push(`⚠️ المنتج #${i + 1}: مجموع المرتجع (${retQty + prevRet}) > الكمية الأصلية (${origQty})`);
      }
    });
  }

  const loss = parseFloat(lossCost);
  if (!Number.isFinite(loss) || loss < 0) errors.push('⚠️ تكلفة الخسارة غير صالحة');
  const delta = parseFloat(salePriceDelta);
  if (!Number.isFinite(delta) || delta < 0) errors.push('⚠️ خصم السعر غير صالح');

  const sale = parseFloat(order.salePrice) || 0;
  if (Number.isFinite(delta) && delta > sale + 0.01) {
    errors.push(`⚠️ خصم السعر (${delta}) أكبر من salePrice (${sale})`);
  }

  if (!reason)    errors.push('⚠️ اختر سبب المرتجع');
  if (!lossParty) errors.push('⚠️ حدد من يتحمل الخسارة');
  if (reason === 'other' && (note || '').trim().length < 5) {
    errors.push('⚠️ اكتب ملاحظة سبب المرتجع (≥ 5 أحرف)');
  }

  if (role && !SHIPPING_RETURN_ROLES.includes(role)) {
    errors.push('ليس لديك صلاحية تسجيل مرتجع');
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * validateReverseSettle — التحقق من إلغاء تسوية مع شركة الشحن.
 * يُستخدم قبل reverseSettlement action (PR-3).
 *
 * @param {Object} args
 * @param {Object} args.order
 * @param {string} [args.role]
 * @returns { ok, errors, warnings }
 */
export function validateReverseSettle({ order, role }) {
  const errors = [];
  const warnings = [];

  if (!order) return { ok: false, errors: ['لا يوجد أوردر'], warnings: [] };

  if (order.shipSettled !== true) {
    errors.push('⛔ الأوردر غير مسوّى — لا شيء لإلغائه');
  }
  if (order.stage === 'cancelled') errors.push('⛔ الأوردر ملغي');

  const ss = normalizeShipStage(order.shipStage);
  if (ss === 'returned_full') {
    warnings.push('الأوردر مرتجع كامل — إلغاء التسوية سيُعيد المالية للحالة قبل الـ return');
  }
  if (order.stage === 'archived') {
    warnings.push('الأوردر مؤرشف — إلغاء التسوية سيُلغي الأرشفة أيضاً');
  }

  if (role && !SHIPPING_SETTLE_ROLES.includes(role)) {
    errors.push('ليس لديك صلاحية إلغاء التسوية');
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * validateCostItem — التحقق من صحة بند تكلفة قبل تسجيله (RULE V1.3)
 *
 * يُستخدم من orderActions.recordCostItem ومن addCostFromPanel في
 * production.html. يفحص: نوع البند، الإجمالي، الـ stage، الصلاحية،
 * ورصيد المحفظة (لو طُلب خصم وليس edit).
 *
 * @param {Object} args
 * @param {Object} args.order            — الأوردر المستهدف
 * @param {Object} args.payload          — { type, total, supplierId, supplierName, note, walletId, paperMeta, isExternal }
 * @param {string} args.role             — دور المستخدم
 * @param {Array}  [args.wallets=[]]     — قائمة المحافظ (للتحقق من الرصيد)
 * @param {boolean}[args.isEdit=false]   — هل العملية تعديل بند موجود؟
 * @returns { ok, errors, warnings }
 */
export function validateCostItem({ order, payload, role, wallets = [], isEdit = false }) {
  const errors = [];
  const warnings = [];

  if (!order) return { ok:false, errors:['لا يوجد أوردر'], warnings:[] };
  if (!payload) return { ok:false, errors:['بيانات البند ناقصة'], warnings:[] };

  const { type = '', total, walletId = '', supplierId = '' } = payload;
  const amt = parseFloat(total) || 0;

  // النوع
  if (!type || !type.trim()) errors.push('اختر نوع البند');

  // المبلغ
  if (amt <= 0) errors.push('أدخل تكلفة صحيحة');

  // الـ stage
  const cur = order.stage || '';
  if (cur === 'cancelled') errors.push('لا يمكن تسجيل تكلفة على أوردر ملغي');

  // الصلاحية — admin, operation_manager, production_agent
  if (role && !['admin', 'operation_manager', 'production_agent'].includes(role)) {
    errors.push('ليس لديك صلاحية تسجيل بنود تكلفة');
  }

  // خصم محفظة: تحقق من الرصيد
  if (walletId && !isEdit) {
    const w = wallets.find(x => x._id === walletId);
    if (!w) {
      errors.push('المحفظة المختارة غير موجودة');
    } else {
      const bal = parseFloat(w.balance) || 0;
      if (bal < amt) {
        errors.push(`رصيد ${w.name} غير كافٍ (${bal.toLocaleString('ar-EG')} ج)`);
      }
    }
  }

  // تحذير: بند خارجي بدون مورد
  if (payload.isExternal && !supplierId && !errors.length) {
    warnings.push('بند خارجي بدون مورد محدد');
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * validateOrder — التحقق من بيانات إنشاء أوردر جديد (RULE V1.3)
 *
 * @param {Object} orderData — بيانات الأوردر قبل الحفظ
 * @returns { ok, errors, warnings }
 */
export function validateOrder(orderData) {
  const errors = [];
  const warnings = [];

  if (!orderData) return { ok:false, errors:['لا توجد بيانات أوردر'], warnings:[] };

  // العميل
  if (!orderData.clientId) errors.push('clientId مطلوب');
  if (!orderData.clientName) warnings.push('clientName فارغ');

  // المنتجات
  const products = orderData.products || [];
  if (!Array.isArray(products) || products.length === 0) {
    errors.push('يجب أن يحتوي الأوردر على منتج واحد على الأقل');
  }

  // السعر
  const sale = parseFloat(orderData.salePrice) || 0;
  if (sale <= 0) errors.push('salePrice يجب أن يكون أكبر من صفر');

  // الدفعة المقدّمة
  const paid = parseFloat(orderData.totalPaid) || 0;
  if (paid < 0) errors.push('totalPaid لا يمكن أن يكون سالباً');
  if (paid > sale && sale > 0) warnings.push('totalPaid أكبر من salePrice');

  // المرحلة
  const stage = orderData.stage || 'design';
  if (!STAGES[stage]) errors.push(`stage غير معروف: ${stage}`);

  return { ok: errors.length === 0, errors, warnings };
}

// ══════════════════════════════════════════
// FINANCIAL CALCULATIONS
// ══════════════════════════════════════════
export function calcOrderFinancials(order) {
  const totalSale = parseFloat(order.salePrice) ||
                    (order.products || []).reduce((s, p) => s + (parseFloat(p.totalPrice) || 0), 0);
  const totalCost = (order.costItems || []).reduce((s, c) => s + (parseFloat(c.total || c.totalCost) || 0), 0);
  const totalPaid = parseFloat(order.totalPaid) || parseFloat(order.paid) || 0;
  const remaining = Math.max(0, totalSale - totalPaid);
  const margin    = totalSale - totalCost;
  return { totalSale, totalCost, totalPaid, remaining, margin };
}

// ══════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════
export const fn = n => (parseFloat(n) || 0).toLocaleString('ar-EG');

/**
 * dedupEmployees — يوحّد سجلات الموظفين المكرّرة (مصمم/طابع/إلخ).
 * يستخدم استراتيجية متعددة المستويات:
 *   1. لو متطابقين في `authUid` (وكلاهما له authUid) → سجل واحد
 *   2. لو متطابقين في `phone` (مع تطبيع: أرقام فقط) → سجل واحد، يفضّل الذي له authUid
 *   3. لو متطابقين في `name + phone` → سجل واحد
 *
 * يحل مشكلة التكرار عند وجود سجل employee قديم بدون authUid + سجل جديد مرتبط بـ Firebase Auth.
 * كل سجل canonical يحمل `_mergedIds: [...]` بكل الـ ids الأصلية اللي اندمجت فيه — تُستخدم في
 * تجميعات الإحصائيات لتوحيد سجلات قديمة على الأوردرات (designerId قديم → الموظف الحالي).
 */
export function dedupEmployees(raw) {
  if (!Array.isArray(raw)) return [];
  const normPhone = p => (p || '').toString().replace(/\D/g, '');
  const normName  = n => (n || '').toString().trim().toLowerCase();
  const out = [];
  const byAuth  = new Map();   // authUid → index in out
  const byPhone = new Map();   // phone   → index in out
  const byName  = new Map();   // name|phone → index in out
  for (const e of raw) {
    if (!e) continue;
    const auth  = e.authUid || '';
    const phone = normPhone(e.phone);
    const nameKey = normName(e.name) + '|' + phone;
    let existingIdx = -1;
    if (auth  && byAuth.has(auth))  existingIdx = byAuth.get(auth);
    if (existingIdx < 0 && phone && byPhone.has(phone)) existingIdx = byPhone.get(phone);
    if (existingIdx < 0 && phone && byName.has(nameKey)) existingIdx = byName.get(nameKey);
    if (existingIdx >= 0) {
      const cur = out[existingIdx];
      const mergedIds = [...(cur._mergedIds || [cur._id, cur.authUid].filter(Boolean)),
                         ...[e._id, e.authUid].filter(Boolean)];
      if (!cur.authUid && auth) {
        out[existingIdx] = { ...cur, ...e, _mergedIds: [...new Set(mergedIds)] };
        byAuth.set(auth, existingIdx);
      } else {
        out[existingIdx] = { ...cur, _mergedIds: [...new Set(mergedIds)] };
      }
      continue;
    }
    const seed = [e._id, e.authUid].filter(Boolean);
    out.push({ ...e, _mergedIds: seed });
    const idx = out.length - 1;
    if (auth)  byAuth.set(auth, idx);
    if (phone) byPhone.set(phone, idx);
    if (phone) byName.set(nameKey, idx);
  }
  return out;
}

/**
 * resolveDesigner — يأخذ canonical employees list ومعرّف على الأوردر
 * ويرجّع الموظف المطابق (يطابق أي id من `_mergedIds`).
 * يستخدم في تجميع إحصائيات لتوحيد سجلات قديمة على الأوردرات.
 */
export function resolveDesigner(canonicalList, designerId, designerName) {
  if (!Array.isArray(canonicalList)) return null;
  if (designerId) {
    for (const d of canonicalList) {
      if (d._id === designerId || d.authUid === designerId) return d;
      if (Array.isArray(d._mergedIds) && d._mergedIds.includes(designerId)) return d;
    }
  }
  if (designerName) {
    const target = (designerName || '').trim().toLowerCase();
    for (const d of canonicalList) {
      if ((d.name || '').trim().toLowerCase() === target) return d;
    }
  }
  return null;
}

export const nowStr = () =>
  new Date().toLocaleDateString('ar-EG') + ' ' +
  new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

export const calcDelay = (dueDateStr, closedDate = null) => {
  if (!dueDateStr || closedDate) return 0;
  const due  = new Date(dueDateStr);
  const now  = new Date();
  const diff = Math.floor((now - due) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
};

export const stageBadge = (stage) => {
  const s = STAGES[stage];
  if (!s) return '';
  return `<span class="badge" style="background:${s.col}18;color:${s.col}">${s.ico} ${s.label}</span>`;
};

export const getStageLabel = (stage) => STAGES[stage]?.label || stage || '';

// ══════════════════════════════════════════
// STAGE PROGRESS VISUALIZER — شريط تقدم الأوردر
// ══════════════════════════════════════════
/**
 * يبني HTML لشريط تقدم بصري يوضح المرحلة الحالية + اللي فاتت + اللي جاية.
 * يستخدم classes من shared.css — تأكد من تضمينه في الصفحة.
 *
 * @param {Object} order        — وثيقة الأوردر
 * @param {Object} [opts]
 * @param {boolean} [opts.showAssignees=true]
 * @returns {string} HTML
 */
export function stageProgressBar(order, opts = {}) {
  if (!order) return '';
  const showAssignees = opts.showAssignees !== false;
  const STEPS = ['design', 'printing', 'production', 'shipping', 'archived'];
  const cur = order.stage || 'design';
  const isCancelled = cur === 'cancelled';
  const curIdx = STEPS.indexOf(cur);
  const enteredAt = order.stageEnteredAt || {};
  const ownership = STAGE_OWNERSHIP;

  const cells = STEPS.map((s, i) => {
    const conf = STAGES[s] || {};
    let cls = 'sp-step';
    if (isCancelled) cls += ' cancelled';
    else if (i < curIdx) cls += ' done';
    else if (i === curIdx) cls += ' current';
    const time = enteredAt[s] || '';
    const o = ownership[s];
    const assigneeName = o ? (order[o.nameField] || '') : '';
    return `
      <div class="${cls}">
        <div class="sp-dot">${conf.ico || '•'}</div>
        <div class="sp-name">${conf.label || s}</div>
        ${time ? `<div class="sp-time">${time}</div>` : ''}
        ${(showAssignees && assigneeName) ? `<div class="sp-assignee">↪ ${assigneeName}</div>` : ''}
      </div>`;
  }).join('');

  return `<div class="sp-wrap"><div class="sp-row">${cells}</div></div>`;
}

// ══════════════════════════════════════════
// SIDEBAR HTML — shared across all pages
// ══════════════════════════════════════════
export function renderSidebar(activePage, role, userName) {
  const r = ROLES[role] || ROLES.customer_service;
  const allPages = [
    { key:'clients',    ico:'👤', label:'العملاء',       href:'clients.html' },
    { key:'design',     ico:'✏️', label:'التصميم',       href:'design.html' },
    { key:'print',      ico:'🖨️',label:'الطباعة',       href:'print.html' },
    { key:'production', ico:'🏭', label:'التنفيذ',       href:'production.html' },
    { key:'shipping',   ico:'🚚', label:'الشحن',         href:'shipping.html' },
    { key:'archive',    ico:'📁', label:'الأرشيف',       href:'archive.html' },
    { key:'order-tracking', ico:'📋', label:'تتبع الأوردرات', href:'order-tracking.html' },
    { key:'accounts',            ico:'💰', label:'الحسابات',      href:'accounts.html' },
    { key:'financial-dashboard', ico:'📊', label:'لوحة المالية',   href:'financial-dashboard.html' },
    { key:'products',            ico:'◈',  label:'المنتجات',       href:'products.html' },
    { key:'suppliers',  ico:'▣',  label:'الموردين',      href:'suppliers.html' },
    { key:'reports',    ico:'📊', label:'التقارير',      href:'reports.html' },
    { key:'settings',   ico:'⚙️', label:'الإعدادات',    href:'settings.html' },
  ];
  return allPages.map(p => `
    <a class="nav-link ${p.key === activePage ? 'active' : ''}" href="${p.href}">
      <span class="nav-ico">${p.ico}</span> ${p.label}
    </a>`).join('');
}

// ══════════════════════════════════════════
// SHIPPING HELPERS — مصدر واحد للحقيقة عبر shipping.html / shipping-followup.html / shipping-accounts.html
// ══════════════════════════════════════════

/** هل الأوردر مغلق نهائياً (مؤرشف أو مرتجع)؟ */
export function isShipTerminal(order) {
  if (!order) return false;
  return order.stage === 'archived' || order.shipStage === 'returned';
}

/** هل الأوردر مقفول للتعديل المالي (مؤرشف أو مرتجع أو مسوّى مع شركة الشحن)؟
 *  الإستخدام: قبل أي تعديل على totalPaid / customerShipFee — لو true، اطلب من المستخدم
 *  يلغي التسوية أولاً (deleteSettle) ثم يعدّل ثم يعيد التسوية.
 */
export function isShipFinanciallyLocked(order) {
  if (!order) return true;
  if (isShipTerminal(order)) return true;
  if (order.shipSettled === true) return true;
  return false;
}

/** هل الأوردر "جاهز للأرشفة" — تم التحصيل + (تم تسوية الشركة لو ضروري)؟
 *  مصدر واحد للحقيقة بدلاً من تكرار المنطق في 3 صفحات.
 */
export function isShipReadyToClose(order) {
  if (!order) return false;
  if (isShipTerminal(order)) return false;
  const ss = order.shipStage || 'ready';
  if (ss !== 'collected') return false;
  // pickup/courier: محصّل = جاهز
  if (order.shipMethod !== 'company') return true;
  // company: محتاج تسوية مع الشركة
  return order.shipSettled === true;
}

/** هل الأوردر "وصل للعميل"؟ (Step 4.2 — استبدال shippingStatus==='delivered' الميت)
 *  مصدر canonical واحد لمعنى "تم التسليم" يستخدمه: reports, suppliers, exec-dashboard.
 *  يشمل: وصلت للعميل (wait_collection / collected) أو تمت التسوية أو مؤرشف.
 *  يستثني: المرتجع (final terminal state).
 */
export function isDelivered(order) {
  if (!order) return false;
  if (order.shipStage === 'returned') return false;
  const ss = order.shipStage || 'ready';
  if (['wait_collection', 'collected'].includes(ss)) return true;
  if (order.shipSettled === true) return true;
  if (order.stage === 'archived') return true;
  return false;
}

/** هل الأوردر "في الطريق" مع شركة شحن (لسه ما اتسوّاش)؟
 *  بنستخدمه للتمييز إن المسؤولية حالياً على صفحة "حسابات الشحن" أو "متابعة الشحن"
 *  بدلاً من صفحة "الشحن" الرئيسية.
 */
export function isShipCompanyInTransit(order) {
  if (!order) return false;
  if (isShipTerminal(order)) return false;
  if (order.shipMethod !== 'company') return false;
  const ss = order.shipStage || 'ready';
  return ['wait_delivery', 'wait_collection', 'collected'].includes(ss);
}

/** هل الأوردر بحاجة لتسوية مع شركة الشحن (محصّل + شركة + لم يتم تسويته بعد)؟ */
export function isShipPendingSettle(order) {
  if (!order) return false;
  if (isShipTerminal(order)) return false;
  if (order.shipMethod !== 'company') return false;
  if (order.shipSettled === true) return false;
  return (order.shipStage || 'ready') === 'collected';
}

/** هل الأوردر "نشط" يحتاج عمل من فريق الشحن؟
 *  (ليس مؤرشف، ليس مرتجع، ليس جاهز للأرشفة)
 */
export function isShipActive(order) {
  if (!order) return false;
  if (isShipTerminal(order)) return false;
  return !isShipReadyToClose(order);
}

// ═══════════════════════════════════════════════════════════════════
// SETTLEMENT BUILDER (PR Settle-Fix #1) — Single source of truth for
// computing per-order updates when settling shipments with a company.
//
// THE BUG IT FIXES (verified across 3 settle paths):
//   - shipping.html confirmSettle      — used (shipCollected − shippingCost) ✓ correct
//   - shipping-accounts.html saveSettle — used getDueByCo (customer remaining) ✗
//   - shipping-followup.html saveSettleFromCo — used (sale + cust − disc − oldPaid) ✗
// Three different formulas for one operation. Two of them ignored
// `shipCollected` (the actual collection recorded at confirmCollect).
//
// THIS HELPER:
//   - Uses `shipCollected − shippingCost` as the canonical expected per
//     order (matches what the company actually owes us)
//   - Distributes the actual amount proportionally when diff != expected
//   - Returns per-order updates plus a summary
//
// EDGE CASES:
//   - sumExpected === 0  → fall back to even distribution across selected
//   - one order has expected=0 → gets 0 share (no inflation)
//   - actualAmount === sumExpected → each order gets exactly its expected
//   - actualAmount < sumExpected → each order gets its proportional share
//                                  (smaller than expected); shortfall is
//                                  thus distributed, not orphaned
//   - actualAmount > sumExpected → each order gets proportionally more;
//                                  positive diff treated symmetrically
//
// USAGE:
//   const spec = buildSettlementUpdates({
//     orders: [...],          // full order objects
//     actualAmount: 720,      // what the company actually paid us
//     userName: 'Mohamed',    // for timeline entries
//     companyName: 'شركة س',  // for timeline entries
//     diffReason: 'weight',   // optional, audit
//   });
//   if (!spec.ok) return toast(spec.errors[0], 'err');
//   // Use spec.updates in your writeBatch / runTransaction
//
// ═══════════════════════════════════════════════════════════════════

/** صافي ما تدين به الشركة لنا لهذا الأوردر = shipCollected − shippingCost */
function _expectedFromCompany(order) {
  const collected = parseFloat(order?.shipCollected) || 0;
  const cost      = parseFloat(order?.shippingCost) || 0;
  return Math.max(0, collected - cost);
}

/** المجموع الكلي للأوردر بعد customer ship fee و discount */
function _orderGrossTotal(order) {
  const sale     = parseFloat(order?.salePrice) || 0;
  const custShip = parseFloat(order?.customerShipFee) || 0;
  const disc     = parseFloat(order?.discount) || 0;
  return Math.max(0, sale + custShip - disc);
}

/**
 * buildSettlementUpdates — pure function. Returns the per-order updates
 * to apply atomically (writeBatch or runTransaction).
 *
 * @param {Object} args
 * @param {Array<Object>} args.orders         — selected orders (full docs)
 * @param {number}        args.actualAmount   — what the company actually paid us
 * @param {string}        [args.userName]     — for timeline entries
 * @param {string}        [args.companyName]  — for timeline entries
 * @param {string}        [args.diffReasonLabel] — Arabic label for diff reason
 * @param {string}        [args.diffNote]     — free-text note for the diff
 * @returns {Object} { ok, errors[], warnings[], updates[], summary }
 */
export function buildSettlementUpdates({
  orders = [],
  actualAmount = 0,
  userName = '',
  companyName = '',
  diffReasonLabel = '',
  diffNote = '',
}) {
  const errors = [];
  const warnings = [];

  if (!Array.isArray(orders) || orders.length === 0) {
    errors.push('⚠️ لا توجد أوردرات للتسوية');
    return { ok: false, errors, warnings, updates: [], summary: null };
  }

  const actual = parseFloat(actualAmount);
  if (!Number.isFinite(actual) || actual < 0) {
    errors.push('⚠️ المبلغ الفعلي غير صالح');
    return { ok: false, errors, warnings, updates: [], summary: null };
  }

  // Per-order expected: shipCollected − shippingCost (the canonical formula)
  const perOrderExpected = orders.map(o => _expectedFromCompany(o));
  const sumExpected = perOrderExpected.reduce((s, x) => s + x, 0);

  // Distribution strategy:
  // - If sumExpected > 0: proportional (each order gets actual * (its_expected / total_expected))
  // - If sumExpected === 0: even split (e.g., all shipCollected were 0 — rare edge case)
  const shares = orders.map((_, i) => {
    if (sumExpected > 0) return actual * (perOrderExpected[i] / sumExpected);
    return actual / orders.length;
  });

  const diff = actual - sumExpected;

  // Optional warning: shipCollected missing for any order
  const missingCollected = orders.filter(o => !(parseFloat(o?.shipCollected) > 0));
  if (missingCollected.length) {
    warnings.push(`⚠️ ${missingCollected.length} أوردر بدون shipCollected — قد يحتاج مراجعة`);
  }

  // Already-settled guard (UX hint; the atomic write enforces it for real)
  const alreadySettled = orders.filter(o => o?.shipSettled === true);
  if (alreadySettled.length) {
    errors.push(`⛔ ${alreadySettled.length} أوردر مسوّى بالفعل`);
    return { ok: false, errors, warnings, updates: [], summary: null };
  }

  const ts = new Date().toLocaleDateString('ar-EG') + ' ' +
             new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  // Build per-order update specs
  const updates = orders.map((o, i) => {
    const expected = perOrderExpected[i];
    const share    = Math.round(shares[i] * 100) / 100;  // 2-decimal precision
    const oldPaid  = parseFloat(o?.totalPaid) || parseFloat(o?.paid) || parseFloat(o?.deposit) || 0;
    const newPaid  = oldPaid + share;
    const gross    = _orderGrossTotal(o);
    const newRem   = Math.max(0, gross - newPaid);
    const paymentStatus = newRem <= 0.01 ? 'paid' : newPaid > 0 ? 'partial' : 'pending';

    // Diff narrative for this order's timeline entry
    let diffNarrative = '';
    if (Math.abs(share - expected) > 0.01) {
      const sign = share > expected ? '+' : '−';
      diffNarrative = ` (${sign}${Math.abs(share - expected).toFixed(2)} ج عن المتوقع${diffReasonLabel ? ' — ' + diffReasonLabel : ''})`;
    }
    const action = `✅ تسوية شحن — ${companyName || ''} — ${share.toFixed(2)} ج${diffNarrative}`;

    return {
      orderId: o._id,
      // Fields to write on orders/{orderId}:
      fields: {
        shipSettled: true,
        shipSettledAmount: share,           // actual share (NOT expected)
        shipSettledExpected: expected,      // audit: what we expected from this order
        shipSettledDiff: share - expected,  // audit: per-order diff
        totalPaid: newPaid,
        remaining: newRem,
        paymentStatus,
      },
      timelineEntry: { date: ts, action, by: userName || 'system' },
      // For convenience to callers:
      expected,
      share,
      newPaid,
      newRem,
    };
  });

  return {
    ok: true,
    errors,
    warnings,
    updates,
    summary: {
      actual,
      sumExpected,
      diff,
      orderCount: orders.length,
      hasDiff: Math.abs(diff) > 0.01,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// END SETTLEMENT BUILDER
// ═══════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════
// ORDER SELF-HEALER — كشف وإصلاح الـ inconsistencies تلقائياً
// المبدأ: نحسب الحالة الحقيقية من salePrice/customerShipFee/discount/totalPaid وplags
// لو فيه drift بين الـ flags المخزّنة والـ truth الحسابي → نرجّع consistency
// ══════════════════════════════════════════

/** يحسب الحالة المالية الحقيقية للأوردر بدون اعتماد على flags ممكن تكون drifted */
export function getOrderFinancialTruth(order) {
  if (!order) return null;
  const sale = parseFloat(order.salePrice) || 0;
  const cust = parseFloat(order.customerShipFee) || 0;
  const disc = parseFloat(order.discount) || 0;
  const paid = parseFloat(order.totalPaid) || parseFloat(order.paid) || parseFloat(order.deposit) || 0;
  const total = sale + cust - disc;
  const remaining = Math.max(0, total - paid);
  const isFullyPaid = total > 0 && paid >= total - 0.01;
  const isCompany = order.shipMethod === 'company';
  const isReturned = order.shipStage === 'returned';
  const isArchived = order.stage === 'archived';
  const isTerminal = isReturned || isArchived;
  return { sale, cust, disc, paid, total, remaining, isFullyPaid, isCompany, isReturned, isArchived, isTerminal };
}

/** يكشف أي inconsistencies في الأوردر — يرجع array من المشاكل مع الإصلاحات المقترحة */
export function detectOrderIssues(order) {
  if (!order) return [];
  const t = getOrderFinancialTruth(order);
  if (!t) return [];
  if (t.isReturned) return []; // المرتجع حالة نهائية، مينفعش نصلح
  const issues = [];

  // 1. shipSettled=true لكن totalPaid أقل من الإجمالي (legacy markManualSettled قبل PR #144)
  if (order.shipSettled === true && !t.isFullyPaid && t.total > 0) {
    issues.push({
      key: 'settled_unpaid',
      severity: 'warn',
      label: 'مسوّى لكن totalPaid أقل من الإجمالي',
      fixDesc: `ضبط totalPaid = ${t.total} ج`,
      fixPatch: { totalPaid: t.total, remaining: 0, paymentStatus: 'paid' },
    });
  }

  // 2. شركة + collected + غير مسوّى — يحتاج تسوية من حسابات الشحن (المنطق الصحيح)
  // ليس bypass: شحنات الشركات تُسوَّى عبر التسوية الرسمية فقط
  if (t.isCompany && !order.shipSettled && !t.isTerminal) {
    const ss = order.shipStage || 'ready';
    if (ss === 'collected') {
      issues.push({
        key: 'company_pending_settle',
        severity: 'warn',
        label: 'شحنة شركة محصّلة لكن لم تُسوَّ بعد',
        fixDesc: 'استخدم "تسوية" من صفحة حسابات الشحن (لا auto-fix)',
        // لا fixPatch — الإصلاح يدوي عبر صفحة حسابات الشحن
      });
    }
  }

  // 4. paymentStatus drift
  if (!t.isTerminal && order.paymentStatus && t.total > 0) {
    const expected = t.isFullyPaid ? 'paid' : t.paid > 0 ? 'partial' : 'pending';
    if (['paid', 'partial', 'pending'].includes(order.paymentStatus) && order.paymentStatus !== expected) {
      issues.push({
        key: 'payment_status_drift',
        severity: 'warn',
        label: `paymentStatus="${order.paymentStatus}" لا يطابق الحساب (المتوقع="${expected}")`,
        fixDesc: `ضبط paymentStatus = ${expected}`,
        fixPatch: { paymentStatus: expected, remaining: t.remaining },
      });
    }
  }

  // 5. مرتجع لكن shipSettled لسه true (الـ return logic لم تنفّذ بشكل كامل)
  if (t.isReturned === false && order.shipStage === 'returned' && order.shipSettled === true) {
    issues.push({
      key: 'returned_settled',
      severity: 'crit',
      label: 'مرتجع لكن shipSettled=true',
      fixDesc: 'فض كل أعلام التسوية',
      fixPatch: { shipSettled: false, shipSettledAmount: 0, shipSettledManual: false },
    });
  }

  return issues;
}

/** يطبّق الإصلاحات المقترحة على الـ batch (atomic) — يتجاوز المشاكل بدون fixPatch */
export function applyOrderHealPatch(batch, dbDocRef, order, issues, userName) {
  if (!issues || !issues.length) return;
  const auto = issues.filter(i => i.fixPatch);
  if (!auto.length) return;
  const merged = {};
  for (const iss of auto) {
    Object.assign(merged, iss.fixPatch);
  }
  const ts = new Date().toLocaleDateString('ar-EG') + ' ' + new Date().toLocaleTimeString('ar-EG', {hour:'2-digit',minute:'2-digit'});
  const fixLabels = auto.map(i => i.fixDesc).join(' · ');
  merged.timeline = [...(order.timeline || []), {
    date: ts,
    action: `🔧 إصلاح ذاتي: ${fixLabels}`,
    by: userName || 'system',
  }];
  batch.update(dbDocRef, merged);
}

// ═══════════════════════════════════════════════════════════════════
// M3: Stage advance with optimistic locking (transaction-based)
// ═══════════════════════════════════════════════════════════════════
//
// buildStageAdvance() نقي (pure) — لا يكتب في Firestore. الـ caller يطبّق
// الـ spec في batch خاص به. لكن بين قراءة الـ order وكتابة الـ batch
// يمكن لمستخدم آخر تقديم نفس الأوردر — race condition (audit §M3).
//
// هذا الـ wrapper يستخدم Firestore transaction:
//   1. يقرأ الأوردر داخل الـ transaction (snapshot طازج)
//   2. يتحقق أن الـ stage الحالي == المتوقع (لو expectedCurrentStage محدد)
//   3. يبني الـ spec ويطبّقه ذرّياً
// لو تغيّر الـ stage في الأثناء، Firestore تعيد المحاولة تلقائياً
// (max 5 محاولات) ثم ترمي خطأ.
//
// Usage:
//   import { runTransaction, doc } from "firebase-firestore";
//   import { advanceOrderStageWithLock } from "./orders.js";
//   await advanceOrderStageWithLock({
//     db, runTransaction, doc,
//     orderId: 'abc123',
//     expectedCurrentStage: 'design',  // اختياري — للحماية الإضافية
//     role: currentRole, userId, userName,
//     nextAssigneeId, nextAssigneeName,
//     onSpec: (spec, tx, orderRef) => {  // اختياري — تعديلات إضافية في نفس الـ tx
//       tx.update(otherDocRef, {...});
//     },
//   });
//
// الـ caller لا يحتاج إنشاء batch خاص به — كل شيء في الـ transaction.
export async function advanceOrderStageWithLock({
  db, runTransaction, doc,
  orderId, expectedCurrentStage = null,
  role, userId, userName,
  targetStage = null, nextAssigneeId = '', nextAssigneeName = '',
  bypassWarnings = false, extraFields = {},
  onSpec = null,
}) {
  if (!db || !runTransaction || !doc) throw new Error('[orders] advanceOrderStageWithLock: db, runTransaction, doc مطلوبون');
  if (!orderId) throw new Error('[orders] orderId مطلوب');

  return await runTransaction(db, async (tx) => {
    const orderRef = doc(db, 'orders', orderId);
    const snap = await tx.get(orderRef);
    if (!snap.exists()) throw new Error('[orders] الأوردر غير موجود: ' + orderId);
    const order = { ...snap.data(), _id: orderId };

    // M3 الجوهر: مقارنة الـ stage الحالي مع المتوقع
    if (expectedCurrentStage && order.stage !== expectedCurrentStage) {
      throw new Error(`[orders] الـ stage تغيّر بواسطة مستخدم آخر — متوقع "${expectedCurrentStage}"، الحالي "${order.stage}". أعد التحميل وحاول مرة أخرى.`);
    }

    // ابنِ الـ spec بـ buildStageAdvance الموجود
    const result = buildStageAdvance({
      order, role, userId, userName,
      targetStage, nextAssigneeId, nextAssigneeName,
      bypassWarnings, extraFields,
    });
    if (!result.ok) {
      const msg = result.errors?.join(' / ') || 'تقديم المرحلة غير مسموح';
      throw new Error('[orders] ' + msg + (result.warnings?.length ? ' (warnings: ' + result.warnings.join(', ') + ')' : ''));
    }

    // طبّق الـ spec في الـ transaction (وليس batch)
    // buildStageAdvance يُرجع { fields, timelineEntry } — نَدمج الـ
    // timelineEntry مع الـ timeline الحالي ونكتب الكل دفعة واحدة
    // (نفس contract الـ batch callers في production.html / print.html).
    const updatePayload = {
      ...result.fields,
      timeline: [...(order.timeline || []), result.timelineEntry],
      updatedAt: nowStr(),
    };
    tx.update(orderRef, updatePayload);

    // hook للـ caller — يقدر يضيف writes إضافية في نفس الـ transaction
    if (typeof onSpec === 'function') {
      await onSpec(result, tx, orderRef);
    }

    return {
      ok: true,
      from: order.stage,
      to: result.newStage,
      orderId,
      warnings: result.warnings || [],
    };
  });
}
