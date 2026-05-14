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

const WHATSAPP_TOKEN = defineSecret('WHATSAPP_TOKEN');

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
  { secrets: [WHATSAPP_TOKEN] },
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

exports.adminResetEmployeePassword = onCall(async (req) => {
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

exports.adminSetEmployeePassword = onCall(async (req) => {
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
exports.registerFcmToken = onCall(async (req) => {
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

exports.unregisterFcmToken = onCall(async (req) => {
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
