// Design domain sidebar
import { register } from '../../runtime-shell/domain-registry.js';
import { buildSidebar } from '../../runtime-shell/sidebar-builder.js';

const CONFIG = {
  addLabel: 'طلب تصميم جديد',
  primaryAction: { icon: '📤', label: 'رفع تصميم', handler: 'openUploadDesign' },
  views: [
    { id: 'all',    ico: '🎨', label: 'طلبات التصميم',  deepLink: 'design.html' },
    { id: 'wip',    ico: '⏳', label: 'قيد التنفيذ',     deepLink: 'design.html?filter=wip' },
    { id: 'review', ico: '👀', label: 'تحت المراجعة',    deepLink: 'design.html?filter=review' },
    { id: 'done',   ico: '✅', label: 'منتهية',           deepLink: 'design.html?filter=done' },
    { id: 'hub',    ico: '🖥️', label: 'مساحة التصميم',  deepLink: 'designer-hub.html' },
    { id: 'gallery',ico: '🖼️', label: 'المعرض',          deepLink: 'gallery.html' },
  ],
  actions: [
    { id: 'upload',  ico: '📤', label: 'رفع تصميم',    handler: 'openUploadDesign' },
    { id: 'approve', ico: '✅', label: 'اعتماد تصميم',  handler: 'openApproveDesign' },
    { id: 'problem', ico: '⚠', label: 'تسجيل مشكلة',   handler: 'openReportProblem' },
    { id: 'assign',  ico: '👷', label: 'تعيين مصمم',    handler: 'openAssignDesigner' },
  ],
  signals: [
    { kind: 'warn', ico: '⏰', label: 'تصاميم متأخرة', target: 'design.html?filter=late' },
    { kind: 'info', ico: '👀', label: 'تحت المراجعة', target: 'design.html?filter=review' },
    { kind: 'crit', ico: '⚠', label: 'مشاكل تصميم', target: 'design.html?filter=problem' },
  ],
};

register('design', ({ container, domain }) => buildSidebar({ container, domain, config: CONFIG }));
