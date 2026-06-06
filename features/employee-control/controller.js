// ════════════════════════════════════════════════════════════════════
// features/employee-control/controller.js
// Orchestrates the Employee Control Center:
//   auth gate → capability gate → feature flag → bounded data load →
//   metric computation → render → event delegation → central actions.
// Reads only (onSnapshot/getDoc). All writes go through employee-actions.js.
// ════════════════════════════════════════════════════════════════════

import { auth, db } from '../../core/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { collection, doc, getDoc, onSnapshot, query, where, limit } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { canDo } from '../../core/permissions-matrix.js';
import { isFeatureEnabled } from '../../core/feature-flags.js';
import { renderKpiBar, renderGroups } from './render.js';
import { openQuickAction } from './quick-actions.js';
import { buildAttendanceSectionHTML } from './attendance-section.js';
import { employeeActions } from '../../employee-actions.js';

const todayStr = () => new Date().toISOString().slice(0, 10);
const monthKey = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };

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
  employees: [], attToday: [], incidents: [], tasks: [], wallets: [],
  leaves: [], permsToday: [],
  filter: { q: '', status: 'all', flagged: false },
};

function notice(html) {
  const root = document.getElementById('ec-root');
  if (root) root.innerHTML = `<div class="ec-notice">${html}</div>`;
}

// ── per-employee operational metrics ────────────────────────────────
function metricsFor() {
  const today = todayStr();
  const m = new Map();
  state.employees.forEach(e => {
    const uid = e.authUid || e._id;
    const present = state.attToday.some(a => (a.employeeUid === uid || a.employeeId === e._id) && a.checkIn);
    const myTasks = state.tasks.filter(t => t.assignedTo === uid || t.assignedTo === e._id);
    const lateTasks = myTasks.filter(t => t.dueDate && t.dueDate < today).length;
    const incidents = state.incidents.filter(i => i.employeeId === e._id).length;
    m.set(e._id, { present, openTasks: myTasks.length, lateTasks, incidents });
  });
  return m;
}

function render() {
  const root = document.getElementById('ec-root');
  if (!root) return;
  const metrics = metricsFor();
  const active = state.employees.filter(e => (e.status || 'active') === 'active');
  const presentCount = state.employees.filter(e => metrics.get(e._id)?.present).length;
  const kpis = {
    total: state.employees.length,
    active: active.length,
    presentToday: presentCount,
    incidents: state.incidents.length,
    openTasks: state.tasks.length,
    disabled: state.employees.length - active.length,
  };
  // self attendance: resolve the logged-in user's own employee record + today's row
  const myEmp = state.employees.find(e => e.authUid === state.me.uid) || null;
  const myUid = myEmp ? (myEmp.authUid || myEmp._id) : state.me.uid;
  const myRecord = state.attToday.find(a => a.employeeUid === myUid || (myEmp && a.employeeId === myEmp._id)) || null;

  root.innerHTML =
    renderKpiBar(kpis) +
    buildAttendanceSectionHTML({
      myEmp, myRecord,
      employees: state.employees, attToday: state.attToday,
      leaves: state.leaves, permsToday: state.permsToday,
      canManage: state.caps.manageEmployees,
    }) +
    `<div class="ec-filters">
      <input class="inp ec-search" id="ec-q" placeholder="🔍 ابحث بالاسم أو الهاتف" value="${state.filter.q.replace(/"/g, '&quot;')}">
      <select class="inp ec-fstatus" id="ec-status">
        <option value="all"${state.filter.status === 'all' ? ' selected' : ''}>كل الحالات</option>
        <option value="active"${state.filter.status === 'active' ? ' selected' : ''}>نشط فقط</option>
        <option value="inactive"${state.filter.status === 'inactive' ? ' selected' : ''}>معطّل فقط</option>
      </select>
      <button type="button" class="btn btn-sm ${state.filter.flagged ? 'btn-r' : 'btn-ghost'}" id="ec-flagged">🚩 يحتاج انتباه</button>
    </div>
    <div id="ec-groups">${renderGroups({ employees: state.employees, metrics, caps: state.caps, filter: state.filter })}</div>`;

  wireFilters();
}

function reRenderGroups() {
  const el = document.getElementById('ec-groups');
  if (el) el.innerHTML = renderGroups({ employees: state.employees, metrics: metricsFor(), caps: state.caps, filter: state.filter });
}

function wireFilters() {
  const q = document.getElementById('ec-q');
  if (q) q.addEventListener('input', () => { state.filter.q = q.value; reRenderGroups(); });
  const st = document.getElementById('ec-status');
  if (st) st.addEventListener('change', () => { state.filter.status = st.value; reRenderGroups(); });
  const fl = document.getElementById('ec-flagged');
  if (fl) fl.addEventListener('click', () => { state.filter.flagged = !state.filter.flagged; render(); });
}

// ── event delegation for quick actions (one listener) ───────────────
let __punchBusy = false;
async function selfPunch(kind) {
  if (__punchBusy) return;
  const myEmp = state.employees.find(e => e.authUid === state.me.uid);
  if (!myEmp) return window.__ecToast('لا يوجد ملف موظف مرتبط بحسابك', 'err');
  const today = todayStr();
  __punchBusy = true;
  try {
    let r;
    if (kind === 'in') {
      r = await employeeActions.recordAttendanceCheckIn({
        db, employeeId: myEmp._id, employeeUid: state.me.uid, employeeName: state.me.name,
        date: today, monthKey: monthKey(),
        expectedStart: myEmp.workSchedule?.startTime || '', graceMinutes: 15, source: 'self',
        recordedBy: state.me.uid, recordedByName: state.me.name,
      });
      window.__ecToast(r.ok ? (r.lateMinutes > 0 ? `⚠️ حضور متأخر ${r.lateMinutes}د` : '✅ تم تسجيل حضورك') : ('❌ ' + (r.errors || []).join(' · ')), r.ok ? 'ok' : 'err');
    } else {
      r = await employeeActions.recordAttendanceCheckOut({ db, employeeUid: state.me.uid, employeeId: myEmp._id, date: today });
      window.__ecToast(r.ok ? '✅ تم تسجيل انصرافك' : ('❌ ' + (r.errors || []).join(' · ')), r.ok ? 'ok' : 'err');
    }
  } catch (e) {
    window.__ecToast('❌ ' + (e?.message || 'تعذّر التسجيل'), 'err');
  } finally {
    __punchBusy = false;
  }
}

// manager board actions (record-for-absent · set hours · approve overtime ·
// approve/reject pending permissions) — all via central actions (A1/H1.1).
let __boardBusy = false;
async function handleBoardAction(el) {
  const act = el.dataset.act;
  const today = todayStr();
  if (act === 'board-hours') {
    const emp = state.employees.find(x => x._id === el.dataset.emp);
    if (emp) openQuickAction('schedule', emp, { db, me: state.me, wallets: state.wallets, monthKey: monthKey() });
    return;
  }
  if (__boardBusy) return;
  __boardBusy = true; el.disabled = true;
  try {
    let r;
    if (act === 'board-checkin') {
      r = await employeeActions.recordAttendanceCheckIn({
        db, employeeId: el.dataset.emp, employeeUid: el.dataset.uid, employeeName: el.dataset.name,
        date: today, monthKey: monthKey(),
        expectedStart: el.dataset.start || '', graceMinutes: 15, source: 'central',
        recordedBy: state.me.uid, recordedByName: state.me.name,
      });
      window.__ecToast(r.ok ? (r.lateMinutes > 0 ? `⚠️ حضور متأخر ${r.lateMinutes}د` : '✅ تم تسجيل الحضور') : ('❌ ' + (r.errors || []).join(' · ')), r.ok ? 'ok' : 'err');
    } else if (act === 'board-overtime-ok') {
      r = await employeeActions.approveAttendanceOvertime({
        db, employeeUid: el.dataset.uid, employeeId: el.dataset.emp, date: today,
        approvedBy: state.me.uid, approvedByName: state.me.name,
      });
      window.__ecToast(r.ok ? '✅ تم اعتماد الأوفر تايم' : ('❌ ' + (r.errors || []).join(' · ')), r.ok ? 'ok' : 'err');
    } else if (act === 'board-approve' || act === 'board-reject') {
      r = await employeeActions.decideAttendancePermission({
        db, permissionId: el.dataset.perm, decision: act === 'board-approve' ? 'approved' : 'rejected',
        decidedBy: state.me.uid, decidedByName: state.me.name,
      });
      window.__ecToast(r.ok ? (act === 'board-approve' ? '✅ تم الاعتماد' : '🚫 تم الرفض') : ('❌ ' + (r.errors || []).join(' · ')), r.ok ? 'ok' : 'err');
    }
    if (r && r.ok === false) el.disabled = false;
  } catch (e) {
    window.__ecToast('❌ ' + (e?.message || 'تعذّر التنفيذ'), 'err'); el.disabled = false;
  } finally {
    __boardBusy = false;
  }
}

function wireActions() {
  document.getElementById('ec-root').addEventListener('click', (e) => {
    const board = e.target.closest('[data-act^="board-"]');
    if (board) { handleBoardAction(board); return; }
    const punch = e.target.closest('[data-att]');
    if (punch) { selfPunch(punch.dataset.att); return; }
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
  onSnapshot(query(collection(db, 'attendance'), where('date', '==', todayStr()), limit(800)), snap => {
    state.attToday = snap.docs.map(d => ({ ...d.data(), _id: d.id }));
    if (state.employees.length) render();
  });
  onSnapshot(query(collection(db, 'employee_incidents'), where('monthKey', '==', monthKey()), limit(1000)), snap => {
    state.incidents = snap.docs.map(d => ({ ...d.data(), _id: d.id }));
    if (state.employees.length) render();
  });
  // attendance permissions (today) + leaves — for the accurate day-status summary
  onSnapshot(query(collection(db, 'attendance_permissions'), where('date', '==', todayStr()), limit(800)), snap => {
    state.permsToday = snap.docs.map(d => ({ ...d.data(), _id: d.id }));
    if (state.employees.length) render();
  });
  onSnapshot(query(collection(db, 'employee_leaves'), limit(2000)), snap => {
    state.leaves = snap.docs.map(d => ({ ...d.data(), _id: d.id }));
    if (state.employees.length) render();
  });
  onSnapshot(query(collection(db, 'tasks'), where('status', '==', 'pending'), limit(2000)), snap => {
    state.tasks = snap.docs.map(d => ({ ...d.data(), _id: d.id }));
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
