/**
 * core/employee-stage-performance.js — أداء الموظفين على مراحل الأوردر (pure).
 *
 * يربط تقييم الموظف بمدد المراحل والالتزام بالـ SLA، مشتقاً من المرجع الواحد
 * getStageResponsibilities (يُمرَّر كدالة — dependency injection — فالموديول pure
 * وقابل للاختبار بدون Firebase، نفس نمط buildStagePerformanceStats في التقارير).
 *
 * المنطق: لكل أوردر، نأخذ صفوف المراحل المكتملة (status==='done') التي لها مسؤول،
 * ونجمّعها حسب الموظف المسؤول → عدد + متوسط مدة + التزام بالموعد (rating!=='late').
 */

const STAGE_KEYS = ['design', 'printing', 'production', 'shipping'];

/**
 * @param {Array}    orders        — قائمة أوردرات
 * @param {Function} getStageRows  — (order) => صفوف getStageResponsibilities
 * @returns {Array<{
 *   employeeId, employeeName,
 *   stages: { [stage]: { count, avgMs, onTime, late, onTimePct } },
 *   totalCount, avgMs, onTime, late, onTimePct
 * }>}  مرتّبة تنازلياً حسب عدد المراحل.
 */
export function buildEmployeeStagePerformance(orders = [], getStageRows) {
  if (typeof getStageRows !== 'function' || !Array.isArray(orders)) return [];

  const agg = new Map();
  const ensure = (id, name) => {
    let e = agg.get(id);
    if (!e) { e = { employeeId: id, employeeName: name || id, stages: {}, totalCount: 0, totalMs: 0, onTime: 0, late: 0 }; agg.set(id, e); }
    if (name && (!e.employeeName || e.employeeName === id)) e.employeeName = name;
    return e;
  };

  for (const order of orders) {
    let rows;
    try { rows = getStageRows(order) || []; } catch { rows = []; }
    for (const r of rows) {
      if (!r || r.kind !== 'stage' || !r.responsibleId || r.status !== 'done') continue;
      const e = ensure(r.responsibleId, r.responsibleName);
      const st = e.stages[r.stage] || (e.stages[r.stage] = { count: 0, totalMs: 0, onTime: 0, late: 0 });
      const onTime = r.rating !== 'late';
      const ms = r.durationMs || 0;
      st.count++; st.totalMs += ms; st[onTime ? 'onTime' : 'late']++;
      e.totalCount++; e.totalMs += ms; e[onTime ? 'onTime' : 'late']++;
    }
  }

  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  return [...agg.values()].map(e => {
    const stages = {};
    for (const k of STAGE_KEYS) {
      const s = e.stages[k];
      if (s) stages[k] = {
        count: s.count,
        avgMs: s.count ? Math.round(s.totalMs / s.count) : 0,
        onTime: s.onTime, late: s.late,
        onTimePct: pct(s.onTime, s.count),
      };
    }
    return {
      employeeId: e.employeeId, employeeName: e.employeeName,
      stages,
      totalCount: e.totalCount,
      avgMs: e.totalCount ? Math.round(e.totalMs / e.totalCount) : 0,
      onTime: e.onTime, late: e.late,
      onTimePct: pct(e.onTime, e.totalCount),
    };
  }).sort((a, b) => b.totalCount - a.totalCount);
}
