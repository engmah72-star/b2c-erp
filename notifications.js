// ══ Notifications System ══
// يراقب المهام والأوردرات المعيّنة للموظف ويعرض إشعارات

import { getFirestore, collection, query, where, onSnapshot, doc, getDoc, updateDoc, writeBatch, serverTimestamp, limit }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { initFcm } from "./fcm-init.js";

const STORAGE_KEY = 'b2c_notif_seen';

// Per-listener safety caps (RULE G3). Each employee sees a finite number of
// active items at a time — these are well above realistic counts and exist
// only to bound Firestore reads when a user accumulates historical rows.
const NOTIF_LIMITS = Object.freeze({
  tasks:        50,
  ordersByRole: 100,  // designer/printer/shipper/producer
  auditFlags:   100,
  followups:    100,
  sysNotifs:    100,
});

// Track all active listeners so we can unsubscribe on logout/navigation
// Prevents memory leaks: each page navigation otherwise accumulates a new set.
const __activeUnsubs = [];
function __register(unsub) { if (typeof unsub === 'function') __activeUnsubs.push(unsub); }

export function cleanupNotifications() {
  while (__activeUnsubs.length) {
    try { __activeUnsubs.pop()(); } catch (e) { console.warn('[notif] unsub failed:', e?.message || e); }
  }
}
// Auto-cleanup on tab unload (defensive — SPA navigations should call cleanupNotifications explicitly)
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', cleanupNotifications, { once: true });
}

// Escape HTML chars in user-controlled strings before interpolating into innerHTML
function __esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}

export function initNotifications(app, currentUser) {
  if (!currentUser) return;
  // Defensive: if init is called twice (e.g., re-auth), clean previous listeners first.
  cleanupNotifications();

  const db = getFirestore(app);
  const uid = currentUser.uid;

  // Kick off FCM in the background — never blocks the bell wiring below.
  // Failures are logged inside initFcm; the in-app feed stays functional even
  // if push permission is denied or the browser doesn't support FCM.
  initFcm(app, currentUser);

  // إنشاء زر الجرس في الـ topbar
  const topbarRight = document.querySelector('.topbar-right');
  if (!topbarRight) return;

  const bell = document.createElement('div');
  bell.id = 'notif-bell';
  bell.className = 'notif-bell';
  bell.innerHTML = '🔔';
  bell.title = 'الإشعارات';
  bell.onclick = togglePanel;
  topbarRight.prepend(bell);

  let allNotifs = [];
  let panelOpen = false;
  let seenIds = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');

  // Foreground push: bump the bell so the badge ticks even while the tab is
  // focused (the SW only renders system notifications when hidden). Wired
  // here so allNotifs / updateBadge are already in scope.
  window.addEventListener('b2c:fcm:foreground', (ev) => {
    const d = ev.detail || {};
    const fakeId = 'fcm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    allNotifs = [{
      id: fakeId,
      type: d.data?.type || 'push',
      ico: '🔔',
      title: d.title || 'إشعار',
      desc:  d.body || '',
      time:  new Date(),
      link:  d.data?.link || null,
    }, ...allNotifs];
    updateBadge();
    if (panelOpen) renderPanel();
  });

  // ── مراقبة المهام المعيّنة للموظف ──
  const tasksQ = query(collection(db, 'tasks'), where('assignedTo', '==', uid), limit(NOTIF_LIMITS.tasks));
  __register(onSnapshot(tasksQ, snap => {
    const taskNotifs = snap.docs.map(d => {
      const t = d.data();
      return {
        id: 'task_' + d.id,
        type: 'task',
        ico: '📋',
        title: t.title || 'مهمة جديدة',
        desc: t.description || '',
        time: t.createdAt?.toDate?.() || new Date(),
        link: null,
      };
    });
    mergeNotifs('task', taskNotifs);
  }));

  // ── مراقبة الأوردرات المعيّنة للموظف ──
  const ordersQ = query(collection(db, 'orders'), where('designerId', '==', uid), limit(NOTIF_LIMITS.ordersByRole));
  __register(onSnapshot(ordersQ, snap => {
    const orderNotifs = snap.docs
      .filter(d => ['design', 'printing'].includes(d.data().stage))
      .map(d => {
        const o = d.data();
        return {
          id: 'order_design_' + d.id,
          type: 'order',
          ico: '✏️',
          title: `أوردر تصميم — ${o.clientName || ''}`,
          desc: `${o.orderId || d.id.slice(-6)} · ${stageAr(o.stage)}`,
          time: o.createdAt?.toDate?.() || new Date(),
          link: `design.html?id=${d.id}`,
        };
      });
    mergeNotifs('order_design', orderNotifs);
  }));

  const ordersShipQ = query(collection(db, 'orders'), where('shippingOfficerId', '==', uid), limit(NOTIF_LIMITS.ordersByRole));
  __register(onSnapshot(ordersShipQ, snap => {
    const shipNotifs = snap.docs
      .filter(d => d.data().stage === 'shipping')
      .map(d => {
        const o = d.data();
        return {
          id: 'order_ship_' + d.id,
          type: 'order',
          ico: '🚚',
          title: `أوردر شحن — ${o.clientName || ''}`,
          desc: `${o.orderId || d.id.slice(-6)} · انتظار الشحن`,
          time: o.createdAt?.toDate?.() || new Date(),
          link: `shipping.html?id=${d.id}`,
        };
      });
    mergeNotifs('order_ship', shipNotifs);
  }));

  // ── الأوردرات المُسلَّمة للطابع (printerId) ──
  const ordersPrintQ = query(collection(db, 'orders'), where('printerId', '==', uid), limit(NOTIF_LIMITS.ordersByRole));
  __register(onSnapshot(ordersPrintQ, snap => {
    const printNotifs = snap.docs
      .filter(d => d.data().stage === 'printing')
      .map(d => {
        const o = d.data();
        return {
          id: 'order_print_' + d.id,
          type: 'order',
          ico: '🖨️',
          title: `أوردر طباعة — ${o.clientName || ''}`,
          desc: `${o.orderId || d.id.slice(-6)} · انتظار الطباعة`,
          time: o.createdAt?.toDate?.() || new Date(),
          link: `print.html?id=${d.id}`,
        };
      });
    mergeNotifs('order_print', printNotifs);
  }));

  // ── الأوردرات اللي عليها تعديل من موظف لم يُراجَع (للأدمن فقط) ──
  getDoc(doc(db, 'users', uid)).then(userSnap => {
    if (!userSnap.exists()) return;
    const role = userSnap.data().role || '';
    if (!['admin', 'operation_manager'].includes(role)) return;
    const auditQ = query(collection(db, 'orders'), where('hasUnreviewedAudit', '==', true), limit(NOTIF_LIMITS.auditFlags));
    __register(onSnapshot(auditQ, snap => {
      const auditNotifs = snap.docs.map(d => {
        const o = d.data();
        const lastAudit = (o.auditLog || []).filter(a => a.requiresReview).pop() || {};
        const r = (lastAudit.reason || '').slice(0, 50);
        return {
          id: 'audit_' + d.id,
          type: 'audit',
          ico: '🚨',
          title: `مراجعة مطلوبة — ${o.clientName || ''}`,
          desc: `${lastAudit.changedBy || 'موظف'} عدّل ${lastAudit.type === 'collection_edit' ? 'مبلغ التحصيل' : lastAudit.type === 'shipping_edit' ? 'بيانات الشحن' : 'الأوردر'}${r ? ' — ' + r : ''}`,
          time: lastAudit.date ? new Date() : (o.updatedAt?.toDate?.() || new Date()),
          link: `shipping.html?orderId=${d.id}`,
        };
      });
      mergeNotifs('audit', auditNotifs);
    }, err => console.warn('[notif] audit listener error:', err?.message || err)));
  }).catch(err => console.warn('[notif] user fetch failed:', err?.message || err));

  // ── متابعات العملاء — تذكيرات مستحقّة (assignedTo == current user) ──
  const fuQ = query(collection(db, 'client_followups'), where('assignedTo', '==', uid), limit(NOTIF_LIMITS.followups));
  __register(onSnapshot(fuQ, snap => {
    const now = Date.now();
    const fuNotifs = snap.docs
      .map(d => ({ ...d.data(), _id: d.id }))
      .filter(f => !f.isDeleted && !f.nextActionDone && f.nextActionDate)
      .filter(f => {
        const t = new Date(f.nextActionDate).getTime();
        return !isNaN(t) && t <= now;
      })
      .map(f => ({
        id: 'followup_' + f._id,
        type: 'followup',
        ico: '📞',
        title: `متابعة مستحقّة — ${f.clientName || 'عميل'}`,
        desc: `${f.note ? f.note.slice(0, 60) : 'تذكير متابعة'}`,
        time: new Date(f.nextActionDate),
        link: `clients.html?openClient=${f.clientId}&tab=followups`,
      }));
    mergeNotifs('followup', fuNotifs);
  }, err => console.warn('[notif] followup listener error:', err?.message || err)));

  // ── إشعارات النظام (notifications collection) ──
  // كتابات Cloud Functions: followup_due, approval_pending, order_assigned,...
  const notifQ = query(collection(db, 'notifications'), where('toUid', '==', uid), limit(NOTIF_LIMITS.sysNotifs));
  __register(onSnapshot(notifQ, snap => {
    const sysNotifs = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(n => !n.archived)
      .map(n => ({
        id:    'sys_' + n.id,
        type:  n.type || 'system',
        ico:   n.ico  || '🔔',
        title: n.title || 'إشعار',
        desc:  n.desc  || '',
        time:  n.createdAt?.toDate?.() || new Date(),
        link:  n.link || null,
      }));
    mergeNotifs('sys', sysNotifs);
  }, err => console.warn('[notif] system notifs listener error:', err?.message || err)));

  // ── الأوردرات المُسلَّمة للمنفّذ (productionAgent) ──
  const ordersProdQ = query(collection(db, 'orders'), where('productionAgent', '==', uid), limit(NOTIF_LIMITS.ordersByRole));
  __register(onSnapshot(ordersProdQ, snap => {
    const prodNotifs = snap.docs
      .filter(d => d.data().stage === 'production')
      .map(d => {
        const o = d.data();
        return {
          id: 'order_prod_' + d.id,
          type: 'order',
          ico: '🏭',
          title: `أوردر تنفيذ — ${o.clientName || ''}`,
          desc: `${o.orderId || d.id.slice(-6)} · انتظار التنفيذ`,
          time: o.createdAt?.toDate?.() || new Date(),
          link: `production.html?id=${d.id}`,
        };
      });
    mergeNotifs('order_prod', prodNotifs);
  }));

  function mergeNotifs(group, items) {
    const prefixMap = {
      task:         'task_',
      order_design: 'order_design_',
      order_print:  'order_print_',
      order_prod:   'order_prod_',
      order_ship:   'order_ship_',
      audit:        'audit_',
      followup:     'followup_',
    };
    const prefix = prefixMap[group] || (group + '_');
    allNotifs = allNotifs.filter(n => !n.id.startsWith(prefix));
    allNotifs = [...items, ...allNotifs];
    allNotifs.sort((a, b) => b.time - a.time);
    updateBadge();
    if (panelOpen) renderPanel();
  }

  function unreadCount() {
    return allNotifs.filter(n => !seenIds.includes(n.id)).length;
  }

  function updateBadge() {
    const count = unreadCount();
    let badge = bell.querySelector('.notif-badge');
    if (count > 0) {
      if (!badge) { badge = document.createElement('div'); badge.className = 'notif-badge'; bell.appendChild(badge); }
      badge.textContent = count > 99 ? '99+' : count;
    } else {
      badge?.remove();
    }
  }

  function togglePanel() {
    panelOpen = !panelOpen;
    const existing = document.getElementById('notif-panel');
    if (!panelOpen) { existing?.remove(); return; }
    // علّم الكل كـ "مرئي" عند الفتح
    seenIds = [...new Set([...seenIds, ...allNotifs.map(n => n.id)])];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seenIds.slice(-200)));
    updateBadge();
    renderPanel();
    // إغلاق عند الضغط خارج
    setTimeout(() => document.addEventListener('click', outsideClick), 10);
  }

  function outsideClick(e) {
    const panel = document.getElementById('notif-panel');
    if (panel && !panel.contains(e.target) && !bell.contains(e.target)) {
      panelOpen = false;
      panel.remove();
      document.removeEventListener('click', outsideClick);
    }
  }

  function renderPanel() {
    document.getElementById('notif-panel')?.remove();
    const panel = document.createElement('div');
    panel.id = 'notif-panel';
    panel.className = 'notif-panel';

    const isEmpty = allNotifs.length === 0;
    // XSS-safe: escape all user-controlled strings (n.title, n.desc, n.link, n.ico)
    // Click handler attached via delegation instead of inline onclick — prevents
    // attribute injection via crafted n.link values from Firestore.
    panel.innerHTML = `
      <div class="notif-head">
        <span>🔔 الإشعارات ${allNotifs.length > 0 ? `(${allNotifs.length})` : ''}</span>
      </div>
      <div class="notif-list">
        ${isEmpty
          ? `<div class="empty" style="padding:32px 20px"><div class="empty-icon">🎉</div><div class="empty-text">لا توجد إشعارات</div></div>`
          : allNotifs.map((n, i) => `
            <div class="notif-item" data-idx="${i}">
              <div class="notif-ico">${__esc(n.ico)}</div>
              <div class="notif-body">
                <div class="notif-title">${__esc(n.title)}</div>
                ${n.desc ? `<div class="notif-desc">${__esc(n.desc)}</div>` : ''}
                <div class="notif-time">${__esc(timeAgo(n.time))}</div>
              </div>
            </div>
          `).join('')
        }
      </div>
    `;
    // Event delegation: safer than inline onclick + supports any future link format
    panel.addEventListener('click', (e) => {
      const item = e.target.closest('.notif-item');
      if (!item) return;
      const idx = parseInt(item.dataset.idx, 10);
      const n = allNotifs[idx];
      if (n?.link) {
        if (typeof window.navigatePage === 'function') window.navigatePage(n.link);
        else window.location.href = n.link;
      }
    });
    document.body.appendChild(panel);
  }

  function stageAr(s) {
    return {design:'تصميم', printing:'طباعة', production:'تنفيذ', shipping:'شحن'}[s] || s;
  }

  function timeAgo(date) {
    if (!date) return '';
    const diff = Math.floor((Date.now() - date) / 1000);
    if (diff < 60) return 'الآن';
    if (diff < 3600) return `منذ ${Math.floor(diff/60)} دقيقة`;
    if (diff < 86400) return `منذ ${Math.floor(diff/3600)} ساعة`;
    return `منذ ${Math.floor(diff/86400)} يوم`;
  }
}

// ── Button Loading Utility (global) ──
window.btnLoad = function(btn) {
  if (!btn) return;
  btn._origText = btn.innerHTML;
  btn.classList.add('btn-loading');
  btn.disabled = true;
};

window.btnReset = function(btn) {
  if (!btn) return;
  btn.classList.remove('btn-loading');
  btn.disabled = false;
  if (btn._origText !== undefined) btn.innerHTML = btn._origText;
};
