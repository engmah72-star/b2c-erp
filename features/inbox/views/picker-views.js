/**
 * Business2Card ERP — features/inbox/views/picker-views.js
 *
 * ━━━ PICKER MODAL VIEWS (Phase-3 · inbox decomp) ━━━
 *
 * Pure HTML builders for the 4 picker-style modals:
 *   - buildForwardListHTML    — forward message → conv/user
 *   - buildShareListHTML      — share order → conv/user
 *   - buildUserListHTML       — new chat / DM picker (with presence)
 *   - buildOrderPickerHTML    — pick active order to share
 */

import {
  convDisplayName, convIcon, convColor, isUserOnline,
  initAvatar, colorOfRole, escapeHtml as esc,
} from '../../../core/inbox-utils.js';

const escSingleQuote = (s) => (s || '').replace(/'/g, '');

// ── Forward / Share list builder (shared pattern) ────────────────────

/**
 * Build a forward-style list (conversations + non-DM'd users).
 *
 * @param {Object} args
 * @param {Array}  args.conversations
 * @param {Array}  args.allUsers
 * @param {string} args.searchQuery
 * @param {string} args.currentUid
 * @param {string} args.onClickFn          — global window fn name (e.g. 'doForward')
 * @param {Object} args.roleColorMap
 * @param {Object} args.roleLabelMap
 *
 * @returns {string} HTML
 */
function buildPickerListHTML({ conversations, allUsers, searchQuery, currentUid, onClickFn, roleColorMap, roleLabelMap }) {
  const ctx = { currentUid, allUsers, roleColorMap };
  const q = (searchQuery || '').toLowerCase();
  const items = [];
  // conversations (non-archived)
  for (const c of conversations.filter(cv => !(cv.archivedBy || []).includes(currentUid))) {
    const n = convDisplayName(c, ctx);
    if (!q || n.toLowerCase().includes(q)) {
      items.push({
        kind: 'conv', _id: c._id, name: n,
        ico: convIcon(c, ctx), col: convColor(c, ctx),
        sub: c.type === 'dm' ? 'محادثة مباشرة' : 'قناة',
      });
    }
  }
  // users who don't yet have a DM
  const existingDmUids = new Set();
  for (const c of conversations.filter(cv => cv.type === 'dm')) {
    for (const u of (c.participants || [])) {
      if (u !== currentUid) existingDmUids.add(u);
    }
  }
  for (const u of allUsers.filter(uu => !existingDmUids.has(uu._id))) {
    if (!q || (u.name || '').toLowerCase().includes(q)) {
      items.push({
        kind: 'user', _id: u._id,
        name: u.name || 'موظف',
        ico: initAvatar(u.name),
        col: colorOfRole(u.role, roleColorMap),
        sub: roleLabelMap[u.role] || '',
      });
    }
  }
  if (!items.length) {
    return '<div style="padding:30px;text-align:center;color:var(--ws-text-dim)">لا نتائج</div>';
  }
  return items.slice(0, 40).map(it => `<div class="ib-user-row" onclick="${onClickFn}('${it.kind}','${it._id}','${esc(escSingleQuote(it.name))}')">
    <div class="ib-user-avatar" style="background:${it.col}">${it.ico}</div>
    <div class="ib-user-info"><div class="ib-user-name">${esc(it.name)}</div><div class="ib-user-role">${esc(it.sub)}</div></div>
  </div>`).join('');
}

/** Forward modal list. */
export function buildForwardListHTML(args) {
  return buildPickerListHTML({ ...args, onClickFn: 'doForward' });
}

/** Share-order modal list. */
export function buildShareListHTML(args) {
  return buildPickerListHTML({ ...args, onClickFn: 'doShareOrder' });
}

// ── User list (new chat) ─────────────────────────────────────────────

/**
 * Build the new-chat user picker (with presence indicators).
 *
 * @param {Object} args
 * @param {Array}  args.allUsers
 * @param {Map}    args.presenceMap
 * @param {string} args.searchQuery
 * @param {Object} args.roleColorMap
 * @param {Object} args.roleLabelMap
 */
export function buildUserListHTML({ allUsers = [], presenceMap = new Map(), searchQuery = '', roleColorMap = {}, roleLabelMap = {} }) {
  const q = (searchQuery || '').toLowerCase();
  let list = allUsers.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
  if (q) {
    list = list.filter(u =>
      (u.name || '').toLowerCase().includes(q) ||
      (roleLabelMap[u.role] || '').toLowerCase().includes(q)
    );
  }
  if (!list.length) {
    return '<div style="padding:30px;text-align:center;color:var(--ws-text-dim);font-size:var(--fs-md)">لا نتائج</div>';
  }
  return list.map(u => {
    const p = presenceMap.get(u._id);
    const online = isUserOnline(p);
    return `<div class="ib-user-row" onclick="startDM('${u._id}','${esc(escSingleQuote(u.name || ''))}')">
      <div class="ib-user-avatar" style="background:${colorOfRole(u.role, roleColorMap)};position:relative">${initAvatar(u.name)}<span class="presence ${online ? 'online' : ''}" style="position:absolute;bottom:0;left:0;width:11px;height:11px;border-radius:50%;background:${online ? '#25d366' : 'var(--ws-text-dim)'};border:2px solid var(--ws-panel)"></span></div>
      <div class="ib-user-info">
        <div class="ib-user-name">${esc(u.name || 'موظف')}</div>
        <div class="ib-user-role">${roleLabelMap[u.role] || u.role || ''} ${online ? '· متصل' : ''}</div>
      </div>
    </div>`;
  }).join('');
}

// ── Order picker ─────────────────────────────────────────────────────

/**
 * Build the order picker modal list.
 *
 * @param {Object} args
 * @param {Array}  args.orders
 * @param {string} args.searchQuery
 * @param {Object} args.stageAr
 */
export function buildOrderPickerHTML({ orders = [], searchQuery = '', stageAr = {} }) {
  const q = (searchQuery || '').toLowerCase().trim();
  let list = orders;
  if (q) {
    list = list.filter(o => {
      const code = (o.orderId || o._id || '').toLowerCase();
      const name = (o.clientName || '').toLowerCase();
      const prod = (o.product || (o.products || []).map(p => p.name).join(' ') || '').toLowerCase();
      return code.includes(q) || name.includes(q) || prod.includes(q);
    });
  }
  list = list.slice(0, 50);
  if (!list.length) {
    return '<div style="padding:30px;text-align:center;color:var(--ws-text-dim);font-size:var(--fs-md)">لا أوردرات نشطة</div>';
  }
  return list.map(o => {
    const prods = o.product || (o.products || []).map(p => p.name).join('، ') || '—';
    const code = esc(o.orderId || o._id.slice(-6));
    return `<div class="ib-user-row" onclick="pickOrderForChat('${o._id}')">
      <div class="ib-user-avatar" style="background:#00a884">📦</div>
      <div class="ib-user-info">
        <div class="ib-user-name">${esc(o.clientName || '—')}</div>
        <div class="ib-user-role">#${code} · ${esc(prods)} · ${stageAr[o.stage] || o.stage || ''}${o.deadline ? ' · ' + esc(o.deadline) : ''}</div>
      </div>
    </div>`;
  }).join('');
}
