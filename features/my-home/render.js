// ════════════════════════════════════════════════════════════════════
// features/my-home/render.js
// Pure render layer for the personal employee home ("صفحتي").
// View only — no Firestore, no globals (RULE L1.3 / PC1.5).
// Person-scoped: shows only the logged-in employee's own data (RULE 8).
// ════════════════════════════════════════════════════════════════════

export const ROLE_LABELS = {
  admin: 'مدير النظام', operation_manager: 'مدير العمليات', customer_service: 'خدمة العملاء',
  graphic_designer: 'مصمم جرافيك', design_operator: 'مشغّل تصميم', production_agent: 'مسؤول إنتاج',
  shipping_officer: 'مسؤول شحن', wallet_manager: 'محاسب',
};

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'صباح الخير';
  if (h < 18) return 'مساء الخير';
  return 'مساء الخير';
}

// ── Hero + attendance ────────────────────────────────────────────────
export function renderHero(d) {
  const name = esc(d.name || 'موظف');
  const role = esc(ROLE_LABELS[d.role] || d.role || '');
  const av = (d.name || 'U').slice(0, 1);
  const dateStr = new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });

  let att;
  if (d.attToday && d.attToday.checkIn && !d.attToday.checkOut) {
    att = `<div class="mh-att in">🟢 حاضر منذ ${esc(d.attToday.checkInStr || '')}
      <button type="button" class="btn btn-sm btn-y" data-act="checkout">تسجيل انصراف</button></div>`;
  } else if (d.attToday && d.attToday.checkOut) {
    att = `<div class="mh-att done">✅ سُجِّل اليوم (${esc(d.attToday.checkInStr || '')} – ${esc(d.attToday.checkOutStr || '')})</div>`;
  } else {
    att = `<div class="mh-att out">⚪ لم تسجّل حضورك اليوم
      <button type="button" class="btn btn-sm btn-g" data-act="checkin">تسجيل حضور</button></div>`;
  }

  return `<div class="mh-hero">
    <div class="mh-av">${esc(av)}</div>
    <div class="mh-hero-txt">
      <div class="mh-greet">${greeting()}، ${name} 👋</div>
      <div class="mh-sub">${role} · ${esc(dateStr)}</div>
    </div>
    <div class="mh-hero-att">${att}</div>
  </div>`;
}

// ── My tasks ─────────────────────────────────────────────────────────
export function renderTasks(tasks, today) {
  const pending = tasks.filter(t => t.status === 'pending');
  if (!pending.length) return card('📋 مهامي', '<div class="mh-empty">لا مهام مفتوحة 🎉</div>');
  const rows = pending
    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))
    .map(t => {
      const late = t.dueDate && t.dueDate < today;
      const pri = t.priority === 'urgent' ? '⚡' : t.priority === 'low' ? '📎' : '📌';
      return `<div class="mh-task${late ? ' late' : ''}">
        <div class="mh-task-main"><span>${pri}</span> <span class="mh-task-t">${esc(t.title || '')}</span>
          ${t.dueDate ? `<span class="mh-due${late ? ' late' : ''}">${late ? '⏰ ' : ''}${esc(t.dueDate)}</span>` : ''}</div>
        ${t.description ? `<div class="mh-task-d">${esc(t.description)}</div>` : ''}
        <button type="button" class="btn btn-sm btn-g" data-act="task-done" data-id="${esc(t._id)}">✓ تم</button>
      </div>`;
    }).join('');
  return card(`📋 مهامي <span class="mh-badge">${pending.length}</span>`, rows);
}

// ── My active orders (operational roles) ─────────────────────────────
export function renderOrders(orders) {
  if (!orders) return ''; // role has no order assignment
  if (!orders.length) return card('📦 أوردراتي الحالية', '<div class="mh-empty">لا أوردرات مُسنَدة لك حالياً.</div>');
  const rows = orders.slice(0, 30).map(o => `
    <div class="mh-order" data-act="open-order" data-id="${esc(o._id)}">
      <span class="mh-order-id">#${esc(o.orderNumber || o._id?.slice(0, 6) || '')}</span>
      <span class="mh-order-c">${esc(o.clientName || o.customerName || '—')}</span>
      <span class="mh-order-stage">${esc(o.stageLabel || o.stage || '')}</span>
    </div>`).join('');
  return card(`📦 أوردراتي الحالية <span class="mh-badge">${orders.length}</span>`, rows);
}

// ── Alerts ───────────────────────────────────────────────────────────
export function renderAlerts(a) {
  const items = [];
  if (a.lateTasks > 0)  items.push(`<li class="warn">⏰ لديك ${a.lateTasks} مهمة متأخرة</li>`);
  if (a.incidents > 0)  items.push(`<li class="warn">⚠️ ${a.incidents} ملاحظة هذا الشهر — راجع بروفايلك</li>`);
  if (a.mustChangePassword) items.push(`<li class="crit">🔑 يجب تغيير كلمة المرور — <a href="change-password.html">غيّرها الآن</a></li>`);
  if (!items.length) items.push('<li class="ok">✅ لا تنبيهات — كل شيء على ما يرام</li>');
  return card('🔔 تنبيهاتي', `<ul class="mh-alerts">${items.join('')}</ul>`);
}

// ── Quick links ──────────────────────────────────────────────────────
export function renderLinks(roleDash) {
  const link = (href, ico, lbl) => `<a class="mh-link" href="${esc(href)}">${ico}<span>${esc(lbl)}</span></a>`;
  return `<div class="mh-links">
    ${link('my-profile.html', '👤', 'بروفايلي الكامل')}
    ${roleDash ? link(roleDash, '📊', 'لوحة عملي') : ''}
    ${link('inbox.html', '💬', 'الرسائل')}
  </div>`;
}

function card(title, body) {
  return `<section class="mh-card"><h3 class="mh-card-h">${title}</h3><div class="mh-card-b">${body}</div></section>`;
}
