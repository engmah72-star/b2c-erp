// ══ Notifications System ══
// يراقب المهام والأوردرات المعيّنة للموظف ويعرض إشعارات

import { getFirestore, collection, query, where, onSnapshot, doc, updateDoc, writeBatch, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const STORAGE_KEY = 'b2c_notif_seen';

export function initNotifications(app, currentUser) {
  if (!currentUser) return;
  const db = getFirestore(app);
  const uid = currentUser.uid;

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

  // ── مراقبة المهام المعيّنة للموظف ──
  const tasksQ = query(collection(db, 'tasks'), where('assignedTo', '==', uid));
  onSnapshot(tasksQ, snap => {
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
  });

  // ── مراقبة الأوردرات المعيّنة للموظف ──
  const ordersQ = query(collection(db, 'orders'), where('designerId', '==', uid));
  onSnapshot(ordersQ, snap => {
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
  });

  const ordersShipQ = query(collection(db, 'orders'), where('shippingOfficerId', '==', uid));
  onSnapshot(ordersShipQ, snap => {
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
  });

  function mergeNotifs(group, items) {
    allNotifs = allNotifs.filter(n => !n.id.startsWith(group === 'task' ? 'task_' : group === 'order_design' ? 'order_design_' : 'order_ship_'));
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
    panel.innerHTML = `
      <div class="notif-head">
        <span>🔔 الإشعارات ${allNotifs.length > 0 ? `(${allNotifs.length})` : ''}</span>
      </div>
      <div class="notif-list">
        ${isEmpty
          ? `<div class="empty" style="padding:32px 20px"><div class="empty-icon">🎉</div><div class="empty-text">لا توجد إشعارات</div></div>`
          : allNotifs.map(n => `
            <div class="notif-item" onclick="${n.link ? `window.location.href='${n.link}'` : 'void(0)'}">
              <div class="notif-ico">${n.ico}</div>
              <div class="notif-body">
                <div class="notif-title">${n.title}</div>
                ${n.desc ? `<div class="notif-desc">${n.desc}</div>` : ''}
                <div class="notif-time">${timeAgo(n.time)}</div>
              </div>
            </div>
          `).join('')
        }
      </div>
    `;
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
