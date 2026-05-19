/**
 * WhatsApp Integration — Cloud Functions
 * ─────────────────────────────────────────
 * Phase 1: stub mode — يسجّل الرسائل في `whatsapp_logs` بدون إرسال فعلي.
 * Phase 2: live mode — يبعت عبر WhatsApp Cloud API لما تتضبط البيانات في Secrets.
 *
 * Settings doc: `settings/whatsapp` يتحكم في:
 *   - mode: 'stub' | 'live'
 *   - events: { order_created: true, order_shipped: true, order_delivered: true, payment_received: true }
 *   - templates: { order_created: 'order_confirmation', order_shipped: 'order_shipped', ... }
 *   - language: 'ar' | 'en'
 *   - businessAccountId: '...'    (مرئي للأدمن، مش حساس)
 *   - phoneNumberId: '...'        (مرئي للأدمن، مش حساس)
 *
 * أسرار حساسة (في Firebase Secrets، مش في الـ doc):
 *   - WHATSAPP_TOKEN
 */

const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const { setGlobalOptions } = require('firebase-functions/v2');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

// CORS — السماح للـ web app يستدعي onCall functions من أي origin مصرَّح.
// لـ Firebase Hosting + GitHub Pages + localhost للتطوير.
// Note: كل الـ callable functions تتطلب req.auth (Firebase Auth token) ➜
// CORS عام آمن — السماح للـ origin ≠ السماح للوصول بدون auth.
const CORS_ALLOWED = [
  'https://business2card-c041b.web.app',
  'https://business2card-c041b.firebaseapp.com',
  'https://engmah72-star.github.io',
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
];
const CALL_OPTS = { cors: CORS_ALLOWED };

const WHATSAPP_TOKEN = defineSecret('WHATSAPP_TOKEN');
const GITHUB_PAT     = defineSecret('GITHUB_PAT');

const GITHUB_REPO = 'engmah72-star/b2c-erp';

const db = getFirestore();

// ════════════════════════════════════════════════════════════
// SETTINGS LOADER
// ════════════════════════════════════════════════════════════
const DEFAULT_SETTINGS = {
  mode: 'stub',
  language: 'ar',
  events: {
    order_created:    true,
    order_shipped:    true,
    order_delivered:  true,
    payment_received: true,
  },
  templates: {
    order_created:    'order_confirmation',
    order_shipped:    'order_shipped',
    order_delivered:  'order_delivered',
    payment_received: 'payment_received',
  },
  phoneNumberId: '',
  businessAccountId: '',
};

async function loadSettings() {
  const snap = await db.doc('settings/whatsapp').get();
  if (!snap.exists) return DEFAULT_SETTINGS;
  const data = snap.data() || {};
  return {
    ...DEFAULT_SETTINGS,
    ...data,
    events:    { ...DEFAULT_SETTINGS.events,    ...(data.events    || {}) },
    templates: { ...DEFAULT_SETTINGS.templates, ...(data.templates || {}) },
  };
}

// ════════════════════════════════════════════════════════════
// PHONE NORMALIZER (Egypt)
// ════════════════════════════════════════════════════════════
function normalizePhone(raw) {
  if (!raw) return null;
  let p = String(raw).replace(/\D/g, '');
  if (p.startsWith('00'))  p = p.slice(2);
  if (p.startsWith('0'))   p = '20' + p.slice(1);
  if (p.startsWith('1') && p.length === 10) p = '20' + p;
  if (!p.startsWith('20')) return null;
  if (p.length < 12 || p.length > 13) return null;
  return p;
}

// ════════════════════════════════════════════════════════════
// CORE: send (stub or live)
// ════════════════════════════════════════════════════════════
async function sendWhatsApp({ event, to, params, entityId, entityType, settings }) {
  const phone = normalizePhone(to);
  if (!phone) {
    return { ok: false, reason: 'invalid_phone', raw: to };
  }
  const templateName = settings.templates[event];
  const log = {
    event,
    templateName,
    to: phone,
    rawPhone: to,
    params,
    entityType: entityType || null,
    entityId:   entityId   || null,
    mode:       settings.mode,
    status:     'pending',
    createdAt:  FieldValue.serverTimestamp(),
  };

  if (settings.mode !== 'live') {
    log.status = 'stub';
    log.note = 'لم يتم الإرسال — وضع المحاكاة (stub). فعّل الوضع الحي بعد اعتماد القوالب.';
    await db.collection('whatsapp_logs').add(log);
    return { ok: true, stub: true };
  }

  // Live mode
  try {
    const token = WHATSAPP_TOKEN.value();
    if (!token || !settings.phoneNumberId) {
      throw new Error('missing_credentials');
    }
    const url = `https://graph.facebook.com/v21.0/${settings.phoneNumberId}/messages`;
    const body = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: settings.language === 'en' ? 'en_US' : 'ar' },
        components: [{
          type: 'body',
          parameters: params.map(v => ({ type: 'text', text: String(v) })),
        }],
      },
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      log.status = 'failed';
      log.error  = json?.error?.message || `HTTP ${res.status}`;
      log.errorCode = json?.error?.code || res.status;
      await db.collection('whatsapp_logs').add(log);
      return { ok: false, reason: 'api_error', error: log.error };
    }
    log.status = 'sent';
    log.messageId = json?.messages?.[0]?.id || null;
    await db.collection('whatsapp_logs').add(log);
    return { ok: true, messageId: log.messageId };
  } catch (err) {
    log.status = 'failed';
    log.error  = err.message || String(err);
    await db.collection('whatsapp_logs').add(log);
    return { ok: false, reason: 'exception', error: log.error };
  }
}

// ════════════════════════════════════════════════════════════
// HELPERS — resolve client info from order
// ════════════════════════════════════════════════════════════
async function resolveClientPhone(order) {
  if (order.clientPhone) return order.clientPhone;
  if (!order.clientId)   return null;
  const c = await db.doc(`clients/${order.clientId}`).get();
  if (!c.exists) return null;
  const d = c.data() || {};
  return d.phone1 || d.phone2 || null;
}

async function resolveClientName(order) {
  if (order.clientName) return order.clientName;
  if (!order.clientId)  return 'عميلنا';
  const c = await db.doc(`clients/${order.clientId}`).get();
  return c.exists ? (c.data().name || 'عميلنا') : 'عميلنا';
}

// ════════════════════════════════════════════════════════════
// TRIGGER: Order created → order_confirmation
// ════════════════════════════════════════════════════════════
exports.onOrderCreated = onDocumentCreated(
  { document: 'orders/{orderId}', secrets: [WHATSAPP_TOKEN] },
  async (e) => {
    const order = e.data?.data();
    if (!order) return;
    const settings = await loadSettings();
    if (!settings.events.order_created) return;

    const phone = await resolveClientPhone(order);
    const name  = await resolveClientName(order);
    const orderNum = order.orderNumber || order.serial || e.params.orderId.slice(0, 6);
    const total = Number(order.totalPrice || order.salePrice || 0).toFixed(0);

    await sendWhatsApp({
      event: 'order_created',
      to: phone,
      params: [name, orderNum, total],
      entityType: 'order',
      entityId: e.params.orderId,
      settings,
    });
  }
);

// ════════════════════════════════════════════════════════════
// TRIGGER: Order stage changed → shipped / delivered
// ════════════════════════════════════════════════════════════
exports.onOrderStageChanged = onDocumentUpdated(
  { document: 'orders/{orderId}', secrets: [WHATSAPP_TOKEN] },
  async (e) => {
    const before = e.data?.before?.data() || {};
    const after  = e.data?.after?.data()  || {};
    if (before.stage === after.stage) return;

    const settings = await loadSettings();
    const phone = await resolveClientPhone(after);
    const name  = await resolveClientName(after);
    const orderNum = after.orderNumber || after.serial || e.params.orderId.slice(0, 6);

    // shipped
    if (after.stage === 'shipping' && settings.events.order_shipped) {
      const company = after.shippingCompany || after.shipperName || '—';
      const tracking = after.trackingNumber || after.awb || '—';
      await sendWhatsApp({
        event: 'order_shipped',
        to: phone,
        params: [name, orderNum, company, tracking],
        entityType: 'order',
        entityId: e.params.orderId,
        settings,
      });
      return;
    }
    // delivered
    if (after.stage === 'archived' && settings.events.order_delivered) {
      await sendWhatsApp({
        event: 'order_delivered',
        to: phone,
        params: [name, orderNum],
        entityType: 'order',
        entityId: e.params.orderId,
        settings,
      });
      return;
    }
  }
);

// ════════════════════════════════════════════════════════════
// TRIGGER: Payment received (financial_ledger CUSTOMER_PAYMENT) → receipt
// ════════════════════════════════════════════════════════════
exports.onPaymentLogged = onDocumentCreated(
  { document: 'financial_ledger/{entryId}', secrets: [WHATSAPP_TOKEN] },
  async (e) => {
    const entry = e.data?.data();
    if (!entry) return;
    if (entry.eventType !== 'CUSTOMER_PAYMENT') return;

    const settings = await loadSettings();
    if (!settings.events.payment_received) return;
    if (!entry.clientId) return;

    const c = await db.doc(`clients/${entry.clientId}`).get();
    if (!c.exists) return;
    const client = c.data();
    const phone = client.phone1 || client.phone2;
    const name  = client.name || 'عميلنا';
    const amount = Number(entry.amount || 0).toFixed(0);

    // الرصيد المتبقي عبر تجميع طلبات العميل
    let balance = 0;
    try {
      const ords = await db.collection('orders').where('clientId', '==', entry.clientId).get();
      ords.forEach(o => {
        const d = o.data();
        balance += (Number(d.totalPrice || d.salePrice || 0) - Number(d.totalPaid || 0));
      });
    } catch (_) { /* ignore */ }

    await sendWhatsApp({
      event: 'payment_received',
      to: phone,
      params: [amount, balance.toFixed(0), name],
      entityType: 'payment',
      entityId: e.params.entryId,
      settings,
    });
  }
);

// ════════════════════════════════════════════════════════════
// CALLABLE: manual send (test from settings UI)
// ════════════════════════════════════════════════════════════
exports.sendWhatsAppTest = onCall(
  { ...CALL_OPTS, secrets: [WHATSAPP_TOKEN] },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'لازم تسجل دخول');
    const userSnap = await db.doc(`users/${req.auth.uid}`).get();
    const role = userSnap.exists ? userSnap.data().role : '';
    if (!['admin', 'operation_manager'].includes(role)) {
      throw new HttpsError('permission-denied', 'للأدمن فقط');
    }
    const { to, event } = req.data || {};
    if (!to || !event) throw new HttpsError('invalid-argument', 'to + event مطلوبين');

    const settings = await loadSettings();
    const params = event === 'order_shipped'
      ? ['عميل تجريبي', 'TEST-001', 'أرامكس', '1234567890']
      : event === 'payment_received'
      ? ['500', '0', 'عميل تجريبي']
      : event === 'order_delivered'
      ? ['عميل تجريبي', 'TEST-001']
      : ['عميل تجريبي', 'TEST-001', '500'];

    const result = await sendWhatsApp({
      event, to, params, entityType: 'test', entityId: req.auth.uid, settings,
    });
    return result;
  }
);

// ════════════════════════════════════════════════════════════════════════════
//   Admin Reset Employee Password
// ════════════════════════════════════════════════════════════════════════════
//
// Resets a target employee's Firebase Auth password to a freshly generated
// 6-digit numeric code and flags the user doc with `mustChangePassword=true`
// so the standard change-password flow kicks in on next login.
//
// Callable from admin/operation_manager roles only. Used by the
// `🔑 إعادة تعيين فوري` button in employee-profile.html. Each call returns
// a new code — the admin shares it with the employee out of band (WhatsApp /
// phone) and the code is single-use because login forces an immediate change.

function genTempPassword() {
  // 6 digit zero-padded code, e.g. "048372". Math.random is non-CSPRNG but
  // adequate here: the code is single-use, lives ~one login, and Firebase Auth
  // rate-limits sign-in attempts (5/min/user).
  return String(Math.floor(100000 + Math.random() * 900000));
}

exports.adminResetEmployeePassword = onCall(CALL_OPTS, async (req) => {
  // Top-level try/catch: any unexpected throw becomes an "internal" error on
  // the client side, hiding the cause. Convert to a typed HttpsError so the
  // admin sees the actual reason. Server-side logs keep the full stack via
  // console.error and Cloud Logging.
  try {
    const callerUid = req.auth?.uid;
    console.log('[adminResetEmployeePassword] called by', callerUid, 'for', req.data?.uid);
    if (!callerUid) {
      throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول');
    }

    // 1) Verify caller is admin or operation_manager
    let callerSnap;
    try {
      callerSnap = await getFirestore().doc(`users/${callerUid}`).get();
    } catch (e) {
      console.error('caller users/get failed', e);
      throw new HttpsError('internal', 'تعذّر قراءة بيانات المستخدم: ' + (e.message || ''));
    }
    if (!callerSnap.exists) {
      throw new HttpsError('permission-denied', 'حساب المستخدم غير موجود في users');
    }
    const callerData = callerSnap.data() || {};
    const callerRole = callerData.role;
    if (!['admin', 'operation_manager'].includes(callerRole)) {
      throw new HttpsError('permission-denied', 'هذه العملية للأدمن فقط — دورك: ' + (callerRole || '—'));
    }

    // 2) Validate target uid
    const targetUid = req.data?.uid;
    if (!targetUid || typeof targetUid !== 'string') {
      throw new HttpsError('invalid-argument', 'uid مفقود أو غير صالح');
    }

    // 3) Generate temp password
    const tempPw = genTempPassword();

    // 4) Apply via Admin SDK — fails if target doesn't exist in Auth
    try {
      await getAuth().updateUser(targetUid, { password: tempPw });
    } catch (e) {
      console.error('updateUser failed for', targetUid, e);
      throw new HttpsError('not-found', 'حساب الموظف غير موجود في Firebase Auth: ' + (e.message || ''));
    }

    // 5) Flag user doc so login routes through change-password.html
    try {
      await getFirestore().doc(`users/${targetUid}`).update({
        mustChangePassword: true,
        passwordResetAt: FieldValue.serverTimestamp(),
        passwordResetBy: callerUid,
        passwordResetByName: callerData.name || '',
      });
    } catch (e) {
      // Auth password is already changed at this point — log but don't fail
      console.warn('mustChangePassword flag update failed for', targetUid, e.message);
    }

    console.log('[adminResetEmployeePassword] success for', targetUid);
    return { success: true, tempPassword: tempPw };

  } catch (e) {
    // Re-throw HttpsError as-is; wrap anything else
    if (e instanceof HttpsError) throw e;
    console.error('[adminResetEmployeePassword] unexpected error', e);
    throw new HttpsError('internal', 'خطأ غير متوقع: ' + (e.message || String(e)));
  }
});

// ════════════════════════════════════════════════════════════════════════════
//   Admin Set Employee Password (explicit password chosen by admin)
// ════════════════════════════════════════════════════════════════════════════
// Same shape as adminResetEmployeePassword but accepts an explicit `password`
// from the admin instead of generating one. Used by the "تعيين كلمة سر" modal
// in employee-profile.html. Also flips mustChangePassword=true so the
// employee is still forced to set their own on next login.

exports.adminSetEmployeePassword = onCall(CALL_OPTS, async (req) => {
  try {
    const callerUid = req.auth?.uid;
    if (!callerUid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول');

    let callerSnap;
    try { callerSnap = await getFirestore().doc(`users/${callerUid}`).get(); }
    catch (e) { throw new HttpsError('internal', 'تعذّر قراءة بيانات المستخدم'); }
    if (!callerSnap.exists) throw new HttpsError('permission-denied', 'حساب المستخدم غير موجود');

    const callerData = callerSnap.data() || {};
    if (!['admin', 'operation_manager'].includes(callerData.role)) {
      throw new HttpsError('permission-denied', 'هذه العملية للأدمن فقط');
    }

    const targetUid = req.data?.uid;
    const password = req.data?.password;
    if (!targetUid || typeof targetUid !== 'string') {
      throw new HttpsError('invalid-argument', 'uid مفقود');
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      throw new HttpsError('invalid-argument', 'كلمة سر غير صالحة (6 أحرف على الأقل)');
    }

    try {
      await getAuth().updateUser(targetUid, { password });
    } catch (e) {
      throw new HttpsError('not-found', 'حساب الموظف غير موجود في Firebase Auth: ' + (e.message || ''));
    }

    try {
      await getFirestore().doc(`users/${targetUid}`).update({
        mustChangePassword: true,
        passwordResetAt: FieldValue.serverTimestamp(),
        passwordResetBy: callerUid,
        passwordResetByName: callerData.name || '',
      });
    } catch (e) {
      console.warn('mustChangePassword flag update failed for', targetUid, e.message);
    }

    return { success: true };
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    console.error('[adminSetEmployeePassword] unexpected error', e);
    throw new HttpsError('internal', 'خطأ غير متوقع: ' + (e.message || String(e)));
  }
});

// ════════════════════════════════════════════════════════════════════════════
//   Impersonate User — Custom Token for View-As (Deep Mode)
// ════════════════════════════════════════════════════════════════════════════
// Admin-only. Mints a short-lived custom token for the target user so the
// admin can review the system *exactly* as that employee sees it — with real
// Firestore rules enforcing visibility.
//
// Flow:
//   1) Admin calls this from role-viewer.html → gets custom token
//   2) Admin's client signs out, signs in with the custom token
//   3) All Firestore reads/writes now happen as the target user
//   4) Banner in viewas.js displays "🔐 Deep Mode" with countdown
//   5) On exit, client signs out → redirects to login (admin re-logs in)
//
// Security:
//   - Caller MUST be admin (operation_manager NOT allowed — too sensitive)
//   - Target MUST exist in users + Firebase Auth
//   - All impersonations logged to /impersonation_audit (immutable)
//   - Token TTL = 15 minutes (via custom claim + client-side timer)
//   - Rate limit: max 10 impersonations per admin per hour
//
// IMPORTANT: writes done while impersonating ARE real writes by the target.
// Use the optional `dryRun:true` to add an isImpersonatingDryRun custom claim
// that client-side viewas.js + Firestore rules can use to block writes.

exports.impersonateUser = onCall(CALL_OPTS, async (req) => {
  try {
    const callerUid = req.auth?.uid;
    if (!callerUid) {
      throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول');
    }

    // 1) Verify caller is admin
    const callerSnap = await db.doc(`users/${callerUid}`).get();
    if (!callerSnap.exists) {
      throw new HttpsError('permission-denied', 'حساب المستخدم غير موجود');
    }
    const callerData = callerSnap.data() || {};
    if (callerData.role !== 'admin') {
      throw new HttpsError('permission-denied', 'الـ Deep View-As للأدمن فقط (دورك: ' + (callerData.role || '—') + ')');
    }

    // 2) Validate target uid
    const targetUid = req.data?.uid;
    if (!targetUid || typeof targetUid !== 'string') {
      throw new HttpsError('invalid-argument', 'uid مفقود أو غير صالح');
    }
    if (targetUid === callerUid) {
      throw new HttpsError('invalid-argument', 'لا يمكنك انتحال نفسك');
    }

    // 3) Verify target exists in users + Firebase Auth
    const targetSnap = await db.doc(`users/${targetUid}`).get();
    if (!targetSnap.exists) {
      throw new HttpsError('not-found', 'الموظف غير موجود في users');
    }
    const targetData = targetSnap.data() || {};
    if (targetData.role === 'admin') {
      throw new HttpsError('permission-denied', 'لا يمكن انتحال أدمن آخر');
    }
    try {
      await getAuth().getUser(targetUid);
    } catch (e) {
      throw new HttpsError('not-found', 'الموظف غير موجود في Firebase Auth');
    }

    // 4) Rate limit (10/hour per admin)
    const oneHourAgo = new Date(Date.now() - 3600 * 1000);
    const recent = await db.collection('impersonation_audit')
      .where('callerUid', '==', callerUid)
      .where('createdAt', '>', oneHourAgo)
      .count().get().catch(() => ({ data: () => ({ count: 0 }) }));
    const recentCount = recent.data?.()?.count ?? 0;
    if (recentCount >= 10) {
      throw new HttpsError('resource-exhausted', 'وصلت الحد الأقصى (10 مرات/ساعة) للـ Deep View-As');
    }

    // 5) Mint custom token with claims
    const ttlMinutes = 15;
    const expiresAt = Date.now() + ttlMinutes * 60 * 1000;
    const dryRun = !!req.data?.dryRun;
    const customClaims = {
      isImpersonating: true,
      impersonatingBy: callerUid,
      impersonatingByName: callerData.name || callerData.email || '',
      impersonatingExpiresAt: expiresAt,
      impersonatingDryRun: dryRun,
    };
    const token = await getAuth().createCustomToken(targetUid, customClaims);

    // 6) Audit log (immutable per firestore.rules — write from admin SDK)
    const auditRef = await db.collection('impersonation_audit').add({
      callerUid,
      callerName: callerData.name || callerData.email || '',
      callerRole: callerData.role,
      targetUid,
      targetName: targetData.name || targetData.email || '',
      targetRole: targetData.role,
      dryRun,
      ttlMinutes,
      expiresAt: new Date(expiresAt),
      reason: (req.data?.reason || '').slice(0, 200),
      ip: req.rawRequest?.ip || '',
      userAgent: (req.rawRequest?.headers?.['user-agent'] || '').slice(0, 300),
      createdAt: FieldValue.serverTimestamp(),
    });

    console.log('[impersonateUser] admin=', callerUid, 'target=', targetUid, 'auditId=', auditRef.id, 'dryRun=', dryRun);

    return {
      success: true,
      token,
      expiresAt,
      ttlMinutes,
      auditId: auditRef.id,
      targetName: targetData.name || targetData.email || '',
      targetRole: targetData.role,
    };
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    console.error('[impersonateUser] unexpected error', e);
    throw new HttpsError('internal', 'خطأ غير متوقع: ' + (e.message || String(e)));
  }
});

// ════════════════════════════════════════════════════════════════════════════
//   FCM PUSH HELPERS
// ════════════════════════════════════════════════════════════════════════════
//
// Token storage convention:
//   fcm_tokens/{tokenId}  ← `tokenId` is the FCM token itself (deterministic)
//   { uid, token, userAgent, platform, createdAt, updatedAt }
//
// Cleanup strategy: any send that returns `messaging/registration-token-not-
// registered` or `messaging/invalid-registration-token` evicts the doc so the
// collection doesn't accumulate dead tokens.

async function getUserTokens(uid) {
  if (!uid) return [];
  const snap = await db.collection('fcm_tokens').where('uid', '==', uid).get();
  return snap.docs.map(d => d.id);
}

async function getRoleTokens(roles) {
  // Fetch all uids in the given roles, then their tokens.
  const usersSnap = await db.collection('users').where('role', 'in', roles).get();
  const uids = usersSnap.docs.map(d => d.id);
  if (uids.length === 0) return [];
  // Firestore `in` cap is 30 — chunk just in case.
  const tokens = [];
  for (let i = 0; i < uids.length; i += 30) {
    const chunk = uids.slice(i, i + 30);
    const tSnap = await db.collection('fcm_tokens').where('uid', 'in', chunk).get();
    tSnap.forEach(d => tokens.push(d.id));
  }
  return tokens;
}

async function sendPush({ tokens, title, body, data, link }) {
  if (!tokens || tokens.length === 0) return { sent: 0, failed: 0 };
  // De-dup tokens
  const unique = [...new Set(tokens)];
  const payload = {
    notification: { title, body },
    data: Object.fromEntries(
      Object.entries(data || {}).map(([k, v]) => [k, String(v ?? '')])
    ),
    webpush: link ? { fcmOptions: { link } } : undefined,
  };
  let sent = 0, failed = 0;
  // sendEachForMulticast caps at 500 tokens per call
  for (let i = 0; i < unique.length; i += 500) {
    const batch = unique.slice(i, i + 500);
    try {
      const res = await getMessaging().sendEachForMulticast({ tokens: batch, ...payload });
      sent   += res.successCount;
      failed += res.failureCount;
      // Evict invalid tokens
      const dead = [];
      res.responses.forEach((r, idx) => {
        if (r.success) return;
        const code = r.error?.code || '';
        if (code.includes('registration-token-not-registered') ||
            code.includes('invalid-registration-token') ||
            code.includes('invalid-argument')) {
          dead.push(batch[idx]);
        }
      });
      if (dead.length) {
        const wb = db.batch();
        dead.forEach(t => wb.delete(db.doc(`fcm_tokens/${t}`)));
        await wb.commit().catch(e => console.warn('token cleanup failed', e.message));
      }
    } catch (e) {
      console.error('sendPush batch failed', e.message);
      failed += batch.length;
    }
  }
  return { sent, failed };
}

// In-app notification helper — inserts a doc into `notifications` so the bell
// badge picks it up immediately for users currently signed in.
async function createInAppNotification({ toUid, title, desc, ico, link, type, entityId }) {
  if (!toUid) return;
  await db.collection('notifications').add({
    toUid,
    title: String(title || ''),
    desc:  String(desc  || ''),
    ico:   ico || '🔔',
    link:  link || null,
    type:  type || 'system',
    entityId: entityId || null,
    read:  false,
    createdAt: FieldValue.serverTimestamp(),
  });
}

// ════════════════════════════════════════════════════════════════════════════
//   FCM TOKEN REGISTRATION (callable from clients)
// ════════════════════════════════════════════════════════════════════════════
exports.registerFcmToken = onCall(CALL_OPTS, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول');
  const token = req.data?.token;
  if (!token || typeof token !== 'string' || token.length < 20) {
    throw new HttpsError('invalid-argument', 'token غير صالح');
  }
  const userAgent = String(req.data?.userAgent || '').slice(0, 200);
  const platform  = String(req.data?.platform  || 'web').slice(0, 30);
  await db.doc(`fcm_tokens/${token}`).set({
    uid: req.auth.uid,
    token,
    userAgent,
    platform,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { ok: true };
});

exports.unregisterFcmToken = onCall(CALL_OPTS, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول');
  const token = req.data?.token;
  if (!token) throw new HttpsError('invalid-argument', 'token مفقود');
  const ref = db.doc(`fcm_tokens/${token}`);
  const snap = await ref.get();
  if (snap.exists && snap.data().uid === req.auth.uid) {
    await ref.delete();
  }
  return { ok: true };
});

// ════════════════════════════════════════════════════════════════════════════
//   PUSH: Order assignment changes (designer/printer/production/shipping)
// ════════════════════════════════════════════════════════════════════════════
//
// Watches `orders` updates; for each assignment field that flipped to a new
// non-empty uid, fires a push + in-app notification to the new assignee.
// The in-app bell already lists assigned orders via onSnapshot, so this is the
// "hey, look at me right now" channel.

const ASSIGN_FIELDS = [
  { field: 'designerId',       ico: '✏️', label: 'تصميم',  page: 'design.html'    },
  { field: 'printerId',        ico: '🖨️', label: 'طباعة',  page: 'print.html'     },
  { field: 'productionAgent',  ico: '🏭', label: 'تنفيذ',  page: 'production.html' },
  { field: 'shippingOfficerId',ico: '🚚', label: 'شحن',    page: 'shipping.html'  },
];

exports.onOrderAssigned = onDocumentUpdated('orders/{orderId}', async (e) => {
  const before = e.data?.before?.data() || {};
  const after  = e.data?.after?.data()  || {};
  const orderId = e.params.orderId;
  const orderNum = after.orderNumber || after.serial || orderId.slice(0, 6);
  const clientName = after.clientName || '';

  for (const f of ASSIGN_FIELDS) {
    const prev = before[f.field] || '';
    const next = after[f.field]  || '';
    if (next && next !== prev) {
      const title = `${f.ico} أوردر ${f.label} جديد`;
      const body  = `${clientName} — #${orderNum}`;
      const link  = `/${f.page}?id=${orderId}`;
      const tokens = await getUserTokens(next);
      await Promise.all([
        sendPush({ tokens, title, body, data: { type: 'order_assigned', orderId, stage: f.label }, link }),
        createInAppNotification({
          toUid: next, title, desc: body, ico: f.ico, link, type: 'order_assigned', entityId: orderId,
        }),
      ]);
    }
  }
});

// ════════════════════════════════════════════════════════════════════════════
//   PUSH: Order stage changes — notify the client (if they have a token)
// ════════════════════════════════════════════════════════════════════════════
const STAGE_LABELS = {
  design:     'بدأ التصميم',
  printing:   'بدأت الطباعة',
  production: 'بدأ التنفيذ',
  shipping:   'في الشحن',
  archived:   'تم التسليم',
  cancelled:  'تم الإلغاء',
};

exports.onOrderStagePushedToClient = onDocumentUpdated('orders/{orderId}', async (e) => {
  const before = e.data?.before?.data() || {};
  const after  = e.data?.after?.data()  || {};
  if (!after.stage || before.stage === after.stage) return;
  if (!STAGE_LABELS[after.stage]) return;
  if (!after.clientId) return;

  const clientTokens = await getUserTokens(after.clientId);
  if (clientTokens.length === 0) return;

  const orderNum = after.orderNumber || after.serial || e.params.orderId.slice(0, 6);
  const title = `📦 تحديث طلبك #${orderNum}`;
  const body  = STAGE_LABELS[after.stage];
  await sendPush({
    tokens: clientTokens,
    title, body,
    data: { type: 'order_stage', orderId: e.params.orderId, stage: after.stage },
    link: `/order-tracking.html?id=${e.params.orderId}`,
  });
});

// ════════════════════════════════════════════════════════════════════════════
//   PUSH: Pending approval — notify admin/operation_manager
// ════════════════════════════════════════════════════════════════════════════
//
// Two surfaces feed approvals.html:
//   1) `transactions_v2` / `financial_ledger` with approvalStatus='pending'
//   2) `payment_requests` with status='pending' (after receipt uploaded)
// Both end here; we de-dup by entity id in the notification doc.

async function notifyAdminsOfPendingApproval({ entityType, entityId, title, body, link }) {
  const tokens = await getRoleTokens(['admin', 'operation_manager']);
  await sendPush({
    tokens, title, body,
    data: { type: 'approval_pending', entityType, entityId },
    link,
  });
  // In-app for each admin/ops user
  const usersSnap = await db.collection('users').where('role', 'in', ['admin', 'operation_manager']).get();
  const wb = db.batch();
  usersSnap.docs.forEach(u => {
    const ref = db.collection('notifications').doc();
    wb.set(ref, {
      toUid: u.id,
      title, desc: body, ico: '🔐',
      link, type: 'approval_pending', entityId,
      read: false, createdAt: FieldValue.serverTimestamp(),
    });
  });
  await wb.commit().catch(e => console.warn('approval in-app notif batch failed', e.message));
}

exports.onTransactionPendingApproval = onDocumentCreated('transactions_v2/{txId}', async (e) => {
  const tx = e.data?.data();
  if (!tx) return;
  if (tx.approvalStatus !== 'pending') return;
  const amount = Number(tx.amount || 0).toLocaleString('en-EG');
  const title  = `🔐 موافقة مطلوبة — ${tx.type === 'in' ? 'إيراد' : 'مصروف'}`;
  const body   = `${amount} ج.م · ${tx.category || ''} · ${tx.walletName || ''}`;
  await notifyAdminsOfPendingApproval({
    entityType: 'transaction', entityId: e.params.txId,
    title, body, link: '/approvals.html',
  });
});

exports.onPaymentRequestPendingApproval = onDocumentUpdated('payment_requests/{reqId}', async (e) => {
  const before = e.data?.before?.data() || {};
  const after  = e.data?.after?.data()  || {};
  // Trigger only on the transition into 'pending' (post-receipt upload)
  if (before.status === after.status) return;
  if (after.status !== 'pending') return;
  const amount = Number(after.amount || 0).toLocaleString('en-EG');
  const title  = `🔐 طلب دفع بانتظار الاعتماد`;
  const body   = `${amount} ج.م · ${after.purpose || after.category || ''} · من ${after.requestedByName || ''}`;
  await notifyAdminsOfPendingApproval({
    entityType: 'payment_request', entityId: e.params.reqId,
    title, body, link: '/approvals.html',
  });
});

// ════════════════════════════════════════════════════════════════════════════
//   ALERT: Critical financial movements
// ════════════════════════════════════════════════════════════════════════════
//
// Fires on every `financial_ledger` create. If the amount exceeds the threshold
// (settings/alerts.criticalThreshold or default 50,000), records an entry in
// `admin_alerts` and sends a push to admins.
//
// READ-ONLY on the financial state (RULE 1) — we never modify wallets,
// transactions, or the ledger from here. Only read + alert.

const DEFAULT_CRITICAL_THRESHOLD = 50000;

async function loadAlertSettings() {
  const snap = await db.doc('settings/alerts').get();
  const d = snap.exists ? snap.data() : {};
  return {
    criticalThreshold: Number(d.criticalThreshold) > 0
      ? Number(d.criticalThreshold)
      : DEFAULT_CRITICAL_THRESHOLD,
    notifyOnReversal: d.notifyOnReversal !== false, // default true
  };
}

exports.onCriticalFinancialEntry = onDocumentCreated('financial_ledger/{entryId}', async (e) => {
  const entry = e.data?.data();
  if (!entry) return;
  const settings = await loadAlertSettings();
  const amount = Number(entry.amount || 0);

  const isCritical = amount >= settings.criticalThreshold;
  const isReversal = entry.type === 'reversal' && settings.notifyOnReversal;
  if (!isCritical && !isReversal) return;

  const reasons = [];
  if (isCritical) reasons.push(`مبلغ ضخم (${amount.toLocaleString('en-EG')} ≥ ${settings.criticalThreshold.toLocaleString('en-EG')})`);
  if (isReversal) reasons.push('عملية عكس قيد');

  const severity = isCritical && amount >= settings.criticalThreshold * 4 ? 'high' : 'medium';
  const alertDoc = {
    severity,
    reasons,
    eventType: entry.eventType || '',
    type: entry.type || '',
    direction: entry.direction || '',
    amount,
    walletId:   entry.walletId || null,
    walletName: entry.walletName || '',
    orderId:    entry.orderId    || null,
    clientId:   entry.clientId   || null,
    clientName: entry.clientName || '',
    employeeId: entry.employeeId || null,
    vendorId:   entry.vendorId   || null,
    createdBy:     entry.createdBy     || null,
    createdByName: entry.createdByName || '',
    ledgerEntryId: e.params.entryId,
    acknowledged: false,
    acknowledgedBy: null,
    acknowledgedAt: null,
    createdAt: FieldValue.serverTimestamp(),
  };
  await db.collection('admin_alerts').add(alertDoc);

  const tokens = await getRoleTokens(['admin', 'operation_manager']);
  const titleIco = severity === 'high' ? '🚨' : '⚠️';
  const title = `${titleIco} حركة مالية حرجة`;
  const body  = `${reasons.join(' · ')} — ${entry.eventType || ''}`;
  await sendPush({
    tokens, title, body,
    data: { type: 'financial_alert', severity, entryId: e.params.entryId },
    link: '/financial-dashboard.html',
  });
});

// ════════════════════════════════════════════════════════════════════════════
//   SCHEDULED: Daily client follow-up reminders (8 AM Cairo)
// ════════════════════════════════════════════════════════════════════════════
//
// Reads all open follow-ups whose nextActionDate is due (≤ today), groups by
// assignedTo, and sends each user one digest push + an in-app notification.
// The in-app feed already shows due follow-ups via onSnapshot — this adds the
// daily morning prompt so reps don't miss them when offline.

exports.dailyFollowupReminders = onSchedule(
  { schedule: '0 8 * * *', timeZone: 'Africa/Cairo' },
  async () => {
    const now = Date.now();
    const snap = await db.collection('client_followups').get();
    const byUid = new Map();
    snap.forEach(d => {
      const f = d.data();
      if (f.isDeleted) return;
      if (f.nextActionDone) return;
      if (!f.nextActionDate || !f.assignedTo) return;
      const t = new Date(f.nextActionDate).getTime();
      if (isNaN(t) || t > now) return;
      if (!byUid.has(f.assignedTo)) byUid.set(f.assignedTo, []);
      byUid.get(f.assignedTo).push({ id: d.id, ...f });
    });

    if (byUid.size === 0) {
      console.log('[dailyFollowupReminders] no due follow-ups');
      return;
    }

    let totalPushed = 0;
    for (const [uid, items] of byUid.entries()) {
      const count = items.length;
      const sample = items.slice(0, 3).map(x => x.clientName || 'عميل').join(', ');
      const title = `📞 ${count} متابعة مستحقّة اليوم`;
      const body  = count > 3 ? `${sample} و${count - 3} آخرين` : sample;
      const link  = '/clients.html?tab=followups';
      const tokens = await getUserTokens(uid);
      const r = await sendPush({
        tokens, title, body,
        data: { type: 'followup_due', count: String(count) }, link,
      });
      totalPushed += r.sent;
      await createInAppNotification({
        toUid: uid, title, desc: body, ico: '📞',
        link, type: 'followup_due', entityId: null,
      });
    }
    console.log(`[dailyFollowupReminders] ${byUid.size} users notified, ${totalPushed} push delivered`);
  }
);

// ════════════════════════════════════════════════════════════════════════════
//   SCHEDULED: Auto-archive old paid orders (Sunday 3 AM Cairo)
// ════════════════════════════════════════════════════════════════════════════
//
// Moves orders that meet ALL of:
//   - stage == 'archived' (already at terminal stage in workflow)
//   - paymentStatus == 'paid' (no outstanding balance)
//   - updatedAt   <  6 months ago
//
// to `archived_orders`. This keeps the live `orders` collection small for
// faster snapshot listeners. RULE 1: we copy, not transform — financial
// linkage stays intact (financial_ledger references orderId verbatim).
//
// RULE 6: existing orders.html / archive.html paths still work — they read
// from `orders` for live and can read from `archived_orders` if added later.
// We start by copying + deleting only orders that are PAID + ARCHIVED, so no
// open balance moves out of view.

const ARCHIVE_AGE_MONTHS = 6;
const ARCHIVE_BATCH_LIMIT = 100; // per run; safe for free-tier execution time

exports.autoArchiveOldPaidOrders = onSchedule(
  { schedule: '0 3 * * 0', timeZone: 'Africa/Cairo', timeoutSeconds: 540 },
  async () => {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - ARCHIVE_AGE_MONTHS);

    const snap = await db.collection('orders')
      .where('stage', '==', 'archived')
      .where('paymentStatus', '==', 'paid')
      .limit(ARCHIVE_BATCH_LIMIT * 3) // over-fetch then filter by updatedAt client-side
      .get();

    let moved = 0, skipped = 0;
    for (const d of snap.docs) {
      if (moved >= ARCHIVE_BATCH_LIMIT) break;
      const o = d.data();
      const updatedAt = o.updatedAt?.toDate?.() || o.createdAt?.toDate?.() || null;
      if (!updatedAt || updatedAt > cutoff) { skipped++; continue; }

      const wb = db.batch();
      wb.set(db.doc(`archived_orders/${d.id}`), {
        ...o,
        archivedAt: FieldValue.serverTimestamp(),
        archiveReason: 'auto_age_paid',
        originalCollection: 'orders',
      });
      wb.delete(d.ref);
      try {
        await wb.commit();
        moved++;
      } catch (e) {
        console.error('archive failed for', d.id, e.message);
        skipped++;
      }
    }
    console.log(`[autoArchiveOldPaidOrders] moved=${moved} skipped=${skipped} cutoff=${cutoff.toISOString()}`);
  }
);

// ════════════════════════════════════════════════════════════════════════════
//   SCHEDULED: Daily Firestore backup (3 AM Cairo)
// ════════════════════════════════════════════════════════════════════════════
//
// Exports the live Firestore database to a GCS bucket using the Admin client.
// Bucket convention: gs://<projectId>-firestore-backups/<YYYY-MM-DD>/
//
// One-time setup required by the operator (NOT in this code):
//   1) Create the bucket: gsutil mb -l us-central1 gs://business2card-c041b-firestore-backups
//   2) Grant the Functions service account `roles/datastore.importExportAdmin`
//   3) Grant it `roles/storage.objectAdmin` on the bucket
//   See: https://firebase.google.com/docs/firestore/manage-data/export-import
//
// The function logs the operation name; check progress with `gcloud firestore
// operations describe <name>`.

exports.scheduledFirestoreBackup = onSchedule(
  { schedule: '0 3 * * *', timeZone: 'Africa/Cairo', timeoutSeconds: 540 },
  async () => {
    // Lazy require so cold-start of unrelated triggers stays light
    const { v1 } = require('@google-cloud/firestore');
    const client = new v1.FirestoreAdminClient();
    const projectId = process.env.GCLOUD_PROJECT
                   || process.env.GOOGLE_CLOUD_PROJECT
                   || 'business2card-c041b';
    const databaseName = client.databasePath(projectId, '(default)');
    const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const bucket = `gs://${projectId}-firestore-backups`;

    try {
      const [op] = await client.exportDocuments({
        name: databaseName,
        outputUriPrefix: `${bucket}/${stamp}`,
        collectionIds: [], // empty == all collections
      });
      console.log(`[scheduledFirestoreBackup] export started: ${op.name}`);

      // Track in Firestore so the admin can see backup history in the UI later
      await db.collection('backup_logs').add({
        kind: 'firestore_export',
        operationName: op.name || '',
        outputPrefix: `${bucket}/${stamp}`,
        status: 'started',
        startedAt: FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.error('[scheduledFirestoreBackup] failed', e);
      await db.collection('backup_logs').add({
        kind: 'firestore_export',
        status: 'failed',
        error: e.message || String(e),
        startedAt: FieldValue.serverTimestamp(),
      }).catch(() => {});
      throw e;
    }
  }
);

// ════════════════════════════════════════════════════════════════════════════
//   ML: Weekly RFM segmentation + churn risk per client
// ════════════════════════════════════════════════════════════════════════════
//
// Recency / Frequency / Monetary scoring, computed weekly from `orders`.
// Output: `client_segments/{clientId}` — read-only for pages, written here.
//
// RFM is the industry-standard CRM technique used before reaching for ML
// proper: each client gets a 1-5 score on each axis (quintile of the cohort)
// and a segment label drawn from the standard 11-segment RFM model.
// Computational cost: O(N orders + N clients log N) — fine to ~100K orders.
//
// We deliberately do NOT mutate `clients/*` from here (RULE 6: backward-
// compat). Pages that want the segment look it up in `client_segments` by id.

const RFM_LOOKBACK_DAYS = 365;
const RFM_MAX_ORDERS = 50000; // hard cap so a runaway scan can't blow the timer

exports.weeklyChurnRfmAnalysis = onSchedule(
  { schedule: '0 4 * * 1', timeZone: 'Africa/Cairo', timeoutSeconds: 540, memory: '1GiB' },
  async () => {
    const cutoff = new Date(Date.now() - RFM_LOOKBACK_DAYS * 86400000);

    const ordersSnap = await db.collection('orders')
      .where('createdAt', '>=', cutoff)
      .limit(RFM_MAX_ORDERS)
      .get();

    if (ordersSnap.empty) {
      console.log('[weeklyChurnRfmAnalysis] no orders in window — nothing to compute');
      return;
    }

    // Aggregate per client (skip cancelled — they are non-revenue)
    const now = Date.now();
    const byClient = new Map();
    ordersSnap.forEach(d => {
      const o = d.data();
      if (!o.clientId) return;
      if (o.stage === 'cancelled') return;

      const created = o.createdAt?.toDate?.()?.getTime() || 0;
      if (!created) return;

      const ship  = Number(o.customerShipFee) || 0;
      const sale  = Number(o.salePrice)       || 0;
      const disc  = Number(o.discount)        || 0;
      const revenue = Math.max(0, sale + ship - disc);

      let r = byClient.get(o.clientId);
      if (!r) {
        r = {
          clientId:   o.clientId,
          clientName: o.clientName || '',
          lastOrderTs: 0,
          orderCount:  0,
          totalRevenue: 0,
        };
        byClient.set(o.clientId, r);
      }
      r.lastOrderTs   = Math.max(r.lastOrderTs, created);
      r.orderCount   += 1;
      r.totalRevenue += revenue;
      if (!r.clientName && o.clientName) r.clientName = o.clientName;
    });

    if (byClient.size === 0) {
      console.log('[weeklyChurnRfmAnalysis] no eligible orders after filtering');
      return;
    }

    const clients = [...byClient.values()];
    clients.forEach(c => { c.recencyDays = Math.floor((now - c.lastOrderTs) / 86400000); });

    // Quintile scorer — returns a fn that maps value → 1..5.
    // `higherIsBetter` controls direction: revenue/frequency are higher-better,
    // recencyDays is lower-better (we invert).
    function quintileScorer(values, higherIsBetter) {
      const sorted = [...values].sort((a, b) => a - b);
      const n = sorted.length;
      // 5 buckets ⇒ 4 cut points at the 20/40/60/80 percentiles
      const cuts = [0.2, 0.4, 0.6, 0.8].map(q => sorted[Math.min(n - 1, Math.floor(n * q))]);
      return v => {
        let s = 1;
        for (const cut of cuts) if (v >= cut) s++;
        return higherIsBetter ? s : (6 - s);
      };
    }

    const rScore = quintileScorer(clients.map(c => c.recencyDays), false);
    const fScore = quintileScorer(clients.map(c => c.orderCount), true);
    const mScore = quintileScorer(clients.map(c => c.totalRevenue), true);

    // Segment classifier — maps the (R,F,M) tuple to one of the 8 standard
    // CRM segments. Order matters: the first matching rule wins.
    function classify(R, F, M) {
      if (R >= 4 && F >= 4 && M >= 4) return { segment: 'champion',          label: 'بطل',           ico: '🏆' };
      if (R <= 2 && F >= 4 && M >= 4) return { segment: 'cant_lose',         label: 'لا يجب فقده',  ico: '🚨' };
      if (R <= 2 && F >= 3 && M >= 3) return { segment: 'at_risk',           label: 'مهدّد بالفقد',  ico: '⚠️' };
      if (R >= 4 && F >= 3)           return { segment: 'loyal',             label: 'وفي',           ico: '💎' };
      if (R >= 4 && F <= 2)           return { segment: 'new',               label: 'جديد/واعد',    ico: '🌱' };
      if (R == 3 && F >= 3)           return { segment: 'needs_attention',   label: 'يحتاج اهتمام',  ico: '👀' };
      if (R <= 2 && F <= 2 && M <= 2) return { segment: 'lost',              label: 'فُقِد',         ico: '💤' };
      if (R == 3 && F <= 2)           return { segment: 'about_to_sleep',    label: 'على وشك الفقد', ico: '😴' };
      return { segment: 'normal', label: 'عادي', ico: '👤' };
    }

    // Churn risk score 0-100. Heuristic: recency dominates (60%), low frequency
    // adds risk (20%), low monetary adds risk (20%). Recent + frequent ⇒ ~0.
    function churnRisk(R, F, M, c) {
      const recencyComp   = Math.min(60, c.recencyDays / 180 * 60);
      const frequencyComp = (5 - F) * 4;  // 0..20
      const monetaryComp  = (5 - M) * 4;  // 0..20
      return Math.max(0, Math.min(100, Math.round(recencyComp + frequencyComp + monetaryComp)));
    }

    // Write in chunks (writeBatch caps at 500 ops)
    let written = 0;
    const segCounts = {};
    for (let i = 0; i < clients.length; i += 400) {
      const chunk = clients.slice(i, i + 400);
      const batch = db.batch();
      chunk.forEach(c => {
        const R = rScore(c.recencyDays);
        const F = fScore(c.orderCount);
        const M = mScore(c.totalRevenue);
        const seg = classify(R, F, M);
        const risk = churnRisk(R, F, M, c);
        segCounts[seg.segment] = (segCounts[seg.segment] || 0) + 1;
        batch.set(db.doc(`client_segments/${c.clientId}`), {
          clientId: c.clientId,
          clientName: c.clientName,
          recencyScore:   R,
          frequencyScore: F,
          monetaryScore:  M,
          recencyDays:   c.recencyDays,
          orderCount:    c.orderCount,
          totalRevenue:  Math.round(c.totalRevenue),
          lastOrderAt:   new Date(c.lastOrderTs),
          segment:       seg.segment,
          segmentLabel:  seg.label,
          segmentIco:    seg.ico,
          churnRisk:     risk,
          rfmCode:       `${R}${F}${M}`,
          windowDays:    RFM_LOOKBACK_DAYS,
          computedAt:    FieldValue.serverTimestamp(),
        }, { merge: true });
        written++;
      });
      await batch.commit();
    }

    // Snapshot the run for the dashboard / history
    await db.collection('rfm_runs').add({
      windowDays:   RFM_LOOKBACK_DAYS,
      clientCount:  written,
      segmentCounts: segCounts,
      runAt:        FieldValue.serverTimestamp(),
    });

    console.log(`[weeklyChurnRfmAnalysis] wrote ${written} segments — distribution:`, segCounts);
  }
);

// ════════════════════════════════════════════════════════════════════════════
//   ML: Daily statistical anomaly scan on financial_ledger
// ════════════════════════════════════════════════════════════════════════════
//
// Complements the realtime `onCriticalFinancialEntry` (which alerts on a hard
// 50,000 threshold). This batch run catches the OPPOSITE class of issue:
// amounts that are statistically odd for their event type, even if they're
// below the absolute threshold. Example: a SHIPPING_EXPENSE of 800 ج.م when
// the 90-day mean for SHIPPING_EXPENSE is 120 ± 40 ⇒ z ≈ 17, almost certainly
// a data-entry mistake.
//
// Algorithm: per eventType, compute mean + stdev over the last 90 days
// (excluding deleted entries). Then for entries created in the last ~25 hours
// (small overlap with the daily run to avoid edge misses), flag any with
// |z| ≥ 3 — provided we have at least 20 historical samples in that bucket
// (without enough data, std-dev is meaningless and we'd cry wolf).
//
// Dedup: an existing admin_alerts row with the same ledgerEntryId means the
// realtime trigger already fired — skip.

const ANOMALY_LOOKBACK_DAYS = 90;
const ANOMALY_RECENT_HOURS  = 25;
const ANOMALY_Z_THRESHOLD   = 3;
const ANOMALY_MIN_SAMPLES   = 20;

exports.dailyFinancialAnomalyScan = onSchedule(
  { schedule: '15 6 * * *', timeZone: 'Africa/Cairo', timeoutSeconds: 540, memory: '512MiB' },
  async () => {
    const lookbackCutoff = new Date(Date.now() - ANOMALY_LOOKBACK_DAYS * 86400000);
    const recentCutoff   = new Date(Date.now() - ANOMALY_RECENT_HOURS  * 3600000);

    const snap = await db.collection('financial_ledger')
      .where('createdAt', '>=', lookbackCutoff)
      .get();

    // Bucket by eventType: keep amount samples for stats + recent rows for scoring
    const groups = new Map();
    snap.forEach(d => {
      const e = d.data();
      if (e.isDeleted) return;
      const t = e.eventType || 'unknown';
      const amount = Number(e.amount) || 0;
      if (!Number.isFinite(amount) || amount <= 0) return;

      let g = groups.get(t);
      if (!g) { g = { values: [], recent: [] }; groups.set(t, g); }
      g.values.push(amount);

      const created = e.createdAt?.toDate?.();
      if (created && created >= recentCutoff) {
        g.recent.push({ id: d.id, amount, ...e });
      }
    });

    let alertsCreated = 0;
    let groupsScanned  = 0;
    for (const [eventType, g] of groups.entries()) {
      if (g.values.length < ANOMALY_MIN_SAMPLES) continue;
      if (g.recent.length === 0) continue;
      groupsScanned++;

      const mean = g.values.reduce((a, b) => a + b, 0) / g.values.length;
      const variance = g.values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / g.values.length;
      const stdev = Math.sqrt(variance);
      if (stdev === 0) continue;

      for (const e of g.recent) {
        const z = (e.amount - mean) / stdev;
        if (Math.abs(z) < ANOMALY_Z_THRESHOLD) continue;

        // Skip if the realtime critical trigger already alerted on this entry
        const exists = await db.collection('admin_alerts')
          .where('ledgerEntryId', '==', e.id)
          .limit(1).get();
        if (!exists.empty) continue;

        const severity = Math.abs(z) >= 5 ? 'high' : 'medium';
        const direction = e.amount > mean ? 'أعلى' : 'أقل';
        await db.collection('admin_alerts').add({
          severity,
          source: 'statistical_zscore',
          reasons: [
            `حركة ${direction} بكثير من المعتاد لـ ${eventType}` +
            ` (z=${z.toFixed(2)}, متوسط=${Math.round(mean).toLocaleString('en-EG')}, σ=${Math.round(stdev).toLocaleString('en-EG')})`
          ],
          eventType,
          type:      e.type || '',
          direction: e.direction || '',
          amount:    e.amount,
          walletId:   e.walletId   || null,
          walletName: e.walletName || '',
          orderId:    e.orderId    || null,
          clientId:   e.clientId   || null,
          clientName: e.clientName || '',
          employeeId: e.employeeId || null,
          vendorId:   e.vendorId   || null,
          createdBy:     e.createdBy     || null,
          createdByName: e.createdByName || '',
          ledgerEntryId: e.id,
          stats: {
            mean:   Math.round(mean),
            stdev:  Math.round(stdev),
            zScore: Number(z.toFixed(2)),
            sampleSize: g.values.length,
          },
          acknowledged:   false,
          acknowledgedBy: null,
          acknowledgedAt: null,
          createdAt: FieldValue.serverTimestamp(),
        });
        alertsCreated++;
      }
    }
    console.log(`[dailyFinancialAnomalyScan] groups=${groupsScanned}/${groups.size}, alerts=${alertsCreated}`);
  }
);

// ════════════════════════════════════════════════════════════════════════════
//   ML: Weekly revenue forecast (statistical Holt-Winters-style smoothing)
// ════════════════════════════════════════════════════════════════════════════
//
// Method: simple exponential smoothing on daily revenue series, with a
// 7-day seasonal additive component (day-of-week effect captured from the
// trailing 8 weeks). No external libs — all closed-form math.
//
// Output: `forecasts/{YYYY-MM-DD}` keyed by run date with arrays for the next
// 14 days. Pages render directly from there (RULE 1 — no recompute on read).
//
// Why not BigQuery ARIMA? Free-tier-friendly: this runs in Node in <2s on
// ~1 year of daily aggregates with zero infrastructure. We can swap in BQML
// later if the time-series gets noisy enough to need it.

const FORECAST_HISTORY_DAYS  = 365;
const FORECAST_HORIZON_DAYS  = 14;
const FORECAST_ALPHA         = 0.30; // level smoothing (0..1, higher = more reactive)
const FORECAST_SEASON_LENGTH = 7;
const FORECAST_SEASON_WEEKS  = 8;    // weeks of history used to compute seasonal indices

exports.weeklyRevenueForecast = onSchedule(
  { schedule: '0 5 * * 1', timeZone: 'Africa/Cairo', timeoutSeconds: 300, memory: '512MiB' },
  async () => {
    const cutoff = new Date(Date.now() - FORECAST_HISTORY_DAYS * 86400000);

    const snap = await db.collection('orders')
      .where('createdAt', '>=', cutoff)
      .get();

    if (snap.empty) {
      console.log('[weeklyRevenueForecast] no orders in history window');
      return;
    }

    // Bucket revenue by ISO date (UTC). Cancelled orders excluded — they are
    // non-revenue. We use sale + ship - discount as the booking value (matches
    // calcRem in index.html so dashboards stay consistent).
    const byDay = new Map();
    snap.forEach(d => {
      const o = d.data();
      if (o.stage === 'cancelled') return;
      const created = o.createdAt?.toDate?.();
      if (!created) return;
      const dayKey = created.toISOString().slice(0, 10);
      const ship  = Number(o.customerShipFee) || 0;
      const sale  = Number(o.salePrice)       || 0;
      const disc  = Number(o.discount)        || 0;
      const rev   = Math.max(0, sale + ship - disc);
      byDay.set(dayKey, (byDay.get(dayKey) || 0) + rev);
    });

    if (byDay.size < FORECAST_SEASON_LENGTH * 2) {
      console.log(`[weeklyRevenueForecast] insufficient history (${byDay.size} days) — skipping`);
      return;
    }

    // Build a continuous daily series from earliest day to yesterday (fill
    // missing days with 0 — important so smoothing doesn't drift on gaps).
    const days = [...byDay.keys()].sort();
    const startDate = new Date(days[0] + 'T00:00:00Z');
    const endDate   = new Date();   // up to today (today excluded since incomplete)
    endDate.setUTCHours(0, 0, 0, 0);

    const series = [];
    for (let t = startDate.getTime(); t < endDate.getTime(); t += 86400000) {
      const k = new Date(t).toISOString().slice(0, 10);
      series.push({ date: k, revenue: byDay.get(k) || 0 });
    }
    if (series.length < FORECAST_SEASON_LENGTH * 2) return;

    // ── Seasonal indices: average revenue per day-of-week over the last
    // SEASON_WEEKS weeks, normalized so the indices sum to SEASON_LENGTH.
    const tail = series.slice(-FORECAST_SEASON_LENGTH * FORECAST_SEASON_WEEKS);
    const dowSums   = new Array(FORECAST_SEASON_LENGTH).fill(0);
    const dowCounts = new Array(FORECAST_SEASON_LENGTH).fill(0);
    tail.forEach(p => {
      const dow = new Date(p.date + 'T00:00:00Z').getUTCDay();
      dowSums[dow]   += p.revenue;
      dowCounts[dow] += 1;
    });
    const dowAvg = dowSums.map((s, i) => dowCounts[i] ? s / dowCounts[i] : 0);
    const meanOfAvg = dowAvg.reduce((a, b) => a + b, 0) / FORECAST_SEASON_LENGTH || 1;
    const seasonalIdx = dowAvg.map(v => v / meanOfAvg); // 1.0 == typical day

    // ── De-seasonalize then smooth (simple exponential smoothing, level only).
    // For each point: deSeas = revenue / seasonalIdx[dow]. Level updated with
    // FORECAST_ALPHA. Final level becomes the baseline for the horizon.
    let level = series[0].revenue;
    for (const p of series) {
      const dow = new Date(p.date + 'T00:00:00Z').getUTCDay();
      const sIdx = seasonalIdx[dow] || 1;
      const deSeas = sIdx ? p.revenue / sIdx : p.revenue;
      level = FORECAST_ALPHA * deSeas + (1 - FORECAST_ALPHA) * level;
    }

    // ── Project the horizon: re-apply the seasonal index for each future day
    const horizon = [];
    for (let i = 1; i <= FORECAST_HORIZON_DAYS; i++) {
      const t = endDate.getTime() + (i - 1) * 86400000;
      const date = new Date(t);
      const dow  = date.getUTCDay();
      const sIdx = seasonalIdx[dow] || 1;
      horizon.push({
        date: date.toISOString().slice(0, 10),
        forecast: Math.max(0, Math.round(level * sIdx)),
        seasonalIndex: Number(sIdx.toFixed(2)),
      });
    }

    // Aggregate next-7 / next-14 totals for headline cards
    const next7  = horizon.slice(0, 7).reduce((s, p) => s + p.forecast, 0);
    const next14 = horizon.reduce((s, p) => s + p.forecast, 0);

    // Compare with trailing 7d actual to give a delta signal
    const trailing7 = series.slice(-7).reduce((s, p) => s + p.revenue, 0);
    const deltaPct = trailing7 ? Math.round(((next7 - trailing7) / trailing7) * 100) : 0;

    const runId = endDate.toISOString().slice(0, 10);
    await db.doc(`forecasts/${runId}`).set({
      runId,
      kind: 'revenue_daily',
      methodology: 'exp_smoothing_with_dow_seasonality',
      params: {
        alpha: FORECAST_ALPHA,
        seasonLength: FORECAST_SEASON_LENGTH,
        seasonWeeks: FORECAST_SEASON_WEEKS,
        historyDays: FORECAST_HISTORY_DAYS,
      },
      level: Math.round(level),
      seasonalIdx: seasonalIdx.map(v => Number(v.toFixed(2))),
      horizon,
      next7DayTotal:  next7,
      next14DayTotal: next14,
      trailing7DayActual: Math.round(trailing7),
      deltaPctVsTrailing7: deltaPct,
      historyPoints: series.length,
      runAt: FieldValue.serverTimestamp(),
    });

    console.log(`[weeklyRevenueForecast] runId=${runId} next7=${next7} next14=${next14} Δ=${deltaPct}% (vs trailing 7)`);
  }
);

// ════════════════════════════════════════════════════════════════════════════
//   ML: Weekly product recommendations (sequential collaborative filtering)
// ════════════════════════════════════════════════════════════════════════════
//
// Each order in this ERP has a single `productName`, so we model a client's
// history as an ordered SEQUENCE of products (P1 → P2 → P3 …). We learn the
// global affinity matrix `nextCount[A][B]` = "how often did B appear as the
// NEXT order after A across all clients", then for each client we recommend
// the top-K products that historically follow their most recent order.
//
// Outputs:
//   product_recommendations/{clientId}  → top 5 next products per client
//   product_affinities/{productName}    → top 5 next products globally per product
//
// This is intentionally small-data friendly — no embeddings, no LLM calls,
// pure counts. Quality scales with order volume; recommendations get sharper
// as more orders pile up.

const REC_HISTORY_DAYS = 365;
const REC_TOP_K        = 5;
const REC_MIN_SUPPORT  = 2;     // require 2+ co-occurrences before we trust a pair
const REC_MAX_ORDERS   = 50000;

exports.weeklyProductRecommendations = onSchedule(
  { schedule: '30 4 * * 1', timeZone: 'Africa/Cairo', timeoutSeconds: 540, memory: '1GiB' },
  async () => {
    const cutoff = new Date(Date.now() - REC_HISTORY_DAYS * 86400000);

    const snap = await db.collection('orders')
      .where('createdAt', '>=', cutoff)
      .limit(REC_MAX_ORDERS)
      .get();

    if (snap.empty) {
      console.log('[weeklyProductRecommendations] no orders in window');
      return;
    }

    // Bucket by client; keep only orders with a productName + non-cancelled
    const byClient = new Map();
    snap.forEach(d => {
      const o = d.data();
      if (!o.clientId) return;
      if (o.stage === 'cancelled') return;
      const product = (o.productName || o.product || '').trim();
      if (!product) return;
      const ts = o.createdAt?.toDate?.()?.getTime() || 0;
      if (!ts) return;
      let arr = byClient.get(o.clientId);
      if (!arr) { arr = []; byClient.set(o.clientId, arr); }
      arr.push({ product, ts, clientName: o.clientName || '' });
    });

    if (byClient.size === 0) {
      console.log('[weeklyProductRecommendations] no eligible orders after filtering');
      return;
    }

    // Sort each client's orders chronologically + harvest sequential pairs.
    // nextCount[A][B] = number of times product A was followed by product B
    // (across all clients).
    const nextCount = new Map();
    const productCount = new Map(); // total occurrences (used for popularity tie-break)
    for (const orders of byClient.values()) {
      orders.sort((a, b) => a.ts - b.ts);
      for (let i = 0; i < orders.length; i++) {
        const p = orders[i].product;
        productCount.set(p, (productCount.get(p) || 0) + 1);
        if (i === orders.length - 1) continue;
        const next = orders[i + 1].product;
        if (next === p) continue; // skip self-loops (re-orders of the same product)
        let row = nextCount.get(p);
        if (!row) { row = new Map(); nextCount.set(p, row); }
        row.set(next, (row.get(next) || 0) + 1);
      }
    }

    // Build per-product top-K recommendations (the global affinity table).
    const productAffinities = new Map();
    for (const [p, row] of nextCount.entries()) {
      const ranked = [...row.entries()]
        .filter(([_, c]) => c >= REC_MIN_SUPPORT)
        .sort((a, b) => b[1] - a[1])
        .slice(0, REC_TOP_K)
        .map(([nextP, count]) => ({
          product: nextP,
          count,
          confidence: Number((count / (productCount.get(p) || 1)).toFixed(3)),
        }));
      if (ranked.length) productAffinities.set(p, ranked);
    }

    // Per-client recommendations: take their most recent product, look up the
    // affinity row, exclude products they've already bought.
    const clientRecs = [];
    for (const [clientId, orders] of byClient.entries()) {
      orders.sort((a, b) => b.ts - a.ts); // newest first
      const seen = new Set(orders.map(o => o.product));
      const last = orders[0];
      const aff = productAffinities.get(last.product);
      if (!aff || aff.length === 0) continue;
      const recs = aff.filter(r => !seen.has(r.product)).slice(0, REC_TOP_K);
      if (!recs.length) continue;
      clientRecs.push({
        clientId,
        clientName: last.clientName,
        basedOn: last.product,
        recommendations: recs,
      });
    }

    // Persist client recs in batched writes
    let writtenClients = 0;
    for (let i = 0; i < clientRecs.length; i += 400) {
      const chunk = clientRecs.slice(i, i + 400);
      const batch = db.batch();
      chunk.forEach(rec => {
        batch.set(db.doc(`product_recommendations/${rec.clientId}`), {
          clientId:   rec.clientId,
          clientName: rec.clientName,
          basedOnProduct: rec.basedOn,
          recommendations: rec.recommendations,
          windowDays: REC_HISTORY_DAYS,
          computedAt: FieldValue.serverTimestamp(),
        });
        writtenClients++;
      });
      await batch.commit();
    }

    // Persist global affinities (per product). Sanitize doc ids — productName
    // can contain '/' which Firestore rejects in document paths.
    const safeId = s => String(s).replace(/\//g, '_').replace(/^\.+/, '_').slice(0, 120);
    let writtenProducts = 0;
    const productEntries = [...productAffinities.entries()];
    for (let i = 0; i < productEntries.length; i += 400) {
      const chunk = productEntries.slice(i, i + 400);
      const batch = db.batch();
      chunk.forEach(([product, affinities]) => {
        const id = safeId(product);
        if (!id) return;
        batch.set(db.doc(`product_affinities/${id}`), {
          product,
          affinities,
          totalOccurrences: productCount.get(product) || 0,
          windowDays: REC_HISTORY_DAYS,
          computedAt: FieldValue.serverTimestamp(),
        });
        writtenProducts++;
      });
      await batch.commit();
    }

    console.log(`[weeklyProductRecommendations] clients=${writtenClients}, products=${writtenProducts}, pairs=${nextCount.size}`);
  }
);

// ════════════════════════════════════════════════════════════════════════════
//   GENKIT: AI-powered client analysis
// ════════════════════════════════════════════════════════════════════════════
//
// Callable wrapping the Genkit client analysis flow. The caller passes their
// own Gemini API key (same one stored in localStorage by ai-engine.js) — we
// never persist it. This keeps secret management on the user's device while
// still letting us run heavy Firestore queries server-side.
//
// Output is a Zod-validated structured object (see genkit-flows.js for schema).

const { analyzeClient, analyzeSuggestion } = require('./genkit-flows');

exports.analyzeClientWithAI = onCall(
  { ...CALL_OPTS, memory: '512MiB', timeoutSeconds: 90 },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول');
    const { clientId, apiKey } = req.data || {};
    if (!clientId || typeof clientId !== 'string') {
      throw new HttpsError('invalid-argument', 'clientId مطلوب');
    }
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.startsWith('AIza')) {
      throw new HttpsError('invalid-argument', 'مفتاح Gemini API مطلوب — اضبطه أولاً في صفحة AI Insights');
    }

    // Permission: same as reading clients
    const callerSnap = await db.doc(`users/${req.auth.uid}`).get();
    if (!callerSnap.exists) throw new HttpsError('permission-denied', 'حساب غير مسجل');
    const callerRole = callerSnap.data().role || '';
    const callerPerms = callerSnap.data().permissions || {};
    const pages = callerPerms.pages || [];
    const isAdmin = ['admin', 'operation_manager'].includes(callerRole);
    const canView = isAdmin || pages.includes('clients') || pages.includes('*');
    if (!canView) throw new HttpsError('permission-denied', 'صلاحية قراءة العملاء مطلوبة');

    try {
      const result = await analyzeClient(apiKey, clientId);
      if (result && result.error === 'client_not_found') {
        throw new HttpsError('not-found', result.message);
      }
      return result;
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      console.error('[analyzeClientWithAI] error', e);
      const msg = e.message || String(e);
      if (msg.includes('API key') || msg.includes('401') || msg.includes('403')) {
        throw new HttpsError('failed-precondition', 'مفتاح API غير صالح — حدّثه من ai-insights.html');
      }
      throw new HttpsError('internal', `AI: ${msg.slice(0, 200)}`);
    }
  }
);

// ════════════════════════════════════════════════════════════
// Suggestion AI Analysis — Callable
// ════════════════════════════════════════════════════════════
// أي موظف مصادَق يقدر يحلّل اقتراحه الخاص. الأدمن يقدر يحلّل أي اقتراح.
// التحليل يُكتب على /employee_suggestions/{id} في حقل aiAnalysis (admin SDK يتجاوز rules).
// كمان يُضاف comment من نوع 'ai' في subcollection /comments للظهور في الـ thread.

exports.analyzeSuggestionWithAI = onCall(
  { ...CALL_OPTS, memory: '512MiB', timeoutSeconds: 60 },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول');
    const { suggestionId, apiKey } = req.data || {};
    if (!suggestionId || typeof suggestionId !== 'string') {
      throw new HttpsError('invalid-argument', 'suggestionId مطلوب');
    }
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.startsWith('AIza')) {
      throw new HttpsError('invalid-argument', 'مفتاح Gemini API مطلوب — اضبطه أولاً في ai-insights.html');
    }

    const sugRef = db.doc(`employee_suggestions/${suggestionId}`);
    const sugSnap = await sugRef.get();
    if (!sugSnap.exists) throw new HttpsError('not-found', 'الاقتراح غير موجود');
    const suggestion = sugSnap.data();

    // Permission: submitter or admin/ops can trigger
    const callerSnap = await db.doc(`users/${req.auth.uid}`).get();
    if (!callerSnap.exists) throw new HttpsError('permission-denied', 'حساب غير مسجل');
    const callerRole = callerSnap.data().role || '';
    const isAdmin = ['admin', 'operation_manager'].includes(callerRole);
    const isOwner = suggestion.submittedBy === req.auth.uid;
    if (!isAdmin && !isOwner) {
      throw new HttpsError('permission-denied', 'صلاحية مراجعة الاقتراح غير متاحة');
    }

    try {
      const analysis = await analyzeSuggestion(apiKey, suggestion);

      // Write analysis back via Admin SDK
      await sugRef.update({
        aiAnalysis: analysis,
        aiAnalyzedAt: new Date(),
        aiAnalyzedBy: req.auth.uid,
      });

      // Add a 'ai' comment to the thread (so the conversation flow is visible)
      const summary = [
        `📊 **${analysis.tldr || 'تحليل الاقتراح'}**`,
        '',
        `**التعقيد:** ${analysis.estimatedComplexity}  •  **الأثر:** ${analysis.estimatedImpact}  •  **التوصية:** ${analysis.recommendation}`,
        '',
        analysis.clarifyingQuestion ? `❓ **سؤال للموظف:** ${analysis.clarifyingQuestion}` : '',
      ].filter(Boolean).join('\n');

      await sugRef.collection('comments').add({
        senderId: 'ai',
        senderName: 'Claude AI',
        senderType: 'ai',
        text: summary,
        createdAt: new Date(),
      });

      return { ok: true, analysis };
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      console.error('[analyzeSuggestionWithAI] error', e);
      const msg = e.message || String(e);
      if (msg.includes('API key') || msg.includes('401') || msg.includes('403')) {
        throw new HttpsError('failed-precondition', 'مفتاح API غير صالح — حدّثه من ai-insights.html');
      }
      throw new HttpsError('internal', `AI: ${msg.slice(0, 200)}`);
    }
  }
);

// ════════════════════════════════════════════════════════════════════════════
//   TRIGGER: C2 — detect direct writes to financial_ledger bypassing the engine
// ════════════════════════════════════════════════════════════════════════════
//
// كل ledger entry من الـ engines (FSE/MKE/RET) يحمل engineSignature.
// لو entry تم إنشاؤه بدون الـ signature → يعني كُتب مباشرة بدون engine.
// هذا انتهاك لـ RULE 2 — يُسجَّل في admin_alerts للمتابعة.
//
// Observability فقط — لا يمنع الكتابة (الـ Firestore rules تسمح بها).
// بعد فترة مراقبة، يمكن تشديد الـ rules لرفض الكتابة بدون signature.

exports.detectEngineBypass = onDocumentCreated(
  { document: 'financial_ledger/{ledgerId}', region: 'us-central1' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const d = snap.data() || {};

    // الـ engines الجديدة دائماً تضيف engineSignature
    if (d.engineWrite === true && d.engineSignature) return;

    // entries قديمة قد لا يكون لها signature — تُتجاهَل بناءً على createdAt
    // إذا اللديك entries قبل deploy هذا التغيير، فلترها بـ migration version
    // لكن للأمان نُسجِّل كل ما لا يحمل signature
    try {
      await db.collection('admin_alerts').add({
        type:        'rule2_bypass',
        severity:    'high',
        title:       '⛔ كتابة مالية بدون engine signature',
        body:        `ledger entry ${event.params.ledgerId} كُتب بدون marker الـ engine. eventType=${d.eventType || 'unknown'}, amount=${d.amount || 0}`,
        ledgerId:    event.params.ledgerId,
        eventType:   d.eventType || null,
        amount:      d.amount    || 0,
        orderId:     d.orderId   || null,
        clientId:    d.clientId  || null,
        walletId:    d.walletId  || null,
        createdBy:   d.createdBy || null,
        createdByName: d.createdByName || null,
        detectedAt:  FieldValue.serverTimestamp(),
        resolved:    false,
        suggestedFix: 'تحقق من المصدر — قد تكون صفحة تكتب مباشرة بدلاً من dispatchFinancialEvent / addLedgerToBatch',
      });
      console.warn(`[detectEngineBypass] 🚨 ledger entry بدون signature: ${event.params.ledgerId} eventType=${d.eventType}`);
    } catch (e) {
      console.error('[detectEngineBypass] failed to write alert:', e.message);
    }
  }
);

// ════════════════════════════════════════════════════════════════════════════
//   SCHEDULED: Returns SLA Monitor (every 2 hours)
// ════════════════════════════════════════════════════════════════════════════
//
// راجع returns_tickets ويعلّم slaBreached=true على الـ tickets التي تجاوزت
// المدة الزمنية المسموحة:
//   - status in [requested, inspecting] AND slaInspectDeadline < now → breach
//   - status = approved AND slaRefundDeadline < now → breach
//
// الـ deadlines تُحفَظ كـ ISO string في returns-core.js (calcInspectDeadline /
// calcRefundDeadline)، فالـ function يقارنها بنص ISO الحالي.
//
// لا يحرك أموالاً — فقط يضع flag للـ UI (kpi-sla card) + يرسل إشعار للـ
// operation_manager إلى inbox.

const SLA_BATCH_LIMIT = 200;

exports.scanReturnsSla = onSchedule(
  { schedule: '0 */2 * * *', timeZone: 'Africa/Cairo', timeoutSeconds: 240 },
  async () => {
    const nowIso = new Date().toISOString();
    const breaches = [];

    // الـ tickets في الحالات النشطة فقط (مع limit حماية)
    const activeStates = ['requested', 'inspecting', 'approved'];
    const snap = await db.collection('returns_tickets')
      .where('status', 'in', activeStates)
      .limit(SLA_BATCH_LIMIT)
      .get();

    let scanned = 0, flagged = 0, alreadyFlagged = 0;
    const wb = db.batch();

    for (const d of snap.docs) {
      const t = d.data();
      scanned++;
      if (t.slaBreached === true) { alreadyFlagged++; continue; }

      let breached = false;
      let reason   = '';

      // فحص deadline حسب الـ status
      if ((t.status === 'requested' || t.status === 'inspecting') && t.slaInspectDeadline) {
        if (t.slaInspectDeadline < nowIso) {
          breached = true;
          reason   = 'inspect_overdue';
        }
      } else if (t.status === 'approved' && t.slaRefundDeadline) {
        if (t.slaRefundDeadline < nowIso) {
          breached = true;
          reason   = 'refund_overdue';
        }
      }

      if (breached) {
        wb.update(d.ref, {
          slaBreached:    true,
          slaBreachedAt:  FieldValue.serverTimestamp(),
          slaBreachReason: reason,
          updatedAt:      FieldValue.serverTimestamp(),
        });
        breaches.push({ ticketId: d.id, ticketNo: t.ticketNo, reason, status: t.status });
        flagged++;
      }
    }

    if (flagged > 0) {
      try {
        await wb.commit();
      } catch (e) {
        console.error('[scanReturnsSla] batch failed:', e.message);
        return;
      }

      // إشعار لكل ops_manager + admins
      try {
        const opsSnap = await db.collection('users')
          .where('role', 'in', ['admin', 'operation_manager'])
          .get();
        const notifBatch = db.batch();
        for (const u of opsSnap.docs) {
          const ref = db.collection('notifications').doc();
          notifBatch.set(ref, {
            uid:       u.id,
            type:      'returns_sla_breach',
            title:     `⚠️ ${flagged} ticket مرتجع تجاوز SLA`,
            body:      `راجع returns.html — أحدثها: ${breaches.slice(0, 3).map(b => b.ticketNo).join(', ')}`,
            url:       '/returns.html',
            read:      false,
            createdAt: FieldValue.serverTimestamp(),
          });
        }
        await notifBatch.commit();
      } catch (e) {
        console.warn('[scanReturnsSla] notification dispatch failed (non-fatal):', e.message);
      }
    }

    console.log(`[scanReturnsSla] scanned=${scanned} flagged=${flagged} alreadyFlagged=${alreadyFlagged} time=${nowIso}`);
  }
);

// ════════════════════════════════════════════════════════════════════════════
//   TRIGGER: M1 — Denormalization sync (auto-update cached names on source change)
// ════════════════════════════════════════════════════════════════════════════
//
// orders/transactions_v2/financial_ledger يحفظون أسماء مكرّرة (clientName,
// designerName, supplierName، إلخ). لو الـ source يُعدَّل، النسخ تصبح stale.
// هذه الـ triggers تزامن الأسماء الجديدة تلقائياً.
//
// scope محدد بـ limit لمنع الـ runaway updates عند تعديل واسع.

const NAME_SYNC_BATCH = 500;

// عند تعديل اسم العميل في /clients
exports.syncClientNameOnUpdate = onDocumentUpdated(
  { document: 'clients/{clientId}', region: 'us-central1', timeoutSeconds: 240 },
  async (event) => {
    const before = event.data.before.data();
    const after  = event.data.after.data();
    if (!before || !after) return;
    if (before.name === after.name) return;  // الاسم لم يتغير
    if (after.isDeleted === true) return;     // soft-deleted

    const clientId = event.params.clientId;
    const newName  = after.name || '';

    // sync orders
    try {
      const orders = await db.collection('orders')
        .where('clientId', '==', clientId)
        .limit(NAME_SYNC_BATCH)
        .get();
      if (orders.size > 0) {
        const wb = db.batch();
        orders.forEach(d => wb.update(d.ref, { clientName: newName }));
        await wb.commit();
        console.log(`[syncClientName] orders updated=${orders.size} client=${clientId}`);
      }
    } catch (e) { console.error('[syncClientName] orders failed:', e.message); }

    // sync transactions_v2 (recent only — الأقدم immutable في الـ ledger audit pattern)
    try {
      const txs = await db.collection('transactions_v2')
        .where('clientId', '==', clientId)
        .where('isLocked', '==', false)
        .limit(NAME_SYNC_BATCH)
        .get();
      if (txs.size > 0) {
        const wb = db.batch();
        txs.forEach(d => wb.update(d.ref, { clientName: newName }));
        await wb.commit();
        console.log(`[syncClientName] transactions updated=${txs.size}`);
      }
    } catch (e) { console.error('[syncClientName] transactions failed:', e.message); }
  }
);

// عند تعديل اسم الموظف في /employees
exports.syncEmployeeNameOnUpdate = onDocumentUpdated(
  { document: 'employees/{empId}', region: 'us-central1', timeoutSeconds: 240 },
  async (event) => {
    const before = event.data.before.data();
    const after  = event.data.after.data();
    if (!before || !after) return;
    if (before.name === after.name) return;

    const empId   = event.params.empId;
    const newName = after.name || '';
    const authUid = after.authUid || before.authUid || '';

    // sync orders: designerName, productionAgentName, shippingOfficerName
    // الـ employees لها authUid وكذلك حقول role-specific في الأوردر
    const updateFields = {};
    try {
      const fields = [
        { f: 'designerId', n: 'designerName' },
        { f: 'productionAgent', n: 'productionAgentName' },
        { f: 'shippingOfficerId', n: 'shippingOfficerName' },
      ];
      for (const { f, n } of fields) {
        const orders = await db.collection('orders')
          .where(f, '==', authUid)
          .limit(NAME_SYNC_BATCH)
          .get();
        if (orders.size > 0) {
          const wb = db.batch();
          orders.forEach(d => wb.update(d.ref, { [n]: newName }));
          await wb.commit();
          console.log(`[syncEmployeeName] ${f}→${n} updated=${orders.size}`);
        }
      }
    } catch (e) { console.error('[syncEmployeeName] orders failed:', e.message); }

    // sync employee_payments
    try {
      const payments = await db.collection('employee_payments')
        .where('employeeId', '==', empId)
        .limit(NAME_SYNC_BATCH)
        .get();
      if (payments.size > 0) {
        const wb = db.batch();
        payments.forEach(d => wb.update(d.ref, { employeeName: newName }));
        await wb.commit();
        console.log(`[syncEmployeeName] payments updated=${payments.size}`);
      }
    } catch (e) { console.error('[syncEmployeeName] payments failed:', e.message); }
  }
);

// عند تعديل اسم المورد/الشاحن
exports.syncSupplierNameOnUpdate = onDocumentUpdated(
  { document: 'suppliers_v2/{supId}', region: 'us-central1', timeoutSeconds: 240 },
  async (event) => {
    const before = event.data.before.data();
    const after  = event.data.after.data();
    if (!before || !after) return;
    if (before.name === after.name) return;

    const supId   = event.params.supId;
    const newName = after.name || '';

    try {
      const payments = await db.collection('supplier_payments')
        .where('supplierId', '==', supId)
        .limit(NAME_SYNC_BATCH)
        .get();
      if (payments.size > 0) {
        const wb = db.batch();
        payments.forEach(d => wb.update(d.ref, { supplierName: newName }));
        await wb.commit();
        console.log(`[syncSupplierName] payments updated=${payments.size}`);
      }
    } catch (e) { console.error('[syncSupplierName] payments failed:', e.message); }
  }
);

// ════════════════════════════════════════════════════════════════════════════
//   TRIGGER: M7 — Auto-advance order stage when all products ready
// ════════════════════════════════════════════════════════════════════════════
//
// عند تحديث order.products[] — لو كل المنتجات في stage 'ready' أو 'done'،
// قدّم الأوردر للمرحلة التالية تلقائياً (لا تنتظر ops manager).
// شرط الأمان: لا auto-advance من production إلى shipping إلا لو كل المنتجات done.
// الأوردر يبقى في stage الحالي إذا لم تكتمل الشروط.

exports.autoAdvanceOrderStage = onDocumentUpdated(
  { document: 'orders/{orderId}', region: 'us-central1', timeoutSeconds: 60 },
  async (event) => {
    const before = event.data.before.data();
    const after  = event.data.after.data();
    if (!before || !after) return;

    // تجنب infinite loop — لو الـ stage تغير في هذا الحدث، لا تتدخل
    if (before.stage !== after.stage) return;
    // المنتجات لازم تتغير — لو ما تغيروش، لا داعي للفحص
    const beforeProducts = JSON.stringify(before.products || []);
    const afterProducts  = JSON.stringify(after.products || []);
    if (beforeProducts === afterProducts) return;

    const stage = after.stage;
    const products = after.products || [];
    if (products.length === 0) return;

    // تحديد الشرط حسب الـ stage الحالي
    let canAdvance = false;
    let nextStage  = null;
    if (stage === 'design') {
      // كل المنتجات لازم تكون ready (designed)
      const allReady = products.every(p => ['ready', 'printed', 'done'].includes(p.productStatus));
      if (allReady) { canAdvance = true; nextStage = 'printing'; }
    } else if (stage === 'printing') {
      const allPrinted = products.every(p => ['printed', 'done'].includes(p.productStatus));
      if (allPrinted) { canAdvance = true; nextStage = 'production'; }
    } else if (stage === 'production') {
      const allDone = products.every(p => p.productStatus === 'done');
      if (allDone) { canAdvance = true; nextStage = 'shipping'; }
    }
    if (!canAdvance || !nextStage) return;

    // لا تقدّم لو فيه shipping issues أو remaining cost approvals
    if (after.hasReturn === true) {
      console.log(`[autoAdvance] order ${event.params.orderId} له مرتجع نشط — تخطي`);
      return;
    }

    try {
      await db.collection('orders').doc(event.params.orderId).update({
        stage: nextStage,
        [`${nextStage}EnteredAt`]: FieldValue.serverTimestamp(),
        autoAdvancedAt: FieldValue.serverTimestamp(),
        autoAdvancedFrom: stage,
        timeline: FieldValue.arrayUnion({
          date: new Date().toISOString(),
          action: `🤖 تقديم تلقائي: ${stage} → ${nextStage}`,
          by: 'system_auto',
        }),
      });
      console.log(`[autoAdvance] order ${event.params.orderId}: ${stage} → ${nextStage}`);
    } catch (e) {
      console.error('[autoAdvance] failed:', e.message);
    }
  }
);

// ════════════════════════════════════════════════════════════════════════════
//   CALLABLE: M9 — Gemini API proxy (centralized key via Firebase Secret)
// ════════════════════════════════════════════════════════════════════════════
//
// لو admin ضبط الـ secret GEMINI_API_KEY، كل المستخدمين يستخدمون proxy
// → لا يخزَّن مفتاح في localStorage → آمن من browser extensions.
// لو الـ secret غير مضبوط → ai-engine.js يرجع للسلوك القديم (per-user key).

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

exports.callGeminiProxy = onCall(
  { ...CALL_OPTS, region: 'us-central1', secrets: [GEMINI_API_KEY], timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'مسجَّل دخول مطلوب');
    }
    const key = GEMINI_API_KEY.value();
    if (!key) {
      throw new HttpsError('failed-precondition', 'GEMINI_API_KEY غير مضبوط في Firebase Secrets — استخدم المفتاح المحلي');
    }
    const prompt = String(request.data?.prompt || '').slice(0, 50000);
    const model  = String(request.data?.model || 'gemini-flash-latest');
    const temperature = +request.data?.temperature || 0.7;
    const maxTokens   = +request.data?.maxTokens   || 2048;

    if (!prompt) throw new HttpsError('invalid-argument', 'prompt مطلوب');

    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens: maxTokens },
        }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        const msg = data?.error?.message || r.statusText;
        throw new HttpsError('internal', `Gemini ${r.status}: ${msg.slice(0, 200)}`);
      }
      const data = await r.json();
      return {
        text: data?.candidates?.[0]?.content?.parts?.[0]?.text || '',
        model,
      };
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      throw new HttpsError('internal', `proxy error: ${(e.message || '').slice(0, 200)}`);
    }
  }
);

// ════════════════════════════════════════════════════════════════════════════
//   SCHEDULED: Daily Aggregation — KPIs pre-computed for reports.html
// ════════════════════════════════════════════════════════════════════════════
//
// يحسب metrics لكل يوم سابق ويخزنها في daily_stats/{YYYY-MM-DD}.
// reports.html يستطيع قراءة هذه الـ aggregates بدل الـ client-side rollup
// عند 100k+ docs → فتح أسرع 10x.
//
// Schedule: كل يوم في 2 AM Cairo (بعد الـ activity ينتهي للـ يوم السابق).
// يحسب آخر يومين لتغطية late-arriving docs أو ساعات الـ DST.

const STATS_BACKFILL_DAYS = 2;

exports.aggregateDailyStats = onSchedule(
  { schedule: '0 2 * * *', timeZone: 'Africa/Cairo', timeoutSeconds: 540 },
  async () => {
    const tz = 'Africa/Cairo';
    const today = new Date();
    const results = [];

    for (let i = 1; i <= STATS_BACKFILL_DAYS; i++) {
      const day = new Date(today);
      day.setDate(day.getDate() - i);
      const dayKey = day.toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD
      const dayStart = new Date(dayKey + 'T00:00:00.000+02:00');  // Cairo UTC+2
      const dayEnd   = new Date(dayKey + 'T23:59:59.999+02:00');

      try {
        const stats = await computeDayStats(dayStart, dayEnd, dayKey);
        await db.collection('daily_stats').doc(dayKey).set(stats, { merge: true });
        results.push({ day: dayKey, ok: true, ...stats.summary });
      } catch (e) {
        console.error(`[aggregateDailyStats] ${dayKey} failed:`, e.message);
        results.push({ day: dayKey, ok: false, error: e.message });
      }
    }
    console.log('[aggregateDailyStats] results:', JSON.stringify(results));
  }
);

// ════════════════════════════════════════════════════════════════════════════
//   CALLABLE: Multi-tenant Backfill — يضيف tenantId='merchant_001' للـ legacy
// ════════════════════════════════════════════════════════════════════════════
//
// قبل marketplace Phase 2، الـ legacy docs (orders, clients, suppliers,
// employees, transactions_v2) ما عندهاش tenantId. الـ backfill يضع
// merchant_001 كـ default على كل doc ما عندهاش الحقل.
//
// admin يستدعيها مرة بعد الـ deploy. تعمل في batches آمنة (max 400 doc per
// commit) ولا تعدّل الـ docs اللي عندها tenantId بالفعل.
//
// Usage من الـ console (admin only):
//   const r = httpsCallable(functions, 'backfillTenantId');
//   await r({ collection: 'orders' });
//   // أو
//   await r({ collection: 'clients' });

const BACKFILL_COLLECTIONS = ['orders', 'clients', 'suppliers_v2', 'employees', 'transactions_v2', 'financial_ledger', 'employee_payments', 'supplier_payments'];
const BACKFILL_BATCH_SIZE = 400;
const DEFAULT_TENANT = 'merchant_001';

// ════════════════════════════════════════════════════════════════════════════
//   CALLABLE: Partner Sign-in — يعطي custom token للـ partner portal
// ════════════════════════════════════════════════════════════════════════════
//
// Partner يدخل tenantId + portalSecret → الـ function تتحقق من tenant.portalSecret
// → ترجع Firebase custom token مع claim `partnerTenantId`.
// الـ portal يستخدم signInWithCustomToken → الـ user يكون له auth.token.partnerTenantId
// → الـ Firestore rules تسمح بقراءة data حسب tenantId match.
//
// تنفّذ بدون Firebase Auth user حقيقي (custom token uid = 'partner_<tid>_<rnd>').

exports.partnerSignIn = onCall(
  { ...CALL_OPTS, region: 'us-central1', timeoutSeconds: 30 },
  async (request) => {
    const tenantId = String(request.data?.tenantId || '').trim();
    const secret   = String(request.data?.secret || '').trim();
    if (!tenantId || !secret) {
      throw new HttpsError('invalid-argument', 'tenantId و secret مطلوبان');
    }

    const snap = await db.collection('tenants').doc(tenantId).get();
    if (!snap.exists()) throw new HttpsError('not-found', 'tenant غير موجود');
    const t = snap.data();
    if (!t.isActive) throw new HttpsError('permission-denied', 'الحساب موقوف');
    if (!t.portalSecret) throw new HttpsError('failed-precondition', 'portal غير مفعَّل لهذا الحساب');
    if (t.portalSecret !== secret) throw new HttpsError('permission-denied', 'كود الوصول غير صحيح');

    // أنشئ custom token مع claim
    const uid = `partner_${tenantId}_${Date.now().toString(36)}`;
    let token;
    try {
      token = await getAuth().createCustomToken(uid, {
        partnerTenantId: tenantId,
        partnerType:    t.type || 'merchant',
        isPartner:      true,
      });
    } catch (e) {
      throw new HttpsError('internal', `token creation failed: ${e.message}`);
    }

    // سجل الـ login
    try {
      await db.collection('partner_logins').add({
        tenantId,
        uid,
        at: FieldValue.serverTimestamp(),
        userAgent: request.rawRequest?.headers?.['user-agent'] || '',
        ip:        request.rawRequest?.ip || '',
      });
    } catch (_) {}

    return { token, tenantId, displayName: t.displayName || t.legalName };
  }
);

exports.backfillTenantId = onCall(
  { ...CALL_OPTS, region: 'us-central1', timeoutSeconds: 540 },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'مسجَّل دخول مطلوب');

    // تحقق من admin role من الـ users doc
    const userSnap = await db.collection('users').doc(request.auth.uid).get();
    const userRole = userSnap.exists() ? userSnap.data().role : null;
    if (userRole !== 'admin') throw new HttpsError('permission-denied', 'admin only');

    const target = String(request.data?.collection || '');
    if (!BACKFILL_COLLECTIONS.includes(target)) {
      throw new HttpsError('invalid-argument', `collection يجب أن يكون: ${BACKFILL_COLLECTIONS.join('|')}`);
    }
    const dryRun = request.data?.dryRun === true;

    // اجلب docs بدون tenantId — Firestore لا يدعم where('field','==',null) بشكل
    // مباشر، فنستخدم where('field','==',undefined) عبر الـ snapshot filter
    let snap;
    try {
      snap = await db.collection(target).limit(BACKFILL_BATCH_SIZE).get();
    } catch (e) {
      throw new HttpsError('internal', `fetch failed: ${e.message}`);
    }

    let updated = 0, skipped = 0;
    const wb = db.batch();

    for (const d of snap.docs) {
      const data = d.data();
      if (data.tenantId) { skipped++; continue; }
      if (dryRun) { updated++; continue; }
      wb.update(d.ref, { tenantId: DEFAULT_TENANT });
      updated++;
    }

    if (!dryRun && updated > 0) {
      try {
        await wb.commit();
      } catch (e) {
        throw new HttpsError('internal', `commit failed: ${e.message}`);
      }
    }

    return {
      collection: target,
      dryRun,
      scanned: snap.size,
      updated,
      skipped,
      hasMore: snap.size === BACKFILL_BATCH_SIZE,
      hint: snap.size === BACKFILL_BATCH_SIZE
        ? `ربما في المزيد — اشتغل الـ function مرة تانية على نفس الـ collection`
        : `الـ collection اتجمع كاملاً`,
    };
  }
);

async function computeDayStats(dayStart, dayEnd, dayKey) {
  // Orders created in window
  const ordersSnap = await db.collection('orders')
    .where('createdAt', '>=', dayStart)
    .where('createdAt', '<=', dayEnd)
    .get();
  const orders = ordersSnap.docs.map(d => d.data());

  // Transactions in window
  const txSnap = await db.collection('transactions_v2')
    .where('createdAt', '>=', dayStart)
    .where('createdAt', '<=', dayEnd)
    .get();
  const txs = txSnap.docs.map(d => d.data());

  // Returns tickets in window
  let rtSnap;
  try {
    rtSnap = await db.collection('returns_tickets')
      .where('createdAt', '>=', dayStart)
      .where('createdAt', '<=', dayEnd)
      .get();
  } catch (_) { rtSnap = { docs: [] }; }
  const returns = rtSnap.docs.map(d => d.data());

  // ── Compute KPIs ──
  const orderCount   = orders.length;
  const revenueSum   = orders.reduce((s, o) => s + (parseFloat(o.salePrice) || 0), 0);
  const collected    = txs.filter(t => t.type === 'in').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
  const expenses     = txs.filter(t => t.type === 'out').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
  const cashflowNet  = collected - expenses;

  // Order distribution by stage
  const byStage = {};
  orders.forEach(o => { byStage[o.stage || 'unknown'] = (byStage[o.stage || 'unknown'] || 0) + 1; });

  // Returns metrics
  const returnsCount  = returns.length;
  const refundedCount = returns.filter(r => r.status === 'refunded').length;
  const refundsSum    = returns.filter(r => r.status === 'refunded')
                               .reduce((s, r) => s + (parseFloat(r.refundAmount) || 0), 0);
  const returnRate = orderCount > 0 ? +(returnsCount / orderCount * 100).toFixed(2) : 0;

  // Top reasons (return)
  const reasonsMap = {};
  returns.forEach(r => { reasonsMap[r.reason || 'other'] = (reasonsMap[r.reason || 'other'] || 0) + 1; });
  const topReasons = Object.entries(reasonsMap).sort((a, b) => b[1] - a[1]).slice(0, 5)
                           .map(([reason, count]) => ({ reason, count }));

  // Blamed party
  const blameMap = {};
  returns.forEach(r => { blameMap[r.blamedParty || 'unknown'] = (blameMap[r.blamedParty || 'unknown'] || 0) + 1; });

  return {
    dayKey,
    summary: {
      orderCount,
      revenueSum: +revenueSum.toFixed(2),
      collected:  +collected.toFixed(2),
      expenses:   +expenses.toFixed(2),
      cashflowNet:+cashflowNet.toFixed(2),
      returnsCount,
      returnRate,
      refundsSum: +refundsSum.toFixed(2),
    },
    byStage,
    returns: {
      count: returnsCount,
      refundedCount,
      refundsSum: +refundsSum.toFixed(2),
      rate: returnRate,
      topReasons,
      byBlame: blameMap,
    },
    cashflow: {
      in:  +collected.toFixed(2),
      out: +expenses.toFixed(2),
      net: +cashflowNet.toFixed(2),
      txCount: txs.length,
    },
    computedAt: FieldValue.serverTimestamp(),
    computedFrom: { ordersScanned: orderCount, txsScanned: txs.length, returnsScanned: returnsCount },
  };
}


// ════════════════════════════════════════════════════════════
// Suggestion → GitHub Issue + Claude Code Action trigger
// ════════════════════════════════════════════════════════════
// لما الأدمن يدوس "ابعت لـ Claude" في suggestions-admin.html:
//   1. الفنكشن دي تنشئ GitHub Issue تلقائياً عبر GitHub API
//   2. body الـ Issue يحتوي @claude → workflow .github/workflows/claude.yml
//      يطلق ويشغّل anthropics/claude-code-action على الـ issue
//   3. Claude يكتب الكود + يفتح PR + يعلق على الـ Issue برابط الـ PR
//   4. الأدمن يراجع ويدمج الـ PR يدوياً
//
// Setup:
//   firebase functions:secrets:set GITHUB_PAT  (Personal Access Token مع repo scope)
//   GitHub repo settings → Secrets → ANTHROPIC_API_KEY

const CATEGORY_LABELS_FN = {
  dashboard:'⬡ داشبورد', page:'📄 صفحة', workflow:'🔄 دورة عمل',
  report:'📊 تقرير', notification:'🔔 تنبيه', bug:'🐞 مشكلة', other:'💬 أخرى',
};
const PRIORITY_LABELS_FN = { low:'تحسين', medium:'مهم', high:'عاجل' };

async function callGitHubApi(token, path, opts = {}) {
  const fetchFn = (typeof fetch !== 'undefined') ? fetch : require('node-fetch');
  const url = path.startsWith('http') ? path : `https://api.github.com${path}`;
  const res = await fetchFn(url, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) {}
  if (!res.ok) {
    const msg = json?.message || text?.slice(0, 300) || `HTTP ${res.status}`;
    throw new Error(`GitHub API ${res.status}: ${msg}`);
  }
  return json;
}

exports.createSuggestionIssue = onCall(
  { ...CALL_OPTS, memory: '256MiB', timeoutSeconds: 30, secrets: [GITHUB_PAT] },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول');
    const { suggestionId } = req.data || {};
    if (!suggestionId || typeof suggestionId !== 'string') {
      throw new HttpsError('invalid-argument', 'suggestionId مطلوب');
    }

    // Permission: admin/ops only
    const callerSnap = await db.doc(`users/${req.auth.uid}`).get();
    if (!callerSnap.exists) throw new HttpsError('permission-denied', 'حساب غير مسجل');
    const callerRole = callerSnap.data().role || '';
    if (!['admin', 'operation_manager'].includes(callerRole)) {
      throw new HttpsError('permission-denied', 'صلاحية الأدمن فقط');
    }

    const sugRef = db.doc(`employee_suggestions/${suggestionId}`);
    const sugSnap = await sugRef.get();
    if (!sugSnap.exists) throw new HttpsError('not-found', 'الاقتراح غير موجود');
    const s = { _id: sugSnap.id, ...sugSnap.data() };

    if (s.issueUrl) {
      // Already created — return existing
      return { ok: true, issueUrl: s.issueUrl, issueNumber: s.issueNumber, existed: true };
    }

    const token = GITHUB_PAT.value();
    if (!token) {
      throw new HttpsError('failed-precondition',
        'GITHUB_PAT غير مضبوط. اضبطه: firebase functions:secrets:set GITHUB_PAT');
    }

    // Build issue title + body
    const title = `[Suggestion] ${s.title}`;
    const a = s.aiAnalysis;
    let aiBlock = '';
    if (a) {
      aiBlock = `

## 🤖 تحليل AI (Gemini)
**الخلاصة:** ${a.tldr || '—'}
**التعقيد:** ${a.estimatedComplexity}  •  **الأثر:** ${a.estimatedImpact}  •  **التوصية:** ${a.recommendation}

### ✓ المميزات
${(a.pros||[]).map(p => `- ${p}`).join('\n') || '—'}

### ⚠ العيوب / المخاطر
${(a.cons||[]).map(c => `- ${c}`).join('\n') || '—'}

### 📋 خطة التنفيذ المقترحة
${(a.actionPlan||[]).map((step, i) => `${i+1}. **${step.step}** — ${step.detail}`).join('\n') || '—'}

### 📂 المناطق المتأثرة
${(a.affectedAreas||[]).join(' • ') || '—'}
`;
    }
    const submitterRole = s.submittedByRole ? ` (${s.submittedByRole})` : '';
    const createdAt = s.createdAt?.toDate ? s.createdAt.toDate().toLocaleString('ar-EG') : '—';

    const body = `## 💡 اقتراح موظف

**من:** ${s.submittedByName || '—'}${submitterRole}
**النوع:** ${CATEGORY_LABELS_FN[s.category] || s.category}
**الأولوية:** ${PRIORITY_LABELS_FN[s.priority] || s.priority}
**الصفحة:** ${s.targetPage || 'غير محدد'}
**تاريخ:** ${createdAt}

---

### العنوان
${s.title}

### التفاصيل
${s.description}

${s.decisionNote ? '### ملاحظة الإدارة\n' + s.decisionNote + '\n' : ''}${aiBlock}
---

@claude نفّذ التعديل المطلوب. شوف خطة AI أعلاه واتبعها. افتح PR على \`main\` وعلّق هنا برابط الـ PR.

> Suggestion ID: \`${s._id}\``;

    // Create issue via GitHub REST API
    const labels = ['claude-task', 'employee-suggestion', `priority-${s.priority || 'medium'}`];
    const created = await callGitHubApi(token, `/repos/${GITHUB_REPO}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title, body, labels }),
    });

    // Update suggestion doc
    await sugRef.update({
      issueUrl: created.html_url,
      issueNumber: created.number,
      issueCreatedAt: new Date(),
      issueCreatedBy: req.auth.uid,
      status: 'pending_implementation',
      reviewedBy: req.auth.uid,
      reviewedByName: callerSnap.data().name || '',
      reviewedAt: new Date(),
      decisionNote: 'تم فتح GitHub Issue تلقائياً — Claude بيكتب الكود الآن.',
    });

    return { ok: true, issueUrl: created.html_url, issueNumber: created.number, existed: false };
  }
);

// Check linked PR status for a suggestion's issue.
// GitHub auto-links PRs that mention #N → returns first such PR.
exports.checkSuggestionPR = onCall(
  { ...CALL_OPTS, memory: '256MiB', timeoutSeconds: 30, secrets: [GITHUB_PAT] },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول');
    const { suggestionId } = req.data || {};
    if (!suggestionId) throw new HttpsError('invalid-argument', 'suggestionId مطلوب');

    const sugRef = db.doc(`employee_suggestions/${suggestionId}`);
    const sugSnap = await sugRef.get();
    if (!sugSnap.exists) throw new HttpsError('not-found', 'الاقتراح غير موجود');
    const s = sugSnap.data();
    if (!s.issueNumber) {
      return { ok: false, message: 'الـ Issue لسه ماتفتحتش' };
    }

    const token = GITHUB_PAT.value();
    if (!token) throw new HttpsError('failed-precondition', 'GITHUB_PAT غير مضبوط');

    // Search PRs that reference this issue
    const q = `repo:${GITHUB_REPO} is:pr ${s.issueNumber} in:body`;
    const result = await callGitHubApi(token, `/search/issues?q=${encodeURIComponent(q)}&per_page=5`);
    const prs = (result.items || []).filter(it => it.pull_request);

    if (!prs.length) {
      return { ok: false, message: 'مفيش PR مرتبط بالـ Issue لسه' };
    }

    // Pick the most recently updated
    const pr = prs.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0];

    const patch = {
      prUrl: pr.html_url,
      prNumber: pr.number,
      prState: pr.state, // 'open' | 'closed'
      prMerged: !!pr.pull_request?.merged_at,
      prCheckedAt: new Date(),
    };
    if (pr.state === 'closed' && pr.pull_request?.merged_at) {
      patch.status = 'implemented';
      patch.implementedAt = new Date();
    }
    await sugRef.update(patch);

    return { ok: true, ...patch, prTitle: pr.title };
  }
);

// ════════════════════════════════════════════════════════════
// S0-6: Rate-limit guard على الـ client portal submissions
// ════════════════════════════════════════════════════════════
// الـ Firestore rules تسمح للعملاء غير المصادَقين بإنشاء returns_tickets
// و client_decisions (مع cross-validation لـ clientPhone).
// الخطر: مهاجم يعرف orderId + clientPhone يقدر يصنع آلاف entries.
//
// هذه الـ functions تراقب الإنشاء وتطبّق rate limit per phone+orderId.
// لو تجاوز الحد:
//   1) tag الـ doc كـ isDeleted=true (soft delete)
//   2) إضافة admin_alert
//
// الحدود (قابلة للضبط):
//   - returns_tickets: 5 لكل clientPhone في الساعة الأخيرة
//   - client_decisions: 10 لكل orderId في الساعة الأخيرة (revision spam)
//
// المرجع: STABILIZATION_PLAN.md §1.S0-6.

const PORTAL_RATE_LIMITS = {
  returns_tickets: { perKey: 'clientPhone', maxPerHour: 5 },
  client_decisions: { perKey: 'orderDocId', maxPerHour: 10 },
};

async function enforcePortalRateLimit(collectionName, doc, e) {
  const cfg = PORTAL_RATE_LIMITS[collectionName];
  if (!cfg) return;

  // طبّق فقط على submissions من client portal (غير مصادَقة).
  // الـ requestedBy في returns_tickets, و decision في client_decisions
  // مع clientPhone موجود — يوضّح المصدر.
  const isClientPortal =
    (collectionName === 'returns_tickets' && doc.requestedBy === 'client_portal') ||
    (collectionName === 'client_decisions' && doc.clientPhone);
  if (!isClientPortal) return;

  const keyValue = doc[cfg.perKey];
  if (!keyValue) return;

  // عُد الـ entries في آخر ساعة من نفس الـ key
  const cutoff = new Date(Date.now() - 3600 * 1000);
  let countSnap;
  try {
    countSnap = await db.collection(collectionName)
      .where(cfg.perKey, '==', keyValue)
      .where('createdAt', '>=', cutoff)
      .count().get();
  } catch (err) {
    console.warn(`[rateLimit] count failed for ${collectionName}:`, err.message);
    return;
  }

  const count = countSnap.data().count;
  if (count <= cfg.maxPerHour) return;

  // تجاوز الحد — soft-delete + alert
  console.log(`[rateLimit] 🚨 ${collectionName} exceeded: ${keyValue} = ${count} في ساعة`);

  try {
    await e.data.ref.update({
      isDeleted: true,
      deletedAt: FieldValue.serverTimestamp(),
      deletedReason: 'rate_limit_exceeded',
      rateLimitCount: count,
    });
  } catch (err) {
    console.error(`[rateLimit] soft-delete failed:`, err.message);
  }

  try {
    await db.collection('admin_alerts').add({
      severity: 'high',
      reasons: [`Rate limit exceeded on ${collectionName}`],
      eventType: 'CLIENT_PORTAL_RATE_LIMIT',
      type: 'security',
      [cfg.perKey]: keyValue,
      count,
      windowMinutes: 60,
      collectionName,
      docId: e.params[Object.keys(e.params)[0]] || '',
      createdBy: 'system_rate_limiter',
      createdByName: 'Rate Limiter',
      acknowledged: false,
      acknowledgedBy: null,
      acknowledgedAt: null,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error(`[rateLimit] alert creation failed:`, err.message);
  }

  // إرسال push للـ admin
  try {
    const tokens = await getRoleTokens(['admin', 'operation_manager']);
    await sendPush({
      tokens,
      title: '🚨 محاولة إغراق من client portal',
      body: `${count} ${collectionName} في ساعة من ${keyValue}`,
      data: { type: 'rate_limit', collectionName, key: keyValue },
      link: '/admin-alerts.html',
    });
  } catch (_) { /* ignore */ }
}

exports.guardReturnsTicketsRateLimit = onDocumentCreated(
  'returns_tickets/{ticketId}',
  async (e) => {
    const t = e.data?.data();
    if (!t) return;
    await enforcePortalRateLimit('returns_tickets', t, e);
  }
);

exports.guardClientDecisionsRateLimit = onDocumentCreated(
  'client_decisions/{decId}',
  async (e) => {
    const d = e.data?.data();
    if (!d) return;
    await enforcePortalRateLimit('client_decisions', d, e);
  }
);

// ════════════════════════════════════════════════════════════
// S0-4 Helper: نشر role/tenantId كـ Auth custom claims
// ════════════════════════════════════════════════════════════
// الـ Storage rules لا تقدر تقرأ Firestore. الحل: نشر الحقول الحرجة
// كـ custom claims على Firebase Auth user → request.auth.token في
// storage.rules يحتوي على tenantId + role.
//
// تشتغل تلقائياً:
//   - عند تعديل users/{uid} (role أو tenantId)
//   - عبر admin callable لو احتاج reset
//
// المرجع: STABILIZATION_PLAN.md §1.S0-4.

exports.syncUserAuthClaims = onDocumentUpdated('users/{uid}', async (e) => {
  const before = e.data?.before?.data() || {};
  const after  = e.data?.after?.data()  || {};
  const uid    = e.params.uid;

  // فقط لو الحقول الحساسة تغيّرت
  const fieldsChanged =
    before.role !== after.role ||
    before.tenantId !== after.tenantId ||
    before.permissions !== after.permissions;
  if (!fieldsChanged) return;

  try {
    await getAuth().setCustomUserClaims(uid, {
      role: after.role || 'customer_service',
      tenantId: after.tenantId || 'merchant_001',
      // ملاحظة: permissions قد تكون كبيرة — نقتصر على flags المهمة
      cfw: (after.permissions || {}).canFinancialWrite === true,
      cfr: (after.permissions || {}).canFinancialRead === true,
    });
    console.log(`[syncUserAuthClaims] ✓ ${uid} → role=${after.role} tenant=${after.tenantId}`);
  } catch (err) {
    console.error(`[syncUserAuthClaims] failed for ${uid}:`, err.message);
  }
});

// Bootstrap: callable لـ admin لنشر claims على كل users الموجودة دفعة واحدة
// (للـ migration). يشتغل مرة واحدة بعد deploy الأول.
exports.backfillAuthClaims = onCall({ ...CALL_OPTS, timeoutSeconds: 540 }, async (req) => {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'auth required');

  const callerSnap = await db.collection('users').doc(req.auth.uid).get();
  if (!callerSnap.exists || callerSnap.data().role !== 'admin') {
    throw new HttpsError('permission-denied', 'admin only');
  }

  const snap = await db.collection('users').get();
  let success = 0, failed = 0;

  for (const userDoc of snap.docs) {
    const data = userDoc.data();
    try {
      await getAuth().setCustomUserClaims(userDoc.id, {
        role: data.role || 'customer_service',
        tenantId: data.tenantId || 'merchant_001',
        cfw: (data.permissions || {}).canFinancialWrite === true,
        cfr: (data.permissions || {}).canFinancialRead === true,
      });
      success++;
    } catch (err) {
      console.error(`[backfillAuthClaims] failed for ${userDoc.id}:`, err.message);
      failed++;
    }
  }

  return { success, failed, total: snap.size };
});

