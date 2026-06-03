/**
 * scripts/reset-app-data.mjs
 *
 * أداة **تصفير بيانات الأبلكيشن** (Data Reset — server-side, Firebase Admin SDK).
 *
 * الغرض: إفراغ الـ Firestore collections للبدء "من الصفر" مع الاحتفاظ بالكود
 * والإعدادات والمستخدمين (افتراضياً) — أو محو كل شيء حتى المستخدمين عند الطلب
 * الصريح. لا تلمس الكود ولا firestore.rules ولا Storage.
 *
 * ⚠️  عملية **غير قابلة للتراجع**. خذ نسخة احتياطية (Firestore export) أولاً:
 *        gcloud firestore export gs://<bucket>/backup-$(date +%F)
 *
 * ─────────────────────────────────────────────────────────────────────
 * الأمان (طبقات متعددة — لا حذف بالغلط):
 *   1) **DRY-RUN افتراضي** — بدون DRY_RUN=false لا يُحذف أي شيء (عدّ فقط).
 *   2) **تأكيد مزدوج** — التشغيل الحقيقي يتطلب `--confirm=<projectId>` مطابقاً
 *      لمعرّف مشروع الـ Admin SDK الفعلي، وإلا يرفض.
 *   3) **نطاق صريح** — يحذف فقط مجموعات الـ collections المختارة (--scope).
 *      الافتراضي يحفظ المستخدمين/الموظفين والإعدادات وقوائم النظام.
 *   4) **حفظ حساب** — `--keep-uid=` / `--keep-email=` يستثني مستخدماً من
 *      الحذف (حتى لا تُقفل نفسك خارج النظام عند تصفير المستخدمين).
 *
 * ─────────────────────────────────────────────────────────────────────
 * النطاقات (Scopes) — مجموعات collections:
 *   operational : orders, clients, suppliers, supplier_orders, returns_tickets,
 *                 shipping_returns, payment_requests, reconciliations,
 *                 design_items, tasks, conversations, comments,
 *                 client_followups, client_segments, client_decisions,
 *                 gallery, stories
 *   financial   : wallets, transactions_v2, financial_ledger,
 *                 employee_payments, supplier_payments, shipping_settlements
 *   hr          : attendance, employee_goals, employee_evaluations,
 *                 employee_incidents, employee_leaves
 *   logs        : audit_logs, notifications, admin_alerts, whatsapp_logs,
 *                 backup_logs, migration_logs, error_reports, drift_reports,
 *                 daily_stats, action_telemetry, rfm_runs, forecasts,
 *                 product_affinities, impersonation_audit, partner_logins,
 *                 presence, fcm_tokens
 *   config      : master_lists, shipping_pricing, settings, tenants
 *   identity    : users, employees   ← الأخطر (يحذف الحسابات والصلاحيات)
 *
 *   presets:
 *     all        = operational + financial + hr + logs
 *                  (بدء تشغيل جديد للأعمال — يحفظ الفريق والإعدادات وقوائم النظام)
 *     everything = all + config + identity   (تصفير كامل حتى المستخدمين)
 *
 * ملاحظة: حذف مستند المحادثة لا يحذف رسائلها الفرعية (conversations/{id}/messages)
 * إلا لو الـ Admin SDK يوفّر recursiveDelete (الإصدارات الحديثة) — وهو ما تستخدمه
 * هذه الأداة تلقائياً عند توفّره؛ غير ذلك تُحذف المستندات الأب فقط في دفعات.
 *
 * ─────────────────────────────────────────────────────────────────────
 * التشغيل:
 *   1) ثبّت firebase-admin (لو مش متثبّت في الجذر):  npm install firebase-admin
 *   2) هيّئ بيانات الـ service account:
 *        export GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
 *   3) جرّب أولاً (DRY-RUN — عدّ فقط، بلا حذف):
 *        node scripts/reset-app-data.mjs --scope=all
 *   4) نفّذ فعلياً (تأكيد مزدوج إلزامي):
 *        DRY_RUN=false node scripts/reset-app-data.mjs --scope=all --confirm=<projectId>
 *
 * أمثلة:
 *   # تصفير البيانات التشغيلية والمالية فقط (DRY-RUN)
 *   node scripts/reset-app-data.mjs --scope=operational,financial
 *
 *   # تصفير كامل حتى المستخدمين مع الإبقاء على حساب الأدمن
 *   DRY_RUN=false node scripts/reset-app-data.mjs --scope=everything \
 *       --keep-email=engmah72@gmail.com --confirm=<projectId>
 *
 *   # نطاق مخصّص: مجموعة + collection إضافية، مع استثناء واحدة
 *   node scripts/reset-app-data.mjs --scope=operational --include=notifications --exclude=clients
 *
 * المعاملات:
 *   --scope=<list>      مجموعات/presets مفصولة بفواصل (الافتراضي: all)
 *   --include=<list>    collections إضافية تُضاف للنطاق
 *   --exclude=<list>    collections تُستبعد من النطاق
 *   --confirm=<id>      معرّف المشروع (إلزامي للتشغيل الحقيقي)
 *   --keep-uid=<uid>    لا تحذف مستند users بهذا الـ uid (ضمن نطاق identity)
 *   --keep-email=<m>    لا تحذف مستند users المطابق لهذا الإيميل (ضمن identity)
 *   --page-size=<n>     حجم صفحة القراءة (الافتراضي 300)
 *   --batch-limit=<n>   حد دفعة الحذف (الافتراضي 400، أقصى Firestore 500)
 *   DRY_RUN=false       (env) شغّل الحذف الفعلي. غير ذلك = عدّ فقط.
 */

// ── Admin SDK setup ──────────────────────────────────────────────────────
// import admin from 'firebase-admin';
// initializeApp يتم في الـ CLI runner أسفل (يعتمد GOOGLE_APPLICATION_CREDENTIALS).
// الملف importable من الاختبارات بدون admin SDK (الدوال النقية + db وهمي).

// ══════════════════════════════════════════════════════════════════════
// COLLECTION GROUPS — مصدر واحد لتجميع الـ collections حسب الفئة
// ══════════════════════════════════════════════════════════════════════
export const COLLECTION_GROUPS = Object.freeze({
  operational: [
    'orders', 'clients', 'suppliers', 'supplier_orders', 'returns_tickets',
    'shipping_returns', 'payment_requests', 'reconciliations', 'design_items',
    'tasks', 'conversations', 'comments', 'client_followups', 'client_segments',
    'client_decisions', 'gallery', 'stories',
  ],
  financial: [
    'wallets', 'transactions_v2', 'financial_ledger', 'employee_payments',
    'supplier_payments', 'shipping_settlements',
  ],
  hr: [
    'attendance', 'employee_goals', 'employee_evaluations',
    'employee_incidents', 'employee_leaves',
  ],
  logs: [
    'audit_logs', 'notifications', 'admin_alerts', 'whatsapp_logs',
    'backup_logs', 'migration_logs', 'error_reports', 'drift_reports',
    'daily_stats', 'action_telemetry', 'rfm_runs', 'forecasts',
    'product_affinities', 'impersonation_audit', 'partner_logins',
    'presence', 'fcm_tokens',
  ],
  config: ['master_lists', 'shipping_pricing', 'settings', 'tenants'],
  identity: ['users', 'employees'],
});

// presets — مجموعات مركّبة
export const SCOPE_PRESETS = Object.freeze({
  all: ['operational', 'financial', 'hr', 'logs'],
  everything: ['operational', 'financial', 'hr', 'logs', 'config', 'identity'],
});

const DEFAULT_PAGE_SIZE = 300;
const DEFAULT_BATCH_LIMIT = 400;

// ══════════════════════════════════════════════════════════════════════
// resolveCollections — يحوّل --scope/--include/--exclude إلى قائمة نهائية
// (نقية، قابلة للاختبار) — يحافظ على الترتيب ويزيل التكرار.
// ══════════════════════════════════════════════════════════════════════
export function resolveCollections({ scope = 'all', include = [], exclude = [] } = {}) {
  const groups = COLLECTION_GROUPS;
  const presets = SCOPE_PRESETS;
  const scopeTokens = Array.isArray(scope)
    ? scope
    : String(scope).split(',').map((s) => s.trim()).filter(Boolean);

  const groupNames = [];
  for (const tok of scopeTokens) {
    if (presets[tok]) groupNames.push(...presets[tok]);
    else if (groups[tok]) groupNames.push(tok);
    else throw new Error(`نطاق غير معروف: "${tok}" — المتاح: ${[...Object.keys(presets), ...Object.keys(groups)].join(', ')}`);
  }

  const ordered = [];
  const seen = new Set();
  const add = (name) => { if (!seen.has(name)) { seen.add(name); ordered.push(name); } };

  for (const g of groupNames) for (const c of groups[g]) add(c);
  for (const c of include) { const t = String(c).trim(); if (t) add(t); }

  const excludeSet = new Set(exclude.map((c) => String(c).trim()).filter(Boolean));
  return ordered.filter((c) => !excludeSet.has(c));
}

// ── parse args ──────────────────────────────────────────────
export function parseArgs(argv) {
  const out = {
    scope: 'all', include: [], exclude: [], confirm: '',
    keepUid: '', keepEmail: '',
    pageSize: DEFAULT_PAGE_SIZE, batchLimit: DEFAULT_BATCH_LIMIT,
  };
  const csv = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
  for (const a of argv) {
    if (a.startsWith('--scope=')) out.scope = a.slice(8).trim();
    else if (a.startsWith('--include=')) out.include = csv(a.slice(10));
    else if (a.startsWith('--exclude=')) out.exclude = csv(a.slice(10));
    else if (a.startsWith('--confirm=')) out.confirm = a.slice(10).trim();
    else if (a.startsWith('--keep-uid=')) out.keepUid = a.slice(11).trim();
    else if (a.startsWith('--keep-email=')) out.keepEmail = a.slice(13).trim();
    else if (a.startsWith('--page-size=')) out.pageSize = Math.max(1, parseInt(a.slice(12), 10) || DEFAULT_PAGE_SIZE);
    else if (a.startsWith('--batch-limit=')) out.batchLimit = Math.min(500, Math.max(1, parseInt(a.slice(14), 10) || DEFAULT_BATCH_LIMIT));
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════════
// deleteCollection — يفرّغ collection واحدة في صفحات/دفعات.
//   - DRY-RUN: يعدّ المستندات فقط (بلا حذف).
//   - يحترم keep-set (uids مستثناة، لـ users تحديداً).
//   - يستخدم db.recursiveDelete للمستند لو متاح (ينظّف الـ subcollections).
//   يعيد: { collection, scanned, deleted, kept, dryRun }
// ══════════════════════════════════════════════════════════════════════
export async function deleteCollection(db, name, opts = {}) {
  const dryRun = opts.dryRun !== false; // افتراضي: dry-run
  const pageSize = opts.pageSize || DEFAULT_PAGE_SIZE;
  const batchLimit = opts.batchLimit || DEFAULT_BATCH_LIMIT;
  const keep = opts.keep instanceof Set ? opts.keep : new Set(opts.keep || []);
  const log = opts.onLog || (() => {});
  const hasRecursive = typeof db.recursiveDelete === 'function';

  let scanned = 0, deleted = 0, kept = 0;

  // تصفّح موحّد بـ startAfter (ترتيب __name__ الافتراضي). المؤشر يحمل قيمة
  // موضع آخر مستند في الصفحة، فيتقدّم بشكل صحيح سواء حُذفت المستندات أم لا
  // (لا حلقة لا نهائية حتى مع keep-set أو في DRY-RUN).
  let cursor = null;
  for (;;) {
    let q = db.collection(name).limit(pageSize);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    const docs = snap.docs || [];
    if (docs.length === 0) break;
    scanned += docs.length;
    cursor = docs[docs.length - 1];

    const toDelete = docs.filter((d) => !keep.has(d.id));
    kept += docs.length - toDelete.length;

    if (!dryRun && toDelete.length) {
      if (hasRecursive) {
        for (const d of toDelete) {
          await db.recursiveDelete(d.ref); // ينظّف المستند + أي subcollections
          deleted++;
        }
      } else {
        for (let i = 0; i < toDelete.length; i += batchLimit) {
          const slice = toDelete.slice(i, i + batchLimit);
          const batch = db.batch();
          for (const d of slice) batch.delete(d.ref);
          await batch.commit();
          deleted += slice.length;
        }
      }
      log(`  · ${name}: حُذف ${deleted}${kept ? ` · مستثنى ${kept}` : ''} ...`);
    }

    if (docs.length < pageSize) break;
  }

  return { collection: name, scanned, deleted, kept, dryRun };
}

// ══════════════════════════════════════════════════════════════════════
// resetAppData — المنسّق الرئيسي. يحلّ النطاق، يطبّق التأكيد المزدوج،
//   ثم يفرّغ كل collection بالترتيب.
// ══════════════════════════════════════════════════════════════════════
export async function resetAppData(db, opts = {}) {
  const log = opts.onLog || ((...m) => console.log('[reset]', ...m));
  const dryRun = opts.dryRun !== false; // افتراضي dry-run
  const collections = resolveCollections({
    scope: opts.scope ?? 'all',
    include: opts.include || [],
    exclude: opts.exclude || [],
  });

  if (collections.length === 0) {
    throw new Error('النطاق فارغ — لا توجد collections للتصفير.');
  }

  // ── keep-set: استثناء حساب admin من الحذف (lockout-safe) ──
  const keepByCollection = {};
  if (opts.keepUid) (keepByCollection.users ||= new Set()).add(opts.keepUid);
  if (opts.keepEmail && opts.resolveEmailUid) {
    const uid = await opts.resolveEmailUid(opts.keepEmail);
    if (uid) (keepByCollection.users ||= new Set()).add(uid);
  }

  log(`النطاق: ${collections.length} collection — ${collections.join(', ')}`);
  if (keepByCollection.users) log(`استثناء users: ${[...keepByCollection.users].join(', ')}`);
  log(dryRun ? '🟡 DRY-RUN — عدّ فقط، لن يُحذف شيء.' : '🔴 حذف فعلي مُفعّل.');

  const results = [];
  for (const name of collections) {
    const r = await deleteCollection(db, name, {
      dryRun,
      pageSize: opts.pageSize,
      batchLimit: opts.batchLimit,
      keep: keepByCollection[name],
      onLog: opts.verbose ? log : undefined,
    });
    results.push(r);
    log(`${dryRun ? 'سيُحذف' : 'حُذف'} ${name}: ${dryRun ? r.scanned - r.kept : r.deleted}${r.kept ? ` (مستثنى ${r.kept})` : ''}`);
  }

  const totalScanned = results.reduce((s, r) => s + r.scanned, 0);
  const totalDeleted = results.reduce((s, r) => s + (dryRun ? r.scanned - r.kept : r.deleted), 0);
  const totalKept = results.reduce((s, r) => s + r.kept, 0);

  return { dryRun, collections, results, totalScanned, totalDeleted, totalKept };
}

// ══════════════════════════════════════════════════════════════════════
// CLI runner — Admin SDK
// ══════════════════════════════════════════════════════════════════════
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const opts = parseArgs(process.argv.slice(2));
  const dryRun = process.env.DRY_RUN !== 'false';

  const { default: admin } = await import('firebase-admin');
  if (!admin.apps.length) admin.initializeApp(); // GOOGLE_APPLICATION_CREDENTIALS
  const db = admin.firestore();
  const projectId =
    admin.app().options.projectId ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    '(غير معروف)';

  console.log('════════════════════════════════════════════════════════');
  console.log('  reset-app-data — تصفير بيانات الأبلكيشن');
  console.log('  المشروع :', projectId);
  console.log('  النطاق  :', opts.scope, opts.include.length ? `(+${opts.include})` : '', opts.exclude.length ? `(-${opts.exclude})` : '');
  console.log('  الوضع   :', dryRun ? '🟡 DRY-RUN (بلا حذف)' : '🔴 حذف فعلي');
  console.log('════════════════════════════════════════════════════════');

  // ── التأكيد المزدوج (للحذف الفعلي فقط) ──
  if (!dryRun) {
    if (!opts.confirm) {
      console.error('❌ الحذف الفعلي يتطلب --confirm=<projectId>. التشغيل أُلغي.');
      console.error(`   مثال:  DRY_RUN=false node scripts/reset-app-data.mjs --scope=${opts.scope} --confirm=${projectId}`);
      process.exit(1);
    }
    if (opts.confirm !== projectId) {
      console.error(`❌ --confirm="${opts.confirm}" لا يطابق معرّف المشروع "${projectId}". التشغيل أُلغي (حماية ضد الحذف بالغلط).`);
      process.exit(1);
    }
  }

  // resolver للإيميل → uid (لاستثناء حساب الأدمن من الحذف)
  const resolveEmailUid = async (email) => {
    try { return (await admin.auth().getUserByEmail(email)).uid; }
    catch { return ''; }
  };

  resetAppData(db, {
    ...opts,
    dryRun,
    resolveEmailUid,
    onLog: (...m) => console.log('[reset]', ...m),
  })
    .then((r) => {
      console.log('────────────────────────────────────────────────────────');
      if (r.dryRun) {
        console.log(`✅ DRY-RUN انتهى — سيُحذف ${r.totalDeleted} مستند عبر ${r.collections.length} collection${r.totalKept ? ` (مع استثناء ${r.totalKept})` : ''}.`);
        console.log(`   للتنفيذ الفعلي:  DRY_RUN=false node scripts/reset-app-data.mjs --scope=${opts.scope} --confirm=${projectId}`);
      } else {
        console.log(`✅ تم — حُذف ${r.totalDeleted} مستند عبر ${r.collections.length} collection${r.totalKept ? ` (مع استثناء ${r.totalKept})` : ''}.`);
      }
      process.exit(0);
    })
    .catch((e) => {
      console.error('❌ فشل التصفير:', e.message || e);
      process.exit(1);
    });
}
