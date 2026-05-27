// Design domain sidebar
import { register } from '../../runtime-shell/domain-registry.js';
import { buildSidebar } from '../../runtime-shell/sidebar-builder.js';

const CONFIG = {
  addLabel: 'طلب تصميم جديد',
  primaryAction: { icon: '📤', label: 'رفع تصميم', handler: 'openUploadDesign' },
  // Phase 1e (design page review):
  // design.html is a Kanban board (always shows all stages in columns).
  // "wip/review/all/done" were broken filter views — they navigated but
  // the page never filtered. Now removed. The 5 stat cards at the top
  // of the Kanban act as in-page column-focus instead.
  // The sidebar keeps only cross-page navigation here.
  views: [
    { id: 'hub',     ico: '🖥️', label: 'مساحة التصميم', deepLink: 'designer-hub.html' },
    { id: 'print',   ico: '🖨️', label: 'الطباعة',        deepLink: 'print.html' },
    { id: 'gallery', ico: '🖼️', label: 'المعرض',         deepLink: 'gallery.html' },
  ],
  secondaryViews: [],
  actions: [
    { id: 'upload',  ico: '📤', label: 'رفع تصميم',    handler: 'openUploadDesign' },
    { id: 'approve', ico: '✅', label: 'اعتماد تصميم',  handler: 'openApproveDesign' },
    { id: 'problem', ico: '⚠', label: 'تسجيل مشكلة',   handler: 'openReportProblem' },
    { id: 'assign',  ico: '👷', label: 'تعيين مصمم',    handler: 'openAssignDesigner' },
  ],
  // UX audit Phase 2: info-only signal removed (already a view in the views section).
  signals: [
    { kind: 'warn', ico: '⏰', label: 'تصاميم متأخرة', target: 'design.html?filter=late' },
    { kind: 'crit', ico: '⚠', label: 'مشاكل تصميم', target: 'design.html?filter=problem' },
  ],
};

register('design', ({ container, domain }) => buildSidebar({ container, domain, config: CONFIG }));
