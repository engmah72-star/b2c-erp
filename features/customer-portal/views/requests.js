/**
 * VIEWS · requests — أفعال العميل التي تمرّ عبر قناة المحادثات (clientActions).
 * إعادة الطلب · الاعتماد · طلب عرض سعر — تُرسَل للموظف الذي ينفّذ الانتقال الرسمي.
 * (H1.1: لا كتابة مباشرة — عبر Services/clientActions فقط · STANDARDS §6)
 */

/** يرسل طلباً نصياً للموظفين على خيط محادثة (order/support). يُرجع { ok }. */
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

export const reorderText = (o) => `🔁 أرغب بإعادة طلب مشابه للطلب رقم #${o.serial || o._id?.slice(0, 6) || ''}.`;
export const approveText = (o) => `✅ أعتمِد التصميم الخاص بالطلب رقم #${o.serial || o._id?.slice(0, 6) || ''} وأوافق على المتابعة للطباعة.`;
export const quoteText = () => '🧾 أرغب في طلب عرض سعر لمنتج جديد. برجاء التواصل معي بالتفاصيل.';
