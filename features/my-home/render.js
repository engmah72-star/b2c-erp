// ════════════════════════════════════════════════════════════════════
// features/my-home/render.js
// Pure render layer for the personal employee home ("صفحتي").
// View only — no Firestore, no globals (RULE L1.3 / PC1.5).
// Person-scoped: shows only the logged-in employee's own data (RULE 8).
// ════════════════════════════════════════════════════════════════════

import { isRecurringDue, RECURRENCE } from '../../core/task-recurrence.js';

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
  // المهام المحدّدة المفتوحة + المهام الدائمة (تظهر دائماً بحالة الفترة)
  const fixedPending = tasks.filter(t => t.taskType !== 'recurring' && t.status === 'pending');
  const recurring = tasks.filter(t => t.taskType === 'recurring' && t.status !== 'cancelled');
  if (!fixedPending.length && !recurring.length) return card('📋 مهامي', '<div class="mh-empty">لا مهام مفتوحة 🎉</div>');

  const fixedRows = fixedPending
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

  const recRows = recurring
    .sort((a, b) => Number(isRecurringDue(b)) - Number(isRecurringDue(a)))
    .map(t => {
      const due = isRecurringDue(t);
      const pri = t.priority === 'urgent' ? '⚡' : t.priority === 'low' ? '📎' : '📌';
      const r = RECURRENCE[t.recurrence] || {};
      return `<div class="mh-task${due ? '' : ' done'}">
        <div class="mh-task-main"><span>${pri}</span> <span class="mh-task-t">${esc(t.title || '')}</span>
          <span class="mh-due">🔁 ${esc(r.lbl || 'متكرّر')}</span></div>
        ${t.description ? `<div class="mh-task-d">${esc(t.description)}</div>` : ''}
        ${due
          ? `<button type="button" class="btn btn-sm btn-g" data-act="task-recur-done" data-id="${esc(t._id)}" data-rec="${esc(t.recurrence)}">✓ تم ${esc(r.period || '')}</button>`
          : `<span class="mh-task-doneflag">✓ تمّت ${esc(r.period || '')}</span>`}
      </div>`;
    }).join('');

  const dueCount = fixedPending.length + recurring.filter(t => isRecurringDue(t)).length;
  return card(`📋 مهامي <span class="mh-badge">${dueCount}</span>`, recRows + fixedRows);
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
  if (a.incidents > 0) {
    // صور المخالفات (إن وُجدت) — مصغّرة قابلة للتكبير
    const imgs = (a.incidentList || []).filter(i => i.imageUrl);
    const thumbs = imgs.length
      ? `<div class="mh-inc-imgs">${imgs.slice(0, 6).map(i =>
          `<a href="${esc(i.imageUrl)}" target="_blank" rel="noopener" class="mh-inc-imglink" title="${esc(i.title || 'صورة المخالفة')}"><img src="${esc(i.imageUrl)}" alt="صورة المخالفة" loading="lazy" class="mh-inc-img"></a>`
        ).join('')}</div>`
      : '';
    items.push(`<li class="warn">⚠️ ${a.incidents} ملاحظة هذا الشهر — <a href="my-profile.html?tab=feedback">راجع بروفايلك</a>${thumbs}</li>`);
  }
  if (a.mustChangePassword) items.push(`<li class="crit">🔑 يجب تغيير كلمة المرور — <a href="change-password.html">غيّرها الآن</a></li>`);
  if (!items.length) items.push('<li class="ok">✅ لا تنبيهات — كل شيء على ما يرام</li>');
  return card('🔔 تنبيهاتي', `<ul class="mh-alerts">${items.join('')}</ul>`);
}

// ── Comm hub — «التواصل مع الإدارة» (البند 3 · جهة الموظف) ─────────────
// مكان واحد يجمع قنوات الموظف نحو الإدارة بعدّادات حيّة. عرض + روابط فقط.
export function renderCommHub({ requests = 0, incidents = 0 } = {}) {
  const badge = n => n > 0 ? ` <span class="mh-badge">${n}</span>` : '';
  const row = (href, ico, lbl, n, sub) => `<a class="mh-ch" href="${esc(href)}">
    <span class="mh-ch-ico">${ico}</span>
    <span class="mh-ch-txt"><span class="mh-ch-lbl">${esc(lbl)}${badge(n)}</span>
      <span class="mh-ch-sub">${esc(sub)}</span></span>
    <span class="mh-ch-go">←</span></a>`;
  const body = `<div class="mh-ch-list">
    ${row('my-requests.html', '🌴', 'طلباتي', requests, 'إجازات · سلف · مصروفات')}
    ${row('my-profile.html?tab=feedback', '💬', 'ملاحظاتي وتظلّماتي', incidents, 'راجع ملاحظات الإدارة وقدّم تظلّماً')}
    ${row('inbox.html', '✉️', 'مراسلة الإدارة', 0, 'محادثة مباشرة')}
  </div>`;
  return card('📨 التواصل مع الإدارة', body);
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
