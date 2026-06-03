/**
 * scripts/restore-admin.mjs
 *
 * أداة استرجاع حساب admin (Account Recovery — server-side, Firebase Admin SDK).
 *
 * متى تُستخدم؟
 *   لمّا يتقفل حساب admin بسبب:
 *     • "بيانات الدخول غلط" (Firebase Auth) — كلمة السر اتغيّرت / الحساب اتعطّل
 *       (disabled) / الإيميل اختلف.
 *     • مستند users/{uid} اتكتب فوقه بدور أقل أو اتمسحت صلاحياته (مثلاً عبر
 *       ثغرة إعادة استخدام authUid في employees.html — صار محمياً الآن).
 *
 * بتعمل إيه؟ (idempotent — تقدر تشغّلها أكتر من مرة بأمان):
 *   1) تلاقي حساب الـ Auth بالإيميل (أو الـ uid مباشرة).
 *   2) تصحّح طبقة Auth: disabled=false، emailVerified=true، وتعيد تعيين كلمة
 *      السر لو مرّرتها بـ --password (وإلا تسيبها زي ما هي).
 *   3) تكتب/تدمج (merge) مستند users/{uid}: role='admin' + الصلاحيات الكاملة
 *      للأدمن (من core/permissions-matrix.js — مصدر الحقيقة، بلا تكرار) +
 *      isActive=true، بدون ما تمسح باقي الحقول (name/createdAt...).
 *
 * **هذه أداة سيرفر-سايد فقط** (Firebase Admin SDK يتجاوز firestore.rules).
 * لا علاقة لها بالواجهة (L1/H1.1) — تُشغَّل يدوياً بصلاحيات service account.
 *
 * ─────────────────────────────────────────────────────────────────────
 * التشغيل:
 *   1) ثبّت firebase-admin (لو مش متثبّت في الجذر):
 *        npm install firebase-admin
 *   2) هيّئ بيانات اعتماد الـ service account (من Firebase Console →
 *      Project Settings → Service accounts → Generate new private key):
 *        export GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
 *   3) شغّل:
 *        node scripts/restore-admin.mjs                       # الإيميل الافتراضي، بدون تغيير كلمة السر
 *        node scripts/restore-admin.mjs you@example.com
 *        node scripts/restore-admin.mjs you@example.com --password=NewStrongPass123
 *        node scripts/restore-admin.mjs --uid=AbC123...       # لو عارف الـ uid مباشرة
 *        node scripts/restore-admin.mjs --dry-run             # عرض ما سيحدث بدون كتابة
 *
 * المعاملات:
 *   <email>            إيميل الحساب (موضعي). الافتراضي: engmah72@gmail.com
 *   --uid=<uid>        استخدم uid مباشرة بدل البحث بالإيميل
 *   --password=<pw>    أعد تعيين كلمة سر الـ Auth (≥ 6 أحرف)
 *   --role=<role>      الدور المراد استرجاعه (الافتراضي: admin)
 *   --dry-run          لا تكتب — اعرض الخطوات فقط
 */

import admin from 'firebase-admin';
// مصدر الحقيقة للصلاحيات (RULE 8 / C2) — لا تكرار لشكل صلاحيات الأدمن هنا.
import { DEFAULT_ROLE_PERMISSIONS } from '../core/permissions-matrix.js';

const DEFAULT_EMAIL = 'engmah72@gmail.com';

// ── parse args ──────────────────────────────────────────────
function parseArgs(argv) {
  const out = { email: '', uid: '', password: '', role: 'admin', dryRun: false };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a.startsWith('--uid=')) out.uid = a.slice(6).trim();
    else if (a.startsWith('--password=')) out.password = a.slice(11);
    else if (a.startsWith('--role=')) out.role = a.slice(7).trim();
    else if (!a.startsWith('--')) out.email = a.trim();
  }
  if (!out.email && !out.uid) out.email = DEFAULT_EMAIL;
  return out;
}

// ── build admin users-doc permissions bundle (single source) ──
function buildPermissions(role) {
  const def = DEFAULT_ROLE_PERMISSIONS[role];
  if (!def) {
    throw new Error(`دور غير معروف: "${role}" — الأدوار المتاحة: ${Object.keys(DEFAULT_ROLE_PERMISSIONS).join(', ')}`);
  }
  return JSON.parse(JSON.stringify(def)); // deep copy من الـ frozen object
}

export async function restoreAdmin(db, auth, opts) {
  const { email, uid, password, role, dryRun } = opts;
  const log = (...m) => console.log('[restore-admin]', ...m);

  // 1) locate auth user
  let userRecord;
  if (uid) {
    userRecord = await auth.getUser(uid);
  } else {
    userRecord = await auth.getUserByEmail(email);
  }
  log(`✓ تم العثور على حساب Auth: uid=${userRecord.uid} · email=${userRecord.email} · disabled=${userRecord.disabled}`);

  // 2) fix auth layer
  const authUpdate = { disabled: false, emailVerified: true };
  if (password) {
    if (password.length < 6) throw new Error('كلمة السر يجب أن تكون 6 أحرف على الأقل');
    authUpdate.password = password;
  }
  if (dryRun) {
    log('DRY-RUN — Auth update (لن يُكتب):', { ...authUpdate, password: password ? '«جديدة»' : undefined });
  } else {
    await auth.updateUser(userRecord.uid, authUpdate);
    log(`✓ Auth: disabled=false · emailVerified=true${password ? ' · كلمة السر أُعيد تعيينها' : ''}`);
  }

  // 3) restore users/{uid} doc (merge — لا يمسح باقي الحقول)
  const permissions = buildPermissions(role);
  const userDoc = {
    role,
    permissions,
    isActive: true,
    email: userRecord.email || email || '',
    restoredAt: admin.firestore.FieldValue.serverTimestamp(),
    restoredBy: 'restore-admin-script',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  // لو أعدنا تعيين كلمة السر، فالمستخدم سيدخل بها مباشرة — أزِل أي إجبار على
  // التغيير حتى لا يُحوَّل إلى change-password.html. غير ذلك لا نلمس الحقل.
  if (password) userDoc.mustChangePassword = false;

  if (dryRun) {
    log('DRY-RUN — users/' + userRecord.uid + ' (merge، لن يُكتب):', JSON.stringify({ role, isActive: true, permissions }, null, 2));
  } else {
    await db.collection('users').doc(userRecord.uid).set(userDoc, { merge: true });
    log(`✓ users/${userRecord.uid}: role='${role}' · isActive=true · permissions كاملة`);
  }

  return { uid: userRecord.uid, email: userRecord.email, role, passwordReset: !!password, dryRun: !!dryRun };
}

// ── CLI runner ──────────────────────────────────────────────
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const opts = parseArgs(process.argv.slice(2));
  if (!admin.apps.length) {
    // يعتمد على GOOGLE_APPLICATION_CREDENTIALS (service account) في البيئة.
    admin.initializeApp();
  }
  const db = admin.firestore();
  const auth = admin.auth();
  console.log('[restore-admin] target:', opts.uid ? `uid=${opts.uid}` : `email=${opts.email}`, '· role:', opts.role, opts.dryRun ? '· DRY-RUN' : '');
  restoreAdmin(db, auth, opts)
    .then((r) => {
      console.log('[restore-admin] ✅ تم الاسترجاع:', r);
      if (!r.passwordReset && !r.dryRun) {
        console.log('[restore-admin] ℹ️ لو لسه "بيانات الدخول غلط"، أعد التشغيل بـ --password=... لتعيين كلمة سر جديدة.');
      }
      process.exit(0);
    })
    .catch((e) => {
      console.error('[restore-admin] ❌ فشل:', e.message || e);
      if (e.code === 'auth/user-not-found') {
        console.error('[restore-admin] الحساب غير موجود في Firebase Auth بهذا الإيميل — تأكد من الإيميل أو مرّر --uid=...');
      }
      process.exit(1);
    });
}
