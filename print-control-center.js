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
 * renderPrintCCHeader(o, ctx) — compact order-centric header.
 * Row 1: product summary (what needs printing) + close button
 * Row 2: order ID · client name · delay (small metadata)
 * Row 3: 4 stat badges
 * Row 4: dynamic primary CTA (context-aware next action) + secondary btns
 *
 * ctx = { canSeePhone, currentRole, getRem, getNet, getPaid }
 */
export function renderPrintCCHeader(o = {}, ctx = {}) {
  const canSeePhone = typeof ctx.canSeePhone === 'function' ? ctx.canSeePhone() : false;
  const sale = typeof ctx.getNet === 'function' ? ctx.getNet(o) : (parseFloat(o.salePrice) || 0);
  const paid = typeof ctx.getPaid === 'function' ? ctx.getPaid(o) : (parseFloat(o.totalPaid) || 0);
  const rem  = typeof ctx.getRem === 'function' ? ctx.getRem(o) : Math.max(0, sale - paid);
  const dLate = daysOverDeadline(o.deadline);

  const products     = o.products || [];
  const totalCount   = products.length;
  const printedCount = products.filter(p => p.productStatus === 'printed' || p.productStatus === 'done').length;
  const anyAtPress   = products.some(p => p.productStatus === 'at-press' || !!p.briefSentAt);
  const allPrinted   = totalCount > 0 && printedCount === totalCount;

  // Products summary — the real subject of work in print stage
  const prodSummary = products.slice(0, 3)
    .map(p => escHtml(`${p.name || '?'}${p.qty ? ' ×' + p.qty : ''}`))
    .join(' · ') + (products.length > 3 ? ` +${products.length - 3}` : '');

  // Ready score
  const rs    = (typeof window.computeOrderReadyScore === 'function') ? window.computeOrderReadyScore(o) : { score: 0, missing: [] };
  const rsCol = rs.score >= 90 ? 'var(--g)' : rs.score >= 60 ? 'var(--y)' : 'var(--r)';
  const rsIco = rs.score >= 90 ? '✅' : rs.score >= 60 ? '🟡' : '🔴';

  // File status
  const hasFinal = !!(o.printFinalUrl || products.some(p =>
    p.designImageUrl || (Array.isArray(p.designImages) && p.designImages.filter(Boolean).length > 0)
  ));

  // Dynamic primary CTA — one clear next action
  let ctaIcon, ctaLabel, ctaStyle, ctaOnClick;
  if (!hasFinal) {
    ctaIcon    = '📁';
    ctaLabel   = 'أضف ملف التصميم';
    ctaStyle   = 'background:rgba(239,68,68,.15);border-color:rgba(239,68,68,.45);color:var(--r)';
    ctaOnClick = `switchPrintPanelTab('files',null)`;
  } else if (rs.score < 70) {
    ctaIcon    = '📝';
    ctaLabel   = `أكمل المواصفات (${rs.score}%)`;
    ctaStyle   = 'background:rgba(245,158,11,.15);border-color:rgba(245,158,11,.45);color:var(--y)';
    ctaOnClick = `switchPrintPanelTab('specs',null)`;
  } else if (allPrinted) {
    ctaIcon    = '🏭';
    ctaLabel   = 'تحويل للإنتاج';
    ctaStyle   = 'background:rgba(59,158,255,.15);border-color:rgba(59,158,255,.45);color:var(--b)';
    ctaOnClick = `moveTo('production')`;
  } else if (anyAtPress) {
    ctaIcon    = '✅';
    ctaLabel   = 'تأكيد: تمت الطباعة الكلية';
    ctaStyle   = 'background:rgba(167,139,250,.15);border-color:rgba(167,139,250,.45);color:var(--p)';
    ctaOnClick = `markOrderAllPrinted('${escHtml(o._id || '')}')`;
  } else {
    ctaIcon    = '🖨️';
    ctaLabel   = 'إرسال ملخص للمطبعة';
    ctaStyle   = 'background:rgba(37,211,102,.12);border-color:rgba(37,211,102,.35);color:#25D366';
    ctaOnClick = `openProductionSheet('${escHtml(o._id || '')}')`;
  }

  const phoneBtn = canSeePhone && o.clientPhone
    ? `<button type="button" class="pcc-hdr-btn-sm" onclick="openPrintOrderContactSheet('${escHtml(o._id)}')">
         <span>📞</span><span>تواصل</span>
       </button>`
    : '';

  return `
    <div class="pcc-hdr">
      <div class="pcc-hdr-row1">
        <div class="pcc-hdr-prods">${prodSummary || '—'}</div>
        <button type="button" class="pcc-hdr-close-btn" onclick="closePanel()" aria-label="إغلاق">✕</button>
      </div>
      <div class="pcc-hdr-row2">
        <span class="pcc-hdr-id2">${escHtml(o.orderId || (o._id || '').slice(-6))}</span>
        <span class="pcc-hdr-dot">·</span>
        <span class="pcc-hdr-client">${escHtml(o.clientName || '—')}</span>
        ${dLate > 0 ? `<span class="pcc-hdr-dot">·</span><span style="color:var(--r);font-size:var(--fs-xs)">⚠️ ${dLate}ي</span>` : ''}
      </div>
      <div class="pcc-hdr-stats">
        <span class="pcc-hdr-stat" style="background:${rsCol}18;color:${rsCol};border-color:${rsCol}44">${rsIco} ${rs.score}%</span>
        <span class="pcc-hdr-stat ${hasFinal ? 'pcc-hdr-stat-ok' : 'pcc-hdr-stat-bad'}">📁 ${hasFinal ? 'ملف ✓' : 'بدون ملف'}</span>
        ${o.deadline ? `<span class="pcc-hdr-stat ${dLate > 0 ? 'pcc-hdr-stat-bad' : ''}">📅 ${escHtml(o.deadline)}</span>` : ''}
        ${sale > 0 ? `<span class="pcc-hdr-stat ${rem > 0 ? 'pcc-hdr-stat-warn' : 'pcc-hdr-stat-ok'}">💰 ${rem > 0 ? `${fmtNum(rem)}ج` : 'مكتمل'}</span>` : ''}
      </div>
      <div class="pcc-hdr-cta-row">
        <button type="button" class="pcc-hdr-cta" onclick="${ctaOnClick}" style="${ctaStyle}">${ctaIcon} ${ctaLabel}</button>
        <div class="pcc-hdr-sec">
          ${phoneBtn}
          <button type="button" class="pcc-hdr-btn-sm" onclick="openPrintOrderActionSheet('${escHtml(o._id || '')}')">
            <span>⋯</span><span>المزيد</span>
          </button>
        </div>
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
      icon: '💰', label: 'تعديل المبالغ (الكلي + المقدم)', variant: 'primary',
      onClick: () => { try { window.openEditAmounts?.(); } catch (_) {} },
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

// ─── FILES TAB ──────────────────────────────────────────────────────
function printFilesTabHTML(o = {}) {
  const products = o.products || [];
  if (!products.length) {
    return `<div class="pcc-empty"><div class="pcc-empty-ico">📦</div><div class="pcc-empty-txt">لا توجد منتجات في هذا الطلب</div></div>`;
  }

  const prodCards = products.map((p, idx) => {
    const imgs = Array.isArray(p.designImages) ? p.designImages.filter(Boolean) : [];
    if (p.designImageUrl && !imgs.includes(p.designImageUrl)) imgs.unshift(p.designImageUrl);

    const extraCount = imgs.length > 4 ? imgs.length - 4 : 0;
    const thumbsHTML = imgs.slice(0, 4).map((img, i) => `
      <div style="position:relative;width:56px;height:56px;flex-shrink:0">
        <img src="${escHtml(img)}" loading="lazy"
          onclick="event.stopPropagation();window.open('${img.replace(/'/g, "\\'")}','_blank')"
          style="width:56px;height:56px;border-radius:8px;object-fit:cover;border:1px solid var(--line);cursor:zoom-in;display:block" alt="">
        ${extraCount > 0 && i === 3
          ? `<div style="position:absolute;inset:0;border-radius:8px;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:800">+${extraCount}</div>`
          : ''}
      </div>`).join('');

    const emptyZone = `
      <div onclick="openEditProds(${idx})" role="button" tabindex="0"
           style="width:100%;padding:18px 12px;border:2px dashed var(--line2);border-radius:10px;text-align:center;cursor:pointer;background:rgba(239,68,68,.04)">
        <div style="font-size:22px;margin-bottom:4px">📁</div>
        <div style="font-size:var(--fs-xs);color:var(--r);font-weight:var(--fw-bold)">أضف صور التصميم</div>
        <div style="font-size:var(--fs-tiny);color:var(--dim2);margin-top:2px">اضغط لتعديل المنتج وإضافة الصور</div>
      </div>`;

    return `
      <div style="padding:12px 14px;border-bottom:1px solid var(--line)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div>
            <span style="font-size:var(--fs-sm);font-weight:var(--fw-heavy)">${escHtml(p.name || 'منتج')}</span>
            <span style="font-size:var(--fs-xs);color:var(--y);font-weight:var(--fw-bold);margin-right:6px">×${escHtml(String(p.qty || '?'))}</span>
          </div>
          <button type="button" onclick="openEditProds(${idx})"
                  style="font-size:var(--fs-xs);padding:4px 10px;border-radius:7px;border:1px solid var(--line);background:var(--bg3);color:var(--dim2);font-family:inherit;cursor:pointer;font-weight:var(--fw-bold)">
            ✏️ تعديل
          </button>
        </div>
        ${imgs.length
          ? `<div style="display:flex;gap:8px;flex-wrap:wrap">${thumbsHTML}</div>
             <button type="button" onclick="openEditProds(${idx})"
                     style="margin-top:8px;font-size:var(--fs-xs);color:var(--b);background:none;border:none;cursor:pointer;font-family:inherit;font-weight:var(--fw-bold);padding:0">+ إضافة صورة</button>`
          : emptyZone}
      </div>`;
  }).join('');

  const noteHTML = o.designNote
    ? `<div style="padding:12px 14px">
         <div style="font-size:var(--fs-xs);color:var(--dim2);font-weight:var(--fw-bold);margin-bottom:6px">📋 ملاحظة التصميم</div>
         <div style="font-size:var(--fs-sm);color:var(--snow-soft);line-height:1.5;white-space:pre-wrap">${escHtml(o.designNote)}</div>
       </div>`
    : '';

  return `<div>${prodCards}${noteHTML}</div>`;
}

// ─── SPECS TAB ──────────────────────────────────────────────────────
function printSpecsTabHTML(o = {}) {
  const products = o.products || [];
  if (!products.length) {
    return `<div class="pcc-empty"><div class="pcc-empty-ico">📋</div><div class="pcc-empty-txt">لا توجد منتجات في هذا الطلب</div></div>`;
  }

  const prodCards = products.map((p, idx) => {
    const isOffset  = (p.printType || '').includes('offset');
    const isDigital = (p.printType || '').includes('digital');
    const ptLabel   = isOffset && isDigital ? 'مختلط' : isOffset ? 'أوفست' : isDigital ? 'ديجيتال' : '';
    const ptCol     = isOffset ? 'var(--y)' : isDigital ? 'var(--b)' : 'var(--dim)';

    const rr    = (typeof window.computeProductReadiness === 'function') ? window.computeProductReadiness(o, p) : { pct: 0, ready: false, critical: [], warnings: [] };
    const rrCol = rr.ready ? 'var(--g)' : rr.pct >= 60 ? 'var(--y)' : 'var(--r)';

    const specRows = [
      p.paper ? ['الورق', `${escHtml(p.paper)}${p.weight ? ' ' + escHtml(String(p.weight)) + 'جم' : ''}`] : null,
      (p.printSize || p.size) ? ['المقاس', escHtml(p.printSize || p.size)] : null,
      p.lamination && p.lamination !== 'بلا' ? ['التشطيب', escHtml(p.lamination)] : null,
      isOffset && p.zinkType  ? ['الزنك', escHtml(p.zinkType)]  : null,
      isOffset && p.colorCount ? ['الألوان', escHtml(String(p.colorCount))] : null,
      isOffset && p.cutSize   ? ['القطع', escHtml(p.cutSize)]   : null,
      p.pressName     ? ['المطبعة', escHtml(p.pressName)] : null,
      p.pressDeadline ? ['موعد المطبعة', escHtml(p.pressDeadline)] : null,
      p.briefSentAt
        ? ['البريف', `<span style="color:var(--g);font-weight:800">✅ أُرسل${p.briefSentByName ? ' · ' + escHtml(p.briefSentByName) : ''}</span>`]
        : null,
    ].filter(Boolean);

    const criticalHTML = rr.critical && rr.critical.length
      ? `<div style="margin-top:8px;padding:8px 10px;border-radius:8px;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.2)">
           <div style="font-size:var(--fs-tiny);color:var(--r);font-weight:var(--fw-bold)">⚠️ ناقص: ${rr.critical.slice(0, 5).map(c => escHtml(c)).join(' · ')}</div>
         </div>`
      : '';

    return `
      <div style="padding:12px 14px;border-bottom:1px solid var(--line)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span style="font-size:var(--fs-sm);font-weight:var(--fw-heavy)">${escHtml(p.name || 'منتج')}</span>
            <span style="font-size:var(--fs-xs);color:var(--y);font-weight:var(--fw-bold)">×${escHtml(String(p.qty || '?'))}</span>
            ${ptLabel ? `<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:${ptCol}18;color:${ptCol};border:1px solid ${ptCol}33;font-weight:800">${ptLabel}</span>` : ''}
            <span style="font-size:var(--fs-xs);color:${rrCol};font-weight:var(--fw-bold)">${rr.ready ? '✅' : `${rr.pct}%`}</span>
          </div>
          <button type="button" onclick="openEditProds(${idx})"
                  style="font-size:var(--fs-xs);padding:4px 10px;border-radius:7px;border:1px solid var(--line);background:var(--bg3);color:var(--dim2);font-family:inherit;cursor:pointer;font-weight:var(--fw-bold);flex-shrink:0">
            ✏️ تعديل
          </button>
        </div>
        ${specRows.length
          ? `<div style="display:flex;flex-direction:column;gap:4px">
               ${specRows.map(([label, val]) => `
                 <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:5px 8px;background:var(--bg3);border-radius:7px;font-size:var(--fs-sm);gap:10px">
                   <span style="color:var(--dim2);flex-shrink:0">${label}</span>
                   <span style="font-weight:var(--fw-bold);text-align:start">${val}</span>
                 </div>`).join('')}
             </div>`
          : `<div style="font-size:var(--fs-xs);color:var(--dim2);text-align:center;padding:12px 0">لم تُضَف مواصفات بعد</div>`}
        ${criticalHTML}
      </div>`;
  }).join('');

  return `<div>${prodCards}</div>`;
}

// ─── TAB SHELL — wraps existing panel body content ─────────────────
/**
 * wrapPrintPanelInTabs(order, productionBodyHTML)
 *
 * يأخذ الـ HTML الموجود من renderPanel ويلفّه في 4-tab structure.
 * Tab 1 (الملفات) — صور التصميم لكل منتج، افتراضي.
 * Tab 2 (المواصفات) — مواصفات الطباعة لكل منتج + readiness.
 * Tab 3 (الطلب) — المحتوى القديم من renderPanel (untouched handlers).
 * Tab 4 (السجل) — timeline موحّد.
 */
export function wrapPrintPanelInTabs(order = {}, productionBodyHTML = '', opts = {}) {
  // Count missing design files for badge warning
  const missingFiles = (order.products || []).filter(p => {
    const imgs = Array.isArray(p.designImages) ? p.designImages.filter(Boolean).length : 0;
    return imgs === 0 && !p.designImageUrl;
  }).length;
  const totalFiles = (order.products || []).reduce((n, p) => {
    const imgs = Array.isArray(p.designImages) ? p.designImages.filter(Boolean).length : 0;
    return n + imgs + (p.designImageUrl ? 1 : 0);
  }, 0);

  const tlEvents = buildPrintTimeline(order);

  return `
    <div class="pcc-tabs" id="pcc-tabs">
      <button type="button" class="pcc-tab on" data-pcctab="files" onclick="switchPrintPanelTab('files',this)">
        <span class="pcc-tab-ico">🖼️</span>
        <span class="pcc-tab-lbl">الملفات</span>
        ${missingFiles > 0
          ? `<span class="pcc-tab-cnt" style="background:rgba(239,68,68,.18);color:var(--r)">⚠${missingFiles}</span>`
          : (totalFiles > 0 ? `<span class="pcc-tab-cnt">${totalFiles}</span>` : '')}
      </button>
      <button type="button" class="pcc-tab" data-pcctab="specs" onclick="switchPrintPanelTab('specs',this)">
        <span class="pcc-tab-ico">🖨️</span>
        <span class="pcc-tab-lbl">المواصفات</span>
      </button>
      <button type="button" class="pcc-tab" data-pcctab="order" onclick="switchPrintPanelTab('order',this)">
        <span class="pcc-tab-ico">📋</span>
        <span class="pcc-tab-lbl">الطلب</span>
      </button>
      <button type="button" class="pcc-tab" data-pcctab="history" onclick="switchPrintPanelTab('history',this)">
        <span class="pcc-tab-ico">⏱</span>
        <span class="pcc-tab-lbl">السجل</span>
        ${tlEvents.length > 0 ? `<span class="pcc-tab-cnt">${tlEvents.length}</span>` : ''}
      </button>
    </div>

    <div class="pcc-pane" id="pcc-pane-files"   style="display:block">${printFilesTabHTML(order)}</div>
    <div class="pcc-pane" id="pcc-pane-specs"   style="display:none">${printSpecsTabHTML(order)}</div>
    <div class="pcc-pane" id="pcc-pane-order"   style="display:none">${productionBodyHTML}</div>
    <div class="pcc-pane" id="pcc-pane-history" style="display:none">
      <div class="pcc-tl-group" style="padding-bottom:24px">${printTimelineHTML(tlEvents)}</div>
    </div>`;
}

// ─── INTERACTIVE ────────────────────────────────────────────────────
export function switchPrintPanelTab(tab, btn) {
  document.querySelectorAll('.pcc-tab').forEach(b => b.classList.remove('on'));
  const target = btn || document.querySelector(`.pcc-tab[data-pcctab="${tab}"]`);
  if (target) target.classList.add('on');
  ['files', 'specs', 'order', 'history'].forEach(t => {
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

// ─── PRODUCTION HANDOFF (WhatsApp to production agent) ─────────────
/**
 * waPhoneEG(raw) — يطبّع رقم مصري لصيغة wa.me (20XXXXXXXXXX).
 * يقبل `01012345678` / `201012345678` / مع رموز ويُرجع digits فقط.
 */
function waPhoneEG(raw) {
  const phone = String(raw == null ? '' : raw).replace(/\D/g, '');
  if (!phone) return '';
  if (phone.startsWith('20')) return phone;
  if (phone.startsWith('0')) return '20' + phone.slice(1);
  return '20' + phone;
}

/** absUrl(rel) — يحوّل مسار نسبي للينك مطلق (origin كامل) عشان يشتغل من
 *  واتساب خارج التطبيق. يحافظ على الـ subdirectory لو التطبيق مش على الـ root. */
function absUrl(rel) {
  try {
    return new URL(rel, window.location.href).href;
  } catch (_) {
    return rel;
  }
}

/**
 * buildProductionCostUrl(order) — لينك صفحة بنود التكلفة المخصّصة. بتفتح
 * مودال تسجيل التكلفة للأوردر مباشرةً (exec-cost-entry.html?id=… → openCostModal).
 */
export function buildProductionCostUrl(order = {}) {
  const id = order && order._id ? order._id : '';
  return id ? absUrl(`exec-cost-entry.html?id=${encodeURIComponent(id)}`) : '';
}

/**
 * buildProductionOrderUrl(order) — لينك صفحة الأوردر، فيها زر "تحويل للشحن"
 * (تأكيد الانتهاء من التنفيذ) المتاح لمندوب التنفيذ (order.html?id=…).
 */
export function buildProductionOrderUrl(order = {}) {
  const id = order && order._id ? order._id : '';
  return id ? absUrl(`order.html?id=${encodeURIComponent(id)}`) : '';
}

/**
 * buildProductionHandoffMessage(order, opts) — يبني نص واتساب يُرسَل لمندوب
 * التنفيذ عند تحويل أوردر الطباعة للتنفيذ. ملخّص تشغيلي (مش specs المطبعة):
 * رقم الأوردر · العميل · الميعاد · المنتجات (الاسم × الكمية) · ملاحظة.
 * opts.costUrl (اختياري): لينك صفحة بنود التكلفة (يفتح المودال على طول).
 * opts.orderUrl (اختياري): لينك صفحة الأوردر (لتأكيد الانتهاء/التحويل للشحن).
 */
export function buildProductionHandoffMessage(order = {}, opts = {}) {
  const o = order;
  const lines = [];
  lines.push('🏭 أوردر جديد للتنفيذ');
  lines.push('');
  lines.push(`🔖 رقم الأوردر: ${o.orderId || (o._id || '').slice(-6) || '—'}`);
  if (o.clientName) lines.push(`👤 العميل: ${o.clientName}`);
  if (o.deadline) {
    const dLate = daysOverDeadline(o.deadline);
    lines.push(`📅 الميعاد: ${o.deadline}${dLate > 0 ? ` (متأخر ${dLate} يوم)` : ''}`);
  }

  const prods = (o.products || []).filter(Boolean);
  if (prods.length) {
    lines.push('');
    lines.push('📦 المنتجات:');
    for (const p of prods) {
      const nm = p.name || 'منتج';
      const qty = (parseFloat(p.qty) || 0) > 0 ? ` × ${fmtNum(p.qty)}` : '';
      lines.push(`• ${nm}${qty}`);
    }
  }

  const note = o.productionNote || o.printNotes || '';
  if (note) {
    lines.push('');
    lines.push(`✏️ ملاحظة: ${note}`);
  }

  // 🔗 لينكات التنفيذ — تسجيل التكلفة (صفحة مخصّصة) + تأكيد الانتهاء (صفحة الأوردر).
  if (opts.costUrl) {
    lines.push('');
    lines.push('💰 سجّل التكلفة من هنا:');
    lines.push(opts.costUrl);
  }
  if (opts.orderUrl) {
    lines.push('');
    lines.push('✅ أكّد الانتهاء (تحويل للشحن) من هنا:');
    lines.push(opts.orderUrl);
  }

  return lines.join('\n');
}

/**
 * sendProductionHandoff(order, agent, opts) — يفتح واتساب المندوب بالرسالة.
 * best-effort side-effect (لا يكتب في DB) — يُستدعى بعد نجاح التحويل.
 * يُرجع { ok, error } عشان الـ caller (print.html) يعرض الـ toast بنفسه.
 *
 * 📲 الأولوية للواتساب (موبايل): `opts.win` نافذة اتفتحت مسبقاً **داخل**
 * ضغطة الزر (قبل أي await). توجيهها بدل `window.open` المتأخّر يحافظ على
 * الـ user-gesture، فبيفتح تطبيق الواتساب مباشرة بدل صفحة الويب اللي بتطلب
 * "حمّل واتساب" على موبايل التطبيق موجود عليه أصلاً. لو فشلنا نقفلها.
 */
export function sendProductionHandoff(order, agent, opts = {}) {
  const win = opts && opts.win ? opts.win : null;
  const closeWin = () => { if (win) { try { win.close(); } catch (_) {} } };
  const fail = (error) => { closeWin(); return { ok: false, error }; };
  if (!order) return fail('لا يوجد أوردر');
  if (!agent) return fail('لم يُحدَّد منفّذ — تخطّي إرسال الواتساب');
  const waPhone = waPhoneEG(agent.phone || agent.whatsapp);
  if (!waPhone) {
    return fail(`المنفّذ ${agent.name || ''} بدون رقم واتساب — حدّث بياناته`);
  }
  const costUrl = buildProductionCostUrl(order);
  const orderUrl = buildProductionOrderUrl(order);
  const message = buildProductionHandoffMessage(order, { costUrl, orderUrl });
  const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`;
  try {
    if (win) win.location.href = waUrl;   // وجّه النافذة المحفوظة (gesture preserved)
    else window.open(waUrl, '_blank');     // fallback: فتح مباشر
  } catch (e) {
    return fail('تعذّر فتح واتساب');
  }
  return { ok: true };
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
    buildProductionCostUrl,
    buildProductionOrderUrl,
    buildProductionHandoffMessage,
    sendProductionHandoff,
    togglePrintControlCenter,
  });
}
