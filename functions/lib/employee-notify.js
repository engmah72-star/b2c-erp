// ════════════════════════════════════════════════════════════════════
// functions/lib/employee-notify.js
// Pure decision helpers for employee self-notifications (incidents +
// financial penalties/bonuses). No Firestore, no admin SDK — testable in
// isolation (RULE G8). The triggers in index.js resolve the target uid and
// call createInAppNotification; the WHAT-to-send logic lives here.
// ════════════════════════════════════════════════════════════════════

const INCIDENT_TYPE_LABELS = {
  design_rejected:    'تصميم مرفوض',
  order_late:         'أوردر متأخر',
  customer_complaint: 'شكوى عميل',
  attendance:         'مخالفة حضور',
  quality:            'مشكلة جودة',
  other:              'ملاحظة',
};

// Build the in-app notification payload for an incident doc → or null.
function buildIncidentNotification(inc) {
  if (!inc) return null;
  const typeLbl = INCIDENT_TYPE_LABELS[inc.type] || 'ملاحظة';
  return {
    title: '📋 ملاحظة على أدائك',
    desc:  `${typeLbl}${inc.title ? ' — ' + inc.title : ''}. راجع بروفايلك للتفاصيل.`,
    ico:   '📋',
    link:  'my-profile.html',
    type:  'incident',
  };
}

// Build payload for a financial_ledger entry IF it is an employee
// penalty/bonus, otherwise null (so salary/other events are ignored).
function buildLedgerNotification(entry) {
  if (!entry || !entry.employeeId) return null;
  const evt = entry.eventType;
  if (evt !== 'PENALTY' && evt !== 'BONUS_PAYMENT') return null;
  const amount = Number(entry.amount || 0).toLocaleString('ar-EG');
  const isPenalty = evt === 'PENALTY';
  return {
    title: isPenalty ? '✂️ خصم على راتبك' : '🎁 مكافأة',
    desc:  isPenalty
      ? `تم تسجيل خصم بقيمة ${amount} ج. راجع بروفايلك للتفاصيل.`
      : `تهانينا! تم تسجيل مكافأة بقيمة ${amount} ج.`,
    ico:   isPenalty ? '✂️' : '🎁',
    link:  'my-profile.html',
    type:  isPenalty ? 'penalty' : 'bonus',
  };
}

module.exports = { INCIDENT_TYPE_LABELS, buildIncidentNotification, buildLedgerNotification };
