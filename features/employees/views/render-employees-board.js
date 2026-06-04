/**
 * Business2Card ERP — features/employees/views/render-employees-board.js
 *
 * ━━━ EMPLOYEES BOARD VIEWS (RULE L1.5) ━━━
 *
 * Pure HTML builders for the employees board on employees.html — extracted
 * VERBATIM from renderList()'s HTML-generation part (Phase 3B). Markup is
 * BYTE-IDENTICAL to the former inline templates (verified by an automated
 * equality test against git HEAD: tests/employees-board-byte-identical.mjs).
 *
 * What stays in employees.html (NOT extracted — out of scope):
 *   maps construction, DOM reads (gv), filtering, sorting, renderFilterChips(),
 *   caches/mutations (currentPage clamp, __lastActivityMap), pagination state.
 *
 * The page computes everything, then composes the #list innerHTML as:
 *   - empty:  buildEmployeesEmptyHTML({...})
 *   - board:  '<div class="emp2-cards-grid">' +
 *             pageData.map(e=>buildEmployeeCardHTML(e, ctx)).join('') +
 *             '</div>' + buildEmployeesPagerHTML({...})
 * — producing the exact same string the inline template produced.
 *
 * All element ids (am-${e._id}), data-* attributes (data-act/eid/uid/ename/
 * page/sug/newstatus), act-menu ids, and the runtime inline styles are
 * preserved 1:1. Event delegation on #list (employees.html) is unaffected.
 */

/* ── Today attendance status meta (Phase-6 — resolveDayStatus → chip/dot) ── */
const ATT_META = {
  present:  { lbl: 'حاضر',    ico: '🟢', col: 'var(--g)' },
  late:     { lbl: 'متأخر',   ico: '🟠', col: 'var(--y)' },
  absent:   { lbl: 'غائب',    ico: '🔴', col: 'var(--r)' },
  leave:    { lbl: 'إجازة',   ico: '🏖️', col: 'var(--b)' },
  mission:  { lbl: 'مأمورية', ico: '🚗', col: 'var(--b)' },
  remote:   { lbl: 'عن بُعد', ico: '🏠', col: 'var(--b)' },
  off:      { lbl: 'عطلة',    ico: '⚪', col: 'var(--dim2)' },
  upcoming: { lbl: '—',       ico: '⚪', col: 'var(--dim2)' },
};

/* ── Empty states (former renderList lines 1025–1035) ── */
export function buildEmployeesEmptyHTML({ hasEmployees, hasFilter, sug, escAttr }) {
  if (hasEmployees) {
    return `<div class="empty-cta">
          <div class="empty-icon">🔍</div>
          <div class="empty-text">لا نتائج تطابق الفلاتر الحالية${sug?`<br><span class="emp2-empty-sug">هل تقصد <button type="button" data-act="apply-suggestion" data-sug="${escAttr(sug.replace(/'/g,''))}" class="emp2-empty-sug-btn">${sug}</button>؟</span>`:''}</div>
          ${hasFilter?`<button type="button" class="btn btn-b btn-sm emp2-fs-base" data-act="clear-filters">🧹 مسح الفلاتر</button>`:''}
        </div>`;
  }
  return `<div class="empty-cta">
          <div class="empty-icon">👥</div>
          <div class="empty-text">لا يوجد موظفين بعد</div>
          <button type="button" class="btn btn-b btn-sm emp2-fs-base" data-act="open-add-emp">＋ إضافة أول موظف</button>
        </div>`;
}

/* ── Single employee card (former renderList lines 1066–1195) ── */
export function buildEmployeeCardHTML(e, ctx) {
  const { paidEmpIds, attendedToday, todayAttMap, attendedInPeriod, activeOrdsAll,
          periodOrders, allOrders, lastActivityMap, periodFilter, pLbl,
          ROLES, calcKpi, getEmpStatus, nameToColor, fn, escAttr,
          attStatusMap, pendingPermMap, canManage } = ctx;
    const r=ROLES[e.role]||{label:e.role,col:'var(--dim-arch)',ico:'👤'};
    const isPaid=paidEmpIds.has(e._id);
    const isActive=e.status==='active';
    const uid=e.authUid||e._id;
    const hasTodayAtt=attendedToday.has(e._id)||attendedToday.has(uid);
    const todayRec=todayAttMap.get(uid)||todayAttMap.get(e._id)||null;
    const monthAtt=attendedInPeriod[e._id]||attendedInPeriod[uid]||0;
    const phone=e.phone||'';
    const waHref=phone?'https://wa.me/2'+phone.replace(/^0/,''):'';
    const activeOrderCnt=activeOrdsAll.filter(o=>o.designerId===uid||o.productionAgent===uid||o.shippingOfficerId===uid||o.createdBy===uid).length;
    const empSt=isActive?getEmpStatus(uid,e._id,todayRec,activeOrderCnt):{label:'غير نشط',col:'var(--dim2)',bg:'rgba(78,86,114,.12)'};
    // today attendance status (resolveDayStatus) — drives the dot + a chip + quick actions
    const attSt=isActive&&attStatusMap?(attStatusMap.get(uid)||attStatusMap.get(e._id)||null):null;
    const attMeta=attSt?(ATT_META[attSt.status]||ATT_META.off):null;
    const pendPerms=(isActive&&pendingPermMap?(pendingPermMap.get(e._id)||pendingPermMap.get(uid)):null)||[];
    const kpiScore=isActive?calcKpi(e,uid):0;
    const kpiCol=kpiScore>=90?'var(--g)':kpiScore>=70?'var(--b)':kpiScore>=50?'var(--y)':'var(--r)';
    const lastAct=lastActivityMap.get(e.name)||null;

    // أداء حسب الدور
    const myOrders=periodOrders;
    let perfHtml='';
    if(e.role==='graphic_designer'||e.role==='design_operator'){
      const mine=myOrders.filter(o=>o.designerId===uid||o.designerId===e._id);
      const printed=mine.filter(o=>['printing','production','shipping','archived'].includes(o.stage)).length;
      const commission=mine.filter(o=>['printing','production','shipping','archived'].includes(o.stage))
        .reduce((s,o)=>s+((parseFloat(o.salePrice)||0)*(parseFloat(e.commissionPct)||0)/100),0);
      perfHtml=`<div class="emp-metric emp2-card-perf">
        <span class="txt-meta-sm">🎨 ${pLbl}</span>
        <span class="txt-bold-base">${mine.length} تصميم · ${printed} طُبع</span>
      </div>
      ${commission>0?`<div class="emp-metric emp2-card-perf">
        <span class="txt-meta-sm">💸 عمولة</span>
        <span class="emp2-card-commission">${fn(Math.round(commission))} ج</span>
      </div>`:''}`;
    } else if(e.role==='customer_service'){
      const mine=myOrders.filter(o=>o.createdBy===uid);
      const sales=mine.reduce((s,o)=>s+(parseFloat(o.salePrice)||0),0);
      const allMine=allOrders.filter(o=>o.createdBy===uid);
      const uClients=new Set(allMine.map(o=>o.clientPhone||o.clientId||o.clientName)).size;
      perfHtml=`<div class="emp-metric emp2-card-perf">
        <span class="txt-meta-sm">📦 أوردرات ${pLbl}</span>
        <span class="txt-bold-base">${mine.length} · ${fn(sales)} ج</span>
      </div>
      <div class="emp-metric emp2-card-perf">
        <span class="txt-meta-sm">👤 عملاء (إجمالي)</span>
        <span class="emp2-card-clients">${uClients} عميل</span>
      </div>`;
    } else if(e.role==='production_agent'){
      const mine=myOrders.filter(o=>o.productionAgent===uid||o.productionAgent===e._id);
      const done=mine.filter(o=>['shipping','archived'].includes(o.stage)).length;
      perfHtml=`<div class="emp-metric emp2-card-perf">
        <span class="txt-meta-sm">🏭 تنفيذ</span>
        <span class="txt-bold-base">${mine.length} أوردر · ${done} مكتمل</span>
      </div>`;
    } else if(e.role==='shipping_officer'){
      const mine=myOrders.filter(o=>['shipping','archived'].includes(o.stage)&&(o.shippingOfficerId===uid||o.shippingOfficerId===e._id));
      perfHtml=`<div class="emp-metric emp2-card-perf">
        <span class="txt-meta-sm">🚚 شحنات</span>
        <span class="txt-bold-base">${mine.length}</span>
      </div>`;
    }

    const eSafe=e.name?.replace(/'/g,'')||'';
    // KPI ring (SVG): radius=18 → circumference≈113.1
    const ringDash=isActive?(113.1*kpiScore/100).toFixed(1):0;
    const ringHtml=isActive?`<div class="kpi-ring" data-act="open-kpi" data-eid="${escAttr(e._id)}" data-uid="${escAttr(uid)}" data-ename="${escAttr(eSafe)}" title="تقييم الأداء">
      <svg width="44" height="44" viewBox="0 0 44 44">
        <circle class="ring-bg" cx="22" cy="22" r="18"/>
        <circle class="ring-fg" cx="22" cy="22" r="18" stroke="${kpiCol}" stroke-dasharray="113.1" stroke-dashoffset="${(113.1-ringDash).toFixed(1)}"/>
      </svg>
      <div class="ring-num" style="color:${kpiCol}">${kpiScore}</div>
    </div>`:'';
    const avColor=nameToColor(e.name);
    return `<div class="emp-card" style="--ec:${r.col}">
      <!-- Header: avatar + name + KPI ring -->
      <div class="emp2-card-head">
        <div class="emp-avatar" style="background:${avColor}">
          ${(e.name||'?')[0].toUpperCase()}
          <div class="dot" style="background:${attMeta?attMeta.col:empSt.col}" title="${attMeta?attMeta.lbl:empSt.label}"></div>
        </div>
        <div class="flex-1 min-w-0">
          <div class="emp2-card-name">${e.name||'—'}</div>
          <div class="emp2-card-chiprow">
            <span class="emp-chip" style="background:${r.col}18;color:${r.col};border:1px solid ${r.col}30">${r.ico} ${r.label}</span>
            ${isActive&&todayRec?`<span class="emp2-card-time">${todayRec.checkInStr||''}${todayRec.checkOutStr?' → '+todayRec.checkOutStr:' ●'}</span>`:''}
            ${isActive&&attMeta?`<span class="emp2-att-chip" style="color:${attMeta.col}">${attMeta.ico} ${attMeta.lbl}${(attSt.lateMinutes||0)>0?' '+attSt.lateMinutes+'د':''}</span>`:''}
          </div>
        </div>
        ${ringHtml}
      </div>

      <!-- Salary line -->
      <div class="emp2-card-salary">
        <span class="txt-meta-sm">💰 المرتب</span>
        <div class="emp2-card-salary-r">
          <span class="emp2-card-salary-amt">${fn(e.baseSalary||0)} ج</span>
          ${isActive?(isPaid
            ?`<span class="emp2-card-paid">✅ مصروف</span>`
            :`<span class="emp2-card-unpaid">⏳ متبقي</span>`):''}
        </div>
      </div>

      <!-- Performance metrics -->
      ${perfHtml}

      <!-- Attendance row -->
      ${isActive?`<div class="emp-metric emp2-card-att" data-act="open-att" data-eid="${escAttr(e._id)}" data-uid="${escAttr(uid)}" data-ename="${escAttr(eSafe)}" title="اضغط لعرض السجل">
        <span class="txt-meta-sm">📅 حضور ${pLbl}</span>
        <span style="font-size:var(--fs-base);font-weight:var(--fw-extra);color:${monthAtt>=20?'var(--g)':monthAtt>=10?'var(--y)':'var(--r)'}">${monthAtt} يوم</span>
      </div>`:''}

      <!-- Quick attendance actions (manager): central check-in / approve permissions -->
      ${isActive&&canManage&&((attSt&&attSt.status==='absent')||pendPerms.length)?`<div class="emp2-att-actions">
        ${attSt&&attSt.status==='absent'?`<button type="button" class="btn btn-b btn-xs" data-act="att-checkin" data-eid="${escAttr(e._id)}" data-uid="${escAttr(uid)}" data-ename="${escAttr(eSafe)}" data-start="${escAttr(e.workSchedule?.startTime||'')}">✓ تسجيل حضور</button>`:''}
        ${pendPerms.map(p=>`<span class="emp2-att-pend"><span class="bdg-mini">🟡 إذن</span><button type="button" class="btn btn-g btn-xs" data-act="att-approve" data-perm="${escAttr(p._id)}" title="اعتماد">✅</button><button type="button" class="btn btn-ghost btn-xs" data-act="att-reject" data-perm="${escAttr(p._id)}" title="رفض">🚫</button></span>`).join('')}
      </div>`:''}

      <!-- Last activity -->
      ${lastAct?`<div class="emp2-card-lastact">
        <span class="emp2-card-lastact-txt">⚡ ${lastAct.action||'—'}</span>
        <span class="emp2-card-lastact-date">${(lastAct.date||'').slice(5)||''}</span>
      </div>`:''}

      <!-- Primary actions: pay (if needed) + profile + overflow -->
      <div class="emp2-card-actions">
        ${isActive&&!isPaid&&periodFilter==='month_cur'
          ?`<button type="button" class="btn btn-g btn-sm emp2-card-act-pay" data-act="open-pay-one" data-eid="${escAttr(e._id)}">💰 صرف</button>`
          :''}
        <a href="employee-profile.html?id=${e._id}" class="btn btn-ghost btn-sm emp2-card-act-profile" data-act="noop">👤 بروفايل</a>
        <button type="button" class="btn btn-ghost btn-sm emp2-card-act-more" data-act="toggle-act-menu" data-eid="${escAttr(e._id)}" aria-label="إجراءات">⋯</button>
        <div class="act-menu" id="am-${e._id}" data-act="menu-stop">
          <button type="button" data-act="menu-open-kpi" data-eid="${escAttr(e._id)}" data-uid="${escAttr(uid)}" data-ename="${escAttr(eSafe)}">📊 تقييم الأداء</button>
          <button type="button" data-act="menu-edit" data-eid="${escAttr(e._id)}">✏️ تعديل البيانات</button>
          ${phone?`<a href="tel:${phone}" class="emp2-act-link" data-act="menu-close">📞 اتصال</a>`:''}
          ${waHref?`<a href="${waHref}" target="_blank" class="emp2-act-link" data-act="menu-close">💬 واتساب</a>`:''}
          <div class="act-sep"></div>
          <button type="button" data-act="menu-toggle-status" data-eid="${escAttr(e._id)}" data-newstatus="${isActive?'inactive':'active'}" style="color:${isActive?'var(--y)':'var(--g)'}">${isActive?'⏸ إيقاف الموظف':'▶ تفعيل الموظف'}</button>
        </div>
      </div>
    </div>`;
}

/* ── Pager (former renderList lines 1196–1218) ── */
export function buildEmployeesPagerHTML({ currentPage, totalPages, pageStart, PAGE_SIZE, dataLength }) {
  const data = { length: dataLength };
  return totalPages>1?`<div class="emp2-pager">
    <span class="txt-meta-sm">عرض ${pageStart+1}–${Math.min(pageStart+PAGE_SIZE,data.length)} من ${data.length}</span>
    <div class="page-nums">
      <button type="button" class="page-num" ${currentPage===1?'disabled':''} data-act="goto-page" data-page="${currentPage-1}" aria-label="السابق">‹</button>
      ${(()=>{
        const pages=[];const cur=currentPage,total=totalPages;
        const push=p=>pages.push(p);
        if(total<=7){for(let i=1;i<=total;i++)push(i);}
        else{
          push(1);
          if(cur>3)push('…');
          const s=Math.max(2,cur-1),en=Math.min(total-1,cur+1);
          for(let i=s;i<=en;i++)push(i);
          if(cur<total-2)push('…');
          push(total);
        }
        return pages.map(p=>p==='…'
          ?`<span class="page-num dots">…</span>`
          :`<button type="button" class="page-num${p===cur?' active':''}" data-act="goto-page" data-page="${p}">${p}</button>`).join('');
      })()}
      <button type="button" class="page-num" ${currentPage===totalPages?'disabled':''} data-act="goto-page" data-page="${currentPage+1}" aria-label="التالي">›</button>
    </div>
  </div>`:'';
}
