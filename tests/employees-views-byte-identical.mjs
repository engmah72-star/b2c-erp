/**
 * Byte-identical verification for Phase 3C (employees.html view extraction).
 *
 * Extracts the ORIGINAL inline template text from `git HEAD:employees.html`
 * (the proven-working markup) and wraps it in Functions — then runs it alongside
 * the NEW builders on identical mock datasets covering every branch, and asserts
 * the output is BYTE-IDENTICAL.
 *
 * Covers: skeleton, team-alerts banner, KPI panel (hdr + body, admin/non-admin,
 * saved-eval/goal/lastAct branches), attendance panel (hdr + empty + populated
 * with various hour thresholds and checkout present/absent), and the two
 * non-financial modal scaffolds (ov-absent-wa + ov-emp + aggregator).
 *
 * Run: node tests/employees-views-byte-identical.mjs
 */
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildEmployeesSkeletonHTML } from '../features/employees/views/render-employees-skeleton.js';
import { buildEmployeesAlertsHTML } from '../features/employees/views/render-employees-alerts.js';
import {
  buildKpiPanelHeaderHTML, buildKpiPanelBodyHTML,
  buildAttPanelHeaderHTML, buildAttPanelEmptyHTML, buildAttPanelBodyHTML,
} from '../features/employees/views/render-employees-drawer.js';
import {
  buildAbsentWaModalHTML, buildEmployeeFormModalHTML, buildAllEmployeeModalsHTML,
} from '../features/employees/views/render-employees-modals.js';

const sha = s => createHash('sha256').update(s, 'utf8').digest('hex');

// ── Extract the ORIGINAL templates from git HEAD (non-circular reference) ──
const head = execSync('git show HEAD:employees.html', { encoding: 'utf8' });
const L = head.split('\n'); // 1-indexed access via L[n-1]
const slice = (a, b) => L.slice(a - 1, b).join('\n');

// Strip `<lhs>.innerHTML=`…`;` wrapper → returns the inner template body text.
const innerTpl = txt => txt.replace(/^[\s\S]*?\.innerHTML=`/, '').replace(/`;\s*$/, '');

// ── SKELETON — const card block (749–761) + return-from-original-template (762) ──
const skeletonCardSrc = slice(749, 761);        // `const card=`…`;`
const skeletonRetTpl = innerTpl(slice(762, 762)); // `<div class="emp2-cards-grid">${card.repeat(6)}</div>`
const refSkeleton = new Function(skeletonCardSrc + '\n  return `' + skeletonRetTpl + '`;');

// ── ALERTS banner — lines 520–538 ──
const alertsTpl = innerTpl(slice(520, 538));
const refAlerts = new Function('visible','dismissedCount','__alertsCollapsed','escAttr',
  'return `' + alertsTpl + '`;');

// ── KPI header — lines 585–588 ──
const kpiHdrTpl = innerTpl(slice(585, 588));
const refKpiHdr = new Function('empName','ROLES','e','mKey', 'return `' + kpiHdrTpl + '`;');

// ── KPI body — axisRow (589–596) + body template (597–640) ──
const axisRowSrc = slice(589, 596); // `const axisRow=(…)=>`…`;`
const kpiBodyTpl = innerTpl(slice(597, 640));
const refKpiBody = new Function(
  'attendance','productivity','quality','total','monthAtt','workDays',
  'scoreCol','scoreLbl','mKey','savedEval','goal','lastAct','isAdmin',
  'empId','empName','e','escAttr',
  axisRowSrc + '\n  return `' + kpiBodyTpl + '`;');

// ── ATT header — line 700 ──
const attHdrTpl = innerTpl(slice(700, 700));
const refAttHdr = new Function('empName', 'return `' + attHdrTpl + '`;');

// ── ATT empty — line 706 ──
const attEmptyTpl = innerTpl(slice(706, 706));
const refAttEmpty = new Function('return `' + attEmptyTpl + '`;');

// ── ATT body — rows (713–726) + body template (727–742) ──
const attRowsSrc = slice(713, 726); // `const rows=recs.slice(0,60).map(…).join('');`
const attBodyTpl = innerTpl(slice(727, 742));
const refAttBody = new Function('recs','totalDays','avgHours','totalHours',
  attRowsSrc + '\n  return `' + attBodyTpl + '`;');

// ── MODALS — exact inline byte ranges ──
const refAbsentWa = slice(122, 138);   // <!-- MODAL: واتساب… --> … </div>
const refEmpForm  = slice(140, 199);   // <!-- MODAL: موظف جديد… --> … </div>
const refAllModals = slice(122, 199);  // both, joined exactly as they sat inline

// ── Shared mock helpers ──
const escAttr = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ROLES = {
  graphic_designer:{label:'مصمم',col:'var(--p)',ico:'🎨'},
  customer_service:{label:'خدمة عملاء',col:'var(--c-bright)',ico:'💬'},
  admin:{label:'Admin',col:'var(--p)',ico:'👑'},
};

let fails = 0;
function eq(label, a, b){
  if (sha(a) === sha(b)) { console.log(`  ✅ ${label}`); }
  else {
    fails++; console.log(`  ❌ ${label} — MISMATCH`);
    const al=a.split('\n'), bl=b.split('\n');
    for(let i=0;i<Math.max(al.length,bl.length);i++){ if(al[i]!==bl[i]){ console.log(`     line ${i}:\n     NEW: ${JSON.stringify(al[i])}\n     OLD: ${JSON.stringify(bl[i])}`); break; } }
  }
}

// ════════════════ SKELETON ════════════════
console.log('── SKELETON (no inputs) ──');
eq('skeleton grid', buildEmployeesSkeletonHTML(), refSkeleton());

// ════════════════ ALERTS ════════════════
console.log('── ALERTS banner (collapsed × dismissed × multi-type) ──');
const alertSets = [
  // single noatt, expanded, no dismissed
  { visible:[{key:'noatt:e1',ico:'💤',col:'var(--dim2)',msg:'محمد — لم يسجل حضور اليوم',sub:'مصمم'}], dismissedCount:0, collapsed:false },
  // multiple types, collapsed, with dismissed
  { visible:[
      {key:'noatt:e1',ico:'💤',col:'var(--dim2)',msg:"عمر's — لم يسجل حضور",sub:'خدمة عملاء'},
      {key:'late:e2',ico:'⏰',col:'var(--r)',msg:'سارة — 3 أوردر متأخر',sub:'تنفيذ'},
      {key:'pressure:e3',ico:'🔥',col:'var(--y)',msg:'علي — ضغط: 5 أوردر نشط',sub:'شحن'},
    ], dismissedCount:2, collapsed:true },
  // >8 visible (slice cap), expanded, dismissed
  { visible:Array.from({length:11},(_,i)=>({key:'k'+i,ico:'⏰',col:'var(--r)',msg:'م'+i,sub:'s'+i})), dismissedCount:1, collapsed:false },
];
alertSets.forEach((s,i)=>{
  eq(`alerts set ${i} (collapsed=${s.collapsed},dismissed=${s.dismissedCount},n=${s.visible.length})`,
    buildEmployeesAlertsHTML({ visible:s.visible, dismissedCount:s.dismissedCount, collapsed:s.collapsed, escAttr }),
    refAlerts(s.visible, s.dismissedCount, s.collapsed, escAttr));
});

// ════════════════ KPI PANEL ════════════════
console.log('── KPI header ──');
[
  { empName:'محمد', e:{role:'graphic_designer'}, mKey:'2026-05' },
  { empName:"عمر's", e:{role:'unknown_role'}, mKey:'2026-05' }, // role fallback (ROLES[..]?.label||e.role)
].forEach((c,i)=>{
  const roleLabel = ROLES[c.e.role]?.label || c.e.role;
  eq(`kpi hdr ${i}`,
    buildKpiPanelHeaderHTML({ empName:c.empName, roleLabel, mKey:c.mKey }),
    refKpiHdr(c.empName, ROLES, c.e, c.mKey));
});

console.log('── KPI body (admin/non-admin × eval/goal/lastAct × score colors) ──');
const savedEvalFull = {
  savedAt:{ toDate:()=>({ toLocaleDateString:()=>'٢٠٢٦/٥/٣' }) },
  managerRating:4, managerNote:'ملاحظة المدير', kpiScore:88,
};
const savedEvalNoRating = { savedAt:null, managerRating:0, managerNote:'', kpiScore:55 };
const goalFull = { targets:{ attendanceDays:22, ordersTarget:10, qualityPct:80 } };
const goalEmpty = { targets:{} };
const lastAct = { action:'صمّم كارت', clientName:'عميل أ', date:'2026-05-20' };

const kpiCases = [
  // admin + saved eval + goal + lastAct, high score (green)
  { attendance:33,productivity:38,quality:24,total:95,monthAtt:22,workDays:24,
    scoreCol:'var(--g)',scoreLbl:'ممتاز ⭐',mKey:'2026-05',savedEval:savedEvalFull,goal:goalFull,lastAct,isAdmin:true,
    empId:'e1',empName:'محمد',e:{role:'graphic_designer'} },
  // admin + no eval + empty goal + no lastAct, mid score (blue)
  { attendance:25,productivity:30,quality:20,total:75,monthAtt:18,workDays:24,
    scoreCol:'var(--b)',scoreLbl:'جيد 👍',mKey:'2026-05',savedEval:null,goal:goalEmpty,lastAct:null,isAdmin:true,
    empId:"e2'x",empName:"عمر's",e:{role:'customer_service'} },
  // non-admin + saved eval (with rating+note), low score (red)
  { attendance:10,productivity:12,quality:8,total:35,monthAtt:6,workDays:24,
    scoreCol:'var(--r)',scoreLbl:'خطر 🔴',mKey:'2026-05',savedEval:savedEvalFull,goal:goalEmpty,lastAct,isAdmin:false,
    empId:'e3',empName:'سارة',e:{role:'production_agent'} },
  // non-admin + saved eval without rating/note, yellow score
  { attendance:18,productivity:22,quality:14,total:60,monthAtt:12,workDays:24,
    scoreCol:'var(--y)',scoreLbl:'يحتاج متابعة ⚠️',mKey:'2026-05',savedEval:savedEvalNoRating,goal:goalEmpty,lastAct:null,isAdmin:false,
    empId:'e4',empName:'علي',e:{role:'shipping_officer'} },
  // non-admin + NO saved eval (saved-box branch absent)
  { attendance:20,productivity:25,quality:15,total:65,monthAtt:14,workDays:24,
    scoreCol:'var(--y)',scoreLbl:'يحتاج متابعة ⚠️',mKey:'2026-05',savedEval:null,goal:goalEmpty,lastAct:null,isAdmin:false,
    empId:'e5',empName:'ندى',e:{role:'graphic_designer'} },
];
kpiCases.forEach((c,i)=>{
  eq(`kpi body ${i} (admin=${c.isAdmin},eval=${!!c.savedEval},goal=${!!(c.goal?.targets?.attendanceDays)},lastAct=${!!c.lastAct})`,
    buildKpiPanelBodyHTML({ ...c, escAttr }),
    refKpiBody(c.attendance,c.productivity,c.quality,c.total,c.monthAtt,c.workDays,
      c.scoreCol,c.scoreLbl,c.mKey,c.savedEval,c.goal,c.lastAct,c.isAdmin,
      c.empId,c.empName,c.e,escAttr));
});

// ════════════════ ATTENDANCE PANEL ════════════════
console.log('── ATT header ──');
['محمد',"عمر's & co"].forEach((n,i)=>{
  eq(`att hdr ${i}`, buildAttPanelHeaderHTML({ empName:n }), refAttHdr(n));
});

console.log('── ATT empty branch ──');
eq('att empty', buildAttPanelEmptyHTML(), refAttEmpty());

console.log('── ATT body (hour thresholds × checkout present/absent) ──');
const recs = [
  { date:'2026-05-20', checkInStr:'09:00', checkOutStr:'17:30', hoursWorked:8.5 }, // h>=8 green, checkout present
  { date:'2026-05-19', checkInStr:'09:30', checkOutStr:'15:30', hoursWorked:6 },   // h>=6 yellow
  { date:'2026-05-18', checkInStr:'10:00', hoursWorked:4 },                        // h<6 red, no checkout
  { date:'2026-05-17', checkInStr:'', hoursWorked:0 },                             // 0 hours, no checkin str
];
const totalDays = recs.length;
const totalHours = recs.reduce((s,a)=>s+(parseFloat(a.hoursWorked)||0),0);
const avgHours = totalDays?(totalHours/totalDays).toFixed(1):0;
eq('att body (populated)',
  buildAttPanelBodyHTML({ recs, totalDays, avgHours, totalHours }),
  refAttBody(recs, totalDays, avgHours, totalHours));

// single-record edge (avg formatting, rounding)
const recs2 = [{ date:'2026-05-01', checkInStr:'08:00', checkOutStr:'16:15', hoursWorked:8.25 }];
const td2=recs2.length, th2=8.25, av2=(th2/td2).toFixed(1);
eq('att body (single rec)',
  buildAttPanelBodyHTML({ recs:recs2, totalDays:td2, avgHours:av2, totalHours:th2 }),
  refAttBody(recs2, td2, av2, th2));

// ════════════════ MODALS ════════════════
console.log('── MODALS (static scaffold) ──');
eq('modal: ov-absent-wa', buildAbsentWaModalHTML(), refAbsentWa);
eq('modal: ov-emp form', buildEmployeeFormModalHTML(), refEmpForm);
eq('modal: aggregator (both, inline-equivalent)', buildAllEmployeeModalsHTML(), refAllModals);

console.log('');
if (fails) { console.log(`❌ ${fails} MISMATCH(es) — NOT byte-identical`); process.exit(1); }
console.log('✅✅✅ ALL BYTE-IDENTICAL — extraction verified');
