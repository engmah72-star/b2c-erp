/**
 * Business2Card ERP — features/reports/views/render-overview-detailed.js
 *
 * ━━━ REPORTS OVERVIEW (DETAILED) VIEW (RULE L1.5) ━━━
 *
 * Pure HTML builder for the collapsible "Detailed Overview" section in
 * the reports.html overview tab. Reads all dependencies from `ctx`, so
 * has no closure on the page's globals. Inline onclick handlers still
 * resolve at runtime via window.* (switchTab, filterByStage, focusClient,
 * openRevDrawer, openExpenseDrawer, goCollectionPostDesign, goCollectionFlag,
 * applyPreset, deletePreset, savePresetPrompt).
 *
 * Behavior is 1:1 with the previous inline implementation —
 * extraction only, no logic changes.
 *
 * @param {Array}  f     — orders filtered to the current period
 * @param {*}      prev  — previous period info (currently unused, kept
 *                          for signature parity with the page)
 * @param {object} ctx   — bag of closures from reports.html:
 *   - filterMode, transactions, orders, wallets, suppliers, payments
 *   - getRange, getPrevRange
 *   - calcRem, isStaleOrder, isMissingCost, isDelivered
 *   - dailySeries, loadPresets, sparkline, diff, monthlyChart, fn
 * @returns {string} HTML
 */
export function renderOverviewDetailedView(f, prev, ctx) {
  const {
    filterMode, transactions, orders, wallets, suppliers, payments,
    getRange, getPrevRange,
    calcRem, isStaleOrder, isMissingCost, isDelivered,
    dailySeries, loadPresets, sparkline, diff, monthlyChart, fn,
  } = ctx;

  // ══ الإيرادات = الكاش الفعلي من transactions_v2 ══
  const range=getRange(filterMode);
  const prev2=getPrevRange(filterMode);

  // المحصّل فعلاً في الفترة (من transactions_v2)
  const inTx=transactions.filter(p=>{
    if(p.type!=='in'&&p.category!=='collection'&&p.category!=='advance'&&p.category!=='deposit')return false;
    if(!p.createdAt?.seconds)return false;
    const d=new Date(p.createdAt.seconds*1000);
    return d>=range.from&&d<=range.to;
  });
  const tot=inTx.reduce((s,p)=>s+(parseFloat(p.amount)||0),0);

  // المحصّل في الفترة السابقة
  const prevInTx=transactions.filter(p=>{
    if(p.type!=='in'&&p.category!=='collection'&&p.category!=='advance'&&p.category!=='deposit')return false;
    if(!p.createdAt?.seconds)return false;
    const d=new Date(p.createdAt.seconds*1000);
    return d>=prev2.from&&d<=prev2.to;
  });
  const pTot=prevInTx.reduce((s,p)=>s+(parseFloat(p.amount)||0),0);

  // قيمة الأوردرات (مش الإيرادات — للمرجع بس)
  const ordersTotal=f.reduce((s,o)=>s+(parseFloat(o.salePrice)||0),0);

  // الباقي على العملاء
  const rem=f.reduce((s,o)=>s+calcRem(o),0);
  // الباقي الحرج: العميل وافق على التصميم ودخل طباعة/تنفيذ/شحن (المنتج اتصرف عليه فلوس)
  const remCritical=f.filter(o=>['printing','production','shipping'].includes(o.stage)).reduce((s,o)=>s+calcRem(o),0);

  // المصروفات الفعلية = كل transactions type='out' في الفترة (موردين + شحن + مرتجعات + غيرها)
  const inRange2=(t,r)=>t.createdAt?.seconds&&new Date(t.createdAt.seconds*1000)>=r.from&&new Date(t.createdAt.seconds*1000)<=r.to;
  const costs=transactions.filter(t=>t.type==='out'&&inRange2(t,range)).reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
  const supDue=suppliers.reduce((s,sup)=>{const p=payments.filter(x=>x.supplierId===sup._id).reduce((ps,x)=>ps+(parseFloat(x.amount)||0),0);const pur=orders.reduce((os,o)=>os+(o.costItems||[]).filter(c2=>c2.supplierId===sup._id).reduce((cs,c2)=>cs+(parseFloat(c2.total)||0),0),0);return s+Math.max(0,pur-p);},0);

  // الربح = الكاش الفعلي - المصروفات الفعلية
  const profit=tot-costs;
  const pCosts=transactions.filter(t=>t.type==='out'&&inRange2(t,prev2)).reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
  const pProfit=pTot-pCosts;

  const late=orders.filter(o=>o.deadline&&new Date(o.deadline)<new Date()&&!['archived','shipping'].includes(o.stage));
  // الأوردرات اللي عليها باقي وقاعدة بدون حركة فترة طويلة
  const staleWithRem=f.filter(o=>parseFloat(o.salePrice)>0&&calcRem(o)>0&&isStaleOrder(o));
  // الأوردرات اللي وصلت لمراحل متقدّمة من غير ما حد سجّل تكلفة
  const noCostOrders=f.filter(isMissingCost);

  // Sparkline series — آخر 30 يوم
  const inFilter=t=>(t.type==='in'||['collection','advance','deposit'].includes(t.category));
  const outFilter=t=>(t.type==='out');
  const totSpark=dailySeries(30,inFilter,t=>parseFloat(t.amount)||0);
  const costSpark=dailySeries(30,outFilter,t=>parseFloat(t.amount)||0);

  // Daily close — آخر 7 أيام × المحافظ
  const wallSorted=[...wallets].sort((a,b)=>(a.order||0)-(b.order||0)||(a.name||'').localeCompare(b.name||''));
  const dailyByWallet={};
  wallSorted.forEach(w=>dailyByWallet[w._id]={inSum:0,outSum:0,inDays:new Array(7).fill(0),outDays:new Array(7).fill(0)});
  const daily7End=new Date();daily7End.setHours(23,59,59,999);
  const daily7End_ms=daily7End.getTime();
  transactions.forEach(t=>{
    const sec=t.createdAt?.seconds||0;if(!sec)return;
    const ageDays=Math.floor((daily7End_ms-sec*1000)/86400000);
    if(ageDays<0||ageDays>=7)return;
    const wid=t.walletId;if(!wid||!dailyByWallet[wid])return;
    const amt=parseFloat(t.amount)||0;
    const idx=6-ageDays;
    if(t.type==='in'){dailyByWallet[wid].inSum+=amt;dailyByWallet[wid].inDays[idx]+=amt;}
    else if(t.type==='out'){dailyByWallet[wid].outSum+=amt;dailyByWallet[wid].outDays[idx]+=amt;}
  });

  // Heatmap — آخر 60 يوم: kt = orders count per day
  const hmDays=60;
  const hm=new Array(hmDays).fill(0);
  const hmEnd=new Date();hmEnd.setHours(23,59,59,999);
  const hmEndMs=hmEnd.getTime();
  orders.forEach(o=>{
    const s=o.createdAt?.seconds||0;if(!s)return;
    const age=Math.floor((hmEndMs-s*1000)/86400000);
    if(age<0||age>=hmDays)return;
    hm[hmDays-1-age]++;
  });
  const hmMax=Math.max(...hm,1);

  // قائمة المحافظ الأكثر استخداماً للـ sparkline (لو في > 0)
  const presets=loadPresets();

  // ── Executive summary helpers ──
  // 1) رصيد المحافظ الإجمالي = الكاش في الصندوق دلوقتي
  const cashOnHand=wallets.reduce((s,w)=>s+(parseFloat(w.balance)||0),0);
  // 2) أكتر 5 عملاء عليهم باقي
  const debtMap={};
  f.forEach(o=>{
    const r=calcRem(o);if(r<=0)return;
    const k=o.clientId||o.clientName;if(!k)return;
    if(!debtMap[k])debtMap[k]={name:o.clientName||'—',phone:o.clientPhone||'',rem:0,count:0};
    debtMap[k].rem+=r;debtMap[k].count++;
  });
  const topDebtors=Object.values(debtMap).sort((a,b)=>b.rem-a.rem).slice(0,5);
  // 3) Pipeline counts
  const pipeline={design:0,printing:0,production:0,shipping:0,archived:0};
  f.forEach(o=>{if(pipeline[o.stage]!=null)pipeline[o.stage]++;});
  const pipelineMax=Math.max(...Object.values(pipeline),1);
  const stageLabel={design:'✏️ تصميم',printing:'🖨️ طباعة',production:'🏭 تنفيذ',shipping:'🚚 شحن',archived:'📁 أرشيف'};
  // 4) Risk consolidated count
  const totalRisks=late.length+staleWithRem.length+noCostOrders.length+(supDue>0?1:0);

  // 5) Avg order value + highest sales day
  const ordersWithPrice=f.filter(o=>parseFloat(o.salePrice)>0);
  const avgOrder=ordersWithPrice.length?ordersWithPrice.reduce((s,o)=>s+(parseFloat(o.salePrice)||0),0)/ordersWithPrice.length:0;
  // اجمع التحصيل بكل يوم في الفترة → خد الأعلى
  const dayMap={};
  transactions.forEach(t=>{
    if(t.type!=='in'&&!['collection','advance','deposit'].includes(t.category))return;
    if(!inRange2(t,range))return;
    const d=new Date(t.createdAt.seconds*1000);
    const k=d.toLocaleDateString('ar-EG');
    dayMap[k]=(dayMap[k]||0)+(parseFloat(t.amount)||0);
  });
  const peakDayEntry=Object.entries(dayMap).sort((a,b)=>b[1]-a[1])[0];
  const peakDay=peakDayEntry?{date:peakDayEntry[0],amount:peakDayEntry[1]}:null;
  // 6) Forecast — projection للفترة الحالية بناءً على معدّل الأيام اللي عدّت
  const periodStart=range.from.getTime(),periodEnd=range.to.getTime(),nowMs=Math.min(Date.now(),periodEnd);
  const periodDays=Math.max(1,Math.ceil((periodEnd-periodStart)/86400000));
  const elapsedDays=Math.max(1,Math.min(periodDays,Math.ceil((nowMs-periodStart)/86400000)));
  const remainingDays=Math.max(0,periodDays-elapsedDays);
  const dailyRate=tot/elapsedDays;
  const forecastEnd=tot+(dailyRate*remainingDays);
  const forecastGrowth=pTot>0?Math.round((forecastEnd-pTot)/pTot*100):0;
  // 7) Delivery success rate (across shipping orders ever)
  const shipOrds=orders.filter(o=>['shipping','archived'].includes(o.stage)||o.shipCompanyName);
  const delivered=shipOrds.filter(isDelivered).length;
  const deliveryRate=shipOrds.length?Math.round(delivered/shipOrds.length*100):0;
  // 8) Geographic distribution — top 8 governorates
  const geoMap={};
  f.forEach(o=>{const g=(o.shipGov||'').trim();if(!g)return;geoMap[g]=(geoMap[g]||0)+1;});
  const geoTop=Object.entries(geoMap).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const geoMax=geoTop.length?geoTop[0][1]:1;
  // 9) Bottlenecks — avg dwell per stage (using updatedAt - createdAt for orders currently in that stage)
  const stageDwell={design:[],printing:[],production:[],shipping:[]};
  orders.forEach(o=>{
    if(!stageDwell[o.stage])return;
    const ts=o.updatedAt?.seconds||o.createdAt?.seconds||0;if(!ts)return;
    const days=Math.floor((Date.now()-ts*1000)/86400000);
    if(days>=0)stageDwell[o.stage].push(days);
  });
  const stageAvg={};Object.entries(stageDwell).forEach(([k,arr])=>{stageAvg[k]=arr.length?arr.reduce((s,v)=>s+v,0)/arr.length:0;});
  const bottleneck=Object.entries(stageAvg).sort((a,b)=>b[1]-a[1])[0];

  // 10) Smart insights — رولز بسيطة بترجم الأرقام لقرارات
  const insights=[];
  // مقارنة التحصيل
  if(pTot>0){
    const dPct=Math.round((tot-pTot)/pTot*100);
    if(dPct<=-20)insights.push({lvl:'bad',ic:'📉',txt:`التحصيل في الفترة دي انخفض <b>${Math.abs(dPct)}%</b> عن السابقة (${fn(pTot)} ج → ${fn(tot)} ج). محتاج تتابع ليه`,act:{label:'افحص المتأخرين',fn:`goCollectionFlag('stale')`}});
    else if(dPct>=20)insights.push({lvl:'good',ic:'📈',txt:`التحصيل ارتفع <b>${dPct}%</b> عن الفترة السابقة. استمر على نفس الإيقاع`});
  }
  // Forecast
  if(remainingDays>0&&tot>0){
    insights.push({lvl:forecastGrowth>=0?'good':'warn',ic:'🔮',txt:`بناءً على معدّل الأيام اللي عدت، <b>متوقع تخلّص الفترة بـ ${fn(Math.round(forecastEnd))} ج</b>${pTot>0?` (${forecastGrowth>=0?'+':''}${forecastGrowth}% vs السابقة)`:''}`});
  }
  // Critical post-design
  if(remCritical>0){
    insights.push({lvl:'bad',ic:'⚠️',txt:`<b>${fn(remCritical)} ج</b> فلوس عملاء وافقوا على التصميم ودخلوا تنفيذ بدون تحصيل — ده الأكثر إلحاحاً`,act:{label:'اعرضهم',fn:`goCollectionPostDesign()`}});
  }
  // Cash position
  if(cashOnHand<costs&&costs>0){
    insights.push({lvl:'bad',ic:'💰',txt:`الكاش في الخزينة (<b>${fn(cashOnHand)} ج</b>) أقل من إجمالي المصروفات في الفترة (${fn(costs)} ج). راجع التدفق النقدي`});
  }
  // Bottleneck
  if(bottleneck&&bottleneck[1]>3&&pipeline[bottleneck[0]]>0){
    insights.push({lvl:'warn',ic:'🚦',txt:`<b>${stageLabel[bottleneck[0]]||bottleneck[0]}</b> هي المرحلة الأبطأ — متوسط ${Math.round(bottleneck[1])} يوم لكل أوردر فيها (${pipeline[bottleneck[0]]} أوردر حالياً)`});
  }
  // Stale
  if(staleWithRem.length>=3){
    insights.push({lvl:'warn',ic:'⏰',txt:`<b>${staleWithRem.length} أوردر</b> ما اتحرّكش > 14 يوم وعليهم باقي. الجدول الزمني محتاج متابعة`,act:{label:'افتحهم',fn:`goCollectionFlag('stale')`}});
  }
  // No-cost
  if(noCostOrders.length>=2){
    insights.push({lvl:'bad',ic:'🚫',txt:`<b>${noCostOrders.length} أوردر</b> في تنفيذ/شحن/أرشيف بدون تكلفة مسجّلة — ربحك في الورق وهمي`,act:{label:'صحّحهم',fn:`goCollectionFlag('no-cost')`}});
  }
  // Top performer hint
  if(peakDay&&peakDay.amount>avgOrder*5){
    insights.push({lvl:'good',ic:'🔥',txt:`أعلى يوم تحصيل: <b>${peakDay.date}</b> بـ ${fn(Math.round(peakDay.amount))} ج`});
  }
  // Delivery rate
  if(shipOrds.length>=10&&deliveryRate<80){
    insights.push({lvl:'warn',ic:'🚚',txt:`نسبة تسليم الشحن <b>${deliveryRate}%</b> — أقل من المستهدف. راجع شركات الشحن`});
  }
  if(!insights.length){
    insights.push({lvl:'good',ic:'✅',txt:'كل المؤشرات الأساسية ضمن المعدل الطبيعي للفترة دي'});
  }

  return`
    <!-- 🧠 Insights — برِيفينج تنفيذي مبني على heuristics -->
    <div class="insights-card">
      <div class="insights-hdr">
        <h3>🧠 ملخّص ذكي للإدارة</h3>
        <span class="meta">${elapsedDays} يوم مرّ · ${remainingDays} متبقي</span>
      </div>
      <div class="insights-list">
        ${insights.map(i=>`<div class="insight-row ${i.lvl}">
          <span class="ico">${i.ic}</span>
          <div class="txt">${i.txt}</div>
          ${i.act?`<button class="act" onclick="${i.act.fn}">${i.act.label} ←</button>`:''}
        </div>`).join('')}
      </div>
      <div class="mini-stats">
        <div class="mini-stat"><div class="v" style="color:var(--b)">${ordersWithPrice.length?fn(Math.round(avgOrder))+' ج':'—'}</div><div class="l">متوسط الأوردر</div></div>
        <div class="mini-stat"><div class="v" style="color:var(--g)">${peakDay?fn(Math.round(peakDay.amount))+' ج':'—'}</div><div class="l">أعلى يوم تحصيل${peakDay?' · '+peakDay.date:''}</div></div>
        <div class="mini-stat"><div class="v" style="color:${deliveryRate>=80?'var(--g)':deliveryRate>=60?'var(--y)':'var(--r)'}">${shipOrds.length?deliveryRate+'%':'—'}</div><div class="l">نسبة تسليم الشحن</div></div>
      </div>
    </div>

    <!-- Risk strip — سطر واحد لكل التنبيهات -->
    ${totalRisks?`<div class="risk-strip">
      ${late.length?`<button class="risk-chip" onclick="goCollectionPostDesign()" title="${late.length} أوردر متأخر عن موعد التسليم"><span class="ic">🚨</span><b>${late.length}</b><span>متأخر</span></button>`:''}
      ${staleWithRem.length?`<button class="risk-chip warn" onclick="goCollectionFlag('stale')" title="بدون حركة > 14 يوم وعليه باقي · ${fn(staleWithRem.reduce((s,o)=>s+calcRem(o),0))} ج"><span class="ic">⏰</span><b>${staleWithRem.length}</b><span>راكد</span></button>`:''}
      ${noCostOrders.length?`<button class="risk-chip danger" onclick="goCollectionFlag('no-cost')" title="مرحلة متقدمة بدون تكلفة مسجّلة"><span class="ic">🚫</span><b>${noCostOrders.length}</b><span>بدون تكلفة</span></button>`:''}
      ${supDue>0?`<button class="risk-chip warn" title="مستحق للموردين"><span class="ic">🏭</span><b>${fn(supDue)}</b><span>للموردين</span></button>`:''}
    </div>`:''}

    <!-- Hero KPIs — 4 أرقام أساسية للمدير -->
    <div class="kpi-grid">
      <div class="kpi-box" title="إجمالي رصيد المحافظ الآن">
        <div class="kpi-val" style="color:var(--p)"><span data-counter="${cashOnHand}" data-suffix=" ج">${fn(cashOnHand)} ج</span></div>
        <div class="kpi-lbl">💼 الكاش في الخزينة</div>
        <div style="font-size:var(--fs-xs);color:var(--dim2);margin-top:2px;font-weight:var(--fw-bold)">${wallets.length} محفظة</div>
      </div>
      <div onclick="openRevDrawer()" class="clickable" style="cursor:pointer" title="تفاصيل الإيرادات">
        <div class="kpi-box clickable">
          <div class="kpi-val" style="color:var(--g)"><span data-counter="${tot}" data-suffix=" ج">${fn(tot)} ج</span></div>
          <div class="kpi-lbl">↗ محصّل في الفترة</div>
          ${diff(tot,pTot)}
          ${sparkline(totSpark,'var(--g)')}
        </div>
      </div>
      <div onclick="goCollectionPostDesign()" class="clickable" style="cursor:pointer" title="اضغط لعرض الأوردرات اللي وافقت على التصميم ولم تُحصَّل">
        <div class="kpi-box clickable">
          <div class="kpi-val" style="color:var(--y)"><span data-counter="${rem}" data-suffix=" ج">${fn(rem)} ج</span></div>
          <div class="kpi-lbl">⏳ باقي التحصيل</div>
          ${remCritical>0?`<div style="margin-top:6px;padding-top:6px;border-top:1px dashed var(--line);display:flex;justify-content:space-between;align-items:center;font-size:var(--fs-xs);font-weight:var(--fw-extra)"><span style="color:var(--r)">⚠️ <span data-counter="${remCritical}" data-suffix=" ج">${fn(remCritical)} ج</span></span><span style="color:var(--dim2)">بعد التصميم</span></div>`:''}
        </div>
      </div>
      <div onclick="openExpenseDrawer()" class="clickable" style="cursor:pointer" title="تفاصيل المصروفات">
        <div class="kpi-box clickable">
          <div class="kpi-val" style="color:${profit>=0?'var(--g)':'var(--r)'}"><span data-counter="${Math.abs(profit)}" data-suffix=" ج">${profit>=0?'ربح ':'خسارة '}${fn(Math.abs(profit))} ج</span></div>
          <div class="kpi-lbl">${profit>=0?'💹 الربح الصافي':'📉 الخسارة الصافية'}</div>
          ${diff(profit,pProfit)}
          ${sparkline(costSpark,'var(--r)')}
        </div>
      </div>
    </div>

    <!-- Pipeline strip — مرحلة واحدة لكل تبويب -->
    <div class="pipe-strip">
      <div class="pipe-strip-hdr">🏗️ Pipeline — ${f.length} أوردر في الفترة</div>
      <div class="pipe-row">
        ${Object.entries(pipeline).map(([s,n])=>{
          const pct=Math.round(n/Math.max(f.length,1)*100);
          return`<div class="pipe-cell" style="cursor:pointer" onclick="switchTab('collection');setTimeout(()=>filterByStage('${s}'),60)" title="${pct}% من إجمالي الفترة">
            <div class="pipe-stage-lbl">${stageLabel[s]}</div>
            <div class="pipe-stage-num">${n}</div>
            <div class="pipe-stage-bar"><div style="width:${n/pipelineMax*100}%;background:var(--b)"></div></div>
          </div>`;
        }).join('')}
      </div>
    </div>

    <!-- Top 5 debtors — قرار يومي للمدير -->
    ${topDebtors.length?`<div class="chart-wrap">
      <div class="chart-title" style="display:flex;justify-content:space-between;align-items:center"><span>🔝 أكبر 5 عملاء عليهم باقي</span><button class="d-btn" style="font-size:var(--fs-sm);padding:4px 10px" onclick="switchTab('collection')">عرض الكل ←</button></div>
      ${topDebtors.map(c=>{
        const safe=(c.name||'').replace(/'/g,"\\'");
        return`<div onclick="focusClient('${safe}');setTimeout(()=>switchTab('collection'),60)" style="display:flex;justify-content:space-between;align-items:center;padding:8px 6px;border-bottom:1px solid var(--line);cursor:pointer" title="اضغط لعرض أوردراته">
          <div>
            <div class="txt-bold-md">${c.name}</div>
            <div class="txt-meta-xs">${c.phone||'—'} · ${c.count} أوردر</div>
          </div>
          <div style="font-size:15px;font-weight:var(--fw-heavy);color:var(--r);white-space:nowrap">${fn(c.rem)} ج</div>
        </div>`;
      }).join('')}
    </div>`:''}

    <!-- Details (مطوي افتراضياً) -->
    <details class="more-details">
      <summary>📊 المزيد من التفاصيل والمخططات</summary>

      <!-- 📍 توزيع جغرافي -->
      ${geoTop.length?`<div class="chart-wrap">
        <div class="chart-title">📍 توزيع الأوردرات بالمحافظات (Top ${geoTop.length})</div>
        <div class="geo-list">
          ${geoTop.map(([g,n])=>`<div class="geo-row">
            <div class="name">${g}</div>
            <div class="track"><div class="fill" style="width:${n/geoMax*100}%"></div></div>
            <div class="num">${n} أوردر</div>
          </div>`).join('')}
        </div>
      </div>`:''}

      <!-- 🚦 اختناقات الإنتاج — متوسط المكوث في كل مرحلة -->
      <div class="chart-wrap">
        <div class="chart-title">🚦 اختناقات الإنتاج — متوسط المكوث في كل مرحلة</div>
        ${Object.entries(stageDwell).filter(([,arr])=>arr.length).map(([s,arr])=>{
          const avg=stageAvg[s]||0;const cnt=arr.length;
          const isWorst=bottleneck&&bottleneck[0]===s;
          const cl=avg>=5?'var(--r)':avg>=3?'var(--y)':'var(--g)';
          return`<div class="compare-row">
            <span>${stageLabel[s]||s}${isWorst?' 🚦':''} <span class="txt-meta-sm">(${cnt} أوردر)</span></span>
            <span style="color:${cl};font-weight:var(--fw-heavy)">${avg.toFixed(1)} يوم</span>
          </div>`;
        }).join('')||'<div style="text-align:center;padding:14px;color:var(--dim2);font-size:var(--fs-base)">مفيش بيانات كفاية</div>'}
      </div>

      <!-- رسم بياني شهري -->
      ${monthlyChart()}

      <!-- مقارنة تفصيلية -->
      <div class="chart-wrap">
        <div class="chart-title">📊 مقارنة بالفترة السابقة</div>
        <div class="compare-row"><span>محصّل فعلاً</span><div style="display:flex;gap:var(--space-md)"><span style="color:var(--g);font-weight:var(--fw-extra)">${fn(tot)} ج</span><span style="color:var(--dim2)">${fn(pTot)} ج</span></div></div>
        <div class="compare-row"><span>قيمة الأوردرات</span><div style="display:flex;gap:var(--space-md)"><span style="color:var(--b);font-weight:var(--fw-extra)">${fn(ordersTotal)} ج</span><span style="color:var(--dim2)">—</span></div></div>
        <div class="compare-row"><span>المصروفات الفعلية</span><div style="display:flex;gap:var(--space-md)"><span style="color:var(--r);font-weight:var(--fw-extra)">${fn(costs)} ج</span><span style="color:var(--dim2)">${fn(pCosts)} ج</span></div></div>
        <div class="compare-row"><span>${profit>=0?'الربح':'الخسارة'}</span><div style="display:flex;gap:var(--space-md)"><span style="color:${profit>=0?'var(--g)':'var(--r)'};font-weight:var(--fw-extra)">${profit>=0?'ربح ':'خسارة '}${fn(Math.abs(profit))} ج</span><span style="color:var(--dim2)">${pProfit>=0?'ربح ':'خسارة '}${fn(Math.abs(pProfit))} ج</span></div></div>
      </div>

      <!-- Heatmap: نشاط الأوردرات آخر 60 يوم -->
      <div class="chart-wrap">
        <div class="chart-title" style="display:flex;justify-content:space-between;align-items:center"><span>🗓️ نشاط الأوردرات — آخر 60 يوم</span><span style="font-size:var(--fs-xs);color:var(--dim2);font-weight:var(--fw-bold)">من الأقدم → الأحدث</span></div>
        <div class="hm-grid">
          ${hm.map((v,i)=>{
            const d=new Date();d.setDate(d.getDate()-(hmDays-1-i));
            const lvl=v===0?0:v/hmMax;
            const color=lvl===0?'var(--bg3)':lvl<.25?'rgba(0,217,126,.25)':lvl<.5?'rgba(0,217,126,.5)':lvl<.75?'rgba(0,217,126,.75)':'var(--g)';
            return `<div class="hm-cell" style="background:${color}" title="${d.toLocaleDateString('ar-EG')}: ${v} أوردر"></div>`;
          }).join('')}
        </div>
      </div>

      <!-- Daily close — حركة المحافظ آخر 7 أيام -->
      ${wallSorted.length?`
      <div class="chart-wrap">
        <div class="chart-title">💼 الإقفال اليومي — آخر 7 أيام</div>
        <div style="overflow-x:auto">
        <table class="dc-table">
          <thead><tr>
            <th style="text-align:right">المحفظة</th>
            ${[...Array(7).keys()].map(i=>{const d=new Date();d.setDate(d.getDate()-(6-i));return `<th>${d.toLocaleDateString('ar-EG',{day:'2-digit',month:'2-digit'})}</th>`;}).join('')}
            <th>داخل</th><th>خارج</th><th>صافي</th>
          </tr></thead>
          <tbody>
          ${wallSorted.map(w=>{
            const d=dailyByWallet[w._id];if(!d||(d.inSum===0&&d.outSum===0))return'';
            const net=d.inSum-d.outSum;
            return`<tr>
              <td style="text-align:right;font-weight:var(--fw-extra)">${w.name}</td>
              ${d.inDays.map((v,i)=>{const o=d.outDays[i];const n=v-o;const cl=n>0?'var(--g)':n<0?'var(--r)':'var(--dim2)';return `<td style="color:${cl}">${n===0?'·':fn(n)}</td>`;}).join('')}
              <td style="color:var(--g);font-weight:var(--fw-extra)">${fn(d.inSum)}</td>
              <td style="color:var(--r);font-weight:var(--fw-extra)">${fn(d.outSum)}</td>
              <td style="color:${net>=0?'var(--g)':'var(--r)'};font-weight:var(--fw-heavy)">${fn(net)}</td>
            </tr>`;
          }).join('')||`<tr><td colspan="11" style="text-align:center;color:var(--dim2);padding:14px">لا توجد حركة في آخر 7 أيام</td></tr>`}
          </tbody>
        </table>
        </div>
      </div>`:''}

      <!-- Filter presets -->
      <div class="chart-wrap" style="display:flex;gap:var(--space-sm);align-items:center;flex-wrap:wrap">
        <span style="font-size:var(--fs-sm);color:var(--dim2);font-weight:var(--fw-extra)">⭐ اختصاراتي:</span>
        ${presets.length?presets.map((p,i)=>`<div style="display:inline-flex;align-items:center;gap:var(--space-xs)"><button class="d-btn" onclick="applyPreset(${i})">${p.name}</button><button onclick="deletePreset(${i})" style="border:none;background:none;color:var(--dim2);cursor:pointer;font-size:var(--fs-lg);padding:0 2px" title="حذف">✕</button></div>`).join(''):'<span class="txt-meta-sm">مفيش اختصارات محفوظة بعد</span>'}
        <button class="d-btn" onclick="savePresetPrompt()" style="border-color:rgba(0,217,126,.4);color:var(--g);background:rgba(0,217,126,.06)">💾 احفظ الحالة الحالية</button>
      </div>
    </details>`;
}
