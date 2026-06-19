/**
 * features/inbox/views/context-panel-view.js
 * ━━━ CONTEXT PANEL VIEW — لوحة السياق ━━━
 * Pure HTML builder for the right-side context panel.
 */

import { escapeHtml as esc } from '../../../core/inbox-utils.js';
import { stageLabel, stageColor, fmtPrice, ACTION_ITEM_STATUS } from '../../../core/messaging-hub.js';

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
      <div style="font-size:48px;opacity:.3;margin-bottom:12px">📋</div>
      <div style="color:var(--ws-text-dim);font-size:var(--fs-sm)">اختر محادثة لعرض التفاصيل</div>
    </div>`;
  }

  let html = '<div class="mh-ctx-scroll">';

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

function buildOrderSection(order) {
  const stageBg = stageColor(order.stage);
  const products = (order.products || []).slice(0, 5);

  let productsHtml = '';
  if (products.length) {
    productsHtml = `<div class="mh-ctx-products">
      ${products.map(p => `
        <div class="mh-ctx-product">
          <span class="mh-ctx-product-name">${esc(p.name || 'منتج')}</span>
          <span class="mh-ctx-product-qty">×${p.qty || 1}</span>
          ${p.status ? `<span class="mh-ctx-product-status">${esc(p.status)}</span>` : ''}
        </div>
      `).join('')}
    </div>`;
  }

  let assigneesHtml = '';
  if (order.assignees) {
    const roles = [
      { key: 'designer', label: 'المصمم', ico: '🎨' },
      { key: 'production', label: 'التنفيذ', ico: '🏭' },
      { key: 'shipping', label: 'الشحن', ico: '🚚' },
    ];
    const assigned = roles.filter(r => order.assignees[r.key]);
    if (assigned.length) {
      assigneesHtml = `<div class="mh-ctx-assignees">
        ${assigned.map(r => `
          <div class="mh-ctx-assignee">
            <span>${r.ico}</span>
            <span class="mh-ctx-assignee-label">${r.label}</span>
          </div>
        `).join('')}
      </div>`;
    }
  }

  return `
    <div class="mh-ctx-section">
      <div class="mh-ctx-section-hdr">
        <span>📦 تفاصيل الأوردر</span>
        <button type="button" class="mh-ctx-link" onclick="navigateToOrder('${esc(order.id)}')"
          title="فتح الأوردر">↗</button>
      </div>
      <div class="mh-ctx-order-card">
        <div class="mh-ctx-order-top">
          <span class="mh-ctx-order-code">#${esc(order.code)}</span>
          <span class="mh-ctx-stage" style="background:${stageBg}">${esc(stageLabel(order.stage))}</span>
        </div>
        <div class="mh-ctx-order-client">${esc(order.clientName || '—')}</div>
        ${order.salePrice ? `<div class="mh-ctx-order-price">${fmtPrice(order.salePrice)}</div>` : ''}
        ${order.deadline ? `<div class="mh-ctx-order-deadline">⏰ ${esc(order.deadline)}</div>` : ''}
        ${order.designStage ? `<div class="mh-ctx-order-meta">🎨 ${esc(order.designStage)}</div>` : ''}
        ${order.shippingMethod ? `<div class="mh-ctx-order-meta">🚚 ${esc(order.shippingMethod)}</div>` : ''}
      </div>
      ${productsHtml}
      ${assigneesHtml}
    </div>`;
}

function buildQuickActionsSection(actions, context) {
  return `
    <div class="mh-ctx-section">
      <div class="mh-ctx-section-hdr"><span>⚡ إجراءات سريعة</span></div>
      <div class="mh-ctx-actions-grid">
        ${actions.map(a => `
          <button type="button" class="mh-ctx-action-btn"
            onclick="execQuickAction('${a.id}', '${esc(context.order?.id || '')}', '${esc(context.category)}')"
            title="${esc(a.label)}">
            <span class="mh-ctx-action-ico">${a.ico}</span>
            <span class="mh-ctx-action-label">${esc(a.label)}</span>
          </button>
        `).join('')}
      </div>
    </div>`;
}

function buildParticipantsSection(participants, presenceMap) {
  return `
    <div class="mh-ctx-section">
      <div class="mh-ctx-section-hdr">
        <span>👥 المشاركون (${participants.length})</span>
      </div>
      <div class="mh-ctx-participants">
        ${participants.map(p => {
          const pres = presenceMap.get(p.uid);
          const online = pres?.online && ((Date.now() - (pres.lastSeen?.seconds || 0) * 1000) < 90000);
          return `
            <div class="mh-ctx-participant ${p.isCurrent ? 'is-me' : ''}">
              <div class="mh-ctx-participant-dot ${online ? 'online' : ''}"></div>
              <span class="mh-ctx-participant-name">${esc(p.name)}${p.isCurrent ? ' (أنت)' : ''}</span>
              ${p.role ? `<span class="mh-ctx-participant-role">${esc(p.role)}</span>` : ''}
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

function buildActionItemsSection(items, currentUid) {
  const pending = items.filter(i => i.status === ACTION_ITEM_STATUS.PENDING);
  const done = items.filter(i => i.status === ACTION_ITEM_STATUS.DONE);

  return `
    <div class="mh-ctx-section">
      <div class="mh-ctx-section-hdr">
        <span>✅ المهام (${pending.length})</span>
        <button type="button" class="mh-ctx-link" onclick="openNewActionItem()" title="مهمة جديدة">+</button>
      </div>
      ${pending.length ? pending.map(item => buildActionItemRow(item, currentUid)).join('') :
        `<div class="mh-ctx-empty-hint">لا توجد مهام معلقة</div>`}
      ${done.length ? `
        <details class="mh-ctx-done-toggle">
          <summary>المنجزة (${done.length})</summary>
          ${done.map(item => buildActionItemRow(item, currentUid)).join('')}
        </details>` : ''}
    </div>`;
}

function buildActionItemRow(item, currentUid) {
  const isDone = item.status === ACTION_ITEM_STATUS.DONE;
  const isMine = item.assigneeId === currentUid || item.createdBy === currentUid;
  return `
    <div class="mh-ctx-action-item ${isDone ? 'done' : ''} ${isMine ? 'mine' : ''}"
      data-item-id="${esc(item._id || '')}">
      <button type="button" class="mh-ctx-item-check"
        onclick="toggleActionItem('${esc(item._id || '')}')">
        ${isDone ? '☑️' : '⬜'}
      </button>
      <div class="mh-ctx-item-body">
        <div class="mh-ctx-item-text">${esc(item.text || '')}</div>
        ${item.assigneeName ? `<div class="mh-ctx-item-assignee">→ ${esc(item.assigneeName)}</div>` : ''}
        ${item.dueDate ? `<div class="mh-ctx-item-due">⏰ ${esc(item.dueDate)}</div>` : ''}
      </div>
    </div>`;
}
