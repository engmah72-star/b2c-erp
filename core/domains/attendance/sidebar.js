// Attendance domain sidebar (Phase-4) — manager-only daily board.
import { register } from '../../runtime-shell/domain-registry.js';
import { buildSidebar } from '../../runtime-shell/sidebar-builder.js';

const CONFIG = {
  views: [
    { id: 'today', ico: '🕐', label: 'حضور اليوم', deepLink: 'attendance.html' },
  ],
};

register('attendance', ({ container, domain }) => buildSidebar({ container, domain, config: CONFIG }));
