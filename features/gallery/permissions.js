/**
 * features/gallery/permissions.js
 *
 * طبقة صلاحيات module المعرض — تستورد role groups من المصدر الواحد قدر الإمكان.
 * طبقة نقية (لا Firebase / لا DOM) → قابلة للاختبار.
 *
 * نموذج الوصول (RFC-gallery §4 — بلا capability جديدة):
 *   - عرض   : عام (القراءة عامة في firestore.rules — دعاية + العميل يرى المعرض).
 *   - نشر   : admin · operation_manager · المصممون (يطابق firestore create = hasPage('design')).
 *   - إخفاء : صاحب العنصر أو admin (firestore update = hasPage('design')).
 *   - حذف   : admin فقط (firestore delete = isAdmin).
 *
 * دفاع متعدد الطبقات: هذه الطبقة (UI) + firestore.rules (fail-closed) + audit (H3).
 */

const ADMIN_ROLES    = new Set(['admin', 'operation_manager']);
const DESIGNER_ROLES = new Set(['graphic_designer', 'design_operator']);

export const isAdminRole    = (role) => ADMIN_ROLES.has(role);
export const isDesignerRole = (role) => DESIGNER_ROLES.has(role);

/** العرض عام للجميع (زوار + عملاء + موظفون). */
export function canViewGallery() {
  return true;
}

/** من يقدر ينشر تصميماً للمعرض؟ admin/ops + المصممون. */
export function canPublishGallery(role) {
  return isAdminRole(role) || isDesignerRole(role);
}

/**
 * من يقدر يخفي/يُظهر عنصراً؟ صاحبه (designerId) أو admin.
 * @param {string} role
 * @param {Object} [opts] { uid, item } — للتحقق من الملكية
 */
export function canToggleVisibility(role, { uid, item } = {}) {
  if (isAdminRole(role)) return true;
  if (!item || !uid) return false;
  return canPublishGallery(role) && item.designerId === uid;
}

/** من يقدر يميّز عنصراً (feature) ويرتّب المعرض؟ admin فقط. */
export function canCurateGallery(role) {
  return isAdminRole(role);
}

/** الحذف النهائي — admin فقط (يطابق firestore delete). */
export function canDeleteGalleryItem(role) {
  return isAdminRole(role);
}
