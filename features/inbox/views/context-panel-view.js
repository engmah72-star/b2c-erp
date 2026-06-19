/**
 * features/inbox/views/context-panel-view.js
 * ━━━ CONTEXT PANEL VIEW — لوحة السياق ━━━
 * Pure HTML builder for the right-side context panel.
 */

import { escapeHtml as esc } from '../../../core/inbox-utils.js';
import { stageLabel, stageColor, fmtPrice, ACTION_ITEM_STATUS } from '../../../core/messaging-hub.js';

/* ── Stage sequence for timeline position ── */
const STAGE_SEQUENCE = ['new', 'design', 'approval', 'print', 'production', 'quality', 'shipping', 'delivered'];

/* ── Role-based avatar colors ── */
const ROLE_COLORS = {
  admin: '#3b82f6',
  operation_manager: '#8b5cf6',
  customer_service: '#06b6d4',
  graphic_designer: '#f59e0b',
  design_operator: '#a855f7',
  production_agent: '#10b981',
  shipping_officer: '#f97316',
  wallet_manager: '#6366f1',
};

/* ── Assignee role definitions ── */
const ASSIGNEE_ROLES = [
  { key: 'designer', label: 'المصمم', ico: '🎨', color: '#f59e0b' },
  { key: 'production', label: 'التنفيذ', ico: '🏭', color: '#10b981' },
  { key: 'shipping', label: 'الشحن', ico: '🚚', color: '#f97316' },
];

/**
 * Get the first letter of a name for avatar initials.
 * @param {string} name
 * @returns {string}
 */
function getInitial(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}

/**
 * Get avatar color from role string.
 * @param {string} role
 * @returns {string}
 */
function avatarColor(role) {
  return ROLE_COLORS[role] || '#6b7280';
}

/**
 * Get stage position info (1-based index and total).
 * @param {string} stage
 * @returns {{ pos: number, total: number } | null}
 */
function stagePosition(stage) {
  const idx = STAGE_SEQUENCE.indexOf(stage);
  if (idx === -1) return null;
  return { pos: idx + 1, total: STAGE_SEQUENCE.length };
}

/**
 * Format a relative time string from a date string or timestamp.
 * @param {string|number} dateVal
 * @returns {{ text: string, overdue: boolean }}
 */
function relativeDate(dateVal) {
  if (!dateVal) return { text: '', overdue: false };
  const now = Date.now();
  const target = typeof dateVal === 'number' ? dateVal : new Date(dateVal).getTime();
  if (isNaN(target)) return { text: String(dateVal), overdue: false };

  const diffMs = target - now;
  const absDays = Math.abs(Math.round(diffMs / 86400000));
  const overdue = diffMs < 0;

  if (absDays === 0) return { text: 'اليوم', overdue };
  if (absDays === 1) return { text: overdue ? 'أمس' : 'غداً', overdue };
  if (absDays < 7) return { text: (overdue ? 'منذ ' : 'بعد ') + absDays + ' أيام', overdue };
  if (absDays < 30) {
    const weeks = Math.round(absDays / 7);
    return { text: (overdue ? 'منذ ' : 'بعد ') + weeks + ' أسابيع', overdue };
  }
  return { text: String(dateVal), overdue };
}

/**
 * Conversation type badge label.
 * @param {string} type
 * @returns {string}
 */
function convTypeBadge(type) {
  const map = {
    order: 'أوردر',
    support: 'دعم',
    internal: 'داخلي',
    group: 'مجموعة',
    direct: 'مباشر',
  };
  return map[type] || type || '';
}

// ══════════════════════════════════════════
// MAIN BUILDER
// ══════════════════════════════════════════

/**
 * Build the full context panel HTML.
 * @param {Object} context - from resolveContext()
 * @param {Object} opts
 * @param {Map} opts.presenceMap
 * @param {Array} opts.actionItems
 * @param {string} opts.currentUid
 * @returns {string} HTML
 */
export function buildContextPanelHTML(context, { presenceMap = new Map(), actionItems = [], currentUid = '' } = {}) {
  if (!context) {
    return `<div class="mh-ctx-empty">
      <div class="mh-ctx-empty-ico">📋</div>
      <div class="mh-ctx-empty-title">لا توجد محادثة محددة</div>
      <div class="mh-ctx-empty-hint">اختر محادثة من القائمة لعرض التفاصيل والإجراءات المتاحة</div>
    </div>`;
  }

  let html = '<div class="mh-ctx-scroll">';

  // Conversation info summary
  html += buildConversationSummary(context);

  // Order context section
  if (context.order) {
    html += buildOrderSection(context.order);
  }

  // Quick actions section
  if (context.quickActions?.length) {
    html += buildQuickActionsSection(context.quickActions, context);
  }

  // Participants section
  if (context.participants?.length) {
    html += buildParticipantsSection(context.participants, presenceMap);
  }

  // Action items section
  if (actionItems.length || context.order) {
    html += buildActionItemsSection(actionItems, currentUid);
  }

  html += '</div>';
  return html;
}

// ══════════════════════════════════════════
// CONVERSATION SUMMARY
// ══════════════════════════════════════════

function buildConversationSummary(context) {
  const type = context.type || context.category || '';
  const participantCount = context.participants?.length || 0;
  const createdAt = context.createdAt || '';

  const badgeLabel = convTypeBadge(type);

  return `
    <div class="mh-ctx-section mh-ctx-conv-summary">
      <div class="mh-ctx-conv-badges">
        ${badgeLabel ? `<span class="mh-ctx-conv-type-badge mh-ctx-conv-type--${esc(type)}">${esc(badgeLabel)}</span>` : ''}
        ${participantCount ? `<span class="mh-ctx-conv-stat">${participantCount} مشارك</span>` : ''}
        ${createdAt ? `<span class="mh-ctx-conv-stat">${esc(String(createdAt))}</span>` : ''}
      </div>
    </div>`;
}

// ══════════════════════════════════════════
// ORDER SECTION
// ══════════════════════════════════════════

function buildOrderSection(order) {
  const stageBg = stageColor(order.stage);
  const products = (order.products || []).slice(0, 5);
  const pos = stagePosition(order.stage);

  // Products list with alternating backgrounds
  let productsHtml = '';
  if (products.length) {
    productsHtml = `<div class="mh-ctx-products">
      ${products.map((p, idx) => `
        <div class="mh-ctx-product ${idx % 2 === 1 ? 'mh-ctx-product--alt' : ''}">
          <span class="mh-ctx-product-name">${esc(p.name || 'منتج')}</span>
          <span class="mh-ctx-product-qty">${esc(String(p.qty || 1))}</span>
          ${p.status ? `<span class="mh-ctx-product-status">${esc(p.status)}</span>` : ''}
        </div>
      `).join('')}
    </div>`;
  }

  // Assignees as avatar circles with role tooltips
  let assigneesHtml = '';
  if (order.assignees) {
    const assigned = ASSIGNEE_ROLES.filter(r => order.assignees[r.key]);
    if (assigned.length) {
      assigneesHtml = `<div class="mh-ctx-assignees">
        ${assigned.map(r => {
          const name = typeof order.assignees[r.key] === 'string' ? order.assignees[r.key] : r.label;
          const initial = getInitial(name);
          return `
          <div class="mh-ctx-assignee-avatar" title="${esc(r.label + ': ' + name)}">
            <span class="mh-ctx-avatar-circle" style="--avatar-bg:${esc(r.color)}">${esc(initial)}</span>
            <span class="mh-ctx-assignee-role-tip">${esc(r.label)}</span>
          </div>`;
        }).join('')}
      </div>`;
    }
  }

  return `
    <div class="mh-ctx-section">
      <div class="mh-ctx-section-hdr">
        <span>📦 تفاصيل الأوردر</span>
      </div>
      <div class="mh-ctx-order-card">
        <div class="mh-ctx-order-top">
          <span class="mh-ctx-order-code">#${esc(order.code)}</span>
          <span class="mh-ctx-stage" style="--stage-bg:${stageBg}">${esc(stageLabel(order.stage))}</span>
        </div>
        ${pos ? `<div class="mh-ctx-order-timeline">مرحلة ${pos.pos} من ${pos.total}</div>` : ''}
        <div class="mh-ctx-order-client">
          <span class="mh-ctx-client-ico">👤</span>
          <span>${esc(order.clientName || '—')}</span>
        </div>
        ${order.salePrice ? `<div class="mh-ctx-order-price">${fmtPrice(order.salePrice)}</div>` : ''}
        ${order.deadline ? `<div class="mh-ctx-order-deadline">⏰ ${esc(order.deadline)}</div>` : ''}
        ${order.designStage ? `<div class="mh-ctx-order-meta">🎨 ${esc(order.designStage)}</div>` : ''}
        ${order.shippingMethod ? `<div class="mh-ctx-order-meta">🚚 ${esc(order.shippingMethod)}</div>` : ''}
      </div>
      ${productsHtml}
      ${assigneesHtml}
      <button type="button" class="mh-ctx-open-order-btn"
        onclick="navigateToOrder('${esc(order.id)}')"
        aria-label="فتح الأوردر #${esc(order.code)}">
        ↗ فتح الأوردر
      </button>
    </div>`;
}

// ══════════════════════════════════════════
// QUICK ACTIONS
// ══════════════════════════════════════════

function buildQuickActionsSection(actions, context) {
  return `
    <div class="mh-ctx-section">
      <div class="mh-ctx-section-hdr"><span>⚡ إجراءات سريعة</span></div>
      <div class="mh-ctx-actions-grid">
        ${actions.map(a => `
          <button type="button" class="mh-ctx-action-btn"
            onclick="execQuickAction('${esc(a.id)}', '${esc(context.order?.id || '')}', '${esc(context.category)}')"
            title="${esc(a.label)}"
            aria-label="${esc(a.label)}">
            <span class="mh-ctx-action-ico-wrap">
              <span class="mh-ctx-action-ico">${a.ico}</span>
            </span>
            <span class="mh-ctx-action-label">${esc(a.label)}</span>
          </button>
        `).join('')}
      </div>
    </div>`;
}

// ══════════════════════════════════════════
// PARTICIPANTS
// ══════════════════════════════════════════

function buildParticipantsSection(participants, presenceMap) {
  const onlineCount = participants.filter(p => {
    const pres = presenceMap.get(p.uid);
    return pres?.online && ((Date.now() - (pres.lastSeen?.seconds || 0) * 1000) < 90000);
  }).length;

  return `
    <div class="mh-ctx-section">
      <div class="mh-ctx-section-hdr">
        <span>👥 المشاركون (${participants.length})${onlineCount ? ` · ${onlineCount} متصل` : ''}</span>
      </div>
      <div class="mh-ctx-participants">
        ${participants.map(p => {
          const pres = presenceMap.get(p.uid);
          const online = pres?.online && ((Date.now() - (pres.lastSeen?.seconds || 0) * 1000) < 90000);
          const initial = getInitial(p.name);
          const color = avatarColor(p.role);
          return `
            <div class="mh-ctx-participant ${p.isCurrent ? 'is-me' : ''}">
              <div class="mh-ctx-participant-avatar" style="--avatar-bg:${esc(color)}">
                <span class="mh-ctx-avatar-letter">${esc(initial)}</span>
                <span class="mh-ctx-participant-dot ${online ? 'online' : ''}"></span>
              </div>
              <div class="mh-ctx-participant-info">
                <span class="mh-ctx-participant-name">
                  ${esc(p.name)}${p.isCurrent ? '<span class="mh-ctx-you-badge">(أنت)</span>' : ''}
                </span>
                ${p.role ? `<span class="mh-ctx-participant-role">${esc(p.role)}</span>` : ''}
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

// ══════════════════════════════════════════
// ACTION ITEMS / TASKS
// ══════════════════════════════════════════

function buildActionItemsSection(items, currentUid) {
  const pending = items.filter(i => i.status === ACTION_ITEM_STATUS.PENDING);
  const done = items.filter(i => i.status === ACTION_ITEM_STATUS.DONE);

  return `
    <div class="mh-ctx-section">
      <div class="mh-ctx-section-hdr">
        <span class="mh-ctx-tasks-hdr-text">
          ✅ المهام
          ${pending.length ? `<span class="mh-ctx-tasks-count">${pending.length}</span>` : ''}
        </span>
        <button type="button" class="mh-ctx-add-task-btn"
          onclick="openNewActionItem()"
          aria-label="إضافة مهمة جديدة"
          title="مهمة جديدة">
          + إضافة
        </button>
      </div>
      ${pending.length
        ? pending.map(item => buildActionItemRow(item, currentUid)).join('')
        : '<div class="mh-ctx-empty-hint">لا توجد مهام معلقة</div>'}
      ${done.length ? `
        <details class="mh-ctx-done-toggle">
          <summary class="mh-ctx-done-summary">المنجزة (${done.length})</summary>
          <div class="mh-ctx-done-list">
            ${done.map(item => buildActionItemRow(item, currentUid)).join('')}
          </div>
        </details>` : ''}
    </div>`;
}

// ══════════════════════════════════════════
// ACTION ITEM ROW
// ══════════════════════════════════════════

function buildActionItemRow(item, currentUid) {
  const isDone = item.status === ACTION_ITEM_STATUS.DONE;
  const isMine = item.assigneeId === currentUid || item.createdBy === currentUid;
  const due = relativeDate(item.dueDate);

  return `
    <div class="mh-ctx-action-item ${isDone ? 'done' : ''} ${isMine ? 'mine' : ''}"
      data-item-id="${esc(item._id || '')}">
      <button type="button" class="mh-ctx-item-check ${isDone ? 'checked' : ''}"
        onclick="toggleActionItem('${esc(item._id || '')}')"
        aria-label="${isDone ? 'إلغاء إنجاز المهمة' : 'إنجاز المهمة'}">
        <span class="mh-ctx-check-box">
          ${isDone ? '<span class="mh-ctx-check-mark">✓</span>' : ''}
        </span>
      </button>
      <div class="mh-ctx-item-body">
        <div class="mh-ctx-item-text">${esc(item.text || '')}</div>
        ${item.assigneeName ? `
          <div class="mh-ctx-item-assignee">
            <span class="mh-ctx-item-assignee-avatar">${esc(getInitial(item.assigneeName))}</span>
            <span>${esc(item.assigneeName)}</span>
          </div>` : ''}
        ${due.text ? `<div class="mh-ctx-item-due ${due.overdue ? 'mh-ctx-item-due--overdue' : ''}">${esc(due.text)}</div>` : ''}
      </div>
      <button type="button" class="mh-ctx-item-dismiss"
        onclick="toggleActionItem('${esc(item._id || '')}')"
        aria-label="إزالة المهمة"
        title="إزالة">✕</button>
    </div>`;
}
