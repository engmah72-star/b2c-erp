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
// FIREBASE CONFIG
// ══════════════════════════════════════════
export const FB_CONFIG = {
  apiKey:            "AIzaSyDEK3I06IMrJPiYX09ULF7OIcbsMOsasUk",
  authDomain:        "business2card-c041b.firebaseapp.com",
  projectId:         "business2card-c041b",
  storageBucket:     "business2card-c041b.firebasestorage.app",
  messagingSenderId: "235622448899",
  appId:             "1:235622448899:web:d8652ff71082f7d003f336",
};

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
  admin:            { label:'Admin',        ico:'👑', col:'#a78bfa' },
  operation_manager:{ label:'Ops Manager',  ico:'📋', col:'#3b9eff' },
  customer_service: { label:'Cust.Service', ico:'💬', col:'#22d3ee' },
  graphic_designer: { label:'Designer',     ico:'✏️', col:'#a78bfa' },
  design_operator:  { label:'Design Op.',   ico:'⚙️', col:'#ffaa00' },
  production_agent: { label:'Production',   ico:'🏭', col:'#ff3d6e' },
  shipping_officer: { label:'Shipping',     ico:'🚚', col:'#22d3ee' },
  wallet_manager:   { label:'Wallet Mgr',   ico:'💰', col:'#00d97e' },
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
    designStage: 'pending',

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
 * @returns { ok, errors[] }
 */
export function validateStageRequirements(order, fromStage) {
  const errors = [];
  if (!order) { return { ok:false, errors:['لا يوجد أوردر'] }; }
  const stage = fromStage || order.stage;

  if (stage === 'design') {
    const hasFiles = !!(order.designFileUrl
                     || (order.designFiles && order.designFiles.length)
                     || (order.products || []).some(p => p.designImageUrl));
    if (!hasFiles) errors.push('يجب رفع ملف التصميم أو اعتماده قبل الإرسال للطباعة');
  }
  else if (stage === 'printing') {
    const hasImg = !!(order.designImageUrl
                   || (order.products || []).some(p => p.designImageUrl)
                   || order.printFinalUrl
                   || order.designFileUrl
                   || (order.designFiles && order.designFiles.length));
    if (!hasImg) errors.push('يجب رفع صورة التصميم النهائي قبل التحويل للتنفيذ');
  }
  else if (stage === 'production') {
    if (!(order.costItems || []).length) errors.push('يجب تسجيل تكاليف الأوردر قبل التحويل للشحن');
  }
  else if (stage === 'shipping') {
    // شحن → أرشيف
    const sale = parseFloat(order.salePrice) || 0;
    const paid = parseFloat(order.totalPaid) || parseFloat(order.paid) || 0;
    const rem  = Math.max(0, sale - paid);
    if (!(order.costItems || []).length) errors.push('سجّل تكلفة الأوردر أولاً');
    if (rem > 0) errors.push(`المتبقي ${rem} ج لم يُسوَّى — حصِّل أو سجّل المبلغ`);
    if (order.shipMethod === 'company' && !order.shipSettled) errors.push('شركة الشحن لم تتم تسويتها');
    if (order.shipStage === 'returned') errors.push('يوجد مرتجع لم تتم معالجته');
  }
  else if (stage === 'archived' || stage === 'cancelled') {
    errors.push('لا توجد مرحلة تالية');
  }

  return { ok: errors.length === 0, errors };
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
 * @returns { ok, newStage, errors, fields, timelineEntry }
 */
export function buildStageAdvance({ order, role, userId, userName, extraFields = {}, targetStage = null, nextAssigneeId = '', nextAssigneeName = '' }) {
  if (!order) return { ok:false, errors:['لا يوجد أوردر'] };
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
    return { ok:false, errors:['ليس لديك صلاحية تقديم هذه المرحلة'] };
  }

  // فحص الشروط (يتجاوزه admin لو حدد targetStage صراحة)
  if (!targetStage) {
    const v = validateStageRequirements(order, cur);
    if (!v.ok) return { ok:false, errors: v.errors };
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
    { key:'index',      ico:'⬡',  label:'لوحة التحكم',  href:'index.html' },
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
