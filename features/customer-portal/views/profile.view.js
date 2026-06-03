/**
 * VIEWS · profile — بروفايل الأعمال + الكارت الرقمي العام + تحرير + شعار/غلاف.
 * تركيب مكوّنات + نداء Services + Validator. الكتابة عبر clientActions. (STANDARDS §6 · L1)
 */
import { escapeHtml, qs } from '../utils/dom.js';
import { Card, Button, Input, Avatar } from '../components/index.js';
import { cropResize } from '../utils/image.js';
import { validateProfile } from '../validators/profile.validator.js';

export function create(ctx) {
  const { services, store, shell } = ctx;
  let client = null;
  let editing = false;
  let busy = false;
  let pending = null; // { kind:'logo'|'cover', file, dataUrl } — معاينة قبل الحفظ
  let errors = [];

  const cardUrl = (uid) => `${location.origin}/card.html?id=${encodeURIComponent(uid)}`;
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
    const actions = `<div class="cp-stack cp-stack--sm">
      ${Button({ label: 'مشاركة الكارت الرقمي', icon: '🔗', action: 'share', disabled: !uid() })}
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
      ${Input({ id: 'f-activity', label: 'النشاط', value: biz.activity || '' })}
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
        const url = cardUrl(uid());
        if (navigator.share) { try { await navigator.share({ title: 'كارتي الرقمي', url }); } catch (_) {} }
        else { try { await navigator.clipboard.writeText(url); shell.notify('تم نسخ رابط الكارت ✅', 'ok'); } catch (_) { shell.notify(url, 'ok'); } }
        return;
      }
      if (a === 'save') {
        const get = (id) => (qs('#' + id)?.value || '').trim();
        const bizName = get('f-biz'); const phone = get('f-phone');
        const v = validateProfile({ bizName, phone });
        if (!v.ok) { errors = v.errors; return paint(); }
        const user = store.get('user');
        const businessProfile = { ...(client?.businessProfile || {}), bizName, tagline: get('f-tagline'), activity: get('f-activity') };
        const r = await services.profile.saveProfile({ uid: user.uid, email: user.email, name: user.displayName, phone, businessProfile });
        if (r?.ok) { await reload(); editing = false; errors = []; shell.notify('تم حفظ البيانات ✅', 'ok'); paint(); }
        else shell.notify('تعذّر الحفظ، حاول مجدداً', 'danger');
      }
    },
  };
}
