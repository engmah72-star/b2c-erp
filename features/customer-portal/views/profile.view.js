/**
 * VIEWS · profile — بروفايل الأعمال + الكارت الرقمي العام + تحرير + شعار/غلاف.
 * تركيب مكوّنات + نداء Services + Validator. الكتابة عبر clientActions. (STANDARDS §6 · L1)
 */
import { escapeHtml, qs } from '../utils/dom.js';
import { Card, Button, Input, Select, Avatar } from '../components/index.js';
import { cropResize } from '../utils/image.js';
import { slugUsername } from '../utils/username.js';
import { qrSrc, downloadQR } from '../utils/qr.js';
import { entitlementsOf } from '../../../core/entitlements.js';
import { validateProfile } from '../validators/profile.validator.js';

const PLAN_AR = { free: 'مجانية', pro: 'احترافية', business: 'أعمال' };

// قوالب الكارت الرقمي (متاحة لكل العملاء). القيمة تُحفظ في businessProfile.template
// وتُعرض في الكارت العام (card.html + /u/{username}) عبر data-template.
const TEMPLATE_OPTS = [
  { value: 'classic', label: '🟣 كلاسيكي (بنفسجي)' },
  { value: 'dark-gold', label: '⚜️ أسود وذهبي (فخم)' },
  { value: 'minimal', label: '⚪ أبيض بسيط' },
];

export function create(ctx) {
  const { services, store, shell } = ctx;
  let client = null;
  let editing = false;
  let busy = false;
  let pending = null; // { kind:'logo'|'cover', file, dataUrl } — معاينة قبل الحفظ
  let errors = [];

  const publicUrl = () => {
    const u = client?.businessProfile?.username;
    return u ? `${location.origin}/u/${encodeURIComponent(u)}` : `${location.origin}/card.html?id=${encodeURIComponent(uid())}`;
  };
  const uid = () => store.get('user')?.uid || '';
  const email = () => store.get('user')?.email || '';
  const uname = () => client?.name || store.get('user')?.displayName || 'عميل';

  function mediaSection() {
    const biz = client?.businessProfile || {};
    const cover = pending?.kind === 'cover' ? pending.dataUrl : (biz.coverUrl || '');
    const logo = pending?.kind === 'logo' ? pending.dataUrl : (biz.logoUrl || '');
    const coverEl = cover
      ? `<img class="cp-cover" src="${escapeHtml(cover)}" alt="الغلاف">`
      : `<div class="cp-cover cp-cover--ph">لا يوجد غلاف</div>`;
    const head = `<div class="cp-row">${Avatar({ src: logo, initial: uname(), size: 'lg' })}
      <div class="cp-row__grow"><div class="cp-title">${escapeHtml(biz.bizName || uname())}</div>
      <div class="cp-muted">${escapeHtml(biz.tagline || '—')}</div></div></div>`;
    const controls = pending
      ? `<div class="cp-row cp-row--wrap">
          ${Button({ label: 'حفظ ' + (pending.kind === 'cover' ? 'الغلاف' : 'الشعار'), icon: '💾', size: 'sm', block: false, action: 'save-media', loading: busy, disabled: busy })}
          ${Button({ label: 'إلغاء', variant: 'ghost', size: 'sm', block: false, action: 'cancel-media' })}
        </div>`
      : `<div class="cp-row cp-row--wrap">
          ${Button({ label: 'تغيير الغلاف', icon: '🖼', variant: 'ghost', size: 'sm', block: false, action: 'pick-cover' })}
          ${biz.coverUrl ? Button({ label: 'حذف الغلاف', variant: 'ghost', size: 'sm', block: false, action: 'del-cover' }) : ''}
          ${Button({ label: 'تغيير الشعار', icon: '🎯', variant: 'ghost', size: 'sm', block: false, action: 'pick-logo' })}
          ${biz.logoUrl ? Button({ label: 'حذف الشعار', variant: 'ghost', size: 'sm', block: false, action: 'del-logo' }) : ''}
        </div>`;
    const inputs = `<input type="file" id="pf-logo" accept="image/*" hidden>
      <input type="file" id="pf-cover" accept="image/*" hidden>`;
    return Card({ body: `<div class="cp-stack cp-stack--sm">${coverEl}${head}
      ${pending ? '<div class="cp-muted">معاينة قبل الحفظ — اضغط حفظ للتأكيد.</div>' : ''}
      ${controls}${inputs}</div>` });
  }

  function view() {
    const biz = client?.businessProfile || {};
    const phone = client?.phone1 || '';
    const info = Card({ body: `<div class="cp-stack cp-stack--sm">
      <div class="cp-kv"><span class="cp-kv__k">الاسم</span><span class="cp-kv__v">${escapeHtml(uname())}</span></div>
      <div class="cp-kv"><span class="cp-kv__k">الهاتف</span><span class="cp-kv__v">${escapeHtml(phone || '—')}</span></div>
      <div class="cp-kv"><span class="cp-kv__k">النشاط</span><span class="cp-kv__v">${escapeHtml(biz.activity || '—')}</span></div>
    </div>` });
    const qrCard = uid() ? Card({ body: `<div class="cp-stack cp-stack--sm cp-text-c">
      <div class="cp-title">QR صفحتك</div>
      <img class="cp-qr" src="${escapeHtml(qrSrc(publicUrl(), 300))}" alt="QR" loading="lazy">
      <div class="cp-muted" dir="ltr">${escapeHtml(publicUrl())}</div>
      <div class="cp-row cp-row--wrap">
        ${Button({ label: 'تنزيل QR', icon: '⬇️', variant: 'ghost', size: 'sm', block: false, action: 'qr-download' })}
        ${Button({ label: 'مشاركة', icon: '🔗', variant: 'ghost', size: 'sm', block: false, action: 'share' })}
      </div></div>` }) : '';
    // بطاقة الخطة (استهلاك core/entitlements — من المصدر الموثوق subscriptions).
    const ent = entitlementsOf(store.get('entitlement') || { plan: 'free' });
    const tone = ent.plan === 'free' ? 'neutral' : 'ok';
    const planCard = Card({ body: `<div class="cp-stack cp-stack--sm">
      <div class="cp-row cp-row--between">
        <strong>خطتك: ${escapeHtml(PLAN_AR[ent.plan] || ent.plan)}</strong>
        <span class="cp-badge${tone === 'ok' ? ' cp-badge--ok' : ''}">${ent.featured ? '⭐ مميَّز' : escapeHtml(PLAN_AR[ent.plan] || ent.plan)}</span>
      </div>
      <div class="cp-muted">المزايا: ${ent.features.length} ميزة مفعّلة</div>
      ${ent.plan === 'free' ? Button({ label: 'ترقية الخطة', icon: '⭐', variant: 'ghost', size: 'sm', block: false, action: 'upgrade' }) : ''}
    </div>` });
    const actions = `<div class="cp-stack cp-stack--sm">
      ${qrCard}
      ${planCard}
      ${Button({ label: 'مشاركة الصفحة العامة', icon: '🔗', action: 'share', disabled: !uid() })}
      ${Button({ label: 'معاينة الكارت', icon: '👁', variant: 'ghost', action: 'open-card', disabled: !uid() })}
      ${Button({ label: 'إدارة الخدمات', icon: '🛠', variant: 'ghost', action: 'services' })}
      ${Button({ label: 'تعديل البيانات', icon: '✏️', variant: 'ghost', action: 'edit' })}
      ${Button({ label: 'تسجيل الخروج', icon: '🚪', variant: 'ghost', action: 'logout' })}
    </div>`;
    return `<div class="cp-stack cp-stack--lg">${mediaSection()}${info}${actions}</div>`;
  }

  function form() {
    const biz = client?.businessProfile || {};
    const errBox = errors.length
      ? `<div class="cp-field__error" role="alert">${errors.map(escapeHtml).join('<br>')}</div>` : '';
    const body = `<div class="cp-stack cp-stack--sm">
      <h2 class="cp-sec">تعديل البيانات</h2>
      ${Input({ id: 'f-biz', label: 'اسم النشاط', value: biz.bizName || '', required: true })}
      ${Input({ id: 'f-phone', label: 'رقم التواصل', type: 'tel', value: client?.phone1 || '', required: true, dir: 'ltr', placeholder: '01xxxxxxxxx' })}
      ${Input({ id: 'f-tagline', label: 'وصف مختصر', value: biz.tagline || '' })}
      ${Input({ id: 'f-activity', label: 'النشاط / التخصص', value: biz.activity || '' })}
      ${Input({ id: 'f-city', label: 'المحافظة / المدينة', value: biz.city || '' })}
      ${Input({ id: 'f-address', label: 'العنوان (يفتح خرائط جوجل)', value: biz.address || '', placeholder: 'مثال: ٧٧ ش أيوب — رأس البر' })}
      ${Select({ id: 'f-template', label: 'قالب الكارت', options: TEMPLATE_OPTS, value: biz.template || 'classic' })}
      ${Input({ id: 'f-username', label: 'اسم الصفحة العامة (username)', value: biz.username || '', dir: 'ltr', placeholder: 'my-brand', hint: 'رابطك: /u/my-brand' })}
      <label class="cp-check"><input type="checkbox" id="f-directory"${biz.listedInDirectory ? ' checked' : ''}>
        <span>إظهار نشاطي داخل دليل الأعمال</span></label>
      ${errBox}
      <div class="cp-row cp-row--wrap">
        ${Button({ label: 'حفظ', icon: '💾', size: 'sm', block: false, action: 'save' })}
        ${Button({ label: 'إلغاء', variant: 'ghost', size: 'sm', block: false, action: 'cancel' })}
      </div>
    </div>`;
    return `<div class="cp-stack cp-stack--lg">${Card({ body })}</div>`;
  }

  function paint() { ctx.repaint(editing ? form() : view()); }
  const reload = async () => { client = await services.profile.loadClient(uid()); store.set({ client }); };

  return {
    async mount() {
      client = uid() ? await services.profile.loadClient(uid()) : null;
      return editing ? form() : view();
    },
    async onUpload(input) {
      const kind = input.id === 'pf-cover' ? 'cover' : input.id === 'pf-logo' ? 'logo' : null;
      const file = input.files && input.files[0];
      input.value = '';
      if (!kind || !file) return;
      if (!/^image\//.test(file.type)) { shell.notify('يُسمح بالصور فقط', 'danger'); return; }
      if (file.size > 20 * 1024 * 1024) { shell.notify('الحجم الأقصى 20 ميجا', 'danger'); return; }
      try {
        const { file: cropped, dataUrl } = await cropResize(file, {
          aspect: kind === 'cover' ? 16 / 9 : 1, maxW: kind === 'cover' ? 1280 : 512,
        });
        pending = { kind, file: cropped, dataUrl }; paint();
      } catch (_) { shell.notify('تعذّر تجهيز الصورة', 'danger'); }
    },
    async onAction(a) {
      if (a === 'edit') { editing = true; errors = []; return paint(); }
      if (a === 'cancel') { editing = false; errors = []; return paint(); }
      if (a === 'logout') return services.auth.signOut();
      if (a === 'services') return ctx.openServices();
      if (a === 'upgrade') return ctx.openChat({ kind: 'support' });
      if (a === 'qr-download') { await downloadQR(publicUrl(), 'business2card-qr.png'); return; }
      if (a === 'open-card') { if (uid()) window.open(publicUrl(), '_blank', 'noopener'); return; }
      if (a === 'pick-logo') { qs('#pf-logo', document)?.click(); return; }
      if (a === 'pick-cover') { qs('#pf-cover', document)?.click(); return; }
      if (a === 'cancel-media') { pending = null; return paint(); }
      if (a === 'save-media') {
        if (!pending || busy) return;
        busy = true; paint();
        const r = await services.profile.uploadMedia({ uid: uid(), email: email(), name: uname(), kind: pending.kind, file: pending.file });
        busy = false;
        if (r?.ok) { pending = null; await reload(); shell.notify('تم الحفظ ✅', 'ok'); paint(); }
        else { paint(); shell.notify((r?.errors && r.errors[0]) || 'تعذّر الحفظ', 'danger'); }
        return;
      }
      if (a === 'del-logo' || a === 'del-cover') {
        const kind = a === 'del-cover' ? 'cover' : 'logo';
        const r = await services.profile.removeMedia({ uid: uid(), email: email(), name: uname(), kind });
        if (r?.ok) { await reload(); shell.notify('تم الحذف ✅', 'ok'); paint(); }
        else shell.notify('تعذّر الحذف', 'danger');
        return;
      }
      if (a === 'share') {
        if (!uid()) return;
        const url = publicUrl();
        if (navigator.share) { try { await navigator.share({ title: 'صفحتي', url }); } catch (_) {} }
        else { try { await navigator.clipboard.writeText(url); shell.notify('تم نسخ الرابط ✅', 'ok'); } catch (_) { shell.notify(url, 'ok'); } }
        return;
      }
      if (a === 'save') {
        const get = (id) => (qs('#' + id)?.value || '').trim();
        const bizName = get('f-biz'); const phone = get('f-phone');
        const v = validateProfile({ bizName, phone });
        if (!v.ok) { errors = v.errors; return paint(); }
        const username = slugUsername(get('f-username'));
        if (username && !(await services.profile.usernameAvailable(username, uid()))) {
          errors = ['⚠️ اسم الصفحة محجوز — اختر اسمًا آخر']; return paint();
        }
        const user = store.get('user');
        const businessProfile = {
          ...(client?.businessProfile || {}),
          bizName, tagline: get('f-tagline'), activity: get('f-activity'),
          city: get('f-city'), address: get('f-address'),
          template: get('f-template') || 'classic', username,
          listedInDirectory: !!qs('#f-directory')?.checked,
        };
        const r = await services.profile.saveProfile({ uid: user.uid, email: user.email, name: user.displayName, phone, businessProfile });
        if (r?.ok) { await reload(); editing = false; errors = []; shell.notify('تم حفظ البيانات ✅', 'ok'); paint(); }
        else shell.notify('تعذّر الحفظ، حاول مجدداً', 'danger');
      }
    },
  };
}
