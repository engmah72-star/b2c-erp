// core/employee-timeline.js
//
// ━━━ Employee Unified Timeline — مُجمِّع نقي (البند 2 من الخطة المركزية) ━━━
//
// مصدر العرض الوحيد لـ «ماذا دار بيني وبين هذا الموظف؟»: يجمّع زمنياً الأحداث
// الموجودة أصلاً في collections منفصلة (إخفاقات/تظلّمات · إجازات · أذونات حضور ·
// مدفوعات · تقييمات · مهام) في سلسلة واحدة مرتّبة — على غرار `getOrderDates()`
// للأوردر (RULE 1): دالة اشتقاق نقية، **بلا كتابة ولا DOM ولا حساب أرصدة**.
//
// كل حدث: { ts, kind, ico, title, sub, tone, dir }
//   ts   — ميلي-ثانية للترتيب (0 = غير معروف، يُستبعد)
//   tone — 'pos' | 'neg' | 'warn' | 'neutral'  (لون الحدث)
//   dir  — 'in' (موظف→إدارة) | 'out' (إدارة→موظف)

const LEAVE_LBL = {
  annual: 'سنوية', sick: 'مرضية', emergency: 'طارئة',
  official: 'رسمية', unpaid: 'بدون راتب',
};
const PERM_LBL = {
  late_in: 'تأخير صباحي', mission: 'مأمورية', remote: 'عمل عن بُعد',
  partial: 'إذن جزئي', break_extension: 'تمديد راحة',
};
const PAY_LBL = {
  salary: 'مرتب', advance: 'سلفة', bonus: 'مكافأة',
  deduction: 'خصم', other: 'مبلغ',
};

// يحوّل أي صيغة وقت (Timestamp · Date · seconds · ISO · 'YYYY-MM-DD') إلى ms.
export function toMs(v) {
  if (!v) return 0;
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
  if (typeof v === 'object') {
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (typeof v.seconds === 'number') return v.seconds * 1000;
    if (v instanceof Date) return v.getTime();
  }
  if (typeof v === 'string') {
    const t = Date.parse(v);
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

const num = n => (parseFloat(n) || 0).toLocaleString('ar-EG');

/**
 * يبني السلسلة الزمنية الموحّدة للموظف (مرتّبة تنازلياً: الأحدث أولاً).
 *
 * @param {Object} src — مصفوفات مُحمَّلة أصلاً في بروفايل الموظف
 * @param {Array} [src.incidents]    employee_incidents (+ appeal)
 * @param {Array} [src.leaves]       employee_leaves
 * @param {Array} [src.permissions]  attendance_permissions
 * @param {Array} [src.payments]     employee_payments
 * @param {Array} [src.evaluations]  employee_evaluations
 * @param {Array} [src.tasks]        tasks
 * @returns {Array<{ts,kind,ico,title,sub,tone,dir}>}
 */
export function buildEmployeeTimeline({
  incidents = [], leaves = [], permissions = [],
  payments = [], evaluations = [], tasks = [],
} = {}) {
  const ev = [];
  const push = (ts, e) => { if (ts > 0) ev.push({ ts, ...e }); };

  // ── إخفاقات + تظلّمات ──
  for (const i of incidents) {
    const created = toMs(i.createdAt) || toMs(i.date);
    push(created, {
      kind: 'incident', ico: '⚠️', dir: 'out', tone: 'neg',
      title: 'إخفاق: ' + (i.title || i.reasonLabel || 'ملاحظة'),
      sub: i.severity === 'high' ? 'خطورة عالية' : (i.description || ''),
    });
    const ap = i.appeal;
    if (ap) {
      push(toMs(ap.submittedAt) || created, {
        kind: 'appeal', ico: '⚖️', dir: 'in', tone: 'warn',
        title: 'تظلّم من الموظف على الإخفاق',
        sub: ap.reason || '',
      });
      if (ap.status === 'accepted' || ap.status === 'rejected') {
        push(toMs(ap.decidedAt) || created, {
          kind: 'appeal_decision', dir: 'out',
          ico: ap.status === 'accepted' ? '✅' : '🚫',
          tone: ap.status === 'accepted' ? 'pos' : 'neg',
          title: 'قرار التظلّم: ' + (ap.status === 'accepted' ? 'قبول (أُلغي الأثر)' : 'رفض'),
          sub: ap.decisionNote || '',
        });
      }
    }
  }

  // ── إجازات ──
  for (const l of leaves) {
    const req = toMs(l.createdAt) || toMs(l.startDate);
    const lbl = LEAVE_LBL[l.type] || l.type || 'إجازة';
    push(req, {
      kind: 'leave', ico: '🌴', dir: 'in', tone: 'neutral',
      title: `طلب إجازة ${lbl} (${num(l.days)} يوم)`,
      sub: [l.startDate, l.reason].filter(Boolean).join(' · '),
    });
    if (l.status === 'approved' || l.status === 'rejected') {
      push(toMs(l.decidedAt) || req, {
        kind: 'leave_decision', dir: 'out',
        ico: l.status === 'approved' ? '✅' : '🚫',
        tone: l.status === 'approved' ? 'pos' : 'neg',
        title: 'قرار الإجازة: ' + (l.status === 'approved' ? 'موافقة' : 'رفض'),
        sub: l.decisionNote || '',
      });
    }
  }

  // ── أذونات حضور ──
  for (const p of permissions) {
    const req = toMs(p.createdAt) || toMs(p.date);
    const lbl = PERM_LBL[p.type] || p.type || 'إذن';
    push(req, {
      kind: 'permission', ico: '🕒', dir: 'in', tone: 'neutral',
      title: `طلب إذن: ${lbl}`,
      sub: [p.date, p.reason].filter(Boolean).join(' · '),
    });
    if (p.status === 'approved' || p.status === 'rejected') {
      push(toMs(p.decidedAt) || req, {
        kind: 'permission_decision', dir: 'out',
        ico: p.status === 'approved' ? '✅' : '🚫',
        tone: p.status === 'approved' ? 'pos' : 'neg',
        title: 'قرار الإذن: ' + (p.status === 'approved' ? 'اعتماد' : 'رفض'),
        sub: '',
      });
    }
  }

  // ── مدفوعات الرواتب/المكافآت/الخصومات ──
  for (const pay of payments) {
    const isDed = pay.isDeduction || pay.salaryType === 'deduction';
    const lbl = isDed ? 'خصم' : (PAY_LBL[pay.salaryType] || PAY_LBL.salary);
    push(toMs(pay.createdAt) || toMs((pay.month || '') + '-01'), {
      kind: 'payment', ico: isDed ? '➖' : '💰', dir: 'out',
      tone: isDed ? 'neg' : 'pos',
      title: `${lbl}: ${num(pay.amount)} ج${pay.month ? ' (' + pay.month + ')' : ''}`,
      sub: pay.note || '',
    });
  }

  // ── تقييمات شهرية ──
  for (const e of evaluations) {
    push(toMs(e.evaluatedAt) || toMs((e.month || '') + '-01'), {
      kind: 'evaluation', ico: '⭐', dir: 'out', tone: 'neutral',
      title: `تقييم${e.month ? ' (' + e.month + ')' : ''}${e.score != null ? ' — ' + e.score : ''}`,
      sub: e.notes || e.feedback || '',
    });
  }

  // ── مهام مُكلَّفة ──
  for (const t of tasks) {
    push(toMs(t.createdAt), {
      kind: 'task', ico: '📋', dir: 'out',
      tone: t.status === 'done' ? 'pos' : 'neutral',
      title: 'مهمة: ' + (t.title || '—') + (t.status === 'done' ? ' (مكتملة)' : ''),
      sub: t.priority === 'urgent' ? 'عاجلة' : (t.dueDate ? 'حتى ' + t.dueDate : ''),
    });
  }

  return ev.sort((a, b) => b.ts - a.ts);
}
