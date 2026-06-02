// ════════════════════════════════════════════════════════════════════
// features/employee-control/controller.js
// Orchestrates the Employee Control Center:
//   auth gate → capability gate → feature flag → bounded data load →
//   metric computation → render → event delegation → central actions.
// Reads only (onSnapshot/getDoc). All writes go through employee-actions.js.
// ════════════════════════════════════════════════════════════════════

import { auth, db } from '../../core/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { collection, doc, getDoc, onSnapshot, query, where, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { canDo } from '../../core/permissions-matrix.js';
import { isFeatureEnabled } from '../../core/feature-flags.js';
import { computeScore } from '../../core/employee-scoring.js';
import { STAGE_OWNERSHIP } from '../../orders.js';
import { renderKpiBar, renderGroups, renderActivityGroups, renderLeaderboard } from './render.js';
import { openQuickAction } from './quick-actions.js';

const todayStr = () => new Date().toISOString().slice(0, 10);
const monthKey = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const prevMonthKey = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const startOfTodayMs = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const startOfMonthMs = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };

// تاريخ الـ timeline → ms (يدعم ISO و ar-EG و "YYYY-MM-DD HH:mm")
const AR_DIGITS = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9' };
function tlMs(s) {
  if (!s) return 0;
  const str = String(s).replace(/[٠-٩]/g, d => AR_DIGITS[d]).replace(/[‎‏]/g, '').trim();
  let ms = Date.parse(str);
  if (!isNaN(ms)) return ms;
  ms = Date.parse(str.replace(' ', 'T'));
  if (!isNaN(ms)) return ms;
  const mt = str.match(/(\d{1,4})\/(\d{1,2})\/(\d{1,4})/);
  if (mt) {
    let a = +mt[1], b = +mt[2], c = +mt[3], day, mon, year;
    if (a > 31) { year = a; mon = b; day = c; } else { day = a; mon = b; year = c; }
    const d = new Date(year, mon - 1, day);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return 0;
}
const tsMs = ts => (ts && ts.toDate) ? ts.toDate().getTime() : 0;

// ── minimal toast (reuse global if a page provides one) ──────────────
window.__ecToast = function (msg, type = 'ok') {
  if (typeof window.toast === 'function') { try { return window.toast(msg, type); } catch (_) { /* fall through */ } }
  const t = document.createElement('div');
  t.className = 'ec-toast ' + (type === 'err' ? 'err' : 'ok');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3200);
};

const state = {
  me: { uid: '', name: '' },
  role: '',
  caps: { manageEmployees: false, finance: false, perms: false },
  employees: [], attToday: [], attMonth: [], incidents: [], tasks: [], tasksDone: [],
  orders: [], goals: [], wallets: [],
  filter: { q: '', status: 'all', flagged: false },
  view: 'activity', // 'activity' (كروت المتابعة) | 'table' (الجدول)
};

const ACTIVE_STAGES = ['design', 'printing', 'production', 'shipping'];

// أوردرات الموظف خلال الشهر (مفلترة حسب الدور) — لحساب KPI عبر computeScore
function inMonth(o, mKey) {
  const d = o.createdAt?.toDate?.();
  return !!d && d.toISOString().slice(0, 10).startsWith(mKey);
}
function roleOrdersForMonth(e, uid, empId, mKey) {
  const r = e.role, O = state.orders;
  if (r === 'graphic_designer' || r === 'design_operator')
    return O.filter(o => (o.designerId === uid || o.designerId === empId) && inMonth(o, mKey));
  if (r === 'customer_service')
    return O.filter(o => o.createdBy === uid && inMonth(o, mKey));
  if (r === 'production_agent')
    return O.filter(o => (o.productionAgent === uid || o.productionAgent === empId || o.printerId === uid || o.printerId === empId) && inMonth(o, mKey));
  if (r === 'shipping_officer')
    return O.filter(o => (o.shippingOfficerId === uid || o.shippingOfficerId === empId) && inMonth(o, mKey));
  return [];
}

// ── SLA / Cycle time — متوسط زمن المرحلة + أقدم أوردر جارٍ، لكل مالك ────
// تُنسب مدة كل مرحلة لمالكها الحالي. المراحل المكتملة هذا الشهر تدخل المتوسط.
const DAY_MS = 86400000;
function buildSla() {
  const now = Date.now();
  const m0 = startOfMonthMs();
  const acc = new Map(); // ownerId -> { sum, count, oldest }
  const get = id => { let a = acc.get(id); if (!a) { a = { sum: 0, count: 0, oldest: 0 }; acc.set(id, a); } return a; };
  state.orders.forEach(o => {
    // نقاط دخول المراحل (إنشاء = design، ثم كل تحويل مرحلي من الـ timeline)
    const pts = [];
    const c = tsMs(o.createdAt); if (c) pts.push({ stage: 'design', ms: c });
    (o.timeline || []).forEach(t => { if (t.stage) { const ms = tlMs(t.date || t.at); if (ms) pts.push({ stage: t.stage, ms }); } });
    pts.sort((a, b) => a.ms - b.ms);
    for (let i = 0; i < pts.length; i++) {
      const own = STAGE_OWNERSHIP[pts[i].stage] ? o[STAGE_OWNERSHIP[pts[i].stage].idField] : null;
      if (!own) continue;
      const nxt = pts[i + 1];
      if (nxt) {                                   // مرحلة مكتملة
        const dur = nxt.ms - pts[i].ms;
        if (dur > 0 && nxt.ms >= m0) { const a = get(own); a.sum += dur; a.count++; }
      } else if (ACTIVE_STAGES.includes(o.stage)) { // مرحلة جارية الآن
        const age = now - pts[i].ms;
        const a = get(own); if (age > a.oldest) a.oldest = age;
      }
    }
  });
  return acc;
}

// ── per-employee operational metrics (حضور · شغّال · أنجز · KPI) ──────
function buildMetrics() {
  const today = todayStr();
  const mKey = monthKey();
  const pKey = prevMonthKey();
  const t0 = startOfTodayMs();
  const now = new Date();
  const slaAcc = buildSla();
  const m = new Map();
  state.employees.forEach(e => {
    const uid = e.authUid || e._id;
    const empId = e._id;
    const mine = (v) => v && (v === uid || v === empId);

    // 1) الحضور اليوم (دقيق: وقت + تأخير + انصراف)
    const rec = state.attMonth.find(a =>
      (a.employeeUid === uid || a.employeeId === empId || a.employeeUid === empId || a.employeeId === uid) && a.date === today);
    const present = !!(rec && rec.checkIn);
    const checkedOut = !!(rec && rec.checkOut);
    const checkInStr = rec?.checkInStr || '';
    const checkOutStr = rec?.checkOutStr || '';
    const lateMins = rec ? (parseInt(rec.lateMinutes) || 0) : 0;

    // 2) شغّال عليه دلوقتي — مالك المرحلة الحالية
    const working = state.orders.filter(o => {
      const own = STAGE_OWNERSHIP[o.stage];
      return own && mine(o[own.idField]);
    });

    // 3) أنجز النهاردة — تحويلات مرحلية من الـ timeline + مهام مكتملة اليوم
    let stagesDone = 0;
    state.orders.forEach(o => {
      (o.timeline || []).forEach(t => {
        const isMine = t.byId === uid || t.byId === empId || (t.by && t.by === e.name);
        if (!isMine) return;
        const isTrans = !!t.stage || /مرحلة|انتقل|→/.test(t.action || '');
        if (isTrans && tlMs(t.date || t.at) >= t0) stagesDone++;
      });
    });
    const tasksDoneToday = state.tasksDone.filter(tk => mine(tk.assignedTo) && (tsMs(tk.updatedAt) || tsMs(tk.createdAt)) >= t0).length;
    const finished = stagesDone + tasksDoneToday;

    // 4) المهام المفتوحة + المتأخرة + الإخفاقات
    const myPending = state.tasks.filter(t => mine(t.assignedTo));
    const lateTasks = myPending.filter(t => t.dueDate && t.dueDate < today).length;
    const empIncidents = state.incidents.filter(i => i.employeeId === empId);

    // 5) درجة الأداء KPI — الشهر الحالي + الماضي (الاتجاه)
    // computeScore يفلتر الحضور/الإخفاقات داخليًا حسب mKey، فنمرّر المصفوفة الكاملة.
    const myAtt = state.attMonth.filter(a =>
      a.employeeUid === uid || a.employeeId === empId || a.employeeUid === empId || a.employeeId === uid);
    const myGoals = state.goals.filter(g => g.employeeId === empId);
    const sc = computeScore({
      mKey, now, employee: e, attendance: myAtt, leaves: [],
      monthOrders: roleOrdersForMonth(e, uid, empId, mKey), goals: myGoals, incidents: empIncidents,
    });
    const scPrev = computeScore({
      mKey: pKey, now, employee: e, attendance: myAtt, leaves: [],
      monthOrders: roleOrdersForMonth(e, uid, empId, pKey), goals: myGoals, incidents: empIncidents,
    });
    const trend = sc.score - scPrev.score;

    // 6) SLA — متوسط زمن المرحلة + أقدم أوردر جارٍ (بالأيام)
    const sla = slaAcc.get(uid) || slaAcc.get(empId) || { sum: 0, count: 0, oldest: 0 };
    const slaAvgDays = sla.count ? +(sla.sum / sla.count / DAY_MS).toFixed(1) : null;
    const slaOldestDays = sla.oldest ? Math.floor(sla.oldest / DAY_MS) : 0;

    m.set(empId, {
      present, checkedOut, checkInStr, checkOutStr, lateMins,
      working, workingCount: working.length, stagesDone, tasksDoneToday, finished,
      openTasks: myPending.length, lateTasks, incidents: empIncidents.length,
      score: sc.score, scoreCol: sc.col, grade: sc.grade,
      prevScore: scPrev.score, trend,
      slaAvgDays, slaOldestDays,
      role: e.role,
      // rank يُملأ بعد الحلقة
      rank: 0, rankTotal: 0, percentile: 100,
    });
  });

  // ── الترتيب وسط نفس الدور (للموظفين النشطين) ──
  const roleGroups = {};
  state.employees.forEach(e => {
    if ((e.status || 'active') !== 'active') return;
    const mm = m.get(e._id); if (!mm) return;
    (roleGroups[e.role] = roleGroups[e.role] || []).push({ id: e._id, score: mm.score });
  });
  Object.values(roleGroups).forEach(arr => {
    arr.sort((a, b) => b.score - a.score);
    arr.forEach((x, i) => {
      const mm = m.get(x.id);
      mm.rank = i + 1;
      mm.rankTotal = arr.length;
      mm.percentile = arr.length > 1 ? Math.round((1 - i / (arr.length - 1)) * 100) : 100;
    });
  });
  return m;
}

function groupsHTML(metrics) {
  const args = { employees: state.employees, metrics, caps: state.caps, filter: state.filter };
  return state.view === 'table' ? renderGroups(args) : renderActivityGroups(args);
}

function render() {
  const root = document.getElementById('ec-root');
  if (!root) return;
  const metrics = buildMetrics();
  const present = state.employees.filter(e => metrics.get(e._id)?.present);
  const curM = monthKey();
  const kpis = {
    total: state.employees.length,
    presentToday: present.length,
    workingNow: present.filter(e => !metrics.get(e._id)?.checkedOut).length,
    finishedToday: state.employees.reduce((s, e) => s + (metrics.get(e._id)?.finished || 0), 0),
    wip: state.orders.filter(o => ACTIVE_STAGES.includes(o.stage)).length,
    incidents: state.incidents.filter(i => (i.monthKey || (i.date || '').slice(0, 7)) === curM).length,
  };
  const tog = (v, ico, lbl) =>
    `<button type="button" class="ec-vtab${state.view === v ? ' active' : ''}" data-view="${v}">${ico} ${lbl}</button>`;
  const leaderboard = state.view === 'activity'
    ? renderLeaderboard({ employees: state.employees, metrics })
    : '';
  root.innerHTML =
    renderKpiBar(kpis) +
    leaderboard +
    `<div class="ec-filters">
      <div class="ec-vtabs">${tog('activity', '📊', 'المتابعة')}${tog('table', '📋', 'الجدول')}</div>
      <input class="inp ec-search" id="ec-q" placeholder="🔍 ابحث بالاسم أو الهاتف" value="${state.filter.q.replace(/"/g, '&quot;')}">
      <select class="inp ec-fstatus" id="ec-status">
        <option value="all"${state.filter.status === 'all' ? ' selected' : ''}>كل الحالات</option>
        <option value="active"${state.filter.status === 'active' ? ' selected' : ''}>نشط فقط</option>
        <option value="inactive"${state.filter.status === 'inactive' ? ' selected' : ''}>معطّل فقط</option>
      </select>
      <button type="button" class="btn btn-sm ${state.filter.flagged ? 'btn-r' : 'btn-ghost'}" id="ec-flagged">🚩 يحتاج انتباه</button>
    </div>
    <div id="ec-groups">${groupsHTML(metrics)}</div>`;

  wireFilters();
}

function reRenderGroups() {
  const el = document.getElementById('ec-groups');
  if (el) el.innerHTML = groupsHTML(buildMetrics());
}

function wireFilters() {
  const q = document.getElementById('ec-q');
  if (q) q.addEventListener('input', () => { state.filter.q = q.value; reRenderGroups(); });
  const st = document.getElementById('ec-status');
  if (st) st.addEventListener('change', () => { state.filter.status = st.value; reRenderGroups(); });
  const fl = document.getElementById('ec-flagged');
  if (fl) fl.addEventListener('click', () => { state.filter.flagged = !state.filter.flagged; render(); });
  document.querySelectorAll('.ec-vtab').forEach(b =>
    b.addEventListener('click', () => { state.view = b.dataset.view; render(); }));
}

// ── event delegation for quick actions (one listener) ───────────────
function wireActions() {
  document.getElementById('ec-root').addEventListener('click', (e) => {
    const btn = e.target.closest('.ec-act');
    if (!btn) return;
    const emp = state.employees.find(x => x._id === btn.dataset.emp);
    if (!emp) return;
    const act = btn.dataset.act;
    if (act === 'profile') {
      const url = 'employee-profile.html?id=' + encodeURIComponent(emp._id);
      if (typeof window.navigatePage === 'function') window.navigatePage(url); else window.location.href = url;
      return;
    }
    openQuickAction(act, emp, {
      db, me: state.me, wallets: state.wallets, monthKey: monthKey(),
    });
  });
}

// ── bounded data listeners (RULE G3) ────────────────────────────────
function startListeners() {
  onSnapshot(query(collection(db, 'employees'), limit(500)), snap => {
    state.employees = snap.docs.map(d => ({ ...d.data(), _id: d.id }));
    render();
  });
  // حضور آخر شهرين (يغطي اليوم + لازم لحساب KPI واتجاهه). G3: bounded.
  onSnapshot(query(collection(db, 'attendance'), where('monthKey', 'in', [monthKey(), prevMonthKey()]), limit(3000)), snap => {
    state.attMonth = snap.docs.map(d => ({ ...d.data(), _id: d.id }));
    state.attToday = state.attMonth.filter(a => a.date === todayStr());
    if (state.employees.length) render();
  });
  // إخفاقات آخر شهرين (للحُكم + الاتجاه). G3: bounded.
  onSnapshot(query(collection(db, 'employee_incidents'), where('monthKey', 'in', [monthKey(), prevMonthKey()]), limit(1500)), snap => {
    state.incidents = snap.docs.map(d => ({ ...d.data(), _id: d.id }));
    if (state.employees.length) render();
  });
  onSnapshot(query(collection(db, 'tasks'), where('status', '==', 'pending'), limit(2000)), snap => {
    state.tasks = snap.docs.map(d => ({ ...d.data(), _id: d.id }));
    if (state.employees.length) render();
  });
  // المهام المكتملة (لحساب «أنجز اليوم»). G3: bounded.
  onSnapshot(query(collection(db, 'tasks'), where('status', '==', 'done'), limit(1500)), snap => {
    state.tasksDone = snap.docs.map(d => ({ ...d.data(), _id: d.id }));
    if (state.employees.length) render();
  });
  // أحدث الأوردرات — لـ «شغّال على إيه» و«أنجز اليوم» (timeline). G3: bounded.
  onSnapshot(query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(1500)), snap => {
    state.orders = snap.docs.map(d => ({ ...d.data(), _id: d.id }));
    if (state.employees.length) render();
  });
  // أهداف الموظفين الشهرية — تدخل في حساب KPI. G3: bounded.
  onSnapshot(query(collection(db, 'employee_goals'), limit(2000)), snap => {
    state.goals = snap.docs.map(d => ({ ...d.data(), _id: d.id }));
    if (state.employees.length) render();
  });
  // wallets for the finance quick-action (read-only — RULE 4)
  if (state.caps.finance) {
    onSnapshot(query(collection(db, 'wallets'), limit(100)), snap => {
      state.wallets = snap.docs.map(d => ({ ...d.data(), _id: d.id }));
    });
  }
}

// ── boot ─────────────────────────────────────────────────────────────
export function initEmployeeControl() {
  onAuthStateChanged(auth, async (u) => {
    if (!u) { window.location.href = 'login.html'; return; }
    state.me = { uid: u.uid, name: u.displayName || '' };
    let role = '', perms = {};
    try {
      const ud = await getDoc(doc(db, 'users', u.uid));
      const d = ud.exists() ? ud.data() : {};
      role = d.role || '';
      perms = d.permissions || {};
      state.me.name = d.name || d.displayName || state.me.name || u.email || 'مستخدم';
    } catch (_) { /* ignore */ }
    state.role = role;

    // sidebar chrome (legacy nav — single source via sidebar-config.js)
    try {
      if (window.B2CSidebar?.build) window.B2CSidebar.build({ role, permissions: perms }, 'employee-control.html');
    } catch (_) { /* ignore */ }
    const navName = document.getElementById('nav-name'); if (navName) navName.textContent = state.me.name;
    const navAv = document.getElementById('nav-av'); if (navAv) navAv.textContent = (state.me.name || 'U').slice(0, 1);
    const roleBadge = document.getElementById('role-badge'); if (roleBadge) roleBadge.textContent = role || 'ERP';

    // capability gate (PC2 / P1) — page is for employee managers only
    if (!canDo('manage_employees', role, perms)) {
      notice('🚫 ليس لديك صلاحية إدارة الموظفين.');
      return;
    }
    // feature flag (E1.8/E1.9) — enabled by default, instant kill switch retained
    if (!isFeatureEnabled('employeeControl', true)) {
      notice('⏸️ لوحة تحكم الموظفين معطّلة عبر flag.<br>لإعادة التفعيل: احذف <code>feat.employeeControl=0</code> من الرابط/الـ localStorage ثم أعد التحميل.');
      return;
    }

    state.caps = {
      manageEmployees: true,
      finance: canDo('manage_payments', role, perms),
      perms: canDo('system_settings', role, perms), // role/account control — admin only by default
    };

    wireActions();
    startListeners();
  });
}
