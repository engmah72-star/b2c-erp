/**
 * print-workspace.js — Kanban board + workspace quick actions for print.html
 * Exposed on window.printWorkspace so print.html can call without circular deps.
 */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const KB_COLS = [
  { id: 'waiting',  label: '⚠️ ينتظر ملف',    col: 'var(--r)' },
  { id: 'ready',    label: '✅ جاهز للإرسال',  col: 'var(--g)' },
  { id: 'at-press', label: '🖨️ عند المطبعة',  col: 'var(--b)' },
  { id: 'printed',  label: '📦 مطبوع',         col: 'var(--p)' },
  { id: 'other',    label: '📋 أخرى',          col: 'var(--dim)' },
];

function getFirstThumb(o) {
  const imgs = (o.products || []).flatMap(p =>
    Array.isArray(p.designImages) && p.designImages.length
      ? p.designImages.filter(Boolean)
      : p.designImageUrl ? [p.designImageUrl] : []
  );
  return imgs[0] || o.designImageUrl || '';
}

function renderKanbanCard(o, { getStatusCategory, computeOrderReadyScore } = {}) {
  const cat   = getStatusCategory ? getStatusCategory(o) : 'other';
  const rs    = computeOrderReadyScore ? computeOrderReadyScore(o) : { score: 0, missing: [] };
  const rcol  = rs.score >= 90 ? 'var(--g)' : rs.score >= 60 ? 'var(--y)' : 'var(--r)';
  const rico  = rs.score >= 90 ? '✅' : rs.score >= 60 ? '🟡' : '🔴';
  const thumb = getFirstThumb(o);
  const prods = (o.products || []).slice(0, 2).map(p => esc(p.name + (p.qty ? '×' + p.qty : ''))).join(' · ');
  const d     = o.deadline ? Math.max(0, Math.floor((Date.now() - new Date(o.deadline).getTime()) / 86400000)) : 0;

  // Thumbnail
  const thumbHtml = thumb
    ? `<img src="${esc(thumb)}" loading="lazy"
         onclick="event.stopPropagation();window.open('${thumb.replace(/'/g, "\\'")}','_blank')"
         style="width:40px;height:40px;border-radius:7px;object-fit:cover;flex-shrink:0;background:var(--bg3);cursor:zoom-in;border:1px solid var(--line)" alt="">`
    : `<div style="width:40px;height:40px;border-radius:7px;background:var(--bg3);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;color:var(--dim2)">🖼️</div>`;

  // Context quick action
  let qa = '';
  if (cat === 'ready') {
    qa = `<button type="button" class="kb-qbtn kb-qbtn-g"
            onclick="event.stopPropagation();openProductionSheet('${esc(o._id)}')">🖨️ إرسال</button>`;
  } else if (cat === 'at-press') {
    qa = `<button type="button" class="kb-qbtn kb-qbtn-p"
            onclick="event.stopPropagation();markOrderAllPrinted('${esc(o._id)}')">✅ تم</button>`;
  }

  return `<div class="kb-card" onclick="openOrder('${esc(o._id)}')">
    <div style="display:flex;align-items:flex-start;gap:8px">
      ${thumbHtml}
      <div style="flex:1;min-width:0">
        <div style="font-size:var(--fs-sm);font-weight:var(--fw-heavy);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${d > 0 ? `<span style="color:var(--r);font-size:10px">⚠️${d}ي </span>` : ''}${esc(o.clientName || '—')}
        </div>
        <div style="font-size:var(--fs-xs);color:var(--dim2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">${prods || '—'}</div>
        <div style="font-size:10px;color:var(--dim);margin-top:2px">${esc(o.orderId || (o._id || '').slice(-6))}</div>
      </div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;gap:6px">
      <span style="font-size:var(--fs-xs);font-weight:var(--fw-extra);color:${rcol}">${rico} ${rs.score}%</span>
      ${qa}
    </div>
  </div>`;
}

function renderKanban(orders, opts = {}) {
  const { getStatusCategory, computeOrderReadyScore } = opts;
  const grouped = {};
  KB_COLS.forEach(c => { grouped[c.id] = []; });
  orders.forEach(o => {
    const cat = getStatusCategory ? getStatusCategory(o) : 'other';
    (grouped[cat] || grouped['other']).push(o);
  });

  const cols = KB_COLS.map(col => {
    const list = grouped[col.id] || [];
    return `<div class="kb-col">
      <div class="kb-col-head" style="border-top:3px solid ${col.col}">
        <span>${col.label}</span>
        <span class="kb-col-cnt">${list.length}</span>
      </div>
      <div class="kb-col-body">
        ${list.length
          ? list.map(o => renderKanbanCard(o, { getStatusCategory, computeOrderReadyScore })).join('')
          : `<div class="kb-empty">لا يوجد</div>`}
      </div>
    </div>`;
  }).join('');

  return `<div class="kb-board">${cols}</div>`;
}

window.printWorkspace = { renderKanban, renderKanbanCard };
