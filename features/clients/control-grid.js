/**
 * Business2Card ERP — features/clients/control-grid.js
 *
 * ━━━ CONTROL GRID UTILITIES (Phase-3 · clients god-page decomp) ━━━
 *
 * Pure helpers for the admin "control grid" tab:
 *   - findClientForOrder(order, clients) → client | null  (3-way lookup)
 *   - buildBulkStagePrompt(statusMap)    → prompt string
 *   - buildBulkAssignPrompt(designers)   → prompt string
 *   - findDesignerByName(name, designers) → designer | null
 *   - triggerCsvDownload(csv, filename)  → DOM utility (browser-only)
 *
 * No Firestore. Lookups and prompt builders are pure; CSV download is a thin
 * browser helper to consolidate the data-URI trick.
 */

/**
 * Resolve the parent client for an order using a 3-key fallback:
 *   1) order.clientId === client._id (primary)
 *   2) order.clientPhone === client.phone1
 *   3) order.clientName === client.name
 *
 * @param {Object} order   — { clientId?, clientPhone?, clientName? }
 * @param {Array}  clients — [{ _id, phone1?, name? }]
 * @returns {Object|null}
 */
export function findClientForOrder(order, clients = []) {
  if (!order) return null;
  if (order.clientId) {
    const byId = clients.find(c => c._id === order.clientId);
    if (byId) return byId;
  }
  if (order.clientPhone) {
    const byPhone = clients.find(c => c.phone1 === order.clientPhone);
    if (byPhone) return byPhone;
  }
  if (order.clientName) {
    const byName = clients.find(c => c.name && c.name === order.clientName);
    if (byName) return byName;
  }
  return null;
}

/**
 * Build the prompt message shown when bulk-moving orders to a stage.
 *
 * @param {Object} statusMap — keys = stage names
 * @param {number} [count]   — number of orders being moved (for context line)
 */
export function buildBulkStagePrompt(statusMap, count = 0) {
  const stages = Object.keys(statusMap || {}).join(' | ');
  return `نقل ${count} أوردر إلى:\n${stages}`;
}

/**
 * Build the prompt message shown when bulk-assigning orders to an employee.
 *
 * @param {Array} designers — [{ name?, displayName? }]
 */
export function buildBulkAssignPrompt(designers = []) {
  const names = designers
    .map(e => e.name || e.displayName || '')
    .filter(Boolean)
    .join(' | ');
  return `اسم الموظف بالضبط:\n${names}`;
}

/**
 * Find a designer by exact name match (checks name then displayName).
 *
 * @param {string} name      — exact match against name or displayName
 * @param {Array}  designers
 * @returns {Object|null}
 */
export function findDesignerByName(name, designers = []) {
  if (!name) return null;
  return designers.find(e => (e.name || e.displayName || '') === name) || null;
}

/**
 * Trigger a CSV download in the browser.
 * Uses data: URI with BOM prefix for Excel compatibility.
 *
 * @param {string} csv      — CSV content
 * @param {string} filename — proposed filename
 */
export function triggerCsvDownload(csv, filename = 'export.csv') {
  if (typeof document === 'undefined') return;  // SSR/test guard
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,﻿' + encodeURIComponent(csv || '');
  a.download = filename;
  a.click();
}
