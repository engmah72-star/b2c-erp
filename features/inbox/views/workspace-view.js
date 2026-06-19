/**
 * features/inbox/views/workspace-view.js
 * ━━━ WORKSPACE VIEW BUILDERS — عناصر مساحة العمل ━━━
 * Pure HTML builders for the workspace shell elements.
 */

import { escapeHtml as esc, fmtTime } from '../../../core/inbox-utils.js';
import { WORKSPACE_TABS, ACTIVITY_TYPES, computeWorkspaceStats } from '../../../core/messaging-hub.js';

/**
 * Build the category tabs bar.
 * @param {string} activeTab - current tab id
 * @param {Object} counts - { all, priority, orders, teams, clients, direct }
 * @param {string} currentUid
 * @returns {string} HTML
 */
export function buildCategoryTabsHTML(activeTab, counts = {}) {
  return `<div class="mh-tabs-wrap">
    ${WORKSPACE_TABS.map(tab => {
      const count = counts[tab.id] || 0;
      const isActive = activeTab === tab.id;
      return `<button type="button"
        class="mh-tab ${isActive ? 'active' : ''}"
        data-tab="${tab.id}"
        onclick="switchWorkspaceTab('${tab.id}')">
        <span class="mh-tab-ico">${tab.ico}</span>
        <span class="mh-tab-label">${tab.label}</span>
        ${count > 0 && tab.id !== 'all' ? `<span class="mh-tab-badge">${count > 99 ? '99+' : count}</span>` : ''}
      </button>`;
    }).join('')}
  </div>`;
}

/**
 * Build the workspace stats header bar.
 */
export function buildStatsBarHTML(conversations, currentUid) {
  const s = computeWorkspaceStats(conversations, currentUid);
  const parts = [];
  if (s.totalUnread) parts.push(`<span class="mh-stat"><span class="mh-stat-ico">💬</span> ${s.totalUnread} غير مقروءة</span>`);
  if (s.urgentCount) parts.push(`<span class="mh-stat urgent"><span class="mh-stat-ico">🔴</span> ${s.urgentCount} عاجل</span>`);
  if (s.mentionCount) parts.push(`<span class="mh-stat"><span class="mh-stat-ico">@</span> ${s.mentionCount} إشارة</span>`);
  if (!parts.length) return '';
  return `<div class="mh-stats-bar">${parts.join('')}</div>`;
}

/**
 * Build the activity feed panel.
 * @param {Array} activities - array of activity items from buildActivityItem
 * @returns {string} HTML
 */
export function buildActivityFeedHTML(activities = []) {
  if (!activities.length) {
    return `<div class="mh-activity-empty">
      <div style="opacity:.4;font-size:28px;margin-bottom:8px">📊</div>
      <div>لا يوجد نشاط حديث</div>
    </div>`;
  }

  return `<div class="mh-activity-feed">
    ${activities.slice(0, 20).map(a => {
      const typeIco = {
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
      const ico = a.ico || typeIco[a.type] || '💬';
      const time = a.ts ? fmtTime(a.ts) : '';
      const clickable = a.convId ? `onclick="openConv('${esc(a.convId)}')" style="cursor:pointer"` : '';
      return `
        <div class="mh-activity-item" ${clickable}>
          <span class="mh-activity-ico">${ico}</span>
          <div class="mh-activity-body">
            <div class="mh-activity-title">${esc(a.title)}</div>
            ${a.subtitle ? `<div class="mh-activity-sub">${esc(a.subtitle)}</div>` : ''}
          </div>
          ${time ? `<span class="mh-activity-time">${time}</span>` : ''}
        </div>`;
    }).join('')}
  </div>`;
}

/**
 * Build the enhanced conversation list header with search, new chat, and filter controls.
 */
export function buildListHeaderHTML({ searchQuery = '', activeTab = 'all', showArchived = false } = {}) {
  return `
    <div class="mh-list-hdr">
      <div class="mh-list-hdr-top">
        <h2 class="mh-list-title">
          <span class="mh-list-title-ico">💬</span>
          <span>مساحة التواصل</span>
        </h2>
        <div class="mh-list-hdr-actions">
          <button type="button" class="mh-hdr-btn" onclick="toggleActivityPanel()" title="النشاط">📊</button>
          <button type="button" class="mh-hdr-btn" onclick="openNewChat()" title="محادثة جديدة">✏️</button>
        </div>
      </div>
      <div class="mh-search-wrap">
        <span class="mh-search-ico">🔍</span>
        <input class="mh-search" id="mh-search" placeholder="بحث في المحادثات والرسائل..."
          value="${esc(searchQuery)}" oninput="onWorkspaceSearch(this.value)">
        ${searchQuery ? `<button type="button" class="mh-search-clear" onclick="clearWorkspaceSearch()">✕</button>` : ''}
      </div>
    </div>`;
}

/**
 * Build the action items mini-list for the workspace sidebar.
 */
export function buildActionItemsMiniHTML(items = [], currentUid = '') {
  const pending = items.filter(i => i.status === 'pending');
  if (!pending.length) return '';
  const myItems = pending.filter(i => i.assigneeId === currentUid);
  const display = myItems.length ? myItems : pending;

  return `
    <div class="mh-action-mini">
      <div class="mh-action-mini-hdr">
        <span>✅ مهام معلقة (${pending.length})</span>
        <button type="button" class="mh-ctx-link" onclick="toggleContextPanel()" title="عرض الكل">←</button>
      </div>
      ${display.slice(0, 3).map(item => `
        <div class="mh-action-mini-item" onclick="openConv('${esc(item.convId || '')}')">
          <span>⬜</span>
          <span class="mh-action-mini-text">${esc((item.text || '').slice(0, 50))}</span>
        </div>
      `).join('')}
      ${pending.length > 3 ? `<div class="mh-action-mini-more">+${pending.length - 3} أخرى</div>` : ''}
    </div>`;
}
