// Inbox domain sidebar
import { register } from '../../runtime-shell/domain-registry.js';
import { buildSidebar } from '../../runtime-shell/sidebar-builder.js';

const CONFIG = {
  addLabel: 'رسالة جديدة',
  primaryAction: { icon: '✏', label: 'رسالة جديدة', handler: 'openNewMessage' },
  views: [
    { id: 'all',     ico: '💬', label: 'كل المحادثات',  deepLink: 'inbox.html' },
    { id: 'unread',  ico: '🔵', label: 'غير مقروءة',     deepLink: 'inbox.html?filter=unread' },
    { id: 'urgent',  ico: '🔥', label: 'عاجلة',           deepLink: 'inbox.html?filter=urgent' },
    { id: 'pinned',  ico: '📌', label: 'مثبَّتة',           deepLink: 'inbox.html?filter=pinned' },
    { id: 'archived',ico: '📁', label: 'مؤرشفة',          deepLink: 'inbox.html?filter=archived' },
    { id: 'requests',ico: '📋', label: 'طلباتي',          deepLink: 'my-requests.html' },
  ],
  actions: [
    { id: 'new-msg',  ico: '✏', label: 'رسالة جديدة',    handler: 'openNewMessage' },
    { id: 'mark-read',ico: '✅', label: 'تعيين كمقروءة',  handler: 'markAllRead' },
  ],
  signals: [
    { kind: 'crit', ico: '🔵', label: 'رسائل غير مقروءة', signalKey: 'unread' },
    { kind: 'warn', ico: '🔥', label: 'محادثات عاجلة' },
  ],
};

register('inbox', ({ container, domain }) => buildSidebar({ container, domain, config: CONFIG }));
