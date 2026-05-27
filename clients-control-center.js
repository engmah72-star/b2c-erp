/**
 * Business2Card ERP — clients-control-center.js
 *
 * Client Operations Control Center mode.
 *
 * Provides an alternative panel layout for clients.html — gated behind
 * the `clients.controlCenter` feature flag. When the flag is OFF the
 * legacy panel renders unchanged.
 *
 * What this module ships:
 *   • Sticky client header (critical info + 4 actions)
 *   • 3-tab structure (Timeline / Orders / More) instead of 5
 *   • Unified Timeline (followups + orders + payments merged by date)
 *   • Accordion-based More tab (basic info / business card / notes)
 *   • Contact + Card-action bottom sheets
 *
 * Side effects (window):
 *   window.clientPanelHeaderCCHTML
 *   window.clientPanelBodyCCHTML
 *   window.clientTimelineHTML
 *   window.clientMoreTabHTML
 *   window.openContactSheet
 *   window.openCardActionSheet
 *   window.switchPanelTabCC
 *   window.ccToggleAccordion
 */

import { isFeatureEnabled, setFeatureFlag } from './core/feature-flags.js';
import { openBottomSheet, closeBottomSheet } from './core/bottom-sheet.js';

const CC_FLAG = 'clients.controlCenter';
export function isControlCenterOn() { return isFeatureEnabled(CC_FLAG, false); }

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
  const now = Math.floor(Date.now() / 1000);
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
  today: '🟢 اليوم',
  yesterday: '🟡 أمس',
  thisWeek: '📅 هذا الأسبوع',
  thisMonth: '🗓 هذا الشهر',
  older: '📦 أقدم',
};

// ─── BUILD UNIFIED TIMELINE EVENTS ──────────────────────────────────
/**
 * Merge followups + orders + payments into one chronological list.
 * Each event: { ts, type, icon, title, subtitle, color, actor, link }
 */
export function buildClientTimeline({ followups = [], orders = [], txByOrder = new Map() } = {}) {
  const events = [];
  const FU_TYPES = (typeof window !== 'undefined' && window.FU_TYPES) || {};
  const FU_OUTCOMES = (typeof window !== 'undefined' && window.FU_OUTCOMES) || {};
  const FU_TYPE_COL = (typeof window !== 'undefined' && window.FU_TYPE_COL) || {};
  const STAGE_AR = (typeof window !== 'undefined' && window.STAGE_AR) || {};
  const STAGE_COL = (typeof window !== 'undefined' && window.STAGE_COL) || {};

  // Followups
  for (const f of followups) {
    if (!f || f.isDeleted) continue;
    const ts = tsSeconds(f.createdAt);
    const typeLbl = FU_TYPES[f.type] || f.type || 'متابعة';
    const outLbl = f.outcome ? FU_OUTCOMES[f.outcome] || f.outcome : '';
    events.push({
      ts,
      type: 'followup',
      icon: '📞',
      color: FU_TYPE_COL[f.type] || 'var(--p)',
      title: typeLbl + (outLbl ? ` · ${outLbl}` : ''),
      subtitle: f.note || '',
      actor: f.createdByName || f.createdBy || '',
      meta: f.nextActionDate ? `⏰ تذكير: ${timeAgo(tsSeconds(f.nextActionDate))}` : '',
      raw: f,
      kind: 'followup',
    });
  }

  // Orders — creation event
  for (const o of orders) {
    if (!o) continue;
    const ts = tsSeconds(o.createdAt);
    const stage = o.stage || '';
    const stageLbl = STAGE_AR[stage] || stage || '—';
    const stageCol = STAGE_COL[stage] || 'var(--b)';
    const prodName = (o.products || []).map(p => p.name).join(' + ') || o.product || '—';
    events.push({
      ts,
      type: 'order',
      icon: '📦',
      color: stageCol,
      title: `طلب ${o.orderId || ''} · ${stageLbl}`,
      subtitle: `${prodName} · ${fmtNum(o.salePrice)} ج`,
      actor: o.createdByName || '',
      meta: o.deadline ? `📅 تسليم: ${o.deadline}` : '',
      raw: o,
      kind: 'order',
    });

    // Order stage transitions (from timeline[])
    for (const t of (o.timeline || [])) {
      if (!t || !t.action) continue;
      const tts = tsSeconds(t.date || t.at);
      if (!tts || tts === ts) continue; // skip the creation echo
      events.push({
        ts: tts,
        type: 'stage',
        icon: '🔄',
        color: 'var(--dim)',
        title: t.action,
        subtitle: o.orderId ? `طلب ${o.orderId}` : '',
        actor: t.by || '',
        meta: '',
        raw: { order: o, entry: t },
        kind: 'stage',
      });
    }

    // Payments for this order
    const txs = txByOrder.get?.(o._id) || [];
    for (const tx of txs) {
      if (!tx || tx.isDeleted) continue;
      const tts = tsSeconds(tx.createdAt || tx.date);
      const amt = Math.abs(parseFloat(tx.amount) || 0);
      const isRefund = (tx.type || '').includes('refund') || amt < 0 || (parseFloat(tx.amount) || 0) < 0;
      events.push({
        ts: tts,
        type: isRefund ? 'refund' : 'payment',
        icon: isRefund ? '↩️' : '💰',
        color: isRefund ? 'var(--r)' : 'var(--g)',
        title: isRefund ? `استرداد ${fmtNum(amt)} ج` : `دفعة ${fmtNum(amt)} ج`,
        subtitle: `طلب ${o.orderId || ''}${tx.method ? ' · ' + tx.method : ''}`,
        actor: tx.createdByName || tx.createdBy || '',
        meta: '',
        raw: tx,
        kind: isRefund ? 'refund' : 'payment',
      });
    }
  }

  return events
    .filter(e => e.ts > 0)
    .sort((a, b) => b.ts - a.ts);
}

// ─── TIMELINE HTML ──────────────────────────────────────────────────
export function clientTimelineHTML({ events = [], id = '' } = {}) {
  if (!events.length) {
    return `<div class="cc-empty">
      <div class="cc-empty-ico">⏱</div>
      <div class="cc-empty-txt">لا توجد أنشطة بعد لهذا العميل</div>
      <button type="button" class="btn btn-b btn-sm" onclick="openFollowupModal('${escHtml(id)}')" style="margin-top:14px">＋ سجّل أول متابعة</button>
    </div>`;
  }

  const grouped = { today: [], yesterday: [], thisWeek: [], thisMonth: [], older: [] };
  for (const ev of events) grouped[timelineBucket(ev.ts)].push(ev);

  const renderEvent = (ev) => `
    <div class="cc-tl-item" data-kind="${escHtml(ev.kind)}">
      <div class="cc-tl-line" style="--tl-col:${ev.color}"></div>
      <div class="cc-tl-ico" style="background:${ev.color}22;color:${ev.color}">${ev.icon}</div>
      <div class="cc-tl-body">
        <div class="cc-tl-head">
          <div class="cc-tl-title">${escHtml(ev.title)}</div>
          <div class="cc-tl-time">${fmtTime(ev.ts)} · ${timeAgo(ev.ts)}</div>
        </div>
        ${ev.subtitle ? `<div class="cc-tl-sub">${escHtml(ev.subtitle)}</div>` : ''}
        ${ev.meta ? `<div class="cc-tl-meta">${escHtml(ev.meta)}</div>` : ''}
        ${ev.actor ? `<div class="cc-tl-actor">👤 ${escHtml(ev.actor)}</div>` : ''}
      </div>
    </div>`;

  return Object.entries(grouped)
    .filter(([, list]) => list.length)
    .map(([bucket, list]) => `
      <div class="cc-tl-group">
        <div class="cc-tl-bucket">${BUCKET_LABELS[bucket]} <span class="cc-tl-count">${list.length}</span></div>
        ${list.map(renderEvent).join('')}
      </div>`).join('');
}

// ─── STICKY HEADER ──────────────────────────────────────────────────
/**
 * clientPanelHeaderCCHTML — sticky control-center header.
 * Shows critical info at a glance + 4 primary actions.
 */
export function clientPanelHeaderCCHTML({
  client = {}, color = 'var(--b)',
  cOrds = [], activeOrds = [], lateOrds = [],
  tot = 0, paid = 0, rem = 0, pct = 0,
  daysSince = null,
  lastFu = null,
  segments,
} = {}) {
  const c = client;
  const canSee = (typeof window !== 'undefined' && window.canSee) ? window.canSee : () => true;
  const SEG_STYLE = (typeof window !== 'undefined' && window.SEG_STYLE) || {};

  const initial = (c.name || '?')[0].toUpperCase();
  const avBg = `linear-gradient(135deg,${color},${color}99)`;

  const phone = canSee('client_phone') ? (c.phone1 || '') : '';
  const gov = c.governorate || '';
  const segId = segments?.get?.(c._id);
  const segMeta = segId && SEG_STYLE[segId] ? SEG_STYLE[segId] : null;

  const segLabel = (() => {
    const map = {
      champion: '🏆 بطل', cant_lose: '🚨 لا يجب فقده', loyal: '💎 وفي',
      new: '🌱 جديد', needs_attention: '👀 يحتاج اهتمام',
      at_risk: '⚠️ مهدّد', about_to_sleep: '😴 على وشك', lost: '💤 فُقد',
    };
    return segId && map[segId] ? map[segId] : '';
  })();

  // Critical info strip
  const remTxt = rem > 0
    ? `<span class="cc-hdr-stat cc-hdr-stat-warn">💰 ${fmtNum(rem)} ج باقي</span>`
    : (tot > 0 ? `<span class="cc-hdr-stat cc-hdr-stat-ok">✅ مدفوع بالكامل</span>` : '');
  const ordersTxt = cOrds.length
    ? `<span class="cc-hdr-stat">📦 ${cOrds.length} طلب${activeOrds.length ? ` · ${activeOrds.length} نشط` : ''}</span>`
    : '';
  const lateTxt = lateOrds.length
    ? `<span class="cc-hdr-stat cc-hdr-stat-bad">⚠️ ${lateOrds.length} متأخر</span>`
    : '';
  const fuTxt = (() => {
    if (!lastFu) return '';
    const ts = tsSeconds(lastFu.createdAt);
    return `<span class="cc-hdr-stat cc-hdr-stat-info">📞 آخر تواصل: ${timeAgo(ts)}</span>`;
  })();
  const dayTxt = daysSince !== null && daysSince !== undefined
    ? `<span class="cc-hdr-stat">${daysSince === 0 ? '🟢 نشط اليوم' : `🕒 ${daysSince} يوم بدون طلب`}</span>`
    : '';

  return `
    <div class="cc-hdr">
      <div class="cc-hdr-top">
        <div class="cc-hdr-av" style="background:${avBg}">${escHtml(initial)}</div>
        <div class="cc-hdr-name-block">
          <div class="cc-hdr-name">
            ${escHtml(c.name || '—')}
            ${c.status === 'legacy' ? '<span class="cc-hdr-legacy">📁 قديم</span>' : ''}
            ${segLabel && segMeta ? `<span class="cc-hdr-seg" style="background:${segMeta.bg};color:${segMeta.fg}">${segLabel}</span>` : ''}
          </div>
          <div class="cc-hdr-sub">
            ${phone ? `<span>📞 ${escHtml(phone)}</span>` : ''}
            ${c.job ? `<span>· ${escHtml(c.job)}</span>` : ''}
            ${gov ? `<span>· 📍 ${escHtml(gov)}</span>` : ''}
          </div>
        </div>
      </div>

      <div class="cc-hdr-stats">
        ${remTxt}${ordersTxt}${lateTxt}${fuTxt}${dayTxt}
      </div>

      <div class="cc-hdr-actions">
        <button type="button" class="cc-hdr-btn cc-hdr-btn-primary" onclick="openContactSheet('${escHtml(c._id)}')" ${!canSee('client_phone') ? 'disabled' : ''}>
          <span class="cc-hdr-btn-ico">📞</span>
          <span class="cc-hdr-btn-lbl">تواصل</span>
        </button>
        <button type="button" class="cc-hdr-btn cc-hdr-btn-success" onclick="openNewOrder()" ${c.status === 'legacy' ? 'style="display:none"' : ''}>
          <span class="cc-hdr-btn-ico">＋</span>
          <span class="cc-hdr-btn-lbl">أوردر</span>
        </button>
        <button type="button" class="cc-hdr-btn" onclick="openFollowupModal('${escHtml(c._id)}')">
          <span class="cc-hdr-btn-ico">📝</span>
          <span class="cc-hdr-btn-lbl">متابعة</span>
        </button>
        <button type="button" class="cc-hdr-btn" onclick="openCardActionSheet('${escHtml(c._id)}')">
          <span class="cc-hdr-btn-ico">⋯</span>
          <span class="cc-hdr-btn-lbl">المزيد</span>
        </button>
      </div>
    </div>`;
}

// ─── MORE TAB (accordion) ───────────────────────────────────────────
export function clientMoreTabHTML({
  client = {}, id, tags = [],
  TAG_LABELS = {}, TAG_COL = {},
  renderBizCardTab = () => '',
  pRow = (l, v) => `<div>${l}: ${v}</div>`,
  fmtOccasion = (s) => s,
  memberDays = null,
} = {}) {
  const c = client;
  const canSee = (typeof window !== 'undefined' && window.canSee) ? window.canSee : () => true;
  const intLabel = window?.canSee?.('internal_notes') !== false;

  const tagsHTML = (tags || []).map(t =>
    `<span class="cc-tag" style="background:${TAG_COL[t] || 'var(--bg3)'}">${TAG_LABELS[t] || t}</span>`
  ).join('');

  const section = (id_, icon, title, contentHTML, defaultOpen = false) => `
    <div class="cc-acc ${defaultOpen ? 'is-open' : ''}" id="cc-acc-${escHtml(id_)}">
      <button type="button" class="cc-acc-head" onclick="ccToggleAccordion('${escHtml(id_)}')">
        <span class="cc-acc-ico">${icon}</span>
        <span class="cc-acc-title">${escHtml(title)}</span>
        <span class="cc-acc-chev">▾</span>
      </button>
      <div class="cc-acc-body">${contentHTML}</div>
    </div>`;

  const basicHTML = `
    <div class="cc-info-grid">
      ${canSee('client_phone') && c.phone1 ? pRow('📞 هاتف 1', c.phone1) : ''}
      ${canSee('client_phone') && c.phone2 ? pRow('📞 هاتف 2', c.phone2) : ''}
      ${canSee('client_phone') && c.intlPhone ? pRow('🌍 رقم دولي', c.intlPhone) : ''}
      ${c.email ? pRow('📧 إيميل', c.email) : ''}
      ${c.governorate ? pRow('📍 المحافظة', c.governorate + (c.city ? ' · ' + c.city : '')) : ''}
      ${c.job ? pRow('💼 الوظيفة', c.job) : ''}
      ${c.source ? pRow('📣 المصدر', c.source) : ''}
      ${c.sector ? pRow('🏢 القطاع', c.sector) : ''}
      ${c.birthday ? pRow('🎂 ميلاد', fmtOccasion(c.birthday)) : ''}
      ${c.anniversary ? pRow('🏢 تأسيس', fmtOccasion(c.anniversary)) : ''}
      ${memberDays !== null && memberDays !== undefined ? pRow('🗓 عضو منذ', `${memberDays} يوم`) : ''}
    </div>
    ${tagsHTML ? `<div class="cc-tags">${tagsHTML}</div>` : ''}
    ${c.notes ? `<div class="cc-notes"><span class="cc-notes-lbl">📝 ملاحظات:</span> ${escHtml(c.notes)}</div>` : ''}`;

  const internalHTML = c.internalNotes
    ? `<div class="cc-internal">
        <div class="cc-internal-lbl">🔒 ملاحظات داخلية (لا تظهر للعميل)</div>
        <div class="cc-internal-body">${escHtml(c.internalNotes)}</div>
        ${c.internalNotesUpdatedBy ? `<div class="cc-internal-meta">آخر تعديل: ${escHtml(c.internalNotesUpdatedBy)} ${c.internalNotesUpdatedAt ? '· ' + timeAgo(tsSeconds(c.internalNotesUpdatedAt)) : ''}</div>` : ''}
      </div>`
    : `<div class="cc-empty-sm">لا توجد ملاحظات داخلية بعد.</div>`;

  const legacyHTML = c.status === 'legacy'
    ? `<div class="cc-info-grid">
        ${c.legacyTotalSpent ? pRow('💰 إجمالي المصروف', fmtNum(c.legacyTotalSpent) + ' ج') : ''}
        ${c.legacyLastOrder ? pRow('📅 آخر طلب', c.legacyLastOrder) : ''}
        ${c.legacyProjects ? pRow('📦 المشاريع السابقة', c.legacyProjects) : ''}
        ${c.legacyNotes ? `<div style="grid-column:1/-1;margin-top:8px">${escHtml(c.legacyNotes)}</div>` : ''}
      </div>`
    : '';

  const bizHTML = (() => {
    try { return renderBizCardTab() || '<div class="cc-empty-sm">لم تُملأ بطاقة الأعمال بعد.</div>'; }
    catch (e) { return '<div class="cc-empty-sm">تعذّر تحميل بطاقة الأعمال.</div>'; }
  })();

  return `
    <div class="cc-more">
      ${section('basic', '👤', 'المعلومات الأساسية', basicHTML, true)}
      ${section('bizcard', '📇', 'بطاقة الأعمال', bizHTML, false)}
      ${intLabel ? section('internal', '🔒', 'ملاحظات داخلية', internalHTML, false) : ''}
      ${c.status === 'legacy' ? section('legacy', '📁', 'بيانات العميل القديم', legacyHTML, false) : ''}

      <div class="cc-more-footer">
        <button type="button" class="btn btn-sm" onclick="editClient('${escHtml(id)}')">✏️ تعديل البيانات</button>
        ${c.status === 'legacy' ? `<button type="button" class="btn btn-g btn-sm" onclick="convertToActive('${escHtml(id)}')">🟢 تحويل لنشط</button>` : ''}
        <button type="button" class="btn btn-danger btn-sm" onclick="deleteClient('${escHtml(id)}')" style="margin-inline-start:auto">🗑 حذف</button>
      </div>
    </div>`;
}

// ─── 3-TAB BODY ─────────────────────────────────────────────────────
export function clientPanelBodyCCHTML(ctx = {}) {
  const {
    id, client, cOrds = [], events = [],
    renderPanelOrders = () => '',
  } = ctx;

  const timelineHTML = clientTimelineHTML({ events, id });
  const ordersHTML = renderPanelOrders(cOrds, 'all') || '<div class="cc-empty-sm">لا توجد أوردرات</div>';
  const moreHTML = clientMoreTabHTML(ctx);

  return `
    <div class="cc-tabs" id="cc-tabs">
      <button type="button" class="cc-tab on" data-cctab="timeline" onclick="switchPanelTabCC('timeline',this)">
        <span class="cc-tab-ico">⏱</span><span class="cc-tab-lbl">Timeline</span>
        <span class="cc-tab-cnt">${events.length}</span>
      </button>
      <button type="button" class="cc-tab" data-cctab="orders" onclick="switchPanelTabCC('orders',this)">
        <span class="cc-tab-ico">📦</span><span class="cc-tab-lbl">أوردرات</span>
        <span class="cc-tab-cnt">${cOrds.length}</span>
      </button>
      <button type="button" class="cc-tab" data-cctab="more" onclick="switchPanelTabCC('more',this)">
        <span class="cc-tab-ico">👤</span><span class="cc-tab-lbl">المزيد</span>
      </button>
    </div>

    <div class="cc-pane" id="cc-pane-timeline" style="display:block">${timelineHTML}</div>
    <div class="cc-pane" id="cc-pane-orders" style="display:none">${ordersHTML}</div>
    <div class="cc-pane" id="cc-pane-more" style="display:none">${moreHTML}</div>`;
}

// ─── INTERACTIVE: TAB SWITCH + ACCORDION ────────────────────────────
export function switchPanelTabCC(tab, btn) {
  document.querySelectorAll('.cc-tab').forEach(b => b.classList.remove('on'));
  if (btn) btn.classList.add('on');
  ['timeline', 'orders', 'more'].forEach(t => {
    const pane = document.getElementById('cc-pane-' + t);
    if (pane) pane.style.display = t === tab ? 'block' : 'none';
  });
}

export function ccToggleAccordion(id) {
  const acc = document.getElementById('cc-acc-' + id);
  if (acc) acc.classList.toggle('is-open');
}

// ─── BOTTOM SHEETS ──────────────────────────────────────────────────
/**
 * openContactSheet(clientId) — opens a sheet with تواصل options.
 * Replaces the 5 contact buttons (call/WA/message/intl-call/intl-WA).
 */
export function openContactSheet(clientId) {
  const clients = (typeof window !== 'undefined' && window.clients) || [];
  const c = clients.find(x => x._id === clientId);
  if (!c) return;
  const canSee = (typeof window !== 'undefined' && window.canSee) ? window.canSee : () => true;
  if (!canSee('client_phone')) {
    if (window.toast) window.toast('لا تملك صلاحية رؤية رقم العميل', 'warn');
    return;
  }

  const ph = (c.phone1 || '').replace(/^0/, '');
  const phLocal = c.phone1 || '';
  const intl = (c.intlPhone || '').replace(/[^\d]/g, '');
  const items = [];

  if (phLocal) {
    items.push({
      icon: '📞', label: 'اتصال هاتفي', hint: phLocal, variant: 'primary',
      href: `tel:${phLocal}`,
    });
    items.push({
      icon: '💬', label: 'واتساب', hint: phLocal, variant: 'success',
      href: `https://wa.me/20${ph}`, target: '_blank',
    });
    items.push({
      icon: '📨', label: 'رسالة جاهزة (طلبك جاهز)', variant: 'success',
      href: `https://wa.me/20${ph}?text=${encodeURIComponent(`أهلاً ${c.name || ''} 👋، طلبك جاهز 🎉`)}`,
      target: '_blank',
    });
  }
  if (c.phone2 && canSee('client_phone')) {
    items.push({
      icon: '📞', label: 'هاتف 2', hint: c.phone2,
      href: `tel:${c.phone2}`,
    });
  }
  if (c.intlPhone) {
    items.push({
      section: '🌍 دولي',
      icon: '📞', label: 'اتصال دولي', hint: c.intlPhone, variant: 'warning',
      href: `tel:${c.intlPhone}`,
    });
    items.push({
      icon: '💬', label: 'واتساب دولي', hint: c.intlPhone, variant: 'warning',
      href: `https://wa.me/${intl}`, target: '_blank',
    });
  }

  items.push({
    section: '📝 المتابعة',
    icon: '📞', label: 'سجّل متابعة مكالمة', variant: 'primary',
    onClick: () => { try { window.openFollowupModal?.(clientId); } catch (_) {} },
  });

  if (!items.length) {
    if (window.toast) window.toast('لا توجد بيانات تواصل', 'warn');
    return;
  }

  openBottomSheet({
    title: `📞 تواصل مع ${c.name || ''}`,
    subtitle: c.job || '',
    items,
    cancelLabel: 'إلغاء',
  });
}

/**
 * openCardActionSheet(clientId) — opens a sheet with all card actions.
 * Used by long-press on card and by the "⋯ المزيد" header button.
 */
export function openCardActionSheet(clientId) {
  const clients = (typeof window !== 'undefined' && window.clients) || [];
  const c = clients.find(x => x._id === clientId);
  if (!c) return;
  const canSee = (typeof window !== 'undefined' && window.canSee) ? window.canSee : () => true;
  const isAdmin = !!(typeof window !== 'undefined' && window.isAdmin);
  const cOrds = (typeof window !== 'undefined' && window.getClientOrders) ? window.getClientOrders(c) : [];

  const items = [
    {
      icon: '👤', label: 'فتح العميل', variant: 'primary',
      onClick: () => { try { window.openClient?.(clientId); } catch (_) {} },
    },
    canSee('client_phone') && {
      icon: '📞', label: 'تواصل', hint: 'اتصال / واتساب / رسالة', variant: 'primary',
      onClick: () => { openContactSheet(clientId); return false; }, // keep open? no — switch sheet
    },
    {
      icon: '📝', label: 'متابعة جديدة',
      onClick: () => { try { window.openFollowupModal?.(clientId); } catch (_) {} },
    },
    c.status !== 'legacy' && {
      icon: '＋', label: 'أوردر جديد', variant: 'success',
      onClick: () => {
        try { if (window.openClient) window.openClient(clientId); setTimeout(() => window.openNewOrder?.(), 100); } catch (_) {}
      },
    },
    cOrds.length > 0 && {
      icon: '🔁', label: 'كرّر آخر أوردر', hint: 'نسخ المنتجات من آخر طلب',
      onClick: () => { try { window.reorderLastOrder?.(clientId); } catch (_) {} },
    },
    { section: '⚙️ الإدارة' },
    {
      icon: '✏️', label: 'تعديل البيانات',
      onClick: () => { try { window.editClient?.(clientId); } catch (_) {} },
    },
    c.status === 'legacy' && {
      icon: '🟢', label: 'تحويل لنشط', variant: 'success',
      onClick: () => { try { window.convertToActive?.(clientId); } catch (_) {} },
    },
    isAdmin && {
      icon: '🗑', label: 'حذف العميل', variant: 'danger',
      onClick: () => { try { window.deleteClient?.(clientId); } catch (_) {} },
    },
  ].filter(Boolean);

  // Handle the section markers (skip leading section if no items after)
  const cleaned = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.section && !it.label) {
      // section header — only add if next item exists
      if (items[i + 1] && !items[i + 1].section) cleaned.push(it);
    } else {
      cleaned.push(it);
    }
  }

  openBottomSheet({
    title: c.name || 'العميل',
    subtitle: c.job || '',
    items: cleaned,
    cancelLabel: 'إلغاء',
  });
}

// ─── LONG-PRESS ATTACH ──────────────────────────────────────────────
let __lpTimer = null;
let __lpFired = false;

/**
 * attachLongPressHandlers(rootEl) — wires long-press on .cc cards
 * inside rootEl to open the action sheet. Safe to call repeatedly.
 */
export function attachLongPressHandlers(rootEl) {
  if (!rootEl || rootEl.__ccLPBound) return;
  rootEl.__ccLPBound = true;

  const LP_MS = 500;

  const start = (e) => {
    const card = e.target.closest?.('.cc');
    if (!card) return;
    const onclick = card.getAttribute('onclick') || '';
    const m = onclick.match(/openClient\('([^']+)'\)/);
    if (!m) return;
    const id = m[1];
    __lpFired = false;
    clearTimeout(__lpTimer);
    __lpTimer = setTimeout(() => {
      __lpFired = true;
      try { if (navigator.vibrate) navigator.vibrate(40); } catch (_) {}
      openCardActionSheet(id);
    }, LP_MS);
  };
  const cancel = () => { clearTimeout(__lpTimer); };

  rootEl.addEventListener('touchstart', start, { passive: true });
  rootEl.addEventListener('touchend', cancel, { passive: true });
  rootEl.addEventListener('touchmove', cancel, { passive: true });
  rootEl.addEventListener('touchcancel', cancel, { passive: true });
  rootEl.addEventListener('mousedown', start);
  rootEl.addEventListener('mouseup', cancel);
  rootEl.addEventListener('mouseleave', cancel);

  // If long-press fired, swallow the next click (which would open the panel).
  rootEl.addEventListener('click', (e) => {
    if (__lpFired) {
      __lpFired = false;
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
}

// ─── DEV TOGGLE (handy for testing) ─────────────────────────────────
export function toggleControlCenter(enable) {
  const next = enable === undefined ? !isControlCenterOn() : !!enable;
  setFeatureFlag(CC_FLAG, next);
  try { window.location.reload(); } catch (_) {}
}

// ─── SIDE-EFFECT: expose to window ──────────────────────────────────
if (typeof window !== 'undefined') {
  Object.assign(window, {
    clientPanelHeaderCCHTML,
    clientPanelBodyCCHTML,
    clientTimelineHTML,
    clientMoreTabHTML,
    buildClientTimeline,
    openContactSheet,
    openCardActionSheet,
    switchPanelTabCC,
    ccToggleAccordion,
    attachLongPressHandlers,
    isControlCenterOn,
    toggleControlCenter,
  });
}
