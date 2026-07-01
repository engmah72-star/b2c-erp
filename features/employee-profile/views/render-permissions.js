/**
 * Business2Card ERP — features/employee-profile/views/render-permissions.js
 *
 * ━━━ PERMISSIONS MATRIX VIEW (Phase-2D · god-page decomp) ━━━
 *
 * Pure HTML builders for the admin tab → permissions matrix block.
 *   - ALL_PAGES / ALL_PERMS / ALL_CAPS — UI catalogs
 *   - buildPermsUI(current)  — checkboxes grid (pages + data perms + capabilities)
 *   - buildAdminLockedHTML() — locked card shown when emp.role === 'admin'
 *
 * Pure: no DOM access, no Firestore. The page fetches the user's current
 * permissions and passes them in.
 */

export const ALL_PAGES = [
  { key: 'clients',          label: '👤 العملاء' },
  { key: 'design',           label: '✏️ التصميم' },
  { key: 'print',            label: '🖨️ الطباعة' },
  { key: 'production',       label: '🏭 التنفيذ' },
  { key: 'shipping',         label: '🚚 الشحن' },
  { key: 'shipping-accounts', label: '📦 حسابات الشحن' },
  { key: 'archive',          label: '📁 الأرشيف' },
  { key: 'accounts',         label: '💰 الحسابات' },
  { key: 'reports',          label: '📊 التقارير' },
  { key: 'suppliers',        label: '▣ الموردين' },
  { key: 'products',         label: '◈ المنتجات' },
  { key: 'gallery',          label: '🖼️ المعرض' },
  { key: 'design-workspace', label: '🖥️ مساحة التصميم' },
  { key: 'settings',         label: '⚙️ الإعدادات' },
  { key: 'employees',        label: '👥 الموظفين' },
];

export const ALL_PERMS = [
  { key: 'canSeePrices',       label: '💰 يشوف الأسعار' },
  { key: 'canSeeAllOrders',    label: '📋 يشوف أوردرات الكل' },
  { key: 'canAddOrders',       label: '➕ يضيف أوردرات' },
  { key: 'canViewClients',     label: '👁️ يفتح/يشوف العملاء' },
  { key: 'canAddClients',      label: '👤 يضيف عملاء' },
  { key: 'canFollowUpClients', label: '📞 يتابع العملاء' },
  { key: 'canArchiveClients',  label: '📁 يأرشف العملاء' },
  { key: 'canAddSuppliers',    label: '▣ يضيف/يعدّل موردين' },
  { key: 'canAssignDesigner',  label: '🎨 يعين المصمم' },
  { key: 'canAssignTasks',     label: '✅ يضيف مهام للموظفين' },
  { key: 'canViewCosts',       label: '🏭 يشوف التكاليف والأرباح' },
];

// Capabilities — saved under permissions.capabilities, read by canDo()
export const ALL_CAPS = [
  { key: 'create_orders',    label: '➕ يضيف أوردرات جديدة' },
  { key: 'edit_orders',      label: '✏️ يعدّل الأوردرات' },
  { key: 'archive_orders',   label: '📁 يأرشف الأوردرات' },
  { key: 'approve_designs',  label: '✅ يعتمد التصاميم' },
  { key: 'manage_printing',  label: '🖨️ يدير الطباعة' },
  { key: 'manage_products',  label: '◈ يضيف/يعدّل المنتجات' },
  { key: 'manage_shipping',  label: '🚚 يدير الشحن' },
  { key: 'manage_payments',  label: '💳 يدير المدفوعات' },
  { key: 'manage_returns',   label: '↩️ يدير المرتجعات' },
  { key: 'manage_suppliers', label: '▣ يدير الموردين' },
  { key: 'view_financials',  label: '📊 يشوف الحسابات/المالية' },
];

function escAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Locked admin card — shown when employee has role 'admin'.
 */
export function buildAdminLockedHTML() {
  return '<div style="font-size:var(--fs-base);color:var(--g);text-align:center;padding:var(--space-md)">✅ Admin — صلاحيات كاملة (محمية)</div>';
}

/**
 * Build the permissions checkboxes UI.
 *
 * @param {Object} args
 * @param {Object} args.current — merged permissions { pages:[...], canSeePrices, ..., capabilities:{...} }
 * @returns {string} HTML
 */
export function buildPermsUI({ current }) {
  const currentPages = current?.pages || [];
  const isAllPages = currentPages.includes('*');
  const caps = current?.capabilities || {};
  return `
    <div style="margin-bottom:14px">
      <div style="font-size:var(--fs-sm);font-weight:var(--fw-bold);color:var(--dim2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">📄 الصفحات المتاحة</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        ${ALL_PAGES.map(p => {
          const isChecked = isAllPages || currentPages.includes(p.key);
          return `<label style="display:flex;align-items:center;gap:var(--space-sm);padding:8px 10px;background:var(--bg3);border-radius:var(--rad);cursor:pointer">
            <input type="checkbox" class="perm-page" value="${escAttr(p.key)}" ${isChecked ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--b);cursor:pointer">
            <span style="font-size:var(--fs-base);font-weight:var(--fw-semi)">${p.label}</span>
          </label>`;
        }).join('')}
      </div>
    </div>
    <div style="margin-bottom:14px">
      <div style="font-size:var(--fs-sm);font-weight:var(--fw-bold);color:var(--dim2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">🔐 صلاحيات البيانات</div>
      <div style="display:grid;gap:6px">
        ${ALL_PERMS.map(p =>
          `<label style="display:flex;align-items:center;gap:var(--space-sm);padding:10px 12px;background:var(--bg3);border-radius:var(--rad);cursor:pointer">
            <input type="checkbox" class="perm-data" value="${escAttr(p.key)}" ${current?.[p.key] ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--b);cursor:pointer">
            <span style="font-size:var(--fs-md);font-weight:var(--fw-semi)">${p.label}</span>
          </label>`
        ).join('')}
      </div>
    </div>
    <div>
      <div style="font-size:var(--fs-sm);font-weight:var(--fw-bold);color:var(--dim2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">⚡ القدرات (Capabilities)</div>
      <div style="display:grid;gap:6px">
        ${ALL_CAPS.map(p =>
          `<label style="display:flex;align-items:center;gap:var(--space-sm);padding:10px 12px;background:var(--bg3);border-radius:var(--rad);cursor:pointer">
            <input type="checkbox" class="perm-cap" value="${escAttr(p.key)}" ${caps[p.key] ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--b);cursor:pointer">
            <span style="font-size:var(--fs-md);font-weight:var(--fw-semi)">${p.label}</span>
          </label>`
        ).join('')}
      </div>
    </div>`;
}
