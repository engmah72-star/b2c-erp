/**
 * Business2Card ERP — print-control-center.js
 *
 * Print Production Control Center mode.
 *
 * Provides 3-tab body layout for print.html panel — gated behind
 * `print.controlCenter` feature flag. When OFF the legacy single-scroll
 * body renders unchanged.
 *
 * Approach (minimal-risk):
 *   - الـ panel header الموجود يفضّل كما هو (لا يُمَس)
 *   - panel-body بقى يحتوي على 3 تابات بدل scroll واحد:
 *     • 🖨 الإنتاج — المحتوى الموجود من renderPanel (untouched)
 *     • ⏱ Timeline — events موحَّدة من order.timeline[]
 *     • ⚙️ المزيد — تعليمات الطباعة / إدارة / reference files (accordion)
 *
 * Side effects (window):
 *   window.isPrintControlCenterOn
 *   window.wrapPrintPanelInTabs
 *   window.switchPrintPanelTab
 *   window.pccToggleAccordion
 *   window.openPrintOrderContactSheet
 */

import { isFeatureEnabled, setFeatureFlag } from './core/feature-flags.js';
import { openBottomSheet } from './core/bottom-sheet.js';

const PCC_FLAG = 'print.controlCenter';
export function isPrintControlCenterOn() { return isFeatureEnabled(PCC_FLAG, true); }

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

function daysOverDeadline(deadline) {
  if (!deadline) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(deadline).getTime()) / 86400000));
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

// ─── BUILD UNIFIED TIMELINE ─────────────────────────────────────────
export function buildPrintTimeline(order = {}) {
  const events = [];

  const createdTs = tsSeconds(order.createdAt);
  if (createdTs) {
    events.push({
      ts: createdTs, icon: '🆕', color: 'var(--p)',
      title: 'تم إنشاء الطلب',
      subtitle: (order.products || []).map(p => p.name).join(' + ') || order.product || '',
      actor: order.createdByName || '',
    });
  }

  for (const t of (order.timeline || [])) {
    if (!t || !t.action) continue;
    const tts = tsSeconds(t.date || t.at || t.createdAt);
    if (!tts) continue;
    if (tts === createdTs && (t.action || '').includes('إنشاء')) continue;
    const action = String(t.action);
    let icon = '🔄', color = 'var(--dim)';
    if (action.includes('طباعة') || action.includes('🖨️')) { icon = '🖨️'; color = 'var(--b)'; }
    else if (action.includes('تنفيذ') || action.includes('🏭')) { icon = '🏭'; color = 'var(--o)'; }
    else if (action.includes('شحن') || action.includes('🚚')) { icon = '🚚'; color = 'var(--c)'; }
    else if (action.includes('اعتمد') || action.includes('✅')) { icon = '✅'; color = 'var(--g)'; }
    else if (action.includes('رفض') || action.includes('✕')) { icon = '✕'; color = 'var(--r)'; }
    else if (action.includes('ملف') || action.includes('📎') || action.includes('📁')) { icon = '📎'; color = 'var(--c)'; }
    else if (action.includes('عربون') || action.includes('💰') || action.includes('💵')) { icon = '💰'; color = 'var(--g)'; }
    else if (action.includes('override') || action.includes('⚠️')) { icon = '⚠️'; color = 'var(--y)'; }
    events.push({
      ts: tts, icon, color,
      title: action,
      subtitle: t.note || t.comment || t.overrideReason || '',
      actor: t.by || t.byName || t.userName || '',
    });
  }

  return events.filter(e => e.ts > 0).sort((a, b) => b.ts - a.ts);
}

export function printTimelineHTML(events = []) {
  if (!events.length) {
    return `<div class="pcc-empty">
      <div class="pcc-empty-ico">⏱</div>
      <div class="pcc-empty-txt">لا توجد أحداث مسجَّلة بعد لهذا الطلب</div>
    </div>`;
  }

  const grouped = { today: [], yesterday: [], thisWeek: [], thisMonth: [], older: [] };
  for (const ev of events) grouped[timelineBucket(ev.ts)].push(ev);

  const renderEvent = (ev) => `
    <div class="pcc-tl-item">
      <div class="pcc-tl-line" style="--tl-col:${ev.color}"></div>
      <div class="pcc-tl-ico" style="background:${ev.color}22;color:${ev.color}">${ev.icon}</div>
      <div class="pcc-tl-body">
        <div class="pcc-tl-head">
          <div class="pcc-tl-title">${escHtml(ev.title)}</div>
          <div class="pcc-tl-time">${fmtTime(ev.ts)} · ${timeAgo(ev.ts)}</div>
        </div>
        ${ev.subtitle ? `<div class="pcc-tl-sub">${escHtml(ev.subtitle)}</div>` : ''}
        ${ev.actor ? `<div class="pcc-tl-actor">👤 ${escHtml(ev.actor)}</div>` : ''}
      </div>
    </div>`;

  return Object.entries(grouped)
    .filter(([, list]) => list.length)
    .map(([bucket, list]) => `
      <div class="pcc-tl-group">
        <div class="pcc-tl-bucket">${BUCKET_LABELS[bucket]} <span class="pcc-tl-count">${list.length}</span></div>
        ${list.map(renderEvent).join('')}
      </div>`).join('');
}

// ─── MORE TAB ──────────────────────────────────────────────────────
function printMoreTabHTML(order = {}) {
  const o = order;
  const section = (id_, icon, title, contentHTML, defaultOpen = false) => `
    <div class="pcc-acc ${defaultOpen ? 'is-open' : ''}" id="pcc-acc-${escHtml(id_)}">
      <button type="button" class="pcc-acc-head" onclick="pccToggleAccordion('${escHtml(id_)}')">
        <span class="pcc-acc-ico">${icon}</span>
        <span class="pcc-acc-title">${escHtml(title)}</span>
        <span class="pcc-acc-chev">▾</span>
      </button>
      <div class="pcc-acc-body">${contentHTML}</div>
    </div>`;

  // Reference design files / notes
  const refHTML = (o.designNote || o.refFileUrl)
    ? `<div class="pcc-info-grid">
        ${o.designNote ? `<div class="pcc-info-row"><span>📋 ملاحظة التصميم</span><span>${escHtml(o.designNote)}</span></div>` : ''}
        ${o.refFileUrl ? `<div class="pcc-info-row"><span>📎 ملف مرجعي</span><a href="${escHtml(o.refFileUrl)}" target="_blank" rel="noopener" style="color:var(--b)">فتح ↗</a></div>` : ''}
      </div>`
    : `<div class="pcc-empty-sm">لا توجد ملفات مرجعية.</div>`;

  // Print notes (read-only display)
  const notesHTML = o.printNotes
    ? `<div class="pcc-notes-box">${escHtml(o.printNotes)}</div>`
    : `<div class="pcc-empty-sm">لا توجد تعليمات طباعة.</div>`;

  // Order tracking link
  const trackHTML = `<a href="order-tracking.html?id=${escHtml(o._id || '')}" class="pcc-link" target="_blank" rel="noopener">📋 فتح التتبع الكامل ↗</a>`;

  // Print notes + Reference files + Tracking link — كلهم في tab "المزيد".
  // ملحوظة: إجراءات الـ admin (تعديل/بوليصة/مقدم/تحصيل/رفض) موجودة في
  // الـ "⋯ المزيد" sheet في الـ Sticky CC Header — مش بنكررها هنا.
  return `
    <div class="pcc-more">
      ${section('notes', '📝', 'تعليمات الطباعة', notesHTML, false)}
      ${section('ref', '📎', 'ملفات مرجعية', refHTML, false)}
      ${section('track', '📋', 'التتبع الكامل', trackHTML, false)}
    </div>`;
}

// ─── STICKY CC HEADER ──────────────────────────────────────────────
/**
 * renderPrintCCHeader(o, ctx) — builds the new sticky panel header.
 * Replaces the legacy inline header (#pn-id / #pn-name / #pn-phone +
 * call/wa/reject/close + 4 quick-action buttons) with a compact
 * critical-info strip + 4 primary actions.
 *
 * ctx = { canSeePhone, currentRole, getRem, getNet, getPaid, readyScore }
 */
export function renderPrintCCHeader(o = {}, ctx = {}) {
  const canSeePhone = typeof ctx.canSeePhone === 'function' ? ctx.canSeePhone() : false;
  const role = ctx.currentRole || '';
  const sale = typeof ctx.getNet === 'function' ? ctx.getNet(o) : (parseFloat(o.salePrice) || 0);
  const paid = typeof ctx.getPaid === 'function' ? ctx.getPaid(o) : (parseFloat(o.totalPaid) || 0);
  const rem = typeof ctx.getRem === 'function' ? ctx.getRem(o) : Math.max(0, sale - paid);
  const dLate = daysOverDeadline(o.deadline);
  const isAdmin = role === 'admin' || role === 'operation_manager' || role === 'customer_service';
  const products = o.products || [];
  const totalCount = products.length;
  const readyCount = products.filter(p => (p.productStatus || 'pending') === 'ready' || p.productStatus === 'printed' || p.productStatus === 'done').length;
  const printedCount = products.filter(p => p.productStatus === 'printed' || p.productStatus === 'done').length;
  const hasFinal = !!(o.printFinalUrl || (o.products || []).some(p => p.designImageUrl));
  // Ready Score: prefer global helper if exposed (print.html → computeOrderReadyScore)
  const rs = (typeof window.computeOrderReadyScore === 'function')
    ? window.computeOrderReadyScore(o)
    : { score: 0, missing: [] };
  const rsCol = rs.score >= 90 ? 'var(--g)' : rs.score >= 60 ? 'var(--y)' : 'var(--r)';
  const rsIco = rs.score >= 90 ? '✅' : rs.score >= 60 ? '🟡' : '🔴';
  const phMasked = (typeof window.showPhone === 'function') ? window.showPhone(o.clientPhone) : (o.clientPhone || '');

  return `
    <div class="pcc-hdr">
      <div class="pcc-hdr-top">
        <div class="pcc-hdr-id">🖨️ ${escHtml(o.orderId || (o._id || '').slice(-6))} · <span class="pcc-hdr-stage">طباعة</span></div>
        <div class="pcc-hdr-name">${escHtml(o.clientName || '—')}</div>
        <div class="pcc-hdr-meta">
          ${canSeePhone && o.clientPhone
            ? `<a href="tel:${escHtml(o.clientPhone)}" class="pcc-hdr-phone">📞 ${escHtml(o.clientPhone)}</a>`
            : (o.clientPhone ? `<span class="pcc-hdr-phone-masked">📞 ${escHtml(phMasked)}</span>` : '')}
        </div>
      </div>

      <div class="pcc-hdr-stats">
        <span class="pcc-hdr-stat" style="background:${rsCol}18;color:${rsCol};border-color:${rsCol}44" title="${escHtml(rs.missing.length ? 'ناقص: '+rs.missing.join(' · ') : 'جاهز للتنفيذ')}">${rsIco} ${rs.score}%</span>
        <span class="pcc-hdr-stat ${hasFinal ? 'pcc-hdr-stat-ok' : 'pcc-hdr-stat-bad'}">📁 ${hasFinal ? 'ملف ✓' : 'بدون ملف'}</span>
        ${totalCount > 0 ? `<span class="pcc-hdr-stat">📦 ${totalCount} منتج${printedCount ? ` · ${printedCount} مطبوع` : (readyCount ? ` · ${readyCount} جاهز` : '')}</span>` : ''}
        ${o.deadline ? `<span class="pcc-hdr-stat ${dLate > 0 ? 'pcc-hdr-stat-bad' : ''}">📅 ${escHtml(o.deadline)}${dLate > 0 ? ` · متأخر ${dLate}ي` : ''}</span>` : ''}
        ${sale > 0 ? `<span class="pcc-hdr-stat ${rem > 0 ? 'pcc-hdr-stat-warn' : 'pcc-hdr-stat-ok'}">💰 ${rem > 0 ? `باقي ${fmtNum(rem)}ج` : 'مكتمل'}</span>` : ''}
      </div>

      <div class="pcc-hdr-actions">
        ${canSeePhone && o.clientPhone
          ? `<button type="button" class="pcc-hdr-btn pcc-hdr-btn-primary" onclick="openPrintOrderContactSheet('${escHtml(o._id)}')"><span class="pcc-hdr-btn-ico">📞</span><span class="pcc-hdr-btn-lbl">تواصل</span></button>`
          : ''}
        <button type="button" class="pcc-hdr-btn pcc-hdr-btn-success" onclick="moveTo('production')"><span class="pcc-hdr-btn-ico">🏭</span><span class="pcc-hdr-btn-lbl">تحويل</span></button>
        <button type="button" class="pcc-hdr-btn" onclick="openPrintOrderActionSheet('${escHtml(o._id)}')"><span class="pcc-hdr-btn-ico">⋯</span><span class="pcc-hdr-btn-lbl">المزيد</span></button>
        <button type="button" class="pcc-hdr-btn pcc-hdr-btn-close" onclick="closePanel()" title="إغلاق"><span class="pcc-hdr-btn-ico">✕</span></button>
      </div>
    </div>`;
}

/**
 * openPrintOrderActionSheet(orderId) — bottom sheet للأكشن الإدارية اللي
 * كانت في الـ legacy header (تعديل المنتجات / البوليصة / مقدم / تحصيل / رفض).
 */
export function openPrintOrderActionSheet(orderId) {
  const o = window.activeOrder
    || (window.orders || []).find(x => x._id === orderId);
  if (!o) return;
  const role = window.currentRole || '';
  const canRejectRole = ['admin', 'operation_manager', 'customer_service'].includes(role);
  const sale = (typeof window.getNet === 'function') ? window.getNet(o) : (parseFloat(o.salePrice) || 0);
  const rem = (typeof window.getRem === 'function') ? window.getRem(o) : 0;
  const hasFinance = sale > 0 && rem > 0;

  const items = [
    {
      icon: '📦', label: 'تعديل المنتجات', variant: 'primary',
      onClick: () => { try { window.openEditProds?.(); } catch (_) {} },
    },
    {
      icon: '🧾', label: 'البوليصة',
      onClick: () => { try { window.openWaybill?.(); } catch (_) {} },
    },
    hasFinance && {
      icon: '💵', label: 'تسجيل مقدم', variant: 'success',
      onClick: () => { try { window.openPrintAdvance?.(); } catch (_) {} },
    },
    hasFinance && {
      icon: '💰', label: 'تحصيل', variant: 'success',
      onClick: () => { try { window.openCollect?.(); } catch (_) {} },
    },
    canRejectRole && {
      section: '⚠️ خطر',
      icon: '↩️', label: 'رفض الأوردر', variant: 'danger',
      onClick: () => { try { window.openReject?.(); } catch (_) {} },
    },
  ].filter(Boolean);

  // section markers cleanup (drop if no following item)
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

/**
 * applyPrintCCHeader(o, ctx) — renders the CC header into the panel and
 * hides the legacy inline header (lines 72-93 in print.html).
 * Idempotent — safe to call on every openOrder.
 */
export function applyPrintCCHeader(o, ctx) {
  if (!o) return false;
  try {
    const panelEl = document.querySelector('#panel-ov .panel');
    if (!panelEl) return false;

    // Find or create the CC header container at the top of the panel
    // (after .panel-drag, before the legacy sticky header).
    let ccContainer = document.getElementById('pcc-cc-header');
    if (!ccContainer) {
      ccContainer = document.createElement('div');
      ccContainer.id = 'pcc-cc-header';
      const drag = panelEl.querySelector('.panel-drag');
      if (drag && drag.nextSibling) {
        panelEl.insertBefore(ccContainer, drag.nextSibling);
      } else {
        panelEl.insertBefore(ccContainer, panelEl.firstChild);
      }
    }

    ccContainer.innerHTML = renderPrintCCHeader(o, ctx);

    // Hide the legacy sticky header. It's the first <div> sibling after
    // .panel-drag that has the inline `position:sticky;top:0` style.
    const legacyHeader = panelEl.querySelector(':scope > div[style*="position:sticky"][style*="top:0"]');
    if (legacyHeader && legacyHeader !== ccContainer) {
      legacyHeader.style.display = 'none';
    }

    // Hide the legacy sticky footer (تحويل للتنفيذ) — الـ CC header فيه
    // الزر دلوقتي. الـ footer كان بـ bottom:0 + flex-shrink:0.
    const legacyFooter = panelEl.querySelector(':scope > div[style*="position:sticky"][style*="bottom:0"]');
    if (legacyFooter) {
      legacyFooter.style.display = 'none';
    }
    return true;
  } catch (e) {
    console.warn('[applyPrintCCHeader] failed:', e);
    return false;
  }
}

// ─── TAB SHELL — wraps existing panel body content ─────────────────
/**
 * wrapPrintPanelInTabs(order, productionBodyHTML)
 *
 * يأخذ الـ HTML الموجود من renderPanel ويلفّه في 3-tab structure.
 * Tab 1 (الإنتاج) يحتوي على نفس المحتوى القديم — كل الـ handlers
 * (uploadPrintFinal, openEditProds, setProductStatus...) تشتغل كما هي.
 */
export function wrapPrintPanelInTabs(order = {}, productionBodyHTML = '') {
  // ملاحظة: السجل الزمني للأوردر يظهر فقط في صفحة تتبع الأوردر (order-tracking.html).
  return `
    <div class="pcc-tabs" id="pcc-tabs">
      <button type="button" class="pcc-tab on" data-pcctab="production" onclick="switchPrintPanelTab('production',this)">
        <span class="pcc-tab-ico">🖨</span><span class="pcc-tab-lbl">الإنتاج</span>
      </button>
      <button type="button" class="pcc-tab" data-pcctab="more" onclick="switchPrintPanelTab('more',this)">
        <span class="pcc-tab-ico">⚙️</span><span class="pcc-tab-lbl">المزيد</span>
      </button>
    </div>

    <div class="pcc-pane" id="pcc-pane-production" style="display:block">${productionBodyHTML}</div>
    <div class="pcc-pane" id="pcc-pane-more" style="display:none">${printMoreTabHTML(order)}</div>`;
}

// ─── INTERACTIVE ────────────────────────────────────────────────────
export function switchPrintPanelTab(tab, btn) {
  document.querySelectorAll('.pcc-tab').forEach(b => b.classList.remove('on'));
  if (btn) btn.classList.add('on');
  ['production', 'more'].forEach(t => {
    const pane = document.getElementById('pcc-pane-' + t);
    if (pane) pane.style.display = t === tab ? 'block' : 'none';
  });
}

export function pccToggleAccordion(id) {
  const acc = document.getElementById('pcc-acc-' + id);
  if (acc) acc.classList.toggle('is-open');
}

// ─── CONTACT SHEET — same UX as design/clients ─────────────────────
/**
 * Replaces the 2 small phone/wa buttons in the panel header with a
 * unified contact sheet. Called from a wrapper button in the header.
 */
export function openPrintOrderContactSheet(orderId) {
  // Look up the active order. print.html exposes `activeOrder` on window
  // (set in openOrder); fall back to window.orders array.
  const o = window.activeOrder
    || (window.orders || []).find(x => x._id === orderId);
  if (!o) return;
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
      icon: '📨', label: 'رسالة جاهزة (طلبك في مرحلة الطباعة)', variant: 'success',
      href: `https://wa.me/20${ph}?text=${encodeURIComponent(`أهلاً ${o.clientName || ''} 👋، طلبك ${o.orderId || ''} في مرحلة الطباعة 🖨️`)}`,
      target: '_blank',
    },
  ];

  openBottomSheet({
    title: `📞 تواصل — ${o.clientName || ''}`,
    subtitle: `طلب ${o.orderId || ''}`,
    items, cancelLabel: 'إلغاء',
  });
}

// ─── DEV TOGGLE ─────────────────────────────────────────────────────
export function togglePrintControlCenter(enable) {
  const next = enable === undefined ? !isPrintControlCenterOn() : !!enable;
  setFeatureFlag(PCC_FLAG, next);
  try { window.location.reload(); } catch (_) {}
}

// ─── EXPOSE TO WINDOW ───────────────────────────────────────────────
if (typeof window !== 'undefined') {
  Object.assign(window, {
    isPrintControlCenterOn,
    wrapPrintPanelInTabs,
    switchPrintPanelTab,
    pccToggleAccordion,
    openPrintOrderContactSheet,
    openPrintOrderActionSheet,
    renderPrintCCHeader,
    applyPrintCCHeader,
    buildPrintTimeline,
    printTimelineHTML,
    togglePrintControlCenter,
  });
}
