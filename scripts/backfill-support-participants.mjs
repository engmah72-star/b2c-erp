/**
 * scripts/backfill-support-participants.mjs
 *
 * HOTFIX migration — يعالج محادثات العملاء «اليتيمة» المخزّنة قبل الإصلاح.
 *
 * المشكلة (Critical): محادثات الدعم (csupport_*) أُنشئت بـ participants=[client]
 * فقط — بلا أي موظف. النتيجة: رسائل العملاء مكتوبة في Firestore لكنها غير مرئية
 * لأي موظف (الـ inbox مفلتر بـ participants) ولا يمكن الردّ عليها.
 *
 * بتعمل إيه؟ (idempotent — آمنة للتكرار):
 *   1) تحدّد CS pool: من --agents=uid1,uid2  أو من users حيث
 *      role ∈ [customer_service, admin, operation_manager].
 *   2) تكتب/تدمج الإعداد المركزي master_lists/support_agents = { uids }
 *      (إلا مع --no-config) — مصدر الحقيقة الذي يقرأه clientActions مستقبلاً.
 *   3) تُدمج (arrayUnion) موظفي الـ pool في participants لكل محادثة عميل
 *      (isClientThread==true) لا تحتويهم — فتظهر فوراً في inbox الموظفين.
 *
 * **أداة سيرفر-سايد فقط** (Firebase Admin SDK يتجاوز firestore.rules).
 * ─────────────────────────────────────────────────────────────────────
 * التشغيل:
 *   export GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
 *   node scripts/backfill-support-participants.mjs --dry-run        # عرض فقط
 *   node scripts/backfill-support-participants.mjs                  # اشتقاق الـ agents من users
 *   node scripts/backfill-support-participants.mjs --agents=uidA,uidB
 *   node scripts/backfill-support-participants.mjs --no-config      # backfill بدون كتابة الإعداد
 *
 * المعاملات:
 *   --agents=a,b   حدّد uids الموظفين يدوياً (يتخطى الاشتقاق من users)
 *   --no-config    لا تكتب master_lists/support_agents
 *   --dry-run      لا تكتب — اعرض ما سيحدث فقط
 */

import admin from 'firebase-admin';

const AGENT_ROLES = ['customer_service', 'admin', 'operation_manager'];

function parseArgs(argv) {
  const out = { agents: [], noConfig: false, dryRun: false };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--no-config') out.noConfig = true;
    else if (a.startsWith('--agents=')) out.agents = a.slice(9).split(',').map(s => s.trim()).filter(Boolean);
  }
  return out;
}

async function deriveAgents(db) {
  const snap = await db.collection('users').where('role', 'in', AGENT_ROLES).get();
  const uids = [];
  snap.forEach(d => {
    const u = d.data();
    if (u.isActive === false) return; // تخطَّ المعطّلين
    uids.push(d.id);
  });
  return [...new Set(uids)];
}

export async function backfill(db, opts) {
  const log = (...m) => console.log('[backfill-support]', ...m);

  // 1) determine CS pool
  let agents = opts.agents;
  if (!agents.length) {
    agents = await deriveAgents(db);
    log(`اشتُقَّ ${agents.length} موظفاً من users (roles: ${AGENT_ROLES.join('/')})`);
  } else {
    log(`agents مُمرَّرون يدوياً: ${agents.length}`);
  }
  if (!agents.length) throw new Error('لا يوجد موظفو دعم — مرّر --agents أو أضِف users بأدوار CS/admin/ops');
  log('CS pool uids:', agents.join(', '));

  // 2) write central config
  if (!opts.noConfig) {
    if (opts.dryRun) log('DRY-RUN — master_lists/support_agents (لن يُكتب):', { uids: agents });
    else {
      await db.collection('master_lists').doc('support_agents').set({
        uids: agents,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: 'backfill-support-participants',
      }, { merge: true });
      log('✓ كُتب master_lists/support_agents');
    }
  }

  // 3) heal orphaned client threads
  const snap = await db.collection('conversations').where('isClientThread', '==', true).get();
  let scanned = 0, healed = 0, alreadyOk = 0;
  for (const docSnap of snap.docs) {
    scanned++;
    const cur = docSnap.data().participants || [];
    const missing = agents.filter(a => !cur.includes(a));
    if (!missing.length) { alreadyOk++; continue; }
    if (opts.dryRun) {
      log(`DRY-RUN — ${docSnap.id}: +[${missing.join(', ')}] (participants ${cur.length}→${cur.length + missing.length})`);
    } else {
      await docSnap.ref.update({ participants: admin.firestore.FieldValue.arrayUnion(...missing) });
    }
    healed++;
  }
  log(`✓ المحادثات: مفحوصة=${scanned} · مُعالَجة=${healed} · سليمة سابقاً=${alreadyOk}`);
  return { agents, scanned, healed, alreadyOk, dryRun: !!opts.dryRun };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const opts = parseArgs(process.argv.slice(2));
  if (!admin.apps.length) admin.initializeApp(); // GOOGLE_APPLICATION_CREDENTIALS
  const db = admin.firestore();
  console.log('[backfill-support] بدء', opts.dryRun ? '· DRY-RUN' : '');
  backfill(db, opts)
    .then(r => { console.log('[backfill-support] ✅ تم:', r); process.exit(0); })
    .catch(e => { console.error('[backfill-support] ❌', e.message); process.exit(1); });
}
