/**
 * Business2Card ERP v5
 * orders.js — محرك الأوردرات المركزي
 *
 * الـ Flow: تصميم → طباعة → تنفيذ → شحن → أرشيف
 *
 * كل أوردر له status واحد فقط في أي وقت.
 * كل صفحة تشوف status بتاعها بس.
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
// WORKFLOW — المراحل وترتيبها
// ══════════════════════════════════════════
export const STAGES = {
  design:     { label:'تصميم',   ico:'✏️',  col:'#a78bfa', next:'printing',    page:'design.html',     badge:'bg-p' },
  printing:   { label:'طباعة',   ico:'🖨️', col:'#ffaa00', next:'production',  page:'print.html',      badge:'bg-y' },
  production: { label:'تنفيذ',   ico:'🏭',  col:'#ff3d6e', next:'shipping',    page:'production.html', badge:'bg-r' },
  shipping:   { label:'شحن',     ico:'🚚',  col:'#22d3ee', next:'delivered',   page:'shipping.html',   badge:'bg-c' },
  delivered:  { label:'تسليم',   ico:'✅',  col:'#00d97e', next:'archived',    page:'archive.html',    badge:'bg-g' },
  archived:   { label:'أرشيف',   ico:'📁',  col:'#4e5672', next:null,          page:'archive.html',    badge:'bg-d' },
  cancelled:  { label:'ملغي',    ico:'✕',   col:'#4e5672', next:null,          page:'archive.html',    badge:'bg-d' },
};

// من يقدر يقدم كل مرحلة
export const STAGE_PERMISSIONS = {
  design:     ['admin','operation_manager','customer_service','graphic_designer','design_operator'],
  printing:   ['admin','operation_manager','customer_service','production_agent'],
  production: ['admin','operation_manager','production_agent'],
  shipping:   ['admin','operation_manager','shipping_officer'],
  delivered:  ['admin','operation_manager','shipping_officer'],
  archived:   ['admin'],
};

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
// ORDER STRUCTURE — بنية الأوردر
// ══════════════════════════════════════════
/**
 * createOrderData(data) — بيبني الأوردر الجديد
 *
 * products: [{ name, qty, unitPrice, totalPrice }]
 * كل بنود البيع والتكلفة والشحن جوا الأوردر نفسه
 */
export function createOrderData(data, userId, userName) {
  const id = 'ORD-' + Date.now().toString().slice(-8);
  const now = nowStr();
  return {
    // معرف
    id,

    // بيانات العميل
    clientId:    data.clientId    || '',
    clientName:  data.clientName  || '',
    clientPhone: data.clientPhone || '',

    // المرحلة الحالية
    status: 'design',

    // التصميم
    designRequest: data.designRequest || '',  // طلب العميل
    designerId:    data.designerId    || '',  // المصمم المكلف
    designerName:  data.designerName  || '',
    designFiles:   [],                        // ملفات التصميم
    designNotes:   data.designNotes   || '',
    designDueDate: data.designDueDate || '',

    // المنتجات — أكتر من منتج في طلب واحد
    products: data.products || [],
    // كل منتج: { id, name, qty, unitPrice, totalPrice, printType, notes }

    // المالية — يتحسب تلقائي من products
    totalSale:    0,  // إجمالي البيع
    totalPaid:    0,  // المحصّل
    totalCost:    0,  // إجمالي التكاليف
    remaining:    0,  // الباقي للتحصيل

    // بنود التكلفة — بيضيفها قسم التنفيذ
    costs: [],
    // كل بند: { type, supplierId, supplierName, qty, sheets, totalCost, note }

    // بيانات الطباعة
    printType:    '',  // digital | offset
    printNotes:   '',

    // بيانات التنفيذ
    productionNotes: '',
    productionDueDate: '',

    // بيانات الشحن
    shipment: {
      type:         '',  // company | internal
      companyId:    '',
      companyName:  '',
      delegateName: '',
      address:      '',
      gov:          '',
      shipDate:     '',
      expectedDate: '',
      deliveryDate: '',
      cost:         0,
      collectOnDelivery: 0,
    },

    // Timeline — سجل تحركات الأوردر
    timeline: [{
      stage: 'design',
      label: 'تم إنشاء الأوردر',
      date:  now,
      by:    userName,
      byId:  userId,
    }],

    // Metadata
    createdBy:   userId,
    createdByName: userName,
    createdAt:   null, // serverTimestamp
    updatedAt:   null,
  };
}

// ══════════════════════════════════════════
// ADVANCE STAGE — تقدم مرحلة
// ══════════════════════════════════════════
/**
 * advanceStage(db, orderId, currentStatus, userId, userName, role, extraData)
 * بيحرك الأوردر للمرحلة الجاية
 * بيرجع { success, newStatus, error }
 */
export async function advanceStage(db, updateDoc, doc, orderId, currentStatus, userId, userName, role, extraData = {}) {
  const stage = STAGES[currentStatus];
  if (!stage?.next) return { success: false, error: 'لا توجد مرحلة تالية' };

  const allowed = STAGE_PERMISSIONS[currentStatus];
  if (allowed && !allowed.includes(role)) {
    return { success: false, error: 'ليس لديك صلاحية تقديم هذه المرحلة' };
  }

  const newStatus = stage.next;
  const now = nowStr();

  const updateData = {
    status:    newStatus,
    updatedAt: new Date().toISOString(),
    ...extraData,
  };

  // أضف للـ timeline
  const newEntry = {
    stage: newStatus,
    label: `انتقل إلى ${STAGES[newStatus]?.label || newStatus}`,
    date:  now,
    by:    userName,
    byId:  userId,
  };

  try {
    await updateDoc(doc(db, 'orders', orderId), {
      ...updateData,
      // نضيف للـ timeline بدون نكتب كل القديم (arrayUnion)
    });
    // timeline update منفصل
    const { arrayUnion } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    await updateDoc(doc(db, 'orders', orderId), {
      timeline: arrayUnion(newEntry),
    });
    return { success: true, newStatus };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ══════════════════════════════════════════
// FINANCIAL CALCULATIONS
// ══════════════════════════════════════════
export function calcOrderFinancials(order) {
  const totalSale = (order.products || []).reduce((s, p) => s + (parseFloat(p.totalPrice) || 0), 0);
  const totalCost = (order.costs || []).reduce((s, c) => s + (parseFloat(c.totalCost) || 0), 0);
  const totalPaid = parseFloat(order.totalPaid) || 0;
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

export const stageBadge = (status) => {
  const s = STAGES[status];
  if (!s) return '';
  return `<span class="badge" style="background:${s.col}18;color:${s.col}">${s.ico} ${s.label}</span>`;
};

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
    { key:'accounts',   ico:'💰', label:'الحسابات',      href:'accounts.html' },
    { key:'products',   ico:'◈',  label:'المنتجات',      href:'products.html' },
    { key:'suppliers',  ico:'▣',  label:'الموردين',      href:'suppliers.html' },
    { key:'reports',    ico:'📊', label:'التقارير',      href:'reports.html' },
    { key:'settings',   ico:'⚙️', label:'الإعدادات',    href:'settings.html' },
  ];
  return allPages.map(p => `
    <a class="nav-link ${p.key === activePage ? 'active' : ''}" href="${p.href}">
      <span class="nav-ico">${p.ico}</span> ${p.label}
    </a>`).join('');
}
