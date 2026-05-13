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
const { defineSecret } = require('firebase-functions/params');
const { setGlobalOptions } = require('firebase-functions/v2');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

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
  const callerUid = req.auth?.uid;
  if (!callerUid) {
    throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول');
  }

  // 1) Verify caller is admin or operation_manager
  const callerSnap = await getFirestore().doc(`users/${callerUid}`).get();
  if (!callerSnap.exists) {
    throw new HttpsError('permission-denied', 'حساب المستخدم غير موجود');
  }
  const callerRole = callerSnap.data()?.role;
  if (!['admin', 'operation_manager'].includes(callerRole)) {
    throw new HttpsError('permission-denied', 'هذه العملية للأدمن فقط');
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
    throw new HttpsError('not-found', 'حساب الموظف غير موجود في Firebase Auth: ' + (e.message || ''));
  }

  // 5) Flag user doc so login routes through change-password.html
  try {
    await getFirestore().doc(`users/${targetUid}`).update({
      mustChangePassword: true,
      passwordResetAt: FieldValue.serverTimestamp(),
      passwordResetBy: callerUid,
      passwordResetByName: callerSnap.data()?.name || '',
    });
  } catch (e) {
    // Auth password is already changed at this point — log but don't fail the
    // call; the temp password is still valid and the admin can re-flag later.
    console.warn('mustChangePassword flag update failed for', targetUid, e.message);
  }

  return { success: true, tempPassword: tempPw };
});
