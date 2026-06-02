// ════════════════════════════════════════════════════════════════════════
// render-hr-board.js — لوحة الموارد البشرية اليومية (HR Daily Board)
// ════════════════════════════════════════════════════════════════════════
// عرض موحّد لكل موظف من مكان واحد: حضوره اللحظي · شغّال على إيه دلوقتي ·
// أنجز إيه (في الفترة المختارة) · درجة أدائه (KPI).
//
// View-only: كل المنطق هنا حسابي للقراءة فقط — لا أي كتابة (متوافق مع L1/H1.1).
// الدالة pure تستقبل البيانات + الـ helpers عبر ctx وتُرجِع HTML string.
// ════════════════════════════════════════════════════════════════════════

const ACTIVE_STAGES = ['design', 'printing', 'production', 'shipping'];
// مالك المرحلة الحالية (مين «شغّال عليه دلوقتي»)
const STAGE_FIELD = {
  design: 'designerId',
  printing: 'printerId',
  production: 'productionAgent',
  shipping: 'shippingOfficerId',
};
const STAGE_LABEL = {
  design: 'تصميم', printing: 'طباعة', production: 'تنفيذ', shipping: 'شحن',
};

// ── تطبيع الأرقام العربية → لاتينية ──
const AR_DIGITS = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9' };
function normDigits(s) { return String(s).replace(/[٠-٩]/g, d => AR_DIGITS[d]); }

// ── تاريخ الـ timeline → ms (يتعامل مع ISO و "YYYY-MM-DD HH:mm" و ar-EG) ──
export function tlDateMs(s) {
  if (!s) return 0;
  const str = normDigits(s).replace(/[‎‏]/g, '').trim();
  let ms = Date.parse(str);
  if (!isNaN(ms)) return ms;
  ms = Date.parse(str.replace(' ', 'T'));
  if (!isNaN(ms)) return ms;
  const m = str.match(/(\d{1,4})\/(\d{1,2})\/(\d{1,4})/);
  if (m) {
    let a = +m[1], b = +m[2], c = +m[3], day, mon, year;
    if (a > 31) { year = a; mon = b; day = c; } else { day = a; mon = b; year = c; }
    const d = new Date(year, mon - 1, day);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return 0;
}

// ── حدود الفترة بالـ ms حسب periodFilter ──
function periodWindow(periodFilter) {
  const now = new Date();
  const startToday = new Date(now); startToday.setHours(0, 0, 0, 0);
  if (periodFilter === 'today') return { from: startToday.getTime(), to: Infinity, lbl: 'اليوم' };
  if (periodFilter === 'week') {
    const d = new Date(startToday); d.setDate(d.getDate() - 6);
    return { from: d.getTime(), to: Infinity, lbl: 'الأسبوع' };
  }
  if (periodFilter === 'month_prev') {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    const to = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return { from, to, lbl: 'الشهر الماضي' };
  }
  if (periodFilter === 'all') return { from: 0, to: Infinity, lbl: 'الكل' };
  // month_cur (default)
  return { from: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), to: Infinity, lbl: 'الشهر' };
}

const tsMs = ts => (ts && ts.toDate) ? ts.toDate().getTime() : 0;

function kpiColor(score) {
  if (score >= 85) return 'var(--g)';
  if (score >= 70) return 'var(--b-bright)';
  if (score >= 50) return 'var(--y)';
  return 'var(--r)';
}

function orderCode(o) {
  return o.code || o.orderCode || o.serial || o.ref || ('#' + String(o._id || '').slice(-5));
}

// ════════════════════════════════════════════════════════════════════════
// البناء الرئيسي
// ════════════════════════════════════════════════════════════════════════
export function buildHrBoardHTML(ctx) {
  const {
    employees = [], allOrders = [], attendanceRecords = [], tasks = [],
    periodFilter = 'today', todayStr, curMonthKey,
    calcKpiBreakdown, ROLES = {}, fn = (n => n), escAttr = (s => s), nameToColor = (() => 'var(--b)'),
    query = '', roleFilter = '',
  } = ctx;

  const win = periodWindow(periodFilter);
  const today = todayStr();
  const mKey = curMonthKey();
  const q = (query || '').trim().toLowerCase();

  // فهرس حضور اليوم
  const todayAtt = attendanceRecords.filter(a => a.date === today);
  const attFor = (uid, empId) => todayAtt.find(a => a.employeeUid === uid || a.employeeId === empId || a.employeeUid === empId || a.employeeId === uid);

  // الموظفون المعروضون (نشطون + فلاتر البحث/الدور)
  let rows = employees.filter(e => (e.status || 'active') === 'active');
  if (roleFilter) rows = rows.filter(e => e.role === roleFilter);
  if (q) rows = rows.filter(e => (e.name || '').toLowerCase().includes(q) || (e.phone || '').includes(q));

  // حساب بيانات كل موظف
  const data = rows.map(e => {
    const uid = e.authUid || e._id;
    const empId = e._id;

    // 1) الحضور
    const att = attFor(uid, empId);
    let attState = 'absent'; // absent | working | done
    if (att) attState = att.checkOut ? 'done' : 'working';
    const lateMins = att ? (parseInt(att.lateMinutes) || 0) : 0;

    // 2) شغّال عليه دلوقتي — مالك المرحلة الحالية
    const working = allOrders.filter(o => {
      const f = STAGE_FIELD[o.stage]; if (!f) return false;
      const owner = o[f]; return owner && (owner === uid || owner === empId);
    });

    // 3) أنجز خلال الفترة — تحويلات مرحلية من الـ timeline + مهام مكتملة
    let stagesDone = 0;
    allOrders.forEach(o => {
      (o.timeline || []).forEach(t => {
        const mine = t.byId === uid || t.byId === empId || (t.by && t.by === e.name);
        if (!mine) return;
        const isTransition = !!t.stage || (t.action && /مرحلة|انتقل|→/.test(t.action));
        if (!isTransition) return;
        const ms = tlDateMs(t.date || t.at);
        if (ms >= win.from && ms < win.to) stagesDone++;
      });
    });
    const tasksDone = tasks.filter(tk => {
      if (tk.status !== 'done') return false;
      if (!(tk.assignedTo === uid || tk.assignedTo === empId)) return false;
      const ms = tsMs(tk.updatedAt) || tsMs(tk.createdAt);
      return ms >= win.from && ms < win.to;
    }).length;

    // 4) KPI (درجة الشهر)
    const kb = calcKpiBreakdown ? calcKpiBreakdown(e, uid, mKey) : { total: 0 };
    const score = kb.total || 0;

    return { e, uid, empId, att, attState, lateMins, working, stagesDone, tasksDone, score };
  });

  // ترتيب: الحاضرون أولاً، ثم الأكثر إنجازاً، ثم الأعلى ضغطاً
  const order = { working: 0, done: 1, absent: 2 };
  data.sort((a, b) =>
    (order[a.attState] - order[b.attState]) ||
    ((b.stagesDone + b.tasksDone) - (a.stagesDone + a.tasksDone)) ||
    (b.working.length - a.working.length)
  );

  // ── ملخص علوي ──
  const presentNow = data.filter(d => d.attState === 'working').length;
  const lateCount = data.filter(d => d.att && d.lateMins > 0).length;
  const absentCount = data.filter(d => d.attState === 'absent').length;
  const wipTotal = allOrders.filter(o => ACTIVE_STAGES.includes(o.stage)).length;
  const accomplished = data.reduce((s, d) => s + d.stagesDone + d.tasksDone, 0);

  const summary = `
    <div class="hrb-summary">
      <div class="hrb-stat" style="--hc:var(--g)"><div class="hrb-stat-v">${presentNow}</div><div class="hrb-stat-l">⚡ يعمل الآن</div></div>
      <div class="hrb-stat" style="--hc:var(--y)"><div class="hrb-stat-v">${lateCount}</div><div class="hrb-stat-l">⏰ متأخر</div></div>
      <div class="hrb-stat" style="--hc:var(--r)"><div class="hrb-stat-v">${absentCount}</div><div class="hrb-stat-l">💤 لم يحضر</div></div>
      <div class="hrb-stat" style="--hc:var(--b-bright)"><div class="hrb-stat-v">${wipTotal}</div><div class="hrb-stat-l">🔧 قيد التنفيذ</div></div>
      <div class="hrb-stat" style="--hc:var(--p)"><div class="hrb-stat-v">${accomplished}</div><div class="hrb-stat-l">✅ أُنجز ${win.lbl}</div></div>
    </div>`;

  if (!data.length) {
    return summary + `<div class="empty"><div class="empty-icon">👥</div><div class="empty-text">لا يوجد موظفون مطابقون</div></div>`;
  }

  // ── بطاقات الموظفين ──
  const cards = data.map(d => {
    const { e, att, attState, lateMins, working, stagesDone, tasksDone, score } = d;
    const role = ROLES[e.role] || { label: e.role || '—', col: 'var(--dim2)', ico: '👤' };
    const sCol = kpiColor(score);
    const initial = ((e.name || '؟')[0] || '؟').toUpperCase();

    // شريحة الحضور
    let attChip;
    if (attState === 'working') {
      attChip = `<span class="hrb-att working">🟢 يعمل${att.checkInStr ? ' · ' + escAttr(att.checkInStr) : ''}${lateMins > 0 ? ` · متأخر ${lateMins}د` : ''}</span>`;
    } else if (attState === 'done') {
      attChip = `<span class="hrb-att done">✔ انصرف${att.checkOutStr ? ' · ' + escAttr(att.checkOutStr) : ''}</span>`;
    } else {
      attChip = `<span class="hrb-att absent">💤 لم يحضر</span>`;
    }

    // شغّال عليه — أهم 5
    const workChips = working.slice(0, 5).map(o =>
      `<a class="hrb-ochip" href="order.html?id=${escAttr(o._id)}" title="${escAttr(o.clientName || '')}">
         <span class="hrb-ochip-stage">${STAGE_LABEL[o.stage] || ''}</span>${escAttr(orderCode(o))}
       </a>`).join('');
    const moreWork = working.length > 5 ? `<span class="hrb-more">+${working.length - 5}</span>` : '';

    const workSection = working.length
      ? `<div class="hrb-sec">
           <div class="hrb-sec-lbl">🔧 شغّال على <b>${working.length}</b></div>
           <div class="hrb-chips">${workChips}${moreWork}</div>
         </div>`
      : `<div class="hrb-sec hrb-idle">🔧 لا أوردرات على مكتبه الآن</div>`;

    const doneSection = `<div class="hrb-sec">
        <div class="hrb-sec-lbl">✅ أنجز ${win.lbl}</div>
        <div class="hrb-done-row">
          <span class="hrb-pill">🔄 ${stagesDone} مرحلة</span>
          <span class="hrb-pill">📋 ${tasksDone} مهمة</span>
        </div>
      </div>`;

    return `
      <div class="hrb-card hrb-${attState}">
        <div class="hrb-card-head">
          <div class="hrb-av" style="background:${nameToColor(e.name || '')}">${escAttr(initial)}</div>
          <div class="hrb-id">
            <a class="hrb-name" href="employee-profile.html?id=${escAttr(e._id)}">${escAttr(e.name || '—')}</a>
            <div class="hrb-role" style="color:${role.col}">${role.ico} ${escAttr(role.label)}</div>
          </div>
          <div class="hrb-kpi" style="--kc:${sCol}" title="درجة أداء الشهر">${score}<span>/100</span></div>
        </div>
        <div class="hrb-att-row">${attChip}</div>
        ${workSection}
        ${doneSection}
      </div>`;
  }).join('');

  return summary + `<div class="hrb-grid">${cards}</div>`;
}
