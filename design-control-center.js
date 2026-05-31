/**
 * Business2Card ERP — design-control-center.js
 *
 * Design Operations Control Center mode.
 *
 * Provides an alternative panel layout for design.html — gated behind
 * the `design.controlCenter` feature flag. When OFF the legacy panel
 * renders unchanged.
 *
 * What this ships:
 *   • Sticky order/client header (critical info + action buttons)
 *   • 3-tab body (🎨 التصميم / ⏱ Timeline / ⚙️ المزيد)
 *   • Unified timeline from order.timeline[]
 *   • Contact bottom sheet (call/WhatsApp — RULE 8.1 aware)
 *   • Action bottom sheet (assign / accept / stage change / etc.)
 *
 * Side effects (window):
 *   window.isDesignControlCenterOn
 *   window.renderDesignPanelDCC
 *   window.openDesignOrderContactSheet
 *   window.openDesignOrderActionSheet
 *   window.switchDesignPanelTab
 *   window.dccToggleAccordion
 */

import { isFeatureEnabled, setFeatureFlag } from './core/feature-flags.js';
import { openBottomSheet } from './core/bottom-sheet.js';

const DCC_FLAG = 'design.controlCenter';
// Default: ON for all users. Opt-out:
//   localStorage.setItem('feat.design.controlCenter','0')
//   or ?feat.design.controlCenter=0
// Kill-switch: ship a one-line PR flipping the default back to `false`.
export function isDesignControlCenterOn() { return isFeatureEnabled(DCC_FLAG, true); }

// ─── HELPERS ────────────────────────────────────────────────────────

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtNum(n) {
  const v = parseFloat(n);
  if (!isFinite(v)) return '0';
  return v.toLocaleString('en-US');
}

function tsSeconds(t) {
  if (!t) return 0;
  if (typeof t === 'number') return t > 1e12 ? t / 1000 : t;
  if (typeof t === 'object' && typeof t.seconds === 'number') return t.seconds;
  if (typeof t === 'object' && typeof t.toDate === 'function') return Math.floor(t.toDate().getTime() / 1000);
  if (t instanceof Date) return Math.floor(t.getTime() / 1000);
  if (typeof t === 'string') { const p = Date.parse(t); return isFinite(p) ? Math.floor(p / 1000) : 0; }
  return 0;
}

function timeAgo(secs) {
  if (!secs) return '';
  const diff = Math.floor(Date.now() / 1000) - secs;
  if (diff < 60) return 'الآن';
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} د`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} س`;
  if (diff < 86400 * 7) return `منذ ${Math.floor(diff / 86400)} يوم`;
  const d = new Date(secs * 1000);
  return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
}

function fmtTime(secs) {
  if (!secs) return '';
  const d = new Date(secs * 1000);
  return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

function timelineBucket(secs) {
  if (!secs) return 'older';
  const startToday = Math.floor(new Date(new Date().setHours(0, 0, 0, 0)).getTime() / 1000);
  const startYesterday = startToday - 86400;
  const startWeek = startToday - 7 * 86400;
  const startMonth = startToday - 30 * 86400;
  if (secs >= startToday) return 'today';
  if (secs >= startYesterday) return 'yesterday';
  if (secs >= startWeek) return 'thisWeek';
  if (secs >= startMonth) return 'thisMonth';
  return 'older';
}

const BUCKET_LABELS = {
  today: '🟢 اليوم', yesterday: '🟡 أمس', thisWeek: '📅 هذا الأسبوع',
  thisMonth: '🗓 هذا الشهر', older: '📦 أقدم',
};

// Days late helper
function daysOverDeadline(deadline) {
  if (!deadline) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(deadline).getTime()) / 86400000));
}

// ─── BUILD UNIFIED TIMELINE ────────────────────────────────────────
/**
 * Merge order events into one chronological list.
 * Sources: order.createdAt, order.timeline[], file uploads (if timestamps).
 */
export function buildOrderTimeline(order = {}) {
  const events = [];

  // Creation event
  const createdTs = tsSeconds(order.createdAt);
  if (createdTs) {
    events.push({
      ts: createdTs,
      icon: '🆕',
      color: 'var(--p)',
      title: 'تم إنشاء الطلب',
      subtitle: order.product || (order.products || []).map(p => p.name).join(' + '),
      actor: order.createdByName || order.createdBy || '',
      kind: 'create',
    });
  }

  // order.timeline[] entries (the canonical source of truth)
  for (const t of (order.timeline || [])) {
    if (!t || !t.action) continue;
    const tts = tsSeconds(t.date || t.at || t.createdAt);
    if (!tts) continue;
    // Skip duplicate creation echo
    if (tts === createdTs && (t.action || '').includes('إنشاء')) continue;
    const action = String(t.action);
    // Infer icon/color from action text
    let icon = '🔄', color = 'var(--dim)';
    if (action.includes('تصميم') || action.includes('🎨') || action.includes('✏️')) { icon = '🎨'; color = 'var(--p)'; }
    else if (action.includes('طباعة') || action.includes('🖨️')) { icon = '🖨️'; color = 'var(--b)'; }
    else if (action.includes('شحن') || action.includes('🚚')) { icon = '🚚'; color = 'var(--c)'; }
    else if (action.includes('اعتمد') || action.includes('✅')) { icon = '✅'; color = 'var(--g)'; }
    else if (action.includes('رفض') || action.includes('✕')) { icon = '✕'; color = 'var(--r)'; }
    else if (action.includes('مرتجع') || action.includes('↩')) { icon = '↩️'; color = 'var(--r)'; }
    else if (action.includes('مصمم') || action.includes('تعيين')) { icon = '👤'; color = 'var(--b)'; }
    else if (action.includes('عربون') || action.includes('💰')) { icon = '💰'; color = 'var(--g)'; }
    else if (action.includes('ملف') || action.includes('📎')) { icon = '📎'; color = 'var(--c)'; }
    events.push({
      ts: tts,
      icon, color,
      title: action,
      subtitle: t.note || t.comment || '',
      actor: t.by || t.byName || t.userName || '',
      kind: t.kind || 'event',
    });
  }

  // File uploads (if timestamps available)
  for (const f of (order.designFiles || [])) {
    if (!f || !f.createdAt) continue;
    const fts = tsSeconds(f.createdAt);
    if (!fts) continue;
    events.push({
      ts: fts,
      icon: '📎',
      color: 'var(--c)',
      title: 'رفع ملف تصميم',
      subtitle: f.name || '',
      actor: f.uploadedByName || '',
      kind: 'file',
    });
  }

  return events.filter(e => e.ts > 0).sort((a, b) => b.ts - a.ts);
}

export function designTimelineHTML(events = [], orderId = '') {
  if (!events.length) {
    return `<div class="dcc-empty">
      <div class="dcc-empty-ico">⏱</div>
      <div class="dcc-empty-txt">لا توجد أحداث مسجَّلة بعد لهذا الطلب</div>
    </div>`;
  }

  const grouped = { today: [], yesterday: [], thisWeek: [], thisMonth: [], older: [] };
  for (const ev of events) grouped[timelineBucket(ev.ts)].push(ev);

  const renderEvent = (ev) => `
    <div class="dcc-tl-item">
      <div class="dcc-tl-line" style="--tl-col:${ev.color}"></div>
      <div class="dcc-tl-ico" style="background:${ev.color}22;color:${ev.color}">${ev.icon}</div>
      <div class="dcc-tl-body">
        <div class="dcc-tl-head">
          <div class="dcc-tl-title">${escHtml(ev.title)}</div>
          <div class="dcc-tl-time">${fmtTime(ev.ts)} · ${timeAgo(ev.ts)}</div>
        </div>
        ${ev.subtitle ? `<div class="dcc-tl-sub">${escHtml(ev.subtitle)}</div>` : ''}
        ${ev.actor ? `<div class="dcc-tl-actor">👤 ${escHtml(ev.actor)}</div>` : ''}
      </div>
    </div>`;

  return Object.entries(grouped)
    .filter(([, list]) => list.length)
    .map(([bucket, list]) => `
      <div class="dcc-tl-group">
        <div class="dcc-tl-bucket">${BUCKET_LABELS[bucket]} <span class="dcc-tl-count">${list.length}</span></div>
        ${list.map(renderEvent).join('')}
      </div>`).join('');
}

// ─── STICKY HEADER ──────────────────────────────────────────────────
export function designPanelHeaderDCC(order = {}, ctx = {}) {
  const o = order;
  const canSeePhone = (typeof window.canSeePhone === 'function') ? window.canSeePhone() : false;
  const showPhone = (typeof window.showPhone === 'function') ? window.showPhone : (p) => p || '';
  const designer = (ctx.designers || []).find(d => d._id === o.designerId || d.authUid === o.designerId);
  const designerName = designer?.name || o.designerName || '';

  const dLate = daysOverDeadline(o.deadline);
  const products = o.products || [];
  const readyCount = products.filter(p => (p.productStatus || 'pending') === 'ready').length;
  const totalCount = products.length;

  // Stage label
  const stageMap = {
    pending: '⏳ في الانتظار',
    wip: '🎨 جاري التصميم',
    awaiting_payment: '📤 انتظار التحويل',
    rejected: '✕ مرفوض',
    approved: '✅ معتمد',
  };
  const stageLbl = stageMap[o.designStage] || (o.designStage || 'تصميم');

  const isRejected = o.designStage === 'rejected';

  return `
    <div class="dcc-hdr">
      <div class="dcc-hdr-top">
        <div class="dcc-hdr-id">✏️ ${escHtml(o.orderId || (o._id || '').slice(-6))} · <span class="dcc-hdr-stage">${stageLbl}</span></div>
        <div class="dcc-hdr-name">${escHtml(o.clientName || '—')}</div>
        <div class="dcc-hdr-meta">
          ${canSeePhone && o.clientPhone ? `<a href="tel:${escHtml(o.clientPhone)}" class="dcc-hdr-phone">📞 ${escHtml(o.clientPhone)}</a>` : (o.clientPhone ? `<span class="dcc-hdr-phone-masked">📞 ${escHtml(showPhone(o.clientPhone))}</span>` : '')}
        </div>
      </div>

      <div class="dcc-hdr-stats">
        <span class="dcc-hdr-stat">📦 ${totalCount} منتج${totalCount > 1 ? '' : ''}${readyCount ? ` · ${readyCount} جاهز` : ''}</span>
        ${o.deadline ? `<span class="dcc-hdr-stat ${dLate > 0 ? 'dcc-hdr-stat-bad' : ''}">📅 ${escHtml(o.deadline)}${dLate > 0 ? ` · متأخر ${dLate} يوم` : ''}</span>` : ''}
        ${parseFloat(o.deposit) > 0 ? `<span class="dcc-hdr-stat dcc-hdr-stat-ok">💰 عربون ${fmtNum(o.deposit)} ج</span>` : ''}
        ${designerName ? `<span class="dcc-hdr-stat dcc-hdr-stat-info">🎨 ${escHtml(designerName)}</span>` : `<span class="dcc-hdr-stat dcc-hdr-stat-warn">⚠️ بدون مصمم</span>`}
      </div>

      <div class="dcc-hdr-actions">
        ${canSeePhone && o.clientPhone ? `<button type="button" class="dcc-hdr-btn dcc-hdr-btn-primary" onclick="openDesignOrderContactSheet('${escHtml(o._id)}')"><span class="dcc-hdr-btn-ico">📞</span><span class="dcc-hdr-btn-lbl">تواصل</span></button>` : ''}
        ${!isRejected ? `<button type="button" class="dcc-hdr-btn dcc-hdr-btn-success" onclick="approveOrder()"><span class="dcc-hdr-btn-ico">✅</span><span class="dcc-hdr-btn-lbl">اعتمد</span></button>` : ''}
        ${!isRejected ? `<button type="button" class="dcc-hdr-btn dcc-hdr-btn-danger" onclick="openReject()"><span class="dcc-hdr-btn-ico">✕</span><span class="dcc-hdr-btn-lbl">رفض</span></button>` : ''}
        <button type="button" class="dcc-hdr-btn" onclick="openDesignOrderActionSheet('${escHtml(o._id)}')"><span class="dcc-hdr-btn-ico">⋯</span><span class="dcc-hdr-btn-lbl">المزيد</span></button>
      </div>
    </div>`;
}

// ─── 3-TAB BODY ─────────────────────────────────────────────────────
export function designPanelBodyDCC(order = {}, ctx = {}) {
  const o = order;

  // Tab 1: Design tab — delegates to legacy renderer but slices specific sections.
  // We'll inject the legacy panel HTML into this tab, then hide the admin
  // sections via CSS (they're moved to other tabs in CC mode).
  const legacyHTML = (typeof window.renderPanelHTML === 'function')
    ? window.renderPanelHTML(o, ctx)
    : '<div class="dcc-empty-sm">تعذّر تحميل محتوى التصميم.</div>';

  // Tab 2: More (deposit, gallery, rejected reason, admin section moved here)
  // ملاحظة: السجل الزمني للأوردر يظهر فقط في صفحة تتبع الأوردر (order-tracking.html).
  const isAdmin = (ctx.currentRole === 'admin' || ctx.currentRole === 'operation_manager');
  const moreHTML = designMoreTabHTML(o, ctx, { isAdmin });

  return `
    <div class="dcc-tabs" id="dcc-tabs">
      <button type="button" class="dcc-tab on" data-dcctab="design" onclick="switchDesignPanelTab('design',this)">
        <span class="dcc-tab-ico">🎨</span><span class="dcc-tab-lbl">التصميم</span>
      </button>
      <button type="button" class="dcc-tab" data-dcctab="more" onclick="switchDesignPanelTab('more',this)">
        <span class="dcc-tab-ico">⚙️</span><span class="dcc-tab-lbl">المزيد</span>
      </button>
    </div>

    <div class="dcc-pane dcc-pane-design" id="dcc-pane-design" style="display:block">${legacyHTML}</div>
    <div class="dcc-pane" id="dcc-pane-more" style="display:none">${moreHTML}</div>`;
}

// ─── MORE TAB ──────────────────────────────────────────────────────
function designMoreTabHTML(order, ctx, { isAdmin } = {}) {
  const o = order;

  const section = (id_, icon, title, contentHTML, defaultOpen = false) => `
    <div class="dcc-acc ${defaultOpen ? 'is-open' : ''}" id="dcc-acc-${escHtml(id_)}">
      <button type="button" class="dcc-acc-head" onclick="dccToggleAccordion('${escHtml(id_)}')">
        <span class="dcc-acc-ico">${icon}</span>
        <span class="dcc-acc-title">${escHtml(title)}</span>
        <span class="dcc-acc-chev">▾</span>
      </button>
      <div class="dcc-acc-body">${contentHTML}</div>
    </div>`;

  const depositHTML = parseFloat(o.deposit) > 0
    ? `<div class="dcc-info-grid">
        <div class="dcc-info-row"><span>المبلغ</span><span style="color:var(--g);font-weight:var(--fw-extra)">${fmtNum(o.deposit)} ج</span></div>
        ${o.depositWallet ? `<div class="dcc-info-row"><span>المحفظة</span><span>${escHtml(o.depositWallet)}</span></div>` : ''}
        ${o.depositReceiptUrl ? `<div class="dcc-info-row"><span>الإيصال</span><a href="${escHtml(o.depositReceiptUrl)}" target="_blank" rel="noopener" style="color:var(--b)">📷 عرض الإيصال</a></div>` : ''}
      </div>`
    : `<div class="dcc-empty-sm">لا يوجد عربون مدفوع.</div>`;

  const rejectedHTML = (o.designStage === 'rejected' && o.rejectReason)
    ? `<div class="dcc-reject-box">
        <div class="dcc-reject-lbl">✕ سبب الرفض</div>
        <div class="dcc-reject-body">${escHtml(o.rejectReason)}</div>
      </div>`
    : '';

  // Admin section: stage transitions + financial edit + delete.
  // Buttons here call the existing global functions on window — we don't
  // touch the business logic, just reorganize.
  const adminHTML = isAdmin
    ? `<div class="dcc-admin">
        <div class="dcc-admin-lbl">🛠 نقل المرحلة</div>
        <div class="dcc-admin-row">
          <button type="button" class="btn btn-sm" onclick="moveOrderStage('design')">✏️ تصميم</button>
          <button type="button" class="btn btn-sm" onclick="moveOrderStage('printing')">🖨️ طباعة</button>
          <button type="button" class="btn btn-sm" onclick="moveOrderStage('production')">🏭 تنفيذ</button>
          <button type="button" class="btn btn-sm" onclick="moveOrderStage('shipping')">🚚 شحن</button>
          <button type="button" class="btn btn-sm" onclick="moveOrderStage('archived')">📁 أرشيف</button>
        </div>
        <div class="dcc-admin-lbl" style="margin-top:14px">💰 تعديل مالي</div>
        <div class="dcc-admin-fin">
          <div><label>السعر</label><input id="adm-price" class="inp" type="number" value="${o.salePrice || 0}"></div>
          <div><label>المدفوع</label><input id="adm-paid" class="inp" type="number" value="${o.totalPaid || o.deposit || 0}"></div>
          <div><label>خصم</label><input id="adm-discount" class="inp" type="number" value="${o.discount || 0}"></div>
          <button type="button" class="btn btn-b btn-sm" onclick="saveAdminFinance()" style="margin-top:8px">💾 حفظ</button>
        </div>
        <div class="dcc-admin-lbl" style="margin-top:14px;color:var(--r)">⚠️ خطر</div>
        <button type="button" class="btn btn-danger btn-sm" onclick="deleteOrderFromDesign()">🗑 حذف الأوردر</button>
      </div>`
    : `<div class="dcc-empty-sm">قسم الإدارة متاح للأدمن وقادة العمليات فقط.</div>`;

  // Gallery publish: only for designer roles
  const isDesigner = (ctx.currentRole === 'graphic_designer' || ctx.currentRole === 'design_operator');
  const galleryHTML = isDesigner
    ? `<button type="button" class="btn btn-sm" onclick="openPublishMockup()">＋ نشر موك أب للمعرض العام</button>`
    : `<div class="dcc-empty-sm">النشر للمعرض متاح للمصممين فقط.</div>`;

  return `
    <div class="dcc-more">
      ${rejectedHTML}
      ${section('deposit', '💰', 'العربون والمالية', depositHTML, parseFloat(o.deposit) > 0)}
      ${section('gallery', '🖼️', 'نشر للمعرض العام', galleryHTML, false)}
      ${isAdmin ? section('admin', '🛠', 'إدارة الأوردر (Admin)', adminHTML, false) : ''}
    </div>`;
}

// ─── INTERACTIVE: TAB SWITCH + ACCORDION ────────────────────────────
export function switchDesignPanelTab(tab, btn) {
  document.querySelectorAll('.dcc-tab').forEach(b => b.classList.remove('on'));
  if (btn) btn.classList.add('on');
  ['design', 'more'].forEach(t => {
    const pane = document.getElementById('dcc-pane-' + t);
    if (pane) pane.style.display = t === tab ? 'block' : 'none';
  });
}

export function dccToggleAccordion(id) {
  const acc = document.getElementById('dcc-acc-' + id);
  if (acc) acc.classList.toggle('is-open');
}

// ─── BOTTOM SHEETS ──────────────────────────────────────────────────
// Look up the active order. Prefers the cache populated by
// renderDesignPanelDCC (since `orders`/`currentRole` are module-scoped
// in design.html). Falls back to window.orders if exposed.
function _getActiveOrder(orderId) {
  if (window.__dccActiveOrder && (!orderId || window.__dccActiveOrder._id === orderId)) {
    return window.__dccActiveOrder;
  }
  const list = (typeof window.orders !== 'undefined') ? window.orders : [];
  return list.find(x => x._id === orderId) || null;
}

export function openDesignOrderContactSheet(orderId) {
  const o = _getActiveOrder(orderId);
  if (!o) {
    console.warn('[openDesignOrderContactSheet] no active order');
    if (window.toast) window.toast('تعذّر تحميل بيانات الطلب', 'err');
    return;
  }
  const canSeePhone = (typeof window.canSeePhone === 'function') ? window.canSeePhone() : false;
  if (!canSeePhone || !o.clientPhone) {
    if (window.toast) window.toast('رقم العميل محجوب — تواصل عبر خدمة العملاء', 'warn');
    return;
  }

  const ph = (o.clientPhone || '').replace(/^0/, '');
  const phLocal = o.clientPhone || '';
  const items = [
    { icon: '📞', label: 'اتصال هاتفي', hint: phLocal, variant: 'primary', href: `tel:${phLocal}` },
    { icon: '💬', label: 'واتساب', hint: phLocal, variant: 'success', href: `https://wa.me/20${ph}`, target: '_blank' },
    {
      icon: '📨', label: 'رسالة جاهزة (تصميمك قيد العمل)', variant: 'success',
      href: `https://wa.me/20${ph}?text=${encodeURIComponent(`أهلاً ${o.clientName || ''} 👋، طلبك ${o.orderId || ''} في مرحلة التصميم 🎨`)}`,
      target: '_blank',
    },
  ];

  openBottomSheet({
    title: `📞 تواصل — ${o.clientName || ''}`,
    subtitle: `طلب ${o.orderId || ''}`,
    items,
    cancelLabel: 'إلغاء',
  });
}

export function openDesignOrderActionSheet(orderId) {
  const o = _getActiveOrder(orderId);
  if (!o) {
    console.warn('[openDesignOrderActionSheet] no active order');
    if (window.toast) window.toast('تعذّر تحميل بيانات الطلب', 'err');
    return;
  }
  // Role comes from the cached ctx (populated by renderDesignPanelDCC).
  // `currentRole` in design.html is module-scoped.
  const role = (window.__dccActiveCtx && window.__dccActiveCtx.currentRole) || window.currentRole || '';
  const currentUid = (window.__dccActiveCtx && window.__dccActiveCtx.currentUserUid) || '';
  const canAssign = ['admin','operation_manager','customer_service'].includes(role);
  const canCreateOrderForClient = ['admin','operation_manager','customer_service'].includes(role);
  const isDesigner = (role === 'graphic_designer' || role === 'design_operator');
  const assignedToMe = isDesigner && (o.designerId === currentUid);
  const notRejected = o.designStage !== 'rejected';
  const items = [
    canCreateOrderForClient && o.clientId && {
      icon: '＋', label: `أوردر جديد لـ ${o.clientName || 'العميل'}`,
      hint: 'يفتح طلب جديد لنفس العميل (مع الحفاظ على الـ flow المركزي)',
      variant: 'success',
      // Navigate to clients.html with deep-link: opens client panel + auto-fires new-order modal.
      // Centralized — reuses openNewOrder() flow (RULE A1). No duplicate logic in design page.
      href: `clients.html?openClient=${encodeURIComponent(o.clientId)}&newOrder=1`,
    },
    canAssign && {
      icon: '👤', label: o.designerId ? 'تغيير المصمم' : 'تعيين مصمم', variant: 'primary',
      onClick: () => { try { window.openAssignDesigner?.(); } catch (_) {} },
    },
    assignedToMe && !o.designerAcceptedAt && {
      icon: '✓', label: 'استلم الأوردر وابدأ العمل', variant: 'success',
      onClick: () => { try { window.acceptOrder?.(); } catch (_) {} },
    },
    notRejected && {
      icon: '📎', label: 'رفع/تعديل ملف التصميم',
      onClick: () => { try { window.openUpload?.(); } catch (_) {} },
    },
    notRejected && {
      icon: '✏️', label: 'تعديل بيانات/ملاحظة التصميم',
      onClick: () => { try { window.editDesignNotes?.(); } catch (_) {} },
    },
    { section: '🔄 الحالة' },
    notRejected && {
      icon: '⏳', label: 'تعيين الحالة: في الانتظار',
      onClick: () => { try { window.setDS?.('pending'); } catch (_) {} },
    },
    notRejected && {
      icon: '🎨', label: 'تعيين الحالة: جاري التصميم',
      onClick: () => { try { window.setDS?.('wip'); } catch (_) {} },
    },
    notRejected && {
      icon: '📤', label: 'تعيين الحالة: انتظار التحويل',
      onClick: () => { try { window.setDS?.('awaiting_payment'); } catch (_) {} },
    },
    { section: '🛠 أخرى' },
    {
      icon: '📤', label: 'إرسال لموظف',
      onClick: () => { try { window.shareOrderToInbox?.(orderId); } catch (_) {} },
    },
    {
      icon: '💬', label: 'تعليقات الأوردر',
      onClick: () => { try { window.openOrderCommentsFromHere?.(orderId); } catch (_) {} },
    },
    {
      icon: '📋', label: 'التتبع الكامل للأوردر',
      href: `order-tracking.html?id=${encodeURIComponent(orderId)}`,
    },
  ].filter(Boolean);

  // Clean stray section markers with no following item
  const cleaned = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.section && !it.label) {
      if (items[i + 1] && !items[i + 1].section) cleaned.push(it);
    } else {
      cleaned.push(it);
    }
  }

  openBottomSheet({
    title: `الأوردر ${o.orderId || ''}`,
    subtitle: o.clientName || '',
    items: cleaned,
    cancelLabel: 'إلغاء',
  });
}

// ─── RENDER HOOK (called from design.html's openOrder) ──────────────
/**
 * renderDesignPanelDCC(order, ctx) — full DCC panel render.
 *
 * ctx: { currentRole, designers, currentUserUid }
 *
 * Behavior:
 *   • Replaces pn-hdr content with CC sticky header.
 *   • Hides legacy approve/reject buttons (now inside CC header).
 *   • Replaces panel-body with 3-tab structure.
 *   • Returns true on success. Caller can fall back to legacy on false.
 */
export function renderDesignPanelDCC(order, ctx = {}) {
  if (!order) return false;
  try {
    const hdr = document.getElementById('pn-hdr');
    const body = document.getElementById('panel-body');
    if (!hdr || !body) return false;

    // Cache the active order + ctx so bottom-sheet readers can access them.
    // `orders`, `currentRole`, `auth` in design.html are ES-module-scoped
    // (not on window). Caching here gives the sheets a stable reference
    // without forcing design.html to expose internal state globally.
    try { window.__dccActiveOrder = order; window.__dccActiveCtx = ctx; } catch (_) {}

    hdr.innerHTML = designPanelHeaderDCC(order, ctx);

    // Hide legacy approve/reject buttons in panel-head (now in DCC actions).
    const legacyApprove = document.getElementById('pn-approve');
    const legacyReject = document.getElementById('pn-reject');
    if (legacyApprove) legacyApprove.style.display = 'none';
    if (legacyReject) legacyReject.style.display = 'none';

    body.innerHTML = designPanelBodyDCC(order, ctx);
    return true;
  } catch (e) {
    console.warn('[renderDesignPanelDCC] failed, fallback to legacy:', e);
    return false;
  }
}

// ─── DEV TOGGLE ─────────────────────────────────────────────────────
export function toggleDesignControlCenter(enable) {
  const next = enable === undefined ? !isDesignControlCenterOn() : !!enable;
  setFeatureFlag(DCC_FLAG, next);
  try { window.location.reload(); } catch (_) {}
}

// ─── EXPOSE TO WINDOW ───────────────────────────────────────────────
if (typeof window !== 'undefined') {
  Object.assign(window, {
    isDesignControlCenterOn,
    renderDesignPanelDCC,
    designPanelHeaderDCC,
    designPanelBodyDCC,
    designTimelineHTML,
    buildOrderTimeline,
    openDesignOrderContactSheet,
    openDesignOrderActionSheet,
    switchDesignPanelTab,
    dccToggleAccordion,
    toggleDesignControlCenter,
  });
}
