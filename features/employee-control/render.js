// ════════════════════════════════════════════════════════════════════
// features/employee-control/render.js
// Pure render layer for the Employee Control Center.
// View only — no Firestore, no globals, no business logic (RULE L1.3 + PC1.5).
// Receives prepared data, returns HTML strings.
// ════════════════════════════════════════════════════════════════════

export const ROLE_LABELS = {
  admin:             'مدير النظام',
  operation_manager: 'مدير العمليات',
  customer_service:  'خدمة العملاء',
  graphic_designer:  'مصمم جرافيك',
  design_operator:   'مشغّل تصميم',
  production_agent:  'مسؤول إنتاج',
  shipping_officer:  'مسؤول شحن',
  wallet_manager:    'محاسب',
};

// Organized by department (PC3 — grouped view reflects the operational workflow).
export const DEPARTMENTS = [
  { id: 'management', label: 'الإدارة',          ico: '👔', roles: ['admin', 'operation_manager'] },
  { id: 'cs',         label: 'خدمة العملاء',     ico: '🎧', roles: ['customer_service'] },
  { id: 'design',     label: 'التصميم',          ico: '🎨', roles: ['graphic_designer', 'design_operator'] },
  { id: 'production', label: 'الإنتاج والطباعة', ico: '🏭', roles: ['production_agent'] },
  { id: 'shipping',   label: 'الشحن',            ico: '🚚', roles: ['shipping_officer'] },
  { id: 'accounts',   label: 'المحاسبة',         ico: '💰', roles: ['wallet_manager'] },
  { id: 'other',      label: 'أخرى',             ico: '📌', roles: [] },
];

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function deptOf(role) {
  const d = DEPARTMENTS.find(x => x.roles.includes(role));
  return d ? d.id : 'other';
}

// ── KPI bar (org-level — اليوم في سطر واحد) ──────────────────────────
export function renderKpiBar(k) {
  const cell = (ico, val, lbl, cls = '') =>
    `<div class="ec-kpi ${cls}"><div class="ec-kpi-ico">${ico}</div>` +
    `<div class="ec-kpi-val">${val}</div><div class="ec-kpi-lbl">${esc(lbl)}</div></div>`;
  return `<div class="ec-kpis">
    ${cell('👥', k.total,         'إجمالي الموظفين')}
    ${cell('🟢', k.presentToday,  'حاضر اليوم')}
    ${cell('⚡', k.workingNow,    'يعمل الآن')}
    ${cell('✅', k.finishedToday, 'أُنجز اليوم')}
    ${cell('🔧', k.wip,           'قيد التنفيذ')}
    ${cell('⚠️', k.incidents,     'إخفاقات الشهر', k.incidents ? 'warn' : '')}
  </div>`;
}

// ── helpers لكروت المتابعة ───────────────────────────────────────────
const STAGE_LBL = { design: 'تصميم', printing: 'طباعة', production: 'تنفيذ', shipping: 'شحن' };
const PALETTE = ['#4a8ef5', '#a78bfa', '#00c87a', '#ffaa00', '#ff3d6e', '#22d3ee', '#f472b6', '#34d399'];
function avatarColor(name) {
  let h = 0; const s = String(name || '?');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function orderCode(o) {
  return o.code || o.orderCode || o.serial || o.ref || ('#' + String(o._id || '').slice(-5));
}

// سهم الاتجاه — مقارنة درجة الشهر بالشهر الماضي
function trendHTML(m) {
  const t = m.trend || 0;
  const cls = t >= 3 ? 'up' : t <= -3 ? 'down' : 'flat';
  const ico = t >= 3 ? '▲' : t <= -3 ? '▼' : '▬';
  const txt = t > 0 ? '+' + t : String(t);
  return `<span class="ec-trend ${cls}" title="مقارنة بالشهر الماضي (${m.prevScore ?? '—'})">${ico} ${txt}</span>`;
}

// الترتيب وسط نفس الدور + شريط نسبة مئوية
function rankHTML(m) {
  if (!m.rankTotal || m.rankTotal < 2) return '';
  return `<span class="ec-rank" title="ترتيبه وسط زملائه في نفس الدور">#${m.rank}/${m.rankTotal}</span>` +
    `<span class="ec-pct"><span class="ec-pct-f" style="width:${m.percentile}%"></span></span>`;
}

// زمن دورة العمل — متوسط المرحلة + أقدم أوردر جارٍ
function slaHTML(m) {
  const parts = [];
  if (m.slaAvgDays != null) parts.push(`⏱️ ${m.slaAvgDays}ي/مرحلة`);
  if (m.slaOldestDays > 0) {
    const warn = m.slaOldestDays >= 3;
    parts.push(`<span class="${warn ? 'ec-sla-warn' : ''}">أقدم ${m.slaOldestDays}ي${warn ? ' ⚠️' : ''}</span>`);
  }
  return parts.length ? `<div class="ec-sla">${parts.join(' · ')}</div>` : '';
}

// ── One employee row ─────────────────────────────────────────────────
function renderRow(emp, m, caps) {
  const id = esc(emp._id);
  const name = esc(emp.name || 'بدون اسم');
  const roleLbl = esc(ROLE_LABELS[emp.role] || emp.role || '—');
  const isActive = (emp.status || 'active') === 'active';

  // Signals (attention markers)
  const sig = [];
  if (m.incidents >= 2) sig.push('<span class="ec-sig crit" title="إخفاقات متعددة هذا الشهر">🔴</span>');
  if (m.lateTasks > 0)  sig.push(`<span class="ec-sig warn" title="${m.lateTasks} مهمة متأخرة">⏰</span>`);
  if (!isActive)        sig.push('<span class="ec-sig crit" title="الحساب معطّل">🔒</span>');

  const present = m.present
    ? '<span class="ec-dot on" title="حاضر اليوم">🟢</span>'
    : '<span class="ec-dot off" title="غير مسجّل اليوم">⚪</span>';

  const chip = (n, cls, title) =>
    `<span class="ec-chip ${n ? cls : 'zero'}" title="${esc(title)}">${n}</span>`;

  // Quick action buttons — each fires a central action (PC2 / A1).
  const btn = (act, ico, label) =>
    `<button type="button" class="ec-act" data-act="${act}" data-emp="${id}" title="${esc(label)}">${ico}</button>`;
  const acts = [
    btn('task',     '📋', 'إسناد مهمة'),
    btn('incident', '⚠️', 'تسجيل إخفاق'),
    caps.finance ? btn('finance', '💰', 'خصم / مكافأة') : '',
    caps.perms   ? btn('perms',   '🔐', 'صلاحيات / تفعيل') : '',
    btn('profile',  '👤', 'فتح البروفايل'),
  ].join('');

  return `<tr class="ec-row${isActive ? '' : ' inactive'}" data-emp="${id}">
    <td class="ec-c-name"><div class="ec-name">${name}</div><div class="ec-role">${roleLbl}</div></td>
    <td class="ec-c-present">${present}</td>
    <td class="ec-c-num">${chip(m.openTasks, 'info', 'مهام مفتوحة')}</td>
    <td class="ec-c-num">${chip(m.incidents, 'warn', 'إخفاقات الشهر')}</td>
    <td class="ec-c-sig">${sig.join('') || '<span class="ec-ok">✓</span>'}</td>
    <td class="ec-c-acts">${acts}</td>
  </tr>`;
}

// ── Grouped table (by department) ────────────────────────────────────
export function renderGroups({ employees, metrics, caps, filter }) {
  const q = (filter?.q || '').trim();
  let list = employees.slice();
  if (q) list = list.filter(e => (e.name || '').includes(q) || (e.phone || '').includes(q));
  if (filter?.status === 'active')   list = list.filter(e => (e.status || 'active') === 'active');
  if (filter?.status === 'inactive') list = list.filter(e => (e.status || 'active') !== 'active');
  if (filter?.flagged)               list = list.filter(e => { const m = metrics.get(e._id) || {}; return (m.incidents >= 2) || (m.lateTasks > 0); });

  if (!list.length) return '<div class="ec-empty">لا يوجد موظفون مطابقون.</div>';

  const head = `<thead><tr>
    <th>الموظف</th><th>حضور</th><th>مهام</th><th>إخفاقات</th><th>إشارات</th><th>إجراءات</th>
  </tr></thead>`;

  return DEPARTMENTS.map(dept => {
    const inDept = list.filter(e => deptOf(e.role) === dept.id);
    if (!inDept.length) return '';
    const rows = inDept
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'))
      .map(e => renderRow(e, metrics.get(e._id) || { present: false, openTasks: 0, lateTasks: 0, incidents: 0 }, caps))
      .join('');
    return `<section class="ec-group">
      <h3 class="ec-group-h">${dept.ico} ${esc(dept.label)} <span class="ec-group-n">${inDept.length}</span></h3>
      <div class="tbl-wrap"><table class="tbl ec-tbl">${head}<tbody>${rows}</tbody></table></div>
    </section>`;
  }).join('');
}

// ════════════════════════════════════════════════════════════════════
// عرض المتابعة (كروت) — حضور · شغّال على إيه · أنجز اليوم · KPI
// ════════════════════════════════════════════════════════════════════
function activityCard(emp, m, caps) {
  const id = esc(emp._id);
  const name = esc(emp.name || 'بدون اسم');
  const roleLbl = esc(ROLE_LABELS[emp.role] || emp.role || '—');
  const isActive = (emp.status || 'active') === 'active';
  const initial = esc((emp.name || '؟').trim().charAt(0) || '؟');

  // شريحة الحضور
  let attCls, attTxt;
  if (!m.present) { attCls = 'absent'; attTxt = '💤 لم يحضر اليوم'; }
  else if (m.checkedOut) { attCls = 'done'; attTxt = '✔ انصرف' + (m.checkOutStr ? ' · ' + esc(m.checkOutStr) : ''); }
  else { attCls = 'on'; attTxt = '🟢 يعمل' + (m.checkInStr ? ' · ' + esc(m.checkInStr) : '') + (m.lateMins > 0 ? ` · متأخر ${m.lateMins}د` : ''); }

  // شغّال عليه — أهم 4 أوردرات
  const chips = (m.working || []).slice(0, 4).map(o =>
    `<a class="ec-ochip" href="order.html?id=${esc(o._id)}" title="${esc(o.clientName || '')}">
       <span class="ec-ochip-st">${STAGE_LBL[o.stage] || ''}</span>${esc(orderCode(o))}</a>`).join('');
  const moreW = (m.working || []).length > 4 ? `<span class="ec-omore">+${m.working.length - 4}</span>` : '';
  const workBox = (m.working || []).length
    ? `<div class="ec-chips">${chips}${moreW}</div>`
    : `<div class="ec-idle">لا أوردرات على مكتبه الآن</div>`;

  // إشارات الانتباه
  const sig = [];
  if (m.incidents >= 2) sig.push('<span class="ec-sig" title="إخفاقات متعددة">🔴</span>');
  if (m.lateTasks > 0) sig.push(`<span class="ec-sig" title="${m.lateTasks} مهمة متأخرة">⏰</span>`);
  if (!isActive) sig.push('<span class="ec-sig" title="الحساب معطّل">🔒</span>');

  // أزرار الإجراءات (نفس الإجراءات المركزية)
  const btn = (act, ico, label) =>
    `<button type="button" class="ec-act" data-act="${act}" data-emp="${id}" title="${esc(label)}">${ico}</button>`;
  const acts = [
    btn('task', '📋', 'إسناد مهمة'),
    btn('incident', '⚠️', 'تسجيل إخفاق'),
    caps.finance ? btn('finance', '💰', 'خصم / مكافأة') : '',
    caps.perms ? btn('perms', '🔐', 'صلاحيات / تفعيل') : '',
    btn('profile', '👤', 'البروفايل'),
  ].join('');

  return `<div class="ec-card ${attCls}${isActive ? '' : ' inactive'}">
    <div class="ec-card-head">
      <div class="ec-av" style="background:${avatarColor(emp.name)}">${initial}</div>
      <div class="ec-card-id">
        <a class="ec-name" href="employee-profile.html?id=${id}">${name}</a>
        <div class="ec-role">${roleLbl}${sig.length ? ' · ' + sig.join('') : ''}</div>
      </div>
      <div class="ec-score-wrap">
        <div class="ec-score" style="--sc:${m.scoreCol}" title="${esc(m.grade || '')}">${m.score}<span>/100</span></div>
        ${trendHTML(m)}
      </div>
    </div>
    <div class="ec-meta">
      <div class="ec-att ${attCls}">${attTxt}</div>
      <div class="ec-rankwrap">${rankHTML(m)}</div>
    </div>
    ${slaHTML(m)}
    <div class="ec-card-stats">
      <div class="ec-stat"><span class="ec-stat-v">${m.workingCount}</span><span class="ec-stat-l">🔧 شغّال على</span></div>
      <div class="ec-stat"><span class="ec-stat-v">${m.finished}</span><span class="ec-stat-l">✅ أنجز اليوم</span></div>
      <div class="ec-stat"><span class="ec-stat-v">${m.openTasks}</span><span class="ec-stat-l">📋 مهام مفتوحة</span></div>
    </div>
    ${workBox}
    <div class="ec-card-acts">${acts}</div>
  </div>`;
}

// ── Leaderboard مصغّر (أعلى 3 / أحوج 3 للمتابعة) ─────────────────────
export function renderLeaderboard({ employees, metrics }) {
  const rows = employees
    .filter(e => (e.status || 'active') === 'active')
    .map(e => ({ e, m: metrics.get(e._id) }))
    .filter(x => x.m);
  if (rows.length < 3) return '';
  const medals = ['🥇', '🥈', '🥉'];
  const top = [...rows].sort((a, b) => b.m.score - a.m.score).slice(0, 3);
  const need = [...rows].sort((a, b) => (a.m.score - b.m.score) || (a.m.trend - b.m.trend)).slice(0, 3);
  const chip = (x, badge) =>
    `<a class="ec-lb-chip" href="employee-profile.html?id=${esc(x.e._id)}">
       <span class="ec-lb-badge">${badge}</span>
       <span class="ec-lb-name">${esc(x.e.name || '—')}</span>
       <span class="ec-lb-sc" style="color:${x.m.scoreCol}">${x.m.score}</span></a>`;
  return `<div class="ec-lb">
    <div class="ec-lb-col top"><div class="ec-lb-h">🏆 الأعلى أداءً</div>${top.map((x, i) => chip(x, medals[i])).join('')}</div>
    <div class="ec-lb-col need"><div class="ec-lb-h">🚩 يحتاجون متابعة</div>${need.map(x => chip(x, '⚠️')).join('')}</div>
  </div>`;
}

export function renderActivityGroups({ employees, metrics, caps, filter }) {
  const q = (filter?.q || '').trim();
  let list = employees.slice();
  if (q) list = list.filter(e => (e.name || '').includes(q) || (e.phone || '').includes(q));
  if (filter?.status === 'active') list = list.filter(e => (e.status || 'active') === 'active');
  if (filter?.status === 'inactive') list = list.filter(e => (e.status || 'active') !== 'active');
  if (filter?.flagged) list = list.filter(e => { const m = metrics.get(e._id) || {}; return (m.incidents >= 2) || (m.lateTasks > 0); });

  if (!list.length) return '<div class="ec-empty">لا يوجد موظفون مطابقون.</div>';

  const order = { on: 0, done: 1, absent: 2 };
  const attState = m => !m.present ? 'absent' : (m.checkedOut ? 'done' : 'on');

  return DEPARTMENTS.map(dept => {
    const inDept = list.filter(e => deptOf(e.role) === dept.id);
    if (!inDept.length) return '';
    const cards = inDept
      .map(e => ({ e, m: metrics.get(e._id) || { present: false, working: [], workingCount: 0, finished: 0, openTasks: 0, lateTasks: 0, incidents: 0, score: 0, scoreCol: 'var(--dim2)' } }))
      .sort((a, b) =>
        (order[attState(a.m)] - order[attState(b.m)]) ||
        (b.m.finished - a.m.finished) ||
        (b.m.workingCount - a.m.workingCount) ||
        (a.e.name || '').localeCompare(b.e.name || '', 'ar'))
      .map(({ e, m }) => activityCard(e, m, caps))
      .join('');
    return `<section class="ec-group">
      <h3 class="ec-group-h">${dept.ico} ${esc(dept.label)} <span class="ec-group-n">${inDept.length}</span></h3>
      <div class="ec-cards">${cards}</div>
    </section>`;
  }).join('');
}
