/**
 * Business2Card ERP — clients-ai-search.js
 *
 * ━━━ AI SEARCH INSTALLER FOR clients.html ━━━
 *
 * God-page decomposition PR-21 (RULE G5):
 * Installs the natural-language search widget into the page's filter
 * bar. Previously inlined in clients.html (~40 lines).
 *
 * Waits for window.aiSearch (provided by ai-search.js) + the filter-bar
 * element to exist, then calls aiSearch.install(...) with the clients-
 * page-specific schema + examples.
 *
 * The `apply` callback wires natural-language results into the existing
 * filter dropdowns + window.setClientFilter / renderGrid / scheduleStatsAndGrid.
 */

function install() {
  const filterBar = document.getElementById('filter-bar');
  if (!window.aiSearch || !filterBar) {
    setTimeout(install, 200);
    return;
  }
  window.aiSearch.install({
    host: filterBar,
    label: '🪄 بحث ذكي',
    placeholder: 'مثال: العملاء VIP عليهم فلوس',
    schema: {
      q:       { type: 'text', desc: 'بحث نصي بالاسم أو الهاتف' },
      flt:     { type: 'enum', desc: 'فلتر الحالة العامة',
                 values: ['all', 'today', 'rem', 'active', 'inactive', 'vip'] },
      tag:     { type: 'enum', desc: 'تصنيف العميل',
                 values: ['', 'vip', 'regular', 'new', 'wholesale', 'delayed'] },
      segment: { type: 'enum', desc: 'شريحة RFM',
                 values: ['', 'champion', 'loyal', 'new', 'needs_attention',
                          'at_risk', 'cant_lose', 'about_to_sleep', 'lost'] },
    },
    examples: [
      { q: 'عملاء VIP',                a: { tag: 'vip' } },
      { q: 'العملاء اللي عليهم فلوس',  a: { flt: 'rem' } },
      { q: 'المهدّدون بالفقد',         a: { segment: 'at_risk' } },
      { q: 'العملاء الخاملين',         a: { flt: 'inactive' } },
      { q: 'عملاء الجملة',             a: { tag: 'wholesale' } },
    ],
    apply: (spec) => {
      const setVal = (id, v) => {
        const el = document.getElementById(id);
        if (el && v != null) el.value = v;
      };
      if ('q'       in spec) setVal('q', spec.q || '');
      if ('tag'     in spec) setVal('f-tag', spec.tag || '');
      if ('segment' in spec) setVal('f-segment', spec.segment || '');
      if ('flt' in spec && spec.flt) {
        setVal('flt-select', spec.flt);
        window.setClientFilter?.(spec.flt);
      } else {
        window.renderGrid?.();
        window.scheduleStatsAndGrid?.();
      }
    },
  });
}

if (typeof window !== 'undefined') {
  install();
}
