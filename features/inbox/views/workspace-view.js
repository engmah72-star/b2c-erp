/**
 * features/inbox/views/workspace-view.js
 * ━━━ WORKSPACE VIEW BUILDERS — عناصر مساحة العمل ━━━
 * Pure HTML builders for the workspace shell elements.
 */

import { escapeHtml as esc, fmtTime } from '../../../core/inbox-utils.js';
import { WORKSPACE_TABS, ACTIVITY_TYPES, computeWorkspaceStats } from '../../../core/messaging-hub.js';

// ── Local helpers ──────────────────────────────────────────────────

/**
 * Format a Firestore timestamp as relative time for activity feed.
 * <1 min → "الآن", <1 hr → "منذ X د", else falls back to fmtTime.
 */
function fmtTimeRelative(ts) {
  if (!ts?.toDate) return '';
  const diffMs = Date.now() - ts.toDate().getTime();
  if (diffMs < 60_000) return 'الآن';
  if (diffMs < 3_600_000) return `منذ ${Math.floor(diffMs / 60_000)} د`;
  return fmtTime(ts);
}

/**
 * Map activity type → CSS modifier for the colored left border.
 */
function activityBorderClass(type) {
  const map = {
    [ACTIVITY_TYPES.MESSAGE]: 'mh-activity-border--message',
    [ACTIVITY_TYPES.ORDER_UPDATE]: 'mh-activity-border--order',
    [ACTIVITY_TYPES.DESIGN_UPLOAD]: 'mh-activity-border--design',
    [ACTIVITY_TYPES.APPROVAL]: 'mh-activity-border--approval',
    [ACTIVITY_TYPES.PAYMENT]: 'mh-activity-border--payment',
    [ACTIVITY_TYPES.STAGE_CHANGE]: 'mh-activity-border--stage',
    [ACTIVITY_TYPES.MENTION]: 'mh-activity-border--mention',
    [ACTIVITY_TYPES.ACTION_ITEM]: 'mh-activity-border--action',
    [ACTIVITY_TYPES.SYSTEM]: 'mh-activity-border--system',
  };
  return map[type] || '';
}

/**
 * Map activity type → icon glyph.
 */
function activityIcon(type) {
  const map = {
    [ACTIVITY_TYPES.MESSAGE]: '💬',
    [ACTIVITY_TYPES.ORDER_UPDATE]: '📦',
    [ACTIVITY_TYPES.DESIGN_UPLOAD]: '🎨',
    [ACTIVITY_TYPES.APPROVAL]: '✅',
    [ACTIVITY_TYPES.PAYMENT]: '💰',
    [ACTIVITY_TYPES.STAGE_CHANGE]: '🔄',
    [ACTIVITY_TYPES.MENTION]: '@',
    [ACTIVITY_TYPES.ACTION_ITEM]: '☑️',
    [ACTIVITY_TYPES.SYSTEM]: '⚙️',
  };
  return map[type] || '💬';
}

// ═══════════════════════════════════════════
// 1. CATEGORY TABS
// ═══════════════════════════════════════════

/**
 * Build the category tabs bar.
 * @param {string} activeTab - current tab id
 * @param {Object} counts - { all, priority, orders, teams, clients, direct }
 * @returns {string} HTML
 */
export function buildCategoryTabsHTML(activeTab, counts = {}) {
  const totalUnread = Object.entries(counts)
    .filter(([k]) => k !== 'all')
    .reduce((sum, [, v]) => sum + (v || 0), 0);

  return `<div class="mh-tabs-wrap" role="tablist" aria-label="تصنيف المحادثات">
    ${WORKSPACE_TABS.map(tab => {
      const count = counts[tab.id] || 0;
      const isActive = activeTab === tab.id;
      const showBadge = tab.id === 'all'
        ? totalUnread > 0
        : count > 0;
      const badgeValue = tab.id === 'all' ? totalUnread : count;

      return `<button type="button"
        class="mh-tab ${isActive ? 'active' : ''}"
        role="tab"
        aria-selected="${isActive}"
        data-tab="${tab.id}"
        onclick="switchWorkspaceTab('${tab.id}')">
        <span class="mh-tab-ico">${tab.ico}</span>
        <span class="mh-tab-label">${tab.label}</span>
        ${showBadge ? `<span class="mh-tab-badge">${badgeValue > 99 ? '99+' : badgeValue}</span>` : ''}
      </button>`;
    }).join('')}
  </div>`;
}

// ═══════════════════════════════════════════
// 2. STATS BAR
// ═══════════════════════════════════════════

/**
 * Build the workspace stats header bar.
 */
export function buildStatsBarHTML(conversations, currentUid) {
  const s = computeWorkspaceStats(conversations, currentUid);
  const parts = [];

  if (s.totalUnread) {
    parts.push(`
      <span class="mh-stat-card">
        <span class="mh-stat-ico">💬</span>
        <span class="mh-stat-val">${s.totalUnread}</span>
        <span class="mh-stat-label">غير مقروءة</span>
      </span>`);
  }

  if (s.urgentCount) {
    parts.push(`
      <span class="mh-stat-card mh-stat-card--urgent">
        <span class="mh-stat-ico">🔴</span>
        <span class="mh-stat-val">${s.urgentCount}</span>
        <span class="mh-stat-label">عاجل</span>
      </span>`);
  }

  if (s.mentionCount) {
    parts.push(`
      <span class="mh-stat-card">
        <span class="mh-stat-ico">@</span>
        <span class="mh-stat-val">${s.mentionCount}</span>
        <span class="mh-stat-label">إشارة</span>
      </span>`);
  }

  if (s.conversationCount) {
    parts.push(`
      <span class="mh-stat-card">
        <span class="mh-stat-ico">📋</span>
        <span class="mh-stat-val">${s.conversationCount}</span>
        <span class="mh-stat-label">محادثة</span>
      </span>`);
  }

  if (!parts.length) return '';

  return `<div class="mh-stats-bar" role="status" aria-live="polite">${parts.join('<span class="mh-stat-sep" aria-hidden="true"></span>')}</div>`;
}

// ═══════════════════════════════════════════
// 3. ACTIVITY FEED
// ═══════════════════════════════════════════

/**
 * Build the activity feed panel.
 * @param {Array} activities - array of activity items from buildActivityItem
 * @returns {string} HTML
 */
export function buildActivityFeedHTML(activities = []) {
  if (!activities.length) {
    return `<div class="mh-empty-state">
      <span class="mh-empty-state-ico" aria-hidden="true">📊</span>
      <span class="mh-empty-state-title">لا يوجد نشاط حديث</span>
      <span class="mh-empty-state-text">سيظهر هنا النشاط الأخير للمحادثات والأوردرات</span>
    </div>`;
  }

  return `<div class="mh-activity-feed">
    ${activities.slice(0, 30).map(a => {
      const ico = a.ico || activityIcon(a.type);
      const time = a.ts ? fmtTimeRelative(a.ts) : '';
      const borderCls = activityBorderClass(a.type);
      const clickCls = a.convId ? 'mh-activity-item--clickable' : '';
      const clickAttr = a.convId ? `onclick="openConv('${esc(a.convId)}')"` : '';

      return `
        <div class="mh-activity-item ${borderCls} ${clickCls}" role="article" ${clickAttr}>
          <span class="mh-activity-ico" aria-hidden="true">${ico}</span>
          <div class="mh-activity-body">
            <div class="mh-activity-title">${esc(a.title)}</div>
            ${a.subtitle ? `<div class="mh-activity-sub">${esc(a.subtitle)}</div>` : ''}
          </div>
          ${time ? `<span class="mh-activity-time">${time}</span>` : ''}
        </div>`;
    }).join('')}
  </div>`;
}

// ═══════════════════════════════════════════
// 4. LIST HEADER
// ═══════════════════════════════════════════

/**
 * Build the enhanced conversation list header with search, new chat, and filter controls.
 */
export function buildListHeaderHTML({ searchQuery = '', activeTab = 'all', showArchived = false } = {}) {
  return `
    <div class="mh-list-hdr">
      <div class="mh-list-hdr-top">
        <h2 class="mh-list-title">
          <span class="mh-list-title-ico" aria-hidden="true">💬</span>
          <span>مساحة التواصل</span>
        </h2>
        <div class="mh-list-hdr-actions">
          <button type="button" class="mh-hdr-btn" onclick="toggleActivityPanel()" title="النشاط" aria-label="عرض لوحة النشاط">📊</button>
          <button type="button" class="mh-hdr-btn" onclick="openNewChat()" title="محادثة جديدة" aria-label="بدء محادثة جديدة">✏️</button>
        </div>
      </div>
      <div class="mh-search-wrap">
        <span class="mh-search-ico" aria-hidden="true">🔍</span>
        <input class="mh-search" id="mh-search"
          placeholder="بحث... (Ctrl+K)"
          aria-label="بحث في المحادثات"
          value="${esc(searchQuery)}"
          oninput="onWorkspaceSearch(this.value)">
        ${searchQuery ? `<button type="button" class="mh-search-clear" onclick="clearWorkspaceSearch()" aria-label="مسح البحث">✕</button>` : ''}
      </div>
    </div>`;
}

// ═══════════════════════════════════════════
// 5. ACTION ITEMS MINI
// ═══════════════════════════════════════════

/**
 * Build the action items mini-list for the workspace sidebar.
 */
export function buildActionItemsMiniHTML(items = [], currentUid = '') {
  const pending = items.filter(i => i.status === 'pending');
  if (!pending.length) return '';

  const done = items.filter(i => i.status === 'done');
  const total = pending.length + done.length;
  const progressPct = total > 0 ? Math.round((done.length / total) * 100) : 0;

  const myItems = pending.filter(i => i.assigneeId === currentUid);
  const display = myItems.length ? myItems : pending;

  const now = Date.now();

  return `
    <div class="mh-action-mini" aria-label="مهام معلقة">
      <div class="mh-action-mini-hdr">
        <span>✅ مهام معلقة (${pending.length})</span>
        <button type="button" class="mh-ctx-link" onclick="toggleContextPanel()" title="عرض الكل" aria-label="عرض كل المهام">←</button>
      </div>
      <div class="mh-action-mini-progress" aria-hidden="true">
        <div class="mh-action-mini-progress-fill" style="--pct:${progressPct}%"></div>
      </div>
      <div class="mh-action-mini-progress-label">${done.length}/${total} مكتمل</div>
      ${display.slice(0, 3).map(item => {
        const isOverdue = item.dueDate && (item.dueDate.seconds * 1000) < now;
        const overdueCls = isOverdue ? 'mh-action-mini-item--overdue' : '';
        return `
        <div class="mh-action-mini-item ${overdueCls}" onclick="openConv('${esc(item.convId || '')}')">
          <span class="mh-action-mini-check" aria-hidden="true">☐</span>
          <span class="mh-action-mini-text">${esc((item.text || '').slice(0, 50))}</span>
          ${isOverdue ? '<span class="mh-action-mini-overdue-badge">متأخر</span>' : ''}
        </div>`;
      }).join('')}
      ${pending.length > 3 ? `<div class="mh-action-mini-more">+${pending.length - 3} أخرى</div>` : ''}
    </div>`;
}

// ═══════════════════════════════════════════
// 6. SKELETON LOADERS
// ═══════════════════════════════════════════

/**
 * Build skeleton loading placeholders for the conversation list.
 * @param {number} count - number of skeleton rows
 * @returns {string} HTML
 */
export function buildConvListSkeletonHTML(count = 6) {
  let html = '';
  for (let i = 0; i < count; i++) {
    html += `<div class="ib-skeleton-conv" aria-hidden="true">
      <div class="ib-skeleton ib-skeleton-circle"></div>
      <div class="ib-skeleton-conv-body">
        <div class="ib-skeleton ib-skeleton-line" style="width:${65 + (i % 3) * 10}%"></div>
        <div class="ib-skeleton ib-skeleton-line ib-skeleton-line--short"></div>
      </div>
      <div class="ib-skeleton ib-skeleton-line ib-skeleton-line--xs" style="width:40px;flex-shrink:0"></div>
    </div>`;
  }
  return html;
}

/**
 * Build skeleton loading for messages area.
 * @param {number} count - number of skeleton messages
 * @returns {string} HTML
 */
export function buildMessagesSkeletonHTML(count = 4) {
  let html = '';
  const widths = ['55%', '40%', '65%', '35%', '50%', '45%'];
  const sides = ['in', 'out', 'in', 'in', 'out', 'in'];
  for (let i = 0; i < count; i++) {
    const side = sides[i % sides.length];
    const w = widths[i % widths.length];
    html += `<div class="ib-msg ${side}" style="max-width:${w}" aria-hidden="true">
      <div class="ib-skeleton" style="height:${36 + (i % 3) * 12}px;border-radius:10px;width:100%"></div>
    </div>`;
  }
  return html;
}
