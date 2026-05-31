/**
 * Byte-identical verification for Phase 3B (renderList HTML extraction).
 *
 * Builds a REFERENCE renderer by extracting the ORIGINAL template text from
 * `git HEAD:employees.html` (the proven-working inline templates) and wrapping
 * it in Functions — then runs it alongside the NEW builders on identical mock
 * datasets covering every branch, and asserts the output is BYTE-IDENTICAL.
 *
 * Run: node tests/employees-board-byte-identical.mjs
 */
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  buildEmployeeCardHTML, buildEmployeesEmptyHTML, buildEmployeesPagerHTML,
} from '../features/employees/views/render-employees-board.js';

const sha = s => createHash('sha256').update(s, 'utf8').digest('hex');

// ── Extract the ORIGINAL templates from git HEAD (non-circular reference) ──
const head = execSync('git show HEAD:employees.html', { encoding: 'utf8' });
const L = head.split('\n'); // 1-indexed access via L[n-1]
const slice = (a, b) => L.slice(a - 1, b).join('\n');

// Original card per-employee logic + return template = lines 1066–1195
const cardBody = slice(1066, 1195);
// Original empty branch templates (the strings only) = lines 1025 / 1031
const emptyB1 = head.match(/el\.innerHTML=`(<div class="empty-cta">\n {10}<div class="empty-icon">🔍[\s\S]*?<\/div>)`;/)[1];
const emptyB2 = head.match(/el\.innerHTML=`(<div class="empty-cta">\n {10}<div class="empty-icon">👥[\s\S]*?<\/div>)`;/)[1];
// Original pager ternary expression = lines 1196–1218 (strip leading `}).join('')}</div>$` and trailing `;`)
const pagerSrc = slice(1196, 1218).replace(/^\s*\}\)\.join\(''\)\}<\/div>\$\{/, '').replace(/\}`;\s*$/, '');

// Build reference Functions with the SAME free variables the originals used.
const refCard = new Function(
  'e','paidEmpIds','attendedToday','todayAttMap','attendedInPeriod','activeOrdsAll',
  'periodOrders','allOrders','lastActivityMap','periodFilter','pLbl',
  'ROLES','calcKpi','getEmpStatus','nameToColor','fn','escAttr',
  cardBody,
);
const refEmptyB1 = new Function('sug','hasFilter','escAttr', 'return `' + emptyB1 + '`;');
const refEmptyB2 = new Function('return `' + emptyB2 + '`;');
const refPager = new Function('currentPage','totalPages','pageStart','PAGE_SIZE','data', 'return ' + pagerSrc + ';');

// ── Shared mock helpers (same instances passed to BOTH new and reference) ──
const ROLES = {
  graphic_designer:{label:'مصمم',col:'#a78bfa',ico:'🎨'},
  design_operator:{label:'مشغل',col:'#a78bfa',ico:'⚙️'},
  customer_service:{label:'خدمة',col:'#10c4de',ico:'💬'},
  production_agent:{label:'تنفيذ',col:'#ffaa00',ico:'🏭'},
  shipping_officer:{label:'شحن',col:'#00d97e',ico:'🚚'},
  admin:{label:'Admin',col:'#ff3d6e',ico:'👑'},
};
const calcKpi = (e,uid)=> (e._id.charCodeAt(e._id.length-1) % 100); // deterministic
const getEmpStatus = (uid,empId,todayRec,cnt)=>({label:'يعمل',col:'#00d97e',bg:'rgba(0,217,126,.12)'});
const nameToColor = name => '#'+((name||'').length*111111%0xffffff).toString(16).padStart(6,'0');
const fn = n => (parseFloat(n)||0).toLocaleString('ar-EG');
const escAttr = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// ── Mock dataset covering all branches ──
const mk = (id,role,status,extra={}) => ({_id:id,name:`موظف ${id}`,role,status,phone:extra.phone??'01012345678',baseSalary:3000,authUid:'auth-'+id,commissionPct:extra.commissionPct??5,...extra});
const employees = [
  mk('e1','graphic_designer','active'),                       // active, designer, commission>0
  mk('e2','graphic_designer','active',{commissionPct:0}),     // commission=0
  mk('e3','customer_service','active',{phone:''}),            // no phone → no tel/wa
  mk('e4','production_agent','inactive'),                     // inactive → no ring/att
  mk('e5','shipping_officer','active'),                       // shipping
  mk("e6'x",'admin','active'),                                // admin (no perf) + apostrophe in id (escAttr)
];
const allOrders = [
  {_id:'o1',designerId:'auth-e1',stage:'printing',salePrice:1000,createdBy:'auth-e3',clientName:'ع'},
  {_id:'o2',productionAgent:'auth-e4',stage:'shipping',salePrice:500,createdBy:'auth-e3',clientPhone:'p1'},
  {_id:'o3',shippingOfficerId:'auth-e5',stage:'archived',salePrice:0},
];
const paidEmpIds = new Set(['e1','e5']);                      // e1,e5 paid; rest unpaid
const attendedToday = new Set(['e1','auth-e1','e2']);
const todayAttMap = new Map([
  ['auth-e1',{checkInStr:'09:00',checkOutStr:'17:00'}],       // checkin+checkout
  ['e2',{checkInStr:'09:30'}],                                // checkin only
]);
const attendedInPeriod = {e1:22,'auth-e1':22,e2:11,e3:5};
const activeOrdsAll = allOrders;
const periodOrders = allOrders;
const lastActivityMap = new Map([['موظف e1',{action:'صمّم كارت',date:'2026-05-20',clientName:'ع'}]]);

const cardCtx = { paidEmpIds, attendedToday, todayAttMap, attendedInPeriod, activeOrdsAll,
  periodOrders, allOrders, lastActivityMap, periodFilter:'month_cur', pLbl:'مايو',
  ROLES, calcKpi, getEmpStatus, nameToColor, fn, escAttr };

let fails = 0;
function eq(label, a, b){
  if (sha(a) === sha(b)) { console.log(`  ✅ ${label}`); }
  else {
    fails++; console.log(`  ❌ ${label} — MISMATCH`);
    // show first differing line
    const al=a.split('\n'), bl=b.split('\n');
    for(let i=0;i<Math.max(al.length,bl.length);i++){ if(al[i]!==bl[i]){ console.log(`     line ${i}:\n     NEW: ${JSON.stringify(al[i])}\n     OLD: ${JSON.stringify(bl[i])}`); break; } }
  }
}

console.log('── CARD builders (per employee, 2 periodFilter values) ──');
for (const pf of ['month_cur','all']) {
  const ctx = { ...cardCtx, periodFilter: pf };
  for (const e of employees) {
    const nw = buildEmployeeCardHTML(e, ctx);
    const old = refCard(e, paidEmpIds, attendedToday, todayAttMap, attendedInPeriod, activeOrdsAll,
      periodOrders, allOrders, lastActivityMap, pf, 'مايو', ROLES, calcKpi, getEmpStatus, nameToColor, fn, escAttr);
    eq(`card ${e._id} [periodFilter=${pf}]`, nw, old);
  }
}

console.log('── EMPTY states ──');
eq('empty: results+filter+suggestion', buildEmployeesEmptyHTML({hasEmployees:true,hasFilter:true,sug:"محمد's",escAttr}), refEmptyB1("محمد's",true,escAttr));
eq('empty: results+filter, no suggestion', buildEmployeesEmptyHTML({hasEmployees:true,hasFilter:true,sug:null,escAttr}), refEmptyB1(null,true,escAttr));
eq('empty: results, no filter, no suggestion', buildEmployeesEmptyHTML({hasEmployees:true,hasFilter:false,sug:null,escAttr}), refEmptyB1(null,false,escAttr));
eq('empty: no employees', buildEmployeesEmptyHTML({hasEmployees:false,hasFilter:false,sug:null,escAttr}), refEmptyB2());

console.log('── PAGER (various page counts incl. dots logic) ──');
for (const [cur,total] of [[1,1],[1,3],[2,3],[1,10],[5,10],[10,10],[4,8]]) {
  const pageStart=(cur-1)*20, dataLength=total*20;
  const nw = buildEmployeesPagerHTML({currentPage:cur,totalPages:total,pageStart,PAGE_SIZE:20,dataLength});
  const old = refPager(cur,total,pageStart,20,{length:dataLength});
  eq(`pager cur=${cur} total=${total}`, nw, old);
}

console.log('── FULL BOARD composition (grid + cards + pager) ──');
const pageData = employees;
const composeNew = '<div class="emp2-cards-grid">'+pageData.map(e=>buildEmployeeCardHTML(e,cardCtx)).join('')+'</div>'+buildEmployeesPagerHTML({currentPage:1,totalPages:2,pageStart:0,PAGE_SIZE:20,dataLength:30});
const composeOld = '<div class="emp2-cards-grid">'+pageData.map(e=>refCard(e,paidEmpIds,attendedToday,todayAttMap,attendedInPeriod,activeOrdsAll,periodOrders,allOrders,lastActivityMap,'month_cur','مايو',ROLES,calcKpi,getEmpStatus,nameToColor,fn,escAttr)).join('')+'</div>'+refPager(1,2,0,20,{length:30});
eq('full board', composeNew, composeOld);

console.log('');
if (fails) { console.log(`❌ ${fails} MISMATCH(es) — NOT byte-identical`); process.exit(1); }
console.log('✅✅✅ ALL BYTE-IDENTICAL — extraction verified');
