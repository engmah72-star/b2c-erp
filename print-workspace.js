/**
 * print-workspace.js — Kanban board + Press-centric workspace for print.html
 * Exposed on window.printWorkspace so print.html can call without circular deps.
 *
 * Views:
 *   renderKanban(orders, opts)      — status-centric kanban (5 cols by order status)
 *   renderPressKanban(orders, opts) — press-centric kanban (cols = press companies)
 *
 * The press kanban explodes orders → product-level jobs (one card per product),
 * grouped by the product's pressId/pressName. This matches how the print team
 * actually works: distributing print jobs to specific press companies, not
 * tracking client orders.
 */

// ── Shared Helpers ────────────────────────────────────────────────────────────

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function getFirstThumb(o, p) {
  // Product-level images first, then order-level fallback
  if (p) {
    const imgs = Array.isArray(p.designImages) ? p.designImages.filter(Boolean) : [];
    if (imgs.length) return imgs[0];
    if (p.designImageUrl) return p.designImageUrl;
  }
  // Order-level fallback
  const orderImgs = (o.products || []).flatMap(pr =>
    Array.isArray(pr.designImages) && pr.designImages.length
      ? pr.designImages.filter(Boolean)
      : pr.designImageUrl ? [pr.designImageUrl] : []
  );
  return orderImgs[0] || o.designImageUrl || '';
}

function fmtPressDeadline(pd) {
  if (!pd) return '';
  const d = new Date(pd);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' });
}

// ── Status Kanban (order-centric) ─────────────────────────────────────────────

const KB_COLS = [
  { id: 'waiting',  label: '⚠️ ينتظر ملف',    col: 'var(--r)' },
  { id: 'ready',    label: '✅ جاهز للإرسال',  col: 'var(--g)' },
  { id: 'at-press', label: '🖨️ عند المطبعة',  col: 'var(--b)' },
  { id: 'printed',  label: '📦 مطبوع',         col: 'var(--p)' },
  { id: 'other',    label: '📋 أخرى',          col: 'var(--dim)' },
];

function renderKanbanCard(o, { getStatusCategory, computeOrderReadyScore } = {}) {
  const cat  = getStatusCategory ? getStatusCategory(o) : 'other';
  const rs   = computeOrderReadyScore ? computeOrderReadyScore(o) : { score: 0 };
  const rcol = rs.score >= 90 ? 'var(--g)' : rs.score >= 60 ? 'var(--y)' : 'var(--r)';
  const rico = rs.score >= 90 ? '✅' : rs.score >= 60 ? '🟡' : '🔴';
  const thumb = getFirstThumb(o);
  const prods = (o.products || []).slice(0, 2).map(p => esc(p.name + (p.qty ? '×' + p.qty : ''))).join(' · ');
  const d = o.deadline ? Math.max(0, Math.floor((Date.now() - new Date(o.deadline).getTime()) / 86400000)) : 0;

  const thumbHtml = thumb
    ? `<img src="${esc(thumb)}" loading="lazy"
         onclick="event.stopPropagation();window.open('${thumb.replace(/'/g, "\\'")}','_blank')"
         style="width:40px;height:40px;border-radius:7px;object-fit:cover;flex-shrink:0;background:var(--bg3);cursor:zoom-in;border:1px solid var(--line)" alt="">`
    : `<div style="width:40px;height:40px;border-radius:7px;background:var(--bg3);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;color:var(--dim2)">🖼️</div>`;

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

// ── Press Kanban (product/job-centric) ────────────────────────────────────────
// وحدة العمل هنا = product job، مش order.
// كل منتج = job مستقل له مطبعته ومواصفاته وحالته.

function getProductJobs(orders) {
  const jobs = [];
  orders.forEach(o => {
    (o.products || []).forEach((p, idx) => {
      jobs.push({ order: o, product: p, prodIdx: idx });
    });
  });
  return jobs;
}

function renderPressJobCard(job, { computeProductReadiness } = {}) {
  const { order: o, product: p, prodIdx } = job;

  const isOffset  = (p.printType || '').includes('offset');
  const isDigital = (p.printType || '').includes('digital');
  const ptLabel   = isOffset && isDigital ? 'مختلط' : isOffset ? 'أوفست' : isDigital ? 'ديجيتال' : '';
  const ptCol     = isOffset ? 'var(--y)' : isDigital ? 'var(--b)' : 'var(--dim)';

  const d         = o.deadline ? Math.max(0, Math.floor((Date.now() - new Date(o.deadline).getTime()) / 86400000)) : 0;
  const pd        = p.pressDeadline ? new Date(p.pressDeadline) : null;
  const pdOverdue = pd && pd < new Date();
  const isPrinted = p.productStatus === 'printed' || p.productStatus === 'done';
  const isSent    = !!p.briefSentAt;

  const thumb = getFirstThumb(o, p);

  const rr   = computeProductReadiness ? computeProductReadiness(o, p) : { pct: 0, ready: false };
  const rcol = rr.ready ? 'var(--g)' : rr.pct >= 60 ? 'var(--y)' : 'var(--r)';

  // Specs line (the key info for the print team)
  const specs = [
    p.paper ? `${esc(p.paper)}${p.weight ? ` ${p.weight}جم` : ''}` : null,
    p.printSize || p.size ? esc(p.printSize || p.size) : null,
    isOffset && p.zinkType ? esc(p.zinkType) : null,
    isOffset && p.cutSize  ? `قطع: ${esc(p.cutSize)}` : null,
    p.lamination && p.lamination !== 'بلا' ? esc(p.lamination) : null,
  ].filter(Boolean).join(' · ');

  const thumbHtml = thumb
    ? `<img src="${esc(thumb)}" loading="lazy"
         onclick="event.stopPropagation();window.open('${thumb.replace(/'/g, "\\'")}','_blank')"
         style="width:38px;height:38px;border-radius:7px;object-fit:cover;flex-shrink:0;background:var(--bg3);cursor:zoom-in;border:1px solid var(--line)" alt="">`
    : `<div style="width:38px;height:38px;border-radius:7px;background:var(--bg3);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px;color:var(--dim2)">🖼️</div>`;

  return `<div class="kb-card kb-job-card" onclick="openOrder('${esc(o._id)}')">
    <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px">
      ${thumbHtml}
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
          <span style="font-size:var(--fs-sm);font-weight:var(--fw-heavy)">${esc(p.name || '—')}</span>
          <span style="font-size:var(--fs-xs);font-weight:var(--fw-bold);color:var(--y);flex-shrink:0">×${p.qty || '?'}</span>
          ${ptLabel ? `<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:${ptCol}18;color:${ptCol};border:1px solid ${ptCol}33;font-weight:800;flex-shrink:0">${ptLabel}</span>` : ''}
        </div>
        ${specs ? `<div style="font-size:var(--fs-xs);color:var(--dim2);margin-top:3px;line-height:1.5">${specs}</div>` : ''}
        <div style="font-size:10px;color:var(--dim);margin-top:3px">
          ${esc(o.orderId || (o._id || '').slice(-6))} · ${esc(o.clientName || '—')}${d > 0 ? ` · <span style="color:var(--r)">⚠️${d}ي</span>` : ''}
        </div>
      </div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;padding-top:7px;border-top:1px solid var(--line)">
      <div>
        ${isSent
          ? `<div style="font-size:var(--fs-xs);color:var(--g);font-weight:var(--fw-bold)">✅ بُعث البريف</div>`
          : `<div style="font-size:var(--fs-xs);color:${rcol};font-weight:var(--fw-bold)">${rr.ready ? '🟢 جاهز للإرسال' : `🔴 ${rr.pct}% مكتمل`}</div>`}
        ${pd ? `<div style="font-size:10px;color:${pdOverdue ? 'var(--r)' : 'var(--dim2)'};margin-top:1px">📅 ${fmtPressDeadline(p.pressDeadline)}</div>` : ''}
      </div>
      ${!isPrinted
        ? `<button type="button" class="kb-qbtn kb-qbtn-p" style="flex-shrink:0"
              onclick="event.stopPropagation();markPressJobPrinted('${esc(o._id)}',${prodIdx})">✅ تم</button>`
        : `<span style="font-size:var(--fs-xs);color:var(--p);font-weight:var(--fw-bold);flex-shrink:0">📦 مطبوع</span>`}
    </div>
  </div>`;
}

function renderPressKanban(orders, opts = {}) {
  const jobs = getProductJobs(orders);

  // Separate done jobs
  const activeJobs = jobs.filter(j => j.product.productStatus !== 'printed' && j.product.productStatus !== 'done');
  const doneJobs   = jobs.filter(j => j.product.productStatus === 'printed' || j.product.productStatus === 'done');

  // Group active jobs by press company
  const groups = {};
  activeJobs.forEach(j => {
    const key  = j.product.pressId  || '__none__';
    const name = j.product.pressName || 'غير محددة';
    if (!groups[key]) groups[key] = { pressId: key, pressName: name, jobs: [] };
    groups[key].jobs.push(j);
  });

  // Sort: غير محددة first, then by job count descending
  const cols = Object.values(groups).sort((a, b) => {
    if (a.pressId === '__none__' && b.pressId !== '__none__') return -1;
    if (b.pressId === '__none__' && a.pressId !== '__none__') return 1;
    return b.jobs.length - a.jobs.length;
  });

  const renderCol = (pressId, pressName, colJobs, isDoneCol) => {
    const colColor = isDoneCol ? 'var(--p)' : pressId === '__none__' ? 'var(--dim)' : 'var(--b)';

    // Count jobs ready to batch-send (ready specs + not yet sent)
    const readyCount = isDoneCol ? 0 : colJobs.filter(j => {
      const rr = opts.computeProductReadiness ? opts.computeProductReadiness(j.order, j.product) : { ready: false };
      return (rr.ready || j.product.briefSentAt) && !j.product.briefSentAt;
    }).length;

    const batchBtn = (!isDoneCol && pressId !== '__none__' && readyCount > 0)
      ? `<button type="button" class="kb-batch-btn"
            onclick="event.stopPropagation();sendBatchBrief('${esc(pressId)}','${esc(pressName)}')">
            💬 إرسال الكل للمطبعة (${readyCount})
         </button>`
      : '';

    return `<div class="kb-col">
      <div class="kb-col-head" style="border-top:3px solid ${colColor};flex-direction:column;align-items:stretch;gap:6px">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:var(--fs-sm);font-weight:var(--fw-extra)">${esc(isDoneCol ? '📦 مطبوع' : pressName)}</span>
          <span class="kb-col-cnt">${colJobs.length}</span>
        </div>
        ${batchBtn}
      </div>
      <div class="kb-col-body">
        ${colJobs.length
          ? colJobs.map(j => renderPressJobCard(j, opts)).join('')
          : `<div class="kb-empty">لا يوجد</div>`}
      </div>
    </div>`;
  };

  const colsHTML = cols.map(c => renderCol(c.pressId, c.pressName, c.jobs, false)).join('');
  const doneHTML = doneJobs.length ? renderCol('__done__', '📦 مطبوع', doneJobs, true) : '';

  return `<div class="kb-board">${colsHTML}${doneHTML}</div>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

window.printWorkspace = { renderKanban, renderKanbanCard, renderPressKanban, renderPressJobCard, getProductJobs };
