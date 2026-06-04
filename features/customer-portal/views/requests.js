/**
 * VIEWS · requests — أفعال العميل.
 *
 * • submitRequest — نقطة البداية الرسمية لإنشاء/إعادة طلب: تكتب كياناً مُهيكلاً
 *   في order_requests عبر services.requests (Order = SSoT). الموظف يحوّله لأوردر.
 *   لا رسالة محادثة كنقطة بداية للعملية (راجع docs/ORDER_CENTRIC_HARDENING.md).
 * • sendRequest — تواصل حرّ فقط (رسالة على خيط) — ليس نقطة بداية لأي عملية.
 *
 * (H1.1: لا كتابة مباشرة — عبر Services/clientActions فقط · STANDARDS §6)
 */

/**
 * يُنشئ طلباً مُهيكلاً (type: 'new' | 'reorder' | 'quote'). يُرجع { ok, requestId? }.
 */
export async function submitRequest(ctx, { type = 'new', order = null, product = '', qty = '', notes = '' }) {
  const { services, store, shell } = ctx;
  const user = store.get('user');
  if (!user) { shell.notify('سجّل الدخول أولاً', 'danger'); return { ok: false }; }
  const client = store.get('client');
  const name = client?.name || user.displayName || 'عميل';
  const phone = client?.phone1 || client?.phone || '';
  const r = await services.requests.createRequest({ type, uid: user.uid, name, phone, order, product, qty, notes });
  if (r?.ok) shell.notify('تم استلام طلبك ✅ سنتواصل معك قريباً', 'ok');
  else shell.notify((r?.errors && r.errors[0]) || 'تعذّر إرسال الطلب', 'danger');
  return r || { ok: false };
}

/** يرسل رسالة تواصل حرّ للموظفين على خيط محادثة. (تواصل فقط — لا منطق أعمال) */
export async function sendRequest(ctx, { order = null, text, kind = 'support' }) {
  const { services, store, shell } = ctx;
  const user = store.get('user');
  if (!user) { shell.notify('سجّل الدخول أولاً', 'danger'); return { ok: false }; }
  const name = store.get('client')?.name || user.displayName || 'عميل';
  const t = await services.chat.openThread({ kind, uid: user.uid, name, order });
  if (!t?.ok) { shell.notify('تعذّر الإرسال، حاول مجدداً', 'danger'); return { ok: false }; }
  const r = await services.chat.sendMessage({
    convId: t.convId, text, uid: user.uid, name, participants: t.participants,
  });
  if (r?.ok) shell.notify('تم الإرسال ✅ سنردّ عليك قريباً', 'ok');
  else shell.notify('تعذّر الإرسال', 'danger');
  return r || { ok: false };
}
